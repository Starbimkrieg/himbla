# The ILMB's Earth rocket for Blender (4.2+ / 5.x): the reusable crew ship that carries people between the Earth and the Moon
# ("Kestrel", picked from two proposals), the launch gantry fitted to it, and the flat pad it lands on; exported to
# src/assets/rocket.glb.
#
# headless:   blender -b --python tools/blender/build_rocket.py   (or MOONRUNNER_REPO=<repo> python3 ...; MOONRUNNER_EXPORT=0
#             builds without writing)
# in Blender: exec(open(r"<repo>/tools/blender/build_rocket.py").read())
#
# three.js axes (x right, y up, +z forward), metres. Roots (src/models.js makeRocket, src/ilmbCore.js buildIlmbRocketPad):
#   rocket_ship     "Kestrel": a tall slim ship, 46 m, a white hull with an ogive nose and a band of cabin windows under it,
#                   two canards up front and two fins aft, four landing legs, three engines; its crew hatch on +z
#   rocket_gantry   its launch gantry: a red and white lattice tower 54 m tall, its crew access arm
#                   out (-x) to the ship's hatch, ending in a white room against the hull, a propellant arm lower down, a lift
#                   cage up one face; it stands on the pad's edge, the ship 14.5 m from it (src/ilmbLayout.js ROCKET.gantryOff)
#   rocket_pad      the flat landing pad, 26 m round: a slab with a blast-proof centre plate over a flame trench cross, the
#                   painted ring and a target bar, edge lamps; the gantry stands on it
# Ship roots' extras: `flameY` (where the exhaust leaves, under the bells), `flameR` (its radius), `hatchY` (the hatch's sill),
# `R` (the hull's radius at the hatch). Pivots: leg (a landing leg, hinged at its top, extra `yaw` the angle it stands out at;
# the game folds them up against the hull in flight, about the tangent there), blinker. Collider pivots (col) on the gantry and
# the pad.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_rocket.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("ROCKET_OUT") or os.path.join(REPO, "src", "assets", "rocket.glb")
COLL = "Rocket"
HEX = {
    # toon (src/models.js ROCKET_TOON)
    "hull": 0xF3EEE4, "steel": 0x55607A, "dark": 0x2A2540, "metal": 0x8A87A0, "red": 0xFF4F2E, "white": 0xF3EEE4,
    "gold": 0xFFD23F, "foil": 0xE8B23A, "navy": 0x2A3A6B, "concrete": 0xB8B2CC, "pave": 0x9D97B0, "hazard": 0xFFD23F,
    "roof": 0x3A3550, "alu": 0xC9CED8,
    # glow
    "window": 0xFFF6A8, "lamp": 0xFFF6A8, "hot": 0xFF9F1C, "redlamp": 0xFF2A4A, "cyan": 0x2EE6FF,
    # see-through
    "glass": 0x9BE7FF,
}
PFX = "rocket_"
ROOT = None
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())
from mathutils import Vector, Matrix

GANTRY_OFF = 14.5            # the gantry tower's middle from the ship's axis (ilmbLayout.js ROCKET.gantryOff)
PAD_R = 26.0                 # the flat pad's radius (ilmbLayout.js ROCKET.padR)
TOWER_W = 2.8                # the tower's half width


def begin(name, **extras):
    global ROOT, PFX
    ROOT = pivot(name, (0, 0, 0), None, **extras)
    PFX = name + "_"
    return ROOT


def end():
    made = flush_all(ROOT, PFX)
    print(f"{ROOT.name}: {tri_count(made)} tris, {len(made)} meshes")
    return made


def blinker(pos, radius=0.4):
    NCOL[0] += 1
    return pivot(f"{PFX}blink{NCOL[0]}", pos, ROOT, role="blinker", radius=radius)


def lathe_r(profile, seg=32):
    """a closed solid of revolution from [(r, y)] (bottom to top)"""
    return lathe(profile, seg)


def bell(x, z, y_top, r0, r1, h):
    """an engine bell hanging from y_top: a throat ring and the flared bell, its glowing throat inside"""
    Acc.of("steel", 0.02).put(cyl(x, y_top - 0.25, z, r0 * 1.1, 0.5, 14))
    prof = [(r0, 0.0), (r0 * 1.05, -h * 0.3), (r1 * 0.85, -h * 0.75), (r1, -h)]
    verts, faces = [], []
    seg = 16
    for i, (r, y) in enumerate(prof):
        for j in range(seg):
            t = TAU * j / seg
            verts.append((x + math.cos(t) * r, y_top - 0.5 + y, z + math.sin(t) * r))
    for i in range(len(prof) - 1):
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    Acc.of("dark", 0.03, raw=True).put((verts, faces))
    Acc.of("hot", 0.0).put(cyl(x, y_top - 0.5 - h * 0.25, z, r0 * 1.04, 0.1, 12))   # (the glowing throat, across the bell)


