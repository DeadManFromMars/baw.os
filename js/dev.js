/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   dev.js  —  DEVELOPMENT SHORTCUTS

   ████████████████████████████████████████████████████
   ██  REMOVE THIS FILE BEFORE DEPLOYING TO PRODUCTION ██
   ████████████████████████████████████████████████████

   This file is intentionally separate from all other scripts
   so it's a single line to exclude from production:
     → Just delete the <script src="js/dev.js"></script> tag.

   Nothing in the main codebase imports or depends on this file.
   All shortcuts are additive — they only add new keyboard shortcuts
   and don't modify any core module behaviour.

   SHORTCUTS:
     Password field: 'wawamangosmoothie'
       → Bypasses login entirely, skips straight to the dissolve/ARG flow.
       → Sets baw_gate_passed in localStorage so the returning-visit
         path is ready on next load.

     Keyboard shortcuts (fired from anywhere):
       Alt + 1  → Jump to registration prompt
       Alt + 2  → Jump to card prompt
       Alt + 0  → Clear all localStorage (reset to first visit)
       Alt + L  → Log current DataStore values to console
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(function initDevTools() {

    const DEV_PASSWORD = 'wawamangosmoothie';

    console.info(
        '%c[DEV] dev.js loaded — keyboard shortcuts active.\n' +
        'Alt+1: reg prompt | Alt+2: card prompt | Alt+0: clear storage | Alt+L: log data\n' +
        'Remove <script src="js/dev.js"> before going live.',
        'color: #e8372a; font-weight: bold;'
    );


    /* ── Dev password bypass ──────────────────────────────────
       Intercepts the login keydown listener before Login.attemptLogin
       sees it. If the dev password is detected, we short-circuit the
       full sequence and dump straight into the dissolve + ARG flow. */
    document.addEventListener('keydown', function devPasswordListener(e) {
        if (e.key !== 'Enter') return;
        const inputEl = document.getElementById('password');
        if (!inputEl) return;

        const value = inputEl.value.trim().toLowerCase();
        if (value !== DEV_PASSWORD) return;

        // Prevent the real attemptLogin from also running
        e.stopImmediatePropagation();

        console.info('[DEV] Dev bypass activated — skipping to dissolve.');

        localStorage.setItem('baw_gate_passed', 'true');

        // Hide login instantly (no animation — this is a dev shortcut)
        const loginEl = document.getElementById('loginPhase');
        if (loginEl) { loginEl.style.transition = 'none'; loginEl.style.display = 'none'; }

        // Show the scan phase and immediately dissolve it
        const scanPhase = document.getElementById('scanPhase');
        if (scanPhase) { scanPhase.style.display = 'flex'; scanPhase.style.opacity = '1'; }

        // Dissolve is on the Scan module — call it directly
        // triggerDissolve is not exported but we can reach it via session state.
        // Simplest: jump the globe and show the ARG prompt directly.
        if (window.startGlobeMove) {
            window.startGlobeMove(CONFIG.globe.centerX, CONFIG.globe.centerY);
        }
        const header = document.querySelector('.scan-header');
        if (header) { header.style.left = '50%'; header.style.top = CONFIG.globe.postScanY + '%'; }

        setTimeout(() => Arg.showArgRegistration(), 400);

    }, true);  // useCapture:true so we intercept before the login handler


    /* ── Alt key shortcuts ──────────────────────────────────── */
    document.addEventListener('keydown', function devHotkeys(e) {
        if (!e.altKey) return;

        switch (e.key) {

            // Alt+1 — jump to registration prompt
            case '1':
                e.preventDefault();
                console.info('[DEV] Jumping to registration prompt.');
                Arg.showArgRegistration();
                break;

            // Alt+2 — jump to card upload prompt
            case '2':
                e.preventDefault();
                console.info('[DEV] Jumping to card prompt.');
                Arg.showArgCardPrompt();
                break;

            // Alt+0 — wipe localStorage and reload (full reset to first visit)
            case '0':
                e.preventDefault();
                console.info('[DEV] Clearing localStorage and reloading.');
                localStorage.removeItem('baw_gate_passed');
                localStorage.removeItem('baw_registered');
                localStorage.removeItem('baw_username');
                window.location.reload();
                break;

            // Alt+L — dump current DataStore to the console
            case 'l':
            case 'L':
                e.preventDefault();
                console.group('[DEV] DataStore.ready');
                for (const [k, v] of Object.entries(DataStore.ready)) {
                    console.log(`  ${k.padEnd(20)} ${v}`);
                }
                console.groupEnd();
                break;
        }
    });

})();
