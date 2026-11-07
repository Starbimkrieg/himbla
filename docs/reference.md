# Moon-Runner reference

Everything the [README](../README.md) leaves out: building, controls, the feature list and the source map.

## Run and build

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/
```

Click **START YOUR SHIFT!** to lock the mouse.

- `npm run app` runs the desktop version; `npm run dist:win|dist:linux|dist:mac` packages it into `release/`.
- Release builds use `vite build --mode release`, which strips the dev tools (F8 menu, cheats, F3 overlay, git menu,
  Asset Row, `?trailer`, `window.game`). `npm run build:release` makes one; `npm run check:dev-strip` proves it.
- To release: bump `package.json`, commit `Release x.y.z [release]` and push (or push a `v*` tag).
  `.github/workflows/release.yml` builds all three platforms and attaches them to a GitHub Release.

## Trailer mode

`src/trailer.js` plays the ~77 s trailer live in the engine (21 scripted shots). Plan:
[trailer-brief.md](trailer-brief.md). Saves are never touched.

```
http://localhost:5173/?trailer   warm-up, then click to roll
  &auto     roll right after the warm-up (OBS browser source, 1920x1080)
  &nowarm   skip the warm-up    &shot=N  start at shot N    &only  loop that shot
  &fixed    fixed 1/60 s step   &pump    headless: drive with window.step(n), seek(n, t)
