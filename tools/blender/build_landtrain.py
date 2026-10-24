# Land-train builder for Blender (4.2+ / 5.x): the Moonliner passenger express and the Prospector freight rig.
#
# Builds six units from code and exports src/assets/landtrain.glb. In Blender's Python console or via MCP:
#   exec(open(r"<repo>/tools/blender/build_landtrain.py").read())
# or headless, with the bpy module:  MOONRUNNER_REPO=<repo> python3 build_landtrain.py
#
#   moonliner         streamlined passenger tractor: bullet nose, swept screen, white-wall balloon tyres
#   moonliner_coach   its capsule passenger coach (the only car it pulls)
#   prospector        heavy-haul tractor: dozer blade, roof rack, twin stacks, spare tyre, cleated tyres
#   prospector_tank   cryogenic Helium-3 tanker (H3 branding, gantry walk, valve cabinet)
#   prospector_cargo  corrugated shipping container on a flat deck
#   prospector_blast  armoured explosives magazine container with OSHA / DOT signage
#
# Same conventions as the other vehicles (makeRover in src/models.js, build_apc.py): each unit is its own root, origin on
# the ground in the middle, +z forward, so the traffic code drives it unchanged. Pivots (empties with a `role`):
#   wheel    every wheel, spun about x (tractors 1.2 m radius, trailers 1.0 m)
#   beacon   the tractor's roof light (the game blinks it)
#   bar      a trailer's drawbar, re-aimed each frame from its yoke to the pin of the unit in front; it carries
#   rod      (scaled along z to the gap) and
#   eye      (slid to the rod's end)
#   livery   one per faction per unit (extra `faction`): emblem and name. The game shows the train's and hides the rest.
# Each root carries `radius`, `wheelRadius` and `decks`: standable solid boxes as a flat list of (hx, hy, hz, y, z)
# groups in the unit's frame (rideable roofs and gantries).
# Each mesh has ONE material named after a slot. body, stripe (trim), accent and label (lettering) take the faction's
# colours; the rest are fixed (LT_TOON / LT_GLOW in src/models.js).

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_landtrain.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("TRAIN_OUT") or os.path.join(REPO, "src", "assets", "landtrain.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Land-train export ->", OUT)
COLL = "MoonLandTrain"

# preview colours (the game swaps in its own materials; body/stripe/accent/label show the Kepler livery)
SLOT_COLORS = {
    "body": (1.0, 0.62, 0.11), "stripe": (1.0, 0.96, 0.88), "accent": (0.42, 0.56, 0.23), "label": (0.16, 0.14, 0.25),
    "dark": (0.16, 0.14, 0.25), "steel": (0.33, 0.38, 0.48), "metal": (0.54, 0.53, 0.63), "tire": (0.1, 0.09, 0.14),
    "white": (0.95, 0.93, 0.89), "glass": (0.61, 0.9, 1.0), "window": (1.0, 0.96, 0.65), "lamp": (1.0, 0.96, 0.66),
    "tail": (1.0, 0.16, 0.29), "green": (0.49, 1.0, 0.42), "hot": (1.0, 0.62, 0.11), "hazard": (1.0, 0.82, 0.25),
    "tank": (0.78, 0.84, 0.92), "brand": (0.08, 0.64, 0.72), "redsafe": (0.79, 0.13, 0.18), "orange": (1.0, 0.48, 0.1),
    "blue": (0.11, 0.39, 0.84),
}

# shared geometry and scene helpers, then the lettering / emblem / signage kit
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
PFX = ""   # unit prefix on every object name (Blender names are file-unique)


def M(name, geo, slot, parent, ink=0.04, **kw):
    return mesh(PFX + name, geo, slot, parent, ink, **kw)


def PV(name, pos, parent=None, **props):
    return pivot(PFX + name, pos, parent, **props)


def rb(name, hx, hy, hz, pos, slot, parent, ink=0.04, e=0.12, rot=(0, 0, 0), nu=8, nv=4):
    """A rounded box (half extents); crisp corners by default."""
    return M(name, xf(rbox(hx, hy, hz, e, nu, nv), pos, rot), slot, parent, ink)


def bm(name, a, b, r, slot, parent, ink=0.0, seg=6):
    return M(name, beam(a, b, r, seg), slot, parent, ink)


def unit(name, **props):
    """New unit: root pivot named exactly `name`, and sets the prefix for its objects."""
    global PFX
    PFX = name + "_"
    return pivot(name, (0, 0, 0), None, **props)


def decks(root, boxes):
    root["decks"] = [round(v, 3) for b in boxes for v in b]


def liveries(root, tag):
    """One livery pivot per faction (role livery); the game keeps only the matching one."""
    return {f: PV(f"{tag}_{f}", (0, 0, 0), root, role="livery", faction=f) for f in FACTIONS}


def ident(root, tag, make):
    """Run make(faction, pivot) for every faction, into its livery pivot."""
    piv = liveries(root, tag)
    for f in FACTIONS:
        make(f, piv[f])


def flank_ident(f, piv, side, x, y, z_front, r, ps, tag="id"):
    """Emblem (centred on z_front) with the faction name behind it. The page runs rearward on +x, forward on -x, so the
    emblem leads on both flanks."""
    s = NAMES[f]
    w = text_width(s, ps)
    gap = r * 0.35
    total = 2 * r + gap + w
    if side > 0:
        d = Dec("+x", (x, y, z_front + r))
        cu, tu = r, 2 * r + gap
    else:
        d = Dec("-x", (-x, y, z_front - total + r))
        cu, tu = total - r, 0.0
    emblem(d, f, cu, 0, r)
    d.text(s, tu, -3.5 * ps, ps, "label", 0)
    d.build(f"{PFX}{tag}{'P' if side > 0 else 'S'}_{f}", piv)


def flank_name(f, piv, side, x, y, z_front, ps, tag="nm"):
    """Just the name, its leading edge at z_front."""
    s = NAMES[f]
    w = text_width(s, ps)
    if side > 0:
        d = Dec("+x", (x, y, z_front))
        d.text(s, 0, -3.5 * ps, ps, "label", 0)
    else:
        d = Dec("-x", (-x, y, z_front - w))
        d.text(s, 0, -3.5 * ps, ps, "label", 0)
    d.build(f"{PFX}{tag}{'P' if side > 0 else 'S'}_{f}", piv)


# ---------------- parts shared by the units ----------------
def arch(parent, name, sx, x, z, R, w, slot="body"):
    """Wheel arch: upper half of a thick ring round the tyre."""
    prof = [(R + 0.05, -w / 2), (R + 0.2, -w / 2 + 0.04), (R + 0.2, w / 2 - 0.04), (R + 0.05, w / 2), (R + 0.05, -w / 2)]
    geo = keep(xf(lathe(prof, 22), r=(0, 0, PI / 2)), lambda c: c[1] > -0.12)
    M(name, xf(geo, (sx * x, R, z)), slot, parent, 0.05)


