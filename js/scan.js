/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   scan.js  —  SCAN PHASE + CONDUCTOR SEQUENCE

   This is the most complex module. It drives the entire post-login
   experience:

     1. SCAN ROWS        — data rows stream in one by one with
                           a typewriter-style reveal.
     2. CONDUCTOR        — once 50% of rows are done, a scripted
                           sequence begins: terminal messages,
                           hand animation, VHS freeze, reverse
                           playback, orphan fix, dissolve.
     3. DISSOLVE         — fades everything out and hands off to
                           the ARG registration flow.

   KEY DESIGN DECISION: The conductor sequence was originally a
   deeply nested callback pyramid (12+ levels deep). It has been
   rewritten as a linear async/await sequence. This makes the
   order of events obvious from reading the code top-to-bottom.
   Each `await` is either a Utils.sleep(ms) pause or a Promise
   wrapping an animation/type sequence.

   DEPENDENCIES (must load before this file):
     config.js, utils.js, data.js, globe.js (startGlobeMove)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */


/* ════════════════════════════════════════════════════════════════
   SCAN DEFINITIONS
   Each entry describes one data row. Fields:
     key   — display name shown in the key column
     id    — DataStore.ready key to look up the value
     s     — size class suffix (0 = normal, 'xl' = huge dramatic rows)
     wait  — minimum ms before showing the value (simulates processing)
     pause — ms to wait after this row before starting the next

   The rows are defined in reveal order (top → bottom of screen).
   Real data rows come first, then fake ARG rows that escalate in
   size and get faster and faster (wait/pause shrink toward 0).
════════════════════════════════════════════════════════════════ */

const SCAN_DEFS = [
    { key: 'IP Address',              id: 'ip',           s: 0,    wait: 1100, pause: 900 },
    { key: 'Location',                id: 'loc',          s: 0,    wait: 1000, pause: 820 },
    { key: 'Timezone',                id: 'tz',           s: 0,    wait:  880, pause: 740 },
    { key: 'Device',                  id: 'dev',          s: 0,    wait:  820, pause: 680 },
    { key: 'Connection',              id: 'conn',         s: 0,    wait:  740, pause: 620 },
    { key: 'Display',                 id: 'disp',         s: 0,    wait:  680, pause: 560 },
    { key: 'Battery',                 id: 'bat',          s: 0,    wait:  620, pause: 500 },
    { key: 'Language',                id: 'langs',        s: 0,    wait:  560, pause: 440 },
    { key: 'Platform',                id: 'platform',     s: 0,    wait:  500, pause: 390 },
    { key: 'Death Drive Acquisition', id: 'fake1',        s: 0,    wait:  440, pause: 340 },
    { key: 'Soul Index',              id: 'fake2',        s: 0,    wait:  390, pause: 300 },
    { key: 'Consent Timestamp',       id: 'fake3',        s: 0,    wait:  340, pause: 260 },
    { key: 'Memory Checksum',         id: 'fake4',        s: 0,    wait:  290, pause: 220 },
    { key: 'Behavioral Signature',    id: 'fake5',        s: 0,    wait:  250, pause: 185 },
    { key: 'Identity Anchor',         id: 'fake6',        s: 0,    wait:  210, pause: 155 },
    { key: 'Compliance Token',        id: 'fake7',        s: 0,    wait:  175, pause: 128 },
    { key: 'Threat Vector',           id: 'fake8',        s: 0,    wait:  145, pause: 105 },
    { key: 'Shadow Profile',          id: 'fake9',        s: 0,    wait:  118, pause:  85 },
    { key: 'Loyalty Coefficient',     id: 'fake10',       s: 0,    wait:   95, pause:  68 },
    { key: 'Conscience Override',     id: 'fake11',       s: 'xl', wait:   76, pause:  54 },
    { key: 'Last Known Intent',       id: 'fake12',       s: 'xl', wait:   60, pause:  42 },
    { key: 'Origin Trace',            id: 'fake13',       s: 'xl', wait:   48, pause:  33 },
    { key: 'Anomaly Score',           id: 'fake14',       s: 'xl', wait:   38, pause:  26 },
    { key: 'Narrative Coherence',     id: 'fake15',       s: 'xl', wait:   30, pause:  20 },
    { key: 'Exposure Window',         id: 'fake16',       s: 'xl', wait:   24, pause:  15 },
    { key: 'Drift Coefficient',       id: 'fake17',       s: 'xl', wait:   19, pause:  12 },
    { key: 'Signal Bleed',            id: 'fake18',       s: 'xl', wait:   15, pause:   9 },
    { key: 'Latent Signature',        id: 'fake19',       s: 'xl', wait:   12, pause:   7 },
    { key: 'Void Index',              id: 'fake20',       s: 'xl', wait:    9, pause:   5 },
    { key: 'Residual Authority',      id: 'fake21',       s: 'xl', wait:    7, pause:   4 },
    { key: 'Pattern Collapse',        id: 'fake22',       s: 'xl', wait:    6, pause:   3 },
    { key: 'Echo Depth',              id: 'fake23',       s: 'xl', wait:    5, pause:   3 },
    { key: 'Core Dissolution',        id: 'fake24',       s: 'xl', wait:    5, pause:   2 },
    { key: 'Presence Marker',         id: 'fake25',       s: 'xl', wait:    4, pause:   2 },
    { key: 'route_depth',             id: 'route_depth',  s: 'xl', wait:    4, pause:   2 },
];

