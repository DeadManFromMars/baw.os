/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   city.js  —  HEX CITY  (Three.js r128)

   Hex geometry: flat-top, ShapeGeometry laid flat, proven correct.
   Grid layout:  col spacing = R*1.5, row spacing = R*sqrt(3),
                 odd cols offset by R*sqrt(3)/2 in Z.
   Pillars:      CylinderGeometry 6-sided, rotateY(PI/6) to align.
   Camera:       rotation.order = 'YXZ', manual rotation.x only.
                 NO lookAt() — degenerate when pointing straight down.

   SEQUENCE
     pre    → black hold
     wave   → diagonal wipe, tiles pop up
     hold   → stillness
     swoop  → camera J-curve dive, bg black→cream
     cruise → pillars rise, wander + bank, login fires

   CAMERA RULES (do not revert these)
     rotation.order = 'YXZ' + manual rotation.x  — no lookAt()
     camZ -= fwd        camera looks in -Z (Three.js default forward)
     Y     easeInOut    zero velocity at both ends, no snap at swoop start
     pitch easeIn t^4   stays pointing down, tips level only at end
     fwd   45% delay    drop first, then J-curves into forward flight

   PUBLIC API
     CITY.start()         run sequence
     CITY.stop()          cancel animation loop
     CITY.toBackground()  z-index 500 → 18
     CITY.onLoginReveal   callback — assign before calling start()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CITY = (() => {

    /* ── TUNING ─────────────────────────────────────────────── */

    const R   = 1.0;
    const GAP = 0.04;
    const CW  = R * 1.5;
    const RH  = R * Math.sqrt(3);

    // Grid — camera flies in -Z; ROWS_FWD tiles extend ahead of start
    const COLS      = 32;
    const ROWS_BACK = 8;     // rows behind cam start z=0 (wave coverage)
    const ROWS_FWD  = 240;   // rows ahead in -Z (~120s at cruise speed)
    const ROWS      = ROWS_BACK + ROWS_FWD;

    // Tiles within this z-distance of z=0 get the wave reveal animation.
    // Everything beyond starts pre-visible (floor) or dormant (pillar).
    const WAVE_ZONE_Z = 14;

    // Camera
    const CAM_Y0      = 16;
    const CRUISE_Y    = 3.5;
    const PITCH_DOWN  = -Math.PI / 2;
    const PITCH_LEVEL = -0.06;
    const SWOOP_DUR   = 7.0;
    const SPEED       = 3.5;   // cruise units/sec

    // Wave
    const WAVE_DELAY = 0.5;
    const WAVE_SPD   = 14.0;
    const POP_H      = 0.5;
    const POP_DUR    = 0.45;
    const HOLD_DUR   = 0.9;

    // Background
    const BG_BLACK = 0x000000;
    const BG_CREAM = 0xf5f2ec;

    // Lateral wander
    const WANDER_A1 = 5.0;   const WANDER_F1 = 0.07;
    const WANDER_A2 = 1.8;   const WANDER_F2 = 0.21;
    const SPRING_K  = 1.2;   const SPRING_D  = 3.2;
    const WANDER_IN = 0.70;  // swoop fraction when wander fades in

    // Banking / yaw
    const YAW_AMT  = 0.14;  const YAW_LAG  = 0.06;
    const BANK_AMT = 0.09;  const BANK_LAG = 0.09;

    // Pillars
    const PIL_PROB = 0.24;
    const PIL_MIN  = 0.8;
    const PIL_MAX  = 9.0;
    const PIL_TRIG = 45.0;   // units ahead of cam to trigger rise
    const PIL_DUR  = 2.5;
    const PIL_STAG = 0.035;  // stagger sec per world-unit from cam
    const PIL_POW  = 3;

    // Login fires at this swoop fraction
    const LOGIN_AT = 0.88;

    // Draw distance
    const DD_AHEAD  = 90;
    const DD_BEHIND = 12;

    // Colours
    const C_FLOOR    = 0xd0ccc4;
    const C_PIL_TOP  = 0xede8df;
    const C_PIL_SIDE = 0xb0aca4;


    /* ── STATE ──────────────────────────────────────────────── */

    let renderer, scene, camera, clock;
    let raf = null;
    let T = 0, phT = 0;
    let phase = 'pre';
    let waveFront = 0, waveMax = 0;
    let swoopT = 0;
    let loginFired = false;
    let camX = 0, camVX = 0, camY = CAM_Y0, camZ = 0;
    let camYaw = 0, camRoll = 0, tYaw = 0, tRoll = 0;
    let bgA, bgB;
    let tiles = [], pillars = [];

    let seed = 137;
    function rnd() {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return Math.abs(seed) / 0x7fffffff;
    }


    /* ── EASING ─────────────────────────────────────────────── */

    function cl(t) { return Math.max(0, Math.min(1, t)); }

    function eIO(t) {   // easeInOut — zero velocity at both ends
        t = cl(t);
        return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
    }
    function eIn4(t) { t = cl(t); return t*t*t*t; }             // easeIn power-4
    function eOut3(t) { return 1 - Math.pow(1 - cl(t), 3); }    // easeOut power-3
    function eFwd(t)  { return eIO(cl((t - 0.45) / 0.55)); }    // forward: 45% delay


    /* ── TILE POSITION ──────────────────────────────────────── */

    function tileX(col)      { return col * CW - (COLS * CW) / 2 + CW / 2; }
    function tileZ(row, col) { return (ROWS_BACK - row) * RH - (col % 2 !== 0 ? RH/2 : 0); }
    // row = ROWS_BACK  →  z = 0  (camera start)
    // row > ROWS_BACK  →  z < 0  (ahead, camera flies toward -Z)
    // row < ROWS_BACK  →  z > 0  (behind)


    /* ── BUILD WORLD ────────────────────────────────────────── */

    function buildWorld() {
        seed = 137;
        tiles = []; pillars = [];

        const r = R - GAP;

        // Floor tile: ShapeGeometry in XY → rotateX(-PI/2) → flat in XZ
        // Flat-top hex: vertex angles = i * PI/3
        const shape = new THREE.Shape();
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            i === 0 ? shape.moveTo(r*Math.cos(a), r*Math.sin(a))
                    : shape.lineTo(r*Math.cos(a), r*Math.sin(a));
        }
        shape.closePath();
        const floorGeo = new THREE.ShapeGeometry(shape);
        floorGeo.rotateX(-Math.PI / 2);

        // Pillar: 6-sided cylinder, height 1, scale Y to final height.
        // rotateY(PI/6) aligns flat-top vertices with hex floor tiles.
        const pilGeo = new THREE.CylinderGeometry(r, r, 1, 6);
        pilGeo.rotateY(Math.PI / 6);

        const mFloor   = new THREE.MeshBasicMaterial({ color: C_FLOOR,    side: THREE.DoubleSide });
        const mPilTop  = new THREE.MeshBasicMaterial({ color: C_PIL_TOP  });
        const mPilSide = new THREE.MeshBasicMaterial({ color: C_PIL_SIDE });
        const mPil     = [mPilSide, mPilTop, mPilSide];  // CylinderGeometry: [side, top-cap, bottom-cap]

        // Pass 1 — diagonal range for wave zone only
        let minDiag = Infinity, maxWaveDiag = -Infinity;
        const raw = [];
        for (let col = 0; col < COLS; col++) {
            for (let row = 0; row < ROWS; row++) {
                const x = tileX(col);
                const z = tileZ(row, col);
                const d = (x + z) / Math.SQRT2;
                const inWave = Math.abs(z) <= WAVE_ZONE_Z;
                if (inWave) {
                    if (d < minDiag)     minDiag     = d;
                    if (d > maxWaveDiag) maxWaveDiag = d;
                }
                raw.push({ x, z, d, inWave });
            }
        }
        const waveDiagSpan = maxWaveDiag - minDiag || 1;
        waveMax = maxWaveDiag - minDiag;

        // Pass 2 — create meshes
        for (const { x, z, d, inWave } of raw) {
            const isPil = rnd() < PIL_PROB;
            const pilH  = isPil ? PIL_MIN + rnd() * (PIL_MAX - PIL_MIN) : 0;

            let mesh;
            if (isPil) {
                mesh = new THREE.Mesh(pilGeo, mPil);
                mesh.scale.set(1, 0.001, 1);
                mesh.position.set(x, 0, z);
                mesh.visible = false;         // pillar hidden until riseT
            } else {
                mesh = new THREE.Mesh(floorGeo, mFloor);
                mesh.position.set(x, 0, z);
                mesh.visible = !inWave;       // far floor tiles pre-visible
            }
            scene.add(mesh);

            const tile = {
                x, z, mesh, isPil, pilH,
                diagN:   inWave ? (d - minDiag) / waveDiagSpan : null,
                inWave,
                hit:     !inWave,
                revealT: null,
                riseT:   null,
            };
            tiles.push(tile);
            if (isPil) pillars.push(tile);
        }
    }


    /* ── TICK ───────────────────────────────────────────────── */

    function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        T   += dt;
        phT += dt;

        /* ── Phase machine ── */
        if (phase === 'pre' && T >= WAVE_DELAY) {
            phase = 'wave'; phT = 0; waveFront = 0;
        }
        if (phase === 'wave') {
            waveFront += WAVE_SPD * dt;
            if (waveFront >= waveMax) { phase = 'hold'; phT = 0; }
        }
        if (phase === 'hold' && phT >= HOLD_DUR) {
            phase = 'swoop'; phT = 0;
        }
        if (phase === 'swoop') {
            swoopT = Math.min(1, phT / SWOOP_DUR);
            if (swoopT >= 1) { phase = 'cruise'; phT = 0; }
        }
        // swoopT stays at 1 during cruise

        /* ── Wave reveal — diagonal wipe across overhead zone ── */
        for (const t of tiles) {
            if (!t.inWave || t.hit) continue;
            if (t.diagN * waveMax <= waveFront) {
                t.hit     = true;
                t.revealT = T;
                if (!t.isPil) t.mesh.visible = true;
            }
        }

        /* ── Pop bounce — wave-revealed floor tiles only ── */
        for (const t of tiles) {
            if (!t.inWave || t.isPil || t.revealT === null) continue;
            const age = T - t.revealT;
            t.mesh.position.y = age < POP_DUR
                ? POP_H * Math.sin(Math.PI * age / POP_DUR) * Math.exp(-3 * age / POP_DUR)
                : 0;
        }

        /* ── Background crossfade black → cream ── */
        if (phase === 'swoop' || phase === 'cruise') {
            const fadeT = eIO(cl(swoopT / 0.6));
            renderer.setClearColor(bgA.clone().lerp(bgB, fadeT));
        }

        /* ── Camera swoop ────────────────────────────────────────
           Y     easeInOut  → zero vel start AND end, no velocity snap
           pitch easeIn t^4 → stays pointing down, tips level at end
           Z     eFwd       → 45% delay, then easeInOut ramp
           camZ -= fwd      → -Z is forward (Three.js camera default)
        ──────────────────────────────────────────────────────── */
        const yE     = eIO(swoopT);
        const pitchE = eIn4(swoopT);
        const fwdE   = eFwd(swoopT);

        camY = CAM_Y0 + (CRUISE_Y - CAM_Y0) * yE;
        const pitch = PITCH_DOWN + (PITCH_LEVEL - PITCH_DOWN) * pitchE;

        if (phase === 'swoop' || phase === 'cruise') {
            camZ -= SPEED * fwdE * dt;
        }

        /* ── Lateral wander — fades in near end of swoop ── */
        const wanderBlend = cl((swoopT - WANDER_IN) / (1 - WANDER_IN));
        if (wanderBlend > 0) {
            const targetX = (
                Math.sin(T * WANDER_F1 * Math.PI * 2) * WANDER_A1 +
                Math.sin(T * WANDER_F2 * Math.PI * 2) * WANDER_A2
            ) * wanderBlend;
            const force = (targetX - camX) * SPRING_K - camVX * SPRING_D;
            camVX += force * dt;
            camX  += camVX * dt;
        }

        /* ── Yaw and roll follow lateral velocity ── */
        tYaw  = -camVX * YAW_AMT;  camYaw  += (tYaw  - camYaw)  * YAW_LAG;
        tRoll =  camVX * BANK_AMT; camRoll += (tRoll - camRoll) * BANK_LAG;

        camera.position.set(camX, camY, camZ);
        camera.rotation.order = 'YXZ';
        camera.rotation.x = pitch;
        camera.rotation.y = camYaw;
        camera.rotation.z = camRoll;

        /* ── Pillar rise ─────────────────────────────────────────
           "Ahead" = smaller z (camera flies in -Z).
           dz = camZ - p.z → positive when pillar is ahead of camera.
        ──────────────────────────────────────────────────────── */
        if (swoopT > 0.80) {
            for (const p of pillars) {
                if (!p.hit || p.riseT !== null) continue;
                const dz = camZ - p.z;
                if (dz > 0 && dz < PIL_TRIG) {
                    const dist = Math.hypot(p.x - camX, dz);
                    p.riseT = T + dist * PIL_STAG;
                }
            }
        }
        for (const p of pillars) {
            if (p.riseT === null) continue;
            const age = Math.max(0, T - p.riseT);
            const t   = eOut3(age / PIL_DUR);
            if (t > 0.001) {
                const h           = p.pilH * t;
                p.mesh.visible    = true;
                p.mesh.scale.y    = h;
                p.mesh.position.y = h / 2;
            }
        }

        /* ── Login callback ── */
        if (!loginFired && swoopT >= LOGIN_AT) {
            loginFired = true;
            if (typeof CITY.onLoginReveal === 'function') CITY.onLoginReveal();
        }

        /* ── Visibility cull ── */
        // dz = camZ - tile.z → positive means tile is ahead of camera
        for (const t of tiles) {
            if (!t.hit) continue;
            const dz  = camZ - t.z;
            const vis = dz > -DD_BEHIND && dz < DD_AHEAD;
            if (!t.isPil) {
                t.mesh.visible = vis;
            } else if (t.riseT !== null) {
                t.mesh.visible = vis;
            }
        }

        renderer.render(scene, camera);
    }


    /* ── PUBLIC API ─────────────────────────────────────────── */

    return {
        onLoginReveal: null,

        start() {
            const canvas = document.getElementById('cityCanvas');
            if (!canvas) { console.error('[CITY] #cityCanvas not found'); return; }

            bgA = new THREE.Color(BG_BLACK);
            bgB = new THREE.Color(BG_CREAM);

            renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setClearColor(bgA);

            scene  = new THREE.Scene();
            camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 400);
            clock  = new THREE.Clock();

            // Reset all state
            T = 0; phT = 0; phase = 'pre';
            waveFront = 0; swoopT = 0; loginFired = false;
            camX = 0; camVX = 0; camY = CAM_Y0; camZ = 0;
            camYaw = 0; camRoll = 0; tYaw = 0; tRoll = 0;

            buildWorld();

            // Initial camera: overhead, pointing straight down
            camera.position.set(0, CAM_Y0, 0);
            camera.rotation.order = 'YXZ';
            camera.rotation.x = PITCH_DOWN;
            camera.rotation.y = 0;
            camera.rotation.z = 0;

            canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:block;';
            canvas.style.zIndex  = '500';

            window.addEventListener('resize', () => {
                renderer.setSize(window.innerWidth, window.innerHeight);
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
            });

            tick();
        },

        toBackground() {
            const c = document.getElementById('cityCanvas');
            if (c) c.style.zIndex = '18';
        },

        stop() {
            if (raf) { cancelAnimationFrame(raf); raf = null; }
        },
    };

})();
