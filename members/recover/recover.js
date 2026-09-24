/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   recover.js — Member Services › Password Reset (backend: app/recovery.py)

   The emailed link brings ?ref=<token>. It's moved out of the address
   bar straight away (kept on this device, so a reload, a new tab or a
   later visit still knows who this is — Dial-Up Numbers needs it), then:
     GET  /recovery/questions  → the questions, or the password if done
     POST /recovery/answer     → which answers are right; all right = the password
   Right answers lock in (greyed, green check) for as long as the page
   is open — a refresh or a new link means typing them all again.
   After 3 wrong submits: a security check (type the characters) for
   3 more. The server keeps the count, so a refresh doesn't skip it.
   Answers are only ever checked on the server.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(() => {
    const $ = id => document.getElementById(id);
    const STEPS = ['1. Request', '2. Verify identity', '3. Your password'];

    let ref = new URLSearchParams(location.search).get('ref');
    try {
        if (ref) localStorage.setItem('baw_recover_ref', ref);
        else ref = localStorage.getItem('baw_recover_ref') ?? sessionStorage.getItem('baw_recover_ref');   // (older visits kept it per tab)
    } catch {}
    if (location.search) history.replaceState(null, '', location.pathname);

    let inputs = [];      // one per question
    let locked = [];      // which are locked in (right)

    function show(id, step) {
        for (const view of ['loading', 'ask', 'done', 'dead']) $(view).hidden = view !== id;
        $('steps').innerHTML = STEPS.map((s, i) => (i === step ? `<b>${s}</b>` : s)).join(' &nbsp;&rsaquo;&nbsp; ');
    }

    function dead(message) {
        $('deadMsg').textContent = message;
        show('dead', 1);
    }

    function done(password) {
        $('pw').textContent = password;
        show('done', 2);
    }

    async function call(path, options) {
        try {
            const res = await fetch(CONFIG.apiBase + path, { credentials: 'include', ...options });
            return { status: res.status, data: await res.json().catch(() => ({})) };
        } catch {
            return { status: 0, data: { error: 'The server could not be reached. Please try again later.' } };
        }
    }
    const post = (path, body) => call(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    const attemptsNote = left =>
        left > 1 ? ` You have ${left} attempts remaining.` : left === 1 ? ' You have 1 attempt remaining.' : '';


    /* ── The questions ── */

    // ###-##-####: digits only, the dashes put in as they type
    function ssnField(input) {
        Object.assign(input, { inputMode: 'numeric', placeholder: '###-##-####', maxLength: 11 });
        input.classList.add('ssn');
        input.addEventListener('input', () => {
            const d = input.value.replace(/\D/g, '').slice(0, 9);
            input.value = [d.slice(0, 3), d.slice(3, 5), d.slice(5)].filter(Boolean).join('-');
        });
    }

    function lockIn(i) {
        locked[i] = true;
        inputs[i].readOnly = true;
        inputs[i].classList.add('locked');
        inputs[i].closest('tr').querySelector('.ok').textContent = '✓';
    }

    // While the security check is up, nothing else can be changed or sent
    function setWaiting(on) {
        inputs.forEach((input, i) => { if (!locked[i]) input.disabled = on; });
        $('askBtn').hidden = on;
        $('cap').hidden    = !on;
    }

    async function load() {
        show('loading', 1);
        if (!ref) return dead('This link is invalid or has expired.');
        const { status, data } = await call(`/recovery/questions?ref=${encodeURIComponent(ref)}`);
        if (data.cleared) return done(data.password);
        if (status !== 200) return dead(data.error || 'Something went wrong. Please try again later.');

        $('askRows').innerHTML = '';
        inputs = data.questions.map(({ q, format }, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="l"><label for="q${i}"></label></td>`
                          + `<td><input type="text" id="q${i}" spellcheck="false" autocomplete="off"></td><td class="ok"></td>`;
            row.querySelector('label').textContent = q;           // question text is data, never markup
            const input = row.querySelector('input');
            if (format === 'ssn') ssnField(input);
            $('askRows').appendChild(row);
            return input;
        });
        locked = inputs.map(() => false);
        show('ask', 1);
        if (data.captcha) return startCheck('Please complete the security check to continue.');
        inputs[0].focus();
    }

    $('askForm').addEventListener('submit', async e => {
        e.preventDefault();
        $('askBtn').disabled = true;
        const { status, data } = await post('/recovery/answer', { ref, answers: inputs.map(i => i.value) });
        $('askBtn').disabled = false;

        if (data.cleared) return done(data.password);
        if (status === 403) {
            data.correct.forEach((right, i) => { if (right && !locked[i]) lockIn(i); });
            $('askErr').textContent = data.error + attemptsNote(data.attempts_left);
            if (data.captcha) return startCheck();
            inputs.find((_, i) => !locked[i])?.focus();
            return;
        }
        if (status === 423) return startCheck(data.error);
        if (status === 400 || status === 429) { $('askErr').textContent = data.error; return; }
        dead(data.error || 'Something went wrong. Please try again later.');
    });


    /* ── The security check ── */

    // The characters, drawn the way 2001 did it: each one its own font, size
    // and tilt, over speckle and a couple of scratches, then rippled.
    const FONTS = ['Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Arial Black'];
    function drawCheck(text) {
        const canvas = $('capImg'), ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height, rnd = (a, b) => a + Math.random() * (b - a);
        const flat = document.createElement('canvas');
        flat.width = w; flat.height = h;
        const f = flat.getContext('2d');
        f.fillStyle = '#ecece6';
        f.fillRect(0, 0, w, h);
        for (let i = 0; i < 260; i++) {
            f.fillStyle = `rgba(0,0,0,${rnd(0.05, 0.25).toFixed(2)})`;
            f.fillRect(rnd(0, w), rnd(0, h), 1.5, 1.5);
        }
        [...text].forEach((ch, i) => {
            f.save();
            f.translate(18 + i * 29 + rnd(-3, 3), h / 2 + rnd(-5, 5));
            f.rotate(rnd(-0.4, 0.4));
            f.font = `bold ${Math.round(rnd(24, 32))}px '${FONTS[Math.floor(Math.random() * FONTS.length)]}'`;
            f.fillStyle = `rgb(${Math.round(rnd(20, 90))},${Math.round(rnd(20, 70))},${Math.round(rnd(40, 110))})`;
            f.textBaseline = 'middle';
            f.fillText(ch, 0, 0);
            f.restore();
        });
        for (let i = 0; i < 2; i++) {
            f.strokeStyle = 'rgba(40,40,60,0.55)';
            f.lineWidth = 1.5;
            f.beginPath();
            f.moveTo(0, rnd(10, h - 10));
            f.bezierCurveTo(w / 3, rnd(0, h), (2 * w) / 3, rnd(0, h), w, rnd(10, h - 10));
            f.stroke();
        }
        // Ripple: shift each column up or down along a wave
        ctx.clearRect(0, 0, w, h);
        const phase = rnd(0, Math.PI * 2);
        for (let x = 0; x < w; x++) ctx.drawImage(flat, x, 0, 1, h, x, Math.sin(x / 14 + phase) * 3, 1, h);
    }

    async function startCheck(message) {
        if (message) $('askErr').textContent = message;
        setWaiting(true);
        $('capErr').textContent = '';
        $('capInput').value = '';
        const { status, data } = await call(`/recovery/captcha?ref=${encodeURIComponent(ref)}`);
        if (status === 409) return setWaiting(false);          // no check needed after all
        if (status !== 200) return dead(data.error || 'Something went wrong. Please try again later.');
        drawCheck(data.text);
        $('capInput').focus();
    }

    async function verifyCheck() {
        const text = $('capInput').value.trim();
        if (!text) return;
        $('capBtn').disabled = true;
        const { status, data } = await post('/recovery/captcha', { ref, text });
        $('capBtn').disabled = false;
        if (status === 200) {
            setWaiting(false);
            $('askErr').textContent = 'Thank you. Please try again.' + attemptsNote(data.attempts_left);
            inputs.find((_, i) => !locked[i])?.focus();
            return;
        }
        if (status === 403) {
            $('capErr').textContent = data.error;
            $('capInput').value = '';
            drawCheck(data.text);
            return;
        }
        if (status === 429) { $('capErr').textContent = data.error; return; }
        dead(data.error || 'Something went wrong. Please try again later.');
    }

    $('capBtn').addEventListener('click', verifyCheck);
    $('capInput').addEventListener('keydown', e => { if (e.key === 'Enter') verifyCheck(); });
    $('capNew').addEventListener('click', e => { e.preventDefault(); startCheck(); });


    // The rest of Member Services isn't there (yet)
    document.addEventListener('click', e => {
        if (!e.target.closest('[data-soon]')) return;
        e.preventDefault();
        $('soon').hidden = false;
    });

    load();
})();
