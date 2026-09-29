import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import * as F from './furniture.js';

export const HALL = { W: 36, NAVE: 11.5, L: 88, SPRING: 25, TELLERS: -78, EYE: 1.65, START: new THREE.Vector3(0, 0, 17.6), STREET: -1.62 };
const STAIR_W = 2.8;

const ROAD = [24.3];

export function ground(x, z) {
    if (z < 10.6 || (Math.abs(x) < 6 && z < 12)) return 0;
    if (Math.abs(x) < 6 && z < 15.8) return HALL.STREET * (z - 12) / 3.8;
    return HALL.STREET;
}
const COLS_Z = [-9, -18, -27, -36, -45, -54, -63, -72];

export const SUN = new THREE.Vector3(-0.75, -0.58, -0.32).normalize();

const SUN_AT = new THREE.Vector3(0, 0, -32), SUN_SIZE = 75;

export const SUN_DIST = 320, SUN_NEAR = 60, SUN_FAR = 420;
const WINDOW_Z = COLS_Z.map(z => z + 4.5).filter(z => z > -76);

function vaultTextures() {
    const w = 4096, h = 2048, k = w / 2048;
    const paint = T.canvas(w, h, (g) => {
        const bands = ['#b8532a', '#0f4f57', '#d9a948', '#e9dcc0', '#0f4f57', '#b8532a', '#d9a948'];
        g.fillStyle = '#1a3c40'; g.fillRect(0, 0, w, h);
        const bw = w / 26;
        for (let i = 0; i < 26; i++) {
            g.fillStyle = bands[i % bands.length]; g.fillRect(i * bw, 0, bw, h);
            for (let y = 0; y < h; y += bw) {
                g.fillStyle = i % 2 ? 'rgba(0,0,0,.28)' : 'rgba(255,240,200,.3)';
                g.beginPath(); g.moveTo(i * bw, y); g.lineTo(i * bw + bw / 2, y + bw / 2); g.lineTo(i * bw + bw, y); g.lineTo(i * bw + bw, y + bw * 0.25); g.lineTo(i * bw + bw / 2, y + bw * 0.75); g.lineTo(i * bw, y + bw * 0.25); g.fill();
            }
            g.fillStyle = '#d9a948'; g.fillRect(i * bw, 0, 3 * k, h);
        }
        g.fillStyle = '#f7e2b0'; g.fillRect(w * 0.45, 0, w * 0.1, h);
        g.strokeStyle = '#3a2a14'; g.lineWidth = 5 * k;
        for (let y = 0; y < h; y += w * 0.025) { g.beginPath(); g.moveTo(w * 0.45, y); g.lineTo(w * 0.55, y); g.stroke(); }
        for (let x = w * 0.45; x <= w * 0.55; x += w * 0.025) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        for (let i = 0; i < 6000 * k * k; i++) { g.fillStyle = `rgba(0,0,0,${T.rnd() * 0.06})`; g.fillRect(T.rnd() * w, T.rnd() * h, 3 * k, 3 * k); }
    }, 51);
    const glow = T.canvas(w, 64, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, 64); g.fillStyle = '#fff'; g.fillRect(w * 0.45, 0, w * 0.1, 64); });
    return { map: T.tex(paint, 1, 3), emissive: T.tex(glow, 1, 3) };
}

function dust(n = 5000) {
    const pos = new Float32Array(n * 3), seedA = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = -17 + T.rnd() * 35; pos[i * 3 + 1] = 0.5 + T.rnd() * 26; pos[i * 3 + 2] = -2 - T.rnd() * 76; seedA[i] = T.rnd(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seedA, 1));
    const m = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, tLight: { value: null }, lightMat: { value: new THREE.Matrix4() }, ready: { value: 0 }, sunAmt: { value: 1 } },
        vertexShader: `attribute float seed; uniform float time, ready, sunAmt; uniform sampler2D tLight; uniform mat4 lightMat; varying float vB;
            void main() {
                vec3 p = position + vec3(sin(time * 0.05 + seed * 40.0), sin(time * 0.03 + seed * 17.0) * 0.6, cos(time * 0.04 + seed * 29.0)) * 0.6;
                vec4 lc = lightMat * vec4(p, 1.0); vec3 l = lc.xyz * 0.5 + 0.5;
                float lit = ready * step(l.z - 0.002, texture2D(tLight, l.xy).x);
                vB = 0.015 + 0.9 * lit * sunAmt;
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                gl_PointSize = clamp((0.6 + seed) * 9.0 / -mv.z, 1.5, 3.0);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `varying float vB; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.8, 0.55) * vB * (1.0 - d * 2.0) * 0.4, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(g, m);
}

function ghostMaterial(color, roughness, y, opts = {}) {

    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: opts.metal || 0, transparent: true, depthWrite: true, alphaTest: 0.02, side: opts.side || THREE.FrontSide });
    m.onBeforeCompile = sh => {
        sh.uniforms.fadeFrom = { value: y + 0.34 }; sh.uniforms.fadeTo = { value: y + 0.56 };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWy;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvWy = (modelMatrix * vec4(transformed, 1.0)).y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWy; uniform float fadeFrom, fadeTo;')
            .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= clamp(1.0 - smoothstep(fadeFrom, fadeTo, vWy), 0.0, 1.0);');
    };
    return m;
}
const merge = list => mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));

function worldUV(mesh, tile = 4) {
    const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, o = mesh.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + o.x, y = p.getY(i) + o.y, z = p.getZ(i) + o.z;
        uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? z : x) / tile, (Math.abs(n.getY(i)) > 0.5 ? z : y) / tile);
    }
}

let tstrap = null;
const SHOES = {
    oxford: () => ({ geo: (SHOES.oxGeo ||= F.oxfordGeo()), ankle: new THREE.Vector3(0, 0.1, -0.055), heel: -0.14, toe: 0.1 }),
    pump: () => { tstrap ||= F.tstrapGeo(); return { geo: tstrap.geo, foot: tstrap.foot, ankle: new THREE.Vector3(0, 0.12, -0.07), heel: -0.1, toe: 0.085 }; },
};

const LEGS = {
    trouser: F.loftGeo([[0, 0, 0.012, 0.086, 0.094, 2.2], [0, 0.085, 0.004, 0.086, 0.09, 2.2], [0, 0.092, 0.003, 0.079, 0.085, 2.2], [0, 0.4, 0, 0.074, 0.079, 2.2], [0, 0.8, 0, 0.076, 0.08, 2.2], [0, 1, 0, 0.08, 0.083, 2.2]], { cap: false, seg: 22 }),
    wide: F.loftGeo([[0, 0, 0.01, 0.112, 0.118, 2.1], [0, 0.3, 0.004, 0.1, 0.106, 2.1], [0, 0.7, 0, 0.088, 0.094, 2.1], [0, 1, 0, 0.086, 0.09, 2.1]], { cap: false, seg: 22 }),
    stocking: F.loftGeo([[0, 0, 0, 0.027, 0.03], [0, 0.12, 0, 0.031, 0.035], [0, 0.3, -0.004, 0.042, 0.048], [0, 0.48, -0.008, 0.049, 0.054], [0, 0.66, -0.004, 0.046, 0.05], [0, 0.85, 0, 0.042, 0.045], [0, 1, 0, 0.043, 0.046]], { cap: false, seg: 20 }),
};

const KINDS = [
    { leg: 'trouser', shoe: 'oxford', knee: 0.5, stride: [0.7, 0.8], speed: [1.15, 1.5], legs: ['#050505'], shoes: ['#050505'] },
    { leg: 'stocking', shoe: 'pump', knee: 0.47, stride: [0.52, 0.6], speed: [1.05, 1.3], legs: ['#050505'], shoes: ['#050505'] },
    { leg: 'wide', shoe: 'pump', knee: 0.48, stride: [0.56, 0.64], speed: [1.1, 1.35], legs: ['#050505'], shoes: ['#050505'] },
];
const pick = (list) => list[Math.floor(T.rnd() * list.length)];
const span = ([a, b]) => a + T.rnd() * (b - a);

