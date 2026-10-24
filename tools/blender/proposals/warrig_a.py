# PROPOSAL A for the Rustmoon War-Rig: "FURNACE", a big-rig tractor head on monster-truck legs, its fusion core out in the
# open.
#
# Laid out like a conventional truck: a long hood with a barred grille and a rounded nose, the cab behind it, two heat
# stacks behind the cab, a short rear deck. Under it two solid axles, each corner hung from one long coilover inside its
# own hoop (exaggerated lift and track for low-gravity jumps), on balloon tyres whose deep chevron lugs are modelled into the
# tyre, under arched fenders. The middle of the hood is open over a stolen tokamak: a ring of ion-blue plasma inside eight
# copper field coils on a cradle round a central solenoid (it pokes up through the guard bars), three open injector valves
# spitting sparks, copper cooling coils along the bay to the louvred hood sides, plasma conduits under the ring into the
# cab. The cab is armoured: the driver's two slits sit in the left half of the windscreen, caged; the right half is plated
# over round a single caged porthole. The left side has the door (painted, a caged slit) over a step box; the right a
# coolant tank on the frame, a utility rack on the cab wall and a full-height ladder to the roof. Over the cab a ring mount
# carries a standing pirate gunner behind a drum-fed five-barrel rotary (a 10-round burst is two turns of the cluster),
# with a notched salvage-plate shield and an IR laser sight. Lights: a visor bar of LEDs over the windscreen, a big
# searchlight on the left pillar, a small one on the rack, mismatched headlamps on the front fenders, pod lamps on the
# bull bar. A plow of raked blades with ramming teeth leads. The deck carries two He-3 tanks under frayed MLI blankets, a
# relay dish and antenna needles; the flag flies from the back corner. RCS quads sit on the four frame ends. Little paint:
# bleached plate, primer and bare metal, the door and front fenders in sun-faded faction paint; the faction's green and
# violet only glow (viewports, LED strips, the underglow).
#
#   MOONRUNNER_REPO=<repo> python3 tools/blender/proposals/warrig_a.py [out.glb]       (or exec() it in Blender)
#
# Frame (three.js axes, metres, before the game's 1.35 scale): origin on the ground in the middle, +z forward.
# Wheels at (+-2.2, 1.05, 2.6 / -2.3), radius 1.05 (root `wheelRadius`), 0.86 wide. Root `radius` 4.0.
# Pivots: warrig (root) > chassis > turret (yaw about y, at the ring, (0, 4.12, -0.05)) > barrel (pitch about x) > muzzle
# (empty at the barrels' mouth); turret > crew (empty: where the gunner stands, facing +z, `pose` stand); chassis >
# spot0..1 (empties: searchlight beams, `aim` = direction), flag (empty at the pole's tip: the game hangs its waving cloth
# there, `w` x `h`, streaming back along -z). Four wheel pivots under the root.
# Livery slots: body (painted panels), lens (glows in the trim colour), underglow (glows in the body colour).
# Ends with clash_check(): parts that cut through each other, with the turret swung through its travel.

import bpy, math, os, sys

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", "..", ".."))
COLL = "WarRigA"
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "proposals", "warrig_kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)

P = "wa_"
WX, WY, WR, HW = 2.2, 1.05, 1.05, 0.43
ZF, ZR = 2.6, -2.3      # axles
ROOF = 4.1
CF, CB = 1.0, -0.8      # cab front and back
HOOD = 3.75             # hood front
ROOT = pivot("warrig", (0, 0, 0), None, proposal="a")
CH = pivot(P + "chassis", (0, 0, 0), ROOT, role="chassis")
A = Acc(P)


def fender(c_z, a0, a1, slot, x0=1.74, x1=2.72, r=1.2, t=0.05, n=10):
    """an arched fender over a wheel: a band of plate round the axle from angle a0 to a1 (from the top, + towards the nose)"""
    verts, faces = [], []
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        for x in (x0, x1):
            for rr in (r, r + t):
                verts.append((x, WY + math.cos(a) * rr, c_z + math.sin(a) * rr))
    o = lambda k, xi, ri: k * 4 + xi * 2 + ri
    for k in range(n):
        faces.append((o(k, 0, 1), o(k, 1, 1), o(k + 1, 1, 1), o(k + 1, 0, 1)))
        faces.append((o(k, 1, 0), o(k, 0, 0), o(k + 1, 0, 0), o(k + 1, 1, 0)))
        faces.append((o(k, 0, 0), o(k, 0, 1), o(k + 1, 0, 1), o(k + 1, 0, 0)))
        faces.append((o(k, 1, 1), o(k, 1, 0), o(k + 1, 1, 0), o(k + 1, 1, 1)))
    faces.append((o(0, 0, 0), o(0, 1, 0), o(0, 1, 1), o(0, 0, 1)))
    faces.append((o(n, 0, 1), o(n, 1, 1), o(n, 1, 0), o(n, 0, 0)))
    for sx in (-1, 1):
        A.add(xf((verts, faces), s=(sx, 1, 1)), slot, CH, 0.03)


