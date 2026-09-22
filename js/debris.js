/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   debris.js — things the hands knock about (breakin.js)

   Debris.fling(el, { vx, vy, spin, delay, fade, keep })
       takes an element from where it sits on screen and throws it:
       px/s, degrees/s, a delay before it starts moving (ms),
       optionally `fade` (ms) — a fleck that fades out instead of
       landing — and `keep`: walls stop it leaving the window.
       Returns its body.
   await Debris.settled()    everything has come to rest
   Debris.lift / place / release    a hand takes a piece out, carries
                             it, throws it back in (see below)
   Debris.shove(b, { vx, vy, spin })   knock a piece moving, resting or not

   Things fall, spin, bounce, slide to a stop and lie flat — on the
   floor or on whatever landed there first, so they pile up. The floor
   is a table: it stops just short of the window's sides, and anything
   that slides or flies past its edge tips off and falls out of sight
   (unless it's kept). The pile is a height per BIN px across the
   window (`surface`): cheap, and stable.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Debris = (() => {

    const PHYS = {
        gravity: 2600,      // px/s²
        bounce:  0.35,      // share of the fall speed kept per landing bounce…
        grip:    0.6,       // …and of the sideways speed (so things can't skip away along the floor)
        wall:    0.12,      // share kept bouncing off a side wall — they thud, not ping
        slide:   0.02,      // share of the sliding speed kept per second on the ground
        rest:    0.15,      // s still before it counts as settled
        reach:   48,        // a slope's too steep (it slides off) if the ground this far past an end…
        steep:   1.0,       // …being more than this many of its heights lower
        tilt:    8,         // degrees of random lean once it's lying in the pile
        margin:  24,        // px: the table top above the window's bottom; kept things' walls from its sides
        edge:    12,        // px: the table's edges in from the window's sides
    };
    const BIN = 6;          // px — the pile's resolution

    const bodies = [];
    let surface = null;     // per BIN column: the y the next thing lands on
    let landings = 0;       // counts first touches, so each body knows who landed before it
    let running = false;
    let waiters = [];

    // Its half-size at its angle, so a tilted thing meets the floor edge-first
    function half(b) {
        const rad = b.a * Math.PI / 180, c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
        return [(b.w * c + b.h * s) / 2, (b.w * s + b.h * c) / 2];
    }
    // The BIN columns under cx ± hw that are on the table (none past its edges)
    const bins = (cx, hw) => [Math.max(Math.ceil(PHYS.edge / BIN), Math.floor((cx - hw) / BIN)),
                              Math.min(surface.length - 1, Math.floor((cx + hw) / BIN))];

    // The highest ground under the span cx ± hw: the settled pile, and — for `self`,
    // unless pileOnly — anything still sliding about below it that landed before it,
    // so things that land together stack instead of sinking into each other.
    // Past the table's edges there's nothing: Infinity.
    function groundUnder(cx, hw, self, pileOnly = false) {
        const [i0, i1] = bins(cx, hw);
        let g = Infinity;
        for (let i = i0; i <= i1; i++) g = Math.min(g, surface[i]);
        if (pileOnly) return g;
        for (const o of bodies) {
            if (o !== self && o.grounded && !o.resting && o.landed < self.landed
                && o.cy - o.hh > self.cy && Math.abs(o.cx - cx) < o.hw + hw) g = Math.min(g, o.cy - o.hh);
        }
        return g;
    }
    function addToPile(b) {
        const [i0, i1] = bins(b.cx, b.w / 2), top = b.cy - b.h / 2;
        for (let i = i0; i <= i1; i++) surface[i] = Math.min(surface[i], top);
    }
    function rebuildPile() {
        surface = new Array(Math.floor((innerWidth - PHYS.edge) / BIN) + 1).fill(innerHeight - PHYS.margin);
        bodies.filter(b => b.resting).sort((p, q) => q.cy - p.cy).forEach(addToPile);
    }
    const unsettle = b => Object.assign(b, { resting: false, grounded: false, landed: Infinity, still: 0, nudges: 0 });

    // Something's been taken out of the pile or knocked loose: rebuild it bottom-up,
    // and anything left with nothing under it falls
    function repile() {
        surface.fill(innerHeight - PHYS.margin);
        for (const o of bodies.filter(o => o.resting).sort((p, q) => (q.cy + q.h / 2) - (p.cy + p.h / 2))) {
            if (groundUnder(o.cx, o.w / 2, o, true) - (o.cy + o.h / 2) > 2) Object.assign(unsettle(o), { vx: 0, vy: 0 });
            else addToPile(o);
        }
        start();
    }

    const draw = b => { b.el.style.transform = `translate(${b.cx - b.w / 2}px, ${b.cy - b.h / 2}px) rotate(${b.a}deg)`; };

    function fling(el, { vx = 0, vy = 0, spin = 0, delay = 0, fade = 0, keep = false } = {}) {
        if (!surface) rebuildPile();
        const r = el.getBoundingClientRect();
        Object.assign(el.style, { position: 'fixed', left: '0', top: '0', margin: '0',
                                  width: r.width + 'px', height: r.height + 'px', transformOrigin: '50% 50%' });
        const b = { el, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
                    vx, vy, spin, a: 0, wait: delay / 1000, still: 0, nudges: 0, resting: false, life: fade / 1000, age: 0,
                    hw: r.width / 2, hh: r.height / 2, grounded: false, landed: Infinity, keep };
        draw(b);
        bodies.push(b);
        start();
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

            const wasX = b.cx, wasBottom = b.cy + b.hh;
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
            b.hw = hw;
            b.hh = hh;
            let ground = groundUnder(b.cx, hw, b);
            // Sliding into something taller: it bumps and stops — it doesn't climb up onto it
            if (b.grounded && ground < wasBottom - Math.max(6, b.h * 0.4)) {
                b.cx = wasX;
                b.vx *= -0.15;
                ground = groundUnder(b.cx, hw, b);
            }
            const flat = Math.round(b.a / 180) * 180;
            const onGround = b.grounded = b.cy + hh >= ground;
            if (onGround && b.landed === Infinity) b.landed = ++landings;
            if (onGround) {
                if (b.vy > 0) b.vx *= PHYS.grip;            // landing
                b.cy = ground - hh;
                b.vy = Math.abs(b.vy) > 90 ? -b.vy * PHYS.bounce : 0;
                b.vx *= Math.pow(PHYS.slide, dt);
                b.spin = 0;
                b.a += (flat - b.a) * Utils.springStep(0.25, dt * 1000);  // tips over flat (gravity then lowers it)
            }
            if (b.keep) {                                   // kept on screen by walls
                if (b.cx - hw < PHYS.margin)              { b.cx = PHYS.margin + hw;              b.vx = -b.vx * PHYS.wall; }
                if (b.cx + hw > innerWidth - PHYS.margin) { b.cx = innerWidth - PHYS.margin - hw; b.vx = -b.vx * PHYS.wall; }
            } else if (b.cy - hh > innerHeight + 40) {      // fell off the table, out of sight
                b.el.remove();
                b.resting = b.gone = true;
                continue;
            }

            b.still = onGround && Math.abs(b.vx) < 5 && b.vy === 0 && Math.abs(flat - b.a) < 0.5 ? b.still + dt : 0;
            if (b.still > PHYS.rest && b.nudges < 10) {
                // Can it stay here? Not if its middle has nothing under it (propped up by one
                // end — it tips off), nor if the ground just past either end is much lower
                // than where it's lying (a slope limit, like sand). Either way it slides off
                // towards the lower side, so the pile spreads into a heap, not a tower —
                // and at the table's edge, off it. (A few tries at most: against a wall
                // a kept thing could otherwise never settle.)
                const s = PHYS.reach, bottom = b.cy + b.h / 2;
                const hollow = groundUnder(b.cx, b.w * 0.2, b) - bottom > b.h * 0.5;
                const dropL = groundUnder(b.cx - b.w / 2 - s, s, b) - bottom, dropR = groundUnder(b.cx + b.w / 2 + s, s, b) - bottom;
                if (hollow || Math.max(dropL, dropR) > b.h * PHYS.steep) {
                    const right = hollow ? groundUnder(b.cx + b.w / 4, b.w / 4, b) >= groundUnder(b.cx - b.w / 4, b.w / 4, b) : dropR >= dropL;
                    // an easy push — about a third of its length, a few times if need be
                    b.vx = (right ? 1 : -1) * (b.w * 0.35 + s) * -Math.log(PHYS.slide);
                    b.still = 0;
                    b.nudges++;
                }
            }
            // Only settle on settled things: if what it's lying on is still sliding, wait
            if (b.still > PHYS.rest && groundUnder(b.cx, b.w / 2, b, true) - (b.cy + b.h / 2) > 2) b.still = PHYS.rest;
            else if (b.still > PHYS.rest) {                 // at rest: on the pile, very nearly flat
                b.a = flat + (Math.random() - 0.5) * PHYS.tilt;
                b.cy = groundUnder(b.cx, b.w / 2, b, true) - b.h / 2;
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

    function start() {
        if (!running) { running = true; last = performance.now(); requestAnimationFrame(step); }
    }

    /* Hands picking things out of the pile (breakin.js):
         lift(b)                 takes it out of the physics — whatever was lying
                                 on it loses its support and drops
         place(b, cx, cy, deg)   puts it somewhere (while a hand carries it)
         release(b, { vx, vy, spin })   back into the physics, thrown */
    function lift(b) {
        bodies.splice(bodies.indexOf(b), 1);
        repile();
        return b;
    }
    function place(b, cx, cy, a = b.a) {
        Object.assign(b, { cx, cy, a });
        draw(b);
    }
    function release(b, { vx = 0, vy = 0, spin = 0, keep = b.keep } = {}) {
        Object.assign(unsettle(b), { vx, vy, spin, keep, wait: 0 });
        bodies.push(b);
        start();
    }
    function shove(b, { vx = 0, vy = 0, spin = 0 } = {}) {
        const was = b.resting;
        Object.assign(unsettle(b), { vx, vy, spin });
        was ? repile() : start();
    }
    addEventListener('resize', () => { if (surface) rebuildPile(); });

    return { fling, settled, lift, place, release, shove, bodies };
})();
