# Collision and ledge grinds

The rules every place follows, worked out on Chimera Downs (October 2026). Trick thrust puts every roof within reach, so
anything solid the runner can get to needs a collider that matches what's drawn, and the top edges of those colliders are
grind rails. `CLAUDE.md` has the short version; this is the long one, with the reasons.

## The physics that sets the rules

- The runner is a 0.9 m sphere (`PHYS.radius`, feet to about 1.8 m). A top counts as walkable when the contact pushes him
  more than 0.55 up (`physics.js`), which is a step of about **0.4 m**. A 0.5 to 0.9 m ledge stops him dead, or bounces him
  off at skating speed.
- The physics stands the runner on the **terrain or a collider**, never on drawn geometry: a paved walk 12 cm over the
  ground with no collider under it leaves his feet 12 cm down in it.
- Colliders are boxes (turned any way: `pitch`, `yaw`, `roll` in `world.colAdd`; `Kit.solidQ` from a kit), upright
  cylinders, spheres and lying cylinders (`hcyl`). They live in one hash with **16 m cells** (`physics.js`; it was 64 m,
  and the Downs paid for hundreds of colliders on every query). The Downs has about 12,300 colliders with its floors; a
  player step there takes 0.1 to 0.25 ms (0.08 ms in the open).
- **Curved places** (`curved` in `locations.js`; the Downs) are drawn flat and bent onto the Moon in 8 m pieces.
  `world.col` cuts any box longer than 8 m into pieces bent at their own middles. A single straight 230 m box sagged
  nearly 2 m off the stand roof at its ends. The straight chords of bent geometry also sag 2 to 3 mm apart, which matters
  for details laid on a surface (below).

## What gets a collider

- **Everything solid the runner can reach**: walls, roofs, towers, canopies, cornices, counters, benches, bales, posts,
  fountains. Roofs count.
- **Not**: seats in rows (the Downs' 1,650), crowds, moving rides, lamp heads, festoons, ropes, lettering, glow and glass,
  thin trims (under 12 cm), beams and tubes.
- **Walking floors** (paving, decks, the track, walks, bay floors, anything up to 0.42 m) collide at their drawn height. A
  kit with `floorCols` set (`k.floorCols = true` inside a place's `settle()` builder) does it at `finish()`
  (`Kit.floorColliders`): every up-facing surface 3 cm to 0.42 m over the ground, rasterized on a 0.5 m grid at its height,
  cells of one height (to the centimetre) merged into boxes, marked `floor`. **Floors are ground, not obstacles**: the physics
  stands you on the highest floor under your feet within 0.45 m (`floorUnder` in `physics.js`) and leaves them out of the
  obstacle contacts, so stepping onto a floor, or across the centimetre steps between its boxes, is the ground rising under
  you; the ground snaps, landings and dive landings work on them as on terrain. (As obstacles, every box edge tilted the
  contact and threw you up a little, a stutter along the boardwalk, and the snaps dragged you to the terrain beneath.) The
  racegoers' walk map passes over them too; on a
  curved place they bend in 16 m pieces, a flat floor sagging under 1 cm over that). At the Downs: 3,600 boxes under
  84,000 m2 of floor, where the feet had stood up to 26 cm down in it. Drawn floors want nothing else.
- **Platforms of 0.42 to 0.9 m** (a portico, a stable's box floor, a ride's platform, a plinth) get **none**: with a 0.4 m
  step they would stop the runner dead where he used to walk across their sunk-in tops. The Blender parts' emitter skips
  every floor and plinth under 0.9 m and 2.5 m across (the floor pass covers those up to 0.42 m). A step-up in the physics,
  or steps and ramps up to them, would lift this rule.
- **Raised details on a surface you stand or grind on** (roof seams, ribs, stripes) are **painted on**: at most 2 cm proud,
  no ink, so they get no collider and never stop a grind. On a curved place make them at least **1.5 cm** proud, or they
  sink into the surface in patches (the bent chords above). They may stand more than the usual 6 mm of an unoutlined detail
  only where they never cross their host's silhouette.

## Where colliders come from

1. **Blender parts write their own.** A part built with `parts(..., solid=True)` (`tools/blender/downs_common.py`, `Acc`)
   writes a `col` empty for each primitive at least 12 cm thick and 1 m long, and `downsKit.bake` places them with the part,
   so they follow the model when it changes:
   - a box, or an extruded rectangle: exact, turned with it;
   - a round upright cylinder (8 sides or more): a cylinder at its narrower radius; a lathe: a stack of cylinders, each as
     wide as its narrower end;
   - any other shape (a gable or arch outline, a hip roof, a faceted or tipped cylinder, `add` shapes): a slab under each
     face, 25 cm thick or the part's own thickness, filled with strips inside faces that aren't rectangles so nothing stands
     in the air over a slope; undersides get none;
   - glow and glass slots, beams, tubes, tori and lettering: none; floors and plinths: none (above).

   Don't make a part solid when one prism carries openings cut into it (the stands' back walls with their way-in doors):
   its colliders would close or miss them, so give it hand colliders. Leave out small parts repeated by the thousand.
   Only the Downs' builders use `downs_common.py` today: give another settlement's Blender kit the same emitter (move it into
   `kit.py` once a second kit needs it) rather than a new scheme. `outposts.glb` keeps its own `col_` contract
   (`docs/outpost-glb.md`).
