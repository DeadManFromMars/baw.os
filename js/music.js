/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   music.js  —  PLAYBACK + RADIO WIDGET + MIXTAPE MANAGER
   (replaces radio.js + playlist.js, which shared all their state)

   Radio    plays the player's mixtape through <audio id="bgMusic">
            and drives the radio widget (markup in index.html).
            Starts once BOTH have happened:
              'player:authenticated'  their saved mixtape is loaded
              'globe:pins-complete'   the intro finished
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
    }

    function renderPlayState() {
        const btn = $('radioPlayBtn');
        btn.innerHTML = audio.paused ? '&#9654;' : '&#9646;&#9646;';
        btn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
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
        document.addEventListener('player:authenticated', loadSavedTape, { once: true });
        document.addEventListener('globe:pins-complete', () => { ready.intro = true; tryStart(); });
    }

    return api;
})();


/* ════════════════════════════════════════════════════════
   MIXTAPE — manager overlay
   LEFT  library wheel (grouped by sort key, DDR-style like the inventory)
   MID   selected track: sleeve art, vinyl, ‹ › browse, preview, add/remove
   RIGHT the mixtape itself: play, reorder, remove, shuffle, save
════════════════════════════════════════════════════════ */

const Mixtape = (() => {

    // Wheel feel
    const C = {
        TRACK_H:   64,     // px — sync with --mix-track-h in music.css
        DIV_H:     40,     // px — group divider rows (A, B, C… / 3–5 MIN)
        VISIBLE:   7,      // rows visible either side of centre
        SPRING:    0.13,   // wheel catch-up per frame (at 60fps)
        PULL_SPR:  0.11,   // selected row slide-out speed
        PULL_PX:   24,     // selected row slide-out distance
        SC_MIN:    0.65,   // scale at the edge of the visible band
        OP_MIN:    0.10,   // opacity at the edge
        FALLOFF:   1.7,    // falloff curve power
        SCROLL_PX: 40,     // scroll distance per wheel step
    };

    const $ = id => document.getElementById(id);

    let isOpen = false, abort = null, returnFocus = null, confirmingClose = false;

    // Working copy of the mixtape + JSON of the last saved version
    let tape = [], shuffle = false, savedJson = '';

    // Library wheel
    let sortMode = 'artist';
    let items = [], heights = [], cum = [], total = 0;   // rows, their heights, running totals
    let sel = 0, offset = 0, target = 0, pull = [], raf = null, wrapH = 0;
    let scrollAccum = 0;

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

        const library = await Radio.loadLibrary();
        tape      = [...Radio.getTape()];
        shuffle   = Radio.getShuffle();
        savedJson = snapshot();

        buildShell();
        $('mixLibCount').textContent = `${library.length} track${library.length === 1 ? '' : 's'}`;
        resort();
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
                <button type="button" class="mix-close-btn" data-act="close" aria-label="Close mixtape manager">✕</button>
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
                    <div class="mix-sleeve-wrap" aria-hidden="true">
                        <div class="mix-sleeve"><div class="mix-sleeve-art" id="mixSleeveArt"></div></div>
                        <div class="mix-vinyl" id="mixVinyl"></div>
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

        // Library wheel: scroll steps it; the height is cached for the per-frame draw
        const wrap = $('mixWheelWrap');
        on(wrap, 'wheel', e => {
            e.preventDefault();
            scrollAccum += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
            if (Math.abs(scrollAccum) >= C.SCROLL_PX) {
                step(scrollAccum > 0 ? 1 : -1);
                scrollAccum = 0;
            }
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
        sel    = keep >= 0 ? keep : Math.max(0, items.findIndex(it => it.track));
        offset = target = sel;
        pull   = items.map(() => 0);

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

    // Place every row relative to the selected one. Rows have different
    // heights (tracks vs dividers), so positions use running totals (cum).
    function draw() {
        const rows = $('mixWheel')?.children;
        if (!rows || !total || !wrapH) return;

        const cy     = wrapH / 2;
        const selH   = heights[sel] || C.TRACK_H;
        const selMid = cum[sel] + selH / 2;
        const fracPx = (offset - Math.round(offset)) * selH;   // in-between-steps offset while animating

        for (let i = 0; i < items.length; i++) {
            const row = rows[i];
            if (!row) continue;
            const h = heights[i];
            let dist = cum[i] + h / 2 - selMid - fracPx;
            if (dist >  total / 2) dist -= total;             // wrap around: the wheel is endless
            if (dist < -total / 2) dist += total;
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
        const diff = target - offset;
        offset = Math.abs(diff) < 0.001 ? target : offset + diff * Utils.springStep(C.SPRING, dt);

        const pullK = Utils.springStep(C.PULL_SPR, dt);
        let pulling = false;
        for (let i = 0; i < pull.length; i++) {
            const goal = i === sel ? 1 : 0;
            const d    = goal - pull[i];
            if (Math.abs(d) > 0.001) { pull[i] += d * pullK; pulling = true; }
            else pull[i] = goal;
        }
        draw();
        raf = (Math.abs(target - offset) < 0.001 && !pulling) ? null : requestAnimationFrame(loop);
    }
    const startLoop = () => { if (raf === null) { lastTime = null; raf = requestAnimationFrame(loop); } };

    // Move the selection ±1 track (skipping dividers), shortest way round
    function step(dir) {
        const n = items.length;
        if (!n) return;
        let next = sel;
        for (let k = 0; k < n; k++) {
            next = (((next + dir) % n) + n) % n;
            if (items[next].track) break;
        }
        stepTo(next);
    }

    function stepTo(i) {
        if (!items[i]?.track) return;
        const n = items.length;
        const base = Math.round(target);
        let d = i - (((base % n) + n) % n);
        if (d >  n / 2) d -= n;
        if (d < -n / 2) d += n;
        target = base + d;
        sel    = i;
        markActive();
        updateRecord();
        startLoop();
        SFX.hover();
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

        const art = $('mixSleeveArt');
        art.style.backgroundImage = t.art ? `url('${t.art}')` : '';
        art.classList.toggle('loaded', !!t.art);

        const taped = onTape(t.src);
        const toggle = $('mixToggleBtn');
        toggle.textContent = taped ? '✓ On mixtape · Remove' : '+ Add to mixtape';
        toggle.classList.toggle('is-on', taped);
        renderNowPlaying();
    }

    // Now-playing highlights, vinyl spin and the preview button
    function renderNowPlaying() {
        const now = Radio.nowSrc();
        document.querySelectorAll('#mixtapeOverlay [data-src]').forEach(el =>
            el.classList.toggle('now-playing', el.dataset.src === now));

        // The preview button only shows "Pause" while the SELECTED track plays
        const selPlaying = Radio.isPlaying() && selTrack()?.src === now;
        $('mixVinyl')?.classList.toggle('spinning', selPlaying);
        if ($('mixPreviewBtn')) {
            $('mixPreviewIcon').innerHTML    = selPlaying ? '&#9646;&#9646;' : '&#9654;';
            $('mixPreviewLabel').textContent = selPlaying ? 'Pause' : 'Play';
        }
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
