#!/usr/bin/env bash
# Installs headless Blender (the `bpy` module) so tools/blender/*.py run without the Blender app.
# Idempotent: no-op if the pinned version is importable. Used by the SessionStart hook in .claude/settings.json;
# also fine in a cloud environment's setup script (cached, so new sessions start with it).
# Needs Python 3.13 (bpy 5.2.x wheels are cp313 only).
set -u
BPY_VERSION="${BPY_VERSION:-5.2.2}"
PY="${PYTHON:-python3}"

if "$PY" -c "import bpy,sys; sys.exit(0 if bpy.app.version_string.startswith('${BPY_VERSION%.*}') else 1)" 2>/dev/null; then
  echo "bpy ${BPY_VERSION} already installed"
  exit 0
fi

"$PY" -m pip install --quiet "bpy==${BPY_VERSION}" || {
  echo "setup-blender: pip install bpy==${BPY_VERSION} failed (needs Python 3.13 and PyPI access); Blender builds won't run this session" >&2
  exit 0   # never block a session over this
}
echo "bpy ${BPY_VERSION} installed"
