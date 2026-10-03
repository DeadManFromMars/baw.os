import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

let gltf = null;
export async function loadHand() { gltf = gltf || await new GLTFLoader().loadAsync(MODEL); }

const MODEL = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/right.glb';
const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const CHAIN = f => f === 'thumb'
    ? ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']
    : [`${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`];

const POSES = {
    open:    { index: [0, 0, 0, .12], middle: [0, 0, 0, 0], ring: [0, 0, 0, .1], pinky: [0, 0, 0, .22], thumb: [-.1, -.2, 0, 0] },
    relaxed: { index: [.22, .3, .18, .04], middle: [.28, .4, .22, 0], ring: [.34, .46, .26, .04], pinky: [.42, .5, .3, .08], thumb: [0, .25, .1, .03] },
    reach:   { index: [.08, .16, .1, .16], middle: [.1, .18, .12, 0], ring: [.14, .22, .14, .12], pinky: [.18, .26, .16, .26], thumb: [-.05, -.25, .05, .1] },
    grip:    { index: [.95, 1.15, .6, .02], middle: [1.0, 1.2, .65, 0], ring: [1.05, 1.2, .65, .02], pinky: [1.1, 1.15, .6, .04], thumb: [.7, .4, .4, .3], touch: 'hold' },
    claw:    { index: [.15, 1.15, 1.0, .18], middle: [.15, 1.2, 1.0, 0], ring: [.2, 1.2, 1.0, .14], pinky: [.25, 1.15, .95, .28], thumb: [-.08, -.1, .3, .55, .02, .3] },

    pinch:   { index: [1.0, 1.0, .45, 0], middle: [1.12, 1.12, .55, 0], ring: [1.24, 1.22, .62, .03], pinky: [1.36, 1.3, .68, .06], thumb: [.6, .3, .2, .15], touch: 'pinch' },

    point:   { index: [0, 0, 0, .03], middle: [1.5, 1.9, 1.25, 0], ring: [1.55, 1.95, 1.35, .02], pinky: [1.55, 1.95, 1.35, .04], thumb: [.3, .1, .6, .8], touch: 'wrapLow' },
    fist:    { index: [1.5, 1.9, 1.25, 0], middle: [1.5, 1.9, 1.25, 0], ring: [1.55, 1.95, 1.35, .02], pinky: [1.55, 1.95, 1.35, .04], thumb: [.3, .1, .8, 1.0], touch: 'wrap' },
};

