/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   globe.js — the spinning red dot globe + its location pins,
              and the drifting background dots (bottom of file)

   Drawn on #globeCanvas (2D). Its centre is a % of the viewport and
   tweens when startGlobeMove() is called; its size follows the
   wordmark's width.

   PINS: one per entry in LOCATIONS — a line drawn from that spot on
   the globe out to a box. When they've all drawn, 'globe:pins-complete'
   fires (music.js starts the radio on it). Clicking a box FOCUSES its
   location: the globe stops, turns the spot to face you and zooms in,
   and the location's panel (#globeFocus) opens beside it. Back / Esc
   zooms out again.

   Hidden until one of:
   window.globeLogOn()                 login.js — grows from nothing, spinning
                                       fast, overshoots, settles (the log-on)
   window.globeShowNow()               session.js — returning visitors

   window.startGlobeMove(xPct, yPct)   session.js
   window.startPinLines()              arg.js / session.js
   window.globeSetDraggable(on)        session.js / scan.js — grab-and-spin
                                       on the globe screens (see Drag to spin)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(() => {

    const TILT_X        = 0.98;     // radians the globe leans back
    const TILT_Z        = 0.40;     // radians it leans sideways
    const DOT_STEP      = 0.08;     // lat/lon spacing between dots (radians) → ~3,100 dots
    const DOT_SIZE      = 1.5;      // px
    const ALPHA_LEVELS  = 8;        // depth shading steps (back dim → front bright)
    const PERSPECTIVE   = 300;      // larger = flatter
    const PIN_DRAW_MS   = 2400;     // time for a pin line to reach its box
    const BOX_W = 220, BOX_H = 160;

    /* The locations, one pin + box each. New visitors get just the first; add more
       as the ARG goes on. (This file is public — nothing secret in here.)
         lat, lon   the spot on the globe, radians (lat 0 = top pole … π = bottom)
         box        box centre as fractions of the viewport — free corners:
                    { x: 0.18, y: 0.22 }, { x: 0.18, y: 0.78 }, { x: 0.82, y: 0.78 }
         title, text  shown in the panel when it's focused
         next       where the panel's Continue button goes (null = nowhere yet) */
    const LOCATIONS = [
        { lat: 0.9, lon: 2.3, box: { x: 0.82, y: 0.22 },
          title: 'Location 01', text: 'Description of the area goes here.', next: null },
    ];

    // Focusing a location (click its box)
    const FOCUS = {
        ms:     1800,   // turn + zoom time, both ways
        zoom:   2.5,    // × the globe's size
        wide:   { x: 30, y: 50 },   // globe centre while focused, viewport % …
        narrow: { x: 50, y: 30 },   // … and on narrow windows (≤ 820px), panel underneath
    };

    // Unit-sphere dot positions — they never change, so compute them once
    const DOTS = [];
    for (let lat = 0; lat < Math.PI; lat += DOT_STEP) {
        for (let lon = 0; lon < Math.PI * 2; lon += DOT_STEP) {
            DOTS.push([Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon)]);
        }
    }

    // One colour per depth level, and a reusable screen-position buffer for each
    const LEVEL_STYLE = Array.from({ length: ALPHA_LEVELS }, (_, i) =>
        `rgba(255, 0, 0, ${(0.3 + 0.7 * i / (ALPHA_LEVELS - 1)).toFixed(2)})`);
    const levelXY    = Array.from({ length: ALPHA_LEVELS }, () => new Float32Array(DOTS.length * 2));
    const levelCount = new Uint32Array(ALPHA_LEVELS);

    /* Rotate a unit-sphere point by the frame's 3×3 matrix `m` (row-major),
       scale to radius, and project around (cx, cy). Returns [x, y, depth 0–1].
       Screen axes: x right, y down, z away from the viewer. `persp` grows with
       the zoom so a zoomed globe is the same shape, just bigger. */
    function project([ux, uy, uz], m, radius, cx, cy, persp = PERSPECTIVE) {
        const x = m[0] * ux + m[1] * uy + m[2] * uz;
        const y = m[3] * ux + m[4] * uy + m[5] * uz;
        const z = m[6] * ux + m[7] * uy + m[8] * uz;
        const p = persp / (persp + z * radius);
        return [cx + x * radius * p, cy + y * radius * p, (z + 1) / 2];
    }


    /* ── Quaternions [x, y, z, w] — the globe's rotation ── */

    const qMul = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ];
    const qNorm = q => { const l = Math.hypot(...q); return q.map(v => v / l); };
    const qConj = ([x, y, z, w]) => [-x, -y, -z, w];

    // Turn by `angle` about screen axis 0 (x), 1 (y) or 2 (z)
    const qAxis = (axis, angle) => { const q = [0, 0, 0, Math.cos(angle / 2)]; q[axis] = Math.sin(angle / 2); return q; };

    // Rotation vector (axis × angle, radians) → quaternion
    function qExp([x, y, z]) {
        const a = Math.hypot(x, y, z);
        const s = a < 1e-9 ? 0.5 : Math.sin(a / 2) / a;
        return [x * s, y * s, z * s, Math.cos(a / 2)];
    }

    // Quaternion → rotation vector, the short way round
    function qLog([x, y, z, w]) {
        if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
        const l = Math.hypot(x, y, z);
        const k = l < 1e-9 ? 2 : 2 * Math.atan2(l, w) / l;
        return [x * k, y * k, z * k];
    }

    function qMatrix([x, y, z, w], m) {
        m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - z * w);     m[2] = 2 * (x * z + y * w);
        m[3] = 2 * (x * y + z * w);     m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - x * w);
        m[6] = 2 * (x * z - y * w);     m[7] = 2 * (y * z + x * w);     m[8] = 1 - 2 * (x * x + y * y);
    }

    // Shortest turn taking unit vector a onto unit vector b
    function qAlign(a, b) {
        const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const s = Math.hypot(...c), angle = Math.atan2(s, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
        return s < 1e-9 ? (angle < 1 ? [0, 0, 0, 1] : qAxis(1, Math.PI))   // already there / dead opposite
                        : qExp(c.map(v => v / s * angle));
    }

    // The normal pose = TILT_Q × spin about Y: spin, then lean back (X), then sideways (Z)
    const TILT_Q = qMul(qAxis(2, TILT_Z), qAxis(0, TILT_X));


    document.addEventListener('DOMContentLoaded', () => {
        const canvas   = document.getElementById('globeCanvas');
        const overlay  = document.getElementById('globeOverlay');
        const wordmark = document.querySelector('.scan-wordmark');
        const ctx      = canvas.getContext('2d');

        /* ── Sizing ── */

        let dpr = 1;
        function fitCanvas() {
            dpr = window.devicePixelRatio || 1;
            canvas.width  = innerWidth  * dpr;
            canvas.height = innerHeight * dpr;
            canvas.style.width  = innerWidth  + 'px';
            canvas.style.height = innerHeight + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            pins.forEach(placeBox);
            measureRadius();
        }

        // Globe radius follows the wordmark width (cached — reading layout every frame
        // is slow). The wordmark is display:none until the scan starts, so measure a
        // hidden copy then — otherwise the globe starts tiny and jumps to size.
        let radius = 100;
        function measureRadius() {
            let w = wordmark.offsetWidth;
            if (!w) {
                const probe = wordmark.cloneNode(true);
                Object.assign(probe.style, { position: 'fixed', left: '-9999px', top: '0', visibility: 'hidden', animation: 'none' });
                document.body.appendChild(probe);
                w = probe.offsetWidth;
                probe.remove();
            }
            radius = (w || 300) * 0.7 * CONFIG.globe.size;
        }
        new ResizeObserver(measureRadius).observe(wordmark);
        document.fonts?.ready.then(measureRadius);      // the wordmark font changes its width


        /* ── Log-on: hidden → grows from nothing past full size → settles ── */

        const LOGON = { growMs: 2800, holdMs: 350, settleMs: 1500, peak: 1.2, spinBoost: 14 };   // peak 1.2 looks ~1.4× (perspective)
        let scale = 0;        // 0 = not shown yet
        let logon = null;     // { start, resolve, settling }

        // Resolves when the settle starts, so the wordmark can rise in alongside it
        window.globeLogOn   = () => new Promise(resolve => { logon = { start: performance.now(), resolve, settling: false }; });
        window.globeShowNow = () => { logon = null; scale = 1; };

        // Returns the extra spin speed for this frame (fast while growing)
        function stepLogOn(now) {
            if (!logon) return 0;
            const { growMs, holdMs, settleMs, peak, spinBoost } = LOGON;
            const t = now - logon.start;
            if (t < growMs) {
                const p = t / growMs;
                scale = peak * Utils.easing.easeOutCubic(p);
                return spinBoost * (1 - p) * (1 - p);
            }
            if (t < growMs + holdMs) { scale = peak; return 0; }
            if (!logon.settling) { logon.settling = true; logon.resolve(); }
            const p = Math.min((t - growMs - holdMs) / settleMs, 1);
            scale = peak + (1 - peak) * Utils.easing.easeInOutCubic(p);
            if (p === 1) logon = null;
            return 0;
        }


        /* ── Position tween ── */

        let pos  = { x: CONFIG.globe.initialX, y: CONFIG.globe.initialY };
        let move = null;    // { from, to, start }

        window.startGlobeMove = (x, y) => {
            move = { from: { ...pos }, to: { x, y }, start: performance.now() };
        };

        let zoom  = 1;      // > 1 while a location is focused
        let focus = null;   // { pin, dir: 'in' | 'out', start, fromQ, toQ, fromZoom } — see Focus
        const view = () => ({ cx: innerWidth * pos.x / 100, cy: innerHeight * pos.y / 100, r: radius * scale * zoom });


        /* ── Drag to spin ──
           Grab the globe and turn it like a desk globe: it rolls with the
           pointer (even off the globe or the window), a flick coasts on and slows with friction, and
           once it's been still for a moment a soft spring eases it home. The user's turn
           (turnQ) sits on top of the normal pose, in screen axes, so "home"
           is just no turn — the idle spin carries on underneath (it only
           pauses while the globe is held).

           Allowed on the globe screens (globeSetDraggable — session.js,
           scan.js) once the log-on has settled, and never with an overlay
           open. #globeCanvas stays click-through, so the document listens. */

        const TURN = {
            friction:  0.5,     // share of the coasting speed kept per second
            maxSpeed:  25,      // rad/s — caps a wild flick
            settle:    0.3,     // rad/s — slower than this counts as "at rest"
            pause:     1.5,     // s at rest before it starts heading home
            stiffness: 4,       // return spring, critically damped (~3 s home, gentle start)
            sampleMs:  100,     // pointer history used to measure a flick
        };
        const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const BLOCKERS  = '#initOverlay:not(.gone), #inventoryOverlay.visible, #cardEditorOverlay.visible, #mixtapeOverlay.visible, #signalOverlay.visible';
        const NOT_GLOBE = 'button, a, input, textarea, select, label, [contenteditable], [data-action], #radioWidget, #argChoicePrompt, #argRegPrompt, #argCardPrompt, #globeOverlay rect, #globeFocus';
        const root = document.documentElement;

        let draggable = false;
        let turnQ   = [0, 0, 0, 1];     // the user's turn (identity = normal pose)
        let omega   = [0, 0, 0];        // its angular velocity, rad/s about screen axes
        let turning = false;            // coasting or heading home
        let homing  = false;            // the return spring has taken over
        let rested  = 0;                // s spent at rest since letting go
        let drag    = null;             // { id, x, y: last pointer position, last: its time, samples }

        window.globeSetDraggable = on => { draggable = on; };

        // Perspective makes the drawn disc bigger than `r` (the rim sits a bit in
        // front of the centre) and the front face bigger still: a = r / PERSPECTIVE.
        const lens = () => { const { r } = view(); return { r, a: Math.min(r / (PERSPECTIVE * zoom), 0.95) }; };

        function onDisc(px, py) {
            const { cx, cy } = view(), { r, a } = lens();
            return ((px - cx) ** 2 + (py - cy) ** 2) * (1 - a * a) < r * r;
        }

        const canGrab = e => draggable && logon === null && scale === 1 && !focus
            && !document.querySelector(BLOCKERS)
            && !(e.target instanceof Element && e.target.closest(NOT_GLOBE))
            && onDisc(e.clientX, e.clientY);

        document.addEventListener('pointerdown', e => {
            if (drag || !e.isPrimary || e.button !== 0 || !canGrab(e)) return;
            e.preventDefault();
            root.setPointerCapture(e.pointerId);        // keep getting moves outside the window
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY, last: e.timeStamp, samples: [] };
            omega = [0, 0, 0];                          // catches a coasting globe
            turning = homing = false;
            root.classList.add('globe-grabbing');
        });

        addEventListener('pointermove', e => {
            if (!drag) { root.classList.toggle('globe-grab', canGrab(e)); return; }
            if (e.pointerId !== drag.id) return;
            // Roll the globe the way the pointer moved — about the screen axis at right
            // angles to it — at the rate that keeps the globe's front centre under the
            // pointer. No edge to run off: it keeps turning wherever the pointer goes.
            const { r, a } = lens(), k = (1 - a) / r;   // radians per pixel
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            const v  = [dy * k, -dx * k, 0];
            turnQ = qNorm(qMul(qExp(v), turnQ));
            drag.samples = drag.samples.filter(s => e.timeStamp - s.t < TURN.sampleMs);
            drag.samples.push({ t: e.timeStamp, dt: e.timeStamp - drag.last, v });
            drag.x = e.clientX;
            drag.y = e.clientY;
            drag.last = e.timeStamp;
        });

        // Let go: coast at the recent speed (zero if the pointer had paused)
        function release(e) {
            if (!drag || e.pointerId !== drag.id) return;
            const recent = drag.samples.filter(s => e.timeStamp - s.t < TURN.sampleMs);
            const secs   = Math.max(recent.reduce((t, s) => t + s.dt, e.timeStamp - drag.last) / 1000, 1 / 60);
            omega = [0, 1, 2].map(i => recent.reduce((sum, s) => sum + s.v[i], 0) / secs);
            const speed = Math.hypot(...omega);
            if (REDUCED_MOTION) omega = [0, 0, 0];      // no coasting, just ease home
            else if (speed > TURN.maxSpeed) omega = omega.map(v => v * TURN.maxSpeed / speed);
            drag = null;
            turning = true;
            homing  = false;
            rested  = 0;
            root.classList.remove('globe-grabbing');
        }
        addEventListener('pointerup', release);
        addEventListener('pointercancel', release);

        // Advance the coast / return by h seconds (draw() calls it in small fixed steps)
        function stepTurn(h) {
            if (!homing) {
                const keep = Math.pow(TURN.friction, h);
                omega  = omega.map(v => v * keep);
                rested = Math.hypot(...omega) < TURN.settle ? rested + h : 0;
                homing = rested >= TURN.pause;          // let it sit a moment before heading home
            }
            let off = null;
            if (homing) {                               // spring back towards no turn, the short way
                off = qLog(turnQ);
                const k = TURN.stiffness, c = 2 * Math.sqrt(k);
                omega = omega.map((v, i) => v - (k * off[i] + c * v) * h);
            }
            turnQ = qNorm(qMul(qExp(omega.map(v => v * h)), turnQ));
            if (homing && Math.hypot(...off) < 1e-3 && Math.hypot(...omega) < 1e-2) {
                turnQ = [0, 0, 0, 1];
                omega = [0, 0, 0];
                turning = false;
            }
        }


        /* ── Pins ── */

        const svg = (tag, attrs) => {
            const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
            for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
            return overlay.appendChild(el);
        };

        const pins = LOCATIONS.map(loc => {
            const pin = {
                loc,
                unit:   [Math.sin(loc.lat) * Math.cos(loc.lon), Math.cos(loc.lat), Math.sin(loc.lat) * Math.sin(loc.lon)],
                anchor: loc.box,
                line:   svg('line', { stroke: 'rgba(255,0,0,0.7)', 'stroke-width': 1.5, opacity: 0 }),
                box:    svg('rect', { stroke: 'rgba(255,0,0,0.7)', 'stroke-width': 1.5, fill: 'rgba(245,242,236,0.92)',
                                      rx: 2, width: BOX_W, height: BOX_H, opacity: 0, 'data-sfx': 'hover' }),
                start:  null,   // ms timestamp once drawing starts
            };
            pin.box.addEventListener('click', () => focusOn(pin));
            return pin;
        });

        function placeBox(pin) {
            pin.box.setAttribute('x', pin.anchor.x * innerWidth  - BOX_W / 2);
            pin.box.setAttribute('y', pin.anchor.y * innerHeight - BOX_H / 2);
        }

        let pinsDone = false;
        window.startPinLines = () => {
            const now = performance.now();
            pins.forEach(pin => { pin.start ??= now; });
        };

        /* ── Focus ──
           In: the spin stops and turnQ eases from wherever it is to the turn that
           brings the pin to the front, while the globe zooms and slides aside.
           Out: the zoom and slide reverse and the drag spring (stepTurn) takes
           turnQ home, with the spin running again underneath. */

        const panel = document.getElementById('globeFocus');
        const rotated = (q, u) => { const m = new Float64Array(9); qMatrix(q, m); return [0, 1, 2].map(i => m[i * 3] * u[0] + m[i * 3 + 1] * u[1] + m[i * 3 + 2] * u[2]); };

        function focusOn(pin) {
            if (focus || document.querySelector(BLOCKERS)) return;
            SFX.positive();
            const where = rotated(qMul(TILT_Q, qAxis(1, -spin)), pin.unit);   // the pin, before the user's turn
            focus = { pin, dir: 'in', start: performance.now(), fromQ: turnQ, toQ: qAlign(where, [0, 0, -1]), fromZoom: zoom };
            omega = [0, 0, 0];
            turning = homing = false;
            const at = innerWidth <= 820 ? FOCUS.narrow : FOCUS.wide;
            window.startGlobeMove(at.x, at.y);

            document.getElementById('gfTitle').textContent = pin.loc.title;
            document.getElementById('gfText').textContent  = pin.loc.text;
            document.body.classList.add('globe-focused');       // the welcome screen steps back (arg.css)
            setTimeout(() => focus?.dir === 'in' && panel.classList.add('visible'), FOCUS.ms * 0.6);
        }

        function unfocus() {
            if (focus?.dir !== 'in') return;
            SFX.hover();
            panel.classList.remove('visible');
            document.body.classList.remove('globe-focused');
            focus = { ...focus, dir: 'out', start: performance.now(), fromZoom: zoom };
            turning = homing = true;                            // spring home from here
            window.startGlobeMove(CONFIG.globe.centerX, CONFIG.globe.centerY);
        }

        // Advance the focus tween; returns its eased progress (0–1)
        function stepFocus(now) {
            const t = Math.min((now - focus.start) / FOCUS.ms, 1), e = Utils.easing.easeInOutCubic(t);
            zoom = Utils.lerp(focus.fromZoom, focus.dir === 'in' ? FOCUS.zoom : 1, e);
            if (focus.dir === 'in') {
                const way = qLog(qMul(focus.toQ, qConj(focus.fromQ)));
                turnQ = qNorm(qMul(qExp(way.map(v => v * e)), focus.fromQ));
            } else if (t === 1) {
                focus = null;
            }
            return e;
        }

        document.getElementById('gfBack').addEventListener('click', unfocus);
        document.getElementById('gfNext').addEventListener('click', () => {
            if (focus?.pin.loc.next) location.href = focus.pin.loc.next;
        });
        addEventListener('keydown', e => {
            if (e.key === 'Escape' && focus?.dir === 'in' && !document.querySelector(BLOCKERS)) unfocus();
        });

        fitCanvas();
        addEventListener('resize', fitCanvas);


        /* ── Frame ── */

        const TURN_STEP = 1 / 120;      // s — fixed sub-steps keep the spring the same at any frame rate
        const rot = new Float64Array(9);
        let spin = Math.random() * Math.PI * 2, lastNow = null;

        function draw(now) {
            requestAnimationFrame(draw);
            const dt = lastNow === null ? 0 : Math.min((now - lastNow) / 1000, 0.1);
            lastNow = now;

            if (move) {
                const t = Math.min((now - move.start) / CONFIG.globe.moveDuration, 1);
                const e = Utils.easing.easeInOutQuad(t);
                pos = { x: Utils.lerp(move.from.x, move.to.x, e), y: Utils.lerp(move.from.y, move.to.y, e) };
                if (t === 1) move = null;
            }
            // The music (Pulse, music.js — loaded after this file): the globe swells a hair
            // with the bass and turns a little quicker when it's loud. Silence = as ever.
            const music = typeof Pulse === 'undefined' ? null : Pulse;
            const bass  = music?.bass ?? 0, level = music?.level ?? 0;

            const boost = stepLogOn(now);
            const focusE = focus ? stepFocus(now) : 0;
            const marker = focus?.dir === 'in' ? focusE : 0;     // the focused spot's ring fades in with the zoom
            // Held and focused globes don't turn by themselves
            if (!drag && focus?.dir !== 'in') spin += dt * CONFIG.globe.speed * (1 + boost) * (1 + 0.25 * level);
            if (turning) for (let t = dt; t > 1e-6; t -= TURN_STEP) stepTurn(Math.min(t, TURN_STEP));

            // This frame's rotation: the user's turn on top of the normal pose
            qMatrix(qMul(turnQ, qMul(TILT_Q, qAxis(1, -spin))), rot);

            ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            if (scale === 0) return;

            const { cx, cy, r: size } = view();
            const r = size * (1 + 0.012 * bass);
            const persp = PERSPECTIVE * zoom, dotSize = DOT_SIZE * Math.sqrt(zoom);   // zoomed: same shape, bigger dots
            ctx.globalAlpha = Math.min(1, scale / 0.4);     // fade in while it's still small

            // Sort dots into depth levels, then draw each level with one fillStyle
            levelCount.fill(0);
            for (const dot of DOTS) {
                const [x, y, depth] = project(dot, rot, r, cx, cy, persp);
                const level = Math.min(ALPHA_LEVELS - 1, Math.floor(depth * ALPHA_LEVELS));
                const n = levelCount[level]++ * 2;
                levelXY[level][n]     = x;
                levelXY[level][n + 1] = y;
            }
            for (let level = 0; level < ALPHA_LEVELS; level++) {
                ctx.fillStyle = LEVEL_STYLE[level];
                const xy = levelXY[level];
                for (let i = 0; i < levelCount[level] * 2; i += 2) ctx.fillRect(xy[i], xy[i + 1], dotSize, dotSize);
            }

            // Focused: a ring + crosshair on the spot
            if (marker > 0) {
                const [px, py] = project(focus.pin.unit, rot, r, cx, cy, persp);
                ctx.globalAlpha = marker;
                ctx.strokeStyle = LEVEL_STYLE[ALPHA_LEVELS - 1];
                ctx.lineWidth   = 1.5;
                ctx.beginPath();
                ctx.arc(px, py, 14, 0, Math.PI * 2);
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    ctx.moveTo(px + dx * 20, py + dy * 20);
                    ctx.lineTo(px + dx * 30, py + dy * 30);
                }
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            // Pin lines grow from the (moving) globe point out to their box
            for (const pin of pins) {
                if (pin.start === null) continue;
                const progress = Math.min((now - pin.start) / PIN_DRAW_MS, 1);
                const [px, py] = project(pin.unit, rot, r, cx, cy, persp);
                const bx = pin.anchor.x * innerWidth, by = pin.anchor.y * innerHeight;
                pin.line.setAttribute('x1', px + DOT_SIZE / 2);
                pin.line.setAttribute('y1', py + DOT_SIZE / 2);
                pin.line.setAttribute('x2', px + (bx - px) * progress);
                pin.line.setAttribute('y2', py + (by - py) * progress);
                pin.line.setAttribute('opacity', 1);
                if (progress === 1 && !pin.box.classList.contains('live')) {
                    pin.box.setAttribute('opacity', 1);
                    pin.box.classList.add('live');                            // clickable now (background.css)
                }
                pin.box.style.scale = (1 + 0.02 * bass).toFixed(4);          // the boxes breathe with it
            }

            if (!pinsDone && pins.every(pin => pin.start !== null && now - pin.start >= PIN_DRAW_MS)) {
                pinsDone = true;
                document.dispatchEvent(new CustomEvent('globe:pins-complete'));
            }
        }
        requestAnimationFrame(draw);
    });
})();


