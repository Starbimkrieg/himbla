// Claude Code hooks (.claude/settings.json): the project rules a script can check, checked by a script instead of left
// to memory. Each reads the hook's JSON on stdin (tool_input.command for Bash).
//
//   node tools/claude-hooks.mjs pre    PreToolUse, Bash. Before a `git push`, checks the commits about to go up and blocks
//                                      the push (exit 2, the reason on stderr) when:
//                                        - package.json's version changed and no commit message says [release]
//                                        - src/ or tools/ changed and CHANGELOG.md didn't (unless a message says [no-changelog])
//                                        - a file was added to or removed from src/ or tools/ and docs/reference.md's source map
//                                          doesn't say so (unless a message says [no-docs])
//   node tools/claude-hooks.mjs geo    PreToolUse, Edit|Write|MultiEdit. Blender is the default for models: blocks an edit that
//                                      adds 3 or more code-built primitives (k.box, k.cyl, new THREE.BoxGeometry, ...) to a game
//                                      file in src/ (effects, terrain and the Kit's own helpers are exempt), unless this session
//                                      is waived in .claude/.code-models-ok (gitignored): the user asked for code, or it isn't a
//                                      model (docs/code-vs-blender.md, "Should stay code")
//   node tools/claude-hooks.mjs post   PostToolUse, Bash. Adds a reminder to Claude's context:
//                                        - after a tools/blender/build_*.py run: the audits and the after-build steps
//                                        - after a `git commit`: the dev servers still running, and a .glb changed without
//                                          the Asset Row (src/assetRowItems/)
//
// Exits 0 (no output) when there is nothing to say. Never fails a tool call over its own errors.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { basename, relative, isAbsolute, join } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const cmd = String(input.tool_input?.command || '');
// the command with heredoc bodies and quoted strings blanked, so text that only mentions git isn't taken for a git command
const bare = cmd.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, '<<_')
  .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
const mode = process.argv[2];
// `git <sub>` as a command (at the start, or after ; && || | ( or a newline, maybe with env vars or -C dir), not as text in a string
const runs = (sub) => new RegExp(`(^|[;&|(\\n])\\s*(\\w+=\\S*\\s+)*git(\\s+-C\\s+\\S+)?\\s+${sub}\\b`).test(bare);

