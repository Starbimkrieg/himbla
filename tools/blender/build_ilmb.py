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
#   ilmb_core_a, ilmb_core_b   the central complex, the two proposals (docs/ilmb-proposals)
#   ilmb_wall_a, ilmb_wall_b   the fortress wall, gates, gate towers and bastions, one continuous ring, the two proposals
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
    "door": 0x2A2540, "pink": 0xFF7AD9, "bark": 0x6B4A32,
    # glow
    "window": 0xFFF6A8, "lamp": 0xFFF6A8, "pane": 0xBFEFFF, "redlamp": 0xFF2A4A, "cyan": 0x2EE6FF, "screen": 0x0D1A2A,
    "amber": 0xFF9F1C, "beacon": 0xFFD23F, "green": 0x7DFF6A,
    # see-through
    "glass": 0x9BE7FF,
}
PFX = "ilmb_"
ROOT = None
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "dishkit.py"), encoding="utf-8").read(), globals())   # the comms mast's dish head
from mathutils import Vector, Matrix

# ---------------- the base's layout (src/locations.js, src/world.js) ----------------
WINGS = [(0.0, 116, 24.0), (0.62, 122, 18.6), (2.2, 124, 21.6), (3.8, 120, 14.0), (4.5, 110, 12.6), (5.2, 120, 28.6)]  # angle, distance, dock
DOCK_R = 56.0                                                      # the core's lobby faces: where each skywalk starts
WING_END = [d - e + 1.2 for _, d, e in WINGS]                      # where each ends (1.2 m into the wing's lobby)
DOCK_A = [a for a, _, _ in WINGS]
MAIN_A = math.pi / 2                                               # the main entrance faces the job terminal at (0, 76)
WALL_R = 248.0
GATES = [0.0, math.pi / 2, math.pi, 3 * math.pi / 2]
BASTIONS = [(q + f) * (math.pi / 2) for q in range(4) for f in (1 / 3, 2 / 3)]
GATE_HALF = 0.13                                                   # the gate towers stand at gate +- this (radians)
SW_F, SW_W, SW_WALL = 0.6, 5.6, 2.0                                # skywalk floor, width, glass wall height (vault radius W / 2)


def radial(geo, th, r=0.0, y=0.0):
    """geometry built in a radial frame (+x out along theta, +z the next angle round) placed at radius r on theta"""
    return xf(xf(geo, (r, y, 0)), (0, 0, 0), (0, -th, 0))


def at_r(r, th):
    return (math.cos(th) * r, math.sin(th) * r)


def ring_sector(profile, a0, a1, step=math.radians(2)):
    """a closed (r, y) section swept from a0 to a1 (full circle if they span 2 pi)"""
    return sector(profile, a0, a1, max(3, int(round(abs(a1 - a0) / step))))


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
    # the ring's body in bands, outside: plinth, base wall, the glazed band set back with its dark backing and fins, the upper
    # band with a gold string course, the roof, a parapet
    Acc.of("panel2", 0.1).put(ring_sector([(RO - 1.0, 0), (RO + 0.8, 0), (RO + 0.8, 1.2), (RO - 1.0, 1.2)], *full))
    Acc.of("cream", 0.12).put(ring_sector([(RI, 0), (RO, 0), (RO, 3.6), (RI, 3.6)], *full))
    Acc.of("roof", 0.0).put(ring_sector([(RI + 0.6, 3.6), (RO - 0.6, 3.6), (RO - 0.6, 9.6), (RI + 0.6, 9.6)], *full))
    Acc.of("glass", 0.0).put(ring_sector([(RO - 0.3, 3.6), (RO - 0.25, 3.6), (RO - 0.25, 9.6), (RO - 0.3, 9.6)], *full))
    Acc.of("glass", 0.0).put(ring_sector([(RI + 0.25, 3.6), (RI + 0.3, 3.6), (RI + 0.3, 9.6), (RI + 0.25, 9.6)], *full))
    Acc.of("window", 0.0).put(ring_sector([(RO - 0.62, 4.0), (RO - 0.6, 4.0), (RO - 0.6, 5.0), (RO - 0.62, 5.0)], *full))
    Acc.of("window", 0.0).put(ring_sector([(RO - 0.62, 7.4), (RO - 0.6, 7.4), (RO - 0.6, 8.2), (RO - 0.62, 8.2)], *full))
    Acc.of("cream", 0.12).put(ring_sector([(RI, 9.6), (RO + 0.2, 9.6), (RO + 0.2, H), (RI, H)], *full))
    Acc.of("gold", 0.0).put(ring_sector([(RO + 0.2, 10.6), (RO + 0.3, 10.6), (RO + 0.3, 11.2), (RO + 0.2, 11.2)], *full))
    Acc.of("roof", 0.04).put(ring_sector([(RI, H), (RO + 0.2, H), (RO + 0.2, H + 0.15), (RI, H + 0.15)], *full))
    Acc.of("white", 0.04).put(ring_sector([(RO - 0.4, H + 0.15), (RO + 0.2, H + 0.15), (RO + 0.2, H + 1.2), (RO - 0.4, H + 1.2)], *full))
    Acc.of("white", 0.04).put(ring_sector([(RI, H + 0.15), (RI + 0.5, H + 0.15), (RI + 0.5, H + 1.0), (RI, H + 1.0)], *full))
    # the glazing's fins, outside every 4 degrees and inside every 6, clear of the lobbies
    busy = DOCK_A + [MAIN_A]
    fin = Acc.of("white", 0.02)
    for k in range(90):
        th = TAU * k / 90
        if any(abs(math.atan2(math.sin(th - a), math.cos(th - a))) < (0.16 if a != MAIN_A else 0.32) for a in busy):
            continue
        fin.put(radial(box(RO - 0.1, 6.6, 0, 1.0, 6.0, 0.3), th))
    for k in range(60):
        fin.put(radial(box(RI + 0.1, 6.6, 0, 0.6, 6.0, 0.25), TAU * k / 60))
    # the six docking lobbies
    for th in DOCK_A:
        lobby_r(th, RO - 1.0, DOCK_R, 10.0, 8.4)
    # the main atrium toward the job terminal: a glazed hall out to r 61, a cantilevered canopy to 66, three lit doors
    th = MAIN_A
    Acc.of("cream", 0.1).put(radial(box(55.5, 0.6, 0, 11, 1.2, 26), th))
    Acc.of("glass", 0.0).put(radial(box(56.0, 7.0, 0, 10.0, 12.0, 24.0), th))
    Acc.of("roof", 0.0).put(radial(box(55.0, 7.0, 0, 7.0, 11.6, 23.0), th))
    gf = Acc.of("navy", 0.03)
    for zz in [-12 + 2.4 * k for k in range(11)]:
        gf.put(radial(box(61.0, 7.0, zz, 0.3, 12.0, 0.25), th))
    for yy in (1.2, 5.0, 9.0, 13.0):
        gf.put(radial(box(61.0, yy, 0, 0.3, 0.25, 24.2), th))
    for sz in (-1, 1):
        gf.put(radial(box(56.0, 7.0, sz * 12.0, 10.0, 12.0, 0.3), th))
    Acc.of("cream", 0.1).put(radial(box(58.5, 13.6, 0, 18.0, 1.0, 27.0), th))
    Acc.of("gold", 0.0).put(radial(box(58.5, 13.0, 0, 18.1, 0.3, 27.1), th))
    for zz in (-5.5, 0, 5.5):
        Acc.of("door", 0.0).put(radial(box(61.06, 2.8, zz, 0.1, 3.4, 3.6), th))
        Acc.of("lamp", 0.0).put(radial(box(61.12, 4.75, zz, 0.06, 0.2, 3.4), th))
    Acc.of("lamp", 0.0).put(radial(box(58.5, 13.05, 0, 14.0, 0.06, 0.4), th))
    x, z = at_r(55.75, th)
    col((x, 0, z), shape="box", hx=13.2, hy=7.0, hz=5.75, yaw=math.atan2(math.cos(th), math.sin(th)))
    x, z = at_r(58.5, th)
    col((x, 13.1, z), shape="box", hx=13.5, hy=0.5, hz=9.0, yaw=math.atan2(math.cos(th), math.sin(th)))
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
    # the command tower: three canted legs from pads on the ring roof to a collar under the saucer
    LEG_A = [MAIN_A + 0.55 + TAU * k / 3 for k in range(3)]
    foot_r, top_r, top_y = 41.0, 5.0, 60.0
    for a in LEG_A:
        fx, fz = at_r(foot_r, a)
        tx, tz = at_r(top_r, a)
        Acc.of("roof", 0.06).put(radial(box(foot_r, H + 1.0, 0, 7.0, 2.0, 6.0), a))
        Acc.of("gold", 0.0).put(radial(box(foot_r, H + 2.05, 0, 7.1, 0.12, 6.1), a))
        Acc.of("white", 0.1).put(tube([(fx, H + 1.8, fz), (tx, top_y, tz)], [1.7, 1.0], 8, True))
        for t in (0.25, 0.5, 0.75):
            Acc.of("gold", 0.0).put(xf(ring_band_on(fx, H + 1.8, fz, tx, top_y, tz, t, 1.7 + (1.0 - 1.7) * t), (0, 0, 0)))
        dx, dy, dz = tx - fx, top_y - H - 1.8, tz - fz
        ln = math.sqrt(dx * dx + dy * dy + dz * dz)
        mx, mz = (fx + tx) / 2, (fz + tz) / 2
        col((mx, (H + 1.8 + top_y) / 2 - ln / 2, mz), shape="box", hx=1.6, hy=ln / 2, hz=1.6, yaw=math.atan2(-math.cos(a), -math.sin(a)), pitch=math.atan2(math.hypot(dx, dz), dy))
        col_box_r(foot_r, a, H, 2.0, 3.5, 3.0)
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