def hatch(R, y):
    """the crew hatch on +z at sill height y on a hull of radius R: a door set into the hull, a gold frame round it (each part
    reaching back into the curved hull)"""
    sunk = lambda x: math.sqrt(R * R - x * x) - 0.03             # (the hull's surface at x, less a little: parts start inside it)
    Acc.of("dark", 0.01).put(bx_(-0.8, y, sunk(0.8), 0.8, y + 2.2, R + 0.02))
    for sx in (-0.9, 0.9):
        Acc.of("gold", 0.0).put(bx_(sx - 0.06, y - 0.1, sunk(0.96), sx + 0.06, y + 2.3, R + 0.035))
    Acc.of("gold", 0.0).put(bx_(-0.96, y + 2.2, sunk(0.96), 0.96, y + 2.32, R + 0.035))


def bx_(x0, y0, z0, x1, y1, z1):
    return box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0)


# =====================================================================================================================
# The ship: "Kestrel"
# =====================================================================================================================
SHIP_R, SHIP_HATCH = 4.2, 31.0


def build_ship():
    R, base = SHIP_R, 4.6                                          # hull radius; the hull's foot (over the engine skirt)
    begin("rocket_ship", flameY=0.6, flameR=2.6, hatchY=SHIP_HATCH, R=R)
    # the hull: a skirt over the engines, the barrel, the ogive nose
    nose0, tip = 33.5, 46.0
    prof = [(0.0, 2.2), (R + 0.15, 2.2), (R + 0.15, 3.0), (R, base)]
    prof += [(R, y) for y in (base + 2, nose0)]
    for k in range(1, 13):                                      # (an ogive: r = R sqrt(1 - (t)^2) bent toward the tip)
        t = k / 12
        prof.append((R * math.sqrt(max(0.0, 1 - t ** 1.6)), nose0 + (tip - nose0) * t))
    Acc.of("hull", 0.1).put(lathe_r(prof, 36))
    # livery: a gold band, a red band, the cabin's window band under the nose, all skins on the hull's facets
    for y0, y1, slot in ((19.5, 21.0, "gold"), (11.0, 11.8, "red"), (base + 0.1, base + 0.5, "red")):
        Acc.of(slot, 0.0).put(cyl(0, (y0 + y1) / 2, 0, R + 0.006, y1 - y0, 36))
    for i in range(18):                                         # cabin windows: a ring of panes at the crew deck
        t = TAU * (i + 0.5) / 18
        if abs(math.atan2(math.sin(t - PI / 2), math.cos(t - PI / 2))) < 0.3:
            continue                                            # (the hatch's place)
        Acc.of("window", 0.0).put(xf(box(0, 0, 0, 0.9, 1.3, 0.06), (math.cos(t) * (R + 0.01), 34.5 - 1.0, math.sin(t) * (R + 0.01)), (0, PI / 2 - t, 0)))
    # the crew hatch on +z, its frame and a lamp over it
    hatch(R, SHIP_HATCH)
    Acc.of("lamp", 0.0).put(box(0, SHIP_HATCH + 2.6, R + 0.02, 0.5, 0.15, 0.06))
    # canards up front and fins aft, on +-x (clear of the hatch at +z and the legs between)
    for sx in (-1, 1):                                          # (plates in the x-y plane, their roots 10 cm into the hull)
        Acc.of("steel", 0.04).put(xf(extrude([(0.0, -1.6), (0.0, 1.4), (2.6, 0.8), (2.6, -1.0)], 0.35, "z"), (sx * (R - 0.1), 37.0, 0), (0, 0 if sx > 0 else PI, 0)))
        Acc.of("steel", 0.05).put(xf(extrude([(0.0, -3.4), (0.0, 3.2), (3.6, 0.6), (3.6, -3.6)], 0.45, "z"), (sx * (R - 0.1), 7.0, 0), (0, 0 if sx > 0 else PI, 0)))
    # engines: three bells under the skirt
    for i in range(3):
        t = TAU * i / 3 + PI / 2
        bell(math.cos(t) * 1.9, math.sin(t) * 1.9, 2.2, 0.75, 1.25, 1.8)
    # four landing legs between the fins and the hatch, at 45 degrees: a strut from the hull down and out to a footpad, a
    # brace from the skirt; each under its own pivot at the strut's top (folds up against the hull in flight)
    for k in range(4):
        a = PI / 4 + k * PI / 2
        ca, sa = math.cos(a), math.sin(a)
        top = (ca * (R - 0.1), 10.0, sa * (R - 0.1))
        p = pivot(f"rocket_ship_leg{k}", top, ROOT, role="leg", yaw=a)
        foot = (ca * 7.6 - top[0], 0.35 - top[1], sa * 7.6 - top[2])      # (in the pivot's frame: it isn't turned)
        L = Acc.of("steel", 0.04, parent=p)
        L.put(B((0, 0, 0), foot, 0.32, 8, True))
        knee = (foot[0] * 0.55, foot[1] * 0.55 + 0.0, foot[2] * 0.55)
        brace0 = (ca * (R + 0.05) - top[0], 3.0 - top[1], sa * (R + 0.05) - top[2])
        Acc.of("dark", 0.02, parent=p).put(B(brace0, knee, 0.18, 6, True))
        Acc.of("dark", 0.03, parent=p).put(cyl(foot[0], foot[1] - 0.17, foot[2], 0.9, 0.36, 14, rt=0.7))
        Acc.of("gold", 0.0, parent=p).put(cyl(0, -0.1, 0, 0.42, 0.6, 10))
    blinker((0, tip + 0.2, 0), 0.35)
    return end()


