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

**Landings:** hard landings hurt half as much as they used to (the cargo still takes the full jolt; prefab parts are far more fragile than contract cargo), and a landing
with plenty of speed along the ground is a glancing blow: at 30 m/s of glide it hurts half as much again. Past the terminator lies the **dark side**: almost
pitch black, lit only by your helmet lamp, and full of pirate dens.

## Download (desktop, no browser)

Grab the latest build from the repo's **Releases** page:
- **Windows:** `Moon-Runner-…-windows-portable.exe` — double-click to play (SmartScreen may warn because the
  build isn't code-signed: *More info → Run anyway*). Or the `win-x64.zip` — unzip, run `Moon-Runner.exe`.
- **Linux:** `…-linux-x86_64.AppImage` — `chmod +x`, then run it. (For the PlayStation gyro the pad's `/dev/hidraw*` node has to be readable: Steam's `steam-devices` udev rules do it, or add `KERNEL=="hidraw*", ATTRS{idVendor}=="054c", MODE="0660", TAG+="uaccess"` to a file in `/etc/udev/rules.d/`.)
- **macOS:** `…-mac-universal.zip` — unzip, right-click the app → Open (if it says "damaged", run
  `xattr -cr Moon-Runner.app` once; the build isn't notarized).

`F11` toggles fullscreen. Saves live in the app's own storage.

Release builds (`dist:*` and the workflow) are made with `vite build --mode release`, which leaves the dev tools (the F8 dev
menu, the cheat menus, the F3 debug overlay, the git menu, the Asset Row, `?trailer` and `window.game`) out of the bundle;
`npm run build:release` makes one and `npm run check:dev-strip` proves none of it is in there.

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

`src/trailer.js` plays the official ~77 s trailer live in the engine: 21 scripted shots (teleport, staging,
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
`ffmpeg -ss <start> -t 77.5 … -af loudnorm=I=-14:TP=-1.5:LRA=11`. Don't save source files mid-recording:
Vite's hot reload restarts the page.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look / aim |
| `W A S D` | Run in boots. On skates, `A`/`D` steer you along the ground: full input carves hard, `W`+`A` carves gently |
| `SPACE` (hold) | **Quantum-Lock Skates**: near-frictionless glide. Release to brake hard in boots |
| Right mouse (hold) | Thrusters: mostly forward, with only a little lift or dive (drains JET) |
| `SHIFT` | Mag-jump; in the air, press again and hold to **Dive** |
| `Q` + `W`/`S` (air) | Front / back flips |
| `Q` + `A`/`D` (air) | Spins |
| Left mouse | Fire the selected weapon (the Pulse Spinner homes slightly; its splash can disc-jump you) |
| `1` `2` `3` `4` | Switch weapon: Pulse Spinner, Vostok Scattergun, Daedalus Rail Lance, Rustmoon Junk Mortar |
| `C` | Wardrobe: cycle owned outfits, skate finishes and pulse-disc colours; `J` in the wardrobe shows or hides the containment jar |
| `N` | Music on / off |
| `V` (hold: radial) | Call / board / leave your faction vehicle; hold to pick one (story unlock) |
| `E` · mouse wheel | Use your selected **power** · step through your powers. Powers: Phase Dash, the Teleporter (`T` too), the Slipstream Vanes (steer in the air for 10 s), the Kepler Hitch-Line Winch (press again to let go) and the pen link (`P` too) |
| `Esc` → SETTINGS | Graphics, gameplay, camera, audio and key remapping |
| `P` | Holding pen, anywhere (needs the remote pen link from Dr. Zbornak) |
| `Shift`+`X` (hold) | Dump the jar anywhere: materials are destroyed, creatures pop back out |
| `G` / `X` (hold) | Scoop into your containment jar / hold to empty it (into the antimatter reactor when you're beside it) |
| `F` | Job board / upgrades (inside hubs and settlements; your town's board has a second tab, COUNCIL HALL: `Q` / `E`) |
| `M` | Globe map: drag to spin, scroll to zoom. Fog of war covers anywhere you haven't been (from your town's Radio Tower it is also where you send sweeps that chart the fog) |
| `J` | Reputation Log |
| `R` (hold 1.5 s) | Emergency recall (₵100): a shuttle flies you to your HQ (the ILMB, the HQ of the faction whose story you've committed to, or Rustmoon Hold if you ride with the pirates); fails everything you have running (your contracts, a live event, your story chapter) before the scene plays, with one list of what was failed (the hold bar warns you first) |

### Controller

Plug in any controller the browser (or the desktop app) sees as a standard gamepad: Xbox,
PlayStation or Switch Pro. Pick it up and it takes over; touch the mouse or keyboard and they take
back. Prompts show the pad's buttons while it's in use.

| Button | In play |
|---|---|
| Left stick · right stick | Move / steer / carve (analog) · look |
| `A` · `B` | Mag-jump / dive · tricks (hold in the air) |
| `X` · `Y` | Interact · vehicle |
| `LB` (hold) · `RB` | Quantum-Lock skates · power (press again to let go of the winch) |
| `LT` · `RT` | Thrusters (Rail Lance: scope) · fire |
| `L3` · `R3` | Thrusters · scoop into the jar |
| D-pad ← → · ↑ | Previous / next weapon · next power |
| D-pad ↓ (tap) · right stick · `A` / `B` | Open the radial menu (tap again to use the highlighted wedge, or to close it if none is picked): vehicles and powers (each opens its own wheel of the ones you own, with the same controls; the power you pick there, equipped with `A`, is the one `RB` uses; the equipped one has an orange edge), wardrobe, reputation log, empty jar · pick a wedge (it glows like the minimap: white in the light, purple on the dark side) · use it / cancel |
| `Circle` held + tilt the pad (PlayStation) | **Gyro:** how far you turn the pad since Circle went down acts like the left stick: pitch it forward / back and turn it like a steering wheel to move on the ground, or to flip and spin in the air. Settings → Gameplay: on / off, how far is a full push, flip either axis |
| `View` (tap · hold) · `Start` | Globe map · emergency recall · pause |

**Vibration:** while the pad is in use it rumbles (any pad whose browser exposes the rumble motors: Xbox, PlayStation and most others in Chrome, Edge and the desktop app): a tick off the ground, a thump on landing that grows with the impact, a hard knock for each hit you take and a long one when you go down, blasts by how close they are, a kick for each weapon (the Rail Lance and the APC's cannon heaviest), clean tricks and wipeouts, pickups and payouts, and a low hum from the skates (rising with speed), the thrusters, a rail under the skates and a vehicle's engine. Menus tick as the highlight moves. Settings → Gameplay: on / off and the strength (changing it gives a test buzz). It is silent on the keyboard, in a pause and while the tab is hidden.

**PlayStation pads (the PlayStation link):** the same WebHID link the gyro uses (the desktop app opens it by itself; in a browser press CONNECT under *PlayStation controller link* in Settings → Gameplay) also writes to the pad directly, which makes the rumble work over Bluetooth and in browsers that give a PlayStation pad no rumble of their own, and adds:
- **Lightbar and player lights** (DualSense and DualShock 4 lightbar; the five player lights are DualSense): the lightbar is your skates' colour, dim in menus and a pause, brighter in play, white-hot with the thrusters on, red when you are hit, and pulsing red when you are below 30% health; the player lights count your health in fifths. Settings → Gameplay: `Controller lightbar`.
- **Adaptive triggers** (DualSense; in play, pad in use): `RT` is the weapon's trigger, a click that gives way (the Rail Lance and the Scattergun heaviest), stiff again while it recharges, and the APC's cannon has one too; `LT` is a light spring for the thrusters, a buzz in the trigger while they burn (faster when the tank is nearly empty), a solid wall when they are locked out, and a half-pull scope with the Rail Lance. Settings → Gameplay: `Adaptive triggers`.
- *Controller feedback* in the same settings tab says how the pad is being driven (through the link, through the browser, or not at all) and has a TEST button: three kicks, the lightbar white and both triggers working for about a second and a half.

In menus, dialogs, the board, the wardrobe and the casino, the d-pad (or left stick) moves a
highlight, `A` presses, `B` backs out, `LB`/`RB` switch tabs and the right stick scrolls. Watching
a Derby race: `A` or `Y` switches camera, the right stick orbits. On the globe map the left
stick moves a cursor (rest it on a pin to read it), holding `RT` grabs the globe so the cursor drags
it round, holding `LB` / `RB` turns the map anticlockwise / clockwise, the right stick zooms, and `B` or
`View` closes it (from your town's Radio Tower, `A` sends a sweep from the cursor and `X` stops or resumes it). At the Plinko board the left stick (or d-pad) aims the chute, `A` or `RT` drops a
ball (hold either to keep them coming), `LB` / `RB` lower and raise the bet, and `B` stands up. At
the blackjack table `A` deals and hits, `X` stands, `Y` doubles, `R3` zooms in on the cards (`Z` on the keyboard), with the same `LB` / `RB` bet and
`B` to stand up. At the Duck Derby the left stick (or d-pad) picks a duck and `A` starts the race
(and sets up the next one), again with `LB` / `RB` for the bet and `B` to stand up. At the Zero-G claw the left stick flies the claw, `LB` / `RB` lower and raise it, holding `A` or `RT` keeps the beam on. The roulette
table uses the map's cursor: the left stick moves it, `A` or `RT` drops a chip on the number or bet
under it (or presses the button it's on), d-pad ← → change the chip size, `X` spins and `Y` clears.

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
supply drop…) at a safe staging point. Walk up and press F to begin. Going down, or taking the recall shuttle, during an event fails it.
New postings are spaced out (the first comes about 40 s in, then at least 45–75 s apart). The **distress log**
above the speed tracker lists every open signal, newest on top, each in its faction's colour with its distance and
an arrow showing which way it lies from where you're looking; the event you're running is highlighted.

**Style** pays half what it used to and can at most double a contract's base reward (a ₵400 job tops out at
₵800 before condition). The package's condition then scales the whole payout.

**Rail Lance scope:** with the Rail Lance equipped, hold right mouse to scope in (L3 on a pad still fires thrusters). The beam pierces
pirates, troops, buildings and traffic, but the ground and any rock (boulders, ramps, arches, spires, ridges) stop it, so nothing behind a rock is hit.

**First shift:** a new game offers to send **BOLT**, a courier-school drone, along with you. It hovers at your
shoulder and teaches the controls (each step waits until you've actually done it), chipping in as you ride: big
air, a landing that dings the parcel, top speed, grinds. Then it rides along for two pirate-free training runs:
the ILMB to the nearest Kepler town, then a cleared Vostok delivery from there, explaining the factions and how
restricted military zones work (their turrets open fire without clearance). After the second delivery it pays a
₵200 bonus and offers a free recovery shuttle back to the ILMB. You can skip it at the start.

- **Magnetic grip:** while the skates are touching the ground (or just left it), they pull you
  toward the surface. You hold contact over small bumps instead of skipping off, but a real
  ramp or crater rim still launches you. Tune `grip`, `gripWindow` and `gripRange` in `src/config.js`.
- **Tricks:** flips and spins score style points if you land upright. Buses, cars and freighters
  have solid decks: land on one and it carries you along, then launch off it. Land
  crooked and you **WIPE OUT**: you take damage, lose speed and the cargo gets jostled. Without
  an active contract, style pays out half its value in credits straight away. Big jumps get called out
  too: **SKY-HIGH!** once you've climbed 40 m above where the jump began, and **BIG AIR** (with the time)
  if you land after 5 s or more in the air; shorter hops still score their style points, quietly.
- **Job boards** are terminals: status screens (credits, standing, uplink), then a contracts screen and a gear
  screen. At the ILMB the board stands in the plaza as a kiosk of screens under a canopy. The board in your own town
  has a second tab, COUNCIL HALL (`Q` / `E`, `Tab` or `LB` / `RB`): the same page as the hall's terminal.
- **Skiing physics:** gravity pulls toward the Moon's centre and along the slope you're on. With the skates on, friction
  is almost zero and the cushion turns some extra downhill pull into speed, so diving into
  a crater and climbing out the other side *gains* momentum. Chain craters to go faster.
  Low lunar gravity gives long airtime. Landing hard in **boots** (skates off) hurts; the
  skates absorb almost any landing.
- **Speed tracker** (bottom-left) shows km/h, skate state, hull and jet energy.
- **Deliveries:** pick a contract at a job board. Each one has a cargo type, fragility,
  pirate risk, distance and time limit. Some start with a pickup somewhere else. You're paid
  for cargo integrity, time left and **style** (big air, speed milestones, recoveries).
- **Pirate war-rigs:** pirate rovers are big, fast, and grip the ground. They ram you hard (and wreck themselves on walls and buildings at speed: the same crash
  damage as the vehicles you drive; bosses and your backup excepted). Pirate skaters that hit the ground or a wall hard enough are hurt the way you are, and go limp in a ragdoll. Your
  Pulse Spinner homes in slightly to even the odds; the SPACECOM Seeker Module makes it home harder.
- **Moon Pirates:** "hot" cargo draws Scrapjaw pirates on skates and armed Moon-Rovers. If one
  stays close for about a second, they **steal the cargo** and run for Scrapjaw Gulch. Blast
  or ram them (on skates, above roughly 80 km/h) so they drop it, then grab it back before
  they get home. Roaming hunters are capped (at most 4 skaters and 2 rovers at once) and only chase within a
  **threat range** of about 700 m: outrun them and they give up and vanish ("LOST THEM!"), with a breather
  before the next squad. Thieves carrying your cargo and event raiders never give up.
- **Meteor showers:** rarely (the first after about 7–12 minutes, then every 15–25), a shower hits a big patch of open
  ground, never a settlement or outpost. The rocks are huge (7.5–17 m radius) and glide in slow and shallow, nearly sideways,
from about 280 m up, so you can see one coming for half a minute and plan a jump onto it. Only one at a time; the patch shows as a pulsing red zone on the globe map and
  the minimap while it lasts (about 2–3 minutes). Rocks only fall when you're near: each streaks in on the shower's slant
  with a red warning ring where it will land. They're real colliders on the way down: land on one and it flings you
  high (about 110 m of air) and away from it for a METEOR BOUNCE (style), so you can chain them: bounce again within
  14 s for a bigger METEOR CHAIN ×n. Landing on the same one again pogos you off it. Hit one from the side or below and it hurts. On impact they explode into tumbling chunks and leave a smouldering
  scorch mark; everything fades away afterwards. A landing kills whatever is under the rock (pirates, troops, patrol rovers, gun turrets, townsfolk, road traffic: nobody blames you for it)
  and batters what's near, less the further out, and flings runners and rovers clear. Bosses, lair cores and your backup are left alone.
- **Military zones:** Fort Meridian (Atlantic Accord) and Bastion Vostok-9 (Pan-Pacific
  Directorate) sit inside red striped walls. If you enter without a contract that grants
  clearance, you get a 4-second warning. After that, turrets and patrol rovers open fire,
  and after 9 seconds artillery starts landing on predicted positions marked by red rings.
- **The dark side:** your helmet lamp switches on by itself (and off again in the sun). Pirate squads hunt you even
  without cargo, and pirate dens and camps are guarded. They don't spawn while you're inside an allied
  settlement's zone (Farside, or Daedalus once you're in their good books) or riding a transit ship. Contracts that start or end there pay
  1.6× hazard pay. Twilight Waystation on the terminator is the last safe stop before the dark.
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
  Meridian Gyro-Edges (steering) and Market Uplink (pay), the Kepler Twin Cradle (carry two contracts at
  once, crates stacked; both waypoints on the HUD), Vostok Flak Weave (health, knockback), Daedalus
  Overcharger (fire rate) and Rustmoon Shadow Rig (harder to hit). Kepler also sells the **Hitch-Line Winch**: press `E` to fire a steel cable onto a vehicle or a structure within 120 m (the hook bites the nearest surface; whatever the reticle is on wins, else the target closest to it, and a faint tow-line marker shows what it will hook). The drum reels you in smoothly, easing to a stop with about 2 m of cable left, and the line holds for up to 20 s, without holding the key; press `E` again to let go sooner. The cable bends round the corners of structures in its way like a rope round pegs (boxes at their edges, cylinders and spheres along an arc, so a round tower is no obstacle; up to five structures at least 4 m across; slim columns and anything it can't bend round it passes through), and if the drum strains against something that won't give the pull builds to yank you free and, after about 2.5 s, the line slips loose. You can swing under flying transits or trailing behind rovers and land-trains (they're heavy; drag one off its route and it eases back on). Rustmoon's black market at the Hold
  stocks the ILMB kit and other factions' upgrades, weapons, tech and vehicles, each one brought in by a
  smuggling run that carries it as a payload (named on the job board).
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
  - **If you fail:** you're locked out of Rustmoon for good (going down or taking the recall shuttle mid-wreck counts as failing).

## Economy

Base pay is deliberately low and grows with reputation: ×0.8 at WARY up to ×2.4 at HONORED.
Contract clocks are tight. If you miss one, the job still pays 50% when you deliver.

## Faction stories

Every faction has a leader standing on a podium at their HQ: **Admiral Ada Okonkwo** (SPACECOM, ILMB),
**General Yuri Volkov** (Vostok), **Chairwoman Lucinda Vane** (Meridian), **Mayor Hettie "Gran" Pike**
(Kepler), **Director Ilsa Moreau** (Daedalus) and **Captain Kade** (Rustmoon, at Rustmoon
Hold once you're FRIENDLY with the pirates). Each offers a story, starting at FRIENDLY (10 rep); later
chapters need 15, 25, 35 and 45. **Finishing the first chapter of any story commits you to it**: the other
leaders stop dealing with you, so each playthrough tells one coherent story.

Big fights bring **backup**: allied cars and troopers in your faction's colours that fight what you fight.
Chapters field the right side's **troops** (SPACECOM, Vostok, Daedalus, Meridian or pirates), and three
faction **war machines** stand in as bosses: the SPACECOM armoured convoy, the Daedalus Warden (hovers,
blinks sideways) and the Vostok Hammer (rams, shells).

**Finales change the Moon for good** (a "one week later" card, then the changed places are rebuilt in-game and you wake up at home):
SPACECOM storms Rustmoon Hold and dismantles the clans (the Hold a ruin, the dens resettled as towns, no more
pirates); Vostok and Daedalus each storm the other's HQ and absorb it (flags, shops and clearance pass to the
winner; you get the loser's vehicle and weapon); Rustmoon storms the ILMB and the Moon goes lawless (SPACECOM's
guns silent, its outposts the clans'). Kepler founds **your own town** (a real settlement with eight plots
and the Moon Council's hall), and Meridian sends you to **the Spindle**, the long asteroid rolling overhead,
for its Quantum Core, with an alien mothership hunting you across it. The Spindle is a real cylinder: you can
run all the way round its girth (gravity points at its axis) on the way to the core at the far end. The prize
is the **Quantum Slipstream Vanes**, a power (pick it on the power wheel, then `E`): for 10 s your skates keep a
share of their handling in the air, so you can steer mid-flight (30 s from using them until they're ready again).

**Your town** (the Kepler finale) has eight plots and nine buildings to put on them, built from the council hall's terminal
or the COUNCIL HALL tab of the town's job board: Housing Domes and a Market Hall (income into the town bank); a Clinic
(a K.O. redeploys you there, unless you set a charted headquarters whose faction rates you at least neutral as your
respawn point); a Greenhouse Farm (heals you, pays, and gives a free sapling for your jar from its nursery bench every
5 minutes); a Motor Pool (its door lists your vehicles and rolls one out, and when raiders reach the town two Kepler
militia rovers roll out, at most every 10 minutes); a Militia Barracks (two guns, 400 m); Roads (a ring road round the
town and roads out to the settlements around it); a Radio Tower (charts 3 km of map, and from its world map you send
sweeps that chart the fog: a disc growing from the spot you pick at 25 m/s out to 2 km, in the background); and a
Shuttle Pad (a landing pad with a shuttle to the nearest settlement; the town becomes your home base).

**The Moon Council** (once you have your town): call votes from the hall's terminal or the COUNCIL HALL tab (every 8
minutes, 4 with the Radio Tower). Each member faction votes with you more readily the better its standing with you,
and the vote plays as a short cutscene in the council chamber (skip with `Space`, `Enter` or `A`) that fades to black
before the result is read out. A carried motion (a Vostok–Daedalus ceasefire, Open Skies, Free Trade, a Militia
Pact) reshapes the Moon and puts vehicles, weapons and tech on sale (the Pact: two more guns in every Kepler town and
the Kepler Militia Carrier).

- **Military (SPACECOM, Vostok, Daedalus):** clear ambushes, then **capture outposts** with your backup:
  kill the guards and hold the ground; the outpost flips to your faction and the territory border moves.
  Daedalus rewrites posts with a phase jammer instead. Captures unlock **vehicles**. Vostok and Daedalus
  fight each other (captures cost the rival rep). SPACECOM hunts down Kade, then storms his Hold.
- **Civilian (Kepler):** haul prefab parts (light bumps only dent them, a thruster-speed crash of about 140 km/h
  smashes them and you go back for more) to **found homesteads** you own. Survey three sites for your town (stay
  within 40 m of each point, the ground ring, for 3 s), and in the finale, **The Charter**, ride to every faction HQ
  but Rustmoon's (Kepler, the ILMB, Meridian Exchange, Bastion Vostok-9 and the Daedalus Citadel) for the Moon Council's
  votes: the story panel lists each HQ and the tally, and Gran's letter of introduction clears you through the
  Vostok and Daedalus gates (whatever you stand at with them, unless you're already FRIENDLY) until the Charter is signed. Each outpost terminal is an interactive page: a pixel-icon tile for every building (click one, or arrow
  to it, for what it does and a button to collect, patch up, travel or build; the number keys still work). It builds up
  to 6 modules on the six plots: Greenhouse (heals nearby), Clinic (you redeploy there after a K.O., unless you set a headquarters as your respawn point at your town's clinic), Beacon (charts
  1.5 km and links beacons for fast travel), Militia Turret (a manned gun on a tall stand that turns and fires from its
  own barrel at pirates within 300 m), Market (₵40/min to collect) and Garage (hauler vehicle); and a **Second Militia
  Turret** (₵900, needs the first) on a stand of its own by the gate, which is not one of the six plots. The
  Kepler chapter *Raiders at the Gate* gives a free Militia Turret at Pike's Hope: the second one if the first is
  already built, or its price in credits if both are.
- **Research (Meridian, plus Daedalus):** plant sensor relays, survive **phase-field experiments**
  (anomalies strike where the warning rings appear), carry unstable antimatter without cracking it, and
  build a research station. Rewards are **tech**: Phase Dash (`E`, swings all your momentum, plus a kick, to where you
  look, leaving a trail of violet ghost copies of you along the way) and a Personal Teleporter (`T`, any discovered location or your outposts). The **Deflector Shield**
  (an invisible field that absorbs a hit every 12 s, and shows itself when it does) comes with SPACECOM's,
  Vostok's and Rustmoon's third chapters.
- **Rustmoon (Kade):** take a SPACECOM depot, crack an armoured convoy, blow up three SPACECOM outposts
  (rebuilt as yours), run a Meridian vault cube home while every gun on the Moon chases you, then storm the
  ILMB.
- **Vehicles** (`V` calls the crane drop, boards and leaves; hold `V` for a radial picker if you own more
  than one; W/S drive, A/D steer, Shift hops, you can still shoot): SPACECOM Lunar Interceptor (fast), Vostok BTR-M APC (slow tank: its turret swings to follow your camera and the barrel elevates with it; left mouse / `RT` fires the 30 mm cannon instead of your own weapons), Daedalus Phase Skimmer (hover,
  drifts), Kepler Homestead Mule, Kepler Militia Carrier (the Militia Pact's armoured hauler: the APC's hull and turret cannon in militia paint, with the Mule's padded bay), Meridian Courier Light-Bike (a sleek light-bike you ride tucked low, leaving a
  glowing trail that fades over a second), Rustmoon Scrapjaw War-Rig. They hug the ground at speed: the wheeled
  ones have real downforce and tyres that bite sideways, and only a proper ramp throws one clear. Ramming pirates
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
you (a shove of up to 20 m/s away from the burst, less with a Flak Weave, plus bleeding your speed and pulling you down)
rather than blasting you clear; each burst leaves a
cloud of white-hot phosphor embers that hangs and drifts for a moment before burning out. Wreck the truck for a
₵800 bounty; the first time, his **Rustmoon Junk Mortar** tumbles out in a green-beamed crate (it's also
yours if you swear in with Rustmoon). Lose him by getting 1.5 km away. Not while you ride with Rustmoon.

## Secrets (spoilers)

- **SAT-7 "Lantern"** circles the whole Moon on an inclined orbit (~200 km/h), starting each session on the far side from the ILMB. It's a big gold-foil satellite with a landing deck (hazard border, a glowing ring to aim for) and blinking lights that catch your eye: red and green wingtip strobes, amber deck beacons and a white strobe on its mast. Most of the lap it's 200–300 m
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

A walk-in hall about 1 km from the ILMB, with a ring road round its grounds like a town's: plum lacquer and gold, a cross-shaped
building (the Crater Cross) under a ribbed dome. Out front, two slot carousels (seven cabinets
round a glowing pillar under a bulb-lit canopy) flank the red carpet, and punters wander from game to game (by a way round everything that stands in the way, through the doors when the next game is inside): playing the slots
(yanking the handle while the cabinet lights up), gawping at the giant die and the roulette wheel in the pocket courts either side of
the foyer, admiring the chip towers, chatting by the doors. Walk through the grand doors into the foyer (the prize counter), on to the crossing (the Chip Bar under its halo, on a compass-star inlay) and press `F` at a station
(Esc stands you back up). The Plinko stands at the end of the north arm, the Duck Derby fills the east wing, and the west wing
holds the claw, the classic slots and the blackjack table:
- **Blackjack table:** real 3D cards from a 6-deck shoe, dealer stands on 17, blackjack pays 3:2.
  ←/→ bet, Space deal, H hit, S stand, D double.
- **Duck Derby:** pick one of four ducks at the bookmaker's kiosk (1–4), bet, Space to race. Odds are fair-minus-5%,
  computed from the same race model; surges, stumbles, photo finishes. The track is a gilded regatta basin with lane floats, a brass start gate whose three
  lamps count the start down, a finish arch with a photo-finish camera, a theatre-bulb odds board, a velvet-roped brass rail; the four racers
  are QUACKERS (jockey cap and medal), SIR WADDLES (top hat, monocle, moustache), DUCKTOR WHO (fez, bow tie, specs) and MOONBILL (bubble helmet).
- **Zero-G Claw (₵200 a round):** a 16 m glass tank on the front wall, left of the doors and facing the Duck Derby, full of things floating in zero gravity: crates, fuel
  canisters, cogs, girders, tyres, hull plates, gems, magnets, mines, lockboxes, a salvaged engine and a credits case. Fly the claw in all three directions (WASD,
  left click down, right click up), hold Space for the beam to pull things to its tip (it carries three units of weight), and let go over the drop hole in the floor to bank
  them. Things interact: some come **chained** in pairs or strings, a **magnet** clumps up the steel (cogs, girders, hull plates, mines, lockboxes) and carries it, a hit
  **mine** goes off and sets the fuel canisters round it off, a **lockbox** pops open when blasted (the lucky chip, the jackpot, is in one of them). Banks within five seconds build a x1.25-a-step combo, three of a kind banked in a row pay a set bonus, a mine in the drop hole costs you, and an
  overheated beam or a mine close by stuns the claw. Every round the old tank is flushed out through the roof jets and a **new one is dealt**: a different mix, a different
  layout, a different hiding place for the chip and one of four moods (calm, thick air, storm, gravity surges).
- **Plinko:** a real-physics board (12 rows, 13 slots from 0.2× to 50×, ~94-97 % return). Aim with A/D or the
  mouse, Space or click to drop; hold Space for a stream of balls.
- The **Classic Games** cabinets open the slots / roulette / prize wheel / high-low overlay (blackjack now
  lives only at the 3D table); the **prize counter** (Lucky Chips cosmetics) in the foyer is its own screen, with no
  game tabs, and the cabinets' overlay has no prize tab. VIP tiers still raise max bets.

## Territory

No spot on the Moon is unclaimed. Territory is a weighted split around every faction's settlements and
~120 smaller outposts (watchtowers, supply depots, farm domes, relay masts, trading kiosks, scrap shacks).
A chip under the minimap shows whose land you're on (and the settlement you're in),
flashing in the owner's colour whenever that text changes, and the globe map is
tinted by owner. The purple line on the globe map is the terminator, the edge of the dark side (point at it
for details); SAT-7's orbit is the green dashes, with chevrons showing which way it's heading. Military patrols drive between their faction's outposts and shoot pirates (never you, so
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
with their main thrusters pulsing, slow down and land on a pad at the edge of each settlement. A **landing pad** is a round deck 3 m up on
a closed base of ribbed panels that nothing can get in under (14.3 m across the radius for a shuttle-bus, so its ramp comes down on the deck, 21 m for a freighter), with a hazard band round its
edge, a lamp-lit safety railing all the way round, and one flight of stairs down to the ground with handrails both sides; the
waiting shelter stands beside the stairs' foot, and the passengers walk round the ship to the stairs and down them. On a slope the deck still
stands 3 m over the highest ground under it, and its stairs come down on the uphill side. The landing legs fold
out of their bays (doors first, then the legs) on the way down and tuck away again after take-off; the shuttle-bus's
rear door drops into a ramp, the freighter lowers a belly ramp. The **shuttle-bus** is a 19 m lifting-body hopper
with a wraparound windscreen, porthole windows, two ducted lift-fans and a lit route board on the roof; the
**freighter** ("Atlas") is a ~70 m armoured hauler with a rideable landing deck (a big pad, kerb lights, tie-down rails), a raked bridge tower at the bow,
a gantry cage round four cargo bays down each flank, each two crates high, holding the land-train's own cargo (the corrugated container, the Helium-3 tanker
in an ISO frame so it stacks like a box, and the explosives magazine, in the livery of a faction whose town the freighter serves), short radiator wings and a four-bell engine block.
**Hitch a ride for free:** walk up to a landed shuttle-bus or freighter and press `F` to hop in (the prompt says where
it's headed). You ride inside while the camera hangs back to watch the ship; press `F` again to hop out down the ramp,
or bail out mid-flight through the side hatch (keeping the ship's speed, with a little style for the nerve). Passengers walk off toward town, the queue
at the shelter walks up and boards, and the doors close before it leaves; arriving passengers walk to real
building entrances. Safe settlements are joined by a network of 13 pre-driven **roads** (laid by a route search over the real terrain, `roadplan.js`: round craters and their rims, rocky ridges and rilles, along the gentlest slopes; an 18 m track cut into the
regolith: a scraped, rutted bed between two smooth berms of pushed-up dust, with delineator posts, wide enough for two
land-trains to pass) that merge into a big **ring road** around each town (your own gets its ring road, and its roads out, when you build Roads), with one stop shelter on the ring. Big six-wheeled **land-trains**,
hover-cars and buggies each pick a destination town: some pass straight through towns, others stop to
swap passengers and then head somewhere new. There are two land-train services, each painted for the faction whose
towns it joins (SpaceCom white and yellow, Vostok slate and red, Kepler orange and cream, Meridian cyan and cream, each with the
faction's emblem and name on the flanks): the **Moonliner**, a streamlined passenger express pulling three capsule coaches
(the only one that picks up and sets down passengers), and the **Prospector**, a dozer-bladed freight rig pulling a cryogenic
**Helium-3** tanker, a cargo container and an **explosives** magazine (hazard bands, placards, NFPA diamond and DANGER signs).
A road of its own, 2.4 km out from the Helium-3 Exchange into the red zone round Bastion Vostok-9, carries the Vostok Moonliner and Prospector, which run only there. You can ride on a freighter deck or a land-train trailer.

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

Outposts you found for a faction story sit on flattened ground: a hab dome with an airlock (or a research
block with a dish and an observatory for a lab), a paved apron, the terminal at the end of the path, and six
plots round it. Each module is a proper building: a glass greenhouse with planting rows, a clinic cabin, a
beacon lattice tower, a manned turret on an 8 m armoured stand (ladder, railed deck, sandbags round the foot, so its
guns clear the hub dome), a market stall and a garage quonset. A seventh stand beside the gate holds the second turret.

## Defences

Walled settlements (the ILMB and the military fortresses) mount their guns on bastions built into the walls and
on the gate towers, so they cover both the approaches and the inside with almost no blind spots. Unwalled
settlements raise their guns on pylons. Guns hold fire when a building or the terrain is in the way.

## The International Moon Base

The central dome is joined by wide glass skywalks, with people walking inside, to six distinct buildings:
Hydroponics (glass greenhouse dome), Meridian Labs (leaning observation tower), Vostok Hangar (a ribbed quonset
with a parked shuttle, round to bump into), Daedalus Relay (big rotating dish and mast, three roof dishes), the Power Block (cooling towers) and the Kepler Habitat (a big ring on A-frame legs, high enough to
skate under, with a park inside and a hub tower in the middle).

## Main menu & saves

**Music** is all synthesised live. Roaming has a speed-driven synthwave groove whose layers build as you go faster;
the Lucky Crater Casino plays a swung, jazzy lounge track; Chimera Downs a space-western (galloping rhythm, twangy
guitar, a lonesome whistle); Dr. Zbornak's lab, and the Monolith, something clinical and slightly wrong (whole-tone
pings, bubbling glassware, a theremin); and the dark side an aggressive darksynth. Tracks crossfade as you move between them.

The title screen slowly circles one sunlit place after another (the ILMB, Meridian, Kepler, the casino and
more) to its own faster, brighter synthwave track (it starts with your first key or click).

The game opens on a main menu: CONTINUE, NEW GAME, LOAD GAME, SETTINGS (and QUIT in the desktop app). There
are three save slots, each showing credits, deliveries, story faction, play time and last played; slots can
be deleted (with a confirm). Progress is saved to the active slot every few seconds and on every delivery,
purchase and K.O. Settings are shared by all slots. The pause menu has SETTINGS, HELP (the controls list, which is only reachable from here; `Esc` or `B` goes back to the pause card) and QUIT TO MAIN MENU. Pausing (and the map,
dialogs, job board and wardrobe) freezes the whole world: traffic, the satellite, particles and timers.

## Settings

`Esc` → SETTINGS (or the button on the title screen). Graphics: render scale, FOV, view distance, terrain
detail, shadows and their resolution, halftone, speed lines, ink strength, particles, screen shake, damage
flash, frame cap. Gameplay: mouse sensitivity, invert Y, camera distance/height/shoulder/smoothing, tips, minimap, HUD scale, km/h or m/s. Audio: a
mute switch for everything, then master, music and effects volume. Controls: remap every action key (taking a key that's in use swaps the two).

## Cheat menu (testing)

Hold `=` and `` ` `` (backtick) together during play (deliberately awkward so players don't stumble into it). Options: +₵10,000 · reveal the whole map · set reputation per faction
(±10, FRIENDLY / TRUSTED / HONORED / NEUTRAL / HOSTILE, or all factions HONORED) · teleport to any location ·
god mode · unlock all gear, weapons and cosmetics · lab kit (big jar, items, 3 chimeras) · and under MORE: join
Rustmoon, spawn a pirate squad or the Mega Mite, spawn an event for any faction (and teleport to it), max out
the unlock counters, toggle any splice-pod mutation (with a reset), or reset all progress. Number keys pick, Esc closes.

### The Asset Row (dev builds only)

Dev menu (`F8`) → **Full cheat menu** → **Teleport** → option 1, **ASSET ROW**: a flat showroom with every asset in the game
lined up side by side, 227 of them in 26 sections (the runner and its gear, people, creatures, props and markers,
weapons and effects, rocks and nature, the secrets and the Spindle's props, ground vehicles and ships, outposts intact and
wrecked, the building parts the settlements are made of, the hometown, Chimera Downs' kits, and all the places). The small ones stand in the
yellow lane (z = 0), the places over 100 m across in the cyan lane 460 m over; the whole row is about 9 km, so the dev
speed multiplier helps. There is a terminal by the plaza and at the start of every section (a dark console under a tall light column): stand by one, press `F`, and jump to the start of any other section instead of walking. Each item has a name board and is built when you come near and let go of when you walk off, so the
row costs nothing to keep. You cannot be hurt there, the Moon (its story, missions and events) waits frozen, and nothing you
do there is saved. The shaped rocks work as on the Moon: skate onto a snake rock's tip and you grind its crest. Leave through the same menu entry (it reads LEAVE ASSET ROW), any teleport, or quit to the menu: you land
back where you were. It is not a place on the Moon, is in no save, and a release build has none of it. The catalogue is in
`src/assetRowItems/` (the item format is at the top of its `index.js`); to add an asset, add an item to the matching file.

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
  outfits, skates and lasers (and a JAR ON / OFF button in the preview's corner, once you own a containment jar); hover any item (even a locked one) to try it on, click or Enter to wear it.
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
- **Chimeras (the Horsey-Game part):** put **two or more different kinds of living thing** in the reactor together
  (people, Void-Touched people, wild **Moon Mites**, knocked-out **pirates**, whole **hover-cars**) and out
  comes a chimera, which climbs out of the reactor tube, leaps clear and lands beside you before its
  result card shows (two of one kind come back out: that's a pair, not a chimera). Body, legs and head are each drawn at random
  from the parents (the order they went in counts for nothing; the three always come from at least two of them: car wheels, six
  mite legs, pirate boots…), sometimes with a spare head, plus mutations from anything non-living in the mix (black water
  → void aura "the Unholy", rock → crystal spikes, dirt/mud → mud blobs). Each gets a mashed-up name,
  racing stats, a **growth** (one or two stats train 5–15 % faster), a **running style** (Front Runner, Pace Chaser or
  Late Surger) and a chaos rating. Chimeras are drawn at 0.72 of their old size (a field of six fits the gate). Wheel and tread legs sit on a chassis base, so they never
  hang off thin air. Up to three follow you; any number more live in the **holding pen** in
  front of the lab. Use the pen terminal (or `P` anywhere once you buy Dr. Zbornak's ₵1200 remote pen link) to
  call chimeras out, send them back, or release them for good. Retired racers wear a RETIRED tag in the pen and can be
  **sold** to the Lunar Stud Farm for what their record is worth. Chimeras are saved.
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
- **Chimera Downs** (the racecourse): a dirt oval with a six-stall starting gate under a 14-tier roofed grandstand (suites, end towers,
  a clubhouse with a clock tower and six betting windows behind it) and a smaller far stand, joined round the two turns
  by colonnaded arcades with twenty concession stalls and a gate hall each; a **screen drum** in the middle of the
  infield with live standings (one 40 × 20 m face for each stand, a tall one for each arcade), three sets of **winners'
  podiums** (the first three home stand on their steps behind the result, and the camera swings round to them), a finish
  arch, a photo-finish tower, distance poles, a parade ring, a weighing room, a stable yard, a grand forecourt with a
  fountain, and a fairground annex with the ferris wheel and carousel (rideable: `F`). In the Gold Gleam / Saddle Brown /
  Black / Money / Barn Red / Touch of Mint palette. The **race office** window (`F`, under the clubhouse's portico) keeps
  **one race posted in each of three sections**: **EASY** (grades C and B only), **MEDIUM** (up to A) and **HARD** (anyone),
  each with its own **distance** (450 m sprints, miles, 2–2.8 km medium and 3–3.6 km long races), **going** (FAST, DUSTY,
  HEAVY: tiring, LOW-G: more bad moments), purse (60/25/15 % to the top three), entry fee and a field of five rivals
  ("Glue Factory Escapee", "Hoof Hearted"…), trained to the section's strength and knowing its share of skills. The card
  shows each rival's grade and skill count; after you pick your runner, a **scouting** screen shows every runner's full card.
  **No odds:** enter alone or with a ₵50/200/500 bet, and a win pays the section's flat multiple (2.5×, 3.5×, 5×).
  Every chimera has four stats (1–100) and a C/B/A/S grade, set by its parts and its training:
  **SPEED** (top speed: wheels, void, crystal), **POWER** (acceleration, moving across the track and getting a pass done:
  mite legs, turbo, spark), **STAMINA** (the tank: pushing and passing burn it, and what is left becomes the final sprint;
  it decides the long races: roots, treads, armour, mud) and **WIT** (skills firing, judging the sprint, and dodging
  **Late Starts**, **Spot Struggles** and **Rushed** spells: alien and person heads, lenses, radios).
  **The race:** six runners break from the gate and fight for the inner rail (shorter round the bends), cruise at their
  style's pace, draft behind each other, get boxed in and pass (a slower chimera can pass a faster one that is cruising
  or tired, if it has the POWER to get by and the stamina to spend), and kick for home on what is left in the tank.
  **Skills** (ten, learned now and then from a win): four passive distance skills, Gate Burst, Rail Hugger, Slipstream,
  Second Wind, Home Stretch and the rare **Chimera Soul**; each fires on a wit roll, once a race.
  **Careers:** three seasons of three races and a tournament (the **Regolith Guineas**, the **Lunar Derby**, the **Dark
  Side St. Leger**: TOURNAMENTS at the window), then retirement; win all three for the **Triple Crown** and the **Hall of
  Fame**. Every race banks a training session for the **Training Yard** (the trainer in the stable lane behind the far
  stand): Sprints, Hill Pulls, Long Laps or the Maze Run. The numbers: `docs/chimera-racing.md`.
  **While your chimera races, the camera locks onto it:** `1`–`5` (or `C`) switch between chase, infield rail,
  leader, grandstand and blimp cameras, and the mouse orbits the chase cam.
- **The Monolith:** touch it (90 s cooldown) and it casts one of three spells, never the same twice running: **Time Dilation** (20 s with pirates, their shots, traffic and meteors at 40 % speed while you keep full speed), **Echo Followers** (one or two holograms of you that retrace your every move a moment late, mid-air jumps and all, for up to ten minutes or until one takes a shot for you; anyone shooting at you picks one of you at random) or **Teleport** (a random spot on the Moon, on flat safe ground away from settlements and lakes, where you land at a standstill one time in four and otherwise running at a random 1–300 km/h; you keep your health and fuel, and a launch comes with a few seconds of Soft Landing so the arrival can't wipe you out).

## Locations

| Location | Type | Notes |
| --- | --- | --- |
| International Moon Base (ILMB) | SPACECOM HQ | Fortress walls, turrets, artillery, embassies, job board, repair bay, launch pad |
| Meridian Exchange · Shackleton Radar Array · Helium-3 Exchange | Meridian | Trade hub (a gate arch and a lamp-lined avenue down to the plaza fountain (the casino's, with a glowing dollar sign turning on top) and the portico of the trading tower with its live price ticker, the lab dome and a sawtooth trade hall facing each other across the avenue, a motor-pool garage in its own compound (fuel yard, rover park, parts store) with its own service road, a container gantry and tower cranes at work behind the tower), radar research (four big dishes that turn and nod, each on a Blender-built station: a cryo receiver, a Helium-3 tanker stood on end, or a gantry station, a lattice mast over container control rooms; plus an observatory with a turning cupola), and a working strip-mine (bucket-wheel excavator, ore conveyor, pumping derrick, Horton-sphere tank farm) |
| Kepler Civic Center · Tranquility Commons · Aldrin Heights · Twilight Waystation · Hertzsprung Refuge | Kepler | Towns, safe rest and repair |
| Farside Listening Post | SPACECOM (dark side) | Hazard-pay destination: the same four-dish array in SPACECOM paint, the two station designs swapped round |
| Bastion Vostok-9 · Vostok-4 Outpost | Vostok | Restricted zones: turrets, patrols, artillery |
| Daedalus Citadel · Daedalus Forward Post | Daedalus (dark side) | Restricted zones: turrets, patrols, artillery |
| Rustmoon Hold · Scrapjaw Gulch · Blackrock Den · Gloom Harbor + scattered camps | Rustmoon (dark side) | Stolen cargo is fenced at the nearest working den |
| Chimera Downs | Racecourse | Grandstand and clubhouse, screen drum, podiums, arcades with stalls, stables, fairground; the race card and tote windows; chimera racing and betting |

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
  shadow, radial **speed lines** that scale with velocity, damage and alert vignettes, and a fade to black (the council chamber's cutscene)
- Shattered crater rims: a band of broken regolith along the peak of every grindable lip (an uneven rocky core breaking up into patches, a scuffed halo, dark pebbles and bright chips of fresh rock that fade out with distance), worked out per pixel from the ~64 nearest craters so it never follows the terrain triangles. The rocky band and the grind rail come from the same measurement (planet.rimOf): only firm lips get either. Overlapping craters share one outline round the whole cluster (a crater on the floor of one at least twice its size keeps its own); the giants (over 120 m) get neither. The terrain's toon ramp has soft steps, so lighting bands don't saw-tooth round steep walls
- Onomatopoeia pop-ups (WHOOSH!, KRAK!, KA-BOOM!, YOINK!): at most two on screen at once and never on top of each other; any more queue behind them, and each plays its full run time once it starts

## Code map

```
src/
  main.js        game loop, camera, state, explosions, job board flow
  config.js      world size and physics tuning
  planet.js      spherical moon: cube-sphere heightfield, craters, LOD chunk streaming, exact surface queries
  boulders.js    the boulders' lumpy shapes (six, shared by every chunk), their ink shell, and the collider constant that fits a sphere to them
  moonSkins.js   experiment: three candidate ground textures (regolith, etching, survey) as terrain shader chunks, and regolith's matching look for the rocks (`patchRockMaterial`), the hab domes' berms (`patchBermMaterial`) and the crater rims (`skRim`); off unless `?moonskin=1|2|3` or the Regolith ground texture setting (dev builds); the Ground detail setting sets its quality
  geo.js         sun/dark-side frame, great-circle and local-frame helpers
  reputation.js  faction standing, tiers, unlocks, Rustmoon state
  events.js      per-faction events, fluid sloshing, escorts, the Pirate Wreck
  mapview.js     draggable fog-of-war globe map (also where the Radio Tower's sweeps are sent from)
  alchemy.js     containment jar, reactor recipes, wild mites, followers, splice-pod mutations, Mega Mite
  chimera.js     procedural chimera models (drawn at 0.72 of their gene size)
  chimerabuild.js the chimera builder (not in the game yet: docs/chimera-builder/): fuses legs, body and head from the kit or from the game's own NPCs, shades the hides into each other at the joints, and fits the mutations to what they grow on
  chimeragenes.js splicing: the gene sheet from the reactor's parents (body, legs and head drawn at random, two kinds at least), no three.js
  cheats.js      testing menu (backtick)
  devoverlay.js  dev overlay (F3): every on-screen dev readout in one panel (frame times, CPU / GPU graphs, CPU time by stage, draw calls, world counts, pirate spawns, AI paths, input monitor); perfgraph.js has its graphs
  freecam.js     dev free cam (Dev menu → Debug overlay → FREE CAM): the camera flies on its own (mouse, WASD, wheel for speed) while the runner stands still and the game runs on
  story.js       faction leaders, chapters, outposts you found, tech, Captain Kade
  storyAssets.js faction troops, boss war machines, mission props, founded-outpost compounds
  hometown.js    your town (Kepler finale): its plots and buildings, the Moon Council and its votes
  chamber.js     the Moon Council chamber (a self-contained cutscene set) and the vote cutscene played in it
  respawn.js     where a K.O. puts you: the headquarters you set at your town's clinic, else your nearest clinic, else home
  radio.js       the Radio Tower's sweep: a disc of map that grows from the spot you pick (ws.town.radio)
  terminalUI.js  the tiled terminal page (icon tiles and a detail screen; spec in, HTML out) of the outposts, the town's hall and the job board's COUNCIL HALL tab
  spindle.js     the Spindle (Meridian finale): the asteroid world, its sky, the mothership
  medevac.js     the Spindle's K.O. cutscene: a recovery craft, two medics and a stretcher carry you off the rock
  worldstate.js  what the story finales changed for good, applied before the world is built
  kade.js        Captain Kade's gun truck: orbit driving, gatling and flak turret, Junk Mortar drop
  monolith.js    the Monolith's spells: time dilation, echo followers, teleport
  territory.js   faction territory, small outposts, patrols
  vehicles.js    drivable faction vehicles
  settings.js    settings menu + key remapping
  casino.js      Lucky Crater Casino games, VIP, prizes (casinoWorld.js: the building; casinoPlan.js: the plan's numbers and outline, no three.js, which tools/casino-layouts.mjs checks)
  clawSim.js     the Zero-G claw's rules and physics (no three.js: tools/check-claw.mjs plays it with bots to tune the payout against the entry); clawView.js draws it (instanced things, the claw, the beam, chains, blasts, shuffle jets); clawGame.js is the seated game (camera, keys, action bar, sounds, the marquee and screen)
  fountainFx.js  the plaza fountain's water: ripple, curtain and jet shaders on the casino.glb water pivots, sharing one clock
  pixelIcons.js  the classic-games overlay's pixel-art sprites (slot symbols, the pit boss, chips, cards' suits…) as plain rows of palette letters
  cosmetics.js   outfits, skate finishes, laser colours, wardrobe
  race.js        Chimera Downs: the race card's EASY / MEDIUM / HARD sections and the tournaments, scouting and betting, the live race (the six-stall gate, the locked camera, the event pop-ups), the screens, the crowd, the podium finish, careers, the Training Yard, the Hall of Fame
  downsPlan.js   Chimera Downs' plan: the oval, the stands, the arcades and their stalls, the forecourt, the drum, the podiums, the annex (no three.js)
  downsWorld.js  Chimera Downs' scenery, built from the Blender kits (the Downs kit baked into one settlement kit)
  downsKit.js    what the Downs builders share: the palette, text widths, `bake` (a Blender kit part into a settlement kit), `fountain` (the forecourt's, with the casino's water shaders and a turning derby cup), `arcadeShell` (the parts of an arcade that run on from bay to bay, one seamless piece per run, with `sheet` and `inkShell` for a solid of joined polygons and its outline)
  curve.js       a `curved` place's bend: flat local coordinates onto the sphere (point, frame, geometry cut into short pieces); the Downs plateau is a cap of the Moon, not a plane, so nothing on it leans
  downsFair.js   the fairground's ferris wheel and carousel, from the Blender fair kit, with their rideable seats; `queue`, the annex's queue lines (post and rope, the last post without)
  rides.js       hop-in rides: free transit-ship rides, and the fairground's ferris wheel and carousel at Chimera Downs (built by `downsFair.js`; `F` beside one pops you into the nearest gondola or onto the nearest horse)
  rocks.js       shaped rocks (ramps, arches, hoodoos, snake rails) and their colliders
  rails.js       grinding the snake rocks' crests and crater rims (the Asset Row's flat world has rails too)
  meteors.js     meteor showers: the warning zone, falling rocks (colliders), chunks and scorch marks
  chimerastats.js chimera racing stats, growth, running styles, careers and training, and the race model (the rail, drafting, blocking, passing, pushing on stamina, the final sprint, the three bad moments); no three.js (docs/chimera-racing.md)
  chimeraskills.js the ten racing skills, their wit rolls, and the roll that teaches one after a win
  physics.js     collider hash + shared skater movement model (player and pirate skaters)
  player.js      input → movement, weapon, animation, style events
  idles.js       the courier's standing idles (the breath and four occasional ones), played over the rest pose
  enemies.js     pirates (skaters/rovers), military bases, turrets, artillery, theft/recovery
  missions.js    contract generation, pickup/delivery, integrity, payouts
  world.js       sky, settlement layout, colliders, ambient life
  settlements.js detailed settlements, HQs and landmarks built with the outpost kit (moving parts)
  market.js      the Meridian Exchange's stocks: a random-walk market refreshed every 15 s, read by the tower's ticker
  traffic.js     landing pads, ship/bus flights and passengers, roads, land-trains, cars, buggies
  landingPad.js  the landing pad itself (deck on its closed base, railing, stairs, colliders and the walkers' waypoints), for every size and slope
  roadplan.js    where a road runs: a least-cost search over the terrain (slope, craters, rims, rock, rilles) between two town gates
  wardrobe.js    wardrobe screen with live 3D preview
  trailer.js     trailer director mode (?trailer): the official trailer, shot by shot, from live gameplay
  models.js      stylised characters and vehicles from primitives; loads the Blender runner and ships
  post.js        comic post-processing shader
  fx.js, hud.js, audio.js, input.js, toon.js, locations.js, rng.js
  assets/runner.glb  the Moon-runner model (player, pirate skaters, story leaders)
  assets/idles.json  the runner's five idle animations (10 poses a second per pivot, keyed in Blender)
  assets/ships.glb   the shuttle-bus (with a route board that names its destination) and freighter, with folding gear, ramps and thruster flames
  assets/skimmer.glb the Daedalus Phase Skimmer (hover-racer with spinning phase coils); assets/skimmer_a.glb, skimmer_b.glb its two armoured redesigns, A Aegis and B Bulwark (the dev menu's SKIMMER MODEL picks one; the runner rides inside)
  assets/lightbike_a.glb, lightbike_b.glb  the Courier light-bike's two Blender redesigns, A Slipstream and B Parcel Runner (the dev menu's COURIER MODEL picks one; `classic` is the original, built in `models.js`)
  assets/warrig.glb  the Rustmoon pirate war-rig (patchwork mad-max rover with a spiked ram plow)
  assets/rover.glb   the shared rovers: the civil buggy (Mule, road traffic, hometown) and the military patrol car (base patrols, troops)
  assets/interceptor.glb the SPACECOM Lunar Interceptor, the player's pursuit car (open cockpit, rear wing, twin rocket bells)
  assets/apc.glb     the Vostok BTR-M Moon APC (eight wheels, a turret that yaws and a barrel that elevates)
  assets/landtrain.glb  the Moonliner and Prospector land-trains: two tractors and four trailers, each with a livery for every faction
  assets/crane.glb   the tower crane (cross-frame base with ballast, lattice mast with its ladder and hatched rest decks, railed top platform, slewing platform with the cab on a catwalk, counter-jib walkway, trolley and two-fall hook block)
  assets/gantry.glb  the gantry crane over the Meridian container yard (lattice legs on rail bogies with ladders and hatched decks inside, truss girder with a railed walkway and the hoist house's deck, the cab on the +z leg, the tower crane's trolley and hook carrying the land-train's box container) and that container on its own, for the yard's stacks
  assets/garage.glb  the Meridian motor-pool garages: the main one (three bays with open and shut doors, workshop fit-outs under roof trusses and a bridge crane, a glazed roof monitor, service office, and its compound: a bunded fuel yard with a canopied pump island, a back yard (on the road's soil bed, laid by traffic.js) with a rover park, parts store, rack and skip, a power compound, railings and lamp posts; its colliders and cargo stacks are pivots in the file) and a small two-bay one
  assets/slots.glb   the casino's slot-machine cabinet: a pixel-arcade video slot with a tilted screen under a marquee, speakers, LED chases, arcade buttons, a ticket printer, a coin cup and a lever (the game paints its colour, marquee, side art and reels)
  assets/casino.glb  the casino's lamp post, plaza fountain (basin, pedestal, bowl, spigots, a spinning chip or, for the Meridian Exchange's plaza, a spinning dollar sign, the water as pivots the game gives ripple, curtain and jet shaders), buff alien bouncer, hall chandelier and the welcome and blackjack signs' frames
  assets/claw.glb    the casino's Zero-G claw: the 16 m glass-tank machine (plum base, brass mullions, marquee box, console, ten shuffle jets, the drop hole), the energy claw, a chain link and each kind of thing in the tank (the salvaged engine and the credits case are the game's own models)
  assets/hall.glb    the casino's hall kit: the wall bay (half a gold pilaster each side, a lacquer wainscot with a framed suit panel, a tall arched panel with a cyan line) in four suits, a coffer ceiling tile, the compass-star floor medallion, the Chip Bar with its turning chip and halo, a banquette and table, the grand doors' frame, the outside's suit panels and the drum, dome and lantern
  assets/lot.glb     the casino forecourt's kit: the card wall (giant cards dominoed on a plum and gold kerb), its posts, the walkway's chip bollard, the P pylon and a bay stud
  assets/downs-stand.glb  Chimera Downs' grandstand kit: a three-seat strip; each stand's whole roof (raked Barn Red deck on trusses, end wall to end wall through the corner towers), back wall (with the ways in and rear quoins) and the main stand's suites row, one piece each; the end towers, the frame of a way in, and 19 m samples of the roof, back wall and suites for the Asset Row
  assets/downs-club.glb   the clubhouse and tote hall: a Mint hall under hip roofs with dormers, quoins and a string course round it, a colonnade tied back to the wall over six betting windows and a striped awning, the board's recess, the 50 m clock tower with four faces
  assets/downs-course.glb the course kit: the rail, distance pole, finish arch, photo-finish tower, lamp, flag mast, the crossings' barrier post (which also ends the rail runs) and the six-stall starting gate in two designs with their doors (A Classic Six, B The Gantry, the one the course uses; race.js `GATE` picks: docs/downs-gate-proposals/)
  assets/downs-stalls.glb twelve concession stalls (hot dogs, fries, fizz, chow, rock candy, tote, slush, coffee, donuts, grill, foam fingers, bar) on one kit: a plinth, a one-piece shell with the arch cut out, a cornice raked 0.6 m under the arcade's ceiling, lit roundels on the spandrels; each with its own props
  assets/downs-arcade.glb a wedge bay of the arcades (its own fittings; the walls, trim, roof and ceiling run on from bay to bay: downsKit.js `arcadeShell`), the gate hall (two towers either side of a vaulted passage), the forecourt's gate and fountain, a valet bay, a bench for two runners, planter and a festoon
  assets/downs-screen.glb the scoreboard drum (core, struts, the shell in one bezel sleeve with four openings and gold sills, a recessed soffit, a cap with a parapet ring and a beacon) and the winners' podium set (19.2 x 5.15 m)
  assets/downs-fair.glb   the fairground: the ferris wheel (frame, wheel, gondola), the carousel (base, canopy deck, horse), a ticket hall, a gate, a free-standing kiosk, queue posts (their rope a `rope` pivot) and fence
  assets/downs-stable.glb the stable block (six boxes), hay barn, weighing room, ring gate, hay bale and picnic table
  assets/downs-crowd.glb  a seated racegoer's wardrobe (legs, suit or frock, arms at rest / with a programme / at binoculars / cheering, head, four hairdos, six hats, rosette, scarf), drawn instanced in the stands per part worn
  assets/chimera.glb     the chimera kit (tools/blender/build_chimera_kit.py; chimerabuild.js, loaded on request): parts, mutations, the Triple Crown
  assets/chimera_hd.glb  the chimera builder's HD showcase (tools/blender/build_chimera_hd.py; loaded with the kit): person, mite, car and sapling parts at full resolution, with fitted armour and crystal
  assets/duck.glb    the casino's Duck Derby: the four racers (a cap, hat, fez or bubble helmet each, a numbered wing disc) and the gilded track: basin with lane floats, start gate and grille, finish arch, odds-board frame, bookmaker's kiosk, brass rail post and velvet rope
  assets/blackjack.glb  the casino's gilded blackjack table (plum lacquer, gold, cream suit panels, a leather rail, a chip rack, shoe and discard well, the dealer's back counter) and its chip
  assets/dish.glb    the dish stations: the two for the research arrays' big dishes, the cryo receiver (a banded Helium-3 vessel with a stair, valve cabinet and branding panel) and the gantry station (a lattice mast, container control rooms, battery bank, fuel tank), the field dish the smaller bases use (an eight-sided tower with a gallery and caged ladder, an equipment-room container, and the gantry's truss-backed reflector) and a light head (the field dish's reflector and trunnions with no tower) for the small dishes on masts and roofs, each with the dish, its yaw and tilt pivots and a livery for every faction (the stations also a number for every dish)
  assets/winch.glb   the Hitch-Line Winch's grapple (a gold three-fluke claw, collar, shank and eye) and a metre of twisted steel cable with an orange tracer strand, which the game lays along the line, a piece per metre
  assets/towmark.png the winch's tow-line marker for the HUD (brackets, a dashed ring and a hook glyph, white on clear, rendered in Blender and tinted by a CSS mask)
  assets/outposts.glb  the Relay Mast and Watchtower outposts, intact and wrecked (a pilot, off unless the URL has `?outpostGlb`; contract in docs/outpost-glb.md)
tools/
  blender/build_runner.py  builds the runner in Blender and exports src/assets/runner.glb
  blender/audit_outline.py lists the courier's parts that stick out of another part with no outline of their own (headless: `python3 tools/blender/audit_outline.py`)
  blender/build_idles.py   keys the runner's seven idles on its pivots (elbows included) -> src/assets/idles.json (headless: `pip install bpy`, then `python3 tools/blender/build_idles.py`; `MOONRUNNER_IDLES_BLEND=idles.blend` also saves the keyed scene)
  optimize-glb.mjs         compresses the models in src/assets (quantized and meshopt-coded: about a quarter of the size); `npm run optimize:glb`, run after re-exporting a model from Blender
  blender/build_ships.py   builds both transit ships in Blender and exports src/assets/ships.glb (the freighter's bays use cargo.py: the land-train's cargo units, mirrored from build_landtrain.py; FREIGHTER_VARIANT=atlas|compact builds the one-crate-high and the smaller-hull studies instead of the shipped two-high freighter; SHIPS_OUT=<file> sets where the file goes; the shuttle-bus's nose, route board, tail and engines: docs/shuttle-design.md)
  blender/spreader.py      the container spreader both cranes lift their box container with (headblocks on the twist-locks, main beams, pad-eyes the slings end on); exec'd by build_crane.py and build_gantry.py
  blender/cargo.py         the land-train's box container, Helium-3 tanker and explosives magazine, without their flatbed, for other models to carry
  blender/proposals/       the freighter design study: freighter_b.py (the open-truss "Girder" alternative to the chosen Atlas) and preview.py / preview_ships.py, which render a ship in the game's palette with Cycles on the CPU
  blender/build_skimmer.py builds the Daedalus skimmer -> src/assets/skimmer.glb
  blender/build_skimmer_redesign.py builds the Skimmer's two armoured redesigns -> src/assets/skimmer_a.glb, skimmer_b.glb (and plain copies in docs/skimmer-proposals/; headless: `MOONRUNNER_SKIMMER=a|b`); `blender/preview_skimmer.py` renders the review sheet
  blender/hullkit.py       the hull and fitting geometry the Courier and Skimmer redesign builders share (smoothed lofts, skin-hugging plates and lines, tubes, rounded bars, thin curved panels); exec'd after kit.py
  blender/build_engine.py  builds the salvaged engine that drops out of wrecks -> src/assets/engine.glb
  blender/build_briefcase.py builds the credits briefcase that drops out of wrecks -> src/assets/briefcase.glb
  blender/build_hovercar.py builds the faction and civilian hover-cars -> src/assets/hovercar.glb (the road cars, the casino car park, the Asset Row)
  blender/build_plinko.py builds the Plinko booth and the board's cabinet frame -> src/assets/plinko.glb (casinoWorld.js, the PLINKO section)
  blender/build_warrig.py  builds the pirate war-rig -> src/assets/warrig.glb
  blender/build_rover.py   builds the civil buggy and the military patrol car -> src/assets/rover.glb
  blender/build_interceptor.py builds the SPACECOM Lunar Interceptor -> src/assets/interceptor.glb
  blender/build_apc.py     builds the Vostok APC and its turret -> src/assets/apc.glb (also runs headless: `pip install bpy`, then `MOONRUNNER_REPO=. python3 tools/blender/build_apc.py`)
  blender/build_landtrain.py builds the Moonliner and Prospector tractors and trailers -> src/assets/landtrain.glb (also runs headless, like build_apc.py)
  blender/build_crane.py   builds the tower crane -> src/assets/crane.glb (also runs headless, like build_apc.py)
  blender/build_gantry.py  builds the gantry crane and the yard's box container -> src/assets/gantry.glb (the tower crane's lattice work, trolley, hook and slings; the container from cargo.py)
  blender/build_garage.py  builds the main and small motor-pool garages -> src/assets/garage.glb (also runs headless)
  blender/build_slots.py   builds the casino's slot-machine cabinet -> src/assets/slots.glb (also runs headless; checks that the side plaques and decals sit inside the cabinet's silhouette)
  blender/build_casino.py  builds the casino's lamp post, fountain, bouncer, chandelier and signs -> src/assets/casino.glb (also runs headless)
  blender/build_claw.py    builds the Zero-G claw machine, the claw and the things in its tank -> src/assets/claw.glb (also runs headless)
  casino-layouts.mjs       dev-only: the casino's plans (current, A, B) with the games' footprints, trigger zones and camera corridors; checks the spacing and that the walls leave the floor and doors free (`node tools/casino-layouts.mjs`, `... docs` redraws docs/casino-layout-*.svg); docs/casino-layouts.md is the study
  casino-forecourt.mjs     dev-only: the forecourt (avenue, car parks, plaza) before and as built (docs/casino-forecourt.md); draws both plans and checks the Valet Court's spacing
  casino-zfight.mjs        dev-only: lists the visible pairs of faces on one plane in the running casino (`node tools/casino-zfight.mjs`; needs the dev server)
  casino-shots.mjs         dev-only: screenshots of the casino from fixed vantage points (needs the dev server)
  check-claw.mjs           dev-only: plays the claw sim with four bots (novice to expert) and prints what each takes home against the ₵200 entry (`node tools/check-claw.mjs 300 [novice|average|skilled|expert]`)
  blender/suits.py        the casino's card-suit trim as geometry (the prize counter's panels), exec'd by the blackjack, claw and duck builders
  blender/build_duck.py    builds the Duck Derby's racers and track -> src/assets/duck.glb (also runs headless)
  blender/build_hall.py    builds the casino's hall kit (wall bays, ceiling tiles, the floor medallion, the Chip Bar, a banquette, the doors' frame, the facade's panels, the crown) -> src/assets/hall.glb (also runs headless; the build stops if two faces of one model share a plane: `audit_coplanar` in kit.py)
  blender/build_lot.py     builds the forecourt kit (card wall, post, chip bollard, P pylon, bay stud) -> src/assets/lot.glb (runs `audit_coplanar` too)
  blender/downs_common.py  shared by the Downs builders: the palette, the accumulator that merges boxes and cylinders per slot, the export (and the coplanar audit)
  blender/build_downs_stand.py, build_downs_club.py, build_downs_course.py, build_downs_stalls.py, build_downs_arcade.py, build_downs_screen.py, build_downs_fair.py,
                           build_downs_stable.py, build_downs_crowd.py   build Chimera Downs' kits -> src/assets/downs-*.glb (each runs `audit_coplanar` too)
  blender/build_chimera_kit.py the chimera kit for chimerabuild.js: mite, car and sapling parts in three looks with their joints and attachment points, the mutations in each family's form, the Triple Crown -> src/assets/chimera.glb
  blender/build_chimera_hd.py the HD showcase for chimerabuild.js: person, mite, car and sapling parts fused from primitives (voxel remesh, smooth, decimate), details cut in with Booleans, joints built in, armour shrinkwrapped and crystal rooted on each part -> src/assets/chimera_hd.glb
  blender/build_blackjack.py  builds the blackjack table and chip -> src/assets/blackjack.glb (also runs headless; the build stops if anything stands in the places cards, chips and the felt's lettering go)
  blender/build_dish.py    builds the cryo receiver, the gantry station, the field dish and the light dish head -> src/assets/dish.glb (also runs headless)
  blender/build_courier.py builds the two Courier light-bike redesigns -> src/assets/lightbike_a.glb, lightbike_b.glb (and plain copies in docs/courier-proposals/; headless: `MOONRUNNER_COURIER=a|b`); `blender/preview_courier.py` renders the review sheet
  blender/build_winch.py   builds the winch's grapple and cable piece -> src/assets/winch.glb and renders the tow-line marker -> src/assets/towmark.png (also runs headless: `pip install bpy`, then `MOONRUNNER_REPO=. python3 tools/blender/build_winch.py`)
  blender/build_outposts.py builds the Relay Mast and Watchtower -> src/assets/outposts.glb (also runs headless; `npm run check:outposts` checks the file); the mast's dishes are the dish head of dishkit.py
  blender/dishkit.py       the dish geometry build_dish.py and build_outposts.py share (the reflector and its parts, the trunnion mount, the light dish head); exec'd by them after kit.py, builds nothing itself
  blender/decals.py        flat lettering, emblems, hazard stripes and safety signs (no textures) the land-train builder execs after kit.py; also the box container's flank and door markings and its door ends (`container_doors`), shared by the land-train, the tower crane's load and cargo.py
  blender/kit.py           shared geometry/material/export helpers every Blender builder execs (the runner and ships keep their own variants of a few)
  viewer.html              dev-only model viewer (npm run dev, then /tools/viewer.html?m=shuttle|freighter|apc|landtrain|crane|gantry|cargobox|garage|slots|dish|outpost|mite|lineup…; slots takes &n=<cabinets in a row>&ring=<cabinets round a pillar>&idx=<first colour and name>&play=1 (works them like a patron); casino takes &part=lamp|fountain|bouncer|chandelier|welcome|wall|blackjack|claw|clawthings|duckderby (&accent=<hex>&n=<lamps> for lamp); shuttle takes &sign=<route board text>&ships=<a ships .glb to load instead of ships.glb> (docs/shuttle-design.md); freighter takes &faction=spacecom|vostok|kepler|meridian (the cargo's livery); dish takes &kind=cryo|gantry|field|head&faction=…&no=01..04&size=30&tilt=<rad>&sweep=1; apc takes &turret=<rad>&barrel=<rad>; landtrain takes &type=moonliner|prospector&faction=spacecom|vostok|kepler|meridian&cars=pax,tank,cargo,blast&unit=<n>)
  downs-audit.mjs         dev-only: audits Chimera Downs' build in its flat design frame: z-fighting (coplanar triangles of different colours, named by builder and part), colliders standing in each other, text planes facing into walls or hanging in air, bare-ground seams (`node tools/downs-audit.mjs [zfight|colliders|text|gaps|all]`)
  downs-layouts.mjs        dev-only: the Chimera Downs overhaul study (docs/downs-layouts.md): the old course and the two proposed layouts (B was built), a clearance check against the oval and the plateau, and the plan drawings in docs/ (`node tools/downs-layouts.mjs docs`)
  chimera-lab.html         dev-only: the chimera builder's lab (npm run dev, then /tools/chimera-lab.html): pick parts, mutations and a seed, or a grid of random chimeras, or the HD showcase (docs/chimera-builder/)
  race-sim.mjs             dev-only: runs the Chimera Downs race model headless thousands of times and reports the balance: what each stat and style wins, the starting stalls, passes, skills, the bad moments, the tank at the line (`node tools/race-sim.mjs [races] [all|sprint|mile|medium|long|<metres>] [field] [skills=0|1]`)
  meridian-layouts.mjs     the Meridian Exchange layout study (docs/meridian-layouts.md): the footprints of the site as built and of two proposed layouts, a clearance check, and the plan drawings in docs/
  winch-ride.mjs           dev-only headless test of the Hitch-Line winch with the real player and the real winch: rides toward the casino fountain past the Lucky Crater Casino's old sign posts (the harness stands their colliders in: coasting, running at them, circling a post, skating the ring road), and judges flings, snapped lines, posts the cable gave up on and cable inside a post; `--gate ring` is the check to run after touching `src/winch.js` (see docs/winch-handoff.md)
```

**Editing the runner:** run `tools/blender/build_runner.py` in Blender (Scripting tab, or
`exec(open(r"<repo>/tools/blender/build_runner.py").read())`); it rebuilds the model and re-exports
`src/assets/runner.glb`. Each part's material name is a colour slot (suit, accent, helmet, visor, scarf…)
that outfits recolour, and the scarf stays a 4-link chain driven by `ScarfSim`. The standing idles are keyed
on the same pivots by `tools/blender/build_idles.py` and played by `src/idles.js`.

**Models and the bundle:** each model file in `src/assets` is its own chunk (imported on demand in `src/models.js`, inlined as a data URI so the desktop build, which runs from file://, needs no fetch), so the game's code is a small file of its own and each model is cached separately. The vehicle, ship, crane, garage and dish models are stored compressed: after re-exporting one from Blender, run `npm run optimize:glb` (a plain file still loads, it is just bigger). `runner.glb`, `outposts.glb` and `winch.glb` are left plain.
