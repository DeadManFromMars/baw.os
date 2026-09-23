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

        let ok = false, closed = false;
        try {
            const res = await fetch(`${CONFIG.apiBase}/api/verify`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: input.value.trim() }),
            });
            const data = await res.json();
            ok = data.ok === true;
            closed = data.closed === true;
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

        const loginPhase = document.getElementById('loginPhase');
        loginPhase.style.transition = 'opacity 0.6s ease';
        loginPhase.style.opacity    = '0';

        // Right, but the site isn't open yet (backend GATE_CLOSED): fade to "come back soon"
        if (closed) {
            $('comeBack').classList.add('on');
            CITY.fadeOutMusic(() => CITY.stop());
            return;
        }

        // Correct — returning visits skip straight to the card prompt (session.js)
        try { localStorage.setItem('baw_gate_passed', 'true'); } catch {}

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


    /* SECURED flickers on, fires ripples, holds, flickers off (Utils.flashWord) */
    const playSecuredFlash = () => Utils.flashWord(
        document.getElementById('securedFlash'), document.getElementById('securedWord'), document.getElementById('securedRipples'));


    document.addEventListener('DOMContentLoaded', () => {
        $('password').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
        $('resetEmail').addEventListener('keydown', e => { if (e.key === 'Enter') requestReset(); });
        $('lpForgot').addEventListener('click', () => { SFX.hover(); showReset(true); });
        $('lpResetBack').addEventListener('click', () => { SFX.hover(); showReset(false); });
        $('lpAbout').addEventListener('click', () => $('aboutPanel').showModal());
        $('aboutClose').addEventListener('click', () => $('aboutPanel').close());
        wrongGuesses();                   // earned before? the link is already there
    });

    return { attemptLogin, revealScanPhase };
})();
