/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   arg.js  —  ARG BACKEND + REGISTRATION FLOW

   Handles everything after the scan phase dissolves:
     - Showing the choice prompt (register or offer token)
     - Showing the registration prompt (new visitors)
     - Showing the card upload prompt (returning visitors)
     - Calling the Flask backend to register / verify card
     - Downloading the generated player card after registration
     - Showing welcome + logout persistently after success

   BACKEND ROUTES (all at CONFIG.apiBase):
     POST /auth/register   { username }  → { username, ... }
     POST /card/upload     FormData(card) → { username, ... }
     GET  /card/download   → binary image blob

   STATE MACHINE:
     globe pin lines done
       → showArgChoice()          [register / offer token, right side]
     user picks register
       → showArgRegistration()    [reg form, centered]
     register / upload success
       → fadeOutAndProceed()      [pin lines, then showWelcomeAndLogout()]
     showWelcomeAndLogout()
       → welcome (top-centre) + logout (bottom-left) visible, all prompts locked away
       → window.argWelcomeShown = true  ← gates showArgChoice() from re-firing
     logout
       → welcome + logout hidden, window.argWelcomeShown = false
       → showArgChoice() after 800ms

   DEPENDENCIES:
     config.js, utils.js, globe.js (window.startPinLines)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Arg = (() => {

    /* ════════════════════════════════════════════════════════
       API HELPER
    ════════════════════════════════════════════════════════ */

    async function apiFetch(path, method = 'GET', body = null) {
        const options = {
            method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) options.body = JSON.stringify(body);

        try {
            const res  = await fetch(CONFIG.apiBase + path, options);
            const data = await res.json();
            return { ok: res.ok, status: res.status, data };
        } catch (err) {
            return { ok: false, status: 0, data: { error: '—' } };
        }
    }


    /* ════════════════════════════════════════════════════════
       MESSAGE HELPER
    ════════════════════════════════════════════════════════ */

    function setMessage(elementId, text, type) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.textContent = text;
        el.className   = 'arg-minimal-msg ' + (type || '');
    }


    /* ════════════════════════════════════════════════════════
       SHOW CHOICE PROMPT
       Called by globe.js once all pin lines finish drawing.
       Gated by window.argWelcomeShown so it never re-fires
       after a successful registration / card upload.
    ════════════════════════════════════════════════════════ */

    function showArgChoice() {
        // Guard: once the player is welcomed, the choice prompt is retired.
        if (window.argWelcomeShown) return;
        SFX.negative();

        // Fade out whichever prompt is currently visible, then show choice.
        for (const id of ['argRegPrompt', 'argCardPrompt']) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (el.classList.contains('visible')) {
                el.classList.remove('visible');
                el.classList.add('fading');
                setTimeout(() => el.classList.remove('fading'), 800);
            }
        }

        const choicePrompt = document.getElementById('argChoicePrompt');
        if (choicePrompt) {
            choicePrompt.style.display = '';
            // Short delay so the outgoing prompt fades before the choice fades in
            setTimeout(() => {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    choicePrompt.classList.add('visible');
                }));
            }, 200);
        }
    }

    // Expose on window immediately so globe.js / dev.js / scan.js can call it.
    window.showArgChoice = showArgChoice;


    /* ════════════════════════════════════════════════════════
       SHOW REGISTRATION PROMPT  (centered)
    ════════════════════════════════════════════════════════ */

    function showArgRegistration() {
        for (const id of ['argCardPrompt', 'argChoicePrompt']) {
            const el = document.getElementById(id);
            if (el) el.classList.remove('visible');
        }

        const regPrompt = document.getElementById('argRegPrompt');
        if (!regPrompt) return;
        regPrompt.classList.add('visible');

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

    window.showArgRegistration = showArgRegistration;


    /* ════════════════════════════════════════════════════════
       SHOW CARD PROMPT  (right side, same position as choice prompt)
       Positioning is handled by CSS class .arg-right-prompt on
       #argCardPrompt — see arg.css.
    ════════════════════════════════════════════════════════ */

    function showArgCardPrompt() {
        for (const id of ['argRegPrompt', 'argChoicePrompt']) {
            const el = document.getElementById(id);
            if (el) el.classList.remove('visible');
        }

        const cardPrompt = document.getElementById('argCardPrompt');
        if (cardPrompt) cardPrompt.classList.add('visible');
    }


    /* ════════════════════════════════════════════════════════
       CHOICE BUTTONS
    ════════════════════════════════════════════════════════ */

    function chooseRegister() {
        SFX.positive();
        const choicePrompt = document.getElementById('argChoicePrompt');
        if (choicePrompt) {
            choicePrompt.classList.remove('visible');
            choicePrompt.classList.add('fading');
            setTimeout(() => choicePrompt.classList.remove('fading'), 800);
        }
        setTimeout(showArgRegistration, 300);
    }

    function chooseCard() {
        SFX.positive();
        const choicePrompt = document.getElementById('argChoicePrompt');
        if (choicePrompt) {
            choicePrompt.classList.remove('visible');
            choicePrompt.classList.add('fading');
            setTimeout(() => choicePrompt.classList.remove('fading'), 800);
        }
        setTimeout(showArgCardPrompt, 300);
    }


    /* ════════════════════════════════════════════════════════
       WELCOME + LOGOUT
       Shown once, after a successful register or card upload.
       Never hidden until the player explicitly logs out.

       Welcome reads: "WELCOME  USERNAME!"
       The HTML structure is:
         <div id="argWelcome">WELCOME  <span id="argWelcomeName"></span>!</div>
       — the "!" and "WELCOME" text are in the HTML, only the name
         span is populated here.

       Both elements are controlled exclusively via .visible class.
       window.argWelcomeShown is set true here and false on logout,
       gating showArgChoice() from re-appearing.
    ════════════════════════════════════════════════════════ */

    function showWelcomeAndLogout() {
        const username = localStorage.getItem('baw_username') || '—';

        // Set the gate — choice prompt will not re-appear
        window.argWelcomeShown = true;

        // Lock all prompts away permanently (until logout)
        for (const id of ['argChoicePrompt', 'argRegPrompt', 'argCardPrompt']) {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('visible', 'fading');
                el.style.display = 'none';
            }
        }

        // Populate name and fade welcome in
        const nameEl  = document.getElementById('argWelcomeName');
        const welcome = document.getElementById('argWelcome');
        if (nameEl)  nameEl.textContent = username;
        if (welcome) {
            welcome.style.removeProperty('display');
            requestAnimationFrame(() => requestAnimationFrame(() => {
                welcome.classList.add('visible');
            }));
        }

        // Fade logout button in (bottom-left)
        const logout = document.getElementById('argLogout');
        if (logout) {
            logout.style.removeProperty('display');
            requestAnimationFrame(() => requestAnimationFrame(() => {
                logout.classList.add('visible');
            }));
        }

        // Fade inventory button in (left side)
        const invBtn = document.getElementById('inventoryBtn');
        if (invBtn) {
            invBtn.style.removeProperty('display');
            requestAnimationFrame(() => requestAnimationFrame(() => {
                invBtn.classList.add('visible');
            }));
        }

        // Fade card editor button in (right side)
        const editBtn = document.getElementById('cardEditorBtn');
        if (editBtn) {
            editBtn.style.removeProperty('display');
            requestAnimationFrame(() => requestAnimationFrame(() => {
                editBtn.classList.add('visible');
            }));
        }

        // Fade dev sticker button in (above globe)
        const devStickerBtn = document.getElementById('devStickerBtn');
        if (devStickerBtn) {
            devStickerBtn.style.removeProperty('display');
            requestAnimationFrame(() => requestAnimationFrame(() => {
                devStickerBtn.classList.add('visible');
            }));
        }

        // Fade signal viewer button in (bottom centre)
        const signalBtn = document.getElementById('signalBtn');
        if (signalBtn) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                signalBtn.classList.add('visible');
            }));
        }
    }

    function handleLogout() {
        SFX.negative();
        setTimeout(() => {
            localStorage.removeItem('baw_registered');
            localStorage.removeItem('baw_username');
            localStorage.removeItem('baw_gate_passed');
            window.location.reload();
        }, 400);
    }


    /* ════════════════════════════════════════════════════════
       SWITCH TO REGISTER
       Ghost button on the card prompt.
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
       Called after successful registration or card upload.
       Pin lines start immediately; welcome appears as they draw.
    ════════════════════════════════════════════════════════ */

    function fadeOutAndProceed(promptId) {
        SFX.positive();
        const prompt = document.getElementById(promptId);
        if (prompt) {
            prompt.classList.remove('visible');
            prompt.classList.add('fading');
        }
        setTimeout(() => {
            if (prompt) {
                prompt.classList.remove('fading');
                prompt.style.display = 'none';
            }
            if (window.startPinLines) window.startPinLines();
            showWelcomeAndLogout();
        }, 1200);
    }


    /* ════════════════════════════════════════════════════════
       REGISTER
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

        await Utils.sleep(400);
        await downloadCard();
        await Utils.sleep(1200);
        fadeOutAndProceed('argRegPrompt');
    }


    /* ════════════════════════════════════════════════════════
       UPLOAD CARD
    ════════════════════════════════════════════════════════ */

    async function uploadCard(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;

        setMessage('argCardMsg', '—', 'info');

        const formData = new FormData();
        formData.append('card', file);

        try {
            const res  = await fetch(CONFIG.apiBase + '/card/upload', {
                method: 'POST', credentials: 'include', body: formData,
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem('baw_registered', 'true');
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

        fileInput.value = '';
    }


    /* ════════════════════════════════════════════════════════
       DOWNLOAD CARD
    ════════════════════════════════════════════════════════ */

    async function downloadCard() {
        try {
            const res = await fetch(
                `${CONFIG.apiBase}/card/download?t=${Date.now()}`,
                { method: 'GET', credentials: 'include' }
            );
            if (!res.ok) return;

            const blob   = await res.blob();
            const url    = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href     = url;
            const uname = localStorage.getItem('baw_username') || 'card';
            anchor.download = `bawsome_${uname}_card`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('[ARG] Card download failed:', err);
        }
    }


    /* ════════════════════════════════════════════════════════
       DEV: AWARD ALL STICKERS
       Awards all three stickers to the current user.
       Remove before launch.
    ════════════════════════════════════════════════════════ */

    async function devAwardStickers() {
        const btn = document.getElementById('devStickerBtn');
        if (btn) { btn.disabled = true; btn.textContent = '…'; }

        try {
            const res  = await fetch(`${CONFIG.apiBase}/dev/award-stickers`, {
                method:      'POST',
                credentials: 'include',
            });
            const data = await res.json();
            if (res.ok) {
                if (btn) btn.textContent = '✓ STICKERS AWARDED';
            } else {
                if (btn) btn.textContent = data.error || 'FAILED';
            }
        } catch (e) {
            if (btn) btn.textContent = 'ERROR';
        }

        setTimeout(() => {
            if (btn) { btn.disabled = false; btn.textContent = '⬡ GET STICKERS'; }
        }, 2000);
    }


    /* ════════════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════════════ */

    return {
        showArgChoice,
        chooseRegister,
        chooseCard,
        showArgRegistration,
        showArgCardPrompt,
        switchToRegister,
        handleLogout,
        register,
        uploadCard,
        downloadCard,
        devAwardStickers,  // DEV ONLY — remove before launch (also remove #devStickerBtn from HTML)
    };

})();

/* ── Global shims for HTML onclick="" attributes ── */
function argRegister()        { Arg.register(); }
function argUploadCard(input) { Arg.uploadCard(input); }
// Note: showArgCardPrompt() below shadows Arg.showArgCardPrompt — both point to the same logic.
function showArgCardPrompt()  { Arg.showArgCardPrompt(); }
