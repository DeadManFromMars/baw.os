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
   4. EGG       a second hand joins; they lift the globe, tap it twice to
                crack it and pull it open, and words pour out of the
                opening like a yolk onto the heap.
   5. DIG       they close the shell and throw it away, tumbling, then
                dig through the heap: pinch a word, hold it up and turn
                it to read it, and flick it over the shoulder or toss it
                aside — both hands at once, out of step.
   (next)       they find the orphan DENIED, …

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
        Debris.fling(word, { vx: -1300, vy: 420, spin: -110, keep: true });   // ERROR stays, in the corner
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
        const place = (el, r, keep = false) => {
            Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px' });
            layer.appendChild(el);
            pieces.push({ el, x: r.left + r.width / 2, y: r.top + r.height / 2, keep });
        };

        const TEXT = '.scan-panel-head span, .scan-line-key, .scan-line-val, .scan-line-check, .scan-progress span';
        for (const src of column.querySelectorAll(TEXT)) {
            const r = src.getBoundingClientRect();
            if (!r.width || !src.textContent.trim()) continue;
            const cs = getComputedStyle(src), piece = document.createElement('div');
            piece.className = 'debris-word';
            piece.textContent = src.textContent;
            for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color', 'lineHeight']) piece.style[p] = cs[p];
            // The orphaned row (ROUTE_DEPTH / ORPHANED) must survive: the hands come back for it
            const orphan = !!src.closest('.is-orphan') && !src.matches('.scan-line-check');
            if (orphan) piece.dataset.orphan = src.matches('.scan-line-key') ? 'key' : 'value';
            place(piece, r, orphan);
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
            if (!p.keep && (rule || (mark && Math.random() < 0.7) || (d < 160 && Math.random() < 0.5))) {
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
                keep:  p.keep,
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

        // Straight on from the slap: draws back, clenching into a fist as it goes
        // (one movement, no swap), and squares up beside the column
        hand.pose('fist', 450);
        await hand.to({ x: hand.x + 70, y: hand.y - 30, rot: 18 }, 450, E.easeOutCubic);
        await hand.to({ x: c.right + 230, y: cy, rot: 0 }, 850, E.easeInOutCubic);
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

        // Holds there a moment, then pulls back out (it stays for the egg)
        await Utils.sleep(450);
        await hand.to({ x: c.right + 260, y: cy + 60, rot: 10 }, 700, E.easeInOutCubic);
    }


    /* 4. Two hands crack the globe like an egg; words pour out like a yolk */

    const YOLK = { words: 16, ms: 2400 };   // how many pour out, over how long

    // The globe's centre as the viewport % it moves in
    const pct = (x, y) => [x / innerWidth * 100, y / innerHeight * 100];

    // Where a hand holds the globe: its flank, on the shell's half once it opens
    // (mirrors globe.js onHalf: swung about the top of the crack, pulled apart)
    function grip(g, left, tilt = 0, gap = 0) {
        const t = (left ? tilt : -tilt) * Math.PI / 180, dx = (left ? -1.02 : 1.02) * g.r, dy = g.r;
        return { x: g.cx + dx * Math.cos(t) - dy * Math.sin(t) + (left ? -gap : gap) / 2,
                 y: g.cy - g.r + dx * Math.sin(t) + dy * Math.cos(t) };
    }

    // Move the globe to (x, y) px with both hands on it
    function carry(left, right, x, y, ms, ease) {
        const r = window.globeView().r, g = { cx: x, cy: y, r };
        return Promise.all([
            window.startGlobeMove(...pct(x, y), ms, ease),
            left.to(grip(g, true), ms, ease),
            right.to(grip(g, false), ms, ease),
        ]);
    }

    // One word dropping out of the opening, styled like the scan's labels
    function yolkWord(text, x, y) {
        const w = document.createElement('div');
        w.className = 'debris-word';
        w.textContent = text;
        Object.assign(w.style, {
            left: x + 'px', top: y + 'px',
            fontFamily: "'Space Mono', monospace", fontSize: rand(11, 20).toFixed(1) + 'px',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: Math.random() < 0.15 ? 'var(--red)' : 'var(--ink)',
        });
        $('debrisLayer').appendChild(w);
        const r = w.getBoundingClientRect();
        w.style.left = x - r.width / 2 + 'px';          // centred on the opening
        return w;
    }

    // One word of the yolk: it wells up inside the shell (fading in), slides down
    // out of the opening upright — speeding up, like something thick pouring —
    // and drops off the lip at that speed
    async function pourOne(text, inside, lip) {
        const w = yolkWord(text, inside.x, inside.y);
        const b = Debris.lift(Debris.fling(w));             // measured lying flat, then moved by the pour
        w.style.opacity = 0;
        const x = inside.x + rand(-8, 8), lean = rand(-6, 6), ms = rand(420, 560);
        await Utils.tween(ms, E.easeInQuad, e => {
            Debris.place(b, x + lean * e, inside.y + (lip.y - inside.y) * e, 90 + lean);
            w.style.opacity = Math.min(1, e / 0.35);
        });
        // easeInQuad leaves at twice its average speed
        Debris.release(b, { vx: rand(-40, 40), vy: 2 * (lip.y - inside.y) / (ms / 1000), spin: rand(-60, 60) });
    }

    async function egg(right) {
        window.globeUnmark();
        window.globeHold(true);
        window.globeSetDraggable(false);
        const shell = window.globeShell;
        let g = window.globeView();

        // A second hand comes in from the left; both take the globe by its flanks
        const left = Hands.create('left').pose('grab');
        right.pose('grab', 400);                         // the fist opens to take hold
        left.place({ x: -300, y: g.cy + 140, rot: -12 }).show(true);
        await Promise.all([left.to(grip(g, true), 1000, E.easeOutCubic), right.to(grip(g, false), 1000, E.easeInOutCubic)]);
        await Utils.sleep(250);

        // Lift it up to the middle, like holding an egg over a bowl
        const lift = { x: innerWidth / 2, y: innerHeight * 0.46 };
        await carry(left, right, lift.x, lift.y, 900, E.easeInOutCubic);
        await Utils.sleep(350);

        // Two taps down: the first starts a crack, the second runs it through
        for (const reach of [0.45, 1]) {
            await carry(left, right, lift.x, lift.y + 46, 110, E.easeInQuad);
            Utils.shakeScreen(6, 260);
            const from = shell.crack;
            Utils.tween(220, E.easeOutCubic, e => { shell.crack = from + (reach - from) * e; });
            await carry(left, right, lift.x, lift.y, 260, E.easeOutCubic);
            await Utils.sleep(420);
        }

        // Pull it open: each hand swings its half out, the opening facing down
        g = window.globeView();
        const OPEN = { tilt: 34, gap: 70 };
        await Promise.all([
            Utils.tween(950, E.easeInOutCubic, e => { shell.tilt = OPEN.tilt * e; shell.gap = OPEN.gap * e; }),
            left.to({ ...grip(g, true, OPEN.tilt, OPEN.gap), rot: OPEN.tilt }, 950, E.easeInOutCubic),
            right.to({ ...grip(g, false, OPEN.tilt, OPEN.gap), rot: -OPEN.tilt }, 950, E.easeInOutCubic),
        ]);

        // The yolk pours out of the opening: a glob first, thinning to a drip
        const words = Scan.words().sort(() => Math.random() - 0.5).slice(0, YOLK.words);
        const inside = { x: g.cx, y: g.cy - g.r * 0.15 }, lip = { x: g.cx, y: g.cy + g.r * 0.6 };
        const pouring = [];
        for (let i = 0; i < words.length; i++) {
            pouring.push(pourOne(words[i], inside, lip));
            await Utils.sleep(YOLK.ms / words.length * (0.4 + 1.2 * i / words.length));   // gaps grow as it thins
        }
        await Promise.all(pouring);
        await Debris.settled();
        return { left, right };
    }


    /* 5. The shell's thrown away; the hands dig through the heap */

    const DIG = { picks: 5 };   // pieces each hand picks up and throws away

    // A word near the top of the heap on one side of the screen — not one the
    // hands will come back for (kept), nor one the other hand has gone for
    function topPiece(onLeft, taken) {
        const near = Debris.bodies
            .filter(b => b.resting && !b.keep && !taken.has(b) && b.el.classList.contains('debris-word')
                      && (b.cx < innerWidth / 2) === onLeft)
            .sort((p, q) => p.cy - q.cy)
            .slice(0, 4);
        return near[Math.floor(Math.random() * near.length)];
    }

    // One pick: reach in, pinch a word, lift it, hold it up and turn it to read
    // it — not it — then flick it over the shoulder or toss it aside.
    // `side` is the hand's (-1 left, 1 right): offsets and angles mirror with it,
    // so both hands share this.
    async function pickOver(hand, onLeft, taken) {
        const b = topPiece(onLeft, taken);
        if (!b) return false;
        taken.add(b);
        const side = hand.flip;

        hand.pose('pinch', 250);
        const grabX = b.cx + side * b.w * 0.3;              // fingers on the word's near end
        await hand.to({ x: grabX, y: b.cy - 2, rot: -side * 35 }, rand(550, 750), E.easeInOutCubic);
        await Utils.sleep(90);

        // It comes away in the fingers — whatever lay on it drops — and follows them
        Debris.lift(b);
        const offX = b.cx - grabX;
        let held = true;
        requestAnimationFrame(function follow() {
            if (!held) return;
            Debris.place(b, hand.x + offX, hand.y, hand.rot * 0.5);
            requestAnimationFrame(follow);
        });

        // Held up to have a look, turned this way and that
        const look = { x: innerWidth * (onLeft ? 0.3 : 0.7) + rand(-40, 40), y: innerHeight * rand(0.38, 0.5) };
        await hand.to({ ...look, rot: -side * 6 }, 700, E.easeInOutCubic);
        await hand.to({ rot: side * 10 }, 280, E.easeInOutQuad);
        await hand.to({ rot: -side * 4 }, 320, E.easeInOutQuad);
        await Utils.sleep(rand(150, 450));

        // Not it
        if (Math.random() < 0.5) {
            // Over the shoulder: a cock, then a flick up and back — it sails off
            await hand.to({ x: look.x - side * 40, y: look.y + 30, rot: -side * 20 }, 180, E.easeOutCubic);
            await hand.to({ x: look.x + side * 120, y: look.y - 160, rot: side * 25 }, 140, E.easeInQuad);
            held = false;
            Debris.release(b, { vx: side * rand(700, 1000), vy: rand(-1700, -1300), spin: side * rand(500, 900) });
        } else {
            // Tossed aside, back onto the heap somewhere else
            await hand.to({ x: look.x + side * 30, y: look.y + 10, rot: side * 10 }, 160, E.easeOutCubic);
            await hand.to({ x: look.x - side * 90, y: look.y + 40, rot: -side * 15 }, 150, E.easeInQuad);
            held = false;
            Debris.release(b, { vx: -side * rand(500, 800), vy: rand(-450, -200), spin: -side * rand(200, 500) });
        }
        await Utils.sleep(rand(100, 300));
        return true;
    }

    async function dig({ left, right }) {
        const shell = window.globeShell;
        let g = window.globeView();

        // Close the shell back up…
        await Promise.all([
            Utils.tween(450, E.easeInOutCubic, e => { shell.tilt = 34 * (1 - e); shell.gap = 70 * (1 - e); }),
            left.to({ ...grip(g, true), rot: 0 }, 450, E.easeInOutCubic),
            right.to({ ...grip(g, false), rot: 0 }, 450, E.easeInOutCubic),
        ]);
        await Utils.sleep(200);

        // …wind up, and throw it away: it tumbles off the top right
        await carry(left, right, g.cx - 110, g.cy + 40, 380, E.easeInOutQuad);
        g = window.globeView();
        window.globeKick([2, -10, 4]);
        await Promise.all([
            window.startGlobeMove(135, -30, 700, t => t),
            right.to({ x: g.cx + 300, y: g.cy - 220, rot: -25 }, 300, E.easeOutCubic),
            left.to({ x: g.cx - 60, y: g.cy - 40, rot: 10 }, 400, E.easeOutCubic),
        ]);

        // Dig: both at once, out of step
        const taken = new Set();
        const worker = async (hand, onLeft, delay) => {
            await Utils.sleep(delay);
            for (let i = 0; i < DIG.picks; i++) if (!await pickOver(hand, onLeft, taken)) break;
        };
        await Promise.all([worker(left, true, 0), worker(right, false, 650)]);
        await Debris.settled();
        return { left, right };
    }


    async function start() {
        await Utils.sleep(900);         // a beat at 100% before it's refused
        await denied();
        await Utils.sleep(1300);        // ERROR sits there, glaring
        const hand = Hands.create('right');
        await slap(hand);
        await punch(hand);
        const hands = await egg(hand);
        await dig(hands);
    }

    return { start };
})();
