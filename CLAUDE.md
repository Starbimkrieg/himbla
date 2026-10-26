# Moon-Runner

Three.js lunar-courier game (Vite, Electron for desktop). `README.md` is just the pitch and the downloads;
`docs/reference.md` has the full feature list and the source map (the "tools/" and "src/assets" lists). Read the
part you need rather than the whole file.

## Commands

- `npm install`, then `npm run dev` (http://localhost:5173)
- `npm run build:release` makes the release bundle (`vite build --mode release`, which leaves out the dev tools:
  F8 menu, cheats, F3 overlay, git menu, Asset Row, `?trailer`, `window.game`); `npm run check:dev-strip` proves it.
- `npm run check:outposts` checks `src/assets/outposts.glb` against `docs/outpost-glb.md`.
- `npm run optimize:glb` compresses the models in `src/assets`.

## Models (Blender)

Models are built from code by `tools/blender/build_*.py` and exported to `src/assets/*.glb`. Headless Blender
(`bpy` 5.2.2, needs Python 3.13) is installed by the SessionStart hook via `tools/setup-blender.sh`; if it is
missing, run that script. Use the `blender` skill (`.claude/skills/blender/SKILL.md`) for conventions and the
build, compress and check workflow.

## Collision and ledge grinds (every place)

Trick thrust reaches every roof, and the top edges of colliders are grind rails, so each place follows the same rules.
`docs/collision.md` has them in full, with the reasons and a checklist. In short:

- Anything solid the runner can reach gets a collider whose top is the drawn top: roofs too, never a box "to the ridge"
  over a pitched roof. Thin decoration (lamp heads, festoons, ropes, lettering, glow, seats in rows) stays open.
- Walking floors collide at their drawn height: `k.floorCols = true` in a place's `settle()` builds colliders under every
  drawn floor up to 0.42 m (`Kit.floorColliders`), or the feet sink to the ground under it; the physics treats them as
  ground, not obstacles (`floorUnder`), so their edges never bump you. Platforms of 0.42 to 0.9 m
  get none (the runner steps up only about 0.4 m: they'd stop him dead). Raised details on surfaces you stand or grind on
  are painted on (at most 2 cm proud, no ink; at least 1.5 cm on a curved place).
- Blender parts make their own colliders (`parts(..., solid=True)`, `tools/blender/downs_common.py`); code-made geometry
  has them in code beside it (`k.solid`, `k.solidQ`, `slabBox`); hand boxes only where a part's own can't (openings).
- Ledges grind on places in `LEDGE_PLACES` (`src/rails.js`), only on skates, from the air and heading along; rails are
  found by `src/ledges.js`.
- Check a place with `PLACE=<id> node tools/downs-audit.mjs coverage|floating|blocked|sunk|rails`: no floor the feet sink
  into, and every long rail should ride end to end.

## Screenshots in dev sessions

When you start a game to test visuals or gameplay (headless or in the browser pane), skip the tutorial first, or BOLT's
courier-school dialog opens a few seconds into play and covers every screenshot (it is a modal state: nothing else runs
until it is answered). Set the flag before starting:

```js
game.tutorial.done = true; // no BOLT offer (src/main.js only offers it while this is false)
game.startPlay();
```

If a dialog is up anyway, `game.state` is `'dialog'`: answer it with `game.pickDialog(i)` (`game.dialogButtons` lists the choices).

When you look at something in the running game (a dev server in the browser pane), turn on the free cam and hide
the HUD first, so screenshots show the world and nothing over it. From the page, once `game.state` is `'play'`:

```js
const fc = game.cheats.freeCam;
fc.start(); fc.setHud(true); // fly cam on; hides #hud (panels, speedometer, prompts, popups)
for (const id of ['free-cam', 'gitchip']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } // the cam's hint and the git chip stay up otherwise
fc.pos.set(x, y, z); fc.fwd.set(dx, dy, dz); fc.pitch = -0.3; fc.level(); // place and aim it
```

Then let a frame or two run before the screenshot. Leave the F3 overlay off. `fc.stop()` brings the HUD back (the
hint and the git chip stay hidden until a reload). `src/freecam.js` has the controls.

## Conventions

- Don't open a PR unless asked. Dev changes go on the branch the session names.
- Bump nothing in `package.json` unless releasing (`Release x.y.z [release]` commit message triggers the workflow).
- Keep the source map in `docs/reference.md` and CHANGELOG.md in step with what you change.
- Code style: the `coding-standards` skill (`.claude/skills/coding-standards/SKILL.md`), except that its immutability,
  function-length and magic-number rules don't apply here. Per-frame code mutates scratch vectors on purpose, model
  factories are long on purpose, and tuned constants sit inline with a comment. The skill's top section says why.
- After committing, shut down every dev or preview server you started for the work (`preview_stop`, or end the
  process). Leave alone any server you didn't start: the user often has their own on port 5173.
