# Changelog

What changed in each release. Releases are built by `.github/workflows/release.yml` when a commit message
contains `[release]` (see the README's Download section). Newest first.

## 0.9.95 — 2026-10-09

**Performance**
- Settlements hidden behind a hill or the moon's curve stop drawing (a terrain line-of-sight test to
  each one's top), and so does road and air traffic; inside a settlement, small props in 60 m cells
  further than ~260 m away stop drawing, and a vehicle's small parts past ~220 m. Draw calls fall by
  10-45% depending on where you stand (e.g. Meridian Exchange 2270 -> 1230, Aldrin Heights 1009 -> 548).
- Every shader is compiled while loading ("Warming up shaders...", ~0.3 s) instead of the first time a
  material comes into view, which hitched a frame each time (28 of them across the map).
- Loading no longer stalls in a background tab (it waited on animation frames, which hidden tabs stop).

**Tutorial**
- BOLT, a courier-school drone, now runs the tutorial: it hovers at your shoulder, teaches the same controls,
  and chips in as you ride (big air, a landing that dings the parcel, top speed, grinds, getting hurt). It
  rides along for two contracts: the ILMB to the nearest Kepler town, then a cleared Vostok run from there,
  explaining the factions and restricted zones on the way (turrets fire without clearance). After the
  second delivery it offers a free recovery shuttle back to the ILMB.

**Fixes**
- Going down resets every base's and den's alert: the ILMB's guns (or anyone else you'd provoked) no
  longer keep firing when you respawn. A faction whose reputation makes it hostile still is.
- Pirate squads spawn everywhere again (friendly territory included); they hold off only while you're
  within a non-hostile settlement's own range, or riding a transit ship.
- The recovery shuttle no longer clips through your view as the cutscene ends: you come out facing it.

**Destructibility**
- Hover-cars can be wrecked; land-trains take hits on any trailer (shots used to pass through their
  cabins); Moon Mites can be squashed. Wrecking traffic or hurting people always costs standing with their
  faction (or the nearest settlement's), seen or not.
- Defence turret heads are tankier (420 / 650 hp) and come back after a minute.
- Your vehicle rams: turrets, patrols, pirates, road traffic, people and mites all take damage at speed.

**Models**
- The Vostok Hangar's parked plane is now a real shuttle-bus (gear down, ramp lowered).
- The Xenoglide skates on the shrine pedestal are rebuilt as real skates (the runner's newer build at
  display size): rounded alien-alloy boots with toe caps, high cuffs with glowing collars and seams, swept
  crystal heel fins, chassis plates and hover rails ringed by emitters, with shards orbiting the pair.
- Freighter: the bridge's glass band and livery stripe (and the hull belts on the freighter and
  shuttle-bus) are cut exactly to their edges, so they no longer come out with sawtooth splotches.
- Shuttle-bus: a level livery belt (the swept one made ragged splotches at the tail) and swept, hull-coloured
  V-tail fins with livery caps (`tools/blender/build_ships.py` -> `ships.glb`).
- The Whispering Fissure's way in is rough rock with outcrops along the rim and a heap over the mouth,
  leading to a worn, half-buried portal; the gate wall is one slab with a round hole (no open corners).
- The rock over the Fissure's mouth reaches down to the portal (it used to hang in the air), and the
  boulders round it are bedded deeper.
- Hab domes: curved window panes on the shell between the ribs, and a ribbed tunnel to a proper airlock
  (housing, hazard-striped doorway, split doors with portholes, cycle lights, keypad, step), meeting the
  dome in a solid flared collar with a docking ring and bolts.
- ILMB skywalks end in a faintly glowing doorway with a lit rim at each end; the roof rails stop at the end
  rings instead of poking out into the dome.
- ILMB: Meridian Labs, the Vostok Hangar and the Daedalus Relay are bigger (about 1.25-1.3x). Meridian's
  leaning tower is taller and stands in a plinth on the roof (its foot no longer leaves a gap).
- Shackleton Radar Array: a new control centre (two tiers, a raked glazed front, a radome and antennas on
  the roof, a canopy over the door) with its name on the upper tier; the status display stands out front
  on its own frame and the solar panels moved off the roof into a field beside it.