def ring_band_on(ax, ay, az, bx, by, bz, t, r):
    """a band round a straight member from a to b, t along it, the member's radius there r"""
    A, Bv = Vector((ax, ay, az)), Vector((bx, by, bz))
    d = (Bv - A).normalized()
    c = A + (Bv - A) * t
    rot = Vector((0, 1, 0)).rotation_difference(d).to_euler("XYZ")
    v, f = cylinder(r + 0.08, r + 0.08, 0.5, 10)[:2]
    M = Matrix.Translation(c) @ rot.to_matrix().to_4x4()
    return [tuple(M @ Vector(p)) for p in v], f


# =====================================================================================================================
# WALL A: "the Rampart". One wall all the way round, its outer face battered, on a plinth, with buttress fins and red lamps
# outside, a lit band inside, a parapet with a gold coping and a walk behind it. At each of the eight bastions the wall
# swells into a drum with a gun deck; at each of the four gates it rises into two drum towers with a lit bridge between.
# The gun mounts are where the game's were (two per gate, one per bastion).
# =====================================================================================================================
def build_wall_a():
    begin("ilmb_wall_a", draft="a")
    R = WALL_R
    gaps = spans(GATES, GATE_HALF)
    wall = [(R - 3.0, 0), (R + 2.6, 0), (R + 1.4, 10.0), (R - 3.0, 10.0)]
    for a0, a1 in gaps:
        Acc.of("panel", 0.2).put(ring_sector(wall, a0, a1))
        Acc.of("panel2", 0.1).put(ring_sector([(R + 1.6, 0), (R + 4.2, 0), (R + 4.0, 1.8), (R + 1.9, 1.8)], a0, a1))
        Acc.of("pave", 0.0).put(ring_sector([(R - 2.9, 10.0), (R + 0.6, 10.0), (R + 0.6, 10.12), (R - 2.9, 10.12)], a0, a1))
        Acc.of("panel", 0.08).put(ring_sector([(R + 0.6, 10.0), (R + 1.6, 10.0), (R + 1.6, 11.8), (R + 0.9, 11.8)], a0, a1))
        Acc.of("gold", 0.06).put(ring_sector([(R + 0.75, 11.8), (R + 1.75, 11.8), (R + 1.75, 12.2), (R + 0.75, 12.2)], a0, a1))
        Acc.of("panel2", 0.04).put(ring_sector([(R - 3.0, 10.0), (R - 2.5, 10.0), (R - 2.5, 11.0), (R - 3.0, 11.0)], a0, a1))
        Acc.of("lamp", 0.0).put(ring_sector([(R - 3.06, 6.3), (R - 3.0, 6.3), (R - 3.0, 6.7), (R - 3.06, 6.7)], a0, a1))
        Acc.of("gold", 0.0).put(ring_sector([(R + 4.05, 1.8), (R + 4.25, 1.8), (R + 4.25, 2.05), (R + 4.05, 2.05)], a0, a1))
        # buttress fins every 4 degrees (not in the drums), a red lamp on every third
        n = int((a1 - a0) / math.radians(4))
        for k in range(1, n):
            th = a0 + (a1 - a0) * k / n
            if any(abs(math.atan2(math.sin(th - b), math.cos(th - b))) < 0.05 for b in BASTIONS):
                continue
            Acc.of("panel2", 0.06).put(radial(frustum([(-0.1, -0.7), (3.4, -0.7), (3.4, 0.7), (-0.1, 0.7)], [(-0.1, -0.5), (0.4, -0.5), (0.4, 0.5), (-0.1, 0.5)], 0.0, 9.0), th, R + 1.4))
            if k % 3 == 0:
                Acc.of("redlamp", 0.0).put(radial(box(R + 2.6 - 1.2 * 0.76 + 0.05, 7.6, 1.2, 0.12, 0.3, 0.6), th))  # (on the battered face)
        # colliders: the wall to its coping in boxes of 3 degrees
        col_ring(R - 3.0, R + 2.6, 0.0, 12.2, a0, a1, math.radians(3))
    # the bastions: drums swelling out of the wall, a gun deck on top, a beacon mast on the inner side
    for b in BASTIONS:
        cx, cz = at_r(R + 3.0, b)
        Acc.of("panel", 0.18).put(xf(cylinder(7.0, 7.6, 11.0, 24)[:2], (cx, 5.5, cz)))
        Acc.of("panel2", 0.1).put(xf(cylinder(8.2, 8.4, 1.8, 24)[:2], (cx, 0.9, cz)))
        Acc.of("gold", 0.06).put(xf(cylinder(7.5, 7.1, 1.0, 24)[:2], (cx, 11.5, cz)))
        Acc.of("redlamp", 0.0).put(xf(cylinder(7.43, 7.43, 0.35, 24, open_ended=True)[:2], (cx, 7.4, cz)))
        for k in range(8):
            th = TAU * k / 8 + 0.2
            Acc.of("window", 0.0).put(xf(radial(box(7.6 - 0.6 * 9.0 / 11.0 + 0.03, 9.0, 0, 0.12, 1.4, 0.45), th), (cx, 0, cz)))
        gx, gz = at_r(R + 5.6, b)
        Acc.of("roof", 0.06).put(xf(cylinder(2.3, 2.6, 2.0, 12)[:2], (gx, 13.0, gz)))
        Acc.of("gold", 0.0).put(xf(cylinder(2.4, 2.4, 0.3, 12)[:2], (gx, 13.85, gz)))
        Acc.of("amber", 0.0).put(ring(2.75, 0.14, 12.15, 24, 4, t=(gx, 0, gz)))
        mx, mz = at_r(R + 0.6, b)
        Acc.of("dark", 0.03).put(cyl(mx, 13.5, mz, 0.16, 3.0, 6))
        blinker((mx, 15.4, mz), 0.6)
        col((cx, -2.0, cz), shape="cyl", r=7.7, h=14.0)
        col((gx, 12.0, gz), shape="cyl", r=2.6, h=2.0)
        mount((gx, 14.0, gz))
    # the gates: two drum towers either side, a lit bridge between them high enough to ride (or fly) under
    for g in GATES:
        pts = []
        for s in (-1, 1):
            a = g + s * GATE_HALF
            cx, cz = at_r(R, a)
            pts.append((cx, cz))
            Acc.of("panel", 0.2).put(xf(cylinder(6.8, 7.6, 18.0, 28)[:2], (cx, 9.0, cz)))
            Acc.of("panel2", 0.1).put(xf(cylinder(8.0, 8.3, 2.0, 28)[:2], (cx, 1.0, cz)))
            for y in (6.5, 12.5):  # (bands on the drum's batter)
                rr = 7.6 - 0.8 * y / 18.0 + 0.08
                Acc.of("gold", 0.0).put(xf(cylinder(rr, rr, 0.5, 28)[:2], (cx, y, cz)))
            Acc.of("navy", 0.1).put(xf(cylinder(7.6, 6.9, 1.6, 28)[:2], (cx, 18.8, cz)))
            Acc.of("redlamp", 0.0).put(ring(7.52, 0.18, 19.2, 40, 4, t=(cx, 0, cz)))  # (on the crown's flare)
            for k in range(10):
                th = TAU * k / 10
                Acc.of("window", 0.0).put(xf(radial(box(7.6 - 0.8 * 9.5 / 18.0 + 0.03, 9.5, 0, 0.12, 1.6, 0.5), th), (cx, 0, cz)))
            gx, gz = at_r(R + 1.6, a)
            Acc.of("roof", 0.06).put(xf(cylinder(2.4, 2.7, 1.4, 12)[:2], (gx, 20.3, gz)))
            col((cx, -2.0, cz), shape="cyl", r=7.7, h=21.6)
            mount((gx, 21.0, gz))
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
# CORE B: "the Arcology". A stepped mesa of four battered terraces, each with its glazing band and a planted edge, rising to a
# glass lantern; round the lantern six canted blades meet a halo ring 70 m up, the spire over it. Two inclined glass
# elevators climb the terraces' edges either side of a glazed prow, the main entrance toward the job terminal. Tall and
# stepped, a landmark from anywhere on the plain.
# =====================================================================================================================
TIERS = [(52.0, 0.0, 9.0), (43.0, 9.0, 18.0), (34.0, 18.0, 27.0), (25.0, 27.0, 36.0)]  # outer radius, foot, top


