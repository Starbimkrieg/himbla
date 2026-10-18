# Courier Light-Bike: two redesign proposals

![The two proposals: side, front and rear views, with the new trail](courier_proposals.jpg)

Both are built from code in Blender by `tools/blender/build_courier.py` (`VARIANT = "a"` or `"b"`) and exported here as
`courier_a.glb` / `courier_b.glb`. **The game still uses the primitive-built `makeLightBike` in `src/models.js`**; nothing
below is wired in until one is chosen. `tools/blender/preview_courier.py` rebuilds both and re-renders this sheet
(Cycles on the CPU, `pip install bpy pillow`; the runner is the game's own `runner.glb`, posed as a stand-in).

## What changed from the current bike (both)

- **No upper wheel wells.** The shell no longer arches over the wheels. It stops short of each tyre and is scooped to
  it (a 0.08 m gap), so the nose and tail cup the wheel without covering it. A glow arc runs round each scoop, in place of
  the old glowing well arcs.
- **Chunky wheels at the front and back.** 0.78 m outside radius, tyres 0.46 m (A) / 0.54 m (B) wide, still hubless with a
  glowing ring on each face and six glowing spokes. Slim forks and a swingarm carry them, beside the tyre.
- **A sleek, smooth body.** One lofted shell, smooth from nose to tail (the old bike's separate hump and raised side plates are gone),
  with thin lines laid on its skin: a cyan shoulder line, a gold pin-stripe and a cyan belly line, over a flush dark side
  panel. A spine light on top.
- **Saddle bags,** a pair, one each side, in their own `bag` slot (the trim colour as a flat toon, not a glow) so they read
  as luggage against the dark shell. `bag` is the one slot the game has no entry for yet.
- **A proper windscreen,** mounted on the nose cowl in front of the bars (the old canopy sat over them and looked wonky).
- **8.3k triangles (A) / 8.1k (B)**, plus 5.3k / 5.1k drawn again for the outline: inside the house budget of about 11k for a
  vehicle (`style.md`). 298 / 292 KB as exported, 118 / 121 KB compressed (`npm run optimize:glb`; the files here are plain so any
  viewer opens them). Both pass `audit_coplanar` (no surfaces that would z-fight). Ink-0 details (the glow lines, rim rings,
  spokes) stand at most 6 mm off the surface they lie on, as the outline rules ask; the straps stand 12 mm off and have ink of
  their own.

## A: Slipstream

Long, low and pointed. A tall, raked sport windscreen on the nose with a glowing edge; tall teardrop bags that tuck in
beside the rear wheel, with a gold strap and clasp and a tail lamp; a racing crouch. Keeps today's seat and pose almost
exactly (`seat` 1.42, `seatZ` -0.88 stay as they are).

## B: Parcel Runner

Rounder and friendlier, more of a delivery bike: a fatter shell, a tall wrap-around bubble visor, a round headlamp in the
nose, wider tyres, and square flapped panniers slung low either side of the seat with a gold strap and buckle. The seat
sits further forward and the rider sits more upright: torso lean 0.45 (now 0.95), legs 1.25 (now 1.05), arms 0.55
(now 0.75), foot-pegs moved forward. Suggested `seat: 1.40, seatZ: -0.66`. (The pose is free to change with the bike;
the renders use these numbers.)

## If one is picked: wiring it in

Same pattern as the skimmer and APC: build to `src/assets/lightbike.glb`, run `npm run optimize:glb` on it, load it in
`src/models.js`, and have `makeLightBike` return `{ root, chassis, wheels, gun, trailFrom, trailColor }` as now. Then update
the Asset Row's light-bike item (`src/assetRowItems/vehicles.js`), as `.claude/skills/blender/SKILL.md` asks of any model change.
The GLB already carries what the game reads:

- **Pivots** (empties with a `role`): `chassis`; two `wheel`, spun about x; `trail`, the empty the light trail streams from
  (it replaces `trailFrom`). The rider's hip is in the root's `seat` extra, in the bike's own frame.
- **One material a mesh, named for its slot.** Fixed toon: `navy panel dark metal seat tire`. Glow: `glass lamp tail`, and the
  two livery glows `stripe` (the bike's colour) and `trim` (the gold), which are the old bike's `glowA` and `glowB`. New:
  `bag` (the saddle bags, the trim colour as a flat toon) needs an entry in the factory's slot map, or it draws magenta.
- **`ink`** on every mesh, by part size as `style.md` lists.

## The light trail (changed in the game now, whichever bike is picked)

`LightTrail` in `src/models.js`, used by the Courier and the Asset Row:

| | before | now |
|---|---|---|
| life | 1 s | **4 s** |
| wall height | 1.0 m | **1.5 m** (shrinks to 45% as it ages) |
| thickness | a single ribbon, invisible edge-on | the wall **plus a 0.6 m glowing strip on the ground** under it (narrowing as it ages), so it has body from any angle |
| fade | `k^2`: dark in about half the life | `k (2 - k)`: holds bright, eases away at the end |
| points | 64 at 0.3 m (19 m of trail at top speed) | **256 at 0.45 m (115 m), so a full 4 s at 34 m/s** |

Checked in Node against three.js 0.186 over a 6 s weaving ride at 34 m/s and a stop: all 4 s of it kept (at most 241 of
256 points), no NaNs, the strip 0.58 m wide and the wall 1.44 m tall, and it empties and hides 4 s after the bike stops.
The renders above draw the new trail as a mock-up (a wall and a strip fading over 10 m); they are not the game's shader.
