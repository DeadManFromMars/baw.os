import * as THREE from 'three';

export const GRASS = {
    q: 1,
    tall: [70, 105],
    wide: 1.7,
    rings: [[0, 1300, 420, 1, 650, 5], [1300, 3600, 55, 2.3, 1200, 3], [3600, 9500, 7, 5.5, 2400, 2]],
    wind: [.94, .34],
    root: '#2c6410', tip: '#a4dc24', sheen: '#e4f58c',
    soil: '#274d10',
};
export const HAZE = { color: '#dde3d6', density: 8.6e-5, zenith: '#c3cbc6', glow: '#f4f3e6' };
export const WISPS = { n: 9, long: 700, wide: 11, life: [5, 9], high: [70, 210], speed: [330, 560], faint: .5 };

const V = (x, y, z) => new THREE.Vector3(x, y, z), smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let slab = null, base = 0;
const hills = (x, z) => 420 * Math.sin(x * .00052 + 1.3) * Math.cos(z * .00047 - .4) + 260 * Math.sin((x + z) * .00083 + 2.1) + 140 * Math.sin(x * .0019 - z * .0013) + 55 * Math.sin(x * .0041 + 1.7) * Math.sin(z * .0037);
export function ground(x, z) {
    const d = Math.hypot(x - slab.cx, z - slab.cz);
    return base + (hills(x, z) - hills(slab.cx, slab.cz)) * smooth((d - 450) / 3200);
}

const WIND = `
float gustAt(vec2 p, float t, vec2 dir) {
    float along = dot(p, dir), across = dot(p, vec2(-dir.y, dir.x));
    float w = sin(along * .0105 - t * 1.25 + sin(across * .004 + t * .11) * 2.) * .55 + sin(along * .027 + across * .011 - t * 2.1) * .3 + sin(along * .0031 - across * .0017 - t * .45) * .35;
    return clamp(.5 + .42 * w, 0., 1.);
}`;
const uniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(...GRASS.wind).normalize() }, uRoot: { value: new THREE.Color(GRASS.root) }, uTip: { value: new THREE.Color(GRASS.tip) }, uSheen: { value: new THREE.Color(GRASS.sheen) },
                   uSoil: { value: new THREE.Color(GRASS.soil) }, uFog: { value: new THREE.Color(HAZE.color) }, uFogD: { value: HAZE.density } };
const bladeMat = () => new THREE.ShaderMaterial({ uniforms, side: THREE.DoubleSide, vertexShader: `
    attribute vec3 aRoot; attribute vec4 aInfo;
    uniform float uTime; uniform vec2 uWind;
    varying float vT, vGust, vTint, vDepth;
    ${WIND}
    void main() {
        float t = position.y, c = cos(aInfo.x), s = sin(aInfo.x), k = t * t, own = fract(aInfo.w * 7.31);
        float gust = gustAt(aRoot.xz, uTime, uWind), flutter = sin(uTime * (2.6 + own * 2.4) + aInfo.w * 40.) * (.03 + .05 * gust);
        vec2 over = (uWind * (.16 + .5 * gust + flutter) + vec2(-s, c) * (own - .5) * .34) * aInfo.y;
        vec3 p = vec3(position.x * aInfo.z * c, t * aInfo.y * (1. - .3 * k * (.25 + gust)), position.x * aInfo.z * s);
        p.xz += over * k;
        vec4 mv = modelViewMatrix * vec4(aRoot + p, 1.);
        gl_Position = projectionMatrix * mv;
        vT = t; vGust = gust; vTint = own; vDepth = -mv.z;
    }`, fragmentShader: `
    uniform vec3 uRoot, uTip, uSheen, uFog; uniform float uFogD;
    varying float vT, vGust, vTint, vDepth;
    void main() {
        vec3 col = mix(uRoot, uTip, pow(vT, .75)) * (.8 + .34 * vTint);
        col = mix(col, uSheen, vGust * vT * vT * .42);
        col = mix(col, mix(mix(uRoot, uTip, .72), uSheen, vGust * .36), smoothstep(4200., 9000., vDepth));
        float f = 1. - exp(-uFogD * uFogD * vDepth * vDepth);
        gl_FragColor = vec4(mix(col, uFog, f), 1.);
        #include <colorspace_fragment>
    }` });