/* Extra rows that stream indefinitely after the main defs are done.
   They loop through this list, generating fake values via Utils.fakeDataValue(). */
const EXTRA_KEYS = [
    'Fault Inheritance', 'Signal Loss', 'Archive Decay', 'Contingency Flag',
    'Null Directive', 'Spectral Index', 'Erosion Rate', 'Phantom Linkage',
    'Collapse Vector', 'Memory Bleed', 'Guilt Signature', 'Fear Quotient',
    'Autonomy Deficit', 'Trace Residue', 'Void Coefficient', 'Intent Decay',
    'Presence Loss', 'Anchor Drift', 'Recursion Depth', 'Echo Chamber Index',
    'Compliance Failure', 'Override Status', 'Consent Erosion',
    'Identity Fracture', 'Soul Debt', 'Narrative Collapse', 'Signal Death',
    'Pattern Loss', 'Authority Void', 'Core Absence',
];

/* Progress bar status labels — rotate through these as rows complete. */
const PROGRESS_LABELS = [
    'Collecting data', 'Identifying device', 'Geolocating', 'Profiling session',
    'Verifying network', 'Analyzing display', 'Checking power', 'Reading languages',
    'Enumerating hardware', 'Mapping CPU', 'Checking memory', 'Analyzing color',
    'Measuring density', 'Reading input', 'Resolving ISP', 'Mapping region',
    'Geolocating postal', 'Reading currency', 'Resolving codes', 'Measuring latency',
    'Reading orientation', 'Checking WebGL', 'Auditing storage', 'Reading cookies',
    'Enumerating plugins', 'Checking referrer', 'Reading viewport', 'Checking history',
    'Network status', 'Country data', 'Population data', 'Power status',
    'Logging timestamp', 'Capturing agent', 'Resolving ASN', 'Deep scanning',
];

/* Rewind data — the rows shown during the reverse sequence.
   Displayed in reverse order of the original scan (bottom up). */
