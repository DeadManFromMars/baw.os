import * as THREE from 'three';

let seed = 1;
export const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export const GOLD = '#d6ab52', GOLD_DARK = '#8a6424', BLACK = '#0d0e0e', VERDE = '#16362d', CREAM = '#e9dcc0', RED = '#9c2a1e', TEAL = '#0f3b3f';

export function canvas(w, h, draw, s = 7) {
    seed = s;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
}
export function tex(c, rx = 1, ry = rx, color = true) {
    const t = new THREE.CanvasTexture(c);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 16;
    return t;
}

function veins(g, w, h, color, n, alpha, blur = 1.5) {
    g.strokeStyle = color;
    const pass = (count, a, width) => {
        for (let i = 0; i < count; i++) {
            g.globalAlpha = a * (0.3 + rnd()); g.lineWidth = width * (0.4 + rnd());
            let x = rnd() * w, y = rnd() * h, ang = rnd() * 6.28;
            g.beginPath(); g.moveTo(x, y);
            for (let k = 0; k < 24; k++) { ang += (rnd() - 0.5) * 0.9; x += Math.cos(ang) * w * 0.04; y += Math.sin(ang) * h * 0.04; g.lineTo(x, y); }
            g.stroke();
        }
    };
    g.filter = `blur(${blur}px)`; pass(n, alpha, 3); g.filter = 'none'; pass(n / 3, alpha * 0.9, 1);
    g.globalAlpha = 1;
}
export function marble(base, vein, { w = 1024, h = 1024, n = 60, alpha = 0.35, s = 3 } = {}) {
    return canvas(w, h, (g) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
            const x = rnd() * w, y = rnd() * h, r = (0.1 + rnd() * 0.3) * w, gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = gr; g.fillRect(0, 0, w, h);
        }
        veins(g, w, h, vein, n, alpha);
    }, s);
}

