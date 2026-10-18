// Dev-only: screenshots of the Lucky Crater Casino from fixed vantage points (docs/casino-layouts.md, "How it gets built"). Not part of the build.
//   npx vite --port 5199 --host 127.0.0.1      (in one shell)
//   node tools/casino-shots.mjs [outdir] [name ...]     (Playwright from PLAYWRIGHT, default /opt/node-tools/node_modules/playwright/index.mjs; the game from GAME_URL)
// Each view is a camera and a look-at point in the casino's frame (metres: +x right, +z toward the doors, y up). The probe flies the camera itself, hides the HUD and the player, and
// waits for frames to run; with swiftshader a frame takes a second or two, so a view is ready after a few seconds.
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const OUT = process.argv[2] || 'casino-shots';
const ONLY = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });

export const VIEWS = [
  ['in-door-nave', [0, 2.2, 13], [0, 5, -18]],           // from the doors, down the foyer into the crossing and the Plinko arm
  ['in-foyer-left', [-6, 2.2, 12], [8, 3, 4]],           // the foyer's east wall: the prize counter
  ['in-crossing-n', [0, 2.2, -4], [0, 8, -40]],          // from the crossing's south, up the Plinko arm
  ['in-crossing-w', [-2, 2.4, -13], [-40, 4, -13]],      // into the west wing
  ['in-crossing-e', [2, 2.4, -13], [40, 4, -13]],        // into the east wing
  ['in-west-wing', [-14, 2.4, -8], [-44, 3, -14]],       // the west wing: claw, classic slots, blackjack
  ['in-east-wing', [14, 2.4, -6], [40, 3.5, -18]],       // the east wing: the Duck Derby
  ['in-ceiling', [0, 6, -4], [0, 15, -22]],              // the crossing's ceiling
  ['out-front', [0, 4, 60], [0, 10, 14]],                // the front, from the boulevard
  ['out-left', [-70, 6, 30], [0, 8, -10]],               // the west flank
  ['out-right', [70, 10, 40], [0, 10, -10]],             // the east flank
  ['out-air', [0, 70, 80], [0, 14, -12]],                // the roofs and the dome from the air
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await pg.goto(process.env.GAME_URL || 'http://127.0.0.1:5199/', { waitUntil: 'load' });
  await pg.waitForFunction('window.game && window.game.world', null, { timeout: 180000 });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(4000);
  for (let i = 0; i < 14; i++) { let st = null; try { st = await pg.evaluate('window.game.state'); } catch (e) { await pg.waitForTimeout(2500); continue; } if (st === 'play') break; await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); }
  await pg.waitForTimeout(2000);
  await pg.addStyleTag({ content: '#hud, #splash, .overlay, #dialog, #popups { display: none !important; }' });
  await pg.evaluate(() => {
    const g = window.game, loc = g.locations.find((l) => l.id === 'casino');
    const start = g.world.toWorld(loc, 0, 1, 24);
    g.player.body.pos.copy(start); g.player.vel.set(0, 0, 0); g.player.center.copy(start);
  });
  await pg.waitForTimeout(6000);
  await pg.evaluate(() => { window.game.updateCamera = () => {}; });
  for (const [name, cam, look] of VIEWS) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    await pg.evaluate(([c, l]) => {
      const g = window.game, cw = g.world.casino, cm = g.camera;
      cm.position.copy(cw.toWorld(c[0], c[1], c[2])); cm.up.copy(cw.up); cm.lookAt(cw.toWorld(l[0], l[1], l[2])); cm.updateMatrixWorld();
      g.player.model.root.visible = false;
    }, [cam, look]);
    await pg.waitForTimeout(2500);
    await pg.screenshot({ path: `${OUT}/${name}.png` });
    console.log('shot', name);
  }
  console.log(errs.slice(0, 5).join('\n') || 'no page errors');
  await b.close();
}