const REWIND_DATA = [
    ['ASN',                      () => DataStore.ready['asn']          || '—'],
    ['User Agent',               () => (DataStore.ready['ua']          || '—').slice(0, 30) + '...'],
    ['Timestamp',                () => DataStore.ready['time']         || '—'],
    ['Network',                  () => DataStore.ready['online']       || '—'],
    ['History',                  () => DataStore.ready['history_len']  || '—'],
    ['Viewport',                 () => DataStore.ready['viewport']     || '—'],
    ['Referrer',                 () => DataStore.ready['ref']          || '—'],
    ['Plugins',                  () => DataStore.ready['plugins']      || '—'],
    ['Cookies',                  () => DataStore.ready['cookies']      || '—'],
    ['Storage',                  () => DataStore.ready['storage']      || '—'],
    ['WebGL',                    () => DataStore.ready['webgl']        || '—'],
    ['Orientation',              () => DataStore.ready['orient']       || '—'],
    ['RTT',                      () => DataStore.ready['rtt']          || '—'],
    ['Calling',                  () => DataStore.ready['calling']      || '—'],
    ['Currency',                 () => DataStore.ready['currency']     || '—'],
    ['Postal',                   () => DataStore.ready['postal']       || '—'],
    ['Region',                   () => DataStore.ready['region']       || '—'],
    ['ISP',                      () => DataStore.ready['isp']          || '—'],
    ['Touch',                    () => DataStore.ready['touch']        || '—'],
    ['DPR',                      () => DataStore.ready['dpr']          || '—'],
    ['Color',                    () => DataStore.ready['depth']        || '—'],
    ['Memory',                   () => DataStore.ready['mem']          || '—'],
    ['Cores',                    () => DataStore.ready['cores']        || '—'],
    ['Platform',                 () => DataStore.ready['platform']     || '—'],
    ['Language',                 () => DataStore.ready['langs']        || '—'],
    ['Battery',                  () => DataStore.ready['bat']          || '—'],
    ['Display',                  () => DataStore.ready['disp']         || '—'],
    ['Connection',               () => DataStore.ready['conn']         || '—'],
    ['Device',                   () => DataStore.ready['dev']          || '—'],
    ['Timezone',                 () => DataStore.ready['tz']           || '—'],
    ['Death Drive Acquisition',  () => 'NULL'],
    ['Soul Index',               () => 'UNREGISTERED'],
    ['Consent Timestamp',        () => 'NOT FOUND'],
    ['Memory Checksum',          () => 'MISMATCH'],
    ['Behavioral Signature',     () => 'FLAGGED'],
    ['Identity Anchor',          () => 'DRIFTING'],
    ['Compliance Token',         () => 'EXPIRED'],
    ['Threat Vector',            () => 'UNKNOWN'],
    ['Shadow Profile',           () => 'PARTIAL'],
    ['Loyalty Coefficient',      () => '0.34'],
    ['Conscience Override',      () => 'INACTIVE'],
    ['Last Known Intent',        () => 'CLASSIFIED'],
    ['Origin Trace',             () => 'SEVERED'],
    ['Anomaly Score',            () => '7.4 / 10'],
    ['Narrative Coherence',      () => 'DEGRADED'],
    ['Location',                 () => DataStore.ready['loc']          || '—'],
    ['IP Address',               () => DataStore.ready['ip']           || '—'],
];

/* Reverse speed values displayed in the terminal as the rewind accelerates. */
const REWIND_SPEEDS = [1.0, 0.88, 0.74, 0.61, 0.49, 0.38, 0.28, 0.20, 0.13, 0.08, 0.04, 0.01, 0.00];


/* ════════════════════════════════════════════════════════════════
   MODULE STATE
════════════════════════════════════════════════════════════════ */

const TOTAL_DEFS       = SCAN_DEFS.length;
const MAX_VISIBLE      = CONFIG.scan.maxVisible;
const scanContainer    = document.getElementById('scanLines');

let rowIndex           = 0;      // index into SCAN_DEFS (or EXTRA_KEYS overflow)
let completedRows      = 0;      // count of fully resolved real-data rows
let conductorTriggered = false;  // prevents the conductor from firing twice
let dissolveTriggered  = false;  // prevents dissolve from firing twice
let scanPaused         = false;  // set to true during the VHS freeze
let orphanedLineEl     = null;   // reference to the route_depth DOM row (for hand animation)
let conductorReady     = false;  // set by session.js once login is confirmed


/* ════════════════════════════════════════════════════════════════
   DOM HELPERS
════════════════════════════════════════════════════════════════ */

/* Creates the three bouncing dots that show while a value is loading. */
function makeEllipsis() {
    const el = document.createElement('span');
    el.className = 'ellipsis';
    el.innerHTML = '<span></span><span></span><span></span>';
    return el;
}

/* Updates the scan progress bar and status label. */
function updateProgress(n) {
    const pct = Math.min(Math.round((n / TOTAL_DEFS) * 100), 100);

    const fillEl  = document.getElementById('progressFill');
    const pctEl   = document.getElementById('progressPct');
    const labelEl = document.getElementById('progressLabel');

    if (fillEl)  fillEl.style.width   = pct + '%';
    if (pctEl)   pctEl.textContent    = pct + '%';
    if (labelEl) labelEl.textContent  = PROGRESS_LABELS[Math.min(n, PROGRESS_LABELS.length - 1)] || 'Deep scanning';

    if (pct >= 100) {
        setTimeout(() => {
            const bar = document.querySelector('.scan-progress');
            if (bar) bar.style.opacity = '0';
        }, CONFIG.scan.progressHideDelay);
    }
}


