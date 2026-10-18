# The Lucky Crater Casino's forecourt: the Valet Court (built)

Status: built. The numbers are in `src/settlements.js` (`dressCasinoLot`, the top of the function) and `src/casinoWorld.js` (the carpet, the carousels, the chip stacks);
`tools/casino-forecourt.mjs` holds the same plan as data, checks its spacing and draws `docs/casino-forecourt-current.svg` (before) and `docs/casino-forecourt-proposed.svg` (as built)
(`node tools/casino-forecourt.mjs docs`; it exits non-zero if the spacing breaks). The frame is the casino's: x across, z out from the doors' wall (its outer face is z 16.4);
the fountain plaza is at z 98 (radius 17).

## What stood there before

- **The boulevard:** asphalt from the doors the whole 65 m to the plaza, a red carpet on it for 36 m, three pairs of neon lamp posts.
- **Two car parks:** 44 x 34 m, centred at x +/-52, z 70, 22 m clear of the boulevard, each with 16 bays (about 12 cars), a cream curb, a flat-colour hedge on three sides, a flat blue P sign and two
  thin lamp poles. Nothing connected them to a road.

## What is there now

**One court, one walkway.** The asphalt ends halfway between the fountain and the doors (z 58.4; the doors are at 16.4 and the fountain at 98, so the middle is 57). From there to the
plaza the way is a **paved walkway**, 10 m wide, and the red carpet runs on down its middle the whole way from the doors to the fountain.

| Part | Where (x, z) | What |
|---|---|---|
| Avenue | x +/-8.6, z 16.4..58.4 | asphalt through the doors' wall to the hall floor, the gold edge lines meeting the wall's plinth beyond the gate's piers; carpet, and velvet ropes on the first 17 m from the doors |
| Wings | x +/-8.6..43.6, z 38.4..58.4 | two rows of six 5.2 x 6.2 m bays (x 11..42.2) either side of a 5.6 m aisle: **24 bays** (it was 32), the aisle open at each outer end; a gold stud at each bay's head |
| Roads | z 48.4, x +/-39 out to the ring road (x about 133) | one from each end of the aisle: the traffic's own road bed (`loc.paved`, laid by `traffic.js pavedStrip`), melting in under the wings' asphalt and joining the ring's inner side by two curved sweeps, as a road T does (`traffic.js inletFor`; the ring's inner berm and ruts make way). Nothing drives on them, as on the Meridian Exchange's avenue |
| Walkway | x +/-5.2, z 58.4..82 | paving with gold lines at x +/-5, a chip inlay every 6 m, chip-stack bollards every 3 m at x +/-5.6,  |
| Crossing | z 56.4..58.4 | a card-stripe crossing (gold and plum) where the court gives way to the walkway |
| Carousels | x +/-19.5, **z 28** (12 m nearer the doors) | so the wings stand behind them with 2.8 m between |
| Chip stacks | (+/-11, 20.6) and (+/-49, 64) | the doors' pair, clear of the carousels; the other pair marks each wing's outer corner |

**Barrier (the hedges are cut).** A wall of giant playing cards edges each wing: `lot_card_wall` modules (2.4 m: a plum kerb with a gold cap and four cards, each turned 14 degrees from the last
like dominoes and leaning back 6 degrees, a suit on both faces, lit so the wall reads from the shaded side) between `lot_card_post` posts (a gold shaft with a chip on a pin), 1.25 m high, 0.6 m
thick, with a collider. North and south runs are 14 modules; the outer end has a two-module stub each side of the aisle's 7.6 m mouth. Chip-stack bollards (`lot_chip_bollard`) edge the walkway.

**Lamps.** Every lamp is the casino's neon post (`lamp_post`, scale 0.92): eight, one at each wing's two north corners and outer south corner and one each side where the walkway starts (x +/-7.4, z 60.4); the old thin poles are gone, and so are the avenue's and the walkway's pairs. The plaza's ring of six is as it was.

**Signs.** The flat blue P is `lot_pylon_p`: a plum post on a gold footing and a brass-framed board with a neon P on both faces and a lit diamond on top, two at each wing's outer end, turned to the road.

**Spacing, checked by the script:** the wings stand 2.8 m behind the carousels; the card wall is 0.4 m from the bays' edges (cars stand inside); lamps, pylons, chip stacks and bollards are 1.5 m or more clear of
everything else.

## The kit (`tools/blender/build_lot.py` -> `src/assets/lot.glb`)

`lot_card_wall`, `lot_card_post`, `lot_chip_bollard`, `lot_pylon_p`, `lot_bay_stud`: one material per mesh named by slot (`LOT_TOON` / `LOT_GLOW` in `src/models.js`), the build stops on any two faces that
share a plane (`audit_coplanar`), and the Asset Row has the kit as one item (`prop.casino-lot`). The suits are the hall's, in a lighter build (`lite_suit`) since a run of the wall repeats them.
The parked hover-cars keep their model (`makeCar`).

## Not done

- The hover-cars are not re-tinted or given an underglow.
- Nothing drives on the two roads (traffic's vehicles still use the ring); they are a bed, ruts and berms, like the Meridian avenue.