function bladeGeo(joints) {
    const pos = [], idx = [];
    for (let i = 0; i <= joints; i++) { const t = i / joints, hw = .5 * Math.pow(1 - t, .8); pos.push(-hw, t, 0, hw, t, 0); }
    for (let i = 0; i < joints; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return g;
}

const jobs = [];
function grass() {
    const group = new THREE.Group(), r = rng(31), mat = bladeMat();
    for (const [from, to, perM2, wider, patch, joints] of GRASS.rings) {
        const blade = bladeGeo(joints), n0 = Math.ceil(to / patch);
        for (let i = -n0; i < n0; i++) for (let j = -n0; j < n0; j++) {
            const x0 = slab.cx + i * patch, z0 = slab.cz + j * patch, mid = Math.hypot(x0 + patch / 2 - slab.cx, z0 + patch / 2 - slab.cz);
            if (mid <= to + patch && mid >= from - patch) jobs.push({ group, r, mat, blade, from, to, perM2, wider, patch, x0, z0 });
        }
    }
    return group;
}
function patchOf({ group, r, mat, blade, from, to, perM2, wider, patch, x0, z0 }) {
    const want = Math.round(patch * patch / 1e4 * perM2 * GRASS.q), roots = new Float32Array(want * 3), info = new Float32Array(want * 4);
    let n = 0;
    for (let k = 0; k < want; k++) {
        const x = x0 + r() * patch, z = z0 + r() * patch, d = Math.hypot(x - slab.cx, z - slab.cz);
        if (d < from || d >= to || (x > slab.x0 - 6 && x < slab.x1 + 6 && z > slab.z0 - 6 && z < slab.z1 + 6)) continue;
        roots[n * 3] = x; roots[n * 3 + 1] = ground(x, z); roots[n * 3 + 2] = z;
        info[n * 4] = r() * Math.PI; info[n * 4 + 1] = (GRASS.tall[0] + r() * (GRASS.tall[1] - GRASS.tall[0])) * (1 + .12 * (wider - 1) / 4.5); info[n * 4 + 2] = GRASS.wide * wider * (.7 + .6 * r()); info[n * 4 + 3] = r();
        n++;
    }
    if (!n) return;
    const g = new THREE.InstancedBufferGeometry(); g.index = blade.index; g.setAttribute('position', blade.attributes.position);
    g.setAttribute('aRoot', new THREE.InstancedBufferAttribute(roots.subarray(0, n * 3), 3)); g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info.subarray(0, n * 4), 4));
    g.instanceCount = n;
    const cx = x0 + patch / 2, cz = z0 + patch / 2; g.boundingSphere = new THREE.Sphere(V(cx, ground(cx, cz) + 60, cz), patch * .75 + 320);
    group.add(new THREE.Mesh(g, mat));
}
export function more(ms = Infinity) {
    const t0 = performance.now();
    while (jobs.length && performance.now() - t0 < ms) patchOf(jobs.shift());
    return jobs.length > 0;
}
function land() {
    const size = 90000, n = 220, g = new THREE.PlaneGeometry(size, size, n, n).rotateX(-Math.PI / 2).translate(slab.cx, 0, slab.cz), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)) - 2);
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms, vertexShader: `
        varying vec3 vWorld; varying float vDepth;
        void main() { vWorld = position; vec4 mv = modelViewMatrix * vec4(position, 1.); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`, fragmentShader: `
        uniform float uTime, uFogD; uniform vec2 uWind; uniform vec3 uRoot, uTip, uSheen, uSoil, uFog;
        varying vec3 vWorld; varying float vDepth;
        ${WIND}
        void main() {
            float gust = gustAt(vWorld.xz, uTime, uWind), far = smoothstep(2500., 8500., vDepth);
            vec3 top = mix(mix(uRoot, uTip, .72), uSheen, gust * .36);
            vec3 col = mix(uSoil, top, far);
            float f = 1. - exp(-uFogD * uFogD * vDepth * vDepth);
            gl_FragColor = vec4(mix(col, uFog, f), 1.);
            #include <colorspace_fragment>
        }` }));
}
const sunDir = { value: V(0, 1, 0) };
function sky() {
    const m = new THREE.Mesh(new THREE.SphereGeometry(60000, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { uLow: { value: new THREE.Color(HAZE.color) }, uHigh: { value: new THREE.Color(HAZE.zenith) }, uGlow: { value: new THREE.Color(HAZE.glow) }, uSun: sunDir }, vertexShader: `
        varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`, fragmentShader: `
        uniform vec3 uLow, uHigh, uGlow, uSun; varying vec3 vDir;
        void main() {
            vec3 d = normalize(vDir); float s = max(0., dot(d, uSun));
            vec3 col = mix(uLow, uHigh, smoothstep(0., .75, d.y) * (1. - pow(s, 3.) * .8));
            col = mix(col, uGlow, pow(s, 6.) * .9);
            col = mix(col, vec3(1.), pow(s, 90.) * .85 + smoothstep(.99935, .9997, s));
            gl_FragColor = vec4(col, 1.);
            #include <colorspace_fragment>
        }` }));
    m.renderOrder = -1; m.frustumCulled = false;
    return m;
}
export function toSun(dir) { sunDir.value.copy(dir).normalize(); }

