# ILMB Hydroponics builder for Blender (4.2+ / 5.x): the base's farm wing, exported to src/assets/hydroponics.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_hydroponics.py").read())
# or headless:                              MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/build_hydroponics.py
# (MOONRUNNER_EXPORT=0 builds without writing the file.)
#
# A lunar greenhouse that runs on piped sunlight: a 16-sided lattice dome (meridian ribs, rings, alternating diagonals, flat
# green-tinted panes) on a cream drum with a ring of windows. Six heliostats round it, each a mirror on an alt-az pedestal,
# throw sunlight up to the lantern on the crown, where a receiver cone sends it down a light pipe to the middle of the farm;
# through the lunar night, magenta grow-light rings hung from the ribs take over. Inside, three rings of raised beds step up
# toward the middle (lettuce, then tomatoes, then maize), cut by four paths, round an aeroponic tower of planter drums on the
# light pipe. Outside: two water tanks and a nutrient tank on a pad, piped into the drum; a produce airlock with crates.
#
# Frame: three.js axes (x right, y up, +z forward), metres, origin on the ground at the wing centre; the ILMB wing frame
# (world.js wing()): +x away from the hub, -x toward the skywalk, which docks into the lobby's face at x = -24 (floor 0.6).
# Drum radius 19 (top 3.6), dome radius 18.2 on it (crown ring 21.2 up), lantern to 25, mast top 28.6. Heliostats at radius 27,
# theta +-60, +-105, +-150 degrees; the tank farm at +x (x 24 to 36). Footprint about x -26 to 36, z -29 to 29.
#
# Root empty `hydroponics` (extras `radius`, `dock`: wing centre to the lobby face). Pivots (empties with a `role`):
#   blinker  the aircraft lamp on the mast (extra `radius`)
#   col      a collider (wing_kit.col: box / cyl / sphere)
# Each mesh has ONE material named after a slot (WING_TOON / WING_GLOW in src/models.js): toon wall green panel dark
# metal steel concrete pave planter soil leaf leaf2 crop fruit wheat mirror tank water door hazard; glow window lamp grow;
# `glass` see-through. Fixed palette (SPACECOM cream with farm green). Ink (metres) per style.md.

import bpy, math, os, random


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_hydroponics.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("HYDROPONICS_OUT") or os.path.join(REPO, "src", "assets", "hydroponics.glb")
COLL = "IlmbHydroponics"
PFX = "hydro_"
# preview colours, as the game's toon / glow draw them
HEX = {
    "wall": 0xfff4e0, "green": 0x3ad15a, "panel": 0x5b5870, "roof": 0x3a3550, "dark": 0x2a2540,
    "metal": 0x8a87a0, "steel": 0x55607a, "concrete": 0xb8b2cc, "pave": 0x9d97b0, "planter": 0x6f6878, "soil": 0x4a3326,
    "leaf": 0x1f8a3a, "leaf2": 0x5cc94a, "crop": 0x9be35a, "fruit": 0xff4f2e, "wheat": 0xd8c25a, "mirror": 0xd8f0ff,
    "tank": 0xf3eee4, "water": 0x2ec4ff, "door": 0x2a2540, "hazard": 0xffd23f,
    # glow
    "window": 0xfff6a8, "lamp": 0xfff6a8, "grow": 0xff5cd6, "glass": 0x8dffb0,
}
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())
from mathutils import Vector

DOCK = 24.0
ROOT = pivot("hydroponics", (0, 0, 0), None, radius=31.0, dock=DOCK)
UP = Vector((0, 1, 0))
RND = random.Random(7)

RD, HD = 19.0, 3.6                  # drum radius, drum top
R = 18.2                            # dome radius (on the drum top)
NM = 16                             # meridians
STEP = TAU / NM
PHI = [math.radians(d) for d in (0, 15, 30, 45, 60, 75)]


def node(k, i):
    """dome node on ring k (latitude PHI[k]) and meridian i; meridians sit half a step off the axes, so the lobby (theta = pi)
    and the tank farm (0) face the middle of a panel"""
    t = (i + 0.5) * STEP
    r = R * math.cos(PHI[k])
    return Vector((math.cos(t) * r, HD + R * math.sin(PHI[k]), math.sin(t) * r))


def chord_y(r):
    """height of a meridian rib (straight between its nodes) at radius r from the axis"""
    for k in range(len(PHI) - 1):
        r0, r1 = R * math.cos(PHI[k]), R * math.cos(PHI[k + 1])
        if r1 <= r <= r0:
            s = (r0 - r) / (r0 - r1)
            return HD + R * (math.sin(PHI[k]) * (1 - s) + math.sin(PHI[k + 1]) * s)
    return HD + R * math.sin(PHI[-1])


