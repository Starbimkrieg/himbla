# ILMB Daedalus Relay builder for Blender (4.2+ / 5.x): Daedalus's listening post in the base, exported to
# src/assets/relay.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_relay.py").read())
# or headless:                              MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/build_relay.py
# (MOONRUNNER_EXPORT=0 builds without writing the file.)
#
# "The Eye": a phased-array radar station after PAVE PAWS, drawn as the Daedalus mark. The plan is a delta (a triangle with its
# corners cut), its apex out from the hub; the walls lean in like a pyramid's, dark plum with violet corners. On the two outward
# faces stands an octagonal phased array, tilted back with its wall: a grid of glowing elements with a bright pupil in the
# middle, so each reads as an eye. On the hub face, over the lobby, the hollow delta with its eye in relief. On the roof a
# geodesic radome and a three-legged lattice mast with panel antennas and an aircraft lamp. In front of the arrays an RF keep-out
# fence with warning plates. The game stands its tracking dish (models.js makeDish, Daedalus paint) off the -z side.
#
# Frame: three.js axes (x right, y up, +z forward), metres, origin on the ground at the wing centre; the ILMB wing frame
# (world.js wing()): +x away from the hub, -x toward the skywalk, which docks into the lobby's face at x = -14 (floor 0.6).
# Plan: a triangle of circumradius 19 at the ground (apex at x 19) and 10 at the roof (15 m up), corners cut; radome to 22.8,
# mast to 41.5. The fence arcs at radius 26 over -40 to 40 degrees. Footprint about x -14 to 27, z -18 to 18 (the dish is
# the game's, at (-12, -27)).
#
# Root empty `relay` (extras `radius`, `dock`: wing centre to the lobby face, `dish`: where the game stands the tracking dish,
# x and z). Pivots (empties with a `role`):
#   blinker  the aircraft lamp on the mast (extra `radius`)
#   col      a collider (wing_kit.col: box, the walls' pitched / cyl)
# Each mesh has ONE material named after a slot (WING_TOON / WING_GLOW in src/models.js): toon plum violet dark white light
# roof steel concrete hazard door; glow element iris lamp. Fixed palette (Daedalus: dark plum and violet).
# Ink (metres) per style.md.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_relay.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("RELAY_OUT") or os.path.join(REPO, "src", "assets", "relay.glb")
COLL = "IlmbRelay"
PFX = "relay_"
HEX = {
    "plum": 0x4a4660, "violet": 0xc77dff, "dark": 0x2a2540, "white": 0xf3eee4, "light": 0xd8d4e8, "panel": 0x5b5870,
    "roof": 0x3a3550, "metal": 0x8a87a0, "steel": 0x55607a, "concrete": 0xb8b2cc, "hazard": 0xffd23f, "door": 0x2a2540,
    # glow
    "element": 0xb98cff, "iris": 0xf4e6ff, "window": 0xfff6a8, "lamp": 0xfff6a8,
}
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())
from mathutils import Vector

DOCK = 14.0
DISH = (-12.0, -27.0)
ROOT = pivot("relay", (0, 0, 0), None, radius=27.0, dock=DOCK, dishX=DISH[0], dishZ=DISH[1])
UP = Vector((0, 1, 0))
P0, H = 0.4, 15.0                   # plinth top, roof
RB, RT = 19.0, 10.0                 # the delta's circumradius at the plinth and at the roof
CB, CT = 3.8, 2.0                   # corner cuts


def delta(R, c, grow=0.0):
    """the cut triangle: six points, apex at +x, counter-clockwise from above; grown outward by `grow` along each side's normal
    (approximately: the circumradius grows by 2 grow)"""
    R = R + 2 * grow
    V = [Vector((math.cos(TAU * k / 3) * R, 0, math.sin(TAU * k / 3) * R)) for k in range(3)]
    pts = []
    for k in range(3):
        a, b, n = V[k], V[(k - 1) % 3], V[(k + 1) % 3]
        p, q = a + (b - a).normalized() * c, a + (n - a).normalized() * c
        pts += [(p.x, p.z), (q.x, q.z)]
    return pts


