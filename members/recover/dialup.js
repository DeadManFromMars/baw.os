/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   dialup.js — Member Services › Dial-Up Numbers (and page switching)

   The sidebar's data-page links swap pages in place, so answers typed
   on Password Reset survive a look at the numbers. Dial: dial tone,
   the number keyed in (touch tones, Web Audio), ringing, then a
   Windows dial-up error — except the one that answers: Peanut, who
   can't help with anything. All front end; nothing here is secret.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(() => {
    const $ = id => document.getElementById(id);

    /* ── Pages ── */
    document.addEventListener('click', e => {
        const link = e.target.closest('[data-page]');
        if (!link) return;
        e.preventDefault();
        for (const a of document.querySelectorAll('[data-page]')) {
            a.classList.toggle('on', a === link);
            $(a.dataset.page).hidden = a !== link;
        }
        $('crumb').textContent = link.textContent;
        $('soon').hidden = true;
    });


    /* ── The numbers ──
       ends: 'none' rings out · 'busy' busy signal · 'gone' not in service · 'peanut' answers */
    const NUMBERS = [
        { at: 'Wilmington, DE',   num: '(302) 555-0104', speed: '56K V.90', ends: 'gone' },
        { at: 'Washington, DC',   num: '(202) 555-0126', speed: '56K V.90', ends: 'busy' },
        { at: 'Chicago, IL',      num: '(312) 555-0168', speed: '56K V.90', ends: 'none' },
        { at: 'Boston, MA',       num: '(617) 555-0173', speed: '33.6K',    ends: 'none' },
        { at: 'Baltimore, MD',    num: '(410) 555-0162', speed: '56K V.90', ends: 'busy' },
        { at: 'Newark, NJ',       num: '(973) 555-0131', speed: '56K V.90', ends: 'none' },
        { at: 'New York, NY',     num: '(212) 555-0118', speed: '56K V.90', ends: 'none' },
        { at: 'Cleveland, OH',    num: '(216) 555-0195', speed: '33.6K',    ends: 'gone' },
        { at: 'Philadelphia, PA', num: '(215) 555-0147', speed: '56K V.90', ends: 'peanut' },
        { at: 'Pittsburgh, PA',   num: '(412) 555-0189', speed: '28.8K',    ends: 'none' },
        { at: 'Richmond, VA',     num: '(804) 555-0150', speed: '56K V.90', ends: 'none' },
        { at: 'Seattle, WA',      num: '(206) 555-0112', speed: '56K V.90', ends: 'busy' },
    ];
    $('numbers').innerHTML = NUMBERS.map((n, i) =>
        `<tr><td>${n.at}</td><td class="num">${n.num}</td><td>${n.speed}</td><td><a href="#" data-dial="${i}">Dial</a></td></tr>`).join('');


    /* ── Phone sounds (Web Audio; made on the Dial click, so browsers allow it) ── */
    let ac = null, live = [];
    const DTMF = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
                   7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336] };

    // Two sine tones mixed, `at` seconds from now, for `dur`
    function tone(freqs, at, dur, vol = 0.08) {
        const t = ac.currentTime + at, g = ac.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.01);
        g.gain.setValueAtTime(vol, t + dur - 0.01);
        g.gain.linearRampToValueAtTime(0, t + dur);
        g.connect(ac.destination);
        for (const f of freqs) {
            const o = ac.createOscillator();
            o.frequency.value = f;
            o.connect(g); o.start(t); o.stop(t + dur);
            live.push(o);
        }
    }
    function silence() { live.forEach(o => { try { o.stop(); } catch {} }); live = []; }


    /* ── Dialing ── */
    let timers = [];
    const later = (sec, fn) => timers.push(setTimeout(fn, sec * 1000));
    const status = text => { $('dialerStatus').textContent = text; };

    function hangUp() {
        timers.forEach(clearTimeout); timers = [];
        silence();
        $('dialer').hidden = true;
    }

    function dial(n) {
        hangUp();
        ac ??= new (window.AudioContext || window.webkitAudioContext)();
        ac.resume?.();
        $('dialer').hidden = false;
        $('dialerBtn').value = 'Cancel';

        // Dial tone, then the digits (US touch tones)
        status('Dialing ' + n.num + '…');
        tone([350, 440], 0, 0.8);
        const digits = n.num.replace(/\D/g, '');
        let t = 0.9;
        for (const d of digits) { tone(DTMF[d], t, 0.09); t += 0.16; }
        t += 0.6;

        if (n.ends === 'gone') {                           // the three rising tones, then the recording's words
            [913.8, 1370.6, 1776.7].forEach((f, i) => tone([f], t + i * 0.33, 0.3));
            later(t + 1.2, () => fail('The number you have dialed is not in service. Please check the number and dial again.'));
            return;
        }
        if (n.ends === 'busy') {                           // US busy signal: ½ s on, ½ s off
            for (let k = 0; k < 6; k++) tone([480, 620], t + k, 0.5);
            later(t + 5.5, () => fail('Error 676: The line is busy. Try again later.'));
            return;
        }
        // Ringing: 2 s on, 4 s off
        const rings = n.ends === 'peanut' ? 2 : 3;
        for (let k = 0; k < rings; k++) tone([440, 480], t + k * 6, 2);
        later(t, () => status('Ringing…'));
        if (n.ends === 'peanut') later(t + 8.2, answer);
        else later(t + rings * 6, () => fail('Error 678: The remote computer did not respond.'));
    }

    function fail(text) {
        silence();
        status(text);
        $('dialerBtn').value = 'Close';
    }

    document.addEventListener('click', e => {
        const link = e.target.closest('[data-dial]');
        if (!link) return;
        e.preventDefault();
        dial(NUMBERS[+link.dataset.dial]);
    });
    $('dialerBtn').addEventListener('click', hangUp);


    /* ── Peanut ── */
    const HELLO = 'what can i help you with??!!';
    const REPLIES = [
        "can't help you",
        'i dont know man, google it',
        'idk',
        'not my department',
        'have you tried turning it off and on again',
        "that sounds like a you problem",
        'hmm. no',
        'sounds hard. good luck!!',
        'ask someone else',
        'did you read the FAQ',
        "i'm on break",
        'wow. no idea',
        'k',
        "that's above my pay grade",
        'have you tried not doing that',
        'ok and?',
        'lol',
        "can't help you there buddy",
        "i'm just an elf",
        'try again later. or never',
    ];
    const TYPE_MS = 45;               // per letter as he types a reply out
    let lastReply = -1, typing = null;

    // Type `text` into his bubble a letter at a time (a new one cuts off the last)
    function say(text) {
        clearInterval(typing);
        const el = $('peanutSays');
        let n = 0;
        el.textContent = '';
        typing = setInterval(() => {
            el.textContent = text.slice(0, ++n);
            if (n >= text.length) clearInterval(typing);
        }, TYPE_MS);
    }

    function answer() {
        hangUp();
        $('peanut').hidden = false;
        const music = $('peanutMusic');
        music.currentTime = 0;                       // always from the top, looping
        music.volume = 0.2;
        music.play().catch(() => {});
        say(HELLO);
        $('peanutInput').value = '';
        $('peanutInput').focus();
    }

    $('peanutAsk').addEventListener('submit', e => {
        e.preventDefault();
        if (!$('peanutInput').value.trim()) return;
        $('peanutInput').value = '';
        let i;
        do i = Math.floor(Math.random() * REPLIES.length); while (i === lastReply);   // never the same twice running
        lastReply = i;
        say(REPLIES[i]);
    });

    function leavePeanut() {
        clearInterval(typing);
        $('peanutMusic').pause();
        $('peanut').hidden = true;
    }
    $('peanutHang').addEventListener('click', leavePeanut);
    addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!$('peanut').hidden) leavePeanut();
        else if (!$('dialer').hidden) hangUp();
    });
})();
