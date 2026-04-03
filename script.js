// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MUSIC & RADIO SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const music = document.getElementById('bgMusic');
let playlist = [];
let currentTrack = 0;
let radioPlaying = false;

fetch('playlist.json')
    .then(r => r.json())
    .then(data => { playlist = data; })
    .catch(() => console.warn('playlist.json not found'));

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateRadioUI() {
    if (!playlist.length) return;
    const track = playlist[currentTrack];
    document.getElementById('radioTitle').textContent = track.title;
    document.getElementById('radioArtist').textContent = track.artist;
    const marquee = document.getElementById('radioTitle');
    const wrap = marquee.parentElement;
    marquee.classList.toggle('fits', marquee.scrollWidth <= wrap.clientWidth);
    document.getElementById('radioPlayBtn').innerHTML = radioPlaying ? '&#9646;&#9646;' : '&#9654;';
}

function updateRadioProgress() {
    if (!music || !music.duration) return;
    const pct = (music.currentTime / music.duration) * 100;
    document.getElementById('radioFill').style.width = pct + '%';
    document.getElementById('radioCurrent').textContent = formatTime(music.currentTime);
    document.getElementById('radioDuration').textContent = formatTime(music.duration);
}

function loadTrack(idx) {
    if (!playlist.length) return;
    currentTrack = idx;
    music.src = playlist[currentTrack].src;
    music.volume = document.getElementById('radioVolume').value / 100;
    music.load();
    updateRadioUI();
}

function startMusic() {
    if (!music || radioPlaying || !playlist.length) return;
    loadTrack(currentTrack);
    music.play();
    radioPlaying = true;
    updateRadioUI();
    document.getElementById('radioWidget').classList.add('visible');
}

function nextTrack() {
    currentTrack = (currentTrack + 1) % playlist.length;
    loadTrack(currentTrack);
    music.play();
    radioPlaying = true;
    updateRadioUI();
}

function prevTrack() {
    currentTrack = (currentTrack - 1 + playlist.length) % playlist.length;
    loadTrack(currentTrack);
    music.play();
    radioPlaying = true;
    updateRadioUI();
}

function pauseMusic() {
    if (!music) return;
    if (music.paused) { music.play(); radioPlaying = true; }
    else { music.pause(); radioPlaying = false; }
    updateRadioUI();
}

function setVolume(val) {
    if (!music) return;
    music.volume = Math.max(0, Math.min(1, val));
}

// Wire up audio events after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setInterval(updateRadioProgress, 500);

    if (music) music.addEventListener('ended', nextTrack);

    const progressBar = document.querySelector('.radio-progress-bar');
    if (progressBar) progressBar.addEventListener('click', e => {
        if (!music || !music.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        music.currentTime = ((e.clientX - rect.left) / rect.width) * music.duration;
    });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RADIO DRAG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(function initRadioDrag() {
    const widget = document.getElementById('radioWidget');
    const handle = document.getElementById('radioDragHandle');
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', e => {
        dragging = true;
        const rect = widget.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        widget.style.bottom = 'auto';
        widget.style.right = 'auto';
        widget.style.left = rect.left + 'px';
        widget.style.top = rect.top + 'px';
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        widget.style.left = (e.clientX - offsetX) + 'px';
        widget.style.top = (e.clientY - offsetY) + 'px';
    });

    document.addEventListener('mouseup', () => { dragging = false; });
})();


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYOUT CONFIG — tweak these values freely
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CONFIG = {
    globeX: 32,
    globeY: 50,
    globeSize: 0.35,
    globeSpeed: 0.1,
    scanLinesHeight: 'calc(100vh - 200px)',
    scanLinesLeftPadding: '8vw',
    scanLinesMaxVisible: 12,
    progressBarLeft: '20vw',
    progressBarRight: '20vw',
    progressHideDelay: 2000,
    progressBarBottom: 10,
    progressBarHeight: 4,
    progressBarFontSize: '0.88rem',
    drawnBoxLeft: 62,
    drawnBoxTop: 18,
};

// Apply CONFIG to DOM immediately
const wrap = document.querySelector('.scan-lines-wrap');
if (wrap) {
    wrap.style.paddingLeft = CONFIG.scanLinesLeftPadding;
    wrap.style.height = CONFIG.scanLinesHeight;
}

const progress = document.querySelector('.scan-progress');
if (progress) progress.style.bottom = CONFIG.progressBarBottom + 'px';

const progressTrack = document.querySelector('.progress-track');
if (progressTrack) progressTrack.style.height = CONFIG.progressBarHeight + 'px';

