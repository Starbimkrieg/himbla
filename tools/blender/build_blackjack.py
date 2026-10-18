# Blackjack table builder for Blender (4.2+ / 5.x): the Lucky Crater Casino's gilded blackjack table and its chip, exported to src/assets/blackjack.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_blackjack.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_blackjack.py
#
# Two roots, authored in three.js axes (x right, y up, +z toward the player) with the origin on the floor at the middle of the table's flat (dealer's) edge,
# each mesh with ONE material named after a slot (see BJ_TOON / BJ_GLOW in src/models.js):
#   bj_table   a half-disc table, R = 3.4 m (the felt's radius): a plum lacquer cabinet with a gold girdle and eight cream suit panels between gold pilasters,
#              a padded leather rail on gold studs with a cyan line under it, the dealer's back counter (2 m deep, a pennant-jewel trim along its front) with a brass
#              chip rack let into the shelf, a gold and plum card shoe with a lit mouth, a gold-rimmed discard well, and the player's stool at z = 4.3.
#              The felt is a plane the game lays at y = 1.155 (its print is drawn in casinoWorld.js feltTex, to the layout below). Pivots (empties with a `role`):
#              felt (extras w, h: the plane's size), shoe (where a dealt card leaves the shoe), rack (where chips come from and go back to), discard (where used
#              cards go) and stool.
#   bj_chip    one chip, 0.16 m by 0.07 m, standing on y = 0: a 14-sided body in the slot `chip` (the game tints it to the stake's tier), seven cream edge stripes,
#              a gold ring and a cream diamond on the top face.
# The rack's chips use their own fixed slots (chipwhite ... chipviolet) and the neon (`cyan`, `pink`) is glow.
#
# THE LAYOUT. The game lays cards, chips and the felt's lettering by table-local coordinates (casinoGames.js layoutCards / chipStack, casinoWorld.js feltTex), and nothing
# of this model that stands above the felt may reach into those places: ZONES below is the list (the dealer's and the player's card rows with room for eleven cards, the
# bet, double and payout stacks, and the band of lettering along the rim), and audit() stops the build if a part stands within 10 cm of one.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_blackjack.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("BLACKJACK_OUT") or os.path.join(REPO, "src", "assets", "blackjack.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Blackjack export ->", OUT)
COLL = "MoonBlackjack"

# preview colours (the game swaps in its own materials)
SLOT_COLORS = {
    "plum": (0.2, 0.08, 0.35), "plum2": (0.3, 0.12, 0.5), "gold": (1.0, 0.82, 0.25), "cream": (0.97, 0.94, 0.86), "dark": (0.1, 0.07, 0.16),
    "leather": (0.42, 0.1, 0.28), "brass": (0.78, 0.6, 0.2), "cyan": (0.18, 0.9, 1.0), "pink": (1.0, 0.18, 0.53), "chip": (0.17, 0.9, 1.0),
    "chipwhite": (1.0, 0.96, 0.88), "chipred": (0.86, 0.13, 0.2), "chipcyan": (0.18, 0.9, 1.0), "chipgreen": (0.3, 0.8, 0.3), "chipviolet": (0.78, 0.49, 1.0), "suitred": (1.0, 0.16, 0.26), "suitcream": (1.0, 0.96, 0.88),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)
PI = math.pi
R = 3.4          # the felt's radius (BJ.R in casinoWorld.js)
SURF = 1.155     # the felt's height: cards lie 1.5 cm over it, chips stand on it
RAIL_R = 3.46


class Acc:
    """Boxes, cylinders, spheres and tubes that share a material slot and a parent, merged into one mesh when flushed."""
    all = []

    def __init__(self, name, slot, parent, ink=0.03):
        self.name, self.slot, self.parent, self.ink, self.geos = name, slot, parent, ink, []
        Acc.all.append(self)

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot)); return self

    def cylc(self, cx, cy, cz, r, h, seg=12, rt=None, rot=(0, 0, 0)):
        self.geos.append(xf(cylinder(r if rt is None else rt, r, h, seg)[:2], (cx, cy, cz), rot)); return self

    def ball(self, cx, cy, cz, r, w=8, h=6, s=(1, 1, 1)):
        self.geos.append(xf(sphere(r, w, h)[:2], (cx, cy, cz), (0, 0, 0), s)); return self

    def tube(self, a, b, r, seg=6):
        self.geos.append(beam(a, b, r, seg)); return self

    def path(self, pts, r, seg=6):
        self.geos.append(tube(pts, r if isinstance(r, (list, tuple)) else [r] * len(pts), seg)); return self

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1)):
        self.geos.append(xf(geo[:2], t, rot, s)); return self

    def flush(self):
        if self.geos:
            mesh(self.name, join(self.geos), self.slot, self.parent, self.ink)
        self.geos = []


