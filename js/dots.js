/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   dots.js  —  DOT CANVAS BACKGROUND

   Renders ~65 small dots onto #dotCanvas that drift slowly and
   shift slightly with mouse position (parallax effect). Each dot
   has its own depth value `d` which controls how much it responds
   to mouse movement — deeper dots move less, shallower dots more.

   The canvas is transparent except for the dots themselves, and
   sits at z-index:0 (the very back of the stack).

   PERFORMANCE:
   - requestAnimationFrame loop — runs at display refresh rate
   - clearRect + fillRect on each frame (no compositing tricks needed
     at this dot count and size)
   - mouseX/Y are smoothed with lerp so mouse movement feels fluid
     without the dots snapping to every raw mousemove event
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DotCanvas = (() => {

    /* ── Canvas + context ── */
    const canvas = document.getElementById('dotCanvas');
    const ctx    = canvas.getContext('2d');

    /* ── Viewport dimensions ── */
    let W = 0;
    let H = 0;

    function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    /* ── Dot data ─────────────────────────────────────────────
       Each dot is a plain object with:
         x, y  — normalised position (0–1), wraps at edges
         r     — radius in screen pixels
         vx,vy — drift velocity (normalised per frame)
         d     — depth (0–1), controls parallax strength and alpha */
    const DOT_COUNT = 65;
    const dots = Array.from({ length: DOT_COUNT }, () => ({
        x:  Math.random(),
        y:  Math.random(),
        r:  Math.random() * 1.3 + 0.3,
        vx: (Math.random() - 0.5) * 0.00007,
        vy: (Math.random() - 0.5) * 0.00007,
        d:  Math.random(),
    }));

    /* ── Mouse tracking ──
       `targetMouse` updates on every mousemove.
       `currentMouse` lerps toward it each frame — smoothing. */
    const currentMouse = { x: 0.5, y: 0.5 };
    const targetMouse  = { x: 0.5, y: 0.5 };

    document.addEventListener('mousemove', e => {
        targetMouse.x = e.clientX / W;
        targetMouse.y = e.clientY / H;
    });


    /* ════════════════════════════════════════════════════════
       RENDER LOOP
    ════════════════════════════════════════════════════════ */

    function draw() {
        // Smooth mouse toward target (~4% per frame at 60fps)
        currentMouse.x += (targetMouse.x - currentMouse.x) * 0.04;
        currentMouse.y += (targetMouse.y - currentMouse.y) * 0.04;

        ctx.clearRect(0, 0, W, H);

        for (const dot of dots) {
            // Drift — position wraps at 0 and 1 using modulo
            dot.x = (dot.x + dot.vx + 1) % 1;
            dot.y = (dot.y + dot.vy + 1) % 1;

            // Parallax offset: deeper dots (d close to 0) move less
            const px = (dot.x + (currentMouse.x - 0.5) * 0.05 * dot.d) % 1;
            const py = (dot.y + (currentMouse.y - 0.5) * 0.04 * dot.d) % 1;

            // Alpha varies with depth — far dots are dimmer
            ctx.beginPath();
            ctx.arc(px * W, py * H, dot.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(26, 26, 24, ${(0.2 + dot.d * 0.3).toFixed(2)})`;
            ctx.fill();
        }

        requestAnimationFrame(draw);
    }

    // Start immediately — dots are part of the base background layer
    requestAnimationFrame(draw);

    // No public API needed — this module is entirely self-contained
    return {};

})();