export function slabFloor(base, vein, { px = 2048, n = 4, s = 61 } = {}) {
    const sheet = marble(base, vein, { w: 2048, h: 2048, n: 110, alpha: 0.3, s });
    return canvas(px, px, (g) => {
        const q = px / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            g.save(); g.translate((i + 0.5) * q, (j + 0.5) * q); g.rotate(Math.floor(rnd() * 4) * Math.PI / 2); if (rnd() < 0.5) g.scale(-1, 1);
            g.drawImage(sheet, rnd() * (2048 - 900), rnd() * (2048 - 900), 900, 900, -q / 2, -q / 2, q, q);
            g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.05})`; g.fillRect(-q / 2, -q / 2, q, q);
            g.restore();
        }
        g.strokeStyle = 'rgba(8,12,10,.8)'; g.lineWidth = 3;
        for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(k * q, 0); g.lineTo(k * q, px); g.moveTo(0, k * q); g.lineTo(px, k * q); g.stroke(); }
    }, s + 1);
}

export function floor({ W = 36, L = 18, px = 4096 } = {}) {
    const h = Math.round(px * L / W);
    return canvas(px, h, (g) => {
        const m = px / W;
        const slab = marble('#e6dcc6', '#7d7462', { w: 1024, h: 1024, n: 60, alpha: 0.28, s: 11 });
        for (let x = 0; x < W; x += 3) for (let y = 0; y < L; y += 3) {
            g.save(); g.translate((x + 1.5) * m, (y + 1.5) * m); g.rotate(Math.floor(rnd() * 4) * Math.PI / 2);
            g.drawImage(slab, rnd() * 512, rnd() * 512, 512, 512, -1.5 * m, -1.5 * m, 3 * m, 3 * m); g.restore();
        }
        g.strokeStyle = 'rgba(60,50,35,.35)'; g.lineWidth = 1.2 * px / 2048;
        for (let x = 0; x <= W; x += 3) { g.beginPath(); g.moveTo(x * m, 0); g.lineTo(x * m, h); g.stroke(); }
        for (let y = 0; y <= L; y += 3) { g.beginPath(); g.moveTo(0, y * m); g.lineTo(px, y * m); g.stroke(); }
        const cx = W / 2 * m;
        const band = (half, color) => { g.fillStyle = color; g.fillRect(cx - half * m, 0, half * 2 * m, h); };
        band(5.2, BLACK); band(5.0, GOLD); band(4.85, VERDE); band(4.3, GOLD); band(4.2, '#f1e7d2');

        g.fillStyle = BLACK;
        for (let y = -1; y < L + 1; y += 1.5) {
            g.beginPath(); g.moveTo(cx - 3.6 * m, y * m); g.lineTo(cx, (y + 0.9) * m); g.lineTo(cx + 3.6 * m, y * m);
            g.lineTo(cx + 3.6 * m, (y + 0.25) * m); g.lineTo(cx, (y + 1.15) * m); g.lineTo(cx - 3.6 * m, (y + 0.25) * m); g.fill();
        }

        const my = L / 2 * m, R = 3.9 * m;
        g.save(); g.translate(cx, my);
        for (const [r, c] of [[R, BLACK], [R * 0.95, GOLD], [R * 0.9, VERDE], [R * 0.82, GOLD], [R * 0.79, '#f1e7d2']]) {
            g.fillStyle = c; g.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + Math.PI / 8; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill();
        }
        for (let k = 0; k < 32; k++) {
            const a = k / 32 * 6.283; g.fillStyle = k % 2 ? GOLD : BLACK;
            g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - 0.07) * R * 0.76, Math.sin(a - 0.07) * R * 0.76); g.lineTo(Math.cos(a + 0.07) * R * 0.76, Math.sin(a + 0.07) * R * 0.76); g.fill();
        }
        for (const [r, c] of [[R * 0.3, BLACK], [R * 0.27, GOLD], [R * 0.2, RED], [R * 0.08, GOLD]]) { g.fillStyle = c; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fill(); }
        g.restore();

        for (const side of [-1, 1]) { g.fillStyle = BLACK; g.fillRect(cx + side * 10.2 * m - 0.4 * m, 0, 0.8 * m, h); g.fillStyle = GOLD; g.fillRect(cx + side * 10.2 * m - 0.05 * m, 0, 0.1 * m, h); }
    }, 21);
}

export function laylight(px = 512) {
    return canvas(px, px * 2, (g, w, h) => {
        g.fillStyle = '#f7e2b0'; g.fillRect(0, 0, w, h);
        const c = w / 6;
        for (let i = 0; i < 6; i++) for (let j = 0; j < 12; j++) {
            const x = i * c, y = j * c, t = rnd();
            g.fillStyle = t < 0.25 ? '#e9b861' : t < 0.4 ? '#fff4d8' : t < 0.47 ? '#c98a3a' : '#f5dca0';
            g.fillRect(x, y, c, c);
            g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(x + c / 2, y); g.lineTo(x + c, y + c / 2); g.lineTo(x + c / 2, y + c); g.lineTo(x, y + c / 2); g.fill();
        }
        g.strokeStyle = '#3a2a14'; g.lineWidth = 6;
        for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c, h); g.stroke(); }
        for (let j = 0; j <= 12; j++) { g.beginPath(); g.moveTo(0, j * c); g.lineTo(w, j * c); g.stroke(); }
        g.lineWidth = 2.5;
        for (let i = 0; i < 6; i++) for (let j = 0; j < 12; j++) { const x = i * c, y = j * c; g.beginPath(); g.moveTo(x + c / 2, y); g.lineTo(x + c, y + c / 2); g.lineTo(x + c / 2, y + c); g.lineTo(x, y + c / 2); g.closePath(); g.stroke(); }
    }, 5);
}

export function windowGrille(w = 256, h = 768) {
    return canvas(w, h, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff6e2'); gr.addColorStop(1, '#ffe2a8');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2a2014';
        g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
        for (const x of [w / 3, 2 * w / 3]) g.fillRect(x - 3, 0, 6, h);
        for (let y = 60; y < h; y += 70) g.fillRect(0, y - 2, w, 4);
        g.lineWidth = 4; g.strokeStyle = '#2a2014';
        for (let k = 0; k < 4; k++) g.strokeRect(12 + k * 16, 12 + k * 14, w - 24 - k * 32, 90);
        g.beginPath(); for (let x = 0; x <= w; x += w / 8) g.lineTo(x, h - 80 + ((x / (w / 8)) % 2 ? -18 : 18)); g.stroke();
    }, 9);
}

export function windowFrame(w = 512, h = 1792) {
    return canvas(w, h, (g) => {
        g.clearRect(0, 0, w, h);
        const k = w / 256;
        g.fillStyle = '#3a2c1a'; g.strokeStyle = '#3a2c1a';
        g.fillRect(0, 0, w, 14 * k); g.fillRect(0, h - 14 * k, w, 14 * k); g.fillRect(0, 0, 14 * k, h); g.fillRect(w - 14 * k, 0, 14 * k, h);
        for (const x of [w / 3, 2 * w / 3]) g.fillRect(x - 3 * k, 0, 6 * k, h);
        for (let y = 60 * k; y < h; y += 64 * k) g.fillRect(0, y - 2 * k, w, 4 * k);
        g.lineWidth = 5 * k;
        for (let i = 0; i < 4; i++) g.strokeRect((12 + i * 16) * k, (12 + i * 14) * k, w - (24 + i * 32) * k, 90 * k);
        g.beginPath(); for (let x = 0; x <= w; x += w / 8) g.lineTo(x, h - 80 * k + ((x / (w / 8)) % 2 ? -18 : 18) * k); g.stroke();
        g.lineWidth = 3 * k;
        for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; g.beginPath(); g.moveTo(w / 2, 100 * k); g.lineTo(w / 2 + Math.cos(a) * 90 * k, 100 * k + Math.sin(a) * 80 * k); g.stroke(); }
    }, 9);
}

export const FACADE_M = [16, 32];
const FACADE_STYLE = {
    limestone: { wall: '#b3a488', deep: '#968870', glass: '#1a2028', trim: '#6a5a44', edge: '#cfc2a4' },
    brick:     { wall: '#5b3a2b', deep: '#4a2f22', glass: '#15191f', trim: '#c8b89a', edge: '#6e4a38' },
    black:     { wall: '#16161a', deep: '#0e0e11', glass: '#0b0d11', trim: '#b08a44', edge: '#2a2a30' },
};
function facadeWindow(g, kind, x, y) {
    g.beginPath();
    if (kind === 'brick') { const x0 = x + 13, x1 = x + 51, top = y + 22, r = (x1 - x0) / 2; g.moveTo(x0, y + 96); g.lineTo(x0, top + r); g.arc(x0 + r, top + r, r, Math.PI, 0); g.lineTo(x1, y + 96); }
    else if (kind === 'black') { const x0 = x + 9, x1 = x + 55, t = y + 12; g.moveTo(x0, y + 104); g.lineTo(x0, t + 10); g.lineTo(x0 + 6, t + 10); g.lineTo(x0 + 6, t + 4); g.lineTo(x0 + 12, t + 4); g.lineTo(x0 + 12, t); g.lineTo(x1 - 12, t); g.lineTo(x1 - 12, t + 4); g.lineTo(x1 - 6, t + 4); g.lineTo(x1 - 6, t + 10); g.lineTo(x1, t + 10); g.lineTo(x1, y + 104); }
    else { g.rect(x + 15, y + 14, 34, 86); }
    g.closePath();
}
function facadeMullions(g, kind, x, y, color) {
    g.fillStyle = color;
    if (kind === 'brick') { g.fillRect(x + 31, y + 22, 2, 74); g.fillRect(x + 13, y + 60, 38, 3); }
    else if (kind === 'black') { for (const k of [1, 2, 3]) g.fillRect(x + 9 + k * 11.5 - 1, y + 12, 2, 92); g.fillRect(x + 9, y + 58, 46, 2); }
    else { g.fillRect(x + 31, y + 14, 2, 86); g.fillRect(x + 15, y + 42, 34, 2); }
}
export function facade(kind = 'limestone', s = 91) {
    const w = 640, h = 1280, bw = 64, fh = 128, st = FACADE_STYLE[kind];
    const map = canvas(w, h, (g) => {
        g.fillStyle = st.wall; g.fillRect(0, 0, w, h);
        if (kind === 'brick') { g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 1); }
        if (kind === 'black') { g.fillStyle = 'rgba(255,255,255,.035)'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1); }
        for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,235' : '0,0,0'},${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
        for (let bx = 0; bx < 10; bx++) for (let f = 0; f < 10; f++) {
            const x = bx * bw, y = f * fh;
            if (kind === 'limestone') { g.fillStyle = st.deep; g.fillRect(x + 10, y, 44, fh); }
            if (kind === 'brick') { g.fillStyle = st.trim; g.fillRect(x + 9, y + 15, 46, 6); g.fillRect(x + 8, y + 96, 48, 5); }
            facadeWindow(g, kind, x, y); g.fillStyle = st.glass; g.fill();
            g.save(); facadeWindow(g, kind, x, y); g.clip();
            const sh = g.createLinearGradient(x, y, x + 40, y + 100); sh.addColorStop(0, 'rgba(170,150,170,.14)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(x, y, bw, fh); g.restore();
            facadeMullions(g, kind, x, y, st.trim);
            if (kind === 'limestone') {
                g.fillStyle = st.trim; g.fillRect(x + 15, y + 104, 34, 20);
                g.fillStyle = st.edge; g.beginPath(); g.moveTo(x + 15, y + 108); g.lineTo(x + 32, y + 120); g.lineTo(x + 49, y + 108); g.lineTo(x + 49, y + 112); g.lineTo(x + 32, y + 124); g.lineTo(x + 15, y + 112); g.fill();
            }
            if (kind === 'black') {
                g.strokeStyle = st.trim; g.lineWidth = 2.5; g.beginPath(); for (let k = 0; k <= 8; k++) g.lineTo(x + 9 + k * 5.75, y + 112 + (k % 2 ? 8 : 0)); g.stroke();
                g.fillStyle = st.trim; g.fillRect(x + 9, y + 106, 46, 2); g.fillRect(x + 9, y + 124, 46, 2);
            }
            g.fillStyle = st.edge; g.fillRect(x, y, 2, fh);
        }
        g.fillStyle = st.wall; g.fillRect(0, 0, 10, h);
    }, s);
    const emissive = canvas(w, h, (g) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        for (let f = 0; f < 10; f++) {
            const litFloor = rnd() < 0.4, hue = 30 + rnd() * 12, light = 48 + rnd() * 16;
            for (let bx = 0; bx < 10; bx++) {
                if (litFloor ? rnd() < 0.15 : rnd() > 0.07) continue;
                const x = bx * bw, y = f * fh;
                g.fillStyle = `hsl(${hue + (rnd() - 0.5) * 4},80%,${light + (rnd() - 0.5) * 8}%)`;
                facadeWindow(g, kind, x, y); g.fill();
                if (rnd() < 0.25) { g.save(); facadeWindow(g, kind, x, y); g.clip(); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, bw, 44); g.restore(); }
                facadeMullions(g, kind, x, y, '#000');
            }
        }
    }, s + 1);
    return { map, emissive };
}

export function flutes(n = 24, px = 1024) {
    return canvas(px, 4, (g, w) => {
        const img = g.createImageData(w, 4);
        for (let x = 0; x < w; x++) {
            const nx = Math.sin((x / w) * n * 2 * Math.PI) * 0.75, nz = Math.sqrt(1 - nx * nx);
            for (let y = 0; y < 4; y++) { const i = (y * w + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = 128; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255; }
        }
        g.putImageData(img, 0, 0);
    });
}

export function frieze(w = 1024, h = 128) {
    return canvas(w, h, (g) => {
        g.fillStyle = BLACK; g.fillRect(0, 0, w, h);
        g.fillStyle = GOLD; g.fillRect(0, 6, w, 4); g.fillRect(0, h - 10, w, 4);
        const u = h * 0.9;
        for (let x = 0; x < w; x += u) {
            g.strokeStyle = GOLD; g.lineWidth = 3;
            for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + u / 2, h - 12, (k + 1) * u * 0.09, Math.PI, 0); g.stroke(); }
            g.beginPath(); g.moveTo(x, h - 12); g.lineTo(x + u * 0.1, 16); g.lineTo(x + u * 0.2, h - 12); g.stroke();
        }
    }, 13);
}

function figure(g, x, y, s, arms = 'up', fill = '#e9c98a', line = GOLD) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = fill; g.strokeStyle = line; g.lineWidth = 3 / s;
    g.beginPath();
    g.moveTo(-18, -230); g.bezierCurveTo(-40, -120, -34, -40, -26, 0); g.lineTo(26, 0); g.bezierCurveTo(34, -40, 40, -120, 18, -230); g.closePath();
    g.fill(); g.stroke();
    for (let k = 1; k < 7; k++) { g.beginPath(); g.moveTo(-20 + k * 2, -220 + k * 8); g.lineTo(-22 + k * 7, 0); g.stroke(); }
    g.beginPath(); g.ellipse(0, -258, 17, 21, 0, 0, 6.283); g.fill(); g.stroke();
    g.beginPath();
    if (arms === 'up') { g.moveTo(-16, -226); g.lineTo(-58, -330); g.moveTo(16, -226); g.lineTo(58, -330); }
    else { g.moveTo(-16, -226); g.lineTo(-70, -200); g.moveTo(16, -226); g.lineTo(70, -200); }
    g.lineWidth = 11 / s * s; g.lineCap = 'round'; g.strokeStyle = fill; g.stroke(); g.lineWidth = 2; g.strokeStyle = line; g.stroke();
    g.restore();
}
function sunburst(g, x, y, r, n, a, b) {
    for (let k = 0; k < n; k++) {
        const t0 = Math.PI + (k / n) * Math.PI, t1 = Math.PI + ((k + 1) / n) * Math.PI;
        g.fillStyle = k % 2 ? a : b; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, t0, t1); g.fill();
    }
}
function skyline(g, w, base, colors, s) {
    for (let layer = 0; layer < colors.length; layer++) {
        g.fillStyle = colors[layer];
        let x = -20;
        while (x < w) {
            const bw = (30 + rnd() * 70) * s, bh = (120 + rnd() * 300) * s * (1 - layer * 0.18);
            g.beginPath(); g.moveTo(x, base);
            const steps = 2 + Math.floor(rnd() * 3); let y = base - bh * 0.6, xx = x;
            g.lineTo(x, y);
            for (let k = 0; k < steps; k++) { xx += bw * 0.12; g.lineTo(xx, y); y -= bh * 0.4 / steps; g.lineTo(xx, y); }
            g.lineTo(x + bw - (xx - x), y); for (let k = 0; k < steps; k++) { g.lineTo(x + bw - (xx - x) + k * bw * 0.12, y + k * bh * 0.4 / steps); g.lineTo(x + bw - (xx - x) + (k + 1) * bw * 0.12, y + k * bh * 0.4 / steps); }
            g.lineTo(x + bw, base); g.fill();
            x += bw * (0.8 + rnd() * 0.5);
        }
        base += 40 * s;
    }
}
export function mural(kind, w = 1024, h = 2048, s = 31) {
    return canvas(w, h, (g) => {
        const k = w / 1024;
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#0b2d31'); bg.addColorStop(0.55, '#15484a'); bg.addColorStop(1, '#06191b');
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        if (kind === 'sun' || kind === 'crown') {
            sunburst(g, w / 2, h * 0.52, h * 0.55, 36, '#1d5b58', '#0f3b3f');
            for (let r = 5; r > 0; r--) { g.fillStyle = r % 2 ? '#e0a64a' : '#f5d58a'; g.beginPath(); g.arc(w / 2, h * 0.34, r * 48 * k, 0, 6.283); g.fill(); }
            skyline(g, w, h * 0.78, ['#0a2426', '#123a3b', '#1c4d4a'], k);
            figure(g, w / 2, h * 0.93, 2.3 * k, 'up');
            if (kind === 'crown') for (let i = -1; i <= 1; i += 2) figure(g, w / 2 + i * 300 * k, h * 0.95, 1.6 * k, 'out', '#c9a26a');
        } else if (kind === 'wings') {
            g.fillStyle = '#0a2426'; g.fillRect(0, h * 0.8, w, h * 0.2);
            for (const side of [-1, 1]) for (let f = 0; f < 11; f++) {
                g.fillStyle = f % 2 ? '#e8c177' : '#b8873c';
                g.beginPath(); g.moveTo(w / 2, h * 0.42);
                const a = -0.15 - f * 0.13, len = (440 - f * 18) * k;
                g.quadraticCurveTo(w / 2 + side * len * 0.6, h * 0.42 - len * Math.sin(-a) * 0.9, w / 2 + side * len * Math.cos(a), h * 0.42 + len * Math.sin(a));
                g.lineTo(w / 2 + side * 20 * k, h * 0.42 + 30 * k); g.fill();
            }
            for (let r = 4; r > 0; r--) { g.fillStyle = r % 2 ? GOLD : RED; g.beginPath(); g.arc(w / 2, h * 0.42, r * 30 * k, 0, 6.283); g.fill(); }
            figure(g, w / 2, h * 0.95, 1.8 * k, 'out', '#d9b27a');
        } else if (kind === 'industry') {
            sunburst(g, w / 2, h, h * 0.9, 24, '#1a4f4c', '#0e3538');
            skyline(g, w, h * 0.7, ['#0a2426', '#143f40', '#1f5a55', '#2b6d63'], k * 1.2);
            g.strokeStyle = GOLD; g.lineWidth = 12 * k; g.lineJoin = 'miter';
            for (const x of [0.28, 0.72]) { g.beginPath(); g.moveTo(w * x, h * 0.08); g.lineTo(w * x - 60 * k, h * 0.28); g.lineTo(w * x + 30 * k, h * 0.3); g.lineTo(w * x - 50 * k, h * 0.5); g.stroke(); }
            for (const [x, y, r] of [[0.5, 0.3, 150], [0.33, 0.52, 90], [0.67, 0.55, 100]]) {
                g.save(); g.translate(w * x, h * y); g.fillStyle = '#c8943f';
                for (let t = 0; t < 16; t++) { g.rotate(Math.PI / 8); g.fillRect(-12 * k, -(r + 22) * k, 24 * k, 30 * k); }
                g.beginPath(); g.arc(0, 0, r * k, 0, 6.283); g.fill(); g.fillStyle = '#0b2d31'; g.beginPath(); g.arc(0, 0, r * 0.45 * k, 0, 6.283); g.fill(); g.restore();
            }
            figure(g, w / 2, h * 0.96, 1.9 * k, 'out', '#e0b87e');
        } else if (kind === 'aviation') {
            const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#081c2a'); sky.addColorStop(0.7, '#1c4a5a'); sky.addColorStop(1, '#3a6a66');
            g.fillStyle = sky; g.fillRect(0, 0, w, h);
            for (let b = 0; b < 7; b++) {
                const a = -Math.PI / 2 + (b - 3) * 0.2; g.fillStyle = `rgba(240,225,180,${0.07 + (b % 2) * 0.05})`;
                g.beginPath(); g.moveTo(w / 2 + (b - 3) * 60 * k, h); g.lineTo(w / 2 + Math.cos(a - 0.04) * h * 1.2, h + Math.sin(a - 0.04) * h * 1.2); g.lineTo(w / 2 + Math.cos(a + 0.04) * h * 1.2, h + Math.sin(a + 0.04) * h * 1.2); g.fill();
            }
            for (let c = 0; c < 5; c++) { g.fillStyle = c % 2 ? '#2d5f63' : '#244f55'; const y = h * (0.55 + c * 0.05); g.fillRect(0, y, w, h * 0.03); g.fillRect(w * (0.1 + rnd() * 0.3), y - h * 0.02, w * 0.4, h * 0.02); }
            g.save(); g.translate(w / 2, h * 0.32); g.rotate(-0.25);
            g.strokeStyle = GOLD; g.lineWidth = 4 * k;
            for (let l = 0; l < 6; l++) { g.beginPath(); g.moveTo(-420 * k, (l - 2.5) * 22 * k); g.lineTo(-160 * k, (l - 2.5) * 22 * k); g.stroke(); }
            g.fillStyle = '#e8c177'; g.beginPath(); g.ellipse(0, 0, 190 * k, 34 * k, 0, 0, 6.283); g.fill();
            g.fillStyle = '#c8943f'; g.beginPath(); g.moveTo(-20 * k, 0); g.lineTo(-90 * k, -230 * k); g.lineTo(-40 * k, -230 * k); g.lineTo(60 * k, 0); g.lineTo(-40 * k, 230 * k); g.lineTo(-90 * k, 230 * k); g.fill();
            g.beginPath(); g.moveTo(-150 * k, 0); g.lineTo(-200 * k, -80 * k); g.lineTo(-170 * k, 0); g.fill();
            g.fillStyle = BLACK; for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(60 * k - p * 38 * k, -6 * k, 8 * k, 0, 6.283); g.fill(); }
            g.restore();
            figure(g, w / 2, h * 0.97, 1.7 * k, 'up', '#d9b27a');
        } else if (kind === 'stars') {
            const sky = g.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, h * 0.7); sky.addColorStop(0, '#16335a'); sky.addColorStop(1, '#050b1a');
            g.fillStyle = sky; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,240,200,${0.2 + rnd() * 0.6})`; const r = rnd() < 0.95 ? 1.5 * k : 3.5 * k; g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 6.283); g.fill(); }
            const cx = w / 2, cy = h * 0.4;
            for (const [r, lw] of [[420, 6], [380, 3], [250, 4], [120, 3]]) { g.strokeStyle = GOLD; g.lineWidth = lw * k; g.beginPath(); g.arc(cx, cy, r * k, 0, 6.283); g.stroke(); }
            for (let t = 0; t < 72; t++) { const a = t / 72 * 6.283, r0 = t % 6 ? 395 : 380; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0 * k, cy + Math.sin(a) * r0 * k); g.lineTo(cx + Math.cos(a) * 420 * k, cy + Math.sin(a) * 420 * k); g.stroke(); }
            for (let c = 0; c < 6; c++) {
                const a = c / 6 * 6.283 + 0.3, ox = cx + Math.cos(a) * 315 * k, oy = cy + Math.sin(a) * 315 * k;
                const pts = Array.from({ length: 5 }, () => [ox + (rnd() - 0.5) * 110 * k, oy + (rnd() - 0.5) * 110 * k]);
                g.strokeStyle = 'rgba(245,213,138,.7)'; g.lineWidth = 2 * k; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
                g.fillStyle = '#fff4d8'; for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 5 * k, 0, 6.283); g.fill(); }
            }
            for (let r = 3; r > 0; r--) { g.fillStyle = r % 2 ? '#e0a64a' : '#f5d58a'; g.beginPath(); g.arc(cx, cy, r * 36 * k, 0, 6.283); g.fill(); }
            g.fillStyle = '#0a2426'; g.fillRect(0, h * 0.86, w, h * 0.14);
            figure(g, w / 2, h * 0.95, 1.8 * k, 'up', '#c9b9e0', GOLD);
        } else if (kind === 'bridge') {
            const sky = g.createLinearGradient(0, 0, 0, h * 0.7); sky.addColorStop(0, '#2a1a3a'); sky.addColorStop(1, '#d9803a');
            g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.7);
            for (let r = 6; r > 0; r--) { g.fillStyle = r % 2 ? '#f0b050' : '#f7d58a'; g.beginPath(); g.arc(w / 2, h * 0.62, r * 55 * k, Math.PI, 0); g.fill(); }
            for (let b = 0; b < 12; b++) { g.fillStyle = b % 2 ? '#0f3b3f' : '#16484a'; g.fillRect(0, h * 0.62 + b * h * 0.032, w, h * 0.032); }
            g.strokeStyle = 'rgba(245,213,138,.35)'; g.lineWidth = 3 * k; for (let b = 0; b < 9; b++) { g.beginPath(); g.moveTo(w * 0.3 + b * 8 * k, h * 0.64 + b * 30 * k); g.lineTo(w * 0.7 - b * 8 * k, h * 0.64 + b * 30 * k); g.stroke(); }
            const deck = h * 0.58;
            g.fillStyle = BLACK; g.fillRect(0, deck, w, 16 * k);
            for (const x of [0.22, 0.78]) {
                for (let t = 0; t < 4; t++) g.fillRect(w * x - (46 - t * 8) * k, deck - (380 + t * 60) * k, (92 - t * 16) * k, (380 + t * 60) * k + 60 * k);
                g.strokeStyle = GOLD; g.lineWidth = 4 * k; g.strokeRect(w * x - 26 * k, deck - 330 * k, 52 * k, 90 * k);
            }
            g.strokeStyle = GOLD; g.lineWidth = 6 * k;
            const top = deck - 560 * k;
            g.beginPath(); g.moveTo(-40 * k, deck - 120 * k); g.quadraticCurveTo(w * 0.1, deck - 20 * k, w * 0.22, top); g.quadraticCurveTo(w * 0.5, deck + 180 * k, w * 0.78, top); g.quadraticCurveTo(w * 0.9, deck - 20 * k, w + 40 * k, deck - 120 * k); g.stroke();
            g.lineWidth = 2 * k; for (let x = 0.24; x < 0.77; x += 0.025) { const u = (x - 0.22) / 0.56, y = top + (1 - (2 * u - 1) ** 2) * (deck + 90 * k - top) * 0.72; g.beginPath(); g.moveTo(w * x, y); g.lineTo(w * x, deck); g.stroke(); }
        } else if (kind === 'commerce') {
            sunburst(g, w / 2, h * 0.6, h * 0.7, 30, '#1d5b58', '#0f3b3f');
            for (let c = 0; c < 3; c++) {
                g.strokeStyle = '#c8943f'; g.lineWidth = 8 * k; const x = w * (0.12 + c * 0.14);
                g.beginPath(); g.moveTo(x, h * 0.62); g.lineTo(x, h * 0.3 + c * 30 * k); g.lineTo(x + 170 * k, h * 0.34 + c * 30 * k); g.stroke();
                g.lineWidth = 2 * k; g.beginPath(); g.moveTo(x + 150 * k, h * 0.34 + c * 30 * k); g.lineTo(x + 150 * k, h * 0.46); g.stroke();
            }
            g.fillStyle = '#e9dcc0'; g.beginPath(); g.moveTo(w * 0.28, h * 0.6); g.lineTo(w * 0.95, h * 0.6); g.lineTo(w * 0.9, h * 0.68); g.lineTo(w * 0.33, h * 0.68); g.fill();
            g.fillStyle = BLACK; g.fillRect(w * 0.33, h * 0.64, w * 0.57, 14 * k);
            g.fillStyle = '#e9dcc0'; for (let d = 0; d < 3; d++) g.fillRect(w * (0.42 + d * 0.03), h * (0.56 - d * 0.025), w * (0.4 - d * 0.1), h * 0.025);
            for (let f = 0; f < 3; f++) { const x = w * (0.52 + f * 0.1); g.fillStyle = RED; g.fillRect(x, h * 0.44, 46 * k, h * 0.07); g.fillStyle = BLACK; g.fillRect(x, h * 0.44, 46 * k, 18 * k); }
            for (let b = 0; b < 8; b++) {
                const y = h * 0.68 + b * 34 * k; g.fillStyle = b % 2 ? '#0f3b3f' : '#16484a'; g.fillRect(0, y, w, 34 * k);
                g.strokeStyle = GOLD; g.lineWidth = 3 * k; g.beginPath(); for (let x = -40 * k; x < w + 40 * k; x += 80 * k) g.arc(x + (b % 2) * 40 * k, y + 34 * k, 40 * k, Math.PI, 0); g.stroke();
            }
            g.fillStyle = '#0a2426'; g.fillRect(0, h * 0.9, w, h * 0.1);
            figure(g, w * 0.3, h * 0.97, 1.5 * k, 'out', '#e0b87e');
        } else {
            g.fillStyle = '#0a2426'; g.fillRect(0, h * 0.85, w, h * 0.15);
            for (let j = 0; j < 9; j++) {
                g.strokeStyle = j % 2 ? GOLD : '#9fd1c8'; g.lineWidth = 10 * k;
                for (const side of [-1, 1]) {
                    g.beginPath(); g.moveTo(w / 2, h * 0.84);
                    g.bezierCurveTo(w / 2 + side * (20 + j * 30) * k, h * (0.2 + j * 0.02), w / 2 + side * (120 + j * 55) * k, h * (0.15 + j * 0.03), w / 2 + side * (160 + j * 50) * k, h * 0.84);
                    g.stroke();
                }
            }
            for (let t = 0; t < 7; t++) { g.fillStyle = t % 2 ? '#c8943f' : '#e8c177'; g.fillRect(w / 2 - (300 - t * 40) * k, h * 0.84 + t * 22 * k, (600 - t * 80) * k, 22 * k); }
        }

        g.strokeStyle = GOLD; g.lineWidth = 14 * k; g.strokeRect(20 * k, 20 * k, w - 40 * k, h - 40 * k);
        g.lineWidth = 4 * k; g.strokeRect(46 * k, 46 * k, w - 92 * k, h - 92 * k);
        g.fillStyle = GOLD;
        for (let x = 46 * k; x < w - 46 * k; x += 40 * k) { g.beginPath(); g.moveTo(x, 60 * k); g.lineTo(x + 20 * k, 90 * k); g.lineTo(x + 40 * k, 60 * k); g.fill(); }

        for (let i = 0; i < 9000 * k * k; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,210' : '0,0,0'},${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 2 * k, 2 * k); }
    }, s);
}

