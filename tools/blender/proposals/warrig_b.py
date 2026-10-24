# PROPOSAL B for the Rustmoon War-Rig: "CRATERCRAB", a six-wheeled cab-forward crawler with its drive out on its back.
#
# Six balloon tyres clawed with scrap paddles, each on its own long swing arm: a lower wishbone and an upper link out to an
# upright, and a tall coilover slanting in to a shoulder tower on the hull, so the rig stands on six crab legs with a
# track wider than it is tall. Up front, set right of centre, a welded pillbox cab with a row of tiny round viewports behind
# crossbar cages and a periscope; to its left a low armoured bow carries the "light crown", a pipe frame of mismatched
# lamps (one huge searchlight, two smaller ones, LED bars at odd angles) and a stolen military target-lock pod with an IR
# laser. A cow-catcher of scrap blades and teeth leads. Mid-ship a pedestal tower carries the turret: a seated pirate
# gunner in a pipe-cage basket behind a ten-barrel volley gun (two rows of five; a 10-round burst is one barrel each), with
# a box magazine and laser sight. Aft is the magnetohydrodynamic drive, open to the sky: an ion-blue plasma channel under
# copper electrode bars between two magnet blocks wound with copper racetrack coils, cooling coils on its feed lines,
# two big radiator fins in a V, and a magnetic nozzle at the tail spitting sparks. Frayed MLI over the cab roof and the
# magnets; a bent radar dish, antenna needles and a flag at the back; RCS quads at the corners. No rust: bleached plate,
# primer and bare metal, welded at every seam.
#
#   MOONRUNNER_REPO=<repo> python3 tools/blender/proposals/warrig_b.py [out.glb]       (or exec() it in Blender)
#
# Frame (three.js axes, metres, before the game's 1.35 scale): origin on the ground in the middle, +z forward.
# Wheels at (+-2.5, 0.95, 2.45 / 0.05 / -2.35), radius 0.95 (root `wheelRadius`), 0.8 wide. Root `radius` 3.8.
# Pivots: warrig (root) > chassis > turret (yaw about y, (0, 3.2, 0.15)) > barrel (pitch about x) > muzzle (empty at the
# barrels' mouth); turret > crew (empty: where the gunner sits, facing +z, `pose` sit); chassis > spot0..2 (searchlight
# beams), flag. Six wheel pivots under the root.

import bpy, math, os, sys

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", "..", ".."))
COLL = "WarRigB"
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "proposals", "warrig_kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)

P = "wb_"
WX, WY, WR, HW = 2.5, 0.95, 0.95, 0.4
WZS = (2.45, 0.05, -2.35)
ROOT = pivot("warrig", (0, 0, 0), None, proposal="b")
CH = pivot(P + "chassis", (0, 0, 0), ROOT, role="chassis")
A = Acc(P)
HT = 2.35  # hull deck height

# ---------------- hull ----------------
hull = [(-3.3, 1.5), (2.6, 1.5), (3.25, 1.95), (3.25, HT), (-3.3, HT)]
A.add(xf(extrude(hull, 1.9, "x"), (0, 0, 0)), "body", CH, 0.07)
A.add(bx((0, 1.42, -0.3), (0.8, 0.08, 2.8)), "dark", CH, 0.03)   # skid plate
for sx in (-1, 1):
    o = 1 if sx > 0 else -1
    plate(A, CH, (sx * 0.985, 1.95, 1.55), (0.035, 0.32, 0.75), (0, 0, 0), slot="bleach", ink=0.025, bolts=3, out=o)
    plate(A, CH, (sx * 0.985, 2.0, -1.2), (0.035, 0.28, 0.95), (0.04, 0, 0), slot="primer" if sx < 0 else "bleach", ink=0.025, bolts=4, out=o)
    plate(A, CH, (sx * 0.99, 1.85, -2.75), (0.03, 0.22, 0.4), (-0.06, 0, 0), slot="primer", ink=0.02, out=o)
    A.add(bx((sx * 0.96, 2.18, 0.4), (0.006, 0.05, 0.6), (0.12, 0, 0)), "stripe", CH, 0)
