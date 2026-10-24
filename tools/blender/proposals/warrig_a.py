# PROPOSAL A for the Rustmoon War-Rig: "FURNACE", a long-nose monster truck with its fusion core out in the open.
#
# A 4x4 on two solid axles, each corner hung from one long coilover inside its own hoop (exaggerated lift and track for
# low-gravity jumps), on balloon tyres with thick, chewed-up rubber lugs and beadlock hubs. The hood is an open bay holding
# a stolen tokamak: a ring of ion-blue plasma inside eight copper field coils on a cradle round a central solenoid, three
# open injector valves spitting sparks, copper cooling coils running to radiator fin stacks on both cheeks, plasma conduits
# under the ring feeding the cab. The cab is a tall bunker set off to the left, its two slit viewports (caged) high enough
# to see over the reactor cage. The left side has the door (painted, a caged slit, two steps under it); the right a
# utility shelf (coolant tanks, tools, a vent box) with a full-height ladder to the roof. Over the cab a ring mount carries
# a standing pirate gunner behind a drum-fed five-barrel rotary (a 10-round burst is two turns of the cluster), with a
# notched salvage-plate shield and an IR laser sight. Lights: a brow rack with a long and a short LED bar, a big
# searchlight on the left pillar, a small one on the shelf, three pod lamps on the bull bar. The bed carries two He-3 tanks
# under frayed MLI blankets, a relay dish on a mast and antenna needles; the flag flies from the back corner. RCS quads sit
# on the four frame ends, fed by copper lines. No rust and little paint: bleached plate, primer and bare metal, a few
# panels in the faction colour; the faction's green and violet only glow (viewports, LED strips, the underglow).
#
#   MOONRUNNER_REPO=<repo> python3 tools/blender/proposals/warrig_a.py [out.glb]       (or exec() it in Blender)
#
# Frame (three.js axes, metres, before the game's 1.35 scale): origin on the ground in the middle, +z forward.
# Wheels at (+-2.2, 1.05, +-2.05), radius 1.05 (root `wheelRadius`), 0.86 wide. Root `radius` 3.6.
# Pivots: warrig (root) > chassis > turret (yaw about y, at the ring, (-0.27, 4.27, -0.27)) > barrel (pitch about x) >
# muzzle (empty at the barrels' mouth); turret > crew (empty: where the gunner stands, facing +z, `pose` stand); chassis >
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
WX, WY, WZ, WR, HW = 2.2, 1.05, 2.05, 1.05, 0.43
ROOF = 4.25      # bunker roof
CX = -0.27       # bunker centre line (off to the left)
ROOT = pivot("warrig", (0, 0, 0), None, proposal="a")
CH = pivot(P + "chassis", (0, 0, 0), ROOT, role="chassis")
A = Acc(P)

# ---------------- frame ----------------
part("frame")
for sx in (-1, 1):
    A.add(bx((sx * 0.62, 1.95, 0.0), (0.09, 0.14, 2.95)), "dark", CH, 0.03)
for z in (2.85, 1.2, -0.4, -2.85):
    A.add(bx((0, 1.95, z), (0.62, 0.1, 0.08)), "dark", CH, 0.02)
part("underglow")
for sx in (-1, 1):
    A.add(beam((sx * 0.45, 1.825, -1.6), (sx * 0.45, 1.825, 1.6), 0.025, 6), "underglow", CH, 0)

# ---------------- axles and suspension: a coilover in its own hoop at each corner ----------------
for sz in (-1, 1):
    z = sz * WZ
    nm = "F" if sz > 0 else "R"
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
            A.add(bx(((sx * 0.71 + sx * 1.5) / 2, 2.0, z + dz), (0.395, 0.06, 0.05)), "dark", CH, 0.015)
            A.add(beam((sx * 1.5, 1.94, z + dz), (sx * 1.5, 3.26, z + dz), 0.065, 6), "dark", CH, 0.015)
        A.add(beam((sx * 1.5, 3.2, z - 0.42), (sx * 1.5, 3.2, z + 0.42), 0.065, 6), "dark", CH, 0.015)
        A.add(beam((sx * 1.5, 2.06, z - 0.35), (sx * 1.5, 3.14, z + 0.35), 0.035, 4), "dark", CH, 0.008)
        part("shock" + c)
        coilover(A, CH, (sx * 1.5, WY + 0.14, z), (sx * 1.5, 3.13, z), 0.17, 6)

