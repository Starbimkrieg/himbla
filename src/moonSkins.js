import { SUN } from './geo.js';
import { R } from './terrainField.js';
import { DEV_TOOLS } from './devtools.js';

// EXPERIMENT: three candidate surface treatments for the Moon's ground, all drawn in the terrain
// fragment shader from world position alone (no texture files, nothing baked into the chunks), and
// all fading out by the size of a pixel so that distant ground keeps the classic painted look.
//   0  current   the vertex-painted Moon, untouched
//   1  regolith  fine grain, pebbles and micro-craters, lit by bump-mapping the toon ramp
//   2  etching   pen hatching that thickens with shadow, pebbles with a drop shadow, inked in the post pass's colours
//   3  survey    a hypsometric chart: altitude bands, glowing contour lines, a world grid with crossing marks
// Pick one with ?moonskin=N or, in the console, game.planet.holeU.uSkin.value = N (planet.js; dev builds only).

export const SKIN_COUNT = 4;

// One set of uniforms for the whole game: the terrain material and the rock materials (patchRockMaterial) hold the same
// objects, so one switch (or one quality setting) moves them all.
const q = DEV_TOOLS && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('moonskin') : null; // (a dev switch: a release build always draws the classic ground)
const SKIN_U = {
  uSkin: { value: q ? Math.max(0, Math.min(SKIN_COUNT - 1, +q || 0)) : 0 },
  uSunW: { value: SUN.clone() },
  uSkinLit: { value: 0.6 }, // (how bright full sun is, against the unlit colour: what etching's "shade" is measured from)
  uSkinBump: { value: 1.5 }, // (regolith: how far its relief tips the lit normal)
  uSkinShade: { value: 0.8 }, // (regolith: how strongly the sun's side of the relief is lit and the far side shaded in the paint)
  // regolith's quality, set by the Ground detail setting (settings.js): 2 everything, 1 without the chips, the 0.3-0.7 m craters
  // and the finest grain, 0 as well without the cobbles, the 0.9-2.3 m craters and the fine grain (the rocks' grain follows the same cuts)
  uSkinQ: { value: 2 },
};
export function skinUniforms() { return SKIN_U; }
// true when the address asked for a look (?moonskin=N): then the Settings toggle leaves the look alone until it is first used
export const SKIN_FROM_URL = q !== null;

// The value noise the terrain shader carries (planet.js), for the rocks' shaders.
const SK_NOISE = /* glsl */`
float rimHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rimNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rimHash(i), rimHash(i + vec3(1, 0, 0)), f.x), mix(rimHash(i + vec3(0, 1, 0)), rimHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rimHash(i + vec3(0, 0, 1)), rimHash(i + vec3(1, 0, 1)), f.x), mix(rimHash(i + vec3(0, 1, 1)), rimHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

// Shared helpers (these sit after rimHash/rimNoise in the fragment shader's common block).
export const SKIN_COMMON = /* glsl */`
uniform float uSkin, uSkinLit, uSkinBump, uSkinShade, uSkinQ; uniform vec3 uSunW;

// an octave of wavelength lam (m) fades out as a pixel (px m) grows towards it
float skFade(float lam, float px) { return 1.0 - smoothstep(0.2 * lam, 0.6 * lam, px); }

// the ground as a flat plane under the cube face it sits on (so a line set doesn't stretch with the slope)
vec2 skUV(vec3 P) {
  vec3 a = abs(normalize(P));
  if (a.x >= a.y && a.x >= a.z) return P.zy;
  if (a.y >= a.z) return P.xz;
  return P.xy;
}

// 3D scatter of round features, one per cell, radius rmin..rmax cells (at most 0.25): the vector from the nearest
// feature's centre to p in units of its radius, and a random id. The ground cuts through the spheres, so the
// features come out as discs of every size. skScatterR also skews the sizes towards the small end (size = id^power:
// a power law, many small and few large) and leaves a share of the cells empty (keep: the share that has a feature).
// (three random numbers from one hash: this runs eight times a pixel, for each scale of stone and crater)
vec3 skHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
vec4 skScatterR(vec3 p, float cell, float rmin, float rmax, float seed, float power, float keep) {
  vec3 q = p / cell;
  vec3 b = floor(q - 0.5);
  vec4 best = vec4(9.0, 0.0, 0.0, 0.0);
  float bd = 9.0;
  for (int k = 0; k < 8; k++) {
    float fk = float(k);
    vec3 c = b + vec3(mod(fk, 2.0), mod(floor(fk * 0.5), 2.0), floor(fk * 0.25));
    vec3 h = skHash3(c + seed);           // where in its cell
    vec3 h2 = skHash3(c * 0.7 + 11.9 + seed); // x its size, y whether it is there at all
    float id = power == 1.0 ? h2.x : pow(h2.x, power);
    float rad = mix(rmin, rmax, id) * (h2.y < keep ? 1.0 : 1e-4);
    vec3 d = (q - (c + 0.5 + (h - 0.5) * 0.5)) / rad;
    float dl = length(d);
    if (dl < bd) { bd = dl; best = vec4(d, id); }
  }
  return best;
}
vec4 skScatter(vec3 p, float cell, float rmin, float rmax, float seed) { return skScatterR(p, cell, rmin, rmax, seed, 1.0, 1.0); }

// Pen lines on every whole number of v, hw their half width in spacings: the share of the pixel's footprint
// the line covers (so a line thinner than a pixel is a faint one, not a full one). Lines closer than a couple of
// pixels give way to their average ink instead of shimmering.
float skHatch(float v, float hw) {
  float aa = max(fwidth(v), 1e-4);
  float d = abs(fract(v + 0.5) - 0.5);
  float cov = max(min(d + 0.5 * aa, hw) - max(d - 0.5 * aa, -hw), 0.0) / aa;
  return mix(min(cov, 1.0), min(2.0 * hw, 1.0), smoothstep(0.3, 0.75, aa));
}

