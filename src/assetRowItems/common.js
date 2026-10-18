import * as THREE from 'three';

// Helpers the catalogue groups share (index.js says what an item is).

// The Kit marks moving parts in userData (spin / blink / flag, or a `tick` function); the game animates them from the
// owner (territory.js for outposts, world.js for settlements). Same for the row. Returns the item's update(dt, t).
export function animate(root, seed = 3) {
  const movers = [];
  root.traverse((o) => { const u = o.userData; if (u.spin || u.blink || u.flag || u.tick) movers.push(o); });
  if (!movers.length) return undefined;
  return (dt, t) => {
    for (const o of movers) {
      const u = o.userData;
      if (u.tick) u.tick(o, dt, t);
      else if (u.spin) o.rotation.y += dt * (u.spin === true ? 0.6 : u.spin);
      else if (u.blink) o.visible = Math.sin(t * 4 + seed) > -0.3;
      else if (u.flag) o.rotation.y = Math.sin(t * 2 + seed) * 0.25;
    }
  };
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