# ---------------- hood: the open fusion bay ----------------
part("bayfloor")
A.add(bx((0, 2.15, 1.7), (1.05, 0.05, 1.15)), "dark", CH, 0.03)
for sx in (-1, 1):
    o = 1 if sx > 0 else -1
    part("cheek" + ("L" if sx < 0 else "R"))
    plate(A, CH, (sx * 1.1, 2.475, 1.65), (0.05, 0.275, 1.05), (0, 0, sx * 0.06), slot="metal" if sx < 0 else "primer", ink=0.04, bolts=5, out=o)
    plate(A, CH, (sx * 1.165, 2.42, 2.25), (0.02, 0.17, 0.3), (0, 0, sx * 0.06), slot="bleach", ink=0.015, bolts=2, out=o)
    part("fins" + ("L" if sx < 0 else "R"))
    A.add(bx((sx * 1.12, 2.8, 1.65), (0.1, 0.04, 0.8)), "dark", CH, 0.015)
    A.add(join([bx((sx * 1.12, 2.97, 0.88 + 0.152 * k), (0.09, 0.13, 0.012)) for k in range(11)]), "metal", CH, 0.008)
    part("coolcoil" + ("L" if sx < 0 else "R"))
    A.add(coil_spring((sx * 0.9, 2.42, 2.3), (sx * 0.9, 2.42, 0.8), 0.09, 6, 0.026, 6), "copper", CH, 0.008)
    A.add(beam((sx * 0.9, 2.42, 2.4), (sx * 0.9, 2.42, 0.7), 0.04, 6), "steel", CH, 0.008)
    A.add(tube([(sx * 0.9, 2.42, 2.38), (sx * 0.9, 2.8, 2.38), (sx * 1.04, 2.8, 2.38)], [0.035] * 3, 6), "copper", CH, 0.006)

CORE = (0.0, 2.85, 1.62)
cx, cy, cz = CORE
part("core")
A.add(xf(torus(0.56, 0.13, 24, 6), CORE), "plasma", CH, 0)
for k in range(8):
    f = TAU * k / 8 + PI / 8
    A.add(xf(torus(0.24, 0.05, 10, 4), (cx + math.sin(f) * 0.56, cy, cz + math.cos(f) * 0.56), (PI / 2, f + PI / 2, 0)), "copper", CH, 0.012)
# cradle ring under the coils, four legs to the floor between them
A.add(xf(torus(0.56, 0.04, 24, 4), (cx, cy - 0.31, cz)), "dark", CH, 0.008)
for k in range(4):
    f = TAU * k / 4 + PI / 4
    A.add(beam((cx + math.sin(f) * 0.56, cy - 0.31, cz + math.cos(f) * 0.56), (cx + math.sin(f) * 0.64, 2.2, cz + math.cos(f) * 0.64), 0.04, 4), "dark", CH, 0.008)
A.add(cyl((cx, 2.33, cz), 0.2, 0.26, 12), "dark", CH, 0.015)
A.add(cyl((cx, cy, cz), 0.17, 0.8, 12), "steel", CH, 0.015)
for y in (-0.22, 0.0, 0.22):
    A.add(cyl((cx, cy + y, cz), 0.2, 0.08, 12), "copper", CH, 0.008)
A.add(cyl((cx, cy + 0.45, cz), 0.12, 0.1, 10, rt=0.06), "dark", CH, 0.01)
part("cage")
for x in (-0.75, 0.75):
    A.add(tube([(x, 2.2, 2.55), (x * 0.95, 3.45, 2.2), (x * 0.95, 3.48, 1.0), (x, 2.2, 0.66)], [0.05] * 4, 6), "dark", CH, 0.015)
