import * as THREE from 'three';
import { toon, glow, ink } from './toon.js';
import { arcDist, greatCircle, tangent } from './geo.js';

// Meteor showers: rare, one at a time, over a big patch of open ground (never a settlement or an
// outpost). The rocks are huge (7.5-17 m across the radius) and come in slow and shallow, gliding nearly sideways as
// the Moon pulls them down, so you can chase one, ride alongside it and bounce off it: a landing on top flings you
// high and away (see bounce()), so with a few rocks about you can chain them. Each rock
// is one of a few kinds (stony, iron, icy comet, carbon with glowing veins, crystal-studded). The patch shows on the globe map and minimap as a red warning zone while it lasts. Rocks
// only fall when you're close enough to see them: each one streaks in on the shower's slant, marks
// its impact point with a warning ring, is a real (bouncy) collider on the way down, so you can
// bounce off one for style, and bursts into tumbling chunks and a smouldering scorch mark on impact.
// Nothing lasts: chunks and scorches fade, and the zone clears when the shower ends.

const GRAV = 6; // m/s², the game's moon gravity
const FIRST = [420, 720]; // seconds of play before the first shower
const GAP = [900, 1500]; // between showers
const DUR = [130, 190];
const SPAWN_NEAR = 2200; // rocks fall while you're within this of the zone's edge
const SIZE = [7.5, 16.875]; // a rock's radius in metres (the first version's 6-13.5, 25% bigger)
// landing on top of a rock: it flings you straight up and away from where you hit it
const BOUNCE_UP = 36; // m/s up (was 22): about 110 m of air at the Moon's 6 m/s2, enough to reach the next rock
const BOUNCE_AWAY = 16; // m/s along the ground, away from the rock's body
const BOUNCE_GLIDE = 0.6; // the share of the rock's own glide you're carried along with
const BOUNCE_CD = 0.7; // s before the same rock can fling you again (landing on one again pogos you off it)
const CHAIN_WINDOW = 14; // a bounce within this many seconds of the last one is a chain
const rand = (a, b) => a + Math.random() * (b - a);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);

let CHUNK_GEO = null, SCORCH_TEX = null;
// a lumpy unit boulder of its own (a seed gives each rock its own shape), stretched a little
function rockGeo(lump, seed, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const a = seed * 1.7, b = seed * 2.3, c = seed * 0.9;
  for (let i = 0; i < p.count; i++) {
    _a.fromBufferAttribute(p, i);
    const n = Math.sin(_a.x * 3.1 + a) * Math.cos(_a.y * 2.7 + b) + 0.5 * Math.sin(_a.z * 5.3 + c + _a.x * 2);
    const k = 1 + lump * n;
    p.setXYZ(i, _a.x * k, _a.y * k, _a.z * k);
  }
  g.computeVertexNormals();
  if (!CHUNK_GEO) CHUNK_GEO = new THREE.DodecahedronGeometry(1, 0);
  return g;
}

// The kinds of rock: body colour, how lumpy, chunk colour, trail colour, and a dressing step.
export const KINDS = {
  stony: { w: 4, body: 0x6a5a52, lump: 0.22, chunk: 0x5a4a44, trail: 0xff8a2a, hot: 0xff6a2a },
  iron: { w: 2, body: 0x3c3f4c, lump: 0.08, chunk: 0x4a4d5a, trail: 0xfff1c0, hot: 0xffb347 },
  icy: { w: 2, body: 0xbfe6ff, lump: 0.14, chunk: 0xdff4ff, trail: 0x8fe3ff, hot: 0xe8fbff },
  carbon: { w: 2, body: 0x2a2228, lump: 0.3, chunk: 0x3a2e32, trail: 0xff5a1a, hot: 0xff3a1a },
  crystal: { w: 1, body: 0x4a3a6a, lump: 0.18, chunk: 0x6a4a8a, trail: 0xc77dff, hot: 0x7dff6a },
};
function pickKind() {
  let tot = 0;
  for (const k in KINDS) tot += KINDS[k].w;
  let x = Math.random() * tot;
  for (const k in KINDS) { x -= KINDS[k].w; if (x <= 0) return k; }
  return 'stony';
}

