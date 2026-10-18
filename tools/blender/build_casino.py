# Casino props builder for Blender (4.2+ / 5.x): the Lucky Crater Casino's lamp post, fountain, bouncer, chandelier and signs,
# exported to src/assets/casino.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_casino.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_casino.py
#
# Six roots, each authored in three.js axes (x right, y up, +z front) with its origin on the floor (the chandelier and the hung sign at
# their centre), and each with ONE material per mesh named after a slot (see CASINO_TOON / CASINO_GLOW in src/models.js):
#   lamp_post       the boulevard's lamp post, 8.6 m: a footing with a small lamp post of its own beside the base (toward +z, the road side), a
#                   fluted pole with gold bands, two hovering rings (each over a gold lift coil) and a solid glowing lantern on top. The `accent`
#                   slot (the rings, the lantern, the small lamp) is the colour the game picks for the post; the fountain's ring of posts is the
#                   same model scaled down
#   fountain        the plaza's basin, pedestal, bowl, stem with eight spigots and the spinning centrepiece: the chip, or the Meridian
#                   Exchange's dollar sign (`spin` pivots `chip` and `dollar`, extra `kind`; the game builds one). The water is in pivots the game gives
#                   shader materials: `water` (extra `tier` basin or bowl: a disc the game ripples), `curtain` (the sheet falling from the bowl's
#                   lip into the basin) and `streams` (the eight arcs from the spigots into the bowl); the `chip` pivot spins about y
#   bouncer         the door's bouncer: a buff alien in a tux, 2.5 m, arms crossed, no helmet. Pivot `head` (at the neck) turns to watch people
#   chandelier      one of the hall's hanging chandeliers: a gold rose and chain from the ceiling (3.3 m above its centre), and a `spin` pivot
#                   with the crystal tiers and candle lamps that the game turns slowly
#   welcome_sign    the sign hung inside the door, 9.6 m by 2.5 m, on gold chains to the ceiling 6.4 m above its centre; pivot `face` (extras
#                   w, h) is where the game puts the neon text plane
#   wall_sign       the blackjack sign's frame for a wall (7.4 m by 1.95 m, its back flat on the wall), with the same `face` pivot
# Every mesh carries an `ink` property (its outline shell's thickness in metres; 0: none), like the other models.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_casino.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("CASINO_OUT") or os.path.join(REPO, "src", "assets", "casino.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Casino export ->", OUT)
COLL = "MoonCasino"

# preview colours (the game swaps in its own materials)
SLOT_COLORS = {
    "post": (0.16, 0.08, 0.31), "base": (0.23, 0.2, 0.33), "gold": (1.0, 0.82, 0.25), "accent": (1.0, 0.18, 0.53), "dark": (0.09, 0.07, 0.14),
    "plum": (0.2, 0.08, 0.35), "neon": (1.0, 0.18, 0.53), "cream": (0.97, 0.94, 0.86), "creamshade": (0.78, 0.74, 0.68), "floor": (0.5, 0.7, 0.8),
    "chip": (1.0, 0.18, 0.53), "white": (1.0, 0.96, 0.88), "water": (0.25, 0.72, 1.0), "curtain": (0.6, 0.9, 1.0), "stream": (0.7, 0.95, 1.0),
    "skin": (0.62, 0.5, 0.95), "skin2": (0.36, 0.26, 0.76), "suit": (0.09, 0.07, 0.12), "suit2": (0.22, 0.2, 0.3), "shirt": (0.97, 0.94, 0.86),
    "tie": (0.84, 0.15, 0.24), "eye": (1.0, 0.9, 0.2), "tusk": (0.95, 0.92, 0.82), "shoe": (0.05, 0.04, 0.07),
    "crystalA": (1.0, 0.62, 0.86), "crystalB": (0.61, 0.9, 1.0), "bulb": (1.0, 0.96, 0.66),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)
PI = math.pi