A.add(beam((-0.71, 3.47, 1.6), (0.71, 3.47, 1.6), 0.045, 6), "dark", CH, 0.012)
# injector valves, between the coils: valve body, red hand wheel, open nozzle spitting ion-blue sparks into the ring
part("injectors")
for k, f in enumerate((0.0, 3 * PI / 4, 5 * PI / 4)):
    p = (cx + math.sin(f) * 0.56, cy + 0.12, cz + math.cos(f) * 0.56)
    A.add(cyl((p[0], p[1] + 0.14, p[2]), 0.055, 0.28, 8), "steel", CH, 0.01)
    A.add(xf(torus(0.1, 0.018, 10, 3), (p[0], p[1] + 0.31, p[2])), "red", CH, 0.006)
    A.add(beam((p[0] - math.cos(f) * 0.1, p[1] + 0.31, p[2] + math.sin(f) * 0.1), (p[0] + math.cos(f) * 0.1, p[1] + 0.31, p[2] - math.sin(f) * 0.1), 0.012, 3), "red", CH, 0)
    nz = (p[0] - math.sin(f) * 0.12, p[1] + 0.22, p[2] - math.cos(f) * 0.12)
    A.add(beam((p[0], p[1] + 0.22, p[2]), nz, 0.035, 6), "dark", CH, 0.008)
    for j in range(5):
        d = 0.08 + 0.06 * j
        A.add(octa((nz[0] - math.sin(f) * d + 0.025 * ((j * 3 + k) % 3 - 1), nz[1] + 0.03 * j - 0.012 * j * j, nz[2] - math.cos(f) * d), 0.034 - 0.004 * j), "ion", CH, 0)
# plasma conduits from the solenoid's foot to the cab, under the ring, in steel clamps
part("conduits")
for sx in (-1, 1):
    path = [(sx * 0.12, 2.32, 1.5), (sx * 0.3, 2.32, 1.1), (sx * 0.42, 2.32, 0.75), (sx * 0.45, 2.32, 0.5)]
    A.add(tube(path, [0.065] * 4, 8), "plasma", CH, 0)
    for t, pz in ((0.3, 1.1), (0.42, 0.75)):
        A.add(xf(torus(0.085, 0.022, 10, 4), (sx * t, 2.32, pz), (PI / 2, 0, 0)), "steel", CH, 0.006)

# ---------------- ram, bull bar, winch, pod lamps ----------------
part("ram")
ram = [(2.72, 1.62), (3.28, 1.78), (3.36, 2.36), (2.86, 2.72)]
A.add(extrude(ram, 2.5, "x"), "bleach", CH, 0.05)
plate(A, CH, (0.5, 2.1, 3.36), (0.5, 0.22, 0.03), (0.05, 0.04, 0.02), slot="primer", ink=0.02, bolts=4)
plate(A, CH, (-0.62, 2.18, 3.36), (0.42, 0.3, 0.03), (0.06, -0.05, -0.04), slot="body", ink=0.02, bolts=3)
A.add(join([bx((0.18 + 0.16 * k, 2.36, 3.36), (0.05, 0.1, 0.03), (0.15, 0, 0)) for k in range(5)]), "dark", CH, 0)
for i, x in enumerate((-0.95, -0.3, 0.35, 1.0)):
    spike(A, CH, (x, 1.85, 3.3), (0, -0.25, 1), 0.55 + 0.15 * (i % 2), 0.11)
