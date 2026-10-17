# Moon-Runner: multiplayer co-op investigation

A handoff for whoever picks up co-op. It covers what the code does today, the architecture that fits it, the
refactors each subsystem needs, how solo and co-op balance diverge, and a phased plan. Read `README.md` (the
"Code map" at the bottom especially) first. Current release: **0.9.99-1**. File references are `path:line` at
that version.

---

## 0. Summary and recommendation

**Today the game is a strictly single-player simulation.** There is no networking code anywhere (no
WebSocket, WebRTC, BroadcastChannel, or anything named multiplayer). One `Game` object (`src/main.js:131`)
owns one `Player`, one camera, one `Input`, one wallet, one active contract, one active event, one story
chapter, one grinder, one winch, one vehicle, and the whole world streams and sleeps around that one camera.
Roughly **265 direct `game.player` references across about 30 files**, plus another ~350 through local
`const P = g.player` aliases in the gameplay modules.

**Recommended shape:**

| Decision | Recommendation | Why |
| --- | --- | --- |
| Topology | **Host-authoritative listen server**: one player's game client runs the real simulation, guests send inputs and receive state | The sim is not deterministic (Math.random in AI, variable frame step, order-dependent seeded streams), so lockstep is out. A headless dedicated server is out too: the sim is welded to Three.js meshes and the DOM. |
| Transport | **WebRTC DataChannels** (peer to peer, unreliable+unordered for snapshots, reliable for events) with a tiny signaling step. Fallback: a WebSocket relay. | The Electron renderer is sandboxed with no Node access and no preload (`electron/main.cjs`), so it cannot listen on a socket. WebRTC works identically in the browser build and the desktop build. |
| Party size | **2 to 4** | Pirate pools, lair activation and collider streaming scale with every extra viewer; 4 is where the host's frame budget stops being comfortable. |
| Session model | **Drop-in to the host's save.** The host's world state is the session's world. Guests bring their own runner (cosmetics, wallet, upgrades, jar, chimeras); world progress (story, territory, finales) belongs to the host's save. | Terrain shape itself depends on save state (town and outpost plateaus), so there can only be one world. Per-player progression is what makes the second player want to show up. |
| Client prediction | **Yes for your own body, interpolation for everyone else.** `stepSkater` is a pure function and terrain height is a pure function of position, so a guest can run its own physics locally and reconcile to the host. | Skating is the whole game; it cannot feel like 100 ms of input lag. |

The single biggest piece of work is not networking. It is **turning singletons into collections**: the
player, the input, the camera frame, projectile and blast ownership, the frozen-world menus, and the
one-viewer streaming. Most of that is worth doing anyway and ships safely in single-player releases before
a byte goes over the wire (see the phased plan in section 5).

---

## 1. How the game works today (the facts co-op has to deal with)

### 1.1 The frame loop and time

- `renderer.setAnimationLoop(() => this.frame())` (`src/main.js:283`). `frame()` (`:1055`) measures a
  **variable** `rdt = min(0.05, elapsed)`. There is no fixed tick and no separation of simulate and render.
- `FROZEN_STATES = {paused, map, dialog, board, log, wardrobe, dawn}` set `dt = 0` for everything
  (`:81`, `:1064`). **Every dialog freezes the whole Moon**: story leaders, the job board, the reactor, the
  race card, the teleporter menu.
- `updatePlay(dt)` (`:1216`) only runs in state `'play'`. In `'casino'`, `'derby'` and `'cutscene'` (recall
  shuttle) enemies, missions, events and story stop, while `world.update` (traffic) and fx keep going.
  `'dead'` keeps enemies and projectiles ticking.
- Two time-scale effects: `g.slowmo` scales `dt` for everything in `updatePlay` by 0.3 (villain entrances,
  `src/story.js:1692`), and the Monolith's dilation scales only the **world** step `wdt` by `DILATE_RATE = 0.4`
  (`src/monolith.js:12`, `main.js:1083`) so "the world crawls, you don't".
- The Spindle (Meridian finale) **swaps `g.planet`** for an asteroid world and changes the global gravity
  axis `GRAV.axis` (`src/spindle.js:386-393`, `src/geo.js:125`); the Moon is hidden and frozen meanwhile.
- The trailer already proves a fixed step is possible: `?trailer&fixed` runs the game at exactly 1/60 s
  (`src/trailer.js:290-292`), and `&pump` drives frames by hand from `window.step(n)`.

### 1.2 The player

- `class Player` (`src/player.js:25`) is created once (`main.js:193`). Its body is `makeBody()` from
  `src/physics.js:160`, and all movement runs through **`stepSkater(b, ctrl, dt, planet, colliders, params,
  impacts)`** (`physics.js:185`), which contains no `Math.random` and reads terrain on demand. The player
  substeps it at 1/120 s (`player.js:283-296`). Pirate skaters and vehicles use the same function at 1/60 s.
- The per-tick control struct is already small: `{wish: Vector3, skates, thrust, jump, dive, thrustDir}`
  (`player.js:208-217`), built from `Input.down/pressed`, `mouse[0]`/`[2]`, and the camera frame
  `cam.fwd/right/pitch/look/position`.
- Side effects happen **inside** the physics step: landings call `onImpact` which calls `g.damagePlayer`,
  `g.style`, `missions.jostle`, starts the ragdoll (`player.js:449-474`); weapons fire from inside `step`
  (`:370-392`). The ragdoll is its own fixed-step verlet sim (`src/ragdoll.js`, 1/120 s, 11 particles) and
  uses `Math.random` for the launch.
- The runner visual is a factory: `makeRunner()` (`src/models.js:386-520`) returns pivot groups over shared
  baked glb parts, and animation is procedural in `Player.animate(dt, cam, ctrl)` (`player.js:476-553`)
  reading only `body`, `heading`, `ctrl`, `trick`, `rag`, `cam.fwd`. **Extra runners already exist**: pirate
  and ally skaters (`src/enemies.js:244, 304`), the wardrobe mannequin, the Monolith echo decoys. Cosmetics
  recolour any runner through `dressRunner` / `dressSkates` (`src/cosmetics.js`). So a `RemoteRunner` is
  cheap to build.
