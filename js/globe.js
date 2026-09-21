/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   globe.js — the spinning red dot globe + its four pin lines,
              and the drifting background dots (bottom of file)

   Drawn on #globeCanvas (2D). Its centre is a % of the viewport and
   tweens when startGlobeMove() is called; its size follows the
   wordmark's width.

   PINS: four points on the globe, each drawing a line out to a box
   near a screen corner. When all four finish, 'globe:pins-complete'
   fires (music.js starts the radio on it).

   window.startGlobeMove(xPct, yPct)   scan.js / session.js
   window.startPinLines()              arg.js / session.js
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

    // Box centres as fractions of the viewport, one per pin
    const BOX_ANCHORS = [{ x: 0.18, y: 0.78 }, { x: 0.18, y: 0.22 }, { x: 0.82, y: 0.22 }, { x: 0.82, y: 0.78 }];

    // Each pin's (lat, lon) range, one per hemisphere quarter
    const PIN_ZONES = [
        [0.1, Math.PI / 2, 0, Math.PI], [0.1, Math.PI / 2, Math.PI, Math.PI * 2],
        [Math.PI / 2, Math.PI * 0.9, 0, Math.PI], [Math.PI / 2, Math.PI * 0.9, Math.PI, Math.PI * 2],
    ];

    const COS_X = Math.cos(TILT_X), SIN_X = Math.sin(TILT_X);
    const COS_Z = Math.cos(TILT_Z), SIN_Z = Math.sin(TILT_Z);

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

    /* Rotate a unit-sphere point (spin about Y, then tilt X, then Z),
       scale to radius, and project around (cx, cy). Returns [x, y, depth 0–1]. */
    function project([ux, uy, uz], spin, radius, cx, cy) {
        const cosS = Math.cos(spin), sinS = Math.sin(spin);
        const x1 = ux * cosS - uz * sinS;
        const z1 = ux * sinS + uz * cosS;
        const y2 = uy * COS_X - z1 * SIN_X;
        const z2 = uy * SIN_X + z1 * COS_X;
        const x3 = x1 * COS_Z - y2 * SIN_Z;
        const y3 = x1 * SIN_Z + y2 * COS_Z;
        const p  = PERSPECTIVE / (PERSPECTIVE + z2 * radius);
        return [cx + x3 * radius * p, cy + y3 * radius * p, (z2 + 1) / 2];
    }


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
        }

        // Globe radius follows the wordmark width (cached — reading layout every frame is slow)
        let radius = 300 * 0.7 * CONFIG.globe.size;
        new ResizeObserver(() => {
            radius = (wordmark.offsetWidth || 300) * 0.7 * CONFIG.globe.size;
        }).observe(wordmark);


        /* ── Position tween ── */

        let pos  = { x: CONFIG.globe.initialX, y: CONFIG.globe.initialY };
        let move = null;    // { from, to, start }

        window.startGlobeMove = (x, y) => {
            move = { from: { ...pos }, to: { x, y }, start: performance.now() };
        };


        /* ── Pins ── */

        const svg = (tag, attrs) => {
            const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
            for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
            return overlay.appendChild(el);
        };

        const pins = PIN_ZONES.map(([latMin, latMax, lonMin, lonMax], i) => {
            const lat = latMin + Math.random() * (latMax - latMin);
            const lon = lonMin + Math.random() * (lonMax - lonMin);
            return {
                unit:   [Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon)],
                anchor: BOX_ANCHORS[i],
                line:   svg('line', { stroke: 'rgba(255,0,0,0.7)', 'stroke-width': 1.5, opacity: 0 }),
                box:    svg('rect', { stroke: 'rgba(255,0,0,0.7)', 'stroke-width': 1.5, fill: 'rgba(245,242,236,0.92)',
                                      rx: 2, width: BOX_W, height: BOX_H, opacity: 0 }),
                start:  null,   // ms timestamp once drawing starts
            };
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

        fitCanvas();
        addEventListener('resize', fitCanvas);


        /* ── Frame ── */

        function draw(now) {
            requestAnimationFrame(draw);

            if (move) {
                const t = Math.min((now - move.start) / CONFIG.globe.moveDuration, 1);
                const e = Utils.easing.easeInOutQuad(t);
                pos = { x: Utils.lerp(move.from.x, move.to.x, e), y: Utils.lerp(move.from.y, move.to.y, e) };
                if (t === 1) move = null;
            }
            const cx   = innerWidth  * pos.x / 100;
            const cy   = innerHeight * pos.y / 100;
            const spin = Date.now() * 0.001 * CONFIG.globe.speed;

            // Sort dots into depth levels, then draw each level with one fillStyle
            levelCount.fill(0);
            for (const dot of DOTS) {
                const [x, y, depth] = project(dot, spin, radius, cx, cy);
                const level = Math.min(ALPHA_LEVELS - 1, Math.floor(depth * ALPHA_LEVELS));
                const n = levelCount[level]++ * 2;
                levelXY[level][n]     = x;
                levelXY[level][n + 1] = y;
            }
            ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            for (let level = 0; level < ALPHA_LEVELS; level++) {
                ctx.fillStyle = LEVEL_STYLE[level];
                const xy = levelXY[level];
                for (let i = 0; i < levelCount[level] * 2; i += 2) ctx.fillRect(xy[i], xy[i + 1], DOT_SIZE, DOT_SIZE);
            }

            // Pin lines grow from the (moving) globe point out to their box
            for (const pin of pins) {
                if (pin.start === null) continue;
                const progress = Math.min((now - pin.start) / PIN_DRAW_MS, 1);
                const [px, py] = project(pin.unit, spin, radius, cx, cy);
                const bx = pin.anchor.x * innerWidth, by = pin.anchor.y * innerHeight;
                pin.line.setAttribute('x1', px + DOT_SIZE / 2);
                pin.line.setAttribute('y1', py + DOT_SIZE / 2);
                pin.line.setAttribute('x2', px + (bx - px) * progress);
                pin.line.setAttribute('y2', py + (by - py) * progress);
                pin.line.setAttribute('opacity', 1);
                if (progress === 1) pin.box.setAttribute('opacity', 1);
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

        ctx.clearRect(0, 0, W, H);
        for (const dot of dots) {
            dot.x = wrap(dot.x + dot.vx * dt);
            dot.y = wrap(dot.y + dot.vy * dt);
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
