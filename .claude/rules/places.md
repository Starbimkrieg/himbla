---
paths:
  - "src/settlements.js"
  - "src/locations.js"
  - "src/outpostModels.js"
  - "src/outpostDrafts.js"
  - "src/outpostWalkers.js"
  - "src/territory.js"
  - "src/outpostGlb.js"
  - "src/downs*.js"
  - "src/labWorld.js"
  - "src/casino*.js"
  - "src/hometown.js"
  - "src/chamber.js"
  - "src/rails.js"
  - "src/ledges.js"
  - "src/physics.js"
  - "tools/blender/build_downs_*.py"
  - "tools/blender/build_zbornak_lab.py"
  - "tools/blender/downs_common.py"
---

# Places

Invoke the **places** skill before adding or moving anything solid, a floor, a rail or cargo in a place. In short: everything
solid the runner can reach collides at its drawn top (roofs too); walking floors collide via `k.floorCols = true`; platforms of
0.42 to 0.9 m get none; details on walked or ground surfaces are painted on; crates are the standard cargo container.
`docs/collision.md` ends with the checklist to work through before committing.
The small outposts (`src/outpostDrafts.js`) are checked with `node tools/outpost-audit.mjs` (and `WRECK=1`): see the skill.
