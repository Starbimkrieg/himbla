# Winch hand-off: the cable and structures (Lucky Crater Casino sign post)

For a fresh session picking up the Hitch-Line winch (`src/winch.js`). Read `CLAUDE.md` first (conventions: CHANGELOG entry with every
commit, the source map in docs/reference.md in step, no PRs unless asked, commit and push to the branch the session names, which was
`claude/magical-brown-8csbeq`). This note says what the users reported, what was found and changed, what they decided, what is still open,
and how to test.

## What was reported

1. (Done) The cable snagged too often, then a small teleport when it bumped the player round an edge. Fixed over several commits
   (`5bb3d5f` .. `93b337e`); "feels much, much better".
2. (Done, commit `4c75046`) **Targeting:** the reticle should outweigh distance. See "Targeting" below.
3. **The cable passes through a structure that is not its target.** In the user's words: "if I were to winch to the center of the poker chip
   fountain at Lucky Crater Casino and wrap myself around the sign, the cable would just phase through the sign post." A still and a 13 s
   recording (not in the repo) show the player on the road by the casino sign, the cable running from them to the right-hand post and on to
   the fountain, drawn through the post. The reporter ("Dev 1") on a second look: default skates, 60 Hz monitor, the post is the "Lucky
   Crater Casino" sign beside the ring road; he fires at the chip at the middle of the fountain and wraps the cable round the post as he
   moves left. The second user ("Delta") has a 240 Hz monitor and tests the high end.

## The sign (taken out of the game since)

The casino pass removed the pylon sign ("LUCKY CRATER") from the game after this was reported, so the posts the cable was wound round no longer
exist in play. The fix is not about that sign: any slim box the cable meets is handled the same way. `tools/winch-ride.mjs` stands the sign's
colliders in again (same place, same half extents) when the game has none, so the rides stay the ones that showed the bugs.

