/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   utils.js
   Pure utility functions with zero side effects.

   Rules for this file:
     - No DOM reads or writes
     - No globals modified
     - No setTimeout/setInterval
     - Every function takes inputs and returns an output

   If you find yourself needing something from here in a new module,
   just make sure utils.js loads before it in index.html.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Utils = Object.freeze({

    /* ── Time formatting ───────────────────────────────────────
       Converts a raw seconds value into a MM:SS display string.
       Used by the radio widget's time display.

       Examples:
         formatTime(0)    → "0:00"
         formatTime(75)   → "1:15"
         formatTime(3600) → "60:00" (no hours — intentional) */
    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    },

    /* ── Easing functions ──────────────────────────────────────
       All take t in [0, 1] and return an eased value in [0, 1].
       Using named functions rather than inline math keeps the
       animation code readable and makes it easy to swap curves. */

    easing: {
        /* Cubic ease-out — fast start, decelerates to stop.
           Good for things that "land" (slide-in panels, elements
           coming to rest). */
        easeOutCubic(t) {
            return 1 - Math.pow(1 - t, 3);
        },

        /* Cubic ease-in-out — slow start, fast middle, slow end.
           Good for things moving from one place to another
           (hand animation, camera drift). */
        easeInOutCubic(t) {
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        },

        /* Power ease-out — generalised version of easeOutCubic.
           Higher power = lingers longer at start, drops sharper at end.
           Used by the hex city camera swoop. */
        easeOutPow(t, power) {
            return 1 - Math.pow(1 - t, power);
        },

        /* Quadratic ease-in-out — slightly softer than cubic.
           Used for position tweens (globe move). */
        easeInOutQuad(t) {
            return t < 0.5
                ? 2 * t * t
                : 1 - Math.pow(-2 * t + 2, 2) / 2;
        },
    },

    /* ── Clamped linear interpolation ─────────────────────────
       Lerps from `a` to `b` by ratio `t`, clamped to [0, 1].
       Prevents overshooting at the ends of an animation. */
    lerp(a, b, t) {
        return a + (b - a) * Math.min(1, Math.max(0, t));
    },

    /* ── Random integer in range ───────────────────────────────
       Returns an integer in [min, max] inclusive. */
    randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /* ── Random array element ──────────────────────────────────
       Picks a uniformly random element from any array. */
    randElement(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    },

    /* ── DOM: wait two animation frames ───────────────────────
       requestAnimationFrame fires at the start of the next paint.
       Some transitions need to be set AFTER an element is rendered
       in the DOM, not in the same tick it was inserted. Waiting two
       frames ensures the browser has committed the initial state
       before the transition class is added.

       Usage:
         container.appendChild(el);
         await Utils.nextFrames();
         el.classList.add('active'); // transition fires correctly */
    nextFrames() {
        return new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
    },

    /* ── Animation: smooth XY movement ────────────────────────
       Moves `el` from (fromX, fromY) to (toX, toY) over `dur` ms
       using a named easing function. Calls onDone when complete.

       Uses requestAnimationFrame for smooth 60fps motion without
       needing a library. The positions are set via el.style.left/top
       so the element must be position:fixed or position:absolute.

       Parameters:
         el      — the element to move
         fromX   — starting left (px)
         fromY   — starting top (px)
         toX     — ending left (px)
         toY     — ending top (px)
         dur     — duration in milliseconds
         easeFn  — one of Utils.easing.* functions
         onDone  — optional callback when animation completes */
    animateXY(el, fromX, fromY, toX, toY, dur, easeFn, onDone) {
        const startTime = performance.now();

        function step(now) {
            const rawT  = Math.min((now - startTime) / dur, 1);
            const easedT = easeFn(rawT);

            el.style.left = Utils.lerp(fromX, toX, easedT) + 'px';
            el.style.top  = Utils.lerp(fromY, toY, easedT) + 'px';

            if (rawT < 1) {
                requestAnimationFrame(step);
            } else {
                // Snap to exact final values — floating point can leave you 0.01px off
                el.style.left = toX + 'px';
                el.style.top  = toY + 'px';
                if (onDone) onDone();
            }
        }

        requestAnimationFrame(step);
    },

    /* ── Async sleep ───────────────────────────────────────────
       Returns a Promise that resolves after `ms` milliseconds.
       Lets async functions use `await Utils.sleep(500)` instead
       of nesting callbacks inside setTimeout.

       This is the core tool that makes conductor.js readable —
       every step of the sequence is a sequential await rather
       than a nested pyramid. */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /* ── Typewrite text before a cursor element ────────────────
       Types `text` character-by-character into the DOM, inserting
       each character immediately before `cursorEl` at `speed` ms
       per character. Returns a Promise that resolves when done.

       The cursor stays at the end of the typed text because we
       use insertAdjacentText('beforebegin'), which places new
       characters just before the cursor node each time.

       Parameters:
         cursorEl — a DOM node acting as the blinking cursor
         text     — the string to type
         speed    — ms between each character */
    typeBeforeCursor(cursorEl, text, speed) {
        return new Promise(resolve => {
            let i = 0;
            const interval = setInterval(() => {
                if (i < text.length) {
                    cursorEl.insertAdjacentText('beforebegin', text[i++]);
                } else {
                    clearInterval(interval);
                    resolve();
                }
            }, speed);
        });
    },

    /* ── Generate a fake-looking data value ────────────────────
       Returns a random string that looks like a corrupted or
       classified data readout. Used for the extra scan rows
       beyond the real data definitions. */
    fakeDataValue() {
        const generators = [
            () => Math.random().toString(16).slice(2, 10).toUpperCase(),
            () => Utils.randElement([
                'NULL', 'UNREGISTERED', 'NOT FOUND', 'FLAGGED', 'CLASSIFIED',
                'EXPIRED', 'DRIFTING', 'PARTIAL', 'INACTIVE', 'SEVERED',
                'DEGRADED', 'MISMATCH',
            ]),
            () => (Math.random() * 10).toFixed(2) + ' / 10',
            () => Math.floor(Math.random() * 9999) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
            () => Utils.randElement(['0.' + Math.floor(Math.random() * 99), '1.00', '0.00']),
            () => Utils.randElement(['ACTIVE', 'PASSIVE', 'MONITORED', 'WATCHING', 'PROCESSING']),
            () => '0x' + Math.random().toString(16).slice(2, 10).toUpperCase(),
        ];
        return Utils.randElement(generators)();
    },

});