const progressMeta = document.querySelector('.progress-meta');
if (progressMeta) progressMeta.style.fontSize = CONFIG.progressBarFontSize;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ACCESS_CODE = 'bawsome';
const REDIRECT_URL = 'stage2.html';


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(() => {
    window.addEventListener('DOMContentLoaded', () => {

        let musicStarted = false;

        const canvas = document.getElementById('globeCanvas');
        const overlay = document.getElementById('globeOverlay');
        if (!canvas || !overlay) return;

        const ctx = canvas.getContext('2d');

        const globeConfig = {
            tiltX: 0.98,
            tiltZ: 0.4,
            invertSpin: false,
        };

        function resizeCanvas() {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 1400);

        // ── Position animation ──
        const MOVE_DURATION = 2000;
        let currentGlobeX = CONFIG.globeX;
        let currentGlobeY = CONFIG.globeY;
        let startGlobeX = CONFIG.globeX;
        let startGlobeY = CONFIG.globeY;
        let targetGlobeX = CONFIG.globeX;
        let targetGlobeY = CONFIG.globeY;
        let globeMoveStart = null;

        window.startGlobeMove = (toX, toY) => {
            startGlobeX = currentGlobeX;
            startGlobeY = currentGlobeY;
            targetGlobeX = toX;
            targetGlobeY = toY;
            globeMoveStart = performance.now();
        };

        // ── Pin system ──
        const PIN_COUNT = 4;

        const boxAnchors = [
            { x: 0.18, y: 0.78 }, // bottom left
            { x: 0.18, y: 0.22 }, // top left
            { x: 0.82, y: 0.22 }, // top right
            { x: 0.82, y: 0.78 }, // bottom right
        ];

        function pickPins(count) {
            const quadrants = [
                { latMin: 0.1, latMax: Math.PI / 2, lonMin: 0, lonMax: Math.PI },
                { latMin: 0.1, latMax: Math.PI / 2, lonMin: Math.PI, lonMax: Math.PI * 2 },
                { latMin: Math.PI / 2, latMax: Math.PI * 0.9, lonMin: 0, lonMax: Math.PI },
                { latMin: Math.PI / 2, latMax: Math.PI * 0.9, lonMin: Math.PI, lonMax: Math.PI * 2 },
            ];

            return quadrants.slice(0, count).map((q, i) => ({
                lat: q.latMin + Math.random() * (q.latMax - q.latMin),
                lon: q.lonMin + Math.random() * (q.lonMax - q.lonMin),
                boxX: boxAnchors[i].x * window.innerWidth,
                boxY: boxAnchors[i].y * window.innerHeight,
                boxW: 220,
                boxH: 160,
                lineEl: null,
                boxEl: null,
                visible: false,
                progress: 0,
            }));
        }

        const pins = pickPins(PIN_COUNT);

        pins.forEach(pin => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('stroke', 'rgba(255,0,0,0.7)');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('opacity', '0');
            overlay.appendChild(line);
            pin.lineEl = line;

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('stroke', 'rgba(255,0,0,0.7)');
            rect.setAttribute('stroke-width', '1.5');
            rect.setAttribute('fill', 'rgba(245,242,236,0.92)');
            rect.setAttribute('rx', '2');
            rect.setAttribute('opacity', '0');
            rect.setAttribute('x', pin.boxX - pin.boxW / 2);
            rect.setAttribute('y', pin.boxY - pin.boxH / 2);
            rect.setAttribute('width', pin.boxW);
            rect.setAttribute('height', pin.boxH);
            overlay.appendChild(rect);
            pin.boxEl = rect;
        });

        function projectPin(lat, lon, cx, cy, radius, spinY, cosX, sinX, cosZ, sinZ) {
            let x = radius * Math.sin(lat) * Math.cos(lon);
            let y = radius * Math.cos(lat);
            let z = radius * Math.sin(lat) * Math.sin(lon);
            let x1 = x * Math.cos(spinY) - z * Math.sin(spinY);
            let z1 = x * Math.sin(spinY) + z * Math.cos(spinY);
            let y2 = y * cosX - z1 * sinX;
            let z2 = y * sinX + z1 * cosX;
            let x3 = x1 * cosZ - y2 * sinZ;
            let y3 = x1 * sinZ + y2 * cosZ;
            const perspective = 300 / (300 + z2);
            return { x: cx + x3 * perspective, y: cy + y3 * perspective, z: z2 };
        }

        window.startPinLines = () => {
            pins.forEach(pin => { pin.visible = true; });
        };

        function drawGlobe(timestamp) {
            const dpr = window.devicePixelRatio || 1;
            const logicalW = canvas.width / dpr;
            const logicalH = canvas.height / dpr;
            ctx.clearRect(0, 0, logicalW, logicalH);

            // Position animation
            if (globeMoveStart !== null) {
                const elapsed = timestamp - globeMoveStart;
                const t = Math.min(elapsed / MOVE_DURATION, 1);
                const eased = t < 0.5
                    ? 2 * t * t
                    : 1 - Math.pow(-2 * t + 2, 2) / 2;
                currentGlobeX = startGlobeX + (targetGlobeX - startGlobeX) * eased;
                currentGlobeY = startGlobeY + (targetGlobeY - startGlobeY) * eased;
                if (t >= 1) globeMoveStart = null;
            }

            const cx = window.innerWidth * (currentGlobeX / 100);
            const cy = window.innerHeight * (currentGlobeY / 100);

            const wordmark = document.querySelector('.scan-wordmark');
            const wordmarkWidth = wordmark ? wordmark.offsetWidth : 300;
            const radius = wordmarkWidth * 0.7 * CONFIG.globeSize;

            const time = Date.now() * 0.001;
            const spinY = (globeConfig.invertSpin ? -1 : 1) * time * CONFIG.globeSpeed;

            const cosX = Math.cos(globeConfig.tiltX);
            const sinX = Math.sin(globeConfig.tiltX);
            const cosZ = Math.cos(globeConfig.tiltZ);
            const sinZ = Math.sin(globeConfig.tiltZ);

            // Draw globe dots
            for (let lat = 0; lat < Math.PI; lat += 0.08) {
                for (let lon = 0; lon < Math.PI * 2; lon += 0.08) {
                    let x = radius * Math.sin(lat) * Math.cos(lon);
                    let y = radius * Math.cos(lat);
                    let z = radius * Math.sin(lat) * Math.sin(lon);
                    let x1 = x * Math.cos(spinY) - z * Math.sin(spinY);
                    let z1 = x * Math.sin(spinY) + z * Math.cos(spinY);
                    let y2 = y * cosX - z1 * sinX;
                    let z2 = y * sinX + z1 * cosX;
                    let x3 = x1 * cosZ - y2 * sinZ;
                    let y3 = x1 * sinZ + y2 * cosZ;
                    const perspective = 300 / (300 + z2);
                    const screenX = cx + x3 * perspective;
                    const screenY = cy + y3 * perspective;
                    const depth = (z2 + radius) / (2 * radius);
                    const alpha = 0.3 + depth * 0.7;
                    ctx.fillStyle = `rgba(255, 0, 0, ${alpha.toFixed(2)})`;
                    ctx.fillRect(screenX, screenY, 1.5, 1.5);
                }
            }

            // Update pin lines every frame
            pins.forEach(pin => {
                if (!pin.visible) return;
                pin.progress = Math.min(pin.progress + 0.007, 1);

                const proj = projectPin(pin.lat, pin.lon, cx, cy, radius, spinY, cosX, sinX, cosZ, sinZ);
                const curEndX = proj.x + (pin.boxX - proj.x) * pin.progress;
                const curEndY = proj.y + (pin.boxY - proj.y) * pin.progress;

                pin.lineEl.setAttribute('x1', proj.x + 0.75);
                pin.lineEl.setAttribute('y1', proj.y + 0.75);
                pin.lineEl.setAttribute('x2', curEndX);
                pin.lineEl.setAttribute('y2', curEndY);
                pin.lineEl.setAttribute('opacity', '1');

                if (pin.progress >= 1) {
                    pin.boxEl.setAttribute('opacity', '1');
                }
            });

            // Start music once all pins have finished drawing
            if (!musicStarted && pins.length > 0 && pins.every(p => p.progress >= 1)) {
                musicStarted = true;
                startMusic();
            }

            requestAnimationFrame(drawGlobe);
        }

        requestAnimationFrame(drawGlobe);
    });
})();


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOT CANVAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const dotCanvas = document.getElementById('dotCanvas');
const dotCtx = dotCanvas.getContext('2d');
let W = 0, H = 0;

function resizeDotCanvas() {
    W = dotCanvas.width = window.innerWidth;
    H = dotCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeDotCanvas);
resizeDotCanvas();

const dots = [];
for (let i = 0; i < 65; i++) {
    dots.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.3 + 0.3,
        vx: (Math.random() - 0.5) * 0.00007,
        vy: (Math.random() - 0.5) * 0.00007,
        d: Math.random(),
    });
}

let mouseX = 0.5, mouseY = 0.5;
let targetMouseX = 0.5, targetMouseY = 0.5;

document.addEventListener('mousemove', e => {
    targetMouseX = e.clientX / W;
    targetMouseY = e.clientY / H;
    const card = document.getElementById('loginCard');
    const loginPhase = document.getElementById('loginPhase');
    if (card && loginPhase.classList.contains('visible')) {
        const dx = targetMouseX - 0.5;
        const dy = targetMouseY - 0.5;
        card.style.transform = `perspective(900px) rotateX(${-dy * 3}deg) rotateY(${dx * 3}deg)`;
    }
});

function drawDots() {
    mouseX += (targetMouseX - mouseX) * 0.04;
    mouseY += (targetMouseY - mouseY) * 0.04;
    dotCtx.clearRect(0, 0, W, H);
    dots.forEach(dot => {
        dot.x = (dot.x + dot.vx + 1) % 1;
        dot.y = (dot.y + dot.vy + 1) % 1;
        const px = (dot.x + (mouseX - 0.5) * 0.05 * dot.d) % 1;
        const py = (dot.y + (mouseY - 0.5) * 0.04 * dot.d) % 1;
        dotCtx.beginPath();
        dotCtx.arc(px * W, py * H, dot.r, 0, Math.PI * 2);
        dotCtx.fillStyle = `rgba(26, 26, 24, ${0.2 + dot.d * 0.3})`;
        dotCtx.fill();
    });
    requestAnimationFrame(drawDots);
}

drawDots();


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATA COLLECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const dataReady = {};
const setData = (id, val) => { dataReady[id] = val; };

fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(d => { setData('ip', d.ip); return fetch(`https://ipapi.co/${d.ip}/json/`); })
    .then(r => r.json())
    .then(d => {
        setData('loc', [d.city, d.country_name].filter(Boolean).join(', ') || 'Unknown');
        setData('isp', d.org || 'Unknown');
        setData('postal', d.postal || 'Unknown');
        setData('asn', d.asn || 'Unknown');
        setData('region', d.region || 'Unknown');
        setData('currency', d.currency || 'Unknown');
        setData('calling', d.country_calling_code || 'Unknown');
        setData('country_area', d.country_area ? d.country_area.toLocaleString() + ' km²' : 'Unknown');
        setData('country_pop', d.country_population ? Number(d.country_population).toLocaleString() : 'Unknown');
    })
    .catch(() => {
        ['ip', 'loc', 'isp', 'postal', 'asn', 'region', 'currency', 'calling', 'country_area', 'country_pop']
            .forEach(k => setData(k, k === 'ip' ? 'Masked / VPN' : '—'));
    });

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const tzOffset = -new Date().getTimezoneOffset();
const tzSign = tzOffset >= 0 ? '+' : '';
const tzHours = Math.floor(Math.abs(tzOffset) / 60);
setData('tz', `${tz.split('/').pop().replace(/_/g, ' ')} (UTC${tzSign}${tzHours})`);

const ua = navigator.userAgent;
const browser = ua.includes('Edg') ? 'Edge' : ua.includes('Chrome') ? 'Chrome'
    : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Unknown';
const os = ua.includes('Win') ? 'Windows' : ua.includes('Mac') ? 'macOS'
    : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS'
        : ua.includes('Android') ? 'Android' : ua.includes('Linux') ? 'Linux' : 'Unknown';