export function scorchTex() {
  if (SCORCH_TEX) return SCORCH_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(18,10,8,0.95)');
  gr.addColorStop(0.45, 'rgba(40,22,14,0.85)');
  gr.addColorStop(0.75, 'rgba(70,40,24,0.4)');
  gr.addColorStop(1, 'rgba(70,40,24,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  // radial streaks thrown out by the blast
  x.strokeStyle = 'rgba(20,12,8,0.5)';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
    x.lineWidth = 2 + Math.random() * 3;
    x.beginPath(); x.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20); x.lineTo(64 + Math.cos(a) * (45 + Math.random() * 17), 64 + Math.sin(a) * (45 + Math.random() * 17)); x.stroke();
  }
  SCORCH_TEX = new THREE.CanvasTexture(c);
  SCORCH_TEX.colorSpace = THREE.SRGBColorSpace;
  return SCORCH_TEX;
}

// A rock's materials by kind: body, hot (its glow: ice shards, veins, crystals) and chunk (the debris it breaks into).
export function meteorMats(kind) {
  const K = KINDS[kind];
  return { body: toon(K.body), hot: glow(K.hot), chunk: toon(K.chunk) };
}

// One rock's body, built to radius r (a lumpy unit rock stretched a little, then its kind's dressing: frost shards, glowing
// veins, crystal clusters or pits). M = meteorMats(kind). Returns { body, geo }; the Asset Row builds its rocks with this too.
export function makeMeteorRock(kind, M, r, seed) {
  const K = KINDS[kind];
  const geo = rockGeo(K.lump, seed, kind === 'iron' ? 3 : 2);
  const body = new THREE.Group();
  const mesh = new THREE.Mesh(geo, M.body);
  mesh.castShadow = true;
  ink(mesh, 0.05);
  body.add(mesh);
  body.scale.set(r * rand(0.85, 1.2), r * rand(0.75, 1.0), r * rand(0.9, 1.35));
  // dressing per kind (in the unit rock's frame)
  if (kind === 'icy') {
    // comet ice: frosty shards poking out
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0).scale(0.6, 1.8, 0.6), M.hot);
      _a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      sp.position.copy(_a).multiplyScalar(0.95);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _a);
      body.add(sp);
    }
  } else if (kind === 'carbon') {
    // glowing veins: embers half-sunk all over it
    for (let i = 0; i < 14; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(rand(0.06, 0.13), 6, 4), M.hot);
      _a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      e.position.copy(_a).multiplyScalar(0.98);
      e.scale.set(1, 1, rand(1.5, 3));
      e.lookAt(_a.clone().multiplyScalar(2));
      body.add(e);
    }
  } else if (kind === 'crystal') {
    // clusters of glowing crystals
    for (let c = 0; c < 3; c++) {
      _c.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      for (let i = 0; i < 4; i++) {
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.15, 0.28), 0).scale(0.55, 1.9, 0.55), i % 2 ? M.hot : glow(0xff2e88));
        _a.copy(_c).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5)).normalize();
        cr.position.copy(_a).multiplyScalar(0.9);
        cr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _a);
        body.add(cr);
      }
    }
  } else if (kind === 'iron') {
    // regmaglypts: thumbprint pits, and a fused crust glint
    for (let i = 0; i < 10; i++) {
      const pit = new THREE.Mesh(new THREE.SphereGeometry(rand(0.12, 0.2), 8, 6), toon(0x23252e));
      _a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      pit.position.copy(_a).multiplyScalar(0.97);
      pit.scale.set(1, 1, 0.35);
      pit.lookAt(_a.clone().multiplyScalar(2));
      body.add(pit);
    }
  }
  return { body, geo };
}

export class Meteors {
  constructor(game) {
    this.game = game;
    this.zone = null;
    this.next = rand(...FIRST);
    this.rocks = [];
    this.chunks = [];
    this.scorches = [];
    this.chain = 0; // bounces in a row (each within CHAIN_WINDOW s of the last)
    this.lastBounce = -1e9;
    this.mats = {};
    for (const k of Object.keys(KINDS)) this.mats[k] = meteorMats(k);
  }

