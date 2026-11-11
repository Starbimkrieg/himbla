# PROPOSAL B for the Kepler Civic Center's town hall (settlements.js townHall, and the gold council dome it stands beside):
# "FOUNDERS' LANDING". The hall as the ship the settlement came down in: an eight-sided council vessel on four lander legs
# (pinned footpads, shock sleeves, the Orrery's language), the open forum of the town under it, lit by the descent engine's
# bell; a long stair comes down the front the way a lander's ladder does. On the vessel's deck a glazed lantern (the
# council chamber's clerestory) carrying the Earth dial, four radiator fins, and the mast with the Kepler orbit ring.
#
#   MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/proposals/kepler_hall_b.py
#   (preview_kepler.py builds it and renders the review pictures)
#
# Frame: three.js axes, origin on the ground under the vessel's centre, the stair toward +z (arrivals). Footpads at r 19 on
# the diagonals; the vessel's underside 6 m up (a skater passes under), its floor 7.8, its deck 13.4, the lantern's roof 19.1,
# the mast's lamp 28.9. Root empty "kepler_hall_b". No pivots or colliders yet: a concept for review.

import bpy, math, os

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", "..", ".."))
COLL = "KeplerHallB"
PART = "put" in globals()            # exec()'d by kepler_town.py, which has the kit and stands the hall in a town
if not PART:
    exec(open(os.path.join(REPO, "tools", "blender", "proposals", "kepler_kit.py"), encoding="utf-8").read(), globals())
    ROOT = pivot("kepler_hall_b", (0, 0, 0), None, proposal="b")
IN = math.cos(PI / 8)                # an octagon's face is this fraction of its corner radius out


