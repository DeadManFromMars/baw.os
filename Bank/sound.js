const GAIN = { H1: 1.06, H2: 0.79, I8: 1.58, I7: 0.7, L1: 0.97, M1: 1.32, J2: 0.5 };
const FS = (id, user) => `https://cdn.freesound.org/previews/${Math.floor(id / 1000)}/${id}_${user}-hq.mp3`;
const FILES = {
    steps: {
        inside:    { url: FS(757207, 10938187), cuts: [[0.585, 0.6, 1.0], [1.22, 0.56, 1.1], [1.805, 0.57, 1.0], [2.4, 0.56, 0.72], [2.985, 0.54, 1.0], [3.555, 0.63, 1.1]] },
        insideDry: { url: FS(753290, 13973196), cuts: [[2.765, 0.4, 1.0], [3.355, 0.4, 1.1], [3.95, 0.4, 1.1], [4.545, 0.4, 1.1], [7.54, 0.4, 1.0], [8.15, 0.4, 1.1], [8.74, 0.4, 1.0], [9.35, 0.4, 1.1], [14.86, 0.4, 1.0], [15.43, 0.4, 0.8]] },
        outside:   { url: FS(571801, 5620304), cuts: [[1.345, 0.45, 1.0], [1.985, 0.45, 1.05], [3.245, 0.45, 0.95], [5.82, 0.45, 1.0], [6.96, 0.45, 1.1]] },
    },
    walkers: { url: FS(683658, 14665352), cuts: [[3.545, 0.4, 1.0], [4.13, 0.4, 1.2], [4.795, 0.4, 1.1], [6.56, 0.4, 1.0], [7.16, 0.4, 1.0], [7.695, 0.4, 0.85], [8.755, 0.4, 1.1], [9.32, 0.4, 1.3]] },
    reverb: FS(648945, 9250976),

    tick:     { url: FS(125399, 2279655), cuts: [[2.14, 0.4, 1.1], [3.165, 0.4, 1.0], [7.16, 0.4, 1.0], [9.125, 0.4, 0.9], [10.12, 0.4, 1.1], [11.145, 0.4, 1.1], [13.145, 0.4, 0.95], [18.105, 0.4, 1.05], [21.125, 0.4, 0.92], [23.12, 0.4, 0.92]] },
    tock:     { url: FS(574714, 7355595), cuts: [[1.25, 0.45, 0.95], [2.41, 0.45, 0.96], [3.575, 0.45, 1.04], [4.735, 0.45, 1.08], [5.895, 0.45, 1.02]] },
    tockSoft: { url: FS(574714, 7355595), cuts: [[0.705, 0.45, 1.0], [1.865, 0.45, 1.1], [3.025, 0.45, 1.0], [4.185, 0.45, 1.0], [5.345, 0.45, 1.15]] },

    chime:    { url: FS(147678, 374422), cuts: [[57.77, 6.0, 1.0, 3.0]] },
    door: null, far: [], quarter: null,

    flap:     { url: FS(261244, 2736862), cuts: [[21.418, 0.11, 0.927, 0.04], [112.363, 0.11, 1.154, 0.04], [62.113, 0.11, 1.126, 0.04], [10.848, 0.11, 1.209, 0.04],
                [71.783, 0.11, 1.26, 0.04], [103.488, 0.11, 1.299, 0.04], [66.428, 0.11, 0.873, 0.04], [39.418, 0.11, 0.838, 0.04], [111.788, 0.11, 0.924, 0.04],
                [49.008, 0.11, 1.061, 0.04], [43.673, 0.11, 1.019, 0.04], [43.353, 0.11, 0.84, 0.04]] },
    rattle: { url: FS(96408, 266274), cuts: [[0.5, 33.5, 1]] },

    city:   [{ url: FS(817138, 2524442), gain: GAIN.H2 }, { url: FS(479574, 2524442), gain: GAIN.H1 }],
    walla:  [{ url: FS(675076, 2524442), gain: GAIN.I8 }, { url: FS(341272, 579267), gain: GAIN.I7 }],
    room:   { url: FS(715662, 97550), gain: GAIN.L1 },
    office: { url: FS(480722, 2524442), gain: GAIN.M1 },
    hum: null,
    revolve: { url: FS(614527, 13284737), cuts: [[8.5, 10.5, GAIN.J2]] },
    street: [],
};
const LEVEL = { steps: 0.6, walkers: 0.4, room: 0.12, door: 0.4, far: 0.12, tick: 0.3, chime: 0.5, quarter: 0.4, flap: 0.3,
                city: 0.3, walla: 0.2, office: 0.08, hum: 0.15, revolve: 0.4, street: 0.3,
                rattle: 1.2,
                clockRate: 0.92,
                clockWet: { tick: 0.3, strike: 0.45 },
                reverb: { hall: 0.8, vestibule: 0.35, outside: 0 } };