export const ERA_FONT = 'Cinzel';

export function sign(text, { w = 1024, h = 256, bg = BLACK, fg = GOLD, font = ERA_FONT, size = 140, border = true, weight = 600 } = {}) {
    return canvas(w, h, (g) => {
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        if (border) { g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(12, 12, w - 24, h - 24); g.lineWidth = 1.5; g.strokeRect(22, 22, w - 44, h - 44); }
        const set = s => { g.font = `${weight} ${s}px "${font}", serif`; g.letterSpacing = `${Math.round(s * 0.12)}px`; };
        set(size); const fit = Math.min(size, size * (w - 90) / Math.max(1, g.measureText(text).width)); set(fit);
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, w / 2 + fit * 0.06, h / 2 + fit * 0.04);
    });
}
export function clockFace(px = 512) {
    return canvas(px, px, (g) => {
        const c = px / 2;
        g.fillStyle = '#f3e7cc'; g.beginPath(); g.arc(c, c, c * 0.98, 0, 6.283); g.fill();
        for (let k = 0; k < 12; k++) {
            const a = k / 12 * 6.283; g.save(); g.translate(c, c); g.rotate(a); g.fillStyle = BLACK;
            g.beginPath(); g.moveTo(-10, -c * 0.9); g.lineTo(10, -c * 0.9); g.lineTo(0, -c * 0.7); g.fill(); g.restore();
        }
        g.strokeStyle = GOLD; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c * 0.95, 0, 6.283); g.stroke();
    });
}

