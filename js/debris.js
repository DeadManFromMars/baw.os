/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   debris.js — things the hands knock about (breakin.js)

   Debris.fling(el, { vx, vy, spin, delay, fade })
       takes an element from where it sits on screen and throws it:
       px/s, degrees/s, a delay before it starts moving (ms), and
       optionally `fade` (ms) — a fleck that fades out instead of
       landing. Returns its body.
   await Debris.settled()    everything has come to rest

   Things fall, spin, bounce off the floor and the side walls, slide
   to a stop and lie flat — on the floor or on whatever landed there
   first, so they pile up. The pile is a height per BIN px across the
   window (`surface`): cheap, and stable.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Debris = (() => {

    const PHYS = {
        gravity: 2600,      // px/s²
        bounce:  0.35,      // share of the fall speed kept per landing bounce…
        grip:    0.6,       // …and of the sideways speed (so things can't skip away along the floor)
        wall:    0.12,      // share kept bouncing off a side wall — they thud, not ping
        slide:   0.03,      // share of the sliding speed kept per second on the ground
        slideOff: 260,      // px/s nudge off a slope that's too steep…
        reach:   48,        // …judged by the ground this far past each end…
        steep:   1.0,       // …being more than this many of its heights lower
        tilt:    8,         // degrees of random lean once it's lying in the pile
        margin:  24,        // px from the window's edges
    };
    const BIN = 6;          // px — the pile's resolution

    const bodies = [];
    let surface = null;     // per BIN column: the y the next thing lands on
    let running = false;
    let waiters = [];

    // Its half-size at its angle, so a tilted thing meets the floor edge-first
    function half(b) {
        const rad = b.a * Math.PI / 180, c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
        return [(b.w * c + b.h * s) / 2, (b.w * s + b.h * c) / 2];
    }
    const bins = (cx, hw) => [Math.max(0, Math.floor((cx - hw) / BIN)), Math.min(surface.length - 1, Math.floor((cx + hw) / BIN))];

    function groundUnder(cx, hw) {
        const [i0, i1] = bins(cx, hw);
        let g = Infinity;
        for (let i = i0; i <= i1; i++) g = Math.min(g, surface[i]);
        return g;
    }
    function addToPile(b) {
        const [i0, i1] = bins(b.cx, b.w / 2), top = b.cy - b.h / 2;
        for (let i = i0; i <= i1; i++) surface[i] = Math.min(surface[i], top);
    }
    function rebuildPile() {
        surface = new Array(Math.ceil(innerWidth / BIN) + 1).fill(innerHeight - PHYS.margin);
        bodies.filter(b => b.resting).sort((p, q) => q.cy - p.cy).forEach(addToPile);
    }

    const draw = b => { b.el.style.transform = `translate(${b.cx - b.w / 2}px, ${b.cy - b.h / 2}px) rotate(${b.a}deg)`; };

    function fling(el, { vx = 0, vy = 0, spin = 0, delay = 0, fade = 0 } = {}) {
        if (!surface) rebuildPile();
        const r = el.getBoundingClientRect();
        Object.assign(el.style, { position: 'fixed', left: '0', top: '0', margin: '0',
                                  width: r.width + 'px', height: r.height + 'px', transformOrigin: '50% 50%' });
        const b = { el, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
                    vx, vy, spin, a: 0, wait: delay / 1000, still: 0, nudges: 0, resting: false, life: fade / 1000, age: 0 };
        draw(b);
        bodies.push(b);
        if (!running) { running = true; last = performance.now(); requestAnimationFrame(step); }
        return b;
    }

    let last = 0;
    function step(now) {
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;
        let moving = false;

        for (const b of bodies) {
            if (b.resting) continue;
            moving = true;
            if (b.wait > 0) { b.wait -= dt; continue; }

            b.vy += PHYS.gravity * dt;
            b.cx += b.vx * dt;
            b.cy += b.vy * dt;
            b.a  += b.spin * dt;

            if (b.life) {                                   // a fleck: fades, never lands
                b.age += dt;
                b.el.style.opacity = Math.max(0, 1 - b.age / b.life);
                if (b.age >= b.life) { b.el.remove(); b.resting = true; b.gone = true; continue; }
                draw(b);
                continue;
            }

            const [hw, hh] = half(b);
            const ground = groundUnder(b.cx, hw), flat = Math.round(b.a / 180) * 180;
            const onGround = b.cy + hh >= ground;
            if (onGround) {
                if (b.vy > 0) b.vx *= PHYS.grip;            // landing
                b.cy = ground - hh;
                b.vy = Math.abs(b.vy) > 90 ? -b.vy * PHYS.bounce : 0;
                b.vx *= Math.pow(PHYS.slide, dt);
                b.spin = 0;
                b.a += (flat - b.a) * Utils.springStep(0.2, dt * 1000);   // tips over flat (gravity then lowers it)
            }
            if (b.cx - hw < PHYS.margin)              { b.cx = PHYS.margin + hw;              b.vx = -b.vx * PHYS.wall; }
            if (b.cx + hw > innerWidth - PHYS.margin) { b.cx = innerWidth - PHYS.margin - hw; b.vx = -b.vx * PHYS.wall; }

            b.still = onGround && Math.abs(b.vx) < 5 && b.vy === 0 && Math.abs(flat - b.a) < 0.5 ? b.still + dt : 0;
            if (b.still > 0.3 && b.nudges < 8) {
                // Too steep here? If the ground just past either end is much lower than
                // where it's lying, slide off that way — so the pile spreads into a heap
                // instead of stacking into a tower (a slope limit, like sand).
                // (A few tries at most: against a wall it could otherwise never settle.)
                const s = PHYS.reach, here = b.cy + b.h / 2;
                const dropL = groundUnder(b.cx - b.w / 2 - s, s) - here, dropR = groundUnder(b.cx + b.w / 2 + s, s) - here;
                const drop = Math.max(dropL, dropR);
                if (drop > b.h * PHYS.steep) { b.vx = (dropR >= dropL ? 1 : -1) * PHYS.slideOff; b.still = 0; b.nudges++; }
            }
            if (b.still > 0.3) {                            // at rest: on the pile, very nearly flat
                b.a = flat + (Math.random() - 0.5) * PHYS.tilt;
                b.cy = groundUnder(b.cx, b.w / 2) - b.h / 2;
                b.resting = true;
                addToPile(b);
            }
            draw(b);
        }

        for (let i = bodies.length - 1; i >= 0; i--) if (bodies[i].gone) bodies.splice(i, 1);
        if (moving) requestAnimationFrame(step);
        else { running = false; waiters.forEach(r => r()); waiters = []; }
    }

    const settled = () => running ? new Promise(r => waiters.push(r)) : Promise.resolve();

    addEventListener('resize', () => { if (surface) rebuildPile(); });

    return { fling, settled, bodies };
})();
