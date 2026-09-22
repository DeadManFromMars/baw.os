/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   feed.js — a still image shown as a live camera feed (WebGL)

   Feed.start(canvas, src) draws `src` into `canvas` every frame like
   an analog camera on an old TV: soft picture, smeared tape colour,
   jittering lines, a rolling tracking band, streaky noise, bowed
   edges and dark rounded tube corners (details at FRAG).
   Nothing blinks. Used by the globe's location boxes (globe.js).
   Without WebGL it just draws the image.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Feed = (() => {

    const AMOUNT = 0.9;     // strength of every effect together
    const SIZE   = 400;     // CSS px the buffer is made for — the biggest it's shown

    const VERT = `attribute vec2 a; varying vec2 uv;
    void main() { uv = a * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(a, 0.0, 1.0); }`;

    /* Analog, not digital: the picture is soft, colour smears to the right of the
       detail (tape chroma), lines jitter and wave, a thin tracking band rolls down
       tearing the picture, and the noise is streaky rather than per-pixel. */
    const FRAG = `precision mediump float;
    uniform sampler2D img; uniform float t, amt; varying vec2 uv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    const vec3 LUMA = vec3(0.299, 0.587, 0.114);
    void main() {
        vec2 p   = uv * 2.0 - 1.0;
        float r2 = dot(p, p);
        float k  = 0.12 * amt;
        vec2 q   = p * (1.0 + k * r2) / (1.0 + k);                               // barrel, edge middles kept on the edge
        vec2 drift = vec2(sin(t * 0.37) + 0.5 * sin(t * 0.83), cos(t * 0.29) + 0.5 * sin(t * 0.61)) * 0.005;
        vec2 st  = q * 0.44 + 0.5 + drift;                                       // cropped in so the drift never shows an edge

        // Line instability: per-line jitter (24 fps, like tape), a slow wave, and a
        // tracking band rolling down that tears the lines it passes
        float line  = floor(uv.y * 120.0), frame = floor(t * 24.0);
        float band  = uv.y - fract(t * 0.07);
        float inBand = exp(-band * band * 900.0);
        st.x += (hash(vec2(line, frame)) - 0.5) * 0.004 * amt
              + (sin(uv.y * 9.0 + t * 1.3) * 0.002 + sin(uv.y * 37.0 - t * 2.1) * 0.001) * amt
              + inBand * (hash(vec2(line, frame + 3.0)) - 0.3) * 0.03 * amt;

        // Soft picture; colour blurred wider and shifted right, then put back on the brightness
        vec3 soft = vec3(0.0), smear = vec3(0.0);
        for (int i = -2; i <= 2; i++) soft  += texture2D(img, st + vec2(float(i) * 0.0027, 0.0)).rgb;
        for (int i = -4; i <= 4; i++) smear += texture2D(img, st + vec2(float(i) * 0.0075 + 0.006 * amt, 0.0)).rgb;
        soft /= 5.0;  smear /= 9.0;
        float Y = dot(soft, LUMA);
        vec3 c  = Y + (smear - dot(smear, LUMA)) * 0.85;                         // a little washed out
        c = c * 0.9 + 0.05;                                                      // lifted blacks

        c *= 0.9 + 0.1 * sin(uv.y * 565.0);                                      // scanlines, ~90 at any size
        c += (hash(vec2(floor(uv.y * 240.0), frame + floor(uv.x * 6.0))) - 0.5) * 0.06 * amt;   // streaky noise
        c += (hash(floor(uv * vec2(90.0, 240.0)) + frame) - 0.5) * 0.05 * amt;   // coarse grain
        c += inBand * 0.18 * amt * hash(vec2(floor(uv.x * 60.0), line + frame)); // the band's snow
        c *= 1.0 + 0.05 * amt * smoothstep(0.1, 0.0, abs(fract(uv.y * 0.6 - t * 0.08) - 0.5));   // rolling brightness

        vec2 e = abs(q);                                                         // softly rounded tube corners, thin dark rim
        float edge = smoothstep(1.0, 0.97, max(e.x, e.y)) * smoothstep(2.0, 1.85, e.x * e.x + e.y * e.y);
        c *= mix(0.0, 1.0 - 0.08 * amt * r2, edge);                              // light vignette
        gl_FragColor = vec4(c, 1.0);
    }`;

    function start(canvas, src) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = canvas.height = SIZE * dpr;

        const image = new Image();
        image.onload = () => {
            const gl = canvas.getContext('webgl');
            if (!gl) { canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height); return; }

            const shader = (type, source) => {
                const s = gl.createShader(type);
                gl.shaderSource(s, source);
                gl.compileShader(s);
                return s;
            };
            const prog = gl.createProgram();
            gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
            gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(prog);
            gl.useProgram(prog);

            // One quad covering the canvas
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const a = gl.getAttribLocation(prog, 'a');
            gl.enableVertexAttribArray(a);
            gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

            gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            const time = gl.getUniformLocation(prog, 't');
            gl.uniform1f(gl.getUniformLocation(prog, 'amt'), AMOUNT);
            gl.viewport(0, 0, canvas.width, canvas.height);

            requestAnimationFrame(function frame(now) {
                gl.uniform1f(time, now / 1000);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                requestAnimationFrame(frame);
            });
        };
        image.src = src;
    }

    return { start };
})();
