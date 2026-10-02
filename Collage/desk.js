import * as THREE from 'three';
import * as paper from './paper.js?v=40';

const S = paper.S, TAU = Math.PI * 2, IN = 2.54, V = (x, y, z) => new THREE.Vector3(x, y, z);
const LENS = 20;
export const SHEET = 0.02;
export const LEAF = 0.009;
export const DESK = { w: 190, h: 110 };
export const MAT = { w: 24 * IN, h: 18 * IN, tall: 0.3 };
export const CUTTER = { w: 16, h: 34, tall: 1, rail: 2, travel: 14, fence: 1, railW: 3, gap: .12, flip: 1.85, over: .35 };
export function cutterPose(obj, at, open) {
    const u = obj.userData; u.arm.rotation.z = -open * CUTTER.flip; u.slider.position.z = at - u.arm.position.z;
}
const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const texes = new WeakMap(), TEX_MAX = 4096;
function tex(img) {
    let t = texes.get(img);
    if (!t) {
        let src = img; const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = TEX_MAX / Math.max(w, h);
        if (k < 1) { src = canvasOf(Math.round(w * k), Math.round(h * k)); src.getContext('2d').drawImage(img, 0, 0, src.width, src.height); }
        t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
        texes.set(img, t);
    }
    return t;
}
export function warm(sh) { const m = matsOf(sh); for (const mat of [m.front, m.back]) if (mat.map && renderer) renderer.initTexture(mat.map); }
const drawable = img => img && (img instanceof HTMLCanvasElement || (img.complete && img.naturalWidth > 0));

let renderer, camera;
export const scene = new THREE.Scene();
const caster = new THREE.Raycaster(), ndc = new THREE.Vector2(), paperRoot = new THREE.Group(), scarRoot = new THREE.Group(), lineRoot = new THREE.Group();
export function start(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.background = new THREE.Color('#120805');
    camera = new THREE.PerspectiveCamera(LENS, 1, 10, 1200); camera.up.set(0, 0, -1);
    scene.add(new THREE.HemisphereLight('#fff3e0', '#7a6a5c', 1.35));
    const sun = new THREE.DirectionalLight('#fff1dc', 2); sun.position.set(-50, 140, -45);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -115, right: 115, top: 80, bottom: -80, near: 20, far: 330 });
    scene.add(sun, sun.target);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(DESK.w, DESK.h).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex(wood()), roughness: .42 }));
    top.receiveShadow = true;
    scene.add(top, scarRoot, paperRoot, lineRoot);
    ENV = surround(); for (const m of gloss) { m.envMap = ENV; m.needsUpdate = true; }
    resize();
}
export function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / Math.max(1, innerHeight); camera.updateProjectionMatrix();
}
export function aim(v) {
    camera.position.set(v.x, Math.cos(v.tilt) * v.dist, v.y + Math.sin(v.tilt) * v.dist);
    camera.near = Math.max(.5, Math.min(v.dist * .45, v.dist - 16)); camera.far = v.dist * 1.6 + 260; camera.updateProjectionMatrix();
    camera.lookAt(v.x, 0, v.y); camera.updateMatrixWorld();
}
export const span = dist => 2 * dist * Math.tan(LENS / 2 * Math.PI / 180);
const sight = (cx, cy) => { ndc.set(cx / innerWidth * 2 - 1, 1 - cy / innerHeight * 2); caster.setFromCamera(ndc, camera); return caster.ray; };
export function deskAt(cx, cy, h = 0) {
    const r = sight(cx, cy), t = (h - r.origin.y) / r.direction.y;
    return { x: r.origin.x + r.direction.x * t, y: r.origin.z + r.direction.z * t };
}
export function screenOf(p, h = 0) { const v = V(p.x, h, p.y).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }
export function pick(cx, cy, objs) {
    sight(cx, cy);
    const hit = caster.intersectObjects(objs, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.thing) o = o.parent;
    return o ? { thing: o.userData.thing, part: hit.object.userData.part } : null;
}
export const render = () => renderer.render(scene, camera);
export const info = () => renderer.info.render;

