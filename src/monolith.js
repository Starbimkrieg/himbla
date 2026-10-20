import * as THREE from 'three';
import { makeRunner } from './models.js';
import { tangent, randomTangent, arcDist, greatCircle } from './geo.js';
import { pick, clamp01 } from './rng.js';

// Touching the Monolith casts one of three spells, never the same twice running.
//   TIME DILATION    20 s of the world at 40 % speed (pirates, shots, traffic, meteors); you and your shots stay full speed
//   ECHO FOLLOWERS   one or two holograms shadow your moves (mid-air jumps too) for up to ten minutes or until one takes
//                 a shot for you; shooters pick one of you at random
//   TELEPORT         a random flat, safe spot; launched at 0 km/h one time in four, else 1-300 km/h
export const DILATE_RATE = 0.4;
const ECHO_SECS = 600; // ten minutes
const ECHO_DELAY = [0.3, 0.62]; // s behind you per follower, retracing your path
const ECHO_SIDE = [-2.4, 2.4]; // m to the side, so they don't stand in you
const ECHO_KEEP = 2.5; // s of path kept
const TELE_STILL = 0.25; // share of teleports arriving at rest
const TELE_KMH = 300; // fastest launch (others 1 to this)
const TELE_CUSHION = 8; // s of SOFT LANDING after a launch (else a 300 km/h arrival on foot is a wipe-out)

export function monolithTouch(alch) {
  const g = alch.game;
  const kind = pick(['dilate', 'echo', 'teleport'].filter((k) => k !== alch.lastMono));
  alch.lastMono = kind;
  g.audio.tone(55, 2.5, 'sine', 0.35, 1);
  g.fx.pop('THE MONOLITH HUMS…', null, { color: '#c77dff', size: 56 });
  if (kind === 'dilate') {
    alch.buffs.dilate = 20;
    g.audio.tone(600, 1.6, 'sine', 0.2, 0.15);
    g.hud.toast('Everything else just… slowed down. (Time dilation for 20 s)', 4);
  } else if (kind === 'echo') {
    const n = spawnEchoes(g);
    alch.buffs.echo = ECHO_SECS;
    g.audio.tone(900, 0.8, 'triangle', 0.15, 1.6);
    g.hud.toast(`${n === 1 ? 'Another you is on your tail' : 'Two more of you are on your tail'}. Pirates can't tell which is real. (Echo ${n === 1 ? 'follower' : 'followers'}: until ${n === 1 ? 'it takes' : 'they take'} a shot, or ten minutes)`, 5);
  } else {
    monolithTeleport(g);
  }
}

// ---------- teleport ----------

// A random safe landing direction: clear of settlements, plateaus, black lakes, roads, camps and outposts, on level
// ground, and a real trip away. Null if none found.
function pickTeleportSpot(g, tries = 400) {
  const P = g.player, planet = g.planet;
  const from = P.pos.clone().normalize();
  const n = new THREE.Vector3(), tmp = new THREE.Vector3();
  for (let i = 0; i < tries; i++) {
    const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    const dir = new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a));
    if (arcDist(dir, from) < 800) continue;
    if (!planet.spotFree(dir)) continue;
    if (g.locations.some((l) => arcDist(dir, l.dir) < Math.max(l.zoneR || 0, l.r * 1.9) + 150)) continue;
    if (g.territory && g.territory.outposts.some((o) => !o.gone && arcDist(dir, o.dir) < 200)) continue;
    // level: ground here and on rings 14 m and 24 m out faces up at about the same height
    const c = planet.ground(dir);
    const hc = c.length();
    const t = tangent(new THREE.Vector3(0.3, 0.9, 0.2), dir).normalize();
    let level = true;
    for (let k = 0; k < 9 && level; k++) {
      const p = k === 0 ? c : planet.ground(greatCircle(dir, t.clone().applyAxisAngle(dir, ((k - 1) % 4) * Math.PI / 2), k <= 4 ? 14 : 24, tmp));
      planet.surface(p, n);
      if (n.lengthSq() > 0.5 && n.dot(p.clone().normalize()) < 0.95) level = false;
      if (Math.abs(p.length() - hc) > 2.5) level = false;
    }
    if (level) return dir;
  }
  return null;
}