```

Cut the OBS recording with `ffmpeg -ss <start> -t 77.5 … -af loudnorm=I=-14:TP=-1.5:LRA=11`. Don't save source
files while recording (hot reload restarts the page).

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look / aim |
| `W A S D` | Run; on skates `A`/`D` carve |
| `Space` (hold) | Skates on (release to brake in boots) |
| Right mouse (hold) | Thrusters (uses JET); Rail Lance: scope |
| `Shift` | Mag-jump; again in the air to **Dive** |
| `Q` + `W`/`S` · `Q` + `A`/`D` | Flips · spins (in the air); thrusting mid-trick pushes the way you face |
| Left mouse | Fire |
| `1`-`4` | Pulse Spinner, Vostok Scattergun, Daedalus Rail Lance, Rustmoon Junk Mortar |
| `E` · wheel | Use / pick a power (Phase Dash, Teleporter `T`, Slipstream Vanes, Hitch-Line Winch, pen link `P`) |
| `V` (hold: radial) | Call, board or leave a vehicle |
| `F` | Interact, job board |
| `G` · `X` (hold) | Scoop into the jar · empty it (into the reactor if beside it) |
| `Shift`+`X` (hold) | Dump the jar anywhere |
| `C` | Wardrobe (`J` there toggles the jar) |
| `M` · `J` | Globe map · Reputation Log |
| `R` (hold 1.5 s) | Emergency recall to HQ (₵100; fails everything running) |
| `N` | Music on / off |
| `Esc` | Pause, settings, help |

### Controller

Any standard gamepad (Xbox, PlayStation, Switch Pro). Whichever device you touch last takes over, and prompts
follow it.

| Button | Action |
| --- | --- |
| Left stick · right stick | Move / carve · look |
| `A` · `B` | Jump / dive · tricks |
| `X` · `Y` | Interact · vehicle |
| `LB` (hold) · `RB` | Skates · power |
| `LT` · `RT` | Thrusters (Rail Lance: scope) · fire |
| `L3` · `R3` | Thrusters · scoop |
| D-pad ← → · ↑ | Weapon · next power |
| D-pad ↓ | Radial menu (vehicles, powers, wardrobe, log, empty jar) |
| `Circle` + tilt (PlayStation) | Gyro steering and tricks |
| `View` (tap · hold) · `Start` | Map · recall · pause |

In menus the d-pad moves, `A` picks, `B` backs out, `LB`/`RB` switch tabs. The casino games, Derby camera and map
cursor all have pad controls.

**Rumble** works on any pad the browser exposes motors for (strength in Settings → Gameplay). **PlayStation link**
(WebHID, automatic in the desktop app; CONNECT in Settings in a browser) adds Bluetooth rumble, the lightbar and
player lights (skate colour, health), DualSense adaptive triggers, and a TEST button.

## How it plays

- **Skiing physics:** gravity pulls toward the Moon's centre. Skates are nearly frictionless and turn downhill pull
  into speed, so diving through craters *gains* momentum. A magnetic grip keeps you on the ground over bumps; real
  ramps still launch you. Tune `grip`, `gripWindow`, `gripRange` in `src/config.js`.
- **Lunar flight:** the first second of air is normal moon gravity, then it builds to 2.5x so big jumps come back
  down. **Dive** drops you at triple gravity; skated dive landings are always safe.
- **Landings:** boots hurt on hard landings; skates absorb most. Fast glancing landings hurt less. Cargo takes the
  full jolt.
- **Tricks:** flips and spins score style if you land upright; crooked landings **WIPE OUT**. Thrusters fired while
  turned in a trick push along the body at 70% power (a quarter backflip lifts you, a half spin brakes; `TRICK_THRUST`
  in `src/player.js`). Vehicles have solid decks you can ride. **SKY-HIGH!** at 40 m up, **BIG AIR** after 5 s in the
  air.
- **Style combos:** flips, spins, BIG AIR, dive landings, grinds, meteor bounces and riding the Hitch-Line at 50+ m/s
  all feed one run, shown live on the **style meter** (bottom right: rank, moves, multiplier, total). Air time scores only
  as BIG AIR (5 s up); shorter air scores nothing and doesn't start the meter. The run stays open on a rail, hitched and
  in a BIG AIR, and banks 0.7 s after its last move (long enough to land onto a rail or fire the winch): the moves' sum
  times the multiplier (+0.5 per kind of move past the first, air time not counting) into the style pool. Ordinary air
  doesn't hold it, so jumping straight off a landing banks the run as you land (that jump's trick counts): a big run
  takes a big jump, not a string of hops.
  A wipeout or crash loses it (`src/combo.js`, `src/stylemeter.js`).
- **Grinding:** firm crater lips are rails. Land on one or ride onto it at an angle
  to grind; `Shift` pops off. Grinds pay style per second; a clean trick landed onto a rail counts. At Chimera Downs the
  buildings' edges grind too (LEDGE GRIND: roofs, canopies, parapets, walls, steps, counters): the top edges of their
  colliders (`src/ledges.js`), taken only on skates, from the air, heading along the edge; stretches join round gentle bends
  (30 degrees), so a round pen's fence grinds all the way, and only where the rider fits (nothing beside or over the edge
  to knock him off). You ride on at the speed you came in with, bled off slowly by friction; under 5 m/s on any rail you
  lose your balance and bail (and slower than that you don't get on).
- **Terrain:** cratered plains plus highlands, scarps, rolling hills and long rilles. Craters range from bowls to
  terraced giants. Ramp rocks (strata slabs, curved kickers, whalebacks, each turned so its entry meets the ground flush) and
  monoliths (sheared spires, toppled halves, house rocks, cracked boulders) dot the plains among the boulders.
- **Deliveries:** contracts at job boards, each with cargo type, fragility, pirate risk, distance and a tight clock.
  Pay depends on condition, time and style (style can at most double the base). Late jobs still pay 50%.
- **Events:** each faction keeps one beacon open (start with `F`). The distress log lists open signals by distance.
  Going down or recalling fails an event.
- **Pirates:** "hot" cargo draws skaters and war-rigs. If one stays close they steal it and run for Scrapjaw Gulch;
  shoot or ram them to drop it. Outrun them past ~700 m and they give up. Thieves never give up.
- **Enemy tactics:** skaters circle and strafe; war-rigs make ramming passes at up to 66 m/s.
- **Military zones:** Fort Meridian and Bastion Vostok-9. Enter without clearance and you get 4 s before turrets
  fire and 9 s before artillery.
- **Dark side:** pirates hunt you even without cargo. Contracts there pay 1.6x. Twilight Waystation is the last
  safe stop.
- **Meteor showers:** every 15-25 min a shower hits open ground (red zone on the map). Land on a falling rock for a
  METEOR BOUNCE and chain them. Impacts kill whatever is underneath.
- **Enemy outlines:** visible hostiles get a red outline out to 380 m. The **Threat Scanner** (ILMB) extends it.
- **First shift:** **BOLT**, a training drone, teaches the controls and rides along for two safe deliveries.
  Skippable.
- **Living world:** hover-cars, buses, freighters, rockets at the ILMB, crawlers, walkers and kids.

## Factions and reputation

| Faction | What they are | HQ |
| --- | --- | --- |
| **SPACECOM** | International Moon Force | International Moon Base (ILMB) |
| **Vostok** | Military, at war with Daedalus | Bastion Vostok-9, Vostok-4 Outpost |
| **Meridian** | Trade and research | Meridian Exchange |
| **Kepler** | Civilian settlements | Kepler Civic Center |
| **Daedalus** | Dark-side military, at war with Vostok | Daedalus Citadel, Forward Post |
| **Rustmoon** | Pirate clans (hidden until you meet them) | Rustmoon Hold |

Standing runs HOSTILE, WARY, NEUTRAL, FRIENDLY, TRUSTED, HONORED. Deliveries and events raise it; shooting a
faction's people lowers it. Helping Vostok angers Daedalus and vice versa.

- **Pay** scales with standing. FRIENDLY factions offer ★ PRIORITY contracts.
- **Clearance:** FRIENDLY with Vostok or Daedalus stops their turrets and opens their shops. Deliveries into a
  restricted base give temporary clearance.
- **Gear** by faction: SPACECOM Seeker Module, Meridian Gyro-Edges and Market Uplink, Kepler Twin Cradle, Cargo
  Foam (cargo jostle) and Hitch-Line Winch, Vostok Flak Weave (+10 HP and 1 HP regen per 3 s tick, per level) and
  Weapon Tuning Kit (+15% damage per level); three-level gear needs FRIENDLY, TRUSTED and REVERED standing, Daedalus Overcharger, Rustmoon Shadow Rig. Rustmoon's black market smuggles
  in other factions' kit.
- **Hitch-Line Winch:** `E` fires a cable onto a vehicle or structure within 120 m and reels you in for up to 20 s.
  The cable bends round obstacles. Swing behind rovers or under flying transits.
- **Weapons:** Scattergun (FRIENDLY Vostok), Rail Lance (FRIENDLY Daedalus, pierces everything but rock), Junk
  Mortar (Rustmoon members).
- **Upgrades** at the ILMB repair bay: Flux Capacitor, Ablative Plating (+15 HP per level), Mag-Cushion Dampers
  (landings only), Threat Scanner, and the SPACECOM Seeker Module.
- **Story upgrade rewards:** a mission that grants an upgrade gives level 1, or the next level free if you already own
  it (`story.js`, up to the shop's max).

### Events

- **Clear a pirate den** (SPACECOM, Vostok, Daedalus): destroy its pylon.
- **Strike** (Vostok, Daedalus): destroy the rival's turrets.
- **Seismic survey** (Meridian): plant and defend a seismograph.
- **Black lake sample** (SPACECOM, Meridian): bring back a tube of sloshing fluid; you're paid for what's left.
- **Downed transit** (Meridian, Kepler): escort a crawler to safety.
- **Supply drop / relay sweep** (Kepler, SPACECOM): reach every pod in time.
- **Raid** (Rustmoon members): knock out a settlement's defences, up to the ILMB itself.
- **Pirate Wreck** (once): save a stranded pirate to unlock joining Rustmoon. Fail and Rustmoon is closed for good.

## Faction stories

Each HQ has a leader with a story: Admiral Ada Okonkwo (SPACECOM), General Yuri Volkov (Vostok), Chairwoman
Lucinda Vane (Meridian), Mayor Hettie "Gran" Pike (Kepler), Director Ilsa Moreau (Daedalus) and Captain Kade
(Rustmoon). Chapters unlock at 10, 15, 25, 35 and 45 rep. **Finishing a first chapter commits you** to that story.

Big fights bring allied backup and troops. Bosses: the SPACECOM armoured convoy, the Daedalus Warden and the Vostok
Hammer.

- **Military** (SPACECOM, Vostok, Daedalus): capture outposts to move borders and unlock vehicles.
- **Kepler:** haul fragile prefab parts to found homesteads, survey a town site, then ride to every HQ for the Moon
  Council's votes.
- **Research** (Meridian, Daedalus): sensor relays, phase-field experiments, antimatter runs. Rewards: Phase Dash,
  Personal Teleporter, Deflector Shield.
- **Rustmoon:** raid SPACECOM, crack a convoy, steal a Meridian vault, storm the ILMB. Members use Rustmoon Hold as
  home.

**Finales change the Moon for good:** SPACECOM ends the pirates; Vostok or Daedalus absorbs the other; Rustmoon makes
the Moon lawless; Kepler gives you **your own town**; Meridian sends you to **the Spindle**, a cylindrical asteroid
you can run around, for the **Quantum Slipstream Vanes** (steer in the air for 10 s).

**Your town** has eight plots for nine buildings: Housing Domes, Market Hall, Clinic (respawn point), Greenhouse
Farm, Motor Pool, Militia Barracks, Roads, Radio Tower (charts fog) and Shuttle Pad. From the council hall you call
**Moon Council** votes (ceasefire, Open Skies, Free Trade, Militia Pact) that reshape the Moon.

**Founded outposts** have six plots for modules: Greenhouse, Clinic, Beacon (fast travel), Militia Turret, Market and
Garage, plus a second turret by the gate.

**Vehicles** (`V`): SPACECOM Lunar Interceptor, Vostok BTR-M APC (turret cannon), Daedalus Phase Skimmer (hover),
Kepler Homestead Mule, Kepler Militia Carrier, Meridian Courier Light-Bike (light trail; holding fire lays hard light, a
near-solid stretch of trail that walls off pursuers and traffic, from a WAKE bar that refills like the jets), Rustmoon War-Rig (a pirate
gunner on the roof turns its rotary gun where you look; left mouse fires a 20-round tracer burst, then it cools for 2 s).
They have hull points, smoke when hurt, and take 90 s to rebuild if wrecked.

**Captain Kade** sometimes (8%) rides with a dark-side squad in a monster truck with a gatling and flak turret.
Wreck it for ₵800 and, the first time, his Junk Mortar. Not while you ride with Rustmoon.

## Places

| Location | Faction | Notes |
| --- | --- | --- |
| International Moon Base (ILMB) | SPACECOM | Fortress, job board, repair bay, launch pad, six buildings joined by skywalks: Hydroponics (a greenhouse dome lit by heliostats), Meridian Labs (a sky lab on a leaning pylon), the Vostok Hangar (open to skate into), the Daedalus Relay (phased arrays), the Power Block (a D-He3 fusion plant you can drive under) and the Kepler Habitat (the Orrery ring) |
| Meridian Exchange · Shackleton Radar Array · Helium-3 Exchange | Meridian | Trade hub with live ticker and motor pool; radar dishes; strip-mine |
| Kepler Civic Center · Tranquility Commons · Aldrin Heights · Twilight Waystation · Hertzsprung Refuge | Kepler | Towns, rest and repair |
| Farside Listening Post | SPACECOM (dark side) | Hazard-pay dish array |
| Bastion Vostok-9 · Vostok-4 Outpost | Vostok | Restricted |
| Daedalus Citadel · Forward Post | Daedalus (dark side) | Restricted |
| Rustmoon Hold · Scrapjaw Gulch · Blackrock Den · Gloom Harbor | Rustmoon (dark side) | Stolen cargo is fenced here |
| Lucky Crater Casino | | About 1 km from the ILMB |
| Chimera Downs | | Racecourse |
| Antimatter Research Lab | | Dr. Zbornak's lab |

Walled settlements mount guns on bastions and gate towers; open ones use pylons.

### Lucky Crater Casino

A walk-in hall with slot carousels out front. Press `F` at a station:

- **Blackjack:** 3D cards, 6-deck shoe, dealer stands on 17, blackjack pays 3:2.
- **Duck Derby:** bet on one of four costumed ducks; odds come from the race model.
- **Zero-G Claw** (₵200): fly a claw through a tank of floating, interacting junk (magnets, mines, lockboxes) and
  bank it. Each round deals a new tank.
- **Plinko:** real physics, 0.2x to 50x.
- **Classic Games** cabinets: slots, roulette, prize wheel, high-low. Lucky Chips buy cosmetics at the prize counter.

### Antimatter Research Lab

- **Containment jar** (Dr. Zbornak, 2-5 slots): `G` scoops rocks, dirt, black water, people, Moon Mites, dazed
  pirates or hover-cars. Things left together react (Moon Mud, Slick Rock, Void-Touched).
- **The lab** (the Rotunda): a domed round lab 64 m across on the plateau, the antimatter reactor rising through its
  oculus. Walk up the ribbed airlock tunnel and stop on the plate: the security camera scans you, photographs you (the
  picture shows on the screen by the door), and the outer vault hatch swings open on its hinge. 6 m in, it swings shut
  behind you; the tube cycles and the inner hatch swings into the lab. A hatch waits while you stand in its sweep (the
  hazard arc on the floor). Going out runs the other way. Inside: the reactor and its catwalk (a glass
  lift on the west: stand on the car and it takes you up or down) with the intake hatch, sealed bioluminescent hydroponics, exotic-matter canister racks, cryo pods holding chimeras, a holotable, an
  equipment corner (chemistry and microscope benches, battery chargers) round LABNET's wall display with
  four live drone feeds of settlements at its sides, and a robot cell whose three arms run three jobs in turn: weld an armour plate onto a chimera,
  take a power cell from the gantry's hoist and seat it in a dock, and scan a chimera turning on its jig. Wall
  projections show the drone net, the splicer and the cell live.
- **Reactor** (`X` at the intake hatch): throw the jar in for credits, pets, low gravity, or a SINGULARITY.
- **LABNET** (`F` at the desk before its wall display): your splices, everything you've thrown into the reactor (each
  result, how often, the first experiment number) and your chimeras, with full details once unlocked and the newest entry
  marked.
- **Chimeras:** two or more different kinds of living thing make a chimera: body, legs and head drawn at random from
  them, mutations from anything non-living in the mix, a name, racing stats, a **growth** (one stat 25-40 % faster in
  training, or two 15-25 %) and a **running style**. Each is built from the Blender chimera kit (docs/chimera-builder/;
  a settler wears the outfit of the person you scooped). Three follow you at your sides; the rest live in the
  **holding pen** at the ranch east of the lab (the terminal is in the barn's office; `P` with the remote pen
  link), where residents graze round the feed bunk. Retired racers can be sold to the Lunar Stud Farm.
- **Solo results:** a lone mite becomes the **MEGA MITE** boss.
- **Splice pod:** put the jar into yourself for up to 3 mutations (spoilers in-game). Zbornak cures them.

### Chimera Downs

A racecourse with grandstands, clubhouse, screen drum, podiums, arcades, a stable yard behind the far stand
(docs/stable-proposals/: two lanes of boxes with chimeras looking out, a paddock and lunge ring, the hay barn) and a
fairground (rideable ferris wheel and carousel), all under a glass dome 544 m across. The way in is through one of three
airlocks, on the forecourt gate's axis (teleports land in front of this one) and the west and east gates'. Walk or drive up
and the door opens. Go 6 m in and it shuts behind you; the chamber cycles (red lamps, an amber light, a hiss) and the far
door opens. The race office keeps one race posted in each of three sections
(EASY, MEDIUM, HARD), each with a distance, going, purse and five rivals; a scouting screen shows every runner's card.
No odds: a win pays the section's flat multiple. Chimeras have SPEED, POWER, STAMINA and WIT; six runners fight for the
rail, draft, pass and kick on what is left in the tank, and fire **skills** learned from wins. **Careers:** three
seasons of three races and a tournament each (the Triple Crown), training sessions banked per race and spent at the
**Training Yard** in the stables, then retirement. While racing, `1`-`5` switch cameras, the HUD steps aside, and the
mouse drags the camera or the standings. Nobody ragdolls at the Downs. The numbers: `docs/chimera-racing.md`.

### The Monolith

Touch it (90 s cooldown) for **Time Dilation**, **Echo Followers** (holograms that copy you) or a random
**Teleport**.

### Secrets (spoilers)

- **SAT-7 "Lantern"** orbits the Moon, dipping to ~40 m just past the ILMB. Match its speed to land on its deck and
  take the **alien artifact**.
- **The Whispering Fissure** (twilight side): a tunnel to a sealed alien gate. The artifact opens it onto the
  **Xenoglide Skates**.
- Ask Dr. Zbornak "Heard any rumours?" for hints.

## Territory, traffic and people

- **Territory:** every spot belongs to a faction, split around settlements and ~120 small outposts (Watchtower,
  Supply Depot, Farm Dome, Relay Mast, Trading Kiosk, Scrap Shack, Junk Pile). The minimap chip and globe map show
  the owner. Patrols drive between outposts. Captures move the borders.
- **Raiding outposts** (`F` at the ring, or shoot it; -2 rep, restocks after 4 min):

  | Structure | Drop | Use |
  | --- | --- | --- |
  | Farm Dome | Sapling | Chimera part; ROOT GRIP mutation |
  | Supply Depot | Credits + Wiring | 3 to Zbornak: skate grip tune |
  | Watchtower | Searchlight Lens | HAWK EYE mutation |
  | Relay Mast | Signal Transponder | Map reveal; 3 to Zbornak: event radar |
  | Trading Kiosk | Mystery Crate | Credits, chips or a jackpot |
  | Scrap Shack | Scrap Plating | 3 to Zbornak: more hull |
  | Junk Pile | Junk Bot | Chimera part |

- **Traffic:** shuttle-buses and freighters fly between landing pads (their stairs come down toward the nearest road); press `F` to ride free, or bail mid-flight.
  13 roads (planned over the terrain by `roadplan.js`) join the towns, with ring roads round each. **Moonliner**
  passenger and **Prospector** freight land-trains run in faction liveries. Wreck one for a salvaged engine (-3 rep).
- **People:** humans wear helmets; the bare-headed **Vrill** breathe vacuum (jar one for the PSI ANTENNAE mutation).
  Hurting people puts a settlement on alert for 75 s and costs rep.

## Menus, settings and cosmetics

- **Main menu:** CONTINUE, NEW GAME, LOAD GAME, SETTINGS, QUIT (desktop). Three save slots, autosaved. Pausing
  freezes the whole world.
- **Settings** (`Esc`): graphics, gameplay (camera, HUD, units, controller), audio, and key remapping.
- **Music** is synthesised live: a synthwave groove that builds with speed, plus tracks for the casino, Chimera
  Downs, the lab and the dark side.
- **Cosmetics:** outfits from every HQ, skate finishes (Meridian, the casino and deed-locked ones), eight
  pulse-disc colours. The **wardrobe** (`C`) has a live 3D preview and says how to unlock each item.

## Dev tools

- **Cheat menu:** hold `=` and `` ` `` together in play: credits, map reveal, reputation, teleport, god mode,
  unlocks, spawns, mutations, reset.
