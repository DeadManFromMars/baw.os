/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   signal.js — SIGNAL VIEWER overlay

   A scrolling spectrogram of whatever the radio (<audio id="bgMusic">)
   is playing. The radio widget is lifted above the overlay so it
   stays usable.

   The picture is the same on every machine, so images can be hidden
   in audio (see baw.os-backend/tools/spectrogram-encoder.html, which
   must use the same F_MIN / F_MAX / COLS_PER_SEC / FFT_SIZE):
     vertical    log frequency, F_MIN (bottom) → F_MAX (top), in Hz,
                 whatever the sound card's sample rate
     horizontal  COLS_PER_SEC one-pixel columns per second, whatever
                 the screen's refresh rate

   Signal.open() / Signal.close()      arg.js (data-action="signal")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Signal = (() => {

    const FFT_SIZE     = 4096;    // higher = finer frequency detail
    const F_MIN        = 30;      // Hz at the bottom edge
    const F_MAX        = 16000;   // Hz at the top edge (MP3s usually cut off just above this)
    const COLS_PER_SEC = 60;
    const AXIS_TICKS   = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const MIN_AMP      = 6;       // quieter than this draws as background
    const CREAM       = [245, 242, 236];
    const COLORMAPS   = { ink: [26, 26, 24], red: [232, 55, 42], sage: [122, 154, 138] };
    const RADIO_Z     = '660';    // above this overlay (650), below the mixtape (700)

    const audioEl = document.getElementById('bgMusic');

    // Created on first open and kept: an <audio> can only be routed into Web Audio once
    let audioCtx = null, analyser = null, freqData = null;

    let overlay = null, els = null, ctx = null, column = null;
    let raf = null, resizeObs = null;
    let writeX = 0, colCount = 0, frozen = false, gain = 2.5;
    let lut = null;               // amplitude 0–255 → RGB, pre-blended over cream
    let binLo = null, binHi = null;   // per pixel row: the FFT bin range it covers (see mapRows)
    let lastPlaying = null, lastTime = '';
    let lastFrame = null, pendingCols = 0;


    /* ── OPEN / CLOSE ─────────────────────────────────────── */

    function open() {
        if (overlay) return;
        SFX.positive();
        initAudio();
        buildOverlay();
        setColormap('ink');
        document.getElementById('radioWidget').style.zIndex = RADIO_Z;
        raf = requestAnimationFrame(loop);
    }

    function close() {
        if (!overlay) return;
        SFX.negative();
        cancelAnimationFrame(raf);
        resizeObs.disconnect();
        document.getElementById('radioWidget').style.zIndex = '';

        const closing = overlay;
        overlay = null;
        closing.classList.remove('visible');
        setTimeout(() => closing.remove(), 450);   // after the 0.4s fade (signal.css)
    }


    /* ── AUDIO ────────────────────────────────────────────── */

    function initAudio() {
        const { ctx, bus } = Radio.audioGraph();     // the radio's Web Audio route (music.js)
        if (!audioCtx) {
            audioCtx = ctx;
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            analyser.smoothingTimeConstant = 0;
            bus.connect(analyser);                   // listens to everything the radio plays, scratches included
            freqData = new Uint8Array(analyser.frequencyBinCount);
        }
    }


    /* ── OVERLAY ──────────────────────────────────────────── */

    function buildOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'signalOverlay';
        overlay.tabIndex = -1;
        overlay.innerHTML = `
            <div class="sig-header">
                <div class="sig-header-left">
                    <span class="sig-label">SIGNAL VIEWER</span>
                    <span class="sig-status" data-el="status">AWAITING SIGNAL</span>
                </div>
                <button class="sig-close-btn" data-el="close">✕</button>
            </div>

            <div class="sig-body">
                <div class="sig-sidebar">
                    <div class="sig-section">
                        <div class="sig-section-label">GAIN</div>
                        <div class="sig-range-row">
                            <input type="range" class="sig-range" data-el="gain" min="1" max="10" step="0.1" value="${gain}">
                            <span class="sig-range-val" data-el="gainVal">${gain.toFixed(1)}×</span>
                        </div>
                    </div>

                    <div class="sig-section">
                        <div class="sig-section-label">COLORMAP</div>
                        <div class="sig-colormap-options">
                            ${Object.keys(COLORMAPS).map(cm =>
                                `<button class="sig-cm-btn" data-cm="${cm}">${cm.toUpperCase()}</button>`).join('')}
                        </div>
                    </div>

                    <div class="sig-section">
                        <div class="sig-section-label">CONTROLS</div>
                        <button class="sig-btn" data-el="clear">CLEAR</button>
                        <button class="sig-btn" data-el="freeze">FREEZE</button>
                    </div>

                    <div class="sig-meta">
                        <div class="sig-meta-row"><span class="sig-meta-label">FFT SIZE</span>
                            <span class="sig-meta-val">${FFT_SIZE.toLocaleString()}</span></div>
                        <div class="sig-meta-row"><span class="sig-meta-label">SCALE</span>
                            <span class="sig-meta-val">LOG</span></div>
                        <div class="sig-meta-row"><span class="sig-meta-label">SAMPLE RATE</span>
                            <span class="sig-meta-val">${audioCtx.sampleRate.toLocaleString()} Hz</span></div>
                        <div class="sig-meta-row"><span class="sig-meta-label">COLUMNS</span>
                            <span class="sig-meta-val" data-el="columns">0</span></div>
                    </div>
                </div>

                <div class="sig-canvas-wrap" data-el="wrap">
                    <canvas data-el="canvas"></canvas>
                    <div class="sig-idle" data-el="idle">
                        <div class="sig-idle-text">PLAY A TRACK TO BEGIN</div>
                        <div class="sig-idle-sub">Signal renders in real time</div>
                    </div>
                    <div class="sig-freq-axis">${freqLabels()}</div>
                    <div class="sig-cursor" data-el="cursor"></div>
                </div>
            </div>

            <div class="sig-footer">
                <span class="sig-footer-note">Real-time frequency analysis of the active radio stream</span>
                <span class="sig-footer-time" data-el="time">0:00</span>
            </div>`;
        document.body.appendChild(overlay);

        els = {};
        overlay.querySelectorAll('[data-el]').forEach(el => { els[el.dataset.el] = el; });
        ctx = els.canvas.getContext('2d');
        writeX = 0; colCount = 0; frozen = false; lastPlaying = null; lastTime = '';
        lastFrame = null; pendingCols = 0;

        els.close.addEventListener('click', close);
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        els.clear.addEventListener('click', clearCanvas);
        els.freeze.addEventListener('click', () => {
            frozen = !frozen;
            els.freeze.classList.toggle('active', frozen);
            els.freeze.textContent = frozen ? 'UNFREEZE' : 'FREEZE';
        });
        els.gain.addEventListener('input', () => {
            gain = parseFloat(els.gain.value);
            els.gainVal.textContent = gain.toFixed(1) + '×';
        });
        overlay.querySelectorAll('[data-cm]').forEach(btn =>
            btn.addEventListener('click', () => setColormap(btn.dataset.cm)));

        // Fires once the wrap has its real size, and again on every resize
        resizeObs = new ResizeObserver(resizeCanvas);
        resizeObs.observe(els.wrap);

        requestAnimationFrame(() => { overlay.classList.add('visible'); overlay.focus(); });
    }

    // Height of a frequency as a fraction of the plot, 0 = bottom (log scale)
    const freqToFrac = hz => Math.log(hz / F_MIN) / Math.log(F_MAX / F_MIN);

    function freqLabels() {
        return AXIS_TICKS.map(hz =>
            `<div class="sig-freq-label" style="top:${((1 - freqToFrac(hz)) * 100).toFixed(2)}%">` +
            `${hz >= 1000 ? hz / 1000 + 'k' : hz}</div>`).join('');
    }

    // For each pixel row, the span of FFT bins it covers. Low rows are
    // narrower than one bin (interpolated); high rows cover several
    // bins (the loudest wins, so no tone can fall between rows).
    function mapRows(H) {
        const binHz = audioCtx.sampleRate / FFT_SIZE;
        const hzAt  = frac => F_MIN * Math.pow(F_MAX / F_MIN, frac);
        binLo = new Float32Array(H);
        binHi = new Float32Array(H);
        for (let y = 0; y < H; y++) {
            binLo[y] = hzAt(1 - (y + 1) / H) / binHz;   // row y spans from its bottom edge…
            binHi[y] = hzAt(1 - y / H) / binHz;         // …to its top edge
        }
    }

    function setColormap(name) {
        const c = COLORMAPS[name];
        lut = new Uint8ClampedArray(256 * 3);
        for (let a = 0; a < 256; a++)
            for (let i = 0; i < 3; i++)
                lut[a * 3 + i] = a < MIN_AMP ? CREAM[i] : CREAM[i] + (c[i] - CREAM[i]) * a / 255;
        overlay.querySelectorAll('[data-cm]').forEach(b => b.classList.toggle('active', b.dataset.cm === name));
    }


    /* ── CANVAS ───────────────────────────────────────────── */

    function resizeCanvas() {
        const cv = els.canvas;
        const W = els.wrap.offsetWidth, H = els.wrap.offsetHeight;
        if (!W || !H) return;

        // Keep what's been drawn, stretched to the new size
        const old = cv.width && cv.height ? copyCanvas(cv) : null;
        cv.width = W; cv.height = H;
        ctx.fillStyle = `rgb(${CREAM})`;
        ctx.fillRect(0, 0, W, H);
        if (old) ctx.drawImage(old, 0, 0, W, H);

        column = ctx.createImageData(1, H);
        mapRows(H);
        writeX = 0;
    }

    function copyCanvas(cv) {
        const copy = document.createElement('canvas');
        copy.width = cv.width; copy.height = cv.height;
        copy.getContext('2d').drawImage(cv, 0, 0);
        return copy;
    }

    function clearCanvas() {
        ctx.fillStyle = `rgb(${CREAM})`;
        ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
        writeX = 0; colCount = 0;
        els.columns.textContent = '0';
    }


    /* ── DRAW LOOP ────────────────────────────────────────── */

    function loop(now) {
        raf = requestAnimationFrame(loop);
        const dt = lastFrame === null ? 0 : (now - lastFrame) / 1000;
        lastFrame = now;

        const playing = !audioEl.paused;
        if (playing !== lastPlaying) {
            lastPlaying = playing;
            els.status.textContent = playing ? 'RECEIVING' : 'SIGNAL LOST';
            els.status.classList.toggle('active', playing);
            els.idle.classList.toggle('hidden', playing);
        }
        const time = Utils.formatTime(audioEl.currentTime);
        if (time !== lastTime) els.time.textContent = lastTime = time;

        if (frozen || !playing || !column) { pendingCols = 0; return; }

        // COLS_PER_SEC columns per second, whatever the frame rate. Capped
        // so a stalled frame doesn't smear one reading across the plot.
        pendingCols = Math.min(pendingCols + dt * COLS_PER_SEC, 4);
        if (pendingCols < 1) return;
        fillColumn();
        while (pendingCols >= 1) { writeColumn(); pendingCols--; }
    }

    // Turn the current FFT reading into one column of pixels
    function fillColumn() {
        analyser.getByteFrequencyData(freqData);
        const H = column.height, px = column.data, last = freqData.length - 1;

        for (let y = 0; y < H; y++) {
            const lo = binLo[y], hi = binHi[y];
            let v;
            if (hi - lo < 1) {                       // narrower than a bin: interpolate
                const i = Math.min(lo | 0, last - 1), t = lo - i;
                v = freqData[i] * (1 - t) + freqData[i + 1] * t;
            } else {                                 // several bins: take the loudest
                v = 0;
                for (let i = Math.round(lo), end = Math.min(Math.round(hi), last); i <= end; i++)
                    if (freqData[i] > v) v = freqData[i];
            }
            const l = (Math.min(255, v * gain) | 0) * 3, o = y * 4;
            px[o] = lut[l]; px[o + 1] = lut[l + 1]; px[o + 2] = lut[l + 2]; px[o + 3] = 255;
        }
    }

    function writeColumn() {
        ctx.putImageData(column, writeX, 0);
        writeX = (writeX + 1) % els.canvas.width;
        els.cursor.style.left    = writeX + 'px';
        els.cursor.style.display = 'block';
        if (++colCount % 20 === 0) els.columns.textContent = colCount.toLocaleString();
    }


    return { open, close };

})();