// Teleport: random safe spot and heading, and a launch (`kmh` overrides the roll, for tests).
// Health and fuel are kept (respawn would refill them).
export function monolithTeleport(g, kmh = null) {
  const P = g.player;
  const dir = pickTeleportSpot(g);
  if (!dir) { g.hud.toast('The Monolith hums, and for a moment you almost went somewhere. (Nowhere safe to land)', 4); return null; }
  if (P.vehicle) g.garage.exit();
  const from = P.pos.clone();
  g.fx.explosion(from.clone().addScaledVector(from.clone().normalize(), 1.5), 4, false); // where you were
  const hp = P.health, en = P.body.energy;
  g.planet.update(g.planet.ground(dir), { budgetMs: 1e9 });
  const pos = g.planet.ground(dir, new THREE.Vector3(), 1.5);
  const fwd = randomTangent(dir);
  P.respawn(pos, fwd);
  P.health = hp; P.body.energy = en;
  g.cam.fwd.copy(fwd);
  const speed = kmh ?? (Math.random() < TELE_STILL ? 0 : 1 + Math.random() * (TELE_KMH - 1)); // km/h
  P.body.vel.copy(fwd).multiplyScalar(speed / 3.6);
  if (speed > 0.5) g.alchemy.buffs.cushion = Math.max(g.alchemy.buffs.cushion, TELE_CUSHION); // no wipe-out on a launch on foot
  g.updateCamera(0.016, true);
  g.fx.explosion(pos, 4, false);
  g.fx.pop('*VWORP*', null, { color: '#c77dff', size: 56 });
  g.audio.tone(200, 0.5, 'sine', 0.25, 4);
  const km = (arcDist(pos, from) / 1000).toFixed(1);
  g.hud.toast(speed < 0.5 ? `The Monolith put you down ${km} km away, at rest.` : `The Monolith threw you ${km} km, and you landed running at ${Math.round(speed)} km/h.`, 5);
  return { dir, kmh: speed };
}

// ---------- echo followers ----------

// A runner model as an echo hologram (the Asset Row's too): one translucent cyan material, ink shells hidden (they'd make a
// solid cyan blob). Returns the material.
export function holoRunner(m) {
  // alpha blending: additive would burn out to white over the pale ground
  const mat = new THREE.MeshBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: 0.5, depthWrite: false });
  m.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material && o.material.side === THREE.BackSide) { o.visible = false; return; }
    o.material = mat;
    o.castShadow = false;
  });
  return mat;
}

// One or two holograms (returns the count), each retracing your path a moment late, to one side.
function spawnEchoes(g) {
  clearEchoes(g);
  const P = g.player;
  const n = Math.random() < 0.5 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const m = makeRunner(), mat = holoRunner(m);
    g.scene.add(m.root);
    // first on your left, second further back on your right
    g.decoys.push({
      model: m, mat, delay: ECHO_DELAY[i], lat: ECHO_SIDE[i], phase: Math.random() * 6.28,
      pos: P.pos.clone(), center: P.center.clone(), vel: P.vel.clone(), radius: 1.2, dead: false, decoy: true,
    });
    g.fx.spawn(P.center.clone(), new THREE.Vector3(), { color: 0x7df9ff, size: 0.4, life: 0.6, count: 10, spread: 3 });
  }
  g.echoTrack = { t: 0, samples: [] };
  return n;
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
  if (!g.decoys.length && g.alchemy) g.alchemy.buffs.echo = 0; // last one gone: spell spent
  g.fx.spawn(d.center.clone(), new THREE.Vector3(), { color: 0x7df9ff, size: 0.35, life: 0.7, count: 18, spread: 5 });
  g.fx.pop('GLITCH!', d.center.clone(), { color: '#7df9ff', size: 36, life: 0.7 });
  g.audio.tone(1800, 0.25, 'square', 0.08, 0.2);
}

