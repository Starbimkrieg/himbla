// winch-ride.mjs: the REAL player and REAL winch, stepped headlessly at a fixed dt past the Lucky Crater Casino's pylon sign (its colliders,
// stood in by the harness since the sign left the game) toward the chip fountain. Dev-only harness for the Hitch-Line winch (src/winch.js;
// docs/winch-handoff.md). Not in the build; needs the dev server (window.game).
//
// WHAT IT DOES.  Teleports the real Player (Player.update -> stepSkater) onto the crater wall in front of the casino, aims the real camera
// at the fountain, presses a real KeyboardEvent E so powers.js fires the real Winch (reticle pick() on the fountain), then pulls for SECS
// game seconds under a steering policy, one row per frame. powers.update runs the winch inside the game's frame() after the player moves,
// as in play. Stubbed: rendering, terrain streaming and (by default) traffic and ambient actors. W.targets is emptied (structures only:
// a clean gate says nothing about towing vehicles); `pin` and ring rides use a fixed hook on a fountain column instead of the reticle.
// Runs are bit-for-bit repeatable (DETERMINISM).
//
// HOW TO RUN  (repo root; the dev server must already answer. ONE headless browser per machine: two starve each other and die with
// "Target page, context or browser has been closed". This starts one and closes it in a finally block and on SIGINT / SIGTERM; with no
// server it prints the start command and exits 2.)
//   1. dev server:   (nohup npx vite --port 5199 --host 127.0.0.1 > /tmp/vite5199.log 2>&1 &)
//   2. node tools/winch-ride.mjs [--gate] [scenario | group | range ...]        (no argument = group "default", 31 scenarios, ~100 s)
//      env PLAYWRIGHT (default /opt/node-tools/node_modules/playwright/index.mjs), GAME_URL (default http://127.0.0.1:5199/).
//      node tools/winch-ride.mjs --gate ring       the 56 ring-road rides (~2.5 min): run after any change to src/winch.js
//      node tools/winch-ride.mjs --list            scenarios, groups, name grammar          --dry <args>   what the arguments expand to
//      node tools/winch-ride.mjs --table a.jsonl ...     tabulate OUT= files        --compare a.jsonl b.jsonl ...   are saved runs identical?
//   --gate: print a verdict and exit 1 if any ride was flung (winch step over 2 m in a frame), ended "The line snapped!", had the cable give up
//   on a sign post (it then runs through it), or kept the cable inside a post for more than GATE_STREAK (2) frames in a row.
//   Time: ~25 s start-up (page load, BOLT dialog), then ~2.5 s per 14-game-second scenario. Exit code 1 if a scenario failed.
//   Three fresh runs of the default group:  for i in 1 2 3; do OUT=/tmp/d_$i.jsonl node tools/winch-ride.mjs; done
//                                           node tools/winch-ride.mjs --compare /tmp/d_1.jsonl /tmp/d_2.jsonl /tmp/d_3.jsonl
//
// SCENARIOS.  <policy>-<x>-<z>[@opt,opt...], (x, z) the start in the casino frame (on the real ground, 4 to 9 m above the casino plane and
// sloping ~20 degrees down toward the lot; the repro's y = 1 plane is under the terrain here):
//   policy  coast    skates held (Space) only: passive, from rest, rolling down the crater wall
//           toward   W + Space, start speed v toward the fountain, camera follows the hook: straight at it (pursuit curve)
//           line     as toward, but steered along the straight line (position at E) -> hook, so a line through a post is run into
//           orbitE+  W + Space, carve a radius-R circle round the east post (right-hand seen from the road); + or - = direction
//           orbitE-  (also orbitW+ / orbitW-: the west post)
//   opts    v=12 start speed (m/s) toward the fountain, set after the aim (default 12 for toward/line/orbit, 0 for coast, 26 for ring)
//           look=25 / in=0 for ring (see below)
//           run=2.5 seconds of W + Space toward the aim point before E (default 0)     R=3 orbit radius     secs=14    boots  no Space
//           hook modes: (default) auto = hook what the reticle is on after aiming at the fountain; if a post blocks that line of sight
//           (no player could hook it) the hook is pinned and the summary says "pin(blocked by b1)"; aim = strict, "no-target" when blocked;
//           pin = always a fixed point on a fountain cylinder (pinR=2.7 pinH=3; ring rides use pinR=1.7 pinH=8, the column).
//   examples  coast-60-140   toward-66-145@v=15   orbitW+-60-140   coast-58-148@pin   line-60.25-140
//   ranges  any field may be lo..hi/step:  coast-54..80/2-134..154/2@pin  = 154 coast starts (x 54,56..80 by z 134,136..154)
//           ring+/ring-  skate the ring road (radius 142 about the casino origin) at v (default 26), hook pinned on the fountain column,
//                        steering at a point `look` m (25) ahead, `in` m (0) inside the road; + / - = direction. The bug video's ride:
//                        past the roadside sign with the line bending round its posts.
//   groups  repro (7 spots x coast/toward/line = 21), orbit (6), a1 (four pinned coast starts), default (those three = 31),
//           ring (56: ring- at 10 spots x v 20/26 x in 0/6, ring+ at 8 spots x in 0/6), all (default + ring)
//
// ENV (all optional)
//   DT=0.0166667   frame dt (s), <= 0.05 (Game.frame() caps real frames there). 1/30 = 0.0333333, 1/144 = 0.00694444.
//                  A hair over 1/60 (DT=0.0167) gives 3 physics substeps per frame instead of 2 (player.js:352: ceil(dt / (1/120))).
//   JITTER=0       per-frame dt jitter (s, uniform +-J, seeded by JSEED=1 and SEED): 0.0005 = a realistic display clock
//   SECS=14        game seconds to ride after E            MODE=frame|direct   (frame = the whole game.frame(); direct = updatePlay & co)
//   SKATES=1       Space held (0 = boots; the ground model then fights the winch)       SEED=1   Math.random seed per scenario
//   REPEAT=1       passes over the list in ONE page (>1 compares each pass with pass 1: in-page determinism check)
//   FREEZE=1       stub world.update (traffic and ambient actors still; 0 = live world)   TERRAIN=0 (1 = keep planet.update)
//   CSV=dir        per-frame rows to <dir>/<scenario>.csv, the run-in to <scenario>.pre.csv (pass 1)
//   OUT=file.jsonl append one JSON summary per scenario            QUIET=1  no per-scenario line (only OUT)
//   SCEN_TIMEOUT=240  s per scenario before the browser is killed and relaunched (one retry, then FAILED)
//   VERBOSE=1      log start-up steps with times to stderr. Start-up is slow under swiftshader (each load builds the world, startPlay
//                  compiles every shader in software), so the harness holds the frame loop from the Enter that starts play, skips the
//                  shader warm-up (renderer.compileAsync becomes a no-op) and steps frames itself with the render stubbed.
//   BOOT_TIMEOUT=300  s to wait for each start-up step (page load, title reload, world)
//   VIEWPORT=900x560  page size. The sim ignores it, but a cold start draws real frames until the harness takes over, so a small page
//                  (VIEWPORT=480x300) starts several times faster on a slow machine
//   EVAL=file.js   debugging: run the file's body in the page after install (window.game, window.__wr.dbg), print the result, exit
//   SIGDIFF=1      with REPEAT>1, print which state signatures differ between passes
//
// OUTPUT, one line per scenario:
//   real(<name>): end=<seconds | held> (<toast>) dist-to-hook=<m> maxWraps=<n> firstIgnored=<t colliders> frames-through-sign=<n> [worst ...] |
//   maxWinchStep=<m> kick=<n> FLING=<n> maxOver=<m> minCos=<c> bend4=<t> bend5=<t> maxSpeed maxPhysStep postTouch minShellClr | Z at ... hookMode ...
//   maxWinchStep   largest distance the winch moved the body in a frame (Winch.update's final position correction); kick = frames over 0.5 m;
//                  FLING = frames over 2 m ("runaway"); maxPhysStep = the same for Player.update (physics + collision push-out)
//   frames-through-sign  frames with any drawn cable leg (hand, bends, hook) passing inside a sign post or the board (exact slab test);
//                  streak = longest run of such frames
//   maxOver        largest (cable path length - drum length), m (Winch.update);  minCos  smallest cosine between the eased pull direction
//                  o.dirP and the true first leg (Winch.update easing block);  bend4 / bend5  first time 4 / 5 bend points sit on a post at once
//   postTouch / minShellClr  frames with the collision sphere (r 0.9) touching a post / its smallest clearance (negative = pressed in)
// CSV columns: t cx cz cy (casino frame) px py pz vx vz (focus post's frame) sp gr alt sk dPhys dWinch dVwinch ms bodyClr shellClr reel strain
//   len dist over nW nG nIg grp (collider ids of the bends, b0/b1 = west/east post, c3/c4/c5 = fountain basin/column/top) bP ign igSign cosPT
//   thru which leg0Clr.
//
// DETERMINISM.  Repeats are identical to the last digit (REPEAT=3 and three fresh loads of the default group: 31 of 31), thanks to four
// fixes; without any, a scenario ends millimetres apart, which a runaway cable turns into metres:
//   1. dt: the fake clock moves only in exact multiples of 2^-20 ms. Adding dt*1000 makes (now - last)/1000 wobble ~1e-14 around 1/60, and
//      Player.update runs ceil(dt * 120) substeps: 2 or 3 depending only on the clock's size.
//      (A real 60 Hz display does the same from its jitter: JITTER=0.0005 shows the effect.)
//   2. body flags: P.respawn leaves body.skating / sinceContact / jumpLock from the last scenario; each scenario restores the install-time values.
//   3. Math.random is a seeded generator per scenario.
//   4. the terrain physics height cache (planet.cache) is emptied and refilled over the casino area at install (float32 radii from
//      worker-built chunks versus float64 computed ones, depending on boot timing).
// Not stubbed: updatePlay's other updates (enemies, events, secrets, missions); FREEZE=0 and TERRAIN=1 gave the same outcome classes.
//
// STEPPING.  The game's loop is stopped (renderer.setAnimationLoop(null)). One step is
//   MODE=frame  : a fake performance.now advances by dt (DETERMINISM 1), then game.frame() runs (the whole real frame, render stubbed).
//                 Like the trailer's pump (src/trailer.js). settings.fpsCap is set to 0, or settings.skip() (in Game.frame) would drop
//                 frames shorter than the cap.
//   MODE=direct : what frame() calls around the sim: updatePlay, updateCamera, world.update, rideCarry, fx.update, input.endFrame.
// Keys are real KeyboardEvents on window (input.js); the mouse adds to input.dx/dy, which updatePlay consumes.
// A scenario: respawn on the real ground, 90 settle frames on boots, aim (camera servo until the marker is on the fountain), optional start
// speed, press E the same frame, then SECS of the policy. Ends when the winch lets go (toast = reason), the state leaves "play", or SECS is
// up ("held").
import fs from 'node:fs';

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const PW = env('PLAYWRIGHT', '/opt/node-tools/node_modules/playwright/index.mjs');
const URL = env('GAME_URL', 'http://127.0.0.1:5199/');
const OPT = {
  dt: +env('DT', 1 / 60), secs: +env('SECS', 14), mode: env('MODE', 'frame'), skates: env('SKATES', '1') !== '0', seed: +env('SEED', 1),
  repeat: Math.max(1, +env('REPEAT', 1)), freeze: env('FREEZE', '1') !== '0', stubTerrain: env('TERRAIN', '0') === '0', csv: env('CSV', ''),
  out: env('OUT', ''), quiet: env('QUIET', '0') === '1', timeout: +env('SCEN_TIMEOUT', 240), boot: +env('BOOT_TIMEOUT', 300), viewport: env('VIEWPORT', '900x560').split('x').map(Number), jitter: +env('JITTER', 0), jseed: +env('JSEED', 1),
};

