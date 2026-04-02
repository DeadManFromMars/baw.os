// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RADIO SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let playlist = [];
let currentTrack = 0;
let radioPlaying = false;

fetch('playlist.json')
    .then(r => r.json())
    .then(data => {
        playlist = data;
        console.log('playlist loaded:', playlist);
    })
    .catch(() => console.warn('playlist.json not found'));

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateRadioUI() {
    const track = playlist[currentTrack];

    // Update title and artist
    document.getElementById('radioTitle').textContent = track.title;
    document.getElementById('radioArtist').textContent = track.artist;

    // Check if marquee is needed
    const marquee = document.getElementById('radioTitle');
    const wrap = marquee.parentElement;
    if (marquee.scrollWidth <= wrap.clientWidth) {
        marquee.classList.add('fits');
    } else {
        marquee.classList.remove('fits');
    }

    // Update play/pause button
    document.getElementById('radioPlayBtn').innerHTML = radioPlaying ? '&#9646;&#9646;' : '&#9654;';
}

function updateRadioProgress() {
    if (!music || !music.duration) return;
    const pct = (music.currentTime / music.duration) * 100;
    document.getElementById('radioFill').style.width = pct + '%';
    document.getElementById('radioCurrent').textContent = formatTime(music.currentTime);
    document.getElementById('radioDuration').textContent = formatTime(music.duration);
}

function startMusic() {
    if (!music || radioPlaying) return;
    loadTrack(currentTrack);
    music.play();
    radioPlaying = true;
    updateRadioUI();

    // Show radio widget
    document.getElementById('radioWidget').classList.add('visible');
}

function loadTrack(idx) {
    currentTrack = idx;
    music.src = playlist[currentTrack].src;
    music.volume = document.getElementById('radioVolume').value / 100;
    music.load();
    updateRadioUI();
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
    if (music.paused) {
        music.play();
        radioPlaying = true;
    } else {
        music.pause();
        radioPlaying = false;
    }
    updateRadioUI();
}

function setVolume(val) {
    if (!music) return;
    music.volume = Math.max(0, Math.min(1, val));
}

// Update progress bar every second
setInterval(updateRadioProgress, 500);

// Auto advance when track ends
music.addEventListener('ended', nextTrack);