2. **Code-made geometry has its colliders in code, beside it**: `k.solid`, `k.column`, `k.hcyl`, and `k.solidQ` for turned
   boxes. A flat raked piece (a roof deck from `sheet`) uses `slabBox` (`downsKit.js`): strips across it, the first exactly as
   wide as its first edge and the last as its far edge, so a wedge-shaped bay's front and back edges meet its neighbours' at
   the corners. One box round a wedge sticks out past the corners, and neighbouring edges cross instead of meeting.
3. **Hand colliders over a Blender part** only where the part's own can't do it: openings, or doors too thin to collide
   (the hay barn's box keeps you out through its shut doors). A hand box **stops at what's drawn**: a building's box ends at
   its eaves, never "to the ridge" over a pitched roof, or you stand on air. Once the part has its own colliders, delete a
   hand box that only duplicated them (the Downs' drum pillar and clubhouse tower boxes).

## Ledge grinds

- **On per place**: `LEDGE_PLACES` in `src/rails.js` (only `downs` so far). Its rails are worked out as you come within
  400 m, about 3 ms a frame (`Grinder.ledgeStep`), into their own lookup grid.
- **What's a rail** (`src/ledges.js`): each top edge of a level-topped box (18 degrees of tilt at most), sampled every
  metre, where
  - nothing sits on it (a cap 5 cm thick or more takes the edge over),
  - there's room to ride it (the grind's own clearance ball, 0.45 m at 0.5 m up, hits nothing that would push the rider
    back: a tower beside a parapet, a beam over a canopy),
  - it isn't a wall's foot (just outside and above it is clear),
  - it isn't a seam (just outside and below it is clear: no neighbour carries the surface on),
  - and it's at least 0.3 m off the ground.

  Stretches join across a gap of up to 0.6 m along the rail (never 0.2 m sideways or 0.12 m up or down: a step onto a
  neighbouring edge) and a turn of up to 30 degrees, so a ring of straight fence bays or a curved arcade is one rail and a
  building's corner is an end. Rails 2.5 m or longer are kept; the same edge twice (within 5 cm) is kept once.
- **Grabbing a ledge**: only on skates, from the air, heading along it (within about 40 degrees), within 1.5 m; no
  scooping up at a tip and no hop on from the side. Running along a roof, landing across an edge or stepping off a counter
  never snags. Snake rocks and crater rims keep their own, looser rules.
- **Riding**: anything that pushes the rider mostly up (0.6 or more) is ridden over (the joints of a long roof's 8 m
  pieces); posts, walls and rocks knock you off. Under 5 m/s (`GRIND_MIN`) you lose your balance: you topple off, the style
  run is lost, and you ragdoll where ragdolls are allowed. It scores as LEDGE GRIND, a grind like the rocks' and rims'.
- **Building for it**: an edge people should grind needs a collider top that is the drawn top and a clean run along it.
  Don't let trims, ribs or a neighbour's overhang cross it; keep a cap one piece along the run; make pieces that run end to
  end meet within 0.6 m and in line.

## Checklist for a place

1. **Tag its builders** (`k.tag`, as `downsWorld.js` does with `as(name, f)`), so the audits name the builder and part
   instead of `(untagged)`.
2. `PLACE=<id> node tools/downs-audit.mjs coverage`: solid surface with no collider, by part. Fix it from the list above
   (Blender parts `solid=True`, then rebuild and `npm run optimize:glb`; code colliders; hand boxes).
3. `floating`: no collider top in the air, hand-placed ones included.
4. `k.floorCols = true` in the place's `settle()` builder, then `sunk`: drawn floor standing over what holds the feet up
   (should be only the 0.42 to 0.9 m platforms, and seat tops under 1 m, which it also lists).
5. `blocked`: walk-height ground the parts' new colliders take. Only real obstacles should be listed, never a doorway or a
   passage. (`blocked` and `floating` need a place built with `settle()`.)
6. Add the place to `LEDGE_PLACES`, then `rails`: every rail 20 m or longer should ride end to end. Fix what throws you off.
7. In the game: walk the floors (feet on them), drop onto the roofs (you should land on them), grind a few edges, take a screenshot, and check that the
   Asset Row still builds (the `blender` skill has the check).
8. Put the numbers in CHANGELOG.md, and keep this file in step with any rule you change.

Where they stand: the Downs has about 4% of its solid surface bare (its seats), nothing floating, 542 m2 of floor sunk
(the 0.42 to 0.9 m platforms) and 138 of 138 long rails riding end to end. Meridian, before any work: 9.9% bare
(untagged), and 20 of 20 long rails ride.

## Files

`src/physics.js` (colliders, the step), `src/world.js` (`col`, `colAdd`: placing and bending), `src/outpostModels.js`
(`Kit.solid`, `solidQ`, `column`, `floorColliders`), `src/downsKit.js` (`bake`, `slabBox`), `tools/blender/downs_common.py` (`Acc`: colliders
from the geometry), `src/ledges.js` (rails from colliders), `src/rails.js` (`Grinder`: grabbing, riding, `LEDGE_PLACES`,
`GRIND_MIN`), `tools/downs-audit.mjs` (`coverage`, `blocked`, `floating`, `sunk`, `rails`; `PLACE=`).
