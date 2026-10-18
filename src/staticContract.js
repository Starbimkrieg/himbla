// The rules for static GLBs (outposts.glb), shared by the game's loader/bake (staticBake.js) and the
// dev checker (tools/check-outposts.mjs) so they cannot drift apart. No imports: runs in Node too.
// The contract itself is written up for artists in docs/outpost-glb.md.

// The kinds the game builds from the GLB (when the pilot is switched on and the file has them). A kind joins this
// set once its gameplay data matches the Kit version's: tools/viewer.html?m=outpost&src=both shows whether it does.
export const GLB_KINDS = new Set(['mast', 'tower']);

export const ROLES = ['col', 'hit', 'raid', 'smoke', 'drop', 'text'];
export const SHAPES = ['box', 'cyl', 'sphere'];
export const ANIMS = ['flag', 'blink', 'spin'];

// Blender appends .001, .002... to a name that already exists: ignore that on material names.
export const stripSuffix = (name) => String(name || '').replace(/\.\d{3,}$/, '');

// What a material name means. Everything else about a material (its flat colour) comes from the file.
//   faction*       lit toon in the faction's accent colour      faction_glow*  the same, unlit
//   glow*          unlit, in the material's own colour          anything else  lit toon, own colour
//   additive*      a light beam: unlit, additive and see-through, in the material's own colour, its alpha the opacity
export function slotOf(materialName) {
  const n = stripSuffix(materialName).toLowerCase();
  if (n.startsWith('faction_glow')) return { kind: 'glow', faction: true };
  if (n.startsWith('faction')) return { kind: 'toon', faction: true };
  if (n.startsWith('glow')) return { kind: 'glow', faction: false };
  if (n.startsWith('additive')) return { kind: 'additive', faction: false };
  return { kind: 'toon', faction: false };
}

// A gameplay empty's role: the custom property `role`, else the name's prefix (col_..., hit_..., raid, ...).
// (GLTFLoader strips dots from node names, so `col.001` arrives as `col001`: a prefix may be followed by
// `_`, a digit, or nothing.)
export function roleOf(name, extras) {
  if (extras && typeof extras.role === 'string' && ROLES.includes(extras.role)) return extras.role;
  const m = /^(col|hit|raid|smoke|drop|text)(?:[_\d]|$)/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : null;
}

// The animation kind of a group node (custom property `anim`), or null.
export const animOf = (extras) => (extras && ANIMS.includes(extras.anim) ? extras.anim : null);

// The root names for a kind: the intact compound and its wreck.
export const rootName = (kind, wreck) => (wreck ? `${kind}_wreck` : kind);