# =====================================================================================================================
# The gantry: the tower on its slab, the crew access arm at the hatch, a propellant arm, a lift cage
# =====================================================================================================================
def lattice(legs, braces, h, w, bays, r=0.32):
    cn = ((-1, -1), (1, -1), (1, 1), (-1, 1))
    for sx, sz in cn:
        legs.put(B((sx * w, 0, sz * w), (sx * w, h, sz * w), r, 6, True))
    for i in range(bays):
        y0, y1 = h * i / bays, h * (i + 1) / bays
        for f in range(4):
            (ax, az), (bx_, bz) = cn[f], cn[(f + 1) % 4]
            braces.put(B((ax * w, y0, az * w), (bx_ * w, y1, bz * w), r * 0.4, 4, True))
            braces.put(B((bx_ * w, y0, bz * w), (ax * w, y1, az * w), r * 0.4, 4, True))
            legs.put(B((ax * w, y1, az * w), (bx_ * w, y1, bz * w), r * 0.5, 4, True))


def build_gantry(name, hatch_y, R):
    """the tower at the origin, the ship's axis at x = -GANTRY_OFF; arms reach -x"""
    begin(name)
    H = 54.0
    Acc.of("concrete", 0.06).put(box(0, 0.5, 0, 10, 1.0, 10))
    lattice(Acc.of("red", 0.05), Acc.of("white", 0.02), H, TOWER_W, 12)
    Acc.of("roof", 0.05).put(box(0, H + 0.3, 0, 6.6, 0.6, 6.6))
    Acc.of("dark", 0.03).put(cyl(0, H + 4.6, 0, 0.3, 8.0, 6, rt=0.2))
    blinker((0, H + 8.9, 0), 0.5)
    # the lift: a glazed shaft up the +x face, its cab at the access arm's level
    Acc.of("glass", 0.0).put(box(TOWER_W + 0.9, H / 2, 0, 1.6, H, 1.8))
    col((TOWER_W + 0.9, 0, 0), shape="box", hx=0.8, hy=H / 2, hz=0.9, yaw=0.0)
    Acc.of("window", 0.0).put(box(TOWER_W + 0.9, hatch_y + 1.2, 0, 1.64, 2.4, 1.84))   # (the lit cab, at the arm)
    # the crew access arm: a covered walkway from the tower's -x face to a white room against the hull at the hatch
    x0, x1 = -TOWER_W, -(GANTRY_OFF - R - 0.15)               # (x1: a hand's breadth off the hull)
    L = x0 - x1
    y = hatch_y
    Acc.of("steel", 0.04).put(box((x0 + x1) / 2 + 1.2, y - 0.3, 0, L - 2.4, 0.6, 2.4))
    for sz in (-1.2, 1.2):                                      # the walkway's trusses each side
        Acc.of("steel", 0.02).put(B((x0, y + 2.6, sz), (x1 + 2.4, y + 2.6, sz), 0.08, 4, True))
        n = max(2, int(L / 2.0))
        for k in range(n + 1):
            xx = x0 - (L - 2.4) * k / n
            Acc.of("steel", 0.0).put(B((xx, y, sz), (xx, y + 2.6, sz), 0.06, 4, True))
    Acc.of("navy", 0.03).put(box((x0 + x1) / 2 + 1.2, y + 2.75, 0, L - 2.4, 0.3, 2.8))
    col(((x0 + x1) / 2 + 1.2, y + 2.6, 0), shape="box", hx=(L - 2.4) / 2, hy=0.15, hz=1.4, yaw=0.0)
    # the white room: a box with its door open toward the hatch, curved to the hull at its mouth
    Acc.of("white", 0.06).put(box(x1 + 1.2, y + 1.4, 0, 2.4, 3.0, 3.2))
    Acc.of("dark", 0.0).put(box(x1 + 0.006, y + 1.1, 0, 0.03, 2.2, 1.6))
    Acc.of("gold", 0.0).put(box(x1 + 1.2, y + 2.95, 0, 2.42, 0.2, 3.22))
    Acc.of("lamp", 0.0).put(box(x1 + 1.2, y + 3.0, 1.62, 0.6, 0.15, 0.04))
    # the hinge drum at the tower and a strut under the arm
    Acc.of("steel", 0.04).put(cyl(x0, y + 1.0, 0, 1.0, 3.0, 12))
    Acc.of("dark", 0.02).put(B((x0, y - 6.0, 0), ((x0 + x1) / 2 + 1.2, y - 0.6, 0), 0.2, 6, True))
    col(((x0 + x1) / 2, y - 0.6, 0), shape="box", hx=L / 2, hy=0.3, hz=1.2, yaw=0.0)
    col((x1 + 1.2, y, 0), shape="box", hx=1.2, hy=1.5, hz=1.6, yaw=0.0)
    # the propellant arm lower down: a truss with its hoses hanging to a coupling at the ship's skirt
    yp = 6.0
    xp = -(GANTRY_OFF - R - 1.2)
    Acc.of("roof", 0.05).put(box((x0 + xp) / 2, yp, 0, x0 - xp, 1.2, 1.6))
    Acc.of("hazard", 0.0).put(box((x0 + xp) / 2, yp + 0.606, 0, x0 - xp, 0.01, 1.6))
    for sz in (-0.4, 0.4):
        Acc.of("dark", 0.0).put(B((xp, yp - 0.6, sz), (xp + 0.2, 2.4, sz), 0.12, 6, True))
    Acc.of("steel", 0.02).put(box(xp + 0.2, 2.2, 0, 0.6, 0.6, 1.4))
    col(((x0 + xp) / 2, yp - 0.6, 0), shape="box", hx=(x0 - xp) / 2, hy=0.6, hz=0.8, yaw=0.0)
    col((0, 0, 0), shape="box", hx=5.0, hy=0.5, hz=5.0, yaw=0.0)
    col((0, 1.0, 0), shape="box", hx=TOWER_W + 0.3, hy=(H - 1.0) / 2, hz=TOWER_W + 0.3, yaw=0.0)
    return end()