def wheel_balloon(parent, name, sx, x, z, R, W):
    """Moonliner balloon tyre: white wall, dished hub. Pivot at the axle, role wheel."""
    P = PV(name, (sx * x, R, z), parent, role="wheel")
    h = W / 2
    tyre = lathe([(R * 0.5, -h), (R * 0.84, -h), (R * 0.97, -h * 0.7), (R, -h * 0.3), (R, h * 0.3), (R * 0.97, h * 0.7), (R * 0.84, h), (R * 0.5, h)], 18)
    M(name + "_tyre", xf(tyre, r=(0, 0, PI / 2)), "tire", P, 0.05)
    for s2 in (-1, 1):
        M(f"{name}_ww{s2}", xf(lathe([(R * 0.66, 0), (R * 0.76, 0)], 18), (s2 * (h + 0.004), 0, 0), (0, 0, PI / 2)), "white", P, 0)
    hub = lathe([(0, 0), (R * 0.5, 0), (R * 0.46, 0.05), (R * 0.28, R * 0.13), (R * 0.1, R * 0.15), (0, R * 0.15)], 12)
    M(name + "_hub", xf(hub, (sx * (h - 0.02), 0, 0), (0, 0, -sx * PI / 2)), "metal", P, 0.02)
    for k in range(4):
        a = k * PI / 2 + PI / 4
        bm(f"{name}_lug{k}", (sx * (h + R * 0.1), math.cos(a) * R * 0.3, math.sin(a) * R * 0.3), (sx * (h + R * 0.14), math.cos(a) * R * 0.3, math.sin(a) * R * 0.3), 0.04, "dark", P, 0, 5)
    return P


def wheel_cleat(parent, name, sx, x, z, R, W):
    """Prospector cleated tyre: gear-shaped tread ring on a rounded carcass, deep-dish hub, hazard ring, lug nuts.
    Pivot at the axle, role wheel."""
    P = PV(name, (sx * x, R, z), parent, role="wheel")
    h = W / 2
    carcass = lathe([(R * 0.52, -h), (R * 0.86, -h), (R * 0.95, -h * 0.82), (R * 0.95, h * 0.82), (R * 0.86, h), (R * 0.52, h)], 18)
    M(name + "_tyre", xf(carcass, r=(0, 0, PI / 2)), "tire", P, 0.05)
    n = 14
    outline = []
    for k in range(n):
        for f, rr in ((0.0, 0.93), (0.22, 1.0), (0.62, 1.0), (0.84, 0.93)):
            a = (k + f) * 2 * PI / n
            outline.append((math.sin(a) * R * rr, math.cos(a) * R * rr))   # (z, y)
    M(name + "_tread", extrude(outline, W * 0.96, "x"), "tire", P, 0.03)
    hub = lathe([(0, 0), (R * 0.54, 0), (R * 0.5, 0.05), (R * 0.36, R * 0.18), (R * 0.12, R * 0.2), (0, R * 0.2)], 12)
    M(name + "_hub", xf(hub, (sx * (h - 0.03), 0, 0), (0, 0, -sx * PI / 2)), "steel", P, 0.02)
    M(name + "_ring", xf(torus(R * 0.36, R * 0.045, 16, 3), (sx * (h + R * 0.12), 0, 0), (0, 0, PI / 2)), "hazard", P, 0)
    for k in range(6):
        a = k * PI / 3
        bm(f"{name}_nut{k}", (sx * (h + R * 0.12), math.cos(a) * R * 0.27, math.sin(a) * R * 0.27), (sx * (h + R * 0.16), math.cos(a) * R * 0.27, math.sin(a) * R * 0.27), 0.05, "metal", P, 0.01, 5)
    return P


def drawbar(R):
    """Trailer yoke and the drawbar pivot the game re-aims each frame (bar > rod, eye)."""
    rb("yoke", 0.6, 0.25, 0.3, (0, 1.15, 4.05), "dark", R, 0.03, 0.12)
    bar = PV("bar", (0, 1.4, 4.3), R, role="bar")
    rod = PV("rod", (0, 0, 0), bar, role="rod")
    M("rodMesh", xf(rbox(0.17, 0.17, 0.5, 0.15, 10, 5), (0, 0, 0.5)), "dark", rod, 0.03)
    eye = PV("eye", (0, 0, 1.0), bar, role="eye")
    M("eyeMesh", xf(torus(0.23, 0.09, 14, 5), r=(0, 0, PI / 2)), "metal", eye, 0)
    rb("hitch", 0.5, 0.26, 0.25, (0, 1.1, -4.2), "dark", R, 0.03, 0.12)
    M("pin", xf(lathe([(0.16, 0), (0.16, 0.5), (0.1, 0.55)], 8), (0, 0.95, -4.3)), "metal", R, 0.02)


# =====================================================================================================
# MOONLINER TRACTOR  (9.3 m long, 3.9 wide over the body, a flat rideable roof at 4.8)
# =====================================================================================================
T = unit("moonliner")
TB = [
    dict(z=-4.45, w=1.35, t=0.9, b=0.9, yc=3.0, eT=3.2, eB=3.2),
    dict(z=-4.1, w=1.78, t=1.4, b=1.35, yc=3.15, eT=3.8, eB=3.2),
    dict(z=-3.6, w=1.95, t=1.55, b=1.5, yc=3.25, eT=4.4, eB=3.2),
    dict(z=2.0, w=1.95, t=1.55, b=1.5, yc=3.25, eT=4.4, eB=3.2),
    dict(z=3.0, w=1.9, t=1.0, b=1.45, yc=3.0, eT=4.0, eB=3.2),
    dict(z=3.9, w=1.65, t=0.65, b=1.1, yc=2.6, eT=3.4, eB=3.0),
    dict(z=4.5, w=1.2, t=0.45, b=0.8, yc=2.3, eT=3.0, eB=3.0),
    dict(z=4.85, w=0.7, t=0.3, b=0.55, yc=2.1, eT=3.0, eB=3.0),
]
M("hull", loft(TB, 26), "body", T, 0.09)
# dark underbody, axles, diffs
rb("chassis", 1.5, 0.42, 3.7, (0, 1.2, -0.2), "dark", T, 0.05, 0.2)
for i, z in enumerate((2.9, 0.0, -2.9)):
    bm(f"axle{i}", (-2.1, 1.2, z), (2.1, 1.2, z), 0.12, "dark", T, 0, 8)
    M(f"diff{i}", xf(superquad(0.3, 0.3, 0.3, 1, 1, 10, 6), (0, 1.2, z)), "steel", T, 0.02)
# beltline: trim swoosh along each flank sweeping round the nose, accent pin-line under it
for sx in (-1, 1):
    rb(f"belt{sx}", 0.03, 0.11, 3.9, (sx * 1.965, 2.75, -0.45), "stripe", T, 0, 0.3)
    rb(f"beltNose{sx}", 0.03, 0.1, 0.62, (sx * 1.78, 2.72, 3.85), "stripe", T, 0, 0.3, (0, -sx * 0.5, 0))
    rb(f"beltLine{sx}", 0.025, 0.035, 3.9, (sx * 1.96, 2.52, -0.45), "accent", T, 0, 0.3)
    # wheel arches, each tied to the body by a thin deck
    for i, z in enumerate((2.9, 0.0, -2.9)):
        arch(T, f"arch{sx}_{i}", sx, 2.15, z, 1.2, 1.2)
        rb(f"archDeck{sx}_{i}", 0.62, 0.07, 1.4, (sx * 2.15, 2.68, z), "body", T, 0.03, 0.3)
