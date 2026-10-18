# Outposts from Blender (`src/assets/outposts.glb`)

The small faction structures (watchtower, depot, farm dome, relay mast, kiosk, scrap shack, junk pile) are built in
code by `Kit` (`src/outpostModels.js`). This is the contract for building one in Blender instead. It is a **pilot**:
two kinds have gone through it so far, the Relay Mast (`mast`) and the Watchtower (`tower`), the other five are still
Kit-built, and it is **off by default** (see "Switching it on").

Read the file with `src/outpostGlb.js`, bake it with `src/staticBake.js`, check it with `npm run check:outposts`.

## What the game does with the file

An outpost template is `{ root, cols, hits, raid, smoke, drop }` in the outpost's own frame (metres, +y up, ground at
y = 0, the yard's centre at the origin, +z towards the gate). `territory.js` clones `root`, drops a collider for
every entry of `cols`, damages the building when a blast reaches a box in `hits`, lets you raid it at `raid`, makes
the wreck smoulder at `smoke` and throws loot to `drop`. A GLB supplies all of that:

- **Geometry** is baked once per kind × faction colour × wreck into a handful of merged meshes: vertex-coloured toon
  and unlit glow meshes (one more of each for a double-sided material), one outline hull, one mesh per `additive…`
  colour and opacity, a set of its own for every moving part, and a face or two per sign. Hundreds of Blender objects
  cost the same as a Kit build: 8 to 13 draw calls (the Relay Mast 13, the Watchtower 11, the Relay Mast wreck 7 and the Watchtower's 8;
  `npm run check:outposts` prints the count for each root).
- **Gameplay data** (`cols`, `hits`, `raid`, `smoke`, `drop`) comes from **empties**, not from the visible meshes.
  Collision is never read from a mesh: draw the building however you like, then place the colliders by hand.

If the file, a kind, or the bake fails, the game falls back to the Kit-built outpost and logs a warning.

## Axes and names

Author in three.js axes (x right, y up, +z forward/gate), as `tools/blender/kit.py` does (`tb()` converts to Blender's
axes and the exporter's +Y-up option converts back). Export with **custom properties on** (`export_extras`).

Scene roots, one empty at the origin per variant, everything else a descendant:

| Root | Meaning |
|---|---|
| `<kind>` | the intact compound (`mast`, `tower`) |
| `<kind>_wreck` | the same compound with the main building in ruins (shared yard props are repeated) |

Blender appends `.001` to duplicate names; the game strips a trailing `.NNN` from material names, but keep node names
unique anyway. Object names are unique across the whole file, so the wreck root cannot reuse `raid`, `smoke` or `drop`:
name them `smoke_wreck`, `col_shed_wreck` and so on, and give every kind after the first a marker of its own, role word
first (the Watchtower's are `raid_tower`, `col_tower_lattice`, `smoke_tower_wreck`, `tower_apron`; the Relay Mast keeps
the plain names). The role is read from the custom property `role` (always set it), or failing that from the name up to
the first `_` or digit.

## Meshes

- Any depth under a root. **One material per mesh** is the convention (a mesh with several works: each material
  becomes its own part, and the checker warns), indexed triangles, `POSITION` + `NORMAL` only. UVs, textures, skins,
  animations and lights are ignored (the checker warns).
- Custom property `ink` (number, metres) on a mesh = outline thickness: a shell pushed out so that every face moves
  out by that much, edges and corners included, like the Kit's outline hull. Absent or 0 = none. It belongs to that
  mesh alone: a mesh parented under an inked one gets no outline of its own.
- Flat colours only. The look is the game's 3-step toon ramp over the material's **base colour**.
- Do not use alpha blending, except on an `additive…` material (see below): anywhere else the checker warns and the mesh renders opaque.

### Materials

The material **name** (a trailing `.NNN` is ignored) picks the treatment; everything else comes from the base colour.

| Name | Treatment |
|---|---|
| `faction…` (`faction`, `faction_cloth`, …) | lit toon in the owning faction's accent colour |
| `faction_glow…` | unlit, in the faction's accent colour |
| `glow…` (`glow`, `glow_red`, …) | unlit, in the material's own base colour (lamps, screens) |
| `additive…` (`additive_searchlight`) | a light beam: unlit, additive and see-through, in the base colour, with the material's **alpha** as its opacity. Double-sided, writes no depth, casts no shadow, gets no outline |
| anything else | lit toon in the material's own base colour |

Turn **backface culling off** on a material to make it double-sided (dishes, cloth).

To author a beam: name the material `additive_…`, set the Principled BSDF's **Alpha** below 1 (0.13 for the
Watchtower's searchlight) and the material's blend mode to Alpha Blend (Render Method: Blended in Blender 4.2+), so the
exporter writes `alphaMode: BLEND` and the alpha. A material with alpha 0 or 1, or one that is not blended, draws not at
all or at full strength (the checker warns).
Colours are sRGB hex in the game and **linear** in Blender: convert (the build script has `srgb()`).

## Gameplay empties

Empties (not meshes) anywhere under a root. Position and rotation are relative to the root. The role comes from the
custom property `role`, or failing that from the name's prefix (`col_…`, `hit_…`, `raid`, `smoke`, `drop`, `text_…`). A
mesh carrying a role (or `anim`) is just drawn as geometry, and the checker warns. Meshes parented under a gameplay
empty are ordinary geometry and are drawn.

| Role | Meaning | How it is read |
|---|---|---|
| `col` | collider | custom property `shape` = `box` \| `cyl` \| `sphere` (default `box`) |
| `hit` | blast box that damages the building | a `box`, as below |
| `raid` | where you stand to raid (intact only) | position |
| `smoke` | where the wreck smoulders; also the building's centre for damage pops | position |
| `drop` | open apron spot where loot lands | position |
| `text` | a sign face (a canvas-texture plane drawn at runtime, so the font can change) | see below |

A **box** is an empty (cube display, size 1) whose **scale is the half-extents**, rotated about Y only; its position is
the box's centre. A **cyl** is a vertical cylinder: radius = scale.x, its axis runs from `y - scale.y` to `y + scale.y`
at the node's x/z. A **sphere** takes its radius from scale.x. Colliders are always upright and round: a tilt on a box
or cylinder, or an uneven sphere, is flattened to that (the checker warns), so build a lying pipe from boxes.

In Blender's z-up axes the half-extents `(hx, hy, hz)` go in as `scale = (hx, hz, hy)` and a turn of `θ` about the
game's vertical is `rotation_euler.z = θ`; the exporter converts them back (the build script's helpers do this).

