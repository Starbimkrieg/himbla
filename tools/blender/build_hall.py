# Casino hall kit for Blender (4.2+ / 5.x): the Lucky Crater Casino's walls, ceiling, floor inlay, bar, lounge, doors and roof, in the plum lacquer, gold, brass and cream suit
# panels of the Duck Derby, the blackjack table and the Plinko cabinet. One file, src/assets/hall.glb, in three.js axes (x right, y up, +z forward) like the other builders.
# The game is casinoWorld.js (it tiles the wall pieces along the plan's outline, casinoPlan.js) and models.js reads the file (makeHallPart).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_hall.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 tools/blender/build_hall.py
#
# THE WALL. The game builds the wall itself (an extruded band round the plan) and the long horizontal pieces (skirting, girdle, cornice, the neon in its channel, the wall's field of
# damask, the outside's plinth, belt and cornice) as extruded rings that follow the outline, so they meet at a corner with a mitre and never lie on one another. The models below are
# the vertical pieces that stand on that wall at every bay: they never share a plane with a ring (the file's audit_coplanar() checks it).
#   hall_bay0..3    one wall bay 4.5 m wide and 16 m tall, centred on x 0, its back on the wall (z 0), its front toward +z (into the room): half a gold pilaster at each edge (two bays
#                   side by side make a whole one), a lacquer wainscot with a framed cream suit panel (0 spade, 1 heart, 2 diamond, 3 club) and a lozenge each side of it, and a tall arched panel with a
#                   cyan line in it. The game scales one by its x (the run's length over 4.5 m, at most 11% either way) and turns it to face the room.
#   hall_filler     a 1 m wide plain lacquer wainscot, for the runs too short for a bay; the game scales it along x.
#   hall_coffer     one 4.5 m ceiling tile, hung from y 0 down: a gold octagon ring round a brass one, a plum dish, a lit rosette in a brass bezel, spokes and jewels.
#   hall_medallion  the crossing's floor inlay, 17.1 m across, lying on y 0 (the game puts it on the carpet): a gold ring, a plum disc, a brass ring, an eight-point cream star toward the
#                   arms and the four suits between its points.
#   hall_bar        the Chip Bar, r 4.65 with its stools: a plum 16-sided island with a cream suit panel on each face between gold posts, a pink top in a gold rim, a padded leather rail,
#                   a back-bar counter, a gold pillar with a gilded halo and pendant lamps, and eight stools. Pivot `bar_spin` (at the top of the pillar) carries the casino's chip, which turns.
#   hall_sofa       a lounge banquette 3.6 m long, its back on the wall: plum body, red velvet cushions, gold feet.  hall_table: a small round table, gold pedestal, pink top.
#   hall_gate       the grand doors' frame, on the outside of the front wall (its back on the wall's outer face, z 0, front toward +z), the doors' opening 12 m wide and 10 m tall: gold piers,
#                   an architrave, a frieze of five suit panels and a pediment with a gold chip, lamps either side.
#   facade_panel0..3  a framed suit relief for the outside wall, 2.6 x 3.4 m, its back on the wall (z 0, front toward +z).
#   facade_crown    the drum, dome and lantern over the crossing: a plum drum r 16 with 24 gold pilasters and lit windows, a plum dome r 13 with 24 gold ribs, a lantern; its origin at the
#                   drum's foot, its top (the lantern's cap) 20.5 m up, where the game stands the sign's mast.
# Every mesh has ONE material named after a slot (see HALL_TOON / HALL_GLOW in src/models.js); the glow slots are lit.
import bpy, bmesh, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_hall.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("HALL_OUT") or os.path.join(REPO, "src", "assets", "hall.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Hall export ->", OUT)
COLL = "MoonHall"
PI = math.pi


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "plum": "4a1766", "plum2": "6a2a8f", "gold": "ffd23f", "brass": "c79a1f", "cream": "fff4e0", "dark": "1a1030", "velvet": "b3123a", "red": "d7263d", "pink": "ff2e88",
    "suitred": "ff2a4a", "suitcream": "fff4e0", "lamp": "fff6a8", "glowcyan": "2ee6ff", "glowpink": "ff2e88",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)