const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

setData('locale', navigator.language || 'Unknown');
setData('langs', (navigator.languages || [navigator.language]).slice(0, 4).join(', '));
setData('dev', `${browser} / ${os}`);
setData('platform', navigator.platform || 'Unknown');
setData('cores', navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' logical cores' : 'Unknown');
setData('mem', navigator.deviceMemory ? navigator.deviceMemory + ' GB RAM' : 'Unknown');
setData('conn', conn ? (conn.effectiveType || '?').toUpperCase() + (conn.downlink ? ' — ' + conn.downlink + ' Mbps' : '') : 'Unknown');
setData('rtt', conn?.rtt !== undefined ? conn.rtt + ' ms RTT' : 'Unknown');
setData('disp', `${screen.width} × ${screen.height}`);
setData('dpr', window.devicePixelRatio ? window.devicePixelRatio + 'x DPR' : 'Unknown');
setData('depth', screen.colorDepth ? screen.colorDepth + '-bit color' : 'Unknown');
setData('orient', screen.orientation?.type || 'Unknown');
setData('touch', navigator.maxTouchPoints > 0 ? `Yes — ${navigator.maxTouchPoints} pts` : 'None');
setData('cookies', navigator.cookieEnabled ? 'Enabled' : 'Disabled');
setData('plugins', navigator.plugins?.length ? navigator.plugins.length + ' detected' : '0 detected');
setData('storage', typeof localStorage !== 'undefined' ? 'Available' : 'Blocked');
setData('webgl', (() => { try { return document.createElement('canvas').getContext('webgl') ? 'Supported' : 'Unsupported'; } catch { return 'Unavailable'; } })());
setData('ua', navigator.userAgent.slice(0, 52) + '...');
setData('ref', document.referrer || 'Direct');
setData('session', 'BSI-' + Math.random().toString(36).substr(2, 8).toUpperCase());
setData('time', new Date().toISOString());
setData('viewport', `${window.innerWidth} × ${window.innerHeight}`);
setData('history_len', history.length + ' pages');
setData('online', navigator.onLine ? 'Online' : 'Offline');
setData('route_depth', 'orphaned');

const fakeData = {
    fake1: 'NULL', fake2: 'UNREGISTERED', fake3: 'NOT FOUND', fake4: 'MISMATCH',
    fake5: 'FLAGGED', fake6: 'DRIFTING', fake7: 'EXPIRED', fake8: 'UNKNOWN',
    fake9: 'PARTIAL', fake10: '0.34', fake11: 'INACTIVE', fake12: 'CLASSIFIED',
    fake13: 'SEVERED', fake14: '7.4 / 10', fake15: 'DEGRADED', fake16: '72h',
    fake17: '0.91', fake18: 'DETECTED', fake19: '0x4F3A', fake20: 'NULL',
    fake21: 'REVOKED', fake22: 'IMMINENT', fake23: 'DEEP', fake24: 'ACTIVE', fake25: 'LOST',
};
Object.entries(fakeData).forEach(([k, v]) => setData(k, v));

setData('bat', 'Unavailable');
setData('charging', 'Unknown');
if (navigator.getBattery) {
    navigator.getBattery()
        .then(b => {
            setData('bat', Math.round(b.level * 100) + '% ' + (b.charging ? '(Charging)' : '(On Battery)'));
            setData('charging', b.charging ? 'Yes' : 'No');
        })
        .catch(() => { });
}

document.getElementById('sessionId').textContent = dataReady['session'] || 'BSI-——';


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCAN DEFINITIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const scanDefs = [
    { key: 'IP Address', id: 'ip', s: 0, wait: 1100, pause: 900 },
    { key: 'Location', id: 'loc', s: 0, wait: 1000, pause: 820 },
    { key: 'Timezone', id: 'tz', s: 0, wait: 880, pause: 740 },
    { key: 'Device', id: 'dev', s: 0, wait: 820, pause: 680 },
    { key: 'Connection', id: 'conn', s: 0, wait: 740, pause: 620 },
    { key: 'Display', id: 'disp', s: 0, wait: 680, pause: 560 },
    { key: 'Battery', id: 'bat', s: 0, wait: 620, pause: 500 },
    { key: 'Language', id: 'langs', s: 0, wait: 560, pause: 440 },
    { key: 'Platform', id: 'platform', s: 0, wait: 500, pause: 390 },
    { key: 'Death Drive Acquisition', id: 'fake1', s: 0, wait: 440, pause: 340 },
    { key: 'Soul Index', id: 'fake2', s: 0, wait: 390, pause: 300 },
    { key: 'Consent Timestamp', id: 'fake3', s: 0, wait: 340, pause: 260 },
    { key: 'Memory Checksum', id: 'fake4', s: 0, wait: 290, pause: 220 },
    { key: 'Behavioral Signature', id: 'fake5', s: 0, wait: 250, pause: 185 },
    { key: 'Identity Anchor', id: 'fake6', s: 0, wait: 210, pause: 155 },
    { key: 'Compliance Token', id: 'fake7', s: 0, wait: 175, pause: 128 },
    { key: 'Threat Vector', id: 'fake8', s: 0, wait: 145, pause: 105 },
    { key: 'Shadow Profile', id: 'fake9', s: 0, wait: 118, pause: 85 },
    { key: 'Loyalty Coefficient', id: 'fake10', s: 0, wait: 95, pause: 68 },
    { key: 'Conscience Override', id: 'fake11', s: 'xl', wait: 76, pause: 54 },
    { key: 'Last Known Intent', id: 'fake12', s: 'xl', wait: 60, pause: 42 },
    { key: 'Origin Trace', id: 'fake13', s: 'xl', wait: 48, pause: 33 },
    { key: 'Anomaly Score', id: 'fake14', s: 'xl', wait: 38, pause: 26 },
    { key: 'Narrative Coherence', id: 'fake15', s: 'xl', wait: 30, pause: 20 },
    { key: 'Exposure Window', id: 'fake16', s: 'xl', wait: 24, pause: 15 },
    { key: 'Drift Coefficient', id: 'fake17', s: 'xl', wait: 19, pause: 12 },
    { key: 'Signal Bleed', id: 'fake18', s: 'xl', wait: 15, pause: 9 },
    { key: 'Latent Signature', id: 'fake19', s: 'xl', wait: 12, pause: 7 },
    { key: 'Void Index', id: 'fake20', s: 'xl', wait: 9, pause: 5 },
    { key: 'Residual Authority', id: 'fake21', s: 'xl', wait: 7, pause: 4 },
    { key: 'Pattern Collapse', id: 'fake22', s: 'xl', wait: 6, pause: 3 },
    { key: 'Echo Depth', id: 'fake23', s: 'xl', wait: 5, pause: 3 },
    { key: 'Core Dissolution', id: 'fake24', s: 'xl', wait: 5, pause: 2 },
    { key: 'Presence Marker', id: 'fake25', s: 'xl', wait: 4, pause: 2 },
    { key: 'route_depth', id: 'route_depth', s: 'xl', wait: 4, pause: 2 },
];

const extraKeys = [
    'Fault Inheritance', 'Signal Loss', 'Archive Decay',
    'Contingency Flag', 'Null Directive', 'Spectral Index',
    'Erosion Rate', 'Phantom Linkage', 'Collapse Vector',
    'Memory Bleed', 'Guilt Signature', 'Fear Quotient',
    'Autonomy Deficit', 'Trace Residue', 'Void Coefficient',
    'Intent Decay', 'Presence Loss', 'Anchor Drift',
    'Recursion Depth', 'Echo Chamber Index', 'Compliance Failure',
    'Override Status', 'Consent Erosion', 'Identity Fracture',
    'Soul Debt', 'Narrative Collapse', 'Signal Death',
    'Pattern Loss', 'Authority Void', 'Core Absence',
];

const progressLabels = [
    'Collecting data', 'Identifying device', 'Geolocating',
    'Profiling session', 'Verifying network', 'Analyzing display',
    'Checking power', 'Reading languages', 'Enumerating hardware',
    'Mapping CPU', 'Checking memory', 'Analyzing color',
    'Measuring density', 'Reading input', 'Resolving ISP',
    'Mapping region', 'Geolocating postal', 'Reading currency',
    'Resolving codes', 'Measuring latency', 'Reading orientation',
    'Checking WebGL', 'Auditing storage', 'Reading cookies',
    'Enumerating plugins', 'Checking referrer', 'Reading viewport',
    'Checking history', 'Network status', 'Country data',
    'Population data', 'Power status', 'Logging timestamp',
    'Capturing agent', 'Resolving ASN', 'Deep scanning',
];


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCAN STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const totalDefinedRows = scanDefs.length;
const MAX_VISIBLE = CONFIG.scanLinesMaxVisible;
const scanContainer = document.getElementById('scanLines');

