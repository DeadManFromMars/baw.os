/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   hand.js — the personified hands (a puppet each), for breakin.js

   const hand = Hands.create('right')    a hand; 'left' is the mirror image
   hand.pose('palm')                     swap the photo (POSES below)
   hand.place({ x, y, rot })             jump there (px, px, degrees)
   await hand.to({ x, y, rot }, ms, ease)   glide there
   hand.show(true / false)               fade in / out

   (x, y) is where the pose's `anchor` goes: the part of the hand
   that does the job (the palm for a slap, the fingertips for a pinch).
   To feel alive rather than tweened, each hand also breathes a little
   when still and leans into sideways movement (see frame()).

   The photos: one transparent PNG per pose (open palm, fist, grab,
   pinch, point, flick), the hand reaching in from the RIGHT (fingers
   towards the left). Until they're shot, every pose is hand.png with
   its name tagged on.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Hands = (() => {

    const SIZE = 260;           // px, the photo's box
    const LEAN = 0.012;         // degrees of lean per px/s of sideways speed…
    const MAX_LEAN = 14;        // …up to this
    const BREATHE = 3;          // px of idle drift

    /* anchor  the working point, as fractions of the photo's box
       turn    degrees that stand the photo in its "ready" angle, so breakin.js
               only says how far to tilt from there (a new photo = a new turn) */
    const POSES = {
        palm:  { src: 'Images/hand.png', label: 'OPEN PALM',   anchor: [0.45, 0.55], turn: -70 },
        fist:  { src: 'Images/hand.png', label: 'FIST',        anchor: [0.22, 0.47], turn: 0 },
        grab:  { src: 'Images/hand.png', label: 'GRAB',        anchor: [0.3, 0.5],   turn: 0 },
        pinch: { src: 'Images/hand.png', label: 'PINCH',       anchor: [0.22, 0.47], turn: 0 },
        point: { src: 'Images/hand.png', label: 'POINT',       anchor: [0.22, 0.47], turn: 0 },
        flick: { src: 'Images/hand.png', label: 'FLICK',       anchor: [0.22, 0.47], turn: 0 },
    };

    const hands = [];
    const lerp  = (a, b, t) => a + (b - a) * t;     // unclamped, so overshooting eases work

    function create(side = 'right') {
        const el  = document.createElement('div');
        el.className = 'hand-puppet';
        const img = el.appendChild(document.createElement('img'));
        img.alt = '';
        const tag = el.appendChild(document.createElement('span'));
        tag.className = 'hand-tag';
        if (side === 'left') tag.style.transform = 'translateX(-50%) scaleX(-1)';   // un-mirror the tag's text
        document.body.appendChild(el);

        const hand = {
            el, flip: side === 'left' ? -1 : 1,
            x: innerWidth + SIZE, y: innerHeight / 2, rot: 0,
            anchor: [0.5, 0.5], turn: 0, lean: 0, lastX: null, tween: null,
            seed: Math.random() * 10,

            pose(name) {
                const p = POSES[name];
                img.src = p.src;
                tag.textContent = p.label;
                hand.anchor = p.anchor;
                hand.turn   = p.turn;
                return hand;
            },
            place(spot) {
                Object.assign(hand, spot);
                hand.lastX = null;          // a jump isn't movement: no lean from it
                return hand;
            },
            to(spot, ms, ease = Utils.easing.easeInOutCubic) {
                return new Promise(resolve => {
                    hand.tween?.resolve();
                    hand.tween = { from: { x: hand.x, y: hand.y, rot: hand.rot }, to: { x: hand.x, y: hand.y, rot: hand.rot, ...spot },
                                   start: performance.now(), ms, ease, resolve };
                });
            },
            show(on) { el.classList.toggle('shown', on); return hand; },
        };
        hands.push(hand.pose('palm'));
        return hand;
    }

    let last = performance.now();
    function frame(now) {
        const dt = Math.max(now - last, 1) / 1000;
        last = now;
        for (const h of hands) {
            if (h.tween) {
                const { from, to, start, ms, ease, resolve } = h.tween;
                const t = Math.min((now - start) / ms, 1), e = ease(t);
                h.x = lerp(from.x, to.x, e);
                h.y = lerp(from.y, to.y, e);
                h.rot = lerp(from.rot, to.rot, e);
                if (t === 1) { h.tween = null; resolve(); }
            }
            // Lean into sideways movement (smoothed), and drift a little when still
            const vx   = h.lastX === null ? 0 : (h.x - h.lastX) / dt;
            h.lastX    = h.x;
            const lean = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, -vx * LEAN * h.flip));
            h.lean    += (lean - h.lean) * Utils.springStep(0.12, dt * 1000);
            const drift = Math.sin(now / 900 + h.seed) * BREATHE;

            const [ax, ay] = h.anchor;
            h.el.style.transform = `translate(${h.x}px, ${h.y + drift}px) rotate(${h.rot + h.lean + h.turn * h.flip}deg) `
                                 + `scale(${h.flip}, 1) translate(${-ax * SIZE}px, ${-ay * SIZE}px)`;
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return { create, SIZE };
})();
