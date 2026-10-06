import * as THREE from 'three';

// Comic-book post pass: depth-based ink lines, halftone shadows, radial speed lines,
// damage vignette, and a warm paper grade.
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
        halftone: { value: 1 }, lines: { value: 1 }, inkK: { value: 1 }, // settings
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor; uniform sampler2D tDepth;
        uniform vec2 res; uniform float near; uniform float far; uniform float time;
        uniform float speed; uniform float damage; uniform float alert; uniform float boost; uniform float invert;
        uniform float halftone; uniform float lines; uniform float inkK; // settings
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
          float lap = abs(l + r + u + d - 4.0 * c) / c;
          float jump = max(max(abs(l - c), abs(r - c)), max(abs(u - c), abs(d - c))) / c;
          float edge = max(smoothstep(0.03, 0.09, lap), smoothstep(0.12, 0.3, jump));
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

          // ink
          col = mix(col, vec3(0.03, 0.015, 0.05), clamp(edge * inkK, 0.0, 1.0)); // settings

          // speed lines
          vec2 p = vUv - 0.5; p.x *= res.x / res.y;
          float rad = length(p);
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

          // vignettes
          col *= 1.0 - smoothstep(0.55, 1.05, rad) * 0.45;
          col = mix(col, vec3(0.95, 0.05, 0.12), clamp(damage, 0.0, 1.0) * smoothstep(0.25, 0.85, rad));
          col = mix(col, vec3(1.0, 0.1, 0.15), alert * (0.5 + 0.5 * sin(time * 10.0)) * smoothstep(0.45, 0.9, rad) * 0.5);

          col = mix(col, vec3(0.9, 0.85, 1.0) - col * 0.9, invert);
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
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(output);
    this.renderer.render(this.scene, this.ortho);
    this.renderer.setRenderTarget(null);
  }
}
