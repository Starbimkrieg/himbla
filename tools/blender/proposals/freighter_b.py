# PROPOSAL B for the large freighter: "GIRDER", an open-truss spine hauler.
#
# Same size, same rig (legs, belly ramp, lift jets, a walkable roof with a landing pad, four engine bells, four cargo slots down
# each flank) but a different build: the hull is a long box truss (corner chords, posts and X-bracing, with the fuel tanks and a
# dark core visible through it) under a gratinged landing deck; a banded cylindrical command module with a glass belt and a docking
# collar at the bow; box and tank containers hung on swing-clamp arms with transfer couplings; a round nacelle stern with a diamond
# of four bells and heat-sink fin stacks.
#
#   MOONRUNNER_REPO=<repo> python3 freighter_b.py [<out-prefix for previews>]      (or exec() it in Blender)
# Authored in three.js axes (x right, y up, +z nose), origin = hull centre, belly y = -5, deck top y = +5, like the current ship.

import bpy, bmesh, math, os, sys
from mathutils import Vector, Euler

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", "..", ".."))
os.environ["MOONRUNNER_REPO"] = REPO
_src = open(os.path.join(REPO, "tools", "blender", "build_ships.py"), encoding="utf-8").read()
exec(_src[:_src.index("# SHUTTLE-BUS")], globals())   # the shared helpers, slots, leg / bay / plume builders
COLL = "MoonFreighterB"
C = coll()
PI = math.pi

GEAR_F = 10.0
BELLY_F = -5.0
F = ship_root("freighter")
FR, FH = F["root"], F["_hull"]


def M(name, geo, slot, parent=None, ink=0.06):
    return mesh("b_" + name, geo, slot, parent or FH, ink)


def RB(name, h, pos, slot, parent=None, ink=0.05, e=0.12, rot=(0, 0, 0), nu=8, nv=4):
    return M(name, xf(rbox(h[0], h[1], h[2], e, nu, nv), pos, rot), slot, parent, ink)


def Z(geo, pos, up=(0, 0, 0)):
    """Lay a lathe (made about y) along +z (its y becomes z), then move it."""
    return xf(geo, pos, (PI / 2, 0, 0))


# ================= the truss spine: z -27 .. +11 =================
TZ0, TZ1 = -27.0, 11.0
PANEL = (TZ1 - TZ0) / 8            # 4.75 m: the posts
PZ = [TZ0 + PANEL * k for k in range(9)]
TW = 5.2                           # the chords' x
TOP, BOT = 4.4, -4.5
# the dark core behind the lattice, so it reads as depth
RB("core", (0.9, 4.2, 18.4), (0, -0.1, (TZ0 + TZ1) / 2), "bay", ink=0, e=0.1)   # (a slim spine, so the tanks beside it show)
for side in (-1, 1):
    for y, w in ((TOP, 0.5), (BOT, 0.5)):
        RB(f"chord{side}{y}", (0.5, 0.5, 19.0), (side * TW, y, (TZ0 + TZ1) / 2), "steel", ink=0.07, e=0.25)
    for k, z in enumerate(PZ):
        M(f"post{side}{k}", beam((side * TW, BOT, z), (side * TW, TOP, z), 0.24, 8), "steel", FH, 0.05)
    for k in range(8):
        a, b = PZ[k], PZ[k + 1]
        up = k % 2 == 0
        M(f"diag{side}{k}", beam((side * TW, BOT if up else TOP, a), (side * TW, TOP if up else BOT, b), 0.17, 6), "metal", FH, 0.04)
        M(f"gusset{side}{k}", xf(rbox(0.1, 0.5, 0.5, 0.3, 4, 3), (side * TW, BOT + 0.5, a + 0.45)), "dark", FH, 0.02)
for k in range(9):               # cross-beams under the deck, and across the belly with their own X-bracing
    M(f"crossT{k}", beam((-TW, TOP, PZ[k]), (TW, TOP, PZ[k]), 0.2, 6), "steel", FH, 0.04)
    M(f"crossB{k}", beam((-TW, BOT, PZ[k]), (TW, BOT, PZ[k]), 0.2, 6), "steel", FH, 0.04)