part("bullbar")
A.add(tube([(-1.2, 2.66, 2.9), (-1.3, 2.95, 3.15), (1.3, 2.95, 3.15), (1.2, 2.66, 2.9)], [0.07] * 4, 6), "dark", CH, 0.02)
searchlight(A, CH, (-0.95, 3.12, 3.15), 0.13, (0, -0.1, 1), yoke=True, cage=False)
searchlight(A, CH, (-0.62, 3.09, 3.15), 0.1, (0.05, -0.1, 1), yoke=True, cage=False)
A.add(bx((0.95, 3.1, 3.15), (0.17, 0.1, 0.08)), "dark", CH, 0.015)
A.add(bx((0.95, 3.1, 3.235), (0.14, 0.075, 0.008)), "lamp", CH, 0)
A.add(beam((0.95, 3.0, 3.15), (0.95, 2.95, 3.15), 0.04, 4), "steel", CH, 0)
part("winch")
A.add(cyl((0.0, 2.84, 2.98), 0.13, 0.5, 12, rot=(0, 0, PI / 2)), "steel", CH, 0.015)
for x in (-0.28, 0.28):
    A.add(bx((x, 2.82, 2.98), (0.03, 0.17, 0.17)), "dark", CH, 0.01)
A.add(cyl((0.0, 2.84, 2.98), 0.145, 0.38, 12, rot=(0, 0, PI / 2)), "dark", CH, 0)
A.add(tube([(0.0, 2.84, 3.13), (0.0, 2.78, 3.32), (0.0, 2.6, 3.4)], [0.02] * 3, 4), "dark", CH, 0)
A.add(xf(torus(0.06, 0.02, 8, 3), (0.0, 2.52, 3.42), (0, 0, PI / 2)), "red", CH, 0.006)
# RCS quads on the four frame ends, fed back along the rails
for sz in (-1, 1):
    for sx in (-1, 1):
        part("rcs" + ("F" if sz > 0 else "R") + ("L" if sx < 0 else "R"))
        A.add(bx((sx * 1.0, 1.95, sz * 2.95), (0.38, 0.07, 0.07)), "dark", CH, 0.015)
        rcs_pod(A, CH, (sx * 1.42, 1.98, sz * 2.95), (sx, 0, 0), feed=(sx * 0.7, 1.98, sz * 2.7))

# ---------------- cab: the tall, off-centre bunker ----------------
part("bunker")
cab = [(-1.1, 2.15), (0.6, 2.15), (0.6, 3.35), (0.3, ROOF), (-1.1, ROOF)]
A.add(xf(extrude(cab, 2.06, "x"), (CX, 0, 0)), "primer", CH, 0.07)
gl = math.atan2(0.3, 0.9)
fw_g = (0, math.sin(gl), math.cos(gl))
up_g = (0, math.cos(gl), -math.sin(gl))
plate(A, CH, (CX - 0.1, 3.81, 0.49), (0.88, 0.4, 0.035), (-gl, 0, 0.0), slot="bleach", ink=0.025, bolts=3)
plate(A, CH, (CX + 0.05, 2.75, 0.635), (0.95, 0.5, 0.035), (0, 0, -0.02), slot="metal", ink=0.025, bolts=4)
plate(A, CH, (CX, 3.2, -1.135), (0.95, 0.9, 0.035), (0, 0, 0.02), slot="bleach", ink=0.025, bolts=4, out=-1)
# angle iron down the bunker's corners, ribs across its back
for x in (-1.3, 0.76):
    for z, top in ((0.6, 3.35), (-1.1, ROOF)):
        A.add(bx((x, (2.15 + top) / 2, z), (0.035, (top - 2.15) / 2, 0.035)), "dark", CH, 0.01)
for x in (-0.95, -0.27, 0.41):
    A.add(bx((x, 3.2, -1.18), (0.04, 0.88, 0.012)), "dark", CH, 0.008)
# the driver's slits, high in the glacis (they see over the reactor cage), sunk and caged
for x, w in ((-0.98, 0.17), (-0.5, 0.11)):
    viewport(A, CH, (x, 3.95 + 0.316 * 0.075, 0.4 + 0.949 * 0.075), w, 0.045, fw_g, up_g, bars=(2 if w > 0.15 else 1, 1))