# swept windscreen down the nose slope, dark frame, visor
rb("screenFrame", 1.5, 0.03, 1.05, (0, 4.2, 2.8), "dark", T, 0.02, 0.2, (0.67, 0, 0))
rb("screen", 1.4, 0.04, 0.98, (0, 4.23, 2.8), "glass", T, 0, 0.3, (0.67, 0, 0))
rb("visor", 1.6, 0.05, 0.3, (0, 4.93, 1.85), "body", T, 0.04, 0.3, (-0.1, 0, 0))
rb("visorEdge", 1.58, 0.03, 0.04, (0, 4.9, 2.12), "stripe", T, 0, 0.3)
for sx in (-1, 1):
    # side windows in a dark band, stalk mirror, louvres behind the cab
    rb(f"sideBand{sx}", 0.02, 0.42, 1.55, (sx * 1.945, 3.9, 1.1), "dark", T, 0.02, 0.25)
    rb(f"sideWin{sx}", 0.03, 0.36, 1.3, (sx * 1.96, 3.9, 1.15), "glass", T, 0, 0.3)
    rb(f"sideMullion{sx}", 0.035, 0.38, 0.04, (sx * 1.965, 3.9, 1.15), "dark", T, 0, 0.3, nu=6, nv=4)
    bm(f"mirrorArm{sx}", (sx * 1.95, 4.0, 2.15), (sx * 2.3, 4.15, 2.4), 0.04, "dark", T, 0, 5)
    rb(f"mirror{sx}", 0.04, 0.24, 0.14, (sx * 2.34, 4.1, 2.42), "dark", T, 0.02, 0.3)
    rb(f"mirrorGlass{sx}", 0.02, 0.2, 0.1, (sx * 2.38, 4.1, 2.42), "glass", T, 0, 0.3)
    for k in range(5):
        rb(f"vent{sx}_{k}", 0.025, 0.4, 0.04, (sx * 1.965, 3.5, -3.45 + k * 0.34), "dark", T, 0, 0.3, nu=6, nv=4)
# nose: big centre lamp, two low flank lamps, chrome bumper over a dark valance
M("headlamp", xf(lathe([(0, 0), (0.3, 0), (0.28, 0.08), (0, 0.16)], 16), (0, 2.12, 4.8), (PI / 2, 0, 0)), "lamp", T, 0.02)
M("headlampRim", xf(torus(0.3, 0.04, 18, 5), (0, 2.12, 4.8), (PI / 2, 0, 0)), "metal", T, 0.01)
for sx in (-1, 1):
    rb(f"lowLamp{sx}", 0.2, 0.1, 0.05, (sx * 1.0, 2.2, 4.3), "lamp", T, 0.02, 0.3, (0.45, sx * 0.5, 0))
    rb(f"lowLampRim{sx}", 0.25, 0.13, 0.03, (sx * 1.0, 2.2, 4.27), "dark", T, 0, 0.3, (0.45, sx * 0.5, 0))
rb("valance", 1.2, 0.2, 0.55, (0, 1.4, 4.25), "dark", T, 0.04, 0.25)
M("bumper", xf(rbox(1.55, 0.12, 0.2, 0.3, 16, 5), (0, 1.55, 4.72)), "metal", T, 0.05)
for sx in (-1, 1):
    M(f"bumperGuard{sx}", xf(rbox(0.13, 0.2, 0.26, 0.3, 8, 5), (sx * 1.2, 1.55, 4.74)), "dark", T, 0.03)
# roof: air-con pod, horns, centre stripe, antenna, beacon
rb("acPod", 1.0, 0.25, 1.1, (0, 5.0, -2.2), "white", T, 0.05, 0.3)
for k in range(4):
    rb(f"acRib{k}", 0.9, 0.04, 0.03, (0, 5.26, -2.9 + k * 0.45), "dark", T, 0, 0.3)
rb("roofStripe", 0.4, 0.015, 2.1, (0, 4.82, -0.1), "stripe", T, 0, 0.3)
for sx in (-1, 1):
    M(f"horn{sx}", xf(lathe([(0.05, 0), (0.12, 0.2), (0.2, 0.34), (0.0, 0.34)], 10), (sx * 0.7, 4.8, 0.5), (-PI / 2 + 0.2, 0, 0)), "metal", T, 0.02)
M("antenna", tube([(1.45, 4.8, -3.4), (1.45, 6.1, -3.5)], [0.04, 0.015], 5), "dark", T, 0)
B_ = PV("beacon", (0, 4.8, 0.9), T, role="beacon")
M("beaconBase", xf(lathe([(0.24, 0), (0.24, 0.07), (0.15, 0.1), (0, 0.1)], 10), (0, 0, 0)), "dark", B_, 0.02)
M("beaconLamp", xf(superquad(0.19, 0.19, 0.19, 1, 1, 10, 6), (0, 0.18, 0)), "hot", B_, 0.02)
# tail: light bar, hitch plate and pin
rb("tailBar", 1.1, 0.08, 0.04, (0, 3.35, -4.42), "tail", T, 0.02, 0.3)
rb("hitchPlate", 0.5, 0.28, 0.25, (0, 1.2, -4.45), "dark", T, 0.03, 0.2)
M("hitchPin", xf(lathe([(0.16, 0), (0.16, 0.5), (0.1, 0.55)], 8), (0, 1.0, -4.55)), "metal", T, 0.02)
for i, z in enumerate((2.9, 0.0, -2.9)):
    for sx in (-1, 1):
        wheel_balloon(T, f"wheel{i}_{sx}", sx, 2.15, z, 1.2, 1.05)
# livery: emblem and name on each flank, between beltline and windows
ident(T, "livery", lambda f, piv: [flank_ident(f, piv, s, 1.955, 3.18, 1.55, 0.25, 0.045) for s in (-1, 1)])
T["radius"] = 4.6
T["wheelRadius"] = 1.2
# solid boxes: roof at 4.8, a step down the windscreen, nose, tail
decks(T, [(1.9, 2.4, 2.8, 2.4, -0.8), (1.85, 2.05, 0.55, 2.05, 2.55), (1.6, 1.5, 0.9, 1.5, 3.95), (1.6, 1.75, 0.45, 1.75, -4.0)])


# =====================================================================================================
# MOONLINER COACH  (8.4 m long, 3.6 wide, a capsule with big rounded windows; door mid-car on the right, -x)
# =====================================================================================================
PX = unit("moonliner_coach")
rb("frame", 1.4, 0.3, 3.9, (0, 1.2, 0), "dark", PX, 0.05, 0.2)
for i, z in enumerate((2.7, -2.7)):
    bm(f"axle{i}", (-1.9, 1.0, z), (1.9, 1.0, z), 0.1, "dark", PX, 0, 8)
    for sx in (-1, 1):
        arch(PX, f"arch{sx}_{i}", sx, 1.95, z, 1.0, 1.1)
        rb(f"archDeck{sx}_{i}", 0.55, 0.06, 1.2, (sx * 1.95, 2.3, z), "body", PX, 0.03, 0.3)
        wheel_balloon(PX, f"wheel{sx}_{i}", sx, 1.95, z, 1.0, 0.9)
drawbar(PX)
PB = [
    dict(z=-4.0, w=1.45, t=1.3, b=1.3, yc=3.0, eT=3.2, eB=3.2),
    dict(z=-3.7, w=1.72, t=1.6, b=1.6, yc=3.05, eT=4.0, eB=3.2),
    dict(z=-3.2, w=1.8, t=1.65, b=1.65, yc=3.05, eT=4.4, eB=3.2),
    dict(z=3.2, w=1.8, t=1.65, b=1.65, yc=3.05, eT=4.4, eB=3.2),
    dict(z=3.7, w=1.72, t=1.6, b=1.6, yc=3.05, eT=4.0, eB=3.2),
    dict(z=4.0, w=1.45, t=1.3, b=1.3, yc=3.0, eT=3.2, eB=3.2),
]
M("body", loft(PB, 24), "body", PX, 0.09)
# windows: four on the left (+x), two beside the door on the right (-x); each flank's front third is a plain panel for
# the faction mark. The door has its own window and a step.
for sx in (-1, 1):
    zs = (-3.0, -1.85, -0.7, 0.45) if sx > 0 else (-3.0, -1.85)
    z0, z1 = (-3.45, 0.95) if sx > 0 else (-3.45, -1.4)
    rb(f"winBand{sx}", 0.02, 0.58, (z1 - z0) / 2, (sx * 1.785, 3.72, (z0 + z1) / 2), "dark", PX, 0.02, 0.25)
    for i, z in enumerate(zs):
        rb(f"win{sx}_{i}", 0.03, 0.46, 0.46, (sx * 1.8, 3.72, z), "window", PX, 0, 0.3)
    rb(f"belt{sx}", 0.03, 0.11, 3.5, (sx * 1.81, 2.62, 0), "stripe", PX, 0, 0.3)
    rb(f"beltLine{sx}", 0.025, 0.035, 3.5, (sx * 1.805, 2.4, 0), "accent", PX, 0, 0.3)
    rb(f"cove{sx}", 0.03, 0.05, 3.4, (sx * 1.8, 4.5, 0), "stripe", PX, 0, 0.3)