# a belly plate for the lift jets and the ramp (and a livery stripe down the middle)
RB("belly", (4.9, 0.1, 18.4), (0, BELLY_F + 0.12, (TZ0 + TZ1) / 2), "dark", ink=0.06, e=0.1)
RB("bellyStripe", (0.5, 0.05, 18.0), (0, BELLY_F + 0.03, (TZ0 + TZ1) / 2), "stripe", ink=0, e=0.3)
# the fuel tanks seen through the lattice: two long horizontal cylinders, domed, with livery bands and saddles
for side in (-1, 1):
    x = side * 2.4
    M(f"tank{side}", Z(lathe([(0, -17.6), (1.0, -17.2), (1.8, -16.5), (2.05, -15.6), (2.1, -15.0), (2.1, 15.0), (2.05, 15.6), (1.8, 16.5), (1.0, 17.2), (0, 17.6)], 24), (x, -0.3, -8.0)), "trim", FH, 0.1)
    for k, z in enumerate((-20.0, -14.5, -6.0, 3.5)):
        M(f"tankBand{side}{k}", Z(lathe([(2.09, -0.28), (2.16, -0.28), (2.16, 0.28), (2.09, 0.28)], 24), (x, -0.3, z)), "stripe", FH, 0)
    for k, z in enumerate((-21.0, -7.0, 5.0)):
        RB(f"saddle{side}{k}", (1.7, 0.5, 0.35), (x, -2.3, z), "dark", ink=0.04, e=0.3)
M("tankPipe", beam((-2.4, 1.9, -22.0), (2.4, 1.9, -22.0), 0.2, 8), "steel", FH, 0.03)
M("tankPipe2", beam((-2.4, 1.9, 4.0), (2.4, 1.9, 4.0), 0.2, 8), "steel", FH, 0.03)
M("manifold", beam((0, 1.9, -23.0), (0, 1.9, 10.0), 0.32, 10), "metal", FH, 0.04)

# ================= the gratinged landing deck =================
DK0, DK1 = -26.0, 10.6
DZC, DZH = (DK0 + DK1) / 2, (DK1 - DK0) / 2
M("deck", xf(rbox(7.0, 0.14, DZH, 0.08, 16, 4), (0, 5.0, DZC)), "deck", FH, 0.07)
for i in range(-6, 7):           # grating: thin raised slats alternate dark and steel
    M(f"slat{i}", xf(rbox(0.2, 0.025, DZH - 0.6, 0.3, 4, 2), (i * 1.0, 5.12, DZC)), "dark" if i % 2 else "steel", FH, 0)
for side in (-1, 1):
    M(f"kerb{side}", xf(rbox(0.26, 0.24, DZH, 0.3, 8, 4), (side * 6.9, 5.16, DZC)), "hazard", FH, 0)
    for k in range(9):
        z = -24.0 + k * 4.5
        M(f"lamp{side}{k}", xf(superquad(0.2, 0.2, 0.2, 1, 1, 8, 4), (side * 6.9, 5.5, z)), "window" if k % 2 else "cabin", FH, 0)
    for k in range(5):           # outriggers that carry the overhang
        z = -22.0 + k * 8.0
        M(f"outrig{side}{k}", beam((side * 4.4, 4.2, z), (side * 6.6, 4.85, z), 0.16, 6), "steel", FH, 0.03)
# the pad: a square plate with corner brackets, a ring and the H, a corner pylon light at each corner
PAD_Z = -8.0
RB("padPlate", (5.2, 0.05, 5.2), (0, 5.15, PAD_Z), "dark", ink=0.03, e=0.1)
for sx in (-1, 1):
    for sz in (-1, 1):
        M(f"padL{sx}{sz}A", xf(rbox(1.3, 0.05, 0.2, 0.3, 6, 3), (sx * 4.0, 5.2, PAD_Z + sz * 5.0)), "hazard", FH, 0)
        M(f"padL{sx}{sz}B", xf(rbox(0.2, 0.05, 1.3, 0.3, 6, 3), (sx * 5.0, 5.2, PAD_Z + sz * 4.0)), "hazard", FH, 0)
        M(f"padPylon{sx}{sz}", xf(lathe([(0, 0), (0.3, 0), (0.24, 0.5), (0.24, 0.6), (0, 0.6)], 8), (sx * 5.3, 5.15, PAD_Z + sz * 5.3)), "steel", FH, 0.02)
        M(f"padBeacon{sx}{sz}", xf(superquad(0.26, 0.26, 0.26, 1, 1, 8, 5), (sx * 5.3, 5.95, PAD_Z + sz * 5.3)), "red" if sx * sz > 0 else "green", FH, 0)