A.add(bx((CX, ROOF - 0.03, 0.33), (0.85, 0.012, 0.015)), "lens", CH, 0)   # a green LED strip along the brow
# the door on the left: a painted armour leaf in a heavy frame, hinges, a lever latch, a caged slit, steps under it
part("door")
A.add(bx((-1.335, 3.1, -0.27), (0.035, 0.82, 0.56)), "body", CH, 0.025)
for p, q in (((-1.36, 2.26, -0.85), (-1.36, 2.26, 0.31)), ((-1.36, 3.94, -0.85), (-1.36, 3.94, 0.31)),
             ((-1.36, 2.26, -0.85), (-1.36, 3.94, -0.85)), ((-1.36, 2.26, 0.31), (-1.36, 3.94, 0.31))):
    A.add(beam(p, q, 0.04, 4), "dark", CH, 0.01)
for y in (2.55, 3.1, 3.65):
    A.add(cyl((-1.39, y, 0.27), 0.04, 0.2, 8), "steel", CH, 0.008)
A.add(bx((-1.375, 2.4, -0.27), (0.008, 0.08, 0.5)), "metal", CH, 0)
A.add(tube([(-1.37, 3.05, -0.72), (-1.45, 3.05, -0.7), (-1.45, 2.85, -0.7)], [0.025] * 3, 4), "steel", CH, 0.006)
viewport(A, CH, (-1.39, 3.68, -0.27), 0.15, 0.045, (-1, 0, 0), bars=(2, 1))
A.add(tube([(-1.31, 2.6, 0.48), (-1.42, 2.62, 0.48), (-1.42, 3.5, 0.48), (-1.31, 3.52, 0.48)], [0.025] * 4, 4), "steel", CH, 0.006)
for y in (1.82, 1.48):
    A.add(bx((-1.45, y, -0.27), (0.12, 0.02, 0.3)), "metal", CH, 0.01)
for dz in (-0.25, 0.25):
    A.add(beam((-1.27, 2.17, -0.27 + dz), (-1.52, 1.46, -0.27 + dz), 0.03, 4), "dark", CH, 0.008)
# a wing mirror off the left pillar
A.add(tube([(-1.3, 3.55, 0.5), (-1.55, 3.65, 0.58), (-1.62, 3.7, 0.58)], [0.025] * 3, 4), "steel", CH, 0.006)
A.add(bx((-1.66, 3.72, 0.58), (0.05, 0.12, 0.08), (0, 0.3, 0)), "dark", CH, 0.01)

# the right side: a utility shelf bolted to the bunker, a ladder to the roof on its back end
part("shelf")
for x in (0.8, 1.42):
    for z in (-1.0, 0.5):
        A.add(beam((x, 2.15, z), (x, 3.97, z), 0.035, 6), "dark", CH, 0.01)
for y in (2.2, 3.08, 3.95):
    A.add(bx((1.11, y, -0.25), (0.33, 0.025, 0.78)), "metal", CH, 0.015)
for z in (-0.9, 0.4):
    A.add(bx((1.07, 2.11, z), (0.36, 0.035, 0.04)), "dark", CH, 0.01)
for y in (2.6, 3.5):
    A.add(beam((1.42, y, -1.0), (1.42, y, 0.5), 0.022, 4), "dark", CH, 0.006)
part("shelfgear")
for z, slot in ((0.22, "tank"), (-0.26, "bleach")):
    A.add(cyl((1.11, 2.6, z), 0.2, 0.7, 12), slot, CH, 0.025)
    A.add(xf(superquad(0.2, 0.08, 0.2, 0.5, 1, 12, 4), (1.11, 2.95, z)), slot, CH, 0.015)
    A.add(xf(torus(0.21, 0.018, 12, 3), (1.11, 2.75, z)), "dark", CH, 0)
A.add(beam((1.11, 3.02, 0.22), (1.11, 3.02, -0.26), 0.03, 6), "copper", CH, 0.006)
A.add(xf(torus(0.07, 0.015, 8, 3), (1.11, 3.03, -0.02)), "red", CH, 0)
A.add(tube([(1.11, 2.3, 0.4), (1.0, 2.3, 0.56), (0.9, 2.42, 0.85)], [0.035] * 3, 6), "copper", CH, 0.006)
A.add(bx((1.08, 3.24, 0.2), (0.22, 0.13, 0.17)), "red", CH, 0.015)
A.add(bx((1.08, 3.38, 0.2), (0.23, 0.02, 0.18)), "dark", CH, 0)
A.add(xf(torus(0.17, 0.035, 12, 4), (1.11, 3.45, -0.35), (PI / 2, 0, PI / 2)), "dark", CH, 0.01)
for k, z in enumerate((-0.72, -0.9)):
    A.add(bx((1.06 + 0.08 * k, 3.29, z), (0.14, 0.18, 0.06)), "primer", CH, 0.012)
