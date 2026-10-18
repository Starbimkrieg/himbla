# Moon-Runner model style: the house rules

These rules describe how the models look and hang together. They are worked out from what the builders already do
(`kit.py`, `build_rover.py`, `build_interceptor.py`, `build_apc.py`, `build_crane.py`, `build_gantry.py`, `build_garage.py`,
`build_ships.py`, `build_runner.py`) and from the CHANGELOG entries that explain why models were rebuilt. When a rule and
a builder disagree, the newer rebuild usually wins (the rovers, the interceptor, the cranes, the garage). `SKILL.md` holds
the workflow and the GLB contract; this file holds the art direction.

## Generic DCC rules do not apply

These meshes are built from Python, untextured, flat-coloured per material slot, toon-shaded and inked by the game. The usual
production rules for hand-modelled assets do not apply, and following them makes things worse:

- **No quads-only or no-n-gons rule.** `extrude`, `prism` and the loft caps make n-gons and triangle fans, and that is fine.
  The exporter triangulates and nobody edits the mesh by hand.
- **No UVs, no texel density, no texture baking.** `export()` writes no texcoords (`export_texcoords=False`). Colour comes
  only from the slot, and detail comes only from geometry.
- **No subdivision-ready topology, edge loops or retopology.** Smoothness comes from the segment count and the 38° auto-sharp
  in `kit.mesh()`.
- **No FBX, no PBR maps, no hand-edited `.blend` as the source.** The builder script is the source; a model is rebuilt, never
  patched in the app.

## 1. The toon look

**Material = slot.** Each mesh has one material, named after its slot, and the game swaps in its own `toon()` or `glow()`
material for that slot. To give a part two colours, make two meshes.

| Kind | Slots | Who sets the colour |
|---|---|---|
| Livery | `body`, `stripe` (vehicles, cranes); `trim` (garage, ships); `load`, `stripe`, `label` on a crane's container; `body`, `stripe`, `accent`, `label` under a `cargo` pivot | the vehicle's `color` / `trim` or the faction palette |
| Livery glow | `lens` (rover light bar) | glows in the `stripe` / trim colour |
| Fixed toon | `dark` 0x2a2540, `steel` 0x55607a, `metal` 0x8a87a0, `tire` 0x1d1a29, `white` 0xf3eee4 / 0xe8e4f0, `seat`, `olive`, `wood`, `panel`, `navy`, `red`, `concrete`, `hazard`, `redsafe`, `orange`, `blue`, `tank` | the factory's `*_TOON` map in `src/models.js` |
| Glow | `glass` 0xcfefff, `lamp` 0xfff6a8, `tail` 0xff2a4a, `hot` 0xff9f1c, `window`, `green`, `red` / `blue` (light bars), `plume`, `plumeCore`; the garage's `interior` and `shopfloor` (self-lit so open bays read as a lit workshop) | the factory's `*_GLOW` map |

- **Livery goes only on livery slots.** Never paint a faction's colour into a fixed slot. Recolouring has to work by swapping
  `body` / `stripe` alone.
- **A new slot needs a game entry.** Add it to the factory's TOON or GLOW map (`ROVER_TOON`, `APC_GLOW`, `garageSlot`,
  `craneSlot`...). Without one it draws as magenta (`0xff00ff`, the fallback).
- **`SLOT_COLORS` should match the game's colours,** so the Blender preview tells the truth. They are preview only.
- **Darks are plum, not black.** `dark` 0x2a2540 and `tire` 0x1d1a29 are the deepest colours. Pure black is the ink.
- **Glow slots cast no shadow** (the factories skip them). Use them for things that emit light: lenses, screens, windows, flames.
- **Faces read flat or round, never lumpy.** `kit.mesh()` smooths and then hard-edges creases over 38°. For crisp boxes use
  `cuboid`, `cbox`, `prism` or `extrude`; use `lathe`, `loft` or `tube` for round things. `rbox` / `superquad` with 4 to 6
  segments round is **not** a box: it comes out as an octahedron or lozenge. The crane decks were diamonds for this reason
  (`box()` in `build_crane.py` and `_spr_box` in `spreader.py` fixed them). Keep `rbox` for deliberately soft shapes, with 8
  or more segments round.

## 2. Ink (outlines)

The `ink` custom property is the black shell's thickness in metres. Choose it by the part's size, and copy a sibling part
when in doubt:

