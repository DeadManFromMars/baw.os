/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   cardeditor.js  —  CARD CUSTOMIZATION EDITOR

   Allows logged-in players to customize their access card:
     Phase 1 (current): profile picture upload with circular crop UI
     Phase 2 (future):  sticker placement, drag & drop, persistence

   The editor is a full-screen overlay separate from the inventory.
   Changes are sent to the backend which regenerates the card PNG.
   The inventory texture cache is invalidated on save so the 3D
   viewer reflects the new card immediately.

   DEPENDENCIES:
     config.js, utils.js, sounds.js, inventory.js (_cardTexUrl reset)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CardEditor = (() => {

    let _isOpen = false;


    // ─────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────

    function open() {
        if (_isOpen) return;
        _isOpen = true;
        SFX.positive();
        _buildShell();
    }

    function close() {
        if (!_isOpen) return;
        _isOpen = false;
        SFX.negative();
        const overlay = document.getElementById('cardEditorOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        }
    }


    // ─────────────────────────────────────────────────────────
    // Build overlay shell
    // ─────────────────────────────────────────────────────────

    function _buildShell() {
        document.getElementById('cardEditorOverlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'cardEditorOverlay';
        overlay.innerHTML = `
            <div class="ced-header">
                <span class="ced-header-label">CARD EDITOR</span>
                <button class="ced-close-btn" id="cedCloseBtn" onmouseenter="SFX.hover()">✕</button>
            </div>
            <div class="ced-body">

                <!-- LEFT: avatar panel -->
                <div class="ced-avatar-panel">
                    <div class="ced-section-label">PROFILE PICTURE</div>
                    <div class="ced-section-sub">Drag to reposition, scroll to scale.</div>
                    <div class="ced-crop-area" id="cedCropArea">
                        <div class="ced-crop-placeholder" id="cedCropPlaceholder">
                            <span class="ced-crop-placeholder-text">click to upload</span>
                        </div>
                    </div>
                    <input type="file" id="cedAvatarFile" accept="image/*" style="display:none">
                    <div class="ced-actions">
                        <button class="ced-action-btn" id="cedUploadBtn" onmouseenter="SFX.hover()">UPLOAD</button>
                        <button class="ced-action-btn ced-action-btn-primary" id="cedSaveBtn" onmouseenter="SFX.hover()">SAVE →</button>
                    </div>
                    <div class="ced-msg" id="cedMsg"></div>
                </div>

                <!-- CENTER: card + sticker bar below -->
                <div class="ced-center-panel">
                    <div class="ced-sticker-header">
                        <div class="ced-section-sub">Select a sticker · stamp onto card · click again to deselect</div>
                        <button class="ced-action-btn" id="cedClearStickersBtn" onmouseenter="SFX.hover()">CLEAR ALL</button>
                    </div>

                    <div class="ced-card-preview-wrap" id="cedCardWrap">
                        <canvas id="cedCardCanvas"></canvas>
                        <div class="ced-ghost" id="cedGhost"></div>
                    </div>

                    <!-- Horizontal sticker bar below card -->
                    <div class="ced-sticker-bar">
                        <div class="ced-sticker-tray" id="cedStickerTray">
                            <div class="ced-sticker-loading">LOADING…</div>
                        </div>
                    </div>

                    <!-- Save / Back / Download buttons -->
                    <div class="ced-bottom-actions">
                        <button class="ced-big-btn ced-big-btn-back" id="cedBackBtn" onmouseenter="SFX.hover()">← BACK</button>
                        <button class="ced-big-btn ced-big-btn-save" id="cedSaveStickersBtn" onmouseenter="SFX.hover()">SAVE CARD</button>
                        <a class="ced-big-btn ced-big-btn-download" id="cedDownloadBtn" href="${CONFIG.apiBase}/card/download" download="bawsome_card.png" onmouseenter="SFX.hover()">DOWNLOAD ↓</a>
                    </div>
                    <div class="ced-msg" id="cedStickerMsg"></div>
                </div>

                <!-- RIGHT: layers panel -->
                <div class="ced-layers-sidebar">
                    <div class="ced-sidebar-label">LAYERS</div>
                    <div class="ced-layers-panel" id="cedLayersPanel">
                        <div class="ced-sticker-loading">—</div>
                    </div>
                </div>

            </div>
        `;

        document.body.appendChild(overlay);

        // Wire close
        document.getElementById('cedCloseBtn').addEventListener('click', close);
        document.getElementById('cedBackBtn').addEventListener('click', close);

        // Wire avatar upload
        document.getElementById('cedUploadBtn').addEventListener('click', () => {
            document.getElementById('cedAvatarFile').click();
        });
        document.getElementById('cedCropPlaceholder').addEventListener('click', () => {
            document.getElementById('cedAvatarFile').click();
        });
        document.getElementById('cedAvatarFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) _initCropUI(file);
        });
        document.getElementById('cedSaveBtn').addEventListener('click', _save);

        // Wire sticker controls
        document.getElementById('cedClearStickersBtn').addEventListener('click', _clearStickers);
        document.getElementById('cedSaveStickersBtn').addEventListener('click', _saveStickers);

        // Escape key
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        overlay.setAttribute('tabindex', '-1');
        overlay.focus();

        // Fade in then init sticker panel — wait longer so canvas has real dimensions
        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.classList.add('visible');
            _loadStickers();
            // Give the overlay time to render at full size before initialising Three.js
            setTimeout(() => _initCardPreview(), 120);
        }));
    }


    // ─────────────────────────────────────────────────────────
    // Circular crop UI
    // ─────────────────────────────────────────────────────────

    // Crop state — image offset and scale within the circle
    let _cropState = { x: 0, y: 0, scale: 1.0, file: null, img: null };

    function _initCropUI(file) {
        _cropState.file = file;

        const url = URL.createObjectURL(file);
        const img  = new Image();
        img.onload = () => {
            _cropState.img   = img;
            _cropState.x     = 0;
            _cropState.y     = 0;
            _cropState.scale = 1.0;
            _renderCrop();
        };
        img.src = url;
    }

    function _renderCrop() {
        const area = document.getElementById('cedCropArea');
        if (!area || !_cropState.img) return;

        // Replace placeholder with a canvas crop editor
        area.innerHTML = `<canvas id="cedCropCanvas"></canvas>`;
        const canvas = document.getElementById('cedCropCanvas');

        const SIZE   = Math.min(area.clientWidth, area.clientHeight, 160);
        canvas.width  = SIZE;
        canvas.height = SIZE;

        _drawCrop(canvas);
        _bindCropInteraction(canvas);
    }

    function _drawCrop(canvas) {
        const ctx    = canvas.getContext('2d');
        const SIZE   = canvas.width;
        const RADIUS = SIZE / 2;
        const img    = _cropState.img;

        ctx.clearRect(0, 0, SIZE, SIZE);

        // Clip to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(RADIUS, RADIUS, RADIUS, 0, Math.PI * 2);
        ctx.clip();

        // Draw image with crop offset + scale
        const drawW = img.width  * _cropState.scale * (SIZE / Math.min(img.width, img.height));
        const drawH = img.height * _cropState.scale * (SIZE / Math.min(img.width, img.height));
        const drawX = RADIUS - drawW / 2 + _cropState.x;
        const drawY = RADIUS - drawH / 2 + _cropState.y;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);

        ctx.restore();

        // Circle border
        ctx.beginPath();
        ctx.arc(RADIUS, RADIUS, RADIUS - 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(26, 26, 24, 0.3)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
    }

    function _bindCropInteraction(canvas) {
        let dragging = false;
        let lastX = 0, lastY = 0;

        canvas.style.cursor = 'grab';

        canvas.addEventListener('mousedown', e => {
            dragging = true;
            lastX    = e.clientX;
            lastY    = e.clientY;
            canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', e => {
            if (!dragging) return;
            _cropState.x += e.clientX - lastX;
            _cropState.y += e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            _drawCrop(canvas);
        });

        window.addEventListener('mouseup', () => {
            dragging = false;
            canvas.style.cursor = 'grab';
        });

        // Scroll to scale
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            _cropState.scale = Math.max(0.2, Math.min(5.0, _cropState.scale - e.deltaY * 0.002));
            _drawCrop(canvas);
        }, { passive: false });

        // Touch drag
        let lastTouch = null;
        let lastPinchDist = null;

        canvas.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                dragging  = true;
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            if (e.touches.length === 2) {
                dragging      = false;
                lastPinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 1 && dragging && lastTouch) {
                _cropState.x += e.touches[0].clientX - lastTouch.x;
                _cropState.y += e.touches[0].clientY - lastTouch.y;
                lastTouch     = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                _drawCrop(canvas);
            }
            if (e.touches.length === 2 && lastPinchDist !== null) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                _cropState.scale = Math.max(0.2, Math.min(5.0, _cropState.scale + (dist - lastPinchDist) * 0.005));
                lastPinchDist    = dist;
                _drawCrop(canvas);
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            dragging      = false;
            lastTouch     = null;
            lastPinchDist = null;
        });
    }


    // ─────────────────────────────────────────────────────────
    // Save — POST to /profile/avatar with crop params
    // ─────────────────────────────────────────────────────────

    async function _save() {
        if (!_cropState.file) {
            _setMsg('Upload an image first.', 'error');
            return;
        }

        const saveBtn = document.getElementById('cedSaveBtn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '...'; }
        _setMsg('', '');

        const formData = new FormData();
        formData.append('avatar',      _cropState.file);
        formData.append('crop_x',      _cropState.x);
        formData.append('crop_y',      _cropState.y);
        formData.append('crop_scale',  _cropState.scale);

        try {
            const res  = await fetch(`${CONFIG.apiBase}/profile/avatar`, {
                method:      'POST',
                credentials: 'include',
                body:        formData,
            });
            const data = await res.json();

            if (res.ok) {
                SFX.positive();
                _setMsg('Card updated.', 'success');

                // Invalidate the inventory texture cache so the 3D viewer
                // loads the fresh card next time it opens.
                if (typeof Inventory !== 'undefined') {
                    Inventory.invalidateCardCache();
                }

                setTimeout(close, 1200);
            } else {
                _setMsg(data.error || 'Save failed.', 'error');
                SFX.negative();
            }
        } catch (err) {
            _setMsg('Connection error.', 'error');
            SFX.negative();
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'SAVE TO CARD →'; }
        }
    }

    function _setMsg(text, type) {
        const el = document.getElementById('cedMsg');
        if (!el) return;
        el.textContent = text;
        el.className   = 'ced-msg' + (type ? ` ced-msg-${type}` : '');
    }

    function _setStickerMsg(text, type) {
        const el = document.getElementById('cedStickerMsg');
        if (!el) return;
        el.textContent = text;
        el.className   = 'ced-msg' + (type ? ` ced-msg-${type}` : '');
    }


    // ─────────────────────────────────────────────────────────
    // STICKER SYSTEM
    // ─────────────────────────────────────────────────────────

    let _stickerLayout    = [];   // [ { slug, x_pct, y_pct, scale, rotation } ]
    let _selectedSticker  = null; // slug of active stamp
    let _stampThreeCtx    = null; // Three.js stamp model context
    let _stampAnimFrame   = null;
    let _mouseCardPos     = { x: 0, y: 0 }; // 0-1 fractions over canvas

    // ── Load stickers from backend ──
    async function _loadStickers() {
        try {
            const res  = await fetch(`${CONFIG.apiBase}/stickers`, { credentials: 'include' });
            const data = await res.json();
            _stickerLayout = data.layout || [];
            _renderStickerTray(data.stickers || []);
            // Poll until _stampThreeCtx is ready (set by _initCardPreview).
            // Gives up after 5 seconds to avoid polling forever if init fails.
            let _waitAttempts = 0;
            (function waitAndDraw() {
                if (_stampThreeCtx) {
                    _redrawCardOverlay();
                } else if (_waitAttempts++ < 50) {
                    setTimeout(waitAndDraw, 100);
                } else {
                    console.warn('[CardEditor] _stampThreeCtx never ready — sticker draw skipped.');
                }
            })();
        } catch (e) {
            document.getElementById('cedStickerTray').innerHTML =
                '<div class="ced-sticker-loading">FAILED TO LOAD</div>';
        }
    }

    // ── Render the sticker tray ──
    function _renderStickerTray(stickers) {
        const tray = document.getElementById('cedStickerTray');
        if (!tray) return;

        if (stickers.length === 0) {
            tray.innerHTML = '<div class="ced-sticker-loading">NO STICKERS OWNED YET</div>';
            return;
        }

        tray.innerHTML = '';
        stickers.forEach(s => {
            const btn = document.createElement('div');
            btn.className    = 'ced-sticker-btn';
            btn.dataset.slug = s.slug;
            btn.title        = s.name;
            const img = document.createElement('img');
            // Load from frontend static folder — no auth needed, instant
            img.src = `/images/stickers/${s.slug}.png`;
            img.alt = s.name;
            btn.appendChild(img);
            btn.addEventListener('click', () => _selectSticker(s.slug, btn));
            tray.appendChild(btn);
        });
    }

    // ── Select a sticker → enter stamp mode. Click same sticker again → deselect ──
    function _selectSticker(slug, btnEl) {
        if (_selectedSticker === slug) {
            // Deselect
            SFX.negative();
            _selectedSticker = null;
            document.querySelectorAll('.ced-sticker-btn').forEach(b => b.classList.remove('active'));
            const wrap = document.getElementById('cedCardWrap');
            if (wrap) wrap.classList.remove('stamp-mode');
            _hideGhost();
            const stamp = _stampThreeCtx?._stampGroup;
            if (stamp) stamp.visible = false;
            return;
        }

        SFX.positive();
        _selectedSticker = slug;

        // Highlight selected button
        document.querySelectorAll('.ced-sticker-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');

        // Enter stamp mode
        const wrap = document.getElementById('cedCardWrap');
        if (wrap) wrap.classList.add('stamp-mode');

        _updateGhost();
    }

    // ── Initialize card preview + Three.js stamp model ──
    function _initCardPreview() {
        const wrap   = document.getElementById('cedCardWrap');
        const canvas = document.getElementById('cedCardCanvas');
        if (!canvas || typeof THREE === 'undefined') return;

        const W = wrap.clientWidth  || 320;
        const H = wrap.clientHeight || 460;
        canvas.width  = W;
        canvas.height = H;

        // ── Three.js scene ──
        const scene    = new THREE.Scene();
        const camera   = new THREE.PerspectiveCamera(52, W / H, 0.01, 100);
        camera.position.set(0, 0, 2.5);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);

        // Lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        const key = new THREE.DirectionalLight(0xffffff, 0.9);
        key.position.set(1.5, 2.5, 3);
        scene.add(key);

        // Card geometry (same as inventory viewer)
        const CARD_W = 1.0, CARD_H = 1.535, CARD_D = 0.022, RADIUS = 0.06;
        function makeRoundedRect(w, h, r) {
            const shape = new THREE.Shape();
            const hw = w/2, hh = h/2;
            shape.moveTo(-hw+r,-hh); shape.lineTo(hw-r,-hh);
            shape.quadraticCurveTo(hw,-hh,hw,-hh+r); shape.lineTo(hw,hh-r);
            shape.quadraticCurveTo(hw,hh,hw-r,hh); shape.lineTo(-hw+r,hh);
            shape.quadraticCurveTo(-hw,hh,-hw,hh-r); shape.lineTo(-hw,-hh+r);
            shape.quadraticCurveTo(-hw,-hh,-hw+r,-hh);
            return shape;
        }
        const geo = new THREE.ExtrudeGeometry(makeRoundedRect(CARD_W, CARD_H, RADIUS), {
            depth: CARD_D, bevelEnabled: true,
            bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 4, curveSegments: 12,
        });
        geo.center();
        const pos = geo.attributes.position;
        const uv  = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
            uv[i*2]   =       (pos.getX(i) + CARD_W/2) / CARD_W;
            uv[i*2+1] = 1.0 - (pos.getY(i) + CARD_H/2) / CARD_H;
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.computeVertexNormals();

        const frontMat = new THREE.MeshBasicMaterial({ color: 0xaaff00, side: THREE.FrontSide });
        const edgeMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.55, metalness: 0.1 });
        const card     = new THREE.Mesh(geo, [frontMat, edgeMat]);
        scene.add(card);

        // Reuse inventory blob URL if available (avoids re-downloading + re-generating)
        // Fall back to /card/download — but serve cached PNG, no regen
        const texUrl = (typeof Inventory !== 'undefined' && Inventory.getCardTexUrl && Inventory.getCardTexUrl())
            ? Inventory.getCardTexUrl()
            : `${CONFIG.apiBase}/card/download?t=${Date.now()}`;

        const loader = new THREE.TextureLoader();
        loader.load(texUrl, (tex) => {
            tex.flipY        = false;
            tex.anisotropy   = renderer.capabilities.getMaxAnisotropy();
            card.material[0] = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
        });

        // ── Stamp model — handle UP (+Y), ink face DOWN (-Y) ──
        const stampGroup = new THREE.Group();

        const hMat   = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.65 });
        const cMat   = new THREE.MeshStandardMaterial({ color: 0x222220, roughness: 0.4 });
        const inkMat = new THREE.MeshStandardMaterial({ color: 0xe8372a, roughness: 0.15, metalness: 0.05 });
        const rMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.42, 16), hMat);
        handle.position.y = 0.28; stampGroup.add(handle);

        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 8), hMat);
        knob.position.y = 0.51; stampGroup.add(knob);

        const conn = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.07, 16), cMat);
        conn.position.y = 0.02; stampGroup.add(conn);

        // Ink tip — separate group so ONLY this squishes on impact
        const tipGroup = new THREE.Group();
        tipGroup.position.y = -0.04;
        stampGroup.add(tipGroup);

        const inkDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.025, 32), inkMat);
        tipGroup.add(inkDisc);

        const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 8, 32), rMat);
        rimMesh.rotation.x = Math.PI / 2;
        rimMesh.position.y = -0.015;
        tipGroup.add(rimMesh);

        // Resting pose — upper right of card face, angled toward viewer
        const D2R = Math.PI / 180;
        const STAMP_REST = { x: 0.38, y: 0.55, z: 0.55, rx: -50*D2R, ry: -19*D2R, rz: -23*D2R };
        const STAMP_LAND_ROT = { rx: 90*D2R, ry: 0, rz: 0 };

        stampGroup.visible = false;
        stampGroup.position.set(STAMP_REST.x, STAMP_REST.y, STAMP_REST.z);
        stampGroup.rotation.set(STAMP_REST.rx, STAMP_REST.ry, STAMP_REST.rz);
        scene.add(stampGroup);

        function _applySquish(s) {
            tipGroup.scale.set(1 + s*0.65, Math.max(0.08, 1 - s*0.85), 1 + s*0.65);
        }
        function _spring(t) { return Math.exp(-t*9) * Math.cos(t*20); }

        // ── Interaction state ──
        let rotX = -0.05, rotY = 0.0;
        let targetRotX = rotX, targetRotY = rotY;
        let isDragging = false, lastX = 0, lastY = 0;
        let stampAnim  = null; // null | { phase, t }

        // Card drag (only when not in stamp mode)
        canvas.addEventListener('mousedown', e => {
            if (_selectedSticker) return;
            isDragging = true; lastX = e.clientX; lastY = e.clientY;
        });
        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            targetRotY += (e.clientX - lastX) * 0.012;
            targetRotX += (e.clientY - lastY) * 0.012;
            targetRotX  = Math.max(-Math.PI/2, Math.min(Math.PI/2, targetRotX));
            lastX = e.clientX; lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => { isDragging = false; });

        // Ghost + stamp position tracking
        canvas.addEventListener('mousemove', e => {
            if (!_selectedSticker) return;
            const rect = canvas.getBoundingClientRect();
            _mouseCardPos.x = (e.clientX - rect.left)  / rect.width;
            _mouseCardPos.y = (e.clientY - rect.top)    / rect.height;
            _updateGhost();

            const worldX = (_mouseCardPos.x - 0.5) * CARD_W;
            const worldY = (0.5 - _mouseCardPos.y) * CARD_H;
            if (!stampAnim) {
                stampGroup.visible    = true;
                // Stamp hovers near the click position but offset up-right
                stampGroup.position.x = worldX + 0.25;
                stampGroup.position.y = worldY + 0.30;
                stampGroup.position.z = STAMP_REST.z;
                stampGroup.rotation.set(STAMP_REST.rx, STAMP_REST.ry, STAMP_REST.rz);
            }
            _updateGhost();
        });

        canvas.addEventListener('mouseleave', () => {
            if (_selectedSticker) {
                stampGroup.visible = false;
                _hideGhost();
            }
        });

        canvas.addEventListener('mouseenter', () => {
            if (_selectedSticker) stampGroup.visible = true;
        });

        // ── Stamp click → arc animation ──
        // Invisible hit plane — same size as card face, always faces camera
        // More reliable than raycasting the extruded card geometry
        const hitPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(CARD_W, CARD_H),
            new THREE.MeshBasicMaterial({ visible: false, side: THREE.FrontSide })
        );
        hitPlane.position.z = 0.012; // just above card front face
        card.add(hitPlane);

        const raycaster = new THREE.Raycaster();
        const mouse2d   = new THREE.Vector2();

        canvas.addEventListener('click', e => {
            if (!_selectedSticker) return;
            const rect = canvas.getBoundingClientRect();

            mouse2d.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
            mouse2d.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse2d, camera);
            const hits = raycaster.intersectObject(hitPlane, false);

            let x_pct, y_pct, worldX, worldY;
            if (hits.length > 0) {
                const local = hitPlane.worldToLocal(hits[0].point.clone());
                worldX = local.x;
                worldY = local.y;
                x_pct  = Math.max(0.05, Math.min(0.95, worldX / CARD_W + 0.5));
                y_pct  = Math.max(0.05, Math.min(0.95, 0.5 - worldY / CARD_H));
            } else {
                // Fallback: always place sticker from canvas coords
                // Map raw canvas position onto card face directly
                x_pct  = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
                y_pct  = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top)  / rect.height));
                worldX = (x_pct - 0.5) * CARD_W;
                worldY = (0.5 - y_pct) * CARD_H;
            }

            _stickerLayout.push({ slug: _selectedSticker, x_pct, y_pct, scale: 1.0, rotation: 0 });
            _addStickerMesh({ slug: _selectedSticker, x_pct, y_pct, scale: 1.0, rotation: 0 });
            _renderLayersPanel();
            _saveStickers(true);

            stampAnim = {
                phase: 'arc', t: 0,
                tx: worldX, ty: worldY, tz: 0.03,
                sx: stampGroup.position.x,
                sy: stampGroup.position.y,
                sz: stampGroup.position.z,
            };

            if (typeof SFX !== 'undefined' && SFX.stamp) SFX.stamp();
            else if (typeof SFX !== 'undefined') SFX.positive();
        });

        // ── Render loop ──
        function animate() {
            _stampAnimFrame = requestAnimationFrame(animate);

            const tgtX = _selectedSticker ? 0 : targetRotX;
            const tgtY = _selectedSticker ? 0 : targetRotY;
            rotX += (tgtX - rotX) * 0.12;
            rotY += (tgtY - rotY) * 0.12;
            card.rotation.x = rotX;
            card.rotation.y = rotY;

            // ── Stamp arc animation ──
            if (stampAnim) {
                stampAnim.t += 0.028;
                const p = Math.min(stampAnim.t, 1);

                if (stampAnim.phase === 'arc') {
                    const eIO = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
                    const eIn = p*p*p;
                    stampGroup.position.x = stampAnim.sx + (stampAnim.tx - stampAnim.sx) * eIO;
                    stampGroup.position.y = stampAnim.sy + (stampAnim.ty - stampAnim.sy) * eIO;
                    stampGroup.position.z = stampAnim.sz + (stampAnim.tz - stampAnim.sz) * eIn
                                           + Math.sin(p * Math.PI) * 1.2;
                    stampGroup.rotation.x = STAMP_REST.rx + (STAMP_LAND_ROT.rx - STAMP_REST.rx) * eIO;
                    stampGroup.rotation.y = STAMP_REST.ry + (STAMP_LAND_ROT.ry - STAMP_REST.ry) * eIO;
                    stampGroup.rotation.z = STAMP_REST.rz + (STAMP_LAND_ROT.rz - STAMP_REST.rz) * eIO;
                    _applySquish(0);
                    if (p >= 1) { stampAnim.phase = 'squish'; stampAnim.t = 0; }

                } else if (stampAnim.phase === 'squish') {
                    stampAnim.t += 0.03;
                    stampGroup.position.set(stampAnim.tx, stampAnim.ty, stampAnim.tz);
                    stampGroup.rotation.set(STAMP_LAND_ROT.rx, STAMP_LAND_ROT.ry, STAMP_LAND_ROT.rz);
                    const sq = Math.max(0, _spring(stampAnim.t));
                    _applySquish(sq);
                    if (stampAnim.t > 0.5) { stampAnim.phase = 'lift'; stampAnim.t = 0; _applySquish(0); }

                } else if (stampAnim.phase === 'lift') {
                    stampAnim.t += 0.025;
                    const lp = Math.min(stampAnim.t, 1);
                    const eOut = 1 - (1-lp)*(1-lp)*(1-lp);
                    stampGroup.position.x = stampAnim.tx + (STAMP_REST.x - stampAnim.tx) * eOut;
                    stampGroup.position.y = stampAnim.ty + (STAMP_REST.y - stampAnim.ty) * eOut;
                    stampGroup.position.z = stampAnim.tz + (STAMP_REST.z - stampAnim.tz) * eOut;
                    stampGroup.rotation.x = STAMP_LAND_ROT.rx + (STAMP_REST.rx - STAMP_LAND_ROT.rx) * eOut;
                    stampGroup.rotation.y = STAMP_LAND_ROT.ry + (STAMP_REST.ry - STAMP_LAND_ROT.ry) * eOut;
                    stampGroup.rotation.z = STAMP_LAND_ROT.rz + (STAMP_REST.rz - STAMP_LAND_ROT.rz) * eOut;
                    _applySquish(0);
                    if (lp >= 1) {
                        stampGroup.position.set(STAMP_REST.x, STAMP_REST.y, STAMP_REST.z);
                        stampGroup.rotation.set(STAMP_REST.rx, STAMP_REST.ry, STAMP_REST.rz);
                        stampAnim = null;
                    }
                }
            }

            renderer.render(scene, camera);
        }
        animate();

        _stampThreeCtx = { renderer, scene, card, stampGroup, _stampGroup: stampGroup };
        // Draw any already-placed stickers into the 3D scene
        _redrawCardOverlay();
    }

    // ── Ghost sticker overlay (shows where stamp will land) ──
    function _updateGhost() {
        const ghost = document.getElementById('cedGhost');
        const wrap  = document.getElementById('cedCardWrap');
        if (!ghost || !wrap || !_selectedSticker) return;

        ghost.style.display     = 'block';
        ghost.style.left        = `${_mouseCardPos.x * 100}%`;
        ghost.style.top         = `${_mouseCardPos.y * 100}%`;
        ghost.style.backgroundImage = `url(/images/stickers/${_selectedSticker}.png)`;
    }

    function _hideGhost() {
        const ghost = document.getElementById('cedGhost');
        if (ghost) ghost.style.display = 'none';
    }

    // Build a sticker group — flat plane, invisible until texture loads
    function _makeStickerGroup(slug, size, onReady) {
        const group = new THREE.Group();
        group.userData.isStickerMesh = true;

        new THREE.TextureLoader().load(
            `/images/stickers/${slug}.png`,
            (tex) => {
                tex.premultiplyAlpha = false;
                const aspect = tex.image.height / tex.image.width;
                const geo = new THREE.PlaneGeometry(size, size * aspect);
                const mat = new THREE.MeshBasicMaterial({
                    map:         tex,
                    transparent: true,
                    alphaTest:   0.01,
                    side:        THREE.FrontSide,
                    depthTest:   true,
                    depthWrite:  false,
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.renderOrder = 2;
                group.add(mesh);
                if (onReady) onReady(group);
            },
            undefined,
            (err) => console.error('[sticker] load failed:', slug, err)
        );

        return group;
    }

    function _redrawCardOverlay() {
        document.querySelectorAll('.ced-placed-sticker').forEach(el => el.remove());
        if (!_stampThreeCtx) return;
        const { card } = _stampThreeCtx;
        const old = card.children.filter(c => c.userData.isStickerMesh);
        old.forEach(m => { card.remove(m); });
        const CARD_W = 1.0, CARD_H = 1.535;
        _stickerLayout.forEach(s => {
            const size  = CARD_W * 0.09 * (s.scale || 1.0);
            const group = _makeStickerGroup(s.slug, size);
            group.position.set((s.x_pct - 0.5) * CARD_W, (0.5 - s.y_pct) * CARD_H, 0.02);
            group.rotation.z = -(s.rotation || 0) * Math.PI / 180;
            card.add(group);
        });
        _renderLayersPanel();
    }

    function _addStickerMesh(s) {
        if (!_stampThreeCtx) { console.warn('[sticker] no ctx'); return; }
        if (typeof THREE === 'undefined') return;
        const { card } = _stampThreeCtx;
        const CARD_W = 1.0, CARD_H = 1.535;
        const size  = CARD_W * 0.09 * (s.scale || 1.0);
        const group = _makeStickerGroup(s.slug, size, (g) => {
            // Bounce in once texture loads
            let t = 0;
            g.scale.set(1.6, 1.6, 1.6);
            (function bounce() {
                t += 0.07;
                const sc = Math.max(0.01, 1 + 0.6 * Math.exp(-t * 5) * Math.cos(t * 14));
                g.scale.set(sc, sc, sc);
                if (t < 1.5) requestAnimationFrame(bounce);
                else g.scale.set(1, 1, 1);
            })();
        });
        group.position.set((s.x_pct - 0.5) * CARD_W, (0.5 - s.y_pct) * CARD_H, 0.02);
        group.rotation.z = -(s.rotation || 0) * Math.PI / 180;
        card.add(group);
    }

    // ── Clear all stickers — wipes layout and saves to card ──
    async function _clearStickers() {
        _stickerLayout = [];
        _redrawCardOverlay();
        _renderLayersPanel();
        SFX.negative();
        // Immediately save empty layout so the card PNG is cleared too
        await _saveStickers(true);
    }

    // ── Layers panel — shows all placed stickers with delete ──
    function _renderLayersPanel() {
        const panel = document.getElementById('cedLayersPanel');
        if (!panel) return;

        if (_stickerLayout.length === 0) {
            panel.innerHTML = '<div class="ced-sticker-loading">NONE</div>';
            return;
        }

        panel.innerHTML = '';
        [..._stickerLayout].reverse().forEach((s, revIdx) => {
            const realIdx = _stickerLayout.length - 1 - revIdx;
            const row = document.createElement('div');
            row.className = 'ced-layer-row';
            row.title = s.slug.toUpperCase();

            const thumb = document.createElement('img');
            thumb.src = `/images/stickers/${s.slug}.png`;
            thumb.className = 'ced-layer-thumb';

            const del = document.createElement('button');
            del.className = 'ced-layer-del';
            del.textContent = '✕';
            del.title = 'Remove';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                SFX.negative();
                _stickerLayout.splice(realIdx, 1);
                _redrawCardOverlay();
            });

            row.appendChild(thumb);
            row.appendChild(del);
            panel.appendChild(row);
        });
    }

    // ── Save sticker layout ──
    async function _saveStickers(silent = false) {
        const btn = document.getElementById('cedSaveStickersBtn');
        if (!silent && btn) { btn.disabled = true; btn.textContent = '...'; }
        if (!silent) _setStickerMsg('', '');

        try {
            const res  = await fetch(`${CONFIG.apiBase}/profile/stickers`, {
                method:      'POST',
                credentials: 'include',
                headers:     { 'Content-Type': 'application/json' },
                body:        JSON.stringify({ layout: _stickerLayout }),
            });
            const data = await res.json();
            if (res.ok) {
                if (!silent) {
                    SFX.positive();
                    _setStickerMsg('Saved! Hit DOWNLOAD to get your card.', 'success');
                    if (typeof Inventory !== 'undefined') Inventory.invalidateCardCache();
                }  else {
                    if (typeof Inventory !== 'undefined') Inventory.invalidateCardCache();
                }
            } else {
                if (!silent) { _setStickerMsg(data.error || 'Save failed.', 'error'); SFX.negative(); }
                else { console.error('[sticker] silent save error:', data.error); }
            }
        } catch (e) {
            if (!silent) { _setStickerMsg('Connection error.', 'error'); SFX.negative(); }
            else { console.error('[sticker] silent save failed:', e); }
        } finally {
            if (!silent && btn) { btn.disabled = false; btn.textContent = 'SAVE STICKERS →'; }
        }
    }


    // ─────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────

    return { open, close };

})();
