/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   music.js  —  PLAYBACK + RADIO WIDGET + MIXTAPE MANAGER
   (replaces radio.js + playlist.js, which shared all their state)

   Radio    plays the player's mixtape through <audio id="bgMusic">
            and drives the radio widget (markup in index.html).
            Starts once BOTH have happened:
              'player:authenticated'  their saved mixtape is loaded
              'globe:pins-complete'   the intro finished
   Scratch  plays the track backwards / at any speed for the
            mixtape manager's CD (Web Audio)
   Mixtape  overlay for building the mixtape: browse the library
            wheel, add / remove / reorder, shuffle. Edits play live,
            but only SAVE persists them — closing unsaved asks twice,
            then puts the saved mixtape back.

   DATA
     playlist.json      [{ src, title, artist, art }]  next to index.html
     /profile/mixtape   { queue: [src, …], shuffle }   on the backend
     An empty mixtape plays the whole library.

   EVENTS FIRED
     'radio:track-changed' { src }   the mixtape overlay listens
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */


/* ════════════════════════════════════════════════════════
   RADIO — playback engine + widget
════════════════════════════════════════════════════════ */

const Radio = (() => {

    const audio = document.getElementById('bgMusic');
    const $     = id => document.getElementById(id);

    let library  = [];     // every track in playlist.json
    let tape     = [];     // the player's mixtape (may be empty)
    let shuffle  = false;
    let queue    = [];     // what actually plays: tape, or library if tape is empty
    let order    = [];     // play order — indexes into queue, shuffled when shuffle is on
    let pos      = 0;      // current position in order
    let nowTrack = null;   // track loaded in <audio> (may have left the queue since)

    // Playback starts once both are true (see header)
    const ready = { tape: false, intro: false };
    let started = false;


    /* ── Data ── */

    // Fetched once, shared with the mixtape manager. Relative URL on
    // purpose: playlist.json ships with the frontend, not the backend.
    let libraryPromise = null;
    function loadLibrary() {
        libraryPromise ??= fetch('playlist.json')
            .then(r => (r.ok ? r.json() : []))
            .catch(() => [])
            .then(data => (library = data));
        return libraryPromise;
    }

    async function loadSavedTape() {
        await loadLibrary();
        try {
            const res = await fetch(`${CONFIG.apiBase}/profile/mixtape`, { credentials: 'include' });
            if (res.ok) {
                const saved = await res.json();
                tape    = (saved.queue || []).map(src => library.find(t => t.src === src)).filter(Boolean);
                shuffle = !!saved.shuffle;
            }
        } catch { /* nothing saved yet — the library plays */ }
        ready.tape = true;
        tryStart();
    }

    // Rebuild queue + play order after the tape or shuffle changes.
    // The playing track stays current, so edits never interrupt it.
    function rebuild() {
        queue = tape.length ? tape : library;
        order = queue.map((_, i) => i);
        if (shuffle) {
            for (let i = order.length - 1; i > 0; i--) {          // Fisher–Yates
                const j = Math.floor(Math.random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }
        }
        const idx = queue.findIndex(t => t.src === nowTrack?.src);
        pos = idx >= 0 ? order.indexOf(idx) : -1;   // -1 → "next" starts the new queue
    }


    /* ── Web Audio route ──
       Made on first use and kept (an <audio> can only be routed once):
         <audio> → tap (analyser) → el (gain) ─┐
         the CD scratch (Scratch) ─────────────┴→ bus → speakers
       signal.js and Pulse listen to `bus`. Scratch mutes `el` while it plays instead,
       and reads `tap` to find exactly where the <audio> is — muted or not.
       Only call it from a click (or after one), or the context starts suspended. */
    let graph = null;
    function audioGraph() {
        if (!graph) {
            const ctx = new AudioContext();
            const tap = new AnalyserNode(ctx, { fftSize: 32768 });
            const el  = ctx.createGain();
            const bus = ctx.createGain();
            ctx.createMediaElementSource(audio).connect(tap).connect(el).connect(bus).connect(ctx.destination);
            graph = { ctx, el, tap, bus };
        }
        if (graph.ctx.state === 'suspended') graph.ctx.resume();
        return graph;
    }


    /* ── Playback ── */

    function load(track) {
        nowTrack  = track;
        audio.src = track.src;
        audio.play().catch(() => {});   // can be blocked until the page gets a click; ▶ still works
        renderTrack();
        document.dispatchEvent(new CustomEvent('radio:track-changed', { detail: { src: track.src } }));
    }

    function playAt(p) {
        if (!order.length) return;
        pos = ((p % order.length) + order.length) % order.length;
        load(queue[order[pos]]);
    }

    function tryStart() {
        if (started || !ready.tape || !ready.intro) return;
        started = true;
        rebuild();
        $('radioWidget').classList.add('visible');
        playAt(0);
    }

    const api = {
        next()       { playAt(pos + 1); },
        prev()       { audio.currentTime > 3 ? (audio.currentTime = 0) : playAt(pos - 1); },  // restart, or go back
        togglePlay() { if (nowTrack) audio.paused ? audio.play().catch(() => {}) : audio.pause(); },
        playSrc(src) {
            const i = queue.findIndex(t => t.src === src);
            if (i >= 0) playAt(order.indexOf(i));
        },
        // Play any library track. If it isn't in the queue (a preview from
        // the mixtape manager), the queue position is kept, so when it
        // ends "next" carries on where the mixtape left off.
        playTrack(track) {
            const i = queue.findIndex(t => t.src === track.src);
            i >= 0 ? playAt(order.indexOf(i)) : load(track);
        },
        nowSrc:    () => nowTrack?.src ?? null,
        isPlaying: () => !audio.paused,
        audioGraph,
        loadLibrary,
        getLibrary: () => library,
        getTape:    () => tape,
        getShuffle: () => shuffle,
        setTape(tracks, shuf) {
            tape    = tracks;
            shuffle = shuf;
            if (started) rebuild();
        },
    };


    /* ── Widget ── */

    function renderTrack() {
        const title = $('radioTitle');
        title.textContent = nowTrack.title;
        // Only scroll (marquee) when the title is too long to fit
        title.classList.toggle('fits', title.scrollWidth <= title.parentElement.clientWidth);
        $('radioArtist').textContent = nowTrack.artist;
        $('radioArt').style.backgroundImage = nowTrack.art ? `url("${encodeURI(nowTrack.art)}")` : '';
    }

    function renderPlayState() {
        const btn = $('radioPlayBtn');
        btn.innerHTML = audio.paused ? '&#9654;' : '&#9646;&#9646;';
        btn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
        $('radioWidget').classList.toggle('playing', !audio.paused);   // spins the CD (music.css)
    }

    function renderProgress() {
        const d = audio.duration || 0;
        $('radioFill').style.width     = d ? `${(audio.currentTime / d) * 100}%` : '0%';
        $('radioCurrent').textContent  = Utils.formatTime(audio.currentTime);
        $('radioDuration').textContent = Utils.formatTime(d);
    }

    // Drag the widget by its handle, kept inside the window
    function initDrag() {
        const widget = $('radioWidget');
        const handle = $('radioDragHandle');
        let grab = null;

        handle.addEventListener('pointerdown', e => {
            const r = widget.getBoundingClientRect();
            grab = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            handle.setPointerCapture(e.pointerId);
            // Switch from bottom/right anchoring to left/top so it can move freely
            Object.assign(widget.style, { right: 'auto', bottom: 'auto', left: `${r.left}px`, top: `${r.top}px` });
        });
        handle.addEventListener('pointermove', e => {
            if (!grab) return;
            const maxX = innerWidth  - widget.offsetWidth;
            const maxY = innerHeight - widget.offsetHeight;
            widget.style.left = `${Math.max(0, Math.min(maxX, e.clientX - grab.dx))}px`;
            widget.style.top  = `${Math.max(0, Math.min(maxY, e.clientY - grab.dy))}px`;
        });
        const drop = () => { grab = null; };
        handle.addEventListener('pointerup', drop);
        handle.addEventListener('pointercancel', drop);
    }

    function initWidget() {
        // Buttons are marked with data-radio="…" in index.html
        $('radioWidget').addEventListener('click', e => {
            const action = e.target.closest('[data-radio]')?.dataset.radio;
            if (action === 'prev')    api.prev();
            if (action === 'play')    api.togglePlay();
            if (action === 'next')    api.next();
            if (action === 'mixtape') Mixtape.open();
        });

        // Click the progress bar to seek
        $('radioProgress').addEventListener('click', e => {
            if (!audio.duration) return;
            const r = e.currentTarget.getBoundingClientRect();
            audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
        });

        // Volume — remembered per browser
        const vol = $('radioVolume');
        try { vol.value = localStorage.getItem('baw_volume') ?? vol.value; } catch {}
        audio.volume = vol.value / 100;
        vol.addEventListener('input', () => {
            audio.volume = vol.value / 100;
            try { localStorage.setItem('baw_volume', vol.value); } catch {}
        });

        // The <audio> element is the single source of truth for play state
        audio.addEventListener('play',  renderPlayState);
        audio.addEventListener('pause', renderPlayState);
        audio.addEventListener('timeupdate',     renderProgress);
        audio.addEventListener('loadedmetadata', renderProgress);
        audio.addEventListener('ended', api.next);

        initDrag();
    }


    /* ── Startup ── */

    if (audio) {
        initWidget();
        // Build the Web Audio route on the first click (Safari keeps it muted otherwise)
        for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => audioGraph(), { once: true, capture: true });
        document.addEventListener('player:authenticated', loadSavedTape, { once: true });
        document.addEventListener('globe:pins-complete', () => { ready.intro = true; tryStart(); });
    }

    return api;
})();