/* ════════════════════════════════════════════════════════════════
   SCAN ROW REVEAL
   Reveals one row at a time, waiting for real data to arrive
   before populating the value. Loops itself via setTimeout.
════════════════════════════════════════════════════════════════ */

function revealNextRow() {
    if (dissolveTriggered || scanPaused) return;

    /* Determine which definition to use for this row. */
    const isExtra = rowIndex >= SCAN_DEFS.length;
    const def = isExtra
        ? { key: EXTRA_KEYS[(rowIndex - SCAN_DEFS.length) % EXTRA_KEYS.length],
            id: null, s: 0, wait: 6, pause: 200 }
        : SCAN_DEFS[rowIndex];
    rowIndex++;

    /* Build the DOM row. */
    const line   = document.createElement('div');
    line.className = `scan-line s${def.s}`;

    const keyEl  = document.createElement('div');
    keyEl.className   = 'scan-line-key';
    keyEl.textContent = def.key;

    const valEl  = document.createElement('div');
    valEl.className = 'scan-line-val pending';
    valEl.id        = `sv_${def.id}_${rowIndex}`;
    if (!isExtra) valEl.appendChild(makeEllipsis());
    else          valEl.textContent = '...';

    const checkEl = document.createElement('div');
    checkEl.className   = 'scan-line-check';
    checkEl.textContent = '✕';

    line.append(keyEl, valEl, checkEl);
    scanContainer.appendChild(line);

    /* Prune old rows beyond MAX_VISIBLE. */
    while (scanContainer.children.length > MAX_VISIBLE) {
        scanContainer.removeChild(scanContainer.firstChild);
    }

    /* Trigger the CSS slide-in transition. Two frames needed so the browser
       has committed the initial state (opacity:0, translateY:6px) before
       the active class fires the transition. */
    Utils.nextFrames().then(() => line.classList.add('active'));

    /* Wait for the real value (or time out after 4s), then populate. */
    const startTime = Date.now();
    const hardMax   = Math.max(def.wait, 4000);

    function tryPopulate() {
        if (dissolveTriggered || scanPaused) return;

        const val     = isExtra ? Utils.fakeDataValue() : DataStore.ready[def.id];
        const elapsed = Date.now() - startTime;
        const ready   = (val !== undefined && elapsed >= def.wait) || elapsed >= hardMax;

        if (!isExtra && !ready) {
            setTimeout(tryPopulate, 40);
            return;
        }

        /* Populate the value. */
        valEl.textContent = isExtra ? Utils.fakeDataValue() : (val ?? '—');
        valEl.classList.remove('pending');
        line.classList.add('done');

        /* Flag the route_depth row — it's the orphan the conductor will fix. */
        if (def.id === 'route_depth') {
            line.classList.add('orphaned');
            orphanedLineEl = line;
        }

        /* Track real row completions and fire the conductor at 50%. */
        if (!isExtra) {
            completedRows++;
            updateProgress(completedRows);

            if (!conductorTriggered && conductorReady
                && completedRows >= Math.floor(TOTAL_DEFS * 0.5)) {
                conductorTriggered = true;
                setTimeout(runConductorSequence, 2300);
            }
        }

        setTimeout(revealNextRow, def.pause);
    }

    setTimeout(tryPopulate, Math.min(def.wait, 400));
}


/* ════════════════════════════════════════════════════════════════
   TERMINAL HELPERS
   These return Promises so the conductor can await them cleanly.
════════════════════════════════════════════════════════════════ */

/* Slides the terminal bar up and types the connection handshake. */
function showTerminalBar() {
    return new Promise(resolve => {
        const bar    = document.getElementById('termBar');
        const lineEl = document.getElementById('termLine');
        bar.classList.add('visible');

        lineEl.innerHTML = '';
        const cursor = document.createElement('span');
        cursor.className = 'term-cursor';
        lineEl.appendChild(cursor);

        const parts = [
            { text: 'incoming connection... ',      delay:  500 },
            { text: 'routing through proxy chain... ', delay: 800 },
            { text: 'identity masked — ',             delay: 600 },
            { text: 'ANONYMOUS USER CONNECTED',       delay: 400 },
        ];

        let total = 0;
        for (const p of parts) {
            total += p.delay;
            setTimeout(() => cursor.insertAdjacentText('beforebegin', p.text), total);
        }
        total += 600;
        setTimeout(resolve, total);
    });
}

/* Types a command into the terminal, then appends a response.
   Returns a Promise that resolves after the response appears. */
