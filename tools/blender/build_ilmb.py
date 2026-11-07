# The ILMB core for Blender (4.2+ / 5.x): the International Moon Base's central complex, its fortress wall and everything
# round them that the wings (build_hydroponics.py ... build_habitat.py) don't cover, exported to src/assets/ilmb.glb.
#
# headless:   MOONRUNNER_REPO=<repo> python3 tools/blender/build_ilmb.py      (MOONRUNNER_EXPORT=0 builds without writing)
# in Blender: exec(open(r"<repo>/tools/blender/build_ilmb.py").read())
#
# Frame: three.js axes (x right, y up, +z forward), metres, the hub's frame (origin at the base's middle, ground y = 0). Angles
# are theta in the ground plane, (x, z) = (cos theta, sin theta) * r, as the wings' (locations.js ILMB_WINGS_AT). The six
# skywalks dock into the core at r = DOCK_R on the wings' angles and run out to each wing's lobby (WING_END).
#
# Roots (each an empty at the origin, its own model; src/ilmbCore.js bakes them):
#   ilmb_core_a                the central complex, "the Crown" (proposal A of docs/ilmb-proposals, the one chosen)
#   ilmb_wall_a                the fortress wall, gates, gate towers and bastions, one continuous ring (proposal A)
#   ilmb_skywalks              the six glass skywalks
#   ... and the base's other pieces (see the end of the file)
# Pivots (empties with a `role`): col (a collider: wing_kit.col shapes), blinker (an aircraft lamp, extra radius), fan (turns
# about its y, extra spin rad/s; its meshes are its children), mount (a turret mount: y is the gun's foot; extra wall = 1).
# Each mesh has one material named after a slot (ILMB_TOON / ILMB_GLOW in src/models.js); `glass` is see-through.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_ilmb.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("ILMB_OUT") or os.path.join(REPO, "src", "assets", "ilmb.glb")
COLL = "Ilmb"
HEX = {
    # toon (src/models.js ILMB_TOON)
    "white": 0xF3EEE4, "cream": 0xFFF4E0, "light": 0xD8D4E8, "panel": 0x5B5870, "panel2": 0x4A4660, "roof": 0x3A3550,
    "dark": 0x2A2540, "metal": 0x8A87A0, "steel": 0x55607A, "alu": 0xC9CED8, "concrete": 0xB8B2CC, "pave": 0x9D97B0,
    "navy": 0x2A3A6B, "blue": 0x2EC4FF, "gold": 0xFFD23F, "hazard": 0xFFD23F, "red": 0xFF3B5C, "orange": 0xFF9F1C,
    "grass": 0x5CC94A, "leaf": 0x1F8A3A, "leaf2": 0x5CC94A, "soil": 0x4A4660, "water": 0x2EC4FF, "regolith": 0xB7B0C3,
    "door": 0x2A2540, "pink": 0xFF7AD9, "bark": 0x6B4A32, "tire": 0x1D1A29, "mint": 0x8EE6C0,
    # glow
    "window": 0xFFF6A8, "lamp": 0xFFF6A8, "pane": 0xBFEFFF, "redlamp": 0xFF2A4A, "cyan": 0x2EE6FF, "screen": 0x0D1A2A,
    "amber": 0xFF9F1C, "beacon": 0xFFD23F, "green": 0x7DFF6A, "shop": 0xC4BED6, "shopfloor": 0x6E6A82,
    # see-through
    "glass": 0x9BE7FF,
}
for _s in ("gold", "redlamp", "hazard", "dark", "lamp", "white"):   # painted on another part's face: src/models.js ilmbSlot
    HEX["paint_" + _s] = HEX[_s]
PFX = "ilmb_"
ROOT = None
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "dishkit.py"), encoding="utf-8").read(), globals())   # the comms mast's dish head
from mathutils import Vector, Matrix
from contextlib import contextmanager

# While TAG[0] is set, paint (`paint_*` slots) and the parts it is painted on (CARRIERS: slot and ink) go to meshes of their
# own (wing_kit Acc tag): small meshes, so the compressed file's grid (1/16384 of a mesh's size, optimize-glb.mjs) stays
# finer than the centimetre paint stands off a face. Everything else merges as ever.
TAG = [""]
CARRIERS = {("panel", 0.2), ("panel", 0.18), ("panel2", 0.1), ("panel2", 0.06), ("navy", 0.1), ("cream", 0.1),
            ("white", 0.1), ("roof", 0.06), ("navy", 0.06)}                      # (the drums', the buttresses', the atrium's, the legs')
_acc_of = Acc.of.__func__


def _of(cls, slot, ink=0.02, raw=False, sharp=SHARP, parent=None, tag=None):
    if tag is None:
        tag = TAG[0] if (slot.startswith("paint_") or (slot, ink) in CARRIERS) else ""
    return _acc_of(cls, slot, ink, raw, sharp, parent, tag)


Acc.of = classmethod(_of)


@contextmanager
def tagged(t):
    old, TAG[0] = TAG[0], t
    try:
        yield
    finally:
        TAG[0] = old

# ---------------- the base's layout (src/locations.js, src/world.js) ----------------
WINGS = [(0.0, 116, 24.0), (0.62, 122, 18.6), (2.2, 124, 21.6), (3.8, 120, 14.0), (4.5, 110, 12.6), (5.2, 120, 28.6)]  # angle, distance, dock
DOCK_R = 56.0                                                      # the core's lobby faces: where each skywalk starts
WING_END = [d - e + 1.2 for _, d, e in WINGS]                      # where each ends (1.2 m into the wing's lobby)
DOCK_A = [a for a, _, _ in WINGS]
MAIN_A = math.pi / 2                                               # the main entrance, toward the south gate and arrivals
WALL_R = 248.0
GATES = [0.0, math.pi / 2, math.pi, 3 * math.pi / 2]
BASTIONS = [(q + f) * (math.pi / 2) for q in range(4) for f in (1 / 3, 2 / 3)]
GATE_HALF = 0.13                                                   # the gate towers stand at gate +- this (radians)
GATE_TOWERS = [g + s * GATE_HALF for g in GATES for s in (-1, 1)]
SW_F, SW_W, SW_WALL = 0.6, 5.6, 2.0                                # skywalk floor, width, glass wall height (vault radius W / 2)


def radial(geo, th, r=0.0, y=0.0):
    """geometry built in a radial frame (+x out along theta, +z the next angle round) placed at radius r on theta"""
    return xf(xf(geo, (r, y, 0)), (0, 0, 0), (0, -th, 0))


def at_r(r, th):
    return (math.cos(th) * r, math.sin(th) * r)


def ring_sector(profile, a0, a1, step=math.radians(2)):
    """a closed (r, y) section swept from a0 to a1 (full circle if they span 2 pi). A part of a turn has its vertices on one
    grid of angles (multiples of step), and its ends on the grid's chords, so arcs over the same angles, cut anywhere, follow
    the same polyline (a line painted on a face never dips behind it)."""
    if abs(a1 - a0) >= TAU - 1e-9:
        return sector(profile, a0, a1, max(3, int(round(abs(a1 - a0) / step))))
    k0, k1 = math.floor(a0 / step + 1e-6) + 1, math.ceil(a1 / step - 1e-6) - 1
    ts = [a0] + [k * step for k in range(k0, k1 + 1) if a0 + 0.2 * step < k * step < a1 - 0.2 * step] + [a1]
    n = len(profile)

    def at(t, r, y):              # on the grid's chord through t (an end between grid angles lies on its chord, not the arc)
        k = math.floor(t / step + 1e-9)
        f = t / step - k
        c0, s0, c1, s1 = math.cos(k * step), math.sin(k * step), math.cos((k + 1) * step), math.sin((k + 1) * step)
        return ((c0 + (c1 - c0) * f) * r, y, (s0 + (s1 - s0) * f) * r)
    verts = [at(t, r, y) for t in ts for r, y in profile]
    faces = [(i * n + j, i * n + (j + 1) % n, (i + 1) * n + (j + 1) % n, (i + 1) * n + j) for i in range(len(ts) - 1) for j in range(n)]
    faces += [tuple(range(n)), tuple((len(ts) - 1) * n + j for j in range(n))]
    return verts, faces


def spans(skip, half):
    """the arcs of a full circle between the angles in skip, each cut back by half (radians) either side"""
    s = sorted(a % TAU for a in skip)
    out = []
    for i, a in enumerate(s):
        b = s[(i + 1) % len(s)] + (TAU if i + 1 == len(s) else 0)
        if b - a > 2 * half + 1e-6:
            out.append((a + half, b - half))
    return out


def col_box_r(r, th, y0, h, hr, ht, pitch=0.0):
    """a box collider at radius r on theta, hr deep (radially) and ht across, from y0 up h"""
    x, z = at_r(r, th)
    col((x, y0, z), shape="box", hx=ht, hy=h / 2, hz=hr, yaw=math.atan2(math.cos(th), math.sin(th)), pitch=pitch)