rb("door", 0.04, 1.05, 0.58, (-1.8, 2.85, 0), "dark", PX, 0.02, 0.2)
rb("doorWin", 0.05, 0.42, 0.4, (-1.82, 3.4, 0), "window", PX, 0, 0.3)
rb("step", 0.4, 0.06, 0.6, (-1.9, 1.55, 0), "metal", PX, 0.02, 0.25)
bm("doorHandle", (-1.84, 2.7, 0.38), (-1.84, 3.0, 0.38), 0.03, "metal", PX, 0, 5)
# ends: lit window in a dark gangway frame
for sz in (-1, 1):
    rb(f"endFrame{sz}", 0.95, 0.75, 0.03, (0, 3.05, sz * 3.97), "dark", PX, 0.02, 0.25)
    rb(f"endWin{sz}", 0.85, 0.65, 0.03, (0, 3.05, sz * 3.99), "window", PX, 0, 0.3)
# roof: air-con pod, vent domes, lit route board, centre stripe
rb("ac", 0.85, 0.22, 1.0, (0, 4.8, -1.9), "white", PX, 0.05, 0.3)
for k in range(3):
    rb(f"acRib{k}", 0.75, 0.04, 0.03, (0, 5.02, -2.4 + k * 0.5), "dark", PX, 0, 0.3)
for k, z in enumerate((0.4, 1.4)):
    M(f"dome{k}", xf(lathe([(0.3, 0), (0.3, 0.06), (0.22, 0.2), (0, 0.24)], 12), (0, 4.68, z)), "metal", PX, 0.03)
rb("sign", 0.55, 0.17, 0.05, (0, 4.95, 3.3), "window", PX, 0.03, 0.3)
rb("signBack", 0.6, 0.2, 0.04, (0, 4.95, 3.25), "dark", PX, 0.02, 0.3)
rb("roofStripe", 0.32, 0.015, 3.0, (0, 4.72, 1.0), "stripe", PX, 0, 0.3)
rb("tail", 0.8, 0.07, 0.04, (0, 2.0, -4.0), "tail", PX, 0.02, 0.3)


def coach_panel(f, piv):
    """Emblem over the faction name, centred on each flank's front panel."""
    s = NAMES[f]
    ps = 0.04
    for side, face in ((1, "+x"), (-1, "-x")):
        d = Dec(face, (side * 1.8, 0, 2.25))
        emblem(d, f, 0, 3.88, 0.33)
        d.text(s, 0, 3.2, ps, "label", 0, "c")
        d.build(f"{PFX}panel{'P' if side > 0 else 'S'}_{f}", piv)


ident(PX, "livery", coach_panel)
PX["radius"] = 4.4
PX["wheelRadius"] = 1.0
decks(PX, [(1.75, 2.35, 3.5, 2.35, 0)])


# page helpers for flank decals: Dec("+x") runs toward the rear, Dec("-x") toward the front
def U(side, z, z0=0.0):
    """Page coordinate of world z on a flank (origin at z0)."""
    return -(z - z0) if side > 0 else (z - z0)


def urange(side, za, zb, z0=0.0):
    a, b = U(side, za, z0), U(side, zb, z0)
    return min(a, b), max(a, b)


def chevrons(parent, name, x, y, z, w, h, n, d=0.03, slant=0.65, slot="hazard"):
    """Diagonal hazard stripes of tilted boxes across a +z-facing panel (the dozer blade)."""
    for i in range(n):
        t = (i + 0.5) / n - 0.5
        rb(f"{name}{i}", w / n * 0.32, h * 0.6, d, (x + t * w, y, z), slot, parent, 0, 0.3, (0, 0, slant), 6, 4)


def rail_roof(parent, name, hx, hz, y, h=0.4, posts=6):
    """Low guard rails (two rails, posts) round a roof walk."""
    for sx in (-1, 1):
        bm(f"{name}_r1{sx}", (sx * hx, y + h, -hz), (sx * hx, y + h, hz), 0.035, "metal", parent, 0.01)
        bm(f"{name}_r2{sx}", (sx * hx, y + h * 0.5, -hz), (sx * hx, y + h * 0.5, hz), 0.03, "metal", parent)
        for k in range(posts):
            z = -hz + k * (2 * hz / (posts - 1))
            bm(f"{name}_p{sx}_{k}", (sx * hx, y, z), (sx * hx, y + h, z), 0.035, "metal", parent, 0.01)
    for sz in (-1, 1):
        bm(f"{name}_e{sz}", (-hx, y + h, sz * hz), (hx, y + h, sz * hz), 0.035, "metal", parent, 0.01)


def fender_box(parent, name, sx, x, z, y, hz, w=0.6, r=1.2):
    """Boxy mud-guard over a wheel of radius r: flat top, drop lips, hazard edge."""
    rb(name, w, 0.1, hz, (sx * x, y, z), "body", parent, 0.04, 0.12)
    for sz in (-1, 1):
        rb(f"{name}_lip{sz}", w, r * 0.3, 0.07, (sx * x, y - 0.35, z + sz * hz), "body", parent, 0.03, 0.12)
    rb(f"{name}_edge", 0.04, 0.07, hz * 0.97, (sx * (x + w * 0.96), y + 0.02, z), "hazard", parent, 0, 0.2, nu=6, nv=4)


def prospector_base(R):
    """Trailer base: ladder frame, boxy fenders, mud flaps, cleated wheels, hitch and drawbar."""
    for sx in (-1, 1):
        rb(f"rail{sx}", 0.14, 0.26, 4.0, (sx * 1.1, 1.3, 0), "dark", R, 0.04, 0.1)
    for k, z in enumerate((3.4, 1.2, -1.2, -3.4)):
        rb(f"cross{k}", 1.2, 0.12, 0.13, (0, 1.28, z), "dark", R, 0.03, 0.1)
    for i, z in enumerate((2.7, -2.7)):
        bm(f"axle{i}", (-1.9, 1.0, z), (1.9, 1.0, z), 0.1, "dark", R, 0, 8)
        for sx in (-1, 1):
            fender_box(R, f"fender{sx}_{i}", sx, 1.95, z, 2.3, 1.2, 0.55, 1.0)
            wheel_cleat(R, f"wheel{sx}_{i}", sx, 1.95, z, 1.0, 0.9)
    for sx in (-1, 1):
        rb(f"flap{sx}", 0.45, 0.4, 0.03, (sx * 1.95, 0.85, -3.95), "dark", R, 0.02, 0.15)
        rb(f"flapEdge{sx}", 0.45, 0.05, 0.035, (sx * 1.95, 0.55, -3.95), "hazard", R, 0, 0.2, nu=6, nv=4)
    drawbar(R)
    R["radius"] = 4.4
    R["wheelRadius"] = 1.0


# =====================================================================================================
# PROSPECTOR TRACTOR  (9.7 m long with the blade, 3.9 wide, a cab-over with a roof rack)
# =====================================================================================================
T = unit("prospector")
# ladder chassis: rails, cross-members, axles, diffs, leaf springs
for sx in (-1, 1):
    rb(f"rail{sx}", 0.17, 0.3, 4.35, (sx * 1.2, 1.35, -0.1), "dark", T, 0.04, 0.1)
