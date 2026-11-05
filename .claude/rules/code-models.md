---
paths:
  - "src/outpostDrafts.js"
  - "src/settlements.js"
  - "src/world.js"
  - "src/storyAssets.js"
  - "src/models.js"
  - "src/casinoWorld.js"
  - "src/hometown.js"
  - "src/chamber.js"
  - "src/secrets.js"
  - "src/spindle.js"
  - "src/landingPad.js"
  - "src/alchemy.js"
  - "src/townsfolk.js"
  - "src/events.js"
  - "src/medevac.js"
  - "src/tutorial.js"
---

# Code-built models: Blender is the default

This file builds models from three.js primitives in code (`docs/code-vs-blender.md`). Unless the user says to do it in code,
**a new model or any refinement of how one looks goes to Blender**: port the model to `tools/blender/build_<name>.py` first,
then refine it there (blender skill, "Blender by default"). Say in your first reply that you're porting it. Fixes that aren't the
model's look (colliders, placement, gameplay numbers) stay here. A hook blocks an edit that adds 3 or more primitives here.
