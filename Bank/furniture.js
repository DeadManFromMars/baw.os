import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import * as T from './textures.js';

let ERA = null;
export async function loadEraFont(url) { const buf = await (await fetch(url)).arrayBuffer(); ERA = new Font(new TTFLoader().parse(buf)); return ERA; }
export const hasEraFont = () => !!ERA;
const glyphs = new Map();
export function letters3d(text, mat, { size = 0.05, depth = 0.006, spacing = 0.1, jitter = 0 } = {}) {
    const group = new THREE.Group(), pieces = [];
    if (!ERA) return { group, width: 0, pieces };
    const res = ERA.data.resolution, sc = size / res;
    let x = 0;
    for (const ch of text) {
        const gl = ERA.data.glyphs[ch] || ERA.data.glyphs['?'], adv = (gl?.ha ?? res * 0.5) * sc;
        if (ch !== ' ') {
            const key = `${ch}|${size}|${depth}`;
            if (!glyphs.has(key)) glyphs.set(key, new THREE.ExtrudeGeometry(ERA.generateShapes(ch, size), { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: size * 0.018, bevelSegments: 2, curveSegments: 6 }));
            const m = new THREE.Mesh(glyphs.get(key), mat); m.position.x = x; m.castShadow = m.receiveShadow = true; group.add(m);
            if (jitter) { m.rotation.z = (T.rnd() - 0.5) * 0.05 * jitter; m.position.y += (T.rnd() - 0.5) * size * 0.05 * jitter; }
            pieces.push({ m, ch, x, adv });
        }
        x += adv + size * spacing;
    }
    const width = x - size * spacing;
    group.children.forEach(m => m.position.x -= width / 2);
    return { group, width, pieces };
}

const litGold = M => { if (!M.goldLit) { M.goldLit = M.gold.clone(); M.goldLit.emissive.set('#ffc870'); M.goldLit.emissiveIntensity = 0.25; } return M.goldLit; };

export function plaque3d(M, lines, { w = 1, h = 0.25, letterMat = M.gold, plate = M.black, frame = M.gold } = {}) {
    const g = new THREE.Group();
    box(g, w, h, 0.025, plate, 0, -h / 2, -0.0125);
    for (const [bw, bh, x, y] of [[w + 0.03, 0.015, 0, h / 2], [w + 0.03, 0.015, 0, -h / 2 - 0.015], [0.015, h, -w / 2 - 0.0075, -h / 2], [0.015, h, w / 2 + 0.0075, -h / 2]]) box(g, bw, bh, 0.035, frame, x, y, -0.005);
    const total = lines.reduce((s, [, sz]) => s + sz * 1.45, 0); let y = total / 2;
    for (const [text, sz] of lines) { y -= sz * 1.2; const L = letters3d(text, letterMat, { size: sz, depth: sz * 0.12 }); if (L.width > w * 0.9) L.group.scale.setScalar(w * 0.9 / L.width); L.group.position.set(0, y, 0.002); g.add(L.group); y -= sz * 0.25; }
    return g;
}

export function makeMaterials() {
    const phys = o => new THREE.MeshPhysicalMaterial(o);

    const wear = T.tex(T.wear(), 3, 3, false), pores = T.tex(T.normalFrom(T.grain(), 2.5), 5, 5, false), poreScale = new THREE.Vector2(0.35, 0.35);
    const grimy = m => {
        m.onBeforeCompile = sh => {
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGy;')
                .replace('#include <project_vertex>', '#include <project_vertex>\nvGy = (modelMatrix * vec4(transformed, 1.0)).y;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGy;')
                .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 2.2, vGy)) * mix(1.0, 0.78, smoothstep(14.0, 34.0, vGy));');
        };
        return m;
    };

    const marbleMat = (base, vein, rough, rx = 1, ry = rx, s, coat = 0.25) => grimy(phys({ map: T.tex(T.marble(base, vein, { s, w: 2048, h: 2048, n: 90 }), rx, ry),
        roughness: Math.min(1, rough * 2), roughnessMap: wear, normalMap: pores, normalScale: poreScale, clearcoat: coat, clearcoatRoughness: 0.35, clearcoatRoughnessMap: wear }));
    const metal = (color, rough) => phys({ color, metalness: 1, roughness: Math.min(1, rough * 2), roughnessMap: wear });
    const jewel = T.canvas(512, 512, (g, w) => {
        g.fillStyle = '#9ea3a6'; g.fillRect(0, 0, w, w);
        for (let y = 0; y < w + 32; y += 32) for (let x = 0; x < w + 32; x += 32) {
            const gr = g.createConicGradient(y / 40, x, y); for (let k = 0; k <= 8; k++) gr.addColorStop(k / 8, k % 2 ? '#cfd3d5' : '#8a8f92');
            g.fillStyle = gr; g.beginPath(); g.arc(x, y, 22, 0, 6.283); g.fill();
        }
    });
    return {
        gold:     metal('#c49a4c', 0.38),
        goldDull: metal('#9a7430', 0.5),
        monel:    metal('#c4c7c3', 0.38),
        steel:    phys({ map: T.tex(jewel, 3, 3), metalness: 1, roughness: 0.38 }),
        black:    marbleMat('#0e0f10', '#cfcac0', 0.26, 1, 1, 41),
        verde:    marbleMat('#15372e', '#9fc4b1', 0.3, 1, 1, 43),
        red:      marbleMat('#6d1a14', '#e0b49a', 0.3, 1, 1, 47),
        cream:    marbleMat('#ddd0b4', '#9a8e76', 0.62, 1, 1, 45, 0),
        lacquer:  phys({ color: '#0b0b0c', roughness: 0.7, roughnessMap: wear, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
        wood:     phys({ map: T.tex(T.wood(), 1, 1), roughness: 0.9, roughnessMap: wear, clearcoat: 0.3, clearcoatRoughness: 0.35 }),
        leather:  new THREE.MeshStandardMaterial({ color: '#1d3526', roughness: 0.7, normalMap: pores, normalScale: poreScale }),
        bakelite: new THREE.MeshStandardMaterial({ color: '#111010', roughness: 0.35 }),
        lampGreen: phys({ color: '#1d6a3c', emissive: '#3c9a5a', emissiveIntensity: 0.55, roughness: 0.12, side: THREE.DoubleSide }),

        sand:     new THREE.MeshStandardMaterial({ color: '#b3a384', roughness: 1 }),
        butt:     new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.9 }),
        ash:      new THREE.MeshStandardMaterial({ map: T.tex(T.ash(), 1, 1), color: '#d8d4cc', roughness: 1 }),
        char:     new THREE.MeshStandardMaterial({ color: '#1e1b18', roughness: 1 }),
        cork:     new THREE.MeshStandardMaterial({ color: '#c08448', roughness: 0.8 }),
        news:     new THREE.MeshStandardMaterial({ map: T.tex(T.newsprint()), roughness: 0.95, side: THREE.DoubleSide }),
        iron:     phys({ color: '#24211d', metalness: 0.6, roughness: 1, roughnessMap: wear }),
        galv:     phys({ color: '#8e918c', metalness: 0.8, roughness: 0.9, roughnessMap: wear, side: THREE.DoubleSide }),
        brassOpen: phys({ color: '#9a7430', metalness: 1, roughness: 1, roughnessMap: wear, side: THREE.DoubleSide }),
        redPaint: phys({ color: '#7a1712', roughness: 0.9, roughnessMap: wear, clearcoat: 0.2 }),
        olive:    phys({ color: '#34402a', roughness: 0.9, roughnessMap: wear, clearcoat: 0.2 }),
        rubber:   new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.95 }),
        club:     new THREE.MeshStandardMaterial({ color: '#3b1f14', roughness: 0.55, normalMap: pores, normalScale: poreScale }),
        pane:     new THREE.MeshStandardMaterial({ color: '#cfd8d4', transparent: true, opacity: 0.1, roughness: 0.08, envMapIntensity: 0.3, depthWrite: false }),
        dimGlow:  new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffd9a0', emissiveIntensity: 0.9 }),
        velvet:   phys({ color: '#1d4a38', roughness: 1, sheen: 1, sheenColor: new THREE.Color('#5fa384'), sheenRoughness: 0.5 }),
        wine:     phys({ color: '#5e1418', roughness: 1, sheen: 1, sheenColor: new THREE.Color('#c0505a'), sheenRoughness: 0.5 }),
        paper:    new THREE.MeshStandardMaterial({ color: '#f4efe2', roughness: 0.9 }),

        glass:    phys({ color: '#dfe8e4', transparent: true, opacity: 0.08, roughness: 0.03, metalness: 0, depthWrite: false, side: THREE.DoubleSide }),
        armor:    phys({ color: '#c4e6d4', transparent: true, opacity: 0.2, roughness: 0.02, metalness: 0, depthWrite: false, side: THREE.DoubleSide }),
        glow:     new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffd49a', emissiveIntensity: 2.4 }),
        alabaster: phys({ color: '#fff0d4', roughness: 0.4, emissive: '#ffc77c', emissiveIntensity: 1.6 }),
        rodGlass: phys({ color: '#fff7e6', roughness: 0.05, emissive: '#ffd8a0', emissiveIntensity: 1.3 }),
        suit:     new THREE.MeshStandardMaterial({ color: '#161719', roughness: 0.75 }),
        shirt:    new THREE.MeshStandardMaterial({ color: '#efeae0', roughness: 0.7 }),
        skin:     new THREE.MeshStandardMaterial({ color: '#c9a488', roughness: 0.55 }),
        visor:    phys({ color: '#2f7a4c', transparent: true, opacity: 0.65, roughness: 0.2 }),
    };
}

export function put(g, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
export const box = (g, w, h, d, mat, x = 0, y = 0, z = 0) => put(g, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z);
export const rbox = (g, w, h, d, r, mat, x = 0, y = 0, z = 0) => put(g, new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y + h / 2, z);
export const cyl = (g, r, h, mat, x = 0, y = 0, z = 0, seg = 32, rb = r) => put(g, new THREE.CylinderGeometry(r, rb, h, seg), mat, x, y + h / 2, z);
export const ball = (g, r, mat, x = 0, y = 0, z = 0) => put(g, new THREE.SphereGeometry(r, 32, 20), mat, x, y, z);
export function ring(g, r, t, mat, x = 0, y = 0, z = 0, flat = true) { const m = put(g, new THREE.TorusGeometry(r, t, 12, 72), mat, x, y, z); if (flat) m.rotation.x = Math.PI / 2; return m; }

function steps(g, tiers, mat, x = 0, y = 0, z = 0) { for (const [w, h, d, m] of tiers) { box(g, w, h, d, m || mat, x, y, z); y += h; } return y; }
function lathe(g, pts, mat, x = 0, y = 0, z = 0, seg = 48) { return put(g, new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat, x, y, z); }

export function revolvingDoor(M) {
    const g = new THREE.Group(), R = 1.45, H = 2.7;
    cyl(g, R + 0.12, 0.03, M.gold, 0, 0, 0, 64);
    for (const c of [Math.PI / 2, -Math.PI / 2]) {
        const arc = new THREE.CylinderGeometry(R, R, H, 48, 1, true, c - 0.95, 1.9);
        put(g, arc, M.glass, 0, H / 2, 0).castShadow = false;
        for (const e of [-0.95, 0.95]) box(g, 0.08, H, 0.08, M.gold, Math.sin(c + e) * R, 0, Math.cos(c + e) * R);
    }
    cyl(g, R + 0.15, 0.5, M.lacquer, 0, H, 0, 64);
    ring(g, R + 0.16, 0.03, M.gold, 0, H + 0.08); ring(g, R + 0.16, 0.03, M.gold, 0, H + 0.42);
    const wings = new THREE.Group(); g.add(wings);
    cyl(wings, 0.07, H, M.gold, 0, 0, 0, 24);
    for (let k = 0; k < 4; k++) {
        const w = new THREE.Group(); w.rotation.y = k * Math.PI / 2; wings.add(w);
        box(w, 0.05, H - 0.1, 0.05, M.gold, 0, 0.05, R - 0.05);
        box(w, 0.04, 0.12, R - 0.1, M.gold, 0, 0.05, R / 2); box(w, 0.04, 0.12, R - 0.1, M.gold, 0, H - 0.2, R / 2);
        box(w, 0.04, 0.05, R - 0.1, M.gold, 0, 1.05, R / 2);
        const pane = box(w, 0.02, H - 0.36, R - 0.15, M.glass, 0, 0.175, R / 2); pane.castShadow = false;
    }
    g.userData.wings = wings;
    return g;
}

export function writingDesk(M) {
    const g = new THREE.Group();
    steps(g, [[3.0, 0.05, 1.1, M.black], [2.9, 0.07, 1.0, M.gold], [2.7, 0.78, 0.8, M.black]]);
    box(g, 2.72, 0.04, 0.82, M.gold, 0, 0.55);
    for (const s of [-1, 1]) {
        const face = new THREE.Group(); face.rotation.y = s > 0 ? 0 : Math.PI; g.add(face);
        reeds(face, M.black, { y: 0.16, z: 0.4, w: 2.5, h: 0.36, n: 34, r: 0.02 });
        reeds(face, M.black, { y: 0.61, z: 0.4, w: 2.5, h: 0.26, n: 34, r: 0.02 });
        for (const x of [-1.3, 1.3]) box(face, 0.04, 0.78, 0.03, M.gold, x, 0.12, 0.41);
    }
    for (const s of [-1, 1]) {
        const top = box(g, 2.9, 0.06, 0.55, M.black, 0, 0.93, s * 0.27); top.rotation.x = s * 0.14;
        box(g, 2.9, 0.03, 0.03, M.gold, 0, 0.93, s * 0.55);
        for (let k = -1; k <= 1; k++) { box(g, 0.22, 0.012, 0.28, M.paper, k * 0.9, 1.0, s * 0.3).rotation.x = s * 0.14; }
    }
    box(g, 2.9, 0.16, 0.08, M.gold, 0, 0.95);
    for (const x of [-1.2, 1.2]) { cyl(g, 0.03, 0.08, M.gold, x, 1.1, 0); cyl(g, 0.006, 0.18, M.lacquer, x, 1.14, 0.02, 8).rotation.x = 0.4; }
    cyl(g, 0.025, 0.45, M.gold, 0, 1.1, 0);
    lathe(g, [[0.02, 0], [0.26, 0.02], [0.28, 0.06], [0.12, 0.2], [0.05, 0.24], [0.0, 0.25]], M.alabaster, 0, 1.45, 0).rotation.x = Math.PI;
    ring(g, 0.28, 0.012, M.gold, 0, 1.39);
    return g;
}

export function bench(M) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
        steps(g, [[0.5, 0.06, 0.62, M.gold], [0.42, 0.34, 0.54, M.lacquer], [0.46, 0.04, 0.58, M.gold], [0.3, 0.16, 0.5, M.lacquer], [0.34, 0.03, 0.54, M.gold]], M.lacquer, s * 1.05);
    }
    box(g, 1.7, 0.3, 0.46, M.lacquer, 0, 0.1);
    rbox(g, 1.72, 0.14, 0.52, 0.05, M.velvet, 0, 0.4);
    box(g, 1.7, 0.02, 0.02, M.gold, 0, 0.38, 0.24);
    return g;
}

export function torchere(M, flutes) {
    const g = new THREE.Group();
    const y = steps(g, [[0.6, 0.08, 0.6, M.black], [0.46, 0.08, 0.46, M.gold], [0.32, 0.1, 0.32, M.black]]);
    const stem = new THREE.MeshPhysicalMaterial({ color: '#d9a948', metalness: 1, roughness: 0.2, normalMap: flutes, normalScale: new THREE.Vector2(1.2, 1.2) });
    cyl(g, 0.045, 1.7, stem, 0, y, 0, 32, 0.06);
    ring(g, 0.07, 0.02, M.gold, 0, y + 0.6);
    lathe(g, [[0.04, 0], [0.2, 0.05], [0.36, 0.2], [0.38, 0.24], [0.0, 0.24]], M.alabaster, 0, y + 1.66, 0);
    ring(g, 0.38, 0.02, M.gold, 0, y + 1.9);
    return g;
}

export function chandelier(M, drop = 2, scale = 1) {
    const g = new THREE.Group();
    const s = scale;
    cyl(g, 0.03 * s, drop, M.gold, 0, 0, 0, 12);
    const tiers = [[1.0, 1.2, 28], [0.72, 0.9, 20], [0.45, 0.7, 14]];
    let y = 0, bottom = 0;
    for (const [r, h, n] of tiers) {
        ring(g, r * s, 0.03 * s, M.gold, 0, y - h * s); ring(g, r * s, 0.03 * s, M.gold, 0, y);
        const rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, h * s, 8), M.rodGlass, n);
        const d = new THREE.Object3D();
        for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; d.position.set(Math.cos(a) * r * s, y - h * s / 2, Math.sin(a) * r * s); d.updateMatrix(); rods.setMatrixAt(k, d.matrix); }
        g.add(rods);
        for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; box(g, 0.02 * s, 0.02 * s, r * s, M.gold, Math.cos(a) * r * s / 2, y - h * s - 0.01 * s, Math.sin(a) * r * s / 2).rotation.y = -a + Math.PI / 2; }
        bottom = y - h * s;
        y -= h * s * 0.6;
    }
    lathe(g, [[0, 0], [0.18 * s, 0.1 * s], [0.08 * s, 0.4 * s], [0, 0.45 * s]], M.gold, 0, bottom, 0).rotation.x = Math.PI;
    ball(g, 0.2 * s, M.glow, 0, -0.6 * s);
    g.position.y = 0;
    return g;
}