- Things that look like player state but live elsewhere: grinding (`g.grind.active`, one `Grinder`,
  `src/rails.js`), the winch (`g.winch`, singleton), the vehicle (`g.garage.active`), the seat
  (`g.rides.ride`), cargo (`g.missions.cargoState`; the crate on the back is purely visual via
  `P.setCargo`), credits/upgrades/stats (`Game`), skate trails (exactly two ribbons, `src/fx.js:32`).

### 1.3 The world

- Terrain is deterministic from `PLANET.seed = 1969` (`src/config.js:6`) and is a pure function of
  direction, sampled on demand with a cache (`src/terrainField.js:248-377`, `src/planet.js:173-216`). It
  does **not** depend on mesh streaming, so physics works anywhere.
- But the final height field also depends on **save state**: settlement plateaus (`addZone`), the ~120
  procedural outposts (`FLAT_R = 30`), founded outposts (`BUILT_R = 40`), the hometown, the launch pad, and
  `applyWorldState` remaps (`src/worldstate.js`). `Planet.addFlat` samples the plateau height at call time,
  so **the order flats are added matters**. Two machines produce the same Moon only if they start from the
  same `moonrunner-world-v1`, `moonrunner-territory-v1` and story `founded`/`townSite` data and add flats in
  the same order.
- Streaming is single-viewer: `planet.update(camera.position, {ahead, maxDist})` once per frame
  (`main.js:1095`), `world.update(dt, time, camPos)` sets `loc.active` within `ACTIVE_DIST = 2600`
  (`src/world.js:27`), and **colliders only exist near the one viewer**: boulder colliders within ~260 m
  (LOD ≤ 1, `planet.js:703-708`), territory outposts within 900/1150 m of the player (`src/territory.js:25`),
  satellite colliders within 700 m, crater-rim rails within 220 m, meteor rock colliders within 250 m.
  A remote player 2 km from the host would skate through boulders and outposts on the host's sim.
- Unseeded `Math.random` that changes world content: meteor showers entirely (`src/meteors.js`), the
  Monolith spell pick, council votes, loot amounts and landing spots, story spawn spots, outpost
  `found()` seeds, resident looks (including the 22% Vrill flag that decides what jarring them gives).
- Seeded streams that are consumed at runtime and therefore drift: `World.rand` (`mulberry32(42)`),
  `Traffic.rand` (`mulberry32(2024)`). Traffic itself never reads the player; it is all camera-relative and
  reaches the game through `globalThis.game` (`src/traffic.js:1466`).

### 1.4 Gameplay systems

All constructed with the one `game` object and reading `g.player`, `g.camera`, `g.credits`, `g.rep`,
`g.input` directly. None takes a player argument. Ownership of projectiles and blasts is a bare string:
`'player' | 'pirate' | 'mil' | 'ally' | 'kade' | 'alien'` (`src/projectiles.js`, `main.js:768`).

| System | Singleton assumptions that bite |
| --- | --- |
| Enemies (`src/enemies.js`) | `victim()`/`targetFor()` return P unless an event object, ally or decoy exists. Leash and spawn distances from P. Lairs wake by camera distance. `tryGrab` reads `missions.cargoState` (one cargo). Collision with P only. |
| Projectiles | Hostile shots test `g.player.center` only. `main.explode` damages only `g.player`. |
| Missions (`src/missions.js`) | One `active` (+ one `extra` with the Twin Cradle). Pickup/delivery by distance to P. Board offers per settlement, shared. |
| Events (`src/events.js`) | One open event per faction, one `active`, started by P pressing F within 8 m. Escort crawler only moves while P is within 260 m. Fluid slosh reads P's acceleration. |
| Story (`src/story.js`) | One active chapter; save locks to one faction; `near()` against P; backup and chase spawns around P and `g.cam.fwd`; dash writes `P.vel`; teleport calls `P.respawn`. |
| Territory | Outposts spawn/drop and patrols spawn by distance to P; patrols shoot P. |
| Alchemy | Buffs overwrite `P.params` every frame; loot pickup, followers, mites all relative to P. |
| Garage / Rides / Winch / Grinder / Recall / Tutorial / Kade | One instance each, attached to P. Recall and the casino and derby **take over the single camera** and `g.state`. |
| Casino | State in `g.stats.casino`; real-time `setTimeout` spins; debt interest on `Date.now()`. |
| Reputation | One `values` object, one `rustmoon` state. |
| Civilians, Traffic | Camera-relative, no player reads (civilians flee from P). |

### 1.5 Saves

localStorage only, no file I/O. Each module saves its own `moonrunner-*` key; `SaveSlots` (`src/saves.js`)
snapshots them into `mr-slot-N` and **switching slots reloads the page**. Scope of each key:

| Key | Owner module | Scope in co-op |
| --- | --- | --- |
| `moonrunner-save-v1` (credits, stats, upgrades, near) | main | per player |
| `moonrunner-style-v1` (outfit, skates, laser) | cosmetics | per player |
| `moonrunner-lab-v1` (chimeras, mutations, artifact) | alchemy | per player |
| `moonrunner-rep-v2` (values, rustmoon, history) | reputation | **decision needed** (see 4.9) |
| `moonrunner-tutorial-v1`, `mr-power` | tutorial, powers | per player |
| `moonrunner-explore-v1` (fog cells, discovered) | mapview | per player (could union) |
| `moonrunner-story-v1` | story | **mixed**: `faction`, `tech`, `vehicles` per player; `founded`, `capturedIds`, `kade`, `townSite` are world |
| `moonrunner-territory-v1` (captured, built, kinds) | territory | world |
| `moonrunner-world-v1` | worldstate | world (applied before the world is built) |
| `moonrunner-secrets-v1` (artifactTaken, gateOpen, skatesTaken) | secrets | world (gate), per player (skates taken) |
| `moonrunner-settings-v1` | settings | machine |

