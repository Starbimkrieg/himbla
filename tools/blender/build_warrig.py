# Rustmoon pirate war-rig builder for Blender (4.2+ / 5.x).
#
# Builds the pirate war-rig from code and exports src/assets/warrig.glb. In Blender's Python
# console or via MCP:  exec(open(r"<repo>/tools/blender/build_warrig.py").read())
#
# Moon Mad-Max on a budget: a beaten tub patched with whatever plate was lying around (rust, primer,
# olive drab, a stolen blue door), welded seams and rivets, a spiked ram plow, a blower sticking out
# of the hood, exhaust stacks, a pipe roll cage, mismatched wheels and a tattered flag. It should
# look dangerous but cheap: Longshot Kade's monster truck is the one to be scared of.
#
# Same layout as the game's rovers (makeRover in src/models.js), so the AI, the vehicle code and
# the physics drive it unchanged: wheels at (+-1.85, 0.85, +-1.8), radius 0.85; gun mount at
# (0, 3, 0.8); origin on the ground in the middle, +z forward.
# Pivots: chassis (everything that isn't a wheel), gun (yawed by the AI; child of chassis), wheel
# (four, spun about x). Each mesh has ONE material named after a slot; body and stripe take the
# faction colours, the rest are fixed scrap colours (see RIG_TOON in src/models.js).

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_warrig.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "warrig.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("War-rig export ->", OUT)
COLL = "MoonWarRig"

# preview colours (Rustmoon purple and toxic green): the game swaps in its own materials
SLOT_COLORS = {
    "body": (0.48, 0.18, 0.97), "stripe": (0.49, 1.0, 0.23), "rust": (0.48, 0.29, 0.2),
    "primer": (0.42, 0.44, 0.47), "olive": (0.35, 0.42, 0.23), "scrap": (0.23, 0.35, 0.48),
    "dark": (0.11, 0.1, 0.16), "steel": (0.33, 0.38, 0.48), "tire": (0.11, 0.1, 0.13),
    "bone": (0.91, 0.88, 0.78), "seat": (0.23, 0.16, 0.13), "lamp": (1.0, 0.96, 0.66),
    "hot": (1.0, 0.62, 0.11), "red": (0.84, 0.15, 0.24), "flag": (0.08, 0.08, 0.08),
}

# geometry and scene helpers shared with the other build scripts
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)


def plate(name, slot, parent, c, half, rot=(0, 0, 0), ink=0.03, rivets=0, rivet_side=1):
    """A thin patch plate (half-sizes), optionally studded with rivets along its long edges.
    rivet_side: which face (+-1 along the plate's thinnest axis) the rivets sit on."""
    mesh(name, xf(rbox(*half, e=0.12, nu=10, nv=4), c, rot), slot, parent, ink)
    if not rivets:
        return
    hx, hy, hz = half
    ax = min(range(3), key=lambda i: half[i])  # thin axis
    long = max((i for i in range(3) if i != ax), key=lambda i: half[i])
    other = 3 - ax - long
    pts = []
    for k in range(rivets):
        f = -0.85 + 1.7 * k / max(1, rivets - 1)
        for sgn in (-1, 1):
            p = [0.0, 0.0, 0.0]
            p[long] = f * half[long]
            p[other] = sgn * half[other] * 0.8
            p[ax] = rivet_side * (half[ax] + 0.02)
            pts.append(p)
    geo = ([], [])
    for i, p in enumerate(pts):
        g = xf(superquad(0.045, 0.045, 0.045, 1, 1, 6, 4), p)
        o = len(geo[0])
        geo = (geo[0] + g[0], geo[1] + [tuple(v + o for v in f) for f in g[1]])
    mesh(name + "_rivets", xf(geo, c, rot), "steel", parent, 0)


ROOT = pivot("warrig", (0, 0, 0), None)
CH = pivot("warrig_chassis", (0, 0, 0), ROOT, role="chassis")

