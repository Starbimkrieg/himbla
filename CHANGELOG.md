# Changelog

What changed in each release. Releases are built by `.github/workflows/release.yml` when a commit message
contains `[release]` (see the README's Download section). Newest first.

## Unreleased

- **Courier Light-Bike: two redesign proposals, and a longer, thicker light trail:** the brief was to drop the upper wheel wells, tidy the placement, trim and detail (the windscreen looked wonky), make the body sleek and smooth between chunky front and back wheels, add little saddle bags, and make the trail more prominent. Two Blender-built proposals are in `docs/courier-proposals/` (a review sheet, six renders and `courier_a.glb` / `courier_b.glb`; the README there says how they differ and how to wire one in): **A, Slipstream** (long, low and pointed, a tall raked windscreen, teardrop bags beside the rear wheel, the current racing crouch) and **B, Parcel Runner** (rounder, a wrap-around bubble visor, square flapped panniers slung low, a more upright seat). Both are built by `tools/blender/build_courier.py`, and `tools/blender/preview_courier.py` re-renders the sheet headless (`pip install bpy pillow`). The game still draws the old bike until one is picked. **The trail is changed in the game now:** `LightTrail` lives **4 s** (was 1), stands **1.5 m** tall (was 1.0), lies on a **0.6 m glowing strip of ground** so it has width from any angle (it was a single ribbon, invisible edge-on), holds its brightness and eases away at the end (it was a quadratic that went dark in half its life), and keeps 256 points 0.45 m apart (was 64 at 0.3 m, which at top speed was only 19 m of it, under a second) so it reaches a full 4 s at 34 m/s. The Asset Row's trail demo uses the new defaults.
- **Dev tools stay out of release builds, and a new dev tool: the Asset Row:** the desktop downloads (`dist:*` and the release workflow) are now built with `vite build --mode release`, which leaves out everything meant for testing: the F8 dev menu and its controller combo, the full cheat menu and the `=` + backtick chord, the F3 debug overlay, the git fetch / pull menu, the pause card's DEV MENU button, the trailer director (`?trailer`) and the `window.game` console handle. The game then runs on an inert stand-in (`src/cheatsStub.js`); `npm run check:dev-strip` builds a release and a normal build and fails if any dev-tool string is in the release one or the stand-in lacks something the game uses. **Asset Row** (dev builds only: dev menu → full cheat menu → teleport → option 1): a flat world with every asset in the game lined up side by side, 203 items in 25 sections over two lanes about 9 km long: the runner, people and creatures, props, weapons and effects, rocks, secrets and the Spindle's props, vehicles and ships, outposts (intact and wrecked), the building parts, the hometown and all the places. Items are built as you walk up and let go of behind you, and a terminal at the start of each section (press F beside it) jumps you to any other section. It follows the Spindle's lead (the Moon is hidden and frozen, a fixed "up" in `geo.js`'s `GRAV.flat`), you can't be hurt, nothing in it is saved, and leaving by the menu, any teleport or quitting returns you where you were; the Moon-only dev entries refuse there. To fill it, a few factories were exported and some inline model code in `alchemy.js`, `secrets.js`, `meteors.js`, `vehicles.js`, `traffic.js`, `territory.js` and `world.js` became functions of their own, with no change to the game. The junk-pile outpost's left-hand sheets, which got no colour (a negative index in `outpostModels.js`), now do.

