const C = window.ClipperLib;
export const S = 10000;
const KERF = 25, RIP = 4;
const DUST = 1e4;
const SCRAP = 0.004;
const TOUCH = 0.05;
const CLIP = { reach: 2.2, grip: [0.4, 1.3, 2.3] };
export const LIMITS = {
    layers: 4,
    flap: 0.3,
    carry: 3, slack: 4,
    share: .62,
    clean: 3, score: 2,
    snip: 4,
    thread: .25,
};

export const desk = { pieces: [], clips: [], tucks: [], bonds: [], n: 1, torn: null };

export const IDENT = [1, 0, 0, 1, 0, 0];
export const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
                              m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const det = m => m[0] * m[3] - m[1] * m[2];
export const inv = m => { const k = det(m); return [m[3] / k, -m[1] / k, -m[2] / k, m[0] / k, (m[2] * m[5] - m[3] * m[4]) / k, (m[1] * m[4] - m[0] * m[5]) / k]; };
export const apply = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
export const turn = (m, v) => ({ x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y });
export const translate = (x, y) => [1, 0, 0, 1, x, y];
export const rotateAbout = (c, ang) => { const s = Math.sin(ang), k = Math.cos(ang); return [k, s, -s, k, c.x - k * c.x + s * c.y, c.y - s * c.x - k * c.y]; };
const reflect = (a, d) => { const k = d.x * d.x - d.y * d.y, s = 2 * d.x * d.y; return [k, s, s, -k, a.x - k * a.x - s * a.y, a.y - s * a.x + k * a.y]; };
const cross = (u, v) => u.x * v.y - u.y * v.x, sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const EO = C.PolyFillType.pftEvenOdd, NZ = C.PolyFillType.pftNonZero, CT = C.ClipType;
function run(type, subj, clip, tree, fill = EO) {
    const c = new C.Clipper();
    c.AddPaths(subj, C.PolyType.ptSubject, true);
    if (clip && clip.length) c.AddPaths(clip, C.PolyType.ptClip, true);
    const out = tree ? new C.PolyTree() : new C.Paths();
    c.Execute(type, out, fill, fill);
    return out;
}
const tidy = paths => C.Clipper.CleanPolygons(paths, 1.5).filter(r => r.length > 2 && Math.abs(C.Clipper.Area(r)) > DUST);
const both = (a, b) => tidy(run(CT.ctIntersection, a, b));
const minus = (a, b) => tidy(run(CT.ctDifference, a, b));
const union = paths => run(CT.ctUnion, paths, null, false, NZ);
function islands(node, out = []) {
    for (const outer of node.Childs()) {
        const lump = [outer.Contour()];
        for (const hole of outer.Childs()) { lump.push(hole.Contour()); islands(hole, out); }
        out.push(lump);
    }
    return out;
}
const lumps = tree => islands(tree).map(l => { const o = tidy([l[0]]); return o.length ? o.concat(tidy(l.slice(1))) : null; }).filter(Boolean);
export const area = paths => Math.abs(paths.reduce((s, r) => s + C.Clipper.Area(r), 0)) / (S * S);
function swell(paths, by) {
    const co = new C.ClipperOffset(2, 2.5), out = new C.Paths();
    co.AddPaths(paths, C.JoinType.jtMiter, C.EndType.etClosedPolygon); co.Execute(out, by);
    return out;
}
const fat = paths => paths.length > 0 && area(paths) > 0.01 && swell(paths, -8).length > 0;
function intLine(pts) {
    const line = [];
    for (const p of pts) { const q = { X: Math.round(p.x * S), Y: Math.round(p.y * S) }, l = line[line.length - 1]; if (!l || l.X !== q.X || l.Y !== q.Y) line.push(q); }
    return line;
}
function kerf(pts, half = KERF, tol = 2.5) {
    const line = intLine(pts);
    if (line.length < 2) return [];
    const co = new C.ClipperOffset(2, tol), out = new C.Paths();
    co.AddPath(line, C.JoinType.jtRound, C.EndType.etOpenRound); co.Execute(out, half);
    return out;
}
function openIn(line, region) {
    const c = new C.Clipper(), tree = new C.PolyTree();
    c.AddPath(line, C.PolyType.ptSubject, false); c.AddPaths(region, C.PolyType.ptClip, true);
    c.Execute(CT.ctIntersection, tree, EO, EO);
    return C.Clipper.OpenPathsFromPolyTree(tree);
}
const mapInt = (paths, m) => paths.map(r => { const o = r.map(q => ({ X: Math.round(m[0] * q.X + m[2] * q.Y + m[4] * S), Y: Math.round(m[1] * q.X + m[3] * q.Y + m[5] * S) })); return det(m) < 0 ? o.reverse() : o; });
export const mapPoly = (paths, m) => mapInt(paths, m);
const toDesk = (paths, m) => paths.map(r => r.map(q => apply(m, { x: q.X / S, y: q.Y / S })));
const toCm = r => r.map(q => ({ x: q.X / S, y: q.Y / S }));
const micron = p => ({ x: Math.round(p.x * S) / S, y: Math.round(p.y * S) / S });
const toInt = rings => rings.map(r => r.map(q => ({ X: Math.round(q.x * S), Y: Math.round(q.y * S) })));
const wint = l => l.wint ??= toInt(l.world);
const boxOf = rings => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const r of rings) for (const q of r) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); } return { x0, y0, x1, y1 }; };
const apart = (a, b) => a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;
export const overlap = (a, b) => apart(a.box, b.box) ? 0 : area(both(wint(a), wint(b)));
export const overPlate = (l, poly) => area(both(wint(l), poly));

export function inside(p, rings) {
    let odd = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i], b = r[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) odd = !odd;
    }
    return odd;
}
function within(rings) {
    const b = boxOf(rings), r = rings[0], tries = [{ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, { x: r.reduce((s, q) => s + q.x, 0) / r.length, y: r.reduce((s, q) => s + q.y, 0) / r.length }];
    for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length], o = r[(i + 2) % r.length]; tries.push({ x: (p.x + q.x + o.x) / 3, y: (p.y + q.y + o.y) / 3 }); }
    return tries.find(p => inside(p, rings)) || r[0];
}

function halfOf(l, f, side = 1) {
    const n = { x: -f.d.y, y: f.d.x }, back = inv(l.M);
    const q = [[-900, 0], [900, 0], [900, 900 * side], [-900, 900 * side]].map(([u, v]) => apply(back, { x: f.a.x + f.d.x * u + n.x * v, y: f.a.y + f.d.y * u + n.y * v }));
    return [q.map(p => ({ X: Math.round(p.x * S), Y: Math.round(p.y * S) }))];
}
export function derive(piece) {
    let leaves = [{ sig: '', paths: piece.paths, M: IDENT }];
    for (const f of piece.folds) {
        const R = reflect(f.a, f.d), next = [];
        for (const l of leaves) {
            let over = both(l.paths, f.region), stay = l.paths;
            if (!fat(over)) over = [];
            else if (!fat(stay = minus(l.paths, f.region))) { over = l.paths; stay = []; }
            if (stay.length) next.push({ sig: l.sig + '0', paths: stay, M: l.M });
            if (over.length) next.push({ sig: l.sig + '1', paths: over, M: mul(R, l.M) });
        }
        leaves = next;
    }
    for (const l of leaves) l.piece = piece;
    piece.leaves = leaves;
    place(piece);
}
export function place(piece) {
    for (const l of piece.leaves) {
        l.W = mul(piece.P, l.M); l.back = det(l.W) < 0;
        l.world = toDesk(l.paths, l.W); l.box = boxOf(l.world); l.wint = null;
    }
}
const zOf = l => l.piece.z[l.sig];
export function stack() {
    return desk.pieces.flatMap(p => p.leaves).sort((a, b) => zOf(a) - zOf(b) || a.piece.id - b.piece.id);
}
function renumber() {
    const all = stack();
    for (const p of desk.pieces) p.z = {};
    all.forEach((l, i) => l.piece.z[l.sig] = i);
}
export function stackAt(p) {
    const here = stack().filter(l => p.x >= l.box.x0 && p.x <= l.box.x1 && p.y >= l.box.y0 && p.y <= l.box.y1 && inside(p, l.world));
    for (let n = 0, moved = true; moved && n < 4; n++) {
        moved = false;
        for (const t of desk.tucks) {
            const i = here.indexOf(t.la), j = here.indexOf(t.lb);
            if (i >= 0 && j > i && inside(p, t.region)) { here.splice(i, 1); here.splice(j, 0, t.la); moved = true; }
        }
    }
    return here;
}
export const topAt = p => stackAt(p).pop();
export const unitsAt = p => stackAt(p).reduce((s, l) => s + l.piece.units, 0);