// The same pen lines at a spacing that keeps them about 7 px apart on screen at any distance: spacings double with
// distance (the two nearest are blended), so a hatch stays strokes of a pen rather than dust. c is in metres.
float skHatchM(float c, float sp, float hw, float px) {
  float lev = max(log2(px * 7.0 / sp), 0.0);
  float l0 = floor(lev), f = lev - l0;
  float s0 = sp * exp2(l0);
  return mix(skHatch(c / s0, hw), skHatch(c / (s0 * 2.0), hw), f);
}

// a line w pixels wide on every whole number of v, gone once the lines are under ~3 px apart
float skLine(float v, float w) {
  float aa = fwidth(v);
  float d = abs(fract(v + 0.5) - 0.5);
  return (1.0 - smoothstep(0.0, 1.0, d / (aa * w + 1e-6))) * (1.0 - smoothstep(0.22, 0.45, aa));
}
// the distance to a whole number, in pixels
float skLinePx(float v) { return abs(fract(v + 0.5) - 0.5) / (fwidth(v) * 1.1 + 1e-6); }

// ---- 1 regolith ----
// A pebble scale: domes, each darker or lighter than the dust round it, with a dark contact ring at its foot.
// (The relief fades out earlier than the paint, at about 5 pixels across rather than 2: it is lit from the difference
// between neighbouring pixels, which turns to blocks when a bump is only a few pixels wide.)
void skPebbles(vec3 p, float px, float cell, float rmin, float rmax, float seed, float keep, float hk, float tlo, float thi, inout float h, inout float lum) {
  float f = skFade(cell * 0.14, px);
  if (f <= 0.0) return;
  vec4 s = skScatterR(p, cell, rmin, rmax, seed, 1.5, keep);
  float d2 = dot(s.xyz, s.xyz), dl = sqrt(d2);
  float dome = max(1.0 - d2, 0.0);
  h += dome * dome * mix(rmin, rmax, s.w) * cell * hk * skFade(cell * 0.07, px);
  float body = 1.0 - smoothstep(0.82, 1.0, dl);
  // (a shadow thrown onto the dust away from the sun, and a faint contact line all round)
  vec3 sunT = normalize(uSunW - normalize(p) * dot(uSunW, normalize(p)));
  float shadow = (1.0 - smoothstep(0.6, 1.1, length(s.xyz + sunT * 0.95))) * (1.0 - body);
  float foot = smoothstep(0.92, 1.02, dl) * (1.0 - smoothstep(1.02, 1.25, dl));
  // (tlo..thi is how dark or pale a stone can be against the dust: on the ground mostly darker, a few fresh and pale)
  lum *= mix(1.0, mix(tlo, thi, pow(fract(s.w * 7.3), 1.7)) * (1.0 + 0.25 * dome), body * f) * (1.0 - (0.4 * shadow + 0.15 * foot) * f);
}
// A crater scale: a bowl and a lip, a dark floor, a pale lip, and on a fresh one a bright blanket of ejecta round it.
// How fresh each is comes from its id: old ones are shallow with a soft lip and no blanket.
void skCraters(vec3 p, float px, float cell, float seed, float depthK, inout float h, inout float lum) {
  float f = skFade(cell * 0.25, px);
  if (f <= 0.0) return;
  vec4 c = skScatterR(p, cell, 0.09, 0.24, seed, 1.6, 0.58);
  float dc = length(c.xyz), rc = mix(0.09, 0.24, c.w) * cell;
  float fresh = fract(c.w * 13.7 + seed);
  float bowl = dc < 1.0 ? -(1.0 - dc * dc) : 0.0;
  float lip = exp(-pow((dc - 1.0) / 0.22, 2.0));
  h += (bowl * depthK * mix(0.6, 1.0, fresh) + lip * 0.35 * depthK * (0.3 + 0.7 * fresh)) * rc * skFade(cell * 0.125, px);
  float flr = 1.0 - smoothstep(0.0, 1.0, dc);
  float halo = step(1.0, dc) * (1.0 - smoothstep(1.0, 1.4, dc));
  // (the pale lip goes with the relief: once a crater is too small to show a bowl it would only be a bare white ring)
  lum *= (1.0 - 0.22 * flr * f) * (1.0 + 0.18 * lip * skFade(cell * 0.125, px) + f * 0.2 * halo * fresh);
}
// The whole ground: its height in metres, and the brightness the dust and stones give the paint (lum).
float skRegolith(vec3 p, float px, out float lum, out float warm) {
  float h = 0.0;
  lum = 1.0;
  // grain: three octaves of fine dust
  float g1 = rimNoise(p * 9.0) - 0.5, g2 = 0.0, g3 = 0.0;
  if (uSkinQ > 0.5) g2 = rimNoise(p * 29.0 + 3.0) - 0.5;
  if (uSkinQ > 1.5) g3 = rimNoise(p * 90.0 - 5.0) - 0.5;
  float f1 = skFade(0.11, px), f2 = skFade(0.034, px), f3 = skFade(0.011, px);
  h += g1 * 0.02 * skFade(0.055, px) + g2 * 0.011 * skFade(0.017, px) + g3 * 0.004 * skFade(0.0055, px);
  lum *= 1.0 + (g1 * 0.5 * f1 + g2 * 0.7 * f2 + g3 * 0.6 * f3) * 0.22;
  // mottling: broad patches of lighter and darker dust, a little warmer or cooler, so that open ground never reads flat
  float a1 = skFade(2.9, px), a2 = skFade(11.0, px), a3 = skFade(40.0, px);
  float m = (rimNoise(p * 0.35) - 0.5) * 0.5 * a1 + (rimNoise(p * 0.09 + 3.0) - 0.5) * 0.35 * a2 + (rimNoise(p * 0.025 - 8.0) - 0.5) * 0.3 * a3;
  lum *= 1.0 + m * 0.55;
  warm = (rimNoise(p * 0.05 + 17.0) - 0.5) * 0.1 * a3 + m * 0.06;
  // (each scale costs a search of eight cells, so the quality setting drops the small ones first)
  if (uSkinQ > 1.5) skPebbles(p, px, 0.5, 0.08, 0.24, 1.0, 0.95, 0.6, 0.62, 1.1, h, lum);   // chips, 4 to 12 cm
  if (uSkinQ > 0.5) skPebbles(p, px, 1.7, 0.1, 0.24, 21.0, 0.5, 0.55, 0.62, 1.1, h, lum);    // cobbles, 17 to 41 cm
  if (uSkinQ > 1.5) skCraters(p, px, 3.0, 9.0, 0.28, h, lum);                     // 0.3 to 0.7 m
  if (uSkinQ > 0.5) skCraters(p, px, 9.5, 31.0, 0.2, h, lum);                     // 0.9 to 2.3 m
  skCraters(p, px, 30.0, 57.0, 0.09, h, lum);                                     // 2.7 to 7 m: old, shallow dishes
  return h;
}