let rowIndex = 0;
let completedRows = 0;
let typewriterTriggered = false;
let dissolveTriggered = false;
let scanPaused = false;
let orphanedLineEl = null;
let conductorReady = false;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROGRESS BAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateProgress(n) {
    try {
        const pct = Math.min(Math.round(n / totalDefinedRows * 100), 100);
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressPct').textContent = pct + '%';
        document.getElementById('progressLabel').textContent =
            progressLabels[Math.min(n, progressLabels.length - 1)] || 'Deep scanning';
        if (pct >= 100) {
            setTimeout(() => {
                const bar = document.querySelector('.scan-progress');
                if (bar) bar.style.opacity = '0';
            }, CONFIG.progressHideDelay);
        }
    } catch (e) { }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOM HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeEllipsis() {
    const el = document.createElement('span');
    el.className = 'ellipsis';
    el.innerHTML = '<span></span><span></span><span></span>';
    return el;
}

function fakeVal() {
    const generators = [
        () => Math.random().toString(16).slice(2, 10).toUpperCase(),
        () => ['NULL', 'UNREGISTERED', 'NOT FOUND', 'FLAGGED', 'CLASSIFIED', 'EXPIRED',
            'DRIFTING', 'PARTIAL', 'INACTIVE', 'SEVERED', 'DEGRADED', 'MISMATCH']
        [Math.floor(Math.random() * 12)],
        () => (Math.random() * 10).toFixed(2) + ' / 10',
        () => Math.floor(Math.random() * 9999) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        () => ['0.' + Math.floor(Math.random() * 99), '1.00', '0.00'][Math.floor(Math.random() * 3)],
        () => ['ACTIVE', 'PASSIVE', 'MONITORED', 'WATCHING', 'PROCESSING'][Math.floor(Math.random() * 5)],
        () => '0x' + Math.random().toString(16).slice(2, 10).toUpperCase(),
    ];
    return generators[Math.floor(Math.random() * generators.length)]();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCAN ROW REVEAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function revealNextRow() {
    try {
        if (dissolveTriggered || scanPaused) return;

        let def, isExtra = false;
        if (rowIndex < scanDefs.length) {
            def = scanDefs[rowIndex];
        } else {
            isExtra = true;
            const key = extraKeys[(rowIndex - scanDefs.length) % extraKeys.length];
            def = { key, id: null, s: 0, wait: 6, pause: 200 };
        }
        rowIndex++;

        const line = document.createElement('div');
        line.className = `scan-line s${def.s}`;

        const keyEl = document.createElement('div');
        keyEl.className = 'scan-line-key';
        keyEl.textContent = def.key;

        const valEl = document.createElement('div');
        valEl.className = 'scan-line-val pending';
        valEl.id = `sv_${def.id}_${rowIndex}`;
        if (!isExtra) valEl.appendChild(makeEllipsis());
        else valEl.textContent = '...';

        const checkEl = document.createElement('div');
        checkEl.className = 'scan-line-check';
        checkEl.textContent = '✕';

        line.append(keyEl, valEl, checkEl);
        scanContainer.appendChild(line);

        while (scanContainer.children.length > MAX_VISIBLE) {
            scanContainer.removeChild(scanContainer.firstChild);
        }

        requestAnimationFrame(() => requestAnimationFrame(() => line.classList.add('active')));

        const startTime = Date.now();
        const hardMax = Math.max(def.wait, 4000);

        function tryPopulate() {
            if (dissolveTriggered || scanPaused) return;
            const val = isExtra ? fakeVal() : dataReady[def.id];
            const elapsed = Date.now() - startTime;
            const ready = (val !== undefined && elapsed >= def.wait) || elapsed >= hardMax;
            if (!isExtra && !ready) { setTimeout(tryPopulate, 40); return; }

            valEl.textContent = isExtra ? fakeVal() : (val ?? '—');
            valEl.classList.remove('pending');
            line.classList.add('done');

            if (def.id === 'route_depth') { line.classList.add('orphaned'); orphanedLineEl = line; }

            if (!isExtra) {
                completedRows++;
                updateProgress(completedRows);
                if (!typewriterTriggered && conductorReady && completedRows >= Math.floor(totalDefinedRows * 0.5)) {
                    typewriterTriggered = true;
                    setTimeout(startConductorSequence, 2300);
                }
            }
            setTimeout(revealNextRow, def.pause);
        }

        setTimeout(tryPopulate, Math.min(def.wait, 400));

    } catch (e) { console.error('revealNextRow error:', e); }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANIMATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function animXY(el, fromX, fromY, toX, toY, dur, ease, onDone) {
    const startTime = performance.now();
    function step(now) {
        let t = Math.min((now - startTime) / dur, 1);
        if (ease === 'out') t = 1 - Math.pow(1 - t, 3);
        if (ease === 'inout') t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        el.style.left = (fromX + (toX - fromX) * t) + 'px';
        el.style.top = (fromY + (toY - fromY) * t) + 'px';
        if (t < 1) requestAnimationFrame(step);
        else { el.style.left = toX + 'px'; el.style.top = toY + 'px'; if (onDone) onDone(); }
    }
    requestAnimationFrame(step);
}

function typeBeforeCursor(cursor, text, speed, onDone) {
    let i = 0;
    const interval = setInterval(() => {
        if (i < text.length) cursor.insertAdjacentText('beforebegin', text[i++]);
        else { clearInterval(interval); if (onDone) setTimeout(onDone, 0); }
    }, speed);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TERMINAL BAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showTermBar(onDone) {
    const bar = document.getElementById('termBar');
    const line = document.getElementById('termLine');
    bar.classList.add('visible');
    line.innerHTML = '';
    const cursor = document.createElement('span');
    cursor.className = 'term-cursor';
    line.appendChild(cursor);
    const parts = [
        { text: 'incoming connection... ', delay: 500 },
        { text: 'routing through proxy chain... ', delay: 800 },
        { text: 'identity masked — ', delay: 600 },
        { text: 'ANONYMOUS USER CONNECTED', delay: 400 },
    ];
    let t = 0;
    parts.forEach(p => { t += p.delay; setTimeout(() => cursor.insertAdjacentText('beforebegin', p.text), t); });
    t += 600;
    setTimeout(() => { if (onDone) onDone(); }, t);
}

function termType(code, response, speed, onDone) {
    const line = document.getElementById('termLine');
    line.innerHTML = '';
    const prompt = document.createElement('span');
    prompt.style.cssText = 'color:#2a6a2a;font-size:0.65rem;letter-spacing:0.05em;margin-right:8px;';
    prompt.textContent = 'root@bsi ~$';
    line.appendChild(prompt);
    const cursor = document.createElement('span');
    cursor.className = 'term-cursor';
    line.appendChild(cursor);
    let i = 0;
    const interval = setInterval(() => {
        if (i < code.length) cursor.insertAdjacentText('beforebegin', code[i++]);
        else {
            clearInterval(interval);
            setTimeout(() => {
                if (response) {
                    const resp = document.createElement('span');
                    resp.style.cssText = 'color:#888;font-size:0.6rem;margin-left:16px;';
                    resp.textContent = '→ ' + response;
                    line.appendChild(resp);
                }
                if (onDone) setTimeout(onDone, response ? 500 : 0);
            }, 200);
        }
    }, speed || 55);
}

function termShowSpeed(val) {
    const line = document.getElementById('termLine');
    line.innerHTML = '';
    const span = document.createElement('span');
    span.style.cssText = 'color:#ffaa44;font-size:0.65rem;letter-spacing:0.06em;';
    span.textContent = 'session.reverse_speed: ' + val;
    line.appendChild(span);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HAND DRAG BOX
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handDragBox(onDone) {
    const hand = document.getElementById('handImg');
    const box = document.getElementById('drawnBox');

    const boxStartX = W * CONFIG.drawnBoxLeft / 100;
    const boxStartY = H * CONFIG.drawnBoxTop / 100;
    const boxEndX = W * 0.97;
    const boxEndY = H * 0.72;
    const tipX = 36, tipY = 76;

    Object.assign(box.style, { position: 'fixed', left: boxStartX + 'px', top: boxStartY + 'px', width: '0px', height: '0px', opacity: '0', zIndex: '50' });
    Object.assign(hand.style, { position: 'fixed', left: (W + 20) + 'px', top: (boxStartY - tipY) + 'px', opacity: '0', transition: 'opacity 0.5s ease', zIndex: '201' });

    setTimeout(() => {
        hand.style.opacity = '0.9';
        animXY(hand, W + 20, boxStartY - tipY, boxStartX - tipX, boxStartY - tipY, 950, 'out', () => {
            setTimeout(() => {
                box.style.opacity = '1';
                const dragDur = 1200;
                const dragStart = performance.now();
                function dragFrame(now) {
                    let t = Math.min((now - dragStart) / dragDur, 1);
                    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                    const cx = boxStartX + (boxEndX - boxStartX) * t;
                    const cy = boxStartY + (boxEndY - boxStartY) * t;
                    box.style.width = (cx - boxStartX) + 'px';
                    box.style.height = (cy - boxStartY) + 'px';
                    hand.style.left = (cx - tipX) + 'px';
                    hand.style.top = (cy - tipY) + 'px';
                    if (t < 1) { requestAnimationFrame(dragFrame); }
                    else {
                        box.style.width = (boxEndX - boxStartX) + 'px';
                        box.style.height = (boxEndY - boxStartY) + 'px';
                        setTimeout(() => {
                            animXY(hand, boxEndX - tipX, boxEndY - tipY, W + 20, boxEndY - tipY, 800, 'inout', () => {
                                hand.style.opacity = '0';
                                if (onDone) onDone();
                            });
                        }, 250);
                    }
                }
                requestAnimationFrame(dragFrame);
            }, 200);
        });
    }, 300);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REVERSE ANIMATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function doReverse(onDone) {
    const container = document.getElementById('scanLines');
    const wrap = document.getElementById('scanLinesWrap');

    Object.assign(wrap.style, { position: '', top: '', left: '', width: '', height: 'calc(100vh - 140px)', overflow: 'visible', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 0 20px' });
    container.innerHTML = '';
    container.style.gap = '3px';
    container.style.transform = '';
    container.style.transition = '';
    document.getElementById('orphanOverlay')?.remove();

    const rewindData = [
        ['ASN', dataReady['asn'] || '—'],
        ['User Agent', (dataReady['ua'] || '—').slice(0, 30) + '...'],
        ['Timestamp', dataReady['time'] || '—'],
        ['Network', dataReady['online'] || '—'],
        ['History', dataReady['history_len'] || '—'],
        ['Viewport', dataReady['viewport'] || '—'],
        ['Referrer', dataReady['ref'] || '—'],
        ['Plugins', dataReady['plugins'] || '—'],
        ['Cookies', dataReady['cookies'] || '—'],
        ['Storage', dataReady['storage'] || '—'],
        ['WebGL', dataReady['webgl'] || '—'],
        ['Orientation', dataReady['orient'] || '—'],
        ['RTT', dataReady['rtt'] || '—'],
        ['Calling', dataReady['calling'] || '—'],
        ['Currency', dataReady['currency'] || '—'],
        ['Postal', dataReady['postal'] || '—'],
        ['Region', dataReady['region'] || '—'],
        ['ISP', dataReady['isp'] || '—'],
        ['Touch', dataReady['touch'] || '—'],
        ['DPR', dataReady['dpr'] || '—'],
        ['Color', dataReady['depth'] || '—'],
        ['Memory', dataReady['mem'] || '—'],
        ['Cores', dataReady['cores'] || '—'],
        ['Platform', dataReady['platform'] || '—'],
        ['Language', dataReady['langs'] || '—'],
        ['Battery', dataReady['bat'] || '—'],
        ['Display', dataReady['disp'] || '—'],
        ['Connection', dataReady['conn'] || '—'],
        ['Device', dataReady['dev'] || '—'],
        ['Timezone', dataReady['tz'] || '—'],
        ['Death Drive Acquisition', 'NULL'],
        ['Soul Index', 'UNREGISTERED'],
        ['Consent Timestamp', 'NOT FOUND'],
        ['Memory Checksum', 'MISMATCH'],
        ['Behavioral Signature', 'FLAGGED'],
        ['Identity Anchor', 'DRIFTING'],
        ['Compliance Token', 'EXPIRED'],
        ['Threat Vector', 'UNKNOWN'],
        ['Shadow Profile', 'PARTIAL'],
        ['Loyalty Coefficient', '0.34'],
        ['Conscience Override', 'INACTIVE'],
        ['Last Known Intent', 'CLASSIFIED'],
        ['Origin Trace', 'SEVERED'],
        ['Anomaly Score', '7.4 / 10'],
        ['Narrative Coherence', 'DEGRADED'],
        ['Location', dataReady['loc'] || '—'],
        ['IP Address', dataReady['ip'] || '—'],
    ];

    const total = rewindData.length;
    let idx = 0;
    const speedSteps = [1.0, 0.88, 0.74, 0.61, 0.49, 0.38, 0.28, 0.20, 0.13, 0.08, 0.04, 0.01, 0.00];
    let lastSpeedIdx = 0;

    function makeRow(key, val, isOrphan, progress) {
        const fontSize = isOrphan ? 1.35 : (0.3 + progress * 1.1);
        const keySize = isOrphan ? 0.68 : (0.24 + progress * 0.32);
        const opacity = isOrphan ? 1 : Math.max(0.15 + progress * 0.85, 0.15);
        const xNudge = isOrphan ? 0 : (Math.random() * 8);

        const line = document.createElement('div');
        Object.assign(line.style, {
            display: 'flex', alignItems: 'baseline', gap: '14px',
            paddingLeft: isOrphan ? CONFIG.scanLinesLeftPadding : `calc(${CONFIG.scanLinesLeftPadding} + ${xNudge}vw)`,
            paddingRight: '2vw',
            paddingTop: isOrphan ? '6px' : '1px',
            paddingBottom: isOrphan ? '6px' : '1px',
            whiteSpace: 'nowrap', overflow: 'visible', flexShrink: '0', opacity,
        });
        if (isOrphan) { line.style.background = 'rgba(232,55,42,0.06)'; line.style.width = '100%'; }

        const keyEl = document.createElement('span');
        Object.assign(keyEl.style, { fontFamily: "'Space Grotesk',sans-serif", fontSize: keySize + 'rem', letterSpacing: '0.15em', color: isOrphan ? 'var(--red)' : 'var(--muted)', textTransform: 'uppercase', fontWeight: '500', minWidth: '90px', flexShrink: '0' });
        keyEl.textContent = key;

        const valEl = document.createElement('span');
        Object.assign(valEl.style, { fontFamily: "'Space Mono',monospace", fontSize: fontSize + 'rem', color: isOrphan ? 'var(--red)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis' });
        if (isOrphan) { valEl.style.borderLeft = '3px solid var(--red)'; valEl.style.paddingLeft = '10px'; }
        valEl.textContent = val;

        line.append(keyEl, valEl);
        return { line, keyEl, valEl };
    }

    function addRow() {
        if (idx >= total) { addOrphanRow(); return; }

        const [key, val] = rewindData[idx];
        const progress = idx / total;
        const { line } = makeRow(key, val, false, progress);
        container.appendChild(line);

        while (container.children.length > 18) container.removeChild(container.firstChild);

        idx++;

        const speedIdx = Math.floor(progress * speedSteps.length);
        if (speedIdx > lastSpeedIdx) {
            lastSpeedIdx = speedIdx;
            termShowSpeed(speedSteps[Math.min(speedIdx, speedSteps.length - 1)].toFixed(2) + 'x');
        }

        document.getElementById('progressFill').style.width = Math.round(100 - progress * 55) + '%';
        document.getElementById('progressLabel').textContent = 'REVERSING';

        setTimeout(addRow, 25 + Math.pow(progress, 3) * 975);
    }

    function addOrphanRow() {
        while (container.children.length > 7) container.removeChild(container.firstChild);
        const { line, keyEl, valEl } = makeRow('route_depth', 'orphaned', true, 1);
        container.appendChild(line);
        orphanedLineEl = line;
        orphanedLineEl._valEl = valEl;
        orphanedLineEl._keyEl = keyEl;
        termShowSpeed('0.00x');
        document.getElementById('progressLabel').textContent = 'HALTED';
        document.getElementById('progressFill').style.width = '45%';
        if (onDone) setTimeout(onDone, 800);
    }

    addRow();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HAND FIX
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handFixLine(targetLine, onDone) {
    const hand = document.getElementById('handImgFlipped');
    const lineRect = targetLine.getBoundingClientRect();
    const valEl = targetLine._valEl || targetLine.querySelector('.scan-line-val') || targetLine.querySelector('div:last-child');
    const tipX = 36, tipY = 76;
    const targetX = lineRect.left + 120 - tipX;
    const targetY = lineRect.top + lineRect.height / 2 - tipY;

    Object.assign(hand.style, { position: 'fixed', left: '-180px', top: targetY + 'px', opacity: '0', transition: 'opacity 0.4s ease', zIndex: '201' });

    setTimeout(() => {
        hand.style.opacity = '0.85';
        animXY(hand, -180, targetY, targetX, targetY, 900, 'out', () => {
            setTimeout(() => {
                let text = valEl.textContent;
                const deleteInterval = setInterval(() => {
                    if (text.length > 0) { text = text.slice(0, -1); valEl.textContent = text; }
                    else {
                        clearInterval(deleteInterval);
                        targetLine.classList.remove('orphaned');
                        let i = 0;
                        const typeInterval = setInterval(() => {
                            if (i < 'resolved'.length) { valEl.textContent += 'resolved'[i++]; }
                            else {
                                clearInterval(typeInterval);
                                Object.assign(valEl.style, { color: 'var(--green)', borderLeftColor: 'var(--green)', background: 'rgba(0,200,83,0.08)' });
                                const keyEl = targetLine._keyEl || targetLine.querySelector('div:first-child');
                                if (keyEl) keyEl.style.color = 'var(--green)';
                                setTimeout(() => {
                                    animXY(hand, targetX, targetY, -180, targetY, 700, 'inout', () => {
                                        hand.style.opacity = '0';
                                        if (onDone) onDone();
                                    });
                                }, 600);
                            }
                        }, 90);
                    }
                }, 55);
            }, 700);
        });
    }, 200);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONDUCTOR SEQUENCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function startConductorSequence() {
    showTermBar(() => {
        setTimeout(() => {
            handDragBox(() => {
                const t1 = document.getElementById('twText1');
                const cursor1 = document.createElement('span');
                cursor1.className = 'cursor';
                t1.appendChild(cursor1);

                setTimeout(() => {
                    typeBeforeCursor(cursor1, 'I know why you are here.', 82, () => {
                        cursor1.insertAdjacentHTML('beforebegin', '<br><br>');
                        cursor1.remove();
                        setTimeout(() => {
                            const t2 = document.getElementById('twText2');
                            const cursor2 = document.createElement('span');
                            cursor2.className = 'cursor';
                            t2.appendChild(cursor2);
                            setTimeout(() => {
                                typeBeforeCursor(cursor2, 'Let me help you. You seem lost.', 75, () => {
                                    cursor2.remove();
                                    setTimeout(() => {
                                        termType('session.pause()', 'execution halted — all processes frozen', 70, () => {
                                            document.getElementById('vhsOverlay').classList.add('active');
                                            document.getElementById('scanPhase').classList.add('vhs');
                                            scanPaused = true;
                                            setTimeout(() => {
                                                termType('session.reverse()', null, 70, () => {
                                                    document.getElementById('progressLabel').textContent = 'REVERSING';
                                                    doReverse(() => {
                                                        termShowSpeed('0.00x');
                                                        setTimeout(() => {
                                                            if (!orphanedLineEl) { setTimeout(triggerDissolve, 2000); return; }
                                                            orphanedLineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                            document.getElementById('vhsOverlay').classList.remove('active');
                                                            document.getElementById('scanPhase').classList.remove('vhs');
                                                            setTimeout(() => {
                                                                termType('session.set(route_depth, "resolved")', 'patching entry point...', 65, () => {
                                                                    setTimeout(() => {
                                                                        orphanedLineEl.scrollIntoView({ block: 'center' });
                                                                        handFixLine(orphanedLineEl, () => {
                                                                            document.getElementById('progressFill').classList.add('green');
                                                                            document.getElementById('progressLabel').textContent = 'RESOLVED';
                                                                            termType('session.resume()', 'route_depth resolved — access pathway open', 65, () => {
                                                                                setTimeout(() => {
                                                                                    const t3 = document.getElementById('twText3');
                                                                                    const cursor3 = document.createElement('span');
                                                                                    cursor3.className = 'cursor';
                                                                                    t3.insertAdjacentHTML('beforeend', '<br>');
                                                                                    setTimeout(() => {
                                                                                        t3.insertAdjacentHTML('beforeend', '<br>');
                                                                                        t3.appendChild(cursor3);
                                                                                        setTimeout(() => {
                                                                                            typeBeforeCursor(cursor3, 'Try again', 110, () => {
                                                                                                setTimeout(() => cursor3.insertAdjacentText('beforebegin', '.'), 400);
                                                                                                setTimeout(() => cursor3.insertAdjacentText('beforebegin', '.'), 900);
                                                                                                setTimeout(() => cursor3.insertAdjacentText('beforebegin', '.'), 1500);
                                                                                                setTimeout(() => { cursor3.remove(); setTimeout(triggerDissolve, 1800); }, 2400);
                                                                                            });
                                                                                        }, 500);
                                                                                    }, 600);
                                                                                }, 1200);
                                                                            });
                                                                        });
                                                                    }, 1200);
                                                                });
                                                            }, 600);
                                                        }, 600);
                                                    });
                                                });
                                            }, 2500);
                                        });
                                    }, 4000);
                                });
                            }, 400);
                        }, 500);
                    });
                }, 1500);
            });
        }, 800);
    });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DISSOLVE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function triggerDissolve() {
    dissolveTriggered = true;
    document.getElementById('orphanOverlay')?.remove();

    termType('terminate()', 'session closed', 65, () => {
        setTimeout(() => document.getElementById('termBar').classList.remove('visible'), 600);
    });

    [document.querySelector('.scan-left'), document.querySelector('.scan-right'), document.getElementById('drawnBox')]
        .forEach(el => { if (!el) return; el.style.transition = 'opacity 2s ease'; el.style.opacity = '0'; });

    // Step 1 — move globe and wordmark to center
    setTimeout(() => {
        const header = document.querySelector('.scan-header');
        if (header) { header.style.left = '50%'; header.style.top = '50%'; }
        window.startGlobeMove(50, 50);
    }, 500);

    // Step 2 — lift wordmark up
    setTimeout(() => {
        const header = document.querySelector('.scan-header');
        if (header) header.style.top = '12%';
    }, 3100);

    // Step 3 — show ARG registration prompt instead of immediately drawing pin lines.
    // Pin lines draw after the player registers or uploads their card.
    setTimeout(() => {
        showArgRegistration();
    }, 5500);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOGIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

function attemptLogin() {
    const password = document.getElementById('password').value.trim();

    // DEV SHORTCUT — remove before launch
    if (password.toLowerCase() === 'wawamangosmoothie') {
        localStorage.setItem('baw_gate_passed', 'true');
        document.getElementById('loginPhase').style.display = 'none';
        const scanPhase = document.getElementById('scanPhase');
        scanPhase.style.display = 'flex';
        scanPhase.style.opacity = '1';
        conductorReady = true;
        triggerDissolve();
        return;
    }

    if (password.toLowerCase() !== ACCESS_CODE) {
        showMsg('Invalid credentials. This attempt has been logged.', 'error');
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
        return;
    }

    // Mark that this player has passed the gate — future visits skip the intro
    localStorage.setItem('baw_gate_passed', 'true');

    showMsg('Verified — establishing secure session...', 'success');
    document.getElementById('loginProgress').classList.add('show');
    setTimeout(() => document.getElementById('loginBar').style.width = '100%', 50);

    setTimeout(() => {
        const loginPhase = document.getElementById('loginPhase');
        loginPhase.style.transition = 'opacity 1.5s ease';
        loginPhase.style.opacity = '0';

        setTimeout(() => {
            loginPhase.style.display = 'none';
            const scanPhase = document.getElementById('scanPhase');
            scanPhase.style.display = 'flex';
            scanPhase.style.opacity = '0';
            scanPhase.style.transition = 'opacity 2s ease';

            document.querySelector('.scan-lines-wrap').style.opacity = '0';
            document.querySelector('.scan-progress').style.opacity = '0';
            document.querySelector('.scan-right').style.opacity = '0';

            setTimeout(() => { scanPhase.style.opacity = '1'; }, 100);

            setTimeout(() => {
                document.querySelector('.scan-lines-wrap').style.transition = 'opacity 1.5s ease';
                document.querySelector('.scan-progress').style.transition = 'opacity 1.5s ease';
                document.querySelector('.scan-right').style.transition = 'opacity 1.5s ease';
                document.querySelector('.scan-lines-wrap').style.opacity = '1';
                document.querySelector('.scan-progress').style.opacity = '1';
                document.querySelector('.scan-right').style.opacity = '1';
                conductorReady = true;
                setTimeout(revealNextRow, 800);
            }, 3000);

        }, 1500);
    }, 1600);
}

function showMsg(text, type) {
    const el = document.getElementById('msg');
    el.textContent = text;
    el.className = type;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HONEYCOMB SEQUENCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Draws cream hexagons on a black canvas sweeping diagonally
// from top-left to bottom-right. Each hex pops toward the
// camera (scale > 1) then settles. Once all hexes are drawn,
// the outlines fade away leaving solid cream, then the
// "SECURED" flash plays, then the login card appears.
//
// On returning visits (baw_gate_passed in localStorage),
// this entire sequence is skipped.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HEX = (() => {

    // ── Config ──
    const CREAM       = '#f5f2ec';
    const BLACK       = '#000000';
    const HEX_STROKE  = '#1a1a18';
    const HEX_SIZE    = 38;          // circumradius in px
    const WAVE_SPEED  = 1.8;         // diagonal cells per frame
    const POP_SCALE   = 1.18;        // how much each hex pops out
    const POP_DUR     = 280;         // ms for pop + settle animation
    const FADE_DELAY  = 600;         // ms after last hex before outlines fade
    const FADE_DUR    = 900;         // ms for outline fade

    let canvas, ctx, cells = [], animFrame;
    let waveProgress = 0;            // diagonal distance reached so far
    let maxDiag = 0;                 // total diagonal length of grid
    let allDrawn = false;
    let outlineAlpha = 1;
    let fadingOutlines = false;
    let onComplete = null;           // callback when sequence finishes

    // ── Hex geometry helpers ──
    // Flat-top hexagons. Returns the 6 corner points of a hex
    // centered at (cx, cy) with circumradius r.
    function hexCorners(cx, cy, r) {
        const pts = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i);
            pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
        }
        return pts;
    }

    // Draw a single filled hex with an outline
    function drawHex(cx, cy, r, fillAlpha, strokeAlpha, scale) {
        const pts = hexCorners(cx, cy, r * scale);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();

        ctx.fillStyle = `rgba(245,242,236,${fillAlpha})`;
        ctx.fill();

        ctx.strokeStyle = `rgba(26,26,24,${strokeAlpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.restore();
    }

    // Build the grid of hex cell centers covering the canvas
    function buildGrid(w, h) {
        cells = [];
        const colW  = HEX_SIZE * 1.5;
        const rowH  = HEX_SIZE * Math.sqrt(3);
        const cols  = Math.ceil(w / colW) + 2;
        const rows  = Math.ceil(h / rowH) + 2;

        for (let col = -1; col < cols; col++) {
            for (let row = -1; row < rows; row++) {
                const cx = col * colW;
                const cy = row * rowH + (col % 2 === 0 ? 0 : rowH / 2);
                // Diagonal distance from top-left — determines reveal order
                const diag = (cx / w + cy / h);
                cells.push({ cx, cy, diag, drawn: false, popStart: null, scale: 1 });
            }
        }

        // Sort by diagonal so we can sweep efficiently
        cells.sort((a, b) => a.diag - b.diag);
        maxDiag = cells[cells.length - 1].diag;
    }

    // ── Main render loop ──
    function render(ts) {
        const w = canvas.width;
        const h = canvas.height;

        // Fill black background
        ctx.fillStyle = BLACK;
        ctx.fillRect(0, 0, w, h);

        if (!allDrawn) {
            // Advance the wave front
            waveProgress += WAVE_SPEED / 60 * (1000 / 16.67);

            let allDone = true;
            for (const cell of cells) {
                const threshold = cell.diag * 60;  // scaled to frame units
                if (threshold <= waveProgress && !cell.drawn) {
                    cell.drawn    = true;
                    cell.popStart = ts;
                }
                if (!cell.drawn) { allDone = false; continue; }

                // Compute pop scale: starts at POP_SCALE, eases back to 1
                let scale = 1;
                if (cell.popStart !== null) {
                    const elapsed = ts - cell.popStart;
                    if (elapsed < POP_DUR) {
                        const t = elapsed / POP_DUR;
                        // Ease out: overshoot then settle
                        const eased = 1 - Math.pow(1 - t, 3);
                        scale = POP_SCALE - (POP_SCALE - 1) * eased;
                    }
                }
                drawHex(cell.cx, cell.cy, HEX_SIZE, 1, outlineAlpha, scale);
            }

            if (allDone && !allDrawn) {
                allDrawn = true;
                // Start fading outlines after a short pause
                setTimeout(() => { fadingOutlines = true; }, FADE_DELAY);
            }

        } else if (fadingOutlines) {
            // Fade the outlines while keeping cream fill
            outlineAlpha = Math.max(0, outlineAlpha - (1 / (FADE_DUR / 16.67)));
            for (const cell of cells) {
                drawHex(cell.cx, cell.cy, HEX_SIZE, 1, outlineAlpha, 1);
            }

            if (outlineAlpha <= 0) {
                // Sequence complete — hide canvas and call back
                fadingOutlines = false;
                cancelAnimationFrame(animFrame);
                canvas.style.opacity = '0';
                setTimeout(() => {
                    canvas.style.display = 'none';
                    if (onComplete) onComplete();
                }, 300);
                return;
            }
        } else {
            // Holding — all drawn, waiting for fade to start
            for (const cell of cells) {
                drawHex(cell.cx, cell.cy, HEX_SIZE, 1, outlineAlpha, 1);
            }
        }

        animFrame = requestAnimationFrame(render);
    }

    // ── Public API ──
    return {
        play(callback) {
            onComplete = callback;
            canvas = document.getElementById('hexCanvas');
            ctx    = canvas.getContext('2d');

            canvas.width  = window.innerWidth;
            canvas.height = window.innerHeight;
            canvas.style.display  = 'block';
            canvas.style.opacity  = '1';
            canvas.style.transition = 'opacity 0.3s ease';

            buildGrid(canvas.width, canvas.height);
            animFrame = requestAnimationFrame(render);
        }
    };
})();


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECURED FLASH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The word "SECURED" flickers in like a light turning on,
// sends out expanding rectangular ripples, holds briefly,
// then flickers out.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function playSecuredFlash(onComplete) {
    const flash   = document.getElementById('securedFlash');
    const word    = document.getElementById('securedWord');
    const ripples = document.getElementById('securedRipples');

    // Make the flash container visible (it sits on the cream background)
    // We flip it to dark mode just for this moment
    flash.style.background = 'transparent';
    word.style.color       = 'var(--ink)';
    word.style.borderColor = 'var(--ink)';

    // ── Ripple helper ──
    // Spawns a rectangle that expands from the word's position and fades out
    function spawnRipple(delay, scale = 1) {
        setTimeout(() => {
            const rect   = word.getBoundingClientRect();
            const cx     = rect.left + rect.width  / 2;
            const cy     = rect.top  + rect.height / 2;
            const startW = rect.width;
            const startH = rect.height;

            const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            el.setAttribute('x',      cx - startW / 2);
            el.setAttribute('y',      cy - startH / 2);
            el.setAttribute('width',  startW);
            el.setAttribute('height', startH);
            el.setAttribute('fill',   'none');
            el.setAttribute('stroke', 'var(--ink)');
            el.setAttribute('stroke-width', '0.8');
            el.setAttribute('opacity', '0.6');
            ripples.appendChild(el);

            const dur     = 1200;
            const maxW    = Math.max(window.innerWidth, window.innerHeight) * 2.4 * scale;
            const maxH    = maxW * (startH / startW);
            const start   = performance.now();

            function animRipple(ts) {
                const t      = Math.min((ts - start) / dur, 1);
                const eased  = 1 - Math.pow(1 - t, 2);
                const curW   = startW + (maxW - startW) * eased;
                const curH   = startH + (maxH - startH) * eased;
                const alpha  = 0.6 * (1 - t);

                el.setAttribute('x',       cx - curW / 2);
                el.setAttribute('y',       cy - curH / 2);
                el.setAttribute('width',   curW);
                el.setAttribute('height',  curH);
                el.setAttribute('opacity', alpha);

                if (t < 1) requestAnimationFrame(animRipple);
                else el.remove();
            }
            requestAnimationFrame(animRipple);
        }, delay);
    }

    // ── Flicker in ──
    const flickerIn = [0, 60, 120, 80, 160, 0, 200];
    let t = 0;
    flickerIn.forEach((dur, i) => {
        setTimeout(() => { flash.style.opacity = i % 2 === 0 ? '1' : '0'; }, t);
        t += dur;
    });

    // ── Ripples spawn on impact ──
    spawnRipple(t,       1.0);
    spawnRipple(t + 80,  0.7);
    spawnRipple(t + 180, 0.5);
    spawnRipple(t + 320, 0.35);

    // ── Hold ──
    const holdEnd = t + 900;

    // ── Flicker out ──
    const flickerOut = [0, 50, 100, 60, 140, 0, 180];
    let t2 = holdEnd;
    flickerOut.forEach((dur, i) => {
        setTimeout(() => { flash.style.opacity = i % 2 === 0 ? '0' : '1'; }, t2);
        t2 += dur;
    });

    // ── Callback after flash is gone ──
    setTimeout(() => {
        flash.style.opacity = '0';
        if (onComplete) onComplete();
    }, t2 + 100);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INITIATION SEQUENCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Called on first visit only. Plays honeycomb → flash →
// then shows the login card.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function playInitiationSequence(onComplete) {
    // Hide everything behind the canvas
    document.getElementById('loginPhase').style.opacity = '0';

    HEX.play(() => {
        // Honeycombs done — play the flash
        playSecuredFlash(() => {
            // Flash done — reveal the login card
            const login = document.getElementById('loginPhase');
            login.style.transition = 'opacity 0.8s ease';
            login.style.opacity    = '1';
            if (onComplete) onComplete();
        });
    });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ARG BACKEND — SESSION & REGISTRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BACKEND_URL = 'http://localhost:5000';

async function argApiFetch(path, method = 'GET', body = null) {
    const opts = {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    try {
        const res  = await fetch(BACKEND_URL + path, opts);
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
    } catch (err) {
        return { ok: false, status: 0, data: { error: '—' } };
    }
}

// ── Session check on load ──
function checkSessionState() {
    const gatePassed = localStorage.getItem('baw_gate_passed');
    const registered = localStorage.getItem('baw_registered');

    if (!gatePassed) {
        // First time — play the full honeycomb sequence then show login
        playInitiationSequence();
        return;
    }

    // Gate passed — skip straight to post-sequence state
    // Hide the login card, position globe, show appropriate prompt
    const login = document.getElementById('loginPhase');
    login.style.opacity = '0';
    login.style.pointerEvents = 'none';

    if (window.startGlobeMove) window.startGlobeMove(50, 50);
    const header = document.querySelector('.scan-header');
    if (header) { header.style.left = '50%'; header.style.top = '12%'; }

    if (registered) {
        setTimeout(showArgCardPrompt, 400);
    } else {
        setTimeout(showArgRegistration, 400);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkSessionState();
});

// ── Show registration prompt ──
function showArgRegistration() {
    const cardPrompt = document.getElementById('argCardPrompt');
    if (cardPrompt) cardPrompt.classList.remove('visible');

    const prompt = document.getElementById('argRegPrompt');
    if (!prompt) return;
    prompt.classList.add('visible');

    setTimeout(() => {
        const input = document.getElementById('argUsername');
        if (!input || input.dataset.listenerAdded) return;
        input.dataset.listenerAdded = 'true';
        input.focus();
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); argRegister(); }
        });
    }, 600);
}

// ── Show card prompt ──
function showArgCardPrompt() {
    const regPrompt = document.getElementById('argRegPrompt');
    if (regPrompt) regPrompt.classList.remove('visible');

    const prompt = document.getElementById('argCardPrompt');
    if (!prompt) return;
    prompt.classList.add('visible');
}

// Switch from card prompt to registration
function argSwitchToRegister() {
    localStorage.removeItem('baw_registered');
    localStorage.removeItem('baw_username');
    const cardPrompt = document.getElementById('argCardPrompt');
    if (cardPrompt) {
        cardPrompt.classList.remove('visible');
        cardPrompt.classList.add('fading');
        setTimeout(() => cardPrompt.classList.remove('fading'), 1000);
    }
    setTimeout(showArgRegistration, 300);
}

// Skip to registration without sequence
function skipToRegistration() {
    const login = document.getElementById('loginPhase');
    if (login) { login.style.transition = 'none'; login.style.opacity = '0'; login.style.pointerEvents = 'none'; }
    if (window.startGlobeMove) window.startGlobeMove(50, 50);
    const header = document.querySelector('.scan-header');
    if (header) { header.style.left = '50%'; header.style.top = '12%'; }
    setTimeout(showArgRegistration, 400);
}

function skipToCardPrompt() {
    const login = document.getElementById('loginPhase');
    if (login) { login.style.transition = 'none'; login.style.opacity = '0'; login.style.pointerEvents = 'none'; }
    if (window.startGlobeMove) window.startGlobeMove(50, 50);
    const header = document.querySelector('.scan-header');
    if (header) { header.style.left = '50%'; header.style.top = '12%'; }
    setTimeout(showArgCardPrompt, 400);
}

// ── Register ──
async function argRegister() {
    const input    = document.getElementById('argUsername');
    const btn      = document.getElementById('argRegBtn');
    const btnText  = document.getElementById('argRegBtnText');
    const sub      = document.getElementById('argRegSub');
    const username = input ? input.value.trim() : '';

    if (!username) { argSetMsg('—', 'error', 'argRegMsg'); return; }

    btn.disabled = true;
    if (btnText) btnText.textContent = '...';
    if (sub) sub.style.opacity = '0';

    const { ok, data } = await argApiFetch('/auth/register', 'POST', { username });

    if (!ok) {
        argSetMsg(data.error || '—', 'error', 'argRegMsg');
        btn.disabled = false;
        if (btnText) btnText.textContent = '→';
        if (sub) sub.style.opacity = '0.4';
        return;
    }

    localStorage.setItem('baw_registered', 'true');
    localStorage.setItem('baw_username', username);

    argSetMsg('—', 'success', 'argRegMsg');

    setTimeout(async () => {
        await argDownloadCard();
        setTimeout(() => argFadeOutAndProceed('argRegPrompt'), 1200);
    }, 400);
}

// ── Upload card ──
async function argUploadCard(input) {
    const file = input.files[0];
    if (!file) return;

    argSetMsg('—', 'info', 'argCardMsg');

    const formData = new FormData();
    formData.append('card', file);

    try {
        const res  = await fetch(BACKEND_URL + '/card/upload', {
            method: 'POST', credentials: 'include', body: formData,
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('baw_username', data.username);
            argSetMsg('', 'success', 'argCardMsg');
            setTimeout(() => argFadeOutAndProceed('argCardPrompt'), 1000);
        } else {
            argSetMsg('—', 'error', 'argCardMsg');
        }
    } catch (e) {
        argSetMsg('—', 'error', 'argCardMsg');
    }
    input.value = '';
}

// ── Download card ──
async function argDownloadCard() {
    try {
        const res = await fetch(`${BACKEND_URL}/card/download?t=${Date.now()}`, {
            method: 'GET', credentials: 'include',
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'bawsome_card';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
}

// ── Fade out prompt and draw pin lines ──
function argFadeOutAndProceed(promptId) {
    const prompt = document.getElementById(promptId);
    if (prompt) {
        prompt.classList.remove('visible');
        prompt.classList.add('fading');
    }
    setTimeout(() => {
        if (window.startPinLines) window.startPinLines();
        if (prompt) prompt.style.display = 'none';
    }, 1200);
}

// ── Message helper ──
function argSetMsg(text, type, elId) {
    const el = document.getElementById(elId || 'argRegMsg');
    if (!el) return;
    el.textContent = text;
    el.className   = 'arg-minimal-msg ' + type;
}
