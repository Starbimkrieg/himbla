# PROPOSAL A for the Kepler Civic Center's town hall (settlements.js townHall, and the gold council dome it stands beside):
# "EARTHRISE HALL". A round council chamber dug in behind terraces of sintered-regolith block, the way every Kepler home is,
# under a shallow white saucer roof with a glazed oculus; its front opens in a crescent of glass, the foyer, under a canopy
# that carries the hall's solar array. The clock tower becomes a campanile beside the forecourt: a pylon holding a ring with
# the Earth at its centre (the lunar clock: kepler_kit.py earth_dial).
#
#   MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/proposals/kepler_hall_a.py
#   (preview_kepler.py builds it and renders the review pictures)
#
# Frame: three.js axes, origin on the ground at the chamber's centre, the entrance toward +z (arrivals). Podium 0.9 m up,
# r 21.5; chamber drum r 12, its roof's crown at 15.6; the campanile at (-19, 30), 31 m to its lamp; forecourt out to z 44.
# Root empty "kepler_hall_a". No pivots or colliders yet: a concept for review.

import bpy, math, os

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", "..", ".."))
COLL = "KeplerHallA"
PART = "put" in globals()            # exec()'d by kepler_town.py, which has the kit and stands the hall in a town
if not PART:
    exec(open(os.path.join(REPO, "tools", "blender", "proposals", "kepler_kit.py"), encoding="utf-8").read(), globals())
    ROOT = pivot("kepler_hall_a", (0, 0, 0), None, proposal="a")
POD = 0.9
FRONT = math.radians(60)             # the foyer's half angle about +z
A0, A1 = PI / 2 - FRONT, PI / 2 + FRONT


