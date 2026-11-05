#!/usr/bin/env bash
# Installs the npm dependencies when node_modules is missing (a fresh cloud checkout), so `npm run dev`, the checks and
# the Playwright audits work without a manual install. Idempotent: no-op when node_modules is there. Used by the
# SessionStart hook in .claude/settings.json. In a cloud session (CLAUDE_CODE_REMOTE) it skips Electron's ~100 MB binary,
# which only `npm run app` and the desktop builds need.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" || exit 0
if [ -d node_modules/vite ]; then
  echo "node_modules present"
  exit 0
fi
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then export ELECTRON_SKIP_BINARY_DOWNLOAD=1; fi
npm ci --no-audit --no-fund --loglevel=error >/dev/null 2>&1 || {
  echo "setup-node: npm ci failed; run npm install by hand" >&2
  exit 0   # never block a session over this
}
echo "node_modules installed"
