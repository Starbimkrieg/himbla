# The Kepler town kit for Blender (4.2+ / 5.x), exported to src/assets/kepler.glb: the pieces the Kepler towns, your own
# town's domes, the founded outposts' and the ILMB's family domes are built from (docs/kepler-proposals: both hab domes and
# hall A were picked). The pieces themselves are kepler_kit.py's.
#
# headless:   blender -b --python tools/blender/build_kepler.py   (or MOONRUNNER_REPO=<repo> python3 ...; MOONRUNNER_EXPORT=0
#             builds without writing)
# in Blender: exec(open(r"<repo>/tools/blender/build_kepler.py").read())
#
# three.js axes (x right, y up, +z forward), metres. Roots, each an empty at the origin and its own model, its front (door)
# toward +z (src/models.js keplerModel reads them; src/settlements.js bakes them into a place):
#
#   kepler_dome_a_<r>   hab dome A, "the Shield", r 6, 10, 12, 14, 18: a low cream shell behind three regolith terraces
#   kepler_dome_b_<r>   hab dome B, "the Geode", r 6, 11, 13, 16, 22: a geodesic shell on a drum, its solar facets toward +z.
#                       Its `lock` pivot holds the airlock and the drum's portholes: the game turns it to the door's side
#                       and leaves the shell facing the sun
#   kepler_hall         Earthrise Hall and its campanile (kepler_kit.py hall); `hand` pivots are the Earth dial's hands
#   kepler_stilt        a raised module on four legs, its landing and stair on +z; kepler_stilt_plain without the stair;
#                       kepler_stilt_commons the orange commons module (stair, glazed cupola)
#   kepler_longhouse    a barrel-vault hut 16 m long, its door in the +z end
#   kepler_stall        a market stall;  kepler_bench  a bench
#   kepler_greenhouse   a glass vault over planting beds;  kepler_tank  the water tank
#   kepler_tunnel       one 4.5 m length of connecting tube along z (laid end to end, stretched to fit; its collider is the
#                       game's)
#   kepler_clear        cleared ground, a 1 m square 2 cm thick; kepler_clear_round a disc 1 m in radius (the game stretches
#                       both to the town's lanes and courts)
#   kepler_marker       a route marker post (the flag lines along the lanes)
#   kepler_solar_<n>    a row of n solar panels (3, 4, 5) tilted toward +z
#
# Slots: kepler_kit.py HEX (src/models.js KEPLER_TOON / KEPLER_GLOW). `household` is a home's door, painted per home by the
# game; `glass` is see-through. Pivots: `col` colliders (wing_kit col(); extra `lock` = 1 on those that turn with a dome's
# `lock` pivot), `lock`, `hand` (extras `rate`, `side`: kepler_kit.py earth_dial).

import bpy, math, os

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", ".."))
OUT = os.environ.get("KEPLER_OUT") or os.path.join(REPO, "src", "assets", "kepler.glb")
COLL = "Kepler"
PFX = "kepler_"
ROOT = None
exec(open(os.path.join(REPO, "tools", "blender", "kepler_kit.py"), encoding="utf-8").read(), globals())
BUILD[0] = True
DOME_A = (6, 10, 12, 14, 18)
DOME_B = (6, 11, 13, 16, 22)
MADE = []


def begin(name, **extras):
    global ROOT, PFX
    ROOT = pivot(name, (0, 0, 0), None, **extras)
    PFX = name + "_"
    return ROOT


def end():
    made = flush_all(ROOT, PFX)
    MADE.extend(made)
    print(f"{ROOT.name}: {tri_count(made)} tris, {len(made)} meshes")


for r in DOME_A:
    begin(f"kepler_dome_a_{r}", r=r)
    dome_a(r, "household")
    end()
for r in DOME_B:
    begin(f"kepler_dome_b_{r}", r=r)
    dome_b(r, "household", lock=pivot(f"kepler_dome_b_{r}_lock", (0, 0, 0), ROOT, role="lock"))
    end()
begin("kepler_hall")
hall()
end()
for name, kw in (("stilt", {}), ("stilt_plain", {"stairs": False}), ("stilt_commons", {"feature": True})):
    begin("kepler_" + name)
    stilt(door_slot="household", **kw)
    end()
for name, fn in (("longhouse", lambda: longhouse(16.0, "household")), ("stall", lambda: stall("orange")), ("bench", bench),
                 ("greenhouse", greenhouse), ("tank", water_tank), ("tunnel", tunnel_seg), ("clear", clear_tile),
                 ("clear_round", clear_disc), ("marker", route_marker), ("solar_3", lambda: solar_row(3)),
                 ("solar_4", lambda: solar_row(4)), ("solar_5", lambda: solar_row(5))):
    begin("kepler_" + name)
    fn()
    end()

_clash = [o.name for o in C.objects if o.name[-4:-3] == "." and o.name[-3:].isdigit()]
assert not _clash, f"object names must be unique, Blender renamed {_clash[:3]}"
audit_flips(MADE)
print("kepler kit:", tri_count(MADE), "triangles,", len(C.objects), "objects")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
