/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   hex.js  —  STUB (replaced by city.js unified sequence)

   The honeycomb intro is now handled entirely inside city.js as
   part of the unified Three.js sequence. This file is kept as a
   no-op stub so nothing breaks if HEX is referenced elsewhere.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const HEX = (() => {
    return {
        play(callback) {
            // No-op. City.js now owns the full intro sequence.
            // Callback is never needed — session.js calls CITY.start() directly.
        },
    };
})();
