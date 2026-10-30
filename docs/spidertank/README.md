# Zbornak's spider tank: ARACHNE

The end-game reward. Win the Triple Crown, bring the champion to Dr. Zbornak, and he keeps it "for research"; in return he hands over
the walking tank he has been building round a mini antimatter reactor. It walks on eight armoured legs by the same IK the mites and
chimeras use (`src/gait.js`), to a spider's rhythm: a ripple walking, two sets of four running, the legs never crossing. It climbs what
its legs can reach the top of. Past 25 m/s it closes up by itself into a hovering bead (overdrive; never while it climbs), and when it
slows under 21 m/s the legs come back out and stand it up. It fires a reactor beam from a central cannon. The runner rides inside, out of sight.

Built in Blender (`tools/blender/build_spidertank.py` -> `src/assets/spidertank.glb`, 12.0k triangles, 312 KB) and driven by
`src/spidertank.js`. Revision 4: of the two first proposals the white one (A) was kept, bulkier and more mechanical, without its
abdomen; B was dropped. Round three made it close up by itself, stride longer, grip and climb, and drive its rams, and took the fins
off. Round four smoothed its run, solved its legs exactly, kept its feet below its hips and its hull and legs out of what it walks
among, and made the bead float higher on glowing jet trails. Not in the game yet.

- **The lab:** `npm run dev`, then `/tools/spidertank-lab.html`. It drives itself round a circle of crates and low walls: walking,
  running, closing up past 25 m/s and skimming, opening out, stopping to fire the beam. Press a key to drive it: W/S speed, A/D turn,
  hold SPACE for the beam; S also backs it up, to 18 m/s. **Look round** with the mouse: drag to turn the camera round the tank, right-drag (or shift-drag) to slide
  what it looks at, wheel to zoom, H to stop it turning with the tank, R or double-click to put it back. **P** pauses, **.** steps a
  frame, **[ ]** slow the clock down to a tenth and back. `&demo=walk|climb|wall|run|skim|fold|beam` loops one part (`wall` walks
  down the test lane: a 2.3 m crate, a 3.2 m step and a 4.6 m block it climbs onto and down off, then an 8 m block it stops at, gripping
  its face); `&speed=` sets it; the blocks round the circle are platforms to climb (3 to 5 m) and taller ones;
  `&cam=chase|side|front|rear|top|orbit` is where the camera starts.
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
- **It climbs:** each foot looks round where it would land, out to its leg's full reach and a little ahead the way it is going, and
  takes the highest spot it reaches: a top on a clear line from the hip, up to 0.6 m above the hip (the knee still bends up over it),
  or, where what is there is too tall to stand on, its face, gripped as high as the leg reaches. Feet on a face tilt the hull nose-up (to 57
  degrees; it rolls to 23 at most); the nose up, the front hips are higher and the next holds higher, and the hull rises to clear what
  is ahead (looking at least 1.5 m on, its tilt counted), until the front feet stand on the top and it walks up. Pushed on but held
  up, the legs keep stepping, landing at the front of their lanes and reaching past them for the face or the top of what holds it:
  they gather under the hull and hoist it, nose up as steeply as it takes. Nothing more than **5.5 m** over its lowest foot standing on a
  top: taller, it only grips the face, as it stands at the foot of a sheer wall, and walking along one its legs grip it. A foot left
  at full stretch below a risen hull, or with something come between it and its hip, steps at once; a knee or ankle that would be
  inside something turns about the leg to a clear way (`solid`). Measured in the lab: it walks up a 3.2 m step, a 4.5 m block (at a
  walk and at 8 m/s) and a 4.8 m one, and down off them; at a 6 m block and an 8 m one it stands with its front feet high on their
  faces. Cresting an edge the hull can touch it (0.2 m, 0.4 m at 8 m/s) and a leg can brush it for a moment.
- **The hull never goes into things:** at least 0.5 m over whatever is under its outline (`HULL`), as tilted as it is, as high as the
  planted legs can hold it and no lower than resting on what is under it. Feet gripping a face don't lift it (it would climb the
  wall). Each point of its outline has the highest top it can pass over (`tank.clearAt`); the caller never moves or turns it further
  into anything (the lab, driven, slides it along). Cresting a block's edge it can scrape it, by up to 0.2 m.
- **It backs up**, to 18 m/s (`tank.reverseMax`): the gait's strides mirror, the rear legs leading.
- **The reactor beam:** hold fire. The reactor and the muzzle brighten for a second (let go and it fizzles), then a condensed beam
  channels for four seconds, 420 m long. Walking only: holding fire while skimming opens it out first. While charging and firing it
  keeps 30% of its speed.

![Down the test lane: up onto the 4.6 m block](wall.jpg)

![The beam](beam.jpg)

## What the rest takes

1. **Finish the model:** colliders (`col` empties for the hull), a far copy for distance, and loading it from `models.js`'s GLB map
   instead of a URL.
2. **Footholds on structures.** The lab's ground knows its crates; the game's would cast down onto the place's colliders (their tops are
   the drawn tops: `docs/collision.md`; `rayCollider`, `colliders.query`) and fall back to `planet.ground`, keep feet off edges (try a
   few spots near the wanted one: `spidertank.js` does, given a `ground(p, out, ceil)` that skips what is taller than `ceil`, and a
   `ray(from, dir, far, out)` for faces), and set the ride height from what is under the hull, as the lab does. The hull collides only
   with what stands above `tank.clearAt` under `HULL`; the legs never block it. The drive passes `push` (what the driver asks for).
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
