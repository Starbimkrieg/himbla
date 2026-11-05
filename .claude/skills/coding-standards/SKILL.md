---
name: coding-standards
description: Moon-Runner's coding conventions (plain JavaScript, three.js, Vite) for writing, reviewing or refactoring code in src/ or tools/, including naming and what not to "fix". Use when reviewing code quality or naming.
metadata:
  origin: ECC (affaan-m/ECC, skills/coding-standards), cut down to what applies to this repo (no React, REST, database, TypeScript or test suite here)
---

# Coding standards

Plain-JavaScript three.js game, ES modules, no TypeScript, no framework, no test suite (checks are scripts under `tools/`).
**Where this file and the code around you disagree, match the surrounding code.**

## What the repo does on purpose (don't flag or refactor these)

- **Mutation in per-frame code.** Hot paths mutate module-level scratch vectors and quaternions (`_v`, `_mu`, `_mf` in
  `src/vehicles.js`) and use three.js's in-place methods (`.copy()`, `.addScaledVector()`, `.applyQuaternion()`) so they
  make no garbage 60 times a second. Spreading or cloning there costs frame time. Outside hot paths, use judgement.
- **Long functions.** Model factories (`makeRover`, `makeInterceptor`, `makeApc` in `src/models.js`) and per-frame steps
  (the Garage's drive update) are one model or one step per function.
- **Inline tuned constants** with a comment saying what they do (`stick: 70`, `RIDE_LIFT = 0.2`, the wheel frame
  `(±1.85, 0.85, ±1.8)`). Name a constant when it is shared, not because it is a number.
- **Short names in tight scopes** (`k` for a kit, `g` for the game, `_v` scratch), as the surrounding code does.

## What to hold to

- **Readable first.** Names say what a thing is (`floorUnder`, `cargoStack`); functions are verbs or verb phrases;
  booleans read as yes/no (`curved`, `floorCols`, `done`).
- **KISS and YAGNI.** The simplest thing that works; no speculative options, layers or generality.
- **DRY where it's real.** Share a helper once a second caller exists (the kits: `Kit`, `downsKit`, `tools/blender/kit.py`);
  don't merge things that only look alike.
- **Early returns over deep nesting** (more than about three levels is a smell).
- **Comments say why**, or what a number means and where it was tuned, not what the next line does. The repo's comment
  style is terse prose with file and function references (`floorUnder` in `physics.js`).
- **Checks fail loudly:** a script under `tools/` exits 1 and says what failed (`check-dev-strip.mjs`, `check-outposts.mjs`).
- **Dev-only code** goes behind `DEV_TOOLS` (`src/devtools.js`) so `vite build --mode release` drops it; `npm run check:dev-strip`
  proves it. A dev member the game calls outside the dev files needs a stand-in in `src/cheatsStub.js`.
- **Async.** `await` independent work together (`Promise.all`); never leave a promise unhandled in a frame loop.

## Reviewing

Flag: unclear names, dead code, duplicated logic with a second real caller, deep nesting, a comment that no longer matches
the code, allocation inside a per-frame loop, dev code outside `DEV_TOOLS`. Don't flag the deliberate patterns above.
