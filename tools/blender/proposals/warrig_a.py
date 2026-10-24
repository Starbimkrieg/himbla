# PROPOSAL A for the Rustmoon War-Rig: "FURNACE", a long-nose monster truck with its fusion core out in the open.
#
# A 4x4 on two solid axles hung from four tall coilovers (exaggerated lift and track for low-gravity jumps), balloon tyres
# clawed with paddle cleats cut from scrap plate. The hood is an open bay holding a stolen tokamak: a ring of ion-blue
# plasma inside eight copper field coils round a central solenoid, three open injector valves spitting sparks, copper
# cooling coils running to radiator fin stacks on both cheeks, plasma conduits feeding the cab. The cab is a squat welded
# bunker set off to the left: tiny slit viewports behind crossbar cages, a porthole in the door; coolant tanks, a vent
# box and the gunner's ladder fill the right. Over the cab a ring mount carries a standing pirate gunner behind a five-
# barrel rotary spray gun (a 10-round burst), drum-fed, with a jagged shield and an IR laser sight. Lights: a long LED bar
# and a short one at odd heights, two mismatched searchlights, three pod lamps on the ram. The bed carries two He-3 tanks
# under frayed gold MLI blankets; a bent radar dish and a cluster of antenna needles stand at the back, RCS quads on all
# four corners. No rust: sun-bleached plate, primer and bare metal, welded at every seam.
#
#   MOONRUNNER_REPO=<repo> python3 tools/blender/proposals/warrig_a.py [out.glb]       (or exec() it in Blender)
#
# Frame (three.js axes, metres, before the game's 1.35 scale): origin on the ground in the middle, +z forward.
# Wheels at (+-2.2, 1.05, +-2.05), radius 1.05 (root `wheelRadius`), 0.86 wide. Root `radius` 3.6.
# Pivots: warrig (root) > chassis > turret (yaw about y, at the ring, (-0.27, 3.6, -0.27)) > barrel (pitch about x) >
# muzzle (empty at the barrels' mouth); turret > crew (empty: where the gunner stands, facing +z); chassis > spot0..2
# (empties: searchlight beams, `aim` = direction), flag (empty at the pole's tip). Four wheel pivots under the root.

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
ROOT = pivot("warrig", (0, 0, 0), None, proposal="a")
CH = pivot(P + "chassis", (0, 0, 0), ROOT, role="chassis")
A = Acc(P)

# ---------------- frame, axles, suspension ----------------
for sx in (-1, 1):
    A.add(bx((sx * 0.62, 1.95, 0.0), (0.09, 0.14, 2.95)), "dark", CH, 0.03)
for z in (2.85, 1.2, -0.4, -2.85):
    A.add(bx((0, 1.95, z), (0.62, 0.1, 0.08)), "dark", CH, 0.02)
for sz in (-1, 1):
    z = sz * WZ
    A.add(beam((-1.78, WY, z), (1.78, WY, z), 0.13, 8), "dark", CH, 0.03)
    A.add(xf(superquad(0.3, 0.27, 0.27, 0.6, 0.6, 10, 6), (0.28 * sz, WY, z)), "steel", CH, 0.025)
    for sx in (-1, 1):
        # trailing links up to the frame, a long coilover to a tall welded tower
        A.add(beam((sx * 0.85, WY - 0.02, z), (sx * 0.62, 1.84, z - sz * 1.3), 0.06, 6), "steel", CH, 0.015)
        A.add(beam((sx * 0.35, WY + 0.12, z), (sx * 0.5, 2.06, z - sz * 1.0), 0.05, 6), "steel", CH, 0.015)
        top = (sx * 1.02, 3.08, z - sz * 0.32)
        coilover(A, CH, (sx * 1.48, WY + 0.14, z), top, 0.17, 6)
        A.add(beam((sx * 0.62, 2.06, z - sz * 0.75), top, 0.065, 6), "dark", CH, 0.015)
        A.add(beam((sx * 0.62, 2.06, z + sz * 0.15), top, 0.065, 6), "dark", CH, 0.015)
        A.add(xf(superquad(0.12, 0.08, 0.12, 0.6, 0.6, 8, 4), top), "dark", CH, 0.012)
        # bump stop
        A.add(cyl((sx * 1.2, WY + 0.55, z), 0.09, 0.3, 8), "dark", CH, 0.01)

