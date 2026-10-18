// Proves a release build carries none of the dev tools (src/devtools.js, vite.config.js).
//
//   node tools/check-dev-strip.mjs          checks the stand-in (src/cheatsStub.js) has every member the game uses, then builds
//                                           release and normal bundles (in a temp folder) and searches them: no dev-menu
//                                           string may be in the release one, all must be in the normal one
//   node tools/check-dev-strip.mjs --static only the stand-in check (no build)
//
// Exit 0 when all holds, 1 otherwise.
import { readFileSync, readdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
let bad = 0;
const fail = (m) => { bad++; console.log('FAIL', m); };

// ---- 1. the stand-in covers what the game uses of game.cheats and the debug overlay (game.devOverlay)
const stub = readFileSync(join(SRC, 'cheatsStub.js'), 'utf8').replace(/\r\n/g, '\n'); // Windows checkouts are CRLF; the patterns are LF
const members = (text) => { // a class body's `this.x =` fields and methods
  const have = new Set([...text.matchAll(/this\.(\w+) =/g)].map((m) => m[1]));
  for (const m of text.matchAll(/^  (?:get )?(\w+)\(.*\) \{/gm)) have.add(m[1]);
  return have;
};
const [, overlayText, cheatsText] = stub.match(/class DevOverlay \{([\s\S]*?)\n\}\n[\s\S]*?export class Cheats \{([\s\S]*)\n\}\n/) || [];
if (!overlayText) { fail('src/cheatsStub.js: could not find its DevOverlay and Cheats classes'); process.exit(1); }
const [, freeText] = stub.match(/class FreeCam \{([\s\S]*?)\n\}\n/) || [];
if (!freeText) { fail('src/cheatsStub.js: could not find its FreeCam class'); process.exit(1); }
const haveCheats = members(cheatsText), haveOverlay = members(overlayText), haveFree = members(freeText);
const DEV_ONLY = new Set(['cheatsStub.js', 'cheats.js', 'devtools.js', 'devoverlay.js', 'freecam.js']); // the dev tools' own files may use anything
const usedCheats = new Map(), usedOverlay = new Map(), usedFree = new Map();
for (const f of readdirSync(SRC)) {
  if (!f.endsWith('.js') || DEV_ONLY.has(f) || f.startsWith('assetRow')) continue;
  const text = readFileSync(join(SRC, f), 'utf8');
  for (const m of text.matchAll(/\bcheats\.(\w+)/g)) if (m[1] !== 'js' && !usedCheats.has(m[1])) usedCheats.set(m[1], f); // "cheats.js" in a comment is the file name
  for (const m of text.matchAll(/\b(?:devOverlay|dbg|cheats\.overlay)\.(\w+)/g)) if (!usedOverlay.has(m[1])) usedOverlay.set(m[1], f);
  for (const m of text.matchAll(/\bcheats\.freeCam\.(\w+)/g)) if (!usedFree.has(m[1])) usedFree.set(m[1], f);
}
for (const [name, f] of usedCheats) if (!haveCheats.has(name)) fail(`src/${f} uses cheats.${name}, which src/cheatsStub.js does not have`);
for (const [name, f] of usedOverlay) if (!haveOverlay.has(name)) fail(`src/${f} uses the debug overlay's ${name}(), which src/cheatsStub.js does not have`);
for (const [name, f] of usedFree) if (!haveFree.has(name)) fail(`src/${f} uses the free cam's ${name}(), which src/cheatsStub.js does not have`);
console.log(`stand-in: ${usedCheats.size} cheats members, ${usedOverlay.size} overlay members and ${usedFree.size} free cam members used by the game, ${haveCheats.size}, ${haveOverlay.size} and ${haveFree.size} in the stand-in`);

if (!process.argv.includes('--static')) {
  // ---- 2. release build vs normal build
  const build = (mode) => {
    const out = mkdtempSync(join(tmpdir(), `mr-${mode}-`));
    execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', mode, '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit' });
    let text = '', bytes = 0;
    const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|html)$/.test(e)) { const t = readFileSync(p, 'utf8'); text += t; bytes += t.length; } } };
    walk(out);
    rmSync(out, { recursive: true, force: true });
    return { text, bytes };
  };
  // strings only the dev tools carry (menu titles, a storage key, the Asset Row's name...)
  const MARKS = ['DEV MENU', 'FULL CHEAT MENU', 'mr-dev-unlocked', 'CLICK MAP TO TELEPORT', 'SPAWN PIRATE SQUAD', 'INPUT & CONTROLLER MONITOR', 'ASSET ROW', 'DEBUG OVERLAY', 'CPU TIME BY STAGE', 'FETCH & PULL UPSTREAM', 'dev-btn-pause', 'Meteor Spawn (dev)', 'PREPARING THE TRAILER', 'FREE CAM'];
  const dev = build('production'), rel = build('release');
  for (const m of MARKS) {
    if (!dev.text.includes(m)) fail(`"${m}" is not in the normal build, so this check proves nothing about it (stale string?)`);
    if (rel.text.includes(m)) fail(`"${m}" is in the release build`);
  }
  const GLOBAL = /window\.game\s*=[^=]/; // the console / harness handle
  if (!GLOBAL.test(dev.text)) fail('window.game is not assigned in the normal build, so this check proves nothing about it');
  if (GLOBAL.test(rel.text)) fail('window.game is assigned in the release build');
  console.log(`normal build ${(dev.bytes / 1e6).toFixed(2)} MB of js+html, release build ${(rel.bytes / 1e6).toFixed(2)} MB; ${MARKS.length} dev-tool strings searched for`);
}
console.log(bad ? `\n${bad} problem(s)` : '\nok');
process.exit(bad ? 1 : 0);
