import * as THREE from 'three';
import { makeKadeTruck, makeCrate } from './models.js';
import { makeBody } from './physics.js';
import { stepRover } from './enemies.js';
import { tangent, frameQuat, greatCircle } from './geo.js';
import { pick } from './rng.js';
import { shatterEcho } from './monolith.js';

// Captain Kade rides a mad-max monster truck now. He never rams: he skirts around
// you at 45-80 m, swapping direction now and then, glued to the ground, while his gunner works a
// turret with two modes:
//   GATLING  on the ground: fast bursts of small rounds
//   FLAK     once you're well off the ground: shells that burst around you in mid-air; a burst
//            stings a little and nudges you (bleeds your speed and pulls you down), it doesn't
//            blast you clear - hard to escape upward, but not impossible
// Wreck the truck and Kade bails out on foot (the showdown in SPACECOM's story: he's caught), and
// the first time he drops his Rustmoon Junk Mortar.

const ORBIT = [45, 80];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();

export function spawnKadeTruck(story, final) {
  const g = story.game, P = g.player;
  // roll in from out of sight, ahead of you
  const base = tangent(g.cam.fwd.clone(), P.up).normalize();
  const pos = g.planet.ground(greatCircle(P.pos.clone().normalize(), base.applyAxisAngle(P.up, (Math.random() - 0.5) * 1.2), 230), new THREE.Vector3(), 0.3);
  const m = makeKadeTruck();
  m.root.scale.setScalar(1.25); // (a boss: bigger than anything else on the road)
  g.scene.add(m.root);
  const hp = final ? 1500 : 1100;
  const up = pos.clone().normalize();
  const e = {
    kind: 'kade', faction: 'pirate', model: m, hp, maxHp: hp, body: makeBody(pos), radius: 7.5, center: pos.clone(), dead: false, impacts: [],
    heading: tangent(P.pos.clone().sub(pos), up).normalize(), final, rogue: false, aggro: true, carrying: false, grab: 0, home: null,
    bossName: 'CAPTAIN KADE', state: 'chase', circle: Math.random() < 0.5 ? 1 : -1, circleT: 5, mode: 'gatling', gunCd: 1.5, burst: 0, flakCd: 1, t: 0,
  };
  g.enemies.list.push(e);
  return e;
}