The sign was built by `dressCasinoLot` in `src/settlements.js` ("the pylon sign out by the road"; see commit `e2d4c54` for the code). At the
casino's local (26, 118), turned -0.35 rad: two posts
(`k.box(1.2, 23, 1.2 ...)` with colliders `k.solid(0.6, 11.5, 0.6, ...)`: half extents 0.6 x 11.5 x 0.6, at +-6.6 m from the sign's middle)
and a marquee/board between them (collider half extents 6.2 x 5.6 x 0.7, centre 10.2 + 5.6 = 15.8 m up). Under the board (y < 10 m) the
gap between the posts is open; people and the cable can pass through it. The chip fountain is at the casino's local (0, 98), the plaza's
middle (`FZ = 98`, `PR = 17`). The ring road runs at radius 142 about the casino's origin.

## What was found and fixed

1. **`f31fe59`: the cable gave up on a post after one lap.** In `tendWrapsIn` the cable gave up on a structure (`o.ignore.add(hit.c)`: from
   then on `blocker()` skips it, so the cable is drawn straight through) once `o.bends.get(hit.c) >= 4` for a box. That count was cumulative
   over the ride and never went down when a bend unwound, and four is exactly one lap of a post's corners. Now a box is counted by the bend
   points it holds at that moment (`BOX_BENDS = 12`, three laps). Without that fix, 14 of the 56 ring-road rides below give up on a post
   and the cable runs through it for up to 20 frames in a row, which is the kind of pass-through the video shows (the video is most likely
   from a build older than this fix; that was not confirmed).
2. **The fling and the snap** (the previous hand-off's open item 1). Not the "path length jumps when a bend is added" guess: the length
   correction at the end of `update` moved the body along the *eased* pull direction (`o.dirP`, eased over about 80 ms so the pull does not
   flip when a bend is added or let go) instead of along the real first leg. After a bend is added the eased direction can trail the real one
   by more than a quarter turn, a step along it then *lengthens* the path, and the error grew about 1.2 times a frame until the line
   snapped at `RANGE * 1.6`. The "fifth bend" is simply where the trailing angle crosses 90 degrees. Now the position step runs along the real
   legs, capped at each leg's length (never past the bend), so a step can only shorten the path. The eased direction still drives the pull,
   the strain and the velocity.
3. **The first-bend flash** (the previous hand-off's open item 2). The wraps were checked 20 times a second while the cable had no bends, so a player running at a
   post at 15 m/s covered 0.75 m between checks and the cable ran through the post for 1 to 3 frames before the first bend. Now the wraps
   are checked every frame, up to `WRAP_STEPS` (4) steps a frame (a post and the board edge it overlaps, a second post); the 0.2 s unwrap
   hold counts real time, once. The let-go branch also rebuilds the path now (the rest of that frame ran on a stale, longer path), and an
   arc that still runs into what it wraps is refused (it piled up bends when the hook was buried in the structure).
4. The dead `o.snagged` code and the stale 20 Hz comments are gone.

The fling fix and the every-frame check must stay together: the every-frame check alone raised the runaway rate in the tests.

## What the users decided

- The change is described as fixing the fling and the first-bend flash, not as "the cable always bends and never goes through": it still
  passes through thin things (`thin()`), colliders with a bounding radius under 4 m (`WRAP_MIN_R`), moving platforms (ships, land-trains,
  SAT-7), terrain, anything that is not a structure collider (hover-cars, buses, rovers), a chord between two points of one arc, the first and
  last 0.35 m of a leg and the last 2.5 m of the leg to the hook, and anything it gives up on.
- **No snap** when the cable cannot be bent round something (an earlier remark favoured it; `CHANGELOG.md` records that the line was made to
  stop snagging, and the answer now is no).
- Winding **several times round one structure** is wanted wherever it makes sense.
- **Thin things and targeting range stay as they are.**
- Winching to the fountain is **meant to arrive** at the hook, and the physics should also let the cable **wrap round terrain** and structures
  that collide with it.
- Dev 1 tests at 60 Hz, Delta at 240 Hz. No human has played a hover-car swing, bus, land-train, ship tow, roof climb or the fountain run with
  the fix.

## Still open, or left as it is, in the order to take them

1. **Giving up still means passing through** (no snap, decided). The caps: 12 bends on a box, `WRAP_MAX = 5` structures, `WRAP_PTS = 40`
   points, no free place to bend. Idea: raise them, and at the limit hold the line taut on the last bend rather than draw it through. Not
   built. A dev-only counter of how often it happens in play would say how much it matters.
2. **Round structures** (cylinders and spheres, counted by the arcs laid over the whole ride) are given up on after 2 arcs
   (`o.bends >= 2`). Wanted: wound whole, several laps, where that makes sense (a tower, the fountain's column). A previous experiment (3 m hook
   exception, 31 bend points in 0.07 s when the hook is buried in the structure) is the thing to avoid.
3. **Arriving at the hook.** Rides to the fountain end "The line slipped!" 8 to 13 m short (30 of 31 default rides, with and without the fix):
   the 1.05 m x 9.8 m basin (`settlements.js`, the fountain) stops the skater, the drum runs ahead, and the strain rule slips the line after
   2.5 s. A hypothesis: no counterfactual was run. A step-assist or a hook point on the rim would be a separate change. The fix made arrival
   at the basin slightly worse in the measurements (the old eased direction happened to give lift over the basin).
4. **Terrain.** The wrap logic only bends round structure colliders (`this.game.colliders`); terrain is not considered at all. Needs a design
   first (sampling the height field along each leg, a bend at the crest).
5. Thin things (`thin(c)`: box with any half extent under 0.6, cylinder radius under 1.6, sphere under 2) are skipped by `blocker()`; the sign
   posts are exactly 0.6 so `0.6 < 0.6` is false and they count as not thin, a knife edge. If they ever did count as thin the cable would
   never bend round them, so the harness refuses to start when it finds the posts thin. Leave as is.
6. Targeting range: a target whose reticle-nearest point is beyond `RANGE` (120 m) is dropped even if a lower part of it is in range. Not
   changed.
7. Known holes in the fix (the figures are from the prototypes and hand calculations, not re-measured on the final file): at 20 fps a heavy tow that bends round something can still step 5 to 10 m; the eased pull can point more than
   90 degrees off the cable for about 0.1 s after some bend releases (minimum cosine -0.79 once in 821 runs of the V1 prototype, no harm measured); a hand
   moving over 30 m/s on a 20 fps hitch can tunnel a post (hand-calculated, not run). Also, the bend nearest you is let go at once only
   when you are within 2.5 m of it (`releaseFirst`); the regular let-go switches from fat 0.1 to 0.5 plus a 0.2 s hold at the same distance. A
   line that clears at 2.43 to 2.53 m can be stepped over by one 60 Hz frame and caught by a 240 Hz one, so a passed bend can linger for 0.3 s
   at 60 Hz and 0.08 s at 240 Hz (pre-existing; the every-frame check made it rarer, not absent). A hand circling a post at about 2.2 m
   can wind 12 bends at 60 Hz and 1 at 240 Hz in a stand-in, but that needs more turning than the skates give. A continuous near-range test
   would remove it.

## Targeting (done, commit `4c75046`) in brief

`pick()` scores candidates: a surface under the reticle (`looked`) scores `10 - dist / RANGE` (+0.6 if it is the current marker); one off the
reticle scores `6 - acos(cos) * AIM_W - dist / RANGE * 0.3` with `AIM_W = 12`. A structure the reticle misses gets the point on it nearest
the reticle's line (four rounds of projecting between the line and the shape), not the point nearest the eye.

## Code map (`src/winch.js`)

- Constants at the top: `RANGE`, `PULL_ACC`, `LEAD`, `AIM_W`, `WRAP_MAX`, `WRAP_PTS`, `BOX_BENDS`, `WRAP_MIN_R`, `WRAP_STEPS`, `WRAP_MARGIN`,
  `UNWRAP_FAT`, `UNWRAP_HOLD`, `STRAIN_MAX`.
- `thin(c)`; `blocker(cols, a, b, skip, only, endSkip)` (skips `_ignore`, platforms, `br < WRAP_MIN_R`, thin); `pointFree`; `clearFat`;
  `wrapCandidates` (box edges / rims); `arcPoints` (cylinders, spheres).
- `pick()`; `buildPath` (hand, bends, hook into `this.path`); `tendWraps` / `tendWrapsIn` (letting go, then bending, then the ignore caps);
  `releaseFirst` (the bend nearest you, every frame, no hold); `update(dt, held)` (path, pull, strain, slip, the `RANGE * 1.6` snap, and the
  position correction along the real legs, `_gUp` / `_gUt`).
- Per-ride state on the handle `o`: `wraps` (bend points), `grp` (the collider each belongs to), `free` (how long each has been clear), `bends`
  (cumulative count per collider; only cylinders and spheres still use it), `ignore` (colliders the cable passes through), `dirP` / `dirT`
  (the eased pull directions).

## Testing: `tools/winch-ride.mjs`

Dev only. It starts the real game headless, adds the old sign's colliders if the game has none, teleports the real player onto the ground in front of the casino, aims the real camera at the
fountain, presses Z so that `powers.js` fires the real winch, and steps the whole game at a fixed dt. The winch runs after the player's
physics as in play (gravity, ground, collision shell, skates); only rendering, terrain streaming and by default traffic are stubbed. The winch
is limited to structures (no vehicle is hooked: a clean gate says nothing about towing one), and the `@pin` and ring rides replace `pick()`
with a fixed hook on a fountain column (the stem, r 1.7 m, 8 m up, or the pedestal, r 2.7 m, 3 m up) instead of what the reticle is on. Runs
are repeatable to the last digit. Its header documents the scenario names (`coast`, `toward`, `line`, `orbit`, `ring` policies, ranges, options),
the environment variables (frame rate `DT`, `JITTER`, `SECS`, `OUT`, `CSV`) and the output columns.

```bash
(nohup npx vite --port 5199 --host 127.0.0.1 > /tmp/vite5199.log 2>&1 &)   # the dev server (wait for it to answer)
node tools/winch-ride.mjs --gate ring       # the 56 ring-road rides, about 2.5 min on a warm machine: run this after any change to winch.js
node tools/winch-ride.mjs --gate            # the default 31 rides (coast / run at / circle the posts)
node tools/winch-ride.mjs coast-60-140      # one ride, one line
DT=0.00416667 node tools/winch-ride.mjs --gate ring    # the same at 240 Hz
```

`--gate` prints a verdict and exits 1 if any ride was flung (a winch step over 2 m in a frame), ended "The line snapped!", made the cable give
up on a sign post, or had the cable inside a post for more than 2 frames in a row. Measured on the ring rides (real player, 60 Hz, hook on the
fountain column):

| Winch code | Gave up on a post | Longest cable-in-post run | Snapped | Flung |
|---|---|---|---|---|
| before this change | 0 | 3 frames | 3 | 4 |
| `f31fe59` reverted | 14 | 20 frames | 0 | 1 |
| this change | 0 | 0 frames | 0 | 0 |

With this change 43 of the 56 rides arrive and hold within 2.4 m of the hook and 13 end "The line slipped!" 2.7 to 39.5 m short (the basin,
open item 3, for the ones near the fountain; the farther ones were not looked into). 41 of the 56 bend the cable round a post (at most 5 bends on
one). Slipping short is not a failure of the gate, which judges the cable, not the arrival.
The default 31 rides are also clean (0 flung, 0 snapped, 0 frames of cable inside a post, including the old repro's two problem spots 60,140 and
66,145), and 12 of the ring rides (every fifth) are clean at 240 Hz (`DT=0.00416667`). Not run: a full 144 Hz or 240 Hz grid, 30 fps, jitter.

Tips:

- The headless game needs the player to be in `state === 'play'`: the script presses Enter until it is. `window.game` exists in the dev build only.
- One headless browser at a time on the whole machine: several together starve each other and the page dies ("Target page, context or browser
  has been closed"). The script starts exactly one and closes it. Don't `pkill -f <name>` from Bash (it matches the shell's own command line);
  filter `ps -eo pid,comm,args` by `comm`.
- `g.colliders.query(p, r, out)` returns colliders from a grid by cell, so filter by `c.mid.distanceTo(p)` yourself.
- Under swiftshader the game's start is slow on a cold or slow machine: the first Enter at the title reloads the page and the second
  starts the game, each load builds the whole world, and the first frames compile every shader in software. `VERBOSE=1` logs the steps,
  `BOOT_TIMEOUT` (seconds, default 300) is the wait for each, `VIEWPORT=480x300` makes the real frames before the harness takes over cheaper.
  A ride is about 2.5 s of wall time on a fast machine.

## Done when

The user can winch to the chip fountain from the road, run past and round a post (the harness's stand-in for the old sign's), and the cable
bends round it (never through it) wherever it can bend at all, lets go as the line clears, and never throws the player. `node tools/winch-ride.mjs --gate ring`
is clean. The open items above are separate changes, each proposed to the users before it is built.