// Click on progress bar to seek
document.querySelector('.radio-progress-bar').addEventListener('click', e => {
    if (!music || !music.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    music.currentTime = pct * music.duration;
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
        widget.style.transition = 'opacity 1.5s ease'; // keep fade, remove position transition
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
// All positions are % of screen unless noted
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CONFIG = {

    // ── Globe & Wordmark ──
    globeX: 32,    // horizontal position — 50 = center, lower = more left
    globeY: 50,    // vertical position   — 50 = center
    globeSize: 0.35,  // size multiplier — 1 = default, 0.7 = smaller, 1.3 = bigger
    globeSpeed: 0.1,  // spin speed — default 0.1

    // ── Scan Lines ──
    scanLinesHeight: 'calc(100vh - 200px)', // tall enough to avoid clipping
    scanLinesLeftPadding: '8vw',                 // indent from left edge — increase to push right
    scanLinesMaxVisible: 40,                    // max rows on screen at once — increase to show more rows
    scanLinesFontScale: 3,                     // overall text size multiplier — 1 = default, 1.5 = bigger

    // ── Progress Bar ──
    progressBarLeft: '20vw',  // distance from left edge
    progressBarRight: '20vw',  // distance from right edge
    progressHideDelay: 2000,   // ms after 100% before bar fades out
    progressBarBottom: 10,   // px from bottom of screen — increase to move up, decrease to move down
    progressBarHeight: 4,      // px — thickness of the bar itself
    progressBarFontSize: '0.88rem', // size of the label text below

    // ── Drawn Box (right-side typewriter panel) ──
    drawnBoxLeft: 62,  // % from left edge of screen
    drawnBoxTop: 18,  // % from top of screen


};

// Apply CONFIG values to DOM — runs immediately since script is at bottom of body
const wrap = document.querySelector('.scan-lines-wrap');
if (wrap) {
    wrap.style.paddingLeft = CONFIG.scanLinesLeftPadding;
}

const progress = document.querySelector('.scan-progress');
if (progress) progress.style.bottom = CONFIG.progressBarBottom + 'px';

const progressTrack = document.querySelector('.progress-track');
if (progressTrack) progressTrack.style.height = CONFIG.progressBarHeight + 'px';

const progressMeta = document.querySelector('.progress-meta');
if (progressMeta) progressMeta.style.fontSize = CONFIG.progressBarFontSize;


let conductorReady = false; // true once the globe moment is finished




// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBE
// Renders a spinning wireframe dot-globe on #globeCanvas
// Position and size are driven by CONFIG above
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBE
// Renders a spinning wireframe dot-globe on #globeCanvas
// Position and size are driven by CONFIG above
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
        // Each pin is a fixed lat/lon on the globe surface
        // The line grows out from the pin's screen position to a fixed box position
        // Quadrants ensure pins are evenly spread across the globe

        const PIN_COUNT = 4; // start with 1, increase to 4 later

        // Box anchor positions — where the card sits on screen (% of screen)
        // Add more entries when you add more pins
        const boxAnchors = [
            { x: 0.18, y: 0.78 }, // bottom left
            { x: 0.18, y: 0.22 }, // top left
            { x: 0.82, y: 0.22 }, // top right
            { x: 0.82, y: 0.78 }, // bottom right
        ];

        // Pick one random lat/lon per quadrant
        function pickPins(count) {
            const quadrants = [
                { latMin: 0.1, latMax: Math.PI / 2, lonMin: 0, lonMax: Math.PI }, // top left
                { latMin: 0.1, latMax: Math.PI / 2, lonMin: Math.PI, lonMax: Math.PI * 2 }, // top right
                { latMin: Math.PI / 2, latMax: Math.PI * 0.9, lonMin: 0, lonMax: Math.PI }, // bottom left
                { latMin: Math.PI / 2, latMax: Math.PI * 0.9, lonMin: Math.PI, lonMax: Math.PI * 2 }, // bottom right
            ];

            return quadrants.slice(0, count).map((q, i) => ({
                lat: q.latMin + Math.random() * (q.latMax - q.latMin),
                lon: q.lonMin + Math.random() * (q.lonMax - q.lonMin),
                boxX: boxAnchors[i].x * window.innerWidth,
                boxY: boxAnchors[i].y * window.innerHeight,
                boxW: 220,
                boxH: 160,
                lineEl: null, // SVG line element
                boxEl: null, // SVG rect element
                visible: false,
                progress: 0,    // 0 = line not drawn, 1 = fully drawn
            }));
        }

        const pins = pickPins(PIN_COUNT);

        // Create SVG elements for each pin
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

        // Project a lat/lon point through the current globe rotation to screen coords
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
            return {
                x: cx + x3 * perspective,
                y: cy + y3 * perspective,
                z: z2, // depth — positive = front
            };
        }

        // Trigger pin lines to draw out — call this from triggerDissolve
        window.startPinLines = () => {
            pins.forEach(pin => { pin.visible = true; });
        };

        let pinsActive = false;

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

                // Grow progress from 0 to 1 over 1.2 seconds
                pin.progress = Math.min(pin.progress + 0.007, 1);

                const proj = projectPin(
                    pin.lat, pin.lon,
                    cx, cy, radius,
                    spinY, cosX, sinX, cosZ, sinZ
                );

                // Interpolate line from pin toward box based on progress
                const endX = pin.boxX;
                const endY = pin.boxY;
                const curEndX = proj.x + (endX - proj.x) * pin.progress;
                const curEndY = proj.y + (endY - proj.y) * pin.progress;

                pin.lineEl.setAttribute('x1', proj.x + 0.75);
                pin.lineEl.setAttribute('y1', proj.y + 0.75);
                pin.lineEl.setAttribute('x2', curEndX);
                pin.lineEl.setAttribute('y2', curEndY);
                pin.lineEl.setAttribute('opacity', '1');

                // Show box only when line is fully drawn
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
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ACCESS_CODE = 'bawsome';   // password to reach stage2
const REDIRECT_URL = 'stage2.html';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOT CANVAS
// Subtle drifting dots in the background
// They nudge slightly toward the mouse position
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const dotCanvas = document.getElementById('dotCanvas');
const dotCtx = dotCanvas.getContext('2d');

let W = 0, H = 0; // canvas dimensions, updated on resize

function resizeDotCanvas() {
    W = dotCanvas.width = window.innerWidth;
    H = dotCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeDotCanvas);
resizeDotCanvas();

// Generate 65 dots with random position, size, speed, and depth
const dots = [];
for (let i = 0; i < 65; i++) {
    dots.push({
        x: Math.random(),                          // normalized position (0–1)
        y: Math.random(),
        r: Math.random() * 1.3 + 0.3,             // radius in px
        vx: (Math.random() - 0.5) * 0.00007,       // drift speed X
        vy: (Math.random() - 0.5) * 0.00007,       // drift speed Y
        d: Math.random(),                          // depth — affects parallax & opacity
    });
}

// Smoothed mouse position (normalized 0–1)
let mouseX = 0.5, mouseY = 0.5;
let targetMouseX = 0.5, targetMouseY = 0.5;

document.addEventListener('mousemove', e => {
    targetMouseX = e.clientX / W;
    targetMouseY = e.clientY / H;

    // Tilt the login card slightly toward the cursor
    const card = document.getElementById('loginCard');
    const loginPhase = document.getElementById('loginPhase');
    if (card && loginPhase.classList.contains('visible')) {
        const dx = targetMouseX - 0.5;
        const dy = targetMouseY - 0.5;
        card.style.transform = `perspective(900px) rotateX(${-dy * 3}deg) rotateY(${dx * 3}deg)`;
    }
});

function drawDots() {
    // Ease mouse toward target for smooth parallax
    mouseX += (targetMouseX - mouseX) * 0.04;
    mouseY += (targetMouseY - mouseY) * 0.04;

    dotCtx.clearRect(0, 0, W, H);

    dots.forEach(dot => {
        // Advance position, wrap around edges
        dot.x = (dot.x + dot.vx + 1) % 1;
        dot.y = (dot.y + dot.vy + 1) % 1;

        // Offset by mouse position scaled by depth (deeper dots move less)
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
// Gathers browser/device/network info and IP geolocation
// All values stored in dataReady{} via setData()
// The scan lines read from this object as values arrive
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const dataReady = {};
const setData = (id, val) => { dataReady[id] = val; };

// IP + geolocation — fetched async, fallback on failure
fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(d => {
        setData('ip', d.ip);
        return fetch(`https://ipapi.co/${d.ip}/json/`);
    })
    .then(r => r.json())
    .then(d => {
        setData('loc', [d.city, d.country_name].filter(Boolean).join(', ') || 'Unknown');
        setData('isp', d.org || 'Unknown');
        setData('postal', d.postal || 'Unknown');
        setData('asn', d.asn || 'Unknown');
        setData('region', d.region || 'Unknown');
        setData('currency', d.currency || 'Unknown');
        setData('calling', d.country_calling_code || 'Unknown');
        setData('country_area', d.country_area
            ? d.country_area.toLocaleString() + ' km²'
            : 'Unknown');
        setData('country_pop', d.country_population
            ? Number(d.country_population).toLocaleString()
            : 'Unknown');
    })
    .catch(() => {
        // If IP lookup fails, fill all geo keys with fallbacks immediately
        // so the scan lines don't hang waiting for data that will never arrive
        ['ip', 'loc', 'isp', 'postal', 'asn', 'region',
            'currency', 'calling', 'country_area', 'country_pop']
            .forEach(k => setData(k, k === 'ip' ? 'Masked / VPN' : '—'));
    });

// Timezone
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const tzOffset = -new Date().getTimezoneOffset();
const tzSign = tzOffset >= 0 ? '+' : '';
const tzHours = Math.floor(Math.abs(tzOffset) / 60);
setData('tz', `${tz.split('/').pop().replace(/_/g, ' ')} (UTC${tzSign}${tzHours})`);

// Browser & OS detection from user agent
const ua = navigator.userAgent;
const browser = ua.includes('Edg') ? 'Edge'
    : ua.includes('Chrome') ? 'Chrome'
        : ua.includes('Firefox') ? 'Firefox'
            : ua.includes('Safari') ? 'Safari'
                : 'Unknown';
const os = ua.includes('Win') ? 'Windows'
    : ua.includes('Mac') ? 'macOS'
        : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS'
            : ua.includes('Android') ? 'Android'
                : ua.includes('Linux') ? 'Linux'
                    : 'Unknown';

// Network info
const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

// Device & browser data
setData('locale', navigator.language || 'Unknown');
setData('langs', (navigator.languages || [navigator.language]).slice(0, 4).join(', '));
setData('dev', `${browser} / ${os}`);
setData('platform', navigator.platform || 'Unknown');
setData('cores', navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency + ' logical cores' : 'Unknown');
setData('mem', navigator.deviceMemory
    ? navigator.deviceMemory + ' GB RAM' : 'Unknown');
setData('conn', conn
    ? (conn.effectiveType || '?').toUpperCase() + (conn.downlink ? ' — ' + conn.downlink + ' Mbps' : '')
    : 'Unknown');
setData('rtt', conn?.rtt !== undefined ? conn.rtt + ' ms RTT' : 'Unknown');
setData('disp', `${screen.width} × ${screen.height}`);
setData('dpr', window.devicePixelRatio ? window.devicePixelRatio + 'x DPR' : 'Unknown');
setData('depth', screen.colorDepth ? screen.colorDepth + '-bit color' : 'Unknown');
setData('orient', screen.orientation?.type || 'Unknown');
setData('touch', navigator.maxTouchPoints > 0
    ? `Yes — ${navigator.maxTouchPoints} pts` : 'None');
setData('cookies', navigator.cookieEnabled ? 'Enabled' : 'Disabled');
setData('plugins', navigator.plugins?.length
    ? navigator.plugins.length + ' detected' : '0 detected');
setData('storage', typeof localStorage !== 'undefined' ? 'Available' : 'Blocked');
setData('webgl', (() => {
    try { return document.createElement('canvas').getContext('webgl') ? 'Supported' : 'Unsupported'; }
    catch { return 'Unavailable'; }
})());
setData('ua', navigator.userAgent.slice(0, 52) + '...');
setData('ref', document.referrer || 'Direct');
setData('session', 'BSI-' + Math.random().toString(36).substr(2, 8).toUpperCase());
setData('time', new Date().toISOString());
setData('viewport', `${window.innerWidth} × ${window.innerHeight}`);
setData('history_len', history.length + ' pages');
setData('online', navigator.onLine ? 'Online' : 'Offline');

// The orphaned line — this one gets flagged red during the scan
setData('route_depth', 'orphaned');

// Fake dramatic data — displayed during the scan for atmosphere
const fakeData = {
    fake1: 'NULL', fake2: 'UNREGISTERED', fake3: 'NOT FOUND',
    fake4: 'MISMATCH', fake5: 'FLAGGED', fake6: 'DRIFTING',
    fake7: 'EXPIRED', fake8: 'UNKNOWN', fake9: 'PARTIAL',
    fake10: '0.34', fake11: 'INACTIVE', fake12: 'CLASSIFIED',
    fake13: 'SEVERED', fake14: '7.4 / 10', fake15: 'DEGRADED',
    fake16: '72h', fake17: '0.91', fake18: 'DETECTED',
    fake19: '0x4F3A', fake20: 'NULL', fake21: 'REVOKED',
    fake22: 'IMMINENT', fake23: 'DEEP', fake24: 'ACTIVE',
    fake25: 'LOST',
};
Object.entries(fakeData).forEach(([k, v]) => setData(k, v));

// Battery — async, so set fallback first then update if available
setData('bat', 'Unavailable');
setData('charging', 'Unknown');
if (navigator.getBattery) {
    navigator.getBattery()
        .then(b => {
            setData('bat', Math.round(b.level * 100) + '% ' + (b.charging ? '(Charging)' : '(On Battery)'));
            setData('charging', b.charging ? 'Yes' : 'No');
        })
        .catch(() => { }); // fallbacks already set above
}

// Set the session ID in the login card footer
document.getElementById('sessionId').textContent = dataReady['session'] || 'BSI-——';


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCAN DEFINITIONS
// Each entry is one row in the scan sequence
// s = size class (0 = biggest, 5 = smallest/most faded)
// wait = ms to wait before showing the value
// pause = ms to wait before starting the next row
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXTRA SCAN KEYS
// These are the filler rows that keep scrolling after
// the real data rows finish — pure atmosphere
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROGRESS BAR LABELS
// One label per completed scan row — shown below the bar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
// These variables track where we are in the sequence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const totalDefinedRows = scanDefs.length; // total real data rows (not filler)
const MAX_VISIBLE = 28;              // max rows visible at once before oldest is removed
const scanContainer = document.getElementById('scanLines');

let rowIndex = 0;     // current row being generated
let completedRows = 0;     // how many real rows have resolved
let typewriterTriggered = false; // true once the conductor sequence starts
let dissolveTriggered = false;  // true once the page starts dissolving
let scanPaused = false;  // true during VHS freeze
let orphanedLineEl = null;   // reference to the flagged red row


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROGRESS BAR
// Updates fill width, label, and percentage
// Auto-hides after reaching 100%
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateProgress(n) {
    try {
        const pct = Math.min(Math.round(n / totalDefinedRows * 100), 100);

        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressPct').textContent = pct + '%';
        document.getElementById('progressLabel').textContent =
            progressLabels[Math.min(n, progressLabels.length - 1)] || 'Deep scanning';

        // Fade out the whole progress bar after hitting 100%
        if (pct >= 100) {
            setTimeout(() => {
                const bar = document.querySelector('.scan-progress');
                if (bar) bar.style.opacity = '0';
            }, CONFIG.progressHideDelay);
        }
    } catch (e) { }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SMALL DOM HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Creates the animated ... waiting indicator
function makeEllipsis() {
    const el = document.createElement('span');
    el.className = 'ellipsis';
    el.innerHTML = '<span></span><span></span><span></span>';
    return el;
}

// Returns a random fake value for atmosphere rows
function fakeVal() {
    const generators = [
        () => Math.random().toString(16).slice(2, 10).toUpperCase(),
        () => ['NULL', 'UNREGISTERED', 'NOT FOUND', 'FLAGGED', 'CLASSIFIED',
            'EXPIRED', 'DRIFTING', 'PARTIAL', 'INACTIVE', 'SEVERED',
            'DEGRADED', 'MISMATCH'][Math.floor(Math.random() * 12)],
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
// Adds one row at a time to the scan list
// Waits for its data to be ready, then fills in the value
// Triggers the conductor sequence halfway through
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function revealNextRow() {
    try {
        if (dissolveTriggered || scanPaused) return;

        // Stop generating filler rows once the conductor has started
        if (scanPaused || dissolveTriggered) return;

        // Decide if this is a real data row or a filler row
        let def, isExtra = false;
        if (rowIndex < scanDefs.length) {
            def = scanDefs[rowIndex];
        } else {
            isExtra = true;
            const key = extraKeys[(rowIndex - scanDefs.length) % extraKeys.length];
            def = { key, id: null, s: 5, wait: 6, pause: 2 };
        }
        rowIndex++;

        // Build the row element
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
        // Remove oldest row when we have too many — creates continuous scroll illusion
        while (scanContainer.children.length > CONFIG.scanLinesMaxVisible) { 
            scanContainer.removeChild(scanContainer.firstChild);
        }

        // Animate row in (double rAF ensures the transition fires)
        requestAnimationFrame(() => requestAnimationFrame(() => line.classList.add('active')));

        // Wait for data then populate the value
        const startTime = Date.now();
        const hardMax = Math.max(def.wait, 4000); // never wait more than 4s regardless

        function tryPopulate() {
            if (dissolveTriggered || scanPaused) return;

            const val = isExtra ? fakeVal() : dataReady[def.id];
            const elapsed = Date.now() - startTime;
            const ready = (val !== undefined && elapsed >= def.wait) || elapsed >= hardMax;

            if (!isExtra && !ready) {
                setTimeout(tryPopulate, 40);
                return;
            }

            const displayVal = isExtra ? fakeVal() : (val ?? '—');
            valEl.textContent = displayVal;
            valEl.classList.remove('pending');
            line.classList.add('done');

            if (def.id === 'route_depth') {
                line.classList.add('orphaned');
                orphanedLineEl = line;
            }

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
    parts.forEach(p => {
        t += p.delay;
        setTimeout(() => cursor.insertAdjacentText('beforebegin', p.text), t);
    });
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
        // Animates a hand sliding in from the right, drawing
        // the typewriter box by dragging its corner
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        function handDragBox(onDone) {
            const hand = document.getElementById('handImg');
            const box = document.getElementById('drawnBox');

            // Where the box starts (top-left corner) and ends (bottom-right corner)
            // Adjust these to reposition the typewriter box on screen
            const boxStartX = W * CONFIG.drawnBoxLeft / 100;
            const boxStartY = H * CONFIG.drawnBoxTop / 100;
            const boxEndX = W * 0.97;
            const boxEndY = H * 0.72;

            // How far the hand tip is from the hand image's top-left corner
            const tipX = 36, tipY = 76;

            // Position box at starting corner, invisible and collapsed
            Object.assign(box.style, {
                position: 'fixed',
                left: boxStartX + 'px',
                top: boxStartY + 'px',
                width: '0px',
                height: '0px',
                opacity: '0',
                zIndex: '50',
            });

            // Position hand off screen right, level with the box top
            Object.assign(hand.style, {
                position: 'fixed',
                left: (W + 20) + 'px',
                top: (boxStartY - tipY) + 'px',
                opacity: '0',
                transition: 'opacity 0.5s ease',
                zIndex: '201',
            });

            setTimeout(() => {
                // Fade hand in then slide it to the box start corner
                hand.style.opacity = '0.9';
                animXY(hand, W + 20, boxStartY - tipY, boxStartX - tipX, boxStartY - tipY, 950, 'out', () => {

                    setTimeout(() => {
                        box.style.opacity = '1';

                        // Drag the box corner from start to end — hand follows
                        const dragDur = 1200;
                        const dragStart = performance.now();

                        function dragFrame(now) {
                            let t = Math.min((now - dragStart) / dragDur, 1);
                            // ease inout
                            t = t < 0.5
                                ? 4 * t * t * t
                                : 1 - Math.pow(-2 * t + 2, 3) / 2;

                            const cx = boxStartX + (boxEndX - boxStartX) * t;
                            const cy = boxStartY + (boxEndY - boxStartY) * t;

                            box.style.width = (cx - boxStartX) + 'px';
                            box.style.height = (cy - boxStartY) + 'px';
                            hand.style.left = (cx - tipX) + 'px';
                            hand.style.top = (cy - tipY) + 'px';

                            if (t < 1) {
                                requestAnimationFrame(dragFrame);
                            } else {
                                // Snap to final size then slide hand off screen
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
        // Replays all collected data scrolling upward, fast then
        // slowing to a stop on the orphaned route_depth line
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        function doReverse(onDone) {
            const container = document.getElementById('scanLines');
            const wrap = document.getElementById('scanLinesWrap');

            // Reset wrap back to normal left-panel flow
            Object.assign(wrap.style, {
                position: '',
                top: '',
                left: '',
                width: '',
                height: 'calc(100vh - 140px)',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '0 0 20px',
            });

            container.innerHTML = '';
            container.style.gap = '3px';
            container.style.transform = '';
            container.style.transition = '';

            // Clean up any leftover orphan overlay from a previous run
            document.getElementById('orphanOverlay')?.remove();

            // All data to replay — shown scrolling upward during reverse
            // Order matters: last item shown = last to scroll = most prominent
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

            // Speed readouts shown in terminal as the reverse slows down
            const speedSteps = [1.0, 0.88, 0.74, 0.61, 0.49, 0.38, 0.28, 0.20, 0.13, 0.08, 0.04, 0.01, 0.00];
            let lastSpeedIdx = 0;

            // Builds one row element for the reverse scroll
            // progress 0–1 controls size and opacity (rows get bigger/brighter as they slow)
            function makeRow(key, val, isOrphan, progress) {
                const fontSize = isOrphan ? 1.35 : (0.3 + progress * 1.1);
                const keySize = isOrphan ? 0.68 : (0.24 + progress * 0.32);
                const opacity = isOrphan ? 1 : Math.max(0.15 + progress * 0.85, 0.15);

                // Random left nudge for chaos — orphan stays fixed at config indent
                const xNudge = isOrphan ? 0 : (Math.random() * 8);

                const line = document.createElement('div');
                Object.assign(line.style, {
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '14px',
                    paddingLeft: isOrphan
                        ? CONFIG.scanLinesLeftPadding
                        : `calc(${CONFIG.scanLinesLeftPadding} + ${xNudge}vw)`,
                    paddingRight: '2vw',
                    paddingTop: isOrphan ? '6px' : '1px',
                    paddingBottom: isOrphan ? '6px' : '1px',
                    whiteSpace: 'nowrap',
                    overflow: 'visible',
                    flexShrink: '0',
                    opacity: opacity,
                });

                if (isOrphan) {
                    line.style.background = 'rgba(232,55,42,0.06)';
                    line.style.width = '100%';
                }

                const keyEl = document.createElement('span');
                Object.assign(keyEl.style, {
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: keySize + 'rem',
                    letterSpacing: '0.15em',
                    color: isOrphan ? 'var(--red)' : 'var(--muted)',
                    textTransform: 'uppercase',
                    fontWeight: '500',
                    minWidth: '90px',
                    flexShrink: '0',
                });
                keyEl.textContent = key;

                const valEl = document.createElement('span');
                Object.assign(valEl.style, {
                    fontFamily: "'Space Mono', monospace",
                    fontSize: fontSize + 'rem',
                    color: isOrphan ? 'var(--red)' : 'var(--ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                });
                if (isOrphan) {
                    valEl.style.borderLeft = '3px solid var(--red)';
                    valEl.style.paddingLeft = '10px';
                }
                valEl.textContent = val;

                line.append(keyEl, valEl);
                return { line, keyEl, valEl };
            }

            function addRow() {
                if (idx >= total) {
                    addOrphanRow();
                    return;
                }

                const [key, val] = rewindData[idx];
                const progress = idx / total;
                const { line } = makeRow(key, val, false, progress);

                container.appendChild(line);

                // Keep only the most recent 18 rows visible
                while (container.children.length > 18) {
                    container.removeChild(container.firstChild);
                }

                idx++;

                // Update speed display in terminal as we decelerate
                const speedIdx = Math.floor(progress * speedSteps.length);
                if (speedIdx > lastSpeedIdx) {
                    lastSpeedIdx = speedIdx;
                    termShowSpeed(speedSteps[Math.min(speedIdx, speedSteps.length - 1)].toFixed(2) + 'x');
                }

                // Rewind the progress bar from 100% down toward 45%
                const pct = Math.round(100 - progress * 55);
                document.getElementById('progressFill').style.width = pct + '%';
                document.getElementById('progressLabel').textContent = 'REVERSING';

                // Interval starts fast (25ms) and slows to nearly 1 second — cubic ease
                const interval = 25 + Math.pow(progress, 3) * 975;
                setTimeout(addRow, interval);
            }

            function addOrphanRow() {
                // Trim down so the orphan row is clearly visible at the bottom
                while (container.children.length > 7) {
                    container.removeChild(container.firstChild);
                }

                const { line, keyEl, valEl } = makeRow('route_depth', 'orphaned', true, 1);
                container.appendChild(line);

                // Store references so handFixLine can modify the row later
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
        // Flipped hand slides in from the left and "fixes"
        // the orphaned line by retyping its value in green
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handFixLine(targetLine, onDone) {
    const hand = document.getElementById('handImgFlipped');
    const lineRect = targetLine.getBoundingClientRect();
    const valEl = targetLine._valEl
        || targetLine.querySelector('.scan-line-val')
        || targetLine.querySelector('div:last-child');

    const tipX = 36, tipY = 76;
    const targetX = lineRect.left + 120 - tipX;
    const targetY = lineRect.top + lineRect.height / 2 - tipY;

    Object.assign(hand.style, {
        position: 'fixed',
        left: '-180px',
        top: targetY + 'px',
        opacity: '0',
        transition: 'opacity 0.4s ease',
        zIndex: '201',
    });

    setTimeout(() => {
        hand.style.opacity = '0.85';

        animXY(hand, -180, targetY, targetX, targetY, 900, 'out', () => {
            setTimeout(() => {

                let text = valEl.textContent;
                const deleteInterval = setInterval(() => {
                    if (text.length > 0) {
                        text = text.slice(0, -1);
                        valEl.textContent = text;
                    } else {
                        clearInterval(deleteInterval);
                        targetLine.classList.remove('orphaned');

                        const newVal = 'resolved';
                        let i = 0;
                        const typeInterval = setInterval(() => {
                            if (i < newVal.length) {
                                valEl.textContent += newVal[i++];
                            } else {
                                clearInterval(typeInterval);

                                Object.assign(valEl.style, {
                                    color: 'var(--green)',
                                    borderLeftColor: 'var(--green)',
                                    background: 'rgba(0, 200, 83, 0.08)',
                                });

                                const keyEl = targetLine._keyEl
                                    || targetLine.querySelector('div:first-child');
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
                                                            if (!orphanedLineEl) {
                                                                setTimeout(triggerDissolve, 2000);
                                                                return;
                                                            }

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
                                                                                                setTimeout(() => {
                                                                                                    cursor3.remove();
                                                                                                    setTimeout(triggerDissolve, 1800);
                                                                                                }, 2400);
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

    // Type closing command then slide terminal back down
    termType('terminate()', 'session closed', 65, () => {
        setTimeout(() => {
            document.getElementById('termBar').classList.remove('visible');
        }, 600);
    });

    // Fade out foreground elements
    [
        document.querySelector('.scan-left'),
        document.querySelector('.scan-right'),
        document.getElementById('drawnBox'),
    ].forEach(el => {
        if (!el) return;
        el.style.transition = 'opacity 2s ease';
        el.style.opacity = '0';
    });

    // Step 1 — move wordmark and globe to center together
    setTimeout(() => {
        const header = document.querySelector('.scan-header');
        if (header) {
            header.style.left = '50%';
            header.style.top = '50%';
        }
        window.startGlobeMove(50, 50);
    }, 500); // wait for fade to start

    // Step 2 — lift wordmark up after globe and wordmark reach center
    setTimeout(() => {
        const header = document.querySelector('.scan-header');
        if (header) {
            header.style.top = '12%'; // adjust freely — lower % = higher on screen
        }
    }, 3100); // 500 fade + 2000 move + 600 buffer

    // Step 3 — draw pin lines after wordmark finishes lifting
    setTimeout(() => {
        if (window.startPinLines) window.startPinLines();
    }, 5500); // 3100 + 2000 lift + 400 buffer
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOGIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

function attemptLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();


    // DEV SHORTCUT — remove before launch!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    if (password.toLowerCase() === 'wawamangosmoothie') {
        document.getElementById('loginPhase').style.display = 'none';
        const scanPhase = document.getElementById('scanPhase');
        scanPhase.style.display = 'flex';
        scanPhase.style.opacity = '1';
        conductorReady = true;
        triggerDissolve();
        return;
    }

    if (!username) {
        showMsg('Employee ID is required.', 'error');
        return;
    }

    if (password.toLowerCase() === ACCESS_CODE) {
        showMsg('Verified — establishing secure session...', 'success');
        document.getElementById('loginProgress').classList.add('show');
        setTimeout(() => document.getElementById('loginBar').style.width = '100%', 50);

        setTimeout(() => {
            // Fade out login card
            document.getElementById('loginPhase').style.transition = 'opacity 1.5s ease';
            document.getElementById('loginPhase').style.opacity = '0';

            setTimeout(() => {
                // Hide login entirely
                document.getElementById('loginPhase').style.display = 'none';

                // Show scan phase but with everything invisible except globe + wordmark
                const scanPhase = document.getElementById('scanPhase');
                scanPhase.style.display = 'flex';
                scanPhase.style.opacity = '0';
                scanPhase.style.transition = 'opacity 2s ease';

                // Hide scan lines and progress bar during globe moment
                document.querySelector('.scan-lines-wrap').style.opacity = '0';
                document.querySelector('.scan-progress').style.opacity = '0';
                document.querySelector('.scan-right').style.opacity = '0';

                // Fade in the globe + wordmark only
                setTimeout(() => {
                    scanPhase.style.opacity = '1';
                }, 100);

                // After globe moment — fade in scan lines and start rows
                setTimeout(() => {
                    document.querySelector('.scan-lines-wrap').style.transition = 'opacity 1.5s ease';
                    document.querySelector('.scan-progress').style.transition = 'opacity 1.5s ease';
                    document.querySelector('.scan-lines-wrap').style.opacity = '1';
                    document.querySelector('.scan-progress').style.opacity = '1';
                    document.querySelector('.scan-right').style.opacity = '1';

                    conductorReady = true;

                    // Start scan rows
                    setTimeout(revealNextRow, 800);
                }, 3000); // how long globe is shown alone — adjust freely

            }, 1500); // wait for login fade out
        }, 1600);  // wait for progress bar
    }
}

function showMsg(text, type) {
    const el = document.getElementById('msg');
    el.textContent = text;
    el.className = type;
}