plate(A, CH, (0, 1.95, -3.32), (0.85, 0.3, 0.03), (0, 0, 0.03), slot="bleach", ink=0.025, bolts=4, out=-1)

# ---------------- crab-leg suspension: six swing arms ----------------
for z in WZS:
    for sx in (-1, 1):
        kn = (sx * 1.98, WY, z)
        # shoulder tower on the hull side
        A.add(bx((sx * 1.08, 2.65, z), (0.13, 0.42, 0.17)), "dark", CH, 0.02)
        weld_loop(A, CH, [(sx * 0.95, 2.25, z - 0.17), (sx * 0.95, 3.07, z - 0.17), (sx * 0.95, 3.07, z + 0.17), (sx * 0.95, 2.25, z + 0.17)])
        # lower wishbone, upper link, upright
        for dz in (-0.38, 0.38):
            A.add(beam((sx * 0.95, 1.62, z + dz), (sx * 1.9, WY - 0.12, z), 0.06, 6), "steel", CH, 0.015)
        A.add(beam((sx * 0.96, 2.25, z), (sx * 1.9, WY + 0.38, z), 0.05, 6), "steel", CH, 0.012)
        A.add(bx((sx * 1.98, WY + 0.1, z), (0.08, 0.36, 0.12)), "dark", CH, 0.015)
        A.add(cyl((sx * 2.04, WY, z), 0.16, 0.12, 10, rot=(0, 0, PI / 2)), "steel", CH, 0.01)
        coilover(A, CH, (sx * 1.72, WY + 0.02, z), (sx * 1.12, 3.12, z), 0.15, 6)

# ---------------- cow-catcher ----------------
for sx in (-1, 1):
    blade = [(3.25, 1.35), (3.85, 1.45), (3.75, 2.25), (3.25, 2.3)]
    A.add(xf(extrude(blade, 0.04, "x"), (0, 0, 0)), "bleach" if sx < 0 else "primer", CH, 0.02)
for k, x in enumerate((-0.9, -0.45, 0.0, 0.45, 0.9)):
    A.add(xf(extrude([(3.25, 1.4), (3.85 - 0.08 * abs(x), 1.5), (3.75 - 0.08 * abs(x), 2.2), (3.25, 2.28)], 0.06, "x"), (x, 0, 0)), "dark" if k % 2 else "metal", CH, 0.015)
A.add(beam((-1.0, 2.25, 3.55), (1.0, 2.25, 3.55), 0.06, 6), "dark", CH, 0.015)
A.add(beam((-1.0, 1.5, 3.82), (1.0, 1.5, 3.82), 0.06, 6), "dark", CH, 0.015)
for k, x in enumerate((-0.95, -0.5, -0.05, 0.4, 0.85)):
    spike(A, CH, (x, 1.48, 3.86), (0, -0.4, 1), 0.38 + 0.1 * (k % 2), 0.08)
for sx in (-1, 1):
    rcs_quad(A, CH, (sx * 1.0, 2.15, 3.05), (sx, 0, 0))
    rcs_quad(A, CH, (sx * 1.0, 2.15, -3.15), (sx, 0, 0))

# ---------------- cab: pillbox right of centre, armoured bow on the left ----------------
pill = [(-0.12, 1.05), (0.85, 1.05), (1.0, 1.25), (1.0, 2.7), (0.85, 2.92), (-0.12, 2.92)]
A.add(xf(extrude([(x, z) for x, z in pill], 1.35, "y"), (0, HT + 0.675, 0)), "body", CH, 0.07)
roof = [(-0.2, 1.0), (0.92, 1.0), (1.08, 1.25), (1.08, 2.75), (0.92, 3.0), (-0.2, 3.0)]
A.add(xf(extrude(roof, 0.08, "y"), (0, HT + 1.39, 0), (0, 0, 0.0)), "dark", CH, 0.03)
plate(A, CH, (0.4, HT + 0.62, 2.945), (0.5, 0.4, 0.03), (0, 0, 0.03), slot="bleach", ink=0.025, bolts=3)
plate(A, CH, (1.025, HT + 0.75, 1.95), (0.03, 0.48, 0.62), (0, 0, -0.03), slot="primer", ink=0.025, bolts=3)
A.add(bx((1.03, HT + 0.2, 1.6), (0.006, 0.05, 0.5), (0.1, 0, 0)), "stripe", CH, 0)
for k, x in enumerate((-0.0, 0.3, 0.62)):
    viewport(A, CH, (x, HT + 1.1, 2.94), 0.075 if k != 1 else 0.06, 0.075, (0, 0, 1), round_=True, bars=(1, 1))