M("padRing", xf(torus(3.7, 0.18, 36, 4), (0, 5.22, PAD_Z)), "hazard", FH, 0)
M("padH", merge(xf(rbox(0.3, 0.05, 1.9, 0.3, 6, 4), (-1.15, 5.24, PAD_Z)), xf(rbox(0.3, 0.05, 1.9, 0.3, 6, 4), (1.15, 5.24, PAD_Z)), xf(rbox(1.15, 0.05, 0.28, 0.3, 6, 4), (0, 5.24, PAD_Z))), "hazard", FH, 0)
for k in range(3):
    M(f"chevron{k}", xf(extrude([(0, 0), (1.5, -1.2), (1.5, -1.9), (0, -0.7), (-1.5, -1.9), (-1.5, -1.2)], 0.1, "y"), (0, 5.2, -21.0 - k * 1.7)), "hazard", FH, 0)

# ================= the command module: a banded cylinder, a glass belt, a docking collar =================
HZ0, HY, HR = 11.0, 0.3, 5.2
HEAD = [(4.7, 0.0), (5.3, 0.35), (5.2, 1.0), (5.2, 14.0), (5.0, 15.6), (4.5, 17.4), (3.6, 19.0), (2.5, 20.4), (1.4, 21.4), (0.9, 21.9)]
M("headBulk", Z(lathe([(0, 0.0)] + HEAD, 40), (0, HY, HZ0)), "body", FH, 0.26)
M("headCap", Z(lathe([(0.9, 21.9), (0, 22.0)], 40), (0, HY, HZ0)), "trim", FH, 0.05)
# the bulkhead ring where the truss meets it
M("bulkhead", Z(lathe([(4.2, 0.0), (5.9, 0.0), (5.9, 1.0), (5.5, 1.1), (4.2, 1.1)], 40), (0, HY, HZ0 - 0.6)), "steel", FH, 0.1)
M("bulkheadBand", Z(lathe([(5.88, 0.35), (5.96, 0.35), (5.96, 0.75), (5.88, 0.75)], 40), (0, HY, HZ0 - 0.6)), "hazard", FH, 0)
for k, y in enumerate((4.0, 8.0, 12.0)):     # livery rings and rib bands
    M(f"headRing{k}", Z(lathe([(5.17, y - 0.3), (5.3, y - 0.3), (5.3, y + 0.3), (5.17, y + 0.3)], 40), (0, HY, HZ0)), "stripe" if k == 1 else "trim", FH, 0.03)
def head_r(y):
    """The hull's radius along the command module (HEAD, linearly between its points)."""
    for (r0, y0), (r1, y1) in zip(HEAD, HEAD[1:]):
        if y0 <= y <= y1:
            return r0 + (r1 - r0) * (y - y0) / ((y1 - y0) or 1)
    return HEAD[-1][0]


GY = [14.6, 15.0, 15.6, 16.2, 16.8, 17.4, 17.9]
glass = Z(lathe([(head_r(y) + 0.07, y) for y in GY] + [(head_r(y) - 0.3, y) for y in reversed(GY)], 48), (0, HY, HZ0))   # (proud of the hull all the way round)
M("headGlass", clip(glass, 1, HY + 1.4, 99), "glass", FH, 0)
for k in range(6):               # conduit runs along the cylinder, a flange where they leave the bulkhead
    a = PI * (0.12 + k * 0.152) if k < 3 else PI * (1.12 + (k - 3) * 0.152)
    pa = (math.cos(a) * 5.4, HY + math.sin(a) * 5.4)
    M(f"conduit{k}", beam((pa[0], pa[1], HZ0 + 1.2), (pa[0], pa[1], HZ0 + 13.6), 0.17, 6), "steel", FH, 0.03)
    M(f"flange{k}", xf(rbox(0.26, 0.26, 0.2, 0.3, 4, 3), (pa[0], pa[1], HZ0 + 1.3)), "dark", FH, 0.02)
M("hazardRing", Z(lathe([(5.19, 13.4), (5.27, 13.4), (5.27, 13.9), (5.19, 13.9)], 40), (0, HY, HZ0)), "hazard", FH, 0)
for side in (-1, 1):
    RB(f"plate{side}", (0.07, 0.55, 2.4), (side * 5.28, HY + 0.4, HZ0 + 9.0), "dark", ink=0.03, e=0.3)
    RB(f"plateLit{side}", (0.08, 0.36, 2.2), (side * 5.3, HY + 0.4, HZ0 + 9.0), "sign", ink=0, e=0.3)
