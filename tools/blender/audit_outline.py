# Outline audit for the Moon-runner: parts that stick out of another part with no outline of their own.
#
# Inked parts get a black shell (custom property "ink": its offset in metres). A raised detail with its own ink (pauldron, pack
# panel, knee guard) brings its own line. An ink-0 part (stripe, glow dot, trim ring) has none: where it sticks out of an inked
# part B by more than a few mm, its colour crosses B's black band ("colour through the outline"). For every ink-0 part P and each
# B it sticks out of, this counts P's vertices outside B by more than the tolerance but within B's shell ("proud") and the worst
# distance. Fix by sinking P flush (within a couple of mm of B) or giving it ink; that's taste, so this only reports.
#
# Run headless from the repo root (builds the runner, exports nothing):
#   python3 tools/blender/audit_outline.py                 top 25 rows
#   python3 tools/blender/audit_outline.py 60              top 60
#   TOL_MM=1.5 python3 tools/blender/audit_outline.py      stricter tolerance (default 3 mm)
# Check the part in tools/viewer.html?m=runner (close silhouette view) before and after.

import os, sys, math

if "MOONRUNNER_REPO" not in os.environ:
    _here = globals().get("__file__", "")
    if _here:
        os.environ["MOONRUNNER_REPO"] = os.path.abspath(os.path.join(os.path.dirname(_here), "..", ".."))
os.environ["MOONRUNNER_EXPORT"] = "0"
exec(open(os.path.join(os.environ["MOONRUNNER_REPO"], "tools", "blender", "build_runner.py"), encoding="utf-8").read(), globals())

from mathutils.bvhtree import BVHTree

TOP = int(sys.argv[-1]) if len(sys.argv) > 1 and sys.argv[-1].isdigit() else 25
TOL = float(os.environ.get("TOL_MM", "3")) / 1000
dg = bpy.context.evaluated_depsgraph_get()

parts = []   # (object, world-space verts, polys, ink, bbox)
for o in C.objects:
    if o.type != "MESH":
        continue
    me = o.evaluated_get(dg).to_mesh()
    mw = o.matrix_world
    verts = [mw @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    parts.append({"o": o, "name": o.name, "v": verts, "f": polys, "ink": float(o.get("ink", 0)), "lo": lo, "hi": hi, "bvh": None})

def bvh(B):
    if B["bvh"] is None:
        B["bvh"] = BVHTree.FromPolygons(B["v"], B["f"])
    return B["bvh"]

rows = []
for B in parts:
    t = B["ink"]
    if t <= 0:
        continue                         # no shell, no band to cross
    for P in parts:
        if P is B or P["ink"] > 0:
            continue                     # (inked parts bring their own line)
        # (cheap reject: P's box must reach B's shell-grown box)
        if any(P["lo"][i] > B["hi"][i] + t or P["hi"][i] < B["lo"][i] - t for i in range(3)):
            continue
        proud = buried = 0
        worst = 0.0
        for co in P["v"]:
            loc, n, idx, d = bvh(B).find_nearest(co, t * 1.001)
            if loc is None:
                continue                 # beyond the shell: clear of B
            if (co - loc).dot(n) >= 0:   # outside B, inside its shell zone
                if d > TOL:
                    proud += 1
                    worst = max(worst, d)
            else:
                buried += 1
        if proud:
            rows.append({"P": P["name"], "B": B["name"], "t": t, "proud": proud, "buried": buried, "n": len(P["v"]), "worst": worst})

rows.sort(key=lambda r: -r["worst"] * (r["proud"] / r["n"]) ** 0.5)
print(f"{len(parts)} parts, {sum(1 for p in parts if p['ink'] > 0)} inked, {sum(1 for p in parts if p['ink'] == 0)} with no ink; "
      f"{len(rows)} ink-0 parts stick out of an inked part by more than {TOL * 1000:.1f} mm")
print(f"{'part (no ink)':24s} {'sticks out of':20s} {'shell':>6s} {'proud':>6s} {'of':>5s} {'worst':>7s}")
for r in rows[:TOP]:
    print(f"{r['P']:24s} {r['B']:20s} {r['t'] * 100:5.1f}c {r['proud']:6d} {r['n']:5d} {r['worst'] * 100:6.2f}c")
if len(rows) > TOP:
    print(f"... and {len(rows) - TOP} more (pass a larger number to see them)")