viewport(A, CH, (1.02, HT + 1.1, 2.25), 0.12, 0.035, (1, 0, 0), bars=(1, 0))
# periscope and sensor spikes on the roof
A.add(bx((0.65, HT + 1.6, 2.6), (0.08, 0.18, 0.08)), "dark", CH, 0.015)
A.add(bx((0.65, HT + 1.72, 2.67), (0.07, 0.05, 0.02)), "lens", CH, 0)
for k, (x, z) in enumerate(((0.1, 1.3), (0.35, 1.2), (0.6, 1.35))):
    spike(A, CH, (x, HT + 1.42, z), (0.15 * (k - 1), 1, -0.25), 0.55 + 0.2 * (k % 2), 0.05, "steel")
# frayed MLI over the roof's back half
A.add(bx((0.43, HT + 1.455, 1.5), (0.62, 0.025, 0.42)), "mli", CH, 0.012)
for k in range(6):
    z = 1.12 + 0.14 * k
    j = (k * 5) % 4
    A.add(xf(extrude([(-0.05, 0.0), (0.05, 0.0), (0.012 * (j - 1.5), -0.12 - 0.05 * j)], 0.016, "x"), (1.06, HT + 1.45, z)), "mli" if k % 2 else "foil", CH, 0)
# hatch with a grab bar (the driver's way in)
A.add(cyl((0.3, HT + 1.46, 2.35), 0.24, 0.06, 12), "primer", CH, 0.015)
A.add(tube([(0.15, HT + 1.49, 2.35), (0.2, HT + 1.6, 2.35), (0.4, HT + 1.6, 2.35), (0.45, HT + 1.49, 2.35)], [0.022] * 4, 4), "steel", CH, 0.006)
# the low bow on the left
bow = [(1.05, 0.0), (2.95, 0.0), (2.95, 0.25), (2.3, 0.6), (1.05, 0.6)]
A.add(xf(extrude([(z, y) for z, y in bow], 0.88, "x"), (-0.56, HT, 0)), "body", CH, 0.05)
plate(A, CH, (-0.56, HT + 0.47, 2.62), (0.42, 0.03, 0.3), (0.5, 0, 0.04), slot="bleach", ink=0.02, bolts=2)

# light crown: pipe frame on the bow, mismatched lamps
for x in (-0.98, -0.18):
    A.add(tube([(x, HT + 0.58, 1.45), (x, HT + 1.55, 1.75), (x, HT + 1.55, 2.6), (x, HT + 0.25, 2.92)], [0.05] * 4, 6), "dark", CH, 0.015)
A.add(beam((-0.98, HT + 1.55, 2.2), (-0.18, HT + 1.55, 2.2), 0.045, 6), "dark", CH, 0.012)
searchlight(A, CH, (-0.58, HT + 1.12, 2.78), 0.36, (-0.05, -0.15, 1))
searchlight(A, CH, (-0.98, HT + 1.85, 2.3), 0.17, (-0.35, -0.2, 1))
searchlight(A, CH, (-0.22, HT + 1.83, 2.35), 0.15, (0.2, -0.25, 1))
ledbar(A, CH, (-0.58, HT + 1.66, 2.62), 5, 0.12, (0.15, 0, 0))
ledbar(A, CH, (-1.08, HT + 0.85, 2.55), 3, 0.1, (0, -0.1, PI / 2 - 0.05), h=0.07)
ledbar(A, CH, (-0.05, HT + 0.62, 2.95), 2, 0.12, (0.1, 0, 0.08))
pivot(P + "spot0", (-0.58, HT + 1.12, 3.0), CH, role="spot", aim=(-0.05, -0.3, 1.0), r=0.36)
pivot(P + "spot1", (-0.98, HT + 1.85, 2.4), CH, role="spot", aim=(-0.35, -0.3, 1.0), r=0.17)
pivot(P + "spot2", (-0.22, HT + 1.83, 2.45), CH, role="spot", aim=(0.25, -0.3, 1.0), r=0.15)
A.add(bx((-0.58, HT + 0.72, 2.3), (0.14, 0.12, 0.2)), "primer", CH, 0.015)
laser_sight(A, CH, (-0.58, HT + 0.72, 2.5), (0, -0.05, 1), 0.01)