for k, z in enumerate((3.9, 1.7, -1.5, -3.6)):
    rb(f"cross{k}", 1.3, 0.14, 0.15, (0, 1.3, z), "dark", T, 0.03, 0.1)
for i, z in enumerate((2.9, 0.0, -2.9)):
    bm(f"axle{i}", (-2.1, 1.2, z), (2.1, 1.2, z), 0.13, "dark", T, 0, 8)
    M(f"diff{i}", xf(superquad(0.34, 0.34, 0.34, 1, 1, 10, 6), (0, 1.2, z)), "steel", T, 0.02)
    for sx in (-1, 1):
        rb(f"leaf{i}_{sx}", 0.1, 0.07, 0.85, (sx * 1.2, 1.62, z), "steel", T, 0.02, 0.4)
# cab-over: swept visor, two-pane screen, big grille, square lamps
rb("cab", 1.95, 1.43, 1.6, (0, 3.17, 2.6), "body", T, 0.09, 0.1)
rb("cabCorner", 1.98, 0.22, 0.25, (0, 4.5, 4.12), "body", T, 0.06, 0.2, (0.35, 0, 0))
rb("visor", 1.99, 0.07, 0.42, (0, 4.78, 4.12), "body", T, 0.05, 0.2, (-0.06, 0, 0))
rb("visorEdge", 1.97, 0.05, 0.05, (0, 4.7, 4.5), "hazard", T, 0, 0.3)
rb("screenFrame", 1.78, 0.56, 0.03, (0, 3.85, 4.21), "dark", T, 0.02, 0.15)
for sx in (-1, 1):
    rb(f"screen{sx}", 0.82, 0.48, 0.04, (sx * 0.87, 3.85, 4.23), "glass", T, 0, 0.2)
    bm(f"wiper{sx}", (sx * 0.9, 3.4, 4.26), (sx * 0.25, 3.75, 4.26), 0.025, "dark", T, 0, 5)
rb("screenPillar", 0.05, 0.56, 0.05, (0, 3.85, 4.25), "dark", T, 0.01, 0.2)
rb("grille", 1.35, 0.7, 0.04, (0, 2.45, 4.21), "dark", T, 0.03, 0.1)
for k in range(7):
    rb(f"grilleBar{k}", 1.25, 0.03, 0.04, (0, 1.9 + k * 0.18, 4.27), "metal", T, 0, 0.3)
rb("badge", 0.3, 0.1, 0.03, (0, 3.2, 4.23), "hazard", T, 0.01, 0.2)
for sx in (-1, 1):
    rb(f"lampCage{sx}", 0.3, 0.23, 0.05, (sx * 1.55, 2.15, 4.22), "dark", T, 0.02, 0.1)
    rb(f"lamp{sx}", 0.24, 0.17, 0.05, (sx * 1.55, 2.15, 4.26), "lamp", T, 0, 0.2)
    rb(f"turn{sx}", 0.2, 0.1, 0.04, (sx * 1.55, 2.7, 4.24), "hot", T, 0.01, 0.2)
    # door: window, seams, trim band, grab rail; truck mirrors on arms
    rb(f"sideWinFrame{sx}", 0.02, 0.56, 0.7, (sx * 1.955, 3.7, 2.2), "dark", T, 0.02, 0.1)
    rb(f"sideWin{sx}", 0.03, 0.46, 0.6, (sx * 1.97, 3.7, 2.2), "glass", T, 0, 0.2)
    rb(f"doorSeam{sx}", 0.02, 1.2, 0.02, (sx * 1.96, 3.1, 1.15), "dark", T, 0, 0.3, nu=6, nv=4)
    rb(f"doorSeamB{sx}", 0.02, 1.2, 0.02, (sx * 1.96, 3.1, 3.5), "dark", T, 0, 0.3, nu=6, nv=4)
    rb(f"cabBand{sx}", 0.03, 0.07, 1.6, (sx * 1.955, 1.95, 2.6), "accent", T, 0, 0.2)
    bm(f"grab{sx}", (sx * 2.04, 2.3, 1.3), (sx * 2.04, 3.9, 1.3), 0.04, "metal", T, 0.01)
    bm(f"mirrorArm{sx}", (sx * 1.95, 4.1, 3.7), (sx * 2.5, 4.2, 3.9), 0.045, "dark", T, 0, 5)
    rb(f"mirror{sx}", 0.05, 0.4, 0.2, (sx * 2.55, 3.95, 3.92), "dark", T, 0.03, 0.2)
    rb(f"mirrorGlass{sx}", 0.02, 0.34, 0.15, (sx * 2.6, 3.95, 3.92), "glass", T, 0, 0.3)
# dozer blade on two push arms, hazard chevrons, skid plate under the nose
rb("blade", 2.05, 0.62, 0.11, (0, 1.55, 4.78), "steel", T, 0.07, 0.1, (-0.22, 0, 0))
chevrons(T, "bladeChev", 0, 1.57, 4.92, 3.8, 1.0, 8)
rb("bladeTop", 2.1, 0.07, 0.2, (0, 2.14, 4.7), "dark", T, 0.04, 0.2)
for sx in (-1, 1):
    bm(f"pushArm{sx}", (sx * 1.3, 1.5, 4.7), (sx * 1.3, 1.45, 3.4), 0.13, "dark", T, 0.03, 8)
    rb(f"bladeEnd{sx}", 0.1, 0.62, 0.34, (sx * 2.05, 1.55, 4.7), "steel", T, 0.05, 0.15, (-0.22, 0, 0))
rb("skid", 1.6, 0.08, 0.5, (0, 0.95, 4.2), "dark", T, 0.03, 0.2)
# engine box behind the cab: louvres, trim band, hazard skirt, roof hatch
rb("box", 1.8, 1.4, 1.55, (0, 3.1, -0.78), "body", T, 0.09, 0.1)
for sx in (-1, 1):
    for k in range(6):
        rb(f"louvre{sx}_{k}", 0.025, 0.55, 0.05, (sx * 1.815, 3.1, -1.9 + k * 0.28), "dark", T, 0, 0.3, nu=6, nv=4)
    rb(f"boxBand{sx}", 0.03, 0.07, 1.55, (sx * 1.815, 2.0, -0.78), "accent", T, 0, 0.2)
    d = side_dec(sx, 1.8, 0.0, 0.0)
    u0, u1 = urange(sx, -2.25, 0.7)
    d.hazard(u0, 1.72, u1, 1.94, "dark", "hazard", 0, 0.14)
    d.build(f"{PFX}boxHaz{sx}", T)
rb("hatch", 0.9, 0.05, 0.7, (0, 4.52, -0.9), "steel", T, 0.03, 0.2)
# roof rack: low rails, four floodlights, a searchlight
for sx in (-1, 1):
    bm(f"rackRail{sx}", (sx * 1.85, 4.85, 4.0), (sx * 1.85, 4.85, 1.2), 0.04, "metal", T, 0.01)
    for z in (1.2, 2.6, 4.0):
        bm(f"rackPost{sx}_{z}", (sx * 1.85, 4.6, z), (sx * 1.85, 4.9, z), 0.04, "metal", T, 0.01)
for k in range(4):
    x = -1.35 + k * 0.9
    M(f"flood{k}", xf(lathe([(0.0, 0), (0.14, 0), (0.17, 0.12), (0.0, 0.12)], 10), (x, 4.9, 4.22), (PI / 2 - 0.15, 0, 0)), "lamp", T, 0.02)
    rb(f"floodBack{k}", 0.19, 0.19, 0.11, (x, 4.9, 4.12), "dark", T, 0.02, 0.2)