| Part | ink | Examples |
|---|---|---|
| Main hull, building shell | 0.06 to 0.08 | `mil_hull` 0.08, `civ_tub` / interceptor `hull` / APC `hull` 0.07, garage `walls` 0.07, `roof` 0.06 |
| Big secondary volumes | 0.04 to 0.06 | turret 0.06, fenders 0.04 to 0.05, tyres 0.05, APC cab 0.06, name board 0.05 |
| Medium fittings | 0.02 to 0.03 | frame rails, bumpers, crates, seats, roll cage, bed walls, door frames, columns |
| Small fittings | 0.008 to 0.015 | lamp cups, mirrors, handles, hatch grips, antenna bases, wipers, hub caps |
| Flush or tiny detail | 0 | stripes, seams, tread blocks, bolts and nuts, louvres, solar cells, decals and lettering, tow hooks, most glow parts |
| Courier (runner) | 0.03 to 0.05; 0.012 for thin, tall fins (`crest_fin`) | the game also thins these as the camera comes close (`inkMatNear`) |

- **Ink-0 details lie flush.** A detail with no ink of its own must sit within about **6 mm** of the inked surface it lies on.
  Otherwise its colour is drawn across the black band where it crosses the silhouette. Lay stripes as thin boxes (8 mm)
  half-sunk into the face (`civ_stripe`, `mil_stripe` in `build_rover.py`), as skins cut from the hull pushed out a hair
  (`keep(loft(grow(HULL, 0.02)))` in `build_interceptor.py`, `band` / `cband` in `build_ships.py`), or sink them with
  `flush()` (`build_runner.py`, MAX_PROUD = 6 mm). If a detail has to stand proud, give it an ink of its own.
  `audit_outline.py` lists the candidates.
- **A part that enters another goes in all the way.** Its base stays inside the host along its whole length; a base that stops
  above the surface shows its own outline as a second line (the crest rebuild in `build_runner.py`).
- **No coplanar overlaps.** Two meshes on one plane z-fight. Offset by at least about 3 mm, or cut a hole. End every builder
  with `audit_coplanar()` (`build_rover.py`, `build_hall.py`, `build_lot.py`); it raises on overlaps above 1 cm². `slab()` in
  `build_crane.py` leaves 1 mm between its pieces so their corners are not welded together.
- **Glowing parts mostly carry no ink.** Give one a thin line (0.01 to 0.02) only when it is a shape of its own that stands out
  (light-bar lenses, lamps, a raked screen).
- **No hidden inner surfaces.** A shell nobody can see still costs triangles and ink (the visor rebuild removed about 450).

## 3. Axes, frames and proportions

- **Authoring frame:** three.js axes (x right, y up, +z forward), metres, origin on the ground in the middle of the
  footprint. `tb()` converts. Doors, noses and cab windows face +z unless the model's header says otherwise (the crane's jib
  points +x).
- **The rover frame,** shared by the civil buggy, the patrol car, the Interceptor and the war-rig, so the vehicle, AI and
  traffic code drive any of them unchanged:
  - wheels at **(±1.85, 0.85, ±1.8)**, radius **0.85**, spun about x (`WX, WY, WZ, WR` in `build_rover.py`)
  - gun pivot at **(0, 3, 0.8)**, a child of the chassis (a searchlight on the buggy, a weapon station on the patrol car)
  - body about 5.6 to 6.4 m long and 2.9 m wide; roof about 2.5 m (patrol car); the seat cushion about 1.6 to 1.75 m up, where
    the runner sits
  - root extras `radius` (3.2; 3.4 for the Interceptor) and `wheelRadius` when it differs from 0.85
- **Other frames are their own and fixed:** the APC has eight wheels at x ±1.72, y 0.62, z ±0.75 / ±2.15, radius 0.62, with
  the hull on a chassis pivot lifted 0.35. The tower crane has a 34 m mast and a 30 m jib. The garage floor is 0.08 up
  (`GARAGE_FLOOR`). Read the header of the builder you are changing before you move a wheel, a pivot or a footprint: game
  code depends on them.
- **Build at frame size; the game scales.** `scale` in `src/vehicles.js` (APC 1.35, Mule 1.2) and the crane's uniform scale for
  small cranes are applied in the game. Do not bake them in.
- **Human scale, so a climber fits:** handrails with a top rail at 1.1 m, a knee rail at 0.55 m, a toe board and posts at most
  1.5 m apart (`railing()` in `build_crane.py`); ladder rungs every 0.3 m, rails about 0.46 m apart, 0.3 m of toe room behind
  and 0.75 m of climbing space in front (`ladder()`); a personnel door about 1.2 × 2.45 m; land-train bays about 7 m wide and
  5.6 m high.