# ---------------- hood: the open fusion bay ----------------
A.add(bx((0, 2.15, 1.7), (1.05, 0.05, 1.15)), "dark", CH, 0.03)
for sx in (-1, 1):
    plate(A, CH, (sx * 1.1, 2.48, 1.68), (0.05, 0.3, 1.08), (0, 0, sx * 0.08), slot="body", ink=0.04, bolts=5, out=1 if sx > 0 else -1)
    plate(A, CH, (sx * 1.17, 2.42, 2.25), (0.03, 0.2, 0.36), (0.06, 0, sx * 0.08), slot="bleach" if sx < 0 else "primer", ink=0.02, out=1 if sx > 0 else -1)
    # radiator fin stack on the cheek (coolant heat goes out here)
    A.add(bx((sx * 1.18, 2.82, 1.6), (0.13, 0.04, 0.82)), "dark", CH, 0.015)
    fins = [bx((sx * 1.18, 2.98, 0.86 + 0.148 * k), (0.12, 0.13, 0.012)) for k in range(11)]
    A.add(join(fins), "metal", CH, 0.008)
    # copper cooling coil from the core to the fins
    A.add(coil_spring((sx * 0.82, 2.55, 2.3), (sx * 0.82, 2.55, 0.8), 0.1, 5, 0.028, 6), "copper", CH, 0.008)
    A.add(beam((sx * 0.82, 2.55, 2.4), (sx * 0.82, 2.55, 0.7), 0.04, 6), "steel", CH, 0.008)
    A.add(beam((sx * 0.82, 2.55, 2.38), (sx * 1.1, 2.82, 2.38), 0.04, 6), "copper", CH, 0.006)

CORE = (0.0, 2.95, 1.62)
cx, cy, cz = CORE
A.add(xf(torus(0.56, 0.13, 24, 6), CORE), "plasma", CH, 0)
for k in range(8):
    f = TAU * k / 8 + PI / 8
    A.add(xf(torus(0.24, 0.05, 10, 4), (cx + math.sin(f) * 0.56, cy, cz + math.cos(f) * 0.56), (PI / 2, f + PI / 2, 0)), "copper", CH, 0.012)
    # the coil's foot on the bay floor
    A.add(beam((cx + math.sin(f) * 0.56, cy - 0.24, cz + math.cos(f) * 0.56), (cx + math.sin(f) * 0.62, 2.2, cz + math.cos(f) * 0.62), 0.04, 4), "dark", CH, 0.008)
A.add(cyl((cx, cy, cz), 0.17, 0.8, 12), "steel", CH, 0.015)
for y in (-0.22, 0.0, 0.22):
    A.add(cyl((cx, cy + y, cz), 0.2, 0.08, 12), "copper", CH, 0.008)
A.add(cyl((cx, cy + 0.44, cz), 0.12, 0.1, 10, rt=0.06), "dark", CH, 0.01)
# roll cage over the bay
for x in (-0.75, 0.75):
    A.add(tube([(x, 2.2, 2.55), (x * 0.95, 3.45, 2.2), (x * 0.95, 3.5, 1.0), (x, 2.2, 0.62)], [0.055] * 4, 6), "dark", CH, 0.015)
