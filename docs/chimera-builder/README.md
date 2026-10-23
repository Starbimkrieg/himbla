# The chimera builder (round three)

A chimera is no longer three creatures stacked up: `src/chimerabuild.js` puts it together from its gene sheet, fusing the parts where
they meet and growing each parent's traits on the others. **Not in the game yet**: the game still draws chimeras with `src/chimera.js`
until this look is signed off. Look at it in the lab: `npm run dev`, then `/tools/chimera-lab.html`.

| A blend | Armour on a mite-car-settler |
|---|---|
| ![sapling body on car legs, a pirate's head and a mite's](amalgam.jpg) | ![mite body on car legs, a settler's head, armour](armour.jpg) |

![Twelve random chimeras](grid.jpg)

![Mutations: armour, crystal, turbo with spark and lens, void with radio and mud](mutations.jpg)

## How a chimera is put together

1. **Parts.** Legs, body and head (and a second head) are drawn from the parents as before (`spliceGenes`). Mites, cars and saplings come
   from the kit (`tools/blender/build_chimera_kit.py` -> `src/assets/chimera.glb`), each part in three looks, picked by the seed. The
   **human kinds are the game's own NPCs**, cut out of `models.js figureSpec`: a person is a settler in one of the NPCs' outfits (coveralls,
   lab coat, engineer, trader, elder, casual; never the player's orange), a pirate is the pirate you scooped (dark purple, black helmet,
   green visor), a void-touched is purple, a Vrill has its bare antennaed head. Their legs, torso and arms, and head come off the figure at
   0.7 (the head at 0.55) and keep its colours.
2. **Fused joints, no seams.** Each joint gives its size (the legs' hip, the body's base and neck, the head's base). The builder fills the
   gap with a bridge of hide that shades from the lower parent's colour into the upper's, and every part's hide shades toward its
   neighbour's colour near the joint (half way at the joint itself).
3. **Grafts.** Every part has graft points (on its flanks, top, front, back and underside, each with a direction). Up to three per part
   (one or two on a head) take a trait from one of the *other* parents: a mite lends chitin plates, bristles and a spare eye; a car body
   panels with rivets, a headlight and an exhaust stub; a sapling bark with a sprout, moss with toadstools and a leafy twig; a person
   patches of their clothes with a pocket, a strap and buckle, a little reaching hand. Two kinds of people swap clothes too.
4. **Mutations, in the form of what they grow on:**
   - **armour**: plating on the flanks and tops of every part: riveted steel on car parts, steel-rimmed plated chitin on mite parts,
     cracked stone-grey bark on sapling parts, padded body armour on human parts
   - **crystal**: five to eight crystal clusters sprouting from anywhere on the body
   - **spark**: on the back, the body's kind of power (a tesla coil on a car, a glowing bioelectric sac on a mite, glowing seed pods on a
     sapling, a battery pack on a person), and sparks on a couple of flanks
   - **turbo**: on the back, an engine (a car), jet vents (a mite), a smouldering hollow log (a sapling), a jet pack (a person)
   - **radio**: on the head, a whip aerial and dish (a car), a third feeler with a receiver (a mite), a leaf dish (a sapling), a headset
   - **lens**: on the eye, a big lensed headlight (a car), a glass eye bud (a sapling), a jeweller's eyepiece (a mite or a person)
   - **mud**: caked on the legs and the underside
   - **void**: the whole creature darkens toward violet, wrapped in a shadowy purple aura, with void shards drifting round it
5. **The Triple Crown** sits on the head (the laurel halo).

## Still to do (after sign-off)

- Junkbot parts (it draws as a car for now) and the eight kinds' third looks where they are thin.
- Wiring it into the game: the race, the pen, the followers and the card portraits (`makeChimera` would call the builder), and remembering
  which NPC you scooped (so the chimera wears that settler's actual outfit, not one drawn from the seed).
- Retiring the old procedural models in `chimera.js`.

## The files

- `src/chimerabuild.js`: the builder (`chimeraBuilder()` loads the kit and returns `build(genes)` -> `{ root, anim(t, speed), height }`)
- `src/models.js`: `figureSpec` (an NPC's look and its labelled parts, which `makeFigure` bakes), `figurePiece` (a piece of one), `loadChimeraKit`
- `tools/blender/build_chimera_kit.py` -> `src/assets/chimera.glb`: the parts, grafts, mutation pieces and the crown (the contract is in its header)
- `tools/chimera-lab.html`: the lab (pick the parts, mutations, seed and size; NEW SEED for other looks and grafts; RANDOM CHIMERA; a grid of
  twelve random ones; THIS ONE, EACH MUTATION). Query parameters for screenshots are in the file.