def col_ring(r0, r1, y0, y1, a0=0.0, a1=TAU, step=math.radians(8)):
    """an annulus between radii r0 and r1, y0 to y1, as boxes round it (each as wide as its outer chord)"""
    n = max(1, int(math.ceil((a1 - a0) / step)))
    da = (a1 - a0) / n
    for i in range(n):
        th = a0 + (i + 0.5) * da
        col_box_r((r0 + r1) / 2, th, y0, y1 - y0, (r1 - r0) / 2, r1 * math.sin(da / 2) + 0.15)


def mount(pos, **extras):
    NCOL[0] += 1
    return pivot(f"{PFX}mount{NCOL[0]}", pos, ROOT, role="mount", wall=1, **extras)


def blinker(pos, radius=0.4):
    NCOL[0] += 1
    return pivot(f"{PFX}blink{NCOL[0]}", pos, ROOT, role="blinker", radius=radius)


def fan(pos, spin):
    NCOL[0] += 1
    return pivot(f"{PFX}fan{NCOL[0]}", pos, ROOT, role="fan", spin=spin)


def begin(name, **extras):
    global ROOT, PFX
    ROOT = pivot(name, (0, 0, 0), None, **extras)
    PFX = name + "_"
    return ROOT


def end():
    made = flush_all(ROOT, PFX)
    print(f"{ROOT.name}: {tri_count(made)} tris, {len(made)} meshes")
    return made


def lobby_r(th, r_in, r_face, width, height, wall="cream", trim="gold", door=True):
    """a skywalk's docking lobby on the core: a block from r_in out to its face at r_face on theta, the door the skywalk
    meets (5.4 wide, 4.8 tall, floor at SW_F), jambs, a lit strip over it, a trim overhanging the face"""
    d = r_face - r_in
    Acc.of(wall, 0.08).put(radial(box(r_in + d / 2, height / 2, 0, d, height, width), th))
    Acc.of(trim, 0.05).put(radial(box(r_in + d / 2 + 0.3, height + 0.2, 0, d + 0.6, 0.4, width + 0.6), th))
    if door:
        Acc.of("door", 0.0).put(radial(box(r_face + 0.04, SW_F + 2.4, 0, 0.1, 4.8, 5.4), th))
        j = Acc.of("roof", 0.02)
        for sz in (-1, 1):
            j.put(radial(box(r_face + 0.1, (SW_F + 5.4) / 2, sz * 3.0, 0.3, SW_F + 5.4, 0.5), th))
        j.put(radial(box(r_face + 0.1, SW_F + 5.6, 0, 0.3, 0.5, 6.5), th))
        Acc.of("lamp", 0.0).put(radial(box(r_face + 0.03, SW_F + 5.1, 0, 0.06, 0.25, 4.6), th))  # (on the face, over the door)
    x, z = at_r(r_in + d / 2, th)
    col((x, 0, z), shape="box", hx=width / 2 + 0.1, hy=height / 2 + 0.2, hz=d / 2 + 0.1, yaw=math.atan2(math.cos(th), math.sin(th)))


def glass_dome(r, y0, ribs, rib_slot="white", rings=(0.35, 0.7, 1.05), seg=32):
    """a glass dome of radius r on y0: the glass shell, `ribs` meridian ribs, latitude rings, a crown ring"""
    Acc.of("glass", 0.0).put(xf(sphere(r, seg, 10, math.pi / 2)[:2], (0, y0, 0)))
    rib = Acc.of(rib_slot, 0.03)
    crown = math.acos(0.2)
    for i in range(ribs):
        th = TAU * i / ribs
        pts = [(math.cos(th) * (r + 0.15) * math.cos(e), y0 + (r + 0.15) * math.sin(e), math.sin(th) * (r + 0.15) * math.cos(e)) for e in [crown * k / 10 for k in range(11)]]
        rib.put(path_tube(pts, 0.32, 5))
    for e in rings:
        rib.put(ring((r + 0.15) * math.cos(e), 0.26, y0 + (r + 0.15) * math.sin(e), 48, 5))
    rib.put(ring((r + 0.2) * math.cos(crown), 0.5, y0 + (r + 0.2) * math.sin(crown), 32, 6))
    Acc.of("glass", 0.0).put(xf(cylinder(r * math.cos(crown) + 0.1, r * math.cos(crown) + 0.1, 0.4, 24)[:2], (0, y0 + r * math.sin(crown) + 0.4, 0)))


def tree_r(x, z, h=1.0, kind="ball"):
    tree(Acc.of("bark", 0.03), Acc.of("leaf" if kind == "ball" else "leaf2", 0.04), x, z, 0.3, h, kind)  # (indoors, under glass: wood is fine)


# =====================================================================================================================
# The skywalks (both proposals): a glass tube on a slab from the core's lobby to each wing's. Section: straight glass walls
# 2 m high on the slab, a half-round vault over them (radius 2.8, top 5.4 m up). Frames every ~5 m: a ring of white steel
# round the section, each with a lamp; gold portal frames at the ends; a spine and two eave rails between the frames; a lit
# runner down the floor. Walkers are the game's (world.js skywalk).
# =====================================================================================================================
def build_skywalks():
    begin("ilmb_skywalks")
    R = SW_W / 2
    top = SW_F + SW_WALL + R
    for i, th in enumerate(DOCK_A):
        r0, r1 = DOCK_R, WING_END[i]
        ln = r1 - r0
        put = lambda acc, g: acc.put(radial(g, th, r0))
        put(Acc.of("roof", 0.08), box(ln / 2, SW_F / 2, 0, ln, SW_F, SW_W + 0.8))
        put(Acc.of("light", 0.0), box(ln / 2, SW_F + 0.02, 0, ln, 0.04, SW_W - 0.8))
        put(Acc.of("cyan", 0.0), box(ln / 2, SW_F + 0.05, 0, ln, 0.06, 0.28))
        for sz in (-1, 1):  # kerbs and the glass walls
            put(Acc.of("panel", 0.02), box(ln / 2, SW_F + 0.15, sz * (R - 0.1), ln, 0.3, 0.2))
            put(Acc.of("glass", 0.0), box(ln / 2, SW_F + 0.3 + (SW_WALL - 0.3) / 2, sz * R, ln, SW_WALL - 0.3, 0.04))
        put(Acc.of("glass", 0.0), xf(cylinder_arc(R, R, ln, 18, -math.pi / 2, math.pi)[:2], (ln / 2, SW_F + SW_WALL, 0), (0, 0, math.pi / 2)))
        # frames: the end ones gold portals, the rest white rings with a lamp at the crown
        n = max(2, round((ln - 2) / 5))
        xs = [0.6 + (ln - 1.2) * k / n for k in range(n + 1)]
        for k, x in enumerate(xs):
            endf = k in (0, n)
            slot, t = ("gold", 0.32) if endf else ("white", 0.16)
            arc = [(x, SW_F + SW_WALL + math.sin(a) * (R + t * 0.5), math.cos(a) * (R + t * 0.5)) for a in [math.pi * j / 12 for j in range(13)]]
            arc = [(x, SW_F, R + t * 0.5)] + arc + [(x, SW_F, -(R + t * 0.5))]
            put(Acc.of(slot, 0.04), path_tube(arc, t, 5))
            if not endf:
                put(Acc.of("lamp", 0.0), ball(x, top - 0.2, 0, 0.18, 6, 4))  # (hung in the frame at the crown)
        for sz, yy in ((0, top + 0.12), (-1, SW_F + SW_WALL), (1, SW_F + SW_WALL)):  # spine, eave rails (frame to frame)
            put(Acc.of("white", 0.03), box(ln / 2, yy, sz * (R + 0.12), ln - 1.2, 0.22, 0.22))
        # colliders: the walls to their tops, the vault round
        x, z = at_r(r0 + ln / 2, th)
        yaw = math.atan2(math.cos(th), math.sin(th))
        col((x, 0, z), shape="box", hx=R + 0.4, hy=(SW_F + SW_WALL) / 2, hz=ln / 2, yaw=yaw)
        col((x, SW_F + SW_WALL, z), shape="hcyl", r=R + 0.3, len=ln, yaw=yaw)
    return end()


