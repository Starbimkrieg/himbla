# Shared fixtures for Blender (4.2+ / 5.x), exported to src/assets/fixtures.glb: the pieces every settlement uses that were
# code-built (docs/code-vs-blender.md), ported part for part from the code that drew them.
#
# headless:   blender -b --python tools/blender/build_fixtures.py   (or MOONRUNNER_REPO=<repo> python3 ...; MOONRUNNER_EXPORT=0
#             builds without writing)
# in Blender: exec(open(r"<repo>/tools/blender/build_fixtures.py").read())
#
# three.js axes (x right, y up, +z forward), metres. Roots (each an empty at the origin, its own model; src/models.js
# fixtureModel reads them):
#
#   THE LANDING PAD KIT (src/landingPad.js padKit assembles a pad from these on any ground, as the code builder did: a round
#   deck 3 m over the highest ground, a base drum down to the lowest, one flight of stairs along +z to the ground):
#   fx_pad_deck_<R>   the deck of radius R (10.5, 12, 13, 14, 14.3, 16, 21; the game takes the nearest and scales it to the
#                     exact radius across), its origin at the middle of its top: slab, landing surface, hazard band, rings and
#                     an H, the railing all round (open 3.1 m wide at +z for the stairs), its lamps, the landing plate at the
#                     stair head and its two lamp posts, the glow ring under the lip
#   fx_pad_drum_<R>   the base drum under that deck, 1 m tall (y -1 to 0, scaled to reach the ground), its ribs
#   fx_pad_course_<R> the concrete course round the drum's foot, 1.75 m tall from y 0
#   fx_pad_door       the service door at the back, its origin on the drum's face at the ground (the door outward along -z)
#   fx_pad_tread      a stair tread, its origin at the middle of its top (2.6 m wide, 0.38 deep), its nosing stripe;
#   fx_pad_tread_end  the bottom tread, in yellow
#   fx_pad_stringer   a unit stringer (1 m along z, scaled to the flight and pitched), fx_pad_rail and fx_pad_knee unit handrails
#                     (1 m along y, laid along the rail), fx_pad_post a handrail post (0.95 m), fx_pad_panel the plate that closes
#                     the space under the flight (a unit square in y-z, sheared under the stringer), fx_pad_foot the slab at
#                     the flight's foot
#   OTHER FIXTURES:
#   fx_shelter        a stop shelter: two posts, a roof in the line's colour, a back panel (the destination sign is the game's),
#                     a bench, a lamp under the roof; its front +z toward the stop
#   fx_solar_4x6      a solar field, 4 rows of 6 panels (fx_solar_3x8: 3 of 8) on posts and footings, torque tubes, a gravel bed
#                     with a kerb, an inverter cabinet at each row's end (world.js solarField)
#
# Slots: FX_TOON / FX_GLOW in src/models.js; `mark` (toon) and `markglow` (glow) are the pad's or shelter's colour, set by the game.
# Pivots: col (a collider: wing_kit.col shapes) on the shelter and solar fields; the pad's colliders are the game's
# (landingPad.js padCols), which fit the ground.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_fixtures.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("FIXTURES_OUT") or os.path.join(REPO, "src", "assets", "fixtures.glb")
COLL = "Fixtures"
HEX = {
    # toon (src/models.js FX_TOON)
    "steel": 0x55607A, "dark": 0x3A3550, "deck": 0x5B5870, "top": 0x4A4660, "gold": 0xFFD23F, "conc": 0x8A8698,
    "light": 0xD8D4E8, "panel": 0x6A6680, "cream": 0xFFF4E0, "navy": 0x2A2540, "frame": 0xD8D4E8, "cell": 0x2B3A8F,
    "mark": 0x2EC4FF,
    # glow
    "lamp": 0xFFF6A8, "markglow": 0x2EC4FF, "green": 0x7DFF6A,
}
PFX = "fx_"
ROOT = None
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())
from mathutils import Vector, Matrix

PAD_RADII = (10.5, 12.0, 13.0, 14.0, 14.3, 16.0, 21.0)   # (src/landingPad.js PAD_DECKS)
DECK_T, RAIL_H, RAIL_IN, SKIRT_IN, STAIR_W, RUN = 0.7, 1.15, 0.35, 0.45, 2.6, 0.34   # (landingPad.js)


