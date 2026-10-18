import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseStaticGlb } from './staticBake.js';
import { rootName, GLB_KINDS } from './staticContract.js';

// Outposts authored in Blender (src/assets/outposts.glb, built by tools/blender/build_outposts.py; contract in
// docs/outpost-glb.md). A PILOT: off unless asked for, and only for the kinds listed in GLB_KINDS
// (src/staticContract.js).
//
//   switch on:   ?outpostGlb in the URL (?outpostGlb=0 / =false / =off switches it off again, and the URL beats
//                the saved setting), or localStorage['mr-outpost-glb'] = '1'
//   fall back:   a missing or unreadable file, kind or wreck, a root with nothing to draw, or a bake that throws,
//                quietly gives the Kit-built outpost (outpostModels.js). Unlike the ship GLBs a failed load can never
//                stop the game starting, even if the file is not in the checkout (the import is a glob, not a path);
//                a request that hangs does hold it up, as there is no timeout
//   cost:        the file is a separate chunk, fetched only when switched on
//
// To make it the default: drop the `outpostGlbOn()` test below, and import the GLB statically if the extra
// request matters (the desktop build runs from file://, which is why the other GLBs are inlined).
export { GLB_KINDS };

let ASSETS = null; // Map(root name -> parsed asset), null until loaded

export function outpostGlbOn() {
  try {
    const v = new URLSearchParams(location.search).get('outpostGlb');
    if (v !== null) return !['0', 'false', 'off', 'no'].includes(v.toLowerCase());
    return localStorage.getItem('mr-outpost-glb') === '1';
  } catch { return false; }
}

// (a glob, so the build still works if the file isn't there: no match, no chunk, and a load that fails softly)
const FILES = import.meta.glob('./assets/outposts.glb', { query: '?inline', import: 'default' });

// Resolves true when the GLB is loaded. Never rejects. `force` loads it even when switched off (the viewer).
export async function loadOutpostParts({ force = false } = {}) {
  if (ASSETS) return true;
  if (!force && !outpostGlbOn()) return false;
  try {
    const load = FILES['./assets/outposts.glb'];
    if (!load) throw new Error('src/assets/outposts.glb is not there');
    const gltf = await new GLTFLoader().loadAsync(await load());
    const assets = parseStaticGlb(gltf.scene, { warn: (m) => console.warn('[outposts.glb]', m) });
    for (const [name, a] of [...assets]) if (a.empty) { console.warn(`[outposts.glb] ${name}: nothing to draw, left out`); assets.delete(name); }
    for (const kind of GLB_KINDS) {
      if (!assets.has(rootName(kind, false))) { // (a kind is the Kit's or the file's, wreck and all)
        console.warn(`[outposts.glb] no "${kind}": using the Kit-built one`);
        assets.delete(rootName(kind, true));
        continue;
      }
      if (!assets.has(rootName(kind, true))) console.warn(`[outposts.glb] no "${kind}_wreck": its wreck stays Kit-built`);
    }
    ASSETS = assets;
  } catch (e) {
    console.warn('outposts.glb unavailable, using the Kit-built outposts', e);
  }
  return !!ASSETS;
}

// The parsed asset for a kind (or its wreck), or null: not loaded, not in the file, or (unless `any`, for the
// viewer) not a GLB kind.
export function outpostAsset(kind, wreck, any = false) {
  if (!ASSETS || !(any || GLB_KINDS.has(kind))) return null;
  return ASSETS.get(rootName(kind, wreck)) || null;
}
