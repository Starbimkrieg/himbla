import * as THREE from 'three';
import { plate } from './props-util.js';
import { toon, glow, ink } from '../toon.js';
import { mulberry32 } from '../rng.js';
import { FX } from '../fx.js';
import { Projectiles } from '../projectiles.js';
import { Winch } from '../winch.js';
import { LightTrail, makeRunner } from '../models.js';
import { SKATES, LASERS } from '../cosmetics.js';
import { scorchTex, meteorMats } from '../meteors.js';

// 05 · WEAPONS & FX. The runner holds no weapon model (the weapons are only what they shoot), so each weapon is shown as its shot:
// the game's own Projectiles.fire builds the shot (a Projectiles stood on a scene of its own) and a small loop flies it down a test
// range to a target stake and bursts it with the game's own FX. The shots fly at about a quarter of their real speed so the eye
// can follow them (their stretch, which depends on the real speed, is the real one). Every effect here runs on a private FX
// instance that draws into the item itself, so nothing touches the game's own effects.

const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// the bare showroom base of a test range: a low plate, a muzzle block per lane at the -x end, a target stake at the +x end
function range(len, laneZ) {
  const g = new THREE.Group();
  const d = Math.max(...laneZ.map(Math.abs)) * 2 + 3;
  g.add(plate(len, d));
  const dark = toon(0x3a3550), tgt = toon(0xff9f1c);
  for (const z of laneZ) {
    const mz = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.7), dark);
    mz.position.set(-len / 2 + 0.8, 0.55, z);
    ink(mz, 0.04);
    g.add(mz);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6), tgt);
    st.position.set(len / 2 - 1, 1.2, z);
    g.add(st);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), glow(0xff2a4a));
    ball.position.set(len / 2 - 1, 2.5, z);
    g.add(ball);
  }
  return g;
}

// A loop of shots down a range. spec(lane, i) -> { vel (the REAL velocity), opts (as weapons.js passes them to Projectiles.fire),
// slow (time scale, default 0.26), boom: [radius, big] for the burst at the end (game.explode: radius * 0.7, big when radius > 10) }
function shotLoop(ctx, { len, laneZ, period, stagger, spec, y = 1.5 }) {
  const root = new THREE.Group();
  root.add(range(len, laneZ));
  const fx = new FX(root, ctx.game.camera);
  const proj = new Projectiles({ scene: root });
  const live = [];
  const next = laneZ.map((_, i) => 0.4 + i * stagger);
  const x0 = -len / 2 + 1.8, x1 = len / 2 - 1.2;
  const update = (dt, t) => {
    laneZ.forEach((z, i) => {
      if (t < next[i]) return;
      next[i] += period;
      for (const s of [].concat(spec(i, z))) {
        const vel = s.vel.clone();
        proj.fire('player', V(x0, y, z), vel, s.opts);
        const p = proj.list.pop();
        if (p.type === 'shell') fx.spawn(p.pos, vel.clone().normalize().multiplyScalar(14), { color: 0xffe08a, size: 0.8, life: 0.18, count: 5, spread: 3, drag: 4 }); // (weapons.js fireCannon's muzzle flash)
        live.push({ p, k: s.slow ?? 0.26, boom: s.boom });
      }
    });
    for (let i = live.length - 1; i >= 0; i--) {
      const { p, k, boom } = live[i];
      const sp = p.vel.length();
      const sdt = dt * k;
      if (p.gravity) p.vel.y -= p.gravity * sdt;
      p.pos.addScaledVector(p.vel, sdt);
      p.mesh.position.copy(p.pos);
      p.mesh.quaternion.setFromUnitVectors(Z, p.vel.clone().normalize());
      if (p.type === 'shell') {
        p.mesh.scale.setScalar(p.size);
        fx.spawn(p.pos, p.vel.clone().multiplyScalar(-0.04), { color: p.color, size: 0.5, life: 0.35, count: 1, spread: 0.5, drag: 2 });
        fx.spawn(p.pos, V(0, 0, 0), { color: 0x4a4560, size: 0.75, life: 0.9, count: 1, spread: 0.7, drag: 1 });
      } else p.mesh.scale.set(p.size, p.size, p.size * (1 + Math.min(4, sp / 40))); // (projectiles.js update: the comic smear)
      if (p.pos.x >= x1 || p.pos.y < 0.3) {
        fx.explosion(V(Math.min(p.pos.x, x1), Math.max(0.6, p.pos.y), p.pos.z), boom[0] * 0.7, boom[0] > 10);
        root.remove(p.mesh);
        p.mesh.material.dispose();
        live.splice(i, 1);
      }
    }
    fx.update(dt);
  };
  return { root, update };
}