const LOOPS = ['city', 'walla', 'room', 'office', 'hum', 'revolve', 'rattle'];
const STROKE = 2.94;
const picked = f => Array.isArray(f) ? f.length > 0 : f && typeof f === 'object' ? Object.values(f).some(picked) : !!f;

export function makeSound() {
    let ctx = null, out = null, verb = null, muted = false, farAt = 12, tock = 0, insideDry = true;
    const buf = {}, decoded = new Map();
    let BAKED = null;
    const fetchBuf = url => {
        if (!decoded.has(url)) decoded.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(b => ctx.decodeAudioData(b)));
        return decoded.get(url);
    };

    const load = async (f) => {
        if (!f) return [];
        const url = typeof f === 'string' ? (/^https?:/.test(f) ? f : `sounds/${f}`) : f.url, baked = BAKED?.[url];
        const at = o => { if (!baked) return o; const s = baked.segs.find(([a, b]) => o >= a - 1e-3 && o < b) ?? baked.segs[0]; return s[2] + o - s[0]; };
        try {
            const buffer = await fetchBuf(baked ? baked.file : url);
            return f.cuts ? f.cuts.map(([offset, dur, gain = 1, fade = 0.07]) => ({ buffer, offset: at(offset), dur, gain, fade })) : [{ buffer, offset: 0, dur: 0, gain: f.gain ?? 1 }];
        } catch { console.warn(`sound: couldn't load ${url}`); return []; }
    };
    const loadAll = async list => (Array.isArray(list) ? (await Promise.all(list.map(load))).flat() : await load(list));

    const MUFFLE_HZ = 650;
    function muffler(head, into, muffle) {
        const clear = ctx.createGain(), dull = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
        for (const f of [f1, f2]) { f.type = 'lowpass'; f.frequency.value = MUFFLE_HZ; f.Q.value = 0.5; }
        head.connect(clear); clear.connect(into); head.connect(f1); f1.connect(f2); f2.connect(dull); dull.connect(into);
        clear.gain.value = Math.cos(muffle * Math.PI / 2); dull.gain.value = Math.sin(muffle * Math.PI / 2);
        return { clear, dull };
    }

    function play(c, gain, pan = 0, loop = false, when = 0, wet = 0, { rate = 1, lp = 0, muffle = 0 } = {}) {
        if (!ctx || muted || !c) return null;
        const src = ctx.createBufferSource(); src.buffer = c.buffer; src.loop = loop; src.playbackRate.value = rate;
        const g = ctx.createGain(), t0 = ctx.currentTime + when, v = gain * c.gain;
        g.gain.value = v;
        const p = ctx.createStereoPanner(); p.pan.value = pan;
        let head = src;
        if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); head = f; }
        if (muffle > 0.01) muffler(head, g, muffle); else head.connect(g);
        g.connect(p); p.connect(out);
        if (verb && wet > 0) { const send = ctx.createGain(); send.gain.value = wet; p.connect(send); send.connect(verb); }
        if (c.dur) {
            const len = c.dur / rate;
            const fade = (c.fade ?? 0.07) / rate;
            g.gain.setValueAtTime(v, t0 + Math.max(0, len - fade)); g.gain.linearRampToValueAtTime(0, t0 + len);
            src.start(t0, c.offset, c.dur + 0.02);
        } else src.start(t0);
        return src;
    }
    async function start() {
        if (ctx) return ctx.resume();
        if (!picked(FILES)) return;
        ctx = new AudioContext();
        out = ctx.createGain(); out.gain.value = 1; out.connect(ctx.destination);
        BAKED = await fetch('sounds/map.json').then(r => r.ok ? r.json() : null).catch(() => null);

        for (const k of LOOPS) loadAll(FILES[k]).then(b => buf[k] = b);
        const [ir] = await load(FILES.reverb);
        if (ir) { verb = ctx.createConvolver(); verb.buffer = ir.buffer; verb.connect(out); }
        [buf.outside, buf.inside, buf.insideDry, buf.walkers] = await Promise.all([loadAll(FILES.steps.outside), loadAll(FILES.steps.inside), loadAll(FILES.steps.insideDry), loadAll(FILES.walkers)]);
        buf.far = await loadAll(FILES.far); buf.flap = await loadAll(FILES.flap);
        [buf.tick, buf.tock, buf.tockSoft, buf.chime] = await Promise.all([loadAll(FILES.tick), loadAll(FILES.tock), loadAll(FILES.tockSoft), loadAll(FILES.chime)]);
        for (const k of ['door', 'quarter']) [buf[k]] = await load(FILES[k]);
        buf.street = await loadAll(FILES.street);
    }

    const loops = {}, XF = 3, TRIM = 0.3;
    const UP = new Float32Array(33).map((_, i) => Math.sin(i / 32 * Math.PI / 2)), DOWN = UP.slice().reverse();
    function segment(L, layer) {
        const c = layer.c, a = c.offset + TRIM, len = (c.dur || c.buffer.duration - c.offset) - 2 * TRIM;
        const from = layer.first ? Math.random() * (len - XF * 2) : 0; layer.first = false;
        const t0 = Math.max(layer.next, ctx.currentTime + 0.02), run = len - from;
        const src = ctx.createBufferSource(); src.buffer = c.buffer;
        const g = ctx.createGain(); g.gain.value = 0;
        g.gain.setValueCurveAtTime(UP.map(v => v * c.gain), t0, XF);
        g.gain.setValueCurveAtTime(DOWN.map(v => v * c.gain), t0 + run - XF, XF);
        src.connect(g); g.connect(L.f);
        src.start(t0, a + from, run);
        layer.next = t0 + run - XF;
    }
    function loop(name, { gain = 0, pan = 0, lp = 0, wet = 0, muffle = 0 } = {}) {
        if (!ctx || !buf[name]?.length) return;
        let L = loops[name];
        if (!L) {
            const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 20000;
            const g = ctx.createGain(); g.gain.value = 0;
            const p = ctx.createStereoPanner(), send = ctx.createGain(); send.gain.value = 0;
            const mix = muffler(f, g, 0); g.connect(p); p.connect(out);
            L = loops[name] = { g, p, f, send, mix, was: [], layers: buf[name].map(c => ({ c, next: ctx.currentTime + 0.05, first: true })) };
        }
        if (verb && !L.wet) { L.p.connect(L.send); L.send.connect(verb); L.wet = true; }
        for (const layer of L.layers) if (layer.next < ctx.currentTime + 1) segment(L, layer);
        const want = [LEVEL[name] * gain, pan, lp || 20000, wet, muffle];
        if (want.every((v, i) => Math.abs(v - (L.was[i] ?? -1)) < Math.max(1e-4, Math.abs(v) * 0.01))) return;
        L.was = want;
        const t = ctx.currentTime;
        L.g.gain.setTargetAtTime(want[0], t, 0.3); L.p.pan.setTargetAtTime(pan, t, 0.3);
        L.f.frequency.setTargetAtTime(want[2], t, 0.3); L.send.gain.setTargetAtTime(wet, t, 0.3);
        L.mix.clear.gain.setTargetAtTime(Math.cos(muffle * Math.PI / 2), t, 0.3); L.mix.dull.gain.setTargetAtTime(Math.sin(muffle * Math.PI / 2), t, 0.3);
    }
    const pick = list => list?.length ? list[Math.floor(Math.random() * list.length)] : null;
    const HALL = () => LEVEL.reverb.hall;
    return {
        start,

        heel: ({ pan = 0, gain = 1, rate = 1, where = 'hall' } = {}) => {
            if (where === 'outside') return play(pick(buf.outside), LEVEL.steps * gain, pan, false, 0, 0, { rate });
            if (insideDry) return play(pick(buf.insideDry), LEVEL.steps * gain, pan, false, 0, LEVEL.reverb[where] ?? 0, { rate });
            return play(pick(buf.inside), LEVEL.steps * gain, pan, false, 0, 0, { rate });
        },

        walker: ({ gain = 1, pan = 0, lp = 0, wet = 0, muffle = 0 } = {}) => play(pick(buf.walkers), LEVEL.walkers * gain, pan, false, Math.random() * 0.02, wet, { rate: 0.93 + Math.random() * 0.14, lp, muffle }),

        loop,
        shot: (name, { gain = 1, pan = 0, lp = 0, wet = 0, delay = 0, rate = 1, muffle = 0 } = {}) => play(pick(buf[name]), (LEVEL[name] ?? 1) * gain, pan, false, delay, wet, { rate, lp, muffle }),
        has: name => !!buf[name]?.length,
        loops: () => Object.fromEntries(Object.entries(loops).map(([k, L]) => [k, { gain: +L.g.gain.value.toFixed(4), lp: Math.round(L.f.frequency.value), wet: +L.send.gain.value.toFixed(3), layers: L.layers.length }])),
        get insideDry() { return insideDry; }, set insideDry(v) { insideDry = v; },
        hush: () => play(buf.door, LEVEL.door),

        tick: ({ gain = 1, pan = 0, wet = LEVEL.clockWet.tick, lp = 0, muffle = 0 } = {}) => {
            const r = LEVEL.clockRate, soft = tock++ % 2;
            play(pick(buf.tick), LEVEL.tick * gain, pan, false, 0, wet, { rate: r * (0.99 + Math.random() * 0.02), lp, muffle });
            play(pick(soft ? buf.tockSoft : buf.tock), LEVEL.tick * gain * 0.85, pan, false, 0.012, wet, { rate: r * 0.97, lp, muffle });
        },
        strike: (n, { gain = 1, pan = 0, wet = LEVEL.clockWet.strike, lp = 0, muffle = 0 } = {}) => {
            for (let i = 0; i < n; i++) play(pick(buf.chime), LEVEL.chime * gain * (1 - i * 0.01), pan, false, i * STROKE, wet, { rate: 0.995 + Math.random() * 0.01, lp, muffle });
        },
        flap: ({ gain = 1, pan = 0, delay = 0, wet = HALL() * 0.6, lp = 0, muffle = 0 } = {}) => play(pick(buf.flap), LEVEL.flap * gain, pan, false, delay, wet, { rate: 0.9 + Math.random() * 0.25, lp, muffle }),
        quarter: (n, { gain = 1, pan = 0, wet = HALL(), lp = 0, muffle = 0 } = {}) => { for (let i = 0; i < n; i++) play(buf.quarter, LEVEL.quarter * gain, pan, false, i * STROKE * 1.6, wet, { lp, muffle }); },
        update(dt) {
            if (!ctx || muted || !buf.far?.length) return;
            if ((farAt -= dt) > 0) return;
            farAt = 12 + Math.random() * 15;
            play(pick(buf.far), LEVEL.far, Math.random() * 1.4 - 0.7);
        },
        get on() { return !!ctx && !muted; },
        toggle() { muted = !muted; if (out) out.gain.value = muted ? 0 : 1; return !muted; },
    };
}