  // ---------- the shower itself ----------
  // Somewhere 1.2-3.5 km from you, with no settlement or outpost under it.
  pickSite() {
    const g = this.game, P = g.player;
    const up = P.pos.clone().normalize();
    for (let tries = 0; tries < 80; tries++) {
      const r = rand(380, 560);
      const t = tangent(_a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
      const dir = greatCircle(up, t, rand(1200, 3500), new THREE.Vector3());
      if (g.locations.some((l) => arcDist(dir, l.dir) < Math.max(l.zoneR || 0, l.r * 1.9) + r + 200)) continue;
      if (g.territory && g.territory.outposts.some((o) => !o.gone && arcDist(dir, o.dir) < r + 120)) continue;
      return { dir, r };
    }
    return null;
  }

  begin() {
    const g = this.game;
    const site = this.pickSite();
    if (!site) { this.next = 60; return; }
    const up = site.dir;
    this.zone = {
      dir: site.dir, r: site.r, t: 0, dur: rand(...DUR), spawnT: 0,
      // the whole shower comes in on one slant, like a real one
      slant: tangent(_a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize(),
    };
    g.hud.alert('☄ METEOR SHOWER INCOMING ☄', '#ff4f2e', 4);
    g.audio.alarm();
  }

  end() {
    this.zone = null;
    this.next = rand(...GAP);
    this.game.hud.toast('The meteor shower has passed.', 2.5);
  }

  // ---------- rocks ----------
  // One rock coming down. By default it lands somewhere in the shower's zone on the shower's slant, first seen 280 m up;
  // `dir` (a unit vector from the Moon's centre: where it lands), `slant` and `height` aim it instead.
  spawnRock({ dir: at = null, slant = null, height = 280 } = {}) {
    const g = this.game, Z = this.zone;
    let dir = at;
    if (!dir) {
      const t = tangent(_a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), Z.dir).normalize();
      dir = greatCircle(Z.dir, t, Math.sqrt(Math.random()) * Z.r, new THREE.Vector3());
    }
    const gp = g.planet.ground(dir, new THREE.Vector3());
    const up = dir;
    // slow and shallow: 15-23 degrees below the horizon, almost sideways, like something being
    // reeled in by the Moon rather than dropped on it
    const speed = rand(22, 34), dive = THREE.MathUtils.degToRad(rand(15, 23));
    const fall = _b.copy(tangent(slant || Z.slant, up, _c).normalize()).multiplyScalar(Math.cos(dive)).addScaledVector(up, -Math.sin(dive)).normalize();
    const vel = fall.clone().multiplyScalar(speed);
    const travel = height / Math.sin(dive); // first seen ~280 m up: time to read it and plan a jump
    const pos = gp.clone().addScaledVector(fall, -travel);
    const r = rand(...SIZE);
    const kind = pickKind(), M = this.mats[kind];
    const seed = Math.random() * 100;
    const { body, geo } = makeMeteorRock(kind, M, r, seed);
    // its collision shape: three spheres strung along its longest axis (they turn with it)
    const sc = [body.scale.x, body.scale.y, body.scale.z];
    const li = sc.indexOf(Math.max(...sc));
    const minor = (sc.reduce((a, b) => a + b, 0) - sc[li]) / 2 * 0.92;
    const axis = new THREE.Vector3().setComponent(li, 1);
    const reach = Math.max(0, sc[li] - minor) * 0.85;
    const grp = new THREE.Group();
    grp.add(body);
    grp.position.copy(pos);
    g.scene.add(grp);
    const near = g.player.pos.distanceTo(gp) < 900;
    const blast = 8 + r * 1.8;
    const ring = near ? g.fx.warningRing(gp, blast, travel / speed) : null;
    const rock = { grp, mesh: body, geo, kind, pos, vel, r, gp, blast, axis, reach, minor, cols: [], spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(), spinRate: rand(0.2, 0.8), col: null, bounceT: 0, hurt: false, ring };
    this.rocks.push(rock);
  }

  // dev menu: a rock that comes down on the spot you're standing on, first seen 70 m up so it's a few seconds away
  // (the warning ring is on the ground; a landing on you hurts, so move, or go and stand on it as it comes in)
  spawnOnPlayer() {
    const dir = this.game.player.pos.clone().normalize();
    const slant = tangent(_a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), dir).normalize();
    this.spawnRock({ dir, slant, height: 70 });
    return this.rocks[this.rocks.length - 1];
  }

  // landing on top of a rock: it flings you straight up (cancelling the fall into it) and away from where you hit it,
  // plus a share of its own glide, so you clear it and have the air time to reach the next rock. A bounce within
  // CHAIN_WINDOW s of the last is a chain: more style each time.
  bounce(rk, sph, up) {
    const g = this.game, P = g.player;
    rk.bounceT = BOUNCE_CD;
    rk.hurt = true; // (it has taken to you: no BONK for sliding down its flank afterwards)
    const away = tangent(P.center.clone().sub(sph), up, new THREE.Vector3());
    if (away.lengthSq() < 1e-4) tangent(rk.vel, up, away); // (straight above its middle: the way it's gliding)
    away.normalize();
    const v = P.vel;
    const vu = v.dot(up);
    if (vu < 0) v.addScaledVector(up, -vu); // (the fall into it doesn't eat the kick...)
    const into = -tangent(v, up, new THREE.Vector3()).dot(away);
    if (into > 0) v.addScaledVector(away, into); // (...and nor does running at it)
    v.addScaledVector(up, BOUNCE_UP).addScaledVector(away, BOUNCE_AWAY).addScaledVector(tangent(rk.vel, up, new THREE.Vector3()), BOUNCE_GLIDE);
    P.body.grounded = false;
    P.body.sinceContact = 1;
    this.chain = g.time - this.lastBounce < CHAIN_WINDOW ? this.chain + 1 : 1;
    this.lastBounce = g.time;
    const n = this.chain;
    const pts = 45 + 25 * (n - 1);
    g.style(pts, null);
    g.fx.pop(`${n > 1 ? `METEOR CHAIN ×${n}` : 'METEOR BOUNCE'}!${g.missions.active ? ` +${pts}` : ''}`, null, { color: '#ff9f1c', size: 56, prio: 1 }); // (the +points only shows when they count)
    g.audio.tone(520 + 70 * Math.min(n - 1, 6), 0.25, 'square', 0.18, 2);
  }

