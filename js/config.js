/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   config.js — values shared across modules. Load FIRST.
   Module-only tuning lives at the top of each module instead.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CONFIG = Object.freeze({

    /* Backend base URL. Locally the backend serves the site itself,
       so the API is on the same origin. For the live site this must
       become the public API address (e.g. https://api.bawsome.online). */
    apiBase: location.port === '5000' ? '' : 'http://localhost:5000',

    /* Globe position in viewport %. It starts where it ends up, so the
       scan dissolves into the welcome screen without anything jumping. */
    globe: {
        initialX:     50,
        initialY:     50,
        centerX:      50,
        centerY:      50,
        postScanY:    12,     // wordmark's final top %
        size:         0.35,   // × wordmark width
        speed:        0.1,    // spin, radians per second
        moveDuration: 2000,   // ms for position tweens
    },

    scan: {
        maxVisible:         14,      // data rows kept in the panel (older ones fade out at the top)
        conductorThreshold: 0.5,     // fraction of rows done before the scripted sequence starts
    },
});
