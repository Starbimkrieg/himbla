#!/usr/bin/env node
// Compresses the game's model files: the vertex data is quantized (16-bit positions, 8-bit normals) and meshopt-coded
// with glTF-Transform, which takes a file to about a quarter of its size (a third to a half of it gzipped). The game
// decodes them in src/models.js (loadGlb), and reads a plain file just as well, so this step is optional: a model
// re-exported from Blender is simply bigger until it is run through here again.
//
//   npm run optimize:glb                 the models the world is built from at boot
//   node tools/optimize-glb.mjs a.glb b.glb
//
// A file that is already compressed is left alone. Not run on runner.glb (the player: the one model whose outline
// follows the stored normals closely) or outposts.glb (checked by tools/check-outposts.mjs, and loaded only on request).
// glTF-Transform comes through npx at a pinned version, so nothing is added to package.json.
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = '@gltf-transform/cli@4.5.1';
const ASSETS = fileURLToPath(new URL('../src/assets/', import.meta.url));
const DEFAULT = ['ships', 'skimmer', 'lightbike_a', 'lightbike_b', 'skimmer_a', 'skimmer_b', 'warrig', 'rover', 'interceptor', 'apc', 'landtrain', 'crane', 'gantry', 'garage', 'slots', 'casino', 'blackjack', 'claw', 'duck', 'dish', 'engine', 'briefcase', 'hovercar', 'plinko', 'hall', 'lot', 'downs-stand', 'downs-club', 'downs-course', 'downs-stalls', 'downs-arcade', 'downs-screen', 'downs-fair', 'downs-stable', 'downs-crowd'].map((n) => `${ASSETS}${n}.glb`);
const files = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT;

const extensionsOf = (file) => {
  const b = readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'glTF') throw new Error(`${file} is not a .glb`);
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12))).extensionsUsed || [];
};
const kb = (n) => `${Math.round(n / 1024)} KB`;

const tmp = mkdtempSync(join(tmpdir(), 'optimize-glb-'));
try {
  for (const file of files) {
    if (extensionsOf(file).includes('EXT_meshopt_compression')) { console.log(`${file}: already compressed`); continue; }
    const out = join(tmp, 'out.glb');
    const args = ['--yes', CLI, 'meshopt', file, out, '--level', 'high'], opts = { stdio: ['ignore', 'ignore', 'inherit'] };
    // (npx is a .cmd on Windows, which Node runs only through a shell)
    if (process.platform === 'win32') execSync(`npx ${args.map((a) => `"${a}"`).join(' ')}`, opts);
    else execFileSync('npx', args, opts);
    const before = statSync(file).size, after = statSync(out).size;
    if (after >= before) { console.log(`${file}: no smaller (${kb(before)}), left alone`); continue; }
    writeFileSync(file, readFileSync(out));
    console.log(`${file}: ${kb(before)} -> ${kb(after)}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