class Acc:
    all = []

    def __init__(self, name, slot, parent, ink=0.015):
        self.name, self.slot, self.parent, self.ink, self.geos = name, slot, parent, ink, []
        Acc.all.append(self)

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot)); return self

    def box(self, x0, x1, y0, y1, z0, z1):
        return self.boxc((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0)

    def rbc(self, cx, cy, cz, w, h, d, e=0.3, rot=(0, 0, 0)):
        self.geos.append(xf(rbox(w / 2, h / 2, d / 2, e, 14, 8), (cx, cy, cz), rot)); return self

    def cylc(self, cx, cy, cz, r, h, seg=12, rt=None, rot=(0, 0, 0)):
        self.geos.append(xf(cylinder(r if rt is None else rt, r, h, seg)[:2], (cx, cy, cz), rot)); return self

    def ball(self, cx, cy, cz, r, w=10, h=7, s=(1, 1, 1), rot=(0, 0, 0)):
        self.geos.append(xf(sphere(r, w, h)[:2], (cx, cy, cz), rot, s)); return self

    def tor(self, R, r, t=(0, 0, 0), rot=(0, 0, 0), n=24, rs=6, s=(1, 1, 1)):
        self.geos.append(xf(torus(R, r, n, rs), t, rot, s)); return self

    def tube(self, a, b, r, seg=6):
        self.geos.append(beam(a, b, r, seg)); return self

    def path(self, pts, r, seg=6):
        self.geos.append(tube(pts, r if isinstance(r, (list, tuple)) else [r] * len(pts), seg)); return self

    def lath(self, prof, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1), segs=16):
        self.geos.append(xf(lathe(prof, segs), t, rot, s)); return self

    def poly(self, pts, z0, z1, t=(0, 0, 0)):
        """a flat outline [(x, y)] extruded from z0 to z1"""
        self.geos.append(xf(extrude(pts, z1 - z0, "z"), (t[0], t[1], (z0 + z1) / 2 + t[2]))); return self

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1)):
        self.geos.append(xf(geo[:2], t, rot, s)); return self

    def flush(self):
        if self.geos:
            mesh(self.name, join(self.geos), self.slot, self.parent, self.ink)
        self.geos = []


def flush_all():
    for a in Acc.all:
        a.flush()


exec(open(os.path.join(REPO, "tools", "blender", "suits.py"), encoding="utf-8").read(), globals())   # the card-suit panels, shared with the blackjack table, the Duck Derby and the claw


def ring_prof(r0, r1, y0, y1):
    """a closed ring's cross-section, for lathe()"""
    return [(r0, y0), (r1, y0), (r1, y1), (r0, y1), (r0, y0)]


def arch_pts(half, y0, ys, n=14):
    """the outline of an arched panel: flat bottom at y0, straight sides up to the spring line ys, a round head of radius `half`"""
    pts = [(-half, y0), (half, y0), (half, ys)]
    for i in range(1, n):
        a = PI * i / n
        pts.append((half * math.cos(a), ys + half * math.sin(a)))
    pts.append((-half, ys))
    return pts


def arch_line(half, ys, n=14):
    """points along the head and sides of an arch (for a neon line), from bottom left up and over to bottom right"""
    return [(-half, 0.0), (-half, ys)] + [(half * math.cos(PI - PI * i / n), ys + half * math.sin(PI - PI * i / n)) for i in range(1, n)] + [(half, ys), (half, 0.0)]


# =====================================================================================================
# the wall bay
# =====================================================================================================
BAY = 4.5
H = 16.0


