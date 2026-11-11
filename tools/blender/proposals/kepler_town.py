# PROPOSAL: a Kepler town layout stood up in 3D from the kit's pieces (docs/kepler-proposals). The layouts are
# tools/kepler-layouts.mjs's, read from docs/kepler-proposals/layouts.json (`node tools/kepler-layouts.mjs docs` writes it).
#
#   KEPLER_LAYOUT=1|2|3|civic MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/proposals/kepler_town.py
#   (preview_kepler.py builds each and renders the review pictures)
#
# Frame: the town's (settlements.js buildTown), three.js axes, +z sunward. KEPLER_HALL=a|b picks the hall the Civic Center
# stands at its middle (default a). A concept for review: nothing here is exported.

import bpy, json, math, os

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", "..", ".."))
COLL = "KeplerTown"
exec(open(os.path.join(REPO, "tools", "blender", "proposals", "kepler_kit.py"), encoding="utf-8").read(), globals())

WHICH = os.environ.get("KEPLER_LAYOUT", "1")
DATA = json.load(open(os.path.join(REPO, "docs", "kepler-proposals", "layouts.json"), encoding="utf-8"))
LAYOUT = next(l for l in DATA["layouts"] if l["id"] == WHICH)
ROOT = pivot("kepler_town_" + WHICH, (0, 0, 0), None, proposal=WHICH)
rad = math.radians


def build_town(L):
    domes = [q for q in L["pieces"] if q["k"].startswith("dome")]
    for q in L["pieces"] + [DATA["pad"]]:
        k = q["k"]
        if k == "pave":
            paving(q["x0"], q["z0"], q["x1"], q["z1"])
        elif k == "plaza":
            plaza(q["x"], q["z"], q["r"])
        elif k == "walk":
            dx, dz = q["x2"] - q["x"], q["z2"] - q["z"]
            with at((q["x"] + q["x2"]) / 2, (q["z"] + q["z2"]) / 2, math.atan2(dx, dz)):
                paving(-q["w"] / 2, -math.hypot(dx, dz) / 2, q["w"] / 2, math.hypot(dx, dz) / 2, y=0.035)
        elif k == "lamp":
            lamp(q["x"], q["z"])
        elif k == "link":                                       # shell to shell: the tube runs in under both
            a, b = domes[q["a"]], domes[q["b"]]
            d = math.hypot(b["x"] - a["x"], b["z"] - a["z"])
            ux, uz = (b["x"] - a["x"]) / d, (b["z"] - a["z"]) / d
            tunnel(a["x"] + ux * a["r"] * 0.9, a["z"] + uz * a["r"] * 0.9, b["x"] - ux * b["r"] * 0.9, b["z"] - uz * b["r"] * 0.9)
        else:
            with at(q["x"], q["z"], rad(q.get("yaw", 0))):
                if k == "domeA":
                    dome_a(q["r"], q["door"])
                elif k == "domeB":
                    dome_b(q["r"], q["door"], sun=-rad(q.get("yaw", 0)))    # its solar facets toward the town's +z
                elif k == "stilt":
                    stilt(q["feature"], q["door"], q["stairs"])
                elif k == "longhouse":
                    longhouse(q["len"], q["door"])
                elif k == "shop":
                    shop(q["accent"])
                elif k == "stall":
                    stall(q["accent"])
                elif k == "greenhouse":
                    greenhouse(18)
                elif k == "tank":
                    water_tank()
                elif k == "mast":
                    mast(20)
                elif k == "solar":
                    solar_row(q["n"])
                elif k == "pad":
                    pad(q["r"])
                elif k == "hall":
                    f = os.path.join(REPO, "tools", "blender", "proposals", "kepler_hall_%s.py" % os.environ.get("KEPLER_HALL", "a"))
                    exec(open(f, encoding="utf-8").read(), globals())
                    (build_hall_a if "hall_a" in f else build_hall_b)()


build_town(LAYOUT)
OBJS = flush_all(ROOT, "kt_")
print("kepler town", WHICH, LAYOUT["name"], tri_count(OBJS), "triangles")
