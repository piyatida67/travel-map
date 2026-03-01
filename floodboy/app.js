import { createPublicClient, http, parseAbiItem } from 'viem';

// Configuration
const JIBCHAIN = {
    id: 8899,
    name: 'JIBCHAIN L1',
    nativeCurrency: { name: 'JIB', symbol: 'JIB', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://rpc-l1.jibchain.net'] }
    },
    blockExplorers: {
        default: { name: 'JibScan', url: 'https://exp.jibchain.net' }
    }
};

const FACTORY_ADDRESS = '0x63bB41b79b5aAc6e98C7b35Dcb0fE941b85Ba5Bb';
const STORE_ADDRESS = '0x0994Bc66b2863f8D58C8185b1ed6147895632812'; // FloodBoy016
const UNIVERSAL_SIGNER = '0xcB0e58b011924e049ce4b4D62298Edf43dFF0BDd';

// State
let appData = {
    nickname: '',
    description: '',
    owner: '',
    deployedBlock: 0,
    fields: [],
    latest: { timestamp: 0, values: [] },
    history: [],
    activeChart: 'waterDepth',
    currentBlock: 0
};

let chartInstance = null;

// ABIs
const FactoryABI = [
    {
        "name": "getStoreInfo",
        "inputs": [{ "name": "store", "type": "address" }],
        "outputs": [
            { "name": "nickname", "type": "string" },
            { "name": "owner", "type": "address" },
            { "name": "authorizedSensorCount", "type": "uint256" },
            { "name": "deployedBlock", "type": "uint128" },
            { "name": "description", "type": "string" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

const StoreABI = [
    {
        "name": "getAllFields",
        "outputs": [{
            "components": [
                { "name": "name", "type": "string" },
                { "name": "unit", "type": "string" },
                { "name": "dtype", "type": "string" }
            ],
            "type": "tuple[]"
        }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "name": "getLatestRecord",
        "inputs": [{ "name": "sensor", "type": "address" }],
        "outputs": [
            { "name": "timestamp", "type": "uint256" },
            { "name": "values", "type": "int256[]" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "name": "sensor", "type": "address" },
            { "indexed": false, "name": "timestamp", "type": "uint256" },
            { "indexed": false, "name": "values", "type": "int256[]" }
        ],
        "name": "RecordStored",
        "type": "event"
    }
];

// Initialize Client
const client = createPublicClient({
    chain: JIBCHAIN,
    transport: http()
});

// Helpers
function formatAddress(addr) {
    return addr.slice(0, 10) + '...' + addr.slice(-8);
}

function formatTime(ts) {
    if (!ts) return '---';
    return new Date(Number(ts) * 1000).toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: true
    });
}

function formatFieldName(name) {
    return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function processScaledValue(val, unit) {
    const raw = Number(val);
    const baseUnit = unit.replace(/ x\d+/, '');

    if (unit.includes('x10000')) {
        return { val: raw / 10000, text: (raw / 10000).toFixed(4) + ' ' + baseUnit };
    }
    if (unit.includes('x1000')) {
        return { val: raw / 1000, text: (raw / 1000).toFixed(3) + ' ' + baseUnit };
    }
    if (unit.includes('x100')) {
        return { val: raw / 100, text: (raw / 100).toFixed(3) + ' ' + baseUnit };
    }
    return { val: raw, text: raw + ' ' + unit };
}

// Data Fetching
async function initApp() {
    try {
        console.log('Initializing Application...');

        // Parallel fetch basic info
        const [info, fields, blockNumber] = await Promise.all([
            client.readContract({
                address: FACTORY_ADDRESS,
                abi: FactoryABI,
                functionName: 'getStoreInfo',
                args: [STORE_ADDRESS]
            }),
            client.readContract({
                address: STORE_ADDRESS,
                abi: StoreABI,
                functionName: 'getAllFields'
            }),
            client.getBlockNumber()
        ]);

        appData.nickname = info[0];
        appData.owner = info[1];
        appData.deployedBlock = info[3];
        appData.description = info[4];
        appData.fields = fields;
        appData.currentBlock = blockNumber;

        // Fetch latest record
        const latest = await client.readContract({
            address: STORE_ADDRESS,
            abi: StoreABI,
            functionName: 'getLatestRecord',
            args: [UNIVERSAL_SIGNER]
        });

        appData.latest = {
            timestamp: Number(latest[0]),
            values: latest[1]
        };

        // Fetch history
        await fetchHistory();

        updateUI();
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('main-card').style.display = 'block';

    } catch (error) {
        console.error('Initialization failed:', error);
        alert('Failed to connect to JIBCHAIN. Please check your connection.');
    }
}

async function fetchHistory() {
    try {
        const fromBlock = appData.currentBlock - 30000n; // ~24h

        const logs = await client.getContractEvents({
            address: STORE_ADDRESS,
            abi: StoreABI,
            eventName: 'RecordStored',
            args: { sensor: UNIVERSAL_SIGNER },
            fromBlock: fromBlock > 0n ? fromBlock : 0n
        });

        const waterIdx = appData.fields.findIndex(f => f.name === 'water_depth');
        const voltIdx = appData.fields.findIndex(f => f.name === 'battery_voltage');

        appData.history = logs.map(log => ({
            ts: Number(log.args.timestamp),
            depth: waterIdx >= 0 ? Number(log.args.values[waterIdx]) / 10000 : 0,
            volt: voltIdx >= 0 ? Number(log.args.values[voltIdx]) / 100 : 0
        })).sort((a, b) => a.ts - b.ts);

        // Apply Smoothing (Moving Average)
        if (appData.history.length > 5) {
            appData.history = appData.history.map((p, i, arr) => {
                if (i < 2 || i > arr.length - 3) return p;
                const subset = arr.slice(i - 2, i + 3);
                return {
                    ...p,
                    depth: subset.reduce((acc, curr) => acc + curr.depth, 0) / 5,
                    volt: subset.reduce((acc, curr) => acc + curr.volt, 0) / 5
                };
            });
        }

    } catch (e) {
        console.warn('History fetch failed:', e);
    }
}

function updateUI() {
    // Header
    document.getElementById('store-nickname').textContent = appData.nickname;
    document.getElementById('store-description').textContent = appData.description;
    document.getElementById('current-block').textContent = `Block: ${appData.currentBlock}`;
    document.getElementById('last-updated-top').textContent = `Last Updated: ${formatTime(appData.latest.timestamp).split(', ')[1]}`;
    document.getElementById('store-address-text').textContent = formatAddress(STORE_ADDRESS);
    document.getElementById('store-link').href = `${JIBCHAIN.blockExplorers.default.url}/address/${STORE_ADDRESS}`;

    // Table
    const tbody = document.getElementById('data-body');
    tbody.innerHTML = '';

    appData.fields.forEach((field, i) => {
        if (field.name.includes('_count')) return;

        const row = document.createElement('tr');
        const processed = processScaledValue(appData.latest.values[i], field.unit);

        let label = formatFieldName(field.name);

        // Calculate Min/Max from history if available
        let minVal = processed.text;
        let maxVal = processed.text;

        if (appData.history.length > 0) {
            if (field.name === 'water_depth') {
                const vals = appData.history.map(p => p.depth);
                minVal = Math.min(...vals).toFixed(4) + ' m';
                maxVal = Math.max(...vals).toFixed(4) + ' m';

                const countIdx = appData.fields.findIndex(f => f.name === 'water_depth_count');
                if (countIdx >= 0) {
                    const count = appData.latest.values[countIdx];
                    label = `${label} (${count} samples)`;
                }
            } else if (field.name === 'battery_voltage') {
                const vals = appData.history.map(p => p.volt);
                minVal = Math.min(...vals).toFixed(3) + ' V';
                maxVal = Math.max(...vals).toFixed(3) + ' V';
            }
        }

        row.innerHTML = `
            <td><div class="metric-name">${label}</div></td>
            <td>${processed.text}</td>
            <td>${minVal}</td>
            <td>${maxVal}</td>
        `;
        tbody.appendChild(row);
    });

    // Footer
    document.getElementById('footer-last-updated').textContent = formatTime(appData.latest.timestamp);
    document.getElementById('owner-link').textContent = formatAddress(appData.owner);
    document.getElementById('owner-link').href = `${JIBCHAIN.blockExplorers.default.url}/address/${appData.owner}`;
    document.getElementById('deployed-block-link').textContent = `#${appData.deployedBlock}`;
    document.getElementById('deployed-block-link').href = `${JIBCHAIN.blockExplorers.default.url}/block/${appData.deployedBlock}`;

    renderChart();
}

function renderChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    if (appData.history.length === 0) {
        document.getElementById('no-data-message').style.display = 'block';
        return;
    }
    document.getElementById('no-data-message').style.display = 'none';

    const isDepth = appData.activeChart === 'waterDepth';
    const config = {
        type: 'line',
        data: {
            labels: appData.history.map(p => new Date(p.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
            datasets: [{
                label: isDepth ? 'Water Depth (m)' : 'Battery Voltage (V)',
                data: appData.history.map(p => isDepth ? p.depth : p.volt),
                borderColor: isDepth ? '#d4af37' : '#00ffcc',
                backgroundColor: isDepth ? 'rgba(212, 175, 55, 0.1)' : 'rgba(0, 255, 204, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 5,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(5, 5, 16, 0.9)',
                    titleColor: '#d4af37',
                    bodyColor: '#fff',
                    borderColor: '#d4af37',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: (ctx) => `DATA_SCAN > ${ctx.dataset.label}: ${ctx.raw.toFixed(isDepth ? 4 : 3)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(212, 175, 55, 0.1)' },
                    ticks: { color: '#aaa' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#aaa', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
                }
            }
        }
    };

    chartInstance = new Chart(ctx, config);
}

// Controls
document.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        appData.activeChart = btn.dataset.type;
        renderChart();
    });
});

initApp();
