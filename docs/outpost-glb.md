# Outposts from Blender (`src/assets/outposts.glb`)

The seven small faction outposts (Watchtower, Supply Depot, Farm Dome, Relay Mast, Trading Kiosk, Scrap Shack, Junk Pile)
are built in Blender (`tools/blender/build_outposts.py`), ported from the code that drew them (`src/outpostDrafts.js`, the
picked drafts of docs/outpost-proposals), which stays as the fallback. All seven are in `GLB_KINDS`
(`src/staticContract.js`): `tower`, `kiosk`, `depot`, `farm`, `mast`, `junk`, `shack`, each with its `_wreck`.

Read the file with `src/outpostGlb.js`, bake it with `src/staticBake.js`, check it with `npm run check:outposts`.

## What the game does with the file

An outpost template is `{ root, cols, hits, raid, smoke, drop, walkers }` in the outpost's own frame (metres, +y up, ground at
y = 0, the yard's centre at the origin, +z towards the gate). `territory.js` clones `root`, drops a collider for
every entry of `cols`, damages the building when a blast reaches a box in `hits`, lets you raid it at `raid`, makes
the wreck smoulder at `smoke` and throws loot to `drop`. A GLB supplies all of that:

- **Geometry** is baked once per kind × faction colour × wreck into a handful of merged meshes: vertex-coloured toon
  and unlit glow meshes (one more of each for a double-sided material), one outline hull, one mesh per `additive…`
  colour and opacity, a set of its own for every moving part, and a face or two per sign. Hundreds of Blender objects
  cost about what a code build does (the Watchtower 16 draw calls, its wreck 10; `npm run check:outposts` prints the count
  for each root).
- **Gameplay data** (`cols`, `hits`, `raid`, `smoke`, `drop`) comes from **empties**, not from the visible meshes.
  Collision is never read from a mesh: draw the building however you like, then place the colliders by hand.

If the file, a kind, or the bake fails, the game falls back to the Kit-built outpost and logs a warning.

## Axes and names

Author in three.js axes (x right, y up, +z forward/gate), as `tools/blender/kit.py` does (`tb()` converts to Blender's
axes and the exporter's +Y-up option converts back). Export with **custom properties on** (`export_extras`).

Scene roots, one empty at the origin per variant, everything else a descendant:

| Root | Meaning |
|---|---|
| `<kind>` | the intact compound (`tower`, ...) |
| `<kind>_wreck` | the same compound with the main building in ruins (the yard's meshes are the intact root's, shared) |

A root may carry the custom property `walkers`: the walking NPCs (`src/outpostWalkers.js`), as JSON text
`{"kind": "person" | "junkbot", "routes": [[[x, z], ...], ...], "stands": [[x, y, z, yaw, scale], ...]}`, each route walked
there and back; each stand someone who keeps their post (a trader behind a counter: standing at x, y, z facing yaw, serving,
`scale` taller to clear the counter). Their look is the owner's (`WALK_LOOK` in `src/outpostLooks.js`).

Blender appends `.001` to duplicate names; the game strips a trailing `.NNN` from material names, but keep node names
unique anyway. Object names are unique across the whole file: the kit names everything `<role>_<kind>_<n>` (gameplay
empties: `col_tower_12_wreck`, `smoke_tower`) or `<kind>_<group>_<material>_<ink in mm>` (meshes:
`tower_yard_style_dark_20`), with `_wreck` on the wreck's. The role is read from the custom property `role` (always set
it), or failing that from the name up to the first `_` or digit.

## Meshes

- Any depth under a root. **One material per mesh** is the convention (a mesh with several works: each material
  becomes its own part, and the checker warns), indexed triangles, `POSITION` + `NORMAL` only. UVs, textures, skins,
  animations and lights are ignored (the checker warns).
- Custom property `ink` (number, metres) on a mesh = outline thickness: a shell pushed out so that every face moves
  out by that much, edges and corners included, like the Kit's outline hull. Absent or 0 = none. It belongs to that
  mesh alone: a mesh parented under an inked one gets no outline of its own.
- Flat colours only. The look is the game's 3-step toon ramp over the material's **base colour**.
- Do not use alpha blending, except on an `additive…` or `glass…` material (see below): anywhere else the checker warns
  and the mesh renders opaque.
- The kit merges parts into one mesh per material, outline and moving part: loose parts inside a mesh are still parts
  to the structure audit. The file is compressed (`npm run optimize:glb`: quantized, meshopt); the game decodes it.

### Materials

The material **name** (a trailing `.NNN` is ignored) picks the treatment; everything else comes from the base colour.

