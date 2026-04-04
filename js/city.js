/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   city.js  —  HEX CITY  (Three.js r128)

   AVOIDANCE FIXES (vs last version)
   ─────────────────────────────────
   • SAFE_R was R*2.8 = 2.8. A pillar 3 units away never triggered
     avoidance at all. Now SAFE_R = R*5.5.

   • Force was flat — same strength whether pillar was 2 or 28 units
     ahead. Now uses lateralNeeded * SPEED / dz: the closer the
     pillar in Z, the larger the demanded heading correction. Far
     pillars get a gentle nudge; close ones get an urgent push.

   • Spring was TURN_K=1.8 — too gentle for reliable avoidance.
     Now TURN_K=6.0 so the heading responds within ~0.5s.

   • Steering only activated at swoopT>0.75 — pillars start rising
     at swoopT>0.80, so avoidance had no time to work. Now starts
     at swoopT>0.40 so path is established before pillars appear.

   • Avoidance ignores p.riseT — ALL pillar tiles are obstacles
     from the moment they exist in the data, not just risen ones.

   MOVEMENT MODEL (heading-based, retained from last version)
     heading > 0 = facing left, < 0 = facing right
     camX -= sin(heading) * speed * dt
     camZ -= cos(heading) * speed * dt
     Gives natural curved arcs, not pendulum swings.

   CAMERA (do not revert)
     rotation.order = 'YXZ' + manual rotation.x — no lookAt()
     camZ -= cos(heading) * speed * dt  (-Z is forward)
     Y  easeInOut   zero velocity at both ends
     pitch easeIn4  stays pointing down, tips level at end
     fwd 45% delay  J-curve: drop first, then fly forward

   INFINITE GRID
     Fixed pool of POOL_ROWS rows, recycled when behind camera.
     Recycle condition: row.worldZ - camZ > RECYCLE_BEHIND

   PUBLIC API
     CITY.start()        run
     CITY.stop()         cancel
     CITY.toBackground() z-index 500 → 18
     CITY.onLoginReveal  callback — assign before start()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CITY = (() => {

    /* ── TUNING ─────────────────────────────────────────────── */

    const R   = 1.0;
    const GAP = 0.04;
    const CW  = R * 1.5;
    const RH  = R * Math.sqrt(3);

    const COLS           = 32;
    const POOL_ROWS      = 80;
    const ROWS_BACK      = 8;
    const RECYCLE_BEHIND = 8;
    const WAVE_ZONE_Z    = 14;

    // Camera
    const CAM_Y0      = 16;
    const CRUISE_Y    = 3.5;
    const PITCH_DOWN  = -Math.PI / 2;
    const PITCH_LEVEL = -0.06;
    const SWOOP_DUR   = 7.0;
    const SPEED       = 2.6;

    // Wave
    const WAVE_DELAY = 0.5;
    const WAVE_SPD   = 14.0;
    const POP_H      = 0.5;
    const POP_DUR    = 0.45;
    const HOLD_DUR   = 0.9;

    // Background
    const BG_BLACK = 0x000000;
    const BG_CREAM = 0xf5f2ec;

    /* ── Steering ────────────────────────────────────────────── */

    const MAX_HEADING = 0.52;   // max heading angle (~30°), keeps motion forward-ish
    const TURN_K      = 6.0;    // spring stiffness — higher = snappier response
    const TURN_D      = 5.5;    // damping — keeps heading from oscillating
    const BANK_AMT    = 0.26;   // roll amplitude (visual banking into turns)

    // Wander — gentle base drift so straight runs don't feel dead
    const WANDER_A1 = 0.13;
    const WANDER_F1 = 0.046;
    const WANDER_A2 = 0.06;
    const WANDER_F2 = 0.11;

    // Soft centre pull — prevents drifting off the grid edges
    const CENTRE_K = 0.016;

    /* ── Avoidance ───────────────────────────────────────────────
       Two layers:

       PREDICTIVE (hard): project where camera will be when it
       arrives at each pillar's Z. If within SAFE_R, compute the
       heading needed to offset by SAFE_R using:
           headingNeeded = lateralNeeded * SPEED / dz
       This scales naturally: far pillars → gentle nudge,
       close pillars → urgent push. No flat weighting.

       SOFT (lateral): a broader comfort zone. Gives the camera
       awareness of nearby pillars even when not on direct course.

       Both layers are active regardless of pillar rise state —
       the camera avoids the TILE DATA, not the visual mesh.     */

    const LOOK_AHEAD = 38;      // scan this far ahead (world units)
    const SAFE_R     = R * 5.5; // hard avoidance radius — was too small before
    const AVOID_CAP  = 0.85;    // max heading correction per pillar (rad)
    const SOFT_R     = R * 7.0; // soft nudge radius
    const SOFT_STR   = 0.10;    // soft nudge multiplier

    // Pillars
    const PIL_PROB = 0.22;
    const PIL_MIN  = 0.8;
    const PIL_MAX  = 9.0;
    const PIL_TRIG = 42.0;
    const PIL_DUR  = 2.2;
    const PIL_STAG = 0.03;

    // Login
    const LOGIN_AT = 0.88;

    // Draw distance
    const DD_AHEAD  = 72;
    const DD_BEHIND = 10;

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

    let camX = 0, camY = CAM_Y0, camZ = 0;
    let heading = 0, headingRate = 0;

    let bgA, bgB;
    let tiles   = [];
    let pillars = [];
    let rowData = [];

    let rowSeed = 1;
    function rndR(s) {
        s.v = (s.v * 1664525 + 1013904223) & 0xffffffff;
        return (s.v >>> 0) / 0xffffffff;
    }


    /* ── EASING ─────────────────────────────────────────────── */

    function cl(t) { return Math.max(0, Math.min(1, t)); }
    function eIO(t)  { t=cl(t); return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }
    function eIn4(t) { t=cl(t); return t*t*t*t; }
    function eOut3(t){ return 1-Math.pow(1-cl(t),3); }
    function eFwd(t) { return eIO(cl((t-0.45)/0.55)); }


    /* ── GEOMETRY ────────────────────────────────────────────── */

    let floorGeo, pilGeo, mFloor, mPilTop, mPilSide, mPil;

    function makeGeo() {
        const r = R - GAP;
        const shape = new THREE.Shape();
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            i===0 ? shape.moveTo(r*Math.cos(a), r*Math.sin(a))
                  : shape.lineTo(r*Math.cos(a), r*Math.sin(a));
        }
        shape.closePath();
        floorGeo = new THREE.ShapeGeometry(shape);
        floorGeo.rotateX(-Math.PI / 2);

        pilGeo = new THREE.CylinderGeometry(r, r, 1, 6);
        pilGeo.rotateY(Math.PI / 6);

        mFloor   = new THREE.MeshBasicMaterial({ color: C_FLOOR,    side: THREE.DoubleSide });
        mPilTop  = new THREE.MeshBasicMaterial({ color: C_PIL_TOP  });
        mPilSide = new THREE.MeshBasicMaterial({ color: C_PIL_SIDE });
        mPil     = [mPilSide, mPilTop, mPilSide];
    }


    /* ── TILE POSITION ──────────────────────────────────────── */

    function tileX(col)          { return col * CW - (COLS * CW) / 2 + CW / 2; }
    function tileZ(worldZ, col)  { return worldZ + (col % 2 !== 0 ? RH / 2 : 0); }


    /* ── ROW ASSIGNMENT ─────────────────────────────────────── */

    function assignRow(rd, worldZ, forceFloor) {
        rd.worldZ = worldZ;
        const s = { v: (++rowSeed) * 7919 + 1 };

        for (let col = 0; col < COLS; col++) {
            const t   = rd.cols[col];
            const x   = tileX(col);
            const z   = tileZ(worldZ, col);
            const isPil = !forceFloor && rndR(s) < PIL_PROB;
            const pilH  = isPil ? PIL_MIN + rndR(s) * (PIL_MAX - PIL_MIN) : 0;

            t.x = x;  t.z = z;
            t.isPil = isPil;  t.pilH = pilH;
            t.riseT = null;  t.revealT = null;  t.hit = false;

            t.floorMesh.position.set(x, 0, z);
            t.floorMesh.visible = false;
            t.pilMesh.position.set(x, 0, z);
            t.pilMesh.scale.set(1, 0.001, 1);
            t.pilMesh.visible = false;
        }
    }


    /* ── BUILD WORLD ─────────────────────────────────────────── */

    function buildWorld() {
        rowSeed = 1;
        tiles = []; pillars = []; rowData = [];
        makeGeo();

        for (let ri = 0; ri < POOL_ROWS; ri++) {
            const worldZ = (ROWS_BACK - ri) * RH;
            const inWave = Math.abs(worldZ) <= WAVE_ZONE_Z;
            const rd     = { worldZ, cols: [] };

            for (let col = 0; col < COLS; col++) {
                const floorMesh = new THREE.Mesh(floorGeo, mFloor);
                scene.add(floorMesh);
                const pilMesh = new THREE.Mesh(pilGeo, mPil);
                scene.add(pilMesh);

                const t = { x:0, z:0, isPil:false, pilH:0,
                            riseT:null, revealT:null, hit:false,
                            inWave, diagN:null, floorMesh, pilMesh };
                rd.cols.push(t);
                tiles.push(t);
            }

            assignRow(rd, worldZ, false);

            for (const t of rd.cols) {
                t.inWave = inWave;
                t.hit    = !inWave;
                if (!inWave && !t.isPil) t.floorMesh.visible = true;
                if (t.isPil) pillars.push(t);
            }

            rowData.push(rd);
        }

        let minD =  Infinity, maxD = -Infinity;
        for (const t of tiles) {
            if (!t.inWave) continue;
            const d = (t.x + t.z) / Math.SQRT2;
            if (d < minD) minD = d;
            if (d > maxD) maxD = d;
        }
        waveMax = maxD - minD || 1;
        for (const t of tiles) {
            if (t.inWave) t.diagN = ((t.x + t.z) / Math.SQRT2 - minD) / waveMax;
        }
    }


    /* ── ROW RECYCLING ───────────────────────────────────────── */

    function recycleRow(rd) {
        for (const t of rd.cols) {
            if (t.isPil) {
                const i = pillars.indexOf(t);
                if (i !== -1) pillars.splice(i, 1);
            }
        }

        let frontZ = Infinity;
        for (const r of rowData) { if (r.worldZ < frontZ) frontZ = r.worldZ; }

        assignRow(rd, frontZ - RH, false);

        for (const t of rd.cols) {
            t.hit    = true;
            t.inWave = false;
            t.diagN  = null;
            if (!t.isPil) t.floorMesh.visible = true;
            if (t.isPil)  pillars.push(t);
        }
    }


    /* ── STEERING ─────────────────────────────────────────────── */

    // wanderBlend: 0..1, scales the wander component only.
    // Avoidance is always at full strength regardless.
    function computeDesiredHeading(wanderBlend) {
        let dh = 0;

        // Wander (fades in during late swoop)
        dh += Math.sin(T * WANDER_F1 * Math.PI * 2)        * WANDER_A1 * wanderBlend;
        dh += Math.sin(T * WANDER_F2 * Math.PI * 2 + 1.7)  * WANDER_A2 * wanderBlend;

        // Soft centre pull (always active, keeps camera on the grid)
        dh -= camX * CENTRE_K;

        // Clamp heading for tan() stability
        const h = Math.max(-0.55, Math.min(0.55, heading));

        for (const p of pillars) {
            // p.isPil is always true for entries in the pillars array,
            // but guard anyway. Critically: we do NOT filter by p.riseT.
            // The camera avoids all pillar TILES, risen or not.
            if (!p.isPil) continue;

            const dz = camZ - p.z;    // positive = pillar is ahead of camera
            if (dz <= 0 || dz > LOOK_AHEAD) continue;

            // ── Predictive (hard) avoidance ──────────────────────
            // Where will the camera be laterally when it reaches p.z?
            const predCamX = camX - Math.tan(h) * dz;
            const predDx   = p.x - predCamX;   // signed: + = pillar right of predicted path

            if (Math.abs(predDx) < SAFE_R) {
                // Camera is on course to pass within SAFE_R of this pillar.
                // Compute heading needed to achieve SAFE_R clearance:
                //   lateralNeeded * SPEED / dz gives the required heading.
                //   As dz shrinks (pillar getting close), force grows — urgency scaling.
                const lateralNeeded  = SAFE_R - Math.abs(predDx);
                const headingNeeded  = Math.min(AVOID_CAP, lateralNeeded * SPEED / Math.max(dz, 1.0));
                dh += Math.sign(predDx) * headingNeeded;
            }

            // ── Soft lateral repulsion (comfort zone, always active) ─
            // Pushes gently away from nearby pillars even when not
            // directly on collision course. Prevents threading too close.
            const dx = p.x - camX;
            if (Math.abs(dx) < SOFT_R) {
                const soft   = (SOFT_R - Math.abs(dx)) / SOFT_R;
                const zDecay = cl(1.0 - dz / LOOK_AHEAD);
                dh += Math.sign(dx) * soft * zDecay * SOFT_STR;
            }
        }

        return Math.max(-MAX_HEADING, Math.min(MAX_HEADING, dh));
    }


    /* ── TICK ────────────────────────────────────────────────── */

    function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        T   += dt;
        phT += dt;

        /* Phase machine */
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

        /* Wave reveal */
        for (const t of tiles) {
            if (!t.inWave || t.hit) continue;
            if (t.diagN * waveMax <= waveFront) {
                t.hit = true;  t.revealT = T;
                if (!t.isPil) t.floorMesh.visible = true;
            }
        }

        /* Pop bounce */
        for (const t of tiles) {
            if (!t.inWave || t.isPil || t.revealT === null) continue;
            const age = T - t.revealT;
            t.floorMesh.position.y = age < POP_DUR
                ? POP_H * Math.sin(Math.PI * age / POP_DUR) * Math.exp(-3*age/POP_DUR)
                : 0;
        }

        /* Background crossfade */
        if (phase === 'swoop' || phase === 'cruise') {
            renderer.setClearColor(bgA.clone().lerp(bgB, eIO(cl(swoopT / 0.6))));
        }

        /* Camera easing (unchanged — these feel right) */
        const yE     = eIO(swoopT);
        const pitchE = eIn4(swoopT);
        const fwdE   = eFwd(swoopT);

        camY = CAM_Y0 + (CRUISE_Y - CAM_Y0) * yE;
        const pitch = PITCH_DOWN + (PITCH_LEVEL - PITCH_DOWN) * pitchE;

        /* ── Steering ────────────────────────────────────────────
           Avoidance activates at swoopT > 0.40 so the camera has
           already computed a path before pillars start rising at 0.80.
           Wander fades in later (0.70) so early swoop is clean.
        ──────────────────────────────────────────────────────── */
        if (swoopT > 0.40) {
            const wanderBlend = cl((swoopT - 0.70) / 0.30);
            const target = computeDesiredHeading(wanderBlend);
            const force  = (target - heading) * TURN_K - headingRate * TURN_D;
            headingRate += force * dt;
            heading     += headingRate * dt;
            heading      = Math.max(-MAX_HEADING, Math.min(MAX_HEADING, heading));
        }

        /* Move in heading direction
           heading = camera.rotation.y, so:
             forward direction = (-sin(h), 0, -cos(h))
             camX -= sin(h)*speed    camZ -= cos(h)*speed      */
        if (phase === 'swoop' || phase === 'cruise') {
            camX -= Math.sin(heading) * SPEED * fwdE * dt;
            camZ -= Math.cos(heading) * SPEED * fwdE * dt;
        }

        camera.position.set(camX, camY, camZ);
        camera.rotation.order = 'YXZ';
        camera.rotation.x = pitch;
        camera.rotation.y = heading;
        camera.rotation.z = -headingRate * BANK_AMT;   // bank into turns

        /* Row recycling — correct condition:
           row is behind camera when row.worldZ > camZ            */
        for (const rd of rowData) {
            if (rd.worldZ - camZ > RECYCLE_BEHIND) recycleRow(rd);
        }

        /* Pillar rise */
        if (swoopT > 0.80) {
            for (const p of pillars) {
                if (p.riseT !== null) continue;
                const dz = camZ - p.z;
                if (dz > 0 && dz < PIL_TRIG) {
                    p.riseT = T + Math.hypot(p.x - camX, dz) * PIL_STAG;
                }
            }
        }
        for (const p of pillars) {
            if (p.riseT === null) continue;
            const age = Math.max(0, T - p.riseT);
            const t   = eOut3(age / PIL_DUR);
            if (t > 0.001) {
                const h              = p.pilH * t;
                p.pilMesh.scale.y    = h;
                p.pilMesh.position.y = h / 2;
            }
        }

        /* Visibility cull */
        for (const t of tiles) {
            if (!t.hit) continue;
            const dz  = camZ - t.z;
            const vis = dz > -DD_BEHIND && dz < DD_AHEAD;
            t.floorMesh.visible = !t.isPil && vis;
            t.pilMesh.visible   = t.isPil && t.riseT !== null && vis;
        }

        /* Login callback */
        if (!loginFired && swoopT >= LOGIN_AT) {
            loginFired = true;
            if (typeof CITY.onLoginReveal === 'function') CITY.onLoginReveal();
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

            T = 0; phT = 0; phase = 'pre';
            waveFront = 0; swoopT = 0; loginFired = false;
            camX = 0; camY = CAM_Y0; camZ = 0;
            heading = 0; headingRate = 0;

            buildWorld();

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