def build_hall_a():
    # podium, forecourt, steps
    put("concrete", 0.06, cyl(0, POD / 2, 0, 21.5, POD, 56))
    plaza(0, 30, 14.5)
    put("gold", 0.0, xf(lathe([(10.0, 0.04), (10.0, 0.055), (10.4, 0.055), (10.4, 0.04)], 48), (0, 0, 30)))
    for i in range(3):
        put("light", 0.02, bx(-7 + 0.02 * i, 0, 20.6, 7 - 0.02 * i, POD - 0.225 * (i + 1), 21.9 + 0.6 * i))
    # the chamber: drum, clerestory, eave, saucer roof, oculus
    put("cream", 0.1, cyl(0, POD + 4.5, 0, 12.0, 9.0, 56))
    put("window", 0.0, lathe([(11.9, POD + 7.3), (12.05, POD + 7.3), (12.05, POD + 8.6), (11.9, POD + 8.6)], 56))
    for i in range(28):
        a = TAU * (i + 0.5) / 28
        with at(0, 0, a):
            put("alu", 0.0, bx(-0.1, POD + 7.3, 12.0, 0.1, POD + 8.6, 12.12))
    put("orange", 0.04, lathe([(11.9, POD + 9.0), (13.7, POD + 9.0), (13.7, POD + 9.5), (11.9, POD + 9.5)], 56))
    n = 8
    put("white", 0.1, lathe([(13.4 * math.cos(PI / 2 * i / n), POD + 9.5 + 4.6 * math.sin(PI / 2 * i / n)) for i in range(n)] + [(0, POD + 14.1)], 56))
    crown(POD + 13.95, 2.6)
    # the terraces round the back, a concrete wing wall where they stop
    prof = [(11.5, POD), (19.9, POD), (19.5, POD + 2.2), (17.3, POD + 2.2), (16.9, POD + 4.4), (14.7, POD + 4.4), (14.3, POD + 6.6), (11.5, POD + 6.6)]
    put("regolith", 0.07, sector(prof, A1 + 0.03, A0 + TAU - 0.03, 44))
    for a in (A0, A1):
        with at(0, 0, PI / 2 - a):
            put("concrete", 0.06, extrude([(11.5, POD), (21.0, POD), (21.0, POD + 1.6), (14.0, POD + 7.2), (11.5, POD + 7.2)], 0.8, "x"))
    # the foyer: a lit floor, the glass crescent and its mullions, the canopy on its columns, the array on the canopy
    put("shop", 0.0, sector([(12.0, POD), (16.4, POD), (16.4, POD + 0.03), (12.0, POD + 0.03)], A0 + 0.03, A1 - 0.03, 20))
    put("glass", 0.0, sector([(16.4, POD), (16.5, POD), (16.5, POD + 6.2), (16.4, POD + 6.2)], A0 + 0.03, A1 - 0.03, 24))
    nm = 18
    for i in range(nm + 1):
        a = -FRONT + 0.03 + (2 * FRONT - 0.06) * i / nm
        if abs(a) < 0.12:
            continue
        with at(0, 0, a):
            put("alu", 0.02, bx(-0.09, POD, 16.38, 0.09, POD + 6.2, 16.62))
    put("alu", 0.0, sector([(16.36, POD + 3.0), (16.6, POD + 3.0), (16.6, POD + 3.14), (16.36, POD + 3.14)], A0 + 0.03, A1 - 0.03, 24))
    put("roof", 0.06, sector([(11.9, POD + 6.2), (19.2, POD + 6.2), (19.2, POD + 6.75), (11.9, POD + 6.75)], A0 - 0.02, A1 + 0.02, 24))
    put("orange", 0.0, sector([(19.2, POD + 6.3), (19.215, POD + 6.3), (19.215, POD + 6.65), (19.2, POD + 6.65)], A0 - 0.02, A1 + 0.02, 24))
    for k in range(6):
        a0 = A0 + 0.04 + (2 * FRONT - 0.08) * k / 6
        put("solar", 0.0, sector([(13.4, POD + 6.75), (18.6, POD + 6.75), (18.6, POD + 6.8), (13.4, POD + 6.8)], a0 + 0.02, a0 + (2 * FRONT - 0.08) / 6 - 0.02, 4))
    for i in range(8):
        a = -FRONT + 0.1 + (2 * FRONT - 0.2) * i / 7
        put("alu", 0.03, cyl(math.sin(a) * 18.4, POD + 3.11, math.cos(a) * 18.4, 0.2, 6.22, 8, rt=0.14))
        put("lamp", 0.0, cyl(math.sin(a) * 17.4, POD + 6.17, math.cos(a) * 17.4, 0.3, 0.06, 8))
    # the way in: an orange portal through the glass, the chamber's lit doorway behind it
    put("orange", 0.05, bx(-2.7, POD, 15.8, 2.7, POD + 4.4, 17.3))
    put("door", 0.0, bx(-2.1, POD, 17.3, 2.1, POD + 3.6, 17.33))
    put("lamp", 0.0, bx(-2.1, POD + 3.75, 17.3, 2.1, POD + 4.05, 17.33))
    put("dark", 0.0, bx(-0.03, POD, 17.33, 0.03, POD + 3.6, 17.335))
    for a in (-0.5, 0.5):
        with at(0, 0, a):
            put("window", 0.0, bx(-1.2, POD, 11.9, 1.2, POD + 4.2, 12.03))
    # the campanile: a pylon carrying the Earth dial, a lamp over it
    cx, cz, cy, R = -19.0, 30.0, 26.0, 3.4
    put("concrete", 0.05, bx(cx - 2.0, 0, cz - 2.0, cx + 2.0, 0.8, cz + 2.0))
    put("cream", 0.08, xf(frustum(ngon(1.7, 4, PI / 4), ngon(0.75, 4, PI / 4), 0.8, cy - R + 0.1), (cx, 0, cz)))
    put("orange", 0.02, xf(frustum(ngon(1.62, 4, PI / 4), ngon(1.56, 4, PI / 4), 4.0, 4.7), (cx, 0, cz)))
    put("window", 0.0, bx(cx - 0.12, 6.0, cz + 0.6, cx + 0.12, 18.0, cz + 1.0))
    with at(cx, cz):
        earth_dial(0, cy, 0, R)
        put("steel", 0.02, cyl(0, cy + R + 0.9, 0, 0.08, 1.4, 6))
        put("redlamp", 0.0, ball(0, cy + R + 1.7, 0, 0.24, 8, 6))
    # flags, lamps, people
    for sx in (-1, 1):
        flagpole(sx * 12.5, 25.0)
        lamp(sx * 9.0, 38.0)
        lamp(sx * 13.5, 33.0)
    figure(1.5, 24.0)
    figure(-3.0, 31.0, "sage")
    figure(-16.0, 32.5, "dusk")


if not PART:
    build_hall_a()
    OBJS = flush_all(ROOT, "kha_")
    print("kepler hall A:", tri_count(OBJS), "triangles")