- **Share parts, don't copy them.** Parts used by more than one model live in one module: `spreader.py` (both cranes),
  `decals.py` (`container_doors`, faction marks), `cargo.py` (the land-train's container), `dishkit.py`. The gantry reuses the
  tower crane's trolley and hook block.

## 4. Mechanical plausibility

Every model should work like the real thing, at the level a player can see. Most recent rebuilds were about this.

- **Nothing floats.** Each part rests on, bolts to or hangs from another. The APC's axles run out of an underbody block instead
  of hanging in the air. The garage's fuel lines start inside the tank and enter the wall through a flanged stub. Rover hubs
  sit on the wheel centres and cart wheels on the floor. A knee brace that ended in mid-air was shortened.
- **What a climber uses works.** Ladders reach from the ground or a deck to the next deck and run on 1.1 m above it as grab
  handles. Where a ladder passes a deck there is a hatch, and where it leaves a lattice there is an open doorway. Free deck
  edges are railed, and the railing is open where a walkway leaves. Every cab has a way in. The gantry's cab moved from under
  the girder, where nobody could reach it, to a catwalk off the leg (`build_crane.py`, `build_gantry.py`).
- **What a driver uses works.** There is a seat where the runner sits and a steering wheel where the driver's hands go (the
  traffic driver's hands are posed on the buggy's `civ_wheelRim`). Open cockpits stay open, so the runner is visible (`build_interceptor.py`).
- **Moving parts are built as mechanisms.** A sheave stands in the plane of its rope falls, and trolley wheels run on flanges.
  A hook's saddle sits under its swivel, and a latch closes its throat. Slings end on pad-eye pins, twist-locks sit in the
  corner castings, and a pad-eye is turned into the plane of its sling (`spreader.py`). Moving parts clear their whole run: the
  inner knees were cut back so the trolley could pass.