function terminalType(command, response, charSpeed = 55) {
    return new Promise(resolve => {
        const lineEl = document.getElementById('termLine');
        lineEl.innerHTML = '';

        const promptEl = document.createElement('span');
        promptEl.style.cssText = 'color:#2a6a2a;font-size:0.65rem;letter-spacing:0.05em;margin-right:8px;';
        promptEl.textContent = 'root@bsi ~$';
        lineEl.appendChild(promptEl);

        const cursor = document.createElement('span');
        cursor.className = 'term-cursor';
        lineEl.appendChild(cursor);

        let i = 0;
        const interval = setInterval(() => {
            if (i < command.length) {
                cursor.insertAdjacentText('beforebegin', command[i++]);
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    if (response) {
                        const respEl = document.createElement('span');
                        respEl.style.cssText = 'color:#888;font-size:0.6rem;margin-left:16px;';
                        respEl.textContent = '→ ' + response;
                        lineEl.appendChild(respEl);
                    }
                    setTimeout(resolve, response ? 500 : 0);
                }, 200);
            }
        }, charSpeed);
    });
}

/* Shows a speed readout in the terminal (used during the rewind). */
function terminalShowSpeed(val) {
    const lineEl = document.getElementById('termLine');
    lineEl.innerHTML = '';
    const span = document.createElement('span');
    span.style.cssText = 'color:#ffaa44;font-size:0.65rem;letter-spacing:0.06em;';
    span.textContent = 'session.reverse_speed: ' + val;
    lineEl.appendChild(span);
}


/* ════════════════════════════════════════════════════════════════
   HAND ANIMATION — DRAW BOX
   Slides the hand in from the right, drags a box across the screen,
   then exits. Returns a Promise.
════════════════════════════════════════════════════════════════ */

function animateHandDrawBox() {
    return new Promise(resolve => {
        const hand = document.getElementById('handImg');
        const box  = document.getElementById('drawnBox');

        const boxStartX = window.innerWidth  * CONFIG.drawnBox.leftPct / 100;
        const boxStartY = window.innerHeight * CONFIG.drawnBox.topPct  / 100;
        const boxEndX   = window.innerWidth  * 0.97;
        const boxEndY   = window.innerHeight * 0.72;
        const tipX = 36, tipY = 76;

        // Position the box (collapsed) and hand (off-screen right)
        Object.assign(box.style, {
            position: 'fixed', left: boxStartX + 'px', top: boxStartY + 'px',
            width: '0px', height: '0px', opacity: '0', zIndex: '50',
        });
        Object.assign(hand.style, {
            position: 'fixed',
            left: (window.innerWidth + 20) + 'px', top: (boxStartY - tipY) + 'px',
            opacity: '0', transition: 'opacity 0.5s ease', zIndex: '201',
        });

        setTimeout(() => {
            hand.style.opacity = '0.9';

            // Slide hand in to the start corner of the box
            Utils.animateXY(
                hand,
                window.innerWidth + 20, boxStartY - tipY,
                boxStartX - tipX,       boxStartY - tipY,
                950, Utils.easing.easeOutCubic,
                () => {
                    // Hand has arrived — start expanding the box
                    setTimeout(() => {
                        box.style.opacity = '1';

                        const dragDur   = 1200;
                        const dragStart = performance.now();

                        function dragFrame(now) {
                            const t      = Utils.easing.easeInOutCubic(Math.min((now - dragStart) / dragDur, 1));
                            const cx     = boxStartX + (boxEndX - boxStartX) * t;
                            const cy     = boxStartY + (boxEndY - boxStartY) * t;
                            box.style.width  = (cx - boxStartX) + 'px';
                            box.style.height = (cy - boxStartY) + 'px';
                            hand.style.left  = (cx - tipX) + 'px';
                            hand.style.top   = (cy - tipY) + 'px';

                            if (t < 1) {
                                requestAnimationFrame(dragFrame);
                            } else {
                                // Snap to final size
                                box.style.width  = (boxEndX - boxStartX) + 'px';
                                box.style.height = (boxEndY - boxStartY) + 'px';

                                setTimeout(() => {
                                    // Slide hand back off-screen right
                                    Utils.animateXY(
                                        hand,
                                        boxEndX - tipX, boxEndY - tipY,
                                        window.innerWidth + 20, boxEndY - tipY,
                                        800, Utils.easing.easeInOutCubic,
                                        () => { hand.style.opacity = '0'; resolve(); }
                                    );
                                }, 250);
                            }
                        }
                        requestAnimationFrame(dragFrame);
                    }, 200);
                }
            );
        }, 300);
    });
}