# ---------------- frame ----------------
part("frame")
for sx in (-1, 1):
    A.add(bx((sx * 0.62, 1.95, 0.325), (0.09, 0.14, 3.625)), "dark", CH, 0.03)
for z in (3.85, 1.0, -0.8, -3.2):
    A.add(bx((0, 1.95, z), (0.62, 0.1, 0.08)), "dark", CH, 0.02)
part("underglow")
for sx in (-1, 1):
    A.add(beam((sx * 0.45, 1.835, -1.0), (sx * 0.45, 1.835, 1.3), 0.025, 6), "underglow", CH, 0)

# ---------------- axles and suspension: a coilover in its own hoop at each corner ----------------
for z, nm in ((ZF, "F"), (ZR, "R")):
    sz = 1 if z > 0 else -1
    part("axle" + nm)
    A.add(beam((-1.78, WY, z), (1.78, WY, z), 0.13, 8), "dark", CH, 0.03)
    A.add(xf(superquad(0.3, 0.27, 0.27, 0.6, 0.6, 10, 6), (0.28 * sz, WY, z)), "steel", CH, 0.025)
    for sx in (-1, 1):
        c = nm + ("L" if sx < 0 else "R")
        part("links" + c)
        A.add(beam((sx * 0.85, WY - 0.02, z), (sx * 0.62, 1.86, z - sz * 1.3), 0.06, 6), "steel", CH, 0.015)
        A.add(beam((sx * 0.35, WY + 0.12, z), (sx * 0.62, 2.0, z - sz * 1.0), 0.05, 6), "steel", CH, 0.015)
        part("bumpstop" + c)
        A.add(cyl((sx * 0.62, 1.62, z), 0.08, 0.36, 8), "dark", CH, 0.01)
        part("hoop" + c)
        for dz in (-0.35, 0.35):
            A.add(bx((sx * 1.105, 2.0, z + dz), (0.395, 0.06, 0.05)), "dark", CH, 0.015)
            A.add(beam((sx * 1.5, 1.94, z + dz), (sx * 1.5, 3.26, z + dz), 0.065, 6), "dark", CH, 0.015)
            A.add(bx((sx * 1.61, 2.2, z + dz), (0.11, 0.03, 0.04)), "dark", CH, 0.008)   # fender bracket
        A.add(beam((sx * 1.5, 3.2, z - 0.42), (sx * 1.5, 3.2, z + 0.42), 0.065, 6), "dark", CH, 0.015)
        part("shock" + c)
        coilover(A, CH, (sx * 1.5, WY + 0.14, z), (sx * 1.5, 3.13, z), 0.17, 5)
part("fenders")
fender(ZF, -0.62, 1.22, "body")
fender(ZR, -1.22, 0.62, "metal")

# ---------------- hood: a truck nose, open over the reactor ----------------
part("hood")
side = [(CF, 2.2), (HOOD, 2.2), (HOOD, 2.9), (HOOD - 0.15, 3.07), (HOOD - 0.45, 3.14), (CF, 3.22)]
for sx in (-1, 1):
    A.add(xf(extrude(side, 0.08, "x"), (sx * 0.98, 0, 0)), "primer", CH, 0.05)
    # coolant louvres down the hood side
    A.add(join([bx((sx * 1.025, 2.82, 1.45 + 0.2 * k), (0.02, 0.16, 0.05), (0, 0, 0), ) for k in range(7)]), "dark", CH, 0)
    A.add(join([bx((sx * 1.04, 2.85, 1.45 + 0.2 * k), (0.015, 0.15, 0.025), (0.5, 0, 0)) for k in range(7)]), "metal", CH, 0)
    A.add(bx((sx * 1.025, 2.3, (CF + HOOD) / 2), (0.012, 0.03, (HOOD - CF) / 2 - 0.05)), "lens", CH, 0)   # a low LED strip
A.add(bx((0, 3.11, 3.37), (1.02, 0.04, 0.38), (-0.12, 0, 0)), "primer", CH, 0.04)      # the nose's closed top
A.add(bx((0, 3.21, 1.08), (1.02, 0.03, 0.1)), "primer", CH, 0.03)                       # the cowl lip
A.add(bx((0, 2.15, 2.375), (0.94, 0.05, 1.37)), "dark", CH, 0.03)                       # the bay floor
# grille: a frame, nine bars, a dark face behind
A.add(bx((0, 2.6, HOOD + 0.01), (0.92, 0.42, 0.02)), "dark", CH, 0)
for p, q in (((-0.95, 2.2, HOOD + 0.06), (0.95, 2.2, HOOD + 0.06)), ((-0.95, 3.0, HOOD + 0.06), (0.95, 3.0, HOOD + 0.06)),
             ((-0.95, 2.2, HOOD + 0.06), (-0.95, 3.0, HOOD + 0.06)), ((0.95, 2.2, HOOD + 0.06), (0.95, 3.0, HOOD + 0.06))):
    A.add(beam(p, q, 0.05, 4), "metal", CH, 0.012)
