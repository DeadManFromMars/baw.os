/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   session.js  —  SESSION ORCHESTRATION

   Entry point. Runs on DOMContentLoaded.
   Calls /auth/me to determine the player's actual server-side
   session state — never trusts localStorage for auth decisions.

   THREE STATES:
     1. Not authenticated  — /auth/me returns 401
        → Show the full city intro + login form (first visit)
        OR skip city but still show login (returning visit hint)

     2. Authenticated, no card upload yet
        → Skip intro, go straight to ARG choice (register / upload card)

     3. Authenticated, session active
        → Skip intro, go straight to the globe / main experience

   localStorage is only used for UI hints (skip the city animation
   on returning visits). It is never used to grant access to anything.

   DEPENDENCIES: must load last — config, utils, city, login, arg
   must all be ready.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

document.addEventListener('DOMContentLoaded', async () => {

    // Check actual server-side session state
    let sessionUser = null;
    try {
        const res = await fetch(`${CONFIG.apiBase}/auth/me`, {
            credentials: 'include',
        });
        if (res.ok) {
            sessionUser = await res.json();
        }
    } catch (_) {
        // Network error — treat as unauthenticated
    }

    if (sessionUser) {
        // Valid session — notify modules that a player is authenticated
        document.dispatchEvent(new CustomEvent('player:authenticated'));
        _handleAuthenticatedSession(sessionUser);
    } else {
        // No valid session — must go through login
        const hasSeenIntro = localStorage.getItem('baw_seen_intro');
        if (hasSeenIntro) {
            _handleReturningUnauthenticated();
        } else {
            _handleFirstVisit();
        }
    }

});


/* ════════════════════════════════════════════════════════════════
   INIT OVERLAY
   Satisfies browser autoplay policy. Always shown.
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


/* ════════════════════════════════════════════════════════════════
   FIRST VISIT — no session, never seen the intro
   Full city sequence plays, then login form fades in.
════════════════════════════════════════════════════════════════ */

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

    _showInitOverlay(() => {
        localStorage.setItem('baw_seen_intro', 'true');
        CITY.start();
    });
}


/* ════════════════════════════════════════════════════════════════
   RETURNING UNAUTHENTICATED — no session, has seen the intro
   Skip city animation, show login directly.
════════════════════════════════════════════════════════════════ */

function _handleReturningUnauthenticated() {
    const cityCanvas = document.getElementById('cityCanvas');
    const loginEl    = document.getElementById('loginPhase');

    // Hide city — not needed
    if (cityCanvas) cityCanvas.style.display = 'none';

    _showInitOverlay(() => {
        loginEl.style.transition    = 'opacity 1.2s ease';
        loginEl.style.opacity       = '1';
        loginEl.style.pointerEvents = 'all';
        document.getElementById('password')?.focus();
    });
}


/* ════════════════════════════════════════════════════════════════
   AUTHENTICATED SESSION — valid /auth/me response
   Skip everything, go straight to the main experience.
════════════════════════════════════════════════════════════════ */

function _handleAuthenticatedSession(user) {
    document.body.classList.add('accents-ready');

    // Hide city and login — not needed
    const cityCanvas = document.getElementById('cityCanvas');
    if (cityCanvas) cityCanvas.style.display = 'none';

    const loginEl = document.getElementById('loginPhase');
    if (loginEl) {
        loginEl.style.opacity       = '0';
        loginEl.style.pointerEvents = 'none';
    }

    // Show scan phase header (wordmark) only
    const scanPhase = document.getElementById('scanPhase');
    if (scanPhase) {
        scanPhase.style.display = 'flex';
        scanPhase.style.opacity = '1';
    }
    const scanLeft  = document.querySelector('.scan-left');
    const scanRight = document.querySelector('.scan-right');
    if (scanLeft)  scanLeft.style.display  = 'none';
    if (scanRight) scanRight.style.display = 'none';

    // Move globe and header to post-scan position
    if (window.startGlobeMove) {
        window.startGlobeMove(CONFIG.globe.centerX, CONFIG.globe.centerY);
    }
    const header = document.querySelector('.scan-header');
    if (header) {
        header.style.left = '50%';
        header.style.top  = CONFIG.globe.postScanY + '%';
    }

    _showInitOverlay(() => {
        setTimeout(() => Arg.showArgChoice(), 400);
    });
}
