/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   playlist.js  —  MIXTAPE MANAGER + QUEUE BOOTSTRAP

   Layout:
     LEFT  — spinning wheel library browser
     RIGHT — vinyl record (top center), mixtape queue (below)

   EVENTS FIRED:
     'mixtape:ready'        — queue loaded from profile on page load
     'mixtape:queue-changed' — user edited the queue

   EVENTS LISTENED FOR:
     'radio:track-changed'  — syncs vinyl spin state
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Mixtape = (() => {

    /* ── Config ──────────────────────────────────────────────── */
    const C = {
        TRACK_H:    64,
        DIV_H:      40,
        VISIBLE:    7,
        SPRING:     0.13,
        PULL_SPR:   0.11,
        PULL_PX:    24,
        SC_MIN:     0.65,
        OP_MIN:     0.10,
        FALLOFF:    1.7,
        SCROLL_MS:  110,
        DEBNC_MS:   70,
    };

    /* ── State ───────────────────────────────────────────────── */
    let _isOpen    = false;
    let _library   = [];
    let _sorted    = [];
    let _items     = [];   // flat list: {type:'div'|'track', label?, track?}
    let _heights   = [];
    let _cum       = [];
    let _total     = 0;
    let _queue     = [];
    let _shuffle   = false;
    let _durations = {};
    let _sortMode  = 'artist';
    let _selIdx    = 0;
    let _offset    = 0;
    let _target    = 0;
    let _pull      = [];
    let _rafId     = null;
    let _scrollCd  = false;
    let _scrollTmr = null;
    let _debTmr    = null;
    let _dragSrc   = null;

    /* ════════════════════════════════════════════════════════
       BOOTSTRAP
    ════════════════════════════════════════════════════════ */

    async function _bootstrap() {
        try {
            const r = await fetch(`${CONFIG.apiBase}/playlist.json`);
            _library = r.ok ? await r.json() : [];
        } catch (_) { _library = []; }

        let queue = [..._library], shuffle = false;
        try {
            const res = await fetch(`${CONFIG.apiBase}/profile/mixtape`, { credentials: 'include' });
            if (res.ok) {
                const s = await res.json();
                if (s.queue && s.queue.length) {
                    queue = s.queue.map(src => _library.find(t => t.src === src)).filter(Boolean);
                }
                shuffle = !!s.shuffle;
            }
        } catch (_) {}

        _queue = queue;
        _shuffle = shuffle;

        document.dispatchEvent(new CustomEvent('mixtape:ready', {
            detail: { queue: _queue, shuffle: _shuffle }
        }));
    }

    /* ════════════════════════════════════════════════════════
       OPEN / CLOSE
    ════════════════════════════════════════════════════════ */

    function open() {
        if (_isOpen) return;
        _isOpen = true;
        if (typeof SFX !== 'undefined') SFX.positive();
        _buildShell();
        _applySort();
        _pull = _items.map(() => 0);
        _selIdx = _items.findIndex(i => i.type === 'track');
        if (_selIdx < 0) _selIdx = 0;
        _offset = _selIdx;
        _target = _selIdx;
        _renderWheel();
        _applyActive();
        _updateRecord(_selIdx);
        _renderQueue();
        _renderShuffle();
        _startLoop();
        _prefetchDurations();
        setTimeout(_syncPlayBtn, 100);
    }

    function close() {
        if (!_isOpen) return;
        _isOpen = false;
        if (typeof SFX !== 'undefined') SFX.negative();
        _stopLoop();
        const ov = document.getElementById('mixtapeOverlay');
        if (ov) {
            ov.classList.remove('visible');
            ov.addEventListener('transitionend', () => ov.remove(), { once: true });
        }
    }

    /* ════════════════════════════════════════════════════════
       SHELL
    ════════════════════════════════════════════════════════ */

    function _buildShell() {
        document.getElementById('mixtapeOverlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'mixtapeOverlay';
        ov.innerHTML = `
            <div class="mix-header">
                <div class="mix-header-left">
                    <span class="mix-header-title">MIXTAPE</span>
                    <span class="mix-header-sub" id="mixLibCount">— TRACKS</span>
                </div>
                <button class="mix-close-btn" id="mixCloseBtn">✕</button>
            </div>
            <div class="mix-body">

                <!-- COL 1: Library wheel -->
                <div class="mix-col mix-col-library">
                    <div class="mix-col-head">
                        <span class="mix-col-label">LIBRARY</span>
                        <div class="mix-sort-group">
                            <span class="mix-sort-label">SORT</span>
                            <button class="mix-sort-btn ${_sortMode==='artist'?'active':''}" data-sort="artist">ARTIST</button>
                            <button class="mix-sort-btn ${_sortMode==='title'?'active':''}" data-sort="title">TITLE</button>
                            <button class="mix-sort-btn ${_sortMode==='duration'?'active':''}" data-sort="duration">LENGTH</button>
                        </div>
                    </div>
                    <div class="mix-wheel-wrap" id="mixWheelWrap">
                        <div class="mix-wheel-selector"></div>
                        <div class="mix-wheel" id="mixWheel"></div>
                    </div>
                </div>

                <div class="mix-divider"></div>

                <!-- COL 2: Record + controls -->
                <div class="mix-col mix-col-record">
                    <div class="mix-record-section">
                        <div class="mix-record-info">
                            <div class="mix-record-title" id="mixRecordTitle">—</div>
                            <div class="mix-record-artist" id="mixRecordArtist">—</div>
                        </div>
                        <div class="mix-sleeve-wrap">
                            <div class="mix-sleeve">
                                <div class="mix-sleeve-art" id="mixSleeveArt"></div>
                            </div>
                            <div class="mix-vinyl" id="mixVinyl"></div>
                        </div>
                        <div class="mix-controls">
                            <button class="mix-ctrl-btn" onclick="Radio.prev()">&#9664;&#9664;</button>
                            <button class="mix-ctrl-btn mix-ctrl-play" id="mixPlayBtn" onclick="Radio.togglePlay()">&#9654;</button>
                            <button class="mix-ctrl-btn" onclick="Radio.next()">&#9654;&#9654;</button>
                        </div>
                    </div>
                </div>

                <div class="mix-divider"></div>

                <!-- COL 3: Queue -->
                <div class="mix-col mix-col-queue">
                    <div class="mix-col-head">
                        <span class="mix-col-label">MIXTAPE</span>
                        <span class="mix-col-count" id="mixQueueCount">0 songs</span>
                        <button class="mix-shuffle-btn" id="mixShuffleBtn">⇄ SHUFFLE</button>
                        <button class="mix-clear-btn" id="mixClearBtn">CLEAR</button>
                    </div>
                    <div class="mix-queue-list" id="mixQueueList"></div>
                    <div class="mix-footer">
                        <div class="mix-msg" id="mixMsg"></div>
                        <button class="mix-save-btn" id="mixSaveBtn">SAVE MIXTAPE →</button>
                    </div>
                </div>

            </div>
`;

        document.body.appendChild(ov);

        ov.querySelector('#mixCloseBtn').addEventListener('click', close);
        ov.querySelector('#mixSaveBtn').addEventListener('click', _save);
        ov.querySelector('#mixClearBtn').addEventListener('click', _clearQueue);
        ov.querySelector('#mixShuffleBtn').addEventListener('click', _toggleShuffle);
        ov.setAttribute('tabindex', '-1');
        ov.addEventListener('keydown', e => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowDown') { e.preventDefault(); _step(1); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); _step(-1); }
            if (e.key === 'Enter') {
                const item = _items[_selIdx];
                if (item && item.type === 'track') {
                    _queue.some(q => q.src === item.track.src)
                        ? _removeFromQueue(item.track.src)
                        : _addToQueue(item.track);
                }
            }
        });

        ov.querySelectorAll('.mix-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _sortMode = btn.dataset.sort;
                ov.querySelectorAll('.mix-sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                _applySort();
                _pull = _items.map(() => 0);
                _selIdx = _items.findIndex(i => i.type === 'track');
                if (_selIdx < 0) _selIdx = 0;
                _offset = _selIdx;
                _target = _selIdx;
                _renderWheel();
                _applyActive();
                _updateRecord(_selIdx);
                _startLoop();
            });
        });

        let _scrollAccum = 0;
        ov.querySelector('#mixWheelWrap').addEventListener('wheel', e => {
            e.preventDefault();
            _scrollAccum += e.deltaY;
            const THRESH = 40;
            if (Math.abs(_scrollAccum) >= THRESH) {
                const dir = _scrollAccum > 0 ? 1 : -1;
                _scrollAccum = 0;
                _step(dir);
            }
        }, { passive: false });

        requestAnimationFrame(() => { ov.classList.add('visible'); ov.focus(); });
    }

    /* ════════════════════════════════════════════════════════
       SORT + ITEMS
    ════════════════════════════════════════════════════════ */

    function _applySort() {
        _sorted = [..._library];
        if (_sortMode === 'title')    _sorted.sort((a,b) => (a.title||'').localeCompare(b.title||''));
        if (_sortMode === 'artist')   _sorted.sort((a,b) => (a.artist||'').localeCompare(b.artist||''));
        if (_sortMode === 'duration') _sorted.sort((a,b) => _durSecs(a.src) - _durSecs(b.src));
        _buildItems();
    }

    function _groupKey(track) {
        if (_sortMode === 'artist')   return (track.artist||'?')[0].toUpperCase();
        if (_sortMode === 'title')    return (track.title||'?')[0].toUpperCase();
        if (_sortMode === 'duration') {
            const s = _durSecs(track.src);
            return s < 180 ? '< 3 MIN' : s < 300 ? '3–5 MIN' : '5+ MIN';
        }
        return null;
    }

    function _buildItems() {
        _items = [];
        let lastKey = null;
        _sorted.forEach(track => {
            const key = _groupKey(track);
            if (key && key !== lastKey) { _items.push({ type:'div', label:key }); lastKey = key; }
            _items.push({ type:'track', track });
        });
        _heights = _items.map(i => i.type === 'div' ? C.DIV_H : C.TRACK_H);
        _cum = [0];
        for (let i = 0; i < _items.length; i++) _cum.push(_cum[i] + _heights[i]);
        _total = _cum[_items.length];
    }

    /* ════════════════════════════════════════════════════════
       WHEEL RENDER
    ════════════════════════════════════════════════════════ */

    function _renderWheel() {
        const wheel = document.getElementById('mixWheel');
        const count = document.getElementById('mixLibCount');
        if (!wheel) return;
        if (count) count.textContent = `${_sorted.length} TRACK${_sorted.length !== 1 ? 'S' : ''}`;
        wheel.innerHTML = '';
        if (!_sorted.length) { wheel.innerHTML = '<div class="mix-empty">NO TRACKS</div>'; return; }

        const nowSrc = Radio.getCurrentSrc();
        let trackNum = 0;

        _items.forEach((item, i) => {
            const el = document.createElement('div');
            el.style.cssText = `position:absolute;left:0;right:0;height:${_heights[i]}px;transform-origin:left center;will-change:transform,opacity,top`;
            el.dataset.wIdx = i;

            if (item.type === 'div') {
                el.className = 'mix-divider-row';
                el.innerHTML = `<div class="mix-div-tab">${_esc(item.label)}</div><div class="mix-div-line"></div>`;
                el.style.pointerEvents = 'none';
            } else {
                const t = item.track;
                const onTape = _queue.some(q => q.src === t.src);
                const playing = t.src === nowSrc;
                const dur = _durations[t.src] || '';
                trackNum++;
                el.className = ['mix-track-row', onTape?'on-tape':'', playing?'now-playing':''].filter(Boolean).join(' ');
                el.innerHTML = `
                    <span class="mix-track-index">${String(trackNum).padStart(2,'0')}</span>
                    <div class="mix-track-info">
                        <span class="mix-track-title">${_esc(t.title)}</span>
                        <span class="mix-track-artist">${_esc(t.artist)}${dur ? ' · '+dur : ''}</span>
                    </div>
`;
                el.addEventListener('click', () => {
                    if (i === _selIdx) {
                        // Already selected — toggle queue membership
                        onTape ? _removeFromQueue(t.src) : _addToQueue(t);
                    } else {
                        _stepTo(i);
                    }
                });
                // SFX fires via _applyActive when wheel settles, not on hover
            }
            wheel.appendChild(el);
        });
        _pull = _items.map(() => 0);
    }

    /* ════════════════════════════════════════════════════════
       WHEEL DRAW LOOP
    ════════════════════════════════════════════════════════ */

    function _draw() {
        const wheel = document.getElementById('mixWheel');
        const wrap  = document.getElementById('mixWheelWrap');
        if (!wheel || !wrap || !_total) return;
        const rows  = wheel.children;
        const n     = _items.length;
        const cy    = wrap.getBoundingClientRect().height / 2;
        const selH  = _heights[_selIdx] || C.TRACK_H;
        const selMid = _cum[_selIdx] + selH / 2;
        const frac  = _offset - Math.round(_offset);
        const fracPx = frac * selH;

        for (let i = 0; i < n; i++) {
            const row = rows[i];
            if (!row) continue;
            const h = _heights[i];
            let dist = (_cum[i] + h/2) - selMid - fracPx;
            if (dist >  _total/2) dist -= _total;
            if (dist < -_total/2) dist += _total;
            row.style.top = (cy - h/2 + dist).toFixed(1) + 'px';

            const isDiv    = _items[i].type === 'div';
            const isActive = i === _selIdx;
            const nd = Math.abs(dist) / (C.TRACK_H * C.VISIBLE);
            const t  = Math.min(nd, 1);
            const f  = Math.pow(t, C.FALLOFF);

            if (isDiv) {
                const sc = Math.max(0.6, 1 - f * 0.3);
                const op = Math.max(0, 0.75 - f * 0.7);
                row.style.transform = `scale(${sc.toFixed(3)})`;
                row.style.opacity   = op.toFixed(3);
            } else {
                const sc = 1 - f * (1 - C.SC_MIN);
                const op = 1 - f * (1 - C.OP_MIN);
                const tx = (_pull[i]||0) * C.PULL_PX;
                row.style.transform = `translateX(${tx.toFixed(1)}px) scale(${(isActive?1:sc).toFixed(4)})`;
                row.style.opacity   = (isActive ? 1 : op).toFixed(4);
                row.style.pointerEvents = nd > C.VISIBLE - 0.5 ? 'none' : 'auto';
                row.classList.toggle('mix-track-row-active', isActive);
            }
        }
    }

    function _tickPull() {
        let dirty = false;
        for (let i = 0; i < _pull.length; i++) {
            const tgt = i === _selIdx ? 1 : 0;
            const d   = tgt - _pull[i];
            if (Math.abs(d) > 0.001) { _pull[i] += d * C.PULL_SPR; dirty = true; }
            else _pull[i] = tgt;
        }
        return dirty;
    }

    function _loop() {
        const diff = _target - _offset;
        if (Math.abs(diff) < 0.001) _offset = _target;
        else _offset += diff * C.SPRING;
        const dirty = _tickPull();
        _draw();
        if (Math.abs(_target - _offset) < 0.001 && !dirty) { _rafId = null; return; }
        _rafId = requestAnimationFrame(_loop);
    }

    function _startLoop() { if (!_rafId) _rafId = requestAnimationFrame(_loop); }
    function _stopLoop()  { if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; } }

    /* ════════════════════════════════════════════════════════
       NAVIGATION
    ════════════════════════════════════════════════════════ */

    function _nextTrack(from, dir) {
        const n = _items.length;
        let i = from;
        for (let t = 0; t < n; t++) {
            i = ((i + dir) % n + n) % n;
            if (_items[i] && _items[i].type === 'track') return i;
        }
        return from;
    }

    function _step(dir) {
        const n    = _items.length;
        const next = _nextTrack(_selIdx, dir);
        const base = Math.round(_target);
        const cur  = (((base % n) + n) % n);
        let d = next - cur;
        if (d >  n/2) d -= n;
        if (d < -n/2) d += n;
        _target += d;
        _selIdx  = next;
        _startLoop();
        clearTimeout(_debTmr);
        _debTmr = setTimeout(() => { _applyActive(); _updateRecord(_selIdx); }, C.DEBNC_MS);
    }

    function _stepTo(wIdx) {
        if (!_items[wIdx] || _items[wIdx].type === 'div') return;
        const n    = _items.length;
        const base = Math.round(_target);
        const cur  = (((base % n) + n) % n);
        let d = wIdx - cur;
        if (d >  n/2) d -= n;
        if (d < -n/2) d += n;
        _target = base + d;
        _selIdx = wIdx;
        _startLoop();
        _applyActive();
        _updateRecord(wIdx);
        if (typeof SFX !== 'undefined') SFX.hover();
    }

    function _applyActive() {
        const wheel = document.getElementById('mixWheel');
        if (!wheel) return;
        Array.from(wheel.children).forEach((row, i) => {
            if (_items[i] && _items[i].type === 'track') {
                row.classList.toggle('mix-track-row-active', i === _selIdx);
            }
        });
        if (typeof SFX !== 'undefined') SFX.hover();
    }

    /* ════════════════════════════════════════════════════════
       RECORD / VINYL
    ════════════════════════════════════════════════════════ */

    function _updateRecord(wIdx) {
        const item = _items[wIdx];
        if (!item || item.type === 'div') return;
        const t = item.track;
        const art    = document.getElementById('mixSleeveArt');
        const title  = document.getElementById('mixRecordTitle');
        const artist = document.getElementById('mixRecordArtist');
        const vinyl  = document.getElementById('mixVinyl');
        if (title)  title.textContent  = t.title  || '—';
        if (artist) artist.textContent = t.artist || '—';
        if (art) {
            if (t.art) {
                art.style.backgroundImage = `url('${t.art}')`;
                requestAnimationFrame(() => art.classList.add('loaded'));
            } else {
                art.style.backgroundImage = '';
                art.classList.remove('loaded');
            }
        }
        if (vinyl) vinyl.classList.toggle('spinning', t.src === Radio.getCurrentSrc());
    }

    function _syncPlayBtn() {
        const btn = document.getElementById('mixPlayBtn');
        const audioEl = document.getElementById('bgMusic');
        if (!btn || !audioEl) return;
        btn.innerHTML = audioEl.paused ? '&#9654;' : '&#9646;&#9646;';
    }

    function _syncVinyl() {
        const vinyl = document.getElementById('mixVinyl');
        const item  = _items[_selIdx];
        if (vinyl && item && item.type === 'track') {
            vinyl.classList.toggle('spinning', item.track.src === Radio.getCurrentSrc());
        }
    }

    /* ════════════════════════════════════════════════════════
       QUEUE RENDER
    ════════════════════════════════════════════════════════ */

    function _renderQueue() {
        const list  = document.getElementById('mixQueueList');
        const count = document.getElementById('mixQueueCount');
        if (!list) return;
        if (count) count.textContent = `${_queue.length} song${_queue.length !== 1 ? 's' : ''}`;
        if (!_queue.length) {
            list.innerHTML = '<div class="mix-queue-empty">No songs yet — select a track and press + TAPE</div>';
            return;
        }
        const nowSrc = Radio.getCurrentSrc();
        list.innerHTML = '';
        _queue.forEach((t, i) => {
            const row = document.createElement('div');
            row.className = ['mix-queue-row', t.src === nowSrc ? 'now-playing' : ''].filter(Boolean).join(' ');
            row.draggable = true;
            row.dataset.index = i;
            row.innerHTML = `
                <span class="mix-queue-drag">⠿</span>
                <span class="mix-queue-pos">${String(i+1).padStart(2,'0')}</span>
                <div class="mix-queue-info">
                    <div class="mix-queue-title">${_esc(t.title)}</div>
                    <div class="mix-queue-artist">${_esc(t.artist)}</div>
                </div>
                <button class="mix-queue-remove">✕</button>`;
            row.querySelector('.mix-queue-remove').addEventListener('click', e => { e.stopPropagation(); _removeFromQueue(t.src); });
            row.addEventListener('click', () => Radio.playBySrc(t.src));
            row.addEventListener('contextmenu', e => { e.preventDefault(); _removeFromQueue(t.src); });
            row.addEventListener('dragstart', _onDragStart);
            row.addEventListener('dragover',  _onDragOver);
            row.addEventListener('dragleave', _onDragLeave);
            row.addEventListener('drop',      _onDrop);
            row.addEventListener('dragend',   _onDragEnd);
            list.appendChild(row);
        });
    }

    function _renderShuffle() {
        const btn = document.getElementById('mixShuffleBtn');
        if (!btn) return;
        btn.classList.toggle('active', _shuffle);
        btn.textContent = _shuffle ? '⇄ SHUFFLE ON' : '⇄ SHUFFLE';
    }

    /* ════════════════════════════════════════════════════════
       QUEUE MUTATIONS
    ════════════════════════════════════════════════════════ */

    function _addToQueue(t) {
        if (_queue.some(q => q.src === t.src)) return;
        _queue.push(t);
        _renderWheel(); _applyActive(); _renderQueue(); _startLoop(); _notify();
    }

    function _removeFromQueue(src) {
        _queue = _queue.filter(q => q.src !== src);
        _renderWheel(); _applyActive(); _renderQueue(); _startLoop(); _notify();
    }

    function _clearQueue() {
        _queue = [];
        _renderWheel(); _applyActive(); _renderQueue(); _startLoop(); _notify();
    }

    function _toggleShuffle() {
        _shuffle = !_shuffle;
        _renderShuffle();
        _notify();
    }

    function _notify() {
        document.dispatchEvent(new CustomEvent('mixtape:queue-changed', {
            detail: { queue: _queue, shuffle: _shuffle }
        }));
    }

    /* ════════════════════════════════════════════════════════
       DRAG & DROP
    ════════════════════════════════════════════════════════ */

    function _onDragStart(e) {
        _dragSrc = parseInt(e.currentTarget.dataset.index, 10);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.4';
    }
    function _onDragOver(e) {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        const r = e.currentTarget, rect = r.getBoundingClientRect();
        r.classList.remove('drag-over-top','drag-over-bottom');
        r.classList.add(e.clientY < rect.top + rect.height/2 ? 'drag-over-top' : 'drag-over-bottom');
    }
    function _onDragLeave(e) { e.currentTarget.classList.remove('drag-over-top','drag-over-bottom'); }
    function _onDrop(e) {
        e.preventDefault();
        const tgt = e.currentTarget, dest = parseInt(tgt.dataset.index, 10);
        tgt.classList.remove('drag-over-top','drag-over-bottom');
        if (_dragSrc === null || _dragSrc === dest) return;
        const rect = tgt.getBoundingClientRect();
        let ins = e.clientY < rect.top + rect.height/2 ? dest : dest + 1;
        if (_dragSrc < ins) ins--;
        _queue.splice(ins, 0, _queue.splice(_dragSrc, 1)[0]);
        _renderQueue(); _notify(); _dragSrc = null;
    }
    function _onDragEnd(e) {
        e.currentTarget.style.opacity = '1';
        document.querySelectorAll('.mix-queue-row').forEach(r => r.classList.remove('drag-over-top','drag-over-bottom'));
        _dragSrc = null;
    }

    /* ════════════════════════════════════════════════════════
       SAVE
    ════════════════════════════════════════════════════════ */

    async function _save() {
        const btn = document.getElementById('mixSaveBtn');
        if (btn) { btn.disabled = true; btn.textContent = '…'; }
        try {
            const res = await fetch(`${CONFIG.apiBase}/profile/mixtape`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queue: _queue.map(t => t.src), shuffle: _shuffle }),
            });
            const d = await res.json();
            if (res.ok) { if (typeof SFX !== 'undefined') SFX.positive(); _showMsg('Mixtape saved ✓', 'success'); }
            else        { if (typeof SFX !== 'undefined') SFX.negative(); _showMsg(d.error || 'Save failed.', 'error'); }
        } catch (_) { _showMsg('Connection error.', 'error'); }
        finally { if (btn) { btn.disabled = false; btn.textContent = 'SAVE MIXTAPE →'; } }
    }

    /* ════════════════════════════════════════════════════════
       DURATION PREFETCH
    ════════════════════════════════════════════════════════ */

    function _prefetchDurations() {
        _library.forEach(t => {
            if (_durations[t.src]) return;
            const a = new Audio();
            a.preload = 'metadata';
            a.src = t.src;
            a.addEventListener('loadedmetadata', () => {
                _durations[t.src] = _fmt(a.duration);
                _renderWheel(); _applyActive(); _startLoop();
            }, { once: true });
        });
    }

    /* ════════════════════════════════════════════════════════
       HELPERS
    ════════════════════════════════════════════════════════ */

    function _showMsg(txt, type) {
        const el = document.getElementById('mixMsg');
        if (!el) return;
        el.textContent = txt;
        el.className = 'mix-msg' + (type ? ' ' + type : '');
    }

    function _fmt(s) {
        if (!isFinite(s) || s <= 0) return '–:––';
        return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
    }

    function _durSecs(src) {
        const str = _durations[src];
        if (!str || str === '–:––') return 9999;
        const [m,s] = str.split(':').map(Number);
        return (m||0)*60 + (s||0);
    }

    function _esc(s) {
        return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* ════════════════════════════════════════════════════════
       INIT
    ════════════════════════════════════════════════════════ */

    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('radio:track-changed', () => {
            if (_isOpen) { _syncVinyl(); _renderQueue(); _syncPlayBtn(); }
        });
    });

    document.addEventListener('player:authenticated', () => { _bootstrap(); }, { once: true });

    /* ════════════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════════════ */

    return {
        open,
        close,
        getQueue()   { return [..._queue]; },
        getLibrary() { return [..._library]; },
        isShuffled() { return _shuffle; },
    };

})();