A.add(join([beam((-0.8 + 0.2 * k, 2.25, HOOD + 0.05), (-0.8 + 0.2 * k, 2.95, HOOD + 0.05), 0.03, 4) for k in range(9)]), "metal", CH, 0.006)
# guard bars over the open bay
part("guard")
for x in (-0.6, 0.6):
    A.add(beam((x, 3.24, CF + 0.1), (x, 3.12, 3.02), 0.04, 6), "dark", CH, 0.01)
for z in (1.3, 2.75):
    A.add(beam((-0.97, 3.2 - 0.04 * (z - 1.3), z), (0.97, 3.2 - 0.04 * (z - 1.3), z), 0.035, 6), "dark", CH, 0.008)

CORE = (0.0, 2.8, 2.05)
cx, cy, cz = CORE
part("core")
A.add(xf(torus(0.56, 0.13, 18, 6), CORE), "plasma", CH, 0)
for k in range(8):
    f = TAU * k / 8 + PI / 8
    A.add(xf(torus(0.24, 0.05, 10, 4), (cx + math.sin(f) * 0.56, cy, cz + math.cos(f) * 0.56), (PI / 2, f + PI / 2, 0)), "copper", CH, 0.012)
A.add(xf(torus(0.56, 0.04, 24, 4), (cx, cy - 0.29, cz)), "dark", CH, 0.008)
for k in range(4):
    f = TAU * k / 4 + PI / 4
    A.add(beam((cx + math.sin(f) * 0.56, cy - 0.29, cz + math.cos(f) * 0.56), (cx + math.sin(f) * 0.64, 2.2, cz + math.cos(f) * 0.64), 0.04, 4), "dark", CH, 0.008)
A.add(cyl((cx, 2.31, cz), 0.2, 0.22, 12), "dark", CH, 0.015)
A.add(cyl((cx, cy, cz), 0.17, 0.8, 12), "steel", CH, 0.015)
for y in (-0.22, 0.0, 0.22):
    A.add(cyl((cx, cy + y, cz), 0.2, 0.08, 12), "copper", CH, 0.008)
A.add(cyl((cx, cy + 0.45, cz), 0.12, 0.1, 10, rt=0.06), "dark", CH, 0.01)
part("injectors")
for k, f in enumerate((0.0, 3 * PI / 4, 5 * PI / 4)):
    p = (cx + math.sin(f) * 0.56, cy + 0.12, cz + math.cos(f) * 0.56)
    A.add(cyl((p[0], p[1] + 0.13, p[2]), 0.055, 0.26, 8), "steel", CH, 0.01)
    A.add(xf(torus(0.072, 0.018, 10, 3), (p[0], p[1] + 0.24, p[2])), "red", CH, 0.006)
    g = f + PI / 8      # a strut to the top of the next field coil holds the valve
    A.add(beam((p[0], p[1] + 0.05, p[2]), (cx + math.sin(g) * 0.56, cy + 0.27, cz + math.cos(g) * 0.56), 0.025, 4), "dark", CH, 0.006)
    nz = (p[0] - math.sin(f) * 0.12, p[1] + 0.2, p[2] - math.cos(f) * 0.12)
    A.add(beam((p[0], p[1] + 0.2, p[2]), nz, 0.035, 6), "dark", CH, 0.008)
    for j in range(4):
        d = 0.08 + 0.06 * j
        A.add(octa((nz[0] - math.sin(f) * d + 0.025 * ((j * 3 + k) % 3 - 1), nz[1] + 0.03 * j - 0.012 * j * j, nz[2] - math.cos(f) * d), 0.034 - 0.004 * j), "ion", CH, 0)
part("coolcoils")
for sx in (-1, 1):
    A.add(coil_spring((sx * 0.8, 2.36, 2.9), (sx * 0.8, 2.36, 1.2), 0.09, 6, 0.026, 5), "copper", CH, 0.008)
    A.add(beam((sx * 0.8, 2.36, 3.0), (sx * 0.8, 2.36, CF), 0.06, 6), "steel", CH, 0.008)
    A.add(beam((sx * 0.8, 2.36, 2.95), (sx * 0.95, 2.36, 2.95), 0.035, 6), "copper", CH, 0.006)
part("conduits")
for sx in (-1, 1):
    path = [(sx * 0.12, 2.32, 1.95), (sx * 0.3, 2.32, 1.55), (sx * 0.42, 2.32, 1.2), (sx * 0.45, 2.32, 0.95)]
    A.add(tube(path, [0.065] * 4, 6), "plasma", CH, 0)
    A.add(xf(torus(0.085, 0.022, 10, 4), (sx * 0.36, 2.32, 1.4), (PI / 2, 0, 0)), "steel", CH, 0.006)

