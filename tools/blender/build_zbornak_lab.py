# Dr. Zbornak's Antimatter Research Lab: two drafts for a rework of the whole plateau (r 120 m), built from code in Blender.
# Not in the game: docs/zbornak-proposals/README.md is the brief and the review; preview_zbornak_lab.py renders it.
#
#   MOONRUNNER_REPO=. python3 tools/blender/build_zbornak_lab.py      builds VARIANT a (env ZB_VARIANT=a|b) into the
#                                                                     scene and exports docs/zbornak-proposals/zbornak_<v>.glb
#                                                                     (the figure alone, plain, in the game's GLB contract)
# Area frame = the location's frame in the game (world.buildLab): origin at the plateau's centre, +z toward the front.
#
#   A "The Rotunda"   A domed round lab, 64 m across, the reactor rising through an oculus to a crown of rings 44 m up; a
#                     ribbed airlock tunnel to a lock housing with the security post; inside, stations round the wall about
#                     the reactor and a ring catwalk. The ranch east of it: a gambrel barn with the pen-terminal office on
#                     its end, a rectangular corral, a silo feeding a roofed feed bunk by auger, stock tank and sun-mill.
#   B "The Institute" A long vaulted hall on one axis (34 x 66 m inside) from a gatehouse (two-stage airlock, iris door,
#                     two pylons and a pediment) to a reactor tower at the far end (26 m across, its crown 52 m up); bays
#                     down both aisles. The ranch west of it: a bunkhouse with the terminal inside, a round corral round a
#                     feed carousel (a hopper on legs feeding a ring trough through six chutes), a training ring, a water
#                     tower and a sun-mill.
# Both: Zbornak (zbornak_figure.py), the lab terminal (A: a console desk LABNET; B: a standing kiosk SPECIMEN INDEX), the
# holding pen's terminal moved indoors at the ranch, chimeras in the cryo pods, on the robots' bench and in the corrals.

import bpy, math, os, sys

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", ".."))
VARIANT = globals().get("VARIANT") or os.environ.get("ZB_VARIANT", "a")
OUTDIR = os.path.join(REPO, "docs", "zbornak-proposals")
COLL = "ZbornakLab"


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    # the lab (the game's lab colours: settlements.js dressLab)
    "wall": "e8e4f4", "wall2": "c9c4d8", "roof": "3a3550", "panel": "5b5870", "dark": "2a2540", "steel": "55607a", "metal": "8a87a0",
    "hazard": "ffd23f", "floor": "6b6880", "floor2": "403a58", "white": "f3eee4", "arm": "ff9f1c", "armdark": "2a2540", "cable": "1d1a29",
    "copper": "b87333", "brass": "d8a060", "seat": "6b6880", "rubber": "1d1a29", "stone": "9a94a8", "void": "0e0814", "plant": "3a6a4a",
    "plant2": "2f5a5a", "soil": "3a2a2a", "path": "7a7590", "solar": "26325e", "door": "8a87a0",
    # the ranch
    "barn": "8b4044", "barn2": "6a2e33", "wood": "9a6a3a", "wood2": "6e4a2a", "trim": "f3eee4", "corr": "9aa7bb", "moss": "8aa860",
    "moss2": "5a7a40", "dirt": "8a7a6a", "roof2": "3b393a", "barnint": "5a3a2a",
    # glows (lit in the preview and in the game)
    "lime": "7dff3a", "pink": "ff2e88", "pinkhot": "ffd0f0", "cyan": "2ec4ff", "teal": "2ee6c0", "vio": "c77dff", "amber": "ff9f1c",
    "red": "ff2a4a", "lamp": "fff6a8", "spark": "fff6a8", "weld": "d8f0ff", "screenlit": "8dffb4", "holo": "2ec4ff", "beam": "9be7ff",
    "scan": "7dff3a", "halo": "c77dff", "ember": "ff7a1a", "goggle": "7dff3a", "feed": "7dff3a", "feed2": "b8ff9e", "water": "3a8bd5",
    "window": "fff0b0", "screen": "102018",
    # see-through
    "glass": "9be7ff", "glassg": "7dff3a", "frost": "d8f4ff", "smoke": "9a94a8",
    # Zbornak
    "coat": "f3eee4", "coat2": "d6d0c2", "scorch": "231c22", "scorch2": "6b4a3a", "shirt": "b8e0ff", "tie": "2e8b57", "trousers": "3a3550",
    "shoe": "1d1a29", "eye": "0d0a14", "soot": "3a3438", "glove": "a0602a", "board": "b07c57", "paper": "fff8e8", "inkline": "2a2540",
    "skin": "a8d8a0", "skin2": "6fae74", "iris": "ffd23f",
}
if VARIANT == "b":
    HEX.update({"skin": "9a86e8", "skin2": "6a56c0", "iris": "7dff3a"})
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
GLOW = {"lime", "pink", "pinkhot", "cyan", "teal", "vio", "amber", "red", "lamp", "spark", "weld", "screenlit", "holo", "beam", "scan", "halo",
        "ember", "goggle", "feed", "feed2", "water", "window", "iris", "screen"}
SEE = {"glass": 0.18, "glassg": 0.16, "frost": 0.5, "smoke": 0.35, "holo": 0.35, "beam": 0.1, "scan": 0.12, "halo": 0.18}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "zbornak_kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "zbornak_figure.py"), encoding="utf-8").read(), globals())
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


def specimen_jar(g, x, z):
    """the giant specimen jar (kept from today's lab): plinth, glass, a glowing blob with an eye, brass lid"""
    g.at(x, z)
    g("panel").cylc(0, 0.8, 0, 2.6, 1.6, 18, rt=2.3)
    g("glass", 0.0).cylc(0, 4.1, 0, 2.0, 5.0, 20)
    g("brass").cylc(0, 7.0, 0, 2.2, 0.8, 20)
    g("lime", 0.0).ball(0, 7.8, 0, 0.5, 8, 6)
    g("lime", 0.0).ball(0, 4.3, 0, 1.1, 14, 10)
    for i in range(5):
        g("feed2", 0.0).ball(math.cos(i * 1.3) * 1.0, 4.3 + math.sin(i * 2.1) * 0.7, math.sin(i * 1.3) * 1.0, 0.35, 8, 6)
    g("eye").ball(0.5, 4.7, 0.9, 0.28, 8, 6)
    g.light((0, 4.3, 0), (0.5, 1.0, 0.3), 300, 0.5)
    g.at()