// Followers retrace your path `delay` s late, a couple of metres aside, taking every bump and jump as you did. Each sits
// at your height above ground, over the ground at its own spot. A path jump (teleport) is followed at once, not streaked.
export function updateEchoes(alch, dt) {
  const g = alch.game, P = g.player;
  if (!g.decoys.length) { if (g.echoTrack) g.echoTrack.samples.length = 0; return; }
  if (alch.buffs.echo <= 0 || P.dead) { for (const d of g.decoys.slice()) shatterEcho(g, d); return; }
  const tr = g.echoTrack || (g.echoTrack = { t: 0, samples: [] });
  tr.t += dt;
  const S = tr.samples;
  const pm = P.model;
  const last = S[S.length - 1];
  if (last && last.pos.distanceTo(P.pos) > 40) S.length = 0; // teleport or recall: restart the path
  S.push({
    t: tr.t, pos: P.pos.clone(), quat: pm.root.quaternion.clone(), alt: Math.max(0, g.planet.altitude(P.pos)),
    bodyY: pm.body ? pm.body.position.y : 0, limbs: ['legL', 'legR', 'armL', 'armR'].map((k) => (pm[k] ? pm[k].rotation.clone() : null)),
  });
  while (S.length > 2 && S[0].t < tr.t - ECHO_KEEP) S.shift();
  const up = P.up;
  const tmpQ = new THREE.Quaternion(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), want = new THREE.Vector3();
  for (const d of g.decoys) {
    d.phase += dt;
    // samples either side of "delay ago"
    const tt = tr.t - d.delay;
    let k = S.length - 1;
    while (k > 0 && S[k - 1].t >= tt) k--;
    const a = S[Math.max(0, k - 1)], b = S[k];
    const f = b.t > a.t ? clamp01((tt - a.t) / (b.t - a.t)) : 1;
    const pos = a.pos.clone().lerp(b.pos, f);
    tmpQ.copy(a.quat).slerp(b.quat, f);
    const dirUp = pos.clone().normalize();
    fwd.set(0, 0, 1).applyQuaternion(tmpQ);
    fwd.addScaledVector(dirUp, -fwd.dot(dirUp)).normalize();
    side.crossVectors(dirUp, fwd);
    const alt = a.alt + (b.alt - a.alt) * f;
    // its own ground, at your altitude
    g.planet.ground(pos.addScaledVector(side, d.lat), want, alt);
    const prev = d.pos.clone();
    d.pos.copy(want);
    d.vel.copy(d.pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
    d.center.copy(d.pos).addScaledVector(up, 1.2);
    const m = d.model;
    m.root.position.copy(d.pos);
    m.root.quaternion.copy(tmpQ);
    for (let i = 0; i < 4; i++) {
      const key = ['legL', 'legR', 'armL', 'armR'][i], la = a.limbs[i], lb = b.limbs[i];
      if (m[key] && la && lb) { m[key].rotation.x = la.x + (lb.x - la.x) * f; m[key].rotation.y = la.y + (lb.y - la.y) * f; m[key].rotation.z = la.z + (lb.z - la.z) * f; }
    }
    if (m.body) m.body.position.y = a.bodyY + (b.bodyY - a.bodyY) * f;
    // faint flicker (fast in the last 3 s); fade near the camera (they trail between it and you)
    const near = clamp01((g.camera.position.distanceTo(d.pos) - 2.5) / 4.5);
    d.mat.opacity = Math.max(0, 0.46 + 0.1 * Math.sin(d.phase * 9) + (alch.buffs.echo < 3 && Math.sin(d.phase * 30) > 0 ? -0.3 : 0)) * near;
  }
}