A.add(beam((-0.72, 3.47, 1.6), (0.72, 3.47, 1.6), 0.05, 6), "dark", CH, 0.012)
# injector valves: valve body, red hand wheel, open nozzle spitting ion-blue sparks into the ring
for k, f in enumerate((0.5, 2.6, 4.4)):
    p = (cx + math.sin(f) * 0.56, cy + 0.17, cz + math.cos(f) * 0.56)
    A.add(cyl((p[0], p[1] + 0.14, p[2]), 0.055, 0.28, 8), "steel", CH, 0.01)
    A.add(xf(torus(0.1, 0.018, 10, 3), (p[0], p[1] + 0.31, p[2])), "red", CH, 0.006)
    A.add(beam((p[0], p[1] + 0.31, p[2] - 0.1), (p[0], p[1] + 0.31, p[2] + 0.1), 0.012, 3), "red", CH, 0)
    nz = (p[0] - math.sin(f) * 0.12, p[1] + 0.22, p[2] - math.cos(f) * 0.12)
    A.add(beam((p[0], p[1] + 0.22, p[2]), nz, 0.035, 6), "dark", CH, 0.008)
    for j in range(5):
        d = 0.08 + 0.07 * j
        A.add(octa((nz[0] - math.sin(f) * d + 0.03 * ((j * 3 + k) % 3 - 1), nz[1] + 0.05 * j - 0.02 * j * j * 0.5, nz[2] - math.cos(f) * d), 0.035 - 0.004 * j), "ion", CH, 0)
# plasma conduits back to the cab: glowing tubes in steel clamps
for sx in (-1, 1):
    path = [(sx * 0.42, 2.85, 1.12), (sx * 0.55, 2.62, 0.82), (sx * 0.58, 2.55, 0.5)]
    A.add(tube(path, [0.07] * 3, 8), "plasma", CH, 0)
    for t in (0.0, 0.5):
        A.add(xf(torus(0.09, 0.025, 10, 4), (sx * (0.45 + 0.1 * t), 2.78 - 0.2 * t, 1.0 - 0.3 * t), (PI / 2 - 0.6, 0, 0)), "steel", CH, 0.006)

# ---------------- the ram ----------------
ram = [(2.72, 1.62), (3.28, 1.78), (3.36, 2.36), (2.86, 2.72)]
A.add(xf(extrude(ram, 2.5, "x"), (0, 0, 0)), "bleach", CH, 0.05)
weld_loop(A, CH, [(-1.25, 2.36, 3.37), (1.25, 2.36, 3.37), (1.25, 1.78, 3.29), (-1.25, 1.78, 3.29)])
plate(A, CH, (0.45, 2.1, 3.36), (0.55, 0.22, 0.03), (0.05, 0.04, 0.02), slot="primer", ink=0.02, bolts=4)
plate(A, CH, (-0.62, 2.18, 3.35), (0.42, 0.3, 0.03), (0.06, -0.05, -0.04), slot="body", ink=0.02, bolts=3)
# vent slots punched through the ram (it cools the bay behind it), a daubed slash
A.add(join([bx((0.15 + 0.17 * k, 2.42, 3.29), (0.05, 0.11, 0.03), (-0.65, 0, 0)) for k in range(5)]), "dark", CH, 0)
A.add(bx((-0.62, 2.2, 3.385), (0.3, 0.035, 0.006), (0.06, -0.05, 0.5)), "stripe", CH, 0)
A.add(tube([(-1.3, 2.75, 2.75), (-1.35, 2.9, 3.1), (1.35, 2.9, 3.1), (1.3, 2.75, 2.75)], [0.07] * 4, 6), "dark", CH, 0.02)
for i, x in enumerate((-0.95, -0.3, 0.35, 1.0)):
    spike(A, CH, (x, 1.85, 3.32), (0, -0.25, 1), 0.55 + 0.15 * (i % 2), 0.11)
for sx in (-1, 1):
    spike(A, CH, (sx * 1.25, 2.1, 3.2), (sx * 0.6, 0, 1), 0.6, 0.1)
    rcs_quad(A, CH, (sx * 1.42, 2.55, 2.95), (sx, 0, 0))