# =====================================================================================================================
# A: The Rotunda
# =====================================================================================================================
def draft_a(root):
    CX, CZ, R, T, H = 0.0, -18.0, 30.0, 1.2, 12.0
    lab = G("A_lab", root, CX, 0, CZ)
    top = G("A_roof", root, CX, 0, CZ)
    top.root["cutaway"] = 1
    # ---- shell: plinth, wall with portholes and pilasters, radiator fins, ring beam, ribbed dome, oculus
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
    for i in range(12):                                                    # ceiling lamps on the dome's underside
        a = TAU * (i + 0.5) / 12
        top("lamp", 0.0).boxc(math.sin(a) * (R - 3.0), H + 6.9, math.cos(a) * (R - 3.0), 2.4, 0.12, 0.5, (0, a, 0))
    for i in range(8):
        a = TAU * (i + 0.5) / 8
        lab.light((math.sin(a) * 20, 11, math.cos(a) * 20), (0.92, 0.88, 1.0), 2500, 1.5)
    # ---- airlock: ribbed tunnel, lock housing, round pressure door, the security post, the sign
    z0, z1 = R + T - 0.5, 44.0
    lab("wall", 0.06).add(cylinder(3.6, 3.6, z1 - z0, 28, True)[:2], (0, 2.4, (z0 + z1) / 2), (PI / 2, 0, 0))
    for k in range(9):
        lab("wall2", 0.03).tor(3.75, 0.18, (0, 2.4, z0 + 1.0 + k * (z1 - z0 - 2) / 8), (PI / 2, 0, 0), n=28, rs=5)
    lab("lime", 0.0).boxc(0, 6.04, (z0 + z1) / 2, 0.25, 0.06, z1 - z0 - 1)
    lab("wall", 0.07).boxc(0, 5.0, z1 + 3, 13, 10, 6)
    lab("roof", 0.05).boxc(0, 10.2, z1 + 3, 13.6, 0.4, 6.6)
    lab("hazard", 0.02).boxc(0, 9.6, z1 + 6.05, 13.0, 0.5, 0.1)
    door_c = (0, 3.0, z1 + 6.0)
    lab("hazard", 0.03).tor(2.85, 0.28, (0, 3.0, z1 + 6.05), (PI / 2, 0, 0), n=40, rs=6)
    lab("door", 0.03).cylc(0, 3.0, z1 + 6.05, 2.6, 0.25, 32, "z")
    lab("dark", 0.0).boxc(0, 3.0, z1 + 6.19, 5.1, 0.08, 0.04).boxc(0, 3.0, z1 + 6.19, 0.08, 5.1, 0.04)
    for k in range(8):
        a = TAU * k / 8
        lab("steel", 0.0).cylc(math.sin(a) * 2.3, 3.0 + math.cos(a) * 2.3, z1 + 6.2, 0.12, 0.06, 8, "z")
    lab("dark", 0.02).cylc(0, 3.0, z1 + 6.25, 0.6, 0.15, 16, "z")
    lab("lime", 0.0).tor(0.62, 0.05, (0, 3.0, z1 + 6.33), (PI / 2, 0, 0), n=20, rs=4)
    for k in (-1, 1):
        lab("dark").boxc(k * 6.0, 9.0, z1 + 6.3, 0.6, 0.5, 0.6)
        lab("lamp", 0.0).boxc(k * 6.0, 8.8, z1 + 6.62, 0.45, 0.25, 0.04)
    plate = security_post(lab, 0, z1 + 6.0, 0, 5.6, 1, "sec", (2.2, 1.5), (-4.2, 3.4, 0.06))
    RUNNER["gate"] = ((plate[0] + CX, 0, plate[2] + CZ), PI)
    lab("dark", 0.05).boxc(0, 11.6, z1 + 4.0, 17, 2.2, 0.4)
    lab.text("ANTIMATTER RESEARCH LAB", (0, 11.15, z1 + 4.22), 0, 1.15, "pink")
    lab.text("DR. ZBORNAK  ·  ADMITTANCE BY APPOINTMENT (HIS)", (0, 10.55, z1 + 4.22), 0, 0.4, "lime")
    # inner door: a lit round frame on the inside of the wall
    lab("hazard", 0.02).tor(2.9, 0.22, (0, 3.0, R - 0.1), (PI / 2, 0, 0), n=40, rs=6)
    # ---- floor: disc, bands, the reactor's pit and railing, ring catwalk on posts with a stair
    lab("floor", 0.0).cylc(0, 0.03, 0, R + 0.2, 0.06, 72)
    for i in range(36):
        a = TAU * i / 36
        lab("floor2", 0.0).boxc(math.sin(a) * 19, 0.065, math.cos(a) * 19, 0.5, 0.01, 22, (0, a, 0))
    for r_, c in ((8.0, "lime"), (18.0, "cyan"), (28.5, "lime")):
        lab(c, 0.0).tor(r_, 0.08, (0, 0.07, 0), n=72, rs=4, s=(1, 0.15, 1))
    lab("dark", 0.0).cylc(0, 0.075, 0, 7.4, 0.03, 48)
    railing_ring(lab, 7.6, 0.06, gap=(math.radians(22), 1.6))
    reactor(G("A_reactor", lab.root), 22, 3.4, 3, crown_y=H + 21)
    lab("panel", 0.04).lath([(9.6, 6.3), (11.6, 6.3), (11.6, 6.6), (9.6, 6.6), (9.6, 6.3)], segs=64)
    lab("cyan", 0.0).tor(11.62, 0.05, (0, 6.45, 0), n=64, rs=4)
    railing_ring(lab, 9.7, 6.6, gap=(math.radians(-90), 1.2), step=1.6)
    railing_ring(lab, 11.5, 6.6, gap=(math.radians(-90), 1.4), step=1.6)
    for i in range(6):
        a = TAU * i / 6 + 0.3
        lab("steel", 0.03).cylc(math.sin(a) * 10.6, 3.15, math.cos(a) * 10.6, 0.22, 6.3, 8)
    lab.at(-11.5, 0, -PI / 2)                                              # the stair up to the catwalk, from the west
    for k in range(26):
        lab("panel", 0.02).boxc(0, 0.25 * k + 0.12, 7.8 - 0.3 * k, 1.4, 0.12, 0.34)
    for sx in (-0.75, 0.75):
        lab("steel", 0.02).bm((sx, 0.0, 7.95), (sx, 6.5, 0.0), 0.07, 5)
        lab("hazard", 0.0).bm((sx, 1.1, 7.95), (sx, 7.6, 0.0), 0.04, 5)
    lab.at()
    # ---- stations round the wall (angle from the door, clockwise seen from above)
    def P(deg, r):
        a = math.radians(deg)
        return math.sin(a) * r, math.cos(a) * r, a + PI

    x, z, yw = P(-38, 19.5)
    holotable(lab, x, z, yw, 2.6, "round", "moon")
    for deg, w, h, kind in ((-38, 9.0, 4.2, 2), (95, 10.0, 4.0, 0), (180, 13.0, 5.0, 1), (-82, 9.0, 3.6, 0), (148, 7, 3, 2)):
        a = math.radians(deg)
        projection(lab, math.sin(a) * (R - 0.35), 8.6, math.cos(a) * (R - 0.35), a + PI, w, h, kind)
    x, z, yw = P(42, 21.5)
    lab_terminal_console(lab, x, z, yw, "lab")
    CAMS["term"] = ((CX + math.sin(math.radians(36)) * 14.8, 3.0, CZ + math.cos(math.radians(36)) * 14.8), (CX + x - math.sin(yw) * 0.4, 1.8, CZ + z - math.cos(yw) * 0.4), 32)
    # Zbornak's dais: a round step, a workbench, the doctor facing the door
    x, z, _ = P(22, 13.5)
    lab("panel", 0.04).cylc(x, 0.18, z, 2.8, 0.36, 28)
    lab("lime", 0.0).tor(2.8, 0.05, (x, 0.36, z), n=32, rs=4)
    fy = math.atan2(0 - x, R - z)
    lab.at(x, z, fy)
    lab("cyan", 0.05).boxc(0, 0.9, 1.15, 2.6, 1.1, 0.8)
    lab("dark", 0.03).boxc(0, 1.5, 1.15, 2.8, 0.1, 1.0)
    lab("pink", 0.0).ball(-0.8, 1.75, 1.2, 0.2, 8, 6)
    lab("glass", 0.0).cylc(0.6, 1.75, 1.1, 0.12, 0.4, 10)
    lab("lime", 0.0).cylc(0.6, 1.65, 1.1, 0.11, 0.2, 10)
    lab("dark").boxc(0, 1.95, -1.5, 2.4, 2.4, 0.2)
    lab("holo", 0.0).boxc(0, 2.4, -1.35, 2.0, 1.2, 0.02)
    lab.at()
    zbornak(lab.root, VARIANT, x, z, fy).root.location.z = 0.36
    CAMS["zb"] = ((CX + x + math.sin(fy) * 5.6 - math.cos(fy) * 1.8, 2.9, CZ + z + math.cos(fy) * 5.6 + math.sin(fy) * 1.8), (CX + x, 1.8, CZ + z), 45)
    # robotics bay: a bench with a chimera half-built, two grab arms, a welder, an overhead gantry
    x, z, yw = P(98, 21.0)
    tw = G("A_robots", lab.root, x, 0, z, yw)
    tw("panel", 0.04).boxc(0, 0.55, 0, 6.2, 1.1, 2.4)
    tw("hazard", 0.0).boxc(0, 1.12, 0, 6.3, 0.04, 2.5)
    tw("steel", 0.02).boxc(0, 1.2, 0, 5.6, 0.12, 1.9)
    tw.chim((0.4, 1.26, 0), 0.4, 1.1, 4)
    for k in range(4):
        tw("steel", 0.02).boxc(-2.4 + k * 0.4, 1.36, 0.7, 0.25, 0.2, 0.25)
    robot_arm(tw, -2.2, -3.6, 0, 0.9, 1.95, 0.7, 0.25, "claw")
    robot_arm(tw, 2.2, -3.6, 0, 1.0, 2.1, 0.55, -0.3, "claw", color="wall2")
    robot_arm(tw, 0.6, 3.6, PI, 0.95, 1.95, 0.6, 0.0, "welder")
    for sx in (-4.0, 4.0):
        for sz in (-4.5, 4.5):
            tw("steel", 0.03).boxc(sx, 4.0, sz, 0.3, 8.0, 0.3)
        tw("hazard", 0.03).boxc(sx, 8.1, 0, 0.4, 0.4, 9.4)
    tw("hazard", 0.03).boxc(0, 8.1, -1.0, 8.4, 0.5, 0.5)
    tw("dark", 0.02).boxc(0.5, 7.6, -1.0, 1.0, 0.6, 0.8)
    tw("steel", 0.0).bm((0.5, 7.3, -1.0), (0.5, 3.0, -1.0), 0.03, 4)
    tw("dark", 0.02).boxc(0.5, 2.9, -1.0, 0.4, 0.3, 0.4)
    CAMS["robots"] = ((CX + x + math.sin(yw) * 9.0 + math.cos(yw) * 9.0, 6.0, CZ + z + math.cos(yw) * 9.0 - math.sin(yw) * 9.0), (CX + x, 2.0, CZ + z), 30)
    # exotic-matter storage: canister racks either side of a vault door, two magnetic cages
    for deg in (137, 163):
        x, z, yw = P(deg, R - 0.6)
        canister_rack(lab, x, z, yw, 5.0, 3, int(deg))
    x, z, yw = P(150, R - 0.15)
    lab.at(x, z, yw, 3.2)
    lab("hazard", 0.04).tor(2.6, 0.3, (0, 0, 0), (PI / 2, 0, 0), n=40, rs=6)
    lab("steel", 0.05).cylc(0, 0, 0.1, 2.4, 0.4, 32, "z")
    for k in range(6):
        a = TAU * k / 6
        lab("dark", 0.0).boxc(math.sin(a) * 1.2, math.cos(a) * 1.2, 0.32, 0.2, 2.4, 0.06, (0, 0, -a))
    lab("dark", 0.02).tor(0.8, 0.08, (0, 0, 0.45), (PI / 2, 0, 0), n=20, rs=5)
    lab("vio", 0.0).cylc(0, 0, 0.32, 0.3, 0.04, 16, "z")
    lab.at()
    lab.text("EXOTIC MATTER · DO NOT LOOK DIRECTLY", (math.sin(math.radians(150)) * (R - 0.3), 6.2, math.cos(math.radians(150)) * (R - 0.3)), math.radians(150) + PI, 0.35, "vio")
    for deg in (141, 159):
        x, z, _ = P(deg, 22.5)
        void_cage(lab, x, z, 0, 1.5, 2.6)
    # splice pod at the back, under the helix projection
    x, z, yw = P(180, 23.5)
    splice_pod(lab, x, z, yw)
    # cryo-stasis pods, an arc of six, a chimera in each
    for i, deg in enumerate((-128, -137, -146, -155, -164, -173)):
        x, z, yw = P(deg, 26.6)
        cryo_pod(lab, x, z, yw, [0, 1, 2, 3, 5, 6][i], "cyan")
    a0 = math.radians(-150)
    CAMS["cryo"] = ((CX + math.sin(a0) * 14, 2.6, CZ + math.cos(a0) * 14), (CX + math.sin(a0) * 26, 2.3, CZ + math.cos(a0) * 26), 30)
    # bioluminescent hydroponics: three racks, a nutrient tank between them, hanging glow vines
    for k, deg in enumerate((-60, -79, -98)):
        x, z, yw = P(deg, 25.2)
        hydro_rack(lab, x, z, yw, 6.4, 3, k)
    for i in range(16):
        a = math.radians(-105 + i * 3.4)
        r_ = 27.5 - (i % 3) * 0.6
        L = 2.5 + (i * 7 % 5) * 0.6
        pts = [(math.sin(a) * r_, H + 2.0, math.cos(a) * r_), (math.sin(a) * r_ + 0.2, H - L / 2, math.cos(a) * r_), (math.sin(a) * r_, H - L, math.cos(a) * r_)]
        lab("plant2", 0.0).path(pts, 0.05, 4)
        lab(("teal", "lime", "vio")[i % 3], 0.0).ball(*pts[-1], 0.14, 8, 6)
    CAMS["inside"] = ((CX + 7.5, 3.0, CZ + 26.5), (CX - 2.0, 6.5, CZ - 6.0), 22)
    # ---- outside: plaza before the airlock, the specimen jar, gas racks, generator, path to the ranch
    out = G("A_out", root)
    out("path", 0.0).cylc(0, 0.04, 40.0, 13.0, 0.08, 40)
    out("hazard", 0.0).tor(12.9, 0.1, (0, 0.09, 40.0), n=48, rs=4, s=(1, 0.3, 1))
    specimen_jar(out, 10.5, 37.0)
    gas_rack(out, -38.0, -6.0, 0.4)
    gas_rack(out, 36.0, -36.0, -0.8)
    out.at(-30, 18, 0.9)
    out("panel", 0.06).boxc(0, 1.5, 0, 6, 3, 3.4)
    for i in range(5):
        out("dark", 0.0).boxc(-2.2 + i * 1.1, 2.0, 1.72, 0.15, 2.0, 0.04)
    out("lime", 0.0).boxc(-2.4, 2.4, 1.73, 0.8, 0.4, 0.02)
    out.at()
    path_strip(out, [(9.0, 46.0), (28.0, 34.0), (45.0, 18.0)], 3.0)
    for (x, z) in ((-12, 50), (12, 52), (20, 39), (36, 26), (-16, 34)):
        lamp_post(out, x, z, 5.5)
    path_strip(out, [(-9.0, 46.0), (-30.0, 52.0), (-48.0, 55.0)], 3.0)
    landing_pad(out, -62.0, 58.0, 12.0, "Z")
    radiator_field(out, -4.0, -84.0, 0.0, 2, 5, (0.0, -50.0))
    solar_array(out, -84.0, 8.0, PI / 2, 3, 4)
    out("dark", 0.02).path([(-71.0, 0.25, 8.0), (-50.0, 0.25, 4.0), (-32.0, 0.25, -6.0)], 0.3, 6)
    ranch_a(root)
    CAMS["over"] = ((-95.0, 95.0, 165.0), (22.0, 0.0, -5.0), 32)
    CAMS["cut"] = ((-58.0, 68.0, 52.0), (CX, 0.0, CZ - 2), 30)
    CAMS["gate"] = ((CX + 6.5, 2.6, CZ + z1 + 20.0), (CX - 1.2, 4.2, CZ + z1 + 6.0), 28)
    CAMS["front"] = ((-34.0, 9.0, 82.0), (2.0, 12.0, 6.0), 30)


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
    silo(r, 93.5, -30.0, 3.2, 14.0, (94.0, 2.4, 0.0))
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
    for i in range(3):
        for j in range(3 - i):
            bale(r, 57.0 + j * 1.5 + i * 0.75, -24.0, 0.0, i * 0.9)
    for i in range(4):
        bale(r, 62.0 + i * 1.5, -21.0 + (i % 2) * 0.3, 1.57, 0, True)
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


