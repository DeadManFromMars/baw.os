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

/* ════════════════════════════════════════════════════════════════
   INIT OVERLAY
   Shown on every visit — black screen with minimal prompt.
   One click satisfies the browser autoplay requirement and
   kicks off whatever callback is passed in.
════════════════════════════════════════════════════════════════ */

function _showInitOverlay(onStart) {
    const overlay = document.createElement('div');
    overlay.id = 'initOverlay';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:1000', 'background:#000',
        'display:flex', 'align-items:center', 'justify-content:center',
        'cursor:pointer', 'transition:opacity 0.6s ease',
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
        onStart();
    }, { once: true });
}

function _handleFirstVisit() {
    const cityCanvas = document.getElementById('cityCanvas');
    const loginEl    = document.getElementById('loginPhase');

    loginEl.style.opacity       = '0';
    loginEl.style.pointerEvents = 'none';

    CITY.onLoginReveal = () => {
        CITY.toBackground();
        loginEl.style.transition    = 'opacity 1.4s ease';
        loginEl.style.opacity       = '1';
        loginEl.style.pointerEvents = 'all';
        document.getElementById('password')?.focus();
    };

    cityCanvas.style.display = 'block';

    _showInitOverlay(() => CITY.start());
}


/* ════════════════════════════════════════════════════════════════
   RETURNING VISIT
   Skips intro. City runs quietly in the background.
   Jump straight to the ARG flow.
════════════════════════════════════════════════════════════════ */

function _handleReturningVisit(registered) {
    _showInitOverlay(() => {
        document.body.classList.add('accents-ready');

        const cityCanvas = document.getElementById('cityCanvas');
        cityCanvas.style.zIndex  = '18';
        cityCanvas.style.display = 'block';

        CITY.onLoginReveal = null;
        CITY.start();

        const loginEl = document.getElementById('loginPhase');
        loginEl.style.opacity       = '0';
        loginEl.style.pointerEvents = 'none';

        if (window.startGlobeMove) {
            window.startGlobeMove(CONFIG.globe.centerX, CONFIG.globe.centerY);
        }
        const header = document.querySelector('.scan-header');
        if (header) {
            header.style.left = '50%';
            header.style.top  = CONFIG.globe.postScanY + '%';
        }

        if (registered) {
            setTimeout(() => Arg.showArgCardPrompt(), 400);
        } else {
            setTimeout(() => Arg.showArgRegistration(), 400);
        }
    });
}