# the dorsal command cupola and the sensor mast
RB("cupola", (2.8, 1.1, 3.2), (0, HY + HR + 0.8, HZ0 + 7.0), "trim", ink=0.14, e=0.3)
RB("cupolaGlass", (2.86, 0.4, 3.26), (0, HY + HR + 1.05, HZ0 + 7.0), "glass", ink=0, e=0.3)
RB("cupolaRoof", (2.3, 0.2, 2.6), (0, HY + HR + 2.0, HZ0 + 7.0), "dark", ink=0.04, e=0.3)
M("mast", beam((1.2, HY + HR + 2.1, HZ0 + 5.6), (1.2, HY + HR + 6.6, HZ0 + 5.2), 0.14, 6), "dark", FH, 0.03)
M("mastLight", xf(superquad(0.28, 0.28, 0.28, 1, 1, 10, 6), (1.2, HY + HR + 6.8, HZ0 + 5.2)), "white", FH, 0)
M("dishPost", beam((-1.3, HY + HR + 2.1, HZ0 + 7.2), (-1.3, HY + HR + 3.0, HZ0 + 7.2), 0.24, 8), "dark", FH, 0.03)
M("dish", xf(lathe([(0, 0.0), (1.3, 0.14), (2.0, 0.55), (2.05, 0.62), (0, 0.22)], 20), (-1.3, HY + HR + 3.2, HZ0 + 7.2), (0.5, 0, 0.3)), "white", FH, 0.05)
# RCS quads on the flanks, running lights, a docking collar with clamp arms at the nose
for side in (-1, 1):
    for dy in (-0.8, 0.8):
        RB(f"rcs{side}{dy}", (0.45, 0.35, 0.7), (side * 5.35, HY + dy, HZ0 + 3.2), "dark", ink=0.03, e=0.3)
        M(f"rcsNozzle{side}{dy}", xf(lathe([(0.1, 0), (0.28, 0.4), (0.3, 0.45)], 8), (side * 5.45, HY + dy, HZ0 + 3.9), (PI / 2, 0, 0)), "steel", FH, 0.02)
    M(f"head{side}", xf(superquad(0.7, 0.3, 0.18, 0.4, 0.5, 12, 6), (side * 1.7, HY - 1.0, HZ0 + 21.4), (0.15, side * 0.5, 0)), "window", FH, 0)
M("collar", Z(lathe([(0.9, 21.4), (1.7, 21.5), (1.9, 22.3), (1.7, 23.1), (0.5, 23.2)], 24), (0, HY, HZ0)), "dark", FH, 0.06)
M("collarRing", xf(torus(1.8, 0.14, 24, 5), (0, HY, HZ0 + 22.4), (PI / 2, 0, 0)), "hazard", FH, 0)
for k in range(4):
    a = k * PI / 2 + PI / 4
    M(f"clamp{k}", beam((math.cos(a) * 1.1, HY + math.sin(a) * 1.1, HZ0 + 21.7), (math.cos(a) * 2.1, HY + math.sin(a) * 2.1, HZ0 + 22.9), 0.14, 6), "steel", FH, 0.03)

# ================= the cargo slots: swing-clamp arms, couplings, box and tank containers =================
SLOT_Z = [PZ[1], PZ[3], PZ[5], PZ[7]]       # the middle of each pair of panels
CX = 9.5
CY = -1.0
EMPTY = {(-1, 1), (1, 2)}
BOX = {(-1, 0): "cargo0", (-1, 2): "cargo1", (-1, 3): "cargo3", (1, 0): "cargo2", (1, 1): "cargo1", (1, 3): "cargo0"}


def box_container(side, k, slot, z):
    X = side * CX
    n = f"c{side}{k}"
    RB(n, (2.6, 2.5, 4.0), (X, CY, z), slot, ink=0.12, e=0.07, nu=16, nv=6)
    for i in range(-4, 5):
        RB(f"{n}r{i}", (0.06, 2.3, 0.1), (X + side * 2.63, CY, z + i * 0.85), slot, ink=0, e=0.4, nu=4, nv=3)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                RB(f"{n}k{sx}{sy}{sz}", (0.3, 0.3, 0.32), (X + sx * 2.45, CY + sy * 2.3, z + sz * 3.8), "dark", ink=0.03, e=0.25, nu=6, nv=3)
    RB(f"{n}band", (0.07, 0.42, 3.2), (X + side * 2.66, CY + 1.2, z), "trim", ink=0, e=0.3)