export function addPiece(sheet, w, h, P, units = 1) {
    const X = Math.round(w * S), Y = Math.round(h * S);
    const piece = { id: desk.n++, sheet, units, paths: [[{ X: 0, Y: 0 }, { X, Y: 0 }, { X, Y }, { X: 0, Y }]], folds: [], P, z: { '': 1e9 },
                    glue: { front: [], back: [] }, perfs: [], tears: [], marks: [], rev: 0 };
    piece.fam = piece.id;
    desk.pieces.push(piece); derive(piece); renumber();
    return piece;
}
export function remove(piece) {
    desk.pieces = desk.pieces.filter(p => p !== piece);
    for (const c of desk.clips) c.ids = c.ids.filter(id => id !== piece.id);
    desk.clips = desk.clips.filter(c => c.ids.length || c.plate);
    renumber(); retuck();
}
export function shelve(piece) { remove(piece); const { leaves, ...p } = piece; return p; }
export function unshelve(p, P) { const piece = { ...p, P, z: { '': 1e9 } }; desk.pieces.push(piece); derive(piece); renumber(); return piece; }
export function raise(pieces) {
    const set = new Set(pieces);
    stack().filter(l => set.has(l.piece)).forEach((l, i) => l.piece.z[l.sig] = 1e9 + i);
    renumber();
}

export function moveBy(pieces, T) {
    const set = new Set(pieces), ids = new Set(pieces.map(p => p.id));
    const threaded = desk.tucks.filter(t => set.has(t.la.piece) !== set.has(t.lb.piece)).map(t => {
        const all = lumps(run(CT.ctIntersection, wint(t.la), wint(t.lb), true)), mine = all.findIndex(l => inside(t.at, toDesk(l, IDENT)));
        return { t, n: all.length, own: mine < 0 ? 0 : area(all[mine]), rest: all.filter((l, i) => i !== mine).map(area).filter(a => a > 0.3) };
    });
    const back = { P: pieces.map(p => p.P), clips: desk.clips.map(c => ({ ...c })), tucks: desk.tucks.map(t => ({ ...t })) };
    for (const p of pieces) { p.P = mul(T, p.P); place(p); }
    for (const c of desk.clips) if (c.ids.length && c.ids.every(id => ids.has(id))) { Object.assign(c, apply(T, c)); const n = turn(T, { x: c.nx, y: c.ny }); c.nx = n.x; c.ny = n.y; }
    for (const t of desk.tucks) if (set.has(t.la.piece) && set.has(t.lb.piece)) { t.at = apply(T, t.at); t.region = t.region.map(r => r.map(q => apply(T, q))); }
    if (desk.tucks.length) retuck();
    const caught = threaded.some(({ t, n, own, rest }) => {
        if (!desk.tucks.includes(t) || lumps(run(CT.ctIntersection, wint(t.la), wint(t.lb), true)).length >= n) return false;
        const now = area(toInt(t.region));
        return rest.some(a => now >= own + 0.6 * a);
    });
    if (!caught) return true;
    pieces.forEach((p, i) => { p.P = back.P[i]; place(p); });
    desk.clips = back.clips; desk.tucks = back.tucks;
    return false;
}
export function flip(pieces, c) {
    const set = new Set(pieces), ids = new Set(pieces.map(p => p.id)), T = [-1, 0, 0, 1, 2 * c.x, 0];
    const own = stack().filter(l => set.has(l.piece)), zs = own.map(zOf);
    own.forEach((l, i) => l.piece.z[l.sig] = zs[zs.length - 1 - i]);
    for (const p of pieces) { p.P = mul(T, p.P); place(p); }
    for (const k of desk.clips) if (k.ids.length && k.ids.every(id => ids.has(id))) { k.x = 2 * c.x - k.x; k.nx = -k.nx; }
    desk.tucks = desk.tucks.flatMap(t => set.has(t.la.piece) && set.has(t.lb.piece) ? [{ a: t.b, b: t.a, at: apply(T, t.at) }]
                                       : set.has(t.la.piece) || set.has(t.lb.piece) ? [] : [t]);
    renumber(); retuck();
}

const byId = id => desk.pieces.find(p => p.id === id);
function stuck(piece) {
    const out = [];
    for (const b of desk.bonds) { if (b.a === piece.fam) out.push(...b.ra); if (b.b === piece.fam) out.push(...b.rb); }
    return out.length ? run(CT.ctIntersection, union(out), piece.paths) : [];
}
const onDesk = (piece, region) => union(piece.leaves.flatMap(l => mapInt(run(CT.ctIntersection, l.paths, region), l.W)));

const objIds = new WeakMap(); let nextObj = 0;
const idOf = o => { let v = objIds.get(o); if (v === undefined) objIds.set(o, v = ++nextObj); return v; };
const shapeKey = p => p.id + '.' + idOf(p.leaves) + '.' + p.leaves.map(l => idOf(l.W)).join('.');
const keep = { glued: { key: null, val: null }, hooked: { key: null, val: null } };
function kept(slot, key, make) { const k = keep[slot]; if (k.key !== key) { k.key = key; k.val = make(); } return k.val; }
function glued() {
    if (!desk.bonds.length) return [];
    const fams = new Set(desk.bonds.flatMap(b => [b.a, b.b]));
    const key = desk.bonds.map(b => b.a + ':' + b.b + ':' + idOf(b.ra) + ':' + idOf(b.rb)).join(',') + '|' + desk.pieces.filter(p => fams.has(p.fam)).map(shapeKey).join(',');
    return kept('glued', key, gluedNow);
}
function gluedNow() {
    const out = [];
    for (const b of desk.bonds) {
        const side = (fam, r) => desk.pieces.filter(p => p.fam === fam).map(p => [p, onDesk(p, r)]).filter(([, w]) => w.length);
        const A = side(b.a, b.ra), B = side(b.b, b.rb);
        for (const [p, wp] of A) for (const [q, wq] of B) { const held = p !== q ? area(both(wp, wq)) : 0; if (held > 0.01) out.push([p, q, held]); }
    }
    return out;
}

