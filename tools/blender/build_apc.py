# Vostok BTR-M Moon APC builder for Blender (4.2+ / 5.x).
#
# Builds the APC from code and exports src/assets/apc.glb. In Blender's Python console or via MCP:
#   exec(open(r"<repo>/tools/blender/build_apc.py").read())
# or headless, with the bpy module:  MOONRUNNER_REPO=<repo> python3 build_apc.py
#
# An eight-wheeled slab-sided armoured carrier in the Vostok slate and red: a sloped hull with a raised
# driver's block and vision slits, wheel fenders with the faction stripe and star, an engine deck with
# louvres, antennas, tow hooks, and a turret on the roof carrying a 30 mm cannon and a coaxial gun.
#
# Same conventions as the other rovers (makeRover in src/models.js, build_warrig.py): origin on the
# ground in the middle, +z forward, so the vehicle code drives it unchanged. Pivots (empties with a
# `role`, exactly like the war-rig):
#   chassis  everything that isn't a wheel or the turret group
#   turret   child of chassis, yawed about its own y axis (the game turns it to follow the camera)
#   barrel   child of turret, pitched about x (the game raises it to follow the camera); the mantlet,
#            cannon and coaxial gun ride on it, so they swing together
#   muzzle   child of barrel, an empty at the cannon's mouth: shells leave from here
#   wheel    eight, spun about x
# Each mesh has ONE material named after a slot; body and stripe take the faction colours, the rest
# are fixed (see APC_TOON / APC_GLOW in src/models.js).

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_apc.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "apc.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("APC export ->", OUT)
COLL = "MoonAPC"

# preview colours (Vostok slate and red): the game swaps in its own materials
SLOT_COLORS = {
    "body": (0.42, 0.44, 0.47), "stripe": (1.0, 0.23, 0.36), "dark": (0.11, 0.1, 0.16), "steel": (0.33, 0.38, 0.48),
    "tire": (0.11, 0.1, 0.13), "olive": (0.35, 0.42, 0.23), "glass": (0.81, 0.94, 1.0), "lamp": (1.0, 0.96, 0.66),
    "tail": (1.0, 0.16, 0.29), "hot": (1.0, 0.62, 0.11),
}

# geometry and scene helpers shared with the other build scripts
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)


def star(r_out, r_in, n=5):
    """A flat n-pointed star outline [(a, b)], point up."""
    pts = []
    for i in range(2 * n):
        a = math.pi / 2 + math.pi * i / n
        r = r_out if i % 2 == 0 else r_in
        pts.append((math.cos(a) * r, math.sin(a) * r))
    return pts


ROOT = pivot("apc", (0, 0, 0), None)
# The hull rides LIFT above where it is modelled below (the numbers in the hull section are measured from its
# own pivot), so its belly and the fenders clear the tops of the wheels; the underbody block, axles and
# differentials sit on the root, on the wheels' own heights.
LIFT = 0.35
CH = pivot("apc_chassis", (0, LIFT, 0), ROOT, role="chassis")

# ---- hull: a boxy loft, sloped at the nose, with a skid plate and belly under it ----
HULL = [
    # the rear: full height and width back to the end of the engine deck, then a short taper to the tail plate
    dict(z=-3.3, w=1.25, t=0.36, b=0.36, yc=1.44, eT=3.4, eB=3.4),
    dict(z=-3.1, w=1.42, t=0.62, b=0.46, yc=1.49, eT=3.4, eB=3.4),
    dict(z=-2.8, w=1.52, t=0.72, b=0.52, yc=1.50, eT=3.4, eB=3.4),
    dict(z=-1.0, w=1.52, t=0.72, b=0.52, yc=1.50, eT=3.4, eB=3.4),
    dict(z=1.2, w=1.52, t=0.72, b=0.52, yc=1.50, eT=3.4, eB=3.4),
    dict(z=2.35, w=1.45, t=0.56, b=0.50, yc=1.43, eT=3.4, eB=3.4),
    dict(z=3.0, w=1.20, t=0.26, b=0.38, yc=1.18, eT=3.4, eB=3.4),
]
mesh("hull", loft(HULL, 28), "body", CH, 0.07)
mesh("skid", xf(rbox(1.38, 0.1, 2.9, 0.2), (0, 0.98, 0.05)), "dark", CH, 0.04)
mesh("noseSkid", xf(rbox(1.0, 0.08, 0.45, 0.2), (0, 0.9, 2.75), (0.25, 0, 0)), "dark", CH, 0.03)