// ---------------------------------------------------------------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------------------------------------------------------------
const REPRO_SPOTS = [[60, 140], [58, 150], [72, 150], [76, 150], [66, 145], [64, 138], [70, 142]]; // crater wall spots before the casino, casino frame
const GROUPS = {
  repro: REPRO_SPOTS.flatMap(([x, z]) => ['coast', 'toward', 'line'].map((p) => `${p}-${x}-${z}`)),
  orbit: ['orbitE+-60-140', 'orbitE--60-140', 'orbitW+-60-140', 'orbitW--60-140', 'orbitE+-66-145@R=2.5', 'orbitE--66-145@R=2.5'],
  a1: ['coast-54-140@pin', 'coast-54-144@pin', 'coast-58-148@pin', 'coast-54-136@pin'],
};
GROUPS.default = [...GROUPS.repro, ...GROUPS.orbit, ...GROUPS.a1];
// ring road (radius 142 about the casino origin, as in the bug video): spots every 2 or 4 degrees past the sign
const ringName = (dir, deg, v, inward) => { // ring- starts east of the casino axis (x = +142 sin), ring+ west (x = -142 sin)
  const x = (dir === '-' ? 1 : -1) * 142 * Math.sin((deg * Math.PI) / 180), z = 142 * Math.cos((deg * Math.PI) / 180);
  return `ring${dir}-${x.toFixed(1)}-${z.toFixed(1)}@pin,pinR=1.7,pinH=8,v=${v},in=${inward}`;
};
GROUPS.ring = [
  ...[20, 26].flatMap((v) => [0, 6].flatMap((inward) => [30, 32, 34, 36, 38, 40, 42, 44, 46, 48].map((d) => ringName('-', d, v, inward)))),
  ...[0, 6].flatMap((inward) => [46, 42, 38, 34, 30, 26, 22, 18].map((d) => ringName('+', d, 26, inward))),
];
GROUPS.all = [...GROUPS.default, ...GROUPS.ring];
const POLICIES = /^(coast|toward|line|orbit[EW][+-]|ring[+-])-(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)(?:@(.*))?$/;
const parseScenario = (name) => {
  const m = POLICIES.exec(name);
  if (!m) throw new Error(`unknown scenario "${name}" (see --list)`);
  const pol = m[1], sc = {
    name, policy: pol.startsWith('orbit') ? 'orbit' : pol, start: [+m[2], +m[3]], run: 0, v0: pol === 'coast' ? 0 : pol.startsWith('ring') ? 26 : 12, hook: 'auto', look: 25, inward: 0,
    pinR: 2.7, pinH: 3, R: 3, skates: OPT.skates, aim: [0, 3, 98], secs: OPT.secs, dt: OPT.dt, seed: OPT.seed,
  };
  if (pol.startsWith('orbit')) { sc.post = pol[5]; sc.dir = pol[6] === '+' ? 1 : -1; }
  if (pol.startsWith('ring')) { sc.policy = 'ring'; sc.dir = pol[4] === '+' ? 1 : -1; }
  for (const o of (m[4] || '').split(',').filter(Boolean)) {
    const [k, v] = o.split('=');
    if (k === 'pin') sc.hook = 'pin'; else if (k === 'aim') sc.hook = 'aim'; else if (k === 'boots') sc.skates = false; else if (k === 'v') sc.v0 = +v; else if (k === 'run') sc.run = +v;
    else if (k === 'R') sc.R = +v; else if (k === 'pinR') sc.pinR = +v; else if (k === 'pinH') sc.pinH = +v; else if (k === 'secs') sc.secs = +v; else if (k === 'look') sc.look = +v; else if (k === 'in') sc.inward = +v;
    else throw new Error(`unknown option "${o}" in ${name}`);
  }
  return sc;
};
// a field may be a range lo..hi/step (coast-54..78/6-134..154/4@pin = a grid); expanded to every combination
const range = (f) => { const m = /^(-?[\d.]+)\.\.(-?[\d.]+)\/([\d.]+)$/.exec(f); if (!m) return [f]; const o = []; for (let v = +m[1]; v <= +m[2] + 1e-9; v += +m[3]) o.push(String(+v.toFixed(4))); return o; };
const expandRanges = (n) => {
  const m = /^(coast|toward|line|orbit[EW][+-]|ring[+-])-([^-@]+|-?[^@]*?)-([^-@]+)(@.*)?$/.exec(n);
  if (!m || !/\.\./.test(n)) return [n];
  return range(m[2]).flatMap((x) => range(m[3]).map((z) => `${m[1]}-${x}-${z}${m[4] || ''}`));
};
const expand = (args) => {
  const list = [];
  for (const a of args.length ? args : ['default']) for (const n of GROUPS[a] || [a]) list.push(...expandRanges(n));
  list.forEach(parseScenario); // validate every name before starting a browser
  return list;
};