def build_core_b():
    begin("ilmb_core_b", draft="b")
    full = (0.0, TAU)
    for i, (r, y0, y1) in enumerate(TIERS):
        rin = TIERS[i + 1][0] - 1.0 if i + 1 < len(TIERS) else 0.0
        bat = 0.9                                       # each tier's face leans in this much
        Acc.of("cream", 0.14).put(ring_sector([(max(rin, 0.0), y0), (r + bat, y0), (r + bat * 0.82, y0 + 2.0), (max(rin, 0.0), y0 + 2.0)], *full))
        Acc.of("roof", 0.0).put(ring_sector([(max(rin, 0.0), y0 + 2.0), (r + bat * 0.5, y0 + 2.0), (r + bat * 0.2, y0 + 6.2), (max(rin, 0.0), y0 + 6.2)], *full))
        Acc.of("glass", 0.0).put(ring_sector([(r + bat * 0.62, y0 + 2.0), (r + bat * 0.66, y0 + 2.0), (r + bat * 0.36, y0 + 6.2), (r + bat * 0.32, y0 + 6.2)], *full))
        Acc.of("window", 0.0).put(ring_sector([(r + bat * 0.48, y0 + 3.2), (r + bat * 0.52, y0 + 3.2), (r + bat * 0.44, y0 + 4.0), (r + bat * 0.4, y0 + 4.0)], *full))
        Acc.of("cream", 0.14).put(ring_sector([(max(rin, 0.0), y0 + 6.2), (r + bat * 0.2, y0 + 6.2), (r, y1), (max(rin, 0.0), y1)], *full))
        Acc.of("gold", 0.0).put(ring_sector([(r + bat * 0.1, y1 - 1.4), (r + bat * 0.1 + 0.12, y1 - 1.4), (r + 0.12, y1 - 0.9), (r, y1 - 0.9)], *full))
        # the terrace deck's edge: a planter round the rim, its shrubs, an aluminium rail (the top tier's round the lantern)
        Acc.of("panel", 0.04).put(ring_sector([(r - 2.2, y1), (r - 0.2, y1), (r - 0.2, y1 + 0.8), (r - 2.2, y1 + 0.8)], *full))
        Acc.of("grass", 0.0).put(ring_sector([(r - 2.0, y1 + 0.8), (r - 0.4, y1 + 0.8), (r - 0.4, y1 + 0.9), (r - 2.0, y1 + 0.9)], *full))
        nb = int(TAU * r / 6.0)
        for k in range(nb):
            th = TAU * (k + 0.5 * (i % 2)) / nb
            x, z = at_r(r - 1.2, th)
            Acc.of("leaf2" if k % 3 else "leaf", 0.03).put(ball(x, y1 + 1.3, z, 0.6 + 0.15 * (k % 2), 6, 4))
        rail = [(math.cos(TAU * k / 96) * (r - 0.35), y1 + 1.5, math.sin(TAU * k / 96) * (r - 0.35)) for k in range(97)]
        Acc.of("alu", 0.02).put(path_tube(rail, 0.06, 4))
        for k in range(48):
            x, z = at_r(r - 0.35, TAU * k / 48)
            Acc.of("alu", 0.0).put(cyl(x, y1 + 1.15, z, 0.05, 0.7, 4))
        # mullions on the glazing every 4 degrees
        for k in range(90):
            th = TAU * k / 90
            Acc.of("white", 0.015).put(radial(box(r + bat * 0.45, y0 + 4.1, 0, 0.5, 4.2, 0.22), th))
        col((0, y0, 0), shape="cyl", r=r + 0.9, h=(y1 + 0.9) - y0)
    # the lantern on the top terrace: a glass drum round a lit core, white mullions, a navy cap
    L0, L1, LR = 36.0, 58.0, 15.0
    Acc.of("roof", 0.0).put(xf(cylinder(LR - 1.6, LR - 1.6, L1 - L0, 40)[:2], (0, (L0 + L1) / 2, 0)))
    Acc.of("glass", 0.0).put(xf(cylinder(LR, LR, L1 - L0, 40, open_ended=True)[:2], (0, (L0 + L1) / 2, 0)))
    for y in (40.0, 45.5, 51.0):
        Acc.of("window", 0.0).put(xf(cylinder(LR - 1.58, LR - 1.58, 1.0, 40, open_ended=True)[:2], (0, y, 0)))
        Acc.of("white", 0.03).put(ring(LR + 0.1, 0.18, y + 2.6, 64, 4))
    for k in range(24):
        Acc.of("white", 0.03).put(radial(box(LR + 0.05, (L0 + L1) / 2, 0, 0.35, L1 - L0, 0.3), TAU * k / 24))
    Acc.of("navy", 0.12).put(lathe([(0.0, L1), (LR + 1.2, L1), (LR + 1.2, L1 + 1.0), (LR - 2.0, L1 + 3.5), (4.0, L1 + 5.5), (0.0, L1 + 6.0)], 40))
    Acc.of("gold", 0.0).put(ring(LR + 1.25, 0.2, L1 + 0.6, 64, 4))
    col((0, L0, 0), shape="cyl", r=LR + 0.2, h=L1 + 6.0 - L0)
    # the crown: six blades from the top terrace leaning in to a halo ring, the spire over the cap
    HY, HR = 72.0, 12.0
    for k in range(6):
        th = TAU * k / 6 + 0.25
        fx, fz = at_r(21.5, th)
        tx, tz = at_r(HR, th)
        bot = [(-0.7, -1.6), (0.7, -1.6), (0.7, 1.6), (-0.7, 1.6)]
        top = [(-0.35, -0.6), (0.35, -0.6), (0.35, 0.6), (-0.35, 0.6)]
        # a blade: a tapered slab along the line from foot to top (frustum in its own upright frame, then leaned and turned)
        ln = math.hypot(21.5 - HR, HY - 36.9)
        lean = math.atan2(21.5 - HR, HY - 36.9)
        g = frustum(bot, top, 0.0, ln)
        g = xf(g, (0, 0, 0), (0, 0, lean))           # (leans its top toward -x: inward once turned to theta)
        Acc.of("white", 0.08).put(radial(xf(g, (21.5, 36.9, 0)), th))
        Acc.of("gold", 0.0).put(radial(xf(xf(frustum([(-0.72, -0.2), (0.72, -0.2), (0.72, 0.2), (-0.72, 0.2)], [(-0.4, -0.2), (0.4, -0.2), (0.4, 0.2), (-0.4, 0.2)], 0.0, ln), (0, 0, 1.45), (0, 0, lean)), (21.5, 36.9, 0)), th))
        Acc.of("roof", 0.04).put(radial(box(21.5, 36.6, 0, 3.0, 1.2, 4.0), th))
        mx, mz = at_r((21.5 + HR) / 2, th)
        col((mx, (36.9 + HY) / 2 - ln / 2, mz), shape="box", hx=1.6, hy=ln / 2, hz=0.8, yaw=math.atan2(-math.cos(th), -math.sin(th)), pitch=lean)
    Acc.of("gold", 0.1).put(ring(HR, 0.9, HY, 64, 8))
    Acc.of("amber", 0.0).put(ring(HR, 0.95, HY - 0.3, 64, 4))
    for k in range(8):
        x, z = at_r(HR, TAU * k / 8)
        col((x, HY - 1.0, z), shape="sphere", r=1.2)
    Acc.of("white", 0.06).put(tube([(0, L1 + 5.6, 0), (0, 98.0, 0)], [1.2, 0.3], 8, True))
    for y, rr in ((70.0, 1.0), (78.0, 0.8), (86.0, 0.6)):
        Acc.of("gold", 0.0).put(ring(rr + 0.1, 0.16, y, 16, 4))
    for k in range(4):  # four struts from the halo to the spire
        x, z = at_r(HR - 0.6, TAU * k / 4 + 0.6)
        Acc.of("white", 0.03).put(path_tube([(x, HY, z), (0, 80.0, 0)], 0.22, 6))
    blinker((0, 98.6, 0), 0.9)
    col((0, L1 + 6.0, 0), shape="cyl", r=1.2, h=98.0 - L1 - 6.0)
    # the inclined elevators either side of the prow: glass shafts on the terraces' edges, a cabin in each
    for s in (-1, 1):
        th = MAIN_A + s * 0.42
        foot, head = (66.0, 0.0), (30.0, 36.0)  # (3.5 m out from the line of the tiers' edges, clear of their rails)
        dr, dy = head[0] - foot[0], head[1] - foot[1]
        ln = math.hypot(dr, dy)
        ang = math.atan2(-dr, dy)                      # (leans toward the core)
        g = box(0, ln / 2, 0, 3.4, ln, 3.2)
        Acc.of("glass", 0.0).put(radial(xf(xf(g, (0, 0, 0), (0, 0, ang)), (foot[0], foot[1], 0)), th))
        for sz in (-1, 1):
            for sx in (-1, 1):
                Acc.of("white", 0.04).put(radial(xf(xf(box(sx * 1.7, ln / 2, sz * 1.6, 0.25, ln, 0.25), (0, 0, 0), (0, 0, ang)), (foot[0], foot[1], 0)), th))
        for t in [k / 8 for k in range(9)]:
            Acc.of("white", 0.03).put(radial(xf(xf(box(0, ln * t, 0, 3.6, 0.25, 3.4), (0, 0, 0), (0, 0, ang)), (foot[0], foot[1], 0)), th))
        tt = 0.35 if s < 0 else 0.7
        Acc.of("window", 0.0).put(radial(xf(xf(box(0, ln * tt, 0, 3.2, 2.6, 3.0), (0, 0, 0), (0, 0, ang)), (foot[0], foot[1], 0)), th))  # (the cabin, on the shaft's rails)
        Acc.of("roof", 0.04).put(radial(box(foot[0] + 1.0, 1.0, 0, 5.0, 2.0, 5.0), th))
        Acc.of("roof", 0.04).put(radial(box((head[0] + 23.8) / 2, 36.0 - 0.2, 0, head[0] - 23.8 + 1.0, 0.4, 3.4), th))  # (the bridge to the top deck)
        for sz in (-1, 1):
            Acc.of("alu", 0.02).put(radial(path_tube([(23.8, 37.3, sz * 1.6), (head[0] + 0.5, 37.3, sz * 1.6)], 0.06, 4), th))
            for xx in (24.0, (24.0 + head[0]) / 2, head[0] + 0.4):
                Acc.of("alu", 0.0).put(radial(cyl(xx, 36.65, sz * 1.6, 0.05, 1.3, 4), th))
        mx, mz = at_r(foot[0] + dr / 2, th)
        col((mx, dy / 2 - ln / 2, mz), shape="box", hx=1.8, hy=ln / 2, hz=1.8, yaw=math.atan2(-math.cos(th), -math.sin(th)), pitch=-ang)
    # the prow: a glazed wedge out of the first two tiers toward the job terminal, its ridge falling from 16 m to 10
    th = MAIN_A
    pf = [(-9.0, 0.0), (9.0, 0.0), (9.0, 0.0), (-9.0, 0.0)]
    prow = lambda x0, x1, h0, h1, w: ([(x0, 0, -w), (x1, 0, -w), (x1, 0, w), (x0, 0, w), (x0, h0, -w), (x1, h1, -w), (x1, h1, w), (x0, h0, w)], [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])
    Acc.of("glass", 0.0).put(radial(prow(44.0, 61.0, 17.0, 10.0, 9.0), th))
    Acc.of("roof", 0.0).put(radial(prow(44.0, 59.0, 16.0, 9.0, 8.0), th))
    fr = Acc.of("navy", 0.04)
    for zz in [-9 + 2.25 * k for k in range(9)]:  # (the verticals stop at the transom over the doors)
        fr.put(radial(path_tube([(44.0, 17.0, zz), (61.0, 10.0, zz), (61.0, 4.2 if abs(zz) < 7 else 0.0, zz)], 0.18, 4), th))
    fr.put(radial(box(61.0, 4.2, 0, 0.36, 0.36, 18.0), th))
    for xx in (48.0, 52.0, 56.0):
        h = 17.0 - (xx - 44.0) * 7.0 / 17.0
        fr.put(radial(box(xx, h, 0, 0.3, 0.3, 18.2), th))
    for zz in (-4.5, 0, 4.5):
        Acc.of("door", 0.0).put(radial(box(61.06, 1.9, zz, 0.1, 3.4, 3.4), th))
        Acc.of("lamp", 0.0).put(radial(box(61.03, 3.92, zz, 0.06, 0.2, 3.2), th))  # (on the glass, under the transom)
    Acc.of("gold", 0.0).put(radial(path_tube([(44.0, 17.1, -9.1), (61.1, 10.1, -9.1), (61.1, 10.1, 9.1), (44.0, 17.1, 9.1)], 0.22, 4), th))
    x, z = at_r(56.5, th)
    col((x, 0, z), shape="box", hx=9.2, hy=5.0, hz=4.6, yaw=math.atan2(math.cos(th), math.sin(th)))
    # the six docking lobbies
    for th in DOCK_A:
        lobby_r(th, 51.0, DOCK_R, 10.0, 7.6)
    return end()