BASE, TOP = delta(RB, CB), delta(RT, CT)
# sides of the delta: 0, 2, 4 the cut corners (apex, +z back, -z back), 1, 3, 5 the long walls (+z front, the hub's, -z front)
CORNERS, ARRAYS, HUB = (0, 2, 4), (1, 5), 3


def wall_frame(i):
    """side i of the delta (between corner i and i+1 of BASE / TOP): origin at the middle of its foot; u along it, v up its
    slant, n out. Returns (o, u, v, n, half length at the foot, slant height)."""
    j = (i + 1) % 6
    b0, b1 = Vector((BASE[i][0], P0, BASE[i][1])), Vector((BASE[j][0], P0, BASE[j][1]))
    t0, t1 = Vector((TOP[i][0], H, TOP[i][1])), Vector((TOP[j][0], H, TOP[j][1]))
    o = (b0 + b1) / 2
    u = (b1 - b0).normalized()
    v = ((t0 + t1) / 2 - o)
    sl = v.length
    v.normalize()
    n = u.cross(v)
    if n.dot(Vector((o.x, 0, o.z))) < 0:
        u, n = -u, -n
    return o, u, v, n, (b1 - b0).length / 2, sl


def face_prism(o, u, v, n, pts, d0, d1):
    """a polygon [(u, v)] in a wall's frame pushed out from d0 to d1 along n"""
    verts = [tuple(o + u * a + v * b + n * d) for d in (d0, d1) for a, b in pts]
    k = len(pts)
    faces = [tuple(range(k)), tuple(range(2 * k - 1, k - 1, -1))] + [(i, (i + 1) % k, k + (i + 1) % k, k + i) for i in range(k)]
    return verts, faces


