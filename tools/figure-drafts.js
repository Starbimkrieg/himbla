// Townsfolk drafts side by side (dev only; src/figureDrafts.js). In the running game with the Asset Row open (its flat floor):
//   const { lineUp } = await import('/tools/figure-drafts.js'); const L = lineUp(game, x, z, { walk: true });
// Rows from the back: the current makeFigure, draft A, draft B, each the nine looks and three aliens on the same seeds, then a row
// of each draft's random townsfolk. `walk` walks them on the spot, the stride held on twos (twos.js heldPhase).
import * as THREE from 'three';
import { makeFigure } from '../src/models.js';
import { makeFigureDraft, figureWalk } from '../src/figureDrafts.js';
import { heldPhase } from '../src/twos.js';

const LOOKS = ['coveralls', 'lab', 'engineer', 'trader', 'elder', 'eva', 'casual', 'kid', 'trooper'];
const ALIENS = ['vrill', 'crest', 'orb'];

export function lineUp(game, x0, z0, { walk = false, step = 1.3, rowGap = 3.2, rows = ['cur', 'a', 'b'], crowd = 10 } = {}) {
  const root = new THREE.Group();
  const figs = [], groups = {};
  let cur = null;
  const put = (f, x, z) => { f.root.position.set(x, 0, z); cur.add(f.root); figs.push(f); };
  const row = (name) => { cur = groups[name] = new THREE.Group(); root.add(cur); };
  rows.forEach((d, r) => {
    row(d);
    const z = z0 - r * rowGap;
    LOOKS.forEach((look, i) => {
      const o = { look, seed: 7 + i * 5, ...(look === 'kid' ? { kind: 'kid', scale: 0.62 } : {}) };
      put(d === 'cur' ? makeFigure(o) : makeFigureDraft(d, o), x0 + i * step, z);
    });
    [0, 1, 2].forEach((k) => {
      const o = { alien: true, seed: 40 + k, species: ALIENS[k] };
      put(d === 'cur' ? makeFigure(o) : makeFigureDraft(d, o), x0 + (LOOKS.length + k) * step, z);
    });
  });
  // random townsfolk, the drafts' variety (builds, paints, hair, aliens)
  ['a', 'b'].filter((d) => rows.includes(d)).forEach((d, r) => {
    row(`crowd-${d}`);
    for (let i = 0; i < crowd; i++) put(makeFigureDraft(d, { seed: 100 + i * 13 }), x0 + i * step, z0 - (rows.length + r) * rowGap);
  });
  game.scene.add(root);
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (const [n, f] of figs.entries()) {
      f.phase = (f.phase || n * 0.7) + dt * 6;
      const ph = heldPhase(f, f.phase, dt);
      if (f.shinL) figureWalk(f, ph);
      else { f.legL.rotation.x = Math.sin(ph) * 0.6; f.legR.rotation.x = -Math.sin(ph) * 0.6; f.armL.rotation.x = -Math.sin(ph) * f.swing; f.armR.rotation.x = Math.sin(ph) * f.swing; }
    }
  };
  if (walk) game.onFrame = ((prev) => (dt) => { if (prev) prev(dt); update(dt); })(game.onFrame);
  // show only these rows (names: cur, a, b, crowd-a, crowd-b), each moved to the front row's place
  const only = (...names) => { for (const [n, g] of Object.entries(groups)) { g.visible = names.includes(n); g.position.z = 0; } names.forEach((n) => { const g = groups[n]; const z = g.children[0].position.z; g.position.z = z0 - z; }); };
  return { root, figs, groups, only, update, pose: (ph) => { for (const f of figs) { f.twosPh = undefined; if (f.shinL) figureWalk(f, ph, ph === 0 ? 0 : 1); else { f.legL.rotation.x = Math.sin(ph) * 0.6; f.legR.rotation.x = -Math.sin(ph) * 0.6; f.armL.rotation.x = -Math.sin(ph) * f.swing; f.armR.rotation.x = Math.sin(ph) * f.swing; } } }, // (ph 0: standing)
    tris: () => figs.map((f) => [f.look, Math.round(f.body.geometry.index.count / 3)]) };
}