# ---------------- gun tower and turret ----------------
TPY = 3.2
A.add(cyl((0, (HT + TPY) / 2, 0.15), 0.34, TPY - HT, 12), "dark", CH, 0.03)
for k in range(4):
    a = TAU * k / 4 + PI / 4
    g = [(0.0, 0.0), (0.42, 0.0), (0.0, 0.5)]
    A.add(xf(extrude(g, 0.04, "z"), (math.sin(a) * 0.3, HT, 0.15 + math.cos(a) * 0.3), (0, a - PI / 2, 0)), "steel", CH, 0.01)
A.add(cyl((0, TPY - 0.02, 0.15), 0.62, 0.08, 18), "dark", CH, 0.02)
T = pivot(P + "turret", (0, TPY, 0.15), CH, role="turret")
TA = Acc(P + "t_")
TA.add(xf(torus(0.58, 0.05, 20, 5), (0, 0.05, 0)), "steel", T, 0.015)
TA.add(cyl((0, 0.05, 0), 0.55, 0.04, 18), "dark", T, 0)
# the seat and the cage basket round the gunner
TA.add(bx((0, 0.3, -0.36), (0.26, 0.06, 0.24)), "primer", T, 0.02)
TA.add(bx((0, 0.75, -0.6), (0.26, 0.42, 0.05), (-0.18, 0, 0)), "primer", T, 0.02)
TA.add(beam((0, 0.05, -0.36), (0, 0.25, -0.36), 0.07, 6), "dark", T, 0.01)
for sx in (-1, 1):
    TA.add(tube([(sx * 0.48, 0.05, -0.32), (sx * 0.5, 1.2, -0.42), (sx * 0.38, 1.62, -0.2), (sx * 0.36, 1.62, 0.12), (sx * 0.5, 1.15, 0.38), (sx * 0.5, 0.05, 0.3)],
                [0.04] * 6, 6), "dark", T, 0.012)
    TA.add(beam((sx * 0.5, 0.6, -0.36), (sx * 0.5, 0.6, 0.33), 0.03, 4), "dark", T, 0.008)
TA.add(beam((-0.38, 1.62, -0.2), (0.38, 1.62, -0.2), 0.035, 4), "dark", T, 0.008)
TA.add(beam((-0.36, 1.62, 0.12), (0.36, 1.62, 0.12), 0.035, 4), "dark", T, 0.008)
plate(TA, T, (0, 1.64, -0.04), (0.36, 0.02, 0.17), (0, 0, 0.05), slot="bleach", ink=0.015)
# ammo crates on the ring
TA.add(bx((0.38, 0.22, -0.05), (0.12, 0.16, 0.2)), "stripe", T, 0.015)
TA.add(bx((-0.4, 0.2, 0.0), (0.1, 0.14, 0.16), (0, 0.2, 0)), "primer", T, 0.015)
BR = pivot(P + "barrel", (0, 0.92, 0.42), T, role="barrel")
BA = Acc(P + "b_")
BA.add(bx((0, 0, 0.05), (0.32, 0.17, 0.26)), "dark", BR, 0.025)
for row in (-1, 1):
    for k in range(5):
        x = -0.24 + 0.12 * k
        BA.add(beam((x, row * 0.075, 0.3), (x, row * 0.075, 1.38), 0.04, 6), "steel", BR, 0.01)
for z in (0.75, 1.3):
    BA.add(bx((0, 0, z), (0.32, 0.15, 0.04)), "dark", BR, 0.012)