# ---------------- front: bull bar with pod lamps, a plow of raked blades, headlamps on the fenders ----------------
part("bullbar")
A.add(tube([(-1.1, 2.15, HOOD + 0.12), (-1.15, 3.0, HOOD + 0.22), (1.15, 3.0, HOOD + 0.22), (1.1, 2.15, HOOD + 0.12)], [0.06] * 4, 6), "dark", CH, 0.02)
for x in (-0.75, 0.75):
    A.add(beam((x, 2.95, HOOD + 0.2), (x, 2.95, HOOD + 0.04), 0.03, 4), "dark", CH, 0)
searchlight(A, CH, (-0.75, 3.17, HOOD + 0.25), 0.12, (0, -0.1, 1), yoke=True, cage=False)
A.add(bx((0.75, 3.13, HOOD + 0.22), (0.16, 0.09, 0.07)), "dark", CH, 0.015)
A.add(bx((0.75, 3.13, HOOD + 0.295), (0.13, 0.065, 0.008)), "lamp", CH, 0)
A.add(beam((0.75, 3.04, HOOD + 0.22), (0.75, 2.98, HOOD + 0.22), 0.04, 4), "steel", CH, 0)
part("plow")
A.add(beam((-1.3, 2.05, 3.98), (1.3, 2.05, 3.98), 0.08, 6), "dark", CH, 0.02)
for k in range(7):
    x = -1.08 + 0.36 * k
    A.add(bx((x, 1.78, 4.12), (0.15, 0.46, 0.035), (-0.45, 0, 0)), "bleach" if k % 2 else "metal", CH, 0.02)
    spike(A, CH, (x, 1.42, 4.33), (0, -0.3, 1), 0.36, 0.08)
for sx in (-1, 1):
    A.add(beam((sx * 0.62, 1.95, 3.9), (sx * 0.62, 1.5, 4.25), 0.05, 4), "dark", CH, 0.01)
part("headlamps")
# on stalks off the front fenders: a round one on the left, a square one on the right
for sx in (-1, 1):
    A.add(beam((sx * 2.2, 2.16, 3.15), (sx * 2.2, 2.26, 3.15), 0.035, 6), "steel", CH, 0.006)
A.add(xf(lathe([(0, -0.14), (0.15, -0.1), (0.17, 0.06), (0.15, 0.08), (0, 0.08)], 10), (-2.2, 2.4, 3.15), (PI / 2, 0, 0)), "dark", CH, 0.012)
A.add(xf(cyl((0, 0, 0), 0.14, 0.02, 10), (-2.2, 2.4, 3.23), (PI / 2, 0, 0)), "lamp", CH, 0)
A.add(bx((2.2, 2.35, 3.15), (0.15, 0.1, 0.1)), "dark", CH, 0.012)
A.add(bx((2.2, 2.35, 3.25), (0.12, 0.075, 0.01)), "lamp", CH, 0)
# RCS quads on the four frame ends, fed back along the rails
for z, nm in ((3.72, "F"), (-3.2, "R")):
    sz = 1 if z > 0 else -1
    for sx in (-1, 1):
        part("rcs" + nm + ("L" if sx < 0 else "R"))
        A.add(bx((sx * 1.0, 1.95, z), (0.38, 0.07, 0.07)), "dark", CH, 0.015)
        rcs_pod(A, CH, (sx * 1.42, 1.98, z), (sx, 0, 0), feed=(sx * 0.7, 1.98, z - sz * 0.25))

# ---------------- cab: armoured, a slit windscreen ----------------
part("cab")
cab = [(CB, 2.2), (CF, 2.2), (CF, 3.25), (0.8, 4.02), (0.72, ROOF), (CB, ROOF)]
A.add(extrude(cab, 2.3, "x"), "primer", CH, 0.07)
ws = math.atan2(0.2, 0.77)                    # the windscreen's rake
fw = (0, math.sin(ws), math.cos(ws))
up = (0, math.cos(ws), -math.sin(ws))
wz = lambda y: CF - 0.2 * (y - 3.25) / 0.77    # windscreen z at height y
plate(A, CH, (-0.58, 3.64, wz(3.64) + 0.035), (0.54, 0.36, 0.03), (-ws, 0, 0), slot="bleach", ink=0.02, bolts=2)
plate(A, CH, (0.58, 3.64, wz(3.64) + 0.035), (0.54, 0.36, 0.03), (-ws, 0, 0), slot="metal", ink=0.02, bolts=3)
A.add(xf(bx((0, 0, 0), (0.05, 0.4, 0.05)), (0.0, 3.64, wz(3.64) + 0.06), (-ws, 0, 0)), "dark", CH, 0.01)
for x, w in ((-0.78, 0.15), (-0.36, 0.1)):
    viewport(A, CH, (x, 3.78, wz(3.78) + 0.07), w, 0.04, fw, up, bars=(2 if w > 0.12 else 1, 1))
