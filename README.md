# MOON-RUNNER — Quantum-Lock Delivery Service

A comic-book 3D action-adventure delivery game set on the lunar frontier, built with
[Three.js](https://threejs.org/). You play a **Moon-runner**: a high-speed courier on
**Quantum-Lock Skates** whose magnetic cushion kills friction. Read the terrain, dive
into craters, launch off the far rims and chain momentum Tribes-style, while pirates
try to steal your cargo and military bases defend their airspace.

The Moon is a **real sphere** (about 22.6 km around), and you can ski all the way round it.
The sunlit near side holds the settlements. Past the terminator lies the **dark side**: almost
pitch black, lit only by your helmet lamp, and full of pirate dens.

## Download (desktop, no browser)

Grab the latest build from the repo's **Releases** page:
- **Windows:** `Moon-Runner-…-windows-portable.exe` — double-click to play (SmartScreen may warn because the
  build isn't code-signed: *More info → Run anyway*). Or the `win-x64.zip` — unzip, run `Moon-Runner.exe`.
- **Linux:** `…-linux-x86_64.AppImage` — `chmod +x`, then run it.
- **macOS:** `…-mac-universal.zip` — unzip, right-click the app → Open (if it says "damaged", run
  `xattr -cr Moon-Runner.app` once; the build isn't notarized).

`F11` toggles fullscreen. Saves live in the app's own storage.

Building it yourself: `npm run app` runs the desktop version; `npm run dist:win`, `dist:linux` or `dist:mac`
package it into `release/`. Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds all three on
GitHub and attaches them to a Release.

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
| `C` | Wardrobe: cycle owned outfits, skate finishes and pulse-disc colours |
| `N` | Music on / off |
| `V` | Call / board / leave your faction vehicle (story unlock) |
| `Z` · `T` | Phase Dash · Personal Teleporter (story tech) |
| `Esc` → SETTINGS | Graphics, gameplay, camera, audio and key remapping |
| `P` | Holding pen, anywhere (needs the remote pen link from Dr. Zbornak) |
| `G` / `X` | Scoop into your containment jar / empty it (into the antimatter reactor when you're beside it) |
| `F` | Job board / upgrades (inside hubs and settlements) |
| `M` | Globe map: drag to spin, scroll to zoom. Fog of war covers anywhere you haven't been |
| `J` | Reputation Log |
| `R` | Emergency recall to the ILMB (forfeits the current contract) |
| `H` | Help |

## How it plays

**First shift:** a new game offers Instructor Bolt's training run. Each step waits until you've actually done
it (look, walk, glide on skates, carve, mag-jump, thrusters, open and close the map, find the job board), then
you take a pirate-free TRAINING RUN contract and deliver it for a ₵200 bonus. You can skip it at the start.

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

## Faction stories

Every faction has a leader standing on a podium at their HQ: **Admiral Ada Okonkwo** (SPACECOM, ILMB),
**General Yuri Volkov** (Vostok), **Chairwoman Lucinda Vane** (Meridian), **Mayor Hettie "Gran" Pike**
(Kepler), **Director Ilsa Moreau** (Daedalus) and **Captain Vex "Longshot" Kade** (Rustmoon, at Rustmoon
Hold once you're FRIENDLY with the pirates). Each offers a four-chapter story, starting at FRIENDLY (10 rep);
later chapters need 15, 25 and 35. **Finishing the first chapter of any story commits you to it**: the other
leaders stop dealing with you, so each playthrough tells one coherent story.

- **Military (SPACECOM, Vostok, Daedalus):** clear ambushes, then **capture outposts**: kill the guards and
  hold the ground while reinforcements arrive; the outpost flips to your faction and the territory border
  moves. Captures unlock **vehicles**. Vostok and Daedalus fight each other (captures cost the rival rep).
  SPACECOM's finale is hunting down Kade himself.
- **Civilian (Kepler):** haul prefab parts (crack them with a hard landing and you go back for more) to
  **found homesteads** you own. Each outpost terminal builds up to 6 modules: Greenhouse (heals nearby),
  Clinic (you redeploy there after a K.O.), Beacon (charts 1.5 km and links beacons for fast travel),
  Militia Turret (shoots pirates), Market (₵40/min to collect) and Garage (hauler vehicle).
- **Research (Meridian, plus Daedalus):** plant sensor relays, survive **phase-field experiments**
  (anomalies strike where the warning rings appear), carry unstable antimatter without cracking it, and
  build a research station. Rewards are **tech**: Phase Dash (`Z`, blink ~30 m), Deflector Shield (absorbs a
  hit every 12 s) and a Personal Teleporter (`T`, any discovered location or your outposts).
- **Rustmoon (Kade):** take a SPACECOM depot, crack an armoured convoy, sabotage relay masts, then the Big
  Score: run a Meridian vault cube home while every gun on the Moon chases you.
- **Vehicles** (`V` calls the crane drop, boards and leaves; W/S drive, A/D steer, Shift hops, you can still
  shoot): SPACECOM Lunar Interceptor (fast), Vostok BTR-M APC (slow tank), Daedalus Phase Skimmer (hover,
  drifts), Kepler Homestead Mule, Meridian Courier Hover-Van, Rustmoon Scrapjaw War-Rig. Ramming pirates
  at speed hurts them; vehicles soak up a share of incoming damage.

**Longshot Kade.** On the dark side, a regular pirate squad occasionally (8 %) brings the King of Rustmoon:
slow-motion, a comic splash panel and a close-up. He's a sniper who keeps his distance. When the red laser
locks on you get ~2 s of warning (LASER LOCK, rising beeps), then the dot freezes for a split second and he
fires where you WERE: 45 damage. Keep moving sideways or break line of sight. Knock him below a third of his
health and he escapes ("THIS AIN'T OVER, RUNNER!") for ₵500; he comes back later. Not while you ride with
Rustmoon.

## Lucky Crater Casino

A neon strange place on the sunlit side, about 1 km from the ILMB (giant tumbling die, upright roulette wheel,
spinning sign, slot machines and a bouncer out front). Press `F` at the door. Inside (number keys switch games,
◀ ▶ change the bet, Esc leaves):
1. **Lunar Slots:** 3 reels, WILD, paytable, auto ×10 and a saved progressive jackpot (~95 % return).
2. **Black Hole Blackjack:** 6-deck shoe, dealer stands on 17, double down, blackjack pays 3:2.
3. **Crater Roulette:** European wheel; numbers, dozens, red/black, odd/even, low/high.
4. **Prize Wheel:** a free spin every 10 minutes, paid spins for ₵150.
5. **High-Low:** streak game, cash out any time.
6. **Prize Counter:** spend Lucky Chips (earned by wagering) on casino-only outfits and skates.
7. **Loan Shark:** Rusty "Knuckles" Vasquez lends at outrageous compound interest.

Total wagered raises your VIP tier (Bronze → Moon Royalty), which raises the max bet and unlocks prizes. Pit boss
Vinnie "The Visor" has opinions about your luck.

## Territory

No spot on the Moon is unclaimed. Territory is a weighted split around every faction's settlements and
~120 smaller outposts (watchtowers, supply depots, farm domes, relay masts, trading kiosks, scrap shacks).
Glowing faction-coloured pylons mark the borders, a chip shows whose land you're on, and the globe map is
tinted by owner. Military patrols drive between their faction's outposts and shoot pirates (never you, so
settlement threat radii are unchanged). Captured and founded outposts move the borders.

## Settings

`Esc` → SETTINGS (or the button on the title screen). Graphics: render scale, FOV, view distance, terrain
detail, shadows and their resolution, halftone, speed lines, ink strength, particles, screen shake, damage
flash, frame cap. Gameplay: mouse sensitivity, invert Y, camera distance/height/shoulder/smoothing, comic
panels and highlight-photo frequency, tips, default lamp mode, minimap, HUD scale, km/h or m/s. Audio:
master, music, effects. Controls: remap every action key (taking a key that's in use swaps the two).

## Cheat menu (testing)

Hold `=` and `` ` `` (backtick) together during play (deliberately awkward so players don't stumble into it). Options: +₵10,000 · reveal the whole map · set reputation per faction
(±10, FRIENDLY / TRUSTED / HONORED / NEUTRAL / HOSTILE, or all factions HONORED) · teleport to any location ·
god mode · unlock all gear, weapons and cosmetics · lab kit (big jar, items, 3 chimeras) · and under MORE: join
Rustmoon, spawn a pirate squad or the Mega Mite, spawn an event for any faction (and teleport to it), max out
the unlock counters, cure mutations, or reset all progress. Number keys pick, Esc closes.

## Threat Scanner

Sold at the ILMB (₵700, two levels). Look at a pirate (or the Mega Mite) and it gets a thick red comic outline
for 10 s (20 s at level 2), out to 450 m (800 m at level 2), with a wider look cone at level 2. A red HUD chip
counts hostiles closing in on you.

## Cosmetics

- **Outfits:** you start in Courier Orange. Every faction HQ sells a base outfit (FRIENDLY, ₵450) and an elite
  one (HONORED, ₵1800) with extras like crests, shoulder pads, a halo, a pirate bandana or a cape that streams
  with speed. SPACECOM's are at the ILMB, Rustmoon's at Rustmoon Hold (members only).
- **Skate finishes** (Meridian Exchange): Chrome Comets, Solar Flares (flame trail), Void Gliders, Prism Drive
  (hue-cycling, HONORED), plus deed-locked ones: Seismic Striders (complete 3 Meridian events), Derby Hooves
  (win the Chimera Derby, comes with horseshoes) and Dark-Side Survivors (5 dark-side deliveries). Most leave
  a coloured glide trail.
- **Pulse-disc colours:** eight, free, cycled in the wardrobe (`C`).
- New purchases are equipped immediately; your look is saved.

## Sound

A procedural synthwave groove (A minor, 96 BPM) plays under everything. It is a quiet pad and bass at rest and
gets louder and fuller with speed: kick drum, snare, hats and an echoing arpeggio join in as you go faster.
The wind rumble is a soft low-passed swell instead of high-frequency hiss. `N` toggles the music.

## Strange places (sunlit side)

- **Antimatter Research Lab:** a building you can walk into, with a violently spinning reactor in a glass
  tube. Dr. Zbornak sells containment jars (2 slots, upgradeable to 5). Press `G` to scoop up rock
  samples (glowing crystals), moon dirt, black water (stand on a black lake) or people. Things left in
  a jar together for 12 s react: dirt + water make Moon Mud, rock + water make Slick Rock, and a person
  + water becomes Void-Touched. Press `X` beside the reactor to throw everything in. Results include
  credits, a pet rock, a dirt golem, statues, a love match, black rain, inverted colours, low gravity,
  super-slick skates, a springy "resonance" and, with three different things, a SINGULARITY that blows you
  through the roof.
- **Chimeras (the Horsey-Game part):** put **two or more living things** in the reactor together
  (people, Void-Touched people, wild **Moon Mites**, knocked-out **pirates**, whole **hover-cars**) and out
  comes a chimera: body, legs and head are picked from the parents (car wheels, six mite legs, pirate
  boots…), sometimes with a spare head, plus mutations from anything non-living in the mix (black water
  → void aura "the Unholy", rock → crystal spikes, dirt/mud → mud blobs). Each gets a mashed-up name,
  a top speed and a chaos rating. Up to three follow you; any number more live in the **holding pen** in
  front of the lab. Use the pen terminal (or `P` anywhere once you buy Dr. Zbornak's ₵1200 remote pen link) to
  call chimeras out, send them back, or release them for good. Chimeras are saved.
- **New things to scoop:** Moon Mites skitter around sunlit craters (they flee if you rush them); hover-cars
  can be scooped straight out of traffic (two jar slots, the car is gone ~150 s); pirate skaters at ≤45 %
  hull get **DAZED** for 6 s and can be jarred (Rustmoon −3 if you're aligned).
- **Solo reactor results:** a lone mite becomes the **MEGA MITE** (600 HP stomping boss, ₵400 bounty), a
  lone car goes into orbit (₵150 hush money), a lone pirate comes out reformed with a doctorate (SPACECOM +3).
- **Splice pod** (corner of the lab, `F`): put the jar into *yourself*. The game doesn't list what it does;
  players find out by experimenting. (Spoilers follow.) Up to 3 mutations: Wheel Feet (car,
  22 m/s running), Mite Wings (mite, 60 % gravity in the air), Extra Arms (person, fire 30 % faster),
  Void Skin (water/void-touched, see in the dark and harder to hit), Stone Hide (rock, +40 hull, more drag),
  Burrower Claws (dirt/mud, painless boot landings), Pirate Blood (pirate, hunting squads mostly ignore you).
  Each shows on your runner. Dr. Zbornak cures them for ₵200 each.
- **Chimera Derby** at the Bounce Dome Funpark: walk up to the betting booth (`F`), pick one of your chimeras,
  bet ₵50/200/500 (or just for glory) against three rival creatures ("Glue Factory Escapee", "Hoof
  Hearted"…). Odds depend on how your creature's speed ranks (1.8× – 6×). Two laps around the domes, with
  chaos: stumbles, zooms, running the wrong way, giant hops, and occasionally exploding and reassembling.
  Wins land on the Hall of Highlights.
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
  alchemy.js     containment jar, reactor recipes, wild mites, followers, splice-pod mutations, Mega Mite
  chimera.js     gene splicing + procedural chimera models
  cheats.js      testing menu (backtick)
  story.js       faction leaders, chapters, outposts you found, tech, Longshot Kade
  territory.js   faction territory, border pylons, small outposts, patrols
  vehicles.js    drivable faction vehicles
  settings.js    settings menu + key remapping
  casino.js      Lucky Crater Casino games, VIP, prizes, loan shark (casinoWorld.js: the building)
  cosmetics.js   outfits, skate finishes, laser colours, wardrobe
  race.js        Chimera Derby: track, betting, chaos racing
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