  // the rock's spheres in world space right now
  spheres(rock) {
    const a = _a.copy(rock.axis).applyQuaternion(rock.mesh.quaternion);
    return [-1, 0, 1].map((k) => rock.pos.clone().addScaledVector(a, k * rock.reach));
  }

  syncCollider(rock) {
    const C = this.game.colliders;
    this.dropCollider(rock);
    rock.col = true;
    for (const c of this.spheres(rock)) {
      const col = C.add({ type: 'sphere', c, r: rock.minor });
      col.bouncy = true;
      rock.cols.push(col);
    }
  }

  dropCollider(rock) {
    for (const c of rock.cols) this.game.colliders.remove(c);
    rock.cols = [];
    rock.col = null;
  }

  impact(rock, i) {
    const g = this.game;
    this.dropCollider(rock);
    rock.grp.removeFromParent();
    rock.geo.dispose();
    rock.grp.traverse((o) => { if (o.isMesh && o.geometry !== rock.geo && !o.userData.isInk) o.geometry.dispose(); });
    this.rocks.splice(i, 1);
    const up = rock.gp.clone().normalize();
    const blast = rock.blast;
    const near = g.player.pos.distanceTo(rock.gp) < 1000;
    if (!near) return;
    const at = rock.gp.clone().addScaledVector(up, 1);
    g.explode(at, blast, 20 + rock.r * 2, 'meteor', 2);
    // the NPCs: whatever is under the rock is crushed, and the blast beyond it batters the rest
    g.enemies.meteorBlast(at, rock.r + 1, blast, rock.r);
    if (g.civilians) g.civilians.meteorBlast(at, rock.r + 1, blast);
    if (g.world.traffic) g.world.traffic.meteorBlast(at, rock.r + 1, blast);
    if (g.player.pos.distanceTo(rock.gp) < 250) g.cam.shake = Math.min(1.5, g.cam.shake + 0.6);
    g.fx.dust(rock.gp, new THREE.Vector3(), 18, up, 0x8a7a70);
    // the rock bursts into chunks that tumble out and bounce
    const n = 8 + Math.floor(rock.r * 1.2);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(CHUNK_GEO, this.mats[rock.kind].chunk);
      const s = rock.r * rand(0.1, 0.28);
      m.scale.setScalar(s);
      m.castShadow = true;
      ink(m, 0.06);
      const t = tangent(_a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
      m.position.copy(rock.gp).addScaledVector(up, 1 + rock.r * 0.5).addScaledVector(t, rock.r * 0.5);
      g.scene.add(m);
      this.chunks.push({ m, s, vel: up.clone().multiplyScalar(rand(7, 18)).addScaledVector(t, rand(5, 18)).addScaledVector(rock.vel, 0.25), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(), rate: rand(2, 7), life: rand(5, 8), t: 0 });
    }
    // a scorch mark (with a dying glow) that fades away
    const sc = new THREE.Mesh(new THREE.CircleGeometry(blast * 0.8, 28), new THREE.MeshBasicMaterial({ map: scorchTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    // lie on the ground's slope (not just "up"), or half of it sinks into a hillside
    const gn = new THREE.Vector3();
    g.planet.surface(rock.gp, gn);
    if (gn.lengthSq() < 0.5) gn.copy(up);
    sc.quaternion.setFromUnitVectors(_z, gn);
    sc.rotateZ(Math.random() * 6.3);
    sc.position.copy(rock.gp).addScaledVector(gn, 0.15);
    const ember = new THREE.Mesh(new THREE.CircleGeometry(blast * 0.3, 20), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    ember.position.z = 0.03;
    sc.add(ember);
    g.scene.add(sc);
    this.scorches.push({ m: sc, ember, t: 0, life: 28 });
  }

  update(dt) {
    if (dt <= 0) return;
    const g = this.game, P = g.player;
    if (!this.zone) {
      this.next -= dt;
      if (this.next <= 0) this.begin();
    } else {
      const Z = this.zone;
      Z.t += dt;
      if (Z.t > Z.dur) this.end();
      else if (arcDist(P.pos, Z.dir) < Z.r + SPAWN_NEAR) {
        // a ramp up, a heavy middle and a tail-off; a big rock every 3 s or so at the peak
        const k = Math.min(1, Z.t / 15, (Z.dur - Z.t) / 15);
        Z.spawnT -= dt * (0.18 + 0.34 * k);
        while (Z.spawnT <= 0) { Z.spawnT += 1; this.spawnRock(); }
      }
    }
    // falling rocks
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rk = this.rocks[i];
      rk.pos.addScaledVector(rk.vel, dt); // a straight glide: the warning ring is exactly where it lands
      rk.grp.position.copy(rk.pos);
      rk.mesh.rotateOnAxis(rk.spin, rk.spinRate * dt);
      if (Math.random() < dt * 40 && P.pos.distanceTo(rk.pos) < 1300) g.fx.spawn(rk.pos.clone().addScaledVector(rk.vel, -rk.r / rk.vel.length()), rk.vel.clone().multiplyScalar(-0.3), { color: Math.random() < 0.5 ? KINDS[rk.kind].trail : 0xffd23f, size: rk.r * 0.4, life: 1.3, count: 3, spread: rk.r * 0.6 });
      const dP = P.pos.distanceTo(rk.pos);
      if (dP < 250) this.syncCollider(rk);
      else if (rk.col) this.dropCollider(rk);
      // touching one: land on top of it and it flings you up and away (again and again, if you land on it again); hit it
      // from the side or below and it hurts, once
      rk.bounceT = Math.max(0, (rk.bounceT || 0) - dt);
      let hit = null, hd = Infinity;
      for (const c of this.spheres(rk)) { const d = P.center.distanceTo(c); if (d < rk.minor + 1.5 && d < hd) { hd = d; hit = c; } }
      if (hit && !P.dead) {
        const up = rk.pos.clone().normalize();
        const rel = P.center.clone().sub(rk.pos);
        if (rel.dot(up) > rk.r * 0.2) {
          if (rk.bounceT <= 0) this.bounce(rk, hit, up);
        } else if (!rk.hurt) {
          rk.hurt = true;
          g.damagePlayer(12 + rk.r * 1.5, 'meteor');
          P.vel.addScaledVector(rel.normalize(), 16);
          g.fx.pop('BONK!', null, { color: '#ff4f2e', size: 56 });
        }
      }
      if (g.planet.altitude(rk.pos) < rk.r * 0.5 || rk.pos.distanceTo(rk.gp) < rk.r) this.impact(rk, i);
    }
    // chunks tumble out and bounce, then shrink away
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.t += dt;
      const up = c.m.position.clone().normalize();
      c.vel.addScaledVector(up, -GRAV * dt);
      c.m.position.addScaledVector(c.vel, dt);
      c.m.rotateOnAxis(c.spin, c.rate * dt);
      const alt = g.planet.altitude(c.m.position);
      if (alt < c.s * 0.6) {
        c.m.position.addScaledVector(up, c.s * 0.6 - alt);
        const vn = c.vel.dot(up);
        if (vn < 0) { c.vel.addScaledVector(up, -vn * 1.4); c.vel.multiplyScalar(0.6); c.rate *= 0.6; }
      }
      const fade = Math.min(1, (c.life - c.t) / 1.5);
      c.m.scale.setScalar(c.s * Math.max(0.01, fade));
      if (c.t > c.life) { c.m.removeFromParent(); this.chunks.splice(i, 1); }
    }
    // scorch marks cool and fade
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const s = this.scorches[i];
      s.t += dt;
      s.ember.material.opacity = Math.max(0, 0.6 * (1 - s.t / 6)) * (0.8 + 0.2 * Math.sin(s.t * 9));
      s.m.material.opacity = Math.min(1, (s.life - s.t) / 8);
      if (s.t > s.life) {
        s.m.removeFromParent();
        s.m.geometry.dispose(); s.m.material.dispose();
        s.ember.geometry.dispose(); s.ember.material.dispose();
        this.scorches.splice(i, 1);
      }
    }
  }

  // for the maps: the active zone (centre direction and radius in metres), or null
  get warning() { return this.zone ? { dir: this.zone.dir, r: this.zone.r, left: this.zone.dur - this.zone.t } : null; }
}
