/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   login.js — passphrase screen → "SECURED" flash → scan phase

   Enter in the passphrase box checks it with POST /api/verify
   (the passphrase itself never lives in the frontend). Wrong:
   message + city glitch. Right: city music fades, SECURED flashes,
   and the scan phase starts (scan.js).

   The passphrase only works once this browser has been through
   password recovery (the first puzzle, backend app/recovery.py):
   after 3 wrong guesses "forgot your password?" appears, which
   emails a link to Member Services (members/recover/).

   The city intro + revealing this screen is session.js's job.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Login = (() => {

    const $ = id => document.getElementById(id);
    const FORGOT_AFTER = 3;   // wrong guesses before "forgot your password?" shows (and stays)

    let busy = false;   // one attempt at a time — and never twice after success

    function showMessage(text, type, id = 'msg') {
        const el = $(id);
        el.textContent = text;
        el.className   = `msg ${type}`;
    }

    // Wrong guesses, remembered per browser — once it's earned, the link stays
    function wrongGuesses(add = 0) {
        let n = 0;
        try {
            n = Number(localStorage.getItem('baw_wrong_guesses')) || 0;
            if (add) localStorage.setItem('baw_wrong_guesses', String(n += add));
        } catch { n += add; }
        $('lpForgot').hidden = n < FORGOT_AFTER;
        return n;
    }


    /* ── Password reset ── */

    function showReset(on) {
        $('lpSignIn').hidden = on;
        $('lpReset').hidden  = !on;
        (on ? $('resetEmail') : $('password')).focus();
    }

    let sending = false;
    async function requestReset() {
        const email = $('resetEmail').value.trim();
        if (sending || !email) return;
        sending = true;
        showMessage('Sending…', 'info', 'resetMsg');
        try {
            const res  = await fetch(`${CONFIG.apiBase}/recovery/request`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showMessage('Check your email. The link works for 24 hours.', 'success', 'resetMsg');
                $('resetEmail').value = '';
                if (data.dev_link) console.info('[Login] dev reset link:', data.dev_link);   // local only
            } else {
                showMessage(data.error || 'Something went wrong. Please try again.', 'error', 'resetMsg');
            }
        } catch {
            showMessage('Connection error. Please try again.', 'error', 'resetMsg');
        }
        sending = false;
    }

    async function attemptLogin() {
        if (busy) return;
        busy = true;
        const input = document.getElementById('password');

        let ok = false;
        try {
            const res = await fetch(`${CONFIG.apiBase}/api/verify`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: input.value.trim() }),
            });
            ok = (await res.json()).ok === true;
        } catch (err) {
            console.error('[Login] /api/verify failed:', err);
            showMessage('Connection error. Please try again.', 'error');
            busy = false;
            return;
        }

        if (!ok) {
            showMessage('Invalid credentials. This attempt has been logged.', 'error');
            wrongGuesses(1);
            CITY.corruptEffect();
            input.value = '';
            input.focus();
            busy = false;
            return;
        }

        // Correct — returning visits skip straight to the card prompt (session.js)
        try { localStorage.setItem('baw_gate_passed', 'true'); } catch {}

        const loginPhase = document.getElementById('loginPhase');
        loginPhase.style.transition = 'opacity 0.6s ease';
        loginPhase.style.opacity    = '0';

        CITY.fadeOutMusic(async () => {
            await Utils.sleep(200);
            CITY.stop();
            document.getElementById('cityCanvas').style.display = 'none';
            await playSecuredFlash();
            loginPhase.style.display = 'none';
            revealScanPhase();
        });
    }

    /* The log-on: blank screen → globe grows in (globe.js) → as it settles
       the wordmark rises above it → the data panel fades in → rows stream */
    async function revealScanPhase() {
        const scanPhase = document.getElementById('scanPhase');
        const panel     = document.querySelector('.scan-left');

        await Utils.sleep(600);                 // a beat of empty screen
        await window.globeLogOn();              // resolves as the globe starts settling
        document.body.classList.add('accents-ready');   // page frame fades in (background.css)

        panel.style.opacity = '0';
        Object.assign(scanPhase.style, { display: 'block', opacity: '1' });   // wordmark has its own rise-in (scan.css)

        await Utils.sleep(1700);
        Object.assign(panel.style, { transition: 'opacity 1.2s ease', opacity: '1' });
        Scan.start();
    }


    /* ════════════════════════════════════════════════════════
       SECURED FLASH — "SECURED" flickers on like a lamp, fires
       expanding rectangle ripples, holds, flickers off.
    ════════════════════════════════════════════════════════ */

    // Alternating on/off step durations in ms (index 0 = first state)
    const FLICKER_ON  = [0, 60, 120, 80, 160, 0, 200];
    const FLICKER_OFF = [0, 50, 100, 60, 140, 0, 180];
    const HOLD_MS     = 900;

    function playSecuredFlash() {
        return new Promise(resolve => {
            const flash   = document.getElementById('securedFlash');
            const word    = document.getElementById('securedWord');
            const ripples = document.getElementById('securedRipples');

            // Schedule a flicker: even steps show `firstOn`, odd steps the opposite
            const flicker = (steps, startMs, firstOn) => {
                let t = startMs;
                steps.forEach((dur, i) => {
                    setTimeout(() => { flash.style.opacity = (i % 2 === 0) === firstOn ? '1' : '0'; }, t);
                    t += dur;
                });
                return t;
            };

            // One rectangle growing out from the word and fading
            const spawnRipple = (delay, scale) => setTimeout(() => {
                const r = word.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const maxW = Math.max(innerWidth, innerHeight) * 2.4 * scale;
                const maxH = maxW * (r.height / r.width);
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('class', 'secured-ripple');
                ripples.appendChild(rect);

                const start = performance.now();
                (function grow(now) {
                    const p = Math.min((now - start) / 1200, 1);
                    const e = 1 - (1 - p) * (1 - p);                      // ease-out
                    const w = r.width + (maxW - r.width) * e, h = r.height + (maxH - r.height) * e;
                    rect.setAttribute('x', cx - w / 2);
                    rect.setAttribute('y', cy - h / 2);
                    rect.setAttribute('width', w);
                    rect.setAttribute('height', h);
                    rect.setAttribute('opacity', (0.6 * (1 - p)).toFixed(3));
                    p < 1 ? requestAnimationFrame(grow) : rect.remove();
                })(start);
            }, delay);

            const onAt = flicker(FLICKER_ON, 0, true);
            [[0, 1], [80, 0.7], [180, 0.5], [320, 0.35]].forEach(([delay, scale]) => spawnRipple(onAt + delay, scale));
            const offAt = flicker(FLICKER_OFF, onAt + HOLD_MS, false);
            setTimeout(() => { flash.style.opacity = '0'; resolve(); }, offAt + 100);
        });
    }


    document.addEventListener('DOMContentLoaded', () => {
        $('password').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
        $('resetEmail').addEventListener('keydown', e => { if (e.key === 'Enter') requestReset(); });
        $('lpForgot').addEventListener('click', () => { SFX.hover(); showReset(true); });
        $('lpResetBack').addEventListener('click', () => { SFX.hover(); showReset(false); });
        wrongGuesses();                   // earned before? the link is already there
    });

    return { attemptLogin };
})();
