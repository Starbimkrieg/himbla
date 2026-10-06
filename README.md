# MOON-RUNNER — Quantum-Lock Delivery Service

A comic-book 3D action-adventure delivery game set on the lunar frontier, built with
[Three.js](https://threejs.org/). You play a **Moon-runner**: a high-speed courier on
**Quantum-Lock Skates** whose magnetic cushion kills friction. Read the terrain, dive
into craters, launch off the far rims and chain momentum Tribes-style, while pirates
try to steal your cargo and military bases defend their airspace.

The Moon is a **real sphere** (about 22.6 km around), and you can ski all the way round it.
The sunlit near side holds the settlements. Past the terminator lies the **dark side**: almost
pitch black, lit only by your helmet lamp, and full of pirate dens.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ (relative paths, host anywhere)
```

Click **START YOUR SHIFT!** to lock the mouse.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look / aim |
| `W A S D` | Run in boots. On skates, `A`/`D` steer you along the ground: full input carves hard, `W`+`A` carves gently |
| `SPACE` (hold) | **Quantum-Lock Skates**: near-frictionless glide. Release to brake hard in boots |
| `E` / right mouse (hold) | Thrusters: mostly forward, with only a little lift or dive (drains JET) |
| `SHIFT` | Mag-jump |
| `Q` + `W`/`S` (air) | Front / back flips |
| `Q` + `A`/`D` (air) | Spins |
| `L` | Helmet lamp: auto / off / on |
| Left mouse | Fire the selected weapon (the Pulse Spinner homes slightly; its splash can disc-jump you) |
| `1` `2` `3` `4` | Switch weapon: Pulse Spinner, Vostok Scattergun, Daedalus Rail Lance, Rustmoon Junk Mortar |
| `G` / `X` | Scoop into your containment jar / empty it (into the antimatter reactor when you're beside it) |
| `F` | Job board / upgrades (inside hubs and settlements) |
| `M` | Globe map: drag to spin, scroll to zoom. Fog of war covers anywhere you haven't been |
| `J` | Reputation Log |
| `R` | Emergency recall to the ILMB (forfeits the current contract) |
| `H` | Help |

## How it plays

- **Magnetic grip:** while the skates are touching the ground (or just left it), they pull you
  toward the surface. You hold contact over small bumps instead of skipping off, but a real
  ramp or crater rim still launches you. Tune `grip`, `gripWindow` and `gripRange` in `src/config.js`.
- **Tricks:** flips and spins score style points if you land upright. Buses, cars and freighters
  have solid decks: land on one and it carries you along, then launch off it. Land
  crooked and you **WIPE OUT**: you take damage, lose speed and the cargo gets jostled. Without
  an active contract, style pays out half its value in credits straight away.
- **Hall of Highlights:** big launches, trick landings, thefts and deliveries are snapped by the
  action-panel camera, run through the comic post-process, and pinned to the 12-frame board
  next to the ILMB job board. They also appear on the ILMB board screen and are saved in `localStorage`.
- **Skiing physics:** gravity pulls toward the Moon's centre and along the slope you're on. With the skates on, friction
  is almost zero and the cushion turns some extra downhill pull into speed, so diving into
  a crater and climbing out the other side *gains* momentum. Chain craters to go faster.
  Low lunar gravity gives long airtime. Landing hard in **boots** (skates off) hurts; the
  skates absorb almost any landing.
- **Speed tracker** (bottom-left) shows km/h, skate state, hull and jet energy.
- **Deliveries:** pick a contract at a job board. Each one has a cargo type, fragility,
  pirate risk, distance and time limit. Some start with a pickup somewhere else. You're paid
  for cargo integrity, time left and **style** (big air, speed milestones, recoveries).
- **Pirate war-rigs:** pirate rovers are big, fast, and grip the ground. They ram you hard. Your
  Pulse Spinner homes in slightly to even the odds; the SPACECOM Seeker Module makes it home harder.
- **Moon Pirates:** "hot" cargo draws Scrapjaw pirates on skates and armed Moon-Rovers. If one
  stays close for about a second, they **steal the cargo** and run for Scrapjaw Gulch. Blast
  or ram them (on skates, above roughly 80 km/h) so they drop it, then grab it back before
  they get home.
- **Military zones:** Fort Meridian (Atlantic Accord) and Bastion Vostok-9 (Pan-Pacific
  Directorate) sit inside red striped walls. If you enter without a contract that grants
  clearance, you get a 4-second warning. After that, turrets and patrol rovers open fire,
  and after 9 seconds artillery starts landing on predicted positions marked by red rings.
- **The dark side:** your helmet lamp switches on automatically. Pirate squads hunt you even
  without cargo, and pirate dens and camps are guarded. Contracts that start or end there pay
  1.6× hazard pay. Switching your lamp off (`L`) makes you much harder to hit, but you'll be skiing blind. Twilight Waystation on the terminator is the last safe stop before the dark.
- **Living world:** traffic comes in three sizes: hover-cars, passenger buses, and 50 m cargo
  freighters cruising high overhead. A rocket regularly lands on and launches from the ILMB
  **Arrivals** pad. Cargo crawlers drive the roads, workers and soldiers walk their routes, kids bounce around in low gravity, and
  radar dishes sweep the sky.
- **Upgrades** at the ILMB repair bay: Flux Capacitor, Ablative Plating, Mag-Cushion
  Dampers and Pulse Spinner Mk+. Progress is saved in `localStorage`.

## Factions & reputation

| Faction | What they are | HQ |
| --- | --- | --- |
| **SPACECOM** | International Moon Force: military, civilian and research | International Moon Base (a fortress ringed by walls and turrets) |
| **Vostok** | Military, bases 1–9. At war with Daedalus | Bastion Vostok-9 (plus the Vostok-4 Outpost) |
| **Meridian** | Trade & research | Meridian Exchange |
| **Kepler Settlements** | Civilian governments | Kepler Civic Center |
| **Daedalus** | Dark-side military. At war with Vostok | Daedalus Citadel (plus a Forward Post) |
| **Rustmoon** | Pirate clans. Hidden in the Reputation Log until you meet them | Rustmoon Hold |

Standing goes from HOSTILE through WARY, NEUTRAL, FRIENDLY and TRUSTED up to HONORED. You earn it
with deliveries and events, and lose it by shooting a faction's people. Helping Vostok angers
Daedalus, and vice versa.

- **Pay:** contract pay scales with your tier, from ×0.85 up to ×1.75. FRIENDLY factions also offer ★ PRIORITY contracts.
- **Faction gear:** each HQ sells unique gear gated by reputation: SPACECOM Seeker Module (homing),
  Meridian Gyro-Edges (steering), Kepler Cargo Cradle (protects cargo and tubes), Vostok Flak Weave
  (health, knockback), Daedalus Overcharger (fire rate) and Rustmoon Shadow Rig (harder to hit).
- **Clearance:** FRIENDLY (10+) with Vostok or Daedalus means their turrets stop shooting you and you
  can visit their HQ shops. Each completed event for them gives +8, so two events get you there.
- **Weapons:** the military HQs sell weapons. The Vostok Scattergun needs FRIENDLY Vostok and the
  Daedalus Rail Lance needs FRIENDLY Daedalus. Rustmoon Hold sells the Junk Mortar to sworn members.
- **Hostile factions:** a HOSTILE faction won't hire you, and its settlement turrets open fire.

## Events

Every faction keeps one event open somewhere on the Moon. Events are marked by a coloured beacon
and appear on the globe map and the Reputation Log. Ride up to a beacon to start one:

- **Clear a pirate den** (SPACECOM, Vostok, Daedalus): destroy the den's signal pylon. Destroyed dens go
  dark and repopulate after five minutes. You can also knock dens out without an event.
- **Strike** (Vostok ↔ Daedalus): destroy turrets at the rival military installation.
- **Seismic survey** (Meridian): carry a seismograph to a site, plant it, and defend it while it records.
- **Black lake sample** (SPACECOM, Meridian): fill a vacuum tube at one of the black lakes in the
  dark-side craters and bring it back. The fluid really sloshes: hard carves and braking spill it,
  and crashes crack the tube so it leaks. You're paid for whatever is left.
- **Downed transit** (Meridian, Kepler): escort a broken-down crawler to the nearest outpost.
  It only moves while you're close, and raiders come for it.
- **Supply drop / relay sweep** (Kepler, SPACECOM): reach every pod or beacon before time runs out.
- **Raid** (Rustmoon, once you've joined): knock out a settlement's defenses. Bigger targets unlock
  with Rustmoon reputation. At HONORED, you can raid the International Moon Base itself.
- **Pirate Wreck** (one time only): a distress signal from the dark side. Fetch med supplies from the
  nearest lit outpost and get back before the pirate's air runs out.
  - **If you save them:** you can swear in with Rustmoon. Pirates then treat you as crew, dens open their
    job boards and gear to you, and raids unlock. SPACECOM will notice.
  - **If you fail:** you're locked out of Rustmoon for good.

## Economy

Base pay is deliberately low and grows with reputation: ×0.8 at WARY up to ×2.4 at HONORED.
Contract clocks are tight. If you miss one, the job still pays 50% when you deliver.

## Strange places (sunlit side)

- **Antimatter Research Lab:** a building you can walk into, with a violently spinning reactor in a glass
  tube. Dr. Zbornak sells containment jars (2 slots, upgradeable to 5). Press `G` to scoop up rock
  samples (glowing crystals), moon dirt, black water (stand on a black lake) or people. Things left in
  a jar together for 12 s react: dirt + water make Moon Mud, rock + water make Slick Rock, and a person
  + water becomes Void-Touched. Press `X` beside the reactor to throw everything in. Results include
  credits, a pet rock, a dirt golem, statues, a love match, black rain, inverted colours, low gravity,
  super-slick skates, a springy "resonance" and, with three different things, a SINGULARITY that blows you
  through the roof.
- **The Monolith:** touch it for 30 s of low gravity (90 s cooldown).
- **Bounce Dome Funpark:** inflatable domes and a bouncy castle that throw you back up harder than you landed.

## Locations

| Location | Type | Notes |
| --- | --- | --- |
| International Moon Base (ILMB) | SPACECOM HQ | Fortress walls, turrets, artillery, embassies, job board, repair bay, launch pad, Hall of Highlights |
| Meridian Exchange · Shackleton Radar Array · Helium-3 Exchange | Meridian | Trade hub, radar research, volatile canisters |
| Kepler Civic Center · Tranquility Commons · Aldrin Heights · Twilight Waystation · Hertzsprung Refuge | Kepler | Towns, safe rest and repair |
| Farside Listening Post | SPACECOM (dark side) | Hazard-pay destination |
| Bastion Vostok-9 · Vostok-4 Outpost | Vostok | Restricted zones: turrets, patrols, artillery |
| Daedalus Citadel · Daedalus Forward Post | Daedalus (dark side) | Restricted zones: turrets, patrols, artillery |
| Rustmoon Hold · Scrapjaw Gulch · Blackrock Den · Gloom Harbor + scattered camps | Rustmoon (dark side) | Stolen cargo is fenced at the nearest working den |

## Keeping it light on the GPU

- **Terrain LOD streaming:** the cube-sphere is split into 1,536 chunks. Each frame the game
  picks a detail level per chunk (4 levels, by distance), skips chunks past the horizon, builds
  missing meshes within a 4 ms budget, and frees detailed meshes nobody needs anymore. Skirts
  hide the seams between detail levels.
- **Exact physics without meshes:** collisions sample the finest-level triangles directly from
  the height function (cached), so far-away pirates don't need rendered terrain.
- **Sleeping world:** settlements are removed from the scene graph beyond about 2.6 km. Ambient
  people only animate when you're near. Military bases (turrets and patrols) sleep beyond
  1.6 km. Traffic is hidden outside its view range. Boulders and their colliders exist only
  for nearby chunks.
- **Cheap darkness:** shadow maps only update while the sun is up, view distance shrinks on the
  dark side, and settlement "lights" are additive light-pool decals rather than real lights.
  The number of real lights never changes, so shaders never recompile.

## Comic-book rendering

- Toon shading with a 3-step ramp and purple hemisphere "shadow ink"
- Inverted-hull outlines on characters, vehicles and buildings
- A post pass (`src/post.js`) that draws ink lines from the depth buffer, halftone dots in
  shadow, radial **speed lines** that scale with velocity, and damage and alert vignettes
- Inked crater rims baked into the terrain shader
- Onomatopoeia pop-ups (WHOOSH!, KRAK!, KA-BOOM!, YOINK!) and inset **action panels** with
  captions for big launches, thefts and deliveries

## Code map

```
src/
  main.js        game loop, camera, state, explosions, job board flow
  config.js      world size and physics tuning
  planet.js      spherical moon: cube-sphere heightfield, craters, LOD chunk streaming, exact surface queries
  geo.js         sun/dark-side frame, great-circle and local-frame helpers
  reputation.js  faction standing, tiers, unlocks, Rustmoon state
  events.js      per-faction events, fluid sloshing, escorts, the Pirate Wreck
  mapview.js     draggable fog-of-war globe map
  highlights.js  action-shot capture + Hall of Highlights board
  physics.js     collider hash + shared skater movement model (player and pirate skaters)
  player.js      input → movement, weapon, animation, style events
  enemies.js     pirates (skaters/rovers), military bases, turrets, artillery, theft/recovery
  missions.js    contract generation, pickup/delivery, integrity, payouts
  world.js       sky, settlements, colliders, ambient life, shuttle and crawler traffic
  models.js      stylised characters and vehicles from primitives
  post.js        comic post-processing shader
  fx.js, hud.js, audio.js, input.js, toon.js, locations.js, rng.js
```