export const bondArea = piece => glued().reduce((s, [p, q, held]) => s + (p === piece || q === piece ? held : 0), 0);
export const gluedTo = piece => glued().filter(([p, q]) => p === piece || q === piece).map(([p, q]) => p === piece ? q : p);
function unglue(piece, hit) {
    let gone = 0;
    const there = q => union(q.leaves.flatMap(l => mapInt(run(CT.ctIntersection, hit, wint(l)), inv(l.W))));
    for (const b of desk.bonds) for (const [mine, theirs] of [['ra', 'rb'], ['rb', 'ra']]) {
        if ((mine === 'ra' ? b.a : b.b) !== piece.fam) continue;
        const before = area(b[mine]);
        b[mine] = minus(b[mine], there(piece));
        if (before - area(b[mine]) < 1e-4) continue;
        gone += before - area(b[mine]);
        for (const q of desk.pieces) if (q !== piece && q.fam === (mine === 'ra' ? b.b : b.a)) b[theirs] = minus(b[theirs], there(q));
    }
    desk.bonds = desk.bonds.filter(b => area(b.ra) > 0.01 && area(b.rb) > 0.01);
    if (gone) piece.rev++;
    return gone;
}
export const unstick = piece => unglue(piece, onDesk(piece, stuck(piece)));
export const gluedOn = piece => toDesk(onDesk(piece, stuck(piece)), IDENT);
export function heldAt(piece, p) {
    if (desk.bonds.length && inside(p, gluedOn(piece))) return 'glued';
    return desk.clips.some(c => c.ids.includes(piece.id) && CLIP.grip.some(t => Math.hypot(c.x + c.nx * t - p.x, c.y + c.ny * t - p.y) < 0.7)) ? 'clipped' : null;
}
export function stuckAt(p, r) {
    const spot = [Array.from({ length: 16 }, (_, i) => ({ X: Math.round((p.x + Math.cos(i * Math.PI / 8) * r) * S), Y: Math.round((p.y + Math.sin(i * Math.PI / 8) * r) * S) }))];
    for (const piece of [...new Set(stackAt(p).reverse().map(l => l.piece))]) {
        const patch = onDesk(piece, stuck(piece));
        if (patch.length && area(both(patch, spot)) > 1e-3) return { piece, rings: toDesk(patch, IDENT), deep: inside(p, toDesk(swell(patch, -r * 1.3 * S), IDENT)) };
    }
    for (const piece of desk.pieces) {
        const patch = onDesk(piece, stuck(piece));
        if (patch.length && area(both(patch, spot)) > 1e-3) return { piece, rings: toDesk(patch, IDENT), deep: false };
    }
    return null;
}
export const peel = (piece, pts, r) => unglue(piece, kerf(pts.length > 1 ? pts : [pts[0], { x: pts[0].x + 0.002, y: pts[0].y }], r * S, 40));
function hooked() {
    if (!desk.pieces.some(x => x.leaves.length > 1)) return [];
    return kept('hooked', desk.pieces.map(p => shapeKey(p) + '.' + p.leaves.map(zOf).join('.')).join(','), hookedNow);
}
function hookedNow() {
    const out = [];
    for (const x of desk.pieces) if (x.leaves.length > 1) for (const y of desk.pieces) {
        if (y !== x && y.leaves.some(o => x.leaves.some(l => zOf(l) > zOf(o) && overlap(l, o) > TOUCH) && x.leaves.some(l => zOf(l) < zOf(o) && overlap(l, o) > TOUCH))) out.push([x, y]);
    }
    return out;
}
export function group(piece) {
    const pairs = glued().concat(hooked());
    for (const c of desk.clips) for (const id of c.ids.slice(1)) pairs.push([byId(c.ids[0]), byId(id)]);
    const set = new Set([piece]);
    for (let grew = true; grew;) { grew = false; for (const [p, q] of pairs) if (set.has(p) !== set.has(q)) { set.add(p); set.add(q); grew = true; } }
    return [...set];
}
export function holds(piece) {
    const out = [];
    for (const c of desk.clips) if (c.ids.includes(piece.id)) out.push({ x: c.x + c.nx * CLIP.grip[2], y: c.y + c.ny * CLIP.grip[2] });
    for (const r of toDesk(onDesk(piece, stuck(piece)), IDENT)) out.push(...r);
    for (const [x, y] of hooked()) if (x === piece) for (const l of x.leaves) if (y.leaves.some(o => overlap(l, o) > TOUCH && zOf(l) < zOf(o))) out.push(...l.world.flat());
    return out;
}
export function riders(pieces) {
    const set = new Set(pieces);
    for (let grew = true; grew;) {
        grew = false;
        const mine = stack().filter(l => set.has(l.piece));
        for (const q of desk.pieces) {
            if (set.has(q)) continue;
            let on = 0, all = 0;
            for (const o of q.leaves) { all += area(o.paths); on += Math.max(0, ...mine.filter(l => zOf(l) < zOf(o)).map(l => overlap(l, o))); }
            if (on > all * 0.5) { for (const g of group(q)) set.add(g); grew = true; }
        }
    }
    return [...set].filter(p => !pieces.includes(p));
}
function lyingOn(o, l) {
    const tucked = (a, b) => desk.tucks.reduce((s, t) => s + (t.la === a && t.lb === b && t.region ? area(toInt(t.region)) : 0), 0);
    return zOf(o) > zOf(l) ? overlap(o, l) - tucked(l, o) : tucked(o, l);
}
export function swallowed(pieces) {
    const set = new Set(pieces);
    for (const q of desk.pieces) {
        if (q.leaves.length < 2) continue;
        const zs = q.leaves.map(zOf), lo = Math.min(...zs), hi = Math.max(...zs), mine = set.has(q);
        for (const o of desk.pieces) if (o !== q && set.has(o) !== mine) for (const l of o.leaves) if (zOf(l) > lo && zOf(l) < hi && q.leaves.some(m => overlap(l, m) > TOUCH)) return true;
    }
    return false;
}
export function freeOf(l) {
    const over = stack().filter(o => o !== l && zOf(o) > zOf(l) && !apart(o.box, l.box)).flatMap(wint);
    return over.length ? minus(wint(l), union(over)) : wint(l);
}
export function covered(pieces) {
    const set = new Set(pieces), all = stack();
    return all.some(o => !set.has(o.piece) && all.some(l => set.has(l.piece) && lyingOn(o, l) > TOUCH));
}

function near(lines, paths, pad) {
    if (!lines.length) return lines;
    const zone = swell(paths, pad), out = [];
    for (const line of lines) {
        const pts = intLine(line);
        if (pts.length > 1) for (const part of openIn(pts, zone)) if (part.length > 1) out.push(line.of ? Object.assign(toCm(part), { of: line.of }) : toCm(part));
    }
    return out;
}
function slice(piece, gone) {
    const was = area(piece.paths), all = lumps(run(CT.ctDifference, piece.paths, gone, true));
    if (all.length === 1 && was - area(all[0]) < 1e-5) return [];
    const left = all.filter(l => area(l) > SCRAP).sort((a, b) => area(b) - area(a));
    if (!left.length) { remove(piece); return [piece]; }
    const { perfs, tears, marks } = piece;
    const made = left.map((paths, i) => {
        const own = { paths, perfs: near(perfs, paths, 500), tears: near(tears, paths, 900), marks: near(marks, paths, 500) };
        return i ? { ...piece, id: desk.n++, ...own, folds: piece.folds.map(f => ({ ...f })), P: [...piece.P], z: { ...piece.z }, glue: { ...piece.glue } } : Object.assign(piece, own);
    });
    for (const p of made) { if (p !== piece) desk.pieces.push(p); p.rev++; derive(p); }
    return made;
}
const through = (piece, K) => union(piece.leaves.flatMap(l => run(CT.ctIntersection, mapInt(K, inv(l.W)), swell(l.paths, 3))));

function upTo(pts, bad) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
        for (let k = 1; k <= n; k++) { const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }; if (bad(p)) { out.push(p); return [out, true]; } }
        out.push(b);
    }
    return [out, false];
}

export function cut(pts, opt = {}) {
    const clean = opt.clean ?? LIMITS.clean, score = opt.score ?? LIMITS.score, out = { made: [], scars: [], jam: false };
    if (opt.snip) [pts, out.jam] = upTo(pts, p => unitsAt(p) > clean);
    const K = kerf(pts), line = intLine(pts);
    if (!K.length) return out;
    const kb = boxOf(toDesk(K, IDENT)), reach = new Map(), work = new Map();
    const kerfFor = piece => {
        if (!opt.snip) return K;
        if (!reach.has(piece)) { const i = pts.findIndex(p => !piece.leaves.some(l => inside(p, l.world))); reach.set(piece, i < 0 ? [] : i ? kerf(pts.slice(i)) : K); }
        return reach.get(piece);
    };
    let A = [K];
    for (const l of stack().reverse()) {
        if (apart(l.box, kb) || (opt.only && !opt.only(l.piece))) continue;
        const mine = kerfFor(l.piece), cover = mine.length ? run(CT.ctIntersection, mine, swell(wint(l), 3)) : [];
        if (!cover.length) continue;
        const w = work.get(l.piece) || work.set(l.piece, { gone: [], scored: [] }).get(l.piece), back = inv(l.W), u = opt.layers ? 1 : l.piece.units, next = A.slice();
        A.forEach((a, k) => {
            const hit = a && a.length ? run(CT.ctIntersection, a, cover) : [];
            if (area(hit) < 1e-7) return;
            if (k + u <= clean) w.gone.push(...mapInt(hit, back));
            else if (k + u <= clean + score) w.scored.push(...openIn(line, hit).map(r => r.map(q => micron(apply(back, { x: q.X / S, y: q.Y / S })))));
            next[k] = run(CT.ctDifference, next[k], hit);
            next[k + u] = union((next[k + u] || []).concat(hit));
        });
        A = next;
    }
    for (const [piece, w] of work) {
        const scored = w.scored.filter(s => s.reduce((sum, q, i) => i ? sum + Math.hypot(q.x - s[i - 1].x, q.y - s[i - 1].y) : 0, 0) > 0.05);
        if (scored.length) { piece.perfs = piece.perfs.concat(scored); piece.rev++; }
        const made = w.gone.length ? slice(piece, union(w.gone)) : [];
        out.made.push(...(made.length ? made : scored.length ? [piece] : []));
    }
    if (opt.safe && clean > 0) {
        const bare = union(A.slice(0, clean + 1).filter(Boolean).flat()), open = opt.safe.length ? run(CT.ctDifference, bare, union(opt.safe)) : bare;
        out.scars = openIn(line, open).map(toCm).filter(s => s.length > 1);
    }
    if (out.made.length) { renumber(); reclip(); retuck(); }
    return out;
}

