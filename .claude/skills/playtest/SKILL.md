---
name: playtest
description: Run Moon-Runner and look at it, in a browser pane or headless Chromium; screenshots, visual checks and gameplay checks. Use whenever you start the game to see a change, take a screenshot, or test something in play, including checking a model or a place after building it.
---

# Playtesting and screenshots

## Start it

- `npm run dev` serves http://localhost:5173 (`.claude/launch.json` also has `moon-runner-alt` on 5174 for when the user's
  own server holds 5173). The user often runs their own server on 5173: never stop one you didn't start.
- Headless: Chromium and Playwright are preinstalled in cloud sessions (`require('playwright')`, `chromium.launch()`; WebGL
  through swiftshader needs `args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']`, a few seconds a
  frame). Add `page.on('pageerror', ...)` and wait for `window.game.state === 'title'` before driving it.
- `window.game` exists only in dev builds (not `--mode release`).

## Skip the tutorial first

BOLT's courier-school dialog opens a few seconds into play and covers every screenshot. It is a modal state: nothing else
runs until it is answered. Set the flag before starting play:

```js
game.tutorial.done = true; // no BOLT offer (src/main.js only offers it while this is false)
game.startPlay();
```

If a dialog is up anyway, `game.state` is `'dialog'`: answer it with `game.pickDialog(i)` (`game.dialogButtons` lists the choices).

## Screenshots: free cam, HUD hidden

Once `game.state` is `'play'`, one call turns the free cam on, hides the HUD, the cam's hint and the git chip, and places it:

```js
game.cheats.freeCam.shot(x, y, z, dx, dy, dz, pitch); // position, look direction (along the ground), pitch in rad (default -0.3)
```

Let a frame or two run before the screenshot. Leave the F3 overlay off. `game.cheats.freeCam.stop()` brings the HUD back
(the hint and chip stay hidden until a reload). `src/freecam.js` has the controls.

- Look at each changed part close, and from two sides.
- Screenshots a person will see: `deviceScaleFactor: 2`. Ones only you look at: 1.

## Other entry points

- Asset Row (every model side by side): F8 → Full cheat menu → Teleport → option 1. Headless check that every item builds:
  the blender skill, "Keep the Asset Row in step".
- Model viewer: `/tools/viewer.html?m=<model>` (`&outfit=...` for the courier).
- Place audits (colliders, floors, rails): the places skill.

## When done

Stop every dev, preview or headless server you started (`preview_stop`, or end the process). Leave the user's alone.
