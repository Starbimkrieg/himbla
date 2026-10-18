# Moon-Runner

Three.js lunar-courier game (Vite, Electron for desktop). `README.md` has the full feature list and the source
map (the "tools/" and "src/assets" lists); read the part you need rather than the whole file.

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

## Conventions

- Don't open a PR unless asked. Dev changes go on the branch the session names.
- Bump nothing in `package.json` unless releasing (`Release x.y.z [release]` commit message triggers the workflow).
- Keep README's source map and CHANGELOG.md in step with what you change.
- After committing, shut down every dev or preview server you started for the work (`preview_stop`, or end the
  process). Leave alone any server you didn't start: the user often has their own on port 5173.