// The ground as three planes, one under each axis of the cube face a spot is on (skUV), for the block grid. A grid laid on
// one plane is cut along a straight line where the next face takes over, so near such a seam both planes are drawn and
// blended (b is 0 away from a seam and 0.5 on it, where the two sides come out the same).
vec2 skPlane(vec3 v, int ax) { return ax == 0 ? v.zy : ax == 1 ? v.xz : v.xy; }

// A dense field of blocks lying on one plane: one candidate to a square cell, 3 x 3 cells searched, each block a lumpy slab
// with a lit side towards the sun and a shadow thrown the other way. Unlike skScatter's spheres cut by the ground, which
// leave a few stones to the square metre, this can cover a good part of the ground (keep is the share of cells holding a
// block). Returns (height, brightness factor).
vec2 skBlocksOn(vec2 uv, vec2 sd, float px, float cell, float rmin, float rmax, float seed, float keep, float hk, float tlo, float thi) {
  vec2 q = uv / cell, b = floor(q);
  float bd = 9.0, bid = 0.0, bz = 0.0;
  vec2 bv = vec2(9.0, 0.0); // (far from any block until one is found: a zero here sat inside the shadow, and darkened every spot with no block near it)
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = b + vec2(float(i), float(j));
    vec3 hh = skHash3(vec3(c, seed));
    vec3 h2 = skHash3(vec3(c * 0.7 + 3.1, seed + 9.0));
    float id = h2.x * h2.x;
    float rad = mix(rmin, rmax, id) * (h2.y < keep ? 1.0 : 1e-4);
    // (centres within a fifth of a cell of the middle, and radii of at most a fifth (a quarter with the ragged edge): each
    // block stays inside its own cell, so two blocks of one layer never touch. Where they did, the choice of nearest flipped
    // along a straight line and cut both)
    vec2 d = (q - (c + 0.5 + (hh.xy - 0.5) * 0.4)) / rad;
    // a lumpy slab turned any way, not a disc: a 2.4 norm of the turned offset (between a disc and a square: a cube norm
    // gave tiles with straight sides), one side a quarter longer, the outline made ragged by noise
    float ca = cos(hh.z * 6.2832), sa = sin(hh.z * 6.2832);
    vec2 ae = abs(vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y)) * vec2(1.0, 1.25);
    float dl = pow(pow(ae.x, 2.4) + pow(ae.y, 2.4), 0.4167) * (1.0 + 0.3 * (rimNoise(vec3(d * 2.2, hh.z * 31.0)) - 0.5));
    if (dl < bd) { bd = dl; bv = d; bid = id; bz = hh.z; }
  }
  float dome = max(1.0 - bd * bd, 0.0);
  float top = sqrt(dome); // (rounded: a flat top with steep sides made a ring of light and shade round each stone, like a pit's lip)
  float body = 1.0 - smoothstep(0.82, 1.0, bd);
  float shadow = (1.0 - smoothstep(0.55, 1.05, length(bv + sd * 0.8))) * (1.0 - body);
  float foot = smoothstep(0.92, 1.02, bd) * (1.0 - smoothstep(1.02, 1.25, bd));
  float f = skFade(cell * 0.2, px);
  float lum = mix(1.0, mix(tlo, thi, fract(bid * 7.3 + bz * 13.1)) * (1.0 + 0.1 * dome), body * f) * (1.0 - (0.3 * shadow + 0.05 * foot) * f);
  return vec2(top * top * mix(rmin, rmax, bid) * cell * hk * skFade(cell * 0.1, px), lum);
}
// (skRef, when skRefOn is 1, is the direction that decides the plane instead of the spot's own: skRim sets it to the crater's
// centre, so that the stones of one rim lie on one plane all the way round, whatever cube-face seam it straddles. The crater is
// tiny against the Moon, so the plane is at worst tilted 45 degrees to the ground there, which stretches the stones by 1.4 at
// most. Away from a crater's rim the spot's own plane is blended with its neighbour's, as below.)
vec3 skRef = vec3(0.0);
float skRefOn = 0.0;
void skBlocks(vec3 p, float px, float cell, float rmin, float rmax, float seed, float keep, float hk, float tlo, float thi, inout float h, inout float lum) {
  if (skFade(cell * 0.2, px) <= 0.0) return;
  vec3 a = abs(normalize(skRefOn > 0.5 ? skRef : p));
  int i0 = (a.x >= a.y && a.x >= a.z) ? 0 : (a.y >= a.z ? 1 : 2);
  float am = i0 == 0 ? a.x : i0 == 1 ? a.y : a.z;
  int i1 = i0 == 0 ? (a.y >= a.z ? 1 : 2) : i0 == 1 ? (a.x >= a.z ? 0 : 2) : (a.x >= a.y ? 0 : 1);
  float as = i1 == 0 ? a.x : i1 == 1 ? a.y : a.z;
  vec2 s0 = skPlane(uSunW, i0);
  vec2 r = skBlocksOn(skPlane(p, i0), s0 / max(length(s0), 1e-3), px, cell, rmin, rmax, seed, keep, hk, tlo, thi);
  float bl = skRefOn > 0.5 ? 0.0 : smoothstep(0.85, 1.0, as / am) * 0.5;
  if (bl > 0.001) {
    vec2 s1 = skPlane(uSunW, i1);
    r = mix(r, skBlocksOn(skPlane(p, i1), s1 / max(length(s1), 1e-3), px, cell, rmin, rmax, seed, keep, hk, tlo, thi), bl);
  }
  h += r.x;
  lum *= r.y;
}

