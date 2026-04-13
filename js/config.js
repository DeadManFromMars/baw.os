/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   config.js
   Single source of truth for every magic number in the project.

   WHY A CONFIG FILE?
   When a value like "8vw" appears in three places (CSS, JS layout,
   JS animation), keeping them in sync is error-prone. This file
   consolidates values that must be consistent across the codebase.
   CSS-only values stay in CSS. JS-only values stay in their module.
   Cross-cutting values live here.

   Load order: must be the FIRST script tag.
   Everything else imports from window.CONFIG (implicit global —
   fine for a project this size, no module bundler needed).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CONFIG = Object.freeze({

    /* ── Globe position (viewport %) ─────────────────────────
       globeX/Y set the globe canvas center during the scan phase.
       Must match .scan-header left/top in scan.css.
       startGlobeMove() in globe.js animates toward these. */
    globe: {
        initialX:   32,    // % from left — matches .scan-header left:32%
        initialY:   50,    // % from top  — matches .scan-header top:50%
        centerX:    50,    // % — where globe moves after dissolve
        centerY:    50,    //
        postScanY:  12,    // % — where wordmark moves after dissolve
        size:       0.35,  // multiplier against wordmark width
        speed:      0.1,   // radians per second (spin rate)
        moveDuration: 2000, // ms for position tween
    },

    /* ── Scan lines ──────────────────────────────────────────
       maxVisible: how many rows stay on screen at once.
       leftPadding: must match .scan-lines-wrap padding-left in scan.css.
         CSS uses clamp(80px, 8vw, 140px) — JS uses the middle value for
         the reverse sequence row indent. If you change the CSS clamp,
         update this too.
       linesHeight: must match .scan-lines-wrap height in scan.css. */
    scan: {
        maxVisible:          12,
        leftPadding:         '8vw',
        linesHeight:         'calc(100vh - 200px)',
        progressHideDelay:   2000,   // ms after 100% before bar fades
        conductorThreshold:  0.5,    // fraction of SCAN_DEFS rows that must complete before conductor fires
    },

    /* ── Progress bar ────────────────────────────────────────
       These values are applied to the DOM directly by layout.js.
       Kept here so they're findable without reading through DOM code. */
    progress: {
        bottom:     10,    // px from viewport bottom
        barHeight:  4,     // px
        fontSize:   '0.88rem',
    },

    /* ── Drawn box (hand animation start position) ───────────
       Expressed as % of viewport W/H so it scales with screen size. */
    drawnBox: {
        leftPct:  62,   // % of viewport width
        topPct:   18,   // % of viewport height
    },

    /* ── Backend ─────────────────────────────────────────────
       Base URL for the Flask backend. Switch to your production
       URL before deploying. */
    apiBase: 'http://localhost:5000',

});