BA.add(bx((0, 0, 1.36), (0.31, 0.135, 0.012)), "metal", BR, 0)
BA.add(bx((0.46, -0.06, -0.02), (0.13, 0.2, 0.22)), "stripe", BR, 0.015)
BA.add(bx((0.33, -0.04, -0.02), (0.012, 0.08, 0.12)), "dark", BR, 0)
for sx in (-1, 1):
    BA.add(tube([(sx * 0.22, -0.05, -0.2), (sx * 0.25, -0.1, -0.32), (sx * 0.25, -0.24, -0.32)], [0.03] * 3, 6), "dark", BR, 0.008)
plate(BA, BR, (0.0, 0.01, 0.5), (0.36, 0.2, 0.02), (0, 0, 0.0), slot="bleach", ink=0.02, weld=False)
laser_sight(BA, BR, (0.0, 0.23, 0.35), (0, 0, 1), 5.0)
BA.add(cyl((-0.36, 0.14, 0.2), 0.045, 0.4, 8, rot=(PI / 2, 0, 0)), "dark", BR, 0.008)
BA.add(cyl((-0.36, 0.14, 0.41), 0.04, 0.02, 8, rot=(PI / 2, 0, 0)), "lens", BR, 0)
pivot(P + "muzzle", (0, 0, 1.4), BR, role="muzzle")
pivot(P + "crew", (0, -0.25, -0.32), T, role="crew", pose="sit")

# ---------------- the MHD drive, open on the back ----------------
Z0, Z1 = -0.75, -2.85
ZM = (Z0 + Z1) / 2
L = Z0 - Z1
A.add(bx((0, HT + 0.06, ZM), (0.42, 0.06, L / 2 + 0.05)), "dark", CH, 0.02)
A.add(bx((0, HT + 0.32, ZM), (0.2, 0.17, L / 2)), "plasma", CH, 0)
for sx in (-1, 1):
    A.add(bx((sx * 0.3, HT + 0.32, ZM), (0.06, 0.24, L / 2)), "steel", CH, 0.02)
    # magnet block wound with two racetrack coils
    A.add(bx((sx * 0.68, HT + 0.4, ZM), (0.3, 0.36, L / 2 - 0.1)), "dark", CH, 0.04)
    for zc in (ZM + 0.5, ZM - 0.5):
        for k, w in enumerate((0.0, 0.07)):
            A.add(xf(torus(0.2 + w, 0.05, 14, 4), (sx * (0.97 + 0.02 * k), HT + 0.4, zc), (0, 0, PI / 2), s=(1.0, 1.0, 1.7)), "copper", CH, 0.01)
        A.add(xf(bx((0, 0, 0), (0.03, 0.06, 0.24)), (sx * 0.99, HT + 0.4, zc)), "dark", CH, 0)
    # cooling coil on the feed line along the block's top
    A.add(beam((sx * 0.68, HT + 0.84, Z0 + 0.15), (sx * 0.68, HT + 0.84, Z1 - 0.05), 0.045, 6), "steel", CH, 0.008)
    A.add(coil_spring((sx * 0.68, HT + 0.84, Z0 + 0.1), (sx * 0.68, HT + 0.84, Z1), 0.1, 6, 0.026, 6), "copper", CH, 0.006)
    # radiator fin in a V
    rf = (sx * 1.0, HT + 1.35, ZM - 0.1)
    A.add(bx(rf, (0.03, 0.55, 0.85), (0, 0, -sx * 0.38)), "metal", CH, 0.025)
    for k in range(7):
        A.add(xf(bx((0, 0, -0.72 + 0.24 * k), (0.05, 0.5, 0.012)), rf, (0, 0, -sx * 0.38)), "dark", CH, 0)
    A.add(beam((sx * 0.72, HT + 0.76, ZM - 0.6), (sx * 0.86, HT + 1.0, ZM - 0.6), 0.04, 4), "dark", CH, 0.008)
    A.add(beam((sx * 0.72, HT + 0.76, ZM + 0.4), (sx * 0.86, HT + 1.0, ZM + 0.4), 0.04, 4), "dark", CH, 0.008)