# =====================================================================================================================
# WALL B: "the Earthwork". An armoured wall with a regolith berm banked against its outside, so from the plain it reads as one
# long grey earthwork with a crenellated parapet along its crest; buttress pilasters and a lit band inside. Eight arrowhead
# bastions jut from it like a star fort's, a gun on each point; each gate is one gatehouse, two massive piers and a lintel
# block over a 50 m opening, a gun on each pier.
# =====================================================================================================================
def build_wall_b():
    begin("ilmb_wall_b", draft="b")
    R = WALL_R
    gaps = spans(GATES, 0.105)
    for a0, a1 in gaps:
        Acc.of("panel", 0.18).put(ring_sector([(R - 3.0, 0), (R, 0), (R, 10.6), (R - 3.0, 10.6)], a0, a1))
        Acc.of("regolith", 0.12).put(ring_sector([(R - 0.2, 0), (R + 15.0, 0), (R + 1.0, 9.4), (R - 0.2, 9.4)], a0, a1))
        Acc.of("panel2", 0.0).put(ring_sector([(R + 7.4, 4.4), (R + 7.6, 4.4), (R + 6.0, 5.5), (R + 5.8, 5.5)], a0, a1))
        Acc.of("pave", 0.0).put(ring_sector([(R - 2.9, 10.6), (R - 0.1, 10.6), (R - 0.1, 10.72), (R - 2.9, 10.72)], a0, a1))
        Acc.of("lamp", 0.0).put(ring_sector([(R - 3.06, 6.0), (R - 3.0, 6.0), (R - 3.0, 6.4), (R - 3.06, 6.4)], a0, a1))
        Acc.of("gold", 0.0).put(ring_sector([(R - 3.08, 9.4), (R - 3.0, 9.4), (R - 3.0, 9.8), (R - 3.08, 9.8)], a0, a1))
        Acc.of("panel2", 0.04).put(ring_sector([(R - 3.0, 10.6), (R - 2.5, 10.6), (R - 2.5, 11.4), (R - 3.0, 11.4)], a0, a1))
        # crenellations: merlons along the crest every 1.6 degrees (as long as half a step)
        n = int((a1 - a0) / math.radians(1.6))
        for k in range(n):
            th = a0 + (a1 - a0) * (k + 0.5) / n
            Acc.of("panel", 0.05).put(radial(box(R - 0.45, 11.6, 0, 0.9, 2.0, (a1 - a0) / n * R * 0.55), th))
            if k % 2 == 0:
                Acc.of("gold", 0.0).put(radial(box(R - 0.45, 12.65, 0, 0.95, 0.12, (a1 - a0) / n * R * 0.56), th))
        # inner pilasters every 3 degrees
        m = int((a1 - a0) / math.radians(3))
        for k in range(1, m):
            th = a0 + (a1 - a0) * k / m
            Acc.of("panel2", 0.05).put(radial(box(R - 3.4, 5.0, 0, 0.8, 10.0, 1.6), th))
            if k % 4 == 0:
                Acc.of("redlamp", 0.0).put(radial(box(R + 0.14, 10.2, 0, 0.3, 0.3, 0.8), th))  # (on the wall's face over the berm)
        col_ring(R - 3.0, R + 1.0, 0.0, 12.6, a0, a1, math.radians(3))
        # the berm's slope, so it holds the runner as it is drawn
        nb = int(math.ceil((a1 - a0) / math.radians(3)))
        for k in range(nb):
            th = a0 + (a1 - a0) * (k + 0.5) / nb
            dr, dy = 14.0, 9.4
            ln = math.hypot(dr, dy)
            x, z = at_r(R + 1.0 + dr / 2, th)
            col((x, dy / 2 - 0.5 - 0.0, z), shape="box", hx=(R + 8.0) * math.sin((a1 - a0) / nb / 2) + 0.2, hy=0.5, hz=ln / 2, yaw=math.atan2(math.cos(th), math.sin(th)), pitch=-math.atan2(dy, dr))
    # the arrowhead bastions: a flank back to the wall either side, two faces to the point; battered, a parapet, the gun on the point
    for b in BASTIONS:
        def P(u, v):
            return (math.cos(b) * (R + u) - math.sin(b) * v, math.sin(b) * (R + u) + math.cos(b) * v)
        plan = [(-1.0, -16.0), (10.0, -16.0), (24.0, 0.0), (10.0, 16.0), (-1.0, 16.0)]
        topp = [(-1.0, -15.0), (9.6, -15.0), (22.6, 0.0), (9.6, 15.0), (-1.0, 15.0)]
        Acc.of("panel", 0.18).put(frustum([P(u, v) for u, v in plan], [P(u, v) for u, v in topp], 0.0, 11.0))
        Acc.of("pave", 0.0).put(frustum([P(u, v) for u, v in topp], [P(u, v) for u, v in topp], 11.0, 11.12))
        t = 7.2 / 11.0  # (a gold band round the faces at 7.2 m, on the batter)
        band = [((1 - t) * a[0] + t * b2[0], (1 - t) * a[1] + t * b2[1]) for a, b2 in zip(plan, topp)][1:4]
        pts = []
        for u, v in band:
            x, z = P(u + 0.12, v * 1.006)
            pts.append((x, 7.2, z))
        Acc.of("gold", 0.0).put(path_tube(pts, 0.2, 4))
        edge = [P(u, v) for u, v in [(0.0, -14.6), (9.4, -14.6), (22.0, 0.0), (9.4, 14.6), (0.0, 14.6)]]
        Acc.of("panel", 0.04).put(path_tube([(x, 11.55, z) for x, z in edge], 0.45, 4))
        gx, gz = P(15.0, 0.0)
        Acc.of("roof", 0.06).put(xf(cylinder(2.4, 2.7, 2.0, 12)[:2], (gx, 12.0, gz)))
        Acc.of("gold", 0.0).put(xf(cylinder(2.5, 2.5, 0.3, 12)[:2], (gx, 12.85, gz)))
        Acc.of("amber", 0.0).put(ring(2.85, 0.14, 11.25, 24, 4, t=(gx, 0, gz)))
        mx, mz = P(3.0, 0.0)
        Acc.of("dark", 0.03).put(cyl(mx, 12.6, mz, 0.16, 3.0, 6))
        blinker((mx, 14.5, mz), 0.6)
        for u, v, hl in ((4.5, -16.0, 11.0), (4.5, 16.0, 11.0)):
            pass
        cx, cz = P(10.0, 0.0)
        col((cx, 0.0, cz), shape="box", hx=15.5, hy=5.9, hz=6.0, yaw=math.atan2(math.cos(b), math.sin(b)))
        tx, tz = P(18.0, 0.0)
        col((tx, 0.0, tz), shape="box", hx=6.0, hy=5.9, hz=3.5, yaw=math.atan2(math.cos(b), math.sin(b)))
        col((gx, 11.0, gz), shape="cyl", r=2.7, h=3.0)
        mount((gx, 13.0, gz))
    # the gatehouses: two piers and the lintel block between, the opening framed in hazard stripes and lamps
    for g in GATES:
        piers = []
        for s in (-1, 1):
            a = g + s * 0.13
            def Q(u, v, a=a):
                return (math.cos(a) * (R + u) - math.sin(a) * v, math.sin(a) * (R + u) + math.cos(a) * v)
            base = [Q(u, v) for u, v in [(-6.0, -7.0), (12.0, -7.0), (12.0, 7.0), (-6.0, 7.0)]]
            topq = [Q(u, v) for u, v in [(-5.6, -6.6), (11.0, -6.6), (11.0, 6.6), (-5.6, 6.6)]]
            Acc.of("panel", 0.2).put(frustum(base, topq, 0.0, 21.0))
            Acc.of("navy", 0.06).put(frustum(topq, [Q(u, v) for u, v in [(-5.8, -6.8), (11.2, -6.8), (11.2, 6.8), (-5.8, 6.8)]], 21.0, 22.2))
            Acc.of("gold", 0.0).put(frustum([Q(u, v) for u, v in [(-5.75, -6.75), (11.15, -6.75), (11.15, 6.75), (-5.75, 6.75)]], [Q(u, v) for u, v in [(-5.75, -6.75), (11.15, -6.75), (11.15, 6.75), (-5.75, 6.75)]], 16.0, 16.5))
            for vv in (-3.0, 3.0):
                wx, wz = Q(12.0 - 12.0 / 21.0 + 0.05, vv)
                Acc.of("window", 0.0).put(xf(box(0, 0, 0, 0.12, 2.4, 0.8), (wx, 12.0, wz), (0, -a, 0)))
            gx, gz = Q(3.0, 0.0)
            Acc.of("roof", 0.06).put(xf(cylinder(2.4, 2.7, 1.4, 12)[:2], (gx, 22.9, gz)))
            cx, cz = Q(3.0, 0.0)
            col((cx, 0.0, cz), shape="box", hx=7.0, hy=11.1, hz=9.0, yaw=math.atan2(math.cos(a), math.sin(a)))
            mount((gx, 23.6, gz))
            piers.append(Q(3.0, -s * 7.0))
        (ax, az), (bx, bz) = piers
        mx, mz = (ax + bx) / 2, (az + bz) / 2
        span = math.hypot(bx - ax, bz - az)
        yaw = math.atan2(bx - ax, bz - az)
        brot = lambda gg: xf(gg, (mx, 0, mz), (0, yaw, 0))
        Acc.of("panel", 0.16).put(brot(box(0, 17.0, 0, 16.0, 8.0, span + 0.4)))
        Acc.of("navy", 0.06).put(brot(box(0, 21.6, 0, 16.4, 1.2, span + 0.8)))
        for i in range(int(span / 2.5)):
            z = -span / 2 + 1.25 + i * 2.5
            Acc.of("hazard" if i % 2 else "dark", 0.0).put(brot(box(8.06, 13.4, z, 0.1, 0.8, 2.5)))
        z = -span / 2 + 3
        while z < span / 2 - 2:
            Acc.of("lamp", 0.0).put(brot(box(0, 12.98, z, 10.0, 0.06, 0.8)))
            z += 5
        Acc.of("cyan", 0.0).put(brot(box(-8.06, 17.0, 0, 0.1, 0.4, span)))
        col((mx, 13.0, mz), shape="box", hx=8.1, hy=4.6, hz=span / 2, yaw=yaw)
    return end()