# =====================================================================================================================
# B: The Institute
# =====================================================================================================================
def draft_b(root):
    HW, Z0, Z1, H = 17.0, 8.0, -58.0, 14.0
    lab = G("B_lab", root)
    top = G("B_roof", root)
    top.root["cutaway"] = 1
    # ---- hall: walls, plinth, buttresses with radiator fins, tall windows, the barrel vault with ribs and a lit crest
    for sx in (-1, 1):
        lab("wall").boxc(sx * (HW + 0.5), H / 2, (Z0 + Z1) / 2, 1.0, H, Z0 - Z1)
        lab("panel").boxc(sx * (HW + 1.3), 0.6, (Z0 + Z1) / 2, 0.6, 1.2, Z0 - Z1 + 2)
        for k in range(9):
            z = Z0 - 3.5 - k * 7.6
            lab.at(sx * (HW + 1.0), z, sx * PI / 2)
            lab("wall2", 0.05).polyx([(0, 0), (4.5, 0), (4.5, 2.0), (2.4, 9.0), (1.2, H + 1.5), (0, H + 1.5)], -0.6, 0.6)
            lab("cyan", 0.0).polyx([(3.4, 2.0), (3.65, 2.0), (1.9, 8.6), (1.65, 8.6)], -0.63, 0.63)
            lab.at()
            if k < 8:
                zz = z - 3.8
                lab("window", 0.0).boxc(sx * (HW + 1.03), 8.2, zz, 0.08, 6.0, 2.0)
                lab("dark", 0.02).boxc(sx * (HW + 1.06), 8.2, zz, 0.1, 6.4, 0.25).boxc(sx * (HW + 1.06), 11.3, zz, 0.12, 0.3, 2.4).boxc(sx * (HW + 1.06), 5.1, zz, 0.12, 0.3, 2.4)
    for x0, x1 in ((-HW - 1, -7.5), (7.5, HW + 1)):
        lab("wall").boxc((x0 + x1) / 2, H / 2, Z1 - 0.5, x1 - x0, H, 1.0)
        lab("wall").boxc(0, (12.5 + H) / 2, Z1 - 0.5, 15, H - 12.5, 1.0)
    for x0, x1 in ((-HW - 1, -3.0), (3.0, HW + 1)):
        lab("wall").boxc((x0 + x1) / 2, H / 2, Z0 + 0.5, x1 - x0, H, 1.0)
    lab("wall").boxc(0, (6.5 + H) / 2, Z0 + 0.5, 6, H - 6.5, 1.0)
    rise, n = 8.0, 24
    outer = [((HW + 1.6) * math.cos(PI * i / n), H + rise * math.sin(PI * i / n)) for i in range(n + 1)]
    inner = [((HW + 0.6) * math.cos(PI * i / n), H - 0.6 + (rise - 0.4) * math.sin(PI * i / n)) for i in range(n, -1, -1)]
    top("roof", 0.07).polyz(outer + inner, Z1 - 1.2, Z0 + 1.2)
    for k in range(12):
        z = Z0 + 0.6 - k * (Z0 - Z1 + 1.2) / 11
        ro = [((HW + 1.9) * math.cos(PI * i / n), H + (rise + 0.3) * math.sin(PI * i / n)) for i in range(n + 1)]
        ri = [((HW + 1.5) * math.cos(PI * i / n), H - 0.1 + (rise - 0.1) * math.sin(PI * i / n)) for i in range(n, -1, -1)]
        top("wall2", 0.03).polyz(ro + ri, z - 0.35, z + 0.35)
    top("lime", 0.0).boxc(0, H + rise + 0.32, (Z0 + Z1) / 2, 1.0, 0.08, Z0 - Z1)
    for k in range(10):
        z = Z0 - 4 - k * 6.5
        top("lamp", 0.0).boxc(0, H + rise - 0.6, z, 3.0, 0.12, 0.6)
        lab.light((0, H + 2.0, z), (0.92, 0.88, 1.0), 1300, 1.2)
    # ---- the reactor tower behind, joined by a short throat
    TC = (0.0, -76.0)
    tw = G("B_tower", root, TC[0], 0, TC[1])
    ttop = G("B_towerTop", root, TC[0], 0, TC[1])
    ttop.root["cutaway"] = 1
    ring_wall(tw, 13.0, 1.4, 30.0, gaps=[(0.0, 14.0)], n=64)
    tw("wall").boxc(0, (14.0 + 30.0) / 2, math.sqrt(13.7 ** 2 - 49) , 15.0, 16.0, 1.4)
    for i in range(12):
        a = TAU * (i + 0.5) / 12
        if abs((a + PI) % TAU - PI) < 0.7:
            continue
        tw.at(math.sin(a) * 14.4, math.cos(a) * 14.4, a)
        tw("wall2", 0.05).polyx([(0, 0), (4.0, 0), (4.0, 2.0), (1.2, 32.0), (0, 32.0)], -0.6, 0.6)
        tw("pink", 0.0).polyx([(3.0, 2.0), (3.25, 2.0), (0.85, 31.0), (0.6, 31.0)], -0.63, 0.63)
        tw.at()
    for y in (10.0, 20.0):
        tw("cyan", 0.0).tor(14.45, 0.1, (0, y, 0), n=64, rs=4)
    ttop("wall2", 0.06).tor(14.6, 0.6, (0, 30.2, 0), n=64, rs=8)
    ttop("roof", 0.07).lath([(14.8, 30.4), (13.5, 33.0), (10.0, 35.5), (6.0, 36.6)], segs=64)
    ttop("wall2", 0.05).lath([(5.5, 36.2), (6.8, 36.3), (6.8, 37.3), (5.5, 37.5), (5.5, 36.2)], segs=40)
    for x0, x1 in ((-8.0, -7.0), (7.0, 8.0)):
        tw("wall").boxc((x0 + x1) / 2, H / 2, (Z1 - 1.0 - (TC[1] + 10.5)) / 2 + (TC[1] + 10.5) - TC[1], x1 - x0, H, (Z1 - 1.0) - (TC[1] + 10.5))
    ttop("roof", 0.05).boxc(0, H + 0.3, (Z1 - 1.0 + TC[1] + 10.5) / 2 - TC[1], 16.0, 0.6, (Z1 - 1.0) - (TC[1] + 10.5) + 0.6)
    tw("floor", 0.0).cylc(0, 0.03, 0, 13.2, 0.06, 64)
    tw("lime", 0.0).tor(9.0, 0.08, (0, 0.07, 0), n=64, rs=4, s=(1, 0.15, 1))
    tw("dark", 0.0).cylc(0, 0.075, 0, 8.4, 0.03, 48)
    railing_ring(tw, 8.6, 0.06, gap=(0.0, 2.0))
    reactor(G("B_reactor", tw.root), 26, 4.0, 4, crown_y=44)
    tw("panel", 0.04).lath([(9.8, 9.3), (11.8, 9.3), (11.8, 9.6), (9.8, 9.6), (9.8, 9.3)], segs=64)
    railing_ring(tw, 9.9, 9.6, step=1.6)
    railing_ring(tw, 11.7, 9.6, step=1.6)
    for i in range(8):
        a = TAU * i / 8 + 0.2
        tw("steel", 0.03).cylc(math.sin(a) * 10.8, 4.65, math.cos(a) * 10.8, 0.22, 9.3, 8)
    for i in range(10):
        a = TAU * (i + 0.5) / 10
        tw.light((math.sin(a) * 11.5, 18, math.cos(a) * 11.5), (1.0, 0.6, 0.85), 900, 1.0)
    # ---- gatehouse: two-stage airlock (outer iris door, a decon vestibule, inner door), pylons, pediment, security
    GZ0, GZ1 = Z0 + 1.0, Z0 + 13.0
    gh = G("B_gate", root)
    ghtop = G("B_gateTop", root)
    ghtop.root["cutaway"] = 1
    for sx in (-1, 1):
        gh("wall").boxc(sx * 9.5, 6.0, (GZ0 + GZ1) / 2, 1.0, 12.0, GZ1 - GZ0)
    for x0, x1 in ((-10.0, -4.2), (4.2, 10.0)):
        gh("wall").boxc((x0 + x1) / 2, 6.0, GZ1 - 0.5, x1 - x0, 12.0, 1.0)
    gh("wall").boxc(0, 9.75, GZ1 - 0.5, 8.4, 4.5, 1.0)
    ghtop("roof", 0.05).boxc(0, 12.25, (GZ0 + GZ1) / 2, 20.6, 0.5, GZ1 - GZ0 + 0.6)
    gh("floor", 0.0).boxc(0, 0.04, (GZ0 + GZ1) / 2, 18, 0.06, GZ1 - GZ0 - 1)
    for k in range(4):                                                     # decon nozzles and lit grilles in the vestibule
        z = GZ0 + 2.5 + k * 2.6
        for sx in (-1, 1):
            gh("steel", 0.0).cylc(sx * 8.8, 3.0, z, 0.15, 0.6, 8, "x")
            gh("cyan", 0.0).boxc(sx * 8.95, 6.5, z, 0.06, 1.4, 1.0)
        gh("lamp", 0.0).boxc(0, 11.95, z, 4.0, 0.1, 0.4)
    gh("hazard", 0.0).boxc(0, 0.08, (GZ0 + GZ1) / 2, 1.0, 0.02, GZ1 - GZ0 - 2)
    gh.light((0, 8, (GZ0 + GZ1) / 2), (0.7, 0.9, 1.0), 700, 1.0)
    dc = (0.0, 3.6, GZ1 + 0.05)
    gh("dark", 0.05).tor(3.75, 0.45, dc, (PI / 2, 0, 0), n=48, rs=8)
    gh("lime", 0.0).tor(4.3, 0.09, (0, 3.6, GZ1 + 0.1), (PI / 2, 0, 0), n=48, rs=4)
    for k in range(8):                                                     # the iris: eight overlapping leaves
        a = TAU * k / 8
        pts = [(0.0, 0.0), (3.4 * math.sin(a), 3.4 * math.cos(a)), (3.4 * math.sin(a + 0.95), 3.4 * math.cos(a + 0.95))]
        gh(("door" if k % 2 else "steel"), 0.015).polyz([(p[0] + 0.25 * math.sin(a + 1.9), 3.6 + p[1] + 0.25 * math.cos(a + 1.9)) for p in pts], GZ1 + 0.02 + k * 0.012, GZ1 + 0.1 + k * 0.012)
    gh("dark", 0.0).cylc(0, 3.6, GZ1 + 0.25, 0.35, 0.08, 16, "z")
    for sx in (-1, 1):                                                     # pylons and the pediment
        gh.at(sx * 12.5, GZ1 - 0.5)
        gh("wall2", 0.06).add(cylinder(1.0, 1.6, 19.0, 4)[:2], (0, 9.5, 0), (0, PI / 4, 0))
        gh("lime", 0.0).boxc(0, 9.0, 1.06, 0.25, 15.0, 0.06, (0.033, 0, 0))
        gh("dark", 0.03).boxc(0, 19.3, 0, 1.6, 0.6, 1.6)
        gh("red", 0.0).ball(0, 19.9, 0, 0.3, 8, 6)
        gh.at()
    gh("dark", 0.05).boxc(0, 14.1, GZ1 - 0.3, 22.4, 3.4, 0.8)
    gh("hazard", 0.0).boxc(0, 12.45, GZ1 + 0.12, 22.4, 0.12, 0.05)
    gh.text("ZBORNAK INSTITUTE", (0, 14.35, GZ1 + 0.14), 0, 1.5, "pink")
    gh.text("OF APPLIED ANTIMATTER  ·  VISITORS WILL BE PHOTOGRAPHED", (0, 13.1, GZ1 + 0.14), 0, 0.42, "lime")
    plate = security_post(gh, 0, GZ1 + 0.1, 0, 7.0, -1, "sec", (1.7, 2.5), (6.4, 3.6, 0.06))
    RUNNER["gate"] = ((plate[0], 0, plate[2]), PI)
    gh("path", 0.0).boxc(0, 0.04, GZ1 + 12, 26, 0.08, 24)
    for sx in (-1, 1):
        gh("lime", 0.0).boxc(sx * 13.0, 0.09, GZ1 + 12, 0.25, 0.04, 23)
    for k in range(3):
        for sx in (-1, 1):
            lamp_post(gh, sx * 12.0, GZ1 + 6 + k * 8, 6.0)
    # ---- the nave: floor, runway, bays
    lab("floor", 0.0).boxc(0, 0.03, (Z0 + Z1) / 2, 2 * HW, 0.06, Z0 - Z1)
    lab("floor2", 0.0).boxc(0, 0.065, (Z0 + Z1) / 2, 6.0, 0.01, Z0 - Z1)
    for sx in (-1, 1):
        lab("lime", 0.0).boxc(sx * 3.1, 0.07, (Z0 + Z1) / 2, 0.14, 0.02, Z0 - Z1)
    for k in range(10):
        lab("cyan", 0.0).boxc(0, 0.075, Z0 - 3 - k * 6.5, 2.0, 0.01, 0.3)
    # left front: hydroponics terraces
    hydro_rack(lab, -15.3, -7.0, PI / 2, 10.0, 3, 0)
    hydro_rack(lab, -10.6, -7.0, PI / 2, 8.0, 2, 1)
    for i in range(14):
        z = -1.0 - i * 0.9
        L = 2.0 + (i * 5 % 4) * 0.7
        lab("plant2", 0.0).path([(-16.4, H - 0.5, z), (-16.2, H - 0.5 - L / 2, z + 0.2), (-16.3, H - 0.5 - L, z)], 0.05, 4)
        lab(("teal", "lime", "vio")[i % 3], 0.0).ball(-16.3, H - 0.5 - L, z, 0.14, 8, 6)
    # left: the cryo gallery, eight pods
    for i in range(8):
        cryo_pod(lab, -14.6, -18.5 - i * 2.9, PI / 2, [0, 1, 2, 3, 5, 6, 7, 0][i], "cyan" if i % 2 else "teal")
    CAMS["cryo"] = ((-4.0, 2.4, -20.0), (-14.6, 2.2, -31.0), 30)
    # the lab terminal: SPECIMEN INDEX kiosk at the end of the gallery
    lab_terminal_kiosk(lab, -12.6, -45.0, PI / 2 - 0.35, "lab")
    a = PI / 2 - 0.35
    CAMS["term"] = ((-12.6 + math.sin(a) * 8.0 + 1.0, 2.6, -45.0 + math.cos(a) * 8.0), (-12.6, 2.4, -45.0), 30)
    # right front: the exotic-matter vault, a cage room
    vx0, vx1, vz0, vz1 = 8.5, HW, -1.0, -15.0
    for k in range(int((vz0 - vz1) / 1.2) + 1):
        z = vz0 - k * (vz0 - vz1) / int((vz0 - vz1) / 1.2)
        if not (-9.5 < z < -6.0):
            lab("steel", 0.0).bm((vx0, 0.0, z), (vx0, 6.0, z), 0.05, 5)
    for k in range(int((vx1 - vx0) / 1.2) + 1):
        x = vx0 + k * (vx1 - vx0) / int((vx1 - vx0) / 1.2)
        for z in (vz0, vz1):
            lab("steel", 0.0).bm((x, 0.0, z), (x, 6.0, z), 0.05, 5)
    for y in (0.15, 3.0, 6.0):
        lab("hazard" if y > 5 else "steel", 0.02).bm((vx0, y, vz0), (vx0, y, vz1), 0.08, 5).bm((vx0, y, vz0), (vx1, y, vz0), 0.08, 5).bm((vx0, y, vz1), (vx1, y, vz1), 0.08, 5)
    lab("vio", 0.0).boxc(vx0, 6.6, (vz0 + vz1) / 2, 0.1, 0.4, vz0 - vz1)
    lab.text("EXOTIC MATTER", (vx0 - 0.1, 6.6, (vz0 + vz1) / 2), -PI / 2, 0.42, "white")
    canister_rack(lab, 16.3, -4.5, -PI / 2, 5.0, 3, 3)
    canister_rack(lab, 16.3, -11.0, -PI / 2, 5.0, 3, 8)
    void_cage(lab, 12.4, -8.0, 0, 1.4, 2.4)
    # right: the robot line, a conveyor with four arms (one welding), parts and a chimera being assembled
    cx_, cz0, cz1 = 10.5, -18.0, -40.0
    lab("dark", 0.03).boxc(cx_, 0.5, (cz0 + cz1) / 2, 2.2, 1.0, cz0 - cz1)
    lab("rubber", 0.02).boxc(cx_, 1.06, (cz0 + cz1) / 2, 1.9, 0.12, cz0 - cz1 + 0.4)
    lab("hazard", 0.0).boxc(cx_ - 1.12, 0.9, (cz0 + cz1) / 2, 0.04, 0.15, cz0 - cz1)
    for k in range(12):
        lab("steel", 0.0).cylc(cx_ + 1.12, 0.95, cz0 - 1 - k * 1.8, 0.12, 0.06, 8, "x")
    lab.chim((cx_, 1.12, -24.0), 0.2, 1.0, 4)
    lab.chim((cx_, 1.12, -35.0), -0.4, 1.0, 2)
    for k in range(5):
        lab("panel", 0.02).boxc(cx_ + 0.2, 1.4, -19.5 - k * 0.9 - (5 if k > 2 else 0), 0.7, 0.55, 0.6)
    for i, z in enumerate((-20.5, -26.5, -32.5, -38.0)):
        robot_arm(lab, 14.8, z, -PI / 2, 0.95, 1.95, 0.65, (0.25, -0.2, 0.15, -0.3)[i], "welder" if i == 1 else ("drill" if i == 3 else "claw"), color="arm" if i % 2 == 0 else "wall2")
    CAMS["robots"] = ((2.0, 4.5, -18.0), (12.0, 1.6, -29.0), 32)
    # splice pod, right rear
    splice_pod(lab, 12.5, -50.0, -PI / 2)
    # holotables down the nave
    holotable(lab, 0.0, -10.0, 0.0, 2.2, "round", "moon")
    holotable(lab, 0.0, -28.0, 0.0, 3.0, "long", "helix")
    # projections on both walls and two hung over the nave
    projection(lab, -HW + 0.05, 9.4, -29.0, PI / 2, 22.0, 4.0, 1)
    projection(lab, HW - 0.05, 9.4, -29.0, -PI / 2, 22.0, 4.0, 0)
    for z in (-17.0, -38.0):
        projection(lab, 0.0, 9.0, z, 0.0, 9.0, 3.4, 2)
        lab("steel", 0.0).bm((-4, 10.7, z), (-4, H + 6.0, z), 0.03, 4).bm((4, 10.7, z), (4, H + 6.0, z), 0.03, 4)
    # Zbornak's podium before the reactor arch: a stepped round podium, a curved desk, the doctor facing the door
    lab("panel", 0.04).cylc(0, 0.3, -50.0, 3.6, 0.6, 32)
    lab("panel", 0.04).cylc(0, 0.15, -50.0, 4.4, 0.3, 32)
    lab("lime", 0.0).tor(3.6, 0.05, (0, 0.6, -50.0), n=36, rs=4)
    for k in range(-2, 3):
        a = k * 0.3
        lab("cyan", 0.04).boxc(math.sin(a) * 2.2, 1.0, -50.0 + math.cos(a) * 2.2, 1.0, 0.8, 0.6, (0, a, 0))
        lab("dark", 0.02).boxc(math.sin(a) * 2.25, 1.45, -50.0 + math.cos(a) * 2.25, 1.02, 0.1, 0.8, (0, a, 0))
    lab("dark", 0.03).boxc(0, 2.4, -52.6, 3.0, 2.2, 0.2)
    lab("holo", 0.0).boxc(0, 2.6, -52.45, 2.6, 1.6, 0.02)
    zbornak(lab.root, VARIANT, 0.0, -50.4, 0.0).root.location.z = 0.6
    CAMS["zb"] = ((2.4, 2.9, -45.0), (0.0, 1.9, -50.4), 45)
    # ---- outside: the specimen jar, gas racks, generator, path to the ranch
    out = G("B_out", root)
    specimen_jar(out, 17.0, 26.0)
    gas_rack(out, 26.0, -30.0, 0.0)
    gas_rack(out, -26.0, -62.0, 0.5)
    out.at(24, -8, -PI / 2)
    out("panel", 0.06).boxc(0, 1.5, 0, 6, 3, 3.4)
    for i in range(5):
        out("dark", 0.0).boxc(-2.2 + i * 1.1, 2.0, 1.72, 0.15, 2.0, 0.04)
    out("lime", 0.0).boxc(-2.4, 2.4, 1.73, 0.8, 0.4, 0.02)
    out.at()
    path_strip(out, [(-13.0, 30.0), (-32.0, 24.0), (-50.0, 9.0)], 3.0)
    path_strip(out, [(13.0, 30.0), (30.0, 36.0), (38.0, 38.0)], 3.0)
    landing_pad(out, 52.0, 42.0, 12.0, "Z")
    radiator_field(out, 50.0, -40.0, PI / 2, 2, 5, (19.0, -30.0))
    test_site(out, 58.0, -86.0, 11.0)
    path_strip(out, [(24.0, -60.0), (40.0, -66.0), (52.0, -68.0)], 2.4, edge="amber")
    ranch_b(root)
    CAMS["over"] = ((105.0, 105.0, 150.0), (-25.0, 0.0, -20.0), 32)
    CAMS["cut"] = ((62.0, 64.0, 40.0), (0.0, 0.0, -32.0), 30)
    CAMS["gate"] = ((-7.5, 2.6, GZ1 + 19.0), (1.5, 5.0, GZ1), 26)
    CAMS["inside"] = ((5.0, 3.0, 4.5), (-1.0, 6.5, -50.0), 22)
    CAMS["front"] = ((38.0, 10.0, 80.0), (-2.0, 13.0, 0.0), 30)