class Acc:
    """Boxes, cylinders, spheres and tubes that share a material slot and a parent, merged into one mesh when flushed."""
    all = []

    def __init__(self, name, slot, parent, ink=0.03):
        self.name, self.slot, self.parent, self.ink, self.geos = name, slot, parent, ink, []
        Acc.all.append(self)

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot)); return self

    def cylc(self, cx, cy, cz, r, h, seg=12, axis="y", rt=None, rot=None):
        """A cylinder about its centre (`r` the base radius, `rt` the top's), its axis along x, y or z."""
        g = cylinder(r if rt is None else rt, r, h, seg)[:2]
        rot = rot or {"y": (0, 0, 0), "z": (PI / 2, 0, 0), "x": (0, 0, PI / 2)}[axis]
        self.geos.append(xf(g, (cx, cy, cz), rot)); return self

    def ball(self, cx, cy, cz, r, w=8, h=6, s=(1, 1, 1), rot=(0, 0, 0)):
        self.geos.append(xf(sphere(r, w, h)[:2], (cx, cy, cz), rot, s)); return self

    def rb(self, cx, cy, cz, sx, sy, sz, e=0.25, rot=(0, 0, 0), nu=14, nv=8):
        """A rounded box (a superquadric) with half-sizes sx, sy, sz."""
        self.geos.append(xf(rbox(sx, sy, sz, e, nu, nv), (cx, cy, cz), rot)); return self

    def tube(self, a, b, r, seg=6):
        self.geos.append(beam(a, b, r, seg)); return self

    def path(self, pts, r, seg=6):
        """A tube through the points (a list of radii or one radius)."""
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


def ring_around(A, R, r, y, n=20, rseg=6, cx=0.0, cz=0.0):
    A.add(torus(R, r, n, rseg), (cx, y, cz))


def spin_pts(R, y, n, phase=0.0):
    return [(math.sin(phase + 2 * PI * i / n) * R, y, math.cos(phase + 2 * PI * i / n) * R) for i in range(n)]


# =====================================================================================================================
# the boulevard's lamp post
# =====================================================================================================================
def lamp_post():
    root = pivot("lamp_post", (0, 0, 0), None)
    # a round footing for both posts, flaring up into the collar of the tall one, and six bolts
    A = Acc("lampFooting", "base", root, 0.03)
    A.add(lathe([(0, 0), (1.0, 0), (1.0, 0.12), (0.92, 0.2), (0.62, 0.22), (0.5, 0.34), (0.4, 0.5)], 16))
    A.flush()
    A = Acc("lampBolts", "gold", root, 0.0)
    for x, y, z in spin_pts(0.8, 0.22, 6, 0.3):
        A.cylc(x, y + 0.03, z, 0.05, 0.06, 6)
    A.flush()
    # the pole: a long taper with a flare under the lantern, three gold bands
    A = Acc("lampPole", "post", root, 0.035)
    A.add(lathe([(0.4, 0.5), (0.3, 0.75), (0.26, 1.1), (0.23, 2.5), (0.2, 4.5), (0.18, 6.3), (0.22, 6.62), (0.3, 6.78), (0.1, 6.78)], 12))
    A.flush()
    A = Acc("lampBands", "gold", root, 0.0)
    for y, R in ((0.8, 0.3), (3.7, 0.215), (6.4, 0.2)):
        ring_around(A, R, 0.045, y, 14, 5)
    # the lantern cup, the orb's gold belt and a finial
    A.add(lathe([(0.2, 6.7), (0.5, 6.95), (0.66, 7.2), (0.58, 7.22), (0.4, 7.06), (0.22, 6.92)], 14))
    ring_around(A, 0.69, 0.035, 7.78, 18, 5)
    A.cylc(0, 8.68, 0, 0.1, 0.5, 8, "y", rt=0.0)
    A.ball(0, 8.98, 0, 0.07, 6, 4)
    A.flush()
    # the two hovering rings, each over a gold lift coil on the pole, and the solid lantern
    A = Acc("lampGlow", "accent", root, 0.0)
    for y in (2.4, 4.8):
        ring_around(A, 0.55, 0.1, y, 20, 6)
    A.ball(0, 7.78, 0, 0.68, 14, 10)
    A.flush()
    A = Acc("lampCoils", "gold", root, 0.0)
    for y in (1.95, 4.35):
        ring_around(A, 0.24, 0.05, y, 12, 5)
        for x, yy, z in spin_pts(0.3, y + 0.15, 3, 0.0):      # three little pins that hold the ring up
            A.tube((x * 0.55, yy - 0.12, z * 0.55), (x, yy + 0.05, z), 0.012, 4)
    A.flush()
    # the small lamp post at the base, on the road side (+z): the same design, 1.5 m
    mz = 0.78
    A = Acc("miniPole", "post", root, 0.02)
    A.add(lathe([(0.16, 0.2), (0.09, 0.3), (0.06, 1.0), (0.08, 1.06), (0.03, 1.06)], 8), (0, 0, mz))
    A.flush()
    A = Acc("miniGold", "gold", root, 0.0)
    ring_around(A, 0.075, 0.018, 0.4, 10, 4, 0, mz)
    A.add(lathe([(0.06, 1.05), (0.12, 1.12), (0.2, 1.24), (0.17, 1.25), (0.1, 1.15)], 10), (0, 0, mz))
    A.cylc(0, 1.78, mz, 0.04, 0.2, 6, "y", rt=0.0)
    A.flush()
    A = Acc("miniGlow", "accent", root, 0.0)
    ring_around(A, 0.2, 0.035, 0.7, 14, 5, 0, mz)
    A.ball(0, 1.46, mz, 0.2, 10, 7)
    A.flush()