# ---- frame and tub: a low welded box, its paint long gone in places ----
mesh("frame", xf(rbox(1.5, 0.25, 2.75, 0.15), (0, 0.72, 0)), "dark", CH, 0.05)
mesh("tub", xf(rbox(1.55, 0.55, 2.45, 0.1, 16, 6), (0, 1.2, -0.1)), "body", CH, 0.07)
# a crude war-stripe slapped down each flank, and a lightning bolt over it
for side in (-1, 1):
    mesh(f"stripe{side}", xf(rbox(0.03, 0.12, 2.0, 0.3, 8, 4), (side * 1.56, 1.35, -0.2)), "stripe", CH, 0)
    bolt = [(-0.9, 0.0), (-0.2, 0.0), (-0.35, 0.28), (0.5, 0.28), (-0.3, 0.75), (-0.05, 0.42), (-0.7, 0.42)]
    mesh(f"bolt{side}", xf(extrude(bolt, 0.03, "x"), (side * 1.58, 0.95, 0.9)), "stripe", CH, 0)

# patches welded over the holes: rust, primer, olive drab, a stolen blue door panel
plate("patchL1", "rust", CH, (-1.6, 1.15, -1.3), (0.04, 0.4, 0.55), (0, 0, 0.05), rivets=4, rivet_side=-1)
plate("patchL2", "olive", CH, (-1.6, 1.3, 0.5), (0.04, 0.32, 0.42), (0.08, 0, -0.04), rivets=3, rivet_side=-1)
plate("patchR1", "scrap", CH, (1.6, 1.2, -0.6), (0.04, 0.45, 0.7), (-0.05, 0, -0.06), rivets=4)
plate("patchR2", "rust", CH, (1.6, 1.0, 1.45), (0.04, 0.3, 0.38), (0.1, 0, 0.04), rivets=3)
plate("patchBack", "primer", CH, (0.3, 1.25, -2.58), (0.8, 0.42, 0.04), (0, 0, 0.06), rivets=4)
# welded seams down the tub's corners
for sx in (-1, 1):
    mesh(f"seam{sx}", beam((sx * 1.52, 1.72, -2.4), (sx * 1.52, 1.72, 2.2), 0.05, 5), "dark", CH, 0)

# ---- the front: a primer hood with a blower punched through it, and the spiked ram plow ----
mesh("hood", xf(rbox(1.3, 0.3, 0.9, 0.12, 14, 5), (0, 1.55, 1.75), (-0.12, 0, 0)), "primer", CH, 0.05)
plate("hoodPatch", "rust", CH, (0.55, 1.9, 1.6), (0.45, 0.03, 0.35), (-0.12, 0, 0.1), rivets=3)
mesh("blower", xf(rbox(0.32, 0.25, 0.42, 0.25), (0, 2.08, 1.65)), "steel", CH, 0.04)
mesh("scoop", xf(rbox(0.36, 0.14, 0.22, 0.2), (0, 2.42, 1.75)), "dark", CH, 0.03)
mesh("scoopMouth", xf(rbox(0.28, 0.08, 0.03, 0.3, 8, 4), (0, 2.42, 1.98)), "hot", CH, 0)
# the plow: a raked plate across the nose, a pipe bumper and a row of spikes
plow = [(0.0, 0.0), (0.6, 0.0), (0.95, 1.1), (0.35, 1.25)]
mesh("plow", xf(extrude(plow, 3.4, "x"), (0, 0.45, 2.35)), "rust", CH, 0.07)
mesh("plowEdge", xf(rbox(1.72, 0.06, 0.06, 0.4, 10, 4), (0, 1.66, 2.75)), "steel", CH, 0)
mesh("bumper", beam((-1.6, 0.85, 3.0), (1.6, 0.85, 3.0), 0.11, 8), "dark", CH, 0.03)
for i, x in enumerate((-1.35, -0.68, 0.0, 0.68, 1.35)):
    tall = 1.15 if i % 2 == 0 else 0.85
    mesh(f"spike{i}", xf(lathe([(0.2, 0), (0.16, 0.2), (0, tall)], 6), (x, 1.15 + (0.12 if i == 2 else 0), 3.05), (math.pi / 2 - 0.25, 0, 0)), "bone", CH, 0.02)
