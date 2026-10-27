import * as THREE from 'three';

// Comic-book post pass: depth ink lines (silhouettes, creases and folds), halftone shadows, speed lines, damage vignette, paper grade.
export class ComicPost {
  constructor(renderer, camera, fixedSize = null) {
    this.renderer = renderer;
    this.camera = camera;
    this.fixed = fixedSize;
    const size = fixedSize ? fixedSize.clone() : renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    });
    this.target.depthTexture.type = THREE.UnsignedIntType;
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
        inkVary: { value: 0 }, inkTint: { value: 0 }, // (ink style tests: dev builds' Settings)
        projXY: { value: new THREE.Vector2(1, 1) }, camWorld: { value: new THREE.Matrix4() }, // (positions back from depth: render())
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor; uniform sampler2D tDepth;
        uniform vec2 res; uniform float near; uniform float far; uniform float time;
        uniform float speed; uniform float damage; uniform float alert; uniform float boost; uniform float invert; uniform float fade;
        uniform float halftone; uniform float lines; uniform float inkK; // settings
        uniform float inkVary; uniform float inkTint; uniform vec2 projXY; uniform mat4 camWorld;
        varying vec2 vUv;
        float lin(vec2 uv){ float d = texture2D(tDepth, uv).x; return -perspectiveDepthToViewZ(d, near, far); }
        // the view-space point at uv, z metres away
        vec3 vpos(vec2 uv, float z){ return vec3((uv.x * 2.0 - 1.0) * z / projXY.x, (uv.y * 2.0 - 1.0) * z / projXY.y, -z); }
        float hash(float n){ return fract(sin(n) * 43758.5453123); }
        float vnoise(vec3 w){
          vec3 i = floor(w), f = fract(w); f = f * f * (3.0 - 2.0 * f);
          #define PH(o) fract(sin(dot(i + o, vec3(127.1, 311.7, 74.7))) * 43758.5453)
          float n = mix(mix(mix(PH(vec3(0,0,0)), PH(vec3(1,0,0)), f.x), mix(PH(vec3(0,1,0)), PH(vec3(1,1,0)), f.x), f.y),
                        mix(mix(PH(vec3(0,0,1)), PH(vec3(1,0,1)), f.x), mix(PH(vec3(0,1,1)), PH(vec3(1,1,1)), f.x), f.y), f.z);
          #undef PH
          return n;
        }
        // the ink at a pixel from its 4 neighbours th px away: silhouettes (a depth jump), creases (the Laplacian of 1/depth,
        // exactly linear across any flat surface at any angle), and folds (the surface's turn between the 4 little triangles
        // round the pixel, from positions rebuilt from depth: unlike the Laplacian it doesn't fade on small or far models).
        // Returns (silhouette, crease) in 0..1.
        vec2 inkAt(float c, float th){
          vec2 px = th / res;
          float l = lin(vUv - vec2(px.x, 0.0)), r = lin(vUv + vec2(px.x, 0.0));
          float u = lin(vUv + vec2(0.0, px.y)), d = lin(vUv - vec2(0.0, px.y));
          float lap = abs(c / l + c / r + c / u + c / d - 4.0);
          float jump = max(max(abs(l - c), abs(r - c)), max(abs(u - c), abs(d - c))) / c;
          vec3 pc = vpos(vUv, c), pl = vpos(vUv - vec2(px.x, 0.0), l), pr = vpos(vUv + vec2(px.x, 0.0), r);
          vec3 pu = vpos(vUv + vec2(0.0, px.y), u), pd = vpos(vUv - vec2(0.0, px.y), d);
          vec3 nLU = normalize(cross(pc - pl, pu - pc)), nRU = normalize(cross(pr - pc, pu - pc));
          vec3 nLD = normalize(cross(pc - pl, pc - pd)), nRD = normalize(cross(pr - pc, pc - pd));
          float fold = 1.0 - min(min(dot(nLU, nRU), dot(nLD, nRD)), min(dot(nLU, nLD), dot(nRU, nRD)));
          // (a fold of 35 degrees and up; never across a jump, where the triangles span the gap; fading out by 250 m, where depth
          // precision starts drawing folds on smooth ground)
          float foldInk = smoothstep(0.18, 0.3, fold) * (1.0 - smoothstep(0.02, 0.05, jump)) * (1.0 - smoothstep(120.0, 250.0, c));
          return vec2(smoothstep(0.12, 0.3, jump), max(smoothstep(0.03, 0.09, lap), foldInk));
        }
        void main(){
          float c = lin(vUv);
          float th = max(1.0, res.y / 720.0) * 1.2;
          // (style test: brush weight) the line swells and thins along its length, anchored to the world (no crawl)
          if (inkVary > 0.5 && c < far * 0.9) th *= 0.7 + 0.6 * vnoise((camWorld * vec4(vpos(vUv, c), 1.0)).xyz * 0.6);
          vec2 e = inkAt(c, th);
          // (style test: brush weight) silhouettes drawn heavier than creases: sampled twice as far out
          if (inkVary > 0.5) e.x = max(e.x, inkAt(c, th * 2.0).x);
          float edge = max(e.x, e.y * (inkVary > 0.5 ? 0.8 : 1.0));
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

          // ink (style test: distance tint, far ink toward the shade's deep indigo, as the shells do: toon.js inkTint)
          vec3 inkC = mix(vec3(0.03, 0.015, 0.05), vec3(0.16, 0.13, 0.30), inkTint * 0.75 * smoothstep(40.0, 420.0, c));
          col = mix(col, inkC, clamp(edge * inkK, 0.0, 1.0)); // settings

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

          col = mix(col, vec3(0.9, 0.85, 1.0) - col * 0.9, invert);
          col = mix(col, vec3(0.0), fade);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize() {
    if (this.fixed) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.material.uniforms.res.value.copy(size);
  }

  render(scene, camera, output = null) {
    const u = this.material.uniforms;
    u.near.value = camera.near;
    u.far.value = camera.far;
    u.projXY.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    u.camWorld.value.copy(camera.matrixWorld);
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(output);
    this.renderer.render(this.scene, this.ortho);
    this.renderer.setRenderTarget(null);
  }
}