// ---------------------------------------------------------------------------------------------------------------------------------
// node side: one scenario's summary (the page only records; judgements live here so they change without a rerun)
// ---------------------------------------------------------------------------------------------------------------------------------
const summarize = (r) => {
  const S = { name: r.name, end: r.end, why: r.why || '', settled: r.settled, notes: r.notes || [], dialogFrames: r.dialogFrames || 0 };
  if (r.end === 'no-target' || r.end === 'not-fired') {
    S.line = `real(${r.name}): end=${r.end} ${r.why || ''} arm=${JSON.stringify(r.arm || {})} settled=${JSON.stringify(r.settled)}`;
    return S;
  }
  const R = r.rows, mx = (k) => R.reduce((a, q) => Math.max(a, q[k] === undefined ? 0 : q[k]), 0);
  const mn = (k, d) => R.reduce((a, q) => (q[k] === undefined ? a : Math.min(a, q[k])), d);
  const thru = R.filter((q) => q.thru > 0), worst = thru.slice().sort((a, q) => q.thru - a.thru)[0];
  const ig = R.find((q) => q.nIg > 0), igPost = R.find((q) => q.igSign);
  const first = (pred) => { const q = R.find(pred); return q ? q.t : null; };
  Object.assign(S, {
    endT: r.end === 'held' ? null : +r.end, distHook: r.distHook, maxWraps: mx('nW'), maxGroups: mx('nG'),
    firstIgnored: ig ? `${ig.t}s ${ig.ign}` : '-', firstIgnoredSign: igPost ? `${igPost.t}s ${igPost.ign}` : '-',
    framesThroughSign: thru.length, worstThrough: worst ? `${worst.which} ${worst.thru}m at t=${worst.t}` : '',
    firstThrough: thru.length ? thru[0].t : null, maxStreak: (() => { let m = 0, c = 0; for (const q of R) { c = q.thru > 0 ? c + 1 : 0; if (c > m) m = c; } return m; })(),
    maxWinchStep: mx('dWinch'), kick: R.filter((q) => q.dWinch > 0.5).length, fling: R.filter((q) => q.dWinch > 2).length,
    maxPhysStep: mx('dPhys'), maxVWinch: mx('dVwinch'), maxSpeed: mx('sp'), maxOver: mx('over'), minCos: mn('cosPT', 1),
    bend4: first((q) => q.bP >= 4), bend5: first((q) => q.bP >= 5), maxBendsPost: mx('bP'),
    postTouch: R.filter((q) => q.shellClr < 0.05).length, minShellClr: mn('shellClr', 99), minLeg0Clr: mn('leg0Clr', 99),
    grounded: R.length ? Math.round((100 * R.filter((q) => q.gr).length) / R.length) : 0, ms: R.length ? R.reduce((a, q) => a + q.ms, 0) / R.length : 0,
    hook: r.hook, hookMode: r.hookMode, sig: r.sig, settleTrace: r.settleTrace, zPos: r.arm.posCasino, armSpeed: r.arm.speed, armDist: r.hook.dist0, armTicks: r.arm.ticks, endPos: r.endPos, frames: R.length,
  });
  const f = (v, d = 2) => (v === null || v === undefined ? '-' : (+v).toFixed(d));
  S.line = `real(${r.name}): end=${r.end}${r.why && r.end !== 'held' ? ' (' + r.why + ')' : ''} dist-to-hook=${r.distHook} maxWraps=${S.maxWraps} firstIgnored=${S.firstIgnored} `
    + `frames-through-sign=${S.framesThroughSign} streak=${S.maxStreak}${worst ? ' worst ' + S.worstThrough : ''} | maxWinchStep=${f(S.maxWinchStep)}m kick=${S.kick} FLING=${S.fling} maxOver=${f(S.maxOver)} minCos=${f(S.minCos)} `
    + `bend4=${f(S.bend4)} bend5=${f(S.bend5)} maxSpeed=${f(S.maxSpeed, 1)} maxPhysStep=${f(S.maxPhysStep)} postTouch=${S.postTouch} minShellClr=${f(S.minShellClr)} | `
    + `Z at casino(${S.zPos.map((v) => v.toFixed(1))}) speed=${f(S.armSpeed, 1)} hookDist=${f(S.armDist, 1)} hookMode=${S.hookMode} hook=${JSON.stringify(r.hook.casino)} on ${r.hook.col.split(' at ')[0]} dialogFrames=${S.dialogFrames} winch-ms=${f(S.ms, 3)}`;
  return S;
};
const toCsv = (rows) => { const keys = [...new Set(rows.flatMap((q) => Object.keys(q)))]; return keys.join(',') + '\n' + rows.map((q) => keys.map((k) => (q[k] === undefined ? '' : q[k])).join(',')).join('\n') + '\n'; };