def bay(kind):
    root = pivot(f"hall_bay{kind}", (0, 0, 0))
    gold = Acc(f"hall_bay{kind}_gold", "gold", root, 0.015)
    brass = Acc(f"hall_bay{kind}_brass", "brass", root, 0.01)
    plum = Acc(f"hall_bay{kind}_plum", "plum", root, 0.012)
    plum2 = Acc(f"hall_bay{kind}_plum2", "plum2", root, 0.012)
    dark = Acc(f"hall_bay{kind}_dark", "dark", root, 0.0)
    red = Acc(f"hall_bay{kind}_suitred", "suitred", root, 0.0)
    cream = Acc(f"hall_bay{kind}_suitcream", "suitcream", root, 0.0)
    cyan = Acc(f"hall_bay{kind}_cyan", "glowcyan", root, 0.0)
    for s in (-1, 1):                                   # half a pilaster at each edge: plinth, collar, shaft, collar, capital, plate
        plum.box(*sorted((s * 1.94, s * 2.25)), 0.0, 0.55, 0.0, 0.26)
        brass.box(*sorted((s * 1.96, s * 2.25)), 0.55, 0.70, 0.0, 0.24)
        gold.box(*sorted((s * 2.0, s * 2.25)), 0.70, 12.40, 0.0, 0.18)
        brass.box(*sorted((s * 1.96, s * 2.25)), 12.40, 12.55, 0.0, 0.24)
        brass.box(*sorted((s * 1.92, s * 2.25)), 12.55, 13.0, 0.0, 0.30)
        gold.box(*sorted((s * 1.90, s * 2.25)), 13.0, 13.12, 0.0, 0.34)
    # the lacquer wainscot between the pilasters: a slab, a brass frame, the framed suit panel and a lozenge each side
    plum.box(-1.92, 1.92, 0.30, 1.75, 0.0, 0.10)
    for x0, x1, y0, y1 in ((-1.87, 1.87, 0.35, 0.40), (-1.87, 1.87, 1.65, 1.70), (-1.87, -1.82, 0.40, 1.65), (1.82, 1.87, 0.40, 1.65)):
        brass.box(x0, x1, y0, y1, 0.10, 0.13)
    suit_panel(brass, dark, red, cream, kind, (0, 1.025, 0.10), 0, 1.3, 0.9, 0.62)
    for s in (-1, 1):
        plum2.box(s * 1.3 - 0.45, s * 1.3 + 0.45, 0.58, 1.47, 0.10, 0.115)
        for x0, x1, y0, y1 in ((s * 1.3 - 0.45, s * 1.3 + 0.45, 0.58, 0.61), (s * 1.3 - 0.45, s * 1.3 + 0.45, 1.44, 1.47), (s * 1.3 - 0.45, s * 1.3 - 0.42, 0.61, 1.44), (s * 1.3 + 0.42, s * 1.3 + 0.45, 0.61, 1.44)):
            brass.box(x0, x1, y0, y1, 0.115, 0.14)
    # the tall arched panel: a brass frame (the whole outline), the plum fill in front of it, a cyan line inset
    outer = arch_pts(1.3, 3.2, 9.3)
    brass.poly(outer, 0.04, 0.14)
    plum2.poly(arch_pts(1.2, 3.3, 9.3), 0.05, 0.16)
    cyan.path([(x, 3.55 + y, 0.19) for x, y in arch_line(1.0, 9.3 - 3.55)], 0.05, 6)         # (a 10 cm bead: a 3 cm one dropped out in pieces at a distance)
    # a gold cap over the arch, and a lamp-brass boss either side of its spring line
    for s in (-1, 1):
        brass.ball(s * 1.3, 9.3, 0.17, 0.09, 8, 6)
    return root


for k in range(4):
    bay(k)

# the filler: lacquer wainscot only, 1 m wide
root = pivot("hall_filler", (0, 0, 0))
Acc("hall_filler_plum", "plum", root, 0.012).box(-0.5, 0.5, 0.30, 1.75, 0.0, 0.10)
Acc("hall_filler_brass", "brass", root, 0.01).box(-0.5, 0.5, 1.75, 1.80, 0.0, 0.13)

