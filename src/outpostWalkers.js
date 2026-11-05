import { makeFigure, figureWalk, figureStand } from './townsfolk.js';
import { makeChimera } from './chimerabuild.js';
import { mulberry32 } from './rng.js';

// The two or three people (or junk bots) walking about a small outpost (src/outpostDrafts.js sets `walkers` on the template:
// { kind: 'person' | 'junkbot', look: makeFigure opts in the owner's colours, routes: [[[x, z], ...], ...] }, one route of ground
// points per walker in the outpost's frame, walked there and back, laid through open yard so nobody walks through a wall). They are made per
// placed outpost (skinned figures don't survive a template's clone), live under its root and go with it; the game steps them
// while the outpost is near (territory.js), the viewer and the Asset Row the same way.
const SPEED = { person: 1.3, junkbot: 0.9 };
const F = 0.3; // apron top

export function spawnWalkers(root, spec, seed = 1) {
  if (!spec || !spec.routes || !spec.routes.length) return null;
  const rr = mulberry32(seed * 7 + 13);
  const list = spec.routes.map((route, i) => {
    let model, anim = null, fig = null;
    if (spec.kind === 'junkbot') {
      const c = makeChimera({ seed: seed + i * 31, body: 'junkbot', legs: 'junkbot', head: 'junkbot', extraHead: null, mods: [], size: 0.9 + rr() * 0.25, tint: [0xffb347, 0x8a8698, 0x7dd87a, 0xd9482b][i % 4] });
      model = c.root; anim = c.anim;
    } else {
      fig = makeFigure({ ...spec.look, seed: seed * 13 + i * 101 });
      model = fig.root;
    }
    model.userData.walker = true;
    root.add(model);
    const start = Math.floor(rr() * route.length);
    model.position.set(route[start][0], F, route[start][1]);
    return { model, fig, anim, route, next: start < route.length - 1 ? start + 1 : start - 1, dir: start < route.length - 1 ? 1 : -1, wait: rr() * 2, phase: rr() * 6, t: 0, speed: SPEED[spec.kind] || 1.3 };
  });
  const update = (dt) => {
    for (const w of list) {
      w.t += dt;
      const p = w.model.position;
      if (w.wait > 0) {
        w.wait -= dt;
        if (w.fig) figureStand(w.fig); else if (w.anim) w.anim(w.t, 0);
        continue;
      }
      const [tx, tz] = w.route[w.next], dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.2) {
        if (w.next + w.dir < 0 || w.next + w.dir >= w.route.length) { w.dir = -w.dir; w.wait = 2 + Math.random() * 3; } // (the end: turn back)
        else if (w.next % 2 === 0) w.wait = 0.5 + Math.random() * 2; // (a look round at every other point)
        w.next += w.dir;
        continue;
      }
      const step = Math.min(d, w.speed * dt);
      p.x += (dx / d) * step; p.z += (dz / d) * step;
      // turn toward the way ahead (not snapping round)
      const want = Math.atan2(dx, dz);
      let dy = want - w.model.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      w.model.rotation.y += Math.max(-dt * 4, Math.min(dt * 4, dy));
      w.phase += dt * 6 * (w.speed / 1.4);
      if (w.fig) { figureWalk(w.fig, w.phase); p.y = F + Math.abs(Math.sin(w.phase)) * 0.06; }
      else if (w.anim) w.anim(w.t, w.speed);
    }
  };
  return { list, update };
}