// ---------------------------------------------------------------------------------------------------------------------------------
// --list, --table and --compare need no browser
// ---------------------------------------------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const GATE = argv.includes('--gate'), GATE_STREAK = 2;
if (argv.includes('--list')) {
  for (const [g, l] of Object.entries(GROUPS)) console.log(`group ${g} (${l.length}): ${l.join(' ')}`);
  console.log('policies: coast, toward, line, orbitE+, orbitE-, orbitW+, orbitW-, ring+, ring-.  name = <policy>-<x>-<z>[@v=12,run=2.5,pin,R=3,boots,pinR=2.7,pinH=3,secs=14,look=25,in=0]');
  process.exit(0);
}
if (argv[0] === '--table') { // --table a.jsonl [b.jsonl ...]: a row per scenario, counts by policy
  const rows = argv.slice(1).flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const f2 = (v, d = 2) => (v === null || v === undefined ? '-' : (+v).toFixed(d));
  console.log('scenario                          end    why                    dist   wr thru  step  kick  FLG  over  minCos  bend4 bend5');
  for (const r of rows) console.log(r.maxWinchStep === undefined ? `${r.name.padEnd(32)} ${r.end} ${r.why}` : `${r.name.padEnd(32)} ${String(r.end).padStart(6)} ${String(r.why).slice(0, 22).padEnd(22)} ${f2(r.distHook, 1).padStart(6)} ${String(r.maxWraps).padStart(3)} ${String(r.framesThroughSign).padStart(3)} ${f2(r.maxWinchStep).padStart(6)} ${String(r.kick).padStart(4)} ${String(r.fling).padStart(4)} ${f2(r.maxOver, 1).padStart(6)} ${f2(r.minCos).padStart(6)} ${f2(r.bend4).padStart(6)} ${f2(r.bend5).padStart(5)}`);
  const by = {};
  for (const r of rows.filter((q) => q.maxWinchStep !== undefined)) (by[r.name.split('-')[0]] ||= []).push(r);
  for (const [p, rs] of Object.entries(by)) console.log(`${p.padEnd(8)} n=${rs.length} runaway(>2 m/frame)=${rs.filter((r) => r.fling > 0).length} snapped=${rs.filter((r) => /snapped/.test(r.why)).length} through-sign=${rs.filter((r) => r.framesThroughSign > 0).length} kick(>0.5 m)=${rs.filter((r) => r.kick > 0).length} reached-5-bends=${rs.filter((r) => r.bend5 !== null).length}`);
  process.exit(0);
}
if (argv[0] === '--compare') {
  const files = argv.slice(1), runs = files.map((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const names = [...new Set(runs.flatMap((r) => r.map((q) => q.name)))];
  const key = (q) => [q.end, q.why, q.distHook, q.maxWraps, q.framesThroughSign, q.maxWinchStep, q.maxOver, q.endPos && q.endPos.join('/')].join('|');
  let same = 0;
  for (const n of names) {
    const rs = runs.map((r) => r.find((q) => q.name === n && (q.pass || 1) === 1)).filter(Boolean);
    const ident = rs.length > 1 && rs.every((q) => key(q) === key(rs[0]));
    if (ident) same++;
    console.log(`${ident ? 'IDENTICAL' : 'VARIES   '} ${n}: ` + rs.map((q) => `[end=${q.end}${q.why ? ' ' + q.why : ''} d=${q.distHook} w=${q.maxWraps} thru=${q.framesThroughSign} step=${(+q.maxWinchStep).toFixed(2)} over=${(+q.maxOver).toFixed(1)}]`).join(' '));
  }
  console.log(`${same}/${names.length} scenarios identical across ${files.length} runs`);
  process.exit(0);
}
const names = expand(argv.filter((a) => !a.startsWith('--')));
const rides = []; // summaries for the --gate verdict
if (argv.includes('--dry')) { console.log(names.length + ' scenarios:\n' + names.join('\n')); process.exit(0); }

// ---------------------------------------------------------------------------------------------------------------------------------
// browser: launch, boot to state "play", install the harness. Relaunched if the page dies.
// ---------------------------------------------------------------------------------------------------------------------------------
try { const res = await fetch(URL); if (!res.ok) throw new Error('HTTP ' + res.status); } catch (e) {
  console.error(`The game does not answer at ${URL} (${e.message}). Start it from the repo root:\n  (nohup npx vite --port 5199 --host 127.0.0.1 > /tmp/vite5199.log 2>&1 &)`);
  process.exit(2);
}
const { chromium } = await import(PW);
let b = null, pg = null, errs = [];
const closeBrowser = async () => { const bb = b; b = pg = null; if (bb) { try { await bb.close(); } catch (e) { /* already gone */ } } };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await closeBrowser(); process.exit(130); });

