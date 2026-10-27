#!/usr/bin/env node
// Puts parts of the chimera kit built on their own into src/assets/chimera.glb, leaving every other part as it is. A full build of the
// kit (tools/blender/build_chimera.py) rolls every part's random details afresh (its seeds come from Python's per-run salted hash()),
// which changes the look of chimeras players already own; this rebuilds only what changed.
//
//   MOONRUNNER_REPO=. CHIMERA_PARTS=legs_mite_0,legs_sapling_2 CHIMERA_OUT=/tmp/parts.glb python3 tools/blender/build_chimera.py
//   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 meshoptimizer@1.3.0
//   node tools/splice-chimera.mjs /tmp/parts.glb ch_legs_mite_0,ch_legs_sapling_2 [--legs]
//
// Each named part (and its _far copy) is replaced whole, or with --legs only its `leg` pivots and what hangs under them (the part's own
// pieces and fitted mutations stay). The parts are compressed as tools/optimize-glb.mjs does first. The kit is decoded and written again
// with meshopt: positions and indices come back exactly, a normal can move by one step of its 8 bits.
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [parts, names, mode] = process.argv.slice(2);
if (!parts || !names) { console.log('usage: node tools/splice-chimera.mjs <parts.glb> <part,...> [--legs]'); process.exit(1); }
const need = '@gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 meshoptimizer@1.3.0';
const lib = await Promise.all(['@gltf-transform/core', '@gltf-transform/extensions', '@gltf-transform/functions', 'meshoptimizer'].map((m) => import(m)))
  .catch(() => { console.log(`needs: npm i --no-save ${need}`); process.exit(1); });
const [{ NodeIO }, { ALL_EXTENSIONS, EXTMeshoptCompression }, { mergeDocuments, prune, unpartition }, { MeshoptDecoder, MeshoptEncoder }] = lib;
const KIT = fileURLToPath(new URL('../src/assets/chimera.glb', import.meta.url));

const tmp = mkdtempSync(join(tmpdir(), 'splice-chimera-'));
try {
  // the parts, compressed the way the kit was
  const packed = join(tmp, 'parts.glb');
  const args = ['--yes', '@gltf-transform/cli@4.5.1', 'meshopt', parts, packed, '--level', 'high'], opts = { stdio: ['ignore', 'ignore', 'inherit'] };
  if (process.platform === 'win32') execSync(`npx ${args.map((a) => `"${a}"`).join(' ')}`, opts);
  else execFileSync('npx', args, opts);

  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const kit = await io.read(KIT), src = await io.read(packed);
  const before = statSync(KIT).size;
  const added = mergeDocuments(kit, src).get(src.getRoot().listScenes()[0]);
  const scene = kit.getRoot().listScenes()[0];
  const find = (s, name) => s.listChildren().find((n) => n.getName() === name);
  const drop = (n) => { for (const c of n.listChildren()) drop(c); n.dispose(); };
  for (const name of names.split(',').flatMap((p) => [p, p + '_far'])) {
    const old = find(scene, name), neu = find(added, name);
    if (!old || !neu) throw new Error(`${name}: not in ${old ? parts : 'the kit'}`);
    if (mode === '--legs') {
      const legs = (n) => n.listChildren().filter((c) => c.getExtras().role === 'leg');
      const out = legs(old), put = legs(neu);
      out.forEach(drop);
      for (const c of put) { neu.removeChild(c); old.addChild(c); }
      console.log(`${name}: ${out.length} legs out, ${put.length} in`);
    } else {
      drop(old);
      added.removeChild(neu);
      scene.addChild(neu);
      console.log(`${name}: replaced`);
    }
  }
  for (const n of added.listChildren()) drop(n);
  added.dispose();
  // (no dedup: materials that look alike are different slots, and a slot is a material's name)
  await kit.transform(prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }), unpartition());
  kit.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(KIT, kit);
  console.log(`${KIT}: ${Math.round(before / 1024)} KB -> ${Math.round(statSync(KIT).size / 1024)} KB`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