# ================= drum, apron and the lobby =================
wall = Acc.of("wall", 0.08)
wall.put(sector([(17.9, 0.0), (RD, 0.0), (RD, HD), (17.9, HD)], 0, TAU, 48, cap=False))   # a hollow ring: the farm shows through the dome
Acc.of("concrete", 0.0).put(sector([(RD - 0.1, -0.05), (23.0, -0.05), (23.0, 0.1), (RD - 0.1, 0.1)], 0, TAU, 48, cap=False))
Acc.of("green", 0.04).put(sector([(17.8, HD - 0.05), (RD + 0.25, HD - 0.05), (RD + 0.25, HD + 0.2), (17.8, HD + 0.2)], 0, TAU, 48, cap=False))
Acc.of("green", 0.012).put(sector([(RD - 0.02, 0.3), (RD + 0.06, 0.3), (RD + 0.06, 0.55), (RD - 0.02, 0.55)], 0, TAU, 48, cap=False))
win = Acc.of("window", 0.0)
for i in range(24):
    t = math.radians(3.75 + 15 * i)                              # (on the middle of a facet of the 48-sided drum)
    if abs(math.atan2(math.sin(t - PI), math.cos(t - PI))) < 0.32 or abs(t - TAU * 0.917) < 0.3:   # lobby, airlock
        continue
    c, s = math.cos(t), math.sin(t)
    o = Vector((c * RD, 0, s * RD)) * math.cos(PI / 48)
    win.put(frame_box(o, Vector((-s, 0, c)), UP, Vector((c, 0, s)), -0.75, 0.75, 1.5, 2.7, -0.05, 0.006))
lobby(-DOCK, 5.55, 9.0, 6.6, "wall", "green", win_x=(-22.6,))

# ================= the dome: ribs, rings, diagonals, panes =================
rib, ringb, diag, glass = Acc.of("wall", 0.015), Acc.of("wall", 0.015), Acc.of("wall", 0.01), Acc.of("glass", 0.0, sharp=math.radians(5))
for k in range(len(PHI)):
    for i in range(NM):
        a, b = node(k, i), node(k, (i + 1) % NM)
        ringb.put(B(tuple(a), tuple(b), 0.24 if k in (0, len(PHI) - 1) else 0.19, 4, cap=True))
        if k + 1 < len(PHI):
            up_ = node(k + 1, i)
            rib.put(B(tuple(a), tuple(up_), 0.22, 4, cap=True))
            c_, d_ = node(k + 1, (i + 1) % NM), node(k, (i + 1) % NM)
            if (i + k) % 2 == 0:
                diag.put(B(tuple(a), tuple(c_), 0.11, 4, cap=True))
                glass.put(([tuple(a), tuple(d_), tuple(c_)], [(0, 1, 2)]))
                glass.put(([tuple(a), tuple(c_), tuple(up_)], [(0, 1, 2)]))
            else:
                diag.put(B(tuple(d_), tuple(up_), 0.11, 4, cap=True))
                glass.put(([tuple(a), tuple(d_), tuple(up_)], [(0, 1, 2)]))
                glass.put(([tuple(d_), tuple(c_), tuple(up_)], [(0, 1, 2)]))

# lantern on the crown ring: curb, glazed receiver drum, cap, mast; the receiver cone inside turns the light down the pipe
YC = HD + R * math.sin(PHI[-1])                                 # crown ring height
RC = R * math.cos(PHI[-1])
Acc.of("wall", 0.04).put(cyl(0, YC + 0.2, 0, RC + 0.35, 0.7, 32, rt=RC + 0.1))
glass.put(xf(cylinder_arc(RC - 0.4, RC - 0.4, 2.2, 24)[:2], (0, YC + 1.65, 0)))
for i in range(12):
    a = (i + 0.5) * TAU / 12
    Acc.of("wall", 0.015).put(box(math.cos(a) * (RC - 0.4), YC + 1.65, math.sin(a) * (RC - 0.4), 0.22, 2.2, 0.22, (0, -a, 0)))
