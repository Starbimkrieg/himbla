import * as THREE from 'three';
import { FACTIONS } from './locations.js';
import { toon, glow, ink } from './toon.js';
import { arcDist, tangent, frameQuat, greatCircle, SUN } from './geo.js';
import { mulberry32 } from './rng.js';
import { makeRover } from './models.js';

// Every square metre of the Moon belongs to somebody. Territory is a weighted Voronoi split
// around each faction's settlements and outposts; borders are marked with glowing pylons,
// small faction structures dot the countryside, and military patrols run between them.
const KEY = 'moonrunner-territory-v1';
const MILITARY = ['spacecom', 'vostok', 'daedalus'];
const KINDS = {
  spacecom: ['tower', 'depot'], vostok: ['tower', 'depot'], daedalus: ['tower', 'depot'],
  kepler: ['farm', 'mast'], meridian: ['kiosk', 'mast'], rustmoon: ['shack', 'junk'],
};
const KIND_NAMES = {
  tower: 'Watchtower', depot: 'Supply Depot', farm: 'Farm Dome', mast: 'Relay Mast', kiosk: 'Trading Kiosk',
  shack: 'Scrap Shack', junk: 'Junk Pile', homestead: 'Homestead', lab: 'Field Lab',
};
const OUTPOST_W = 0.42; // how strongly an outpost claims ground compared with a settlement
const BUILD_R = 900, DROP_R = 1150;
const LOOT_CD = 240, LOOT_REP = 2; // raid/rebuild cooldown (s) and reputation cost
const OUTPOST_HP = { farm: 160, depot: 220 };
const BUILT_R = 40, MOD_R = 26; // founded outposts: flattened radius and the module ring
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

const hex = (f) => new THREE.Color(FACTIONS[f] ? FACTIONS[f].color : '#c9c3d9').getHex();

export class Territory {
  constructor(game) {
    this.game = game;
    this.anchors = [];
    for (const l of game.locations) {
      if (l.poi || l.camp || !FACTIONS[l.faction] || l.faction === 'none') continue;
      this.anchors.push({ dir: l.dir, faction: l.faction, w: l.hq ? 1.5 : 1, loc: l });
    }
    this.baseAnchors = this.anchors.slice();
    this.outposts = [];
    this.patrols = [];
    this.current = null;
    this.chip = document.createElement('div');
    this.chip.id = 'terrchip';
    this.chip.className = 'chip terr hidden';
    const tl = document.getElementById('topleft');
    tl.insertBefore(this.chip, tl.children[2] || null);
    this.genOutposts();
    this.load();
    this.rebuild();
    // farm domes and supply depots can be shot to pieces (same haul as a raid)
    game.blastHooks = game.blastHooks || [];
    game.blastHooks.push((pos, radius, damage, owner) => this.onBlast(pos, radius, damage, owner));
  }

  // ---------- ownership ----------
  owner(dir, anchors = this.anchors) {
    let best = null, bd = Infinity;
    for (const a of anchors) {
      const d = arcDist(dir, a.dir) / a.w;
      if (d < bd) { bd = d; best = a; }
    }
    return best ? best.faction : 'spacecom';
  }