export function updateKadeTruck(story, e, dt) {
  const g = story.game, P = g.player, b = e.body, m = e.model;
  e.t += dt;
  const up = _a.copy(b.pos).normalize();
  const toP = tangent(P.pos.clone().sub(b.pos), up);
  const d = toP.length();
  toP.normalize();
  // --- driving: circle you at range, never ram ---
  e.circleT -= dt;
  if (e.circleT <= 0) { e.circle *= -1; e.circleT = 4 + Math.random() * 4; }
  const side = new THREE.Vector3().crossVectors(up, toP).multiplyScalar(e.circle);
  const want = (ORBIT[0] + ORBIT[1]) / 2;
  let aim, max = 38;
  if (d > 160) { aim = toP.clone(); max = 44; } // catching up
  else if (d < 25) aim = toP.clone().negate().add(side); // too close: peel away
  else aim = side.clone().addScaledVector(toP, THREE.MathUtils.clamp((d - want) / want, -0.8, 0.8) * 1.6);
  stepRover(e, dt, g.planet, g.colliders, aim, max, { engine: 26, grip: 30, turn: 2.4, radius: 5.5, stick: Infinity });
  // --- pose ---
  m.root.position.copy(b.pos);
  m.root.quaternion.slerp(frameQuat(b.groundN, e.heading, new THREE.Quaternion()), Math.min(1, dt * 6));
  const sp = b.vel.length();
  for (const w of m.wheels) w.rotation.x += (sp * dt) / 2.1;
  m.chassis.position.y = Math.sin(e.t * 9) * 0.06 * Math.min(1, sp / 20);
  m.flag.rotation.y = Math.sin(e.t * 5) * 0.4;
  e.center.copy(b.pos).addScaledVector(up, 4.4);
  // --- the turret: track you, pick a mode by how high you are ---
  m.root.updateMatrixWorld(true);
  const alt = P.dead ? 0 : g.planet.altitude(P.pos);
  e.mode = e.mode === 'flak' ? (alt < 5 ? 'gatling' : 'flak') : (alt > 7 ? 'flak' : 'gatling');
  const T = g.enemies.victim(e) || P; // his gunner can be fooled by the Monolith's echo holograms
  const target = T.center.clone().addScaledVector(T.vel, Math.min(1.2, T.center.distanceTo(e.center) / 160));
  const local = m.turret.parent.worldToLocal(target.clone()).sub(m.turret.position);
  m.turret.rotation.y += Math.atan2(Math.sin(Math.atan2(local.x, local.z) - m.turret.rotation.y), Math.cos(Math.atan2(local.x, local.z) - m.turret.rotation.y)) * Math.min(1, dt * 5);
  const elev = Math.atan2(local.y - 1.6, Math.hypot(local.x, local.z));
  m.pitch.rotation.x = -THREE.MathUtils.clamp(elev, -0.3, 1.2);
  const lock = story.lockEl;
  const seen = !P.dead && g.planet.visible(e.center.clone().addScaledVector(up, 2), P.center) && d < 260;
  if (e.mode === 'flak' && seen) { lock.classList.remove('hidden'); lock.textContent = '⚠ FLAK! GET LOW ⚠'; } else lock.classList.add('hidden');
  if (seen) {
    if (e.mode === 'gatling') fireGatling(g, e, dt, T);
    else fireFlak(g, e, dt, T);
  }
  // he gives up the chase if you get right away (except in the showdown)
  if (!e.final && P.pos.distanceTo(b.pos) > 1500) { despawn(story, e); story.kade.nextAt = g.time + 300; }
}

function fireGatling(g, e, dt, T) {
  const m = e.model;
  // bursts: 2.2 s of fire, ~1.2 s to cool
  e.gunCd -= dt;
  if (e.burst <= 0 && e.gunCd <= 0) { e.burst = 2.2; e.gunCd = 3.4; }
  if (e.burst <= 0) return;
  e.burst -= dt;
  m.gatSpin.rotation.z += dt * 35;
  e.gatT = (e.gatT || 0) - dt;
  if (e.gatT > 0) return;
  e.gatT = 1 / 12;
  const from = m.gatMuzzle.getWorldPosition(new THREE.Vector3());
  const dir = g.enemies.aimLead(from, 175, 0.035, T.center, T.vel);
  g.projectiles.fire('kade', from, dir.multiplyScalar(175), { damage: 3.5, splash: 1.2, color: 0xffb347, size: 0.22, knock: 0.15, life: 2 });
  if (Math.random() < 0.5) g.audio.tone(320 + Math.random() * 80, 0.04, 'square', 0.05);
}

function fireFlak(g, e, dt, T) {
  const m = e.model;
  e.flakCd -= dt;
  if (e.flakCd > 0) return;
  e.flakCd = 0.6;
  const from = m.flakMuzzle.getWorldPosition(new THREE.Vector3());
  const speed = 210;
  // aim at where you'll be (the lead solved over a few passes, so a fast runner is properly led),
  // and set the fuse to burst there, or as soon as it's close to you
  let t = T.center.distanceTo(from) / speed;
  for (let i = 0; i < 3; i++) t = T.center.clone().addScaledVector(T.vel, t).distanceTo(from) / speed;
  const at = T.center.clone().addScaledVector(T.vel, t).add(_c.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3));
  const dir = at.clone().sub(from).normalize();
  g.projectiles.fire('kade', from, dir.multiplyScalar(speed), { color: 0xff4f2e, size: 0.6, life: t + 0.4, fuse: t, proxy: 7, burst: (pos) => flakBurst(g, pos) });
  g.audio.tone(90, 0.25, 'sawtooth', 0.2, 0.5);
}

