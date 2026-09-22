/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   breakin.js — what happens after the scan (CONFIG.scan.sequence
   'breakin'). Being built one beat at a time:

   1. DENIED    the scan hits 100% and is refused: ERROR flickers on
                in red like SECURED, the screen shakes, and it stays.
   2. SLAP      an open palm comes in from the right, winds up and
                slaps ERROR, which tumbles into the bottom-left corner.
   (next)       a hand grabs the globe and shakes words out of it, …

   The hands are hand.js puppets. BreakIn.start() is called by scan.js
   once every row is in.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const BreakIn = (() => {

    const $ = id => document.getElementById(id);
    const E = Utils.easing;

    /* Knocked things fall under gravity, bounce off the floor and the left
       wall, slide to a stop and lie flat. Resolves once it's at rest. */
    const PHYS = {
        gravity: 2600,      // px/s²
        bounce:  0.35,      // share of the fall speed kept per floor bounce…
        grip:    0.6,       // …and of the sideways speed (so it can't skip away along the floor)
        wall:    0.12,      // share kept bouncing off the left wall — it thuds into the corner
        slide:   0.03,      // share of the sliding speed kept per second on the floor
        margin:  24,        // px from the window's edges
    };

    function knock(el, { vx, vy, spin }) {
        return new Promise(resolve => {
            const r  = el.getBoundingClientRect();
            const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2, w = r.width, h = r.height;
            let x = 0, y = 0, a = 0, still = 0, last = performance.now();

            requestAnimationFrame(function step(now) {
                const dt = Math.min((now - last) / 1000, 1 / 30);
                last = now;
                vy += PHYS.gravity * dt;
                x  += vx * dt;
                y  += vy * dt;
                a  += spin * dt;

                // Its half-size at this angle, so a tilted word still meets the floor edge-first
                const rad = a * Math.PI / 180, c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
                const hw = (w * c + h * s) / 2, hh = (w * s + h * c) / 2;
                const floor = innerHeight - PHYS.margin - hh - y0, wall = PHYS.margin + hw - x0;

                const onFloor = y >= floor, flat = Math.round(a / 180) * 180;
                if (onFloor) {
                    if (vy > 0) vx *= PHYS.grip;                 // landing
                    y  = floor;
                    vy = Math.abs(vy) > 90 ? -vy * PHYS.bounce : 0;
                    vx *= Math.pow(PHYS.slide, dt);
                    spin = 0;
                    a += (flat - a) * Utils.springStep(0.2, dt * 1000);   // tips over flat (gravity then lowers it)
                }
                if (x < wall) { x = wall; vx = -vx * PHYS.wall; }

                el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
                still = onFloor && Math.abs(vx) < 5 && vy === 0 && Math.abs(flat - a) < 0.5 ? still + dt : 0;
                still > 0.3 ? resolve() : requestAnimationFrame(step);
            });
        });
    }


    /* 1. The scan is refused */
    async function denied() {
        $('progressLabel').textContent = 'DENIED';
        await Utils.sleep(700);
        await Utils.flashWord($('errorFlash'), $('errorWord'), $('errorRipples'), {
            stay:  true,
            onLit: () => Utils.shakeScreen(12, 650),
        });
    }

    /* 2. An open palm slaps ERROR into the corner */
    async function slap() {
        const word = $('errorWord');
        const r = word.getBoundingClientRect(), cy = r.top + r.height / 2;
        const hand = Hands.create('right').pose('palm');

        // Drifts in from the upper right and hovers above the word — sizing it up
        hand.place({ x: innerWidth + 220, y: cy - 260, rot: 10 }).show(true);
        await hand.to({ x: r.right + 170, y: cy - 120, rot: 0 }, 1200, E.easeOutCubic);
        await Utils.sleep(450);

        // Wind up: back and up, cocked, a hitch at the top
        await hand.to({ x: r.right + 240, y: cy - 240, rot: -25 }, 420, E.easeInOutQuad);
        await Utils.sleep(110);

        // Strike: fast, down and left into the word's right half
        await hand.to({ x: r.left + r.width * 0.72, y: cy - 6, rot: 22 }, 130, E.easeInQuad);
        const fall = knock(word, { vx: -1300, vy: 420, spin: -110 });
        Utils.shakeScreen(9, 380);

        // Follow through, hang a moment, then leave the way it came
        await hand.to({ x: r.left + 30, y: cy + 110, rot: 40 }, 260, E.easeOutCubic);
        await Utils.sleep(550);
        await hand.to({ x: innerWidth + 320, y: cy - 180, rot: 5 }, 950, E.easeInOutCubic);
        hand.show(false);
        await fall;
    }

    async function start() {
        await Utils.sleep(900);         // a beat at 100% before it's refused
        await denied();
        await Utils.sleep(1300);        // ERROR sits there, glaring
        await slap();
    }

    return { start };
})();
