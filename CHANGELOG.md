# Changelog

What changed in each release. Releases are built by `.github/workflows/release.yml` when a commit message
contains `[release]` (see the README's Download section). Newest first.

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