- **Blender scripts: shared helpers live in `kit.py`:** `build_ships.py` and `build_runner.py` carried their own copies of eight and three of the kit's functions (`loft`, `lathe`, `torus`, `beam`, `material`, `coll` and others), and the crane, dish and garage builders each re-defined `join` and `B`. They load `kit.py` like the other builders and the shared ones moved into it (`join`, `merge`, `B`): 163 fewer lines, and every script exports a byte-identical file (checked for all ten models and the idle animations).
- **Smaller download: models in their own chunks, compressed:** the game's code was one 15 MB file with every model embedded in it. Each model is now a chunk of its own (loaded together at boot, as before), so the code is a 2 MB file (645 KB gzipped) that doesn't change when a model does, and each model is cached on its own. The ships, vehicles, land-trains, crane, garage and dish models are also compressed (`tools/optimize-glb.mjs`, `npm run optimize:glb`: quantized, then meshopt-coded), taking the models from 11 MB to 4 MB; what the page fetches at boot is 1.8 MB gzipped, down from 2.9 MB. The compressed models match the originals to about a millimetre (every mesh, material and tag is there, areas within 0.7%) and render the same. `runner.glb` and `outposts.glb` stay plain.
- **Cleanup, round two (one visible fix):** the loan shark's line said *Press 7*, but the casino has six tabs and the shark is 6; it now says 6. Removed code nothing calls: `World.buildBioLab` (no location has that type) and `blockB`, `Planet.setPainted` with its worker `style` message and the `rebuildNow` flag (the painted Moon is still on by default from `config.js`), `SaveSlots.reloadIntoPlay`, `Secrets.mapInfo`, `Missions.refreshAll`, the `fmtChange` / `fmtPct` / `fmtVol` helpers the removed stock board used, and a few unused helpers, constants and an import.
- **Cleanup (no visible change):** removed code nothing reaches. The casino's overlay blackjack tab (its state, key and click routes, speech lines and styles) was never listed in the casino's tabs, so it could not open; the playable blackjack is the 3D table in the Lucky Crater. `src/exchangeBoard.js` (the stock-board screen, unmounted since the tower's screens came down; it is in the git history if it's ever wanted back), the unused 2D simplex noise (`createNoise2D`) and `anglesFromDir` are gone, and 17 unused imports. Per frame, the HUD now finds its static elements once and writes the tech chip, the style chip and the zone warning only when their text changes; settlement spinners and blinkers, story props and event markers keep their moving parts in a list instead of walking the scene graph every frame.
- **Casino: a proper prize counter, and the building dressed all the way round:** the prize counter was a plain gold box with a pink lid. It is now a raised dais with a panelled counter (a card suit in each recessed panel, neon strips, a pink top with a gold rail), a glass display case with two lit tiers of prizes (a trophy, a rocket, a crown, a helmet, a rubber duck, a moon-mite plush, a spinning gem and a spinning star), a till showing CHIPS, a service bell and stacks of chips. Above it is a header with a PRIZES board over the clerk and a RUSTY'S LOANS board over the shark, a row of chase bulbs and a line of pennants, and behind the staff a lit three-shelf prize wall with eighteen more prizes (trophies, rockets, crowns, plush mites, ducks, gems, helmets, toy hover-cars, stars, disco balls, certified moon rocks). The shark and the clerk step a little further from the wall to make room. The counter keeps its footprint, its collider and its prompt, so it plays exactly as before. The front's detail now runs round the whole building: the gold belt, the pink roofline and the chasing roof bulbs continue down both sides and along the back, and the card suits (six down each side and six along the back, in suit order) carry on round the corners. The hall's footprint didn't need to grow: the right-hand side of the floor had room for the bigger counter. Checked the interior ceiling too: jetting straight up from 42 spots across the whole hall stops the head at the 16 m ceiling everywhere, and a launch up from inside or a dive onto the roof from outside never gets through at any speed up to 200 m/s (only a 300 m/s launch does). All the new suits are four instanced meshes (the front's four included), so the whole job costs about 30 extra draw calls (+3%) and 24k polygons (+3.5%).
- **Casino: you walk through the people:** the bouncer by the door, the blackjack dealer and the seven spectators round the Duck Derby track and the hall had solid cylinders round them, so a skater at speed stopped dead on them (or was shoved sideways, or wedged between one and a rail). They no longer collide, like the wandering patrons and Vinnie, the loan shark and the prize clerk already didn't. Measured by skating the real movement physics at 14 m/s straight through each of the nine: before, the bouncer threw you back, five of the spectators stopped you within a third of a metre and the rest deflected you ~1.5 m aside; now every run goes straight through. The tables, cabinets, counters and walls are unchanged. One side effect: shots now pass through those nine figures too.
- **Shackleton and Farside: the big dishes now stand on Blender-built stations:** the four dishes at each research array (a bare grey cone with a cream bowl and a pink bead) are two new Blender-built station designs in the Prospector's style (`tools/blender/build_dish.py` -> `src/assets/dish.glb`; the old `makeDish` stays for the other places' small dishes). The **cryo receiver** is the Helium-3 tanker stood on end: a banded pressure vessel on a dark skirt with a faction-coloured dome, a gantry stair winding up it with a floodlight bank on its landing, a valve cabinet (gauges, hand-wheel valves, an NFPA diamond, pipes up the shell), a branding panel on brackets, a relief stack and a hazard-ringed pad; its dish is banded like the tank with a dewar at the focus. The **gantry station** is the crane's lattice mast in faction paint (splice plates, a caged ladder, rest platforms, floodlights, a fascia sign) over a yard of the Prospector's cargo containers as control rooms (one stacked, with a stair), a red battery bank with strobes and a lightning rod, a fuel tank on saddles, a generator and cable trays; its dish rides on radial lattice trusses with a stripe-and-body rim and a Cassegrain feed. Both carry the faction's emblem and name (Shackleton in Meridian cyan, Farside in SpaceCom white and yellow), a station number 01-04, blinking aircraft lamps on the feeds and masts, and the same turn-and-nod sweep as before (the head turns about the vertical, the dish nods on its trunnions). The four dishes alternate between the two designs round each site, swapped at Farside, and face the control centre their cables run to. Each station is baked into the site's kit like the cranes (a few draw calls, no change in their count), with colliders for the vessel, skirt and cabinet, or the footings, mast, containers, tank and generator; the old dish's single pole collider is gone. A station costs about 40k triangles with its outline: Shackleton goes from about 318k to 476k per frame (the Meridian Exchange is 628k). The dev model viewer shows them: `/tools/viewer.html?m=dish&kind=cryo|gantry&faction=...&no=01..04&size=30&sweep=1`.
- **Dev menu: GIT: FETCH & PULL UPSTREAM:** item 8 of the dev menu (F8, or B, B, X, Y on a controller) fetches this checkout's upstream and shows the branch, how many commits it is behind or ahead, any uncommitted changes and the incoming commit subjects, with a button to pull them. The pull is a fast-forward only (`git pull --ff-only`): it never merges, rebases or discards anything, and stops with git's own message if your local edits would be overwritten or the branch has diverged. Progress is saved first, and the dev server reloads the page by itself once the new files land (or press RELOAD NOW); it says so when `package.json` changed and `npm install` is needed. It works only under `npm run dev`: the dev server runs git for the page (`tools/devGit.mjs`, a Vite plugin that is not part of a build), answers only a POST from this machine's own page (loopback address, localhost host, same origin, a custom header), and runs fixed commands with nothing from the request in them. In a built game or the desktop app the menu item just says it needs the dev server. **An upstream chip** (top left of the HUD, above the credits) can be switched on from that same menu (UPSTREAM CHIP: ON / OFF, remembered across launches): it shows how many commits the upstream has that this checkout does not (`⇣ 3 UPSTREAM`, yellow and pulsing while there are some, cyan at 0, dim with a `?` when the dev server can't say), looking again every 90 s and whenever the menu fetches. The dev server now runs one git command at a time, so the chip's polling can't collide with a pull.
- **Job terminals: upgrades can be picked with a controller:** the pad's menu highlight (`FOCUSABLE` in `gamepad.js`) knew the contracts (`data-i`) but not the gear and upgrades on the right of every job terminal (`data-buy`), so the ILMB's repair bay and SPACECOM gear (and every other faction's terminal) could not be reached at all. They can now be highlighted and bought with A, the highlight stays on the same upgrade when the board redraws after a purchase, and the footer says "Press A on a contract or an upgrade". Up and down on the pad now stay in the column you are in (the next upgrade, not the contract beside it) whenever there is something under or over the highlight in it, and cross over only at the top or bottom of a column; this applies to every menu the pad drives.
- **Road patrols no longer circle at the end of their route:** the armoured cars that patrol between two outposts drove to one end of their route, turned round there and then circled a point 50 m back along the road at full speed (a tight loop about 8 m across, once every 4 s) for good, because the marker they waited to get within 40 m of had been left behind them by the turn, so it never moved on. They now aim at a waypoint 70 m along the route and move it on once within 40 m of it (or after 20 s of trying), and at an end of the route they reach the end waypoint, turn round and set off back. Of the 26 routes in the game most orbited at their first end before; in a headless run of all of them every patrol now drives to both ends and back again, none takes longer than 7 s to reach a waypoint, and a car wedged against something still reverses after 5 s. The little loop a patrol drives round a lone outpost is now measured by its real length (543 m, not a nominal 300 m), so its waypoints are 70 m apart along the loop. (A base patrol circling its own base is meant to, and is unchanged.)
- **HUD & popups (Day 5):**
  - **Comic-book popups no longer overlay each other:** at most **two** popups are on screen at any time (`POP_MAX` in `src/fx.js`). Any more queue behind them in order, and each one plays its full run time from the moment it actually starts, not from when it was asked for. Two popups are also kept apart: if the newer would sit on top of the older (a trick landing's "DOUBLE BACKFLIP! +90" and "STUCK IT!" used to land on the same spot) it is nudged up or down clear of it. The runner's own feedback (tricks, landings, crashes, the race and casino countdowns and results) is *priority* (`prio: 1`) and jumps ahead of background chatter (NPC crash shouts, the derby crowd, plinko multipliers); K.O.! (`prio: 2`) goes first of all. A few safety valves keep the queue from backing up with things that no longer matter, none of which the brief asked for, so each is one constant in `src/fx.js`: a popup pinned to a spot in the world that waits too long is dropped rather than shown late where you no longer are (1.2 s, or 3 s for the runner's own; K.O.! never), one pinned to somewhere off screen is never shown (it would only hold a slot), and past eight waiting the oldest of the lowest rank is shed. Popups free their slot when their on-screen animation ends and otherwise run on real time, so a pause or the Monolith's time dilation no longer freezes or stretches them. `g.fx.pop` takes a new `prio` option and `g.fx.clearPops()` empties the screen and the queue (the trailer director uses it between shots). The duplicate METEOR BOUNCE! and GRIND popups that fired in the same frame as the style popup are gone (METEOR BOUNCE! keeps its orange and shows its +points during a delivery).
  - **SKY-HIGH! needs real height:** it used to fire for any launch still rising 0.6 s later at over 70 m/s, which a small crest at speed does (about 5 m up). It now fires once per jump, when you have climbed **40 m** above where the jump began, measured from the Moon's centre, and are still rising (so dropping away over a crater rim or off a cliff, a ride or a bail-out doesn't count). Launches still say LAUNCH! at 0.6 s.
  - **BIG AIR needs 5 seconds:** the popup only plays after at least 5 s in the air (it was 1.8 s, which a plain boots hop clears). Hops over 1.8 s still pay their style points as before, just silently.
  - **SAT-7 pass-by popup removed:** the "SAT-7 "LANTERN" passing N m up (something on its deck is glowing)" toast that appeared when the satellite came within 1.6 km (and every 90 s after) is gone. You still spot SAT-7 by its blinking lights and name sign, and the globe map and minimap still draw its orbit and position.
  - **Meteor shower start popup removed:** the lower "Meteor shower N km away (red zone on the map)…" toast is gone. The central upper ☄ METEOR SHOWER INCOMING ☄ banner, the alarm and the red zone on the maps are unchanged (so is the "has passed" toast when it ends). The dev menu's *Meteor shower* item no longer leaves a stale "has passed" toast under the new banner.
  - **Faction border popup removed, the location chip flashes instead:** crossing into another faction's territory no longer pops "Entering X territory" in the lower centre. The chip under the minimap flashes with a glow in the owner's colour whenever its text changes: a new faction's land, or walking into or out of a settlement. It doesn't flash for the chip's first reveal in a session or if the HUD is hidden mid-flash.
- **Garage rover: no more snap on the way onto the ring:** as a rover reached the end of the garage road its front axle was placed from the start of the ring arc it merges onto (up to ~20 m behind the merge point, because the road joins the arc part-way along), so the model jumped back, drove a few frames facing the wrong way and then jumped forward again. Positions across a merge (`at()`), the gap to traffic just past it and the distance to a stop planned beyond it now all count from the merge point (`joinS`); a 30-minute simulation at 30 fps (about 75,000 frames) shows no jump, where before every launch had one.
- **Meridian Exchange: no apron in front of the garages, the road runs up to the doors, and the flight pads keep apart:** the paved apron with its lane lines (and the little ramps it needed) is gone from all the garages (Blender: the plinth is now an 8 cm slab, so the hall floor is nearly flush with the ground; `FY` in `build_garage.py`, `GARAGE_FLOOR` in `models.js`); the two small sheds just meet the bare ground. In front of the **main garage** the service road is now a **forecourt** of carved regolith exactly as wide as the building at the doors (from the hall's left corner to the end of the office; the fuel pump stands just outside its left edge), running right up to the plinth and bell-mouthing out from there into the ring road (about 90 m across where it meets it), with a berm along its two outer edges and none where it joins the ring, whose own inner berm stops short of it (the right-hand flare is the shorter one so it does not fight the casino road's junction); the rover's wheel ruts curve across it onto the ring lane as before. The road shader has a new per-vertex width factor (`wid`) so a bed this wide keeps ordinary-sized soil texture and berms (every other road is unchanged). **Flight pads:** `makePadStop` now keeps the swept discs of two flights' pads 26 m apart (`PAD_APART`) where the town has room, falling back to the old spacing where it has not. At Meridian the shuttle's pad (it sat 14 m from the freighter's) is a spare pad at (94, 98) and the freighter's lands out past the crane at (117, -38), about 100 m clear of each other; the same rule opened up the pads at Hertz, the mine, Shackleton and Twilight (from 10 to 20 m apart to 37 to 69 m).
- **Debug overlay (F3):** the dev menu's loose readouts now live in one overlay. FPS and its 30 s graph, the CPU & GPU graphs, DRAW CALLS & POLYGONS, the pirate spawn debug, the AI paths and the input & controller monitor are all sections of it, picked from **Dev menu → DEBUG OVERLAY** (item 3). `F3` shows or hides the whole thing while you play, on any screen, once the dev menu has been unlocked; the sections you pick are remembered across launches (the rest of the dev menu's toggles still reset on reload). It replaces the chips that sat under the minimap (so the territory chip has its place back), and the input monitor, when it's on, sits at the right edge with the overlay beside it. Two things are new in it. **CPU TIME BY STAGE** splits the main thread's frame into player + input, game systems, enemies + shots, camera, world + fx, HUD + audio, terrain streaming and render submit, and shows what's left over as idle / GPU / vsync, so a slow frame says where it went. With **STAGE DETAIL** on (the default), `player + input` and `game systems` break down further, indented under their rows: for the player the pad, mouse look, rail grind, move + physics (a vehicle's drive too), tricks, weapons, animation and ragdoll, and for the systems each of secrets, missions, events, globe, territory, story, town, tutorial, garage, the tech chip's DOM write, alchemy, race, rides, meteors, key presses, powers, cosmetics and the scanner. A part only gets a row when it averages 0.1 ms or has spiked to 0.5 ms, and its group's number always counts all of them. **FRAME TIMES** adds the frame time, the 99th-percentile and worst frame, and a count of hitches (frames over two budgets) to the FPS. **WORLD COUNTS** shows the terrain chunks (shown, built, queued, on the workers, waiting to mesh), colliders, enemies, traffic, shots and particles, and the renderer section gains geometries, textures, programs, the buffer size and the JS heap. While it's off it costs one branch per frame hook, and a player who hasn't unlocked the dev menu never gets it. The dev menu is now: 1 jet / health / speed, 2 meteor, 3 DEBUG OVERLAY, 4 DISPLAY TESTS (cracked visor, show each polygon, show each draw call, static shadow cache), 5 click-map teleport, 6 full cheat menu, 7 ragdoll.
- **Meridian Exchange: one main garage by the road, two small sheds, and rovers on a service road:** the four big garages are now one main garage and two small ones. The **main garage** (the three-bay motor pool with the office and the fuel yard) has moved out from the south-west corner of the plaza to just inside the ring road, 128 m from the centre instead of 86, turned 180 degrees so its bays face the ring (it is clear of the landing pad and the container yard); the **two small sheds** are new, a variant in the same file (`garage_small`) with the same design at about the old sheds' size, 32 m by 17 m with two bays, a clerestory, a bay plate and lamp over each door, high windows, a roof ladder, a solar row, a vent and a side door but no office, fuel yard or antenna (one has a rover on a lift behind its open door, the other a workbench), on the plaza's north-west and south-east corners with their bays turned in to face the tower; the fourth corner is empty. A **service road** (the same carved track, 18 m wide) leaves the main garage's right-hand bay, runs out (across the forecourt of the entry above) and curves onto the ring road's inner lane as an on-ramp, 40 m long and well past the casino road's junction, with no berm where it comes in. **Two rovers** live in that bay: while the Exchange is in play one rolls out of the open door, drives along the service road, joins the ring and from then on is an ordinary road buggy (it picks a town and drives there, stops at its shelter and so on); a minute or two later, once nobody can see it, it goes home and the other takes its turn. The BAY 1 / 2 / 3 lettering is now centred on its plate, with a status lamp on each side instead of one (the plate, the lettering and the lamps are all symmetric about the bay). Viewer: `tools/viewer.html?m=garage&kind=main|small&open=101`.
- **Meridian Exchange: the garages are now a proper motor pool:** the four plain sawtooth sheds on the corners (a dark box with two small doors) were replaced by a Blender-built vehicle garage (see the entry above for how they ended up) (`tools/blender/build_garage.py` -> `src/assets/garage.glb`), 38 m by 20 m, bays turned in to face the tower. Three tall bays under a navy name board reading MERIDIAN MOTOR POOL with the exchange's globe emblem, each opening 7 m wide and 5.6 m high (a land-train fits) with a hazard-striped jamb, a door hood carrying a BAY 1/2/3 plate and a green or red status lamp, a hazard strip across the threshold and lane lines out on the apron, with a yellow bollard at every pier. The sectional doors are either shut (insulated panels with a window row) or rolled up to show a lit workshop (self-lit lining, strip lights, an overhead track): a rover on a two-post lift with its engine out and a roll cage, an engine stand beside an inspection pit and a drum rack, or a bench with a pegboard, parts shelves, a stack of tyres and a work lamp on a lead. Each of the four garages has a different set of doors up. The walls are cream with a navy base course, a cyan band between two gold pinstripes, steel pilasters and high windows along the sides and back; on top are a glazed clerestory, two plant units, a double row of solar panels, three exhaust stacks, a caged roof ladder up the back, an antenna with a dish and a blinking lamp, and two roof turbine vents that turn. A service office is built onto the right-hand end (lit windows, a door under a SERVICE canopy with steps, a roof plant and dish) and a fuel and coolant yard on the left (two banded tanks on cradles with ladders, manways and a pipe manifold into the wall, a pump island with a hose and nozzle, drums and bollards). The hall, office, both tanks and the pump island are solid, as the sheds were; the bays are for show. About 10k triangles plus 6k of outline each. The model viewer shows it: `tools/viewer.html?m=garage&open=101` (which bays are up).
- **Outposts from Blender (pilot, off by default):** the Relay Mast and the Watchtower can be built from `src/assets/outposts.glb` (made by `tools/blender/build_outposts.py`) instead of in code. A new static bake path (`src/staticBake.js`) turns the file into the same template the code-built outposts use: the same handful of merged draw calls, with colliders, blast boxes, the raid / smoke / drop points, sign faces and the flag / blink / spin parts read from empties in the file (collision is never taken from a mesh); a material named `additive…` bakes to a see-through light beam (the Watchtower's searchlight), and the outlines are the same width as the code-built ones. Add `?outpostGlb` to the URL, or set `localStorage['mr-outpost-glb'] = '1'`, to use it; a missing or broken file falls back to the code-built outpost and can't stop the game starting. `npm run check:outposts` validates the file, and `tools/viewer.html?m=outpost` shows the two builds side by side with every collider drawn and a check that their gameplay data match. The contract is in `docs/outpost-glb.md`.
- **Containers: decals centred:** the markings on the cargo container (the Prospector's car and the tower cranes' load) and the explosives magazine are now centred on the box. On the cargo container the branding plate sat 0.3 m off the middle, the emblem and name inside it were pushed left, the container number started left of centre, and the lot was high on the face; now the plate is centred left-to-right, its emblem and faction name over LOGISTICS are centred as a group on it (whatever the length of the name), the number is centred over it, and the plate and number are stacked so the pair is centred up-and-down on the box. On the explosives container the DANGER sign, the 1.1 placard and the two no-smoking / no-flames signs were bunched left; they are now laid out symmetrically (the placard dead centre, the DANGER sign and the pair of prohibition signs the same width either side), the EXPLOSIVES lettering and the faction's mark are centred together across the band (its width depends on the name), and the band and the hazard stripe are the same distance in from the roof and the deck and stop short of the corner castings they used to run under. The crane uses the same shared layout (`cargo_decals` in `decals.py`).
- **Tower cranes carry the Prospector's cargo container:** the little red / cyan / green box on the hook is now the same corrugated container the Prospector land-train hauls (`prospector_cargo`): faction-coloured steel with vertical ribs and roof ribs, dark corner castings, roof rails, barred rear doors and, on each flank, the branding plate with the faction's emblem, name and LOGISTICS, and the stencilled container number (`KPL 204117 6`). It hangs the way a real one does, from a steel spreader frame (four beams, a twist-lock stub in each corner casting, a lifting eye) on four bridle slings from the hook, and lies along the jib. Each crane carries a different faction's freight, as a mixed yard would: Kepler orange, Meridian cyan, SpaceCom white and yellow (Vostok's red-grey is in the model viewer, `&faction=`). Because the load is now 7.2 m long and hangs 8.7 m below the hook, the trolley no longer runs in closer than 7.9 m from the mast (it would clip the ballast and platforms), and the rope stops paying out with the container 1.5 m off the ground, so it never goes through the ground or the mast. The faction names, colours and the plate helper moved into the shared `decals.py` (the land-train model is byte-for-byte unchanged).
- **Tower cranes: a new Blender model:** the three tower cranes (two at the Meridian Exchange, one at the Helium-3 Exchange) are now one Blender-built model (`tools/blender/build_crane.py` -> `src/assets/crane.glb`) instead of a handful of boxes and beams in code. A square concrete foundation carries a ballasted base frame (a cross of beams with two slabs of ballast on each arm, tie rods and a lifting plate), then a 34 m lattice mast in eight sections: chunky corner chords, a diagonal on every face, splice plates at each joint, a ladder up one face and railed rest platforms every other section. At the top a slewing ring and turntable carry a tapering four-legged tower head with a wind gauge and warning lamp, the triangular-truss jib (trolley rails, end stops, a tip fitting) and a boxed counter-jib with a railed deck, stacks of counterweight slabs and a hoist house with louvres, door and exhaust stack, and the operator's cab hung out beside the jib root on brackets (big front window, roof air-conditioner, two floodlights). Pendant bars run from the apex to the jib and counter-jib. The trolley now has a carriage with wheels and a sheave housing, two rope falls and a hook block with its sheave, swivel, hook and latch and slings, carrying a corrugated container in a colour per crane. It moves as before (the head slews, the trolley runs out and in, the hook rises and falls, three warning lamps blink); the model is 34 m of mast under a 30 m jib and the game scales it for the smaller crane. The dev viewer shows it: `tools/viewer.html?m=crane&slew=..&trolley=0..1&rope=..&at=x,y,z` (`&at=` now works for every model, to zoom in on a part).
- **Idle animations:** the courier no longer stands like a statue. Once you've stopped (on the ground, no move input, skates off, speed under 0.6 m/s for a quarter of a second) the **breath** plays and loops: the chest rises, the shoulders lift a little, the head drifts. Every 10 to 30 s (a fresh random wait each time) one of four others plays through once and the breath comes back: **look around** (left, hold, back, right, hold, back, a quick glance up; 5 s), **weight shift** (rocks from skate to skate, one foot easing up, the arms counter-swinging; 4 s), **stretch** (arms up over the head, leaning back with a quiver, then a shake-out; 4.5 s) and **check wrist** (the right arm across the chest, head down, taps at the wrist; 4 s). They take turns in a shuffled order, so all four come round before any repeats. An idle eases in over 0.4 s and out over 0.2 s, cross-fades between clips over half a second, and is laid over the rest pose, so the scarf and the cargo move with it; moving or skating fades it out, and jumping, a ragdoll, a seat, a vehicle or a rail cuts it at once. Keyed in Blender on the runner's own pivots (`tools/blender/build_idles.py` -> `src/assets/idles.json`, 29 KB, 10 poses a second, within 2 degrees of the full-rate motion) and played by `src/idles.js`.
- **Missions & deliveries (Day 4):**
  - **Recall shuttle fails your work:** taking the emergency recall (hold R; BOLT's free shuttle too) now fails everything you have running before the scene plays: your contracts (both on a Twin Cradle), a live event and your story chapter (which the leader offers again, with no penalty). One list panel names each thing and stays up for the whole cutscene, then a toast repeats it; the R-hold bar warns "FAILS YOUR JOBS" first (and "LOSES RUSTMOON FOR GOOD" mid-Pirate-Wreck: failing the wreck still locks Rustmoon out, however it happens). The usual fail messages are skipped for it (a `quiet` flag on the three fail paths), and its story chip and hold meter are cleared.
  - **Prefab parts:** tougher than one bump, still fragile. Knocks up to 14 m/s (50 km/h) cost nothing, then 4% of their condition per m/s: a cruise-speed wall (18 m/s) is a 16% dent, 25 m/s 44%, 30 m/s 64%, and 39 m/s (140 km/h) smashes a fresh load (44 m/s with the Kepler Dampers I, 50 with II, 60 with III). Was 13.5 m/s and 5% per m/s: one bump over 33 m/s, and 25 m/s took 57%. About 5.5x as fragile as the most fragile contract cargo on skates (about 3x on boots). The condition now never reads 100% when dented or 0% while alive, the chip goes red under 35% with a one-off warning, and the pop says CRACKING! / FALLING APART! as it worsens. The dev speed multiplier no longer makes them unplayable. The 'carry' loads (Daedalus core, antimatter, vault cube) take exactly the damage they did, and share the new readout (the 1-99% clamp and the red chip).
  - **Kepler, Room to Grow:** the first Kepler chapter asks for two loads of prefab parts instead of three (you pick up the first the moment you take the chapter, so two hauls out and one trip back, down from three and two). Gran's brief says so; Pike's Hope is founded on the second delivery and the reward is unchanged. Founding Day and Meridian's Launch Window stay at three.
  - **Kepler, The Survey:** you now only need to be within 40 m (was 18 m) of a survey point for the 3 s hold, and each site has a faction-coloured ring on the ground at that radius (draped over the terrain, rebuilt for each site, gone once the last site is surveyed and the choose-your-town dialog opens). The chip says GET INSIDE THE RING from up to 250 m and its bar now moves (it sat at 0).
  - **Kepler, The Charter:** the finale now takes votes from every HQ except Rustmoon's (Kepler, the ILMB, Meridian Exchange, Bastion Vostok-9, the Daedalus Citadel), not the four Kepler towns: stand 3 s at a ballot stand in front of each leader, in riding order. The chip lists every HQ with a ✔ and AYE as it votes. Whatever you stand at with Vostok or Daedalus (up to and including hostile) Gran's letter of introduction lets you through their gates until the Charter is signed (a story clearance, `Story.hasClearance`, read by the restricted-zone check alongside the contract one), and if you sign the last one inside a zone you stay cleared until you leave it (a chapter that is failed, by a recall, a K.O. or abandoning it, gets no such grace). A conquered, fallen or ruined seat is left out of the tour.
- **Combat & physics (Day 4):**
  - **Rail Lance:** rocks now stop the beam. Every boulder and shaped rock (ramps, arches, hoodoos, ridges) is tested along its whole length, drawn ones included, not just the ones near enough to have colliders (`rockRay`, `rayCollider` in `physics.js`), so a pirate behind a rock takes nothing, while the beam still pierces everything in front of it (targets, buildings, traffic). It also finds the ground exactly now (4 m steps then bisected, instead of 8 m steps).
  - **Captain Kade's flak** shoves you: up to 20 m/s away from the burst, fading to nothing at 11 m (about 17 m/s at 2 m, 7 m/s at the 7 m the shells fuse at), softened by the Flak Weave like any blast, on top of the stinging, the lost speed and the pull down. Damage is unchanged.
  - **Ragdoll fuel:** the thruster tank now refills while you're in a ragdoll (and a drained one unlocks at 25% as usual); it used to sit frozen until you stood up.
  - **Meteors hurt NPCs:** whatever is under a landing rock is crushed and the blast beyond it batters the rest, less the further out: pirate runners and rovers, patrol and base troops and rovers, gun turrets, townsfolk and road traffic (wrecked trains and cars). Nobody is blamed (no standing loss, no base alerted). Runners and rovers are flung clear. Bosses, lair cores, the Mega Mite and your backup are left alone. Your own share is unchanged.
  - **Enemy crashes:** pirate and faction rovers now take the same crash damage as the vehicles you drive (`CRASH_SAFE`, 18 m/s; bosses and your backup excepted), and pirate runners take the same hard-landing damage you do (on their own health) and go limp in a ragdoll before getting back up (only when within 400 m of the camera; further off they just take the damage).
- **Kepler outposts (Day 4):**
  - **The outpost turret works:** the Militia Turret you build at an outpost was a prop. Nothing ever turned its head (the barrels pointed into the hub dome), and a hidden timer fired a shell every 1.2 s from a point 12.5 m above the dome's axis, 26 m from the gun, at the nearest pirate, with no lead and no check that anything was in the way. It also fired at other factions' troops, whose blasts a 'mil' shell does not hurt, so it looked busy and did nothing: in 20 s against three raiders at 120-160 m it landed about 76 damage (a 6% hit rate) and killed none. The head now turns (2.5 rad/s round, 1.5 rad/s up and down) onto where the nearest raider will be when the shell arrives, and fires only once the barrel is lined up: 26 damage with a 5 m splash at 150 m/s, every 0.9 s, alternating its twin barrels, from the barrel tip (a muzzle puff, and a click you hear within 300 m). Like the settlement turrets it holds fire when terrain or a building is in the way (it drops that raider for 3 s and picks another) and leads moving targets. It engages pirates and Rustmoon raiders only: not den cores, not another faction's troops, not pirates that are friendly to you; two guns prefer different raiders, and an idle head keeps sweeping. The same 20 s now gives about 255 damage and 1.2 kills with one gun (43% of shells hit) and about 496 damage and 2.4 kills with two. The logic lives in `territory.updateGuns` (the heads are found again by their `outpostGun` tag after every spawn, since a baked template is cloned), costs about 0.03 ms a frame, and replaces the old block in `story.updateOutposts`.
  - **A stand for it:** the turret now stands on an 8 m armoured stand like the settlement pylons (an octagonal column with faction bands, a ladder up the hub side, a railed deck with a glowing ring, sandbags round the outer foot), so the head sits 11 m up, above the hub dome's 11 m apex, instead of 3.5 m up behind it. The dome used to hide 30-45% of the ground round the compound from the gun at 40-80 m; it now hides 17-25%. The stand is baked into the compound's merged meshes (no extra draw calls; each turret is six meshes), with a stand column and a gun-body collider.
  - **Second Militia Turret:** a second gun, ₵900, available once the first is built, on a stand of its own beside the gate (30 m from the hub, 15 m from the nearest plots, not one of the six plots, so a fully built outpost is six plots plus two turrets). Its ring marker shows once the first turret is up. The terminal's "PLOTS BUILT" counts only the six.
  - **The *Raiders at the Gate* reward no longer does nothing:** the free Militia Turret used to be skipped silently if you had already built one (and went to your newest outpost, not Pike's Hope). It now goes to Pike's Hope, into the first empty turret slot (the second turret if the first exists, in either order), and pays its price (₵900) if both are already built, and the unlock line says which. The chapter's "Get to Pike's Hope" waypoint is tied to Pike's Hope too (`foundedIdx: 0`).
  - **An interactive outpost terminal:** F at the terminal opens a page instead of a text list: a pixel-icon tile for every building (Greenhouse, Clinic, Beacon, Turret, Second Turret, Market, Garage) with its feature, lit up with BUILT, or showing its price (red if you cannot afford it), LOCKED (the second turret, until the first is built) or NO PLOT. Click a tile, arrow to it, or press its number for a detail screen with live numbers (heal range, nearest clinic, linked beacons, gun range and rate, market takings with a fill bar, which vehicle the garage gives) and its button: COLLECT, PATCH ME UP, BEACON TRAVEL or BUILD. Building and collecting answer in the page without closing it. The numbered choices and Escape are the old menu's, in the same order. Enter acts on the selected building; on a controller A on a highlighted building does what it offers. The page is a reusable component (`src/terminalUI.js`: spec in, HTML out, no game imports) for the job board's second tab.
  - **Dialog plumbing:** `hud.dialog` takes `raw` pages and ignores buttons that are not dialog choices (they used to read as choice NaN and just close the dialog), `g.dialog` takes `stay` (repaint the open dialog in place), `onKey` and `quiet` (the second click of a double-click on a freshly answered page is ignored), `pickDialog` honours `keep`, and held keys no longer repeat into a terminal page.
  - **Greenhouse:** its description no longer promises income it never produced ("Heals you while you are nearby").
- **Land-trains: wheels on the ground:** on a slope every unit of a land-train rode with an axle in the air (a staircase, each car pitched less than the hill under it): the tractor and trailers were tilted to a smoothed, partly levelled ground normal, so over the whole network the tyres sat on average 25 cm off the ground, 42% of them more than 20 cm off, and up to 3 m on the steepest stretch. Each unit is now laid on the ground under its own tyres: the ground is sampled at all four wheel positions (six on the tractor, whose outer axles are 2.9 m out) and the unit takes the plane through them, pitched along the chord between the axles and rolled across any camber. The average error is now 2.5 cm, 1% of tyres are more than 20 cm off, and the worst is 0.55 m on a 39-degree slope. It costs about 1.5 microseconds a unit. The decks you stand on and the drawbars follow the same pose.
- **Meridian Exchange live ticker (World & Meridian):** the scrolling ticker round the trading tower now carries live prices for eight made-up stocks: the **Meridian Composite** (an index of the others) and Helium-3, Water Ice, Kepler Bonds, Vostok Scrap, Daedalus Phase-Tech, Selene Solar and Regolith Futures, each with an arrow for its move over the last 12 minutes. Prices take a random walk (a pull back towards where they started, a little momentum and the odd news jump) and **refresh every 15 seconds** of game time, and the market catches up if you've been away. The market lives in `src/market.js` (no rendering in it, and each stock keeps its price, change, % change, high, low, volume and a 12-minute history). `src/exchangeBoard.js` draws a full stock-board screen from it (table with sparklines and a detail panel); a pair of those was tried on top of the tower and taken down again for being hard to see, so it isn't mounted anywhere at present.
- **Monolith (World & Meridian):** the Low-G spell is gone, leaving three: **Time Dilation** as before, a new **Teleport**, and a reworked **Echo Followers** (the old "ghost skaters").
  - **Teleport** takes you to a random spot on the Moon: level ground (no crater rim or cliff) clear of settlements, plateaus, black lakes, roads, camps and outposts and at least 800 m from where you stood. You arrive facing a random way and launched at a standstill one time in four, otherwise at a random 1-300 km/h along your heading. Unlike a respawn it keeps your health and fuel, and a launch comes with 8 s of Soft Landing (the existing buff that makes impacts harmless) so a 300 km/h arrival on foot can't wipe you out.
  - **Echo Followers** are one or two holograms (not three) that retrace your own path 0.3 s and 0.6 s late, a couple of metres to either side, so they take every bump and follow you through jumps mid-air, and stay on the ground wherever it is (each sits as high above the ground at its own spot as you were). They last up to ten minutes, or until a shot hits one (when the last is gone the spell ends). Anyone shooting at you still picks one of you at random. The buff timer on the jar chip shows long times as m:ss.
- **Dev menu: ragdoll switch** (7): turns the runner's ragdoll on or off. Off, a wipeout or a hard crash still costs you the same health and speed, and the same pop-ups, but you stay on your feet instead of going limp; switching it off while you're mid-tumble stands you straight back up. On by default, and (like the other dev toggles) it lasts until you reload.
- **Roads: wider, and carved out of the regolith:** the dirt tracks were 10 m across with lanes 2.4 m off the centre, but a land-train is 5.4 m wide over its tyres (2.7 each side), so two passing each other overlapped by half a metre. The roads are now cut tracks with lanes 3.8 m off the centre (a 2.2 m gap between two passing trains) and a drawn width of 18 m: a graded bed 7.4 m each side of the centre, a dark cut line along each edge, and a smooth ridge of pale pushed-up dust outside it. The bed is churned, compacted soil, mottled and scraped in long streaks where the dozer blade ran, with a worn rut under each lane's tyres (they fade out on the junction flares); it is drawn translucent, so the craters and the colour of the ground show through, and the ridge melts softly into the surface. There is no paint, no studs and no loose stones: the only markings are the delineator posts, now a white post with a dark band, an amber reflector facing up and down the road and a lit cap, set 10 m out, clear of the berm. Junctions grew to match, and blend: where a road meets a ring or a T, its berm carries on round the outside of each sweep (the curve from the road's edge to the ring's outer edge, or the main road's edge at a T), while the inside of the sweeps, the crotch between them, stays bare, so no ridge or cut line crosses a junction's mouth. The sweeps are as wide as the road, as dark and solid as the bed (near-opaque, a touch darker where they overlap) and soft-edged where they melt into the ring. They have wider flares, longer turning connectors, a 12 m set-back for the stop shelters (it was 9), and pads, lamps and shelters keep 10 m off any road. The ring layouts come out the same, bar one 3 m bulge at Farside.
- **Vostok supply road:** a new road, 2.4 km long, runs from the Helium-3 Exchange to Bastion Vostok-9, the first road into a restricted base (it ends in the usual ring road and stop shelter round the bastion, inside the red zone: the guns still open up on you, but not on the trains). Two Vostok-liveried land-trains work it, one on each lane: a Moonliner and a Prospector (Helium-3 tanker, cargo container and explosives magazine) that shuttle between the exchange and the bastion, stopping at each end (the Moonliner swaps passengers). They only ever use this road, and come back to it if they're wrecked; nothing else drives it (the hover-cars and buggies that live on every other road are left off it, and no other vehicle picks Vostok-9 as a destination). The ILMB roads that wore Vostok colours before this are back in their own faction's livery.
- **Land-trains: the Moonliner and the Prospector, in faction colours:** the road-train is now two Blender-built services (`tools/blender/build_landtrain.py` -> `src/assets/landtrain.glb`), replacing the one orange tractor with passenger, tank and cargo trailers. The **Moonliner** is the passenger express: a streamlined bullet-nosed tractor with a swept windscreen and white-wall balloon tyres pulling three capsule coaches, each with a band of big rounded windows and a door on the right. It is the only one that picks up and sets down passengers; the old mixed consists, with fluid-tank and cargo cars among the passenger cars, are gone. The **Prospector** is the freight rig: a heavy-haul tractor with a dozer blade (hazard chevrons across it), a roof rack with floodlights, twin stacks and a spare tyre, pulling up to three of a cryogenic **Helium-3 tanker** (a riveted, banded pressure vessel on saddles with a gantry walk, ladder and valve cabinet, an **H3 / HELIUM-3** brand panel with an atom mark on each flank and an NFPA diamond on the back), a corrugated **cargo container** (branding plate and a container number on the side, barred rear doors) and an armoured red **explosives magazine** (EXPLOSIVES band and hazard stripes, a DANGER sign, 1.1 blasting-agent placard and no-smoking / no-flames roundels on the sides and rear, strobes and a lightning rod). Each unit is painted for a faction (body, trim, accent and lettering colours, with its emblem and name on the cab doors, coach flanks, tank panels and container plates): SpaceCom white and yellow, Vostok slate and red (the APC's), Kepler orange and cream, Meridian cyan and cream. A road's train wears the livery of the faction at either end of it, taking turns where two meet. Roads to the Helium-3 exchange get the Prospector. The decks you can stand on now follow each unit's shape (cab roof, tank, container) instead of one box. The model viewer shows them: `tools/viewer.html?m=landtrain&type=moonliner|prospector&faction=...&cars=...&unit=<n>`.
- **Vostok BTR-M APC: a turret that follows your aim:** the APC is now a Blender model (`tools/blender/build_apc.py` -> `src/assets/apc.glb`): an eight-wheeled slab-sided hull with a driver's block, wheel fenders carrying the red stripe and star, an engine deck with louvres, antennas and tow hooks, and a roof turret with a 30 mm cannon and a coaxial gun. The turret and barrel are separate pivots. While you drive it, the turret swings round (up to 2.6 rad/s) to face where the camera looks and the barrel elevates (from -7 to +43 degrees, up to 1.7 rad/s) to match; they aim for the spot the crosshair ray meets the ground (or 300 m out), so shells land on the crosshair, and the hull's own turning never drags the turret round with it. Left mouse (`RT`) fires the cannon instead of your own weapons: a new heavy tracer shell (a bright capsule with a halo, sparks and smoke behind it, 55 damage, a 9 m blast, 170 m/s with a little arc, one every 0.5 s) with a muzzle flash, a recoil kick on the barrel and a camera shake. The weapon chip shows BTR-M 30 MM CANNON while you're inside. The model viewer (`tools/viewer.html?m=apc&turret=..&barrel=..`) shows it.
- **APC touch-ups:** the crosshair stays up the whole time you're in the APC (it normally fades 10 s after your last shot), since that is where the turret is pointing. The hull now sits 0.35 above where it did, so its belly and fenders clear the tops of the wheels instead of cutting into them, with a solid underbody block between the wheels and a differential housing on each axle, so the axles run out of something. The two whip antennas lie back as you speed up (up to about 26 degrees flat out, a little flutter at speed, a spring lag when you floor it or brake), lean forward when you reverse and stand straight again when you stop.
- **APC rear:** the exhaust is now a short, upright rectangular stack on the back of the engine deck plate, with a flange, a clamp band and a glowing rim round a dark mouth (it was a pipe low on the side). The stack puffs black smoke while you drive the APC: a thin trickle at idle (8 puffs a second) and a plume while you're on the throttle (30 a second), each puff leaving upward and carried along with the vehicle, then shrinking away in about a quarter of a second so the trail is short. The hull now keeps its full height and width back to the end of the engine deck and then tapers to the tail plate, so the deck plate no longer sticks out over the taper and floats; the tail lights, tow pintle and jerry cans moved with it.
- **Dark-side banner:** ENTERING THE DARK SIDE (and BACK IN THE LIGHT) and the minimap's purple tint now switch at the terminator line itself, the one drawn on the map, instead of about 390 m past it.
- **Tricks:** the tucked pose now ends once you let go of the trick button and the model has levelled out, instead of lasting for the rest of the air time after any flip or spin. A half-finished trick no longer waits to flip you after a rail grind, a ride or a ragdoll.
- **Dev menu: input & controller monitor** (6): a photo of the connected Xbox or DualSense pad with every button, trigger and stick lit live, next to the keys the game sees held and the trick state; it goes red if the game has Q down while neither the keyboard nor the pad's Circle / B is. An Xbox Wireless Controller was being read as a PlayStation pad (its name contains "wireless controller"); it is now an Xbox pad.
- **Pause is quiet:** the wind, skate hum and thrusters no longer drone on while the game is paused. They fade out when the world freezes and fade back in when it resumes, and the same goes for the other screens that freeze the world (the map, the job board, the wardrobe, the reputation log and dialogs). The music carries on, and so do the menus' own clicks and blips.
- **Spindle mothership: arrives ahead, and follows your height:** it used to appear 400 m *behind* you and spend the best part of ten seconds catching up. Now it turns up already ahead of you, on one flank of the rock (a random side), out of sight round the curve as if it had been lying in wait behind the Spindle, and swings up over the horizon onto its station in about 5 seconds (it opens fire as it clears the horizon, and the alert reads SOMETHING IS RISING AHEAD). Its hover height was a fixed 92 m over the rock; it now stays 92 m up or 70 m above you, whichever is higher, so it climbs (up to 90 m/s, capped 420 m over the rock) when you go up on the jets and settles back slowly (35 m/s) when you come down. When you're more than 14 m off the ground, too high for the beam (a track painted on the rock) or the mines (10 m rings) to reach, it stops cycling through them and throws only the bullet barrage, every 1.5 s (1.1 s once you hold the core) instead of every 2.6 s (1.8 s), as long as its barrage eye is up; knock that eye out and you're safe from it until it re-arms.
- **Spindle drones: back in 10 s, and they stay with you:** a shot-down drone now powers back up after 10 s instead of 15. While it's down it no longer drifts off 20 m behind you: it keeps station off your flank, a little ahead, exactly like a live one, just dark and unable to shoot (it spins slowly so it reads as off).
- **Recall shuttle: you step off standing easy:** the recall cutscene never ran the skating animation, so whatever you were doing when you held `R` stayed frozen on the model: skating fast, you came down the ramp crouched and leaning forward with your arms out in front and the scarf streaming back as if you were still moving. The runner now starts the scene at rest (upright, limbs level, no bob, scarf hanging, trick state cleared; `Player.restPose()`), the scarf keeps simulating so it settles instead of hanging stiff, and you walk out with your arms swinging against your legs. The Spindle med-evac uses the same reset for its stretcher scene, which used to put the legs and arms back but not the torso's lean or the scarf.
- **Recall shuttle: lands on clear ground:** the shuttle came down a fixed 15 m behind your stand point without checking what was there, so at Kepler Civic Center its hull went through a 16 m mast and at Rustmoon Hold through a stack of crates (the other four HQs were clear). Before the scene starts it now probes the shuttle's whole footprint (with 1 m balls every 2 m, from the ground up to 100 m, so the descent and lift-off are clear too), the ground's levelness, and the walk from the ramp to your spot; if the usual spot is blocked it swings round your stand point in 30° steps (then 18, 21 and 24 m out) and takes the first clear patch, and the cinematic camera takes whichever flank has no wall between it and the shuttle. A spot that was already clear is unchanged, and the scene's timing is the same unless the walk gets longer.
- **Meteors:** a landing on a rock now flings you much harder (36 m/s straight up instead of 22, about 110 m of air) and away from where you hit it (16 m/s), with the same share of the rock's own glide, and the fall or run into it no longer eats the kick, so you clear the rock and can reach the next one. You can chain them: a bounce within 14 s of the last is a METEOR CHAIN ×n with more style each time, and landing on the same rock again (0.7 s later) bounces you off it again. A hit from the side or below still hurts, once. The rocks are 25% bigger (7.5-17 m radius, were 6-13.5), and so are their warning rings, blasts and chunks.
- **Dev menu:** reshuffled and a meteor button added. 1 is a new UNLIMITED JET, HEALTH & SPEED submenu, 2 is SPAWN A METEOR ON ME (a rock that lands on the spot you're standing on, first seen 70 m up so it's a few seconds away; the first time you use it, it also becomes a power, METEOR SPAWN (DEV) on the power wheel, equipped straight away, so `Z` / `RB` drops one on you without the menu, with no cooldown, and it stays on your wheel across launches), 3 DISPLAY & DEBUG (which now has SHOW AI PATHS), 4 CLICK MAP TO TELEPORT, 5 the full cheat menu. The Rustmoon Hold teleport and the pirate spawn debug entry are gone from the menu (the overlay's code is still there: `game.cheats.spawnDebug = true` from the console). Display & Debug has ten rows now, so its BACK is mouse / pad only (the number keys stop at 9; Esc closes).
- **Phase Dash:** a little more powerful and a lot more visible. The dash speed is your speed (at least 30 m/s) ×1.12 plus 16 m/s, capped at 112 m/s, instead of plus 12 capped at 95: about 15-18% harder at every speed (from a standstill 49.6 m/s instead of 42; at 60 m/s you leave at 83 instead of 72). And for the first 0.6 s of the dash you leave a purplish ghost of your model every few metres along the path, each fading out over half a second (and fading away near the camera, so they never blot out the view). The cooldown is still 4 s.
- **Spindle recovery:** the event chip no longer pops in over the end of the med-evac cutscene (for a frame with the old "km to the core" text, then "Get to the launch complex"). After the transit sets you down at the Monolith it stays hidden while you walk back to the launch complex, and returns with the Spindle's progress once the mission starts again; the arrival note and the objective marker still point the way.
- **Slipstream Vanes are a power now:** instead of steering in the air all the time, the Quantum Slipstream Vanes (Meridian's finale prize, and still yours if you already had them) are an active power: pick them on the power wheel (or with the mouse wheel / d-pad up) and use them with `Z` / `RB`. They stay on for 10 s (the sparks and ribbons only show while they're on; the power chip and the tech list count it down), then take 30 s from the moment you used them to be ready again. They need your skates, so they won't switch on from a vehicle or in a ragdoll. The air handling itself is unchanged.
- **Mute switch:** Settings → Audio has a new *Mute all audio* toggle (saved with the other settings). It silences everything at the master output (music, effects, wind, skates, thrusters), and while it's on the music isn't synthesised at all. `N` still turns the music itself on and off, and says so if everything is muted.
- **Pause menu: HELP:** the pause card has a HELP button that opens the controls list centred over a dim backdrop, like the settings; BACK, `Esc` or `B` returns to the pause card. It is now the only way to the controls list: the radial menu's HELP wedge and the `H` key (which toggled a panel in the corner over the game) are both gone. The Settings → Controls row that was "Help panel" is now "Blackjack: hit", since the casino still reads that key.
- **Controller menu:** the MUSIC and HELP wedges are gone (music is under Settings → Audio, now with the mute switch; help is on the pause card), leaving five wedges: vehicles, powers, wardrobe, reputation log, empty jar. The controller's help list leaves out the N (music) row, which has no pad button now.
- **Power wheel:** the controller menu (d-pad down) has a new POWERS wedge that opens a wheel of every power you own (Phase Dash, Teleporter, Hitch-Line Winch, Pen Link), styled like the vehicle wheel: the right stick picks, `A` (or d-pad down) equips the pick, `B` / `Start` cancels, and each wedge shows whether the power is ready or how long until it is; the equipped one has an orange edge. Equipping is what a notch of the mouse wheel / d-pad up does, so `RB` then uses it (and, as with the mouse wheel, you can't swap away while the winch cable is on). The PEN LINK and TELEPORTER wedges are gone from the main menu, since both are on the power wheel now.
- **Dev menu: FPS log graph and CPU / GPU graphs:** two new toggles in DISPLAY & DEBUG. FPS LOG GRAPH logs the last 30 seconds behind the FPS chip, with the value drawn in white with a dark outline so it stays readable over the line. CPU & GPU GRAPHS add two load graphs under the chip (CPU = main-thread frame time as a share of the frame; GPU uses the browser's timer-query extension and reads N/A without it).
- **Static shadow cache:** the sun's shadow map no longer redraws everything each time it refreshes. What never moves in a settlement (the merged buildings, terrain, boulders, and props that have stood still a while) is drawn once into a depth map of its own and copied in; only what moves (you, characters, vehicles) is drawn on top, and the cache watches every caster, so anything that moves, appears or goes is redrawn the same frame. Shadows are the same picture as before, with one change: the shadow box now steps in 7.5 m cells as you move instead of gliding with you, so it can sit up to 4.5 m off-centre and shadows reach at least ~155 m instead of 160. It stays out of the way where it can't help: open ground, very fast skating or streaming, and the Spindle (whose sun turns). Dev menu → DISPLAY & DEBUG item 6 toggles it, and the draw-call readout shows what the shadow pass did this frame.
- **Cheaper pixels, same picture:** the terrain's crater-rim ink (eight noise lookups per pixel) is now only worked out within reach of a rim instead of on every ground pixel; the helmet lamp, its glow and the lab reactor's light are switched off outright while they're at zero (daylight, away from the lab) rather than looped over by every lit pixel, and the lamp and glow now settle to exactly zero a few frames sooner (too faint to see); and the post pass skips its speed-line maths when you're neither moving fast nor boosting. Checked frame-for-frame against the previous build. The startup shader warm-up also now compiles against the target the game actually draws into (it was compiling programs the game never used, so the first frames compiled them mid-play), and warms both light set-ups.
- **Minimap:** the terminator (violet dashes) and SAT-7's orbit (green dashes) now show on the minimap too, in the same colours as the globe map, so you can see where the dark side starts and where the satellite will pass. Like the roads they stay however far out the minimap looks.
- **Pirate camps:** every settlement already sat inside its own faction's territory, but three of the five hidden pirate camps were out in other factions' ground or right on a border. Those camps now move to the nearest dark-side spot well inside Rustmoon's land; camps that were already inside stay where they were.
- **Globe map:** territory borders are now sharp, smooth lines. Each pixel of explored ground is coloured by the faction that actually holds it (no mixed colours at the edge, and no more steps along the ~180 m exploration cells), so a border stays crisp however far you zoom in.
- **Vehicle dust trails:** above about 18 m/s the vehicles you drive kick up the same pale dust as the skate. On wheeled vehicles the rear wheels throw bigger and thicker clouds the faster you go (puffs grow from 0.5 to 1.2 and the amount up to four times at 78 m/s) and the front wheels kick up a steady 0.7 puff. The Phase Skimmer's rear dust comes from just behind the ends of its engine plumes. Nothing while airborne.
- **Spindle recovery: you're carried, not walking:** the recovery transit used to have you climb into the shuttle, which made little sense for someone who's been knocked out. Now you lie where you fell as the Meridian craft touches down beside you and drops its ramp; two medics in teal rush out with a stretcher, set it down, lift you onto it, turn and run back aboard, the ramp closes and the craft takes off. The HUD is hidden for the scene (just the picture and a caption), SPACE skips it (not in its first second and a half, so the ENTER that called it doesn't), and the fade, the drop at the Monolith and the restart of the Spindle are unchanged. The craft lands clear of the extraction pad, the shrine and the launch rocket (you're moved a few metres if you fell on top of them), and if you fell off an end it sets down on the rock's nearest end. The mothership and any drones are hidden for the scene, so they no longer hang frozen in frame.
- **Vehicles no longer sink into the floor:** the wheels (and the Phase Skimmer's hull when parked) reached a little below where the vehicle was placed on the ground, so they clipped into the terrain, more so on slopes. Wheeled vehicles now ride 0.2 above the ground and a parked Skimmer settles just above it.
- **Small outposts (farm domes, depots, towers, kiosks):** the "SAPLING SWIPED!" / "DOME DOWN!" pop-ups and the jar toasts now stay on screen about twice as long, so they can actually be read. A raided outpost just says PICKED CLEAN; the restock countdown is gone (it still restocks after 4 minutes, you're just not told when).
- **Vehicle flag:** no more wild flapping at around 30-45 km/h. The ripple's phase was recomputed from the game clock times a speed-dependent frequency, so every small change in speed threw the wave forward by radians; it now advances frame by frame and the speed it reacts to is eased.
- **Cheat menu splice submenu:** MORE → SPLICE MUTATIONS… toggles each of the ten splice-pod mutations on or off (no jar needed, ignores the 3-mutation cap) and has a RESET ALL button. It replaces the old CURE MUTATIONS button.
- **Fewer triangles in settlements:** outline (ink) shells are now cut into 60 m chunks and switched off beyond ~110 m (and on resident characters beyond 50 m), where they're thinner than a pixel and the post pass's own outlines carry the silhouette; and the never-seen undersides of boxes, cylinders and aprons standing on the ground (and their outline shells') are no longer built. In the hub the ink drawn per frame drops by roughly 40%; nothing changes up close.
- **Debug views:** DISPLAY & DEBUG in the dev menu gets SHOW EACH POLYGON (every triangle outlined over a dark fill) and SHOW EACH DRAW CALL (every draw call in its own flat colour, so you can see what batches and what doesn't). Both draw the bare scene without the comic post pass; they're mutually exclusive and last until you turn them off or reload.
- **Shadow pass:** the shadow map (the heaviest single render pass) now refreshes every other frame while frames are quick and you're moving slowly (standing, walking, in a settlement), and every frame when you skate fast, teleport, or the frame rate is low. Shadows look the same; the saving shows up in busy places.
- **Cracked visor, faster and in front:** the cracks are now painted once onto a single canvas (repainted only when your hull moves by a percent) instead of a few hundred live SVG paths under a screen-wide filter, which tanked the frame rate near death. They also draw in front of the rest of the HUD now.
- **Dev menu, DISPLAY & DEBUG:** item 6 of the dev menu (F8) opens a new submenu with the FPS readout (moved here from item 6), a DRAW CALLS & POLYGONS readout under the minimap, and a CRACKED VISOR toggle.
- **Cracked visor:** as your hull drops, cracks spread across the screen behind the HUD: the first impact appears around 70% hull and more (and longer) cracks creep in until the screen is webbed at the bottom.
- **Grind popup:** like tricks, the `+points` on the grind popup only shows during a delivery, when the points actually count.
- **Settlement banners:** the big name banner now shows only the first time you walk into a settlement (remembered in your save). After that, the settlement's name sits centred under the territory line in the territory chip while you're inside.
- **Vehicle controls popup:** with a controller in use, the popup when you get into a vehicle shows the pad's buttons (left stick to drive and steer, A hop, Y get out, in your pad's own glyphs) instead of the keyboard keys.
- **Ragdoll lockout:** while you're limp in a ragdoll you can't fire your weapon or scope in, and can't use powers (Phase Dash, the Teleporter, the Kepler winch, the pen link).
- **Freighter camera:** hopping onto a freighter (or shuttle, or a funpark ride) while you were still ragdolling no longer leaves the camera behind at the boarding spot; the tumble ends as you take your seat and the camera follows the ride.
- **Casino and lab interiors:** stepping inside the Lucky Crater Casino hides the HUD (interaction prompts, toasts and pop-ups stay), and wipeouts and hard crashes no longer ragdoll you inside the casino or Dr. Zbornak's lab.
- **Jar toggle in the wardrobe:** once you own a containment jar, a JAR ON / OFF button (or `J`) sits in the top-right corner of the wardrobe preview; the preview turns to show your back. Hiding it is cosmetic only, it still works.
- **Grinds are harder to snag:** skating or flying across a crest at an angle no longer clamps you to it. You grab a rail by heading along it, dropping onto it, skating into a tip, or hitting a snake rock's side at speed.
- **Grinding recharges the jets:** the thruster tank now refills while you ride a rail (it used to freeze, because the normal physics step that recharges it is skipped on a grind), and a locked-out tank unlocks at 25% as usual.
- **Spindle: no checkpoints, a recovery transit instead:** the five checkpoint beacons (and their glowing lines round the rock) are gone. If you go down on the Spindle, the death card now offers a recovery transit: a Meridian shuttle drops out of the sky beside where you fell, you climb its ramp, it lifts off, and you come down at the Monolith's launch complex with full health (the usual ₵100 med-evac fee still applies). The chapter isn't failed, but the Spindle starts over: you're back on "Get to the launch complex", with no core and no progress carried over. Falling off an end of the rock isn't a K.O.: it still just puts you back at the start (or the extraction pad once you hold the core).
- **Ragdoll on the Spindle:** a wipeout or crash on the Spindle dropped the ragdoll through the rock (it fell for good, ending tens to hundreds of metres below the terrain). The ragdoll worked out "down" and the height above the ground from the Moon's centre, but on the Spindle both are measured from the asteroid's axis; it now asks the same up / height helpers as the rest of the physics. Moon ragdolls are unchanged.
- **Spindle trails:** the skate trail and the jet exhaust (and every other particle: dust, sparks, explosion debris) were switched off the moment you reached the Spindle, because the step that hides the Moon's scene also hid the effects' meshes; they now stay on. The skate trail is also laid on the rock you can see: the Spindle's ground is drawn as a 5 m mesh that stands up to a metre above the height you skate on in hollows, which used to bury the ribbon in dips and craters.
- **No vehicles or teleporting while ragdolling:** limp in a ragdoll you can't call a vehicle (V / Y, the vehicle wheel or the controller menu's Vehicles wedge) or use the Teleporter (T or its wedge). The wheel closes if it was up, and the two wedges dim until you're back on your feet.
- **ILMB road network:** the roads from the ILMB to Aldrin, to Meridian and to Tranquility are gone. In their place one road runs from the ILMB to the middle of the Meridian–Tranquility road and ends in a T on it, and traffic splits there: vehicles on the Meridian–Tranquility road can carry on or turn off toward the ILMB, and vehicles coming from the ILMB turn either way onto it.
- **Roads on the maps:** the road network (the roads between settlements and the ring road round each town) is drawn on the globe map and the minimap, with a Road entry in the map legend. Like the ground itself, a stretch of road only appears once you've charted it. On the minimap it sits under everything else and stays when the view zooms out at speed.
- **Vehicle crashes:** hitting a wall, a building or road traffic hard enough (over about 18 m/s) now damages the vehicle you're driving, in proportion to the speed you hit at (a crash can take up to half its hull), and every hit that damages a vehicle, from a crash, enemy fire or ramming, bursts on it in an explosion that grows with the damage. Driving up ramps and roofs, bouncing off inflatables and gentle bumps cost nothing.
- **Vehicles hit traffic:** the rovers, bikes and hover vehicles you drive no longer pass straight through land-trains and road hover-cars (and the satellite deck). They were skipping every moving-deck collider; they're solid now, and you bounce off at the speed you closed on them. Ramming still damages them. Pirate and military rovers are unchanged.
- **Ghost rovers:** the military patrols that drove between outposts were scenery: no collider, no hit points, nobody inside, and they vanished as you left. They're now the same armoured cars as the base patrols: solid, shootable, rammable and hookable. They hold their roads, shoot pirates (and you, if their faction counts you an enemy or you shot one), cost you reputation if you wreck one, and are not replaced for a couple of minutes.
- **Weapon Tuning Kit:** +20% damage per level instead of +30% (the Black-Market Tuning Kit shares the same upgrade).
- **Vehicle wheel:** the boxy "YOUR VEHICLES" list is gone. The controller menu's VEHICLES wedge now opens the vehicle wheel (the same one you get holding `V` / `Y`), restyled to match the controller menu: the right stick picks, `A` calls it, `B` / `Start` cancels, and the pick glows white in the light and purple on the dark side.

## 0.9.99-1 — 2026-10-13

- **PlayStation gyro:** with a DualShock 4 or DualSense, hold Circle and tilt the pad: how far you've turned it since Circle went down is added to the left stick, so it moves you on the ground and flips / spins you in the air. The browser's gamepad interface can't see a PlayStation gyro, so it's read over WebHID (Chrome, Edge and the desktop app; the desktop app allows Sony pads up front, a browser asks once under Settings → Gameplay → CONNECT). Settings → Gameplay has an on / off toggle, how much tilt is a full push, and flips for left / right and forward / back. With the spawn debug on, the bottom-right overlay shows the live gyro readout.
- **Controller radial menu (d-pad down):** replaces the quick-slot chip under the weapons. Tap d-pad down to open a wheel of everything without a button of its own (vehicles, wardrobe, reputation log, music, help, empty jar, pen link, Teleporter); the right stick picks a wedge, `A` (or d-pad down again) uses it, `B` / `Start` cancels. The picked wedge glows like the minimap: faint white in the light, purple on the dark side. Wedges you don't own yet stay in place, dimmed.
- **Impact damage:** a soft-capped curve (up to half your max health per hit) instead of a flat cap of 22, so faster crashes keep hurting more. Style points no longer pay credits outside a delivery.
- **Scarf:** the wind, flutter and acceleration swing on the scarf are capped, so at speed it streams a little but stays close to the runner.
- **Jet cooldown:** emptying the jet tank locks the thrusters out until it has recharged to 10%; the JET bar dims while locked.
- **Removed the action panel and Hall of Highlights:** no more picture-in-picture comic panels, highlight photos, their settings, or the highlights screen on the ILMB job terminal.

## 0.9.99 — 2026-10-10

**Polish**
- **Save safety:** the first time a slot is saved each session, what it held is kept as its backup.
  LOAD GAME gets per-slot tools: EXPORT (the slot to a file), IMPORT (a save file into a slot; what it
  replaces is backed up first), RESTORE (the save as it was when you last stopped playing) and DELETE.
  A slot that won't read shows as DAMAGED, with RESTORE to put the backup back.
- **Quality presets:** Settings → Graphics → Quality preset (LOW / MEDIUM / HIGH, or CUSTOM once you
  change something by hand). A brand-new install guesses one from the graphics card, then times the
  first half-minute of play and steps down once (and says so) if it's struggling. Existing players keep
  what they had.
- **Camera stays out of walls, smoothly:** the camera's wall check is wider than its near clip and finds
  exactly where the wall starts (not the nearest half-metre step), so with your back to a dome or any
  curved wall it slides along it steadily instead of jittering; it eases in quickly and back out slowly.
- **The Spindle loads instantly:** its rock is now made by a background worker while the mission's earlier
  steps play out, so the mission starts without the ~2 s freeze.
- **Map legend:** a key beside the globe map with the main symbols (drawn just as the map draws them) and
  the faction colours; everything on the map still explains itself on hover. The arrow folds it into a
  slim tab; it remembers.
- **Skate tones:** each pair of skates hums in its own voice, all low and easy to live with: the classic
  HUM (Q-Lock Standard, Chrome Comets, Dark-Side Survivors), a smooth airy GLIDE (Void Gliders, Prism
  Drive, Lucky Felt Rollers), a low mechanical RUMBLE with a wheel-throb (Solar Flares, Seismic Striders,
  Derby Hooves), and for the Jackpot Rollers a warm hum with a soft shimmer of gold and a ringing, metallic
  coin-edge spin that turns faster as you do.

**Mineral tints on the Moon**
- **Hue, never brightness:** the ground keeps its classic tones and shading, so a tint can't be mistaken
  for a shadow and the shadows keep all their contrast. Broad regions lean a touch cooler (blue-grey, the
  maria) or warmer (tan, iron-bearing ground).
- **By what the ground is:** buff on the ridged highlands and scarp steps, rusty brown down the rilles,
  a cleaner grey on fresh crater rims and their gravel, dull brown in old worn craters.
- **Mineral colour boost:** the tints pushed further, warm ones
  toward orange-brown and cool ones toward blue each by their own amount (the classic tones underneath
  untouched), and more the higher you are: modest underfoot, richer from high up, like the colour-boosted
  photos of the Moon.
- Only colour: no terrain shape moved. (`PLANET.painted` in config.js turns the tints off altogether.)

**Performance**
- **No more terrain stutter at speed.** The Moon's ground is now worked out on background threads (2-4
  terrain workers, by CPU): a detailed chunk took ~25 ms on the main thread, longer than a whole frame,
  so going fast dropped frames every time you crossed into new ground. Measured over 8 s at 80 and
  160 m/s: frames over 16 ms on terrain went from 5 and 14 to none, worst case from ~25 ms to under 11.
  The workers build exactly the same ground (checked vertex for vertex, plateaus included), and if a
  worker can't start, the game builds on the main thread as before.
- **Build-ahead.** The workers also start on the detailed ground round where you'll be in ~1.5 s, so it's
  usually ready before you get there; a gap (nothing built yet) gets a quick coarse chunk first.

**Collision pass** (everything that takes up space now has a clean collision shape)
- **Shared props:** crates, shipping containers, tanks, junk heaps (stepped like the mound), barrels,
  sandbag walls, lamp posts, pipe runs and conveyor belts all collide, wherever they're used.
- **Lattice towers** (cranes, masts, derricks, the launch gantry) get a solid core that steps in as they taper.
- **Wrecked hulls:** the bare rib section and the torn-off plate are solid too, not just the hull.
- **Fortress walls** (ILMB, Vostok, Daedalus, the arrays): the collision reaches out to the buttresses
  and plinth, so the outside is one flat face instead of a wall you sink into.
- **Places:** solar fields, the ILMB's parked rovers, shuttle-stop shelters, raised landing pads, the
  He-3 ore heap (stepped), the bunker blast doors and tank traps, playgrounds, Coldwater's greenhouses,
  slide and parked Mule, the lab's cable reels, the Monolith camp's instrument bench.
- **Chimera Downs:** the inside and outside rails are a fence you hop (not posts to slip between), plus
  the finish gantry, photo booth, distance poles, jumbotron, winner's arch, the statue and the gate arch.

**Lighting**
- **No more hard-edged shadow blotches and "spider-web" streaks on the ground.** Far-off terrain is drawn
  with big, coarse triangles, and it was still casting sun shadows onto the ground near you: flat
  polygons of shadow that matched no hill on screen, stretched into radial streaks when the sun was low.
  Only the detailed terrain round you casts now (crater rims still throw their long dusk shadows).
- **The Spindle's crater "spider-webs" are gone.** Its rock is a grid with a vertex every 7 m, and its small
  craters (down to 12 m across) had a peaked rim and an ejecta skirt that started with a step, so round
  each one the grid drew a star of triangles that caught the light. Craters are now at least 30 m across,
  rims and skirts are rounded with no creases, the pit chains are spaced out, and rayed craters get five
  broad soft streaks instead of a dozen hairlines.
- **No more pale smudges round craters from above (Moon and Spindle).** The ground's toon shading had a
  second step from mid-tone to full sun, so every slope tipped a little toward the sun (each crater's
  outer flank) jumped a whole tone into a soft pale blob. Past the night side's dark band the light now
  rises gently to full sun. The Moon's rayed craters also swap a dozen hairline rays (a web of spokes on
  the coarser far terrain) for five broad soft streaks.
- **The Spindle is smooth.** Its ridges, crags, crater bowls, terraces, central peaks and rilles were all
  built from shapes with sharp creases, which its grid drew as lines of light and shade. Every crease is
  rounded now (bowls ease into their rims, terraces are soft stairs, rilles are smooth troughs with low
  levees), rims are at least ~14 m across, the grid is finer (5 m, was 7), and each grid square splits
  along whichever diagonal follows the ground, so slanted rims no longer come out as rows of teeth.
- **Smooth crater shadows on the Moon.** Each terrain square split along the same diagonal, so a crater
  rim crossing the grid at a slant zigzagged, and a low sun stretched that into a row of jagged teeth
  along the rim's shadow. Squares now split along whichever diagonal follows the ground (the ground under
  your feet uses the same split). Rille floors lost their fine rubble too, which stippled them with
  specks of shadow at dusk.
- **No saw-teeth inside crater walls under a low sun.** Where a crater's wall turns away from the sun it
  was shadowing itself through the shadow map, a band of jagged teeth down the far wall. The ground now
  eases smoothly into shadow there (it only ever darkens), and crater crests are rounder.
- **No more soft dark smears on the Spindle.** The rock was lit by the rule meant for buildings and props:
  every slope within ~12 degrees of edge-on to the sun faded toward dark, and under the roll's low sun
  that covered the rock in soft smudges at every angle, day and night. It's now lit like the Moon's
  ground: a crisp turn into shade only where a slope faces away from the sun, so craters and ridges read
  as relief. Also: the mothership no longer casts a shadow (90 m up, it threw huge soft blobs that
  crawled along with it), and the sky fill out there is even all round.
- **No rayed craters on the Spindle.** Even softened, their pale streaks read as smudges round the craters
  at night. Every crater stays exactly where it was.

**Layout**
- **Lucky Crater Casino:** the hall no longer sits alone in an empty crater. A neon boulevard leads from
  the red carpet to a fountain plaza (a tiered fountain spilling a curtain of water, a ring of chip-red
  tiles, benches and neon palms, the way in left clear), a LUCKY CRATER pylon sign stands out by the
  road with each word on its own line, and car parks either side, curbed and hedged with a P sign at the
  way in, are full of parked hover-cars.
- **Meridian Exchange:** the four warehouses turn their loading docks in to face the tower across the
  plaza, instead of a pinwheel.
- **Meridian launch complex:** its sign board stands on legs instead of floating, and its colliders now
  turn and sit with the tilted complex (the gantry arms and sign were off before).

## 0.9.98 — 2026-10-10

**Models**
- **Hover-car:** 15% bigger and smoother: a flattened capsule hull with a rub-strip round the waist,
  lights set flush into the nose and tail, slim side pods with intakes and warm vents (no more bright blue
  thrusters underneath), a roof hoop, mirrors, door seams, a brake light, a plate and a whip antenna.
- **Land-train hitches:** every trailer now has a real drawbar, re-aimed each frame from its yoke to the
  coupling pin of the car in front, so the train stays joined over crests and dips.
- **Vostok and Daedalus bases:** the command bunker's slits, bands and armour now sit square on every
  face (they were tilted along the wrong axis), and the bunker is bigger. The barracks are bigger Quonset
  huts spread round the yard, their doors facing the bunker.
- **The Monolith:** a bigger slab, and a camp half as wide again: a wider berm, more floodlights, a second
  tent, a site cabin, survey stakes and tape, a taller scaffold. The transit pad now sits out past the berm,
  clear of where Meridian builds its launch complex, and the launch complex sits flush on its plateau
  (it was floating at one edge).
- **Pirate outposts:** the Scrap Shack's huts are bigger and visibly shot up (a blast hole with bent-out
  metal and hot edges, half the roof peeled back, scorch marks, bullet holes, a shored-up corner, a torn
  tarp). The Junk Pile gets a bigger, ripped tent and a half-collapsed lean-to.
- **Dr. Zbornak's lab:** lab gear along every inner wall: a fume hood, a glassware bench under a
  chalkboard of sums, specimen tanks, a cryo freezer, a pipe manifold, a server bank, gas bottles,
  lockers, an eyewash station and cable trays. Zbornak now stands on his own dais behind a waist-high
  workbench with a console bank behind him. The holding-pen terminal is a small kiosk with a screen.

**Your runner**
- **The scarf** is a smooth physics ribbon now. It leaves the collar a little to the right, so it hangs
  down the side of a cargo crate (or the Kepler twin stack) instead of over it, and streams and flutters as
  you move. Each outfit has its own scarf: length, width, and one tail or two.
- **Capes are gone.** The outfits that had one now wear a long twin-tailed scarf.
- **Wardrobe tiles** show rendered portraits: every outfit in three-quarter view with its scarf, and every
  skate finish close up on the boots and rails.

**Interface**
- **NPC name tags** (the faction leaders, Dr. Zbornak, Vinnie) are solid labels drawn over the scene,
  so busy scenery can't swallow them. They shrink as you walk up, fade with distance, and hide behind
  hills and walls.
- **Holding pen:** chimera names take their grade's colour (S yellow, A pink, B cyan, C grey), the page
  is wider with three cards a row, and hovering any stat, part, trait or grade explains what it means.
- **Dr. Zbornak:** "Give me a jar" is offered right after "How does this work?", and his answers ("Got
  it", the rumours) lead back to his other options. A jar you own now shows on your pack from the start
  (it used to appear only once you scooped something).

**World**
- **Hover-cars** are faster and outpace the town speed limit, so a car that hops over a land-train
  actually gets past it instead of shadowing it.
- **Spare landing pads** that no transit line uses are gone (Hertzsprung, Farside, Twilight, Kepler):
  they sat empty, sometimes under a lamp post.
- **The holding pen:** its terminal faces the pen again, and the chimeras in the pen roam the yard
  (wander, stop and look round, wander on) instead of standing in rows.
- **Music:** the dark-side track plays out on the Spindle during Meridian's finale.
- **The containment jar** clips to the right of your pack; the scarf hangs down the left.

**Performance**
- **Merged static geometry.** Every place's buildings, props and outlines that never move are folded
  into a few merged meshes, chunked by area so off-screen chunks are still skipped and small props
  still drop out at range. Plain colours share one vertex-coloured material, so a chunk is one draw
  call however many colours it has. Anything that moves, animates, blinks, gets hidden, is swapped by
  the story, or uses glass or a texture stays as it was. Places merge in idle time on the title
  screen (the rest on the first frame of play), and a place the story rebuilds merges again.
- Every kit-built model (outposts, turrets, rovers, traffic, settlement parts) bakes its plain colours
  the same way: a turret is 6 meshes instead of 16.
- At the ILMB, from about 2,300 meshes drawn to about 1,700. The places themselves went from ~3,500
  static meshes to ~1,200 chunks across the Moon.

**Lighting**
- **No more shadow streaks and blotches on buildings.** Every settlement sits square to the sun, so its
  east and west walls are lit exactly edge-on, where the shadow map breaks into diagonal streaks; and
  curved undersides (the Meridian Labs deck) were blotched by their own back faces. Faces the sun
  skims now ease smoothly from lit to dark, and faces turned away from it are simply unlit. Cast
  shadows on sunlit faces are unchanged, and the ground keeps its long dusk shadows.
- **Shadows hold still as you move.** The shadow map follows you in whole texels along the sun's own
  axes (it used to snap on the world axes, which still let it slip by part of a texel every step).

**Sky**
- **The planets:** Venus near the sun, then Mars, banded Jupiter and ringed Saturn round the ecliptic:
  small, far and quiet, each lit by the real sun so it shows its phase (on the Moon and on the Spindle).

**The Spindle**
- **Terrain:** no smooth maria any more: all rough highlands, with half again as many craters (deeper,
  plus chains of small pits), three long sinuous rilles with low levees, rugged massifs, curving
  scarps and sharper ridges.
- **Long-ways terrain:** eight rilles now, most running down the rock toward the core (a couple close
  either side of the line in), darker in their beds; the ridges run long-ways too. The old ridges were
  two waves multiplied, a diamond checkerboard of humps that read as patches across the ground.
  Crater walls are shaded and rims picked out in the colouring, and the small bumps are calmer, so the
  ground reads as terrain rather than mottling.
- **Ground mines** spread wide (a few on your line, the rest a field to thread, never stacked),
  bigger (10 m) and with a longer fuse (1.8 s).
- **The rock's shading:** the pale polygons and dark blotches across the ground are gone. It wasn't
  intended: hard toon bands on a coarse mesh at low sun angles, plus the sun still shining up through
  the rock on the night turn. The rock now shades smoothly and goes properly dark at night; shadows
  hold still as you move there too.
- **Drones** hit harder (5, with a little splash) and their bolts are faster, so dodging is still the
  answer but a stray one now stings.
- **The plasma barrage** fires a quarter faster. **The ground mines** come in fourteens, aimed off
  where you're actually heading (your full velocity, played forward to the fuse).
- **Past halfway**, the beam attack fires **two beams at once**, one from each side of the ship,
  sweeping toward each other on tracks either side of your line.

**Snake rocks**
- **Their tips are solid now** (a slab under the sloping crest, so you can't run through them, but you
  still roll straight up onto the rail).
- **Catching the grind is more reliable:** skating into a ridge's side at speed hops you up onto the
  crest; a fast approach is checked along its whole path so it can't step over a tip; and running up
  a slope into one no longer counts as flying past it.

**Controller support**
- **Play with a gamepad** (Xbox, PlayStation, Switch Pro: any standard controller). Analog movement on
  the left stick, look on the right, triggers to fire and thrust, the shoulders for skates and powers,
  the d-pad for weapons, powers and the jar; `View` is the map (hold it to recall), `Start` pauses. It
  takes over the moment you pick it up and steps aside when you touch the mouse or keyboard; key
  rebinding doesn't get in its way.
- **Every screen works with it:** a highlight moves over whatever's on screen (dialogs, the job board,
  shops, the wardrobe, the casino, the holding pen, settings, pause): `A` presses, `B` backs out,
  `LB`/`RB` switch tabs, the right stick scrolls, sliders slide. The title menu takes the d-pad too.
- **Prompts show pad buttons** while it's in use (`X — TALK TO DR. ZBORNAK`).
- **The quick slot (d-pad down)** covers everything without a button of its own: tap it to use it,
  hold it to pick what it is (left/right, or keep holding to step): empty the jar, wardrobe,
  reputation log, pen link, Teleporter, help, music. A chip under the power chip shows which.

**Enemy outline**
- **Thick, inky red outlines** on marked enemies: pushed out a fixed number of screen pixels (about 5 at
  1080p, pulsing slightly) so they read as boldly at 200 m as at 5 m. The old outline was a fattened
  ink shell in metres, which went hair-thin at range and barely changed at all on rovers and other
  merged models.

**Chimera Downs**
- **A proper racecourse look:** racing green and cream with brass, navy steel and a deep red (the pink
  funfair colours are gone), on the stands, the office, the gate, the gantry and the screens.
- **A bigger grandstand:** eleven tiers of individual seats (green and cream rows, red in the members'
  enclosure), aisle stairs with brass handrails, a glazed row of members' boxes, a trussed roof with a
  clock and pennants, and a lit concourse face with posters. **A second, open stand** across the
  course on the back straight.
- **The crowd** is drawn as outlined figures (bodies, heads, hair or hats, arms they throw up when it
  gets exciting) instead of flat coloured pegs, in both stands.
- **A concourse** behind the grandstand: food stalls with striped awnings (Moon Dogs, Crater Fries, He-3
  Fizz, Chimera Chow, Rock Candy, the Tote), picnic tables under umbrellas, festoon lights, and
  **racegoers wandering** it, the apron, the way in and behind the far stand.

**Handling**
- **Quantum Slipstream Vanes:** the turn in the air is unchanged, but a carve no longer adds forward speed
  (the turn replaces the sideways air push), and a hard carve bleeds a little speed, so you can still slow
  down and land where you meant to.

## 0.9.96 — 2026-10-10

**Faction stories: finales that change the Moon**
- SPACECOM, Vostok, Daedalus and Rustmoon get a fifth chapter, and its ending reshapes the Moon for good
  (after a "one week later" card, the changed places are rebuilt in-game, with no reload, you wake up at
  home, and a news bulletin explains what changed):
  - **SPACECOM, Dark Side Dawn:** storm Rustmoon Hold with SPACECOM backup and knock out its command pylon.
    The Hold becomes a ruin under a SPACECOM memorial, the other dens are resettled as Kepler towns, the
    camps empty out, and pirates stop spawning.
  - **Vostok, Iron Moon / Daedalus, Total Eclipse:** storm the rival HQ, silence its guns and hold the
    square. The rival's settlements fly your flag (its reputation, shops and clearance follow yours), its
    leader is gone, and you get its vehicle and weapon (Phase Skimmer and Rail Lance, or BTR-M and
    Scattergun).
  - **Rustmoon, Lawless Moon:** storm the ILMB with the clans. Its guns (and Farside's) are silent for good,
    it flies the clans' colours, and SPACECOM's outposts become Rustmoon's.
  - **Kepler, The Charter:** found **your own town** at the site you surveyed and named. It's a real
    settlement on the map with eight building plots round the **Moon Council** hall (see below).
  - **Meridian, The Spindle:** Meridian's rocket takes you to a 5.4 km asteroid rolling round the Moon. It's
    a real cylinder you can run all the way round (gravity points at its axis), cratered like the Moon (bowls,
    central-peak and terraced craters, bright rays, dark maria, ridged highlands and a winding rille). Cross it
    to the Quantum Core with an alien mothership hunting you, then hold the extraction pad: a raised launch pad
    with four ramps. The mothership hangs low enough to shoot, its gunship drones pace you off your flanks and
    shoot, its barrage is a stream of aimed bolts over a wide spray, and its sweeping beam paints its track on
    the rock first and leaves a scorch. The prize is the **Quantum
    Slipstream Vanes**: your skates keep a share of their handling in the air, with a shimmer of sparks,
    ribbons and a rising chime while you carve.
- Lasting changes mid-story too: Lights Out's charges blow open Farside, Twilight and Hertzsprung, which the
  clans take over as pirate dens. The Black Sun reactor stays standing at the Daedalus Forward Post.
- **Kepler, restructured:** one homestead, then a survey of three candidate sites (Shadow Crater, Sunlit Plain,
  High Ridge) where you pick the site and the town's name, then Founding Day, then the Charter.
- **Your town:** fill eight plots from the council hall's terminal:
  - Housing Domes and Market Hall (income into the town bank)
  - Clinic (redeploy point)
  - Greenhouse Farm (healing and income)
  - Motor Pool (a Mule; repairs your vehicles)
  - Militia Barracks (guns on any pirate within 400 m)
  - School (council members lean your way)
  - Radio Tower (charts 3 km; council sits twice as often)
  - Shuttle Pad (your home base)
- **The Moon Council:** call votes from your hall. Each member (SPACECOM, Vostok, Daedalus, Meridian, and
  Kepler, which is you) votes with you more readily the better its standing with you, and a majority carries the
  motion and reshapes the Moon:
  - **Ceasefire:** Vostok and Daedalus zones stand down; the APC, the Skimmer, their weapons and the Phase Dash
    go on sale.
  - **Open Skies:** the Interceptor and the Deflector Shield go on sale at the ILMB.
  - **Free Trade:** 10% off every shop; the Light-Bike and the Teleporter go on sale.
  - **Militia Pact:** more turrets in every Kepler town; the Mule goes on sale.
- **Meridian, restructured:**
  - Sensor Net.
  - **Flash Crash:** race a data spike from Shackleton to the Exchange through relay gates against the clock.
    It replaces the phase-field survival that doubled Daedalus's.
  - Handle With Care.
  - **Launch Window:** build the Meridian Launch Complex beside the Monolith and tune its resonance.
  - The Spindle.
- **Meridian upgrades:** Market Uplink (+10% contract pay per level) alongside the Gyro-Edges.
- **Kepler Twin Cradle** (replaces the Cargo Cradle, which did what the Dampers already do): carry two
  contracts at once. The second crate stacks on the first, and the HUD shows both contracts and both
  waypoints (the second in green). Pirates go for the bottom crate; when the first job ends, the second moves
  down.
- **Deflector Shield** now comes with SPACECOM's, Vostok's and Rustmoon's third chapters. It's invisible
  until it takes a hit, then a faceted field flashes round you and burns off on the side that was hit.
- **Rustmoon's black market** works through payloads now. A smuggling run into a bright-side town sometimes
  carries one (named on the job board): an upgrade, a weapon, tech or a vehicle. Deliver it and it's on sale
  at Rustmoon Hold for good, and it never comes up again. The stock covers the ILMB kit (plating, dampers,
  tuning kit, scanner), other factions' upgrades (Seeker, Flak Weave, Market Uplink, Twin Cradle), their
  weapons and tech, and hot-wired vehicles. Old saves keep what their smuggling count had unlocked.
- **Camera:** you can look almost straight up (the camera stays behind your shoulders and tilts).
- **Powers on Z:** Phase Dash, the Teleporter, the Hitch-Line Winch and the pen link all live on `Z` now.
  `Z` uses the selected one; the mouse wheel steps through them. A chip under the weapon readout shows the
  power, whether it's ready and which of yours it is (e.g. 2/3). `T` and `P` still work.
- **Kepler Hitch-Line Winch** (Kepler's new unique, ₵2,400): hold `Z` to fire a cable onto a vehicle within
  85 m: flying transits, freighters, land-trains, hover-cars, crawlers and rovers. It holds while you hold Z,
  up to 10 s. It's a real rope: slack until it's taut, then the pull goes both ways by mass. Under a transit
  you swing like a pendulum and keep the momentum when you let go; behind a rover or a land-train you trail
  along on your skates. How far things give depends on their weight: a hover-car drags 30 m or more off the
  road (staying at its hover height over the ground), a transit gives about 10 m, a land-train about 5. Each
  eases back onto its route when you let go. It hooks enemy rovers in a fight too (war-rigs, patrols, the
  bosses and Kade's truck), and SAT-7, which doesn't budge: you go round with it.
- **Livelier skies:** twelve transit routes instead of six, and transits and freighters spend less time
  parked.
- **The Spindle, round 2:** three drones at most, and a shot-down drone goes dark and drifts along powered
  down for 15 s before it reboots. Reaching the launch pad with the core starts the pod's countdown (you
  don't have to stay on the pad). The pad's ramps are solid wedges that run flush onto the deck. A HUD
  waypoint shows **The Package**, then the extraction pad. The mothership holds station over the rock at the
  far end instead of following you out past the tip.
- **Weapons:** the Scattergun reaches about twice as far and hits harder (7 x 17); the Junk Mortar's bomb
  flies faster.
- **The Spindle in the sky:** the long asteroid hangs over the Monolith, rolling slowly on its long axis.
- **Backup:** captures, the jammer chapter and the assaults bring allied cars and troopers in your
  faction's colours. They fight what you fight, and the enemy shoots back at them. Your shots pass them by.
- **Faction troops:** chapters field the right side's soldiers (SPACECOM whites, Vostok greys, Daedalus
  black-and-pink, Meridian security) in their own cars, with their own shot colours, instead of pirates.
- **New bosses:** the SPACECOM armoured convoy (a three-axle hauler that keeps to its route with two
  escorts), the Daedalus Warden (a hovering hex-hulled war machine that blinks sideways) and the Vostok Hammer
  (a tracked heavy with a dozer plate and a cannon). They replace the scaled-up pirate rig.
- **Less repetition:** Daedalus' Asset Denial plants a phase jammer you keep alive instead of holding
  ground; its Phase Trial is now flying through five calibration nodes before the field collapses; Vostok's
  Hold the Line brings the garrison in halfway through.
- **New props:** a SPACECOM relay mast, a Vostok field generator, a Kepler homestead generator, the Black Sun
  reactor, a phase jammer, demolition charges, Meridian sensor pylons, Kepler ballot stands, phase emitters
  and calibration nodes.
- **Founded outposts** are proper compounds: a hab dome (or a research block for the Vane Research Station)
  on a paved apron, with each module a real building (glass greenhouse, clinic cabin, beacon lattice tower,
  manned turret, market stall, garage quonset).

**Controls**
- **Phase Dash** no longer blinks you forward: it swings all your momentum (plus a kick) to wherever you're
  looking, pitch and all, for a mid-air turn, climb or dive. 4 s cooldown.
- **Hold V** (with more than one vehicle) opens a radial picker: move the mouse to a vehicle and release to
  call it. Rebuilding vehicles show their countdown. A tap still calls the last one you picked.

**Balance**
- Destroying a den while you ride with Rustmoon costs 5 reputation (was 15).
- Faction chapter credit rewards cut by about 40%. Every story now follows one unlock pattern:
  - first outfit on chapter 1, second outfit on the finale;
  - for the military factions, a weapon on chapter 2 and a vehicle on chapter 3;
  - upgrades in between.

**Playtest fixes and changes**
- **Rustmoon, properly outlaw:**
  - Swearing in turns every upright faction hostile: red zone walls round their towns, and their patrols
    shoot on sight.
  - Rustmoon jobs are their own thing with hazard pay. About a third are smuggling runs into bright-side
    towns, and each smuggle unlocks more black-market stock at Rustmoon Hold (weapons, tech, upgrades, and
    eventually the Interceptor, Skimmer and APC).
  - You can no longer swear in once the Hold is gone.
- **Cargo durability:** parcels take damage from knocks (fragile ones far more), with a "CAREFUL!" pop and the
  condition in the status line. Dampers and the Cradle upgrade soften it.
- **Deliveries** complete as soon as you're inside the settlement (most of its radius), not at the pad.
- **Story objectives:** sites pick the flattest nearby ground, away from crater edges and buildings. Hold
  and "get to the centre" radii are bigger. A progress meter (centre-low, in the faction's colour) fills while
  you plant, survey, collect or hold.
- **Boss health bars** (upper centre) for every named boss, and bosses are 1.25x bigger. Vostok's chapter 4
  ends when the Warden falls.
- **Kade's flak** is faster and leads you.
- **The mothership** gets ahead of you and mines where you're going. A destroyed weapon re-arms after 15 s.
  The asteroid is solid from every angle, and the camera no longer swings in through the rock.
- **The Spindle's launch rocket** is always at the Monolith for the final chapter, including after a skip.
- **Flash Crash gates** are just the two rings, on flat ground clear of rocks and craters.
- **Ground warnings** (meteors, mothership strikes) are painted onto the terrain.
- **Pirate squads** stay away while a chapter's objective is close. War-rigs ram one at a time and less
  often.
- **Allied cars** drive round walls when they're blocked or stuck.
- **Vehicles** are heavier in the air.
- **BOLT** talks less and lost his blue band.
- **Speed lines** are subtler.
- **Vostok/Daedalus bunkers** rebuilt symmetric, with the blast door facing out.
- **SAT-7's** rings are centred on the artifact.
- **Farside** has its own name on its sign.
- **The fallen ILMB** is dressed in clan scrap.
- **Smoother scarps:** the raised plateaus between Kepler and Meridian are smoother.
- **The Lawless Moon raid** opens with a big Rustmoon ambush and few reinforcements, while SPACECOM keeps
  rolling in.
- **Fixes:**
  - Your town is nudged clear of other settlements. It was able to land inside Kepler Civic Center and cut
    off the leader.
  - The cheat menu's chapter skip performs each step properly, and its story menu can launch you straight
    onto the Spindle.

**Trailer (recut, 1:17)**
- Everything from the casino onwards is now one quick "AND MORE." montage (about 15 s, down from 28),
  under a single held header and the casino track: casino, casino hall, ferris wheel, two quick
  pick-ups (rock crystal, mite), the reactor hatching a chimera (no lab exterior), and the run down
  the Fissure ramp toward the alien gate. The scoop, lab, "SHENANIGANS." and "SOMETHING IS DOWN
  THERE." cards are gone. The final render is `trailer-out/Moon-Runner-Trailer.mp4` (77.5 s).
- Hero shot: the runner pops off the crater lip and holds a straight line into the dark, then is
  hidden once they're a speck, so they never drift back into frame under the logo.
- Kade shot: his truck no longer stops dead on a boulder. In trailer mode only, boulders and big
  shaped rocks are kept off his stretch of the terminator (`planet.noBoulders`, plus `clearDirs`).
  Normal play is unchanged.

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