# electrode bars across the channel, the plasma glowing between them
for k in range(8):
    z = Z0 - 0.12 - 0.26 * k
    A.add(bx((0, HT + 0.52, z), (0.34, 0.035, 0.04)), "copper", CH, 0.008)
# MLI draped over the magnet blocks' fronts
for sx in (-1, 1):
    A.add(bx((sx * 0.68, HT + 0.785, Z0 - 0.35), (0.33, 0.022, 0.32)), "mli", CH, 0.012)
    for k in range(4):
        z = Z0 - 0.1 - 0.16 * k
        j = (k * 3 + (sx > 0)) % 4
        A.add(xf(extrude([(-0.05, 0.0), (0.05, 0.0), (0.01 * (j - 1.5), -0.1 - 0.05 * j)], 0.016, "x"), (sx * 1.0, HT + 0.78, z)), "foil" if j % 2 else "mli", CH, 0)
# magnetic nozzle at the tail, spitting sparks
NZ = (0, HT + 0.36, Z1 - 0.05)
A.add(xf(lathe([(0.22, 0.0), (0.26, 0.15), (0.36, 0.38), (0.46, 0.55), (0.42, 0.56), (0.33, 0.4), (0.2, 0.02)], 12), NZ, (-PI / 2, 0, 0)), "steel", CH, 0.02)
for k in range(3):
    A.add(xf(torus(0.3 + 0.06 * k, 0.03, 12, 3), (NZ[0], NZ[1], NZ[2] - 0.18 - 0.15 * k), (PI / 2, 0, 0)), "copper", CH, 0.006)
A.add(cyl((NZ[0], NZ[1], NZ[2] - 0.2), 0.2, 0.04, 10, rot=(PI / 2, 0, 0)), "plasma", CH, 0)
for k in range(7):
    a = TAU * k / 7
    d = 0.75 + 0.14 * (k % 3)
    A.add(octa((NZ[0] + math.cos(a) * 0.12 * (k % 2 + 1), NZ[1] + math.sin(a) * 0.12 * (k % 2 + 1), NZ[2] - d), 0.04 - 0.004 * (k % 3)), "ion", CH, 0)

# ---------------- comms and flag at the back ----------------
A.add(beam((-0.8, HT, -2.95), (-0.8, HT + 2.3, -2.95), 0.07, 6), "dark", CH, 0.015)
A.add(beam((-0.8, HT + 0.6, -2.95), (-0.5, HT, -2.6), 0.04, 4), "dark", CH, 0.008)
jag_dish(A, CH, (-0.8, HT + 2.55, -3.0), 0.72, (-0.4, 0.8, -0.45), seed=5)
for (x, z), ln, lean in (((0.75, -3.0), 2.4, (0.15, -0.2)), ((0.6, -3.1), 1.7, (-0.05, -0.3)), ((0.9, -2.8), 1.3, (0.25, 0.0))):
    needle(A, CH, (x, HT, z), ln, lean)
A.add(beam((0.45, HT, -2.95), (0.45, HT + 2.05, -3.0), 0.035, 5), "dark", CH, 0.006)
pivot(P + "flag", (0.45, HT + 2.0, -3.0), CH, role="flag", w=1.0, h=0.7)

# ---------------- wheels ----------------
i = 0
for z in WZS:
    for sx in (-1, 1):
        monster_wheel(P, i, (sx * WX, WY, z), sx, WR, HW, ROOT, cleats=12, spiked=z > 1, seed=i)
        i += 1

A.flush()
TA.flush()
BA.flush()
ROOT["radius"] = 3.8
ROOT["wheelRadius"] = WR
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == "MESH")
inked = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == "MESH" and o.get("ink", 0) > 0)
print(f"warrig B: {len(C.objects)} objects, {tris} triangles ({inked} inked)")
audit_flips(C.objects)
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    out = sys.argv[-1] if sys.argv[-1].endswith(".glb") else os.path.join(REPO, "docs", "warrig-proposals", "warrig_b.glb")
    export(out, C.objects)
