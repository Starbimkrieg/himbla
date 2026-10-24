// Dev server only (never built): lets the game's dev menu fetch and pull this checkout's upstream, and switch branches.
//
//   POST /__dev/git/status     git fetch --prune, then the branch's standing against its upstream
//   POST /__dev/git/pull       git pull --ff-only (fast-forward only: never merges, rebases or discards)
//   POST /__dev/git/branches   git fetch --prune, then origin's branches, newest commit first
//   POST /__dev/git/switch     body {"branch": name}: switch to origin's branch of that name (a local branch tracking it is
//                              made if there is none) and fast-forward it; refused while tracked files have changes
//
// Only the switch takes anything from the request, and only a name that is one of origin's branches as git lists them (and
// a plain ref name, never an option). Only a POST from this machine's own page is answered: loopback address, localhost
// Host, same Origin if sent, and a custom header another site can't add without a CORS preflight (never granted).
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const git = (args, timeout = 90000) => new Promise((resolve) => {
  execFile('git', args, {
    cwd: ROOT, timeout, windowsHide: true, maxBuffer: 1 << 20,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // missing credentials fail at once instead of waiting on an invisible prompt
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

async function remoteBranches() {
  const r = await git(['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(committerdate:relative)%09%(subject)', 'refs/remotes/origin']);
  return lines(r.out).map((l) => l.split('\t')).filter(([ref]) => ref.startsWith('origin/') && ref !== 'origin/HEAD' && ref !== 'origin')
    .map(([ref, when, subject]) => ({ name: ref.slice('origin/'.length), when, subject }));
}

async function branches() {
  const fetched = await git(['fetch', '--prune']);
  const [list, branch, dirty] = await Promise.all([remoteBranches(), git(['rev-parse', '--abbrev-ref', 'HEAD']), git(['status', '--porcelain', '--untracked-files=no'])]);
  return { ok: true, fetchError: fetched.ok ? '' : fetched.err, current: branch.out, dirty: lines(dirty.out).length, branches: list };
}

const SAFE_NAME = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/;

async function switchTo(body) {
  const name = body && typeof body.branch === 'string' ? body.branch : '';
  if (!SAFE_NAME.test(name) || !(await remoteBranches()).some((b) => b.name === name)) return { ok: false, err: `origin has no branch "${name}"` };
  if (lines((await git(['status', '--porcelain', '--untracked-files=no'])).out).length) {
    return { ok: false, err: 'This checkout has uncommitted changes to tracked files; commit or stash them first. Nothing was changed.' };
  }
  const before = (await git(['rev-parse', 'HEAD'])).out;
  const from = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out;
  const local = await git(['show-ref', '--verify', '--quiet', `refs/heads/${name}`]);
  const sw = local.ok ? await git(['switch', name]) : await git(['switch', '--track', `origin/${name}`]);
  if (!sw.ok) return { ok: false, err: sw.err || sw.out };
  const ff = local.ok ? await git(['merge', '--ff-only', `origin/${name}`]) : { ok: true };
  const after = (await git(['rev-parse', 'HEAD'])).out;
  const changed = before !== after ? lines((await git(['diff', '--name-only', `${before}..${after}`])).out) : [];
  return {
    ok: true, from, branch: name, head: after.slice(0, 7), changed: changed.length, ffError: ff.ok ? '' : (ff.err || ff.out),
    deps: changed.some((f) => f === 'package.json' || f === 'package-lock.json'),
  };
}

// a small JSON body (the switch's branch name)
const readBody = (req) => new Promise((resolve) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 4096) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
  req.on('error', () => resolve({}));
});

// one at a time: the chip polls during pulls, and two gits in one checkout fight over lock files
let queue = Promise.resolve();
const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

const ACTIONS = { '/status': () => serial(status), '/pull': () => serial(pull), '/branches': () => serial(branches), '/switch': (body) => serial(() => switchTo(body)) };

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
        readBody(req).then((body) => act(body)).then((r) => send(200, r), (e) => send(500, { ok: false, err: String((e && e.message) || e) }));
      });
    },
  };
}