def ranch_b(root):
    r = G("B_ranch", root)
    # ---- the bunkhouse: log walls, a pitched roof, a porch on the corral side, the pen terminal inside
    HX, HZ = -70.0, -30.0
    h = G("B_bunk", root, HX, 0, HZ)
    h("stone", 0.03).boxc(0, 0.35, 0, 22.6, 0.7, 10.6)
    for k in range(12):                                                     # log courses on the back and the ends
        y = 0.9 + k * 0.42
        h("wood", 0.0).cylc(0, y, -5.0, 0.22, 22.4, 8, "x")
        for sx in (-1, 1):
            h("wood", 0.0).cylc(sx * 11.0, y, 0, 0.22, 10.4, 8, "z")
    h("wood", 0.04).boxc(0, 3.3, -5.0, 22.0, 5.2, 0.3).boxc(-11.0, 3.3, 0, 0.3, 5.2, 10.0).boxc(11.0, 3.3, 0, 0.3, 5.2, 10.0)
    for x0, x1 in ((-11.0, -6.6), (-4.4, -1.6), (1.6, 11.0)):
        h("wood", 0.04).boxc((x0 + x1) / 2, 3.3, 5.0, x1 - x0, 5.2, 0.3)
    h("wood", 0.04).boxc(-5.5, 4.9, 5.0, 2.2, 2.0, 0.3).boxc(0.0, 0.95, 5.0, 3.2, 1.3, 0.3).boxc(0.0, 5.0, 5.0, 3.2, 1.8, 0.3)
    h("glass", 0.0).boxc(0.0, 2.85, 5.0, 3.2, 2.5, 0.06)
    for sx in (-1, 1):
        h("wood", 0.04).polyx([(-5.6, 5.9), (5.6, 5.9), (0, 9.2)], sx * 11.0 - 0.15, sx * 11.0 + 0.15)
    for sz in (-1, 1):
        slope_box(h, "roof2", (sz * 6.3, 5.5), (0, 9.4), -11.8, 11.8, 0.3, 0.06)
    h("dark", 0.04).boxc(7.0, 9.6, -1.5, 1.2, 2.6, 1.2)
    for k in range(5):
        h("smoke", 0.0).ball(7.0 + math.sin(k) * 0.3, 11.4 + k * 0.9, -1.5, 0.35 + k * 0.15, 10, 7)
    h("floor", 0.0).boxc(0, 0.72, 0, 21.6, 0.04, 9.6)
    pen_terminal(h, -1.0, -3.9, 0.15, "pen")
    h("wood2", 0.02).boxc(-8.0, 1.2, -3.8, 3.0, 1.0, 1.4).boxc(4.5, 1.1, -3.2, 2.2, 0.8, 1.2)
    for k in range(3):
        h("dark", 0.0).boxc(-3.5 + k * 0.7, 3.6, -4.82, 0.5, 0.6, 0.04)
        h(("lime", "pink", "cyan")[k], 0.0).boxc(-3.5 + k * 0.7, 3.6, -4.79, 0.38, 0.45, 0.02)
    h("lamp", 0.0).boxc(-1.0, 5.6, -2.0, 2.0, 0.1, 0.4)
    h.light((-1.0, 4.6, -1.5), (1.0, 0.9, 0.7), 450, 0.3)
    h.light((-6.0, 4.0, 0.0), (1.0, 0.8, 0.55), 300, 0.3)
    # porch: deck, posts, a shed roof, a rocking chair, the sign
    h("wood2", 0.03).boxc(0, 0.6, 7.2, 22.4, 0.2, 4.2)
    for k in range(7):
        x = -10.8 + k * 3.6
        h("wood2", 0.03).cylc(x, 3.1, 9.0, 0.16, 5.0, 8)
    slope_box(h, "corr", (5.0, 5.9), (9.8, 5.1), -11.6, 11.6, 0.15, 0.04)
    h("dark", 0.04).boxc(-5.5, 6.45, 5.25, 5.4, 0.9, 0.15)
    h.text("HOLDING PEN", (-5.5, 6.25, 5.34), 0, 0.55, "lime")
    h.at(4.5, 7.8, -0.4)
    h("wood", 0.02).boxc(0, 1.1, 0, 0.8, 0.1, 0.7).boxc(0, 1.6, -0.35, 0.8, 1.0, 0.08)
    h("wood2", 0.0).tor(0.6, 0.04, (0.38, 0.75, 0), (0, PI / 2, 0), n=16, rs=4, s=(1, 0.5, 1)).tor(0.6, 0.04, (-0.38, 0.75, 0), (0, PI / 2, 0), n=16, rs=4, s=(1, 0.5, 1))
    h.at()
    h("wood2", 0.0).tor(0.35, 0.03, (-9.2, 2.2, 9.15), (PI / 2, 0, 0), n=16, rs=4)
    CAMS["office"] = ((HX + 1.5, 2.4, HZ + 8.6), (HX - 1.0, 1.8, HZ - 3.9), 30)
    # ---- the round corral round the feed carousel, a lane to the training ring, the gate arch facing the lab
    R1, R1r = (-72.0, 8.0), 17.0
    fence_ring(r, R1[0], R1[1], R1r, 1.6, gap=(PI / 2, 8.6), lamps=8)
    r("dirt", 0.0).cylc(R1[0], 0.025, R1[1], R1r, 0.04, 48)
    gate_arch(r, R1[0] + R1r, R1[1], PI / 2, 8.0, 6.2, "ZBORNAK RANCH")
    # the feed carousel: a hopper on four legs, six chutes down to a ring trough of glowing feed
    fc = G("B_carousel", root, R1[0], 0, R1[1])
    for k in range(4):
        a = TAU * k / 4 + PI / 4
        fc("steel", 0.03).bm((math.sin(a) * 2.6, 0, math.cos(a) * 2.6), (math.sin(a) * 1.6, 7.0, math.cos(a) * 1.6), 0.15, 6)
    fc("corr", 0.05).lath([(0.4, 5.6), (2.6, 7.6), (2.6, 10.6), (2.3, 11.2), (0.4, 11.4)], segs=24)
    fc("barn", 0.03).lath([(2.7, 11.1), (1.0, 12.4), (0.0, 12.6)], segs=24)
    fc("lime", 0.0).tor(2.62, 0.08, (0, 9.0, 0), n=32, rs=4)
    for k in range(6):
        a = TAU * k / 6
        fc("hazard", 0.0).path([(math.sin(a) * 1.8, 7.4, math.cos(a) * 1.8), (math.sin(a) * 3.5, 4.0, math.cos(a) * 3.5), (math.sin(a) * 4.6, 1.5, math.cos(a) * 4.6)], 0.22, 8)
    fc("wood2", 0.03).lath([(4.0, 0), (5.4, 0), (5.4, 1.0), (5.2, 1.0), (5.2, 0.8), (4.2, 0.8), (4.2, 1.0), (4.0, 1.0), (4.0, 0)], segs=48)
    fc("feed", 0.0).tor(4.7, 0.45, (0, 0.82, 0), n=48, rs=6, s=(1, 0.12, 1))
    for i in range(18):
        a = TAU * i / 18
        fc("feed2", 0.0).ball(math.sin(a) * 4.7, 0.88, math.cos(a) * 4.7, 0.16, 6, 4, s=(1, 0.5, 1))
    fc("dark", 0.03).boxc(0, 2.0, 2.0, 0.6, 1.0, 0.4)
    fc("lime", 0.0).boxc(0, 2.2, 2.21, 0.4, 0.25, 0.02)
    fc.text("CHOW CAROUSEL", (0, 12.0, 2.8), 0, 0.5, "amber")
    for i, a in enumerate((0.3, 1.5, 2.6, 3.8, 5.0)):
        r.chim((R1[0] + math.sin(a) * 6.4, 0.04, R1[1] + math.cos(a) * 6.4), a + PI, 1.6, (0, 3, 5, 6, 2)[i])
    R2, R2r = (-74.0, 44.0), 10.0
    fence_ring(r, R2[0], R2[1], R2r, 1.4, gap=(PI, 6.0), lamps=4)
    r("moss", 0.0).cylc(R2[0], 0.03, R2[1], R2r - 0.2, 0.03, 40)
    for sx in (-3.0, 3.0):
        fence_run(r, [(R1[0] + sx, R1[1] + R1r - 0.3), (R2[0] + sx, R2[1] - R2r + 0.3)])
    r.chim((R2[0] + 2.0, 0.04, R2[1] + 1.0), 2.4, 1.6, 7)
    r.chim((R2[0] - 3.5, 0.04, R2[1] - 2.0), 0.9, 1.6, 1)
    # hay feeder in the training ring, bales by the bunkhouse
    r("wood2", 0.03).boxc(R2[0] + 4.0, 0.9, R2[1] + 5.0, 3.0, 1.8, 1.4)
    for k in range(5):
        r("wood", 0.0).bm((R2[0] + 2.7 + k * 0.65, 1.0, R2[1] + 5.72), (R2[0] + 2.7 + k * 0.65, 1.8, R2[1] + 5.72), 0.03, 4)
    r("moss", 0.0).boxc(R2[0] + 4.0, 1.9, R2[1] + 5.0, 2.7, 0.4, 1.1)
    for i in range(3):
        for j in range(3 - i):
            bale(r, -54.0 + j * 1.5 + i * 0.75, -33.0, 0.0, i * 0.9)
    for i in range(3):
        bale(r, -54.0 + i * 1.5, -27.0, 1.57, 0, True)
    # water: a water tower with a pipe to a stock tank inside the corral; the sun-mill beside it
    wt = G("B_watertower", root, -94.0, 0, -12.0)
    for k in range(4):
        a = TAU * k / 4 + PI / 4
        wt("wood2", 0.03).bm((math.sin(a) * 3.4, 0, math.cos(a) * 3.4), (math.sin(a) * 2.4, 9.0, math.cos(a) * 2.4), 0.2, 6)
    for y in (3.0, 6.0):
        for k in range(4):
            a, b = TAU * k / 4 + PI / 4, TAU * (k + 1) / 4 + PI / 4
            f = 3.4 - (y / 9.0)
            wt("wood", 0.0).bm((math.sin(a) * f, y, math.cos(a) * f), (math.sin(b) * f, y, math.cos(b) * f), 0.08, 4)
    wt("wood2", 0.03).cylc(0, 9.15, 0, 3.6, 0.3, 24)
    wt("wood", 0.05).cylc(0, 11.3, 0, 3.2, 4.0, 24)
    for y in (9.8, 11.3, 12.8):
        wt("steel", 0.0).tor(3.22, 0.05, (0, y, 0), n=32, rs=4)
    wt("roof2", 0.04).add(cylinder(0.1, 3.6, 1.8, 24)[:2], (0, 14.2, 0))
    wt("steel", 0.0).path([(1.5, 9.2, 1.5), (2.0, 4.0, 2.0), (4.5, 0.4, 5.0), (12.0, 0.4, 14.0), (13.5, 0.9, 14.6)], 0.12, 6)
    stock_tank(r, -79.5, 3.0, 2.3)
    wind_pump(r, -98.0, -22.0, 9.5, 0.4)
    # lamps along the corral's approach
    for (x, z) in ((-46.0, 4.0), (-46.0, 14.0)):
        lamp_post(r, x, z, 5.0)
    CAMS["ranch"] = ((-30.0, 24.0, 50.0), (-74.0, 2.0, 0.0), 30)