# =====================================================================================================================
# the plaza fountain
# =====================================================================================================================
def fountain():
    root = pivot("fountain", (0, 0, 0), None)
    # the basin: a stepped foot, a flared wall with a flat gold-lipped top, studs and pilasters round the outside, and a floor
    A = Acc("basin", "cream", root, 0.07)
    A.add(lathe([(9.7, 0.0), (9.7, 0.16), (9.32, 0.2), (9.3, 0.5), (9.05, 0.92), (9.15, 0.98), (9.15, 1.04), (8.55, 1.04), (8.55, 0.9), (8.5, 0.3), (8.5, 0.0), (9.7, 0.0)], 48))
    A.flush()
    A = Acc("basinFloor", "floor", root, 0.0)
    A.add(lathe([(0, 0.3), (8.5, 0.3)], 40))
    A.flush()
    A = Acc("basinPilasters", "creamshade", root, 0.03)
    for i in range(12):
        a = 2 * PI * i / 12
        A.boxc(math.sin(a) * 9.18, 0.52, math.cos(a) * 9.18, 0.7, 0.62, 0.32, rot=(0, a, 0))
    A.flush()
    A = Acc("basinGold", "gold", root, 0.0)
    ring_around(A, 8.85, 0.09, 1.05, 48, 5)
    for i in range(16):
        a = 2 * PI * (i + 0.5) / 16
        A.ball(math.sin(a) * 9.4, 0.7, math.cos(a) * 9.4, 0.1, 5, 3)
    A.flush()
    # the pedestal and its bowl (an ogee column over a stepped plinth, a saucer with a gold rim)
    A = Acc("pedestal", "cream", root, 0.05)
    A.add(lathe([(0, 0.3), (2.5, 0.3), (2.5, 0.6), (2.1, 0.75), (1.7, 1.0), (1.4, 1.5), (1.3, 2.0), (1.3, 3.0), (1.5, 3.4), (1.9, 3.7), (2.6, 3.9), (0, 3.9)], 20))
    A.flush()
    A = Acc("bowl", "cream", root, 0.05)
    A.add(lathe([(0, 3.9), (2.6, 3.9), (3.2, 4.05), (3.62, 4.3), (3.72, 4.66), (3.5, 4.66), (3.3, 4.45), (0, 4.4)], 28))
    A.flush()
    A = Acc("pedestalGold", "gold", root, 0.0)
    ring_around(A, 1.45, 0.07, 1.5, 24, 5)
    ring_around(A, 1.32, 0.06, 3.0, 24, 5)
    ring_around(A, 3.6, 0.1, 4.68, 36, 5)
    for i in range(8):
        a = 2 * PI * (i + 0.5) / 8
        A.ball(math.sin(a) * 3.55, 4.2, math.cos(a) * 3.55, 0.17, 6, 4, s=(1, 1.3, 1))
    A.flush()
    # the stem with a gold collar, eight spigots near the top (below the chip) and the cradle the chip turns in
    A = Acc("stem", "cream", root, 0.04)
    A.add(lathe([(0, 4.4), (0.9, 4.4), (0.75, 4.75), (0.55, 5.1), (0.5, 5.6), (0.58, 6.0), (0.72, 6.2), (0, 6.2)], 16))
    A.flush()
    A = Acc("spigots", "gold", root, 0.0)
    ring_around(A, 0.6, 0.07, 6.05, 16, 5)
    ring_around(A, 0.52, 0.06, 5.35, 16, 5)
    for i in range(8):
        a = 2 * PI * i / 8
        s, c = math.sin(a), math.cos(a)
        A.path([(s * 0.45, 5.78, c * 0.45), (s * 0.85, 5.73, c * 0.85), (s * 0.98, 5.71, c * 0.98)], [0.08, 0.08, 0.125], 8)   # (a nozzle with a flared mouth)
    A.flush()
    # the centrepiece turns in the cradle: the casino's chip, or the Meridian Exchange's dollar sign (one `spin` pivot each, extra `kind`;
    # the game builds the one it wants)
    # the chip: a pink disc standing on edge, cream inlays and rim notches, a gold ring on each face
    chip = pivot("chip", (0, 7.6, 0), root, role="spin", speed=0.7, kind="chip")
    A = Acc("chipBody", "chip", chip, 0.05)
    A.cylc(0, 0, 0, 1.5, 0.4, 28, "z")
    A.flush()
    A = Acc("chipInlay", "white", chip, 0.0)
    A.cylc(0, 0, 0, 1.0, 0.43, 24, "z")
    for i in range(8):
        a = 2 * PI * i / 8
        A.boxc(math.cos(a) * 1.5, math.sin(a) * 1.5, 0, 0.5, 0.14, 0.41, rot=(0, 0, a))
    A.flush()
    A = Acc("chipGold", "gold", chip, 0.0)
    for zz in (-0.215, 0.215):
        A.add(torus_arc(1.2, 0.04, 28, 5), (0, 0, zz), (PI / 2, 0, 0))
        A.add(torus_arc(0.82, 0.035, 22, 5), (0, 0, zz), (PI / 2, 0, 0))
    A.flush()
    # the dollar sign: a glowing S (the `accent` slot, the caller's colour) standing on edge, a gold bar through it, 4 m tall
    dollar = pivot("dollar", (0, 8.3, 0), root, role="spin", speed=0.7, kind="dollar")
    A = Acc("dollarS", "accent", dollar, 0.03)
    R = 0.8
    pts = []
    for k in range(25):                       # the top bowl: from the tail at the right, over the top, down to the middle
        a = math.radians(-30 + 300 * k / 24)
        pts.append((math.cos(a) * R, R + math.sin(a) * R, 0))
    for k in range(1, 25):                    # the bottom bowl: from the middle, round the right, under, to the tail at the left
        a = math.radians(90 - 300 * k / 24)
        pts.append((math.cos(a) * R, -R + math.sin(a) * R, 0))
    A.path(pts, 0.22, 10)
    A.ball(pts[0][0], pts[0][1], 0, 0.22, 8, 6)
    A.ball(pts[-1][0], pts[-1][1], 0, 0.22, 8, 6)
    A.flush()
    A = Acc("dollarBar", "gold", dollar, 0.03)
    A.cylc(0, 0, 0, 0.14, 4.4, 10, "y")
    A.ball(0, 2.2, 0, 0.14, 8, 6)
    A.ball(0, -2.2, 0, 0.14, 8, 6)
    A.flush()
    # the water: discs for the two tiers (the game ripples them), the sheet falling from the bowl's lip, and the jets from the spigots
    w1 = pivot("water_basin", (0, 0.72, 0), root, role="water", tier="basin")
    A = Acc("waterBasin", "water", w1, 0.0)
    A.add(lathe([(0, 0), (8.5, 0)], 48))
    A.flush()
    w2 = pivot("water_bowl", (0, 4.52, 0), root, role="water", tier="bowl")
    A = Acc("waterBowl", "water", w2, 0.0)
    A.add(lathe([(0, 0), (3.36, 0)], 32))
    A.flush()
    cu = pivot("curtain", (0, 0, 0), root, role="curtain")
    A = Acc("curtainSheet", "curtain", cu, 0.0)
    prof = [(3.76, 4.6), (3.84, 4.0), (3.92, 3.0), (4.0, 2.0), (4.05, 1.2), (4.07, 0.74)]
    g = lathe(prof, 40)
    A.geos.append(g)
    A.geos.append((g[0], [tuple(reversed(f)) for f in g[1]]))     # (both faces)
    A.flush()
    st = pivot("streams", (0, 0, 0), root, role="streams")
    A = Acc("streamArcs", "stream", st, 0.0)
    for i in range(8):
        a = 2 * PI * i / 8
        s, c = math.sin(a), math.cos(a)
        pts = []
        for k in range(11):
            t = k / 10
            r = 1.0 + 1.55 * t
            y = 5.7 - 1.18 * t * t
            pts.append((s * r, y, c * r))
        A.path(pts, 0.065, 5)
    A.flush()