# the driver's block: a raised armoured box on the glacis, vision slits across it
mesh("cab", xf(rbox(1.0, 0.26, 0.6, 0.18, 14, 6), (0, 2.18, 1.8)), "body", CH, 0.06)
mesh("cabSlits", xf(rbox(0.86, 0.075, 0.03, 0.3, 10, 4), (0, 2.22, 2.4)), "glass", CH, 0)
for sx in (-1, 1):
    mesh(f"cabSide{sx}", xf(rbox(0.03, 0.07, 0.25, 0.3, 6, 4), (sx * 1.0, 2.2, 1.85)), "glass", CH, 0)

# engine deck: a plate with louvres, and two roof hatches behind the turret
mesh("deck", xf(rbox(1.1, 0.045, 1.35, 0.2, 14, 4), (0, 2.24, -1.5)), "steel", CH, 0.03)
for k in range(7):
    mesh(f"louvre{k}", xf(rbox(0.8, 0.02, 0.045, 0.3, 8, 4), (0, 2.285, -2.15 + k * 0.22)), "dark", CH, 0)
for sx in (-1, 1):
    mesh(f"hatch{sx}", xf(lathe([(0, 0), (0.32, 0), (0.3, 0.07), (0, 0.08)], 12), (sx * 0.6, 2.22, -0.55)), "steel", CH, 0.02)
    mesh(f"hatchRim{sx}", xf(torus(0.3, 0.025, 14, 4), (sx * 0.6, 2.3, -0.55)), "dark", CH, 0)

# wheel fenders: long boxes over each wheel row, the faction stripe and star on the flanks
for sx in (-1, 1):
    mesh(f"fender{sx}", xf(rbox(0.2, 0.2, 3.4, 0.2, 14, 6), (sx * 1.64, 1.21, 0.05)), "body", CH, 0.05)
    mesh(f"stripe{sx}", xf(rbox(0.025, 0.07, 3.0, 0.3, 8, 4), (sx * 1.85, 1.24, 0.05)), "stripe", CH, 0)
    mesh(f"star{sx}", xf(extrude(star(0.34, 0.14), 0.03, "x"), (sx * 1.53, 1.72, 0.55)), "stripe", CH, 0)
    # a side door and a firing port
    mesh(f"door{sx}", xf(rbox(0.025, 0.34, 0.42, 0.15, 6, 4), (sx * 1.535, 1.7, -0.7)), "steel", CH, 0.02)
    mesh(f"port{sx}", xf(rbox(0.025, 0.05, 0.12, 0.3, 6, 4), (sx * 1.545, 1.82, -0.7)), "dark", CH, 0)

# front: bumper beam, tow hooks, headlights
mesh("bumper", beam((-1.45, 0.95, 3.0), (1.45, 0.95, 3.0), 0.1, 8), "dark", CH, 0.03)
for sx in (-1, 1):
    mesh(f"hook{sx}", xf(torus(0.12, 0.035, 10, 5), (sx * 0.95, 0.95, 3.12), (math.pi / 2, 0, 0)), "steel", CH, 0.01)
    mesh(f"lamp{sx}", xf(rbox(0.2, 0.12, 0.05, 0.2, 8, 4), (sx * 0.8, 1.2, 3.02), (0.6, 0, 0)), "lamp", CH, 0.02)
    mesh(f"lampGuard{sx}", xf(rbox(0.24, 0.16, 0.025, 0.2, 8, 4), (sx * 0.8, 1.2, 3.04), (0.6, 0, 0)), "dark", CH, 0)
# rear: tail lights, a tow pintle, jerry cans on the deck
for sx in (-1, 1):
    mesh(f"tail{sx}", xf(rbox(0.2, 0.1, 0.04, 0.2, 8, 4), (sx * 0.85, 1.45, -3.31)), "tail", CH, 0.02)