function outlineMaterial(color, px) {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    m.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${px.toFixed(5)};`); };
    return m;
}
function porcelainLight(scene, renderer, sky = 0xdfe8f2, rim = 0xaecbe8) {
    scene.add(new THREE.HemisphereLight(sky, 0x16181b, .8));
    const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(5, 9, 9); scene.add(k);
    const r = new THREE.DirectionalLight(rim, 2.0); r.position.set(-7, 3, -8); scene.add(r);
    const pm = new THREE.PMREMGenerator(renderer), room = new THREE.Scene(); room.background = new THREE.Color(0x2c3036);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); lamp.position.set(0, 6, 6); lamp.lookAt(0, 0, 0); room.add(lamp);
    scene.environment = pm.fromScene(room, 0.04).texture;
}
const LOOKS = [
    { name: 'Glazed', bg: 0x16181b, text: '#d8dde2',
      mat: () => new THREE.MeshPhysicalMaterial({ color: 0xf2f1ee, roughness: .16, clearcoat: 1, clearcoatRoughness: .06, sheen: .3, sheenColor: 0xbfd4e6 }),
      light: (s, r) => porcelainLight(s, r) },
    { name: 'Bisque', bg: 0x1a1a1a, text: '#dcd8d2',
      mat: () => new THREE.MeshPhysicalMaterial({ color: 0xeeebe4, roughness: .78, sheen: .5, sheenRoughness: .8, sheenColor: 0xffffff }),
      light: (s, r) => porcelainLight(s, r, 0xf2ece4, 0xd8d2c8) },
    { name: 'Ivory', bg: 0x1b1916, text: '#e6ddcd',
      mat: () => new THREE.MeshPhysicalMaterial({ color: 0xf3e8d4, roughness: .28, clearcoat: .7, clearcoatRoughness: .15, sheen: .6, sheenColor: 0xffe2bf }),
      light: (s, r) => porcelainLight(s, r, 0xfff1e0, 0xffd2a6) },
    { name: 'Ivory + ink', bg: 0xf5f2ec, text: '#1a1a18',
      mat: () => new THREE.MeshPhysicalMaterial({ color: 0xf3e8d4, roughness: .28, clearcoat: .7, clearcoatRoughness: .15, sheen: .6, sheenColor: 0xffe2bf }),
      outline: 0x1a1a18,
      light: (s, r) => porcelainLight(s, r, 0xfff1e0, 0xffd2a6) },
];

const NAIL = { color: 0x0b0b0c, gloss: 0.1 };
function withNails(mat, nails) {
    mat.onBeforeCompile = s => {
        Object.assign(s.uniforms, {
            nailD: { value: nails.map(n => n.d) }, nailA: { value: nails.map(n => n.a) }, nailS: { value: nails.map(n => n.s) },
            nailU: { value: nails.map(n => n.u) }, nailSize: { value: nails.map(n => n.size) },
            nailColor: { value: new THREE.Color(NAIL.color) }, nailGloss: { value: NAIL.gloss },
        });
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
                                       .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
            varying vec3 vRest;
            uniform vec3 nailD[5], nailA[5], nailS[5], nailU[5], nailSize[5];
            uniform vec3 nailColor; uniform float nailGloss;
            float nailMask() {
                float m = 0.0;
                for (int i = 0; i < 5; i++) {
                    vec3 d = vRest - nailD[i];
                    float t = dot(d, nailA[i]) / nailSize[i].x;
                    float s = dot(d, nailS[i]) / nailSize[i].y;
                    float h = dot(d, nailU[i]);
                    float cut = 0.42 + 0.1 * s * s;
                    float edge = 0.97 - 0.1 * s * s;
                    float along = smoothstep(cut - 0.025, cut + 0.025, t) * (1.0 - smoothstep(edge - 0.03, edge + 0.01, t));
                    float across = 1.0 - smoothstep(0.9, 1.02, abs(s));
                    float onBack = smoothstep(nailSize[i].z - 0.0006, nailSize[i].z + 0.0006, h);
                    m = max(m, along * across * onBack);
                }
                return m;
            }`)
            .replace('#include <color_fragment>', '#include <color_fragment>\nfloat nail = nailMask();\ndiffuseColor.rgb = mix(diffuseColor.rgb, nailColor, nail);')
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, nailGloss, nail);');
    };
    return mat;
}