# pod lamps on the ram: two round, one square (mismatched)
searchlight(A, CH, (-0.95, 3.05, 3.05), 0.13, (0, -0.1, 1), yoke=True, cage=False)
searchlight(A, CH, (-0.6, 3.02, 3.08), 0.1, (0.05, -0.1, 1), yoke=True, cage=False)
A.add(bx((0.95, 3.02, 3.02), (0.17, 0.1, 0.08)), "dark", CH, 0.015)
A.add(bx((0.95, 3.02, 3.1), (0.14, 0.075, 0.01)), "lamp", CH, 0)

# ---------------- cab: the off-centre bunker ----------------
CX = -0.27
cab = [(-1.1, 2.15), (0.6, 2.15), (0.6, 2.72), (0.26, 3.56), (-1.1, 3.56)]
A.add(xf(extrude(cab, 2.06, "x"), (CX, 0, 0)), "body", CH, 0.07)
# armour plates welded over it, a little skew
gl = math.atan2(0.34, 0.84)
plate(A, CH, (CX - 0.1, 3.14, 0.44), (0.88, 0.4, 0.035), (-gl, 0, 0.02), slot="primer", ink=0.025, bolts=3)
plate(A, CH, (CX + 0.05, 2.44, 0.635), (0.95, 0.24, 0.035), (0, 0, -0.03), slot="bleach", ink=0.025, bolts=4)
plate(A, CH, (-1.33, 2.85, -0.3), (0.035, 0.52, 0.62), (0, 0.0, 0.04), slot="bleach", ink=0.025, bolts=3, out=-1)
plate(A, CH, (-1.33, 3.33, 0.42), (0.03, 0.16, 0.2), (0.15, 0, 0.0), slot="primer", ink=0.015, out=-1)
plate(A, CH, (CX + 0.35, 3.6, -0.85), (0.5, 0.035, 0.26), (0, 0.12, 0), slot="primer", ink=0.02, bolts=2)
plate(A, CH, (0.79, 2.6, -0.2), (0.035, 0.42, 0.72), (0, 0, -0.02), slot="primer", ink=0.025, bolts=3)
plate(A, CH, (CX, 2.85, -1.13), (0.95, 0.6, 0.03), (0, 0, 0.03), slot="bleach", ink=0.025, out=-1)
# paint daubs in the trim colour: a slashed band on the bunker's flank, a tally of kills
A.add(bx((-1.375, 2.55, -0.3), (0.006, 0.05, 0.55), (0.18, 0, 0)), "stripe", CH, 0)
for k in range(5):
    A.add(bx((-1.375, 3.15, -0.62 + 0.08 * k), (0.006, 0.09, 0.018), (0.25, 0, 0)), "stripe", CH, 0)
# tiny thick viewports behind crossbar cages: two slits in the glacis (mismatched), a porthole in the door
up_g = (0, math.cos(gl), -math.sin(gl))
fw_g = (0, math.sin(gl), math.cos(gl))
for x, w in ((-0.98, 0.17), (-0.5, 0.11)):
    viewport(A, CH, (x, 3.22, 0.44 + 0.04), w, 0.04, fw_g, up_g, bars=(2 if w > 0.15 else 1, 1))
viewport(A, CH, (-1.37, 3.0, 0.05), 0.08, 0.08, (-1, 0, 0), round_=True, bars=(1, 1))
# door hinges and a grab handle
for y in (2.45, 3.25):
    A.add(cyl((-1.38, y, -0.75), 0.045, 0.16, 8), "steel", CH, 0.008)
A.add(tube([(-1.37, 2.7, 0.15), (-1.45, 2.7, 0.1), (-1.45, 2.7, -0.15), (-1.37, 2.7, -0.2)], [0.025] * 4, 4), "steel", CH, 0.006)