bm("searchlightStem", (0, 4.8, 3.3), (0, 5.15, 3.3), 0.05, "dark", T)
M("searchlight", xf(lathe([(0.0, 0), (0.2, 0), (0.24, 0.22), (0.0, 0.22)], 12), (0, 5.2, 3.4), (PI / 2 - 0.2, 0, 0)), "lamp", T, 0.03)
M("antenna1", tube([(-1.5, 4.7, -1.8), (-1.5, 6.4, -1.9)], [0.04, 0.012], 5), "dark", T, 0)
M("antenna2", tube([(1.5, 4.7, -2.1), (1.5, 6.0, -2.15)], [0.04, 0.012], 5), "dark", T, 0)
B_ = PV("beacon", (0, 4.78, 0.0), T, role="beacon")
M("beaconBase", xf(lathe([(0.26, 0), (0.26, 0.08), (0.16, 0.12), (0, 0.12)], 10), (0, 0, 0)), "dark", B_, 0.02)
M("beaconLamp", xf(superquad(0.2, 0.2, 0.2, 1, 1, 10, 6), (0, 0.2, 0)), "hot", B_, 0.02)
# twin stacks with heat shields and rain caps
for sx in (-1, 1):
    M(f"stack{sx}", tube([(sx * 1.7, 2.3, 0.65), (sx * 1.7, 5.9, 0.65)], [0.2, 0.2], 10), "steel", T, 0.03)
    M(f"stackCap{sx}", xf(lathe([(0.0, 0), (0.26, 0), (0.26, 0.06), (0.0, 0.1)], 10), (sx * 1.7, 5.9, 0.65)), "dark", T, 0.02)
    for k, y in enumerate((2.9, 3.6, 4.3)):
        M(f"stackBand{sx}_{k}", xf(torus(0.22, 0.04, 12, 4), (sx * 1.7, y, 0.65)), "metal", T, 0.01)
    rb(f"stackShield{sx}", 0.04, 0.8, 0.28, (sx * 1.93, 3.4, 0.65), "metal", T, 0.02, 0.2)
# rear deck: strapped tank, upright spare tyre, tie-down rails
rb("deck", 1.75, 0.09, 1.1, (0, 2.5, -3.3), "dark", T, 0.04, 0.1)
M("deckTank", xf(lathe([(0, -1.5), (0.45, -1.45), (0.52, -1.2), (0.52, 1.2), (0.45, 1.45), (0, 1.5)], 18), (0, 3.1, -3.05), (0, 0, PI / 2)), "body", T, 0.06)
for z in (-3.6, -2.5):
    M(f"strap{z}", xf(torus(0.54, 0.04, 16, 4), (0, 3.1, z), (0, 0, PI / 2)), "metal", T, 0.01)
M("spare", xf(lathe([(0.42, -0.34), (0.8, -0.34), (0.95, -0.2), (0.95, 0.2), (0.8, 0.34), (0.42, 0.34)], 20), (0, 3.55, -4.3), (PI / 2, 0, 0)), "tire", T, 0.05)
M("spareHub", xf(lathe([(0, 0), (0.42, 0), (0.38, 0.06), (0, 0.08)], 12), (0, 3.55, -4.67), (PI / 2, 0, 0)), "steel", T, 0.02)
for sx in (-1, 1):
    bm(f"deckRail{sx}", (sx * 1.7, 2.6, -2.35), (sx * 1.7, 2.6, -4.4), 0.04, "metal", T, 0.01)
    for z in (-2.5, -3.4, -4.3):
        bm(f"deckPost{sx}_{z}", (sx * 1.7, 2.55, z), (sx * 1.7, 3.0, z), 0.04, "metal", T, 0.01)
rb("tailBar", 1.3, 0.1, 0.04, (0, 2.1, -4.47), "tail", T, 0.02, 0.2)
rb("hitchPlate", 0.55, 0.3, 0.25, (0, 1.2, -4.4), "dark", T, 0.03, 0.12)
M("hitchPin", xf(lathe([(0.17, 0), (0.17, 0.5), (0.11, 0.55)], 8), (0, 1.0, -4.55)), "metal", T, 0.02)
# fenders, mud flaps, wheels
for sx in (-1, 1):
    for i, z in enumerate((2.9, 0.0, -2.9)):
        fender_box(T, f"fender{sx}_{i}", sx, 2.15, z, 2.65, 1.45)
    for z in (0.0, -2.9):
        rb(f"flap{sx}_{z}", 0.5, 0.45, 0.03, (sx * 2.15, 0.95, z - 1.5), "dark", T, 0.02, 0.15)
        rb(f"flapEdge{sx}_{z}", 0.5, 0.05, 0.035, (sx * 2.15, 0.6, z - 1.5), "hazard", T, 0, 0.2, nu=6, nv=4)
for i, z in enumerate((2.9, 0.0, -2.9)):
    for sx in (-1, 1):
        wheel_cleat(T, f"wheel{i}_{sx}", sx, 2.15, z, 1.2, 1.05)
# livery: emblem on each cab door, name on the engine box above the louvres
def pt_livery(f, piv):
    for s in (-1, 1):
        d = side_dec(s, 1.955, 2.4, 2.3)
        emblem(d, f, 0, 0, 0.5)
        d.build(f"{PFX}door{'P' if s > 0 else 'S'}_{f}", piv)
        flank_name(f, piv, s, 1.805, 3.98, 0.25, 0.045)


ident(T, "livery", pt_livery)
T["radius"] = 4.8
T["wheelRadius"] = 1.2
# solid boxes: cab, engine box, tank and saddle, spare, deck, blade
decks(T, [(1.95, 2.35, 1.65, 2.35, 2.6), (1.8, 2.25, 1.55, 2.25, -0.78), (1.75, 1.8, 0.55, 1.8, -3.05),
          (1.75, 1.3, 1.1, 1.3, -3.3), (0.95, 2.25, 0.4, 2.25, -4.5), (2.05, 1.1, 0.5, 1.1, 4.75)])


# =====================================================================================================
# PROSPECTOR TANKER: cryogenic Helium-3. Banded pressure vessel on saddles, gantry walk on top, rear valve cabinet,
# H3 branding panel on each flank.
# =====================================================================================================
TK = unit("prospector_tank")
prospector_base(TK)
rb("deck", 1.75, 0.1, 3.95, (0, 1.72, 0), "dark", TK, 0.05, 0.1)
for z in (-2.6, 0.0, 2.6):
    rb(f"saddle{z}", 1.4, 0.55, 0.3, (0, 2.15, z), "dark", TK, 0.04, 0.12)
SHELL = [(0, -3.78), (0.85, -3.72), (1.25, -3.58), (1.45, -3.3), (1.5, -2.9), (1.5, 2.9), (1.45, 3.3), (1.25, 3.58), (0.85, 3.72), (0, 3.78)]
M("shell", xf(lathe(SHELL, 22), (0, 3.3, 0), (PI / 2, 0, 0)), "tank", TK, 0.09)
# faction-coloured end domes, accent rings at the joins, grey insulation bands
M("domeF", xf(lathe([(1.512, 2.9), (1.462, 3.3), (1.262, 3.58), (0.862, 3.72), (0, 3.79)], 22), (0, 3.3, 0), (PI / 2, 0, 0)), "body", TK, 0.05)
M("domeR", xf(lathe([(0, -3.79), (0.862, -3.72), (1.262, -3.58), (1.462, -3.3), (1.512, -2.9)], 22), (0, 3.3, 0), (PI / 2, 0, 0)), "body", TK, 0.05)
for z in (-2.9, 2.9):
    M(f"ring{z}", xf(torus(1.52, 0.06, 22, 4), (0, 3.3, z), (PI / 2, 0, 0)), "accent", TK, 0.02)