viewport(A, CH, (0.62, 3.72, wz(3.72) + 0.07), 0.07, 0.07, fw, up, round_=True, bars=(1, 1))
A.add(bx((0, 2.75, CF + 0.03), (1.0, 0.45, 0.03)), "bleach", CH, 0.02)       # the cowl's armour plate
for x in (-1.15, 1.15):
    for z in (CF, CB):
        A.add(bx((x, (2.2 + (3.25 if z > 0 else ROOF)) / 2, z), (0.035, ((3.25 if z > 0 else ROOF) - 2.2) / 2, 0.035)), "dark", CH, 0.01)
A.add(bx((0, 3.15, CB - 0.03), (1.05, 0.85, 0.03)), "bleach", CH, 0.02)
for x in (-0.6, 0.0, 0.6):
    A.add(bx((x, 3.15, CB - 0.07), (0.035, 0.8, 0.012)), "dark", CH, 0.006)
A.add(bx((0, ROOF + 0.02, 0.7), (0.95, 0.012, 0.014)), "lens", CH, 0)        # green LED strip along the brow
# visor light bar over the windscreen, a big searchlight on the left pillar
part("visor")
A.add(tube([(-1.0, ROOF, 0.6), (-1.0, ROOF + 0.18, 0.86), (1.0, ROOF + 0.18, 0.86), (1.0, ROOF, 0.6)], [0.04] * 4, 6), "dark", CH, 0.012)
ledbar(A, CH, (-0.42, ROOF + 0.26, 0.9), 6, 0.12, (0.08, 0, 0.0))
ledbar(A, CH, (0.6, ROOF + 0.28, 0.9), 3, 0.11, (0.12, 0, -0.04), h=0.1)
part("pillarlight")
A.add(beam((-1.15, 3.78, 0.82), (-1.45, 3.78, 0.82), 0.04, 6), "dark", CH, 0.01)
searchlight(A, CH, (-1.45, 4.07, 0.82), 0.24, (-0.12, -0.3, 1))
pivot(P + "spot0", (-1.45, 4.07, 1.02), CH, role="spot", aim=(-0.12, -0.3, 1.0), r=0.24)
# mirrors on both doors' leading edges
part("mirrors")
for sx in (-1, 1):
    A.add(tube([(sx * 1.15, 3.3, 0.9), (sx * 1.45, 3.35, 0.95), (sx * 1.52, 3.4, 0.95)], [0.022] * 3, 4), "steel", CH, 0.006)
    A.add(bx((sx * 1.56, 3.4, 0.95), (0.05, 0.16, 0.08), (0, sx * 0.3, 0)), "dark", CH, 0.01)

# the left: the door over a step box
part("door")
A.add(bx((-1.185, 3.05, 0.1), (0.035, 0.75, 0.55)), "body", CH, 0.025)
for p, q in (((-1.21, 2.28, -0.48), (-1.21, 2.28, 0.68)), ((-1.21, 3.82, -0.48), (-1.21, 3.82, 0.68)),
             ((-1.21, 2.28, -0.48), (-1.21, 3.82, -0.48)), ((-1.21, 2.28, 0.68), (-1.21, 3.82, 0.68))):
    A.add(beam(p, q, 0.035, 4), "dark", CH, 0.008)
for y in (2.55, 3.05, 3.55):
    A.add(cyl((-1.24, y, 0.64), 0.04, 0.18, 8), "steel", CH, 0.008)
A.add(tube([(-1.22, 3.0, -0.38), (-1.3, 3.0, -0.36), (-1.3, 2.8, -0.36)], [0.025] * 3, 4), "steel", CH, 0.006)
viewport(A, CH, (-1.24, 3.58, 0.1), 0.15, 0.045, (-1, 0, 0), bars=(2, 1))
A.add(tube([(-1.16, 2.5, -0.62), (-1.28, 2.52, -0.62), (-1.28, 3.5, -0.62), (-1.16, 3.52, -0.62)], [0.025] * 4, 4), "steel", CH, 0.006)
part("stepbox")
A.add(bx((-1.03, 1.78, 0.1), (0.3, 0.24, 0.55)), "primer", CH, 0.02)
for y in (1.92, 1.6):
    A.add(bx((-1.36, y, 0.1), (0.04, 0.02, 0.4)), "metal", CH, 0.008)
    A.add(bx((-1.35, y - 0.06, 0.1), (0.012, 0.05, 0.4)), "dark", CH, 0)
A.add(bx((-1.03, 2.03, 0.1), (0.31, 0.012, 0.56)), "metal", CH, 0)