export function palm(M, seed = 1, { fronds = 14, reach = 1.6 } = {}) {
    let s = seed * 9301 + 49297; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const pos = [], col = [], idx = [], V = (x, y, z) => new THREE.Vector3(x, y, z), up = V(0, 1, 0);
    const green = new THREE.Color('#2c4a26'), young = new THREE.Color('#4a6a30'), brown = new THREE.Color('#7a6a3a');
    const quad = (a, b, c, d, ca, cb) => { const n = pos.length / 3; for (const [p, tone] of [[a, ca], [b, ca], [c, cb], [d, cb]]) { pos.push(p.x, p.y, p.z); col.push(tone.r, tone.g, tone.b); } idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); };
    for (let f = 0; f < fronds; f++) {
        const a = f / fronds * Math.PI * 2 + r() * 0.4, out = V(Math.cos(a), 0, Math.sin(a)), L = reach * (0.75 + r() * 0.35);
        const rise = 0.9 + r() * 0.9, droop = 0.3 + r() * 0.5;
        const P0 = V(0, 0, 0), P1 = V(0, rise * 1.25, 0).addScaledVector(out, L * 0.2), P2 = V(0, rise - droop, 0).addScaledVector(out, L);
        const at = t => V(0, 0, 0).addScaledVector(P0, (1 - t) ** 2).addScaledVector(P1, 2 * t * (1 - t)).addScaledVector(P2, t * t);
        const N = 22, tint = green.clone().lerp(young, r() * 0.6);
        for (let i = 0; i < N; i++) {
            const p = at(i / N), q = at((i + 1) / N), side = new THREE.Vector3().crossVectors(q.clone().sub(p), up).normalize().multiplyScalar(0.007 * (1 - i / N) + 0.003);
            quad(p.clone().add(side), p.clone().sub(side), q.clone().add(side), q.clone().sub(side), tint, tint);
            if (i < N * 0.3) continue;
            const t = i / N, tan = q.clone().sub(p).normalize(), side1 = new THREE.Vector3().crossVectors(tan, up).normalize();
            const ll = 0.5 * Math.sin(Math.PI * (t - 0.26) / 0.76) * (0.85 + r() * 0.3), tip = r() < 0.12 ? brown : tint;
            for (const sgn of [-1, 1]) {
                const dir = side1.clone().multiplyScalar(sgn).addScaledVector(tan, 0.55).normalize();
                let prev = p.clone(), w0 = 0.034;
                for (let k = 1; k <= 4; k++) {
                    const u = k / 4, pt = p.clone().addScaledVector(dir, ll * u); pt.y -= ll * 0.45 * u * u;
                    const nrm = new THREE.Vector3().crossVectors(dir, up).normalize(), w = 0.034 * (1 - u * 0.85);
                    quad(prev.clone().addScaledVector(nrm, w0 / 2), prev.clone().addScaledVector(nrm, -w0 / 2), pt.clone().addScaledVector(nrm, w / 2), pt.clone().addScaledVector(nrm, -w / 2), tint, u > 0.7 ? tip : tint);
                    prev = pt; w0 = w;
                }
            }
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); geo.setIndex(idx); geo.computeVertexNormals();
    M.leaf ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, M.leaf); m.castShadow = m.receiveShadow = true;
    return m;
}

export function urn(M, frondTex = null, seed = 1) {
    const g = new THREE.Group();
    steps(g, [[0.84, 0.06, 0.84, M.gold], [0.8, 0.05, 0.8, M.black], [0.7, 0.28, 0.7, M.black], [0.74, 0.03, 0.74, M.gold], [0.66, 0.06, 0.66, M.black]]);
    for (const s of [-1, 1]) for (const ax of ['x', 'z']) for (let k = 0; k < 3; k++) { const b = box(g, ax === 'x' ? 0.02 : 0.5 - k * 0.14, 0.16, ax === 'x' ? 0.5 - k * 0.14 : 0.02, M.gold, ax === 'x' ? s * 0.352 : 0, 0.17 + k * 0.02, ax === 'z' ? s * 0.352 : 0); b.scale.y = 1 - k * 0.3; }
    const pot = lathe(g, [[0.0, 0], [0.24, 0], [0.26, 0.03], [0.24, 0.06], [0.3, 0.14], [0.38, 0.34], [0.42, 0.52], [0.43, 0.6], [0.47, 0.63], [0.47, 0.67], [0.43, 0.68], [0.41, 0.66], [0.0, 0.66]], M.lacquer, 0, 0.48, 0, 96);
    const pp = pot.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i), y = pp.getY(i), rr = Math.hypot(x, z); if (rr < 0.01 || y < 0.1 || y > 0.58) continue; const th = Math.atan2(z, x), k = 1 - 0.028 * Math.pow(Math.abs(Math.cos(th * 16)), 3); pp.setXYZ(i, x * k, y, z * k); }
    pot.geometry.computeVertexNormals();
    for (const h of [0.6, 1.0]) ring(g, h > 0.9 ? 0.425 : 0.3, 0.014, M.gold, 0, h);
    cyl(g, 0.41, 0.02, new THREE.MeshStandardMaterial({ color: '#2a1f16', roughness: 1 }), 0, 1.1, 0, 48);
    const p = palm(M, seed); p.position.set(0, 1.12, 0); g.add(p); g.userData.palm = p;
    return g;
}

export function clock(M, faceTex, r = 0.8) {
    const g = new THREE.Group();
    for (let k = 0; k < 24; k++) {
        const ray = box(g, 0.05, r * (k % 2 ? 0.55 : 0.8), 0.04, M.gold, 0, 0, 0);
        ray.geometry.translate(0, r * 0.95, 0); ray.position.set(0, 0, -0.02); ray.rotation.z = k / 24 * Math.PI * 2;
    }
    const face = put(g, new THREE.CircleGeometry(r * 0.9, 64), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.4 }), 0, 0, 0.03);
    face.castShadow = false;
    ring(g, r * 0.92, 0.04, M.gold, 0, 0, 0.03, false);
    const hand = (len, w, a) => { const h = box(g, w, len, 0.015, M.lacquer, 0, 0, 0.06); h.geometry.translate(0, len / 2 - 0.05, 0); h.position.y = 0; h.rotation.z = a; };
    hand(r * 0.55, 0.05, -1.1); hand(r * 0.8, 0.03, 0.9);
    ball(g, 0.05, M.gold, 0, 0, 0.07);
    return g;
}

export function reeds(g, mat, { x = 0, y = 0, z = 0, w = 1, h = 1, n = 10, r = null } = {}) {
    const rr = r ?? w / n / 2 * 0.92;
    for (let i = 0; i < n; i++) put(g, new THREE.CylinderGeometry(rr, rr, h, 10, 1, true, -Math.PI / 2, Math.PI), mat, x - w / 2 + (i + 0.5) * w / n, y + h / 2, z);
}
export function tellerWindow(M, n = 1, numTex = null) {
    const g = new THREE.Group(), W = 2.4;

    steps(g, [[W, 0.06, 1.02, M.black], [W, 0.1, 0.97, M.gold], [W, 0.84, 0.9, M.black]]);
    reeds(g, M.black, { y: 0.2, z: 0.45, w: W - 0.2, h: 0.62, n: 22, r: 0.03 });
    for (const s of [-1, 1]) box(g, 0.08, 0.84, 0.05, M.gold, s * (W / 2 - 0.04), 0.16, 0.46);
    box(g, W, 0.03, 0.02, M.gold, 0, 0.18, 0.49); box(g, W, 0.04, 0.93, M.black, 0, 0.9, 0);
    box(g, W, 0.05, 0.99, M.verde, 0, 1.0);
    box(g, W, 0.02, 0.02, M.gold, 0, 0.84, 0.47);

    const glass = box(g, W - 0.16, 2.21, 0.05, M.armor, 0, 1.135, 0); glass.castShadow = false;
    for (const s of [-1, 1]) box(g, 0.1, 2.5, 0.14, M.monel, s * (W / 2 - 0.05), 1.05, 0);
    box(g, W, 0.14, 0.16, M.monel, 0, 3.35, 0);

    for (const s of [-1, 1]) box(g, (W - 0.54) / 2, 0.1, 0.16, M.monel, s * (0.27 + (W - 0.54) / 4), 1.03, 0);
    box(g, 0.54, 0.03, 0.16, M.monel, 0, 1.1, 0);
    ring(g, 0.13, 0.015, M.monel, 0, 1.62, 0.03, false);

    const holes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.01, 12), M.lacquer, 19), d = new THREE.Object3D();
    let k = 0; for (const [n, r] of [[1, 0], [6, 0.04], [12, 0.08]]) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.PI / 2; d.position.set(Math.cos(a) * r, 1.62 + Math.sin(a) * r, 0.03); d.updateMatrix(); holes.setMatrixAt(k++, d.matrix); }
    g.add(holes);
    const tray = new THREE.Group(); g.add(tray);
    box(tray, 0.5, 0.01, 0.7, M.monel, 0, 1.05, 0); for (const s of [-1, 1]) box(tray, 0.015, 0.025, 0.7, M.monel, s * 0.25, 1.05, 0);
    if (numTex) put(g, new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.3, metalness: 0.4 }), 0, 3.55, 0.09).castShadow = false;
    return g;
}

export function stanchion(M, len = 2) {
    const g = new THREE.Group();
    for (const x of [0, len]) { cyl(g, 0.16, 0.04, M.gold, x, 0, 0); cyl(g, 0.028, 0.92, M.gold, x, 0.04, 0, 20); ball(g, 0.05, M.gold, x, 0.98, 0); }
    const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector3(t * len, 0.9 - Math.sin(t * Math.PI) * 0.18, 0)); }
    put(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.025, 8), M.wine);
    return g;
}

export function slipStand(M) {
    const g = new THREE.Group();
    let y = steps(g, [[0.56, 0.04, 0.56, M.black], [0.5, 0.05, 0.5, M.gold], [0.42, 0.03, 0.42, M.black], [0.34, 0.84, 0.34, M.black], [0.38, 0.02, 0.38, M.gold], [0.42, 0.04, 0.42, M.black]]);
    for (let k = 0; k < 4; k++) { const f = new THREE.Group(); f.rotation.y = k * Math.PI / 2; g.add(f); reeds(f, M.black, { y: 0.16, z: 0.17, w: 0.26, h: 0.7, n: 6, r: 0.016 }); }
    const top = box(g, 0.6, 0.05, 0.45, M.black, 0, y, 0); top.rotation.x = 0.35;
    for (let k = 0; k < 3; k++) box(g, 0.14, 0.03, 0.2, M.paper, -0.18 + k * 0.18, y + 0.05, 0.02).rotation.x = 0.35;
    return g;
}

export function vaultDoor(M, R = 2.3) {
    const g = new THREE.Group();
    const frame = put(g, new THREE.TorusGeometry(R + 0.25, 0.28, 24, 96), M.lacquer, 0, 0, 0);
    const door = put(g, new THREE.CylinderGeometry(R, R, 0.5, 96), M.steel, 0, 0, 0.1); door.rotation.x = Math.PI / 2;
    ring(g, R * 0.82, 0.05, M.monel, 0, 0, 0.36, false); ring(g, R * 0.5, 0.05, M.gold, 0, 0, 0.36, false);
    const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 20), M.monel, 20), d = new THREE.Object3D();
    for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; d.position.set(Math.cos(a) * (R - 0.25), Math.sin(a) * (R - 0.25), 0.4); d.rotation.set(Math.PI / 2, 0, 0); d.updateMatrix(); bolts.setMatrixAt(k, d.matrix); }
    g.add(bolts);
    ring(g, 0.6, 0.06, M.gold, 0, 0, 0.55, false);
    for (let k = 0; k < 6; k++) { const s = box(g, 0.07, 1.2, 0.07, M.gold, 0, 0, 0.55); s.position.y = 0; s.rotation.z = k / 6 * Math.PI; }
    cyl(g, 0.16, 0.2, M.gold, 0, 0, 0.5).rotation.x = Math.PI / 2;
    box(g, 0.5, 1.4, 0.4, M.monel, R + 0.3, -0.7, 0.2);
    return g;
}

export function sconce(M) {
    const g = new THREE.Group();
    const fan = put(g, new THREE.CylinderGeometry(0.34, 0.04, 0.5, 32, 1, true, -Math.PI / 2, Math.PI), M.alabaster, 0, 0, 0);
    fan.material = M.alabaster; fan.castShadow = false;
    for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + k / 6 * Math.PI; const r = box(g, 0.02, 0.52, 0.02, M.gold, 0, -0.26, 0); r.position.set(Math.sin(a) * 0.19, 0, Math.cos(a) * 0.19); r.rotation.set(Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55); }
    box(g, 0.2, 0.5, 0.03, M.gold, 0, -0.35, 0.0);
    return g;
}

export function elevator(M, fanTex) {
    const g = new THREE.Group();
    steps(g, [[2.9, 0.1, 0.3, M.gold]]);
    for (let k = 0; k < 4; k++) box(g, 2.9 - k * 0.25, 0.12, 0.3 - k * 0.04, M.gold, 0, 3.3 + k * 0.12);
    for (const s of [-1, 1]) box(g, 0.25, 3.3, 0.3, M.black, s * 1.32, 0);
    const doors = new THREE.MeshPhysicalMaterial({ map: fanTex, metalness: 1, roughness: 0.25, color: '#dfe2de' });
    for (const s of [-1, 1]) box(g, 1.18, 3.1, 0.06, doors, s * 0.6, 0.1, -0.05);
    const dial = put(g, new THREE.CircleGeometry(0.5, 48, 0, Math.PI), M.gold, 0, 3.85, 0.17); dial.castShadow = false;
    box(g, 0.03, 0.4, 0.02, M.lacquer, 0.1, 3.85, 0.19).rotation.z = -0.6;
    return g;
}
export function fanTexture() {
    return T.tex(T.canvas(512, 1024, (g, w, h) => {
        g.fillStyle = '#c9ccc8'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(40,40,40,.55)'; g.lineWidth = 3;
        for (let k = 0; k < 13; k++) { const a = Math.PI + k / 12 * Math.PI; g.beginPath(); g.moveTo(w / 2, h * 0.55); g.lineTo(w / 2 + Math.cos(a) * w, h * 0.55 + Math.sin(a) * w); g.stroke(); }
        for (let r = 60; r < w; r += 60) { g.beginPath(); g.arc(w / 2, h * 0.55, r, Math.PI, 0); g.stroke(); }
        g.strokeRect(20, 20, w - 40, h - 40);
    }));
}

export function mural(M, muralTex, w = 5, h = 9) {
    const g = new THREE.Group();
    put(g, new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ map: muralTex, roughness: 0.55, clearcoat: 1, clearcoatRoughness: 0.07 }), 0, h / 2, 0.02).castShadow = false;
    for (const s of [-1, 1]) box(g, 0.18, h + 0.36, 0.14, M.gold, s * (w / 2 + 0.09), -0.18);
    box(g, w + 0.36, 0.18, 0.14, M.gold, 0, -0.18); box(g, w + 0.36, 0.18, 0.14, M.gold, 0, h);
    return g;
}

export function teller(M) {
    const g = new THREE.Group();
    lathe(g, [[0.0, 0.0], [0.17, 0.0], [0.2, 0.3], [0.23, 0.55], [0.26, 0.62], [0.24, 0.7], [0.0, 0.72]], M.suit, 0, 0.95, 0, 32);
    for (const s of [-1, 1]) { cyl(g, 0.075, 0.95, M.suit, s * 0.1, 0, 0, 16, 0.065); const a = cyl(g, 0.055, 0.62, M.suit, s * 0.29, 1.03, 0, 12, 0.045); a.rotation.z = s * 0.06; ball(g, 0.05, M.skin, s * 0.3, 1.0, 0); }
    box(g, 0.14, 0.3, 0.02, M.shirt, 0, 1.36, 0.2).rotation.x = -0.12;
    cyl(g, 0.05, 0.1, M.skin, 0, 1.66, 0, 16);
    ball(g, 0.11, M.skin, 0, 1.86, 0).scale.set(1, 1.2, 1.05);
    const shade = put(g, new THREE.CylinderGeometry(0.16, 0.12, 0.02, 32, 1, false, -Math.PI / 2, Math.PI), M.visor, 0, 1.94, 0.04); shade.rotation.x = 0.35;
    ring(g, 0.12, 0.012, M.visor, 0, 1.93, 0);
    return g;
}

export function lampPost(M) {
    const g = new THREE.Group();
    const y = steps(g, [[0.7, 0.15, 0.7, M.black], [0.5, 0.5, 0.5, M.black], [0.56, 0.06, 0.56, M.gold]]);
    cyl(g, 0.07, 3.6, M.goldDull, 0, y, 0, 24, 0.1);
    ring(g, 0.12, 0.025, M.gold, 0, y + 1.2);
    ball(g, 0.26, M.glow, 0, y + 3.95, 0);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; box(g, 0.02, 0.62, 0.02, M.gold, Math.cos(a) * 0.27, y + 3.62, Math.sin(a) * 0.27); }
    cyl(g, 0.3, 0.05, M.gold, 0, y + 3.6); cyl(g, 0.05, 0.25, M.gold, 0, y + 4.2, 0, 12, 0.18);
    return g;
}