# right of the bunker: coolant tanks, a louvred vent box, the gunner's ladder
for z, slot in ((0.22, "tank"), (-0.38, "bleach")):
    A.add(cyl((1.08, 2.62, z), 0.24, 0.85, 12), slot, CH, 0.03)
    A.add(xf(superquad(0.24, 0.1, 0.24, 0.5, 1, 12, 4), (1.08, 3.05, z)), slot, CH, 0.02)
    A.add(cyl((1.08, 2.5, z), 0.25, 0.06, 12), "dark", CH, 0)
A.add(beam((1.08, 3.12, 0.22), (1.08, 3.12, -0.38), 0.035, 6), "copper", CH, 0.006)
A.add(tube([(1.08, 2.4, 0.42), (0.95, 2.35, 0.75), (0.62, 2.35, 0.9)], [0.04] * 3, 6), "copper", CH, 0.006)
A.add(bx((1.08, 3.3, -0.08), (0.24, 0.13, 0.3)), "dark", CH, 0.02)
A.add(join([bx((1.08, 3.32, -0.3 + 0.1 * k), (0.25, 0.012, 0.035), (0.5, 0, 0)) for k in range(6)]), "metal", CH, 0)
for x in (0.88, 1.28):
    A.add(beam((x, 2.15, -0.98), (x, 3.75, -0.98), 0.03, 4), "steel", CH, 0.008)
for k in range(5):
    A.add(beam((0.88, 2.35 + 0.3 * k, -0.98), (1.28, 2.35 + 0.3 * k, -0.98), 0.022, 4), "steel", CH, 0)
for sx in (-1, 1):
    A.add(beam((1.08 + sx * 0.2, 3.75, -0.98), (0.6 + sx * 0.08, 3.6, -0.75), 0.03, 4), "steel", CH, 0.008)

# light rack over the bunker's brow: a long LED bar and a short one at odd heights, the big searchlight on the left
A.add(tube([(-1.3, 3.56, 0.3), (-1.3, 3.86, 0.36), (0.75, 3.9, 0.36), (0.75, 3.56, 0.3)], [0.05] * 4, 6), "dark", CH, 0.015)
ledbar(A, CH, (-0.62, 3.98, 0.42), 6, 0.12, (0.06, 0, 0.02))
ledbar(A, CH, (0.42, 4.03, 0.42), 3, 0.11, (0.12, 0, -0.06), h=0.1)
searchlight(A, CH, (-1.12, 4.05, 0.16), 0.26, (-0.15, -0.08, 1))
A.add(beam((-1.12, 3.56, 0.16), (-1.12, 3.75, 0.16), 0.05, 6), "dark", CH, 0.01)
searchlight(A, CH, (1.1, 3.62, 0.22), 0.16, (0.25, -0.05, 1))
pivot(P + "spot0", (-1.12, 4.05, 0.42), CH, role="spot", aim=(-0.15, -0.3, 1.0), r=0.26)
pivot(P + "spot1", (1.1, 3.62, 0.38), CH, role="spot", aim=(0.3, -0.3, 1.0), r=0.16)
# a stolen military target-lock pod on the bunker's right shoulder
A.add(bx((0.52, 3.68, 0.1), (0.13, 0.1, 0.17)), "primer", CH, 0.015)
A.add(xf(superquad(0.09, 0.09, 0.09, 1, 1, 8, 5), (0.52, 3.8, 0.1)), "dark", CH, 0.01)
laser_sight(A, CH, (0.52, 3.68, 0.3), (0.0, -0.06, 1), 0.01)

# ---------------- bed: He-3 tanks under frayed MLI, comms, flag ----------------
A.add(bx((0, 2.17, -2.0), (1.28, 0.06, 0.95)), "dark", CH, 0.025)
for sx in (-1, 1):
    plate(A, CH, (sx * 1.27, 2.42, -2.4), (0.035, 0.22, 0.52), (0, 0, sx * 0.05), slot="bleach" if sx < 0 else "body", ink=0.02, out=sx)
    plate(A, CH, (sx * 1.28, 2.4, -1.45), (0.035, 0.2, 0.36), (0.08, 0, sx * 0.04), slot="primer", ink=0.02, out=sx)