function jag(pts, seed, amp = 0.12) {
    const r = rng(seed), out = [];
    let drift = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1, n = Math.max(1, Math.round(len / 0.12)), nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
        for (let k = 0; k < n; k++) {
            drift = drift * 0.86 + (r() - 0.5) * amp * 0.9;
            const off = drift + (r() - 0.5) * amp * 0.5;
            out.push({ x: a.x + (b.x - a.x) * k / n + nx * off, y: a.y + (b.y - a.y) * k / n + ny * off });
        }
    }
    const first = pts[0], last = pts[pts.length - 1];
    out.push(Math.hypot(last.x - first.x, last.y - first.y) < 0.02 ? out[0] : last);
    return out;
}
function stretch(pts, by) {
    const a = pts[0], b = pts[1], y = pts[pts.length - 2], z = pts[pts.length - 1], l0 = Math.hypot(a.x - b.x, a.y - b.y) || 1, l1 = Math.hypot(z.x - y.x, z.y - y.y) || 1;
    if (Math.hypot(z.x - a.x, z.y - a.y) < 0.02) return pts;
    return [{ x: a.x + (a.x - b.x) / l0 * by, y: a.y + (a.y - b.y) / l0 * by }, ...pts, { x: z.x + (z.x - y.x) / l1 * by, y: z.y + (z.y - y.y) / l1 * by }];
}
export function tear(piece, pts, seed = 1, amp) {
    const rough = jag(pts, seed, amp), line = intLine(rough), was = piece.tears, on = piece.leaves.flatMap(l => openIn(line, swell(wint(l), 30)).map(toCm));
    piece.tears = was.concat(piece.leaves.flatMap(l => openIn(mapInt([line], inv(l.W))[0], swell(l.paths, 30)).map(toCm).filter(m => m.length > 1)));
    const made = slice(piece, through(piece, kerf(rough, RIP)));
    if (made.length) { renumber(); reclip(); retuck(); desk.torn = on; } else piece.tears = was;
    return made;
}

export function seams(piece) {
    if (!piece.perfs.length) return null;
    const parts = lumps(run(CT.ctDifference, piece.paths, union(piece.perfs.flatMap(p => kerf(p))), true)).filter(l => area(l) > SCRAP);
    return parts.length > 1 ? parts : null;
}
const leafAt = (piece, p) => piece.leaves.filter(l => inside(p, l.world)).sort((a, b) => zOf(b) - zOf(a))[0];
export function partAt(piece, parts, p) {
    const l = leafAt(piece, p), s = l && apply(inv(l.W), p);
    return l ? parts.findIndex(part => inside(s, toDesk(part, IDENT))) : -1;
}
export function seamOf(piece, part) {
    const lines = piece.perfs.filter(p => area(both(kerf(p, 60), swell(part, 60))) > 0);
    return lines.flatMap(p => piece.leaves.flatMap(l => openIn(intLine(p), swell(l.paths, 30)).map(r => r.map(q => apply(l.W, { x: q.X / S, y: q.Y / S })))));
}
export function separate(piece, part, seed) {
    const lines = piece.perfs.filter(p => area(both(kerf(p, 60), swell(part, 60))) > 0);
    const rough = seed ? lines.map((p, i) => jag(stretch(p, 0.6), seed + i, 0.5)) : null;
    piece.perfs = piece.perfs.filter(p => !lines.includes(p));
    if (rough) { piece.tears = piece.tears.concat(rough.map(r => r.map(micron))); desk.torn = rough.flatMap(r => piece.leaves.flatMap(l => openIn(intLine(r), swell(l.paths, 30)).map(part => part.map(q => apply(l.W, { x: q.X / S, y: q.Y / S }))))); }
    const made = slice(piece, union((rough || lines).flatMap(p => kerf(p, seed ? RIP : KERF))));
    if (made.length) { renumber(); reclip(); retuck(); }
    return made;
}

const mitred = (paths, by) => { const co = new C.ClipperOffset(20, 2.5), out = new C.Paths(); co.AddPaths(paths, C.JoinType.jtMiter, C.EndType.etClosedPolygon); co.Execute(out, by); return out; };
const threaded = new WeakMap();
function partsOf(piece) {
    const c = threaded.get(piece); if (c && c.paths === piece.paths) return c.parts;
    const d = LIMITS.thread * S / 2, cores = lumpsOf(swell(piece.paths, -d));
    const parts = cores.length > 1 ? cores.map(k => both(mitred(k, d + 3), piece.paths)).filter(p => p.length) : [];
    threaded.set(piece, { paths: piece.paths, parts });
    return parts;
}
const threadsOf = (piece, part) => { const inner = swell(piece.paths, -10); return part.flatMap(r => openIn(r.concat([r[0]]), inner)).filter(l => l.length > 1); };
const onDeskLines = (piece, lines) => lines.flatMap(c => piece.leaves.flatMap(l => openIn(c, swell(l.paths, 30)).map(r => r.map(q => apply(l.W, { x: q.X / S, y: q.Y / S })))));
export function threadAt(piece, p) {
    const parts = partsOf(piece), i = parts.length > 1 ? partAt(piece, parts, p) : -1;
    return i < 0 ? null : { part: parts[i], small: area(parts[i]) * 2 < area(piece.paths), line: onDeskLines(piece, threadsOf(piece, parts[i])) };
}
export function snap(piece, part) {
    const lines = threadsOf(piece, part), was = piece.tears;
    piece.tears = was.concat(lines.map(toCm)); desk.torn = onDeskLines(piece, lines);
    const made = slice(piece, run(CT.ctDifference, swell(part, 2 * RIP), part));
    if (made.length) { renumber(); reclip(); retuck(); } else { piece.tears = was; desk.torn = null; }
    return made;
}

