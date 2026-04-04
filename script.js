// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HEX CITY v4
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// One continuous 3D scene. Full camera orientation —
// the camera pitches, yaws, and rolls as it swoops,
// turns, and dodges pillars. No axis locking.
//
// SEQUENCE:
//   1. Black screen, then draw wave spreads across hex floor.
//      Camera is high up looking straight down — looks 2D.
//   2. Camera pitches forward and dives toward the ground.
//      The 3D nature becomes apparent as it swoops in.
//   3. Camera levels off. Pillars begin rising around it.
//   4. Camera flies forward forever, banking into turns,
//      yawing to dodge pillars, feeling like a living thing.
//
// ALL TUNING CONSTANTS are at the top, clearly labelled.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CITY = (() => {

    // ─────────────────────────────────────────────────
    // GRID
    // ─────────────────────────────────────────────────
    const HEX_R = 1.0;    // radius of each hexagon (world units)
    const HEX_GAP = 0.02;   // gap between hexagons
    const GRID_COLS = 56;     // columns across
    const GRID_ROWS = 100;    // rows deep

    // ─────────────────────────────────────────────────
    // PILLARS
    // ─────────────────────────────────────────────────
    const PILLAR_CHANCE = 0.30;  // fraction of hexes that become pillars (0–1)
    const PILLAR_H_MIN = 0.4;   // shortest pillar
    const PILLAR_H_MAX = 4.5;   // tallest pillar

    // ─────────────────────────────────────────────────
    // DRAW WAVE — spreading ring that reveals hex cells
    // ─────────────────────────────────────────────────
    const WAVE_START_DELAY = 800;   // ms of black before the wave begins
    const WAVE_SPEED = 9.0;   // world units per second the wave expands
    const WAVE_ORIGIN_X = 0.0;   // X centre of the wave (0 = grid centre)
    const WAVE_ORIGIN_Z = 20.0;  // Z centre of the wave (near camera start)

    // ─────────────────────────────────────────────────
    // HEX POP — spring bounce as each cell is revealed
    // ─────────────────────────────────────────────────
    const POP_DURATION = 700;   // ms for the spring to settle
    const POP_AMPLITUDE = 0.18;  // how high the cell pops (world units)

    // ─────────────────────────────────────────────────
    // PILLAR RISE
    // ─────────────────────────────────────────────────
    const PILLAR_RISE_START = 6000;  // ms after scene start before pillars begin rising
    const PILLAR_RISE_DUR = 2200;  // ms for each pillar to reach full height
    const PILLAR_RISE_STAGGER = 38;    // ms extra delay per world unit from wave origin

    // ─────────────────────────────────────────────────
    // CAMERA — starting position
    // ─────────────────────────────────────────────────
    const CAM_START_X = 0.0;    // start centred on the grid
    const CAM_START_Y = 20.0;   // high above — makes it look 2D at first
    const CAM_START_Z = 8.0;    // a little way into the grid

    // ─────────────────────────────────────────────────
    // CAMERA — swoop (the dive from high to cruise height)
    // ─────────────────────────────────────────────────
    const CAM_CRUISE_H = 1.6;    // final height above ground during cruise
    const CAM_SWOOP_DUR = 7500;   // ms for the full swoop
    const CAM_SWOOP_EASE = 5;      // easing power — higher = lingers high, dives sharp
    //                                 try: 3 = gentle arc, 5 = dramatic, 8 = cliff drop

    // ─────────────────────────────────────────────────
    // CAMERA — orientation during swoop
    // Pitch is the up/down angle of the camera in radians.
    // -PI/2 = looking straight down, 0 = looking straight forward.
    // ─────────────────────────────────────────────────
    const CAM_PITCH_START = -1.48;  // almost straight down at the beginning
    const CAM_PITCH_END = 0.00;  // level at cruise (0 = horizon)
    const CAM_PITCH_EASE = 4;     // easing power for pitch transition

    // ─────────────────────────────────────────────────
    // CAMERA — cruise flight
    // ─────────────────────────────────────────────────
    const CAM_SPEED = 1.8;   // forward units per second
    const FOV_DEG = 72;    // field of view in degrees

    // ─────────────────────────────────────────────────
    // CAMERA — lateral drift (the wandering S-curve path)
    // ─────────────────────────────────────────────────
    const DRIFT_PERIOD = 22;    // seconds per full left-right cycle
    const DRIFT_AMP = 2.8;   // maximum lateral wander (world units)

    // ─────────────────────────────────────────────────
    // CAMERA — banking (roll when turning)
    // The camera rolls into turns like an aircraft banking.
    // ─────────────────────────────────────────────────
    const BANK_STRENGTH = 0.35;  // how much the camera rolls per unit of lateral velocity
    //                              try: 0.1 = subtle, 0.4 = dramatic
    const BANK_SMOOTH = 0.08;  // how quickly the bank angle follows the turn (0–1)

    // ─────────────────────────────────────────────────
    // CAMERA — yaw (turning left/right to face direction of travel)
    // ─────────────────────────────────────────────────
    const YAW_STRENGTH = 0.18;   // how much the camera turns to face lateral movement
    const YAW_SMOOTH = 0.05;   // how quickly yaw follows lateral velocity

    // ─────────────────────────────────────────────────
    // CAMERA — pillar avoidance
    // ─────────────────────────────────────────────────
    const AVOID_RADIUS = 2.8;   // avoid pillars within this distance
    const AVOID_STRENGTH = 0.6;   // push force (gentle = 0.3, strong = 1.0)
    const AVOID_LOOKAHEAD = 4.0;   // look this far ahead for pillars

    // ─────────────────────────────────────────────────
    // DRAW DISTANCES
    // ─────────────────────────────────────────────────
    const DRAW_FLOOR = 30;   // flat tiles rendered within this Z distance
    const DRAW_PILLAR = 38;   // pillars rendered within this Z distance

    // ─────────────────────────────────────────────────
    // COLOURS
    // ─────────────────────────────────────────────────
    const CREAM = 'rgb(245,242,236)';   // pillar top face
    const CREAM_SIDE = 'rgb(195,190,180)';   // pillar lit side face
    const CREAM_DARK = 'rgb(155,150,140)';   // pillar shadow side face
    const FLOOR = 'rgb(220,216,208)';   // flat hex floor tiles

    // ─────────────────────────────────────────────────
    // BACKGROUND FADE
    // The scene opens on pure black and fades to cream
    // as the wave spreads. BG_FADE_DUR controls how many
    // seconds the fade takes after the wave starts.
    // ─────────────────────────────────────────────────
    const BG_FADE_DUR = 3.0;   // seconds to fade from black to cream after wave starts

    // ─────────────────────────────────────────────────
    // INTERNAL STATE — do not edit these
    // ─────────────────────────────────────────────────
    let cv, ctx;
    let pillars = [], flats = [];
    let raf = null;
    let startT = null;
    let waveActive = false;

    // Camera position
    let camX = CAM_START_X;
    let camY = CAM_START_Y;
    let camZ = CAM_START_Z;

    // Camera orientation (all in radians)
    let camPitch = CAM_PITCH_START;   // up/down tilt
    let camYaw = 0;                 // left/right facing
    let camRoll = 0;                 // banking tilt

    // Smooth velocity for lateral movement
    let camVX = 0;   // lateral velocity (used for banking + avoidance)
    let targetYaw = 0;   // where yaw wants to be
    let targetRoll = 0;   // where roll wants to be

    // Seeded random so the city is identical every run
    let seed = 137;
    function rand() {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return Math.abs(seed) / 0x7fffffff;
    }

    // ─────────────────────────────────────────────────
    // WORLD BUILDING
    // ─────────────────────────────────────────────────

    function hexCenter(col, row) {
        const cw = HEX_R * 1.5 + HEX_GAP;
        const rh = HEX_R * Math.sqrt(3) + HEX_GAP;
        const x = col * cw - (GRID_COLS * cw) / 2;
        const z = row * rh + (col % 2 !== 0 ? rh / 2 : 0);
        return { x, z };
    }

    function hexPts(cx, cz, r) {
        const pts = [];
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
        }
        return pts;
    }

    function buildWorld() {
        seed = 137;
        pillars = [];
        flats = [];

        for (let c = 0; c < GRID_COLS; c++) {
            for (let r = 0; r < GRID_ROWS; r++) {
                const { x, z } = hexCenter(c, r);
                const pts = hexPts(x, z, HEX_R * 0.94);
                const dx = x - WAVE_ORIGIN_X;
                const dz = z - WAVE_ORIGIN_Z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (rand() < PILLAR_CHANCE) {
                    const h = PILLAR_H_MIN + rand() * (PILLAR_H_MAX - PILLAR_H_MIN);
                    pillars.push({
                        x, z, pts,
                        targetH: h,      // final height when fully risen
                        currentH: 0,      // current animated height
                        dist,              // distance from wave origin (for stagger)
                        drawnAt: null,   // ms timestamp when wave reached this cell
                        popOffset: 0,      // vertical pop bounce (world units)
                    });
                } else {
                    flats.push({
                        x, z, pts,
                        dist,
                        drawnAt: null,
                        popOffset: 0,
                    });
                }
            }
        }
    }

    // ─────────────────────────────────────────────────
    // PROJECTION — full 3D camera with pitch, yaw, roll
    //
    // World point → translate to camera space →
    // apply yaw (left/right turn) →
    // apply pitch (up/down tilt) →
    // apply roll (banking) →
    // perspective divide → screen coordinates
    // ─────────────────────────────────────────────────
    function project(wx, wy, wz, W, H) {
        const fov = (FOV_DEG * Math.PI) / 180;
        const flen = (W / 2) / Math.tan(fov / 2);

        // Step 1 — translate world point into camera-relative space
        let rx = wx - camX;
        let ry = wy - camY;
        let rz = wz - camZ;

        // Step 2 — apply YAW (rotate around Y axis)
        const cosYaw = Math.cos(-camYaw);
        const sinYaw = Math.sin(-camYaw);
        const rx1 = rx * cosYaw + rz * sinYaw;
        const rz1 = -rx * sinYaw + rz * cosYaw;

        // Step 3 — apply PITCH (rotate around X axis)
        const cosPitch = Math.cos(-camPitch);
        const sinPitch = Math.sin(-camPitch);
        const ry2 = ry * cosPitch - rz1 * sinPitch;
        const rz2 = ry * sinPitch + rz1 * cosPitch;

        // Step 4 — apply ROLL (rotate around Z axis)
        const cosRoll = Math.cos(-camRoll);
        const sinRoll = Math.sin(-camRoll);
        const rx3 = rx1 * cosRoll - ry2 * sinRoll;
        const ry3 = rx1 * sinRoll + ry2 * cosRoll;

        // Behind the camera — don't draw
        if (rz2 <= 0.05) return null;

        return {
            sx: (rx3 / rz2) * flen + W / 2,
            sy: (-ry3 / rz2) * flen + H / 2,
            depth: rz2
        };
    }

    // ─────────────────────────────────────────────────
    // DRAWING HELPERS
    // ─────────────────────────────────────────────────

    // Fills a polygon from an array of projected screen points
    function fillPoly(pts, color) {
        const visible = pts.filter(p => p !== null);
        if (visible.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(visible[0].sx, visible[0].sy);
        for (let i = 1; i < visible.length; i++) {
            ctx.lineTo(visible[i].sx, visible[i].sy);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    // Draws a single pillar — side faces + subdivided top face
    function drawPillar(p, W, H) {
        if (p.drawnAt === null) return;
        if (p.currentH < 0.01) return;

        const top = p.pts.map(([px, pz]) => project(px, p.currentH, pz, W, H));
        const bot = p.pts.map(([px, pz]) => project(px, 0, pz, W, H));
        const anyVisible = top.some(t => t !== null) || bot.some(b => b !== null);
        if (!anyVisible) return;

        // ── Side faces — back-face culled ──
        for (let i = 0; i < 6; i++) {
            const j = (i + 1) % 6;
            if (!top[i] || !top[j] || !bot[i] || !bot[j]) continue;

            const [px0, pz0] = p.pts[i];
            const [px1, pz1] = p.pts[j];
            const ex = px1 - px0;
            const ez = pz1 - pz0;
            const midX = (px0 + px1) / 2;
            const midZ = (pz0 + pz1) / 2;

            // Positive dot = face points away from camera = skip it
            const dot = ex * (midZ - camZ) - ez * (midX - camX);
            if (dot < 0) continue;

            // Simple directional shading — light comes from upper-right
            const angle = Math.atan2(ez, ex);
            const shade = Math.cos(angle - Math.PI / 4);
            const color = shade > 0 ? CREAM_SIDE : CREAM_DARK;
            fillPoly([top[i], top[j], bot[j], bot[i]], color);
        }

        // ── Top face — subdivided to prevent warping at close range ──
        const SUBDIV = 4;   // subdivisions per hex edge
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < 6; i++) {
            const j = (i + 1) % 6;
            const [ax, az] = p.pts[i];
            const [bx, bz] = p.pts[j];
            for (let s = 0; s <= SUBDIV; s++) {
                const t = s / SUBDIV;
                const wx = ax + (bx - ax) * t;
                const wz = az + (bz - az) * t;
                const pt = project(wx, p.currentH, wz, W, H);
                if (!pt) continue;
                if (!started) { ctx.moveTo(pt.sx, pt.sy); started = true; }
                else ctx.lineTo(pt.sx, pt.sy);
            }
        }
        ctx.closePath();
        ctx.fillStyle = CREAM;
        ctx.fill();
    }

    // Draws a flat hex floor tile
    function drawFlat(f, W, H) {
        if (f.drawnAt === null) return;
        const y = f.popOffset || 0;
        const pts = f.pts.map(([px, pz]) => project(px, y, pz, W, H));
        if (pts.every(p => p === null)) return;
        // Replace nulls with screen-edge fallback so edge tiles still fill
        fillPoly(pts.map(p => p || { sx: W / 2, sy: H }), FLOOR);
    }

    // ─────────────────────────────────────────────────
    // MAIN RENDER LOOP
    // ─────────────────────────────────────────────────
    function render(now) {
        if (!startT) startT = now;
        const ms = now - startT;
        const elapsed = ms / 1000;

        const W = cv.width;
        const H = cv.height;

        // ── BACKGROUND — fades from black to cream as wave spreads ──
        // Before the wave: pure black.
        // After wave starts: linearly fades to the cream background colour
        // over BG_FADE_DUR seconds. Gives the scene a dawn-breaking feel.
        let bgR = 0, bgG = 0, bgB = 0;
        if (waveActive) {
            const fadeT = Math.min(1, ((ms - WAVE_START_DELAY) / 1000) / BG_FADE_DUR);
            bgR = Math.round(fadeT * 245);
            bgG = Math.round(fadeT * 242);
            bgB = Math.round(fadeT * 236);
        }
        ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
        ctx.fillRect(0, 0, W, H);

        // ── DRAW WAVE ─────────────────────────────────
        // After WAVE_START_DELAY a radius expands from the wave origin.
        // Any cell whose centre falls inside gets marked drawn — permanently.
        if (!waveActive && ms >= WAVE_START_DELAY) waveActive = true;

        if (waveActive) {
            const waveRadius = ((ms - WAVE_START_DELAY) / 1000) * WAVE_SPEED;

            for (const f of flats) {
                if (f.drawnAt !== null) continue;
                const dx = f.x - WAVE_ORIGIN_X;
                const dz = f.z - WAVE_ORIGIN_Z;
                if (Math.sqrt(dx * dx + dz * dz) <= waveRadius) f.drawnAt = now;
            }
            for (const p of pillars) {
                if (p.drawnAt !== null) continue;
                const dx = p.x - WAVE_ORIGIN_X;
                const dz = p.z - WAVE_ORIGIN_Z;
                if (Math.sqrt(dx * dx + dz * dz) <= waveRadius) p.drawnAt = now;
            }
        }

        // ── HEX POP ───────────────────────────────────
        // For a short window after drawnAt, the flat cell rises and settles.
        // Spring formula: fast rise, slight overshoot, quick settle.
        for (const f of flats) {
            if (f.drawnAt === null) { f.popOffset = 0; continue; }
            const age = now - f.drawnAt;
            f.popOffset = age < POP_DURATION
                ? POP_AMPLITUDE
                * Math.sin(Math.PI * (age / POP_DURATION))
                * Math.exp(-2.5 * age / POP_DURATION)
                : 0;
        }

        // ── PILLAR RISE ───────────────────────────────
        // Pillars start rising at PILLAR_RISE_START.
        // Each pillar waits an extra (dist * PILLAR_RISE_STAGGER) ms
        // based on its distance from the wave origin — creates a
        // ripple-outward effect rather than all rising at once.
        const riseElapsed = ms - PILLAR_RISE_START;
        if (riseElapsed > 0) {
            for (const p of pillars) {
                if (p.drawnAt === null) continue;
                const stagger = p.dist * PILLAR_RISE_STAGGER;
                const t = Math.max(0, Math.min(1, (riseElapsed - stagger) / PILLAR_RISE_DUR));
                // Ease out cubic with a tiny overshoot bounce at the top
                const ease = t < 1
                    ? 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.06
                    : 1;
                p.currentH = p.targetH * ease;
            }
        }

        // ── CAMERA HEIGHT — the swoop ─────────────────
        // descendT goes 0→1 over CAM_SWOOP_DUR milliseconds.
        // High easing power = camera lingers up high then
        // accelerates sharply downward before pulling level.
        const descendT = Math.min(1, ms / CAM_SWOOP_DUR);
        const descendEase = 1 - Math.pow(1 - descendT, CAM_SWOOP_EASE);
        const pitchEase = 1 - Math.pow(1 - descendT, CAM_PITCH_EASE);

        // Height: start high, end at cruise level
        camY = CAM_START_Y + (CAM_CRUISE_H - CAM_START_Y) * descendEase;

        // Pitch: start looking straight down, end looking straight forward
        camPitch = CAM_PITCH_START + (CAM_PITCH_END - CAM_PITCH_START) * pitchEase;

        // ── FORWARD MOTION ────────────────────────────
        // Speed is multiplied by descendEase so the camera
        // accelerates forward as it pulls out of the dive —
        // feels like gaining speed as you level off.
        const rowH = HEX_R * Math.sqrt(3) + HEX_GAP;
        const gridDepth = GRID_ROWS * rowH;
        const speedMult = Math.pow(descendEase, 0.5);
        camZ = (CAM_START_Z + elapsed * CAM_SPEED * speedMult) % gridDepth;

        // ── LATERAL DRIFT PATH ────────────────────────
        // Two layered sines at different periods = feels non-repeating.
        const pathX =
            Math.sin((elapsed / DRIFT_PERIOD) * Math.PI * 2) * DRIFT_AMP +
            Math.sin((elapsed / (DRIFT_PERIOD * 0.61)) * Math.PI * 2) * DRIFT_AMP * 0.35;

        // ── PILLAR AVOIDANCE ──────────────────────────
        // Accumulate a lateral push away from close pillars ahead.
        // Purely additive on top of the drift path — never overrides it.
        let avoidX = 0;
        for (const p of pillars) {
            const dz = p.z - camZ;
            if (dz < -1.5 || dz > AVOID_LOOKAHEAD) continue;
            const dx = p.x - camX;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < AVOID_RADIUS && dist > 0.01) {
                const proximity = 1 - dist / AVOID_RADIUS;
                const heightWeight = Math.min(p.currentH / 2.0, 1.0);
                avoidX -= (dx / dist) * proximity * AVOID_STRENGTH * heightWeight;
            }
        }
        avoidX = Math.max(-1.5, Math.min(1.5, avoidX));

        // Smooth camera X toward target with damped spring velocity
        const targetX = pathX + avoidX;
        camVX += (targetX - camX) * 0.025;   // spring force toward target
        camVX *= 0.88;                         // dampen so it doesn't oscillate
        camX += camVX;

        // ── YAW — camera nose follows direction of travel ──
        // Suppressed during the swoop (yawInfluence = 0 at top, 1 when level)
        // so the camera looks straight ahead during the dive.
        const yawInfluence = descendEase;
        targetYaw = camVX * YAW_STRENGTH * yawInfluence;
        camYaw += (targetYaw - camYaw) * YAW_SMOOTH;

        // ── ROLL — camera banks into turns ────────────
        // Negative camVX (moving left) = positive roll = right wing dips.
        // Also suppressed during the swoop.
        targetRoll = -camVX * BANK_STRENGTH * yawInfluence;
        camRoll += (targetRoll - camRoll) * BANK_SMOOTH;

        // ── COLLECT AND SORT VISIBLE OBJECTS ──────────
        // Painter's algorithm — draw furthest first so closer things
        // naturally paint over the top.
        const flatObjs = [];
        const pillarObjs = [];

        for (const f of flats) {
            if (f.drawnAt === null) continue;
            const dz = f.z - camZ;
            const dzWrapped = dz < -4 ? dz + gridDepth : dz;
            if (dzWrapped > -4 && dzWrapped < DRAW_FLOOR) {
                const dx = f.x - camX;
                flatObjs.push({ obj: f, depth: dzWrapped * dzWrapped + dx * dx });
            }
        }
        for (const p of pillars) {
            if (p.drawnAt === null) continue;
            const dz = p.z - camZ;
            const dzWrapped = dz < -2 ? dz + gridDepth : dz;
            if (dzWrapped > -2 && dzWrapped < DRAW_PILLAR) {
                const dx = p.x - camX;
                pillarObjs.push({ obj: p, depth: dzWrapped * dzWrapped + dx * dx });
            }
        }

        // Sort furthest first
        flatObjs.sort((a, b) => b.depth - a.depth);
        pillarObjs.sort((a, b) => b.depth - a.depth);

        // Draw floor tiles first, pillars on top
        for (const item of flatObjs) drawFlat(item.obj, W, H);
        for (const item of pillarObjs) drawPillar(item.obj, W, H);

        raf = requestAnimationFrame(render);
    }

    // ─────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────
    return {
        start() {
            cv = document.getElementById('cityCanvas');
            if (!cv) { console.error('cityCanvas not found'); return; }
            ctx = cv.getContext('2d');
            cv.width = window.innerWidth;
            cv.height = window.innerHeight;
            cv.style.cssText =
                'position:fixed;top:0;left:0;width:100%;height:100%;display:block;';
            // z-index is set by the caller (playInitiationSequence) so it
            // can sit above login during the intro then step back after.
            window.addEventListener('resize', () => {
                cv.width = window.innerWidth;
                cv.height = window.innerHeight;
            });
            buildWorld();
            raf = requestAnimationFrame(render);
        },

        stop() {
            if (raf) cancelAnimationFrame(raf);
        }
    };

})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HONEYCOMB SEQUENCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tuning guide:
// START_DELAY    — ms of black before wave starts
// SWEEP_MS       — ms for draw wave to cross screen
// FADE_OFFSET_MS — ms after draw wave START before fade wave begins
//                  (set < SWEEP_MS so fade chases draw while still drawing)
// FADE_SWEEP_MS  — ms for fade wave to cross screen
// POP_SCALE_BASE — peak scale of landing hex (more = bouncier)
// POP_MS         — ms for spring to settle
// RIPPLE_RINGS   — how many neighbor rings each landing ripples
// RIPPLE_DELAY   — ms between each ripple ring
// RIPPLE_DECAY   — amplitude multiplier per ring (0..1)
// CELL_FADE_MS   — ms for each cell's outline to fade once reached
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HEX = (() => {

    const HEX_R          = 36;
    const START_DELAY    = 1600;   // ms black hold
    const SWEEP_MS       = 3200;   // draw wave duration
    const FADE_OFFSET_MS = 1200;   // fade starts this many ms after draw wave (chases it)
    const FADE_SWEEP_MS  = 3000;   // fade wave duration
    const POP_SCALE_BASE = 1.08;   // big bouncy landing
    const POP_MS         = 600;    // spring settle time
    const RIPPLE_RINGS   = 5;      // rings of neighbors to ripple
    const RIPPLE_DELAY   = 60;     // ms between rings
    const RIPPLE_DECAY   = 0.52;   // amplitude per ring
    const CELL_FADE_MS   = 520;    // ms to fade each cell's outline

    const CREAM = 'rgb(245,242,236)';
    const BLACK = '#000';

    let cv, ctx, cells = [], cellMap = new Map();
    let raf        = null;
    let waveStartT = null;  // set after START_DELAY — draw wave clock
    let fadeStartT = null;  // set FADE_OFFSET_MS after waveStartT — fade wave clock
    let allDrawn   = false;
    let onComplete = null;
    let maxDiag    = 1;

    function hexPath(cx, cy, r) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        ctx.closePath();
    }

    function neighborCoords(c, r) {
        const odd = c % 2 !== 0;
        return [
            [c+1, r+(odd?0:-1)], [c+1, r+(odd?1:0)],
            [c,   r-1],          [c,   r+1],
            [c-1, r+(odd?0:-1)], [c-1, r+(odd?1:0)],
        ];
    }

    function buildGrid(W, H) {
        cells   = [];
        cellMap = new Map();
        const cw = HEX_R * 1.5;
        const rh = HEX_R * Math.sqrt(3);
        const cols = Math.ceil(W / cw) + 4;
        const rows = Math.ceil(H / rh) + 4;

        for (let c = -2; c < cols; c++) {
            for (let r = -2; r < rows; r++) {
                const cx   = c * cw;
                const cy   = r * rh + (c % 2 !== 0 ? rh / 2 : 0);
                const diag = (cx / W) + (cy / H);
                const cell = { cx, cy, c, r, diag,
                    drawn: false, popT: null, fadeT: null, ripples: [] };
                cells.push(cell);
                cellMap.set(`${c},${r}`, cell);
            }
        }
        cells.sort((a, b) => a.diag - b.diag);
        maxDiag = cells[cells.length - 1].diag;
    }

    // BFS outward from landCell, schedule ripple on ring `depth`
    function triggerRipple(landCell, depth, amplitude) {
        if (depth > RIPPLE_RINGS || amplitude < 0.015) return;

        const visited  = new Set([`${landCell.c},${landCell.r}`]);
        let   frontier = [landCell];

        for (let d = 0; d < depth; d++) {
            const next = [];
            for (const cell of frontier) {
                for (const [nc, nr] of neighborCoords(cell.c, cell.r)) {
                    const key = `${nc},${nr}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        const nb = cellMap.get(key);
                        if (nb) next.push(nb);
                    }
                }
            }
            frontier = next;
        }

        setTimeout(() => {
            const t = performance.now();
            for (const cell of frontier) {
                if (cell.drawn) cell.ripples.push({ startT: t, amplitude });
            }
            triggerRipple(landCell, depth + 1, amplitude * RIPPLE_DECAY);
        }, depth * RIPPLE_DELAY);
    }

    function render(now) {
        const W = cv.width;
        const H = cv.height;

        ctx.fillStyle = BLACK;
        ctx.fillRect(0, 0, W, H);

        if (waveStartT === null) { raf = requestAnimationFrame(render); return; }

        const drawFront = ((now - waveStartT) / SWEEP_MS) * maxDiag;
        const fadeFront = fadeStartT !== null
            ? ((now - fadeStartT) / FADE_SWEEP_MS) * maxDiag
            : -Infinity;

        let allPopped = true;
        let allFaded  = true;

        for (const cell of cells) {

            // ── Land ──
            if (!cell.drawn && cell.diag <= drawFront) {
                cell.drawn = true;
                cell.popT  = now;
                triggerRipple(cell, 1, POP_SCALE_BASE - 1);
            }
            if (!cell.drawn) { allPopped = false; allFaded = false; continue; }

            // ── Fade wave ──
            if (cell.fadeT === null && cell.diag <= fadeFront) {
                cell.fadeT = now;
            }

            // ── Scale from landing + ripples ──
            let scaleAdd = 0;
            const popAge = now - cell.popT;
            if (popAge < POP_MS) {
                const t = popAge / POP_MS;
                // Spring: rises fast, bounces back with slight overshoot
                scaleAdd += (POP_SCALE_BASE - 1)
                    * Math.sin(Math.PI * t)
                    * Math.exp(-2.2 * t);
            }

            cell.ripples = cell.ripples.filter(rip => {
                const age = now - rip.startT;
                if (age >= POP_MS) return false;
                const t = age / POP_MS;
                scaleAdd += rip.amplitude * Math.sin(Math.PI * t) * Math.exp(-2.2 * t);
                return true;
            });

            const scale = 1 + Math.max(0, scaleAdd);

            // ── Stroke alpha — fades independently per cell ──
            let sa = 1;
            if (cell.fadeT !== null) {
                sa = Math.max(0, 1 - (now - cell.fadeT) / CELL_FADE_MS);
            }
            // A drawn cell with no fadeT yet still has full stroke — counts as not faded
            if (cell.fadeT === null || sa > 0) allFaded = false;

            // ── Draw ──
            const lift = Math.max(0, scaleAdd) / (POP_SCALE_BASE - 1);

            ctx.save();
            ctx.translate(cell.cx, cell.cy);
            ctx.scale(scale, scale);
            ctx.translate(-cell.cx, -cell.cy);

            if (lift > 0.02) {
                ctx.shadowColor    = `rgba(0,0,0,${(lift * 0.55).toFixed(3)})`;
                ctx.shadowBlur     = lift * 22;
                ctx.shadowOffsetY  = lift * 9;
            }

            hexPath(cell.cx, cell.cy, HEX_R);
            ctx.fillStyle = CREAM;
            ctx.fill();

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur  = 0; ctx.shadowOffsetY = 0;

            if (sa > 0) {
                ctx.strokeStyle = `rgba(26,24,20,${sa.toFixed(3)})`;
                ctx.lineWidth   = 0.8;
                ctx.stroke();
            }

            ctx.restore();
        }

        if (allPopped && !allDrawn) allDrawn = true;

        if (fadeStartT !== null && allFaded) {
            cancelAnimationFrame(raf);
            cv.style.transition = 'opacity 0.6s ease';
            cv.style.opacity    = '0';
            document.body.classList.add('accents-ready');
            setTimeout(() => { cv.style.display = 'none'; if (onComplete) onComplete(); }, 700);
            return;
        }

        raf = requestAnimationFrame(render);
    }

    return {
        play(callback) {
            onComplete = callback;
            cv  = document.getElementById('hexCanvas');
            ctx = cv.getContext('2d');
            cv.width  = window.innerWidth;
            cv.height = window.innerHeight;
            cv.style.display    = 'block';
            cv.style.opacity    = '1';
            cv.style.transition = 'none';
            buildGrid(cv.width, cv.height);
            raf = requestAnimationFrame(render);

            // Start draw wave after black hold, then fade wave FADE_OFFSET_MS later
            setTimeout(() => {
                waveStartT = performance.now();
                setTimeout(() => { fadeStartT = performance.now(); }, FADE_OFFSET_MS);
            }, START_DELAY);
        }
    };
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MUSIC & RADIO SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const music = document.getElementById('bgMusic');
let playlist = [];
let currentTrack = 0;
let radioPlaying = false;

fetch('playlist.json')
    .then(r => r.json())
    .then(data => { playlist = data; })
    .catch(() => console.warn('playlist.json not found'));

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateRadioUI() {
    if (!playlist.length) return;
    const track = playlist[currentTrack];
    document.getElementById('radioTitle').textContent = track.title;
    document.getElementById('radioArtist').textContent = track.artist;
    const marquee = document.getElementById('radioTitle');
    const wrap = marquee.parentElement;
    marquee.classList.toggle('fits', marquee.scrollWidth <= wrap.clientWidth);
    document.getElementById('radioPlayBtn').innerHTML = radioPlaying ? '&#9646;&#9646;' : '&#9654;';
}

function updateRadioProgress() {
    if (!music || !music.duration) return;
    const pct = (music.currentTime / music.duration) * 100;
    document.getElementById('radioFill').style.width = pct + '%';
    document.getElementById('radioCurrent').textContent = formatTime(music.currentTime);
    document.getElementById('radioDuration').textContent = formatTime(music.duration);
}

function loadTrack(idx) {
    if (!playlist.length) return;
    currentTrack = idx;
    music.src = playlist[currentTrack].src;
    music.volume = document.getElementById('radioVolume').value / 100;
    music.load();
    updateRadioUI();
}

function startMusic() {
    if (!music || radioPlaying || !playlist.length) return;
    loadTrack(currentTrack);
    music.play();
    radioPlaying = true;
    updateRadioUI();
    document.getElementById('radioWidget').classList.add('visible');
}

function nextTrack() {
    currentTrack = (currentTrack + 1) % playlist.length;
    loadTrack(currentTrack);
    music.play();
    radioPlaying = true;
    updateRadioUI();
}

function prevTrack() {
    currentTrack = (currentTrack - 1 + playlist.length) % playlist.length;
    loadTrack(currentTrack);
    music.play();
    radioPlaying = true;
    updateRadioUI();
}

function pauseMusic() {
    if (!music) return;
    if (music.paused) { music.play(); radioPlaying = true; }
    else { music.pause(); radioPlaying = false; }
    updateRadioUI();
}

function setVolume(val) {
    if (!music) return;
    music.volume = Math.max(0, Math.min(1, val));
}

// Wire up audio events after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setInterval(updateRadioProgress, 500);

    if (music) music.addEventListener('ended', nextTrack);

    const progressBar = document.querySelector('.radio-progress-bar');
    if (progressBar) progressBar.addEventListener('click', e => {
        if (!music || !music.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        music.currentTime = ((e.clientX - rect.left) / rect.width) * music.duration;
    });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RADIO DRAG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(function initRadioDrag() {
    const widget = document.getElementById('radioWidget');
    const handle = document.getElementById('radioDragHandle');
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', e => {
        dragging = true;
        const rect = widget.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        widget.style.bottom = 'auto';
        widget.style.right = 'auto';
        widget.style.left = rect.left + 'px';
        widget.style.top = rect.top + 'px';
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        widget.style.left = (e.clientX - offsetX) + 'px';
        widget.style.top = (e.clientY - offsetY) + 'px';
    });

    document.addEventListener('mouseup', () => { dragging = false; });
})();


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYOUT CONFIG — tweak these values freely
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CONFIG = {
    globeX: 32,
    globeY: 50,
    globeSize: 0.35,
    globeSpeed: 0.1,
    scanLinesHeight: 'calc(100vh - 200px)',
    scanLinesLeftPadding: '8vw',
    scanLinesMaxVisible: 12,
    progressBarLeft: '20vw',
    progressBarRight: '20vw',
    progressHideDelay: 2000,
    progressBarBottom: 10,
    progressBarHeight: 4,
    progressBarFontSize: '0.88rem',
    drawnBoxLeft: 62,
    drawnBoxTop: 18,
};

// Apply CONFIG to DOM immediately
const wrap = document.querySelector('.scan-lines-wrap');
if (wrap) {
    wrap.style.paddingLeft = CONFIG.scanLinesLeftPadding;
    wrap.style.height = CONFIG.scanLinesHeight;
}

const progress = document.querySelector('.scan-progress');
if (progress) progress.style.bottom = CONFIG.progressBarBottom + 'px';

const progressTrack = document.querySelector('.progress-track');
if (progressTrack) progressTrack.style.height = CONFIG.progressBarHeight + 'px';

const progressMeta = document.querySelector('.progress-meta');
if (progressMeta) progressMeta.style.fontSize = CONFIG.progressBarFontSize;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ACCESS_CODE = 'bawsome';
const REDIRECT_URL = 'stage2.html';


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(() => {
    window.addEventListener('DOMContentLoaded', () => {

        let musicStarted = false;

        const canvas = document.getElementById('globeCanvas');
        const overlay = document.getElementById('globeOverlay');
        if (!canvas || !overlay) return;

        const ctx = canvas.getContext('2d');

        const globeConfig = {
            tiltX: 0.98,
            tiltZ: 0.4,
            invertSpin: false,
        };

        function resizeCanvas() {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 1400);

        // ── Position animation ──
        const MOVE_DURATION = 2000;
        let currentGlobeX = CONFIG.globeX;
        let currentGlobeY = CONFIG.globeY;
        let startGlobeX = CONFIG.globeX;
        let startGlobeY = CONFIG.globeY;
        let targetGlobeX = CONFIG.globeX;
        let targetGlobeY = CONFIG.globeY;
        let globeMoveStart = null;

        window.startGlobeMove = (toX, toY) => {
            startGlobeX = currentGlobeX;
            startGlobeY = currentGlobeY;
            targetGlobeX = toX;
            targetGlobeY = toY;
            globeMoveStart = performance.now();
        };

        // ── Pin system ──
        const PIN_COUNT = 4;

        const boxAnchors = [
            { x: 0.18, y: 0.78 }, // bottom left
            { x: 0.18, y: 0.22 }, // top left
            { x: 0.82, y: 0.22 }, // top right
            { x: 0.82, y: 0.78 }, // bottom right
        ];

        function pickPins(count) {
            const quadrants = [
                { latMin: 0.1, latMax: Math.PI / 2, lonMin: 0, lonMax: Math.PI },
                { latMin: 0.1, latMax: Math.PI / 2, lonMin: Math.PI, lonMax: Math.PI * 2 },
                { latMin: Math.PI / 2, latMax: Math.PI * 0.9, lonMin: 0, lonMax: Math.PI },
                { latMin: Math.PI / 2, latMax: Math.PI * 0.9, lonMin: Math.PI, lonMax: Math.PI * 2 },
            ];

            return quadrants.slice(0, count).map((q, i) => ({
                lat: q.latMin + Math.random() * (q.latMax - q.latMin),
                lon: q.lonMin + Math.random() * (q.lonMax - q.lonMin),
                boxX: boxAnchors[i].x * window.innerWidth,
                boxY: boxAnchors[i].y * window.innerHeight,
                boxW: 220,
                boxH: 160,
                lineEl: null,
                boxEl: null,
                visible: false,
                progress: 0,
            }));
        }

        const pins = pickPins(PIN_COUNT);

        pins.forEach(pin => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('stroke', 'rgba(255,0,0,0.7)');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('opacity', '0');
            overlay.appendChild(line);
            pin.lineEl = line;

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('stroke', 'rgba(255,0,0,0.7)');
            rect.setAttribute('stroke-width', '1.5');
            rect.setAttribute('fill', 'rgba(245,242,236,0.92)');
            rect.setAttribute('rx', '2');
            rect.setAttribute('opacity', '0');
            rect.setAttribute('x', pin.boxX - pin.boxW / 2);
            rect.setAttribute('y', pin.boxY - pin.boxH / 2);
            rect.setAttribute('width', pin.boxW);
            rect.setAttribute('height', pin.boxH);
            overlay.appendChild(rect);
            pin.boxEl = rect;
        });

        function projectPin(lat, lon, cx, cy, radius, spinY, cosX, sinX, cosZ, sinZ) {
            let x = radius * Math.sin(lat) * Math.cos(lon);
            let y = radius * Math.cos(lat);
            let z = radius * Math.sin(lat) * Math.sin(lon);
            let x1 = x * Math.cos(spinY) - z * Math.sin(spinY);
            let z1 = x * Math.sin(spinY) + z * Math.cos(spinY);
            let y2 = y * cosX - z1 * sinX;
            let z2 = y * sinX + z1 * cosX;
            let x3 = x1 * cosZ - y2 * sinZ;
            let y3 = x1 * sinZ + y2 * cosZ;
            const perspective = 300 / (300 + z2);
            return { x: cx + x3 * perspective, y: cy + y3 * perspective, z: z2 };
        }

        window.startPinLines = () => {
            pins.forEach(pin => { pin.visible = true; });
        };

        function drawGlobe(timestamp) {
            const dpr = window.devicePixelRatio || 1;
            const logicalW = canvas.width / dpr;
            const logicalH = canvas.height / dpr;
            ctx.clearRect(0, 0, logicalW, logicalH);

            // Position animation
            if (globeMoveStart !== null) {
                const elapsed = timestamp - globeMoveStart;
                const t = Math.min(elapsed / MOVE_DURATION, 1);
                const eased = t < 0.5
                    ? 2 * t * t
                    : 1 - Math.pow(-2 * t + 2, 2) / 2;
                currentGlobeX = startGlobeX + (targetGlobeX - startGlobeX) * eased;
                currentGlobeY = startGlobeY + (targetGlobeY - startGlobeY) * eased;
                if (t >= 1) globeMoveStart = null;
            }

            const cx = window.innerWidth * (currentGlobeX / 100);
            const cy = window.innerHeight * (currentGlobeY / 100);

            const wordmark = document.querySelector('.scan-wordmark');
            const wordmarkWidth = wordmark ? wordmark.offsetWidth : 300;
            const radius = wordmarkWidth * 0.7 * CONFIG.globeSize;

            const time = Date.now() * 0.001;
            const spinY = (globeConfig.invertSpin ? -1 : 1) * time * CONFIG.globeSpeed;

            const cosX = Math.cos(globeConfig.tiltX);
            const sinX = Math.sin(globeConfig.tiltX);
            const cosZ = Math.cos(globeConfig.tiltZ);
            const sinZ = Math.sin(globeConfig.tiltZ);

            // Draw globe dots
            for (let lat = 0; lat < Math.PI; lat += 0.08) {
                for (let lon = 0; lon < Math.PI * 2; lon += 0.08) {
                    let x = radius * Math.sin(lat) * Math.cos(lon);
                    let y = radius * Math.cos(lat);
                    let z = radius * Math.sin(lat) * Math.sin(lon);
                    let x1 = x * Math.cos(spinY) - z * Math.sin(spinY);
                    let z1 = x * Math.sin(spinY) + z * Math.cos(spinY);
                    let y2 = y * cosX - z1 * sinX;
                    let z2 = y * sinX + z1 * cosX;
                    let x3 = x1 * cosZ - y2 * sinZ;
                    let y3 = x1 * sinZ + y2 * cosZ;
                    const perspective = 300 / (300 + z2);
                    const screenX = cx + x3 * perspective;
                    const screenY = cy + y3 * perspective;
                    const depth = (z2 + radius) / (2 * radius);
                    const alpha = 0.3 + depth * 0.7;
                    ctx.fillStyle = `rgba(255, 0, 0, ${alpha.toFixed(2)})`;
                    ctx.fillRect(screenX, screenY, 1.5, 1.5);
                }
            }

            // Update pin lines every frame
            pins.forEach(pin => {
                if (!pin.visible) return;
                pin.progress = Math.min(pin.progress + 0.007, 1);

                const proj = projectPin(pin.lat, pin.lon, cx, cy, radius, spinY, cosX, sinX, cosZ, sinZ);
                const curEndX = proj.x + (pin.boxX - proj.x) * pin.progress;
                const curEndY = proj.y + (pin.boxY - proj.y) * pin.progress;

                pin.lineEl.setAttribute('x1', proj.x + 0.75);
                pin.lineEl.setAttribute('y1', proj.y + 0.75);
                pin.lineEl.setAttribute('x2', curEndX);
                pin.lineEl.setAttribute('y2', curEndY);
                pin.lineEl.setAttribute('opacity', '1');

                if (pin.progress >= 1) {
                    pin.boxEl.setAttribute('opacity', '1');
                }
            });

            // Start music once all pins have finished drawing
            if (!musicStarted && pins.length > 0 && pins.every(p => p.progress >= 1)) {
                musicStarted = true;
                startMusic();
            }

            requestAnimationFrame(drawGlobe);
        }

        requestAnimationFrame(drawGlobe);
    });
})();


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOT CANVAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const dotCanvas = document.getElementById('dotCanvas');
const dotCtx = dotCanvas.getContext('2d');
let W = 0, H = 0;

function resizeDotCanvas() {
    W = dotCanvas.width = window.innerWidth;
    H = dotCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeDotCanvas);
resizeDotCanvas();

const dots = [];
for (let i = 0; i < 65; i++) {
    dots.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.3 + 0.3,
        vx: (Math.random() - 0.5) * 0.00007,
        vy: (Math.random() - 0.5) * 0.00007,
        d: Math.random(),
    });
}

let mouseX = 0.5, mouseY = 0.5;
let targetMouseX = 0.5, targetMouseY = 0.5;

document.addEventListener('mousemove', e => {
    targetMouseX = e.clientX / W;
    targetMouseY = e.clientY / H;
    const card = document.getElementById('loginCard');
    const loginPhase = document.getElementById('loginPhase');
    if (card && loginPhase.classList.contains('visible')) {
        const dx = targetMouseX - 0.5;
        const dy = targetMouseY - 0.5;
        card.style.transform = `perspective(900px) rotateX(${-dy * 3}deg) rotateY(${dx * 3}deg)`;
    }
});

function drawDots() {
    mouseX += (targetMouseX - mouseX) * 0.04;
    mouseY += (targetMouseY - mouseY) * 0.04;
    dotCtx.clearRect(0, 0, W, H);
    dots.forEach(dot => {
        dot.x = (dot.x + dot.vx + 1) % 1;
        dot.y = (dot.y + dot.vy + 1) % 1;
        const px = (dot.x + (mouseX - 0.5) * 0.05 * dot.d) % 1;
        const py = (dot.y + (mouseY - 0.5) * 0.04 * dot.d) % 1;
        dotCtx.beginPath();
        dotCtx.arc(px * W, py * H, dot.r, 0, Math.PI * 2);
        dotCtx.fillStyle = `rgba(26, 26, 24, ${0.2 + dot.d * 0.3})`;
        dotCtx.fill();
    });
    requestAnimationFrame(drawDots);
}

drawDots();


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATA COLLECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const dataReady = {};
const setData = (id, val) => { dataReady[id] = val; };

fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(d => { setData('ip', d.ip); return fetch(`https://ipapi.co/${d.ip}/json/`); })
    .then(r => r.json())
    .then(d => {
        setData('loc', [d.city, d.country_name].filter(Boolean).join(', ') || 'Unknown');
        setData('isp', d.org || 'Unknown');
        setData('postal', d.postal || 'Unknown');
        setData('asn', d.asn || 'Unknown');
        setData('region', d.region || 'Unknown');
        setData('currency', d.currency || 'Unknown');
        setData('calling', d.country_calling_code || 'Unknown');
        setData('country_area', d.country_area ? d.country_area.toLocaleString() + ' km²' : 'Unknown');
        setData('country_pop', d.country_population ? Number(d.country_population).toLocaleString() : 'Unknown');
    })
    .catch(() => {
        ['ip', 'loc', 'isp', 'postal', 'asn', 'region', 'currency', 'calling', 'country_area', 'country_pop']
            .forEach(k => setData(k, k === 'ip' ? 'Masked / VPN' : '—'));
    });

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const tzOffset = -new Date().getTimezoneOffset();
const tzSign = tzOffset >= 0 ? '+' : '';
const tzHours = Math.floor(Math.abs(tzOffset) / 60);
setData('tz', `${tz.split('/').pop().replace(/_/g, ' ')} (UTC${tzSign}${tzHours})`);

const ua = navigator.userAgent;
const browser = ua.includes('Edg') ? 'Edge' : ua.includes('Chrome') ? 'Chrome'
    : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Unknown';
const os = ua.includes('Win') ? 'Windows' : ua.includes('Mac') ? 'macOS'
    : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS'
        : ua.includes('Android') ? 'Android' : ua.includes('Linux') ? 'Linux' : 'Unknown';

const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

setData('locale', navigator.language || 'Unknown');
setData('langs', (navigator.languages || [navigator.language]).slice(0, 4).join(', '));
setData('dev', `${browser} / ${os}`);
setData('platform', navigator.platform || 'Unknown');
setData('cores', navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' logical cores' : 'Unknown');
setData('mem', navigator.deviceMemory ? navigator.deviceMemory + ' GB RAM' : 'Unknown');
setData('conn', conn ? (conn.effectiveType || '?').toUpperCase() + (conn.downlink ? ' — ' + conn.downlink + ' Mbps' : '') : 'Unknown');
setData('rtt', conn?.rtt !== undefined ? conn.rtt + ' ms RTT' : 'Unknown');
setData('disp', `${screen.width} × ${screen.height}`);
setData('dpr', window.devicePixelRatio ? window.devicePixelRatio + 'x DPR' : 'Unknown');
setData('depth', screen.colorDepth ? screen.colorDepth + '-bit color' : 'Unknown');
setData('orient', screen.orientation?.type || 'Unknown');
setData('touch', navigator.maxTouchPoints > 0 ? `Yes — ${navigator.maxTouchPoints} pts` : 'None');
setData('cookies', navigator.cookieEnabled ? 'Enabled' : 'Disabled');
setData('plugins', navigator.plugins?.length ? navigator.plugins.length + ' detected' : '0 detected');
setData('storage', typeof localStorage !== 'undefined' ? 'Available' : 'Blocked');
setData('webgl', (() => { try { return document.createElement('canvas').getContext('webgl') ? 'Supported' : 'Unsupported'; } catch { return 'Unavailable'; } })());
setData('ua', navigator.userAgent.slice(0, 52) + '...');
setData('ref', document.referrer || 'Direct');
setData('session', 'BSI-' + Math.random().toString(36).substr(2, 8).toUpperCase());
setData('time', new Date().toISOString());
setData('viewport', `${window.innerWidth} × ${window.innerHeight}`);
setData('history_len', history.length + ' pages');
setData('online', navigator.onLine ? 'Online' : 'Offline');
setData('route_depth', 'orphaned');

const fakeData = {
    fake1: 'NULL', fake2: 'UNREGISTERED', fake3: 'NOT FOUND', fake4: 'MISMATCH',
    fake5: 'FLAGGED', fake6: 'DRIFTING', fake7: 'EXPIRED', fake8: 'UNKNOWN',
    fake9: 'PARTIAL', fake10: '0.34', fake11: 'INACTIVE', fake12: 'CLASSIFIED',
    fake13: 'SEVERED', fake14: '7.4 / 10', fake15: 'DEGRADED', fake16: '72h',
    fake17: '0.91', fake18: 'DETECTED', fake19: '0x4F3A', fake20: 'NULL',
    fake21: 'REVOKED', fake22: 'IMMINENT', fake23: 'DEEP', fake24: 'ACTIVE', fake25: 'LOST',
};
Object.entries(fakeData).forEach(([k, v]) => setData(k, v));

setData('bat', 'Unavailable');
setData('charging', 'Unknown');
if (navigator.getBattery) {
    navigator.getBattery()
        .then(b => {
            setData('bat', Math.round(b.level * 100) + '% ' + (b.charging ? '(Charging)' : '(On Battery)'));
            setData('charging', b.charging ? 'Yes' : 'No');
        })
        .catch(() => { });
}

document.getElementById('sessionId').textContent = dataReady['session'] || 'BSI-——';


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCAN DEFINITIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const scanDefs = [
    { key: 'IP Address', id: 'ip', s: 0, wait: 1100, pause: 900 },
    { key: 'Location', id: 'loc', s: 0, wait: 1000, pause: 820 },
    { key: 'Timezone', id: 'tz', s: 0, wait: 880, pause: 740 },
    { key: 'Device', id: 'dev', s: 0, wait: 820, pause: 680 },
    { key: 'Connection', id: 'conn', s: 0, wait: 740, pause: 620 },
    { key: 'Display', id: 'disp', s: 0, wait: 680, pause: 560 },
    { key: 'Battery', id: 'bat', s: 0, wait: 620, pause: 500 },
    { key: 'Language', id: 'langs', s: 0, wait: 560, pause: 440 },
    { key: 'Platform', id: 'platform', s: 0, wait: 500, pause: 390 },
    { key: 'Death Drive Acquisition', id: 'fake1', s: 0, wait: 440, pause: 340 },
    { key: 'Soul Index', id: 'fake2', s: 0, wait: 390, pause: 300 },
    { key: 'Consent Timestamp', id: 'fake3', s: 0, wait: 340, pause: 260 },
    { key: 'Memory Checksum', id: 'fake4', s: 0, wait: 290, pause: 220 },
    { key: 'Behavioral Signature', id: 'fake5', s: 0, wait: 250, pause: 185 },
    { key: 'Identity Anchor', id: 'fake6', s: 0, wait: 210, pause: 155 },
    { key: 'Compliance Token', id: 'fake7', s: 0, wait: 175, pause: 128 },
    { key: 'Threat Vector', id: 'fake8', s: 0, wait: 145, pause: 105 },
    { key: 'Shadow Profile', id: 'fake9', s: 0, wait: 118, pause: 85 },
    { key: 'Loyalty Coefficient', id: 'fake10', s: 0, wait: 95, pause: 68 },
    { key: 'Conscience Override', id: 'fake11', s: 'xl', wait: 76, pause: 54 },
    { key: 'Last Known Intent', id: 'fake12', s: 'xl', wait: 60, pause: 42 },
    { key: 'Origin Trace', id: 'fake13', s: 'xl', wait: 48, pause: 33 },
    { key: 'Anomaly Score', id: 'fake14', s: 'xl', wait: 38, pause: 26 },
    { key: 'Narrative Coherence', id: 'fake15', s: 'xl', wait: 30, pause: 20 },
    { key: 'Exposure Window', id: 'fake16', s: 'xl', wait: 24, pause: 15 },
    { key: 'Drift Coefficient', id: 'fake17', s: 'xl', wait: 19, pause: 12 },
    { key: 'Signal Bleed', id: 'fake18', s: 'xl', wait: 15, pause: 9 },
    { key: 'Latent Signature', id: 'fake19', s: 'xl', wait: 12, pause: 7 },
    { key: 'Void Index', id: 'fake20', s: 'xl', wait: 9, pause: 5 },
    { key: 'Residual Authority', id: 'fake21', s: 'xl', wait: 7, pause: 4 },
    { key: 'Pattern Collapse', id: 'fake22', s: 'xl', wait: 6, pause: 3 },
    { key: 'Echo Depth', id: 'fake23', s: 'xl', wait: 5, pause: 3 },
    { key: 'Core Dissolution', id: 'fake24', s: 'xl', wait: 5, pause: 2 },
    { key: 'Presence Marker', id: 'fake25', s: 'xl', wait: 4, pause: 2 },
    { key: 'route_depth', id: 'route_depth', s: 'xl', wait: 4, pause: 2 },
];

const extraKeys = [
    'Fault Inheritance', 'Signal Loss', 'Archive Decay',
    'Contingency Flag', 'Null Directive', 'Spectral Index',
    'Erosion Rate', 'Phantom Linkage', 'Collapse Vector',
    'Memory Bleed', 'Guilt Signature', 'Fear Quotient',
    'Autonomy Deficit', 'Trace Residue', 'Void Coefficient',
    'Intent Decay', 'Presence Loss', 'Anchor Drift',
    'Recursion Depth', 'Echo Chamber Index', 'Compliance Failure',
    'Override Status', 'Consent Erosion', 'Identity Fracture',
    'Soul Debt', 'Narrative Collapse', 'Signal Death',
    'Pattern Loss', 'Authority Void', 'Core Absence',
];

const progressLabels = [
    'Collecting data', 'Identifying device', 'Geolocating',
    'Profiling session', 'Verifying network', 'Analyzing display',
    'Checking power', 'Reading languages', 'Enumerating hardware',
    'Mapping CPU', 'Checking memory', 'Analyzing color',
    'Measuring density', 'Reading input', 'Resolving ISP',
    'Mapping region', 'Geolocating postal', 'Reading currency',
    'Resolving codes', 'Measuring latency', 'Reading orientation',
    'Checking WebGL', 'Auditing storage', 'Reading cookies',
    'Enumerating plugins', 'Checking referrer', 'Reading viewport',
    'Checking history', 'Network status', 'Country data',
    'Population data', 'Power status', 'Logging timestamp',
    'Capturing agent', 'Resolving ASN', 'Deep scanning',
];


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCAN STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const totalDefinedRows = scanDefs.length;
const MAX_VISIBLE = CONFIG.scanLinesMaxVisible;
const scanContainer = document.getElementById('scanLines');

let rowIndex = 0;
let completedRows = 0;
let typewriterTriggered = false;
let dissolveTriggered = false;
let scanPaused = false;
let orphanedLineEl = null;
let conductorReady = false;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROGRESS BAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateProgress(n) {
    try {
        const pct = Math.min(Math.round(n / totalDefinedRows * 100), 100);
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressPct').textContent = pct + '%';
        document.getElementById('progressLabel').textContent =
            progressLabels[Math.min(n, progressLabels.length - 1)] || 'Deep scanning';
        if (pct >= 100) {
            setTimeout(() => {
                const bar = document.querySelector('.scan-progress');
                if (bar) bar.style.opacity = '0';
            }, CONFIG.progressHideDelay);
        }
    } catch (e) { }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOM HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeEllipsis() {
    const el = document.createElement('span');
    el.className = 'ellipsis';
    el.innerHTML = '<span></span><span></span><span></span>';
    return el;
}

function fakeVal() {
    const generators = [
        () => Math.random().toString(16).slice(2, 10).toUpperCase(),
        () => ['NULL', 'UNREGISTERED', 'NOT FOUND', 'FLAGGED', 'CLASSIFIED', 'EXPIRED',
            'DRIFTING', 'PARTIAL', 'INACTIVE', 'SEVERED', 'DEGRADED', 'MISMATCH']
        [Math.floor(Math.random() * 12)],
        () => (Math.random() * 10).toFixed(2) + ' / 10',
        () => Math.floor(Math.random() * 9999) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        () => ['0.' + Math.floor(Math.random() * 99), '1.00', '0.00'][Math.floor(Math.random() * 3)],
        () => ['ACTIVE', 'PASSIVE', 'MONITORED', 'WATCHING', 'PROCESSING'][Math.floor(Math.random() * 5)],
        () => '0x' + Math.random().toString(16).slice(2, 10).toUpperCase(),
    ];
    return generators[Math.floor(Math.random() * generators.length)]();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCAN ROW REVEAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function revealNextRow() {
    try {
        if (dissolveTriggered || scanPaused) return;

        let def, isExtra = false;
        if (rowIndex < scanDefs.length) {
            def = scanDefs[rowIndex];
        } else {
            isExtra = true;
            const key = extraKeys[(rowIndex - scanDefs.length) % extraKeys.length];
            def = { key, id: null, s: 0, wait: 6, pause: 200 };
        }
        rowIndex++;

        const line = document.createElement('div');
        line.className = `scan-line s${def.s}`;

        const keyEl = document.createElement('div');
        keyEl.className = 'scan-line-key';
        keyEl.textContent = def.key;

        const valEl = document.createElement('div');
        valEl.className = 'scan-line-val pending';
        valEl.id = `sv_${def.id}_${rowIndex}`;
        if (!isExtra) valEl.appendChild(makeEllipsis());
        else valEl.textContent = '...';

        const checkEl = document.createElement('div');
        checkEl.className = 'scan-line-check';
        checkEl.textContent = '✕';

        line.append(keyEl, valEl, checkEl);
        scanContainer.appendChild(line);

        while (scanContainer.children.length > MAX_VISIBLE) {
            scanContainer.removeChild(scanContainer.firstChild);
        }

        requestAnimationFrame(() => requestAnimationFrame(() => line.classList.add('active')));

        const startTime = Date.now();
        const hardMax = Math.max(def.wait, 4000);

        function tryPopulate() {
            if (dissolveTriggered || scanPaused) return;
            const val = isExtra ? fakeVal() : dataReady[def.id];
            const elapsed = Date.now() - startTime;
            const ready = (val !== undefined && elapsed >= def.wait) || elapsed >= hardMax;
            if (!isExtra && !ready) { setTimeout(tryPopulate, 40); return; }

            valEl.textContent = isExtra ? fakeVal() : (val ?? '—');
            valEl.classList.remove('pending');
            line.classList.add('done');

            if (def.id === 'route_depth') { line.classList.add('orphaned'); orphanedLineEl = line; }

            if (!isExtra) {
                completedRows++;
                updateProgress(completedRows);
                if (!typewriterTriggered && conductorReady && completedRows >= Math.floor(totalDefinedRows * 0.5)) {
                    typewriterTriggered = true;
                    setTimeout(startConductorSequence, 2300);
                }
            }
            setTimeout(revealNextRow, def.pause);
        }

        setTimeout(tryPopulate, Math.min(def.wait, 400));

    } catch (e) { console.error('revealNextRow error:', e); }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANIMATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function animXY(el, fromX, fromY, toX, toY, dur, ease, onDone) {
    const startTime = performance.now();
    function step(now) {
        let t = Math.min((now - startTime) / dur, 1);
        if (ease === 'out') t = 1 - Math.pow(1 - t, 3);
        if (ease === 'inout') t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        el.style.left = (fromX + (toX - fromX) * t) + 'px';
        el.style.top = (fromY + (toY - fromY) * t) + 'px';
        if (t < 1) requestAnimationFrame(step);
        else { el.style.left = toX + 'px'; el.style.top = toY + 'px'; if (onDone) onDone(); }
    }
    requestAnimationFrame(step);
}

function typeBeforeCursor(cursor, text, speed, onDone) {
    let i = 0;
    const interval = setInterval(() => {
        if (i < text.length) cursor.insertAdjacentText('beforebegin', text[i++]);
        else { clearInterval(interval); if (onDone) setTimeout(onDone, 0); }
    }, speed);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TERMINAL BAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showTermBar(onDone) {
    const bar = document.getElementById('termBar');
    const line = document.getElementById('termLine');
    bar.classList.add('visible');
    line.innerHTML = '';
    const cursor = document.createElement('span');
    cursor.className = 'term-cursor';
    line.appendChild(cursor);
    const parts = [
        { text: 'incoming connection... ', delay: 500 },
        { text: 'routing through proxy chain... ', delay: 800 },
        { text: 'identity masked — ', delay: 600 },
        { text: 'ANONYMOUS USER CONNECTED', delay: 400 },
    ];
    let t = 0;
    parts.forEach(p => { t += p.delay; setTimeout(() => cursor.insertAdjacentText('beforebegin', p.text), t); });
    t += 600;
    setTimeout(() => { if (onDone) onDone(); }, t);
}

function termType(code, response, speed, onDone) {
    const line = document.getElementById('termLine');
    line.innerHTML = '';
    const prompt = document.createElement('span');
    prompt.style.cssText = 'color:#2a6a2a;font-size:0.65rem;letter-spacing:0.05em;margin-right:8px;';
    prompt.textContent = 'root@bsi ~$';
    line.appendChild(prompt);
    const cursor = document.createElement('span');
    cursor.className = 'term-cursor';
    line.appendChild(cursor);
    let i = 0;
    const interval = setInterval(() => {
        if (i < code.length) cursor.insertAdjacentText('beforebegin', code[i++]);
        else {
            clearInterval(interval);
            setTimeout(() => {
                if (response) {
                    const resp = document.createElement('span');
                    resp.style.cssText = 'color:#888;font-size:0.6rem;margin-left:16px;';
                    resp.textContent = '→ ' + response;
                    line.appendChild(resp);
                }
                if (onDone) setTimeout(onDone, response ? 500 : 0);
            }, 200);
        }
    }, speed || 55);
}

function termShowSpeed(val) {
    const line = document.getElementById('termLine');
    line.innerHTML = '';
    const span = document.createElement('span');
    span.style.cssText = 'color:#ffaa44;font-size:0.65rem;letter-spacing:0.06em;';
    span.textContent = 'session.reverse_speed: ' + val;
    line.appendChild(span);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HAND DRAG BOX
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handDragBox(onDone) {
    const hand = document.getElementById('handImg');
    const box = document.getElementById('drawnBox');

    const boxStartX = W * CONFIG.drawnBoxLeft / 100;
    const boxStartY = H * CONFIG.drawnBoxTop / 100;
    const boxEndX = W * 0.97;
    const boxEndY = H * 0.72;
    const tipX = 36, tipY = 76;

    Object.assign(box.style, { position: 'fixed', left: boxStartX + 'px', top: boxStartY + 'px', width: '0px', height: '0px', opacity: '0', zIndex: '50' });
    Object.assign(hand.style, { position: 'fixed', left: (W + 20) + 'px', top: (boxStartY - tipY) + 'px', opacity: '0', transition: 'opacity 0.5s ease', zIndex: '201' });

    setTimeout(() => {
        hand.style.opacity = '0.9';
        animXY(hand, W + 20, boxStartY - tipY, boxStartX - tipX, boxStartY - tipY, 950, 'out', () => {
            setTimeout(() => {
                box.style.opacity = '1';
                const dragDur = 1200;
                const dragStart = performance.now();
                function dragFrame(now) {
                    let t = Math.min((now - dragStart) / dragDur, 1);
                    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                    const cx = boxStartX + (boxEndX - boxStartX) * t;
                    const cy = boxStartY + (boxEndY - boxStartY) * t;
                    box.style.width = (cx - boxStartX) + 'px';
                    box.style.height = (cy - boxStartY) + 'px';
                    hand.style.left = (cx - tipX) + 'px';
                    hand.style.top = (cy - tipY) + 'px';
                    if (t < 1) { requestAnimationFrame(dragFrame); }
                    else {
                        box.style.width = (boxEndX - boxStartX) + 'px';
                        box.style.height = (boxEndY - boxStartY) + 'px';
                        setTimeout(() => {
                            animXY(hand, boxEndX - tipX, boxEndY - tipY, W + 20, boxEndY - tipY, 800, 'inout', () => {
                                hand.style.opacity = '0';
                                if (onDone) onDone();
                            });
                        }, 250);
                    }
                }
                requestAnimationFrame(dragFrame);
            }, 200);
        });
    }, 300);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REVERSE ANIMATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function doReverse(onDone) {
    const container = document.getElementById('scanLines');
    const wrap = document.getElementById('scanLinesWrap');

    Object.assign(wrap.style, { position: '', top: '', left: '', width: '', height: 'calc(100vh - 140px)', overflow: 'visible', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 0 20px' });
    container.innerHTML = '';
    container.style.gap = '3px';
    container.style.transform = '';
    container.style.transition = '';
    document.getElementById('orphanOverlay')?.remove();

    const rewindData = [
        ['ASN', dataReady['asn'] || '—'],
        ['User Agent', (dataReady['ua'] || '—').slice(0, 30) + '...'],
        ['Timestamp', dataReady['time'] || '—'],
        ['Network', dataReady['online'] || '—'],
        ['History', dataReady['history_len'] || '—'],
        ['Viewport', dataReady['viewport'] || '—'],
        ['Referrer', dataReady['ref'] || '—'],
        ['Plugins', dataReady['plugins'] || '—'],
        ['Cookies', dataReady['cookies'] || '—'],
        ['Storage', dataReady['storage'] || '—'],
        ['WebGL', dataReady['webgl'] || '—'],
        ['Orientation', dataReady['orient'] || '—'],
        ['RTT', dataReady['rtt'] || '—'],
        ['Calling', dataReady['calling'] || '—'],
        ['Currency', dataReady['currency'] || '—'],
        ['Postal', dataReady['postal'] || '—'],
        ['Region', dataReady['region'] || '—'],
        ['ISP', dataReady['isp'] || '—'],
        ['Touch', dataReady['touch'] || '—'],
        ['DPR', dataReady['dpr'] || '—'],
        ['Color', dataReady['depth'] || '—'],
        ['Memory', dataReady['mem'] || '—'],
        ['Cores', dataReady['cores'] || '—'],
        ['Platform', dataReady['platform'] || '—'],
        ['Language', dataReady['langs'] || '—'],
        ['Battery', dataReady['bat'] || '—'],
        ['Display', dataReady['disp'] || '—'],
        ['Connection', dataReady['conn'] || '—'],
        ['Device', dataReady['dev'] || '—'],
        ['Timezone', dataReady['tz'] || '—'],
        ['Death Drive Acquisition', 'NULL'],
        ['Soul Index', 'UNREGISTERED'],
        ['Consent Timestamp', 'NOT FOUND'],
        ['Memory Checksum', 'MISMATCH'],
        ['Behavioral Signature', 'FLAGGED'],
        ['Identity Anchor', 'DRIFTING'],
        ['Compliance Token', 'EXPIRED'],
        ['Threat Vector', 'UNKNOWN'],
        ['Shadow Profile', 'PARTIAL'],
        ['Loyalty Coefficient', '0.34'],
        ['Conscience Override', 'INACTIVE'],
        ['Last Known Intent', 'CLASSIFIED'],
        ['Origin Trace', 'SEVERED'],
        ['Anomaly Score', '7.4 / 10'],
        ['Narrative Coherence', 'DEGRADED'],
        ['Location', dataReady['loc'] || '—'],
        ['IP Address', dataReady['ip'] || '—'],
    ];

    const total = rewindData.length;
    let idx = 0;
    const speedSteps = [1.0, 0.88, 0.74, 0.61, 0.49, 0.38, 0.28, 0.20, 0.13, 0.08, 0.04, 0.01, 0.00];
    let lastSpeedIdx = 0;

    function makeRow(key, val, isOrphan, progress) {
        const fontSize = isOrphan ? 1.35 : (0.3 + progress * 1.1);
        const keySize = isOrphan ? 0.68 : (0.24 + progress * 0.32);
        const opacity = isOrphan ? 1 : Math.max(0.15 + progress * 0.85, 0.15);
        const xNudge = isOrphan ? 0 : (Math.random() * 8);

        const line = document.createElement('div');
        Object.assign(line.style, {
            display: 'flex', alignItems: 'baseline', gap: '14px',
            paddingLeft: isOrphan ? CONFIG.scanLinesLeftPadding : `calc(${CONFIG.scanLinesLeftPadding} + ${xNudge}vw)`,
            paddingRight: '2vw',
            paddingTop: isOrphan ? '6px' : '1px',
            paddingBottom: isOrphan ? '6px' : '1px',
            whiteSpace: 'nowrap', overflow: 'visible', flexShrink: '0', opacity,
        });
        if (isOrphan) { line.style.background = 'rgba(232,55,42,0.06)'; line.style.width = '100%'; }

        const keyEl = document.createElement('span');
        Object.assign(keyEl.style, { fontFamily: "'Space Grotesk',sans-serif", fontSize: keySize + 'rem', letterSpacing: '0.15em', color: isOrphan ? 'var(--red)' : 'var(--muted)', textTransform: 'uppercase', fontWeight: '500', minWidth: '90px', flexShrink: '0' });
        keyEl.textContent = key;

        const valEl = document.createElement('span');
        Object.assign(valEl.style, { fontFamily: "'Space Mono',monospace", fontSize: fontSize + 'rem', color: isOrphan ? 'var(--red)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis' });
        if (isOrphan) { valEl.style.borderLeft = '3px solid var(--red)'; valEl.style.paddingLeft = '10px'; }
        valEl.textContent = val;

        line.append(keyEl, valEl);
        return { line, keyEl, valEl };
    }

    function addRow() {
        if (idx >= total) { addOrphanRow(); return; }

        const [key, val] = rewindData[idx];
        const progress = idx / total;
        const { line } = makeRow(key, val, false, progress);
        container.appendChild(line);

        while (container.children.length > 18) container.removeChild(container.firstChild);

        idx++;

        const speedIdx = Math.floor(progress * speedSteps.length);
        if (speedIdx > lastSpeedIdx) {
            lastSpeedIdx = speedIdx;
            termShowSpeed(speedSteps[Math.min(speedIdx, speedSteps.length - 1)].toFixed(2) + 'x');
        }

        document.getElementById('progressFill').style.width = Math.round(100 - progress * 55) + '%';
        document.getElementById('progressLabel').textContent = 'REVERSING';

        setTimeout(addRow, 25 + Math.pow(progress, 3) * 975);
    }

    function addOrphanRow() {
        while (container.children.length > 7) container.removeChild(container.firstChild);
        const { line, keyEl, valEl } = makeRow('route_depth', 'orphaned', true, 1);
        container.appendChild(line);
        orphanedLineEl = line;
        orphanedLineEl._valEl = valEl;
        orphanedLineEl._keyEl = keyEl;
        termShowSpeed('0.00x');
        document.getElementById('progressLabel').textContent = 'HALTED';
        document.getElementById('progressFill').style.width = '45%';
        if (onDone) setTimeout(onDone, 800);
    }

    addRow();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HAND FIX
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handFixLine(targetLine, onDone) {
    const hand = document.getElementById('handImgFlipped');
    const lineRect = targetLine.getBoundingClientRect();
    const valEl = targetLine._valEl || targetLine.querySelector('.scan-line-val') || targetLine.querySelector('div:last-child');
    const tipX = 36, tipY = 76;
    const targetX = lineRect.left + 120 - tipX;
    const targetY = lineRect.top + lineRect.height / 2 - tipY;

    Object.assign(hand.style, { position: 'fixed', left: '-180px', top: targetY + 'px', opacity: '0', transition: 'opacity 0.4s ease', zIndex: '201' });

    setTimeout(() => {
        hand.style.opacity = '0.85';
        animXY(hand, -180, targetY, targetX, targetY, 900, 'out', () => {
            setTimeout(() => {
                let text = valEl.textContent;
                const deleteInterval = setInterval(() => {
                    if (text.length > 0) { text = text.slice(0, -1); valEl.textContent = text; }
                    else {
                        clearInterval(deleteInterval);
                        targetLine.classList.remove('orphaned');
                        let i = 0;
                        const typeInterval = setInterval(() => {
                            if (i < 'resolved'.length) { valEl.textContent += 'resolved'[i++]; }
                            else {
                                clearInterval(typeInterval);
                                Object.assign(valEl.style, { color: 'var(--green)', borderLeftColor: 'var(--green)', background: 'rgba(0,200,83,0.08)' });
                                const keyEl = targetLine._keyEl || targetLine.querySelector('div:first-child');
                                if (keyEl) keyEl.style.color = 'var(--green)';
                                setTimeout(() => {
                                    animXY(hand, targetX, targetY, -180, targetY, 700, 'inout', () => {
                                        hand.style.opacity = '0';
                                        if (onDone) onDone();
                                    });
                                }, 600);
                            }
                        }, 90);
                    }
                }, 55);
            }, 700);
        });
    }, 200);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONDUCTOR SEQUENCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function startConductorSequence() {
    showTermBar(() => {
        setTimeout(() => {
            handDragBox(() => {
                const t1 = document.getElementById('twText1');
                const cursor1 = document.createElement('span');
                cursor1.className = 'cursor';
                t1.appendChild(cursor1);

                setTimeout(() => {
                    typeBeforeCursor(cursor1, 'I know why you are here.', 82, () => {
                        cursor1.insertAdjacentHTML('beforebegin', '<br><br>');
                        cursor1.remove();
                        setTimeout(() => {
                            const t2 = document.getElementById('twText2');
                            const cursor2 = document.createElement('span');
                            cursor2.className = 'cursor';
                            t2.appendChild(cursor2);
                            setTimeout(() => {
                                typeBeforeCursor(cursor2, 'Let me help you. You seem lost.', 75, () => {
                                    cursor2.remove();
                                    setTimeout(() => {
                                        termType('session.pause()', 'execution halted — all processes frozen', 70, () => {
                                            document.getElementById('vhsOverlay').classList.add('active');
                                            document.getElementById('scanPhase').classList.add('vhs');
                                            scanPaused = true;
                                            setTimeout(() => {
                                                termType('session.reverse()', null, 70, () => {
                                                    document.getElementById('progressLabel').textContent = 'REVERSING';
                                                    doReverse(() => {
                                                        termShowSpeed('0.00x');
                                                        setTimeout(() => {
                                                            if (!orphanedLineEl) { setTimeout(triggerDissolve, 2000); return; }
                                                            orphanedLineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                            document.getElementById('vhsOverlay').classList.remove('active');
                                                            document.getElementById('scanPhase').classList.remove('vhs');
                                                            setTimeout(() => {
                                                                termType('session.set(route_depth, "resolved")', 'patching entry point...', 65, () => {
                                                                    setTimeout(() => {
                                                                        orphanedLineEl.scrollIntoView({ block: 'center' });
                                                                        handFixLine(orphanedLineEl, () => {
                                                                            document.getElementById('progressFill').classList.add('green');
                                                                            document.getElementById('progressLabel').textContent = 'RESOLVED';
                                                                            termType('session.resume()', 'route_depth resolved — access pathway open', 65, () => {
                                                                                setTimeout(() => {
                                                                                    const t3 = document.getElementById('twText3');
                                                                                    const cursor3 = document.createElement('span');
                                                                                    cursor3.className = 'cursor';
                                                                                    t3.insertAdjacentHTML('beforeend', '<br>');
                                                                                    setTimeout(() => {
                                                                                        t3.insertAdjacentHTML('beforeend', '<br>');
                                                                                        t3.appendChild(cursor3);
                                                                                        setTimeout(() => {
                                                                                            typeBeforeCursor(cursor3, 'Try again', 110, () => {
                                                                                                setTimeout(() => cursor3.insertAdjacentText('beforebegin', '.'), 400);
                                                                                                setTimeout(() => cursor3.insertAdjacentText('beforebegin', '.'), 900);
                                                                                                setTimeout(() => cursor3.insertAdjacentText('beforebegin', '.'), 1500);
                                                                                                setTimeout(() => { cursor3.remove(); setTimeout(triggerDissolve, 1800); }, 2400);
                                                                                            });
                                                                                        }, 500);
                                                                                    }, 600);
                                                                                }, 1200);
                                                                            });
                                                                        });
                                                                    }, 1200);
                                                                });
                                                            }, 600);
                                                        }, 600);
                                                    });
                                                });
                                            }, 2500);
                                        });
                                    }, 4000);
                                });
                            }, 400);
                        }, 500);
                    });
                }, 1500);
            });
        }, 800);
    });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DISSOLVE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function triggerDissolve() {
    dissolveTriggered = true;
    document.getElementById('orphanOverlay')?.remove();

    termType('terminate()', 'session closed', 65, () => {
        setTimeout(() => document.getElementById('termBar').classList.remove('visible'), 600);
    });

    [document.querySelector('.scan-left'), document.querySelector('.scan-right'), document.getElementById('drawnBox')]
        .forEach(el => { if (!el) return; el.style.transition = 'opacity 2s ease'; el.style.opacity = '0'; });

    // Step 1 — move globe and wordmark to center
    setTimeout(() => {
        const header = document.querySelector('.scan-header');
        if (header) { header.style.left = '50%'; header.style.top = '50%'; }
        window.startGlobeMove(50, 50);
    }, 500);

    // Step 2 — lift wordmark up
    setTimeout(() => {
        const header = document.querySelector('.scan-header');
        if (header) header.style.top = '12%';
    }, 3100);

    // Step 3 — show ARG registration prompt instead of immediately drawing pin lines.
    // Pin lines draw after the player registers or uploads their card.
    setTimeout(() => {
        showArgRegistration();
    }, 5500);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOGIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

function attemptLogin() {
    const password = document.getElementById('password').value.trim();

    // DEV SHORTCUT — remove before launch
    if (password.toLowerCase() === 'wawamangosmoothie') {
        localStorage.setItem('baw_gate_passed', 'true');
        document.getElementById('loginPhase').style.display = 'none';
        const scanPhase = document.getElementById('scanPhase');
        scanPhase.style.display = 'flex';
        scanPhase.style.opacity = '1';
        conductorReady = true;
        triggerDissolve();
        return;
    }

    if (password.toLowerCase() !== ACCESS_CODE) {
        showMsg('Invalid credentials. This attempt has been logged.', 'error');
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
        return;
    }

    localStorage.setItem('baw_gate_passed', 'true');

    const loginPhase = document.getElementById('loginPhase');
    loginPhase.style.transition = 'opacity 0.6s ease';
    loginPhase.style.opacity = '0';

    setTimeout(() => {
        CITY.stop();
        document.getElementById('cityCanvas').style.display = 'none';
        playSecuredFlash(() => {
            loginPhase.style.display = 'none';
            const scanPhase = document.getElementById('scanPhase');
            scanPhase.style.display = 'flex';
            scanPhase.style.opacity = '0';
            scanPhase.style.transition = 'opacity 2s ease';
            document.querySelector('.scan-lines-wrap').style.opacity = '0';
            document.querySelector('.scan-progress').style.opacity = '0';
            document.querySelector('.scan-right').style.opacity = '0';
            setTimeout(() => { scanPhase.style.opacity = '1'; }, 100);
            setTimeout(() => {
                document.querySelector('.scan-lines-wrap').style.transition = 'opacity 1.5s ease';
                document.querySelector('.scan-progress').style.transition = 'opacity 1.5s ease';
                document.querySelector('.scan-right').style.transition = 'opacity 1.5s ease';
                document.querySelector('.scan-lines-wrap').style.opacity = '1';
                document.querySelector('.scan-progress').style.opacity = '1';
                document.querySelector('.scan-right').style.opacity = '1';
                conductorReady = true;
                setTimeout(revealNextRow, 800);
            }, 3000);
        });
    }, 700);
}

function showMsg(text, type) {
    const el = document.getElementById('msg');
    el.textContent = text;
    el.className = type;
}



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECURED FLASH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The word "SECURED" flickers in like a light turning on,
// sends out expanding rectangular ripples, holds briefly,
// then flickers out.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function playSecuredFlash(onComplete) {
    const flash   = document.getElementById('securedFlash');
    const word    = document.getElementById('securedWord');
    const ripples = document.getElementById('securedRipples');

    // Make the flash container visible (it sits on the cream background)
    // We flip it to dark mode just for this moment
    flash.style.background = 'transparent';
    word.style.color       = 'var(--ink)';
    word.style.borderColor = 'var(--ink)';

    // ── Ripple helper ──
    // Spawns a rectangle that expands from the word's position and fades out
    function spawnRipple(delay, scale = 1) {
        setTimeout(() => {
            const rect   = word.getBoundingClientRect();
            const cx     = rect.left + rect.width  / 2;
            const cy     = rect.top  + rect.height / 2;
            const startW = rect.width;
            const startH = rect.height;

            const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            el.setAttribute('x',      cx - startW / 2);
            el.setAttribute('y',      cy - startH / 2);
            el.setAttribute('width',  startW);
            el.setAttribute('height', startH);
            el.setAttribute('fill',   'none');
            el.setAttribute('stroke', 'var(--ink)');
            el.setAttribute('stroke-width', '0.8');
            el.setAttribute('opacity', '0.6');
            ripples.appendChild(el);

            const dur     = 1200;
            const maxW    = Math.max(window.innerWidth, window.innerHeight) * 2.4 * scale;
            const maxH    = maxW * (startH / startW);
            const start   = performance.now();

            function animRipple(ts) {
                const t      = Math.min((ts - start) / dur, 1);
                const eased  = 1 - Math.pow(1 - t, 2);
                const curW   = startW + (maxW - startW) * eased;
                const curH   = startH + (maxH - startH) * eased;
                const alpha  = 0.6 * (1 - t);

                el.setAttribute('x',       cx - curW / 2);
                el.setAttribute('y',       cy - curH / 2);
                el.setAttribute('width',   curW);
                el.setAttribute('height',  curH);
                el.setAttribute('opacity', alpha);

                if (t < 1) requestAnimationFrame(animRipple);
                else el.remove();
            }
            requestAnimationFrame(animRipple);
        }, delay);
    }

    // ── Flicker in ──
    const flickerIn = [0, 60, 120, 80, 160, 0, 200];
    let t = 0;
    flickerIn.forEach((dur, i) => {
        setTimeout(() => { flash.style.opacity = i % 2 === 0 ? '1' : '0'; }, t);
        t += dur;
    });

    // ── Ripples spawn on impact ──
    spawnRipple(t,       1.0);
    spawnRipple(t + 80,  0.7);
    spawnRipple(t + 180, 0.5);
    spawnRipple(t + 320, 0.35);

    // ── Hold ──
    const holdEnd = t + 900;

    // ── Flicker out ──
    const flickerOut = [0, 50, 100, 60, 140, 0, 180];
    let t2 = holdEnd;
    flickerOut.forEach((dur, i) => {
        setTimeout(() => { flash.style.opacity = i % 2 === 0 ? '0' : '1'; }, t2);
        t2 += dur;
    });

    // ── Callback after flash is gone ──
    setTimeout(() => {
        flash.style.opacity = '0';
        if (onComplete) onComplete();
    }, t2 + 100);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INITIATION SEQUENCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Called on first visit only. Plays honeycomb → flash →
// then shows the login card.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function playInitiationSequence(onComplete) {
    // Hide login to start — it fades in after the swoop lands
    const login = document.getElementById('loginPhase');
    login.style.opacity = '0';
    login.style.pointerEvents = 'none';

    // Bring city canvas above everything so the black intro and
    // swoop play over the top of all UI layers
    const cityCanvas = document.getElementById('cityCanvas');
    cityCanvas.style.zIndex = '500';

    CITY.start();

    // After the swoop lands, step city canvas behind the login card
    // so the player can see and interact with the input
    // Keep this in sync with CAM_SWOOP_DUR in the CITY module
    const SWOOP_DUR = 7500;

    setTimeout(() => {
        cityCanvas.style.zIndex = '18';
    }, SWOOP_DUR);

    // Show login a moment after the swoop ends
    setTimeout(() => {
        login.style.transition = 'opacity 1.4s ease';
        login.style.opacity = '1';
        login.style.pointerEvents = 'all';
        const pw = document.getElementById('password');
        if (pw) pw.focus();
        if (onComplete) onComplete();
    }, SWOOP_DUR + 200);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ARG BACKEND — SESSION & REGISTRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BACKEND_URL = 'http://localhost:5000';

async function argApiFetch(path, method = 'GET', body = null) {
    const opts = {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    try {
        const res  = await fetch(BACKEND_URL + path, opts);
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
    } catch (err) {
        return { ok: false, status: 0, data: { error: '—' } };
    }
}

// ── Session check on load ──
function checkSessionState() {
    const gatePassed = localStorage.getItem('baw_gate_passed');
    const registered = localStorage.getItem('baw_registered');

    if (!gatePassed) {
        // First time visitor — play the full black screen + swoop intro
        playInitiationSequence();
        return;
    }

    // Returning visitor — accents show immediately, no swoop intro
    document.body.classList.add('accents-ready');

    // City plays in the background at normal z-index
    const cityCanvas = document.getElementById('cityCanvas');
    cityCanvas.style.zIndex = '18';
    CITY.start();

    // Skip straight to the post-sequence state
    const login = document.getElementById('loginPhase');
    login.style.opacity = '0';
    login.style.pointerEvents = 'none';

    if (window.startGlobeMove) window.startGlobeMove(50, 50);
    const header = document.querySelector('.scan-header');
    if (header) { header.style.left = '50%'; header.style.top = '12%'; }

    if (registered) {
        setTimeout(showArgCardPrompt, 400);
    } else {
        setTimeout(showArgRegistration, 400);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkSessionState();
});

// ── Show registration prompt ──
function showArgRegistration() {
    const cardPrompt = document.getElementById('argCardPrompt');
    if (cardPrompt) cardPrompt.classList.remove('visible');

    const prompt = document.getElementById('argRegPrompt');
    if (!prompt) return;
    prompt.classList.add('visible');

    setTimeout(() => {
        const input = document.getElementById('argUsername');
        if (!input || input.dataset.listenerAdded) return;
        input.dataset.listenerAdded = 'true';
        input.focus();
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); argRegister(); }
        });
    }, 600);
}

// ── Show card prompt ──
function showArgCardPrompt() {
    const regPrompt = document.getElementById('argRegPrompt');
    if (regPrompt) regPrompt.classList.remove('visible');

    const prompt = document.getElementById('argCardPrompt');
    if (!prompt) return;
    prompt.classList.add('visible');
}

// Switch from card prompt to registration
function argSwitchToRegister() {
    localStorage.removeItem('baw_registered');
    localStorage.removeItem('baw_username');
    const cardPrompt = document.getElementById('argCardPrompt');
    if (cardPrompt) {
        cardPrompt.classList.remove('visible');
        cardPrompt.classList.add('fading');
        setTimeout(() => cardPrompt.classList.remove('fading'), 1000);
    }
    setTimeout(showArgRegistration, 300);
}

// Skip to registration without sequence
function skipToRegistration() {
    const login = document.getElementById('loginPhase');
    if (login) { login.style.transition = 'none'; login.style.opacity = '0'; login.style.pointerEvents = 'none'; }
    if (window.startGlobeMove) window.startGlobeMove(50, 50);
    const header = document.querySelector('.scan-header');
    if (header) { header.style.left = '50%'; header.style.top = '12%'; }
    setTimeout(showArgRegistration, 400);
}

function skipToCardPrompt() {
    const login = document.getElementById('loginPhase');
    if (login) { login.style.transition = 'none'; login.style.opacity = '0'; login.style.pointerEvents = 'none'; }
    if (window.startGlobeMove) window.startGlobeMove(50, 50);
    const header = document.querySelector('.scan-header');
    if (header) { header.style.left = '50%'; header.style.top = '12%'; }
    setTimeout(showArgCardPrompt, 400);
}

// ── Register ──
async function argRegister() {
    const input    = document.getElementById('argUsername');
    const btn      = document.getElementById('argRegBtn');
    const btnText  = document.getElementById('argRegBtnText');
    const sub      = document.getElementById('argRegSub');
    const username = input ? input.value.trim() : '';

    if (!username) { argSetMsg('—', 'error', 'argRegMsg'); return; }

    btn.disabled = true;
    if (btnText) btnText.textContent = '...';
    if (sub) sub.style.opacity = '0';

    const { ok, data } = await argApiFetch('/auth/register', 'POST', { username });

    if (!ok) {
        argSetMsg(data.error || '—', 'error', 'argRegMsg');
        btn.disabled = false;
        if (btnText) btnText.textContent = '→';
        if (sub) sub.style.opacity = '0.4';
        return;
    }

    localStorage.setItem('baw_registered', 'true');
    localStorage.setItem('baw_username', username);

    argSetMsg('—', 'success', 'argRegMsg');

    setTimeout(async () => {
        await argDownloadCard();
        setTimeout(() => argFadeOutAndProceed('argRegPrompt'), 1200);
    }, 400);
}

// ── Upload card ──
async function argUploadCard(input) {
    const file = input.files[0];
    if (!file) return;

    argSetMsg('—', 'info', 'argCardMsg');

    const formData = new FormData();
    formData.append('card', file);

    try {
        const res  = await fetch(BACKEND_URL + '/card/upload', {
            method: 'POST', credentials: 'include', body: formData,
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('baw_username', data.username);
            argSetMsg('', 'success', 'argCardMsg');
            setTimeout(() => argFadeOutAndProceed('argCardPrompt'), 1000);
        } else {
            argSetMsg('—', 'error', 'argCardMsg');
        }
    } catch (e) {
        argSetMsg('—', 'error', 'argCardMsg');
    }
    input.value = '';
}

// ── Download card ──
async function argDownloadCard() {
    try {
        const res = await fetch(`${BACKEND_URL}/card/download?t=${Date.now()}`, {
            method: 'GET', credentials: 'include',
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'bawsome_card';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
}

// ── Fade out prompt and draw pin lines ──
function argFadeOutAndProceed(promptId) {
    const prompt = document.getElementById(promptId);
    if (prompt) {
        prompt.classList.remove('visible');
        prompt.classList.add('fading');
    }
    setTimeout(() => {
        if (window.startPinLines) window.startPinLines();
        if (prompt) prompt.style.display = 'none';
    }, 1200);
}

// ── Message helper ──
function argSetMsg(text, type, elId) {
    const el = document.getElementById(elId || 'argRegMsg');
    if (!el) return;
    el.textContent = text;
    el.className   = 'arg-minimal-msg ' + type;
}