The trailer shows how to sandbox storage: `?trailer` swaps `localStorage` for in-memory stores before any
module reads a save (`src/trailer.js` top of file). A guest joining a session needs the same trick:
world keys replaced by the host's, player keys kept.

### 1.6 Electron

`electron/main.cjs` opens one `BrowserWindow` with `contextIsolation: true, sandbox: true`, no preload, no
IPC, loads `dist/index.html` from `file://`. The renderer can be a WebSocket/WebRTC/fetch **client** but
cannot listen. `index.html` has no CSP meta tag, so nothing blocks outbound connections. Hosting a plain
TCP/WebSocket server from the desktop app would need main-process code plus a preload with `contextBridge`.

---

## 2. Architecture

### 2.1 Why host-authoritative, not lockstep

Lockstep (every machine runs the identical sim from identical inputs) needs bit-for-bit determinism. The
code is far from it: ~250 `Math.random` calls in gameplay modules (enemies 27, meteors 20, race 20,
alchemy 19, civilians 17, events 12, story 11, traffic 11), a variable frame step with a dt-dependent
substep count, seeded streams consumed in event order, `Date.now()` in the casino, and gameplay side
effects fired from inside physics. Making all that deterministic is a rewrite of the AI and a permanent
tax on every future feature ("did you use the seeded rng?"). A desync in lockstep is also unrecoverable
without a full state resync, which brings you back to state replication anyway.

Host-authoritative keeps the existing sim exactly as it is on the host and asks the guests to do three
things: send inputs, predict their own body, and render what the host says. The parts of the game that
would otherwise be hardest to replicate (terrain, settlements, roads, outposts) are deterministic from
save state and never need to go over the wire.

### 2.2 Session lifecycle

1. **Host** picks a save slot and "HOST CO-OP" from the main menu (`src/menu.js`). The game starts as
   usual, plus a `Net` module that creates a room and shows a join code.
2. **Guest** picks "JOIN CO-OP", enters the code, and the client fetches the **world handshake**: the
   host's version string (`__APP_VERSION__`, must match exactly), `moonrunner-world-v1`,
   `moonrunner-territory-v1`, `moonrunner-secrets-v1` (world fields), the story's `founded`/`capturedIds`/
   `townSite`/`kade`, plus the `events.list`, `missions.offers`, destroyed dens (`loc.destroyedUntil`),
   wrecked outposts, the satellite clock, `game.time`.