function plan(piece, f, grab) {
    const gw = apply(piece.P, grab), seed = leafAt(piece, gw);
    if (!seed) return { why: 'miss' };
    const known = new Map(), comps = l => known.get(l) || known.set(l, lumps(run(CT.ctIntersection, l.paths, halfOf(l, f), true))).get(l);
    const gs = apply(inv(seed.M), grab), first = comps(seed).find(c => inside(gs, toDesk(c, IDENT)));
    if (!first) return { why: 'miss' };
    const parts = [{ leaf: seed, comp: first }];
    for (let i = 0; i < parts.length; i++) {
        const near = swell(parts[i].comp, 6);
        for (const l of piece.leaves) if (l !== parts[i].leaf) for (const c of comps(l)) {
            if (!parts.some(p => p.leaf === l && p.comp === c) && area(run(CT.ctIntersection, near, c)) > 2e-4) parts.push({ leaf: l, comp: c });
        }
    }
    return { parts };
}
function thickest(piece) {
    if (piece.leaves.length > LIMITS.layers) {
        const deep = [];
        for (const l of piece.leaves) {
            for (let k = Math.min(deep.length, LIMITS.layers) - 1; k >= 0; k--) { const more = both(deep[k], wint(l)); if (more.length && area(more) > 0.02) deep[k + 1] = deep[k + 1] ? union(deep[k + 1].concat(more)) : more; }
            deep[0] = deep[0] ? union(deep[0].concat(wint(l))) : wint(l);
        }
        return deep.length;
    }
    let most = 1;
    for (const l of piece.leaves) for (const r of l.world) for (let i = 0; i < r.length; i += Math.max(1, Math.floor(r.length / 8))) {
        const a = r[i], b = r[(i + 1) % r.length], c = r[(i + 2) % r.length], p = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
        most = Math.max(most, piece.leaves.filter(o => inside(p, o.world)).length);
    }
    for (const l of piece.leaves) most = Math.max(most, piece.leaves.filter(o => inside(within(l.world), o.world)).length);
    return most;
}
function hinges(piece) {
    const out = [];
    for (const l of piece.leaves) for (const e of creases(l)) {
        const ms = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, other = piece.leaves.find(o => o !== l && inside({ x: ms.x - e.n.x * 0.004, y: ms.y - e.n.y * 0.004 }, toDesk(o.paths, IDENT)));
        if (!other || piece.leaves.indexOf(other) < piece.leaves.indexOf(l)) continue;
        const n = turn(l.W, e.n), len = Math.hypot(n.x, n.y) || 1;
        for (const t of [0.25, 0.5, 0.75]) out.push({ m: apply(l.W, { x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t }), n: { x: -n.x / len, y: -n.y / len }, a: l, b: other });
    }
    return out;
}
export function pierced(piece) {
    return hinges(piece).some(h => {
        const lo = Math.min(zOf(h.a), zOf(h.b)), hi = Math.max(zOf(h.a), zOf(h.b));
        const out = { x: h.m.x + h.n.x * 0.06, y: h.m.y + h.n.y * 0.06 }, inn = { x: h.m.x - h.n.x * 0.06, y: h.m.y - h.n.y * 0.06 };
        return stack().some(o => o !== h.a && o !== h.b && zOf(o) > lo && zOf(o) < hi && inside(out, o.world) && inside(inn, o.world));
    });
}
export function fold(piece, a, d, under, grab, round) {
    const f = { a, d, under: !!under !== det(piece.P) < 0 }, pl = plan(piece, f, grab);
    if (pl.why) return pl;
    const R = reflect(a, d), parts = pl.parts;
    for (const p of parts) { p.wint = mapInt(p.comp, p.leaf.W); p.dint = mapInt(p.comp, mul(piece.P, mul(R, p.leaf.M))); }
    const goes = parts.reduce((s, p) => s + area(p.comp), 0), whole = area(piece.paths), off = (l, q) => cross(d, sub(apply(l.M, { x: q.X / S, y: q.Y / S }), a));
    if (goes > whole - TOUCH) return { why: 'all' };
    const deep = Math.max(...parts.flatMap(p => p.comp.flat().map(q => off(p.leaf, q))));
    if (deep < LIMITS.flap * parts.length) return { why: 'small' };
    if (goes > 0.8 * whole && !(Math.max(...piece.leaves.flatMap(l => run(CT.ctIntersection, l.paths, halfOf(l, f, -1)).flat().map(q => -off(l, q)))) >= LIMITS.flap)) return { why: 'all' };
    if (goes > LIMITS.share * whole || deep > LIMITS.carry * cross(d, sub(grab, a)) + (goes * 2 > whole ? 0 : LIMITS.slack)) return { why: 'most' };
    const held = stuck(piece);
    if (held.length && parts.some(p => area(both(p.comp, held)) > 0.01)) return { why: 'glued' };
    for (const c of desk.clips) if (c.ids.includes(piece.id)) for (const t of CLIP.grip)
        if (parts.some(p => inside({ x: c.x + c.nx * t, y: c.y + c.ny * t }, toDesk(p.wint, IDENT)))) return { why: 'clipped' };
    const pile = stack();
    let lifted = null;
    const rides = o => (lifted ||= new Set(pileOn(piece))).has(o.piece);
    for (const p of parts) for (const o of pile) {
        if (o.piece !== piece) {
            if (lyingOn(o, p.leaf) > TOUCH && area(both(wint(o), p.wint)) > TOUCH && (!under || area(both(wint(o), p.dint)) > TOUCH)) return { why: 'pinned' };
            if (under && zOf(o) > zOf(p.leaf) && area(both(wint(o), p.dint)) > TOUCH && !rides(o)) return { why: 'way' };
            continue;
        }
        if (zOf(o) <= zOf(p.leaf)) continue;
        if (under) continue;
        const mine = parts.filter(q => q.leaf === o).flatMap(q => q.wint), rest = mine.length ? run(CT.ctDifference, wint(o), union(mine)) : wint(o);
        if (area(both(rest, p.wint)) > TOUCH) return { why: 'lip' };
    }
    const region = union(parts.flatMap(p => run(CT.ctIntersection, swell(p.comp, 5), halfOf(p.leaf, f))));
    const was = new Map(piece.leaves.map(l => [l.sig, l])), oldZ = piece.z, up = l => l.sig.slice(0, -1), undo = why => { piece.folds.pop(); piece.z = oldZ; derive(piece); return { why }; };
    const rank = Object.fromEntries(piece.leaves.slice().sort((p, q) => (zOf(p) - zOf(q)) * (det(piece.P) < 0 ? -1 : 1)).map((l, i) => [l.sig, i]));
    piece.folds.push({ ...f, region, rank });
    derive(piece);
    const flap = piece.leaves.filter(l => l.sig.endsWith('1')), z = {};
    if (!flap.length || flap.length === piece.leaves.length) return undo('miss');
    for (const l of piece.leaves) if (l.sig.endsWith('0')) z[l.sig] = oldZ[up(l)];
    flap.sort((p, q) => oldZ[up(q)] - oldZ[up(p)]);
    if (!under) flap.forEach((l, i) => z[l.sig] = 1e9 + i);
    else {
        const ref = Math.min(...flap.map(l => oldZ[up(l)])), mine = new Set(flap), others = desk.pieces.flatMap(p => p.leaves).filter(o => !mine.has(o));
        const zNow = o => o.piece === piece ? z[o.sig] : zOf(o);
        let stop = -Infinity;
        for (const o of others) for (const l of flap) {
            if (zNow(o) >= ref || overlap(o, l) <= TOUCH) continue;
            const from = mapInt(l.paths, mul(piece.P, was.get(up(l)).M)), across = area(both(wint(o), from)) > TOUCH;
            if (!round || o.piece === piece) { if (across) stop = Math.max(stop, zNow(o)); }
            else if (!round.includes(o.piece)) stop = Math.max(stop, zNow(o));
            else if (across) return undo('edge');
        }
        const all = others.map(zNow), over = all.filter(v => v > stop), next = over.length ? Math.min(...over) : stop + 1;
        flap.forEach((l, i) => z[l.sig] = stop === -Infinity ? Math.min(...all) - flap.length + i : stop + (next - stop) * (i + 1) / (flap.length + 1));
    }
    piece.z = z;
    if (thickest(piece) > LIMITS.layers) return undo('thick');
    if (pierced(piece)) return undo('lip');
    renumber(); retuck();
    return true;
}

