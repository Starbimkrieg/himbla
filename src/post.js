import * as THREE from 'three';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { TOON_LOOK, CLASSIC_LOOK, GLOW_MARK } from './toon.js';

// Glow: the marked pixels (toon.js glowMark: alpha GLOW_MARK) at a quarter of the size, averaged down, blurred across and
// up; the post pass adds the halo in hard steps (two rings, not a soft bloom: comic glow). `k` the Glow setting.
const GLOW_SHADER = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  // down: the 4 x 4 full-size pixels under a quarter-size one (four bilinear taps), only those marked, the brightest
  // kept (an average thinned a 2 px neon line to nothing)
  down: /* glsl */ `
    uniform sampler2D tSrc; uniform vec2 px; varying vec2 vUv;
    vec3 m(vec2 o){ vec4 c = texture2D(tSrc, vUv + o * px); return c.rgb * clamp((c.a - 1.0) / ${(GLOW_MARK - 1).toFixed(1)}, 0.0, 1.0); }
    void main(){ gl_FragColor = vec4(max(max(m(vec2(-1.0, -1.0)), m(vec2(1.0, -1.0))), max(m(vec2(-1.0, 1.0)), m(vec2(1.0, 1.0)))), 1.0); }`,
  // blur: 9 taps along `dir` (in quarter-size pixels), a wide gaussian
  blur: /* glsl */ `
    uniform sampler2D tSrc; uniform vec2 px; uniform vec2 dir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2;
      c += (texture2D(tSrc, vUv + dir * px * 2.0).rgb + texture2D(tSrc, vUv - dir * px * 2.0).rgb) * 0.18;
      c += (texture2D(tSrc, vUv + dir * px * 4.6).rgb + texture2D(tSrc, vUv - dir * px * 4.6).rgb) * 0.13;
      c += (texture2D(tSrc, vUv + dir * px * 7.4).rgb + texture2D(tSrc, vUv - dir * px * 7.4).rgb) * 0.07;
      c += (texture2D(tSrc, vUv + dir * px * 10.4).rgb + texture2D(tSrc, vUv - dir * px * 10.4).rgb) * 0.02;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Comic-book post pass: depth ink lines, halftone shadows (?look=classic only: the toon materials draw theirs, toon.js), speed lines, damage vignette, paper grade.
export class ComicPost {
  constructor(renderer, camera, fixedSize = null) {
    this.renderer = renderer;
    this.camera = camera;
    this.fixed = fixedSize;
    const size = fixedSize ? fixedSize.clone() : renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
      stencilBuffer: true, // (the rocks' ink marks: toon.js inkMarks)
      samples: 0, // multisampling: the Anti-aliasing setting (setSamples)
    });
    this.target.depthTexture.format = THREE.DepthStencilFormat;
    this.target.depthTexture.type = THREE.UnsignedInt248Type;
    if (!fixedSize) TOON_LOOK.cell = this.dotCell(size);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        res: { value: size.clone() },
        near: { value: camera.near },
        far: { value: camera.far },
        time: { value: 0 },
        speed: { value: 0 },
        damage: { value: 0 },
        alert: { value: 0 },
        boost: { value: 0 },
        invert: { value: 0 },
        fade: { value: 0 }, // fade to black (council chamber cutscene, chamber.js)
        halftone: { value: 1 }, lines: { value: 1 }, inkK: { value: 1 }, // settings
        creaseTint: { value: CLASSIC_LOOK ? 0 : 1 },
        tGlow: { value: null }, glowK: { value: 0 }, // the Glow setting (glow passes, below)
        encodeSRGB: { value: 0 }, // 1 when the FXAA pass follows: it wants the picture as it will be seen
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor; uniform sampler2D tDepth;
        uniform vec2 res; uniform float near; uniform float far; uniform float time;
        uniform float speed; uniform float damage; uniform float alert; uniform float boost; uniform float invert; uniform float fade;
        uniform float halftone; uniform float lines; uniform float inkK; // settings
        uniform float creaseTint;
        uniform sampler2D tGlow; uniform float glowK; uniform float encodeSRGB;
        varying vec2 vUv;
        float lin(vec2 uv){ float d = texture2D(tDepth, uv).x; return -perspectiveDepthToViewZ(d, near, far); }
        float hash(float n){ return fract(sin(n) * 43758.5453123); }
        void main(){
          vec2 px = 1.0 / res;
          float th = max(1.0, res.y / 720.0) * 1.2;
          float c = lin(vUv);
          float l = lin(vUv - vec2(px.x * th, 0.0));
          float r = lin(vUv + vec2(px.x * th, 0.0));
          float u = lin(vUv + vec2(0.0, px.y * th));
          float d = lin(vUv - vec2(0.0, px.y * th));
          // creases: the Laplacian of 1/depth, which is exactly linear across any flat surface at any
          // angle (plain depth curves at grazing angles, which inked false lines across distant slopes)
          float lap = abs(c / l + c / r + c / u + c / d - 4.0);
          float jump = max(max(abs(l - c), abs(r - c)), max(abs(u - c), abs(d - c))) / c;
          float crease = smoothstep(0.03, 0.09, lap), outline = smoothstep(0.12, 0.3, jump);
          float edge = max(crease, outline);
          edge *= 1.0 - smoothstep(1400.0, 3200.0, c);
          bool sky = c > far * 0.95;

          vec3 col = texture2D(tColor, vUv).rgb;
          vec3 sc = pow(max(col, 0.0), vec3(1.0 / 2.2));
          float lum = dot(sc, vec3(0.299, 0.587, 0.114));

          // halftone dots in the darker tones
          float ang = 0.785;
          mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
          vec2 g = rot * gl_FragCoord.xy / (5.0 * max(1.0, res.y / 900.0));
          vec2 f = fract(g) - 0.5;
          float amt = clamp((0.55 - lum) * 1.6, 0.0, 1.0);
          float dotMask = 1.0 - smoothstep(0.0, 0.08, length(f) - 0.55 * sqrt(amt));
          if (!sky) col *= 1.0 - dotMask * 0.33 * halftone; // settings

          // ink, far lines shifting toward the shade's deep indigo so far shapes recede (as the shells do: toon.js inkTint)
          vec3 inkC = mix(vec3(0.03, 0.015, 0.05), vec3(0.16, 0.13, 0.30), 0.75 * smoothstep(40.0, 420.0, c));
          // a crease inside a shape is a darker, cooler shade of its own colour, as the designed lines are (toon.js
          // inkLineMat); a depth jump (an outline) stays ink. (?look=classic: all ink)
          vec3 creaseC = mix(inkC, col * vec3(0.36, 0.32, 0.5), creaseTint * (1.0 - smoothstep(40.0, 420.0, c)));
          col = mix(col, mix(creaseC, inkC, outline >= crease ? 1.0 : outline / max(crease, 1e-3)), clamp(edge * inkK, 0.0, 1.0)); // settings

          // speed lines
          vec2 p = vUv - 0.5; p.x *= res.x / res.y;
          float rad = length(p);
          if (speed != 0.0 || boost != 0.0) { // (both lines are weighted by speed / boost: with neither there is nothing to draw, so skip the maths)
          float a = atan(p.y, p.x) / 6.2831853 * 90.0;
          float id = floor(a);
          float fr = fract(a);
          float rnd = hash(id * 1.31 + floor(time * 14.0));
          float width = 0.12 + 0.2 * hash(id + 7.0);
          float line = step(0.72, rnd) * (1.0 - smoothstep(0.0, width, abs(fr - 0.5)));
          float mask = smoothstep(0.22 + 0.25 * (1.0 - speed), 0.75, rad) * speed * lines; // settings
          col = mix(col, vec3(1.0, 0.98, 0.9), line * mask * 0.75);
          // thrust: cyan streaks
          col = mix(col, vec3(0.2, 0.9, 1.0), line * boost * lines * smoothstep(0.35, 0.8, rad) * 0.35); // settings
          }

          // vignettes
          col *= 1.0 - smoothstep(0.55, 1.05, rad) * 0.45;
          col = mix(col, vec3(0.95, 0.05, 0.12), clamp(damage, 0.0, 1.0) * smoothstep(0.25, 0.85, rad));
          col = mix(col, vec3(1.0, 0.1, 0.15), alert * (0.5 + 0.5 * sin(time * 10.0)) * smoothstep(0.45, 0.9, rad) * 0.5);

          // glow: the blurred lit parts in two hard rings (comic glow), screened over the picture in their own hue
          if (glowK > 0.0) {
            vec3 gl = texture2D(tGlow, vUv).rgb;
            float gm = max(gl.r, max(gl.g, gl.b));
            // (each ring's edge eased over a hair, so it stays hard but doesn't step with the quarter-size pixels)
            float ring = 0.16 * smoothstep(0.1, 0.13, gm) + 0.2 * smoothstep(0.3, 0.34, gm);
            if (ring > 0.0) col = 1.0 - (1.0 - col) * (1.0 - clamp(gl / gm, 0.0, 1.0) * ring * glowK);
          }

          col = mix(col, vec3(0.9, 0.85, 1.0) - col * 0.9, invert);
          col = mix(col, vec3(0.0), fade);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
          if (encodeSRGB > 0.5) gl_FragColor = sRGBTransferOETF(gl_FragColor);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // glow: two quarter-size targets and the passes between them (setGlow)
    const q = this.quarter(size), rt = () => new THREE.WebGLRenderTarget(q.x, q.y, { type: THREE.HalfFloatType, depthBuffer: false });
    this.glowA = rt(); this.glowB = rt();
    const pass = (frag, extra = {}) => new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, px: { value: new THREE.Vector2() }, ...extra }, vertexShader: GLOW_SHADER.vertexShader, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.downMat = pass(GLOW_SHADER.down);
    this.blurMat = pass(GLOW_SHADER.blur, { dir: { value: new THREE.Vector2(1, 0) } });
    this.glowK = 0;
    // FXAA after the comic pass (setSmooth): smooths its own depth lines and the halftone's edges, which MSAA can't reach
    this.smooth = false;
    this.smoothTarget = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: false });
    this.fxaaMat = new THREE.ShaderMaterial({ ...FXAAShader, uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), depthTest: false, depthWrite: false });
    this.fxaaMat.uniforms.tDiffuse.value = this.smoothTarget.texture;
    this.fxaaMat.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
  }

  quarter(size) { return new THREE.Vector2(Math.max(1, Math.round(size.x / 4)), Math.max(1, Math.round(size.y / 4))); }

  // the Glow setting: 0 (off) to 1
  setGlow(k) { this.glowK = k; this.material.uniforms.glowK.value = k; }
  // the Smooth lines setting
  setSmooth(on) { this.smooth = !!on; }

  // a full-screen pass of `mat` into `target`
  blit(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.ortho);
    this.quad.material = this.material;
  }

  // MSAA on the scene pass (0, 2 or 4 samples): smooths every edge drawn into it, the outline shells' and where two
  // surfaces cut each other (a shell through the wall it's against, at a grazing angle: a staircase). The depth the lines
  // are found from is resolved to one sample per pixel, so the post pass's own lines aren't smoothed.
  setSamples(n) {
    if (this.target.samples === n) return;
    this.target.samples = n;
    this.target.dispose(); // (made again, multisampled or not, on its next use)
  }

  // the halftone grid's cell in pixels, as the post pass's own dots: 5 px at 900 px tall, scaled up beyond
  dotCell(size) { return 5 * Math.max(1, size.y / 900); }

  setSize() {
    if (this.fixed) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.material.uniforms.res.value.copy(size);
    const q = this.quarter(size);
    this.glowA.setSize(q.x, q.y); this.glowB.setSize(q.x, q.y);
    this.smoothTarget.setSize(size.x, size.y);
    this.fxaaMat.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
    TOON_LOOK.cell = this.dotCell(size);
  }

  render(scene, camera, output = null) {
    const u = this.material.uniforms;
    u.near.value = camera.near;
    u.far.value = camera.far;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    if (this.glowK > 0) {
      const full = this.target.width, q = this.glowA;
      this.downMat.uniforms.tSrc.value = this.target.texture;
      this.downMat.uniforms.px.value.set(1 / full, 1 / this.target.height);
      this.blit(this.downMat, this.glowA);
      const b = this.blurMat.uniforms;
      b.px.value.set(1 / q.width, 1 / q.height);
      b.tSrc.value = this.glowA.texture; b.dir.value.set(1, 0); this.blit(this.blurMat, this.glowB);
      b.tSrc.value = this.glowB.texture; b.dir.value.set(0, 1); this.blit(this.blurMat, this.glowA);
      u.tGlow.value = this.glowA.texture;
    }
    // FXAA only on the way to the screen (a caller's own target gets the plain pass)
    const smooth = this.smooth && !output;
    u.encodeSRGB.value = smooth ? 1 : 0;
    this.renderer.setRenderTarget(smooth ? this.smoothTarget : output);
    this.renderer.render(this.scene, this.ortho);
    if (smooth) this.blit(this.fxaaMat, null);
    this.renderer.setRenderTarget(null);
  }
}
