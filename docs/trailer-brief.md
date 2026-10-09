# Moon-Runner: official trailer brief

Handoff for a fresh session. Read this first, then `README.md` (features and the module map at the
bottom) before touching code. Current release: **0.9.8**.

## The goal

An official trailer of roughly **45 seconds**, made entirely from **in-game footage**, so it shows
the real look of the game: toon shading, ink outlines, halftone, comic pop text, the HUD fonts.

- **Message:** *moon deliveries… but also shenanigans on the side.* Open on the job (a courier
  with cargo, a delivery run), then let it spiral into everything else.
- **Pace:** fast, but with transitions that flow (match cuts, whip-pans, motion carried across a
  cut, an object wiping the frame). It shouldn't feel like a slideshow.
- **Show:** vehicles, action (pirates, Kade's gun truck, turrets), tricks, grinds (snake rocks and
  crater rims, with sparks), unique places (Chimera Downs derby, Antimatter Research Lab, casino,
  funpark, Monolith), meteor showers, transit ships.
- **Don't explain everything.** Secrets stay secret. The **Xenoglide legendary skates** get a
  *tease only*: a glimpse of the alien gate in the Whispering Fissure, a mint-green glow (0x7dffd4)
  behind it, a "???" or "SOMETHING IS DOWN THERE" card. Never show what they do. Same spirit for the
  SAT-7 "Lantern" satellite: a silhouette crossing the sky at most.
- **End card:** logo ("MOON-RUNNER", "QUANTUM-LOCK DELIVERY SERVICE" as on the title screen), then
  a short call to action (version, platform, or "OUT NOW", whatever the owner wants).

## Suggested approach

1. **A director mode in the game** (`src/trailer.js`, enabled by a URL flag such as `?trailer`, or
   from the cheats menu (backtick)). The shot list is data: each shot has a duration, a setup
   function (teleport, stage events, spawn things, pose the player) and a camera path (eased
   position/target keys, or "follow the player from here"). It hides the HUD, uses
   `g.state = 'cutscene'` to own the camera, and draws title cards with the game's fonts and
   comic style (see `hud.js` and `style.css` for `alert`, `banner` and `pop`).
2. **Deterministic playback.** Run the game on a fixed timestep during the trailer, so every run
   is identical and cuts land on beats.
3. **Capture.** Two options:
   - **Recommended:** the owner plays the director mode in their own browser at 1080p and records it
     with **OBS at 60 fps**. That uses the real GPU and the game's own music and sound.
   - Frame-perfect alternative: step the game frame by frame, grab each canvas frame
     (`renderer.domElement.toDataURL` → POST to a tiny local server), then stitch the frames with
     **ffmpeg**. Check that ffmpeg is installed first. Audio then has to be laid in separately.
4. **Review loop.** Claude can only look at single frames, not motion or rhythm. The owner watches
   each draft recording and gives notes on pacing; Claude adjusts the shot data.
5. **Optional finishing** in a free editor (DaVinci Resolve) for music sync and the final export,
   if the in-engine cut isn't final as recorded.

## Draft shot list (about 45 s)

Times are rough; tune them to the music. ▸ marks how each shot hands off to the next.

| # | t (s) | Shot | Notes |
|---|-------|------|-------|
| 1 | 0–3 | **Cold open, Earthrise over ILMB.** Slow push across the base at dawn; a cargo ship lifts off a pad. | Calm synth. Card: *"THE MOON NEEDS ITS DELIVERIES."* ▸ the ship's thrust wipes the frame |
| 2 | 3–6 | **Courier at the job board**, grabs a crate, skates off the base onto the plain. | Card: *"QUANTUM-LOCK DELIVERY SERVICE"* ▸ follow-cam keeps moving |
| 3 | 6–9 | **Low chase cam at speed** across the plain, carving between craters; Earth on the horizon. | Music kicks in ▸ hit a crater lip |
| 4 | 9–11 | **Rim grind:** catches a crater lip, slide pose, sparks spraying, quick orbit round the player. | ▸ pops off the end into the air |
| 5 | 11–13 | **Trick in the air:** flip plus spin over a rille, stuck landing, "BIG AIR" pop text. | Card: *"…MOSTLY."* ▸ |
| 6 | 13–16 | **Pirates:** a squad drops in on the dark side, lamp on, shots fly, cargo grab attempt. | ▸ whip-pan |
| 7 | 16–19 | **Captain Kade's gun truck** skirting round, gatling bursts, then flak as the player jets up. | Slow-mo splash panel on his entrance (`story.spawnKade`) ▸ explosion flash cut |
| 8 | 19–21 | **Vehicles:** the Daedalus Phase Skimmer drifting hard, then the Vostok APC ploughing through. | ▸ match cut on a skid |
| 9 | 21–24 | **Meteor shower:** angled meteors streak in, impacts, chunks tumbling, the player weaving. | Red map highlight optional ▸ |
| 10 | 24–27 | **Transit ship:** hop aboard, landing gear retracts, ship lifts off over a settlement. | ▸ the ship flies into the next shot |
| 11 | 27–30 | **Chimera Downs:** gates spring, chimeras race, crowd roars; cut to a close-up of the leader. | Downs space-western music sting |
| 12 | 30–33 | **Antimatter Lab:** the reactor flashes, Dr. Zbornak, jar bloops, a mutation pops. | Clinical-strange music sting. Card: *"SHENANIGANS."* |
| 13 | 33–35 | **Casino / Funpark** quick double cut: slots, then the rideable ferris wheel or carousel at night. | Jazzy synthwave sting |
| 14 | 35–37 | **The Monolith:** touch it; time dilation (violet screen edge) or echo decoys pull pirate fire. | |
| 15 | 37–40 | **Tease:** descend into the Whispering Fissure; the alien gate; a mint-green glow behind it. Hold, cut to black. | Card: *"SOMETHING IS DOWN THERE."* Don't show the skates. |
| 16 | 40–45 | **Hero shot plus end card:** the courier crests a rim at sunset with the cargo, grinding off into the dark; logo. | Last beat lands on the logo |