def flush_all():
    for a in Acc.all:
        a.flush()
    Acc.all = []


def halfdisc(r, z0=0.0, n=40):
    """The outline (x, z) of a half disc: the flat edge along z = z0, bulging toward +z."""
    return [(r * math.cos(PI * i / n), z0 + r * math.sin(PI * i / n)) for i in range(n + 1)]


def slab(A, r, y0, h, back=0.0, n=40):
    """A half-disc slab from y0 to y0 + h; a rectangle `back` deep is added behind the flat edge."""
    pts = halfdisc(r, 0.0, n)
    if back:
        pts = pts + [(-r, -back), (r, -back)]
    A.add(extrude(pts, h, "y"), (0, y0 + h / 2, 0))


def arc_tube(A, rad, y, r, a0=0.0, a1=PI, n=40, seg=5):
    A.path([(rad * math.cos(a0 + (a1 - a0) * i / n), y, rad * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)], r, seg)


exec(open(os.path.join(REPO, "tools", "blender", "suits.py"), encoding="utf-8").read(), globals())

# ---- the table ----
table = pivot("bj_table", (0, 0, 0), None)

# the body: a dark plinth, a plum lacquer cabinet with a gold girdle, a top slab; behind the flat edge the dealer's shelf
A = Acc("plinth", "dark", table, 0.03)
slab(A, 3.3, 0.0, 0.1, 0.5)
A.flush()
A = Acc("cabinet", "plum", table, 0.05)
slab(A, 3.2, 0.1, 0.9, 0.42)
A.flush()
A = Acc("girdle", "gold", table, 0.03)
slab(A, 3.28, 0.99, 0.07, 0.46)
slab(A, 3.26, 0.16, 0.03, 0.44)
A.flush()
A = Acc("topSlab", "plum2", table, 0.04)
slab(A, 3.42, 1.06, 0.08, 0.52)
A.flush()
A = Acc("feltBed", "dark", table, 0.0)         # (the field the game's felt plane lies on, 7 mm under it)
slab(A, 3.4, 1.14, 0.008, 0.0)
A.flush()

# the padded rail: a leather armrest round the curved edge on a gold base with studs on its face, and a cyan line under it
A = Acc("railLeather", "leather", table, 0.04)
A.path([(RAIL_R * math.cos(a), 1.255, RAIL_R * math.sin(a)) for a in [PI * i / 40 for i in range(41)]], [0.12] * 41, 8)
A.flush()
A = Acc("railGold", "gold", table, 0.0)
A.path([(RAIL_R * math.cos(a), 1.125, RAIL_R * math.sin(a)) for a in [PI * i / 40 for i in range(41)]], [0.05] * 41, 5)
for i in range(30):
    a = PI * (i + 0.5) / 30
    A.ball((RAIL_R + 0.1) * math.cos(a), 1.255, (RAIL_R + 0.1) * math.sin(a), 0.028, 6, 4)
A.flush()
A = Acc("railGlow", "cyan", table, 0.0)
arc_tube(A, 3.285, 1.035, 0.012, 0.0, PI, 48, 4)
A.flush()

# the apron: eight recessed panels with the four suits (the prize counter's: tools/blender/suits.py), between gold pilasters
AF = Acc("apronFrames", "brass", table, 0.0)
AP = Acc("apronPanels", "dark", table, 0.0)
AR = Acc("apronRed", "suitred", table, 0.012)
AC = Acc("apronCream", "suitcream", table, 0.012)
A3 = Acc("apronPilasters", "gold", table, 0.0)
for i in range(8):
    a = PI * (i + 0.5) / 8
    suit_panel(AF, AP, AR, AC, i % 4, (3.2 * math.cos(a), 0.56, 3.2 * math.sin(a)), PI / 2 - a, 0.9, 0.66, 0.34)
for i in range(9):
    a = PI * i / 8
    A3.add(cuboid(0.1, 0.84, 0.07), (3.2 * math.cos(a), 0.58, 3.2 * math.sin(a)), (0, PI / 2 - a, 0))
AF.flush(); AP.flush(); AR.flush(); AC.flush(); A3.flush()