plate(A, CH, (0, 2.42, -2.96), (1.2, 0.22, 0.035), (0, 0, 0.03), slot="primer", ink=0.02, bolts=4, out=-1)
for i, sx in enumerate((-1, 1)):
    c = (sx * 0.56, 2.62, -1.95)
    A.add(cyl(c, 0.36, 1.5, 14, rot=(PI / 2, 0, 0)), "tank", CH, 0.03)
    for sz in (-1, 1):
        A.add(xf(superquad(0.36, 0.36, 0.14, 1, 0.6, 14, 3), (c[0], c[1], c[2] + sz * 0.75)), "tank", CH, 0.02)
    mli_blanket(A, CH, c, 0.36, 1.25, (-1.95, 1.95), seed=i)
    for z in (-0.45, 0.45):
        A.add(xf(torus(0.41, 0.025, 16, 4), (c[0], c[1], c[2] + z), (PI / 2, 0, 0)), "dark", CH, 0.006)
    A.add(bx((c[0], 2.3, c[2]), (0.3, 0.08, 0.5)), "dark", CH, 0.01)
# rear bumper, spikes, RCS quads
A.add(beam((-1.35, 2.05, -3.02), (1.35, 2.05, -3.02), 0.08, 6), "dark", CH, 0.02)
for sx in (-1, 1):
    spike(A, CH, (sx * 0.8, 2.05, -3.05), (sx * 0.2, 0, -1), 0.45, 0.09)
    rcs_quad(A, CH, (sx * 1.42, 2.55, -2.75), (sx, 0, 0))
# comms: a bent radar dish on a mast at the back right, antenna needles at the back left
A.add(beam((1.0, 2.2, -2.75), (1.0, 4.15, -2.75), 0.07, 6), "dark", CH, 0.015)
A.add(beam((1.0, 2.8, -2.75), (0.62, 2.2, -2.75), 0.04, 4), "dark", CH, 0.008)
jag_dish(A, CH, (1.0, 4.4, -2.8), 0.62, (0.35, 0.75, -0.6))
for (x, z), ln, lean in (((-1.0, -2.75), 2.6, (-0.12, -0.18)), ((-0.82, -2.82), 1.9, (0.05, -0.25)), ((-1.12, -2.55), 1.45, (-0.2, 0.0))):
    needle(A, CH, (x, 2.2, z), ln, lean)
A.add(beam((-0.75, 2.2, -2.55), (-0.75, 4.2, -2.6), 0.035, 5), "dark", CH, 0.006)
pivot(P + "flag", (-0.75, 4.15, -2.6), CH, role="flag", w=1.1, h=0.75)

# ---------------- turret: ring mount, standing gunner, rotary spray gun ----------------
TP = (CX, 3.6, -0.27)
A.add(cyl((TP[0], TP[1] - 0.02, TP[2]), 0.7, 0.08, 18), "dark", CH, 0.02)
T = pivot(P + "turret", TP, CH, role="turret")
TA = Acc(P + "t_")
TA.add(xf(torus(0.64, 0.055, 22, 5), (0, 0.06, 0)), "steel", T, 0.015)
TA.add(cyl((0, 0.06, 0), 0.6, 0.04, 18), "dark", T, 0)
railing_arc(TA, T, (0, 0.06, 0), 0.62, 0.78, PI * 0.42, PI * 1.58, 5)
TA.add(beam((0, 0.06, 0.3), (0, 0.9, 0.3), 0.075, 6), "dark", T, 0.02)
TA.add(cyl((0, 0.32, 0.3), 0.11, 0.18, 8), "steel", T, 0.01)
# jagged shield, notched for the barrels
shield = [(-0.58, 0.45), (0.55, 0.45), (0.6, 1.0), (0.44, 1.12), (0.32, 0.98), (0.16, 1.02), (0.16, 0.86), (-0.16, 0.86), (-0.16, 1.05),
          (-0.32, 1.16), (-0.48, 1.0), (-0.62, 1.06)]
