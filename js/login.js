/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   login.js — passphrase screen → "SECURED" flash → scan phase

   Enter in the passphrase box checks it with POST /api/verify
   (the passphrase itself never lives in the frontend). Wrong:
   message + city glitch. Right: city music fades, SECURED flashes,
   and the scan phase starts (scan.js).

   The city intro + revealing this screen is session.js's job.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Login = (() => {

    let busy = false;   // one attempt at a time — and never twice after success

    function showMessage(text, type) {
        const el = document.getElementById('msg');
        el.textContent = text;
        el.className   = `msg ${type}`;
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

    /* Fade the scan phase in; its columns follow, then rows start streaming */
    async function revealScanPhase() {
        const scanPhase = document.getElementById('scanPhase');
        const columns   = ['.scan-lines-wrap', '.scan-progress', '.scan-right'].map(s => document.querySelector(s));

        Object.assign(scanPhase.style, { display: 'flex', opacity: '0', transition: 'opacity 2s ease' });
        columns.forEach(el => { el.style.opacity = '0'; });
        requestAnimationFrame(() => { scanPhase.style.opacity = '1'; });

        await Utils.sleep(3000);
        columns.forEach(el => { el.style.transition = 'opacity 1.5s ease'; el.style.opacity = '1'; });
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
        document.getElementById('password').addEventListener('keydown', e => {
            if (e.key === 'Enter') attemptLogin();
        });
    });

    return { attemptLogin };
})();
