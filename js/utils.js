/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   utils.js — small shared helpers (timing, easing, animation, assets).
   No module state. Load right after config.js.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Utils = Object.freeze({

    /* 75 → "1:15" (no hours) */
    formatTime(seconds) {
        const s = Math.floor(seconds || 0);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },

    /* Easing curves: t in 0–1 → eased 0–1 */
    easing: {
        easeOutCubic:   t => 1 - Math.pow(1 - t, 3),                                            // lands softly
        easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),      // glides
        easeInOutQuad:  t => (t < 0.5 ? 2 * t * t     : 1 - Math.pow(-2 * t + 2, 2) / 2),      // softer glide
    },

    /* a → b by t, with t clamped to 0–1 */
    lerp(a, b, t) {
        return a + (b - a) * Math.min(1, Math.max(0, t));
    },

    randElement(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /* Resolves after two frames — use before adding a class that should
       CSS-transition from an element's just-inserted initial state. */
    nextFrames() {
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },

    /* Move a fixed/absolute element's left/top from (fromX, fromY) to
       (toX, toY) px over `ms`. Resolves when it arrives. */
    animateXY(el, fromX, fromY, toX, toY, ms, ease = Utils.easing.easeInOutCubic) {
        return new Promise(resolve => {
            const start = performance.now();
            (function step(now) {
                const t = ease(Math.min((now - start) / ms, 1));
                el.style.left = Utils.lerp(fromX, toX, t) + 'px';
                el.style.top  = Utils.lerp(fromY, toY, t) + 'px';
                if (now - start < ms) requestAnimationFrame(step);
                else resolve();
            })(start);
        });
    },

    /* Type `text` one character at a time just before `cursorEl`
       (so a blinking cursor element stays at the end). */
    typeBeforeCursor(cursorEl, text, msPerChar) {
        return new Promise(resolve => {
            let i = 0;
            const timer = setInterval(() => {
                if (i < text.length) cursorEl.insertAdjacentText('beforebegin', text[i++]);
                else { clearInterval(timer); resolve(); }
            }, msPerChar);
        });
    },

    /* A random "classified readout" value for the endless extra scan rows */
    fakeDataValue() {
        const rand = () => Math.random().toString(16).slice(2, 10).toUpperCase();
        return Utils.randElement([
            () => rand(),
            () => '0x' + rand(),
            () => Utils.randElement(['NULL', 'UNREGISTERED', 'NOT FOUND', 'FLAGGED', 'CLASSIFIED', 'EXPIRED',
                                     'DRIFTING', 'PARTIAL', 'INACTIVE', 'SEVERED', 'DEGRADED', 'MISMATCH',
                                     'ACTIVE', 'PASSIVE', 'MONITORED', 'WATCHING', 'PROCESSING']),
            () => (Math.random() * 10).toFixed(2) + ' / 10',
            () => Math.floor(Math.random() * 9999) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
            () => Utils.randElement(['0.' + Math.floor(Math.random() * 99), '1.00', '0.00']),
        ])();
    },

    /* Make text safe to put inside innerHTML (content or a quoted attribute) */
    esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                              .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /* Keep Tab focus inside a dialog. Call from its keydown handler on Tab. */
    trapFocus(e, dialog) {
        const focusable = [...dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]')]
            .filter(el => el.offsetParent !== null);            // skip hidden ones
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    },

    /* A word flickers on like a lamp and fires rectangle ripples outward, holds,
       then flickers off (SECURED after the passphrase, ERROR in the break-in).
       `flash` is the full-screen layer, `word` the word, `ripples` an <svg> for
       the ripples (styled by the page's .flash-ripple rule). With stay: true it
       stays on. `onLit` runs the moment it's first fully on. */
    flashWord(flash, word, ripples, { stay = false, onLit } = {}) {
        const FLICKER_ON  = [0, 60, 120, 80, 160, 0, 200];   // alternating on/off step durations, ms
        const FLICKER_OFF = [0, 50, 100, 60, 140, 0, 180];
        const HOLD_MS     = 900;

        return new Promise(resolve => {
            // Schedule a flicker: even steps show `firstOn`, odd steps the opposite
            const flicker = (steps, startMs, firstOn) => {
                let t = startMs;
                steps.forEach((dur, i) => {
                    setTimeout(() => { flash.style.opacity = (i % 2 === 0) === firstOn ? '1' : '0'; }, t);
                    t += dur;
                });
                return t;
            };

            // One rectangle growing out from the word and fading
            const spawnRipple = (delay, scale) => setTimeout(() => {
                const r = word.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const maxW = Math.max(innerWidth, innerHeight) * 2.4 * scale;
                const maxH = maxW * (r.height / r.width);
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('class', 'flash-ripple');
                ripples.appendChild(rect);

                const start = performance.now();
                (function grow(now) {
                    const p = Math.min((now - start) / 1200, 1);
                    const e = 1 - (1 - p) * (1 - p);                      // ease-out
                    const w = r.width + (maxW - r.width) * e, h = r.height + (maxH - r.height) * e;
                    rect.setAttribute('x', cx - w / 2);
                    rect.setAttribute('y', cy - h / 2);
                    rect.setAttribute('width', w);
                    rect.setAttribute('height', h);
                    rect.setAttribute('opacity', (0.6 * (1 - p)).toFixed(3));
                    p < 1 ? requestAnimationFrame(grow) : rect.remove();
                })(start);
            }, delay);

            const onAt = flicker(FLICKER_ON, 0, true);
            setTimeout(() => onLit?.(), onAt);
            [[0, 1], [80, 0.7], [180, 0.5], [320, 0.35]].forEach(([delay, scale]) => spawnRipple(onAt + delay, scale));
            if (stay) { setTimeout(resolve, onAt + HOLD_MS); return; }
            const offAt = flicker(FLICKER_OFF, onAt + HOLD_MS, false);
            setTimeout(() => { flash.style.opacity = '0'; resolve(); }, offAt + 100);
        });
    },

    /* Shake the whole page: jolts that die away over `ms` (Web Animations, so
       it's the same at any frame rate). `px` is the first jolt's size. */
    shakeScreen(px = 10, ms = 600) {
        const steps = 12;
        const frames = Array.from({ length: steps + 1 }, (_, i) => {
            const k = i === steps ? 0 : px * Math.pow(1 - i / steps, 2);
            return { transform: `translate(${((Math.random() - 0.5) * 2 * k).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * k).toFixed(1)}px)` };
        });
        return document.body.animate(frames, { duration: ms, easing: 'linear' }).finished;
    },

    /* Touchscreens: a vertical finger drag on `el` sends it wheel events, so
       lists that only scroll by wheel (inventory, mixtape) can be swiped.
       Pair with `touch-action: none` on `el`. `signal` removes the listeners. */
    swipeAsWheel(el, signal) {
        let lastY = null;
        el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') lastY = e.clientY; }, { signal });
        el.addEventListener('pointermove', e => {
            if (lastY === null || e.pointerType !== 'touch') return;
            const deltaY = lastY - e.clientY;                   // finger up = scroll down
            lastY = e.clientY;
            if (deltaY) el.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true }));
        }, { signal });
        for (const type of ['pointerup', 'pointercancel']) el.addEventListener(type, () => { lastY = null; }, { signal });
    },

    /* Two-finger touch gestures on `el`. onChange(scale, turnDeg) gets the change
       since the last move: pinch as a size ratio, twist in degrees (clockwise +).
       onStart runs as the second finger lands. Register this BEFORE the element's
       own pointer handlers; they can ask the returned function whether two
       fingers are down and stand aside. `signal` removes the listeners. */
    twoFingers(el, signal, { onStart, onChange }) {
        const fingers = new Map();
        let last = null;
        const measure = () => {
            const [a, b] = [...fingers.values()];
            return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
        };
        el.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'touch') return;
            fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (fingers.size === 2) { last = measure(); onStart?.(); }
        }, { signal });
        el.addEventListener('pointermove', e => {
            const f = fingers.get(e.pointerId);
            if (!f) return;
            f.x = e.clientX;
            f.y = e.clientY;
            if (fingers.size !== 2 || !last) return;
            const now  = measure();
            const turn = ((now.angle - last.angle) * 180 / Math.PI + 540) % 360 - 180;   // shortest way round
            if (last.dist > 0 && now.dist > 0) onChange(now.dist / last.dist, turn);
            last = now;
        }, { signal });
        const lift = e => { fingers.delete(e.pointerId); if (fingers.size < 2) last = null; };
        for (const type of ['pointerup', 'pointercancel']) el.addEventListener(type, lift, { signal });
        return () => fingers.size >= 2;
    },

    /* Per-frame spring factor made frame-rate independent: `perFrame` is
       the fraction closed per frame at 60fps, dtMs the real frame time. */
    springStep(perFrame, dtMs) {
        return 1 - Math.pow(1 - perFrame, Math.min(dtMs, 50) / (1000 / 60));
    },

    /* Sticker display image. Capital "I": web hosts are case-sensitive. */
    stickerSrc(slug) {
        return `Images/stickers/${slug}.png`;
    },

    /* ── 3D access card (inventory viewer + card editor) ──────────────
       Lime-tinted, slightly frosted plastic that refracts what's behind
       it, with:
         front print    the card PNG. Its translucent lime is cut away
                        (alpha < 0.5), so the plastic's own tint shows.
         reverse print  the same print seen mirrored through the plastic
                        from behind
         stripe         the orange stripe wrapping over the top edge,
                        down the back and under the bottom edge
       Proportions + stripe match card_gen.py / card_template.html
       (560×860 px). Needs Three.js, and a scene set up with
       setUpCardStage() so it has something to reflect and refract. */
    CARD: Object.freeze({
        w: 1.0, h: 1.535, radius: 0.06,
        depth: 0.015, bevel: 0.0045,        // ~0.8 mm at real card size
        frost: 0.11,                        // surface roughness: blurs what's seen through it
        tint: 0xaaff00, tintDistance: 0.0107,   // lime, and how quickly light turns lime inside it
        ior: 1.49,                          // acrylic
        stripe: Object.freeze({ x: 100 / 560, w: 150 / 560, color: 0xff8c00 }),
    }),

    /* z of the card's front surface — stickers and hit planes sit just above it */
    cardFrontZ() {
        return Utils.CARD.depth / 2 + Utils.CARD.bevel;
    },

    /* Everything a scene needs to show the plastic card properly:
         - soft studio reflections + a key light
         - the page's live globe, seen THROUGH the plastic
       The plastic can only refract what's inside the 3D scene, and the page
       behind a canvas isn't. So each update() copies the part of the globe
       canvas that sits behind this viewer (over cream) onto a screen that
       fills the camera's view, far behind the card. That screen is drawn
       only into the pass the plastic looks through — never to the canvas
       itself — so around the card you still see the real page.
       Call update() before each render. Returns { update, dispose }. */
    setUpCardStage(scene, renderer, camera, viewerCanvas) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
        pmrem.dispose();

        // Filmic tone mapping gives the plastic its light, glassy lime (as in the
        // approved mockup). The print, stripe and globe opt out (toneMapped: false),
        // so their colours stay exact.
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;

        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(1.5, 2.5, 3);
        scene.add(key);

        const globe = document.getElementById('globeCanvas');
        const snap  = document.createElement('canvas');
        const g     = snap.getContext('2d');
        const tex   = new THREE.CanvasTexture(snap);
        tex.colorSpace = THREE.SRGBColorSpace;

        // Copying the globe into a texture is the expensive part (a GPU readback +
        // re-upload), so copy it small and not every frame. The frost blurs it
        // anyway, and the globe turns ~6°/s, so neither shows.
        const SNAP_SCALE = 1 / 3, SNAP_EVERY_MS = 66;
        let lastSnap = -Infinity;

        const DIST = 30;                       // well behind the card at any zoom
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        screen.position.z = -DIST;
        screen.frustumCulled = false;
        // Invisible in the normal pass; drawn only into the transmission pass (a render target)
        screen.onBeforeRender = r => {
            const seenThroughPlastic = r.getRenderTarget() !== null;
            screen.material.colorWrite = screen.material.depthWrite = seenThroughPlastic;
        };
        camera.add(screen);
        scene.add(camera);

        return {
            update() {
                const viewH = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
                screen.scale.set(viewH * camera.aspect, viewH, 1);

                const now = performance.now();
                if (now - lastSnap < SNAP_EVERY_MS) return;
                lastSnap = now;

                const r = viewerCanvas.getBoundingClientRect();
                const w = Math.round(r.width * SNAP_SCALE), h = Math.round(r.height * SNAP_SCALE);
                if (!w || !h) return;
                if (snap.width !== w || snap.height !== h) { snap.width = w; snap.height = h; }
                g.fillStyle = '#f5f2ec';                                  // --cream
                g.fillRect(0, 0, w, h);
                const k = globe.width / innerWidth;                       // the globe canvas is drawn at devicePixelRatio
                g.drawImage(globe, r.left * k, r.top * k, r.width * k, r.height * k, 0, 0, w, h);
                tex.needsUpdate = true;
            },
            dispose() {
                scene.environment.dispose();
                tex.dispose();
                screen.geometry.dispose();
                screen.material.dispose();
            },
        };
    },

    /* Returns { group, setFace(texture), dispose() }. The print stays
       hidden until setFace() gives it the card PNG. */
    makeCard() {
        const C = Utils.CARD, hw = C.w / 2, hh = C.h / 2, r = C.radius;
        const surf = Utils.cardFrontZ(), full = surf * 2;
        const group = new THREE.Group();

        const shape = new THREE.Shape();
        shape.moveTo(-hw + r, -hh);
        shape.lineTo(hw - r, -hh);   shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
        shape.lineTo(hw, hh - r);    shape.quadraticCurveTo(hw, hh, hw - r, hh);
        shape.lineTo(-hw + r, hh);   shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
        shape.lineTo(-hw, -hh + r);  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
        const bodyGeo = new THREE.ExtrudeGeometry(shape, {
            depth: C.depth, bevelEnabled: true, bevelThickness: C.bevel, bevelSize: C.bevel,
            bevelSegments: 4, curveSegments: 16,
        }).center();

        group.add(new THREE.Mesh(bodyGeo, new THREE.MeshPhysicalMaterial({
            color: 0xffffff, metalness: 0, roughness: C.frost,
            transmission: 1, ior: C.ior, thickness: full,          // real thickness = refraction stays in place
            attenuationColor: C.tint, attenuationDistance: C.tintDistance,
            clearcoat: 1, clearcoatRoughness: C.frost * 0.3, specularIntensity: 1, dispersion: 0.5,
        })));

        // Print. Flat colour (not lit) so it matches the PNG exactly; alpha-to-coverage
        // keeps the cut-out edges smooth. The FRONT print is marked transparent so the
        // plastic doesn't refract its own print (that shows as a shifted ghost copy);
        // the REVERSE print is opaque on purpose, so the plastic does show it from behind.
        const ink = transparent => new THREE.MeshBasicMaterial({
            alphaTest: 0.5, alphaToCoverage: true, transparent, visible: false, toneMapped: false,
        });
        // The print is cut to the card's rounded outline, so older square PNGs fit too
        const plane = new THREE.ShapeGeometry(shape, 16);
        const pos = plane.attributes.position, uv = plane.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + hw) / C.w, (pos.getY(i) + hh) / C.h);
        const front = new THREE.Mesh(plane, ink(true));
        front.position.z = surf + 0.0006;
        const reverse = new THREE.Mesh(plane, ink(false));
        reverse.rotation.y = Math.PI;
        reverse.scale.x = -1;                                      // mirrored, as seen through the back
        reverse.position.z = surf - 0.0006;
        group.add(front, reverse);

        // The stripe wrapping round: back face, top edge, bottom edge (edges a shade darker)
        const cx = -hw + (C.stripe.x + C.stripe.w / 2) * C.w, bw = C.stripe.w * C.w;
        const band = (w, h, color) => new THREE.Mesh(new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        const back = band(bw, C.h, C.stripe.color);
        back.rotation.y = Math.PI;
        back.position.set(cx, 0, -(surf + 0.0006));
        const top = band(bw, full + 0.0012, 0xe07b00);
        top.rotation.x = -Math.PI / 2;
        top.position.set(cx, hh + C.bevel + 0.0006, 0);
        const bottom = band(bw, full + 0.0012, 0xe07b00);
        bottom.rotation.x = Math.PI / 2;
        bottom.position.set(cx, -(hh + C.bevel + 0.0006), 0);
        group.add(back, top, bottom);

        return {
            group,
            setFace(tex) {
                tex.colorSpace = THREE.SRGBColorSpace;
                const old = front.material.map;
                for (const m of [front.material, reverse.material]) {
                    m.map = tex; m.visible = true; m.needsUpdate = true;
                }
                if (old && old !== tex) old.dispose();
            },
            dispose() {
                group.traverse(o => {
                    o.geometry?.dispose();
                    if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
                });
            },
        };
    },


    /* ── Stickers on the 3D card ──────────────────────────────────────
       A sticker sits on a face ('front' | 'back') at (x_pct, y_pct) as seen
       looking at that face (top-left origin), with a scale and a clockwise
       rotation — the same numbers card_gen.py uses. Anything past an edge
       wraps round it, over the card's thickness, onto the other face; past
       a corner it folds twice. Like a real sticker.

       "Face coordinates" below: card units, centre origin, x right / y up
       as seen looking at that face. */
    STICKER_BASE: 0.09,                 // sticker width at scale 1, × card width (= card_gen.py)

    _cardEdges() {
        const C = Utils.CARD, S = Utils.cardFrontZ();
        return { Hx: C.w / 2 + C.bevel, Hy: C.h / 2 + C.bevel, S, T: 2 * S };   // T = distance round the edge
    },

    /* A point in face coordinates → card-local 3D (into `out`), folding over
       the edges: left/right first, then top/bottom. `lift` is the distance off
       the surface; negative = just inside the plastic. */
    placeOnCard(face, x, y, lift, out) {
        const { Hx, Hy, S, T } = Utils._cardEdges();
        let side = 1, edgeZ = null;                 // side: 1 = this face, -1 = folded onto the other
        const fold = (p, H) => {
            const d = Math.abs(p) - H;
            if (d <= 0) return p;
            if (d <= T) { edgeZ = side * (S - d); return Math.sign(p) * (H + lift); }   // on the edge itself
            side = -side;
            return Math.sign(p) * (H - (d - T));    // continues on the other face, heading back in
        };
        x = fold(x, Hx);
        if (edgeZ === null) y = fold(y, Hy);
        const z = edgeZ ?? side * (S + lift);
        return face === 'back' ? out.set(-x, y, -z) : out.set(x, y, z);
    },

    /* Card-local point on a face plane → that face's coordinates */
    faceCoords(face, local) {
        return { x: face === 'back' ? -local.x : local.x, y: local.y };
    },

    pctToFace(s) { return { x: (s.x_pct - 0.5) * Utils.CARD.w, y: (0.5 - s.y_pct) * Utils.CARD.h }; },
    faceToPct(x, y) { return { x_pct: x / Utils.CARD.w + 0.5, y_pct: 0.5 - y / Utils.CARD.h }; },

    /* Keep a sticker's centre on a face. A centre pushed past an edge by more
       than half the edge carries on round onto the other face (where the fold
       would take it, turned to match); otherwise it's held at the edge.
       `eager` (arrow keys) goes round as soon as it's pushed past the card at
       all — small key steps would otherwise be pulled back every time. Takes
       and returns a layout entry; x_pct / y_pct may start outside 0–1. */
    settleSticker(s, eager = false) {
        const C = Utils.CARD, { Hx, Hy, T } = Utils._cardEdges();
        let { x, y } = Utils.pctToFace(s), face = s.face || 'front', rotation = s.rotation;
        const flip = () => { face = face === 'front' ? 'back' : 'front'; };
        const dx = Math.abs(x) - Hx, dy = Math.abs(y) - Hy;
        const past = eager ? -C.bevel : T / 2;      // -bevel: anywhere beyond the printed edge
        if (dx > past) {                            // round the left/right edge
            x = -Math.sign(x) * (Hx - (dx - T));
            flip();
        } else if (dy > past) {                     // round the top/bottom edge: arrives upside down
            y = Math.sign(y) * (Hy - (dy - T));
            x = -x;
            rotation = (rotation + 180) % 360;
            flip();
        }
        x = Math.max(-C.w / 2, Math.min(C.w / 2, x));
        y = Math.max(-C.h / 2, Math.min(C.h / 2, y));
        return { ...s, face, rotation, ...Utils.faceToPct(x, y) };
    },

    /* The reverse of the fold: where a sticker's centre would be in the OTHER
       face's coordinates if it were unfolded back across the edge nearest
       (px, py) on that face — so its folded-over part can be grabbed and
       dragged from the side you're looking at. Returns { x, y, rotation }
       (x/y can be outside the card). */
    unfoldSticker(s, px, py) {
        const { Hx, Hy, T } = Utils._cardEdges();
        const { x, y } = Utils.pctToFace(s);
        const acrossSide = { x: Math.sign(-x || 1) * (2 * Hx + T - Math.abs(x)), y, rotation: s.rotation };
        const acrossTop  = { x: -x, y: Math.sign(y || 1) * (2 * Hy + T - Math.abs(y)), rotation: (s.rotation + 180) % 360 };
        const dist = u => Math.hypot(u.x - px, u.y - py);
        return dist(acrossSide) <= dist(acrossTop) ? acrossSide : acrossTop;
    },

    /* A sticker's 3D model: `direct` (printed side, outward, seen from its
       own side) and `through` (the same sticker seen from the other side,
       through the plastic: just inside the surface, opaque so the plastic's
       see-through pass includes it).
       The sticker is cut exactly along the fold lines (both sides of each
       edge), so every piece lies wholly on one surface — face, edge or the
       other face — where placeOnCard is a plain rotation/shift. The creases
       come out perfectly straight at any angle (a fixed grid zig-zags).
       set(s, layer, scaleMul) positions it; outline(s) gives a folded
       border for a selection line. */
    makeSticker(texture, aspect) {
        const mesh = mat => {
            const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
            m.frustumCulled = false;
            return m;
        };
        const direct  = mesh(new THREE.MeshBasicMaterial({
            map: texture, transparent: true, alphaTest: 0.01, depthWrite: false, toneMapped: false,
        }));
        const through = mesh(new THREE.MeshBasicMaterial({
            map: texture, alphaTest: 0.5, alphaToCoverage: true, toneMapped: false, side: THREE.BackSide,
        }));
        const p = new THREE.Vector3();

        // The fold lines, in face coordinates: each edge starts at ±H and ends at ±(H + T)
        const cuts = () => {
            const { Hx, Hy, T } = Utils._cardEdges();
            return { x: [-Hx - T, -Hx, Hx, Hx + T], y: [-Hy - T, -Hy, Hy, Hy + T] };
        };

        // A point of the unit sticker (u, v in −0.5…0.5) → face coordinates
        const toFace = (s, scaleMul) => {
            const w = Utils.STICKER_BASE * Utils.CARD.w * s.scale * scaleMul, h = w * aspect;
            const { x: cx, y: cy } = Utils.pctToFace(s);
            const a = -s.rotation * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);   // clockwise positive
            return (u, v) => ({ u, v, x: cx + u * w * c - v * h * sn, y: cy + u * w * sn + v * h * c });
        };
        const mix = (a, b, t) => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t,
                                    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

        // Split a convex polygon at axis = c into the parts either side
        const split = (poly, axis, c) => {
            const lo = [], hi = [];
            poly.forEach((a, i) => {
                const b = poly[(i + 1) % poly.length], da = a[axis] - c, db = b[axis] - c;
                if (da <= 0) lo.push(a);
                if (da >= 0) hi.push(a);
                if (da * db < 0) { const m = mix(a, b, da / (da - db)); lo.push(m); hi.push(m); }
            });
            return [lo, hi].filter(q => q.length >= 3);
        };

        // The sticker's outline cut into pieces along every fold line
        const pieces = (s, scaleMul) => {
            const f = toFace(s, scaleMul), C = cuts();
            let out = [[f(-0.5, -0.5), f(0.5, -0.5), f(0.5, 0.5), f(-0.5, 0.5)]];
            for (const c of C.x) out = out.flatMap(q => split(q, 'x', c));
            for (const c of C.y) out = out.flatMap(q => split(q, 'y', c));
            return out;
        };

        const build = (m, polys, face, lift) => {
            const pos = [], uv = [];
            for (const q of polys) {
                for (let i = 1; i < q.length - 1; i++) {              // fan: pieces are convex
                    for (const a of [q[0], q[i], q[i + 1]]) {
                        Utils.placeOnCard(face, a.x, a.y, lift, p);
                        pos.push(p.x, p.y, p.z);
                        uv.push(a.u + 0.5, a.v + 0.5);
                    }
                }
            }
            m.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            m.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
            m.geometry.computeBoundingSphere();
        };

        return {
            direct, through,
            // Later layers sit a hair further out (on top); inside, the order reverses
            set(s, layer = 0, scaleMul = 1) {
                const polys = pieces(s, scaleMul), face = s.face || 'front';
                build(direct,  polys, face,  0.004 + layer * 0.00001);
                build(through, polys, face, -(0.0005 - layer * 0.000008));
            },
            // Border just outside the sticker, split wherever it crosses a fold line
            outline(s) {
                const f = toFace(s, 1), C = cuts(), e = 0.56, pts = [];
                const corners = [f(-e, -e), f(e, -e), f(e, e), f(-e, e)];
                corners.forEach((a, i) => {
                    const b = corners[(i + 1) % 4], ts = [0];
                    for (const axis of ['x', 'y']) {
                        for (const c of C[axis]) {
                            const t = (c - a[axis]) / (b[axis] - a[axis]);
                            if (t > 0 && t < 1) ts.push(t);
                        }
                    }
                    ts.sort((m, n) => m - n).forEach(t => {
                        const q = mix(a, b, t);
                        pts.push(Utils.placeOnCard(s.face || 'front', q.x, q.y, 0.0045, new THREE.Vector3()));
                    });
                });
                return pts;
            },
            dispose() {
                for (const m of [direct, through]) { m.geometry.dispose(); m.material.dispose(); }
            },
        };
    },
});
