/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   breakin.js — what happens after the scan (CONFIG.scan.sequence
   'breakin'). Being built one beat at a time:

   1. DENIED    the scan hits 100% and is refused: ERROR flickers on
                in red like SECURED, the screen shakes, and it stays.
   2. SLAP      an open palm comes in from the right, winds up and
                slaps ERROR, which tumbles into the bottom-left corner.
   3. PUNCH     a fist punches through the scan's column of text: it
                bursts, words fly, and the rest of the tower crumbles
                into a pile at the bottom.
   (next)       two hands pick up the globe and crack it like an egg;
                words pour out like a yolk, …

   The hands are hand.js puppets; everything knocked about is debris.js.
   BreakIn.start() is called by scan.js once every row is in.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const BreakIn = (() => {

    const $ = id => document.getElementById(id);
    const E = Utils.easing;
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);


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
        Debris.fling(word, { vx: -1300, vy: 420, spin: -110 });
        Utils.shakeScreen(9, 380);

        // Follow through, hang a moment, then leave the way it came
        await hand.to({ x: r.left + 30, y: cy + 110, rot: 40 }, 260, E.easeOutCubic);
        await Utils.sleep(550);
        await hand.to({ x: innerWidth + 320, y: cy - 180, rot: 5 }, 950, E.easeInOutCubic);
        hand.show(false);
        await Debris.settled();
    }


    /* 3. A fist through the column of text */

    // Every word, value, mark and rule of the column becomes a loose piece
    // (a copy placed exactly over it), and the column itself goes
    function shatter(column) {
        const layer = $('debrisLayer'), pieces = [];
        const place = (el, r) => {
            Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px' });
            layer.appendChild(el);
            pieces.push({ el, x: r.left + r.width / 2, y: r.top + r.height / 2 });
        };

        const TEXT = '.scan-panel-head span, .scan-line-key, .scan-line-val, .scan-line-check, .scan-progress span';
        for (const src of column.querySelectorAll(TEXT)) {
            const r = src.getBoundingClientRect();
            if (!r.width || !src.textContent.trim()) continue;
            const cs = getComputedStyle(src), piece = document.createElement('div');
            piece.className = 'debris-word';
            piece.textContent = src.textContent;
            for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color', 'lineHeight']) piece.style[p] = cs[p];
            place(piece, r);
        }
        // The rules between rows, and the progress bar
        for (const src of column.querySelectorAll('.scan-line, .scan-panel-head, .progress-track')) {
            const r = src.getBoundingClientRect();
            if (!r.width) continue;
            const rule = document.createElement('div');
            rule.className = 'debris-rule' + (src.matches('.progress-track') ? ' red' : '');
            Object.assign(rule.style, { width: r.width + 'px' });
            place(rule, { left: r.left, top: r.bottom - 1, width: r.width, height: 1 });
        }
        column.style.visibility = 'hidden';
        return pieces;
    }

    // Close to the fist: thrown hard, away from it and on in the punch's
    // direction (left). Further up the tower: pushed less — it loses what
    // held it up and topples, scattering as it comes down, the higher bits
    // a moment later.
    function explode(pieces, at) {
        for (const p of pieces) {
            const dx = p.x - at.x, dy = p.y - at.y, d = Math.hypot(dx, dy) || 1;
            const blast = 2400 * Math.exp(-d / 220);
            Debris.fling(p.el, {
                vx:    dx / d * blast - 800 * Math.exp(-d / 260) + rand(-260, 260),
                vy:    dy / d * blast - 450 * Math.exp(-d / 220) + rand(-120, 40),
                spin:  rand(-1, 1) * (120 + blast * 0.4),
                delay: dy < 0 && blast < 600 ? -dy * 0.3 + rand(0, 140) : rand(0, 30),
            });
        }
        // A puff of flecks from the hole
        for (let i = 0; i < 16; i++) {
            const fleck = document.createElement('div');
            fleck.className = 'debris-fleck' + (i % 3 ? '' : ' red');
            Object.assign(fleck.style, { left: at.x + 'px', top: at.y + 'px' });
            $('debrisLayer').appendChild(fleck);
            const angle = rand(0, Math.PI * 2), speed = rand(500, 1400);
            Debris.fling(fleck, { vx: Math.cos(angle) * speed - 300, vy: Math.sin(angle) * speed - 300, spin: rand(-900, 900), fade: rand(500, 1000) });
        }
    }

    async function punch() {
        const column = document.querySelector('.scan-left');
        const c = column.getBoundingClientRect(), cy = c.top + c.height * 0.55;
        const hit = { x: c.left + c.width * 0.55, y: cy };
        const hand = Hands.create('right').pose('fist');

        // Comes in low from the right and squares up beside the column
        hand.place({ x: innerWidth + 240, y: cy + 160, rot: 12 }).show(true);
        await hand.to({ x: c.right + 230, y: cy, rot: 0 }, 1100, E.easeOutCubic);
        await Utils.sleep(320);

        // Draws back
        await hand.to({ x: c.right + 340, y: cy + 12, rot: 8 }, 380, E.easeInOutQuad);
        await Utils.sleep(90);

        // Punch: into the middle of the column — it bursts — and on through
        await hand.to({ x: hit.x, y: cy, rot: -4 }, 120, E.easeInQuad);
        const pieces = shatter(column);
        explode(pieces, hit);
        Utils.shakeScreen(16, 620);
        await hand.to({ x: c.left + 10, y: cy + 8, rot: -6 }, 150, E.easeOutCubic);

        // Holds there a moment, then pulls out and leaves
        await Utils.sleep(450);
        await hand.to({ x: innerWidth + 340, y: cy + 70, rot: 10 }, 1050, E.easeInOutCubic);
        hand.show(false);
        await Debris.settled();
    }


    async function start() {
        await Utils.sleep(900);         // a beat at 100% before it's refused
        await denied();
        await Utils.sleep(1300);        // ERROR sits there, glaring
        await slap();
        await Utils.sleep(700);
        await punch();
    }

    return { start };
})();
