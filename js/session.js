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
    loginEl.style.opacity       = '0';
    loginEl.style.pointerEvents = 'none';

    // CITY fires this callback when the camera is nearly level
    CITY.onLoginReveal = () => {
        CITY.toBackground();
        loginEl.style.transition    = 'opacity 1.4s ease';
        loginEl.style.opacity       = '1';
        loginEl.style.pointerEvents = 'all';
        document.getElementById('password')?.focus();
    };

    cityCanvas.style.display = 'block';

    /* ── Click-to-initialise overlay ───────────────────────────────
       Sits above everything on a black screen. One click:
         1. Satisfies the browser autoplay requirement for SceneAudio
         2. Fades the overlay out
         3. Starts the CITY sequence
       Built in JS — no HTML changes needed.
    ────────────────────────────────────────────────────────────── */
    const overlay = document.createElement('div');
    overlay.id = 'initOverlay';
    overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:1000',
        'background:#000',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'cursor:pointer',
        'transition:opacity 0.6s ease',
    ].join(';');

    overlay.innerHTML = `
        <div style="text-align:center;pointer-events:none;user-select:none;">
            <div style="
                font-family:'Courier New',Courier,monospace;
                font-size:clamp(10px,1.1vw,14px);
                letter-spacing:0.35em;
                color:#fff;
                opacity:0.9;
                margin-bottom:0.9em;
                text-transform:uppercase;
            ">INITIALISE SEQUENCE</div>
            <div style="
                font-family:'Courier New',Courier,monospace;
                font-size:clamp(9px,0.85vw,11px);
                letter-spacing:0.25em;
                color:#fff;
                opacity:0.35;
                text-transform:uppercase;
            ">CLICK ANYWHERE TO BEGIN</div>
        </div>`;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => {
        overlay.style.opacity = '0';
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        CITY.start();  // audio unblocked — sequence begins
    }, { once: true });
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
