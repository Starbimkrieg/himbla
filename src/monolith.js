import * as THREE from 'three';
import { makeRunner } from './models.js';
import { tangent } from './geo.js';
import { pick } from './rng.js';

// What the Monolith does when you touch it: one of three spells, never the same one twice running.
//   LOW-G        gravity drops to under half for 30 s
//   TIME DILATION   20 s with the world at 40 % speed (pirates, their shots, traffic, meteors);
//                you, and your own shots, keep full speed
//   ECHO DECOYS  30 s with three holograms of you skating alongside; anyone shooting at you picks
//                one of you at random, and a hologram shatters when it's hit
export const DILATE_RATE = 0.4;
const ECHOES = 3;

export function monolithTouch(alch) {
  const g = alch.game;
  const kind = pick(['lowg', 'dilate', 'echo'].filter((k) => k !== alch.lastMono));
  alch.lastMono = kind;
  g.audio.tone(55, 2.5, 'sine', 0.35, 1);
  g.fx.pop('THE MONOLITH HUMS…', null, { color: '#c77dff', size: 56 });
  if (kind === 'lowg') {
    alch.buffs.lowGrav = 30;
    g.hud.toast('Gravity feels… optional. (Low gravity for 30 s)', 4);
  } else if (kind === 'dilate') {
    alch.buffs.dilate = 20;
    g.audio.tone(600, 1.6, 'sine', 0.2, 0.15);
    g.hud.toast('Everything else just… slowed down. (Time dilation for 20 s)', 4);
  } else {
    alch.buffs.echo = 30;
    spawnEchoes(g);
    g.audio.tone(900, 0.8, 'triangle', 0.15, 1.6);
    g.hud.toast('There are four of you now. Pirates can\'t tell which is real. (Echo decoys for 30 s)', 4);
  }
}

// ---------- echo decoys ----------

function holoMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending });
}

function spawnEchoes(g) {
  clearEchoes(g);
  const P = g.player;
  for (let i = 0; i < ECHOES; i++) {
    const m = makeRunner();
    const mat = holoMaterial();
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      // the ink shells would turn into a solid cyan blob: holograms go without them
      if (o.material && o.material.side === THREE.BackSide) { o.visible = false; return; }
      o.material = mat;
      o.castShadow = false;
    });
    g.scene.add(m.root);
    // spread round you: left, right and behind, each with its own sway
    const ang = (i / ECHOES) * Math.PI * 2 + Math.PI / 2;
    g.decoys.push({
      model: m, mat, ang, dist: 11 + Math.random() * 4, phase: Math.random() * 6.28, lag: 2.5 + Math.random() * 2,
      pos: P.pos.clone(), center: P.center.clone(), vel: P.vel.clone(), radius: 1.2, dead: false, decoy: true,
    });
    g.fx.spawn(P.center.clone(), new THREE.Vector3(), { color: 0x7df9ff, size: 0.4, life: 0.6, count: 10, spread: 3 });
  }
}

export function clearEchoes(g) {
  for (const d of g.decoys) { d.dead = true; d.model.root.removeFromParent(); d.mat.dispose(); }
  g.decoys.length = 0;
}

export function shatterEcho(g, d) {
  if (d.dead) return;
  d.dead = true;
  d.model.root.removeFromParent();
  d.mat.dispose();
  g.decoys.splice(g.decoys.indexOf(d), 1);
  g.fx.spawn(d.center.clone(), new THREE.Vector3(), { color: 0x7df9ff, size: 0.35, life: 0.7, count: 18, spread: 5 });
  g.fx.pop('GLITCH!', d.center.clone(), { color: '#7df9ff', size: 36, life: 0.7 });
  g.audio.tone(1800, 0.25, 'square', 0.08, 0.2);
}

// The holograms trail you loosely, copying your pose.
export function updateEchoes(alch, dt) {
  const g = alch.game, P = g.player;
  if (!g.decoys.length) return;
  if (alch.buffs.echo <= 0 || P.dead) { for (const d of g.decoys.slice()) shatterEcho(g, d); return; }
  const up = P.up;
  const fwd = tangent(P.heading.clone(), up).normalize();
  const side = new THREE.Vector3().crossVectors(up, fwd);
  const pm = P.model;
  for (const d of g.decoys) {
    d.phase += dt;
    const a = d.ang + Math.sin(d.phase * 0.7) * 0.35;
    const r = d.dist + Math.sin(d.phase * 1.3) * 1.5;
    const want = g.planet.ground(P.pos.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(fwd, Math.sin(a) * r * 0.8));
    // keep hopping height when you're airborne
    want.addScaledVector(up, Math.max(0, g.planet.altitude(P.pos)));
    const prev = d.pos.clone();
    d.pos.lerp(want, Math.min(1, dt * d.lag));
    d.vel.copy(d.pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
    d.center.copy(d.pos).addScaledVector(up, 1.2);
    const m = d.model;
    m.root.position.copy(d.pos);
    m.root.quaternion.copy(pm.root.quaternion);
    for (const k of ['legL', 'legR', 'armL', 'armR']) if (m[k] && pm[k]) m[k].rotation.copy(pm[k].rotation);
    if (m.body && pm.body) m.body.position.y = pm.body.position.y;
    d.mat.opacity = 0.32 + 0.12 * Math.sin(d.phase * 9) + (alch.buffs.echo < 3 && Math.sin(d.phase * 30) > 0 ? -0.25 : 0);
  }
}