const installHarness = (o) => {
  const g = window.game, W = g.winch, P = g.player, I = g.input, V = P.pos.constructor;
  const realNow = performance.now.bind(performance);
  try { g.renderer.setAnimationLoop(null); } catch (e) { /* already stopped */ }
  g.settings.v.fpsCap = 0;
  g.post.render = () => {};
  if (o.stubTerrain) g.planet.update = () => {}; // physics reads planet.surface() (analytic): no chunks needed
  if (o.freeze) g.world.update = () => {};
  W.targets = () => []; // structures only: run outcomes mustn't depend on where traffic is
  g.upgrades.winch = 1;
  g.powers.select('winch'); // the mouse wheel does this in play, but it's gated by pointer lock (input.js)
  if (!g.world.mergeDone) g.world.finishMerges(); // frame() does this while playing
  // Fake clock. frame() takes rdt = (performance.now() - this.last) / 1000 and Player.update runs Math.ceil(dt / (1/120)) substeps
  // (player.js). An accumulated dt*1000 clock carries ~1e-12 rounding error that flips dt across 1/60, giving 2 or 3 substeps by clock
  // size alone (5 mm drift that a runaway cable turns into metres). So the clock moves in exact multiples of 2^-20 ms (exact sums and
  // differences) and each step rounds DOWN to one: every frame has the same dt (0.0166666660 s at 60 Hz, 2 substeps), bit for bit.
  const Q = 1048576;
  let now = Q;
  if (o.mode === 'frame') { performance.now = () => now; g.last = now; }

  const loc = g.locations.find((l) => l.id === 'casino');
  const L = (x, y, z) => g.world.toWorld(loc, x, y, z);
  const toLoc = (p) => loc.group.worldToLocal(p.clone());
  const r3 = (x) => Math.round(x * 1000) / 1000;

  // planet.cache (filled lazily by planet.vr, terrainField.js) mixes float32 radii from chunks built during boot (fillCache, planet.js) with
  // float64 ones computed on demand, and clears itself at 400000 entries. The mix depends on boot timing, and 0.2 mm of height moves a
  // settled player by millimetres (metres with a runaway cable). So clear it and touch the whole area once (13000 entries, no later clear):
  // every height is float64, every run.
  g.planet.cache.clear();
  { const tmp = new V(); for (let x = -40; x <= 130; x += 1.5) for (let z = 30; z <= 220; z += 1.5) g.planet.surface(L(x, 0, z), tmp); }

  // The roadside pylon sign (two posts and a board) isn't in the game, but winding the cable round its posts was the winch's trouble, so
  // with none present the harness adds the same colliders (dressCasinoLot's numbers): centre casino (26, 118) turned -0.35 rad, posts
  // 0.6 x 11.5 x 0.6 m half extents at +-6.6 m, board 6.2 x 5.6 x 0.7 centred 15.8 m up.
  {
    const c0 = L(26, 12, 118), have = [];
    g.colliders.query(c0, 14, have);
    if (!have.some((c) => c.type === 'box' && c.hy > 11 && c.mid.distanceTo(c0) <= 14)) {
      const o0 = L(0, 0, 0), ang = -0.35, ca = Math.cos(ang), sa = Math.sin(ang);
      const dir = (x, y, z) => L(x, y, z).sub(o0).normalize(); // sign axes: casino frame to world
      const ax = dir(ca, 0, -sa), ay = dir(0, 1, 0), az = dir(sa, 0, ca);
      const add = (hx, hy, hz, lx, ly) => g.colliders.add({ type: 'box', c: L(26 + lx * ca, ly, 118 - lx * sa), ax: ax.clone(), ay: ay.clone(), az: az.clone(), hx, hy, hz });
      for (const sd of [-1, 1]) add(0.6, 11.5, 0.6, sd * 6.6, 11.5);
      add(6.2, 5.6, 0.7, 0, 15.8);
    }
  }
  // sign and fountain colliders (fountain: settlements.js)
  const sc = L(26, 12, 118);
  const near = []; g.colliders.query(sc, 14, near);
  const sign = near.filter((c) => c.mid.distanceTo(sc) <= 14 && c.type === 'box');
  const posts = sign.filter((c) => c.hy > 11).sort((a, c) => toLoc(a.c).x - toLoc(c.c).x); // [0] = 'W' (smaller casino x), [1] = 'E'
  const board = sign.filter((c) => c.hy < 11 && c.hx > 5);
  const signCols = posts.concat(board);
  const fc = L(0, 0, 98), all = []; g.colliders.query(fc, 40, all);
  const fountainCols = all.filter((c) => { if (c.type !== 'cyl') return false; const lm = toLoc(c.mid); return Math.hypot(lm.x, lm.z - 98) < 11; });
  if (posts.length !== 2 || !board.length || fountainCols.length < 3) throw new Error(`casino colliders not as expected: posts=${posts.length} board=${board.length} fountain=${fountainCols.length}`);
  // the winch skips boxes with any half extent under 0.6 (thin() in winch.js); the posts sit exactly on that edge, and if thin the
  // cable would never bend round them
  if (posts.some((c) => Math.min(c.hx, c.hy, c.hz) < 0.6)) throw new Error('the sign posts are thin() to the winch: the cable would never bend round them');
  const desc = (c) => c.type === 'box'
    ? `box h=(${c.hx.toFixed(2)},${c.hy.toFixed(2)},${c.hz.toFixed(2)}) at casino(${toLoc(c.c).toArray().map((v) => v.toFixed(1))})`
    : `${c.type} r=${c.r} y=${c.y0}..${c.y1} at casino(${toLoc(c.c).toArray().map((v) => v.toFixed(1))})`;

  // ---- input via the real Input layer ----
  const held = new Set();
  const hold = (code, on) => {
    if (on && !held.has(code)) { held.add(code); window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); }
    else if (!on && held.has(code)) { held.delete(code); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); }
  };
  const releaseAll = () => { for (const c of [...held]) hold(c, false); I.keys.clear(); I.justPressed.clear(); I.dx = I.dy = 0; };
  const sens = () => 0.0022 * (g.settings ? g.settings.v.sensitivity : 1) * (P.scoped ? 0.28 : 1); 
  const inv = () => (g.settings && g.settings.v.invertY ? -1 : 1);
  const tang = (v, up) => { const t = v.clone().addScaledVector(up, -v.dot(up)); return t.lengthSq() < 1e-9 ? null : t.normalize(); };
  const yawTo = (des, gain = 1) => { // mouse-turn the camera heading toward world vector `des`
    const up = P.up, f = tang(g.cam.fwd, up), t = tang(des, up);
    if (!f || !t) return 0;
    const ang = Math.atan2(f.clone().cross(t).dot(up), f.dot(t));
    I.dx += (-ang * gain) / sens(); // updatePlay turns the heading by -mx * sens about up
    return ang;
  };
  const servoAim = (H) => { // steer the camera ray (what pick() reads) through H; returns the angular error
    const up = P.up, eye = g.camera.position, f = g.camera.getWorldDirection(new V());
    const want = H.clone().sub(eye).normalize(), ft = tang(f, up), wt = tang(want, up);
    const yaw = ft && wt ? Math.atan2(ft.clone().cross(wt).dot(up), ft.dot(wt)) : 0;
    const pit = Math.asin(Math.max(-1, Math.min(1, want.dot(up)))) - Math.asin(Math.max(-1, Math.min(1, f.dot(up))));
    I.dx += (-yaw * 0.8) / sens();
    I.dy += (-pit * 0.8) / (sens() * inv()); // c.pitch -= my * sens * inv
    return Math.hypot(yaw, pit);
  };

  // ---- stepping ----
  const dialogs = []; let dialogFrames = 0;
  const oDialog = g.dialog.bind(g);
  g.dialog = function (title, text, buttons, opts) { dialogs.push(String(title).slice(0, 50)); return oDialog(title, text, buttons, opts); };
  const settleDialog = () => { // BOLT's courier-school dialog opens early: pick the last button, as Escape would
    for (let k = 0; k < 6 && g.state === 'dialog'; k++) { try { g.pickDialog(g.dialogButtons.length - 1, true); } catch (e) { dialogs.push('pickDialog failed: ' + e.message); break; } }
  };
  const toasts = []; const oToast = g.hud.toast.bind(g.hud);
  g.hud.toast = (t, d, h) => { toasts.push(String(t)); return oToast(t, d, h); };
  const m = { pPhys: 0, pWinch: 0, vWinch: 0, ms: 0 };
  const oPU = P.update.bind(P);
  P.update = function (dt, input, cam) { const p0 = P.body.pos.clone(); oPU(dt, input, cam); m.pPhys = P.body.pos.distanceTo(p0); }; // physics + push-out only
  const oWU = W.update.bind(W);
  W.update = function (dt, heldZ) { const p0 = P.body.pos.clone(), v0 = P.vel.clone(), t0 = realNow(); oWU(dt, heldZ); m.ms = realNow() - t0; m.pWinch = P.body.pos.distanceTo(p0); m.vWinch = P.vel.distanceTo(v0); }; // the winch's own move
  // JITTER: each dt gets a seeded uniform(-J, +J) like a real display clock (frames a hair over 1/60 s get 3 substeps, not 2).
  // Seeded from JSEED and the scenario, so jittered runs still repeat.
  let jrng = 1; const jit = () => { if (!o.jitter) return 0; jrng = (Math.imul(jrng, 1664525) + 1013904223) >>> 0; return ((jrng / 4294967296) * 2 - 1) * o.jitter; };
  const step = (dt) => {
    m.pPhys = m.pWinch = m.vWinch = m.ms = 0;
    if (o.mode === 'frame') { const d = Math.floor((dt + jit()) * 1000 * Q) / Q; now += d; g.last = now - d; g.frame(); }
    else {
      g.time += dt;
      g.updatePlay(dt); g.updateCamera(dt); g.world.update(dt, g.time, g.camera.position);
      if (!g.away()) P.rideCarry();
      g.fx.update(dt, dt); I.endFrame();
    }
    if (g.state === 'dialog') { dialogFrames++; settleDialog(); }
  };

  // ---- geometry helpers ----
  const boxDist = (c, p) => { // exact distance from p to the box (0 inside)
    const d = p.clone().sub(c.c), q = [d.dot(c.ax), d.dot(c.ay), d.dot(c.az)], h = [c.hx, c.hy, c.hz];
    return Math.hypot(...q.map((v, i) => Math.max(0, Math.abs(v) - h[i])));
  };
  const segInside = (c, a, bb, shrink = 0.05) => { // length of a->bb inside the box shrunk by `shrink` (exact slab test)
    const ax = [c.ax, c.ay, c.az], h = [c.hx - shrink, c.hy - shrink, c.hz - shrink];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 3; i++) {
      const oo = (a.x - c.c.x) * ax[i].x + (a.y - c.c.y) * ax[i].y + (a.z - c.c.z) * ax[i].z;
      const dd = (bb.x - a.x) * ax[i].x + (bb.y - a.y) * ax[i].y + (bb.z - a.z) * ax[i].z;
      if (Math.abs(dd) < 1e-9) { if (Math.abs(oo) > h[i]) return 0; continue; }
      let s0 = (-h[i] - oo) / dd, s1 = (h[i] - oo) / dd;
      if (s0 > s1) { const x = s0; s0 = s1; s1 = x; }
      t0 = Math.max(t0, s0); t1 = Math.min(t1, s1);
      if (t0 >= t1) return 0;
    }
    return (t1 - t0) * a.distanceTo(bb);
  };
  const ids = new Map(); const idOf = (c) => { if (!ids.has(c)) ids.set(c, `${c.type[0]}${ids.size}`); return ids.get(c); };
  posts.forEach(idOf); board.forEach(idOf); fountainCols.forEach(idOf);

  // respawn() doesn't reset all the body's scalar flags (skating, jumpLock, sinceContact ...): a leftover `skating` slides the first
  // settle frame 0.1 m/s and ends runs 5 mm apart. Each scenario restores the install-time values.
  const bodyInit = {}; for (const [k, v] of Object.entries(P.body)) if (typeof v === 'number' || typeof v === 'boolean' || v === null || typeof v === 'string') bodyInit[k] = v;

  // ---- one scenario ----
  const run = (sc) => {
    const dt = sc.dt, rows = [], notes = [];
    // seeded Math.random (winch creak, fx dust, enemy AI)
    let s = (sc.seed >>> 0) || 1; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    jrng = ((sc.seed * 2654435761) ^ (o.jseed * 40503)) >>> 0 || 1;
    delete W.pick; // drop an earlier pinned pick (own property; the real one is on the prototype)
    if (W.on) W.release(true);
    W.cd = 0; W.cand = null; W.pickT = 0; releaseAll();
    toasts.length = 0; dialogFrames = 0; dialogs.length = 0;
    const out = { name: sc.name, notes, rows, dialogs: dialogs.slice(), settled: null };
    const start = g.planet.ground(L(sc.start[0], 0, sc.start[1]), new V(), 0.05);
    const H = L(...sc.aim);
    const toward = tang(H.clone().sub(start), start.clone().normalize());
    Object.assign(P.body, bodyInit);
    P.respawn(start, toward);
    P.body.grounded = false; P.body.airTime = 0; P.body.jumpLock = false; P.body.onStruct = false;
    g.cam.fwd.copy(toward); g.cam.pitch = -0.1; g.cam.dist = 8; g.cam.shake = 0;
    g.updateCamera(0.016, true);
    if (window.__wr && window.__wr.onPreSettle) window.__wr.onPreSettle();
    const settleTrace = [];
    for (let i = 0; i < 90; i++) { step(dt); if (i < 3 || i === 89) settleTrace.push(P.body.pos.toArray().map((v) => +v.toFixed(6)).join(',') + ` gr=${P.body.grounded} alt=${P.body.altitude.toFixed(5)} v=${P.vel.length().toExponential(2)}`); } // settle 1.5 s on boots, at rest
    out.settleTrace = settleTrace;
    const sigOf = () => { const b = P.body; return { pos: b.pos.toArray(), vel: b.vel.toArray(), up: b.up.toArray(), gN: b.groundN.toArray(), num: [b.altitude, b.sinceContact, b.airTime, b.energy, g.time, now, P.upSmooth.x], cam: [...g.cam.fwd.toArray(), g.cam.pitch, ...g.camera.position.toArray()], flags: [b.grounded, b.skating, b.jumpLock, b.onStruct, !!b.platform, !!b.velFrame].join() }; };
    out.sig = { settle: sigOf() };
    out.settled = { grounded: P.body.grounded, altitude: r3(P.body.altitude), casinoY: r3(toLoc(P.body.pos).y), posCasino: toLoc(P.body.pos).toArray().map(r3) };
    if (!P.body.grounded) notes.push('not grounded after settle');
    // The hook. 'aim': mouse-turn the real camera until its ray is on H (standing on boots) and the marker (W.cand, refreshed every
    // PICK_EVERY s in winch.js) is on a fountain collider, so Z hooks what a player would. 'pin': W.pick returns a fixed point on one
    // fountain cylinder, whatever is in the way. 'auto' (default): 'aim', falling back to 'pin' when a sign post blocks the line of sight.
    let pin = null, hookMode = sc.hook, blockedBy = null;
    const makePin = () => {
      const col = fountainCols.find((c) => Math.abs(c.r - sc.pinR) < 0.01);
      const ap = col.c.clone().addScaledVector(col.axis, sc.pinH), dir = tang(start.clone().sub(ap).addScaledVector(col.axis, -start.clone().sub(ap).dot(col.axis)), col.axis);
      pin = { col, pt: ap.clone().addScaledVector(dir, col.r), n: dir, T: W.structure(col) };
      W.pick = () => W.handle(pin.T, pin.pt.clone(), pin.n.clone(), true, P.center.distanceTo(pin.pt));
      W.cand = null; W.pickT = 0;
    };
    if (hookMode === 'pin') makePin();
    const pre = [];
    const preRow = (t, err) => pre.push({ t: r3(t), cx: r3(toLoc(P.body.pos).x), cz: r3(toLoc(P.body.pos).z), sp: r3(P.vel.length()), gr: P.body.grounded ? 1 : 0, sk: P.body.skating ? 1 : 0, err: r3(err) });
    const candOk = () => (pin ? !!(W.cand && W.cand.target.col === pin.col) : !!(W.cand && W.cand.target.col && fountainCols.includes(W.cand.target.col)));
    let armed = false, err = 9, i = 0, tPre = 0;
    for (; i < Math.round(4 / dt); i++) {
      err = servoAim(H);
      step(dt); tPre += dt;
      if (i % 6 === 0) preRow(tPre, err);
      if (g.state !== 'play' || P.dead) { notes.push('abort before Z: state=' + g.state); break; }
      if (!pin && err < 0.006 && W.cand && W.cand.target.col && signCols.includes(W.cand.target.col)) { // sign under the reticle
        blockedBy = idOf(W.cand.target.col);
        if (hookMode === 'auto') { hookMode = 'pin'; makePin(); notes.push(`reticle on ${blockedBy}: hook pinned on the fountain`); }
      }
      if ((pin || err < 0.006) && candOk()) { armed = true; break; }
    }
    out.hookMode = hookMode + (blockedBy ? `(blocked by ${blockedBy})` : '');
    // run-in (as the user ran up the road): skates and W, ground speed toward the fountain, camera kept on H
    hold('Space', sc.skates);
    if (armed && sc.v0 > 0) {
      const gn = P.body.groundN.lengthSq() > 0.5 ? P.body.groundN.clone().normalize() : P.up.clone();
      let d = H.clone().sub(P.body.pos); d.addScaledVector(gn, -d.dot(gn)).normalize();
      if (sc.policy === 'ring') { // along the ring road (radius 142 about the casino origin), as in the video
        const lc = toLoc(P.body.pos), phi = Math.atan2(lc.x, lc.z), a = L(lc.x, lc.y, lc.z), b = L(lc.x + Math.cos(phi) * sc.dir, lc.y, lc.z - Math.sin(phi) * sc.dir);
        d = b.sub(a); d.addScaledVector(gn, -d.dot(gn)).normalize();
      }
      P.body.vel.copy(d).multiplyScalar(sc.v0);
    }
    if (armed && (sc.v0 > 0 || sc.run > 0)) {
      hold('KeyW', true);
      for (let j = 0; j < Math.round(sc.run / dt); j++) {
        err = servoAim(H); step(dt); tPre += dt; if (j % 6 === 0) preRow(tPre, err);
        if (g.state !== 'play' || P.dead) { notes.push('abort during run-in: state=' + g.state); armed = false; break; }
      }
      if (armed && !candOk()) { // the marker may need a few frames after the run: keep aiming
        for (let j = 0; j < Math.round(2 / dt) && !candOk(); j++) { err = servoAim(H); step(dt); tPre += dt; }
        armed = candOk();
      }
    }
    out.pre = pre;
    out.sig.z = sigOf();
    out.arm = { ticks: i, err: r3(err), posCasino: toLoc(P.body.pos).toArray().map(r3), speed: r3(P.vel.length()), cand: W.cand ? idOf(W.cand.target.col || { type: 'x' }) + ' ' + (W.cand.target.col ? desc(W.cand.target.col) : 'vehicle') : null };
    if (!armed) { out.end = 'no-target'; out.why = notes.join(';') || 'cand=' + out.arm.cand + ' err=' + out.arm.err; releaseAll(); return out; }
    // E via the input layer: pressed() fires winch.fire() in this frame's powers.update, down() keeps it held (powers.js)
    hold('KeyE', true);
    step(dt);
    if (!W.on) { out.end = 'not-fired'; out.why = toasts.join('|'); releaseAll(); return out; }
    const ride = W.on;
    const hookW = W.anchorOf(ride, new V());
    out.hook = { casino: toLoc(hookW).toArray().map(r3), col: ride.target.col ? desc(ride.target.col) : 'synthetic', dist0: r3(ride.dist) };
    const focus = sc.post === 'W' ? posts[0] : sc.post === 'E' ? posts[1] : posts.slice().sort((a, c) => a.c.distanceTo(P.pos) - c.c.distanceTo(P.pos))[0];
    out.focus = desc(focus);
    const lineA = P.body.pos.clone(), lineD = tang(hookW.clone().sub(lineA), P.up) || toward, lineL = hookW.clone().sub(lineA).dot(lineD);
    const nTicks = Math.round(sc.secs / dt);
    let ended = null;
    for (let k = 0; k < nTicks; k++) {
      const t = k * dt;
      // ---- this frame's input ----
      let kw = false;
      if (sc.policy === 'toward') { yawTo(hookW.clone().sub(P.pos)); kw = true; }
      else if (sc.policy === 'line') { // hold the line from the Z spot to the hook: aim 8 m ahead of our projection on it
        const s = Math.min(lineL, P.body.pos.clone().sub(lineA).dot(lineD) + 8);
        yawTo(lineA.clone().addScaledVector(lineD, s).sub(P.pos)); kw = true;
      } else if (sc.policy === 'ring') { // follow the ring road: steer at `look` m ahead, `in` m inside
        const lc = toLoc(P.body.pos), phi = Math.atan2(lc.x, lc.z), rho = Math.hypot(lc.x, lc.z), ph = phi + sc.dir * (sc.look / rho), Rr = 142 - sc.inward;
        yawTo(L(Rr * Math.sin(ph), 0, Rr * Math.cos(ph)).sub(P.pos)); kw = true;
      } else if (sc.policy === 'orbit') {
        const d = P.body.pos.clone().sub(focus.c), x = d.dot(focus.ax), z = d.dot(focus.az), dist = Math.hypot(x, z), phi = Math.atan2(z, x);
        const ph = phi + sc.dir * Math.max(0.35, dist > sc.R ? Math.acos(sc.R / dist) : 0); // tangent point on the circle (lead at least 0.35 rad)
        const aimP = focus.c.clone().addScaledVector(focus.ax, Math.cos(ph) * sc.R).addScaledVector(focus.az, Math.sin(ph) * sc.R);
        yawTo(aimP.sub(P.pos)); kw = true;
      }
      hold('KeyW', kw);
      step(dt);
      // ---- record ----
      const on = W.on;
      const d = P.body.pos.clone().sub(focus.c);
      const shell = P.body.pos.clone().addScaledVector(P.up, 0.9); // collision sphere (r 0.9, centred 0.9 above the feet: config.js)
      const row = {
        t: r3((k + 1) * dt), cx: r3(toLoc(P.body.pos).x), cz: r3(toLoc(P.body.pos).z), cy: r3(toLoc(P.body.pos).y),
        px: r3(d.dot(focus.ax)), py: r3(d.dot(focus.ay)), pz: r3(d.dot(focus.az)), // body position in the focus post's frame
        vx: r3(P.vel.dot(focus.ax)), vz: r3(P.vel.dot(focus.az)), sp: r3(P.vel.length()),
        gr: P.body.grounded ? 1 : 0, alt: r3(P.body.altitude), sk: P.body.skating ? 1 : 0,
        dPhys: r3(m.pPhys), dWinch: r3(m.pWinch), dVwinch: r3(m.vWinch), ms: r3(m.ms),
        bodyClr: r3(boxDist(focus, P.center)), shellClr: r3(Math.min(...posts.map((c) => boxDist(c, shell) - 0.9))), // 0 = shell touches a post
      };
      if (on) {
        row.reel = r3(on.reel); row.strain = r3(on.strain); row.len = r3(on.len); row.dist = r3(on.dist); row.over = r3(on.dist - on.len);
        row.nW = on.wraps.length; row.nG = new Set(on.grp).size; row.nIg = on.ignore.size; row.grp = on.grp.map(idOf).join('.');
        row.bP = on.grp.filter((c) => posts.includes(c)).length;
        if (on.ignore.size) { row.ign = [...on.ignore].map(idOf).join('+'); row.igSign = [...on.ignore].some((c) => signCols.includes(c)) ? 1 : 0; }
        const t0 = W.path[0], t1 = W.path[1]; // true first leg (as drawn) vs the eased pull direction
        if (on.dirP && t0.distanceToSquared(t1) > 1e-8) row.cosPT = r3(on.dirP.dot(t1.clone().sub(t0).normalize()));
        let thru = 0, which = '';
        for (let q = 0; q < W.pathN - 1; q++) for (const c of signCols) { const L2 = segInside(c, W.path[q], W.path[q + 1]); if (L2 > 0) { thru += L2; which += `${idOf(c)}@${q} `; } }
        row.thru = r3(thru); row.which = which.trim();
        let clr = 99; // first leg's clearance to the focus post's footprint (negative = through it)
        for (let q = 0; q <= 24; q++) {
          const p = W.path[0].clone().lerp(W.path[1], q / 24), dd = p.sub(focus.c);
          if (Math.abs(dd.dot(focus.ay)) < focus.hy) { const ex = Math.abs(dd.dot(focus.ax)) - focus.hx, ez = Math.abs(dd.dot(focus.az)) - focus.hz; clr = Math.min(clr, ex > 0 && ez > 0 ? Math.hypot(ex, ez) : Math.max(ex, ez)); }
        }
        row.leg0Clr = r3(clr);
      }
      rows.push(row);
      if (g.state !== 'play' || P.dead) { notes.push('state=' + g.state + (P.dead ? ' dead' : '')); ended = t; out.why = 'state'; break; }
      if (!on) { ended = (k + 1) * dt; out.why = toasts.filter((x) => /line|hitch/i.test(x)).join('|') || toasts.join('|') || 'released'; break; }
    }
    out.end = ended === null ? 'held' : ended.toFixed(2);
    out.endPos = P.body.pos.toArray().map((v) => +v.toFixed(4));
    out.distHook = r3(P.center.distanceTo(hookW));
    out.dialogFrames = dialogFrames;
    releaseAll(); if (W.on) W.release(true);
    return out;
  };
  window.__wr = { run, idOf, desc, posts, board, fountainCols, dbg: { step, hold, releaseAll, L, toLoc, servoAim, tang, sigOf: null, now: () => now } };

  return [
    `mode=${o.mode} dt=${o.dt.toFixed(5)} skates=${o.skates} freeze=${o.freeze} terrainStub=${o.stubTerrain} seed=${o.seed} fpsCap=${g.settings.v.fpsCap}`,
    'sign colliders: ' + sign.map((c) => idOf(c) + ' ' + desc(c)).join(' | '),
    'posts (W,E by casino x): ' + posts.map((c) => idOf(c)).join(',') + '   board: ' + board.map(idOf).join(','),
    'fountain colliders: ' + fountainCols.map((c) => idOf(c) + ' ' + desc(c)).join(' | '),
    `state=${g.state} winch.owned=${W.owned} power=${g.powers.current()}`,
  ];
};

