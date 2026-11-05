---
name: blender
description: Build, change, compress and check the game's Blender-made models (src/assets/*.glb, idles.json) with headless bpy, the structure rules every model must hold to (supports, tilts, walls meeting roofs, fixings), and the GLB contract the game relies on. Use for any edit under tools/blender or any .glb in src/assets, before writing the code. A commit that adds, renames, removes or visibly changes a model also updates the Asset Row (the dev showroom of every asset): see "Keep the Asset Row in step".
---

# Blender models

## Design rules

The house style is in [style.md](style.md). It covers slots and colours, ink thickness, the shared frames (the rover's wheels
and gun pivot), mechanical plausibility, triangle budgets by model class, faction palettes, and naming and pivot roles.
**Read it before you add a model or builder, or make a visible change to one:** a new part, a rebuild, a new livery or
slot, a resized frame. Also read it when you are unsure of an ink value or a budget. A fix that touches only the build
pipeline, the export or a number the game reads does not need it. Generic DCC rules (quads only, no n-gons, UVs, texel
density) do not apply to these code-built, untextured, toon-shaded meshes.

## Model structure (every model, every build)

A model has to hold together: everything stands on, hangs from or is fixed to something, and nothing passes through
what it should meet. Work each support out from the thing it holds; never type a height by eye.

- **Supports reach their load.** Every post, strut, leg, chain or bracket ends on the part it carries. Cut it to that part's
  underside at the support's own x and z, computed from the part's centre, tilt and thickness (`solar_array`, `feed_bunk`
  in `tools/blender/zbornak_kit.py`). A support never stops short of its load, and never pokes through it.
