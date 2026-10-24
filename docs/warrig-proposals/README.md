# Rustmoon War-Rig: two redesign proposals

The Rustmoon War-Rig (renamed from "Rustmoon Scrapjaw War-Rig") is the pirates' truck: the one they hunt you in, and the
one Rustmoon gives you as a reward (`VEHICLES.warrig`). Today it is a low scrap buggy with a spiked plow, an open seat and
a twin gun that only the AI swings (`tools/blender/build_warrig.py`).

![The current War-Rig: hero, rear, side, night](current_sheet.jpg)

**A, FURNACE, is the favourite** and has had a revision round (below). B stays here as the alternative.

## The brief

A Mad-Max monster truck, sci-fi and lunar, that looks like nothing else in the game:

- a **10-round-burst spray machine gun over the cab**, worked by a **pirate gunner** who aims where you aim
- an **asymmetric, claustrophobic cockpit**: heavy armour, tiny thick viewports behind crossbar cages, no clean centred glass
- **overkill lights**: mismatched LED bars, searchlights, infrared laser sights, for hunting in the shadow zones
- **exaggerated suspension**, tall and wide, for big low-gravity jumps over craters without flipping
- **aggressive, chunky tread** to claw through the regolith
- **kitbashed** industrial greebles, tubes and bolts; stolen, rigged-together parts
- from the reference sheet: an **exposed fusion core or MHD drive** (plasma conduits, cooling coils, fuel injectors spitting
  ion-blue sparks), **comms arrays and sensor spikes** (dishes, antenna needles, a stolen military target-lock pod),
  **RCS thrusters** to turn it in the air, and **sun-bleached paint and frayed MLI blankets instead of rust** (no oxygen,
  so no iron oxide)

Both are built from code in Blender (`tools/blender/proposals/warrig_a.py`, `warrig_b.py`, sharing `warrig_kit.py`) and
rendered by `tools/blender/proposals/preview_warrig.py` at the game's 1.35 scale. The plain GLBs are here (`warrig_a.glb`,
`warrig_b.glb`) for any viewer, e.g. `tools/viewer.html`. The gunner in the renders is the game's courier in the Rustmoon
pirate colours, hung on the rig's `crew` point and posed by hand.

## A: FURNACE (long-nose 4x4, the reactor in the hood)

![A: hero, rear, side, close](a_sheet.jpg)

- **Running gear:** two solid axles on trailing links, each corner hung from one long coilover inside its own hoop (two
  posts, a top bar and a brace on an outrigger from the frame), so the shocks stand clear beside the body. Bump stops
  under the rails. Balloon tyres 2.8 m across in the game with **thick rubber lugs**: a chevron block on the crown and a
  block wrapping each shoulder, by turns from either side, and chewed up: some torn off to a stub, some half gone, some
  worn low. Beadlock hubs (a clamp ring of bolts, a cap with lug nuts); spiked hubs up front, for ramming.
- **The fusion bay:** the hood is open. A stolen tokamak sits in it on a cradle: a ring of ion-blue plasma inside eight
  copper field coils round a central solenoid, under a roll cage. Three open injector valves (red hand wheels) between the
  coils spit blue sparks into the ring. Copper cooling coils run to radiator fin stacks on both cheeks; two glowing plasma
  conduits run under the ring into the cab.
- **Cockpit:** a tall bunker set off to the left. The driver's two mismatched slits sit high in the glacis, sunk in heavy
  frames behind crossbar cages, and look out over the reactor cage. Angle iron on the corners, ribs on the back wall, a
  green LED strip along the brow.
- **The door** is on the left: an armour leaf in a heavy frame, three hinges, a lever latch, its own caged slit, a grab
  handle, two steps under it, a wing mirror on the pillar.
- **The utility shelf** is on the right: a pipe rack bolted to the bunker with three decks, two strapped coolant tanks
  piped into the bay, a toolbox, a coiled hose, spare canisters, an extinguisher, a louvred vent box, the target-lock pod
  and a small searchlight on top, and **a full-height ladder** on its back end from below the frame to grab rails over the
  roof edge.