Acc.of("mirror", 0.0).put(cyl(0, YC + 1.4, 0, 0.25, 1.6, 16, rt=1.9))   # apex down: turns the heliostats' light down the pipe
Acc.of("green", 0.05).put(cyl(0, YC + 3.0, 0, RC + 0.2, 0.5, 32, rt=RC - 0.4))
Acc.of("wall", 0.04).put(xf(sphere(RC - 0.6, 24, 5, PI / 2)[:2], (0, YC + 3.25, 0), (0, 0, 0), (1, 0.35, 1)))
Acc.of("dark", 0.02).put(cyl(0, YC + 5.4, 0, 0.12, 3.6, 6, rt=0.08))
Acc.of("dark", 0.012).put(box(0, YC + 6.2, 0, 1.6, 0.1, 0.1))
pivot(f"{PFX}lamp", (0, YC + 7.4, 0), ROOT, role="blinker", radius=0.35)

# ================= inside: floor, raised beds, the aeroponic tower on the light pipe =================
Acc.of("pave", 0.0).put(cyl(0, 0.31, 0, 18.0, 0.58, 48))
PATHS = (0.0, PI / 2, PI, 1.5 * PI)                            # the four paths cut through the beds
BEDS = ((13.4, 16.9, 1.5, "lettuce"), (8.6, 11.8, 2.5, "tomato"), (4.0, 6.8, 3.5, "maize"))
planter, soil = Acc.of("planter", 0.03), Acc.of("soil", 0.0)
lettuce, vine, fruit, maize = Acc.of("crop", 0.012), Acc.of("leaf", 0.015), Acc.of("fruit", 0.0), Acc.of("wheat", 0.01)
for r0, r1, top, kind in BEDS:
    gap = 1.3 / ((r0 + r1) / 2)                                 # half the path's angle at the bed's middle
    for p in PATHS:
        a0, a1 = p + gap, p + PI / 2 - gap
        segs = max(4, int((a1 - a0) * r1 / 1.6))
        planter.put(sector([(r0, 0.58), (r1, 0.58), (r1, top), (r1 - 0.22, top), (r1 - 0.22, top - 0.18), (r0 + 0.22, top - 0.18),
                            (r0 + 0.22, top), (r0, top)], a0, a1, segs))
        soil.put(sector([(r0 + 0.22, top - 0.18), (r1 - 0.22, top - 0.18), (r1 - 0.22, top - 0.15), (r0 + 0.22, top - 0.15)], a0 + 0.004, a1 - 0.004, segs))
        y = top - 0.15
        for rr in (r0 + (r1 - r0) * 0.3, r0 + (r1 - r0) * 0.7):
            n = int((a1 - a0) * rr / (1.25 if kind == "lettuce" else 1.6 if kind == "tomato" else 0.9))
            for j in range(n):
                t = a0 + (a1 - a0) * (j + 0.5) / n
                x, z = math.cos(t) * rr, math.sin(t) * rr
                if kind == "lettuce":
                    lettuce.put(ball(x, y + 0.12, z, 0.46, 6, 4, (1, 0.62, 1)))
                elif kind == "tomato":
                    h = 1.5 + RND.random() * 0.4
                    vine.put(cyl(x, y + h / 2, z, 0.55, h, 6, rt=0.12))
                    for q in range(2):
                        fh = y + 0.4 + RND.random() * (h - 0.8)
                        fr = 0.55 * (1 - (fh - y) / h) + 0.04
                        fa = RND.random() * TAU
                        fruit.put(ball(x + math.cos(fa) * fr, fh, z + math.sin(fa) * fr, 0.14, 5, 4))
                else:
                    h = 1.8 + RND.random() * 0.6
                    maize.put(cyl(x, y + h / 2, z, 0.2, h, 5, rt=0.0))

# aeroponic tower: planter drums with leaf tufts on the light pipe, which runs on up to the receiver
pipe_ = Acc.of("lamp", 0.0)
pipe_.put(cyl(0, (0.65 + YC + 0.7) / 2, 0, 0.55, YC + 0.05, 12))
Acc.of("steel", 0.03).put(cyl(0, 0.9, 0, 1.6, 0.6, 16, rt=1.3))
for j in range(5):
    y0 = 1.6 + j * 2.3
    Acc.of("planter", 0.03).put(cyl(0, y0 + 0.5, 0, 2.3, 1.0, 16))
    Acc.of("green", 0.01).put(cyl(0, y0 + 1.04, 0, 2.38, 0.12, 16))
    for i in range(10):
        a = (i + 0.5 * (j % 2)) * TAU / 10
        Acc.of("leaf2", 0.012).put(ball(math.cos(a) * 2.35, y0 + 0.65, math.sin(a) * 2.35, 0.42, 6, 4, (1, 0.8, 1)))
    Acc.of("steel", 0.02).put(cyl(0, y0 + 1.6, 0, 0.75, 0.7, 10))
