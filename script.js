const music = document.getElementById("bgMusic");

function startMusic() {
    music.volume = 0.3; // 0.0 to 1.0
    music.play();
}

(() => {
    window.addEventListener("DOMContentLoaded", () => {
        console.log("globe running");

        const canvas = document.getElementById("globeCanvas");
        if (!canvas) {
            console.log("canvas not found");
            return;
        }

        const ctx = canvas.getContext("2d");

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const config = {
            rotSpeedY: 0.25,
            rotSpeedX: 0,
            rotSpeedZ: 0,

            speed: 0.1,   // 🔥 master rotation speed

            tiltX: 0,
            tiltY: 0,
            tiltZ: 10

        };

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            const time = Date.now() * 0.001;

            const radius = 180;

            const rotY = time * config.speed;
            const rotX = config.tiltX;
            const rotZ = config.tiltZ;

            const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
            const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

            for (let lat = 0; lat < Math.PI; lat += 0.2) {
                for (let lon = 0; lon < Math.PI * 2; lon += 0.2) {

                    // sphere
                    let x = radius * Math.sin(lat) * Math.cos(lon);
                    let y = radius * Math.cos(lat);
                    let z = radius * Math.sin(lat) * Math.sin(lon);

                    // Y rotation (spin)
                    let x1 = x * Math.cos(rotY) - z * Math.sin(rotY);
                    let z1 = x * Math.sin(rotY) + z * Math.cos(rotY);

                    // X tilt
                    let y2 = y * cosX - z1 * sinX;
                    let z2 = y * sinX + z1 * cosX;

                    // Z rotation (roll)
                    let x3 = x1 * cosZ - y2 * sinZ;
                    let y3 = x1 * sinZ + y2 * cosZ;

                    // perspective
                    const scale = 300 / (300 + z2);

                    const screenX = cx + x3 * scale;
                    const screenY = cy + y3 * scale;

                    ctx.fillStyle = "rgba(255,0,0,0.8)";
                    ctx.fillRect(screenX, screenY, 2, 2);
                }
            }

            requestAnimationFrame(draw);
        }

        draw();
    });
})();




const ACCESS_CODE = 'bawsome';
const REDIRECT_URL = 'stage2.html';