def begin(name, **extras):
    global ROOT, PFX
    ROOT = pivot(name, (0, 0, 0), None, **extras)
    PFX = name + "_"
    return ROOT


def end():
    made = flush_all(ROOT, PFX)
    print(f"{ROOT.name}: {tri_count(made)} tris, {len(made)} meshes")
    return made


def beam_y(a, b, r, seg=5):
    return B(a, b, r, seg, True)


# =====================================================================================================================
# The landing pad kit
# =====================================================================================================================
def pad_posts(r):
    """the railing's posts: every ~2.4 m round, leaving a gap at +z for the stairs (landingPad.js padPlan)"""
    rr = r - RAIL_IN
    gap = (STAIR_W / 2 + 0.25) / rr
    n = max(16, round(TAU * rr / 2.4))
    span = TAU - 2 * gap
    return [(math.cos(PI / 2 + gap + i / n * span) * rr, math.sin(PI / 2 + gap + i / n * span) * rr) for i in range(n + 1)]


def build_pad_deck(r):
    name = f"fx_pad_deck_{str(r).replace('.', '_')}"
    begin(name, radius=r)
    seg = max(32, round(r * 3))
    Acc.of("deck", 0.08).put(cyl(0, -DECK_T / 2, 0, r * 0.97, DECK_T, seg, rt=r))
    Acc.of("top", 0.0).put(cyl(0, 0.02, 0, r - 0.25, 0.04, seg))
    bands = round(seg / 2) * 2
    side = lambda y: r - 0.03 * r * (-y) / DECK_T + 0.006       # (the slab's side at height y, and 6 mm out)
    for i in range(bands):                       # the hazard band round the edge, a skin just proud of the slab's side
        Acc.of("dark" if i % 2 else "gold", 0.0, raw=True).put(xf(cylinder_arc(side(-0.02), side(-0.32), 0.3, 2, TAU * i / bands, TAU / bands)[:2], (0, -0.17, 0)))
    Acc.of("mark", 0.0).put(ring(r * 0.72, max(0.12, r * 0.022), 0.05, max(12, round(r * 0.72 * 5)), 4))
    Acc.of("mark", 0.0).put(ring(r * 0.56, max(0.08, r * 0.012), 0.05, max(12, round(r * 0.56 * 5)), 4))
    h, bw = r * 0.34, max(0.5, r * 0.06)
    for s in (-1, 1):
        Acc.of("light", 0.0).put(box(s * h * 0.36, 0.045, 0, bw, 0.05, h))
        Acc.of("gold", 0.0).put(xf(box(0, 0, 0, 0.35, 0.05, 1.6), (s * 0.55, 0.045, r - 2.2), (0, s * 0.6, 0)))
    Acc.of("light", 0.0).put(box(0, 0.048, 0, h * 0.72, 0.05, bw))   # (3 mm over the bars it crosses)
    # the railing: posts, top rail, knee rail, kick plate, a lamp on every third post
    P = pad_posts(r)
    for i, (x, z) in enumerate(P):
        Acc.of("steel", 0.02).put(cyl(x, RAIL_H / 2, z, 0.07, RAIL_H, 5))
        if i % 3 == 0:
            Acc.of("markglow", 0.0).put(ball(x, RAIL_H + 0.1, z, 0.15, 6, 4))
        if i + 1 < len(P):
            qx, qz = P[i + 1]
            Acc.of("gold", 0.02).put(beam_y((x, RAIL_H, z), (qx, RAIL_H, qz), 0.06, 4))
            Acc.of("steel", 0.0).put(beam_y((x, 0.55, z), (qx, 0.55, qz), 0.04, 3))
            L = math.hypot(qx - x, qz - z)
            Acc.of("gold", 0.0).put(xf(box(0, 0, 0, L, 0.12, 0.04), ((x + qx) / 2, 0.12, (z + qz) / 2), (0, -math.atan2(qz - z, qx - x), 0)))
    # the stair head: a landing plate on the deck's edge, a lamp post each side
    Acc.of("deck", 0.03).put(box(0, -0.055, r - 0.3, STAIR_W + 0.3, 0.12, 1.2))   # (5 mm over the deck's top)
    for s in (-1, 1):
        Acc.of("steel", 0.02).put(cyl(s * (STAIR_W / 2 + 0.3), 0.8, r - 0.75, 0.09, 1.6, 6))
        Acc.of("markglow", 0.0).put(ball(s * (STAIR_W / 2 + 0.3), 1.7, r - 0.75, 0.22, 8, 6))
    # the glow ring under the lip, on the drum
    Acc.of("markglow", 0.0).put(ring(r - SKIRT_IN + 0.06, 0.05, -DECK_T - 0.3, max(12, round(r * 5)), 4))
    return end()