function footShadows(y, n = 18, lanes = [16.6, 6.8]) {
    const shade = (streak) => new THREE.ShaderMaterial({
        vertexShader: `attribute float fade; varying float vF; varying vec2 vUv; void main() { vF = fade; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: streak

            ? `varying float vF; varying vec2 vUv; void main() { float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.5) * (1.0 - smoothstep(0.15, 0.5, abs(vUv.x - 0.5))); gl_FragColor = vec4(0.03, 0.02, 0.02, clamp(a * vF * 0.3, 0.0, 1.0)); }`
            : `varying float vF; varying vec2 vUv; void main() { vec2 q = (vUv - 0.5) * 2.0; float a = 1.0 - smoothstep(0.3, 1.0, length(q)); gl_FragColor = vec4(0.03, 0.02, 0.02, clamp(a * vF * 0.6, 0.0, 1.0)); }`,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const footGeo = new THREE.PlaneGeometry(0.12, 0.3).rotateX(-Math.PI / 2);
    const legGeo = new THREE.PlaneGeometry(0.16, 1.6).rotateX(-Math.PI / 2).translate(0, 0, -0.8);
    const feet = new THREE.InstancedMesh(footGeo, shade(false), n * 2), legs = new THREE.InstancedMesh(legGeo, shade(true), n * 2);
    const fadeF = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 1), fadeL = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 1);
    feet.geometry.setAttribute('fade', fadeF); legs.geometry.setAttribute('fade', fadeL);
    for (const m of [feet, legs]) { m.frustumCulled = false; m.renderOrder = 2; }
    const shadowYaw = Math.atan2(-SUN.x, -SUN.z);
    const group = new THREE.Group(), ghosts = new THREE.Group(); group.add(legs, feet, ghosts);
    const people = Array.from({ length: n }, () => {
        const kind = KINDS[T.rnd() < 0.45 ? 0 : T.rnd() < 0.6 ? 1 : 2], p = {
            x0: T.rnd() * 64 - 32, lane: lanes[0] + T.rnd() * lanes[1], dir: T.rnd() < 0.5 ? -1 : 1,
            speed: span(kind.speed), stride: span(kind.stride), off: T.rnd() * 100, kind, parts: [],
        };
        const legMat = ghostMaterial(pick(kind.legs), kind.leg === 'stocking' ? 0.45 : 0.85, y);
        const shoeCol = pick(kind.shoes), shoeMat = ghostMaterial(shoeCol, kind.shoe === 'oxford' ? 0.3 : 0.18, y);
        for (let k = 0; k < 2; k++) {
            const shoe = SHOES[kind.shoe](), foot = new THREE.Group();
            foot.add(new THREE.Mesh(shoe.geo, shoeMat));
            if (shoe.foot) foot.add(new THREE.Mesh(shoe.foot, legMat));
            const leg = new THREE.Mesh(LEGS[kind.leg], legMat);
            ghosts.add(foot, leg);
            p.parts.push({ foot, leg, ankle: shoe.ankle, shoe });
        }
        p.mats = [legMat, shoeMat];
        return p;
    });
    const d = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3(), K = new THREE.Vector3(), qYaw = new THREE.Quaternion(), qTilt = new THREE.Quaternion();
    const S = THREE.MathUtils.smoothstep;

    let started = false;
    const ENTER = 15.5;
    return {
        group,
        start(t) {
            if (started) return; started = true;
            const order = people.map((_, i) => i).sort(() => T.rnd() - 0.5); let at = t + 0.1;
            for (const i of order) { people[i].born = at; at += 0.7 + T.rnd() * 1.1; }
        },

        update(t) {
            const landed = [];
            people.forEach((p, i) => {
                const here = started && t >= p.born;
                const dist = here ? p.speed * (t - p.born) + p.off % (2 * p.stride) : 0;
                let base = -p.dir * ENTER + p.dir * dist; base = ((base + 32) % 64 + 64) % 64 - 32;

                const edge = here ? (1 - S(Math.abs(base), 26, 32)) * S(t - p.born, 0, 1.2) : 0, yaw = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
                for (let foot = 0; foot < 2; foot++) {
                    const u = dist / (2 * p.stride) - foot * 0.5, n = Math.floor(u), c = u - n, part = p.parts[foot], shoe = part.shoe;
                    const plant = (2 * n + foot) * p.stride + 0.6 * p.stride;
                    let along, lift = 0, pitch, pz;
                    if (c < 0.6) {
                        along = plant;
                        if (c < 0.3) { pitch = -0.28 * (1 - S(c, 0, 0.1)); pz = shoe.heel; }
                        else { pitch = 0.7 * S(c, 0.38, 0.6); pz = shoe.toe; }
                    } else {
                        const s = (c - 0.6) / 0.4, e = s * s * (3 - 2 * s);
                        along = plant + 2 * p.stride * e; lift = 0.055 * Math.sin(Math.PI * s);
                        pitch = 0.7 + (-0.28 - 0.7) * S(s, 0.05, 0.95); pz = shoe.toe + (shoe.heel - shoe.toe) * S(s, 0.2, 0.8);
                    }
                    if (part.n !== undefined && n !== part.n && edge > 0.05) landed.push({ x: base + p.dir * (plant + 2 * p.stride - dist), z: p.lane + (foot ? 0.1 : -0.1), gain: edge });
                    part.n = n;
                    const x = base + p.dir * (along - dist), z = p.lane + (foot ? 0.1 : -0.1), j = i * 2 + foot, air = lift / 0.055;
                    d.position.set(x, y + 0.004, z); d.rotation.set(0, Math.PI / 2, 0); d.scale.setScalar(1 - air * 0.35); d.updateMatrix(); feet.setMatrixAt(j, d.matrix);
                    fadeF.array[j] = edge * (1 - air * 0.7);
                    d.position.y = y + 0.003; d.rotation.set(0, shadowYaw, 0); d.scale.set(1, 1, 0.6 + air * 0.5); d.updateMatrix(); legs.setMatrixAt(j, d.matrix);
                    fadeL.array[j] = edge * (0.8 + air * 0.2);

                    part.foot.position.set(x + p.dir * pz * (1 - Math.cos(pitch)), y + lift + pz * Math.sin(pitch), z);
                    part.foot.rotation.set(pitch, yaw, 0, 'YXZ'); part.foot.updateMatrixWorld();
                    A.copy(part.ankle).applyMatrix4(part.foot.matrixWorld);

                    K.set(base + (x - base) * 0.55 + p.dir * (0.04 + 0.07 * air), y + p.kind.knee + 0.08, z);
                    qYaw.setFromAxisAngle(up, yaw); qTilt.setFromUnitVectors(up, K.clone().sub(A).normalize());
                    part.leg.position.copy(A); part.leg.quaternion.copy(qTilt).multiply(qYaw); part.leg.scale.set(1, A.distanceTo(K), 1);
                }
                for (const m of p.mats) m.opacity = edge * 0.85;
                for (const part of p.parts) part.foot.visible = part.leg.visible = edge > 0.01;
            });
            feet.instanceMatrix.needsUpdate = legs.instanceMatrix.needsUpdate = fadeF.needsUpdate = fadeL.needsUpdate = true;
            return landed;
        },
    };
}

function bake(root, keep) {
    const skip = new Set(); keep.forEach(o => o.traverse(c => skip.add(c)));
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), buckets = new Map(), gone = [];
    root.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || skip.has(o) || o.children.length || o.renderOrder || Array.isArray(o.material) || o.material.transparent) return;
        const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        if (m.determinant() <= 0) return;
        const g = o.geometry.clone().applyMatrix4(m);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.normal || !g.attributes.uv) return;
        const key = `${o.material.uuid}|${o.castShadow}`;
        if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, list: [] });
        buckets.get(key).list.push(g); gone.push(o);
    });
    gone.forEach(o => o.removeFromParent());
    for (const { mat, cast, list } of buckets.values()) {
        const mesh = new THREE.Mesh(merge(list), mat); mesh.castShadow = cast; mesh.receiveShadow = true; root.add(mesh);
    }
}

const SKY_GLSL = `
    uniform vec3 sunTo;
    vec3 skyCol(vec3 d) {
        float up = d.y, s = max(dot(d, sunTo), 0.0);
        vec2 hz = normalize(d.xz + vec2(1e-5)), sz = normalize(sunTo.xz);
        float side = pow(dot(hz, sz) * 0.5 + 0.5, 2.0);
        vec3 horizon = mix(vec3(0.24, 0.16, 0.24), vec3(0.85, 0.42, 0.2), side);
        vec3 c = mix(horizon, vec3(0.08, 0.09, 0.2), smoothstep(-0.02, 0.6, up));
        c = mix(c, vec3(0.12, 0.08, 0.06), 1.0 - smoothstep(-0.08, 0.0, up));
        c += vec3(1.0, 0.55, 0.25) * pow(s, 10.0) * 0.5 + vec3(1.0, 0.8, 0.5) * smoothstep(0.9993, 0.9996, s) * 20.0;
        return c;
    }`;

const CLOUD_GLSL = `
    uniform float time;
    float ch(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float cn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * cn(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; } return s; }
    vec3 withClouds(vec3 d, vec3 c) {
        if (d.y <= 0.0) return c;
        vec2 p = d.xz / (d.y + 0.12) * 1.6 + vec2(time * 0.006, time * 0.0025);
        float n = fbm(p), shape = fbm(p * 0.35 + 3.0);
        float dens = smoothstep(0.42, 0.75, n * 0.65 + shape * 0.55);
        dens *= smoothstep(0.02, 0.18, d.y) * (1.0 - 0.35 * smoothstep(0.5, 0.95, d.y));

        float lit = pow(dot(d, sunTo) * 0.5 + 0.5, 3.0), rim = fbm(p * 2.0 + 7.0);
        vec3 under = mix(vec3(0.16, 0.12, 0.2), vec3(0.95, 0.46, 0.28), lit);
        vec3 cc = mix(under * 0.55, under * (1.1 + 0.6 * lit), smoothstep(0.35, 0.8, rim));
        cc += vec3(1.0, 0.65, 0.35) * pow(max(dot(d, sunTo), 0.0), 24.0) * 0.8;
        c = mix(c, cc, dens * 0.92);
        float away = 1.0 - smoothstep(-0.2, 0.4, dot(d, sunTo));
        vec2 sp = d.xz / (d.y + 0.3) * 90.0, cell = floor(sp);
        float star = step(0.9965, ch(cell)) * (1.0 - smoothstep(0.05, 0.14, length(fract(sp) - 0.3 - 0.4 * vec2(ch(cell + 3.1), ch(cell + 7.7)))))
                   * smoothstep(0.35, 0.8, d.y) * away * (1.0 - dens);
        return c + vec3(0.9, 0.9, 1.0) * star * (0.6 + 0.4 * sin(time * 1.3 + ch(cell) * 40.0)) * 0.6;
    }`;
function skyDome() {
    const m = new THREE.ShaderMaterial({
        uniforms: { sunTo: { value: SUN.clone().negate() }, time: { value: 0 } },
        vertexShader: 'varying vec3 vD; void main() { vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
        fragmentShader: SKY_GLSL + CLOUD_GLSL + 'varying vec3 vD; void main() { vec3 d = normalize(vD); gl_FragColor = vec4(withClouds(d, skyCol(d)), 1.0); }',
        side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), m);
    dome.frustumCulled = false; dome.renderOrder = -1;
    return dome;
}

function hazed(m, per = 1100) {
    m.fog = false;
    m.onBeforeCompile = sh => {
        sh.uniforms.sunTo = { value: SUN.clone().negate() };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;' + SKY_GLSL)
            .replace('#include <dithering_fragment>', `#include <dithering_fragment>
                vec3 toP = vWp - cameraPosition; float dist = max(length(toP), 1e-3);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, skyCol(toP / dist), 1.0 - exp(-dist / ${per.toFixed(1)}));`);
    };
    return m;
}

function city(ground) {
    const [FW, FH] = T.FACADE_M;
    const mats = ['limestone', 'brick', 'black'].map((k, i) => {
        const f = T.facade(k, 91 + i * 7);
        return hazed(new THREE.MeshStandardMaterial({ map: T.tex(f.map), emissive: '#ffd49a', emissiveMap: T.tex(f.emissive), emissiveIntensity: 1.6, roughness: 0.75 }));
    });
    const crownMat = hazed(new THREE.MeshStandardMaterial({ color: '#c9a45a', metalness: 0.9, roughness: 0.3 }));

    const lists = [[], [], [], []];

    const BAY = FW / 10, FLOOR = FH / 10, snap = (v, s) => Math.max(2 * s, Math.round(v / s) * s);
    const block = (list, w, h, d, x, y, z, ou, ov) => {
        const geo = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
        const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) {
            if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, 0.01, 0.5);
            else uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) - (z - d / 2) : p.getX(i) - (x - w / 2)) / FW + ou, (p.getY(i) - ground) / FH + ov);
        }
        list.push(geo);
    };

    const L = SUN.clone().negate(), winRays = [], walkRays = [];
    for (const wz of WINDOW_Z) for (const y of [13, 19, 25]) winRays.push(new THREE.Vector3(HALL.W / 2, y, wz));
    for (const x of [-24, -12, 0, 12, 24]) walkRays.push(new THREE.Vector3(x, HALL.STREET, 20));
    const hits = (b, o) => {
        let t0 = 0, t1 = 1e9;
        for (const a of ['x', 'y', 'z']) {
            let ta = (b[a][0] - o[a]) / L[a], tb = (b[a][1] - o[a]) / L[a];
            if (ta > tb) [ta, tb] = [tb, ta];
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
        }
        return true;
    };
    const shaded = new Set(), placed = [];

    const zones = [
        [45, 260, -240, -14, 18],
        [-260, -45, -240, -14, 18],
        [-240, 240, 70, 330, 18],
    ];
    for (const [x0, x1, z0, z1, want] of zones) {
        for (let tries = 0, n = 0; n < want && tries < 300; tries++) {
            const w = snap(18 + T.rnd() * 22, BAY), d = snap(18 + T.rnd() * 22, BAY), x = x0 + T.rnd() * (x1 - x0), z = z0 + T.rnd() * (z1 - z0);
            const h = snap(T.rnd() < 0.15 ? 200 + T.rnd() * 70 : 45 + T.rnd() * 150, FLOOR);
            const b = { x: [x - w / 2, x + w / 2], y: [ground, ground + h + 20], z: [z - d / 2, z + d / 2] };
            if (placed.some(o => o.x[0] < b.x[1] + 8 && o.x[1] > b.x[0] - 8 && o.z[0] < b.z[1] + 8 && o.z[1] > b.z[0] - 8)) continue;
            if (walkRays.some(o => hits(b, o))) continue;
            const more = winRays.map((o, i) => hits(b, o) ? i : -1).filter(i => i >= 0 && !shaded.has(i));
            if (shaded.size + more.length > winRays.length * 0.35) continue;
            more.forEach(i => shaded.add(i)); placed.push(b); n++;

            const kind = Math.floor(T.rnd() * 3), list = lists[kind], ou = Math.floor(T.rnd() * 10) / 10, ov = Math.floor(T.rnd() * 10) / 10;
            const tiers = 2 + Math.floor(T.rnd() * 3);
            let y = ground, tw = w, td = d, left = h;
            for (let t = 0; t < tiers; t++) {
                const th = t === tiers - 1 ? left : snap(left * (0.45 + T.rnd() * 0.2), FLOOR);
                block(list, tw, th, td, x, y, z, ou, ov);
                y += th; left -= th; tw = snap(tw * (0.68 + T.rnd() * 0.12), BAY); td = snap(td * (0.68 + T.rnd() * 0.12), BAY);
                if (left < FLOOR * 2) break;
            }
            const style = T.rnd();
            if (style < 0.4) {
                for (let k = 0; k < 4; k++) lists[3].push(new THREE.BoxGeometry(tw * (1 - k * 0.2), 2.5, td * (1 - k * 0.2)).translate(x, y + k * 2.5 + 1.25, z));
                lists[3].push(new THREE.ConeGeometry(0.7, 20, 8).translate(x, y + 20, z));
            } else if (style < 0.7) {
                const r = Math.min(tw, td) * 0.7;
                lists[3].push(new THREE.ConeGeometry(r, r * 1.5, 4).rotateY(Math.PI / 4).translate(x, y + r * 0.75, z));
            }
        }
    }
    const group = new THREE.Group();
    [...mats, crownMat].forEach((m, i) => {
        if (!lists[i].length) return;
        const mesh = new THREE.Mesh(merge(lists[i]), m); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    });
    return group;
}

export async function buildHall(renderer, M, X) {
    RectAreaLightUniformsLib.init();
    const hall = new THREE.Group();
    const colliders = [];
    const wall = (x0, x1, z0, z1) => colliders.push({ x0, x1, z0, z1 });
    const post = (x, z, r) => colliders.push({ x, z, r });
    const { W, NAVE, L, SPRING, TELLERS } = HALL, HW = W / 2;
    const panes = [];
    const add = (o, x = 0, y = 0, z = 0, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; hall.add(o); return o; };

    const box = (w, h, d, m, x, y, z) => { const b = F.box(hall, w, h, d, m, x, y, z); if (m?.map) worldUV(b); return b; };
    const plane = (w, h, m, x, y, z, rx = 0, ry = 0) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); p.receiveShadow = true; hall.add(p); return p; };
    const lamp = (x, y, z, power = 6, reach = 9, color = '#ffb870') => { const l = new THREE.PointLight(color, power, reach, 2); l.position.set(x, y, z); hall.add(l); return l; };

    const frameMat = new THREE.MeshStandardMaterial({ map: X.windowFrame, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.45 });
    const glassMat = new THREE.MeshStandardMaterial({ color: '#d8e0e4', transparent: true, opacity: 0.07, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    const frames = [];

    const vH = 5.2;

    plane(24, 10, M.verde, 0, 0, 5, -Math.PI / 2).material = new THREE.MeshPhysicalMaterial({ map: T.tex(T.slabFloor('#1c2a25', '#7f9f90'), 24 / 4.8, 10 / 4.8),
        roughness: 0.72, roughnessMap: M.gold.roughnessMap, specularIntensity: 0.45, clearcoat: 0.08, clearcoatRoughness: 0.6, clearcoatRoughnessMap: M.gold.roughnessMap });

    box(26, 0.8, 10.3, new THREE.MeshStandardMaterial({ color: '#15201c', roughness: 0.8 }), 0, vH, 5.15);
    for (const s of [-1, 1]) { box(1, vH + 1.2, 10.3, M.verde, s * 12.5, -0.4, 5.15); wall(s * 12 - (s > 0 ? 0 : 1), s * 12 + (s > 0 ? 1 : 0), 0, 10); }

    const DOOR = 3.2, DOOR_H = 4.4;
    const BAY = 1.6, GATE_W = 1.48, GATE_H = 3.3, GATE_Z = 9.88;
    for (const s of [-1, 1]) { box(12 - DOOR, vH, 0.06, M.black, s * (DOOR + 12) / 2, 0, 9.97); wall(s > 0 ? DOOR : -12, s > 0 ? 12 : -DOOR, 9.9, 10.7); }
    box(DOOR * 2, vH - DOOR_H, 0.06, M.black, 0, DOOR_H, 9.97);
    for (let z = 1; z < 10; z += 2) box(24, 0.3, 0.3, M.goldDull, 0, vH - 0.3, z);
    for (const s of [-1, 1]) { add(F.torchere(M, X.flutes), s * 9, 0, 6); post(s * 9, 6, 0.35); lamp(s * 9, 2.6, 6, 9, 9); }
    for (const z of [2.8, 7.2]) {
        F.cyl(hall, 0.015, 0.6, M.gold, 0, vH - 0.6, z, 8); F.ball(hall, 0.2, M.glow, 0, vH - 0.75, z); F.ring(hall, 0.2, 0.02, M.gold, 0, vH - 0.75, z);
        lamp(0, vH - 1.05, z, 40, 16, '#ffcc88');
    }

    const S = HALL.STREET, FRONT_TOP = S + 28, FRONT_WIN = 7;
    const stone = new THREE.MeshStandardMaterial({ map: T.tex(T.ashlar(), 1, 1), roughness: 0.88, normalMap: M.cream.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) });
    const slabs = T.tex(T.canvas(1024, 1024, (g, w) => {
        g.fillStyle = '#7d766b'; g.fillRect(0, 0, w, w);
        for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${T.rnd() < 0.5 ? '255,250,240' : '20,15,10'},${T.rnd() * 0.07})`; g.fillRect(T.rnd() * w, T.rnd() * w, 3, 3); }
        g.strokeStyle = 'rgba(30,25,20,.55)'; g.lineWidth = 3; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * w / 4, 0); g.lineTo(k * w / 4, w); g.moveTo(0, k * w / 4); g.lineTo(w, k * w / 4); g.stroke(); }
    }, 73), 80 / 6, 13.4 / 6);

    const flags = [];
    { const z1 = ROAD[0] - 0.3, t = slabs.clone(); t.repeat.set(140 / 6, (z1 - 10.6) / 6); t.needsUpdate = true;
      plane(140, z1 - 10.6, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), 0, S, (10.6 + z1) / 2, -Math.PI / 2); }
    box(140, 0.2, 0.3, stone, 0, S - 0.2, ROAD[0] - 0.15);
    plane(200, 90, new THREE.MeshStandardMaterial({ map: T.tex(T.asphalt(), 25, 11), roughness: 0.92 }), 0, S - 0.2, ROAD[0] + 45, -Math.PI / 2);
    for (const s of [-1, 1]) box(0.6, 28, 20.4, stone, s * 30.3, S, 0.4);
    const earth = plane(3000, 3000, hazed(new THREE.MeshStandardMaterial({ color: '#1c1814', roughness: 0.95 })), 0, S - 1.2, 0, -Math.PI / 2);
    const town = city(S - 0.2); hall.add(town);
    const sky = skyDome(); hall.add(sky);
    box(12, -S, 2, stone, 0, S, 11);
    for (let i = 0; i < 8; i++) box(12, -S - 0.18 * (i + 1), 0.42, stone, 0, S, 12.21 + 0.42 * i);
    for (const s of [-1, 1]) {
        box(1, -S + 0.9, 5.4, M.black, s * 6.5, S, 13.1); box(1.1, 0.06, 5.5, M.gold, s * 6.5, 0.9, 13.1);
        wall(s > 0 ? 6 : -7, s > 0 ? 7 : -6, 10.6, 15.8);
        add(F.lampPost(M), s * 7.8, S, 16.8); post(s * 7.8, 16.8, 0.4);
        const l = new THREE.PointLight('#ffc27a', 22, 12, 2); l.position.set(s * 7.8, S + 4.66, 16.8); hall.add(l);
        box(30 - FRONT_WIN, 28, 0.6, stone, s * (30 + FRONT_WIN) / 2, S, 10.3);
        box(FRONT_WIN - DOOR, 8 - S, 0.6, stone, s * (FRONT_WIN + DOOR) / 2, S, 10.3);
        for (let x = 6; x < 30; x += 4.5) box(0.8, 28, 0.4, stone, s * x, S, 10.8);
        wall(s > 0 ? 8.6 : -9.6, s > 0 ? 9.6 : -8.6, 10.6, 22);

        const shut = F.streetGate(M, GATE_W, GATE_H, true, s); shut.position.set(s * (DOOR - 0.01), 0, GATE_Z); shut.rotation.y = s > 0 ? Math.PI : 0; hall.add(shut);
        const open = F.streetGate(M, GATE_W, GATE_H, false, -s); open.position.set(s * (BAY - 0.05), 0, GATE_Z - 0.08); open.rotation.y = s > 0 ? 0 : Math.PI; hall.add(open);
        wall(s > 0 ? BAY - 0.05 : -DOOR, s > 0 ? DOOR : -BAY + 0.05, GATE_Z - 0.16, 10.0);
    }

    for (const x of [-BAY, 0, BAY]) box(0.1, DOOR_H, 0.12, M.goldDull, x, 0, GATE_Z);
    for (const s of [-1, 1]) box(0.06, DOOR_H, 0.12, M.goldDull, s * (DOOR - 0.03), 0, GATE_Z);
    post(0, GATE_Z, 0.08);
    box(DOOR * 2, 0.1, 0.12, M.goldDull, 0, GATE_H + 0.06, GATE_Z); box(DOOR * 2, 0.06, 0.12, M.goldDull, 0, DOOR_H - 0.06, GATE_Z);
    {
        const n = 56, h = DOOR_H - GATE_H - 0.22, bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.014, h, 10), M.goldDull, n), d = new THREE.Object3D();
        for (let k = 0; k < n; k++) { d.position.set(-DOOR + (k + 0.5) * DOOR * 2 / n, GATE_H + 0.16 + h / 2, GATE_Z); d.updateMatrix(); bars.setMatrixAt(k, d.matrix); }
        bars.castShadow = bars.receiveShadow = true; hall.add(bars);
        for (const bx of [-1.5, -0.5, 0.5, 1.5].map(k => k * BAY)) for (let k = 0; k <= 6; k++) {
            for (const dz of [-0.05, 0.05]) {
                const r = F.box(hall, 0.035, 0.7, 0.03, M.gold, 0, 0, 0); r.geometry.translate(0, 0.35, 0);
                r.position.set(bx, GATE_H + 0.16, GATE_Z + dz); r.rotation.z = -Math.PI * 0.4 + k / 6 * Math.PI * 0.8;
            }
        }
    }
    wall(-40, 40, 18.3, 19.1);
    box(DOOR * 2, 8 - DOOR_H - 0.01, 0.6, stone, 0, DOOR_H + 0.01, 10.3);
    box(FRONT_WIN * 2, FRONT_TOP - 22, 0.6, stone, 0, 22, 10.3);
    {
        const fTex = X.windowFrame.clone(); fTex.repeat.set(3, 1); fTex.needsUpdate = true;
        const fr = new THREE.Mesh(new THREE.PlaneGeometry(FRONT_WIN * 2, 14), new THREE.MeshStandardMaterial({ map: fTex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.45 }));
        fr.position.set(0, 15, 10.3); hall.add(fr); frames.push(fr);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(FRONT_WIN * 2, 14), glassMat); gl.position.set(0, 15, 10.33); hall.add(gl); panes.push(gl);
        box(FRONT_WIN * 2 + 0.6, 0.3, 1.0, M.black, 0, 7.7, 10.4); box(FRONT_WIN * 2 + 0.7, 0.06, 1.05, M.gold, 0, 8.0, 10.4);
    }
    for (let k = 0; k < 4; k++) {
        const m = k % 2 ? M.black : M.gold, e = 0.35 * (k + 1);
        box(DOOR * 2 + e * 2, 0.35, 0.3, m, 0, DOOR_H + e - 0.35, 10.7 + k * 0.02);
        for (const s of [-1, 1]) box(0.35, DOOR_H + e - 0.35 - S, 0.3, m, s * (DOOR + e - 0.175), S, 10.7 + k * 0.02);
    }

    {
        const fr = T.carvedFrieze(), ft = T.tex(fr.color, 2.3, 1), fn = T.tex(fr.normal, 2.3, 1, false);
        const band = new THREE.Mesh(new THREE.PlaneGeometry(29, 1.6), new THREE.MeshStandardMaterial({ map: ft, normalMap: fn, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.85 }));
        band.position.set(0, 23.1, 10.62); hall.add(band);
        for (let k = 0; k < 3; k++) box(61 + k * 0.6, 0.35, 0.9 + k * 0.35, k === 1 ? M.goldDull : stone, 0, FRONT_TOP - 1.2 + k * 0.35, 10.3 + k * 0.1);
        const office = T.facade('limestone', 191), om = new THREE.MeshStandardMaterial({ map: T.tex(office.map), emissive: '#ffd49a', emissiveMap: T.tex(office.emissive), emissiveIntensity: 1.3, roughness: 0.8 });
        const offices = (w, h, d, x, y, z) => {
            const geo = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
            for (let i = 0; i < p.count; i++) Math.abs(n.getY(i)) > 0.5 ? uv.setXY(i, 0.01, 0.5) : uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) - (z - d / 2) : p.getX(i) - (x - w / 2)) / T.FACADE_M[0], (p.getY(i) - y) / T.FACADE_M[1]);
            const m = new THREE.Mesh(geo, om); m.castShadow = m.receiveShadow = true; hall.add(m);
        };

        const BACK = 2.2;
        for (const s of [-1, 1]) offices(28.8 - HW, FRONT_TOP + 0.2 - S, 10.0 - BACK, s * (28.8 + HW) / 2, S, (10.0 + BACK) / 2);
        offices(57.6, 6.4, 10.1 - BACK, 0, FRONT_TOP + 0.2, (10.1 + BACK) / 2); offices(38.4, 6.4, 8.6 - BACK, 0, FRONT_TOP + 6.6, (8.6 + BACK) / 2); offices(17.6, 12.8, 7.0 - BACK, 0, FRONT_TOP + 13.0, (7.0 + BACK) / 2);
        let y = FRONT_TOP + 25.8;
        for (let k = 0; k < 5; k++) { box(18 - k * 3.2, 1.3, 5 - k * 0.8, k % 2 ? M.black : M.goldDull, 0, y, 4.6); y += 1.3; }
        F.cyl(hall, 0.12, 14, M.goldDull, 0, y, 4.6, 12, 0.35); F.ball(hall, 0.4, M.glow, 0, y + 14.3, 4.6);

        const banMat = new THREE.MeshStandardMaterial({ map: T.tex(T.banner()), roughness: 0.8, side: THREE.DoubleSide });
        banMat.userData.time = { value: 0 };
        banMat.onBeforeCompile = sh => {
            sh.uniforms.time = banMat.userData.time;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
                    float k = pow(1.0 - uv.y, 1.3);
                    transformed.z += (sin(uv.y * 4.0 - time * 1.9 + uv.x * 2.2) * 0.14 + sin(uv.y * 9.0 + uv.x * 5.0 - time * 3.1) * 0.035) * k;`);
        };
        for (const s of [-1, 1]) {
            const x = s * 9.6;
            const pole = F.cyl(hall, 0.05, 2.6, M.gold, 0, 0, 0, 10); pole.position.set(x, 22.1, 11.9); pole.rotation.x = Math.PI / 2;
            F.ball(hall, 0.09, M.gold, x, 22.1, 13.25);
            const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.6, 24, 8), banMat); fl.position.set(x, 20.3, 12.05); fl.rotation.y = -Math.PI / 2; hall.add(fl); flags.push(fl);
            const lan = F.sconce(M); lan.position.set(s * 5.2, 4.2 + S * 0, 10.62); hall.add(lan);
            lamp(s * 5.2, 4.3, 11.0, 4, 8, '#ffc98a');
        }
    }

    const walkers = footShadows(S, 16, [17.45, 3.6]);
    hall.add(walkers.group);

    const doors = [];
    for (const x of [-5, 0, 5]) {
        const d = add(F.revolvingDoor(M), x, 0, 0); doors.push({ x, z: 0, wings: d.userData.wings, angle: 0, inside: false });
        post(x, 0, 0.12);
        for (const s of [-1, 1]) wall(x + s * 1.25 - 0.15, x + s * 1.25 + 0.15, -1.1, 1.1);
    }
    const gaps = [-6.45, -3.55, -1.45, 1.45, 3.55, 6.45];
    const piers = [[-HW, gaps[0]], [gaps[1], gaps[2]], [gaps[3], gaps[4]], [gaps[5], HW]];
    for (const [x0, x1] of piers) { box(x1 - x0, 3.2, 0.8, M.black, (x0 + x1) / 2, 0, 0); wall(x0, x1, -0.4, 0.4); }
    box(W, 0.3, 0.9, M.gold, 0, 3.2, 0);
    for (let k = 0; k < 6; k++) box(W - k * 1.2, 0.5, 0.7 - k * 0.05, k % 2 ? M.black : M.gold, 0, 3.5 + k * 0.5, 0);
    box(W, 3.4, 0.4, M.cream, 0, 3.2, 0);

    const tTex = X.windowFrame.clone(); tTex.repeat.set(5, 1); tTex.needsUpdate = true;
    const transom = new THREE.Mesh(new THREE.PlaneGeometry(22, 8), new THREE.MeshStandardMaterial({ map: tTex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.45 }));
    transom.position.set(0, 10.5, 0); hall.add(transom);
    { const gl = new THREE.Mesh(new THREE.PlaneGeometry(22, 8), glassMat); gl.position.set(0, 10.5, 0.03); hall.add(gl); panes.push(gl); }
    for (const s of [-1, 1]) box(7, 8, 0.8, M.cream, s * 14.5, 6.5, 0);
    box(W, 24, 0.8, M.cream, 0, 14.5, 0);

    for (const s of [-1, 1]) box(1, 21, 10.2, M.cream, s * 11.5, 5.8, 5.2);
    box(24, 0.8, 11, M.cream, 0, FRONT_TOP, 5.2);
    box(22, 0.1, 9.6, M.black, 0, 6.0, 5.2);

    const floorTex = T.tex(T.floor(), 1, L / 18);

    const floorWear = M.gold.roughnessMap.clone(); floorWear.repeat.set(9, 22); floorWear.needsUpdate = true;
    const floor = plane(W, L, new THREE.MeshPhysicalMaterial({ map: floorTex, roughness: 0.75, roughnessMap: floorWear, clearcoat: 0.35, clearcoatRoughness: 0.4, clearcoatRoughnessMap: floorWear }), 0, 0, -L / 2, -Math.PI / 2);
    floor.receiveShadow = true;
    const MZ0 = -20, MZ1 = TELLERS, ML = MZ0 - MZ1, MC = (MZ0 + MZ1) / 2, MTOP = 9.7;
    for (const s of [-1, 1]) {
        const x = s * HW;
        box(1, 10.3, L + 1, M.cream, x + s * 0.5, -0.5, -L / 2);
        wall(s > 0 ? x : x - 1, s > 0 ? x + 1 : x, -L, 0);

        let z = 0.4;
        for (const wz of WINDOW_Z) {
            box(0.6, 20.8, z - (wz + 2), M.cream, x + s * 0.3, 9.6, (z + wz + 2) / 2);
            box(0.6, 2.4, 4, M.cream, x + s * 0.3, 9.6, wz); box(0.6, 4.4, 4, M.cream, x + s * 0.3, 26, wz);
            const fr = new THREE.Mesh(new THREE.PlaneGeometry(4, 14), frameMat); fr.position.set(x + s * 0.3, 19, wz); fr.rotation.y = -s * Math.PI / 2; hall.add(fr); frames.push(fr);
            const glass = new THREE.Mesh(new THREE.PlaneGeometry(4, 14), glassMat); glass.position.set(x + s * 0.32, 19, wz); glass.rotation.y = -s * Math.PI / 2; hall.add(glass); panes.push(glass);
            z = wz - 2;
        }
        box(0.6, 20.8, z + L + 0.5, M.cream, x + s * 0.3, 9.6, (z - L - 0.5) / 2);

        const mx = s * (NAVE + (HW - NAVE) / 2);
        box(HW - NAVE + 0.4, 0.7, ML, M.black, mx, 9.0, MC);
        box(0.12, 0.12, ML, M.gold, s * (NAVE - 0.1), 8.96, MC);
        box(0.1, 0.08, ML, M.gold, s * (NAVE - 0.1), 10.7, MC);
        const across = HW - NAVE - STAIR_W;
        box(across, 0.08, 0.1, M.gold, s * (NAVE - 0.1 + across / 2), 10.7, MZ0 + 0.05);
        box(across, 0.12, 0.12, M.gold, s * (NAVE - 0.1 + across / 2), 8.96, MZ0 + 0.05);
        const bal = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.05, 1.0, 10), M.gold, 320), d = new THREE.Object3D();
        let n = 0;
        for (let bz = MZ0; bz > MZ1 && n < 320; bz -= 0.25) { d.position.set(s * (NAVE - 0.1), 10.2, bz); d.updateMatrix(); bal.setMatrixAt(n++, d.matrix); }
        for (let bx = 0.25; bx < across && n < 320; bx += 0.25) { d.position.set(s * (NAVE - 0.1 + bx), 10.2, MZ0 + 0.05); d.updateMatrix(); bal.setMatrixAt(n++, d.matrix); }
        bal.count = n; bal.castShadow = true; hall.add(bal);
        plane(HW - NAVE, ML, new THREE.MeshStandardMaterial({ color: '#d9ccb0', roughness: 0.9 }), mx, 8.99, MC, Math.PI / 2);

        box(HW + 0.6 - 10.95, 8.6, L + 1, M.cream, s * (10.95 + HW + 0.6) / 2, 30, -L / 2);

        for (const oz of [-27, -45, -63]) { const o = F.officeDoor(M, X.office); o.position.set(s * (HW - 0.1), MTOP, oz); o.rotation.y = -s * Math.PI / 2; hall.add(o); }

        box(1.4, 2.0, L, M.black, s * NAVE, 23, -L / 2);
        const fr = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.1), new THREE.MeshStandardMaterial({ map: T.tex(T.frieze(), L / 4, 1), metalness: 0.6, roughness: 0.35 }));
        fr.position.set(s * (NAVE - 0.71), 24, -L / 2); fr.rotation.y = s * -Math.PI / 2; hall.add(fr);
        for (let k = 0; k < 3; k++) box(1.6 + k * 0.3, 0.25, L, k % 2 ? M.black : M.gold, s * NAVE, SPRING + k * 0.25 - 0.75, -L / 2);
    }

    box(W + 2, 40, 1, M.cream, 0, -1, -L - 0.5);
    box(W + 2, 1, L + 2, M.cream, 0, 38, -L / 2);

    {
        const Z0 = -3.5, N = 56, run = (Z0 - MZ0) / N, rise = MTOP / N, len = Math.hypot(Z0 - MZ0, MTOP), tilt = Math.atan2(MTOP, Z0 - MZ0);
        for (const s of [-1, 1]) {
            const cx = s * (HW - STAIR_W / 2), inner = s * (HW - STAIR_W);
            const treads = [], noses = [];
            for (let i = 0; i < N; i++) {
                const top = (i + 1) * rise;
                treads.push(new THREE.BoxGeometry(STAIR_W, top, run).translate(cx, top / 2, Z0 - (i + 0.5) * run));
                noses.push(new THREE.BoxGeometry(STAIR_W, 0.03, 0.05).translate(cx, top - 0.015, Z0 - i * run - 0.025));
            }
            const flight = new THREE.Mesh(merge(treads), M.black); flight.castShadow = flight.receiveShadow = true; hall.add(flight);
            const nose = new THREE.Mesh(merge(noses), M.gold); nose.castShadow = true; hall.add(nose);
            const midZ = (Z0 + MZ0) / 2, midY = MTOP / 2;
            const para = F.box(hall, 0.22, 1.0, len, M.black, inner - s * 0.11, 0, 0); para.position.set(inner - s * 0.11, midY + 0.45, midZ); para.rotation.x = tilt;
            const rail = F.cyl(hall, 0.05, len, M.gold, 0, 0, 0, 16); rail.position.set(inner - s * 0.11, midY + 1.0, midZ); rail.rotation.x = tilt + Math.PI / 2;
            box(0.5, 1.3, 0.5, M.black, inner - s * 0.11, 0, Z0 + 0.1);
            F.cyl(hall, 0.12, 0.1, M.gold, inner - s * 0.11, 1.3, Z0 + 0.1); F.cyl(hall, 0.03, 0.45, M.gold, inner - s * 0.11, 1.4, Z0 + 0.1, 12);
            F.ball(hall, 0.17, M.glow, inner - s * 0.11, 2.0, Z0 + 0.1);
            lamp(inner - s * 0.4, 2.0, Z0 + 0.4, 6, 10);
            const sc = F.sconce(M); sc.position.set(s * (HW - 0.05), midY + 2.6, midZ); sc.rotation.y = -s * Math.PI / 2; hall.add(sc);
            lamp(s * (HW - 0.45), midY + 2.7, midZ, 5, 10, '#ffc98a');
            const rope = F.stanchion(M, STAIR_W - 0.4); rope.position.set(s > 0 ? inner + 0.2 : -HW + 0.2, 0, Z0 + 0.8); hall.add(rope);

            wall(Math.min(inner - s * 0.3, s * HW), Math.max(inner - s * 0.3, s * HW), MZ0, Z0 + 1.6);
        }
    }
    wall(-HW, HW, -L - 1, -L);
    const great = F.mural(M, T.tex(T.mural('crown', 1536, 1228, 77)), 20, 16);
    add(great, 0, 7.5, -L + 0.05);

    const vt = vaultTextures();
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(NAVE, NAVE, L, 96, 1, true, Math.PI / 2, Math.PI),
        new THREE.MeshStandardMaterial({ map: vt.map, emissive: '#ffe7b8', emissiveMap: vt.emissive, emissiveIntensity: 0.22, roughness: 0.7, metalness: 0.1, side: THREE.BackSide }));
    vault.rotation.x = Math.PI / 2; vault.position.set(0, SPRING, -L / 2); hall.add(vault);
    const lay = new THREE.RectAreaLight('#ffcf94', 0.5, 3, L - 6); lay.position.set(0, SPRING + NAVE - 0.3, -L / 2); lay.rotation.x = -Math.PI / 2; hall.add(lay);

    const flutes = new THREE.MeshPhysicalMaterial({ map: M.black.map, normalMap: X.flutes, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.6, roughnessMap: M.black.roughnessMap, clearcoat: 0.25, clearcoatRoughness: 0.35 });
    flutes.onBeforeCompile = M.black.onBeforeCompile;
    for (const s of [-1, 1]) for (const z of COLS_Z) {
        const x = s * NAVE;
        let y = 0;
        for (const [w, h, m] of [[2.8, 0.25, M.gold], [2.6, 0.9, M.verde], [2.3, 0.2, M.gold]]) { box(w, h, w, m, x, y, z); y += h; }
        F.cyl(hall, 1.0, 21 - y, flutes, x, y, z, 48, 1.08);
        y = 21;
        for (const [w, h, m] of [[2.2, 0.3, M.gold], [2.5, 0.5, M.black], [2.8, 0.4, M.gold], [3.1, 0.8, M.black]]) { box(w, h, w, m, x, y, z); y += h; }
        post(x, z, 1.45);

        const sc = F.sconce(M); sc.position.set(x - s * 1.05, 4.2, z); sc.rotation.y = -s * Math.PI / 2; hall.add(sc);
        lamp(x - s * 1.45, 4.3, z, 3, 7, '#ffc98a');
    }

    for (const z of COLS_Z) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(NAVE - 0.25, 0.3, 10, 96, Math.PI), M.black); rib.position.set(0, SPRING, z); rib.scale.z = 2.2; hall.add(rib);
        for (const dz of [-0.72, 0.72]) { const f = new THREE.Mesh(new THREE.TorusGeometry(NAVE - 0.4, 0.06, 6, 96, Math.PI), M.gold); f.position.set(0, SPRING, z + dz); hall.add(f); }
    }
    for (const s of [-1, 1]) {
        box(0.1, 0.7, -TELLERS, M.black, s * (HW - 0.05), 0, TELLERS / 2); box(0.14, 0.05, -TELLERS, M.gold, s * (HW - 0.07), 0.7, TELLERS / 2);
        box(0.35, 0.4, ML, M.black, s * (HW - 0.175), 8.6, MC); box(0.42, 0.05, ML, M.gold, s * (HW - 0.21), 8.55, MC);
        for (const z of COLS_Z.filter(z => z < MZ0 - 1)) {
            box(0.45, 9.0, 1.3, M.black, s * (HW - 0.225), 0, z);
            box(0.62, 0.3, 1.5, M.gold, s * (HW - 0.31), 0, z); box(0.62, 0.3, 1.5, M.gold, s * (HW - 0.31), 8.25, z);
        }
        COLS_Z.forEach((z, i) => {
            const gp = F.guardianPanel(M, X.guardians[['halo', 'wings', 'sword'][(i + (s > 0 ? 1 : 0)) % 3]]);
            gp.position.set(s * HW, 13.3, z); gp.rotation.y = -s * Math.PI / 2; hall.add(gp);
        });
    }
    {
        const burst = new THREE.Group(); burst.position.set(0, 15.1, -0.42); burst.rotation.y = Math.PI; hall.add(burst);
        for (let k = 0; k <= 22; k++) {
            const len = k % 2 ? 5.5 : 8.5, r = F.box(burst, k % 2 ? 0.28 : 0.4, len, 0.12, k % 2 ? M.black : M.gold, 0, 0, 0);
            r.geometry.translate(0, len / 2 + 1.9, 0); r.position.set(0, 0, k % 2 ? -0.015 : 0); r.rotation.z = -Math.PI * 0.44 + k / 22 * Math.PI * 0.88;
        }
        F.put(burst, new THREE.CircleGeometry(1.8, 48, 0, Math.PI), M.gold, 0, 0, 0.05);
        F.ring(burst, 1.8, 0.07, M.black, 0, 0, 0.08, false);
    }

    const kinds = ['sun', 'wings', 'industry', 'fountain', 'aviation', 'stars', 'bridge', 'commerce'];
    let mi = 0;
    for (const s of [-1, 1]) for (let b = 1; b < COLS_Z.length - 1; b++) {
        const z = (COLS_Z[b] + COLS_Z[b + 1]) / 2;
        add(F.mural(M, X.murals[kinds[mi++ % kinds.length]], 5, 7.4), s * (HW - 0.06), 0.9, z, -s * Math.PI / 2);
        add(F.bench(M), s * (HW - 1.8), 0, z, -s * Math.PI / 2); wall(s * (HW - 1.8) - 0.4, s * (HW - 1.8) + 0.4, z - 1.3, z + 1.3);
        const tz = z - 3.3;
        add(F.torchere(M, X.flutes), s * (HW - 0.8), 0, tz); post(s * (HW - 0.8), tz, 0.35);
        lamp(s * (HW - 0.8), 2.6, tz, 8.5, 10);
    }

    for (const z of [-24, -60]) { add(F.writingDesk(M), 0, 0, z, Math.PI / 2); wall(-0.6, 0.6, z - 1.5, z + 1.5); for (const dz of [-4.4, 4.4]) { add(F.slipStand(M), 0, 0, z + dz, dz > 0 ? 0 : Math.PI); post(0, z + dz, 0.3); } }

    const clock = add(F.clockTower(M, X.face), 0, 0, -42); wall(-1.75, 1.75, -43.75, -40.25);
    lamp(0, 4.7, -41.85, 4, 4, '#ffd9a0');
    const palms = [];
    [[-8.5, -3], [8.5, -3], [-8.5, -75], [8.5, -75]].forEach(([x, z], i) => { const u = add(F.urn(M, null, i + 3), x, 0, z, i * 1.3); palms.push(u.userData.palm); post(x, z, 0.45); });
    const chandeliers = [];
    for (const z of [-15, -33, -51, -69]) {
        const top = SPRING + NAVE - 0.3, drop = 14;
        const c = F.chandelier(M, drop, 2.4); c.position.set(0, top - drop, z); hall.add(c);
        const l = new THREE.PointLight('#ffc27a', 120, 26, 2); l.position.set(0, top - drop - 2, z); hall.add(l);
        chandeliers.push(c);
    }

    const plaques = [];

    const BLIND = { 1: 2.2, 2: 2.2, 3: 1.1, 7: 1.1, 8: 2.2, 9: 2.2 }, CLOSED = [8, 9];
    for (let i = 0; i < 9; i++) {
        const x = -9.6 + i * 2.4;
        add(F.tellerWindow(M, i + 1, null), x, 0, TELLERS);
        if (BLIND[i + 1]) add(F.windowBlind(M, BLIND[i + 1], CLOSED.includes(i + 1)), x, 0, TELLERS);
        if (F.hasEraFont()) {
            const pm = new THREE.MeshStandardMaterial({ color: '#c49a4c', metalness: 1, roughness: 0.38, emissive: '#ffc870', emissiveIntensity: 0 }); pm.userData = { on: 1.3, off: 0 };
            const p = F.plaque3d(M, [[String(i + 1), 0.22]], { w: 0.8, h: 0.4, letterMat: pm }); p.position.set(x, 4.0, TELLERS + 0.6); hall.add(p); plaques.push(pm);
            continue;
        }
        const pm = new THREE.MeshStandardMaterial({ map: X.num(i + 1), emissive: '#ffffff', emissiveMap: X.num(i + 1), emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.3 });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), pm); p.position.set(x, 4.0, TELLERS + 0.6); hall.add(p); plaques.push(pm);
        F.box(hall, 0.88, 0.48, 0.04, M.gold, x, 3.76, TELLERS + 0.57);
    }
    for (const s of [-1, 1]) box(1.1, 4.6, 1.0, M.black, s * 11.3, 0, TELLERS);
    wall(-HW, HW, TELLERS - 0.5, TELLERS + 0.5);

    for (const s of [-1, 1]) {
        const x0 = 11.85, mid = s * (x0 + HW) / 2;
        box(HW - x0, 9.0, 0.8, M.black, mid, 0, TELLERS); box(HW - x0, 21.5, 0.8, M.cream, mid, 9.0, TELLERS);
        box(HW - x0 + 0.03, 0.2, 0.9, M.gold, mid - s * 0.015, 9.0, TELLERS);
        const d = F.staffDoor(M, X.staff); d.position.set(s * 14.9, 0, TELLERS + 0.42); hall.add(d);
        const sc = F.sconce(M); sc.position.set(s * 14.9, 4.2, TELLERS + 0.42); hall.add(sc);
        lamp(s * 14.9, 4.3, TELLERS + 0.8, 3, 7, '#ffc98a');
    }
    plane(23, 10, M.black, 0, 0.01, TELLERS - 5, -Math.PI / 2);
    box(W, 0.9, 1.1, M.black, 0, 3.55, TELLERS);
    const fz = new THREE.Mesh(new THREE.PlaneGeometry(23, 0.8), new THREE.MeshStandardMaterial({ map: T.tex(T.frieze(), 6, 1), metalness: 0.6, roughness: 0.35 }));
    fz.position.set(0, 4.0, TELLERS + 0.56); hall.add(fz);

    const board = F.flapBoard(M, X.flaps); board.position.set(0, 4.55, TELLERS + 0.62); hall.add(board);
    const queue = { number: 412, window: 5 };
    board.userData.show(queue); board.userData.snap();
    let boardAt = 6;

    const boardCtl = {
        speed: 0.5, auto: true, queue,
        show() { board.userData.show(queue); plaques.forEach((m, i) => m.emissiveIntensity = i + 1 === queue.window ? (m.userData.on ?? 1.6) : (m.userData.off ?? 0.3)); },
        call(number, win) { queue.number = number % 10000; queue.window = win; this.show(); },

        staffed: [4, 5, 6], served: 5,
        windowX: n => -9.6 + (n - 1) * 2.4,
        next() { queue.number = (queue.number + 1) % 10000; queue.window = this.staffed[Math.floor(Math.random() * this.staffed.length)]; this.show(); },
        jump() { queue.number = (queue.number + 5555) % 10000; this.show(); },
        random() { queue.number = Math.floor(Math.random() * 10000); queue.window = 1 + Math.floor(Math.random() * 9); this.show(); },
        window() { queue.window = queue.window % 9 + 1; this.show(); },
    };
    boardCtl.show();

    const woman = F.womanInRed(F.WOMAN_STYLES.B); woman.position.set(boardCtl.windowX(boardCtl.served) + 0.42, 0, TELLERS - 0.58); woman.rotation.y = Math.PI; hall.add(woman);
    lamp(woman.position.x - 0.2, 2.4, TELLERS - 0.25, 2.2, 2.6, '#ffd2a0');

    const ticketAt = new THREE.Vector3(2.5, 0, TELLERS + 11.6);
    add(F.ticketMachine(M, X.take), ticketAt.x, 0, ticketAt.z, -0.3); post(ticketAt.x, ticketAt.z, 0.35);

    const BZ = (TELLERS - 0.5 - L) / 2, BD = L + TELLERS - 0.5;
    for (const s of [-1, 1]) {
        box(0.55, 3.0, BD + 0.2, M.black, s * 11.6, 0, BZ); box(0.5, 20, BD + 0.2, M.cream, s * 11.6, 3.0, BZ);
        const od = F.officeDoor(M, X.office); od.position.set(s * 11.3, 0, -84); od.rotation.y = -s * Math.PI / 2; hall.add(od);
        for (const z of [-79.7, -80.25, -80.8, -81.35, -85.4, -85.95, -86.5, -87.05]) { const fc = F.filingCabinet(M); fc.position.set(s * 10.95, 0, z); fc.rotation.y = -s * Math.PI / 2; hall.add(fc); }
        for (const dz of [0, 0.14]) {
            F.cyl(hall, 0.05, 8.2, M.goldDull, s * 11.22, 0.9, -79.25 - dz, 16);
            for (let y = 1.5; y < 9; y += 1.5) F.cyl(hall, 0.07, 0.06, M.gold, s * 11.22, y, -79.25 - dz, 16);
        }
        const run = F.cyl(hall, 0.05, BD - 1, M.goldDull, 0, 0, 0, 16); run.rotation.x = Math.PI / 2; run.position.set(s * 11.22, 9.1, BZ - 0.2);
    }
    for (const [x0, x1] of [[-10.9, -5.6], [-4.0, 4.0], [5.6, 10.9]]) add(F.backCounter(M, x1 - x0), (x0 + x1) / 2, 0, -79.9);

    const clerks = [], desks = [[-5.4, -82.6], [-2, -82.6], [2, -82.6], [5.4, -82.6], [-2, -85.2], [2, -85.2]];
    desks.forEach(([x, z], i) => {
        const typing = i !== 4;
        add(F.clerkDesk(M, { typing, phone: i % 2 === 0 || !typing, ledger: !typing || i === 3 }), x, 0, z);
        lamp(x + 0.42, 1.02, z + 0.25, 1.4, 3.5, '#ffe2b0');
        const c = F.clerkFigure(i, typing); c.position.set(x, 0, z - 0.72); hall.add(c); clerks.push(c);
    });
    const vdepth = -L + 0.02;
    add(F.depositWall(M, X.deposit, 7, 2.6), 0.7, 0, vdepth);
    const wallClocks = [-1.5, 2.9].map(x => { const c = F.wallClock(M, X.face, 0.3); c.position.set(x, 3.95, vdepth + 0.06); hall.add(c); return c; });
    add(F.coatStand(M), 9.4, 0, -87.4);
    plane(1.8, 6.4, new THREE.MeshStandardMaterial({ color: '#3a1012', roughness: 1 }), 0, 0.012, -84.2, -Math.PI / 2);

    const R = T.rnd;
    const drop = (o, x, z, ry = R() * 6.283, y = 0) => { o.position.set(x, y, z); o.rotation.y = ry; hall.add(o); return o; };

    const litter = (x, z, r, n, { balls = 0, butts = 0, rmin = 0, w = 0, d: dd = 0, small = false } = {}) => {
        for (let i = 0; i < n + balls + butts; i++) {
            const a = R() * 6.283, d = Math.sqrt(rmin * rmin + R() * (r * r - rmin * rmin));
            const px = w ? x + (R() - 0.5) * w : x + Math.cos(a) * d, pz = dd ? z + (R() - 0.5) * dd : z + Math.sin(a) * d;
            if (i < n) drop(small ? F.droppedSheet(M, 0.05 + R() * 0.02, 0.035 + R() * 0.01) : F.droppedSheet(M, 0.14 + R() * 0.07, 0.08 + R() * 0.04), px, pz);
            else if (i < n + balls) { const b = F.crumple(M, 0.035 + R() * 0.02); b.position.y = 0.03; drop(new THREE.Group().add(b), px, pz); }
            else drop(F.cigarette(M), px, pz);
        }
    };

    add(F.infoDesk(M), 0, 0, -10); post(0, -10.3, 1.45);
    add(F.noticeStand(M, X.notice), 2.7, 0, -8.4, -0.45); post(2.7, -8.4, 0.3);
    add(F.ashStand(M), -2.3, 0, -8.6); post(-2.3, -8.6, 0.25); litter(-2.3, -8.6, 0.7, 0, { butts: 4, rmin: 0.3 });
    add(F.wastebasket(M, 1), -1.1, 0, -10.75);

    for (const z of [-24, -60]) {
        for (const s of [-1, 1]) {
            add(F.wastebasket(M, 2 + (s > 0 ? 1 : 0)), s * 0.95, 0, z + s * 0.9); post(s * 0.95, z + s * 0.9, 0.2);
            litter(s * 0.8, z, 0, 4, { w: 0.45, d: 2.8 });
            litter(s * 0.95, z + s * 0.9, 0.45, 0, { balls: 1, rmin: 0.22 });
            litter(0, z + s * 4.4, 0.6, 1, { rmin: 0.32 });
        }
    }
    litter(0, -71.2, 0, 4, { butts: 3, w: 1.8, d: 8.2, small: true });
    litter(2.5, -66.4, 0.6, 2, { rmin: 0.3, small: true });

    for (const s of [-1, 1]) for (const z of [-36, -54]) {
        const x = s * 8.2;
        add(F.clubChair(M), x, 0, z - 1.15, 0.12 * s); add(F.clubChair(M), x, 0, z + 1.15, Math.PI - 0.1 * s); add(F.lowTable(M), x, 0, z, Math.PI / 2);
        add(F.ashStand(M), x + s * 1.2, 0, z + 0.3); litter(x + s * 1.2, z + 0.3, 0.7, 0, { butts: 3, rmin: 0.3 });
        wall(x - 0.6, x + 0.6, z - 1.7, z + 1.7); post(x + s * 1.2, z + 0.3, 0.25);
        if (z === -54) drop(F.newspaper(M, true), x - s * 1.1, z - 0.2, s * 0.4);
    }

    for (const s of [-1, 1]) for (let b = 1; b < COLS_Z.length - 1; b++) {
        const z = (COLS_Z[b] + COLS_Z[b + 1]) / 2, away = 1;
        add(F.ashStand(M), s * (HW - 1.55), 0, z + away * 1.75); post(s * (HW - 1.55), z + away * 1.75, 0.25);
        litter(s * (HW - 1.55), z + away * 1.75, 0.75, 0, { butts: 2 + Math.floor(R() * 3), rmin: 0.3 });
        if (b % 3 === 0) add(F.spittoon(M), s * (HW - 1.0), 0, z + away * 2.2);
        if (b > 1) { add(F.radiator(M, 1.0), s * (HW - 0.3), 0, z + away * 3.3, -s * Math.PI / 2); wall(s > 0 ? HW - 0.45 : -HW, s > 0 ? HW : -HW + 0.45, z + away * 3.3 - 0.55, z + away * 3.3 + 0.55); }
        if (b === 2) drop(F.newspaper(M), s * (HW - 1.8), z - 0.3, s * 0.3 + 1.2, 0.54);
        if (R() < 0.45) litter(s * (HW - 2.3), z, 0.7, 1);
    }

    const BOOTHS = { [-1]: [[0.05, 0, 1, 0], [1.0, 1, 1, 0], [0.45, 0, 0, 0], [0.12, 0, 1, 1], [0.8, 0, 1, 0]], [1]: [[0.9, 0, 1, 0], [0.3, 0, 1, 2], [0.03, 0, 0, 0], [0.65, 1, 1, 0], [1.0, 0, 1, 0]] };
    const dangles = [];
    for (const s of [-1, 1]) {
        BOOTHS[s].forEach(([door, dangle, lit, coins], i) => {
            const b = add(F.phoneBooth(M, null, { door, dangle: !!dangle, lit: !!lit, coins }), s * 11.45, 0, 1.3 + i * 1.05, -s * Math.PI / 2);
            if (b.userData.dangle) dangles.push(b.userData.dangle);
        });
        for (const z of [2.35, 4.45]) lamp(s * 11.2, 2.0, z, 3, 4, '#ffd9a0');
        wall(s > 0 ? 10.9 : -12, s > 0 ? 12 : -10.9, 0.8, 6.0);
        add(F.radiator(M, 1.2), s * 11.75, 0, 7.6, -s * Math.PI / 2);
        add(F.ashStand(M), s * 8.3, 0, 2.6); post(s * 8.3, 2.6, 0.25); litter(s * 8.3, 2.6, 0.8, 0, { butts: 4, rmin: 0.3 });
        add(F.umbrellaStand(M), s * 3.9, 0, 9.35); post(s * 3.9, 9.35, 0.2);
        add(F.mailChute(M), s * 12.6, 0, -0.42, Math.PI); post(s * 12.6, -0.65, 0.3);
    }
    add(F.doorMat(M, 6.2, 1.6), 0, 0, 9.0);
    for (const x of [-5, 0, 5]) for (const z of [1.95, -1.95]) add(F.doorMat(M, 2.6, 1.2), x, 0, z);
    litter(0, 10.95, 0, 0, { butts: 6, w: 5.8, d: 0.6 });
    for (const s of [-1, 1]) litter(s * 10.5, 3.4, 0, 1, { butts: 1, w: 0.4, d: 4.2, small: true });

    for (const s of [-1, 1]) { add(F.drinkingFountain(M), s * 12.9, 0, TELLERS + 0.42); add(F.fireCabinet(M), s * 17.0, 0, TELLERS + 0.42); }
    add(F.janitorCart(M), 17.4, 0, TELLERS + 3.4, 1.2); post(17.4, TELLERS + 3.4, 0.45);

    desks.forEach(([x, z]) => { add(F.wastebasket(M, 1 + Math.floor(R() * 3)), x + 0.95, 0, z - 0.3); litter(x + 0.95, z - 0.3, 0.4, 1, { balls: 1, rmin: 0.22 }); });
    const vd = F.vaultDoor(M); vd.position.set(-6.5, 2.8, -L + 0.6); hall.add(vd);
    add(F.elevator(M, X.fan), 6.5, 0, -L + 0.3);
    for (let k = 0; k < 4; k++) {
        const st = F.stanchion(M, 2.2); st.position.set(-1.1, 0, TELLERS + 2.5 + k * 2.2); st.rotation.y = Math.PI / 2; hall.add(st);
        const st2 = F.stanchion(M, 2.2); st2.position.set(1.1, 0, TELLERS + 2.5 + k * 2.2); st2.rotation.y = Math.PI / 2; hall.add(st2);
    }
    for (const x of [-4.8, 0]) {
        const l = new THREE.PointLight('#ffe0b0', 25, 8, 2); l.position.set(x, 3.0, TELLERS - 1.6); hall.add(l);
        F.cyl(hall, 0.02, 0.8, M.gold, x, 2.6, TELLERS - 1.6, 8); F.ball(hall, 0.14, M.glow, x, 2.55, TELLERS - 1.6);
    }
    const back = new THREE.PointLight('#ffd49a', 12, 16, 2); back.position.set(0, 4.5, TELLERS - 8); hall.add(back);
    const tl = new THREE.SpotLight('#fff0d8', 260, 30, 0.6, 0.6, 2); tl.position.set(0, 12, TELLERS + 10); tl.target.position.set(0, 2, TELLERS); hall.add(tl, tl.target);
    for (const x of [-7, 7]) { const up = new THREE.SpotLight('#ffc98a', 450, 40, 0.5, 0.8, 2); up.position.set(x, 6, -L + 10); up.target.position.set(0, 16, -L); hall.add(up, up.target); }

    const SUN_POWER = 11, sun = new THREE.DirectionalLight('#ffa552', SUN_POWER);
    sun.position.copy(SUN_AT).addScaledVector(SUN, -SUN_DIST); sun.target.position.copy(SUN_AT);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -SUN_SIZE, right: SUN_SIZE, top: SUN_SIZE, bottom: -SUN_SIZE, near: SUN_NEAR, far: SUN_FAR });
    sun.shadow.bias = -0.0004 * 240 / (SUN_FAR - SUN_NEAR); sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
    hall.add(sun, sun.target);
    hall.add(new THREE.HemisphereLight('#7a6a8c', '#1c1209', 0.1));

    const motes = dust(); motes.frustumCulled = false; hall.add(motes);

    const man = F.silhouetteMan(); man.position.set(-(NAVE - 0.1) - 0.42, MTOP, -22.5); man.rotation.y = Math.PI / 2; hall.add(man);

    hall.traverse(o => { if (o.isMesh && o.castShadow === false && !(o.material?.transparent)) o.castShadow = true; if (o.isMesh) o.receiveShadow = true; });
    for (const o of [floor, vault, ...panes, sky, earth, ...flags]) o.castShadow = false;

    bake(hall, [clock, man, woman, walkers.group, sky, earth, town, transom, ...frames, ...panes, ...chandeliers, ...doors.map(d => d.wings), ...clerks, ...wallClocks, board, ...flags, ...dangles, ...palms]);
    bake(clock, clock.userData.moving); bake(man, man.userData.moving); bake(woman, woman.userData.moving);
    for (const c of clerks) bake(c, [c.userData.head, ...c.children.filter(o => o.isGroup)]);
    for (const c of wallClocks) bake(c, c.userData.moving);
    bake(board, board.userData.cells.flatMap(c => [c.sTop, c.sBot, c.pivot]));

    const airy = [motes, walkers.group, man.userData.smoke, woman.userData.smoke, sky, ...flags];

    const glassy = new Set([M.glass, M.armor, M.pane, glassMat]);
    hall.traverse(o => { if (o.isMesh && glassy.has(o.material)) airy.push(o); });

    function sunDepth(renderer, size = 2048) {
        const cam = new THREE.OrthographicCamera(-SUN_SIZE, SUN_SIZE, SUN_SIZE, -SUN_SIZE, SUN_NEAR, SUN_FAR);
        cam.position.copy(sun.position); cam.lookAt(SUN_AT); cam.updateMatrixWorld();
        const rt = new THREE.WebGLRenderTarget(size, size, { depthTexture: new THREE.DepthTexture(size, size, THREE.FloatType) });
        const hide = [...airy, ...panes, ...frames, transom], was = hide.map(o => o.visible);
        hide.forEach(o => o.visible = false);
        const scene = hall.parent, bg = scene.background, fog = scene.fog;
        scene.background = null; scene.fog = null;
        scene.overrideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(null);
        scene.overrideMaterial = null; scene.background = bg; scene.fog = fog;
        hide.forEach((o, i) => o.visible = was[i]);
        const matrix = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        const u = motes.material.uniforms; u.tLight.value = rt.depthTexture; u.lightMat.value.copy(matrix); u.ready.value = 1;
        return { texture: rt.depthTexture, matrix };
    }

    const LAMP_POOL = 32;
    hall.updateMatrixWorld(true);
    const lamps = [];
    hall.traverse(o => { if (o.isPointLight) lamps.push({ light: o, world: o.getWorldPosition(new THREE.Vector3()), color: o.color.clone(), power: o.intensity, reach: o.distance, decay: o.decay, score: 0 }); });
    for (const l of lamps) { l.light.removeFromParent(); l.local = hall.worldToLocal(l.world.clone()); }
    const pool = Array.from({ length: Math.min(LAMP_POOL, lamps.length) }, () => { const l = new THREE.PointLight('#ffffff', 0, 1, 2); hall.add(l); return l; });
    const lampsFor = eye => {
        for (const l of lamps) l.score = l.world.distanceTo(eye) - l.reach;
        const order = lamps.slice().sort((a, b) => a.score - b.score), cut = order[pool.length]?.score ?? Infinity;
        pool.forEach((p, i) => { const l = order[i]; p.position.copy(l.local); p.color.copy(l.color); p.distance = l.reach; p.decay = l.decay; p.intensity = l.power * THREE.MathUtils.clamp((cut - l.score) / 6, 0, 1); });
    };
    lampsFor(HALL.START);

    return {
        group: hall, colliders, doors, airy, sunDepth, man, clock,
        lamps: lamps.map(l => l.world),
        sunlight: 1,
        update(t, eye, dt) {
            lampsFor(eye);

            const n = (Math.sin(t * 0.043) * 0.6 + Math.sin(t * 0.017 + 2.0) * 0.4) * 0.5 + 0.5;
            this.sunlight = 1 - 0.55 * THREE.MathUtils.smoothstep(n, 0.55, 0.95);
            sun.intensity = SUN_POWER * this.sunlight;
            motes.material.uniforms.time.value = t; motes.material.uniforms.sunAmt.value = this.sunlight;
            chandeliers.forEach((c, i) => c.rotation.y = Math.sin(t * 0.05 + i) * 0.02);
            this.walkerSteps = walkers.update(t);
            man.userData.update(t); woman.userData.update(t);
            man.userData.look(eye, dt);
            clerks.forEach(c => c.userData.update(t));
            const now = new Date(Date.now() + (this.timeOffset || 0)); wallClocks.forEach(c => c.userData.update(now));
            flags.forEach(f => f.material.userData.time.value = t);
            sky.material.uniforms.time.value = t;
            dangles.forEach((d, i) => { d.rotation.x = Math.sin(t * 0.8 + i * 2.1) * 0.05; d.rotation.z = Math.sin(t * 0.55 + i) * 0.04; });

            if (t > boardAt) { if (boardCtl.auto) boardCtl.next(); boardAt = t + 22 + Math.random() * 20; }
            this.flaps = board.userData.update(dt * boardCtl.speed);
        },
        board, boardCtl, ticketAt, man, woman, flaps: 0,
        startWalkers: t => walkers.start(t),
    };
}