const FWD = (speed, up = 0) => V(speed, up * speed, 0);

function pulseSpinner(ctx) {
  // weapons.js fireWeapon 'pulse': speed 115, splash 7, size 0.45, in the 8 laser colours of the wardrobe (cosmetics LASERS)
  return shotLoop(ctx, {
    len: 36, laneZ: LASERS.map((_, i) => (i - 3.5) * 1.7), period: 3.2, stagger: 0.28,
    spec: (i) => ({ vel: FWD(115), opts: { splash: 7, color: LASERS[i].color, size: 0.45 }, boom: [7] }),
  });
}

function scattergun(ctx) {
  // 'scatter': seven pellets a shot, 175 m/s, size 0.27, 0xffb02e, a little spread each way (weapons.js)
  const rr = mulberry32(3);
  return shotLoop(ctx, {
    len: 36, laneZ: [-3, 0, 3], period: 2.6, stagger: 0.7,
    spec: () => Array.from({ length: 7 }, () => {
      const d = FWD(1).addScaledVector(Z, (rr() - 0.5) * 0.13).addScaledVector(UP, (rr() - 0.5) * 0.08).normalize();
      return { vel: d.multiplyScalar(175), opts: { splash: 3, color: 0xffb02e, size: 0.27 }, boom: [3] };
    }),
  });
}

function railLance(ctx) {
  // 'rail': hitscan. fx.beam(muzzle, end, 0xc77dff) (additive cylinder 0.35 + white core 0.12, 0.3 s) and an explosion of radius 3 at the end
  // (the real beam runs up to 650 m; this range is 40 m)
  const root = new THREE.Group();
  const len = 40;
  root.add(range(len, [-2, 2]));
  const fx = new FX(root, ctx.game.camera);
  let next = 0.5;
  return {
    root,
    update: (dt, t) => {
      if (t >= next) {
        next += 2.2;
        const a = V(-len / 2 + 1.8, 1.5, 0), b = V(len / 2 - 1, 1.5, 0);
        fx.beam(a, b, 0xc77dff);
        fx.explosion(b, 3, false);
      }
      fx.update(dt);
    },
  };
}

function junkMortar(ctx) {
  // 'mortar': 0x7dff3a, size 0.8, gravity 20, splash 13 (the explosion is big). Lobbed (the real shot arcs ~260 m: this one is
  // lobbed higher and slower so its arc fits the range)
  return shotLoop(ctx, {
    len: 40, laneZ: [-3, 3], period: 3.4, stagger: 1.7, y: 0.9,
    spec: () => ({ vel: V(24, 17, 0), opts: { splash: 13, color: 0x7dff3a, size: 0.8, gravity: 20 }, slow: 0.9, boom: [13] }),
  });
}

function apcShell(ctx) {
  // fireCannon: type 'shell', 170 m/s, gravity 3, size 0.5, splash 9, a hot halo, a spark trail and a thin smoke line
  return shotLoop(ctx, {
    len: 36, laneZ: [0], period: 2.4, stagger: 0, y: 1.8,
    spec: () => ({ vel: FWD(170), opts: { type: 'shell', splash: 9, color: 0xff8a2a, size: 0.5, gravity: 3, life: 3.2 }, slow: 0.17, boom: [9] }),
  });
}

