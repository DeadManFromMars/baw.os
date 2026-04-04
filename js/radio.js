/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   radio.js  —  MUSIC PLAYER + RADIO WIDGET

   Handles:
     - Loading playlist.json from the server
     - Playing, pausing, skipping tracks
     - Updating the radio widget UI (title, artist, progress, times)
     - Dragging the radio widget around the screen
     - Scrubbing playback by clicking the progress bar

   The music element (#bgMusic) and widget (#radioWidget) are
   defined in HTML. This module wires them up after DOMContentLoaded.

   PUBLIC API (called by session.js / globe.js):
     Radio.start()     — loads first track and begins playback
     Radio.next()      — skip forward
     Radio.prev()      — skip back
     Radio.togglePlay()— play/pause toggle
     Radio.setVolume(v)— set volume 0.0–1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Radio = (() => {

    /* ── State ───────────────────────────────────────────────── */
    let audioEl      = null;   // <audio> element
    let playlist     = [];     // array of { title, artist, src } objects
    let currentIndex = 0;
    let isPlaying    = false;


    /* ════════════════════════════════════════════════════════
       UI UPDATES
    ════════════════════════════════════════════════════════ */

    /* Refresh the track title + artist display and play button icon. */
    function updateTrackDisplay() {
        if (!playlist.length) return;
        const track = playlist[currentIndex];

        const titleEl  = document.getElementById('radioTitle');
        const artistEl = document.getElementById('radioArtist');
        const playBtn  = document.getElementById('radioPlayBtn');

        if (titleEl)  titleEl.textContent  = track.title;
        if (artistEl) artistEl.textContent = track.artist;

        // Pause the marquee scroll animation if the text fits without scrolling.
        // scrollWidth > clientWidth means it's overflowing, so scroll it.
        if (titleEl) {
            titleEl.classList.toggle('fits', titleEl.scrollWidth <= titleEl.parentElement.clientWidth);
        }

        if (playBtn) {
            // ❙❙ = pause, ▶ = play — use HTML entities so no asset needed
            playBtn.innerHTML = isPlaying ? '&#9646;&#9646;' : '&#9654;';
        }
    }

    /* Update the progress bar, fill width, and time stamps.
       Called on an interval (~500ms) while music is loaded. */
    function updateProgressDisplay() {
        if (!audioEl || !audioEl.duration) return;

        const pct = (audioEl.currentTime / audioEl.duration) * 100;

        const fillEl    = document.getElementById('radioFill');
        const currentEl = document.getElementById('radioCurrent');
        const durationEl = document.getElementById('radioDuration');

        if (fillEl)     fillEl.style.width        = pct + '%';
        if (currentEl)  currentEl.textContent      = Utils.formatTime(audioEl.currentTime);
        if (durationEl) durationEl.textContent     = Utils.formatTime(audioEl.duration);
    }


    /* ════════════════════════════════════════════════════════
       PLAYBACK CONTROL
    ════════════════════════════════════════════════════════ */

    function loadTrack(index) {
        if (!playlist.length) return;
        currentIndex = ((index % playlist.length) + playlist.length) % playlist.length;
        audioEl.src    = playlist[currentIndex].src;
        audioEl.volume = document.getElementById('radioVolume')?.value / 100 ?? 0.3;
        audioEl.load();
        updateTrackDisplay();
    }

    function playCurrentTrack() {
        if (!playlist.length) return;
        audioEl.play();
        isPlaying = true;
        updateTrackDisplay();
        document.getElementById('radioWidget')?.classList.add('visible');
    }


    /* ════════════════════════════════════════════════════════
       DRAG BEHAVIOUR
    ════════════════════════════════════════════════════════ */

    function initDrag() {
        const widget = document.getElementById('radioWidget');
        const handle = document.getElementById('radioDragHandle');
        if (!widget || !handle) return;

        let dragging = false;
        let offsetX  = 0;
        let offsetY  = 0;

        handle.addEventListener('mousedown', e => {
            dragging = true;
            const rect = widget.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            // Detach from bottom/right anchors — switch to explicit left/top
            widget.style.bottom = 'auto';
            widget.style.right  = 'auto';
            widget.style.left   = rect.left + 'px';
            widget.style.top    = rect.top  + 'px';

            e.preventDefault();  // prevent text selection during drag
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
        audioEl = document.getElementById('bgMusic');
        if (!audioEl) return;

        // Load playlist from server — graceful if missing
        fetch('playlist.json')
            .then(r => r.json())
            .then(data => { playlist = data; })
            .catch(() => console.warn('[Radio] playlist.json not found'));

        // Progress display refreshes every 500ms
        setInterval(updateProgressDisplay, 500);

        // Auto-advance on track end
        audioEl.addEventListener('ended', () => Radio.next());

        // Click on the progress bar to scrub
        const progressBar = document.querySelector('.radio-progress-bar');
        if (progressBar) {
            progressBar.addEventListener('click', e => {
                if (!audioEl.duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                audioEl.currentTime = ((e.clientX - rect.left) / rect.width) * audioEl.duration;
            });
        }

        initDrag();
    });


    /* ════════════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════════════ */

    return {
        /* Begin playback from the first track.
           Idempotent — safe to call multiple times. */
        start() {
            if (!audioEl || isPlaying || !playlist.length) return;
            loadTrack(currentIndex);
            playCurrentTrack();
        },

        next() {
            loadTrack(currentIndex + 1);
            playCurrentTrack();
        },

        prev() {
            loadTrack(currentIndex - 1);
            playCurrentTrack();
        },

        togglePlay() {
            if (!audioEl) return;
            if (audioEl.paused) { audioEl.play(); isPlaying = true; }
            else                { audioEl.pause(); isPlaying = false; }
            updateTrackDisplay();
        },

        setVolume(val) {
            if (!audioEl) return;
            audioEl.volume = Math.max(0, Math.min(1, val));
        },
    };

})();


/* ── Global function shims ──────────────────────────────────────
   HTML uses inline onclick="..." handlers which need globally-scoped
   function names. These shims forward to the Radio module's methods.
   If you ever refactor the HTML to use addEventListener, delete these. */
function pauseMusic()  { Radio.togglePlay(); }
function nextTrack()   { Radio.next(); }
function prevTrack()   { Radio.prev(); }
function setVolume(v)  { Radio.setVolume(v); }