3. The guest **rebuilds its world** from that state (the same code path `SaveSlots.activate` uses: write
   the live keys, reload with an autostart flag; the world keys come from the host, the player keys from
   the guest's own slot). Flats must be added in the host's order: send the ordered list rather than
   recomputing.
4. The guest spawns at `spotNear(host player's nearest settlement)` and starts sending `InputFrame`s.
5. On disconnect the guest's runner despawns on the host; anything it was carrying drops in place
   (`cargoState = 'dropped'` already exists in `missions.js`).

### 2.3 Tick model

- **Host:** fixed simulation tick `TICK = 1/60`, accumulator in `frame()`, render after the last substep.
  The accumulator is capped (3–4 ticks) and `rdt` stays for HUD and particles, exactly as `hud.update(rdt)`
  already is. The trailer's `fixed` mode is the template.
- **Guest → host:** one `InputFrame` per tick, redundantly bundled (last 3 frames per packet) over the
  unreliable channel. About 16 bytes: `held` bit-set (W A S D Space E Q Shift LMB RMB Z X R V), `edges`
  bit-set (Shift F G V Z T Digit1..7), `padMove` as two int8, `yaw` as a tangent-frame angle in uint16,
  `pitch` in int16, tick number.
- **Host → guests:** snapshots at 20–30 Hz over the unreliable channel; events (damage, kills, pickups,
  dialog results, mission state changes, explosions, pops) over the reliable channel. Per player: position
  (3× float32 relative to a chunk origin, or 3× int32 mm), velocity, heading (packed), body flags
  (skating, grounded, thrusting, dive, grinding, ragdoll, dead, vehicle id), health, energy, trick phase,
  weapon, cargo visual. Per enemy: id, kind, pos, vel, heading, state enum, hp, carrying flag, target id.
  Rough budget for 4 players and 20 live enemies at 20 Hz: ~15 KB/s per guest. Trivial.
- **Prediction and reconciliation:** the guest keeps the last N `InputFrame`s and body states, runs
  `stepSkater` locally every tick, and on each snapshot rewinds to the acknowledged tick, applies the host
  body, and replays. Divergence sources to handle: moving platforms (`c.platform` colliders from traffic
  decks, `physics.js:409`), explosions and rams applied by the host, grind catch, winch pulls. The
  reconciliation must snap on big errors and blend small ones.
- **Remote runners:** interpolate 100 ms behind the newest snapshot; drive `animate()` with a
  reconstructed `ctrl` (wish from velocity, dive/skates from flags). Their trail, lamp, glow and scarf are
  per instance.

### 2.4 Authority split

| Owned by the host | Owned by each client |
| --- | --- |
| Every enemy, projectile, drop, base, lair, event, mission state, story step, territory, traffic, civilian, chimera, meteor, Kade, boss, satellite clock, `game.time` | Its own camera, HUD, menus, audio, music zone, fog-of-war reveal, settings, cosmetics choice |
| Damage to any player, deaths, respawn points | Input, local physics prediction |
| Random outcomes (loot, Monolith spell, casino spins, race results, council votes) | Purely cosmetic randomness (stars, sparks, pop text) |
| Credits/rep mutations (clients request, host grants and echoes) | |

The host's own player is just another entry in `players[]` whose input happens to arrive with zero delay.

### 2.5 Transport details

- **WebRTC DataChannels** via `RTCPeerConnection`, one per guest, star topology around the host. Two
  channels: `{ordered: false, maxRetransmits: 0}` for inputs and snapshots, `{ordered: true}` for events.
- **Signaling:** the minimum is a copy-paste of the SDP offer/answer (works with zero infrastructure, ugly
  UX). The next step is a tiny room service (a few dozen lines on any WebSocket host) that only relays
  SDP and ICE for a room code, then gets out of the way. A public STUN server covers most NATs; symmetric
  NATs need a TURN relay, which costs money, so the WebSocket relay fallback doubles as the TURN story.
- **Electron LAN alternative:** add a `preload.cjs` with `contextBridge` and a main-process `ws` server
  for same-network play without any internet. Needs `electron-builder` to pick up the new dependency.
- **Version gate:** refuse a join unless `__APP_VERSION__` matches; the snapshot schemas will change often.

---

## 3. Refactor inventory, subsystem by subsystem

Ordered roughly by how much everything else depends on it.

### 3.1 Fixed tick and frame structure (`src/main.js`)

- Split `frame()` into `simulate(dt)` and `render(rdt)`; accumulate `rdt` into 1/60 ticks.
- `FROZEN_STATES` becomes a **local-only** concept in co-op: the host's sim never stops because someone
  opened the map. Menus render as overlays while the world ticks (the pause screen says "PAUSED" but only
  the local input is withheld). Solo keeps the freeze.
- `slowmo` and the dilation `wdt` become host-wide effects applied to everyone (the Monolith slows every
  runner's world, which is fine) or client-side camera flourishes only. Decide per effect; the simplest is
  that both become visual-only in co-op.
- `game.time` and `timers` are host state; guests receive `time` in snapshots.

### 3.2 Input as data (`src/input.js`, `src/gamepad.js`, `src/player.js`)

- Introduce `InputFrame` (section 2.3) and make `Input` produce one per tick (`sample()`), with the gamepad
  and gyro writing into the same `Input` as they already do.
- `Player.update(dt, input, cam)` takes a duck-typed frame plus a **per-player camera frame**
  `{fwd, right, up, pitch, look, position}`. Remote players carry their own frame object in place of
  `g.cam`.
- Everything in `updatePlay` that reads `this.input` for a player action (F, G, X, V, Z, T, R, C, P,
  wheel) moves to a per-player `actions(frame)` so a guest's F press opens *their* board.

### 3.3 Player plurality (`src/main.js`, `src/player.js`, everywhere)

- `g.players: Player[]`, `g.player` stays as the **local** player so the HUD and camera code keep working;
  `g.local` as an alias for clarity. A `RemotePlayer` subclass skips weapons/side effects and is driven by
  snapshots.
- Per-player ids (`pid`), name, colour; name tags above remote runners using the existing DOM tag
  mechanism (`nameTag()` in `src/toon.js:146`, `HUD.updateTags`).
- `fx.trails` becomes per player (a trail pair per runner). `Cosmetics.update` (`cosmetics.js:214`)
  stops hard-coding `g.player`.
- `Grinder`, `Winch`, `Garage`, `Rides`, `Ragdoll` move from one instance to one per player (ragdoll is
  already per instance). The grinder's rail-catch test runs on the host for every player.

### 3.4 Ownership and damage (`src/projectiles.js`, `src/main.js`, `src/enemies.js`)

- Owner strings gain a player id: `{kind: 'player', pid}` or the string `'player:2'`. Friendly fire from
  pulse splash currently does 0.3× to yourself (`main.js:782`); choose the same for teammates or zero.
- `explode()` loops over `g.players`; hostile projectile hit tests loop over players; `trafficHit` and
  the crawler loop run per player.
- `damagePlayer(amount, cause, from)` takes a player; `die()` and `respawn()` become per player, and
  **death no longer fails the mission for the party** (see 4.8).
- `Enemies.victim()` picks a target: nearest player by default, with a per-enemy aggro memory (last
  attacker) and the existing event-object/ally/decoy overrides. Leash: a hunter is "lost" only when
  **every** player is beyond `THREAT_RANGE`. Squads spawn around the player they are hunting.
- `tryGrab` uses the carrier's cargo (`missions` per player, 3.7).

### 3.5 Multi-viewer streaming (`src/planet.js`, `src/world.js`, `src/territory.js`, `src/secrets.js`, `src/meteors.js`)

- `planet.update()` takes a list of viewers: meshes around the local camera only, **colliders** (boulders
  at LOD ≤ 1, rim rails) around every player on the host. Budget the far viewers lower.
- `world.update()`: `loc.active` is true within `ACTIVE_DIST` of any player on the host; detail/culling
  stay camera-based locally. Settlement colliders are already global.
- Territory `BUILD_R`/`DROP_R`, satellite colliders and meteor rock colliders test distance to the nearest
  player. Lair activation (`arcDist(camera, lair) < 2200`) uses the nearest player.
- Watch the host's budget: four players in four different regions means four sets of boulder colliders,
  active settlements and awake bases. Capping party size at 4 and making far-viewer colliders coarser
  (sphere-only boulders) keeps it sane. Measure with the existing perf sampler (`settings.perfSample`).

### 3.6 World state replication (`src/worldstate.js`, `src/territory.js`, `src/secrets.js`, `src/saves.js`)

- The handshake (2.2) and a `Net.worldDelta` event stream for runtime changes: den destroyed/repopulated
  (`destroyedUntil`, `core`), outpost wrecked/restocked/captured, gate opened, crystals taken
  (`c.taken` is not even saved today), residents captured, traffic wrecks, hometown buildings, council
  results, `newDawn` finales (which reload the page: everyone reloads together).
- Make flat/zone addition order explicit and serialisable.
- A `moonrunner-*` key split: world keys vs player keys (table in 1.5), so `SaveSlots` can compose a
  guest's live set from host world + guest player.

### 3.7 Missions, events, story (`src/missions.js`, `src/events.js`, `src/story.js`)

- **Missions per player:** `g.missions` becomes a map by `pid`. Offers stay per settlement and shared;
  accepting is a host-validated request so two players cannot take the same contract. The Twin Cradle
  rule applies per player. Cargo crates render on whichever runner carries them.
- **Events shared, one active per party** (section 4.4 argues for keeping it one). Starting it is a host
  request from whoever presses F. Progress checks ("within 260 m") become "any player". Payout is split
  by the rules in 4.7.
- **Story shared, host's save.** The host's `faction` commitment is the session's. Leader dialogs are
  modal for the player who opened them and nobody else; chapter steps count any player for `near()`,
  carries follow whoever picked the prop up, backup spawns behind the carrier. The Spindle: the whole
  party is teleported together when the host starts it (it swaps the planet), or it is solo-only with
  guests parked in a lobby. Recommend solo-only in the first version.
- Dialog results (`pickDialog`) that mutate world or wallet are requests to the host.

### 3.8 Entity replication

Everything in these lists needs an id, a spawn event and a snapshot row: `enemies.list`, `enemies.drops`,
`projectiles.list` (spawn plus deterministic flight is enough for most; homing needs updates),
`traffic.roadVehicles/vehicles/crawlers/walkers` (host-driven; the seeded stream cannot be trusted to
match), `civilians.list`, `alchemy.followers/wanderers/mites/loot`, `story.active.units/props`,
`events.protect`, `meteors` (zone + each rock), `decoys`, `race.racers` (during a derby anyone can watch),
`garage.active` per player, `kade`, bosses. Traffic is the heaviest; an alternative is making each
vehicle's route a pure function of `(seed, time)` so only wrecks need syncing. That is a sizeable traffic
refactor and is better left for a second pass once the first replication works.

### 3.9 UI and HUD (`src/hud.js`, `src/mapview.js`, `src/menu.js`, `index.html`)

- Party panel: mates' names, hull, cargo, distance and a direction arrow (the distress log already does
  per-entry arrows).
- Minimap and globe markers for remote players (`drawMinimap` enemy loop is the model; globe arrow at
  `mapview.js:501`).
- Menus and dialogs become non-freezing overlays (3.1). The job board handles "taken by someone else"
  refreshes.
- Main menu: HOST / JOIN, a lobby with names and colours, a join-code field, a connection status chip
  (ping, packet loss) and a "host left" screen.
- Settings: a co-op page (name, colour, friendly-fire toggle, voice? no).
- Death screen: "DOWN" with a revive timer instead of K.O. (4.8).

### 3.10 Audio

Nothing positional today; all gating is "distance to camera at the call site". Remote runners' skate hum
and jets are optional; if added, gate by distance to the local camera like `explode` does (`main.js:774`).
Music zones stay per client.

### 3.11 Dev, cheats, trailer

- Cheats (`src/cheats.js`): god mode, teleport, credits and spawn are host-only, broadcast as events.
  Decide whether a hosted session marks the save as cheated.
- Add a **network simulator** in the dev menu: artificial latency, jitter and loss on the local loop so
  prediction can be tuned without two machines.
- The trailer must keep working solo; `Net` is simply absent.

### 3.12 Tooling

- `npm test` does not exist. Add a headless determinism check for `stepSkater` (same inputs, same
  result) and a replay harness that records `InputFrame`s and host snapshots to a file for bug reports.
- A desync detector: the guest compares its predicted body with the host's each snapshot and logs the
  error histogram.

---

## 4. Balancing solo vs co-op

Everything below lists the **current** value and what needs to change, with `N` = players in the
session. The principle: co-op should make the Moon livelier, not turn enemies into sponges. Prefer more
enemies and more things happening over more HP. All multipliers should live in one table, say
`COOP[N]` in `src/config.js`, read through a helper like `g.party.scale('spawn')`, so tuning is one file.

### 4.1 Pirate pressure (`src/enemies.js`)

| Knob | Solo | Co-op proposal |
| --- | --- | --- |
| `MAX_HUNTERS = {skater: 4, rover: 2}` | global cap | per party: `skater: 4 + 2(N−1)`, `rover: 2 + (N−1)`; split as per-target budgets so one player is never chased by all of them |
| `MAX_ROAMERS = 6`, `MAX_DEN = 8` | | `6 + 2(N−1)`, `8 + 2(N−1)` |
| Cargo squad timer reset `30–50 s / max(1, hot·0.8)` | one carrier | the timer counts the party's **total hot cargo**; two carriers means twice the heat |
| Squad size `min(4, 1 + floor(hot·0.8 + rand + dark))` | | `min(4 + (N−1), …)`, plus one rover when N ≥ 3 |
| Dark-side squads 1–2 every 20–34 s | | 1–2 per **pair** of players in the dark, per-region, so a split party is hunted on both sides |
| `THREAT_RANGE = 700` leash | to P | to the **nearest** player; hunters retarget rather than vanish |
| Den guards 2 / 3 / 4 (camp / den / HQ) | | `+1 per extra player within 650 m`; rovers at least `ceil(N/2)` |
| Suppression (safe zone, ship, tutorial, story objective within 900 m) | P only | squads suppressed only if **all** players are sheltered |
| Grab: 1.1 s contact, half the skaters are grabbers, thief flees to a lair | | keep contact time; the thief gets a 2-skater escort when N ≥ 2, since a second player can chase at once; the "fence within 60 m of lair" fail is unchanged |
| Kade `KADE_BASE = 0.08 + 0.04/squad`, 300 s cooldown | | unchanged odds; truck HP 1100 → `1100·(1 + 0.4(N−1))` and the gatling alternates targets every burst |

### 4.2 Enemy HP and damage

| Unit | Solo HP | Co-op |
| --- | --- | --- |
| Pirate skater 70, rover 210 | | **unchanged**: more of them, not tougher |
| Turret 420 (ILMB 650), den pylon 900/450/260 | | `×(1 + 0.3(N−1))`: a party can burst a pylon down in seconds otherwise |
| Bosses: Warden 1300, Hammer 1500, Convoy 1200, Mega Mite 600 | | `×(1 + 0.5(N−1))` and a target-switch rule: the boss turns on whoever has dealt the most damage in the last 5 s |
| Event objects to protect: seismograph 420, escort crawler 700 | | unchanged (they are the party's shared weak point) |

Damage **to** players stays per shot (skater 7, rover 8, turret 12/15, artillery 45 in 16 m, Kade gatling
3.5 at 12/s). Two changes: turrets spread fire across targets inside range instead of all on one, and
artillery predicts each player it can see and shells the one nearest the base. Shadow Rig, void skin and
the dark-side inaccuracy multipliers remain per target.

### 4.3 Deliveries (`src/missions.js`)

- **Time limit** `ceil((dist/36 + 20 + 15·dark)/5)·5` stays. A courier is one skater regardless of N; an
  escort does not make the crate move faster.
- **Reward** `45 + dist·0.05 + hot·30 + fragile·25` (×1.4 dark, +60 clearance, Rustmoon and smuggling
  premiums, × tier pay, × uplink) stays per contract. Hot cargo is the part co-op trivialises, since an
  escort kills the squad before it reaches the carrier; raise the hot-cargo squad pressure (4.1) rather
  than cut the pay.
- **Payout split:** carrier gets `base + time bonus`; the party's pooled style (`g.style` → pool by
  session) scales as before (capped at `base`); the condition multiplier applies to all. Then an
  **escort share**: 25% of the carrier's total is paid *additionally* to each teammate who was within
  400 m of the carrier at delivery or scored a kill on a hunter during the run. Paid additionally, not
  taken from the carrier, so nobody is punished for bringing friends; the extra money is the co-op bonus
  and should be tuned against 4.7.
- **Reputation** per delivery (3, premium 4, +1 condition) goes to the party's shared standing once per
  contract, not once per player (see 4.9).
- **Twin Cradle** stays per player. A party of 4 with cradles can run 8 contracts at once; the board
  offers (3–5 per settlement) are the natural limit.
- Jostle `amount·0.012·fragile·soften` and hit damage `dmg·0.004·(0.5+fragile)` unchanged.

### 4.4 Events (`src/events.js`)

Keep **one active event per party**. Two simultaneous events would need the per-faction cooldowns,
protect lists and fluid sims duplicated and would scatter the party; the point of co-op is doing the
event together. Scale the inside of the event:

| Event | Solo | Co-op |
| --- | --- | --- |
| Seismic survey: 45 s record, wave of 2 every 18 s | | wave `2 + (N−1)` every `18 − 2(N−1)` s |
| Escort: moves only while P within 260 m, waves 2–3 every 24 s | | moves while **any** player is within 260 m; waves `+1 per extra player`; crawler HP unchanged |
| Supply pods / relay sweep: 4 objects in 115 s | split 4 ways this is trivial | `4 + 2(N−1)` objects, time `115 + 10(N−1)` |
| Black lake sample: one tube, fill 2.5 s, fails below 25% | | one tube per party (the fluid sim belongs to the carrier); teammates can scoop a second tube as insurance for half pay |
| Clear den / strike: pylon or 3 turrets | | pylon/turret HP ×(1 + 0.3(N−1)); guard waves +1 |
| Raid (Rustmoon): `min(turrets, hq?3:2)`, ILMB 6 | | unchanged counts; base reinforcement waves +1 |
| Pirate wreck (one time): `dist·2/30 + 60` s | | unchanged; the swear-in choice is the **host's** (it changes the save's whole alignment). Guests get a prompt explaining that |
| Posting cadence: first 40–60 s, then 45–75 s; `OPEN_LIFETIME = 420` | | first `40–60 s`, then `35–60 s`: a party clears events faster |
| Payout `round(reward·0.5·max(0.8, payMult)/10)·10`, +8 rep | | everyone present within 500 m at completion is paid the full amount **once each**? No: that quadruples the economy. Pay the full amount to the party and split it `60 / 40 / … ` by contribution (kills + time within range), minimum 15% each. Rep +8 once |