def stack(levels):
    """one closed solid through octagons [(corner radius, y)], bottom to top"""
    rings = [ngon(r, 8, PI / 8) for r, _ in levels]
    verts = [(x, y, z) for pts, (_, y) in zip(rings, levels) for x, z in pts]
    faces = [tuple(range(8)), tuple(range(len(verts) - 1, len(verts) - 9, -1))]
    for k in range(len(levels) - 1):
        for i in range(8):
            j = (i + 1) % 8
            faces.append((k * 8 + i, k * 8 + j, (k + 1) * 8 + j, (k + 1) * 8 + i))
    return verts, faces


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def build_hall_b():
    # the forum: paving, an inlaid ring, the rostrum under the bell, benches
    put("pave", 0.0, frustum(ngon(19.5, 8, PI / 8), ngon(19.5, 8, PI / 8), 0, 0.05))
    put("gold", 0.0, lathe([(6.6, 0.05), (6.6, 0.065), (7.0, 0.065), (7.0, 0.05)], 40))
    put("concrete", 0.04, cyl(0, 0.225, 0, 2.4, 0.45, 20))
    put("alu", 0.03, bx(-0.5, 0.45, -0.3, 0.5, 1.5, 0.1))
    for yaw in (PI / 2, -PI / 2, PI, PI * 0.75, -PI * 0.75):
        with at(0, 0, yaw):
            put("concrete", 0.03, bx(-2.4, 0, 8.6, 2.4, 0.45, 9.5))
    # the legs
    for k in range(4):
        th = PI / 4 + k * PI / 2
        c, s = math.cos(th), math.sin(th)
        foot, top = (19 * c, 0.55, 19 * s), (9.6 * c, 7.3, 9.6 * s)
        put("alu", 0.05, xf(lathe([(0, 0), (1.9, 0), (2.1, 0.25), (1.2, 0.6), (0, 0.7)], 14), (19 * c, 0, 19 * s)))
        put("steel", 0.05, strut(foot, top, 0.42, 8))
        put("alu", 0.04, strut(foot, lerp(foot, top, 0.38), 0.6, 8))
        put("orange", 0.0, strut(lerp(foot, top, 0.36), lerp(foot, top, 0.41), 0.62, 8))
        for d in (-0.42, 0.42):
            put("steel", 0.03, strut(lerp(foot, top, 0.55), (7.6 * math.cos(th + d), 6.25, 7.6 * math.sin(th + d)), 0.16, 6))
    # the vessel
    put("cream", 0.1, stack([(8.0, 6.0), (11.5, 7.6), (11.5, 12.2), (9.0, 13.4)]))
    put("orange", 0.0, stack([(11.51, 7.62), (11.51, 8.12)]))
    for k in range(1, 8):
        with at(0, 0, k * PI / 4):
            put("window", 0.0, bx(-3.2, 9.4, 11.5 * IN, 3.2, 11.2, 11.5 * IN + 0.012))
            for x in (-3.2, -1.07, 1.07, 3.2):
                put("alu", 0.0, bx(x - 0.06, 9.4, 11.5 * IN, x + 0.06, 11.2, 11.5 * IN + 0.04))
    for i in range(8):
        a = TAU * i / 8
        put("lamp", 0.0, cyl(math.sin(a) * 5.0, 5.98, math.cos(a) * 5.0, 0.35, 0.06, 8))
    # the engine bell, lighting the forum
    put("dark", 0.05, lathe([(0.9, 6.3), (0.8, 5.4), (1.5, 4.5), (2.3, 3.9), (2.15, 3.9), (1.38, 4.55), (0.65, 5.4), (0.65, 6.3)], 20))
    put("lamp", 0.0, cyl(0, 4.8, 0, 1.1, 0.1, 16))
    # the lift, at the back of the forum
    put("glass", 0.0, cyl(0, 3.2, -6.0, 1.5, 6.4, 16))
    for y in (0.15, 3.2, 6.1):
        put("alu", 0.02, cyl(0, y, -6.0, 1.58, 0.3, 16))
    put("dark", 0.0, bx(-0.7, 0.3, -4.52, 0.7, 2.6, -4.45))
    # the way in: portal, landing, the long stair
    F = 11.5 * IN
    put("orange", 0.04, bx(-1.7, 7.8, F - 0.2, 1.7, 10.9, F + 0.2))
    put("door", 0.0, bx(-1.3, 7.8, F + 0.2, 1.3, 10.5, F + 0.23))
    put("lamp", 0.0, bx(-1.2, 10.58, F + 0.2, 1.2, 10.8, F + 0.23))
    put("steel", 0.03, bx(-2.2, 7.6, F - 0.1, 2.2, 7.8, 13.2))
    n, z0 = 24, 13.2
    rise = 7.8 / n
    for x in (-1.9, 1.9):
        put("steel", 0.0, strut((x, 7.62, 13.0), (x, 7.0, 9.2), 0.1, 5))
        put("alu", 0.03, strut((x, 7.68, z0), (x, 0.1, z0 + n * 0.5), 0.14, 5))
        zm = z0 + n * 0.25
        put("steel", 0.02, strut((x, 0, zm), (x, 7.68 - 7.58 * 0.5, zm), 0.1, 5))
        put("concrete", 0.02, bx(x - 0.4, 0, zm - 0.4, x + 0.4, 0.2, zm + 0.4))
        sx = 1 if x > 0 else -1
        rail("orange", [(sx * 2.15, 7.8, F + 0.3), (sx * 2.15, 7.8, z0), (sx * 1.95, 7.8, z0), (sx * 1.95, 0.0, z0 + n * 0.5)], every=1.6)
    for i in range(n):
        y = 7.8 - (i + 1) * rise
        put("steel", 0.0, bx(-1.9, y - 0.06, z0 + i * 0.5 + 0.04, 1.9, y, z0 + i * 0.5 + 0.46))
    # the deck: its rail, the lantern with the dial, the radiator fins
    D = 13.4
    pts = ngon(8.7, 8, PI / 8)
    for i in range(8):                                       # the rail stops either side of each radiator fin
        a, b = (pts[i][0], D, pts[i][1]), (pts[(i + 1) % 8][0], D, pts[(i + 1) % 8][1])
        if i % 2 == 0:
            rail("orange", [a, lerp(a, b, 0.44)], every=1.7)
            rail("orange", [lerp(a, b, 0.56), b], every=1.7)
        else:
            rail("orange", [a, b], every=1.7)
    put("cream", 0.05, cyl(0, D + 0.25, 0, 6.3, 0.5, 32))
    put("pane", 0.0, lathe([(5.9, D + 0.5), (6.0, D + 0.5), (6.0, D + 3.9), (5.9, D + 3.9)], 32))
    for i in range(16):
        with at(0, 0, TAU * (i + 0.5) / 16):
            put("alu", 0.0, bx(-0.08, D + 0.5, 5.95, 0.08, D + 3.9, 6.08))
    put("orange", 0.04, lathe([(5.9, D + 3.9), (7.0, D + 3.9), (7.0, D + 4.25), (5.9, D + 4.25)], 32))
    m = 6
    put("white", 0.08, lathe([(6.8 * math.cos(PI / 2 * i / m), D + 4.25 + 1.4 * math.sin(PI / 2 * i / m)) for i in range(m)] + [(0, D + 5.65)], 32))
    earth_dial(0, D + 2.2, 6.3, 1.65, backed=True)
    for k in range(4):
        with at(0, 0, PI / 4 + k * PI / 2):
            put("alu", 0.03, bx(-0.08, 12.3, 6.6, 0.08, 17.6, 10.2))
            put("steel", 0.0, strut((0, 17.6, 6.5), (0, 17.6, 10.3), 0.07, 5))
            for y in (14.2, 15.2, 16.2):
                put("metal", 0.0, bx(-0.086, y, 6.9, 0.086, y + 0.12, 9.9))
    # the mast: the Kepler orbit ring (the game would turn it, as the Orrery's), the lamp
    put("steel", 0.03, cyl(0, 23.8, 0, 0.22, 9.9, 8, rt=0.12))
    R, C, ROT = 3.2, (0, 25.3, 0), (0.45, 0.6, 0)
    put("orange", 0.02, xf(torus(R, 0.14, 48, 8), C, ROT))
    put("blue", 0.03, xf(ball(math.sin(0.6) * R, 0, math.cos(0.6) * R, 0.65, 12, 8), C, ROT))
    for a in (0.0, TAU / 3, 2 * TAU / 3):
        put("steel", 0.0, xf(strut((0, 0, 0), (math.sin(a) * R, 0, math.cos(a) * R), 0.05, 4), C, ROT))
    put("beacon", 0.0, ball(0, 28.9, 0, 0.3, 8, 6))
    put("steel", 0.02, strut((-3.5, 18.6, -2.0), (-3.5, 20.2, -2.0), 0.08, 5))
    put("white", 0.04, xf(lathe([(0.0, 0.0), (0.7, 0.12), (1.3, 0.5), (1.35, 0.5), (0.7, 0.05), (0.0, -0.08)], 14), (-3.5, 20.2, -2.0), (-0.6, -1.0, 0)))
    # flags, lamps, people
    for sx in (-1, 1):
        flagpole(sx * 9.0, 27.0)
        lamp(sx * 6.0, 19.0)
        lamp(sx * 18.5, 0.0)
    figure(2.8, 26.5)
    figure(-3.0, 3.5, "sage")
    figure(4.5, -2.0, "dusk")


if not PART:
    build_hall_b()
    OBJS = flush_all(ROOT, "khb_")
    print("kepler hall B:", tri_count(OBJS), "triangles")
