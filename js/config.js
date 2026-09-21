/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   config.js — values shared across modules. Load FIRST.
   Module-only tuning lives at the top of each module instead.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CONFIG = Object.freeze({

    /* Backend base URL. Locally the backend serves the site itself,
       so the API is on the same origin. For the live site this must
       become the public API address (e.g. https://api.bawsome.online). */
    apiBase: location.port === '5000' ? '' : 'http://localhost:5000',

    /* Globe position in viewport %. initialX/Y must match
       .scan-header left/top in scan.css. */
    globe: {
        initialX:     32,     // scan phase: beside the data rows
        initialY:     50,
        centerX:      50,     // after the scan dissolves
        centerY:      50,
        postScanY:    12,     // wordmark's final top %
        size:         0.35,   // × wordmark width
        speed:        0.1,    // spin, radians per second
        moveDuration: 2000,   // ms for position tweens
    },

    scan: {
        maxVisible:         12,      // data rows on screen at once
        leftPadding:        '8vw',   // must match .scan-lines-wrap padding-left in scan.css
        progressHideDelay:  2000,    // ms after 100% before the bar fades
        conductorThreshold: 0.5,     // fraction of rows done before the scripted sequence starts
    },

    /* Where the hand starts drawing the typewriter box (% of viewport) */
    drawnBox: { leftPct: 62, topPct: 18 },
});