def tank_container(side, k, slot, z):
    """A tank in an ISO frame: a cylinder with domed ends, a stripe, a manway, and the corner castings."""
    X = side * CX
    n = f"t{side}{k}"
    M(n, Z(lathe([(0, -3.9), (0.9, -3.8), (1.7, -3.4), (2.05, -2.9), (2.1, -2.5), (2.1, 2.5), (2.05, 2.9), (1.7, 3.4), (0.9, 3.8), (0, 3.9)], 20), (X, CY, z)), slot, FH, 0.1)
    for dz in (-1.6, 0.0, 1.6):
        M(f"{n}band{dz}", Z(lathe([(2.09, -0.12), (2.16, -0.12), (2.16, 0.12), (2.09, 0.12)], 20), (X, CY, z + dz)), "trim", FH, 0)
    M(f"{n}manway", xf(lathe([(0, 0), (0.55, 0), (0.55, 0.3), (0.4, 0.4), (0, 0.4)], 12), (X, CY + 2.05, z)), "steel", FH, 0.03)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                RB(f"{n}k{sx}{sy}{sz}", (0.3, 0.3, 0.32), (X + sx * 2.45, CY + sy * 2.3, z + sz * 3.8), "dark", ink=0.03, e=0.25, nu=6, nv=3)
    for sy in (-1, 1):   # the ISO frame: end frames and the long top and bottom rails
        for sx in (-1, 1):
            M(f"{n}rail{sy}{sx}", beam((X + sx * 2.45, CY + sy * 2.3, z - 3.8), (X + sx * 2.45, CY + sy * 2.3, z + 3.8), 0.1, 6), "steel", FH, 0.02)
    for sz in (-1, 1):
        for sx in (-1, 1):
            M(f"{n}post{sz}{sx}", beam((X + sx * 2.45, CY - 2.3, z + sz * 3.8), (X + sx * 2.45, CY + 2.3, z + sz * 3.8), 0.1, 6), "steel", FH, 0.02)
        for sy in (-1, 1):
            M(f"{n}tie{sz}{sy}", beam((X - 2.45, CY + sy * 2.3, z + sz * 3.8), (X + 2.45, CY + sy * 2.3, z + sz * 3.8), 0.1, 6), "steel", FH, 0.02)


def empty_slot(side, k, z):
    X = side * CX
    n = f"e{side}{k}"
    RB(n + "floor", (2.5, 0.12, 3.9), (X, CY - 2.4, z), "dark", ink=0.04, e=0.2)
    for sz in (-1, 1):
        RB(f"{n}g{sz}", (0.16, 2.4, 0.16), (X + side * 2.2, CY, z + sz * 3.8), "steel", ink=0.03, e=0.3)
        M(f"{n}lead{sz}", xf(extrude([(0, 0), (0.6, 0.5), (0.6, 0.0)], 0.3, "x"), (X + side * 2.2 - 0.15, CY - 2.4, z + sz * 3.8 - 0.1)), "hazard", FH, 0)