for side in (-1, 1):
    mesh(f"hornSpike{side}", xf(lathe([(0.14, 0), (0.11, 0.12), (0, 0.9)], 6), (side * 1.62, 0.9, 2.95), (math.pi / 2, 0, side * -0.5)), "bone", CH, 0.02)
# headlights that don't match: a round one and a square one in a cage
mesh("lampL", xf(lathe([(0, 0), (0.2, 0), (0.22, 0.12), (0, 0.14)], 10), (-0.9, 1.6, 2.6), (math.pi / 2, 0, 0)), "lamp", CH, 0.02)
mesh("lampR", xf(rbox(0.18, 0.14, 0.06, 0.2, 8, 4), (0.95, 1.5, 2.62)), "lamp", CH, 0.02)
mesh("lampCage", xf(torus(0.24, 0.025, 12, 4), (-0.9, 1.6, 2.7), (math.pi / 2, 0, 0)), "dark", CH, 0)

# ---- the cab: open, a torn seat, a grille of welded bars for a windscreen, a pipe roll cage ----
mesh("seat", xf(rbox(0.42, 0.14, 0.4, 0.3), (0, 1.85, -0.5)), "seat", CH, 0.02)
mesh("seatBack", xf(rbox(0.42, 0.5, 0.12, 0.3), (0, 2.35, -0.95), (-0.15, 0, 0)), "seat", CH, 0.02)
for k in range(5):
    x = -0.8 + k * 0.4
    mesh(f"screenBar{k}", beam((x, 1.75, 0.75), (x * 0.95, 2.6, 0.55), 0.035, 4), "steel", CH, 0)
mesh("screenTop", beam((-0.85, 2.6, 0.55), (0.85, 2.6, 0.55), 0.045, 5), "dark", CH, 0)
for sx in (-1, 1):
    mesh(f"cageF{sx}", tube([(sx * 1.2, 1.7, 0.8), (sx * 1.1, 3.3, 0.45)], [0.07, 0.07], 6), "dark", CH, 0.02)
    mesh(f"cageB{sx}", tube([(sx * 1.25, 1.7, -1.6), (sx * 1.1, 3.3, -1.15)], [0.07, 0.07], 6), "dark", CH, 0.02)
    mesh(f"cageTop{sx}", beam((sx * 1.1, 3.3, 0.45), (sx * 1.1, 3.3, -1.15), 0.07, 6), "dark", CH, 0)
mesh("cageX1", beam((-1.1, 3.3, 0.45), (1.1, 3.3, 0.45), 0.07, 6), "dark", CH, 0)
mesh("cageX2", beam((-1.1, 3.3, -1.15), (1.1, 3.3, -1.15), 0.07, 6), "dark", CH, 0)
plate("roofScrap", "olive", CH, (0.35, 3.4, -0.85), (0.55, 0.03, 0.35), (0.05, 0.2, 0), rivets=3)

# ---- the back: exhaust stacks, a spare tyre, jerry cans and a crate lashed on ----
for sx in (-1, 1):
    mesh(f"stack{sx}", tube([(sx * 1.35, 1.2, -2.25), (sx * 1.35, 2.9, -2.25), (sx * 1.4, 3.2, -2.1)], [0.16, 0.16, 0.18], 8), "steel", CH, 0.03)
    mesh(f"stackTip{sx}", xf(torus(0.16, 0.05, 10, 4), (sx * 1.4, 3.22, -2.1), (0.4, 0, 0)), "hot", CH, 0)