# =====================================================================================================================
# the bouncer: a buff alien in a tux, no helmet
# =====================================================================================================================
def bouncer():
    root = pivot("bouncer", (0, 0, 0), None)
    # shoes, trouser legs and the pelvis
    A = Acc("shoes", "shoe", root, 0.025)
    for s in (-1, 1):
        A.rb(s * 0.24, 0.09, 0.09, 0.13, 0.09, 0.27, 0.3)
    A.flush()
    A = Acc("trousers", "suit", root, 0.03)
    for s in (-1, 1):
        A.cylc(s * 0.24, 0.7, 0.0, 0.2, 1.1, 12, "y", rt=0.25)
    A.rb(0, 1.28, 0, 0.5, 0.18, 0.3, 0.3, nu=16)
    A.flush()
    # the jacket: a tapering torso (waist, chest, a broad shoulder line), lapels, a cummerbund and a straining pair of sleeves
    A = Acc("jacket", "suit", root, 0.035)
    A.rb(0, 1.52, 0.0, 0.46, 0.3, 0.29, 0.3, nu=16)            # waist and ribs
    A.rb(0, 1.93, 0.02, 0.7, 0.34, 0.36, 0.3, nu=18)           # chest and shoulders
    A.rb(0, 2.14, -0.04, 0.42, 0.11, 0.26, 0.3)                # traps
    for s in (-1, 1):
        A.ball(s * 0.74, 2.0, 0.0, 0.3, 12, 8, s=(1, 0.95, 1))     # deltoid
        A.ball(s * 0.84, 1.66, 0.04, 0.27, 12, 8, s=(1, 1.3, 1))   # bicep bulging through the sleeve
        A.cylc(s * 0.8, 1.42, 0.2, 0.21, 0.3, 10, "y", rt=0.24, rot=(-0.5, 0, s * 0.15))   # the sleeve's end at the elbow
    A.flush()
    A = Acc("lapels", "suit2", root, 0.0)
    for s in (-1, 1):
        A.boxc(s * 0.2, 2.0, 0.375, 0.2, 0.55, 0.03, rot=(0, 0, s * 0.3))
    A.boxc(0, 1.34, 0.31, 0.7, 0.12, 0.05)                   # the cummerbund's edge
    A.flush()
    A = Acc("shirt", "shirt", root, 0.0)
    A.boxc(0, 2.0, 0.372, 0.2, 0.52, 0.025)
    A.boxc(0, 2.19, 0.27, 0.52, 0.07, 0.2)                    # the collar
    A.flush()
    A = Acc("tie", "tie", root, 0.015)
    for s in (-1, 1):
        A.cylc(s * 0.1, 2.14, 0.4, 0.08, 0.2, 6, "x", rt=0.02, rot=(0, 0, s * PI / 2))
    A.ball(0, 2.14, 0.4, 0.055, 6, 4)
    A.flush()
    A = Acc("jacketGold", "gold", root, 0.0)
    for k in range(3):
        A.ball(0.0, 1.8 - k * 0.12, 0.385, 0.02, 5, 3)
    A.boxc(0.3, 1.88, 0.38, 0.1, 0.03, 0.01)                  # a pin on the lapel
    A.flush()
    # the arms crossed over the chest: bare alien forearms and fists, a cuff at each elbow
    A = Acc("forearms", "skin", root, 0.03)
    A.path([(0.7, 1.4, 0.3), (0.3, 1.52, 0.5), (-0.16, 1.62, 0.52)], [0.21, 0.2, 0.17], 8)
    A.path([(-0.7, 1.38, 0.3), (-0.3, 1.46, 0.44), (0.18, 1.52, 0.42)], [0.21, 0.2, 0.17], 8)
    A.ball(-0.2, 1.64, 0.53, 0.2, 8, 6, s=(1.0, 0.9, 1.1))
    A.ball(0.22, 1.53, 0.43, 0.2, 8, 6, s=(1.0, 0.9, 1.1))
    A.flush()
    A = Acc("forearmRidges", "skin2", root, 0.0)
    for k in range(3):
        t = 0.2 + 0.2 * k
        A.boxc(0.7 - 0.9 * t, 1.4 + 0.2 * t + 0.19, 0.3 + 0.2 * t + 0.07, 0.06, 0.04, 0.22, rot=(0.15, 0, 0.15))
        A.boxc(-0.7 + 0.88 * t, 1.38 + 0.14 * t + 0.19, 0.3 + 0.12 * t + 0.05, 0.06, 0.04, 0.22, rot=(0.1, 0, -0.1))
    A.flush()
    A = Acc("cuffs", "shirt", root, 0.0)
    for s in (-1, 1):
        A.cylc(s * 0.72, 1.4, 0.3, 0.23, 0.07, 10, "y", rot=(-0.35, 0, s * 0.35))
    A.flush()
    A = Acc("jacketGold2", "gold", root, 0.0)
    for s in (-1, 1):
        A.cylc(s * 0.72, 1.4, 0.3 + 0.12, 0.03, 0.08, 6, "z")        # cufflinks
    A.flush()
    A = Acc("pocketSquare", "tie", root, 0.0)
    A.boxc(-0.42, 1.62, 0.375, 0.13, 0.07, 0.02, rot=(0, 0, 0.2))
    A.flush()
    # the neck and the head (a pivot at the neck, turned by the game): a tall bald dome, huge black almond eyes, a heavy jaw with two tusks, little antennae
    A = Acc("neck", "skin", root, 0.025)
    A.cylc(0, 2.2, 0.0, 0.22, 0.2, 10, "y", rt=0.19)
    A.flush()
    head = pivot("head", (0, 2.3, 0.0), root, role="head")
    A = Acc("skull", "skin", head, 0.03)
    A.rb(0, 0.38, -0.03, 0.36, 0.4, 0.37, 0.5, nu=18, nv=12)       # the tall dome
    A.rb(0, 0.04, 0.16, 0.28, 0.12, 0.2, 0.3)                      # the heavy jaw
    A.rb(0, 0.41, 0.31, 0.35, 0.045, 0.1, 0.4, rot=(0.12, 0, 0))   # the brow ridge
    for s in (-1, 1):
        A.ball(s * 0.2, 0.13, 0.25, 0.09, 8, 6)                    # cheekbones
    A.flush()
    A = Acc("fins", "skin2", head, 0.0)
    for s in (-1, 1):                                              # the swept-back fin ears
        A.add(cylinder(0.0, 0.09, 0.34, 6), (s * 0.38, 0.25, -0.05), (0, 0, -s * 1.15), (1, 1, 0.45))
        A.path([(s * 0.12, 0.74, -0.04), (s * 0.2, 0.92, -0.08), (s * 0.24, 1.04, -0.1)], [0.03, 0.022, 0.016], 5)      # antennae
    A.add(cylinder(0.0, 0.08, 0.2, 6), (0, 0.79, -0.05), (0, 0, 0), (0.45, 1, 1.5))                       # a low crest between them
    A.flush()
    A = Acc("antennaTips", "eye", head, 0.0)
    for s in (-1, 1):
        A.ball(s * 0.24, 1.07, -0.1, 0.045, 6, 4)
    A.flush()
    A = Acc("eyesBlack", "dark", head, 0.01)
    for s in (-1, 1):
        A.ball(s * 0.17, 0.3, 0.34, 0.14, 10, 6, s=(1.0, 0.5, 0.42), rot=(0, 0, s * 0.45))        # big almond eyes
        A.boxc(s * 0.035, 0.13, 0.352, 0.03, 0.04, 0.02, rot=(0, 0, s * 0.2))                       # nostrils
    A.boxc(0, 0.04, 0.358, 0.27, 0.022, 0.02)                                                         # the mouth
    A.boxc(0.4, 0.26, -0.03, 0.05, 0.12, 0.09)                                                        # the earpiece
    A.path([(0.41, 0.22, -0.05), (0.34, 0.0, -0.1), (0.22, -0.12, -0.08)], 0.012, 4)                  # and its coiled wire down into the collar
    A.flush()
    A = Acc("eyesGlint", "eye", head, 0.0)
    for s in (-1, 1):
        A.ball(s * 0.19, 0.305, 0.385, 0.05, 6, 4, s=(0.5, 1.0, 0.4))                               # a slit iris glowing in each
    A.flush()
    A = Acc("tusks", "tusk", head, 0.0)
    for s in (-1, 1):
        A.add(cylinder(0.0, 0.045, 0.2, 6), (s * 0.12, 0.13, 0.33), (-0.15, 0, -s * 0.18))
    A.flush()