for z in (-1.8, -0.6, 0.6, 1.8):
    M(f"band{z}", xf(torus(1.52, 0.06, 22, 4), (0, 3.3, z), (PI / 2, 0, 0)), "steel", TK, 0.02)
# gantry walk: grating with low rails, two manways, relief valve vent stack
rb("walk", 0.5, 0.05, 3.1, (0, 4.82, 0), "dark", TK, 0.03, 0.1)
for z in (-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0):
    rb(f"walkBar{z}", 0.46, 0.012, 0.03, (0, 4.875, z), "metal", TK, 0, 0.3, nu=6, nv=4)
rail_roof(TK, "rail", 0.55, 3.0, 4.87, 0.42, 7)
for k, z in enumerate((-1.5, 1.5)):
    M(f"manway{k}", xf(lathe([(0.4, 0), (0.4, 0.1), (0.3, 0.22), (0, 0.26)], 14), (0, 4.9, z)), "metal", TK, 0.03)
    M(f"manwayRing{k}", xf(torus(0.42, 0.045, 14, 4), (0, 4.9, z)), "hazard", TK, 0)
M("vent", tube([(0.0, 4.9, 0.0), (0.0, 5.65, 0.0)], [0.1, 0.1], 8), "steel", TK, 0.03)
M("ventCap", xf(lathe([(0.0, 0), (0.3, 0), (0.28, 0.08), (0.0, 0.14)], 10), (0, 5.65, 0)), "dark", TK, 0.02)
# H3 branding: a dark board on brackets off each flank
for sx in (-1, 1):
    rb(f"panel{sx}", 0.07, 0.8, 1.4, (sx * 1.64, 3.3, -0.2), "dark", TK, 0.04, 0.08)
    for y in (2.65, 3.95):
        for z in (-1.2, 0.8):
            rb(f"bracket{sx}_{y}_{z}", 0.15, 0.07, 0.09, (sx * 1.45, y, z), "steel", TK, 0.02, 0.2)
    d = Dec("+x" if sx > 0 else "-x", (sx * 1.71, 3.3, -0.2))
    d.rect(-1.3, -0.72, 1.3, 0.72, "brand", 0)
    d.rect(-1.24, -0.66, 1.24, 0.66, "dark", 1)
    # atom (hazard nucleus, two teal orbits), H3, legend
    d.ring(-0.8, 0.19, 0.36, 0.41, "brand", 2, 24, sy=0.4)
    d.ring(-0.8, 0.19, 0.36, 0.41, "brand", 2, 24, sx=0.4)
    d.disc(-0.8, 0.19, 0.09, "hazard", 3, 12)
    d.text("H3", 0.35, -0.16, 0.1, "white", 2, "c")
    d.text("HELIUM-3", 0.0, -0.62, 0.045, "brand", 2, "c")
    d.build(f"{PFX}brand{'P' if sx > 0 else 'S'}", TK)
# rear: valve cabinet (gauges, hand-wheel valves, pipes), ladder, NFPA diamond
rb("cabinet", 1.1, 0.75, 0.28, (0, 2.55, -4.05), "dark", TK, 0.05, 0.1)
for sx in (-1, 1):
    M(f"gauge{sx}", xf(lathe([(0.0, 0), (0.2, 0), (0.2, 0.05), (0.0, 0.05)], 14), (sx * 0.62, 3.08, -4.335), (-PI / 2, 0, 0)), "white", TK, 0.02)
    bm(f"needle{sx}", (sx * 0.62, 3.08, -4.36), (sx * 0.62 + sx * 0.1, 3.16, -4.36), 0.02, "tail", TK)
    M(f"valveW{sx}", xf(torus(0.2, 0.035, 14, 4), (sx * 0.85, 2.45, -4.36), (PI / 2, 0, 0)), "hazard", TK, 0)
    bm(f"valveS{sx}", (sx * 0.85, 2.45, -4.33), (sx * 0.85, 2.45, -4.36), 0.035, "metal", TK)
    M(f"pipe{sx}", tube([(sx * 0.8, 3.0, -3.8), (sx * 0.8, 3.3, -4.05), (sx * 0.8, 3.45, -4.05)], [0.07, 0.07, 0.07], 6), "steel", TK, 0.02)
for x in (1.05, 1.55):
    bm(f"ladRail{x}", (x, 1.9, -3.93), (x, 4.9, -3.93), 0.045, "metal", TK, 0.01)
for k in range(8):
    bm(f"rung{k}", (1.05, 2.1 + k * 0.38, -3.93), (1.55, 2.1 + k * 0.38, -3.93), 0.03, "metal", TK)
rb("tail", 0.7, 0.07, 0.04, (0, 1.95, -4.02), "tail", TK, 0.02, 0.3)
dn = Dec("-z", (0, 2.55, -4.33))
dn.hazard(-1.1, -0.74, 1.1, -0.5, "dark", "hazard", 0, 0.14)
nfpa(dn, 0, -0.02, 0.4, 3, 0, 0, "SA", 2)
dn.build(f"{PFX}cabinetSign", TK)
# front: bulkhead plate with the faction mark
rb("bulkhead", 1.5, 1.05, 0.06, (0, 3.35, 3.93), "steel", TK, 0.05, 0.1)
rb("bulkheadTop", 1.55, 0.07, 0.15, (0, 4.45, 3.9), "dark", TK, 0.03, 0.15)


def tk_livery(f, piv):
    d = Dec("+z", (0, 3.35, 3.99))
    d.hazard(-1.4, -0.98, 1.4, -0.82, "dark", "hazard", 0, 0.14)
    emblem(d, f, 0, 0.32, 0.5)
    d.text(NAMES[f], 0, -0.6, 0.06, "dark", 0, "c")
    d.build(f"{PFX}bulkhead_{f}", piv)


ident(TK, "livery", tk_livery)
TK["radius"] = 4.4
TK["wheelRadius"] = 1.0
decks(TK, [(0.55, 2.43, 3.1, 2.43, 0), (1.55, 1.85, 3.5, 1.85, 0), (1.75, 1.0, 4.0, 1.0, 0)])


# =====================================================================================================
# PROSPECTOR CONTAINERS: a corrugated cargo box, and an armoured explosives magazine
# =====================================================================================================
def container_frame(R, body_slot, ribbed):
    """Flat deck, box, corner castings and a rideable flat roof."""
    prospector_base(R)
    rb("deck", 1.75, 0.1, 3.95, (0, 1.72, 0), "dark", R, 0.05, 0.1)
    rb("box", 1.55, 1.4, 3.62, (0, 3.3, 0), body_slot, R, 0.07, 0.06)
    if ribbed:
        for sx in (-1, 1):
            for k in range(18):
                rb(f"rib{sx}_{k}", 0.035, 1.28, 0.055, (sx * 1.57, 3.3, -3.3 + k * 0.388), body_slot, R, 0.02, 0.3, nu=6, nv=4)
        for k in range(10):
            rb(f"roofRib{k}", 1.42, 0.03, 0.06, (0, 4.72, -3.2 + k * 0.7), body_slot, R, 0.02, 0.3, nu=6, nv=4)
    for sx in (-1, 1):
        rb(f"roofRail{sx}", 0.08, 0.06, 3.62, (sx * 1.52, 4.74, 0), "dark", R, 0.03, 0.2)
        for sz in (-1, 1):
            rb(f"cast{sx}{sz}", 0.2, 0.17, 0.22, (sx * 1.5, 1.95, sz * 3.55), "dark", R, 0.03, 0.2)
            rb(f"castT{sx}{sz}", 0.2, 0.17, 0.22, (sx * 1.5, 4.62, sz * 3.55), "dark", R, 0.03, 0.2)
    rb("tail", 0.8, 0.08, 0.04, (0, 2.0, -3.95), "tail", R, 0.02, 0.2)
    decks(R, [(1.7, 2.36, 3.7, 2.36, 0)])


