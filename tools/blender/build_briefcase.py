# Credits briefcase builder for Blender (4.2+ / 5.x).
#
# Builds the little case that is thrown out of a wrecked vehicle holding its credits (alchemy.js dropLoot with
# `credits`) and exports src/assets/briefcase.glb. In Blender's Python console or via MCP:
#   exec(open(r"<repo>/tools/blender/build_briefcase.py").read())
# Headless:  MOONRUNNER_REPO=<repo> python3 tools/blender/build_briefcase.py   (needs `pip install bpy`)
#
# A hard-shelled attache case standing on its edge: a lid seam, a carrying handle on top, two gold latches,
# gold corner guards and the credit sign (a C struck through with a bar) in gold on both faces.
# - One root empty "briefcase"; every mesh hangs off it. Authored in three.js axes (x right, y up, +z front),
#   centred on the origin, about 0.94 x 0.76 x 0.3 m. The game spins it about y.
# - Each mesh has ONE material named after a slot (body, dark, trim, gold); the game swaps in its own toon
#   materials. Custom property "ink" = outline thickness in metres (0 = none).

import bpy, math, os

def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_briefcase.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "briefcase.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Briefcase export ->", OUT)
COLL = "MoonBriefcase"

# preview colours only: the game replaces every slot with its own material
SLOT_COLORS = {
    "body": (0.3, 0.18, 0.13), "dark": (0.1, 0.08, 0.1), "trim": (0.54, 0.53, 0.63), "gold": (1.0, 0.82, 0.25),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
HX, HY, HZ = 0.46, 0.34, 0.15   # half extents of the shell
ROOT = pivot("briefcase", (0, 0, 0))

mesh("shell", xf(rbox(HX, HY, HZ, 0.12, 18, 10), (0, 0, 0)), "body", ROOT, 0.03)
# the lid seam and the hinge side's dark band
mesh("seam", xf(rbox(HX + 0.008, 0.014, HZ + 0.008, 0.3, 14, 4), (0, 0.1, 0)), "dark", ROOT, 0)
for sz in (-1, 1):
    # a raised gold-edged panel on each face for the logo to sit on
    mesh(f"panel{sz}", xf(rbox(0.3, 0.2, 0.012, 0.3, 14, 5), (0, -0.1, sz * (HZ + 0.002))), "dark", ROOT, 0)
    mesh(f"panelRim{sz}", xf(rbox(0.32, 0.22, 0.008, 0.3, 14, 5), (0, -0.1, sz * (HZ - 0.004))), "gold", ROOT, 0)
    # the credit sign: a C open to the right as you face the case (the back face is turned round), and a bar through it
    z = sz * (HZ + 0.013)
    ring = place(torus_partial(0.13, 0.022, 6, 28, 2 * PI - 1.3), Matrix.Translation((0.0, -0.1, z)) @ Matrix.Rotation(0.65 if sz > 0 else 0.65 + PI, 4, "Z") @ Matrix.Diagonal((1, 1, 0.5, 1)))
    mesh_smooth(f"logoC{sz}", ring, "gold", ROOT, 0)
    mesh(f"logoBar{sz}", xf(rbox(0.022, 0.19, 0.014, 0.3, 8, 4), (0.0, -0.1, z)), "gold", ROOT, 0)
    # latches on the seam
    for x in (-0.28, 0.28):
        mesh(f"latch{sz}{x}", xf(rbox(0.06, 0.05, 0.02, 0.3, 8, 4), (x, 0.1, sz * (HZ + 0.012))), "gold", ROOT, 0.012)
        mesh(f"latchPin{sz}{x}", xf(rbox(0.018, 0.018, 0.012, 0.5, 6, 4), (x, 0.1, sz * (HZ + 0.028))), "dark", ROOT, 0)

# carrying handle on top, on two small mounts
hand = place(torus_partial(0.13, 0.025, 6, 20, PI), Matrix.Translation((0.0, HY - 0.01, 0.0)))
mesh_smooth("handle", hand, "dark", ROOT, 0.015)
for x in (-0.13, 0.13):
    mesh(f"mount{x}", xf(rbox(0.04, 0.025, 0.05, 0.3, 8, 4), (x, HY - 0.01, 0.0)), "trim", ROOT, 0.012)

# corner guards, front and back
for sx in (-1, 1):
    for sy in (-1, 1):
        mesh(f"corner{sx}{sy}", xf(rbox(0.07, 0.07, HZ + 0.015, 0.3, 8, 5), (sx * (HX - 0.05), sy * (HY - 0.05), 0)), "gold", ROOT, 0.02)

ROOT["radius"] = 0.55
print("built", len(C.objects), "objects")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