A.add(cyl((1.3, 3.3, 0.38), 0.07, 0.36, 8), "red", CH, 0.01)
part("vent")
A.add(bx((1.11, 4.09, -0.17), (0.28, 0.12, 0.26)), "dark", CH, 0.02)
A.add(join([bx((1.11, 4.22, -0.37 + 0.1 * k), (0.26, 0.012, 0.035), (0.5, 0, 0)) for k in range(5)]), "metal", CH, 0)
part("ladder")
for z in (-0.95, -0.55):
    A.add(tube([(1.52, 1.25, z), (1.52, ROOF + 0.45, z), (1.25, ROOF + 0.55, z), (0.72, ROOF + 0.12, z)], [0.04] * 4, 6), "bleach", CH, 0.012)
    for y in (2.4, 3.6):
        A.add(beam((1.52, y, z), (1.42, y, -1.0 if z < -0.7 else -1.0), 0.02, 4), "dark", CH, 0)
for k in range(11):
    A.add(beam((1.52, 1.4 + 0.3 * k, -0.95), (1.52, 1.4 + 0.3 * k, -0.55), 0.025, 4), "steel", CH, 0.006)
A.add(beam((1.52, 1.62, -0.75), (0.71, 1.95, -0.75), 0.03, 4), "dark", CH, 0.006)

# lights: a brow rack with a long and a short LED bar, the big searchlight on the left pillar, a small one on the shelf
part("rack")
A.add(tube([(-1.25, ROOF, 0.2), (-1.25, ROOF + 0.2, 0.52), (0.72, ROOF + 0.22, 0.52), (0.72, ROOF, 0.2)], [0.045] * 4, 6), "dark", CH, 0.015)
ledbar(A, CH, (-0.62, ROOF + 0.29, 0.56), 6, 0.12, (0.06, 0, 0.02))
ledbar(A, CH, (0.4, ROOF + 0.31, 0.56), 3, 0.11, (0.1, 0, -0.05), h=0.1)
part("pillarlight")
A.add(beam((-1.3, 3.93, 0.46), (-1.58, 3.93, 0.46), 0.04, 6), "dark", CH, 0.01)
searchlight(A, CH, (-1.58, 4.22, 0.46), 0.24, (-0.12, -0.3, 1))
part("shelflight")
searchlight(A, CH, (1.28, 4.17, 0.4), 0.15, (0.3, -0.3, 1))
pivot(P + "spot0", (-1.58, 4.22, 0.66), CH, role="spot", aim=(-0.12, -0.3, 1.0), r=0.24)
pivot(P + "spot1", (1.28, 4.17, 0.52), CH, role="spot", aim=(0.3, -0.3, 1.0), r=0.15)
part("lockpod")
A.add(bx((0.95, 4.08, 0.28), (0.12, 0.1, 0.15)), "primer", CH, 0.015)
A.add(xf(superquad(0.08, 0.08, 0.08, 1, 1, 8, 5), (0.95, 4.2, 0.26)), "dark", CH, 0.01)
laser_sight(A, CH, (0.95, 4.08, 0.45), (0.0, -0.06, 1), 0.01)

# ---------------- bed: He-3 tanks under MLI, comms, flag ----------------
part("bed")
A.add(bx((0, 2.17, -2.02), (1.2, 0.06, 0.93)), "dark", CH, 0.025)
for sx in (-1, 1):
    plate(A, CH, (sx * 1.2, 2.42, -2.4), (0.035, 0.2, 0.52), (0, 0, 0), slot="bleach" if sx < 0 else "primer", ink=0.02, bolts=3, out=sx)
    plate(A, CH, (sx * 1.2, 2.4, -1.45), (0.035, 0.18, 0.34), (0.04, 0, 0), slot="metal", ink=0.02, out=sx)
