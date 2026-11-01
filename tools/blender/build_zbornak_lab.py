# Dr. Zbornak's Antimatter Research Lab, the rework of the whole plateau (r 120 m), built from code in Blender. The draft
# picked from the two first proposals (A: the Rotunda, the Elder, LABNET) with its revisions. Not in the game:
# docs/zbornak-proposals/README.md is the brief and the review; preview_zbornak_lab.py renders it.
#
#   MOONRUNNER_REPO=. python3 tools/blender/build_zbornak_lab.py      builds it into the scene and exports
#                                                                     docs/zbornak-proposals/zbornak.glb (the doctor alone,
#                                                                     plain, in the game's GLB contract)
# Area frame = the location's frame in the game (world.buildLab): origin at the plateau's centre, +z toward the front.
#
# The Rotunda: a domed round lab 64 m across, the reactor rising through an oculus to a crown of rings 44 m up. A ribbed
# airlock tunnel runs to a lock housing (ZBORNAK LABORATORIES over a round pressure door; the security camera on a round
# mount photographs the visitor on the stand plate). Inside, about the reactor (its catwalk, the stair up to it and the
# bridge to the intake hatch), clockwise from the door: LABNET on the wall right of the door, Zbornak's dais, the petrified
# gallery, the robotics bay, the exotic-matter wall and its magnetic cages, the splice pod, the cryo pods, the sealed
# hydroponics habitat, the holotable. A cable tray runs round the wall at 6.2 m; every pipe and cable ends in it, a socket
# or a flange. Outside: the plaza, paved walks to the supply pad and the ranch gate, the Zbornak containers (the standard
# cargo box), a radiator field piped to the reactor, a solar array cabled in, gas racks, the generator. The ranch east of it.

import bpy, math, os, sys

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", ".."))
OUTDIR = os.path.join(REPO, "docs", "zbornak-proposals")
COLL = "ZbornakLab"


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    # the lab (the game's lab colours: settlements.js dressLab)
    "wall": "e8e4f4", "wall2": "c9c4d8", "roof": "3a3550", "panel": "5b5870", "dark": "2a2540", "steel": "55607a", "metal": "8a87a0",
    "hazard": "ffd23f", "floor": "6b6880", "floor2": "403a58", "floorhab": "a9d8cf", "white": "f3eee4", "arm": "ff9f1c", "armdark": "2a2540",
    "cable": "1d1a29", "copper": "b87333", "brass": "d8a060", "seat": "6b6880", "rubber": "1d1a29", "stone": "9a94a8", "void": "0e0814",
    "plant": "3a6a4a", "plant2": "2f5a5a", "soil": "3a2a2a", "path": "7a7590", "solar": "26325e", "door": "8a87a0",
    # the Zbornak containers (cargo.py's box: body, stripe, label are the livery)
    "body": "4b3a7a", "stripe": "7dff3a", "label": "f3eee4",
    # the ranch
    "barn": "8b4044", "barn2": "6a2e33", "wood": "9a6a3a", "wood2": "6e4a2a", "trim": "f3eee4", "corr": "9aa7bb", "moss": "8aa860",
    "moss2": "5a7a40", "dirt": "8a7a6a", "roof2": "3b393a", "barnint": "5a3a2a",
    # glows (lit in the preview and in the game)
    "lime": "7dff3a", "pink": "ff2e88", "pinkhot": "ffd0f0", "cyan": "2ec4ff", "teal": "2ee6c0", "vio": "c77dff", "amber": "ff9f1c",
    "red": "ff2a4a", "lamp": "fff6a8", "spark": "cfe6ff", "weldcore": "9cc4ff", "weldhalo": "1648ff", "screenlit": "8dffb4",
    "holo": "2ec4ff", "beam": "9be7ff", "scan": "7dff3a", "halo": "c77dff", "ember": "ff7a1a", "goggle": "7dff3a", "feed": "7dff3a",
    "feed2": "b8ff9e", "water": "3a8bd5", "window": "fff0b0", "screen": "102018",
    # see-through
    "glass": "9be7ff", "glassg": "b8ffe0", "frost": "d8f4ff", "smoke": "9a94a8", "habglass": "bff4ff",
    # Zbornak
    "coat": "f3eee4", "coat2": "d6d0c2", "scorch": "231c22", "scorch2": "6b4a3a", "shirt": "b8e0ff", "tie": "2e8b57", "trousers": "3a3550",
    "shoe": "1d1a29", "eye": "0d0a14", "soot": "3a3438", "glove": "a0602a", "board": "b07c57", "paper": "fff8e8", "inkline": "2a2540",
    "skin": "a8d8a0", "skin2": "6fae74", "iris": "ffd23f",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
GLOW = {"lime", "pink", "pinkhot", "cyan", "teal", "vio", "amber", "red", "lamp", "spark", "weldcore", "weldhalo", "screenlit", "holo",
        "beam", "scan", "halo", "ember", "goggle", "feed", "feed2", "water", "window", "iris", "screen"}
SEE = {"glass": 0.18, "glassg": 0.14, "frost": 0.5, "smoke": 0.35, "habglass": 0.12, "holo": 0.35, "beam": 0.1, "scan": 0.12,
       "halo": 0.18, "weldhalo": 0.55}

for f in ("kit.py", "decals.py", "cargo.py", "zbornak_kit.py", "zbornak_figure.py"):
    exec(open(os.path.join(REPO, "tools", "blender", f), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)
RUNNER = {}     # where the preview stands the courier: name -> ((x, y, z), yaw)


def ring_wall(g, R, T, H, gaps=(), n=72, slot="wall"):
    """a round wall of n flat panels (inner radius R, T thick, H tall); gaps [(angle, width)] left open"""
    for i in range(n):
        a = TAU * (i + 0.5) / n
        if any(abs((a - ga + PI) % TAU - PI) * R < gw / 2 + 0.3 for ga, gw in gaps):
            continue
        rr = R + T / 2
        g(slot).boxc(math.sin(a) * rr, H / 2, math.cos(a) * rr, TAU * rr / n * 1.04, H, T, (0, a, 0))


def railing_ring(g, r, y, gap=None, step=1.4):
    n = max(8, int(TAU * r / step))
    for i in range(n):
        a = TAU * i / n
        if gap and abs((a - gap[0] + PI) % TAU - PI) * r < gap[1] / 2:
            continue
        g("steel", 0.015).cylc(math.sin(a) * r, y + 0.55, math.cos(a) * r, 0.035, 1.1, 5)
    g("hazard", 0.015).tor(r, 0.045, (0, y + 1.1, 0), n=max(24, n), rs=5)
    g("steel", 0.0).tor(r, 0.03, (0, y + 0.55, 0), n=max(24, n), rs=4)


def slope_box(g, slot, p0, p1, x0, x1, t=0.25, ink=None):
    """a roof slab between profile points p0, p1 = (z, y), running x0..x1, t thick (laid on top of the line)"""
    dz, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dz, dy)
    th = math.atan2(-dy, dz)
    nz, ny = -dy / L, dz / L
    if ny < 0:
        nz, ny = -nz, -ny
    g(slot, ink).boxc((x0 + x1) / 2, (p0[1] + p1[1]) / 2 + ny * t / 2, (p0[0] + p1[0]) / 2 + nz * t / 2, x1 - x0, t, L + 0.1, (th, 0, 0))


