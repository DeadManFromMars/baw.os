/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   face.js — the Chicago caller's head (chicago.js)

   Face.head(t, open)  the head at time t (s): split at the lips with the
                       jaw dropped `open` px, lit, pixelated.

   The light: a slanted shadow, dark above an edge just over his mouth,
   with thinning stripes below it, swaying slowly like he's riding in a
   car. It's laid on after the jaw moves (the light stays put and the jaw
   drops through it) and before the pixelation (so it breaks into blocks
   like the rest of him).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Face = (() => {
    const CUT = 522, PIXEL = 8, DROP = 32;         // the lips' line · block size · how far the jaw drops (4 blocks)
    const PAD = 40;                                // room below for the jaw (a whole number of blocks)
    const DARK = 0.93, DIM = 0.18;                 // the shadow · the whole face, a touch darker
    const EDGE = [582 * 0.3, CUT - 42, -35];       // the shadow's edge: through (x, y), at this angle°
    const STRIPES = [[12, 12], [30, 10], [46, 8], [60, 6], [72, 4]];   // [distance below the edge, thickness]
    const sway = t => 16 * Math.sin(t * 0.9) + 5 * Math.sin(t * 2.3 + 1);   // the ride (px along the diagonal)

    const img = new Image();
    const ready = new Promise(r => { img.onload = r; });
    img.src = '../../Images/chicago/head.png';

    const make = () => document.createElement('canvas');
    const raw = make(), lit = make(), mask = make(), small = make(), out = make();
    const rg = raw.getContext('2d'), lg = lit.getContext('2d'), mk = mask.getContext('2d'), sm = small.getContext('2d'), og = out.getContext('2d');

    // The lit bands across the diagonal: gaps between the stripes, then everything past them
    function lightBands(edge) {
        const bands = [];
        let from = edge;
        for (const [at, th] of STRIPES) { bands.push([from, edge + at]); from = edge + at + th; }
        bands.push([from, edge + 3000]);
        return bands;
    }

    function head(t, open = 0) {
        const W = img.width, H = img.height + PAD;
        if (raw.width !== W) {
            for (const c of [raw, lit, mask, out]) { c.width = W; c.height = H; }
            small.width = Math.ceil(W / PIXEL); small.height = Math.ceil(H / PIXEL);
        }
        // 1. split at the lips; the jaw drops in whole blocks, so it doesn't shimmer
        const drop = Math.min(PAD, Math.round(open / PIXEL) * PIXEL);
        rg.clearRect(0, 0, W, H);
        rg.drawImage(img, 0, 0, W, CUT, 0, 0, W, CUT);
        rg.drawImage(img, 0, CUT, W, img.height - CUT, 0, CUT + drop, W, img.height - CUT);

        // 2. the light: darkness everywhere, the lit bands cut out of it (in the slanted frame)
        mk.globalCompositeOperation = 'copy';
        mk.fillStyle = `rgba(0,0,0,${DARK})`; mk.fillRect(0, 0, W, H);
        mk.globalCompositeOperation = 'destination-out';
        mk.save(); mk.translate(EDGE[0], EDGE[1]); mk.rotate(EDGE[2] * Math.PI / 180);
        mk.fillStyle = '#000';
        for (const [a, b] of lightBands(sway(t))) mk.fillRect(-3 * W, a, 6 * W, b - a);
        mk.restore();
        lg.globalCompositeOperation = 'copy'; lg.drawImage(raw, 0, 0);
        lg.globalCompositeOperation = 'source-atop';                  // only where he is
        lg.fillStyle = `rgba(0,0,0,${DIM})`; lg.fillRect(0, 0, W, H);
        lg.drawImage(mask, 0, 0);

        // 3. pixelate
        sm.clearRect(0, 0, small.width, small.height);
        sm.drawImage(lit, 0, 0, small.width, small.height);
        og.clearRect(0, 0, W, H);
        og.imageSmoothingEnabled = false;
        og.drawImage(small, 0, 0, small.width * PIXEL, small.height * PIXEL);
        return out;
    }

    // h: the head's own height; the canvas `head` returns is PAD taller (room for the jaw)
    return { ready, head, PIXEL, DROP, get w() { return img.width; }, get h() { return img.height; } };
})();
