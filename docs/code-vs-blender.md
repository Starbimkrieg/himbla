# What the game draws: code-built vs Blender (November 2026)

An inventory of every visible object in the game and how it's made: **Blender**, a model built by a Python script in
`tools/blender/` and loaded from `src/assets/*.glb`, or **code**, built at load time from three.js primitives (boxes,
cylinders, lathes) in `src/`. The long-term aim is to move nearly everything in the second group into the first. The
order at the end is a suggestion. Meanwhile, **Blender is the default for any new model or any rework of one's look**, so a
code-built model is ported when it is next refined (the blender skill, "Blender by default"; `tools/claude-hooks.mjs geo`
blocks adding code-built geometry to `src/`). When a model moves, move its row to "Already Blender".

How to read the "build calls" figures: they count the primitive calls in a builder's source (`k.box`, `k.cyl`,
`new THREE.*Geometry` and so on). Many sit in loops, so they measure how much code builds a thing, not how many pieces it
has. They give a rough sense of how big each conversion is.

## Already Blender

| Group | Models (`src/assets`) |
|---|---|
| **Characters** | the courier (`runner.glb`, also pirates, faction troops and the leaders), Dr. Zbornak (`zlab.glb`), every chimera kind (`chimera.glb`), the derby ducks (`duck.glb`), the spider tank (`spidertank.glb`), idle poses (`idles.json`) |
| **Vehicles** | civil buggy and patrol car (`rover.glb`), Interceptor, Vostok APC, War-Rig, Phase Skimmer and its redesigns, Light-Bike, hover-car, Moonliner and Prospector land-trains, shuttle-bus and freighter (`ships.glb`) |
| **Industrial kit** | tower crane, container gantry and the standard cargo box (`gantry.glb`, used by every container stack), motor-pool garages, dish stations and dish heads (`dish.glb`, also the heads on masts and roofs) |
| **ILMB** | five of its six wings: Hydroponics, Meridian Labs, Vostok Hangar, Daedalus Relay, the Power Block (`power.glb`), the Kepler Habitat (`habitat.glb`) |
| **Whole places** | the Antimatter Lab and ranch (`zlab.glb`), Chimera Downs (ten `downs-*.glb` kits) |
| **Casino** | the hall and the forecourt kit (`hall.glb`, `lot.glb`), lamp posts, fountains, bouncers, chandeliers, sign frames (`casino.glb`), slot cabinets, the claw machine and its prizes, the blackjack table and chips, Plinko |
| **Items** | the courier's weapons, the salvaged engine and the briefcase (wreck drops), the winch grapple |
| **ILMB core** | the central complex and the fortress wall (two proposals: docs/ilmb-proposals), the skywalks, job terminal (its screens stay canvas), repair bay, launch gantry, fuel spheres, family domes, barracks, vehicle depot, comms mast, inner defence pylons (`ilmb.glb`, `tools/blender/build_ilmb.py`) |
| **Small outposts** | all seven kinds and their wrecks (`outposts.glb`, `tools/blender/build_outposts.py` with `outpost_kit.py`): Market Cross, Lattice Camp, Silo Depot, Greenhouse Row, Guyed Relay, Scrap Mountain, the Hulk. The code builders in `outpostDrafts.js` stay as the fallback (`?outpostGlb=0`) |

## Code-built: places