export const flapOf = (piece, k) => piece.leaves.filter(l => l.sig[k] === '1');
export const live = (piece, k) => piece.leaves.some(l => l.sig[k] === '1') && piece.leaves.some(l => l.sig[k] === '0');
export function foldAt(l) {
    for (let k = l.sig.length - 1; k >= 0; k--) if (l.sig[k] === '1' && live(l.piece, k)) return k;
    return -1;
}
export const behind = (piece, k) => piece.folds[k].under !== det(piece.P) < 0;
export function pileOn(piece) {
    const up = new Set(group(piece));
    for (let more = true; more;) {
        more = false;
        for (const o of desk.pieces) if (!up.has(o) && o.leaves.some(l => [...up].some(q => q.leaves.some(m => zOf(l) > zOf(m) && overlap(l, m) > TOUCH)))) { for (const g of group(o)) up.add(g); more = true; }
    }
    return [...up];
}
export function canOpen(piece, k) {
    const f = piece.folds[k], flap = flapOf(piece, k), mine = new Set(flap), held = stuck(piece);
    if (!f || !live(piece, k)) return { why: 'flat' };
    const down = behind(piece, k), pile = stack();
    if (flap.some(l => l.sig.slice(k + 1).includes('1'))) return { why: 'refolded' };
    if (held.length && flap.some(l => area(both(l.paths, held)) > 0.01)) return { why: 'glued' };
    for (const c of desk.clips) if (c.ids.includes(piece.id)) for (const t of CLIP.grip)
        if (flap.some(l => inside({ x: c.x + c.nx * t, y: c.y + c.ny * t }, l.world))) return { why: 'clipped' };
    for (const o of pile) if (!mine.has(o)) for (const l of flap) {
        if ((down ? lyingOn(l, o) : lyingOn(o, l)) <= TOUCH) continue;
        if (o.piece === piece) return { why: 'covered' };
        if (!down) return { why: 'pinned' };
    }
    if (down) return true;
    const R = reflect(f.a, f.d), on = new Set(pileOn(piece)), low = Math.min(...piece.leaves.filter(l => !mine.has(l)).map(zOf));
    for (const l of flap) {
        const out = mapInt(l.paths, mul(piece.P, mul(R, l.M))), base = piece.z[l.sig.slice(0, k) + '0' + l.sig.slice(k + 1)] ?? low;
        for (const o of pile) if (!mine.has(o) && zOf(o) > base && area(both(wint(o), out)) > TOUCH) {
            if (o.piece === piece) return { why: 'covered' };
            if (on.has(o.piece)) return { why: 'blocked' };
        }
    }
    return true;
}
export function unfold(piece, k = piece.folds.length - 1) {
    if (!piece.folds.length) return false;
    const ok = canOpen(piece, k);
    if (ok !== true) return ok;
    const f = piece.folds[k], drop = s => s.slice(0, k) + s.slice(k + 1), z = {}, stays = [], rank = l => (f.rank[l.sig.slice(0, k)] ?? 0) * (det(piece.P) < 0 ? -1 : 1);
    for (const l of flapOf(piece, k)) for (const e of creases(l)) {
        if (Math.abs(cross(f.d, sub(apply(l.M, { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }), f.a))) < 0.01) piece.marks = piece.marks.concat([[e.a, e.b]]);
    }
    for (const l of piece.leaves) if (l.sig[k] === '0') { z[drop(l.sig)] = zOf(l); stays.push([rank(l), zOf(l)]); }
    for (const l of flapOf(piece, k)) if (!(drop(l.sig) in z)) {
        const r = rank(l), low = stays.filter(s => s[0] < r).sort((p, q) => q[0] - p[0])[0], high = stays.filter(s => s[0] > r).sort((p, q) => p[0] - q[0])[0];
        z[drop(l.sig)] = low ? low[1] + .25 + r * 1e-4 : high ? high[1] - .25 + r * 1e-4 : zOf(l);
    }
    piece.folds.splice(k, 1); piece.z = z; piece.rev++;
    derive(piece); renumber(); retuck();
    raise(pileOn(piece));
    return true;
}

export function edgeAt(l, p, reach = 3, cornerIn = 1.2) {
    const above = stack().filter(o => o !== l && zOf(o) > zOf(l) && !apart(o.box, l.box)), folds = creases(l).map(e => [apply(l.W, e.a), apply(l.W, e.b)]);
    const offLine = (q, [a, b]) => { const ex = b.x - a.x, ey = b.y - a.y, t = Math.max(0, Math.min(1, ((q.x - a.x) * ex + (q.y - a.y) * ey) / (ex * ex + ey * ey || 1))); return Math.hypot(q.x - a.x - ex * t, q.y - a.y - ey * t); };
    const held = (q, m) => folds.some(f => offLine(q, f) < .03) || above.some(o => inside({ x: q.x + m.x * .08, y: q.y + m.y * .08 }, o.world));
    const near = [];
    l.world.forEach((ring, k) => ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length], ex = b.x - a.x, ey = b.y - a.y, len2 = ex * ex + ey * ey;
        const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2)) : 0, q = { x: a.x + ex * t, y: a.y + ey * t }, dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist <= reach && len2 > 1e-10) near.push({ k, i, q, dist, ex, ey, len: Math.sqrt(len2) });
    }));
    const best = near.sort((a, b) => a.dist - b.dist).find(c => {
        let m = { x: -c.ey / c.len, y: c.ex / c.len };
        if (!inside({ x: c.q.x + m.x * .06, y: c.q.y + m.y * .06 }, l.world)) m = { x: -m.x, y: -m.y };
        return !held(c.q, m);
    });
    if (!best) return null;
    const ring = l.world[best.k], n = ring.length, un = v => { const d = Math.hypot(v.x, v.y) || 1; return { x: v.x / d, y: v.y / d }; };
    const way = sign => {
        const pts = [best.q], at = [0];
        for (let s = 0, j = sign > 0 ? best.i + 1 : best.i; s < n; s++, j += sign) { const v = ring[((j % n) + n) % n], w = pts[pts.length - 1], d = Math.hypot(v.x - w.x, v.y - w.y); if (d > 1e-6) { pts.push(v); at.push(at[at.length - 1] + d); } }
        const total = at[at.length - 1];
        return { pts, at, total, on: s => { s = Math.max(0, Math.min(total, s)); let i = 1; while (i < at.length - 1 && at[i] < s) i++; const f = (s - at[i - 1]) / (at[i] - at[i - 1] || 1); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f }; } };
    };
    const F = way(1), B = way(-1), r0 = Math.min(1, F.total / 8), ref = un(sub(F.on(r0), B.on(r0)));
    let inn = { x: -ref.y, y: ref.x };
    if (!inside({ x: best.q.x + inn.x * .06, y: best.q.y + inn.y * .06 }, l.world)) inn = { x: -inn.x, y: -inn.y };
    const straight = (W, dir) => {
        const most = Math.min(W.total / 2, 60);
        for (let s = .5; s < most + .5; s += .5) {
            const c = W.on(s), d = un(sub(c, W.on(Math.max(0, s - 1))));
            if (d.x * dir.x + d.y * dir.y < .88) {
                let turn = 0, where = s - .5;
                for (let i = 1; i < W.pts.length - 1; i++) if (W.at[i] > s - 1.3 && W.at[i] <= s) { const a = un(sub(W.pts[i], W.pts[i - 1])), b = un(sub(W.pts[i + 1], W.pts[i])), t = Math.abs(Math.atan2(cross(a, b), a.x * b.x + a.y * b.y)); if (t > turn) { turn = t; where = W.at[i]; } }
                return { to: where, corner: turn > .35 ? where : null };
            }
            if (held(c, inn)) return { to: Math.max(0, s - .5), corner: null };
        }
        return { to: most, corner: null };
    };
    const f = straight(F, ref), b = straight(B, { x: -ref.x, y: -ref.y });
    const piece = (W, s0, s1) => { const out = [W.on(s0)]; for (let i = 0; i < W.pts.length; i++) if (W.at[i] > s0 && W.at[i] < s1) out.push(W.pts[i]); out.push(W.on(s1)); return out; };
    let lines = [piece(B, 0, b.to).reverse().concat(piece(F, 0, f.to).slice(1))], at = best.q, corner = false, dir = ref;
    for (const [W, r] of [[F, f], [B, b]]) {
        if (corner || r.corner == null || r.corner > cornerIn) continue;
        const c = W.on(r.corner), past = W.on(r.corner + 1), back = W.on(Math.max(0, r.corner - 1)), m = un({ x: un(sub(past, c)).x + un(sub(back, c)).x, y: un(sub(past, c)).y + un(sub(back, c)).y });
        const into = inside({ x: c.x + m.x * .1, y: c.y + m.y * .1 }, l.world) ? m : { x: -m.x, y: -m.y };
        if (held(W.on(r.corner + .6), into) || folds.some(fo => offLine(past, fo) < .03)) continue;
        corner = true; at = c; inn = into; dir = null;
        const other = W === F ? B : F;
        lines = [piece(other, 0, Math.min(other.total, Math.max(.1, 3 - r.corner))).reverse().concat(piece(W, 0, r.corner).slice(1)), piece(W, r.corner, Math.min(W.total, r.corner + 3))];
    }
    const band = run(CT.ctIntersection, lines.flatMap(line => kerf(line, 0.32 * S, 40)), wint(l));
    return { at: { x: at.x + inn.x * .06, y: at.y + inn.y * .06 }, edge: at, n: inn, dir, corner, lines, band };
}