# =====================================================================================================================
# The flat pad
# =====================================================================================================================
def build_pad():
    begin("rocket_pad")
    r = PAD_R
    Acc.of("concrete", 0.08).put(cyl(0, 0.0, 0, r, 0.5, 64, rt=r))
    Acc.of("red", 0.0).put(ring_flat(r * 0.65, r * 0.8, 0.252))
    Acc.of("red", 0.0).put(box(0, 0.252, 0, r * 0.15, 0.004, r * 0.9))
    # the blast plate over the flame trench: a dark steel disc with a grate cross, its rim
    Acc.of("dark", 0.0).put(cyl(0, 0.256, 0, 6.5, 0.012, 40))
    for a in (0.0, PI / 2):
        Acc.of("steel", 0.0).put(xf(box(0, 0.264, 0, 12.6, 0.006, 1.4), (0, 0, 0), (0, a, 0)))
    Acc.of("hazard", 0.0).put(ring_flat(6.5, 7.0, 0.257))
    # edge lamps round the rim
    for i in range(24):
        a = TAU * i / 24
        Acc.of("redlamp" if i % 2 else "lamp", 0.0).put(box(math.cos(a) * (r - 0.6), 0.3, math.sin(a) * (r - 0.6), 0.5, 0.1, 0.5))
    col((0, -0.25, 0), shape="cyl", r=r, h=0.5)
    return end()


def ring_flat(r0, r1, y, seg=64):
    """a flat annulus on y (paint)"""
    verts, faces = [], []
    for i in range(seg):
        t = TAU * i / seg
        verts += [(math.cos(t) * r0, y, math.sin(t) * r0), (math.cos(t) * r1, y, math.sin(t) * r1)]
    for i in range(seg):
        a, b = 2 * i, 2 * ((i + 1) % seg)
        faces.append((a, b, b + 1, a + 1))
    return verts, faces


build_ship()
build_gantry("rocket_gantry", SHIP_HATCH, SHIP_R)
build_pad()

_clash = [o.name for o in C.objects if o.name[-4:-3] == "." and o.name[-3:].isdigit()]
assert not _clash, f"object names must be unique, Blender renamed {_clash[:3]}"
print("built", len(C.objects), "objects")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