/* ════════════════════════════════════════════════════════════════
   REVERSE SEQUENCE
   Rebuilds the scan lines container with rows flowing in reverse
   and accelerating. Returns a Promise that resolves when the
   orphan row is on screen.
════════════════════════════════════════════════════════════════ */

function runReverseSequence() {
    return new Promise(resolve => {
        const container = document.getElementById('scanLines');
        const wrap      = document.getElementById('scanLinesWrap');

        // Reset the container layout for reverse display
        Object.assign(wrap.style, {
            position: '', top: '', left: '', width: '',
            height: 'calc(100vh - 140px)', overflow: 'visible',
            display: 'flex', flexDirection: 'column',
            justifyContent: 'flex-end', padding: '0 0 20px',
        });
        container.innerHTML = '';
        container.style.gap       = '3px';
        container.style.transform = '';
        container.style.transition = '';

        const total       = REWIND_DATA.length;
        let   idx         = 0;
        let   lastSpeedIdx = 0;

        /* Builds one rewind row element. Progress 0→1 makes rows
           grow in font size and opacity as the sequence accelerates. */
        function makeRewindRow(key, val, isOrphan, progress) {
            const fontSize = isOrphan ? 1.35 : (0.3 + progress * 1.1);
            const keySize  = isOrphan ? 0.68 : (0.24 + progress * 0.32);
            const opacity  = isOrphan ? 1    : Math.max(0.15 + progress * 0.85, 0.15);
            const xNudge   = isOrphan ? 0    : (Math.random() * 8);

            const line = document.createElement('div');
            Object.assign(line.style, {
                display: 'flex', alignItems: 'baseline', gap: '14px',
                paddingLeft: isOrphan
                    ? CONFIG.scan.leftPadding
                    : `calc(${CONFIG.scan.leftPadding} + ${xNudge}vw)`,
                paddingRight: '2vw',
                paddingTop:    isOrphan ? '6px' : '1px',
                paddingBottom: isOrphan ? '6px' : '1px',
                whiteSpace: 'nowrap', overflow: 'visible', flexShrink: '0', opacity,
            });
            if (isOrphan) {
                line.style.background = 'rgba(232,55,42,0.06)';
                line.style.width      = '100%';
            }

            const keyEl = document.createElement('span');
            Object.assign(keyEl.style, {
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize:   keySize + 'rem', letterSpacing: '0.15em',
                color:      isOrphan ? 'var(--red)' : 'var(--muted)',
                textTransform: 'uppercase', fontWeight: '500',
                minWidth: '90px', flexShrink: '0',
            });
            keyEl.textContent = key;

            const valEl = document.createElement('span');
            Object.assign(valEl.style, {
                fontFamily: "'Space Mono',monospace",
                fontSize:   fontSize + 'rem',
                color:      isOrphan ? 'var(--red)' : 'var(--ink)',
                overflow: 'hidden', textOverflow: 'ellipsis',
            });
            if (isOrphan) { valEl.style.borderLeft = '3px solid var(--red)'; valEl.style.paddingLeft = '10px'; }
            valEl.textContent = val;

            line.append(keyEl, valEl);
            return { line, keyEl, valEl };
        }

        function addNextRow() {
            if (idx >= total) { addOrphanRow(); return; }

            const [key, valFn] = REWIND_DATA[idx];
            const progress = idx / total;
            const { line } = makeRewindRow(key, valFn(), false, progress);
            container.appendChild(line);

            // Prune old rows
            while (container.children.length > 18) container.removeChild(container.firstChild);

            idx++;

            // Update speed display
            const speedIdx = Math.floor(progress * REWIND_SPEEDS.length);
            if (speedIdx > lastSpeedIdx) {
                lastSpeedIdx = speedIdx;
                terminalShowSpeed(REWIND_SPEEDS[Math.min(speedIdx, REWIND_SPEEDS.length - 1)].toFixed(2) + 'x');
            }

            // Update progress bar
            document.getElementById('progressFill').style.width  = Math.round(100 - progress * 55) + '%';
            document.getElementById('progressLabel').textContent = 'REVERSING';

            // Each row takes longer as progress advances (exponential slowdown)
            setTimeout(addNextRow, 25 + Math.pow(progress, 3) * 975);
        }

        function addOrphanRow() {
            while (container.children.length > 7) container.removeChild(container.firstChild);

            const { line, keyEl, valEl } = makeRewindRow('route_depth', 'orphaned', true, 1);
            container.appendChild(line);

            orphanedLineEl       = line;
            orphanedLineEl._valEl = valEl;
            orphanedLineEl._keyEl = keyEl;

            terminalShowSpeed('0.00x');
            document.getElementById('progressLabel').textContent = 'HALTED';
            document.getElementById('progressFill').style.width  = '45%';

            setTimeout(resolve, 800);
        }

        addNextRow();
    });
}