# =====================================================================================================================
# The base's other pieces, each in its own frame (origin on the ground at its place, +z its front; src/ilmbCore.js puts each
# where the code-built one stood).
# =====================================================================================================================
def tapered(a, b, ra, rb, seg=8):
    return tube([a, b], [ra, rb], seg, True)


def build_terminal():
    """The job board: a navy console under a curved aluminium canopy, its main screen and two angled side screens (the game
    draws the screens and the holo ring over the canopy: settlements.jobTerminal), a lit plinth, queue rails in front."""
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
        Acc.of("dark", 0.0).put(xf(box(0, 0, 0.6, 4.3, 5.5, 0.04), (sd * 7.4, 5.4, 0), rot))
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


def build_repair():
    """The repair bay: an arched hangar 34 m long on a slab, orange skin on aluminium ribs, the door end open on a lit bay with
    a bridge crane, a gold arch round the door, hazard stripes on the apron, an office annex on its side."""
    begin("ilmb_repair")
    r, L = 16.0, 34.0
    Acc.of("concrete", 0.05).put(box(0, 0.25, 0, 36, 0.5, 36))
    Acc.of("orange", 0.25).put(xf(cylinder_arc(r, r, L, 28, math.pi / 2, math.pi)[:2], (0, 0.5, 0), (math.pi / 2, 0, 0)))
    for k in range(8):
        z = -L / 2 + 0.6 + k * (L - 1.2) / 7
        arc = [(math.cos(a) * (r + 0.12), 0.5 + math.sin(a) * (r + 0.12), z) for a in [math.pi * j / 20 for j in range(21)]]
        Acc.of("alu", 0.04).put(path_tube(arc, 0.35, 5))
    Acc.of("light", 0.0).put(xf(circle_disc(r, 28), (0, 0.5, -L / 2), (0, math.pi, 0)))
    Acc.of("dark", 0.0).put(xf(circle_disc(r - 0.4, 28), (0, 0.5, L / 2 - 6.0)))
    arc = [(math.cos(a) * (r + 0.3), 0.5 + math.sin(a) * (r + 0.3), L / 2) for a in [math.pi * j / 24 for j in range(25)]]
    Acc.of("gold", 0.06).put(path_tube(arc, 0.6, 6))
    # inside the open end: a lit floor, the bridge crane on its rails, work lamps
    Acc.of("pave", 0.0).put(box(0, 0.52, L / 2 - 3.0, 2 * r - 4, 0.04, 6.0))
    for sd in (-1, 1):
        Acc.of("steel", 0.04).put(box(sd * 11.0, 11.0, L / 2 - 3.0, 0.6, 0.8, 6.0))
    Acc.of("hazard", 0.04).put(box(0, 11.6, L / 2 - 2.0, 22.6, 0.9, 1.0))
    Acc.of("dark", 0.02).put(box(0, 10.6, L / 2 - 2.0, 1.4, 1.1, 1.4))
    Acc.of("dark", 0.0).put(cyl(0, 7.5, L / 2 - 2.0, 0.05, 5.0, 4))
    Acc.of("gold", 0.02).put(box(0, 4.8, L / 2 - 2.0, 1.0, 0.5, 0.6))
    for x in (-8.0, 0.0, 8.0):  # (work lamps under the bridge)
        Acc.of("lamp", 0.0).put(box(x, 11.09, L / 2 - 2.0, 2.4, 0.12, 0.6))
    for sd in (-1, 1):  # (the rails hung from the roof)
        for zz in (L / 2 - 5.5, L / 2 - 0.5):
            Acc.of("steel", 0.0).put(B((sd * 11.0, 11.3, zz), (sd * 11.0, 12.6, zz), 0.08, 4, True))
    for i in range(-3, 4):
        Acc.of("hazard" if i % 2 else "dark", 0.0).put(box(i * 3.0, 0.52, L / 2 + 4.0, 1.6, 0.04, 6.0))
    for sd in (-1, 1):  # (beacons on the door's arch)
        Acc.of("amber", 0.0).put(box(sd * (r + 0.3) * math.cos(0.44), 0.5 + (r + 0.3) * math.sin(0.44), L / 2 + 0.75, 0.45, 0.45, 0.45))
    # the office annex on the +x side
    Acc.of("cream", 0.08).put(box(r + 2.6, 2.4, -4.0, 5.0, 4.8, 12.0))
    Acc.of("navy", 0.04).put(box(r + 2.6, 5.0, -4.0, 5.6, 0.4, 12.6))
    for zz in (-8.0, -4.0, 0.0):
        Acc.of("window", 0.0).put(box(r + 5.12, 2.8, zz, 0.06, 1.2, 2.4))
    Acc.of("door", 0.0).put(box(r + 2.6, 1.6, 2.04, 1.4, 2.6, 0.06))
    col((0, 0, 0), shape="box", hx=18.0, hy=0.25, hz=18.0, yaw=0.0)
    col((0, 0.5, 0), shape="hcyl", r=r + 0.2, len=L, yaw=0.0)
    col((r + 2.6, 0, -4.0), shape="box", hx=2.8, hy=2.6, hz=6.3, yaw=0.0)
    return end()


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


