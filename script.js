// ===== NAVBAR =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
});

// ===== HAMBURGER =====
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');
let menuOpen = false;
hamburger.addEventListener('click', () => {
    menuOpen = !menuOpen;
    navLinks.style.display = menuOpen ? 'flex' : '';
    navLinks.style.flexDirection = 'column';
    navLinks.style.position = 'fixed';
    navLinks.style.top = '60px';
    navLinks.style.left = '0';
    navLinks.style.right = '0';
    navLinks.style.background = 'rgba(0,0,0,0.97)';
    navLinks.style.padding = '1.5rem 2rem 2rem';
    navLinks.style.borderBottom = '1px solid rgba(212,160,23,0.2)';
    navLinks.style.backdropFilter = 'blur(16px)';
    navLinks.style.zIndex = '998';
    if (!menuOpen) navLinks.removeAttribute('style');
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        menuOpen = false;
        navLinks.removeAttribute('style');
    });
});

// ===== REVEAL ON SCROLL =====
const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((entry, idx) => {
        if (entry.isIntersecting) {
            const delay = parseFloat(entry.target.dataset.delay || 0);
            setTimeout(() => entry.target.classList.add('visible'), delay * 1000);
            revealObs.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

// Stagger siblings
document.querySelectorAll('.skill-card').forEach((el, i) => el.dataset.delay = (i % 3) * 0.1);
document.querySelectorAll('.activity-card').forEach((el, i) => el.dataset.delay = i * 0.08);
document.querySelectorAll('.edu-item').forEach((el, i) => el.dataset.delay = i * 0.12);
document.querySelectorAll('.info-row').forEach((el, i) => el.dataset.delay = i * 0.06);

document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

// ===== GPA BAR ANIMATION =====
const gpaObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.querySelectorAll('.gpa-bar').forEach((bar, i) => {
                setTimeout(() => bar.classList.add('animated'), i * 200);
            });
            gpaObs.unobserve(entry.target);
        }
    });
}, { threshold: 0.4 });

const gpaCard = document.querySelector('.gpa-card');
if (gpaCard) gpaObs.observe(gpaCard);

// ===== CARD TILT =====
document.querySelectorAll('.skill-card, .info-card, .gpa-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `translateY(-4px) rotateX(${-y * 6}deg) rotateY(${x * 6}deg)`;
        card.style.transition = 'transform 0.08s ease';
    });
    card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.transition = 'transform 0.3s ease';
    });
});

// ===== ACTIVE NAV on SCROLL =====
const sections = document.querySelectorAll('section[id]');
const allNavLinks = document.querySelectorAll('.nav-link');

const activeObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            allNavLinks.forEach(l => l.classList.remove('active'));
            const active = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
            if (active) active.classList.add('active');
        }
    });
}, { threshold: 0.45 });

sections.forEach(s => activeObs.observe(s));

// Inject active link CSS
const s = document.createElement('style');
s.textContent = '.nav-link.active { color: var(--gold) !important; } .nav-link.active::after { width: 100% !important; }';
document.head.appendChild(s);

// ===== SMOOTH PARALLAX on hero particles =====
let rafId;
document.addEventListener('mousemove', (e) => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const dx = (e.clientX - cx) / cx;
        const dy = (e.clientY - cy) / cy;
        document.querySelectorAll('.particle').forEach((p, i) => {
            const f = (i + 1) * 8;
            p.style.transform = `translate(${dx * f}px, ${dy * f}px)`;
        });
    });
});
