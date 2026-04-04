/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   arg.js  —  ARG BACKEND + REGISTRATION FLOW

   Handles everything after the scan phase dissolves:
     - Showing the registration prompt (new visitors)
     - Showing the card upload prompt (returning visitors)
     - Calling the Flask backend to register / verify card
     - Downloading the generated player card after registration
     - Fading prompts out and triggering globe pin lines

   BACKEND ROUTES (all at CONFIG.backend.baseUrl):
     POST /auth/register   { username }  → { username, ... }
     POST /card/upload     FormData(card) → { username, ... }
     GET  /card/download   → binary image blob

   DEPENDENCIES:
     config.js, utils.js, globe.js (window.startPinLines)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Arg = (() => {

    /* ════════════════════════════════════════════════════════
       API HELPER
       Wraps fetch with credentials, JSON body, and error handling.
       Returns { ok, status, data } — callers don't need to think
       about fetch API details, they just check `ok`.
    ════════════════════════════════════════════════════════ */

    async function apiFetch(path, method = 'GET', body = null) {
        const options = {
            method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) options.body = JSON.stringify(body);

        try {
            const res  = await fetch(CONFIG.backend.baseUrl + path, options);
            const data = await res.json();
            return { ok: res.ok, status: res.status, data };
        } catch (err) {
            // Network failure or JSON parse error
            return { ok: false, status: 0, data: { error: '—' } };
        }
    }


    /* ════════════════════════════════════════════════════════
       MESSAGE HELPER
       Sets the text and type class of a message element by ID.
    ════════════════════════════════════════════════════════ */

    function setMessage(elementId, text, type) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.textContent = text;
        el.className   = 'arg-minimal-msg ' + (type || '');
    }


    /* ════════════════════════════════════════════════════════
       SHOW REGISTRATION PROMPT
       Hides the card prompt (if visible) and shows the reg form.
       Called from scan.js after the dissolve and from session.js
       for returning-but-unregistered visitors.
    ════════════════════════════════════════════════════════ */

    function showArgRegistration() {
        const cardPrompt = document.getElementById('argCardPrompt');
        if (cardPrompt) cardPrompt.classList.remove('visible');

        const regPrompt = document.getElementById('argRegPrompt');
        if (!regPrompt) return;
        regPrompt.classList.add('visible');

        // Focus the input after the opacity transition finishes.
        // Guard against double-binding if called more than once.
        setTimeout(() => {
            const inputEl = document.getElementById('argUsername');
            if (!inputEl || inputEl.dataset.listenerBound) return;
            inputEl.dataset.listenerBound = 'true';
            inputEl.focus();
            inputEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); register(); }
            });
        }, 600);
    }

    /* Expose on window so scan.js can call it after the dissolve
       without creating a circular dependency between modules. */
    window.showArgRegistration = showArgRegistration;


    /* ════════════════════════════════════════════════════════
       SHOW CARD PROMPT
       For returning registered visitors — skip registration and
       go straight to card upload.
    ════════════════════════════════════════════════════════ */

    function showArgCardPrompt() {
        const regPrompt = document.getElementById('argRegPrompt');
        if (regPrompt) regPrompt.classList.remove('visible');

        const cardPrompt = document.getElementById('argCardPrompt');
        if (cardPrompt) cardPrompt.classList.add('visible');
    }


    /* ════════════════════════════════════════════════════════
       SWITCH TO REGISTER
       Called by the ghost "—" button on the card prompt.
       Clears stored registration data and shows the reg form.
    ════════════════════════════════════════════════════════ */

    function switchToRegister() {
        localStorage.removeItem('baw_registered');
        localStorage.removeItem('baw_username');

        const cardPrompt = document.getElementById('argCardPrompt');
        if (cardPrompt) {
            cardPrompt.classList.remove('visible');
            cardPrompt.classList.add('fading');
            setTimeout(() => cardPrompt.classList.remove('fading'), 1000);
        }
        setTimeout(showArgRegistration, 300);
    }


    /* ════════════════════════════════════════════════════════
       FADE OUT PROMPT + START PIN LINES
       Called after a successful registration or card upload.
       Fades the active prompt out, then tells the globe to draw
       its pin lines (which eventually trigger the radio widget).
    ════════════════════════════════════════════════════════ */

    function fadeOutAndProceed(promptId) {
        const prompt = document.getElementById(promptId);
        if (prompt) {
            prompt.classList.remove('visible');
            prompt.classList.add('fading');
        }
        setTimeout(() => {
            if (window.startPinLines) window.startPinLines();
            if (prompt) prompt.style.display = 'none';
        }, 1200);
    }


    /* ════════════════════════════════════════════════════════
       REGISTER
       Reads the username input, POSTs to /auth/register,
       downloads the generated card, then proceeds.
    ════════════════════════════════════════════════════════ */

    async function register() {
        const inputEl  = document.getElementById('argUsername');
        const btnEl    = document.getElementById('argRegBtn');
        const btnText  = document.getElementById('argRegBtnText');
        const subEl    = document.getElementById('argRegSub');
        const username = inputEl ? inputEl.value.trim() : '';

        if (!username) {
            setMessage('argRegMsg', '—', 'error');
            return;
        }

        // Disable UI while request is in flight
        if (btnEl)   btnEl.disabled      = true;
        if (btnText) btnText.textContent = '...';
        if (subEl)   subEl.style.opacity = '0';

        const { ok, data } = await apiFetch('/auth/register', 'POST', { username });

        if (!ok) {
            setMessage('argRegMsg', data.error || '—', 'error');
            if (btnEl)   btnEl.disabled      = false;
            if (btnText) btnText.textContent = '→';
            if (subEl)   subEl.style.opacity = '0.4';
            return;
        }

        localStorage.setItem('baw_registered', 'true');
        localStorage.setItem('baw_username',   username);
        setMessage('argRegMsg', '—', 'success');

        // Download the card image, then proceed
        await Utils.sleep(400);
        await downloadCard();
        await Utils.sleep(1200);
        fadeOutAndProceed('argRegPrompt');
    }


    /* ════════════════════════════════════════════════════════
       UPLOAD CARD
       Accepts a file input change event, POSTs the image as
       FormData, reads the username from the response, proceeds.
    ════════════════════════════════════════════════════════ */

    async function uploadCard(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;

        setMessage('argCardMsg', '—', 'info');

        const formData = new FormData();
        formData.append('card', file);

        try {
            const res  = await fetch(CONFIG.backend.baseUrl + '/card/upload', {
                method: 'POST', credentials: 'include', body: formData,
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem('baw_username', data.username);
                setMessage('argCardMsg', '', 'success');
                await Utils.sleep(1000);
                fadeOutAndProceed('argCardPrompt');
            } else {
                setMessage('argCardMsg', '—', 'error');
            }
        } catch {
            setMessage('argCardMsg', '—', 'error');
        }

        // Reset the file input so the same file can be re-selected if needed
        fileInput.value = '';
    }


    /* ════════════════════════════════════════════════════════
       DOWNLOAD CARD
       GETs the generated card image as a blob, creates a
       temporary <a> element and triggers a browser download.
       The cache-busting `t=` param prevents stale cached images.
    ════════════════════════════════════════════════════════ */

    async function downloadCard() {
        try {
            const res = await fetch(
                `${CONFIG.backend.baseUrl}/card/download?t=${Date.now()}`,
                { method: 'GET', credentials: 'include' }
            );
            if (!res.ok) return;

            const blob  = await res.blob();
            const url   = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href     = url;
            anchor.download = 'bawsome_card';
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);  // free the object URL immediately after use
        } catch (err) {
            console.error('[ARG] Card download failed:', err);
        }
    }


    /* ════════════════════════════════════════════════════════
       PUBLIC API
       Functions exposed for HTML onclick="" handlers and session.js.
    ════════════════════════════════════════════════════════ */

    return {
        showArgRegistration,
        showArgCardPrompt,
        switchToRegister,
        register,
        uploadCard,
        downloadCard,
    };

})();

/* ── Global shims for HTML onclick="" attributes ────────────────
   HTML uses inline handlers which need global function names.
   These forward to the Arg module. If you refactor to addEventListener,
   delete these shims. */
function argRegister()             { Arg.register(); }
function argUploadCard(input)      { Arg.uploadCard(input); }
function argSwitchToRegister()     { Arg.switchToRegister(); }
function showArgRegistration()     { Arg.showArgRegistration(); }
function showArgCardPrompt()       { Arg.showArgCardPrompt(); }
