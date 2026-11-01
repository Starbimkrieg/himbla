// Dev-only: shoots the Antimatter Lab drafts' screen mock-ups (docs/zbornak-proposals/screens/terminal.html) to PNGs: the lab
// terminal's close-up for each draft (terminal_a_splices.png, terminal_a_reactor.png, terminal_b.png, in docs/zbornak-proposals)
// and the pictures preview_zbornak_lab.py paints on the in-world screens (screens/<id>_<draft>.png). Not in the build.
//   npx vite --port 5199 --host 127.0.0.1      (in one shell; the page takes the game's fonts from node_modules)
//   node tools/zbornak-screens.mjs             (Playwright from PLAYWRIGHT, default /opt/node-tools/node_modules/playwright/index.mjs)
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const DOCS = fileURLToPath(new URL('../docs/zbornak-proposals/', import.meta.url));
const URL_ = (process.env.GAME_URL || 'http://127.0.0.1:5199/') + 'docs/zbornak-proposals/screens/terminal.html';
const SHOTS = [
  // [query, width, height, file]: the screens' sizes keep their quads' proportions (zbornak_kit.py)
  ['s=full&d=a&tab=0', 1280, 720, 'terminal_a_splices.png'],
  ['s=full&d=a&tab=1', 1280, 720, 'terminal_a_reactor.png'],
  ['s=full&d=b', 1280, 720, 'terminal_b.png'],
  ['s=lab&d=a&tab=1', 1040, 600, 'screens/lab_a.png'],
  ['s=lab&d=b', 620, 960, 'screens/lab_b.png'],
  ['s=pen&d=a', 750, 450, 'screens/pen_a.png'],
  ['s=pen&d=b', 750, 450, 'screens/pen_b.png'],
  ['s=sec&d=a', 660, 450, 'screens/sec_a.png'],
  ['s=sec&d=b', 544, 800, 'screens/sec_b.png'],
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