/* ════════════════════════════════════════════════════════
   PULSE — the page feeling the music, very quietly

   Listens to everything the radio plays (Radio's `bus`, scratches
   included) and keeps two numbers, both 0–1 and smooth:
     Pulse.bass   how far the low end (under 150 Hz) is punching above
                  its usual level — kicks and bass notes show as soft
                  thumps that fade in ~0.15 s
     Pulse.level  how loud it is overall
   Both are measured against the track's own recent levels, so quiet
   and loud tracks move alike. No tempo tracking — just the sound.

   globe.js reads it for the globe, the pin boxes and the dots; the
   CSS-only layers (corner brackets, the red top bar, the haze) are
   nudged from here. Silence (or reduced motion) = everything at rest,
   exactly as without music.
════════════════════════════════════════════════════════ */

const Pulse = (() => {

    const TICK_HZ = 100;                 // measurements per second (on the audio clock)
    const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const audio = document.getElementById('bgMusic');

    const api = { bass: 0, level: 0 };
    if (!audio || REDUCED_MOTION) return api;

    // Measures inside the audio thread: every 1/TICK_HZ s of sound, the energy of
    // the bass (input 0, low-passed) and of everything (input 1). Evenly spaced
    // however busy the page is — page timers get throttled, this can't be.
    const METER = `
        registerProcessor('pulse-meter', class extends AudioWorkletProcessor {
            constructor() { super(); this.size = Math.round(sampleRate / ${TICK_HZ}); this.n = 0; this.low = 0; this.all = 0; }
            process([low, all]) {
                const l = low[0], a = all[0];
                if (!l || !a) return true;
                for (let i = 0; i < l.length; i++) {
                    this.low += l[i] * l[i];
                    this.all += a[i] * a[i];
                    if (++this.n === this.size) {
                        this.port.postMessage([this.low / this.size, this.all / this.size]);
                        this.n = this.low = this.all = 0;
                    }
                }
                return true;
            }
        });`;

    // Per measurement: how fast the readings rise and fall, and how quickly the "usual" levels move
    const RISE = 0.5, FALL = 1 - Math.exp(-1 / (TICK_HZ * 0.15)), LEVEL_FALL = 0.03;
    const USUAL = 1 - Math.exp(-1 / (TICK_HZ * 1.5)), PEAK_FADE = 0.998;    // peaks halve in ~3.5 s

    let lowUsual = 0, lowPeak = 1e-4, allPeak = 1e-4;

    // Hooked onto the radio's graph once it plays (the graph is built on the first click)
    async function attach() {
        const { ctx } = Radio.audioGraph();
        const url = URL.createObjectURL(new Blob([METER], { type: 'text/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const meter = new AudioWorkletNode(ctx, 'pulse-meter',
            { numberOfInputs: 2, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' });
        const { bus } = Radio.audioGraph();
        bus.connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 150 })).connect(meter, 0, 0);
        bus.connect(meter, 0, 1);
        meter.port.onmessage = e => measure(...e.data);
        requestAnimationFrame(react);
    }
    let attaching = null;
    audio.addEventListener('playing', () => { attaching ??= attach().catch(() => {}); });   // no AudioWorklet: no pulse

    const ease = (value, target, rise, fall) => value + (target - value) * (target > value ? rise : fall);

    // One measurement: mean-square energy of the bass and of everything, over the last 1/TICK_HZ s
    function measure(lowEnergy, allEnergy) {
        if (audio.paused) return;                                   // (react() lets it all settle)

        // Bass: how far above its usual level, as a share of the way up to its recent peak
        const low = Math.sqrt(lowEnergy);
        lowUsual += (low - lowUsual) * USUAL;
        lowPeak = Math.max(low, lowPeak * PEAK_FADE);
        const punch = Math.min(1, Math.max(0, (low - lowUsual) / (lowPeak - lowUsual || 1)));
        api.bass = ease(api.bass, punch, RISE, FALL);

        // Loudness, against its recent peak
        const all = Math.sqrt(allEnergy);
        allPeak = Math.max(all, allPeak * PEAK_FADE);
        api.level = ease(api.level, all / allPeak, 0.3, LEVEL_FALL);
    }

    // The CSS-only layers: brackets step out a couple of px, the red bar thickens a hair, the haze breathes
    const corners = [['.corner-tl', -1, -1], ['.corner-tr', 1, -1], ['.corner-bl', -1, 1], ['.corner-br', 1, 1]]
        .map(([sel, x, y]) => [document.querySelector(sel), x, y]).filter(([el]) => el);
    const geoTop = document.querySelector('.geo-top'), haze = document.querySelector('.haze');
    let shown = '', last = null;
    function react(now) {
        requestAnimationFrame(react);
        // Paused: the meter may go quiet altogether, so settle to rest from here (~0.3 s)
        if (audio.paused && last !== null) {
            const keep = Math.exp(-(now - last) / 300);
            api.bass  *= keep;
            api.level *= keep;
        }
        last = now;
        const b = api.bass, l = api.level;
        const key = `${b.toFixed(3)} ${l.toFixed(3)}`;
        if (key === shown) return;                                  // at rest: don't touch the page
        shown = key;
        for (const [el, x, y] of corners) el.style.translate = `${(x * 2 * b).toFixed(2)}px ${(y * 2 * b).toFixed(2)}px`;
        if (geoTop) geoTop.style.scale = `1 ${(1 + 0.5 * b).toFixed(3)}`;
        if (haze)   haze.style.scale   = (1 + 0.015 * l).toFixed(4);
    }

    return api;
})();


/* ════════════════════════════════════════════════════════
   SCRATCH — plays the radio's track forwards or backwards at
   any speed, for the mixtape manager's CD (an <audio> element
   can't play backwards)

   A stretch of the playing track around the playhead (±WINDOW s)
   is kept decoded, fetched as a byte range, then lined up to the
   sample by finding what the radio just played inside it (Radio's
   `tap`). Needs a server that answers Range requests (Flask, GitHub
   Pages do).

   While scratching, an AudioWorklet plays that stretch and the
   <audio> element is muted (it keeps running underneath). The disc
   sends where it was and when; the worklet replays exactly that path
   a moment later, so uneven pointer events don't make the pitch
   wobble. To hand back, the muted <audio> is seeked to about where
   the disc will be, then located exactly, and the disc eases into
   it before the two crossfade (the CD, in Mixtape, drives this).

   Positions are "disc seconds": seconds into the decoded stretch.
════════════════════════════════════════════════════════ */

const Scratch = (() => {

    const WINDOW   = 15;     // s decoded either side of the playhead
    const RECENTRE = 6;      // s — decode a fresh stretch once the playhead drifts this far from the middle
    const LAG      = 0.04;   // s — the path is replayed this far behind, so its next point has always arrived
    const FADE     = 0.012;  // s — time constant for the <audio> ↔ scratch swaps

    // Replays the path it's sent — { pos, t } points joined by straight lines,
    // LAG behind — rounded off by a 4 ms smoothing. Holds the last point when
    // the path runs out: a disc held still is silent.
    const WORKLET = `
        registerProcessor('scratch', class extends AudioWorkletProcessor {
            constructor() {
                super();
                this.ch = null; this.path = []; this.head = 0;
                this.port.onmessage = ({ data }) => {
                    if (data.channels) { this.ch = data.channels; return; }
                    const p = { t: data.t, pos: data.pos * sampleRate };
                    if (data.reset) { this.path = []; this.head = p.pos; }
                    this.path.push(p);
                };
            }
            at(t) {
                const p = this.path;
                while (p.length > 1 && p[1].t <= t) p.shift();
                if (p.length === 1 || t <= p[0].t) return p[0].pos;
                return p[0].pos + (p[1].pos - p[0].pos) * (t - p[0].t) / (p[1].t - p[0].t);
            }
            process(inputs, [out]) {
                const ch = this.ch;
                if (!ch || !this.path.length) return true;
                const n = ch[0].length, k = 1 - Math.exp(-1 / (0.004 * sampleRate));
                for (let i = 0; i < out[0].length; i++) {
                    this.head += (this.at(currentTime + i / sampleRate - ${LAG}) - this.head) * k;
                    const j = Math.floor(this.head), f = this.head - j, inside = j >= 0 && j + 1 < n;
                    for (let c = 0; c < out.length; c++) {
                        const s = ch[Math.min(c, ch.length - 1)];
                        out[c][i] = inside ? s[j] + (s[j + 1] - s[j]) * f : 0;
                    }
                }
                return true;
            }
        });`;

    const audio = document.getElementById('bgMusic');
    let node = null, out = null, ready = null;   // the worklet, its gain, the setup promise
    let win = null;       // { src, len, mix, offset, aligned } — disc seconds = <audio> seconds + offset
    let loading = false, active = false, lastT = 0;
    // When the <audio> last started playing unbroken (the tap holds older sound before this).
    // After any seek, line up again — a variable-bitrate file lands somewhere new each time.
    let since = 0;
    audio?.addEventListener('playing', () => { since = performance.now(); });
    audio?.addEventListener('seeked', () => {
        since = performance.now();
        if (win) win.aligned = false;
    });

    // Build the worklet into the radio's graph. Call from a click (see Radio.audioGraph).
    function setup() {
        ready ??= (async () => {
            const { ctx, bus } = Radio.audioGraph();
            const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
            await ctx.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            node = new AudioWorkletNode(ctx, 'scratch', { outputChannelCount: [2] });
            out  = new GainNode(ctx, { gain: 0 });
            // A disc held still sits on one sample value — keep that DC off the speakers
            node.connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 20 })).connect(out).connect(bus);
        })().catch(() => { node = null; });      // no AudioWorklet (e.g. plain http) → no scratching
        return ready;
    }

    const range = (src, from, to) => fetch(src, { headers: { Range: `bytes=${from}-${to}` } });

    // Decode ±WINDOW s of the playing track around `time`. Bytes → time is a
    // straight line after the ID3 tag (exact for constant bitrate; see align()).
    async function load(src, time) {
        const { ctx } = Radio.audioGraph();
        const probe = await range(src, 0, 9);
        if (probe.status !== 206) return;                          // the server ignores Range: no scratching
        const b    = new Uint8Array(await probe.arrayBuffer());
        const size = Number(probe.headers.get('Content-Range').split('/')[1]);
        const tag  = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33       // "ID3" — its size is 4 × 7 bits
            ? 10 + (b[5] & 0x10 ? 10 : 0) + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127))
            : 0;
        const perSec = (size - tag) / audio.duration;
        const t0 = Math.max(0, time - WINDOW), t1 = Math.min(audio.duration, time + WINDOW);
        const buf = await ctx.decodeAudioData(await (await range(src, Math.floor(tag + t0 * perSec), Math.ceil(tag + t1 * perSec) - 1)).arrayBuffer());
        if (active || Radio.nowSrc() !== src) return;              // moved on while decoding

        const channels = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c));
        node.port.postMessage({ channels });
        // The tap hears left + right mixed, so match against the same mix
        const mix = Float32Array.from(channels[0], (v, i) => (v + channels[channels.length - 1][i]) / 2);
        win = { src, len: buf.duration, mix, offset: -t0, aligned: false };
        align();
    }

    // Find the tap's last ~0.7 s inside the decoded stretch — every 16th
    // sample first, then exact — scored as normalised correlation (so loud
    // passages don't win by being loud), leaning slightly towards the guess.
    //   Near first (±NEAR): constant-bitrate files land within ~30 ms, and
    //   looped music repeats almost exactly a beat away (~250 ms), which a
    //   wide search can land on. Then wide (±FAR): the <audio> element seeks
    //   variable-bitrate files ("Xing") only roughly, then reports the time
    //   it asked for, not where it landed — measured up to 1 s out, on top
    //   of the byte guess being ~0.6 s out for those files.
    // Needs a moment of unbroken music since the last seek / start (and not
    // silence); keepReady() retries until it works.
    const NEAR = 0.15, FAR = 2.5;   // s
    function align() {
        if (!win || active || audio.paused) return;
        // Match on as much unbroken sound as the tap has (up to ~0.7 s), at least ~0.2 s of it
        const { ctx, tap } = Radio.audioGraph();
        const n = Math.min(tap.fftSize, Math.floor(((performance.now() - since) / 1000 - 0.05) * ctx.sampleRate));
        if (n < 8192) return;
        const found = locate(n);
        if (found) { win.offset = found.pos - found.claimed; win.aligned = true; }
    }

    // The search itself, on the tap's latest n samples → { pos (disc s), at (audio
    // clock s), claimed (what the <audio> says its time is) } where it ends, or null
    function locate(n) {
        const { ctx, tap } = Radio.audioGraph();
        const all = new Float32Array(tap.fftSize);
        tap.getFloatTimeDomainData(all);
        const at = ctx.currentTime, claimed = audio.currentTime;    // the capture ends here (within a few ms)
        const cap = all.subarray(all.length - n);
        const d = win.mix, sr = ctx.sampleRate;
        const energy = step => { let e = 0; for (let i = 0; i < n; i += step) e += cap[i] * cap[i]; return e; };
        const match = (lag, step, ec) => {
            let s = 0, e = 0;
            for (let i = 0; i < n; i += step) { const v = d[lag + i] || 0; s += cap[i] * v; e += v * v; }
            return s / Math.sqrt(ec * e || 1);
        };
        const guess = Math.round((claimed + win.offset) * sr) - n;  // where the capture should start in d
        const search = reach => {
            const span = reach * sr, coarse = energy(16), fine = energy(1);
            let best = -Infinity, lag = guess;
            for (let l = guess - span; l <= guess + span; l += 16) {
                const s = match(l, 16, coarse) - 0.05 * Math.abs(l - guess) / span;
                if (s > best) { best = s; lag = l; }
            }
            best = -Infinity;
            for (let l = lag - 16, end = lag + 16; l <= end; l++) {
                const s = match(l, 1, fine);
                if (s > best) { best = s; lag = l; }
            }
            return best > 0.9 ? lag : null;                         // a clear match, not a lookalike
        };
        const lag = search(NEAR) ?? search(FAR);
        return lag === null ? null : { pos: (lag + n) / sr, at, claimed };
    }

    // Main-thread time (performance.now() ms) → the audio clock (s). The context's
    // currentTime only moves once per audio callback, so the freshest reading —
    // the largest gap — is the best estimate; it may drift down very slowly.
    let skew = -Infinity, skewAt = 0;
    function audioTime(ms) {
        const now = performance.now();
        skew = Math.max(Radio.audioGraph().ctx.currentTime - now / 1000, skew - (now - skewAt) * 1e-7);
        skewAt = now;
        return ms / 1000 + skew;
    }

    const inWindow = t => { const b = t + win.offset; return b > 1 && b < win.len - 1; };

    function swapBack() {
        if (!active) return;
        active = false;
        const { ctx, el } = Radio.audioGraph();
        el.gain.setTargetAtTime(1, ctx.currentTime, FADE);
        out.gain.setTargetAtTime(0, ctx.currentTime, FADE);
    }

    return {
        setup,

        // Keep a lined-up stretch decoded around the playhead while `src` plays. Cheap; call ~1/s.
        keepReady(src) {
            if (!node || active || loading || audio.paused || Radio.nowSrc() !== src || !isFinite(audio.duration)) return;
            audioTime(performance.now());                        // keeps the clock estimate fresh
            const t = audio.currentTime;
            if (win?.src === src && Math.abs(t + win.offset - win.len / 2) < RECENTRE) {
                if (!win.aligned) align();
                return;
            }
            loading = true;
            load(src, t).catch(() => {}).finally(() => { loading = false; });
        },

        canScratch: src => !!node && !active && !audio.paused && win?.src === src && win.aligned && inWindow(audio.currentTime),

        // A hand lands on the disc at time `ms`: the music stops where the <audio>
        // is and the disc holds it from here. Returns that position.
        start(ms) {
            const { ctx, el } = Radio.audioGraph();
            active = true;
            const pos = audio.currentTime + win.offset;
            lastT = audioTime(ms);
            node.port.postMessage({ pos, t: lastT, reset: true });
            el.gain.setTargetAtTime(0, ctx.currentTime, FADE);
            out.gain.setTargetAtTime(audio.volume, ctx.currentTime, FADE);
            return pos;
        },

        // The disc was at `pos` at time `ms` (performance.now() clock)
        move(pos, ms) {
            if (!active) return;
            const t = audioTime(ms);
            if (t <= lastT) return;                               // keep the path in order
            lastT = t;
            node.port.postMessage({ pos, t });
        },

        // Seek the muted <audio> to disc position `pos` and, once it's playing, find
        // exactly where it really landed → { pos, ms }: it was at pos at time ms and
        // moves at 1×. null if it can't be found (then just crossfade).
        follow(pos) {
            return new Promise(resolve => {
                const timer = setTimeout(() => resolve(null), 1500);
                audio.addEventListener('seeked', () => setTimeout(() => {
                    clearTimeout(timer);
                    const found = active && locate(12000);               // ~0.25 s, all after the seek
                    if (!found) return resolve(null);
                    win.offset  = found.pos - found.claimed;              // lined up again, for free
                    win.aligned = true;
                    resolve({ pos: found.pos, ms: (found.at - skew) * 1000 });
                }, 350), { once: true });
                audio.currentTime = Math.max(0, pos - win.offset);
            });
        },

        // Hand the music back to the <audio> element (crossfade)
        finish: swapBack,
        cancel: swapBack,
    };
})();