# the dealer's side: a brass chip rack let into the shelf (behind z = 0.05: clear of the cards), five columns of chips between gold dividers
A = Acc("rackTray", "brass", table, 0.03)
A.boxc(-0.85, 1.145, -0.26, 1.7, 0.03, 0.46)
A.boxc(-0.85, 1.2, -0.5, 1.7, 0.14, 0.04)
for s in (-1, 1):
    A.boxc(-0.85 + s * 0.86, 1.2, -0.26, 0.04, 0.14, 0.46)
A.boxc(-0.85, 1.2, -0.03, 1.7, 0.14, 0.04)
A.flush()
for i, nm in enumerate(["chipwhite", "chipred", "chipcyan", "chipgreen", "chipviolet"]):
    A = Acc("rackChips_" + nm, nm, table, 0.0)
    x = -1.5 + i * 0.34
    for k in range(6):
        A.cylc(x, 1.18 + k * 0.045, -0.26, 0.13, 0.04, 12)
    A.flush()
A = Acc("rackDividers", "gold", table, 0.0)
for i in range(6):
    A.boxc(-1.5 + (i - 0.5) * 0.34, 1.27, -0.26, 0.018, 0.2, 0.3)
A.flush()
# the dealer's back counter: plum with a gold cap and a jewel trim (alternating cyan and pink pennants) along its front
A = Acc("backCounter", "plum", table, 0.04)
A.boxc(0, 0.5, -1.7, 6.2, 1.0, 0.6)
A.flush()
A = Acc("backCap", "gold", table, 0.03)
A.boxc(0, 1.03, -1.7, 6.3, 0.07, 0.7)
A.flush()
for slot, off in (("pink", 0.0), ("cyan", 0.223)):
    A = Acc("jewels_" + slot, slot, table, 0.0)
    for i in range(14):
        A.add(cylinder(0.0, 0.11, 0.3, 3), (-2.9 + i * 0.446 + off, 0.9, -1.36), (PI, 0, 0), (1, 0.4, 1))
    A.flush()

# the shoe: a gold and plum card shoe on the right with a lit mouth at (1.99, 1.51, 0.95), where the game deals from
A = Acc("shoeBody", "plum2", table, 0.03)
A.boxc(2.03, 1.31, 0.62, 0.5, 0.32, 0.7, rot=(0.12, 0, 0))
A.flush()
A = Acc("shoeGold", "gold", table, 0.02)
A.boxc(2.03, 1.47, 0.62, 0.54, 0.03, 0.74, rot=(0.12, 0, 0))
A.boxc(2.03, 1.37, 0.97, 0.54, 0.22, 0.03)
A.boxc(2.03, 1.23, 0.6, 0.56, 0.05, 0.74)
A.flush()
A = Acc("shoeLamp", "cyan", table, 0.0)
A.boxc(2.03, 1.42, 0.99, 0.4, 0.03, 0.02)
A.flush()
A = Acc("shoeCards", "cream", table, 0.0)
A.boxc(2.03, 1.45, 0.58, 0.38, 0.04, 0.5, rot=(0.12, 0, 0))
A.flush()
# the discard well: a gold-rimmed dish let into the felt at the left edge where the used cards go (-2.38, 0.3)
A = Acc("discardRim", "gold", table, 0.02)
A.add(torus(0.34, 0.035, 20, 5), (-2.38, 1.17, 0.3))
A.flush()
A = Acc("discardWell", "dark", table, 0.0)
A.cylc(-2.38, 1.162, 0.3, 0.33, 0.01, 20)
A.flush()

# the player's stool: a leather cushion with gold studs on three gold legs and a foot ring (the stool is at z = 4.3)
A = Acc("stoolSeat", "leather", table, 0.03)
A.cylc(0, 0.9, 4.3, 0.46, 0.14, 18)
A.flush()
A = Acc("stoolGold", "gold", table, 0.02)
A.add(torus(0.47, 0.035, 20, 5), (0, 0.84, 4.3))
for k in range(3):
    a = 2 * PI * k / 3 + 0.4
    A.tube((0.2 * math.sin(a), 0.84, 4.3 + 0.2 * math.cos(a)), (0.34 * math.sin(a), 0.03, 4.3 + 0.34 * math.cos(a)), 0.035, 6)
A.add(torus(0.3, 0.025, 18, 5), (0, 0.38, 4.3))
for k in range(12):
    a = 2 * PI * k / 12
    A.ball(0.4 * math.sin(a), 0.935, 4.3 + 0.4 * math.cos(a), 0.028, 5, 4)