function rimInk(k = 0.16) {
    const m = new THREE.MeshStandardMaterial({ color: '#030303', roughness: 0.85 });
    m.onBeforeCompile = sh => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
            float rim = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 5.0);
            gl_FragColor.rgb += vec3(1.0, 0.62, 0.3) * rim * ${k.toFixed(3)};`);
    };
    m.customProgramCacheKey = () => 'rimInk' + k;
    return m;
}

export function loftGeo(rings, { seg = 28, across = new THREE.Vector3(1, 0, 0), cap = true } = {}) {
    const n = rings.length, C = rings.map(r => new THREE.Vector3(r[0], r[1], r[2])), pos = [], uv = [], idx = [];
    const ring = i => {
        const t = C[Math.min(n - 1, i + 1)].clone().sub(C[Math.max(0, i - 1)]).normalize();
        const a = across.clone().addScaledVector(t, -across.dot(t)).normalize(), b = new THREE.Vector3().crossVectors(a, t);
        const [, , , rx, rz, sq = 2] = rings[i], e = 2 / sq, out = [];
        for (let k = 0; k < seg; k++) { const th = k / seg * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); out.push(C[i].clone().addScaledVector(a, rx * Math.sign(c) * Math.abs(c) ** e).addScaledVector(b, rz * Math.sign(s) * Math.abs(s) ** e)); }
        return out;
    };
    const R = rings.map((_, i) => ring(i));
    R.forEach((r, i) => r.forEach((p, k) => { pos.push(p.x, p.y, p.z); uv.push(k / seg, i / (n - 1)); }));
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const k1 = (k + 1) % seg, a = i * seg + k, b = i * seg + k1, c = (i + 1) * seg + k, d = (i + 1) * seg + k1; idx.push(a, c, b, b, c, d); }
    if (cap) for (const [i, dir] of [[0, 0], [n - 1, 1]]) {
        const base = pos.length / 3; pos.push(C[i].x, C[i].y, C[i].z); uv.push(0.5, 0.5);
        R[i].forEach(p => { pos.push(p.x, p.y, p.z); uv.push(0.5, 0.5); });
        for (let k = 0; k < seg; k++) { const k1 = (k + 1) % seg; if (dir) idx.push(base, base + 1 + k1, base + 1 + k); else idx.push(base, base + 1 + k, base + 1 + k1); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
}
export const loft = (g, rings, mat, opts) => { const m = new THREE.Mesh(loftGeo(rings, opts), mat); m.castShadow = m.receiveShadow = true; g.add(m); return m; };

export function reach(root, target, a, b, pole) {
    const d = target.clone().sub(root), L = Math.min(d.length(), a + b - 1e-4), dir = d.normalize();
    const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
    const side = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    return root.clone().addScaledVector(dir, x).addScaledVector(side, h);
}

export function aim(o, a, b) { o.position.copy(a); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); o.scale.set(1, a.distanceTo(b), 1); return o; }

export function oxfordGeo() {

    const L = [
        [-0.142, 0.029, 0.064, 3.2], [-0.13, 0.037, 0.074, 3.4], [-0.1, 0.04, 0.079, 3.4], [-0.06, 0.038, 0.083, 3.2], [-0.02, 0.042, 0.086, 3.0], [0.02, 0.049, 0.079, 3.0],
        [0.06, 0.051, 0.063, 3.2], [0.095, 0.048, 0.049, 3.4], [0.12, 0.042, 0.04, 3.4], [0.14, 0.032, 0.033, 3.0], [0.155, 0.018, 0.028, 2.6], [0.161, 0.005, 0.025, 2.2]];
    const sole = 0.013, heel = 0.022;
    const liftAt = z => z < -0.06 ? heel : z < -0.02 ? heel * (1 - (z + 0.06) / 0.04) : 0;
    const upper = loftGeo(L.map(([z, w, top, sq]) => { const b = sole + liftAt(z); return [0, (b + top) / 2 + 0.002, z, w, (top - b) / 2, sq]; }), { across: new THREE.Vector3(1, 0, 0), seg: 28 });
    const welt = loftGeo(L.map(([z, w]) => [0, sole / 2 + liftAt(z), z, w + 0.004, sole / 2, 8]), { seg: 28 });
    const heelBlock = loftGeo([[0, heel / 2, -0.14, 0.03, heel / 2, 5], [0, heel / 2, -0.1, 0.038, heel / 2, 5], [0, heel / 2, -0.065, 0.036, heel / 2, 5]], { seg: 20 });
    const laces = [0, 0.018, 0.036].map(z => new THREE.CylinderGeometry(0.0025, 0.0025, 0.05, 6).rotateZ(Math.PI / 2).translate(0, 0.087 - z * 0.25, -0.01 + z));
    const cap = new THREE.TorusGeometry(0.045, 0.0018, 4, 24, Math.PI).rotateX(-Math.PI / 2).rotateZ(0).translate(0, 0.05, 0.085);
    return mergeAll([upper, welt, heelBlock, ...laces, cap]);
}

export function tstrapGeo() {
    const arch = z => z > 0.03 ? 0.004 : 0.004 + 0.062 * THREE.MathUtils.smoothstep(0.03 - z, 0, 0.13);
    const S = [[0.125, 0.012], [0.11, 0.03], [0.08, 0.037], [0.04, 0.038], [0.0, 0.031], [-0.04, 0.027], [-0.08, 0.029], [-0.105, 0.024], [-0.115, 0.012]];
    const sole = loftGeo(S.map(([z, w]) => [0, arch(z), z, w, 0.004, 5]), { seg: 22 });
    const toe = loftGeo([[0.128, 0.006], [0.115, 0.028], [0.09, 0.036], [0.06, 0.038], [0.035, 0.037]].map(([z, w], i) => [0, arch(z) + 0.004 + [0.008, 0.018, 0.024, 0.027, 0.026][i], z, w, [0.006, 0.014, 0.02, 0.023, 0.022][i], 2.4]), { seg: 22 });
    const counter = loftGeo([[-0.04, 0.027, 0.012], [-0.07, 0.029, 0.03], [-0.1, 0.025, 0.035], [-0.113, 0.014, 0.03]].map(([z, w, h]) => [0, arch(z) + h, z, w, h, 2.2]), { seg: 22 });
    const heel = loftGeo([[0, 0.066, -0.088, 0.024, 0.03, 3], [0, 0.04, -0.095, 0.016, 0.019, 3], [0, 0.015, -0.1, 0.012, 0.013, 3], [0, 0.002, -0.1, 0.012, 0.013, 3]], { seg: 16, across: new THREE.Vector3(1, 0, 0) });
    const strap = loftGeo([[0, 0.068, 0.035, 0.006, 0.0025], [0, 0.098, -0.02, 0.006, 0.0025], [0, 0.118, -0.055, 0.006, 0.0025]], { seg: 8 });
    const ankle = new THREE.TorusGeometry(0.036, 0.004, 6, 24).rotateX(Math.PI / 2).translate(0, 0.118, -0.068);
    const foot = loftGeo([[0.1, 0.02], [0.07, 0.034], [0.03, 0.036], [-0.02, 0.03], [-0.06, 0.028], [-0.09, 0.026]].map(([z, w]) => [0, arch(z) + 0.022 + (z < 0 ? -z * 0.25 : 0), z, w * 0.92, 0.02, 2]), { seg: 18 });
    return { geo: mergeAll([sole, toe, counter, heel, strap, ankle]), foot };
}
const mergeAll = list => {
    const pos = [], nor = [], uv = [], idx = []; let off = 0;
    for (const g0 of list) { const g = g0.index ? g0 : g0; const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
        for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
        off += p.count; }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx); return out;
};
export { mergeAll };

const f3 = v => Number(v).toFixed(3);
function smokeFx(o, n = 130, ribbons = 80) {
    const seeds = new Float32Array(n).map(() => Math.random()), kinds = new Float32Array(n).map((_, i) => i < ribbons ? 0 : 1);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1)); geo.setAttribute('kind', new THREE.BufferAttribute(kinds, 1));
    const smoke = new THREE.Points(geo, new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, origin: { value: new THREE.Vector3() }, mouth: { value: new THREE.Vector3() }, breath: { value: -99 } },
        vertexShader: `attribute float seed, kind; uniform float time, breath; uniform vec3 origin, mouth; varying float vA;
            void main() {
                vec3 p; float age, size;
                if (kind < 0.5) {
                    age = fract(time * ${f3(o.rate)} + seed);
                    p = origin + vec3(sin(age * ${f3(o.wig[0])} + seed * 30.0) * ${f3(o.wander[0])} * age, age * ${f3(o.rise)}, cos(age * ${f3(o.wig[1])} + seed * 20.0) * ${f3(o.wander[1])} * age);
                    vA = smoothstep(0.0, 0.06, age) * (1.0 - age) * ${f3(o.ribA)}; size = ${f3(o.ribSize[0])} + age * ${f3(o.ribSize[1])};
                } else {
                    age = clamp((time - breath - seed * ${f3(o.gap)}) / ${f3(o.dur)}, 0.0, 1.0);
                    vec3 dir = normalize(vec3(sin(seed * 40.0) * 0.4, ${f3(o.up)} + age, 1.0));
                    p = mouth + dir * (${f3(o.out)} * sqrt(age)) + vec3(0.0, age * age * ${f3(o.lift)}, 0.0) + vec3(sin(seed * 70.0), cos(seed * 50.0), sin(seed * 90.0)) * ${f3(o.jit)} * age;
                    vA = (age > 0.0 && age < 1.0 ? 1.0 : 0.0) * smoothstep(0.0, 0.05, age) * (1.0 - age) * ${f3(o.puffA)}; size = ${f3(o.puffSize[0])} + age * ${f3(o.puffSize[1])};
                }
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                gl_PointSize = size * 3.0 / -mv.z;
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(0.62, 0.6, 0.57), clamp(vA * (1.0 - d * 2.0), 0.0, 1.0)); }`,
        transparent: true, depthWrite: false,
    }));
    smoke.frustumCulled = false;
    return smoke;
}

function handTurn(fingers, back) {
    const x = fingers.clone().normalize(), z = new THREE.Vector3().crossVectors(x, back).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(z, x), z));
}
export const EYES = 3;
export function silhouetteMan() {
    const g = new THREE.Group(), ink = rimInk(), V = (x, y, z) => new THREE.Vector3(x, y, z), X = V(1, 0, 0), Z = V(0, 0, 1);

    const shoe = oxfordGeo();
    for (const [x, hipZ, fz, yaw] of [[-0.11, -0.04, -0.1, -0.12], [0.12, -0.02, 0.0, 0.18]]) {
        const hip = V(x * 0.8, 0.93, hipZ), ankle = V(x, 0.1, fz - 0.03), knee = reach(hip, ankle, 0.44, 0.43, V(0, 0, 1));
        loft(g, [[hip.x, hip.y + 0.04, hip.z, 0.1, 0.105], [hip.x, hip.y - 0.1, hip.z + 0.005, 0.098, 0.1], [knee.x, knee.y + 0.05, knee.z + 0.005, 0.088, 0.09], [knee.x, knee.y, knee.z, 0.087, 0.09],
            [(knee.x + ankle.x) / 2, (knee.y + ankle.y) / 2, (knee.z + ankle.z) / 2, 0.082, 0.085], [ankle.x, 0.14, ankle.z + 0.01, 0.083, 0.088], [ankle.x, 0.075, ankle.z + 0.02, 0.086, 0.094]], ink, { across: X, seg: 26 });
        const s = new THREE.Mesh(shoe, ink); s.position.set(x, 0, fz + 0.04); s.rotation.y = yaw; s.castShadow = true; g.add(s);
    }

    const hips = V(0, 0.93, -0.05), pivot = new THREE.Group(); pivot.position.copy(hips); g.add(pivot);
    const body = new THREE.Group(); body.position.copy(hips).negate(); pivot.add(body);

    loft(body, [[0, 0.8, -0.07, 0.19, 0.13, 2.4], [0, 0.9, -0.06, 0.195, 0.135, 2.4], [0, 1.02, -0.03, 0.175, 0.12, 2.3], [0, 1.12, 0.01, 0.17, 0.115, 2.3], [0, 1.24, 0.07, 0.19, 0.125, 2.3],
        [0, 1.35, 0.12, 0.21, 0.13, 2.5], [0, 1.42, 0.155, 0.215, 0.118, 2.8], [0, 1.452, 0.17, 0.19, 0.1, 2.6], [0, 1.474, 0.182, 0.15, 0.084, 2.3], [0, 1.493, 0.193, 0.105, 0.07, 2.1], [0, 1.508, 0.2, 0.075, 0.062, 2]], ink, { across: X, seg: 36 });
    for (const s of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), ink); cap.scale.set(0.062, 0.034, 0.08); cap.position.set(s * 0.195, 1.445, 0.155); body.add(cap);
        loft(body, [[s * 0.07, 1.46, 0.275, 0.012, 0.006], [s * 0.1, 1.33, 0.27, 0.014, 0.007], [s * 0.05, 1.18, 0.23, 0.01, 0.006]], ink, { across: X, seg: 10 });
    }

    const armL = [V(-0.21, 1.43, 0.16), V(-0.25, 1.03, 0.37), V(-0.05, 1.045, 0.45)];
    loft(body, [[...armL[0].toArray(), 0.062, 0.066], [...armL[0].clone().lerp(armL[1], 0.5).toArray(), 0.058, 0.06], [...armL[1].toArray(), 0.054, 0.055], [...armL[1].clone().lerp(armL[2], 0.5).toArray(), 0.05, 0.052], [...armL[2].toArray(), 0.046, 0.045]], ink, { across: Z, seg: 20 });
    const handL = hand(ink); handL.position.copy(armL[2]).add(V(0.02, -0.008, 0.01)); handL.quaternion.copy(handTurn(V(0.75, -0.35, 0.45), V(0, 1, 0.2))); body.add(handL);

    const upper = new THREE.Group(), fore = new THREE.Group(); body.add(upper, fore);
    loft(upper, [[0, 0, 0, 0.062, 0.066], [0, 0.5, 0, 0.056, 0.058], [0, 1, 0, 0.052, 0.054]], ink, { across: X, seg: 18 });
    loft(fore, [[0, 0, 0, 0.052, 0.054], [0, 0.5, 0, 0.047, 0.049], [0, 0.92, 0, 0.044, 0.044], [0, 1, 0, 0.046, 0.046]], ink, { across: X, seg: 18 });
    const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.053, 16, 12), ink); body.add(elbowBall);
    const handR = hand(ink, true); body.add(handR);

    const grip = V(0.115, 0, 0.003), along = V(-0.25, 1, 0).normalize(), HELD = 0.04;
    const cigar = new THREE.Group(); cigar.position.copy(grip); cigar.quaternion.setFromUnitVectors(V(0, 1, 0), along); handR.add(cigar);
    loft(cigar, [[0, -HELD, 0, 0.006, 0.006], [0, -HELD + 0.003, 0, 0.0085, 0.0085], [0, -HELD + 0.012, 0, 0.009, 0.009], [0, 0.04, 0, 0.0095, 0.0095], [0, 0.098, 0, 0.0092, 0.0092]], new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.8 }), { seg: 14 });
    cyl(cigar, 0.0096, 0.01, new THREE.MeshStandardMaterial({ color: '#7a1a12', roughness: 0.45, metalness: 0.2 }), 0, -HELD + 0.012, 0, 14);
    const emberMat = new THREE.MeshBasicMaterial({ color: '#ff6a1a', toneMapped: false });
    const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.0093, 0.0093, 0.004, 14), emberMat); ember.position.y = 0.1; cigar.add(ember);
    cyl(cigar, 0.0088, 0.011, new THREE.MeshStandardMaterial({ color: '#8c8680', roughness: 1 }), 0, 0.102, 0, 14);
    const tip = V(0, 0.113, 0);

    loft(body, [[0, 1.46, 0.2, 0.058, 0.062], [0, 1.53, 0.225, 0.055, 0.058], [0, 1.58, 0.245, 0.054, 0.056]], ink, { across: X, seg: 20 });
    loft(body, [[0, 1.46, 0.2, 0.08, 0.074], [0, 1.515, 0.218, 0.07, 0.066], [0, 1.545, 0.228, 0.066, 0.062]], ink, { across: X, seg: 24 });
    const head = new THREE.Group(); head.position.set(0, 1.585, 0.255); head.scale.setScalar(0.94); body.add(head);
    head.add(new THREE.Mesh(headGeo(), ink));
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), ink); e.scale.set(0.012, 0.03, 0.02); e.position.set(s * 0.078, 0.085, -0.005); e.rotation.y = s * 0.3; head.add(e); }

    const eyeMat = new THREE.MeshBasicMaterial({ toneMapped: false }), setEyes = v => eyeMat.color.setRGB(v, v * 0.97, v * 0.92);
    setEyes(EYES);

    const eyes = [-1, 1].map(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), eyeMat); e.scale.set(0.0082, 0.0036, 0.004); e.position.set(s * 0.029, 0.1, 0.0895); e.rotation.y = s * 0.8; head.add(e); return e; });

    const hat = fedora(); hat.position.set(0, 0.122, 0.004); hat.rotation.x = -0.02; head.add(hat);

    const smoke = smokeFx({ rate: 0.06, rise: 1.4, wander: [0.14, 0.12], wig: [5, 4], ribA: 0.2, ribSize: [6, 55], gap: 1.2, dur: 8, out: 0.3, up: -0.35, lift: 0.7, jit: 0.08, puffA: 0.24, puffSize: [12, 80] });
    g.add(smoke);

    const qRest = handTurn(V(-0.55, 0.05, 0.83), V(0.7, 0.6, 0.2)), qMouth = handTurn(V(-0.45, 0.85, 0.1), V(0.1, 0.1, 1));
    const shoulderR = V(0.21, 1.43, 0.14), rest = V(0.13, 1.24, 0.34), pole = V(1, -0.6, -0.4), end = grip.clone().addScaledVector(along, -HELD);
    const tmp = V(), face = V(), mouth = V(), w = V();
    const pose = u => {
        mouth.set(0, 0.058, 0.095).multiplyScalar(0.94).applyEuler(head.rotation).add(head.position);
        handR.quaternion.slerpQuaternions(qRest, qMouth, u);
        w.copy(end).applyQuaternion(qMouth).negate().add(mouth);
        w.lerpVectors(rest, w, u);
        const el = reach(shoulderR, w, 0.3, 0.27, pole);
        aim(upper, shoulderR, el); aim(fore, el, w); elbowBall.position.copy(el); handR.position.copy(w);
    };
    pose(0);

    const S = THREE.MathUtils.smoothstep, drift = t => Math.sin(t * 0.21) * 0.6 + Math.sin(t * 0.083 + 1.3) * 0.4;
    const lean = { z: 0, x: 0, y: 0, sx: 0 }, leanTo = { z: 0, x: 0, y: 0, sx: 0 };
    let lastT = null, shiftAt = 0, tilt = 0, tiltTo = 0, tiltAt = 0, drawAt = -99, nextDraw = 0, letGo = -99, blinkAt = 0, blinkLen = 0.14;
    g.userData = {
        head, ember, smoke, moving: [pivot, smoke], setEyes,
        look(target, dt) {
            let yaw = 0, pitch = 0.45;
            if (target) {
                head.getWorldPosition(face);
                const local = body.worldToLocal(target.clone()), here = body.worldToLocal(face.clone());
                yaw = THREE.MathUtils.clamp(Math.atan2(local.x - here.x, local.z - here.z), -1.25, 1.25);
                pitch = THREE.MathUtils.clamp(-Math.atan2(local.y - here.y, Math.hypot(local.x - here.x, local.z - here.z)), -0.35, 0.95);
            }
            const k = 1 - Math.exp(-dt * 1.8);
            head.rotation.y += (yaw - head.rotation.y) * k; head.rotation.x += (pitch - head.rotation.x) * k;
            head.rotation.z = tilt;
        },
        update(t) {
            if (lastT === null) { lastT = t; shiftAt = t + 6; tiltAt = t + 9; nextDraw = t + 4; blinkAt = t + 2; }
            const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;

            if (t > shiftAt) { leanTo.z = (Math.random() - 0.5) * 0.06; leanTo.x = (Math.random() - 0.33) * 0.036; leanTo.y = (Math.random() - 0.5) * 0.06; leanTo.sx = (Math.random() - 0.5) * 0.02; shiftAt = t + 12 + Math.random() * 18; }
            const k = 1 - Math.exp(-dt * 0.9);
            for (const a in lean) lean[a] += (leanTo[a] - lean[a]) * k;
            const breath = Math.sin(t * 1.15);
            pivot.rotation.z = lean.z + 0.006 * drift(t); pivot.rotation.x = lean.x + 0.003 * breath + 0.004 * drift(t * 0.7 + 5); pivot.rotation.y = lean.y;
            pivot.position.set(hips.x + lean.sx, hips.y + 0.002 * breath, hips.z);
            if (t > tiltAt) { tiltTo = (Math.random() - 0.5) * 0.14; tiltAt = t + 10 + Math.random() * 16; }
            tilt += (tiltTo - tilt) * (1 - Math.exp(-dt * 0.8));

            if (t > nextDraw && t - drawAt > 7) { drawAt = t; nextDraw = t + 18 + Math.random() * 12; }
            const c = t - drawAt, up = S(c, 0, 2) * (1 - S(c, 4.5, 6.5)), draw = S(c, 2, 2.8) * (1 - S(c, 4.2, 4.8));
            pose(up);
            emberMat.color.setRGB(0.6 + draw * 1.3, 0.17 + draw * 0.4, 0.03 + draw * 0.1);
            if (c > 5 && letGo < drawAt) letGo = t;

            if (t > blinkAt + blinkLen) { blinkAt = t + 3 + Math.random() * 6; blinkLen = Math.random() < 0.2 ? 0.42 : 0.15; }
            const b = (t - blinkAt) / blinkLen, shut = b > 0 && b < 1 ? Math.min(1, Math.sin(b * Math.PI * (blinkLen > 0.3 ? 2 : 1)) ** 2 * 1.3) : 0;
            eyes.forEach(e => { e.scale.y = 0.0036 * (1 - shut) + 0.0002; e.visible = shut < 0.97; });
            cigar.localToWorld(tmp.copy(tip)); smoke.material.uniforms.origin.value.copy(g.worldToLocal(tmp));
            head.localToWorld(tmp.set(0, 0.058, 0.1)); smoke.material.uniforms.mouth.value.copy(g.worldToLocal(tmp));
            smoke.material.uniforms.time.value = t; smoke.material.uniforms.breath.value = letGo;
        },
    };
    return g;
}

function hand(ink, holding = false) {
    const g = new THREE.Group();
    loft(g, [[0, 0, 0, 0.022, 0.035, 2.5], [0.045, 0.002, 0.004, 0.017, 0.042, 3], [0.085, 0.004, 0.006, 0.015, 0.04, 3]], ink, { across: new THREE.Vector3(0, 1, 0), seg: 16 });
    for (let f = 0; f < 4; f++) {
        const z = -0.027 + f * 0.018, curl = holding && (f === 1 || f === 2) ? 0.3 : 0.9, len = [0.07, 0.078, 0.073, 0.058][f];
        const a = new THREE.Vector3(0.085, 0.004, z), b = a.clone().add(new THREE.Vector3(len * 0.55 * Math.cos(curl * 0.6), -len * 0.55 * Math.sin(curl * 0.6), holding && f === 2 ? 0.006 : 0));
        const c = b.clone().add(new THREE.Vector3(len * 0.45 * Math.cos(curl * 1.4), -len * 0.45 * Math.sin(curl * 1.4), 0));
        loft(g, [[...a.toArray(), 0.0085, 0.008], [...b.toArray(), 0.0078, 0.0075], [...c.toArray(), 0.0068, 0.0065]], ink, { across: new THREE.Vector3(0, 0, 1), seg: 10 });
    }
    loft(g, [[0.015, -0.005, 0.03, 0.012, 0.011], [0.045, -0.02, 0.045, 0.01, 0.009], [0.07, -0.03, 0.04, 0.0085, 0.008]], ink, { across: new THREE.Vector3(0, 1, 0), seg: 10 });
    return g;
}

function headGeo() {
    const geo = new THREE.SphereGeometry(1, 40, 32), p = geo.attributes.position;
    const G = (x, s) => Math.exp(-(x * x) / (2 * s * s));
    for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const front = Math.max(0, z);
        x *= 0.078 * (1 - 0.3 * Math.max(0, -y) ** 1.4); y *= 0.112; z *= 0.098;
        z += 0.01 * G(y / 0.112 + 0.75, 0.2) * front;
        z += 0.03 * G(x / 0.02, 1) * G((y - 0.012) / 0.024, 1) * front ** 4;
        z += 0.008 * G((y - 0.04) / 0.01, 1) * front ** 2;
        z -= 0.009 * G((Math.abs(x) - 0.03) / 0.012, 1) * G((y - 0.025) / 0.012, 1) * front ** 3;
        z -= 0.012 * Math.max(0, -z / 0.098) * (y > 0 ? 0 : 1) * 0.4;
        p.setXYZ(i, x, y + 0.075, z);
    }
    geo.computeVertexNormals(); return geo;
}

function fedora() {
    const g = new THREE.Group();
    const brim = new THREE.RingGeometry(0.1, 0.19, 48, 3), bp = brim.attributes.position;
    for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), y = bp.getY(i), r = Math.hypot(x, y), a = Math.atan2(y, x); bp.setXYZ(i, x, -(r - 0.1) * 0.12 * (Math.sin(a) > 0 ? 1.2 * Math.sin(a) : 0.8 * Math.sin(a)), y * 1.08); }
    brim.computeVertexNormals();

    const bm = rimInk(), brimInk = rimInk(0.05); bm.side = brimInk.side = THREE.DoubleSide;
    g.add(new THREE.Mesh(brim, brimInk));
    const crown = new THREE.LatheGeometry([[0.112, 0], [0.11, 0.05], [0.1, 0.09], [0.085, 0.112], [0.05, 0.12], [0.02, 0.108], [0, 0.1]].map(([r, h]) => new THREE.Vector2(r, h)), 40), cp = crown.attributes.position;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i); const pinch = z > 0 ? 0.18 * (y / 0.12) ** 2 * Math.exp(-(x * x) / 0.002) : 0; cp.setXYZ(i, x * (1 - pinch * 0.6), y - (Math.abs(x) < 0.03 ? 0.014 * (1 - Math.abs(x) / 0.03) * (y / 0.12) : 0), z * 1.08 * (1 - pinch * 0.3)); }

    crown.computeVertexNormals(); const c = new THREE.Mesh(crown, bm); g.add(c);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.111, 0.113, 0.03, 40, 1, true), bm); band.position.y = 0.016; band.scale.z = 1.08; g.add(band);
    const lining = new THREE.Mesh(new THREE.CircleGeometry(0.111, 40).rotateX(Math.PI / 2), bm); lining.position.y = 0.004; lining.scale.z = 1.08; g.add(lining);
    return g;
}

export const WOMAN_STYLES = {
    A: { label: 'A · as she is', hip: 0.18, waist: 0.138, bust: 0.158, bustMound: 0, shoulder: 0.18, arm: 1, neck: 0, head: 0.86, tall: 1, anatomy: 0, lean: 0 },
    B: { label: 'B · hourglass', hip: 0.19, waist: 0.112, bust: 0.162, bustMound: 0.012, shoulder: 0.168, arm: 0.95, neck: 0.012, head: 0.84, tall: 1, anatomy: 1, lean: 1 },
    C: { label: 'C · willowy', hip: 0.165, waist: 0.124, bust: 0.146, bustMound: 0.006, shoulder: 0.162, arm: 0.88, neck: 0.03, head: 0.82, tall: 1.035, anatomy: 1, lean: 0.8 },
    D: { label: 'D · soft + full', hip: 0.205, waist: 0.142, bust: 0.172, bustMound: 0.016, shoulder: 0.176, arm: 1.12, neck: 0.008, head: 0.86, tall: 0.99, anatomy: 1, lean: 0.9 },
};
export function womanInRed(style = WOMAN_STYLES.A) {
    const st = { ...WOMAN_STYLES.A, ...style }, a = st.anatomy, ar = st.arm;
    const g = new THREE.Group(), ink = rimInk(), V = (x, y, z) => new THREE.Vector3(x, y, z), X = V(1, 0, 0), Z = V(0, 0, 1);
    const S = THREE.MathUtils.smoothstep, G = v => Math.exp(-v * v / 2);

    const satin = new THREE.MeshPhysicalMaterial({ color: '#8e0c12', emissive: '#6a0508', emissiveIntensity: 0.45, roughness: 0.34, sheen: 0.6, sheenColor: new THREE.Color('#ff5a4a'), sheenRoughness: 0.35, clearcoat: 0.2, clearcoatRoughness: 0.4, side: THREE.DoubleSide });
    const platinum = new THREE.MeshPhysicalMaterial({ color: '#e8dfc8', roughness: 0.4, sheen: 0.7, sheenColor: new THREE.Color('#fff4dc'), sheenRoughness: 0.35 });

    const hk = st.hip / 0.18, bk = st.bust / 0.158;
    const sh = st.shoulder, BODY = [[0.8, 0.02, st.hip * 0.956, 0.125 * hk, 2.2], [0.9, 0, st.hip, 0.13 * hk, 2.2], [0.98, -0.004, (st.hip + st.waist) / 2 + 0.001, 0.115 * (0.5 + hk / 2), 2.2],
        [1.05, -0.005, st.waist, st.waist * 0.725, 2.2], [1.12, 0, st.waist * 1.03, st.waist * 0.75, 2.2], [1.19, 0.006, (st.waist + st.bust) / 2 + 0.004, 0.113 * bk, 2.2],
        [1.26, 0.012, st.bust, 0.12 * bk, 2.2], [1.33, 0.004, st.bust * 1.01, 0.1, 2.4]].concat(a

        ? [[1.37, -0.004, sh * 0.98, 0.086, 2.2], [1.39, -0.006, sh, 0.08, 2.1], [1.405, -0.008, sh * 0.9, 0.074, 2.1], [1.422, -0.01, 0.122, 0.066, 2.05],
           [1.438, -0.012, 0.092, 0.058, 2], [1.452, -0.014, 0.066, 0.05, 2], [1.462, -0.014, 0.05, 0.044, 2]]
        : [[1.38, -0.004, sh, 0.085, 2.6], [1.41, -0.008, sh * 0.94, 0.075, 2.4], [1.435, -0.01, 0.12, 0.062, 2.1], [1.455, -0.01, 0.075, 0.052, 2]]);
    const SKIRT = [[0.015, 0.15, 0.25 * hk, 0.21, 2], [0.12, 0.13, 0.215 * hk, 0.18, 2], [0.3, 0.1, 0.19 * hk, 0.15, 2], [0.5, 0.065, 0.172 * hk, 0.135, 2.1], [0.68, 0.035, 0.172 * hk, 0.13 * hk, 2.2]];
    const DRESS = SKIRT.concat(BODY.filter(r => r[0] <= 1.34));
    const ringAt = (rows, y) => { let i = 0; while (i < rows.length - 2 && rows[i + 1][0] < y) i++; const p = rows[i], q = rows[i + 1], k = THREE.MathUtils.clamp((y - p[0]) / (q[0] - p[0]), 0, 1); return p.map((v, j) => v + (q[j] - v) * k); };

    const carve = (x, y, zc) => {
        const back = S(-zc, 0, 0.05), front = S(zc, 0, 0.05);
        return a * back * (0.016 * G((y - 1.06) / 0.05) - 0.016 * G((y - 0.86) / 0.06) - 0.01 * G((y - 1.3) / 0.06)
                          + 0.007 * G(x / 0.017) * S(y, 0.98, 1.05) * (1 - S(y, 1.38, 1.44))
                          - 0.012 * G((Math.abs(x) - 0.075) / 0.032) * G((y - 1.325) / 0.045))
             + front * st.bustMound * G((Math.abs(x) - 0.072) / 0.045) * G((y - 1.255) / 0.04);
    };

    const roll = y => st.lean * 0.065 * (y < 0.9 ? S(y, 0.45, 0.9) : 1 - 2 * S(y, 0.95, 1.32));
    const shift = y => st.lean * 0.02 * (y < 0.9 ? S(y, 0.1, 0.9) : 1 - S(y, 0.95, 1.3));
    const posed = (x, y, z) => V(x + shift(y), y + x * roll(y), z);
    const surf = (rows, y, th, out) => { const [, cz, w, d, sq] = ringAt(rows, y), e = 2 / sq, sn = Math.sin(th), cs = Math.cos(th);
        const x = (w + out) * Math.sign(sn) * Math.abs(sn) ** e, zc = (d + out) * Math.sign(cs) * Math.abs(cs) ** e;
        return posed(x, y, cz + zc + carve(x, y, zc)); };

    const sweep = (rows, yLo, yHi, out, mat, nr) => {
        const cols = 56, pos = [], idx = [];
        for (let r = 0; r <= nr; r++) for (let c = 0; c < cols; c++) { const th = c / cols * Math.PI * 2, top = typeof yHi === 'function' ? yHi(th) : yHi; pos.push(...surf(rows, yLo + (top - yLo) * r / nr, th, out).toArray()); }
        for (let r = 0; r < nr; r++) for (let c = 0; c < cols; c++) { const p = r * cols + c, q = r * cols + (c + 1) % cols; idx.push(p, q, p + cols, q, q + cols, p + cols); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; g.add(m); return m;
    };
    sweep(BODY, 0.8, BODY[BODY.length - 1][0], 0, ink, 54);

    const edge = th => 1.1 + 0.23 * ((1 + Math.cos(th)) / 2) ** 0.7;
    sweep(DRESS, 0.015, edge, 0.006, satin, 48);

    for (const s of [-1, 1]) {
        const pts = [], f = edge(s * 0.5), b = edge(s * (Math.PI - 0.45));
        for (let k = 0; k <= 16; k++) { const u = k / 16, th = s * (0.5 + u * (Math.PI - 0.95)), y = (u < 0.5 ? f : b) + (1.437 - (u < 0.5 ? f : b)) * Math.sin(u * Math.PI);
            pts.push(y > edge(th) + 0.003 ? surf(BODY, Math.min(y, 1.45), th, 0.004) : surf(DRESS, y, th, 0.009)); }
        put(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0035, 6), satin);
    }

    const nb = 0.05 - 0.008 * a, nt = 0.041 - 0.004 * a;
    loft(g, [[...posed(0, 1.43, -0.012 - 0.008 * a).toArray(), nb, nb * 0.96], [...posed(0, 1.47 + st.neck / 2, -0.008 + 0.006 * a).toArray(), (nb + nt) / 2, (nb + nt) / 2], [...posed(0, 1.52 + st.neck, 0.018 * a).toArray(), nt, nt]], ink, { across: X, seg: 20 });
    const head = new THREE.Group(); head.position.copy(posed(0, 1.525 + st.neck, 0.012 + 0.02 * a)); head.scale.setScalar(st.head); g.add(head);
    head.add(new THREE.Mesh(headGeo().scale(0.93, 1, 0.97), ink));
    head.add(new THREE.Mesh(bobGeo(), platinum));
    const HEAD = { yaw: 0.35, pitch: -0.06, tilt: 0.06 + 0.04 * st.lean }; head.rotation.set(HEAD.pitch, HEAD.yaw, HEAD.tilt);

    const jointY = 1.395 - 0.017 * a, jointX = st.shoulder - 0.015 - 0.006 * a;
    for (const s of [-1, 1]) if (a) { const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), ink); cap.scale.set(0.036 * ar, 0.028 * ar, 0.04 * ar); cap.position.copy(posed(s * (jointX - 0.006), jointY + 0.014, -0.006)); g.add(cap); }
    const shoulderL = posed(-jointX, jointY, -0.01), wristL = posed(0.1, 1.09, 0.15), elbowL = reach(shoulderL, wristL, 0.29, 0.26, V(-1, -0.3, 0.1));

    const along = (p, q, t) => p.clone().lerp(q, t).toArray();
    loft(g, [[...along(shoulderL, elbowL, -0.08), 0.02 * ar, 0.02 * ar], [...shoulderL.toArray(), 0.037 * ar, 0.038 * ar], [...along(shoulderL, elbowL, 0.12), 0.041 * ar, 0.042 * ar], [...along(shoulderL, elbowL, 0.35), 0.037 * ar, 0.037 * ar], [...along(shoulderL, elbowL, 0.75), 0.031 * ar, 0.031 * ar], [...elbowL.toArray(), 0.028 * ar, 0.028 * ar],
        [...along(elbowL, wristL, 0.22), 0.03 * ar, 0.029 * ar], [...along(elbowL, wristL, 0.65), 0.025 * ar, 0.024 * ar], [...wristL.toArray(), 0.019 * ar, 0.018 * ar]], ink, { across: Z, seg: 16 });
    put(g, new THREE.SphereGeometry(0.028 * ar, 14, 10), ink, ...elbowL.toArray());
    const handL = hand(ink); handL.scale.setScalar(0.82); handL.position.copy(wristL); handL.quaternion.copy(handTurn(V(1, 0.05, 0.15), V(0, -1, 0.25))); g.add(handL);
    const upper = new THREE.Group(), fore = new THREE.Group(); g.add(upper, fore);
    loft(upper, [[0, -0.08, 0, 0.02 * ar, 0.02 * ar], [0, 0, 0, 0.037 * ar, 0.038 * ar], [0, 0.12, 0, 0.041 * ar, 0.042 * ar], [0, 0.35, 0, 0.037 * ar, 0.037 * ar], [0, 0.75, 0, 0.031 * ar, 0.031 * ar], [0, 1, 0, 0.028 * ar, 0.028 * ar]], ink, { across: X, seg: 16 });
    loft(fore, [[0, 0, 0, 0.028 * ar, 0.028 * ar], [0, 0.22, 0, 0.03 * ar, 0.029 * ar], [0, 0.65, 0, 0.025 * ar, 0.024 * ar], [0, 1, 0, 0.019 * ar, 0.018 * ar]], ink, { across: X, seg: 16 });
    const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.028 * ar, 14, 10), ink); g.add(elbowBall);
    const handR = hand(ink, true); handR.scale.setScalar(0.82); g.add(handR);

    const grip = V(0.115, 0, 0.003), dir = V(0.35, 1, 0).normalize(), HELD = 0.014;
    const cig = new THREE.Group(); cig.position.copy(grip); cig.quaternion.setFromUnitVectors(V(0, 1, 0), dir); handR.add(cig);
    cyl(cig, 0.0042, 0.078, new THREE.MeshStandardMaterial({ color: '#e6e0d2', roughness: 0.6 }), 0, -HELD, 0, 10);
    const emberMat = new THREE.MeshBasicMaterial({ color: '#ff6a1a', toneMapped: false });
    cyl(cig, 0.0043, 0.003, emberMat, 0, 0.064, 0, 10); cyl(cig, 0.0041, 0.004, new THREE.MeshStandardMaterial({ color: '#8c8680', roughness: 1 }), 0, 0.067, 0, 10);
    const tip = V(0, 0.071, 0);

    const smoke = smokeFx({ rate: 0.09, rise: 1.5, wander: [0.1, 0.08], wig: [7, 5], ribA: 0.15, ribSize: [3.5, 38], gap: 0.6, dur: 6, out: 0.22, up: 0.9, lift: 0.9, jit: 0.06, puffA: 0.2, puffSize: [8, 60] });
    g.add(smoke);

    const shoulderR = posed(jointX, jointY, -0.01), rest = shoulderR.clone().add(V(-0.045, -0.005, 0.2)), pole = V(0.1, -1, 0.5), end = grip.clone().addScaledVector(dir, -HELD);
    const qRest = handTurn(V(-0.05, 1, -0.2), V(0.7, 0.15, 0.7)), qLips = handTurn(V(-0.45, 1, 0.05), V(0.45, 0.1, 1));
    const mouth = V(), w = V(), tmp = V();
    const pose = u => {
        mouth.set(0, 0.036, 0.094).multiplyScalar(st.head).applyEuler(head.rotation).add(head.position);
        handR.quaternion.slerpQuaternions(qRest, qLips, u);
        w.copy(end).multiplyScalar(0.82).applyQuaternion(qLips).negate().add(mouth);
        w.lerpVectors(rest, w, u);
        const el = reach(shoulderR, w, 0.29, 0.26, pole);
        aim(upper, shoulderR, el); aim(fore, el, w); elbowBall.position.copy(el); handR.position.copy(w);
    };
    pose(0);
    g.scale.setScalar(st.tall);
    let drawAt = -99, nextDraw = null, letGo = -99, tilt = HEAD.tilt, tiltTo = HEAD.tilt, tiltAt = 0, lastT = 0;
    g.userData = {
        head, smoke, moving: [head, upper, fore, elbowBall, handR, smoke],
        update(t) {
            if (nextDraw === null) { nextDraw = t + 3; tiltAt = t + 8; lastT = t; }
            const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;

            if (t > nextDraw && t - drawAt > 6) { drawAt = t; nextDraw = t + 14 + Math.random() * 10; }
            const c = t - drawAt, draw = S(c, 1.3, 1.8) * (1 - S(c, 3.0, 3.4));
            pose(S(c, 0, 1.4) * (1 - S(c, 3.2, 4.6)));
            emberMat.color.setRGB(0.6 + draw * 1.3, 0.17 + draw * 0.4, 0.03 + draw * 0.1);
            if (c > 3.6 && letGo < drawAt) letGo = t;

            if (t > tiltAt) { tiltTo = HEAD.tilt + (Math.random() - 0.5) * 0.12; tiltAt = t + 9 + Math.random() * 14; }
            tilt += (tiltTo - tilt) * (1 - Math.exp(-dt * 0.6)); head.rotation.z = tilt;
            cig.localToWorld(tmp.copy(tip)); smoke.material.uniforms.origin.value.copy(g.worldToLocal(tmp));
            head.localToWorld(tmp.set(0, 0.036, 0.1)); smoke.material.uniforms.mouth.value.copy(g.worldToLocal(tmp));
            smoke.material.uniforms.time.value = t; smoke.material.uniforms.breath.value = letGo;
        },
    };
    return g;
}

function bobGeo() {
    const geo = new THREE.SphereGeometry(1, 48, 30, 0, Math.PI * 2, 0, Math.PI * 0.72), p = geo.attributes.position, S = THREE.MathUtils.smoothstep;
    for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const th = Math.acos(THREE.MathUtils.clamp(y, -1, 1)), ph = Math.atan2(x, z);

        if (y < 0) { const h = Math.hypot(x, z) || 1, to = 1 + 0.06 * y; x *= to / h; z *= to / h; }
        const face = S(z, 0.25, 0.55) * (1 - S(y, 0.3, 0.55));
        const k = (1 - 0.25 * face) * (1 + 0.06 * Math.sin(th * 9 + ph * 1.5) * (1 - face) * S(th, 0.3, 0.8));
        p.setXYZ(i, x * 0.0865 * k, 0.081 + y * 0.122 * k, -0.004 + z * 0.109 * k);
    }
    geo.computeVertexNormals();
    const roll = new THREE.TorusGeometry(1, 0.13, 8, 40, Math.PI * 1.4).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.8);
    const r = roll.attributes.position; for (let i = 0; i < r.count; i++) r.setXYZ(i, r.getX(i) * 0.074, 0.006 + r.getY(i) * 0.074, -0.004 + r.getZ(i) * 0.094);
    roll.computeVertexNormals();
    return mergeAll([geo, roll]);
}

export function windowBlind(M, drop = 2.2, closed = false) {
    const g = new THREE.Group(), top = 3.33, z = -0.11, y0 = top - drop, w = 2.16, pitch = 0.045, tape = M.linen ??= new THREE.MeshStandardMaterial({ color: '#cbbf9f', roughness: 0.9 });
    box(g, w + 0.04, 0.045, 0.06, M.monel, 0, top - 0.045, z);
    const n = Math.floor((drop - 0.07) / pitch), slats = new THREE.InstancedMesh(new THREE.BoxGeometry(w, 0.004, 0.05), M.monel, n), d = new THREE.Object3D();
    for (let i = 0; i < n; i++) { d.position.set(0, top - 0.07 - (i + 0.5) * pitch, z); d.rotation.x = 1.25; d.updateMatrix(); slats.setMatrixAt(i, d.matrix); }
    slats.castShadow = slats.receiveShadow = true; g.add(slats);
    box(g, w, 0.025, 0.045, M.gold, 0, y0, z);
    for (const x of [-0.72, 0, 0.72]) for (const dz of [-0.027, 0.027]) box(g, 0.018, drop - 0.05, 0.002, tape, x, y0 + 0.01, z + dz);
    cyl(g, 0.0018, Math.min(drop, 1.4), tape, w / 2 - 0.08, top - 0.05 - Math.min(drop, 1.4), z + 0.03, 6);
    cyl(g, 0.008, 0.035, M.gold, w / 2 - 0.08, top - 0.085 - Math.min(drop, 1.4), z + 0.03, 10, 0.005);
    if (closed) {
        const sign = new THREE.Group(); sign.position.set(0.55, 1.05, 0.3); sign.rotation.x = -0.18; g.add(sign);
        if (hasEraFont()) add(sign, plaque3d(M, [['CLOSED', 0.05]], { w: 0.42, h: 0.14, letterMat: litGold(M) }), 0, 0.095, 0);
        else box(sign, 0.42, 0.14, 0.02, M.black, 0, 0.02, 0);
        box(sign, 0.3, 0.02, 0.1, M.gold, 0, 0, -0.03);
    }
    return g;
}

export function clockTower(M, faceTex) {
    const g = new THREE.Group();
    const secMat = new THREE.MeshStandardMaterial({ color: '#8a1a14', roughness: 0.4 });
    let y = steps(g, [[3.4, 0.2, 3.4, M.gold], [3.1, 0.7, 3.1, M.black], [2.8, 0.12, 2.8, M.gold], [2.5, 0.45, 2.5, M.verde]]);

    const caseH = 3.8, cw = 1.5;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.14, caseH, 0.14, M.gold, x * cw / 2, y, z * cw / 2);
    for (const yy of [y, y + caseH - 0.14]) box(g, cw + 0.14, 0.14, cw + 0.14, M.gold, 0, yy, 0);
    for (const s of [-1, 1]) { const p = box(g, cw - 0.1, caseH - 0.3, 0.02, M.glass, 0, y + 0.15, s * cw / 2); p.castShadow = false; const q = box(g, 0.02, caseH - 0.3, cw - 0.1, M.glass, s * cw / 2, y + 0.15, 0); q.castShadow = false; }
    box(g, 0.9, caseH - 0.4, 0.04, M.lacquer, 0, y + 0.2, -0.2);
    for (let k = 0; k < 18; k++) { const r = box(g, 0.03, 0.9, 0.02, M.gold, 0, 0, -0.17); r.geometry.translate(0, 0.45, 0); r.position.set(0, y + 1.1, -0.17); r.rotation.z = Math.PI / 2 - k / 17 * Math.PI; }
    const pivot = new THREE.Group(); pivot.position.set(0, y + caseH - 0.35, 0); g.add(pivot);
    box(pivot, 0.035, 2.6, 0.035, M.gold, 0, -2.6, 0);
    const bob = put(pivot, new THREE.CylinderGeometry(0.3, 0.3, 0.07, 48), M.gold, 0, -2.75, 0); bob.rotation.x = Math.PI / 2;
    ring(pivot, 0.3, 0.02, M.goldDull, 0, -2.75, 0.04, false);
    y += caseH;
    y = steps(g, [[2.0, 0.25, 2.0, M.black], [2.3, 0.12, 2.3, M.gold]], M.black, 0, y);

    const drum = 2.1; box(g, drum, drum, drum, M.black, 0, y, 0);
    const hands = [];
    for (let k = 0; k < 4; k++) {
        const face = new THREE.Group(); face.position.set(0, y + drum / 2, 0); face.rotation.y = k * Math.PI / 2; g.add(face);
        const c = clock(M, faceTex, 0.82); c.position.z = drum / 2 + 0.02; face.add(c);
        c.children.filter(o => o.geometry?.type === 'BoxGeometry' && o.material === M.lacquer).forEach(h => c.remove(h));
        const hand = (len, w, mat) => { const h = box(c, w, len, 0.015, mat, 0, 0, 0.07); h.geometry.translate(0, len / 2 - 0.06, 0); h.position.y = 0; return h; };
        hands.push({ hr: hand(0.45, 0.06, M.lacquer), min: hand(0.68, 0.035, M.lacquer), sec: hand(0.72, 0.012, secMat) });
    }
    y += drum;

    for (let k = 0; k < 5; k++) box(g, 2.1 - k * 0.38, 0.28, 2.1 - k * 0.38, k % 2 ? M.black : M.gold, 0, y + k * 0.28, 0);
    y += 1.4;
    cyl(g, 0.05, 1.1, M.gold, 0, y, 0, 12, 0.12); ball(g, 0.17, M.gold, 0, y + 1.2, 0);
    let lastSec = -1, lastHour = -1, lastMin = -1;
    g.userData = {
        height: y + 1.4,
        moving: [pivot, ...hands.flatMap(h => [h.hr, h.min, h.sec])],

        update(now = new Date()) {
            const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
            const swing = now.getMilliseconds() / 1000 + s;
            pivot.rotation.z = Math.sin(Math.PI * swing) * 0.13;
            for (const hd of hands) { hd.sec.rotation.z = -s / 60 * Math.PI * 2; hd.min.rotation.z = -m / 60 * Math.PI * 2; hd.hr.rotation.z = -h / 12 * Math.PI * 2; }
            const tick = s !== lastSec; lastSec = s;
            const hour = now.getHours();
            const strike = lastHour !== -1 && hour !== lastHour ? (hour % 12 || 12) : 0;
            lastHour = hour;
            const min = now.getMinutes(), quarter = lastMin !== -1 && min !== lastMin && min % 15 === 0 && min ? min / 15 : 0;
            lastMin = min;
            return { tick, strike, quarter };
        },
    };
    return g;
}

export function staffDoor(M, plaqueTex) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
        const m = k % 2 ? M.black : M.gold, e = 0.12 * (k + 1);
        box(g, 1.3 + e * 2, 0.12, 0.14 + k * 0.02, m, 0, 2.5 + e - 0.12, 0);
        for (const s of [-1, 1]) box(g, 0.12, 2.5 + e - 0.12, 0.14 + k * 0.02, m, s * (0.65 + e - 0.06), 0, 0);
    }
    box(g, 1.3, 2.5, 0.08, M.monel, 0, 0, -0.02);
    ring(g, 0.16, 0.025, M.gold, 0, 1.65, 0.03, false);
    put(g, new THREE.CircleGeometry(0.15, 32), M.lacquer, 0, 1.65, 0.025).castShadow = false;
    box(g, 0.04, 0.3, 0.06, M.gold, 0.5, 1.0, 0.05);
    if (hasEraFont()) add(g, plaque3d(M, [['EMPLOYEES ONLY', 0.075]], { w: 1.25, h: 0.24, letterMat: litGold(M) }), 0, 3.0, 0.08);
    else if (plaqueTex) put(g, new THREE.PlaneGeometry(1.3, 0.31), new THREE.MeshStandardMaterial({ map: plaqueTex, emissive: '#ffffff', emissiveMap: plaqueTex, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.2 }), 0, 3.0, 0.06).castShadow = false;
    return g;
}

export function officeDoor(M, plateTex) {
    const g = new THREE.Group();
    box(g, 1.3, 2.4, 0.12, M.gold, 0, 0, -0.02);
    box(g, 1.1, 2.3, 0.08, M.lacquer, 0, 0, 0.02);
    const frost = put(g, new THREE.PlaneGeometry(0.8, 0.9), new THREE.MeshStandardMaterial({ color: '#1a120a', emissive: '#ffcf94', emissiveIntensity: 0.9, roughness: 0.9 }), 0, 1.6, 0.065);
    frost.castShadow = false;
    if (hasEraFont()) add(g, plaque3d(M, [['NAME', 0.05]], { w: 0.56, h: 0.12, letterMat: litGold(M) }), 0, 1.05, 0.085);
    else if (plateTex) put(g, new THREE.PlaneGeometry(0.6, 0.14), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.3, metalness: 0.4 }), 0, 1.05, 0.07).castShadow = false;
    ball(g, 0.035, M.gold, 0.42, 1.0, 0.09);
    return g;
}

export function bankersLamp(M) {
    const g = new THREE.Group();
    cyl(g, 0.09, 0.03, M.gold, 0, 0, 0, 24, 0.1);
    cyl(g, 0.012, 0.3, M.gold, 0, 0.03, 0, 10);
    box(g, 0.34, 0.012, 0.012, M.gold, 0, 0.32, 0);
    const shade = put(g, new THREE.CylinderGeometry(0.1, 0.1, 0.36, 24, 1, true, 0, Math.PI), M.lampGreen, 0, 0.36, 0.0);
    shade.rotation.z = Math.PI / 2; shade.castShadow = false;
    for (const s of [-1, 1]) { const e = put(g, new THREE.CircleGeometry(0.1, 16, 0, Math.PI), M.lampGreen, s * 0.18, 0.36, 0); e.rotation.y = s * Math.PI / 2; e.castShadow = false; }
    cyl(g, 0.003, 0.12, M.gold, 0.1, 0.24, 0.06, 6);
    return g;
}

export function typewriter(M) {
    const g = new THREE.Group();
    rbox(g, 0.36, 0.1, 0.3, 0.02, M.bakelite, 0, 0, 0);
    box(g, 0.32, 0.07, 0.12, M.bakelite, 0, 0.09, -0.08).rotation.x = -0.25;
    const platen = cyl(g, 0.025, 0.44, M.bakelite, 0, 0, 0, 16); platen.rotation.z = Math.PI / 2; platen.position.set(0, 0.19, -0.11);
    const sheet = box(g, 0.21, 0.22, 0.003, M.paper, 0, 0.17, -0.13); sheet.rotation.x = -0.28;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) cyl(g, 0.011, 0.012, M.paper, (k - 4.5) * 0.027 + (r % 2) * 0.012, 0.1 + r * 0.012, 0.11 - r * 0.028, 10);
    return g;
}

export function telephone(M) {
    const g = new THREE.Group();
    lathe(g, [[0, 0], [0.058, 0], [0.06, 0.012], [0.045, 0.026], [0.016, 0.042], [0, 0.042]], M.bakelite, 0, 0, 0, 24);
    cyl(g, 0.011, 0.24, M.bakelite, 0, 0.04, 0, 10);
    const tip = new THREE.Vector3(0, Math.sin(0.35), Math.cos(0.35));
    const neck = cyl(g, 0.011, 0.05, M.bakelite, 0, 0, 0, 10); neck.rotation.x = Math.PI / 2 - 0.35; neck.position.set(0, 0.28, 0).addScaledVector(tip, 0.025);
    const horn = put(g, new THREE.CylinderGeometry(0.032, 0.013, 0.035, 18, 1, true), M.bakelite, 0, 0, 0); horn.rotation.x = Math.PI / 2 - 0.35; horn.position.set(0, 0.28, 0).addScaledVector(tip, 0.065);
    horn.material = M.bakeliteBoth ||= Object.assign(M.bakelite.clone(), { side: THREE.DoubleSide });
    box(g, 0.05, 0.008, 0.008, M.monel, 0.034, 0.225, 0);
    for (const dz of [-0.012, 0.012]) box(g, 0.006, 0.02, 0.004, M.monel, 0.058, 0.225, dz);
    receiver(g, M, 0.058, 0.113, 0);
    put(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.058, 0.113], [0.075, 0.07], [0.09, 0.03], [0.06, 0.015], [0.03, 0.02]].map(([x, y], i) => new THREE.Vector3(x, y, -i * 0.012))), 16, 0.004, 6), M.bakelite);
    return g;
}

export function addingMachine(M) {
    const g = new THREE.Group();
    box(g, 0.24, 0.12, 0.28, M.bakelite, 0, 0, 0); box(g, 0.2, 0.04, 0.08, M.monel, 0, 0.12, -0.08);
    for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) box(g, 0.022, 0.012, 0.022, M.paper, (k - 2.5) * 0.03, 0.12 + r * 0.004, 0.09 - r * 0.028);
    const crank = cyl(g, 0.008, 0.14, M.monel, 0.13, 0.08, 0, 8); crank.rotation.z = 0.5;
    return g;
}

export function officeChair(M) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { const f = box(g, 0.5, 0.04, 0.05, M.wood, 0, 0.02, 0); f.rotation.y = k * Math.PI / 4; }
    cyl(g, 0.03, 0.4, M.gold, 0, 0.05, 0, 12);
    rbox(g, 0.46, 0.05, 0.44, 0.02, M.wood, 0, 0.45, 0);
    for (const s of [-1, 1]) box(g, 0.03, 0.34, 0.03, M.wood, s * 0.16, 0.48, -0.2);
    const back = rbox(g, 0.44, 0.2, 0.035, 0.015, M.wood, 0, 0.66, -0.21); back.rotation.x = 0.12;
    return g;
}

export function clerkDesk(M, { typing = false, phone = true, ledger = true } = {}) {
    const g = new THREE.Group();
    box(g, 1.5, 0.05, 0.8, M.wood, 0, 0.72, 0); box(g, 1.34, 0.004, 0.64, M.leather, 0, 0.77, 0);
    for (const s of [-1, 1]) {
        box(g, 0.42, 0.72, 0.74, M.wood, s * 0.52, 0, 0);
        for (let d = 0; d < 3; d++) { box(g, 0.37, 0.2, 0.02, M.wood, s * 0.52, 0.06 + d * 0.22, -0.375); box(g, 0.1, 0.018, 0.025, M.gold, s * 0.52, 0.17 + d * 0.22, -0.395); }
    }
    box(g, 0.64, 0.46, 0.03, M.wood, 0, 0.26, 0.35);
    const papers = (x, z, n, rot) => { for (let i = 0; i < n; i++) { const p = box(g, 0.21, 0.004, 0.297, M.paper, x + (Math.sin(i * 7) * 0.01), 0.774 + i * 0.004, z + Math.cos(i * 5) * 0.01); p.rotation.y = rot + Math.sin(i * 3) * 0.08; } };
    papers(-0.42, -0.19, 9, 0.1);
    if (!typing) papers(0.05, 0.12, 2, -0.25);
    box(g, 0.26, 0.05, 0.33, M.goldDull, -0.5, 0.774, 0.2); papers(-0.5, 0.2, 4, 0);
    const lx = typing ? 0.4 : 0.25;
    if (ledger) { const l = box(g, 0.32, 0.045, 0.42, M.red, lx, 0.774, -0.06); l.rotation.y = 0.2; box(g, 0.3, 0.004, 0.4, M.paper, lx, 0.82, -0.06).rotation.y = 0.2; }
    if (typing) add(g, typewriter(M), 0, 0.774, -0.14).rotation.y = Math.PI;
    if (phone) add(g, telephone(M), 0.6, 0.774, 0.24).rotation.y = Math.PI;
    add(g, bankersLamp(M), 0.42, 0.774, 0.27);
    cyl(g, 0.03, 0.08, M.gold, -0.62, 0.774, -0.25, 10); cyl(g, 0.004, 0.16, M.bakelite, -0.62, 0.8, -0.25, 6).rotation.z = 0.3;
    const chair = officeChair(M); chair.position.set(0, 0, -0.72); chair.rotation.y = 0.15; g.add(chair);
    return g;
}
function add(g, o, x, y, z) { o.position.set(x, y, z); g.add(o); return o; }

export function filingCabinet(M) {
    const g = new THREE.Group();
    box(g, 0.5, 1.34, 0.7, M.wood, 0, 0.02, 0); box(g, 0.52, 0.03, 0.72, M.wood, 0, 1.34, 0);
    for (let d = 0; d < 4; d++) {
        const y = 0.06 + d * 0.32;
        box(g, 0.46, 0.29, 0.02, M.wood, 0, y, 0.355);
        box(g, 0.12, 0.02, 0.03, M.gold, 0, y + 0.12, 0.375); box(g, 0.08, 0.04, 0.005, M.paper, 0, y + 0.19, 0.366);
    }
    return g;
}

export function backCounter(M, len = 4) {
    const g = new THREE.Group();
    box(g, len, 0.9, 0.6, M.wood, 0, 0, 0); box(g, len + 0.04, 0.04, 0.64, M.black, 0, 0.9, 0);
    for (let x = -len / 2 + 0.25; x < len / 2 - 0.2; x += 0.3) box(g, 0.02, 0.5, 0.05, M.wood, x, 0.2, 0.3);
    box(g, len, 0.02, 0.05, M.wood, 0, 0.45, 0.3);
    let k = 0;
    for (let x = -len / 2 + 0.4; x < len / 2 - 0.3; x += 0.55 + (k % 3) * 0.12, k++) {
        const pick = k % 5;
        if (pick === 0) add(g, addingMachine(M), x, 0.94, 0.02);
        else if (pick === 1) { for (let i = 0; i < 3; i++) box(g, 0.24, 0.05, 0.32, i % 2 ? M.red : M.leather, x, 0.94 + i * 0.05, -0.05).rotation.y = i * 0.1; }
        else if (pick === 2) { box(g, 0.3, 0.1, 0.22, M.monel, x, 0.94, 0); box(g, 0.3, 0.012, 0.22, M.gold, x, 1.04, 0); }
        else if (pick === 3) { box(g, 0.22, 0.02, 0.1, M.wood, x, 0.94, 0.05); for (let i = 0; i < 5; i++) cyl(g, 0.012, 0.09, M.bakelite, x - 0.08 + i * 0.04, 0.96, 0.05, 8); }
        else for (let i = 0; i < 6; i++) box(g, 0.21, 0.004, 0.297, M.paper, x + Math.sin(i) * 0.01, 0.94 + i * 0.004, Math.cos(i * 3) * 0.01).rotation.y = Math.sin(i * 2) * 0.1;
    }
    return g;
}

export function depositWall(M, doorsTex, w = 7, h = 3) {
    const g = new THREE.Group();
    box(g, w + 0.4, h + 0.4, 0.3, M.black, 0, 0, -0.15);
    put(g, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: doorsTex, metalness: 0.8, roughness: 0.38, roughnessMap: M.gold.roughnessMap }), 0, h / 2 + 0.2, 0.005);
    box(g, w + 0.5, 0.12, 0.36, M.gold, 0, h + 0.4, -0.12);
    return g;
}

export function wallClock(M, faceTex, r = 0.3) {
    const g = new THREE.Group();
    const back = cyl(g, r * 1.06, 0.06, M.lacquer, 0, 0, 0, 48); back.rotation.x = Math.PI / 2; back.position.set(0, 0, -0.01);
    put(g, new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.5 }), 0, 0, 0.025).castShadow = false;
    ring(g, r, r * 0.06, M.gold, 0, 0, 0.03, false);
    const hand = (len, w, mat) => { const h = box(g, w, len, 0.006, mat, 0, 0, 0.04); h.geometry.translate(0, len / 2 - 0.02, 0); h.position.y = 0; return h; };
    const hr = hand(r * 0.55, r * 0.07, M.lacquer), mn = hand(r * 0.8, r * 0.045, M.lacquer), sc = hand(r * 0.85, r * 0.015, new THREE.MeshStandardMaterial({ color: '#8a1a14' }));
    ball(g, r * 0.05, M.gold, 0, 0, 0.05);
    g.userData = {
        moving: [hr, mn, sc],
        update(now = new Date()) {
            const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = now.getHours() % 12 + m / 60;
            sc.rotation.z = -s / 60 * Math.PI * 2; mn.rotation.z = -m / 60 * Math.PI * 2; hr.rotation.z = -h / 12 * Math.PI * 2;
        },
    };
    return g;
}

export function coatStand(M) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) { const f = box(g, 0.45, 0.03, 0.04, M.wood, 0, 0.02, 0); f.rotation.y = k * Math.PI / 3; }
    cyl(g, 0.022, 1.8, M.wood, 0, 0.03, 0, 12); ball(g, 0.04, M.gold, 0, 1.85, 0);
    for (let k = 0; k < 4; k++) { const hk = box(g, 0.012, 0.012, 0.16, M.gold, 0, 1.72, 0); hk.geometry.translate(0, 0, 0.08); hk.rotation.set(-0.5, k * Math.PI / 2, 0); }
    const coat = put(g, new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.19, 0.4], [0.16, 0.8], [0.14, 0.95], [0.05, 1.0], [0, 1.0]].map(([r, h]) => new THREE.Vector2(r, h)), 24), M.suit, 0.12, 0.72, 0);
    coat.scale.set(1, 1, 0.45); coat.rotation.z = -0.05;
    const hat = put(g, new THREE.LatheGeometry([[0, 0], [0.11, 0], [0.18, 0.008], [0.19, 0.02], [0.11, 0.012], [0.1, 0.1], [0.05, 0.11], [0, 0.1]].map(([r, h]) => new THREE.Vector2(r, h)), 32), M.suit, -0.1, 1.72, -0.06);
    hat.rotation.set(0.3, 0, 0.5);
    return g;
}

export function clerkFigure(seed = 0, typing = false) {
    const g = new THREE.Group(), ink = rimInk(), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const limb = (r0, r1, a, b, parent = g) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), 14), ink); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); parent.add(m); return m; };
    const blob = (sx, sy, sz, p, parent = g) => { const s = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), ink); s.scale.set(sx, sy, sz); s.position.copy(p); parent.add(s); return s; };
    for (const x of [-0.1, 0.1]) { limb(0.08, 0.065, V(x, 0.52, -0.05), V(x, 0.52, 0.38)); limb(0.06, 0.05, V(x, 0.52, 0.38), V(x, 0.05, 0.42)); blob(0.05, 0.035, 0.12, V(x, 0.03, 0.48)); }
    blob(0.19, 0.11, 0.14, V(0, 0.55, -0.02));
    limb(0.18, 0.2, V(0, 0.55, -0.04), V(0, 1.0, 0.1)); blob(0.23, 0.07, 0.12, V(0, 1.04, 0.12));
    limb(0.05, 0.05, V(0, 1.06, 0.14), V(0, 1.14, 0.2));
    const head = new THREE.Group(); head.position.set(0, 1.16, 0.22); head.rotation.x = typing ? 0.3 : 0.55; g.add(head);
    blob(0.085, 0.105, 0.1, V(0, 0.09, 0), head); blob(0.07, 0.065, 0.08, V(0, 0.035, 0.03), head);
    if (typing) {
        const hands = [-1, 1].map(s => {
            limb(0.05, 0.045, V(s * 0.21, 1.02, 0.12), V(s * 0.2, 0.86, 0.3));
            const fore = new THREE.Group(); fore.position.set(s * 0.2, 0.86, 0.3); g.add(fore);
            limb(0.045, 0.038, V(0, 0, 0), V(-s * 0.1, 0.03, 0.2), fore); blob(0.045, 0.025, 0.06, V(-s * 0.1, 0.02, 0.24), fore);
            return fore;
        });
        g.userData = {
            head, update(t) {
                const k = t + seed * 7.3, line = k % 7;
                const typingNow = line < 5.5, ret = line > 6.3 ? Math.sin((line - 6.3) / 0.7 * Math.PI) : 0;
                hands.forEach((f, i) => {
                    f.rotation.x = typingNow ? -Math.abs(Math.sin(k * 11 + i * 1.7)) * 0.07 - Math.abs(Math.sin(k * 7.3 + i)) * 0.03 : 0.04;
                    f.rotation.y = typingNow ? Math.sin(k * 2.3 + i * 2) * 0.06 : 0;
                });
                hands[0].rotation.z = ret * -0.5; hands[0].rotation.x += ret * -0.25;
                head.rotation.y = typingNow ? Math.sin(k * 0.9) * 0.04 : -0.1 + (line - 5.5) * 0.12;
            },
        };
        return g;
    }
    limb(0.05, 0.045, V(-0.21, 1.02, 0.12), V(-0.22, 0.83, 0.38)); limb(0.045, 0.04, V(-0.22, 0.83, 0.38), V(-0.08, 0.8, 0.58));
    const arm = new THREE.Group(); arm.position.set(0.21, 1.02, 0.12); g.add(arm);
    limb(0.05, 0.045, V(0, 0, 0), V(0.02, -0.2, 0.26), arm); limb(0.045, 0.038, V(0.02, -0.2, 0.26), V(-0.06, -0.23, 0.48), arm);
    blob(0.04, 0.03, 0.05, V(-0.07, -0.23, 0.5), arm);
    g.userData = {
        head, update(t) {
            const k = t * 1.7 + seed * 3;
            arm.rotation.y = Math.sin(k * 3.1) * 0.05 + Math.sin(k * 0.37) * 0.12;
            arm.rotation.x = Math.max(0, Math.sin(k * 0.21)) ** 8 * -0.25;
            head.rotation.y = Math.sin(k * 0.13) * 0.08;
        },
    };
    return g;
}

export function guardianPanel(M, tex, w = 3.6, h = 12.6) {
    const g = new THREE.Group();
    put(g, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex.color, normalMap: tex.normal, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.85, emissive: '#ffffff', emissiveMap: tex.glow, emissiveIntensity: 1.5 }), 0, h / 2, 0.06).castShadow = false;
    for (let k = 0; k < 2; k++) {
        const e = 0.14 + k * 0.16, d = 0.12 + k * 0.1, m = k ? M.cream : M.goldDull;
        box(g, w + e * 2, e, d, m, 0, -e, 0); box(g, w + e * 2, e, d, m, 0, h, 0);
        for (const s of [-1, 1]) box(g, e, h + e * 2, d, m, s * (w / 2 + e / 2), -e, 0);
    }
    box(g, w + 1.0, 0.5, 0.7, M.cream, 0, -0.9, 0.1); box(g, w + 0.8, 0.12, 0.8, M.goldDull, 0, -0.4, 0.1);
    box(g, w + 0.4, 0.05, 0.08, M.glow, 0, -0.28, 0.25);
    return g;
}

export function crumple(M, r = 0.05) {
    const geo = new THREE.IcosahedronGeometry(r, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.7 + T.rnd() * 0.55; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.9, p.getZ(i) * k); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.paper); m.castShadow = m.receiveShadow = true; return m;
}

export function droppedSheet(M, w = 0.15, d = 0.1) {
    const geo = new THREE.PlaneGeometry(w, d, 4, 1).rotateX(-Math.PI / 2), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, 0.003 + (p.getX(i) / w) ** 2 * 0.03 * T.rnd());
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.paper); m.receiveShadow = true; return m;
}

export function cigarette(M, { len = 0.03 + T.rnd() * 0.03, crushed = T.rnd() < 0.55, cork = T.rnd() < 0.2 } = {}) {
    const g = new THREE.Group(), r = 0.0039, seg =(x0, x1, mat, rr = r) => { const c = put(g, new THREE.CylinderGeometry(rr, rr, x1 - x0, 10), mat, (x0 + x1) / 2, r, 0); c.rotation.z = Math.PI / 2; return c; };
    if (!crushed) {
        seg(0, len - 0.004, M.butt); seg(len - 0.004, len - 0.0015, M.char, r * 0.95); seg(len - 0.0015, len, M.ash, r * 0.8);
        if (cork) seg(-0.0005, 0.012, M.cork, r * 1.02);
    } else {
        const k = len * (0.45 + T.rnd() * 0.2), bend = 0.5 + T.rnd() * 0.6;
        seg(0, k, M.butt); if (cork) seg(-0.0005, 0.012, M.cork, r * 1.02);
        const b = new THREE.Group(); b.position.set(k, 0, 0); b.rotation.y = bend; g.add(b);
        const c1 = put(b, new THREE.CylinderGeometry(r, r * 0.9, len - k, 10), M.butt, (len - k) / 2, r, 0); c1.rotation.z = Math.PI / 2;
        const c2 = put(b, new THREE.CylinderGeometry(r * 0.9, r * 0.8, 0.003, 10), M.char, len - k + 0.0015, r, 0); c2.rotation.z = Math.PI / 2;
        g.scale.set(1, 0.65, 1);
    }
    return g;
}

export function match(M) {
    const g = new THREE.Group(), s = put(g, new THREE.BoxGeometry(0.045, 0.0022, 0.0022), M.butt, 0, 0.0011, 0);
    s.material = M.matchWood ||= new THREE.MeshStandardMaterial({ color: '#d8c49a', roughness: 0.9 });
    const h = ball(g, 0.0028, M.char, 0.024, 0.0022, 0); h.scale.set(1.3, 0.8, 0.9);
    return g;
}

export function ashStand(M) {
    const g = new THREE.Group();
    cyl(g, 0.21, 0.03, M.black, 0, 0, 0, 48, 0.225); cyl(g, 0.17, 0.015, M.gold, 0, 0.03, 0, 48); cyl(g, 0.15, 0.03, M.black, 0, 0.045, 0, 48, 0.16);
    cyl(g, 0.07, 0.02, M.gold, 0, 0.075, 0, 32, 0.09);
    const col = lathe(g, [[0, 0], [0.034, 0], [0.028, 0.03], [0.026, 0.5], [0.03, 0.52], [0, 0.52]], M.monel, 0, 0.095, 0, 48);
    const cp = col.geometry.attributes.position;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), z = cp.getZ(i), y = cp.getY(i); if (y < 0.035 || y > 0.495) continue; const th = Math.atan2(z, x), k = 1 - 0.12 * Math.abs(Math.cos(th * 6)); cp.setXYZ(i, x * k, y, z * k); }
    col.geometry.computeVertexNormals();
    ring(g, 0.03, 0.009, M.gold, 0, 0.33);
    steps(g, [[0.09, 0.012, 0.09, M.gold], [0.07, 0.012, 0.07, M.monel]], null, 0, 0.6);
    lathe(g, [[0.03, 0], [0.12, 0.02], [0.17, 0.045], [0.195, 0.07], [0.205, 0.08], [0.215, 0.085], [0.215, 0.092], [0.2, 0.094], [0.19, 0.084], [0.17, 0.066], [0, 0.066]], M.monel, 0, 0.62, 0, 64);
    ring(g, 0.208, 0.006, M.gold, 0, 0.705);

    const heap = new THREE.LatheGeometry([[0.182, 0], [0.15, 0.012], [0.1, 0.022], [0.05, 0.028], [0, 0.03]].map(([x, y]) => new THREE.Vector2(x, y)), 48), hp = heap.attributes.position;
    const huv = heap.attributes.uv;
    for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), z = hp.getZ(i), rr = Math.hypot(x, z); hp.setY(i, hp.getY(i) + (rr < 0.175 ? (Math.sin(x * 97 + z * 41) * Math.cos(z * 83 - x * 29)) * 0.002 : 0)); huv.setXY(i, x * 2.5 + 0.5, z * 2.5 + 0.5); }
    heap.computeVertexNormals(); put(g, heap, M.ash, 0, 0.684, 0);
    const heapY = d => 0.684 + 0.03 * (1 - Math.min(1, d / 0.182) ** 1.8);
    for (let i = 0; i < 9; i++) {
        const a = T.rnd() * 6.283, d = 0.03 + Math.sqrt(T.rnd()) * 0.12, c = cigarette(M), pushed = i % 3 === 0;
        c.position.set(Math.cos(a) * d, heapY(d) - (pushed ? 0.006 : 0.002), Math.sin(a) * d);
        c.rotation.set(0, T.rnd() * 6.283, pushed ? 0.55 + T.rnd() * 0.3 : (T.rnd() - 0.5) * 0.2); g.add(c);
    }
    const m = match(M); m.position.set(0.06, heapY(0.092) - 0.001, -0.07); m.rotation.y = 1.1; g.add(m);
    return g;
}

export function wastebasket(M, over = 2) {
    const g = new THREE.Group();

    const body = lathe(g, [[0, 0.02], [0.14, 0.02], [0.145, 0.035], [0.14, 0.045], [0.17, 0.35], [0.176, 0.365], [0.168, 0.372], [0.162, 0.36], [0.132, 0.05], [0.0, 0.05]], M.brassOpen, 0, 0, 0, 64);
    const bp = body.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), y = bp.getY(i), rr = Math.hypot(x, z); if (y < 0.06 || y > 0.34 || rr < 0.135 + (y - 0.05) * 0.1) continue; const th = Math.atan2(z, x), k = 1 - 0.035 * Math.abs(Math.cos(th * 10)); bp.setXYZ(i, x * k, y, z * k); }
    body.geometry.computeVertexNormals();
    cyl(g, 0.15, 0.02, M.goldDull, 0, 0, 0, 32); ring(g, 0.172, 0.008, M.gold, 0, 0.365);
    for (let i = 0; i < 4 + over; i++) { const c = crumple(M, 0.05 + T.rnd() * 0.02), up = i >= 4; c.position.set((T.rnd() - 0.5) * (up ? 0.2 : 0.14), up ? 0.36 + T.rnd() * 0.04 : 0.2 + i * 0.03, (T.rnd() - 0.5) * (up ? 0.2 : 0.14)); g.add(c); }
    return g;
}

const sheet = (w, d, sx, sz, bend) => {
    const geo = new THREE.PlaneGeometry(w, d, sx, sz).rotateX(-Math.PI / 2), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, bend(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals(); return geo;
};
export function newspaper(M, open = false) {
    const g = new THREE.Group();
    M.newsBoth ||= Object.assign(M.news.clone(), { side: THREE.DoubleSide });
    if (!open) {
        for (let i = 0; i < 4; i++) {
            const geo = sheet(0.3, 0.42, 8, 10, (x, z) => 0.0014 * i + (i === 3 ? 0.0025 * (1 - (2 * x / 0.3) ** 2) * (1 - (2 * z / 0.42) ** 2) : 0));
            const m = put(g, geo, i === 3 ? M.news : M.paper, 0.0025 * (3 - i), 0.001, 0);
            if (i === 3) { const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 0.5 + uv.getY(k) * 0.5); }
            m.castShadow = i === 3;
        }
        const fold = put(g, new THREE.CylinderGeometry(0.0028, 0.0028, 0.42, 8, 1, true, Math.PI, Math.PI), M.newsBoth, -0.15, 0.0035, 0);
        fold.rotation.x = Math.PI / 2;
        return g;
    }
    for (const s of [-1, 1]) {
        const geo = sheet(0.38, 0.58, 16, 14, (x, z) => { const u = (x * s + 0.19) / 0.38;
            return 0.004 + 0.012 * Math.exp(-u * 14) + 0.03 * Math.max(0, u - 0.8) ** 2 * 6 + 0.0025 * Math.sin(x * 37 + z * 21) * Math.cos(z * 29 - x * 13) + 0.006 * Math.max(0, Math.abs(z) / 0.29 - 0.85) * 4 * (u > 0.5 ? 1 : 0); });
        put(g, geo, M.newsBoth, s * 0.19, 0, 0);
    }
    return g;
}

export function infoDesk(M, signTex) {
    const g = new THREE.Group();
    put(g, new THREE.CylinderGeometry(1.3, 1.3, 1.02, 48, 1, false, -Math.PI / 2, Math.PI), M.black, 0, 0.51, 0);
    box(g, 2.6, 1.02, 0.05, M.wood, 0, 0, -0.025);
    put(g, new THREE.CylinderGeometry(1.4, 1.4, 0.06, 48, 1, false, -Math.PI / 2, Math.PI), M.verde, 0, 1.05, 0);
    for (const y of [0.12, 0.9]) { const b = put(g, new THREE.TorusGeometry(1.31, 0.025, 8, 48, Math.PI), M.gold, 0, y, 0); b.rotation.x = Math.PI / 2; }
    for (let k = 0; k < 29; k++) { const a = -Math.PI / 2 + (k + 0.5) / 29 * Math.PI; cyl(g, 0.012, 0.7, M.gold, Math.sin(a) * 1.31, 0.16, Math.cos(a) * 1.31, 8); }
    cyl(g, 0.05, 0.02, M.gold, 0.4, 1.08, 0.7, 20); put(g, new THREE.SphereGeometry(0.045, 20, 10, 0, 6.29, 0, Math.PI / 2), M.gold, 0.4, 1.1, 0.7);
    add(g, bankersLamp(M), -0.7, 1.08, 0.4);
    box(g, 0.34, 0.26, 0.12, M.wood, 0.9, 1.08, 0.5);
    for (let i = 0; i < 3; i++) { const p = box(g, 0.09, 0.2, 0.01, [M.paper, M.red, M.leather][i], 0.8 + i * 0.1, 1.2, 0.56); p.rotation.x = -0.25; }
    if (signTex) {
        const sign = put(g, new THREE.PlaneGeometry(0.7, 0.22), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4, metalness: 0.3 }), 0, 1.22, 0.62); sign.rotation.x = -0.3; sign.castShadow = false;
        box(g, 0.74, 0.24, 0.02, M.gold, 0, 1.08, 0.6).rotation.x = -0.3;
    }
    for (let i = 0; i < 5; i++) box(g, 0.21, 0.003, 0.28, M.paper, -0.2 + Math.sin(i) * 0.02, 1.081 + i * 0.003, 0.25).rotation.y = i * 0.07;
    const stool = new THREE.Group(); stool.position.set(0.2, 0, -0.6); g.add(stool);
    cyl(stool, 0.2, 0.02, M.gold, 0, 0, 0, 20); cyl(stool, 0.025, 0.66, M.gold, 0, 0.02, 0, 10); cyl(stool, 0.19, 0.06, M.club, 0, 0.68, 0, 24);
    return g;
}

export function noticeStand(M, boardTex) {
    const g = new THREE.Group();
    const y = steps(g, [[0.5, 0.06, 0.34, M.black], [0.42, 0.05, 0.28, M.gold], [0.3, 0.05, 0.2, M.black]]);
    cyl(g, 0.03, 0.9, M.goldDull, 0, y, 0, 16); ring(g, 0.045, 0.012, M.gold, 0, y + 0.45);
    const board = new THREE.Group(); board.position.set(0, y + 0.88, 0); board.rotation.x = -0.1; g.add(board);
    box(board, 0.7, 0.9, 0.04, M.lacquer, 0, 0, -0.02);
    for (const s of [-1, 1]) box(board, 0.04, 0.9, 0.06, M.goldDull, s * 0.35, 0, 0);
    for (const yy of [0, 0.88]) box(board, 0.74, 0.04, 0.06, M.goldDull, 0, yy - 0.01, 0);
    put(board, new THREE.PlaneGeometry(0.62, 0.8), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.95 }), 0, 0.45, 0.005).castShadow = false;
    steps(board, [[0.46, 0.05, 0.05, M.gold], [0.3, 0.05, 0.05, M.goldDull], [0.14, 0.05, 0.05, M.gold]], null, 0, 0.91, 0);

    if (hasEraFont()) {
        const lines = [['NOTICE', 0.068, 0.74], ['ACCEPTING', 0.046, 0.56], ['NEW ACCOUNTS', 0.046, 0.47]];
        lines.forEach(([text, size, y], li) => {
            const L = letters3d(text, M.gold, { size, depth: 0.005, spacing: 0.14, jitter: 1 });
            if (L.width > 0.5) L.group.scale.setScalar(0.5 / L.width);
            L.group.position.set(0, y, 0.008); board.add(L.group);
            if (li === 2) {
                const s = L.pieces[L.pieces.length - 1].m, pin = new THREE.Vector3(s.position.x, s.position.y + size * 0.66, 0);
                s.position.sub(pin).applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.28).add(pin); s.position.y -= 0.005; s.rotation.z = -0.28;
            }
        });
    }
    return g;
}

export function clubChair(M) {
    const g = new THREE.Group();
    rbox(g, 0.86, 0.3, 0.84, 0.06, M.club, 0, 0.08, 0);
    rbox(g, 0.66, 0.14, 0.7, 0.06, M.club, 0, 0.38, 0.06);
    for (const s of [-1, 1]) rbox(g, 0.18, 0.34, 0.82, 0.07, M.club, s * 0.34, 0.36, 0);
    const back = rbox(g, 0.82, 0.5, 0.2, 0.08, M.club, 0, 0.38, -0.33); back.rotation.x = -0.12;
    for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) cyl(g, 0.025, 0.08, M.wood, x, 0, z, 10);
    return g;
}

export function lowTable(M) {
    const g = new THREE.Group();
    rbox(g, 1.0, 0.05, 0.6, 0.02, M.wood, 0, 0.42, 0);
    for (const x of [-0.42, 0.42]) for (const z of [-0.24, 0.24]) box(g, 0.05, 0.42, 0.05, M.wood, x, 0, z);
    box(g, 0.9, 0.02, 0.5, M.wood, 0, 0.12, 0);
    add(g, newspaper(M), -0.2, 0.47, 0.02).rotation.y = 0.3;
    add(g, newspaper(M), -0.15, 0.49, 0.05).rotation.y = -0.2;
    for (let i = 0; i < 3; i++) box(g, 0.22, 0.008, 0.3, [M.red, M.leather, M.paper][i], 0.2 + i * 0.03, 0.14 + i * 0.008, (i - 1) * 0.04).rotation.y = i * 0.2;
    cyl(g, 0.07, 0.025, M.pane, 0.3, 0.47, -0.1, 24);
    for (let i = 0; i < 3; i++) add(g, cigarette(M), 0.28 + i * 0.015, 0.472, -0.12 + i * 0.02).rotation.y = i * 2.1;
    return g;
}

const receiver = (g, M, x, y, z) => lathe(g, [[0, 0], [0.015, 0], [0.012, 0.015], [0.013, 0.08], [0.02, 0.097], [0.029, 0.113], [0.028, 0.125], [0, 0.125]], M.bakelite, x, y, z, 18);

export function phoneBooth(M, signTex = null, { door = 0.3, dangle = false, lit = true, coins = 0 } = {}) {
    const g = new THREE.Group(), W = 0.95, D = 0.95, H = 2.3, bz = -D / 2 + 0.05;
    box(g, W + 0.03, 0.1, D + 0.03, M.black, 0, 0, 0);
    box(g, W, H, 0.05, M.wood, 0, 0, -D / 2 + 0.025);
    for (const s of [-1, 1]) box(g, 0.05, H, D, M.wood, s * (W / 2 - 0.025), 0, 0);
    box(g, W + 0.06, 0.12, D + 0.06, M.wood, 0, H, 0); box(g, W + 0.1, 0.05, D + 0.1, M.gold, 0, H + 0.12, 0);
    if (signTex) put(g, new THREE.PlaneGeometry(0.6, 0.14), new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.4, roughness: 0.5 }), 0, H + 0.06, D / 2 + 0.035).castShadow = false;
    box(g, 0.5, 0.02, 0.5, lit ? M.dimGlow : M.bakelite, 0, H - 0.03, 0);
    for (const s of [-1, 1]) {
        const leaf = new THREE.Group(); leaf.position.set(s * (W / 2 - 0.05), 0.1, D / 2 - 0.02); leaf.rotation.y = s * -(0.03 + door * 1.45); g.add(leaf);

        for (const x of [0.03, 0.39]) box(leaf, 0.06, 2.1, 0.035, M.wood, -s * x, 0, 0);
        box(leaf, 0.3, 0.72, 0.035, M.wood, -s * 0.21, 0, 0); box(leaf, 0.3, 0.22, 0.035, M.wood, -s * 0.21, 1.88, 0);
        box(leaf, 0.3, 0.03, 0.04, M.wood, -s * 0.21, 1.3, 0);
        const p = box(leaf, 0.3, 1.16, 0.006, M.pane, -s * 0.21, 0.72, 0); p.castShadow = false;
        cyl(leaf, 0.012, 0.16, M.gold, -s * 0.38, 0.95, 0.03, 8);
    }

    const nickel = M.monel, px = 0.06;
    box(g, 0.28, 0.66, 0.025, M.wood, px, 0.86, bz + 0.012);
    rbox(g, 0.2, 0.34, 0.14, 0.018, M.bakelite, px, 1.14, bz + 0.095);
    rbox(g, 0.18, 0.2, 0.13, 0.012, M.bakelite, px, 0.93, bz + 0.09);
    cyl(g, 0.012, 0.006, nickel, px, 1.03, bz + 0.157, 12).rotation.x = Math.PI / 2;
    box(g, 0.19, 0.016, 0.1, nickel, px, 1.48, bz + 0.09);
    for (const [x, w] of [[-0.055, 0.022], [0, 0.019], [0.057, 0.026]]) box(g, w, 0.004, 0.0035, M.bakelite, px + x, 1.495, bz + 0.1);
    const mount = cyl(g, 0.02, 0.04, nickel, 0, 0, 0, 16); mount.rotation.x = Math.PI / 2; mount.position.set(px, 1.36, bz + 0.185);
    const horn = put(g, new THREE.CylinderGeometry(0.036, 0.014, 0.05, 18, 1, true), M.bakeliteBoth ||= Object.assign(M.bakelite.clone(), { side: THREE.DoubleSide }), px, 1.36, bz + 0.225); horn.rotation.x = Math.PI / 2;
    const dial = cyl(g, 0.042, 0.008, nickel, 0, 0, 0, 32); dial.rotation.x = Math.PI / 2; dial.position.set(px, 1.21, bz + 0.169);
    for (let k = 0; k < 10; k++) { const a = -0.5 + k * 0.52; const h = cyl(g, 0.0065, 0.004, M.bakelite, 0, 0, 0, 10); h.rotation.x = Math.PI / 2; h.position.set(px + Math.cos(a) * 0.029, 1.21 + Math.sin(a) * 0.029, bz + 0.175); }
    box(g, 0.006, 0.014, 0.01, nickel, px + 0.036, 1.185, bz + 0.178);
    box(g, 0.05, 0.012, 0.012, nickel, px - 0.125, 1.25, bz + 0.1);
    if (!dangle) receiver(g, M, px - 0.145, 1.14, bz + 0.1);
    else {
        const pivot = new THREE.Group(); pivot.position.set(px - 0.11, 1.08, bz + 0.12); g.add(pivot);
        put(pivot, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0, 0], [0.02, -0.18, 0.03], [0.0, -0.4, 0.02], [0.01, -0.56, 0.0]].map(p => new THREE.Vector3(...p))), 20, 0.005, 6), M.bakelite);
        receiver(pivot, M, 0.01, -0.56, 0).rotation.x = Math.PI;
        g.userData.dangle = pivot;
    }
    box(g, 0.34, 0.025, 0.24, M.wood, -0.22, 0.92, bz + 0.12);
    box(g, 0.22, 0.06, 0.29, M.red, -0.23, 0.945, bz + 0.13).rotation.y = 0.08;

    [[-0.08, 0.947, bz + 0.2, 0.0106], [0.05, 0.552, -D / 2 + 0.28, 0.009]].slice(0, coins).forEach(([x, y, z, r]) => cyl(g, r, 0.0018, M.monel, x, y, z, 24));
    box(g, 0.45, 0.05, 0.3, M.wood, 0, 0.5, -D / 2 + 0.2);
    return g;
}

export function drinkingFountain(M) {
    const g = new THREE.Group();
    box(g, 0.7, 1.2, 0.04, M.black, 0, 0.55, 0.02); box(g, 0.74, 0.04, 0.06, M.gold, 0, 1.75, 0.03);
    lathe(g, [[0, 0], [0.12, 0.02], [0.24, 0.12], [0.25, 0.16], [0.21, 0.15], [0, 0.1]], M.verde, 0, 0.72, 0.26).scale.set(1, 1, 0.8);
    box(g, 0.08, 0.4, 0.2, M.goldDull, 0, 0.35, 0.12);
    cyl(g, 0.018, 0.08, M.gold, 0, 0.84, 0.24, 12); cyl(g, 0.02, 0.03, M.gold, 0.16, 0.84, 0.36, 12);
    return g;
}

export function mailChute(M) {
    const g = new THREE.Group(), top = 1.05;
    box(g, 0.26, top, 0.02, M.goldDull, 0, 0, 0.01);
    for (const s of [-1, 1]) box(g, 0.035, top, 0.12, M.goldDull, s * 0.112, 0, 0.06);
    box(g, 0.19, top, 0.005, M.lacquer, 0, 0, 0.021);
    const p = box(g, 0.19, top - 0.14, 0.006, M.pane, 0, 0.07, 0.11); p.castShadow = false;
    for (const y of [0.0, 0.5]) box(g, 0.3, 0.05, 0.14, M.gold, 0, y, 0.065);
    steps(g, [[0.42, 0.012, 0.22, M.goldDull], [0.36, 0.01, 0.18, M.gold]], null, 0, 0, 0.08);
    for (const [y, a] of [[0.3, 0.4], [0.72, -0.3]]) { const l = box(g, 0.14, 0.09, 0.003, M.paper, 0, y, 0.06); l.rotation.set(0.1, 0, a); }

    steps(g, [[0.3, 0.04, 0.16, M.gold], [0.38, 0.03, 0.2, M.goldDull], [0.46, 0.025, 0.24, M.gold]], null, 0, top, 0.1);
    rbox(g, 0.44, 0.46, 0.22, 0.02, M.gold, 0, top + 0.095, 0.11);
    steps(g, [[0.46, 0.03, 0.24, M.goldDull], [0.38, 0.04, 0.2, M.gold], [0.28, 0.04, 0.15, M.goldDull]], null, 0, top + 0.555, 0.1);
    const flap = box(g, 0.3, 0.07, 0.02, M.goldDull, 0, top + 0.23, 0.225); flap.rotation.x = -0.12;
    box(g, 0.24, 0.012, 0.01, M.bakelite, 0, top + 0.22, 0.222);
    const burst = new THREE.Group(); burst.position.set(0, top + 0.12, 0.222); g.add(burst);
    for (let k = 0; k <= 12; k++) { const r = box(burst, 0.01, 0.085, 0.008, M.goldDull, 0, 0, 0); r.geometry.translate(0, 0.0425, 0); r.position.y = 0; r.rotation.z = -Math.PI * 0.45 + k / 12 * Math.PI * 0.9; }
    put(burst, new THREE.CircleGeometry(0.028, 24, 0, Math.PI), M.goldDull, 0, 0, 0.005);
    cyl(g, 0.012, 0.008, M.bakelite, 0.16, top + 0.4, 0.222, 12).rotation.x = Math.PI / 2;
    return g;
}

export function spittoon(M) {
    const g = new THREE.Group();
    lathe(g, [[0, 0], [0.14, 0], [0.17, 0.06], [0.16, 0.12], [0.07, 0.16], [0.12, 0.2], [0.1, 0.2], [0.05, 0.17], [0, 0.17]], M.gold, 0, 0, 0);
    return g;
}

export function radiator(M, len = 1.1) {
    const g = new THREE.Group();
    for (let x = -len / 2 + 0.03; x < len / 2; x += 0.065) rbox(g, 0.05, 0.72, 0.2, 0.02, M.iron, x, 0.1, 0);
    box(g, len, 0.05, 0.08, M.iron, 0, 0.08, 0); box(g, len, 0.05, 0.08, M.iron, 0, 0.78, 0);
    for (const s of [-1, 1]) cyl(g, 0.02, 0.1, M.iron, s * (len / 2 - 0.05), 0, 0, 8);
    cyl(g, 0.03, 0.14, M.gold, len / 2 + 0.05, 0.62, 0, 12);
    return g;
}

export function janitorCart(M) {
    const g = new THREE.Group();
    put(g, new THREE.CylinderGeometry(0.2, 0.17, 0.34, 24, 1, true), M.galv, 0, 0.21, 0); cyl(g, 0.17, 0.01, M.galv, 0, 0.04, 0, 24);
    cyl(g, 0.19, 0.005, new THREE.MeshStandardMaterial({ color: '#3a3528', roughness: 0.1 }), 0, 0.3, 0, 24);
    ring(g, 0.2, 0.012, M.galv, 0, 0.38); for (const x of [-0.14, 0.14]) for (const z of [-0.14, 0.14]) ball(g, 0.025, M.bakelite, x, 0.02, z);
    box(g, 0.2, 0.14, 0.14, M.galv, 0.12, 0.38, 0);
    const mop = new THREE.Group(); mop.position.set(-0.04, 0.3, 0.02); mop.rotation.set(0.12, 0, 0.22); g.add(mop);
    cyl(mop, 0.014, 1.3, M.wood, 0, 0, 0, 8); cyl(mop, 0.09, 0.22, new THREE.MeshStandardMaterial({ color: '#9a9280', roughness: 1 }), 0, -0.12, 0, 12, 0.13);
    const broom = new THREE.Group(); broom.position.set(0.45, 0, -0.1); broom.rotation.z = -0.28; g.add(broom);
    cyl(broom, 0.014, 1.45, M.wood, 0, 0.06, 0, 8); box(broom, 0.45, 0.07, 0.07, M.wood, 0, 0.05, 0); box(broom, 0.43, 0.06, 0.05, M.bakelite, 0, 0, 0);
    return g;
}

export function fireCabinet(M) {
    const g = new THREE.Group();
    box(g, 0.8, 1.0, 0.25, M.redPaint, 0, 1.0, 0.125); box(g, 0.66, 0.86, 0.01, M.bakelite, 0, 1.07, 0.24);
    for (let k = 0; k < 5; k++) ring(g, 0.25 - k * 0.03, 0.025, new THREE.MeshStandardMaterial({ color: '#b8ab8a', roughness: 1 }), 0, 1.5, 0.14, false);
    const p = box(g, 0.68, 0.88, 0.01, M.pane, 0, 1.06, 0.255); p.castShadow = false;
    cyl(g, 0.07, 0.5, M.gold, 0.62, 0.35, 0.12, 20); ball(g, 0.07, M.gold, 0.62, 0.85, 0.12); cyl(g, 0.02, 0.1, M.bakelite, 0.62, 0.9, 0.12, 8);
    box(g, 0.18, 0.04, 0.12, M.iron, 0.62, 0.62, 0.06);
    return g;
}

export function umbrellaStand(M) {
    const g = new THREE.Group();
    const body = lathe(g, [[0, 0], [0.155, 0], [0.16, 0.015], [0.15, 0.025], [0.14, 0.04], [0.135, 0.06], [0.135, 0.5], [0.142, 0.52], [0.146, 0.54], [0.142, 0.555], [0.132, 0.55], [0.128, 0.53], [0.128, 0.06], [0.0, 0.06]], M.brassOpen, 0, 0, 0, 72);
    const bp = body.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), y = bp.getY(i), rr = Math.hypot(x, z); if (y < 0.07 || y > 0.49 || rr < 0.133) continue; const th = Math.atan2(z, x), k = 1 - 0.03 * Math.abs(Math.cos(th * 12)); bp.setXYZ(i, x * k, y, z * k); }
    body.geometry.computeVertexNormals();
    for (const h of [0.08, 0.48]) ring(g, 0.137, 0.006, M.gold, 0, h);
    const prof = [[0, 0], [0.004, 0], [0.005, 0.05], [0.012, 0.07], [0.028, 0.35], [0.034, 0.5], [0.03, 0.6], [0.014, 0.68], [0.0, 0.7]];
    for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + 0.3, t = 0.11, u = new THREE.Group();
        u.rotation.set(Math.sin(a) * t, 0, -Math.cos(a) * t); u.rotateY(i * 1.7); g.add(u);
        lathe(u, prof, i === 1 ? M.olive : M.bakelite, 0, 0, 0, 14);
        cyl(u, 0.004, 0.06, M.monel, 0, -0.005, 0, 6);
        cyl(u, 0.015, 0.012, i === 1 ? M.olive : M.bakelite, 0, 0.56, 0, 12);
        cyl(u, 0.007, 0.2, M.wood, 0, 0.69, 0, 8);
        put(u, new THREE.TorusGeometry(0.032, 0.009, 8, 18, Math.PI), M.wood, 0.032, 0.89, 0);
    }
    return g;
}

export function doorMat(M, w = 2.4, d = 1.4) {
    const g = new THREE.Group();
    box(g, w, 0.015, d, M.rubber, 0, 0, 0);
    for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += 0.06) box(g, 0.02, 0.008, d - 0.12, M.bakelite, x, 0.015, 0);
    return g;
}

export function streetGate(M, w = 1.5, h = 3.3, bolted = false, inside = 1) {
    const g = new THREE.Group(), bronze = M.goldDull, T2 = 0.05;
    for (const x of [0.035, w - 0.035]) box(g, 0.07, h - 0.04, T2, bronze, x, 0.04, 0);
    for (const [y, hh] of [[0.04, 0.1], [1.0, 0.07], [2.25, 0.07], [h - 0.1, 0.1]]) box(g, w - 0.14, hh, T2, bronze, w / 2, y, 0);
    const n = Math.round((w - 0.14) / 0.11), bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.014, h - 0.2, 10), bronze, n), d = new THREE.Object3D();
    for (let k = 0; k < n; k++) { d.position.set(0.07 + (k + 0.5) * (w - 0.14) / n, h / 2, 0); d.updateMatrix(); bars.setMatrixAt(k, d.matrix); }
    bars.castShadow = bars.receiveShadow = true; g.add(bars);
    for (let k = 0; k < 4; k++) {
        put(g, new THREE.BoxGeometry(0.2, 0.2, 0.03), M.gold, 0.07 + (k + 0.5) * (w - 0.14) / 4, 2.62, 0).rotation.z = Math.PI / 4;
    }
    box(g, w - 0.14, 0.03, 0.035, M.gold, w / 2, 2.44, 0); box(g, w - 0.14, 0.03, 0.035, M.gold, w / 2, 2.8, 0);

    box(g, 0.12, 0.26, 0.09, bronze, w - 0.1, 0.95, 0);
    for (const s of [-1, 1]) {
        box(g, 0.014, 0.04, 0.004, M.bakelite, w - 0.1, 1.02, s * 0.047); cyl(g, 0.006, 0.004, M.bakelite, w - 0.1, 1.06, s * 0.047, 8).rotation.x = Math.PI / 2;
        const kb = cyl(g, 0.025, 0.04, M.gold, 0, 0, 0, 16); kb.rotation.x = Math.PI / 2; kb.position.set(w - 0.1, 1.12, s * 0.065);
    }

    const by = bolted ? -0.04 : 0.2;
    cyl(g, 0.012, 0.55, M.gold, w - 0.2, by, inside * 0.04, 8); box(g, 0.03, 0.012, 0.05, M.gold, w - 0.2, by + 0.5, inside * 0.06);
    for (const y of [0.16, 0.46]) box(g, 0.05, 0.03, 0.04, bronze, w - 0.2, y, inside * 0.035);
    for (const y of [0.3, h / 2, h - 0.4]) cyl(g, 0.03, 0.2, M.gold, 0, y - 0.1, 0, 12);
    return g;
}

export function ticketMachine(M, signTex) {
    const g = new THREE.Group();
    cyl(g, 0.24, 0.05, M.black, 0, 0, 0, 32, 0.26); cyl(g, 0.04, 1.02, M.gold, 0, 0.05, 0, 16); ring(g, 0.06, 0.014, M.gold, 0, 0.5);
    rbox(g, 0.3, 0.34, 0.22, 0.06, M.redPaint, 0, 1.05, 0);
    ring(g, 0.09, 0.02, M.gold, 0, 1.22, 0.11, false);
    box(g, 0.08, 0.004, 0.13, M.paper, 0, 1.1, 0.16).rotation.x = 0.5;
    box(g, 0.09, 0.02, 0.02, M.bakelite, 0, 1.12, 0.11);
    const sign = new THREE.Group(); sign.position.set(0, 1.42, 0); g.add(sign);
    cyl(sign, 0.012, 0.12, M.gold, 0, -0.03, 0, 8);
    if (hasEraFont()) { add(sign, plaque3d(M, [['TAKE A', 0.045], ['NUMBER', 0.045]], { w: 0.48, h: 0.2, letterMat: litGold(M) }), 0, 0.2, 0.01); return g; }
    box(sign, 0.52, 0.24, 0.02, M.gold, 0, 0.08, 0);
    if (signTex) put(sign,new THREE.PlaneGeometry(0.48, 0.2), new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.3, roughness: 0.4 }), 0, 0.2, 0.012).castShadow = false;
    return g;
}

export function hydrant(M) {
    const g = new THREE.Group();
    lathe(g, [[0, 0], [0.16, 0], [0.16, 0.05], [0.12, 0.07], [0.12, 0.55], [0.14, 0.58], [0.14, 0.62], [0.1, 0.66], [0.06, 0.74], [0.03, 0.78], [0, 0.78]], M.redPaint, 0, 0, 0, 24);
    for (const s of [-1, 1]) { const n = cyl(g, 0.05, 0.1, M.redPaint, 0, 0, 0, 12); n.rotation.z = Math.PI / 2; n.position.set(s * 0.15, 0.45, 0); }
    const f = cyl(g, 0.07, 0.1, M.redPaint, 0, 0, 0, 12); f.rotation.x = Math.PI / 2; f.position.set(0, 0.42, 0.14);
    return g;
}

export function streetMailbox(M) {
    const g = new THREE.Group();
    for (const x of [-0.2, 0.2]) for (const z of [-0.18, 0.18]) box(g, 0.04, 0.5, 0.04, M.olive, x, 0, z);
    box(g, 0.5, 0.62, 0.44, M.olive, 0, 0.5, 0);
    put(g, new THREE.CylinderGeometry(0.25, 0.25, 0.44, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), M.olive, 0, 1.12, 0);
    box(g, 0.3, 0.05, 0.02, M.bakelite, 0, 1.0, 0.225);
    return g;
}

export function litterBin(M) {
    const g = new THREE.Group();
    put(g, new THREE.CylinderGeometry(0.24, 0.2, 0.7, 20, 1, true), M.galv, 0, 0.35, 0); ring(g, 0.24, 0.015, M.galv, 0, 0.7); cyl(g, 0.2, 0.01, M.galv, 0, 0, 0, 20);
    for (let i = 0; i < 5; i++) { const c = crumple(M, 0.06 + T.rnd() * 0.03); c.position.set((T.rnd() - 0.5) * 0.2, 0.58 + T.rnd() * 0.12, (T.rnd() - 0.5) * 0.2); g.add(c); }
    add(g, newspaper(M), 0.02, 0.72, 0).rotation.set(0.4, 0.5, 0.2);
    return g;
}

export function newsstand(M) {
    const g = new THREE.Group(), W = 2.8, D = 1.5;
    box(g, W, 1.0, D, M.olive, 0, 0, 0); box(g, W + 0.1, 0.05, D + 0.3, M.wood, 0, 1.0, 0.1);
    box(g, W, 2.4, 0.08, M.olive, 0, 0, -D / 2);
    for (const s of [-1, 1]) box(g, 0.08, 2.4, D, M.olive, s * W / 2, 0, 0);
    const roof = box(g, W + 0.5, 0.08, D + 1.0, M.olive, 0, 2.5, 0.3); roof.rotation.x = 0.12;
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) add(g, newspaper(M), -1.0 + i * 0.62, 1.05 + k * 0.014, 0.2 + (k % 2) * 0.03).rotation.y = (k - 1) * 0.05;
    const mags = [M.red, M.leather, M.paper, M.olive, M.club];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) { const m = box(g, 0.22, 0.3, 0.01, mags[(i + r) % 5], -1.1 + i * 0.27, 1.25 + r * 0.36, -D / 2 + 0.06); m.rotation.x = -0.15; }
    box(g, 0.9, 0.02, 0.1, M.dimGlow, 0, 2.38, -0.2);
    return g;
}

export function subwayEntrance(M, signTex) {
    const g = new THREE.Group(), W = 2.4, D = 5;
    put(g, new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#030303' }), 0, 0.004, 0).castShadow = false;
    for (let i = 0; i < 4; i++) box(g, W - 0.1, 0.05, 0.3, M.iron, 0, 0.005, D / 2 - 0.15 - i * 0.3).material = [M.iron, M.rubber][i % 2];
    const rail = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
        const r = new THREE.Group(); r.position.set(x0, 0, z0); r.rotation.y = a; g.add(r);
        box(r, 0.06, 0.06, len, M.iron, 0, 1.0, len / 2); box(r, 0.04, 0.04, len, M.iron, 0, 0.12, len / 2);
        for (let z = 0.1; z < len; z += 0.13) box(r, 0.02, 0.9, 0.02, M.iron, 0, 0.12, z);
    };
    rail(-W / 2, D / 2, -W / 2, -D / 2); rail(W / 2, D / 2, W / 2, -D / 2); rail(-W / 2, -D / 2, W / 2, -D / 2);
    for (const s of [-1, 1]) {
        const x = s * W / 2, z = D / 2;
        cyl(g, 0.07, 2.4, M.iron, x, 0, z, 12); ball(g, 0.18, new THREE.MeshStandardMaterial({ color: '#000', emissive: '#6fe39a', emissiveIntensity: 1.2 }), x, 2.6, z);
        ring(g, 0.13, 0.02, M.iron, x, 2.45, z);
    }
    put(g, new THREE.PlaneGeometry(1.4, 0.3), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 }), 0, 1.3, D / 2 + 0.01).castShadow = false;
    box(g, 1.5, 0.36, 0.04, M.iron, 0, 1.12, D / 2 - 0.02);
    return g;
}

export function trafficSignal(M) {
    const g = new THREE.Group();
    cyl(g, 0.2, 0.2, M.olive, 0, 0, 0, 16, 0.26); cyl(g, 0.07, 3.6, M.olive, 0, 0.2, 0, 12);
    box(g, 0.34, 1.0, 0.34, M.olive, 0, 3.8, 0); cyl(g, 0.12, 0.2, M.olive, 0, 4.8, 0, 12, 0.2);
    const lamps = [];
    const col = ['#ff3a22', '#ffb020', '#2fe07a'];
    for (let k = 0; k < 3; k++) {
        const mat = new THREE.MeshStandardMaterial({ color: '#080808', emissive: col[k], emissiveIntensity: 0 }); lamps.push(mat);
        for (let f = 0; f < 4; f++) { const a = f * Math.PI / 2, c = put(g, new THREE.CircleGeometry(0.09, 20), mat, Math.sin(a) * 0.172, 4.6 - k * 0.3, Math.cos(a) * 0.172); c.rotation.y = a; c.castShadow = false; }
    }
    g.userData = {
        update(t) {
            const p = (t + 7) % 27, on = p < 12 ? 2 : p < 15 ? 1 : 0;
            lamps.forEach((m, k) => m.emissiveIntensity = k === on ? 2.2 : 0.02);
        },
    };
    return g;
}

export function flapBoard(M, atlasTex) {
    const g = new THREE.Group(), W = 5.6, H = 1.8, N = T.FLAP_CHARS.length, PX = 250;
    const cells = [], rows = { number: [], window: [] };
    const mat = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.55, metalness: 0.1 });

    const layout = [];
    const big = { w: 0.6, h: 0.9 };
    for (let i = 0; i < 4; i++) layout.push({ row: 'number', x: -2.3 + i * 0.68, y: 0.74, ...big });
    layout.push({ row: 'window', x: 2.18, y: 0.74, ...big });

    const face = T.canvas(W * PX, H * PX, (c, w, h) => {
        c.fillStyle = '#0b0b0b'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#8a6a30'; c.lineWidth = 3; c.strokeRect(14, 14, w - 28, h - 28); c.strokeRect(24, 24, w - 48, h - 48);
        if (!hasEraFont()) {
            c.fillStyle = '#d6ab52'; c.font = `600 60px "${T.ERA_FONT}", serif`; c.letterSpacing = '10px'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('NOW SERVING', w / 2, (H - 1.5) * PX);
            c.font = `600 36px "${T.ERA_FONT}", serif`; c.letterSpacing = '6px'; c.fillText('WINDOW', (W / 2 + 1.28) * PX, (H - 0.74) * PX); c.letterSpacing = '0px';
        }
        for (const l of layout) {
            const x = (W / 2 + l.x - l.w / 2 - 0.03) * PX, y = (H - l.y - l.h / 2 - 0.03) * PX, cw = (l.w + 0.06) * PX, ch = (l.h + 0.06) * PX;
            c.fillStyle = '#020202'; c.fillRect(x, y, cw, ch); c.strokeStyle = '#3a2e1a'; c.lineWidth = 2; c.strokeRect(x, y, cw, ch);
        }
    });
    box(g, W, H, 0.2, M.lacquer, 0, 0, -0.1);
    put(g, new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: T.tex(face), roughness: 0.6 }), 0, H / 2, 0.002).castShadow = false;
    for (const [bw, bh, x, y] of [[W + 0.12, 0.06, 0, H], [W + 0.12, 0.06, 0, -0.06], [0.06, H + 0.12, -W / 2 - 0.03, -0.06], [0.06, H + 0.12, W / 2 + 0.03, -0.06]]) box(g, bw, bh, 0.24, M.gold, x, y, -0.1);
    for (let k = 0; k < 4; k++) box(g, W + 0.12 - k * 0.9, 0.12, 0.16 - k * 0.02, k % 2 ? M.black : M.gold, 0, H + 0.06 + k * 0.12, -0.08);
    for (const [text, size, x, y, sp] of [['NOW SERVING', 0.14, 0, 1.44, 0.18], ['WINDOW', 0.085, 1.28, 0.71, 0.14]]) {
        const L = letters3d(text, M.gold, { size, depth: size * 0.12, spacing: sp }); L.group.position.set(x, y, 0.004); g.add(L.group);
    }

    const uv = (mesh, ch, top) => {
        const u0 = ch / N + 0.002, u1 = (ch + 1) / N - 0.002, a = mesh.geometry.attributes.uv, vt = top ? 1 : 0.5, vb = top ? 0.5 : 0;
        a.setXY(0, u0, vt); a.setXY(1, u1, vt); a.setXY(2, u0, vb); a.setXY(3, u1, vb); a.needsUpdate = true;
    };
    for (const l of layout) {
        const half = l.h / 2, mk = geo => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = true; return m; };
        const sTop = mk(new THREE.PlaneGeometry(l.w, half)); sTop.position.set(l.x, l.y + half / 2, 0.012); g.add(sTop);
        const sBot = mk(new THREE.PlaneGeometry(l.w, half)); sBot.position.set(l.x, l.y - half / 2, 0.012); g.add(sBot);
        const pivot = new THREE.Group(); pivot.position.set(l.x, l.y, 0.02); g.add(pivot);
        const front = mk(new THREE.PlaneGeometry(l.w, half).translate(0, half / 2, 0)); pivot.add(front);
        const back = mk(new THREE.PlaneGeometry(l.w, half).rotateX(Math.PI).translate(0, half / 2, 0)); pivot.add(back);
        const cell = { sTop, sBot, pivot, front, back, cur: 0, target: 0, next: 0, p: -1, dur: 0.07 + T.rnd() * 0.025, wait: 0 };
        for (const [m, top] of [[sTop, true], [sBot, false], [front, true], [back, false]]) uv(m, 0, top);
        cells.push(cell); rows[l.row].push(cell);
    }
    const idx = ch => Math.max(0, T.FLAP_CHARS.indexOf(ch));
    const set = (row, text) => rows[row].forEach((c, i) => { c.target = idx(text[i] ?? ' '); c.wait = T.rnd() * 0.12; });
    g.userData = {
        cells,
        show({ number, window: win } = {}) {
            if (number != null) set('number', String(number).padStart(4, '0'));
            if (win != null) set('window', String(win));
        },
        snap() {
            for (const c of cells) { c.cur = c.target; c.p = -1; c.pivot.rotation.x = 0; uv(c.sTop, c.cur, true); uv(c.front, c.cur, true); uv(c.sBot, c.cur, false); }
        },
        update(dt) {
            let fell = 0;
            for (const c of cells) {
                if (c.p < 0) {
                    if (c.cur === c.target) continue;
                    if ((c.wait -= dt) > 0) continue;
                    c.next = (c.cur + 1) % N;
                    uv(c.sTop, c.next, true); uv(c.front, c.cur, true); uv(c.back, c.next, false); uv(c.sBot, c.cur, false);
                    c.p = 0;
                }
                c.p += dt / c.dur;
                c.pivot.rotation.x = Math.PI * Math.min(1, c.p) ** 2;
                if (c.p >= 1) {
                    c.cur = c.next; c.p = -1; c.pivot.rotation.x = 0; fell++;
                    uv(c.front, c.cur, true); uv(c.sBot, c.cur, false);
                }
            }
            return fell;
        },
    };
    return g;
}