// ---- effects ---------------------------------------------------------------------------------------
function explosions(ctx) {
  const root = new THREE.Group();
  const fx = new FX(root, ctx.game.camera);
  const spec = [[-24, 4, false], [0, 9, true], [34, 16, true]]; // [x, radius, big]: game.explode passes radius * 0.7
  root.add(plate(84, 40));
  const next = spec.map((_, i) => 0.3 + i * 0.9);
  return {
    root,
    update: (dt, t) => {
      spec.forEach(([x, r, big], i) => { if (t >= next[i]) { next[i] += 3.2; fx.explosion(V(x, 1, 0), r, big); } });
      fx.update(dt);
    },
  };
}

function warningRings(ctx) {
  const root = new THREE.Group();
  const fx = new FX(root, ctx.game.camera);
  const spec = [[-22, 8], [0, 16], [34, 30]]; // artillery strikes and the meteors' impact marker (blast 8 + r * 1.8)
  root.add(plate(100, 66, 0x4a4660, 0.05));
  const next = spec.map((_, i) => 0.2 + i * 0.5);
  return {
    root,
    update: (dt, t) => {
      spec.forEach(([x, r], i) => { if (t >= next[i]) { next[i] += 4.5; fx.warningRing(V(x, 0, 0), r, 4); } });
      fx.update(dt);
    },
  };
}

function deflectorShield(ctx) {
  const root = new THREE.Group();
  root.add(plate(10, 10));
  // (a bare stand where the courier would be: the shield is a faceted sphere of radius 2.1 round them)
  const stand = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.1, 4, 8), toon(0xff4f2e));
  stand.position.y = 1.1;
  ink(stand, 0.04);
  root.add(stand);
  const fx = new FX(root, ctx.game.camera);
  const centre = V(0, 1.4, 0);
  let next = 0.4, n = 0;
  return {
    root,
    update: (dt, t) => {
      if (t >= next) {
        next += 1.5;
        const a = (n++ / 5) * Math.PI * 2;
        fx.shieldHit(() => centre, V(Math.cos(a) * 20, 6 + Math.sin(n) * 3, Math.sin(a) * 20));
      }
      fx.update(dt);
    },
  };
}

function phaseGhosts(ctx) {
  const root = new THREE.Group();
  root.add(plate(44, 6));
  const fx = new FX(root, ctx.game.camera);
  const m = makeRunner({});
  m.root.position.set(-18, 0, 0);
  m.root.rotation.y = Math.PI / 2; // (faces +x)
  root.add(m.root);
  let ph = -1;
  const off = V(0, 0, 0);
  return {
    root,
    update: (dt, t) => {
      const u = t % 4.5;
      if (u < 1.8) {
        if (ph !== 1) { ph = 1; fx.startGhosts(m, 1.7); } // story.js:1907, the Phase Dash: a purple afterimage every 3 m
        m.root.position.x = -18 + (u / 1.8) * 36;
      } else if (ph !== 0) { ph = 0; m.root.position.x = -18; }
      fx.update(dt);
      // (a ghost is a frozen copy of the runner's WORLD pose, drawn in the scene fx was given: here the item's own group, so
      // it is moved back by the group's offset)
      root.getWorldPosition(off).negate();
      for (const gh of fx.ghosts) gh.g.position.copy(off);
    },
  };
}