const SEG = 40;
function wisps() {
    const group = new THREE.Group(), mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uFogD: uniforms.uFogD }, vertexShader: `
        attribute float aShow; varying float vShow, vDepth;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); vDepth = -mv.z; vShow = aShow; gl_Position = projectionMatrix * mv; }`, fragmentShader: `
        uniform float uFogD; varying float vShow, vDepth;
        void main() { gl_FragColor = vec4(1., 1., .97, vShow * exp(-uFogD * uFogD * vDepth * vDepth * 1.6)); }` });
    const r = rng(404), idx = []; for (let k = 0; k < SEG; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    for (let i = 0; i < WISPS.n; i++) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 6), 3)); g.setAttribute('aShow', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2), 1)); g.setIndex(idx);
        const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.userData = { born: 0, life: 0, gap: r() * 9, r }; group.add(m);
    }
    return group;
}
const wind3 = V(GRASS.wind[0], 0, GRASS.wind[1]).normalize(), side3 = V(-wind3.z, 0, wind3.x), pA = V(), pB = V(), tan = V(), edge = V(), toEye = V();
function wispAt(u, tau, out) {
    const loop = smooth((tau - u.loopAt) / u.loopFor) * Math.PI * 2;
    return out.copy(u.from).addScaledVector(wind3, u.speed * tau - u.curl * Math.sin(loop)).addScaledVector(side3, u.sway * Math.sin(tau * u.w1 + u.p1))
        .setY(u.from.y + u.lift * Math.sin(tau * u.w2 + u.p2) + u.curl * (1 - Math.cos(loop)));
}
function blow(group, t, eye) {
    for (const m of group.children) {
        const u = m.userData, r = u.r;
        if (t - u.born > u.life + u.gap) {
            const ahead = -(500 + r() * 1500), across = (r() - .5) * 3200;
            Object.assign(u, { born: t, gap: r() * 3.5, life: WISPS.life[0] + r() * (WISPS.life[1] - WISPS.life[0]), speed: WISPS.speed[0] + r() * (WISPS.speed[1] - WISPS.speed[0]),
                from: V(slab.cx, slab.top + WISPS.high[0] + r() * (WISPS.high[1] - WISPS.high[0]), slab.cz).addScaledVector(wind3, ahead).addScaledVector(side3, across),
                sway: 40 + r() * 90, w1: .5 + r() * .7, p1: r() * 6.28, lift: 18 + r() * 40, w2: .6 + r() * .9, p2: r() * 6.28, curl: r() < .6 ? 45 + r() * 70 : 0, loopAt: 1 + r() * 2.5, loopFor: 1.1 + r() * .8 });
        }
        m.visible = !!u.from && t - u.born < u.life; if (!m.visible) continue;
        const age = t - u.born, lifeShow = Math.sin(Math.PI * Math.min(1, age / u.life)), step = WISPS.long / u.speed / SEG, pos = m.geometry.attributes.position, show = m.geometry.attributes.aShow;
        for (let k = 0; k <= SEG; k++) {
            wispAt(u, age - k * step, pA); wispAt(u, age - (k + 1) * step, pB);
            tan.subVectors(pA, pB); toEye.subVectors(eye, pA); edge.crossVectors(tan, toEye).normalize();
            const along = Math.sin(Math.PI * k / SEG), half = WISPS.wide / 2 * along;
            pos.setXYZ(k * 2, pA.x + edge.x * half, pA.y + edge.y * half, pA.z + edge.z * half); pos.setXYZ(k * 2 + 1, pA.x - edge.x * half, pA.y - edge.y * half, pA.z - edge.z * half);
            const a = WISPS.faint * lifeShow * Math.pow(along, .7); show.setX(k * 2, a); show.setX(k * 2 + 1, a);
        }
        pos.needsUpdate = true; show.needsUpdate = true;
    }
}
function rock() {
    const c = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 }), g = c.getContext('2d'), r = rng(5);
    g.fillStyle = '#6f6e69'; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 260; i++) { const x = r() * 1024, y = r() * 1024, s = 30 + r() * 170; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, r() < .5 ? 'rgba(40, 40, 38, .14)' : 'rgba(170, 168, 160, .12)'); gr.addColorStop(1, 'rgba(0, 0, 0, 0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, 2 * s, 2 * s); }
    for (let i = 0; i < 26000; i++) { g.fillStyle = r() < .5 ? 'rgba(20, 20, 18, .16)' : 'rgba(225, 222, 212, .13)'; g.fillRect(r() * 1024, r() * 1024, 1 + r() * 2, 1 + r() * 2); }
    g.strokeStyle = 'rgba(25, 24, 22, .5)'; g.lineWidth = 1.3;
    for (let i = 0; i < 9; i++) { let x = r() * 1024, y = r() * 1024, a = r() * 6.28; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 26; k++) { a += (r() - .5) * .9; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); } g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const w = slab.x1 - slab.x0, d = slab.z1 - slab.z0, top = new THREE.MeshStandardMaterial({ map: t, roughness: .96 }), side = new THREE.MeshStandardMaterial({ color: '#55544f', roughness: .98 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 60, d), [side, side, top, side, side, side]); m.position.set(slab.cx, slab.top - 30, slab.cz); m.receiveShadow = true;
    return m;
}
let blades = null, streaks = null, root = null, theScene = null;
const haze = new THREE.FogExp2(HAZE.color, HAZE.density);
export function build(scene, bounds, top) {
    slab = { ...bounds, cx: (bounds.x0 + bounds.x1) / 2, cz: (bounds.z0 + bounds.z1) / 2, top }; base = top - 14;
    blades = grass(); streaks = wisps(); root = new THREE.Group(); theScene = scene;
    root.add(rock(), land(), blades, sky(), streaks); root.visible = false; scene.add(root);
}
export function show(on) {
    if (on) more();
    root.visible = on; theScene.fog = on ? haze : null;
}
export function update(t, grassToo, eye) {
    if (!root.visible) return;
    uniforms.uTime.value = t; blades.visible = streaks.visible = grassToo;
    if (grassToo) blow(streaks, t, eye);
}
