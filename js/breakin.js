/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   breakin.js — what happens after the scan (CONFIG.scan.sequence
   'breakin'): a pair of hands break in and fix it.

   1. DENIED    the scan hits 100% and is refused: ERROR flickers on
                in red like SECURED, the screen shakes, and it stays.
   2. SLAP      an open palm comes in from the right, winds up and
                slaps ERROR, which tumbles into the bottom-left corner.
   3. PUNCH     the same hand clenches into a fist and punches through
                the scan's column of text: it bursts, words fly or are
                destroyed, and the rest of the tower crumbles into a
                heap. ROUTE_DEPTH·ORPHANED survives, in one piece.
   4. EGG       a second hand joins; they lift the globe, tap it twice to
                crack it and pull it open, and words pour out of the
                opening like a yolk onto the heap — APPROVED among them.
   5. DIG       they close the shell and throw it away, tumbling, then
                dig through the heap: pinch a word, hold it up and look
                it over (each time differently), and get rid of it —
                over the shoulder, aside, dropped, flicked off.
   6. SNAP      the left hand finds ROUTE_DEPTH·ORPHANED; the right
                flicks ORPHANED off it — it snaps away — then fishes
                ERROR out of the corner and sets it back in the middle.
   7. WIRES     the right hand digs out APPROVED; the two ends are
                smashed together like live wires: sparks, a flash,
                everything lights up — ROUTE_DEPTH APPROVED, green,
                which is set back where the row was, and stays. ERROR
                goes green.
   8. SWEEP     palms flat on the table, from the middle out: the lot
                goes over the edges.
   9. REBUILD   the hands look about the empty table for the globe,
                pause, then go off the sides; each comes back, slowly,
                with half. They slam the halves together (the crack
                seals) and spin it. ERROR is smacked until it says what
                it should.
   10. TALK     a hand turns to the viewer and mouths a line as it
                appears underneath, then goes. The word and the row
                fade; the register / offer-token choice follows as
                usual (arg.js).

   The hands are hand.js puppets; everything knocked about is debris.js.
   BreakIn.start() is called by scan.js once every row is in.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const BreakIn = (() => {

    const $ = id => document.getElementById(id);
    const E = Utils.easing;
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);
    const TEXT_STYLE = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color', 'lineHeight'];
    const copyText = (el, cs) => TEXT_STYLE.forEach(p => { el.style[p] = cs[p]; });

    const FINAL_WORD = 'APPROVED';     // what ERROR is smacked into saying at the end (9)


    /* ── Shared bits ───────────────────────────────────────────── */

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

    // A piece held in a hand's fingers. It follows them every frame: its centre
    // sits offX along the piece from the fingertips, at its own angle (so it can
    // be turned in the fingers). letGo(throw) hands it back to the physics.
    function grasp(hand, b, offX) {
        const held = { b, offX, angle: b.a, on: true };
        requestAnimationFrame(function follow() {
            if (!held.on) return;
            const a = held.angle * Math.PI / 180;
            Debris.place(b, hand.x + held.offX * Math.cos(a), hand.y + held.offX * Math.sin(a), held.angle);
            requestAnimationFrame(follow);
        });
        held.letGo = (v = {}) => { held.on = false; Debris.release(b, v); };
        return held;
    }

    // Turn a held piece in the fingers to `deg`
    const turnTo = (held, deg, ms, ease = E.easeInOutCubic) => {
        const from = held.angle;
        return Utils.tween(ms, ease, e => { held.angle = from + (deg - from) * e; });
    };

    // Reach in and pinch piece b by one end ('left' / 'right'), lift it out of
    // the heap (whatever lay on it drops) — returns it held
    async function pickUp(hand, b, end = hand.flip > 0 ? 'right' : 'left', ms = rand(420, 560)) {
        hand.pose('pinch', 220);
        const along = (end === 'right' ? 1 : -1) * b.w * 0.38;
        await hand.to({ x: b.cx + along, y: b.cy - 2, rot: -hand.flip * rand(20, 40) }, ms, E.easeInOutCubic);
        await Utils.sleep(70);
        Debris.lift(b);
        return grasp(hand, b, -along);
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

    let rowHome = null;     // where ROUTE_DEPTH·ORPHANED sat in the column (its left end, middle)

    // Every word, value, mark and rule of the column becomes a loose piece
    // (a copy placed exactly over it), and the column itself goes. The orphaned
    // row stays one piece — ROUTE_DEPTH·ORPHANED — and can't be lost: the
    // hands come back for it (6).
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
            if (!r.width || !src.textContent.trim() || src.closest('.is-orphan')) continue;
            const piece = document.createElement('div');
            piece.className = 'debris-word';
            piece.textContent = src.textContent;
            copyText(piece, getComputedStyle(src));
            place(piece, r);
        }

        const orphan = column.querySelector('.scan-line.is-orphan');
        if (orphan) {
            const row = document.createElement('div');
            row.className = 'debris-word debris-row';
            row.dataset.orphan = 'row';
            for (const [from, cls] of [['.scan-line-key', 'row-key'], ['.scan-line-val', 'row-val']]) {
                const src = orphan.querySelector(from), span = row.appendChild(document.createElement('span'));
                span.className = cls;
                span.textContent = src.textContent;
                copyText(span, getComputedStyle(src));
            }
            const r = orphan.querySelector('.scan-line-key').getBoundingClientRect();
            place(row, r, true);
            rowHome = { x: r.left, y: r.top + r.height / 2 };    // where the mended row is put back (7)
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
        explode(shatter(column), hit);
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
    // and drops off the lip at that speed. APPROVED is buried in it, kept (7).
    async function pourOne(text, inside, lip) {
        const w = yolkWord(text, inside.x, inside.y);
        const approved = text === 'APPROVED';
        if (approved) Object.assign(w.style, { color: 'var(--ink)', fontSize: '17px' });
        const b = Debris.lift(Debris.fling(w, { keep: approved }));   // measured lying flat, then moved by the pour
        if (approved) w.dataset.approved = '';
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
        const words = Scan.words().filter(w => w !== 'route_depth')        // that one's already in the heap
                                  .sort(() => Math.random() - 0.5).slice(0, YOLK.words - 1);
        words.splice(Math.floor(words.length * 0.55), 0, 'APPROVED');
        const inside = { x: g.cx, y: g.cy - g.r * 0.15 }, lip = { x: g.cx, y: g.cy + g.r * 0.6 };
        const pouring = [];
        for (let i = 0; i < words.length; i++) {
            pouring.push(pourOne(words[i], inside, lip));
            await Utils.sleep(YOLK.ms / words.length * (0.4 + 1.2 * i / words.length));   // gaps grow as it thins
        }
        await Promise.all(pouring);
        await Utils.sleep(350);          // no waiting for it all to settle: straight on
        return { left, right };
    }


    /* 5. The shell's thrown away; the hands dig through the heap */

    const DIG = { picks: 4 };   // pieces each hand picks up and gets rid of

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

    // Looking a word over: a couple of these, different each time, with small
    // fidgets between. `s` is the hand's side (-1 left, 1 right), so moves mirror.
    const LOOKS = {
        // tilts it one way, then the other, slowly, as if reading
        read: async (hand, held, s) => {
            await Promise.all([turnTo(held, rand(-14, 14), rand(500, 800)), hand.to({ rot: rand(-8, 8) }, 600, E.easeInOutQuad)]);
            await Utils.sleep(rand(120, 300));
            await turnTo(held, rand(-8, 8), rand(400, 650));
        },
        // brings it closer to have a proper look — sometimes a little, sometimes right up
        closer: async (hand, held, s) => {
            const near = rand(1.1, 1.32), x = hand.x, y = hand.y;
            await hand.to({ x: x - s * 50 * near, y: y - 25 * near, scale: near }, rand(420, 560), E.easeInOutCubic);
            await Utils.sleep(rand(250, 550));
            await hand.to({ x, y, scale: 1 }, rand(380, 480), E.easeInOutCubic);
        },
        // a few quick shakes, like there might be something loose inside
        shake: async (hand, held, s) => {
            for (let i = 0; i < 4; i++) await hand.to({ x: hand.x + (i % 2 ? 12 : -12), y: hand.y + rand(-5, 5), rot: rand(-6, 6) }, 65, E.easeInOutQuad);
        },
        // twists it in the fingers, back and forth
        twist: async (hand, held, s) => {
            for (let i = 0; i < 2; i++) {
                await turnTo(held, (i % 2 ? -1 : 1) * s * rand(18, 30), rand(260, 360));
            }
            await turnTo(held, rand(-6, 6), 320);
        },
        // tips it up on a slant, and back
        slant: async (hand, held, s) => {
            await turnTo(held, s * rand(28, 42), 400);
            await Utils.sleep(rand(200, 350));
            await turnTo(held, rand(-6, 6), 380);
        },
    };
    const fidget = hand => hand.to({ x: hand.x + rand(-7, 7), y: hand.y + rand(-6, 6), rot: hand.rot + rand(-4, 4) }, rand(140, 260), E.easeInOutQuad);

    // …and getting rid of it
    const RID = [
        // over the shoulder: a cock, then a flick up and back — it sails off
        [0.35, async (hand, held, s, at) => {
            await hand.to({ x: at.x - s * 40, y: at.y + 30, rot: -s * 20 }, 180, E.easeOutCubic);
            await hand.to({ x: at.x + s * 120, y: at.y - 160, rot: s * 25 }, 140, E.easeInQuad);
            held.letGo({ vx: s * rand(700, 1000), vy: rand(-1700, -1300), spin: s * rand(500, 900) });
        }],
        // tossed aside, back onto the heap somewhere else
        [0.25, async (hand, held, s, at) => {
            await hand.to({ x: at.x + s * 30, y: at.y + 10, rot: s * 10 }, 160, E.easeOutCubic);
            await hand.to({ x: at.x - s * 90, y: at.y + 40, rot: -s * 15 }, 150, E.easeInQuad);
            held.letGo({ vx: -s * rand(500, 800), vy: rand(-450, -200), spin: -s * rand(200, 500) });
        }],
        // just let go of — it drops
        [0.2, async (hand, held) => {
            await hand.to({ y: hand.y - 14 }, 120, E.easeOutCubic);
            held.letGo({ vx: rand(-40, 40), vy: 0, spin: rand(-90, 90) });
            await hand.to({ y: hand.y - 30 }, 220, E.easeOutCubic);
        }],
        // flicked hard off its own side of the table
        [0.2, async (hand, held, s, at) => {
            await hand.to({ x: at.x - s * 25, rot: -s * 12 }, 140, E.easeOutCubic);
            await hand.to({ x: at.x + s * 70, rot: s * 18 }, 90, E.easeInQuad);
            held.letGo({ vx: s * rand(1200, 1600), vy: rand(-350, -120), spin: s * rand(700, 1100) });
        }],
    ];
    function pickRid() {
        let r = Math.random();
        for (const [weight, rid] of RID) if ((r -= weight) < 0) return rid;
        return RID[0][1];
    }

    // One pick: reach in, pinch a word, lift it, look it over — not it — get rid of it
    async function pickOver(hand, onLeft, taken) {
        const b = topPiece(onLeft, taken);
        if (!b) return false;
        taken.add(b);
        const s = hand.flip;
        const held = await pickUp(hand, b);

        // Up to eye level, levelling out in the fingers on the way
        const at = { x: innerWidth * (onLeft ? 0.3 : 0.7) + rand(-60, 60), y: innerHeight * rand(0.36, 0.5) };
        await Promise.all([hand.to({ ...at, rot: rand(-10, 10) }, rand(500, 700), E.easeInOutCubic), turnTo(held, rand(-10, 10), 550)]);

        const looks = Object.values(LOOKS).sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.5 ? 1 : 2);
        for (const look of looks) {
            await look(hand, held, s);
            if (Math.random() < 0.6) await fidget(hand);
        }
        await pickRid()(hand, held, s, { x: hand.x, y: hand.y });
        await Utils.sleep(rand(60, 220));
        return true;
    }

    async function dig({ left, right }) {
        const shell = window.globeShell;
        let g = window.globeView();

        // Close the shell back up…
        await Promise.all([
            Utils.tween(420, E.easeInOutCubic, e => { shell.tilt = 34 * (1 - e); shell.gap = 70 * (1 - e); }),
            left.to({ ...grip(g, true), rot: 0 }, 420, E.easeInOutCubic),
            right.to({ ...grip(g, false), rot: 0 }, 420, E.easeInOutCubic),
        ]);
        await Utils.sleep(120);

        // …wind up, and throw it away: it tumbles off the top right
        await carry(left, right, g.cx - 110, g.cy + 40, 360, E.easeInOutQuad);
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
        await Promise.all([worker(left, true, 0), worker(right, false, 380)]);
    }


    /* 6. ROUTE_DEPTH·ORPHANED found, and ORPHANED flicked off it */

    // Snap the value off a held row: it becomes its own piece (thrown), and what's
    // left of the row gets shorter — its end in the fingers staying put
    function breakOff(held, span, v) {
        const r = span.getBoundingClientRect(), piece = document.createElement('div');
        piece.className = 'debris-word';
        piece.textContent = span.textContent;
        copyText(piece, getComputedStyle(span));
        Object.assign(piece.style, { left: r.left + 'px', top: r.top + 'px' });
        $('debrisLayer').appendChild(piece);
        span.remove();
        resize(held);
        return Debris.fling(piece, v);
    }

    // A held row changed length: its end in the fingers stays where it was
    function resize(held) {
        const { b } = held, oldW = b.w;
        b.el.style.width = 'auto';
        b.w = b.el.offsetWidth;
        b.el.style.width = b.w + 'px';
        held.offX += Math.sign(held.offX) * (b.w - oldW) / 2;
    }

    async function snap({ left, right }) {
        const row = Debris.bodies.find(b => b.el.dataset.orphan === 'row');

        // The left hand goes straight for it — this is the one
        const held = await pickUp(left, row, 'left', 650);
        const at = { x: innerWidth * 0.38, y: innerHeight * 0.42 };
        await Promise.all([left.to({ ...at, rot: 0 }, 750, E.easeInOutCubic), turnTo(held, 0, 700)]);
        await left.to({ scale: 1.15, rot: -5 }, 380, E.easeInOutCubic);     // a close look
        await Utils.sleep(300);
        await left.to({ scale: 1, rot: 0 }, 320, E.easeInOutCubic);

        // The right hand lines up on ORPHANED… and flicks it off
        const val = row.el.querySelector('.row-val'), vr = val.getBoundingClientRect(), vy = vr.top + vr.height / 2;
        right.pose('flick', 250);
        await right.to({ x: vr.right + 110, y: vy - 55, rot: 15, scale: 1 }, 650, E.easeInOutCubic);
        await Utils.sleep(220);
        await right.to({ x: vr.left + vr.width * 0.5, y: vy, rot: -20 }, 90, E.easeInQuad);
        breakOff(held, val, { vx: rand(1000, 1300), vy: rand(-900, -700), spin: rand(700, 1000) });
        flecks(vr.left, vy, 8, 700, 'var(--red)', 200, -200);
        Utils.shakeScreen(7, 300);
        await right.to({ x: vr.right + 220, y: vy - 90, rot: 25 }, 220, E.easeOutCubic);
        return held;
    }


    /* ERROR, set back in the middle — where it first appeared — for what's to come */

    async function centreError(hand) {
        const b = Debris.bodies.find(o => o.el.id === 'errorWord');
        const held = await pickUp(hand, b, 'right', 700);
        const mid = { x: innerWidth / 2, y: innerHeight / 2 };
        await Promise.all([hand.to({ x: mid.x - held.offX, y: mid.y, rot: 0 }, 1000, E.easeInOutCubic), turnTo(held, 0, 900)]);
        await hand.to({ y: mid.y + 5, scale: 0.97 }, 110, E.easeOutQuad);       // pressed into place
        held.on = false;
        // Back to how it sat at the start: centred in its layer by layout, out of the physics
        for (const p of ['position', 'left', 'top', 'width', 'height', 'margin', 'transform', 'transformOrigin']) b.el.style[p] = '';
        await hand.to({ x: hand.x + 120, y: mid.y - 140, rot: 15, scale: 1 }, 400, E.easeOutCubic);
    }


    /* 7. APPROVED dug out, and the two smashed together like live wires */

    // The ends touch: sparks, a flash of light, a jolt, and for a moment
    // everything glows (scan.css body.lit) — warm, not green: green is only
    // the mended row and ERROR
    function lightUp(at) {
        flecks(at.x, at.y, 16, 1600, '#ffe066', 0, -250);
        flecks(at.x, at.y, 10, 1300, '#ffffff', 0, -250);
        flecks(at.x, at.y, 8, 1100, '#ffb347', 0, -250);
        const flash = document.body.appendChild(document.createElement('div'));
        flash.className = 'lit-flash';
        flash.style.setProperty('--x', at.x + 'px');
        flash.style.setProperty('--y', at.y + 'px');
        flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1100, easing: 'ease-out' }).finished.then(() => flash.remove());
        document.body.classList.add('lit');
        setTimeout(() => document.body.classList.remove('lit'), 1600);
        Utils.shakeScreen(12, 520);
    }

    // APPROVED joins the row: ROUTE_DEPTH APPROVED, green
    function weld(held, other) {
        const span = held.b.el.appendChild(document.createElement('span'));
        span.className = 'row-val';
        span.textContent = other.b.el.textContent;
        copyText(span, getComputedStyle(other.b.el));
        other.on = false;
        other.b.el.remove();
        held.b.el.classList.add('welded');
        resize(held);
    }

    async function wires({ left, right }, held) {
        const ap = Debris.bodies.find(b => 'approved' in b.el.dataset);
        const other = await pickUp(right, ap, 'right', 650);
        const y = innerHeight * 0.3;                    // above ERROR, now back in the middle
        await Promise.all([right.to({ x: innerWidth * 0.64, y, rot: 0 }, 750, E.easeInOutCubic), turnTo(other, 0, 700)]);
        await Utils.sleep(250);

        // Where each hand must be for the free ends to meet in the middle
        const mid = innerWidth / 2;
        const lx = mid - 1 - held.offX - held.b.w / 2, rx = mid + 1 - other.offX + other.b.w / 2;

        // Lined up, drawn back a touch… and smashed together
        await Promise.all([left.to({ x: lx - 80, y, rot: -4 }, 360, E.easeInOutQuad), right.to({ x: rx + 80, y, rot: 4 }, 360, E.easeInOutQuad)]);
        await Utils.sleep(180);
        await Promise.all([left.to({ x: lx, rot: 0 }, 110, E.easeInQuad), right.to({ x: rx, rot: 0 }, 110, E.easeInQuad)]);
        weld(held, other);
        lightUp({ x: mid, y });
        $('errorFlash').classList.add('green');         // the route's approved: ERROR goes green (scan.css)
        await right.to({ x: rx + 140, y: y - 60, rot: 15 }, 300, E.easeOutCubic);
        await Utils.sleep(700);

        // The mended row is set back where it was in the column — a press, and it
        // stays put (out of the physics, so nothing that follows can move it)
        const home = rowHome ?? { x: innerWidth * 0.06, y: innerHeight * 0.6 };
        const spot = { x: home.x + held.b.w / 2 - held.offX, y: home.y };
        await left.to({ ...spot, rot: 0 }, 800, E.easeInOutCubic);
        await left.to({ y: spot.y + 5, scale: 0.97 }, 110, E.easeOutQuad);
        held.on = false;
        await left.to({ x: spot.x - 60, y: spot.y - 90, rot: -10, scale: 1 }, 380, E.easeOutCubic);
        return held.b.el;
    }


    /* 8. Everything swept off the table */

    async function sweep({ left, right }) {
        Debris.bodies.forEach(b => { b.keep = false; });       // nothing on the table is kept now (the mended row's off it)

        // Palms flat on the table, side by side in the middle…
        left.pose('palm', 300);
        right.pose('palm', 300);
        const y = innerHeight - 90;
        await Promise.all([
            left.to({ x: innerWidth / 2 - 50, y, rot: 0, scale: 1 }, 700, E.easeInOutCubic),
            right.to({ x: innerWidth / 2 + 50, y, rot: 0, scale: 1 }, 700, E.easeInOutCubic),
        ]);
        await Utils.sleep(200);

        // …and out, each driving whatever's in front of it over its edge
        let sweeping = true;
        requestAnimationFrame(function push() {
            if (!sweeping) return;
            for (const b of [...Debris.bodies]) {
                if (b.life || b.swept) continue;
                for (const h of [left, right]) {
                    const ahead = (b.cx - h.x) * h.flip;         // how far in front of the palm, the way it's going
                    if (b.cy > h.y - 260 && ahead > -40 && ahead < 70) {
                        b.swept = true;
                        Debris.shove(b, { vx: h.flip * rand(1100, 1500), vy: -rand(100, 350), spin: rand(-300, 300) });
                        break;
                    }
                }
            }
            requestAnimationFrame(push);
        });
        await Promise.all([
            left.to({ x: -320, y, rot: 0 }, 1000, E.easeInQuad),
            right.to({ x: innerWidth + 320, y, rot: 0 }, 1000, E.easeInQuad),
        ]);
        sweeping = false;
        await Utils.sleep(900);
        Debris.clear();                  // stragglers fade
    }


    /* 9. The site put back: the globe's halves slammed together, ERROR (green) smacked right */

    const SAYS = ['ERR0R', 'E#R?R', 'A?PR█V?D', FINAL_WORD];   // what ERROR shows after each smack

    // Looking for the globe on the cleared table: patting along it, peering about
    async function pat(hand) {
        for (const x of [0, 70, 150]) {
            await hand.to({ x: hand.x + x * -hand.flip * 0.5, y: hand.y + 20 }, 150, E.easeInQuad);
            await hand.to({ y: hand.y - 20 }, 200, E.easeOutQuad);
            await Utils.sleep(rand(80, 200));
        }
    }
    async function peer(hand) {
        await hand.to({ scale: 1.14, rot: 12 }, 420, E.easeInOutCubic);
        await Utils.sleep(rand(250, 400));
        await hand.to({ x: hand.x - hand.flip * 120, rot: -10 }, 600, E.easeInOutCubic);
        await Utils.sleep(rand(250, 400));
        await hand.to({ scale: 1, rot: 0 }, 380, E.easeInOutCubic);
    }

    async function rebuild({ left, right }) {
        const shell = window.globeShell;
        const home = { x: innerWidth * CONFIG.globe.centerX / 100, y: innerHeight * CONFIG.globe.centerY / 100 };

        // Back in from the sides after the sweep: where did the globe go? One pats
        // along the empty table, the other peers about…
        right.pose('point', 300);
        await Promise.all([
            left.to({ x: innerWidth * 0.18, y: innerHeight - 110, rot: 0 }, 900, E.easeOutCubic),
            right.to({ x: innerWidth * 0.78, y: innerHeight * 0.3, rot: 0 }, 1000, E.easeOutCubic),
        ]);
        await Promise.all([pat(left), peer(right)]);

        // …a pause, as if it's dawned on them…
        await Utils.sleep(1100);

        // …and off they go, each its own way, to fetch a half. (Out of sight, the
        // globe's put back home, split far apart — a half off each side, cracked.)
        left.pose('grab', 300);
        right.pose('grab', 300);
        await Promise.all([
            left.to({ x: -340, y: home.y, rot: 0 }, 650, E.easeInCubic),
            right.to({ x: innerWidth + 340, y: home.y, rot: 0 }, 650, E.easeInCubic),
        ]);
        await window.startGlobeMove(CONFIG.globe.centerX, CONFIG.globe.centerY, 1);
        window.globeKick([0, 0, 0]);
        let g = window.globeView();
        const wide = innerWidth + g.r * 5;
        Object.assign(shell, { crack: 1, tilt: 0, gap: wide });
        left.place({ ...grip(g, true, 0, wide), rot: 0 });
        right.place({ ...grip(g, false, 0, wide), rot: 0 });
        await Utils.sleep(1000);                         // rummaging, out of sight

        // They bring them back in, slowly, one each, and line them up…
        const hold = g.r * 1.6;
        await Promise.all([
            Utils.tween(2300, E.easeInOutCubic, e => { shell.gap = wide + (hold - wide) * e; }),
            left.to(grip(g, true, 0, hold), 2300, E.easeInOutCubic),
            right.to(grip(g, false, 0, hold), 2300, E.easeInOutCubic),
        ]);
        await Utils.sleep(600);

        // …and slam them together. The crack seals.
        await Promise.all([
            Utils.tween(110, E.easeInQuad, e => { shell.gap = hold * (1 - e); }),
            left.to(grip(g, true), 110, E.easeInQuad),
            right.to(grip(g, false), 110, E.easeInQuad),
        ]);
        Utils.shakeScreen(16, 520);
        flecks(g.cx, g.cy - g.r * 0.6, 8, 700, 'var(--red)', 0, -200);
        flecks(g.cx, g.cy + g.r * 0.4, 8, 700, 'var(--ink)', 0, -200);
        Utils.tween(900, E.easeOutCubic, e => { shell.crack = 1 - e; });
        await Utils.sleep(500);
        await left.to({ x: home.x - g.r - 260, y: home.y - g.r - 140, rot: -20 }, 550, E.easeInOutCubic);

        // …and the right hand gives it a spin
        right.pose('flick', 250);
        await right.to({ x: home.x + g.r + 50, y: home.y + 30, rot: 20 }, 450, E.easeInOutCubic);
        await right.to({ x: home.x + g.r - 10, y: home.y - 70, rot: -10 }, 110, E.easeInQuad);
        window.globeKick([0, 8, 0]);
        window.globeHold(false);
        await right.to({ x: home.x + g.r + 240, y: home.y - 150, rot: 10 }, 400, E.easeOutCubic);

        // ERROR — green since the route was approved, in the middle over the globe —
        // is smacked until it says what it should
        const flash = $('errorFlash'), word = $('errorWord');
        left.pose('palm', 250);
        for (const [i, text] of SAYS.entries()) {
            const r = word.getBoundingClientRect(), cy = r.top + r.height / 2;
            await left.to({ x: r.left - 150 + rand(-25, 25), y: cy - 170 + rand(-25, 25), rot: -20 }, i ? 320 : 650, E.easeInOutCubic);
            await left.to({ x: r.left + r.width * 0.3, y: cy - 8, rot: 10 }, 100, E.easeInQuad);
            word.textContent = text;
            word.animate([{ transform: 'translate(0, 7px) rotate(-2deg)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
            Utils.shakeScreen(8 + i * 2, 300);
            await left.to({ x: r.left - 70, y: cy - 100, rot: -10 }, 180, E.easeOutCubic);
            if (i < SAYS.length - 1) await Utils.sleep(rand(180, 320));
        }
        await Utils.flashWord(flash, word, $('errorRipples'), { stay: true });   // it says it: lit up like SECURED
    }

    /* 10. A hand turns to the viewer and says something */

    const LINE = "You've made it this far, let me help you out a little bit.";

    async function talk({ left, right }) {
        // The left hand goes; the right turns to face you and comes close
        left.to({ x: -340, y: innerHeight * 0.3, rot: -10 }, 900, E.easeInOutCubic).then(() => left.show(false));
        right.pose('talk', 350);
        const at = { x: innerWidth / 2, y: innerHeight * 0.7 };
        await right.to({ ...at, rot: 0, scale: 1.25 }, 1000, E.easeInOutCubic);
        await Utils.sleep(450);

        // It mouths the line a word at a time, as the words appear underneath:
        // the mouth opens and shuts about once a syllable
        const line = document.body.appendChild(document.createElement('div'));
        line.className = 'hand-line';
        for (const word of LINE.split(' ')) {
            line.textContent += (line.textContent ? ' ' : '') + word;
            const beats = Math.max(1, Math.round(word.replace(/[^a-z]/gi, '').length / 3));
            for (let i = 0; i < beats; i++) {
                right.pose('talkOpen', 60);
                await right.to({ y: at.y + 6 }, 90, E.easeOutQuad);
                right.pose('talk', 60);
                await right.to({ y: at.y }, 100, E.easeInQuad);
            }
            await Utils.sleep(/[,.]$/.test(word) ? 300 : 50);
        }
        await Utils.sleep(1900);

        // …and goes
        line.classList.add('gone');
        await right.to({ x: innerWidth + 360, y: innerHeight * 0.35, rot: 10, scale: 1 }, 900, E.easeInOutCubic);
        right.show(false);
        setTimeout(() => line.remove(), 1200);
    }

    // The word and the mended row fade, and the site carries on as usual
    async function finish(row) {
        await Utils.sleep(500);
        for (const el of [$('errorFlash'), row]) Object.assign(el.style, { transition: 'opacity 1.2s ease', opacity: 0 });
        await Utils.sleep(1300);
        row.remove();
        window.globeSetDraggable(true);
        Arg.showArgChoice();
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
        const held = await snap(hands);
        await centreError(hands.right);
        const row = await wires(hands, held);
        await sweep(hands);
        await rebuild(hands);
        await talk(hands);
        await finish(row);
    }

    return { start };
})();
