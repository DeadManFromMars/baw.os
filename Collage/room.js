import * as THREE from 'three';
import * as D from './desk.js?v=62';
import * as field from './field.js?v=62';

const V = (x, y, z) => new THREE.Vector3(x, y, z), FAR = 70000;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export const FLOOR = -75;
export const DARK = { x0: -190, x1: 190, z0: -180, z1: 200 };
export const SLAB = { x0: -260, x1: 260, z0: -210, z1: 310 };
export let world = 'dark';
export const bounds = () => world === 'dark' ? DARK : SLAB;
export const SEAT = { x: 0, z: D.DESK.h / 2 + 42 };
export const WALK = {
    eye: 160, low: 50,
    r: 22,
    walk: 115, hurry: 250,
    step: 70, bob: 2.2,
    reach: 115,
    look: .0022, drag: .004,
    fov: 62,
    rise: 1.3,
};
export const LAMP = {
    high: 300,
    see: 12,
    wait: 1.2, close: 18,
    fight: [[0, 0], [.2, .42], [.3, .22], [.52, .68], [.61, .5], [.8, .9], [.84, .8], [.9, .93], [1, 1]],
    grace: .3,
    open: .5,
    hear: [2.2, .6],
    shut: .7, blink: [.14, .1, .7],
};
const mat = (color, rough = .9) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const LEGS = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: i * (D.DESK.w / 2 - 8), z: j * (D.DESK.h / 2 - 8) }));
let darkRoom = null, lamp = null;
export const took = { field: 0, grass: 0, ready: 0 };
const glowTex = (stops, n = 256) => { const c = Object.assign(document.createElement('canvas'), { width: n, height: n }), g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); for (const [at, col] of stops) gr.addColorStop(at, col); g.fillStyle = gr; g.fillRect(0, 0, n, n); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
export function build() {
    const g = new THREE.Group(), W = D.DESK.w, H = D.DESK.h, wood = mat('#34170f', .5);
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    box(W, 4, H, wood, 0, -2.03, 0);
    box(W - 22, 9, H - 22, wood, 0, -8.5, 0);
    for (const l of LEGS) box(6, -FLOOR - 4, 6, wood, l.x, (FLOOR - 4) / 2, l.z);
    darkRoom = new THREE.Group();
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex([[0, '#4b3625'], [.16, '#3a281a'], [.3, '#22140c'], [.46, '#120805'], [1, '#120805']], 512) }));
    pool.position.y = FLOOR; darkRoom.add(pool);
    lamp = new THREE.Group(); lamp.position.set(0, FLOOR + LAMP.high, 0);
    const face = new THREE.Mesh(new THREE.CircleGeometry(11, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff6e0', toneMapped: false }));
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(9, 15, 16, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#0a0604', side: THREE.DoubleSide })); shade.position.y = 8;
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, 'rgba(255, 244, 220, 1)'], [.12, 'rgba(255, 236, 200, .6)'], [.4, 'rgba(255, 220, 170, .12)'], [1, 'rgba(255, 210, 150, 0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); glare.scale.set(190, 190, 1);
    const lit = new THREE.MeshBasicMaterial({ color: '#ffe9c4', transparent: true, opacity: .0055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    lamp.add(shade, face, glare); darkRoom.add(lamp);
    for (let i = 0; i < 7; i++) lamp.add(new THREE.Mesh(new THREE.ConeGeometry(70 + i * 20, LAMP.high, 48, 1, true).translate(0, -LAMP.high / 2, 0), lit));
    const t0 = performance.now(); field.build(D.scene, SLAB, FLOOR); took.field = performance.now() - t0;
    D.scene.add(g, darkRoom, D.eye());

    const pump = () => { const t = performance.now(), left = field.more(6); took.grass += performance.now() - t; if (left) setTimeout(pump, 30); else field.statues().catch(e => console.warn('the stone hands could not be made', e)).finally(() => setTimeout(ready, 200)); };
    const ready = () => { if (world !== 'dark' || up()) return; const t = performance.now(), was = lamp.visible; lamp.visible = true; field.show(true); D.compile(); field.show(false); lamp.visible = was; took.ready = performance.now() - t; };
    setTimeout(pump, 500);
}
let time = 0;

export const me = { x: SEAT.x, z: SEAT.z, yaw: 0, pitch: -.72, eye: WALK.eye, low: 0, squat: false, vx: 0, vz: 0, stride: 0, t: 0, want: 0 };
export const up = () => me.want > 0 || me.t > 0;
export function stand() { if (me.want) return; Object.assign(me, { x: SEAT.x, z: SEAT.z, yaw: 0, pitch: -Math.atan2(WALK.eye + FLOOR, SEAT.z), eye: WALK.eye, low: 0, squat: false, vx: 0, vz: 0, stride: 0, want: 1 }); }
export function sit() { me.want = 0; me.vx = me.vz = 0; me.squat = false; }
export function crouch() { if (me.want && me.t >= 1) me.squat = !me.squat; }
export function look(dx, dy, k) { me.yaw -= dx * k; me.pitch = Math.max(-1.35, Math.min(1.45, me.pitch - dy * k)); }
const underDesk = (x, z, m = 0) => Math.abs(x) < D.DESK.w / 2 + m && Math.abs(z) < D.DESK.h / 2 + m;
function collide(p, low) {
    const r = WALK.r, B = bounds(), boxes = low ? LEGS.map(l => ({ x0: l.x - 3, x1: l.x + 3, z0: l.z - 3, z1: l.z + 3 })) : [{ x0: -D.DESK.w / 2, x1: D.DESK.w / 2, z0: -D.DESK.h / 2, z1: D.DESK.h / 2 }];
    for (let pass = 0; pass < 2; pass++) for (const c of boxes) {
        const nx = Math.max(c.x0, Math.min(p.x, c.x1)), nz = Math.max(c.z0, Math.min(p.z, c.z1)), dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-6) { p.x = nx + dx / d * r; p.z = nz + dz / d * r; }
        else { const o = [[c.x0 - r - p.x, 0], [c.x1 + r - p.x, 0], [0, c.z0 - r - p.z], [0, c.z1 + r - p.z]].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0]; p.x += o[0]; p.z += o[1]; }
    }
    p.x = Math.max(B.x0 + r, Math.min(B.x1 - r, p.x)); p.z = Math.max(B.z0 + r, Math.min(B.z1 - r, p.z));
}
const gaze = V(), toLamp = V();
export function atFront() {
    if (me.t < 1 || me.low > .4 || me.z < D.DESK.h / 2 + 6 || Math.abs(me.x) > D.DESK.w / 2 + 20) return false;
    const cam = D.eye(); cam.getWorldDirection(gaze); if (gaze.y > -.08) return false;
    const k = -cam.position.y / gaze.y, x = cam.position.x + gaze.x * k, z = cam.position.z + gaze.z * k;
    return Math.abs(x) <= D.DESK.w / 2 && Math.abs(z) <= D.DESK.h / 2;
}

export const eyes = { shut: 0, level: 0 };
let stare = 0, looked = 0, away = 0, blink = null;
const fought = s => { const F = LAMP.fight; for (let i = 1; i < F.length; i++) if (s <= F[i][0]) { const [a, p] = F[i - 1], [b, q] = F[i], u = (s - a) / (b - a || 1); return p + (q - p) * u * u * (3 - 2 * u); } return 1; };
function lampAndEyes(dt, cam) {
    if (world === 'dream') { if (!blink) { eyes.shut = 0; eyes.level += (1 - eyes.level) * Math.min(1, dt * 1.5); } }
    else if (!blink) {
        cam.getWorldDirection(gaze); toLamp.copy(lamp.position).sub(cam.position).normalize();
        const at = me.t >= 1 && gaze.dot(toLamp) > Math.cos(LAMP.see * Math.PI / 180);
        if (at) { away = 0; looked += dt; if (looked > LAMP.wait) stare = Math.min(1, stare + dt / LAMP.close); eyes.shut = fought(stare); eyes.level = Math.pow(stare, LAMP.hear[0]) * LAMP.hear[1]; }
        else if ((away += dt) > LAMP.grace) { looked = stare = 0; eyes.shut = Math.max(0, eyes.shut - dt / LAMP.open); eyes.level = Math.max(0, eyes.level - dt * LAMP.hear[1] / LAMP.open); }
        if (stare >= 1) blink = { t: 0, gone: false };
    }
    if (blink) {
        const b = blink, [a, c, o] = LAMP.blink; b.t += dt;
        if (!b.gone && b.t >= LAMP.shut * .5) { b.gone = true; dream(toLamp); }
        const u = b.t - LAMP.shut;
        eyes.shut = u < 0 ? 1 : u < a ? 1 - .82 * smooth(u / a) : u < a + c ? .18 + .82 * smooth((u - a) / c) : 1 - smooth((u - a - c) / o);
        eyes.level = Math.min(1, LAMP.hear[1] + (1 - LAMP.hear[1]) * b.t / (LAMP.shut + a + c + o));
        if (u >= a + c + o) { blink = null; stare = looked = 0; eyes.shut = 0; }
    }
}
export function dream(sun) {
    if (world === 'dream') return;
    world = 'dream'; darkRoom.visible = false; field.show(true); field.toSun(sun || V(0, 1, 0));
    for (const it of items) it.still = false;
}

const seat = { p: V(), q: new THREE.Quaternion(), near: 1 }, walkQ = new THREE.Quaternion(), walkP = V(), euler = new THREE.Euler(0, 0, 0, 'YXZ'), fwd = V(), t0 = V(), t1 = V(), aim = V();
const onDesk = (p, dir, out) => { const k = dir.y < -.05 ? Math.min(600, -p.y / dir.y) : 150; return out.copy(p).addScaledVector(dir, k); };

export function frame(dt, keys) {
    const cam = D.eye(); time += dt;
    lamp.visible = cam.position.y < lamp.position.y - 20;
    if (!up()) {
        if (cam.fov !== D.lens) { cam.fov = D.lens; cam.updateProjectionMatrix(); }
        lampAndEyes(dt, cam); field.update(time, false, cam.position);
        return fall(dt) || eyes.shut > 0;
    }
    seat.p.copy(cam.position); seat.q.copy(cam.quaternion); seat.near = cam.near;
    me.t = Math.max(0, Math.min(1, me.t + (me.want ? 1 : -1) * dt / WALK.rise));
    if (me.want && me.t >= 1) {
        const has = k => keys.has(k) ? 1 : 0, f = (has('w') || has('arrowup')) - (has('s') || has('arrowdown')), s = (has('d') || has('arrowright')) - (has('a') || has('arrowleft'));
        const under = underDesk(me.x, me.z, WALK.r - 2), crouch = me.squat || under;
        me.low += ((crouch ? 1 : 0) - me.low) * (1 - Math.exp(-dt * 9));
        const speed = (has('shift') ? WALK.hurry : WALK.walk) * (1 - .55 * me.low), n = Math.hypot(f, s) || 1, c = Math.cos(me.yaw), sn = Math.sin(me.yaw);
        const wx = (s * c - f * sn) / n * speed, wz = (-s * sn - f * c) / n * speed, k = 1 - Math.exp(-dt * 8);
        me.vx += (wx - me.vx) * k; me.vz += (wz - me.vz) * k;
        const was = { x: me.x, z: me.z }; me.x += me.vx * dt; me.z += me.vz * dt;
        collide(me, me.low > .8);
        me.stride = (me.stride + Math.hypot(me.x - was.x, me.z - was.z)) % WALK.step;
    }
    const bob = -Math.cos(2 * Math.PI * me.stride / WALK.step) * WALK.bob * Math.min(1, Math.hypot(me.vx, me.vz) / WALK.walk);
    me.eye = WALK.eye + (WALK.low - WALK.eye) * me.low;
    walkP.set(me.x, FLOOR + me.eye + bob, me.z); walkQ.setFromEuler(euler.set(me.pitch, me.yaw, 0));
    if (me.t >= 1) { cam.position.copy(walkP); cam.quaternion.copy(walkQ); cam.fov = WALK.fov; }
    else {
        const e = smooth(me.t), f0 = D.lens * Math.PI / 360, f1 = WALK.fov * Math.PI / 360;
        onDesk(seat.p, fwd.set(0, 0, -1).applyQuaternion(seat.q), t0); onDesk(walkP, fwd.set(0, 0, -1).applyQuaternion(walkQ), t1);
        const d0 = seat.p.distanceTo(t0), d1 = walkP.distanceTo(t1), half = f0 + (f1 - f0) * e, wide = d0 * Math.tan(f0) + (d1 * Math.tan(f1) - d0 * Math.tan(f0)) * e;
        cam.quaternion.slerpQuaternions(seat.q, walkQ, e); aim.lerpVectors(t0, t1, e);
        cam.position.copy(aim).addScaledVector(fwd.set(0, 0, -1).applyQuaternion(cam.quaternion), -wide / Math.tan(half));
        cam.fov = half * 360 / Math.PI;
    }
    const e = smooth(me.t); cam.near = seat.near + (5 - seat.near) * e; cam.far = FAR;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    lamp.visible = cam.position.y < lamp.position.y - 20;
    lampAndEyes(dt, cam); field.update(time, true, cam.position);
    fall(dt);
    return true;
}

export const items = [], held = [];
const lay = it => {
    if (it.kind !== 'paper') D.lay(it.obj, it.x, it.z, it.y, it.ang, it.tip || 0);
    else { it.obj.position.set(it.x, it.y, it.z); it.obj.rotation.set(it.tip || 0, -it.ang, 0, 'YXZ'); }
};
export function drop(it) {
    Object.assign(it, { vx: it.vx || 0, vz: it.vz || 0, vy: it.vy || 0, spin: it.spin || 0, tip: it.tip || 0, still: false, n: items.length });
    if (it.obj.parent !== D.scene) D.scene.add(it.obj);
    it.obj.visible = true; items.push(it); lay(it);
}
export function put(it) { drop(it); Object.assign(it, { y: rest(it), vx: 0, vz: 0, vy: 0, spin: 0, tip: 0, still: true }); lay(it); }
const rest = it => FLOOR + (it.kind === 'paper' ? .05 + (it.n % 40) * .03 : 0);
function fall(dt) {
    let going = false; const B = bounds();
    for (const it of items) {
        if (it.still || !dt) continue;
        going = true;
        const floor = rest(it), paperish = it.kind === 'paper';
        if (it.y > floor) {
            it.vy = paperish ? Math.max(-55, it.vy - 240 * dt) : it.vy - 980 * dt;
            it.y = Math.max(floor, it.y + it.vy * dt);
            if (paperish) { it.t = (it.t || 0) + dt; it.tip = .22 * Math.sin(it.t * 5.2) * Math.min(1, (it.y - floor) / 20); const k = Math.exp(-1.4 * dt); it.vx *= k; it.vz *= k; }
            else it.tip += (it.spin || .6) * (it.kind === 'big' ? .5 : 1.5) * dt;
            if (it.y <= floor) { it.vy = !paperish && it.vy < -160 ? -it.vy * (it.kind === 'big' ? .1 : .22) : 0; if (it.vy) it.y = floor + .01; it.vx *= .55; it.vz *= .55; }
        } else {
            const v = Math.hypot(it.vx, it.vz), slow = (paperish ? 300 : it.rolls ? 110 : 420) * dt, k = v > slow ? (v - slow) / v : 0;
            it.vx *= k; it.vz *= k; it.spin *= Math.exp(-7 * dt); it.tip *= Math.exp(-14 * dt);
            if (!k && Math.abs(it.spin) < .05 && Math.abs(it.tip) < .01) { it.still = true; it.spin = it.tip = 0; }
        }
        it.x += it.vx * dt; it.z += it.vz * dt; it.ang += it.spin * dt;
        const m = 6; if (it.x < B.x0 + m || it.x > B.x1 - m) { it.x = Math.max(B.x0 + m, Math.min(B.x1 - m, it.x)); it.vx *= -.3; }
        if (it.z < B.z0 + m || it.z > B.z1 - m) { it.z = Math.max(B.z0 + m, Math.min(B.z1 - m, it.z)); it.vz *= -.3; }
        lay(it);
    }
    return going;
}
const box3 = new THREE.Box3(), size = V();
export function inSight() {
    if (me.t < 1 || !items.length) return null;
    const cam = D.eye(); cam.getWorldDirection(gaze); if (gaze.y > -.05) return null;
    const k = (FLOOR + 1 - cam.position.y) / gaze.y, px = cam.position.x + gaze.x * k, pz = cam.position.z + gaze.z * k;
    let best = null, least = Infinity;
    for (const it of items) {
        if (!it.still) continue;
        it.r ??= (box3.setFromObject(it.obj).getSize(size), Math.hypot(size.x, size.z) / 2);
        const off = Math.hypot(it.x - px, it.z - pz), away = Math.hypot(it.x - cam.position.x, FLOOR - cam.position.y, it.z - cam.position.z) - it.r;
        if (off <= it.r * .6 + 7 && away <= WALK.reach && off < least) { best = it; least = off; }
    }
    return best;
}
export function take(it) {
    items.splice(items.indexOf(it), 1); held.push(it);
    const k = held.length - 1; D.eye().add(it.obj);
    it.obj.position.set(17 - 2.5 * k, -19 - 1.2 * k, -50 - 3 * k); it.obj.rotation.set(.9, .5 + .25 * k, .15, 'YXZ');
}
export function forget(it) { const i = items.indexOf(it), j = held.indexOf(it); if (i >= 0) items.splice(i, 1); if (j >= 0) held.splice(j, 1); it.obj.removeFromParent(); }
export const busy = () => up() || eyes.shut > 0 || items.some(it => !it.still);