function makeHand(look) {
    const root = SkeletonUtils.clone(gltf.scene);
    root.updateMatrixWorld(true);
    const bone = n => root.getObjectByName(n);
    const rig = {};
    for (const f of FINGERS) {
        const names = CHAIN(f);
        let parent = bone('wrist');
        const joints = names.map(n => { const b = bone(n); parent.attach(b); parent = b; return b; });
        rig[f] = joints.map(b => ({ b, rest: b.quaternion.clone() }));
    }
    root.updateMatrixWorld(true);

    const at = n => bone(n).getWorldPosition(new THREE.Vector3());
    const dir = (a, b) => b.clone().sub(a).normalize();
    const wrist = at('wrist'), midK = at('middle-finger-phalanx-proximal');
    const across = dir(at('index-finger-phalanx-proximal'), at('pinky-finger-phalanx-proximal'));
    let palm = new THREE.Vector3().crossVectors(dir(wrist, midK), across).normalize();
    {
        const b = bone('middle-finger-phalanx-proximal'), d = dir(at(b.name), at('middle-finger-phalanx-intermediate'));
        const x = new THREE.Vector3(1, 0, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
        if (new THREE.Vector3().crossVectors(d, palm).dot(x) > 0) palm.negate();
    }
    const local = (b, axis) => axis.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    const turnToward = (b, next, toward) => {
        const d = dir(at(b.name), at(next.name));
        return local(b, new THREE.Vector3().crossVectors(d, toward).normalize());
    };
    for (const f of FINGERS) {
        const j = rig[f];
        if (f === 'thumb') {

            const [m, p, d, tip] = j.map(x => x.b);
            const aim = palm.clone().add(across).normalize();

            const up = dir(wrist, midK), md = dir(at(m.name), at(p.name));
            const signed = (axis, want) => md.clone().applyAxisAngle(axis, 0.01).sub(md).dot(want) < 0 ? axis.clone().negate() : axis.clone();
            j[0].lift = local(m, signed(up, palm));
            j[0].sweep = local(m, signed(palm, across));
            j[0].tilt = local(m, new THREE.Vector3().crossVectors(md, palm).normalize());

            j[0].roll = local(m, md.clone());
            {
                const bend = new THREE.Vector3().crossVectors(md, aim).normalize();
                const after = bend.clone().applyAxisAngle(md, 0.2), dirAfter = md.clone().applyAxisAngle(after, 0.5), dirBefore = md.clone().applyAxisAngle(bend, 0.5);
                if (dirAfter.sub(dirBefore).dot(across) < 0) j[0].roll.negate();
            }
            j[1].flex = turnToward(p, d, aim);
            j[2].flex = turnToward(d, tip, aim);
        } else {
            for (let i = 1; i <= 3; i++) j[i].flex = turnToward(j[i].b, j[i + 1].b, palm);
            const k = at(j[1].b.name);
            const away = f === 'middle-finger' ? across.clone().negate() : dir(midK, k);
            j[1].spread = f === 'middle-finger' ? null : turnToward(j[1].b, j[2].b, away);
        }
    }
    {
        const w = bone('wrist'), down = dir(midK, wrist);
        let axis = across.clone();
        if (down.clone().applyAxisAngle(axis, 0.01).sub(down).dot(palm) > 0) axis.negate();
        rig.wrist = { b: w, rest: w.quaternion.clone(), axis: local(w, axis),
                      kids: FINGERS.map(f => ({ j: rig[f][0], pos: rig[f][0].b.position.clone(), rest: rig[f][0].rest.clone() })) };
    }
    rig.root = root; rig.tip = f => bone(`${f}-tip`); rig.bone = bone;
    const mesh = root.getObjectByProperty('isSkinnedMesh', true);

    mesh.updateMatrixWorld(true);
    const toMesh = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const nails = FINGERS.map(f => {
        const names = CHAIN(f), D = at(names[names.length - 2]), T = at(names[names.length - 1]);
        const bend = f === 'thumb' ? palm.clone().add(across).normalize() : palm;
        const a = dir(D, T), u = bend.clone().addScaledVector(a, -bend.dot(a)).normalize().negate();
        const dL = D.clone().applyMatrix4(toMesh), tL = T.clone().applyMatrix4(toMesh);
        const k = dL.distanceTo(tL) / D.distanceTo(T);
        const r = (f === 'thumb' ? 0.8 : FINGER_R[f] * 0.76) * 0.01 * k;
        const s = new THREE.Vector3().crossVectors(a, u);
        const nail = { d: dL, a: a.clone().transformDirection(toMesh), s: s.transformDirection(toMesh), u: u.clone().transformDirection(toMesh) };

        const pos = mesh.geometry.attributes.position, p = new THREE.Vector3();
        let reach = dL.distanceTo(tL);
        for (let v = 0; v < pos.count; v++) {
            p.fromBufferAttribute(pos, v).sub(dL);
            const along = p.dot(nail.a);
            if (along > 0 && Math.abs(p.dot(nail.s)) < r && Math.abs(p.dot(nail.u)) < 1.6 * r) reach = Math.max(reach, along);
        }
        nail.size = new THREE.Vector3(reach, 0.8 * r, -0.1 * r);
        nail.beyond = (reach - dL.distanceTo(tL)) / k;
        return nail;
    });
    mesh.material = withNails(look.mat(), nails);
    rig.nails = nails; rig.mesh = mesh;
    mesh.frustumCulled = false;
    if (look.outline !== undefined) {
        const line = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial(look.outline, 0.0011));
        line.bind(mesh.skeleton, mesh.bindMatrix); line.frustumCulled = false;
        mesh.parent.add(line);
    }
    return { root, rig };
}

const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const turned = (j, ...pairs) => {
    j.b.quaternion.copy(j.rest);
    for (const [axis, angle] of pairs) if (axis && angle) j.b.quaternion.multiply(q1.setFromAxisAngle(axis, angle));
};