// A crater rim for the regolith look: the classic rim's ragged band of shattered rock (a core a few metres wide whose edges
// break up into patches, a faint halo about three times as wide, both widening with distance so the band never falls below a
// few pixels), but made of the ground's own stuff: the dust itself darkened (so its patches and grain carry on through the
// band), crowded with stones that have the ground's lighting and cast shadows, and a few pale freshly broken chips. There is no
// line along the crest (the classic rim had none: its core is what marks the rail you grind, rails.js). Outside the crest the
// ejecta is paler in broad radial lanes with fewer stones, and the wall inside has pale outcrop and dark dust running down it.
// have is 1 where the crest's exact place is known (the craters of 24 to 120 m within reach, planet.js updateRimInk): sd is then
// the distance to it in metres (negative inside) and cen the crater's centre. Elsewhere only vrim (0 to 1 over every crater's
// rim zone) is known, and the rim is a rubbly zone. p is the world position, pr the same pushed to the Moon's radius (for the
// direction from the crater's centre). band comes out as how much the band darkens the paint (0 to about 0.87, as the classic's).
void skRim(vec3 p, vec3 pr, float px, float have, float sd, vec3 cen, float far, float vrim, inout float h, inout float lum, out float band) {
  band = 0.0;
  skRef = cen;
  skRefOn = have;
  float zv = smoothstep(0.55, 1.0, vrim);
  float core = 0.0, halo = 0.0, zo = 0.0, zi = 0.0, lane = 0.5;
  if (have > 0.5) {
    float a = abs(sd);
    // (the ejecta outside and the foot of the wall inside ease in across the crest, over a few metres. Both used to start at full
    // strength exactly on it, from zero on the other side: a hard step in the paint along the whole crest, a straight pale line)
    zo = smoothstep(-2.0, 3.0, sd) * exp(-max(sd, 0.0) / 14.0);   // the ejecta outside
    zi = smoothstep(2.0, -3.0, sd) * exp(min(sd, 0.0) / 8.0);     // the foot of the wall inside
    vec3 dr = normalize(pr - cen);
    // lanes along the crater's radii, broad and broken up (a pure radial pattern is a wheel of spokes): the second term
    // drifts with the distance from the crest, so no lane runs straight
    float sk = rimNoise(dr * 24.0 + vec3(0.0, 0.0, sd * 0.05) + 3.0) * 0.6 + rimNoise(dr * 58.0 + vec3(sd * 0.1, 0.0, 0.0) - 7.0) * 0.4;
    lane = smoothstep(0.3, 0.7, sk);
    float fl = skFade(1.5, px);
    lum *= 1.0 + 0.22 * zo * (0.3 + 0.7 * lane) * far * fl;                                  // pale ejecta, in lanes
    float tin = -sd;
    float wall = smoothstep(0.0, 3.0, tin) * (1.0 - smoothstep(20.0, 45.0, tin));           // the wall: from the crest down about 30 m
    lum *= 1.0 + 0.11 * wall * (lane * 2.0 - 1.0) * far * fl;                                // pale outcrop and dark dust, running down it
    // the band itself, as the classic rim's (planet.js): a ragged core and a halo
    // (near, where single stones show, the band is a quiet darkening of the dust under them: its ragged edges and the speckle
    // below are what made the dark blotches, so they come in only as stones drop below a pixel, from about 3 cm to 12 cm a pixel)
    float far3 = smoothstep(0.03, 0.12, px);
    float rag = ((rimNoise(p * 0.21 + 1.7) - 0.5) * 1.6 + (rimNoise(p * 0.55 - 6.0) - 0.5) * 0.7) * mix(0.35, 1.0, far3);
    float hw = max(1.3 + 1.9 * rimNoise(p * 0.03 + 9.0), px * 1.2);
    core = 1.0 - smoothstep(hw * 0.55, hw * 1.35 + px, a + rag);
    halo = (1.0 - smoothstep(hw, hw * 3.2, a + rag * 1.5)) * 0.35;
    band = max(core * (0.5 + 0.2 * rimNoise(p * 0.09 - 3.0)), halo) * far * mix(0.4, 1.0, far3); // (the classic's core was 0.62 to 0.87: softer here)
  }
  // the stones: as thick as the band is dark (the classic's rule: the core, or the halo at 1.6 times), thinning out over the ejecta
  // and the foot of the wall
  float dens = max(zv * 0.22, far * max(max(core, halo * 1.6), max(zo * (0.35 + 0.65 * lane) * 0.4, zi * 0.35)));
  if (dens > 0.03) {
    // several sizes, each its own layer (the small ones go first when the quality is turned down), against the darkened dust
    // of the band: mostly a little darker still, some about as dark as the dust round them
    if (uSkinQ > 1.5) skBlocks(p, px, 0.45, 0.1, 0.2, 61.0, dens, 1.5, 0.6, 1.05, h, lum);      // rubble, radius 5 to 9 cm
    if (uSkinQ > 0.5) skBlocks(p, px, 0.8, 0.1, 0.2, 67.0, dens, 1.5, 0.6, 1.05, h, lum);       // stones, 8 to 16 cm
    skBlocks(p, px, 1.5, 0.1, 0.2, 71.0, dens * 0.9, 1.5, 0.55, 1.0, h, lum);                   // big stones, 15 to 30 cm
    skBlocks(p, px, 3.0, 0.1, 0.2, 73.0, dens * 0.6, 1.4, 0.55, 1.0, h, lum);                   // boulders, 30 to 60 cm
    // and the classic's bright chips of fresh rock, on the core
    if (uSkinQ > 0.5) skBlocks(p, px, 0.55, 0.08, 0.16, 79.0, core * 0.45 * far, 1.0, 1.15, 1.9, h, lum);
    // and, for the range where single stones are under a pixel (30 to 150 m), the classic's speckle: dark pebbles and bright chips
    // about half a metre across, on the band, in between a pixel of 3 to 12 cm (not nearer: there they are shapeless blotches) and
    // 8 to 35 cm
    float grit = (1.0 - smoothstep(0.08, 0.35, px)) * smoothstep(0.03, 0.12, px);
    float peb = smoothstep(0.62, 0.72, rimNoise(p * 1.3 + 11.0)) * grit;
    float chip = smoothstep(0.8, 0.86, rimNoise(p * 1.9 - 4.0)) * grit;
    lum *= (1.0 - 0.3 * peb * max(core, halo * 1.6) * far) * (1.0 + 0.7 * chip * core * far);
  }
}