  genOutposts() {
    const g = this.game;
    const rr = mulberry32(4242);
    for (let tries = 0; tries < 6000 && this.outposts.length < 120; tries++) {
      const u = rr() * 2 - 1, th = rr() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
      const d = new THREE.Vector3(sq * Math.cos(th), u, sq * Math.sin(th));
      if (g.locations.some((l) => arcDist(d, l.dir) < (l.zoneR || l.r) * 1.6 + 120)) continue;
      if (this.outposts.some((o) => arcDist(d, o.dir) < 420)) continue;
      const faction = this.owner(d, this.baseAnchors);
      const kinds = KINDS[faction] || KINDS.kepler;
      this.outposts.push({ id: 'op' + this.outposts.length, dir: d, faction, kind: kinds[Math.floor(rr() * kinds.length)], model: null, cols: [], seed: Math.floor(rr() * 1e6) });
    }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d) return;
      for (const [id, f] of Object.entries(d.captured || {})) { const o = this.outposts.find((x) => x.id === id); if (o) { o.faction = f; o.captured = true; } }
      for (const b of d.built || []) {
        const o = { ...b, dir: new THREE.Vector3().fromArray(b.dir), model: null, cols: [], built: true };
        this.outposts.push(o);
        this.game.planet.addFlat(o.dir, BUILT_R);
      }
    } catch { /* fresh moon */ }
  }

  save() {
    const captured = {};
    for (const o of this.outposts) if (o.captured) captured[o.id] = o.faction;
    const built = this.outposts.filter((o) => o.built).map((o) => ({ id: o.id, dir: o.dir.toArray(), faction: o.faction, kind: o.kind, name: o.name, modules: o.modules || [], seed: o.seed }));
    try { localStorage.setItem(KEY, JSON.stringify({ captured, built })); } catch { /* unavailable */ }
  }

  // Outposts claim a little ground of their own (so captures move the borders).
  rebuild() {
    this.anchors = this.baseAnchors.concat(this.outposts.map((o) => ({ dir: o.dir, faction: o.faction, w: o.built ? 0.6 : OUTPOST_W })));
    this.buildBorders();
    this.mapCache = null;
    this.buildRoutes();
  }

  // Flip an outpost to a new owner (story captures).
  capture(o, faction) {
    o.faction = faction;
    o.captured = true;
    if (o.model) this.despawn(o);
    this.rebuild();
    this.save();
  }

  // A brand-new outpost (story base-building).
  found(dir, faction, kind, name) {
    const o = { id: 'built' + Date.now().toString(36), dir: dir.clone().normalize(), faction, kind, name, modules: [], model: null, cols: [], built: true, seed: Math.floor(Math.random() * 1e6) };
    this.outposts.push(o);
    this.game.planet.addFlat(o.dir, BUILT_R);
    this.rebuild();
    this.save();
    return o;
  }

  name(o) { return o.name || `${FACTIONS[o.faction] ? FACTIONS[o.faction].name : ''} ${KIND_NAMES[o.kind] || 'Outpost'}`; }

  // ---------- border pylons (one instanced mesh for the whole Moon) ----------
  buildBorders() {
    const g = this.game;
    if (this.borders) { g.scene.remove(this.borders.shaft, this.borders.cap); this.borders.shaft.dispose(); this.borders.cap.dispose(); }
    const N = 9000, pts = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    const d = new THREE.Vector3(), t = new THREE.Vector3(), s = new THREE.Vector3(), o = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), th = ga * i;
      d.set(r * Math.cos(th), y, r * Math.sin(th));
      const f = this.owner(d);
      tangent(t.set(1, 0, 0), d, t);
      if (t.lengthSq() < 1e-4) tangent(t.set(0, 0, 1), d, t);
      t.normalize();
      s.crossVectors(d, t);
      let edge = false;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        o.copy(d).addScaledVector(t, a * 0.02).addScaledVector(s, b * 0.02).normalize();
        if (this.owner(o) !== f) { edge = true; break; }
      }
      if (edge && !g.locations.some((l) => arcDist(d, l.dir) < (l.zoneR || l.r) + 40)) pts.push({ dir: d.clone(), f });
    }
    const shaftGeo = new THREE.CylinderGeometry(0.25, 0.35, 7, 6).translate(0, 3.5, 0);
    const capGeo = new THREE.OctahedronGeometry(0.9, 0).translate(0, 7.8, 0);
    const shaft = new THREE.InstancedMesh(shaftGeo, toon(0x2a2540), pts.length);
    const cap = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
    pts.forEach((b, i) => {
      g.planet.ground(b.dir, p, -0.3);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.dir);
      m.compose(p, q, sc);
      shaft.setMatrixAt(i, m);
      cap.setMatrixAt(i, m);
      cap.setColorAt(i, col.set(FACTIONS[b.f].color));
    });
    for (const im of [shaft, cap]) { im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; g.scene.add(im); }
    if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
    this.borders = { shaft, cap, count: pts.length };
  }

  // ---------- outpost structures, built only near the player ----------
  spawn(o) {
    const g = this.game;
    if (this.wrecked(o)) { this.spawnRubble(o); return; }
    const root = new THREE.Group();
    const c = hex(o.faction);
    const rr = mulberry32(o.seed);
    const add = (geo, mat, x, y, z, outline = 0.06) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; if (outline) ink(m, outline); root.add(m); return m; };
    const flag = (x, z, h = 9) => {
      add(new THREE.CylinderGeometry(0.1, 0.1, h, 5), toon(0x3a3550), x, h / 2, z, 0.03);
      const f = add(new THREE.PlaneGeometry(2.4, 1.4), toon(c, { side: THREE.DoubleSide }), x + 1.25, h - 0.8, z, 0);
      f.userData.flag = true;
    };
    const boxes = [];
    const solid = (hx, hy, hz, x, z) => boxes.push({ hx, hy, hz, x, z });
    switch (o.kind) {
      case 'tower': {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.2, 0.3, 12, 5), toon(0x55607a), sx * 1.8, 6, sz * 1.8, 0.04);
        add(new THREE.BoxGeometry(5, 2.6, 5), toon(0x55607a), 0, 13, 0, 0.1);
        add(new THREE.BoxGeometry(5.4, 0.4, 5.4), toon(c), 0, 14.5, 0, 0.06);
        const lamp = add(new THREE.SphereGeometry(0.6, 8, 6), glow(0xfff6a8), 0, 15.2, 0, 0);
        lamp.userData.blink = true;
        flag(2.8, 2.8, 17);
        solid(2.2, 7.5, 2.2, 0, 0);
        break;
      }
      case 'depot': {
        add(new THREE.BoxGeometry(10, 3.5, 6), toon(0x4a4f5e), 0, 1.75, 0, 0.1);
        add(new THREE.BoxGeometry(10.4, 0.5, 6.4), toon(c), 0, 3.75, 0, 0.06);
        for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(1.4, 1.4, 1.4), toon([0xffd23f, 0x2b59c3, 0x3a3550][i % 3]), 6 + (i % 2) * 1.6, 0.7 + Math.floor(i / 2) * 1.4, -1 + rr() * 2, 0.04);
        add(new THREE.CylinderGeometry(0.08, 0.08, 8, 4), toon(0x3a3550), -4, 7.5, 2, 0.02);
        flag(-4.5, -2.5, 7);
        solid(5, 1.8, 3, 0, 0);
        break;
      }
      case 'farm': {
        add(new THREE.SphereGeometry(7, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.45 }), 0, 0, 0, 0.12);
        for (let i = 0; i < 9; i++) add(new THREE.ConeGeometry(0.6, 1.8, 5), toon(0x5fbf4a), -3 + (i % 3) * 3, 0.9, -3 + Math.floor(i / 3) * 3, 0.03);
        add(new THREE.TorusGeometry(7, 0.3, 6, 24).rotateX(Math.PI / 2), toon(c), 0, 0.3, 0, 0.04);
        flag(8, 0, 6);
        solid(5.2, 3.2, 5.2, 0, 0);
        break;
      }
      case 'mast': {
        add(new THREE.CylinderGeometry(0.25, 0.6, 18, 6), toon(0xd8d4e8), 0, 9, 0, 0.06);
        const dish = add(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), toon(0xf5f5f5, { side: THREE.DoubleSide }), 0, 16, 1.2, 0.05);
        dish.rotation.x = -1.1;
        dish.userData.spin = true;
        add(new THREE.BoxGeometry(3, 2, 3), toon(c), 0, 1, 0, 0.06);
        const lamp = add(new THREE.SphereGeometry(0.4, 8, 6), glow(0xff2a4a), 0, 18.4, 0, 0);
        lamp.userData.blink = true;
        solid(1.6, 9, 1.6, 0, 0);
        break;
      }
      case 'kiosk': {
        add(new THREE.BoxGeometry(6, 3, 4), toon(0xfff4e0), 0, 1.5, 0, 0.08);
        add(new THREE.BoxGeometry(7, 0.4, 5), toon(c), 0, 3.4, 0, 0.06);
        const bb = add(new THREE.BoxGeometry(8, 3.5, 0.3), toon(c), 0, 7, -2.5, 0.06);
        bb.userData.spin = false;
        add(new THREE.PlaneGeometry(7, 2.6), glow(0xffd23f), 0, 7, -2.32, 0);
        add(new THREE.CylinderGeometry(0.15, 0.15, 5, 5), toon(0x3a3550), 0, 3, -2.6, 0.03);
        solid(3, 1.6, 2, 0, 0);
        break;
      }
      case 'shack': {
        add(new THREE.BoxGeometry(6, 3.2, 5), toon(0x5a4a3a), 0, 1.6, 0, 0.08);
        const roof = add(new THREE.BoxGeometry(7, 0.4, 6), toon(0x7a6a5a), 0, 3.5, 0, 0.06);
        roof.rotation.z = 0.12;
        for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(1 + rr(), 0.6 + rr(), 1 + rr()), toon([0x6b5a4a, 0x3a3550, 0x7a3a2a][i % 3]), -5 + rr() * 10, 0.4, 4 + rr() * 2, 0.04);
        flag(3.5, 3, 8);
        add(new THREE.SphereGeometry(0.4, 8, 6), toon(0xffffff), 4.6, 7.3, 3.02, 0);
        solid(3, 1.8, 2.5, 0, 0);
        break;
      }
      case 'junk': {
        for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(1.5 + rr() * 2.5, 1 + rr() * 2, 1.5 + rr() * 2.5), toon([0x6b5a4a, 0x3a3550, 0x7a3a2a, 0x5a5f6e][i % 4]), -4 + rr() * 8, 0.6 + rr() * 1.5, -4 + rr() * 8, 0.05).rotation.set(rr(), rr(), rr());
        const tire = add(new THREE.TorusGeometry(1.2, 0.45, 6, 12), toon(0x221d33), 3, 1.2, 3, 0.04);
        tire.rotation.x = 1.2;
        flag(-4, 4, 7);
        solid(4, 1.8, 4, 0, 0);
        break;
      }
      default: {
        // player-founded outposts: a proper little compound on flattened ground — a big hub dome
        // with an entry tunnel, a paved apron, and a ring of module plots around it
        add(new THREE.CylinderGeometry(BUILT_R - 4, BUILT_R - 3, 0.3, 40), toon(0x8a8698), 0, 0.15, 0, 0.06);
        add(new THREE.SphereGeometry(10, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xfff4e0), 0, 0, 0, 0.14);
        add(new THREE.TorusGeometry(10, 0.5, 6, 32).rotateX(Math.PI / 2), toon(c), 0, 0.5, 0, 0.05);
        add(new THREE.CylinderGeometry(2.4, 2.4, 6, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon(0xe8e2f4, { side: THREE.DoubleSide }), 0, 0.2, 10.5, 0.06);
        add(new THREE.BoxGeometry(1.6, 2.6, 0.8), toon(0x2ec4ff), 0, 1.3, 13.4, 0.05);
        add(new THREE.PlaneGeometry(1.2, 0.8), glow(0x7dff3a), 0, 2.0, 13.82, 0);
        for (let k = 0; k < 6; k++) { // plot markers where modules go
          const a = (k / 6) * Math.PI * 2 + 0.6;
          add(new THREE.TorusGeometry(5.5, 0.12, 4, 24).rotateX(Math.PI / 2), glow(c), Math.cos(a) * MOD_R, 0.35, Math.sin(a) * MOD_R, 0);
        }
        flag(-12, 6, 16);
        solid(8, 4.5, 8, 0, 0);
        for (const [i, mod] of (o.modules || []).entries()) this.addModule(root, mod, i, c, add, solid);
      }
    }
    const pos = g.planet.ground(o.dir, new THREE.Vector3(), -0.2);
    root.position.copy(pos);
    frameQuat(o.dir, tangent(SUN.clone(), o.dir).normalize(), root.quaternion);
    root.rotateY(rr() * Math.PI * 2);
    g.scene.add(root);
    root.updateMatrixWorld(true);
    o.model = root;
    o.cols = boxes.map((b) => {
      const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion), ay = new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion), az = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
      const cpos = root.localToWorld(new THREE.Vector3(b.x, b.hy, b.z));
      return g.colliders.add({ type: 'box', c: cpos, ax, ay, az, hx: b.hx, hy: b.hy, hz: b.hz });
    });
    // the terminal for founded outposts sits at the end of the entry tunnel
    o.terminal = root.localToWorld(new THREE.Vector3(0, 0, 14.4));
  }

  // Modules sit on their plots, built at roughly a third of settlement scale.
  addModule(root, mod, i, c, add, solid) {
    const a = (i / 6) * Math.PI * 2 + 0.6;
    const x = Math.cos(a) * MOD_R, z = Math.sin(a) * MOD_R;
    const S = 2.2;
    const sub = (geo, mat, lx, ly, lz, outline = 0.06) => add(geo.clone().scale(S, S, S), mat, x + lx * S, ly * S, z + lz * S, outline);
    if (mod === 'greenhouse') {
      sub(new THREE.SphereGeometry(3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.55 }), 0, 0, 0, 0.08);
      for (let k = 0; k < 5; k++) sub(new THREE.ConeGeometry(0.4, 1.2, 5), toon(0x3f9a3a), -1.5 + k * 0.75, 0.6, (k % 2) - 0.5, 0.02);
      solid(3 * S * 0.75, 1.5 * S, 3 * S * 0.75, x, z);
    } else if (mod === 'clinic') {
      sub(new THREE.BoxGeometry(4, 3, 4), toon(0xffffff), 0, 1.5, 0, 0.08);
      sub(new THREE.BoxGeometry(2.4, 0.6, 0.2), toon(0xff2a4a), 0, 3.2, 2.05, 0);
      sub(new THREE.BoxGeometry(0.6, 2.4, 0.2), toon(0xff2a4a), 0, 3.2, 2.06, 0);
      solid(2 * S, 1.5 * S, 2 * S, x, z);
    } else if (mod === 'beacon') {
      sub(new THREE.CylinderGeometry(0.3, 0.8, 14, 6), toon(0xd8d4e8), 0, 7, 0, 0.05);
      const l = sub(new THREE.OctahedronGeometry(1, 0), glow(c), 0, 14.8, 0, 0);
      l.userData.spin = true;
      solid(0.8 * S, 7 * S, 0.8 * S, x, z);
    } else if (mod === 'turret') {
      sub(new THREE.CylinderGeometry(1.4, 1.8, 2, 8), toon(0x55607a), 0, 1, 0, 0.06);
      sub(new THREE.BoxGeometry(1.2, 1, 3), toon(0x3a3550), 0, 2.5, 0, 0.05);
      solid(1.6 * S, 1.5 * S, 1.6 * S, x, z);
    } else if (mod === 'market') {
      sub(new THREE.BoxGeometry(5, 2.5, 3), toon(0xffd23f), 0, 1.25, 0, 0.08);
      sub(new THREE.ConeGeometry(3.2, 1.6, 4), toon(0xff2e88), 0, 3.3, 0, 0.06).rotation.y = Math.PI / 4;
      solid(2.5 * S, 1.6 * S, 1.5 * S, x, z);
    } else if (mod === 'garage') {
      sub(new THREE.BoxGeometry(7, 4, 6), toon(0x4a4f5e), 0, 2, 0, 0.08);
      sub(new THREE.BoxGeometry(5, 3, 0.2), toon(c), 0, 1.5, 3.05, 0);
      solid(3.5 * S, 2 * S, 3 * S, x, z);
    }
  }

  // ---------- shooting them up ----------
  wrecked(o) { return (o.wreckedUntil || 0) > this.game.time; }

  onBlast(pos, radius, damage, owner) {
    if (owner !== 'player') return;
    for (const o of this.outposts) {
      if (!o.model || o.rubble || (o.kind !== 'farm' && o.kind !== 'depot')) continue;
      const c = _v.copy(o.model.position).addScaledVector(o.dir, 2.5);
      const R = o.kind === 'farm' ? 7.5 : 6;
      const d = pos.distanceTo(c);
      if (d > radius + R) continue;
      const max = OUTPOST_HP[o.kind];
      o.hp = (o.hp ?? max) - damage * Math.max(0.4, 1 - Math.max(0, d - R) / Math.max(1, radius));
      if (o.hp <= 0) this.destroy(o);
      else if (Math.random() < 0.5) this.game.fx.pop(`${Math.ceil(o.hp / max * 100)}%`, c.clone().addScaledVector(o.dir, 6), { color: '#ff9f1c', size: 30, life: 0.6 });
    }
  }

  destroy(o) {
    const g = this.game;
    const c = o.model.position.clone().addScaledVector(o.dir, 2);
    g.fx.explosion(c, 14, true);
    g.audio.boom(true);
    g.cam.shake = Math.max(g.cam.shake, 0.8);
    g.fx.pop(o.kind === 'farm' ? 'DOME DOWN!' : 'DEPOT DESTROYED!', c.clone().addScaledVector(o.dir, 8), { color: '#ff4f2e', size: 64, life: 1.4 });
    // the same haul as a raid, scattered in the wreckage
    if (o.kind === 'farm') g.alchemy.dropLoot('sapling', c, { name: ['Fern', 'Sprig', 'Basil', 'Twiggy', 'Moss', 'Clover'][Math.floor(Math.random() * 6)] });
    else { g.alchemy.dropLoot(null, c, { credits: 150 + Math.floor(Math.random() * 151) }); g.alchemy.dropLoot('wiring', c); }
    g.rep.add(o.faction, -LOOT_REP, `Destroyed a ${KIND_NAMES[o.kind]}`, { war: false });
    o.hp = OUTPOST_HP[o.kind];
    o.wreckedUntil = g.time + LOOT_CD;
    o.lootAt = g.time;
    this.despawn(o);
    this.spawnRubble(o);
  }

  // charred remains until it's rebuilt
  spawnRubble(o) {
    const g = this.game;
    const root = new THREE.Group();
    const rr = mulberry32(o.seed + 7);
    const mats = [toon(0x2a2433), toon(0x3a3550), toon(0x4a3f3a)];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8 + rr() * 2.2, 0.3 + rr() * 1.2, 0.8 + rr() * 2.2), mats[i % 3]);
      m.position.set(-5 + rr() * 10, 0.3, -5 + rr() * 10);
      m.rotation.set(rr() * 0.6, rr() * 3, rr() * 0.6);
      ink(m, 0.04);
      root.add(m);
    }
    if (o.kind === 'farm') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.3, 6, 24, Math.PI * 1.3).rotateX(Math.PI / 2), toon(0x55607a));
      ring.position.y = 0.3;
      root.add(ring);
    }
    root.position.copy(g.planet.ground(o.dir, new THREE.Vector3(), -0.2));
    frameQuat(o.dir, tangent(SUN.clone(), o.dir).normalize(), root.quaternion);
    g.scene.add(root);
    o.model = root;
    o.rubble = true;
    o.cols = [];
  }

  despawn(o) {
    o.rubble = false;
    if (o.model) { o.model.removeFromParent(); o.model = null; }
    for (const c of o.cols) this.game.colliders.remove(c);
    o.cols = [];
  }

  // ---------- military patrols between their outposts ----------
  buildRoutes() {
    this.routes = [];
    const mil = this.outposts.filter((o) => MILITARY.includes(o.faction));
    for (const a of mil) {
      let best = null, bd = 1700;
      for (const b of mil) {
        if (b === a || b.faction !== a.faction) continue;
        const d = arcDist(a.dir, b.dir);
        if (d < bd) { bd = d; best = b; }
      }
      if (best && !this.routes.some((r) => (r.a === best && r.b === a))) this.routes.push({ a, b: best, faction: a.faction, len: bd, unit: null });
      // lone outposts still get a little loop of their own
      else if (!best) this.routes.push({ a, b: null, faction: a.faction, len: 300, unit: null });
    }
    for (const p of this.patrols) p.model.root.removeFromParent();
    this.patrols = [];
  }

  spawnPatrol(r) {
    const g = this.game;
    const fc = hex(r.faction);
    const m = makeRover({ color: 0x55607a, trim: fc, pirate: false, flag: fc });
    m.root.scale.setScalar(1.15);
    g.scene.add(m.root);
    const unit = { route: r, model: m, t: Math.random(), dir: 1, pos: new THREE.Vector3(), heading: new THREE.Vector3(), fireCd: 1 + Math.random() * 2, speed: 16 };
    r.unit = unit;
    this.patrols.push(unit);
  }

  routePoint(r, t, out) {
    if (r.b) return out.copy(r.a.dir).lerp(r.b.dir, 0.06 + t * 0.88).normalize();
    // loop around a lone outpost
    const a = t * Math.PI * 2;
    const tA = tangent(_v.set(1, 0, 0), r.a.dir).normalize();
    const tB = new THREE.Vector3().crossVectors(r.a.dir, tA);
    return out.copy(r.a.dir).addScaledVector(tA, Math.cos(a) * 0.024).addScaledVector(tB, Math.sin(a) * 0.024).normalize();
  }

  updatePatrols(dt) {
    const g = this.game;
    const P = g.player;
    for (const r of this.routes) {
      const near = arcDist(P.pos, r.a.dir) < 1000;
      if (near && !r.unit && this.patrols.length < 4) this.spawnPatrol(r);
      else if (!near && r.unit) { r.unit.model.root.removeFromParent(); this.patrols = this.patrols.filter((u) => u !== r.unit); r.unit = null; }
    }
    for (const u of this.patrols) {
      const r = u.route;
      u.t += (u.dir * u.speed * dt) / Math.max(50, r.len);
      if (r.b) { if (u.t > 1 || u.t < 0) { u.t = Math.min(1, Math.max(0, u.t)); u.dir *= -1; } }
      else u.t = (u.t + 1) % 1;
      const d = this.routePoint(r, u.t, new THREE.Vector3());
      const ahead = this.routePoint(r, Math.min(1, Math.max(0, u.t + u.dir * 0.01)), new THREE.Vector3());
      const prev = u.pos.clone();
      g.planet.ground(d, u.pos);
      const fwd = tangent(ahead.sub(d), d);
      if (fwd.lengthSq() > 1e-10) u.heading.copy(fwd.normalize());
      const m = u.model;
      m.root.position.copy(u.pos);
      frameQuat(d, u.heading, _q);
      m.root.quaternion.slerp(_q, Math.min(1, dt * 5));
      const sp = prev.lengthSq() ? prev.distanceTo(u.pos) / Math.max(dt, 1e-3) : 0;
      for (const w of m.wheels) w.rotation.x += sp * dt / 0.85;
      // they keep the roads clear of pirates
      u.fireCd -= dt;
      if (u.fireCd <= 0) {
        u.fireCd = 1.6;
        const from = u.pos.clone().addScaledVector(d, 4);
        let target = null, bd = 260;
        for (const e of g.enemies.list) {
          if (e.dead || e.faction !== 'pirate' || e.kind === 'core' || !e.center) continue;
          if (g.enemies.friendly(e)) continue;
          const dd = e.center.distanceTo(from);
          if (dd < bd && g.planet.visible(from, e.center)) { bd = dd; target = e; }
        }
        if (target) {
          const dir = target.center.clone().sub(from).normalize();
          g.projectiles.fire('mil', from, dir.multiplyScalar(130), { damage: 22, splash: 4, color: 0xffb02e, size: 0.45, knock: 0.5, spare: true });
          m.gun.lookAt(target.center);
        }
      }
    }
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game;
    const P = g.player;
    this.t = (this.t || 0) + dt;
    for (const o of this.outposts) {
      const d = arcDist(P.pos, o.dir);
      if (!o.model && d < BUILD_R) this.spawn(o);
      else if (o.model && d > DROP_R) this.despawn(o);
      else if (o.rubble && !this.wrecked(o)) { this.despawn(o); this.spawn(o); } // rebuilt
      if (o.rubble && o.model && d < 500 && Math.random() < dt * 6) g.fx.spawn(o.model.position.clone().addScaledVector(o.dir, 1.5), o.dir.clone().multiplyScalar(5), { color: 0x2a2433, size: 1.4, life: 1.6, count: 1, spread: 3 });
      if (o.model && d < 400) o.model.traverse((m) => {
        if (m.userData.spin) m.rotation.y += dt * 0.6;
        if (m.userData.blink) m.visible = Math.sin(this.t * 4 + o.seed) > -0.3;
        if (m.userData.flag) m.rotation.y = Math.sin(this.t * 2 + o.seed) * 0.25;
      });
    }
    this.updatePatrols(dt);
    // which territory am I in?
    this.checkT = (this.checkT || 0) - dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      const f = this.owner(P.pos.clone().normalize());
      if (f !== this.current) {
        const first = this.current === null;
        this.current = f;
        const F = FACTIONS[f];
        this.chip.textContent = `◆ ${F.name.toUpperCase()} TERRITORY`;
        this.chip.style.background = F.color;
        this.chip.classList.remove('hidden');
        if (!first && g.state === 'play') g.hud.toast(`Entering ${F.name} territory`, 2);
      }
    }
  }

  // ---------- raiding minor structures ----------
  // Farm domes give up a sapling (it goes in your jar, alive); supply depots a bundle of credits and
  // a length of electrical wiring. Either way the owners notice and like you a little less.
  interact() {
    const g = this.game;
    const P = g.player;
    let o = null;
    for (const x of this.outposts) {
      if (!x.model || x.rubble || (x.kind !== 'farm' && x.kind !== 'depot')) continue;
      if (x.model.position.distanceTo(P.pos) < (x.kind === 'farm' ? 12 : 11)) { o = x; break; }
    }
    if (!o) return false;
    const F = FACTIONS[o.faction];
    const wait = (o.lootAt || -1e9) + LOOT_CD - g.time;
    const what = o.kind === 'farm' ? 'TAKE A SAPLING' : 'RAID THE SUPPLY DEPOT';
    if (wait > 0) { g.hud.prompt(`${KIND_NAMES[o.kind].toUpperCase()} — PICKED CLEAN. RESTOCKS IN ${Math.ceil(wait)}s`); return true; }
    g.hud.prompt(`<b>F</b> — ${what} <span style="color:#ff2a4a">(−${LOOT_REP} ${F ? F.name.toUpperCase() : ''} REP)</span>`);
    if (!g.input.pressed('KeyF') || g.boardCooldown > 0) return true;
    const A = g.alchemy;
    if (o.kind === 'farm') {
      if (!A.owned) { g.hud.toast('A sapling is alive, it needs a containment jar. Dr. Zbornak sells them.', 3); return true; }
      if (A.used >= A.slots) { g.hud.toast('Your jar is full.', 2); return true; }
      A.add('sapling', ['Fern', 'Sprig', 'Basil', 'Twiggy', 'Moss', 'Clover'][Math.floor(Math.random() * 6)]);
      g.fx.pop('SAPLING SWIPED!', null, { color: '#5fbf4a', size: 46 });
    } else {
      const cash = 150 + Math.floor(Math.random() * 151);
      g.addCredits(cash, 'Depot');
      if (A.owned && A.used < A.slots) { A.add('wiring'); g.fx.pop('CREDITS + WIRING!', null, { color: '#ffb347', size: 46 }); }
      else { g.fx.pop(`+₵${cash}`, null, { color: '#ffd23f', size: 46 }); g.hud.toast(A.owned ? 'No room in the jar for the wiring.' : 'There was wiring too, but you have no jar to carry it in.', 2.5); }
    }
    o.lootAt = g.time;
    g.rep.add(o.faction, -LOOT_REP, `Raided a ${KIND_NAMES[o.kind]}`, { war: false });
    g.audio.pickup();
    g.boardCooldown = 0.4;
    return true;
  }

  // nearest outpost (optionally filtered)
  nearest(dir, filter = () => true) {
    let best = null, bd = Infinity;
    for (const o of this.outposts) {
      if (!filter(o)) continue;
      const d = arcDist(dir, o.dir);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // territory colour for a globe-map cell (cached per cell)
  cellColor(k, x, y, z) {
    if (!this.mapCache) this.mapCache = new Map();
    let c = this.mapCache.get(k);
    if (!c) {
      const f = this.owner(_v.set(x, y, z));
      c = new THREE.Color(FACTIONS[f].color);
      this.mapCache.set(k, c);
    }
    return c;
  }
}

export { KIND_NAMES, MILITARY };
