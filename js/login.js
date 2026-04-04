/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   login.js  —  LOGIN FORM + SECURED FLASH + INITIATION SEQUENCE

   Handles everything that happens on the login screen:
     - Listening for Enter key / form submission
     - Validating the passphrase against CONFIG.auth.accessCode
     - Showing status messages (wrong password, etc.)
     - The "SECURED" flash animation that plays on correct login
     - The city swoop intro sequence (first-visit only)

   DEPENDENCIES:
     config.js, utils.js, scan.js (Scan.start), CITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Login = (() => {

    /* ════════════════════════════════════════════════════════
       STATUS MESSAGE
       Sets the #msg element text and type class.
       Type is one of: 'error' | 'success' | 'info'
    ════════════════════════════════════════════════════════ */

    function showMessage(text, type) {
        const el = document.getElementById('msg');
        if (!el) return;
        el.textContent = text;
        el.className   = type;  // CSS handles colour via .error / .success / .info
    }


    /* ════════════════════════════════════════════════════════
       ATTEMPT LOGIN
       Reads the password input, validates it, and either shows
       an error or kicks off the post-login sequence.
    ════════════════════════════════════════════════════════ */

    async function attemptLogin() {
        const inputEl  = document.getElementById('password');
        const password = inputEl ? inputEl.value.trim().toLowerCase() : '';

        if (password !== CONFIG.auth.accessCode) {
            showMessage('Invalid credentials. This attempt has been logged.', 'error');
            if (inputEl) { inputEl.value = ''; inputEl.focus(); }
            return;
        }

        // Mark the gate as passed so returning visits skip the intro
        localStorage.setItem('baw_gate_passed', 'true');

        // Fade out the login phase
        const loginPhase = document.getElementById('loginPhase');
        loginPhase.style.transition = 'opacity 0.6s ease';
        loginPhase.style.opacity    = '0';

        await Utils.sleep(700);

        // Stop the city canvas (it was running during the login screen)
        CITY.stop();
        document.getElementById('cityCanvas').style.display = 'none';

        // Play the "SECURED" flash, then reveal the scan phase
        await playSecuredFlash();

        loginPhase.style.display = 'none';
        _revealScanPhase();
    }

    /* Fades the scan phase in after login, then starts streaming rows. */
    function _revealScanPhase() {
        const scanPhase = document.getElementById('scanPhase');
        scanPhase.style.display    = 'flex';
        scanPhase.style.opacity    = '0';
        scanPhase.style.transition = 'opacity 2s ease';

        // Start the sub-elements invisible — they fade in separately
        const subEls = ['.scan-lines-wrap', '.scan-progress', '.scan-right'];
        for (const sel of subEls) {
            const el = document.querySelector(sel);
            if (el) el.style.opacity = '0';
        }

        requestAnimationFrame(() => { scanPhase.style.opacity = '1'; });

        // After the scan phase fades in, reveal sub-elements and begin scan rows
        setTimeout(() => {
            for (const sel of subEls) {
                const el = document.querySelector(sel);
                if (el) {
                    el.style.transition = 'opacity 1.5s ease';
                    el.style.opacity    = '1';
                }
            }
            Scan.start();
        }, 3000);
    }


    /* ════════════════════════════════════════════════════════
       SECURED FLASH
       The word "SECURED" flickers in like a lamp switching on,
       fires expanding rectangular SVG ripples, holds, then flickers out.
       Returns a Promise that resolves when the flash is gone.
    ════════════════════════════════════════════════════════ */

    function playSecuredFlash() {
        return new Promise(resolve => {
            const flash   = document.getElementById('securedFlash');
            const word    = document.getElementById('securedWord');
            const ripples = document.getElementById('securedRipples');

            // Style the word for the ink-on-cream look
            flash.style.background = 'transparent';
            word.style.color       = 'var(--ink)';
            word.style.borderColor = 'var(--ink)';

            /* ── Ripple spawner ──
               Each ripple is an SVG rect that expands outward from the
               word's bounding box and fades to nothing over `dur` ms.
               scale controls the maximum expansion (so staggered ripples
               don't all reach the same size). */
            function spawnRipple(delay, scale = 1) {
                setTimeout(() => {
                    const rect   = word.getBoundingClientRect();
                    const cx     = rect.left + rect.width  / 2;
                    const cy     = rect.top  + rect.height / 2;
                    const startW = rect.width;
                    const startH = rect.height;

                    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    el.setAttribute('fill',         'none');
                    el.setAttribute('stroke',       'var(--ink)');
                    el.setAttribute('stroke-width', '0.8');
                    el.setAttribute('opacity',      '0.6');
                    ripples.appendChild(el);

                    const dur  = 1200;
                    const maxW = Math.max(window.innerWidth, window.innerHeight) * 2.4 * scale;
                    const maxH = maxW * (startH / startW);
                    const t0   = performance.now();

                    function animateRipple(ts) {
                        const rawT   = Math.min((ts - t0) / dur, 1);
                        const easedT = 1 - Math.pow(1 - rawT, 2);  // ease-out quad
                        const curW   = startW + (maxW - startW) * easedT;
                        const curH   = startH + (maxH - startH) * easedT;

                        el.setAttribute('x',       cx - curW / 2);
                        el.setAttribute('y',       cy - curH / 2);
                        el.setAttribute('width',   curW);
                        el.setAttribute('height',  curH);
                        el.setAttribute('opacity', (0.6 * (1 - rawT)).toFixed(3));

                        if (rawT < 1) requestAnimationFrame(animateRipple);
                        else          el.remove();
                    }
                    requestAnimationFrame(animateRipple);
                }, delay);
            }

            /* ── Flicker in ──
               Alternating on/off timings produce a lamp-switching-on effect.
               Even indices = on, odd indices = off.
               `t` accumulates the total elapsed time for each step. */
            const flickerIn = [0, 60, 120, 80, 160, 0, 200];
            let t = 0;
            flickerIn.forEach((dur, i) => {
                setTimeout(() => { flash.style.opacity = i % 2 === 0 ? '1' : '0'; }, t);
                t += dur;
            });

            // Spawn ripples at the moment the flash settles on
            spawnRipple(t,        1.0);
            spawnRipple(t +  80,  0.7);
            spawnRipple(t + 180,  0.5);
            spawnRipple(t + 320,  0.35);

            const holdEnd = t + 900;

            /* ── Flicker out ──
               Same idea in reverse — starts off this time. */
            const flickerOut = [0, 50, 100, 60, 140, 0, 180];
            let t2 = holdEnd;
            flickerOut.forEach((dur, i) => {
                setTimeout(() => { flash.style.opacity = i % 2 === 0 ? '0' : '1'; }, t2);
                t2 += dur;
            });

            // Callback after the flash disappears
            setTimeout(() => {
                flash.style.opacity = '0';
                resolve();
            }, t2 + 100);
        });
    }


    /* playInitiationSequence removed — CITY.js now owns the full
       intro sequence. Login reveal is triggered via CITY.onLoginReveal
       callback, wired in session.js. */


    /* ════════════════════════════════════════════════════════
       INIT
    ════════════════════════════════════════════════════════ */

    document.addEventListener('DOMContentLoaded', () => {
        // Enter key submits the login form from anywhere on the page
        document.addEventListener('keydown', e => {
            if (e.key === 'Enter') attemptLogin();
        });
    });


    /* ════════════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════════════ */

    return {
        attemptLogin,
    };

})();
