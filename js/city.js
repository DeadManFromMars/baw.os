/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   city.js — HEX CITY intro (Three.js via three-loader.js); returning
             visitors skip straight to the cruise

   Phases:  pre → wave → hold → swoop → cruise
     pre     black screen, bird's-eye camera
     wave    floor hexes pop in along a diagonal; intro music fades in
     hold    short pause
     swoop   camera drops and tilts forward, background fades to cream;
             at LOGIN_AT the passphrase box is revealed (onLoginReveal)
     cruise  endless straight flight over recycled rows of hexes;
             pillars rise ahead and shatter if the camera hits them

   CITY.start()              session.js (from the "click to begin" click)
   CITY.onLoginReveal        session.js sets it
   CITY.toBackground()       drop the canvas behind the login box
   CITY.corruptEffect()      login.js, wrong passphrase: geometry glitches
   CITY.fadeOutMusic(done)   login.js, correct passphrase
   CITY.stop()               login.js, after the music has faded
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CITY = (() => {

    /* ── GRID ─────────────────────────────────────────────── */
    const R   = 1.0;                // hex radius
    const GAP = 0.04;               // gap between hexes
    const CW  = R * 1.5;            // column spacing
    const RH  = R * Math.sqrt(3);   // row spacing

    const COLS           = 32;
    const POOL_ROWS      = 80;      // rows kept in memory, recycled as the camera moves
    const ROWS_BACK      = 8;       // rows behind the start position
    const RECYCLE_BEHIND = 8;       // recycle a row once it's this far behind the camera
    const WAVE_ZONE_Z    = 14;      // rows within this distance take part in the pop-in wave

    /* ── TIMING / CAMERA ──────────────────────────────────── */
    const CAM_Y0     = 16;          // bird's-eye height
    const CRUISE_Y   = 5.5;
    const PITCH_DOWN = -Math.PI / 2;
    const SWOOP_DUR  = 7.0;
    const SPEED      = 2.2;         // forward speed (units/sec)

    const WAVE_DELAY = 3.0;
    const WAVE_SPD   = 14.0;
    const POP_H      = 0.5;
    const POP_DUR    = 0.45;
    const HOLD_DUR   = 0.9;
    const LOGIN_AT   = 0.88;        // swoop progress at which the login box appears

    const BG_BLACK = 0x000000;
    const BG_CREAM = 0xf5f2ec;

    /* ── PILLARS ──────────────────────────────────────────── */
    const PIL_PROB = 0.22;          // chance a hex is a pillar
    const PIL_MIN  = 0.8;
    const PIL_MAX  = 9.0;
    const PIL_TRIG = 42.0;          // start rising when this far ahead
    const PIL_DUR  = 2.2;
    const PIL_STAG = 0.03;          // rise delay per unit of distance

    const DD_AHEAD  = 72;           // draw distance
    const DD_BEHIND = 10;

    const C_FLOOR    = 0xd0ccc4;
    const C_PIL_TOP  = 0xede8df;
    const C_PIL_SIDE = 0xb0aca4;

    /* ── WRONG-PASSPHRASE GLITCH ──────────────────────────── */
    const CORRUPT_DUR = 0.9;        // seconds

    /* ── SHATTER ──────────────────────────────────────────── */
    const COLLIDE_R   = 1.6;
    const SHARD_LIFE  = 0.9;
    const SHARD_SPEED = 8.0;
    const SCORCH_LIFE = 6.0;

    /* ── CINEMATIC DRIFT ──────────────────────────────────────
       The camera flies dead straight; yaw, pitch and height drift on
       layered sines with unrelated periods so it never looks looped.
       Each entry is [amplitude, period in seconds, phase]. */
    const YAW_WAVES   = [[0.28, 41, 0.0], [0.14, 23, 1.3], [0.06, 11, 2.7]];
    const PITCH_WAVES = [[0.10, 37, 0.5], [0.05, 17, 1.8]];
    const Y_WAVES     = [[0.8,  29, 0.3], [0.3,  13, 2.1]];
    const PITCH_BASE  = -0.06;      // slightly down, to see the city
    const BANK_AMT    = 0.18;       // roll into turns
    const BANK_SMOOTH = 5.0;

    /* ── SKY STREAKS ──────────────────────────────────────── */
    const SKY_Y        = 9;
    const SKY_SPREAD   = 32;
    const SKY_FAR      = 180;
    const STREAK_COUNT = 4;
    const STREAK_SPEED = 1.5;
    const STREAK_TILE  = 140;
    const STREAK_DELAY = 1.0;       // seconds into cruise before they fade in

    /* ── INTRO MUSIC ──────────────────────────────────────── */
    const MUSIC_SRC      = 'Audio/Music/Hex/The Edge.mp3';
    const MUSIC_VOLUME   = 0.35;
    const MUSIC_FADE_IN  = 3.5;     // seconds
    const MUSIC_FADE_OUT = 1.8;


    /* ── STATE ────────────────────────────────────────────── */
    let renderer, scene, camera, clock, raf = null;
    let T = 0, phT = 0, phase = 'pre';
    let waveFront = 0, waveMax = 0, swoopT = 0;
    let loginFired = false;
    let camZ = 0, bankAngle = 0, prevYaw = 0;
    let corruptT = 0;
    let cruiseTime = 0, skyOffset = 0;

    let tiles = [], rows = [], frontZ = 0;   // frontZ: the farthest row ahead
    let shards = [], shardPool = [];
    let scorches = [], scorchPool = [];
    let skyStreaks = [];

    let floorGeo, pilGeo, scorchGeo;
    let mFloor, mPil, mShard, mScorch;
    let floorInst, pilInst;         // every floor hex in one draw, every pillar in another
    let bgA, bgB, bgNow;          // THREE.Colors, made in start() (THREE loads as a module, after this file)

    let music = null, musicFade = null;


    /* ── HELPERS ──────────────────────────────────────────── */

    const TAU = Math.PI * 2;
    const cl    = t => Math.max(0, Math.min(1, t));
    const eIO   = t => (t = cl(t)) < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const eIn4  = t => (t = cl(t)) * t * t * t;
    const eOut3 = t => 1 - Math.pow(1 - cl(t), 3);

    const sumWaves = (waves, t) => waves.reduce((s, [amp, per, ph]) => s + amp * Math.sin(TAU * t / per + ph), 0);

    const tileX = col         => col * CW - (COLS * CW) / 2 + CW / 2;
    const tileZ = (rowZ, col) => rowZ + (col % 2 ? RH / 2 : 0);   // odd columns sit half a row down


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

    function makeGeo() {
        const r = R - GAP;
        floorGeo = new THREE.ShapeGeometry(hexShape(r));
        floorGeo.rotateX(-Math.PI / 2);
        scorchGeo = floorGeo;                        // same flat hex, different material

        pilGeo = new THREE.CylinderGeometry(r, r, 1, 6);   // also used for shards
        pilGeo.rotateY(Math.PI / 6);
        // All pillars are one draw, so the lighter top is a vertex colour rather than
        // a second material (the cylinder's groups: 0 sides, 1 top, 2 bottom)
        const cols = new Float32Array(pilGeo.attributes.position.count * 3);
        const side = new THREE.Color(C_PIL_SIDE), top = new THREE.Color(C_PIL_TOP), cap = pilGeo.groups[1];
        for (let v = 0; v < cols.length / 3; v++) side.toArray(cols, v * 3);
        for (let i = cap.start; i < cap.start + cap.count; i++) top.toArray(cols, pilGeo.index.array[i] * 3);
        pilGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

        mFloor  = new THREE.MeshBasicMaterial({ color: C_FLOOR, side: THREE.DoubleSide });
        mPil    = new THREE.MeshBasicMaterial({ vertexColors: true });
        // Shards and scorches fade individually, so each mesh gets a clone of these
        mShard  = new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true });
        mScorch = new THREE.MeshBasicMaterial({ color: 0x8b0000, transparent: true, opacity: 0.85,
                                                depthWrite: false, side: THREE.DoubleSide });
    }


    /* ── WORLD ────────────────────────────────────────────── */

    // Place a row at rowZ and re-roll which of its hexes are pillars
    function assignRow(row, rowZ) {
        row.z = rowZ;
        row.cols.forEach((t, col) => {
            t.x = tileX(col);
            t.z = tileZ(rowZ, col);
            t.isPil = Math.random() < PIL_PROB;
            t.pilH  = t.isPil ? PIL_MIN + Math.random() * (PIL_MAX - PIL_MIN) : 0;
            t.riseT = null; t.revealT = null; t.shattered = false;
        });
    }

    function buildWorld() {
        makeGeo();

        // Instances are rewritten every frame (drawTiles); off-screen ones are left to the GPU to clip
        floorInst = new THREE.InstancedMesh(floorGeo, mFloor, POOL_ROWS * COLS);
        pilInst   = new THREE.InstancedMesh(pilGeo, mPil, POOL_ROWS * COLS);
        for (const m of [floorInst, pilInst]) {
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.frustumCulled = false;
            m.count = 0;
            scene.add(m);
        }

        for (let ri = 0; ri < POOL_ROWS; ri++) {
            const rowZ   = (ROWS_BACK - ri) * RH;
            const inWave = Math.abs(rowZ) <= WAVE_ZONE_Z;
            const row    = { z: rowZ, cols: [] };

            for (let col = 0; col < COLS; col++) {
                const t = {
                    inWave, hit: !inWave,     // `hit` = revealed; rows outside the wave start revealed
                    diagN: null,              // 0–1 position along the wave's diagonal
                };
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


    /* ── SHATTER ──────────────────────────────────────────── */

    function takeMesh(pool, geo, mat) {
        if (pool.length) return pool.pop();
        const m = new THREE.Mesh(geo, mat.clone());
        scene.add(m);
        return m;
    }

    function addShard(pos, scale, rot, v, spin) {
        const mesh = takeMesh(shardPool, pilGeo, mShard);
        mesh.position.set(...pos);
        mesh.scale.set(...scale);
        mesh.rotation.set(...rot);
        mesh.visible = true;
        mesh.material.opacity = 1;
        shards.push({ mesh, vx: v[0], vy: v[1], vz: v[2], rotX: spin[0], rotZ: spin[1], age: 0 });
    }

    function spawnShatter(px, impactY, pz, pilH) {
        const rnd = () => Math.random();

        // Six chunks of the pillar fly outward; ones further from the impact fly higher
        const CHUNKS = 6, chunkH = pilH / CHUNKS;
        for (let i = 0; i < CHUNKS; i++) {
            const cy  = chunkH * (i + 0.5);
            const ang = rnd() * TAU;
            const out = SHARD_SPEED * (0.4 + rnd() * 0.6);
            const up  = (2 + rnd() * 4) * (1 + Math.abs(cy - impactY) * 0.2);
            const sxz = 0.6 + rnd() * 0.5;
            addShard([px, cy, pz], [sxz, chunkH * (0.7 + rnd() * 0.4), sxz], [0, rnd() * TAU, 0],
                     [Math.cos(ang) * out, up, Math.sin(ang) * out], [(rnd() - 0.5) * 6, (rnd() - 0.5) * 6]);
        }
        // Eight small splinters from the impact point
        for (let i = 0; i < 8; i++) {
            const ang = rnd() * TAU;
            const spd = SHARD_SPEED * (0.8 + rnd());
            addShard([px + (rnd() - 0.5) * 0.5, impactY + (rnd() - 0.5) * 0.5, pz + (rnd() - 0.5) * 0.5],
                     [0.15 + rnd() * 0.2, 0.15 + rnd() * 0.3, 0.15 + rnd() * 0.2],
                     [rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI],
                     [Math.cos(ang) * spd, 3 + rnd() * 6, Math.sin(ang) * spd], [(rnd() - 0.5) * 10, (rnd() - 0.5) * 10]);
        }
        // Scorch mark on the floor
        const sm = takeMesh(scorchPool, scorchGeo, mScorch);
        sm.position.set(px, 0.02, pz);
        sm.rotation.y = rnd() * Math.PI;
        sm.visible = true;
        scorches.push({ mesh: sm, age: 0 });
    }

    function updateShards(dt) {
        for (let i = shards.length - 1; i >= 0; i--) {
            const s = shards[i];
            s.age += dt;
            if (s.age >= SHARD_LIFE) { s.mesh.visible = false; shardPool.push(s.mesh); shards.splice(i, 1); continue; }
            s.vy -= 12 * dt;                                   // gravity
            s.mesh.position.x += s.vx * dt;
            s.mesh.position.y += s.vy * dt;
            s.mesh.position.z += s.vz * dt;
            s.mesh.rotation.x += s.rotX * dt;
            s.mesh.rotation.z += s.rotZ * dt;
            const t = s.age / SHARD_LIFE;
            s.mesh.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        }
    }

    function updateScorches(dt) {
        for (let i = scorches.length - 1; i >= 0; i--) {
            const s = scorches[i];
            s.age += dt;
            if (s.age >= SCORCH_LIFE) { s.mesh.visible = false; scorchPool.push(s.mesh); scorches.splice(i, 1); continue; }
            // Quick fade in, linger, slow fade out over the last 30%
            const t = s.age / SCORCH_LIFE;
            s.mesh.material.opacity = 0.85 * (t < 0.05 ? t / 0.05 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
        }
    }


    /* ── SKY STREAKS ──────────────────────────────────────────
       Four thin red quads overhead that scroll toward the horizon. */

    function buildSky() {
        for (let i = 0; i < STREAK_COUNT; i++) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
            geo.setIndex([0, 1, 2, 1, 3, 2]);
            const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                color: 0xee1111, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
            }));
            mesh.frustumCulled = false;
            scene.add(mesh);
            skyStreaks.push({
                mesh, geo,
                lane:   (Math.random() - 0.5) * SKY_SPREAD * 0.8,
                width:  0.2 + Math.random() * 0.35,
                len:    22 + Math.random() * 28,
                zOff:   (i / STREAK_COUNT) * STREAK_TILE + Math.random() * 10,   // stagger them
                baseOp: 0.55 + Math.random() * 0.35,
            });
        }
    }

    function updateSky(dt, cz) {
        cruiseTime = phase === 'cruise' ? cruiseTime + dt : 0;
        const alpha = cl((cruiseTime - STREAK_DELAY) / 1.5);
        if (alpha === 0) { for (const s of skyStreaks) s.mesh.visible = false; return; }

        skyOffset = (skyOffset + STREAK_SPEED * dt) % STREAK_TILE;
        for (const s of skyStreaks) {
            const nearZ = cz + 8 - (skyOffset + s.zOff) % STREAK_TILE;   // starts 8 units behind the camera
            const farZ  = nearZ - s.len;
            const farT  = cl((cz - farZ) / SKY_FAR);
            const farX  = s.lane * (1 - farT);                            // converge toward the vanishing point
            const hw    = s.width / 2;

            s.mesh.visible = true;
            s.mesh.material.opacity = s.baseOp * Math.pow(1 - farT, 0.8) * alpha;
            const pos = s.geo.attributes.position;
            pos.setXYZ(0, s.lane - hw, SKY_Y, nearZ);
            pos.setXYZ(1, s.lane + hw, SKY_Y, nearZ);
            pos.setXYZ(2, farX - hw,   SKY_Y, farZ);
            pos.setXYZ(3, farX + hw,   SKY_Y, farZ);
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

    // Returns the camera's position (x is always 0: it flies straight down the middle)
    function updateCamera(dt) {
        let cy, cz, yaw, pitch;
        if (phase === 'swoop' || phase === 'cruise') {
            const yE = eIO(swoopT);
            // Forward motion eases in over the second half of the swoop
            camZ -= SPEED * (phase === 'cruise' ? 1 : eIO((swoopT - 0.45) / 0.55)) * dt;
            cy    = CAM_Y0 + (CRUISE_Y + sumWaves(Y_WAVES, T) - CAM_Y0) * yE;
            cz    = camZ;
            yaw   = sumWaves(YAW_WAVES, T) * yE;
            pitch = PITCH_DOWN + (PITCH_BASE + sumWaves(PITCH_WAVES, T) - PITCH_DOWN) * eIn4(swoopT);

            // Bank (roll) follows how fast the yaw is changing
            bankAngle += (-((yaw - prevYaw) / Math.max(dt, 0.001)) * BANK_AMT - bankAngle) * Math.min(1, BANK_SMOOTH * dt);
            prevYaw = yaw;
        } else {
            cy = CAM_Y0; cz = 0; yaw = 0; pitch = PITCH_DOWN; bankAngle = 0;
        }
        camera.position.set(0, cy, cz);
        camera.rotation.set(pitch, yaw, bankAngle);   // order is YXZ (set in start)
        return { cy, cz };
    }

    function pillarRisen(p) { return eOut3(Math.max(0, T - p.riseT) / PIL_DUR); }

    function updatePillars(cy, cz) {
        for (const p of tiles) {
            if (!p.isPil) continue;
            // Queue pillars ahead of the camera to rise, nearer ones first
            if (p.riseT === null) {
                const dz = cz - p.z;
                if (swoopT > 0.8 && dz > 0 && dz < PIL_TRIG) p.riseT = T + Math.hypot(p.x, dz) * PIL_STAG;
                continue;
            }
            // Fly through a pillar → it shatters
            if (phase !== 'cruise' || p.shattered || T < p.riseT || Math.abs(cz - p.z) >= COLLIDE_R) continue;
            const inY = cy >= 0 && cy <= p.pilH * pillarRisen(p);
            if (inY && Math.hypot(p.x, cz - p.z) < COLLIDE_R) {
                p.shattered = true;
                spawnShatter(p.x, cy, p.z, p.pilH);
            }
        }
    }

    // One instance's matrix — scale, then move; no rotation — written straight into the buffer
    function put(a, i, x, y, z, sx, sy, sz) {
        const o = i * 16;
        a[o] = sx; a[o + 5] = sy; a[o + 10] = sz;
        a[o + 12] = x; a[o + 13] = y; a[o + 14] = z;
    }

    // This frame's hexes, within draw distance: floors with the wave's bounce, pillars
    // as far as they've risen. A wrong passphrase (corruptT) makes them jitter, stretch
    // and jump, settling over CORRUPT_DUR.
    function drawTiles(cz) {
        const F = floorInst.instanceMatrix.array, P = pilInst.instanceMatrix.array;
        const e = (corruptT / CORRUPT_DUR) ** 2;
        let nf = 0, np = 0;
        for (const t of tiles) {
            if (!t.hit) continue;
            const dz = cz - t.z;
            if (dz <= -DD_BEHIND || dz >= DD_AHEAD) continue;
            let nx = 0, ny = 0, nz = 0;
            if (e) {
                nx = Math.sin(t.x * 7.3  + T * 190 + corruptT * 44) * Math.cos(t.z * 5.1 + T * 230);
                ny = Math.sin(t.x * 11.7 + t.z * 8.3 + T * 160);
                nz = Math.cos(t.x * 9.1  + T * 210 + corruptT * 33) * Math.sin(t.z * 6.7);
            }
            if (!t.isPil) {
                const age = t.revealT === null ? POP_DUR : T - t.revealT;
                const pop = age < POP_DUR ? POP_H * Math.sin(Math.PI * age / POP_DUR) * Math.exp(-3 * age / POP_DUR) : 0;
                const amp = e * 2.2;
                put(F, nf++, t.x + nx * amp * 0.8, pop + ny * amp * 1.4, t.z + nz * amp * 0.8, 1, 1, 1);
                continue;
            }
            if (t.shattered || t.riseT === null) continue;       // a pillar's hex stays empty until it rises
            if (e) {
                const sy = Math.max(0.05, pillarRisen(t) + ny * e * 1.8) * t.pilH;
                const jump = Math.abs(nx * nz) > 0.82 && e > 0.25 ? ny * e * 5 : 0;
                put(P, np++, t.x + nx * e * 1.2, sy / 2 + jump, t.z + nz * e * 1.2, 1 + Math.abs(nx) * e * 1.1, sy, 1 + Math.abs(nz) * e * 1.1);
                continue;
            }
            const h = t.pilH * pillarRisen(t);
            if (h > 0.001 * t.pilH) put(P, np++, t.x, h / 2, t.z, 1, h, 1);
        }
        for (const [m, n] of [[floorInst, nf], [pilInst, np]]) {
            m.count = n;
            m.instanceMatrix.clearUpdateRanges();
            m.instanceMatrix.addUpdateRange(0, n * 16);          // upload only what's drawn
            m.instanceMatrix.needsUpdate = true;
        }
    }

    function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        T += dt; phT += dt;

        advancePhase(dt);
        if (phase === 'wave' || phase === 'hold') updateWave();
        if (phase === 'swoop') renderer.setClearColor(bgNow.copy(bgA).lerp(bgB, eIO(swoopT / 0.6)));

        const { cy, cz } = updateCamera(dt);
        for (const row of rows) if (row.z - cz > RECYCLE_BEHIND) recycleRow(row);
        updatePillars(cy, cz);
        corruptT = Math.max(0, corruptT - dt);
        drawTiles(cz);
        updateShards(dt);
        updateScorches(dt);
        updateSky(dt, cz);

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

            buildWorld();
            buildSky();

            canvas.style.zIndex = '500';    // above everything during the intro
            if (skipIntro) {
                for (const t of tiles) t.hit = true;
                for (const p of tiles) if (p.isPil && -p.z < 16) p.shattered = true;   // none rising in the camera's face
                phase = 'cruise'; swoopT = 1; loginFired = true;
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