def build(variant=None):
    global VARIANT
    if variant:
        VARIANT = variant
    root = pivot(f"zbornak_lab_{VARIANT}", (0, 0, 0), None)
    CHIMS.clear(); LIGHTS.clear(); CAMS.clear(); TEXTS.clear(); RUNNER.clear()
    (draft_a if VARIANT == "a" else draft_b)(root)
    flush_all()
    return root


ROOT = build()
dg = bpy.context.evaluated_depsgraph_get()
tris = sum(len(o.data.polygons) for o in C.objects if o.type == "MESH")
print(f"built draft {VARIANT}: {len(C.objects)} objects, {tris} faces, {len(CHIMS)} chimeras, {len(LIGHTS)} lights")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    zb = next(o for o in C.objects if o.name.startswith("zbornak_" + VARIANT) and o.type == "EMPTY")
    keep_ = [zb] + list(zb.children_recursive)
    mw = zb.matrix_world.copy()
    par, loc, rot = zb.parent, zb.location.copy(), zb.rotation_euler.copy()
    zb.parent = None
    zb.location, zb.rotation_euler = (0, 0, 0), (0, 0, 0)
    export(os.path.join(OUTDIR, f"zbornak_{VARIANT}.glb"), keep_)
    zb.parent, zb.location, zb.rotation_euler = par, loc, rot
