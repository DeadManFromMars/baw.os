/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   radio.js  —  MUSIC PLAYER + RADIO WIDGET

   STARTUP SEQUENCING (event-based, no direct module calls):
     Radio waits for two events before starting playback:
       'mixtape:ready'       — fired by playlist.js once the saved
                               queue is fetched from the profile
       'globe:pins-complete' — fired by globe.js once all pin lines
                               have finished drawing

     When both have arrived, Radio loads track 0 from the queue
     and begins playback. Order of events doesn't matter.

   RUNTIME EVENTS LISTENED FOR:
     'mixtape:queue-changed' — user edited their queue in the overlay

   EVENTS FIRED:
     'radio:track-changed'   — whenever the playing track changes
                               (Mixtape listens to sync the vinyl)

   PUBLIC API:
     Radio.next()           — skip forward
     Radio.prev()           — skip back
     Radio.togglePlay()     — play/pause
     Radio.setVolume(v)     — 0–1
     Radio.playBySrc(src)   — jump to track by src string
     Radio.getCurrentSrc()  — currently loaded src
     Radio.getLibrary()     — raw playlist array
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Radio = (() => {

    /* ── State ───────────────────────────────────────────────── */
    let audioEl      = null;
    let library      = [];      // raw playlist.json
    let activeQueue  = [];      // current playback queue
    let currentIndex = 0;
    let isPlaying    = false;

    // Startup gate — both must fire before playback begins
    let _pinsReady    = false;
    let _mixtapeReady = false;

    // BroadcastChannel — sends track info to signal viewer page
    let _channel = null;
    try { _channel = new BroadcastChannel('baw_radio'); } catch (_) {}

    function _broadcast(type) {
        if (!_channel || !activeQueue.length) return;
        const track = activeQueue[currentIndex];
        if (!track) return;
        _channel.postMessage({
            type,
            src:    track.src,
            title:  track.title,
            artist: track.artist,
        });
    }


    /* ════════════════════════════════════════════════════════
       STARTUP GATE
    ════════════════════════════════════════════════════════ */

    function _tryStart() {
        if (!_pinsReady || !_mixtapeReady) return;
        if (!audioEl || isPlaying) return;
        if (!activeQueue.length) activeQueue = [...library];
        if (!activeQueue.length) return;

        currentIndex   = 0;
        audioEl.src    = activeQueue[0].src;
        audioEl.volume = document.getElementById('radioVolume')?.value / 100 ?? 0.3;
        audioEl.load();
        audioEl.play().catch(() => {});
        isPlaying = true;
        _updateTrackDisplay();
        document.getElementById('radioWidget')?.classList.add('visible');
    }


    /* ════════════════════════════════════════════════════════
       UI UPDATES
    ════════════════════════════════════════════════════════ */

    function _updateTrackDisplay() {
        if (!activeQueue.length) return;
        const track = activeQueue[currentIndex] || activeQueue[0];

        const titleEl  = document.getElementById('radioTitle');
        const artistEl = document.getElementById('radioArtist');
        const playBtn  = document.getElementById('radioPlayBtn');

        if (titleEl) {
            titleEl.textContent = track.title;
            titleEl.classList.toggle('fits',
                titleEl.scrollWidth <= titleEl.parentElement.clientWidth);
        }
        if (artistEl) artistEl.textContent = track.artist;
        if (playBtn)  playBtn.innerHTML = isPlaying ? '&#9646;&#9646;' : '&#9654;';
    }

    function _updateProgressDisplay() {
        if (!audioEl || !audioEl.duration) return;
        const pct = (audioEl.currentTime / audioEl.duration) * 100;
        const fillEl     = document.getElementById('radioFill');
        const currentEl  = document.getElementById('radioCurrent');
        const durationEl = document.getElementById('radioDuration');
        if (fillEl)     fillEl.style.width     = pct + '%';
        if (currentEl)  currentEl.textContent  = Utils.formatTime(audioEl.currentTime);
        if (durationEl) durationEl.textContent = Utils.formatTime(audioEl.duration);
    }


    /* ════════════════════════════════════════════════════════
       PLAYBACK CONTROL
    ════════════════════════════════════════════════════════ */

    function _clamp(index) {
        const n = activeQueue.length;
        if (!n) return 0;
        return ((index % n) + n) % n;
    }

    function _loadTrack(index) {
        if (!activeQueue.length) return;
        currentIndex   = _clamp(index);
        audioEl.src    = activeQueue[currentIndex].src;
        audioEl.volume = document.getElementById('radioVolume')?.value / 100 ?? 0.3;
        audioEl.load();
        _updateTrackDisplay();
    }

    function _playCurrentTrack() {
        if (!activeQueue.length) return;
        audioEl.play().catch(() => {});
        isPlaying = true;
        _updateTrackDisplay();
        document.getElementById('radioWidget')?.classList.add('visible');
        document.dispatchEvent(new CustomEvent('radio:track-changed', {
            detail: { src: activeQueue[currentIndex]?.src }
        }));
        // Broadcast to signal viewer page
        _broadcast('track-changed');
    }


    /* ════════════════════════════════════════════════════════
       DRAG
    ════════════════════════════════════════════════════════ */

    function _initDrag() {
        const widget = document.getElementById('radioWidget');
        const handle = document.getElementById('radioDragHandle');
        if (!widget || !handle) return;

        let dragging = false, offsetX = 0, offsetY = 0;

        handle.addEventListener('mousedown', e => {
            dragging = true;
            const rect = widget.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            widget.style.bottom = 'auto';
            widget.style.right  = 'auto';
            widget.style.left   = rect.left + 'px';
            widget.style.top    = rect.top  + 'px';
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            widget.style.left = (e.clientX - offsetX) + 'px';
            widget.style.top  = (e.clientY - offsetY) + 'px';
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }


    /* ════════════════════════════════════════════════════════
       INIT
    ════════════════════════════════════════════════════════ */

    document.addEventListener('DOMContentLoaded', () => {

        // Mixtape button
        const playlistHint = document.querySelector('.radio-playlist-hint');
        if (playlistHint) {
            playlistHint.addEventListener('click', () => {
                if (typeof Mixtape !== 'undefined') Mixtape.open();
            });
        }

        _initDrag();

        audioEl = document.getElementById('bgMusic');
        if (!audioEl) return;

        // Load raw library (used as fallback if no mixtape queue)
        fetch(`${CONFIG.apiBase}/playlist.json`)
            .then(r => r.json())
            .then(data => { library = data; })
            .catch(() => console.warn('[Radio] playlist.json not found'));

        // Progress bar scrub
        const progressBar = document.querySelector('.radio-progress-bar');
        if (progressBar) {
            progressBar.addEventListener('click', e => {
                if (!audioEl.duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                audioEl.currentTime = ((e.clientX - rect.left) / rect.width) * audioEl.duration;
            });
        }

        // Auto-advance on track end
        audioEl.addEventListener('ended', () => {
            const shuffle = typeof Mixtape !== 'undefined' && Mixtape.isShuffled();
            if (shuffle && activeQueue.length > 1) {
                let next;
                do { next = Math.floor(Math.random() * activeQueue.length); }
                while (next === currentIndex);
                _loadTrack(next);
            } else {
                _loadTrack(currentIndex + 1);
            }
            _playCurrentTrack();
        });

        setInterval(_updateProgressDisplay, 500);

        // ── Startup gate events ──

        document.addEventListener('mixtape:ready', e => {
            activeQueue   = e.detail.queue;
            _mixtapeReady = true;
            _tryStart();
        });

        document.addEventListener('globe:pins-complete', () => {
            _pinsReady = true;
            _tryStart();
        });

        // ── Runtime queue changes ──

        document.addEventListener('mixtape:queue-changed', e => {
            const newQueue   = e.detail.queue;
            const currentSrc = activeQueue[currentIndex]?.src;
            activeQueue      = newQueue.length ? newQueue : [...library];
            const newIdx     = currentSrc
                ? activeQueue.findIndex(t => t.src === currentSrc)
                : -1;
            currentIndex = newIdx >= 0 ? newIdx : 0;
            _updateTrackDisplay();
        });
    });


    /* ════════════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════════════ */

    return {
        next()  { _loadTrack(currentIndex + 1); _playCurrentTrack(); },
        prev()  { _loadTrack(currentIndex - 1); _playCurrentTrack(); },

        togglePlay() {
            if (!audioEl) return;
            if (audioEl.paused) {
                audioEl.play(); isPlaying = true;
                _broadcast('playing');
            } else {
                audioEl.pause(); isPlaying = false;
                _broadcast('paused');
            }
            _updateTrackDisplay();
        },

        setVolume(val) {
            if (audioEl) audioEl.volume = Math.max(0, Math.min(1, val));
        },

        playBySrc(src) {
            const idx = activeQueue.findIndex(t => t.src === src);
            if (idx < 0) return;
            _loadTrack(idx);
            _playCurrentTrack();
        },

        getCurrentSrc() {
            if (!audioEl || !audioEl.src) return null;
            return decodeURIComponent(audioEl.src.replace(location.origin + '/', ''));
        },

        getLibrary() { return [...library]; },
        isShuffled() { return typeof Mixtape !== 'undefined' && Mixtape.isShuffled(); },
    };

})();

/* ── Global shims for HTML onclick handlers ─────────────────── */
function pauseMusic() { Radio.togglePlay(); }
function nextTrack()  { Radio.next(); }
function prevTrack()  { Radio.prev(); }
function setVolume(v) { Radio.setVolume(v); }
