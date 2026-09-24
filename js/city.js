/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   city.js — HEX CITY intro (Three.js via three-loader.js); returning
             visitors skip straight to the cruise

   Phases:  pre → wave → hold → swoop → cruise
     pre     black screen, bird's-eye camera
     wave    floor hexes pop in along a diagonal; intro music fades in
     hold    short pause
     swoop   camera drops and tilts forward, background fades to cream;
             at LOGIN_AT the passphrase box is revealed (onLoginReveal)
     cruise  endless flight along a winding path through recycled rows of
             hexes, swooping like a bird: diving between pillars, skimming
             over low blocks, passing under bridges. Pillars rise ahead;
             the path is kept clear, so nothing is ever hit.

   CITY.start()              session.js (from the "click to begin" click)
   CITY.onLoginReveal        session.js sets it
   CITY.toBackground()       drop the canvas behind the login box
   CITY.corruptEffect()      login.js, wrong passphrase: geometry glitches
   CITY.fadeOutMusic(done)   login.js, correct passphrase: the camera pulls
                             up and away as the music fades
   CITY.stop()               login.js, after the music has faded

   Tuned in the mockup (baw.os-backend/mockups/hexcity).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CITY = (() => {

    /* ── GRID ─────────────────────────────────────────────── */
    const R   = 1.0;                // hex radius
    const GAP = 0.04;               // gap between hexes
    const CW  = R * 1.5;            // column spacing
    const RH  = R * Math.sqrt(3);   // row spacing

    const COLS           = 56;      // wide: the path swings side to side
    const POOL_ROWS      = 80;      // rows kept in memory, recycled as the camera moves
    // Looking straight down at the start, the camera sees ~12 units behind it: rows, drawing
    // and the pop-in wave all reach past that, or the bottom of the screen starts empty
    const ROWS_BACK      = 10;      // rows behind the start position
    const RECYCLE_BEHIND = 17;      // recycle a row once it's this far behind the camera
    const WAVE_ZONE_Z    = 18;      // rows within this distance take part in the pop-in wave

    /* ── TIMING / CAMERA ──────────────────────────────────── */
    const CAM_Y0     = 16;          // bird's-eye height
    const PITCH_DOWN = -Math.PI / 2;
    const SWOOP_DUR  = 7.0;
    const SPEED      = 3.2;         // forward speed (units/sec)

    const WAVE_DELAY = 3.0;
    const WAVE_SPD   = 14.0;
    const POP_H      = 0.5;
    const POP_DUR    = 0.45;
    const HOLD_DUR   = 0.9;
    const LOGIN_AT   = 0.88;        // swoop progress at which the login box appears

    const BG_BLACK = 0x000000;
    const BG_CREAM = 0xf5f2ec;

    /* ── THE PATH ─────────────────────────────────────────────
       A winding centre line, x as a function of z: layered sines with random
       phases, so it's smooth, endless and never repeats. The height is laid
       along it the same way, so each dive and climb is a place in the city.
       [amplitude, wavelength] in world units. */
    const PATH_WAVES  = [[7, 90], [3, 48]];
    const PATH_W      = 1.9;        // clear either side of the centre line (measured square to it)
    const LOOK        = 14;         // the camera aims at the path this far ahead (further = smoother)
    const Y_WAVES     = [[3.4, 56], [1.0, 34]];     // the swoop: about 1.5 – 10.5; pillars reach 9
    const Y_BASE      = 6.0;
    const Y_MIN       = 1.5;
    const NOSE        = 0.8;        // how much the nose tips into a dive / out of it
    const START_CLEAR = 20;         // no blocks, bridges or near misses this near the start
    const GLIDE       = 0.15;       // a little faster low in a dive, slower at the top

    /* ── CAMERA FEEL ──────────────────────────────────────────
       The turn, nose and roll ease towards where they're headed over these
       many seconds, so nothing quick ever reaches the screen; roll is capped. */
    const PITCH_BASE = -0.06;       // slightly down, to see the city
    const BANK_AMT   = 0.9;         // roll per unit of turn rate
    const EASE_TURN  = 0.6;
    const EASE_BANK  = 1.0;
    const BANK_MAX   = 0.3;

    /* ── PILLARS ──────────────────────────────────────────── */
    const PIL_PROB   = 0.22;        // chance a hex is a pillar
    const CROWD      = 0.56;        // …beside the path (within CROWD_BAND of its edge)
    const CROWD_BAND = 2.6;
    const PIL_MIN    = 0.8;
    const PIL_MAX    = 9.0;
    const PIL_TRIG   = 42.0;        // start rising when this far ahead
    const PIL_DUR    = 2.2;
    const PIL_STAG   = 0.03;        // rise delay per unit of distance
    const SETTLE     = 0.9;         // overshoot on the rise (~3%), then settle
    // Low blocks ON the path, where the camera's high enough to clear them by LOW_HEAD:
    // likelier the higher it flies there
    const LOW_HEAD   = 1.3;
    const LOW_MIN    = 0.6;
    // Bridges across the path at the bottom of dives, between two towers, BRIDGE_HEAD
    // above the camera there; at most one per BRIDGE_GAP
    const BRIDGE_HEAD  = 1.3;
    const BRIDGE_UNDER = 5;
    const BRIDGE_GAP   = 12;
    const BRIDGE_THICK = 0.7;
    const BRIDGE_DEPTH = 1.3;       // fits inside a hex (1.66 across), so its ends stay buried in the towers
    // Near misses: now and then a tall pillar just inside the path's edge, one side
    const GRAZE_GAP  = 60;
    const GRAZE_PROB = 0.12;
    const GRAZE_D    = 1.25;

    const DD_AHEAD  = 72;           // draw distance
    const DD_BEHIND = 17;
    const FOG_NEAR  = 24;

    /* ── LOOK ─────────────────────────────────────────────── */
    const C_FLOOR    = 0xd0ccc4;
    const C_PIL_TOP  = 0xede8df;
    const C_PIL_SIDE = 0xb0aca4;
    const LIGHT      = [-0.55, 0.85];   // sides facing this way (x, z) are lightest
    const TINT_FLOOR = 0.035;       // each hex a little lighter or darker than the next
    const TINT_PIL   = 0.05;
    const HEIGHT_LIGHT = 0.08;      // tallest pillars this much lighter than the shortest
    const SHADOW_PER    = 0.055;    // contact shadows: floor darkened per pillar beside it…
    const SHADOW_BRIDGE = 0.1;      // …under a bridge…
    const SHADOW_MAX    = 0.16;     // …at most
    const HAZE_DIR  = [-0.35, -0.94];            // a faint warm haze low on the horizon, ahead and a little left
    const HAZE_WARM = [1, 0.93, 0.85];
    const HAZE_AMT  = 0.7;

    /* ── WRONG-PASSPHRASE GLITCH ──────────────────────────── */
    const CORRUPT_DUR = 0.9;        // seconds

    /* ── SKY STREAKS ──────────────────────────────────────────
       Red rectangles far overhead: each starts well behind the camera (out of
       view), eases in as it passes overhead, races ahead faster than the camera
       and thins away towards the horizon; then waits and comes round again. */
    const STREAK_COUNT   = 4;
    const STREAK_DELAY   = 1.0;         // seconds into the cruise
    const SKY_Y          = [18, 30];
    const SKY_SPREAD     = 16;          // sideways (±)
    const SKY_FAR        = 170;         // gone by this far ahead
    const STREAK_FWD     = [3, 7];      // units/sec faster than the camera
    const STREAK_WAIT    = [2, 7];      // seconds between runs
    const STREAK_FROM    = [30, 45];    // starts this far behind
    const STREAK_FADE_IN = 40;          // fades in over this far
    const STREAK_OP      = [0.25, 0.5];
    const STREAK_W       = [0.4, 0.9];
    const STREAK_SECTIONS = [[0, 0], [0.12, 1], [0.88, 1], [1, 0]];   // [along its length, opacity]

    /* ── INTRO MUSIC ──────────────────────────────────────── */
    const MUSIC_SRC      = 'Audio/Music/Hex/The Edge.mp3';
    const MUSIC_VOLUME   = 0.35;
    const MUSIC_FADE_IN  = 3.5;     // seconds
    const MUSIC_FADE_OUT = 3.0;     // also the pull-away: the camera climbs and the city fades out

    /* ── PULL-AWAY (correct passphrase) ───────────────────── */
    const EXIT_RISE  = 24;
    const EXIT_PITCH = -0.95;       // ends looking down at the city
    const EXIT_FADE  = 1.2;         // the canvas fades out over the last this-many seconds


    /* ── STATE ────────────────────────────────────────────── */
    let renderer, scene, camera, clock, raf = null;
    let T = 0, phT = 0, phase = 'pre';
    let waveFront = 0, waveMax = 0, swoopT = 0;
    let loginFired = false;
    let camZ = 0, bankAngle = 0, prevYaw = 0, prevPitch = PITCH_DOWN, lastCy = CAM_Y0;
    let corruptT = 0, exitT = null, cruiseTime = 0;
    let phases = [], lastBridgeZ = Infinity, lastGrazeZ = Infinity;

    let tiles = [], rows = [], frontZ = 0;   // frontZ: the farthest row ahead
    let skyStreaks = [];

    let floorInst, pilInst, bridgeInst, haze, fog;
    let bgA, bgB, bgNow;          // THREE.Colors, made in start() (THREE loads as a module, after this file)
    let M4, QT, P3, S3, UP;       // scratch for the bridges' matrices

    let music = null, musicFade = null;


    /* ── HELPERS ──────────────────────────────────────────── */

    const TAU   = Math.PI * 2;
    const cl    = t => Math.max(0, Math.min(1, t));
    const rnd   = (a, b) => a + Math.random() * (b - a);
    const eIO   = t => (t = cl(t)) < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const eIn2  = t => (t = cl(t)) * t;
    const eIn4  = t => (t = cl(t)) * t * t * t;
    const eOut3 = t => 1 - Math.pow(1 - cl(t), 3);
    const eBack = t => { const u = cl(t) - 1; return 1 + (SETTLE + 1) * u * u * u + SETTLE * u * u; };   // overshoots, settles
    const waves = (list, z, ph0) => list.reduce((s, [a, len], i) => s + a * Math.sin(TAU * z / len + phases[ph0 + i]), 0);

    const tileX = col         => col * CW - (COLS * CW) / 2 + CW / 2;
    const tileZ = (rowZ, col) => rowZ + (col % 2 ? RH / 2 : 0);   // odd columns sit half a row down

    // The path's centre and the camera's height at z: straight and level for the swoop, then winding
    const pathX     = z => eIO(-z / 40) * waves(PATH_WAVES, z, 0);
    const pathY     = z => Math.max(Y_MIN, Y_BASE + eIO(-z / 40) * waves(Y_WAVES, z, 2));
    const pathSlope = z => pathX(z - 0.5) - pathX(z + 0.5);     // sideways per unit forward
    // How low and how high the camera is around z — what blocks and bridges must clear
    const flyRange  = z => { const ys = [z - 1.5, z, z + 1.5].map(pathY); return [Math.min(...ys), Math.max(...ys)]; };


    /* ── INTRO MUSIC ──────────────────────────────────────── */

    // Ramp the volume to `target` over `sec` seconds. setInterval rather
    // than rAF so it still finishes (and calls onDone) in a background tab.
    function fadeMusic(target, sec, onDone) {
        clearInterval(musicFade);
        const from = music.volume, t0 = performance.now();
        musicFade = setInterval(() => {
            const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
            music.volume = from + (target - from) * k;
            if (k === 1) { clearInterval(musicFade); onDone?.(); }
        }, 30);
    }

    function startMusic() {
        music = new Audio(MUSIC_SRC);
        music.loop   = true;
        music.volume = 0;
        // start() runs from a click, so this should be allowed; if not, retry on the next click
        music.play().catch(() =>
            document.addEventListener('click', () => music?.play().catch(() => {}), { once: true }));
        fadeMusic(MUSIC_VOLUME, MUSIC_FADE_IN);
    }

    function fadeOutMusic(onDone) {
        if (renderer && phase === 'cruise') exitT = 0;   // the camera pulls up and away meanwhile
        if (!music) { onDone?.(); return; }
        fadeMusic(0, MUSIC_FADE_OUT, () => {
            music.pause();
            music.removeAttribute('src');   // release the file
            music.load();
            music = null;
            onDone?.();
        });
    }


    /* ── GEOMETRY ─────────────────────────────────────────── */

    function hexShape(r) {
        const shape = new THREE.Shape();
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            i === 0 ? shape.moveTo(r * Math.cos(a), r * Math.sin(a))
                    : shape.lineTo(r * Math.cos(a), r * Math.sin(a));
        }
        shape.closePath();
        return shape;
    }

    // Colour each face of a (non-indexed, centred) shape: tops light, sides shaded by
    // which way they face, undersides (only ever seen on a bridge, from below) in shadow.
    // Both triangles of a face share its true normal, so there's no seam.
    function paint(geo) {
        const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
        const top = new THREE.Color(C_PIL_TOP), side = new THREE.Color(C_PIL_SIDE), c = new THREE.Color();
        const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
        for (let i = 0; i < pos.count; i += 3) {
            a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); d.fromBufferAttribute(pos, i + 2);
            n.subVectors(b, a).cross(d.sub(a)).normalize();
            if (n.dot(a) < 0) n.negate();                                   // outwards
            if (n.y > 0.9) c.copy(top);
            else if (n.y < -0.9) c.copy(side).multiplyScalar(0.72);
            else {
                const f = Math.hypot(n.x, n.z);
                c.copy(side).multiplyScalar(0.8 + 0.2 * (n.x * LIGHT[0] + n.z * LIGHT[1]) / f / Math.hypot(...LIGHT));
            }
            for (let k = 0; k < 3; k++) c.toArray(cols, (i + k) * 3);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        return geo;
    }

    // One instanced mesh per kind (every floor hex is one draw, every pillar another),
    // each with a colour per instance (tints, shadows); rewritten every frame (drawTiles)
    function instanced(geo, mat, n) {
        const m = new THREE.InstancedMesh(geo, mat, n);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
        for (const attr of [m.instanceMatrix, m.instanceColor]) attr.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;                     // instances move every frame; the GPU clips what's off screen
        m.count = 0;
        scene.add(m);
        return m;
    }

    function makeMeshes() {
        const r = R - GAP;
        const floorGeo = new THREE.ShapeGeometry(hexShape(r));
        floorGeo.rotateX(-Math.PI / 2);
        const pilGeo = new THREE.CylinderGeometry(r, r, 1, 6).toNonIndexed();
        pilGeo.rotateY(Math.PI / 6);
        const mBlocks = new THREE.MeshBasicMaterial({ vertexColors: true });

        floorInst  = instanced(floorGeo, new THREE.MeshBasicMaterial({ color: C_FLOOR, side: THREE.DoubleSide }), POOL_ROWS * COLS);
        pilInst    = instanced(paint(pilGeo), mBlocks, POOL_ROWS * COLS);
        bridgeInst = instanced(paint(new THREE.BoxGeometry(1, 1, 1).toNonIndexed()), mBlocks, POOL_ROWS);   // at most one per row
        M4 = new THREE.Matrix4(); QT = new THREE.Quaternion(); P3 = new THREE.Vector3(); S3 = new THREE.Vector3(); UP = new THREE.Vector3(0, 1, 0);

        // The haze: a sky dome round the camera, the background colour but warmer low on the
        // horizon ahead; plain below the horizon, where the fogged floor meets it
        const hazeGeo = new THREE.SphereGeometry(300, 64, 32);
        const pos = hazeGeo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
        const warm = new THREE.Color(...HAZE_WARM), v = new THREE.Vector3(), hd = Math.hypot(...HAZE_DIR);
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).normalize();
            const toward = Math.max(0, (v.x * HAZE_DIR[0] + v.z * HAZE_DIR[1]) / hd / (Math.hypot(v.x, v.z) || 1));
            c.setRGB(1, 1, 1).lerp(warm, HAZE_AMT * toward ** 3 * (v.y >= 0 ? Math.exp(-v.y * 7) : 0)).toArray(cols, i * 3);
        }
        hazeGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        haze = new THREE.Mesh(hazeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
        haze.renderOrder = -1;
        scene.add(haze);

        fog = new THREE.Fog(BG_CREAM, FOG_NEAR, DD_AHEAD - 4);
        scene.fog = fog;
    }


    /* ── WORLD ────────────────────────────────────────────── */

    // Place a row at rowZ and decide what stands on each of its hexes
    function assignRow(row, rowZ) {
        row.z = rowZ;
        const far = -rowZ > START_CLEAR;

        // A bridge here? — at the bottom of a dive, high enough to pass under; its towers are picked below
        let bridgeY = null, left = null, right = null;
        row.bridge = null;
        if (far && lastBridgeZ - rowZ > BRIDGE_GAP && pathY(rowZ) <= Math.min(pathY(rowZ - RH), pathY(rowZ + RH))) {
            const [lo, hi] = flyRange(rowZ);
            if (lo < BRIDGE_UNDER && Math.random() < 0.9) bridgeY = hi + BRIDGE_HEAD;
        }
        // A near miss here? (never in a bridge's row)
        const graze = far && bridgeY === null && lastGrazeZ - rowZ > GRAZE_GAP && Math.random() < GRAZE_PROB
                    ? (Math.random() < 0.5 ? -1 : 1) : 0;
        let grazer = null;

        row.cols.forEach((t, col) => {
            t.x = tileX(col);
            t.z = tileZ(rowZ, col);
            t.riseT = null; t.revealT = null;
            t.tint = Math.random() * 2 - 1;
            // distance from the path, measured square to it (straight across would be too little where it runs diagonally)
            const side = Math.sign(t.x - pathX(t.z));
            const d = Math.abs(t.x - pathX(t.z)) / Math.hypot(1, pathSlope(t.z)), onPath = d < PATH_W;
            if (onPath) {                                        // the way through: clear, bar a low block to skim over
                const room = far ? flyRange(t.z)[0] - LOW_HEAD : 0;
                t.isPil = room >= LOW_MIN + 0.2 && Math.random() < cl((room - 1.5) / 4) * 0.7;
                t.pilH  = LOW_MIN + Math.random() * (room - LOW_MIN);
                if (graze && side === graze && d >= GRAZE_D && (!grazer || d < grazer.d)) grazer = t;
            } else {                                             // hemming the path in, thinner further out
                t.isPil = Math.random() < (d < PATH_W + CROWD_BAND ? CROWD : PIL_PROB);
                t.pilH  = PIL_MIN + Math.random() * (PIL_MAX - PIL_MIN);
                if (bridgeY !== null) {                          // the bridge's towers: the nearest hex off the path each side
                    if (side < 0 && (!left || t.x > left.x)) left = t;
                    if (side > 0 && (!right || t.x < right.x)) right = t;
                }
            }
            t.d = d;
        });

        // The near miss: the path hex nearest GRAZE_D from its centre, on that side
        if (grazer) { grazer.isPil = true; grazer.pilH = rnd(6.5, 9); lastGrazeZ = rowZ; }

        // The bridge runs from one tower's centre to the other's, so both ends are buried in them
        if (left && right) {
            for (const t of [left, right]) { t.isPil = true; t.pilH = bridgeY + BRIDGE_THICK + 0.4 + Math.random() * 1.2; }
            const dx = right.x - left.x, dz = right.z - left.z;
            row.bridge = { x: (left.x + right.x) / 2, z: (left.z + right.z) / 2, y: bridgeY, len: Math.hypot(dx, dz),
                           yaw: Math.atan2(-dz, dx), riseT: null };
            lastBridgeZ = rowZ;
        }
    }

    function buildWorld() {
        phases = [0, 1, 2, 3].map(() => Math.random() * TAU);   // 0–1 the path's bends, 2–3 its dives

        for (let ri = 0; ri < POOL_ROWS; ri++) {
            const rowZ   = (ROWS_BACK - ri) * RH;
            const inWave = Math.abs(rowZ) <= WAVE_ZONE_Z;
            const row    = { z: rowZ, cols: [] };

            for (let col = 0; col < COLS; col++) {
                const t = { inWave, hit: !inWave, diagN: null };   // `hit` = revealed; rows outside the wave start revealed
                row.cols.push(t);
                tiles.push(t);
            }
            assignRow(row, rowZ);
            rows.push(row);
            frontZ = rowZ;
        }

        // The wave sweeps diagonally across the wave zone
        const diag = t => (t.x + t.z) / Math.SQRT2;
        const wave = tiles.filter(t => t.inWave);
        const minD = Math.min(...wave.map(diag));
        waveMax = Math.max(...wave.map(diag)) - minD || 1;
        for (const t of wave) t.diagN = (diag(t) - minD) / waveMax;
    }

    // Move a row that's fallen behind the camera to the far front
    function recycleRow(row) {
        frontZ -= RH;
        assignRow(row, frontZ);
        for (const t of row.cols) { t.hit = true; t.inWave = false; t.diagN = null; }
    }


    /* ── SKY STREAKS ──────────────────────────────────────── */

    function buildSky() {
        for (let i = 0; i < STREAK_COUNT; i++) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAK_SECTIONS.length * 6), 3));
            geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(STREAK_SECTIONS.flatMap(([, a]) => [1, 1, 1, a, 1, 1, 1, a])), 4));
            const idx = [];
            for (let k = 0; k < STREAK_SECTIONS.length - 1; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
            geo.setIndex(idx);
            const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                color: 0xee1111, vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false,
            }));
            mesh.frustumCulled = false;
            mesh.visible = false;
            scene.add(mesh);
            skyStreaks.push({ mesh, geo, live: false, wait: rnd(0, STREAK_WAIT[1]) });
        }
    }

    function updateSky(dt, cx, cz, speed) {
        cruiseTime = phase === 'cruise' ? cruiseTime + dt : 0;
        if (cruiseTime < STREAK_DELAY) return;
        for (const s of skyStreaks) {
            if (!s.live) {
                if ((s.wait -= dt) > 0) continue;
                const from = rnd(...STREAK_FROM);
                Object.assign(s, { live: true, x: cx + rnd(-SKY_SPREAD, SKY_SPREAD), y: rnd(...SKY_Y), z: cz + from, from,
                                   len: rnd(30, 70), width: rnd(...STREAK_W), fwd: rnd(...STREAK_FWD), op: rnd(...STREAK_OP) });
            }
            s.z -= (speed + s.fwd) * dt;                                    // outrunning the camera, off to the horizon
            const ahead = cz - s.z;                                         // how far ahead its near end is
            if (ahead > SKY_FAR) { s.live = false; s.mesh.visible = false; s.wait = rnd(...STREAK_WAIT); continue; }
            s.mesh.visible = true;
            s.mesh.material.opacity = s.op * eIO((ahead + s.from) / STREAK_FADE_IN) * Math.pow(1 - ahead / SKY_FAR, 0.9);
            const pos = s.geo.attributes.position, hw = s.width / 2;
            STREAK_SECTIONS.forEach(([f], k) => {
                const z = s.z - f * s.len;
                pos.setXYZ(k * 2, s.x - hw, s.y, z); pos.setXYZ(k * 2 + 1, s.x + hw, s.y, z);
            });
            pos.needsUpdate = true;
        }
    }


    /* ── FRAME ────────────────────────────────────────────── */

    function advancePhase(dt) {
        if (phase === 'pre' && T >= WAVE_DELAY) { phase = 'wave'; phT = 0; startMusic(); }
        if (phase === 'wave') {
            waveFront += WAVE_SPD * dt;
            if (waveFront >= waveMax) { phase = 'hold'; phT = 0; }
        }
        if (phase === 'hold' && phT >= HOLD_DUR) { phase = 'swoop'; phT = 0; }
        if (phase === 'swoop') {
            swoopT = Math.min(1, phT / SWOOP_DUR);
            if (swoopT >= 1) { phase = 'cruise'; phT = 0; }
        }
    }

    // Reveal hexes as the wave passes them (each pops with a bounce: drawTiles)
    function updateWave() {
        for (const t of tiles)
            if (t.inWave && !t.hit && t.diagN * waveMax <= waveFront) { t.hit = true; t.revealT = T; }
    }

    // Returns the camera's position
    function updateCamera(dt, speed) {
        let cx = 0, cy, cz, yaw, pitch;
        if (phase === 'swoop' || phase === 'cruise') {
            const yE = eIO(swoopT);
            // Forward motion eases in over the second half of the swoop
            camZ -= speed * (phase === 'cruise' ? 1 : eIO((swoopT - 0.45) / 0.55)) * dt;
            cz = camZ;
            cx = pathX(cz);
            const flyY = pathY(cz);
            cy = CAM_Y0 + (flyY - CAM_Y0) * yE;
            // Face where the path goes; the nose tips down into a dive and up out of it
            yaw   = -Math.atan2(pathX(cz - LOOK) - cx, LOOK) * yE;
            pitch = PITCH_DOWN + (PITCH_BASE + Math.atan2(pathY(cz - LOOK) - flyY, LOOK) * NOSE - PITCH_DOWN) * eIn4(swoopT);
            if (phase === 'cruise') {                                            // (the swoop down is already smooth)
                const k = 1 - Math.exp(-dt / EASE_TURN);
                yaw   = prevYaw + (yaw - prevYaw) * k;
                pitch = prevPitch + (pitch - prevPitch) * k;
            }
            // Bank (roll) follows how fast it's turning
            const roll = Math.max(-BANK_MAX, Math.min(BANK_MAX, -((yaw - prevYaw) / Math.max(dt, 0.001)) * BANK_AMT));
            bankAngle += (roll - bankAngle) * (1 - Math.exp(-dt / EASE_BANK));
            prevYaw = yaw; prevPitch = pitch;
            // Pulling up and away: climbing, turning to look down at the city
            if (exitT !== null) {
                const k = cl(exitT / MUSIC_FADE_OUT);
                cy    += eIn2(k) * EXIT_RISE;
                pitch += (EXIT_PITCH - pitch) * eIO(k * 1.3);
            }
        } else {
            cy = CAM_Y0; cz = 0; yaw = 0; pitch = PITCH_DOWN; bankAngle = 0;
        }
        lastCy = cy;
        camera.position.set(cx, cy, cz);
        camera.rotation.set(pitch, yaw, bankAngle);   // order is YXZ (set in start)
        return { cx, cz };
    }

    const pillarRisen = p => eBack(Math.max(0, T - p.riseT) / PIL_DUR);

    // Queue pillars (and bridges, after their towers) ahead of the camera to rise, nearer ones first
    function queueRises(cx, cz) {
        if (swoopT <= 0.8) return;
        const due = (x, z) => { const dz = cz - z; return dz > 0 && dz < PIL_TRIG ? T + Math.hypot(x - cx, dz) * PIL_STAG : null; };
        for (const p of tiles) if (p.isPil && p.riseT === null) p.riseT = due(p.x, p.z);
        for (const { bridge: b } of rows) if (b && b.riseT === null) { const at = due(b.x, b.z); if (at !== null) b.riseT = at + PIL_DUR * 0.6; }
    }

    // Bridges extend out from the middle to their towers (no overshoot, so never past them).
    // Returns the ones drawn, for the shadows under them.
    function drawBridges(cz) {
        let n = 0;
        const drawn = [];
        for (const { bridge: b } of rows) {
            if (!b || b.riseT === null || cz - b.z <= -DD_BEHIND || cz - b.z >= DD_AHEAD) continue;
            const k = eOut3(Math.max(0, T - b.riseT) / PIL_DUR);
            if (k < 0.01) continue;
            bridgeInst.setMatrixAt(n++, M4.compose(P3.set(b.x, b.y + BRIDGE_THICK / 2, b.z), QT.setFromAxisAngle(UP, b.yaw),
                                                   S3.set(b.len * k, BRIDGE_THICK, BRIDGE_DEPTH)));
            drawn.push({ x: b.x, z: b.z, ux: Math.cos(b.yaw), uz: -Math.sin(b.yaw), half: b.len * k / 2 });
        }
        bridgeInst.count = n;
        bridgeInst.instanceMatrix.needsUpdate = true;
        return drawn;
    }

    // One instance's matrix — scale, then move; no rotation — written straight into the buffer
    function put(a, i, x, y, z, sx, sy, sz) {
        const o = i * 16;
        a[o] = sx; a[o + 5] = sy; a[o + 10] = sz;
        a[o + 12] = x; a[o + 13] = y; a[o + 14] = z;
    }

    // Contact shadows: how much a floor hex is darkened by the risen pillars beside it and a bridge over it.
    // Pillars are bucketed by 2×2 cell (near) so each hex only checks its neighbours.
    const cellOf = (x, z) => Math.floor(x / 2) * 100003 + Math.floor(z / 2);
    function shadowAt(t, near, bridges) {
        let s = 0;
        const ix = Math.floor(t.x / 2), iz = Math.floor(t.z / 2);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
            const list = near.get((ix + a) * 100003 + iz + b);
            if (list) for (const [x, z, h] of list) {
                const d = Math.hypot(x - t.x, z - t.z);
                if (d > 0.1 && d < 2) s += SHADOW_PER * Math.min(1, h / 3);
            }
        }
        for (const b of bridges) {
            const rx = t.x - b.x, rz = t.z - b.z;
            if (Math.abs(rx * b.ux + rz * b.uz) < b.half && Math.abs(-rx * b.uz + rz * b.ux) < BRIDGE_DEPTH / 2 + 0.5) s += SHADOW_BRIDGE;
        }
        return Math.min(s, SHADOW_MAX);
    }

    // This frame's hexes, within draw distance: floors with the wave's bounce, a touch of tint
    // and their contact shadows; pillars as far as they've risen, lighter the taller. A wrong
    // passphrase (corruptT) makes them jitter, stretch and jump, settling over CORRUPT_DUR.
    function drawTiles(cz, bridges) {
        const F = floorInst.instanceMatrix.array, P = pilInst.instanceMatrix.array;
        const FC = floorInst.instanceColor.array, PC = pilInst.instanceColor.array;
        const e = (corruptT / CORRUPT_DUR) ** 2;
        const seen = t => t.hit && cz - t.z > -DD_BEHIND && cz - t.z < DD_AHEAD;

        const near = new Map();
        for (const t of tiles) {
            if (!t.isPil || t.riseT === null || !seen(t)) continue;
            const h = t.pilH * pillarRisen(t);
            if (h < 0.2) continue;
            const k = cellOf(t.x, t.z);
            (near.get(k) ?? near.set(k, []).get(k)).push([t.x, t.z, h]);
        }

        let nf = 0, np = 0;
        for (const t of tiles) {
            if (!seen(t)) continue;
            let nx = 0, ny = 0, nz = 0;
            if (e) {
                nx = Math.sin(t.x * 7.3  + T * 190 + corruptT * 44) * Math.cos(t.z * 5.1 + T * 230);
                ny = Math.sin(t.x * 11.7 + t.z * 8.3 + T * 160);
                nz = Math.cos(t.x * 9.1  + T * 210 + corruptT * 33) * Math.sin(t.z * 6.7);
            }
            // the floor (under pillars too, so there are no holes)
            const age = t.revealT === null ? POP_DUR : T - t.revealT;
            const pop = age < POP_DUR ? POP_H * Math.sin(Math.PI * age / POP_DUR) * Math.exp(-3 * age / POP_DUR) : 0;
            FC.fill((1 + t.tint * TINT_FLOOR) * (1 - shadowAt(t, near, bridges)), nf * 3, nf * 3 + 3);
            const amp = e * 2.2;
            put(F, nf++, t.x + nx * amp * 0.8, pop + ny * amp * 1.4, t.z + nz * amp * 0.8, 1, 1, 1);

            if (!t.isPil || t.riseT === null) continue;          // a pillar's rise is queued when it comes into range
            const c = (1 + t.tint * TINT_PIL) * (1 + HEIGHT_LIGHT * (t.pilH - (PIL_MAX + PIL_MIN) / 2) / (PIL_MAX - PIL_MIN));
            if (e) {
                const sy = Math.max(0.05, pillarRisen(t) + ny * e * 1.8) * t.pilH;
                const jump = Math.abs(nx * nz) > 0.82 && e > 0.25 ? ny * e * 5 : 0;
                PC.fill(c, np * 3, np * 3 + 3);
                put(P, np++, t.x + nx * e * 1.2, sy / 2 + jump, t.z + nz * e * 1.2, 1 + Math.abs(nx) * e * 1.1, sy, 1 + Math.abs(nz) * e * 1.1);
                continue;
            }
            const h = t.pilH * pillarRisen(t);
            if (h > 0.001 * t.pilH) { PC.fill(c, np * 3, np * 3 + 3); put(P, np++, t.x, h / 2, t.z, 1, h, 1); }
        }
        for (const [m, n] of [[floorInst, nf], [pilInst, np]]) {
            m.count = n;
            for (const [attr, size] of [[m.instanceMatrix, 16], [m.instanceColor, 3]]) {
                attr.clearUpdateRanges();
                attr.addUpdateRange(0, n * size);                  // upload only what's drawn
                attr.needsUpdate = true;
            }
        }
    }

    function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        T += dt; phT += dt;
        corruptT = Math.max(0, corruptT - dt);

        advancePhase(dt);
        if (phase === 'wave' || phase === 'hold') updateWave();
        bgNow.copy(bgA).lerp(bgB, phase === 'cruise' ? 1 : eIO(swoopT / 0.6));
        renderer.setClearColor(bgNow);
        fog.color.copy(bgNow);
        haze.material.color.copy(bgNow);

        // Pulling away: the city fades out over the last of the music
        if (exitT !== null) {
            exitT += dt;
            renderer.domElement.style.opacity = 1 - cl((exitT - (MUSIC_FADE_OUT - EXIT_FADE)) / EXIT_FADE);
        }

        // A little faster low in a dive, a little slower at the top of a climb
        const speed = SPEED * Math.max(0.85, Math.min(1.2, 1 + GLIDE * (Y_BASE - lastCy) / 4));
        const { cx, cz } = updateCamera(dt, speed);
        haze.position.copy(camera.position);
        for (const row of rows) if (row.z - cz > RECYCLE_BEHIND) recycleRow(row);
        queueRises(cx, cz);
        drawTiles(cz, drawBridges(cz));
        updateSky(dt, cx, cz, speed);

        if (!loginFired && swoopT >= LOGIN_AT) {
            loginFired = true;
            CITY.onLoginReveal?.();
        }

        renderer.render(scene, camera);
    }

    function onResize() {
        renderer.setSize(innerWidth, innerHeight);
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
    }


    /* ── PUBLIC API ───────────────────────────────────────── */

    return {
        onLoginReveal: null,

        // Single use: stop() releases the WebGL context for good.
        // skipIntro (returning visitors): straight into the cruise, already behind the login box
        start({ skipIntro = false } = {}) {
            if (renderer) return;
            const canvas = document.getElementById('cityCanvas');
            bgA = new THREE.Color(BG_BLACK); bgB = new THREE.Color(BG_CREAM); bgNow = new THREE.Color();

            renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
            renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
            renderer.setSize(innerWidth, innerHeight);
            renderer.setClearColor(bgA);

            scene  = new THREE.Scene();
            camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 400);
            camera.rotation.order = 'YXZ';
            clock  = new THREE.Clock();

            makeMeshes();
            buildWorld();
            buildSky();

            canvas.style.zIndex = '500';    // above everything during the intro
            if (skipIntro) {
                for (const t of tiles) t.hit = true;
                phase = 'cruise'; swoopT = 1; loginFired = true; prevPitch = PITCH_BASE;
                renderer.setClearColor(bgB);
                canvas.style.zIndex = '18';
                startMusic();
            }
            addEventListener('resize', onResize);
            tick();
        },

        toBackground() {
            document.getElementById('cityCanvas').style.zIndex = '18';
        },

        corruptEffect() {
            corruptT = CORRUPT_DUR;
        },

        fadeOutMusic,

        stop() {
            cancelAnimationFrame(raf);
            raf = null;
            removeEventListener('resize', onResize);
            // Free the GPU memory; the globe and inventory need WebGL contexts too
            renderer?.dispose();
            renderer?.forceContextLoss();
        },
    };

})();
