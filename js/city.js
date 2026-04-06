/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   city.js  —  HEX CITY  (Three.js r128)
   Terrain    : 100% original.
   Navigation : straight-line cruise with slow cinematic pan/look.
                Infinite, seamless, no recording needed.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SceneAudio  —  LOGIN-SCENE AMBIENT MUSIC

   Fades "The Edge.mp3" in when the hex wave starts, and fades it
   out on correct login before the SECURED flash plays.

   TUNING — adjust these four constants to taste:
     VOLUME       peak volume (0.0 – 1.0)
     FADE_IN_DUR  seconds to reach peak volume after wave starts
     FADE_OUT_DUR seconds to silence after correct login
     SRC          path to the audio file
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SceneAudio = (() => {

    /* ── TUNING ─────────────────────────────────────── */
    const VOLUME       = 0.35;                        // peak volume  0.0 – 1.0
    const FADE_IN_DUR  = 3.5;                         // seconds to fade in
    const FADE_OUT_DUR = 1.8;                         // seconds to fade out
    const SRC          = 'Audio/Music/The Edge.mp3';  // path relative to index.html
    /* ─────────────────────────────────────────────── */

    let audio        = null;
    let fadeTimer    = null;
    let started      = false;

    /* Smoothly ramp audio.volume toward `target` over `durationSec`.
       Calls `onDone` when finished (optional). */
    function fadeTo(target, durationSec, onDone) {
        if (!audio) return;
        clearInterval(fadeTimer);

        const STEPS    = 60;
        const interval = (durationSec * 1000) / STEPS;
        const delta    = (target - audio.volume) / STEPS;

        fadeTimer = setInterval(() => {
            audio.volume = Math.max(0, Math.min(1, audio.volume + delta));
            if (Math.abs(audio.volume - target) < 0.005) {
                audio.volume = target;
                clearInterval(fadeTimer);
                if (onDone) onDone();
            }
        }, interval);
    }

    return {
        /* Fade music in — called when the hex wave begins.
           Idempotent: safe to call multiple times. */
        fadeIn() {
            if (started) return;
            started = true;

            audio        = new Audio(SRC);
            audio.loop   = true;
            audio.volume = 0;

            // Browser autoplay policy: play() returns a Promise.
            // Silently swallow the rejection if blocked.
            audio.play().catch(() => {
                console.warn('[SceneAudio] Autoplay blocked — music will start on first user interaction.');
                const resume = () => { audio.play().catch(() => {}); document.removeEventListener('click', resume); };
                document.addEventListener('click', resume, { once: true });
            });

            fadeTo(VOLUME, FADE_IN_DUR);
        },

        /* Fade music out — called on correct login.
           `onDone` is invoked when volume reaches 0. */
        fadeOut(onDone) {
            if (!audio) { if (onDone) onDone(); return; }
            fadeTo(0, FADE_OUT_DUR, onDone);
        },

        /* Convenience: set volume directly (e.g. from a settings panel). */
        setVolume(v) {
            if (audio) audio.volume = Math.max(0, Math.min(1, v));
        },
    };

})();


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
    const CRUISE_Y    = 5.5;    // cruise height
    const PITCH_DOWN  = -Math.PI / 2;
    const SWOOP_DUR   = 7.0;
    const SPEED       = 2.2;    // forward speed (units/sec)

    const WAVE_DELAY = 3.0;
    const WAVE_SPD   = 14.0;
    const POP_H      = 0.5;
    const POP_DUR    = 0.45;
    const HOLD_DUR   = 0.9;

    const BG_BLACK = 0x000000;
    const BG_CREAM = 0xf5f2ec;

    const PIL_PROB = 0.22;
    const PIL_MIN  = 0.8;
    const PIL_MAX  = 9.0;
    const PIL_TRIG = 42.0;
    const PIL_DUR  = 2.2;
    const PIL_STAG = 0.03;

    const LOGIN_AT  = 0.88;
    const DD_AHEAD  = 72;
    const DD_BEHIND = 10;

    // Wrong-password corrupt effect
    const CORRUPT_DUR   = 0.9;  // seconds the effect lasts
    const CORRUPT_SHAKE = 0.18; // max camera shake in world units
    const CORRUPT_TWIST = 0.12; // max roll twist in radians
    let   corruptT      = 0;    // counts down from CORRUPT_DUR to 0
    let   corruptDirty  = false; // true while corrupt needs a reset pass

    // Glass shatter
    const COLLIDE_R    = 1.6;
    const SHARD_COUNT  = 22;
    const SHARD_LIFE   = 0.9;
    const SHARD_SPEED  = 8.0;

    // Scorch marks
    const SCORCH_LIFE  = 6.0;

    const C_FLOOR    = 0xd0ccc4;
    const C_PIL_TOP  = 0xede8df;
    const C_PIL_SIDE = 0xb0aca4;

    /* ── CINEMATIC PAN TUNING ───────────────────────────────────
       Camera moves dead-straight forward. Yaw and pitch drift on
       slow incommensurate sines so it never looks repetitive.
       Y also breathes slightly.
    ─────────────────────────────────────────────────────────── */

    // Yaw (left/right look) — layered sines, amplitude in radians
    const YAW_1_AMP = 0.28;   const YAW_1_PER = 41.0;
    const YAW_2_AMP = 0.14;   const YAW_2_PER = 23.0;
    const YAW_3_AMP = 0.06;   const YAW_3_PER = 11.0;

    // Pitch (up/down look)
    const PIT_1_AMP = 0.10;   const PIT_1_PER = 37.0;
    const PIT_2_AMP = 0.05;   const PIT_2_PER = 17.0;

    // Y height drift
    const Y_1_AMP = 0.8;      const Y_1_PER  = 29.0;
    const Y_2_AMP = 0.3;      const Y_2_PER  = 13.0;

    // Bank follows yaw rate
    const BANK_AMT    = 0.18;
    const BANK_SMOOTH = 5.0;

    /* ── STATE ──────────────────────────────────────────────── */

    let renderer, scene, camera, clock;
    let raf = null;
    let T = 0, phT = 0;
    let phase = 'pre';
    let waveFront = 0, waveMax = 0;
    let swoopT = 0;
    let loginFired = false;

    let camZ      = 0;   // only Z moves (forward)
    let bankAngle = 0;
    let prevYaw   = 0;

    // Shard pool
    let shards = [];
    let shardMeshPool = [];
    let shardGeo, shardMat;

    // Scorch marks — persistent dark hex on floor
    let scorches = [];
    let scorchMeshPool = [];
    let scorchGeo, scorchMat;

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
    function eIO(t)  { t=cl(t); return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
    function eIn4(t) { t=cl(t); return t*t*t*t; }
    function eOut3(t){ return 1-Math.pow(1-cl(t),3); }

    /* ── CINEMATIC CAMERA FUNCTIONS ─────────────────────────── */

    function camYaw(t) {
        const TAU = Math.PI * 2;
        return YAW_1_AMP * Math.sin(TAU * t / YAW_1_PER + 0.0)
             + YAW_2_AMP * Math.sin(TAU * t / YAW_2_PER + 1.3)
             + YAW_3_AMP * Math.sin(TAU * t / YAW_3_PER + 2.7);
    }

    function camPitch(t) {
        const TAU = Math.PI * 2;
        // Base pitch is slightly down to see the city, sines add gentle look-up/down
        return -0.06
             + PIT_1_AMP * Math.sin(TAU * t / PIT_1_PER + 0.5)
             + PIT_2_AMP * Math.sin(TAU * t / PIT_2_PER + 1.8);
    }

    function camY(t) {
        const TAU = Math.PI * 2;
        return CRUISE_Y
             + Y_1_AMP * Math.sin(TAU * t / Y_1_PER + 0.3)
             + Y_2_AMP * Math.sin(TAU * t / Y_2_PER + 2.1);
    }

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

        // Shard — hex cylinder chunk
        shardGeo = new THREE.CylinderGeometry(R - GAP, R - GAP, 1, 6);
        shardGeo.rotateY(Math.PI / 6);
        shardMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 1 });

        // Scorch — flat hex on the floor, dark red
        scorchGeo = new THREE.ShapeGeometry((() => {
            const sh = new THREE.Shape();
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i;
                i === 0 ? sh.moveTo((R-GAP)*Math.cos(a), (R-GAP)*Math.sin(a))
                        : sh.lineTo((R-GAP)*Math.cos(a), (R-GAP)*Math.sin(a));
            }
            sh.closePath(); return sh;
        })());
        scorchGeo.rotateX(-Math.PI / 2);
        scorchMat = new THREE.MeshBasicMaterial({
            color: 0x8b0000, transparent: true, opacity: 0.85,
            depthWrite: false, side: THREE.DoubleSide,
        });
    }

    /* ── TILE POSITION ──────────────────────────────────────── */

    function tileX(col)         { return col * CW - (COLS * CW) / 2 + CW / 2; }
    function tileZ(worldZ, col) { return worldZ + (col % 2 !== 0 ? RH / 2 : 0); }

    /* ── ROW ASSIGNMENT ─────────────────────────────────────── */

    function assignRow(rd, worldZ) {
        rd.worldZ = worldZ;
        const s = { v: (++rowSeed) * 7919 + 1 };
        for (let col = 0; col < COLS; col++) {
            const t     = rd.cols[col];
            const x     = tileX(col), z = tileZ(worldZ, col);
            const isPil = rndR(s) < PIL_PROB;
            const pilH  = isPil ? PIL_MIN + rndR(s) * (PIL_MAX - PIL_MIN) : 0;
            t.x = x; t.z = z; t.isPil = isPil; t.pilH = pilH;
            t.riseT = null; t.revealT = null; t.hit = false; t.shattered = false;
            t.floorMesh.position.set(x, 0, z); t.floorMesh.visible = false;
            t.pilMesh.position.set(x, 0, z);
            t.pilMesh.scale.set(1, 0.001, 1); t.pilMesh.visible = false;
        }
    }

    /* ── BUILD WORLD ─────────────────────────────────────────── */

    function buildWorld() {
        rowSeed = 1; tiles = []; pillars = []; rowData = [];
        makeGeo();

        for (let ri = 0; ri < POOL_ROWS; ri++) {
            const worldZ = (ROWS_BACK - ri) * RH;
            const inWave = Math.abs(worldZ) <= WAVE_ZONE_Z;
            const rd     = { worldZ, cols: [] };

            for (let col = 0; col < COLS; col++) {
                const floorMesh = new THREE.Mesh(floorGeo, mFloor); scene.add(floorMesh);
                const pilMesh   = new THREE.Mesh(pilGeo,   mPil);   scene.add(pilMesh);
                const t = { x:0,z:0,isPil:false,pilH:0,riseT:null,revealT:null,hit:false,
                            inWave,diagN:null,floorMesh,pilMesh };
                rd.cols.push(t); tiles.push(t);
            }

            assignRow(rd, worldZ);

            for (const t of rd.cols) {
                t.inWave = inWave; t.hit = !inWave;
                if (!inWave && !t.isPil) t.floorMesh.visible = true;
                if (t.isPil) pillars.push(t);
            }
            rowData.push(rd);
        }

        let minD = Infinity, maxD = -Infinity;
        for (const t of tiles) {
            if (!t.inWave) continue;
            const d = (t.x + t.z) / Math.SQRT2;
            minD = Math.min(minD, d); maxD = Math.max(maxD, d);
        }
        waveMax = maxD - minD || 1;
        for (const t of tiles)
            if (t.inWave) t.diagN = ((t.x + t.z) / Math.SQRT2 - minD) / waveMax;
    }

    /* ── ROW RECYCLING ───────────────────────────────────────── */

    function recycleRow(rd) {
        for (const t of rd.cols) {
            if (t.isPil) { const i = pillars.indexOf(t); if (i !== -1) pillars.splice(i, 1); }
        }
        let frontZ = Infinity;
        for (const r of rowData) if (r.worldZ < frontZ) frontZ = r.worldZ;
        assignRow(rd, frontZ - RH);
        for (const t of rd.cols) {
            t.hit = true; t.inWave = false; t.diagN = null;
            if (!t.isPil) t.floorMesh.visible = true;
            if (t.isPil)  pillars.push(t);
        }
    }

    /* ── SHATTER + EFFECTS ───────────────────────────────────── */

    function spawnShatter(px, impactY, pz, pilH) {
        // ── 1. Pillar chunks fly outward ──
        const CHUNKS = 6;
        const chunkH = pilH / CHUNKS;
        for (let i = 0; i < CHUNKS; i++) {
            const chunkCY = chunkH * (i + 0.5);
            const angle   = Math.random() * Math.PI * 2;
            const outSpd  = SHARD_SPEED * (0.4 + Math.random() * 0.6);
            const upSpd   = (2.0 + Math.random() * 4.0) * (1 + Math.abs(chunkCY - impactY) * 0.2);
            const vx = Math.cos(angle) * outSpd;
            const vz = Math.sin(angle) * outSpd;
            const vy = upSpd;
            let mesh = shardMeshPool.length > 0 ? shardMeshPool.pop()
                     : (() => { const m = new THREE.Mesh(shardGeo, shardMat.clone()); scene.add(m); return m; })();
            const sxz = 0.6 + Math.random() * 0.5;
            mesh.scale.set(sxz, chunkH * (0.7 + Math.random() * 0.4), sxz);
            mesh.position.set(px, chunkCY, pz);
            mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
            mesh.visible = true; mesh.material.opacity = 1;
            shards.push({ mesh, vx, vy, vz, age: 0, rotX: (Math.random()-0.5)*6, rotZ: (Math.random()-0.5)*6 });
        }
        // Splinters
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd   = SHARD_SPEED * (0.8 + Math.random());
            let mesh = shardMeshPool.length > 0 ? shardMeshPool.pop()
                     : (() => { const m = new THREE.Mesh(shardGeo, shardMat.clone()); scene.add(m); return m; })();
            mesh.scale.set(0.15 + Math.random()*0.2, 0.15 + Math.random()*0.3, 0.15 + Math.random()*0.2);
            mesh.position.set(px+(Math.random()-0.5)*0.5, impactY+(Math.random()-0.5)*0.5, pz+(Math.random()-0.5)*0.5);
            mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
            mesh.visible = true; mesh.material.opacity = 1;
            shards.push({ mesh, vx: Math.cos(angle)*spd, vy: 3+Math.random()*6, vz: Math.sin(angle)*spd,
                          age: 0, rotX: (Math.random()-0.5)*10, rotZ: (Math.random()-0.5)*10 });
        }

        // ── 2. Scorch mark on floor ──
        let sm = scorchMeshPool.length > 0 ? scorchMeshPool.pop()
               : (() => { const m = new THREE.Mesh(scorchGeo, scorchMat.clone()); scene.add(m); return m; })();
        sm.position.set(px, 0.02, pz);
        sm.rotation.y = Math.random() * Math.PI;
        sm.visible = true; sm.material.opacity = 0.85;
        scorches.push({ mesh: sm, age: 0 });
    }

    function updateShards(dt) {
        for (let i = shards.length - 1; i >= 0; i--) {
            const s = shards[i];
            s.age += dt;
            if (s.age >= SHARD_LIFE) {
                s.mesh.visible = false; shardMeshPool.push(s.mesh); shards.splice(i, 1); continue;
            }
            const t = s.age / SHARD_LIFE;
            s.vy -= 12 * dt;
            s.mesh.position.x += s.vx * dt;
            s.mesh.position.y += s.vy * dt;
            s.mesh.position.z += s.vz * dt;
            s.mesh.rotation.x += s.rotX * dt;
            s.mesh.rotation.z += s.rotZ * dt;
            s.mesh.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        }
    }

    function updateScorches(dt) {
        for (let i = scorches.length - 1; i >= 0; i--) {
            const s = scorches[i];
            s.age += dt;
            if (s.age >= SCORCH_LIFE) {
                s.mesh.visible = false; scorchMeshPool.push(s.mesh); scorches.splice(i, 1); continue;
            }
            // Fade in fast, linger, then fade out slowly in last 30%
            const t = s.age / SCORCH_LIFE;
            s.mesh.material.opacity = t < 0.05 ? t / 0.05 * 0.85
                                    : t > 0.70  ? (1 - (t - 0.70) / 0.30) * 0.85
                                    : 0.85;
        }
    }

    /* ── SKYBOX ──────────────────────────────────────────────── */

    const SKY_Y        = 9;
    const SKY_SPREAD   = 32;
    const SKY_FAR      = 180;
    const STREAK_COUNT = 4;
    const STREAK_SPEED = 1.5;   // slower
    const STREAK_TILE  = 140;
    const STREAK_DELAY = 1.0;

    let skyTileOffset = 0;
    let skyStreaks     = [];
    let cruiseTime    = 0;

    function buildSky() {
        for (let i = 0; i < STREAK_COUNT; i++) {
            const lane  = (Math.random() - 0.5) * SKY_SPREAD * 0.80;
            const width = 0.2 + Math.random() * 0.35;
            const len   = 22 + Math.random() * 28;
            const zOff  = (i / STREAK_COUNT) * STREAK_TILE + Math.random() * 10;
            const op    = 0.55 + Math.random() * 0.35;

            // Simple quad — 4 verts, 2 triangles, all straight
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
            geo.setIndex([0,1,2, 1,3,2]);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xee1111, transparent: true, opacity: 0,
                side: THREE.DoubleSide, depthWrite: false,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.frustumCulled = false;
            scene.add(mesh);
            skyStreaks.push({ mesh, geo, zOff, lane, width, len, baseOp: op });
        }
    }

    function updateSky(cx, cz, curPhase) {
        if (curPhase === 'cruise') cruiseTime += 0.016;
        else cruiseTime = 0;
        const streakAlpha = Math.min(1, Math.max(0, (cruiseTime - STREAK_DELAY) / 1.5));

        skyTileOffset = (skyTileOffset + STREAK_SPEED * 0.016) % STREAK_TILE;

        for (const s of skyStreaks) {
            // nearZ starts behind camera, scrolls forward into distance
            // offset by zOff so each streak is staggered across the tile period
            const raw   = (skyTileOffset + s.zOff) % STREAK_TILE;
            const nearZ = cz + 8 - raw;          // starts 8 units behind camera
            const farZ  = nearZ - s.len;

            const nearDepth = cz - nearZ;         // negative = behind, positive = ahead
            const farDepth  = cz - farZ;
            const farT  = Math.min(1, Math.max(0, farDepth  / SKY_FAR));

            const nearX = cx + s.lane;
            const farX  = cx + s.lane * (1 - farT);
            const hw    = s.width * 0.5;

            // Fade out as far end approaches vanishing point
            const fadeOut = Math.pow(1 - farT, 0.8);
            s.mesh.material.opacity = s.baseOp * fadeOut * streakAlpha;

            const pos = s.geo.attributes.position;
            pos.setXYZ(0, nearX - hw, SKY_Y, nearZ);
            pos.setXYZ(1, nearX + hw, SKY_Y, nearZ);
            pos.setXYZ(2, farX  - hw, SKY_Y, farZ);
            pos.setXYZ(3, farX  + hw, SKY_Y, farZ);
            pos.needsUpdate = true;
            s.geo.computeBoundingSphere();
        }
    }

    function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        T   += dt; phT += dt;

        if (phase === 'pre'  && T  >= WAVE_DELAY) { phase = 'wave';  phT = 0; waveFront = 0; SceneAudio.fadeIn(); }
        if (phase === 'wave') {
            waveFront += WAVE_SPD * dt;
            if (waveFront >= waveMax) { phase = 'hold'; phT = 0; }
        }
        if (phase === 'hold'  && phT >= HOLD_DUR)  { phase = 'swoop'; phT = 0; }
        if (phase === 'swoop') {
            swoopT = Math.min(1, phT / SWOOP_DUR);
            if (swoopT >= 1) { phase = 'cruise'; phT = 0; }
        }

        /* — wave tile reveal — */
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
                ? POP_H * Math.sin(Math.PI*age/POP_DUR) * Math.exp(-3*age/POP_DUR) : 0;
        }

        /* — background — */
        if (phase === 'swoop' || phase === 'cruise')
            renderer.setClearColor(bgA.clone().lerp(bgB, eIO(cl(swoopT / 0.6))));

        /* ── camera ── */
        const yE     = eIO(swoopT);
        const pitchE = eIn4(swoopT);

        let cx = 0, cy, cz, yaw, pitch;

        if (phase === 'swoop' || phase === 'cruise') {
            // Z advances forward continuously — the only thing that moves "physically"
            camZ -= SPEED * (phase === 'cruise' ? 1 : eIO(cl((swoopT - 0.45) / 0.55))) * dt;

            const cruiseY = camY(T);
            cy = CAM_Y0 + (cruiseY - CAM_Y0) * yE;
            cz = camZ;

            // During swoop, yaw/pitch animate from looking-down to cruise look
            const cruiseYaw   = camYaw(T);
            const cruisePitch = camPitch(T);
            yaw   = cruiseYaw   * yE;
            pitch = PITCH_DOWN + (cruisePitch - PITCH_DOWN) * pitchE;

            // Bank from yaw rate
            const dh = yaw - prevYaw;
            bankAngle += (-(dh / Math.max(dt, 0.001)) * BANK_AMT - bankAngle)
                       * Math.min(1, BANK_SMOOTH * dt);
            prevYaw = yaw;

        } else {
            // pre / wave / hold — stationary bird's eye
            cy    = CAM_Y0;
            cz    = 0;
            yaw   = 0;
            pitch = PITCH_DOWN;
            bankAngle = 0;
        }

        camera.position.set(cx, cy, cz);
        camera.rotation.order = 'YXZ';
        camera.rotation.x = pitch;
        camera.rotation.y = yaw;
        camera.rotation.z = bankAngle;

        /* — corrupt effect — */
        if (corruptT > 0) {
            corruptT = Math.max(0, corruptT - dt);
            const p = corruptT / CORRUPT_DUR;
            const e = p * p;

            for (const t of tiles) {
                if (!t.hit) continue;
                const dz = cz - t.z;
                if (dz < -DD_BEHIND || dz > DD_AHEAD) continue;
                const nx = Math.sin(t.x * 7.3  + T * 190 + corruptT * 44) * Math.cos(t.z * 5.1 + T * 230);
                const ny = Math.sin(t.x * 11.7  + t.z * 8.3 + T * 160);
                const nz = Math.cos(t.x * 9.1   + T * 210 + corruptT * 33) * Math.sin(t.z * 6.7);
                const amp = e * 2.2;
                t.floorMesh.position.set(t.x + nx*amp*0.8, ny*amp*1.4, t.z + nz*amp*0.8);
                if (t.isPil && !t.shattered && t.riseT !== null) {
                    const age = Math.max(0, T - t.riseT);
                    const risen = eOut3(age / PIL_DUR);
                    t.pilMesh.scale.set(1+Math.abs(nx)*e*1.1, Math.max(0.05,risen+ny*e*1.8)*t.pilH, 1+Math.abs(nz)*e*1.1);
                    t.pilMesh.position.set(t.x+nx*e*1.2, t.pilMesh.scale.y/2, t.z+nz*e*1.2);
                    if (Math.abs(nx*nz) > 0.82 && e > 0.25) t.pilMesh.position.y += ny*e*5;
                }
            }

        } else if (corruptT === 0 && corruptDirty) {
            corruptDirty = false;
            for (const t of tiles) {
                if (!t.hit) continue;
                t.floorMesh.position.set(t.x, 0, t.z);
                if (t.isPil && !t.shattered && t.riseT !== null) {
                    const age   = Math.max(0, T - t.riseT);
                    const risen = eOut3(age / PIL_DUR);
                    t.pilMesh.scale.set(1, t.pilH * risen, 1);
                    t.pilMesh.position.set(t.x, t.pilH * risen / 2, t.z);
                }
            }
        }

        /* — row recycling — */
        for (const rd of rowData)
            if (rd.worldZ - cz > RECYCLE_BEHIND) recycleRow(rd);

        /* — pillar rise — */
        if (swoopT > 0.80 || phase === 'cruise') {
            for (const p of pillars) {
                if (p.riseT !== null) continue;
                const dz = cz - p.z;
                if (dz > 0 && dz < PIL_TRIG)
                    p.riseT = T + Math.hypot(p.x - cx, dz) * PIL_STAG;
            }
        }
        for (const p of pillars) {
            if (p.riseT === null) continue;
            const age = Math.max(0, T - p.riseT);
            const t   = eOut3(age / PIL_DUR);
            if (t > 0.001) { p.pilMesh.scale.y = p.pilH*t; p.pilMesh.position.y = p.pilH*t/2; }
        }

        /* — collision + shatter — */
        if (phase === 'cruise') {
            for (const p of pillars) {
                if (p.shattered) continue;
                if (p.riseT === null) continue;
                const age = T - p.riseT;
                if (age < 0) continue;
                const dx = cx - p.x, dz2 = cz - p.z;
                const pilTop = p.pilH * eOut3(Math.max(0, age) / PIL_DUR);
                const inY = cy <= pilTop && cy >= 0;
                if (inY && Math.sqrt(dx*dx + dz2*dz2) < COLLIDE_R) {
                    p.shattered = true;
                    spawnShatter(p.x, cy, p.z, p.pilH);
                }
            }
        }

        /* — visibility — */
        for (const t of tiles) {
            if (!t.hit) continue;
            const dz = cz - t.z, vis = dz > -DD_BEHIND && dz < DD_AHEAD;
            t.floorMesh.visible = !t.isPil && vis;
            if (t.isPil) t.pilMesh.visible = !t.shattered && t.riseT !== null && vis;
        }

        /* — update effects — */
        updateShards(dt);
        updateScorches(dt);

        /* — login — */
        if (!loginFired && swoopT >= LOGIN_AT) {
            loginFired = true;
            if (typeof CITY.onLoginReveal === 'function') CITY.onLoginReveal();
        }

        /* — sky — */
        updateSky(cx ?? 0, cz ?? 0, phase);

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
            camZ = 0; bankAngle = 0; prevYaw = 0;
            shards = []; shardMeshPool = [];
            scorches = []; scorchMeshPool = [];
            skyStreaks = []; skyTileOffset = 0; cruiseTime = 0;

            buildWorld();
            buildSky();

            camera.position.set(0, CAM_Y0, 0);
            camera.rotation.order = 'YXZ';
            camera.rotation.x = PITCH_DOWN;

            canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:block;';
            canvas.style.zIndex  = '500';

            // Corrupt overlay
            let overlay = document.getElementById('cityCorruptOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'cityCorruptOverlay';
                overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:501;opacity:0;transition:none;';
                document.body.appendChild(overlay);
            }


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

        // Call this on wrong password — geometry warps and glitches
        corruptEffect() {
            corruptT = CORRUPT_DUR;
            corruptDirty = true;
        },

        stop() {
            if (raf) { cancelAnimationFrame(raf); raf = null; }
        },
    };

})();