for y in (14.5, 17.5, 20.0):
    Acc.of("steel", 0.02).put(cyl(0, y, 0, 0.75, 0.4, 10))

# grow-light rings over the beds, each hung from eight ribs on rods
grow, rod = Acc.of("grow", 0.0), Acc.of("dark", 0.0)
for rr, y in ((15.15, 7.6), (10.2, 9.3), (5.4, 11.2)):
    grow.put(ring(rr, 0.14, y, 48, 6))
    for i in range(0, NM, 2):
        t = (i + 0.5) * STEP
        c, s = math.cos(t), math.sin(t)
        rod.put(B((c * rr, y, s * rr), (c * rr, chord_y(rr) + 0.05, s * rr), 0.04, 4, cap=True))

# ================= heliostats: alt-az mirrors throwing sunlight up to the lantern =================
TARGET = Vector((0, YC + 1.4, 0))
ped, foot, head, frame_, mir, yoke = (Acc.of("steel", 0.02), Acc.of("concrete", 0.02), Acc.of("dark", 0.015), Acc.of("metal", 0.03),
                                      Acc.of("mirror", 0.0), Acc.of("steel", 0.012))
HS = 1.3                                                        # heliostat size (5.5 x 3.9 m mirrors)
for deg in (60, 105, 150, -60, -105, -150):
    t = math.radians(deg)
    P = Vector((math.cos(t) * 27.0, 0, math.sin(t) * 27.0))
    foot.put(cyl(P.x, 0.15, P.z, 0.8 * HS, 0.3, 10))
    ped.put(cyl(P.x, 0.3 + 1.55 * HS, P.z, 0.32 * HS, 3.1 * HS, 8, rt=0.26 * HS))
    head.put(cyl(P.x, 0.3 + 3.35 * HS, P.z, 0.48 * HS, 0.5 * HS, 10))
    base = Vector((P.x, 0.3 + 3.6 * HS, P.z))                  # the yoke's crossbar
    piv = Vector((P.x, 0.3 + 4.15 * HS, P.z))                  # the elevation axis
    n = ((TARGET - piv).normalized() + UP * 0.9).normalized()   # (halfway between the lantern and a high sun)
    u = UP.cross(n).normalized()
    v = n.cross(u)
    frame_.put(frame_box(piv, u, v, n, -2.1 * HS, 2.1 * HS, -1.5 * HS, 1.5 * HS, -0.16, 0.0))
    mir.put(frame_box(piv, u, v, n, -2.0 * HS, 2.0 * HS, -1.4 * HS, 1.4 * HS, -0.01, 0.012))
    for k in (-0.9 * HS, 0.9 * HS):                             # ribs on the back
        yoke.put(frame_box(piv, u, v, n, k - 0.1, k + 0.1, -1.45 * HS, 1.45 * HS, -0.34, -0.15))
    yoke.put(B(tuple(base - u * 1.25 * HS), tuple(base + u * 1.25 * HS), 0.11, 4, cap=True))
    for k in (-1.2 * HS, 1.2 * HS):
        a = base + u * k - UP * 0.05
        b = piv + u * k - n * 0.25
        yoke.put(B(tuple(a), tuple(b), 0.1, 4, cap=True))
        head.put(B(tuple(b - u * 0.2), tuple(b + u * 0.2), 0.15, 6, cap=True))
    col((P.x, -0.5, P.z), shape="cyl", r=0.6, h=0.8 + 3.4 * HS)
    col((P.x, 0.3 + 3.2 * HS, P.z), shape="cyl", r=2.1 * HS, h=2.0 * HS)

# ================= tank farm (+x): water, nutrients, pipes into the drum =================
Acc.of("concrete", 0.03).put(box(30.0, 0.15, 0, 12.0, 0.3, 19.0))
tank, band, rails, rungs = Acc.of("tank", 0.05), Acc.of("water", 0.01), Acc.of("steel", 0.012), Acc.of("steel", 0.0)
for x, z, r, h, b in ((28.0, 5.5, 2.4, 7.0, "water"), (28.0, -5.5, 2.4, 7.0, "water"), (33.4, 0.0, 1.6, 4.6, "green")):
    tank.put(cyl(x, 0.33 + (h - 0.03) / 2, z, r, h - 0.03, 20))
    tank.put(xf(sphere(r, 20, 5, PI / 2)[:2], (x, 0.3 + h, z), (0, 0, 0), (1, 0.35, 1)))
    Acc.of(b, 0.01).put(cyl(x, 0.3 + h * 0.68, z, r + 0.03, 0.6, 20))
    Acc.of("steel", 0.02).put(cyl(x, 0.45, z, r + 0.12, 0.3, 20))
    ladder(rails, rungs, x + r + 0.25, z, 0.3, 0.3 + h, 0.0)
    col((x, -0.5, z), shape="cyl", r=r + 0.15, h=h + 0.8 + r * 0.35)