function pose(rig, P, t, life) {
    for (const f of FINGERS) {
        const j = rig[f], i = FINGERS.indexOf(f);
        const breathe = life * 0.035 * Math.sin(t * 1.2 + i);
        if (f === 'thumb') {
            thumbTo(rig, P.thumb.map((v, k) => v + (k === 2 || k === 3 ? breathe * 0.6 : 0)));
        } else {
            const [a, b, c, s] = P[f.split('-')[0]];
            turned(j[1], [j[1].spread, s], [j[1].flex, a + breathe]);
            turned(j[2], [j[2].flex, b + breathe]);
            turned(j[3], [j[3].flex, c + breathe * 0.5]);
        }
    }
}

function bendWrist(rig, angle) {
    const W = rig.wrist, R = new THREE.Quaternion().setFromAxisAngle(W.axis, angle), back = R.clone().invert();
    W.b.quaternion.copy(W.rest).multiply(R);
    for (const k of W.kids) {
        k.j.b.position.copy(k.pos).applyQuaternion(back);
        k.j.rest.copy(back).multiply(k.rest);
        if (k.j !== rig.thumb[0]) k.j.b.quaternion.copy(k.j.rest);
    }
}
const pad6 = th => [...th, 0, 0, 0, 0, 0, 0].slice(0, 6);
const fingersAt = (P, curl) => Object.fromEntries(['index', 'middle', 'ring', 'pinky'].map(f => [f, P[f].map((v, j) => v + (j < 3 ? curl : 0))]));

function aimFor(name, curl = 0) {
    const T = POSES[name], S = SOLVED[name];
    return { ...(S?.fingers || fingersAt(T, curl)), thumb: S?.thumb || pad6(T.thumb).map((v, j) => v + (j === 2 || j === 3 ? curl * 0.5 : 0)) };
}

function easeToward(cur, aim, k) { for (const f in aim) cur[f].forEach((v, j) => cur[f][j] = v + (aim[f][j] - v) * k); }

const SOLVED = {};
let helper = null;
function solveTouches(curl = 0) {
    if (!helper) { helper = makeHand({ mat: () => new THREE.MeshBasicMaterial() }); helper.root.scale.setScalar(100); }
    const rig = helper.rig;
    for (const [name, P] of Object.entries(POSES)) {
        if (!P.touch) continue;
        const spec = TOUCH[P.touch], fk = pad6(P.thumb);
        let fingers = fingersAt(P, spec.bar ? 0 : curl);
        pose(rig, { ...fingers, thumb: fk }, 0, 0);
        if (spec.bar) { fingers = fitRound(rig, fingers, spec.bar); pose(rig, { ...fingers, thumb: fk }, 0, 0); }
        rig.root.updateMatrixWorld(true);
        SOLVED[name] = { thumb: solveThumb(rig, spec, fk), fingers: spec.bar ? fingers : null };
    }
}

const FRANGE = [[0, 1.6], [0, 1.9], [0, 1.4]];
function fitRound(rig, fingers, bar) {
    const { wrist, up, across, front, cm } = palmFrame(rig);
    const mid = wrist.clone().addScaledVector(front, bar.at[0] * cm).addScaledVector(up, bar.at[1] * cm);
    const fromAxis = p => { const d = p.clone().sub(mid); return d.addScaledVector(across, -d.dot(across)).length(); };
    const out = {};
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
        const name = `${f}-finger`, j = rig[name], start = fingers[f];
        const set = p => {
            turned(j[1], [j[1].spread, start[3]], [j[1].flex, p[0]]); turned(j[2], [j[2].flex, p[1]]); turned(j[3], [j[3].flex, p[2]]);
            j[1].b.updateMatrixWorld(true);
        };
        const cost = p => {
            set(p);
            const pts = [j[1], j[2], j[3], j[4]].map(x => x.b.getWorldPosition(new THREE.Vector3()));
            let c = 0;
            for (let s = 0; s < 3; s++) {
                let nearest = Infinity;
                for (const k of [0.25, 0.5, 0.75, 1]) {
                    const gap = fromAxis(pts[s].clone().lerp(pts[s + 1], k)) - (bar.r + FINGER_R[name] * (1 - s * 0.12)) * cm;
                    if (gap < 0) c += 100 * gap * gap;
                    nearest = Math.min(nearest, gap);
                }
                c += 2 * Math.max(nearest, 0) ** 2;
            }
            const tipFront = pts[3].clone().sub(wrist).dot(front) / cm;
            if (tipFront < 2.2) c += 100 * (2.2 - tipFront) ** 2;
            for (let k = 0; k < 3; k++) c += 0.05 * (p[k] - start[k]) ** 2;
            return c;
        };
        const descend = s0 => {
            const p = s0.map((v, k) => Math.min(FRANGE[k][1], Math.max(FRANGE[k][0], v)));
            let best = cost(p);
            for (const step of [0.16, 0.08, 0.04, 0.02]) for (let pass = 0; pass < 2; pass++) for (let k = 0; k < 3; k++) for (const s of [step, -step]) {
                const was = p[k]; p[k] = Math.min(FRANGE[k][1], Math.max(FRANGE[k][0], was + s));
                const c = cost(p); if (c < best) best = c; else p[k] = was;
            }
            return [p, best];
        };
        const [best] = [start.slice(0, 3), [0.6, 1.3, 0.8], [0.9, 1.2, 0.6], [1.2, 1.1, 0.5], [0.4, 1.5, 1.0]].map(descend).reduce((a, b) => b[1] < a[1] ? b : a);
        set(best);
        out[f] = [...best, start[3]];
    }
    return out;
}