const launch = async () => {
  const t0 = performance.now(), say = (m) => { if (process.env.VERBOSE) console.error(`[boot ${((performance.now() - t0) / 1000).toFixed(1)}s] ${m}`); };
  await closeBrowser();
  errs = [];
  b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  pg = await b.newPage({ viewport: { width: OPT.viewport[0], height: OPT.viewport[1] } });
  pg.on('pageerror', (e) => errs.push(e.message));
  // hold the frame loop from the Enter that starts play (real frames would compile every shader in software, taking minutes; startPlay's
  // warm-up is skipped below for the same reason); before that Enter the game needs frames to finish loading
  await pg.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.__keepFrames = true; window.requestAnimationFrame = (cb) => (window.__keepFrames ? raf(cb) : 0); });
  await pg.goto(URL, { waitUntil: 'load', timeout: OPT.boot * 1000 }); say('page loaded');
  await pg.waitForFunction('window.game && window.game.world', null, { timeout: OPT.boot * 1000 }); say('world exists');
  await pg.bringToFront(); // a blurred window clears held keys (input.js)
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(4000); // the first Enter reloads the page
  await pg.waitForFunction('window.game && window.game.world', null, { timeout: OPT.boot * 1000 }); say('world exists after the first Enter');
  // the second Enter starts the game; a cold start can take minutes under swiftshader, so wait on the clock and press Enter only
  // once the game has a state
  let st = null;
  for (const until = performance.now() + OPT.boot * 1000; performance.now() < until;) {
    try { st = await pg.evaluate('(() => { const g = window.game; if (g && g.renderer) g.renderer.compileAsync = () => Promise.resolve(); return g && g.state; })()'); } catch (e) { say('state read failed: ' + String(e.message).split('\n')[0]); await pg.waitForTimeout(2500); continue; }
    if (st === 'play') break;
    if (st) { say('state ' + st + ': Enter'); await pg.evaluate('window.__keepFrames = false').catch(() => {}); await pg.keyboard.press('Enter'); }
    await pg.waitForTimeout(1500);
  }
  if (st !== 'play') throw new Error('the game never reached state "play" (last state: ' + st + ')');
  await pg.waitForTimeout(2000);
  say('installing the harness');
  const lines = await pg.evaluate(installHarness, OPT); say('harness installed');
  return lines;
};

