/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   arg.js — the globe screen: register / log in with your card,
   then the welcome view and its buttons.

   FLOW
     choice prompt   "register" or "offer token"  (after the scan,
                      or after "← back")
     register        pick a username → card downloads → welcome
     offer token     upload your card PNG → welcome
     welcome         name + logout, inventory, edit card, signal viewer

   Buttons in index.html use data-action="…" (handled below) and
   data-sfx="hover" (sounds.js).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Arg = (() => {

    const $ = id => document.getElementById(id);
    const PROMPTS = ['argChoicePrompt', 'argRegPrompt', 'argCardPrompt'];

    let playerName = '';
    let welcomed   = false;   // once true, the choice prompt never comes back (until logout reloads)
    let busy       = false;   // a register/upload request is in flight


    /* ── Helpers ── */

    async function api(path, options = {}) {
        try {
            const res = await fetch(CONFIG.apiBase + path, { credentials: 'include', ...options });
            return { ok: res.ok, data: await res.json().catch(() => ({})) };
        } catch {
            return { ok: false, data: { error: 'Connection error.' } };
        }
    }

    function setMessage(id, text, type = '') {
        $(id).textContent = text;
        $(id).className   = `arg-minimal-msg ${type}`;
    }

    // Fade a prompt out (the .fading class runs the CSS fade)
    function hidePrompt(id) {
        const el = $(id);
        if (!el.classList.contains('visible')) return;
        el.classList.replace('visible', 'fading');
        setTimeout(() => el.classList.remove('fading'), 800);
    }

    // Fade one prompt in, hiding the others
    function showPrompt(id, delay = 0) {
        PROMPTS.filter(p => p !== id).forEach(hidePrompt);
        setTimeout(() => Utils.nextFrames().then(() => $(id).classList.add('visible')), delay);
    }


    /* ── Prompts ── */

    function showArgChoice() {
        if (welcomed) return;
        SFX.negative();
        showPrompt('argChoicePrompt', 200);
    }

    function showRegistration() {
        showPrompt('argRegPrompt');
        setTimeout(() => $('argUsername').focus(), 600);
    }

    function showCardPrompt() {
        showPrompt('argCardPrompt');
    }


    /* ── Register ── */

    async function register() {
        if (busy) return;
        const username = $('argUsername').value.trim();
        if (!username) return setMessage('argRegMsg', '—', 'error');

        busy = true;
        $('argRegBtn').disabled        = true;
        $('argRegBtnText').textContent = '...';
        $('argRegSub').style.opacity   = '0';

        const { ok, data } = await api('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        });

        if (!ok) {
            setMessage('argRegMsg', data.error || '—', 'error');
            $('argRegBtn').disabled        = false;
            $('argRegBtnText').textContent = '→';
            $('argRegSub').style.opacity   = '0.4';
            busy = false;
            return;
        }

        setMessage('argRegMsg', '—', 'success');
        loggedIn(data.username);
        await Utils.sleep(400);
        await downloadCard();                 // the card IS their login — they need it now
        await Utils.sleep(1200);
        proceedToWelcome('argRegPrompt');
    }


    /* ── Offer token (card login) ── */

    async function uploadCard(input) {
        const file = input.files[0];
        input.value = '';                     // allow re-picking the same file
        if (!file || busy) return;

        busy = true;
        setMessage('argCardMsg', '—', 'info');
        const form = new FormData();
        form.append('card', file);
        const { ok, data } = await api('/card/upload', { method: 'POST', body: form });

        if (!ok) {
            setMessage('argCardMsg', data.error || '—', 'error');
            busy = false;
            return;
        }
        setMessage('argCardMsg', '', 'success');
        loggedIn(data.username);
        await Utils.sleep(1000);
        proceedToWelcome('argCardPrompt');
    }


    /* ── Logged in ── */

    // Session exists now: music + other modules can start
    function loggedIn(username) {
        playerName = username;
        document.dispatchEvent(new CustomEvent('player:authenticated'));
    }

    // Fade the prompt, draw the globe's pin lines, show the welcome view
    function proceedToWelcome(promptId) {
        SFX.positive();
        hidePrompt(promptId);
        setTimeout(() => {
            window.startPinLines();
            showWelcome(playerName);
        }, 1200);
    }

    function showWelcome(username) {
        playerName = username;
        welcomed   = true;
        PROMPTS.forEach(id => { $(id).classList.remove('visible', 'fading'); });
        $('argWelcomeName').textContent = username;
        document.querySelector('.scan-tagline').classList.add('gone');   // the welcome line takes its place

        const shown = ['argWelcome', 'argLogout', 'inventoryBtn', 'cardEditorBtn', 'signalBtn'];
        // The dev sticker button only works against a local DEBUG backend, so only show it locally
        if (['localhost', '127.0.0.1'].includes(location.hostname)) shown.push('devStickerBtn');
        Utils.nextFrames().then(() => shown.forEach(id => $(id)?.classList.add('visible')));
    }

    async function logout() {
        SFX.negative();
        await api('/auth/logout', { method: 'POST' });
        // A reload starts fresh; having passed the passphrase, they land on the card prompt
        setTimeout(() => location.reload(), 400);
    }


    /* ── Card download (also used by the card editor) ── */

    async function downloadCard() {
        try {
            const res = await fetch(`${CONFIG.apiBase}/card/download?t=${Date.now()}`, { credentials: 'include' });
            if (!res.ok) return;
            const url  = URL.createObjectURL(await res.blob());
            const link = Object.assign(document.createElement('a'), {
                href: url,
                download: `bawsome_${playerName || 'card'}_card.png`,
            });
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('[Arg] Card download failed:', err);
        }
    }


    /* ── DEV: give yourself every sticker (backend only allows it in DEBUG) ── */

    async function devAwardStickers(btn) {
        btn.disabled = true;
        const { ok, data } = await api('/dev/award-stickers', { method: 'POST' });
        btn.textContent = ok ? `✓ ${data.awarded.length} STICKERS AWARDED` : (data.error || 'FAILED');
        setTimeout(() => { btn.disabled = false; btn.textContent = '⬡ GET STICKERS'; }, 2000);
    }


    /* ── Wiring ── */

    const ACTIONS = {
        'choose-register': () => { SFX.positive(); hidePrompt('argChoicePrompt'); setTimeout(showRegistration, 300); },
        'choose-card':     () => { SFX.positive(); hidePrompt('argChoicePrompt'); setTimeout(showCardPrompt, 300); },
        'register':        register,
        'pick-card':       () => $('argCardFile').click(),
        'back':            showArgChoice,
        'logout':          logout,
        'inventory':       () => Inventory.open(),
        'card-editor':     () => CardEditor.open(),
        'signal':          () => Signal.open(),
        'dev-stickers':    devAwardStickers,
    };

    document.addEventListener('click', e => {
        const el = e.target.closest('[data-action]');
        if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el);
    });

    document.addEventListener('DOMContentLoaded', () => {
        $('argUsername').addEventListener('keydown', e => { if (e.key === 'Enter') register(); });        $('argCardFile').addEventListener('change', e => uploadCard(e.target));
    });

    return { showArgChoice, showCardPrompt, showWelcome, downloadCard };
})();