# =====================================================================================================
# the ceiling tile
# =====================================================================================================
root = pivot("hall_coffer", (0, 0, 0))
gold = Acc("hall_coffer_gold", "gold", root, 0.015)
brass = Acc("hall_coffer_brass", "brass", root, 0.01)
plum2 = Acc("hall_coffer_plum2", "plum2", root, 0.0)
lamp = Acc("hall_coffer_lamp", "lamp", root, 0.0)
gold.lath(ring_prof(1.75, 1.95, -0.18, 0.0), segs=8)                                # the octagon ring (8 sides: the first vertex at +z, so its flat faces the grid)
brass.lath(ring_prof(1.50, 1.60, -0.14, -0.02), segs=8)
plum2.lath([(0, -0.06), (1.75, -0.06), (1.75, -0.03), (0, -0.03)], segs=8)
lamp.lath([(0, -0.12), (0.5, -0.12), (0.5, -0.08), (0, -0.08)], segs=16)             # the rosette
brass.lath(ring_prof(0.5, 0.64, -0.17, -0.06), segs=16)
for i in range(8):                                                                  # spokes and jewels
    a = i * PI / 4
    brass.boxc(math.sin(a) * 1.08, -0.115, math.cos(a) * 1.08, 0.07, 0.05, 0.92, (0, a, 0))
    b = a + PI / 8
    gold.ball(math.sin(b) * 1.2, -0.14, math.cos(b) * 1.2, 0.1, 8, 6)