function flapLine(piece, a, d, grab) {
    const pl = plan(piece, { a, d }, grab);
    if (pl.why) return null;
    const us = pl.parts.flatMap(p => p.comp.flat().map(q => { const w = apply(p.leaf.M, { x: q.X / S, y: q.Y / S }); return (w.x - a.x) * d.x + (w.y - a.y) * d.y; }));
    return { parts: pl.parts, ends: [Math.min(...us) - 1, Math.max(...us) + 1].map(u => ({ x: a.x + d.x * u, y: a.y + d.y * u })) };
}
export function tearLine(piece, a, d, grab, seed = 1) {
    const fl = flapLine(piece, a, d, grab);
    if (!fl) return null;
    const rough = jag(fl.ends, seed), far = q => Math.hypot(q.x - grab.x, q.y - grab.y);
    return far(rough[0]) > far(rough[rough.length - 1]) ? rough.reverse() : rough;
}
export function tearFlap(piece, a, d, grab, rough, upto = 1) {
    const fl = flapLine(piece, a, d, grab);
    if (!fl) return [];
    const some = upto >= 1 ? rough : rough.slice(0, Math.max(2, Math.ceil(rough.length * upto)));
    piece.tears = piece.tears.filter(t => t.of !== rough);
    let gone = [];
    for (const { leaf, comp } of fl.parts) {
        const back = inv(leaf.M), mine = some.map(q => apply(back, q)), edges = openIn(intLine(fl.ends.map(q => apply(back, q))), swell(comp, 30));
        if (!edges.length) continue;
        const band = union(edges.flatMap(e => kerf(toCm(e), 0.5 * S, 25)));
        gone.push(...run(CT.ctIntersection, kerf(mine, RIP), band));
        for (const m of openIn(intLine(mine), band).map(toCm)) if (m.length > 1) piece.tears = piece.tears.concat([Object.assign(m, { of: rough })]);
    }
    piece.rev++;
    desk.torn = [some.map(q => apply(piece.P, q))];
    const made = gone.length ? slice(piece, union(gone)) : [];
    if (made.length) { renumber(); reclip(); retuck(); }
    return made;
}

export const mark = () => ({ z: desk.pieces.map(p => [p, { ...p.z }, p.folds.length]), tucks: desk.tucks.map(({ a, b, at }) => ({ a, b, at })) });
export function rewind(m) {
    for (const [p, z, n] of m.z) { p.z = { ...z }; if (p.folds.length !== n) { p.folds.length = n; derive(p); } }
    desk.tucks = m.tucks.map(t => ({ ...t }));
    retuck();
}

const keyOf = l => ({ fam: l.piece.fam, sig: l.sig });
const alive = l => l && desk.pieces.includes(l.piece) && l.piece.leaves.includes(l);
function find(k, at) {
    const hits = desk.pieces.filter(p => p.fam === k.fam).flatMap(p => p.leaves)
        .filter(l => (l.sig.startsWith(k.sig) || k.sig.startsWith(l.sig)) && inside(at, l.world));
    return hits.find(l => l.sig === k.sig) || hits.sort((a, b) => a.sig < b.sig ? -1 : 1)[0];
}
function patch(a, b, t) {
    const all = lumps(run(CT.ctIntersection, wint(a), wint(b), true));
    if (!t.region) return all.map(l => toDesk(l, IDENT)).find(r => inside(t.at, r));
    const old = toInt(t.region);
    let best = null, most = 0;
    for (const l of all) { const shared = area(both(l, old)); if (shared > most) { most = shared; best = l; } }
    return best && toDesk(best, IDENT);
}
export function retuck() {
    desk.tucks = desk.tucks.filter(t => {
        const a = alive(t.la) ? t.la : find(t.a, t.at), b = alive(t.lb) ? t.lb : find(t.b, t.at);
        if (!a || !b || a.piece === b.piece || zOf(a) > zOf(b)) return false;
        const region = patch(a, b, t);
        if (!region) return false;
        Object.assign(t, { a: keyOf(a), b: keyOf(b), la: a, lb: b, region, at: within(region), rev: (t.rev || 0) + 1 });
        return true;
    });
}
export const woven = piece => desk.tucks.some(t => t.la.piece === piece || t.lb.piece === piece);

export function tuckSpot(p) {
    const here = stackAt(p);
    if (here.length < 2) return { why: 'single' };
    const top = here[here.length - 1], low = here[here.length - 2];
    if (top.piece === low.piece) return { why: 'same' };
    const undo = desk.tucks.find(t => t.la === top && t.lb === low && inside(p, t.region));
    const region = undo ? undo.region : patch(top, low, { at: p });
    if (!region) return { why: 'single' };
    const spot = toInt(region);
    if (!undo && [top.piece, low.piece].some(q => area(both(onDesk(q, stuck(q)), spot)) > 0.01)) return { why: 'glued' };
    const isFlap = l => { const k = foldAt(l); return k >= 0 && !behind(l.piece, k) && here.slice(0, -2).some(m => m.piece === l.piece); };
    if (!undo && isFlap(low)) return { top, low, region, kind: 'under', flap: low, sheet: top };
    if (!undo && isFlap(top)) return { top, low, region, kind: 'out', flap: top, sheet: low };
    return { top, low, region, undo };
}
export function tuck(p) {
    const s = tuckSpot(p);
    if (s.why) return s;
    if (s.kind) {
        const past = e => { const q = [e.a, e.b, { x: e.b.x - e.n.x * .3, y: e.b.y - e.n.y * .3 }, { x: e.a.x - e.n.x * .3, y: e.a.y - e.n.y * .3 }].map(p => apply(s.flap.W, p)); return area(both(toInt([q]), wint(s.sheet))) > 0.02; };
        if (s.kind === 'under' && creases(s.flap).some(past)) return { why: 'through' };
        const was = desk.pieces.map(q => [q, { ...q.z }]), all = stack(), i = all.indexOf(s.flap);
        s.sheet.piece.z[s.sheet.sig] = s.kind === 'out' ? 1e9 : (zOf(s.flap) + (i > 0 ? zOf(all[i - 1]) : zOf(s.flap) - 1)) / 2;
        renumber();
        if (s.kind === 'under' && pierced(s.flap.piece)) { for (const [q, z] of was) q.z = z; return { why: 'through' }; }
        s.sheet.piece.rev++; s.flap.piece.rev++;
    } else if (s.undo) desk.tucks = desk.tucks.filter(t => t !== s.undo);
    else desk.tucks.push({ a: keyOf(s.low), b: keyOf(s.top), at: { x: p.x, y: p.y } });
    retuck();
    return s;
}

const under = c => {
    const ids = new Set(), out = { x: c.x - c.nx * 0.35, y: c.y - c.ny * 0.35 };
    for (const t of CLIP.grip) for (const l of stackAt({ x: c.x + c.nx * t, y: c.y + c.ny * t })) if (!inside(out, l.world)) ids.add(l.piece.id);
    return [...ids];
};

export function clipSpot(p, plates = []) {
    const shapes = stackAt(p).map(l => ({ all: l.world })).concat(plates.map(pl => ({ all: [pl.ring], plate: pl.name })));
    let best = null, any = false;
    for (const sh of shapes) {
        let e = null;
        for (const ring of sh.all) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const a = ring[j], b = ring[i], ex = b.x - a.x, ey = b.y - a.y, len2 = ex * ex + ey * ey;
            const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2)) : 0;
            const q = { x: a.x + ex * t, y: a.y + ey * t }, dist = Math.hypot(p.x - q.x, p.y - q.y);
            if (!e || dist < e.dist) e = { ...q, dist, ex, ey };
        }
        if (!e) continue;
        any = true;
        if (e.dist > CLIP.reach) continue;
        const len = Math.hypot(e.ex, e.ey) || 1;
        let n = { x: -e.ey / len, y: e.ex / len };
        if (!inside({ x: e.x + n.x * 0.05, y: e.y + n.y * 0.05 }, sh.all)) n = { x: -n.x, y: -n.y };
        const c = { x: e.x, y: e.y, nx: n.x, ny: n.y, dist: e.dist }, grip = { x: c.x + n.x * CLIP.grip[1], y: c.y + n.y * CLIP.grip[1] }, out = { x: c.x - n.x * 0.35, y: c.y - n.y * 0.35 };
        c.ids = under(c);
        c.plate = sh.plate || plates.find(pl => inside(grip, [pl.ring]) && !inside(out, [pl.ring]))?.name || null;
        c.holds = c.ids.length + (c.plate ? .5 : 0);
        if (c.holds && (!best || c.holds > best.holds || (c.holds === best.holds && c.dist < best.dist))) best = c;
    }
    if (best) { const { dist, holds, ...c } = best; return c; }
    return { why: any ? 'far' : 'air' };
}
export function addClip(c) { desk.clips.push({ ...c, fams: c.ids.map(id => byId(id).fam) }); }
export const anchors = pieces => desk.clips.filter(c => c.plate && c.ids.some(id => pieces.some(p => p.id === id)));
function reclip() {
    for (const c of desk.clips) c.ids = under(c).filter(id => c.fams.includes(byId(id).fam));
    desk.clips = desk.clips.filter(c => c.ids.length || c.plate);
}