- **Asset Row:** F8 → Full cheat menu → Teleport → ASSET ROW. A showroom of every asset (242 in 26 sections) with
  terminals to jump between sections. Nothing there is saved. The catalogue is `src/assetRowItems/` (format at the
  top of its `index.js`).
- **F3** overlay and the free cam (`src/freecam.js`).

## Under the hood

- **Terrain LOD:** 1,536 cube-sphere chunks at 5 detail levels, built within a 4 ms frame budget. Skirts hide seams.
- **Physics without meshes:** collisions sample the height function directly.
- **Sleeping world:** settlements, bases, people and boulders only exist or animate near you.
- **Cheap darkness:** fake light decals instead of real lights, so shaders never recompile.
- **Shadows at every distance:** the sun's own shadow map is a 320 m box (`shadowcache.js` keeps its static casters between
  refreshes); two wider, coarser maps of the same light (`src/farshadow.js`: 600 m and 3,300 m half-widths, terrain and static
  casters, terrain only) carry hill and rock shadows out to the horizon. Lit toon materials and the terrain read the finest map
  that holds them and blend at the seams. They redraw only when their box steps, the sun turns or chunks change.
- **Comic look:** two-tone toon shading (`toon.js` setToonBands; three with `?look=classic`) with chosen shade
  colours (each colour's shade more saturated and turned toward violet, not dimmed) and halftone dots only across the
  shadow edge (`toon.js` TOON_LOOK; `?look=classic` brings back the old look: grey shading, the post pass's dots over
  every dark tone), weighted normals on the Blender models (`kit.py`), a per-vertex
  shade threshold and line weight baked by the Blender export (`_TOON`: creases shade early, long thin parts' lines taper;
  `kit.py` toon_attrs), designed ink lines (panel seams, `kit.py` ink_lines, drawn by `toon.js` inkLineMat as a darker
  shade of what they cross; the post pass's crease lines too, outlines staying ink), inverted-hull outlines (pushed out
  along each vertex's face planes, `toon.js` shellGeo, in the vertex shader so they hold their on-screen width at any
  distance and follow the Ink setting; far ink fades to indigo), a post pass
  (`src/post.js`) for ink lines, speed lines, a neon glow round light sources (a tight halo, a white-hot core) (`toon.js` HALO_SLOT, glowMark;
  the Glow setting; crowded lights merge) and a colour grade (warm sun / cool shade by day, neon night on the dark side: GRADES), with its scene pass multisampled (the Anti-aliasing setting) and an FXAA pass after it (Smooth ink lines), rocky crater rims
  drawn per pixel, onomatopoeia pop-ups, solid outlined puffs for dust, smoke and fire (`fx.js` puff), and
  figures animated on twos (`twos.js`).

## Source map

```
src/
  main.js          game loop, camera, state, explosions, job board flow
  config.js        world size and physics tuning
  planet.js        moon heightfield, craters, LOD chunks, surface queries
  boulders.js      boulder shapes, ink shell, collider fit
  moonSkins.js     experimental ground textures (?moonskin=1|2|3)
  geo.js           sun frame, great-circle and local-frame helpers
  reputation.js    standing, tiers, unlocks, Rustmoon state
  events.js        faction events, fluid sloshing, escorts, Pirate Wreck
  mapview.js       globe map with fog of war, Radio Tower sweeps
  alchemy.js       jar, reactor, mites, followers, mutations, Mega Mite, the lab's log (splices, reactor results)
  labWorld.js      the Antimatter Lab (zlab.glb): its colliders, spots, robot cell, reactor, airlock and security camera,
                   screens
  labnet.js        LABNET, the lab's terminal (splices, reactor, chimeras, pen)
  chimera.js       makeChimera, makeMite, splicing and stats re-exports
  chimerabuild.js  the chimera builder: every chimera from the kit (chimera.glb), looks, outfits, mutations, far LOD
  gait.js          walking on jointed legs (mites, mandrake roots, the spider tank): planted feet, steps, IK, the body on its feet
  spidertank.js    Zbornak's spider tank (docs/spidertank/; not in the game yet): eight-legged gait, closing up to skim, reactor beam
  chimeragenes.js  splicing (no three.js)
  cheats.js        cheat menu
  devoverlay.js    F3 dev overlay (perfgraph.js draws its graphs)
  freecam.js       dev free cam (`game.cheats.freeCam.shot(...)`: screenshot setup in one call)
  story.js         leaders, chapters, founded outposts, tech, Kade
  storyAssets.js   troops, bosses, mission props, outpost compounds
  hometown.js      your town and the Moon Council
  chamber.js       the council chamber and vote cutscene
  respawn.js       where a K.O. puts you
  radio.js         Radio Tower sweep
  terminalUI.js    tiled terminal pages
  spindle.js       the Spindle, its sky, the mothership
  medevac.js       the Spindle's K.O. cutscene
  worldstate.js    permanent finale changes
  kade.js          Kade's gun truck
  flak.js          flak shells and bursts (Kade's, and the base turrets' high-angle mode)
  monolith.js      the Monolith's spells
  territory.js     territory, small outposts, patrols
  outpostDrafts.js the small outposts (the picks, OUTPOST_PICK in outpostModels.js; docs/outpost-proposals), code-built: the
                   kinds not yet in outposts.glb, and the fallback
  ilmbCore.js      the ILMB's core from Blender (ilmb.glb): the central complex and wall (proposal A of docs/ilmb-proposals;
                   ?ilmbCore=old the code-built one), skywalks, job terminal, repair bay, gantry, spheres, domes, barracks, depot,
                   mast, pylons
  outpostLooks.js  the small outposts' looks by owner: palettes (STYLE), walkers' looks, container liveries
  outpostWalkers.js the two or three NPCs walking about each small outpost, and those who keep a post (traders, stallholders)
  vehicles.js      drivable vehicles
  settings.js      settings menu and key remapping
  casino.js        casino games, VIP, prizes (casinoWorld.js: building; casinoPlan.js: plan numbers)
  clawSim.js       Zero-G claw rules and physics (clawView.js draws it, clawGame.js runs the seat)
  fountainFx.js    fountain water shaders
  pixelIcons.js    classic-games pixel sprites
  factionIcons.js  the faction emblems (src/assets/factions/*.svg, from tools/icons/faction_icons.py): `factionIcon(id)`
  cosmetics.js     dresses the runner: outfit extras, skate finishes, halo
  cosmeticsData.js outfit, skate and laser tables, their shop entries (imports nothing)
  race.js          Chimera Downs: card sections, tournaments, scouting, betting, the race, cameras, crowd, podium,
                   careers, Training Yard, stabled chimeras
  downsPlan.js     Chimera Downs layout, the stable yard's layouts, the walkers' keep-out (`walkBlocker`) (no three.js)
  downsWorld.js    Chimera Downs scenery
  downsKit.js      shared Downs builders (bake, fountain, arcadeShell)
  curve.js         bends flat layouts onto the sphere
  downsFair.js     ferris wheel, carousel, queue lines
  downsDome.js     the glass dome over the Downs: its colliders, the airlocks' doors, lamps and cycling
  rides.js         transit-ship rides and fairground rides
  rocks.js         shaped rocks and colliders
  rails.js         grinding rocks, crater rims and building ledges
  ledges.js        building ledges as grind rails (the top edges of a place's colliders)
  meteors.js       meteor showers
  chimerastats.js  chimera stats, growth, styles, careers, training, race model (docs/chimera-racing.md)
  chimeraskills.js the racing skills
  fonts.js         the bundled pixel faces (Press Start 2P, Jersey 15) and the credit sign (assets/fonts/)
  physics.js       collider hash and shared skater movement
  player.js        input, movement, weapons, animation, style
  weaponView.js    the weapon in hand: drawn with the crosshair, the aim layer (stance, shoulder roll, two-bone IK to the grips)
  combo.js         the style run: moves, multiplier, landing window, bank or wipe
  stylemeter.js    the style meter (the run, live, bottom right)
  idles.js         standing idle animations
  enemies.js       pirates, bases, turrets, artillery, theft
  missions.js      contracts, pickup and delivery, payouts
  world.js         sky, settlement layout, colliders, ambient life
  settlements.js   detailed settlements and landmarks
  market.js        Meridian stock market for the ticker
  traffic.js       pads, flights, passengers, roads, land-trains, cars
  landingPad.js    landing pad geometry and waypoints
  roadplan.js      least-cost road routing
  wardrobe.js      wardrobe screen (main.js builds it on the first C)
  trailer.js       trailer director (?trailer)
  models.js        characters and vehicles; loads the Blender models
  townsfolk.js     the generic NPC (makeFigure): outfits, builds, helmets and fishbowls, aliens; ten bones, a walk; holds its pose on twos
  post.js          comic post-processing
  farshadow.js     the wide sun shadow maps (600 m and 3.3 km) and the receiving shader code
  fx.js, hud.js, audio.js, input.js, toon.js, locations.js, rng.js
  twos.js          animating on twos: figures' poses held 12 a second (PoseHold; the townsfolk hold their own)
  assets/
    runner.glb       the runner (player, pirate skaters, leaders)
    idles.json       the runner's idle animations
    ships.glb        shuttle-bus and freighter
    skimmer.glb      Phase Skimmer classic; skimmer_a.glb, skimmer_b.glb the redesigns (dev menu picks)
    lightbike.glb    the Meridian Courier Light-Bike (docs/lightbike)
    warrig.glb       Rustmoon War-Rig (and the pirates' rigs)
    rover.glb        civil buggy and military patrol car
    interceptor.glb  SPACECOM Lunar Interceptor
    apc.glb          Vostok APC
    landtrain.glb    Moonliner and Prospector, every livery
    crane.glb        tower crane
    gantry.glb       container gantry and box container
    garage.glb       Meridian motor-pool garages (colliders as pivots)
    power.glb        ILMB Power Block, the D-He3 fusion plant (colliders and lamps as pivots)
    habitat.glb      ILMB Kepler Habitat, the Orrery ring (colliders and the turning orbit ring as pivots)
    hydroponics.glb, labs.glb, hangar.glb, relay.glb  the ILMB's other wings: Hydroponics, Meridian Labs, Vostok Hangar,
                     Daedalus Relay (colliders, lamps and turning parts as pivots; models.js ILMB_WINGS)
    slots.glb        slot-machine cabinet
    casino.glb       lamp post, fountain, bouncer, chandelier, sign frames
    claw.glb         Zero-G claw machine and its contents
    hall.glb         casino hall kit
    lot.glb          casino forecourt kit
    weapons.glb      the courier's weapons (the pick; makeWeapon, weaponView.js)
    downs-*.glb      Chimera Downs kits (stand, club, course, stalls, arcade, screen, fair, stable, crowd, dome)
    chimera.glb      the chimera kit: every kind's parts in their looks, fitted mutations, far copies, devices
    spidertank.glb   Zbornak's spider tank (loaded by spidertank.js, not at boot)
    zlab.glb         the Antimatter Lab and ranch, and Dr. Zbornak (build_zbornak_lab.py; colliders, spots, screens, the
                     arms, reactor core, door and camera as pivots: labWorld.js); zlab-drone0..3.jpg the drone feeds
    duck.glb         Duck Derby racers and track
    blackjack.glb    blackjack table and chip
    dish.glb         dish stations and dish heads
    winch.glb        winch grapple and cable
    towmark.png      winch HUD marker
    turret.glb       the defence turret, two proposals (docs/turret-proposals; models.js makeTurret, ?turret=a|b|old)
    ilmb.glb         the ILMB's core: the central complex and wall ("the Crown", "the Rampart"), skywalks and the base's other pieces
    outposts.glb     the small outposts built in Blender (the kinds in staticContract.js GLB_KINDS; ?outpostGlb=0 for the
                     code-built ones; spec in docs/outpost-glb.md)
tools/
  claude-hooks.mjs         Claude Code hooks (.claude/settings.json): blocks a push that bumps the version without [release],
                           skips CHANGELOG.md or the source map; blocks adding code-built geometry to src/ (Blender is the
                           default for models); reminds after a Blender build and after a commit
  optimize-glb.mjs         compresses src/assets models (npm run optimize:glb)
  splice-chimera.mjs       puts chimera kit parts built on their own into chimera.glb, the rest untouched
  icons/faction_icons.py   faction emblem proposals as SVG (docs/icon-proposals/; `python3 tools/icons/faction_icons.py`)
  viewer.html              dev model viewer (/tools/viewer.html?m=<model>; options at the top of the file)
  casino-layouts.mjs       casino plan study and spacing check (docs/casino-layouts.md)
  casino-forecourt.mjs     forecourt plans and Valet Court check (docs/casino-forecourt.md)
  casino-zfight.mjs        lists coplanar faces in the running casino
  casino-audit.js          in-page casino audit: z-fights by colour, pieces touching nothing, what is at a spot
  casino-shots.mjs         casino screenshots from fixed spots
  check-claw.mjs           bots play the claw to tune its payout
  downs-audit.mjs          a place's audit (Chimera Downs, or PLACE=<id>): zfight, colliders, text, gaps; coverage, blocked,
                           floating, sunk, rails (named only; the rules they check: docs/collision.md)
  outpost-audit.mjs        the small outposts' audit: loose pieces, uncovered solids, colliders over air, NPC routes (WRECK=1)
  downs-layouts.mjs        Chimera Downs layout study (docs/downs-layouts.md)
  stable-layouts.mjs       the stable yard's layouts: clearance and walk checks, plans (docs/stable-proposals/)
  race-sim.mjs             runs the race model headless and reports the balance
  chimera-lab.html         the chimera builder's lab (/tools/chimera-lab.html; docs/chimera-builder/)
  spidertank-lab.html      the spider tank driving: walk, climb, run, close up and skim, the beam; look round, pause; F9 saves a flight
                           to replay, ?sweep drives it at every box and tables it (/tools/spidertank-lab.html)
  make-credit-glyph.py     draws the credit sign for both pixel faces -> assets/fonts/credit-*.woff2
  meridian-layouts.mjs     Meridian Exchange layout study (docs/meridian-layouts.md)
  winch-ride.mjs           headless winch test; run --gate ring after touching src/winch.js
  zbornak-chimeras.mjs     exports a few game chimeras as GLBs for the Antimatter Lab draft's renders (docs/zbornak-proposals/)
  zbornak-screens.mjs      shoots the Antimatter Lab draft's screen mock-ups (docs/zbornak-proposals/screens/terminal.html)
  zbornak-drones.mjs       films the Antimatter Lab's drone feeds: aerial shots of four settlements from the running game
                           (src/assets/zlab-drone0..3.jpg)
  blender/
    kit.py                 shared helpers every builder execs
    hullkit.py             hull lofts and fittings (Courier, Skimmer redesigns)
    dishkit.py             dish geometry (build_dish.py, build_outposts.py)
    outpost_kit.py         the small outposts' kit: the game's Kit and the outpost builders' helpers, ported (build_outposts.py)
    decals.py              lettering, emblems, hazard stripes, container markings
    cargo.py               land-train cargo units for other models to carry (lite=True: trimmed for distant units, the freighter's bays)
    spreader.py            crane container spreader
    hookblock.py           the cranes' hook block (tower crane, gantry, the Vostok Hangar's bridge crane)
    suits.py               card-suit trim (blackjack, claw, duck)
    wing_kit.py            ILMB wing parts: accumulator, frames and frusta, railings, ladders, the skywalk lobby, colliders
    habitat_kit.py         Kepler Habitat palette and orbit mark, on wing_kit.py (build_habitat.py, proposals/habitat_b.py)
    downs_common.py        Downs palette, merging, export, coplanar audit
    structure_audit.py     does a model hold together? floating parts, loose bar ends, bars through solid parts, slabs
                           through slabs (`python3 tools/blender/structure_audit.py tools/blender/build_<name>.py`;
                           the blender skill, "Model structure"); test_structure_audit.py checks it on known faults
    style.py               the house style's numbers: palette, ink by part size, triangle budgets, halo slot names
    style_audit.py         does a model follow the house style? ink too heavy or off its class, big parts with no ink,
                           blacks, parts without weighted normals or toon attributes; triangles and halo slots per model
                           (`python3 tools/blender/style_audit.py tools/blender/build_<name>.py`)
    audit_outline.py       lists runner parts missing an outline
    build_runner.py        -> runner.glb (the suit one skinned body: runner_skin.py, docs/runner-skin; preview_runner.py
                           renders it posed as the game poses him)
    build_idles.py         -> idles.json (MOONRUNNER_IDLES_BLEND=<file> saves the scene)
    build_ships.py         -> ships.glb (FREIGHTER_VARIANT=atlas|compact, SHIPS_OUT=<file>; docs/shuttle-design.md)
    build_skimmer.py       -> skimmer.glb
    build_skimmer_redesign.py -> skimmer_a.glb, skimmer_b.glb (MOONRUNNER_SKIMMER=a|b; preview_skimmer.py renders)
    build_courier.py       -> lightbike.glb (preview_courier.py checks the rider's fit and renders docs/lightbike)
    build_engine.py        -> engine.glb (wreck drop)
    build_briefcase.py     -> briefcase.glb (wreck drop)
    build_hovercar.py      -> hovercar.glb
    build_plinko.py        -> plinko.glb
    build_warrig.py        -> warrig.glb (shared parts and the clash / float checks: warrig_kit.py)
    build_rover.py         -> rover.glb
    build_interceptor.py   -> interceptor.glb
    build_apc.py           -> apc.glb
    build_landtrain.py     -> landtrain.glb
    build_crane.py         -> crane.glb
    build_gantry.py        -> gantry.glb
    build_garage.py        -> garage.glb
    build_power.py         -> power.glb (MOONRUNNER_POWER=a|b: B is the game's; preview_power.py renders docs/power-proposals)
    build_habitat.py       -> habitat.glb (proposals/preview_habitat.py renders docs/habitat-proposals)
    build_hydroponics.py   -> hydroponics.glb
    build_labs.py          -> labs.glb
    build_hangar.py        -> hangar.glb
    build_relay.py         -> relay.glb
    build_slots.py         -> slots.glb
    build_casino.py        -> casino.glb
    build_claw.py          -> claw.glb
    build_hall.py          -> hall.glb
    build_lot.py           -> lot.glb
    build_weapons.py       -> weapons.glb (the pick; sets A and B are the drafts: docs/weapon-proposals; preview_weapons.py
                           renders them held, the arms solved to the grips and checked against the torso)
    build_duck.py          -> duck.glb
    build_blackjack.py     -> blackjack.glb
    build_dish.py          -> dish.glb
    build_winch.py         -> winch.glb, towmark.png
    build_turret.py        -> turret.glb, the defence turret's two proposals (docs/turret-proposals; wing_kit.py)
    build_ilmb.py          -> ilmb.glb, the ILMB's core (docs/ilmb-proposals; wing_kit.py, dishkit.py)
    build_outposts.py      -> outposts.glb, the small outposts (check with npm run check:outposts; compare with the code-built
                              ones in the viewer: ?m=outpost&kind=tower)
    build_downs_*.py       -> downs-*.glb (build_downs_dome.py -> downs-dome.glb; preview_dome.py renders it over a block model
                              of the Downs)
    build_spidertank.py    -> spidertank.glb (Zbornak's spider tank; docs/spidertank/)
    build_chimera.py       -> chimera.glb (about 6 min; CHIMERA_ONLY=car,mite; CHIMERA_PARTS=legs_mite_0 to splice with
                           tools/splice-chimera.mjs; chimera_common.py and chimera_*.py)
    build_zbornak_lab.py   the Antimatter Lab, the whole plateau and Zbornak (docs/zbornak-proposals/); ZB_GAME=1 exports
                           zlab.glb for the game (then node tools/optimize-glb.mjs src/assets/zlab.glb): zbornak_kit.py (set pieces, zb_container: the cargo box in Zbornak livery),
                           zbornak_figure.py (the doctor), lab_doors.py (the airlock's vault hatches; LAB_DOOR=split or
                           slot builds the other drafts); preview_zbornak_lab.py renders the views, robots.gif, the plan, the
                           turnaround, the door drafts (doors)
    proposals/             freighter, Kepler Habitat and War-Rig design studies, Cycles preview renders
                           (warrig_b.py, the War-Rig's runner-up; preview_warrig.py renders both to docs/warrig-proposals)
```

**Blender models:** each builder runs in Blender's Scripting tab or headless (`tools/setup-blender.sh` installs
`bpy`; some builders want `MOONRUNNER_REPO=.`). After re-exporting, run `npm run optimize:glb` (`runner.glb` and
`winch.glb` stay uncompressed). Material names on the runner are colour slots that outfits
recolour. Each model is its own chunk, inlined as a data URI so the desktop build needs no fetch.

**Claude Code:** `CLAUDE.md` holds only what every task needs (commands, conventions, which skill for which job). The
task rules live in skills under `.claude/skills/`: `blender` (models, their structure rules, the GLB contract, the Asset
Row), `places` (colliders, floors, ledge grinds, cargo), `playtest` (running the game, screenshots) and `coding-standards`.
`.claude/rules/` loads a short pointer to the first two when their files are opened. `.claude/settings.json` runs
`tools/setup-blender.sh` and `tools/setup-node.sh` (npm ci when `node_modules` is missing) at session start and `tools/claude-hooks.mjs` around Bash calls (push checks, build and commit
reminders) and file edits (Blender by default: no new code-built geometry in `src/` unless waived).
