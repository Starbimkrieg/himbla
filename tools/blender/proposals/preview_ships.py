# Renders the current freighter (build_ships.py, no export) to compare with the proposals.
#   MOONRUNNER_REPO=<repo> python3 preview_ships.py <out-prefix>
import os, sys
os.environ["MOONRUNNER_EXPORT"] = "0"
REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
os.environ["MOONRUNNER_REPO"] = REPO
exec(open(os.path.join(REPO, "tools", "blender", "build_ships.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "proposals", "preview.py"), encoding="utf-8").read(), globals())
for o in list(bpy.data.objects):
    if o.name.startswith("s_") or o.name.startswith("shuttle"):
        o.hide_render = True
FR.location = (0, 0, 0)
render_views(FR, sys.argv[-1] if len(sys.argv) > 1 else "/tmp/freighter_current")
