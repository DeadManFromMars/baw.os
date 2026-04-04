/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   city.js  —  HEX CITY  (Three.js r128)
   Terrain: 100% original.
   Navigation: positional repulsion (best iteration).
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

    const CAM_Y0      = 16;
    const CRUISE_Y    = 3.5;
    const PITCH_DOWN  = -Math.PI / 2;
    const PITCH_LEVEL = -0.06;
    const SWOOP_DUR   = 7.0;
    const SPEED       = 2.6;

    const WAVE_DELAY = 0.5;
    const WAVE_SPD   = 14.0;
    const POP_H      = 0.5;
    const POP_DUR    = 0.45;
    const HOLD_DUR   = 0.9;

    const BG_BLACK = 0x000000;
    const BG_CREAM = 0xf5f2ec;

    const REPULSE_R         = 5.5;
    const REPULSE_K         = 28.0;
    const STEER_K           = 1.4;
    const SCAN_SECTORS      = 16;
    const SCAN_RADIUS       = 18;
    const SCAN_STEP         = 1.5;
    const RETARGET_INTERVAL = 2.5;
    const STEER_RATE        = 0.55;

    const BANK_AMT    = 0.18;
    const BANK_SMOOTH = 6.0;

    const PIL_PROB = 0.22;
    const PIL_MIN  = 0.8;
    const PIL_MAX  = 9.0;
    const PIL_TRIG = 42.0;
    const PIL_DUR  = 2.2;
    const PIL_STAG = 0.03;

    const LOGIN_AT  = 0.88;
    const DD_AHEAD  = 72;
    const DD_BEHIND = 10;

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
    let heading   = 0;
    let bankAngle = 0;
    let vx = 0, vz = 0;

    let biasHeading  = 0;
    let lastRetarget = 0;

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
        mFloor   = new THREE.MeshBasicMaterial({ color: C_FLOOR, side: THREE.DoubleSide });
        mPilTop  = new THREE.MeshBasicMaterial({ color: C_PIL_TOP });
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
            t.x = x; t.z = z;
            t.isPil = isPil; t.pilH = pilH;
            t.riseT = null; t.revealT = null; t.hit = false;
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

        let minD = Infinity, maxD = -Infinity;
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


    /* ── NAVIGATION ──────────────────────────────────────────── */

    function pickBiasHeading() {
        let best = -Infinity, bestA = heading;
        for (let i = 0; i < SCAN_SECTORS; i++) {
            const frac  = i / (SCAN_SECTORS - 1);
            const angle = heading - Math.PI * 0.6 + frac * Math.PI * 1.2;
            const sx = Math.sin(angle), sz = -Math.cos(angle);
            let score = 0, ok = true;
            for (let s = SCAN_STEP; s <= SCAN_RADIUS; s += SCAN_STEP) {
                const rx = camX + sx * s, rz = camZ + sz * s;
                let near = Infinity;
                for (const p of pillars) {
                    const d = Math.hypot(p.x - rx, p.z - rz);
                    if (d < near) near = d;
                }
                if (near < 1.0) { ok = false; break; }
                score += near / (1 + s * 0.12);
            }
            if (ok && score > best) { best = score; bestA = angle; }
        }
        return bestA;
    }

    function updateNavigation(dt) {
        let fx = 0, fz = 0, closestDist = Infinity, nearCount = 0;
        for (const p of pillars) {
            const dx = camX - p.x, dz = camZ - p.z;
            const dist = Math.hypot(dx, dz);
            if (dist >= REPULSE_R || dist < 0.01) continue;
            if (dist < closestDist) closestDist = dist;
            nearCount++;
            const t   = 1 - dist / REPULSE_R;
            const str = REPULSE_K * t * t * t / Math.max(dist, 0.5);
            fx += dx * str;
            fz += dz * str;
        }

        const netForce = Math.hypot(fx, fz);
        const stuck = nearCount >= 2
                   && closestDist < REPULSE_R * 0.55
                   && netForce < REPULSE_K * 0.5;
        if (stuck) lastRetarget = 0;

        if (T - lastRetarget > RETARGET_INTERVAL) {
            biasHeading  = pickBiasHeading();
            lastRetarget = T;
        }
        let diff = biasHeading - heading;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steerRate = stuck ? STEER_RATE * 3.0 : STEER_RATE;
        heading += Math.max(-steerRate * dt, Math.min(steerRate * dt, diff));

        const thrust = SPEED * eFwd(swoopT);
        vx = -Math.sin(heading) * thrust + fx * 0.4;
        vz = -Math.cos(heading) * thrust + fz * 0.4;

        const MIN_FWD = SPEED * 0.4;
        const fwdComponent = -vx * Math.sin(heading) - vz * Math.cos(heading);
        if (fwdComponent < MIN_FWD) {
            vx -= Math.sin(heading) * (fwdComponent - MIN_FWD);
            vz -= Math.cos(heading) * (fwdComponent - MIN_FWD);
        }

        const spd = Math.hypot(vx, vz);
        if (spd > SPEED * 2.2) { vx = vx/spd * SPEED*2.2; vz = vz/spd * SPEED*2.2; }

        if (spd > 0.1) {
            const velAngle = Math.atan2(-vx, -vz);
            let hd = velAngle - heading;
            while (hd >  Math.PI) hd -= Math.PI * 2;
            while (hd < -Math.PI) hd += Math.PI * 2;
            heading += hd * Math.min(1, STEER_K * dt);
        }
    }


    /* ── TICK ────────────────────────────────────────────────── */

    function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        T   += dt;
        phT += dt;

        if (phase === 'pre' && T >= WAVE_DELAY)  { phase = 'wave';  phT = 0; waveFront = 0; }
        if (phase === 'wave') {
            waveFront += WAVE_SPD * dt;
            if (waveFront >= waveMax) { phase = 'hold'; phT = 0; }
        }
        if (phase === 'hold' && phT >= HOLD_DUR) { phase = 'swoop'; phT = 0; }
        if (phase === 'swoop') {
            swoopT = Math.min(1, phT / SWOOP_DUR);
            if (swoopT >= 1) { phase = 'cruise'; phT = 0; }
        }

        for (const t of tiles) {
            if (!t.inWave || t.hit) continue;
            if (t.diagN * waveMax <= waveFront) {
                t.hit = true; t.revealT = T;
                if (!t.isPil) t.floorMesh.visible = true;
            }
        }
        for (const t of tiles) {
            if (!t.inWave || t.isPil || t.revealT === null) continue;
            const age = T - t.revealT;
            t.floorMesh.position.y = age < POP_DUR
                ? POP_H * Math.sin(Math.PI * age / POP_DUR) * Math.exp(-3*age/POP_DUR) : 0;
        }

        if (phase === 'swoop' || phase === 'cruise')
            renderer.setClearColor(bgA.clone().lerp(bgB, eIO(cl(swoopT / 0.6))));

        const yE     = eIO(swoopT);
        const pitchE = eIn4(swoopT);
        const fwdE   = eFwd(swoopT);
        camY  = CAM_Y0 + (CRUISE_Y - CAM_Y0) * yE;
        const pitch = PITCH_DOWN + (PITCH_LEVEL - PITCH_DOWN) * pitchE;

        if (phase === 'swoop' || phase === 'cruise') {
            const prevH = heading;

            if (swoopT > 0.50) {
                updateNavigation(dt);
            } else {
                vx = -Math.sin(heading) * SPEED * fwdE;
                vz = -Math.cos(heading) * SPEED * fwdE;
            }

            camX += vx * dt;
            camZ += vz * dt;

            const dh = heading - prevH;
            bankAngle += (-(dh / Math.max(dt, 0.001)) * BANK_AMT - bankAngle)
                       * Math.min(1, BANK_SMOOTH * dt);
        }

        camera.position.set(camX, camY, camZ);
        camera.rotation.order = 'YXZ';
        camera.rotation.x = pitch;
        camera.rotation.y = heading;
        camera.rotation.z = bankAngle;

        for (const rd of rowData) {
            if (rd.worldZ - camZ > RECYCLE_BEHIND) recycleRow(rd);
        }

        if (swoopT > 0.80) {
            for (const p of pillars) {
                if (p.riseT !== null) continue;
                const dz = camZ - p.z;
                if (dz > 0 && dz < PIL_TRIG)
                    p.riseT = T + Math.hypot(p.x - camX, dz) * PIL_STAG;
            }
        }
        for (const p of pillars) {
            if (p.riseT === null) continue;
            const age = Math.max(0, T - p.riseT);
            const t   = eOut3(age / PIL_DUR);
            if (t > 0.001) {
                const h = p.pilH * t;
                p.pilMesh.scale.y    = h;
                p.pilMesh.position.y = h / 2;
            }
        }

        for (const t of tiles) {
            if (!t.hit) continue;
            const dz  = camZ - t.z;
            const vis = dz > -DD_BEHIND && dz < DD_AHEAD;
            t.floorMesh.visible = !t.isPil && vis;
            t.pilMesh.visible   = t.isPil && t.riseT !== null && vis;
        }

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
            heading = 0; bankAngle = 0; vx = 0; vz = 0;
            biasHeading = 0; lastRetarget = 0;

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