/* ── Background dots ──────────────────────────────────────────
   ~65 faint dots on #dotCanvas that drift slowly and shift a little
   with the mouse. Each has a depth `d` (0–1): deeper dots are
   fainter and move less. (Was dots.js.) */
(() => {
    const canvas = document.getElementById('dotCanvas');
    const ctx    = canvas.getContext('2d');
    let W, H;

    const resize = () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; };
    addEventListener('resize', resize);
    resize();

    // Position is 0–1 of the viewport and wraps; drift is viewport-widths per second
    const dots = Array.from({ length: 65 }, () => {
        const d = Math.random();
        return {
            x: Math.random(), y: Math.random(), d,
            r:  Math.random() * 1.3 + 0.3,
            vx: (Math.random() - 0.5) * 0.0042,
            vy: (Math.random() - 0.5) * 0.0042,
            color: `rgba(26,26,24,${(0.2 + d * 0.3).toFixed(2)})`,
        };
    });

    const wrap   = v => ((v % 1) + 1) % 1;
    const mouse  = { x: 0.5, y: 0.5 };   // smoothed
    const target = { x: 0.5, y: 0.5 };   // raw
    document.addEventListener('mousemove', e => { target.x = e.clientX / W; target.y = e.clientY / H; });

    let last = performance.now();
    requestAnimationFrame(function draw(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const ease = 1 - Math.pow(0.96, dt * 60);    // ~4% per frame at 60fps
        mouse.x += (target.x - mouse.x) * ease;
        mouse.y += (target.y - mouse.y) * ease;

        // Louder music (Pulse, music.js) stirs them up a little
        const stir = 1 + 1.5 * (typeof Pulse === 'undefined' ? 0 : Pulse.level);

        ctx.clearRect(0, 0, W, H);
        for (const dot of dots) {
            dot.x = wrap(dot.x + dot.vx * dt * stir);
            dot.y = wrap(dot.y + dot.vy * dt * stir);
            const px = wrap(dot.x + (mouse.x - 0.5) * 0.05 * dot.d);
            const py = wrap(dot.y + (mouse.y - 0.5) * 0.04 * dot.d);
            ctx.beginPath();
            ctx.arc(px * W, py * H, dot.r, 0, Math.PI * 2);
            ctx.fillStyle = dot.color;
            ctx.fill();
        }
        requestAnimationFrame(draw);
    });
})();