for side in (-1, 1):
    # an outer rail beam (the keeper of the tops), and the lower cradle rail
    RB(f"railTop{side}", (0.3, 0.28, 17.6), (side * 12.4, 1.85, -8.0), "trim", ink=0.05, e=0.3)
    RB(f"railTopH{side}", (0.32, 0.05, 17.6), (side * 12.4, 2.15, -8.0), "hazard", ink=0, e=0.4)
    RB(f"railLow{side}", (0.3, 0.26, 17.6), (side * 12.4, -4.3, -8.0), "steel", ink=0.05, e=0.3)
    for k, z in enumerate(SLOT_Z):
        # swing-clamp arms: two at each end of the slot, each a hinged arm with its ram, from the truss post to the container's castings
        for sz in (-1, 1):
            zp = z + sz * PANEL            # the lattice post at that end
            for sy, (yh, yc) in ((1, (1.9, 0.85)), (-1, (-3.9, -3.05))):
                M(f"arm{side}{k}{sz}{sy}", beam((side * (TW + 0.2), yh, zp), (side * (CX - 1.9), yc, z + sz * 3.7), 0.2, 8), "metal", FH, 0.04)
                M(f"ram{side}{k}{sz}{sy}", beam((side * (TW + 0.2), yh - sy * 1.4, zp), (side * (CX - 3.1), yc - sy * 0.35, z + sz * 3.5), 0.1, 6), "steel", FH, 0.02)
                M(f"hinge{side}{k}{sz}{sy}", xf(lathe([(0.28, -0.35), (0.28, 0.35)], 10), (side * (TW + 0.2), yh, zp), (PI / 2, 0, 0)), "dark", FH, 0.03)
        # transfer couplings: a power / fuel umbilical from the truss face to the container's inner face, with hose rings
        for dz in (-1.0, 1.0):
            M(f"coupler{side}{k}{dz}", beam((side * (TW + 0.5), -1.0, z + dz), (side * (CX - 2.55), -1.0, z + dz), 0.2, 8), "steel", FH, 0.03)
            M(f"couplerRing{side}{k}{dz}", xf(torus(0.3, 0.08, 10, 4), (side * (TW + 1.3), -1.0, z + dz), (0, 0, PI / 2)), "stripe", FH, 0)
        lamp = "red" if (side, k) in EMPTY else "green"
        M(f"slotLamp{side}{k}", xf(superquad(0.22, 0.22, 0.22, 1, 1, 8, 5), (side * 12.4, 2.4, z - 3.2)), lamp, FH, 0)
        RB(f"slotNo{side}{k}", (0.07, 0.3, 0.7), (side * 12.72, 1.85, z), "dark", ink=0, e=0.3)
        RB(f"slotNoLit{side}{k}", (0.08, 0.2, 0.5), (side * 12.76, 1.85, z), "sign", ink=0, e=0.3)
        if (side, k) in EMPTY:
            empty_slot(side, k, z)
        elif k % 2 == 1 if side < 0 else k % 2 == 0:
            tank_container(side, k, BOX[(side, k)], z)
        else:
            box_container(side, k, BOX[(side, k)], z)
    for zi in (-1, 1):                 # the outer posts at each end of the rails
        z = SLOT_Z[0 if zi < 0 else 3] + zi * 5.0
        RB(f"endPost{side}{zi}", (0.3, 3.2, 0.3), (side * 12.4, -1.2, z), "steel", ink=0.06, e=0.25)

# ================= the stern: a round nacelle with a diamond of four bells and heat-sink stacks =================
NZ0 = -26.4
NAC = [(5.3, 0.0), (6.0, 0.5), (6.3, 1.3), (6.35, 8.2), (6.0, 9.0), (5.2, 9.5), (0, 9.5)]
M("nacelle", Z(lathe([(0, 0)] + [(r, -y) for r, y in NAC], 44), (0, 0.3, NZ0)), "steel", FH, 0.22)
for k in range(6):
    M(f"coolRing{k}", Z(lathe([(6.3, -0.2), (6.52, -0.2), (6.52, 0.2), (6.3, 0.2)], 44), (0, 0.3, NZ0 - 1.7 - k * 1.1)), "dark", FH, 0.04)