**Places**
- Lucky Crater Casino: the outside slots are now two slot carousels (six upgraded cabinets with light strips,
  a flashing lamp and a pull arm, round a glowing pillar with a spinning SLOTS topper, under a canopy of chase
  bulbs, with stools). A dozen punters walk between real spots: they play the slots, watch the die and the
  roulette wheel, admire the chip towers and chat by the doors. The casino joins the road network, so it
  gets a ring road and links to its neighbours (`traffic.js`).
- Bounce Dome skate park: the quarter-pipe is now a proper half-pipe, two matching walls (1.35x bigger, ~7 m)
  facing each other across a flat bottom, with decks, railings and stairs. The bowl and the funbox moved to
  give everything room.
- ILMB: the Vostok Hangar collides as a round quonset instead of a box; the Daedalus Relay's roof dishes get
  their receivers (a feed spoke and struts to the glowing bead at the focus); the Kepler Habitat is rebuilt
  as a round ring on A-frame legs, high enough to skate under, with a collider that follows the tube (you
  could clip into the old one from below).
- The Monolith plays the lab's track.
- SAT-7 "Lantern" is 1.5x bigger and far more detailed (foil bus, landing deck with a hazard border and a
  glowing landing ring, framed solar wings, thrusters, antennas), with blinking wingtip strobes, deck beacons
  and a mast strobe. Its landing colliders scale with it.

**Vehicles**
- The Meridian vehicle is now the Courier Light-Bike, shown at 1.2x: its nose and tail are the curved fairings
  over its hubless glowing wheels, with glowing arcs tracing each well, raised side panels, vents and seams,
  and a light trail that fades over a second. You ride it tucked low like a motorcycle (id stays `van`).
- Riders are locked to their vehicle: you sit in the vehicle's own frame (its tilt and hover bob), so you no
  longer jostle round it in the air or on bumps.
- Rover fenders stop above the axle (their ends hung down like fins under the wheels), and head/tail lights
  sit on each body's own faces (they floated in front of the Mule and the Interceptor).
- Vehicles grip: the wheeled ones get downforce and sideways traction, and every vehicle snaps back to the
  ground over crests at speed (only a real ramp throws it clear). The hover ones keep a little drift.

**Controls**
- The controls panel (`H`) only lists what you've unlocked, in sections; more appears as you get gear and tech.
- `X` empties the jar on a 1 s hold (like the recall shuttle, but free), so a stray tap can't waste a jar.
- The helmet lamp toggle is gone: the lamp comes on by itself in the dark (the trailer can still force it).

- Docs: this changelog; README sections for trailer mode, the reactor hatch, phosphor flak, the new
  Blender models and the zone-music notes.

**Open threads**
- Chimera Downs crowd audio was removed in 0.9.9 and still needs a proper rework (cheers that react to
  the race rather than a constant bed).
- CI notices: `actions/checkout`, `setup-node` and `upload-artifact` v4 target the deprecated Node.js 20,
  and `ubuntu-latest` moves to Ubuntu 26 on 2026-10-19. Both are harmless for now, but the action
  versions could be bumped.

## 0.9.9 — 2026-10-09

The trailer release: everything shown in the official trailer is in this build.

**Trailer**
- New trailer director mode, `?trailer` (`src/trailer.js`). It plays the official ~90 s trailer live
  in the engine, shot by shot, with title cards, transitions and a zone-music medley, and never
  touches saves. The brief and running order are in `docs/trailer-brief.md`. The final render is
  `trailer-out/Moon-Runner-Trailer.mp4` (1920x1080, H.264/AAC, -14 LUFS), which is not tracked by git.
- Running order: cold open, job board, chase, rim grind, air trick, pirates (dark side), Captain Kade,
  Daedalus skimmer and Vostok APC gun runs, big air, meteors, bus surf to the Helium-3 Exchange,
  Chimera Downs pan and race, casino and hall, ferris wheel, scooping, Dr. Zbornak's lab, the Whispering
  Fissure, then the crater-grind hero shot and end card ("COMING SOON").