### 4.5 Story chapters (`src/story.js`)

- `REQ = [10, 15, 25, 35, 45]` reputation gates use the shared standing.
- Capture: hold radius 55 m, 20–30 s hold. Any player inside holds; two inside do **not** hold faster.
  Guards 2 every 14 s → `2 + (N−1)`.
- Defend: waves `2 + floor(t/40)` every 16 s → `2 + floor(t/40) + (N−1)` every `16 − 2(N−1)` s.
- Assault: waves of 3/4 → `+1 per extra player`, reinforcements for your allies only when fewer than 3
  allies **and** fewer than N players are alive near the post.
- Gates (the race chapter): time `total/pace + 12 + 3/gate` is per player; the chapter completes when any
  player finishes, best time shown.
- Chase carry: the carrier is whoever picked up; if they die the prop drops where they fell (today it is
  simply lost with the chapter).
- Finales reshape the Moon and reload the page: all clients reload together. The host's save takes the
  finale; guests see the bulletin.

### 4.6 Bases, zones, territory (`src/enemies.js`, `src/territory.js`)

- Restricted zone clock (hostile after 4 s, artillery after 9 s, stand-down 8 s after leaving) runs **per
  player**: a guest wandering into Bastion Vostok-9 does not get the carrier shot. Clearance from a
  contract extends to teammates within 120 m of the carrier while the carrier is inside, so an escort can
  come in.
