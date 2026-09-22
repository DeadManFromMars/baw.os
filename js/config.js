/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   config.js — values shared across modules. Load FIRST.
   Module-only tuning lives at the top of each module instead.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CONFIG = Object.freeze({

    /* Backend base URL:
         live site (bawsome.online)     the public API, through the Cloudflare tunnel
         http://localhost:5000          the backend serves the site itself: same origin
         anything else (Live Server…)   the local backend */
    apiBase: /(^|\.)bawsome\.online$/.test(location.hostname) ? 'https://api.bawsome.online'
           : location.port === '5000' ? '' : 'http://localhost:5000',

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
        /* What happens after the scan: 'breakin' (the hands, js/breakin.js — being
           built, so only on this PC) or 'classic' (the terminal + box, scan.js) */
        sequence: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'breakin' : 'classic',
    },
});