/* ════════════════════════════════════════════════════════════════
   HAND ANIMATION — FIX ORPHAN
   Slides the flipped hand in from the left, deletes "orphaned",
   types "resolved", turns the row green, then exits.
   Returns a Promise.
════════════════════════════════════════════════════════════════ */

function animateHandFixLine(targetLine) {
    return new Promise(resolve => {
        const hand     = document.getElementById('handImgFlipped');
        const lineRect = targetLine.getBoundingClientRect();
        const valEl    = targetLine._valEl
                      || targetLine.querySelector('.scan-line-val')
                      || targetLine.querySelector('div:last-child');
        const tipX = 36, tipY = 76;
        const targetX  = lineRect.left + 120 - tipX;
        const targetY  = lineRect.top + lineRect.height / 2 - tipY;

        Object.assign(hand.style, {
            position: 'fixed', left: '-180px', top: targetY + 'px',
            opacity: '0', transition: 'opacity 0.4s ease', zIndex: '201',
        });

        setTimeout(() => {
            hand.style.opacity = '0.85';

            Utils.animateXY(
                hand, -180, targetY, targetX, targetY,
                900, Utils.easing.easeOutCubic,
                async () => {
                    await Utils.sleep(700);

                    // Delete existing text character by character
                    let text = valEl.textContent;
                    await new Promise(res => {
                        const interval = setInterval(() => {
                            if (text.length > 0) { text = text.slice(0, -1); valEl.textContent = text; }
                            else { clearInterval(interval); res(); }
                        }, 55);
                    });

                    targetLine.classList.remove('orphaned');

                    // Type "resolved"
                    await new Promise(res => {
                        let i = 0;
                        const interval = setInterval(() => {
                            if (i < 'resolved'.length) { valEl.textContent += 'resolved'[i++]; }
                            else { clearInterval(interval); res(); }
                        }, 90);
                    });

                    // Turn row green
                    Object.assign(valEl.style, {
                        color: 'var(--green)',
                        borderLeftColor: 'var(--green)',
                        background: 'rgba(0,200,83,0.08)',
                    });
                    const keyEl = targetLine._keyEl || targetLine.querySelector('div:first-child');
                    if (keyEl) keyEl.style.color = 'var(--green)';

                    await Utils.sleep(600);

                    // Slide hand back off-screen left
                    Utils.animateXY(
                        hand, targetX, targetY, -180, targetY,
                        700, Utils.easing.easeInOutCubic,
                        () => { hand.style.opacity = '0'; resolve(); }
                    );
                }
            );
        }, 200);
    });
}


/* ════════════════════════════════════════════════════════════════
   CONDUCTOR SEQUENCE
   THE MAIN SHOW. Linear async/await — read top to bottom and the
   events happen in exactly that order.
════════════════════════════════════════════════════════════════ */