export function frond(w = 256, h = 512) {
    return canvas(w, h, (g) => {
        g.strokeStyle = '#1f4a2a'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w * 0.55, h / 2, w / 2, 0); g.stroke();
        for (let y = 20; y < h; y += 14) for (const s of [-1, 1]) {
            const len = Math.sin((y / h) * Math.PI) * w * 0.48;
            g.strokeStyle = `hsl(${120 + rnd() * 20},45%,${22 + rnd() * 12}%)`; g.lineWidth = 7;
            g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + s * len * 0.6, y - 10, w / 2 + s * len, y + 30); g.stroke();
        }
    }, 17);
}

export function wear(px = 1024, s = 131) {
    return canvas(px, px, (g, w) => {
        g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, w);
        for (let i = 0; i < 140; i++) {
            const x = rnd() * w, y = rnd() * w, r = (0.03 + rnd() * 0.14) * w, gr = g.createRadialGradient(x, y, 0, x, y, r);
            const v = rnd() < 0.5 ? 255 : 0; gr.addColorStop(0, `rgba(${v},${v},${v},${0.06 + rnd() * 0.1})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = gr; g.fillRect(0, 0, w, w);
        }
        g.lineCap = 'round';
        for (let i = 0; i < 60; i++) {
            g.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.05})`; g.lineWidth = 8 + rnd() * 30;
            const x = rnd() * w, y = rnd() * w, r = 40 + rnd() * 160; g.beginPath(); g.arc(x, y, r, rnd() * 6, rnd() * 6 + 1.5); g.stroke();
        }
        for (let i = 0; i < 900; i++) {
            g.strokeStyle = `rgba(255,255,255,${0.05 + rnd() * 0.12})`; g.lineWidth = 0.6 + rnd();
            const x = rnd() * w, y = rnd() * w, a = rnd() * 6.28, l = 6 + rnd() * 50;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
    }, s);
}

export function grain(px = 1024, s = 137) {
    return canvas(px, px, (g, w) => {
        const img = g.createImageData(w, w);
        for (let i = 0; i < w * w; i++) { const v = 128 + (rnd() - 0.5) * 70 + (rnd() < 0.02 ? -60 : 0); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
        g.putImageData(img, 0, 0);
        g.filter = 'blur(0.8px)'; g.drawImage(g.canvas, 0, 0); g.filter = 'none';
    }, s);
}

export function wood(px = 1024, s = 139) {
    return canvas(px, px, (g, w) => {
        g.fillStyle = '#3a2416'; g.fillRect(0, 0, w, w);
        for (let i = 0; i < 260; i++) {
            const y = rnd() * w, a = 0.05 + rnd() * 0.18;
            g.strokeStyle = rnd() < 0.5 ? `rgba(20,10,4,${a})` : `rgba(120,70,36,${a * 0.7})`; g.lineWidth = 1 + rnd() * 6;
            g.beginPath(); g.moveTo(0, y);
            for (let x = 0; x <= w; x += w / 16) g.lineTo(x, y + Math.sin(x / w * 6.28 * (1 + rnd() * 0.3) + i) * 6);
            g.stroke();
        }
        for (let i = 0; i < 6; i++) {
            const x = rnd() * w, y = rnd() * w; g.strokeStyle = 'rgba(15,8,3,.25)';
            for (let r = 4; r < 40; r += 5) { g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, r * 2.6, r * 0.7, 0, 0, 6.283); g.stroke(); }
        }
    }, s);
}

export function depositBoxes(cols = 24, rows = 10, s = 149) {
    const cw = 64, rh = 72;
    return canvas(cols * cw, rows * rh, (g, w, h) => {
        g.fillStyle = '#2a1f12'; g.fillRect(0, 0, w, h);
        g.font = `600 12px "${ERA_FONT}", serif`; g.textAlign = 'center';
        let n = 101;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const x = c * cw + 3, y = r * rh + 3, dw = cw - 6, dh = rh - 6, t = 0.85 + rnd() * 0.3;
            const gr = g.createLinearGradient(x, y, x + dw, y + dh); gr.addColorStop(0, `rgb(${214 * t | 0},${176 * t | 0},${98 * t | 0})`); gr.addColorStop(1, `rgb(${150 * t | 0},${116 * t | 0},${58 * t | 0})`);
            g.fillStyle = gr; g.fillRect(x, y, dw, dh);
            g.fillStyle = 'rgba(255,240,200,.35)'; g.fillRect(x, y, dw, 2); g.fillRect(x, y, 2, dh);
            g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y + dh - 2, dw, 2); g.fillRect(x + dw - 2, y, 2, dh);
            g.fillStyle = '#1a1208'; for (const kx of [0.35, 0.65]) { g.beginPath(); g.arc(x + dw * kx, y + dh * 0.55, 3.5, 0, 6.283); g.fill(); g.fillRect(x + dw * kx - 1, y + dh * 0.55, 2, 7); }
            g.fillStyle = '#3a2a12'; g.fillText(String(n++), x + dw / 2, y + 16);
        }
    }, s);
}