# =====================================================================================================================
# CORE A: "the Crown". A ring concourse 100 m across, its glazed band running all the way round, around a garden courtyard
# under a glass dome; six docking lobbies and the glazed main atrium on its outer face; and over the dome, standing on the
# ring's roof on three canted legs, the command saucer with the base's spire. Low and wide, one strong silhouette.
# =====================================================================================================================
def build_core_a():
    begin("ilmb_core_a", draft="a")
    RI, RO, H = 31.0, 50.5, 12.2                 # the ring: inner and outer faces, roof
    full = (0.0, TAU)
    # the ring's body in bands, outside: plinth, base wall, the glazed band, the upper band with a gold string course, the roof,
    # a parapet. Behind each glazed band (outside and toward the courtyard) a lit gallery 2 m deep: a pale back wall, a
    # mezzanine slab with its white edge, and warm cove lights under the slab and the ceiling, so the band reads as lit floors
    # rather than a dark backing
    Acc.of("panel2", 0.1).put(ring_sector([(RO - 1.0, 0), (RO + 0.8, 0), (RO + 0.8, 1.2), (RO - 1.0, 1.2)], *full))
    Acc.of("cream", 0.12).put(ring_sector([(RI, 0), (RO, 0), (RO, 3.6), (RI, 3.6)], *full))
    GD = 2.2                                     # the galleries' depth behind the glass
    Acc.of("light", 0.0).put(ring_sector([(RI + GD, 3.6), (RO - GD, 3.6), (RO - GD, 9.6), (RI + GD, 9.6)], *full))
    for r0, r1 in ((RO - GD, RO - 0.4), (RI + 0.4, RI + GD)):
        Acc.of("white", 0.03).put(ring_sector([(r0, 6.4), (r1, 6.4), (r1, 6.9), (r0, 6.9)], *full))
        c = (r0 + r1) / 2
        for y in (6.37, 9.57):                   # (cove lights on the slab's and the ceiling's undersides)
            Acc.of("lamp", 0.0).put(ring_sector([(c - 0.25, y), (c + 0.25, y), (c + 0.25, y + 0.03), (c - 0.25, y + 0.03)], *full))
    Acc.of("glass", 0.0).put(ring_sector([(RO - 0.3, 3.6), (RO - 0.25, 3.6), (RO - 0.25, 9.6), (RO - 0.3, 9.6)], *full))
    Acc.of("glass", 0.0).put(ring_sector([(RI + 0.25, 3.6), (RI + 0.3, 3.6), (RI + 0.3, 9.6), (RI + 0.25, 9.6)], *full))
    Acc.of("cream", 0.12).put(ring_sector([(RI, 9.6), (RO + 0.2, 9.6), (RO + 0.2, H), (RI, H)], *full))
    Acc.of("gold", 0.0).put(ring_sector([(RO + 0.2, 10.6), (RO + 0.3, 10.6), (RO + 0.3, 11.2), (RO + 0.2, 11.2)], *full))
    Acc.of("roof", 0.04).put(ring_sector([(RI, H), (RO + 0.2, H), (RO + 0.2, H + 0.15), (RI, H + 0.15)], *full))
    Acc.of("white", 0.04).put(ring_sector([(RO - 0.4, H + 0.15), (RO + 0.2, H + 0.15), (RO + 0.2, H + 1.2), (RO - 0.4, H + 1.2)], *full))
    Acc.of("white", 0.04).put(ring_sector([(RI, H + 0.15), (RI + 0.5, H + 0.15), (RI + 0.5, H + 1.0), (RI, H + 1.0)], *full))
    # the glazing's bars, set in the glass (flush with the bands above and below, nothing standing proud to cast a shadow):
    # outside every 4 degrees and inside every 6, clear of the lobbies and the atrium
    busy = DOCK_A + [MAIN_A]
    bar = Acc.of("white", 0.0)
    for k in range(90):
        th = TAU * k / 90
        if any(abs(math.atan2(math.sin(th - a), math.cos(th - a))) < (0.16 if a != MAIN_A else 0.27) for a in busy):
            continue
        bar.put(radial(box(RO - 0.24, 6.6, 0, 0.16, 6.0, 0.3), th))
    for k in range(60):
        bar.put(radial(box(RI + 0.24, 6.6, 0, 0.16, 6.0, 0.25), TAU * k / 60))
    # the six docking lobbies
    for th in DOCK_A:
        lobby_r(th, RO - 1.0, DOCK_R, 10.0, 8.4)
    # the main atrium toward the arrival plaza: a glazed hall run back into the ring (its sides meet the ring's curved face
    # across their full width), out to r 61 under a canopy cantilevered to 67.5. Each side is one flush face from the ground
    # to the canopy's top: a cream wall, the canopy's end in the same plane above it. Inside: a pale back wall, a mezzanine.
    th = MAIN_A
    TAG[0] = "atrium"                            # (its own meshes: wing_kit Acc tag)
    A0, A1, AF, AW, AH, CT = 47.6, 61.0, 67.5, 12.4, 13.1, 14.1   # back (in the ring), glass front, canopy front, half width, eaves, top
    Acc.of("glass", 0.0).put(radial(box((A0 + A1) / 2, AH / 2, 0, A1 - A0, AH, 2 * AW - 0.8), th))
    Acc.of("light", 0.0).put(radial(box((A0 + 55.0) / 2, AH / 2, 0, 55.0 - A0, AH - 0.02, 2 * AW - 0.84), th))
    Acc.of("white", 0.03).put(radial(box(57.6, 6.65, 0, 5.2, 0.5, 2 * AW - 0.84), th))
    Acc.of("lamp", 0.0).put(radial(box(58.0, 6.385, 0, 0.5, 0.03, 2 * AW - 1.2), th))
    for sz in (-1, 1):
        Acc.of("cream", 0.1).put(radial(box((A0 + A1) / 2, AH / 2, sz * (AW - 0.2), A1 - A0, AH, 0.4), th))
    Acc.of("cream", 0.1).put(radial(box((A0 + AF) / 2, (AH + CT) / 2, 0, AF - A0, CT - AH, 2 * AW), th))
    for sz in (-1, 1):                           # (a gold line painted round the canopy's edge, 8 mm proud)
        Acc.of("paint_gold", 0.0).put(radial(box((A0 + AF) / 2 + 0.008, 13.55, sz * (AW + 0.004), AF - A0 + 0.016, 0.3, 0.008), th))
    Acc.of("paint_gold", 0.0).put(radial(box(AF + 0.004, 13.55, 0, 0.008, 0.3, 2 * AW + 0.016), th))
    gf = Acc.of("navy", 0.03)
    for zz in [-(AW - 0.4) + (2 * AW - 0.8) * k / 10 for k in range(1, 10)]:
        gf.put(radial(box(A1, AH / 2, zz, 0.3, AH, 0.25), th))
    for yy in (1.2, 5.0, 9.0):
        gf.put(radial(box(A1, yy, 0, 0.3, 0.25, 2 * AW - 0.8), th))
    for zz in (-5.5, 0, 5.5):
        Acc.of("door", 0.0).put(radial(box(A1 + 0.06, 2.8, zz, 0.1, 3.4, 3.6), th))
        Acc.of("lamp", 0.0).put(radial(box(A1 + 0.12, 4.75, zz, 0.06, 0.2, 3.4), th))
    Acc.of("lamp", 0.0).put(radial(box((A1 + AF) / 2, AH - 0.03, 0, AF - A1 - 1.0, 0.06, 0.4), th))   # (under the canopy)
    x, z = at_r((A0 + A1) / 2, th)
    col((x, 0, z), shape="box", hx=AW, hy=AH / 2, hz=(A1 - A0) / 2, yaw=math.atan2(math.cos(th), math.sin(th)))
    x, z = at_r((A0 + AF) / 2, th)
    col((x, AH, z), shape="box", hx=AW, hy=(CT - AH) / 2, hz=(AF - A0) / 2, yaw=math.atan2(math.cos(th), math.sin(th)))
    TAG[0] = ""
    # the courtyard: a garden under the glass dome, paths, a pool, trees
    Acc.of("grass", 0.0).put(xf(cylinder(RI - 0.1, RI - 0.1, 0.3, 48)[:2], (0, 0.15, 0)))
    for k in range(3):
        a = TAU * k / 3 + 0.4
        Acc.of("pave", 0.0).put(radial(box(15, 0.32, 0, 30, 0.04, 3.0), a))
    Acc.of("concrete", 0.02).put(xf(cylinder(7.5, 7.5, 0.5, 32)[:2], (0, 0.25, 0)))
    Acc.of("water", 0.0).put(xf(cylinder(6.8, 6.8, 0.06, 32)[:2], (0, 0.52, 0)))
    for k in range(9):
        a = TAU * k / 9 + 0.15
        x, z = at_r(12 + (k % 3) * 5, a)
        tree_r(x, z, 1.3 + 0.2 * (k % 2), "ball" if k % 3 else "cone")
    glass_dome(RI, H, 18, rings=(0.32, 0.66, 1.0))
    # the command tower: three canted octagonal legs from footings on the ring roof to a collar under the saucer. Each leg is
    # cut level where it meets its footing, and the footing is the leg's own section there, a little larger, so the leg
    # stands flush in it; the gold bands are octagonal sleeves on the leg's own faces, a few millimetres proud
    LEG_A = [MAIN_A + 0.55 + TAU * k / 3 for k in range(3)]
    foot_r, top_r, top_y, pad_y = 41.0, 5.0, 60.0, H + 1.4
    for li, a in enumerate(LEG_A):
        TAG[0] = f"leg{li}"
        fx, fz = at_r(foot_r, a)
        tx, tz = at_r(top_r, a)
        A, Bv = Vector((fx, pad_y, fz)), Vector((tx, top_y, tz))
        Acc.of("white", 0.1).put(oct_strut(A, Bv, 1.7, 1.0, cut_y=pad_y - 0.1))   # (its foot 10 cm into the footing)
        Acc.of("roof", 0.06).put(oct_footing(A, Bv, 1.7, pad_y, pad_y, H + 0.15, 1.3))
        Acc.of("paint_gold", 0.0).put(oct_footing(A, Bv, 1.7, pad_y, pad_y - 0.25, pad_y - 0.45, 1.3, grow=0.01))  # (painted on)
        for t in (0.25, 0.5, 0.75):
            Acc.of("paint_gold", 0.0).put(oct_band(A, Bv, 1.7, 1.0, t, 0.5, 0.01))
        dx, dy, dz = tx - fx, top_y - pad_y, tz - fz
        ln = math.sqrt(dx * dx + dy * dy + dz * dz)
        mx, mz = (fx + tx) / 2, (fz + tz) / 2
        col((mx, (pad_y + top_y) / 2 - ln / 2, mz), shape="box", hx=1.6, hy=ln / 2, hz=1.6, yaw=math.atan2(-math.cos(a), -math.sin(a)), pitch=math.atan2(math.hypot(dx, dz), dy))
        col((fx, H, fz), shape="cyl", r=3.2, h=pad_y - H)
    TAG[0] = ""
    # the saucer: a lathe from the collar out to its rim, a glazed band, a stepped roof; the spire, the radar, the beacon
    sau = [(0.0, top_y - 1.0), (5.5, top_y - 1.0), (16.0, top_y + 3.6), (16.8, top_y + 4.4), (16.8, top_y + 4.9), (16.0, top_y + 5.0)]
    Acc.of("white", 0.14).put(lathe(sau + [(0.0, top_y + 5.0)], 40))
    Acc.of("gold", 0.0).put(xf(cylinder(16.9, 16.9, 0.35, 40)[:2], (0, top_y + 4.3, 0)))
    Acc.of("glass", 0.0).put(xf(cylinder(15.6, 16.0, 2.6, 40, open_ended=True)[:2], (0, top_y + 6.3, 0)))
    Acc.of("roof", 0.0).put(xf(cylinder(15.2, 15.6, 2.4, 40)[:2], (0, top_y + 6.2, 0)))
    Acc.of("window", 0.0).put(xf(cylinder(15.3, 15.7, 0.5, 40)[:2], (0, top_y + 6.4, 0)))
    for k in range(20):
        th = TAU * k / 20
        Acc.of("navy", 0.02).put(radial(box(15.8, top_y + 6.3, 0, 0.4, 2.6, 0.3), th))
    roof = [(16.2, top_y + 7.6), (17.0, top_y + 8.0), (11.0, top_y + 10.4), (4.0, top_y + 11.4), (0.0, top_y + 11.6)]
    Acc.of("navy", 0.12).put(lathe([(0.0, top_y + 7.6)] + roof, 40))
    Acc.of("gold", 0.0).put(ring(17.0, 0.18, top_y + 8.0, 64, 4))
    Acc.of("white", 0.06).put(tube([(0, top_y + 11.4, 0), (0, top_y + 40.0, 0)], [1.3, 0.35], 8, True))
    for y, rr in ((top_y + 18, 1.05), (top_y + 26, 0.8), (top_y + 33, 0.6)):
        Acc.of("gold", 0.0).put(ring(rr + 0.1, 0.18, y, 16, 4))
    blinker((0, top_y + 40.6, 0), 0.9)
    for k in range(3):
        th = TAU * k / 3 + 0.3
        x, z = at_r(15.0, th)
        Acc.of("dark", 0.02).put(cyl(x, top_y + 9.9, z, 0.15, 2.2, 6))  # (on the roof's slope at r 15)
        blinker((x, top_y + 11.2, z), 0.35)
    col((0, top_y - 1.0, 0), shape="cyl", r=16.9, h=9.0)
    col((0, top_y + 8.0, 0), shape="cyl", r=11.0, h=3.6)
    col((0, top_y + 11.6, 0), shape="cyl", r=1.3, h=29.0)
    # rooftop plant on the ring between the legs: air handlers, a dish, antennae
    for k, a in enumerate([MAIN_A + 0.55 + TAU / 6 + TAU * j / 3 for j in range(3)]):
        x, z = at_r(44.0, a)
        Acc.of("light", 0.04).put(radial(box(44.0, H + 1.1, 0, 4.0, 2.2, 6.0), a))
        Acc.of("dark", 0.0).put(radial(box(44.0, H + 2.25, 0, 3.0, 0.1, 5.0), a))
        col_box_r(44.0, a, H, 2.2, 2.0, 3.0)
    # colliders: the ring to its parapet, the dome stepped
    col_ring(RI, RO + 0.3, 0.0, H + 1.2)
    for y0, y1 in ((H, H + 10), (H + 10, H + 18), (H + 18, H + 24), (H + 24, H + RI)):
        rr = math.sqrt(max(0.0, RI * RI - (y0 - H) ** 2))
        col((0, y0, 0), shape="cyl", r=rr, h=y1 - y0)
    return end()


