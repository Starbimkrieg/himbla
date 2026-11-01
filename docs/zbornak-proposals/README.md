# Dr. Zbornak's Antimatter Lab: two drafts for the rework

![Both drafts: overview, airlock, cutaway, interior, ranch, lab terminal](zbornak_proposals.jpg)

The brief: fill out the lab's plateau (r 120 m) more, keep the vibe, and make it grander. In both drafts:

- **The holding pen becomes a space ranch,** with more round the feeding trough. The pen terminal moves indoors, into a ranch building
  well clear of the lab.
- **A lab terminal** you walk up to and use. It lists your splices, what you have thrown into the reactor and the chimeras you have
  made. Each entry shows its full details once unlocked, and the newest entry is marked after every splice, feed or hatch.
- **A bigger main lab with an airlock** like the hab domes'. A security camera photographs you on a stand plate, and the door opens
  only once Zbornak has let you in.
- **Inside the lab:**
  - bioluminescent hydroponics
  - exotic-matter storage
  - robot arms at work, one of them welding
  - cryo-stasis pods with chimeras in them
  - holotables and wall projections
  - the antimatter reactor
- **Zbornak is an alien now,** so no helmet. He carries a clipboard and wears a lab coat scorched by his experiments.

Everything is modelled in Blender from code (`tools/blender/build_zbornak_lab.py`, `zbornak_kit.py`, `zbornak_figure.py`) and
rendered with Cycles and Freestyle (`tools/blender/preview_zbornak_lab.py`). **Nothing is in the game yet.** Once you pick a draft,
or a mix of the two, it gets built into `world.buildLab` and `settlements.js` (see "Building it" below). The chimeras in the pods,
on the bench and in the corrals are the game's own, built by `makeChimera` and exported for the renders. The courier is
`runner.glb`.

| | Today | A: The Rotunda | B: The Institute |
|---|---|---|---|
| Main lab | 44 × 32 m box, 16 m tall | round, 64 m across; ribbed dome 27 m; reactor crown 44 m up | vaulted hall 34 × 66 m inside, 22 m to the crest; reactor tower 26 m across, crown 52 m up |
| Airlock | a doorway | ribbed tunnel (14 m) to a lock housing, round pressure door | gatehouse with two stages: iris door, decon vestibule, inner door |
| Security | none | camera on a jointed arm, screen beside the door | camera on an arm, portrait screen, lit scan ring round the iris |
| Ranch | gravel yard, one trough, kiosk at the gate | gambrel barn, pen office on its end, rectangular corral east of the lab | bunkhouse with porch, round corral round a feed carousel, training ring, west of the lab |
| Feeding | one trough | silo, auger to a roofed 15 m feed bunk, lick blocks, stock tank and sun-mill | hopper on legs, six chutes into a ring trough; water tower piped to a stock tank; hay feeder |
| Lab terminal | none | LABNET: a curved console desk with a CRT log | SPECIMEN INDEX: a standing kiosk with a holographic card codex |
| Plateau extras | barrels, gas rack, generator | supply landing pad, radiator field behind the dome, solar array, plaza with the specimen jar | supply landing pad, radiator field, Test Site 7 (a scorched blast crater with a bunker), forecourt |
| Distance lab to ranch building | kiosk 6 m from the door | barn office 26 m from the dome's wall | bunkhouse 40 m from the hall |

Today, for comparison:

| | |
|---|---|
| ![Today, from the air](current_air.png) | ![Today, inside](current_inside.png) |

---

## A: The Rotunda

![Plan A](plan_a.jpg)

A round, domed lab with the reactor at its heart. The reactor's glass column rises through an oculus in the dome to a crown of three
lit rings and a spire, so the place reads from far off. Sixteen radiator fins, a band of lit portholes, 24 ribs on the dome and a
lime band round its foot.

![A from the air](a_over.jpg)
![A from the approach](a_front.jpg)

**Airlock and security.** A ribbed tunnel runs out from the dome, like the hab domes' airlocks, to a lock housing with a round
pressure door in a hazard ring and the lab's sign above it. You stand on the painted plate with the two lit footprints. A camera on
a jointed arm swings over you, casts its scan cone down and takes your picture, which shows on the screen beside the door:
*VISITOR · COURIER #0417 · MATCH 99% · ZBORNAK: "OH. YOU." · ACCESS GRANTED*. Then the door opens. The intercom post on the left
is for when he is "busy".

