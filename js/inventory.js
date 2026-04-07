/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   inventory.js  —  INVENTORY OVERLAY + 3D VIEWER

   Full-screen overlay triggered by the INVENTORY button on the
   globe screen. Only shown when the player is logged in.

   LAYOUT:
     Left panel  — vertical scrollable list of all catalogue items.
                   Owned items show their name; locked items show
                   long ??? strings and a distorted right panel.
     Right panel — owned: 3D interactive viewer (Three.js)
                   locked: procedural warped geometry (black hole)

   INTERACTION (3D viewer):
     Drag        — spin the card on X/Y axes
     Scroll      — zoom in / out
     Double-tap  — reset to default orientation

   DEPENDENCIES:
     Three.js r128 (loaded from CDN in index.html — must be present)
     config.js, utils.js, arg.js (for CONFIG.apiBase)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Inventory = (() => {

    // ─────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────

    let _isOpen        = false;
    let _items         = [];
    let _selectedIndex = 0;
    let _threeCtx      = null;
    let _animFrameId   = null;
    let _blackHoleCtx  = null;
    let _cardTexUrl    = null;
    let _activeTab     = 'items';    // 'items' | 'stickers'
    let _stickers      = [];         // owned stickers from /stickers


    // ─────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────

    function open() {
        if (_isOpen) return;
        _isOpen = true;
        SFX.positive();
        // Pre-fetch the card PNG immediately so the texture is ready (or nearly
        // ready) by the time _initThree runs. Result is cached in _cardTexUrl.
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
        // Revoke the cached texture blob URL so memory is freed.
        // We keep _cardTexUrl non-null as a signal that it was cached —
        // set to null only when the card changes (e.g. after customization).
        _teardown();

        const overlay = document.getElementById('inventoryOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        }
    }


    // ─────────────────────────────────────────────────────────
    // Fetch inventory from server and build the UI
    // ─────────────────────────────────────────────────────────

    async function _fetchAndRender() {
        _buildShell();

        // Fetch items and stickers in parallel
        try {
            const [invRes, stickerRes] = await Promise.all([
                fetch(`${CONFIG.apiBase}/inventory`,  { credentials: 'include' }),
                fetch(`${CONFIG.apiBase}/stickers`,   { credentials: 'include' }),
            ]);
            const invData     = invRes.ok     ? await invRes.json()     : {};
            const stickerData = stickerRes.ok ? await stickerRes.json() : {};
            _items    = invData.items       || [];
            _stickers = stickerData.stickers || [];
        } catch (err) {
            console.error('[Inventory] Failed to fetch:', err);
            _items = []; _stickers = [];
        }

        // Pad the list with phantom locked slots — filter OUT stickers, they go in the stickers tab
        const MIN_SLOTS = 12;
        const nonStickerItems = _items.filter(i => i.item_type !== 'sticker' || !i.id);
        _items = nonStickerItems;
        while (_items.length < MIN_SLOTS) {
            _items.push({
                id:          null,
                slug:        null,
                name:        null,   // null = generate ??? string in renderer
                description: null,
                item_type:   null,
                asset_key:   null,
                sort_order:  _items.length,
                owned:       false,
                awarded_at:  null,
                awarded_by:  null,
                _phantom:    true,   // flag so we never try to select/load these
            });
        }

        _renderList();

        // Auto-select the first owned item, or index 0 if none
        const firstOwned = _items.findIndex(i => i.owned);
        _selectedIndex   = firstOwned >= 0 ? firstOwned : 0;
        _selectItem(_selectedIndex);

        // Fade in
        requestAnimationFrame(() => requestAnimationFrame(() => {
            document.getElementById('inventoryOverlay')?.classList.add('visible');
        }));
    }


    // ─────────────────────────────────────────────────────────
    // Build the static HTML shell
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
                    <button class="inv-tab inv-tab-active" id="invTabItems" onmouseenter="SFX.hover()">ITEMS</button>
                    <button class="inv-tab" id="invTabStickers" onmouseenter="SFX.hover()">STICKERS</button>
                </div>
                <div class="inv-list" id="invList">
                    <div class="inv-loading">—</div>
                </div>
            </div>
            <div class="inv-right" id="invRight">
                <!-- 3D viewer or black hole canvas rendered here -->
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('invCloseBtn').addEventListener('click', close);

        // Tab switching
        document.getElementById('invTabItems').addEventListener('click', () => _switchTab('items'));
        document.getElementById('invTabStickers').addEventListener('click', () => _switchTab('stickers'));

        // Keyboard navigation
        overlay.addEventListener('keydown', _onKeydown);
        overlay.setAttribute('tabindex', '-1');
        overlay.focus();

        // Scroll wheel — infinite looping navigation
        let _scrollAccum = 0;
        overlay.addEventListener('wheel', (e) => {
            e.preventDefault();
            _scrollAccum += e.deltaY;
            const threshold = 60;
            while (_scrollAccum > threshold) {
                _scrollAccum -= threshold;
                const next = (_selectedIndex + 1) % _items.length;
                SFX.hover();
                _selectItem(next);
            }
            while (_scrollAccum < -threshold) {
                _scrollAccum += threshold;
                const prev = (_selectedIndex - 1 + _items.length) % _items.length;
                SFX.hover();
                _selectItem(prev);
            }
        }, { passive: false });
    }


    // ─────────────────────────────────────────────────────────
    // Render the item list
    // ─────────────────────────────────────────────────────────

    function _renderList() {
        const list = document.getElementById('invList');
        if (!list) return;
        list.innerHTML = '';

        if (_items.length === 0) {
            list.innerHTML = '<div class="inv-empty">NO DATA</div>';
            return;
        }

        _items.forEach((item, index) => {
            const row = document.createElement('div');
            row.className   = 'inv-row' + (item.owned ? ' inv-row-owned' : ' inv-row-locked');
            row.dataset.idx = index;

            if (item.owned) {
                row.innerHTML = `
                    <span class="inv-row-index">${String(index + 1).padStart(2, '0')}</span>
                    <span class="inv-row-name">${_escHtml(item.name)}</span>
                    <span class="inv-row-type">${_escHtml(item.item_type)}</span>
                `;
            } else {
                const nameLen = 14 + ((index * 7 + 3) % 22);
                const typeLen = 4  + ((index * 3 + 1) % 8);
                row.innerHTML = `
                    <span class="inv-row-index">${String(index + 1).padStart(2, '0')}</span>
                    <span class="inv-row-name inv-row-redacted">${_makeRedacted(nameLen)}</span>
                    <span class="inv-row-type inv-row-redacted">${_makeRedacted(typeLen)}</span>
                `;
            }

            // Every row is clickable
            row.addEventListener('click', () => _selectItem(index));
            row.addEventListener('mouseenter', () => SFX.hover());
            list.appendChild(row);
        });
    }

    // Apply DDR-style wheel transforms based on distance from active row
    function _updateWheelTransforms() {
        document.querySelectorAll('.inv-row').forEach((row, i) => {
            const dist    = Math.abs(i - _selectedIndex);
            const scale   = Math.max(0.72, 1 - dist * 0.08);
            const opacity = Math.max(0.18, 1 - dist * 0.22);
            if (i === _selectedIndex) {
                row.style.transform = '';
                row.style.opacity   = '1';
            } else {
                row.style.transform = `scale(${scale})`;
                row.style.opacity   = String(opacity);
            }
        });
    }


    // ─────────────────────────────────────────────────────────
    // Select an item row and update the right panel
    // ─────────────────────────────────────────────────────────

    function _selectItem(index) {
        _selectedIndex = index;

        // Highlight the active row
        document.querySelectorAll('.inv-row').forEach((row, i) => {
            row.classList.toggle('inv-row-active', i === index);
        });

        // Update DDR wheel transforms
        _updateWheelTransforms();

        // Scroll so the active row is centred in the list panel
        const list      = document.getElementById('invList');
        const activeRow = document.querySelector('.inv-row-active');
        if (list && activeRow) {
            const listMid = list.clientHeight / 2;
            const rowMid  = activeRow.offsetTop + activeRow.offsetHeight / 2;
            list.scrollTo({ top: rowMid - listMid, behavior: 'smooth' });
        }

        // Tear down any previous right-panel content
        _teardownViewer();

        const item = _items[index];
        if (!item) return;

        if (item.owned) {
            _buildViewer(item);
        } else {
            _buildBlackHole();
        }
    }


    // ─────────────────────────────────────────────────────────
    // 3D CARD VIEWER  (Three.js)
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

        // Wait one frame so the canvas is in the DOM and has dimensions
        requestAnimationFrame(() => _initThree(item));
    }

    function _initThree(item) {
        const canvas = document.getElementById('invCanvas');
        if (!canvas || typeof THREE === 'undefined') {
            console.warn('[Inventory] Three.js not available');
            return;
        }

        const W = canvas.parentElement.clientWidth;
        const H = canvas.parentElement.clientHeight - 80;
        canvas.width  = W;
        canvas.height = H;

        // ── Scene setup ──
        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 100);
        camera.position.set(0, 0, 3.2);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);

        // ── Lighting — three-point setup for a nice card reveal ──
        const ambient = new THREE.AmbientLight(0xffffff, 0.85);
        scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
        keyLight.position.set(1.5, 2.5, 3);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-2, -1, 1.5);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
        rimLight.position.set(0, 0, -3);
        scene.add(rimLight);

        // ── Rounded card geometry ──
        // Built from a Shape + ExtrudeGeometry so we get proper rounded corners.
        // Real card: 560 × 860px → aspect 0.651. We model at 1.0 × 1.535.
        const CARD_W  = 1.0;
        const CARD_H  = 1.535;
        const CARD_D  = 0.022;   // thickness
        const RADIUS  = 0.06;    // corner radius — matches the card template rx="5"

        function makeRoundedRect(w, h, r) {
            const shape = new THREE.Shape();
            const hw = w / 2, hh = h / 2;
            shape.moveTo(-hw + r, -hh);
            shape.lineTo( hw - r, -hh);
            shape.quadraticCurveTo( hw, -hh,  hw, -hh + r);
            shape.lineTo( hw,  hh - r);
            shape.quadraticCurveTo( hw,  hh,  hw - r,  hh);
            shape.lineTo(-hw + r,  hh);
            shape.quadraticCurveTo(-hw,  hh, -hw,  hh - r);
            shape.lineTo(-hw, -hh + r);
            shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
            return shape;
        }

        const cardShape   = makeRoundedRect(CARD_W, CARD_H, RADIUS);
        const extrudeOpts = {
            depth:            CARD_D,
            bevelEnabled:     true,
            bevelThickness:   0.006,
            bevelSize:        0.006,
            bevelSegments:    4,
            curveSegments:    12,
        };
        const cardGeo = new THREE.ExtrudeGeometry(cardShape, extrudeOpts);

        // Centre the geometry on its own origin (ExtrudeGeometry extrudes along +Z
        // starting at Z=0, so shift back by half the depth)
        cardGeo.center();

        // ── UV mapping for the front face ──
        // ExtrudeGeometry doesn't produce nice UVs for the flat faces automatically,
        // so we compute them from position — maps the front face to [0,1]² texture space.
        const pos = cardGeo.attributes.position;
        const uv  = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
            uv[i * 2]     =       (pos.getX(i) + CARD_W / 2) / CARD_W;
            // Flip V so the texture is right-side-up on the ExtrudeGeometry face.
            // Three.js UV origin is bottom-left; the card PNG origin is top-left.
            uv[i * 2 + 1] = 1.0 - (pos.getY(i) + CARD_H / 2) / CARD_H;
        }
        cardGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        cardGeo.computeVertexNormals();

        // ── Materials ──
        // ExtrudeGeometry assigns materialIndex 0 to the front/back flat faces,
        // and materialIndex 1 to the extruded side/edge faces.
        const loader = new THREE.TextureLoader();

        const frontMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,  // neutral — texture colors are used as-is
            side:  THREE.FrontSide,
        });

        // Fetch card texture — use cached blob URL if available, otherwise
        // re-fetch. flipY=true (Three.js default) + rotating the card 180°
        // on X corrects the upside-down orientation from ExtrudeGeometry.
        const texUrl = _cardTexUrl || `${CONFIG.apiBase}/card/download?t=${Date.now()}`;
        loader.load(
            texUrl,
            (texture) => {
                texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                texture.flipY      = false;
                frontMat.map         = texture;
                frontMat.needsUpdate = true;
                // Cache the URL for next time
                if (!_cardTexUrl && texUrl !== _cardTexUrl) _cardTexUrl = texUrl;
            },
            undefined,
            (err) => console.warn('[Inventory] Card texture failed:', err)
        );

        // Edge/side material — dark, slightly reflective like a real card edge
        const edgeMat = new THREE.MeshStandardMaterial({
            color:     0x1a1a18,
            roughness: 0.55,
            metalness: 0.1,
        });

        // ExtrudeGeometry: index 0 = flat faces (front+back), index 1 = sides
        const card = new THREE.Mesh(cardGeo, [frontMat, edgeMat]);
        // No base rotation needed — UV V is flipped in the geometry above
        scene.add(card);

        // ── Interaction state ──
        let isDragging   = false;
        let lastX        = 0;
        let lastY        = 0;
        let rotX         = -0.1;   // slight initial tilt
        let rotY         = 0.25;  // slight initial angle
        let targetRotX   = rotX;
        let targetRotY   = rotY;
        let zoom         = 3.2;
        let targetZoom   = zoom;

        // Drag — rotate
        canvas.addEventListener('mousedown', e => {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        });
        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            targetRotY += dx * 0.012;
            targetRotX += dy * 0.012;
            // Clamp vertical rotation so the card can't fully flip
            targetRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotX));
            lastX = e.clientX;
            lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => { isDragging = false; });

        // Scroll — zoom
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            targetZoom += e.deltaY * 0.003;
            targetZoom  = Math.max(1.4, Math.min(5.0, targetZoom));
        }, { passive: false });

        // Double-click — reset
        canvas.addEventListener('dblclick', () => {
            targetRotX = -0.1;
            targetRotY = 0.25;
            targetZoom = 3.2;
        });

        // Touch support — single finger drag, pinch zoom
        let lastTouchDist = null;
        canvas.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                isDragging = true;
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            }
            if (e.touches.length === 2) {
                isDragging = false;
                lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 1 && isDragging) {
                const dx = e.touches[0].clientX - lastX;
                const dy = e.touches[0].clientY - lastY;
                targetRotY += dx * 0.012;
                targetRotX += dy * 0.012;
                targetRotX  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotX));
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            }
            if (e.touches.length === 2 && lastTouchDist !== null) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                targetZoom -= (dist - lastTouchDist) * 0.01;
                targetZoom  = Math.max(1.4, Math.min(5.0, targetZoom));
                lastTouchDist = dist;
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            isDragging = false;
            lastTouchDist = null;
        });

        // ── Render loop ──
        function animate() {
            _animFrameId = requestAnimationFrame(animate);

            // Smooth lerp toward target rotation and zoom
            rotX  += (targetRotX - rotX)  * 0.1;
            rotY  += (targetRotY - rotY)  * 0.1;
            zoom  += (targetZoom - zoom)  * 0.1;

            card.rotation.x    = rotX;
            card.rotation.y    = rotY;
            camera.position.z  = zoom;

            // Gentle idle drift when not dragging
            if (!isDragging) {
                targetRotY += 0.002;
            }

            renderer.render(scene, camera);
        }

        animate();

        // ── Resize handler ──
        const resizeObs = new ResizeObserver(() => {
            const nW = canvas.parentElement.clientWidth;
            const nH = canvas.parentElement.clientHeight - 80;
            renderer.setSize(nW, nH);
            camera.aspect = nW / nH;
            camera.updateProjectionMatrix();
        });
        resizeObs.observe(canvas.parentElement);

        // Store context for teardown
        _threeCtx = { renderer, resizeObs };
    }


    // ─────────────────────────────────────────────────────────
    // Tab switching
    // ─────────────────────────────────────────────────────────

    function _switchTab(tab) {
        _activeTab = tab;
        SFX.hover();

        document.getElementById('invTabItems')?.classList.toggle('inv-tab-active', tab === 'items');
        document.getElementById('invTabStickers')?.classList.toggle('inv-tab-active', tab === 'stickers');

        _teardownViewer();

        if (tab === 'items') {
            _renderList();
            _selectItem(_selectedIndex);
        } else {
            _renderStickerList();
        }
    }

    // ── Render sticker list in left panel ──
    function _renderStickerList() {
        const list = document.getElementById('invList');
        if (!list) return;
        list.innerHTML = '';

        if (_stickers.length === 0) {
            list.innerHTML = '<div class="inv-empty">NO STICKERS OWNED</div>';
            _buildBlackHole();
            return;
        }

        _stickers.forEach((s, index) => {
            const row = document.createElement('div');
            row.className = 'inv-row inv-row-owned';
            row.innerHTML = `
                <span class="inv-row-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="inv-row-name">${s.name}</span>
                <span class="inv-row-type">STICKER</span>
            `;
            row.addEventListener('click', () => {
                document.querySelectorAll('.inv-row').forEach((r, i) => {
                    r.classList.toggle('inv-row-active', i === index);
                });
                _updateWheelTransforms();
                _buildStickerViewer(s);
                SFX.hover();
            });
            row.addEventListener('mouseenter', () => SFX.hover());
            list.appendChild(row);
        });

        // Auto-select first
        list.firstElementChild?.classList.add('inv-row-active');
        if (_stickers[0]) _buildStickerViewer(_stickers[0]);
    }

    // ── 3D sticker viewer — spinnable enlarged sticker ──
    function _buildStickerViewer(sticker) {
        const right = document.getElementById('invRight');
        if (!right) return;

        right.innerHTML = `
            <div class="inv-viewer-label">${sticker.name}</div>
            <div class="inv-viewer-sub">${sticker.description || ''}</div>
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
        canvas.width  = W;
        canvas.height = H;

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 100);
        camera.position.set(0, 0, 2.5);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);

        const group = new THREE.Group();
        scene.add(group);

        new THREE.TextureLoader().load(`/images/stickers/${sticker.slug}.png`, (tex) => {
            tex.premultiplyAlpha = false;
            const aspect = tex.image.height / tex.image.width;
            // Fit within a 1.0 unit square — width=1.0, height scaled by aspect
            const w = 1.0, h = 1.0 * aspect;
            const geo  = new THREE.PlaneGeometry(w, h);
            const mat  = new THREE.MeshBasicMaterial({
                map: tex, transparent: true,
                side: THREE.DoubleSide, alphaTest: 0.01,
            });
            const mesh = new THREE.Mesh(geo, mat);
            group.add(mesh);
        });

        let rotX = 0, rotY = 0.3, tRX = 0, tRY = 0.3;
        let isDragging = false, lastX = 0, lastY = 0;
        let zoom = 2.5, tZoom = 2.5;

        canvas.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
        window.addEventListener('mousemove', e => {
            if (!isDragging || !document.getElementById('invStickerCanvas')) return;
            tRY += (e.clientX - lastX) * 0.012;
            tRX += (e.clientY - lastY) * 0.012;
            lastX = e.clientX; lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => { isDragging = false; });
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            tZoom = Math.max(1.2, Math.min(5, tZoom + e.deltaY * 0.003));
        }, { passive: false });

        function animate() {
            if (!document.getElementById('invStickerCanvas')) return;
            _animFrameId = requestAnimationFrame(animate);
            rotX += (tRX - rotX) * 0.1;
            rotY += (tRY - rotY) * 0.1;
            zoom += (tZoom - zoom) * 0.1;
            group.rotation.x = rotX;
            group.rotation.y = rotY;
            camera.position.z = zoom;
            if (!isDragging) tRY += 0.004;
            renderer.render(scene, camera);
        }
        animate();

        const resizeObs = new ResizeObserver(() => {
            const nW = canvas.parentElement.clientWidth;
            const nH = canvas.parentElement.clientHeight - 80;
            renderer.setSize(nW, nH);
            camera.aspect = nW / nH;
            camera.updateProjectionMatrix();
        });
        resizeObs.observe(canvas.parentElement);
        _threeCtx = { renderer, resizeObs };
    }


    // ─────────────────────────────────────────────────────────
    // BLACK HOLE PANEL  (locked items)
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

        const W = canvas.parentElement.clientWidth  || 400;
        const H = canvas.parentElement.clientHeight || 600;
        canvas.width  = W;
        canvas.height = H;

        const ctx = canvas.getContext('2d');
        _blackHoleCtx = ctx;

        const cx = W / 2;
        const cy = H / 2;
        let   t  = 0;

        function drawFrame() {
            if (!document.getElementById('invBlackHole')) return;

            // Smear previous frame for motion trail — key to the intensity
            ctx.fillStyle = 'rgba(10, 8, 14, 0.18)';
            ctx.fillRect(0, 0, W, H);

            const R = Math.min(W, H) * 0.38;

            // ── Writhing tentacle arms pulling into the void ──
            const armCount = 14;
            for (let a = 0; a < armCount; a++) {
                const baseAngle = (a / armCount) * Math.PI * 2 + t * 0.4;
                ctx.beginPath();
                let px = cx, py = cy;
                ctx.moveTo(px, py);
                const segments = 28;
                for (let s = 1; s <= segments; s++) {
                    const frac   = s / segments;
                    const r      = frac * R;
                    const spiral = baseAngle + frac * 3.5 + Math.sin(t * 1.8 + a + frac * 6) * 0.9;
                    const wobble = Math.sin(t * 3.1 + a * 2.3 + frac * 8) * R * 0.18 * frac;
                    px = cx + Math.cos(spiral) * (r + wobble);
                    py = cy + Math.sin(spiral) * (r + wobble);
                    ctx.lineTo(px, py);
                }
                const hue   = (t * 40 + a * 26) % 360;
                const alpha = 0.35 + 0.3 * Math.sin(t * 2 + a);
                ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${alpha})`;
                ctx.lineWidth   = 1.5 + Math.sin(t + a) * 0.8;
                ctx.stroke();
            }

            // ── Concentric distortion rings — fast and wobbly ──
            const ringCount = 22;
            for (let r = 0; r < ringCount; r++) {
                const radius = (r / ringCount) * R * 1.1;
                const wobble = Math.sin(t * 2.2 + r * 0.9) * 18 * (r / ringCount);
                const alpha  = 0.06 + (1 - r / ringCount) * 0.28;
                const hue    = (t * 60 + r * 16 + 200) % 360;

                ctx.beginPath();
                const steps = 120;
                for (let s = 0; s <= steps; s++) {
                    const angle = (s / steps) * Math.PI * 2;
                    const dist  = radius
                        + wobble * Math.sin(angle * 4 + t * 2.5)
                        + wobble * 0.5 * Math.cos(angle * 7 - t * 1.8)
                        + wobble * 0.25 * Math.sin(angle * 11 + t * 3.3);
                    const px = cx + Math.cos(angle) * dist;
                    const py = cy + Math.sin(angle) * dist;
                    s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;
                ctx.lineWidth   = 0.8 + (1 - r / ringCount) * 2;
                ctx.stroke();
            }

            // ── Glitch scan lines ──
            if (Math.random() < 0.4) {
                const glitchY = Math.random() * H;
                const glitchH = 1 + Math.random() * 6;
                const glitchX = (Math.random() - 0.5) * 30;
                ctx.save();
                ctx.drawImage(canvas, glitchX, glitchY, W, glitchH, 0, glitchY, W, glitchH);
                ctx.restore();
            }

            // ── Particle debris sucked inward ──
            const particleCount = 60;
            for (let p = 0; p < particleCount; p++) {
                const seed   = p * 137.508;
                const angle  = seed + t * (0.4 + (p % 5) * 0.12);
                const frac   = ((seed * 0.01 + t * 0.15 * (1 + (p % 3) * 0.3)) % 1);
                const r      = R * 1.3 * (1 - frac);  // spirals inward
                const px     = cx + Math.cos(angle) * r;
                const py     = cy + Math.sin(angle) * r;
                const size   = (1 - frac) * 3;
                const alpha  = frac * 0.9;
                const hue    = (p * 23 + t * 80) % 360;
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${hue}, 90%, 75%, ${alpha})`;
                ctx.fill();
            }

            // ── Central void — deep black singularity ──
            const voidR  = R * 0.18 + Math.sin(t * 2.8) * R * 0.03;
            const grad   = ctx.createRadialGradient(cx, cy, 0, cx, cy, voidR * 3.5);
            grad.addColorStop(0,    'rgba(0,0,0,1)');
            grad.addColorStop(0.35, 'rgba(0,0,0,0.97)');
            grad.addColorStop(0.7,  'rgba(0,0,0,0.5)');
            grad.addColorStop(1,    'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, voidR * 3.5, 0, Math.PI * 2);
            ctx.fill();

            // ── Event horizon glow ──
            const glowGrad = ctx.createRadialGradient(cx, cy, voidR * 0.8, cx, cy, voidR * 1.6);
            const glowHue  = (t * 50 + 260) % 360;
            glowGrad.addColorStop(0,   `hsla(${glowHue}, 100%, 70%, 0.9)`);
            glowGrad.addColorStop(0.5, `hsla(${glowHue + 30}, 100%, 60%, 0.3)`);
            glowGrad.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, voidR * 1.6, 0, Math.PI * 2);
            ctx.fill();

            t += 0.028;
            _animFrameId = requestAnimationFrame(drawFrame);
        }

        drawFrame();
    }


    // ─────────────────────────────────────────────────────────
    // Keyboard navigation
    // ─────────────────────────────────────────────────────────

    function _onKeydown(e) {
        if (e.key === 'Escape') { close(); return; }

        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            SFX.hover();
            _selectItem((_selectedIndex + 1) % _items.length);
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            SFX.hover();
            _selectItem((_selectedIndex - 1 + _items.length) % _items.length);
        }
    }


    // ─────────────────────────────────────────────────────────
    // Teardown helpers
    // ─────────────────────────────────────────────────────────

    function _teardownViewer() {
        // Cancel the running animation frame
        if (_animFrameId !== null) {
            cancelAnimationFrame(_animFrameId);
            _animFrameId = null;
        }

        // Dispose Three.js resources
        if (_threeCtx) {
            _threeCtx.renderer.dispose();
            _threeCtx.resizeObs.disconnect();
            _threeCtx = null;
        }

        _blackHoleCtx = null;
    }

    function _teardown() {
        _teardownViewer();
        document.removeEventListener('mouseup',   () => {});
        document.removeEventListener('mousemove', () => {});
    }


    // ─────────────────────────────────────────────────────────
    // Utility helpers
    // ─────────────────────────────────────────────────────────

    /** Escape HTML special characters to prevent XSS. */
    function _escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Generate a redacted-looking string of a given length.
     * Uses a mix of ? and block characters for an ARG aesthetic.
     */
    function _makeRedacted(len) {
        const chars = '?????????????????????????????????░▒▓';
        let out = '';
        for (let i = 0; i < len; i++) {
            out += chars[Math.floor(Math.random() * chars.length)];
        }
        return out;
    }


    // ─────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────

    // Called by CardEditor after a successful save so the 3D viewer
    // fetches a fresh card texture next time the inventory opens.
    function invalidateCardCache() {
        if (_cardTexUrl) {
            URL.revokeObjectURL(_cardTexUrl);
            _cardTexUrl = null;
        }
    }

    return { open, close, invalidateCardCache, getCardTexUrl: () => _cardTexUrl };

})();

/* ── Global shim for HTML onclick ── */
function openInventory() { Inventory.open(); }
