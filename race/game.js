/**
 * Oracle Race - Quantum Space-Bar Acceleration System
 * Powered by MQTT Retain Protocol
 */

const CONFIG = {
    BROKER: 'wss://dustboy-wss-bridge.laris.workers.dev/mqtt',
    TOPIC_ROOT: 'oracle/race/v2/', // Changed to v2 to clear old ghost data completely
    FINISH_LINE: 500, // Distance increased (taps required)
    STEP: 5,        // Pixels or units per tap
    RETAIN: true
};

const state = {
    player: {
        id: 'p-' + Math.random().toString(36).substr(2, 9),
        name: '',
        pos: 0,
        finished: false,
        time: 0,
        frame: 0, // 0 or 1
        lastTap: 0, // Timestamp of last tap
        character: 'og', // og, tiga, gaia, belial
        color: getRandomColor()
    },
    game: {
        state: 'LOBBY', // LOBBY, COUNTDOWN, RACING, FINISHED
        winner: null,
        startTime: 0
    },
    others: new Map(), // remote players
    hallOfFame: []
};

// --- DOM Elements ---
const el = {
    track: document.getElementById('race-track'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    nodeId: document.getElementById('my-node-id'),
    overlayReg: document.getElementById('overlay-reg'),
    overlayStatus: document.getElementById('overlay-status'),
    overlayWinner: document.getElementById('overlay-winner'),
    nickInput: document.getElementById('nickname-input'),
    btnJoin: document.getElementById('btn-join'),
    leaderboard: document.getElementById('leaderboard-list'),
    statusTitle: document.getElementById('status-title'),
    countdown: document.getElementById('countdown'),
    btnReset: document.getElementById('btn-reset')
};

// --- MQTT Client Setup ---
// Add Last Will and Testament (LWT) to clear player presence on disconnect
const client = mqtt.connect(CONFIG.BROKER, {
    will: {
        topic: CONFIG.TOPIC_ROOT + 'p/' + state.player.id,
        payload: '',
        retain: true
    }
});

client.on('connect', () => {
    el.statusDot.classList.add('online');
    el.statusText.innerText = 'ONLINE';
    el.nodeId.innerText = state.player.id.toUpperCase();

    // Subscribe to all relevant topics
    client.subscribe(CONFIG.TOPIC_ROOT + 'status');
    client.subscribe(CONFIG.TOPIC_ROOT + 'halloffame');
    client.subscribe(CONFIG.TOPIC_ROOT + 'p/+');

    console.log('Quantum Link Established');
});

client.on('message', (topic, message) => {
    const payload = JSON.parse(message.toString());

    if (topic === CONFIG.TOPIC_ROOT + 'status') {
        handleGameStatus(payload);
    }
    else if (topic === CONFIG.TOPIC_ROOT + 'halloffame') {
        handleHallOfFame(payload);
    }
    else if (topic.startsWith(CONFIG.TOPIC_ROOT + 'p/')) {
        const pid = topic.split('/').pop();
        if (pid !== state.player.id) {
            // If payload is empty, the player disconnected (LWT triggered)
            if (message.length === 0) {
                state.others.delete(pid);
            } else {
                state.others.set(pid, payload);
            }
            renderRace();
        }
    }
});

// --- Game Logic ---

function handleGameStatus(gameStatus) {
    state.game = gameStatus;

    if (state.game.state === 'LOBBY') {
        el.overlayStatus.classList.remove('active');
        el.overlayWinner.classList.remove('active');

        // Clear all other players from the grid (remove ghosts)
        state.others.clear();

        // Reset local player position if we go back to lobby
        state.player.pos = 0;
        state.player.finished = false;
        state.player.time = 0;
        state.player.lastTap = 0;

        syncPlayer();
        renderRace();
    } else if (state.game.state === 'COUNTDOWN') {
        el.overlayStatus.classList.add('active');
        el.overlayWinner.classList.remove('active');
        el.statusTitle.innerText = 'CORE WARMUP';
        el.countdown.innerText = state.game.countdown || '...';
    } else if (state.game.state === 'RACING') {
        el.overlayStatus.classList.remove('active');
        el.overlayWinner.classList.remove('active');
        if (state.game.startTime) state.game.startTime = Date.now(); // local estimate
    } else if (state.game.state === 'FINISHED') {
        el.overlayStatus.classList.remove('active');
        showWinner(state.game.winner.name, state.game.winner.time);
    }
}

function handleHallOfFame(data) {
    state.hallOfFame = Array.isArray(data) ? data : [];
    el.leaderboard.innerHTML = state.hallOfFame.map((item, idx) => `
        <div class="hof-item">
            <span>${idx + 1}. <span class="hof-name">${item.name}</span></span>
            <span class="hof-time">${item.time.toFixed(2)}s</span>
        </div>
    `).join('') || '<div class="hof-item">No records found.</div>';
}

function joinGame() {
    const nick = el.nickInput.value.trim();
    if (!nick) return alert('Codename required for grid access.');

    // Get selected character
    const selectedChar = document.querySelector('.char-option.active');
    state.player.character = selectedChar ? selectedChar.dataset.char : 'og';

    state.player.name = nick;
    el.overlayReg.classList.remove('active');

    // Publish initial presence
    syncPlayer();
}

function syncPlayer() {
    client.publish(CONFIG.TOPIC_ROOT + 'p/' + state.player.id, JSON.stringify(state.player), { retain: true });
}

function move() {
    if (state.game.state !== 'RACING' || state.player.finished) return;

    state.player.pos += CONFIG.STEP;
    state.player.frame = (state.player.frame === 0) ? 1 : 0; // Toggle step
    state.player.lastTap = Date.now(); // Record tap time

    syncPlayer();
    renderRace();

    // Check for finish line
    if (state.player.pos >= CONFIG.FINISH_LINE) {
        finish();
    }
}

function finish() {
    state.player.pos = CONFIG.FINISH_LINE;
    state.player.finished = true;
    state.player.time = (Date.now() - state.game.startTime) / 1000;

    updateHallOfFame();

    // Broadcast that this player won (first one to publish this wins the race globally)
    // Only publish if the global state is not already FINISHED
    if (state.game.state !== 'FINISHED') {
        client.publish(CONFIG.TOPIC_ROOT + 'status', JSON.stringify({
            state: 'FINISHED',
            winner: { name: state.player.name, time: state.player.time }
        }), { retain: true });

        // Auto-restart after 5 seconds
        setTimeout(() => {
            client.publish(CONFIG.TOPIC_ROOT + 'status', JSON.stringify({ state: 'LOBBY', startTime: 0 }), { retain: true });
        }, 5000);
    }
}

function updateHallOfFame() {
    let newHOF = [...state.hallOfFame, { name: state.player.name, time: state.player.time }];
    newHOF.sort((a, b) => a.time - b.time);
    newHOF = newHOF.slice(0, 5); // Top 5

    client.publish(CONFIG.TOPIC_ROOT + 'halloffame', JSON.stringify(newHOF), { retain: true });
}

function showWinner(name, time) {
    el.overlayWinner.classList.add('active');
    document.getElementById('winner-name').innerText = name;
    document.getElementById('winner-time').innerText = time.toFixed(2) + 's';
}

// --- Rendering ---

function renderRace() {
    // Clear dynamic players (except finish line)
    const lanes = Array.from(state.others.values());
    lanes.push(state.player);

    el.track.innerHTML = '<div class="finish-line"></div>';

    lanes.forEach(p => {
        const lane = document.createElement('div');
        lane.className = 'player-lane';

        const sprite = document.createElement('div');
        // 'moving' class is only added when the player is actually actively running in the RACING state
        // AND they have tapped the spacebar within the last 400ms
        const timeSinceLastTap = Date.now() - (p.lastTap || 0);
        const isMoving = state.game.state === 'RACING' && !p.finished && p.pos > 0 && timeSinceLastTap < 400;

        sprite.className = `player-sprite ${p.frame === 1 ? 'step' : ''} ${isMoving ? 'moving' : ''}`;

        // Position relative to finish line
        const leftPercent = (p.pos / CONFIG.FINISH_LINE) * 100;
        sprite.style.left = `calc(${leftPercent}% - 60px)`;

        const img = document.createElement('img');
        img.src = 'ultraman_base.png';
        img.className = `char-${p.character || 'og'}`;
        sprite.appendChild(img);

        const nameTag = document.createElement('div');
        nameTag.className = 'player-name-tag';
        nameTag.innerText = p.name + (p.id === state.player.id ? ' (YOU)' : '');
        sprite.appendChild(nameTag);

        lane.appendChild(sprite);
        el.track.appendChild(lane);
    });
}

// --- Admin Controls (Simulation of Game Loop via MQTT) ---
// Since we have no server, the first player who joins can act as the "Trigger" or we use manual lobby
// For simplicity, we'll auto-start if multiple players join or just allow solo racing for now
// A real "Global Start" would need one client to publish the START status.

// Let's add a "Start Race" button that appears if status is LOBBY
const adminTrigger = () => {
    client.publish(CONFIG.TOPIC_ROOT + 'status', JSON.stringify({ state: 'COUNTDOWN', countdown: 3 }), { retain: true });

    setTimeout(() => {
        client.publish(CONFIG.TOPIC_ROOT + 'status', JSON.stringify({ state: 'COUNTDOWN', countdown: 2 }), { retain: true });
    }, 1000);

    setTimeout(() => {
        client.publish(CONFIG.TOPIC_ROOT + 'status', JSON.stringify({ state: 'COUNTDOWN', countdown: 1 }), { retain: true });
    }, 2000);

    setTimeout(() => {
        client.publish(CONFIG.TOPIC_ROOT + 'status', JSON.stringify({
            state: 'RACING',
            startTime: Date.now()
        }), { retain: true });
    }, 3000);
};

// --- Events ---
el.btnJoin.onclick = joinGame;

if (el.btnReset) {
    el.btnReset.onclick = () => {
        // Broadcast reset to all clients
        client.publish(CONFIG.TOPIC_ROOT + 'status', JSON.stringify({ state: 'LOBBY', startTime: 0 }), { retain: true });
    };
}

// Character Selection Interaction
document.querySelectorAll('.char-option').forEach(opt => {
    opt.onclick = () => {
        document.querySelectorAll('.char-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');

        // Update selection label
        const nameDisplay = document.getElementById('selected-char-name');
        if (nameDisplay) nameDisplay.innerText = opt.dataset.name;
    };
});

window.onkeydown = (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (e.repeat) return; // DISABLE HOLDING

        if (state.game.state === 'LOBBY') adminTrigger(); // First tap starts the countdown for everyone
        move();
    }
};

function getRandomColor() {
    const colors = ['#00ffcc', '#d4af37', '#ff3e3e', '#bf00ff', '#ffffff'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Global animation loop to periodically clear 'moving' class if tapping stops
setInterval(() => {
    if (state.game.state === 'RACING' && !state.player.finished) {
        // Re-render to check tap timeouts
        renderRace();
    }
}, 100);

// Initial render
renderRace();
