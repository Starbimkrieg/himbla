# Zbornak's spider tank: ARACHNE

The end-game reward. Win the Triple Crown, bring the champion to Dr. Zbornak, and he keeps it "for research"; in return he hands over
the walking tank he has been building round a mini antimatter reactor. It walks on eight armoured legs by the same IK the mites and
chimeras use (`src/gait.js`), to a spider's rhythm: a ripple walking, two sets of four running, the legs never crossing. It climbs
anything up to 13 m, its body gliding up and over and its legs stepping after it. Past 25 m/s it closes up by itself into a hovering bead (overdrive; never while it climbs), and when it
slows under 21 m/s the legs come back out and stand it up. It fires a reactor beam from a central cannon. The runner rides inside, out of sight.

Built in Blender (`tools/blender/build_spidertank.py` -> `src/assets/spidertank.glb`, 12.0k triangles, 312 KB) and driven by
`src/spidertank.js`. Revision 4: of the two first proposals the white one (A) was kept, bulkier and more mechanical, without its
abdomen; B was dropped. Round three made it close up by itself, stride longer, grip and climb, and drive its rams, and took the fins
off. Round four smoothed its run, solved its legs exactly, kept its feet below its hips and its hull and legs out of what it walks
among, and made the bead float higher on glowing jet trails. Not in the game yet.

- **The lab:** `npm run dev`, then `/tools/spidertank-lab.html`. It drives itself round a circle of crates and low walls: walking,
  running, closing up past 25 m/s and skimming, opening out, stopping to fire the beam. Press a key to drive it: W ahead, S back (to 18 m/s),
  A/D turn, hold SPACE for the beam. **Look round** with the mouse: drag to turn the camera round the tank, right-drag (or shift-drag) to slide
  what it looks at, wheel to zoom, H to stop it turning with the tank, R or double-click to put it back. **P** pauses, **.** steps a
  frame, **[ ]** slow the clock down to a tenth and back. `&demo=walk|climb|wall|run|skim|fold|beam` loops one part (`wall` walks
  down the test lane: a 2.3 m crate, a 3.2 m step, a 4.6 m block, a 9.5 m block and a 12 m wall it climbs onto and down off (all in about 70 s at 3 m/s), then a 16 m
  wall it gets as high up as it can and stops at); `&speed=` sets it; the blocks round the circle are platforms to climb (3 to 13 m) and walls;
  `&cam=chase|side|front|rear|top|orbit` is where the camera starts. **F9** saves the flight (every tick's time and input since
  the page loaded, and the last 15 s of the tank's state); drop the file on the lab page to replay it frame for frame (pause, slow and
  look round as it plays; `&at=s` jumps in). `?sweep` (or `?sweep=quick`, about a minute) drives fresh tanks, unseen, straight at every
  box from 8 sides at a walk and a run, parks them beside the tall ones, sends them across three gaps between pairs of platforms (3,
  5 and 7 m) and turns them on the spot on tops, then tables each: over it, round it or stopped against what it should do (over
  anything up to `tank.climbMax`), its hull and leg bones in things, frames with a leg through the hull, a foot across the body's
  middle or a planted foot over nothing, the pose's jerk, how long it took, and the steps and pose change of its last 6 s
  (shuffling); each row's link (`?case=...`) replays it in the lab.
- **The Asset Row**, Ground Vehicles: walking, and closed up.

![Walking](walk.jpg)

![Walking and closed up, from the side, above and ahead](views.jpg)

## The look

- **A faceted, armoured bead**, 4.6 m wide and 2.8 m tall (7.5 m long closed up, cannon to tail jet): sixteen facets round, off-white plates over a dark frame (the lab's colours),
  the lower plates a pale grey, the frame showing in the seams between them and as a belt round the waist where the legs bolt on.
- **The nose:** an octagonal armoured face with a visor slit across it; the beam cannon below it, in a steel collar.
- **The reactor** glows violet through a grilled window in the spine, and flares as the beam charges.
- **Zbornak's green** only as LEDs: short strips along the belt, three dots either side of the visor, two on each thigh. Small enough
  not to read as Rustmoon's livery.
- **Eight angular legs:** octagonal struts, flat-faceted shields with a ridge down each (thigh and shin), drums at the joints, an
  angular hoof-claw, and two working hydraulic rams on each: one from the hull to the thigh, one from the thigh to the shin. Each is a
  barrel and a rod that aim at each other every frame (`ram`/`rod` pivots), so they slide in and out as the leg moves and go in with
  it when it folds. Standing, 11.9 m across the feet, 10.3 m long and 4.8 m tall, the hips 3.1 m up.

## Closing up (overdrive)

![Closing up: the legs zigzag in against the hull, slide in through their ports, the hatches shut, the jets come out](fold.jpg)

It closes up by itself at 25 m/s, over 1.3 s, in stages, and opens out again under 21 m/s (the gap keeps it from flickering between
the two). It won't start to while it is climbing or gripping something (a foot on a face or up on something, the hull tilted or
hoisted: `tank.climbing`), so a climb never turns into a bead on the wall; slowing down, it runs backwards:

1. **The legs zigzag** against the hull, toward its middle (thigh along the hull, shin folded back, foot forward again).
2. **They slide in** through their hip ports, collars and all, into the hull.
3. **The hatches shut:** each port's door, stowed inside, swings out flush with the hull.
4. Meanwhile **the cannon draws back** into the nose, and three jets under the belly and the tail jet come out. The hull floats
   1.5 m off the ground on them, bobbing, banking into its turns, and lifting over what it skims across (up to 2.5 m more). Each jet
   leaves a glowing trail in the world, white-hot at the nozzle and violet as it thins (`tank.fx`, put beside the tank's root).

![Skimming: floating on its jets, trails behind](skim.jpg)

Every moving piece carries its own share of the fold in the model (`fold`, `foldPos`, `foldScale` and their spans), so the timing is
tuned in Blender.

## Walking and the beam

- **Its legs are solved exactly** (`makeGait`'s `pole`): each three-bone leg bends its knee up, as built, in the upright plane
  through its hip and foot, the ankle folding as the foot comes in, so a leg never flips from one shape to another.
- **A spider's rhythm** (`wave`): one beat for all eight legs, each at its own place in it. Walking, a **ripple** runs up each side
  from the back leg to the front, a quarter of a stride apart, the two sides half a stride out (three quarters of each stride a foot
  is down, so six or seven feet hold it at once). From 3.8 m/s to 9 m/s it blends into the **run**: two sets of four (left front,
  right second, left third, right back; then the others) that take turns, half the stride down, a little less flat out. Turning on
  the spot drives the same beat.
- **The legs never cross:** each side's reach, from its front leg's furthest ahead to its back leg's furthest behind, is cut into four
  even lanes along the body with a gap between them, and each foot lands in, stands in and swings within its own (a stepping foot is
  carried with the body, so it only ever goes forward in its lane; one carried out of it by a turn steps at once). The front legs
  reach ahead and the back ones behind, as a spider's do. Measured from above: no two neighbours cross at any pace, turning on the
  spot, circling or backing up. The cost is the stride: 2.96 m at most, so 1 step a second per leg walking at 3 m/s, 2 at 12 m/s, 3 at
  18 and nearly 4 at 24, just under where it closes up. Feet stay planted to the centimetre.
- **It climbs up to 13 m. The body leads and the legs follow:**
  - **The hull's pose comes from the ground, not its feet** (`target`): each half of its outline (front and back, left and right)
    wants its hips its standing height over most of what is under it, and at least 1.65 m over the highest thing there; going, the
    leading half looks 2.5 to 8 m ahead and the trailing half as far as it is long. So over a crate it rises just enough to clear it,
    over a gap it keeps level with the tops either side, and at a wall it rears up toward the wall's top before its nose is there.
    **The lower half rides up** toward the higher, by up to 3 m: so at a step or a low block it lifts level, with room under it,
    rather than pitching its nose up at it and scraping over (not at a wall taller than it can climb, where it only rears as far as
    it can). **At a taller face it rears up instead, in stages:** from 3 m taller than under its tail to 6 m, it rides up less (to 1 m)
    and pitches more steeply (to about 73 degrees at an 8.6 m block). While the face is still ahead, its tail stays down on its back
    legs and only its front rises (it creeps at 1.5 m/s meanwhile, pitching up at 1 rad/s and rising at 3 m/s at most); once its nose
    is at the face it hauls itself up, every leg going up the face after it, crests and steps onto the top. No leap: two feet always
    stay down. **All round, it leans toward what is beside it:** something taller just outside its outline (beside it, behind it, or
    ahead while it stands) lifts that half of it up to 1.6 m, slowly only and not while rearing (none past 6 m/s, so running past a
    wall it doesn't sway),
    and the legs on that side take holds up its face and over its top edge, the others staying down.
  - **The body goes there on its own** (`bodyPose`): each frame toward that pose at its own rates (6 m/s up or down, 2.2 rad/s of
    pitch), only never deeper into anything (`HULL3`, 83 points round the bead, close enough that an edge can't slip between them).
    The legs don't hold it back, so it never waits on a foothold: the earlier climbs, where the body could only go as far as its
    planted feet let it, stalled whenever a leg ran out of reach or a step took too long.
  - **Each foot takes the hold nearest the height that pose puts it at** (`foothold`), with some stretch and some fold left in hand,
    among the spots round its lane, ahead of it (in line, to either side, and in line with its hip, for a narrow block), the faces
    round its hip and the face below an edge going down. It may only take one in its leg's reach, in its lane, **on its own side of the
    body**, with its foot and shin clear of the hull, no more than 3 m over its hip, and on a top with leverage (0.7 m in from any edge
    on its hip's side; past it the top may end, so it straddles a narrow block). Over an edge above its hip it reaches knee-up, as a
    leg does. A grip on a face is never higher than the face's top.
  - **The legs keep up:** a planted foot the body has left out of its leg's reach holds nothing and steps at once, out of turn and
    whatever else is stepping. Climbing (steep, or still rising to the pose it wants), the legs step by need (`gait.js` `free`): the
    neediest first (past 80% of their reach, 0.6 m off the height their hold should be, carried out of their lane or in toward the
    body's middle), up to four at once but never two neighbours along a side, and while every corner of the body keeps a foot down.
    A step takes as long as its foot needs at 9 m/s (up to 0.9 s). **A climbing step picks its hold once, at lift-off,** for where its
    hip will be when it lands (on its way to the pose the hull wants, and carried on with the body), and keeps it, so the foot goes
    straight there rather than chasing a different best hold every frame (its landing moved 3 m on average after lift-off, up to 12;
    now 0.7). An out-of-turn step up or down does the same; on the level, walking, a landing still follows the body as the rhythm's do. A step up or down, or from or to a face, arcs no more than 0.4 m over what is between (it goes up
    first, then over), so cresting a block the legs don't swing out into the air. A leg with nothing in reach to hold **reaches for the
    hold it wants**, its foot most of its reach out toward it; with none in sight it hangs off the hull, clear of what it is against;
    either way its foot moves there smoothly (8 m/s), never snapping from pose to pose. A foot in the air never goes past its leg's
    reach: one the body has run on from (backing up fast down the lane, say) is drawn in after it rather than dragged out straight
    behind; it leaves where it lifted quickly and settles as it lands. Running, the lanes reach 78% of the way to full stretch at either
    end, so the back legs don't trail out straight behind at speed or slowing down. Walking, feet land where the rhythm asks.
  - **Rearing up a face, some legs climb and some push** (`roles`): three rays ahead, low over its anchor, find the face and its angle;
    the four legs whose hips are nearest it climb, the rest push, so coming at it corner first, its near side's legs climb. A pusher
    steps only at full stretch, never just for being off the height the pose would put it at; once the nose is at the face and it
    hauls itself up, they all climb. A pusher
    keeps to what it stands on: a face counts less for it, and so does a hold higher up. Climbing, a hold within 2 m of another foot's
    counts less, so the feet fan out up and along the face rather than bunch.
  - **The legs keep clear of the hull:** a thigh never rises more than 69 degrees over the level (closer in, the ankle folds instead),
    so the knee stays up and out over its foot; the leg solve turns a knee aside from the hull as from anything else; and with the
    hull steep, a stepping foot lifts off the hull and out to its side rather than straight up along it.
  - **It slows only for its own body:** climbing a face steeply, it goes no faster than 5 m/s. It looks 1, 2.5 and 4.5 m ahead: what
    even the pose it wants would meet there (a wall taller than it climbs), it brakes short of (at 10 m/s/s, the last metre at
    0.6 m/s); what it only has to rise to clear, no faster than lets its hull get that much higher first, at its own rates. So a crate
    or a step it takes at a run, and a tall block at 5 m/s.
  - Nothing over 13 m above its **anchor**, the ground under its outline (as high as 30% of it is lower, so a hole under a corner
    doesn't lower it, nor its nose over a top raise it); its hips never more than 1.45 m over that, so at a wall taller it rears up the
    face as far as it can and stops there. Walking off something tall, it climbs down nose first. Standing beside a wall it stands
    still (no shuffling between two holds as good, nor stepping back onto the spot a foot is on).
  - **Measured** (the lab's sweep, 742 cases, every box from 8 sides at 4 and 12 m/s, gaps, turning on tops, standing): blocks it
    should climb, 510 of 512 approaches (255 of 256 at each speed, corner-first too); every gap of 3 to 7 m crossed both ways; too-tall
    walls stopped at in all 48; standing beside tall blocks, still in all 69; 2 cases wrong in all. The hull is in nothing in any of
    them and no planted foot over nothing; a leg passes into the hull in 2.7% of frames (most of them a thigh grazing its side, steep
    against a face), and a foot is across the body's middle in 0.10%. Up the lab's climbing set (2.4 to 9 m blocks, at 4 and 10 m/s)
    it takes 1.9 s on average from meeting the face to standing on top (5.9 s when the legs led the body): a 3.5 m step at 10 m/s
    without slowing, a 9 m block reared up nearly upright in stages. The lab's lane (a crate, a step, 4.6 and 9.5 m blocks, a 12 m wall on and
    off, then a 16 m wall it stops at) goes at an unbroken 3 m/s. A climbing step's landing moves 0.6 m on average after lift-off; feet
    on a face are 3 m apart on average. The cost of the body leading: now and then a foot is briefly past its leg's full length before
    it steps (1.7% of planted-foot frames on the climbing set). What it still does wrong: a 1.2 m crate with a tall block just behind
    it, from that side, it rears at the tall one and slides along it; some middle legs tuck in against the hull mid-climb.
- **Its height is its own:** kept in the world, so the caller can put the root on the ground under it or anything else; the caller's
  collision asks the tank (`tank.hits(x, y, z, yaw)`: how far into things the hull would be with the root there) and never moves or
  turns it deeper in, so it turns on the spot even face-down against a wall. In the lab it spins quick on its feet (2.6 rad/s at a
  standstill, slower as it speeds up).
- **It backs up**, to 18 m/s (`tank.reverseMax`): the gait's strides mirror, the rear legs leading.
- **The reactor beam:** hold fire. The reactor and the muzzle brighten for a second (let go and it fizzles), then a condensed beam
  channels for four seconds, 420 m long. In spider form only: held in the bead, fire does nothing; held walking, it keeps it a spider
  (under 25 m/s, so it never closes up). While charging and firing it keeps 30% of its speed.

![Up the lane's 12 m wall: all but upright against the face, front feet over the edge, the rear legs following up it](wall.jpg)

![The beam](beam.jpg)

## What the rest takes

1. **Finish the model:** colliders (`col` empties for the hull), a far copy for distance, and loading it from `models.js`'s GLB map
   instead of a URL.
2. **Footholds on structures.** The lab's ground knows its crates; the game's would cast down onto the place's colliders (their tops are
   the drawn tops: `docs/collision.md`; `rayCollider`, `colliders.query`) and fall back to `planet.ground`, keep feet off edges (try a
   few spots near the wanted one: `spidertank.js` does, given a `ground(p, out, ceil)` that skips what is taller than `ceil`, and a
   `ray(from, dir, far, out)` for faces); the tank poses its own hull. The drive moves the root only where `tank.hits` says the hull
   goes no deeper into things (the legs never block it), and passes `push` (what the driver asks for).
3. **The mount.** A `VEHICLES` entry for it (`hideRider`), summoned and entered from the Garage like the others, with its own drive:
   walking (its acceleration, turning that slows as it speeds up), closing up past 25 m/s, and overdrive on the Skimmer's hover drive.
   Outdoors only: it is too big for the casino or the Downs' halls.
4. **The beam in play.** A long ray from the muzzle against enemies, meteors, colliders and the ground (stopping where it hits, with a
   splash there), its damage, a charge meter on the HUD, sound, and the slowdown; the fire button as the turrets' (left mouse).
5. **The quest.** The Triple Crown is already recorded (`race.js`: `genes.crown`). On winning it, Zbornak calls; bring the champion (as a
   follower, or from the pen) to the lab; he keeps it (it leaves your stable), and the spider tank joins the Garage. A save flag for it.
6. **Then** the CHANGELOG, the source map, and this page brought up to date.

## To decide

- Where it closes up (25 m/s, opening under 21) and how fast it skims (90 m/s in the lab; the Skimmer's top is 100).
- The beam's damage, and whether it stops at the first thing it hits or burns through.
- Whether the champion is seen again (in a specimen tank in Zbornak's lab, say).
