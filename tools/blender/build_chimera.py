# The chimera kit for Blender 4.2+ / 5.x -> src/assets/chimera.glb, read by src/chimerabuild.js (which puts every chimera in the game
# together from it: the races, the pen, followers, cards, wild mites, the Mega Mite).
#
#   MOONRUNNER_REPO=<repo> python3 tools/blender/build_chimera.py            (about 5 minutes: it remeshes every part)
#   CHIMERA_ONLY=car,mite CHIMERA_OUT=/tmp/x.glb ...                         (just some kinds, to look at while working on them)
#
# The pipeline (fusing, cuts, fitted mutations, the far LOD) is chimera_common.py; the parts are chimera_people.py (settlers, pirate,
# Vrill), chimera_mite.py, chimera_car.py, chimera_sapling.py, chimera_junkbot.py; the mutations' devices, the Triple Crown
# are chimera_devices.py.
#
# THE CONTRACT (chimerabuild.js):
#   ch_<slot>_<kind>_<look>   a part: legs, body or head of a kind, in a look (mite, car, sapling: 0 to 2; person: legs suit, trousers;
#                             body coveralls, lab, jacket, hoodie; head sealed, bowl; pirate, alien, junkbot: 0). Its extras: kind, part,
#                             look, and jrx / jrz (the joint's half-widths, which the colours bleed across).
#     legs                    stand on y = 0; socket `hip` where the body's origin goes
#     body                    origin at the hip, a skirt wrapping down over the legs; sockets `neck` (one head), `neckL` / `neckR` (two:
#                             leaning out), `spark` and `turbo` (on the surface, +y out of it: where those devices go)
#     head                    origin at the neck, a stub going down into the body; sockets `top` (the crown), `eye`, `radio` and `lens`
#   ..._far                   the part again for far away: about a third of the triangles, no outline sources
#   pivots                    role `leg` (swings), `wheel` (rolls, extra r), `arm` (swings), `socket`, `graft` (where the spark's arcs
#                             crackle: tag, size, nx/ny/nz), `form` (a body's surface with one neck, form 1, or forked for two heads, form
#                             2: the builder shows one), `extra` (pieces only some looks wear: extra looks), `mut` (a mutation fitted to the
#                             part: extra mut = armor, crystal or mud; shown only on a chimera that has it)
#   ch_mut_<mut>_<family>     a device (spark, turbo, radio, lens; families human, mite, car, sapling), built on its socket's frame: +y out of
#                             the surface, its foot sunk 3 cm in
#   ch_arc, ch_crown          the spark's arc, the Triple Crown
# Slots: see HEX in chimera_common.py (hides, tinted slots, fixed and lit ones); `inkonly` meshes are outline sources, never drawn.
import os

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", ".."))
COLL = "Chimera"
_here = os.path.join(REPO, "tools", "blender")
exec(open(os.path.join(_here, "chimera_common.py"), encoding="utf-8").read(), globals())
BUILD = {}
for _f in ("chimera_people.py", "chimera_mite.py", "chimera_car.py", "chimera_sapling.py", "chimera_junkbot.py"):
    if os.path.isfile(os.path.join(_here, _f)):
        exec(open(os.path.join(_here, _f), encoding="utf-8").read(), globals())

ONLY = [k for k in os.environ.get("CHIMERA_ONLY", "").split(",") if k]
OUT = os.environ.get("CHIMERA_OUT") or os.path.join(REPO, "src", "assets", "chimera.glb")
roots = []
for (slot, kind, look), fn in BUILD.items():
    if ONLY and kind not in ONLY:
        continue
    rng = random.Random(hash((slot, kind, look)) & 0xffff)
    root = pivot(f"ch_{slot}_{kind}_{look}", (0, 0, 0), None, kind=kind, part=slot, look=look)
    F = fn(root, rng)
    if F:
        F.apply(FAMILY[kind])
    t = part_tris(root)
    print(f"{root.name}: {t.pop(None, 0)} triangles" + "".join(f", {k} +{v}" for k, v in t.items()))
    roots.append(root)
for root in roots:
    far_copy(root)
if os.path.isfile(os.path.join(_here, "chimera_devices.py")) and not ONLY:
    exec(open(os.path.join(_here, "chimera_devices.py"), encoding="utf-8").read(), globals())
for hide in (2, 1):                                                       # (a body's two forms are never shown together; nor a part's armour and what it covers)
    audit_coplanar([o for o in C.objects if o.get("slot") != "inkonly" and not o.name.endswith("_far") and not any(q.name.endswith("_far") for q in parents(o))
                    and not any(q.get("form") == hide or q.get("mut") == "!armor" for q in parents(o))])
export(OUT, list(C.objects))