def gas_rack(g, x, z, yaw):
    g.at(x, z, yaw)
    g("dark").boxc(0, 0.15, 0, 3, 0.3, 8)
    for i in range(6):
        g(("panel", "white", "steel")[i % 3]).cylc(0, 1.5, -2.8 + i * 1.1, 0.4, 2.4, 10)
        g(("lime", "pink", "cyan")[i % 3], 0.0).tor(0.41, 0.05, (0, 2.2, -2.8 + i * 1.1), n=12, rs=4)
        g("steel").ball(0, 2.85, -2.8 + i * 1.1, 0.3, 8, 6)
    g("hazard", 0.0).boxc(0.6, 1.8, 0, 0.2, 0.2, 8)
    g.at()




def dome_y(prof, r):
    """the dome's underside height at radius r (its profile runs outward-in)"""
    for (r0, y0), (r1, y1) in zip(prof, prof[1:]):
        if r1 <= r <= r0:
            return y0 + (y1 - y0) * (r0 - r) / (r0 - r1)
    return prof[-1][1]


def arc_box(g, slot, ink, r, a0, a1, y, h, d, seg_len=2.0):
    """a band of boxes along an arc (a tray, a kerb, a beam): radius r, angles a0..a1, centred at height y"""
    n = max(1, int(abs(a1 - a0) * r / seg_len))
    for i in range(n):
        a = a0 + (a1 - a0) * (i + 0.5) / n
        g(slot, ink).boxc(math.sin(a) * r, y, math.cos(a) * r, abs(a1 - a0) * r / n * 1.02, h, d, (0, a, 0))


def wall_flange(g, x, z, y, toward, r=0.5):
    """a flange where a pipe or cable meets a wall: a ring plate turned to face `toward` (an angle about y)"""
    g("dark", 0.02).cylc(x, y, z, r, 0.2, 14, rot=(PI / 2, toward, 0))
    g("steel", 0.0).cylc(x, y, z, r * 0.6, 0.26, 12, rot=(PI / 2, toward, 0))


def ground_run(g, pts, y=0.15, r=0.14, slot="cable"):
    """a conduit laid along the ground on blocks every 5 m"""
    g(slot, 0.0).path([(p[0], y, p[1]) for p in pts], r, 6)
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(bx - ax, bz - az) / 5))
        for k in range(n + 1):
            t = k / n
            g("stone", 0.0).boxc(ax + (bx - ax) * t, y / 2, az + (bz - az) * t, 0.5, y, 0.5)


