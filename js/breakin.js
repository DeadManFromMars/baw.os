/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   breakin.js — what happens after the scan (CONFIG.scan.sequence
   'breakin'). Being built one beat at a time:

   1. DENIED    the scan hits 100% and is refused: ERROR flickers on
                in red like SECURED, the screen shakes, and it stays.
   2. SLAP      an open palm comes in from the right, winds up and
                slaps ERROR, which tumbles into the bottom-left corner.
   3. PUNCH     the same hand clenches into a fist and punches through
                the scan's column of text: it bursts, words fly or are
                destroyed, and the rest of the tower crumbles into a
                heap at the bottom.
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


    /* 2. An open palm slaps ERROR into the corner (the hand stays for the punch) */
    async function slap(hand) {
        const word = $('errorWord');
        const r = word.getBoundingClientRect(), cy = r.top + r.height / 2;
        hand.pose('palm');

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

        // Follow through and hang there a moment
        await hand.to({ x: r.left + 30, y: cy + 110, rot: 40 }, 260, E.easeOutCubic);
        await Utils.sleep(550);
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

    // A few flecks from (x, y), thrown `speed` px/s at most, biased by (bx, by)
    function flecks(x, y, n, speed, color, bx = 0, by = -300) {
        for (let i = 0; i < n; i++) {
            const fleck = document.createElement('div');
            fleck.className = 'debris-fleck';
            Object.assign(fleck.style, { left: x + 'px', top: y + 'px', background: color });
            $('debrisLayer').appendChild(fleck);
            const angle = rand(0, Math.PI * 2), v = rand(speed * 0.35, speed);
            Debris.fling(fleck, { vx: Math.cos(angle) * v + bx, vy: Math.sin(angle) * v + by, spin: rand(-900, 900), fade: rand(500, 1000) });
        }
    }

    // Close to the fist: thrown hard, away from it and on in the punch's
    // direction (left) — or destroyed outright, bursting into flecks, as are
    // the rules and most of the ✕ marks. Further up the tower: pushed less —
    // it loses what held it up and topples, mostly rightwards, scattering as
    // it comes down, the higher bits a moment later.
    function explode(pieces, at) {
        for (const p of pieces) {
            const dx = p.x - at.x, dy = p.y - at.y, d = Math.hypot(dx, dy) || 1;
            const blast = 2400 * Math.exp(-d / 220);
            const mark = p.el.textContent === '✕', rule = p.el.classList.contains('debris-rule');
            if (rule || (mark && Math.random() < 0.7) || (d < 160 && Math.random() < 0.5)) {
                const r = p.el.getBoundingClientRect();
                flecks(p.x, p.y, Math.min(8, Math.max(2, Math.round(r.width / 30))), 300 + blast * 0.5,
                       getComputedStyle(p.el)[rule ? 'backgroundColor' : 'color'], dx / d * blast * 0.4 - 200, -250);
                p.el.remove();
                continue;
            }
            Debris.fling(p.el, {
                vx:    dx / d * blast - 800 * Math.exp(-d / 260) + rand(-150, 420),
                vy:    dy / d * blast - 450 * Math.exp(-d / 220) + rand(-120, 40),
                spin:  rand(-1, 1) * (120 + blast * 0.4),
                delay: dy < 0 && blast < 600 ? -dy * 0.3 + rand(0, 140) : rand(0, 30),
            });
        }
        // A puff from the hole itself
        flecks(at.x, at.y, 10, 1400, 'var(--ink)', -300);
        flecks(at.x, at.y, 6, 1400, 'var(--red)', -300);
    }

    async function punch(hand) {
        const column = document.querySelector('.scan-left');
        const c = column.getBoundingClientRect(), cy = c.top + c.height * 0.55;
        const hit = { x: c.left + c.width * 0.55, y: cy };

        // Straight on from the slap: pulls back a touch, clenching into a fist,
        // and squares up beside the column
        await hand.to({ x: hand.x + 60, y: hand.y - 20, rot: 20 }, 160, E.easeOutCubic);
        hand.pose('fist');
        await hand.to({ x: c.right + 230, y: cy, rot: 0 }, 900, E.easeInOutCubic);
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
        const hand = Hands.create('right');
        await slap(hand);
        await punch(hand);
    }

    return { start };
})();