mesh("pintle", xf(lathe([(0.12, 0), (0.12, 0.16), (0.07, 0.2)], 8), (0, 1.3, -3.3), (-math.pi / 2, 0, 0)), "steel", CH, 0.02)
# the exhaust: a short rectangular stub standing upright on the back of the engine deck plate (flat there, so it
# sits square), with a flange, a clamp band, a lip and a glowing rim round a dark mouth
EX, EZ = 0.8, -2.62                    # where it stands (x, z): left side, clear of the antenna and the cans
EY = 2.285                             # the top of the deck plate
TOP = EY + 0.34                        # the top of the box
BOT = EY - 0.06                        # the bottom of the box, down through the plate
HX, HZ = 0.15, 0.1                     # half-width across the vehicle, half-depth front to back
mesh("exhaust", xf(rbox(HX, (TOP - BOT) / 2, HZ, 0.1, 10, 6), (EX, (TOP + BOT) / 2, EZ)), "steel", CH, 0.03)
mesh("exhaustFlange", xf(rbox(HX + 0.05, 0.035, HZ + 0.05, 0.15, 10, 4), (EX, EY + 0.02, EZ)), "dark", CH, 0.02)
mesh("exhaustBand", xf(rbox(HX + 0.015, 0.025, HZ + 0.015, 0.15, 10, 4), (EX, EY + 0.17, EZ)), "dark", CH, 0)
mesh("exhaustLip", xf(rbox(HX + 0.03, 0.03, HZ + 0.03, 0.15, 10, 4), (EX, TOP - 0.01, EZ)), "dark", CH, 0.02)
mesh("exhaustGlow", xf(rbox(HX + 0.005, 0.014, HZ + 0.005, 0.2, 10, 4), (EX, TOP + 0.03, EZ)), "hot", CH, 0)
mesh("exhaustMouth", xf(rbox(HX - 0.05, 0.02, HZ - 0.04, 0.2, 8, 4), (EX, TOP + 0.04, EZ)), "dark", CH, 0)
pivot("apc_exhaust", (EX, TOP + 0.06, EZ), CH, role="exhaust")  # (an empty at the mouth: the game puffs its smoke from here)
for i, x in enumerate((-0.75, 0.0)):
    mesh(f"can{i}", xf(rbox(0.2, 0.26, 0.11, 0.2), (x, 2.5, -2.62), (0, 0, 0.05 * (1 - 2 * i))), "olive", CH, 0.03)
# antennas on the rear deck: each whip is its own pivot at its base (role "antenna") so the game can lay it
# back with speed; the stub it stands in stays on the hull
for sx, lean in ((-1, -0.12), (1, 0.12)):
    A = pivot(f"antenna{sx}", (sx * 1.15, 2.26, -2.45), CH, role="antenna")
    mesh(f"ant{sx}", tube([(0, 0, 0), (lean, 1.85, -0.25)], [0.035, 0.012], 5), "dark", A, 0)
    mesh(f"antBase{sx}", xf(lathe([(0.1, 0), (0.07, 0.12)], 8), (sx * 1.15, 2.24, -2.45)), "steel", CH, 0.01)

# the underbody: a solid block from the hull's belly down to the axle line, so the axles run out of it to
# the wheels instead of hanging in the air, with a differential housing on each axle
mesh("underbody", xf(rbox(1.3, 0.5, 2.65, 0.18, 16, 6), (0, 0.93, 0.0)), "dark", ROOT, 0.05)
for i, z in enumerate((2.15, 0.75, -0.75, -2.15)):
    mesh(f"axle{i}", beam((-1.72, 0.62, z), (1.72, 0.62, z), 0.09, 8), "dark", ROOT, 0)
    mesh(f"diff{i}", xf(superquad(0.26, 0.26, 0.26, 1, 1, 10, 6), (0, 0.62, z)), "steel", ROOT, 0.02)

# ---- the turret: a low angular cap on the roof, a cupola, smoke launchers and a bustle ----
T = pivot("apc_turret", (0, 2.22, 0.55), CH, role="turret")
mesh("turRing", xf(lathe([(0.98, 0), (0.98, 0.1), (0.9, 0.14)], 20), (0, 0, 0)), "steel", T, 0.03)
TUR = [
    dict(z=-0.95, w=0.62, t=0.19, b=0.19, yc=0.34, eT=3.0, eB=3.0),
    dict(z=-0.35, w=0.86, t=0.28, b=0.24, yc=0.36, eT=3.0, eB=3.0),
    dict(z=0.45, w=0.8, t=0.22, b=0.24, yc=0.36, eT=3.0, eB=3.0),
    dict(z=1.0, w=0.5, t=0.14, b=0.18, yc=0.34, eT=3.0, eB=3.0),
]
mesh("turBody", loft(TUR, 24), "body", T, 0.06)
mesh("turBustle", xf(rbox(0.46, 0.2, 0.3, 0.2), (0, 0.38, -1.05)), "steel", T, 0.04)
for sx in (-1, 1):
    mesh(f"turStripe{sx}", xf(rbox(0.025, 0.06, 0.62, 0.3, 6, 4), (sx * 0.87, 0.39, -0.1)), "stripe", T, 0)
    # three smoke grenade launchers a side, fanned outward
    for k in range(3):
        mesh(f"smoke{sx}_{k}", beam((sx * 0.82, 0.5, -0.1 + k * 0.17), (sx * (0.95 + 0.04 * k), 0.58, -0.1 + k * 0.17), 0.045, 6), "dark", T, 0.01)