def build_lab(root):
    CX, CZ, R, T, H = 0.0, -18.0, 30.0, 1.2, 12.0
    lab = G("lab", root, CX, 0, CZ)
    top = G("lab_roof", root, CX, 0, CZ)
    top.root["cutaway"] = 1

    def P(deg, r):
        a = math.radians(deg)
        return math.sin(a) * r, math.cos(a) * r, a + PI

    def W(lx, lz):                                                          # lab-local -> area
        return (CX + lx, CZ + lz)

    # ---- shell: plinth, wall with portholes, radiator fins, ring beam, ribbed dome, oculus
    ring_wall(lab, R, T, H, gaps=[(0.0, 7.0)])
    ring_wall(lab, R + T, 0.6, 1.2, gaps=[(0.0, 7.4)], slot="panel")
    for i in range(48):
        a = TAU * (i + 0.5) / 48
        if abs((a + PI) % TAU - PI) * R < 6:
            continue
        p = (math.sin(a) * (R + T + 0.05), 8.2, math.cos(a) * (R + T + 0.05))
        lab("window", 0.0).cylc(*p, 0.55, 0.12, 14, rot=(PI / 2, a, 0))
        lab("dark", 0.02).tor(0.62, 0.1, p, (PI / 2, a, 0), n=16, rs=5)
    for i in range(16):
        a = TAU * (i + 0.5) / 16
        if abs((a + PI) % TAU - PI) < 0.3:
            continue
        lab.at(math.sin(a) * (R + T), math.cos(a) * (R + T), a)
        lab("wall2", 0.05).polyx([(0, 0), (5.2, 0), (5.2, 1.6), (1.4, H + 1.2), (0, H + 1.2)], -0.55, 0.55)
        lab("cyan", 0.0).polyx([(4.0, 1.6), (4.25, 1.6), (0.9, H + 0.6), (0.65, H + 0.6)], -0.58, 0.58)
        for k in range(5):
            lab("steel", 0.0).boxc(0.0, 2.6 + k * 1.7, 2.2 - k * 0.25, 1.3, 0.08, 1.6 - k * 0.18)
        lab.at()
    top("wall2", 0.06).tor(R + T + 0.2, 0.55, (0, H + 0.1, 0), n=72, rs=8)
    prof = [(R + T + 0.3, H + 0.3), (R + 0.2, H + 4), (R - 2.5, H + 8.0), (R - 7.5, H + 11.5), (R - 15, H + 14), (7.0, H + 14.8)]
    top("roof", 0.07).lath(prof, segs=72)
    for i in range(24):
        a = TAU * i / 24
        pts = [(math.sin(a) * (r + 0.25), y + 0.2, math.cos(a) * (r + 0.25)) for r, y in prof]
        top("wall2", 0.03).path(pts, 0.28, 6)
    top("lime", 0.0).tor(R + 0.4, 0.12, (0, H + 3.6, 0), n=96, rs=4)
    top("wall2", 0.05).lath([(6.2, H + 14.5), (8.0, H + 14.6), (8.0, H + 15.6), (6.2, H + 15.8), (6.2, H + 14.5)], segs=40)
    top("pink", 0.0).tor(7.1, 0.12, (0, H + 15.75, 0), n=40, rs=4)
    for i in range(12):                                                    # ceiling lamps, each hung on two rods from the dome
        a = TAU * (i + 0.5) / 12
        rr = R - 4.0
        yd = dome_y(prof, rr)
        top("lamp", 0.0).boxc(math.sin(a) * rr, yd - 1.0, math.cos(a) * rr, 2.4, 0.12, 0.5, (0, a, 0))
        top("dark", 0.02).boxc(math.sin(a) * rr, yd - 0.9, math.cos(a) * rr, 2.6, 0.1, 0.6, (0, a, 0))
        for k in (-1, 1):
            q = rot_y((k * 1.0, 0, 0), a)
            top("steel", 0.0).bm((math.sin(a) * rr + q[0], yd - 0.85, math.cos(a) * rr + q[2]), (math.sin(a) * rr + q[0], dome_y(prof, rr) + 0.05, math.cos(a) * rr + q[2]), 0.03, 4)
    for i in range(8):
        a = TAU * (i + 0.5) / 8
        lab.light((math.sin(a) * 20, 11, math.cos(a) * 20), (0.92, 0.88, 1.0), 2500, 1.5)
    # the cable tray round the inner wall at 6.2 m (the door aside), every line in the lab ends in it
    arc_box(lab, "steel", 0.02, R - 0.25, 0.15, TAU - 0.15, 6.2, 0.18, 0.5)
    arc_box(lab, "dark", 0.0, R - 0.47, 0.15, TAU - 0.15, 6.32, 0.08, 0.04)

    # ---- airlock: ribbed tunnel, lock housing, round pressure door, the sign, the security post
    z0, z1 = R + T - 0.5, 44.0
    lab("wall", 0.06).add(cylinder(3.6, 3.6, z1 - z0, 28, True)[:2], (0, 2.4, (z0 + z1) / 2), (PI / 2, 0, 0))
    for k in range(9):
        lab("wall2", 0.03).tor(3.75, 0.18, (0, 2.4, z0 + 1.0 + k * (z1 - z0 - 2) / 8), (PI / 2, 0, 0), n=28, rs=5)
    lab("lime", 0.0).boxc(0, 6.04, (z0 + z1) / 2, 0.25, 0.06, z1 - z0 - 1)
    lab("wall", 0.07).boxc(0, 5.0, z1 + 3, 13, 10, 6)
    lab("roof", 0.05).boxc(0, 10.2, z1 + 3, 13.6, 0.4, 6.6)
    lab("hazard", 0.02).boxc(0, 9.6, z1 + 6.05, 13.0, 0.5, 0.1)
    DY, DR = 3.0, 3.13
    lab("hazard", 0.03).tor(2.85, 0.28, (0, DY, z1 + 6.05), (PI / 2, 0, 0), n=40, rs=6)
    lab("door", 0.03).cylc(0, DY, z1 + 6.05, 2.6, 0.25, 32, "z")
    lab("dark", 0.0).boxc(0, DY, z1 + 6.19, 5.1, 0.08, 0.04).boxc(0, DY, z1 + 6.19, 0.08, 5.1, 0.04)
    for k in range(8):
        a = TAU * k / 8
        lab("steel", 0.0).cylc(math.sin(a) * 2.3, DY + math.cos(a) * 2.3, z1 + 6.2, 0.12, 0.06, 8, "z")
    lab("dark", 0.02).cylc(0, DY, z1 + 6.25, 0.6, 0.15, 16, "z")
    lab("lime", 0.0).tor(0.62, 0.05, (0, DY, z1 + 6.33), (PI / 2, 0, 0), n=20, rs=4)
    for k in (-1, 1):
        lab("dark").boxc(k * 6.0, 9.0, z1 + 6.3, 0.6, 0.5, 0.6)
        lab("lamp", 0.0).boxc(k * 6.0, 8.8, z1 + 6.62, 0.45, 0.25, 0.04)
    lab("dark", 0.04).boxc(0, 8.65, z1 + 6.1, 9.0, 1.2, 0.16)
    lab("pink", 0.0).boxc(0, 9.22, z1 + 6.19, 8.8, 0.05, 0.02)
    lab.text("ZBORNAK LABORATORIES", (0, 8.33, z1 + 6.19), 0, 0.68, "pink")
    plate = security_post(lab, 0, z1 + 6.0, 0, DY, DR, "sec")
    RUNNER["gate"] = ((plate[0] + CX, 0, plate[2] + CZ), PI)
    lab("hazard", 0.02).tor(2.9, 0.22, (0, DY, R - 0.1), (PI / 2, 0, 0), n=40, rs=6)            # the inner door's frame

    # ---- floor: disc, bands, the reactor's pit and railing, the reactor, the catwalk, its stair, the intake bridge
    lab("floor", 0.0).cylc(0, 0.03, 0, R + 0.2, 0.06, 72)
    for i in range(36):
        a = TAU * i / 36
        lab("floor2", 0.0).boxc(math.sin(a) * 19, 0.065, math.cos(a) * 19, 0.5, 0.01, 22, (0, a, 0))
    for r_, c in ((8.0, "lime"), (18.0, "cyan"), (28.5, "lime")):
        lab(c, 0.0).tor(r_, 0.08, (0, 0.07, 0), n=72, rs=4, s=(1, 0.15, 1))
    lab("dark", 0.0).cylc(0, 0.075, 0, 7.4, 0.03, 48)
    railing_ring(lab, 7.6, 0.06)
    RE = 3.4
    reactor(G("reactor", lab.root), 22, RE, 3, crown_y=H + 21, collar_y=8.6)
    CW = 6.6                                                                # catwalk deck height
    lab("panel", 0.04).lath([(9.6, CW - 0.3), (11.6, CW - 0.3), (11.6, CW), (9.6, CW), (9.6, CW - 0.3)], segs=64)
    lab("cyan", 0.0).tor(11.62, 0.05, (0, CW - 0.15, 0), n=64, rs=4)
    railing_ring(lab, 9.7, CW, gap=(-PI / 2, 2.0), step=1.6)
    railing_ring(lab, 11.5, CW, gap=(-PI / 2, 1.5), step=1.6)
    for i in range(6):
        a = TAU * i / 6 + 0.3
        lab("steel", 0.03).cylc(math.sin(a) * 10.6, (CW - 0.3) / 2, math.cos(a) * 10.6, 0.22, CW - 0.3, 8)
    lab.at(-11.6, 0, -PI / 2)                                              # the stair up to the catwalk, from the west
    for k in range(26):
        lab("panel", 0.02).boxc(0, CW / 26 * (k + 1) - 0.06, 7.8 - 0.3 * k, 1.4, 0.12, 0.34)
    for sx in (-0.75, 0.75):
        lab("steel", 0.02).bm((sx, 0.0, 7.95), (sx, CW - 0.1, 0.0), 0.07, 5)
        lab("hazard", 0.0).bm((sx, 1.1, 7.95), (sx, CW + 1.1, 0.0), 0.04, 5)
        lab("steel", 0.0).bm((sx, 0.0, 7.95), (sx, 1.1, 7.95), 0.035, 4)
    lab.at()
    reactor_intake(lab, RE, -PI / 2, CW, 9.6)
    RUNNER["intake"] = ((CX - 7.4, CW, CZ + 0.35), PI / 2 + 0.3)
    ia = math.radians(-105)
    CAMS["intake"] = ((CX + math.sin(ia) * 11.2, CW + 2.6, CZ + math.cos(ia) * 11.2), (CX - 5.4, CW + 0.7, CZ), 26)

    # ---- stations round the wall (angle from the door, clockwise seen from above)
    # LABNET on the wall right of the door as you come in
    x, z, yw = P(14, R)
    lab_terminal_wall(lab, x, z, yw, "lab")
    xa, za, _ = P(14, R - 6.5)
    CAMS["term"] = ((CX + xa - 1.0, 2.4, CZ + za), (CX + x - math.sin(yw) * 0.3, 2.2, CZ + z - math.cos(yw) * 0.3), 32)
    xr, zr, _ = P(19.5, R - 2.0)
    RUNNER["term"] = ((CX + xr, 0, CZ + zr), math.radians(14) + 0.5)
    # Zbornak's dais: a round step, a workbench, a monitor on a post, the doctor facing the door
    x, z, _ = P(24, 13.5)
    lab("panel", 0.04).cylc(x, 0.18, z, 2.8, 0.36, 28)
    lab("lime", 0.0).tor(2.8, 0.05, (x, 0.36, z), n=32, rs=4)
    fy = math.atan2(0 - x, R - z)
    lab.at(x, z, fy)
    lab("cyan", 0.05).boxc(0, 0.9, 1.15, 2.6, 1.1, 0.8)
    lab("dark", 0.03).boxc(0, 1.5, 1.15, 2.8, 0.1, 1.0)
    lab("pink", 0.0).ball(-0.8, 1.75, 1.2, 0.2, 8, 6)
    lab("steel", 0.0).cylc(-0.8, 1.58, 1.2, 0.12, 0.06, 10)
    lab("glass", 0.0).cylc(0.6, 1.75, 1.1, 0.12, 0.4, 10)
    lab("lime", 0.0).cylc(0.6, 1.65, 1.1, 0.11, 0.2, 10)
    lab("steel", 0.02).cylc(0, 1.1, -1.4, 0.08, 1.5, 8)
    lab("dark", 0.02).cylc(0, 0.38, -1.4, 0.45, 0.04, 12)
    lab("dark", 0.03).boxc(0, 2.4, -1.45, 2.2, 1.3, 0.14)
    lab("holo", 0.0).boxc(0, 2.4, -1.37, 2.0, 1.1, 0.02)
    lab("cable", 0.0).path([(0.1, 0.4, -1.5), (0.6, 0.38, -2.4), (1.0, 0.1, -3.0)], 0.05, 4)
    lab.at()
    zbornak(lab.root, x, z, fy).root.location.z = 0.36
    CAMS["zb"] = ((CX + x + math.sin(fy) * 5.6 - math.cos(fy) * 1.8, 2.9, CZ + z + math.cos(fy) * 5.6 + math.sin(fy) * 1.8), (CX + x, 1.8, CZ + z), 45)
    # the petrified gallery: plinths with brass plaques, a stone courier on each, a spot over each from the tray
    for i, deg in enumerate((36, 46, 56, 66, 76)):
        x, z, yw = P(deg, 26.6)
        lab.at(x, z, yw)
        lab("stone", 0.04).boxc(0, 0.45, 0, 1.6, 0.9, 1.6)
        lab("panel", 0.02).boxc(0, 0.94, 0, 1.7, 0.08, 1.7)
        lab("brass", 0.01).boxc(0, 0.5, 0.81, 0.9, 0.3, 0.02)
        lab("dark", 0.0).boxc(0, 0.5, 0.825, 0.7, 0.04, 0.01).boxc(0, 0.43, 0.825, 0.5, 0.03, 0.01)
        lab("dark", 0.02).boxc(0, 6.0, -3.0, 0.3, 0.3, 0.5)
        lab("lamp", 0.0).cylc(0, 5.82, -2.8, 0.1, 0.06, 10)
        lab.light((0, 5.6, -2.6), (1.0, 0.95, 0.85), 220, 0.15)
        STATUES.append((lab.root, lab.pt((0, 0.98, 0)), yw))
        lab.at()
    a = math.radians(56)
    lab.text("GALLERY OF THE PETRIFIED", (math.sin(a) * (R - 0.08), 4.4, math.cos(a) * (R - 0.08)), a + PI, 0.42, "amber")
    CAMS["gallery"] = ((CX + P(50, 14)[0], 2.6, CZ + P(50, 14)[1]), (CX + P(58, 27)[0], 1.8, CZ + P(58, 27)[1]), 28)
    # robotics bay: a bench with a chimera half built, two grab arms, a welder, an overhead gantry, all on joint pivots
    x, z, yw = P(100, 21.0)
    tw = G("robots", lab.root, x, 0, z, yw)
    tw("panel", 0.04).boxc(0, 0.55, 0, 6.2, 1.1, 2.4)
    tw("hazard", 0.0).boxc(0, 1.12, 0, 6.3, 0.04, 2.5)
    tw("steel", 0.02).boxc(0, 1.2, 0, 5.6, 0.12, 1.9)
    tw.chim((0.4, 1.26, 0), 0.4, 1.1, 4)
    for k in range(4):
        tw("steel", 0.02).boxc(-2.4 + k * 0.4, 1.36, 0.7, 0.25, 0.2, 0.25)
    robot_arm(tw, -2.2, -3.6, 0, 0.9, 1.75, 0.5, 0.25, "claw", name="arm0")
    robot_arm(tw, 2.2, -3.6, 0, 0.95, 1.8, 0.5, -0.3, "claw", color="wall2", name="arm1")
    robot_arm(tw, 0.5, 4.3, PI, 0.95, 1.75, 0.1, 0.05, "welder", name="arm2")
    for sx in (-4.0, 4.0):
        for sz in (-4.5, 4.5):
            tw("steel", 0.03).boxc(sx, 4.0, sz, 0.3, 8.0, 0.3)
            tw("dark", 0.02).boxc(sx, 0.05, sz, 0.7, 0.1, 0.7)
        tw("hazard", 0.03).boxc(sx, 8.1, 0, 0.4, 0.4, 9.4)
    tw("hazard", 0.03).boxc(0, 8.1, -1.0, 8.4, 0.5, 0.5)
    tw("dark", 0.02).boxc(0.5, 7.6, -1.0, 1.0, 0.6, 0.8)
    tw("steel", 0.0).bm((0.5, 7.3, -1.0), (0.5, 3.0, -1.0), 0.03, 4)
    tw("dark", 0.02).boxc(0.5, 2.9, -1.0, 0.4, 0.3, 0.4)
    CAMS["robots"] = ((CX + x + math.sin(yw) * 9.0 + math.cos(yw) * 9.0, 6.0, CZ + z + math.cos(yw) * 9.0 - math.sin(yw) * 9.0), (CX + x, 2.0, CZ + z), 30)
    # exotic matter: a wall of canister racks, two magnetic cages before it cabled to the wall, the sign over them
    for deg in (134, 149, 164):
        x, z, yw = P(deg, R - 0.6)
        canister_rack(lab, x, z, yw, 6.4, 3, int(deg))
        lab("steel", 0.0).bm((x - math.sin(yw) * 0.0, 5.82, z), (x, 6.1, z), 0.06, 5)
    for deg in (141, 157):
        x, z, yw = P(deg, 22.5)
        void_cage(lab, x, z, yw, 1.5, 2.6, feed=R - 22.5 - 0.05)
    a = math.radians(149)
    lab.text("EXOTIC MATTER  ·  DO NOT LOOK DIRECTLY", (math.sin(a) * (R - 0.08), 6.9, math.cos(a) * (R - 0.08)), a + PI, 0.4, "vio")
    CAMS["exotic"] = ((CX + P(146, 12)[0], 3.0, CZ + P(146, 12)[1]), (CX + P(150, 27)[0], 2.4, CZ + P(150, 27)[1]), 26)
    # the splice pod at the back, under the helix projection
    x, z, yw = P(180, 23.5)
    splice_pod(lab, x, z, yw)
    # wall projections, on brackets from the wall, an emitter bar over each
    for deg, w, h, kind in ((-38, 9.0, 4.2, 2), (180, 13.0, 5.0, 1), (100, 9.0, 3.4, 0)):
        a = math.radians(deg)
        projection(lab, math.sin(a) * (R - 0.4), 8.8, math.cos(a) * (R - 0.4), a + PI, w, h, kind, mount=0.4)
    # cryo-stasis pods, an arc of six, a chimera in each, their coolant lines into junction boxes under the tray
    for i, deg in enumerate((-128, -137, -146, -155, -164, -173)):
        x, z, yw = P(deg, 26.6)
        cryo_pod(lab, x, z, yw, [0, 1, 2, 3, 5, 6][i], "cyan", wall=R - 26.6)
    a0 = math.radians(-150)
    CAMS["cryo"] = ((CX + math.sin(a0) * 14, 2.6, CZ + math.cos(a0) * 14), (CX + math.sin(a0) * 26, 2.3, CZ + math.cos(a0) * 26), 30)
    # the hydroponics habitat: a sealed glass enclosure (kerb, mullions, beam, canopy, end walls, an airlock door) holding
    # two rows of growth pods on a nutrient header, grow-light strips under the canopy
    h0, h1, RH, HY = math.radians(-106), math.radians(-54), 21.0, 5.0
    arc_box(lab, "white", 0.03, RH, h0, h1, 0.2, 0.4, 0.4, 1.0)
    arc_box(lab, "white", 0.03, RH, h0, h1, HY, 0.3, 0.4, 1.0)
    door = math.radians(-80)
    for i in range(14):
        a = h0 + (h1 - h0) * i / 13
        if abs(a - door) < 0.05:
            continue
        lab("white", 0.02).boxc(math.sin(a) * RH, HY / 2, math.cos(a) * RH, 0.18, HY, 0.25, (0, a, 0))
    for a0_, a1_ in ((h0, door - 0.035), (door + 0.035, h1)):
        arc_box(lab, "habglass", 0.0, RH, a0_, a1_, HY / 2 + 0.2, HY - 0.6, 0.06, 1.0)
    for a in (h0, h1):                                                     # the end walls, glass in a frame, out to the wall
        lab.at(math.sin(a) * (RH + R) / 2, math.cos(a) * (RH + R) / 2, a)
        lab("habglass", 0.0).boxc(0, HY / 2, 0, 0.06, HY - 0.5, R - RH - 0.3)
        lab("white", 0.02).boxc(0, HY, 0, 0.3, 0.3, R - RH).boxc(0, 0.2, 0, 0.3, 0.4, R - RH)
        lab.at()
    for k in range(12):                                                    # the canopy, glass panels on radial ribs
        a = h0 + (h1 - h0) * (k + 0.5) / 12
        lab.at(math.sin(a) * (RH + R) / 2, math.cos(a) * (RH + R) / 2, a)
        lab("habglass", 0.0).boxc(0, HY + 0.12, 0, (h1 - h0) * (RH + R) / 2 / 12 * 0.98, 0.04, R - RH)
        lab("vio", 0.0).boxc(0, HY - 0.05, 0, 0.12, 0.05, R - RH - 1.0)
        lab.at()
    for k in range(13):
        a = h0 + (h1 - h0) * k / 12
        lab("white", 0.02).bm((math.sin(a) * RH, HY + 0.1, math.cos(a) * RH), (math.sin(a) * (R - 0.1), HY + 0.1, math.cos(a) * (R - 0.1)), 0.09, 5)
    lab.at(math.sin(door) * RH, math.cos(door) * RH, door + PI)            # the habitat's door: a sealed hatch in a frame
    lab("white", 0.03).boxc(0, 1.4, 0, 2.0, 2.9, 0.4)
    lab("dark", 0.02).boxc(0, 1.25, 0.15, 1.4, 2.4, 0.16)
    lab("habglass", 0.0).cylc(0, 1.7, 0.24, 0.3, 0.02, 16, "z")
    lab("lime", 0.0).boxc(0.85, 1.4, 0.21, 0.12, 0.3, 0.02)
    lab("dark", 0.03).boxc(0, 3.4, 0.1, 3.2, 0.6, 0.12)
    lab.at()
    lab.text("HYDROPONICS  ·  BIO-SEALED", (math.sin(door) * (RH - 0.18), 3.25, math.cos(door) * (RH - 0.18)), door + PI, 0.3, "teal")
    arc_box(lab, "floorhab", 0.0, (RH + R) / 2, h0, h1, 0.07, 0.02, R - RH - 0.2, 1.0)
    HR = 25.8                                                               # the nutrient header between the rows
    arc_box(lab, "steel", 0.02, HR, h0 + 0.03, h1 - 0.03, 0.12, 0.16, 0.16, 0.8)
    for i, deg in enumerate((-98, -90, -70, -62)):
        x, z, yw = P(deg, 24.0)
        growth_pod(lab, x, z, yw, i, 2.0, line=HR - 24.0)
    for i, deg in enumerate((-101, -93, -85, -77, -69, -61)):
        x, z, yw = P(deg, 27.6)
        growth_pod(lab, x, z, yw + PI, i + 3, 2.0, line=27.6 - HR)
    for deg in (-104, -56):                                                # nutrient tanks at the header's ends
        x, z, yw = P(deg, HR)
        lab("white", 0.03).cylc(x, 0.15, z, 0.75, 0.3, 16)
        lab("glass", 0.0).cylc(x, 1.3, z, 0.65, 2.0, 16)
        lab("teal", 0.0).cylc(x, 1.0, z, 0.6, 1.4, 16)
        lab("white", 0.03).cylc(x, 2.4, z, 0.72, 0.2, 16)
        lab("steel", 0.0).bm((x, 2.5, z), (x, HY + 0.1, z), 0.05, 5)
    for k in range(4):
        a = h0 + (h1 - h0) * (k + 0.5) / 4
        lab.light((math.sin(a) * 25.8, 3.6, math.cos(a) * 25.8), (0.45, 1.0, 0.85), 260, 0.5)
    a0 = math.radians(-80)
    CAMS["hydro"] = ((CX + math.sin(a0) * 13.0 + 3.0, 4.2, CZ + math.cos(a0) * 13.0 + 5.0), (CX + math.sin(a0) * 25.0, 1.6, CZ + math.cos(a0) * 25.0), 28)
    # the holotable, front left
    x, z, yw = P(-38, 19.5)
    holotable(lab, x, z, yw, 2.6, "round", "moon")
    CAMS["inside"] = ((CX + 7.5, 3.0, CZ + 26.5), (CX - 2.0, 6.5, CZ - 6.0), 22)

    # ---- outside: the plaza, walks, containers, gas racks piped in, the generator and the solar array cabled in
    out = G("outside", root)
    PZ = (0.0, 40.0)
    out("path", 0.0).cylc(PZ[0], 0.04, PZ[1], 13.0, 0.08, 48)
    out("hazard", 0.0).tor(12.9, 0.1, (PZ[0], 0.09, PZ[1]), n=48, rs=4, s=(1, 0.3, 1))
    for i in range(12):
        a = TAU * (i + 0.5) / 12
        if abs((a + PI) % TAU - PI) > 2.4:
            continue
        lamp_post(out, PZ[0] + math.sin(a) * 14.2, PZ[1] + math.cos(a) * 14.2, 5.0)
    for x, z, yaw in ((-38.0, -6.0, 0.4), (36.0, -36.0, -0.8)):
        gas_rack(out, x, z, yaw)
        d = math.atan2(x - CX, z - CZ)
        wx, wz = CX + math.sin(d) * (R + T + 0.1), CZ + math.cos(d) * (R + T + 0.1)
        out("steel", 0.02).path([(x, 1.8, z), ((x + wx) / 2, 1.8, (z + wz) / 2), (wx, 1.8, wz)], 0.12, 6)
        wall_flange(out, wx, wz, 1.8, d)
        for t in (0.33, 0.66):
            out("dark", 0.0).boxc(x + (wx - x) * t, 0.9, z + (wz - z) * t, 0.2, 1.8, 0.2)
    gx, gz = -30.0, 18.0                                                   # the generator, cabled to the wall
    out.at(gx, gz, 0.9)
    out("panel", 0.06).boxc(0, 1.5, 0, 6, 3, 3.4)
    for i in range(5):
        out("dark", 0.0).boxc(-2.2 + i * 1.1, 2.0, 1.72, 0.15, 2.0, 0.04)
    out("lime", 0.0).boxc(-2.4, 2.4, 1.73, 0.8, 0.4, 0.02)
    out("steel", 0.02).cylc(2.0, 3.6, 1.0, 0.25, 1.2, 8)
    out.at()
    d = math.atan2(gx - CX, gz - CZ)
    wx, wz = CX + math.sin(d) * (R + T + 0.7), CZ + math.cos(d) * (R + T + 0.7)
    ground_run(out, [(gx + 2.0, gz - 2.0), (wx, wz)])
    out("dark", 0.02).boxc(wx, 0.6, wz, 0.9, 1.2, 0.6, (0, d, 0))
    path_ribbon(out, [(12.3, 38.2), (26.0, 35.0), (40.0, 24.0), (49.6, 16.0)], 3.0)
    pe = (-51.4, 55.3)
    path_ribbon(out, [(-11.8, 43.9), (-24.0, 49.0), (-38.0, 53.5), pe], 3.0)
    a = math.atan2(-62.0 - pe[0], 58.0 - pe[1])                             # a ramp up onto the pad's deck
    out.at(pe[0] + math.sin(a) * 1.2, pe[1] + math.cos(a) * 1.2, a)
    out("path", 0.0).polyx([(-1.3, 0), (1.3, 0), (1.3, 0.54), (-1.3, 0.06)], -1.5, 1.5)
    for s in (-1, 1):
        out("panel", 0.02).polyx([(-1.3, 0), (1.3, 0), (1.3, 0.62), (-1.3, 0.14)], s * 1.5, s * 1.8)
    out.at()
    landing_pad(out, -62.0, 58.0, 12.0, "Z")
    zb_container(out, -44.0, 67.0, 1.25, 2, 417)
    zb_container(out, -40.5, 74.5, 1.35, 1, 418)
    zb_container(out, -78.0, 70.0, 0.6, 1, 419)
    zb_container(out, 33.0, -48.0, 0.45, 2, 420)
    CAMS["crates"] = ((-30.0, 4.0, 82.0), (-46.0, 2.6, 68.0), 30)
    radiator_field(out, -4.0, -84.0, 0.0, 2, 5, (0.0, CZ - R - T - 0.2))
    wall_flange(out, 0.0, CZ - R - T - 0.1, 0.6, PI, 0.7)
    solar_array(out, -84.0, 8.0, PI / 2, 3, 4)
    cb = (-84.0, 8.0 - 15.5)
    d = math.atan2(cb[0] - CX, cb[1] - CZ)
    wx, wz = CX + math.sin(d) * (R + T + 0.7), CZ + math.cos(d) * (R + T + 0.7)
    ground_run(out, [cb, ((cb[0] + wx) / 2, (cb[1] + wz) / 2 - 2.0), (wx, wz)])
    out("dark", 0.02).boxc(wx, 0.6, wz, 0.9, 1.2, 0.6, (0, d, 0))
    ranch_a(root)
    CAMS["over"] = ((-95.0, 95.0, 165.0), (22.0, 0.0, -5.0), 32)
    CAMS["cut"] = ((-58.0, 68.0, 52.0), (CX, 0.0, CZ - 2), 30)
    CAMS["gate"] = ((CX + 6.5, 2.6, CZ + z1 + 20.0), (CX - 1.2, 4.2, CZ + z1 + 6.0), 28)
    CAMS["front"] = ((-34.0, 9.0, 82.0), (2.0, 12.0, 6.0), 30)
    CAMS["walks"] = ((-6.0, 16.0, 76.0), (8.0, 0.0, 30.0), 26)


