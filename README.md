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
| `W A S D` | Run in boots · steer and carve on skates |
| `SPACE` (hold) | **Quantum-Lock Skates**: near-frictionless glide. Release to brake hard in boots |
| `E` / right mouse (hold) | **Dive thrusters**: push you down into slopes and onto downslopes for speed (drains JET) |
| `T` | Swap thrusters between dive (down) and classic jetpack (up) |
| `SHIFT` | Mag-jump · in the air: Superman pose |
| `Q` + `W`/`S` (air) | Front / back flips |
| `Q` + `A`/`D` (air) | Spins |
| `L` | Helmet lamp: auto / off / on |
| Left mouse | Pulse Spinner (splash knocks you around too, so you can disc-jump) |
| `F` | Job board / upgrades (inside hubs and settlements) |
| `M` | Toggle the big map |
| `R` | Emergency recall to the ILMB (forfeits the current contract) |
| `H` | Help |

## How it plays

- **Magnetic grip:** while the skates are touching the ground (or just left it), they pull you
  toward the surface. You hold contact over small bumps instead of skipping off, but a real
  ramp or crater rim still launches you. Tune `grip`, `gripWindow` and `gripRange` in `src/config.js`.
- **Tricks:** flips, spins and Superman holds score style points if you land upright. Land
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

## Locations

| Location | Type | Notes |
| --- | --- | --- |
| International Moon Base (ILMB) | Hub | Embassies, multi-faction job board, repair bay & upgrades, launch pad, Hall of Highlights |
| Tranquility Commons, Aldrin Heights | Civilian | Family habitat domes, safe rest and repair |
| Shackleton Radar Array, Kepler Bio-Lab | Research | Fragile, high-value cargo |
| Helium-3 Extractor 7 | Industrial | Volatile, pirate-magnet canisters |
| Fort Meridian, Bastion Vostok-9 | Military | Restricted zones with turrets, patrols and artillery |
| Twilight Waystation | Civilian (terminator) | Last light before the dark side |
| Farside Listening Post, Daedalus Deep Observatory, Hertzsprung Refuge | Dark side | Hazard-pay destinations |
| Scrapjaw Gulch, Blackrock Den, Gloom Harbor, Rustmoon Camp + scattered camps | Pirate (dark side) | Stolen cargo is fenced at the nearest den |

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