// The skate finishes' trails: a ribbon behind each foot (fx.makeTrail / updateTrail, as player.js feeds them) and the puffs
// cosmetics.js sheds, one lane per finish, a skater (a glow) running up and down it.
function skateTrails(ctx) {
  const root = new THREE.Group();
  const fx = new FX(root, ctx.game.camera);
  fx.trails = [];
  const finishes = Object.values(SKATES).filter((s) => s.trail || s === SKATES.stock);
  const lanes = finishes.map((s, i) => {
    const color = s.trail && s.trail !== 'rainbow' ? s.trail : 0x2ee6ff;
    const L = { s, z: (i - (finishes.length - 1) / 2) * 2.6, tr: [fx.makeTrail(color), fx.makeTrail(color)], ph: i * 0.37 };
    fx.trails.push(L.tr[0], L.tr[1]);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glow(s.color));
    foot.position.y = 0.3;
    root.add(foot);
    L.foot = foot;
    return L;
  });
  root.add(plate(44, finishes.length * 2.6 + 2, 0x2a2540));
  const side = V(0, 0, 1), up = UP.clone();
  const _p = V(0, 0, 0);
  return {
    root,
    update: (dt, t) => {
      lanes.forEach((L, i) => {
        const u = ((t * 0.2 + L.ph) % 1) * 2, dir = u < 1 ? 1 : -1;
        const x = (u < 1 ? u : 2 - u) * 36 - 18;
        _p.set(x, 0.25, L.z);
        L.foot.position.set(x, 0.3, L.z);
        const tc = L.s.trail === 'rainbow' ? new THREE.Color().setHSL((t * 0.4) % 1, 1, 0.6).getHex() : null;
        for (let k = 0; k < 2; k++) {
          const tmesh = L.tr[k];
          if (tc !== null) tmesh.mat.uniforms.color.value.set(tc);
          fx.updateTrail(fx.trails.indexOf(tmesh), _p.clone().addScaledVector(side, k ? 0.2 : -0.2), side, 1, up, dt);
        }
        // cosmetics.js:237 the puffs behind the skates
        if (Math.random() < dt * 60 * 0.5) fx.spawn(_p.clone().addScaledVector(V(1, 0, 0), -dir * 0.6), V(-dir * 1.5, L.s.flame ? 2.5 : 0.5, 0), { color: tc ?? (L.s.trail || 0x2ee6ff), size: L.s.flame ? 0.45 : 0.3, life: L.s.flame ? 0.45 : 0.7, count: 1, spread: 0.6 });
      });
      fx.update(dt);
    },
  };
}

// the light-bike's trail (models.js LightTrail): a glowing wall on a strip of floor behind the bike, per bike colour
function lightTrails() {
  const root = new THREE.Group();
  const cols = [0x2ec4ff, 0xff7ad9, 0xffd23f, 0x7dff3a];
  const trails = cols.map((c) => new LightTrail(root, c));
  root.add(plate(44, cols.length * 3.2 + 2, 0x2a2540));
  const heads = cols.map((c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6), glow(c)); m.position.y = 0.4; root.add(m); return m; });
  const p = V(0, 0.15, 0);
  return {
    root,
    update: (dt, t) => {
      trails.forEach((tr, i) => {
        const u = (((t * 0.22 + i * 0.2) % 1) * 2), x = (u < 1 ? u : 2 - u) * 36 - 18, z = (i - 1.5) * 3.2;
        p.set(x, 0.15, z);
        heads[i].position.set(x, 0.4, z);
        tr.update(dt, p, UP);
      });
    },
  };
}

// Combat text, dust and sparks (fx.js pop / dust / spawn): a dust puff, a spark burst and a comic word, in turn
function particlesAndPops(ctx) {
  const root = new THREE.Group();
  root.add(plate(24, 12));
  const fx = new FX(root, ctx.game.camera);
  const words = ['BLAM!', 'ZAKK!', 'FWOOM!', 'BONK!', 'WHAM!', 'ZZAP!'];
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 3.5, 0);
  root.add(anchor);
  let nd = 0.3, ns = 0.9, np = 0.6, w = 0;
  const wp = V(0, 0, 0);
  return {
    root,
    update: (dt, t) => {
      if (t >= nd) { nd += 1.1; fx.dust(V(-7, 0.2, 0), V(4, 0, 1), 8, UP); }
      if (t >= ns) { ns += 1.6; fx.spawn(V(7, 1, 0), UP.clone().multiplyScalar(5), { color: 0xffd23f, size: 0.25, life: 0.8, gravity: 1.62, count: 18, spread: 9 }); }
      if (t >= np) { np += 1.5; anchor.getWorldPosition(wp); fx.pop(words[w++ % words.length], wp, { color: '#ff4f2e', size: 56, life: 1 }); }
      fx.update(dt);
    },
    dispose: () => fx.clearPops(),
  };
}