def icosphere(r, level=2):
    t = (1 + 5 ** 0.5) / 2
    vs = [Vector(p).normalized() for p in ((-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
                                           (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1))]
    fs = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
          (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(level):
        cache, nf = {}, []

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                vs.append(((vs[a] + vs[b]) / 2).normalized())
                cache[key] = len(vs) - 1
            return cache[key]
        for a, b, c in fs:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        fs = nf
    return [tuple(p * r) for p in vs], fs


# ================= the delta block =================
Acc.of("concrete", 0.04).put(frustum(delta(RB, CB, 0.6), delta(RB, CB, 0.6), 0.01, P0))
Acc.of("plum", 0.1).put(frustum(BASE, TOP, P0, H))
Acc.of("violet", 0.04).put(frustum(delta(RT, CT, 0.15), delta(RT, CT, 0.15), H - 0.05, H + 0.6))     # parapet cap
Acc.of("roof", 0.0).put(frustum(delta(RT, CT, -0.5), delta(RT, CT, -0.5), H + 0.6, H + 0.65))
# the base band: a slice of the walls grown out
g = 0.14
Acc.of("violet", 0.02).put(frustum(delta(RB, CB, g), delta(RB - (RB - RT) * 0.8 / (H - P0), CB - (CB - CT) * 0.8 / (H - P0), g), P0 + 0.02, P0 + 0.8))
# the cut corners in violet, standing out from the walls
for i in CORNERS:
    o, u, v, n, hl, sl = wall_frame(i)
    tw = math.dist(TOP[i], TOP[(i + 1) % 6]) / 2
    Acc.of("violet", 0.02).put(face_prism(o, u, v, n, [(-hl + 0.2, 0.9), (hl - 0.2, 0.9), (tw - 0.2, sl - 0.2), (-tw + 0.2, sl - 0.2)], -0.02, 0.12))

# ================= the phased arrays on the two outward walls =================
frame_, face_, elem, iris = Acc.of("violet", 0.03), Acc.of("dark", 0.02), Acc.of("element", 0.0, raw=True), Acc.of("iris", 0.0, raw=True)
OCT = lambda r: [(math.cos(TAU * (k + 0.5) / 8) * r, math.sin(TAU * (k + 0.5) / 8) * r) for k in range(8)]
for i in ARRAYS:
    o, u, v, n, hl, sl = wall_frame(i)
    c = o + v * (sl * 0.48)
    frame_.put(face_prism(c, u, v, n, OCT(6.4), -0.05, 0.3))
    face_.put(face_prism(c, u, v, n, OCT(5.9), 0.0, 0.42))
    pitch = 0.82
    k = int(5.6 / pitch)
    for a in range(-k, k + 1):
        for b in range(-k, k + 1):
            x, y = a * pitch, b * pitch
            r = math.hypot(x, y)
            if r > 5.5 or abs(x) + abs(y) > 5.5 * 1.25:
                continue
            acc, s = (iris, 0.34) if r < 1.7 else (elem, 0.26)
            q = [tuple(c + u * (x + du) + v * (y + dv) + n * 0.425) for du, dv in ((-s, -s), (s, -s), (s, s), (-s, s))]
            uvn = u.cross(v).dot(n)
            acc.put((q if uvn > 0 else q[::-1], [(0, 1, 2, 3)]))

# ================= the hub wall: the lobby, louvres, the mark =================
o, u, v, n, hl, sl = wall_frame(HUB)
lob = Acc.of("dark", 0.0)
for s_ in (-1, 1):
    for kk in range(5):                                         # louvre bands either side of the lobby
        y0 = 2.0 + kk * 0.9
        lob.put(face_prism(o, u, v, n, [(s_ * 6.0, y0), (s_ * 10.5, y0), (s_ * 10.5, y0 + 0.3), (s_ * 6.0, y0 + 0.3)][::s_], -0.01, 0.005))
# the hollow delta and its eye, in relief above the lobby
mc = o + v * 11.2
rr = 2.6
Acc.of("violet", 0.03).put(face_prism(mc, u, v, n, [(0, rr * 0.74), (-rr * 0.7, -rr * 0.46), (rr * 0.7, -rr * 0.46)][::-1], -0.05, 0.25))
Acc.of("dark", 0.0).put(face_prism(mc, u, v, n, [(0, rr * 0.34), (-rr * 0.38, -rr * 0.28), (rr * 0.38, -rr * 0.28)][::-1], 0.02, 0.3))
Acc.of("iris", 0.0).put(face_prism(mc, u, v, n, [(math.cos(TAU * k / 12) * rr * 0.12, -rr * 0.06 + math.sin(TAU * k / 12) * rr * 0.12) for k in range(12)], 0.04, 0.34))
lobby(-DOCK, 6.7, 9.0, 6.6, "plum", "violet", door="door", win_x=())

# ================= the roof: radome, lattice mast, antennas =================
RX = 3.5
Acc.of("plum", 0.04).put(cyl(RX, H + 0.65 + 0.7, 0, 2.8, 1.4, 16))
Acc.of("violet", 0.012).put(cyl(RX, H + 0.65 + 1.25, 0, 2.86, 0.25, 16))
Acc.of("white", 0.04, sharp=math.radians(8)).put(xf(icosphere(3.4, 2), (RX, H + 0.65 + 1.4 + 2.2, 0)))
MX, MB, MY0, MH = -2.8, 1.2, H + 0.65, 26.0
legs = [lambda f, a=a: Vector((MX + math.cos(a) * (MB + (0.35 - MB) * f), MY0 + MH * f, math.sin(a) * (MB + (0.35 - MB) * f)))
        for a in (PI, PI / 3, -PI / 3)]
mast, brace = Acc.of("dark", 0.025), Acc.of("dark", 0.012)
for L_ in legs:
    mast.put(B(tuple(L_(0) - UP * 0.3), tuple(L_(1)), 0.12, 4, cap=True))
    Acc.of("violet", 0.01).put(cyl(L_(0).x, MY0 + 0.15, L_(0).z, 0.3, 0.3, 6))
lv = 10
for s in range(1, lv + 1):
    f0, f1 = (s - 1) / lv, s / lv
    for k in range(3):
        a, b = legs[k], legs[(k + 1) % 3]
        brace.put(B(tuple(a(f1)), tuple(b(f1)), 0.05, 4, cap=True))
        brace.put(B(tuple(a(f0)), tuple(b(f1)), 0.04, 4, cap=True))
top = Vector((MX, MY0 + MH, 0))
Acc.of("dark", 0.015).put(cyl(MX, top.y + 1.4, 0, 0.1, 2.8, 6, rt=0.06))
pivot(f"{PFX}lamp", (MX, top.y + 3.0, 0), ROOT, role="blinker", radius=0.4)
for f, az in ((0.55, 0.0), (0.72, PI)):                         # panel antennas: on a leg (PI) or across a face (0)
    p = (legs[0](f) + legs[1](f) + legs[2](f)) / 3
    rf = MB + (0.35 - MB) * f
    d_ = rf + 0.1 if az else rf * 0.5 + 0.14
    Acc.of("light", 0.02).put(box(p.x + math.cos(az) * d_, p.y, math.sin(az) * d_, 0.25, 2.2, 1.0, (0, -az, 0)))
for x, z in ((-4.0, 4.0), (-4.0, -4.0), (0.5, -4.0)):          # whips
    Acc.of("dark", 0.01).put(cyl(x, H + 0.65 + 1.55, z, 0.05, 2.9, 5, rt=0.02))
    Acc.of("violet", 0.0).put(cyl(x, H + 0.65 + 0.1, z, 0.18, 0.2, 6))

# ================= the RF keep-out fence in front of the arrays =================
fr, fp, plate = Acc.of("steel", 0.01), Acc.of("steel", 0.008), Acc.of("hazard", 0.008)
FR = 26.0
pts = [(math.cos(math.radians(a)) * FR, 0.0, math.sin(math.radians(a)) * FR) for a in range(-40, 41, 4)]
for y in (0.7, 1.6):
    fr.put(path_tube([(p[0], y, p[2]) for p in pts], 0.04, 4))
for i, p in enumerate(pts):
    fp.put(B((p[0], -0.1, p[2]), (p[0], 1.75, p[2]), 0.05, 4, cap=True))
    if i % 3 == 1:
        a = math.atan2(p[2], p[0])
        plate.put(box(p[0] + math.cos(a) * 0.07, 1.15, p[2] + math.sin(a) * 0.07, 0.04, 0.55, 0.7, (0, -a, 0)))
        Acc.of("dark", 0.0).put(box(p[0] + math.cos(a) * 0.092, 1.15, p[2] + math.sin(a) * 0.092, 0.004, 0.2, 0.2, (0, -a, 0)))

# ================= colliders: each leaning wall a pitched box, the core, the roof kit =================
for i in ARRAYS + (HUB,):
    o, u, v, n, hl, sl = wall_frame(i)
    c = o + v * (sl / 2) - n * 2.0
    th = math.atan2(n.z, n.x)                                   # the wall's outward direction in plan
    lean = math.asin(v.dot(Vector((math.cos(th), 0, math.sin(th)))))   # (negative: the wall leans in)
    col((c.x, c.y - sl / 2, c.z), shape="box", hx=hl, hy=sl / 2, hz=2.0, yaw=PI / 2 - th, pitch=lean)
col((0, -0.5, 0), shape="cyl", r=5.5, h=H + 1.2)
col((RX, H, 0), shape="cyl", r=3.4, h=7.3)
col((MX, H, 0), shape="cyl", r=1.3, h=MH + 1.0)

made = flush_all(ROOT, PFX)
audit_coplanar(made)
audit_flips(made)
print(f"relay: {tri_count(made)} triangles in {len(made)} meshes, {NCOL[0]} colliders")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
