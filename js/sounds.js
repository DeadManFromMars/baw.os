/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   sounds.js  —  UI SOUND EFFECTS

   Three sounds, all from Audio/Sounds/HUD/:
     hover.mp3    — played on mouseenter of interactive ARG elements
     positive.mp3 — played on actions that move forward
                    (register submit, offer token submit)
     negative.mp3 — played on actions that move back or exit
                    (back button, logout)

   Usage:
     SFX.hover()
     SFX.positive()
     SFX.negative()

   All calls are fire-and-forget — each play() rewinds to 0 first
   so rapid re-triggers (e.g. moving between menu items quickly)
   always restart cleanly rather than overlapping or going silent.

   Volume is kept low by default so sounds accent rather than dominate.
   Adjust SFX_VOLUME below to taste (0.0 – 1.0).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SFX = (() => {

    const SFX_VOLUME = 0.35;
    const BASE_PATH  = 'Audio/Sounds/HUD/';

    function make(file) {
        const audio = new Audio(BASE_PATH + file);
        audio.volume = SFX_VOLUME;
        audio.preload = 'auto';
        return audio;
    }

    const sounds = {
        hover:    make('hover.mp3'),
        positive: make('positive.mp3'),
        negative: make('negative.mp3'),
    };

    function play(sound) {
        const a = sounds[sound];
        if (!a) return;
        a.currentTime = 0;
        a.play().catch(() => {
            // Autoplay policy — browser blocked it before first interaction.
            // Silently ignored; sounds will work after the user's first click.
        });
    }

    return {
        hover()    { play('hover');    },
        positive() { play('positive'); },
        negative() { play('negative'); },
    };

})();
