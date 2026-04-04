/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   session.js  —  SESSION ORCHESTRATION

   Entry point. Runs on DOMContentLoaded. Reads localStorage to
   determine what state the visitor is in, then routes them.

   THREE VISIT STATES:
     1. First visit      — gatePassed is null
        → CITY.start() plays the full sequence (wave → swoop → cruise)
        → When camera nears cruise, login form fades in
        → Login success → secured flash → scan phase

     2. Returning, unregistered  — gatePassed set, registered null
        → Skip intro, city runs in background at z-index 18
        → Go straight to registration

     3. Returning, registered    — both set
        → Skip intro, city in background
        → Go straight to card upload

   DEPENDENCIES: must load last — config, utils, city, login, arg
   must all be ready.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

document.addEventListener('DOMContentLoaded', () => {

    const gatePassed = localStorage.getItem('baw_gate_passed');
    const registered = localStorage.getItem('baw_registered');

    if (!gatePassed) {
        _handleFirstVisit();
    } else {
        _handleReturningVisit(registered);
    }

});


/* ════════════════════════════════════════════════════════════════
   FIRST VISIT
   Plays the full CITY sequence. Login form fades in when the
   camera reaches cruise height (signalled by CITY.onLoginReveal).
════════════════════════════════════════════════════════════════ */

function _handleFirstVisit() {
    const cityCanvas = document.getElementById('cityCanvas');
    const loginEl    = document.getElementById('loginPhase');

    // Login starts hidden
    loginEl.style.opacity      = '0';
    loginEl.style.pointerEvents = 'none';

    // CITY fires this callback when the camera is nearly level
    CITY.onLoginReveal = () => {
        // Step canvas behind login UI
        CITY.toBackground();

        // Fade login in
        loginEl.style.transition    = 'opacity 1.4s ease';
        loginEl.style.opacity       = '1';
        loginEl.style.pointerEvents = 'all';
        document.getElementById('password')?.focus();
    };

    // City starts at z-index 500 (above everything) — set inside CITY.start()
    cityCanvas.style.display = 'block';
    CITY.start();
}


/* ════════════════════════════════════════════════════════════════
   RETURNING VISIT
   Skips intro. City runs quietly in the background.
   Jump straight to the ARG flow.
════════════════════════════════════════════════════════════════ */

function _handleReturningVisit(registered) {
    document.body.classList.add('accents-ready');

    const cityCanvas = document.getElementById('cityCanvas');
    cityCanvas.style.zIndex  = '18';
    cityCanvas.style.display = 'block';

    // Skip the intro sequence — city starts mid-cruise
    CITY.onLoginReveal = null;
    CITY.start();

    // Login phase stays hidden
    const loginEl = document.getElementById('loginPhase');
    loginEl.style.opacity       = '0';
    loginEl.style.pointerEvents = 'none';

    // Restore globe / header to post-scan positions
    if (window.startGlobeMove) {
        window.startGlobeMove(CONFIG.globe.centerX, CONFIG.globe.centerY);
    }
    const header = document.querySelector('.scan-header');
    if (header) {
        header.style.left = '50%';
        header.style.top  = CONFIG.globe.postScanY + '%';
    }

    // Route to the right ARG prompt
    if (registered) {
        setTimeout(() => Arg.showArgCardPrompt(), 400);
    } else {
        setTimeout(() => Arg.showArgRegistration(), 400);
    }
}
