// Dev-only: builds eight chimeras with the game's own makeChimera and saves each as a GLB (outline shells and far LODs left out) for
// the Antimatter Lab drafts' renders (tools/blender/preview_zbornak_lab.py stands them in the cryo pods, on the robots' bench and in
// the corrals). Not in the build. About 2.3 MB in all, so they are not kept in the repo.
//   npx vite --port 5199 --host 127.0.0.1      (in one shell)
//   node tools/zbornak-chimeras.mjs            -> $ZB_CHIMERAS (default /tmp/zb-chimeras)/c0.glb .. c7.glb
import { writeFileSync, mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const OUT = process.env.ZB_CHIMERAS || '/tmp/zb-chimeras';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await pg.goto(process.env.GAME_URL || 'http://127.0.0.1:5199/', { waitUntil: 'load' });
await pg.waitForFunction('window.game && window.game.state === "title"', null, { timeout: 180000 });
const out = await pg.evaluate(async () => {
  const { makeChimera } = await import('/src/chimera.js');
  const { chimeraBuilder } = await import('/src/chimerabuild.js');
  await chimeraBuilder();
  const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const { PALETTE } = await import('/src/chimera.js');
  const list = [
    { seed: 3, body: 'mite', legs: 'car', head: 'person', extraHead: null, mods: ['crystal'], size: 1, tint: PALETTE.mite[0] },
    { seed: 5, body: 'sapling', legs: 'mite', head: 'mite', extraHead: null, mods: [], size: 1, tint: PALETTE.sapling[0] },
    { seed: 8, body: 'car', legs: 'mite', head: 'alien', extraHead: null, mods: ['spark'], size: 1, tint: PALETTE.car[0] },
    { seed: 11, body: 'person', legs: 'sapling', head: 'car', extraHead: null, mods: [], size: 1, tint: PALETTE.person[0] },
    { seed: 13, body: 'junkbot', legs: 'mite', head: 'sapling', extraHead: 'mite', mods: ['void'], size: 1, tint: PALETTE.junkbot[0] },
    { seed: 17, body: 'alien', legs: 'car', head: 'mite', extraHead: null, mods: ['armor'], size: 1, tint: PALETTE.alien[0] },
    { seed: 19, body: 'mite', legs: 'mite', head: 'pirate', extraHead: null, mods: ['radio'], size: 1, tint: PALETTE.mite[1] || PALETTE.mite[0] },
    { seed: 23, body: 'pirate', legs: 'car', head: 'sapling', extraHead: null, mods: ['turbo'], size: 1, tint: PALETTE.pirate[0] },
  ];
  const res = [];
  for (const g of list) {
    const c = makeChimera(g);
    c.anim && c.anim(0.3, 0);
    const root = c.root;
    root.updateMatrixWorld(true);
    // strip LOD far levels and ink shells
    const kill = [];
    root.traverse((o) => {
      if (o.isLOD) { for (let i = 1; i < o.levels.length; i++) kill.push(o.levels[i].object); }
      if (o.isMesh) {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.side === 1 || m.colorWrite === false || (m.name || '').includes('ink') || (o.name || '').includes('ink')) kill.push(o);
      }
    });
    for (const o of kill) o.parent && o.parent.remove(o);
    const ab = await new GLTFExporter().parseAsync(root, { binary: true });
    const u8 = new Uint8Array(ab); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    res.push({ name: `${g.body}-${g.legs}-${g.head}`, h: c.height, b64: btoa(s), killed: kill.length });
  }
  return res;
});
out.forEach((r, i) => { writeFileSync(`${OUT}/c${i}.glb`, Buffer.from(r.b64, 'base64')); console.log(i, r.name, r.h, r.killed); });
console.log(errs.slice(0, 5).join('\n') || 'no page errors');
await b.close();