M("nacelleBand", Z(lathe([(6.3, -0.7), (6.38, -0.7), (6.38, -1.5), (6.3, -1.5)], 44), (0, 0.3, NZ0)), "hazard", FH, 0)
M("nacelleStripe", Z(lathe([(6.3, -8.3), (6.42, -8.3), (6.42, -8.8), (6.3, -8.8)], 44), (0, 0.3, NZ0)), "stripe", FH, 0)
M("heatShield", Z(lathe([(0, 0), (6.0, 0), (6.0, 0.25), (0, 0.25)], 44), (0, 0.3, NZ0 - 9.5)), "dark", FH, 0.06)
THROAT_Z, BELL_L = NZ0 - 10.2, 5.0
bell = [(1.15, 0.0), (1.2, 0.5), (1.45, 1.8), (1.8, 3.2), (2.15, 4.4), (2.3, 4.85), (2.3, BELL_L)]
for i, (x, y) in enumerate([(0.0, 3.5), (0.0, -2.9), (-3.7, 0.3), (3.7, 0.3)]):
    M(f"pump{i}", Z(lathe([(0, 0), (1.7, 0), (1.75, -0.3), (1.6, -1.0), (1.3, -1.25), (1.2, -1.5), (0, -1.5)], 20), (x, y, NZ0 - 9.75)), "metal", FH, 0.06)
    M(f"gimbal{i}", xf(torus(1.35, 0.22, 20, 6), (x, y, THROAT_Z + 0.2), (PI / 2, 0, 0)), "stripe", FH, 0.02)
    for k in range(3):
        a = k * 2 * PI / 3 + 0.5
        M(f"act{i}{k}", beam((x + math.cos(a) * 1.6, y + math.sin(a) * 1.6, NZ0 - 9.7), (x + math.cos(a) * 1.8, y + math.sin(a) * 1.8, THROAT_Z - 1.4), 0.12, 6), "steel", FH, 0.02)
    M(f"bell{i}", xf(lathe([(r, -h) for r, h in bell], 24), (x, y, THROAT_Z), (PI / 2, 0, 0)), "dark", FH, 0.1)
    M(f"bellRing{i}", xf(torus(2.3, 0.14, 24, 6), (x, y, THROAT_Z - BELL_L), (PI / 2, 0, 0)), "stripe", FH, 0)
    M(f"bellGlow{i}", xf(lathe([(0, 0), (1.25, 0), (1.25, 0.06), (0, 0.06)], 20), (x, y, THROAT_Z - 0.4), (PI / 2, 0, 0)), "engine", FH, 0)
    M(f"bellCore{i}", xf(lathe([(0, 0), (0.7, 0), (0.7, 0.08), (0, 0.08)], 16), (x, y, THROAT_Z - 0.5), (PI / 2, 0, 0)), "core", FH, 0)
    plume(FR, f"b_plume{i}", (x, y, THROAT_Z - BELL_L - 0.05), 2.0, 13.0)
# heat-sink vanes: a V of thin panels leaning out from the nacelle's top, and swept radiator panels from its shoulders
for side in (-1, 1):
    for k in range(5):
        x0 = side * (2.7 + k * 1.05)
        RB(f"vane{side}{k}", (0.06, 2.3, 3.4), (x0, 8.3, NZ0 - 4.8), "steel", ink=0.03, e=0.3, rot=(0, 0, -side * 0.22), nu=4, nv=3)
        RB(f"vaneTip{side}{k}", (0.075, 0.1, 3.42), (x0 + side * 0.5, 10.55, NZ0 - 4.8), "stripe", ink=0, e=0.3, rot=(0, 0, -side * 0.22), nu=4, nv=3)
    RB(f"vaneBase{side}", (3.4, 0.3, 3.6), (side * 3.9, 6.15, NZ0 - 4.8), "dark", ink=0.05, e=0.3)
    for dz in (-3.0, 3.0):
        M(f"vaneStrut{side}{dz}", beam((side * 1.8, 6.2, NZ0 - 4.8 + dz), (side * 6.4, 6.2, NZ0 - 4.8 + dz), 0.14, 6), "steel", FH, 0.02)
RAD_DIH = 0.2


def wing_pt(span, up, chord, side):
    p = Vector((span, up, -chord))
    p.rotate(Euler((0, 0, RAD_DIH)))
    return (side * (p.x + 6.6), p.y + 1.2, p.z + NZ0 - 1.0)


for side in (-1, 1):
    wing = [(0.0, 0.0), (5.0, 0.0), (11.0, 2.4), (11.0, 6.0), (4.5, 7.2), (0.0, 7.2)]
    verts, faces = extrude(wing, 0.5, "y")
    out = [wing_pt(vx, vy, vz, side) for vx, vy, vz in verts]
    M(f"rad{side}", (out, [tuple(reversed(f)) for f in faces] if side < 0 else faces), "steel", FH, 0.12)
    for k in range(5):
        sp = 1.5 + k * 2.0
        lead = 2.4 * max(0.0, sp - 5.0) / 6.0 + 0.5
        trail = 7.0 if sp < 4.5 else 7.0 - (sp - 4.5) * (1.4 / 6.5)
        M(f"radFin{side}{k}", beam(wing_pt(sp, 0.3, lead, side), wing_pt(sp, 0.3, trail, side), 0.12, 4), "stripe", FH, 0)
    M(f"radEdge{side}", beam(wing_pt(5.0, 0.0, 0.0, side), wing_pt(11.0, 0.0, 2.4, side), 0.28, 6), "trim", FH, 0.04)
    M(f"navLight{side}", xf(superquad(0.5, 0.5, 0.5, 1, 1, 10, 6), wing_pt(11.2, 0.0, 4.0, side)), "green" if side > 0 else "red", FH, 0)