![A: the airlock's stand plate, camera and screen](a_gate.jpg)

**Inside** (the dome lifted off), round the reactor clockwise from the door:

| Spot | What is there |
|---|---|
| Front left | the **holotable**: the Moon as a hologram with an orbit and two pins, and a map projected on the wall |
| Left | **hydroponics**: three racks of glowing bulbs, fronds, caps and pitchers under violet grow bars, a nutrient tank, glowing vines hanging from the dome |
| Back left | six **cryo-stasis pods** in an arc, a chimera asleep in each (frosted foot, readout, cold pipes) |
| Back | the **splice pod** (as today, grander) under a 13 m projection of a double helix |
| Back right | **exotic matter**: a round vault door between two racks of canisters (void beads, crystals, plasma), and two magnetic cages with a floating black sphere in each |
| Right | the **robotics bay**: a bench with a junk-bot chimera half built, two grab arms, a **welder** throwing sparks and an overhead gantry |
| Front right | the **LABNET terminal** and **Zbornak's dais** facing the door |
| Middle | the **reactor**: plinth, glass column with a caged core in three rings, three magnetic pylons with emitter claws, a pit railing, and a ring catwalk 6.5 m up with a stair |

![A, cut away](a_cut.jpg)
![A, inside from the door](a_inside.jpg)

| | |
|---|---|
| ![Cryo pods](a_cryo.jpg) | ![Robotics bay](a_robots.jpg) |
| ![Zbornak at his dais](a_zb.jpg) | ![The LABNET terminal](a_term.jpg) |

**The ranch** stands east of the lab, its barn office 26 m from the dome:
- **The barn:** a red gambrel barn with white-trimmed X-braced sliding doors open on the corral, and stalls with lanterns and a
  chimera inside. It has a hayloft door with a hoist beam, a cupola with a chimera weathervane, and a solar strip on its south
  slope.
- **The pen office:** on the barn's west end, the pen terminal is indoors at last, seen through the open door and a big window,
  under a HOLDING PEN board.
- **The feed line** expands on the trough: a silo with a caged ladder feeds an auger chute over the fence into a 15 m roofed feed
  bunk of glowing feed, with drop spouts, lick blocks at both ends and a CHOW board. Chimeras eat at it.
- **Water and the rest:** a stock tank filled by a sun-mill pump, a training ring, moss bales, a saddle rack and crystal licks on
  posts.
- **The gate:** the ZBORNAK RANCH arch with a cattle grid, facing the lab, at the end of a lit path from the plaza.

![A: the ranch](a_ranch.jpg)
![A: the pen office, the terminal inside](a_office.jpg)

**Outworks:** a supply landing pad off the plaza, a radiator field behind the dome piped to the reactor (its heat dump), a solar
array to the west, gas racks and the generator.

## B: The Institute

![Plan B](plan_b.jpg)

A long, vaulted hall on one axis. You come in through a monumental gatehouse and look straight down the nave at the reactor, which
stands in its own tower at the far end, its crown 52 m up. Buttresses with lit radiator fins and tall windows line both sides;
ribs and a lit crest run along the vault.

![B from the air](b_over.jpg)
![B from the approach](b_front.jpg)

**Airlock and security.** The gatehouse sits between two lit pylons under a pediment reading ZBORNAK INSTITUTE · OF APPLIED
ANTIMATTER · VISITORS WILL BE PHOTOGRAPHED. The outer door is an eight-leaf **iris** in a lit scan ring. You stand on the plate, the
camera on its arm photographs you, and the portrait screen to the right of the door shows *VISITOR PHOTOGRAPHED · COURIER #0417 ·
MATCH 99% · DR. ZBORNAK: "...FINE." · ✔ ADMITTED*. The iris opens. Behind it is a **decon vestibule** (spray nozzles, lit grilles),
then the inner door. That is two stages, a real airlock.

![B: the iris door, camera and screen](b_gate.jpg)

**Inside:**

| Bay | Left aisle | Right aisle |
|---|---|---|
| By the door | **hydroponics**: a 10 m wall rack and a freestanding one, glowing vines from the vault | the **exotic-matter vault**: a cage room with canister racks and a void sphere in a magnetic cage |
| Middle | the **cryo gallery**: eight pods along the wall, a chimera in each, a helix projection 22 m long above | the **robot line**: a conveyor carrying chimeras being assembled past four arms (claws, a drill, a **welder**), charts projected above |
| Far end | the **SPECIMEN INDEX** kiosk | the **splice pod** |

Down the middle, on a lit runway: a round **holotable** (the Moon), a long one (a chimera's double helix), two **projections**
hung from the vault, and **Zbornak's podium** with a curved desk and a holo screen. Beyond it, through a tall opening, the reactor
tower: four pylons, a pit railing, a catwalk 9 m up and the reactor 26 m tall, going on up through the roof.

![B, cut away](b_cut.jpg)
![B, down the nave from the door](b_inside.jpg)

| | |
|---|---|
| ![Cryo gallery](b_cryo.jpg) | ![Robot line](b_robots.jpg) |
| ![Zbornak at his podium](b_zb.jpg) | ![The SPECIMEN INDEX kiosk](b_term.jpg) |

**The ranch** lies west of the hall, the bunkhouse 40 m from its wall:
- **The bunkhouse:** log walls, a smoking chimney and a porch with a rocking chair and a lasso. The pen terminal is inside, seen
  through the window.
- **The round corral** (34 m across): in its middle a **feed carousel**, a corrugated hopper on four legs that drops glowing feed
  through six chutes into a ring trough (CHOW CAROUSEL). The chimeras eat round it.
- **The training ring:** reached down a fenced lane, with a hay feeder.
- **Water:** a wooden water tower piped into a stock tank in the corral, and a sun-mill.
- **The gate:** the ZBORNAK RANCH arch, facing the forecourt.

![B: the ranch](b_ranch.jpg)
![B: the bunkhouse, the terminal inside](b_office.jpg)

**Outworks:** a supply landing pad by the forecourt; a radiator field beside the hall, piped in; and **Test Site 7**, a scorched
blast crater in a berm with twisted debris and a target dummy, a blast wall, and a bunker with a lit slit (STAND BEHIND THE WALL).
That is where the coat got scorched.

---

## Dr. Zbornak

Both are aliens with no helmet, holding a clipboard in the left arm and a pen in the right hand, in a lab coat that has been in
too many explosions. The coat's burns are cut from a skin laid over it (flame-licks rising from a charred hem, a singed brown edge
round the char), not stuck-on spots. Embers still glow in the hem. The head turns on a `head` pivot at the neck, like the casino's
bouncer, so he can watch you.

| A: "The Elder" | B: "The Singed" |
|---|---|
| ![A, turnaround](a_zbornak.jpg) | ![B, turnaround](b_zbornak.jpg) |
| ![A, face](a_zbornak_face.jpg) | ![B, face](b_zbornak_face.jpg) |
| 2.35 m, tall and thin, pale green. An egg of a cranium tipped back, with brain ridges over the crown. Three eyes: two almond with lit amber slits, one on the brow. Brass goggles pushed up on the cranium, soot on a cheek. A knee coat with its hem burnt ragged and a singed right cuff; shirt and tie, three pens in the breast pocket, a name badge. | 2.0 m, stocky, violet. A wide dome with seven head-fronds blown upright by the last blast, their tips charred and glowing. One big eye behind a brass loupe on a headband, a gap-toothed grin, fin ears (a bite out of one). A shin coat, buttoned, with a belt of gadgets, the back burnt up to the waist, the **left sleeve burnt off at the elbow** (bare forearm) and smoke still curling off it. A welding glove on the right hand. |

Either Zbornak fits either lab. A is 7.9k triangles and B 9.2k, before outlines (the casino's bouncer is 4.3k, the courier 15k). The figure alone is exported in the game's GLB
contract (one material per slot, `ink`, the `head` pivot) as `zbornak_a.glb` and `zbornak_b.glb` here, plain, so any viewer opens
them.

## The lab terminal

Walk up and press F: the camera moves in to the screen and the HUD gives way to the terminal's own screen. It has three sections:

- **Splices:** the ten mutations of the splice pod. Each shows its source, effect, when it was spliced, whether it is active,
  your three mutation slots, and a note from Zbornak.
- **Reactor:** everything that can go in: the single items, the pairs, three of a kind, three different. Each shows its input, the
  result, when it was first logged and how many times.
- **Chimeras:** every chimera you have made, with its parts, grade and where it is.

Anything not yet unlocked shows as `???` with only a hint ("Not yet thrown in"). After every splice, feed or hatch the new entry is
marked NEW and named on the bottom line (LAST ENTRY in A, NEW in B), so the terminal is the log of everything you have done in the
lab. The entries are the game's own (`MUTATIONS`, `ITEMS` and the reactor's results in `src/alchemy.js`). The save in the mock-ups
is made up.

**A: LABNET** is a green CRT log in the game's pixel faces: tabs for SPLICES, REACTOR, CHIMERAS and PEN, a list on the left (lit,
locked or NEW, with ACTIVE and CURED tags) and the full entry on the right with Zbornak's note.

