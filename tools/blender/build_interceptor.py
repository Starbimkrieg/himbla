# SPACECOM Lunar Interceptor builder for Blender (4.2+ / 5.x).
#
# Builds the Interceptor from code and exports src/assets/interceptor.glb. In Blender's Python console or
# via MCP:  exec(open(r"<repo>/tools/blender/build_interceptor.py").read())
# or headless, with the bpy module:  MOONRUNNER_REPO=<repo> python3 build_interceptor.py
# To look at it without writing the file:  MOONRUNNER_EXPORT=0
#
# A low, wide pursuit car in SPACECOM cream and yellow: a long wedge hull with a hood scoop and a nose
# splitter, an open cockpit (the runner stays visible) with a raked screen and a roll hoop carrying a
# light bar, wheel fenders with the yellow chevron stripe, a SPACECOM roundel on each flank, a rear wing
# on two pillars, and twin rocket bells at the tail with a flame each.
#
# It replaces the shared military rover (makeRover, style 'military') for the player's vehicle only; the
# patrol cars keep that model. Same frame as the other rovers, so the vehicle code drives it unchanged:
# origin on the ground in the middle, +z forward, wheels at x = +-1.85, z = +-1.8, radius 0.85.
#
# The game reads it in makeInterceptor (src/models.js): 'body' takes the vehicle's color and 'stripe' its
# trim, every other slot is fixed (INTERCEPTOR_TOON / INTERCEPTOR_GLOW there). buildVehicleModel
# (src/vehicles.js) adds no extra seat-back: the model has its own, where the generic one stands.
#
# Pivots (empties, exactly like the APC and war-rig):
#   chassis  everything that isn't a wheel
#   wheel    four, spun about x (the vehicle code spins them with the ground speed / wheelRadius)
#   plume    the two rocket flames, along -z; the game can stretch them with speed
#   antenna  two whips, each pivoting at its base so the game can lay it back with speed
#   flag     an empty at the tip of the flag whip: the game hangs the cloth from here
# Each mesh has ONE material named after a slot. Custom property "ink" = outline thickness in metres.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_interceptor.py")):
            return root
    return r"F:\dev\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "interceptor.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Interceptor export ->", OUT)
COLL = "MoonInterceptor"