TA.add(xf(extrude(shield, 0.04, "z"), (0, 0, 0.62), (-0.12, 0, 0)), "bleach", T, 0.025)
TA.add(xf(bx((0.36, 0.86, 0.0), (0.1, 0.02, 0.03)), (0, 0, 0.62), (-0.12, 0, 0)), "lens", T, 0)
for a, b in (((-0.58, 0.45), (0.55, 0.45)), ((0.55, 0.45), (0.6, 1.0)), ((-0.58, 0.45), (-0.62, 1.06))):
    TA.add(xf(weld_geo((a[0], a[1], 0.025), (b[0], b[1], 0.025)), (0, 0, 0.62), (-0.12, 0, 0)), "metal", T, 0.006)
TA.add(xf(bx((-0.32, 0.68, 0.0), (0.16, 0.12, 0.012)), (0, 0, 0.645), (-0.12, 0, 0)), "stripe", T, 0)
for x in (-0.45, 0.45):
    spike(TA, T, (x, 0.95, 0.6), (x * 0.5, 1, 0.25), 0.4, 0.06)
TA.add(bx((0.38, 0.2, -0.3), (0.16, 0.14, 0.22)), "primer", T, 0.015)
BR = pivot(P + "barrel", (0, 1.0, 0.3), T, role="barrel")
BA = Acc(P + "b_")
BA.add(bx((0, 0, -0.08), (0.14, 0.14, 0.3)), "dark", BR, 0.025)
BA.add(cyl((0, 0, 0.32), 0.15, 0.3, 12, rot=(PI / 2, 0, 0)), "dark", BR, 0.02)
for k in range(5):
    a = TAU * k / 5
    BA.add(beam((math.cos(a) * 0.085, math.sin(a) * 0.085, 0.45), (math.cos(a) * 0.085, math.sin(a) * 0.085, 1.6), 0.03, 6), "steel", BR, 0.01)
for z, r in ((1.0, 0.14), (1.55, 0.135)):
    BA.add(cyl((0, 0, z), r, 0.07, 12, rot=(PI / 2, 0, 0)), "dark", BR, 0.012)
BA.add(cyl((-0.31, -0.02, -0.05), 0.24, 0.16, 14, rot=(0, 0, PI / 2)), "stripe", BR, 0.02)
BA.add(cyl((-0.31, -0.02, -0.05), 0.1, 0.18, 8, rot=(0, 0, PI / 2)), "dark", BR, 0)
for sx in (-1, 1):
    BA.add(tube([(sx * 0.1, 0.0, -0.36), (sx * 0.14, -0.04, -0.46), (sx * 0.14, -0.2, -0.46)], [0.03] * 3, 6), "dark", BR, 0.008)
laser_sight(BA, BR, (0.21, 0.1, 0.3), (0, 0, 1), 5.0)
pivot(P + "muzzle", (0, 0, 1.62), BR, role="muzzle")
pivot(P + "crew", (0, 0.08, -0.38), T, role="crew", pose="stand")

# ---------------- wheels ----------------
for i, (sx, sz) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1))):
    monster_wheel(P, i, (sx * WX, WY, sz * WZ), sx, WR, HW, ROOT, cleats=14, spiked=sz > 0, seed=i)

A.flush()
TA.flush()
BA.flush()
ROOT["radius"] = 3.6
ROOT["wheelRadius"] = WR
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == "MESH")
inked = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == "MESH" and o.get("ink", 0) > 0)
print(f"warrig A: {len(C.objects)} objects, {tris} triangles ({inked} inked)")
audit_flips(C.objects)
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    out = sys.argv[-1] if sys.argv[-1].endswith(".glb") else os.path.join(REPO, "docs", "warrig-proposals", "warrig_a.glb")
    export(out, C.objects)
