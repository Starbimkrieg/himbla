// Dev server only (never part of a build): lets the game's dev menu fetch and pull this checkout's upstream.
//
//   POST /__dev/git/status   git fetch --prune, then where the branch stands against its upstream
//   POST /__dev/git/pull     git pull --ff-only (a fast-forward, nothing else: it never merges, rebases or discards anything)
//
// The commands are fixed (nothing from the request reaches git), the endpoint answers only a POST from this machine's own
// page (loopback address, a localhost Host, the same Origin if the browser sends one, and a custom header that a page on another
// site could not add without a CORS preflight, which this server never grants).
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const git = (args, timeout = 90000) => new Promise((resolve) => {
  execFile('git', args, {
    cwd: ROOT, timeout, windowsHide: true, maxBuffer: 1 << 20,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // (a missing credential fails at once instead of waiting on a prompt nobody can see)
  }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || '').trim() || (err ? err.message : '') }));
});

const lines = (s) => (s ? s.split(/\r?\n/).filter(Boolean) : []);

async function status() {
  const fetched = await git(['fetch', '--prune']);
  const [branch, upstream, head, counts, dirty, incoming] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD']),
    git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    git(['rev-parse', '--short', 'HEAD']),
    git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']),
    git(['status', '--porcelain', '--untracked-files=no']),
    git(['log', '--format=%h %s', '-n', '12', 'HEAD..@{u}']),
  ]);
  const out = {
    ok: true, branch: branch.out, head: head.out, fetchError: fetched.ok ? '' : fetched.err,
    upstream: upstream.ok ? upstream.out : '', ahead: 0, behind: 0, dirty: lines(dirty.out).length, incoming: lines(incoming.out),
  };
  if (counts.ok) { const [a, b] = counts.out.split(/\s+/).map(Number); out.ahead = a || 0; out.behind = b || 0; }
  else if (!upstream.ok) out.noUpstream = true;
  return out;
}

async function pull() {
  const before = (await git(['rev-parse', 'HEAD'])).out;
  const r = await git(['pull', '--ff-only', '--no-rebase']);
  const after = (await git(['rev-parse', 'HEAD'])).out;
  const changed = before && after && before !== after ? lines((await git(['diff', '--name-only', `${before}..${after}`])).out) : [];
  return {
    ok: r.ok, out: r.out, err: r.err, from: before.slice(0, 7), to: after.slice(0, 7), changed: changed.length,
    deps: changed.some((f) => f === 'package.json' || f === 'package-lock.json'),
  };
}

// one at a time: the chip polls while a pull may be running, and two gits in one checkout would fight over its lock files
let queue = Promise.resolve();
const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

const ACTIONS = { '/status': () => serial(status), '/pull': () => serial(pull) };

export function devGit() {
  return {
    name: 'dev-git',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/git', (req, res) => {
        const send = (code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
        const host = String(req.headers.host || '').replace(/:\d+$/, '');
        const origin = req.headers.origin;
        if (req.method !== 'POST') return send(405, { ok: false, err: 'POST only' });
        if (!LOOPBACK.has(req.socket.remoteAddress) || !HOSTS.has(host) || req.headers['x-dev-git'] !== '1' || (origin && origin !== `http://${req.headers.host}`)) {
          return send(403, { ok: false, err: 'Only the game running on this machine may ask.' });
        }
        const act = ACTIONS[req.url.split('?')[0]];
        if (!act) return send(404, { ok: false, err: 'No such action' });
        act().then((r) => send(200, r), (e) => send(500, { ok: false, err: String((e && e.message) || e) }));
      });
    },
  };
}