| Name | Treatment |
|---|---|
| `faction…` (`faction`, `faction_cloth`, …) | lit toon in the owning faction's accent colour |
| `faction_glow…` | unlit, in the faction's accent colour |
| `style_<key>…` (`style_body`, `style_dark_2s`, …) | lit toon in the owner's palette colour for that key (`STYLE` in `src/outpostLooks.js`: `body`, `panel`, `dark`, `roof`, `trim`, `glow`, `conc`, `metal`, `hut`, and `livery` and `stripe` for dish heads) |
| `style_glow…`, `style_trim_glow…` | unlit, in the owner's glow or trim colour |
| `glass…` (`glass_9be7ff_45`) | see-through glazing: lit toon, its **alpha** the opacity, double-sided, writes no depth, gets no outline |
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
| `col` | collider | custom property `shape` = `box` \| `cyl` \| `sphere` \| `hcyl` (default `box`); `floor` = 1 makes a box a walking floor (ground to the runner, not an obstacle), `lattice` = 1 marks an open truss's box (the outpost audit skips its top) |
| `hit` | blast box that damages the building | a `box`, as below |
| `raid` | where you stand to raid (intact only) | position |
| `smoke` | where the wreck smoulders; also the building's centre for damage pops | position |
| `drop` | open apron spot where loot lands | position |
| `text` | a sign face (a canvas-texture plane drawn at runtime, so the font can change) | see below |
| `ticker` | a scrolling price screen (`tickerMat` in `src/outpostModels.js`: a tape of quotes on a dark strip) | position and turn (the screen's middle, facing its +z); `w`, `h` in m; `items` = `SYM:+12.5,SYM:-3.1,...` (green up, red down); `rows`; `speed` (tapes a second) |
| `stack` | a stack of the game's standard cargo boxes, with their collider (`settlements.js` cargoStack) | position and turn (the boxes' base); `n` boxes; `factions` = `owner` (the owner's livery, `CARGO_OF`) or the liveries named, comma separated, box by box |

A **box** is an empty (cube display, size 1) whose **scale is the half-extents**; its position is the box's centre. A
collider box keeps any turn (a sloping roof, a fallen slab); a `hit` box only its turn about the vertical. A **cyl** is a
vertical cylinder: radius = scale.x, its axis runs from `y - scale.y` to `y + scale.y` at the node's x/z. An **hcyl** is
a lying cylinder (a Quonset's roof you roll over): radius = scale.x, length = 2 × scale.z along the node's z, turned
about the vertical only. A **sphere** takes its radius from scale.x. A tilt on a cylinder, or an uneven sphere, is
flattened (the checker warns).

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
| `spin` | turns it about its own Y (put the node on the spin axis): custom property `speed` in rad/s (negative: the other way), default 0.6. The node may be turned any way: a clock hand's node has its Y out of the face |

Author an animated part's meshes relative to the node's origin.

A node (empty) with the custom property `only_faction` (comma separated: `vostok`, `spacecom,meridian`) has its meshes
drawn only for those owners: an emblem drawn once per faction, the owner's showing. Apply any non-uniform scale on its parents in Blender: a
turned moving part under a stretched parent cannot be placed correctly (the checker warns).

## Switching it off

On by default for the kinds in `GLB_KINDS`. `?outpostGlb=0` (or `false`, `off`, `no`) in the URL, or
`localStorage['mr-outpost-glb'] = '0'`, gives the code-built outposts; the URL beats the saved setting. A missing or
broken file, kind or wreck quietly gives the code-built outpost. (The file is a separate chunk fetched while the game
starts, so a very slow request delays the start; a failed one never stops it.)

The dev viewer (`/tools/viewer.html?m=outpost&kind=tower`) shows the code-built pick beside the Blender-built one, every
collider drawn, and checks that the two hold the same gameplay data: colliders, hit boxes, raid, smoke, drop, walkers'
routes (`&src=kit|glb|both`, `&wreck=1`, `&cols=0`). `src=glb` shows any kind in the file, whether or not it is in
`GLB_KINDS` yet.

## Rebuilding the file

`tools/blender/build_outposts.py` builds the roots in code with the outpost kit (`tools/blender/outpost_kit.py`: the
game's Kit and the builders' helpers ported, call for call, random streams included), then
`npm run optimize:glb` compresses it:

```
MOONRUNNER_REPO=<repo> python tools/blender/build_outposts.py     # MOONRUNNER_EXPORT=0 builds without writing; OUTPOSTS=tower
npm run optimize:glb
npm run check:outposts
```

Check every build with the structure and style audits (`python3 tools/blender/structure_audit.py
tools/blender/build_outposts.py`, `style_audit.py`; the blender skill). Nothing in CI runs it; `npm run check:outposts`
checks the committed file.

## Adding a kind

1. Port its builder from `src/outpostDrafts.js` into `tools/blender/build_outposts.py` as `build_<kind>(k)`, call for
   call (the kit's helpers have the same names in snake case), with the main building's parts in `with k.group("main"):`
   so the yard is shared with the wreck. Register it in `BUILDERS` with its draft letter.
2. Build, audit (structure and style), compress, `npm run check:outposts -- --kind <name>`.
3. Open `/tools/viewer.html?m=outpost&kind=<name>` (and `&wreck=1`): it should say the gameplay data is the same. A fix
   that moves a collider goes into both builders.
4. Add the kind to `GLB_KINDS` in `src/staticContract.js` and to the list at the top of this file; look at it in the game.
5. Refine it in Blender from then on. A kind whose gameplay data no longer matches its code builder goes in `GLB_REFINED`
   (`src/staticContract.js`: the Trading Kiosk), and the viewer says so instead of flagging it; check its walkers' routes
   against its own colliders.
