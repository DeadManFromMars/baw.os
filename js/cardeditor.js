/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   cardeditor.js  —  CARD CUSTOMIZATION EDITOR

   Full-screen overlay where logged-in players customise their card:
     LEFT    profile picture upload + circular crop
     CENTER  3D card preview — stamp, select, move, resize, rotate stickers
     RIGHT   layer list of placed stickers

   NOTHING IS SAVED UNTIL "SAVE CARD" IS PRESSED.
     All edits live in local state (_layout, _avatar). Save sends
     them to the backend, which redraws the card PNG once. Closing
     with unsaved changes asks for a second press to discard.

   PREVIEW
     The card texture comes from /card/base — the card WITHOUT its
     baked-in stickers — and stickers are drawn live on top as 3D
     planes, so what you see is exactly what gets saved.

   CONTROLS  (act on the picked sticker, or the selected placed one)
     Click sticker in tray   pick it as a stamp (click again to drop)
     Click card              stamp it          Enter  (card focused)
     Scroll  /  + −          resize
     Q / E                   rotate            Shift = fine steps
     Arrow keys              move              Shift = bigger steps
     Click / drag placed     select / move it
     Delete / Backspace      remove selected
     Ctrl+Z                  undo              Ctrl+S  save
     Esc                     drop stamp → deselect → close

   LIFECYCLE
     Every listener is registered with one AbortController and the
     render loop + WebGL context are disposed on close, so opening
     the editor repeatedly doesn't leak memory or slow the page.

   DEPENDENCIES:
     config.js, utils.js, sounds.js, Three.js (r128),
     inventory.js (card cache reset), arg.js (card download)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CardEditor = (() => {

    /* ════════════════════════════════════════════════════════
       CONSTANTS
    ════════════════════════════════════════════════════════ */

    // Card + sticker geometry — must match card_gen.py so the
    // preview lines up with the PNG the backend draws.
    const CARD_W        = Utils.CARD_DIMS.w;
    const CARD_H        = Utils.CARD_DIMS.h;
    const STICKER_BASE  = 0.09;   // sticker width at scale 1, as a fraction of card width
    const STICKER_Z     = 0.02;   // stickers float just above the card face

    // Editing limits — mirrored in save_sticker_layout() in routes.py
    const STICKER_LIMITS = { minScale: 0.3, maxScale: 5.0, maxCount: 50 };

    // How far one key press / scroll notch changes things
    const STEP = {
        rotate:     15,     // degrees per Q/E
        rotateFine: 3,      // degrees per Q/E with Shift
        scale:      1.1,    // multiplier per scroll notch or +/-
        nudge:      0.01,   // card fraction per arrow key
        nudgeBig:   0.05,   // card fraction per arrow key with Shift
    };

    // Crop canvas size in px — crop offsets are sent to the backend in these units
    const CROP_SIZE = 160;

    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


    /* ════════════════════════════════════════════════════════
       STATE
    ════════════════════════════════════════════════════════ */

    let _isOpen          = false;
    let _abort           = null;    // AbortController — every listener hangs off its signal
    let _returnFocusEl   = null;    // focused element before opening, restored on close
    let _confirmingClose = false;   // true after the first Back press with unsaved changes
    let _saving          = false;

    let _owned       = [];          // stickers the player owns: [{ slug, name }]
    let _layout      = [];          // working sticker layout: [{ slug, x_pct, y_pct, scale, rotation }]
    let _savedLayout = '[]';        // JSON of the last saved layout — used for dirty checks
    let _history     = [];          // undo stack of layout JSON snapshots
    let _lastHistory = { tag: null, time: 0 };

    // The "stamp tool" — the sticker picked from the tray, waiting to be placed.
    // Its scale/rotation carry over between stamps so repeated stamps match.
    const _tool = {
        slug: null, scale: 1, rotation: 0, x_pct: 0.5, y_pct: 0.5,
        pointerOver: false,     // mouse is over the card
        canvasFocused: false,   // keyboard focus is on the card
    };

    let _selected = -1;             // index into _layout of the selected placed sticker, or -1

    // Profile picture being edited (only sent on save if dirty)
    const _avatar = { file: null, img: null, x: 0, y: 0, scale: 1, dirty: false };

    let _three = null;              // Three.js objects — see _initScene()
    const _assets = new Map();      // slug → { material, aspect } — loaded once per open


    /* ════════════════════════════════════════════════════════
       SMALL HELPERS
    ════════════════════════════════════════════════════════ */

    const _el    = id => document.getElementById(id);
    const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // addEventListener that is removed automatically when the editor closes
    function _on(target, type, handler, options = {}) {
        target.addEventListener(type, handler, { ...options, signal: _abort.signal });
    }

    // True while the editor session that started an async task is still open.
    // Guards against a slow fetch finishing after the editor was closed/reopened.
    function _alive(session) {
        return _isOpen && _abort === session;
    }

    function _nameOf(slug) {
        return _owned.find(s => s.slug === slug)?.name || slug.toUpperCase();
    }

    function _isLayoutDirty() {
        return JSON.stringify(_layout) !== _savedLayout;
    }

    function _isDirty() {
        return _avatar.dirty || _isLayoutDirty();
    }

    // Visible status line under the buttons (also read out by screen readers)
    function _setMsg(text, type = '') {
        const el = _el('cedMsg');
        if (!el) return;
        el.textContent = text;
        el.className   = 'ced-msg' + (type ? ` ced-msg-${type}` : '');
    }

    // Screen-reader-only announcement for things that happen on the canvas
    function _announce(text) {
        const el = _el('cedAnnounce');
        if (el) el.textContent = text;
    }


    /* ════════════════════════════════════════════════════════
       OPEN / CLOSE
    ════════════════════════════════════════════════════════ */

    function open() {
        if (_isOpen) return;
        _isOpen        = true;
        _returnFocusEl = document.activeElement;
        _abort         = new AbortController();
        _resetState();
        SFX.positive();
        _buildShell();
        _loadEditor(_abort);
    }

    function close(force = false) {
        if (!_isOpen) return;

        // First press with unsaved changes only warns
        if (!force && _isDirty() && !_confirmingClose) {
            _confirmingClose = true;
            _setMsg('You have unsaved changes — press Back again to discard them.', 'error');
            SFX.negative();
            return;
        }

        _isOpen = false;
        SFX.negative();
        _abort.abort();          // removes every listener registered with _on()
        _disposeScene();

        const overlay = _el('cardEditorOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            // Remove after the fade — a timeout is used rather than
            // transitionend, which doesn't fire when motion is reduced.
            setTimeout(() => overlay.remove(), 550);
        }
        _returnFocusEl?.focus?.();
    }

    function _resetState() {
        _owned = [];
        _layout = [];
        _savedLayout = '[]';
        _history = [];
        _lastHistory = { tag: null, time: 0 };
        _selected = -1;
        _confirmingClose = false;
        _saving = false;
        Object.assign(_tool,   { slug: null, x_pct: 0.5, y_pct: 0.5, pointerOver: false, canvasFocused: false });
        Object.assign(_avatar, { file: null, img: null, x: 0, y: 0, scale: 1, dirty: false });
    }


    /* ════════════════════════════════════════════════════════
       OVERLAY MARKUP + WIRING
    ════════════════════════════════════════════════════════ */

    function _buildShell() {
        _el('cardEditorOverlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'cardEditorOverlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'cedTitle');
        overlay.tabIndex = -1;

        overlay.innerHTML = `
            <header class="ced-header">
                <h2 class="ced-title" id="cedTitle">Card Editor</h2>
                <span class="ced-unsaved" id="cedUnsaved" hidden>Unsaved changes</span>
                <button type="button" class="ced-close-btn" id="cedCloseBtn" aria-label="Close card editor">✕</button>
            </header>

            <div class="ced-body">

                <!-- LEFT: profile picture -->
                <section class="ced-avatar-panel" aria-labelledby="cedAvatarTitle">
                    <h3 class="ced-section-label" id="cedAvatarTitle">Profile picture</h3>
                    <p class="ced-section-sub">Drag or use arrow keys to move. Scroll or + − to zoom.</p>
                    <div class="ced-crop-area" id="cedCropArea">
                        <button type="button" class="ced-crop-placeholder" id="cedCropPlaceholder">Click to upload</button>
                    </div>
                    <input type="file" id="cedAvatarFile" accept="image/*" hidden>
                    <button type="button" class="ced-text-btn" id="cedUploadBtn">Upload image</button>
                </section>

                <!-- CENTER: card preview + sticker tools -->
                <section class="ced-center-panel" aria-labelledby="cedStickersTitle">
                    <div class="ced-toolbar">
                        <h3 class="ced-section-label" id="cedStickersTitle">Stickers</h3>
                        <div class="ced-toolbar-btns">
                            <button type="button" class="ced-text-btn" id="cedUndoBtn">Undo</button>
                            <button type="button" class="ced-text-btn" id="cedClearBtn">Clear all</button>
                        </div>
                    </div>

                    <ul class="ced-help" id="cedHelp">
                        <li><kbd>Click</kbd> stamp</li>
                        <li><kbd>Scroll</kbd> <kbd>+</kbd><kbd>−</kbd> size</li>
                        <li><kbd>Q</kbd><kbd>E</kbd> rotate</li>
                        <li><kbd>←↑↓→</kbd> move</li>
                        <li><kbd>Enter</kbd> stamp</li>
                        <li><kbd>Del</kbd> remove</li>
                        <li><kbd>Ctrl</kbd><kbd>Z</kbd> undo</li>
                    </ul>

                    <div class="ced-card-preview-wrap" id="cedCardWrap">
                        <canvas id="cedCardCanvas" tabindex="0" role="application"
                                aria-label="Card preview. Pick a sticker, then use arrow keys to position it and Enter to stamp it."
                                aria-describedby="cedHelp"></canvas>
                    </div>

                    <p class="ced-adjust-label" id="cedAdjustLabel"></p>

                    <div class="ced-sticker-tray" id="cedStickerTray" role="group" aria-label="Your stickers">
                        <p class="ced-empty">Loading stickers…</p>
                    </div>

                    <div class="ced-bottom-actions">
                        <button type="button" class="ced-big-btn ced-big-btn-back" id="cedBackBtn">← Back</button>
                        <button type="button" class="ced-big-btn ced-big-btn-save" id="cedSaveBtn">Save card</button>
                        <button type="button" class="ced-big-btn ced-big-btn-download" id="cedDownloadBtn">Download ↓</button>
                    </div>
                    <p class="ced-msg" id="cedMsg" role="status" aria-live="polite"></p>
                </section>

                <!-- RIGHT: placed sticker layers -->
                <aside class="ced-layers-sidebar" aria-labelledby="cedLayersTitle">
                    <h3 class="ced-section-label" id="cedLayersTitle">Layers</h3>
                    <p class="ced-section-sub">Top of the list is on top.</p>
                    <ol class="ced-layers-panel" id="cedLayersPanel"></ol>
                </aside>
            </div>

            <div class="ced-sr-only" id="cedAnnounce" aria-live="polite"></div>
        `;

        document.body.appendChild(overlay);

        // ── Buttons ──
        _on(_el('cedCloseBtn'),    'click', () => close());
        _on(_el('cedBackBtn'),     'click', () => close());
        _on(_el('cedSaveBtn'),     'click', _save);
        _on(_el('cedDownloadBtn'), 'click', _download);
        _on(_el('cedUndoBtn'),     'click', _undo);
        _on(_el('cedClearBtn'),    'click', _clearStickers);

        // ── Avatar upload ──
        const pickFile = () => _el('cedAvatarFile').click();
        _on(_el('cedUploadBtn'),       'click', pickFile);
        _on(_el('cedCropPlaceholder'), 'click', pickFile);
        _on(_el('cedAvatarFile'), 'change', e => {
            const file = e.target.files[0];
            if (file) _loadAvatarFile(file);
            e.target.value = '';   // allow re-picking the same file
        });

        // ── Delegated clicks: tray + layers ──
        _on(_el('cedStickerTray'), 'click', _onTrayClick);
        _on(_el('cedLayersPanel'), 'click', _onLayersClick);

        // ── Keyboard ──
        _on(overlay, 'keydown', _onKeyDown);

        _refreshUI();
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            overlay.focus();
        });
    }


    /* ════════════════════════════════════════════════════════
       LOADING
       The scene needs real dimensions, so it waits for layout.
       Stickers + layout are fetched, and every sticker texture
       is loaded ONCE here — after that, edits are instant.
    ════════════════════════════════════════════════════════ */

    async function _loadEditor(session) {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (!_alive(session)) return;

        _initScene();
        _loadBaseCardTexture(session);

        let data;
        try {
            const res = await fetch(`${CONFIG.apiBase}/stickers`, { credentials: 'include' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            data = await res.json();
        } catch (err) {
            console.error('[CardEditor] Could not load stickers:', err);
            if (_alive(session)) _el('cedStickerTray').innerHTML = '<p class="ced-empty">Couldn’t load stickers.</p>';
            return;
        }
        if (!_alive(session)) return;

        _owned       = data.stickers || [];
        _layout      = data.layout   || [];
        _savedLayout = JSON.stringify(_layout);

        const slugs = new Set([..._owned.map(s => s.slug), ..._layout.map(s => s.slug)]);
        await Promise.all([...slugs].map(_loadStickerAsset));
        if (!_alive(session)) return;

        _renderTray();
        _syncStickerMeshes();
        _renderLayers();
        _refreshUI();
    }

    // Load one sticker's texture + material. Resolves even on failure
    // (material stays null and that sticker is simply not drawn).
    function _loadStickerAsset(slug) {
        if (_assets.has(slug)) return _assets.get(slug).ready;

        const asset = { material: null, aspect: 1, ready: null };
        asset.ready = new Promise(resolve => {
            new THREE.TextureLoader().load(
                Utils.stickerSrc(slug),
                tex => {
                    asset.aspect   = tex.image.height / tex.image.width;
                    asset.material = new THREE.MeshBasicMaterial({
                        map: tex, transparent: true, alphaTest: 0.01, depthWrite: false,
                    });
                    resolve(asset);
                },
                undefined,
                err => { console.warn('[CardEditor] Sticker image failed:', slug, err); resolve(asset); }
            );
        });
        _assets.set(slug, asset);
        return asset.ready;
    }

    // Card face texture WITHOUT stickers. Fetched as a blob so the
    // login cookie is sent even when the backend is on another origin.
    async function _loadBaseCardTexture(session) {
        try {
            const res = await fetch(`${CONFIG.apiBase}/card/base?t=${Date.now()}`, { credentials: 'include' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const url = URL.createObjectURL(await res.blob());

            new THREE.TextureLoader().load(url, tex => {
                URL.revokeObjectURL(url);
                if (!_alive(session) || !_three) { tex.dispose(); return; }
                tex.flipY      = false;
                tex.anisotropy = _three.renderer.capabilities.getMaxAnisotropy();

                const face = _three.faceMat;
                face.map?.dispose();
                face.map = tex;
                face.color.set(0xffffff);
                face.needsUpdate = true;
                _invalidate();
            });
        } catch (err) {
            console.warn('[CardEditor] Card preview failed to load:', err);
        }
    }


    /* ════════════════════════════════════════════════════════
       3D SCENE
    ════════════════════════════════════════════════════════ */

    function _initScene() {
        const wrap   = _el('cedCardWrap');
        const canvas = _el('cedCardCanvas');
        if (!wrap || !canvas || typeof THREE === 'undefined') return;

        const W = wrap.clientWidth  || 320;
        const H = wrap.clientHeight || 460;

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(52, W / H, 0.01, 100);
        camera.position.set(0, 0, 2.5);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(W, H, false);     // false = leave canvas CSS size to the stylesheet
        renderer.setClearColor(0x000000, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
        keyLight.position.set(1.5, 2.5, 3);
        scene.add(keyLight);

        // ── Card ──
        const faceMat = new THREE.MeshBasicMaterial({ color: 0xaaff00 });   // lime until the texture arrives
        const edgeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.55, metalness: 0.1 });
        const card    = new THREE.Mesh(Utils.makeCardGeometry(), [faceMat, edgeMat]);
        scene.add(card);

        // Invisible plane over the card face — pointer rays hit this to get card coordinates
        const hitPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(CARD_W, CARD_H),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        hitPlane.position.z = STICKER_Z;
        card.add(hitPlane);

        // Placed stickers live in this group; child index === _layout index
        const stickerRoot = new THREE.Group();
        card.add(stickerRoot);

        // One unit plane shared by every sticker (each mesh scales it)
        const plane = new THREE.PlaneGeometry(1, 1);

        // Red outline drawn around the selected sticker
        const outline = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-0.56, -0.56, 0), new THREE.Vector3(0.56, -0.56, 0),
                new THREE.Vector3(0.56, 0.56, 0),   new THREE.Vector3(-0.56, 0.56, 0),
            ]),
            new THREE.LineBasicMaterial({ color: 0xe8372a, depthTest: false })
        );
        outline.renderOrder = 1000;

        _three = {
            canvas, wrap, scene, camera, renderer, card, faceMat, hitPlane,
            stickerRoot, plane, outline,
            ghost: null,                          // translucent preview of the stamp tool
            stamp: _makeStampModel(scene),
            raycaster: new THREE.Raycaster(),
            ndc: new THREE.Vector2(),
            rotX: -0.05, rotY: 0, targetRotX: -0.05, targetRotY: 0,
            drag: null,                           // { kind: 'rotate' | 'move', ... }
            stampAnim: null,
            bounces: [],
            needsRender: true,
            lastTime: null,
            frameId: 0,
        };

        // Keep the renderer matched to the panel size
        _three.resizeObs = new ResizeObserver(() => {
            if (!_three) return;
            const w = wrap.clientWidth, h = wrap.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            _invalidate();
        });
        _three.resizeObs.observe(wrap);

        _bindCanvasInput();
        _three.frameId = requestAnimationFrame(_renderLoop);
    }

    // Rubber stamp model — handle up (+Y), ink face down (-Y).
    // Hovers near the cursor while a sticker is picked and plays
    // an arc → squish → lift animation on each stamp.
    function _makeStampModel(scene) {
        const group = new THREE.Group();
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.65 });
        const neckMat   = new THREE.MeshStandardMaterial({ color: 0x222220, roughness: 0.4 });
        const inkMat    = new THREE.MeshStandardMaterial({ color: 0xe8372a, roughness: 0.15, metalness: 0.05 });
        const rimMat    = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.42, 16), handleMat);
        handle.position.y = 0.28;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 8), handleMat);
        knob.position.y = 0.51;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.07, 16), neckMat);
        neck.position.y = 0.02;
        group.add(handle, knob, neck);

        // Ink tip in its own group so only the tip squishes on impact
        const tip = new THREE.Group();
        tip.position.y = -0.04;
        tip.add(new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.025, 32), inkMat));
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 8, 32), rimMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = -0.015;
        tip.add(rim);
        group.add(tip);

        const D2R = Math.PI / 180;
        const rest = { x: 0.38, y: 0.55, z: 0.55, rx: -50 * D2R, ry: -19 * D2R, rz: -23 * D2R };
        const land = { rx: 90 * D2R, ry: 0, rz: 0 };

        group.visible = false;
        group.position.set(rest.x, rest.y, rest.z);
        group.rotation.set(rest.rx, rest.ry, rest.rz);
        scene.add(group);

        return { group, tip, rest, land };
    }

    // Ask the render loop to draw the next frame
    function _invalidate() {
        if (_three) _three.needsRender = true;
    }

    // Draws only when something changed or is animating — an idle
    // editor costs next to nothing.
    function _renderLoop(now) {
        const t = _three;
        if (!t) return;
        t.frameId = requestAnimationFrame(_renderLoop);

        // Frame-rate independent step: k === 1 at 60fps
        const dt = t.lastTime === null ? 1 / 60 : Math.min((now - t.lastTime) / 1000, 0.1);
        t.lastTime = now;
        const k = dt * 60;

        // Card faces straight on while stamping or editing a sticker
        const facing = _tool.slug || _selected >= 0;
        const goalX  = facing ? 0 : t.targetRotX;
        const goalY  = facing ? 0 : t.targetRotY;
        const ease   = 1 - Math.pow(0.88, k);
        const turning = Math.abs(goalX - t.rotX) > 1e-4 || Math.abs(goalY - t.rotY) > 1e-4;
        if (turning) {
            t.rotX += (goalX - t.rotX) * ease;
            t.rotY += (goalY - t.rotY) * ease;
            t.card.rotation.set(t.rotX, t.rotY, 0);
        }

        // Single | on purpose: both must step every frame (|| would skip the second)
        const animating = _stepStampAnimation(k) | _stepBounces(k);

        if (turning || animating || t.needsRender) {
            t.renderer.render(t.scene, t.camera);
            t.needsRender = false;
        }
    }

    function _disposeScene() {
        const t = _three;
        if (!t) return;
        _three = null;

        cancelAnimationFrame(t.frameId);
        t.resizeObs.disconnect();

        const disposeMaterial = m => { m.map?.dispose(); m.dispose(); };
        t.scene.traverse(obj => {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial);
            else if (obj.material) disposeMaterial(obj.material);
        });
        t.outline.geometry.dispose();
        t.outline.material.dispose();
        t.plane.dispose();

        // Sticker textures that weren't on the card at close time
        _assets.forEach(a => a.material && disposeMaterial(a.material));
        _assets.clear();

        t.renderer.dispose();
        t.renderer.forceContextLoss();   // free the WebGL context right away
    }


    /* ════════════════════════════════════════════════════════
       STICKER MESHES
    ════════════════════════════════════════════════════════ */

    // Position/rotate/size a sticker mesh (or the ghost) from a layout entry
    function _applyTransform(mesh, s) {
        const w = STICKER_BASE * CARD_W * s.scale;
        const h = w * (_assets.get(s.slug)?.aspect ?? 1);
        mesh.position.set((s.x_pct - 0.5) * CARD_W, (0.5 - s.y_pct) * CARD_H, STICKER_Z);
        mesh.rotation.z = -s.rotation * Math.PI / 180;   // positive rotation = clockwise, like the backend
        mesh.scale.set(w, h, 1);
        mesh.userData.baseScale = { w, h };
        _invalidate();
    }

    // Rebuild all sticker meshes from _layout. Cheap: textures,
    // materials and geometry are shared, only Mesh objects are new.
    function _syncStickerMeshes() {
        if (!_three) return;
        const root = _three.stickerRoot;
        root.clear();

        _layout.forEach((s, i) => {
            const material = _assets.get(s.slug)?.material;
            // Placeholder keeps child indexes lined up with _layout if an image failed
            const obj = material ? new THREE.Mesh(_three.plane, material) : new THREE.Object3D();
            obj.renderOrder = 10 + i;     // later layers draw on top
            _applyTransform(obj, s);
            root.add(obj);
        });
        _syncSelectionOutline();
    }

    function _updateStickerMesh(index) {
        const mesh = _three?.stickerRoot.children[index];
        if (mesh) _applyTransform(mesh, _layout[index]);
    }

    function _syncSelectionOutline() {
        if (!_three) return;
        const { outline, stickerRoot } = _three;
        outline.parent?.remove(outline);
        const mesh = stickerRoot.children[_selected];
        if (mesh) mesh.add(outline);    // child of the mesh, so it scales + rotates with it
        _invalidate();
    }

    // Topmost placed sticker under card point (x, y), or -1.
    // Rotates the point into each sticker's own frame and checks its box.
    function _stickerAt(x, y) {
        for (let i = _layout.length - 1; i >= 0; i--) {
            const s      = _layout[i];
            const halfW  = Math.max(STICKER_BASE * CARD_W * s.scale / 2, 0.03);
            const halfH  = Math.max(halfW * (_assets.get(s.slug)?.aspect ?? 1), 0.03);
            const dx     = (x - s.x_pct) * CARD_W;
            const dy     = (s.y_pct - y) * CARD_H;
            const r      = s.rotation * Math.PI / 180;
            const localX = dx * Math.cos(r) - dy * Math.sin(r);
            const localY = dx * Math.sin(r) + dy * Math.cos(r);
            if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) return i;
        }
        return -1;
    }

    // Pop a freshly stamped sticker in with a little spring
    function _bounceIn(index) {
        const mesh = _three?.stickerRoot.children[index];
        if (mesh && !REDUCED_MOTION) _three.bounces.push({ mesh, t: 0 });
    }

    function _stepBounces(k) {
        const t = _three;
        if (!t.bounces.length) return false;
        t.bounces = t.bounces.filter(b => {
            const { w, h } = b.mesh.userData.baseScale;
            b.t += 0.07 * k;
            if (b.t >= 1.5 || !b.mesh.parent) {        // done, or replaced by a rebuild
                b.mesh.scale.set(w, h, 1);
                return false;
            }
            const f = Math.max(0.01, 1 + 0.6 * Math.exp(-b.t * 5) * Math.cos(b.t * 14));
            b.mesh.scale.set(w * f, h * f, 1);
            return true;
        });
        return true;
    }


    /* ════════════════════════════════════════════════════════
       STAMP TOOL + GHOST
    ════════════════════════════════════════════════════════ */

    // Pick a sticker from the tray as the stamp (null drops it)
    function _setTool(slug) {
        if (!_three) return;
        _tool.slug = slug;
        if (slug) _select(-1);

        // Tray buttons reflect the choice
        _el('cedStickerTray')?.querySelectorAll('.ced-sticker-btn').forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.dataset.slug === slug));
        });
        _three.wrap.classList.toggle('stamp-mode', !!slug);

        // Swap the ghost preview mesh
        if (_three.ghost) {
            _three.ghost.material.dispose();       // cloned material; the texture is shared
            _three.card.remove(_three.ghost);
            _three.ghost = null;
        }
        const material = slug && _assets.get(slug)?.material;
        if (material) {
            const ghostMat = material.clone();
            ghostMat.opacity = 0.55;
            _three.ghost = new THREE.Mesh(_three.plane, ghostMat);
            _three.ghost.renderOrder = 999;
            _three.card.add(_three.ghost);
        }

        _updateGhost();
        _refreshAdjustBar();

        if (slug) {
            SFX.positive();
            _announce(`${_nameOf(slug)} picked. Click the card, or use arrow keys and Enter, to stamp it.`);
        }
    }

    // Move the ghost + hovering stamp model to the tool position
    function _updateGhost() {
        const t = _three;
        if (!t) return;
        const show = !!_tool.slug && (_tool.pointerOver || _tool.canvasFocused);

        if (t.ghost) {
            t.ghost.visible = show;
            _applyTransform(t.ghost, _tool);
        }

        if (!t.stampAnim) {
            const { group, rest } = t.stamp;
            group.visible = show;
            group.position.set(
                (_tool.x_pct - 0.5) * CARD_W + 0.25,     // hover up-right of the target
                (0.5 - _tool.y_pct) * CARD_H + 0.30,
                rest.z
            );
            group.rotation.set(rest.rx, rest.ry, rest.rz);
        }
        _invalidate();
    }

    // Place the current stamp sticker at card point (x, y)
    function _stampAt(x, y) {
        if (!_tool.slug) return;
        if (_layout.length >= STICKER_LIMITS.maxCount) {
            _setMsg(`That’s the limit — ${STICKER_LIMITS.maxCount} stickers per card.`, 'error');
            SFX.negative();
            return;
        }

        _pushHistory();
        const s = {
            slug: _tool.slug,
            x_pct: _clamp(x, 0, 1), y_pct: _clamp(y, 0, 1),
            scale: _tool.scale, rotation: _tool.rotation,
        };
        _layout.push(s);
        _syncStickerMeshes();
        _bounceIn(_layout.length - 1);
        _playStampAnimation(s);
        SFX.stamp();

        _onLayoutChanged();
        _announce(`${_nameOf(s.slug)} stamped. ${_layout.length} sticker${_layout.length === 1 ? '' : 's'} on the card.`);
    }

    function _playStampAnimation(s) {
        const t = _three;
        if (!t || REDUCED_MOTION) return;
        const { group } = t.stamp;
        group.visible = true;
        t.stampAnim = {
            phase: 'arc', t: 0,
            tx: (s.x_pct - 0.5) * CARD_W, ty: (0.5 - s.y_pct) * CARD_H, tz: 0.03,
            sx: group.position.x, sy: group.position.y, sz: group.position.z,
        };
    }

    // arc (swing down onto the card) → squish (ink tip compresses) → lift (back to hover)
    function _stepStampAnimation(k) {
        const t = _three;
        const a = t.stampAnim;
        if (!a) return false;
        const { group, tip, rest, land } = t.stamp;
        const squish = s => tip.scale.set(1 + s * 0.65, Math.max(0.08, 1 - s * 0.85), 1 + s * 0.65);
        const lerp   = (from, to, p) => from + (to - from) * p;

        if (a.phase === 'arc') {
            a.t += 0.028 * k;
            const p   = Math.min(a.t, 1);
            const eIO = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;   // ease in-out
            const eIn = p * p * p;                                     // ease in
            group.position.set(
                lerp(a.sx, a.tx, eIO),
                lerp(a.sy, a.ty, eIO),
                lerp(a.sz, a.tz, eIn) + Math.sin(p * Math.PI) * 1.2    // lift in the middle of the arc
            );
            group.rotation.set(lerp(rest.rx, land.rx, eIO), lerp(rest.ry, land.ry, eIO), lerp(rest.rz, land.rz, eIO));
            squish(0);
            if (p >= 1) { a.phase = 'squish'; a.t = 0; }

        } else if (a.phase === 'squish') {
            a.t += 0.058 * k;
            group.position.set(a.tx, a.ty, a.tz);
            group.rotation.set(land.rx, land.ry, land.rz);
            squish(Math.max(0, Math.exp(-a.t * 9) * Math.cos(a.t * 20)));   // damped spring
            if (a.t > 0.5) { a.phase = 'lift'; a.t = 0; squish(0); }

        } else if (a.phase === 'lift') {
            a.t += 0.025 * k;
            const p    = Math.min(a.t, 1);
            const eOut = 1 - Math.pow(1 - p, 3);
            // Lift back toward wherever the ghost is now
            const hx = (_tool.x_pct - 0.5) * CARD_W + 0.25;
            const hy = (0.5 - _tool.y_pct) * CARD_H + 0.30;
            group.position.set(lerp(a.tx, hx, eOut), lerp(a.ty, hy, eOut), lerp(a.tz, rest.z, eOut));
            group.rotation.set(lerp(land.rx, rest.rx, eOut), lerp(land.ry, rest.ry, eOut), lerp(land.rz, rest.rz, eOut));
            if (p >= 1) {
                t.stampAnim = null;
                _updateGhost();     // snap back to the normal hover pose/visibility
            }
        }
        return true;
    }


    /* ════════════════════════════════════════════════════════
       SELECTION + ADJUSTING
    ════════════════════════════════════════════════════════ */

    function _select(index) {
        _selected = index;
        _syncSelectionOutline();
        _renderLayers();
        _refreshAdjustBar();
        if (index >= 0) _announce(`${_nameOf(_layout[index].slug)} selected, layer ${index + 1}.`);
    }

    // What the adjust controls act on: the stamp tool, the selected sticker, or nothing
    function _target() {
        if (_tool.slug) return _tool;
        if (_selected >= 0) return _layout[_selected];
        return null;
    }

    // Apply one adjustment to the current target. Returns false if there's no target.
    //   'scale'  amount = multiplier
    //   'rotate' amount = degrees (positive = clockwise)
    //   'move'   amount = { dx, dy } in card fractions
    function _adjust(action, amount) {
        const target = _target();
        if (!target) return false;

        // Rapid repeats (scroll, held keys) merge into one undo step
        if (target !== _tool) _pushHistory(`${action}:${_selected}`);

        if (action === 'scale') {
            target.scale = _clamp(target.scale * amount, STICKER_LIMITS.minScale, STICKER_LIMITS.maxScale);
        } else if (action === 'rotate') {
            target.rotation = ((target.rotation + amount) % 360 + 360) % 360;
        } else if (action === 'move') {
            target.x_pct = _clamp(target.x_pct + amount.dx, 0, 1);
            target.y_pct = _clamp(target.y_pct + amount.dy, 0, 1);
        }

        if (target === _tool) {
            _updateGhost();
            _refreshAdjustBar();
        } else {
            _updateStickerMesh(_selected);
            _onLayoutChanged({ layers: false });
        }
        return true;
    }

    function _removeSticker(index) {
        if (index < 0 || index >= _layout.length) return;
        _pushHistory();
        const [removed] = _layout.splice(index, 1);

        if (_selected === index)    _selected = -1;
        else if (_selected > index) _selected--;

        _syncStickerMeshes();
        _onLayoutChanged();
        SFX.negative();
        _announce(`${_nameOf(removed.slug)} removed.`);
    }

    function _clearStickers() {
        if (!_layout.length) return;
        _pushHistory();
        _layout   = [];
        _selected = -1;
        _syncStickerMeshes();
        _onLayoutChanged();
        SFX.negative();
        _setMsg('All stickers cleared. Undo to bring them back.', '');
    }


    /* ════════════════════════════════════════════════════════
       UNDO
    ════════════════════════════════════════════════════════ */

    // Snapshot the layout before a change. Calls sharing a `tag`
    // within 700ms are merged, so a burst of scrolls is one undo.
    function _pushHistory(tag = null, snapshot = JSON.stringify(_layout)) {
        const now = performance.now();
        if (tag && tag === _lastHistory.tag && now - _lastHistory.time < 700) {
            _lastHistory.time = now;
            return;
        }
        _history.push(snapshot);
        if (_history.length > 100) _history.shift();
        _lastHistory = { tag, time: now };
    }

    function _undo() {
        if (!_history.length) return;
        _layout   = JSON.parse(_history.pop());
        _selected = -1;
        _lastHistory = { tag: null, time: 0 };
        _syncStickerMeshes();
        _onLayoutChanged();
        SFX.negative();
        _announce('Undone.');
    }


    /* ════════════════════════════════════════════════════════
       UI REFRESH
    ════════════════════════════════════════════════════════ */

    // Call after any change to _layout.
    // layers: false skips the layer list rebuild (it only shows order,
    // not position/size, so moves and resizes don't need it).
    function _onLayoutChanged({ layers = true } = {}) {
        _confirmingClose = false;
        if (layers) _renderLayers();
        _refreshUI();
    }

    function _refreshUI() {
        const save = _el('cedSaveBtn');
        if (!save) return;
        const dirty = _isDirty();

        _el('cedUnsaved').hidden = !dirty;
        save.disabled    = _saving;
        save.textContent = _saving ? 'Saving…' : 'Save card';
        save.classList.toggle('is-dirty', dirty);

        _el('cedDownloadBtn').setAttribute('aria-disabled', String(dirty || _saving));
        _el('cedUndoBtn').disabled  = !_history.length;
        _el('cedClearBtn').disabled = !_layout.length;
        _refreshAdjustBar();
    }

    // Status line under the card: what's being edited, its size and angle
    function _refreshAdjustBar() {
        const label = _el('cedAdjustLabel');
        if (!label) return;
        const target = _target();

        const detail = s => `${Math.round(s.scale * 100)}% · ${Math.round(s.rotation)}°`;
        if (_tool.slug) {
            label.textContent = `Stamping ${_nameOf(_tool.slug)} · ${detail(_tool)}`;
        } else if (_selected >= 0) {
            label.textContent = `Selected ${_nameOf(target.slug)} · ${detail(target)}`;
        } else {
            label.textContent = 'Pick a sticker below, or click one on the card to edit it.';
        }
    }

    // Names and slugs come from the database, so everything goes through Utils.esc
    function _renderTray() {
        const tray = _el('cedStickerTray');
        if (!tray) return;
        tray.innerHTML = _owned.map(s => `
            <button type="button" class="ced-sticker-btn" data-slug="${Utils.esc(s.slug)}" aria-pressed="false">
                <img src="${Utils.esc(Utils.stickerSrc(s.slug))}" alt="">
                <span class="ced-sticker-name">${Utils.esc(s.name)}</span>
            </button>`).join('')
            || '<p class="ced-empty">You don’t own any stickers yet.</p>';
    }

    function _renderLayers() {
        const panel = _el('cedLayersPanel');
        if (!panel) return;
        const rows = _layout.map((s, i) => {
            const name = Utils.esc(_nameOf(s.slug)), sel = i === _selected;
            return `
            <li class="ced-layer-row${sel ? ' selected' : ''}">
                <button type="button" class="ced-layer-pick" data-index="${i}" aria-pressed="${sel}">
                    <img class="ced-layer-thumb" src="${Utils.esc(Utils.stickerSrc(s.slug))}" alt="">
                    <span class="ced-layer-name">${i + 1}. ${name}</span>
                </button>
                <button type="button" class="ced-layer-del" data-index="${i}" data-action="remove"
                        aria-label="Remove ${name}, layer ${i + 1}">✕</button>
            </li>`;
        });
        // Top layer first
        panel.innerHTML = rows.reverse().join('') || '<li class="ced-empty">No stickers yet.</li>';
    }


    /* ════════════════════════════════════════════════════════
       INPUT — CLICKS
    ════════════════════════════════════════════════════════ */

    function _onTrayClick(e) {
        const btn = e.target.closest('.ced-sticker-btn');
        if (!btn) return;
        const slug = btn.dataset.slug;

        if (_tool.slug === slug) {
            _setTool(null);
            SFX.negative();
            return;
        }
        _setTool(slug);
        // Keyboard activation (detail === 0): jump focus to the card so
        // arrow keys + Enter can place the sticker right away.
        if (e.detail === 0) _three?.canvas.focus();
    }

    function _onLayersClick(e) {
        const btn = e.target.closest('button[data-index]');
        if (!btn) return;
        const index = Number(btn.dataset.index);

        if (btn.dataset.action === 'remove') {
            _removeSticker(index);
            return;
        }
        if (_tool.slug) _setTool(null);
        _select(index === _selected ? -1 : index);
    }


    /* ════════════════════════════════════════════════════════
       INPUT — CARD CANVAS (pointer events cover mouse + touch + pen)
    ════════════════════════════════════════════════════════ */

    // Pointer event → card coordinates { x, y } in 0–1 (top-left origin), or null if off the card
    function _pointerToCard(e) {
        const { canvas, camera, raycaster, ndc, hitPlane } = _three;
        const rect = canvas.getBoundingClientRect();
        ndc.set(
            ((e.clientX - rect.left) / rect.width)  *  2 - 1,
            ((e.clientY - rect.top)  / rect.height) * -2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObject(hitPlane, false)[0];
        if (!hit) return null;
        const local = hitPlane.worldToLocal(hit.point);
        return { x: local.x / CARD_W + 0.5, y: 0.5 - local.y / CARD_H };
    }

    function _bindCanvasInput() {
        const t = _three;
        const canvas = t.canvas;

        _on(canvas, 'pointerdown', e => {
            if (e.button !== 0) return;
            canvas.focus({ preventScroll: true });
            const p = _pointerToCard(e);

            // Stamp mode: click places the sticker
            if (_tool.slug) {
                if (p) _stampAt(p.x, p.y);
                return;
            }

            canvas.setPointerCapture(e.pointerId);
            const hit = p ? _stickerAt(p.x, p.y) : -1;

            if (hit >= 0) {
                // Grab a placed sticker — keep the offset so it doesn't jump to the cursor
                _select(hit);
                const s = _layout[hit];
                t.drag = {
                    kind: 'move', index: hit, moved: false,
                    offX: s.x_pct - p.x, offY: s.y_pct - p.y,
                    snapshot: JSON.stringify(_layout),
                };
                canvas.style.cursor = 'grabbing';
            } else {
                // Empty space: deselect and spin the card
                if (_selected >= 0) _select(-1);
                t.drag = { kind: 'rotate', lastX: e.clientX, lastY: e.clientY };
            }
        });

        _on(canvas, 'pointermove', e => {
            const drag = t.drag;

            if (drag?.kind === 'rotate') {
                t.targetRotY += (e.clientX - drag.lastX) * 0.012;
                t.targetRotX  = _clamp(t.targetRotX + (e.clientY - drag.lastY) * 0.012, -Math.PI / 2, Math.PI / 2);
                drag.lastX = e.clientX;
                drag.lastY = e.clientY;
                return;
            }

            const p = _pointerToCard(e);

            if (drag?.kind === 'move') {
                if (!p) return;
                if (!drag.moved) {                 // first real movement → one undo step
                    _pushHistory(null, drag.snapshot);
                    drag.moved = true;
                }
                const s = _layout[drag.index];
                s.x_pct = _clamp(p.x + drag.offX, 0, 1);
                s.y_pct = _clamp(p.y + drag.offY, 0, 1);
                _updateStickerMesh(drag.index);
                _onLayoutChanged({ layers: false });
                return;
            }

            if (_tool.slug) {
                _tool.pointerOver = !!p;
                if (p) { _tool.x_pct = p.x; _tool.y_pct = p.y; }
                _updateGhost();
                return;
            }

            // Hover feedback: grab cursor over placed stickers
            canvas.style.cursor = p && _stickerAt(p.x, p.y) >= 0 ? 'grab' : '';
        });

        const endDrag = () => {
            if (!t.drag) return;
            t.drag = null;
            canvas.style.cursor = '';
        };
        _on(canvas, 'pointerup',     endDrag);
        _on(canvas, 'pointercancel', endDrag);

        _on(canvas, 'pointerleave', () => {
            _tool.pointerOver = false;
            _updateGhost();
        });

        // Keyboard focus shows the ghost at the tool position. Mouse clicks
        // also focus the canvas, but :focus-visible is false for those, so
        // the ghost still hides when the mouse leaves.
        _on(canvas, 'focus', () => { _tool.canvasFocused = canvas.matches(':focus-visible'); _updateGhost(); });
        _on(canvas, 'blur',  () => { _tool.canvasFocused = false; _updateGhost(); });

        // Scroll resizes the stamp tool or selected sticker.
        // Scaled by deltaY so trackpads (many small deltas) stay smooth.
        _on(canvas, 'wheel', e => {
            if (!_target()) return;
            e.preventDefault();
            const notches = _clamp(-e.deltaY / 100, -3, 3);
            _adjust('scale', Math.pow(STEP.scale, notches));
        }, { passive: false });
    }


    /* ════════════════════════════════════════════════════════
       INPUT — KEYBOARD
    ════════════════════════════════════════════════════════ */

    function _onKeyDown(e) {
        const key = e.key.toLowerCase();
        const mod = e.ctrlKey || e.metaKey;

        if (key === 'escape') {
            e.preventDefault();
            if (_tool.slug)          _setTool(null);
            else if (_selected >= 0) _select(-1);
            else                     close();
            return;
        }
        if (key === 'tab') { Utils.trapFocus(e, _el('cardEditorOverlay')); return; }
        if (mod && key === 's') { e.preventDefault(); _save(); return; }
        if (mod && key === 'z') { e.preventDefault(); _undo(); return; }
        if (mod || e.altKey) return;

        const onCanvas = e.target === _three?.canvas;
        if (onCanvas && !_tool.canvasFocused) {
            _tool.canvasFocused = true;     // keys pressed on the card → show the ghost
            _updateGhost();
        }
        const nudge    = e.shiftKey ? STEP.nudgeBig : STEP.nudge;
        const turn     = e.shiftKey ? STEP.rotateFine : STEP.rotate;
        let handled    = false;

        switch (key) {
            case 'q':          handled = _adjust('rotate', -turn); break;
            case 'e':          handled = _adjust('rotate',  turn); break;
            case '+': case '=': handled = _adjust('scale', STEP.scale); break;
            case '-': case '_': handled = _adjust('scale', 1 / STEP.scale); break;
            case 'arrowleft':  handled = _adjust('move', { dx: -nudge, dy: 0 }); break;
            case 'arrowright': handled = _adjust('move', { dx:  nudge, dy: 0 }); break;
            case 'arrowup':    handled = _adjust('move', { dx: 0, dy: -nudge }); break;
            case 'arrowdown':  handled = _adjust('move', { dx: 0, dy:  nudge }); break;
            case 'delete':
            case 'backspace':
                if (_selected >= 0) { _removeSticker(_selected); handled = true; }
                break;
            case 'enter':
            case ' ':
                // Only on the card — elsewhere Enter/Space should press the focused button
                if (onCanvas && _tool.slug) { _stampAt(_tool.x_pct, _tool.y_pct); handled = true; }
                break;
        }
        if (handled) e.preventDefault();
    }


    /* ════════════════════════════════════════════════════════
       PROFILE PICTURE CROP
    ════════════════════════════════════════════════════════ */

    function _loadAvatarFile(file) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            Object.assign(_avatar, { file, img, x: 0, y: 0, scale: 1, dirty: true });
            _ensureCropCanvas();
            _drawCrop();
            _onLayoutChanged({ layers: false });   // refreshes the unsaved indicator
            _setMsg('Picture added — press Save card to apply it.', '');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            _setMsg('That file couldn’t be opened as an image.', 'error');
        };
        img.src = url;
    }

    // Swap the upload placeholder for the crop canvas (once)
    function _ensureCropCanvas() {
        if (_el('cedCropCanvas')) return;

        const canvas = document.createElement('canvas');
        canvas.id        = 'cedCropCanvas';
        canvas.width     = CROP_SIZE;
        canvas.height    = CROP_SIZE;
        canvas.tabIndex  = 0;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Profile picture crop. Arrow keys move the picture, plus and minus zoom.');
        _el('cedCropArea').replaceChildren(canvas);

        const changed = () => {
            _avatar.dirty = true;
            _drawCrop();
            _onLayoutChanged({ layers: false });
        };

        // Drag to pan
        let last = null;
        _on(canvas, 'pointerdown', e => {
            canvas.setPointerCapture(e.pointerId);
            last = { x: e.clientX, y: e.clientY };
        });
        _on(canvas, 'pointermove', e => {
            if (!last) return;
            _avatar.x += e.clientX - last.x;
            _avatar.y += e.clientY - last.y;
            last = { x: e.clientX, y: e.clientY };
            changed();
        });
        _on(canvas, 'pointerup',     () => { last = null; });
        _on(canvas, 'pointercancel', () => { last = null; });

        // Scroll to zoom
        _on(canvas, 'wheel', e => {
            e.preventDefault();
            _avatar.scale = _clamp(_avatar.scale * Math.pow(1.1, _clamp(-e.deltaY / 100, -3, 3)), 0.2, 5);
            changed();
        }, { passive: false });

        // Keyboard: arrows pan, +/- zoom. stopPropagation keeps these
        // from also moving the selected sticker.
        _on(canvas, 'keydown', e => {
            const step = e.shiftKey ? 16 : 4;
            const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            if (moves[e.key]) {
                _avatar.x += moves[e.key][0];
                _avatar.y += moves[e.key][1];
            } else if (e.key === '+' || e.key === '=') {
                _avatar.scale = _clamp(_avatar.scale * 1.1, 0.2, 5);
            } else if (e.key === '-' || e.key === '_') {
                _avatar.scale = _clamp(_avatar.scale / 1.1, 0.2, 5);
            } else {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            changed();
        });
    }

    function _drawCrop() {
        const canvas = _el('cedCropCanvas');
        const img    = _avatar.img;
        if (!canvas || !img) return;

        const ctx = canvas.getContext('2d');
        const R   = CROP_SIZE / 2;
        ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);

        // Image scaled so its short side fills the circle at scale 1
        ctx.save();
        ctx.beginPath();
        ctx.arc(R, R, R, 0, Math.PI * 2);
        ctx.clip();
        const fit   = CROP_SIZE / Math.min(img.width, img.height);
        const drawW = img.width  * _avatar.scale * fit;
        const drawH = img.height * _avatar.scale * fit;
        ctx.drawImage(img, R - drawW / 2 + _avatar.x, R - drawH / 2 + _avatar.y, drawW, drawH);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(R, R, R - 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(26, 26, 24, 0.35)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
    }


    /* ════════════════════════════════════════════════════════
       SAVE + DOWNLOAD
       The ONLY place anything is sent to the server.
    ════════════════════════════════════════════════════════ */

    async function _post(path, options) {
        let res;
        try {
            res = await fetch(`${CONFIG.apiBase}${path}`, { method: 'POST', credentials: 'include', ...options });
        } catch {
            throw new Error('Connection error — is the server running?');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Save failed.');
        return data;
    }

    async function _save() {
        if (_saving) return;
        const layoutDirty = _isLayoutDirty();
        if (!layoutDirty && !_avatar.dirty) {
            _setMsg('Nothing to save yet.', '');
            return;
        }

        const session = _abort;
        const avatarDirty = _avatar.dirty;
        _saving = true;
        _refreshUI();
        _setMsg('Saving — redrawing your card…', '');

        try {
            if (avatarDirty) {
                const form = new FormData();
                form.append('avatar',     _avatar.file);
                form.append('crop_x',     _avatar.x);
                form.append('crop_y',     _avatar.y);
                form.append('crop_scale', _avatar.scale);
                // If stickers are saved next, that request redraws the card —
                // skip the redraw here so the slow render only happens once.
                form.append('regenerate', layoutDirty ? '0' : '1');
                await _post('/profile/avatar', { body: form });
                _avatar.dirty = false;
            }

            if (layoutDirty) {
                const data = await _post('/profile/stickers', {
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ layout: _layout }),
                });
                if (!_alive(session)) return;
                // Mirror exactly what the server kept (it drops invalid entries)
                _layout      = data.layout;
                _savedLayout = JSON.stringify(_layout);
                _selected    = -1;
                _syncStickerMeshes();
                _renderLayers();
            }

            // New picture → refresh the preview. Only now: until the card is
            // redrawn (above), /card/base still shows the old picture.
            if (avatarDirty) _loadBaseCardTexture(session);
            Inventory.invalidateCardCache();
            SFX.positive();
            _setMsg('Saved! Download your new card — your old card file won’t log you in anymore.', 'success');
        } catch (err) {
            SFX.negative();
            _setMsg(err.message, 'error');
        } finally {
            _saving = false;
            _confirmingClose = false;
            _refreshUI();
        }
    }

    function _download() {
        if (_saving) return;
        if (_isDirty()) {
            _setMsg('Save your changes first, then download.', 'error');
            SFX.negative();
            return;
        }
        Arg.downloadCard();
    }


    /* ════════════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════════════ */

    return { open, close };

})();
