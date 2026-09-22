/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   scan.js — the scan phase after the passphrase

   1. SCAN ROWS   the visitor's data streams in row by row, speeding
                  up and escalating into fake "classified" rows, then
                  endless extra rows.
   2. CONDUCTOR   once half the rows are done, a scripted sequence
                  runs (read runConductor() top to bottom): terminal
                  connects → hand draws a box (a screen, tied to the
                  globe's mark) → typed messages → freeze → rewind →
                  hand fixes the "orphaned" row → "Try again..." →
                  dissolve.
   3. DISSOLVE    the side panels fade (wordmark + globe are already
                  in place), the register / offer-token choice
                  appears (arg.js).

   Layout (panels, box frame, terminal) lives in scan.css.

   Scan.start() is called by login.js once the passphrase is right.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Scan = (() => {

    /* ════════════════════════════════════════════════════════
       SCRIPT DATA
    ════════════════════════════════════════════════════════ */

    /* Rows in reveal order.
       id    DataStore.ready key for the value
       xl    true = giant dramatic row
       wait  min ms before the value appears ("processing")
       pause ms before the next row starts */
    const ROWS = [
        { key: 'IP Address',              id: 'ip',          wait: 1100, pause: 900 },
        { key: 'Location',                id: 'loc',         wait: 1000, pause: 820 },
        { key: 'Timezone',                id: 'tz',          wait:  880, pause: 740 },
        { key: 'Device',                  id: 'dev',         wait:  820, pause: 680 },
        { key: 'Connection',              id: 'conn',        wait:  740, pause: 620 },
        { key: 'Display',                 id: 'disp',        wait:  680, pause: 560 },
        { key: 'Battery',                 id: 'bat',         wait:  620, pause: 500 },
        { key: 'Language',                id: 'langs',       wait:  560, pause: 440 },
        { key: 'Platform',                id: 'platform',    wait:  500, pause: 390 },
        { key: 'Death Drive Acquisition', id: 'fake1',       wait:  440, pause: 340 },
        { key: 'Soul Index',              id: 'fake2',       wait:  390, pause: 300 },
        { key: 'Consent Timestamp',       id: 'fake3',       wait:  340, pause: 260 },
        { key: 'Memory Checksum',         id: 'fake4',       wait:  290, pause: 220 },
        { key: 'Behavioral Signature',    id: 'fake5',       wait:  250, pause: 185 },
        { key: 'Identity Anchor',         id: 'fake6',       wait:  210, pause: 155 },
        { key: 'Compliance Token',        id: 'fake7',       wait:  175, pause: 128 },
        { key: 'Threat Vector',           id: 'fake8',       wait:  145, pause: 105 },
        { key: 'Shadow Profile',          id: 'fake9',       wait:  118, pause:  85 },
        { key: 'Loyalty Coefficient',     id: 'fake10',      wait:   95, pause:  68 },
        { key: 'Conscience Override',     id: 'fake11',      wait:   76, pause:  54, xl: true },
        { key: 'Last Known Intent',       id: 'fake12',      wait:   60, pause:  42, xl: true },
        { key: 'Origin Trace',            id: 'fake13',      wait:   48, pause:  33, xl: true },
        { key: 'Anomaly Score',           id: 'fake14',      wait:   38, pause:  26, xl: true },
        { key: 'Narrative Coherence',     id: 'fake15',      wait:   30, pause:  20, xl: true },
        { key: 'Exposure Window',         id: 'fake16',      wait:   24, pause:  15, xl: true },
        { key: 'Drift Coefficient',       id: 'fake17',      wait:   19, pause:  12, xl: true },
        { key: 'Signal Bleed',            id: 'fake18',      wait:   15, pause:   9, xl: true },
        { key: 'Latent Signature',        id: 'fake19',      wait:   12, pause:   7, xl: true },
        { key: 'Void Index',              id: 'fake20',      wait:    9, pause:   5, xl: true },
        { key: 'Residual Authority',      id: 'fake21',      wait:    7, pause:   4, xl: true },
        { key: 'Pattern Collapse',        id: 'fake22',      wait:    6, pause:   3, xl: true },
        { key: 'Echo Depth',              id: 'fake23',      wait:    5, pause:   3, xl: true },
        { key: 'Core Dissolution',        id: 'fake24',      wait:    5, pause:   2, xl: true },
        { key: 'Presence Marker',         id: 'fake25',      wait:    4, pause:   2, xl: true },
        { key: 'route_depth',             id: 'route_depth', wait:    4, pause:   2, xl: true },
    ];

    /* After ROWS run out these cycle forever with random values
       (until the dissolve), so the screen never goes still. */
    const EXTRA_KEYS = [
        'Fault Inheritance', 'Signal Loss', 'Archive Decay', 'Contingency Flag', 'Null Directive',
        'Spectral Index', 'Erosion Rate', 'Phantom Linkage', 'Collapse Vector', 'Memory Bleed',
        'Guilt Signature', 'Fear Quotient', 'Autonomy Deficit', 'Trace Residue', 'Void Coefficient',
        'Intent Decay', 'Presence Loss', 'Anchor Drift', 'Recursion Depth', 'Echo Chamber Index',
        'Compliance Failure', 'Override Status', 'Consent Erosion', 'Identity Fracture', 'Soul Debt',
        'Narrative Collapse', 'Signal Death', 'Pattern Loss', 'Authority Void', 'Core Absence',
    ];

    /* Progress label per completed row */
    const PROGRESS_LABELS = [
        'Collecting data', 'Identifying device', 'Geolocating', 'Profiling session', 'Verifying network',
        'Analyzing display', 'Checking power', 'Reading languages', 'Enumerating hardware', 'Mapping CPU',
        'Checking memory', 'Analyzing color', 'Measuring density', 'Reading input', 'Resolving ISP',
        'Mapping region', 'Geolocating postal', 'Reading currency', 'Resolving codes', 'Measuring latency',
        'Reading orientation', 'Checking WebGL', 'Auditing storage', 'Reading cookies', 'Enumerating plugins',
        'Checking referrer', 'Reading viewport', 'Checking history', 'Network status', 'Country data',
        'Population data', 'Power status', 'Logging timestamp', 'Capturing agent', 'Resolving ASN', 'Deep scanning',
    ];

    /* Rows replayed during the rewind, oldest last: [label, DataStore id] */
    const REWIND_ROWS = [
        ['ASN', 'asn'], ['User Agent', 'ua'], ['Timestamp', 'time'], ['Network', 'online'],
        ['History', 'history_len'], ['Viewport', 'viewport'], ['Referrer', 'ref'], ['Plugins', 'plugins'],
        ['Cookies', 'cookies'], ['Storage', 'storage'], ['WebGL', 'webgl'], ['Orientation', 'orient'],
        ['RTT', 'rtt'], ['Calling', 'calling'], ['Currency', 'currency'], ['Postal', 'postal'],
        ['Region', 'region'], ['ISP', 'isp'], ['Touch', 'touch'], ['DPR', 'dpr'], ['Color', 'depth'],
        ['Memory', 'mem'], ['Cores', 'cores'], ['Platform', 'platform'], ['Language', 'langs'],
        ['Battery', 'bat'], ['Display', 'disp'], ['Connection', 'conn'], ['Device', 'dev'], ['Timezone', 'tz'],
        // the first 15 fake rows (Death Drive Acquisition … Narrative Coherence)
        ...ROWS.slice(9, 24).map(r => [r.key, r.id]),
        ['Location', 'loc'], ['IP Address', 'ip'],
    ];

    /* Speed readout as the rewind slows to a stop */
    const REWIND_SPEEDS = [1.0, 0.88, 0.74, 0.61, 0.49, 0.38, 0.28, 0.20, 0.13, 0.08, 0.04, 0.01, 0.00];

    const HAND_TIP = { x: 36, y: 76 };     // px from the hand image's corner to its fingertip
    const GLITCH   = { every: [2500, 6000], ms: [70, 150] };   // how often the box's picture breaks up, and for how long
    const REAL_ROWS = 9;                   // the first 9 ROWS are the visitor's real data — shown at a steady pace

    /* Timing once the fake rows start: faster, and uneven so it never
       ticks like a metronome. Extra rows keep accelerating until the
       freeze, in bursts with the odd stutter. Returns [wait, pause] in ms. */
    function rhythm(index, row) {
        const jitter = (lo, hi) => lo + Math.random() * (hi - lo);
        if (index < REAL_ROWS) return [row.wait, row.pause];
        if (row) return [row.wait * jitter(0.25, 0.8), row.pause * jitter(0.2, 1.1)];

        const base = Math.max(14, 45 * Math.pow(0.95, index - ROWS.length));   // 45ms → 14ms
        const roll = Math.random();
        if (roll < 0.18) return [0, jitter(0, 6)];                              // burst
        if (roll < 0.24) return [0, base * 4 + jitter(40, 140)];                // stutter
        return [0, base * jitter(0.3, 1.5)];
    }


    /* ════════════════════════════════════════════════════════
       STATE + DOM
    ════════════════════════════════════════════════════════ */

    const $    = id => document.getElementById(id);
    const data = id => DataStore.ready[id];

    let rowIndex      = 0;       // next row to reveal (past ROWS.length = extra rows)
    let completedRows = 0;       // ROWS whose value has appeared
    let conductorOn   = false;
    let stopped       = false;   // true from the freeze onward — no more rows, no more break-ups
    let startedAt     = 0;       // performance.now() when the scan began — the freeze's timecode counts from it


    /* ════════════════════════════════════════════════════════
       1. SCAN ROWS
    ════════════════════════════════════════════════════════ */

    function updateProgress() {
        const pct = Math.min(Math.round(completedRows / ROWS.length * 100), 100);
        $('progressFill').style.width  = pct + '%';
        $('progressPct').textContent   = pct + '%';
        $('progressLabel').textContent = PROGRESS_LABELS[Math.min(completedRows, PROGRESS_LABELS.length - 1)];
    }

    // One data row: label, value (starts as `pending` text), ✕
    function makeRow(key, value, classes = '') {
        const line = document.createElement('div');
        line.className = 'scan-line ' + classes;
        line.innerHTML = '<div class="scan-line-key"></div><div class="scan-line-val"></div><div class="scan-line-check">✕</div>';
        line.children[0].textContent = key;
        line.children[1].textContent = value;
        return { line, valEl: line.children[1] };
    }

    function addRow(line) {
        const container = $('scanLines');
        container.appendChild(line);
        while (container.children.length > CONFIG.scan.maxVisible) container.firstChild.remove();
    }

    function revealNextRow() {
        if (stopped) return;

        const extra = rowIndex >= ROWS.length;
        const row   = extra ? { key: EXTRA_KEYS[(rowIndex - ROWS.length) % EXTRA_KEYS.length] } : ROWS[rowIndex];
        const [wait, pause] = rhythm(rowIndex, extra ? null : row);
        rowIndex++;

        const classes = [row.xl && 's-xl', pause < 60 && 'quick'].filter(Boolean).join(' ');
        const { line, valEl } = makeRow(row.key, extra ? Utils.fakeDataValue() : 'scanning…', classes);
        addRow(line);
        Utils.nextFrames().then(() => line.classList.add('active'));   // slide in

        // Wait for the value (network values may still be loading) — but
        // never longer than 4s, so a failed lookup can't stall the scan.
        const started = Date.now();
        const giveUp  = Math.max(wait, 4000);
        if (!extra) valEl.classList.add('pending');

        (function tryPopulate() {
            if (stopped) return;
            const value   = extra ? valEl.textContent : data(row.id);
            const elapsed = Date.now() - started;
            if (!extra && !((value !== undefined && elapsed >= wait) || elapsed >= giveUp)) {
                setTimeout(tryPopulate, Math.min(40, Math.max(4, wait - elapsed)));
                return;
            }

            valEl.textContent = value ?? '—';
            valEl.classList.remove('pending');
            line.classList.add('done');
            if (row.id === 'loc')         window.globeMark();      // the globe finds you (globe.js)
            if (row.id === 'route_depth') line.classList.add('is-orphan');

            if (!extra) {
                completedRows++;
                updateProgress();
                if (!conductorOn && completedRows >= Math.floor(ROWS.length * CONFIG.scan.conductorThreshold)) {
                    conductorOn = true;
                    setTimeout(runConductor, 2300);
                }
            }
            setTimeout(revealNextRow, pause);
        })();
    }


    /* ════════════════════════════════════════════════════════
       TERMINAL (bottom bar)
    ════════════════════════════════════════════════════════ */

    // Clear the terminal line, leaving just the blinking cursor
    function freshTermLine() {
        const line   = $('termLine');
        const cursor = document.createElement('span');
        cursor.className = 'term-cursor';
        line.replaceChildren(cursor);
        return { line, cursor };
    }

    async function showTerminalBar() {
        $('termBar').classList.add('visible');
        const { cursor } = freshTermLine();
        for (const [text, delay] of [['incoming connection... ', 500], ['routing through proxy chain... ', 800],
                                     ['identity masked — ', 600], ['ANONYMOUS USER CONNECTED', 400]]) {
            await Utils.sleep(delay);
            cursor.insertAdjacentText('beforebegin', text);
        }
        await Utils.sleep(600);
    }

    // Type a command, then show "→ response" after it
    async function terminalType(command, response, msPerChar) {
        const { line, cursor } = freshTermLine();
        await Utils.typeBeforeCursor(cursor, command, msPerChar);
        await Utils.sleep(200);
        if (response) {
            const resp = document.createElement('span');
            resp.className   = 'term-response';
            resp.textContent = '→ ' + response;
            line.appendChild(resp);
            await Utils.sleep(500);
        }
    }

    function terminalShowSpeed(speed) {
        const span = document.createElement('span');
        span.className   = 'term-speed';
        span.textContent = 'session.reverse_speed: ' + speed;
        $('termLine').replaceChildren(span);
    }


    /* ════════════════════════════════════════════════════════
       HAND ANIMATIONS
    ════════════════════════════════════════════════════════ */

    // Right hand slides in and drags the box open, corner to corner of .scan-right
    async function handDrawsBox() {
        const hand = $('handImg');
        const box  = $('drawnBox');
        const { left: x0, top: y0, right: x1, bottom: y1 } = $('scanRight').getBoundingClientRect();
        const offRight = innerWidth + 20;

        Object.assign(box.style,  { position: 'fixed', left: x0 + 'px', top: y0 + 'px', width: '0px', height: '0px', opacity: '0', zIndex: '50' });
        Object.assign(hand.style, { position: 'fixed', left: offRight + 'px', top: (y0 - HAND_TIP.y) + 'px', opacity: '0', transition: 'opacity 0.5s ease', zIndex: '201' });

        await Utils.sleep(300);
        hand.style.opacity = '1';
        await Utils.animateXY(hand, offRight, y0 - HAND_TIP.y, x0 - HAND_TIP.x, y0 - HAND_TIP.y, 950, Utils.easing.easeOutCubic);
        await Utils.sleep(200);

        // Drag: box corner follows the fingertip; the globe's scan mark lines up to it
        box.style.opacity = '1';
        window.globeMarkLink(box);
        await new Promise(resolve => {
            const start = performance.now();
            (function drag(now) {
                const t = Utils.easing.easeInOutCubic(Math.min((now - start) / 1200, 1));
                const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
                box.style.width  = (x - x0) + 'px';
                box.style.height = (y - y0) + 'px';
                hand.style.left  = (x - HAND_TIP.x) + 'px';
                hand.style.top   = (y - HAND_TIP.y) + 'px';
                now - start < 1200 ? requestAnimationFrame(drag) : resolve();
            })(start);
        });

        await Utils.sleep(250);
        await Utils.animateXY(hand, x1 - HAND_TIP.x, y1 - HAND_TIP.y, offRight, y1 - HAND_TIP.y, 800);
        hand.style.opacity = '0';
    }

    // Left hand slides in, points at the value, deletes "orphaned", types "resolved"
    async function handFixesRow(row, valEl) {
        const hand = $('handImgFlipped');
        const rect = valEl.getBoundingClientRect();
        const x = rect.left + 24 - HAND_TIP.x;
        const y = rect.top + rect.height / 2 - HAND_TIP.y;

        Object.assign(hand.style, { position: 'fixed', left: '-180px', top: y + 'px', opacity: '0', transition: 'opacity 0.4s ease', zIndex: '201' });
        await Utils.sleep(200);
        hand.style.opacity = '1';
        await Utils.animateXY(hand, -180, y, x, y, 900, Utils.easing.easeOutCubic);
        await Utils.sleep(700);

        while (valEl.textContent) {                       // backspace
            valEl.textContent = valEl.textContent.slice(0, -1);
            await Utils.sleep(55);
        }
        for (const char of 'resolved') {                  // type
            valEl.textContent += char;
            await Utils.sleep(90);
        }
        row.classList.add('is-resolved');                 // ink (scan.css), with a red ✓
        row.querySelector('.scan-line-check').textContent = '✓';
        linkRowToBox(row);

        await Utils.sleep(600);
        await Utils.animateXY(hand, x, y, -180, y, 700);
        hand.style.opacity = '0';
    }


    /* ════════════════════════════════════════════════════════
       THE BOX'S SCREEN, THE FREEZE, THE FIX'S LINE
    ════════════════════════════════════════════════════════ */

    const rand = ([lo, hi]) => lo + Math.random() * (hi - lo);

    // One break-up: a few blocks of the picture (copies of the text, shifted
    // sideways) and a stuck block or two, gone again after a moment
    function glitchOnce() {
        const screen = $('dbScreen'), text = $('dbText');
        const W = screen.clientWidth, H = screen.clientHeight, top = text.offsetTop;
        const made = [];
        const block = (x, y, w, h, stuck) => {
            const b = document.createElement('div');
            b.className = 'db-glitch' + (stuck ? ' stuck' : '');
            Object.assign(b.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
            made.push(screen.appendChild(b));
            return b;
        };
        for (let i = 2 + Math.floor(Math.random() * 3); i > 0; i--) {
            const w = 40 + Math.random() * W * 0.5, h = 8 * (1 + Math.floor(Math.random() * 3));   // stream blocks come in 8s
            const x = Math.random() * (W - w), y = top + Math.random() * Math.max(0, H - top - h);
            const copy = text.cloneNode(true);
            copy.removeAttribute('id');
            copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
            Object.assign(copy.style, { left: (rand([-14, 14]) - x) + 'px', top: (top - y) + 'px', width: text.offsetWidth + 'px' });
            block(x, y, w, h).appendChild(copy);
        }
        for (let i = 1 + Math.floor(Math.random() * 2); i > 0; i--) {
            block(Math.random() * (W - 16), top + Math.random() * (H - top - 8), 8 * (1 + Math.floor(Math.random() * 2)), 8, true);
        }
        setTimeout(() => made.forEach(b => b.remove()), rand(GLITCH.ms));
    }

    // Break up now and then, until the freeze
    async function glitchLoop() {
        while (!stopped) {
            await Utils.sleep(rand(GLITCH.every));
            if (!stopped) glitchOnce();
        }
    }

    // Timecode for the hold tag: hh:mm:ss:ff (30 frames a second)
    function timecode(ms) {
        const f = Math.floor(ms / (1000 / 30)), pad = n => String(n).padStart(2, '0');
        return [Math.floor(f / 108000), Math.floor(f / 1800) % 60, Math.floor(f / 30) % 60, f % 30].map(pad).join(':');
    }
    const setHold = (label, ms) => { $('holdTag').textContent = `${label} · ${timecode(ms)}`; };

    // The fix's dashed line: from the fixed row to the box (removed at the dissolve)
    function linkRowToBox(row) {
        const r = row.getBoundingClientRect(), b = $('drawnBox').getBoundingClientRect();
        const y = r.top + r.height / 2;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        Object.entries({ x1: r.right, y1: y, x2: b.left, y2: Math.min(Math.max(y, b.top), b.bottom),
                         stroke: 'rgba(255,0,0,0.7)', 'stroke-width': 1.5, 'stroke-dasharray': '5 5', id: 'fixLine' })
            .forEach(([k, v]) => line.setAttribute(k, v));
        $('globeOverlay').appendChild(line);
    }


    /* ════════════════════════════════════════════════════════
       REWIND — rows replay backwards, slowing to a stop on the
       orphaned row. Resolves with { row, valEl } for that row.
    ════════════════════════════════════════════════════════ */

    // Same look as a scan row; rows brighten as the rewind slows down
    function rewindRow(key, value, progress, orphan = false) {
        const { line, valEl } = makeRow(key, value, 'active done' + (orphan ? ' is-orphan' : ''));
        if (!orphan) line.style.opacity = (0.25 + progress * 0.75).toFixed(2);
        return { row: line, valEl };
    }

    async function runRewind(heldAt) {
        $('scanLines').replaceChildren();

        let lastSpeed = 0;
        for (let i = 0; i < REWIND_ROWS.length; i++) {
            const [key, id] = REWIND_ROWS[i];
            const progress  = i / REWIND_ROWS.length;
            addRow(rewindRow(key, data(id) || '—', progress).row);   // long values end in "…" (CSS)

            const speedIdx = Math.floor(progress * REWIND_SPEEDS.length);
            if (speedIdx > lastSpeed) {
                lastSpeed = speedIdx;
                terminalShowSpeed(REWIND_SPEEDS[Math.min(speedIdx, REWIND_SPEEDS.length - 1)].toFixed(2) + 'x');
            }
            $('progressFill').style.width  = Math.round(100 - progress * 55) + '%';
            $('progressPct').textContent   = Math.round(100 - progress * 55) + '%';
            $('progressLabel').textContent = 'REVERSING';
            setHold('◀◀ REVERSING', heldAt * (1 - progress * 0.55));   // the timecode runs back with it

            await Utils.sleep(25 + Math.pow(progress, 3) * 975);     // slows down exponentially
        }

        const orphan = rewindRow('route_depth', 'orphaned', 1, true);
        addRow(orphan.row);
        terminalShowSpeed('0.00x');
        setHold('■ HALTED', heldAt * 0.45);
        $('progressLabel').textContent = 'HALTED';
        $('progressFill').style.width  = '45%';
        $('progressPct').textContent   = '45%';
        await Utils.sleep(800);
        return orphan;
    }


    /* ════════════════════════════════════════════════════════
       2. CONDUCTOR — the scripted sequence, in order
    ════════════════════════════════════════════════════════ */

    // Add a blinking cursor to el and type text before it
    async function typewrite(el, text, msPerChar, keepCursor = false) {
        const cursor = document.createElement('span');
        cursor.className = 'cursor';
        el.appendChild(cursor);
        await Utils.typeBeforeCursor(cursor, text, msPerChar);
        if (!keepCursor) cursor.remove();
        return cursor;
    }

    async function runConductor() {
        await showTerminalBar();
        await Utils.sleep(800);
        await handDrawsBox();
        glitchLoop();                            // the box's picture breaks up now and then

        // Messages in the drawn box
        await Utils.sleep(1500);
        await typewrite($('twText1'), 'I know why you are here.', 82);
        await Utils.sleep(900);
        await typewrite($('twText2'), 'Let me help you. You seem lost.', 75);

        // Freeze: a last break-up, then everything stops dead — globe included
        await terminalType('session.pause()', 'execution halted — all processes frozen', 70);
        glitchOnce();
        await Utils.sleep(120);
        glitchOnce();
        stopped = true;
        const heldAt = performance.now() - startedAt;
        setHold('■ HALTED', heldAt);
        $('holdOverlay').classList.add('active');
        window.globeHold(true);
        await Utils.sleep(4000);

        // Rewind to the orphaned row
        await terminalType('session.reverse()', null, 70);
        $('progressLabel').textContent = 'REVERSING';
        const orphan = await runRewind(heldAt);
        await Utils.sleep(600);

        $('holdOverlay').classList.remove('active');
        window.globeHold(false);
        await Utils.sleep(600);

        // Fix it
        await terminalType('session.set(route_depth, "resolved")', 'patching entry point...', 65);
        await Utils.sleep(1200);
        await handFixesRow(orphan.row, orphan.valEl);
        $('progressFill').style.width  = '100%';
        $('progressPct').textContent   = '100%';
        $('progressLabel').textContent = 'RESOLVED';

        await terminalType('session.resume()', 'route_depth resolved — access pathway open', 65);
        await Utils.sleep(1200);

        // "Try again..." with slow dots
        const t3 = $('twText3');
        await Utils.sleep(1100);
        const cursor = await typewrite(t3, 'Try again', 110, true);
        for (const ms of [400, 500, 600]) {
            await Utils.sleep(ms);
            cursor.insertAdjacentText('beforebegin', '.');
        }
        await Utils.sleep(900);
        cursor.remove();

        await Utils.sleep(1800);
        await dissolve();
    }


    /* ════════════════════════════════════════════════════════
       3. DISSOLVE → register / offer-token choice
       The wordmark and globe are already where the welcome screen
       wants them, so only the panels fade away.
    ════════════════════════════════════════════════════════ */

    async function dissolve() {
        await terminalType('terminate()', 'session closed', 65);
        await Utils.sleep(600);
        $('termBar').classList.remove('visible');

        for (const el of document.querySelectorAll('.scan-left, #drawnBox, #fixLine')) {
            el.style.transition = 'opacity 1.6s ease';
            el.style.opacity    = '0';
        }
        await Utils.sleep(2000);
        window.globeUnmark();
        $('fixLine')?.remove();
        window.globeSetDraggable(true);         // the scan's over — the globe can be spun now
        Arg.showArgChoice();
    }


    // "Initializing secure session" is done once the globe's pins + boxes are drawn
    document.addEventListener('globe:pins-complete',
        () => document.querySelector('.scan-tagline').classList.add('gone'), { once: true });

    return {
        start() { startedAt = performance.now(); setTimeout(revealNextRow, 800); },
    };
})();