/* ════════════════════════════════════════════════════════
   MIXTAPE — manager overlay
   LEFT  library wheel (grouped by sort key, DDR-style like the inventory)
   MID   selected track: CD in its case (scratchable), ‹ › browse, preview, add/remove
   RIGHT the mixtape itself: play, reorder, remove, shuffle, save
════════════════════════════════════════════════════════ */

const Mixtape = (() => {

    // Wheel feel
    const C = {
        TRACK_H:   64,     // px — sync with --mix-track-h in music.css
        DIV_H:     40,     // px — group divider rows (A, B, C… / 3–5 MIN)
        VISIBLE:   7,      // rows visible either side of centre
        SPRING:    0.2,    // wheel catch-up per frame (at 60fps)
        PULL_SPR:  0.11,   // selected row slide-out speed
        PULL_PX:   24,     // selected row slide-out distance
        SC_MIN:    0.65,   // scale at the edge of the visible band
        OP_MIN:    0.10,   // opacity at the edge
        FALLOFF:   1.7,    // falloff curve power
        PX_PER_NOTCH: 100, // scroll distance that moves one track (one mouse-wheel notch)
        SNAP_MS:   140,    // snap to the nearest track this long after scrolling stops
    };

    const $ = id => document.getElementById(id);

    let isOpen = false, abort = null, returnFocus = null, confirmingClose = false;

    // Working copy of the mixtape + JSON of the last saved version
    let tape = [], shuffle = false, savedJson = '';

    // Library wheel
    let sortMode = 'artist';
    let items = [], heights = [], cum = [], total = 0;   // rows, their heights, running totals
    // Scrolling is counted in tracks (`tpos`, fractional while gliding), so
    // one notch = one track however many dividers sit between. That maps to
    // a px position along the endless list (`goal`), which `pos` springs to.
    let tracks = [];                     // item indexes of the track rows, in order
    let sel = 0, tpos = 0, pos = 0, goal = 0, pull = [], raf = null, wrapH = 0;
    let snapTimer = null, lastTick = 0;

    // Track lengths in seconds, fetched once per page load
    const durations = {};
    let durationsRequested = false;
    let durationRenderTimer = null;


    /* ── Helpers ── */

    const on  = (el, type, fn, opts = {}) => el.addEventListener(type, fn, { ...opts, signal: abort.signal });
    const esc = Utils.esc;
    const fmt = s => (s ? Utils.formatTime(s) : '');   // blank while the length is unknown
    const onTape    = src => tape.some(t => t.src === src);
    const snapshot  = () => JSON.stringify({ q: tape.map(t => t.src), s: shuffle });
    const isDirty   = () => snapshot() !== savedJson;
    const selTrack  = () => items[sel]?.track ?? null;

    function msg(text, type = '') {
        const el = $('mixMsg');
        if (el) { el.textContent = text; el.className = 'mix-msg' + (type ? ` mix-msg-${type}` : ''); }
    }


    /* ════════ OPEN / CLOSE ════════ */

    async function open() {
        if (isOpen) return;
        isOpen = true;
        returnFocus = document.activeElement;
        abort = new AbortController();
        confirmingClose = false;
        SFX.positive();
        Scratch.setup();          // needs this click to start Web Audio

        const library = await Radio.loadLibrary();
        tape      = [...Radio.getTape()];
        shuffle   = Radio.getShuffle();
        savedJson = snapshot();

        buildShell();
        $('mixLibCount').textContent = `${library.length} track${library.length === 1 ? '' : 's'}`;
        resort(Radio.nowSrc());           // open on what's playing, so its CD is already turning
        renderQueue();
        renderStatus();
        prefetchDurations(library);
    }

    function close(force = false) {
        if (!isOpen) return;

        if (!force && isDirty() && !confirmingClose) {
            confirmingClose = true;
            msg('Unsaved changes — close again to discard them.', 'error');
            SFX.negative();
            return;
        }
        // Discarding: put the saved mixtape back into playback
        if (isDirty()) {
            const saved = JSON.parse(savedJson);
            const lib   = Radio.getLibrary();
            Radio.setTape(saved.q.map(src => lib.find(t => t.src === src)).filter(Boolean), saved.s);
        }

        isOpen = false;
        SFX.negative();
        abort.abort();
        cancelAnimationFrame(raf);
        raf = null;
        clearTimeout(snapTimer);
        cancelAnimationFrame(cd.raf);
        clearTimeout(cd.swap);
        if (cd.scratch) Scratch.cancel();          // the radio carries on from where it was
        cd = null;

        const ov = $('mixtapeOverlay');
        if (ov) {
            ov.classList.remove('visible');
            setTimeout(() => ov.remove(), 400);
        }
        returnFocus?.focus?.();
    }


    /* ════════ SHELL ════════ */

    function buildShell() {
        $('mixtapeOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'mixtapeOverlay';
        ov.tabIndex = -1;
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-labelledby', 'mixTitle');

        ov.innerHTML = `
            <header class="mix-header">
                <h2 class="mix-title" id="mixTitle">Mixtape</h2>
                <span class="mix-sub" id="mixLibCount"></span>
                <span class="mix-unsaved" id="mixUnsaved" hidden>Unsaved changes</span>
                <button type="button" class="mix-close-btn" data-act="close">Close <span aria-hidden="true">✕</span></button>
            </header>

            <div class="mix-body">
                <section class="mix-col mix-col-library" aria-labelledby="mixLibTitle">
                    <div class="mix-col-head">
                        <h3 class="mix-col-label" id="mixLibTitle">Library</h3>
                        <div class="mix-sort" role="group" aria-label="Sort library">
                            <span class="mix-sort-label">Sort</span>
                            <button type="button" class="mix-sort-btn" data-sort="artist">Artist</button>
                            <button type="button" class="mix-sort-btn" data-sort="title">Title</button>
                            <button type="button" class="mix-sort-btn" data-sort="duration">Length</button>
                        </div>
                    </div>
                    <div class="mix-wheel-wrap" id="mixWheelWrap">
                        <div class="mix-wheel-selector" aria-hidden="true"></div>
                        <div class="mix-wheel" id="mixWheel" role="listbox" aria-label="Library" tabindex="0"></div>
                    </div>
                    <p class="mix-hint">↑ ↓ or scroll to browse · Enter or click again to add / remove</p>
                </section>

                <section class="mix-col mix-col-record" aria-label="Selected track">
                    <div class="mix-record-info">
                        <p class="mix-record-title"  id="mixRecordTitle">—</p>
                        <p class="mix-record-artist" id="mixRecordArtist"></p>
                    </div>
                    <!-- The track's CD in its jewel case: click the case to crack it open
                         and pop the disc out; grab the disc to scratch (see THE CD) -->
                    <div class="mix-cd-stage" id="mixCdStage" aria-hidden="true">
                        <div class="mix-case-tray"></div>
                        <div class="mix-cd-slot" id="mixCdSlot">
                            <div class="cd">
                                <div class="cd-spin" id="mixCd"><div class="cd-label" id="mixCdLabel"></div></div>
                            </div>
                        </div>
                        <button type="button" class="mix-case-lid" id="mixCaseLid" data-act="case" aria-label="Open the CD case" tabindex="-1">
                            <span class="mix-case-art" id="mixCaseArt"></span>
                        </button>
                    </div>
                    <!-- ‹ › browse the library · centre previews the selected track -->
                    <div class="mix-browse">
                        <button type="button" class="mix-browse-btn" data-act="browse-prev" aria-label="Previous track in library">‹</button>
                        <button type="button" class="mix-preview-btn" data-act="preview" id="mixPreviewBtn">
                            <span class="mix-preview-icon" id="mixPreviewIcon" aria-hidden="true">&#9654;</span>
                            <span id="mixPreviewLabel">Play</span>
                        </button>
                        <button type="button" class="mix-browse-btn" data-act="browse-next" aria-label="Next track in library">›</button>
                    </div>
                    <button type="button" class="mix-toggle-btn" data-act="toggle" id="mixToggleBtn">Add to mixtape</button>
                </section>

                <section class="mix-col mix-col-queue" aria-labelledby="mixQueueTitle">
                    <div class="mix-col-head">
                        <h3 class="mix-col-label" id="mixQueueTitle">Your mixtape</h3>
                        <span class="mix-col-count" id="mixQueueCount"></span>
                        <button type="button" class="mix-text-btn" data-act="shuffle" id="mixShuffleBtn" aria-pressed="false">Shuffle</button>
                        <button type="button" class="mix-text-btn" data-act="clear" id="mixClearBtn">Clear</button>
                    </div>
                    <ol class="mix-queue-list" id="mixQueueList"></ol>
                    <p class="mix-hint">Click to play · drag or Alt + ↑ ↓ to reorder</p>
                    <footer class="mix-footer">
                        <p class="mix-msg" id="mixMsg" role="status" aria-live="polite"></p>
                        <button type="button" class="mix-save-btn" data-act="save" id="mixSaveBtn">Save mixtape</button>
                    </footer>
                </section>
            </div>
        `;
        document.body.appendChild(ov);

        on(ov, 'click', onClick);
        on(ov, 'keydown', onKeydown);
        initCd();

        // Library wheel: follows the scroll continuously, then snaps to the
        // nearest track once it stops. The height is cached for the per-frame draw.
        const wrap = $('mixWheelWrap');
        on(wrap, 'wheel', e => {
            e.preventDefault();
            if (!total) return;
            const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * wrapH : e.deltaY;
            glideTo(tpos + Math.max(-3, Math.min(3, dy / C.PX_PER_NOTCH)));
            clearTimeout(snapTimer);
            snapTimer = setTimeout(() => glideTo(Math.round(tpos)), C.SNAP_MS);
        }, { passive: false });
        const ro = new ResizeObserver(() => { wrapH = wrap.clientHeight; draw(); });
        ro.observe(wrap);
        abort.signal.addEventListener('abort', () => ro.disconnect());

        // Queue drag-and-drop (delegated)
        const list = $('mixQueueList');
        on(list, 'dragstart', onDragStart);
        on(list, 'dragover',  onDragOver);
        on(list, 'drop',      onDrop);
        on(list, 'dragend',   clearDragMarks);

        // Keep "now playing" marks + play buttons in sync with the radio
        const audio = document.getElementById('bgMusic');
        on(document, 'radio:track-changed', renderNowPlaying);
        on(audio, 'play',  renderNowPlaying);
        on(audio, 'pause', renderNowPlaying);

        requestAnimationFrame(() => { ov.classList.add('visible'); ov.focus(); });
    }


    /* ════════ INPUT ════════ */

    function onClick(e) {
        const sortBtn = e.target.closest('[data-sort]');
        if (sortBtn) {
            sortMode = sortBtn.dataset.sort;
            resort(selTrack()?.src);
            SFX.hover();
            return;
        }

        const row = e.target.closest('.mix-track-row');
        if (row) {
            const i = Number(row.dataset.idx);
            i === sel ? toggleTrack(selTrack()) : stepTo(i);   // second click on a row adds/removes it
            return;
        }

        const qBtn = e.target.closest('[data-qi]');
        if (qBtn) {
            const track = tape[Number(qBtn.dataset.qi)];
            if (qBtn.dataset.qact === 'remove') toggleTrack(track);
            else Radio.playSrc(track.src);
            return;
        }

        switch (e.target.closest('[data-act]')?.dataset.act) {
            case 'close':   close(); break;
            case 'case':    toggleCase(); break;
            case 'toggle':      toggleTrack(selTrack()); break;
            case 'browse-prev': step(-1); break;
            case 'browse-next': step(1);  break;
            case 'preview': {
                // Pause if this track is what's playing, otherwise play it
                const t = selTrack();
                if (t) Radio.nowSrc() === t.src ? Radio.togglePlay() : Radio.playTrack(t);
                break;
            }
            case 'shuffle': shuffle = !shuffle; changed(); SFX.hover(); break;
            case 'clear':   if (tape.length) { tape = []; changed(); SFX.negative(); } break;
            case 'save':    save(); break;
        }
    }

    function onKeydown(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key === 'Tab')    { Utils.trapFocus(e, $('mixtapeOverlay')); return; }

        const qi = e.target.dataset?.qi;
        const dir = { ArrowDown: 1, ArrowUp: -1 }[e.key];

        // Alt + ↑↓ on a mixtape row moves it
        if (qi !== undefined && e.altKey && dir) {
            e.preventDefault();
            moveInTape(Number(qi), Number(qi) + dir, true);
            return;
        }
        // ↑↓ anywhere else browses the library
        if (dir && qi === undefined) {
            e.preventDefault();
            step(dir);
            return;
        }
        // Enter on the wheel (or the dialog itself) adds/removes the selected track
        if (e.key === 'Enter' && (e.target.id === 'mixWheel' || e.target.id === 'mixtapeOverlay')) {
            e.preventDefault();
            toggleTrack(selTrack());
        }
    }


    /* ════════ LIBRARY WHEEL ════════ */

    // Sort the library into wheel rows with group dividers, keeping keepSrc selected
    function resort(keepSrc) {
        const library = [...Radio.getLibrary()];
        const by = {
            artist:   (a, b) => (a.artist || '').localeCompare(b.artist || ''),
            title:    (a, b) => (a.title  || '').localeCompare(b.title  || ''),
            duration: (a, b) => (durations[a.src] ?? 1e9) - (durations[b.src] ?? 1e9),
        };
        library.sort(by[sortMode]);

        items = [];
        let lastKey = null;
        for (const track of library) {
            const key = groupKey(track);
            if (key !== lastKey) { items.push({ label: key }); lastKey = key; }
            items.push({ track });
        }
        heights = items.map(it => (it.track ? C.TRACK_H : C.DIV_H));
        cum = [0];
        heights.forEach((h, i) => cum.push(cum[i] + h));
        total = cum[items.length];

        const keep = keepSrc ? items.findIndex(it => it.track?.src === keepSrc) : -1;
        tracks = items.flatMap((it, i) => (it.track ? [i] : []));
        sel  = keep >= 0 ? keep : (tracks[0] ?? 0);
        tpos = Math.max(0, tracks.indexOf(sel));
        pos  = goal = tracks.length ? pxAt(tpos) : 0;
        pull = items.map(() => 0);

        document.querySelectorAll('.mix-sort-btn').forEach(b =>
            b.setAttribute('aria-pressed', String(b.dataset.sort === sortMode)));
        renderWheel();
        updateRecord();
        startLoop();
    }

    function groupKey(track) {
        if (sortMode === 'duration') {
            const s = durations[track.src];
            return s == null ? 'Unknown' : s < 180 ? 'Under 3 min' : s < 300 ? '3–5 min' : '5+ min';
        }
        return ((sortMode === 'artist' ? track.artist : track.title) || '?')[0].toUpperCase();
    }

    function renderWheel() {
        const wheel = $('mixWheel');
        if (!wheel) return;
        let num = 0;
        wheel.innerHTML = items.map((it, i) => {
            const style = `height:${heights[i]}px`;
            if (!it.track) {
                return `<div class="mix-divider-row" style="${style}" aria-hidden="true">
                            <span class="mix-div-tab">${esc(it.label)}</span><span class="mix-div-line"></span>
                        </div>`;
            }
            const t = it.track;
            const len = fmt(durations[t.src]);
            return `<div class="mix-track-row" id="mixRow${i}" data-idx="${i}" data-src="${esc(t.src)}"
                         role="option" aria-selected="false" style="${style}">
                        <span class="mix-track-index">${String(++num).padStart(2, '0')}</span>
                        <span class="mix-track-info">
                            <span class="mix-track-title">${esc(t.title)}</span>
                            <span class="mix-track-artist">${esc(t.artist)}${len ? ` · ${len}` : ''}</span>
                        </span>
                        <span class="mix-on-tape-tag">On tape</span>
                    </div>`;
        }).join('') || '<p class="mix-empty">No tracks.</p>';

        markTape();
        renderNowPlaying();
        markActive();
        draw();
    }

    // Rows have different heights (tracks vs dividers), so positions use running totals (cum)
    const centreOf = i => cum[i] + heights[i] / 2;
    const wrapDist = d => d - Math.round(d / total) * total;   // shortest way round the endless list

    // Place every row by its distance from the wheel position
    function draw() {
        const rows = $('mixWheel')?.children;
        if (!rows || !total || !wrapH) return;

        const cy = wrapH / 2;
        for (let i = 0; i < items.length; i++) {
            const row = rows[i];
            if (!row) continue;
            const h    = heights[i];
            const dist = wrapDist(centreOf(i) - pos);
            row.style.top = `${(cy - h / 2 + dist).toFixed(1)}px`;

            const nd = Math.abs(dist) / (C.TRACK_H * C.VISIBLE);   // 0 at centre → 1 at edge
            const f  = Math.pow(Math.min(nd, 1), C.FALLOFF);

            if (!items[i].track) {
                row.style.transform = `scale(${Math.max(0.6, 1 - f * 0.3).toFixed(3)})`;
                row.style.opacity   = Math.max(0, 0.75 - f * 0.7).toFixed(3);
            } else {
                const active = i === sel;
                const scale  = active ? 1 : 1 - f * (1 - C.SC_MIN);
                row.style.transform     = `translateX(${(pull[i] * C.PULL_PX).toFixed(1)}px) scale(${scale.toFixed(4)})`;
                row.style.opacity       = active ? '1' : (1 - f * (1 - C.OP_MIN)).toFixed(4);
                row.style.pointerEvents = nd > 1 ? 'none' : 'auto';
            }
        }
    }

    // Spring the wheel + pull-out toward their targets; stops when settled
    let lastTime = null;
    function loop(now) {
        const dt = lastTime === null ? 1000 / 60 : now - lastTime;
        lastTime = now;
        const diff = goal - pos;
        pos = Math.abs(diff) < 0.1 ? goal : pos + diff * Utils.springStep(C.SPRING, dt);

        const pullK = Utils.springStep(C.PULL_SPR, dt);
        let pulling = false;
        for (let i = 0; i < pull.length; i++) {
            const goal = i === sel ? 1 : 0;
            const d    = goal - pull[i];
            if (Math.abs(d) > 0.001) { pull[i] += d * pullK; pulling = true; }
            else pull[i] = goal;
        }
        draw();
        raf = (pos === goal && !pulling) ? null : requestAnimationFrame(loop);
    }
    const startLoop = () => { if (raf === null) { lastTime = null; raf = requestAnimationFrame(loop); } };

    // Move the selection ±1 track (dividers are skipped automatically)
    function step(dir) {
        clearTimeout(snapTimer);
        glideTo(Math.round(tpos) + dir);
    }

    const mod = (a, n) => ((a % n) + n) % n;

    // Track position t (fractional, unbounded) → px along the list,
    // interpolating between neighbouring track centres (over any divider)
    function pxAt(t) {
        const n = tracks.length, k = Math.floor(t);
        const lap = j => Math.floor(j / n) * total;          // each time round adds a full list length
        const a = centreOf(tracks[mod(k, n)])     + lap(k);
        const b = centreOf(tracks[mod(k + 1, n)]) + lap(k + 1);
        return a + (b - a) * (t - k);
    }

    // Move to track position t; the nearest track becomes selected
    function glideTo(t) {
        if (!tracks.length) return;
        tpos = t;
        goal = pxAt(t);
        const next = tracks[mod(Math.round(t), tracks.length)];
        if (next !== sel) {
            sel = next;
            markActive();
            updateRecord();
            // A soft tick as tracks pass — at most every 70ms, so fast scrolls don't rattle
            const now = performance.now();
            if (now - lastTick > 70) { lastTick = now; SFX.hover(); }
        }
        startLoop();
    }

    // Jump to the track at item index i, shortest way round (keys, ‹ ›, clicks)
    function stepTo(i) {
        const j = tracks.indexOf(i);
        if (j < 0) return;
        clearTimeout(snapTimer);
        const n = tracks.length, base = Math.round(tpos);
        let d = j - mod(base, n);
        if (d >  n / 2) d -= n;
        if (d < -n / 2) d += n;
        glideTo(base + d);
    }

    function markActive() {
        const wheel = $('mixWheel');
        if (!wheel) return;
        wheel.querySelectorAll('.mix-track-row').forEach(r => {
            const active = Number(r.dataset.idx) === sel;
            r.classList.toggle('mix-track-row-active', active);
            r.setAttribute('aria-selected', String(active));
        });
        wheel.setAttribute('aria-activedescendant', `mixRow${sel}`);
    }

    function markTape() {
        document.querySelectorAll('.mix-track-row').forEach(r =>
            r.classList.toggle('on-tape', onTape(r.dataset.src)));
    }


    /* ════════ RECORD + NOW PLAYING ════════ */

    function updateRecord() {
        const t = selTrack();
        if (!t || !$('mixRecordTitle')) return;
        $('mixRecordTitle').textContent  = t.title  || '—';
        $('mixRecordArtist').textContent = t.artist || '';

        swapCd(t);

        const taped = onTape(t.src);
        const toggle = $('mixToggleBtn');
        toggle.textContent = taped ? '✓ On mixtape · Remove' : '+ Add to mixtape';
        toggle.classList.toggle('is-on', taped);
        renderNowPlaying();
    }

    // Now-playing highlights, the CD's motor and the preview button
    function renderNowPlaying() {
        const now = Radio.nowSrc();
        document.querySelectorAll('#mixtapeOverlay [data-src]').forEach(el =>
            el.classList.toggle('now-playing', el.dataset.src === now));

        // The preview button only shows "Pause" while the SELECTED track plays
        const selPlaying = Radio.isPlaying() && selTrack()?.src === now;
        if (cd) { cd.playing = selPlaying; cd.checkAt = 0; spinCd(); }   // (checkAt: get Scratch ready now)
        if ($('mixPreviewBtn')) {
            $('mixPreviewIcon').innerHTML    = selPlaying ? '&#9646;&#9646;' : '&#9654;';
            $('mixPreviewLabel').textContent = selPlaying ? 'Pause' : 'Play';
        }
    }


    /* ════════ THE CD ════════
       Each album's disc sits in a jewel case: click it and the lid cracks
       open and the disc pops out (music.css); browse to another album and
       it goes back in. It spins while the selected track plays. Grab it to scratch: the
       disc's angle is the playhead (one turn = SEC_PER_TURN s of audio),
       played through Scratch. Let go and it spins up from the hand's speed
       to normal; meanwhile the muted <audio> is sent ahead to meet it, and
       the spin-up absorbs whatever small gap is left before they crossfade.
       With nothing playing (or before Scratch is ready) a flick just spins
       the disc and it runs down. */

    const CD = {
        SEC_PER_TURN: 1.8,   // s of audio per turn
        MOTOR:        0.4,   // s — how quickly the motor spins it up or down (no scratch)
        SPIN_UP:      0.9,   // s — after a scratch: from the hand's speed up to normal
        MEET:         0.5,   // s — the least time taken to ease into where the <audio> really is
        SEEK_LAG:     0.08,  // s — about how long the <audio> takes to play again after a seek
        SAMPLE_MS:    60,    // pointer history used for the hand's speed
        CLOSE_MS:     320,   // disc back in, lid shut — then the art changes (sync with music.css)
    };
    const TURN  = Math.PI * 2;
    const SPEED = TURN / CD.SEC_PER_TURN;          // rad/s at normal playback
    const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cd = null;   // { angle, vel, playing, hand, scratch, raf, last, checkAt, swap, art } — made per open

    function initCd() {
        cd = { angle: 0, vel: 0, playing: false, hand: null, scratch: null, raf: null, last: null, checkAt: 0, swap: null, art: null };
        const disc = $('mixCdSlot');
        on(disc, 'pointerdown',   grabCd);
        on(disc, 'pointermove',   turnCd);
        on(disc, 'pointerup',     releaseCd);
        on(disc, 'pointercancel', releaseCd);
    }

    // Click the case: crack it open and pop the disc out, or put it back and shut it
    function toggleCase(open = !$('mixCdStage').classList.contains('open')) {
        $('mixCdStage').classList.toggle('open', open);
        $('mixCaseLid').setAttribute('aria-label', open ? 'Close the CD case' : 'Open the CD case');
        if (!open) {
            if (cd.scratch) { Scratch.cancel(); cd.scratch = null; }
            cd.hand = null;
            $('mixCdSlot').classList.remove('held');
        }
        SFX.hover();
    }

    // Another track selected. Same album (same cover): same case, left as it is.
    // Another album: the open case shuts, and its art changes once the disc is in.
    function swapCd(t) {
        if (!cd || !$('mixCdStage')) return;
        const art = t.art ? `url("${encodeURI(t.art)}")` : '';
        if (cd.art === art) return;
        cd.art = art;
        clearTimeout(cd.swap);
        const wasOpen = $('mixCdStage').classList.contains('open');
        if (wasOpen) toggleCase(false);
        cd.swap = setTimeout(() => {
            $('mixCaseArt').style.backgroundImage = art;
            $('mixCaseArt').classList.toggle('loaded', !!art);
            $('mixCdLabel').style.backgroundImage = art;
        }, wasOpen ? CD.CLOSE_MS : 0);
    }

    // Disc position (disc seconds) while scratching, from its angle
    const discPos = s => s.from + (cd.angle - s.angle) / SPEED;

    // Disc position during a spin-up at time t (s): speed eases from v0 (× normal)
    // to normal over SPIN_UP (smoothstep, integrated), plus the ease into the <audio>
    function spinPos(sp, t) {
        const T = CD.SPIN_UP, u = Math.min(Math.max((t - sp.t0) / T, 0), 1);
        let p = sp.p0 + T * (sp.v0 * u + (1 - sp.v0) * (u ** 3 - u ** 4 / 2)) + Math.max(0, t - sp.t0 - T);
        if (sp.fix?.len) {
            const w = Math.min(Math.max((t - sp.fix.t) / sp.fix.len, 0), 1);
            p += sp.fix.gap * w * w * (3 - 2 * w);
        }
        return p;
    }

    const handAngle = e => Math.atan2(e.clientY - cd.hand.cy, e.clientX - cd.hand.cx);

    // The hand's turning speed (rad/s) over the last few moves; 0 once it holds still
    function handSpeed(now) {
        const h = cd.hand;
        const recent = h.samples.filter(s => now - s.t < CD.SAMPLE_MS);
        const secs = Math.max((recent.reduce((t, s) => t + s.dt, 0) + now - h.last) / 1000, 1 / 120);
        return recent.reduce((a, s) => a + s.d, 0) / secs;
    }

    function grabCd(e) {
        if (e.button !== 0 || cd.hand || !$('mixCdStage').classList.contains('open')) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = $('mixCd').getBoundingClientRect();
        cd.hand = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, samples: [], last: e.timeStamp };
        cd.hand.at = handAngle(e);
        const s = cd.scratch, t = selTrack();
        if (s) {                                   // caught again while spinning up: carry on from here
            s.from  = s.spin ? spinPos(s.spin, e.timeStamp / 1000) : discPos(s);
            s.angle = cd.angle;
            s.spin  = null;
            Scratch.move(s.from, e.timeStamp);
        } else if (cd.playing && t && Scratch.canScratch(t.src)) {
            cd.scratch = { from: Scratch.start(e.timeStamp), angle: cd.angle, spin: null };
        }
        $('mixCdSlot').classList.add('held');
        spinCd();
    }

    function turnCd(e) {
        const h = cd.hand;
        if (!h || e.pointerId !== h.id) return;
        const s = cd.scratch, before = s && discPos(s);
        const a = handAngle(e);
        let d = a - h.at;
        d -= TURN * Math.round(d / TURN);          // the short way across ±180°
        h.at = a;
        cd.angle += d;
        if (s) {
            // After a pause, pin down where it sat, so the sound stays still until now
            if (e.timeStamp - h.last > 50) Scratch.move(before, e.timeStamp - 16);
            Scratch.move(discPos(s), e.timeStamp);
        }
        h.samples = h.samples.filter(p => e.timeStamp - p.t < CD.SAMPLE_MS);
        h.samples.push({ t: e.timeStamp, dt: e.timeStamp - h.last, d });
        h.last = e.timeStamp;
    }

    function releaseCd(e) {
        if (!cd.hand || e.pointerId !== cd.hand.id) return;
        const v = handSpeed(e.timeStamp);
        cd.hand = null;
        $('mixCdSlot').classList.remove('held');
        const s = cd.scratch;
        if (!s) { cd.vel = v; return; }            // a flick keeps going

        // Spin up from the hand's speed (forwards, at most normal). The <audio> is sent
        // to where the disc will be once it's up to speed — the spin-up falls
        // `behind` full speed by a known amount — then located, and the gap eased out.
        const t0 = e.timeStamp / 1000, v0 = REDUCED_MOTION ? 1 : Math.min(Math.max(v / SPEED, 0), 1);
        const sp = s.spin = { t0, p0: discPos(s), v0, fix: null };
        const behind = CD.SPIN_UP * (1 - v0) / 2;
        Scratch.follow(sp.p0 + CD.SEEK_LAG - behind).then(found => {
            if (s.spin !== sp || cd?.scratch !== s) return;   // grabbed again, or gone
            if (!found) { sp.fix = { gap: 0, len: 0, t: 0 }; return; }
            // Start easing after the path already sent (see cdFrame), end no sooner than the spin-up
            const start = performance.now() / 1000 + 0.06;
            const end   = Math.max(start + CD.MEET, t0 + CD.SPIN_UP);
            const gap   = found.pos + (end - found.ms / 1000) - spinPos(sp, end);
            sp.fix = Math.abs(gap) < 0.3 ? { t: start, len: end - start, gap } : { gap: 0, len: 0, t: 0 };
        });
    }

    function cdFrame(now) {
        const dt = cd.last === null ? 0 : Math.min((now - cd.last) / 1000, 0.1);
        cd.last = now;
        const s = cd.scratch;

        if (cd.hand) cd.vel = handSpeed(now);
        else if (s?.spin) {
            // Spinning back up: the disc follows the plan; the path is sent 50 ms
            // ahead so the worklet never runs out of it. Crossfade once the two meet.
            const sp = s.spin, t = now / 1000;
            cd.angle = s.angle + (spinPos(sp, t) - s.from) * SPEED;
            Scratch.move(spinPos(sp, t + 0.05), now + 50);
            if (sp.fix && t >= sp.fix.t + sp.fix.len && t >= sp.t0 + CD.SPIN_UP) {
                Scratch.finish();
                cd.scratch = null;
                cd.vel = SPEED;
            }
        } else {
            // The motor: towards normal speed while playing, else to a stop
            const want = cd.playing && !REDUCED_MOTION ? SPEED : 0;
            cd.vel += (want - cd.vel) * (1 - Math.exp(-dt / CD.MOTOR));
            if (Math.abs(want - cd.vel) < 1e-3) cd.vel = want;
            cd.angle += cd.vel * dt;
        }
        $('mixCd').style.transform = `rotate(${(cd.angle % TURN).toFixed(4)}rad)`;

        if (s && selTrack()?.src !== Radio.nowSrc()) {         // the track changed under the scratch
            Scratch.cancel();
            cd.scratch = null;
        } else if (!s && cd.playing && now > cd.checkAt) {
            cd.checkAt = now + 250;
            const src = selTrack().src;
            Scratch.keepReady(src);
            // Grabbed before it was ready: start scratching from here as soon as it is
            if (cd.hand && Scratch.canScratch(src)) cd.scratch = { from: Scratch.start(now), angle: cd.angle, spin: null };
        }

        const busy = cd.hand || cd.scratch || cd.vel !== 0 || cd.playing;
        cd.raf = busy ? requestAnimationFrame(cdFrame) : null;
    }
    function spinCd() {
        if (cd && cd.raf === null) { cd.last = null; cd.raf = requestAnimationFrame(cdFrame); }
    }


    /* ════════ MIXTAPE (queue) ════════ */

    function renderQueue() {
        const list = $('mixQueueList');
        if (!list) return;
        $('mixQueueCount').textContent = `${tape.length} song${tape.length === 1 ? '' : 's'}`;

        if (!tape.length) {
            list.innerHTML = '<li class="mix-empty">Empty — the whole library plays. Pick tracks on the left and press Add.</li>';
            return;
        }
        list.innerHTML = tape.map((t, i) => `
            <li class="mix-queue-row" draggable="true" data-src="${esc(t.src)}" data-drag="${i}">
                <span class="mix-queue-grip" aria-hidden="true">⠿</span>
                <button type="button" class="mix-queue-play" data-qi="${i}" aria-label="Play ${esc(t.title)}, ${i + 1} of ${tape.length}">
                    <span class="mix-queue-pos">${String(i + 1).padStart(2, '0')}</span>
                    <span class="mix-queue-info">
                        <span class="mix-queue-title">${esc(t.title)}</span>
                        <span class="mix-queue-artist">${esc(t.artist)}</span>
                    </span>
                </button>
                <button type="button" class="mix-queue-remove" data-qi="${i}" data-qact="remove" aria-label="Remove ${esc(t.title)}">✕</button>
            </li>`).join('');
        renderNowPlaying();
    }

    function toggleTrack(track) {
        if (!track) return;
        const i = tape.findIndex(t => t.src === track.src);
        if (i >= 0) { tape.splice(i, 1); SFX.negative(); }
        else        { tape.push(track);  SFX.positive(); }
        changed();
    }

    function moveInTape(from, to, keepFocus = false) {
        if (to < 0 || to >= tape.length || from === to) return;
        tape.splice(to, 0, tape.splice(from, 1)[0]);
        changed();
        if (keepFocus) $('mixQueueList').querySelector(`.mix-queue-play[data-qi="${to}"]`)?.focus();
    }

    // Every edit: apply to playback right away, refresh UI
    function changed() {
        confirmingClose = false;
        Radio.setTape([...tape], shuffle);
        markTape();
        renderQueue();
        updateRecord();
        renderStatus();
    }

    function renderStatus() {
        const dirty = isDirty();
        $('mixUnsaved').hidden = !dirty;
        $('mixSaveBtn').classList.toggle('is-dirty', dirty);
        $('mixClearBtn').disabled = !tape.length;
        const sh = $('mixShuffleBtn');
        sh.setAttribute('aria-pressed', String(shuffle));
        sh.textContent = shuffle ? 'Shuffle: on' : 'Shuffle: off';
    }

    async function save() {
        const btn = $('mixSaveBtn');
        btn.disabled = true;
        msg('Saving…');
        try {
            const res = await fetch(`${CONFIG.apiBase}/profile/mixtape`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queue: tape.map(t => t.src), shuffle }),
            }).catch(() => { throw new Error('Connection error — is the server running?'); });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Save failed.');
            savedJson = snapshot();
            SFX.positive();
            msg('Mixtape saved.', 'success');
        } catch (err) {
            SFX.negative();
            msg(err.message, 'error');
        } finally {
            btn.disabled = false;
            confirmingClose = false;
            if (isOpen) renderStatus();
        }
    }


    /* ════════ DRAG & DROP (mouse) ════════ */

    let dragFrom = null;

    function onDragStart(e) {
        const row = e.target.closest('[data-drag]');
        if (!row) return;
        dragFrom = Number(row.dataset.drag);
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
    }

    // Mark whether the drop lands above or below the hovered row
    function onDragOver(e) {
        const row = e.target.closest('[data-drag]');
        if (!row || dragFrom === null) return;
        e.preventDefault();
        const r = row.getBoundingClientRect();
        const below = e.clientY > r.top + r.height / 2;
        clearDragMarks(false);
        row.classList.add(below ? 'drop-below' : 'drop-above');
    }

    function onDrop(e) {
        const row = e.target.closest('[data-drag]');
        if (!row || dragFrom === null) return;
        e.preventDefault();
        let to = Number(row.dataset.drag) + (row.classList.contains('drop-below') ? 1 : 0);
        if (dragFrom < to) to--;
        const from = dragFrom;
        clearDragMarks();
        moveInTape(from, to);
    }

    function clearDragMarks(resetSource = true) {
        document.querySelectorAll('.mix-queue-row').forEach(r => {
            r.classList.remove('drop-above', 'drop-below');
            if (resetSource) r.classList.remove('dragging');
        });
        if (resetSource) dragFrom = null;
    }


    /* ════════ TRACK LENGTHS ════════ */

    // Read each file's length from its metadata once. Rows re-render in
    // one batch shortly after results come in, not once per track.
    function prefetchDurations(library) {
        if (durationsRequested) return;
        durationsRequested = true;
        for (const t of library) {
            const a = new Audio();
            a.preload = 'metadata';
            a.addEventListener('loadedmetadata', () => {
                if (isFinite(a.duration)) durations[t.src] = a.duration;
                a.removeAttribute('src');          // release the connection
                a.load();
                clearTimeout(durationRenderTimer);
                durationRenderTimer = setTimeout(() => { if (isOpen) resort(selTrack()?.src); }, 250);
            }, { once: true });
            a.src = t.src;
        }
    }

    return { open, close };
})();