- **Tilts: +θ about x lowers the +z end** (y' = y cos θ − z sin θ). Before placing anything against a tilted part, work out
  from this which end is high. Put panels on a roof at the roof's own slope, on the slab's top surface (its line plus
  thickness ÷ cos θ). Solar faces +z, the place's sunward side.
- **Walls meet roofs.** Wall tops and gable edges follow the roof's underside line. Leave no gap (a dark wedge) and
  nothing through the roof. A roof stops at a neighbouring building's wall, not inside it.
- **Signs and lamps are fixed.** A board sits on a wall face or hangs on chains under a beam, clear of the roof's edge.
  A lamp has a bracket or a cord. Nothing on a wall floats off it: put it within 2 cm of the face.
- **Openings stay open.** Trim, wainscots, rails and lips stop at doorways and gates. A rail stops at a gate's opening,
  with a post each side.
- **Bars are straight.** Build a straight member with `bm` (two points), not a curved path. `kit.tube` carries each ring's
  frame along the path (parallel transport), so paths don't twist; keep it that way.
- **Walks meet what they join.** A walk ends square on a platform's edge, or runs under a round platform's top with its
  kerbs stopped at the rim (`path_ribbon(trim=...)`). It curves smoothly (a cubic, not a kinked polyline), and nothing
  (lamps, posts) stands on it.
- **Contents sit in their containers,** and any glow ring or field floats inside what holds it. Anything meant to float
  (a hologram, a levitated sphere) goes in a group whose name ends in `_float`.
- **Storage crates** are `cargo_unit("box")` (`tools/blender/cargo.py`) in the owner's livery, never ad-hoc boxes (places skill).
- **A place model** (anything the runner can reach) also follows the places skill: colliders, floors, painted-on details.

**Check it, every build:** `python3 tools/blender/structure_audit.py tools/blender/build_<name>.py` builds the model
without exporting it and reports what is floating, the bars with loose ends, the bars passing through a solid part, and
slabs cutting through slabs, each with where it is (`build_zbornak_lab.py` runs it with `STRUCT_AUDIT=1`; on a whole place
it takes a minute or so). Read every finding. Fix it, or make it deliberate (`_float`) and say why. Then look at each
changed part in the running game (playtest skill: free cam, close, from two sides).
`python3 tools/blender/test_structure_audit.py` checks the audit itself.

## Setup

`tools/setup-blender.sh` installs `bpy==5.2.2` (Python 3.13; about 30 s, 1 GB) and is a no-op when present. The
SessionStart hook runs it; run it by hand if `python3 -c "import bpy"` fails.

## Build

Every builder is `tools/blender/build_<name>.py`, authored in three.js axes (x right, y up, +z forward) and
converted by `kit.py`'s `tb()`; the exporter's +Y-up option converts back. Each execs `kit.py` (shared helpers:
`mesh`, `material`, `export`...) and some also `decals.py`.

```bash
MOONRUNNER_REPO=. python3 tools/blender/build_crane.py    # -> src/assets/crane.glb
MOONRUNNER_REPO=. python3 tools/blender/build_idles.py    # -> src/assets/idles.json
```

Each run takes 1 to 3 s. Builders: runner, idles, ships, skimmer, warrig (with `warrig_kit.py`, whose `clash_check()` and `float_check()` find parts cutting through each other or hanging free), rover, interceptor, apc, landtrain, crane, garage, slots, casino, blackjack, claw, duck, dish,
outposts, hall, lot, power, habitat (with `habitat_kit.py`), chimera (the chimera kit: about 6 minutes, it remeshes every part; `CHIMERA_ONLY=car,mite CHIMERA_OUT=<file>` builds some kinds to look at; a full build re-rolls every part's random details, so to change a few parts build them with `CHIMERA_PARTS=legs_mite_0,... CHIMERA_OUT=<file>` and put them in with `tools/splice-chimera.mjs`, which keeps the rest of the kit as it was), the ILMB's other wings (hydroponics, labs, hangar, relay; they and habitat_kit share `wing_kit.py`) and the Chimera Downs' ten (`build_downs_stand`, `_club`, `_course`, `_stalls`, `_arcade`, `_screen`, `_fair`, `_stable`, `_crowd`, `_dome`, which share `downs_common.py`). In the Blender app they run with `exec(open(r"<repo>/tools/blender/build_x.py").read())`.

## After a build

1. `npm run optimize:glb` for the compressed models (ships, skimmer, warrig, rover, interceptor, apc, landtrain, crane, garage, slots, casino, blackjack, claw, duck, dish, hall, lot, power, habitat, hydroponics, labs, hangar, relay, the `downs-*` files, chimera).
   `runner.glb` and `outposts.glb` stay plain. A build overwrites a compressed file with a plain one, so a
   model you did not change shows as modified if you rebuilt it: `git checkout` it.
2. `npm run check:outposts` after touching outposts.
   `python3 tools/blender/style_audit.py tools/blender/build_<name>.py` checks the model against the house style
   (`style.py` holds the numbers: palette, ink by part size, triangle budgets, the glow slots that get a halo): ink too
   heavy or far off its size class, big parts with no ink, pure blacks, parts the export left without weighted normals or
   toon attributes, and per model its triangles and which glow slots will halo. Read each finding; some are deliberate.
   Run the structure audit on what you built (Model structure, above). A hook reminds you of these steps after each build
   (`tools/claude-hooks.mjs`).
3. Check the diff touches only the models you meant to change. `runner.glb` can differ by a few bytes between
   runs; that is not a change.
4. Update the source map in `docs/reference.md` if a model or builder was added or renamed.
5. Update the Asset Row (next section), in the same commit as the model.

## Keep the Asset Row in step

The Asset Row (dev menu F8 -> Full cheat menu -> Teleport -> option 1) stands every asset in the game side by side, and it is where
models get looked at and compared. A model that is not in it cannot be reviewed there. So **a commit that adds, renames, removes or
visibly changes a model also updates the Row**: a new `tools/blender/build_*.py`, a new or changed `.glb` or texture in `src/assets`, or
a changed shape, size, variant or part list.

1. **Find how the game builds the model.** The `GLB` map at the top of `src/models.js` and the exported factory that wraps the file
   (`hovercar.glb` -> `makeHoverCar`, and so on), or the module that loads it (`winch.js` loads `winch.glb`). The Row calls the same
   factories, so a model the game can draw can be drawn there.
2. **Add an item beside its siblings.** The catalogue is `src/assetRowItems/`: `characters-*.js` (runner, people, creatures),
   `props-*.js` (markers, weapons and effects, nature, secrets), `vehicles.js` (ground vehicles, ships), `buildings.js` (the parts
   settlements are made of), `places.js` (whole places). The item format is documented at the top of `index.js`; copy a neighbour. In short:
   a unique `id` (`group.name`), a short upper-case `label`, `w` and `d` (the footprint in metres, right to within a few metres: the layout
   is fixed before anything is built), and `make({ game, moon })`, which returns `{ root }` standing on y = 0 with an identity transform.
3. **Keep `make` safe.** Build with the pure model factory, never through Garage, Traffic, Enemies or Missions. Show it static (wheels as
   built, gear down, no physics; cheap cosmetic updates only). Do not touch the Moon, the player or the game's registries, and be repeatable:
   it is called each time someone walks up and is let go of when they leave. Add `dispose()` for anything beyond the geometry and
   materials under `root`, and `cols: []` if it should have no colliders.
4. **Variants** (faction liveries, outfits, sizes) go in one item that shows each, as `lineUp()` (`common.js`) and `brick()`
   (`vehicles.js`) do, unless the variants are very large. A model that is also part of a bigger item (inside a place, say) still gets its
   own item if you would want to look at it alone.
5. **Changed or removed models.** If a model changed size, update its `w` and `d`. If it was renamed or removed, rename or remove its
   item. Ids stay unique.
6. **Look at it.** `npm run dev`, open the Row, press `F` at the plaza terminal (or the one at the section's start) to jump to the section.
   The item should stand on the floor, have its name board, and not show a red `DID NOT BUILD` board; compare it with how the game draws it.
7. **Keep the text in step.** The Asset Row entry in `docs/reference.md` states how many items and sections there are: update it if that changes.
   Add the item to the CHANGELOG entry for the model.

A headless check that every item still builds, and that none throws while it is on screen, works in a cloud session (Chromium and
Playwright are installed there). Start the dev server, open it with a `page.on('pageerror', ...)` listener, wait for
`window.game.state === 'title'`, call `window.game.startPlay()`, wait a few seconds, then run this and expect `[]` and no page errors.
The pause per item matters: an item's `update` hook only runs on frames, so an error in it shows up only if frames are allowed to run.

```js
await page.evaluate(async () => {
  const { AssetRow } = await import('/src/assetRow.js');
  const g = window.game, row = (g.assetRow ||= new AssetRow(g));
  row.start();
  const V = g.player.pos.constructor, bad = [];
  for (const e of row.items) {
    g.player.respawn(new V(e.x, 1.5, e.z + e.d / 2 + 20), new V(0, 0, -1));
    row.stream(1e9);                                // builds what is near the player
    await new Promise((r) => setTimeout(r, 30));    // lets a few frames run its update hook
    if (e.state !== 'on' || e.failed) bad.push(e.it.id);
  }
  row.exit();
  return bad;                                       // [] when every item built
});
```

## The GLB contract (what the game reads)

- **Material name = slot** (runner: suit, accent, helmet, visor, dark, metal, glow, skate, scarf, collar, lens,
  glint). The game swaps in its own toon materials per slot, which is how faction outfits recolour things. One
  material per mesh. `kit.mesh(name, geo, slot, parent, ink=...)` sets this up.
- **Custom property `ink`** = outline thickness in metres (0 = none); `slot` is also stored. Export with custom
  properties on (`export_extras`).
- **Pivot empties** are the animated parts (runner: legL, legR, shinL, shinR (shins, on the knees, children of the leg pivots), torso, head, armL, armR, foreL, foreR (forearms, on the elbows, children of the arm pivots), scarfLinks). The runner's suit is skinned (`runner_skin.py`): its meshes sit under a `skin` pivot at the body's origin, each vertex's four pivots and weights as point attributes `_SKJ0..3` / `_SKW0..3` (indices into `torso, legL, shinL, legR, shinR, armL, foreL, armR, foreR`); `makeRunner` binds them to the pivots as bones. `padL`, `padR`, `band`, `crest` and `antenna` are outfit extras: baked apart from the always-worn parts and hung on by `cosmetics.js` only when an outfit asks (`runnerExtra` in `models.js`). Geometry is
  read in its pivot's frame. Vehicles have named pivots for wheels, turret, barrel, gear and so on; check the
  builder and `src/models.js` for the names before renaming anything.
- **Colliders** are empties with role `col` (Chimera Downs parts write them from their own primitives with `parts(..., solid=True)`:
  `docs/downs-layouts.md`, Colliders) or named `col.*` (outposts: `cols`, `hits`, `raid`, `smoke`, `drop`), never read from
  visible meshes. Full outpost contract, with its naming rules: `docs/outpost-glb.md`.
- Object names are unique across a file; Blender's `.001` suffixes are stripped from material names only.
- Renaming a slot, pivot or collider is a game-code change too: grep `src/` for the name.

## Outlines

Every inked part is drawn with a black shell round it (the `ink` custom property is how far out, in metres). Two things follow:
- A detail with `ink` 0 (a stripe, a trim ring) that sticks out of an inked part by more than a few millimetres has its colour drawn across
  that part's black band at its silhouette. Keep such details within about 6 mm of the surface (`flush()` in `build_runner.py` sinks the
  stripes), or give them an ink of their own. `python3 tools/blender/audit_outline.py` lists the candidates. The bodies are low-poly
  lathes, so a flat ribbon closer than ~6 mm to the nearest vertex surface dips under the facets.
- A part that enters another (the crest into the helmet) must have its base INSIDE it all along its length: a base that stops above the
  surface shows its own outline under it as a second line.
- The courier's shells are thinned with the camera's distance (`inkMatNear` in `src/toon.js`; full thickness from 7 m). Anything built the
  baked way (`bakeRunnerParts`) gets that for free.

## Not covered

Rendering previews from headless Blender is untried. To look at a model, use `tools/viewer.html` (three.js, `?m=runner&outfit=...` for the courier), the game's Asset Row, or the playtest skill. Screenshots from headless Chromium work (swiftshader, a few seconds a frame).
