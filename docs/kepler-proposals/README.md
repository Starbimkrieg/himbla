# The Kepler town kit: proposals

The next item of `docs/code-vs-blender.md`: the Kepler towns (Tranquility, Aldrin, the Civic Center, Twilight,
Hertzsprung), all code-built today by `settlements.js` buildTown: a hub dome, six to eight family domes round it on
tunnels, each shell painted whole in one of six saturated colours, and at the Civic Center a colonnaded town hall with a
pediment and a clock tower.

**Nothing here is in the game yet.** These are drafts built in Blender to choose from: three questions, each with its
options below.

1. **The hab dome:** A (the Shield) or B (the Geode), or both as a family.
2. **The town hall:** A (Earthrise Hall) or B (Founders' Landing).
3. **The layouts:** three, without the hub dome, and which town gets which.

The pictures are Cycles renders with Freestyle ink (`tools/blender/proposals/preview_kepler.py`), not the game's toon
shader: shapes, sizes and colours are the game's, the shading is softer than it will be. The drafts have no colliders,
pivots or export, and the triangle counts are the drafts'.

## The palette

Every piece keeps to the ILMB's: cream and white shells, aluminium, plum darks and dark roofs, **one Kepler orange band a
building**, and regolith grey where a home is dug in. A household's own colour is only on its **door**, from five muted
ones (sage, dusk blue, ochre, rose, teal). The six shell colours go. Shops take one accent each, on the awning and the
parapet line.

## 1. The hab dome

![Both domes at r 8, 14 and 22: A in front, B behind](domes_both.jpg)

| | A: **the Shield** | B: **the Geode** |
|---|---|---|
| Idea | A low cream shell (its rise 0.8 of its radius) behind **three terraces of sintered-regolith block**: the radiation cover today's berm heaps up, built as masonry. | A **faceted geodesic shell on a drum**: the cover is in the drum's regolith-filled double wall, so the shell stands clear and its facets catch the light. |
| Colour | Cream shell, grey terraces, the orange band where they meet. | White shell with a few paler panels, cream drum, the orange band at the springing. |
| Detail | White seams up the shell, a ring of portholes above the terraces, a glazed lantern at the crown. | Aluminium struts on every edge, **photovoltaic facets on the sunward side**, portholes round the drum, a dark cap. |
| Airlock | The same on both: a cream vestibule with a dark roof, an orange door frame, the door in the household's colour, a lit strip under the canopy, a railed step. | |
| Footprint | r + 3.6 for the terraces, the airlock out to r + 7 | r + 0.5, the airlock out to r + 5.5: it packs tighter |
| Reads as | Dug in, sheltered: a home | Technical, a station building |

| A | B |
|---|---|
| ![Dome A, r 14](domes_a.jpg) | ![Dome B, r 14](domes_b.jpg) |
| ![A's airlock](domes_a_door.jpg) | ![B's airlock](domes_b_door.jpg) |

The six domes on the sheet are 28k triangles together. **Recommendation: both, as a family.** The layouts below already
mix them (A for homes, B for the bigger shared domes), and two silhouettes in one palette do more for variety than six
colours did.

Also drafted, for the layouts: the pieces a station is made of besides domes.

![The station pieces](pieces_all.jpg)

| | |
|---|---|
| ![Raised modules, the orange commons between two homes](pieces_stilt.jpg) | ![Shop units and market stalls](pieces_shops.jpg) |
| ![The longhouse](pieces_longhouse.jpg) | |

- **The raised module**: 10 m long on four hydraulic legs, its floor 3.2 m up, a docking collar each end so modules
  chain 11.5 m apart, a landing and a stair. The **commons** module is the one piece painted whole in Kepler orange, with a
  glazed cupola (the polar stations' red module).
- **The longhouse**: a barrel-vault hut 7.2 by 16 m with regolith block banked along its sides and dormer windows.
- **The shop unit**, 8 m wide: a lit glazed front, an awning on two posts, the board its name is written on. The built
  ones would be the ILMB quarter's five shop units (`ilmb_quarters.py`: canteen, suits, parts, noodle bar, clinic) in this
  palette, not new models. **The market stall**: an aluminium frame, a counter, a canopy.
- The greenhouse, the water tank (a banded sphere on four braced legs), the comms mast, the tunnel, solar rows.

## 2. The town hall

Both replace the pediment, the colonnade and the clock tower with things a town on the Moon would build, and both keep
what the game uses: the entrance toward arrivals, two flag masts (the game hangs the cloth), and a clock whose hands the
game turns.

**The Earth dial** is that clock, on both: a ring with the Earth at its centre, lit and night sides split along the
terminator. The Earth hangs still in the Moon's sky and its phase is the time of the month, so the town tells the time by
it.

### A: Earthrise Hall

![A: from the forecourt's right](hall_a_hero.jpg)

A round council chamber (r 12) **dug in behind regolith terraces**, the way the homes are, under a shallow white saucer
roof with a clerestory ring and a glazed oculus. Its front opens in a **crescent of glass** 120° wide, the foyer, under a
canopy on eight slim columns that carries the hall's solar array; an orange portal is the way in. The clock tower becomes
a **campanile** beside the forecourt, a 31 m pylon holding the Earth dial open against the sky.

| | |
|---|---|
| ![A: front](hall_a_front.jpg) | ![A: from above](hall_a_top.jpg) |
| ![A: the foyer and portal](hall_a_close.jpg) | ![A: the terraces round the back](hall_a_back.jpg) |
| ![A: the Earth dial](hall_a_dial.jpg) | |

### B: Founders' Landing

![B: from the stair's right](hall_b_hero.jpg)

The hall as **the ship the settlement came down in**: an eight-sided council vessel on four lander legs (dished footpads,
shock sleeves, two side struts each: the Orrery's language), its underside 6 m up. **The town's forum is the open ground
under it**, with benches and a rostrum, lit by the descent engine's bell. A stair 12 m long comes down the front the way a
lander's ladder does; a glazed lift stands at the back. On the deck, a glazed lantern carrying the Earth dial, four
radiator fins, and the mast with the Kepler orbit ring (it would turn, as the Orrery's does).

| | |
|---|---|
| ![B: front](hall_b_front.jpg) | ![B: from above](hall_b_top.jpg) |
| ![B: the forum under the vessel](hall_b_under.jpg) | ![B: the back, the lift](hall_b_back.jpg) |
| ![B: the deck, lantern and dial](hall_b_deck.jpg) | |

### Side by side

| | A: Earthrise Hall | B: Founders' Landing |
|---|---|---|
| Stance | Low and wide, dug in | Raised, on legs |
| Says | Civic, permanent, kin to the homes | The founding story; a landmark |
| Tallest point | campanile 31 m (the roof 15.6 m) | mast 29 m (the deck 13.4 m) |
| Footprint | podium r 21.5, forecourt out 44 m in front | footpads at r 19, the stair out 25 m in front |
| Play | Terraces to climb at the back, a canopy roof, the forecourt | **A skater passes under the vessel**; legs, the long stair's rails, the deck |
| Clock | Open dial on the campanile, seen from both sides | Dial on the lantern's front |
| Triangles (draft) | 8.0k | 8.3k |
| Game work | Colliders: drum, terraces as stepped rings, canopy, pylon | Colliders: pitched boxes on the legs (as the Orrery's), the stair as a ramp, the vessel, the deck as a floor |

Either stands where the **gold council dome** is, at the Civic Center's middle, and replaces it and the clock-tower hall
both (the blurb's "gold council dome" would change with it).

**Recommendation: A for the hall.** It is the one that reads as a seat of government, and its terraces tie it to the
homes. B is the stronger landmark and the better thing to skate; if that matters more for the HQ, take B.

## 3. The layouts

Three plans without the hub dome. Each keeps the landing pad where `buildTown` lays it today, (-65, 55), and stays inside
0.85 of the town's radius. `node tools/kepler-layouts.mjs` checks them (2 m between footprints, the pad's flight disc
clear; all four pass) and `node tools/kepler-layouts.mjs docs` redraws the plans. The defence ring's guns and the roads in
from the ring road are not drawn: the guns stand outside all of this, and a road would be brought to each layout's paved
edge when it is built.

### 1: Main Street

![Main Street](town_1_aerial.jpg)

One paved street 144 m long. **Six shops in a terrace on its sunward side, four more and a market square with stalls on
the other.** Four longhouses on a back lane behind the terrace; three domes behind the square, joined by tunnels; a dome at
each far corner. The water tank closes the street's east end, the pad is off its west end.

| | |
|---|---|
| ![Plan](layout-1.svg) | ![On the street, looking east](town_1_street.jpg) |

5 domes, 4 longhouses, 10 shops, 3 stalls. Play: a 144 m straight with kerbs and awnings to grind.

### 2: The Caterpillar

![The Caterpillar](town_2_aerial.jpg)

**Nine raised modules chained in a shallow arc 100 m long**, the orange commons in the middle. A promenade runs along the
chain; a market court opens off it, three shops each side and stalls between. Two longhouses flank the court; a dome
anchors each end of the chain and a third stands behind it with the greenhouses.

| | |
|---|---|
| ![Plan](layout-2.svg) | ![On the promenade, looking along the chain](town_2_street.jpg) |

3 domes, 9 modules, 2 longhouses, 6 shops, 3 stalls. Play: under the chain between the legs, up the stairs, along the
roofs from collar to collar.

### 3: The Courtyard

![The Courtyard](town_3_aerial.jpg)

**Six domes in a ring 120 m across, joined by tunnels into one wall with a single gate** toward the pad. Inside, a paved
market court round the water tank: six shops in an arc along the far side facing the gate, stalls round the tank, the two
greenhouses.

| | |
|---|---|
| ![Plan](layout-3.svg) | ![In the gate, looking in](town_3_street.jpg) |

6 domes, 6 shops, 4 stalls. Play: a closed court to lap, tunnel roofs as a ring to ride.

### Which town gets which

| Town | Layout | Why |
|---|---|---|
| Tranquility Commons | 3, the Courtyard | The commons is the court; it has the most homes, and "the best noodle bar on the Moon" gets a front on it |
| Aldrin Heights | 2, the Caterpillar | Observatory crews in station modules; the water tank stays its landmark |
| Twilight Waystation | 1, Main Street | A waystation is a strip you pass through |
| Hertzsprung Refuge | 3, the Courtyard | "A huddle of Kepler domes": the closed ring, on the dark side |
| Kepler Civic Center | its own (below) | The hall at the middle |

Two towns share the Courtyard; they would differ by the seeded dome sizes and which shops they hold. Say if you would
rather a different split.

### The Civic Center

![The Civic Center, with hall A](civic_aerial.jpg)

The hall at the middle. **Civic Avenue** runs 70 m from the arrivals side to its forecourt between two rows of four shops;
five big family domes close the back in an arc, joined by tunnels; longhouses either side of the avenue.

| | |
|---|---|
| ![Plan](layout-civic.svg) | ![On Civic Avenue](civic_street.jpg) |

## The other dome settlements

`habDome` is also used by your own town (three small domes, `hometown.js`), the founded outposts (the homestead and field
lab, `storyAssets.js`) and Meridian Exchange (one 22 m dome). They would take the picked dome when the kit is built. The
ILMB's two family domes are already Blender, in pink and gold: say if they should change to match.

## After the picks

1. `tools/blender/build_kepler.py` -> `src/assets/kepler.glb`: the picked dome(s) at the sizes the towns use, the hall, the
   pieces, with colliders as `col` empties and the clock's hands and the orbit ring as pivots. The tunnel, cabin,
   playground, greenhouse and water tower are ported at the same time (the playground is not drafted here).
2. `buildTown` lays the towns from the picked layouts (positions in a data file, as `src/ilmbLayout.js`), baked into the
   Kit the way the ILMB's quarters are; the code builders go, or stay behind a flag.
3. Asset Row items, the source map, the collider checklist of `docs/collision.md`, and a look at each town in the game.

## The files

| | |
|---|---|
| `tools/blender/proposals/kepler_kit.py` | the palette, the two domes, the station pieces, the Earth dial |
| `tools/blender/proposals/kepler_domes.py` | the domes, or the pieces (`KEPLER_SET=pieces`), lined up |
| `tools/blender/proposals/kepler_hall_a.py`, `kepler_hall_b.py` | the two halls |
| `tools/blender/proposals/kepler_town.py` | a layout stood up in 3D (`KEPLER_LAYOUT=1`, `2`, `3`, `civic`; `KEPLER_HALL=a`, `b`) |
| `tools/blender/proposals/preview_kepler.py` | the renders: `blender -b --factory-startup --python tools/blender/proposals/preview_kepler.py -- [target ...]` |
| `tools/kepler-layouts.mjs` | the layouts' data, the clearance check, the plans, `layouts.json` |

The structure audit (`tools/blender/structure_audit.py`) on the halls, the domes and the pieces leaves only what is meant:
the clock hands' free tips, the arbor through the Earth's disc, and paint bands lying on a roof's edge.