function thumbTo(rig, [lift, sweep, knuckle, end, tilt = 0, roll = 0]) {
    const j = rig.thumb;
    turned(j[0], [j[0].lift, lift], [j[0].sweep, sweep], [j[0].tilt, tilt], [j[0].roll, roll]);
    turned(j[1], [j[1].flex, knuckle]);
    turned(j[2], [j[2].flex, end]);
}
const RANGE = [[-0.3, 1.4], [-0.6, 1.3], [0, 1.3], [0, 1.05], [0, 0.7], [-0.3, 1.2]];

const SEEDS = [[0.2, 0.1, 0.6, 0.4, 0, 0], [0.5, 0.3, 0.8, 0.8, 0.3, 0.6], [0.1, 0.4, 0.4, 0.2, 0, 0.3], [0.8, 0.5, 0.3, 0.1, 0.2, 0.9],
               [0.3, 0, 1.0, 1.0, 0.5, 0.6], [0.6, 0.2, 0.7, 0.6, 0.6, 1.0], [0.4, 0.1, 0.9, 0.8, 0.3, 0.3]];

const TOUCH = {

    pinch:   { goals: [['thumb:end', { end: 'index-finger' }, 1], ['thumb-phalanx-proximal', { palm: [4.2, -6, 6] }, 0.5]] },

    wrap:    { goals: [['thumb-phalanx-proximal', { palm: [5.4, -4.6, 5.4] }, 1], ['thumb-phalanx-distal', { seg: 'index-finger', out: 1.6, side: -0.6 }, 1],
                       ['thumb-tip', { seg: 'middle-finger', out: 1.7 }, 0.6]] },

    wrapLow: { goals: [['thumb-phalanx-proximal', { palm: [5.4, -4.6, 5.4] }, 1], ['thumb-phalanx-distal', { seg: 'middle-finger', out: 1.4, side: -0.8 }, 1],
                       ['thumb-tip', { seg: 'ring-finger', out: 1.7 }, 0.4]] },

    hold:    { bar: { at: [3.6, 6.9], r: 1.5 },
               goals: [['thumb-phalanx-distal', { seg: 'index-finger', out: 1.8, side: -0.4 }, 1], ['thumb-tip', { seg: 'middle-finger', out: 1.7 }, 0.6]] },
};
const wp = (rig, n) => rig.bone(n).getWorldPosition(new THREE.Vector3());

function tipEnd(rig, f) {
    const names = CHAIN(f), T = wp(rig, names[names.length - 1]), D = wp(rig, names[names.length - 2]);
    return T.clone().addScaledVector(T.clone().sub(D).normalize(), rig.nails[FINGERS.indexOf(f)].beyond * rig.root.scale.x);
}
const pointOf = (rig, joint) => joint.endsWith(':end') ? tipEnd(rig, joint.slice(0, -4)) : wp(rig, joint);

function palmFrame(rig) {
    const wrist = wp(rig, 'wrist');
    const up = wp(rig, 'middle-finger-phalanx-proximal').sub(wrist).normalize();
    const across = wp(rig, 'pinky-finger-phalanx-proximal').sub(wp(rig, 'index-finger-phalanx-proximal')).normalize();
    return { wrist, up, across, front: up.clone().cross(across).normalize(), cm: rig.root.scale.x / 100 };
}

