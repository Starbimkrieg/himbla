import * as THREE from 'three';
import { toon, glow, ink } from '../toon.js';
import { FACTIONS } from '../locations.js';

// Helpers the catalogue groups share (index.js says what an item is).

// a faction's colour as a hex number (locations.js FACTIONS has CSS strings)
export const factionHex = (f) => new THREE.Color(FACTIONS[f].color).getHex();

// The Kit marks moving parts in userData (spin / blink / flag, or a `tick` function); the game animates them from the
// owner (territory.js for outposts, world.js for settlements). Same for the row: stepMover moves one, animate() returns
// the item's update(dt, t) for all of them under root.
export function stepMover(o, dt, t, seed) {
  const u = o.userData;
  if (u.tick) u.tick(o, dt, t);
  else if (u.spin) o.rotation.y += dt * (u.spin === true ? 0.6 : u.spin);
  else if (u.blink) o.visible = Math.sin(t * 4 + seed) > -0.3;
  else if (u.flag) o.rotation.y = Math.sin(t * 2 + seed) * 0.25;
}
export function animate(root, seed = 3) {
  const movers = [];
  root.traverse((o) => { const u = o.userData; if (u.spin || u.blink || u.flag || u.tick) movers.push(o); });
  if (!movers.length) return undefined;
  return (dt, t) => { for (const o of movers) stepMover(o, dt, t, seed); };
}

// Several update functions as one (undefined ones skipped)
export function together(...fns) {
  const list = fns.filter(Boolean);
  return list.length ? (dt, t) => { for (const f of list) f(dt, t); } : undefined;
}

// Variants side by side as ONE item: `parts` = [{ root, w }] (w: width along the row, m). Returns { root, w, d },
// centred on the origin with feet on y = 0, ready for make().
export function lineUp(parts, gap = 2) {
  const root = new THREE.Group();
  const total = parts.reduce((s, p) => s + p.w, 0) + gap * (parts.length - 1);
  let x = -total / 2;
  for (const p of parts) {
    p.root.position.x += x + p.w / 2;
    root.add(p.root);
    x += p.w + gap;
  }
  return { root, w: total, d: Math.max(...parts.map((p) => p.d || 0), 0) };
}

// See-through additive light (columns, rings)
export const beamMat = (color, opacity, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, ...extra });

// A faction leader's podium (story.js buildLeaders): plinth, glowing ring and soft light column, added to g in that order
export function podium(g, color) {
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.4, 16), toon(color));
  ink(pod, 0.05);
  pod.position.y = 0.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 40), glow(color));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 40, 20, 1, true).translate(0, 20, 0), beamMat(color, 0.16, { side: THREE.DoubleSide }));
  g.add(pod, ring, beam);
  return { ring, beam };
}
