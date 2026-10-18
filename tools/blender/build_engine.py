# Salvaged engine builder for Blender (4.2+ / 5.x).
#
# The engine a wreck drops (alchemy.js dropLoot: a heavy physics lump you scoop with G), exported to
# src/assets/engine.glb. In Blender's Python console or via MCP:
#   exec(open(r"<repo>/tools/blender/build_engine.py").read())
# Headless:  MOONRUNNER_REPO=<repo> python3 tools/blender/build_engine.py   (needs `pip install bpy`)
#
# A scorched, dented engine block: ribbed head, valve covers, exhaust manifolds, bell housing at the back, belt pulley
# at the front, on a bent mounting plate.
# - One root empty "engine" holds every mesh. three.js axes (x right, y up, +z front), centred on the origin, about
#   1.1 x 0.8 x 1.5 m (the game's rigid body rests it 0.45 m above the ground).
# - One material per mesh, named after a slot (body, dark, metal, steel, hot); the game swaps in its toon materials
#   (hot glows). Custom property "ink" = outline thickness in m (0 = none).

import bpy, math, os

def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_engine.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "engine.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Engine export ->", OUT)
COLL = "MoonEngine"

# preview colours only: the game replaces every slot's material
SLOT_COLORS = {
    "body": (0.42, 0.27, 0.2), "dark": (0.1, 0.09, 0.13), "metal": (0.54, 0.53, 0.63),
    "steel": (0.3, 0.32, 0.4), "hot": (1.0, 0.42, 0.16),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
ROOT = pivot("engine", (0, 0, 0))

# bent mounting plate and the block on it
mesh("plate", xf(rbox(0.52, 0.035, 0.7, 0.2, 12, 5), (0, -0.42, 0.02), (0.03, 0, -0.04)), "dark", ROOT, 0.03)
mesh("block", xf(rbox(0.4, 0.22, 0.56, 0.16, 16, 8), (0, -0.16, 0.02)), "body", ROOT, 0.04)
mesh("sump", xf(rbox(0.3, 0.08, 0.42, 0.25, 12, 5), (0, -0.37, 0.0)), "steel", ROOT, 0.03)
mesh("head", xf(rbox(0.34, 0.1, 0.5, 0.18, 14, 6), (0, 0.1, 0.02)), "metal", ROOT, 0.03)
# valve cover with cooling ribs, four spark plugs / injectors a side
mesh("cover", xf(rbox(0.26, 0.06, 0.42, 0.25, 12, 5), (0, 0.22, 0.02)), "dark", ROOT, 0.03)
for k in range(5):
    mesh(f"rib{k}", xf(rbox(0.27, 0.025, 0.025, 0.4, 8, 4), (0, 0.285, -0.3 + k * 0.15)), "metal", ROOT, 0)
for k in range(4):
    z = -0.22 + k * 0.15
    for side in (-1, 1):
        mesh(f"plug{k}{'LR'[side > 0]}", xf(lathe([(0.0, 0), (0.035, 0), (0.03, 0.12), (0.045, 0.14), (0.045, 0.2), (0, 0.2)], 8), (side * 0.2, 0.2, z), (0, 0, side * -0.5)), "steel", ROOT, 0.015)

# exhaust manifold down each flank, a stub per cylinder; the ports glow hot
for side in (-1, 1):
    tag = "LR"[side > 0]
    mesh(f"manifold{tag}", B((side * 0.5, 0.0, -0.4), (side * 0.5, 0.0, 0.42), 0.06, 8, True), "steel", ROOT, 0.03)
    for k in range(4):
        z = -0.3 + k * 0.2
        mesh(f"stub{tag}{k}", B((side * 0.5, 0.0, z), (side * 0.38, -0.04, z), 0.045, 6, True), "steel", ROOT, 0.02)
        mesh(f"port{tag}{k}", xf(rbox(0.035, 0.035, 0.035, 0.5, 6, 4), (side * 0.52, 0.0, z)), "hot", ROOT, 0)
    mesh(f"exhaustPipe{tag}", tube([(side * 0.5, 0.0, 0.42), (side * 0.55, 0.02, 0.58), (side * 0.52, 0.2, 0.7)], [0.075, 0.075, 0.09], 8, True), "dark", ROOT, 0.03)

# bell housing at the back, pulley and belt at the front
mesh("bell", xf(lathe([(0.0, 0.0), (0.4, 0.0), (0.42, 0.05), (0.42, 0.28), (0.3, 0.42), (0.28, 0.5), (0, 0.5)], 20), (0, -0.12, -0.5), (-PI / 2, 0, 0)), "body", ROOT, 0.04)
mesh("bellBolts", xf(torus(0.37, 0.025, 20, 5), (0, -0.12, -0.56), (PI / 2, 0, 0)), "steel", ROOT, 0.015)
mesh("pulley", xf(lathe([(0.0, 0.0), (0.22, 0.0), (0.24, 0.03), (0.24, 0.1), (0.2, 0.12), (0.0, 0.12)], 20), (0, -0.1, 0.58), (PI / 2, 0, 0)), "steel", ROOT, 0.03)
mesh("belt", xf(torus(0.215, 0.022, 20, 5), (0, -0.1, 0.66), (PI / 2, 0, 0)), "dark", ROOT, 0)
mesh("hub", xf(lathe([(0.0, 0.0), (0.07, 0.0), (0.07, 0.07), (0.0, 0.07)], 8), (0, -0.1, 0.7), (PI / 2, 0, 0)), "metal", ROOT, 0)

# damage: a bent oil filler pipe on top, a gash in the flank
mesh("filler", tube([(0.14, 0.24, -0.15), (0.2, 0.42, -0.2), (0.12, 0.52, -0.28)], [0.05, 0.05, 0.065], 8, True), "metal", ROOT, 0.025)
mesh("gash", xf(rbox(0.015, 0.05, 0.14, 0.4, 6, 4), (-0.405, -0.12, 0.2), (0, 0, 0.2)), "dark", ROOT, 0)

ROOT["radius"] = 0.8
print("built", len(C.objects), "objects")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