function wood() {
    const W = 4096, H = 2372, c = canvasOf(W, H), g = c.getContext('2d'), r = rng(11);
    const base = g.createLinearGradient(0, 0, 0, H); base.addColorStop(0, '#4c1a0d'); base.addColorStop(.5, '#5c2212'); base.addColorStop(1, '#45160a');
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
        const y = r() * H, h = 40 + r() * 140;
        const band = g.createLinearGradient(0, y - h, 0, y + h); band.addColorStop(0, 'rgba(30, 8, 3, 0)'); band.addColorStop(.5, `rgba(30, 8, 3, ${.08 + r() * .14})`); band.addColorStop(1, 'rgba(30, 8, 3, 0)');
        g.fillStyle = band; g.fillRect(0, y - h, W, h * 2);
    }
    for (let i = 0; i < 2600; i++) {
        const y = r() * H, x = r() * W - 200, len = 200 + r() * 900;
        g.strokeStyle = r() < .6 ? `rgba(22, 6, 2, ${.05 + r() * .1})` : `rgba(214, 122, 76, ${.03 + r() * .05})`; g.lineWidth = .6 + r() * .8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - .5) * 5); g.stroke();
    }
    for (let i = 0; i < 70000; i++) {
        g.fillStyle = `rgba(18, 5, 2, ${.08 + r() * .2})`; g.fillRect(r() * W, r() * H, 5 + r() * 26, 1);
    }
    for (let i = 0; i < 1500; i++) {
        const y = r() * H, dark = r() < .66, amp = 2 + r() * 14, len = 520 + r() * 2000, ph = r() * TAU, x = r() * W - 600, wave = 320 + r() * 520;
        g.strokeStyle = dark ? `rgba(26, 7, 3, ${.05 + r() * .17})` : `rgba(196, 104, 62, ${.03 + r() * .07})`; g.lineWidth = 1 + r() * 4;
        g.beginPath();
        for (let k = 0; k <= 24; k++) { const u = x + len * k / 24, v = y + Math.sin(ph + u / wave) * amp; k ? g.lineTo(u, v) : g.moveTo(u, v); }
        g.stroke();
    }
    return c;
}
function matArt() {
    const c = canvasOf(2400, 1800), g = c.getContext('2d'), x0 = 50, y0 = 50, n = 23, m = 17, ink = a => `rgba(206, 236, 208, ${a})`;
    g.fillStyle = '#2b6149'; g.fillRect(0, 0, 2400, 1800);
    const r = rng(5);
    for (let i = 0; i < 26000; i++) { g.fillStyle = r() < .5 ? 'rgba(0, 0, 0, .05)' : 'rgba(255, 255, 255, .035)'; g.fillRect(r() * 2400, r() * 1800, 2, 2); }
    const line = (ax, ay, bx, by, a, w) => { g.strokeStyle = ink(a); g.lineWidth = w; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); };
    for (let i = 0; i <= n * 2; i++) line(x0 + i * 50, y0, x0 + i * 50, y0 + m * 100, i % 2 ? .22 : .6, i % 2 ? 1.5 : 2.5);
    for (let j = 0; j <= m * 2; j++) line(x0, y0 + j * 50, x0 + n * 100, y0 + j * 50, j % 2 ? .22 : .6, j % 2 ? 1.5 : 2.5);
    for (let i = 0; i <= n * 8; i++) for (const y of [y0, y0 + m * 100]) line(x0 + i * 12.5, y, x0 + i * 12.5, y + (y === y0 ? 1 : -1) * (i % 4 ? 9 : 16), .6, 1.5);
    for (let j = 0; j <= m * 8; j++) for (const x of [x0, x0 + n * 100]) line(x, y0 + j * 12.5, x + (x === x0 ? 1 : -1) * (j % 4 ? 9 : 16), y0 + j * 12.5, .6, 1.5);
    line(x0, y0 + m * 100, x0 + m * 100, y0, .3, 2); line(x0, y0 + m * 100, x0 + m * 100 * Math.tan(Math.PI / 6), y0, .3, 2); line(x0, y0 + m * 100, x0 + n * 100, y0 + m * 100 - n * 100 * Math.tan(Math.PI / 6), .3, 2);
    g.fillStyle = ink(.85); g.font = '600 26px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i <= n; i++) { g.fillText(i, x0 + i * 100, 25); g.fillText(i, x0 + i * 100, 1775); }
    for (let j = 0; j <= m; j++) { g.fillText(m - j, 25, y0 + j * 100); g.fillText(m - j, 2375, y0 + j * 100); }
    return c;
}
function rulerArt(kind, len, wid) {
    const k = 60, c = canvasOf(Math.round(len * k), Math.round(wid * k)), g = c.getContext('2d'), metal = kind === 'metal', u0 = (metal ? .38 : .75) * k;
    if (metal) { g.fillStyle = '#141414'; g.fillRect(0, 0, c.width, c.height); }
    const ticks = (y, dir, step, count, size, color, w) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); for (let i = 0; i <= count; i++) { g.moveTo(u0 + i * step * k, y); g.lineTo(u0 + i * step * k, y + dir * size(i) * k); } g.stroke(); };
    g.textAlign = 'right'; g.textBaseline = 'middle';
    if (metal) {
        ticks(0, 1, IN / 16, 96, i => i % 16 ? i % 8 ? i % 4 ? i % 2 ? .16 : .24 : .34 : .46 : .62, '#d8d8d2', 1.2);
        ticks(c.height, -1, .1, 152, i => i % 10 ? i % 5 ? .22 : .38 : .56, '#d8d8d2', 1.2);
        g.fillStyle = '#d8d8d2';
        g.font = '18px Arial, sans-serif'; for (let n = 1; n <= 6; n++) g.fillText(n, u0 + n * IN * k - 6, .78 * k);
        g.font = '14px Arial, sans-serif'; for (let n = 1; n <= 15; n++) g.fillText(n, u0 + n * k - 4, c.height - .7 * k);
    } else {
        for (const [every, a] of [[1, .2], [4, .5]]) {
            g.strokeStyle = `rgba(200, 40, 35, ${a})`; g.lineWidth = 1.4; g.beginPath();
            for (let i = 0; i <= 48; i += every) { g.moveTo(u0 + i * IN / 4 * k, 0); g.lineTo(u0 + i * IN / 4 * k, c.height); }
            for (let j = every; j < 8; j += every) { g.moveTo(0, j * IN / 4 * k); g.lineTo(c.width, j * IN / 4 * k); }
            g.stroke();
        }
        ticks(0, 1, IN / 8, 96, i => i % 8 ? i % 4 ? i % 2 ? .14 : .2 : .28 : .4, 'rgba(26, 26, 24, .8)', 1.3);
        ticks(c.height, -1, .1, 304, i => i % 10 ? i % 5 ? .16 : .26 : .4, 'rgba(26, 26, 24, .8)', 1.2);
        g.fillStyle = 'rgba(26, 26, 24, .85)'; g.font = '600 22px Arial, sans-serif'; for (let n = 1; n <= 12; n++) g.fillText(n, u0 + n * IN * k - 7, .66 * k);
        g.font = '15px Arial, sans-serif'; for (let n = 1; n <= 30; n++) g.fillText(n, u0 + n * k - 4, c.height - .62 * k);
        g.strokeStyle = 'rgba(255, 255, 255, .7)'; g.lineWidth = 4; g.strokeRect(0, 0, c.width, c.height);
    }
    return c;
}
function cutterArt() {
    const C = CUTTER, k = 40, W = C.w * k, H = C.h * k, c = canvasOf(W, H), g = c.getContext('2d'), bx = (C.w / 2 + C.rail) * k, y0 = C.fence * k, y1 = H - 1.3 * k, m = .7 * k, ink = '#1b1b1e';
    g.fillStyle = '#f3f4f3'; g.fillRect(0, 0, W, H);
    g.strokeStyle = g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    const line = (ax, ay, zx, zy, w = 1.2, a = 1) => { g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.moveTo(ax, ay); g.lineTo(zx, zy); g.stroke(); g.globalAlpha = 1; };
    const text = (s, x, y, px = 20) => { g.font = `600 ${px}px Arial, sans-serif`; g.fillText(s, x, y); };
    for (let y = y0; y <= y1 + 1; y += IN * k) line(m, y, W - m, y, 1.3, .6);
    for (const way of [-1, 1]) for (let i = 1; ; i++) { const x = bx + way * i * IN / 2 * k; if (x < m || x > W - m) break; line(x, y0, x, y1, i % 2 ? .8 : 1.3, i % 2 ? .3 : .6); }
    line(m, y0, W - m, y0, 2); line(m, y1, W - m, y1, 2);
    for (const [y, s] of [[y0, 1], [y1, -1]]) for (const way of [-1, 1]) {
        for (let mm = 1; ; mm++) { const x = bx + way * mm * k / 10; if (x < m || x > W - m) break; line(x, y, x, y + s * (mm % 10 ? mm % 5 ? .16 : .26 : .38) * k, 1); if (mm % 10 === 0 && Math.abs(x - bx) > C.railW / 2 * k) text(mm / 10, x, y + s * .62 * k, 19); }
        for (let q = 1; ; q++) { const x = bx + way * q * IN / 8 * k; if (x < m || x > W - m) break; line(x, y + s * .92 * k, x, y + s * (.92 + (q % 8 ? q % 4 ? q % 2 ? .1 : .16 : .22 : .3)) * k, 1); if (q % 8 === 0) text(q / 8, x - 9, y + s * 1.42 * k, 24); }
    }
    const rx = bx + (C.railW / 2 + .35) * k;
    for (let e = 0; y0 + e * IN / 8 * k <= y1 + 1; e++) { const y = y0 + e * IN / 8 * k; line(rx, y, rx + (e % 8 ? e % 4 ? e % 2 ? .12 : .18 : .26 : .38) * k, y, 1); if (e && e % 8 === 0) { g.save(); g.translate(rx + .72 * k, y); g.rotate(Math.PI / 2); text(e / 8, 0, 0, 18); g.restore(); } }
    line(bx, 0, bx, H, 3, .8);
    const cy = (y0 + y1) / 2;
    for (const deg of [15, 30, 45, 60, 75]) for (const s of [-1, 1]) {
        const a = deg * Math.PI / 180, far = Math.min((bx - m - .3 * k) / Math.sin(a), (cy - y0 - 1.9 * k) / Math.cos(a)), ex = bx - Math.sin(a) * far, ey = cy - s * Math.cos(a) * far, lx = bx - Math.sin(a) * far * .72, ly = cy - s * Math.cos(a) * far * .72;
        line(bx, cy, ex, ey, 1.4); g.beginPath(); g.arc(ex, ey, 5, 0, TAU); g.fill();
        g.fillStyle = '#f3f4f3'; g.beginPath(); g.arc(lx, ly, 17, 0, TAU); g.fill(); g.lineWidth = 1.4; g.stroke(); g.fillStyle = ink; text(deg + '°', lx + 1, ly + 1, 16);
    }
    return c;
}
function cardArt() {
    const c = canvasOf(256, 256), g = c.getContext('2d'), r = rng(3);
    g.fillStyle = '#a89468'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) { g.fillStyle = r() < .55 ? `rgba(62, 42, 16, ${.04 + r() * .09})` : `rgba(255, 242, 206, ${.03 + r() * .08})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1); }
    return c;
}
function shadeArt() {
    const c = canvasOf(128, 128), g = c.getContext('2d');
    for (const [x0, y0, x1, y1] of [[0, 0, 44, 0], [128, 0, 84, 0], [0, 0, 0, 44], [0, 128, 0, 84]]) { const f = g.createLinearGradient(x0, y0, x1, y1); f.addColorStop(0, 'rgba(20, 12, 4, .5)'); f.addColorStop(1, 'rgba(20, 12, 4, 0)'); g.fillStyle = f; g.fillRect(0, 0, 128, 128); }
    return c;
}

const gloss = []; let ENV = null;
const shiny = (m, k = 1) => { m.envMapIntensity = k; m.envMap = ENV; gloss.push(m); return m; };
function surround() {
    const s = new THREE.Scene(), flat = (w, h, c, at, to) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide })); m.position.set(...at); m.lookAt(...to); s.add(m); };
    s.add(new THREE.Mesh(new THREE.BoxGeometry(60, 40, 60), new THREE.MeshBasicMaterial({ color: '#8f8a84', side: THREE.BackSide })));
    flat(60, 60, [.2, .09, .05], [0, -8, 0], [0, 0, 0]);
    flat(24, 18, [5, 4.7, 4.1], [-12, 19, -10], [0, 0, 0]);
    flat(16, 12, [2.2, 2.6, 3.2], [8, 6, -29], [0, 6, 0]);
    const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(s, .02).texture; pm.dispose();
    return t;
}
const M = {
    steel: shiny(new THREE.MeshStandardMaterial({ color: '#e4e7ea', metalness: 1, roughness: .22 })),
    dull: shiny(new THREE.MeshStandardMaterial({ color: '#b4b8be', metalness: 1, roughness: .45 })),
    alu: shiny(new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 1, roughness: .34 })),
    keen: shiny(new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: .08 })),
    grip: shiny(new THREE.MeshStandardMaterial({ color: '#0f0f11', roughness: .4 }), .3),
    black: new THREE.MeshStandardMaterial({ color: '#1b1b1e', roughness: .6 }),
    card: new THREE.MeshStandardMaterial({ map: tex(cardArt()), roughness: .9 }),
    dark: new THREE.MeshBasicMaterial({ map: tex(shadeArt()), transparent: true, depthWrite: false }),
    tube: shiny(new THREE.MeshStandardMaterial({ color: '#d9d5ca', roughness: .4 }), .4),
    knob: shiny(new THREE.MeshStandardMaterial({ color: '#8f8a7c', roughness: .5 }), .4),
    stick: new THREE.MeshStandardMaterial({ color: '#f7f4ea', roughness: .3 }),
    acrylic: new THREE.MeshStandardMaterial({ color: '#e4f6ef', roughness: .15, transparent: true, opacity: .5, depthWrite: false }),
    plastic: new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: .6 }),
    clear: new THREE.MeshStandardMaterial({ color: '#d5e9f0', roughness: .1, transparent: true, opacity: .17, depthWrite: false }),
    rim: new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .34, depthWrite: false, side: THREE.DoubleSide }),
    edge: new THREE.LineBasicMaterial({ color: '#fff', transparent: true, opacity: .2 }),
    wet: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .08, transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide }),
    torn: new THREE.MeshBasicMaterial({ color: '#f1ecdf', transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }),
    mark: new THREE.MeshBasicMaterial({ color: '#fbf7ec', transparent: true, opacity: .4, depthWrite: false, side: THREE.DoubleSide }),
    ridge: new THREE.MeshBasicMaterial({ color: '#2a1c0c', transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }),
    perf: new THREE.LineBasicMaterial({ color: '#150d05', transparent: true, opacity: .65 }),
    shade: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    scar: new THREE.MeshBasicMaterial({ color: '#170703', transparent: true, opacity: .85, side: THREE.DoubleSide }),
    unseen: new THREE.MeshBasicMaterial({ visible: false }),
    orange: new THREE.MeshStandardMaterial({ color: '#f28c1e', roughness: .45 }),
    frost: new THREE.MeshStandardMaterial({ color: '#f3f4f3', roughness: .3 }),
    dot: new THREE.MeshBasicMaterial({ color: '#fff', blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.ZeroFactor, depthTest: false, depthWrite: false, transparent: true }),
    knurl() {
        if (!M.knurled) {
            const c = canvasOf(64, 64), g = c.getContext('2d');
            g.fillStyle = '#b9bdc2'; g.fillRect(0, 0, 64, 64); g.strokeStyle = 'rgba(40, 42, 46, .55)'; g.lineWidth = 2;
            for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
            const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 7);
            M.knurled = shiny(new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 2, metalness: 1, roughness: .5 }));
        }
        return M.knurled;
    },
    glow: new THREE.MeshBasicMaterial({ color: '#e8372a', transparent: true, opacity: .5, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
};

function slab(points, depth, mat, y = 0, round = 0, hole) {
    const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    if (hole) s.holes.push(new THREE.Path().absellipse(hole[0], -hole[1], hole[2], hole[3], 0, TAU));
    const g = new THREE.ExtrudeGeometry(s, round ? { depth, bevelEnabled: true, bevelThickness: round, bevelSize: round, bevelSegments: 3, curveSegments: 28 } : { depth, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.y = y + round; m.castShadow = true;
    return m;
}
const turned = (profile, mat, seg = 32) => { const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(r, x)), seg).rotateZ(-Math.PI / 2), mat); m.castShadow = true; return m; };
const curve = (pts, n = 28) => new THREE.SplineCurve(pts.map(([x, z]) => new THREE.Vector2(x, z))).getPoints(n).map(p => [p.x, p.y]);
function plate(w, d, tall, r, top, side) {
    const s = new THREE.Shape(), x = w / 2, y = d / 2;
    s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.absarc(x - r, -y + r, r, -TAU / 4, 0); s.lineTo(x, y - r); s.absarc(x - r, y - r, r, 0, TAU / 4); s.lineTo(-x + r, y); s.absarc(-x + r, y - r, r, TAU / 4, TAU / 2); s.lineTo(-x, -y + r); s.absarc(-x + r, -y + r, r, TAU / 2, TAU * .75);
    const g = new THREE.ExtrudeGeometry(s, { depth: tall, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + .5, .5 - p.getZ(i) / d);
    return new THREE.Mesh(g, [top, side]);
}
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
let wire;
function clipWire() {
    if (wire) return wire;
    const pts = [], arc = (cx, cz, r, a0, a1) => { for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12; pts.push(V(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r)); } };
    const run = (x0, x1, z) => { for (let i = 0; i <= 6; i++) pts.push(V(x0 + (x1 - x0) * i / 6, 0, z)); };
    run(1, 2.5, -.275); arc(2.6, 0, .275, -TAU / 4, TAU / 4); run(2.5, .25, .275); arc(.15, -.075, .35, TAU / 4, TAU * .75); run(.25, 2.65, -.425); arc(2.75, 0, .425, -TAU / 4, TAU / 4); run(2.65, .9, .425);
    return wire = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 160, .045, 8).translate(-1.5, .045, 0);
}
export function make(kind) {
    const g = new THREE.Group(), inner = new THREE.Group();
    g.add(inner);
    if (kind === 'scalpel') {
        const R = .4;
        inner.add(slab([[0, .02], [2.7, .36], [3.6, .36], [3.6, -.3], [2.4, -.3]], .05, M.steel, -.025), slab([[0, .02], [2.4, -.3], [2.42, -.19], [.72, .03]], .07, M.keen, -.035),
                  turned([[3.05, 0], [3.05, .17], [3.62, .27], [3.7, .27]], M.dull), turned([[3.7, .3], [3.8, R], [6.5, R], [6.6, .32]], M.knurl()), turned([[6.6, .3], [6.82, .3]], M.dull),
                  turned([[6.82, .34], [6.9, R], [14.3, R], [14.5, .34], [14.6, .2], [14.6, 0]], M.alu));
        inner.position.x = -7.3;
        g.userData = { len: 14.6, wid: 2 * R, tall: 2 * R, lift: R, tip: V(-7.3, 0, 0), rolls: R };
    } else if (kind === 'scissors') {
        const steel = curve([[-1.3, -.3], [-.4, -.56], [1.5, -.6], [4.5, -.42], [7.3, -.17], [8.6, -.02]], 24).concat([[8.6, .05], [.2, .44], [-.9, .78], [-2.4, .8], [-2.4, .12]]);
        const half = side => {
            const h = new THREE.Group(), to = pts => pts.map(([x, z]) => [x, z * side]), [cx, cz, rx, rz, hx, hz] = side > 0 ? [-6.3, 1.62, 2.55, 1.5, 1.8, .92] : [-6, 1.65, 2.9, 1.5, 2.15, .95];
            const on = deg => [cx + rx * Math.cos(deg * Math.PI / 180), cz + rz * Math.sin(deg * Math.PI / 180)], mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], front = [[-1.5, .12], [-1.3, .8]];
            const round = [...front, mid(front[1], on(65))]; for (let a = 65; a <= 295; a += 10) round.push(on(a)); round.push(on(312), mid(on(312), front[0]));
            h.add(slab(to(steel), .07, M.steel, side > 0 ? .13 : .06));
            if (side > 0) h.add(slab(to([[8.6, .05], [.2, .44], [.2, .33], [8.1, -.02]]), .075, M.keen, .13));
            h.add(slab(new THREE.CatmullRomCurve3(to(round).map(([x, z]) => V(x, z, 0)), true, 'centripetal').getPoints(140).map(p => [p.x, p.y]), .25, M.grip, 0, .08, [cx, cz * side, hx, hz]));
            return h;
        };
        const halves = [half(1), half(-1)], slot = box(.46, .02, .07, M.black, 0, .285, 0); slot.rotation.y = .5;
        inner.add(...halves, new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .26, 20), M.dull).translateY(.15), slot);
        g.userData = { len: 18, wid: 6.4, tall: .45, lift: 0, tip: V(8.6, .13, 0), halves };
    } else if (kind === 'glue') {
        const knob = turned([[-5.05, 0], [-5.05, 1.1], [-4.95, 1.2], [-3.95, 1.2], [-3.87, 1.12], [-3.87, 0]], M.knob, 48), p = knob.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); if (Math.hypot(y, z) > 1.15) { const k = 1 - .02 * (1 + Math.cos(Math.atan2(z, y) * 24)); p.setXYZ(i, p.getX(i), y * k, z * k); } }
        knob.geometry.computeVertexNormals();
        inner.add(knob, turned([[-3.87, 1], [-3.78, 1], [-3.74, 1.15], [3, 1.15], [3.08, 1.07]], M.tube, 40), turned([[3.08, 1], [3.3, 1], [3.32, 1.05], [3.42, 1.05], [3.44, 1], [3.75, 1], [3.75, .94]], M.tube, 40), turned([[3.7, .92], [4.3, .92], [4.41, .86], [4.45, .7], [4.45, 0]], M.stick, 40));
        g.userData = { len: 9.9, wid: 2.4, tall: 2.4, lift: 1.2, tip: V(4.45, 0, 0), rolls: 1.2 };
    } else if (kind === 'clipbox') {
        inner.add(box(6.5, .12, 4.5, M.card, 0, .06), box(6.5, 2.2, .12, M.card, 0, 1.1, 2.19), box(6.5, 2.2, .12, M.card, 0, 1.1, -2.19), box(.12, 2.2, 4.5, M.card, 3.19, 1.1), box(.12, 2.2, 4.5, M.card, -3.19, 1.1));
        inner.add(new THREE.Mesh(new THREE.PlaneGeometry(6.26, 4.26).rotateX(-Math.PI / 2), M.dark).translateY(.135));
        const r = rng(9);
        for (let i = 0; i < 18; i++) {
            const c = new THREE.Mesh(clipWire(), M.steel), a = r() * TAU, ex = Math.abs(Math.cos(a)) * 1.72 + Math.abs(Math.sin(a)) * .45, ez = Math.abs(Math.sin(a)) * 1.72 + Math.abs(Math.cos(a)) * .45, tilt = .12 + i * .012;
            c.position.set((r() - .5) * 2 * Math.max(0, 3.05 - ex), .22 + i * .06, (r() - .5) * 2 * Math.max(0, 2.05 - ez)); c.rotation.set((r() - .5) * tilt, a, (r() - .5) * tilt); c.castShadow = c.receiveShadow = true; inner.add(c);
        }
        g.userData = { len: 6.5, wid: 4.5, tall: 2.2, lift: 0 };
    } else if (kind === 'clip') {
        const c = new THREE.Mesh(clipWire(), M.steel); c.castShadow = true; inner.add(c);
        g.userData = { len: 3.4, wid: .9, tall: .09, lift: 0, tip: V(-1.5, 0, 0) };
    } else if (kind === 'metal' || kind === 'clear') {
        const len = kind === 'metal' ? 6 * IN + .76 : 12 * IN + 1.5, wid = kind === 'metal' ? 1.9 : 2 * IN, tall = kind === 'metal' ? .1 : .2;
        const face = new THREE.MeshStandardMaterial({ map: tex(rulerArt(kind, len, wid)), roughness: .35, metalness: kind === 'metal' ? .3 : 0, transparent: kind !== 'metal', depthWrite: kind === 'metal' });
        if (kind === 'metal') inner.add(plate(len, wid, tall, .1, shiny(face, .3), M.black));
        else inner.add(plate(len, wid, tall, .15, M.clear, M.acrylic), new THREE.Mesh(new THREE.PlaneGeometry(len, wid).rotateX(-Math.PI / 2), face).translateY(tall + .002));
        inner.children[0].castShadow = kind === 'metal'; inner.children[0].receiveShadow = true;
        g.userData = { len, wid, tall, lift: 0 };
    } else if (kind === 'mat') {
        const top = new THREE.MeshStandardMaterial({ map: tex(matArt()), roughness: .85 }), side = new THREE.MeshStandardMaterial({ color: '#234f3c', roughness: .9 });
        const m = plate(MAT.w, MAT.h, MAT.tall, 1, top, side); m.receiveShadow = m.castShadow = true; inner.add(m);
        g.userData = { len: MAT.w, wid: MAT.h, tall: MAT.tall, lift: 0 };
    } else if (kind === 'cutter') {
        const C = CUTTER, top = new THREE.MeshStandardMaterial({ map: tex(cutterArt()), roughness: .35 }), part = (o, name) => { o.traverse(m => m.userData.part = name); return o; };
        const base = new THREE.Mesh(new THREE.BoxGeometry(C.w, C.tall, C.h), [M.frost, M.frost, top, M.frost, M.frost, M.frost]).translateY(C.tall / 2); base.receiveShadow = base.castShadow = true;
        const stop = [[-C.w / 2, C.rail - C.railW / 2 - .15], [C.rail + C.railW / 2 + 1, C.w / 2]].map(([a, b]) => box(b - a, .45, C.fence, M.frost, (a + b) / 2, C.tall + .225, -C.h / 2 + C.fence / 2));
        const arm = new THREE.Group(); arm.position.set(C.rail + C.railW / 2, C.tall + C.gap, 0);
        const len = C.h + 2 * C.over, hit = new THREE.Mesh(new THREE.BoxGeometry(C.railW, .9, len), M.unseen); hit.position.set(-C.railW / 2, .45, 0);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(C.railW, .45, len), M.clear); bar.position.set(-C.railW / 2, .225, 0);
        const ribs = [-1, 1].map(i => { const r = new THREE.Mesh(new THREE.BoxGeometry(.45, .8, len), M.clear); r.position.set(-C.railW / 2 + i * (C.railW / 2 - .225), .4, 0); return r; });
        const lips = [-1, 1].map(j => { const o = new THREE.Mesh(new THREE.BoxGeometry(C.railW, 1.1, .2), M.clear); o.position.set(-C.railW / 2, -.1, j * (len / 2 - .1)); return o; });
        const wire = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, len), M.black); wire.position.set(-C.railW / 2, .06, 0);
        const slider = new THREE.Group(), pad = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.5, 22).rotateZ(Math.PI / 2), M.orange); pad.scale.y = .7; pad.position.y = .85; pad.castShadow = true;
        slider.add(pad, box(1.7, .5, 2.3, M.orange, 0, .55, 0), box(1.72, .75, .12, M.dull, 0, 1.05, 0)); slider.position.x = -C.railW / 2;
        arm.add(part(hit, 'rail'), part(bar, 'rail'), ...ribs.map(r => part(r, 'rail')), ...lips.map(r => part(r, 'rail')), part(wire, 'rail'), part(slider, 'slider'));
        inner.add(base, ...stop, arm);
        g.userData = { len: C.w, wid: C.h, tall: C.tall, lift: 0, slider, arm };
    }
    else if (kind === 'tweezers') {
        const out = curve([[0, .04], [1.5, .11], [4, .27], [7, .41], [9, .43], [10.5, .3], [11.2, .2], [12, .2]], 40), inn = curve([[0, .012], [1.5, .05], [4, .2], [7, .33], [9, .34], [10.3, .17], [10.9, .01], [12, 0]], 40).map(([x, z]) => [x, Math.max(0, z)]).reverse();
        for (const side of [1, -1]) inner.add(slab(out.concat(inn).map(([x, z]) => [x, z * side]), .19, M.steel, .01));
        for (const x of [11.2, 11.7]) inner.add(new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .012, 12), M.dull).translateX(x).translateY(.2));
        inner.position.x = -6;
        g.userData = { len: 12, wid: .9, tall: .2, lift: 0, tip: V(-6, .05, 0) };
    }
    if (kind === 'clip' || kind === 'scissors' || kind === 'scalpel' || kind === 'tweezers') {
        const u = g.userData, hit = new THREE.Mesh(new THREE.BoxGeometry(u.len, Math.max(.3, u.tall), u.wid), M.unseen); hit.position.y = Math.max(.3, u.tall) / 2 - u.lift; g.add(hit);
    }
    return g;
}
export function makeStack(w, h, tall, img, paperColor) {
    const top = new THREE.MeshStandardMaterial(drawable(img) ? { map: tex(img), roughness: .9 } : { color: paperColor, roughness: .9 }), side = new THREE.MeshStandardMaterial({ color: paperColor, roughness: .9 });
    const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(w, tall, h), [side, side, top, side, side, side]).translateY(tall / 2);
    m.castShadow = m.receiveShadow = true; g.add(m); g.userData = { len: w, wid: h, tall, lift: 0 };
    return g;
}

export function makeMag(o) {
    const g = new THREE.Group(), side = new THREE.MeshStandardMaterial({ color: o.paper, roughness: .9 }), sx = -o.off;
    const pic = (img, round) => { if (!drawable(img)) return side; let t = tex(img); if (round) { t = t.clone(); t.needsUpdate = true; t.repeat.set(-1, -1); t.offset.set(1, 1); t.userData.own = true; } return new THREE.MeshStandardMaterial({ map: t, roughness: .9 }); };
    const hinge = o.swing ? new THREE.Group() : null;
    if (hinge) { hinge.position.x = sx; g.add(hinge); }
    const spine = new THREE.MeshStandardMaterial({ color: o.spine || '#19181b', roughness: .8 });
    const pile = (n, img, at, on, under) => {
        if (n <= 0) return;
        const tall = n * LEAF, inward = -at * o.dir > 0, m = new THREE.Mesh(new THREE.BoxGeometry(o.w, tall, o.h), [inward ? spine : side, inward ? side : spine, pic(img), on ? pic(under, true) : side, side, side]);
        m.position.set((on ? 0 : sx) + at * o.dir * o.w / 2, tall / 2, 0); m.castShadow = m.receiveShadow = true; (on || g).add(m);
    };
    pile(o.R, o.right, 1); pile(o.L, o.left, -1, hinge, o.under);
    g.userData = { len: o.both ? 2 * o.w : o.w, wid: o.h, tall: Math.max(.01, Math.max(o.L, o.R) * LEAF), lift: 0, hinge };
    return g;
}
export function magSwing(obj, a, y) { const h = obj.userData.hinge; if (h) { h.rotation.z = a; h.position.y = y; } }
export function scrap(obj) {
    const kept = new Set([...sheetMats.values()].flatMap(s => [s.front, s.back]));
    obj.removeFromParent(); obj.traverse(m => { if (!m.isMesh) return; m.geometry.dispose(); for (const x of [].concat(m.material)) if (!kept.has(x)) { if (x.map?.userData.own) x.map.dispose(); x.dispose(); } });
}
export function forget(sh) {
    const m = sheetMats.get(sh);
    if (m) { for (const k of ['front', 'back']) { m[k].map?.dispose(); m[k].dispose(); } sheetMats.delete(sh); }
    for (const img of [sh.front, sh.back]) { const t = img && texes.get(img); if (t) { t.dispose(); texes.delete(img); } }
}
export function lay(obj, x, y, h, ang, pitch = 0) { obj.position.set(x, h + obj.userData.lift, y); obj.rotation.set(0, -ang, pitch, 'YZX'); }
const bx = V(), by = V(), bz = V(), bm = new THREE.Matrix4(), tipW = V(), rimW = V();
function basis(obj, x, zHint) { bx.copy(x).normalize(); bz.copy(zHint).addScaledVector(bx, -zHint.dot(bx)).normalize(); by.crossVectors(bz, bx); obj.quaternion.setFromRotationMatrix(bm.makeBasis(bx, by, bz)); }
const SNIP = { pitch: 28 * Math.PI / 180, lean: 62 * Math.PI / 180 };
export function inHand(obj, kind, p, h, a = 0, low = 0) {
    if (kind === 'scissors') {
        const o = obj.userData.open || 0, X = V(Math.cos(a) * Math.cos(SNIP.pitch), -Math.sin(SNIP.pitch), Math.sin(a) * Math.cos(SNIP.pitch)), Z = V(-Math.sin(a) * Math.cos(SNIP.lean), Math.sin(SNIP.lean), Math.cos(a) * Math.cos(SNIP.lean));
        Z.addScaledVector(X, -Z.dot(X)).normalize();
        basis(obj, X.clone().multiplyScalar(Math.cos(o)).addScaledVector(Z, Math.sin(o)), Z.clone().multiplyScalar(Math.cos(o)).addScaledVector(X, -Math.sin(o)));
        tipW.set(8.6 * Math.cos(o), .13, -8.6 * Math.sin(o)).applyQuaternion(obj.quaternion); obj.position.set(p.x - tipW.x, h - tipW.y, p.y - tipW.z);
        return;
    }
    if (kind === 'glue') basis(obj, V(-.33 - .45 * low, -.9, -.28 - .3 * low), V(0, 0, 1));
    else if (low) basis(obj, V(Math.cos(a), low, Math.sin(a)), V(-Math.sin(a), 0, Math.cos(a)));
    else if (kind === 'scalpel' || kind === 'tweezers') basis(obj, V(.62, .64, .45), V(0, -1, 0));
    else basis(obj, V(Math.cos(a), 0, Math.sin(a)), V(-Math.sin(a), 0, Math.cos(a)));
    tipW.copy(obj.userData.tip).applyQuaternion(obj.quaternion);
    if (kind === 'glue' && low) tipW.addScaledVector(rimW.set(0, -1, 0).addScaledVector(bx, bx.y).normalize(), .86 * low);
    obj.position.set(p.x - tipW.x, h - tipW.y, p.y - tipW.z);
}
export function snip(obj, open) { obj.userData.open = open; obj.userData.halves[0].rotation.y = open; obj.userData.halves[1].rotation.y = -open; }

const sheetMats = new Map(), views = new Map(), tops = new Map(), lies = new WeakMap();
function matsOf(sh) {
    let m = sheetMats.get(sh);
    if (!m) sheetMats.set(sh, m = { front: new THREE.MeshStandardMaterial({ color: sh.paper, roughness: .9 }), back: new THREE.MeshStandardMaterial({ color: sh.paper, roughness: .9, side: THREE.BackSide }), ok: 0 });
    if (!m.ok && drawable(sh.front)) {
        m.front = new THREE.MeshStandardMaterial({ map: tex(sh.front), roughness: .9 });
        const ghost = canvasOf(512, Math.round(512 * sh.h / sh.w)), g = ghost.getContext('2d');
        g.fillStyle = sh.paper; g.fillRect(0, 0, ghost.width, ghost.height); g.globalAlpha = .07; g.drawImage(sh.front, 0, 0, ghost.width, ghost.height);
        m.back = new THREE.MeshStandardMaterial({ map: tex(ghost), roughness: .9, side: THREE.BackSide }); m.ok = 1;
    }
    if (m.ok === 1 && drawable(sh.back)) {
        const t = tex(sh.back).clone(); t.needsUpdate = true; t.repeat.x = -1; t.offset.x = 1;
        m.back = new THREE.MeshStandardMaterial({ map: t, roughness: .9, side: THREE.BackSide }); m.ok = 2;
    }
    return m;
}
function flat(paths, w = 1, h = 1) {
    const pos = [], uv = [], idx = [];
    for (const lump of paper.lumpsOf(paths)) {
        const rings = lump.map(r => r.map(q => new THREE.Vector2(q.X / S, q.Y / S))), base = pos.length / 3;
        for (const p of rings.flat()) { pos.push(p.x, 0, p.y); uv.push(p.x / w, 1 - p.y / h); }
        for (const f of THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
            const [a, b, c] = f.map(i => (base + i) * 3), up = (pos[b + 2] - pos[a + 2]) * (pos[c] - pos[a]) - (pos[b] - pos[a]) * (pos[c + 2] - pos[a + 2]) > 0;
            idx.push(base + f[0], base + f[up ? 1 : 2], base + f[up ? 2 : 1]);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
function dashes(lines, on = .13, off = .1) {
    const pos = [];
    for (const line of lines) {
        let from = 0;
        for (let i = 0; i < line.length - 1; i++) {
            const a = line[i], b = line[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
            for (let s = Math.ceil(from / (on + off)) * (on + off) - from; s < len; s += on + off) { const e = Math.min(len, s + on); if (s >= 0) pos.push(a.x + (b.x - a.x) * s / len, 0, a.y + (b.y - a.y) * s / len, a.x + (b.x - a.x) * e / len, 0, a.y + (b.y - a.y) * e / len); }
            from += len;
        }
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
}

const OUTLINES = false;
function build(l, sh, mats) {
    const group = new THREE.Group(); group.matrixAutoUpdate = false;
    const add = (o, y, more) => { o.position.y = y; Object.assign(o.userData, { dy: y }, more); group.add(o); return o; };
    const onBoth = (make, y) => { add(make(), y, { side: 1 }); add(make(), -y, { side: -1 }); };
    for (const part of paper.patches(l)) {
        const geo = flat(part.paths, sh.w, sh.h);
        for (const mat of [mats.front, mats.back]) add(new THREE.Mesh(geo, mat), 0, { over: part.over, casts: true, side: mat === mats.front ? 1 : -1 }).receiveShadow = true;
        if (!OUTLINES) continue;
        add(new THREE.Mesh(flat(paper.rim(part.paths, .04, .12)), M.rim), 0, { over: part.over, under: SHEET * .45 });
        for (const r of part.paths) for (const y of [.001, -.001]) add(new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(r.flatMap(q => [q.X / S, 0, q.Y / S]), 3)), M.edge), y, { over: part.over, side: Math.sign(y) });
    }
    for (const [face, y] of [['front', .002], ['back', -.002]]) { const wet = paper.glueOf(l, face); if (wet.length) add(new THREE.Mesh(flat(wet), M.wet), y, { side: Math.sign(y) }).receiveShadow = true; }
    const p = l.piece, torn = p.tears.length ? paper.strips(l, p.tears, .14) : [], old = p.marks.length ? paper.strips(l, p.marks, .06) : [], scored = p.perfs.length ? paper.linesOn(l, p.perfs) : [];
    if (torn.length) { const g = flat(torn); onBoth(() => new THREE.Mesh(g, M.torn), .0015); }
    if (old.length) { const g = flat(old); onBoth(() => new THREE.Mesh(g, M.mark), .0013); }
    const under = paper.ridgeOn(l);
    if (under.length) { const g = flat(under); onBoth(() => new THREE.Mesh(g, M.ridge), .0011); for (const ch of group.children.slice(-2)) ch.userData.ridge = true; }
    if (scored.length) { const g = dashes(scored); onBoth(() => new THREE.LineSegments(g, M.perf), .003); }
    const dark = { pos: [], col: [] };
    for (const s of paper.shades(l, .45)) {
        const at = flat(s.paths).toNonIndexed().attributes.position;
        for (let i = 0; i < at.count; i++) { dark.pos.push(at.getX(i), 0, at.getZ(i)); dark.col.push(0, 0, 0, .22 * Math.max(0, 1 - ((at.getX(i) - s.a.x) * s.n.x + (at.getZ(i) - s.a.y) * s.n.y) / .45)); }
    }
    if (dark.pos.length) {
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dark.pos, 3)).setAttribute('color', new THREE.Float32BufferAttribute(dark.col, 4));
        onBoth(() => new THREE.Mesh(g, M.shade), .0012);
    }
    return { group };
}
function drop(v) { v.group.removeFromParent(); v.group.traverse(o => o.geometry && o.geometry.dispose()); }
function touches(l, m) {
    if (l.box.x1 < m.box.x0 || m.box.x1 < l.box.x0 || l.box.y1 < m.box.y0 || m.box.y1 < l.box.y0) return false;
    let mine = lies.get(l.world); if (!mine) lies.set(l.world, mine = new WeakMap());
    if (!mine.has(m.world)) mine.set(m.world, paper.overlap(l, m) > .02);
    return mine.get(m.world);
}
function onPlate(l, pl) {
    let mine = lies.get(l.world); if (!mine) lies.set(l.world, mine = new WeakMap());
    if (!mine.has(pl.poly)) mine.set(pl.poly, paper.overPlate(l, pl.poly) > .05);
    return mine.get(pl.poly);
}
const overs = new WeakMap();
function onTool(l, o) {
    let mine = overs.get(l.world); if (!mine) overs.set(l.world, mine = new Map());
    let on = mine.get(o.sig);
    if (on == null) {
        if (mine.size > 40) mine.clear();
        const poly = [[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ X: Math.round((o.x + i * o.hl * o.c - j * o.hw * o.s) * paper.S), Y: Math.round((o.y + i * o.hl * o.s + j * o.hw * o.c) * paper.S) }))];
        mine.set(o.sig, on = paper.overPlate(l, poly) > .05);
    }
    return on;
}
function allOn(l, pl) {
    let mine = lies.get(l.world); if (!mine) lies.set(l.world, mine = new WeakMap());
    if (!mine.has(pl.ring)) mine.set(pl.ring, l.world.every(r => r.every(p => paper.inside(p, [pl.ring]))));
    return mine.get(pl.ring);
}
const mine = (pl, l, riding = riders.has(l.piece)) => pl.only ? pl.only.has(l.piece) : !riding && !(pl.not && pl.not.has(l.piece));
let riders = new Set();
const lays = new Map(), bases = new Map(), flatNow = new Map(); let last = null, lastBelow = new Map(), unsettled = false;

const STRIP = .22, STRIPS = 20, ROLL = Array.from({ length: STRIPS }, (_, k) => (k + 1) * STRIP);
function strips(geo, qOf, lines) {
    const g = geo.index ? geo.toNonIndexed() : geo, names = Object.keys(g.attributes).filter(n => n !== 'normal'), src = names.map(n => g.attributes[n]), out = names.map(() => []), P = g.attributes.position;
    const vert = i => ({ q: qOf(P.getX(i), P.getZ(i)), a: src.map(s => Array.from({ length: s.itemSize }, (_, c) => s.array[i * s.itemSize + c])) });
    const mix = (u, v, q) => { const f = (q - u.q) / (v.q - u.q); return { q, a: u.a.map((x, n) => x.map((c, j) => c + (v.a[n][j] - c) * f)) }; };
    const clip = (poly, q, above) => {
        const kept = [];
        poly.forEach((u, i) => { const v = poly[(i + 1) % poly.length], iu = above ? u.q >= q : u.q <= q, iv = above ? v.q >= q : v.q <= q; if (iu) kept.push(u); if (iu !== iv) kept.push(mix(u, v, q)); });
        return kept;
    };
    const emit = poly => { for (let i = 1; i < poly.length - 1; i++) for (const p of [poly[0], poly[i], poly[i + 1]]) p.a.forEach((x, n) => out[n].push(...x)); };
    for (let i = 0; i < P.count; i += 3) {
        let rest = [vert(i), vert(i + 1), vert(i + 2)];
        const lo = Math.min(...rest.map(p => p.q)), hi = Math.max(...rest.map(p => p.q));
        for (const q of lines) if (q > lo + 1e-6 && q < hi - 1e-6) { emit(clip(rest, q, false)); rest = clip(rest, q, true); }
        emit(rest);
    }
    const made = new THREE.BufferGeometry();
    names.forEach((n, j) => made.setAttribute(n, new THREE.Float32BufferAttribute(out[j], src[j].itemSize)));
    made.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(out[names.indexOf('position')].length), 3));
    return made;
}
function finer(geo, qOf, cell = GRID) {
    const P = geo.attributes.position, out = [];
    for (let i = 0; i < P.count; i++) {
        const j = (i + 1) % P.count, ax = P.getX(i), az = P.getZ(i), bx = P.getX(j), bz = P.getZ(j), qa = qOf ? qOf(ax, az) : 0, qb = qOf ? qOf(bx, bz) : 0;
        const n = !qOf ? Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / cell)) : Math.max(qa, qb) > 0 && Math.min(qa, qb) < STRIP * STRIPS ? Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STRIP)) : 1;
        for (let k = 0; k < n; k++) out.push(ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n);
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
}
function bendable(v, l, hg) {
    const W = l.W, qOf = (x, z) => (W[0] * x + W[2] * z + W[4] - hg.a.x) * hg.s.x + (W[1] * x + W[3] * z + W[5] - hg.a.y) * hg.s.y;
    recut(v, creaseKey(l, hg), (ch, old) => ch.isMesh ? strips(old, qOf, ROLL) : ch.isLineLoop ? finer(old, qOf) : old.clone());
}
function recut(v, about, make) {
    const items = [], olds = new Set(), done = new Map();
    for (const ch of v.group.children) {
        const old = ch.geometry, u = ch.userData, k = u.dy + '|' + (u.under || 0), was = done.get(old);
        olds.add(old); ch.frustumCulled = false;
        if (was && was.k === k && was.over === u.over) { ch.geometry = was.geo; items.push({ ch, base: was.base, twin: true }); continue; }
        ch.geometry = make(ch, old);
        const base = Float32Array.from(ch.geometry.attributes.position.array);
        done.set(old, { geo: ch.geometry, base, k, over: u.over }); items.push({ ch, base });
    }
    for (const g of olds) g.dispose();
    v.bent = { items, about };
}

const GRID = .8, SAG = 3;
function cutUp(v, l, about, along, cell = GRID) {
    const W = l.W, kx = Math.cos(along || 0), ky = Math.sin(along || 0);
    const A = along != null ? [W[0] * kx + W[1] * ky, W[4] * kx + W[5] * ky, W[2] * kx + W[3] * ky] : [1, 0, 0], B = along != null ? null : [0, 0, 1];
    recut(v, about, (ch, old) => ch.isMesh ? dice(old, A, B, cell) : ch.isLineLoop ? finer(old, null, cell) : old.clone());
}

function dice(geo, A, B, cell) {
    const P = geo.attributes.position, ix = geo.index, names = Object.keys(geo.attributes).filter(n => n !== 'normal' && n !== 'position'), src = names.map(n => geo.attributes[n]), size = src.map(s => s.itemSize), tris = (ix ? ix.count : P.count) / 3;
    let cap = Math.max(256, tris * 8), n = 0, pos = new Float32Array(cap * 3), ext = size.map(s => new Float32Array(cap * s));
    const room = more => {
        if (n + more <= cap) return;
        while (n + more > cap) cap *= 2;
        const p = new Float32Array(cap * 3); p.set(pos.subarray(0, n * 3)); pos = p;
        ext = ext.map((e, k) => { const f = new Float32Array(cap * size[k]); f.set(e.subarray(0, n * size[k])); return f; });
    };
    const s0 = new Float64Array(40), s1 = new Float64Array(40), s2 = new Float64Array(40), s3 = new Float64Array(40);
    const side = (inp, m, out, f, lim, sign) => {
        let k = 0;
        for (let i = 0; i < m; i++) {
            const j = i + 1 === m ? 0 : i + 1, x0 = inp[2 * i], z0 = inp[2 * i + 1], x1 = inp[2 * j], z1 = inp[2 * j + 1], d0 = sign * (f[0] * x0 + f[2] * z0 + f[1] - lim), d1 = sign * (f[0] * x1 + f[2] * z1 + f[1] - lim);
            if (d0 >= 0) { out[2 * k] = x0; out[2 * k + 1] = z0; k++; }
            if ((d0 >= 0) !== (d1 >= 0)) { const t = d0 / (d0 - d1); out[2 * k] = x0 + (x1 - x0) * t; out[2 * k + 1] = z0 + (z1 - z0) * t; k++; }
        }
        return k;
    };
    const lows = (inp, m, f) => { let a = Infinity; for (let i = 0; i < m; i++) a = Math.min(a, f[0] * inp[2 * i] + f[2] * inp[2 * i + 1] + f[1]); return Math.floor(a / cell + 1e-7); };
    const high = (inp, m, f) => { let b = -Infinity; for (let i = 0; i < m; i++) b = Math.max(b, f[0] * inp[2 * i] + f[2] * inp[2 * i + 1] + f[1]); return b - 1e-7; };
    let i0, i1, i2, x0, z0, x1, z1, x2, z2, det;
    const emit = (poly, m) => {
        let area = 0;
        for (let i = 0; i < m; i++) { const j = i + 1 === m ? 0 : i + 1; area += poly[2 * i] * poly[2 * j + 1] - poly[2 * j] * poly[2 * i + 1]; }
        if (m < 3 || Math.abs(area) < 1e-9) return;
        room((m - 2) * 3);
        for (let k = 1; k < m - 1; k++) for (let c = 0; c < 3; c++) {
            const q = c ? k + c - 1 : 0, x = poly[2 * q], z = poly[2 * q + 1], s = ((x - x0) * (z2 - z0) - (x2 - x0) * (z - z0)) / det, t = ((x1 - x0) * (z - z0) - (x - x0) * (z1 - z0)) / det;
            pos[3 * n] = x; pos[3 * n + 2] = z;
            for (let e = 0; e < ext.length; e++) { const a = src[e].array, w = size[e]; for (let d = 0; d < w; d++) { const v0 = a[i0 * w + d]; ext[e][n * w + d] = v0 + (a[i1 * w + d] - v0) * s + (a[i2 * w + d] - v0) * t; } }
            n++;
        }
    };
    for (let t = 0; t < tris; t++) {
        i0 = ix ? ix.getX(3 * t) : 3 * t; i1 = ix ? ix.getX(3 * t + 1) : 3 * t + 1; i2 = ix ? ix.getX(3 * t + 2) : 3 * t + 2;
        x0 = P.getX(i0); z0 = P.getZ(i0); x1 = P.getX(i1); z1 = P.getZ(i1); x2 = P.getX(i2); z2 = P.getZ(i2); det = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0);
        if (Math.abs(det) < 1e-12) continue;
        s0[0] = x0; s0[1] = z0; s0[2] = x1; s0[3] = z1; s0[4] = x2; s0[5] = z2;
        for (let a = lows(s0, 3, A), to = high(s0, 3, A); a * cell < to; a++) {
            const m = side(s1, side(s0, 3, s1, A, a * cell, 1), s2, A, (a + 1) * cell, -1);
            if (m < 3) continue;
            if (!B) { emit(s2, m); continue; }
            for (let b = lows(s2, m, B), tb = high(s2, m, B); b * cell < tb; b++) emit(s3, side(s1, side(s2, m, s1, B, b * cell, 1), s3, B, (b + 1) * cell, -1));
        }
    }
    const made = new THREE.BufferGeometry();
    made.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, n * 3), 3));
    names.forEach((name, k) => made.setAttribute(name, new THREE.BufferAttribute(ext[k].slice(0, n * size[k]), size[k])));
    made.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    return made;
}

function weld(b) {
    const ids = new Map(), xs = [], zs = [];
    for (const it of b.items) {
        if (it.twin) continue;
        const base = it.base, count = base.length / 3, at = it.at = new Uint32Array(count);
        for (let i = 0, j = 0; i < count; i++, j += 3) {
            const k = Math.round(base[j] * 2000) * 4194304 + Math.round(base[j + 2] * 2000);
            let id = ids.get(k);
            if (id === undefined) { ids.set(k, id = xs.length); xs.push(base[j]); zs.push(base[j + 2]); }
            at[i] = id;
        }
    }
    const n = xs.length;
    Object.assign(b, { px: Float32Array.from(xs), pz: Float32Array.from(zs), X: new Float32Array(n), Y: new Float32Array(n), H: new Float32Array(n), NX: new Float32Array(n), NY: new Float32Array(n), NZ: new Float32Array(n), cur: null, shaped: false });
}
const NEAR = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]];
function heights(v) {
    const it = v.bent.items.find(it => !it.twin && it.ch.isMesh && it.ch.userData.side) || v.bent.items.find(it => !it.twin && it.ch.isMesh && !it.ch.userData.under), pos = it && it.ch.geometry.attributes.position, base = it && it.base, sum = new Map();
    if (!pos || !pos.count) return null;
    const key = (x, y) => (Math.round(x) + 4096) * 8192 + Math.round(y) + 4096;
    let all = 0;
    for (let i = 0, j = 0; i < pos.count; i++, j += 3) { const h = pos.getY(i), k = key(base[j], base[j + 2]), c = sum.get(k); all += h; if (c) { c[0] += h; c[1]++; } else sum.set(k, [h, 1]); }
    const mean = all / pos.count;
    return (x, y) => { for (const [dx, dy] of NEAR) { const c = sum.get(key(x + dx, y + dy)); if (c) return c[0] / c[1]; } return mean; };
}
const fields = new WeakMap(); let fieldIds = 0;
function fieldAt(F, x, y, d = F.now) {
    const u = (F.M[0] * x + F.M[2] * y + F.M[4]) / F.cell - F.i0, w = (F.M[1] * x + F.M[3] * y + F.M[5]) / F.cell - F.j0, cu = u < 0 ? 0 : u > F.nx - 1 ? F.nx - 1 : u, cw = w < 0 ? 0 : w > F.nz - 1 ? F.nz - 1 : w;
    const i = Math.min(F.nx - 2, cu | 0), j = Math.min(F.nz - 2, cw | 0), fu = cu - i, fw = cw - j, k = j * F.nx + i, a = d[k], b = d[k + 1], c = d[k + F.nx], q = d[k + F.nx + 1];
    F.out = Math.hypot(u - cu, w - cw) * F.cell; F.range = Math.max(a, b, c, q) - Math.min(a, b, c, q);
    return (a * (1 - fu) + b * fu) * (1 - fw) + (c * (1 - fu) + q * fu) * fw;
}
function onSheet(F, x, y, K, thick) {
    const h = fieldAt(F, x, y, F.data), steep = F.range / .05;
    return h + thick + Math.max(K, F.K) * GRID / 4 * (steep > 1 ? 1 : steep) - K * Math.max(0, F.out - GRID);
}
const levels = new WeakMap();
function levelUnder(F, l) {
    let mine = levels.get(l.world); if (!mine) levels.set(l.world, mine = new Map());
    const was = mine.get(F.id);
    if (was && was.ver === F.ver) return was.level;
    const W = F.W, b = l.box, m = 2 * GRID; let lo = Infinity, hi = -Infinity;
    for (let j = 0, k = 0; j < F.nz; j++) for (let i = 0; i < F.nx; i++, k++) {
        const px = (F.i0 + i) * F.cell, pz = (F.j0 + j) * F.cell, x = W[0] * px + W[2] * pz + W[4], y = W[1] * px + W[3] * pz + W[5];
        if (x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m) { const h = F.data[k]; if (h < lo) lo = h; if (h > hi) hi = h; }
    }
    if (mine.size > 30) mine.clear();
    const level = hi - lo < .004 ? hi : NaN;
    mine.set(F.id, { ver: F.ver, level });
    return level;
}
function shape(v, l, at, face, shift, casts, ease, cell, K, both, bare, floor) {

    const W = l.W, e = .25, b = v.bent;
    if (!b.px) weld(b);
    v.group.matrix.identity(); v.group.matrixWorldNeedsUpdate = true;
    const { px, pz, X, Y, H, NX, NY, NZ } = b, n = px.length;
    if (!ease) b.cur = null;
    else if (!b.cur) { b.cur = new Float32Array(n); if (v.curled && b.shaped) b.cur.set(H); else b.cur.fill(ease.from ?? NaN); }

    let F = b.F;
    if (!F || F.cell !== cell) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < n; i++) { if (px[i] < x0) x0 = px[i]; if (px[i] > x1) x1 = px[i]; if (pz[i] < z0) z0 = pz[i]; if (pz[i] > z1) z1 = pz[i]; }
        const i0 = Math.floor(x0 / cell) - 1, j0 = Math.floor(z0 / cell) - 1, nx = Math.ceil(x1 / cell) + 2 - i0, nz = Math.ceil(z1 / cell) + 2 - j0, squares = b.about === 'grid' || b.about === 'sag';
        F = b.F = { cell, i0, j0, nx, nz, x0, x1, z0, z1, data: new Float32Array(nx * nz), id: ++fieldIds, ver: 0, squares, of: new Int32Array(n) };
        for (let i = 0; i < n; i++) { const gi = px[i] / cell - i0, gj = pz[i] / cell - j0, ri = Math.round(gi), rj = Math.round(gj); F.of[i] = squares && Math.abs(gi - ri) < 2e-3 && Math.abs(gj - rj) < 2e-3 ? rj * nx + ri : -1; }
    }
    F.W = W; F.M = paper.inv(W); F.K = K; F.ver++;
    const { data, nx, nz, i0, j0, of } = F, cur = b.cur, wanted = F.squares || !bare;
    const least = F.squares && ease && floor ? F.least ||= new Float32Array(data.length) : null;
    if (wanted) for (let j = 0, k = 0; j < nz; j++) for (let i = 0; i < nx; i++, k++) { const x = (i0 + i) * cell, z = (j0 + j) * cell, wx = W[0] * x + W[2] * z + W[4], wy = W[1] * x + W[3] * z + W[5]; data[k] = at(wx, wy); if (least) least[k] = x >= F.x0 - 1e-3 && x <= F.x1 + 1e-3 && z >= F.z0 - 1e-3 && z <= F.z1 + 1e-3 ? floor(wx, wy) : 0; }

    let now = data;
    if (F.squares) {
        now = F.eased ||= new Float32Array(data.length);
        if (!ease) now.set(data);
        else {
            if (!F.has) for (let j = 0, k = 0; j < nz; j++) for (let i = 0; i < nx; i++, k++) now[k] = v.seed ? v.seed((i0 + i) * cell, (j0 + j) * cell) : ease.from ?? NaN;
            for (let k = 0; k < now.length; k++) now[k] = now[k] === now[k] ? now[k] + (data[k] - now[k]) * ease.k : data[k];
            if (least) for (let k = 0; k < now.length; k++) if (now[k] < least[k]) now[k] = least[k];
        }
        F.has = true;
    }
    F.now = now;
    for (let i = 0; i < n; i++) {
        const x = X[i] = W[0] * px[i] + W[2] * pz[i] + W[4], y = Y[i] = W[1] * px[i] + W[3] * pz[i] + W[5], g = of[i];
        let h, gx, gy;
        if (g >= 0) { h = now[g]; const sx = (data[g + 1] - data[g - 1]) / (2 * cell), sz = (data[g + nx] - data[g - nx]) / (2 * cell); gx = W[0] * sx + W[2] * sz; gy = W[1] * sx + W[3] * sz; }
        else if (F.squares) {
            const gi = px[i] / cell - i0, gj = pz[i] / cell - j0, ci = Math.max(0, Math.min(nx - 2, Math.floor(gi))), cj = Math.max(0, Math.min(nz - 2, Math.floor(gj))), fu = gi - ci, fw = gj - cj, k = cj * nx + ci, a = data[k], c = data[k + 1], d = data[k + nx], q = data[k + nx + 1];
            h = (now[k] * (1 - fu) + now[k + 1] * fu) * (1 - fw) + (now[k + nx] * (1 - fu) + now[k + nx + 1] * fu) * fw;
            const sx = ((c - a) * (1 - fw) + (q - d) * fw) / cell, sz = ((d - a) * (1 - fu) + (q - c) * fu) / cell; gx = W[0] * sx + W[2] * sz; gy = W[1] * sx + W[3] * sz;
        } else {
            const to = at(x, y); gx = (at(x + e, y) - to) / e; gy = (at(x, y + e) - to) / e; h = to;
            if (cur) { let was = cur[i]; if (was !== was && v.seed) was = v.seed(px[i], pz[i]); cur[i] = h = was === was ? was + (to - was) * ease.k : to; }
        }
        H[i] = h;
        const k = face / Math.hypot(1, gx, gy);
        NX[i] = -gx * k; NY[i] = k; NZ[i] = -gy * k;
    }
    if (wanted) fields.set(l, F); else fields.delete(l);
    for (const it of b.items) {
        const { ch, twin } = it, u = ch.userData;
        ch.position.y = 0;
        if (u.under) ch.visible = true;
        if (u.side) ch.visible = both || u.side * face > 0;
        if (u.ridge) ch.visible = ch.visible && shift !== null;
        if (u.casts) ch.castShadow = casts;
        if (twin) continue;
        const pos = ch.geometry.attributes.position, nor = ch.geometry.attributes.normal, P = pos.array, N = nor && nor.array, idx = it.at, count = idx.length;
        const off = face * ((u.under ? -u.under * face : u.dy) + (u.over ? ((tops.get(u.over) ?? tops.get(l)) + SHEET - tops.get(l)) * face : 0));
        if (u.ridge && shift) for (let i = 0, j = 0; i < count; i++, j += 3) { const x = X[idx[i]] + shift.x, y = Y[idx[i]] + shift.y; P[j] = x; P[j + 1] = at(x, y) + off; P[j + 2] = y; if (N) { N[j] = 0; N[j + 1] = face; N[j + 2] = 0; } }
        else for (let i = 0, j = 0; i < count; i++, j += 3) { const k = idx[i]; P[j] = X[k]; P[j + 1] = H[k] + off; P[j + 2] = Y[k]; if (N) { N[j] = NX[k]; N[j + 1] = NY[k]; N[j + 2] = NZ[k]; } }
        pos.needsUpdate = true; if (nor) nor.needsUpdate = true;
    }
    b.shaped = true; v.seed = null;
}
const reachOf = (b, x, y) => { const dx = x - b.x, dy = y - b.y, u = dx * b.c + dy * b.s, w = dy * b.c - dx * b.s; return { u: Math.max(-b.hl, Math.min(b.hl, u)), w: Math.max(-b.hw, Math.min(b.hw, w)), d: Math.hypot(Math.max(0, Math.abs(u) - b.hl), Math.max(0, Math.abs(w) - b.hw)) }; };
function support(plates, tools, K, x, y) {
    let h = 0;
    for (const pl of plates) { const r = reachOf(pl.box, x, y), t = pl.top - K * Math.max(0, r.d - GRID); if (t > h) h = t; }
    for (const o of tools) { const r = reachOf(o, x, y), t = o.h + r.u * o.tan + (o.rolls ? 2 * o.rolls : o.tall) + .04 - K * Math.max(0, r.d - GRID); if (t > h) h = t; }
    return h;
}
const creaseKey = (l, hg) => [[0, 0], [1, 0], [0, 1]].map(([x, z]) => ((l.W[0] * x + l.W[2] * z + l.W[4] - hg.a.x) * hg.s.x + (l.W[1] * x + l.W[3] * z + l.W[5] - hg.a.y) * hg.s.y).toFixed(3)).join();
function bend(v, l, hg, hFold, hOpen, face, lf, floor) {
    const W = l.W, th = Math.PI - Math.abs(hg.ang), R = hg.R || 0, arc = th * R, sT = Math.sin(th), cT = Math.cos(th), sg = hg.ang < 0 ? -1 : 1, h0 = hOpen + (hFold - hOpen) * th / Math.PI, a = hg.a, d = hg.d, s = hg.s;
    v.group.matrix.identity(); v.group.matrixWorldNeedsUpdate = true;
    for (const { ch, base, twin } of v.bent.items) {
        const u = ch.userData, pos = ch.geometry.attributes.position, nor = ch.geometry.attributes.normal, k = -face * ((u.under ? 0 : u.dy) + (u.over ? ((tops.get(u.over) ?? tops.get(l)) + SHEET - tops.get(l)) * face : 0));
        ch.position.y = 0;
        if (u.side) ch.visible = true;
        if (u.under) ch.visible = false;
        if (u.casts) ch.castShadow = true;
        if (twin) continue;
        for (let i = 0, j = 0; i < pos.count; i++, j += 3) {
            const x = W[0] * base[j] + W[2] * base[j + 2] + W[4] - a.x, y = W[1] * base[j] + W[3] * base[j + 2] + W[5] - a.y, q = Math.max(0, x * s.x + y * s.y), t = x * d.x + y * d.y;
            let sn = sT, cs = cT, out = R * sT + (q - arc) * cT, up = R * (1 - cT) + (q - arc) * sT;
            if (q < arc) { sn = Math.sin(q / R); cs = Math.cos(q / R); out = R * sn; up = R * (1 - cs); }
            const nh = sg * sn, X = a.x + d.x * t - s.x * out, Y = a.y + d.y * t - s.y * out;
            let high = h0 + sg * up + cs * k + (lf ? lf(X, Y) : 0);
            if (floor) high = Math.max(high, floor(X, Y));
            pos.setXYZ(i, X + s.x * nh * k, high, Y + s.y * nh * k);
            if (nor) nor.setXYZ(i, -face * s.x * nh, -face * cs, -face * s.y * nh);
        }
        pos.needsUpdate = true; if (nor) nor.needsUpdate = true;
    }
}
function unbend(v) {
    v.bent.cur = null; v.bent.shaped = false; if (v.bent.F) v.bent.F.has = false;
    for (const { ch, base, twin } of v.bent.items) {
        if (twin) continue;
        const pos = ch.geometry.attributes.position, nor = ch.geometry.attributes.normal;
        pos.array.set(base); pos.needsUpdate = true;
        if (nor) { for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0); nor.needsUpdate = true; }
    }
}
const m4 = new THREE.Matrix4(), t4 = new THREE.Matrix4(), s4 = new THREE.Matrix4(), r4 = new THREE.Matrix4();
function opened(l, hg) {
    const world = l.world.map(r => r.map(p => { const t = 2 * ((p.x - hg.a.x) * hg.d.x + (p.y - hg.a.y) * hg.d.y); return { x: 2 * hg.a.x + t * hg.d.x - p.x, y: 2 * hg.a.y + t * hg.d.y - p.y }; }));
    const xs = world.flat().map(p => p.x), ys = world.flat().map(p => p.y);
    return { world, box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}
function openTop(l, out, st, all) {
    let h = 0;
    for (const pl of st.plates) if (h < pl.top && mine(pl, l) && paper.overPlate(out, pl.poly) > .05) h = pl.top;
    for (const m of all) if (!st.hinge.has(m) && h < tops.get(m) && paper.overlap(out, m) > .02) h = tops.get(m);
    return h + SHEET * (l.piece.units > 1 ? 1.6 : 1);
}

export function syncPaper(st) {
    const all = paper.stack(), done = [], alive = new Set(), under0 = new Map(), below = new Map(), laden = new Set(), rides = new Map();
    for (const [l, hg] of st.hinge) if (hg.ang < 0) under0.set(l.piece, hg);
    tops.clear(); lays.clear(); flatNow.clear(); last = st; lastBelow = below; unsettled = false;
    riders = new Set(st.plates.flatMap(pl => pl.only ? [...pl.only] : []));
    for (const l of all) {
        const thick = SHEET * (l.piece.units > 1 ? 1.6 : 1);
        let h = 0, lay = 0;
        for (const pl of st.plates) if (h < pl.top && mine(pl, l) && onPlate(l, pl)) h = pl.top;
        const on = [];
        rides.set(l, st.plates.some(pl => pl.only && pl.only.has(l.piece)));
        for (const m of done) if (rides.get(m) === rides.get(l) && touches(l, m)) { h = Math.max(h, tops.get(m));         lay = Math.max(lay, lays.get(m)); on.push(m); laden.add(m); }
        tops.set(l, h + thick); lays.set(l, lay + thick); below.set(l, on); done.push(l);
    }
    for (const l of all) {
        const sh = st.sheets[l.piece.sheet];
        if (!sh) continue;
        const mats = matsOf(sh), order = l.piece.leaves.length > 1 ? l.piece.leaves.map(o => o.piece.z[o.sig] < l.piece.z[l.sig] ? 1 : 0).join('') : '';
        const key = [l.piece.rev, mats.ok, order, paper.desk.tucks.filter(t => t.la === l).map(t => t.rev)].join('|');
        let v = views.get(l);
        if (!v || v.key !== key) {
            const was = v && v.flatWas, seed = v && v.curled ? heights(v) : null;
            if (v) drop(v);
            v = build(l, sh, mats); v.key = key; v.flatWas = was; v.seed = seed; if (seed) v.settle = 14; views.set(l, v); paperRoot.add(v.group);
        }
        alive.add(l);
        const fly = st.aloft.get(l.piece), hg = st.hinge.get(l), up = fly ? fly.alt : 0, W = l.W, flatH = tops.get(l);
        const air = fly && !fly.lying;
        const was = bases.get(l), thin = SHEET * (l.piece.units > 1 ? 1.6 : 1);
        const part = l.piece.bound || rides.get(l);
        let base = part || was == null || !st.dt || Math.abs(flatH - was) < .004 ? flatH : was + (flatH - was) * (1 - Math.exp(-st.dt / .08));
        for (const m of below.get(l)) { const under = bases.get(m) + thin; if (under > base) base = under; }
        bases.set(l, base); if (base !== flatH) unsettled = true;
        const face = W[0] * W[3] - W[1] * W[2] < 0 ? -1 : 1;
        let h = base + up;
        const rise = st.rise.get(l.piece), fresh = about => { if (v.bent && v.bent.about !== about) { const was = v.flatWas, seed = v.curled ? heights(v) : null; drop(v); v = build(l, sh, mats); v.key = key; v.flatWas = was; v.seed = seed; views.set(l, v); paperRoot.add(v.group); } return !v.bent; };
        if (hg) {
            if (fresh(creaseKey(l, hg))) bendable(v, l, hg);
            const out = opened(l, hg), zl = l.piece.z[l.sig], by = (b, o) => o.x + o.far > b.x0 && o.x - o.far < b.x1 && o.y + o.far > b.y0 && o.y - o.far < b.y1;
            const under = hg.ang > 0 ? st.tools.filter(o => o.z < zl && !o.ride === !rides.get(l) && ((by(l.box, o) && onTool(l, o)) || (by(out.box, o) && onTool(out, o)))) : [];
            const K = l.piece.units > 1 ? .3 : .55, lay = lays.get(l);
            bend(v, l, hg, h, openTop(l, out, st, all) + up, face, rise, under.length ? (x, y) => support([], under, K, x, y) + lay : null);
            v.curled = true; v.sig = null; v.flatWas = undefined; fields.delete(l);
            continue;
        }

        const busy = fly && fly.turn, K = l.piece.units > 1 ? .3 : .55, own = rise && st.fold && (st.fold.piece === l.piece || st.fold.pieces.has(l.piece));
        const stiff = st.stiff.get(l.piece) || 0;
        const by = busy ? [] : st.tools.filter(o => o.z < l.piece.z[l.sig] && !o.ride === !rides.get(l) && o.x + o.far > l.box.x0 && o.x - o.far < l.box.x1 && o.y + o.far > l.box.y0 && o.y - o.far < l.box.y1), on = air && stiff >= 1 ? null : by.filter(o => onTool(l, o)), under = air ? by : on;
        const beside = st.plates.filter(pl => { if (!mine(pl, l)) return false; const b = pl.box, m = pl.top / K + GRID + .5, ex = b.hl * Math.abs(b.c) + b.hw * Math.abs(b.s) + m, ey = b.hl * Math.abs(b.s) + b.hw * Math.abs(b.c) + m; return l.box.x1 > b.x - ex && l.box.x0 < b.x + ex && l.box.y1 > b.y - ey && l.box.y0 < b.y + ey; }), onto = air && stiff >= 1 ? null : beside.filter(pl => onPlate(l, pl)), near = air ? beside : onto;
        const held = stiff > 0 && stiff < 1 ? (x, y) => { const a = support(onto, on, K, x, y); return a + (support(beside, by, K, x, y) - a) * stiff; } : (x, y) => support(near, under, K, x, y);
        const thick = SHEET * (l.piece.units > 1 ? 1.6 : 1);
        const lowers = busy ? [] : below.get(l).map(m => fields.get(m)).filter(F => F && !(Math.abs(levelUnder(F, l) + thick - flatH) < .004));
        const reasons = rise || under.length || lowers.length || (stiff < 1 && near.some(pl => onPlate(l, pl) && !allOn(l, pl)));
        if (!busy && (reasons || v.settle > 0 || v.curled)) {
            const way = own ? Math.round(Math.atan2(st.fold.s.y, st.fold.s.x) * 10) / 10 : null, cut = own ? 'ramp' + way + '|' + W.join() : air && !under.length && stiff >= 1 ? 'sag' : 'grid';
            if (fresh(cut)) cutUp(v, l, cut, way, cut === 'sag' ? SAG : GRID);
            const lay = lays.get(l), flap = under0.get(l.piece), arc = flap ? (Math.PI - Math.abs(flap.ang)) * (flap.R || 0) : 0;
            const alone = own ? (x, y) => { const s = held(x, y) + lay; return s + (Math.max(h + rise(x, y), s) - s) * stiff; }
                     : air ? (x, y) => { const s = held(x, y) + lay; return s + (Math.max(h + (rise ? rise(x, y) : 0), s) - s) * stiff; }
                     : (x, y) => { const s = held(x, y) + lay; return s + Math.max(0, h - s) * stiff + (rise ? rise(x, y) : 0); };
            const at = lowers.length ? (x, y) => { let s = alone(x, y); for (const F of lowers) { const t = onSheet(F, x, y, K, thick); if (t > s) s = t; } return s; } : alone;
            const shaped = below.get(l).map(m => fields.get(m)).filter(Boolean), flats = below.get(l).filter(m => flatNow.has(m));
            const pad = cut === 'sag' ? SAG : GRID;
            const floor = (x, y) => {
                let s = 0;
                for (const pl of near) if (pl.top > s && reachOf(pl.box, x, y).d < (onPlate(l, pl) ? GRID : 1e-9)) s = pl.top;
                for (const o of under) { const r = reachOf(o, x, y); if (r.d < (onTool(l, o) ? GRID : 1e-9)) s = Math.max(s, o.h + r.u * o.tan + (o.rolls ? 2 * o.rolls : o.tall)); }
                for (const m of flats) { const b = m.box, t = flatNow.get(m); if (t > s && x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) s = t; }
                for (const F of shaped) { const t = fieldAt(F, x, y) + Math.max(K, F.K) * GRID / 4 * Math.min(1, F.range / .05); if (F.out < pad && t > s) s = t; }
                return s + thick;
            };
            const sig = rise || air || stiff ? null : [W.join(), under.map(o => o.sig).join(';'), near.map(pl => pl.key).join(';'), lay, lowers.map(F => F.id + '.' + F.ver).join(';')].join('|');
            v.why = (rise ? 'held up · ' : '') + (air ? 'in the air · ' : '') + (own ? 'up with a fold · ' : '') + `over ${under.length} things, ${near.length} plates, ${lowers.length} shaped sheets · stiff ${stiff.toFixed(2)} · cut ${cut}`;
            if (!sig || v.sig !== sig) v.settle = 14;
            if (!sig || v.settle > 0) {
                shape(v, l, at, face, !flap ? undefined : Math.abs(flap.ang) < .6 ? { x: -flap.s.x * arc, y: -flap.s.y * arc } : null, !!rise || under.length > 0 || up > .25, own || (rise && !air) ? null : { k: st.dt ? 1 - Math.exp(-st.dt / (air ? .035 : .05)) : 1, from: v.flatWas }, cut === 'sag' ? SAG : GRID, K, !!fly || !!rise, !laden.has(l), floor);
                if (sig && st.dt) v.settle--;
            }
            if (fly && (fly.twist || fly.sx || fly.sy || fly.up || fly.pitch)) {
                m4.identity();
                if (fly.pitch) m4.copy(t4.makeTranslation(fly.c.x, fly.ch ?? h, fly.c.y).multiply(s4.makeRotationX(fly.pitch)).multiply(s4.makeTranslation(-fly.c.x, -(fly.ch ?? h), -fly.c.y)));
                if (fly.twist) m4.premultiply(t4.makeTranslation(fly.tc.x, 0, fly.tc.y).multiply(s4.makeRotationY(-fly.twist)).multiply(s4.makeTranslation(-fly.tc.x, 0, -fly.tc.y)));
                if (fly.sx || fly.sy || fly.up) m4.premultiply(t4.makeTranslation(fly.sx || 0, fly.up || 0, fly.sy || 0));
                v.group.matrix.copy(m4); v.group.matrixWorldNeedsUpdate = true; v.askew = true;
            } else if (v.askew) { v.group.matrix.identity(); v.group.matrixWorldNeedsUpdate = true; v.askew = false; }
            if (v.settle > 0) unsettled = true;
            v.sig = sig; v.curled = true; v.flatWas = undefined;
            if (reasons || v.settle > 0 || !sig) continue;
        }
        if (v.curled) { unbend(v); v.curled = false; v.sig = null; }
        if (air && stiff < 1) h = base + up * stiff;
        v.flatWas = h; v.settle = 0; fields.delete(l); flatNow.set(l, h);
        m4.set(W[0], 0, W[2], W[4], 0, face, 0, h, W[1], 0, W[3], W[5], 0, 0, 0, 1);
        if (fly && (fly.pitch || fly.roll)) m4.premultiply(t4.makeTranslation(fly.c.x, fly.ch ?? h, fly.c.y).multiply(s4.makeRotationX(fly.pitch)).multiply(s4.makeRotationZ(fly.roll)).multiply(s4.makeTranslation(-fly.c.x, -(fly.ch ?? h), -fly.c.y)));
        if (fly && fly.twist) m4.premultiply(t4.makeTranslation(fly.tc.x, 0, fly.tc.y).multiply(s4.makeRotationY(-fly.twist)).multiply(s4.makeTranslation(-fly.tc.x, 0, -fly.tc.y)));
        if (fly && (fly.sx || fly.sy || fly.up)) m4.premultiply(t4.makeTranslation(fly.sx || 0, fly.up || 0, fly.sy || 0));
        if (fly && fly.turn) {
            const k = Math.cos(fly.turn), s = Math.sin(fly.turn);
            r4.set(k, -s, 0, 0, s * fly.flat, k, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
            if (fly.ta) r4.premultiply(s4.makeRotationY(-fly.ta)).multiply(s4.makeRotationY(fly.ta));
            m4.premultiply(t4.makeTranslation(fly.tc.x, h, fly.tc.y).multiply(r4).multiply(s4.makeTranslation(-fly.tc.x, -h, -fly.tc.y)));
            if (fly.lift || fly.px || fly.py) m4.premultiply(t4.makeTranslation(fly.px || 0, fly.lift || 0, fly.py || 0));
        }
        v.group.matrix.copy(m4); v.group.matrixWorldNeedsUpdate = true;
        for (const ch of v.group.children) {
            const u = ch.userData;
            ch.position.y = (u.under ? -u.under * face : u.dy) + (u.over ? ((tops.get(u.over) ?? tops.get(l)) + SHEET - tops.get(l)) * face : 0);
            if (u.under) ch.visible = true;
            if (u.side) ch.visible = !!fly || u.side * face > 0;
            if (u.casts) ch.castShadow = up > .25;
            if (u.ridge) ch.visible = ch.visible && !(fly && (fly.alt > 0 || fly.turn));
        }
    }
    for (const [l, v] of views) if (!alive.has(l)) { drop(v); views.delete(l); bases.delete(l); }
}
export function heightAt(p, plates, paperToo = true, upTo = Infinity, among) {
    let h = 0;
    const l = paperToo && (among ? among.filter(m => p.x >= m.box.x0 && p.x <= m.box.x1 && p.y >= m.box.y0 && p.y <= m.box.y1 && paper.inside(p, m.world)).pop() : paper.stackAt(p).filter(m => m.piece.z[m.sig] <= upTo).pop());
    for (const pl of plates) if (pl.top > h && (!pl.only || (l && pl.only.has(l.piece))) && paper.inside(p, [pl.ring])) h = pl.top;
    if (l && plates.some(pl => pl.not && pl.not.has(l.piece) && paper.inside(p, [pl.ring]))) return h;
    if (!l || !last) return h;
    const F = fields.get(l);
    if (F) return fieldAt(F, p.x, p.y);

    const fly = last.aloft.get(l.piece), air = fly && !fly.lying, zl = l.piece.z[l.sig], by = last.tools.filter(o => o.z < zl && !o.ride === !last.plates.some(pl => pl.only && pl.only.has(l.piece)) && Math.abs(o.x - p.x) < o.far && Math.abs(o.y - p.y) < o.far);
    const rise = last.rise.get(l.piece), up = rise ? rise(p.x, p.y) : 0, firm = last.stiff.get(l.piece) || 0, K = l.piece.units > 1 ? .3 : .55;
    const held = strict => { const under = strict ? by.filter(o => onTool(l, o)) : by; return under.length ? Math.max(h, support(last.plates.filter(pl => mine(pl, l) && (!strict || onPlate(l, pl))), under, K, p.x, p.y)) : h; };
    const on = air && firm >= 1 ? 0 : held(true), s = (air && firm >= 1 ? held(false) : firm > 0 && firm < 1 ? on + (held(false) - on) * firm : on) + (lays.get(l) || 0), flatH = tops.get(l) || s;
    const base = bases.get(l) ?? flatH;
    return air ? s + (Math.max(base + fly.alt + up, s) - s) * firm : s + Math.max(0, base - s) * firm + up;
}
let dot = null;
export function showDot(p, h, r) {
    if (!dot) { dot = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), M.dot); dot.renderOrder = 9; dot.frustumCulled = false; lineRoot.add(dot); }
    dot.visible = !!p;
    if (p) { dot.position.set(p.x, h, p.y); dot.scale.set(r, 1, r); }
}
let glow = null;
export function showGlow(l, paths) {
    if (glow && glow.paths !== paths) { glow.group.removeFromParent(); glow.group.traverse(o => o.geometry?.dispose()); glow = null; }
    if (!l || !paths || !paths.length || !tops.has(l)) return;
    if (!glow) {
        glow = { paths, group: new THREE.Group() };
        glow.group.add(new THREE.Mesh(flat(paths), M.glow));
        for (const m of glow.group.children) m.renderOrder = 4;
        lineRoot.add(glow.group);
    }
    glow.group.position.y = tops.get(l) + .01;
}
export function lying(obj, p) {
    const x = V(1, 0, 0).applyQuaternion(obj.quaternion), l = Math.hypot(x.x, x.z) || 1, tip = obj.userData.tip ? obj.userData.tip.x : 0;
    return { x: p.x - x.x / l * tip, y: p.y - x.z / l * tip, ang: Math.atan2(x.z, x.x) };
}
export const settling = () => unsettled;
export const topOf = l => tops.get(l) || 0;
export const fieldOf = l => fields.get(l);
export const whyOf = l => views.get(l)?.curled ? views.get(l).why : 'flat';
export function sunk() {
    const out = [];
    if (!last) return out;
    const skip = l => last.hinge.has(l) || last.aloft.get(l.piece)?.turn || (last.fold && last.fold.pieces.has(l.piece)) || paper.desk.tucks.some(t => t.la === l || t.lb === l);
    const top = (l, x, y) => { const F = fields.get(l), fly = last.aloft.get(l.piece); return F ? fieldAt(F, x, y) : (bases.get(l) ?? tops.get(l)) + (fly ? fly.alt * (fly.lying ? 1 : Math.min(1, last.stiff.get(l.piece) || 0)) : 0); };
    for (const [l, on] of lastBelow) {
        if (skip(l) || !tops.has(l)) continue;
        const thick = SHEET * (l.piece.units > 1 ? 1.6 : 1);
        for (const m of on) {
            if (skip(m) || m.piece === l.piece || !tops.has(m)) continue;
            const x0 = Math.max(l.box.x0, m.box.x0), x1 = Math.min(l.box.x1, m.box.x1), y0 = Math.max(l.box.y0, m.box.y0), y1 = Math.min(l.box.y1, m.box.y1);
            let worst = 0, where = null;
            for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
                const p = { x: x0 + (x1 - x0) * (i + .5) / 6, y: y0 + (y1 - y0) * (j + .5) / 6 };
                if (!paper.inside(p, l.world) || !paper.inside(p, m.world)) continue;
                const gap = top(l, p.x, p.y) - top(m, p.x, p.y) - thick;
                if (gap < worst) { worst = gap; where = p; }
            }
            if (worst < -thick + .004) out.push(`paper ${l.piece.id}:${l.sig} is ${(-worst).toFixed(2)} cm down into paper ${m.piece.id}:${m.sig}, which it lies on (at ${where.x.toFixed(1)}, ${where.y.toFixed(1)})`);
        }
    }
    return out;
}
export function drawn() {
    const out = [], p = V();
    for (const [l, v] of views) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, lo = Infinity, hi = -Infinity;
        for (const ch of v.group.children) {
            if (!ch.isMesh || !ch.userData.casts || ch.userData.side !== 1) continue;
            const pos = ch.geometry.attributes.position, dy = ch.position.y;
            for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); p.y += dy; p.applyMatrix4(v.group.matrix); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.z); y1 = Math.max(y1, p.z); lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
        }
        if (lo === Infinity) continue;
        out.push({ id: l.piece.id, sig: l.sig, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0, lo, hi });
    }
    return out;
}

function ribbon(line, half, dx = 0, dy = 0, pos = []) {
    const n = line.length, len = [0];
    for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
    const L = len[n - 1], T = Math.min(.6, L / 2) || 1;
    const edge = line.map((p, i) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)], d = Math.hypot(b.x - a.x, b.y - a.y) || 1, w = half * Math.max(0, Math.min(1, len[i] / T, (L - len[i]) / T)), nx = -(b.y - a.y) / d * w, ny = (b.x - a.x) / d * w; return [p.x + dx + nx, p.y + dy + ny, p.x + dx - nx, p.y + dy - ny]; });
    for (let i = 0; i < n - 1; i++) { const a = edge[i], b = edge[i + 1]; pos.push(a[0], 0, a[1], b[0], 0, b[1], a[2], 0, a[3], a[2], 0, a[3], b[0], 0, b[1], b[2], 0, b[3]); }
    return pos;
}
const SCAR = [[.034, 0, 0, '#1e0904', .2, .003], [.011, -.004, -.004, '#0a0301', .85, .004], [.008, .011, .011, '#d39a6c', .6, .005]].map(([half, dx, dy, color, opacity, y]) => ({ half, dx, dy, y, mat: new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }) }));
export function scars(lines) {
    for (const m of [...scarRoot.children]) { m.removeFromParent(); m.geometry.dispose(); }
    if (!lines.length) return;
    for (const k of SCAR) { const pos = []; for (const l of lines) if (l.length > 1) ribbon(l, k.half, k.dx, k.dy, pos); if (pos.length) scarRoot.add(new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)), k.mat).translateY(k.y)); }
}
const lines = {}, lineMats = {};
export function showLine(name, rings, h = 0, color = '#e8372a', dash = 0, opacity = 1) {
    if (lines[name]) { lines[name].removeFromParent(); lines[name].traverse(o => o.geometry?.dispose()); lines[name] = null; }
    if (!rings || !rings.length || opacity <= 0) return;
    const g = lines[name] = new THREE.Group(), mat = lineMats[name + (dash ? 'd' : '')] ||= dash ? new THREE.LineDashedMaterial({ depthTest: false, transparent: true }) : new THREE.LineBasicMaterial({ depthTest: false, transparent: true });
    mat.color.set(color); mat.opacity = opacity; if (dash) { mat.dashSize = dash; mat.gapSize = dash * .7; }
    for (const r of rings) if (r.length > 1) { const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(r.map(q => V(q.x, h, q.y))), mat); if (dash) line.computeLineDistances(); line.renderOrder = 5; g.add(line); }
    lineRoot.add(g);
}