def build_gantry():
    """The launch gantry by the arrivals pad: a 54 m red and white lattice umbilical tower on a slab, two swing arms out over
    the pad (-x) with their hinge drums, a lift cage up one face, the mast and beacon on top."""
    begin("ilmb_gantry")
    Acc.of("concrete", 0.06).put(box(0, 0.5, 0, 10, 1.0, 10))
    lattice_tower(Acc.of("red", 0.05), Acc.of("white", 0.02), 54.0, 2.8, 2.8, 12, 0.32)
    for y in (24.0, 40.0):
        Acc.of("roof", 0.06).put(box(-9.4, y + 0.7, 0, 13.0, 1.4, 2.0))
        Acc.of("hazard", 0.0).put(box(-9.4, y + 1.5, 0, 13.0, 0.2, 2.2))
        Acc.of("steel", 0.04).put(cyl(-2.6, y + 0.7, 0, 1.0, 2.6, 12))
        Acc.of("gold", 0.0).put(cyl(-2.6, y + 2.05, 0, 1.05, 0.1, 12))
        Acc.of("dark", 0.02).put(B((-15.9, y + 0.7, 0), (-15.9, y - 1.6, 0), 0.25, 6, True))
        col((-9.4, y, 0), shape="box", hx=6.5, hy=0.8, hz=1.0, yaw=math.pi / 2)
    Acc.of("glass", 0.0).put(box(3.6, 27.0, 0, 1.6, 54.0, 1.8))
    Acc.of("window", 0.0).put(box(3.6, 31.0, 0, 1.4, 2.4, 1.6))
    Acc.of("roof", 0.05).put(box(0, 54.3, 0, 6.6, 0.6, 6.6))
    Acc.of("dark", 0.03).put(cyl(0, 58.6, 0, 0.3, 8.0, 6, rt=0.2))
    blinker((0, 62.9, 0), 0.5)
    col((0, 0, 0), shape="box", hx=5.0, hy=0.5, hz=5.0, yaw=0.0)
    col((0, 1.0, 0), shape="box", hx=3.1, hy=26.9, hz=3.1, yaw=0.0)
    return end()


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
build_core_b()
build_wall_b()
build_terminal()
build_repair()
build_gantry()
build_horton("horton_red", "red")
build_horton("horton_blue", "blue")
build_outdome("dome_pink", 16.0, "pink")
build_outdome("dome_gold", 14.0, "gold")
build_barracks()
build_depot()
build_mast()
build_pylon()

_clash = [o.name for o in C.objects if o.name[-4:-3] == "." and o.name[-3:].isdigit()]
assert not _clash, f"object names must be unique, Blender renamed {_clash[:3]}"
print("built", len(C.objects), "objects")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
