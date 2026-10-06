# MOON-RUNNER — Quantum-Lock Delivery Service

A comic-book 3D action-adventure delivery game set on the lunar frontier, built with
[Three.js](https://threejs.org/). You play a **Moon-runner**: a high-speed courier on
**Quantum-Lock Skates** whose magnetic cushion kills friction. Read the terrain, dive
into craters, launch off the far rims and chain momentum Tribes-style, while pirates
try to steal your cargo and military bases defend their airspace.

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
| `E` / right mouse (hold) | Thruster (drains JET energy) |
| `SHIFT` | Mag-jump |
| Left mouse | Pulse Spinner (splash knocks you around too, so you can disc-jump) |
| `F` | Job board / upgrades (inside hubs and settlements) |
| `M` | Toggle the big map |
| `R` | Emergency recall to the ILMB (forfeits the current contract) |
| `H` | Help |

## How it plays

- **Skiing physics:** gravity pulls you along the slope you're on. With the skates on, friction
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
- **Living world:** civilian shuttles fly between settlements, cargo crawlers drive the
  roads, workers and soldiers walk their routes, kids bounce around in low gravity, and
  radar dishes sweep the sky.
- **Upgrades** at the ILMB repair bay: Flux Capacitor, Ablative Plating, Mag-Cushion
  Dampers and Pulse Spinner Mk+. Progress is saved in `localStorage`.

## Locations

| Location | Type | Notes |
| --- | --- | --- |
| International Moon Base (ILMB) | Hub | Embassies, multi-faction job board, repair bay & upgrades |
| Tranquility Commons, Aldrin Heights | Civilian | Family habitat domes, safe rest and repair |
| Shackleton Radar Array, Kepler Bio-Lab | Research | Fragile, high-value cargo |
| Helium-3 Extractor 7 | Industrial | Volatile, pirate-magnet canisters |
| Fort Meridian, Bastion Vostok-9 | Military | Restricted zones with turrets, patrols and artillery |
| Scrapjaw Gulch | Pirate | Where stolen cargo gets fenced |

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
  terrain.js     procedural heightfield (craters, rays, plateaus); physics samples exact triangles
  physics.js     collider hash + shared skater movement model (player and pirate skaters)
  player.js      input → movement, weapon, animation, style events
  enemies.js     pirates (skaters/rovers), military bases, turrets, artillery, theft/recovery
  missions.js    contract generation, pickup/delivery, integrity, payouts
  world.js       sky, settlements, colliders, ambient life, shuttle and crawler traffic
  models.js      stylised characters and vehicles from primitives
  post.js        comic post-processing shader
  fx.js, hud.js, audio.js, input.js, toon.js, locations.js, rng.js
```