## Where things are

**Location ids** (`src/locations.js`; teleport with the cheats menu or `g.cheats.teleport(loc)`):
`ilmb` (International Moon Base, hub), `meridian` (trade), `antimatter` (Antimatter Research Lab),
`downs` (Chimera Downs derby), `casino` (Lucky Crater Casino), `bounce` (Bounce Dome Funpark),
`monolith`, `fissure` (Whispering Fissure, Xenoglide shrine), `rustmoon` / `gulch` / `blackrock` /
`gloom` (pirate dens, dark side), `daedalus` (military citadel), `farside`, `twilight`
(terminator waystation), plus the civilian towns `tranq`, `aldrin`, `kepler`, `hertz`.

**Hooks for staging shots** (all reachable from the `window.game` object, `g` below):
- Player: `g.player` (`body.pos`, `body.vel`, `heading`, `model`, `trick`). Mid-air tricks are
  Q + W/S (flip) and Q + A/D (spin); inject keys through `g.input.keys` / `g.input.justPressed`.
- Grinding: `g.grind` (`rails.js`). Crater-rim rails come from `g.planet.rimOf(c)`,
  `g.planet.rimRailsOf(c)` and `g.planet.rimRailsNear(pos)`; snake-rock rails are in `g.planet.rails`.
  Place the player on a rail point, moving along it at 20+ m/s, and it catches.
- Kade: `g.story.spawnKade(false)` (truck plus splash panel), logic in `src/kade.js`.
- Pirates: `g.enemies.spawnSquad(n)`, `g.enemies.spawnPirate(...)`.
- Meteors: `g.meteors.begin()` / `end()` (`src/meteors.js`).
- Vehicles: `g.garage` (`src/vehicles.js`, the `Garage` class): `summon(id)` / `enter()` / `exit()`.
  Ids: `interceptor`, `apc`, `skimmer`. They have to be unlocked in the story, or use the cheats.
- Transit ships and rides: `g.rides` (`board(n)`, `exit()`, `nearest(p)`).
- Derby: `g.race` (`src/race.js`: `open()`, `start(race, field, bet, odds)`). While watching, the
  game state is `'derby'` and the race drives the camera.
- Monolith: `src/monolith.js` (`monolithTouch(g.alchemy)`; buffs are in `g.alchemy.buffs`).
- Secrets / Xenoglide: `src/secrets.js` (the Fissure layout, the gate, and the shrine at the back).
- Comic pop text: `g.fx.pop(text, pos, { color, size })`. Toasts and alerts: `g.hud.toast` /
  `g.hud.alert`. Slow motion: `g.slowmo = seconds`.
- Music: `g.audio.setZone(...)` picks the track (menu, casino, downs, lab, dark side, …), from
  `musicZone()` in `main.js`. Crowd: `g.audio.setCrowd` / `roar`.
- Cheats (backtick): unlock everything, teleport, reveal the map, set rep.

## Quirks learned driving the game from scripts

- **Pumping frames by hand:**
  `window.step = n => { for (let i = 0; i < n; i++) { g.last = performance.now() - 16; g.frame(); } }`.
- **Owning the camera:** set `g.state = 'cutscene'`, then place `g.camera` yourself. Render through
  the comic pass with `g.post.render(g.scene, g.camera)`. Plain `g.renderer.render` skips the ink
  and halftone.
- **Before a far camera shot:** call `g.planet.update(eye, { budgetMs: 1e9 })` so the terrain
  chunks there exist, and `g.planet.rimInkAt.set(1e9, 0, 0); g.planet.updateRimInk(eye)` so the
  crater rim bands are up to date.
- **Pets:** the follower pets (`g.alchemy.followers[].root`) photobomb close shots; hide them while
  staging.
- **Title menu:** it's an overlay; hide its DOM container if you stage shots from the title screen.
  The title screen state is `'title'`.
- **Claude's browser pane is hidden and throttled.** Screenshots often show a stale frame, so take
  a second one. The pane is no good for real-time capture.
- **Vite dev server:** when several files are written in quick succession it can keep serving a
  half-written module ("Unexpected identifier" on load). Restart the preview server if the game
  fails to start after edits.
- **First load:** the game takes a while to build terrain ("Pouring regolith…", "Waking up the
  pirates…"). Wait for it before clicking CONTINUE.
- **The world is fixed-seed** (seed 1969), so camera positions you find stay valid between runs.

## Open questions for the owner

- Music: one of the game's own tracks, a medley of the zone tracks, or an outside track?
- Voice-over or text cards only? (The draft assumes text cards.)
- Aspect ratio: 16:9 only, or also a 9:16 cut for shorts?
- End-card call to action: "OUT NOW", a version number, a store or itch.io link?