A.flush()

# the game's hooks
pivot("felt", (0, SURF, R / 2), table, role="felt", w=2 * R, h=R)
pivot("shoe", (1.99, 1.51, 0.95), table, role="shoe")
pivot("rack", (-0.85, 1.26, -0.26), table, role="rack")
pivot("discard", (-2.38, 1.3, 0.3), table, role="discard")
pivot("stool", (0, 0, 4.3), table, role="stool")

# ---- the chip ----
chip = pivot("bj_chip", (0, 0, 0), None)
A = Acc("chipBody", "chip", chip, 0.0)
A.cylc(0, 0.035, 0, 0.16, 0.07, 14)
A.flush()
A = Acc("chipEdge", "cream", chip, 0.0)
for i in range(7):
    a = 2 * PI * i / 7
    A.boxc(0.158 * math.sin(a), 0.035, 0.158 * math.cos(a), 0.06, 0.072, 0.014, rot=(0, a, 0))
A.cylc(0, 0.0705, 0, 0.055, 0.003, 4, rot=(0, PI / 4, 0))     # a diamond medallion
A.flush()
A = Acc("chipRing", "gold", chip, 0.0)
A.add(torus(0.115, 0.006, 16, 4), (0, 0.0715, 0))
A.flush()

flush_all()

# ---------------------------------------------------------------------------------------------------------------
# the check: nothing of the table stands over the felt where cards, chips or lettering go
# ---------------------------------------------------------------------------------------------------------------
# table-local (x, z): the dealer's card row and the player's (the red areas the felt prints, with the brackets at their corners), the bet / double / payout stacks,
# and the band of lettering along the rim (two arcs of one line: radius 3.02 to 3.22, angles in degrees from +x)
ZONES = {
    "dealer's cards": ("rect", -1.6, 1.6, 0.26, 0.98),
    "player's cards": ("rect", -1.6, 1.6, 1.39, 2.26),
    "bet and payout stacks": ("rect", -0.6, 0.55, 2.52, 2.9),
    "felt lettering": ("arc", 3.02, 3.22, 36, 144),
}


def zone_gap(zone, x, z):
    """How far (x, z) is outside the zone (0 or less: inside)."""
    if zone[0] == "rect":
        _, x0, x1, z0, z1 = zone
        dx, dz = max(x0 - x, 0, x - x1), max(z0 - z, 0, z - z1)
        if dx == 0 and dz == 0:
            return -min(x - x0, x1 - x, z - z0, z1 - z)
        return math.hypot(dx, dz)
    _, r0, r1, a0, a1 = zone
    r, a = math.hypot(x, z), math.degrees(math.atan2(z, x))
    if a0 <= a <= a1:
        return max(r0 - r, r - r1) if (r < r0 or r > r1) else -min(r - r0, r1 - r)
    best = 1e9
    for ang in (a0, a1):
        ar = math.radians(ang)
        for rr in (r0, r1):
            best = min(best, math.hypot(x - rr * math.cos(ar), z - rr * math.sin(ar)))
        t = x * math.cos(ar) + z * math.sin(ar)
        if r0 <= t <= r1:
            best = min(best, abs(-x * math.sin(ar) + z * math.cos(ar)))
    return best


def audit(tol=0.10, over=0.004):
    dg = bpy.context.evaluated_depsgraph_get()
    worst, bad = {k: 9.0 for k in ZONES}, []
    for o in C.objects:
        if o.type != "MESH" or not o.name or o.parent is None or o.parent.name != "bj_table":
            continue
        e = o.evaluated_get(dg)
        mw = e.matrix_world
        for v in e.to_mesh().vertices:
            w = mw @ v.co
            x, y, z = w.x, w.z, -w.y      # (three.js axes)
            if y <= SURF + over:
                continue
            for k, zn in ZONES.items():
                g = zone_gap(zn, x, z)
                worst[k] = min(worst[k], g)
                if g < tol:
                    bad.append(f"{o.name} is {g * 100:.0f} cm from the {k} at ({x:.2f}, {y:.2f}, {z:.2f})")
    for k, v in worst.items():
        print(f"  nearest part to the {k}: {v * 100:.0f} cm")
    if bad:
        raise RuntimeError("blackjack.glb not exported: " + "; ".join(bad[:6]))
    print("AUDIT ok")


audit()

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
export(OUT, list(C.objects))
