import * as THREE from 'three';
import { glow, toon } from './toon.js';

const MAX_P = 500;

// Particles, explosions, warning rings, skate trails and comic onomatopoeia.
export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.particles = [];
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.pMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_P);
    this.pMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_P * 3), 3);
    this.pMesh.frustumCulled = false;
    this.pMesh.count = 0;
    scene.add(this.pMesh);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();

    this.booms = [];
    this.rings = [];
    this.popLayer = document.getElementById('popups');

    // skate trails (two ribbons)
    this.trails = [this.makeTrail(0x2ee6ff), this.makeTrail(0x2ee6ff)];
  }

  makeTrail(color) {
    const N = 40;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3);
    const alpha = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { alpha[i * 2] = alpha[i * 2 + 1] = 1 - i / N; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { color: { value: new THREE.Color(color) }, strength: { value: 0 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float strength; varying float vA; void main(){ gl_FragColor = vec4(color, vA * vA * strength); }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return { mesh, pts: [], N, mat };
  }

  updateTrail(i, footPos, side, strength) {
    const t = this.trails[i];
    t.pts.unshift(footPos.clone(), side.clone());
    if (t.pts.length > t.N * 2) t.pts.length = t.N * 2;
    const pos = t.mesh.geometry.attributes.position.array;
    for (let k = 0; k < t.N; k++) {
      const j = Math.min(k, t.pts.length / 2 - 1) * 2;
      const p = t.pts[j], s = t.pts[j + 1];
      const w = 0.18;
      pos[k * 6] = p.x - s.x * w; pos[k * 6 + 1] = p.y + 0.05; pos[k * 6 + 2] = p.z - s.z * w;
      pos[k * 6 + 3] = p.x + s.x * w; pos[k * 6 + 4] = p.y + 0.05; pos[k * 6 + 5] = p.z + s.z * w;
    }
    t.mesh.geometry.attributes.position.needsUpdate = true;
    t.mat.uniforms.strength.value += (strength - t.mat.uniforms.strength.value) * 0.2;
  }

  spawn(pos, vel, { color = 0xffffff, size = 0.3, life = 0.8, gravity = 0, drag = 0.5, count = 1, spread = 2 } = {}) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_P) this.particles.shift();
      this.particles.push({
        pos: pos.clone(),
        vel: vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)),
        life, max: life, size: size * (0.6 + Math.random() * 0.8), color: new THREE.Color(color), gravity, drag,
      });
    }
  }

  dust(pos, vel, amount = 4, color = 0xd8d0c4) {
    this.spawn(pos, vel.clone().multiplyScalar(0.25).add(new THREE.Vector3(0, 2, 0)), { color, size: 0.5, life: 1.2, gravity: 1.62, drag: 0.6, count: amount, spread: 4 });
  }

  explosion(pos, radius = 6, big = false) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true }));
    const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff4f2e, transparent: true }));
    const ink = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0b0612, side: THREE.BackSide, transparent: true }));
    outer.scale.setScalar(1.3);
    ink.scale.setScalar(1.42);
    g.add(core, outer, ink);
    g.position.copy(pos);
    this.scene.add(g);
    this.booms.push({ g, t: 0, dur: big ? 0.7 : 0.45, radius, mats: [core.material, outer.material, ink.material] });
    this.spawn(pos, new THREE.Vector3(0, 3, 0), { color: 0xffd23f, size: radius * 0.08, life: 0.7, gravity: 1, count: big ? 26 : 12, spread: radius * 4 });
    this.spawn(pos, new THREE.Vector3(0, 2, 0), { color: 0x3a3550, size: radius * 0.1, life: 1.4, gravity: 1.62, count: big ? 18 : 8, spread: radius * 2.5 });
  }

  warningRing(pos, radius, dur) {
    const m = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius, 40), new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
    const inner = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
    m.add(inner);
    this.scene.add(m);
    const r = { m, inner, t: 0, dur };
    this.rings.push(r);
    return r;
  }

  // Comic onomatopoeia anchored at a world position (or screen centre if pos null).
  pop(text, pos = null, { color = '#ffd23f', size = 64, life = 1.0, rot = null } = {}) {
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = size + 'px';
    el.style.setProperty('--rot', (rot ?? (Math.random() * 24 - 12)) + 'deg');
    el.style.animationDuration = life + 's';
    this.popLayer.appendChild(el);
    const item = { el, pos: pos ? pos.clone() : null, t: 0, life };
    if (!pos) { el.style.left = 50 + (Math.random() * 20 - 10) + '%'; el.style.top = 32 + Math.random() * 10 + '%'; }
    (this.pops ||= []).push(item);
  }

  update(dt) {
    // particles
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(1 - p.drag * dt);
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      this.s.setScalar(p.size * (0.3 + 0.7 * k));
      this.m4.compose(p.pos, this.q, this.s);
      this.pMesh.setMatrixAt(n, this.m4);
      this.pMesh.setColorAt(n, p.color);
      n++;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1) {
        this.scene.remove(b.g);
        b.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        b.mats.forEach((m) => m.dispose());
        this.booms.splice(i, 1);
        continue;
      }
      const s = b.radius * (0.3 + Math.pow(k, 0.4) * 0.9);
      b.g.scale.setScalar(s);
      b.mats.forEach((m) => (m.opacity = 1 - k * k));
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.dur) {
        this.scene.remove(r.m);
        r.m.geometry.dispose(); r.inner.geometry.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const k = r.t / r.dur;
      r.m.material.opacity = 0.5 + 0.5 * Math.sin(r.t * (8 + k * 20));
      r.inner.material.opacity = 0.1 + k * 0.3;
      r.inner.scale.setScalar(k);
    }

    if (this.pops) {
      for (let i = this.pops.length - 1; i >= 0; i--) {
        const p = this.pops[i];
        p.t += dt;
        if (p.t >= p.life) { p.el.remove(); this.pops.splice(i, 1); continue; }
        if (p.pos) {
          this.v.copy(p.pos).project(this.camera);
          if (this.v.z > 1) { p.el.style.display = 'none'; continue; }
          p.el.style.display = '';
          p.el.style.left = ((this.v.x + 1) / 2) * 100 + '%';
          p.el.style.top = ((1 - this.v.y) / 2) * 100 + '%';
        }
      }
    }
  }
}