const withTimeout = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000} s`)), ms); })]).finally(() => clearTimeout(t)); };

// ---------------------------------------------------------------------------------------------------------------------------------
// node side: run the passes
// ---------------------------------------------------------------------------------------------------------------------------------
if (OPT.csv) fs.mkdirSync(OPT.csv, { recursive: true });
if (OPT.out) fs.mkdirSync(OPT.out.replace(/[^/]*$/, '') || '.', { recursive: true });
let failed = 0;
try {
  for (const l of await launch()) if (!OPT.quiet) console.log(l);
  if (process.env.EVAL) { // debugging: run a JS file's body in the page (window.game, window.__wr.dbg), print its result
    console.log(JSON.stringify(await pg.evaluate(`(async () => { ${fs.readFileSync(process.env.EVAL, 'utf8')} })()`), null, 1));
    names.length = 0;
  }
  const first = new Map();
  for (let pass = 1; pass <= OPT.repeat; pass++) {
    for (const n of names) {
      const sc = parseScenario(n);
      let r = null;
      for (let attempt = 0; attempt < 2 && !r; attempt++) {
        try { r = await withTimeout(pg.evaluate((s) => window.__wr.run(s), sc), OPT.timeout * 1000, 'scenario ' + n); } catch (e) {
          console.error(`!! ${n}: ${String(e.message).split('\n')[0]} (attempt ${attempt + 1}); relaunching the browser`);
          try { await launch(); } catch (e2) { console.error('!! relaunch failed: ' + e2.message); break; }
        }
      }
      if (!r) { failed++; console.log(`real(${n}): FAILED (page died twice)`); continue; }
      const S = summarize(r); S.pass = pass;
      if (!OPT.quiet) console.log((OPT.repeat > 1 ? `[pass ${pass}] ` : '') + S.line);
      if (OPT.out) fs.appendFileSync(OPT.out, JSON.stringify({ ...S, line: undefined }) + '\n');
      if (OPT.csv && pass === 1) {
        const base = `${OPT.csv}/${n.replace(/[^\w.+-]/g, '_')}`;
        if (r.rows && r.rows.length) fs.writeFileSync(base + '.csv', toCsv(r.rows));
        if (r.pre && r.pre.length) fs.writeFileSync(base + '.pre.csv', toCsv(r.pre));
      }
      if (pass === 1) { first.set(n, S); rides.push(S); }
      else {
        const a = first.get(n), dp = a && a.endPos && S.endPos ? Math.hypot(...a.endPos.map((v, i) => v - S.endPos[i])) : NaN;
        console.log(`  pass ${pass} vs pass 1: end ${a && a.end} vs ${S.end}, end-position difference ${dp.toFixed(6)} m ${dp < 1e-6 && a.end === S.end ? '(identical)' : '(DIFFERS: state outside the sim leaks between runs)'}`);
        if (a && a.settleTrace && process.env.SIGDIFF) a.settleTrace.forEach((x, i) => { if (x !== S.settleTrace[i]) console.log(`    settleTrace[${i}] differs: ${x}  vs  ${S.settleTrace[i]}`); });
        if (a && a.sig && S.sig && process.env.SIGDIFF) for (const ph of ['settle', 'z']) for (const k of Object.keys(a.sig[ph])) { const x = JSON.stringify(a.sig[ph][k]), y = JSON.stringify(S.sig[ph][k]); if (x !== y) console.log(`    sig ${ph}.${k} differs: ${x} vs ${y}`); }
      }
    }
  }
  console.log(errs.slice(0, 3).join('\n') || 'no page errors');
  if (errs.length) failed++;
  if (GATE) {
    const done = rides.filter((s) => s.maxWinchStep !== undefined);
    const bad = (s, why) => `  ${s.name}: ${why}`, out = [];
    for (const s of rides) {
      if (s.maxWinchStep === undefined) out.push(bad(s, `no ride (${s.end} ${s.why})`));
      else if (s.fling > 0) out.push(bad(s, `flung: ${s.fling} frames with a winch step over 2 m (largest ${s.maxWinchStep.toFixed(2)} m)`));
      else if (/snapped/.test(s.why)) out.push(bad(s, 'the line snapped'));
      else if (s.firstIgnoredSign !== '-') out.push(bad(s, `the cable gave up on a sign post (${s.firstIgnoredSign}), so it runs through it`));
      else if (s.maxStreak > GATE_STREAK) out.push(bad(s, `cable inside a post for ${s.maxStreak} frames in a row (first at ${s.firstThrough} s)`));
    }
    console.log(`GATE: ${done.length} of ${names.length} rides${done.length < names.length ? ' (INCOMPLETE)' : ''}, ${out.length ? out.length + ' FAILED' : 'all clean'} (flung ${done.filter((s) => s.fling > 0).length}, snapped ${done.filter((s) => /snapped/.test(s.why)).length}, post given up ${done.filter((s) => s.firstIgnoredSign !== '-').length}, `
      + `frames through a post ${done.reduce((a, s) => a + s.framesThroughSign, 0)}, longest run ${done.reduce((a, s) => Math.max(a, s.maxStreak), 0)})`);
    for (const l of out) console.log(l);
    if (out.length || done.length < names.length) failed++;
  }
} catch (e) {
  console.error('FATAL: ' + (e && e.stack || e));
  failed++;
} finally {
  await closeBrowser();
}
process.exit(failed ? 1 : 0);