plate(A, CH, (0, 2.42, -2.97), (1.15, 0.2, 0.035), (0, 0, 0.0), slot="primer", ink=0.02, bolts=4, out=-1)
part("tanks")
for i, sx in enumerate((-1, 1)):
    c = (sx * 0.56, 2.62, -2.05)
    A.add(cyl(c, 0.36, 1.4, 14, rot=(PI / 2, 0, 0)), "tank", CH, 0.03)
    for sz in (-1, 1):
        A.add(xf(superquad(0.36, 0.36, 0.14, 1, 0.6, 14, 3), (c[0], c[1], c[2] + sz * 0.7)), "tank", CH, 0.02)
    mli_blanket(A, CH, c, 0.36, 1.15, (-1.95, 1.95), seed=i)
    for z in (-0.42, 0.42):
        A.add(xf(torus(0.41, 0.025, 16, 4), (c[0], c[1], c[2] + z), (PI / 2, 0, 0)), "dark", CH, 0.006)
    A.add(bx((c[0], 2.3, c[2]), (0.3, 0.08, 0.5)), "dark", CH, 0.01)
part("bumperR")
A.add(beam((-1.2, 2.05, -3.14), (1.2, 2.05, -3.14), 0.08, 6), "dark", CH, 0.02)
for sx in (-1, 1):
    A.add(bx((sx * 0.42, 1.95, -3.04), (0.06, 0.06, 0.12)), "dark", CH, 0)
    spike(A, CH, (sx * 0.8, 2.05, -3.18), (sx * 0.2, 0, -1), 0.45, 0.09)
part("dishmast")
A.add(beam((1.06, 2.23, -2.88), (1.06, 4.45, -2.88), 0.065, 6), "dark", CH, 0.015)
A.add(beam((1.06, 2.8, -2.88), (1.06, 2.23, -2.45), 0.04, 4), "dark", CH, 0.008)
A.add(bx((1.06, 4.5, -2.88), (0.1, 0.06, 0.1)), "dark", CH, 0.01)
for dz in (-0.1, 0.1):
    A.add(beam((1.06, 4.5, -2.88 + dz), (1.06, 4.72, -2.93 + dz * 1.4), 0.03, 4), "steel", CH, 0.006)
dish(A, CH, (1.06, 4.86, -2.98), 0.6, (0.35, 0.75, -0.6))
part("needles")
for z, ln, lean in ((-2.2, 2.0, (-0.15, 0.1)), (-2.42, 1.5, (-0.05, 0.05)), (-2.64, 1.15, (-0.2, 0.0))):
    needle(A, CH, (-1.2, 2.62, z), ln, lean)
part("flagpole")
A.add(beam((-1.0, 2.23, -2.9), (-1.0, 4.95, -2.9), 0.035, 5), "dark", CH, 0.006)
A.add(octa((-1.0, 4.97, -2.9), 0.05), "metal", CH, 0)
pivot(P + "flag", (-1.0, 4.92, -2.9), CH, role="flag", w=1.1, h=0.75)

# ---------------- turret: ring mount, standing gunner, rotary spray gun ----------------
TP = (CX, ROOF + 0.02, -0.27)
part("ringbase")
A.add(cyl((TP[0], ROOF, TP[2]), 0.7, 0.08, 18), "dark", CH, 0.02)
T = pivot(P + "turret", TP, CH, role="turret")
TA = Acc(P + "t_")
part("turret")
TA.add(xf(torus(0.64, 0.055, 22, 5), (0, 0.06, 0)), "steel", T, 0.015)
TA.add(cyl((0, 0.06, 0), 0.6, 0.04, 18), "dark", T, 0)
TA.add(xf(torus(0.66, 0.012, 22, 3), (0, 0.11, 0)), "lens", T, 0)
railing_arc(TA, T, (0, 0.06, 0), 0.62, 0.78, PI * 0.42, PI * 1.58, 5)
TA.add(beam((0, 0.06, 0.3), (0, 0.9, 0.3), 0.075, 6), "dark", T, 0.02)
TA.add(cyl((0, 0.32, 0.3), 0.11, 0.18, 8), "steel", T, 0.01)
# shield: a salvaged hatch plate, notched for the barrels, bolted to two arms, a slot to look through
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
BA.add(cyl((-0.31, -0.02, -0.05), 0.08, 0.18, 8, rot=(0, 0, PI / 2)), "steel", BR, 0)
for sx in (-1, 1):
    BA.add(tube([(sx * 0.1, 0.0, -0.36), (sx * 0.14, -0.04, -0.46), (sx * 0.14, -0.2, -0.46)], [0.03] * 3, 6), "dark", BR, 0.008)