- **Lunar logic over car logic.** Radiator panels dump heat (the buggy's bonnet), solar canopies supply power, berms and
  bunds protect things. Give each part a reason to be there.
- **Animated parts pivot where they turn:** wheels at the axle, antennas at the base, doors and legs at the hinge. Author them
  at the stated rest pose (legs deployed, gear doors closed, ramp open-flat, sectional doors as their `state`).

## 5. Detail and triangle budgets

Spend triangles on the silhouette and on what reads from the follow camera (7.5 m or more away); skip what doesn't. Measured
sizes from the CHANGELOG:

| Class | Budget | Reference |
|---|---|---|
| Vehicle (rover, Interceptor) | about **11k** triangles each; 150 to 160 KB compressed per vehicle | `rover.glb` (two vehicles, 322 KB), `interceptor.glb` (152 KB) |
| Courier | about 15k | `runner.glb` 15.3k |
| Transit ship | about 25k | shuttle 25.5k |
| Building | 15k to 35k, baked and merged into the place | both garages together 33k (558 KB); a landing pad 8 to 12k with outlines |
| Big set piece | up to about 40k including outlines | a dish station about 40k; a dish head 13.7k plus 4.5k of outline |
| Prop | 2k to 5k | slot cabinet 2.5k plus 0.3k of ink, chandelier 3.2k, bouncer 4.3k |

- **Segment counts that work:** wheels 18 to 20 round, hubs 8 to 16, lamps 10 to 14, tubes and rails 4 to 8, strut `B()` 4,
  bolts 6, cylinders 10 to 12, tread blocks 12 to 16 per wheel. Raise a count only where the curve is on the silhouette.
- **Merge static parts per slot.** Repeated small parts go in one mesh per (slot, parent, ink) with `join()` (tread, bolts,
  cells). For buildings use an accumulator (`Acc` in `build_garage.py` and `build_blackjack.py`). The game freezes and merges
  static parts with the place, so only moving parts cost draw calls of their own.
- **Leave the colliders out of the visible mesh.** Colliders are `col` empties with `shape` and sizes (`build_garage.py`); the
  game never reads collision from what it draws.
- **Report the cost.** A model's CHANGELOG entry gives its triangle count and compressed size, as every recent one does. Print
  the count from the builder (`build_crane.py` does).

## 6. Faction palettes

Liveries are swapped by the game; marks and names sit under one `livery` pivot per faction (extra `faction`), and the game
builds only the one that matches. HUD colour from `FACTIONS` (`src/locations.js`); livery from `LAND_TRAIN_FACTIONS` and
`DISH_FACTIONS` (`src/models.js`); vehicles from `VEHICLES` (`src/vehicles.js`).

| Faction | HUD | Livery body / stripe / accent / label | Its vehicle (`color` / `trim`) | Look |
|---|---|---|---|---|
| SPACECOM | #ffd23f | cream 0xf2ecdc / yellow 0xffd23f / navy 0x2a3a6b / navy | Interceptor cream 0xfff4e0 / yellow | cream and yellow, navy lettering and roundel with a white star; red and blue light bar |
| Vostok | #ff3b5c | slate 0x6b6f78 / red 0xff3b5c / 0x2c2f38 / 0xf3eee4 | APC slate / red | slab-sided, slate and red, a red star on the flanks |
| Kepler | #ff9f1c | orange 0xff9f1c / cream 0xfff4e0 / green 0x6a8f3a / 0x2a2540 | Mule green 0x6a8f3a / orange (Militia Carrier 0x5c8a2e) | civil: the trains orange and cream, the rovers green with orange |
| Meridian | #2ec4ff | cyan 0x2ec4ff / cream 0xfff4e0 / gold 0xffd23f / 0x16385e | Light-Bike cyan / gold | buildings cream with cyan `trim`, navy 0x1b3a8f boards, gold; the globe emblem |
| Daedalus | #c77dff | purple 0xc77dff / cream 0xf3eee4 / 0x4a4660 / 0x2a2540 (dishes) | Skimmer near-black 0x1a1426 / violet | dark-side purple; a delta with an eye for its mark; no vehicle or cargo livery (`MARKED` in `decals.py`) |
| Rustmoon | #7dff3a | rust 0x6a5a48 / acid green 0x7dff3a / 0x2a2540 / 0xf3eee4 (dishes) | War-Rig violet 0x7b2ff7 / acid green | stolen, welded, painted: paint only, no mark |
| Unclaimed | #c9c3d9 | 0xc9c3d9 / 0xfff4e0 / 0x55607a / 0x2a2540 | none | paint only |

## 7. Naming, pivots and roles

- **Root empty** named after the model (`rover_civil`, `rover_military`, `interceptor`, `apc`, `crane`, `garage`,
  `garage_small`, `shuttle`, `freighter`). Its custom properties hold the numbers the game reads (`radius`, `wheelRadius`,
  `drop`, `gearH`, `deckY`...).
- **Object names are unique across the file.** Prefix every name per model (`civ_` / `mil_` in `build_rover.py`, `crane_`,
  `PFX = "garage_"`). Mesh names are camelCase part names (`bullBar`, `lampCup`, `fenderLip`); the game reads the slot and
  the pivot, not the mesh name.
- **A pivot is an empty with a `role`,** placed at the joint and authored at its rest pose. Its meshes are built in its frame.
  The roles in use:

  | Role | Meaning |
  |---|---|
  | `chassis` | everything on a vehicle that is not a wheel or turret |
  | `wheel` | spun about x by ground speed / radius |
  | `gun` / `turret` / `barrel` / `muzzle` | yawed / yawed / pitched about x / an empty where shells leave |
  | `antenna` | a whip at its base; the game lays it back with speed |
  | `flag` | an empty at the pole's tip; the game hangs the cloth |
  | `plume` / `lift` / `exhaust` | a flame along -z / a flame along -y / an empty where smoke puffs |
  | `slew` / `trolley` / `cable` / `hook` / `load` | crane: turned about y / slid / a one-metre rope scaled in y / set to the rope length / what hangs |
  | `cargo` / `livery` | painted with a faction's land-train palette / one faction's marks |
  | `blinker` / `fan` | a blinking aircraft lamp / spun about y (`speed`) |
  | `door` / `fit` / `col` | a bay's door in a `state` / what works in an open bay / a collider (`shape`, sizes) |
  | `leg` / `foot` / `ramp` / `hatch` / `board` | ship gear and ramp (see the `build_ships.py` header) |

- **Renaming a slot, pivot or role is a game change.** Grep `src/` first (see `SKILL.md`).
- **Every builder opens with a header** that states what it builds, the frame, every pivot and role, and which slots take
  livery. Copy the shape of `build_rover.py`'s or `build_interceptor.py`'s header for a new builder, and keep it true when
  you change the model.

## Before you export

1. `audit_coplanar()` passes, and `audit_outline.py` shows nothing new for the courier.
2. The triangle count is inside the class budget.
3. Look at it in `tools/viewer.html?m=<model>` and in the Asset Row, in each livery. Ink lines should be clean, nothing should
   float, and no magenta should show.
