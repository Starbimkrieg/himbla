// Dev-only: shoots the Antimatter Lab draft's screen mock-ups (docs/zbornak-proposals/screens/terminal.html) to PNGs: the lab
// terminal's close-up (terminal_splices.png, terminal_reactor.png, in docs/zbornak-proposals) and the pictures
// preview_zbornak_lab.py paints on the in-world screens (screens/<id>.png). Not in the build.
//   npx vite --port 5199 --host 127.0.0.1      (in one shell; the page takes the game's fonts from node_modules)
//   node tools/zbornak-screens.mjs             (Playwright from PLAYWRIGHT, default /opt/node-tools/node_modules/playwright/index.mjs)
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const DOCS = fileURLToPath(new URL('../docs/zbornak-proposals/', import.meta.url));
const URL_ = (process.env.GAME_URL || 'http://127.0.0.1:5199/') + 'docs/zbornak-proposals/screens/terminal.html';
const SHOTS = [
  // [query, width, height, file]: the screens' sizes keep their quads' proportions (zbornak_kit.py)
  ['s=full&tab=0', 1280, 720, 'terminal_splices.png'],
  ['s=full&tab=1', 1280, 720, 'terminal_reactor.png'],
  ['s=lab&tab=1', 1120, 640, 'screens/lab.png'],
  ['s=pen', 750, 450, 'screens/pen.png'],
  ['s=sec', 660, 450, 'screens/sec.png'],
  ...[0, 1, 2, 3].map((k) => [`s=drone&k=${k}`, 780, 480, `screens/drone${k}.png`]),
];
const b = await chromium.launch();
for (const [q, w, h, file] of SHOTS) {
  const pg = await b.newPage({ viewport: { width: w, height: h } });
  await pg.goto(`${URL_}?${q}`, { waitUntil: 'networkidle' });
  await pg.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))]));
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: DOCS + file });
  console.log('shot', file);
  await pg.close();
}
await b.close();
