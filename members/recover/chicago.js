/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   chicago.js — the Chicago call (Dial-Up Numbers; backend: app/calls.py)

   Dialling (312) 939-2257 asks the server if he picks up (dialup.js).
   If he does: black, a faint hum, stars trickle in, his face dissolves
   in block by block (face.js), then he talks — one box at a time from
   the server, which alone knows the conversation. The player picks a
   reply; the server says what's next, or how it ends:
     hangup  "Error 629", back to the numbers
     bomb    explosions (quiet bangs), a white-out, "Error 651", and
             Chicago's row is left singed — blown up like a lid, smoking
             — and can't be dialled again
   Some boxes carry extras: `ask` (pick ONE of your security questions
   to ask him about), `contact` (he's saved to your contacts).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Chicago = (() => {
    const $ = id => document.getElementById(id);
    const ref = () => { try { return localStorage.getItem('baw_recover_ref') ?? sessionStorage.getItem('baw_recover_ref'); } catch { return null; } };
    const post = (path, body) => fetch(`${CONFIG.apiBase}/calls/chicago/${path}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ref(), ...body }) }).then(r => r.json());

    /* ── Timing + look ── */
    const T = { hum: 2.5, starsFrom: 1.0, starsTo: 18.0, starFade: 3.2, faceFrom: 11.0, faceFade: 4.5 };
    const SPEAK = T.faceFrom + T.faceFade + 0.5;   // he talks once he's fully in
    const GROW = 0.6;                              // his face starts at this × its size, growing as it appears
    const SIZE = 0.36;                             // face height, × the window's
    const TYPE_S = 0.035, PAUSE_S = 0.7;           // per letter · between lines (mouth shut)
    const SPEED = 20;                              // mouth flaps
    const WARBLE = { amp: 16, copies: [[0.3, 1], [0.2, -1.6], [0.12, 2.3]] };   // his outline rippling: image px · [opacity, speed]
    const BANG = { volume: 0.08, ceiling: 0.35 };  // each explosion's bang · the most they can ever add up to
    const HANGUP = 'Error 629: The connection was closed by the remote computer.';

    const c = $('c'), g = c.getContext('2d');
    let ac = null, hum = null, t0 = 0, running = false, ending = false;
    let stars = [], box = null, boxAt = 0, shown = false, choices = [];
    const now = () => (performance.now() - t0) / 1000;
    const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    function fit() {
        const dpr = devicePixelRatio || 1;
        c.width = innerWidth * dpr; c.height = innerHeight * dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    addEventListener('resize', fit);

    /* ── Sound: the hum (mains 60 Hz + harmonics, muffled, very quiet) + the bangs ── */
    function humTo(level, sec) {
        if (!hum) {
            hum = ac.createGain(); hum.gain.value = 0;
            const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
            lp.connect(hum); hum.connect(ac.destination);
            for (const [f, v] of [[60, 0.5], [120, 0.35], [180, 0.18], [240, 0.08]]) {
                const o = ac.createOscillator(), gv = ac.createGain();
                o.frequency.value = f; gv.gain.value = v; o.connect(gv); gv.connect(lp); o.start();
            }
        }
        hum.gain.cancelScheduledValues(ac.currentTime);
        hum.gain.setValueAtTime(hum.gain.value, ac.currentTime);
        hum.gain.linearRampToValueAtTime(level, ac.currentTime + sec);
    }
    let bangRaw = null, bangBuf = null, bangOut = null;
    function prepBang() {
        if (bangBuf || bangRaw) return;
        bangRaw = fetch('../../Audio/Sounds/Calls/explosion.mp3').then(r => r.arrayBuffer()).then(a => ac.decodeAudioData(a)).then(b => { bangBuf = b; });
    }
    // one bang: quiet, pitched a little differently each time, all through a limiter
    function bang(size) {
        if (!bangBuf) return;
        if (!bangOut) {
            const lim = ac.createDynamicsCompressor();
            lim.threshold.value = -24; lim.knee.value = 6; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.25;
            bangOut = ac.createGain(); bangOut.gain.value = BANG.ceiling;
            lim.connect(bangOut); bangOut.connect(ac.destination); bangOut.limiter = lim;
        }
        const src = ac.createBufferSource(), gn = ac.createGain();
        src.buffer = bangBuf;
        src.playbackRate.value = 0.8 + Math.random() * 0.4;
        gn.gain.value = BANG.volume * (0.5 + size / 310);
        src.connect(gn); gn.connect(bangOut.limiter); src.start();
    }

    /* ── The scene, each frame ── */
    function makeStars() {
        stars = Array.from({ length: 170 }, () => ({
            x: Math.random(), y: Math.random() * 0.85,
            r: Math.random() < 0.9 ? 0.6 + Math.random() * 0.7 : 1.4 + Math.random() * 0.6,
            a: 0.35 + Math.random() * 0.6,
            at: T.starsFrom + Math.random() ** 1.6 * (T.starsTo - T.starsFrom),   // a trickle at first, then more
        }));
    }
    function openness(t) {                          // the mouth while he talks: a flap, roughened
        const flap = 0.5 - 0.5 * Math.cos(t * SPEED);
        return flap * (0.5 + 0.5 * Math.sin(t * SPEED * 0.37) * Math.sin(t * SPEED * 1.71 + 1));
    }
    function frame(nowMs) {
        if (!running) return;
        const t = (nowMs - t0) / 1000, W = innerWidth, H = innerHeight;
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        for (const s of stars) {                     // each fades in once, then just stays
            const k = ease((t - s.at) / T.starFade);
            if (!k) continue;
            g.globalAlpha = s.a * k; g.fillStyle = '#f2efe6';
            g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
        if (t > T.faceFrom) {
            const k = ease((t - T.faceFrom) / T.faceFade);             // how far in he's dissolved
            const { text, talking, done } = script(t - boxAt, box ? box.says : []);
            const head = dissolve(k, Face.head(t - T.faceFrom, talking ? openness(t - boxAt) * Face.DROP : 0));
            const s = Math.min(H * SIZE / Face.h, W * 0.6 / Face.w) * (GROW + (1 - GROW) * k);
            g.save();
            g.translate(W / 2, H * 0.4); g.scale(s, s); g.translate(-Face.w / 2, -Face.h / 2);
            g.imageSmoothingEnabled = false;
            warble(head, t, k);
            g.drawImage(head, 0, 0);
            g.restore();
            if ($('callLine').textContent !== text) $('callLine').textContent = text;
            if (done && box) finished();
        }
        requestAnimationFrame(frame);
    }

    // His outline wavers like gravity's bending round him: faint copies behind, in rippling rows
    function warble(head, t, k) {
        const rows = Math.ceil(head.height / Face.PIXEL);
        for (const [alpha, speed] of WARBLE.copies) {
            g.globalAlpha = alpha * k;
            for (let r = 0; r < rows; r++) {
                const y = r * Face.PIXEL;
                const dx = WARBLE.amp * (Math.sin(y * 0.045 + t * 1.8 * speed) + 0.5 * Math.sin(y * 0.11 - t * 2.9 * speed));
                g.drawImage(head, 0, y, head.width, Face.PIXEL, dx, y, head.width, Face.PIXEL);
            }
        }
        g.globalAlpha = 1;
    }

    // Blocks of him appear in a random order as k goes 0 → 1: a pixel dissolve
    let order = null;
    const mask = document.createElement('canvas'), mg = mask.getContext('2d');
    const dis = document.createElement('canvas'), dg = dis.getContext('2d');
    function dissolve(k, src) {
        if (k >= 1) return src;
        const P = Face.PIXEL, cols = Math.ceil(src.width / P), rows = Math.ceil(src.height / P);
        if (!order) {
            order = Array.from({ length: cols * rows }, (_, i) => [i, Math.random()]).sort((a, b) => a[1] - b[1]).map(p => p[0]);
            mask.width = dis.width = src.width; mask.height = dis.height = src.height;
        }
        mg.clearRect(0, 0, mask.width, mask.height); mg.fillStyle = '#000';
        const shown = Math.floor(order.length * k);
        for (let n = 0; n < shown; n++) { const i = order[n]; mg.fillRect((i % cols) * P, Math.floor(i / cols) * P, P, P); }
        dg.globalCompositeOperation = 'copy'; dg.drawImage(src, 0, 0);
        dg.globalCompositeOperation = 'destination-in'; dg.drawImage(mask, 0, 0);
        return dis;
    }

    // Where his lines are at `t` s into speaking: the text so far, and whether his mouth moves
    function script(t, lines) {
        if (t < 0) return { text: '', talking: false, done: false };
        let text = '';
        for (const line of lines) {
            const dur = line.length * TYPE_S;
            if (t < dur) return { text: text + line.slice(0, Math.floor(t / TYPE_S)), talking: true, done: false };
            text += line + '\n';
            t -= dur;
            if (t < PAUSE_S) return { text, talking: false, done: false };
            t -= PAUSE_S;
        }
        return { text, talking: false, done: true };
    }

    /* ── The conversation ── */
    function show(b) { box = b; boxAt = Math.max(now() + 0.5, SPEAK); shown = false; }
    // He's finished a box: the player's replies, the ask list, or he's done
    function finished() {
        if (shown || ending) return;
        shown = true;
        if (box.contact) toast('☎  Chicago was saved to your contacts.');
        if (box.ask?.length) return offer(box.ask.map(a => ({ text: a.q, ask: a.id })),
                                          'Pick one of your security questions to ask him about. You only get one.');
        if (!box.options.length) return setTimeout(() => end(HANGUP), 900);
        offer(box.options.map((text, i) => ({ text, choice: i })));
    }
    function offer(list, note) {
        choices = list;
        $('callOpts').innerHTML = (note ? `<li class="note">${esc(note)}</li>` : '') +
            list.map((o, i) => `<li><button type="button" data-i="${i}">${i + 1}. ${esc(o.text)}</button></li>`).join('');
        $('callOpts').hidden = false;
    }
    async function choose(i) {
        const o = choices[i];
        if (!o || $('callOpts').hidden || ending) return;
        $('callOpts').hidden = true; choices = [];
        box = null; $('callLine').textContent = '';
        let res;
        try { res = await post('reply', o.ask !== undefined ? { ask: o.ask } : { choice: o.choice }); }
        catch { return end(HANGUP); }
        if (res.end === 'bomb') return bomb();
        if (res.box) return show(res.box);
        end(HANGUP);
    }
    $('callOpts').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });
    addEventListener('keydown', e => { if (running && /^[1-9]$/.test(e.key)) choose(+e.key - 1); });

    /* ── Starting + ending ── */
    function connect(first) {
        ac ??= new (window.AudioContext || window.webkitAudioContext)();
        ac.resume?.();
        fit(); makeStars(); order = null; ending = false; choices = [];
        $('callLine').textContent = ''; $('callOpts').hidden = true;
        $('call').hidden = false;
        t0 = performance.now();                    // the call's clock starts now — before the first box is timed on it
        show(first);
        humTo(0.035, T.hum);
        prepBang();
        running = true; requestAnimationFrame(frame);
    }
    function end(message, after) {
        ending = true;
        humTo(0, 0.15);
        setTimeout(() => {
            running = false;
            $('call').hidden = true; $('callWhite').classList.remove('on');
            document.querySelectorAll('.boom').forEach(b => b.remove());
            after?.();
            Dialup.popup(message);
        }, 250);
    }
    // The bomb: explosions all over (a quiet bang each), a white-out, the line's dead
    function bomb() {
        ending = true;
        $('callLine').textContent = '';
        for (let k = 0; k < 34; k++) setTimeout(() => {
            const b = document.createElement('img'), size = 90 + Math.random() * 220;
            bang(size);
            b.src = '../../Images/chicago/explosion.gif?' + k;         // each one plays from its start
            b.className = 'boom'; b.alt = '';
            Object.assign(b.style, { width: size + 'px', left: Math.random() * (innerWidth - size * 0.6) - size * 0.2 + 'px',
                                     top: Math.random() * (innerHeight - size * 0.6) - size * 0.2 + 'px' });
            document.body.appendChild(b);
        }, k * 65 + Math.random() * 120);
        setTimeout(() => $('callWhite').classList.add('on'), 2600);
        setTimeout(() => end('Error 651: The modem has reported an error.', singe), 3700);
    }
    function toast(text) { const el = $('callToast'); el.textContent = text; el.hidden = false; setTimeout(() => { el.hidden = true; }, 4000); }


    /* ━━ The singed row ━━
       Chicago's row after the bomb: the lid of a container that blew — it hangs
       off its left end, a darkened gap where it lifted away at the top right
       (the only real opening, so the smoke pours out there), soot round it,
       its Dial struck through. The smoke rises tall, curls on a shared current,
       and parts round the mouse so what's under it can be read. */
    const SINGE = { tilt: 2.4 };                   // degrees
    const SMOKE = { reach: 55, breeze: 1.1, clear: 70, part: 60, maxNudge: 60, settle: 1.1, current: 9 };
    let singed = null;                             // the built singe, while there is one

    function singe() {
        const row = document.querySelector('#numbers tr[data-caller="chicago"]');
        if (!row || row.classList.contains('singed')) return;
        row.classList.add('singed');
        const cell = row.lastElementChild;
        cell.innerHTML = '<span class="dead" aria-label="Dial (unavailable)">Dial</span>';
        row.insertAdjacentHTML('afterend', '<tr class="hang" aria-hidden="true"><td colspan="4"></td></tr>');
        singed = { row };
        if (row.offsetParent) build();                 // on show if it's hidden now (dialup.js calls Chicago.shown)
    }

    function build() {
        const s = singed, wrap = $('numbersWrap');
        if (!s || s.built || !s.row.offsetParent) return;
        s.built = true;
        const rnd = (a, b) => a + Math.random() * (b - a);
        s.row.classList.remove('tilt');
        const b = wrap.getBoundingClientRect(), r = s.row.getBoundingClientRect();
        const L = r.left - b.left, T0 = r.top - b.top, W = r.width, H = r.height;
        wrap.style.setProperty('--tilt', SINGE.tilt + 'deg');
        s.row.classList.add('tilt');
        const cos = Math.cos(SINGE.tilt * Math.PI / 180), sin = Math.sin(SINGE.tilt * Math.PI / 180);
        const turn = (x, y) => { const dx = x - L, dy = y - (T0 + H / 2); return [L + dx * cos - dy * sin, T0 + H / 2 + dx * sin + dy * cos]; };
        const add = el => { wrap.appendChild(el); (s.els ??= []).push(el); return el; };

        // the scorch + the gap, painted as soft blots so no edge is ever straight
        const PX = 60, PY = 44, cv = add(document.createElement('canvas'));
        cv.className = 'scorch'; cv.width = W + PX * 2; cv.height = H + PY * 2;
        Object.assign(cv.style, { left: L - PX + 'px', top: T0 - PY + 'px' });
        const sg = cv.getContext('2d'), X = x => x - L + PX, Y = y => y - T0 + PY;
        const blot = (x, y, rad, rgb, a) => {
            const gr = sg.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), rad);
            gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
            sg.fillStyle = gr; sg.beginPath(); sg.arc(X(x), Y(y), rad, 0, Math.PI * 2); sg.fill();
        };
        for (let i = 0; i < 90; i++) {                                // soot along the lid's edge, heavier to the right
            const k = Math.random() ** 0.7, [x, y] = turn(L + k * W, Math.random() < 0.5 ? T0 : T0 + H);
            blot(x + rnd(-8, 8), y + rnd(-10, 10), rnd(10, 26), '55,40,26', rnd(0.04, 0.09) * (0.5 + k));
        }
        for (let i = 0; i < 14; i++) blot(L + rnd(-10, 6), T0 + rnd(0, H), rnd(10, 22), '55,40,26', rnd(0.04, 0.08));   // the hinge end
        const [x0, y0] = turn(L, T0), [x1, y1] = turn(L + W, T0);    // the gap: from the hinge to the blown corner
        sg.save(); sg.filter = 'blur(1.5px)'; sg.fillStyle = 'rgba(30,21,13,0.66)';
        sg.beginPath(); sg.moveTo(X(x0), Y(T0 + 1));
        for (let k = 0.1; k <= 1.001; k += 0.1) sg.lineTo(X(x0 + (x1 - x0) * k + rnd(-2, 2)), Y(T0 - rnd(0, 2.5) * k));
        sg.lineTo(X(x1 + 5), Y(T0 + (y1 - T0) * 0.5)); sg.lineTo(X(x1), Y(y1)); sg.lineTo(X(x0), Y(y0));
        sg.closePath(); sg.fill(); sg.restore();
        for (let i = 0; i < 6; i++) blot(x1 + rnd(-6, 8), T0 + rnd(0, y1 - T0), rnd(8, 14), '30,21,13', rnd(0.18, 0.28));
        for (let i = 0; i < 26; i++) blot(x1 + rnd(-30, 30), T0 + rnd(-26, 6), rnd(14, 30), '40,28,16', rnd(0.05, 0.1));
        const ash = add(document.createElement('div'));                // soot on the lid itself
        ash.className = 'ash';
        Object.assign(ash.style, { left: L + 'px', top: T0 + 'px', width: W + 'px', height: H + 'px' });

        // the smoke
        const MX = 160, MY = 480, sc = add(document.createElement('canvas'));
        sc.className = 'smoke'; sc.width = b.width + MX * 2; sc.height = b.height + MY + 60;
        Object.assign(sc.style, { left: -MX + 'px', top: -MY + 'px' });
        const ctx = sc.getContext('2d');
        const SPRITES = Array.from({ length: 5 }, () => {           // lumpy puffs, made once, stamped (turned) everywhere
            const p = document.createElement('canvas'); p.width = p.height = 96;
            const pg = p.getContext('2d');
            for (let n = 0; n < 9; n++) {
                const a = rnd(0, 6.3), d = rnd(0, 20), x = 48 + Math.cos(a) * d, y = 48 + Math.sin(a) * d * 1.3, rr = rnd(14, 26);
                const gr = pg.createRadialGradient(x, y, 0, x, y, rr);
                gr.addColorStop(0, 'rgba(92,87,82,.35)'); gr.addColorStop(1, 'rgba(92,87,82,0)');
                pg.fillStyle = gr; pg.beginPath(); pg.arc(x, y, rr, 0, 6.3); pg.fill();
            }
            return p;
        });
        // where puffs come from (per s) and how they set off: dx, dy over their life; s = swell; o = thickness
        const SOURCES = [
            { rate: 14, at: () => { const top = Math.random() < 0.65; return turn(L + rnd(0, W * 0.85), top ? T0 : T0 + H).concat(top); },
              make: top => ({ life: rnd(6.5, 10), o: rnd(0.34, 0.54), size: rnd(8, 13), s: rnd(2.6, 3.8), dx: rnd(-6, 12), dy: top ? -rnd(34, 60) : -rnd(12, 26) }) },
            { rate: 6, at: () => { const k = rnd(0.05, 0.6); return [x0 + (x1 - x0) * k, T0 + rnd(0, (y1 - T0) * k + 1)]; },
              make: () => ({ life: rnd(7, 11), o: rnd(0.44, 0.64), size: rnd(10, 15), s: rnd(3, 4.2), dx: rnd(-4, 20), dy: -rnd(60, 100) }) },
            { rate: 14, at: () => { const k = Math.random() ** 0.4; return [x0 + (x1 - x0) * k + rnd(-4, 8), T0 + rnd(0, (y1 - T0) * k)]; },
              make: () => ({ life: rnd(8, 13), o: rnd(0.55, 0.8), size: rnd(11, 19), s: rnd(3.4, 5.2), dx: rnd(10, 50), dy: -rnd(120, 190) }) },
        ];
        let puffs = [], clock = 0, here = null, last = null;
        const current = (x, y, t) => [SMOKE.current * (Math.sin(y * 0.021 + t * 0.6) + 0.6 * Math.sin((x + y) * 0.013 - t * 0.35)),
                                      SMOKE.current * 0.35 * Math.sin(x * 0.017 - t * 0.5)];
        const cap = p => { const n = Math.hypot(p.nx, p.ny); if (n > SMOKE.maxNudge) { p.nx *= SMOKE.maxNudge / n; p.ny *= SMOKE.maxNudge / n; } };
        function step(dt) {
            clock += dt;
            for (const src of SOURCES) {
                src.owed = (src.owed || 0) + src.rate * dt;
                for (; src.owed >= 1; src.owed--) {
                    const [x, y, top] = src.at();
                    puffs.push({ ...src.make(top), x, y, age: 0, nx: 0, ny: 0, img: SPRITES[Math.floor(rnd(0, 5))], rot: rnd(0, 6.3), spin: rnd(-0.4, 0.4) });
                }
            }
            const settle = Math.exp(-SMOKE.settle * dt);
            for (const p of puffs) {
                p.age += dt;
                const k = p.age / p.life, slow = 1 - 0.55 * k, [cx, cy] = current(p.x, p.y, clock);
                p.x += (p.dx / p.life * slow + cx * k + p.nx) * dt;   // the current takes over as it rises
                p.y += (p.dy / p.life * slow + cy * k + p.ny) * dt;
                p.nx *= settle; p.ny *= settle;
                if (here) {                                           // parting round the pointer
                    const ox = p.x - here[0], oy = p.y - here[1], d = Math.hypot(ox, oy);
                    if (d < SMOKE.clear && d > 0.1) { const f = (1 - d / SMOKE.clear) * SMOKE.part * dt * 4; p.nx += ox / d * f; p.ny += oy / d * f; cap(p); }
                }
            }
            puffs = puffs.filter(p => p.age < p.life);
        }
        function draw() {
            ctx.clearRect(0, 0, sc.width, sc.height);
            for (const p of puffs) {
                const k = p.age / p.life, size = p.size * (0.7 + (p.s - 0.7) * Math.sqrt(k));
                ctx.globalAlpha = p.o * Math.min(1, k / 0.15) * (1 - k) ** 1.6;   // in quickly, then thins away slowly
                ctx.save(); ctx.translate(p.x + MX, p.y + MY); ctx.rotate(p.rot + p.spin * p.age); ctx.scale(1, 1 + 0.4 * k);
                ctx.drawImage(p.img, -size, -size, size * 2, size * 2); ctx.restore();
            }
            ctx.globalAlpha = 1;
        }
        s.move = e => {                                               // the pointer: a light breeze on the smoke it passes
            const rr = wrap.getBoundingClientRect(), x = e.clientX - rr.left, y = e.clientY - rr.top;
            if (last) for (const p of puffs) {
                const d = Math.hypot(p.x - x, p.y - y);
                if (d > SMOKE.reach) continue;
                const f = (1 - d / SMOKE.reach) ** 2;
                p.nx += (x - last[0]) * SMOKE.breeze * f; p.ny += (y - last[1]) * SMOKE.breeze * f; cap(p);
            }
            last = here = [x, y];
        };
        s.leave = () => { last = here = null; };
        addEventListener('pointermove', s.move);
        document.addEventListener('pointerleave', s.leave);
        for (let t = 0; t < 12; t += 1 / 30) step(1 / 30);           // already smoking
        let then = performance.now();
        (function tick(nowMs) {
            if (!s.built) return;
            if (s.row.offsetParent) { step(Math.min((nowMs - then) / 1000, 0.05)); draw(); }   // only while it's on screen
            then = nowMs;
            requestAnimationFrame(tick);
        })(then);
    }
    // Rebuild to fit (a resize moves the row)
    function rebuild() {
        if (!singed?.built) return;
        singed.els.forEach(el => el.remove()); singed.els = [];
        removeEventListener('pointermove', singed.move);
        document.removeEventListener('pointerleave', singed.leave);
        singed.built = false;
        build();
    }
    addEventListener('resize', () => { clearTimeout(rebuild.t); rebuild.t = setTimeout(rebuild, 200); });

    // Already blown up for this player? (the server knows — it's kept per email)
    function load() {
        const r = ref();
        if (!r) return;
        fetch(`${CONFIG.apiBase}/calls/state?ref=${encodeURIComponent(r)}`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : null).then(st => { if (st?.chicago?.singed) singe(); }).catch(() => {});
    }

    return {
        // → { answers, box } or { answers: false, reason }; no good reset link on this device → { denied }
        dial: () => post('dial', {}).then(res => res.error ? { answers: false, denied: true } : res),
        connect,
        load,
        shown: build,                              // Dial-Up Numbers came on screen: build the singe if it's waiting
    };
})();