# the right: a coolant tank on the frame, a utility rack on the cab wall, the ladder to the roof
part("tank")
A.add(cyl((1.05, 1.75, 0.15), 0.31, 0.9, 14, rot=(PI / 2, 0, 0)), "tank", CH, 0.03)
for sz in (-1, 1):
    A.add(xf(superquad(0.31, 0.31, 0.08, 1, 0.6, 14, 3), (1.05, 1.75, 0.15 + sz * 0.45)), "tank", CH, 0.015)
for z in (-0.12, 0.42):
    A.add(xf(torus(0.33, 0.025, 14, 3), (1.05, 1.75, z), (PI / 2, 0, 0)), "dark", CH, 0.006)
    A.add(bx((0.8, 1.75, z), (0.1, 0.05, 0.04)), "dark", CH, 0)
A.add(bx((1.05, 2.075, 0.15), (0.18, 0.012, 0.36)), "metal", CH, 0)
A.add(tube([(1.05, 2.0, 0.6), (1.0, 2.15, 0.85), (0.8, 2.36, 1.15)], [0.035] * 3, 6), "copper", CH, 0.006)
part("rack")
for x in (1.19, 1.55):
    for z in (-0.12, 0.72):
        A.add(beam((x, 2.15, z), (x, 3.62, z), 0.03, 6), "dark", CH, 0.008)
for y in (2.18, 2.92, 3.6):
    A.add(bx((1.37, y, 0.3), (0.2, 0.022, 0.44)), "metal", CH, 0.012)
part("rackgear")
for k, z in enumerate((-0.0, 0.18)):
    A.add(bx((1.36, 2.4, z), (0.14, 0.2, 0.07)), "primer", CH, 0.012)
A.add(bx((1.36, 2.3, 0.5), (0.15, 0.1, 0.17)), "red", CH, 0.012)
A.add(bx((1.36, 2.41, 0.5), (0.16, 0.012, 0.18)), "dark", CH, 0)
A.add(xf(torus(0.15, 0.035, 12, 4), (1.36, 2.977, 0.12)), "dark", CH, 0.01)
A.add(cyl((1.42, 3.12, 0.55), 0.07, 0.34, 8), "red", CH, 0.01)
part("rackLight")
searchlight(A, CH, (1.37, 3.81, 0.6), 0.14, (0.3, -0.3, 1))
pivot(P + "spot1", (1.37, 3.81, 0.72), CH, role="spot", aim=(0.3, -0.3, 1.0), r=0.14)
part("ladder")
for z in (-0.76, -0.42):
    A.add(tube([(1.27, 1.35, z), (1.27, ROOF + 0.45, z), (1.05, ROOF + 0.55, z), (0.85, ROOF + 0.02, z)], [0.04] * 4, 6), "bleach", CH, 0.012)
    for y in (2.4, 3.5):
        A.add(beam((1.27, y, z), (1.15, y, z), 0.02, 4), "dark", CH, 0)
for k in range(10):
    A.add(beam((1.27, 1.5 + 0.3 * k, -0.76), (1.27, 1.5 + 0.3 * k, -0.42), 0.025, 4), "steel", CH, 0.006)

# heat stacks behind the cab (they dump the reactor's coolant heat), bent out at the top under the gun's sweep
part("stacks")
for sx, top in ((-1, ROOF + 0.45), (1, ROOF + 0.3)):
    x = sx * 0.98
    A.add(tube([(x, 2.15, CB - 0.2), (x, top, CB - 0.2), (x + sx * 0.18, top + 0.12, CB - 0.2)], [0.11, 0.11, 0.11], 8), "steel", CH, 0.02)
    A.add(cyl((x, 3.1, CB - 0.2), 0.15, 0.9, 8), "metal", CH, 0.015)
    A.add(join([bx((x + sx * 0.0, 2.75 + 0.12 * k, CB - 0.36), (0.1, 0.02, 0.012)) for k in range(6)]), "dark", CH, 0)
    A.add(xf(torus(0.12, 0.02, 10, 3), (x + sx * 0.2, top + 0.13, CB - 0.2), (0, 0, sx * 1.2)), "dark", CH, 0)
    for y in (2.6, 3.65):
        A.add(beam((x, y, CB - 0.2), (x, y, CB), 0.025, 4), "dark", CH, 0)

# ---------------- rear deck: He-3 tanks under MLI, comms, flag ----------------
part("deck")
A.add(bx((0, 2.17, -2.1), (1.2, 0.06, 1.25)), "dark", CH, 0.025)
for sx in (-1, 1):
    plate(A, CH, (sx * 1.2, 2.42, -2.75), (0.035, 0.2, 0.55), (0, 0, 0), slot="bleach" if sx < 0 else "primer", ink=0.02, bolts=2, out=sx)
    plate(A, CH, (sx * 1.2, 2.4, -1.65), (0.035, 0.18, 0.5), (0.03, 0, 0), slot="metal", ink=0.02, out=sx)
