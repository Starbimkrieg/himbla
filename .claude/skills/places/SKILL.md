---
name: places
description: Rules for building or changing a place the runner can reach (settlements, outposts, Chimera Downs, the Antimatter Lab, the casino, hometown, chambers): colliders and roofs, walking floors, step heights, ledge grinds, and storage crates. Use before adding or moving anything solid in a place, its floors or colliders, its rails, or its cargo, in game code or in a Blender place model.
---

# Places: collision, ledge grinds, cargo

Trick thrust reaches every roof, and the top edges of colliders are grind rails, so every place follows these rules.
`docs/collision.md` has them in full with the physics behind them, and ends with a checklist: **work through that
checklist before you commit a place change.** Blender models of places also follow the blender skill (Model structure).

## Colliders

- **Anything solid the runner can reach gets a collider whose top is the drawn top.** Roofs too: never a box "to the ridge"
  over a pitched roof. Thin decoration stays open: lamp heads, festoons, ropes, lettering, glow, glass, trims under 12 cm,
  seats in rows, crowds, moving rides.
- **Where colliders come from:** Blender parts make their own (`parts(..., solid=True)`, `tools/blender/downs_common.py`);
  code-made geometry has them in code beside it (`k.solid`, `k.solidQ`, `slabBox`); hand boxes only where a part's own can't
  (openings).

## Floors and steps

- **Walking floors collide at their drawn height.** Set `k.floorCols = true` in the place's `settle()`: `Kit.floorColliders`
  builds colliders under every drawn floor up to 0.42 m, or the feet sink to the ground under it. The physics treats them as
  ground, not obstacles (`floorUnder` in `physics.js`), so their edges never bump the runner.
- **Platforms of 0.42 to 0.9 m get no collider.** The runner steps up only about 0.4 m; they would stop him dead.
- **Raised details on surfaces you stand or grind on are painted on:** at most 2 cm proud, no ink, and at least 1.5 cm proud
  on a curved place (`curved` in `locations.js`), or they sink into the surface in patches.

## Ledge grinds

Ledges grind only on places listed in `LEDGE_PLACES` (`src/rails.js`), only on skates, from the air and heading along the
edge. `src/ledges.js` finds the rails.

## Storage crates

The standard cargo container (the land-train's box, as stacked in Meridian's yard), never ad-hoc boxes: `cargoStack`
(`src/settlements.js`) in the game, `cargo_unit("box")` (`tools/blender/cargo.py`) in Blender. Paint it in the owner's
livery: a faction's, or the place's own branding on the flank plate (`zb_container` in `tools/blender/zbornak_kit.py` does
Zbornak Laboratories'). Stack them at the yard's pitch.

## Check it

`tools/downs-audit.mjs` needs a dev server on port 5199 (its header lists every mode and what each finds):

```bash
npx vite --port 5199 --host 127.0.0.1
```

```bash
PLACE=<id> node tools/downs-audit.mjs coverage    # solid surfaces nothing collides with
```

`sunk` (floors the feet sink into) and `rails` (each long rail ridden end to end) work on any place; `blocked` (ground made
unwalkable) and `floating` (collider tops over nothing drawn) need a place built with `settle()`. Stop the server after.

Expect no floor the feet sink into, and every long rail riding end to end. Then look at it in the game (playtest skill).

### The small outposts

The seven small outposts (`src/outpostDrafts.js`, placed by `territory.js`) are Kit code but not places, so `downs-audit.mjs`
doesn't reach them. They have their own audit, to run on every change to one (same dev server):

```bash
node tools/outpost-audit.mjs                # all seven; or name kinds: tower junk
```

```bash
WRECK=1 node tools/outpost-audit.mjs        # their wrecks
```

It lists loose pieces (a barrel off its gun), solid parts with no collider within 0.35 m, collider tops over air, and the
walking NPCs' routes through colliders. Read every finding and fix it or say why it stays; then look at the outpost in the
viewer (`/tools/viewer.html?m=outpost&kind=<kind>&draft=<letter>`, `&compare=1` beside the old build) from two sides and
close. Outposts are placed with every collider's yaw, pitch and roll (`territory.place`), so a sloped part's collider is a
`k.solidQ` lying as the part lies. Buildings grown in a scaled frame (`within(..., sc)`, `grow`) scale their colliders with
them (`Kit.sc`); helpers that call `Kit.at` (`quonset`, `habDome`, `cargoStack`'s standard boxes) stay outside such frames.
