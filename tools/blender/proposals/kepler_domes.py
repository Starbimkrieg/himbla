# PROPOSAL sheet for the Kepler town kit (docs/kepler-proposals): the two hab-dome remodels at three sizes, and the station
# pieces the town layouts use, lined up for review. Pieces are kepler_kit.py's.
#
#   MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/proposals/kepler_domes.py
#   (preview_kepler.py builds it and renders the review pictures)
#
# KEPLER_SET picks what is lined up: "domes" (default: A and B at r 8, 14 and 22), "pieces" (the station pieces).

import bpy, math, os

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", "..", ".."))
COLL = "KeplerKit"
exec(open(os.path.join(REPO, "tools", "blender", "proposals", "kepler_kit.py"), encoding="utf-8").read(), globals())

ROOT = pivot("kepler_kit", (0, 0, 0), None, proposal="kit")
SET = os.environ.get("KEPLER_SET", "domes")

if SET == "domes":
    # A in the front row, B behind; the family size, the big family size, the old hub's size
    for i, (r, x) in enumerate(((8, -44), (14, -12), (22, 38))):
        with at(x, 0):
            dome_a(r, DOORS[i])
            figure(2.6, r + 9)
        with at(x, -62):
            dome_b(r, DOORS[i + 2])
            figure(2.6, r + 6)
else:
    with at(-40, 0):                                      # three modules chained, the commons in the middle
        for i, f in enumerate((False, True, False)):
            with at((i - 1) * 11.5, 0):
                stilt(feature=f, door_slot=DOORS[i], stairs=i != 1)
        figure(0, 8)
    with at(-6, -2, 0):
        longhouse(16, "ochre")
        figure(2, 11)
    for i, acc in enumerate(("orange", "green", "teal")):
        with at(12 + i * 8.6, 0):
            shop(acc)
    figure(14, 6)
    with at(16, 12, PI):
        stall("orange")
    with at(22, 12, PI):
        stall("green")
    with at(46, -2):
        greenhouse(18)
    with at(60, 0):
        water_tank()
    with at(72, 0):
        mast(20)
    tunnel(-6, -22, 30, -22)
    with at(52, -24):
        solar_row(3)

OBJS = flush_all(ROOT, "kk_")
print("kepler kit:", SET, tri_count(OBJS), "triangles")