plate(A, CH, (0, 2.42, -3.37), (1.15, 0.2, 0.035), (0, 0, 0.0), slot="primer", ink=0.02, bolts=3, out=-1)
part("tanks")
for i, sx in enumerate((-1, 1)):
    c = (sx * 0.56, 2.62, -2.15)
    A.add(cyl(c, 0.36, 1.3, 12, rot=(PI / 2, 0, 0)), "tank", CH, 0.03)
    for sz in (-1, 1):
        A.add(xf(superquad(0.36, 0.36, 0.14, 1, 0.6, 12, 3), (c[0], c[1], c[2] + sz * 0.65)), "tank", CH, 0.02)
    mli_blanket(A, CH, c, 0.36, 1.05, (-1.95, 1.95), seed=i)
    for z in (-0.4, 0.4):
        A.add(xf(torus(0.41, 0.025, 16, 4), (c[0], c[1], c[2] + z), (PI / 2, 0, 0)), "dark", CH, 0.006)
    A.add(bx((c[0], 2.3, c[2]), (0.3, 0.08, 0.45)), "dark", CH, 0.01)
part("bumperR")
A.add(beam((-1.2, 2.05, -3.55), (1.2, 2.05, -3.55), 0.08, 6), "dark", CH, 0.02)
for sx in (-1, 1):
    A.add(bx((sx * 0.42, 1.95, -3.42), (0.06, 0.06, 0.14)), "dark", CH, 0)
    spike(A, CH, (sx * 0.8, 2.05, -3.6), (sx * 0.2, 0, -1), 0.45, 0.09)
part("dishmast")
A.add(beam((1.06, 2.23, -3.2), (1.06, 4.45, -3.2), 0.065, 6), "dark", CH, 0.015)
A.add(beam((1.06, 2.8, -3.2), (1.06, 2.23, -2.9), 0.04, 4), "dark", CH, 0.008)
A.add(bx((1.06, 4.5, -3.2), (0.1, 0.06, 0.1)), "dark", CH, 0.01)
for dz in (-0.1, 0.1):
    A.add(beam((1.06, 4.5, -3.2 + dz), (1.06, 4.72, -3.25 + dz * 1.4), 0.03, 4), "steel", CH, 0.006)
dish(A, CH, (1.06, 4.86, -3.3), 0.6, (0.35, 0.75, -0.6))
part("needles")
for z, ln, lean in ((-2.0, 1.9, (-0.15, 0.1)), (-2.3, 1.45, (-0.05, 0.05)), (-2.55, 1.1, (-0.2, 0.0))):
    needle(A, CH, (-1.2, 2.58 if z > -2.15 else 2.62, z), ln, lean)
part("flagpole")
A.add(beam((-1.0, 2.23, -3.25), (-1.0, 4.95, -3.25), 0.035, 5), "dark", CH, 0.006)
A.add(octa((-1.0, 4.97, -3.25), 0.05), "metal", CH, 0)
pivot(P + "flag", (-1.0, 4.92, -3.25), CH, role="flag", w=1.1, h=0.75)

# ---------------- turret: ring mount, standing gunner, rotary spray gun ----------------
TP = (0.0, ROOF + 0.02, -0.05)
part("ringbase")
A.add(cyl((TP[0], ROOF, TP[2]), 0.7, 0.08, 18), "dark", CH, 0.02)
T = pivot(P + "turret", TP, CH, role="turret")
TA = Acc(P + "t_")
part("turret")
TA.add(xf(torus(0.64, 0.055, 18, 4), (0, 0.06, 0)), "steel", T, 0.015)
TA.add(cyl((0, 0.06, 0), 0.6, 0.04, 18), "dark", T, 0)
TA.add(xf(torus(0.66, 0.012, 18, 3), (0, 0.11, 0)), "lens", T, 0)
railing_arc(TA, T, (0, 0.06, 0), 0.62, 0.78, PI * 0.42, PI * 1.58, 5)
TA.add(beam((0, 0.06, 0.3), (0, 0.9, 0.3), 0.075, 6), "dark", T, 0.02)
TA.add(cyl((0, 0.32, 0.3), 0.11, 0.18, 8), "steel", T, 0.01)
shield = [(-0.56, 0.45), (0.56, 0.45), (0.56, 1.06), (0.16, 1.06), (0.16, 0.86), (-0.16, 0.86), (-0.16, 1.06), (-0.56, 1.06)]
TA.add(xf(extrude(shield, 0.04, "z"), (0, 0, 0.62), (-0.1, 0, 0)), "bleach", T, 0.025)
TA.add(xf(bx((0.36, 0.84, 0.0), (0.1, 0.02, 0.03)), (0, 0, 0.62), (-0.1, 0, 0)), "lens", T, 0)
TA.add(xf(join([octa((x, y, 0.025), 0.03) for x in (-0.48, 0.48) for y in (0.53, 0.98)]), (0, 0, 0.62), (-0.1, 0, 0)), "steel", T, 0)
for sx in (-1, 1):
    TA.add(beam((sx * 0.4, 0.5, 0.6), (sx * 0.08, 0.5, 0.3), 0.03, 4), "dark", T, 0.008)
