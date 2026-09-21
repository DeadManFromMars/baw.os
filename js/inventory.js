/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   inventory.js  —  INVENTORY OVERLAY + 3D VIEWER

   Full-screen overlay triggered by the INVENTORY button on the
   globe screen. Only shown when the player is logged in.

   LAYOUT:
     Left panel  — two tabs:
                   ITEMS     DDR-style wheel selector. Rows are
                             position:absolute, placed by JS each frame.
                             The selected item "pulls out" like a book
                             from a shelf. Scroll / arrow keys spin it.
                   STICKERS  plain scrollable list of owned stickers.
     Right panel — owned card:    3D card viewer
                   owned sticker: 3D sticker viewer
                   locked slot:   animated "black hole" 2D canvas

   ONE VIEWER, REUSED:
     A single Three.js renderer is created the first time something
     is shown and reused for every card/sticker after that — only the
     visible model swaps. (Browsers cap WebGL contexts at ~16, so a
     renderer per selection would start failing after a few scrolls.)
     Everything is disposed when the overlay closes.

   VIEWER INTERACTION:
     Drag         — spin the model
     Scroll/pinch — zoom (isolated from the wheel)
     Double-click — reset the view

   HOW THE WHEEL WORKS:
     _wheelOffset is a floating-point position in unbounded slot-space.
     _wheelTarget is always an integer in the same space.
     Each row's top = centreY - ROW_HEIGHT/2 + dist*ROW_HEIGHT,
     where dist is the shortest-path wrap from _wheelOffset to that row.
     The selector box (CSS top:50% translateY(-50%)) permanently marks
     the centreY anchor — it is never touched by JS.

     Scroll fires at most one step per cooldown window so the spring
     never stacks and rows never drift off centre.

     Each row has its own _pullState[i] (0..1) animated independently.
     Active row targets 1 (pulled right), all others target 0 (flush).

   DEPENDENCIES:
     Three.js r128 (CDN, loaded in index.html)
     config.js, utils.js (card geometry, sticker paths), sounds.js
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Inventory = (() => {

    /* ════════════════════════════════════════════════════════
       TUNING
    ════════════════════════════════════════════════════════ */

    // Wheel feel — change these freely
    const WHEEL_CONFIG = {
        // Slots visible above and below centre. Total visible = VISIBLE_SLOTS*2+1.
        VISIBLE_SLOTS:  4,

        // Height of each row in px. Must match .inv-wheel-selector / .inv-row height in CSS.
        ROW_HEIGHT:     52,

        // Scale at the furthest visible slot (centre slot is always 1.0).
        SCALE_MIN:      0.68,

        // Opacity at the furthest visible slot (centre slot is always 1.0).
        OPACITY_MIN:    0.12,

        // Easing power on scale/opacity falloff. 1 = linear, 2 = quadratic.
        FALLOFF_POWER:  1.6,

        // Wheel spring: fraction of remaining distance closed per frame (at 60fps).
        WHEEL_SPRING:   0.14,

        // Pull spring: how fast the active item slides out / snaps back (same units).
        PULL_SPRING:    0.11,

        // How far the active item slides right (px). The "book pull" distance.
        PULL_PX:        28,

        // Scroll cooldown (ms). Prevents multiple steps per physical detent.
        SCROLL_COOLDOWN_MS: 120,

        // Right-panel update debounce (ms) after a wheel step.
        VIEWER_DEBOUNCE_MS: 120,
    };

    // The items wheel is padded with locked "???" slots up to this count
    // so it always feels like there's more to find.
    const MIN_SLOTS = 12;

    // Camera + spin defaults for each kind of model in the viewer
    const VIEWS = {
        card:    { zoom: 3.2, rotX: -0.1, rotY: 0.25, spin: 0.002, minZoom: 1.4, maxZoom: 5 },
        sticker: { zoom: 2.5, rotX: 0,    rotY: 0.3,  spin: 0.004, minZoom: 1.2, maxZoom: 5 },
    };

    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


    /* ════════════════════════════════════════════════════════
       STATE
    ════════════════════════════════════════════════════════ */

    let _isOpen        = false;
    let _abort         = null;     // AbortController — every listener hangs off its signal
    let _returnFocusEl = null;     // focused element before opening, restored on close

    let _items     = [];           // wheel rows (owned + locked + padding)
    let _stickers  = [];           // owned stickers
    let _activeTab = 'items';      // 'items' | 'stickers'

    // Wheel — all positions in unbounded slot-space
    let _selectedIndex  = 0;       // canonical selected item index (0..N-1)
    let _wheelOffset    = 0;       // animated float, chases _wheelTarget
    let _wheelTarget    = 0;       // integer, advances unboundedly (never resets)
    let _pullState      = [];      // per-row animated pull value (0=flush, 1=pulled)
    let _wheelRafId     = null;
    let _wheelLastTime  = null;
    let _wheelHeight    = 0;       // cached by a ResizeObserver — no layout reads per frame

    let _scrollCooldown = false;   // scroll ratchet
    let _scrollTimer    = null;
    let _viewerDebounce = null;

    let _stickerIndex   = 0;       // selected row in the stickers tab

    let _viewer         = null;    // the one Three.js viewer — see _ensureViewer()
    let _blackHoleFrame = null;

    // The player's card image, cached as a blob URL between opens.
    // Cleared by invalidateCardCache() when the card editor saves.
    let _cardBlobUrl     = null;
    let _cardBlobPromise = null;
    let _cardGeneration  = 0;      // bumped on invalidate, so a fetch already in flight is thrown away


    /* ════════════════════════════════════════════════════════
       SMALL HELPERS
    ════════════════════════════════════════════════════════ */

    const _el    = id => document.getElementById(id);
    const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // addEventListener that is removed automatically when the overlay closes
    function _on(target, type, handler, options = {}) {
        target.addEventListener(type, handler, { ...options, signal: _abort.signal });
    }

    // True while the session that started an async task is still open
    function _alive(session) {
        return _isOpen && _abort === session;
    }

    function _makeRedacted(len) {
        const chars = '?????????????????????????????????░▒▓';
        let out = '';
        for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
        return out;
    }


    /* ════════════════════════════════════════════════════════
       OPEN / CLOSE
    ════════════════════════════════════════════════════════ */

    function open() {
        if (_isOpen) return;
        _isOpen        = true;
        _returnFocusEl = document.activeElement;
        _abort         = new AbortController();
        _activeTab     = 'items';
        SFX.positive();

        _fetchCardBlobUrl();          // start early so the card is ready when shown
        _buildShell();
        _loadData(_abort);
    }

    function close() {
        if (!_isOpen) return;
        _isOpen = false;
        SFX.negative();

        _abort.abort();               // removes every listener registered with _on()
        _stopBlackHole();
        _disposeViewer();
        if (_wheelRafId !== null) { cancelAnimationFrame(_wheelRafId); _wheelRafId = null; }
        clearTimeout(_viewerDebounce);
        clearTimeout(_scrollTimer);
        _scrollCooldown = false;

        const overlay = _el('inventoryOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            // Timeout rather than transitionend, which doesn't fire when motion is reduced
            setTimeout(() => overlay.remove(), 550);
        }
        _returnFocusEl?.focus?.();
    }


    /* ════════════════════════════════════════════════════════
       SHELL
    ════════════════════════════════════════════════════════ */

    function _buildShell() {
        _el('inventoryOverlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'inventoryOverlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'invTitle');
        overlay.tabIndex = -1;

        overlay.innerHTML = `
            <div class="inv-left">
                <header class="inv-header">
                    <h2 class="inv-title" id="invTitle">Inventory</h2>
                    <button type="button" class="inv-close-btn" id="invCloseBtn" data-sfx="hover" aria-label="Close inventory">✕</button>
                </header>

                <div class="inv-tabs" role="tablist" aria-label="Inventory sections">
                    <button type="button" class="inv-tab" role="tab" id="invTabItems" data-sfx="hover"
                            aria-selected="true" aria-controls="invWheelWrap">Items</button>
                    <button type="button" class="inv-tab" role="tab" id="invTabStickers" data-sfx="hover"
                            aria-selected="false" aria-controls="invWheelWrap">Stickers</button>
                </div>

                <div class="inv-wheel-wrap" id="invWheelWrap" role="tabpanel">
                    <div class="inv-wheel-selector" id="invWheelSelector" aria-hidden="true"></div>
                    <div class="inv-wheel" id="invWheel" role="listbox" aria-label="Items" tabindex="0">
                        <p class="inv-empty">Loading…</p>
                    </div>
                </div>

                <p class="inv-key-hint">↑ ↓ or scroll to browse · Esc to close</p>
            </div>

            <div class="inv-right" id="invRight">
                <div class="inv-viewer" id="invViewer" hidden>
                    <h3 class="inv-viewer-label" id="invViewerLabel"></h3>
                    <p class="inv-viewer-sub" id="invViewerSub"></p>
                    <canvas id="invCanvas" role="img"></canvas>
                    <p class="inv-viewer-hint">Drag to rotate · scroll to zoom · double-click to reset</p>
                </div>

                <div class="inv-locked" id="invLocked" hidden>
                    <canvas id="invBlackHole" class="inv-blackhole-canvas" aria-hidden="true"></canvas>
                    <p class="inv-blackhole-label">Data corrupted</p>
                </div>

                <p class="inv-empty inv-right-note" id="invRightNote"></p>
            </div>
        `;
        document.body.appendChild(overlay);

        _on(_el('invCloseBtn'),    'click', close);
        _on(_el('invTabItems'),    'click', () => _switchTab('items'));
        _on(_el('invTabStickers'), 'click', () => _switchTab('stickers'));
        _on(overlay, 'keydown', _onKeydown);

        // Wheel: scroll steps it, clicks jump to a row (delegated)
        const wrap = _el('invWheelWrap');
        _on(wrap, 'wheel', _onWheelScroll, { passive: false });
        _on(_el('invWheel'), 'click', _onListClick);
        _on(_el('invWheel'), 'mouseover', _onListHover);

        // Cache the wrap height so the per-frame draw doesn't force layout
        const ro = new ResizeObserver(() => { _wheelHeight = wrap.clientHeight; _drawWheel(); });
        ro.observe(wrap);
        _abort.signal.addEventListener('abort', () => ro.disconnect());

        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            overlay.focus();
        });
    }


    /* ════════════════════════════════════════════════════════
       DATA
    ════════════════════════════════════════════════════════ */

    async function _loadData(session) {
        let items = [], stickers = [];
        try {
            const [invRes, stickerRes] = await Promise.all([
                fetch(`${CONFIG.apiBase}/inventory`, { credentials: 'include' }),
                fetch(`${CONFIG.apiBase}/stickers`,  { credentials: 'include' }),
            ]);
            items    = invRes.ok     ? (await invRes.json()).items         || [] : [];
            stickers = stickerRes.ok ? (await stickerRes.json()).stickers  || [] : [];
        } catch (err) {
            console.error('[Inventory] fetch failed:', err);
        }
        if (!_alive(session)) return;

        // Stickers have their own tab — keep them out of the items wheel
        _items    = items.filter(i => i.item_type !== 'sticker');
        _stickers = stickers;

        // Pad with locked placeholder slots
        while (_items.length < MIN_SLOTS) {
            _items.push({ id: null, name: null, item_type: null, owned: false, _phantom: true });
        }

        // Start on the first owned item
        const firstOwned = _items.findIndex(i => i.owned);
        _selectedIndex = firstOwned >= 0 ? firstOwned : 0;
        _wheelOffset   = _selectedIndex;
        _wheelTarget   = _selectedIndex;
        _pullState     = _items.map(() => 0);

        _renderWheel();
        _selectItem(_selectedIndex);
        _startWheelLoop();
    }

    // Fetch the player's card PNG once and keep it as a blob URL
    function _fetchCardBlobUrl() {
        if (_cardBlobUrl) return Promise.resolve(_cardBlobUrl);
        if (!_cardBlobPromise) {
            const gen = _cardGeneration;
            _cardBlobPromise = fetch(`${CONFIG.apiBase}/card/image?t=${Date.now()}`, { credentials: 'include' })
                .then(r => (r.ok ? r.blob() : null))
                .then(blob => {
                    if (!blob || gen !== _cardGeneration) return null;   // card changed meanwhile
                    return (_cardBlobUrl = URL.createObjectURL(blob));
                })
                .catch(() => null)
                .finally(() => { if (gen === _cardGeneration) _cardBlobPromise = null; });
        }
        return _cardBlobPromise;
    }


    /* ════════════════════════════════════════════════════════
       ITEMS WHEEL — DOM
    ════════════════════════════════════════════════════════ */

    function _renderWheel() {
        const wheel = _el('invWheel');
        if (!wheel) return;
        wheel.innerHTML = '';
        wheel.setAttribute('aria-label', 'Items');

        _items.forEach((item, i) => {
            const row = document.createElement('div');
            row.className   = 'inv-row' + (item.owned ? ' inv-row-owned' : ' inv-row-locked');
            row.id          = `invRow${i}`;
            row.dataset.idx = i;
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', 'false');

            const index = String(i + 1).padStart(2, '0');
            if (item.owned) {
                row.innerHTML = `
                    <span class="inv-row-index">${index}</span>
                    <span class="inv-row-name">${Utils.esc(item.name)}</span>
                    <span class="inv-row-type">${Utils.esc(item.item_type)}</span>
                `;
            } else {
                // Redacted text length varies per slot so the list looks organic
                const nameLen = 14 + ((i * 7 + 3) % 22);
                const typeLen = 4  + ((i * 3 + 1) % 8);
                row.setAttribute('aria-label', `Slot ${index}, locked`);
                row.innerHTML = `
                    <span class="inv-row-index">${index}</span>
                    <span class="inv-row-name inv-row-redacted" aria-hidden="true">${_makeRedacted(nameLen)}</span>
                    <span class="inv-row-type inv-row-redacted" aria-hidden="true">${_makeRedacted(typeLen)}</span>
                `;
            }
            wheel.appendChild(row);
        });
    }

    // Mark the selected row for CSS + screen readers
    function _applyActiveClass() {
        const wheel = _el('invWheel');
        if (!wheel) return;
        wheel.querySelectorAll('.inv-row').forEach((row, i) => {
            const active = i === _selectedIndex;
            row.classList.toggle('inv-row-active', active);
            row.setAttribute('aria-selected', String(active));
        });
        wheel.setAttribute('aria-activedescendant', `invRow${_selectedIndex}`);
    }


    /* ════════════════════════════════════════════════════════
       ITEMS WHEEL — ANIMATION
       Each row's midpoint sits at centreY + dist * ROW_HEIGHT,
       where dist = 0 for the active row, ±1 for its neighbours, etc.
       centreY = wrap height / 2 — the same anchor as the CSS selector.
    ════════════════════════════════════════════════════════ */

    function _drawWheel() {
        if (_activeTab !== 'items') return;
        const wheel = _el('invWheel');
        if (!wheel) return;

        const rows = wheel.children;
        const n    = rows.length;
        if (!n || !_wheelHeight) return;

        const { VISIBLE_SLOTS, ROW_HEIGHT, SCALE_MIN, OPACITY_MIN, FALLOFF_POWER, PULL_PX } = WHEEL_CONFIG;
        const centreY = _wheelHeight / 2;

        for (let i = 0; i < n; i++) {
            const row = rows[i];

            // Shortest-path signed distance from animated offset to this row
            let dist = i - _wheelOffset;
            dist = dist - Math.round(dist / n) * n;
            const absDist = Math.abs(dist);

            row.style.top = (centreY - ROW_HEIGHT / 2 + dist * ROW_HEIGHT).toFixed(2) + 'px';

            if (absDist > VISIBLE_SLOTS + 0.6) {
                row.style.opacity       = '0';
                row.style.transform     = 'translateX(0px) scale(0.6)';
                row.style.pointerEvents = 'none';
                continue;
            }

            const isActive = (i === _selectedIndex);

            // Falloff curve: 0 at centre → 1 at edge
            const f       = Math.pow(Math.min(absDist / VISIBLE_SLOTS, 1), FALLOFF_POWER);
            const scale   = 1.0 - f * (1.0 - SCALE_MIN);
            const opacity = 1.0 - f * (1.0 - OPACITY_MIN);
            const tx      = _pullState[i] * PULL_PX;   // active slides right, others flush

            row.style.transform     = `translateX(${tx.toFixed(2)}px) scale(${(isActive ? 1 : scale).toFixed(4)})`;
            row.style.opacity       = isActive ? '1' : opacity.toFixed(4);
            row.style.pointerEvents = absDist > VISIBLE_SLOTS - 0.5 ? 'none' : 'auto';
        }
    }

    // Pull spring — active row pulls out, all others snap back. Returns true while moving.
    function _tickPull(spring) {
        let moving = false;
        for (let i = 0; i < _pullState.length; i++) {
            const target = (i === _selectedIndex) ? 1 : 0;
            const diff   = target - _pullState[i];
            if (Math.abs(diff) > 0.001) {
                _pullState[i] += diff * spring;
                moving = true;
            } else {
                _pullState[i] = target;
            }
        }
        return moving;
    }

    // Runs only while the wheel is moving; stops itself once settled
    function _startWheelLoop() {
        if (_wheelRafId === null) {
            _wheelLastTime = null;
            _wheelRafId = requestAnimationFrame(_wheelLoop);
        }
    }

    function _wheelLoop(now) {
        const dt = _wheelLastTime === null ? 1000 / 60 : now - _wheelLastTime;
        _wheelLastTime = now;

        const diff = _wheelTarget - _wheelOffset;
        if (Math.abs(diff) < 0.001) _wheelOffset = _wheelTarget;
        else _wheelOffset += diff * Utils.springStep(WHEEL_CONFIG.WHEEL_SPRING, dt);

        const pulling = _tickPull(Utils.springStep(WHEEL_CONFIG.PULL_SPRING, dt));
        _drawWheel();

        const settled = Math.abs(_wheelTarget - _wheelOffset) < 0.001 && !pulling;
        _wheelRafId = settled ? null : requestAnimationFrame(_wheelLoop);
    }


    /* ════════════════════════════════════════════════════════
       ITEMS WHEEL — NAVIGATION
    ════════════════════════════════════════════════════════ */

    // Step ±1 slot. Ratchet guard: ignored until the spring has nearly
    // caught up, so rapid events can't stack and drift rows off centre.
    function _stepWheel(delta) {
        const n = _items.length;
        if (!n || _activeTab !== 'items') return;
        if (Math.abs(_wheelOffset - _wheelTarget) > 0.25) return;

        _wheelTarget  += delta;
        _selectedIndex = ((_wheelTarget % n) + n) % n;
        _applyActiveClass();
        _startWheelLoop();

        // Debounced so fast scrolling doesn't swap the viewer on every step
        clearTimeout(_viewerDebounce);
        _viewerDebounce = setTimeout(() => _selectItem(_selectedIndex), WHEEL_CONFIG.VIEWER_DEBOUNCE_MS);
    }

    // Jump straight to a slot (row click), taking the shortest wrap path
    function _stepWheelTo(index) {
        const n     = _items.length;
        const base  = Math.round(_wheelTarget);
        let   delta = index - (((base % n) + n) % n);
        if (delta >  n / 2) delta -= n;
        if (delta < -n / 2) delta += n;
        _wheelTarget = base + delta;
        _startWheelLoop();
        _selectItem(index);
        SFX.hover();
    }

    // Show the selected item in the right panel
    function _selectItem(index) {
        _selectedIndex = index;
        _applyActiveClass();

        const item = _items[index];
        if (!item) return;
        if (!item.owned)                 _showLocked();
        else if (item.item_type === 'card') _showCard(item);
        else                             _showNote(`${item.name} — no preview yet.`);
    }


    /* ════════════════════════════════════════════════════════
       STICKERS TAB — flat list
    ════════════════════════════════════════════════════════ */

    function _renderStickerList() {
        const wheel = _el('invWheel');
        if (!wheel) return;
        wheel.innerHTML = '';
        wheel.setAttribute('aria-label', 'Stickers');
        wheel.removeAttribute('aria-activedescendant');

        if (!_stickers.length) {
            wheel.innerHTML = '<p class="inv-empty">No stickers yet.</p>';
            _showNote('Stickers you collect show up here.');
            return;
        }

        _stickers.forEach((s, i) => {
            const row = document.createElement('div');
            row.className   = 'inv-row inv-row-owned inv-row-flat';
            row.id          = `invSticker${i}`;
            row.dataset.idx = i;
            row.setAttribute('role', 'option');
            row.innerHTML = `
                <img class="inv-row-thumb" src="${Utils.esc(Utils.stickerSrc(s.slug))}" alt="">
                <span class="inv-row-name">${Utils.esc(s.name)}</span>
                <span class="inv-row-type">Sticker</span>
            `;
            wheel.appendChild(row);
        });

        _selectSticker(_clamp(_stickerIndex, 0, _stickers.length - 1));
    }

    function _selectSticker(index) {
        _stickerIndex = index;
        const wheel = _el('invWheel');
        wheel.querySelectorAll('.inv-row-flat').forEach((row, i) => {
            const active = i === index;
            row.classList.toggle('inv-row-active', active);
            row.setAttribute('aria-selected', String(active));
            if (active) row.scrollIntoView({ block: 'nearest' });
        });
        wheel.setAttribute('aria-activedescendant', `invSticker${index}`);
        _showSticker(_stickers[index]);
    }


    /* ════════════════════════════════════════════════════════
       TABS
    ════════════════════════════════════════════════════════ */

    function _switchTab(tab) {
        if (tab === _activeTab) return;
        _activeTab = tab;
        SFX.hover();

        const isItems = tab === 'items';
        _el('invTabItems').setAttribute('aria-selected', String(isItems));
        _el('invTabStickers').setAttribute('aria-selected', String(!isItems));
        _el('invWheelWrap').classList.toggle('is-list', !isItems);
        _el('invWheelSelector').hidden = !isItems;

        clearTimeout(_viewerDebounce);
        if (_wheelRafId !== null) { cancelAnimationFrame(_wheelRafId); _wheelRafId = null; }

        if (isItems) {
            _renderWheel();
            _pullState   = _items.map(() => 0);
            _wheelOffset = _wheelTarget = _selectedIndex;
            _selectItem(_selectedIndex);
            _startWheelLoop();
        } else {
            _renderStickerList();
        }
    }


    /* ════════════════════════════════════════════════════════
       INPUT
    ════════════════════════════════════════════════════════ */

    // Row clicks for both tabs (delegated from the list container)
    function _onListClick(e) {
        const row = e.target.closest('.inv-row');
        if (!row) return;
        const index = Number(row.dataset.idx);
        if (_activeTab === 'items') {
            _stepWheelTo(index);
        } else {
            _selectSticker(index);
            SFX.hover();
        }
    }

    // Hover sound — skipped while the wheel spins, or rows sliding
    // under a still cursor would fire it repeatedly
    function _onListHover(e) {
        const row = e.target.closest('.inv-row');
        if (!row || row.contains(e.relatedTarget)) return;
        if (_wheelRafId === null) SFX.hover();
    }

    // Items tab: one scroll event = one step, then locked for SCROLL_COOLDOWN_MS.
    // Stickers tab: the list scrolls normally.
    function _onWheelScroll(e) {
        if (_activeTab !== 'items') return;
        e.preventDefault();
        if (_scrollCooldown) return;

        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= WHEEL_CONFIG.ROW_HEIGHT;
        if (e.deltaMode === 2) dy *= _wheelHeight || 400;
        if (Math.abs(dy) < 1) return;

        _stepWheel(dy > 0 ? 1 : -1);

        _scrollCooldown = true;
        clearTimeout(_scrollTimer);
        _scrollTimer = setTimeout(() => { _scrollCooldown = false; }, WHEEL_CONFIG.SCROLL_COOLDOWN_MS);
    }

    function _onKeydown(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key === 'Tab')    { Utils.trapFocus(e, _el('inventoryOverlay')); return; }

        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();

        if (_activeTab === 'items') {
            _stepWheel(step);
        } else if (_stickers.length) {
            _selectSticker((_stickerIndex + step + _stickers.length) % _stickers.length);
            SFX.hover();
        }
    }


    /* ════════════════════════════════════════════════════════
       RIGHT PANEL
       One of three things is visible: the 3D viewer, the locked
       black hole, or a plain text note.
    ════════════════════════════════════════════════════════ */

    function _showPanel(name) {
        _el('invViewer').hidden    = name !== 'viewer';
        _el('invLocked').hidden    = name !== 'locked';
        _el('invRightNote').hidden = name !== 'note';
        if (name !== 'locked') _stopBlackHole();
        if (name !== 'viewer') _stopViewerLoop();
    }

    function _setViewerText(title, sub) {
        _el('invViewerLabel').textContent = title;
        _el('invViewerSub').textContent   = sub || '';
        _el('invCanvas').setAttribute('aria-label', `3D view of ${title}`);
    }

    function _showNote(text) {
        _showPanel('note');
        _el('invRightNote').textContent = text;
    }

    function _showCard(item) {
        _showPanel('viewer');
        _setViewerText(item.name, item.description);
        const v = _ensureViewer();
        if (!v) return;
        _setView('card');
        v.card.visible        = true;
        v.stickerMesh.visible = false;

        // Load the card texture once per viewer
        if (!v.cardTexRequested) {
            v.cardTexRequested = true;
            _fetchCardBlobUrl().then(url => {
                if (!url || _viewer !== v) return;
                new THREE.TextureLoader().load(url, tex => {
                    if (_viewer !== v) { tex.dispose(); return; }
                    tex.flipY      = false;
                    tex.anisotropy = v.renderer.capabilities.getMaxAnisotropy();
                    v.faceMat.map  = tex;
                    v.faceMat.needsUpdate = true;
                }, undefined, err => console.warn('[Inventory] Card texture failed:', err));
            });
        }
        _startViewerLoop();
    }

    function _showSticker(sticker) {
        _showPanel('viewer');
        _setViewerText(sticker.name, sticker.description);
        const v = _ensureViewer();
        if (!v) return;
        _setView('sticker');
        v.card.visible        = false;
        v.stickerMesh.visible = false;      // shown once its texture is ready
        v.currentSlug         = sticker.slug;

        _loadStickerTexture(v, sticker.slug).then(asset => {
            // Ignore if the viewer closed or another sticker was picked meanwhile
            if (!asset || _viewer !== v || v.currentSlug !== sticker.slug || v.card.visible) return;
            v.stickerMesh.material.map = asset.tex;
            v.stickerMesh.material.needsUpdate = true;
            v.stickerMesh.scale.set(1, asset.aspect, 1);
            v.stickerMesh.visible = true;
        });
        _startViewerLoop();
    }

    function _showLocked() {
        _showPanel('locked');
        _startBlackHole();
    }


    /* ════════════════════════════════════════════════════════
       3D VIEWER — created once, reused for every card/sticker
    ════════════════════════════════════════════════════════ */

    function _ensureViewer() {
        if (_viewer) return _viewer;
        const canvas = _el('invCanvas');
        if (!canvas || typeof THREE === 'undefined') {
            console.warn('[Inventory] Three.js not available');
            return null;
        }

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);

        // Three-point lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        const key  = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(1.5, 2.5, 3);
        const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-2, -1, 1.5);
        const rim  = new THREE.DirectionalLight(0xffffff, 0.2); rim.position.set(0, 0, -3);
        scene.add(key, fill, rim);

        // Card model (face texture arrives later)
        const faceMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const edgeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.55, metalness: 0.1 });
        const card    = new THREE.Mesh(Utils.makeCardGeometry(), [faceMat, edgeMat]);

        // Sticker model — a unit plane scaled to the image's aspect
        const stickerMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, alphaTest: 0.01 })
        );

        const pivot = new THREE.Group();
        pivot.add(card, stickerMesh);
        scene.add(pivot);

        _viewer = {
            canvas, scene, camera, renderer, pivot, card, faceMat, stickerMesh,
            stickerTextures: new Map(),     // slug → Promise<{ tex, aspect }>
            cardTexRequested: false,
            currentSlug: null,
            view: VIEWS.card,
            rotX: 0, rotY: 0, targetRotX: 0, targetRotY: 0, zoom: 3, targetZoom: 3,
            pointers: new Map(),            // active pointers, for drag + pinch
            pinchDist: null,
            frameId: 0,
            lastTime: null,
        };

        // Match the drawing buffer to the canvas's CSS size
        const fit = () => {
            const w = canvas.clientWidth, h = canvas.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        _viewer.resizeObs = new ResizeObserver(fit);
        _viewer.resizeObs.observe(canvas);
        fit();

        _bindViewerInput(_viewer);
        return _viewer;
    }

    // Reset camera + rotation to the defaults for this kind of model
    function _setView(name) {
        const v = _viewer;
        v.view = VIEWS[name];
        v.rotX = v.targetRotX = v.view.rotX;
        v.rotY = v.targetRotY = v.view.rotY;
        v.zoom = v.targetZoom = v.view.zoom;
    }

    function _loadStickerTexture(v, slug) {
        if (!v.stickerTextures.has(slug)) {
            v.stickerTextures.set(slug, new Promise(resolve => {
                new THREE.TextureLoader().load(
                    Utils.stickerSrc(slug),
                    tex => resolve({ tex, aspect: tex.image.height / tex.image.width }),
                    undefined,
                    () => resolve(null)
                );
            }));
        }
        return v.stickerTextures.get(slug);
    }

    function _bindViewerInput(v) {
        const canvas = v.canvas;
        const pinchDistance = () => {
            const [a, b] = [...v.pointers.values()];
            return Math.hypot(a.x - b.x, a.y - b.y);
        };

        _on(canvas, 'pointerdown', e => {
            canvas.setPointerCapture(e.pointerId);
            v.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (v.pointers.size === 2) v.pinchDist = pinchDistance();
        });

        _on(canvas, 'pointermove', e => {
            const p = v.pointers.get(e.pointerId);
            if (!p) return;

            if (v.pointers.size === 1) {
                // One finger / mouse: spin
                v.targetRotY += (e.clientX - p.x) * 0.012;
                v.targetRotX  = _clamp(v.targetRotX + (e.clientY - p.y) * 0.012, -Math.PI / 2, Math.PI / 2);
            }
            p.x = e.clientX;
            p.y = e.clientY;

            if (v.pointers.size === 2 && v.pinchDist !== null) {
                // Two fingers: pinch to zoom
                const d = pinchDistance();
                v.targetZoom = _clamp(v.targetZoom - (d - v.pinchDist) * 0.01, v.view.minZoom, v.view.maxZoom);
                v.pinchDist  = d;
            }
        });

        const release = e => {
            v.pointers.delete(e.pointerId);
            if (v.pointers.size < 2) v.pinchDist = null;
        };
        _on(canvas, 'pointerup',     release);
        _on(canvas, 'pointercancel', release);

        // Zoom — stopPropagation keeps it from also stepping the wheel
        _on(canvas, 'wheel', e => {
            e.preventDefault();
            e.stopPropagation();
            const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
            v.targetZoom = _clamp(v.targetZoom + dy * 0.003, v.view.minZoom, v.view.maxZoom);
        }, { passive: false });

        _on(canvas, 'dblclick', () => {
            v.targetRotX = v.view.rotX;
            v.targetRotY = v.view.rotY;
            v.targetZoom = v.view.zoom;
        });
    }

    function _startViewerLoop() {
        _stopBlackHole();
        if (_viewer && !_viewer.frameId) {
            _viewer.lastTime = null;
            _viewer.frameId  = requestAnimationFrame(_viewerLoop);
        }
    }

    function _stopViewerLoop() {
        if (_viewer?.frameId) {
            cancelAnimationFrame(_viewer.frameId);
            _viewer.frameId = 0;
        }
    }

    function _viewerLoop(now) {
        const v = _viewer;
        if (!v) return;
        v.frameId = requestAnimationFrame(_viewerLoop);

        // Frame-rate independent: k === 1 at 60fps
        const k = v.lastTime === null ? 1 : Math.min((now - v.lastTime) / (1000 / 60), 3);
        v.lastTime = now;
        const ease = 1 - Math.pow(0.9, k);

        // Idle spin (off while dragging or when reduced motion is on)
        if (!v.pointers.size && !REDUCED_MOTION) v.targetRotY += v.view.spin * k;

        v.rotX += (v.targetRotX - v.rotX) * ease;
        v.rotY += (v.targetRotY - v.rotY) * ease;
        v.zoom += (v.targetZoom - v.zoom) * ease;
        v.pivot.rotation.set(v.rotX, v.rotY, 0);
        v.camera.position.z = v.zoom;

        v.renderer.render(v.scene, v.camera);
    }

    function _disposeViewer() {
        const v = _viewer;
        if (!v) return;
        _viewer = null;

        cancelAnimationFrame(v.frameId);
        v.resizeObs.disconnect();

        v.card.geometry.dispose();
        v.card.material.forEach(m => { m.map?.dispose(); m.dispose(); });
        v.stickerMesh.geometry.dispose();
        v.stickerMesh.material.dispose();
        v.stickerTextures.forEach(p => p.then(asset => asset?.tex.dispose()));

        v.renderer.dispose();
        v.renderer.forceContextLoss();   // free the WebGL context right away
    }


    /* ════════════════════════════════════════════════════════
       BLACK HOLE — animated 2D canvas for locked slots
    ════════════════════════════════════════════════════════ */

    function _stopBlackHole() {
        if (_blackHoleFrame !== null) {
            cancelAnimationFrame(_blackHoleFrame);
            _blackHoleFrame = null;
        }
    }

    function _startBlackHole() {
        _stopBlackHole();
        const canvas = _el('invBlackHole');
        if (!canvas) return;

        const W = canvas.width  = canvas.clientWidth  || 400;
        const H = canvas.height = canvas.clientHeight || 600;
        const ctx = canvas.getContext('2d');
        const cx = W / 2, cy = H / 2;
        const R  = Math.min(W, H) * 0.38;
        let t = 0;

        // Start from a clean dark frame (the effect relies on trails)
        ctx.fillStyle = '#0a080e';
        ctx.fillRect(0, 0, W, H);

        function drawFrame() {
            // Translucent fill leaves motion trails
            ctx.fillStyle = 'rgba(10,8,14,0.18)';
            ctx.fillRect(0, 0, W, H);

            // Spiral arms
            for (let a = 0; a < 14; a++) {
                const base = (a / 14) * Math.PI * 2 + t * 0.4;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                for (let s = 1; s <= 28; s++) {
                    const frac   = s / 28, r = frac * R;
                    const spiral = base + frac * 3.5 + Math.sin(t * 1.8 + a + frac * 6) * 0.9;
                    const wobble = Math.sin(t * 3.1 + a * 2.3 + frac * 8) * R * 0.18 * frac;
                    ctx.lineTo(cx + Math.cos(spiral) * (r + wobble), cy + Math.sin(spiral) * (r + wobble));
                }
                ctx.strokeStyle = `hsla(${(t * 40 + a * 26) % 360},80%,65%,${0.35 + 0.3 * Math.sin(t * 2 + a)})`;
                ctx.lineWidth   = 1.5 + Math.sin(t + a) * 0.8;
                ctx.stroke();
            }

            // Warped rings
            for (let r = 0; r < 22; r++) {
                const radius = (r / 22) * R * 1.1;
                const wobble = Math.sin(t * 2.2 + r * 0.9) * 18 * (r / 22);
                ctx.beginPath();
                for (let s = 0; s <= 120; s++) {
                    const angle = (s / 120) * Math.PI * 2;
                    const d = radius
                        + wobble        * Math.sin(angle * 4  + t * 2.5)
                        + wobble * 0.5  * Math.cos(angle * 7  - t * 1.8)
                        + wobble * 0.25 * Math.sin(angle * 11 + t * 3.3);
                    const x = cx + Math.cos(angle) * d, y = cy + Math.sin(angle) * d;
                    s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.strokeStyle = `hsla(${(t * 60 + r * 16 + 200) % 360},70%,60%,${0.06 + (1 - r / 22) * 0.28})`;
                ctx.lineWidth   = 0.8 + (1 - r / 22) * 2;
                ctx.stroke();
            }

            // Horizontal glitch slices
            if (Math.random() < 0.4) {
                const gy = Math.random() * H, gh = 1 + Math.random() * 6, gx = (Math.random() - 0.5) * 30;
                ctx.drawImage(canvas, gx, gy, W, gh, 0, gy, W, gh);
            }

            // Particles falling inward
            for (let p = 0; p < 60; p++) {
                const seed  = p * 137.508;
                const angle = seed + t * (0.4 + (p % 5) * 0.12);
                const frac  = (seed * 0.01 + t * 0.15 * (1 + (p % 3) * 0.3)) % 1;
                const r     = R * 1.3 * (1 - frac);
                ctx.beginPath();
                ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, (1 - frac) * 3, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${(p * 23 + t * 80) % 360},90%,75%,${frac * 0.9})`;
                ctx.fill();
            }

            // Event horizon
            const voidR = R * 0.18 + Math.sin(t * 2.8) * R * 0.03;
            const grad  = ctx.createRadialGradient(cx, cy, 0, cx, cy, voidR * 3.5);
            grad.addColorStop(0,    'rgba(0,0,0,1)');
            grad.addColorStop(0.35, 'rgba(0,0,0,0.97)');
            grad.addColorStop(0.7,  'rgba(0,0,0,0.5)');
            grad.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(cx, cy, voidR * 3.5, 0, Math.PI * 2); ctx.fill();

            // Glow ring
            const hue = (t * 50 + 260) % 360;
            const glow = ctx.createRadialGradient(cx, cy, voidR * 0.8, cx, cy, voidR * 1.6);
            glow.addColorStop(0,   `hsla(${hue},100%,70%,0.9)`);
            glow.addColorStop(0.5, `hsla(${hue + 30},100%,60%,0.3)`);
            glow.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.beginPath(); ctx.arc(cx, cy, voidR * 1.6, 0, Math.PI * 2); ctx.fill();

            t += REDUCED_MOTION ? 0.006 : 0.028;
            _blackHoleFrame = requestAnimationFrame(drawFrame);
        }
        drawFrame();
    }


    /* ════════════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════════════ */

    // Called by the card editor after a save so the next open shows the new card
    function invalidateCardCache() {
        if (_cardBlobUrl) URL.revokeObjectURL(_cardBlobUrl);
        _cardBlobUrl     = null;
        _cardBlobPromise = null;
        _cardGeneration++;
    }

    return { open, close, invalidateCardCache };

})();