# pipes: one from each water tank and the nutrient line, through flanged stubs in the drum
pipe = Acc.of("steel", 0.015)
for z, y, x0 in ((5.5, 1.5, 25.6), (-5.5, 1.5, 25.6), (0.0, 1.1, 31.8)):
    x1 = math.sqrt(RD * RD - z * z) - 0.3
    pipe.put(B((x0 + 0.2, y, z), (x1, y, z), 0.17, 8, cap=True))
    for x in (x0 - 0.05, x1 + 0.45):
        Acc.of("dark", 0.01).put(cyl(x, y, z, 0.3, 0.14, 10, rot=(0, 0, PI / 2)))
    for x in range(int(x1) + 2, int(x0), 3):                   # pipe stands
        Acc.of("dark", 0.008).put(box(x, (y - 0.05) / 2, z, 0.12, y - 0.15, 0.12))
Acc.of("panel", 0.02).put(box(23.2, 0.65, 0.0, 1.2, 1.1, 0.9))     # pump on the nutrient line
Acc.of("green", 0.0).put(box(23.2, 1.2, 0.0, 1.0, 0.02, 0.7))

# ================= produce airlock (theta -30 deg) with crates =================
ta = math.radians(-30)
ca, sa = math.cos(ta), math.sin(ta)
er, et = Vector((ca, 0, sa)), Vector((-sa, 0, ca))
o = Vector((0, 0, 0))
Acc.of("wall", 0.06).put(frame_box(o, et, UP, er, -2.6, 2.6, 0.02, 4.2, 18.4, 24.4))
Acc.of("green", 0.03).put(frame_box(o, et, UP, er, -2.9, 2.9, 4.05, 4.5, 18.6, 24.7))
Acc.of("door", 0.0).put(frame_box(o, et, UP, er, -1.7, 1.7, 0.1, 3.3, 24.4, 24.405))
for k in range(5):                                              # roll-up door slats
    Acc.of("dark", 0.0).put(frame_box(o, et, UP, er, -1.7, 1.7, 0.6 + k * 0.6, 0.66 + k * 0.6, 24.405, 24.41))
Acc.of("hazard", 0.0).put(frame_box(o, et, UP, er, -2.0, 2.0, 3.4, 3.6, 24.4, 24.405))
Acc.of("lamp", 0.0).put(frame_box(o, et, UP, er, -0.5, 0.5, 3.75, 3.9, 24.4, 24.5))
col((er * 21.4).to_tuple(), shape="box", hx=2.7, hy=2.2, hz=3.1, yaw=PI / 2 - ta)
crate, lid = Acc.of("green", 0.02), Acc.of("wall", 0.0)
for u, d, hgt in ((-1.6, 26.0, 0.0), (-0.4, 26.1, 0.0), (-1.0, 26.05, 0.92), (1.3, 26.1, 0.0)):
    c0 = er * d + et * u
    crate.put(frame_box(c0, et, UP, er, -0.5, 0.5, 0.05 + hgt, 0.95 + hgt, -0.5, 0.5))
    lid.put(frame_box(c0, et, UP, er, -0.42, 0.42, 0.95 + hgt, 0.97 + hgt, -0.42, 0.42))
Acc.of("planter", 0.01).put(frame_box(er * 26.05, et, UP, er, -2.2, 2.0, 0.0, 0.05, -0.6, 0.6))   # pallet

# ================= colliders: drum, dome, lantern =================
col((0, -1.0, 0), shape="cyl", r=RD + 0.15, h=HD + 1.3)
col((0, HD, 0), shape="sphere", r=R + 0.15)
col((0, YC - 0.2, 0), shape="cyl", r=RC + 0.4, h=4.0)

made = flush_all(ROOT, PFX)
audit_coplanar(made)
audit_flips(made)
print(f"hydroponics: {tri_count(made)} triangles in {len(made)} meshes, {NCOL[0]} colliders")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