// A rock's surface, in the same terms as the ground's: relief in metres, and the brightness and warmth it gives the paint.
// p is the world position, c the rock's centre, s its size (for the stones that are instanced; s <= 0 otherwise).
float skRock(vec3 p, vec3 c, float s, vec3 up, float px, out float lum, out float warm) {
  float h = 0.0;
  lum = 1.0;
  warm = 0.0;
  // undulation across a face, and pores and grain
  float n0 = rimNoise(p * 1.6) - 0.5, n1 = rimNoise(p * 0.45 + 2.0) - 0.5;
  h += n0 * 0.11 * skFade(0.6, px) + n1 * 0.25 * skFade(2.2, px);
  lum *= 1.0 + n1 * 0.3 * skFade(2.2, px) + n0 * 0.16 * skFade(0.6, px);
  float g1 = rimNoise(p * 14.0) - 0.5, g2 = 0.0, g3 = 0.0;
  if (uSkinQ > 0.5) g2 = rimNoise(p * 41.0 + 3.0) - 0.5;
  if (uSkinQ > 1.5) g3 = rimNoise(p * 120.0 - 5.0) - 0.5;
  h += g1 * 0.014 * skFade(0.035, px) + g2 * 0.006 * skFade(0.012, px);
  lum *= 1.0 + (g1 * 0.5 * skFade(0.07, px) + g2 * 0.7 * skFade(0.024, px) + g3 * 0.6 * skFade(0.008, px)) * 0.28;
  // mineral flecks, pale and dark
  float sp1 = rimNoise(p * 55.0 + 9.0);
  lum *= 1.0 + (smoothstep(0.78, 0.9, sp1) * 0.5 - smoothstep(0.22, 0.1, sp1) * 0.35) * skFade(0.03, px);
  // faint strata, bending with the noise, and pale patches where a piece has broken away
  lum *= 1.0 + sin((dot(p - c, up) + n0 * 0.5) * 18.0) * 0.07 * skFade(0.35, px);
  lum *= 1.0 + smoothstep(0.55, 0.78, rimNoise(p * 2.2 + 7.0)) * 0.12;
  // (no craters: a rock is not a patch of ground, and impact craters belong to the ground it lies on)
  return h;
}

