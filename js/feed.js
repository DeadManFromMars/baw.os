/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   feed.js — a still image shown as a live camera feed (WebGL)

   Feed.start(canvas, src) draws `src` into `canvas` every frame with
   a subtle old-TV look: the edges bow out a little, colour fringes at
   the rim, a slow handheld drift, a faint line wobble, scanlines,
   grain, a slow rolling band, and dark rounded tube corners.
   Nothing blinks. Used by the globe's location boxes (globe.js).
   Without WebGL it just draws the image.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Feed = (() => {

    const AMOUNT = 0.6;     // strength of every effect together (1 = noticeably retro)
    const SIZE   = 400;     // CSS px the buffer is made for — the biggest it's shown

    const VERT = `attribute vec2 a; varying vec2 uv;
    void main() { uv = a * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(a, 0.0, 1.0); }`;

    const FRAG = `precision mediump float;
    uniform sampler2D img; uniform float t, amt; uniform vec2 res; varying vec2 uv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
        vec2 p   = uv * 2.0 - 1.0;
        float r2 = dot(p, p);
        vec2 q   = p * (1.0 + 0.07 * amt * r2);                                  // barrel
        vec2 drift = vec2(sin(t * 0.37) + 0.5 * sin(t * 0.83), cos(t * 0.29) + 0.5 * sin(t * 0.61)) * 0.004;
        vec2 st  = q * 0.45 + 0.5 + drift;                                       // cropped in a touch so the drift never shows an edge
        st.x += sin(st.y * 140.0 + t * 5.0) * 0.0007 * amt;                      // signal wobble
        float ca = 0.004 * amt * r2;                                             // fringing, edges only
        vec3 c = vec3(texture2D(img, st + vec2(ca, 0.0)).r, texture2D(img, st).g, texture2D(img, st - vec2(ca, 0.0)).b);
        c *= 0.93 + 0.07 * sin(uv.y * 565.0);                                    // scanlines, ~90 at any size
        c += (hash(uv * res + fract(t) * 91.0) - 0.5) * 0.07 * amt;              // grain
        c *= 1.0 + 0.05 * amt * smoothstep(0.1, 0.0, abs(fract(uv.y * 0.6 - t * 0.08) - 0.5));   // rolling band
        vec2 e = abs(q);                                                         // rounded tube corners
        float edge = smoothstep(1.0, 0.94, max(e.x, e.y)) * smoothstep(1.9, 1.6, e.x * e.x + e.y * e.y);
        c *= mix(0.0, 1.0 - 0.125 * amt * r2, edge);                             // vignette, black at the rim
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
            gl.uniform2f(gl.getUniformLocation(prog, 'res'), canvas.width, canvas.height);
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