export function normalFrom(height, k = 3) {
    const w = height.width, h = height.height, src = height.getContext('2d').getImageData(0, 0, w, h).data;
    const H = (x, y) => src[((Math.min(h - 1, Math.max(0, y)) * w) + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
    return canvas(w, h, (g) => {
        const img = g.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const nx = -(H(x + 1, y) - H(x - 1, y)) * k, ny = (H(x, y + 1) - H(x, y - 1)) * k, l = Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
            img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
    });
}

export function guardian(kind = 'halo', s = 151) {
    const w = 512, h = 1792;
    const height = canvas(w, h, (g) => {
        g.fillStyle = '#404040'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#5a5a5a'; g.fillRect(18, 18, w - 36, h - 36);
        g.fillStyle = '#404040'; g.fillRect(40, 40, w - 80, h - 80);
        const cx = w / 2, feet = h - 150;
        if (kind === 'halo') for (let k = 0; k < 29; k++) {
            const a = Math.PI + k / 28 * Math.PI; g.strokeStyle = k % 2 ? '#6a6a6a' : '#787878'; g.lineWidth = 14;
            g.beginPath(); g.moveTo(cx, 640); g.lineTo(cx + Math.cos(a) * 230, 640 + Math.sin(a) * 230); g.stroke();
        }
        if (kind === 'wings') for (const sd of [-1, 1]) for (let f = 0; f < 9; f++) {
            g.fillStyle = f % 2 ? '#7a7a7a' : '#6c6c6c';
            g.beginPath(); g.moveTo(cx + sd * 30, 720 + f * 30); g.lineTo(cx + sd * (210 - f * 6), 380 + f * 70); g.lineTo(cx + sd * (200 - f * 6), 440 + f * 72); g.lineTo(cx + sd * 30, 780 + f * 30); g.fill();
        }
        g.fillStyle = '#9a9a9a'; g.fillRect(cx - 170, feet, 340, 80); g.fillStyle = '#8a8a8a'; g.fillRect(cx - 200, feet + 80, 400, 60);
        g.save(); g.filter = 'blur(10px)'; figure(g, cx, feet, 3.2, kind === 'halo' ? 'up' : 'out', '#d8d8d8', '#d8d8d8'); g.restore();
        figure(g, cx, feet, 3.2, kind === 'halo' ? 'up' : 'out', 'rgba(250,250,250,.55)', '#a8a8a8');
        if (kind === 'sword') { g.fillStyle = '#f0f0f0'; g.fillRect(cx - 9, 780, 18, 560); g.fillRect(cx - 60, 760, 120, 22); g.beginPath(); g.arc(cx, 745, 18, 0, 6.283); g.fill(); }
        for (let y = 60; y < 300; y += 36) { g.fillStyle = '#4a4a4a'; g.fillRect(60, y, w - 120, 6); }
    }, s);
    const soft = canvas(w, h, (g) => { g.filter = 'blur(2px)'; g.drawImage(height, 0, 0); });
    const color = canvas(w, h, (g) => {
        g.fillStyle = '#cdbf9f'; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'multiply'; g.filter = 'blur(6px) brightness(1.7) opacity(0.55)'; g.drawImage(height, 0, 0);
        g.globalCompositeOperation = 'source-over'; g.filter = 'none';
        for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,235' : '40,30,20'},${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
        const grime = g.createLinearGradient(0, 0, 0, h); grime.addColorStop(0, 'rgba(40,28,16,.35)'); grime.addColorStop(0.3, 'rgba(40,28,16,0)'); grime.addColorStop(1, 'rgba(40,28,16,.2)');
        g.fillStyle = grime; g.fillRect(0, 0, w, h);
    }, s + 1);

    const glow = canvas(w, h, (g) => {
        const H = soft.getContext('2d').getImageData(0, 0, w, h).data, C = color.getContext('2d').getImageData(0, 0, w, h).data, img = g.createImageData(w, h);
        const at = (x, y) => H[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
        for (let y = 0; y < h; y++) {
            const fall = 0.12 + 0.88 * (y / h) ** 2.2;
            for (let x = 0; x < w; x++) {
                const nx = -(at(x + 1, y) - at(x - 1, y)) * 5, nu = (at(x, y + 1) - at(x, y - 1)) * 5, l = Math.hypot(nx, nu, 1);
                const lit = Math.max(0, (-0.75 * nu + 0.66) / l) * fall * (0.2 + 1.1 * at(x, y)), i = (y * w + x) * 4;
                img.data[i] = C[i] * lit; img.data[i + 1] = C[i + 1] * lit * 0.86; img.data[i + 2] = C[i + 2] * lit * 0.62; img.data[i + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
    });
    return { color, normal: normalFrom(soft, 5), glow };
}

export function newsprint(w = 1024, h = 1408, s = 157) {
    return canvas(w, h, (g) => {
        const paper = g.createLinearGradient(0, 0, w, h); paper.addColorStop(0, '#e6dcc4'); paper.addColorStop(1, '#d8cbb0');
        g.fillStyle = paper; g.fillRect(0, 0, w, h);
        const ink = a => `rgba(38,33,28,${a})`, M0 = 40, cols = 6, gap = 18, cw = (w - M0 * 2 - (cols - 1) * gap) / cols;
        const word = (x, y, len, hgt, a) => { g.fillStyle = ink(a); let cx = x; while (cx < x + len - 2) { const lw = hgt * (0.35 + rnd() * 0.5); g.fillRect(cx, y, Math.min(lw, x + len - cx), hgt); cx += lw + hgt * 0.18; } };
        for (let x = M0; x < w - M0 - 40;) { const lw = 30 + rnd() * 90; word(x, 34, lw, 62, 0.85); x += lw + 34; }
        g.fillStyle = ink(0.8); g.fillRect(M0, 112, w - M0 * 2, 3); g.fillRect(M0, 136, w - M0 * 2, 1.5);
        for (let x = M0; x < w - M0 - 20;) { const lw = 20 + rnd() * 50; word(x, 120, lw, 9, 0.5); x += lw + 14; }
        for (let c = 0; c < cols; c++) {
            const x = M0 + c * (cw + gap); let y = 160;
            if (c > 0) { g.fillStyle = ink(0.35); g.fillRect(x - gap / 2, 160, 1, h - 200); }
            while (y < h - 40) {
                if (rnd() < 0.1) { for (let k = 0; k < 2; k++) { word(x, y, cw * (0.6 + rnd() * 0.4), 11, 0.75); y += 16; } y += 5; }
                if (c >= 1 && c <= 2 && y > 170 && y < 260) { const pw = cw * 2 + gap, ph = 250;
                    if (c === 1) { for (let py = 0; py < ph; py += 6) for (let px = 0; px < pw; px += 6) { const v = 0.5 + 0.5 * Math.sin(px * 0.02 + py * 0.013) * Math.cos(py * 0.03 - px * 0.007) + (rnd() - 0.5) * 0.3; g.fillStyle = ink(0.8); g.beginPath(); g.arc(x + px + 3, y + py + 3, Math.max(0.3, 2.9 * v), 0, 6.283); g.fill(); } }
                    y += ph + 14; word(x, y, cw * 0.8, 6, 0.5); y += 16; }
                const lines = 14 + Math.floor(rnd() * 30);
                for (let l = 0; l < lines && y < h - 40; l++) { word(x + (l === 0 ? 10 : 0), y, l === lines - 1 ? cw * (0.3 + rnd() * 0.5) : cw - (l === 0 ? 10 : 0), 4, 0.38 + rnd() * 0.1); y += 8; }
                y += 5;
            }
        }
        for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,235' : '60,50,35'},${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    }, s);
}

export function ash(px = 512, s = 211) {
    return canvas(px, px, (g) => {
        g.fillStyle = '#9c9891'; g.fillRect(0, 0, px, px);
        for (let i = 0; i < 60; i++) { const x = rnd() * px, y = rnd() * px, r = 20 + rnd() * 60, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rnd() < 0.5 ? '70,66,62' : '190,186,178'},0.25)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, px, px); }
        for (let i = 0; i < 26000; i++) { const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(55,52,48,${rnd() * 0.35})` : `rgba(215,211,204,${rnd() * 0.35})`; g.fillRect(rnd() * px, rnd() * px, 1, 1); }
        for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(20,18,16,${0.3 + rnd() * 0.4})`; g.fillRect(rnd() * px, rnd() * px, 1 + rnd(), 1 + rnd()); }
    }, s);
}

export const FLAP_CHARS = ' 0123456789';
export function flapAtlas(tw = 128, th = 192) {
    const n = FLAP_CHARS.length;
    return canvas(tw * n, th, (g) => {
        for (let i = 0; i < n; i++) {
            const x = i * tw;
            const gr = g.createLinearGradient(0, 0, 0, th); gr.addColorStop(0, '#26241f'); gr.addColorStop(0.49, '#1a1916'); gr.addColorStop(0.51, '#211f1b'); gr.addColorStop(1, '#151412');
            g.fillStyle = '#050505'; g.fillRect(x, 0, tw, th);
            g.fillStyle = gr; g.beginPath(); g.roundRect(x + 4, 3, tw - 8, th - 6, 8); g.fill();
            g.fillStyle = '#ece2c6'; g.font = `700 ${th * 0.66}px "${ERA_FONT}", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(FLAP_CHARS[i], x + tw / 2, th / 2 + th * 0.04);
            g.fillStyle = '#000'; g.fillRect(x, th / 2 - 2, tw, 4);
            g.fillStyle = '#6b6252'; for (const px of [x + 7, x + tw - 11]) g.fillRect(px, th / 2 - 5, 4, 10);
        }
    });
}

export function shopfront(s = 163) {
    const w = 512, h = 256;
    const tints = ['#ffc98a', '#e8b878', '#d8a060', '#c8b8a0'];
    const layout = [];
    const map = canvas(w, h, (g) => {
        g.fillStyle = '#6a5e4c'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#1a1612'; g.fillRect(0, 0, w, 44);
        g.fillStyle = '#b08a44'; g.fillRect(0, 42, w, 3); g.fillRect(0, 0, w, 3);
        let x = 10;
        while (x < w - 60) {
            const pw = 70 + rnd() * 70, door = rnd() < 0.25;
            layout.push({ x, pw, door, tint: tints[Math.floor(rnd() * tints.length)], lit: rnd() < 0.8 });
            g.fillStyle = '#2a2016'; g.fillRect(x - 4, 52, pw + 8, h - 70);
            g.fillStyle = door ? '#120e0a' : '#1c2024'; g.fillRect(x, 56, pw, h - (door ? 60 : 110));
            x += pw + 14;
        }
        g.fillStyle = '#4a4034'; g.fillRect(0, h - 40, w, 40);
    }, s);
    const emissive = canvas(w, h, (g) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        for (const p of layout) {
            if (!p.lit || p.door) continue;
            const gr = g.createLinearGradient(0, 56, 0, h - 54); gr.addColorStop(0, p.tint); gr.addColorStop(1, '#6a4a28');
            g.fillStyle = gr; g.fillRect(p.x, 56, p.pw, h - 110);
            g.fillStyle = 'rgba(0,0,0,.55)';
            for (let k = 0; k < 8; k++) g.fillRect(p.x + rnd() * p.pw * 0.9, h - 60 - rnd() * 90, 6 + rnd() * 16, 10 + rnd() * 30);
            g.fillRect(p.x, h - 90, p.pw, 4);
        }
    }, s + 1);
    return { map, emissive };
}

export function awning(a = '#5a1a18', b = '#d9c9a4', s = 167) {
    return canvas(256, 64, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? a : b; g.fillRect(x, 0, 16, h); } g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 8, w, 8); }, s);
}

export function asphalt(px = 1024, s = 171) {
    return canvas(px, px, (g, w) => {
        g.fillStyle = '#26231f'; g.fillRect(0, 0, w, w);
        for (let i = 0; i < 26000; i++) { const v = rnd() < 0.5 ? '200,190,170' : '0,0,0'; g.fillStyle = `rgba(${v},${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * w, 2, 2); }
        for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(0,0,0,${0.1 + rnd() * 0.15})`; g.fillRect(rnd() * w, rnd() * w, 60 + rnd() * 200, 40 + rnd() * 120); }
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
        for (let i = 0; i < 14; i++) { g.beginPath(); let x = rnd() * w, y = rnd() * w; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
    }, s);
}

export function carvedFrieze(s = 173) {
    const w = 2048, h = 256;
    const height = canvas(w, h, (g) => {
        g.fillStyle = '#505050'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#707070'; g.fillRect(0, 16, w, 18); g.fillRect(0, h - 34, w, 18);
        for (let x = 0; x < w; x += 256) {
            g.save(); g.filter = 'blur(3px)';
            for (let k = 0; k < 13; k++) { const a = Math.PI + k / 12 * Math.PI; g.strokeStyle = '#c8c8c8'; g.lineWidth = 12; g.beginPath(); g.moveTo(x + 128, 200); g.lineTo(x + 128 + Math.cos(a) * 120, 200 + Math.sin(a) * 140); g.stroke(); }
            g.fillStyle = '#e0e0e0'; g.beginPath(); g.arc(x + 128, 200, 36, Math.PI, 0); g.fill();
            g.restore();
            g.fillStyle = '#909090'; for (let k = 0; k < 4; k++) { g.fillRect(x + 6 + k * 8, 50 + k * 16, 10, h - 100 - k * 32); g.fillRect(x + 240 - k * 8, 50 + k * 16, 10, h - 100 - k * 32); }
        }
    }, s);
    const soft = canvas(w, h, (g) => { g.filter = 'blur(1.5px)'; g.drawImage(height, 0, 0); });
    const color = canvas(w, h, (g) => {
        g.fillStyle = '#c9bba0'; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'multiply'; g.filter = 'blur(4px) brightness(1.8) opacity(0.5)'; g.drawImage(height, 0, 0);
    }, s + 1);
    return { color, normal: normalFrom(soft, 4) };
}

export function ashlar(px = 1024, s = 197) {
    return canvas(px, px, (g, w) => {
        g.fillStyle = '#c4b597'; g.fillRect(0, 0, w, w);
        const ch = w / 8, bw = w / 4;
        for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
            const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * ch, t = (rnd() - 0.5) * 0.05;
            g.fillStyle = t > 0 ? `rgba(255,250,235,${t})` : `rgba(40,30,20,${-t})`; g.fillRect(x, y, bw, ch);
        }
        for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,235' : '30,24,16'},${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * w, 2, 2); }
        for (let r = 0; r < 8; r++) {
            const y = r * ch; g.fillStyle = 'rgba(70,58,44,.4)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,248,230,.12)'; g.fillRect(0, y + 2, w, 1);
            for (let c = -1; c < 5; c++) { const x = c * bw + (r % 2 ? bw / 2 : 0); g.fillStyle = 'rgba(70,58,44,.35)'; g.fillRect(x, y, 2, ch); }
        }
    }, s);
}

export function banner(s = 179) {
    return canvas(256, 384, (g, w, h) => {
        g.fillStyle = '#5a1512'; g.fillRect(0, 0, w, h);
        g.fillStyle = GOLD; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillRect(16, 0, 8, h); g.fillRect(w - 24, 0, 8, h);
        for (let k = 0; k < 15; k++) { const a = Math.PI + k / 14 * Math.PI; g.fillStyle = k % 2 ? GOLD : '#8a6424'; g.beginPath(); g.moveTo(w / 2, h * 0.62); g.arc(w / 2, h * 0.62, 90, a - 0.08, a + 0.08); g.fill(); }
        g.fillStyle = GOLD; g.beginPath(); g.arc(w / 2, h * 0.62, 26, Math.PI, 0); g.fill();
    }, s);
}

export function letterBoard(title = 'NOTICE', s = 181) {
    return canvas(512, 640, (g, w, h) => {
        g.fillStyle = '#161616'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#2a2a2a'; g.lineWidth = 1; for (let y = 8; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        if (title) {
            g.fillStyle = '#e8e2d4'; g.font = `600 40px "${ERA_FONT}", serif`; g.letterSpacing = '5px'; g.textAlign = 'center'; g.fillText(title, w / 2, 70); g.letterSpacing = '0px';
            for (let y = 130; y < h - 40; y += 48) { let x = 40; while (x < w - 60) { const l = 12 + rnd() * 70; if (x + l > w - 40) break; g.fillRect(x, y, l, 20); x += l + 16; } }
        }
    }, s);
}