def build_pad_drum(r):
    """the base drum (y -1 to 0, scaled to the ground) and its ribs"""
    begin(f"fx_pad_drum_{str(r).replace('.', '_')}")
    seg = max(32, round(r * 3))
    rs = r - SKIRT_IN
    Acc.of("panel", 0.06, raw=True).put(xf(cylinder(rs, rs, 1.0, seg, True)[:2], (0, -0.5, 0)))
    ribs = max(12, round(TAU * rs / 2.8))
    for i in range(ribs):
        a = (i + 0.5) / ribs * TAU
        Acc.of("dark", 0.02).put(xf(box(0, -0.5, 0, 0.32, 1.0, 0.2), (math.cos(a) * (rs + 0.08), 0, math.sin(a) * (rs + 0.08)), (0, -a, 0)))
    return end()


def build_pad_course(r):
    begin(f"fx_pad_course_{str(r).replace('.', '_')}")
    seg = max(32, round(r * 3))
    rs = r - SKIRT_IN
    Acc.of("conc", 0.04, raw=True).put(xf(cylinder(rs + 0.15, rs + 0.2, 1.75, seg, True)[:2], (0, 0.875, 0)))
    return end()


def build_pad_parts():
    begin("fx_pad_door")                                         # (on the drum's face at z 0, out along -z)
    Acc.of("gold", 0.03).put(box(0, 1.25, -0.04, 1.9, 2.5, 0.16))
    Acc.of("dark", 0.0).put(box(0, 1.125, -0.06, 1.5, 2.25, 0.2))
    Acc.of("markglow", 0.0).put(ball(0, 2.75, -0.15, 0.14, 8, 6))
    Acc.of("steel", 0.0).put(box(0, 2.6, -0.08, 0.12, 0.3, 0.16))
    end()
    for name, slot in (("fx_pad_tread", "steel"), ("fx_pad_tread_end", "gold")):
        begin(name)
        Acc.of(slot, 0.015).put(box(0, -0.04, 0, STAIR_W, 0.08, RUN + 0.04))
        Acc.of("gold", 0.0).put(box(0, 0.025, RUN / 2 - 0.06, STAIR_W - 0.2, 0.03, 0.08))
        end()
    begin("fx_pad_stringer")                                     # (a unit length along z, centred)
    Acc.of("dark", 0.03).put(box(0, 0, 0, 0.14, 0.4, 1.0))
    end()
    begin("fx_pad_rail")                                         # (a unit length along y from 0)
    Acc.of("gold", 0.02).put(cyl(0, 0.5, 0, 0.06, 1.0, 5))
    end()
    begin("fx_pad_knee")
    Acc.of("steel", 0.0).put(cyl(0, 0.5, 0, 0.04, 1.0, 5))
    end()
    begin("fx_pad_post")
    Acc.of("steel", 0.02).put(cyl(0, 0.475, 0, 0.07, 0.95, 6))
    end()
    begin("fx_pad_panel")                                        # (a unit square in y-z from the origin, 8 cm thick)
    Acc.of("panel", 0.03).put(box(0, 0.5, 0.5, 0.08, 1.0, 1.0))
    end()
    begin("fx_pad_foot")
    Acc.of("conc", 0.04).put(box(0, 0.01, 0, STAIR_W + 1.2, 0.18, 1.8))
    end()


