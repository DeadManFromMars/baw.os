/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   city.js  —  HEX CITY  (Three.js r128)

   NAVIGATION — target point, not avoidance math
   ──────────────────────────────────────────────
   Every RETARGET_INTERVAL seconds, the camera looks SCAN_Z units
   ahead and samples SCAN_CANDIDATES evenly across the grid width.
   Each candidate X is scored by its distance to the nearest pillar
   at that Z slice. The most open candidate becomes targetX.

   The camera then steers its heading toward targetX using a simple
   angular rate limit. No springs, no prediction math, no oscillation.

   heading = atan2(targetX - camX, STEER_HORIZON)
   then heading is rate-limited to MAX_TURN_RATE rad/sec.

   CAMERA (do not revert)
     rotation.order = 'YXZ' + manual rotation.x — no lookAt()
     camX -= sin(heading) * speed * dt
     camZ -= cos(heading) * speed * dt  (-Z is forward)
     Y  easeInOut   zero vel at both ends
     pitch easeIn4  stays pointing down, tips level at end
     fwd 45% delay  J-curve drop before forward flight

   INFINITE GRID — row recycling
     row.worldZ - camZ > RECYCLE_BEHIND → move row to front
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

    // Navigation
    const SCAN_Z           = 24;    // how far ahead to look for open space
    const SCAN_CANDIDATES  = 11;    // how many X positions to evaluate
    const RETARGET_INTERVAL = 1.8;  // seconds between target updates
    const STEER_HORIZON    = 18;    // angular denominator — lower = tighter turns
    const MAX_TURN_RATE    = 0.5;   // rad/sec max heading change
    const MAX_HEADING      = 0.5;   // clamp heading to ±this (keeps moving forward)
    const GRID_MARGIN      = 3.0;   // don't target within this of grid edge

    // Banking
    const BANK_AMT    = 0.28;
    const BANK_FOLLOW = 5.0;

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
    let heading     = 0;
    let bankAngle   = 0;
    let prevHeading = 0;

    // Navigation state
    let targetX      = 0;    // current navigation target X
    let lastRetarget = 0;    // time of last target update

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

    function tileX(col)         { return col * CW - (COLS * CW) / 2 + CW / 2; }
    function tileZ(worldZ, col) { return worldZ + (col % 2 !== 0 ? RH / 2 : 0); }


    /* ── ROW ASSIGNMENT ─────────────────────────────────────── */

    function assignRow(rd, worldZ, forceFloor) {
        rd.worldZ = worldZ;
        const s = { v: (++rowSeed) * 7919 + 1 };
        for (let col = 0; col < COLS; col++) {
            const t     = rd.cols[col];
            const x     = tileX(col);
            const z     = tileZ(worldZ, col);
            const isPil = !forceFloor && rndR(s) < PIL_PROB;
            const pilH  = isPil ? PIL_MIN + rndR(s) * (PIL_MAX - PIL_MIN) : 0;

            t.x = x;  t.z = z;
            t.isPil = isPil;  t.pilH = pilH;
            t.riseT = null;   t.revealT = null;  t.hit = false;

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


    /* ── NAVIGATION — find best target X ────────────────────────
       Scan Z slice is SCAN_Z units ahead of the camera.
       We look at that Z and score candidate X positions by how
       far each is from the nearest pillar in a Z band around
       that slice. Most open space wins. Ties broken toward camX
       so the camera doesn't take unnecessary detours.
    ─────────────────────────────────────────────────────────── */

    function scoreX(candX, scanZ) {
        // scanZ is the world Z we're scanning (camZ - SCAN_Z = ahead)
        const Z_BAND = RH * 3;   // how wide a Z slice to check
        let minDist = Infinity;

        for (const p of pillars) {
            if (!p.isPil) continue;
            if (Math.abs(p.z - scanZ) > Z_BAND) continue;
            const d = Math.abs(p.x - candX);
            if (d < minDist) minDist = d;
        }

        // Penalise being far from camX (prefer nearby paths over distant ones)
        const detourPenalty = Math.abs(candX - camX) * 0.15;
        return minDist - detourPenalty;
    }

    function pickTargetX() {
        const gridHalf = (COLS * CW) / 2 - GRID_MARGIN;
        const scanZ    = camZ - SCAN_Z;   // world Z we're looking at
        let bestScore  = -Infinity;
        let bestX      = camX;

        for (let i = 0; i < SCAN_CANDIDATES; i++) {
            // Spread candidates evenly across the grid
            const candX = -gridHalf + (2 * gridHalf * i) / (SCAN_CANDIDATES - 1);
            const score = scoreX(candX, scanZ);
            if (score > bestScore) {
                bestScore = score;
                bestX     = candX;
            }
        }
        return bestX;
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
                t.hit = true; t.revealT = T;
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

        /* Camera easing */
        const yE     = eIO(swoopT);
        const pitchE = eIn4(swoopT);
        const fwdE   = eFwd(swoopT);

        camY = CAM_Y0 + (CRUISE_Y - CAM_Y0) * yE;
        const pitch = PITCH_DOWN + (PITCH_LEVEL - PITCH_DOWN) * pitchE;

        /* ── Navigation + steering ───────────────────────────────
           1. Every RETARGET_INTERVAL seconds, pick a new targetX.
           2. Compute desired heading = atan2 toward that target.
           3. Step heading toward desired at MAX_TURN_RATE.
           4. Move in heading direction.
        ──────────────────────────────────────────────────────── */
        if (swoopT > 0.50 && (phase === 'cruise' || phase === 'swoop')) {
            // Retarget periodically
            if (T - lastRetarget > RETARGET_INTERVAL) {
                targetX      = pickTargetX();
                lastRetarget = T;
            }

            // Desired heading = angle toward targetX
            // atan2(dx, horizon) — small horizon = tighter turns
            const dx       = targetX - camX;
            const desired  = Math.max(-MAX_HEADING, Math.min(MAX_HEADING,
                             Math.atan2(dx, STEER_HORIZON)));

            prevHeading    = heading;
            const diff     = desired - heading;
            const maxStep  = MAX_TURN_RATE * dt;
            heading       += Math.max(-maxStep, Math.min(maxStep, diff));
            heading        = Math.max(-MAX_HEADING, Math.min(MAX_HEADING, heading));

            // Bank: smooth follow of actual turn rate
            const turnRate   = (heading - prevHeading) / Math.max(dt, 0.001);
            const targetBank = -turnRate * BANK_AMT;
            bankAngle       += (targetBank - bankAngle) * Math.min(1, BANK_FOLLOW * dt);
        }

        /* Move in heading direction */
        if (phase === 'swoop' || phase === 'cruise') {
            camX -= Math.sin(heading) * SPEED * fwdE * dt;
            camZ -= Math.cos(heading) * SPEED * fwdE * dt;
        }

        camera.position.set(camX, camY, camZ);
        camera.rotation.order = 'YXZ';
        camera.rotation.x = pitch;
        camera.rotation.y = heading;
        camera.rotation.z = bankAngle;

        /* Row recycling */
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
            heading = 0; prevHeading = 0; bankAngle = 0;
            targetX = 0; lastRetarget = 0;

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
