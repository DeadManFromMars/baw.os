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

    /* Per-frame spring factor made frame-rate independent: `perFrame` is
       the fraction closed per frame at 60fps, dtMs the real frame time. */
    springStep(perFrame, dtMs) {
        return 1 - Math.pow(1 - perFrame, Math.min(dtMs, 50) / (1000 / 60));
    },

    /* Sticker display image. Capital "I": web hosts are case-sensitive. */
    stickerSrc(slug) {
        return `Images/stickers/${slug}.png`;
    },

    /* ── 3D card model (inventory viewer + card editor) ──
       Proportions match card_gen.py's PNG (560×860 ≈ 1 : 1.535).
       Returns a rounded, bevelled geometry with the PNG mapped across
       the front: material 0 = face, 1 = edges. Needs Three.js. */
    CARD_DIMS: Object.freeze({ w: 1.0, h: 1.535, d: 0.022, radius: 0.06 }),

    makeCardGeometry() {
        const { w, h, d, radius: r } = Utils.CARD_DIMS;
        const hw = w / 2, hh = h / 2;

        const shape = new THREE.Shape();
        shape.moveTo(-hw + r, -hh);
        shape.lineTo(hw - r, -hh);   shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
        shape.lineTo(hw, hh - r);    shape.quadraticCurveTo(hw, hh, hw - r, hh);
        shape.lineTo(-hw + r, hh);   shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
        shape.lineTo(-hw, -hh + r);  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: d, bevelEnabled: true,
            bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 4, curveSegments: 12,
        });
        geo.center();

        // Planar UVs: the whole PNG spans the face, top-left origin
        const pos = geo.attributes.position;
        const uv  = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
            uv[i * 2]     =     (pos.getX(i) + hw) / w;
            uv[i * 2 + 1] = 1 - (pos.getY(i) + hh) / h;
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.computeVertexNormals();
        return geo;
    },
});