M("tailLight", xf(superquad(0.35, 0.35, 0.35, 1, 1, 10, 6), (0, 6.9, NZ0 - 1.0)), "white", FH, 0)

# ================= belly: lift jets, keels, legs, the ramp =================
for i, (x, z) in enumerate([(-3.0, 7.0), (3.0, 7.0), (-3.0, -21.0), (3.0, -21.0)]):
    M(f"grille{i}", xf(rbox(1.25, 0.08, 1.25, 0.2, 10, 4), (x, BELLY_F - 0.04, z)), "dark", FH, 0.03)
    M(f"grilleLit{i}", xf(rbox(1.0, 0.08, 1.0, 0.2, 10, 4), (x, BELLY_F - 0.08, z)), "engine", FH, 0)
    plume(FR, f"b_lift{i}", (x, BELLY_F - 0.12, z), 1.0, 6.5, axis="y")
for side in (-1, 1):
    M(f"keel{side}", xf(rbox(0.28, 0.3, 14.0, 0.3), (side * 5.0, BELLY_F + 0.1, -4.0)), "dark", FH, 0.05)
HF = BELLY_F + 0.7
leg_f = (GEAR_F + BELLY_F) + 0.7
for name, (x, z) in (("b_legFL", (-5.0, 8.4)), ("b_legFR", (5.0, 8.4)), ("b_legRL", (-5.0, -22.0)), ("b_legRR", (5.0, -22.0))):
    landing_leg(FR, name, (x, HF, z), leg_f, 1.57, r=0.55, pad=1.7, ink=0.08, scale=2.2)
    gear_bay(F, name + "Bay", x, BELLY_F, z + 0.9, z - leg_f - 1.6, 2.8, ink=0.05)
F_RAMP_H = (0, BELLY_F - 0.05, -4.0)
F_RAMP_L = 11.0
f_drop = GEAR_F + BELLY_F - 0.15
f_open = -math.asin(min(1.0, f_drop / F_RAMP_L))
FRamp = pivot("b_ramp", F_RAMP_H, FR, role="ramp", closed=0.0, opened=f_open)
M("rampPlate", xf(rbox(2.3, 0.16, F_RAMP_L / 2, 0.1, 12, 4), (0, 0, -F_RAMP_L / 2)), "trim", FRamp, 0.07)
for k in range(9):
    M(f"rampRib{k}", xf(rbox(2.0, 0.06, 0.1, 0.4, 6, 4), (0, 0.17, -0.8 - k * 1.2)), "dark", FRamp, 0)
for side in (-1, 1):
    M(f"rampEdge{side}", xf(rbox(0.12, 0.08, F_RAMP_L / 2 - 0.15, 0.4, 6, 4), (side * 2.15, 0.18, -F_RAMP_L / 2)), "hazard", FRamp, 0)
M("rampBay", xf(rbox(2.45, 0.06, F_RAMP_L / 2 + 0.1, 0.1, 12, 4), (0, BELLY_F + 0.04, -4.0 - F_RAMP_L / 2)), "bay", FH, 0)
FHatch = pivot("b_hatch", (0, BELLY_F + 0.08, -4.0 - F_RAMP_L / 2), FR, role="hatch")
M("hatchLight", rbox(2.2, 0.03, F_RAMP_L / 2 - 0.2, 0.2, 10, 4), "cabin", FHatch, 0)

FR["gearH"] = GEAR_F
FR["deck"] = [7.0, 2.6, DZH]
FR["deckY"] = 2.5
FR["deckZ"] = DZC
FR["inside"] = [0, -4.6, -1.5]
FR["rampTop"] = [0, -5.0, -4.4]
FR["rampBottom"] = [0, BELLY_F - 0.05 - F_RAMP_L * math.sin(-f_open), -4.0 - F_RAMP_L * math.cos(f_open) - 0.6]
FR["radius"] = 26.0
FR["padR"] = 21.0
print("freighter B:", len(C.objects), "objects,", sum(len(o.data.polygons) for o in C.objects if o.type == "MESH"), "polygons")

if __name__ == "__main__" or "__file__" not in globals():
    if len(sys.argv) > 1 and not sys.argv[-1].endswith(".py"):
        exec(open(os.path.join(REPO, "tools", "blender", "proposals", "preview.py"), encoding="utf-8").read(), globals())
        render_views(FR, sys.argv[-1])