async function runConductorSequence() {

    /* ── Step 1: Terminal connects ── */
    await showTerminalBar();
    await Utils.sleep(800);

    /* ── Step 2: Hand draws the typewriter box ── */
    await animateHandDrawBox();

    /* ── Step 3: Type first message ── */
    const t1     = document.getElementById('twText1');
    const cursor1 = document.createElement('span');
    cursor1.className = 'cursor';
    t1.appendChild(cursor1);

    await Utils.sleep(1500);
    await Utils.typeBeforeCursor(cursor1, 'I know why you are here.', 82);
    cursor1.insertAdjacentHTML('beforebegin', '<br><br>');
    cursor1.remove();
    await Utils.sleep(500);

    /* ── Step 4: Type second message ── */
    const t2     = document.getElementById('twText2');
    const cursor2 = document.createElement('span');
    cursor2.className = 'cursor';
    t2.appendChild(cursor2);

    await Utils.sleep(400);
    await Utils.typeBeforeCursor(cursor2, 'Let me help you. You seem lost.', 75);
    cursor2.remove();

    /* ── Step 5: Pause command → VHS freeze ── */
    await terminalType('session.pause()', 'execution halted — all processes frozen', 70);
    document.getElementById('vhsOverlay').classList.add('active');
    document.getElementById('scanPhase').classList.add('vhs');
    scanPaused = true;
    await Utils.sleep(4000);

    /* ── Step 6: Reverse command → rewind animation ── */
    await terminalType('session.reverse()', null, 70);
    document.getElementById('progressLabel').textContent = 'REVERSING';
    await runReverseSequence();
    terminalShowSpeed('0.00x');
    await Utils.sleep(600);

    /* ── Step 7: VHS clears, orphan highlighted ── */
    if (!orphanedLineEl) { setTimeout(triggerDissolve, 2000); return; }

    orphanedLineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('vhsOverlay').classList.remove('active');
    document.getElementById('scanPhase').classList.remove('vhs');
    await Utils.sleep(600);

    /* ── Step 8: Patch command → hand fixes the orphan row ── */
    await terminalType('session.set(route_depth, "resolved")', 'patching entry point...', 65);
    await Utils.sleep(1200);
    orphanedLineEl.scrollIntoView({ block: 'center' });
    await animateHandFixLine(orphanedLineEl);

    /* ── Step 9: Progress bar goes green ── */
    document.getElementById('progressFill').classList.add('green');
    document.getElementById('progressLabel').textContent = 'RESOLVED';

    /* ── Step 10: Resume command ── */
    await terminalType('session.resume()', 'route_depth resolved — access pathway open', 65);
    await Utils.sleep(1200);

    /* ── Step 11: Third message — "Try again..." ── */
    const t3     = document.getElementById('twText3');
    const cursor3 = document.createElement('span');
    cursor3.className = 'cursor';
    t3.insertAdjacentHTML('beforeend', '<br>');
    await Utils.sleep(600);
    t3.insertAdjacentHTML('beforeend', '<br>');
    t3.appendChild(cursor3);

    await Utils.sleep(500);
    await Utils.typeBeforeCursor(cursor3, 'Try again', 110);

    // Ellipsis dots with dramatic delays
    await Utils.sleep(400);  cursor3.insertAdjacentText('beforebegin', '.');
    await Utils.sleep(500);  cursor3.insertAdjacentText('beforebegin', '.');
    await Utils.sleep(600);  cursor3.insertAdjacentText('beforebegin', '.');
    await Utils.sleep(900);
    cursor3.remove();

    /* ── Step 12: Dissolve ── */
    await Utils.sleep(1800);
    triggerDissolve();
}


/* ════════════════════════════════════════════════════════════════
   DISSOLVE
   Fades the scan phase out and transitions to the ARG prompts.
════════════════════════════════════════════════════════════════ */

async function triggerDissolve() {
    dissolveTriggered = true;

    await terminalType('terminate()', 'session closed', 65);
    await Utils.sleep(600);
    document.getElementById('termBar').classList.remove('visible');

    // Fade out scan left/right columns
    for (const sel of ['.scan-left', '.scan-right', '#drawnBox']) {
        const el = document.querySelector(sel);
        if (el) { el.style.transition = 'opacity 2s ease'; el.style.opacity = '0'; }
    }

    // Move globe + wordmark to centre
    await Utils.sleep(500);
    const header = document.querySelector('.scan-header');
    if (header) { header.style.left = '50%'; header.style.top = '50%'; }
    if (window.startGlobeMove) window.startGlobeMove(CONFIG.globe.centerX, CONFIG.globe.centerY);

    // Move wordmark up from centre to top
    await Utils.sleep(2600);
    if (header) header.style.top = CONFIG.globe.postScanY + '%';

    // Show the ARG registration flow
    await Utils.sleep(2400);
    if (window.showArgChoice) window.showArgChoice();
}


/* ════════════════════════════════════════════════════════════════
   PUBLIC API
════════════════════════════════════════════════════════════════ */

const Scan = {
    /* Begin streaming scan rows. Must be called after login. */
    start() {
        conductorReady = true;
        setTimeout(revealNextRow, 800);
    },
};
