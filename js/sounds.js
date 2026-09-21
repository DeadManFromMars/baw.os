/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   sounds.js — UI sound effects

   SFX.hover()     pointer enters something interactive
   SFX.positive()  moving forward (submit, open, add)
   SFX.negative()  going back / closing / removing
   SFX.stamp()     sticker stamp impact

   Any element with data-sfx="hover" plays the hover sound
   automatically — no inline handlers needed.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SFX = (() => {

    const VOLUME = 0.35;

    const sounds = {
        hover:    'Audio/Sounds/HUD/hover.mp3',
        positive: 'Audio/Sounds/HUD/positive.mp3',
        negative: 'Audio/Sounds/HUD/negative.mp3',
        stamp:    'Audio/Sounds/Stamp/stamp_impact.mp3',
    };
    for (const [name, src] of Object.entries(sounds)) {
        const audio = new Audio(src);
        audio.volume  = VOLUME;
        audio.preload = 'auto';
        sounds[name]  = audio;
    }

    // Rewind first so rapid repeats restart instead of being dropped.
    // play() is refused until the page's first click — that's fine.
    function play(name) {
        const audio = sounds[name];
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }

    document.addEventListener('mouseover', e => {
        const target = e.target.closest('[data-sfx="hover"]');
        if (target && !target.contains(e.relatedTarget)) play('hover');   // entering, not moving within
    });

    return {
        hover:    () => play('hover'),
        positive: () => play('positive'),
        negative: () => play('negative'),
        stamp:    () => play('stamp'),
    };
})();