| Splices | Reactor |
|---|---|
| ![LABNET, splices](terminal_a_splices.png) | ![LABNET, reactor](terminal_a_reactor.png) |

**B: SPECIMEN INDEX** is a holographic codex: every entry is a card in three rows (the locked ones dashed `???`), the selected card
opens on the right with Zbornak's note scrawled under it, and a ticker along the bottom reports the newest entries. On the kiosk
itself an attract screen shows the latest entry and PRESS F.

![SPECIMEN INDEX](terminal_b.png)

## Building it (once a draft is picked)

- **Models:** the builders here make one scene per draft. For the game they split into the place's parts as the Downs' do:
  shell, airlock, interior stations, ranch buildings, kit pieces. Each would be a `parts(..., solid=True)` build with its own
  colliders (`docs/collision.md`: roofs collide at their drawn top, floors with `k.floorCols`, the catwalk and the stair walkable).
  The reactor's spin, the robot arms, the welder's sparks, the carousel and the sun-mill get pivots for the game to animate.
- **The airlock** (`main.js` near the lab prompts): standing on the plate starts the sequence. The camera arm swings out, the scan
  cone sweeps, and the screen shows the courier in the player's current outfit: a render-to-texture from the camera's spot, held
  as a still. A beat later Zbornak's line and ACCESS GRANTED, then the door opens (A slides apart; B irises, the vestibule sprays,
  the inner door opens) and closes behind you. A pen link or a chimera at your heel is let in too.
