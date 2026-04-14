/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   globe.js  —  SPINNING DOT GLOBE + PIN LINES

   Renders a 3D dot globe onto #globeCanvas using a simple
   spherical coordinate system with three rotation axes:
     - Spin (Y axis): continuous auto-rotation over time
     - TiltX / TiltZ: fixed tilt to orient the globe attractively

   The globe position animates smoothly when startGlobeMove() is
   called — it tweens from current to target position over
   MOVE_DURATION milliseconds using a quadratic ease-in-out.

   PIN SYSTEM:
   Four "pins" are placed on the globe surface at random lat/lon
   positions. Each pin draws a line from its surface position to
   a fixed screen-space anchor (corner of the screen). Lines
   animate outward using a linear progress value (0→1).
   Once all four pins reach 1.0, the radio music starts.

   PUBLIC API:
     window.startGlobeMove(toX, toY) — animate globe to new position (% of viewport)
     window.startPinLines()          — begin drawing pin lines outward
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(() => {
    document.addEventListener('DOMContentLoaded', () => {

        const canvas  = document.getElementById('globeCanvas');
        const overlay = document.getElementById('globeOverlay');
        if (!canvas || !overlay) return;

        const ctx = canvas.getContext('2d');

        /* ── Globe orientation constants ── */
        const TILT_X      = 0.98;   // radians — how far the globe leans back
        const TILT_Z      = 0.40;   // radians — how far it leans sideways
        const SPIN_SPEED  = CONFIG.globe.speed;  // radians per second
        const PIN_COUNT   = 4;

        let musicStarted = false;

        /* ── Canvas resize ── */
        function resizeCanvas() {
            const dpr = window.devicePixelRatio || 1;
            canvas.width  = window.innerWidth  * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width  = window.innerWidth  + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        // Re-run after fonts/layout settle
        setTimeout(resizeCanvas, 1400);


        /* ════════════════════════════════════════════════════
           POSITION ANIMATION
           The globe centre is expressed as % of viewport so it
           adapts to any screen size. JS animates between positions.
        ════════════════════════════════════════════════════ */

        let currentX = CONFIG.globe.initialX;
        let currentY = CONFIG.globe.initialY;
        let startX   = currentX;
        let startY   = currentY;
        let targetX  = currentX;
        let targetY  = currentY;
        let moveStart = null;

        /* Called from session.js and scan.js.
           Exposed on window so modules that load before globe.js
           can reference it without a module system. */
        window.startGlobeMove = (toX, toY) => {
            startX    = currentX;
            startY    = currentY;
            targetX   = toX;
            targetY   = toY;
            moveStart = performance.now();
        };


        /* ════════════════════════════════════════════════════
           PIN SYSTEM
           Each pin lives at a specific (lat, lon) on the sphere
           and connects via a line to a fixed screen-space box anchor.
        ════════════════════════════════════════════════════ */

        /* Screen-space anchor corners (normalised 0–1) */
        const BOX_ANCHORS = [
            { x: 0.18, y: 0.78 },  // bottom-left
            { x: 0.18, y: 0.22 },  // top-left
            { x: 0.82, y: 0.22 },  // top-right
            { x: 0.82, y: 0.78 },  // bottom-right
        ];

        /* Place one pin per screen quadrant so lines go to all four corners. */
        function createPins() {
            const quadrants = [
                { latMin: 0.1,          latMax: Math.PI / 2,   lonMin: 0,         lonMax: Math.PI },
                { latMin: 0.1,          latMax: Math.PI / 2,   lonMin: Math.PI,   lonMax: Math.PI * 2 },
                { latMin: Math.PI / 2,  latMax: Math.PI * 0.9, lonMin: 0,         lonMax: Math.PI },
                { latMin: Math.PI / 2,  latMax: Math.PI * 0.9, lonMin: Math.PI,   lonMax: Math.PI * 2 },
            ];

            return quadrants.slice(0, PIN_COUNT).map((q, i) => ({
                lat:      q.latMin + Math.random() * (q.latMax - q.latMin),
                lon:      q.lonMin + Math.random() * (q.lonMax - q.lonMin),
                boxX:     BOX_ANCHORS[i].x * window.innerWidth,
                boxY:     BOX_ANCHORS[i].y * window.innerHeight,
                boxW:     220, boxH: 160,
                lineEl:   null,
                boxEl:    null,
                visible:  false,
                progress: 0,    // 0 = not started, 1 = line fully drawn
            }));
        }

        const pins = createPins();

        /* Create SVG elements for each pin's line and box.
           They live in #globeOverlay so they render above the canvas. */
        for (const pin of pins) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('stroke', 'rgba(255,0,0,0.7)');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('opacity', '0');
            overlay.appendChild(line);
            pin.lineEl = line;

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('stroke',       'rgba(255,0,0,0.7)');
            rect.setAttribute('stroke-width', '1.5');
            rect.setAttribute('fill',         'rgba(245,242,236,0.92)');
            rect.setAttribute('rx',           '2');
            rect.setAttribute('opacity',      '0');
            rect.setAttribute('x',            pin.boxX - pin.boxW / 2);
            rect.setAttribute('y',            pin.boxY - pin.boxH / 2);
            rect.setAttribute('width',        pin.boxW);
            rect.setAttribute('height',       pin.boxH);
            overlay.appendChild(rect);
            pin.boxEl = rect;
        }

        /* Projects a (lat, lon) sphere point through the current rotation
           into screen space. Returns { x, y, z } — z is depth (for front/back). */
        function projectPin(lat, lon, cx, cy, radius, spinY, cosX, sinX, cosZ, sinZ) {
            // Spherical → Cartesian
            let x = radius * Math.sin(lat) * Math.cos(lon);
            let y = radius * Math.cos(lat);
            let z = radius * Math.sin(lat) * Math.sin(lon);

            // Apply spin (Y axis rotation)
            const x1 =  x * Math.cos(spinY) - z * Math.sin(spinY);
            const z1 =  x * Math.sin(spinY) + z * Math.cos(spinY);

            // Apply tiltX (X axis rotation)
            const y2 =  y * cosX - z1 * sinX;
            const z2 =  y * sinX + z1 * cosX;

            // Apply tiltZ (Z axis rotation)
            const x3 =  x1 * cosZ - y2 * sinZ;
            const y3 =  x1 * sinZ + y2 * cosZ;

            // Perspective divide
            const p = 300 / (300 + z2);
            return { x: cx + x3 * p, y: cy + y3 * p, z: z2 };
        }

        /* Called by arg.js after registration / card upload.
           Exposed on window for the same reason as startGlobeMove. */
        window.startPinLines = () => {
            for (const pin of pins) pin.visible = true;
        };


        /* ════════════════════════════════════════════════════
           DRAW LOOP
        ════════════════════════════════════════════════════ */

        function drawFrame(timestamp) {
            const dpr      = window.devicePixelRatio || 1;
            const logicalW = canvas.width  / dpr;
            const logicalH = canvas.height / dpr;
            ctx.clearRect(0, 0, logicalW, logicalH);

            /* ── Animate position ── */
            if (moveStart !== null) {
                const t = Math.min((timestamp - moveStart) / CONFIG.globe.moveDuration, 1);
                const e = Utils.easing.easeInOutQuad(t);
                currentX = Utils.lerp(startX, targetX, e);
                currentY = Utils.lerp(startY, targetY, e);
                if (t >= 1) moveStart = null;
            }

            const cx = window.innerWidth  * (currentX / 100);
            const cy = window.innerHeight * (currentY / 100);

            /* Globe radius is proportional to the wordmark width —
               so it scales naturally with font size changes. */
            const wordmark = document.querySelector('.scan-wordmark');
            const radius   = (wordmark ? wordmark.offsetWidth : 300) * 0.7 * CONFIG.globe.size;

            const spinY = (Date.now() * 0.001) * SPIN_SPEED;
            const cosX  = Math.cos(TILT_X), sinX = Math.sin(TILT_X);
            const cosZ  = Math.cos(TILT_Z), sinZ = Math.sin(TILT_Z);

            /* ── Draw globe dot cloud ── */
            // Iterate lat/lon at 0.08-radian steps — gives ~2500 dots.
            // Each dot's alpha is modulated by its Z depth to simulate
            // the back hemisphere being dimmer than the front.
            for (let lat = 0; lat < Math.PI; lat += 0.08) {
                for (let lon = 0; lon < Math.PI * 2; lon += 0.08) {
                    let x = radius * Math.sin(lat) * Math.cos(lon);
                    let y = radius * Math.cos(lat);
                    let z = radius * Math.sin(lat) * Math.sin(lon);

                    const x1 = x * Math.cos(spinY) - z * Math.sin(spinY);
                    const z1 = x * Math.sin(spinY) + z * Math.cos(spinY);
                    const y2 = y * cosX - z1 * sinX;
                    const z2 = y * sinX + z1 * cosX;
                    const x3 = x1 * cosZ - y2 * sinZ;
                    const y3 = x1 * sinZ + y2 * cosZ;

                    const p     = 300 / (300 + z2);
                    const sx    = cx + x3 * p;
                    const sy    = cy + y3 * p;
                    const depth = (z2 + radius) / (2 * radius);  // 0 = back, 1 = front
                    const alpha = 0.3 + depth * 0.7;

                    ctx.fillStyle = `rgba(255, 0, 0, ${alpha.toFixed(2)})`;
                    ctx.fillRect(sx, sy, 1.5, 1.5);
                }
            }

            /* ── Animate pin lines ── */
            for (const pin of pins) {
                if (!pin.visible) continue;
                pin.progress = Math.min(pin.progress + 0.007, 1);

                const proj   = projectPin(pin.lat, pin.lon, cx, cy, radius, spinY, cosX, sinX, cosZ, sinZ);
                const curEndX = proj.x + (pin.boxX - proj.x) * pin.progress;
                const curEndY = proj.y + (pin.boxY - proj.y) * pin.progress;

                pin.lineEl.setAttribute('x1', proj.x + 0.75);
                pin.lineEl.setAttribute('y1', proj.y + 0.75);
                pin.lineEl.setAttribute('x2', curEndX);
                pin.lineEl.setAttribute('y2', curEndY);
                pin.lineEl.setAttribute('opacity', '1');

                if (pin.progress >= 1) pin.boxEl.setAttribute('opacity', '1');
            }

            /* ── Once all pin lines are done: start music + show choice ── */
            if (!musicStarted && pins.length > 0 && pins.every(p => p.progress >= 1)) {
                musicStarted = true;
                // Fire event — Radio listens and starts when ready
                document.dispatchEvent(new CustomEvent('globe:pins-complete'));
                if (window.showArgChoice) window.showArgChoice();
            }

            requestAnimationFrame(drawFrame);
        }

        requestAnimationFrame(drawFrame);
    });
})();