- Civilian-harm alert (75 s) and `aggro` (25 s) are base-wide; one player shooting a town makes it hostile
  to all. That is correct and is a natural co-op tension ("don't").
- Turret respawn 60 s unchanged; base turret counts are fixed by `loc.defense`, so bases get the HP
  multiplier from 4.2 instead of extra guns.
- Territory raids: `LOOT_CD = 240` s per outpost is shared, `LOOT_REP = 2` cost is paid by the shared
  standing once. Depot credits 150–300 go to whoever pressed F; loot items are physical drops anyone can
  jar, so they are already contestable and fine.
- Patrols: max 4 within 1000 m → `4 + (N−1)`, each tied to the nearest player's region.

### 4.7 Economy

| Source | Solo | Co-op |
| --- | --- | --- |
| Bounties 25 / 45 (×1.5 dark) | to P | to the killer; assists (damage > 30% in the last 6 s) get 50% |
| Den destroyed 150 (HQ 350), Mega Mite 400, Kade 800 | | paid once, split evenly among players within 600 m |
| Delivery and event pay | | per 4.3 and 4.4 |
| Death fee `min(credits, 100)`, recall `RECALL_COST = 100` | | per player, unchanged |
| Shop `cost·(level+1)` | one wallet | per player wallet and per player upgrades; each player buys their own gear |
| Outpost modules 600–1500, market earns 40/min capped 800 | world | host pays (it is the host's save); market bank pays the host |
| Casino: chips, debt, `JACKPOT_SEED = 2500`, `JACKPOT_CUT = 0.03`, interest +10% per 10 real minutes | one `stats.casino` | chips and debt per player; **jackpot shared** (everyone feeds it, one wins); interest clock per player |
| Chimera Downs: purse by class, 12% entry, bets 50/200/500 | | per player bets on the shared card; purses unchanged |

Expect co-op income per player to land around 1.3–1.5× solo for a competent pair because of the escort
share and bounty assists. That is intended (it is more fun to be paid together), but the upgrade ladder
is tuned for solo money, so watch for players maxing the shop in half the time and consider scaling
shop prices by `1 + 0.15(N−1)` only for purchases made while in a session.

### 4.8 Deaths and failure

Solo death is harsh by design: the active contract fails ("the cargo is lost"), the event fails, the story
chapter fails, −100 credits, respawn at home or a clinic (`main.js:708-766`). Co-op needs a softer rule or
one unlucky landing wipes the whole party's run:

- **Downed state (30 s)**: the dead player's ragdoll stays; a teammate within 4 m holds F for 3 s to
  revive at 40% hull. After 30 s unrevived, or at any time by choice, they **redeploy** at the party's
  nearest safe settlement (not home) for the usual fee. Pirates keep shooting the downed body? No: they
  ignore it and go for the others.
- **Cargo drops instead of being lost**: set `cargoState = 'dropped'` at the death spot (the mechanic
  already exists for thieves), teammates can pick it up within the contract's remaining time. Jostle
  damage from the fall applies.
- **Events and story steps fail only when all players are down** at once, or when the protect object
  dies.
- Respawning today also calls `enemies.clearPirates()` and `forgive()`, wiping every hunter and
  resetting base aggro. In co-op that only happens when the whole party is down; a single redeploy clears
  nothing.

### 4.9 Reputation (shared or per player?)

Reputation is "what the factions think of the runner"; turrets, clearance and shops read it. Options:

1. **Shared crew standing** (recommended). One `values` object owned by the host's save, gains from any
   player, paid once per contract/event (not per participant). Simple, keeps bases' hostility coherent
   (a base cannot be friendly to one skater and shoot the one beside them), and Rustmoon alignment is a
   save-level fact already. Guests leave with their own per-player progression but not the standing.
   Downside: a guest's Vostok-friendly solo save means nothing in a Daedalus host's world; show the
   session standing on the Reputation Log with a note.
2. Per player: the host's values decide world hostility, guests' values decide their own pay and
   purchase rights. Two numbers for the same faction on one screen is confusing. Not recommended.

The war rule (a gain with Vostok costs Daedalus `ceil(amount/2)`) and the tier pay multipliers
(WARY 0.8 … HONORED 2.4) are unchanged under option 1.

### 4.10 Things that get *easier* in co-op and need no scaling

Skating, tricks and style; grinds; the winch; vehicles (each player calls their own; the Mule's
`cargoSafe` protects only its driver's crate); the casino games; wardrobe; the tutorial drone (runs for
the host only, or for a brand-new guest as a local overlay); meteor showers (the zone picks a site 1.2–3.5
km from a **random player** instead of P; rocks fall near whichever players are inside).

### 4.11 Latency-sensitive mechanics to protect

These feel broken at 100 ms unless they are predicted locally or made lenient:

- Rail catch on crater lips (`≤ 60°` off the line) and snake-rock tips: predict on the client,
  host confirms; widen the catch window by `latency·speed` metres on the host.
- The pirate grab (1.1 s contact, decay 0.6/s): host-only and fine.
- Dive catch within 10 m and the magnetic buffer (0.6 m + 2% speed): part of `stepSkater`, predicted.
- Landing on vehicle decks and freighters (`c.platform`): the deck position must be replicated with
  velocity so the client's prediction has the same platform; otherwise snap-and-pop on every bus landing.
- Winch to a moving vehicle: host-authoritative, client shows the cable to the replicated target.
- Weapon hits: client fires immediately (visual), host validates with a short rewind of the target's
  position (lag compensation) for the Rail Lance; the homing Pulse Spinner needs no compensation.

---

## 5. Phased plan

Each phase ships on its own; phases 0 and 1 are pure single-player refactors.

| Phase | Work | Size (one experienced dev) | Ships solo? |
| --- | --- | --- | --- |
| **0. Groundwork** | Fixed tick + render split (3.1). `InputFrame` and per-player camera frame (3.2). `players[]` with `g.player` as local (3.3). Owner ids and per-player damage/explode/projectile loops (3.4). Multi-viewer streaming API with a single viewer passed today (3.5). Determinism test for `stepSkater`, replay recorder (3.12). | 3–4 weeks | yes, no behaviour change |
| **1. Second runner, no network** | `RemotePlayer` driven by a recorded `InputFrame` stream (a ghost of your last run). Name tags, minimap/globe markers, party panel. Per-player grinder/winch/garage/trails. Menus become non-freezing overlays behind a flag. | 2–3 weeks | yes, as a "ghost replay" feature |
| **2. Transport and handshake** | `Net` module: WebRTC with copy-paste signaling first, then a room code service. Version gate. World handshake + storage composition in `SaveSlots` (3.6). Lobby UI. | 2–3 weeks | no |
| **3. Replication** | Snapshots and events for players, enemies, projectiles, drops, bases, missions, events, story, territory, alchemy entities, meteors, Kade, bosses (3.7, 3.8). Client prediction and reconciliation. Network simulator in the dev menu. | 5–7 weeks | no |
| **4. Traffic and civilians** | Host-driven traffic replication or the `(seed, time)` route refactor; civilians; casino/derby spectating. | 2–3 weeks | partly |
| **5. Co-op rules and balance** | Downed/revive, cargo drop on death, payout splits, `COOP[N]` table and every scaling in section 4, shared standing, per-player wallets and casino, shop scaling. | 3–4 weeks + playtesting | no |
| **6. Hardening** | Reconnect, host migration (probably "host leaves, session ends" in v1), cheat policy, bandwidth and host CPU profiling with 4 players spread across the Moon, save corruption guards (a guest's slot must never receive host world keys permanently). | 2–3 weeks | no |

Total: roughly **5 to 6 months** of focused work to a playable, balanced 2–4 player co-op, with the first
two months producing single-player-safe improvements (fixed tick, replay ghosts, cleaner ownership).

---

## 6. Decisions the owner has to make

1. **Shared standing vs per-player reputation** (4.9). Recommendation: shared.
2. **Whose story is it?** Host's save owns faction commitment, finales, territory, hometown. Guests get
   nothing permanent from story progress except what they carry (credits, gear, rep? no). Alternative:
   guests also get chapter rewards (`g.upgrades`, tech) when present at completion. Recommendation: yes,
   guests get the gear rewards but not the world changes.
3. **Menus freeze the world in solo.** Keep that in solo, overlays in co-op? Or move solo to overlays too
   (simpler code, slight change of feel: the job board no longer pauses pirates outside the walls).
   Recommendation: overlays in both, but keep **pause** as a real freeze in solo.
4. **The Spindle and the casino/derby camera takeovers.** Solo-only sections in v1 (guests see "the host
   is on the Spindle" and wait, or the host cannot start it with guests connected)?
5. **Friendly fire** from pulse splash and the mortar: off, or the 0.3× self rule applied to teammates?
6. **Host leaves = session ends** in v1, or attempt host migration (needs full state serialisation; a lot
   of work, and the migrating host's save would need the world keys written into it).
7. **Signaling infrastructure**: zero (copy-paste codes), a tiny hosted relay, or an Electron LAN server.
8. **Party size cap**: 2, 3 or 4. Everything above assumes 4; 2 removes most of the budget worries.
9. **Cheats in a session**: host-only, flagged on the save, or disabled.
10. **Guest fog of war**: each guest's own `moonrunner-explore-v1`, or union the party's exploration into
    everyone's map at session end.

---

## Appendix A: singletons and global state to break up

| Where | What | Becomes |
| --- | --- | --- |
| `main.js:189` `this.cam` | one camera frame | per player frame; local one drives the camera |
| `main.js:193` `this.player` | one `Player` | `players[]`, `local` |
| `main.js:209-211` `credits`, `stats`, `upgrades` | one wallet | per player, in `Player` or a `Profile` |
| `main.js:81` `FROZEN_STATES` | world freeze | local input freeze in co-op |
| `main.js:234` `slowmo`, `monolith.js:12` `DILATE_RATE` | global time scale | host effect or visual only |
| `main.js:1095` `planet.update(camera.position)` | one viewer | viewer list |
| `world.js:1612` `loc.active`, `loc.camDist` | camera distance | nearest player (host), camera (client) |
| `enemies.js` `victim()`, `targetFor()`, leash, spawn | P | target selection with aggro |
| `projectiles.js:85`, `main.js:768` | hit only P | loop players |
| `missions.js` `active`, `extra`, `cargoState` | one contract | per player |
| `events.js:31` `active`, `carry` on `g.player.model.cargoSlot` | one event | one per party, carrier by pid |
| `story.js` `active`, `near(P)` | one chapter | shared, any player |
| `rails.js:25` `Grinder.active` | one grind | per player |
| `winch.js` | one cable | per player |
| `vehicles.js:22` `Garage.active`, `P.vehicle` | one vehicle | per player |
| `rides.js` `ride`, `P.seat` | one seat | per player |
| `fx.js:32` `trails[2]` | two ribbons | two per player |
| `cosmetics.js:214` | `g.player` | per runner |
| `alchemy.js:776` buffs → `P.params` | one params | per player params |
| `recall.js`, `casinoGames.js:332`, `race.js:936` | take `g.camera`, `g.state` | local-only states |
| `spindle.js:386-393` | swap `g.planet`, `GRAV.axis` | solo-only or whole-party |
| `secrets.js:409, 557` satellite clock | local, never saved | host clock in snapshots |
| `traffic.js:1466` `globalThis.game` | global handle | fine, but all traffic state is host-owned |

## Appendix B: `Math.random` that must become host-only or seeded

Gameplay-affecting (host decides, broadcasts): `enemies.js` (spawn kind, orbit direction, grabber flag,
fire cooldowns, aim spread), `events.js` (site, cadence), `meteors.js` (everything), `story.js` (spawn
spots, Kade odds), `territory.js` (loot amounts, `found()` seed), `alchemy.js` (loot landing, mite
behaviour, reactor outcomes), `monolith.js:17` (spell pick), `hometown.js:353` (votes), `race.js`,
`casino.js`/`casinoGames.js` (results), `models.js:640` (resident looks, including the Vrill flag),
`world.js:797, 1976` (NPC wander), `ragdoll.js:85` (launch).

Cosmetic (leave alone): stars, sparks, pop text choice, camera shake, reactor jitter, rocket flame, fx.

## Appendix C: numbers worth knowing

| | |
| --- | --- |
| Moon radius / circumference | 3600 m / ~22.6 km |
| Terrain chunks | 1,536 (6 faces × 16 × 16), ~354 m each, 5 LODs |
| Boulder collider radius around a viewer | ~260 m (LOD ≤ 1) |
| Settlement active radius | 2,600 m |
| Territory outposts | 120 procedural, spawn 900 m / drop 1,150 m |
| Lair activation | 2,200 m from camera |
| Hunter leash | 700 m (den guards 1,300 m) |
| Event popup range | 3,500 m (`EVENT_RANGE`) |
| Player substep / pirate substep / ragdoll step | 1/120 s / 1/60 s / 1/120 s |
| Frame dt cap | 0.05 s |
| Snapshot estimate, 4 players + 20 enemies at 20 Hz | ~15 KB/s per guest |