# =====================================================================================================================
# one of the hall's chandeliers
# =====================================================================================================================
def chandelier():
    root = pivot("chandelier", (0, 0, 0), None)
    # the ceiling rose and the chain (the fixture hangs 3.3 m below the ceiling)
    A = Acc("rose", "gold", root, 0.02)
    A.add(lathe([(0.8, 3.3), (0.8, 3.22), (0.45, 3.16), (0.14, 3.0), (0.14, 2.9), (0.0, 2.9)], 14))
    A.cylc(0, 1.75, 0, 0.035, 2.3, 6, "y")
    for k in range(7):
        ring_around(A, 0.06, 0.025, 2.9 - k * 0.32, 8, 4)
    A.flush()
    # what turns: the hub, two tiers of gold ring with arms and candle lamps, crystal drops and swags
    spin = pivot("spin", (0, 0, 0), root, role="spin", speed=0.3)
    A = Acc("chHub", "gold", spin, 0.025)
    A.add(lathe([(0.0, 0.62), (0.12, 0.6), (0.3, 0.45), (0.36, 0.25), (0.24, 0.08), (0.0, 0.0)], 12))
    A.flush()
    A = Acc("chGold", "gold", spin, 0.0)
    ring_around(A, 0.95, 0.05, 0.12, 22, 5)
    ring_around(A, 1.75, 0.06, -0.38, 28, 5)
    for i in range(6):
        a = 2 * PI * i / 6 + PI / 6
        s, c = math.sin(a), math.cos(a)
        A.path([(s * 0.2, 0.22, c * 0.2), (s * 0.5, 0.18, c * 0.5), (s * 0.78, 0.04, c * 0.78), (s * 0.95, 0.12, c * 0.95)], [0.03, 0.028, 0.026, 0.025], 5)
        A.cylc(s * 0.95, 0.2, c * 0.95, 0.07, 0.1, 8, "y", rt=0.05)
    for i in range(8):
        a = 2 * PI * i / 8
        s, c = math.sin(a), math.cos(a)
        A.path([(s * 0.25, 0.12, c * 0.25), (s * 0.7, 0.18, c * 0.7), (s * 1.15, -0.18, c * 1.15), (s * 1.5, -0.52, c * 1.5), (s * 1.75, -0.38, c * 1.75)], [0.035, 0.032, 0.03, 0.028, 0.026], 5)
        A.cylc(s * 1.75, -0.27, c * 1.75, 0.08, 0.12, 8, "y", rt=0.055)
        A.ball(s * 1.75, -0.45, c * 1.75, 0.04, 5, 3)
    A.flush()
    A = Acc("chBulbs", "bulb", spin, 0.0)
    for i in range(6):
        a = 2 * PI * i / 6 + PI / 6
        A.ball(math.sin(a) * 0.95, 0.34, math.cos(a) * 0.95, 0.075, 6, 4, s=(1, 1.4, 1))
    for i in range(8):
        a = 2 * PI * i / 8
        A.ball(math.sin(a) * 1.75, -0.12, math.cos(a) * 1.75, 0.08, 6, 4, s=(1, 1.4, 1))
    A.flush()
    for name, slot, parity in (("chCrystalA", "crystalA", 0), ("chCrystalB", "crystalB", 1)):
        A = Acc(name, slot, spin, 0.0)
        for i in range(8):                                   # the long drops hung from the lower ring
            if i % 2 == parity:
                a = 2 * PI * i / 8 + PI / 8
                A.ball(math.sin(a) * 1.75, -0.78, math.cos(a) * 1.75, 1.0, 4, 2, s=(0.11, 0.32, 0.11))
        for i in range(6):                                   # the short ones on the upper ring
            if i % 2 == parity:
                a = 2 * PI * i / 6 + PI / 6 + PI / 6
                A.ball(math.sin(a) * 0.95, -0.17, math.cos(a) * 0.95, 1.0, 4, 2, s=(0.07, 0.19, 0.07))
        for i in range(8):                                   # a swag of beads between the long drops
            a0 = 2 * PI * i / 8
            for k in range(1, 4):
                if (i + k) % 2 == parity:
                    a = a0 + (PI / 4) * k / 4
                    A.ball(math.sin(a) * 1.75, -0.38 - 0.2 * math.sin(PI * k / 4), math.cos(a) * 1.75, 0.06, 4, 2)
        if parity == 1:
            A.ball(0, -0.62, 0, 1.0, 4, 2, s=(0.24, 0.6, 0.24))      # the big central pendant
        else:
            for k in range(3):
                A.ball(0, -0.12 - 0.16 * k, 0, 0.05, 4, 2)
        A.flush()
    # and the base of that pendant
    A = Acc("chPendantCap", "gold", spin, 0.0)
    A.cylc(0, 0.0, 0, 0.1, 0.12, 8, "y", rt=0.03)
    A.flush()