function barCapsule(rig, bar) {
    const { wrist, up, across, front, cm } = palmFrame(rig);
    const mid = wrist.clone().addScaledVector(front, bar.at[0] * cm).addScaledVector(up, bar.at[1] * cm);
    const a = mid.clone().addScaledVector(across, -10 * cm);
    return [a, across.clone().multiplyScalar(18 * cm), bar.r * cm];
}
function places(rig, spec) {
    const { wrist, up, across, front, cm } = palmFrame(rig);
    return spec.map(([joint, p, weight]) => {
        let at;
        if (p.end) at = tipEnd(rig, p.end);
        else if (p.tip) at = rig.tip(p.tip).getWorldPosition(new THREE.Vector3());
        else if (p.palm) at = wrist.clone().addScaledVector(front, p.palm[0] * cm).addScaledVector(across, p.palm[1] * cm).addScaledVector(up, p.palm[2] * cm);
        else at = wp(rig, `${p.seg}-phalanx-intermediate`).lerp(wp(rig, `${p.seg}-phalanx-distal`), 0.5)
                     .addScaledVector(front, p.out * cm).addScaledVector(across, (p.side || 0) * cm);
        return [joint, at, weight];
    });
}

const FINGER_R = { 'index-finger': 0.85, 'middle-finger': 0.88, 'ring-finger': 0.82, 'pinky-finger': 0.72 };
const THUMB_R = [1.0, 1.0, 0.95, 0.9, 0.8];
const va = new THREE.Vector3(), vb = new THREE.Vector3();
function fingerCapsules(rig) {
    const caps = [];
    for (const f in FINGER_R) {
        const ch = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(s => wp(rig, `${f}-${s}`));
        for (let i = 0; i < 3; i++) caps.push([ch[i], ch[i + 1].clone().sub(ch[i]), FINGER_R[f] * (1 - i * 0.12)]);
    }
    return caps;
}
function overlap(p, r, caps) {
    let deep = 0;
    for (const [a, ab, rr] of caps) {
        const t = Math.max(0, Math.min(1, va.copy(p).sub(a).dot(ab) / ab.lengthSq()));
        const d = p.distanceTo(vb.copy(a).addScaledVector(ab, t)) - rr - r;
        if (d < deep) deep = d;
    }
    return -deep;
}
function solveThumb(rig, spec, fk) {
    const goals = places(rig, spec.goals), caps = fingerCapsules(rig);
    if (spec.bar) caps.push(barCapsule(rig, spec.bar));
    const cm = rig.root.scale.x / 100;
    const cost = p => {
        thumbTo(rig, p); rig.thumb[0].b.updateMatrixWorld(true);
        let c = 0;
        for (const [joint, g, weight] of goals) c += weight * pointOf(rig, joint).distanceToSquared(g);
        const kn = wp(rig, 'thumb-phalanx-proximal'), mk = wp(rig, 'thumb-phalanx-distal'), tp = wp(rig, 'thumb-tip');
        [kn, kn.clone().lerp(mk, 0.5), mk, mk.clone().lerp(tp, 0.5), tp].forEach((q, i) => c += 100 * overlap(q, THUMB_R[i] * cm, caps) ** 2);
        for (let k = 0; k < p.length; k++) c += 0.3 * (p[k] - fk[k]) ** 2;
        return c;
    };
    const descend = start => {
        const p = start.map((v, k) => Math.min(RANGE[k][1], Math.max(RANGE[k][0], v)));
        let best = cost(p);
        for (const step of [0.16, 0.08, 0.04, 0.02]) for (let sweep = 0; sweep < 2; sweep++) for (let k = 0; k < p.length; k++) for (const s of [step, -step]) {
            const was = p[k];
            p[k] = Math.min(RANGE[k][1], Math.max(RANGE[k][0], was + s));
            const c = cost(p);
            if (c < best) best = c; else p[k] = was;
        }
        return [p, best];
    };

    const [p, best] = [fk, ...SEEDS].map(descend).reduce((a, b) => b[1] < a[1] ? b : a);
    rig.solCost = best;
    return p;
}

export { FINGERS, POSES, LOOKS, SOLVED, TOUCH, makeHand, pose, bendWrist, pad6, fingersAt, aimFor, easeToward, solveTouches, thumbTo, palmFrame, barCapsule, porcelainLight };