- **The lab terminal:** a new prompt and a close-up camera like the casino's seated games. The data is mostly there already:
  `alchemy.js` knows the mutations, the jar items and the chimeras. It needs a small log of firsts (what was fed and when, the
  times, the NEW flag) kept in the save.
- **The pen terminal** moves into the ranch building. `PEN` in `alchemy.js` moves to the new corral, and the residents' spots go
  round the trough or the carousel so they gather to eat.
- **Zbornak:** the figure replaces `makeFigure` in `buildLab`, his name tag and talk prompt move with the dais or podium, and the
  head turns toward the player.
- **Cost:** the whole area is about 110k triangles (A) and 99k (B) as built here, before outlines, including the interiors. In the game it would be baked
  and merged with the place like the Downs, with the far pieces (radiator field, solar array, test site) culled with distance.

## Making the renders again

```bash
npx vite --port 5199 --host 127.0.0.1
```

```bash
node tools/zbornak-chimeras.mjs
```

```bash
MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py photo
```

```bash
node tools/zbornak-screens.mjs
```

```bash
MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py views
```

```bash
MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py plan
```

```bash
MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py zbornak
```

```bash
MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py sheet
```

In order: the dev server (in its own shell) serves the game for the chimera export and the fonts for the screens; the chimeras go
to `/tmp/zb-chimeras` (`ZB_CHIMERAS`); the security camera's snapshot of the courier comes before the screens, which paint it on
the security screen. A view takes about a minute on four cores at 1280 × 720, 32 samples (`PREVIEW_W`, `PREVIEW_H`,
`PREVIEW_SAMPLES`; `PREVIEW_VIEWS=over,gate` renders some). `ZB_VARIANT=a|b MOONRUNNER_REPO=. python3
tools/blender/build_zbornak_lab.py` builds a draft alone and exports its Zbornak.