def ranch_a(root):
    r = G("A_ranch", root)
    BX, BZ = 74.0, -26.0
    # ---- the barn: gambrel ends, long walls with the big door open on the corral, roof slabs, cupola, solar strip
    b = G("A_barn", root, BX, 0, BZ)
    gam = [(-8.0, 0), (8.0, 0), (8.0, 6.0), (6.2, 9.4), (0, 11.4), (-6.2, 9.4), (-8.0, 6.0)]
    for x0, x1 in ((-13.0, -12.6), (12.6, 13.0)):
        b("barn").polyx(gam, x0, x1)
    b("barn").boxc(0, 3.0, -7.8, 25.2, 6.0, 0.4)
    for x0, x1 in ((-12.6, -4.5), (4.5, 12.6)):
        b("barn").boxc((x0 + x1) / 2, 3.0, 7.8, x1 - x0, 6.0, 0.4)
    b("barn").boxc(0, 5.6, 7.8, 9.0, 0.8, 0.4)
    b("barn2", 0.0).boxc(0, 0.6, 8.02, 26, 1.2, 0.05)
    for sz in (-1, 1):
        prof = [(sz * 8.6, 5.6), (sz * 6.2, 9.4), (0, 11.4)]
        for p0, p1 in zip(prof, prof[1:]):
            slope_box(b, "roof2", p0, p1, -13.6, 13.6, 0.28, 0.06)
    b("trim", 0.02).boxc(0, 5.75, 8.05, 9.4, 0.3, 0.2)
    for sx in (-4.6, 4.6):
        b("trim", 0.02).boxc(sx, 2.9, 8.05, 0.3, 5.8, 0.2)
    for sx in (-7.6, 7.6):                                                   # the two sliding leaves, pushed aside
        b.at(sx, 8.3)
        b("barn", 0.03).boxc(0, 2.7, 0, 4.4, 5.4, 0.2)
        b("trim", 0.0).boxc(0, 2.7, 0.12, 4.4, 0.25, 0.03).boxc(0, 0.12, 0.12, 4.4, 0.24, 0.03).boxc(0, 5.28, 0.12, 4.4, 0.24, 0.03)
        b("trim", 0.0).boxc(0, 2.7, 0.13, 0.22, 6.5, 0.03, (0, 0, 0.68)).boxc(0, 2.7, 0.13, 0.22, 6.5, 0.03, (0, 0, -0.68))
        b.at()
    b("steel", 0.02).boxc(0, 5.6, 8.35, 20, 0.12, 0.15)
    b("barnint", 0.0).boxc(0, 0.04, 0, 25, 0.06, 15.2)
    for k in range(6):                                                       # stall partitions inside, a lantern each
        x = -10 + k * 4
        b("wood", 0.02).boxc(x, 0.8, -4.0, 0.15, 1.6, 7.0)
        b("lamp", 0.0).ball(x + 2, 4.6, -3.0, 0.18, 8, 6)
        b("steel", 0.0).bm((x + 2, 4.75, -3.0), (x + 2, 5.98, -3.0), 0.02, 4)                 # its chain from the loft floor
        b.light((x + 2, 4.3, -2.0), (1.0, 0.75, 0.45), 160, 0.2)
    b("wood2", 0.03).boxc(0, 6.05, 0, 25.0, 0.15, 15.0)
    b.chim((-2.0, 0.05, -1.0), 0.6, 1.5, 7)
    # hayloft door and hoist beam on the east gable, cupola with a chimera weathervane, solar strip on the south slope
    b("barn2", 0.03).boxc(13.05, 7.6, 0, 0.2, 2.4, 2.6)
    b("trim", 0.0).boxc(13.17, 7.6, 0, 0.03, 2.6, 0.2).boxc(13.17, 7.6, 0, 0.03, 0.2, 2.8)
    b("wood2", 0.03).boxc(14.0, 10.0, 0, 2.4, 0.3, 0.3)
    b("steel", 0.0).bm((14.9, 9.85, 0), (14.9, 7.5, 0), 0.02, 4)
    b("trim", 0.04).boxc(0, 12.1, 0, 2.0, 1.6, 2.0)
    b("dark", 0.0).boxc(0, 12.1, 0, 2.05, 1.0, 1.6).boxc(0, 12.1, 0, 1.6, 1.0, 2.05)
    b("roof2", 0.03).add(cylinder(0.0, 1.8, 1.2, 4)[:2], (0, 13.5, 0), (0, PI / 4, 0))
    b("steel", 0.0).bm((0, 14.1, 0), (0, 15.6, 0), 0.03, 4)
    b("dark", 0.0).boxc(0, 15.6, 0, 1.4, 0.5, 0.06).ball(0.75, 15.75, 0, 0.18, 6, 4)
    for k in range(5):
        b("solar", 0.0).boxc(-10 + k * 5, 10.62, 3.15, 4.2, 0.06, 2.6, (-math.atan2(2.0, 6.2), 0, 0))
    # ---- the office on the west end: hollow, a big window and an open door onto the corral side, the pen terminal
    o = G("A_office", root, BX - 17.0, 0, BZ + 1.5)
    o("floor", 0.0).boxc(0, 0.12, 0, 7.6, 0.24, 11.0)
    o("wood", 0.04).boxc(0, 2.4, -5.3, 7.6, 4.8, 0.4)
    o("wood", 0.04).boxc(-3.6, 2.4, 0, 0.4, 4.8, 11.0)
    for x0, x1 in ((-3.8, -2.6), (-0.6, 0.6), (3.0, 3.8)):
        o("wood", 0.04).boxc((x0 + x1) / 2, 2.4, 5.3, x1 - x0, 4.8, 0.4)
    o("wood", 0.04).boxc(1.8, 0.5, 5.3, 2.4, 1.0, 0.4).boxc(1.8, 4.35, 5.3, 2.4, 0.9, 0.4).boxc(-1.6, 4.35, 5.3, 2.0, 0.9, 0.4)
    o("glass", 0.0).boxc(1.8, 2.45, 5.3, 2.4, 2.9, 0.06)
    o("trim", 0.02).boxc(1.8, 1.0, 5.55, 2.6, 0.12, 0.3).boxc(-1.6, 4.0, 5.55, 2.3, 0.15, 0.2)
    slope_box(o, "roof2", (-6.2, 4.8), (6.2, 5.6), -4.3, 4.3, 0.24, 0.05)
    o("lamp", 0.0).ball(-1.6, 4.4, 6.0, 0.18, 8, 6)
    o("dark", 0.0).bm((-1.6, 4.6, 5.5), (-1.6, 4.6, 6.0), 0.04, 5).bm((-1.6, 4.6, 6.0), (-1.6, 4.5, 6.0), 0.04, 5)   # its bracket
    pen_terminal(o, -0.6, -4.3, 0, "pen")
    o("dark", 0.02).boxc(2.6, 1.6, -4.9, 1.6, 3.2, 0.7)
    o("wood2", 0.02).boxc(-2.8, 0.9, -1.0, 1.2, 0.08, 3.6)
    o("lamp", 0.0).boxc(-0.6, 4.5, -2.5, 1.8, 0.1, 0.3)
    o.light((-0.6, 4.0, -2.0), (1.0, 0.9, 0.7), 450, 0.3)
    o("dark", 0.04).boxc(-1.6, 5.4, 5.75, 3.6, 0.8, 0.12)
    o.text("HOLDING PEN", (-1.6, 5.22, 5.83), 0, 0.5, "lime")
    for k in range(3):
        o("dark", 0.0).boxc(-3.38, 3.2, -3.5 + k * 0.6, 0.04, 0.5, 0.4)
        o("lime" if k != 1 else "pink", 0.0).boxc(-3.36, 3.2, -3.5 + k * 0.6, 0.02, 0.35, 0.3)
    CAMS["office"] = ((BX - 17 - 1.9, 2.0, BZ + 1.5 + 9.5), (BX - 17 - 0.6, 1.8, BZ + 1.5 - 4.3), 30)
    # ---- the corral: fences (the barn closes the north side), the gate arch facing the lab, lamps
    N, S_, W_, E_ = BZ + 8.0, 46.0, 50.0, 98.0
    fence_run(r, [(W_, N), (BX - 20.8, N)], lamps=False)
    fence_run(r, [(BX + 13.0, N), (E_, N), (E_, S_), (W_, S_), (W_, 20.0)], lamps=True)
    fence_run(r, [(W_, 12.0), (W_, N)])
    gate_arch(r, W_, 16.0, -PI / 2, 8.0, 6.2, "ZBORNAK RANCH")
    r("dirt", 0.0).boxc((W_ + E_) / 2, 0.025, (N + S_) / 2, E_ - W_, 0.04, S_ - N)
    # the feed line: silo, auger to a roofed feed bunk along the east fence; lick blocks; a second bunk of bales
    silo(r, 93.5, -30.0, 3.2, 14.0, (93.3, 2.2, 0.4))
    r("steel", 0.03).ball(93.3, 2.2, 0.4, 0.34, 10, 7)                                       # the elbow onto the bunk's auger
    feed_bunk(r, 93.0, 8.0, -PI / 2, 15.0)
    for i, (x, z) in enumerate(((90.0, 1.5), (90.5, 12.5), (89.0, 7.2))):
        r.chim((x, 0.04, z), PI / 2 + (i - 1) * 0.3, 1.6, (1, 6, 3)[i])
    # water: stock tank and the sun-mill pump by the gate
    stock_tank(r, 58.0, 36.0, 2.4)
    wind_pump(r, 54.0, 41.5, 9.0, 0.6)
    r("steel", 0.0).path([(54.0, 0.3, 41.5), (56.0, 0.3, 38.0), (57.0, 1.0, 36.8)], 0.08, 6)
    r.chim((61.5, 0.04, 34.0), -2.2, 1.6, 5)
    # training ring, bales, saddle rack, lick posts
    fence_ring(r, 70.0, 26.0, 7.0, 1.4, gap=(-PI / 2, 3.0), step=2.8)
    r("moss", 0.0).cylc(70.0, 0.03, 26.0, 6.8, 0.03, 32)
    r.chim((70.0, 0.04, 26.0), 0.8, 1.6, 0)
    for i in range(3):                                                     # bales behind the barn, clear of it and the office
        for j in range(3 - i):
            bale(r, 64.0 + j * 1.5 + i * 0.75, -38.5, 0.0, i * 0.9)
    for i in range(4):
        bale(r, 71.0 + i * 1.5, -38.6 + (i % 2) * 0.3, 1.57, 0, True)
    for k in range(2):
        r("wood2", 0.02).boxc(W_ + 6 + k * 2.6, 1.0, S_ - 0.4, 0.1, 2.0, 0.1)
    r("wood", 0.02).bm((W_ + 6, 1.4, S_ - 0.4), (W_ + 8.6, 1.4, S_ - 0.4), 0.08, 5)
    r("barn2", 0.02).rb(W_ + 7.3, 1.62, S_ - 0.4, 0.45, 0.16, 0.35, 0.4)
    r("lime", 0.0).boxc(W_ + 7.3, 1.84, S_ - 0.4, 0.3, 0.06, 0.25)
    for (x, z) in ((80.0, 38.0), (64.0, 10.0)):
        r("wood2", 0.02).cylc(x, 0.6, z, 0.18, 1.2, 8)
        r("stone", 0.02).boxc(x, 1.45, z, 0.6, 0.5, 0.6)
        r("cyan", 0.0).add(cylinder(0.0, 0.18, 0.5, 5)[:2], (x + 0.1, 1.95, z), (0.2, 0, 0.1))
    r.chim((80.0, 0.04, 30.0), 1.9, 1.6, 7)
    r.chim((66.0, 0.04, 2.0), -0.6, 1.6, 2)
    CAMS["ranch"] = ((40.0, 22.0, 70.0), (78.0, 2.0, 2.0), 30)


def build():
    root = pivot("zbornak_lab", (0, 0, 0), None)
    for L in (CHIMS, STATUES, LIGHTS, TEXTS, ARMS, WELDS):
        L.clear()
    CAMS.clear(); RUNNER.clear()
    build_lab(root)
    flush_all()
    return root


ROOT = build()
print(f"built: {len(C.objects)} objects, {sum(len(o.data.polygons) for o in C.objects if o.type == 'MESH')} faces, {len(CHIMS)} chimeras, "
      f"{len(STATUES)} statues, {len(LIGHTS)} lights, {len(ARMS)} arms")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    zb = next(o for o in C.objects if o.name == "zbornak" and o.type == "EMPTY")
    keep_ = [zb] + list(zb.children_recursive)
    par, loc, rot = zb.parent, zb.location.copy(), zb.rotation_euler.copy()
    zb.parent = None
    zb.location, zb.rotation_euler = (0, 0, 0), (0, 0, 0)
    export(os.path.join(OUTDIR, "zbornak.glb"), keep_)
    zb.parent, zb.location, zb.rotation_euler = par, loc, rot