# the commander's cupola with a vision ring, and a searchlight
mesh("cupola", xf(lathe([(0.24, 0), (0.24, 0.14), (0.2, 0.2), (0, 0.2)], 14), (0.32, 0.55, -0.32)), "steel", T, 0.03)
mesh("cupolaRing", xf(lathe([(0.245, 0.06), (0.245, 0.11)], 14), (0.32, 0.55, -0.32)), "glass", T, 0)
mesh("cupolaGun", beam((0.32, 0.8, -0.32), (0.32, 0.86, 0.22), 0.025, 5), "dark", T, 0)
mesh("light", xf(lathe([(0.0, 0), (0.1, 0.0), (0.12, 0.1), (0.0, 0.1)], 10), (-0.45, 0.6, 0.15), (math.pi / 2, 0, 0)), "lamp", T, 0.02)
mesh("lightBase", xf(rbox(0.07, 0.07, 0.07, 0.3, 6, 4), (-0.45, 0.58, 0.05)), "dark", T, 0.01)
mesh("sight", xf(rbox(0.13, 0.09, 0.1, 0.2, 8, 4), (-0.28, 0.62, 0.62)), "glass", T, 0.02)

# ---- the barrel group: mantlet, 30 mm cannon with a bore evacuator and brake, a coaxial gun ----
B = pivot("apc_barrel", (0, 0.4, 0.95), T, role="barrel")
mesh("mantlet", xf(rbox(0.36, 0.26, 0.2, 0.2, 12, 6), (0, 0, 0.1)), "steel", B, 0.04)
mesh("cannon", tube([(0, 0, 0.1), (0, 0, 2.25)], [0.095, 0.085], 10), "dark", B, 0.03)
mesh("evac", xf(lathe([(0.085, -0.28), (0.14, -0.2), (0.14, 0.2), (0.085, 0.28)], 12), (0, 0, 1.15), (math.pi / 2, 0, 0)), "steel", B, 0.03)
mesh("brake", xf(rbox(0.12, 0.12, 0.11, 0.2, 10, 6), (0, 0, 2.3)), "steel", B, 0.03)
mesh("brakeSlot", xf(rbox(0.122, 0.035, 0.025, 0.3, 6, 4), (0, 0, 2.3)), "dark", B, 0)
mesh("coax", beam((0.3, -0.06, 0.2), (0.3, -0.06, 1.15), 0.045, 6), "dark", B, 0.02)
mesh("coaxJacket", xf(lathe([(0.07, 0), (0.07, 0.4)], 8), (0.3, -0.06, 0.25), (math.pi / 2, 0, 0)), "steel", B, 0.02)
mesh("feed", xf(rbox(0.1, 0.11, 0.2, 0.2), (0.33, 0.12, 0.05)), "steel", B, 0.02)
M = pivot("apc_muzzle", (0, 0, 2.4), B, role="muzzle")

# ---- wheels: eight, four axles; chunky tyres, tread blocks, hubs with bolts ----
WZ = (2.15, 0.75, -0.75, -2.15)
for i, (sx, sz) in enumerate([(sx, z) for z in WZ for sx in (-1, 1)]):
    W = pivot(f"wheel{i}", (sx * 1.72, 0.62, sz), ROOT, role="wheel")
    tyre = lathe([(0.3, -0.27), (0.55, -0.27), (0.62, -0.19), (0.62, 0.19), (0.55, 0.27), (0.3, 0.27)], 18)
    mesh(f"tyre{i}", xf(tyre, r=(0, 0, math.pi / 2)), "tire", W, 0.05)
    for k in range(12):
        a = k * 2 * math.pi / 12
        mesh(f"tread{i}_{k}", xf(rbox(0.25, 0.045, 0.08, 0.3, 6, 4), (0, math.cos(a) * 0.63, math.sin(a) * 0.63), (a, 0, 0)), "tire", W, 0)
    mesh(f"hub{i}", xf(lathe([(0, 0), (0.32, 0), (0.3, 0.05), (0.14, 0.1), (0, 0.1)], 10), (sx * 0.28, 0, 0), (0, 0, -sx * math.pi / 2)), "steel", W, 0.02)
    for k in range(6):
        a = k * math.pi / 3
        mesh(f"bolt{i}_{k}", xf(superquad(0.025, 0.025, 0.025, 1, 1, 6, 4), (sx * 0.4, math.cos(a) * 0.2, math.sin(a) * 0.2)), "dark", W, 0)

ROOT["radius"] = 3.2
ROOT["wheelRadius"] = 0.62
print("built", len(C.objects), "objects")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
