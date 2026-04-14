/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   signal.js  —  SIGNAL VIEWER OVERLAY

   Taps directly into #bgMusic via Web Audio API.
   The radio widget stays visible and draggable inside the overlay.
   No frequency range sliders — just gain, colormap, freeze, clear.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Signal = (() => {

    const FFT_SIZE  = 4096;   // higher = more frequency resolution
    const CREAM     = '#f5f2ec';
    const COLORMAPS = {
        ink:  v => `rgba(26,26,24,${(v/255).toFixed(3)})`,
        red:  v => `rgba(232,55,42,${(v/255).toFixed(3)})`,
        sage: v => `rgba(122,154,138,${(v/255).toFixed(3)})`,
    };

    let _isOpen   = false;
    let _audioCtx = null;
    let _analyser = null;
    let _source   = null;
    let _freqData = null;
    let _rafId    = null;
    let _timeInt  = null;
    let _writeX   = 0;
    let _frozen   = false;
    let _colormap = 'ink';
    let _gain     = 2.5;
    let _canvas         = null;
    let _ctx          = null;
    let _colCount     = 0;
    let _resizeObserver = null;


    /* ════════════════════════════════════════════════════════
       PUBLIC
    ════════════════════════════════════════════════════════ */

    function open() {
        if (_isOpen) return;
        _isOpen = true;
        if (typeof SFX !== 'undefined') SFX.positive();
        _buildShell();
        _initAudio();
        _startLoop();
        _moveRadioIn();
    }

    function close() {
        if (!_isOpen) return;
        _isOpen = false;
        if (typeof SFX !== 'undefined') SFX.negative();
        _stopLoop();
        _moveRadioOut();

        const overlay = document.getElementById('signalOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        }
    }


    /* ════════════════════════════════════════════════════════
       RADIO WIDGET — move it inside/outside the overlay
    ════════════════════════════════════════════════════════ */

    function _moveRadioIn() {
        const widget = document.getElementById('radioWidget');
        const overlay = document.getElementById('signalOverlay');
        if (!widget || !overlay) return;
        // Reparent into the overlay so it sits above the canvas
        // but keep its current screen position via fixed positioning
        widget.style.zIndex = '800';
        overlay.appendChild(widget);
    }

    function _moveRadioOut() {
        const widget = document.getElementById('radioWidget');
        if (!widget) return;
        // Move back to body
        widget.style.zIndex = '200';
        document.body.appendChild(widget);
    }


    /* ════════════════════════════════════════════════════════
       AUDIO
    ════════════════════════════════════════════════════════ */

    function _initAudio() {
        const audioEl = document.getElementById('bgMusic');
        if (!audioEl) return;

        if (!_audioCtx) {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (_audioCtx.state === 'suspended') _audioCtx.resume();

        if (!_source) {
            _source   = _audioCtx.createMediaElementSource(audioEl);
        }

        if (!_analyser) {
            _analyser = _audioCtx.createAnalyser();
            _analyser.fftSize               = FFT_SIZE;
            _analyser.smoothingTimeConstant  = 0.0;
            _source.connect(_analyser);
            _analyser.connect(_audioCtx.destination);
            _freqData = new Uint8Array(_analyser.frequencyBinCount);
        }

        const fftEl = document.getElementById('sigFftSize');
        const srEl  = document.getElementById('sigSampleRate');
        if (fftEl) fftEl.textContent = FFT_SIZE.toLocaleString();
        if (srEl)  srEl.textContent  = _audioCtx.sampleRate.toLocaleString() + ' Hz';

        _buildFreqAxis();
    }


    /* ════════════════════════════════════════════════════════
       SHELL
    ════════════════════════════════════════════════════════ */

    function _buildShell() {
        document.getElementById('signalOverlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'signalOverlay';
        overlay.innerHTML = `
            <div class="sig-header">
                <div class="sig-header-left">
                    <span class="sig-label">SIGNAL VIEWER</span>
                    <span class="sig-dot"></span>
                    <span class="sig-status" id="sigStatus">AWAITING SIGNAL</span>
                </div>
                <button class="sig-close-btn" id="sigCloseBtn">✕</button>
            </div>

            <div class="sig-body">
                <div class="sig-sidebar">

                    <div class="sig-section">
                        <div class="sig-section-label">GAIN</div>
                        <div class="sig-range-row">
                            <input type="range" class="sig-range" id="sigGain"
                                min="1" max="10" value="2.5" step="0.1">
                            <span class="sig-range-val" id="sigGainVal">2.5×</span>
                        </div>
                    </div>

                    <div class="sig-section">
                        <div class="sig-section-label">COLORMAP</div>
                        <div class="sig-colormap-options">
                            <button class="sig-cm-btn active" data-cm="ink">INK</button>
                            <button class="sig-cm-btn" data-cm="red">RED</button>
                            <button class="sig-cm-btn" data-cm="sage">SAGE</button>
                        </div>
                    </div>

                    <div class="sig-section">
                        <div class="sig-section-label">CONTROLS</div>
                        <button class="sig-btn" id="sigClearBtn">CLEAR</button>
                        <button class="sig-btn" id="sigFreezeBtn">FREEZE</button>
                    </div>

                    <div class="sig-meta">
                        <div class="sig-meta-row">
                            <span class="sig-meta-label">FFT SIZE</span>
                            <span class="sig-meta-val" id="sigFftSize">—</span>
                        </div>
                        <div class="sig-meta-row">
                            <span class="sig-meta-label">SAMPLE RATE</span>
                            <span class="sig-meta-val" id="sigSampleRate">—</span>
                        </div>
                        <div class="sig-meta-row">
                            <span class="sig-meta-label">COLUMNS</span>
                            <span class="sig-meta-val" id="sigColumns">0</span>
                        </div>
                    </div>

                </div>

                <div class="sig-canvas-wrap" id="sigCanvasWrap">
                    <canvas id="sigCanvas"></canvas>
                    <div class="sig-idle" id="sigIdle">
                        <div class="sig-idle-text">PLAY A TRACK TO BEGIN</div>
                        <div class="sig-idle-sub">Signal renders in real time</div>
                    </div>
                    <div class="sig-freq-axis" id="sigFreqAxis"></div>
                    <div class="sig-cursor"    id="sigCursor"></div>
                </div>
            </div>

            <div class="sig-footer">
                <span class="sig-footer-note">Real-time frequency analysis of the active radio stream</span>
                <span class="sig-footer-time" id="sigTime">0:00</span>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#sigCloseBtn').addEventListener('click', close);
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        overlay.setAttribute('tabindex', '-1');

        overlay.querySelector('#sigClearBtn').addEventListener('click', _clearCanvas);

        overlay.querySelector('#sigFreezeBtn').addEventListener('click', function () {
            _frozen = !_frozen;
            this.classList.toggle('active', _frozen);
            this.textContent = _frozen ? 'UNFREEZE' : 'FREEZE';
        });

        overlay.querySelectorAll('.sig-cm-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _colormap = btn.dataset.cm;
                overlay.querySelectorAll('.sig-cm-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        const gainSlider = overlay.querySelector('#sigGain');
        const gainVal    = overlay.querySelector('#sigGainVal');
        gainSlider.addEventListener('input', function () {
            _gain = parseFloat(this.value);
            gainVal.textContent = _gain.toFixed(1) + '×';
        });

        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            overlay.focus();
        });

        // Use ResizeObserver on the wrap itself — fires when it gets its real dimensions
        const wrap = overlay.querySelector('#sigCanvasWrap');
        if (wrap) {
            const ro = new ResizeObserver(() => { _resizeCanvas(); });
            ro.observe(wrap);
            _resizeObserver = ro;
        }
    }


    /* ════════════════════════════════════════════════════════
       CANVAS
    ════════════════════════════════════════════════════════ */

    function _resizeCanvas() {
        const wrap = document.getElementById('sigCanvasWrap');
        const cv   = document.getElementById('sigCanvas');
        if (!wrap || !cv) return;

        _canvas = cv;
        _ctx    = cv.getContext('2d');

        const W = wrap.offsetWidth;
        const H = wrap.offsetHeight;

        // Preserve existing content
        const tmp = document.createElement('canvas');
        tmp.width  = cv.width;
        tmp.height = cv.height;
        if (tmp.width && tmp.height) {
            tmp.getContext('2d').drawImage(cv, 0, 0);
        }

        cv.width  = W;
        cv.height = H;
        _ctx.fillStyle = CREAM;
        _ctx.fillRect(0, 0, W, H);

        if (tmp.width && tmp.height) {
            _ctx.drawImage(tmp, 0, 0, W, H);
        }

        _writeX = 0;
        _buildFreqAxis();
    }

    function _clearCanvas() {
        if (!_canvas || !_ctx) return;
        _ctx.fillStyle = CREAM;
        _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
        _writeX   = 0;
        _colCount = 0;
        const el = document.getElementById('sigColumns');
        if (el) el.textContent = '0';
    }


    /* ════════════════════════════════════════════════════════
       DRAW LOOP
    ════════════════════════════════════════════════════════ */

    function _startLoop() {
        if (_rafId) return;
        _rafId = requestAnimationFrame(_loop);

        _timeInt = setInterval(() => {
            const audioEl = document.getElementById('bgMusic');
            if (!audioEl) return;
            const t  = audioEl.currentTime;
            const el = document.getElementById('sigTime');
            if (el) el.textContent =
                `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
        }, 500);
    }

    function _stopLoop() {
        if (_rafId)         { cancelAnimationFrame(_rafId); _rafId = null; }
        if (_timeInt)       { clearInterval(_timeInt); _timeInt = null; }
        if (_resizeObserver){ _resizeObserver.disconnect(); _resizeObserver = null; }
    }

    function _loop() {
        if (!_isOpen) return;
        _rafId = requestAnimationFrame(_loop);

        if (!_analyser || !_freqData || !_canvas || !_ctx) return;

        const audioEl = document.getElementById('bgMusic');
        const playing = audioEl && !audioEl.paused;

        // Status + idle
        const statusEl = document.getElementById('sigStatus');
        const idleEl   = document.getElementById('sigIdle');
        if (statusEl) {
            statusEl.textContent = playing ? 'RECEIVING' : 'SIGNAL LOST';
            statusEl.classList.toggle('active', playing);
        }
        if (idleEl) idleEl.classList.toggle('hidden', playing);

        if (_frozen || !playing) return;

        _analyser.getByteFrequencyData(_freqData);

        const W    = _canvas.width;
        const H    = _canvas.height;
        const bins = _analyser.frequencyBinCount;

        // Only use the bottom 60% of bins — top bins are inaudible
        // ultrasonic content that just shows as noise
        const usableBins = Math.floor(bins * 0.6);
        const cmFn = COLORMAPS[_colormap] || COLORMAPS.ink;

        // Erase column
        _ctx.fillStyle = CREAM;
        _ctx.fillRect(_writeX, 0, 1, H);

        for (let y = 0; y < H; y++) {
            // Map canvas Y to bin index — bottom of canvas = low freq
            const binFrac = 1 - (y / H);
            const bin     = Math.floor(binFrac * usableBins);
            if (bin >= bins) continue;

            const raw = _freqData[bin];
            const amp = Math.min(255, raw * _gain);
            if (amp < 6) continue;

            _ctx.fillStyle = cmFn(amp);
            _ctx.fillRect(_writeX, y, 1, 1);
        }

        _writeX = (_writeX + 1) % W;

        // Cursor
        const cursor = document.getElementById('sigCursor');
        if (cursor) {
            cursor.style.left    = _writeX + 'px';
            cursor.style.display = 'block';
        }

        // Column count (update every 20 frames for perf)
        _colCount++;
        if (_colCount % 20 === 0) {
            const colEl = document.getElementById('sigColumns');
            if (colEl) colEl.textContent = _colCount.toLocaleString();
        }
    }


    /* ════════════════════════════════════════════════════════
       HELPERS
    ════════════════════════════════════════════════════════ */

    function _buildFreqAxis() {
        const axis = document.getElementById('sigFreqAxis');
        if (!axis || !_audioCtx) return;
        const nyquist = _audioCtx.sampleRate / 2;
        // Show labels for the usable 60% of spectrum
        const maxFreq = nyquist * 0.6;
        const steps   = [maxFreq, maxFreq*0.75, maxFreq*0.5, maxFreq*0.25, 0];
        axis.innerHTML = steps.map(hz => {
            const txt = hz >= 1000
                ? (hz/1000).toFixed(1) + 'k'
                : Math.round(hz) + '';
            return `<div class="sig-freq-label">${txt}</div>`;
        }).join('');
    }


    /* ════════════════════════════════════════════════════════
       LISTEN FOR TRACK CHANGES
    ════════════════════════════════════════════════════════ */

    document.addEventListener('radio:track-changed', () => {
        // Nothing needed here — the radio widget updates itself
        // and stays visible inside the overlay
    });


    /* ════════════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════════════ */

    return { open, close };

})();