function pre() {
  if (!runs('push')) return;
  if (runs('commit')) {
    block('Run `git commit` and `git push` as separate commands, so the push check (tools/claude-hooks.mjs) sees the new commit.');
  }
  const base = tryGit('rev-parse', '--verify', '-q', '@{u}') ? '@{u}' : upstreamBase();
  if (!base) return;
  const range = `${base}..HEAD`;
  if (!tryGit('rev-list', '-1', range)) return; // nothing to push
  const msgs = git('log', '--format=%B', range);
  const changes = git('diff', '--name-status', '--no-renames', base, 'HEAD').split('\n').filter(Boolean)
    .map((l) => { const [st, ...p] = l.split('\t'); return { st, path: p.join('\t') }; });
  const paths = new Set(changes.map((c) => c.path));
  const problems = [];

  if (paths.has('package.json') && !msgs.includes('[release]')) {
    const diff = git('diff', base, 'HEAD', '--', 'package.json');
    if (/^[-+]\s*"version":/m.test(diff)) {
      problems.push('package.json\'s version changed, but no commit says [release]. Only a release bumps it: put the version back.');
    }
  }

  const code = changes.filter((c) => /^(src|tools)\//.test(c.path));
  if (code.length && !paths.has('CHANGELOG.md') && !msgs.includes('[no-changelog]')) {
    problems.push('src/ or tools/ changed but CHANGELOG.md did not. Add the change under "## Unreleased" (or put [no-changelog] in the commit message if it really has no user-visible or tooling effect).');
  }

  if (!msgs.includes('[no-docs]')) {
    const ref = tryGit('show', 'HEAD:docs/reference.md') || '';
    const mapped = (p) => ref.includes(basename(p)) || ref.includes(basename(p).replace(/\.[^.]+$/, ''));
    const added = code.filter((c) => c.st === 'A' && !isAsset(c.path) && !mapped(c.path)).map((c) => c.path);
    const gone = code.filter((c) => c.st === 'D' && !isAsset(c.path) && ref.includes(basename(c.path))).map((c) => c.path);
    if (added.length) problems.push(`New files missing from the source map in docs/reference.md: ${added.join(', ')}. Add each one-line entry (or [no-docs] in a commit message if a file doesn't belong there).`);
    if (gone.length) problems.push(`Removed files still named in docs/reference.md: ${gone.join(', ')}. Take them out of the source map.`);
  }

  if (problems.length) block(`Push held back by tools/claude-hooks.mjs (${range}):\n- ${problems.join('\n- ')}\nFix with a new commit, then push again.`);
}

// ---- Blender by default (CLAUDE.md; blender skill, "Blender by default")
// visible primitives built in code: the Kit's shape helpers and three.js solids (not colliders, text, lines or buffers)
const PRIM = /\bk\.(box|cyl|ball|ring|beam|strip|add)\(|new THREE\.(Box|Cylinder|Sphere|Torus|TorusKnot|Cone|Lathe|Extrude|Octahedron|Capsule|Tube|Dodecahedron|Icosahedron|Tetrahedron|Ring|Circle|Plane)Geometry\(/g;
// files whose geometry is meant to stay code: the kits' own helpers, effects, terrain and sky, the render passes, the dev showroom
const STAY_CODE = /^src\/(outpostModels|downsKit|staticBake|fx|fountainFx|projectiles|meteors|rocks|boulders|planet|terrain\w*|spindleTerrain|spindleWorker|roadplan|post|farshadow|shadowcache|toon|devoverlay|freecam|cheats|perfgraph|mapview|hud|assetRow)\.js$|^src\/assetRowItems\//;
const WAIVER = '.claude/.code-models-ok';
const prims = (t) => (String(t || '').match(PRIM) || []).length;

function geo() {
  const ti = input.tool_input || {};
  const fp = String(ti.file_path || '');
  const rel = (isAbsolute(fp) ? relative(ROOT, fp) : fp).replace(/\\/g, '/');
  if (!/^src\/.*\.js$/.test(rel) || STAY_CODE.test(rel)) return;
  let added = 0;
  if (typeof ti.content === 'string') {
    const abs = join(ROOT, rel);
    added = prims(ti.content) - (existsSync(abs) ? prims(readFileSync(abs, 'utf8')) : 0);
  } else {
    const edits = Array.isArray(ti.edits) ? ti.edits : [ti];
    for (const e of edits) added += prims(e.new_string) - prims(e.old_string);
  }
  if (added < 3) return;
  const sid = String(input.session_id || 'default');
  const waived = existsSync(join(ROOT, WAIVER)) && readFileSync(join(ROOT, WAIVER), 'utf8').split(/\s+/).includes(sid);
  if (waived) return;
  block(`Blender is the default for models (CLAUDE.md; blender skill, "Blender by default"). This edit adds ${added} code-built primitives to ${rel}.
If it makes or refines how a model looks, build it in Blender instead: port the model to tools/blender/build_<name>.py and refine it there, even though it is code-built today.
Go ahead in code only if (a) the user asked for code for this, or (b) it isn't a model (an effect, terrain, a debug marker: docs/code-vs-blender.md, "Should stay code"). Then run
  echo ${sid} >> ${WAIVER}
tell the user which of (a) or (b) it was, and retry the edit.`);
}

// tests, generated or binary files the source map doesn't list one by one
function isAsset(p) {
  return /^src\/assets\//.test(p) || /\.(glb|png|jpe?g|svg|json|wav|ogg|mp3|webp)$/.test(p) || /__pycache__|\/proposals\//.test(p);
}

// a branch with no upstream yet: compare with the remote's default branch
function upstreamBase() {
  const head = tryGit('symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD') || 'origin/main';
  return tryGit('merge-base', 'HEAD', head);
}

function post() {
  const notes = [];
  const build = cmd.match(/\bpython[\d.]*\s+(?:-\S+\s+)*\S*tools\/blender\/(build_\w+)\.py/) || cmd.match(/exec\(open\([^)]*(build_\w+)\.py/);
  if (build) {
    const b = build[1];
    notes.push(`After building ${b}: (1) python3 tools/blender/structure_audit.py tools/blender/${b}.py and python3 tools/blender/style_audit.py tools/blender/${b}.py, and read every finding (fix it or make it deliberate and say why); (2) npm run optimize:glb unless it is runner.glb or outposts.glb (npm run check:outposts after outposts); (3) git checkout any .glb you rebuilt but did not mean to change; (4) a visible change updates the Asset Row (src/assetRowItems/) in the same commit; (5) look at it in the game: free cam, close, from two sides (game.cheats.freeCam.shot(...)). The blender skill has the details.`);
  }
  if (runs('commit')) {
    const servers = devServers();
    if (servers.length) notes.push(`Dev or preview servers still running:\n${servers.join('\n')}\nStop the ones you started for this work (preview_stop, or kill the process). Leave any the user started.`);
    const files = (tryGit('show', '--name-only', '--format=', 'HEAD') || '').split('\n');
    if (files.some((f) => /^src\/assets\/.*\.glb$/.test(f)) && !files.some((f) => f.startsWith('src/assetRowItems/'))) {
      notes.push('This commit changes a .glb but not the Asset Row (src/assetRowItems/). If the model was added, renamed, removed or visibly changed, update its item (blender skill, "Keep the Asset Row in step").');
    }
  }
  if (!notes.length) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n\n') } }));
}

function devServers() {
  let ps = '';
  try { ps = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }); } catch { return []; }
  return ps.split('\n').filter((l) => /\b(vite|electron)\b/.test(l) && !/claude-hooks|\bps\b|grep/.test(l))
    .map((l) => '  ' + l.trim().slice(0, 160));
}

function block(why) {
  process.stderr.write(why + '\n');
  process.exit(2);
}

// run last, once every constant above is defined
try {
  if (mode === 'pre') pre();
  else if (mode === 'geo') geo();
  else if (mode === 'post') post();
} catch (e) {
  process.stderr.write(`claude-hooks: ${e.message}\n`);
  process.exit(0); // a broken check never blocks work
}