def oct_frame(A, Bv, n=8):
    """the eight corner directions round the member from A to B (one corner kept on the member's upper side, so every
    piece on it shares its faces)"""
    d = (Bv - A).normalized()
    u = (Vector((0, 1, 0)) - d * d.y).normalized()
    v = d.cross(u)
    return d, [u * math.cos(TAU * (i + 0.5) / n) + v * math.sin(TAU * (i + 0.5) / n) for i in range(n)]


def oct_prism(lo, hi):
    """faces for two rings of corners (lo, hi), capped"""
    n = len(lo)
    verts = [tuple(p) for p in lo] + [tuple(p) for p in hi]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces += [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    return verts, faces


def oct_strut(A, Bv, ra, rb, cut_y=None):
    """a tapered octagonal member from A (radius ra) to B (rb); with cut_y its foot is cut level at that height"""
    d, cs = oct_frame(A, Bv)
    lo = []
    for c in cs:
        p = A + c * ra
        if cut_y is not None:
            p = p + d * ((cut_y - p.y) / d.y)
        lo.append(p)
    return oct_prism(lo, [Bv + c * rb for c in cs])


def oct_footing(A, Bv, ra, y_sec, y_top, y_bot, scale, grow=0.0):
    """the member's level section at y_sec, scaled about its axis by `scale` (plus grow), as a block from y_bot to y_top"""
    d, cs = oct_frame(A, Bv)
    ctr = A + d * ((y_sec - A.y) / d.y)
    top = []
    for c in cs:
        p = A + c * ra
        p = p + d * ((y_sec - p.y) / d.y)
        q = ctr + (p - ctr) * scale
        q = q + (q - ctr).normalized() * grow
        top.append(Vector((q.x, y_top, q.z)))
    return oct_prism([Vector((p.x, y_bot, p.z)) for p in top], top)


def oct_band(A, Bv, ra, rb, t, w, proud):
    """a sleeve round the member at t along it, w long, its faces `proud` off the member's"""
    d, cs = oct_frame(A, Bv)
    L = (Bv - A).length
    rings = []
    for tt in (t - w / 2 / L, t + w / 2 / L):
        c0 = A + (Bv - A) * tt
        r = ra + (rb - ra) * tt
        rings.append([c0 + c * (r + proud / math.cos(math.pi / 8)) for c in cs])
    return oct_prism(*rings)


DRUM_SEG = 48                                    # the drums' facets (the painted bands are shells on the same facets)
TRIM_Y = (6.3, 6.7)                              # the inside lit band's height, which the drums' red bands continue
SKIRT_Y = (1.3, 1.55)                            # the gold line round the plinths, wrapping the buttresses


def drum_band(slot, c, r_at, y0, y1, off=0.008, ink=0.0):
    """a band from y0 to y1 painted round a drum centred on c (x, z) whose face is r_at(y) (its vertex radius, DRUM_SEG
    facets from +z like kit.cylinder): an open shell on the same facets, following the face's batter, off proud of it"""
    Acc.of(slot, ink).put(xf(cylinder(r_at(y1) + off, r_at(y0) + off, y1 - y0, DRUM_SEG, open_ended=True)[:2],
                             (c[0], (y0 + y1) / 2, c[1])))


def in_wall(x, y, z, pad=0.1):
    """inside the Rampart's solid (its battered body, to the walk) at that point: where paint on a drum can't be seen"""
    r = math.hypot(x, z)
    return y < 10.0 - pad and WALL_R - 3.0 + pad < r < WALL_R + 2.6 - 0.12 * y - pad


def facet_r(r, t, off):
    """the radius at angle t (as (cos t, sin t)) of a DRUM_SEG-faceted drum of vertex radius r, plus off"""
    step = TAU / DRUM_SEG
    u = (math.pi / 2 - t) % step - step / 2              # (kit.cylinder's vertices are at pi/2 - k step)
    return (r * math.cos(step / 2) + off) / math.cos(u)


def hazard_band(c, r_at, y0, y1, w=0.4, off=0.012):
    """warning stripes (yellow and dark, slanting at 45 degrees) painted round a drum, as drum_band: one quad each, those
    buried in the wall left out"""
    rm = r_at((y0 + y1) / 2)
    n = 2 * max(4, round(TAU * rm / (2 * w)))
    da, ds = TAU / n, (y1 - y0) / rm
    for i in range(n):
        a = i * da
        q = [Vector((c[0] + math.cos(t) * facet_r(r_at(y), t, off), y, c[1] + math.sin(t) * facet_r(r_at(y), t, off)))
             for t, y in ((a, y0), (a + da, y0), (a + da + ds, y1), (a + ds, y1))]
        m = sum(q, Vector()) / 4
        if in_wall(m.x, m.y, m.z):
            continue
        out = Vector((m.x - c[0], 0, m.z - c[1]))
        if (q[1] - q[0]).cross(q[3] - q[0]).dot(out) < 0:      # (counter-clockwise seen from outside)
            q.reverse()
        Acc.of("paint_hazard" if i % 2 == 0 else "paint_dark", 0.0, raw=True).put(([tuple(v) for v in q], [(0, 1, 2, 3)]))


SEAT_R, COLLAR = 3.75, 0.25                      # the turret seat atop each tower: a collar just wider than the gun's foot


COPING = (11.8, 12.2)                            # the wall's gold coping: the towers carry it round as a flush band


def tower(c, foot, top, wall_r, wall_y):
    """a drum tower as one lathe (DRUM_SEG facets, as kit.cylinder): battered from radius `foot` at the ground to wall_r at
    wall_y, then a straight taper (a crisp edge at the drum's top) in to the seat at SEAT_R, its navy collar on top up to
    `top`, where the turret stands. Returns the taper's height at a radius, for fittings on it."""
    y1 = top - COLLAR
    Acc.of("panel", 0.18).put(xf(lathe([(0.0, 0.0), (foot, 0.0), (wall_r, wall_y), (SEAT_R, y1), (0.0, y1)], DRUM_SEG), (c[0], 0, c[1])))
    Acc.of("navy", 0.06).put(xf(cylinder(SEAT_R, SEAT_R, COLLAR, DRUM_SEG)[:2], (c[0], y1 + COLLAR / 2, c[1])))
    drum_band("paint_redlamp", c, lambda y: SEAT_R, y1 + 0.05, top - 0.04)          # (the collar's red lit band)
    r_at = lambda y: SEAT_R + (wall_r - SEAT_R) * (y1 - y) / (y1 - wall_y)
    # colliders: the drum to the taper, the taper in three steps (each as wide as its middle), the collar
    col((c[0], -2.0, c[1]), shape="cyl", r=foot + 0.1, h=wall_y + 2.0)
    for k in range(3):
        ya, yb = wall_y + (y1 - wall_y) * k / 3, wall_y + (y1 - wall_y) * (k + 1) / 3
        col((c[0], ya, c[1]), shape="cyl", r=r_at((ya + yb) / 2), h=yb - ya)
    col((c[0], y1, c[1]), shape="cyl", r=SEAT_R, h=COLLAR)
    return lambda r: y1 - (y1 - wall_y) * (r - SEAT_R) / (wall_r - SEAT_R)


def cut_spans(a0, a1, holes, half):
    """the arc a0..a1 without (h - half, h + half) round each angle in holes (and its turns)"""
    out = [(a0, a1)]
    for h in holes:
        for c in (h - TAU, h, h + TAU):
            nxt = []
            for p0, p1 in out:
                if c + half <= p0 or c - half >= p1:
                    nxt.append((p0, p1))
                    continue
                if c - half > p0:
                    nxt.append((p0, c - half))
                if c + half < p1:
                    nxt.append((c + half, p1))
            out = nxt
    return out


def clear(a0, a1, *cuts):
    """the arc a0..a1 without each (angles, half) cut's arcs"""
    out = [(a0, a1)]
    for holes, half in cuts:
        out = [q for p0, p1 in out for q in cut_spans(p0, p1, holes, half)]
    return out


def chunks(a0, a1, most=math.radians(20)):
    """a0..a1 in equal pieces of at most `most`"""
    n = max(1, math.ceil((a1 - a0) / most - 1e-9))
    return [(a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n) for i in range(n)]


# =====================================================================================================================
# WALL A: "the Rampart". One wall all the way round, its outer face battered, on a plinth, with buttress fins and red lamps
# outside, a lit band inside, a parapet with a gold coping and a walk behind it. At each of the eight bastions the wall
# swells into a drum; at each of the four gates it rises into two drum towers with a lit bridge between. Each tower's top
# tapers straight in to a seat fitted to the turret's foot (the wall's gold coping carried round each drum as a flush
# band), its gun mount at the seat's middle (two per gate, one per bastion, as the game's were).
# =====================================================================================================================
def build_wall_a():
    begin("ilmb_wall_a", draft="a")
    R = WALL_R
    gaps = spans(GATES, GATE_HALF)
    pr = lambda y: R + 4.2 - 0.2 * y / 1.8      # the plinth's sloped outer face
    P = 0.015                                    # how far the long painted lines stand off their faces (ilmb.glb is
    #                                              compressed at 16 bits: a 7.6 mm grid over the wall: optimize-glb.mjs)
    wall = [(R - 3.0, 0), (R + 2.6, 0), (R + 1.4, 10.0), (R - 3.0, 10.0)]
    plinth = [(R + 1.6, 0), (R + 4.2, 0), (R + 4.0, 1.8), (R + 1.9, 1.8)]
    for a0, a1 in gaps:
        Acc.of("panel", 0.2, tag="").put(ring_sector(wall, a0, a1))
        Acc.of("panel2", 0.1, tag="").put(ring_sector(plinth, a0, a1))
        Acc.of("pave", 0.0).put(ring_sector([(R - 2.9, 10.0), (R + 0.6, 10.0), (R + 0.6, 10.12), (R - 2.9, 10.12)], a0, a1))
        # the parapet and its coping run into a bastion's drum (the coping meeting the gold band it carries round) and stop
        # inside it
        for b0, b1 in cut_spans(a0, a1, BASTIONS, 0.026):
            Acc.of("panel", 0.08).put(ring_sector([(R + 0.6, 10.0), (R + 1.6, 10.0), (R + 1.6, 11.8), (R + 0.9, 11.8)], b0, b1))
            Acc.of("gold", 0.06).put(ring_sector([(R + 0.75, 11.8), (R + 1.75, 11.8), (R + 1.75, 12.2), (R + 0.75, 12.2)], b0, b1))
        Acc.of("panel2", 0.04).put(ring_sector([(R - 3.0, 10.0), (R - 2.5, 10.0), (R - 2.5, 11.0), (R - 3.0, 11.0)], a0, a1))
        # the lit band painted along the inner face and the gold line round the plinth's sloped face, on the same chords as
        # their faces (ring_sector's grid), each stopping where it meets a drum's face (the drums carry their own)
        for d0, d1 in clear(a0, a1, (BASTIONS, 0.016), (GATE_TOWERS, 0.027)):
            Acc.of("paint_lamp", 0.0).put(ring_sector([(R - 3.0 - P, TRIM_Y[0]), (R - 2.97, TRIM_Y[0]), (R - 2.97, TRIM_Y[1]), (R - 3.0 - P, TRIM_Y[1])], d0, d1))
        for d0, d1 in clear(a0, a1, (BASTIONS, 0.032), (GATE_TOWERS, 0.027)):
            Acc.of("paint_gold", 0.0).put(ring_sector([(pr(SKIRT_Y[0]) - 0.03, SKIRT_Y[0]), (pr(SKIRT_Y[0]) + P, SKIRT_Y[0]),
                                                       (pr(SKIRT_Y[1]) + P, SKIRT_Y[1]), (pr(SKIRT_Y[1]) - 0.03, SKIRT_Y[1])], d0, d1))
        pieces = chunks(a0, a1)
        # buttress fins every 4 degrees (not in the drums), a red lamp on every third; each stretch of up to 20 degrees of
        # them, with the gold sleeves painted round them, in meshes of their own (TAG)
        n = int((a1 - a0) / math.radians(4))
        for k in range(1, n):
            th = a0 + (a1 - a0) * k / n
            if any(abs(math.atan2(math.sin(th - b), math.cos(th - b))) < 0.05 for b in BASTIONS):
                continue
            TAG[0] = f"w{gaps.index((a0, a1))}_{min(len(pieces) - 1, int((th - a0) / (pieces[0][1] - pieces[0][0])))}"
            Acc.of("panel2", 0.06).put(radial(frustum([(-0.1, -0.7), (3.4, -0.7), (3.4, 0.7), (-0.1, 0.7)], [(-0.1, -0.5), (0.4, -0.5), (0.4, 0.5), (-0.1, 0.5)], 0.0, 9.0), th, R + 1.4))
            # the plinth's gold line wrapped round the buttress: a sleeve of its own section, 1 cm proud on the sides and front
            sec = lambda y, g: [(-0.1, -(0.7 - 0.2 * y / 9.0) - g), (3.4 - 3.0 * y / 9.0 + g, -(0.7 - 0.2 * y / 9.0) - g),
                                (3.4 - 3.0 * y / 9.0 + g, 0.7 - 0.2 * y / 9.0 + g), (-0.1, 0.7 - 0.2 * y / 9.0 + g)]
            Acc.of("paint_gold", 0.0).put(radial(frustum(sec(SKIRT_Y[0], 0.01), sec(SKIRT_Y[1], 0.01), *SKIRT_Y), th, R + 1.4))
            if k % 3 == 0:
                Acc.of("redlamp", 0.0).put(radial(box(R + 2.6 - 1.2 * 0.76 + 0.05, 7.6, 1.2, 0.12, 0.3, 0.6), th))  # (on the battered face)
        TAG[0] = ""
        # colliders: the wall to its coping in boxes of 3 degrees
        col_ring(R - 3.0, R + 2.6, 0.0, 12.2, a0, a1, math.radians(3))
    # the bastions: drums swelling out of the wall, a gun deck on top, a beacon mast on the inner side
    for bi, b in enumerate(BASTIONS):
        TAG[0] = f"b{bi}"                       # (each drum its own meshes, as the wall's pieces)
        cx, cz = at_r(R + 3.0, b)
        # the drum, its top tapering from the wall's height to the turret's seat (13.6 m), centred on the drum
        dr = lambda y: 7.6 - 0.6 * y / 11.0
        y_on = tower((cx, cz), 7.6, 14.4, dr(COPING[1]), COPING[1])
        Acc.of("panel2", 0.1).put(xf(cylinder(8.2, 8.4, 1.8, DRUM_SEG)[:2], (cx, 0.9, cz)))
        # the coping's gold band round the drum, a red lit band at the inside band's height, warning stripes above and below
        # it, the plinth's gold line
        drum_band("paint_gold", (cx, cz), dr, *COPING)
        drum_band("paint_redlamp", (cx, cz), dr, *TRIM_Y)
        hazard_band((cx, cz), dr, TRIM_Y[0] - 0.5, TRIM_Y[0] - 0.1)
        hazard_band((cx, cz), dr, TRIM_Y[1] + 0.1, TRIM_Y[1] + 0.5)
        drum_band("paint_gold", (cx, cz), lambda y: 8.4 - 0.2 * y / 1.8, *SKIRT_Y)
        for k in range(8):
            th = TAU * k / 8 + 0.2
            Acc.of("window", 0.0).put(xf(radial(box(7.6 - 0.6 * 9.0 / 11.0 + 0.03, 9.0, 0, 0.12, 1.4, 0.45), th), (cx, 0, cz)))
        # the beacon mast on the shoulder's inboard slope, clear of the turret's swing; the turret on the seat
        mr = 4.9
        my = y_on(mr)                            # (the taper's height there)
        mx, mz = at_r(R + 3.0 - mr, b)
        Acc.of("dark", 0.03).put(cyl(mx, my + 1.3, mz, 0.16, 3.0, 6))
        blinker((mx, my + 2.95, mz), 0.6)
        mount((cx, 14.4, cz))
    # the gates: two drum towers either side, a lit bridge between them high enough to ride (or fly) under
    for gi, g in enumerate(GATES):
        pts = []
        for s in (-1, 1):
            TAG[0] = f"g{gi}{'ab'[s > 0]}"
            a = g + s * GATE_HALF
            cx, cz = at_r(R, a)
            pts.append((cx, cz))
            # the drum, its top tapering to the turret's seat (21 m), centred on the drum
            dr = lambda y: 7.6 - 0.8 * y / 18.0
            tower((cx, cz), 7.6, 21.0, dr(18.6), 18.6)
            Acc.of("panel2", 0.1).put(xf(cylinder(8.0, 8.3, 2.0, DRUM_SEG)[:2], (cx, 1.0, cz)))
            drum_band("paint_redlamp", (cx, cz), dr, 18.1, 18.4)                     # (the red band at the crown)
            for y0, y1 in (TRIM_Y, COPING):  # (gold bands painted on the drum's batter, at the inside band's and the coping's heights)
                drum_band("paint_gold", (cx, cz), dr, y0, y1)
            drum_band("paint_gold", (cx, cz), lambda y: 8.3 - 0.3 * y / 2.0, *SKIRT_Y)
            for k in range(10):
                th = TAU * k / 10
                Acc.of("window", 0.0).put(xf(radial(box(7.6 - 0.8 * 9.5 / 18.0 + 0.03, 9.5, 0, 0.12, 1.6, 0.5), th), (cx, 0, cz)))
            mount((cx, 21.0, cz))
        TAG[0] = ""
        (ax, az), (bx, bz) = pts
        mx, mz = (ax + bx) / 2, (az + bz) / 2
        span = math.hypot(bx - ax, bz - az) - 13.0
        yaw = math.atan2(bx - ax, bz - az)
        brot = lambda gg: xf(gg, (mx, 0, mz), (0, yaw, 0))
        Acc.of("navy", 0.12).put(brot(box(0, 15.2, 0, 3.0, 2.0, span)))
        Acc.of("gold", 0.0).put(brot(box(0, 16.35, 0, 3.2, 0.3, span)))
        for sz in (-1, 1):
            Acc.of("cyan", 0.0).put(brot(box(sz * 1.55, 15.2, 0, 0.08, 0.3, span)))
        z = -span / 2 + 3
        while z < span / 2 - 2:
            Acc.of("lamp", 0.0).put(brot(box(0, 14.18, z, 0.9, 0.06, 1.8)))
            z += 6
        col((mx, 14.2, mz), shape="box", hx=1.6, hy=1.15, hz=span / 2, yaw=yaw)
    return end()


# =====================================================================================================================
# The base's other pieces, each in its own frame (origin on the ground at its place, +z its front; src/ilmbCore.js puts each
# where the code-built one stood).
# =====================================================================================================================
def tapered(a, b, ra, rb, seg=8):
    return tube([a, b], [ra, rb], seg, True)


def build_terminal():
    """The job board: a navy console under a curved aluminium canopy, its main screen and two angled side screens (the game
    draws the screens a few centimetres in front of their dark plates, and the holo ring over the canopy: settlements.jobTerminal),
    a lit plinth, queue rails in front."""
    begin("ilmb_terminal")
    Acc.of("concrete", 0.05).put(xf(rbox(9.0, 0.25, 4.5, 0.15, 24, 6), (0, 0.25, 0)))
    Acc.of("panel", 0.03).put(box(0, 0.6, 0.4, 15, 0.2, 7))
    Acc.of("cyan", 0.0).put(box(0, 0.72, 3.92, 15.2, 0.1, 0.12))
    # the console: a bevelled slab, the main screen's bezel on its face, the sloped desk with its keys
    Acc.of("navy", 0.1).put(xf(rbox(5.2, 4.5, 1.1, 0.12, 16, 8), (0, 5.4, -0.8)))
    Acc.of("dark", 0.0).put(box(0, 6.0, 0.29, 9.4, 6.0, 0.06))
    Acc.of("gold", 0.05).put(xf(box(0, 0, 0, 10.0, 0.5, 2.6), (0, 2.6, 1.2), (0.35, 0, 0)))
    for i in range(8):
        Acc.of(("cyan", "green", "redlamp", "beacon")[i % 4], 0.0).put(xf(box(-3.5 + i, 0, 0, 0.6, 0.1, 0.4), (0, 2.9, 1.25), (0.35, 0, 0)))
    Acc.of("gold", 0.04).put(box(0, 9.9, -0.8, 10.6, 0.4, 2.4))
    # the side screens' housings, angled toward the front, each on two struts
    for sd in (-1, 1):
        rot = (0, -sd * 0.45, 0)
        Acc.of("navy", 0.08).put(xf(rbox(2.5, 3.2, 0.6, 0.1, 12, 6), (sd * 7.4, 5.4, 0), rot))
        Acc.of("dark", 0.0).put(xf(box(0, 0, 0.61, 4.3, 5.5, 0.02), (sd * 7.4, 5.4, 0), rot))  # (the game's screen hangs 4 cm in front)
        Acc.of("gold", 0.03).put(xf(box(0, 3.35, 0, 5.2, 0.3, 1.3), (sd * 7.4, 5.4, 0), rot))
        for sx in (-1.4, 1.4):
            Acc.of("alu", 0.02).put(xf(cyl(sx, -3.0, 0, 0.18, 1.6, 8), (sd * 7.4, 5.4, 0), rot))
    # the canopy: a blade arched across, on two raked aluminium posts; a lit strip under its front edge
    prof = [(x, 12.4 + 0.9 * (1 - (x / 9.6) ** 2)) for x in [-9.6 + 1.2 * k for k in range(17)]]
    Acc.of("alu", 0.08).put(strip_box(prof, -2.6, 4.2, 0.4))
    Acc.of("gold", 0.0).put(strip_box([(x, y + 0.12) for x, y in prof], -2.6, 4.2, 0.12))  # (on the blade)
    Acc.of("lamp", 0.0).put(strip_box([(x, y - 0.4) for x, y in prof[1:-1]], 3.6, 4.0, 0.05))  # (under its front edge)
    for sd in (-1, 1):
        Acc.of("alu", 0.04).put(tapered((sd * 8.6, 0.7, 3.4), (sd * 8.2, 12.35, 2.6), 0.32, 0.2))
        Acc.of("panel", 0.02).put(cyl(sd * 8.6, 0.9, 3.4, 0.5, 0.4, 10))
    ay = 12.4 + 0.9 * (1 - (6.5 / 9.6) ** 2)  # (the canopy's top over the antenna)
    Acc.of("dark", 0.02).put(cyl(6.5, ay + 2.05, -1.0, 0.12, 4.2, 6))
    blinker((6.5, ay + 4.3, -1.0), 0.35)
    # queue rails in front: posts and belts
    for sd in (-1, 1):
        for zz in (6.0, 9.0):
            Acc.of("alu", 0.02).put(cyl(sd * 3.0, 0.5, zz, 0.07, 1.0, 6))
            Acc.of("panel", 0.0).put(cyl(sd * 3.0, 0.03, zz, 0.25, 0.06, 8))
        Acc.of("blue", 0.0).put(box(sd * 3.0, 0.92, 7.5, 0.05, 0.12, 3.0))
    col((0, 0, 0), shape="box", hx=9.3, hy=6.6, hz=4.6, yaw=0.0)
    return end()


def strip_box(prof, z0, z1, t):
    """a slab t thick under a curve prof [(x, y)] (its top), from z0 to z1"""
    verts, faces = [], []
    n = len(prof)
    for x, y in prof:
        verts += [(x, y, z0), (x, y, z1), (x, y - t, z1), (x, y - t, z0)]
    for i in range(n - 1):
        a, b = i * 4, (i + 1) * 4
        for j in range(4):
            j2 = (j + 1) % 4
            faces.append((a + j, b + j, b + j2, a + j2))
    faces.append((0, 1, 2, 3))
    faces.append(tuple((n - 1) * 4 + j for j in (3, 2, 1, 0)))
    return verts, faces


def circle_disc(r, n):
    v = [(0.0, 0.0, 0.0)] + [(math.cos(math.pi * i / n) * r, math.sin(math.pi * i / n) * r, 0.0) for i in range(n + 1)]
    return v, [(0, i, i + 1) for i in range(1, n + 1)]


def lattice_tower(legs, braces, h, w0, w1, bays, r=0.3):
    hw = lambda y: w0 + (w1 - w0) * y / h
    cn = ((-1, -1), (1, -1), (1, 1), (-1, 1))
    for sx, sz in cn:
        legs.put(tapered((sx * w0, 0, sz * w0), (sx * w1, h, sz * w1), r, r * 0.8, 6))
    for i in range(bays):
        y0, y1 = h * i / bays, h * (i + 1) / bays
        a, b = hw(y0), hw(y1)
        for f in range(4):
            (ax, az), (bx, bz) = cn[f], cn[(f + 1) % 4]
            braces.put(B((ax * a, y0, az * a), (bx * b, y1, bz * b), r * 0.4, 4, True))
            braces.put(B((bx * a, y0, bz * a), (ax * b, y1, az * b), r * 0.4, 4, True))
            legs.put(B((ax * b, y1, az * b), (bx * b, y1, bz * b), r * 0.5, 4, True))


def build_horton(name, band):
    """A Horton fuel sphere (6.5 m) on eight legs braced round, bands in its fuel's colour, a ladder to the valve at the top."""
    begin(f"ilmb_{name}")
    r = 6.5
    cy = r + 3.2
    Acc.of("concrete", 0.04).put(cyl(0, 0.2, 0, r * 0.95, 0.4, 24, rt=r * 0.9))
    for i in range(8):
        a = TAU * i / 8
        Acc.of("steel", 0.04).put(B((math.cos(a) * r * 0.82, 0.3, math.sin(a) * r * 0.82), (math.cos(a) * r * 0.98, cy, math.sin(a) * r * 0.98), 0.24, 6, True))
        leg = lambda aa, y: ((0.82 + 0.16 * (y - 0.3) / (cy - 0.3)) * r * math.cos(aa), y, (0.82 + 0.16 * (y - 0.3) / (cy - 0.3)) * r * math.sin(aa))
        Acc.of("dark", 0.0).put(B(leg(a, 0.8), leg(a + TAU / 8, cy * 0.55), 0.08, 4, True))  # (leg to leg)
    Acc.of("white", 0.14).put(ball(0, cy, 0, r, 28, 16))
    Acc.of(band, 0.0).put(ring(r * math.sqrt(1 - 0.25) + 0.1, 0.32, cy + r * 0.5, 48, 6))  # (bands on the sphere at their heights)
    Acc.of("gold", 0.0).put(ring(r * math.sqrt(1 - 0.09) + 0.08, 0.2, cy - r * 0.3, 48, 6))
    Acc.of("dark", 0.02).put(ring(r + 0.1, 0.12, cy, 48, 4))
    Acc.of("steel", 0.04).put(cyl(0, cy + r - 0.1, 0, 0.6, 1.2, 12, rt=0.5))
    for sd in (-0.3, 0.3):  # a ladder up the side to a landing at the equator
        Acc.of("dark", 0.0).put(B((sd, 0.3, r + 1.2), (sd, cy + 1.1, r + 1.2), 0.05, 4, True))
    y = 0.6
    while y < cy:
        Acc.of("dark", 0.0).put(B((-0.3, y, r + 1.2), (0.3, y, r + 1.2), 0.03, 4, True))
        y += 0.35
    Acc.of("steel", 0.02).put(box(0, cy - 0.05, r + 0.75, 1.6, 0.1, 1.4))
    Acc.of("hazard", 0.0).put(B((-0.8, cy + 1.0, r + 1.45), (0.8, cy + 1.0, r + 1.45), 0.04, 4, True))
    for sd in (-0.8, 0.8):
        Acc.of("dark", 0.0).put(B((sd, cy, r + 1.45), (sd, cy + 1.05, r + 1.45), 0.04, 4, True))
    col((0, cy, 0), shape="sphere", r=r)
    col((0, 0, 0), shape="cyl", r=r * 0.95, h=cy - r * 0.6)
    return end()


def build_outdome(name, r, shell):
    """A family dome: a shell on a concrete footing ring, white ribs and rings, a band of lit windows, a berm round its foot,
    the airlock tunnel out of the +z side with its door and lamp, a cupola."""
    begin(f"ilmb_{name}")
    C0 = 1.0
    Acc.of("concrete", 0.08).put(cyl(0, C0 / 2, 0, r + 0.45, C0, 40, rt=r + 0.2))
    Acc.of("regolith", 0.08).put(sector([(r - 0.2, 0), (r + 3.0, 0), (r + 0.6, 2.0), (r - 0.2, 2.0)], math.pi / 2 + 0.35, math.pi / 2 + TAU - 0.35, 40))
    Acc.of(shell, 0.2).put(xf(sphere(r, 40, 12, math.pi / 2)[:2], (0, C0, 0)))
    rib = Acc.of("white", 0.03)
    for i in range(12):
        th = TAU * (i + 0.5) / 12
        pts = [(math.cos(th) * (r + 0.1) * math.cos(e), C0 + (r + 0.1) * math.sin(e), math.sin(th) * (r + 0.1) * math.cos(e)) for e in [1.35 * k / 8 for k in range(9)]]
        rib.put(path_tube(pts, 0.2, 5))
    for e in (0.42, 0.86):
        rib.put(ring((r + 0.1) * math.cos(e), 0.18, C0 + (r + 0.1) * math.sin(e), 48, 5))
    e = 0.2
    for i in range(16):
        th = TAU * (i + 0.5) / 16
        if abs(math.atan2(math.sin(th - math.pi / 2), math.cos(th - math.pi / 2))) < 0.4:
            continue
        x, z = at_r((r + 0.02) * math.cos(e), th)
        Acc.of("window", 0.0).put(xf(box(0, 0, 0, 1.4, 1.0, 0.1), (x, C0 + r * math.sin(e), z), (-e, math.pi / 2 - th, 0)))
    Acc.of("gold", 0.0).put(ring((r + 0.05) * math.cos(0.1), 0.2, C0 + r * math.sin(0.1), 48, 4))
    # the airlock toward +z: a tunnel, its housing and door, a lamp
    Acc.of("light", 0.06).put(xf(cylinder(2.4, 2.4, 5.0, 16)[:2], (0, 2.6, r + 1.6), (math.pi / 2, 0, 0)))
    Acc.of("cream", 0.06).put(box(0, 3.0, r + 4.2, 6.0, 6.0, 1.8))
    Acc.of("door", 0.0).put(box(0, 2.1, r + 5.12, 2.6, 3.4, 0.06))
    Acc.of("gold", 0.02).put(box(0, 6.1, r + 4.2, 6.4, 0.3, 2.2))
    Acc.of("lamp", 0.0).put(box(0, 4.3, r + 5.14, 1.8, 0.2, 0.06))
    Acc.of("navy", 0.06).put(cyl(0, C0 + r + 0.6, 0, r * 0.18, 1.6, 16, rt=r * 0.14))
    blinker((0, C0 + r + 1.8, 0), 0.4)
    for y0, y1 in ((0.0, C0 + r * 0.35), (C0 + r * 0.35, C0 + r * 0.7), (C0 + r * 0.7, C0 + r * 0.92), (C0 + r * 0.92, C0 + r)):
        rr = math.sqrt(max(0.0, r * r - max(0.0, y0 - C0) ** 2))
        col((0, y0, 0), shape="cyl", r=rr + 0.3, h=y1 - y0)
    col((0, 0, r + 4.2), shape="box", hx=3.1, hy=3.0, hz=1.0, yaw=0.0)
    col((0, 0, r + 1.6), shape="box", hx=2.5, hy=2.5, hz=2.6, yaw=0.0)
    return end()


def build_barracks():
    """A barracks Quonset (7 m radius, 34 m) on its pad: grey skin on aluminium ribs, the lit end wall with its door, lamps
    and a gold arch, a strip of windows along each side."""
    begin("ilmb_barracks")
    r, L = 7.0, 34.0
    Acc.of("concrete", 0.04).put(box(0, 0.2, 0, 2 * r + 1, 0.4, L + 1))
    Acc.of("panel", 0.12).put(xf(cylinder_arc(r, r, L, 20, math.pi / 2, math.pi)[:2], (0, 0.4, 0), (math.pi / 2, 0, 0)))
    for k in range(12):
        z = -L / 2 + 1 + k * 3
        arc = [(math.cos(a) * (r + 0.06), 0.4 + math.sin(a) * (r + 0.06), z) for a in [math.pi * j / 16 for j in range(17)]]
        Acc.of("alu", 0.0).put(path_tube(arc, 0.12, 4))
    arc = [(math.cos(a) * (r + 0.1), 0.4 + math.sin(a) * (r + 0.1), L / 2 - 0.5) for a in [math.pi * j / 16 for j in range(17)]]
    Acc.of("gold", 0.0).put(path_tube(arc, 0.26, 5))
    Acc.of("light", 0.0).put(xf(circle_disc(r, 20), (0, 0.4, L / 2)))
    Acc.of("light", 0.0).put(xf(circle_disc(r, 20), (0, 0.4, -L / 2), (0, math.pi, 0)))
    Acc.of("door", 0.02).put(box(0, 2.4, L / 2 + 0.1, 4.6, 4.0, 0.2))
    for sd in (-1, 1):
        Acc.of("lamp", 0.0).put(xf(cylinder(0.35, 0.35, 0.1, 10)[:2], (sd * r * 0.6, r * 0.6, L / 2 + 0.06), (math.pi / 2, 0, 0)))
        for k in range(10):  # (between the ribs, a radian down from the crown, flat on the skin)
            z = -L / 2 + 2.5 + k * 3
            if z > L / 2 - 2:
                continue
            Acc.of("window", 0.0).put(xf(box(0, 0, 0, 0.1, 0.9, 1.6), (sd * (r + 0.02) * math.sin(1.0), 0.4 + (r + 0.02) * math.cos(1.0), z), (0, 0, math.pi / 2 - sd * 1.0)))
    col((0, 0, 0), shape="box", hx=r + 0.5, hy=0.2, hz=L / 2 + 0.5, yaw=0.0)
    col((0, 0.4, 0), shape="hcyl", r=r + 0.1, len=L, yaw=0.0)
    return end()


def build_depot():
    """The vehicle depot: a portal-framed shed 26 m square, three roller doors on its front (+z) under lamps, navy cladding
    with a gold eave, roof vents, a gantry sign frame (the game's sign)."""
    begin("ilmb_depot")
    w, d, h = 26.0, 26.0, 11.0
    Acc.of("concrete", 0.05).put(box(0, 0.25, 2.0, w + 1, 0.5, d + 5))
    Acc.of("panel2", 0.1).put(box(0, 0.4 + h / 2, 0, w, h, d))
    for k in range(7):
        x = -w / 2 + k * w / 6
        for zz in (-d / 2 - 0.15, d / 2 + 0.15):
            Acc.of("navy", 0.03).put(box(x, 0.4 + h / 2, zz, 0.6, h, 0.3))
    Acc.of("navy", 0.06).put(box(0, h + 0.65, 0, w + 0.6, 0.5, d + 0.6))
    Acc.of("gold", 0.0).put(box(0, h + 1.0, 0, w + 0.7, 0.2, d + 0.7))
    for x in (-8.0, 0.0, 8.0):
        Acc.of("dark", 0.02).put(box(x, 3.6, d / 2 + 0.08, 6.4, 6.4, 0.12))
        for k in range(10):
            Acc.of("panel", 0.0).put(box(x, 0.8 + k * 0.64, d / 2 + 0.16, 6.2, 0.06, 0.04))
        Acc.of("hazard", 0.0).put(box(x, 7.05, d / 2 + 0.2, 6.6, 0.3, 0.12))
        Acc.of("lamp", 0.0).put(box(x, 7.5, d / 2 + 0.4, 1.4, 0.2, 0.5))
    for sd in (-1, 1):
        for zz in (-6.0, 0.0, 6.0):
            Acc.of("window", 0.0).put(box(sd * (w / 2 + 0.02), 7.5, zz, 0.06, 1.2, 3.0))
    for x in (-6.0, 6.0):
        Acc.of("light", 0.03).put(box(x, h + 1.6, -4.0, 3.0, 1.4, 3.0))
    col((0, 0, 0), shape="box", hx=w / 2 + 0.2, hy=(h + 1.2) / 2, hz=d / 2 + 0.2, yaw=0.0)
    return end()


def build_mast():
    """The comms mast: a 30 m tapering lattice on a pad, a cabin box at three quarters, the dish head on a turning boom
    (dishkit.py's head, SpaceCom livery), the aircraft lamp on top."""
    begin("ilmb_mast")
    h = 30.0
    Acc.of("concrete", 0.03).put(box(0, 0.25, 0, 3, 0.5, 3))
    lattice_tower(Acc.of("light", 0.04), Acc.of("dark", 0.015), h, 1.0, 0.4, int(round(h / 3.5)), 0.14)
    Acc.of("gold", 0.02).put(box(0, h * 0.75 - 0.25, 0, 0.6, 0.5, 0.6))
    blinker((0, h + 0.4, 0), 0.35)
    f = fan((0, h * 0.75, 0), 0.25)
    rim, arm = 1.15, 1.7
    kk = rim / RIM
    base = Matrix.Translation((0, (YP - NECK) * kk, arm))
    turn, nod, Sk = Matrix.Rotation(math.pi, 4, "Y"), Matrix.Rotation(-0.7, 4, "X"), Matrix.Scale(kk, 4)
    frames = {"yaw": base @ turn @ Sk, "tilt": base @ turn @ nod @ Sk}
    slots = {"body": "white", "stripe": "gold", "steel": "steel", "dark": "dark", "white": "white", "dish": "cream", "hazard": "hazard", "green": "green"}
    for _p, (verts, faces), slot, ink, part in head_pieces():
        m = frames[part]
        Acc.of(slots[slot], ink * kk if ink >= 0.04 else 0.0, parent=f).put(([tuple(m @ Vector(v)) for v in verts], faces))
    Acc.of("dark", 0.03, parent=f).put(B((0, 0, 0), (0, 0, arm), 1.2 * kk, 5, True))
    col((0, 0, 0), shape="cyl", r=1.0, h=h)
    return end()


def build_pylon():
    """An inner defence pylon (7 m): an octagonal column on its footing, gold bands, a ladder up the front, the railed gun deck
    with its glowing ring (the turret is the game's, on the deck)."""
    begin("ilmb_pylon")
    h = 7.0
    Acc.of("roof", 0.08).put(cyl(0, 0.45, 0, 2.9, 0.9, 8, rt=2.4))
    Acc.of("panel", 0.1).put(cyl(0, h / 2, 0, 1.35, h, 8, rt=0.95))
    for y in (h * 0.3, h * 0.62):
        Acc.of("gold", 0.0).put(cyl(0, y, 0, 1.33 - y * 0.055, 0.35, 8))
    for sx in (-0.35, 0.35):
        Acc.of("dark", 0.0).put(box(sx, h / 2, 1.35, 0.08, h - 1, 0.08))
    y = 1.2
    while y < h - 0.8:
        Acc.of("dark", 0.0).put(box(0, y, 1.35, 0.75, 0.06, 0.06))
        y += 0.4
    Acc.of("roof", 0.08).put(cyl(0, h - 0.35, 0, 2.1, 0.7, 10, rt=2.7))
    for k in range(10):
        a = TAU * k / 10
        Acc.of("steel", 0.0).put(cyl(math.cos(a) * 2.55, h + 0.45, math.sin(a) * 2.55, 0.05, 0.9, 4))
    Acc.of("gold", 0.0).put(ring(2.55, 0.08, h + 0.9, 32, 4))
    Acc.of("amber", 0.0).put(ring(2.45, 0.14, h - 0.35, 32, 4))  # (round the deck's flare)
    col((0, -2.0, 0), shape="cyl", r=1.4, h=h + 2.0)
    return end()


build_skywalks()
build_core_a()
build_wall_a()
build_terminal()
build_horton("horton_red", "red")
build_horton("horton_blue", "blue")
build_outdome("dome_pink", 16.0, "pink")
build_outdome("dome_gold", 14.0, "gold")
build_barracks()
build_depot()
build_mast()
build_pylon()
exec(open(os.path.join(REPO, "tools", "blender", "ilmb_quarters.py"), encoding="utf-8").read(), globals())   # the quarters' pieces
build_quarters()

_clash = [o.name for o in C.objects if o.name[-4:-3] == "." and o.name[-3:].isdigit()]
assert not _clash, f"object names must be unique, Blender renamed {_clash[:3]}"
print("built", len(C.objects), "objects")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