// A flak burst: a black puff and some fragments. Close enough and it stings and nudges you: you
// lose some speed and get pulled down, but you aren't thrown clear.
function flakBurst(g, pos) {
  const P = g.player;
  g.fx.explosion(pos, 3.5, false);
  g.fx.spawn(pos, new THREE.Vector3(), { color: 0x2a2433, size: 1.6, life: 1.2, count: 6, spread: 3 });
  // white phosphorus: burning fragments that rain down trailing smoke and hang about a moment
  g.fx.phosphor(pos, 10);
  g.audio.burst(0.35, 900, 0.35);
  for (const d of g.decoys.slice()) if (pos.distanceTo(d.center) < 6) shatterEcho(g, d);
  if (P.dead) return;
  const dist = pos.distanceTo(P.center);
  if (dist > 11) return;
  const f = 1 - dist / 11;
  g.damagePlayer(4 + 12 * f, 'kade');
  const up = _b.copy(P.pos).normalize();
  const vUp = P.vel.dot(up);
  P.vel.addScaledVector(up, -vUp).multiplyScalar(1 - 0.18 * f).addScaledVector(up, vUp - 3.5 * f);
  P.vel.add(_c.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.5 * f));
  g.cam.shake = Math.max(g.cam.shake, 0.3 * f);
  if (Math.random() < 0.4) g.fx.pop('FLAK!', pos.clone(), { color: '#ff9f1c', size: 34, life: 0.6 });
}

export function despawn(story, e) {
  e.dead = true;
  e.model.root.removeFromParent();
  story.lockEl.classList.add('hidden');
}

// The truck's been wrecked (enemies.kill already blew it up).
export function kadeDefeated(story, e) {
  const g = story.game;
  story.lockEl.classList.add('hidden');
  const up = e.center.clone().normalize();
  if (e.final) {
    story.kade.captured = true;
    g.hud.alert('CAPTAIN KADE IS IN CUFFS!', '#ffd23f', 4);
  } else {
    g.fx.pop(pick(['"MY TRUCK!"', '"THIS AIN\'T OVER, RUNNER!"', '"YOU\'LL PAY FOR THE PAINT JOB!"']), e.center.clone().addScaledVector(up, 6), { color: '#ff2a3a', size: 44, life: 2.2 });
    story.kade.beaten++;
    story.kade.nextAt = g.time + 900;
  }
  g.addCredits(800, 'Kade bounty');
  g.style(150, 'GUN TRUCK DOWN');
  g.rep.add('spacecom', 4, 'Wrecked Captain Kade\'s gun truck');
  // the first time, his Junk Mortar tumbles out of the wreck
  if (!g.upgrades.mortar && !story.mortarDrop) {
    const crate = makeCrate(0x7dff3a, 1.6);
    const p = g.planet.ground(e.center.clone(), new THREE.Vector3(), 1.2);
    crate.position.copy(p);
    frameQuat(p.clone().normalize(), new THREE.Vector3(1, 0, 0), crate.quaternion);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dff3a, transparent: true, opacity: 0.35, depthWrite: false }));
    beam.position.y = 60;
    crate.add(beam);
    g.scene.add(crate);
    story.mortarDrop = { mesh: crate, pos: p };
    g.fx.pop('JUNK MORTAR DROPPED!', p.clone().addScaledVector(p.clone().normalize(), 6), { color: '#7dff3a', size: 48 });
  }
  story.save();
}

// Pick up the dropped Junk Mortar by skating over it (called every frame from Story.update).
export function updateMortarDrop(story) {
  const g = story.game, D = story.mortarDrop;
  if (!D) return;
  D.mesh.rotateY(0.02);
  if (g.player.dead || g.player.pos.distanceTo(D.pos) > 5) return;
  g.scene.remove(D.mesh);
  story.mortarDrop = null;
  g.upgrades.mortar = 1;
  g.hud.alert('RUSTMOON JUNK MORTAR ACQUIRED (KEY 4)', '#7dff3a', 4);
  g.audio.pickup();
  g.save();
}