A **text** empty needs `str` (the words) and `w` (board width in metres); optional `fg`, `bg`, `stroke` (CSS colours),
`back` (1 = a second face on the back, default 1) and `off` (distance of each face from the node, default 0.17). The
plane faces the node's +z; its turn about the vertical and its roll about its own +z are kept, a lean (pitch) is dropped
(the checker warns).

## Moving parts

A group node (an empty) with a custom property `anim` = `flag` \| `blink` \| `spin` keeps its mesh children as a
separate object that the game animates, instead of merging them into the static mesh:

| `anim` | What the game does to the node |
|---|---|
| `flag` | swings it ±0.25 rad about Y (put the node at the hinge, the cloth to one side) |
| `blink` | shows and hides it |
| `spin` | turns it 0.6 rad/s about Y (put the node on the spin axis) |

Author an animated part's meshes relative to the node's origin. Apply any non-uniform scale on its parents in Blender: a
turned moving part under a stretched parent cannot be placed correctly (the checker warns).

## Switching it on

Off by default. Turn it on with `?outpostGlb` in the URL or `localStorage['mr-outpost-glb'] = '1'`. In the URL,
`?outpostGlb=0` (or `false`, `off`, `no`) turns it off again, and the URL beats the saved setting. A missing or broken
file, kind or wreck quietly gives the Kit-built outpost. (The file is a separate chunk fetched while the game starts,
so a very slow request delays the start; a failed one never stops it.)

The dev viewer (`/tools/viewer.html?m=outpost&kind=mast` or `kind=tower`) shows it beside the Kit build with every collider drawn and
checks that the two hold the same gameplay data (`&src=kit|glb|both`, `&wreck=1`, `&cols=0`). `src=glb` shows any kind in
the file, whether or not it is in `GLB_KINDS` yet.

## Rebuilding the file

`tools/blender/build_outposts.py` builds the roots in code (a port of the Kit builders, like the other `build_*.py`) and
exports the GLB. Run it inside Blender, or with Blender as a Python module (`pip install bpy` in a venv):

```
MOONRUNNER_REPO=<repo> python tools/blender/build_outposts.py     # MOONRUNNER_EXPORT=0 builds without writing
```

The Relay Mast's dishes are the game's dish head (`head_pieces()` in `tools/blender/dishkit.py`, which `build_dish.py` uses for the dish
stations and `models.js` bakes into the Kit-built mast): three on arms up the mast, one turning on a boom at the top (the `spin` node), a big one
on the ground, and two flung off the wreck. The file cannot know the owner's full livery, so a head's body (cowl, trusses, quadpod, feed cabin,
half the rim blocks) is the material `faction` and its stripe a cream `dish_cream`; the Kit build paints the head in the faction's own body and
stripe colours (`dishSlot` in `models.js`), and a wreck's heads are grey in both.

It is deterministic: running it again reproduces `src/assets/outposts.glb` byte for byte, so a diff in the committed file
means the script or Blender changed. Nothing in CI runs it; `npm run check:outposts` checks the committed file.

## Adding a kind

1. Add its builder to `tools/blender/build_outposts.py` (or author it in Blender) with both roots: a Kit with its own
   `tag=`, registered in `BUILDERS` with its seed in `KIND_SEED` (the one in `src/outpostModels.js`).
2. Run the script, commit `src/assets/outposts.glb`.
3. `npm run check:outposts -- --kind <name>` (or `-- --all`): by default it checks only the kinds in `GLB_KINDS`.
   It exits 0 when the file is fine, 1 with errors, 2 on bad usage.
4. Open `/tools/viewer.html?m=outpost&kind=<name>` (and `&wreck=1`): it should say the gameplay data is the same.
5. Add the kind to `GLB_KINDS` in `src/staticContract.js`, and to the pilot sentence at the top of this file.