// Mikkelsen's surface-gradient bump (what three's bump map does), for a height worked out in the shader. The tilt eases
// off towards the slope maxSlope (rise over run) and never passes it.
vec3 skPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection, float maxSlope) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  float cap = abs(det) * maxSlope;
  grad *= cap / sqrt(cap * cap + dot(grad, grad) + 1e-12);
  return normalize(abs(det) * surfNorm - grad);
}
`;

// Normal: 1 regolith tips the lit ground by its relief. The slope is capped near 22 degrees (0.4): the ground's
// grazing-shadow rule (toon.js) switches the sun off on a face tipped that far from it, and a steeper bump turns into a
// hard dark blotch. The steep parts of the relief are carried by the paint instead (the hillshade, below).
export const SKIN_NORMAL = /* glsl */`
if (uSkin > 0.5 && uSkin < 1.5) {
  normal = skPerturb(-vViewPosition, normal, vec2(dFdx(skHeight), dFdy(skHeight)) * uSkinBump, faceDirection, 0.4);
}
`;

// Colour, before the lighting: what the ground is painted.
export const SKIN_COLOR = /* glsl */`
if (uSkin > 0.5 && uSkin < 1.5) {
  // regolith: worked out once here (skHeight is read again by the normal), then the relief lit by the real sun in the paint
  float skLum, skWarm;
  skHeight = skRegolith(vHoleW, skPx, skLum, skWarm);
  // the crater rims (the shader above has worked out where each crest is: rimU the distance to the nearest crater's, rimOwn to
  // one nested inside a bigger one's, rimWob the wobble they share, each with its crater's centre)
  float rHave = (rimU < 1e5 || abs(rimOwn) < 1e5) ? 1.0 : 0.0;
  float rUseU = abs(rimU + rimWob) <= abs(rimOwn + rimWob) ? 1.0 : 0.0;
  float rBand = 0.0;
  skRim(vHoleW, rimP, skPx, rHave, (rUseU > 0.5 ? rimU : rimOwn) + rimWob, rUseU > 0.5 ? rimCenU : rimCenO, rimFar, vRim, skHeight, skLum, rBand);
  diffuseColor.rgb *= skLum * vec3(1.0 + skWarm, 1.0, 1.0 - skWarm);
  // the band darkens the ground's own colour (so its patches carry on through it) and cools it towards the classic rim's rock
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.42, vec3(0.24, 0.21, 0.29), 0.35), rBand);
  vec3 nG = normalize(vNormal);
  vec3 nR = skPerturb(-vViewPosition, nG, vec2(dFdx(skHeight), dFdy(skHeight)), 1.0, 1.0);
  vec3 sunV = normalize((viewMatrix * vec4(uSunW, 0.0)).xyz);
  diffuseColor.rgb *= 1.0 + clamp((dot(nR, sunV) - dot(nG, sunV)) * uSkinShade, -0.45, 0.3);
} else if (uSkin > 2.5) {
  // survey: the ground recoloured by altitude, in steps, keeping the shading the painted Moon already has
  float alt = length(vHoleW) - ${R.toFixed(1)};
  float t = clamp((alt + 150.0) / 300.0, 0.0, 1.0);
  float tq = (floor(t * 16.0) + 0.5) / 16.0;
  // indigo, cyan, mint, sand, coral, pale pink: neighbours close in hue, so no step passes through grey
  vec3 c0 = vec3(0.30, 0.16, 0.85), c1 = vec3(0.08, 0.66, 0.88), c2 = vec3(0.30, 0.86, 0.58), c3 = vec3(0.96, 0.84, 0.40), c4 = vec3(0.97, 0.42, 0.36), c5 = vec3(1.0, 0.82, 0.92);
  float u5 = tq * 5.0;
  vec3 band = u5 < 1.0 ? mix(c0, c1, u5) : u5 < 2.0 ? mix(c1, c2, u5 - 1.0) : u5 < 3.0 ? mix(c2, c3, u5 - 2.0) : u5 < 4.0 ? mix(c3, c4, u5 - 3.0) : mix(c4, c5, u5 - 4.0);
  // (the painted Moon's own brightness rides on the band colour, so slopes and rims keep their shading)
  float lumC = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = band * (0.25 + 0.95 * lumC);
  diffuseColor.rgb *= 1.0 + 0.05 * (mod(floor(alt / 5.0), 2.0) * 2.0 - 1.0);
}
`;

// After the lighting: ink and glow that the shadows must not darken.
export const SKIN_LIGHT = /* glsl */`
if (uSkin > 1.5 && uSkin < 2.5) {
  // etching: how much ink this spot wants is how dark it came out, plus how steep it is
  vec3 P = vHoleW;
  float lumO = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  float lumD = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float shade = clamp(lumO / (lumD * uSkinLit + 1e-3), 0.0, 1.0);
  vec3 upW = normalize(P);
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  float slope = 1.0 - clamp(dot(nW, upW), 0.0, 1.0);
  float need = (1.0 - shade) + slope * 0.9;
  vec2 uv = skUV(P);
  uv += (vec2(rimNoise(vec3(uv * 0.5, 1.0)), rimNoise(vec3(uv * 0.5, 7.0))) - 0.5) * 0.3; // a hand's wobble
  float press = 0.65 + 0.7 * rimNoise(vec3(uv * 2.5, 3.0)); // pen pressure
  float h1 = skHatchM(dot(uv, vec2(0.7071, 0.7071)), 0.14, smoothstep(0.28, 0.62, need) * 0.4 * press, skPx);
  float h2 = skHatchM(dot(uv, vec2(0.7071, -0.7071)), 0.14, smoothstep(0.6, 0.9, need) * 0.36 * press, skPx);
  float h3 = skHatchM(uv.y, 0.11, smoothstep(0.88, 1.2, need) * 0.34 * press, skPx);
  // (the strokes fade out with distance, where the post pass's halftone takes over, and where the ground is
  // seen edge-on, where they'd only be slivers)
  float far = 1.0 - smoothstep(160.0, 420.0, length(vViewPosition));
  float face = smoothstep(0.05, 0.3, abs(dot(normalize(vViewPosition), normal)));
  // (and a faint pencil tone over the lit ground too, so no ground is bare paper)
  float along = dot(uv, vec2(-0.436, 0.9)), across = dot(uv, vec2(0.9, 0.436));
  float tick = smoothstep(0.38, 0.55, rimNoise(vec3(along * 2.2, floor(across / 0.2 + 0.5), 5.0))); // (short strokes with gaps, not long lines)
  float h0 = skHatchM(across, 0.2, 0.05 * press, skPx) * 0.32 * tick;
  float ink = max(max(h1, max(h2, h3)), h0) * far * face;
  vec3 col = outgoingLight * (1.0 + (rimNoise(P * 28.0) - 0.5) * 0.07 * skFade(0.035, skPx)); // (paper grain)
  // pen stipple in loose clumps on the lit ground, a little thicker towards the shade
  float fs = skFade(0.05, skPx);
  if (fs > 0.0) {
    vec2 sc = uv / 0.1, ci = floor(sc);
    float hh = rimHash(vec3(ci, 3.0)), keep = rimHash(vec3(ci, 6.0));
    vec2 jit = vec2(rimHash(vec3(ci, 4.0)), rimHash(vec3(ci, 5.0))) - 0.5;
    float r = mix(0.1, 0.26, hh), sa = max(0.1, skPx / 0.1);
    float clump = smoothstep(0.42, 0.58, rimNoise(P * 0.9 + 2.0)) * step(keep, 0.3 + 0.5 * need);
    ink = max(ink, (1.0 - smoothstep(r - sa, r + sa, length(fract(sc) - 0.5 - jit * 0.5))) * clump * fs * 0.85);
  }
  float pf = skFade(0.12, skPx);
  if (pf > 0.0) {
    // pebbles: an inked ring, a lighter face, a shaded side away from the sun and a shadow thrown onto the ground
    vec4 s = skScatter(P, 0.8, 0.07, 0.22, 2.0);
    float dl = length(s.xyz);
    float rm = mix(0.07, 0.22, s.w) * 0.8;
    float aa = max(skPx / rm, 0.02);
    float ringW = max(0.07, 1.3 * skPx / rm);
    vec3 sunT = normalize(uSunW - upW * dot(uSunW, upW));
    float shd = (1.0 - smoothstep(0.75, 1.0, length(s.xyz + sunT * 1.1))) * smoothstep(0.35, 0.7, shade);
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0, dl);
    float ring = disc * smoothstep(1.0 - ringW - aa, 1.0 - ringW, dl);
    float cres = disc * smoothstep(0.0, 0.6, -dot(s.xyz / max(dl, 1e-3), uSunW)) * (1.0 - ring);
    ink = max(ink * (1.0 - disc * 0.85), max(shd * (1.0 - disc) * 0.8, max(ring, cres * 0.55))) * pf + ink * (1.0 - pf);
    col = mix(col, col * 1.07 + 0.01, disc * (1.0 - ring) * pf);
  }
  outgoingLight = mix(col, vec3(0.022, 0.01, 0.04), clamp(ink, 0.0, 1.0) * 0.92);
} else if (uSkin > 2.5) {
  // survey: contours every 5 m, bold every 25 m and 100 m, the world grid every 48 m (and 480 m from orbit), a mark
  // where its lines cross
  float alt = length(vHoleW) - ${R.toFixed(1)};
  float minor = skLine(alt / 4.0, 1.2), major = skLine(alt / 20.0, 1.8), huge = skLine(alt / 100.0, 2.0);
  vec2 uv = skUV(vHoleW);
  vec2 gf = uv / 6.0, gm = uv / 48.0, gb = uv / 480.0; // the ground grid: 6 m, 48 m, 480 m
  vec2 gn = uv / 1.5; // (and a faint 1.5 m graph paper for the ground at your feet)
  float gridN = max(skLine(gn.x, 0.8), skLine(gn.y, 0.8)) * 0.16;
  vec2 nn = abs(fract(gn + 0.5) - 0.5) * 1.5;
  float markN = max(step(nn.x, max(0.012, 0.7 * skPx)) * step(nn.y, 0.1), step(nn.y, max(0.012, 0.7 * skPx)) * step(nn.x, 0.1)) * (1.0 - smoothstep(0.03, 0.07, skPx));
  float gridF = max(skLine(gf.x, 0.9), skLine(gf.y, 0.9)) * 0.3;
  float gridM = max(skLine(gm.x, 1.4), skLine(gm.y, 1.4)) * 0.6;
  float gridB = max(skLine(gb.x, 2.0), skLine(gb.y, 2.0)) * 0.9;
  // a "+" laid on the ground where the 6 m lines cross (arms 0.4 m), a bigger one (3 m) where the 48 m lines do
  vec2 nf = (abs(fract(gf + 0.5) - 0.5)) * 6.0, nm = (abs(fract(gm + 0.5) - 0.5)) * 48.0; // metres from the nearest line
  float wf = max(0.03, 0.8 * skPx), wm = max(0.1, 1.0 * skPx);
  float markF = max(step(nf.x, wf) * step(nf.y, 0.4 + wf), step(nf.y, wf) * step(nf.x, 0.4 + wf)) * (1.0 - smoothstep(0.25, 0.5, skPx));
  float markM = max(step(nm.x, wm) * step(nm.y, 3.0 + wm), step(nm.y, wm) * step(nm.x, 3.0 + wm)) * (1.0 - smoothstep(2.0, 4.0, skPx));
  vec3 col = outgoingLight;
  vec3 pink = vec3(1.0, 0.2, 0.65);
  col = mix(col, pink, gridN);
  col = mix(col, vec3(1.0, 0.95, 0.85), markN * 0.5);
  col = mix(col, pink, gridF);
  col = mix(col, pink, gridM);
  col = mix(col, pink, gridB);
  col = mix(col, vec3(0.05, 0.9, 1.0), minor * 0.6);
  col = mix(col, vec3(1.0, 0.85, 0.2), major * 0.9);
  col = mix(col, vec3(1.0), huge * 0.9);
  col = mix(col, vec3(1.0, 0.95, 0.85), max(markF * 0.7, markM * 0.9));
  outgoingLight = col;
}
`;

// ---- rocks ----
// The game's rocks (the instanced boulders in planet.js, the shaped rocks in rocks.js) take regolith's look when the
// switch is on 1: the same grain, flecks and strata (and no craters: those belong to the ground), dust on the tops and banked round the foot, a tone of their
// own each, and the relief lit by the real sun in the paint. The normal is left alone: a rock's flat faces often sit right
// at the sun's grazing line, where a tilted normal turns patches of the face to hard unlit blotches. Off, or on another
// look, they are drawn as they always were.
const ROCK_VARY = 'varying vec3 vSkW; varying vec3 vSkC; varying float vSkS;';

const ROCK_COLOR = /* glsl */`
if (uSkin > 0.5 && uSkin < 1.5) {
  vec3 upR = normalize(vSkW);
  float rLum, rWarm;
  skHeight = skRock(vSkW, vSkC, vSkS, upR, skPx, rLum, rWarm);
  // each stone its own tone, a little warmer or cooler
  float t1 = rimHash(vSkC * 0.37), t2 = rimHash(vSkC * 0.91 + 4.0);
  float wt = rWarm * 0.5 + (t2 - 0.5) * 0.1;
  diffuseColor.rgb *= rLum * mix(0.78, 1.12, t1) * vec3(1.0 + wt, 1.0, 1.0 - wt);
  vec3 nG = normalize(vNormal);
  vec3 nWr = inverseTransformDirection(nG, viewMatrix);
  // dust settles on what faces up and banks round the foot
  float dustN = 0.55 + 0.9 * rimNoise(vSkW * 1.7 + 11.0);
  float dust = smoothstep(0.35, 0.9, dot(nWr, upR)) * dustN;
  if (vSkS > 0.0) {
    float gnd = dot(vSkW - vSkC, upR) / vSkS + 0.3; // (height above the ground in the stone's own size: it sits 0.3 of that above the ground)
    dust = max(dust, 0.55 * (1.0 - smoothstep(0.02, 0.3, gnd)) * dustN);
    diffuseColor.rgb *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.1, gnd)); // a dark line where it meets the ground
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46, 0.44, 0.48) * rLum, clamp(dust, 0.0, 1.0) * 0.5 * skFade(2.0, skPx));
  vec3 nR2 = skPerturb(-vViewPosition, nG, vec2(dFdx(skHeight), dFdy(skHeight)), 1.0, 1.0);
  vec3 sunV2 = normalize((viewMatrix * vec4(uSunW, 0.0)).xyz);
  diffuseColor.rgb *= 1.0 + clamp((dot(nR2, sunV2) - dot(nG, sunV2)) * uSkinShade * 1.6, -0.5, 0.4);
}
`;

export function patchRockMaterial(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SKIN_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${ROCK_VARY}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 skWp = vec4(transformed, 1.0), skCp = vec4(0.0, 0.0, 0.0, 1.0);
float skSz = -1.0; // (the stone's size when it is an instance; none otherwise)
#ifdef USE_INSTANCING
  skWp = instanceMatrix * skWp; skCp = instanceMatrix * skCp; skSz = length(instanceMatrix[0].xyz);
#endif
vSkW = (modelMatrix * skWp).xyz; vSkC = (modelMatrix * skCp).xyz; vSkS = skSz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${ROCK_VARY}\n${SK_NOISE}\n${SKIN_COMMON}`)
      .replace('void main() {', `void main() {
  float skPx = length(fwidth(vSkW)); // (metres per pixel on the stone)
  float skHeight = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${ROCK_COLOR}`);
  };
  mat.customProgramCacheKey = () => 'rockSkin';
  return mat;
}

