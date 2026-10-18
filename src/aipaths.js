import * as THREE from 'three';

// Dev overlay (dev menu, cheats.js): where every AI is headed. Enemies, allies, patrols and bosses: a line to their
// steering goal (enemies.js sets e.dbgGoal while on). Road vehicles and transit craft: their route (rest of this piece
// plus planned pieces). Walkers: the rest of their walk.

const MAX_VERTS = 40000;
const RANGE = 1800; // only AI within this distance of the camera
const PLAN_PIECES = 8;
const COLORS = {
  pirate: 0xff3b3b, ally: 0x2ee6ff, base: 0xffd23f, boss: 0xff2e88,
  road: 0xffffff, flyer: 0xc77dff, walker: 0x7dff3a,
};

export class AIPaths {
  constructor(game) {
    this.game = game;
    this.pos = new Float32Array(MAX_VERTS * 3);
    this.col = new Float32Array(MAX_VERTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    game.scene.add(this.lines);
    this.n = 0;
    this._c = new THREE.Color();
    this._u = new THREE.Vector3();
  }

  hide() { this.lines.visible = false; }

  seg(a, b, color) {
    if (this.n + 2 > MAX_VERTS) return;
    const i = this.n * 3, c = this._c.setHex(color), u = this._u;
    // lifted a little off the ground against z-fighting
    u.copy(a).normalize().multiplyScalar(0.8);
    this.pos[i] = a.x + u.x; this.pos[i + 1] = a.y + u.y; this.pos[i + 2] = a.z + u.z;
    u.copy(b).normalize().multiplyScalar(0.8);
    this.pos[i + 3] = b.x + u.x; this.pos[i + 4] = b.y + u.y; this.pos[i + 5] = b.z + u.z;
    this.col[i] = this.col[i + 3] = c.r; this.col[i + 1] = this.col[i + 4] = c.g; this.col[i + 2] = this.col[i + 5] = c.b;
    this.n += 2;
  }

  // a polyline through pts[from..] (Vector3s), optionally starting at `start`
  poly(pts, from, color, start = null) {
    let prev = start;
    for (let i = Math.max(0, from); i < pts.length; i++) {
      if (prev) this.seg(prev, pts[i], color);
      prev = pts[i];
    }
    return prev;
  }

  update() {
    const g = this.game, cam = g.camera.position;
    this.n = 0;
    // --- enemies, allies, base patrols, bosses: line to the steering goal ---
    for (const e of g.enemies.list) {
      if (e.dead || !e.dbgGoal || g.time - e.dbgT > 0.25 || !e.body) continue;
      if (e.body.pos.distanceTo(cam) > RANGE) continue;
      const color = e.boss ? COLORS.boss : e.kind === 'ally' ? COLORS.ally : e.base ? COLORS.base : COLORS.pirate;
      this.seg(e.center || e.body.pos, e.dbgGoal, color);
    }
    // --- traffic ---
    const T = g.world && g.world.traffic;
    if (T) {
      for (const v of T.roadVehicles || []) {
        if (!v.piece || !v.root.visible || v.hp <= 0 || v.pos.distanceTo(cam) > RANGE) continue;
        const cum = v.piece.path.cum;
        let i = 0;
        while (i < cum.length - 1 && cum[i] < v.s) i++;
        let at = this.poly(v.piece.path.pts, i, COLORS.road, v.pos);
        const plan = v.plan || [];
        for (let k = 0; k < plan.length && k < PLAN_PIECES; k++) at = this.poly(plan[k].path.pts, 0, COLORS.road, at);
      }
      for (const v of T.vehicles || []) {
        if (v.piece || v.offroad || !v.path || !v.root.visible || v.pos.distanceTo(cam) > RANGE * 2) continue;
        const cum = v.path.cum, pts = v.path.pts;
        let i = 0;
        while (i < cum.length - 1 && cum[i] < v.s) i++;
        if (v.dir > 0) this.poly(pts, i, COLORS.flyer, v.pos);
        else { let at = v.pos; for (let k = i - 1; k >= 0; k--) { this.seg(at, pts[k], COLORS.flyer); at = pts[k]; } }
      }
      for (const wk of T.walkers || []) {
        if (wk.done || wk.idle || !wk.loc.group || !wk.fig.root.visible) continue;
        const p = wk.fig.root.getWorldPosition(this._p ||= new THREE.Vector3());
        if (p.distanceTo(cam) > RANGE * 0.4) continue;
        let at = p.clone();
        for (let k = wk.seg + 1; k < wk.pts.length; k++) {
          const q = wk.pts[k];
          const w = wk.loc.group.localToWorld(new THREE.Vector3(q.x, q.y, q.z));
          this.seg(at, w, COLORS.walker);
          at = w;
        }
      }
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, this.n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.lines.visible = this.n > 0;
  }
}

// Dev overlay: a ring and beacon line on every live enemy, seen through terrain. Colour = spawn pool.
// Shown with the pirate spawn debug (cheats.js).
const MARK_VERTS = 16000;
const RING = 24;
const MARK_COLORS = { roaming: 0xff3b3b, den: 0xff9f1c, raider: 0xff2e88, core: 0xffffff, other: 0xffd23f, ally: 0x2ee6ff };

export class EnemyMarkers {
  constructor(game) {
    this.game = game;
    this.pos = new Float32Array(MARK_VERTS * 3);
    this.col = new Float32Array(MARK_VERTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 998;
    this.lines.visible = false;
    game.scene.add(this.lines);
    this.n = 0;
    this._c = new THREE.Color();
    this._up = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._p = new THREE.Vector3(); this._q = new THREE.Vector3();
  }

  hide() { this.lines.visible = false; }

  seg(a, b, c) {
    if (this.n + 2 > MARK_VERTS) return;
    const i = this.n * 3;
    this.pos[i] = a.x; this.pos[i + 1] = a.y; this.pos[i + 2] = a.z;
    this.pos[i + 3] = b.x; this.pos[i + 4] = b.y; this.pos[i + 5] = b.z;
    this.col[i] = this.col[i + 3] = c.r; this.col[i + 1] = this.col[i + 4] = c.g; this.col[i + 2] = this.col[i + 5] = c.b;
    this.n += 2;
  }

  update() {
    const g = this.game, cam = g.camera.position, up = this._up, a = this._a, b = this._b, p = this._p, q = this._q;
    this.n = 0;
    for (const e of g.enemies.list) {
      if (e.dead || !e.body) continue;
      if (e.base && !e.base.awake) continue;
      const c0 = e.center || e.body.pos;
      if (c0.distanceTo(cam) > 2500) continue;
      const kind = e.kind === 'core' ? 'core' : e.kind === 'ally' ? 'ally'
        : e.faction !== 'pirate' ? 'other' : e.home ? 'den' : e.targetObj ? 'raider' : 'roaming';
      const c = this._c.setHex(MARK_COLORS[kind]);
      up.copy(c0).normalize();
      a.set(1, 0, 0).addScaledVector(up, -up.x);
      if (a.lengthSq() < 1e-6) a.set(0, 0, 1).addScaledVector(up, -up.z);
      a.normalize();
      b.crossVectors(up, a);
      const r = Math.max(e.radius || 2, 2) * 1.4;
      // ring, then a beacon straight up (taller with distance so it reads at range)
      for (let i = 0; i < RING; i++) {
        const t0 = (i / RING) * Math.PI * 2, t1 = ((i + 1) / RING) * Math.PI * 2;
        p.copy(c0).addScaledVector(a, Math.cos(t0) * r).addScaledVector(b, Math.sin(t0) * r);
        q.copy(c0).addScaledVector(a, Math.cos(t1) * r).addScaledVector(b, Math.sin(t1) * r);
        this.seg(p, q, c);
      }
      const h = 12 + Math.min(60, c0.distanceTo(cam) * 0.04);
      p.copy(c0); q.copy(c0).addScaledVector(up, h);
      this.seg(p, q, c);
      // a small cross on top of the beacon
      p.copy(q).addScaledVector(a, 2); q.copy(q).addScaledVector(a, -2);
      this.seg(p, q, c);
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, this.n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.lines.visible = this.n > 0;
  }
}