# =====================================================================================================================
# the two signs
# =====================================================================================================================
def sign_frame(root, W, H, depth, name):
    """A plum board with a gold frame, a neon line inside it, corner medallions and a row of bulbs along the top and bottom."""
    A = Acc(name + "Board", "plum", root, 0.04)
    A.boxc(0, 0, 0, W - 0.04, H - 0.04, depth)      # (a hair inside the frame, so no face of the board shares a plane with the frame's)
    A.flush()
    A = Acc(name + "Frame", "gold", root, 0.03)
    t = 0.18
    A.boxc(0, H / 2 - t / 2, depth / 2 - 0.02, W, t, 0.12)
    A.boxc(0, -H / 2 + t / 2, depth / 2 - 0.02, W, t, 0.12)
    for s in (-1, 1):
        A.boxc(s * (W / 2 - t / 2), 0, depth / 2 - 0.02, t, H, 0.12)
        for sy in (-1, 1):
            A.cylc(s * (W / 2 - 0.05), sy * (H / 2 - 0.05), depth / 2 + 0.04, 0.26, 0.1, 8, "z")
    A.flush()
    A = Acc(name + "Neon", "neon", root, 0.0)
    A.boxc(0, H / 2 - t - 0.06, depth / 2 + 0.01, W - 2 * t - 0.2, 0.04, 0.02)
    A.boxc(0, -H / 2 + t + 0.06, depth / 2 + 0.01, W - 2 * t - 0.2, 0.04, 0.02)
    for s in (-1, 1):
        for sy in (-1, 1):
            A.cylc(s * (W / 2 - 0.05), sy * (H / 2 - 0.05), depth / 2 + 0.1, 0.1, 0.06, 6, "z")
    A.flush()
    A = Acc(name + "Bulbs", "bulb", root, 0.0)
    n = max(5, int(W / 0.9))
    for i in range(n):
        x = -W / 2 + 0.6 + (W - 1.2) * i / (n - 1)
        for sy in (-1, 1):
            A.ball(x, sy * (H / 2 - t - 0.2), depth / 2 + 0.06, 0.07, 5, 4)
    A.flush()


