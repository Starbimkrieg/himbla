# Zbornak's spider tank: ARACHNE

The end-game reward. Win the Triple Crown, bring the champion to Dr. Zbornak, and he keeps it "for research"; in return he hands over
the walking tank he has been building round a mini antimatter reactor. It walks on eight armoured legs by the same IK the mites and
chimeras use (`src/gait.js`), its strides lengthening up to 40 m/s; past that it closes up by itself into a hovering bead (overdrive),
and when it slows under 34 m/s the legs come back out and stand it up. It fires a reactor beam from a central cannon. The runner rides inside, out of sight.

Built in Blender (`tools/blender/build_spidertank.py` -> `src/assets/spidertank.glb`, 12.0k triangles, 312 KB) and driven by
`src/spidertank.js`. Revision 4: of the two first proposals the white one (A) was kept, bulkier and more mechanical, without its
abdomen; B was dropped. Round three made it close up by itself, stride longer, grip and climb, and drive its rams, and took the fins
off. Round four smoothed its run, solved its legs exactly, kept its feet below its hips and its hull and legs out of what it walks
among, and made the bead float higher on glowing jet trails. Not in the game yet.

- **The lab:** `npm run dev`, then `/tools/spidertank-lab.html`. It drives itself round a circle of crates and low walls: walking,
  running, closing up past 40 m/s and skimming, opening out, stopping to fire the beam. Press a key to drive it: W/S speed, A/D turn,
  hold SPACE for the beam. **Look round** with the mouse: drag to turn the camera round the tank, right-drag (or shift-drag) to slide
  what it looks at, wheel to zoom, H to stop it turning with the tank, R or double-click to put it back. **P** pauses, **.** steps a
  frame, **[ ]** slow the clock down to a tenth and back. `&demo=walk|climb|wall|run|skim|fold|beam` loops one part (`wall` walks
  down the test lane: a 2.3 m crate, a 3.2 m step it climbs onto and down off, then an 8 m block it stops at); `&speed=` sets it;
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

It closes up by itself at 40 m/s, over 1.3 s, in stages, and opens out again under 34 m/s (the gap keeps it from flickering between
the two); slowing down, it runs backwards:

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

- **Eight legs in fours** (a tetrapod: left front, right second, left third and right back together, then the other four), so four
  feet are always down and the hull rides level and tilts with the ground under them.
- **Its legs are solved exactly** (`makeGait`'s `pole`): each three-bone leg bends its knee up, as built, in the upright plane
  through its hip and foot, the ankle folding as the foot comes in. The general IK the mites use (FABRIK) can find a different shape
  for a three-bone leg from one frame to the next, and did, mid-step: that flip, at up to 10,000 degrees a second, was much of the
  twitch at speed.
- **It runs on a duty factor** (`long`): each foot's share of the stride on the ground, from 0.65 walking to 0.5 by the time the
  stride is full (about 10 m/s; each foot swings as long as it stands) and 0.42 flat out, a short float with no foot down that its jets
  carry. Each stance uses the leg's reach, to 82% of it so the legs stay bent at the ends; a stepping foot skims lower the faster it
  goes. Per leg: 0.7 steps a second at 10 m/s, 1.4 at 23, 2.1 at 38 (it was 1.9 and 3.0); joints turn at most about 1,800 degrees a
  second in a stride (from 6,000 to 10,000), and a swinging foot moves at half the speed it did. Feet stay planted to the centimetre at
  every speed and through turns, and the walk never drops out into a glide.
- **It grips what it stands on, below its hips:** a foot stands at least 0.9 m below its hip, so the knee always bends up over it; a
  top higher than that it reaches after the hull rises (the hull lifts to clear what is ahead, and the feet follow it up). A foot
  aims down from its hip: if something is in the way (the face of a crate or a wall), it grips that face where the line meets it.
  A foot behind a risen hull that nears its full stretch, or that something has come between it and its hip, steps at once. A step
  up lifts the foot first and then reaches over and sets it down; a step down reaches out and then drops; one whose path crosses
  something taller arcs over it. A knee or ankle that would be inside something turns about the leg's hip-to-foot line, forward or
  back, to the nearest way that is clear, and eases there (`solid`).
- **The hull never goes into things:** at least 0.5 m over whatever is under its outline (`HULL`, looking a little ahead), as high as
  the planted legs can hold it and no lower than resting on what is under it. Feet gripping a face don't lift it (it would climb the
  wall). What it can't clear stops it (`tank.clearTop`, tested over the same outline): it never moves or turns further into anything,
  and driven, it slides along. A 2.3 m crate it walks over, a 3.2 m step it climbs, an 8 m block stops it. Measured in the lab:
  nothing in the hull or the legs head-on, along a wall, over the crate or up and down the step; turning on the spot a metre from a
  10 m wall, a leg still touches it about one frame in fifty.
- **The reactor beam:** hold fire. The reactor and the muzzle brighten for a second (let go and it fizzles), then a condensed beam
  channels for four seconds, 420 m long. Walking only: holding fire while skimming opens it out first. While charging and firing it
  keeps 30% of its speed.

![Down the test lane: up the 3.2 m step, the front feet on top and the hull lifted](wall.jpg)

![The beam](beam.jpg)

## What the rest takes

1. **Finish the model:** colliders (`col` empties for the hull), a far copy for distance, and loading it from `models.js`'s GLB map
   instead of a URL.
2. **Footholds on structures.** The lab's ground knows its crates; the game's would cast down onto the place's colliders (their tops are
   the drawn tops: `docs/collision.md`; `rayCollider`, `colliders.query`) and fall back to `planet.ground`, keep feet off edges (try a
   few spots near the wanted one: `spidertank.js` does, given a `ground(p, out, ceil)` that skips what is taller than `ceil`, and a
   `ray(from, dir, far, out)` for faces), and set the ride height from what is under the hull, as the lab does. The hull collides only
   with what stands above `tank.clearTop` under `HULL`; the legs never block it.
3. **The mount.** A `VEHICLES` entry for it (`hideRider`), summoned and entered from the Garage like the others, with its own drive:
   walking (its acceleration, turning that slows as it speeds up), closing up past 40 m/s, and overdrive on the Skimmer's hover drive.
   Outdoors only: it is too big for the casino or the Downs' halls.
4. **The beam in play.** A long ray from the muzzle against enemies, meteors, colliders and the ground (stopping where it hits, with a
   splash there), its damage, a charge meter on the HUD, sound, and the slowdown; the fire button as the turrets' (left mouse).
5. **The quest.** The Triple Crown is already recorded (`race.js`: `genes.crown`). On winning it, Zbornak calls; bring the champion (as a
   follower, or from the pen) to the lab; he keeps it (it leaves your stable), and the spider tank joins the Garage. A save flag for it.
6. **Then** the CHANGELOG, the source map, and this page brought up to date.

## To decide

- Where it closes up (40 m/s, opening under 34) and how fast it skims (90 m/s in the lab; the Skimmer's top is 100).
- The beam's damage, and whether it stops at the first thing it hits or burns through.
- Whether the champion is seen again (in a specimen tank in Zbornak's lab, say).