| Place | What's code | Where | Build calls |
|---|---|---|---|
| **Kepler towns** (Tranquility, Aldrin, Kepler Civic Center, Twilight, Hertzsprung) | hab domes with berms, airlocks and cupolas (the biggest single builder), connecting tunnels, prefab cabins, playground, greenhouse, water tower, comms mast, the Civic Center's town hall with its clock tower | `settlements.js` habDome, cabin, tunnel, playground, greenhouse, waterTower, townHall | ~200 |
| **Meridian Exchange** | the stepped glass trading tower, trade halls, warehouses, gate arch, plaza paving (its gantry, garage, cranes and fountain are already Blender) | `settlements.js` buildMeridian, tradeHall, warehouse | ~65 |
| **Helium-3 Exchange** | bucket-wheel excavator, conveyor, pumping derrick, Horton spheres, ticker hall, exhaust stacks, pipes | `settlements.js` buildHelium, hortonSphere, conveyor, stack, pipe | ~70 |
| **Shackleton Radar Array** | observatory, labs, control centre, cable runs (the four dish stations are Blender) | `settlements.js` dressArray | ~40 |
| **Military bases** (Bastion Vostok-9, Vostok-4 Outpost, Daedalus Citadel, Daedalus Forward Post) | sloped command bunker, Quonset barracks, searchlight tower, tank traps, sandbag nests, fuel and ammo dumps | `settlements.js` dressBase, quonset, radar, searchlight | ~60 |
| **Pirate dens** (Scrapjaw Gulch, Blackrock Den, Gloom Harbor, Rustmoon Hold), camps, the ruined den, the clans' ILMB | container shanties, scrap huts, gutted wreck hulls, junk heaps, lookout tower, tents and fire pits, barricades | `settlements.js` shanty, wreckHull, buildDen, buildPirateCamp, buildRuin, dressScrap | ~45 |
| **The Monolith** | the slab and the survey dig: berm, floodlight tripods, scaffold, tents, generator, theodolite | `world.js` buildMonolith; `settlements.js` dressMonolith | ~35 |
| **Lucky Crater Casino, outside the Blender hall** | the giant tumbling die, the upright roulette wheel, the neon avenue, carousel shelters | `casinoWorld.js`, `settlements.js` dressCasinoLot | ~120 |
| **Your town** (Kepler finale) and its eight buildings, the Moon Council chamber set | the council hall, every buildable building, the chamber's tiers, desks and gavel | `hometown.js`, `chamber.js` | ~90 |
| **Founded outposts** (homestead, field lab and their six modules) | all of it | `storyAssets.js` | part of ~200 |
| **Shared props used in many places** | landing pads (every settlement's shuttle pad), lamp posts and light pools, solar fields, floodlight masts, lattice towers, flags, Quonsets, radar heads, searchlights | `landingPad.js`, `world.js`, `settlements.js` | ~100 |

## Code-built: things that move or that you meet

| Object | Where | Build calls |
|---|---|---|
| **Townsfolk** (every resident, passenger and outpost NPC) | `townsfolk.js`: rounded lathed parts baked into one skinned mesh per look | ~20 (a parametric body) |
| **The three chapter bosses**: SPACECOM convoy rig, Daedalus Warden, Vostok Hammer | `storyAssets.js` | part of ~200 |
| **Captain Kade's monster truck** and his gunner's turret | `models.js` makeKadeTruck | ~45 |
| **Defence turrets** (settlements, outposts, militia guns) | `models.js` turretParts | ~25 |
| **Chapter and mission props**: relays, generators, the Black Sun reactor, charges, sensor pylons, ballot stands, phase emitters, rocket, seismometer, sample tube | `storyAssets.js`, `models.js` makeRocket, makePylon, makeSeismo, makeTube | ~60 |
| **Event props** (each faction's posted jobs) | `events.js` | ~30 |
| **The Spindle's mothership** and extraction pad, **the med-evac craft** and stretcher | `spindle.js`, `medevac.js` | ~40 |
| **SAT-7 "Lantern"** (the satellite), **the Whispering Fissure's** alien gate and shrine, the **Xenoglide skates** on the pedestal | `secrets.js` | ~70 |
| **Cargo crates and loot pickups** (the jar items on the ground) | `models.js` makeCrate, `alchemy.js` makeLoot | ~30 |
| **BOLT**, the tutorial drone | `tutorial.js` | ~10 |
| **Flags and wheels** (waving flags everywhere; spare wheels baked into code vehicles) | `models.js` makeWaveFlag, rWheel | ~10 |

## Should stay code

These are procedural or effects, and Blender would only make them worse or slower:

- the Moon's terrain, craters, rocks and boulders, the Spindle's rock surface, roads, black lakes, glowing crystals;
- the sky, the planets and the sun;
- effects: dust and smoke puffs, sparks, projectiles, meteors, glow halos and light pools, speed lines, the searchlight
  beams;
- text and screens drawn on canvas (signs, price tickers, terminals, the casino's neon), though their frames can be Blender;
- the claw machine's prizes in the tank (instanced from `claw.glb` parts) and the chimeras' assembly (from `chimera.glb`).

## A suggested order

1. ~~**The small outposts**~~: done (November 2026). Their kit (`tools/blender/outpost_kit.py`, the game's Kit ported) and
   contract (`docs/outpost-glb.md`) are the route for the other places' code builders: port call for call, compare the
   gameplay data in the viewer, then refine in Blender.
2. ~~**The ILMB core**~~: done (November 2026), in two proposals for the central complex and wall (docs/ilmb-proposals).
3. **Kepler towns' kit**: hab dome, tunnel, cabin, town hall, playground, water tower. One kit covers five towns and your
   own town.
4. **Military bases**: bunker, barracks, searchlight tower, defences, and the defence **turret** with them.
5. **Pirate dens**: shanties, wreck hulls, lookout, heaps (it can share parts with the Scrap Shack and Junk Pile).
6. **Meridian Exchange tower and halls**, then the **Helium-3 Exchange** (excavator, derrick, spheres).
7. **The bosses and Kade's truck**: vehicles, where Blender shows most against code.
8. **Townsfolk**: a skinned Blender body like the courier's, with the outfit looks as slots.
9. Story and event props, the Monolith dig, the Shackleton buildings, the landing pad, the casino's die and wheel, the
   Spindle's mothership, SAT-7, the hometown and chamber sets.