# preview colours (SPACECOM cream and yellow): the game swaps in its own materials
SLOT_COLORS = {
    "body": (1.0, 0.96, 0.88), "stripe": (1.0, 0.82, 0.25), "navy": (0.16, 0.23, 0.42), "dark": (0.13, 0.11, 0.2),
    "steel": (0.54, 0.53, 0.63), "tire": (0.11, 0.1, 0.13), "glass": (0.81, 0.94, 1.0), "seat": (0.13, 0.11, 0.2),
    "lamp": (1.0, 0.96, 0.66), "tail": (1.0, 0.16, 0.29), "hot": (1.0, 0.62, 0.11), "red": (1.0, 0.16, 0.29),
    "blue": (0.18, 0.77, 1.0), "white": (0.96, 0.93, 0.89), "plume": (1.0, 0.62, 0.11), "plumeCore": (1.0, 0.95, 0.75),
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


ROOT = pivot("interceptor", (0, 0, 0), None)
CH = pivot("interceptor_chassis", (0, 0, 0), ROOT, role="chassis")

# ---- hull: a long low wedge, widest over the cockpit, tapering to a sharp nose and a narrow tail ----
HULL = [
    dict(z=-3.2, w=0.55, t=0.22, b=0.20, yc=1.30, eT=3.0, eB=3.4),
    dict(z=-2.9, w=0.85, t=0.36, b=0.26, yc=1.30, eT=3.0, eB=3.4),
    dict(z=-1.6, w=1.30, t=0.46, b=0.30, yc=1.25, eT=3.0, eB=3.4),
    dict(z=0.0, w=1.40, t=0.42, b=0.30, yc=1.20, eT=3.0, eB=3.4),
    dict(z=1.4, w=1.30, t=0.30, b=0.26, yc=1.10, eT=3.0, eB=3.4),
    dict(z=2.6, w=0.95, t=0.20, b=0.20, yc=0.98, eT=3.0, eB=3.4),
    dict(z=3.3, w=0.30, t=0.10, b=0.10, yc=0.90, eT=3.0, eB=3.4),
]
mesh("hull", loft(HULL, 36), "body", CH, 0.07)
# the yellow racing stripe down the hood and the tail deck (not over the cockpit)
mesh("spine", keep(loft(grow(HULL, 0.02), 36, False, False), lambda c: abs(c[0]) < 0.2 and c[1] > 1.0 and not (-1.2 < c[2] < 1.0)), "stripe", CH, 0)
# skid plate under the belly, nose splitter, side skirts between the wheels
mesh("skid", xf(rbox(1.15, 0.06, 2.8, 0.2), (0, 0.78, 0.0)), "dark", CH, 0.04)
mesh("splitter", xf(extrude([(2.5, 0.0), (3.55, 0.0), (3.3, 0.07), (2.5, 0.1)], 1.5, "x"), (0, 0.72, 0)), "dark", CH, 0.03)
for sx in (-1, 1):
    mesh(f"skirt{sx}", xf(rbox(0.05, 0.12, 0.8, 0.25), (sx * 1.46, 0.95, 0.0)), "dark", CH, 0.03)
    # the yellow chevron stripe along each flank, and the SPACECOM roundel on it
    mesh(f"flank{sx}", xf(rbox(0.02, 0.06, 1.9, 0.3, 8, 4), (sx * 1.375, 1.1, 0.1)), "stripe", CH, 0)
    rz = -sx * math.pi / 2
    mesh(f"roundel{sx}", xf(lathe([(0, 0), (0.32, 0), (0.32, 0.02), (0, 0.02)], 20), (sx * 1.355, 1.3, -0.35), (0, 0, rz)), "navy", CH, 0.01)
    mesh(f"roundelRing{sx}", xf(torus(0.32, 0.025, 20, 4), (sx * 1.375, 1.3, -0.35), (0, 0, rz)), "stripe", CH, 0)
    mesh(f"roundelStar{sx}", xf(extrude(star(0.2, 0.08), 0.02, "x"), (sx * 1.38, 1.3, -0.35)), "white", CH, 0)

# ---- the hood: a raised scoop with a dark mouth, flush headlamps and nose lights ----
mesh("scoop", xf(extrude([(0.55, 0.0), (1.75, 0.0), (1.55, 0.2), (0.85, 0.34)], 0.62, "x"), (0, 1.3, 0)), "body", CH, 0.05)
mesh("scoopMouth", xf(rbox(0.26, 0.09, 0.03, 0.3, 8, 4), (0, 1.43, 1.74)), "dark", CH, 0)
for sx in (-1, 1):
    mesh(f"lamp{sx}", xf(rbox(0.2, 0.08, 0.05, 0.25, 8, 4), (sx * 0.58, 1.02, 2.78), (0.35, 0, 0)), "lamp", CH, 0.02)
    mesh(f"lampGuard{sx}", xf(rbox(0.24, 0.11, 0.025, 0.2, 8, 4), (sx * 0.58, 1.02, 2.75), (0.35, 0, 0)), "dark", CH, 0)
mesh("noseLight", xf(rbox(0.28, 0.035, 0.04, 0.4, 8, 4), (0, 0.95, 3.22)), "lamp", CH, 0)

# ---- the cockpit: open, so the runner shows. Floor, side rails, a seat, a dash and a raked screen ----
mesh("floor", xf(rbox(0.6, 0.03, 0.95, 0.2), (0, 1.62, -0.15)), "dark", CH, 0.02)
for sx in (-1, 1):
    mesh(f"rail{sx}", xf(rbox(0.06, 0.1, 1.0, 0.3), (sx * 0.66, 1.7, -0.15)), "body", CH, 0.03)
mesh("cushion", xf(rbox(0.4, 0.1, 0.45, 0.3), (0, 1.62, -0.2)), "seat", CH, 0.03)
# (the seat back stands where the generic one does, at the back of the runner)
mesh("seatBack", xf(rbox(0.38, 0.55, 0.09, 0.3), (0, 2.3, -0.62), (-0.18, 0, 0)), "seat", CH, 0.03)
mesh("headrest", xf(rbox(0.22, 0.14, 0.08, 0.4), (0, 2.95, -0.7), (-0.18, 0, 0)), "stripe", CH, 0)
mesh("dash", xf(rbox(0.5, 0.1, 0.2, 0.3), (0, 1.75, 0.82), (0.35, 0, 0)), "dark", CH, 0.02)
mesh("dashGlow", xf(rbox(0.34, 0.02, 0.08, 0.4, 8, 4), (0, 1.85, 0.84), (0.35, 0, 0)), "hot", CH, 0)
SCREEN = [(-0.34, 0.0), (0.34, 0.0), (0.26, 0.8), (-0.26, 0.8)]
mesh("screen", xf(extrude(SCREEN, 0.03, "z"), (0, 1.72, 1.0), (-0.9, 0, 0)), "glass", CH, 0.02)
mesh("screenFrame", xf(extrude([(-0.38, -0.04), (0.38, -0.04), (0.3, 0.0), (-0.3, 0.0)], 0.05, "z"), (0, 1.72, 1.0), (-0.9, 0, 0)), "stripe", CH, 0)

# ---- the roll hoop behind the runner, a light bar across it, and the whip antennas ----
HOOP = [(-0.62, 1.65, -1.0), (-0.55, 2.7, -1.15), (-0.5, 3.15, -1.2), (0.5, 3.15, -1.2), (0.55, 2.7, -1.15), (0.62, 1.65, -1.0)]
mesh("hoop", tube(HOOP, [0.07] * len(HOOP), 8), "steel", CH, 0.03)
mesh("barRed", xf(rbox(0.26, 0.055, 0.08, 0.4, 8, 4), (-0.26, 3.28, -1.2)), "red", CH, 0)
mesh("barBlue", xf(rbox(0.26, 0.055, 0.08, 0.4, 8, 4), (0.26, 3.28, -1.2)), "blue", CH, 0)
for sx, lean in ((-1, -0.1), (1, 0.1)):
    A = pivot(f"antenna{sx}", (sx * 0.95, 1.7, -2.05), CH, role="antenna")
    mesh(f"ant{sx}", tube([(0, 0, 0), (lean, 1.7, -0.2)], [0.03, 0.01], 5), "dark", A, 0)
    mesh(f"antBase{sx}", xf(lathe([(0.09, 0), (0.06, 0.12)], 8), (sx * 0.95, 1.68, -2.05)), "steel", CH, 0.01)
# the flag whip on the tail deck: the pole stays on the hull, the cloth hangs from the empty at its tip
mesh("flagPole", tube([(-0.95, 1.7, -2.6), (-0.95, 3.7, -2.6)], [0.045, 0.03], 5), "dark", CH, 0.02)
pivot("interceptor_flag", (-0.95, 3.7, -2.6), CH, role="flag")

# ---- wheel fenders over each wheel, with the stripe and flared lips front and back ----
for sx in (-1, 1):
    for sz in (-1, 1):
        mesh(f"fender{sx}_{sz}", xf(rbox(0.42, 0.07, 0.92, 0.3, 12, 6), (sx * 1.85, 1.79, sz * 1.8)), "body", CH, 0.05)
        mesh(f"fenderStripe{sx}_{sz}", xf(rbox(0.12, 0.02, 0.8, 0.3, 8, 4), (sx * 1.85, 1.865, sz * 1.8)), "stripe", CH, 0)
        mesh(f"lip{sx}_{sz}", xf(rbox(0.42, 0.05, 0.22, 0.3, 10, 4), (sx * 1.85, 1.62, sz * 2.62), (sz * -0.7, 0, 0)), "body", CH, 0.03)

# ---- the tail: a rear wing on two pillars with end plates, a tail-light bar, twin rocket bells ----
for sx in (-1, 1):
    mesh(f"pillar{sx}", beam((sx * 0.5, 1.55, -2.75), (sx * 0.5, 2.42, -3.0), 0.06, 6), "steel", CH, 0.02)
    mesh(f"endPlate{sx}", xf(rbox(0.03, 0.26, 0.42, 0.3), (sx * 1.27, 2.47, -3.05)), "body", CH, 0.03)
    mesh(f"endStripe{sx}", xf(rbox(0.032, 0.05, 0.38, 0.3, 6, 4), (sx * 1.27, 2.55, -3.05)), "stripe", CH, 0)
mesh("wing", xf(rbox(1.25, 0.035, 0.34, 0.3), (0, 2.5, -3.05)), "body", CH, 0.04)
mesh("wingUnder", xf(rbox(1.22, 0.02, 0.32, 0.3), (0, 2.455, -3.05)), "stripe", CH, 0)
mesh("tailLight", xf(rbox(0.5, 0.05, 0.04, 0.3, 8, 4), (0, 1.5, -3.2)), "tail", CH, 0)
for sx in (-1, 1):
    # a bell widening towards the rear (the lathe's y runs to -z), a hot disc inside, a flame behind
    mesh(f"bell{sx}", xf(lathe([(0.2, 0.0), (0.24, 0.1), (0.32, 0.4), (0.34, 0.5)], 18), (sx * 0.55, 1.22, -2.85), (-math.pi / 2, 0, 0)), "dark", CH, 0.03)
    mesh(f"bellGlow{sx}", xf(lathe([(0, 0), (0.28, 0), (0.28, 0.03), (0, 0.03)], 16), (sx * 0.55, 1.22, -3.1), (-math.pi / 2, 0, 0)), "hot", CH, 0)
    plume(CH, f"plume{sx}", (sx * 0.55, 1.22, -3.38), 0.3, 1.6)

# ---- under the hull: the axles and the arms out to them ----
for i, z in enumerate((1.8, -1.8)):
    mesh(f"axle{i}", beam((-1.85, 0.85, z), (1.85, 0.85, z), 0.08, 8), "dark", ROOT, 0)
    for sx in (-1, 1):
        mesh(f"arm{i}_{sx}", beam((sx * 0.8, 0.98, z), (sx * 1.7, 0.85, z), 0.07, 6), "dark", ROOT, 0.01)

# ---- wheels: four, big and wide, with tread blocks, a yellow hub cap and bolts ----
for i, (sx, sz) in enumerate([(sx, sz) for sz in (1, -1) for sx in (-1, 1)]):
    W = pivot(f"wheel{i}", (sx * 1.85, 0.85, sz * 1.8), ROOT, role="wheel")
    tyre = lathe([(0.36, -0.3), (0.7, -0.3), (0.85, -0.2), (0.85, 0.2), (0.7, 0.3), (0.36, 0.3)], 20)
    mesh(f"tyre{i}", xf(tyre, r=(0, 0, math.pi / 2)), "tire", W, 0.05)
    for k in range(14):
        a = k * 2 * math.pi / 14
        mesh(f"tread{i}_{k}", xf(rbox(0.27, 0.05, 0.1, 0.3, 6, 4), (0, math.cos(a) * 0.86, math.sin(a) * 0.86), (a, 0, 0)), "tire", W, 0)
    mesh(f"hub{i}", xf(lathe([(0, 0), (0.4, 0), (0.38, 0.05), (0.18, 0.12), (0, 0.12)], 12), (sx * 0.3, 0, 0), (0, 0, -sx * math.pi / 2)), "steel", W, 0.02)
    mesh(f"cap{i}", xf(lathe([(0, 0), (0.17, 0), (0.12, 0.07), (0, 0.08)], 10), (sx * 0.4, 0, 0), (0, 0, -sx * math.pi / 2)), "stripe", W, 0)
    for k in range(6):
        a = k * math.pi / 3
        mesh(f"bolt{i}_{k}", xf(superquad(0.03, 0.03, 0.03, 1, 1, 6, 4), (sx * 0.31, math.cos(a) * 0.27, math.sin(a) * 0.27)), "dark", W, 0)

ROOT["radius"] = 3.4
ROOT["wheelRadius"] = 0.85
print("built", len(C.objects), "objects")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