// The winch line (winch.js drawRope): the real verlet rope, from a hand to a hook, sagging when it is slack
function winchRope() {
  const root = new THREE.Group();
  root.add(plate(40, 8));
  const w = new Winch({ scene: root });
  const post = (x) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 3, 6), toon(0x3a3550)); m.position.set(x, 1.5, 0); root.add(m); };
  post(-17);
  const target = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2), toon(0xffd23f));
  target.position.set(17, 0.8, 0);
  ink(target, 0.05);
  root.add(target);
  const a = V(-17, 3, 0), b = V(17, 1.7, 0);
  return {
    root,
    update: (dt) => { w.drawRope(dt, a, b, 40); }, // (a 40 m line over a 34 m gap: it sags)
  };
}

// A meteor strike's scar (meteors.js impact): the scorch decal with its dying ember, and the chunks the rock burst into
function meteorImpact() {
  const root = new THREE.Group();
  const r = 10, blast = 8 + r * 1.8;
  const sc = new THREE.Mesh(new THREE.CircleGeometry(blast * 0.8, 28), new THREE.MeshBasicMaterial({ map: scorchTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  sc.rotation.x = -Math.PI / 2;
  sc.rotation.z = 1.1;
  sc.position.y = 0.15;
  const ember = new THREE.Mesh(new THREE.CircleGeometry(blast * 0.3, 20), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  ember.position.z = 0.03;
  sc.add(ember);
  root.add(sc);
  const M = meteorMats('stony');
  const geo = new THREE.DodecahedronGeometry(1, 0), rr = mulberry32(8);
  const n = 8 + Math.floor(r * 1.2);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(geo, M.chunk);
    const s = r * (0.1 + rr() * 0.18);
    m.scale.setScalar(s);
    ink(m, 0.06);
    const a = rr() * Math.PI * 2, d = 4 + rr() * blast * 0.7;
    m.position.set(Math.cos(a) * d, s * 0.6, Math.sin(a) * d);
    m.rotation.set(rr() * 6, rr() * 6, rr() * 6);
    root.add(m);
  }
  return { root, update: (dt, t) => { const u = t % 8; ember.material.opacity = Math.max(0, 0.6 * (1 - u / 6)) * (0.8 + 0.2 * Math.sin(u * 9)); } };
}

export default {
  id: 'props.weapons',
  title: '05 · WEAPONS & FX',
  items: [
    { id: 'weapon.pulse-spinner', label: 'PULSE SPINNER (8 COLOURS)', w: 36, d: 15, solid: false, make: pulseSpinner },
    { id: 'weapon.scattergun', label: 'VOSTOK SCATTERGUN', w: 36, d: 9, solid: false, make: scattergun },
    { id: 'weapon.rail-lance', label: 'DAEDALUS RAIL LANCE', w: 40, d: 7, solid: false, make: railLance },
    { id: 'weapon.junk-mortar', label: 'RUSTMOON JUNK MORTAR', w: 40, d: 9, solid: false, make: junkMortar },
    { id: 'weapon.apc-shell', label: 'BTR-M CANNON SHELL', w: 36, d: 3, solid: false, make: apcShell },
    { id: 'fx.explosion', label: 'EXPLOSIONS', w: 84, d: 40, solid: false, make: explosions },
    { id: 'fx.warning-ring', label: 'STRIKE WARNING RINGS', w: 100, d: 66, solid: false, make: warningRings },
    { id: 'fx.deflector-shield', label: 'DEFLECTOR SHIELD', w: 10, d: 10, solid: false, make: deflectorShield },
    { id: 'fx.phase-ghosts', label: 'PHASE DASH GHOSTS', w: 44, d: 6, solid: false, make: phaseGhosts },
    { id: 'fx.skate-trails', label: 'SKATE TRAILS', w: 44, d: 30, solid: false, make: skateTrails },
    { id: 'fx.light-trail', label: 'LIGHT-BIKE TRAILS', w: 44, d: 15, solid: false, make: lightTrails },
    { id: 'fx.particles-pops', label: 'DUST · SPARKS · COMIC WORDS', w: 24, d: 12, solid: false, make: particlesAndPops },
    { id: 'fx.winch-rope', label: 'WINCH ROPE', w: 40, d: 8, solid: false, make: winchRope },
    { id: 'fx.meteor-impact', label: 'METEOR SCORCH & DEBRIS', w: 56, d: 56, solid: false, make: meteorImpact },
  ],
};
