import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { parseStaticGlb } from './staticBake.js';
import { rootName, GLB_KINDS } from './staticContract.js';

// Blender-built outposts (src/assets/outposts.glb from tools/blender/build_outposts.py; contract in docs/outpost-glb.md), for
// the kinds in GLB_KINDS (src/staticContract.js); the rest, and any kind the file lacks or that fails to bake, are code-built
// (outpostDrafts.js).
//
//   on by default; ?outpostGlb=0 (or false, off, no; the URL beats the saved setting) or localStorage['mr-outpost-glb'] = '0'
//                gives the code-built ones
//   fall back:   a missing/unreadable file, kind or wreck, an empty root, or a throwing bake quietly gives the code-built
//                outpost. A failed load never stops the game starting, even with no file in the checkout (glob import); a
//                hanging request does hold it up (no timeout)
//   cost:        a separate chunk, fetched while the game starts
export { GLB_KINDS };

let ASSETS = null; // Map(root name -> parsed asset), null until loaded

function outpostGlbOn() {
  try {
    const v = new URLSearchParams(location.search).get('outpostGlb');
    if (v !== null) return !['0', 'false', 'off', 'no'].includes(v.toLowerCase());
    return localStorage.getItem('mr-outpost-glb') !== '0';
  } catch { return true; }
}

// a glob, so the build works without the file (no match, no chunk, a soft load failure)
const FILES = import.meta.glob('./assets/outposts.glb', { query: '?inline', import: 'default' });

// Resolves true when the GLB is loaded. Never rejects. `force` loads it even when switched off (the viewer).
export async function loadOutpostParts({ force = false } = {}) {
  if (ASSETS) return true;
  if (!force && !outpostGlbOn()) return false;
  try {
    const load = FILES['./assets/outposts.glb'];
    if (!load) throw new Error('src/assets/outposts.glb is not there');
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(await load()); // (compressed: tools/optimize-glb.mjs)
    const assets = parseStaticGlb(gltf.scene, { warn: (m) => console.warn('[outposts.glb]', m) });
    for (const [name, a] of [...assets]) if (a.empty) { console.warn(`[outposts.glb] ${name}: nothing to draw, left out`); assets.delete(name); }
    for (const kind of GLB_KINDS) {
      if (!assets.has(rootName(kind, false))) { // a kind is all Kit or all file, wreck included
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

// The parsed asset for a kind (or its wreck), or null if not loaded, not in the file, or not a GLB kind (unless
// `any`, for the viewer).
export function outpostAsset(kind, wreck, any = false) {
  if (!ASSETS || !(any || GLB_KINDS.has(kind))) return null;
  return ASSETS.get(rootName(kind, wreck)) || null;
}