**Characters**
- Captain Vex "Longshot" Kade is now just **Captain Kade** everywhere: the boss splash, story chapter,
  death text, cheats, README. His subtitle stays "King of the Rustmoon Pirates · Deadliest Shot on
  the Moon".
- Kade's truck now spawns facing the right way, without rising out of the ground.

**Gameplay and effects**
- Chimeras hatch out of the reactor: the new chimera climbs out of the tube, leaps clear and lands
  beside you, then the result card shows (`alchemy.js`, `HATCH_WAIT/GROW/LEAP`).
- Kade's flak bursts leave lingering white-hot phosphor embers (`fx.phosphor`; particle cap raised
  to 1200).
- Chimera wheel and tread legs sit on a chassis base instead of floating off the body.

**Models**
- The Daedalus Phase Skimmer was rebuilt in Blender as a hover-racer with spinning phase coils
  (`tools/blender/build_skimmer.py` -> `src/assets/skimmer.glb`).
- The Rustmoon pirate war-rig was rebuilt in Blender: patchwork mad-max rust with a spiked ram plow,
  scaled 1.35x (`tools/blender/build_warrig.py` -> `src/assets/warrig.glb`). It is still smaller than
  Kade's truck.
- The two builders share their geometry, material and export helpers in `tools/blender/kit.py`.
- The runner now holds the handlebars while driving, arms forward in a steering pose.
- The Vostok APC's wheel arches were fixed.

**Audio**
- The Chimera Downs crowd-noise bed is gone, pending a rework.
- Race countdown and start tones are much quieter (0.2/0.25 -> 0.08/0.1).
- Jet noise no longer stays stuck on after you get into a vehicle.

## 0.9.8 — 2026-10-08

- Crater rims: level aprons with ramp-shaped lips, a band of shattered regolith along each firm crest,
  and one outline per overlapping cluster. The same measurement makes the crest grindable.
- The terrain grid is doubled near the player (4.4 m, five LODs). Terrain casts shadows from its far
  sides only, with a soft toon ramp, and depth outlines use 1/depth so slopes don't streak.
- Landform re-pass: ridged highlands, scarps, rolling hills and rilles each come out bolder in their
  own patches. Rilles carve through everything, and craters only level the plain's small bumps.
- Grinding: a more forgiving catch, rim loops and clipped stretches, a slide pose and sparks.
- Kade rides a gun truck (gatling / flak turret) and drops the Junk Mortar.
- The Monolith casts Low-G, Time Dilation or Echo Decoys.
- Pirates don't spawn in allied settlement zones or aboard transit ships.
- Jumps work within a floor buffer and no longer need jet energy.

## 0.9.6 — 2026-10-08

- Transit ships were rebuilt in Blender (`build_ships.py` -> `ships.glb`): a bigger shuttle-bus and a
  hammerhead freighter with folding landing gear, ramps and pulsing thrusters. Rides are free: `F` to
  hop in and out, or bail mid-flight.
- Chimera and Moon Mite models were rebuilt.
- Chimera Downs racecourse: a rotating race card, variable distances and going, a locked race camera
  and crowd cheers.
- The ferris wheel (now bigger) and the carousel are rideable. Deliveries into restricted zones get a
  grace period.
- Meteor showers: rare and marked on the map, with huge slow rocks that have shaped colliders, plus
  chunks and scorch marks.
- Zone music (casino, Downs, lab, dark side) with crossfades.
- Collision pass on structures. Shaped rocks (ramps, arches, hoodoos, grindable snake rocks).
  Terrain crater types.
- Fall damage is halved, with a glancing-landing safety net. Jar dumps release things where you
  stand. More mite herds.
- Dev model viewer at `tools/viewer.html`.

## 0.9.3 — 2026-10-07

- Electron's install script is allowed, fixing the desktop builds.
- Before it: the structure pass (kit-built settlements, fortress walls, turrets, habitat and
  vehicles), then pirate caps and threat range, rover grip, the distress log, the terminal job board
  and map info.
