// Dev-only: films the Antimatter Lab draft's drone feeds: an aerial shot of four settlements from the running game
// (docs/zbornak-proposals/screens/feed_<id>.jpg), which screens/terminal.html (?s=drone&k=0..3) dresses as drone footage
// and tools/zbornak-screens.mjs shoots for the drone wall's panels. Not in the build.
//   npx vite --port 5199 --host 127.0.0.1      (in one shell)
//   node tools/zbornak-drones.mjs              (a few minutes: each settlement is streamed in, then shot)
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const OUT = fileURLToPath(new URL('../docs/zbornak-proposals/screens/', import.meta.url));
// [location id, camera, look-at] in the location's frame (m)
const SPOTS = [['meridian', [70, 75, 150], [0, 0, -20]], ['ilmb', [90, 80, 140], [0, 0, 0]], ['vostok', [-80, 70, 120], [0, 5, 0]], ['kepler', [80, 60, 110], [0, 0, 0]]];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 960, height: 590 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(process.env.GAME_URL || 'http://127.0.0.1:5199/', { waitUntil: 'load' });
await pg.waitForFunction('window.game && window.game.state === "title"', null, { timeout: 180000 });
await pg.evaluate(() => { window.game.tutorial.done = true; window.game.startPlay(); });
await pg.waitForTimeout(5000);
await pg.evaluate(() => { const g = window.game; if (g.state === 'dialog') g.pickDialog(0); });
await pg.addStyleTag({ content: '#hud, #splash, .overlay, #dialog, #popups, #free-cam, #gitchip { display: none !important; }' });
for (const [id, cam, look] of SPOTS) {
  await pg.evaluate((id) => {
    const g = window.game, loc = g.locations.find((l) => l.id === id);
    const start = g.world.toWorld(loc, 0, 2, 60);
    g.player.body.pos.copy(start); g.player.vel.set(0, 0, 0); g.player.center.copy(start);
    g.updateCamera = g._uc || g.updateCamera;
  }, id);
  await pg.waitForTimeout(9000);
  await pg.evaluate(([id, c, l]) => {
    const g = window.game; g._uc ||= g.updateCamera; g.updateCamera = () => {};
    const loc = g.locations.find((x) => x.id === id), W = g.world, cm = g.camera;
    const o = W.toWorld(loc, 0, 0, 0), up = W.toWorld(loc, 0, 1, 0).sub(o).normalize();
    cm.position.copy(W.toWorld(loc, c[0], c[1], c[2])); cm.up.copy(up); cm.lookAt(W.toWorld(loc, l[0], l[1], l[2])); cm.updateMatrixWorld();
    g.player.model.root.visible = false;
  }, [id, cam, look]);
  await pg.waitForTimeout(3500);
  await pg.screenshot({ path: `${OUT}feed_${id}.jpg`, type: 'jpeg', quality: 85, timeout: 240000 });
  console.log('shot', id);
}
console.log(errs.slice(0, 3).join('\n') || 'no page errors');
await b.close();