- **Gun:** a ring mount on the roof, a **standing gunner** behind a drum-fed **five-barrel rotary** (two turns of the
  cluster is the burst), a notched salvage-plate shield bolted to two arms with a slot to look through, an IR laser sight.
- **Lights:** a brow rack with a long and a short LED bar, a big caged searchlight on the left pillar, a small one on the
  shelf, three mismatched pod lamps on the bull bar.
- **Front:** a ram of bleached plate with punched vents, a winch with its hook, ramming teeth; RCS quads on the frame ends.
- **Back:** two He-3 tanks under frayed MLI blankets with silver patches, a relay dish on a mast, three antenna needles on
  the left sideboard, the flag on the back corner, a rear bumper with two ramming spikes, RCS quads on the frame ends.

### What changed in the revision round

- **No weld beads** (they cost triangles and didn't pay off).
- **No stray spikes**: the turret's and the ram's side spikes are gone, and the radar dish's centre spike. What is left
  is for ramming: the teeth on the ram, two on the rear bumper, the front hub spikes.
- **The flag** sits on its own pole at the back-left corner with nothing behind it, so it can stream back. The game hangs
  the same waving cloth on it as on the other vehicles (`makeWaveFlag` in `src/models.js`, driven by speed through the
  model's `anim`): limp at rest, flying level and rippling at speed. The renders use that cloth, ported vertex for vertex,
  posed at 24 m/s.
- **Nothing cuts through anything.** The builder ends with `clash_check()` (`warrig_kit.py`), which tests every part
  against every other for intersecting triangles, and swings the turret round (every 30 degrees, barrel at both stops)
  against the rest. It found the old shocks through the radiator fins and bed sideboards, the bed tanks through the cab's
  back wall, the antenna needles in the tanks, the target-lock pod and the LED bars in the gun's sweep, the rear RCS arms
  through the bumper. All fixed; the parts that are meant to meet (a link into its rail, a pipe into what it feeds) are
  listed in the builder.
- **The driver can see:** the bunker is 0.6 m taller (the roof at 4.25, 5.7 m in the game) and the slits sit over the
  reactor cage; the tokamak sits 0.1 m lower and its cage under the sight line.
- **Less broken:** a whole relay dish (rolled rim, four struts, a drive housing, a patch plate) instead of the torn one;
  a clean shield plate; tidier blankets.
- **RCS quads** are lander-style pods on arms off the four frame ends: an octagonal housing on a heat-shield plate, four
  bells on collars (up, down, fore, aft), a domed cap with a status LED, copper propellant lines back along the rail.
- **A real door** on the side without the tanks, and the **ladder and shelf** on the tank side (above).
- **Colour:** the bunker is primer with bleached and bare-metal plates; only the door and a ram patch are painted, in
  sun-faded violet. The faction's violet and green only glow: the viewport slits, the brow strip, the ring's LED ring, the
  RCS lights, the gun shield's slot, and a violet **underglow** under the frame (a new livery glow slot).
- **Tyres:** chunky, chewed rubber lugs instead of scrap paddles (above).

## B: CRATERCRAB (six-wheeled cab-forward, the drive on its back)

![B: hero, rear, side, close](b_sheet.jpg)

A new silhouette for the game: a six-legged crawler. (It shares A's kit, so it has the new tyres and no welds too, but it
has not had A's revision round.)

- **Running gear:** six wheels, each on its own swing arm (a lower wishbone and an upper link to an upright) with a tall
  coilover slanting in to a shoulder tower on the hull. It stands on six "crab legs" with a track wider than it is tall
  (about 7.8 m in the game), so it is very hard to flip.
- **Cockpit:** cab-forward. A pillbox right of centre with a row of three tiny round viewports behind crossbar cages, a
  slit on its flank, a periscope, three sensor spikes, a hatch and a frayed MLI blanket on the roof. Left of it, a low
  armoured bow.
- **The light crown:** a pipe frame on the bow carrying one huge searchlight, two smaller ones at different angles, three
  LED bars (one standing on end) and a stolen military target-lock pod with an IR laser. A cow-catcher of scrap blades and
  teeth leads.
- **Gun:** a pedestal tower mid-ship. The **gunner sits in a pipe-cage basket** behind a **ten-barrel volley gun** (two
  rows of five: the 10-round burst is one shot from each barrel), with a box magazine, a laser sight and a scope.
- **The MHD drive, open to the sky:** an ion-blue plasma channel under copper electrode bars, between two magnet blocks
  wound with copper racetrack coils, cooling coils on the feed lines, frayed MLI over the blocks' fronts, two big radiator
  fins in a V, and a magnetic nozzle at the tail spitting sparks.
- **Back:** a torn radar dish on a mast, three antenna needles, the flag, RCS quads at the corners.

## At night

| A, lights on | B, lights on |
|---|---|
| ![](a_night.jpg) | ![](b_night.jpg) |

The searchlights are `spot` empties in the GLB (position, `aim`, size), so the game can hang real spotlights on them if
we want the rigs to light the ground in the shadow zones. The renders do exactly that.

## What both share

- **Slots.** Livery: `body` (painted panels; shown here sun-faded, 0x655682), `stripe`, `lens` (glows in the trim
  colour) and `underglow` (glows in the body colour). Fixed: `dark`, `steel`, `metal`, `tire`, `bleach` (sun-bleached
  plate), `primer`, `copper`, `mli` (gold foil), `foil` (silver), `bone`, `red`, `tank`. Glows: `lamp`, `led`, `plasma`,
  `ion`, `laser`, `beacon`. No rust slot, by the brief. The new slots need entries in `makeWarRig`'s palette when one goes
  in.
- **No sculpted welds.** The brief's dynamic-topology sculpting does not fit this pipeline: the models are rebuilt from
  code each time (a sculpt would be lost on the next build, or would have to become a hand-kept `.blend`), and dyntopo
  makes dense meshes, tens of thousands of triangles per seam. A first pass built bead geometry along the plate edges
  instead; it was dropped in the revision round.
- **The gun works like the APC's turret** (`vehicles.js aimTurret` / `turretFire`): `turret` yaws, `barrel` pitches, `muzzle`
  marks where rounds leave. Both rigs add a **`crew` empty** on the turret where the pirate stands (A) or sits (B, `pose`
  extra), so the gunner turns and aims with the gun: when you aim, the turret follows your camera and the gunner with it.
- **The driver rides inside** the armoured cab (not drawn, like the APC); only the gunner shows.

## Numbers

| | A FURNACE | B CRATERCRAB |
|---|---|---|
| Triangles | 21.6k (17.5k of them inked) | 18.6k (15.4k inked) |
| Wheels | 4, radius 1.05 (1.42 m in the game) | 6, radius 0.95 (1.28 m in the game) |
| Length × width (game scale) | about 9.5 m × 7.1 m | about 10 m × 7.8 m |
| Height (game scale) | about 8.1 m to the gunner's head (cab roof 5.7 m) | about 6.5 m to the cage roof |

Both are well over the house budget for a vehicle (11k, `.claude/skills/blender/style.md`); that is accepted for the
War-Rig. The tyres are the biggest single cost (about 1.6k triangles each on A). A passes `audit_flips` and
`clash_check`; B passes `audit_flips`.

## What going in would take

1. Move A's builder to `tools/blender/build_warrig.py` (it already writes the same root name `warrig`); add its new slots
   to `makeWarRig` in `src/models.js`, and read its turret, barrel, muzzle, crew, spot and flag empties. The flag cloth
   (`makeWaveFlag`) moves from its hard-coded spot to the `flag` empty, `w` x `h` from the empty.
2. `VEHICLES.warrig`: `turret: true`, `hideRider: true`, and a burst fire mode (10 rounds, then a cooldown) instead of the
   APC's single shell; a pirate (`makeRunner` with `FOES.rustmoon.look`) placed on the `crew` empty, posed as in the
   renders. `color` becomes the faded violet if we keep the paint muted in the game too.
3. Pirate rigs driven by the AI: they currently swing a `gun` pivot; they would swing the turret instead, and get a
   gunner too.
4. The frame is bigger than the old one (wheels 1.05 against 0.85, a wider track, a taller cab), so `radius`, the ride
   lift and the dust spots need checking in the game; the Asset Row item's footprint grows too.
