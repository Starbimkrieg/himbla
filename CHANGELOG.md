# Changelog

What changed in each release. Releases are built by `.github/workflows/release.yml` when a commit message
contains `[release]` (see the README's Download section). Newest first.

## Unreleased

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