laser_sight(BA, BR, (0.21, 0.1, 0.3), (0, 0, 1), 5.0)
pivot(P + "muzzle", (0, 0, 1.62), BR, role="muzzle")
pivot(P + "crew", (0, 0.08, -0.38), T, role="crew", pose="stand")

# ---------------- wheels ----------------
for i, (sx, sz) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1))):
    monster_wheel(P, i, (sx * WX, WY, sz * WZ), sx, WR, HW, ROOT, lugs=13, spiked=sz > 0, seed=i)

A.flush()
TA.flush()
BA.flush()
ROOT["radius"] = 3.6
ROOT["wheelRadius"] = WR
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == "MESH")
inked = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == "MESH" and o.get("ink", 0) > 0)
print(f"warrig A: {len(C.objects)} objects, {tris} triangles ({inked} inked)")
audit_flips(C.objects)
# parts meant to meet: links into the rails and axle, hoop arms under the frame, the bay floor into the ram, the
# conduits into the cab, pipes into what they feed, the ladder and shelf on their brackets
CLASH_OK = [
    ("links*", "frame"), ("links*", "axle*"), ("bumpstop*", "frame"), ("hoop*", "frame"), ("shock*", "hoop*"),
    ("shock*", "axle*"), ("bayfloor", "ram"), ("bayfloor", "frame"), ("bayfloor", "cheek*"), ("bayfloor", "core"),
    ("bayfloor", "cage"), ("bayfloor", "bunker"), ("cheek*", "fins*"), ("coolcoil*", "fins*"), ("coolcoil*", "bayfloor"),
    ("conduits", "bunker"), ("conduits", "core"), ("injectors", "core"), ("cage", "core"), ("ram", "bullbar"),
    ("ram", "frame"), ("ram", "winch"), ("bullbar", "winch"), ("rcs*", "frame"), ("rcs*", "ram"), ("rcs*", "bed"),
    ("bunker", "frame"), ("bunker", "door"), ("bunker", "shelf"), ("bunker", "rack"), ("bunker", "pillarlight"),
    ("bunker", "lockpod"), ("bunker", "ringbase"), ("bunker", "ladder"), ("bunker", "bed"), ("shelf", "shelfgear"),
    ("shelf", "vent"), ("shelf", "ladder"), ("shelf", "frame"), ("shelf", "shelflight"), ("shelfgear", "coolcoil*"),
    ("shelfgear", "bayfloor"), ("ladder", "frame"), ("door", "frame"), ("bed", "frame"), ("bed", "tanks"),
    ("bed", "bumperR"), ("bed", "dishmast"), ("bed", "needles"), ("bed", "flagpole"), ("frame", "bumperR"),
    ("frame", "underglow"), ("frame", "axle*"), ("turret", "ringbase"), ("turret", "gun"), ("dishmast", "frame"),
    ("bunker", "cage"), ("bunker", "cheek*"), ("*/laser", "*"), ("lockpod", "shelf"), ("pillarlight", "bunker"),
]
clash_check(CLASH_OK)
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    out = sys.argv[-1] if sys.argv[-1].endswith(".glb") else os.path.join(REPO, "docs", "warrig-proposals", "warrig_a.glb")
    export(out, C.objects)