TA.add(bx((0.38, 0.2, -0.3), (0.16, 0.14, 0.22)), "primer", T, 0.015)
BR = pivot(P + "barrel", (0, 1.0, 0.3), T, role="barrel")
BA = Acc(P + "b_")
part("gun")
BA.add(bx((0, 0, -0.08), (0.14, 0.14, 0.3)), "dark", BR, 0.025)
BA.add(cyl((0, 0, 0.32), 0.15, 0.3, 12, rot=(PI / 2, 0, 0)), "dark", BR, 0.02)
for k in range(5):
    a = TAU * k / 5
    BA.add(beam((math.cos(a) * 0.085, math.sin(a) * 0.085, 0.45), (math.cos(a) * 0.085, math.sin(a) * 0.085, 1.6), 0.03, 6), "steel", BR, 0.01)
for z, r in ((1.0, 0.14), (1.55, 0.135)):
    BA.add(cyl((0, 0, z), r, 0.07, 12, rot=(PI / 2, 0, 0)), "dark", BR, 0.012)
BA.add(cyl((-0.31, -0.02, -0.05), 0.24, 0.16, 14, rot=(0, 0, PI / 2)), "dark", BR, 0.02)
for dx in (-0.05, 0.05):
    BA.add(cyl((-0.31 + dx, -0.02, -0.05), 0.245, 0.02, 14, rot=(0, 0, PI / 2)), "metal", BR, 0)
for sx in (-1, 1):
    BA.add(tube([(sx * 0.1, 0.0, -0.36), (sx * 0.14, -0.04, -0.46), (sx * 0.14, -0.2, -0.46)], [0.03] * 3, 6), "dark", BR, 0.008)
laser_sight(BA, BR, (0.21, 0.1, 0.3), (0, 0, 1), 5.0)
pivot(P + "muzzle", (0, 0, 1.62), BR, role="muzzle")
pivot(P + "crew", (0, 0.08, -0.38), T, role="crew", pose="stand")

# ---------------- wheels ----------------
for i, (sx, z) in enumerate(((-1, ZF), (1, ZF), (-1, ZR), (1, ZR))):
    monster_wheel(P, i, (sx * WX, WY, z), sx, WR, HW, ROOT, lugs=13, spiked=z > 0, seed=i)

A.flush()
TA.flush()
BA.flush()
ROOT["radius"] = 4.0
ROOT["wheelRadius"] = WR
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == "MESH")
inked = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == "MESH" and o.get("ink", 0) > 0)
print(f"warrig A: {len(C.objects)} objects, {tris} triangles ({inked} inked)")
audit_flips(C.objects)
# parts meant to meet: links into the rails and axle, hoops on the frame, pipes into what they feed, armour on the cab
CLASH_OK = [
    ("links*", "frame"), ("links*", "axle*"), ("bumpstop*", "frame"), ("hoop*", "frame"), ("shock*", "hoop*"),
    ("shock*", "axle*"), ("hoop*", "fenders"), ("frame", "underglow"), ("frame", "axle*"), ("frame", "hood"),
    ("frame", "cab"), ("frame", "deck"), ("frame", "bumperR"), ("frame", "plow"), ("frame", "stepbox"), ("frame", "tank"),
    ("frame", "dishmast"), ("rcs*", "frame"), ("rcs*", "plow"), ("rcs*", "deck"), ("hood", "cab"), ("hood", "core"),
    ("hood", "guard"), ("hood", "coolcoils"), ("hood", "bullbar"), ("core", "injectors"), ("core", "conduits"),
    ("conduits", "cab"), ("conduits", "hood"), ("coolcoils", "cab"), ("guard", "cab"), ("plow", "bullbar"),
    ("cab", "door"), ("cab", "visor"), ("cab", "pillarlight"), ("cab", "mirrors"), ("cab", "rack"), ("cab", "ladder"),
    ("cab", "ringbase"), ("cab", "stacks"), ("cab", "deck"), ("cab", "stepbox"), ("cab", "tank"), ("rack", "rackgear"),
    ("rack", "rackLight"), ("rack", "tank"), ("tank", "coolcoils"), ("tank", "hood"), ("door", "stepbox"),
    ("deck", "tanks"), ("deck", "bumperR"), ("deck", "dishmast"), ("deck", "needles"), ("deck", "flagpole"),
    ("deck", "stacks"), ("fenders", "headlamps"), ("turret", "ringbase"), ("turret", "gun"), ("*/laser", "*"),
]
clash_check(CLASH_OK)
float_check(skip_slots=("ion", "plasma"), skip_tags=("*/laser",))   # (the plasma ring is held by its field)
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    out = sys.argv[-1] if sys.argv[-1].endswith(".glb") else os.path.join(REPO, "docs", "warrig-proposals", "warrig_a.glb")
    export(out, C.objects)
