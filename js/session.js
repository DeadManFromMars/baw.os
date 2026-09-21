/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   session.js — decides where a visitor starts. Load LAST.

   Asks the backend who's logged in (/auth/me), then:
     logged in                      → welcome view
     passed the passphrase before   → card prompt ("offer token")
     seen the intro before          → passphrase screen
     first visit                    → city intro → passphrase screen

   localStorage only skips animations — access is always decided by
   the backend. Every path starts with a "click to begin" screen,
   because browsers block audio until the page is clicked.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(() => {

    const $ = id => document.getElementById(id);

    function remembered(key) {
        try { return localStorage.getItem(key) === 'true'; } catch { return false; }
    }
    function remember(key) {
        try { localStorage.setItem(key, 'true'); } catch {}
    }

    document.addEventListener('DOMContentLoaded', async () => {
        let user = null;
        try {
            const res = await fetch(`${CONFIG.apiBase}/auth/me`, { credentials: 'include' });
            if (res.ok) user = await res.json();
        } catch { /* backend unreachable — treat as logged out */ }

        if (user)                                startLoggedIn(user);
        else if (remembered('baw_gate_passed'))  startAtCardPrompt();
        else if (remembered('baw_seen_intro'))   startAtPassphrase();
        else                                     startFirstVisit();
    });


    /* "INITIALISE SEQUENCE — click anywhere" (styled in base.css) */
    function clickToBegin(onStart) {
        const overlay = document.createElement('div');
        overlay.id = 'initOverlay';
        overlay.innerHTML = '<div class="init-title">Initialise sequence</div><div class="init-sub">Click anywhere to begin</div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => {
            overlay.classList.add('gone');
            setTimeout(() => overlay.remove(), 600);
            onStart();
        }, { once: true });
    }

    function showLogin(fadeSeconds) {
        const login = $('loginPhase');
        login.style.transition    = `opacity ${fadeSeconds}s ease`;
        login.style.opacity       = '1';
        login.style.pointerEvents = 'all';
        $('password').focus();
    }

    function startFirstVisit() {
        DataStore.lookupNetwork();
        const login = $('loginPhase');
        login.style.opacity       = '0';
        login.style.pointerEvents = 'none';
        CITY.onLoginReveal = () => { CITY.toBackground(); showLogin(1.4); };
        $('cityCanvas').style.display = 'block';
        clickToBegin(() => {
            remember('baw_seen_intro');
            CITY.start();
        });
    }

    function startAtPassphrase() {
        DataStore.lookupNetwork();
        $('cityCanvas').style.display = 'none';
        clickToBegin(() => showLogin(1.2));
    }

    function startAtCardPrompt() {
        showGlobeScreen();
        clickToBegin(() => setTimeout(Arg.showCardPrompt, 400));
    }

    function startLoggedIn(user) {
        showGlobeScreen();
        document.dispatchEvent(new CustomEvent('player:authenticated'));
        clickToBegin(() => {
            window.startPinLines();          // when they finish, the radio starts (music.js)
            Arg.showWelcome(user.username);
        });
    }

    /* Skip straight to the post-scan layout: globe centred, wordmark at the top */
    function showGlobeScreen() {
        document.body.classList.add('accents-ready');
        $('cityCanvas').style.display = 'none';
        Object.assign($('loginPhase').style, { opacity: '0', pointerEvents: 'none' });
        Object.assign($('scanPhase').style, { display: 'block', opacity: '1' });
        document.querySelector('.scan-left').style.display  = 'none';
        document.querySelector('.scan-right').style.display = 'none';

        window.globeShowNow();
        window.globeSetDraggable(true);
        window.startGlobeMove(CONFIG.globe.centerX, CONFIG.globe.centerY);
        const header = document.querySelector('.scan-header');
        header.style.left = '50%';
        header.style.top  = CONFIG.globe.postScanY + '%';
    }
})();