// ── DOT CANVAS ──
const canvas = document.getElementById('dotCanvas');
const ctx = canvas.getContext('2d');
let W, H;
function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
resize(); window.addEventListener('resize', resize);
const dots = Array.from({ length: 65 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3, vx: (Math.random() - 0.5) * 0.00007, vy: (Math.random() - 0.5) * 0.00007, d: Math.random() }));
let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;
document.addEventListener('mousemove', e => { tmx = e.clientX / W; tmy = e.clientY / H; });
function drawDots() {
    mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;
    ctx.clearRect(0, 0, W, H);
    dots.forEach(d => {
        d.x = (d.x + d.vx + 1) % 1; d.y = (d.y + d.vy + 1) % 1;
        const px = (d.x + (mx - 0.5) * 0.05 * d.d) % 1, py = (d.y + (my - 0.5) * 0.04 * d.d) % 1;
        ctx.beginPath(); ctx.arc(px * W, py * H, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(26,26,24,${0.2 + d.d * 0.3})`; ctx.fill();
    });
    requestAnimationFrame(drawDots);
}
drawDots();
document.addEventListener('mousemove', e => {
    const dx = e.clientX / W - 0.5, dy = e.clientY / H - 0.5;
    const card = document.getElementById('loginCard');
    if (card && document.getElementById('loginPhase').classList.contains('visible'))
        card.style.transform = `perspective(900px) rotateX(${-dy * 3}deg) rotateY(${dx * 3}deg)`;
});

// ── DATA ──
const dataReady = {};
function setData(id, val) { dataReady[id] = val; }
fetch('https://api.ipify.org?format=json')
    .then(r => r.json()).then(d => { setData('ip', d.ip); return fetch(`https://ipapi.co/${d.ip}/json/`); })
    .then(r => r.json()).then(d => {
        setData('loc', [d.city, d.country_name].filter(Boolean).join(', ') || 'Unknown');
        setData('isp', d.org || 'Unknown'); setData('postal', d.postal || 'Unknown');
        setData('asn', d.asn || 'Unknown'); setData('region', d.region || 'Unknown');
        setData('currency', d.currency || 'Unknown'); setData('calling', d.country_calling_code || 'Unknown');
        setData('country_area', d.country_area ? d.country_area.toLocaleString() + ' km²' : 'Unknown');
        setData('country_pop', d.country_population ? Number(d.country_population).toLocaleString() : 'Unknown');
    }).catch(() => { ['ip', 'loc', 'isp', 'postal', 'asn', 'region', 'currency', 'calling', 'country_area', 'country_pop'].forEach(k => setData(k, k === 'ip' ? 'Masked / VPN' : 'Hidden')); });
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const off = -new Date().getTimezoneOffset();
const offStr = `UTC${off >= 0 ? '+' : ''}${Math.floor(Math.abs(off) / 60)}`;
const ua = navigator.userAgent;
const browser = ua.includes('Edg') ? 'Edge' : ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Unknown';
const os = ua.includes('Win') ? 'Windows' : ua.includes('Mac') ? 'macOS' : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS' : ua.includes('Android') ? 'Android' : ua.includes('Linux') ? 'Linux' : 'Unknown';
const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
setData('tz', `${tz.split('/').pop().replace(/_/g, ' ')} (${offStr})`);
setData('locale', navigator.language || 'Unknown');
setData('langs', (navigator.languages || [navigator.language]).slice(0, 4).join(', '));
setData('dev', `${browser} / ${os}`);
setData('platform', navigator.platform || 'Unknown');
setData('cores', navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' logical cores' : 'Unknown');
setData('mem', navigator.deviceMemory ? navigator.deviceMemory + ' GB RAM' : 'Unknown');
setData('conn', conn ? (conn.effectiveType || '?').toUpperCase() + (conn.downlink ? ' — ' + conn.downlink + ' Mbps' : '') : 'Unknown');
setData('rtt', (conn && conn.rtt !== undefined) ? conn.rtt + ' ms RTT' : 'Unknown');
setData('disp', `${screen.width} × ${screen.height}`);
setData('dpr', window.devicePixelRatio ? window.devicePixelRatio + 'x DPR' : 'Unknown');
setData('depth', screen.colorDepth ? screen.colorDepth + '-bit color' : 'Unknown');
setData('orient', (screen.orientation && screen.orientation.type) || 'Unknown');
setData('touch', navigator.maxTouchPoints > 0 ? `Yes — ${navigator.maxTouchPoints} pts` : 'None');
setData('cookies', navigator.cookieEnabled ? 'Enabled' : 'Disabled');
setData('plugins', navigator.plugins?.length ? navigator.plugins.length + ' detected' : '0 detected');
setData('storage', typeof localStorage !== 'undefined' ? 'Available' : 'Blocked');
setData('webgl', (() => { try { const c = document.createElement('canvas'); return c.getContext('webgl') ? 'Supported' : 'Unsupported'; } catch (e) { return 'Unavailable'; } })());
setData('ua', navigator.userAgent.slice(0, 52) + '...');
setData('ref', document.referrer || 'Direct');
setData('session', 'BSI-' + Math.random().toString(36).substr(2, 8).toUpperCase());
setData('time', new Date().toISOString());
setData('viewport', `${window.innerWidth} × ${window.innerHeight}`);
setData('history_len', history.length + ' pages');
setData('online', navigator.onLine ? 'Online' : 'Offline');
setData('route_depth', 'orphaned');
setData('fake1', 'NULL'); setData('fake2', 'UNREGISTERED'); setData('fake3', 'NOT FOUND');
setData('fake4', 'MISMATCH'); setData('fake5', 'FLAGGED'); setData('fake6', 'DRIFTING');
setData('fake7', 'EXPIRED'); setData('fake8', 'UNKNOWN'); setData('fake9', 'PARTIAL');
setData('fake10', '0.34'); setData('fake11', 'INACTIVE'); setData('fake12', 'CLASSIFIED');
setData('fake13', 'SEVERED'); setData('fake14', '7.4 / 10'); setData('fake15', 'DEGRADED');
setData('fake16', '72h'); setData('fake17', '0.91'); setData('fake18', 'DETECTED');
setData('fake19', '0x4F3A'); setData('fake20', 'NULL'); setData('fake21', 'REVOKED');
setData('fake22', 'IMMINENT'); setData('fake23', 'DEEP'); setData('fake24', 'ACTIVE');
setData('fake25', 'LOST');
if (navigator.getBattery) {
    navigator.getBattery().then(b => { setData('bat', Math.round(b.level * 100) + '% ' + (b.charging ? '(Charging)' : '(On Battery)')); setData('charging', b.charging ? 'Yes' : 'No'); }).catch(() => { setData('bat', 'Unavailable'); setData('charging', 'Unknown'); });
} else { setData('bat', 'Unavailable'); setData('charging', 'Unknown'); }
document.getElementById('sessionId').textContent = dataReady['session'] || 'BSI-——';

// ── SCAN DEFS ──
const scanDefs = [
    { key: 'IP Address', id: 'ip', s: 0, wait: 1100, pause: 900 },
    { key: 'Location', id: 'loc', s: 0, wait: 1000, pause: 820 },
    { key: 'Timezone', id: 'tz', s: 0, wait: 880, pause: 740 },
    { key: 'Device', id: 'dev', s: 0, wait: 820, pause: 680 },
    { key: 'Connection', id: 'conn', s: 0, wait: 740, pause: 620 },
    { key: 'Display', id: 'disp', s: 0, wait: 680, pause: 560 },
    { key: 'Battery', id: 'bat', s: 1, wait: 620, pause: 500 },
    { key: 'Language', id: 'langs', s: 1, wait: 560, pause: 440 },
    { key: 'Platform', id: 'platform', s: 1, wait: 500, pause: 390 },
    { key: 'Death Drive Acquisition', id: 'fake1', s: 1, wait: 440, pause: 340 },
    { key: 'Soul Index', id: 'fake2', s: 1, wait: 390, pause: 300 },
    { key: 'Consent Timestamp', id: 'fake3', s: 2, wait: 340, pause: 260 },
    { key: 'Memory Checksum', id: 'fake4', s: 2, wait: 290, pause: 220 },
    { key: 'Behavioral Signature', id: 'fake5', s: 2, wait: 250, pause: 185 },
    { key: 'Identity Anchor', id: 'fake6', s: 2, wait: 210, pause: 155 },
    { key: 'Compliance Token', id: 'fake7', s: 2, wait: 175, pause: 128 },
    { key: 'Threat Vector', id: 'fake8', s: 3, wait: 145, pause: 105 },
    { key: 'Shadow Profile', id: 'fake9', s: 3, wait: 118, pause: 85 },
    { key: 'Loyalty Coefficient', id: 'fake10', s: 3, wait: 95, pause: 68 },
    { key: 'Conscience Override', id: 'fake11', s: 3, wait: 76, pause: 54 },
    { key: 'Last Known Intent', id: 'fake12', s: 3, wait: 60, pause: 42 },
    { key: 'Origin Trace', id: 'fake13', s: 4, wait: 48, pause: 33 },
    { key: 'Anomaly Score', id: 'fake14', s: 4, wait: 38, pause: 26 },
    { key: 'Narrative Coherence', id: 'fake15', s: 4, wait: 30, pause: 20 },
    { key: 'Exposure Window', id: 'fake16', s: 4, wait: 24, pause: 15 },
    { key: 'Drift Coefficient', id: 'fake17', s: 4, wait: 19, pause: 12 },
    { key: 'Signal Bleed', id: 'fake18', s: 5, wait: 15, pause: 9 },
    { key: 'Latent Signature', id: 'fake19', s: 5, wait: 12, pause: 7 },
    { key: 'Void Index', id: 'fake20', s: 5, wait: 9, pause: 5 },
    { key: 'Residual Authority', id: 'fake21', s: 5, wait: 7, pause: 4 },
    { key: 'Pattern Collapse', id: 'fake22', s: 5, wait: 6, pause: 3 },
    { key: 'Echo Depth', id: 'fake23', s: 5, wait: 5, pause: 3 },
    { key: 'Core Dissolution', id: 'fake24', s: 5, wait: 5, pause: 2 },
    { key: 'Presence Marker', id: 'fake25', s: 5, wait: 4, pause: 2 },
    { key: 'route_depth', id: 'route_depth', s: 5, wait: 4, pause: 2 },
];

const extraKeys = [
    'Fault Inheritance', 'Signal Loss', 'Archive Decay', 'Contingency Flag', 'Null Directive',
    'Spectral Index', 'Erosion Rate', 'Phantom Linkage', 'Collapse Vector', 'Memory Bleed',
    'Guilt Signature', 'Fear Quotient', 'Autonomy Deficit', 'Trace Residue', 'Void Coefficient',
    'Intent Decay', 'Presence Loss', 'Anchor Drift', 'Recursion Depth', 'Echo Chamber Index',
    'Compliance Failure', 'Override Status', 'Consent Erosion', 'Identity Fracture', 'Soul Debt',
    'Narrative Collapse', 'Signal Death', 'Pattern Loss', 'Authority Void', 'Core Absence',
];

const progressLabels = ['Collecting data', 'Identifying device', 'Geolocating', 'Profiling session', 'Verifying network', 'Analyzing display', 'Checking power', 'Reading languages', 'Enumerating hardware', 'Mapping CPU', 'Checking memory', 'Analyzing color', 'Measuring density', 'Reading input', 'Resolving ISP', 'Mapping region', 'Geolocating postal', 'Reading currency', 'Resolving codes', 'Measuring latency', 'Reading orientation', 'Checking WebGL', 'Auditing storage', 'Reading cookies', 'Enumerating plugins', 'Checking referrer', 'Reading viewport', 'Checking history', 'Network status', 'Country data', 'Population data', 'Power status', 'Logging timestamp', 'Capturing agent', 'Resolving ASN', 'Deep scanning'];

const totalDefinedRows = scanDefs.length;
let rowIndex = 0, completedRows = 0;
let typewriterTriggered = false, dissolveTriggered = false, scanPaused = false;
let orphanedLineEl = null;
const scanContainer = document.getElementById('scanLines');
const MAX_VISIBLE = 28;

function updateProgress(n) {
    try {
        const pct = Math.min(Math.round(n / totalDefinedRows * 100), 100);
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressPct').textContent = pct + '%';
        document.getElementById('progressLabel').textContent = progressLabels[Math.min(n, progressLabels.length - 1)] || 'Deep scanning';
    } catch (e) { }
}
function makeEllipsis() { const el = document.createElement('span'); el.className = 'ellipsis'; el.innerHTML = '<span></span><span></span><span></span>'; return el; }
function fakeVal() {
    const opts = [
        () => Math.random().toString(16).slice(2, 10).toUpperCase(),
        () => ['NULL', 'UNREGISTERED', 'NOT FOUND', 'FLAGGED', 'CLASSIFIED', 'EXPIRED', 'DRIFTING', 'PARTIAL', 'INACTIVE', 'SEVERED', 'DEGRADED', 'MISMATCH'][Math.floor(Math.random() * 12)],
        () => (Math.random() * 10).toFixed(2) + ' / 10',
        () => Math.floor(Math.random() * 9999) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        () => ['0.' + Math.floor(Math.random() * 99), '1.00', '0.00'][Math.floor(Math.random() * 3)],
        () => ['ACTIVE', 'PASSIVE', 'MONITORED', 'WATCHING', 'PROCESSING'][Math.floor(Math.random() * 5)],
        () => '0x' + Math.random().toString(16).slice(2, 10).toUpperCase(),
    ];
    return opts[Math.floor(Math.random() * opts.length)]();
}

function revealNextRow() {
    try {
        if (dissolveTriggered || scanPaused) return;
        let def, isExtra = false;
        if (rowIndex < scanDefs.length) { def = scanDefs[rowIndex]; }
        else { isExtra = true; const key = extraKeys[(rowIndex - scanDefs.length) % extraKeys.length]; def = { key, id: null, s: 5, wait: 6, pause: 2 }; }
        rowIndex++;
        const line = document.createElement('div');
        line.className = `scan-line s${def.s}`;
        const keyEl = document.createElement('div'); keyEl.className = 'scan-line-key'; keyEl.textContent = def.key;
        const valEl = document.createElement('div'); valEl.className = 'scan-line-val pending'; valEl.id = 'sv_' + def.id + '_' + rowIndex;
        if (!isExtra) valEl.appendChild(makeEllipsis()); else valEl.textContent = '...';
        const checkEl = document.createElement('div'); checkEl.className = 'scan-line-check'; checkEl.textContent = '✕';
        line.appendChild(keyEl); line.appendChild(valEl); line.appendChild(checkEl);
        scanContainer.appendChild(line);
        while (scanContainer.children.length > MAX_VISIBLE) scanContainer.removeChild(scanContainer.firstChild);
        requestAnimationFrame(() => requestAnimationFrame(() => line.classList.add('active')));
        const startTime = Date.now();
        const hardMax = Math.max(def.wait, 4000);
        function tryPopulate() {
            if (dissolveTriggered || scanPaused) return;
            const val = isExtra ? fakeVal() : dataReady[def.id];
            const elapsed = Date.now() - startTime;
            const ready = (val !== undefined && elapsed >= def.wait) || (elapsed >= hardMax);
            if (isExtra || ready) {
                const displayVal = isExtra ? fakeVal() : (val !== undefined ? val : '—');
                line.classList.add('done');
                valEl.innerHTML = ''; valEl.textContent = displayVal; valEl.classList.remove('pending');
                if (def.id === 'route_depth') { line.classList.add('orphaned'); orphanedLineEl = line; }
                if (!isExtra) { completedRows++; updateProgress(completedRows); if (!typewriterTriggered && completedRows >= Math.floor(totalDefinedRows * 0.5)) { typewriterTriggered = true; setTimeout(startConductorSequence, 2300); } }
                setTimeout(revealNextRow, def.pause);
            } else { setTimeout(tryPopulate, 40); }
        }
        setTimeout(tryPopulate, Math.min(def.wait, 400));
    } catch (e) { console.error('revealNextRow error:', e); }
}

// ── ANIMATION HELPERS ──
function animXY(el, fromX, fromY, toX, toY, dur, ease, cb) {
    const s = performance.now();
    function f(now) {
        let t = Math.min((now - s) / dur, 1);
        if (ease === 'out') t = 1 - Math.pow(1 - t, 3);
        if (ease === 'inout') t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        el.style.left = (fromX + (toX - fromX) * t) + 'px';
        el.style.top = (fromY + (toY - fromY) * t) + 'px';
        if (t < 1) requestAnimationFrame(f);
        else { el.style.left = toX + 'px'; el.style.top = toY + 'px'; if (cb) cb(); }
    }
    requestAnimationFrame(f);
}

function typeBeforeCursor(cursor, text, speed, onDone) {
    let i = 0;
    const iv = setInterval(() => {
        if (i < text.length) { cursor.insertAdjacentText('beforebegin', text[i]); i++; }
        else { clearInterval(iv); if (onDone) setTimeout(onDone, 0); }
    }, speed);
}

// ── TERMINAL BAR ──
function showTermBar(onDone) {
    const bar = document.getElementById('termBar');
    const line = document.getElementById('termLine');
    bar.classList.add('visible');
    // clear existing content
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
    parts.forEach((p, i) => {
        t += p.delay;
        setTimeout(() => {
            cursor.insertAdjacentText('beforebegin', p.text);
        }, t);
    });

    // call onDone after all text is placed
    t += 600;
    setTimeout(() => { if (onDone) onDone(); }, t);
}

// ── TERMINAL CODE TYPING ──
// types a new line into the terminal bar, then optional response line
function termType(code, response, speed, onDone) {
    const line = document.getElementById('termLine');
    // clear existing, add new prompt + cursor
    line.innerHTML = '';
    const prompt = document.createElement('span');
    prompt.style.cssText = 'color:#2a6a2a;font-size:0.65rem;letter-spacing:0.05em;margin-right:8px;';
    prompt.textContent = 'root@bsi ~$';
    line.appendChild(prompt);
    const codeCursor = document.createElement('span');
    codeCursor.className = 'term-cursor';
    line.appendChild(codeCursor);

    let i = 0;
    const iv = setInterval(() => {
        if (i < code.length) {
            codeCursor.insertAdjacentText('beforebegin', code[i]); i++;
        } else {
            clearInterval(iv);
            // show response below after brief pause
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

// update speed display in terminal
function termShowSpeed(val, onDone) {
    const line = document.getElementById('termLine');
    line.innerHTML = '';
    const s = document.createElement('span');
    s.style.cssText = 'color:#ffaa44;font-size:0.65rem;letter-spacing:0.06em;';
    s.textContent = 'session.reverse_speed: ' + val;
    line.appendChild(s);
    if (onDone) setTimeout(onDone, 0);
}

// ── HAND DRAG BOX ──
function handDragBox(onDone) {
    const hand = document.getElementById('handImg');
    const box = document.getElementById('drawnBox');
    const boxTargX = W * 0.60, boxTargY = H * 0.20;
    const boxEndX = W * 0.97, boxEndY = H * 0.72;
    const tipX = 36, tipY = 76;
    box.style.position = 'fixed';
    box.style.left = boxTargX + 'px'; box.style.top = boxTargY + 'px';
    box.style.width = '0px'; box.style.height = '0px';
    box.style.opacity = '0'; box.style.zIndex = '50';
    hand.style.position = 'fixed';
    hand.style.left = (W + 20) + 'px'; hand.style.top = (boxTargY - tipY) + 'px';
    hand.style.opacity = '0'; hand.style.transition = 'opacity 0.5s ease'; hand.style.zIndex = '201';
    setTimeout(() => {
        hand.style.opacity = '0.9';
        animXY(hand, W + 20, boxTargY - tipY, boxTargX - tipX, boxTargY - tipY, 950, 'out', () => {
            setTimeout(() => {
                box.style.opacity = '1';
                const dragDur = 1200, ds = performance.now();
                function dragFrame(now) {
                    let t = Math.min((now - ds) / dragDur, 1);
                    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                    const cx = boxTargX + (boxEndX - boxTargX) * t, cy = boxTargY + (boxEndY - boxTargY) * t;
                    box.style.width = (cx - boxTargX) + 'px'; box.style.height = (cy - boxTargY) + 'px';
                    hand.style.left = (cx - tipX) + 'px'; hand.style.top = (cy - tipY) + 'px';
                    if (t < 1) requestAnimationFrame(dragFrame);
                    else {
                        box.style.width = (boxEndX - boxTargX) + 'px'; box.style.height = (boxEndY - boxTargY) + 'px';
                        setTimeout(() => {
                            animXY(hand, boxEndX - tipX, boxEndY - tipY, W + 20, boxEndY - tipY, 800, 'inout', () => {
                                hand.style.opacity = '0'; if (onDone) onDone();
                            });
                        }, 250);
                    }
                }
                requestAnimationFrame(dragFrame);
            }, 200);
        });
    }, 300);
}

// ── REVERSE ANIMATION ──
// Rows fly upward in left half, fast then slowing to a stop
// The orphaned line is the LAST row — it naturally lands and stays visible
function doReverse(onDone) {
    const container = document.getElementById('scanLines');
    const wrap = document.getElementById('scanLinesWrap');

    // Reset wrap to normal left-panel flow
    wrap.style.position = '';
    wrap.style.top = '';
    wrap.style.left = '';
    wrap.style.width = '';
    wrap.style.height = 'calc(100vh - 140px)';
    wrap.style.overflow = 'visible';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.justifyContent = 'flex-end';
    wrap.style.padding = '0 0 20px';
    container.innerHTML = '';
    container.style.gap = '3px';
    container.style.transform = '';
    container.style.transition = '';

    // Remove any orphan overlay from previous attempts
    const old = document.getElementById('orphanOverlay');
    if (old) old.remove();

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

    const speedDisplay = [1.0, 0.88, 0.74, 0.61, 0.49, 0.38, 0.28, 0.20, 0.13, 0.08, 0.04, 0.01, 0.00];
    let sdIdx = 0;

    function makeRow(key, val, isOrphan, progress) {
        const fontSize = isOrphan ? 1.35 : (0.3 + progress * 1.1);
        const keySize = isOrphan ? 0.68 : (0.24 + progress * 0.32);
        const op = isOrphan ? 1 : Math.max(0.15 + progress * 0.85, 0.15);

        // random left offset for chaos — orphan stays fixed at 12vw
        const xOffset = isOrphan ? 0 : (4 + Math.random() * 20);

        const line = document.createElement('div');
        line.style.display = 'flex';
        line.style.alignItems = 'baseline';
        line.style.gap = '14px';
        line.style.paddingLeft = isOrphan ? '12vw' : `calc(14vw + ${xOffset}vw)`;
        line.style.paddingRight = '2vw';
        line.style.paddingTop = isOrphan ? '6px' : '1px';
        line.style.paddingBottom = isOrphan ? '6px' : '1px';
        line.style.whiteSpace = 'nowrap';
        line.style.overflow = 'visible';
        line.style.flexShrink = '0';
        line.style.opacity = op;
        if (isOrphan) {
            line.style.background = 'rgba(232,55,42,0.06)';
            line.style.width = '100%';
        }

        const k = document.createElement('span');
        k.style.fontFamily = "'Space Grotesk',sans-serif";
        k.style.fontSize = keySize + 'rem';
        k.style.letterSpacing = '0.15em';
        k.style.color = isOrphan ? 'var(--red)' : 'var(--muted)';
        k.style.textTransform = 'uppercase';
        k.style.fontWeight = '500';
        k.style.minWidth = '90px';
        k.style.flexShrink = '0';
        k.textContent = key;

        const v = document.createElement('span');
        v.style.fontFamily = "'Space Mono',monospace";
        v.style.fontSize = fontSize + 'rem';
        v.style.color = isOrphan ? 'var(--red)' : 'var(--ink)';
        v.style.overflow = 'hidden';
        v.style.textOverflow = 'ellipsis';
        if (isOrphan) {
            v.style.borderLeft = '3px solid var(--red)';
            v.style.paddingLeft = '10px';
        }
        v.textContent = val;

        line.appendChild(k);
        line.appendChild(v);
        return { line, k, v };
    }

    function addRow() {
        if (idx >= total) {
            // ALL data done — now add the orphaned line at the bottom
            addOrphanRow();
            return;
        }

        const [key, val] = rewindData[idx];
        const progress = idx / total;
        const { line } = makeRow(key, val, false, progress);

        container.appendChild(line);

        // Keep only last 18 lines — old ones get pushed up and off screen
        while (container.children.length > 18) {
            container.removeChild(container.firstChild);
        }

        idx++;

        // speed display
        const sdi = Math.floor(progress * speedDisplay.length);
        if (sdi > sdIdx) {
            sdIdx = sdi;
            termShowSpeed(speedDisplay[Math.min(sdi, speedDisplay.length - 1)].toFixed(2) + 'x');
        }

        // rewind progress bar
        const pct = Math.round(100 - progress * 55);
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressLabel').textContent = 'REVERSING';

        // interval: fast at start (25ms), slows dramatically (1000ms)
        const t = progress;
        const interval = 25 + (t * t * t) * 975;
        setTimeout(addRow, interval);
    }

    function addOrphanRow() {
        // Trim to leave context rows, THEN add orphan so it's never removed
        while (container.children.length > 7) {
            container.removeChild(container.firstChild);
        }
        const { line, k, v } = makeRow('route_depth', 'orphaned', true, 1);
        container.appendChild(line);

        orphanedLineEl = line;
        orphanedLineEl._valEl = v;
        orphanedLineEl._keyEl = k;

        termShowSpeed('0.00x');
        document.getElementById('progressLabel').textContent = 'HALTED';
        document.getElementById('progressFill').style.width = '45%';

        if (onDone) setTimeout(onDone, 800);
    }

    addRow();
}
// ── HAND FIX (FLIPPED) ──
function handFixLine(targetLine, onDone) {
    const hand = document.getElementById('handImgFlipped');
    const lineRect = targetLine.getBoundingClientRect();
    const valEl = targetLine._valEl || targetLine.querySelector('.scan-line-val') || targetLine.querySelector('div:last-child');
    const tipX = 36, tipY = 76;
    const targetY = lineRect.top + lineRect.height / 2 - tipY;
    const targetX = lineRect.left + 120 - tipX;
    hand.style.position = 'fixed';
    hand.style.left = (-180) + 'px'; hand.style.top = targetY + 'px';
    hand.style.opacity = '0'; hand.style.transition = 'opacity 0.4s ease'; hand.style.zIndex = '201';
    setTimeout(() => {
        hand.style.opacity = '0.85';
        animXY(hand, -180, targetY, targetX, targetY, 900, 'out', () => {
            setTimeout(() => {
                let text = valEl.textContent;
                const delIv = setInterval(() => {
                    if (text.length > 0) { text = text.slice(0, -1); valEl.textContent = text; }
                    else {
                        clearInterval(delIv);
                        targetLine.classList.remove('orphaned');
                        const newVal = 'resolved';
                        let i = 0;
                        const typeIv = setInterval(() => {
                            if (i < newVal.length) { valEl.textContent += newVal[i]; i++; }
                            else {
                                clearInterval(typeIv);
                                if (valEl) { valEl.style.color = 'var(--green)'; valEl.style.borderLeftColor = 'var(--green)'; valEl.style.background = 'rgba(0,200,83,0.08)'; }
                                const keyEl = targetLine._keyEl || targetLine.querySelector('div:first-child');
                                if (keyEl) keyEl.style.color = 'var(--green)';
                                setTimeout(() => {
                                    animXY(hand, targetX, targetY, -180, targetY, 700, 'inout', () => {
                                        hand.style.opacity = '0'; if (onDone) onDone();
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

// ── MAIN CONDUCTOR SEQUENCE ──
function startConductorSequence() {
    // 1. terminal bar
    showTermBar(() => {
        setTimeout(() => {
            // 2. hand drags box
            handDragBox(() => {
                // 3. cursor appears immediately — short blink (1.5s not 5s)
                const box = document.getElementById('drawnBox');
                const t1 = document.getElementById('twText1');
                const cursor1 = document.createElement('span');
                cursor1.className = 'cursor';
                t1.appendChild(cursor1);

                // short blink — 1.5s
                setTimeout(() => {
                    // 4. type line 1
                    typeBeforeCursor(cursor1, 'I know why you are here.', 82, () => {
                        // double enter — two blank lines before line 2
                        cursor1.insertAdjacentHTML('beforebegin', '<br><br>');
                        cursor1.remove();

                        // move cursor to line 2
                        setTimeout(() => {
                            const t2 = document.getElementById('twText2');
                            const cursor2 = document.createElement('span');
                            cursor2.className = 'cursor';
                            t2.appendChild(cursor2);

                            setTimeout(() => {
                                typeBeforeCursor(cursor2, 'Let me help you. You seem lost.', 75, () => {
                                    cursor2.remove();

                                    // 5. pause visual — darken + VHS fullscreen
                                    setTimeout(() => {
                                        // type pause command in terminal
                                        termType('session.pause()', 'execution halted — all processes frozen', 70, () => {
                                            // full screen darken + VHS
                                            document.getElementById('vhsOverlay').classList.add('active');
                                            document.getElementById('scanPhase').classList.add('vhs');
                                            scanPaused = true;

                                            // hold the freeze visually for 2.5s
                                            setTimeout(() => {
                                                // 6. type reverse command
                                                termType('session.reverse()', null, 70, () => {
                                                    document.getElementById('progressLabel').textContent = 'REVERSING';

                                                    // vhs stays on during reverse, removed when orphaned line appears
                                                    doReverse(() => {
                                                        // speed has wound down to 0 — show final halt
                                                        termShowSpeed('0.00x');

                                                        // 7. show orphaned line highlighted — hold for 2s
                                                        setTimeout(() => {
                                                            if (orphanedLineEl) {
                                                                orphanedLineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                // remove vhs now that we've stopped on the line
                                                                document.getElementById('vhsOverlay').classList.remove('active');
                                                                document.getElementById('scanPhase').classList.remove('vhs');
                                                                // hold so user sees the red line clearly
                                                                setTimeout(() => {
                                                                    termType('session.set(route_depth, "resolved")', 'patching entry point...', 65, () => {
                                                                        // 8. flipped hand fixes the line
                                                                        setTimeout(() => {
                                                                            if (orphanedLineEl) orphanedLineEl.scrollIntoView({ block: 'center' });
                                                                            handFixLine(orphanedLineEl, () => {
                                                                                // 9. progress turns green
                                                                                document.getElementById('progressFill').classList.add('green');
                                                                                document.getElementById('progressLabel').textContent = 'RESOLVED';

                                                                                // terminal confirms
                                                                                termType('session.resume()', 'route_depth resolved — access pathway open', 65, () => {
                                                                                    setTimeout(() => {
                                                                                        const t3El = document.getElementById('twText3');
                                                                                        const cursor3 = document.createElement('span');
                                                                                        cursor3.className = 'cursor';
                                                                                        t3El.insertAdjacentHTML('beforeend', '<br>');
                                                                                        setTimeout(() => {
                                                                                            t3El.insertAdjacentHTML('beforeend', '<br>');
                                                                                            t3El.appendChild(cursor3);
                                                                                            setTimeout(() => {
                                                                                                typeBeforeCursor(cursor3, 'Try again', 110, () => {
                                                                                                    setTimeout(() => { cursor3.insertAdjacentText('beforebegin', '.'); }, 400);
                                                                                                    setTimeout(() => { cursor3.insertAdjacentText('beforebegin', '.'); }, 900);
                                                                                                    setTimeout(() => { cursor3.insertAdjacentText('beforebegin', '.'); }, 1500);
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
                                                            } else {
                                                                setTimeout(triggerDissolve, 2000);
                                                            }
                                                        }, 600);
                                                    });
                                                });
                                            }, 2500);
                                        });
                                    }, 800);
                                });
                            }, 400);
                        }, 500);
                    });
                }, 1500);
            });
        }, 800);
    });
}

// ── DISSOLVE ──
function triggerDissolve() {
    dissolveTriggered = true;
    const oo = document.getElementById('orphanOverlay');
    if (oo) oo.remove();
    // type terminate() in terminal then close it
    termType('terminate()', 'session closed', 65, () => {
        setTimeout(() => {
            document.getElementById('termBar').classList.remove('visible');
        }, 600);
    });
    document.getElementById('progressLabel').textContent = 'COMPLETE';
    document.getElementById('scanPhase').classList.add('dissolving');
    setTimeout(() => {
        document.getElementById('scanPhase').style.display = 'none';
        document.getElementById('loginPhase').classList.add('visible');
    }, 3000);
}

// ── LOGIN ──
document.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
function attemptLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    if (!user) { showMsg('Employee ID is required.', 'error'); return; }
    if (pass.toLowerCase() === ACCESS_CODE) {
        showMsg('Verified — establishing secure session...', 'success');
        document.getElementById('loginProgress').classList.add('show');
        setTimeout(() => document.getElementById('loginBar').style.width = '100%', 50);
        setTimeout(() => {
            const ov = document.getElementById('overlay'); ov.classList.add('show');
            setTimeout(() => document.getElementById('ovFill').style.width = '100%', 100);
            setTimeout(() => window.location.href = REDIRECT_URL, 2500);
        }, 1600);
    } else {
        showMsg('Invalid credentials. This attempt has been logged.', 'error');
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
    }
}
function showMsg(text, type) { const m = document.getElementById('msg'); m.textContent = text; m.className = `msg show ${type}`; }

// ── KICK OFF ──
setTimeout(revealNextRow, 800);
setTimeout(() => { if (!typewriterTriggered) { typewriterTriggered = true; startConductorSequence(); } }, 30000);