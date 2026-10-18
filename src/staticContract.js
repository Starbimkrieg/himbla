// Rules for static GLBs (outposts.glb), shared by the loader/bake (staticBake.js) and tools/check-outposts.mjs so they
// can't drift. No imports: runs in Node too. Artist-facing contract: docs/outpost-glb.md.

// Kinds built from the GLB (pilot on and the file has them). A kind joins once its gameplay data matches the Kit
// version's; tools/viewer.html?m=outpost&src=both compares them.
export const GLB_KINDS = new Set(['mast', 'tower']);

export const ROLES = ['col', 'hit', 'raid', 'smoke', 'drop', 'text'];
export const SHAPES = ['box', 'cyl', 'sphere'];
export const ANIMS = ['flag', 'blink', 'spin'];

// Blender appends .001, .002... to duplicate names: ignore it on materials.
export const stripSuffix = (name) => String(name || '').replace(/\.\d{3,}$/, '');

// Material name prefixes (the flat colour comes from the file):
//   faction*       lit toon, faction accent colour      faction_glow*  same, unlit
//   glow*          unlit, own colour                    anything else  lit toon, own colour
//   additive*      light beam: unlit, additive, see-through, own colour, alpha = opacity
export function slotOf(materialName) {
  const n = stripSuffix(materialName).toLowerCase();
  if (n.startsWith('faction_glow')) return { kind: 'glow', faction: true };
  if (n.startsWith('faction')) return { kind: 'toon', faction: true };
  if (n.startsWith('glow')) return { kind: 'glow', faction: false };
  if (n.startsWith('additive')) return { kind: 'additive', faction: false };
  return { kind: 'toon', faction: false };
}

// A gameplay empty's role: custom property `role`, else the name prefix (col_..., hit_..., raid, ...).
// GLTFLoader strips dots (`col.001` arrives as `col001`), so a prefix may be followed by `_`, a digit, or nothing.
export function roleOf(name, extras) {
  if (extras && typeof extras.role === 'string' && ROLES.includes(extras.role)) return extras.role;
  const m = /^(col|hit|raid|smoke|drop|text)(?:[_\d]|$)/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : null;
}

// A group node's animation kind (custom property `anim`), or null.
export const animOf = (extras) => (extras && ANIMS.includes(extras.anim) ? extras.anim : null);

// Root names for a kind: intact and wreck.
export const rootName = (kind, wreck) => (wreck ? `${kind}_wreck` : kind);