// ---- berms ----
// The regolith banked round the hab domes (settlements.js habDome) takes the ground's look when the switch is on 1: the
// same dust grain and mottling, and stones, more of them than on open ground (it is dug-up spoil heaped by a loader), a few
// of them blocks the size of a fist or two; no craters (nothing has hit it since it was piled). The relief is lit by the real
// sun in the paint, the normal left alone as the rocks' is (the berm's slopes are steep enough already for a tilted normal to
// turn whole patches dark). Off, or on another look, it is its plain colour.
const BERM_FN = /* glsl */`
float skBerm(vec3 p, float px, out float lum, out float warm) {
  float h = 0.0;
  lum = 1.0;
  float g1 = rimNoise(p * 9.0) - 0.5, g2 = 0.0, g3 = 0.0;
  if (uSkinQ > 0.5) g2 = rimNoise(p * 29.0 + 3.0) - 0.5;
  if (uSkinQ > 1.5) g3 = rimNoise(p * 90.0 - 5.0) - 0.5;
  h += g1 * 0.02 * skFade(0.055, px) + g2 * 0.011 * skFade(0.017, px) + g3 * 0.004 * skFade(0.0055, px);
  lum *= 1.0 + (g1 * 0.5 * skFade(0.11, px) + g2 * 0.7 * skFade(0.034, px) + g3 * 0.6 * skFade(0.011, px)) * 0.22;
  // mottling a size down from the ground's (a berm is a few metres across): darker and paler loads of spoil
  float m = (rimNoise(p * 0.35) - 0.5) * 0.5 * skFade(2.9, px) + (rimNoise(p * 1.1 + 3.0) - 0.5) * 0.35 * skFade(0.9, px);
  lum *= 1.0 + m * 0.55;
  warm = m * 0.06;
  if (uSkinQ > 1.5) skPebbles(p, px, 0.5, 0.08, 0.24, 1.0, 0.95, 0.6, 0.62, 1.1, h, lum);   // chips, 4 to 12 cm
  skPebbles(p, px, 1.1, 0.1, 0.24, 21.0, 0.8, 0.55, 0.5, 1.25, h, lum);                      // cobbles, 11 to 26 cm, crowded
  if (uSkinQ > 0.5) skPebbles(p, px, 2.6, 0.08, 0.2, 43.0, 0.35, 0.5, 0.45, 1.15, h, lum);   // blocks, 20 to 50 cm
  return h;
}
`;
const BERM_COLOR = /* glsl */`
if (uSkin > 0.5 && uSkin < 1.5) {
  // (its own colour is darker than the classic ground, so it reads there: on this look it is the dust's, a shade down)
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.325, 0.38), 0.8);
  float bLum, bWarm;
  skHeight = skBerm(vSkW, skPx, bLum, bWarm);
  diffuseColor.rgb *= bLum * vec3(1.0 + bWarm, 1.0, 1.0 - bWarm);
  vec3 nG = normalize(vNormal);
  vec3 nR = skPerturb(-vViewPosition, nG, vec2(dFdx(skHeight), dFdy(skHeight)), 1.0, 1.0);
  vec3 sunV = normalize((viewMatrix * vec4(uSunW, 0.0)).xyz);
  diffuseColor.rgb *= 1.0 + clamp((dot(nR, sunV) - dot(nG, sunV)) * uSkinShade * 1.3, -0.45, 0.35);
}
`;

export function patchBermMaterial(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SKIN_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSkW;\n${SK_NOISE}\n${SKIN_COMMON}\n${BERM_FN}`)
      .replace('void main() {', `void main() {
  float skPx = length(fwidth(vSkW)); // (metres per pixel on the berm)
  float skHeight = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${BERM_COLOR}`);
  };
  mat.customProgramCacheKey = () => 'bermSkin';
  return mat;
}