# ---- cargo container: faction-coloured corrugated steel, branding plate per flank, barred doors ----
CG = unit("prospector_cargo")
container_frame(CG, "body", True)
# doors at each end (decals.py container_doors, shared with the crane's load and cargo.py)
for name, geo, slot, ink in container_doors("body"):
    M(name, geo, slot, CG, ink)
for sx in (-1, 1):
    rb(f"plate{sx}", 0.04, CARGO_PLATE_HALF[1], CARGO_PLATE_HALF[0], (sx * 1.64, CARGO_PLATE_Y, 0.0), "dark", CG, 0.03, 0.08)


# plate and stencilled container number, centred on the box (decals.py cargo_decals, shared with the crane's load)
ident(CG, "livery", lambda f, piv: cargo_decals(f, piv, PFX))
CG["radius"] = 4.4

# ---- explosives container: smooth red armoured magazine, OSHA / DOT signs, strobes, lightning rod ----
BL = unit("prospector_blast")
container_frame(BL, "redsafe", False)
for sx in (-1, 1):
    for sz in (-1, 1):
        rb(f"post{sx}{sz}", 0.13, 1.4, 0.13, (sx * 1.55, 3.3, sz * 3.6), "dark", BL, 0.04, 0.15)
# rear door hinges up the edges, clear of the signs
for y in (3.25, 4.45):
    for sx in (-1, 1):
        rb(f"hinge{sx}_{y}", 0.14, 0.1, 0.06, (sx * 1.42, y, -3.68), "dark", BL, 0.02, 0.2)
# roof: two blast-relief vents, two amber strobes, a rear-corner lightning rod with earth strap
for k, z in enumerate((-1.4, 1.2)):
    rb(f"vent{k}", 0.9, 0.09, 0.55, (0, 4.8, z), "dark", BL, 0.03, 0.15)
    for j in range(5):
        rb(f"ventSlat{k}_{j}", 0.8, 0.025, 0.04, (0, 4.9, z - 0.4 + j * 0.2), "metal", BL, 0, 0.3, nu=6, nv=4)
for sx in (-1, 1):
    M(f"strobe{sx}", xf(lathe([(0.2, 0), (0.2, 0.08), (0.13, 0.22), (0, 0.26)], 10), (sx * 1.3, 4.76, 3.2)), "hot", BL, 0.02)
    M(f"strobeBase{sx}", xf(lathe([(0.24, 0), (0.24, 0.07), (0.2, 0.09)], 10), (sx * 1.3, 4.72, 3.2)), "dark", BL, 0.02)
M("rod", tube([(1.3, 4.72, -3.2), (1.3, 6.2, -3.2)], [0.035, 0.012], 5), "metal", BL, 0)
M("rodBase", xf(lathe([(0.12, 0), (0.12, 0.1), (0.05, 0.14)], 8), (1.3, 4.72, -3.2)), "dark", BL, 0.02)
bm("earthStrap", (1.52, 4.7, -3.4), (1.52, 1.95, -3.4), 0.025, "metal", BL, 0)


# Flank markings are centred on the box: along z on its middle (clear of the corner castings, which reach |z| 3.33), and
# vertically with the band's top and the stripe's bottom equally inset from roof and deck.
BLV = 0.075        # the stack spans v -1.35 to +1.2; this centres it on the box
BLH = 3.25         # half length of the band and stripe


def bl_static():
    """Faction-independent signs. Each flank: DOT 1.1 placard in the middle, a DANGER sign and a pair of prohibition signs
    of equal width either side, the white top band (its EXPLOSIVES lettering is in the livery) and the bottom hazard stripe.
    Plus both ends."""
    for side in (-1, 1):
        d = side_dec(side, 1.55, 3.3 + BLV, 0.0)
        d.rect(-BLH, 0.75, BLH, 1.2, "white", 0)
        d.hazard(-BLH, -1.35, BLH, -1.0, "dark", "hazard", 0, 0.2)
        danger_sign(d, -3.1, -0.65, 1.9, 1.25, 0)       # -3.14 .. -1.12 with its border
        placard(d, 0.0, -0.05, 0.62, 0)
        prohibition(d, 1.54, -0.05, 0.42, "smoke", 0)   # pair spans 1.12 .. 3.1, as wide as the DANGER sign
        prohibition(d, 2.68, -0.05, 0.42, "flame", 0)
        d.build(f"{PFX}signs{'P' if side > 0 else 'S'}", BL)
    # rear: DANGER over a placard between two prohibition signs
    d = Dec("-z", (0, 3.3 - 0.035, -3.62))
    danger_sign(d, -1.1, 0.05, 2.2, 1.3, 0)
    placard(d, 0, -0.72, 0.6, 0)
    prohibition(d, -1.18, -0.72, 0.33, "smoke", 0)
    prohibition(d, 1.18, -0.72, 0.33, "flame", 0)
    d.build(f"{PFX}signsRear", BL)
    # front: placard over a hazard stripe
    d = Dec("+z", (0, 3.3 + 0.125, 3.62))
    placard(d, 0, 0.2, 0.85, 0)
    d.hazard(-1.45, -1.3, 1.45, -1.0, "dark", "hazard", 0, 0.2)
    d.build(f"{PFX}signsFront", BL)


bl_static()


def bl_livery(f, piv):
    """EXPLOSIVES, the faction mark and name across the white band, centred as a whole (width varies with the name)."""
    s = NAMES[f]
    ps_e, ps_n, r, gap = 0.06, 0.035, 0.21, 0.1
    total = text_width("EXPLOSIVES", ps_e) + 0.3 + 2 * r + gap + text_width(s, ps_n)
    u0 = -total / 2
    for side in (-1, 1):
        d = side_dec(side, 1.55, 3.3 + BLV, 0.0)
        d.text("EXPLOSIVES", u0, 0.78, ps_e, "redsafe", 1)
        cu = u0 + text_width("EXPLOSIVES", ps_e) + 0.3 + r
        emblem(d, f, cu, 0.975, r, 1)
        d.text(s, cu + r + gap, 0.975 - 3.5 * ps_n, ps_n, "dark", 1)
        d.build(f"{PFX}band{'P' if side > 0 else 'S'}_{f}", piv)


ident(BL, "livery", bl_livery)
BL["radius"] = 4.4

# unit roots must keep their exact names (Blender renames clashes to "name.001"; the game looks them up by name)
for n in ("moonliner", "moonliner_coach", "prospector", "prospector_tank", "prospector_cargo", "prospector_blast"):
    if n not in bpy.data.objects or bpy.data.objects[n].parent is not None or bpy.data.objects[n].type != "EMPTY":
        raise RuntimeError(f"unit root {n!r} is missing or was renamed: some part of another unit already uses that name")

tris = sum(sum(len(pl.vertices) - 2 for pl in o.data.polygons) for o in C.objects if o.type == "MESH")
print("built", len(C.objects), "objects,", tris, "triangles")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
    if os.environ.get("TRAIN_BLEND"):
        # the GLB keeps each unit at its origin; the .blend lays them out side by side
        for i, n in enumerate(("moonliner", "moonliner_coach", "prospector", "prospector_tank", "prospector_cargo", "prospector_blast")):
            bpy.data.objects[n].location.x = i * 8.0
        bpy.ops.wm.save_as_mainfile(filepath=os.environ["TRAIN_BLEND"])
