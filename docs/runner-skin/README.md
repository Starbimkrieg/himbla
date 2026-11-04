# The courier as one bending body: two drafts

![Now, A and B: standing, from behind, running, skating (behind and side), on the light-bike, holding a weapon two-handed
and one-handed, the hips and a knee close up](skin_sheet.jpg)

The courier is rigid parts on pivots, and his suit was too: a trunk, thighs, calves, upper arms and forearms, each its
own piece, with balls at the elbows and knees. The pieces part at every bend (leaning into a skate bared the thighs'
tops), each draws its own outline (broken, doubled lines at the joints), and the piping stops and starts at each joint.

In both drafts the suit is **one continuous body that bends**: the same pieces at the same proportions, merged into one
solid (armpits, crotch, elbows and knees joined and smoothed), every vertex weighted to the pivots it follows (Blender's
automatic weights). The piping is redrawn as continuous strips laid on the suit, bending with it. The rigid kit stays
rigid on its pivots: helmet, pauldrons, gloves and cuffs, belt and pouches, pack, knee guards and shin plates, boots and
skates.

- **A · One-piece:** a smooth, seamless suit.
- **B · Pressure suit:** A with a concertina, three soft folds round each elbow and knee and the waist, pressed into the
  suit's own surface (they fold and open with the bend and draw no lines of their own), and a slightly fuller thigh and
  calf.

The renders pose him as the game does (`tools/blender/preview_runner.py`): his pivots set as `player.js` sets them
(running mid-stride, the full skating crouch, the light-bike's rider pose, a dive) and the weapon holds solved as
`weaponView.js` solves them, then each suit vertex moved by its weights' blend of its pivots' moves, which is what the
game's skinned meshes do.

## In the game

The game already skins its townsfolk to bones at their pivots, with a skinned ink shell (`models.js makeFigure`). The
courier would be the same: his pivots become bones, so everything that turns them (the animations, the ragdoll, the
weapons' arm solving, the light-bike pose, animating on twos) bends the suit unchanged. About 48k triangles for the suit
(the rigid one was about 6k of his 20k).

## Built with

`RUNNER_SKIN=a|b MOONRUNNER_REPO=. python3 tools/blender/build_runner.py` (`tools/blender/runner_skin.py`);
`RUNNER_SKIN=a|b MOONRUNNER_REPO=. python3 tools/blender/preview_runner.py` renders these (`RUNNER_CLOSE=1` the close-ups).
