# MOON-RUNNER — Quantum-Lock Delivery Service

A comic-book 3D action-adventure delivery game set on the lunar frontier, built with
[Three.js](https://threejs.org/). You play a **Moon-runner**: a high-speed courier on
**Quantum-Lock Skates** whose magnetic cushion kills friction. Read the terrain, dive
into craters, launch off the far rims and chain momentum Tribes-style, while pirates
try to steal your cargo and military bases defend their airspace.

The Moon is a **real sphere** (about 22.6 km around), and you can ski all the way round it.
The sunlit near side holds the settlements.

The terrain is mostly smooth, cratered plain (a little over half the Moon), broken up by patches of other
country, each about an eighth of the Moon: ridged highlands with crisp crests, stepped scarps with 20 m ledges you can
launch off, rolling hills, and rille country, where wide, deep, smooth-floored channels wind for kilometres (you can
race along them, and they cut straight through crater rims). Craters keep these landforms round them, levelling only
the plain's small bumps. Craters come in several kinds:
plain bowls, ramparts with tall, firm rims that stand up off the plain, crowns whose rims swell and dip in broad lobes,
worn-down ghosts, and big terraced ones with a central peak. Besides the ordinary lumpy boulders (thicker in the
highlands), shaped rocks dot the plains: rough ramp slabs that kick you into the air, natural arches to skate through,
hoodoo spires with cap rocks, and **snake rocks**: 35–50 m ridges that wind gently over the ground with a thin crest
whose ends slope down to the ground. Land on a crest (or just skate straight into one of the tips) and you **grind** it, standing sideways and
carried along by your speed (downhill speeds you up); jump (`Shift`) to pop off, or you pop off by yourself near the
end. On the rail you drop into a low, sideways slide, leaning back with your arms out for balance, while sparks
spray off your skates (more of them, and further, the faster you go). Grinds pay style by the second. Crater lips grind too, and the rock tells you which: every rocky band
round a rim runs along the peak of a firm lip, and that's the rail. Each crater sits on its own level apron and
its lip curves up out of it like a kicker, so riding up onto the lip at up to ~60 degrees off its line
(or landing on it from a hop) throws you onto the crest; just crossing one square-on won't catch you.
Once on, you lock on and ride it round, lap after lap, until you jump
off. Where craters overlap, the shared outline is the rail, and you pop off where it meets a neighbour.

**Landings:** hard landings hurt half as much as they used to (the cargo still takes the full jolt), and a landing
with plenty of speed along the ground is a glancing blow: at 30 m/s of glide it hurts half as much again. Past the terminator lies the **dark side**: almost
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
package it into `release/`. Pushing a `v*` tag, or a commit whose message contains `[release]` (the usual way: bump
`package.json`'s version, commit `Release x.y.z [release]`, push), runs `.github/workflows/release.yml`, which
builds all three on GitHub and attaches them to a Release named after the version. What changed in each
version is in [CHANGELOG.md](CHANGELOG.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ (relative paths, host anywhere)
```

Click **START YOUR SHIFT!** to lock the mouse.

## Trailer mode

`src/trailer.js` plays the official ~90 s trailer live in the engine: 21 scripted shots (teleport, staging,
held keys, a camera per shot) joined by whip-pans, flashes and ink wipes, with comic title cards and a
zone-music medley. The plan and running order are in [docs/trailer-brief.md](docs/trailer-brief.md); the
final render is kept outside git in `trailer-out/`.

```
http://localhost:5173/?trailer         warm-up pass under a cover, then click to roll
  &auto     roll straight after the warm-up (for an OBS browser source at 1920x1080)
  &nowarm   skip the warm-up    &shot=N  start at shot N    &only  loop just that shot
  &fixed    fixed 1/60 s timestep    &pump  hidden/headless page: drive it with window.step(n), seek(n, t)
```

It never touches your saves (storage is swapped for in-memory stores in this mode). Recording: OBS records
the browser source; the trailer starts at the first bright frame after the warm-up, and the cut is
`ffmpeg -ss <start> -t 92 … -af loudnorm=I=-14:TP=-1.5:LRA=11`. Don't save source files mid-recording:
Vite's hot reload restarts the page.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look / aim |
| `W A S D` | Run in boots. On skates, `A`/`D` steer you along the ground: full input carves hard, `W`+`A` carves gently |
| `SPACE` (hold) | **Quantum-Lock Skates**: near-frictionless glide. Release to brake hard in boots |
| `E` / right mouse (hold) | Thrusters: mostly forward, with only a little lift or dive (drains JET) |
| `SHIFT` | Mag-jump; in the air, press again and hold to **Dive** |
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
| `Shift`+`X` | Dump the jar anywhere: materials are destroyed, creatures pop back out |
| `G` / `X` | Scoop into your containment jar / empty it (into the antimatter reactor when you're beside it) |
| `F` | Job board / upgrades (inside hubs and settlements) |
| `M` | Globe map: drag to spin, scroll to zoom. Fog of war covers anywhere you haven't been |
| `J` | Reputation Log |
| `R` (hold 1.5 s) | Emergency recall (₵100): a shuttle flies you to your HQ (the ILMB, the HQ of the faction whose story you've committed to, or Rustmoon Hold if you ride with the pirates); forfeits the current contract |
| `H` | Help |

## Lunar flight

The Moon is small enough that at 100+ m/s the ground curves away beneath you, so the air physics keep big air
big but bring you home: for the first second off the ground it's normal, floaty moon gravity; after that it
builds to 2.5x over two seconds, and an extra pull cancels the "orbital lift" of high speed. A hard launch at
100 m/s that used to carry you over a kilometre now lands after ~550 m. **Dive** (press Shift again in the
air and hold) tucks you nose-down at triple gravity; within ~10 m of the ground the skates' magnetic grip
catches you, and a skated dive landing is always safe. Locked skates keep hold through a magnetic buffer a
little above the ground (0.6 m, growing with speed), so bumps and crests don't skip you off; only a real ramp
or a jump breaks free. A skated dive landing is always safe and keeps most of your speed (hard ones score STUCK IT!).
Looking down while thrusting drives you downward too. The gravity build-up only applies at speed, so hopping
around on foot stays floaty and harmless.

## How it plays

**Events** wait for you: each posts a beacon with a start prop (orders terminal, sample tubes, convoy radio,
supply drop…) at a safe staging point. Walk up and press F to begin. Going down during an event fails it.
New postings are spaced out (the first comes about 40 s in, then at least 45–75 s apart). The **distress log**
above the speed tracker lists every open signal, newest on top, each in its faction's colour with its distance and
an arrow showing which way it lies from where you're looking; the event you're running is highlighted.

**Style** pays half what it used to and can at most double a contract's base reward (a ₵400 job tops out at
₵800 before condition). The package's condition then scales the whole payout.

**Rail Lance scope:** with the Rail Lance equipped, hold right mouse to scope in (E still fires thrusters).

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
  action-panel camera, run through the comic post-process, and shown on the bottom screen of the ILMB job
  terminal. They're saved in `localStorage`.
- **Job boards** are terminals: status screens (credits, standing, uplink), then a contracts screen and a gear
  screen. At the ILMB the board stands in the plaza as a kiosk of screens under a canopy.
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
  they get home. Roaming hunters are capped (at most 4 skaters and 2 rovers at once) and only chase within a
  **threat range** of about 700 m: outrun them and they give up and vanish ("LOST THEM!"), with a breather
  before the next squad. Thieves carrying your cargo and event raiders never give up.
- **Meteor showers:** rarely (the first after about 7–12 minutes, then every 15–25), a shower hits a big patch of open
  ground, never a settlement or outpost. The rocks are huge (6–13 m) and glide in slow and shallow, nearly sideways,
from about 280 m up, so you can see one coming for half a minute and plan a jump onto it. Only one at a time; the patch shows as a pulsing red zone on the globe map and
  the minimap while it lasts (about 2–3 minutes). Rocks only fall when you're near: each streaks in on the shower's slant
  with a red warning ring where it will land. They're real colliders on the way down: land on one for a METEOR
  BOUNCE (style), get hit from above and it hurts. On impact they explode into tumbling chunks and leave a smouldering
  scorch mark; everything fades away afterwards.
- **Military zones:** Fort Meridian (Atlantic Accord) and Bastion Vostok-9 (Pan-Pacific
  Directorate) sit inside red striped walls. If you enter without a contract that grants
  clearance, you get a 4-second warning. After that, turrets and patrol rovers open fire,
  and after 9 seconds artillery starts landing on predicted positions marked by red rings.
- **The dark side:** your helmet lamp switches on automatically. Pirate squads hunt you even
  without cargo, and pirate dens and camps are guarded. They don't spawn while you're inside an allied
  settlement's zone (Farside, or Daedalus once you're in their good books) or riding a transit ship. Contracts that start or end there pay
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

Deliveries to (or pickups from) a restricted base come with temporary clearance. Finishing the contract there no longer
starts the base's countdown: your clearance holds until you leave the zone, or until you shoot something inside it.

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
(Kepler), **Director Ilsa Moreau** (Daedalus) and **Captain Kade** (Rustmoon, at Rustmoon
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
  at speed hurts them. Vehicles have hull points (180 Skimmer to 480 APC) and soak most incoming fire; a hull
  bar shows while you drive, and they smoke when hurt. A wrecked vehicle explodes, throws you out and takes
  90 s to be rebuilt (other vehicles stay available). Hull repairs slowly while you're not driving it.

**Riding with Rustmoon:** once you've sworn in, Rustmoon Hold is your home base: you start, redeploy
after a K.O. and recall there.

**Captain Kade.** On the dark side, a regular pirate squad occasionally (8 %) brings the King of Rustmoon:
slow-motion, a comic splash panel and a close-up. He rolls in on a mad-max monster truck that never leaves the
ground and never rams: it skirts round you at 45-80 m, swapping direction, while a lackey works the roof
turret. On the ground the turret is a **gatling** (fast bursts of small rounds). Get well off the ground
and it switches to **flak** (FLAK! GET LOW): shells that burst in mid-air around you, stinging and nudging
you (bleeding your speed and pulling you down) rather than blasting you clear; each burst leaves a
cloud of white-hot phosphor embers that hangs and drifts for a moment before burning out. Wreck the truck for a
₵800 bounty; the first time, his **Rustmoon Junk Mortar** tumbles out in a green-beamed crate (it's also
yours if you swear in with Rustmoon). Lose him by getting 1.5 km away. Not while you ride with Rustmoon.

## Secrets (spoilers)

- **SAT-7 "Lantern"** circles the whole Moon on an inclined orbit (~200 km/h), starting each session on the far side from the ILMB. Most of the lap it's 200–300 m
  up, but just past the ILMB it dips to about 40 m. The globe map shows its dashed orbit, the LOW PASS mark and
  where it is now. Land on its deck or solar panels by matching its speed and direction (any mismatch slides
  you off). On deck is a glowing **alien artifact**: F takes it into a sealed compartment of your jar (needs
  a jar; it takes one slot and is never dumped, fed or spliced).
- **The Whispering Fissure** (twilight side, far from everything): a trench ramps down 34 m into the Moon,
  through a tunnel into a glowing chamber with a sealed alien gate. Place the artifact in the socket and the
  gate opens onto a shrine with the legendary **Xenoglide Quantum-Lock Skates**: +4 handling, and an
  antimatter jet tank (thrust ×2.2, refills twice as fast, +50 capacity), plus a unique skate finish.
- Dr. Zbornak's "Heard any rumours?" option hints at the mites, the satellite and the fissure.

## Lucky Crater Casino

A walk-in neon hall about 1 km from the ILMB. Walk through the front doors and press `F` at a station
(Esc stands you back up):
- **Blackjack table:** real 3D cards from a 6-deck shoe, dealer stands on 17, blackjack pays 3:2.
  ←/→ bet, Space deal, H hit, S stand, D double.
- **Duck Derby:** pick one of four ducks at the kiosk (1–4), bet, Space to race. Odds are fair-minus-5%,
  computed from the same race model; surges, stumbles, photo finishes.
- **Plinko:** a real-physics board (12 rows, 13 slots from 0.2× to 50×, ~94 % return). Aim with A/D or the
  mouse, Space or click to drop; hold Space for a stream of balls.
- The **Classic Games** cabinets open the slots / roulette / prize wheel / high-low overlay (blackjack now
  lives only at the 3D table); the prize
  counter (Lucky Chips cosmetics) and Rusty the loan shark are at the back. VIP tiers still raise max bets.

## Territory

No spot on the Moon is unclaimed. Territory is a weighted split around every faction's settlements and
~120 smaller outposts (watchtowers, supply depots, farm domes, relay masts, trading kiosks, scrap shacks).
Glowing faction-coloured pylons mark the borders, a chip shows whose land you're on, and the globe map is
tinted by owner. The purple line on the globe map is the terminator, the edge of the dark side (point at it
for details); SAT-7's orbit is the yellow dashes, with chevrons showing which way it's heading. Military patrols drive between their faction's outposts and shoot pirates (never you, so
settlement threat radii are unchanged). Captured and founded outposts move the borders.

Each small outpost is a 50-odd-metre compound on its own flattened plateau: a lattice **Watchtower** with a
sweeping searchlight and barracks; a **Supply Depot** with a warehouse, container gantry, fuel tanks, a pad and
a wiring rack; a twin-domed **Farm Dome** with grow lights and a sapling nursery; a 41 m guyed **Relay Mast**;
a **Trading Kiosk** market plaza; a ramshackle **Scrap Shack** with a scrap press and derrick; and a
climbable **Junk Pile** with a scavenger camp.

**What each structure gives up** (press `F` at its glowing raid ring, or shoot it down; either costs 2 rep with
the owner, and loot from a wreck is flung out onto open ground with a light pillar so you can find it):

| Structure | Drop | Use |
| --- | --- | --- |
| Farm Dome | Sapling (alive) | Splices into chimeras; ROOT GRIP mutation (+30% grip) |
| Supply Depot | ₵150–300 + Electrical Wiring | 3 wiring to Dr. Zbornak: skate grip tune (x3) |
| Watchtower | Searchlight Lens | HAWK EYE mutation (outlines reach 50% farther, sharper scope); reactor flash dazes pirates |
| Relay Mast | Signal Transponder | Reveals the map 1.4 km around you; 3 to Zbornak: event radar on the minimap |
| Trading Kiosk | Mystery Crate | Opens on the spot: credits, Lucky Chips, or a jackpot |
| Scrap Shack | Scrap Plating | 3 to Zbornak: +10 hull and +15% vehicle hull (x3) |
| Junk Pile | Junk Bot (alive) | Splices into chimeras: tank treads and a screen face |

**Raiding (details):** press `F` beside a **farm dome** to take a sapling (it goes in your jar, alive: it splices into
chimeras with root legs and flower heads, or into you as the ROOT GRIP mutation, +30 % skate grip), or beside a
**supply depot** for ₵150–300 plus a length of **electrical wiring** (into the jar). Each raid costs 2 rep with
the owner and the structure restocks after 4 minutes. You can also just **shoot them down** (a dome takes about 4
pulse hits, a depot 6): the same haul drops in the smoking wreckage, for the same rep, and they're rebuilt after
4 minutes. Bring **3 wiring** in your jar to Dr. Zbornak and he
rewinds your skate coils: +15 % grip and a little handling per tune, up to 3 tunes.

## Traffic & roads

Wreck a land-train (about 10 blasts) or a road buggy (about 3) and it drops a **salvaged engine** (jar item:
chimeras come out Turbocharged, the reactor gives you low gravity) plus scrap credits; it costs 3 rep with the
nearest town, and a replacement turns up a few minutes later.

Freighters and shuttle-buses fly real routes: they lift off vertically on their belly jets, cruise over everything
with their main thrusters pulsing, slow down and land on a pad at the edge of each settlement. The landing legs fold
out of their bays (doors first, then the legs) on the way down and tuck away again after take-off; the shuttle-bus's
rear door drops into a ramp, the freighter lowers a belly ramp. The **shuttle-bus** is a 19 m lifting-body hopper
with a wraparound windscreen, porthole windows, two ducted lift-fans and a lit route board on the roof; the
**freighter** is a ~70 m hauler with a rideable flat deck (landing circle and all), a bridge tower at the bow,
container racks down both flanks, swept radiator wings and a four-bell engine cluster.
**Hitch a ride for free:** walk up to a landed shuttle-bus or freighter and press `F` to hop in (the prompt says where
it's headed). You ride inside while the camera hangs back to watch the ship; press `F` again to hop out down the ramp,
or bail out mid-flight through the side hatch (keeping the ship's speed, with a little style for the nerve). Passengers walk off toward town, the queue
at the shelter walks up and boards, and the doors close before it leaves; arriving passengers walk to real
building entrances. Safe settlements are joined by a network of 12 pre-driven **dirt roads** (worn ruts,
marker posts) that merge into a big **ring road** around each town, with one stop shelter on the ring. Big six-wheeled **land-trains**,
hover-cars and buggies each pick a destination town: some pass straight through towns, others stop to
swap passengers and then head somewhere new. You can ride on a freighter deck or a land-train trailer.

## Townspeople

**Hurting people has consequences.** Residents, passengers and wanderers go down in 2–3 hits and get
ragdolled by explosions; survivors flee with their hands up and bystanders panic. If a settlement sees you do
it, its security goes on alert for 75 s (turrets and patrols open fire) and you lose rep (−3 per hit, −8 per
knock-out). Pirate dens send out extra guards. Residents are replaced a few minutes later.

There's no air on the Moon, so every human outdoors wears a sealed helmet or a fishbowl (kids a bubble). The
bare-headed folk are the **Vrill**: an antennaed people who breathe vacuum just fine. Jar one and it's a
living jar item: it splices into chimeras (antennaed heads) or into you as the **PSI ANTENNAE** mutation (red
enemy outlines show through buildings).

Residents, passengers and walkers come in many looks: colony coveralls, lab coats with clipboards, engineers
in hard hats and tool belts, traders in jackets and ties, elderly folk with canes, bulky EVA suits with
fishbowl helmets, hoodies, and kids in bubble helmets, with varied skin, hair, builds and headgear.

## Founded outposts

Outposts you found for a faction story sit on flattened ground, with a 10 m hub dome, an entry tunnel to the
terminal, a paved yard and six marked plots for modules, which are built at roughly a third of settlement
scale.

## Defences

Walled settlements (the ILMB and the military fortresses) mount their guns on bastions built into the walls and
on the gate towers, so they cover both the approaches and the inside with almost no blind spots. Unwalled
settlements raise their guns on pylons. Guns hold fire when a building or the terrain is in the way.

## The International Moon Base

The central dome is joined by wide glass skywalks, with people walking inside, to six distinct buildings:
Hydroponics (glass greenhouse dome), Meridian Labs (leaning observation tower), Vostok Hangar (parked
shuttle), Daedalus Relay (big rotating dish and mast), the Power Block (cooling towers) and the Kepler
Habitat ring.

## Main menu & saves

**Music** is all synthesised live. Roaming has a speed-driven synthwave groove whose layers build as you go faster;
the Lucky Crater Casino plays a swung, jazzy lounge track; Chimera Downs a space-western (galloping rhythm, twangy
guitar, a lonesome whistle); Dr. Zbornak's lab something clinical and slightly wrong (whole-tone pings, bubbling
glassware, a theremin); and the dark side an aggressive darksynth. Tracks crossfade as you move between them.

The title screen slowly circles one sunlit place after another (the ILMB, Meridian, Kepler, the casino and
more) to its own faster, brighter synthwave track (it starts with your first key or click).

The game opens on a main menu: CONTINUE, NEW GAME, LOAD GAME, SETTINGS (and QUIT in the desktop app). There
are three save slots, each showing credits, deliveries, story faction, play time and last played; slots can
be deleted (with a confirm). Progress is saved to the active slot every few seconds and on every delivery,
purchase and K.O. Settings are shared by all slots. The pause menu has QUIT TO MAIN MENU. Pausing (and the map,
dialogs, job board and wardrobe) freezes the whole world: traffic, the satellite, particles and timers.

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

## Enemy outlines & Threat Scanner

Every hostile you can actually see (pirates, the Mega Mite, units of a base you've angered) gets a thick red
outline in real time, out to 380 m, for as long as you keep line of sight; terrain and buildings both break it.
The **Threat Scanner** (ILMB, ₵700, two levels) extends that to 520 m / 800 m, keeps anything you look at
marked for 10 s / 20 s after it ducks out of sight, and a red HUD chip counts hostiles closing in.

## Enemy tactics

Pirate skaters close in, then circle you at 25–40 m, switching direction every few seconds, turning to shoot
while they strafe (while you carry cargo about half of them still dive in to grab it). War-rigs line up a run,
charge at up to 66 m/s, peel off sideways after the pass and swing round for another. Rovers grip the ground
over crests; only a rig at full ramming speed gets thrown into the air.

## Cosmetics

- **Outfits:** you start in Courier Orange. Every faction HQ sells a base outfit (FRIENDLY, ₵450) and an elite
  one (HONORED, ₵1800) with extras like crests, shoulder pads, a halo, a pirate bandana or a cape that streams
  with speed. SPACECOM's are at the ILMB, Rustmoon's at Rustmoon Hold (members only).
- **Skate finishes** (Meridian Exchange): Chrome Comets, Solar Flares (flame trail), Void Gliders, Prism Drive
  (hue-cycling, HONORED), plus deed-locked ones: Seismic Striders (complete 3 Meridian events), Derby Hooves
  (win a race at Chimera Downs, comes with horseshoes); the casino's Lucky Felt and Jackpot Rollers leave glittery
  smoke with poker chips or gold coins popping out, and wear boot medallions and Dark-Side Survivors (5 dark-side deliveries). Most leave
  a coloured glide trail.
- **Pulse-disc colours:** eight, free.
- **Wardrobe (`C`):** a full screen with a live 3D preview of your runner facing you (drag to turn). Tabs for
  outfits, skates and lasers; hover any item (even a locked one) to try it on, click or Enter to wear it.
  Locked items say exactly how to get them (shop, price, standing needed, casino chips, or a legendary hint).
- New purchases are equipped immediately; your look is saved.

## Sound

A procedural synthwave groove (A minor, 96 BPM) plays under everything. It is a quiet pad and bass at rest and
gets louder and fuller with speed: kick drum, snare, hats and an echoing arpeggio join in as you go faster.
The wind rumble is a soft low-passed swell instead of high-frequency hiss. `N` toggles the music.
Zones have their own tracks (casino, Chimera Downs, the lab, the dark side) with crossfades. The Downs has no
crowd-noise bed for now (the cheering is due a rework), and the race countdown beeps sit well under the music.

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
  comes a chimera, which climbs out of the reactor tube, leaps clear and lands beside you before its
  result card shows. Body, legs and head are picked from the parents (car wheels, six mite legs, pirate
  boots…), sometimes with a spare head, plus mutations from anything non-living in the mix (black water
  → void aura "the Unholy", rock → crystal spikes, dirt/mud → mud blobs). Each gets a mashed-up name,
  a top speed and a chaos rating. Wheel and tread legs sit on a chassis base, so they never
  hang off thin air. Up to three follow you; any number more live in the **holding pen** in
  front of the lab. Use the pen terminal (or `P` anywhere once you buy Dr. Zbornak's ₵1200 remote pen link) to
  call chimeras out, send them back, or release them for good. Chimeras are saved.
- **New things to scoop:** Moon Mites roam sunlit craters in herds of 3–6, away from settlements (green dots on the minimap within ~400 m; they flee if you rush them); hover-cars
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
- **Chimera Downs** (the racecourse, a short hop from the Funpark): a four-lane dirt oval with a grandstand full of
  cheering fans, a jumbotron with live standings, a finish gantry, distance poles, a winner's circle and a golden
  chimera statue. The **race office** window (`F`) posts races over time, **up to three on the card**, each with
  its own **distance** (450 m sprints, miles, 2–2.8 km stakes and 3–3.6 km marathons), **class** (C, B, A or S
  and under, or open), **going** (FAST, DUSTY, HEAVY: tiring, LOW-G: bouncy and chaotic), purse (60/25/15 % to the
  top three), entry fee and a pre-drawn field of three rivals ("Glue Factory Escapee", "Hoof Hearted"…). Races close
  after a few minutes and new ones post every minute or so. Pick a race, pick a chimera (grade must fit the class),
  then enter alone or with a ₵50/200/500 bet.
  Every chimera has four stats (1–100) and a C/B/A/S grade, set mostly by its parts plus some randomness:
  **SPEED** (top speed: wheels, void, crystal), **POWER** (acceleration, and recovery after a stumble: mite legs,
  turbo, spark), **STAMINA** (how long before it tires: roots, treads, armour, mud; it decides the long races) and
  **WIT** (fewer stumbles, wrong-way runs and trips: alien and person heads, lenses, radios). The bookie simulates
  the exact race (distance and going included) a few hundred times to set the odds.
  **While your chimera races, the camera locks onto it:** `1`–`5` (or `C`) switch between chase, infield rail,
  leader, grandstand and blimp cameras, the mouse orbits the chase cam, and `SPACE` spends one of three **crowd
  cheers** for a short surge that burns stamina (a dim creature may get spooked instead). Chaos as ever: stumbles,
  zooms, wrong-way runs, giant hops, and the occasional explosion and reassembly. Wins land on the Hall of Highlights.
- **The Monolith:** touch it (90 s cooldown) and it casts one of three spells, never the same twice running: **Low-G** (30 s at under half gravity), **Time Dilation** (20 s with pirates, their shots, traffic and meteors at 40 % speed while you keep full speed) or **Echo Decoys** (30 s with three holograms of you skating alongside; anyone shooting at you picks one of the four at random, and a hologram shatters when hit).
- **Bounce Dome Funpark:** inflatable domes, a turreted bouncy castle and a row of trampolines that throw you back
  up harder than you landed, plus a **skate park**: a volcano bowl (ride up the outside and drop in, or hit it fast and
  fly clean over), a kicker line with a big launch off the plateau edge, a quarter-pipe wall and a pyramid funbox, out
  on the east side. The big ferris wheel (twelve open gondolas, ~50 m tall) and the carousel are **rideable**: `F`
  beside one pops you into the nearest gondola or onto the nearest horse, `F` hops you off (from the top of the
  wheel, too, if you're brave). (The chimera races moved to Chimera Downs.)

## Locations

| Location | Type | Notes |
| --- | --- | --- |
| International Moon Base (ILMB) | SPACECOM HQ | Fortress walls, turrets, artillery, embassies, job board, repair bay, launch pad, Hall of Highlights |
| Meridian Exchange · Shackleton Radar Array · Helium-3 Exchange | Meridian | Trade hub (trading tower with a price ticker, warehouses, a container gantry and tower cranes at work), radar research (an observatory with a turning cupola), and a working strip-mine (bucket-wheel excavator, ore conveyor, pumping derrick, Horton-sphere tank farm) |
| Kepler Civic Center · Tranquility Commons · Aldrin Heights · Twilight Waystation · Hertzsprung Refuge | Kepler | Towns, safe rest and repair |
| Farside Listening Post | SPACECOM (dark side) | Hazard-pay destination |
| Bastion Vostok-9 · Vostok-4 Outpost | Vostok | Restricted zones: turrets, patrols, artillery |
| Daedalus Citadel · Daedalus Forward Post | Daedalus (dark side) | Restricted zones: turrets, patrols, artillery |
| Rustmoon Hold · Scrapjaw Gulch · Blackrock Den · Gloom Harbor + scattered camps | Rustmoon (dark side) | Stolen cargo is fenced at the nearest working den |
| Chimera Downs | Racecourse | Grandstand, jumbotron, race office with a rotating race card; chimera racing and betting |

## Keeping it light on the GPU

- **Terrain LOD streaming:** the cube-sphere is split into 1,536 chunks. Each frame the game
  picks a detail level per chunk (5 levels by distance, from a ~4.4 m grid within ~130 m of you
  up to ~70 m cells far off), skips chunks past the horizon, builds
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
- Shattered crater rims: a band of broken regolith along the peak of every grindable lip (an uneven rocky core breaking up into patches, a scuffed halo, dark pebbles and bright chips of fresh rock that fade out with distance), worked out per pixel from the ~64 nearest craters so it never follows the terrain triangles. The rocky band and the grind rail come from the same measurement (planet.rimOf): only firm lips get either. Overlapping craters share one outline round the whole cluster (a crater on the floor of one at least twice its size keeps its own); the giants (over 120 m) get neither. The terrain's toon ramp has soft steps, so lighting bands don't saw-tooth round steep walls
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
  story.js       faction leaders, chapters, outposts you found, tech, Captain Kade
  kade.js        Captain Kade's gun truck: orbit driving, gatling and flak turret, Junk Mortar drop
  monolith.js    the Monolith's spells: low-G, time dilation, echo decoys
  territory.js   faction territory, border pylons, small outposts, patrols
  vehicles.js    drivable faction vehicles
  settings.js    settings menu + key remapping
  casino.js      Lucky Crater Casino games, VIP, prizes, loan shark (casinoWorld.js: the building)
  cosmetics.js   outfits, skate finishes, laser colours, wardrobe
  race.js        Chimera Downs: racecourse, race card, betting, locked race camera, chaos racing
  rides.js       hop-in rides: free transit-ship rides and the Funpark's ferris wheel and carousel
  rocks.js       shaped rocks (ramps, arches, hoodoos, snake rails) and their colliders
  rails.js       grinding the snake rocks' crests and crater rims
  meteors.js     meteor showers: the warning zone, falling rocks (colliders), chunks and scorch marks
  chimerastats.js chimera racing stats and the race model (distance, going, cheers) the bookie simulates
  highlights.js  action-shot capture (shown on the ILMB job terminal)
  physics.js     collider hash + shared skater movement model (player and pirate skaters)
  player.js      input → movement, weapon, animation, style events
  enemies.js     pirates (skaters/rovers), military bases, turrets, artillery, theft/recovery
  missions.js    contract generation, pickup/delivery, integrity, payouts
  world.js       sky, settlement layout, colliders, ambient life
  settlements.js detailed settlements, HQs and landmarks built with the outpost kit (moving parts, skate park)
  traffic.js     landing pads, ship/bus flights and passengers, dirt roads, land-trains, cars, buggies
  wardrobe.js    wardrobe screen with live 3D preview
  trailer.js     trailer director mode (?trailer): the official trailer, shot by shot, from live gameplay
  models.js      stylised characters and vehicles from primitives; loads the Blender runner and ships
  post.js        comic post-processing shader
  fx.js, hud.js, audio.js, input.js, toon.js, locations.js, rng.js
  assets/runner.glb  the Moon-runner model (player, pirate skaters, story leaders)
  assets/ships.glb   the shuttle-bus and freighter, with folding gear, ramps and thruster flames
  assets/skimmer.glb the Daedalus Phase Skimmer (hover-racer with spinning phase coils)
  assets/warrig.glb  the Rustmoon pirate war-rig (patchwork mad-max rover with a spiked ram plow)
tools/
  blender/build_runner.py  builds the runner in Blender and exports src/assets/runner.glb
  blender/build_ships.py   builds both transit ships in Blender and exports src/assets/ships.glb
  blender/build_skimmer.py builds the Daedalus skimmer -> src/assets/skimmer.glb
  blender/build_warrig.py  builds the pirate war-rig -> src/assets/warrig.glb
  blender/kit.py           shared geometry/material/export helpers the skimmer and war-rig builders exec
  viewer.html              dev-only model viewer (npm run dev, then /tools/viewer.html?m=shuttle|freighter|mite|lineup…)
```

**Editing the runner:** run `tools/blender/build_runner.py` in Blender (Scripting tab, or
`exec(open(r"<repo>/tools/blender/build_runner.py").read())`); it rebuilds the model and re-exports
`src/assets/runner.glb`. Each part's material name is a colour slot (suit, accent, helmet, visor, scarf…)
that outfits recolour, and the scarf stays a 4-link chain driven by `ScarfSim`.
