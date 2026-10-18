#!/usr/bin/env bash
# Installs headless Blender (the `bpy` module) so tools/blender/*.py can run without the Blender app.
# Idempotent: does nothing if the pinned version is already importable. Used by the SessionStart hook
# in .claude/settings.json; also fine to paste into a cloud environment's setup script, which caches
# the install in the environment so a new session starts with it already there.
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