# =====================================================================================================================
# The stop shelter (traffic.js shelter)
# =====================================================================================================================
def build_shelter():
    begin("fx_shelter")
    for sx in (-1.6, 1.6):
        Acc.of("dark", 0.03).put(box(sx, 1.4, -0.6, 0.25, 2.8, 0.25))
        for sz in (-0.75, -0.25):
            Acc.of("steel", 0.0).put(box(sx * 0.85, 0.3, sz, 0.08, 0.6, 0.08))     # (the bench's legs)
    Acc.of("mark", 0.05).put(box(0, 2.9, 0, 4.0, 0.25, 2.0))
    Acc.of("cream", 0.03).put(box(0, 0.7, -0.5, 3.0, 0.2, 0.7))
    Acc.of("navy", 0.0).put(box(0, 1.9, -0.78, 3.0, 1.2, 0.12))                     # (the back panel, against the posts)
    Acc.of("lamp", 0.0).put(ball(0, 2.5, 0.5, 0.22, 8, 6))
    Acc.of("steel", 0.0).put(cyl(0, 2.68, 0.5, 0.04, 0.2, 6))                       # (its stem, from under the roof)
    col((0, 0, -0.85), shape="box", hx=1.85, hy=1.5, hz=0.3, yaw=0.0)
    col((0, 0, -0.5), shape="box", hx=1.5, hy=0.4, hz=0.35, yaw=0.0)
    col((0, 2.77, 0), shape="box", hx=2.0, hy=0.13, hz=1.0, yaw=0.0)
    return end()


# =====================================================================================================================
# Solar fields (world.js solarField): rows of tilted panels, cells and frames, two posts each on footings, a torque tube per
# row, a gravel bed with a kerb, an inverter cabinet with its lamp at each row's end, the conduit along the row
# =====================================================================================================================
def build_solar(rows, cols):
    begin(f"fx_solar_{rows}x{cols}")
    TILT, PD, H = -0.5, 3.0, 1.35
    W, D = cols * 6, rows * 5
    Acc.of("conc", 0.04).put(box(-3, 0.06, -2.5, W + 3, 0.12, D + 2))
    for s in (-1, 1):
        Acc.of("panel", 0.02).put(box(-3, 0.15, -2.5 + s * (D / 2 + 1), W + 3.2, 0.3, 0.3))
        Acc.of("panel", 0.02).put(box(-3 + s * (W / 2 + 1.5), 0.15, -2.5, 0.3, 0.3, D + 2.2))
    for i in range(rows):
        lz = (i - rows / 2) * 5
        for j in range(cols):
            lx = (j - cols / 2) * 6
            Acc.of("cell", 0.05).put(xf(box(0, 0, 0, 5, 0.14, PD), (lx, H, lz), (TILT, 0, 0)))
            for c in (-1, 0, 1):
                Acc.of("frame", 0.0).put(xf(box(0, 0.01, 0, 0.06, 0.16, PD - 0.1), (lx + c * 1.65, H, lz), (TILT, 0, 0)))
            Acc.of("frame", 0.0).put(xf(box(0, 0.01, 0, 5.04, 0.16, 0.08), (lx, H, lz), (TILT, 0, 0)))
            for sz in (-1, 1):                                   # two posts (the back one taller) up to the panel's underside
                pz = sz * PD * 0.32
                zl = (pz + 0.07 * math.sin(TILT)) / math.cos(TILT)
                top = H - 0.07 * math.cos(TILT) - zl * math.sin(TILT) + 0.02
                Acc.of("conc", 0.02).put(box(lx, 0.125, lz + pz, 0.7, 0.25, 0.7))
                Acc.of("steel", 0.02).put(box(lx, top / 2, lz + pz, 0.16, top, 0.16))
        Acc.of("steel", 0.015).put(B((-W / 2 - 3, H - 0.07 * math.cos(TILT) - 0.07, lz), (W / 2 - 3, H - 0.07 * math.cos(TILT) - 0.07, lz), 0.08, 5, True))   # (under the panels' middles)
        Acc.of("light", 0.04).put(box(-W / 2 - 4.3, 0.7, lz, 1.1, 1.4, 0.8))
        Acc.of("green", 0.0).put(box(-W / 2 - 4.3, 1.09, lz + 0.402, 0.5, 0.18, 0.006))
        Acc.of("navy", 0.0).put(box(-3, 0.18, lz + 1.2, W - 1, 0.12, 0.25))
    col((-2.7, 0, -2.5), shape="box", hx=W / 2 + 2.2, hy=1.05, hz=D / 2 - 1, yaw=0.0)
    return end()


for r in PAD_RADII:
    build_pad_deck(r)
    build_pad_drum(r)
    build_pad_course(r)
build_pad_parts()
build_shelter()
build_solar(4, 6)
build_solar(3, 8)

_clash = [o.name for o in C.objects if o.name[-4:-3] == "." and o.name[-3:].isdigit()]
assert not _clash, f"object names must be unique, Blender renamed {_clash[:3]}"
print("built", len(C.objects), "objects")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
