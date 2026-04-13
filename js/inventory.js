/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   inventory.js  —  INVENTORY OVERLAY + 3D VIEWER

   Full-screen overlay triggered by the INVENTORY button on the
   globe screen. Only shown when the player is logged in.

   LAYOUT:
     Left panel  — DDR-style wheel selector.
                   Rows are position:absolute, placed by JS each frame.
                   The selected item "pulls out" like a book from a shelf.
                   Scrolling or arrow keys spin the wheel infinitely.
     Right panel — owned: 3D interactive viewer (Three.js)
                   locked: procedural warped geometry (black hole)

   INTERACTION (3D viewer):
     Drag        — spin the card on X/Y axes
     Scroll      — zoom in/out (right panel only, isolated from wheel)
     Double-tap  — reset to default orientation

   WHEEL TUNING:
     All visual/feel constants live in WHEEL_CONFIG. Change them freely.

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
     config.js, utils.js, arg.js  (for CONFIG.apiBase)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Inventory = (() => {

    // ─────────────────────────────────────────────────────────
    // Wheel tuning — change these, touch nothing else
    // ─────────────────────────────────────────────────────────

    const WHEEL_CONFIG = {
        // Slots visible above and below centre. Total visible = VISIBLE_SLOTS*2+1.
        VISIBLE_SLOTS:  4,

        // Height of each row in px. Must match .inv-wheel-selector height in CSS.
        ROW_HEIGHT:     52,

        // Scale at the furthest visible slot (centre slot is always 1.0).
        SCALE_MIN:      0.68,

        // Opacity at the furthest visible slot (centre slot is always 1.0).
        OPACITY_MIN:    0.12,

        // Easing power on scale/opacity falloff. 1 = linear, 2 = quadratic.
        FALLOFF_POWER:  1.6,

        // Wheel spring: fraction of remaining distance closed per frame.
        WHEEL_SPRING:   0.14,

        // Pull spring: how fast the active item slides out / snaps back.
        PULL_SPRING:    0.11,

        // How far the active item slides right (px). The "book pull" distance.
        PULL_PX:        28,

        // Scroll cooldown (ms). Prevents multiple steps per physical detent.
        SCROLL_COOLDOWN_MS: 120,

        // Right-panel rebuild debounce (ms) after a wheel step.
        VIEWER_DEBOUNCE_MS: 120,
    };


    // ─────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────

    let _isOpen        = false;
    let _items         = [];
    let _stickers      = [];
    let _activeTab     = 'items';   // 'items' | 'stickers'

    // Three.js / viewer state
    let _threeCtx      = null;
    let _animFrameId   = null;
    // Note: only one viewer is ever active at a time — _threeCtx and
    // _animFrameId are shared between the card viewer and sticker viewer.
    let _cardTexUrl    = null;

    // Wheel — all positions in unbounded slot-space
    let _selectedIndex  = 0;        // canonical selected item index (0..N-1)
    let _wheelOffset    = 0;        // animated float, chases _wheelTarget
    let _wheelTarget    = 0;        // integer, advances unboundedly (never resets)
    let _pullState      = [];       // per-row animated pull value (0=flush, 1=pulled)
    let _wheelRafId     = null;

    // Scroll ratchet
    let _scrollCooldown = false;
    let _scrollTimer    = null;

    // Viewer debounce
    let _viewerDebounce = null;


    // ─────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────

    function open() {
        if (_isOpen) return;
        _isOpen = true;
        SFX.positive();

        // Pre-fetch card texture so it's ready when the viewer opens
        if (!_cardTexUrl) {
            fetch(`${CONFIG.apiBase}/card/download?t=${Date.now()}`, { credentials: 'include' })
                .then(r => r.ok ? r.blob() : null)
                .then(blob => { if (blob) _cardTexUrl = URL.createObjectURL(blob); })
                .catch(() => {});
        }
        _fetchAndRender();
    }

    function close() {
        if (!_isOpen) return;
        _isOpen = false;
        SFX.negative();
        _teardown();

        const overlay = document.getElementById('inventoryOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        }
    }


    // ─────────────────────────────────────────────────────────
    // Fetch inventory + stickers, then build the UI
    // ─────────────────────────────────────────────────────────

    async function _fetchAndRender() {
        _buildShell();

        try {
            const [invRes, stickerRes] = await Promise.all([
                fetch(`${CONFIG.apiBase}/inventory`, { credentials: 'include' }),
                fetch(`${CONFIG.apiBase}/stickers`,  { credentials: 'include' }),
            ]);
            const invData     = invRes.ok     ? await invRes.json()     : {};
            const stickerData = stickerRes.ok ? await stickerRes.json() : {};
            _items    = invData.items       || [];
            _stickers = stickerData.stickers || [];
        } catch (err) {
            console.error('[Inventory] fetch failed:', err);
            _items = []; _stickers = [];
        }

        // Strip stickers from items tab; pad to minimum slot count
        const MIN_SLOTS = 12;
        _items = _items.filter(i => i.item_type !== 'sticker' || !i.id);
        while (_items.length < MIN_SLOTS) {
            _items.push({
                id: null, slug: null, name: null, description: null,
                item_type: null, asset_key: null, sort_order: _items.length,
                owned: false, awarded_at: null, awarded_by: null, _phantom: true,
            });
        }

        _pullState = _items.map(() => 0);

        _renderWheel();

        // Start on first owned item, or slot 0
        const firstOwned = _items.findIndex(i => i.owned);
        _selectedIndex   = firstOwned >= 0 ? firstOwned : 0;
        _wheelOffset     = _selectedIndex;
        _wheelTarget     = _selectedIndex;

        _applyActiveClass();
        _selectItem(_selectedIndex);
        _startWheelLoop();

        requestAnimationFrame(() => requestAnimationFrame(() => {
            document.getElementById('inventoryOverlay')?.classList.add('visible');
        }));
    }


    // ─────────────────────────────────────────────────────────
    // Shell HTML
    // ─────────────────────────────────────────────────────────

    function _buildShell() {
        document.getElementById('inventoryOverlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'inventoryOverlay';
        overlay.innerHTML = `
            <div class="inv-left">
                <div class="inv-header">
                    <span class="inv-header-label">INVENTORY</span>
                    <button class="inv-close-btn" id="invCloseBtn" onmouseenter="SFX.hover()">✕</button>
                </div>
                <div class="inv-tabs">
                    <button class="inv-tab inv-tab-active" id="invTabItems"    onmouseenter="SFX.hover()">ITEMS</button>
                    <button class="inv-tab"                id="invTabStickers" onmouseenter="SFX.hover()">STICKERS</button>
                </div>
                <div class="inv-wheel-wrap" id="invWheelWrap">
                    <div class="inv-wheel-selector" id="invWheelSelector"></div>
                    <div class="inv-wheel"           id="invWheel"></div>
                </div>
            </div>
            <div class="inv-right" id="invRight"></div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('invCloseBtn').addEventListener('click', close);
        document.getElementById('invTabItems').addEventListener('click',    () => _switchTab('items'));
        document.getElementById('invTabStickers').addEventListener('click', () => _switchTab('stickers'));

        overlay.setAttribute('tabindex', '-1');
        overlay.addEventListener('keydown', _onKeydown);
        overlay.focus();

        // Wheel scroll — left panel only
        document.getElementById('invWheelWrap')
            .addEventListener('wheel', _onWheelScroll, { passive: false });
    }


    // ─────────────────────────────────────────────────────────
    // Render wheel rows (DOM build, runs once per tab switch)
    // ─────────────────────────────────────────────────────────

    function _renderWheel() {
        const wheel = document.getElementById('invWheel');
        if (!wheel) return;
        wheel.innerHTML = '';

        if (_items.length === 0) {
            wheel.innerHTML = '<div class="inv-empty">NO DATA</div>';
            return;
        }

        _items.forEach((item, i) => {
            const row = document.createElement('div');
            row.className   = 'inv-row' + (item.owned ? ' inv-row-owned' : ' inv-row-locked');
            row.dataset.idx = i;

            if (item.owned) {
                row.innerHTML = `
                    <span class="inv-row-index">${String(i + 1).padStart(2, '0')}</span>
                    <span class="inv-row-name">${_escHtml(item.name)}</span>
                    <span class="inv-row-type">${_escHtml(item.item_type)}</span>
                `;
            } else {
                const nameLen = 14 + ((i * 7 + 3) % 22);
                const typeLen = 4  + ((i * 3 + 1) % 8);
                row.innerHTML = `
                    <span class="inv-row-index">${String(i + 1).padStart(2, '0')}</span>
                    <span class="inv-row-name inv-row-redacted">${_makeRedacted(nameLen)}</span>
                    <span class="inv-row-type inv-row-redacted">${_makeRedacted(typeLen)}</span>
                `;
            }

            row.addEventListener('click',      () => _stepWheelTo(i));
            row.addEventListener('mouseenter', () => SFX.hover());
            wheel.appendChild(row);
        });
    }


    // ─────────────────────────────────────────────────────────
    // Wheel draw — called every rAF frame
    //
    // Each row's top is set so its midpoint sits at:
    //   centreY + dist * ROW_HEIGHT
    // where dist=0 for the active row, ±1 for its neighbours, etc.
    // centreY = wrapH/2, which is the same anchor as the CSS selector.
    // ─────────────────────────────────────────────────────────

    function _drawWheel() {
        const wheel = document.getElementById('invWheel');
        const wrap  = document.getElementById('invWheelWrap');
        if (!wheel || !wrap) return;

        const rows = wheel.children;
        const n    = rows.length;
        if (!n) return;

        const { VISIBLE_SLOTS, ROW_HEIGHT, SCALE_MIN, OPACITY_MIN, FALLOFF_POWER, PULL_PX } = WHEEL_CONFIG;

        const wrapH   = wrap.getBoundingClientRect().height;
        const centreY = wrapH / 2;

        for (let i = 0; i < n; i++) {
            const row = rows[i];

            // Shortest-path signed distance from animated offset to this row
            let dist = i - _wheelOffset;
            dist = dist - Math.round(dist / n) * n;
            const absDist = Math.abs(dist);

            // Position: midpoint of this row lands at centreY + dist*ROW_HEIGHT
            const top = centreY - ROW_HEIGHT / 2 + dist * ROW_HEIGHT;
            row.style.top = top.toFixed(2) + 'px';

            if (absDist > VISIBLE_SLOTS + 0.6) {
                row.style.opacity       = '0';
                row.style.transform     = 'translateX(0px) scale(0.6)';
                row.style.pointerEvents = 'none';
                row.classList.remove('inv-row-active');
                continue;
            }

            const isActive = (i === _selectedIndex);

            // Falloff curve: 0 at centre → 1 at edge
            const t       = Math.min(absDist / VISIBLE_SLOTS, 1);
            const f       = Math.pow(t, FALLOFF_POWER);
            const scale   = 1.0 - f * (1.0 - SCALE_MIN);
            const opacity = 1.0 - f * (1.0 - OPACITY_MIN);

            // Pull: active slides right, others stay flush
            const tx = _pullState[i] * PULL_PX;

            row.style.transform     = `translateX(${tx.toFixed(2)}px) scale(${(isActive ? 1.0 : scale).toFixed(4)})`;
            row.style.opacity       = isActive ? '1' : opacity.toFixed(4);
            row.style.pointerEvents = absDist > VISIBLE_SLOTS - 0.5 ? 'none' : 'auto';
            row.classList.toggle('inv-row-active', isActive);
        }
    }


    // ─────────────────────────────────────────────────────────
    // Pull spring — active row pulls out, all others snap back
    // ─────────────────────────────────────────────────────────

    function _tickPull() {
        const { PULL_SPRING } = WHEEL_CONFIG;
        let dirty = false;
        for (let i = 0; i < _pullState.length; i++) {
            const tgt  = (i === _selectedIndex) ? 1 : 0;
            const diff = tgt - _pullState[i];
            if (Math.abs(diff) > 0.001) {
                _pullState[i] += diff * PULL_SPRING;
                dirty = true;
            } else {
                _pullState[i] = tgt;
            }
        }
        return dirty;
    }


    // ─────────────────────────────────────────────────────────
    // Wheel rAF loop
    // ─────────────────────────────────────────────────────────

    function _startWheelLoop() {
        if (_wheelRafId !== null) return;
        _wheelRafId = requestAnimationFrame(_wheelLoop);
    }

    function _wheelLoop() {
        const { WHEEL_SPRING } = WHEEL_CONFIG;
        const diff = _wheelTarget - _wheelOffset;
        if (Math.abs(diff) < 0.001) _wheelOffset = _wheelTarget;
        else _wheelOffset += diff * WHEEL_SPRING;

        const pullDirty = _tickPull();
        _drawWheel();

        const settled = Math.abs(_wheelTarget - _wheelOffset) < 0.001 && !pullDirty;
        if (settled) { _wheelRafId = null; return; }
        _wheelRafId = requestAnimationFrame(_wheelLoop);
    }


    // ─────────────────────────────────────────────────────────
    // Navigation
    // ─────────────────────────────────────────────────────────

    /**
     * Step the wheel ±1 slot.
     * Ratchet guard: if the spring hasn't nearly caught up with the
     * previous target, the new step is ignored. This prevents
     * rapid-fire events from stacking up and drifting rows off centre.
     */
    function _stepWheel(delta) {
        const n = _items.length;
        if (!n) return;
        if (Math.abs(_wheelOffset - _wheelTarget) > 0.02 * n) return;

        _wheelTarget  += delta;
        _selectedIndex = (((_wheelTarget % n) + n) % n);
        _startWheelLoop();

        clearTimeout(_viewerDebounce);
        _viewerDebounce = setTimeout(() => {
            _applyActiveClass();
            _selectItem(_selectedIndex);
        }, WHEEL_CONFIG.VIEWER_DEBOUNCE_MS);
    }

    /**
     * Jump directly to a slot (used by row click).
     * Always takes the shortest wrap path.
     */
    function _stepWheelTo(index) {
        const n     = _items.length;
        const base  = Math.round(_wheelTarget);
        let   delta = index - (((base % n) + n) % n);
        if (delta >  n / 2) delta -= n;
        if (delta < -n / 2) delta += n;
        _wheelTarget   = base + delta;
        _selectedIndex = index;
        _startWheelLoop();
        _applyActiveClass();
        _selectItem(_selectedIndex);
        SFX.hover();
    }

    function _applyActiveClass() {
        document.querySelectorAll('#invWheel .inv-row').forEach((row, i) => {
            row.classList.toggle('inv-row-active', i === _selectedIndex);
        });
    }


    // ─────────────────────────────────────────────────────────
    // Select item → rebuild right panel
    // ─────────────────────────────────────────────────────────

    function _selectItem(index) {
        _selectedIndex = index;
        _applyActiveClass();
        _teardownViewer();
        const item = _items[index];
        if (!item) return;
        item.owned ? _buildViewer(item) : _buildBlackHole();
    }


    // ─────────────────────────────────────────────────────────
    // Scroll handler — ratchet style
    // One scroll event = one step, locked for SCROLL_COOLDOWN_MS.
    // ─────────────────────────────────────────────────────────

    function _onWheelScroll(e) {
        e.preventDefault();
        e.stopPropagation();
        if (_scrollCooldown) return;

        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= WHEEL_CONFIG.ROW_HEIGHT;
        if (e.deltaMode === 2) dy *= (document.getElementById('invWheelWrap')?.getBoundingClientRect().height || 400);
        if (Math.abs(dy) < 1) return;

        _stepWheel(dy > 0 ? 1 : -1);

        _scrollCooldown = true;
        clearTimeout(_scrollTimer);
        _scrollTimer = setTimeout(() => { _scrollCooldown = false; }, WHEEL_CONFIG.SCROLL_COOLDOWN_MS);
    }


    // ─────────────────────────────────────────────────────────
    // Keyboard navigation
    // ─────────────────────────────────────────────────────────

    function _onKeydown(e) {
        if (e.key === 'Escape')                              { close(); return; }
        if (e.key === 'ArrowDown'  || e.key === 'ArrowRight') { e.preventDefault(); _stepWheel(1);  }
        if (e.key === 'ArrowUp'    || e.key === 'ArrowLeft')  { e.preventDefault(); _stepWheel(-1); }
    }


    // ─────────────────────────────────────────────────────────
    // Tab switching
    // ─────────────────────────────────────────────────────────

    function _switchTab(tab) {
        _activeTab = tab;
        SFX.hover();

        document.getElementById('invTabItems')?.classList.toggle('inv-tab-active',    tab === 'items');
        document.getElementById('invTabStickers')?.classList.toggle('inv-tab-active', tab === 'stickers');

        _teardownViewer();
        if (_wheelRafId !== null) { cancelAnimationFrame(_wheelRafId); _wheelRafId = null; }

        if (tab === 'items') {
            _renderWheel();
            _pullState   = _items.map(() => 0);
            _wheelOffset = _selectedIndex;
            _wheelTarget = _selectedIndex;
            _applyActiveClass();
            _selectItem(_selectedIndex);
            _startWheelLoop();
        } else {
            _renderStickerList();
        }
    }


    // ─────────────────────────────────────────────────────────
    // Sticker list — flat scrollable, no wheel needed
    // ─────────────────────────────────────────────────────────

    function _renderStickerList() {
        const wheel = document.getElementById('invWheel');
        const sel   = document.getElementById('invWheelSelector');
        if (wheel) wheel.innerHTML = '';
        if (sel)   sel.style.display = 'none';  // hide selector bar in sticker tab

        if (_stickers.length === 0) {
            if (wheel) wheel.innerHTML = '<div class="inv-empty">NO STICKERS OWNED</div>';
            _buildBlackHole();
            return;
        }

        _stickers.forEach((s, i) => {
            const row = document.createElement('div');
            row.className = 'inv-row inv-row-owned inv-row-sticker-flat';
            row.innerHTML = `
                <span class="inv-row-index">${String(i + 1).padStart(2, '0')}</span>
                <span class="inv-row-name">${_escHtml(s.name)}</span>
                <span class="inv-row-type">STICKER</span>
            `;
            row.addEventListener('click', () => {
                document.querySelectorAll('.inv-row-sticker-flat').forEach((r, j) => {
                    r.classList.toggle('inv-row-active', j === i);
                });
                _buildStickerViewer(s);
                SFX.hover();
            });
            row.addEventListener('mouseenter', () => SFX.hover());
            wheel.appendChild(row);
        });

        wheel.firstElementChild?.classList.add('inv-row-active');
        if (_stickers[0]) _buildStickerViewer(_stickers[0]);
    }


    // ─────────────────────────────────────────────────────────
    // 3D card viewer (Three.js)
    // ─────────────────────────────────────────────────────────

    function _buildViewer(item) {
        const right = document.getElementById('invRight');
        if (!right) return;
        right.innerHTML = `
            <div class="inv-viewer-label">${_escHtml(item.name)}</div>
            <div class="inv-viewer-sub">${_escHtml(item.description || '')}</div>
            <canvas id="invCanvas"></canvas>
            <div class="inv-viewer-hint">drag to rotate · scroll to zoom · double-click to reset</div>
        `;
        requestAnimationFrame(() => _initThree(item));
    }

    function _initThree(item) {
        const canvas = document.getElementById('invCanvas');
        if (!canvas || typeof THREE === 'undefined') {
            console.warn('[Inventory] Three.js not available'); return;
        }

        const W = canvas.parentElement.clientWidth;
        const H = canvas.parentElement.clientHeight - 80;
        canvas.width = W; canvas.height = H;

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 100);
        camera.position.set(0, 0, 3.2);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);

        // Three-point lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        const kl = new THREE.DirectionalLight(0xffffff, 0.9); kl.position.set(1.5, 2.5, 3);  scene.add(kl);
        const fl = new THREE.DirectionalLight(0xffffff, 0.4); fl.position.set(-2, -1, 1.5);  scene.add(fl);
        const rl = new THREE.DirectionalLight(0xffffff, 0.2); rl.position.set(0, 0, -3);      scene.add(rl);

        // Rounded card geometry
        const CARD_W = 1.0, CARD_H = 1.535, CARD_D = 0.022, RADIUS = 0.06;
        function makeRoundedRect(w, h, r) {
            const s = new THREE.Shape(), hw = w / 2, hh = h / 2;
            s.moveTo(-hw + r, -hh);
            s.lineTo( hw - r, -hh); s.quadraticCurveTo( hw, -hh,  hw, -hh + r);
            s.lineTo( hw,  hh - r); s.quadraticCurveTo( hw,  hh,  hw - r,  hh);
            s.lineTo(-hw + r,  hh); s.quadraticCurveTo(-hw,  hh, -hw,  hh - r);
            s.lineTo(-hw, -hh + r); s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
            return s;
        }
        const cardGeo = new THREE.ExtrudeGeometry(makeRoundedRect(CARD_W, CARD_H, RADIUS), {
            depth: CARD_D, bevelEnabled: true,
            bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 4, curveSegments: 12,
        });
        cardGeo.center();

        // UV mapping for front face
        const pos = cardGeo.attributes.position;
        const uv  = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
            uv[i * 2]     =       (pos.getX(i) + CARD_W / 2) / CARD_W;
            uv[i * 2 + 1] = 1.0 - (pos.getY(i) + CARD_H / 2) / CARD_H;
        }
        cardGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        cardGeo.computeVertexNormals();

        const frontMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
        const edgeMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.55, metalness: 0.1 });

        const texUrl = _cardTexUrl || `${CONFIG.apiBase}/card/download?t=${Date.now()}`;
        new THREE.TextureLoader().load(texUrl, tex => {
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            tex.flipY = false;
            frontMat.map = tex; frontMat.needsUpdate = true;
            if (!_cardTexUrl) _cardTexUrl = texUrl;
        }, undefined, err => console.warn('[Inventory] Card texture failed:', err));

        const card = new THREE.Mesh(cardGeo, [frontMat, edgeMat]);
        scene.add(card);

        // Interaction state
        let isDragging = false, lastX = 0, lastY = 0;
        let rotX = -0.1, rotY = 0.25, targetRotX = rotX, targetRotY = rotY;
        let zoom = 3.2, targetZoom = 3.2;

        canvas.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            targetRotY += (e.clientX - lastX) * 0.012;
            targetRotX += (e.clientY - lastY) * 0.012;
            targetRotX  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotX));
            lastX = e.clientX; lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => { isDragging = false; });

        // Scroll zoom — scoped to canvas, stopPropagation isolates it from the wheel
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            e.stopPropagation();
            targetZoom = Math.max(1.4, Math.min(5.0, targetZoom + e.deltaY * 0.003));
        }, { passive: false });

        canvas.addEventListener('dblclick', () => { targetRotX = -0.1; targetRotY = 0.25; targetZoom = 3.2; });

        // Touch support
        let lastTouchDist = null;
        canvas.addEventListener('touchstart', e => {
            if (e.touches.length === 1) { isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
            if (e.touches.length === 2) { isDragging = false; lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
        }, { passive: true });
        canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 1 && isDragging) {
                targetRotY += (e.touches[0].clientX - lastX) * 0.012;
                targetRotX += (e.touches[0].clientY - lastY) * 0.012;
                targetRotX  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotX));
                lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
            }
            if (e.touches.length === 2 && lastTouchDist !== null) {
                const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                targetZoom = Math.max(1.4, Math.min(5.0, targetZoom - (d - lastTouchDist) * 0.01));
                lastTouchDist = d;
            }
        }, { passive: false });
        canvas.addEventListener('touchend', () => { isDragging = false; lastTouchDist = null; });

        function animate() {
            _animFrameId = requestAnimationFrame(animate);
            rotX  += (targetRotX - rotX) * 0.1;
            rotY  += (targetRotY - rotY) * 0.1;
            zoom  += (targetZoom - zoom)  * 0.1;
            card.rotation.x   = rotX;
            card.rotation.y   = rotY;
            camera.position.z = zoom;
            if (!isDragging) targetRotY += 0.002;
            renderer.render(scene, camera);
        }
        animate();

        const resizeObs = new ResizeObserver(() => {
            const nW = canvas.parentElement.clientWidth;
            const nH = canvas.parentElement.clientHeight - 80;
            renderer.setSize(nW, nH); camera.aspect = nW / nH; camera.updateProjectionMatrix();
        });
        resizeObs.observe(canvas.parentElement);
        _threeCtx = { renderer, resizeObs };
    }


    // ─────────────────────────────────────────────────────────
    // Sticker viewer
    // ─────────────────────────────────────────────────────────

    function _buildStickerViewer(sticker) {
        const right = document.getElementById('invRight');
        if (!right) return;
        right.innerHTML = `
            <div class="inv-viewer-label">${_escHtml(sticker.name)}</div>
            <div class="inv-viewer-sub">${_escHtml(sticker.description || '')}</div>
            <canvas id="invStickerCanvas" style="display:block;width:100%;flex:1;min-height:0"></canvas>
            <div class="inv-viewer-hint">drag to rotate · scroll to zoom</div>
        `;
        requestAnimationFrame(() => _initStickerViewer(sticker));
    }

    function _initStickerViewer(sticker) {
        const canvas = document.getElementById('invStickerCanvas');
        if (!canvas || typeof THREE === 'undefined') return;

        const W = canvas.parentElement.clientWidth  || 400;
        const H = (canvas.parentElement.clientHeight - 80) || 400;
        canvas.width = W; canvas.height = H;

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 100);
        camera.position.set(0, 0, 2.5);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);

        const group = new THREE.Group();
        scene.add(group);
        new THREE.TextureLoader().load(`/images/stickers/${sticker.slug}.png`, tex => {
            tex.premultiplyAlpha = false;
            const aspect = tex.image.height / tex.image.width;
            group.add(new THREE.Mesh(
                new THREE.PlaneGeometry(1.0, 1.0 * aspect),
                new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01 })
            ));
        });

        let rotX = 0, rotY = 0.3, tRX = 0, tRY = 0.3, isDragging = false, lastX = 0, lastY = 0;
        let zoom = 2.5, tZoom = 2.5;
        canvas.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
        window.addEventListener('mousemove', e => {
            if (!isDragging || !document.getElementById('invStickerCanvas')) return;
            tRY += (e.clientX - lastX) * 0.012; tRX += (e.clientY - lastY) * 0.012;
            lastX = e.clientX; lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => { isDragging = false; });
        canvas.addEventListener('wheel', e => {
            e.preventDefault(); e.stopPropagation();
            tZoom = Math.max(1.2, Math.min(5, tZoom + e.deltaY * 0.003));
        }, { passive: false });

        function animate() {
            if (!document.getElementById('invStickerCanvas')) return;
            _animFrameId = requestAnimationFrame(animate);
            rotX += (tRX - rotX) * 0.1; rotY += (tRY - rotY) * 0.1; zoom += (tZoom - zoom) * 0.1;
            group.rotation.x = rotX; group.rotation.y = rotY; camera.position.z = zoom;
            if (!isDragging) tRY += 0.004;
            renderer.render(scene, camera);
        }
        animate();

        const resizeObs = new ResizeObserver(() => {
            const nW = canvas.parentElement.clientWidth;
            const nH = canvas.parentElement.clientHeight - 80;
            renderer.setSize(nW, nH); camera.aspect = nW / nH; camera.updateProjectionMatrix();
        });
        resizeObs.observe(canvas.parentElement);
        _threeCtx = { renderer, resizeObs };
    }


    // ─────────────────────────────────────────────────────────
    // Black hole (locked items)
    // ─────────────────────────────────────────────────────────

    function _buildBlackHole() {
        const right = document.getElementById('invRight');
        if (!right) return;
        right.innerHTML = `
            <canvas id="invBlackHole" class="inv-blackhole-canvas" style="background:#0a080e"></canvas>
            <div class="inv-blackhole-label">DATA CORRUPTED</div>
        `;
        requestAnimationFrame(_initBlackHole);
    }

    function _initBlackHole() {
        const canvas = document.getElementById('invBlackHole');
        if (!canvas) return;
        const W = canvas.parentElement.clientWidth || 400;
        const H = canvas.parentElement.clientHeight || 600;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const cx = W / 2, cy = H / 2;
        let t = 0;

        function drawFrame() {
            if (!document.getElementById('invBlackHole')) return;
            ctx.fillStyle = 'rgba(10,8,14,0.18)'; ctx.fillRect(0, 0, W, H);
            const R = Math.min(W, H) * 0.38;

            for (let a = 0; a < 14; a++) {
                const base = (a / 14) * Math.PI * 2 + t * 0.4;
                ctx.beginPath(); ctx.moveTo(cx, cy);
                for (let s = 1; s <= 28; s++) {
                    const frac = s / 28, r = frac * R;
                    const spiral = base + frac * 3.5 + Math.sin(t * 1.8 + a + frac * 6) * 0.9;
                    const wobble = Math.sin(t * 3.1 + a * 2.3 + frac * 8) * R * 0.18 * frac;
                    ctx.lineTo(cx + Math.cos(spiral) * (r + wobble), cy + Math.sin(spiral) * (r + wobble));
                }
                ctx.strokeStyle = `hsla(${(t*40+a*26)%360},80%,65%,${0.35+0.3*Math.sin(t*2+a)})`;
                ctx.lineWidth = 1.5 + Math.sin(t + a) * 0.8; ctx.stroke();
            }

            for (let r = 0; r < 22; r++) {
                const radius = (r / 22) * R * 1.1, wobble = Math.sin(t*2.2+r*0.9)*18*(r/22);
                ctx.beginPath();
                for (let s = 0; s <= 120; s++) {
                    const angle = (s / 120) * Math.PI * 2;
                    const d = radius + wobble*Math.sin(angle*4+t*2.5) + wobble*0.5*Math.cos(angle*7-t*1.8) + wobble*0.25*Math.sin(angle*11+t*3.3);
                    s === 0 ? ctx.moveTo(cx+Math.cos(angle)*d, cy+Math.sin(angle)*d) : ctx.lineTo(cx+Math.cos(angle)*d, cy+Math.sin(angle)*d);
                }
                ctx.closePath();
                ctx.strokeStyle = `hsla(${(t*60+r*16+200)%360},70%,60%,${0.06+(1-r/22)*0.28})`;
                ctx.lineWidth = 0.8+(1-r/22)*2; ctx.stroke();
            }

            if (Math.random() < 0.4) {
                const gy = Math.random()*H, gh = 1+Math.random()*6, gx = (Math.random()-0.5)*30;
                ctx.save(); ctx.drawImage(canvas,gx,gy,W,gh,0,gy,W,gh); ctx.restore();
            }

            for (let p = 0; p < 60; p++) {
                const seed = p*137.508, angle = seed+t*(0.4+(p%5)*0.12);
                const frac = ((seed*0.01+t*0.15*(1+(p%3)*0.3))%1), r = R*1.3*(1-frac);
                ctx.beginPath(); ctx.arc(cx+Math.cos(angle)*r, cy+Math.sin(angle)*r, (1-frac)*3, 0, Math.PI*2);
                ctx.fillStyle = `hsla(${(p*23+t*80)%360},90%,75%,${frac*0.9})`; ctx.fill();
            }

            const voidR = R*0.18+Math.sin(t*2.8)*R*0.03;
            const grad  = ctx.createRadialGradient(cx,cy,0,cx,cy,voidR*3.5);
            grad.addColorStop(0,'rgba(0,0,0,1)'); grad.addColorStop(0.35,'rgba(0,0,0,0.97)');
            grad.addColorStop(0.7,'rgba(0,0,0,0.5)'); grad.addColorStop(1,'rgba(0,0,0,0)');
            ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(cx,cy,voidR*3.5,0,Math.PI*2); ctx.fill();

            const glowHue = (t*50+260)%360;
            const gg = ctx.createRadialGradient(cx,cy,voidR*0.8,cx,cy,voidR*1.6);
            gg.addColorStop(0,`hsla(${glowHue},100%,70%,0.9)`);
            gg.addColorStop(0.5,`hsla(${glowHue+30},100%,60%,0.3)`);
            gg.addColorStop(1,'rgba(0,0,0,0)');
            ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(cx,cy,voidR*1.6,0,Math.PI*2); ctx.fill();

            t += 0.028;
            _animFrameId = requestAnimationFrame(drawFrame);
        }
        drawFrame();
    }


    // ─────────────────────────────────────────────────────────
    // Teardown
    // ─────────────────────────────────────────────────────────

    function _teardownViewer() {
        if (_animFrameId !== null) { cancelAnimationFrame(_animFrameId); _animFrameId = null; }
        if (_threeCtx) { _threeCtx.renderer.dispose(); _threeCtx.resizeObs.disconnect(); _threeCtx = null; }
    }

    function _teardown() {
        _teardownViewer();
        if (_wheelRafId !== null) { cancelAnimationFrame(_wheelRafId); _wheelRafId = null; }
        clearTimeout(_viewerDebounce);
        clearTimeout(_scrollTimer);
    }


    // ─────────────────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────────────────

    function _escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _makeRedacted(len) {
        const chars = '?????????????????????????????????░▒▓';
        let out = '';
        for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
        return out;
    }


    // ─────────────────────────────────────────────────────────
    // Public exports
    // ─────────────────────────────────────────────────────────

    function invalidateCardCache() {
        if (_cardTexUrl) { URL.revokeObjectURL(_cardTexUrl); _cardTexUrl = null; }
    }

    return { open, close, invalidateCardCache, getCardTexUrl: () => _cardTexUrl };

})();

/* ── Global shim for HTML onclick ── */
function openInventory() { Inventory.open(); }