mesh("spare", xf(torus(0.55, 0.22, 18, 8), (0, 1.55, -2.85), (math.pi / 2, 0, 0)), "tire", CH, 0.04)
mesh("spareHub", xf(lathe([(0, 0), (0.32, 0), (0.32, 0.12), (0, 0.12)], 10), (0, 1.55, -2.78), (math.pi / 2, 0, 0)), "rust", CH, 0)
for i, (x, slot) in enumerate(((-1.0, "red"), (0.95, "olive"))):
    mesh(f"can{i}", xf(rbox(0.22, 0.3, 0.12, 0.2), (x, 1.95, -2.2), (0, 0, 0.1 * (1 - 2 * i))), slot, CH, 0.03)
mesh("crate", xf(rbox(0.4, 0.3, 0.35, 0.12), (0.0, 1.95, -1.85), (0, 0.3, 0)), "rust", CH, 0.03)

# ---- the flag: a whip pole at the back with a tattered rag and a painted skull ----
mesh("pole", beam((-1.2, 1.7, -2.2), (-1.2, 4.6, -2.25), 0.05, 5), "dark", CH, 0)
rag = [(0, 0), (-1.3, 0.05), (-1.15, -0.25), (-1.35, -0.45), (-1.05, -0.6), (-1.2, -0.85), (0, -0.9)]
mesh("flag", xf(extrude([(z, y) for z, y in rag], 0.02, "z"), (-1.2, 4.55, -2.25)), "flag", CH, 0.02)
mesh("skull", xf(superquad(0.17, 0.17, 0.03, 1, 1, 8, 4), (-1.75, 4.15, -2.25)), "bone", CH, 0)

# ---- the gun: a scrap pintle twin-gun the AI swings round ----
G = pivot("warrig_gun", (0, 3.0, 0.8), CH, role="gun")
mesh("gunPost", beam((0, -1.1, 0), (0, -0.2, 0), 0.1, 6), "dark", G, 0.02)
mesh("gunBody", rbox(0.4, 0.24, 0.45, 0.2), "dark", G, 0.04)
mesh("gunShield", xf(rbox(0.5, 0.32, 0.04, 0.15), (0, 0.18, 0.5)), "stripe", G, 0.03)
for sx in (-0.17, 0.17):
    mesh(f"barrel{sx}", beam((sx, 0.2, 0.3), (sx, 0.2, 1.45), 0.07, 6), "steel", G, 0.02)
    mesh(f"muzzle{sx}", xf(lathe([(0.1, 0), (0.1, 0.12), (0.07, 0.14)], 6), (sx, 0.2, 1.45), (math.pi / 2, 0, 0)), "dark", G, 0)

# ---- wheels: chunky tyres with tread blocks, hubs that never matched ----
HUBS = ["rust", "steel", "primer", "rust"]
for i, (sx, sz) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1))):
    W = pivot(f"wheel{i}", (sx * 1.85, 0.85, sz * 1.8), ROOT, role="wheel")
    tyre = lathe([(0.45, -0.35), (0.78, -0.35), (0.85, -0.25), (0.85, 0.25), (0.78, 0.35), (0.45, 0.35)], 18)
    mesh(f"tyre{i}", xf(tyre, r=(0, 0, math.pi / 2)), "tire", W, 0.05)
    for k in range(10):
        a = k * 2 * math.pi / 10
        mesh(f"tread{i}_{k}", xf(rbox(0.33, 0.06, 0.1, 0.3, 6, 4), (0, math.cos(a) * 0.86, math.sin(a) * 0.86), (a, 0, 0)), "tire", W, 0)
    mesh(f"hub{i}", xf(lathe([(0, 0), (0.45, 0), (0.42, 0.06), (0.2, 0.12), (0, 0.12)], 10), (sx * 0.36, 0, 0), (0, 0, -sx * math.pi / 2)), HUBS[i], W, 0.02)
    if i < 2:  # spiked hubs up front
        mesh(f"hubSpike{i}", xf(lathe([(0.1, 0), (0, 0.4)], 6), (sx * 0.47, 0, 0), (0, 0, -sx * math.pi / 2)), "bone", W, 0.02)

ROOT["radius"] = 3.2
print("built", len(C.objects), "objects")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
