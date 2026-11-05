# Moon-Runner

Three.js lunar-courier game (Vite; Electron for desktop). `docs/reference.md` has the feature list and the source map; read
the part you need. `README.md` is only the pitch and downloads.

## Commands

- `npm install`, then `npm run dev` (http://localhost:5173)
- `npm run build:release`: the release bundle, without the dev tools (F8 menu, cheats, F3, git menu, Asset Row, `?trailer`,
  `window.game`). `npm run check:dev-strip` proves they're gone.
- `npm run check:outposts`: checks `src/assets/outposts.glb` against `docs/outpost-glb.md`.
- `npm run optimize:glb`: compresses the models in `src/assets`.

## Before you start, use the skill for the job

| When you are... | Use |
|---|---|
| editing `tools/blender/` or any `.glb` (models are built from code there) | **blender** skill |
| adding or moving anything solid, a floor, a rail or cargo in a place | **places** skill |
| starting the game to look at or test something | **playtest** skill |
| writing or reviewing code | **coding-standards** skill |

`.claude/rules/` loads a short version of the first two when you open those files.

## Conventions

- Work on the branch the session names. Don't open a PR unless asked.
- Keep `CHANGELOG.md` (under "Unreleased") and the source map in `docs/reference.md` in step with every change.
- Don't touch `package.json`'s version except to release (a `Release x.y.z [release]` commit triggers the workflow).
- After committing, stop every dev or preview server you started. Leave the user's own (often on 5173) alone.

## What the hooks check (`tools/claude-hooks.mjs`, `.claude/settings.json`)

- **Before `git push`**, the push is blocked if the commits going up bump the version without `[release]`, change `src/` or
  `tools/` without `CHANGELOG.md` (`[no-changelog]` in a message to waive), or add or remove a source file the source
  map doesn't reflect (`[no-docs]` to waive). Run `git commit` and `git push` as separate commands. When blocked, fix it in
  a new commit; don't waive a rule that applies.
- **After a Blender build**: the audit and after-build steps are added to your context. **After a commit**: any servers
  still running, and a `.glb` changed without the Asset Row.
- **Session start**: installs headless Blender (`tools/setup-blender.sh`) and, if missing, `node_modules` (`tools/setup-node.sh`).