export function spread(pts, r) {
    let reach = kerf(pts.length > 1 ? pts : [pts[0], { x: pts[0].x + 0.002, y: pts[0].y }], r * S, 40), did = false;
    for (const l of stack().reverse()) {
        if (!reach.length) break;
        const on = run(CT.ctIntersection, reach, wint(l));
        if (area(on) < 0.005) continue;
        const face = l.back ? 'back' : 'front';
        l.piece.glue = { ...l.piece.glue, [face]: union(l.piece.glue[face].concat(mapInt(on, inv(l.W)))) };
        l.piece.rev++; did = true;
        reach = run(CT.ctDifference, reach, wint(l));
    }
    return did;
}
export function press(aloft) {
    const all = stack().filter(l => !aloft || !aloft.has(l.piece));
    let made = 0;
    all.forEach((l, i) => {
        for (const up of [true, false]) {
            const face = up === l.back ? 'back' : 'front';
            let reach = l.piece.glue[face].length ? mapInt(run(CT.ctIntersection, l.piece.glue[face], l.paths), l.W) : [], rb = reach.length ? boxOf(toDesk(reach, IDENT)) : null;
            for (const o of up ? all.slice(i + 1) : all.slice(0, i).reverse()) {
                if (!reach.length) break;
                if (apart(rb, o.box)) continue;
                const touch = run(CT.ctIntersection, reach, wint(o));
                if (area(touch) > TOUCH) {
                    const mine = mapInt(touch, inv(l.W));
                    desk.bonds.push({ a: l.piece.fam, b: o.piece.fam, ra: mine, rb: mapInt(touch, inv(o.W)) });
                    l.piece.glue = { ...l.piece.glue, [face]: run(CT.ctDifference, l.piece.glue[face], mine) };
                    l.piece.rev++; made++;
                }
                reach = run(CT.ctDifference, reach, wint(o)); if (reach.length) rb = boxOf(toDesk(reach, IDENT));
            }
        }
    });
    return made;
}

export const lumpsOf = paths => lumps(run(CT.ctUnion, paths, null, true, NZ));
export const rim = (paths, by, inn) => inn ? run(CT.ctDifference, swell(paths, by * S), swell(paths, -inn * S)) : swell(paths, by * S);
export function patches(l) {
    const back = inv(l.W), out = [];
    let rest = l.paths;
    for (const t of desk.tucks) if (t.la === l) { const r = mapInt(toInt(t.region), back); out.push({ paths: both(l.paths, r), over: t.lb }); rest = minus(rest, r); }
    return [{ paths: rest, over: null }, ...out].filter(p => p.paths.length);
}
export const glueOf = (l, face) => l.piece.glue[face].length ? both(l.paths, l.piece.glue[face]) : [];
const bands = new WeakMap();
export function strips(l, lines, wide) {
    let band = bands.get(lines)?.[wide];
    if (!band) {
        const co = new C.ClipperOffset(2, 60); band = new C.Paths();
        for (const p of lines) { const line = intLine(p); if (line.length > 1) co.AddPath(line, C.JoinType.jtMiter, C.EndType.etOpenButt); }
        co.Execute(band, wide * S / 2);
        bands.set(lines, { ...bands.get(lines), [wide]: band });
    }
    return band.length ? both(band, l.paths) : [];
}
export const linesOn = (l, lines) => lines.flatMap(p => { const line = intLine(p); return line.length > 1 ? openIn(line, l.paths) : []; }).map(toCm);
export const band = (pts, wide) => kerf(pts, wide * S / 2, 5);
export function shades(l, wide) {
    return creases(l).map(e => {
        const q = [e.a, e.b, { x: e.b.x + e.n.x * wide, y: e.b.y + e.n.y * wide }, { x: e.a.x + e.n.x * wide, y: e.a.y + e.n.y * wide }];
        return { paths: both(toInt([q]), l.paths), a: e.a, n: e.n };
    }).filter(s => s.paths.length);
}

export function ridgeOn(l) {
    const out = [], back = inv(l.W), inner = l.piece.leaves.length > 1 ? swell(l.paths, -500) : [];
    if (inner.length) for (const o of l.piece.leaves) if (o !== l && zOf(o) < zOf(l) && !apart(o.box, l.box)) {
        const there = mapInt(wint(o), back);
        out.push(...both(run(CT.ctDifference, swell(there, 220), swell(there, -220)), inner));
    }
    return out;
}
export function ridges(p, r) {
    const here = stackAt(p), top = here.pop();
    if (!top) return [];
    const disc = [Array.from({ length: 28 }, (_, i) => ({ X: Math.round((p.x + Math.cos(i * Math.PI / 14) * r) * S), Y: Math.round((p.y + Math.sin(i * Math.PI / 14) * r) * S) }))];
    const zone = run(CT.ctIntersection, disc, wint(top)), box = { x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r }, out = [];
    for (const l of stack()) if (l !== top && zOf(l) < zOf(top) && !apart(l.box, box)) for (const ring of wint(l)) out.push(...openIn(ring.concat([ring[0]]), zone).map(toCm));
    return out.filter(m => m.length > 1);
}
const rims = new WeakMap();
function ownEdges(paths) {
    let set = rims.get(paths);
    if (!set) { rims.set(paths, set = new Set()); for (const r of paths) r.forEach((a, i) => { const b = r[(i + 1) % r.length]; set.add(a.X + ',' + a.Y + '|' + b.X + ',' + b.Y); set.add(b.X + ',' + b.Y + '|' + a.X + ',' + a.Y); }); }
    return set;
}
export function creases(l) {
    const out = [];
    if (!l.sig) return out;
    const own = ownEdges(l.piece.paths), whole = toDesk(l.piece.paths, IDENT), mine = toDesk(l.paths, IDENT);
    l.paths.forEach((ring, k) => ring.forEach((p, i) => {
        const q = ring[(i + 1) % ring.length], r = mine[k], a = r[i], b = r[(i + 1) % r.length], len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 0.05 || own.has(p.X + ',' + p.Y + '|' + q.X + ',' + q.Y)) return;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }, e = 0.0003;
        if (!inside({ x: m.x + n.x * e, y: m.y + n.y * e }, whole) || !inside({ x: m.x - n.x * e, y: m.y - n.y * e }, whole)) return;
        out.push({ a, b, n: inside({ x: m.x + n.x * e, y: m.y + n.y * e }, mine) ? n : { x: -n.x, y: -n.y } });
    }));
    return out;
}

export function check() {
    const bad = [], zs = stack().map(zOf);
    if (new Set(zs).size !== zs.length) bad.push('two layers at the same place in the pile');
    for (const p of desk.pieces) {
        if (!p.leaves.length) bad.push(`piece ${p.id}: no paper in it`);
        if (p.leaves.some(l => l.world.some(r => r.some(q => !Number.isFinite(q.x + q.y))))) bad.push(`piece ${p.id}: lost (not a number)`);
        if (p.leaves.length > 1 && thickest(p) > LIMITS.layers) bad.push(`piece ${p.id}: more than ${LIMITS.layers} layers thick`);
        if (p.leaves.length > 1 && pierced(p)) bad.push(`piece ${p.id}: paper passes through its folded edge`);
    }
    for (const c of desk.clips) if (c.ids.some(id => !byId(id))) bad.push('a clip holding paper that is gone');
    for (const t of desk.tucks) if (!alive(t.la) || !alive(t.lb)) bad.push('a tuck between paper that is gone');
    return bad;
}

export const snapshot = () => ({ n: desk.n, pieces: desk.pieces.map(({ leaves, ...p }) => p), clips: desk.clips, bonds: desk.bonds, tucks: desk.tucks.map(({ a, b, at }) => ({ a, b, at })) });
export function restore(s) {
    s = JSON.parse(JSON.stringify(s));
    Object.assign(desk, { n: s.n, pieces: s.pieces, clips: s.clips, bonds: s.bonds || [], tucks: s.tucks });
    for (const p of desk.pieces) { p.marks ||= []; for (const f of p.folds) f.rank ||= {}; }
    desk.pieces.forEach(derive);
    retuck();
}
