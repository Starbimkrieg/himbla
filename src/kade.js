import * as THREE from 'three';
import { makeKadeTruck } from './models.js';
import { makeBody } from './physics.js';
import { stepRover, beaconCrate } from './enemies.js';
import { tangent, frameQuat, greatCircle } from './geo.js';
import { pick } from './rng.js';
import { fireFlak as flakShot } from './flak.js';

// Captain Kade's monster truck. Never rams: circles you at 45-80 m, swapping direction now and then, while his gunner's
// turret has two modes:
//   GATLING  you on the ground: fast bursts of small rounds
//   FLAK     you well off the ground: mid-air bursts that sting, bleed speed and pull you down (hard to escape upward)
// Wreck it and Kade bails out on foot (caught, in SPACECOM's showdown); the first time he drops his Rustmoon Junk Mortar.

const ORBIT = [45, 80];
const _a = new THREE.Vector3();

export function spawnKadeTruck(story, final) {
  const g = story.game, P = g.player;
  // roll in from out of sight, ahead of you
  const base = tangent(g.cam.fwd.clone(), P.up).normalize();
  const pos = g.planet.ground(greatCircle(P.pos.clone().normalize(), base.applyAxisAngle(P.up, (Math.random() - 0.5) * 1.2), 230), new THREE.Vector3(), 0.3);
  const m = makeKadeTruck();
  m.root.scale.setScalar(1.25); // (boss size)
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
  // --- turret: track you, mode by your altitude ---
  m.root.updateMatrixWorld(true);
  const alt = P.dead ? 0 : g.planet.altitude(P.pos);
  e.mode = e.mode === 'flak' ? (alt < 5 ? 'gatling' : 'flak') : (alt > 7 ? 'flak' : 'gatling');
  const T = g.enemies.victim(e) || P; // (Monolith echo holograms fool him)
  const target = T.center.clone().addScaledVector(T.vel, Math.min(1.2, T.center.distanceTo(e.center) / 160));
  const local = m.turret.parent.worldToLocal(target.clone()).sub(m.turret.position);
  const turn = Math.atan2(local.x, local.z) - m.turret.rotation.y;
  m.turret.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 5);
  const elev = Math.atan2(local.y - 1.6, Math.hypot(local.x, local.z));
  m.pitch.rotation.x = -THREE.MathUtils.clamp(elev, -0.3, 1.2);
  const lock = story.lockEl;
  const seen = !P.dead && g.planet.visible(e.center.clone().addScaledVector(up, 2), P.center) && d < 260;
  if (e.mode === 'flak' && seen) { lock.classList.remove('hidden'); lock.textContent = '⚠ FLAK! GET LOW ⚠'; } else lock.classList.add('hidden');
  if (seen) {
    if (e.mode === 'gatling') fireGatling(g, e, dt, T);
    else fireFlak(g, e, dt, T);
  }
  // gives up past 1.5 km (not in the showdown)
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
  // lead solved over a few passes; fuse bursts there, or as soon as it's close to you (flak.js)
  flakShot(g, 'kade', from, T.center, T.vel, { speed: 210 });
  g.audio.tone(90, 0.25, 'sawtooth', 0.2, 0.5);
}

function despawn(story, e) {
  e.dead = true;
  e.model.root.removeFromParent();
  story.lockEl.classList.add('hidden');
}

// Truck wrecked (enemies.kill already blew it up).
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
    story.kade.nextAt = g.time + 300;
  }
  g.addCredits(800, 'Kade bounty');
  g.style(150, 'GUN TRUCK DOWN');
  g.rep.add('spacecom', 4, 'Wrecked Captain Kade\'s gun truck');
  // first time: the Junk Mortar drops from the wreck
  if (!g.upgrades.mortar && !story.mortarDrop) {
    const { crate, p } = beaconCrate(g, e.center, 0x7dff3a, 1.6, 0x7dff3a);
    story.mortarDrop = { mesh: crate, pos: p };
    g.fx.pop('JUNK MORTAR DROPPED!', p.clone().addScaledVector(p.clone().normalize(), 6), { color: '#7dff3a', size: 48 });
  }
  story.save();
}

// Skate over the dropped Junk Mortar to take it (every frame, from Story.update).
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