def welcome_sign():
    root = pivot("welcome_sign", (0, 0, 0), None)
    sign_frame(root, 9.6, 2.5, 0.2, "wel")
    # three finials on top and the chains up to the ceiling plates (6.4 m above)
    A = Acc("welTop", "gold", root, 0.0)
    for x in (-3.0, 0.0, 3.0):
        A.cylc(x, 1.43, 0.0, 0.1, 0.34, 6, "y", rt=0.0)
        A.ball(x, 1.25, 0.0, 0.1, 6, 4)
    for s in (-1, 1):
        x = s * 3.9
        A.cylc(x, 1.25 + 3.2, 0, 0.04, 6.4, 6, "y")
        for k in range(12):
            A.ball(x, 1.45 + k * 0.5, 0, 0.09, 6, 4)
        A.cylc(x, 7.65, 0, 0.3, 0.12, 10, "y")
    A.flush()
    pivot("face", (0, 0, 0.115), root, role="face", w=8.8, h=2.15)


def wall_sign():
    root = pivot("wall_sign", (0, 0, 0), None)
    sign_frame(root, 7.4, 1.95, 0.16, "wall")
    # a cornice with downlights over it, and four brackets into the wall behind
    A = Acc("wallCornice", "gold", root, 0.03)
    A.boxc(0, 1.0, 0.04, 7.7, 0.12, 0.34)
    for x in (-2.6, 0.0, 2.6):
        A.boxc(x, 1.14, 0.04, 0.18, 0.16, 0.22)
    A.flush()
    A = Acc("wallBrackets", "base", root, 0.02)
    for x in (-3.4, 3.4):
        for y in (-0.7, 0.7):
            A.boxc(x, y, -0.12, 0.3, 0.2, 0.1)
    A.flush()
    A = Acc("wallLights", "bulb", root, 0.0)
    for x in (-2.6, 0.0, 2.6):
        A.ball(x, 0.93, 0.2, 0.07, 5, 4)
    A.flush()
    pivot("face", (0, 0, 0.095), root, role="face", w=6.95, h=1.7)


lamp_post()
fountain()
bouncer()
chandelier()
welcome_sign()
wall_sign()
flush_all()

_dg = bpy.context.evaluated_depsgraph_get()
_tris = {}
for _o in C.objects:
    if _o.type != "MESH":
        continue
    _p = _o
    while _p.parent:
        _p = _p.parent
    _top = _p.name
    _t = sum(len(p.vertices) - 2 for p in _o.evaluated_get(_dg).to_mesh().polygons)
    _tris[_top] = _tris.get(_top, 0) + _t
print("built", len(C.objects), "objects; triangles per root:", _tris)
export(OUT, list(C.objects))