# =====================================================================================================
# the floor medallion
# =====================================================================================================
root = pivot("hall_medallion", (0, 0, 0))
plum2 = Acc("hall_medallion_plum2", "plum2", root, 0.0)
gold = Acc("hall_medallion_gold", "gold", root, 0.0)
brass = Acc("hall_medallion_brass", "brass", root, 0.0)
cream = Acc("hall_medallion_cream", "cream", root, 0.0)
redf = Acc("hall_medallion_red", "red", root, 0.0)
plum2.lath([(0, 0.0), (8.2, 0.0), (8.2, 0.015), (0, 0.015)], segs=64)
gold.lath(ring_prof(8.2, 8.6, 0.0, 0.04), segs=64)
gold.lath(ring_prof(4.9, 5.05, 0.015, 0.04), segs=64)
brass.lath(ring_prof(6.15, 6.3, 0.015, 0.03), segs=64)
star = []
for i in range(16):                                                                 # eight points: long toward the arms, shorter between them
    a = i * PI / 8
    r = (7.9 if (i // 2) % 2 == 0 else 5.7) if i % 2 == 0 else 2.7
    star.append((math.sin(a) * r, math.cos(a) * r))
gold.add(extrude(star, 0.02, "y"), (0, 0.035, 0))
for i in range(8):                                                                  # the four suits twice, between the points, laid flat with their heads outward
    phi = PI / 8 + i * PI / 4 if i % 2 == 0 else PI / 8 + i * PI / 4
    kind = i % 4
    for g in suit_geos(kind, 0.95, 0.02):
        (redf if kind in (1, 2) else cream).add(g[:2], (math.sin(phi) * 7.0, 0.0165 + 0.01, math.cos(phi) * 7.0), (-PI / 2, phi + PI, 0))

# =====================================================================================================
# the Chip Bar
# =====================================================================================================
root = pivot("hall_bar", (0, 0, 0))
spin = pivot("bar_spin", (0, 6.2, 0), root, role="spin")
plum = Acc("hall_bar_plum", "plum", root, 0.02)
plum2 = Acc("hall_bar_plum2", "plum2", root, 0.015)
gold = Acc("hall_bar_gold", "gold", root, 0.02)
brass = Acc("hall_bar_brass", "brass", root, 0.012)
dark = Acc("hall_bar_dark", "dark", root, 0.02)
pink = Acc("hall_bar_pink", "pink", root, 0.02)
velvet = Acc("hall_bar_velvet", "velvet", root, 0.02)
red = Acc("hall_bar_suitred", "suitred", root, 0.0)
cream = Acc("hall_bar_suitcream", "suitcream", root, 0.0)
lamp = Acc("hall_bar_lamp", "lamp", root, 0.0)
cyan = Acc("hall_bar_cyan", "glowcyan", root, 0.0)
chip_gold = Acc("bar_chip_gold", "gold", spin, 0.02)
chip_pink = Acc("bar_chip_pink", "pink", spin, 0.0)
chip_cream = Acc("bar_chip_cream", "cream", spin, 0.0)
dark.lath(ring_prof(1.9, 3.55, 0.0, 0.15), segs=16)                                # the kick plate
plum.lath(ring_prof(1.9, 3.4, 0.15, 1.05), segs=16)                               # the island: a 16-sided ring (r 3.4 at the corners)
cyan.lath(ring_prof(3.44, 3.47, 0.20, 0.23), segs=16)                             # a cyan line above the kick plate
for i in range(16):
    a = (i + 0.5) * PI / 8
    rf = 3.4 * math.cos(PI / 16)
    suit_panel(brass, dark, red, cream, i % 4, (math.sin(a) * rf, 0.64, math.cos(a) * rf), a, 0.95, 0.7, 0.5)
    b = i * PI / 8
    gold.cylc(math.sin(b) * 3.4, 0.645, math.cos(b) * 3.4, 0.065, 0.79, 8)         # a gold post at each corner
pink.lath(ring_prof(2.0, 3.5, 1.05, 1.12), segs=32)                               # the top
gold.lath(ring_prof(3.5, 3.72, 1.05, 1.14), segs=32)                              # its rim
gold.lath(ring_prof(1.9, 2.0, 1.05, 1.16), segs=32)
velvet.tor(3.88, 0.13, (0, 1.22, 0), n=48, rs=8)                                  # the padded rail, on gold brackets
for i in range(32):
    a = i * PI / 16
    gold.ball(math.sin(a) * 3.88, 1.22 + 0.125, math.cos(a) * 3.88, 0.04, 6, 4)
    if i % 2 == 0:
        gold.cylc(math.sin(a) * 3.8, 1.13, math.cos(a) * 3.8, 0.03, 0.12, 6)
plum2.lath(ring_prof(1.0, 1.9, 0.0, 1.4), segs=16)                                # the back bar: an inner ring with a gold top and a lamp ring
gold.lath(ring_prof(1.0, 1.9, 1.4, 1.48), segs=16)
for i in range(8):
    a = i * PI / 4
    lamp.ball(math.sin(a) * 1.45, 1.62, math.cos(a) * 1.45, 0.11, 8, 6)
    brass.cylc(math.sin(a) * 1.45, 1.52, math.cos(a) * 1.45, 0.025, 0.08, 6)
plum.lath([(0.75, 0.0), (0.75, 0.3), (0.55, 0.45), (0.55, 0.5)], segs=16)           # the pillar: a plum foot, a gold shaft with brass bands
gold.lath([(0.55, 0.5), (0.4, 0.62), (0.4, 4.55), (0.5, 4.68), (0.5, 4.78)], segs=16)
for y in (1.8, 3.1):
    brass.lath(ring_prof(0.4, 0.5, y, y + 0.14), segs=16)
brass.lath(ring_prof(0.45, 0.6, 4.7, 4.86), segs=16)
gold.tor(3.3, 0.09, (0, 5.6, 0), n=48, rs=6)                                      # the halo, hung from six spokes, with pendant lamps
for i in range(6):
    a = i * PI / 3
    brass.tube((0, 4.95, 0), (math.sin(a) * 3.3, 5.6, math.cos(a) * 3.3), 0.035, 6)
for i in range(12):
    a = i * PI / 6
    brass.tube((math.sin(a) * 3.3, 5.55, math.cos(a) * 3.3), (math.sin(a) * 3.3, 5.2, math.cos(a) * 3.3), 0.018, 5)
    lamp.ball(math.sin(a) * 3.3, 5.1, math.cos(a) * 3.3, 0.14, 8, 6)
for i in range(8):                                                               # the stools
    a = PI / 8 + i * PI / 4
    x, z = math.sin(a) * 4.4, math.cos(a) * 4.4
    brass.cylc(x, 0.33, z, 0.05, 0.54, 8)
    gold.cylc(x, 0.03, z, 0.26, 0.06, 12)
    velvet.cylc(x, 0.66, z, 0.23, 0.14, 12)
gold.cylc(0, 5.08, 0, 0.14, 0.44, 12)                                              # a neck above the capital: the chip stands clear of the pillar and of the halo's spokes
# the chip that turns on top (axis horizontal: it stands on edge, turned about y by the game)
chip_gold.lath([(0, -0.1), (0.9, -0.1), (0.96, -0.05), (0.96, 0.05), (0.9, 0.1), (0, 0.1)], rot=(PI / 2, 0, 0), segs=24)
chip_pink.lath([(0, -0.115), (0.62, -0.115), (0.62, 0.115), (0, 0.115)], rot=(PI / 2, 0, 0), segs=24)
for i in range(8):
    a = i * PI / 4
    chip_cream.boxc(math.cos(a) * 0.9, math.sin(a) * 0.9, 0.0, 0.2, 0.16, 0.24, (0, 0, a))
for g in suit_geos(1, 0.62, 0.02):                                               # a heart on each face
    for z in (0.125, -0.125):
        chip_cream.add(g[:2], (0, 0, z), (0, 0 if z > 0 else PI, 0))

# =====================================================================================================
# the lounge: a banquette and a small table
# =====================================================================================================
root = pivot("hall_sofa", (0, 0, 0))
plum = Acc("hall_sofa_plum", "plum", root, 0.02)
velvet = Acc("hall_sofa_velvet", "velvet", root, 0.02)
gold = Acc("hall_sofa_gold", "gold", root, 0.015)
brass = Acc("hall_sofa_brass", "brass", root, 0.01)
plum.box(-1.8, 1.8, 0.14, 0.48, 0.0, 0.9)                                       # the base
plum.box(-1.8, 1.8, 0.48, 1.08, 0.0, 0.24)                                      # the back
for s in (-1, 1):
    plum.box(*sorted((s * 1.8, s * 1.68)), 0.48, 0.78, 0.0, 0.9)                # arms
    for z in (0.12, 0.78):
        gold.ball(s * 1.7, 0.07, z, 0.07, 8, 6)
for i, x in enumerate((-1.1, 0.0, 1.1)):
    velvet.rbc(x, 0.56, 0.58, 1.06, 0.16, 0.62, 0.5)                            # seat cushions
    velvet.rbc(x, 0.84, 0.31, 1.06, 0.46, 0.14, 0.5, (0.12, 0, 0))             # back cushions
brass.box(-1.78, 1.78, 0.46, 0.5, 0.88, 0.92)
root = pivot("hall_table", (0, 0, 0))
gold = Acc("hall_table_gold", "gold", root, 0.015)
pink = Acc("hall_table_pink", "pink", root, 0.015)
gold.lath([(0.3, 0.0), (0.3, 0.04), (0.06, 0.1), (0.06, 0.58)], segs=14)
pink.lath([(0, 0.58), (0.5, 0.58), (0.5, 0.64), (0, 0.64)], segs=20)
gold.lath(ring_prof(0.5, 0.54, 0.58, 0.66), segs=20)

# =====================================================================================================
# the grand doors' frame
# =====================================================================================================
root = pivot("hall_gate", (0, 0, 0))
gold = Acc("hall_gate_gold", "gold", root, 0.02)
brass = Acc("hall_gate_brass", "brass", root, 0.012)
plum = Acc("hall_gate_plum", "plum", root, 0.015)
plum2 = Acc("hall_gate_plum2", "plum2", root, 0.012)
dark = Acc("hall_gate_dark", "dark", root, 0.0)
red = Acc("hall_gate_suitred", "suitred", root, 0.0)
cream = Acc("hall_gate_suitcream", "suitcream", root, 0.0)
lamp = Acc("hall_gate_lamp", "lamp", root, 0.0)
pink = Acc("hall_gate_pink", "glowpink", root, 0.0)
for s in (-1, 1):                                                                # the piers: a plum plinth, a gold shaft, a brass collar and capital
    x0, x1 = sorted((s * 6.03, s * 7.3))
    plum.box(x0 - 0.05, x1 + 0.05, 0.0, 0.8, 0.0, 0.95)
    gold.box(x0, x1, 1.0, 9.2, 0.0, 0.8)
    brass.box(x0 - 0.05, x1 + 0.05, 0.8, 1.0, 0.0, 0.88)
    brass.box(x0 - 0.05, x1 + 0.05, 9.2, 9.6, 0.0, 0.88)
    brass.box(x0 - 0.12, x1 + 0.12, 9.6, 10.0, 0.0, 0.95)
    for y in (3.2, 5.2, 7.2):
        suit_panel(brass, dark, red, cream, int((y - 3.2) / 2) + (0 if s < 0 else 2), (s * 6.65, y, 0.8), 0, 0.8, 1.2, 0.55)
    lamp.ball(s * 7.85, 4.6, 0.35, 0.28, 10, 7)                                    # a lamp on a bracket outside each pier
    brass.tube((s * 7.3, 4.6, 0.25), (s * 7.6, 4.6, 0.35), 0.04, 6)
gold.box(-7.4, 7.4, 10.0, 10.6, 0.0, 0.95)                                       # the architrave
brass.box(-7.5, 7.5, 10.6, 10.75, 0.0, 1.05)
plum.box(-7.3, 7.3, 10.75, 12.25, 0.0, 0.7)                                     # the frieze, with five suit panels
for i in range(5):
    suit_panel(brass, dark, red, cream, i % 4 if i != 4 else 0, (-5.6 + i * 2.8, 11.5, 0.7), 0, 1.7, 1.1, 0.8)
gold.box(-7.6, 7.6, 12.25, 12.6, 0.0, 1.15)                                      # the pediment: a cornice, then the triangle with a gold chip
tri = [(-7.4, 12.6), (7.4, 12.6), (0, 14.7)]
gold.poly(tri, 0.0, 0.8)
plum2.poly([(-6.6, 12.75), (6.6, 12.75), (0, 14.3)], 0.05, 0.85)
gold.lath([(0, -0.1), (0.9, -0.1), (0.96, -0.05), (0.96, 0.05), (0.9, 0.1), (0, 0.1)], t=(0, 13.25, 0.9), rot=(PI / 2, 0, 0), segs=24)
pink.path([(x, y, 0.88) for x, y in ((-6.5, 12.82), (6.5, 12.82), (0, 14.2), (-6.5, 12.82))], 0.025, 5)

# =====================================================================================================
# the outside wall's suit panels
# =====================================================================================================
for k in range(4):
    root = pivot(f"facade_panel{k}", (0, 0, 0))
    gold = Acc(f"facade_panel{k}_gold", "gold", root, 0.02)
    brass = Acc(f"facade_panel{k}_brass", "brass", root, 0.012)
    plum2 = Acc(f"facade_panel{k}_plum2", "plum2", root, 0.012)
    red = Acc(f"facade_panel{k}_suitred", "suitred", root, 0.0)
    cream = Acc(f"facade_panel{k}_suitcream", "suitcream", root, 0.0)
    W, Hh = 2.6, 3.4
    brass.box(-W / 2, W / 2, 6.3 - Hh / 2, 6.3 + Hh / 2, -0.05, 0.12)                 # centred at y 6.3, like the suit and the studs (the game stands it on the wall)
    plum2.box(-W / 2 + 0.14, W / 2 - 0.14, 6.3 - Hh / 2 + 0.14, 6.3 + Hh / 2 - 0.14, -0.04, 0.17)
    for sx in (-1, 1):
        for sy in (-1, 1):
            gold.ball(sx * (W / 2 - 0.05), 6.3 + sy * (Hh / 2 - 0.05), 0.15, 0.11, 8, 6)
    for g in suit_geos(k, 1.9, 0.04):
        (red if k in (1, 2) else cream).add(g[:2], (0, 6.3, 0.17 + 0.02))

# =====================================================================================================
# the drum, dome and lantern
# =====================================================================================================
root = pivot("facade_crown", (0, 0, 0))
plum = Acc("facade_crown_plum", "plum", root, 0.04)
plum2 = Acc("facade_crown_plum2", "plum2", root, 0.04)
gold = Acc("facade_crown_gold", "gold", root, 0.03)
brass = Acc("facade_crown_brass", "brass", root, 0.02)
lamp = Acc("facade_crown_lamp", "lamp", root, 0.0)
glowp = Acc("facade_crown_pink", "glowpink", root, 0.0)
DR, DH, DOME = 16.0, 3.0, 13.0
plum.lath([(0, 0.0), (DR, 0.0), (DR, DH), (0, DH)], segs=48)                     # the drum
gold.lath(ring_prof(DR, DR + 0.5, DH - 0.35, DH), segs=48)                 # its cornice
brass.lath(ring_prof(DR, DR + 0.25, 0.0, 0.4), segs=48)                    # and plinth
glowp.lath(ring_prof(DR + 0.02, DR + 0.08, DH - 0.7, DH - 0.55), segs=48)       # a pink line under the cornice
for i in range(24):                                                              # 24 pilasters and a lit window between each pair
    a = i * PI / 12
    x, z = math.sin(a) * (DR + 0.05), math.cos(a) * (DR + 0.05)
    gold.boxc(x, 1.7, z, 0.55, 2.0, 0.3, (0, a, 0))
    b = a + PI / 24 * 1
    lamp.boxc(math.sin(b + PI / 24) * (DR + 0.03), 1.6, math.cos(b + PI / 24) * (DR + 0.03), 0.9, 1.5, 0.08, (0, b + PI / 24, 0))
rows = []
for i in range(0, 13):
    phi = (PI / 2) * i / 12
    rows.append((DOME * math.cos(phi), DH + DOME * math.sin(phi)))
plum2.lath(rows[:-1] + [(0.0, DH + DOME)], segs=24)                              # the dome
gold.lath(ring_prof(DOME - 0.1, DOME + 0.4, DH, DH + 0.35), segs=48)
for i in range(24):                                                              # 24 gold ribs over it
    a = i * PI / 12
    gold.path([(math.sin(a) * (DOME + 0.1) * math.cos(p), DH + (DOME + 0.1) * math.sin(p), math.cos(a) * (DOME + 0.1) * math.cos(p)) for p in [(PI / 2 * 0.985) * j / 14 for j in range(15)]], 0.14, 6)
TOP = DH + DOME
gold.lath(ring_prof(1.0, 2.2, TOP - 0.1, TOP + 0.5), segs=24)                    # the lantern: a gold base, a plum drum with lit windows, a brass cornice, a gold cap
plum2.lath([(0, TOP + 0.5), (1.6, TOP + 0.5), (1.6, TOP + 2.7), (0, TOP + 2.7)], segs=16)
for i in range(8):
    a = i * PI / 4
    lamp.boxc(math.sin(a) * 1.62, TOP + 1.6, math.cos(a) * 1.62, 0.55, 1.4, 0.08, (0, a, 0))
brass.lath(ring_prof(1.4, 2.0, TOP + 2.7, TOP + 3.0), segs=16)
gold.lath([(1.5, TOP + 3.0), (0.8, TOP + 3.35), (0.5, TOP + 3.7), (0.3, TOP + 4.2)], segs=16)
brass.lath(ring_prof(0.0, 0.3, TOP + 4.2, TOP + 4.5), segs=12)

flush_all()
audit_coplanar(C.objects)

_dg = bpy.context.evaluated_depsgraph_get()
_tris = {}
for _o in C.objects:
    if _o.type != "MESH":
        continue
    _p = _o
    while _p.parent:
        _p = _p.parent
    _tris[_p.name] = _tris.get(_p.name, 0) + sum(len(q.vertices) - 2 for q in _o.evaluated_get(_dg).to_mesh().polygons)
print("built", len(C.objects), "objects; triangles per root:", _tris)
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
