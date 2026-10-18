# Duck Derby builder for Blender (4.2+ / 5.x): the Lucky Crater Casino's track, "Gilded Regatta" (plum and gold lacquer,
# brass, cream marquetry), and the four racers. Exports src/assets/duck.glb in three.js axes (x right, y up, z forward);
# used by casinoWorld.js (track) and casinoGames.js (race), read by models.js.
#
#   dd_duck1..4   racers, ~1.3 m long facing +x, origin on the waterline keel: QUACKERS (jockey cap, medal), SIR WADDLES
#                 (top hat, monocle, moustache), DUCKTOR WHO (fez, bow tie, specs), MOONBILL (bubble helmet, antenna).
#                 Slots `body`, `wing`, `silk` are tinted per duck. Pivots: head, wingR, wingL (role = pivot name).
#   dd_trough     28.4 x 7.0 m basin, top at y 1.1, water at y 0.86. Pivots: water1..4 (lane water plane, w x h),
#                 num1..4 (lane number disc on the water), finishLine (plane across the lanes).
#   dd_gate       start gate frame. Pivots: lamp1..3 (where the game puts the lit lamps), startSign (a plate).
#   dd_grille     brass portcullis the game lifts (origin at its middle, 6.8 m wide, 1.5 m tall).
#   dd_finish     finish arch. Pivot: banner (checker plane, w x h).
#   dd_board      odds board frame, 17.2 x 6.8 m, facing +x. Pivot: face (the plane the game paints).
#   dd_kiosk      betting kiosk, front toward +z. Pivot: screen (plane w x h).
#   dd_railpost / dd_rope   one brass post and one 3.5 m rope (from the post's origin along +x).
# Run:  MOONRUNNER_REPO=. python3 tools/blender/build_duck.py   (or exec() it in Blender's Scripting tab)
import bpy, bmesh, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_duck.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("DUCK_OUT") or os.path.join(REPO, "src", "assets", "duck.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Duck export ->", OUT)
COLL = "MoonDuck"
PI = math.pi


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "body": "ffd23f", "wing": "e0b72f", "bill": "ff9f1c", "dark": "1a1030", "foam": "ffffff", "silk": "ff2e88", "glass": "9be7ff", "lamp": "fff6a8", "shine": "ffffff",
    "glowred": "ff2a4a", "glowamber": "ff9f1c", "glowgreen": "7dff6a", "steel": "c9c3d9",
    "lane1": "ffd23f", "lane2": "ff2e88", "lane3": "2ee6ff", "lane4": "7dff6a", "red": "d7263d", "cream": "fff4e0", "gold": "ffd23f", "brass": "c79a1f",
    "plum": "4a1766", "plum2": "6a2a8f", "tile": "2aa3c0", "velvet": "b3123a", "suitred": "ff2a4a", "suitcream": "fff4e0",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)


class Acc:
    all = []

    def __init__(self, name, slot, parent, ink=0.03):
        self.name, self.slot, self.parent, self.ink, self.geos = name, slot, parent, ink, []
        Acc.all.append(self)

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot)); return self

    def rbc(self, cx, cy, cz, w, h, d, e=0.3, rot=(0, 0, 0)):
        self.geos.append(xf(rbox(w / 2, h / 2, d / 2, e, 14, 8), (cx, cy, cz), rot)); return self

    def cylc(self, cx, cy, cz, r, h, seg=12, rt=None, rot=(0, 0, 0)):
        self.geos.append(xf(cylinder(r if rt is None else rt, r, h, seg)[:2], (cx, cy, cz), rot)); return self

    def ball(self, cx, cy, cz, r, w=10, h=7, s=(1, 1, 1), rot=(0, 0, 0)):
        self.geos.append(xf(sphere(r, w, h)[:2], (cx, cy, cz), rot, s)); return self

    def dome(self, cx, cy, cz, r, w=12, h=6, s=(1, 1, 1), rot=(0, 0, 0)):
        self.geos.append(xf(sphere(r, w, h, PI / 2)[:2], (cx, cy, cz), rot, s)); return self

    def tor(self, R, r, t=(0, 0, 0), rot=(0, 0, 0), n=20, rs=6, s=(1, 1, 1)):
        self.geos.append(xf(torus(R, r, n, rs), t, rot, s)); return self

    def tube(self, a, b, r, seg=6):
        self.geos.append(beam(a, b, r, seg)); return self

    def path(self, pts, r, seg=6):
        self.geos.append(tube(pts, r if isinstance(r, (list, tuple)) else [r] * len(pts), seg)); return self

    def lath(self, prof, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1), segs=14):
        self.geos.append(xf(lathe(prof, segs), t, rot, s)); return self

    def poly(self, pts, depth, t=(0, 0, 0), rot=(0, 0, 0), axis="z"):
        self.geos.append(xf(extrude(pts, depth, axis), t, rot)); return self

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1)):
        self.geos.append(xf(geo[:2], t, rot, s)); return self

    def flush(self):
        if self.geos:
            mesh(self.name, join(self.geos), self.slot, self.parent, self.ink)
        self.geos = []


def flush_all():
    for a in Acc.all:
        a.flush()


def digit(A, n, cx, cy, cz, h=0.3, th=0.045, depth=0.03, face="z"):
    """seven-segment digit of boxes centred on (cx, cy, cz); face z: reads from +z, x: from +x"""
    w = h * 0.55
    seg = {"a": (0, h / 2, w, th), "d": (0, -h / 2, w, th), "g": (0, 0, w, th), "f": (-w / 2, h / 4, th, h / 2), "b": (w / 2, h / 4, th, h / 2), "e": (-w / 2, -h / 4, th, h / 2), "c": (w / 2, -h / 4, th, h / 2)}
    for s in {1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc"}[n]:
        x, y, sw, sh = seg[s]
        if face == "z":
            A.boxc(cx + x, cy + y, cz, sw, sh, depth)
        elif face == "x":
            A.boxc(cx, cy + y, cz - x, depth, sh, sw)
        else:   # "-x": reads from -x
            A.boxc(cx, cy + y, cz + x, depth, sh, sw)


exec(open(os.path.join(REPO, "tools", "blender", "suits.py"), encoding="utf-8").read(), globals())   # card-suit panels (shared with blackjack and the claw machine)


LANES = (2.4, 0.8, -0.8, -2.4)          # lane centres (z), lane 1 at +z (player's side)
LEN = 28.4                              # trough outer length
WID = 7.0
WATER = 0.86
PZ = 4.8                                # gate and arch pillar z, clear of the coping and rail
START_X, FIN_X = -12.0, 12.0           # gate and finish line x


# =====================================================================================================================
# the racing duck: one rubber-duck body (~1.3 m, facing +x); headgear and kit differ
# =====================================================================================================================
def duck(i):
    o = pivot(f"dd_duck{i}", (0, 0, 0), None)
    A = Acc(f"d{i}Body", "body", o, 0.045)
    A.ball(0, 0.36, 0, 0.55, 18, 12, (1.25, 0.82, 0.95))
    A.ball(0.42, 0.55, 0, 0.4, 12, 9, (1, 1, 0.9))
    A.path([(-0.55, 0.48, 0), (-0.85, 0.6, 0), (-1.02, 0.88, 0)], [0.22, 0.15, 0.05], 8)
    A.flush()
    A = Acc(f"d{i}Foam", "foam", o, 0.0)
    A.tor(0.62, 0.07, (0, 0.27, 0), (0, 0, 0), 24, 5, (1.4, 0.55, 1.1))
    A.flush()
    head = pivot(f"dd_duck{i}_head", (0.42, 0.78, 0), o, role="head")
    A = Acc(f"d{i}Head", "body", head, 0.04)
    A.ball(0, 0.02, 0, 0.3, 12, 8, (0.9, 1.15, 0.95))
    A.ball(0.1, 0.3, 0, 0.37, 16, 12)
    A.flush()
    A = Acc(f"d{i}Bill", "bill", head, 0.03)
    A.rbc(0.5, 0.2, 0, 0.5, 0.14, 0.36, 0.6)
    A.rbc(0.45, 0.27, 0, 0.4, 0.07, 0.3, 0.6)
    A.flush()
    A = Acc(f"d{i}Eye", "dark", head, 0.0)
    for s in (-1, 1):
        A.ball(0.34, 0.37, s * 0.2, 0.085, 8, 6)
    A.ball(0.62, 0.28, 0.07, 0.025, 4, 3); A.ball(0.62, 0.28, -0.07, 0.025, 4, 3)
    A.flush()
    A = Acc(f"d{i}Shine", "shine", head, 0.0)
    for s in (-1, 1):
        A.ball(0.38, 0.41, s * 0.225, 0.033, 6, 4)
    A.flush()
    for s, nm in ((1, "wingR"), (-1, "wingL")):
        w = pivot(f"dd_duck{i}_{nm}", (-0.05, 0.56, s * 0.47), o, role=nm)
        A = Acc(f"d{i}{nm}", "wing", w, 0.03)
        A.ball(-0.12, -0.04, s * 0.04, 0.3, 12, 8, (1.15, 0.42, 0.3), (0, 0, 0.12))
        A.ball(-0.4, 0.04, s * 0.04, 0.12, 8, 6, (1.4, 0.35, 0.25), (0, 0, 0.35))
        A.flush()
    return o, head


def duck_A(i):
    o, head = duck(i)
    # wing numbers: gold disc, black digit, ring in the lane colour
    for s, nm in ((1, "wingR"), (-1, "wingL")):
        w = bpy.data.objects[f"dd_duck{i}_{nm}"]
        A = Acc(f"d{i}{nm}Disc", "gold", w, 0.0)
        A.cylc(-0.14, 0.0, s * 0.16, 0.2, 0.04, 16, rot=(PI / 2, 0, 0))
        A.flush()
        A = Acc(f"d{i}{nm}Ring", f"lane{i}", w, 0.0)
        A.tor(0.2, 0.025, (-0.14, 0.0, s * 0.17), (PI / 2, 0, 0), 18, 4)
        A.flush()
        A = Acc(f"d{i}{nm}Num", "dark", w, 0.0)
        digit(A, i, -0.14, 0.0, s * 0.19, 0.22, 0.045, 0.02)
        A.flush()
    if i == 1:    # QUACKERS: jockey cap in silks, pom, medal
        A = Acc("d1Cap", "silk", head, 0.03)
        A.dome(0.1, 0.52, 0, 0.35, 14, 6, (1, 0.8, 1))
        A.rbc(0.43, 0.62, 0, 0.32, 0.04, 0.34, 0.9, (0, 0, -0.15))
        A.flush()
        A = Acc("d1CapGold", "gold", head, 0.02)
        A.ball(0.1, 0.84, 0, 0.07, 8, 6)
        A.tor(0.34, 0.02, (0.1, 0.58, 0), (0, 0, 0), 18, 4, (1, 1, 1))
        A.flush()
        A = Acc("d1Medal", "gold", o, 0.02)
        A.cylc(0.78, 0.5, 0, 0.1, 0.03, 12, rot=(0, 0, PI / 2)); A.tor(0.08, 0.015, (0.8, 0.5, 0), (0, 0, PI / 2), 12, 4)
        A.flush()
    elif i == 2:  # SIR WADDLES: top hat, monocle on a chain, moustache
        A = Acc("d2Hat", "dark", head, 0.03)
        A.cylc(0.1, 0.78, 0, 0.23, 0.46, 16)
        A.cylc(0.1, 0.56, 0, 0.38, 0.05, 18)
        A.flush()
        A = Acc("d2Band", "silk", head, 0.02)
        A.cylc(0.1, 0.64, 0, 0.24, 0.1, 16)
        A.flush()
        A = Acc("d2Mono", "gold", head, 0.0)
        A.tor(0.1, 0.017, (0.36, 0.37, 0.215), (PI / 2, 0, 0), 14, 4)
        A.path([(0.3, 0.3, 0.27), (0.25, 0.1, 0.4), (0.3, -0.25, 0.42)], 0.012, 4)
        A.flush()
        A = Acc("d2Stache", "dark", head, 0.02)
        for s in (-1, 1):
            A.ball(0.62, 0.14, s * 0.1, 0.07, 8, 6, (1.5, 0.7, 1), (0, 0, 0.1 * s))
        A.flush()
    elif i == 3:  # DUCKTOR WHO: tasselled fez, bow tie, round specs
        A = Acc("d3Fez", "red", head, 0.03)
        A.cylc(0.1, 0.62, 0, 0.3, 0.3, 14, rt=0.2)
        A.flush()
        A = Acc("d3Tassel", "gold", head, 0.02)
        A.ball(0.1, 0.78, 0, 0.05, 8, 6); A.path([(0.1, 0.78, 0), (0.0, 0.76, 0.18), (-0.04, 0.6, 0.3)], [0.02, 0.02, 0.025], 4)
        A.flush()
        A = Acc("d3Specs", "brass", head, 0.0)
        for s in (-1, 1):
            A.tor(0.1, 0.014, (0.36, 0.37, s * 0.2), (PI / 2, 0, 0), 14, 4)
        A.tube((0.36, 0.37, -0.1), (0.36, 0.37, 0.1), 0.012, 4)
        A.flush()
        A = Acc("d3Bow", "silk", o, 0.02)
        for s in (-1, 1):
            A.add(cylinder(0.09, 0.0, 0.3, 8), (0.66, 0.62, s * 0.17), (s * PI / 2, 0, 0))
        A.ball(0.64, 0.62, 0, 0.07, 8, 6)
        A.flush()
    else:         # MOONBILL: bubble helmet, collar, antenna
        A = Acc("d4Collar", "steel", o, 0.03)
        A.tor(0.34, 0.07, (0.42, 0.8, 0), (0, 0, 0), 18, 6, (1, 1, 1))
        A.flush()
        A = Acc("d4Glass", "glass", head, 0.0)
        A.ball(0.1, 0.22, 0, 0.62, 18, 12, (0.95, 1.0, 0.9))
        A.flush()
        A = Acc("d4Ant", "steel", head, 0.02)
        A.path([(0.0, 0.75, 0.0), (-0.06, 0.95, 0.0), (-0.1, 1.15, 0.0)], 0.02, 5)
        A.flush()
        A = Acc("d4AntLamp", "lamp", head, 0.0)
        A.ball(-0.1, 1.17, 0, 0.07, 8, 6)
        A.flush()


# =====================================================================================================================
# SET A: GILDED REGATTA
# =====================================================================================================================
def trough_A():
    o = pivot("dd_trough", (0, 0, 0), None)
    H = LEN / 2
    A = Acc("tPlinth", "plum2", o, 0.04)
    A.boxc(0, 0.14, 0, LEN - 0.6, 0.28, WID - 0.6)
    A.flush()
    A = Acc("tBody", "plum", o, 0.05)
    A.boxc(0, 0.67, WID / 2 - 0.15, LEN, 0.78, 0.3)
    A.boxc(0, 0.67, -(WID / 2 - 0.15), LEN, 0.78, 0.3)
    for sx in (-1, 1):
        A.boxc(sx * (H - 0.15), 0.67, 0, 0.3, 0.78, WID - 0.6)
    A.boxc(0, 0.34, 0, LEN - 0.6, 0.12, WID - 0.6)
    A.flush()
    A = Acc("tFloor", "tile", o, 0.0)
    A.boxc(0, 0.41, 0, LEN - 0.64, 0.04, WID - 0.64)
    for z in LANES:
        pass
    A.flush()
    A = Acc("tLiner", "tile", o, 0.0)
    A.boxc(0, 0.7, WID / 2 - 0.31, LEN - 0.6, 0.6, 0.02)
    A.boxc(0, 0.7, -(WID / 2 - 0.31), LEN - 0.6, 0.6, 0.02)
    for sx in (-1, 1):
        A.boxc(sx * (H - 0.31), 0.7, 0, 0.02, 0.6, WID - 0.6)
    A.flush()
    A = Acc("tGold", "gold", o, 0.03)
    A.boxc(0, 0.33, 0, LEN + 0.14, 0.1, WID + 0.14)
    A.boxc(0, 1.07, WID / 2 - 0.19, LEN + 0.04, 0.1, 0.46)       # coping 2 cm proud of the body, so no shared planes
    A.boxc(0, 1.07, -(WID / 2 - 0.19), LEN + 0.04, 0.1, 0.46)
    for sx in (-1, 1):
        A.boxc(sx * (H - 0.19), 1.07, 0, 0.46, 0.1, WID - 0.84)
    A.flush()
    A = Acc("tFrame", "brass", o, 0.0); P = Acc("tPanel", "plum", o, 0.0); R = Acc("tSuitRed", "suitred", o, 0.012); K = Acc("tSuitCream", "suitcream", o, 0.012)
    for sz in (-1, 1):
        for k in range(-6, 7):
            suit_panel(A, P, R, K, (k + 6 + (0 if sz > 0 else 2)) % 4, (k * 2.1, 0.67, sz * WID / 2), 0 if sz > 0 else PI, 1.7, 0.56, 0.3)
    for sx in (-1, 1):
        for j, z in enumerate((-1.7, 0.0, 1.7)):
            suit_panel(A, P, R, K, (j + (0 if sx > 0 else 2)) % 4, (sx * H, 0.67, z), sx * PI / 2, 1.5, 0.56, 0.3)
    A.flush(); P.flush(); R.flush(); K.flush()
    # lane ropes: red and cream floats on a line, brass cleats at the ends
    A = Acc("tFloatR", "red", o, 0.0); B2 = Acc("tFloatC", "cream", o, 0.0); L2 = Acc("tLine", "dark", o, 0.0)
    for zi, z in enumerate((-3.2, -1.6, 0.0, 1.6, 3.2)):
        xs = [-13.4 + 0.55 * k for k in range(int(26.8 / 0.55) + 1)]
        for k, x in enumerate(xs):
            (A if k % 2 else B2).ball(x, WATER + 0.01, z, 0.1, 6, 4, (1.5, 0.9, 0.9))
            if k:
                L2.tube((xs[k - 1], WATER + 0.01, z), (x, WATER + 0.01, z), 0.012, 4)
    A.flush(); B2.flush(); L2.flush()
    A = Acc("tCleat", "brass", o, 0.02)
    for sx in (-1, 1):
        for z in (-3.2, -1.6, 0.0, 1.6, 3.2):
            A.cylc(sx * 13.6, 1.0, z, 0.08, 0.14, 8)
    A.flush()
    # water plane per lane (the game adds the ripple), finish line, number marks
    for i, z in enumerate(LANES, 1):
        pivot(f"water{i}", (0, WATER, z), o, role="water", w=26.8, h=1.3)
        pivot(f"num{i}", (-13.0, WATER + 0.02, z), o, role="num", w=0.9, h=0.9)
    pivot("finishLine", (FIN_X, WATER + 0.03, 0), o, role="finishLine", w=0.5, h=6.4)


def gate_A():
    o = pivot("dd_gate", (0, 0, 0), None)
    A = Acc("gPlinth", "plum", o, 0.04)
    for s in (-1, 1):
        A.boxc(0, 0.35, s * PZ, 0.8, 0.7, 0.8)
    A.flush()
    A = Acc("gShaft", "cream", o, 0.03)
    for s in (-1, 1):
        A.cylc(0, 1.575, s * PZ, 0.26, 1.75, 12)                                                   # stops under the capital, so the header rests on it
    A.flush()
    A = Acc("gGold", "gold", o, 0.03)
    for s in (-1, 1):
        A.boxc(0, 0.72, s * PZ, 0.92, 0.08, 0.92)
        A.cylc(0, 2.44, s * PZ, 0.34, 0.12, 12)                                                    # collar under the capital plate
        A.boxc(0, 2.55, s * PZ, 0.74, 0.1, 0.74)
        A.ball(0, 3.18, s * PZ, 0.16, 8, 6)                                                        # finial sitting on the cap beam
    A.boxc(0, 3.0, 0, 0.36, 0.08, 2 * PZ + 0.6)
    A.flush()
    A = Acc("gHeader", "plum", o, 0.04)
    A.boxc(0, 2.78, 0, 0.3, 0.4, 2 * PZ + 0.3)
    A.flush()
    A = Acc("gPlaque", "gold", o, 0.0)
    for i, z in enumerate(LANES, 1):
        for sx in (-1, 1):
            A.cylc(sx * 0.17, 2.78, z, 0.2, 0.04, 16, rot=(0, 0, PI / 2))
    A.flush()
    for i, z in enumerate(LANES, 1):
        A = Acc(f"gPlaqueRing{i}", f"lane{i}", o, 0.0)
        for sx in (-1, 1):
            A.tor(0.21, 0.025, (sx * 0.19, 2.78, z), (0, 0, PI / 2), 18, 4)
        A.flush()
    A = Acc("gPlaqueNum", "dark", o, 0.0)
    for i, z in enumerate(LANES, 1):
        digit(A, i, 0.2, 2.78, z, 0.22, 0.045, 0.02, "x"); digit(A, i, -0.2, 2.78, z, 0.22, 0.045, 0.02, "-x")
    A.flush()
    # starting lamps: brass housing with three lamps
    A = Acc("gLampBox", "brass", o, 0.03)
    A.boxc(0, 3.28, 0, 0.5, 0.5, 1.7)
    A.boxc(0, 3.58, 0, 0.6, 0.08, 1.8)
    A.flush()
    A = Acc("gLampCup", "dark", o, 0.02)   # lens cups; the game sets lit red / amber / green discs in them for the countdown
    for k, z in enumerate((0.55, 0.0, -0.55)):
        for sx in (-1, 1):
            A.cylc(sx * 0.3, 3.28, z, 0.22, 0.04, 14, rot=(0, 0, PI / 2))
        pivot(f"lamp{k + 1}", (0.33, 3.28, z), o, role="lamp", r=0.2)
    A.flush()
    pivot("startSign", (0.17, 2.78, 0.0), o, role="sign", w=1.6, h=0.34)    # plate between plaques 2 and 3; the game paints START
    # grille: brass portcullis the game lifts (own object, origin at its middle)
    g = pivot("dd_grille", (0, 0, 0), None)
    A = Acc("grBars", "brass", g, 0.02)
    for k in range(21):
        z = -3.2 + k * 0.32
        A.cylc(0, 0, z, 0.035, 1.5, 6)
        A.add(cylinder(0.0, 0.07, 0.2, 6), (0, 0.84, z))
    A.flush()
    A = Acc("grRails", "gold", g, 0.03)
    A.boxc(0, 0.7, 0, 0.12, 0.1, 6.8); A.boxc(0, -0.7, 0, 0.12, 0.1, 6.8); A.boxc(0, 0.0, 0, 0.1, 0.06, 6.8)
    for s in (-1, 1):
        A.boxc(0, 0, s * 3.4, 0.16, 1.5, 0.12)
    A.flush()


def finish_A():
    o = pivot("dd_finish", (0, 0, 0), None)
    A = Acc("fPlinth", "plum", o, 0.04)
    for s in (-1, 1):
        A.boxc(0, 0.4, s * PZ, 0.9, 0.8, 0.9)
    A.flush()
    A = Acc("fShaft", "cream", o, 0.03)
    for s in (-1, 1):
        A.cylc(0, 3.2, s * PZ, 0.34, 4.6, 14)                                                      # wide enough to hold the beams' corners
    A.flush()
    A = Acc("fGold", "gold", o, 0.03)
    for s in (-1, 1):
        A.boxc(0, 0.84, s * PZ, 1.0, 0.08, 1.0)
        for y in (1.1, 2.2, 3.5, 4.6):
            A.cylc(0, y, s * PZ, 0.40, 0.1, 14)
        A.lath([(0, 5.5), (0.46, 5.5), (0.38, 5.62), (0.28, 5.7), (0, 5.7)], (0, 0, s * PZ), (0, 0, 0), (1, 1, 1), 12)
        A.ball(0, 5.9, s * PZ, 0.2, 10, 8)
    A.boxc(0, 5.19, 0, 0.66, 0.16, 2 * PZ)      # top 2 cm above the beam's (no shared plane); ends inside the shafts
    A.flush()
    A = Acc("fBeam", "plum", o, 0.04)
    A.boxc(0, 5.0, 0, 0.62, 0.5, 2 * PZ - 0.1)
    A.flush()
    A = Acc("fFrame", "brass", o, 0.0); P = Acc("fPanel", "plum2", o, 0.0); R = Acc("fSuitRed", "suitred", o, 0.012); K = Acc("fSuitCream", "suitcream", o, 0.012)
    for k, z in enumerate((-3.6, -1.8, 0.0, 1.8, 3.6)):
        suit_panel(A, P, R, K, k % 4, (0.31, 5.0, z), PI / 2, 1.5, 0.36, 0.2); suit_panel(A, P, R, K, (k + 2) % 4, (-0.31, 5.0, z), -PI / 2, 1.5, 0.36, 0.2)
    A.flush(); P.flush(); R.flush(); K.flush()
    # banner: pole on brass rings under the beam, cloth (the game's checker), two tassels
    A = Acc("fPole", "brass", o, 0.02)
    A.tube((0, 4.62, -(PZ - 0.3)), (0, 4.62, PZ - 0.3), 0.04, 8)
    for z in (-4.4, -3.4, -1.7, 0.0, 1.7, 3.4, 4.4):
        A.tor(0.07, 0.015, (0, 4.62, z), (0, 0, 0), 10, 4)
    A.flush()
    pivot("banner", (0, 4.05, 0), o, role="banner", w=6.8, h=1.0)
    A = Acc("fBannerFrame", "gold", o, 0.0)
    A.boxc(0, 4.58, 0, 0.04, 0.06, 6.9); A.boxc(0, 3.5, 0, 0.04, 0.06, 6.9)
    for s in (-1, 1):
        A.boxc(0, 4.04, s * 3.43, 0.04, 1.14, 0.06)
    A.flush()
    A = Acc("fTassel", "gold", o, 0.02)
    for s in (-1, 1):
        A.path([(0, 4.58, s * 3.55), (0, 3.9, s * 3.6), (0, 3.4, s * 3.6)], [0.03, 0.03, 0.05], 5)
        A.ball(0, 3.3, s * 3.6, 0.09, 8, 6, (1, 1.5, 1))
    A.flush()
    # photo-finish camera on a bracket from the beam, just before the line (clear of the banner), lens looking down
    A = Acc("fCam", "brass", o, 0.03)
    A.boxc(-0.55, 4.45, 0, 0.5, 0.34, 0.6)
    A.tube((-0.3, 4.76, 0), (-0.55, 4.6, 0), 0.05, 6)
    A.flush()
    A = Acc("fLens", "dark", o, 0.02)
    A.cylc(-0.55, 4.18, 0, 0.17, 0.2, 14)
    A.flush()
    A = Acc("fLensGlow", "glass", o, 0.0)
    A.cylc(-0.55, 4.07, 0, 0.12, 0.02, 12)
    A.flush()
    A = Acc("fCamLamp", "glowred", o, 0.0)
    A.ball(-0.4, 4.45, 0.31, 0.04, 6, 4)
    A.flush()
    # a pennant on each finial
    A = Acc("fPennant", "red", o, 0.02)
    for s in (-1, 1):
        A.tube((0, 6.0, s * PZ), (0, 6.7, s * PZ), 0.02, 5)
        A.poly([(0, 0), (0.9 * s * -1, 0.15), (0, 0.4)], 0.03, (0, 6.3, s * PZ), (0, 0, 0), "x")
    A.flush()


def board_A():
    o = pivot("dd_board", (0, 0, 0), None)
    A = Acc("bFrame", "gold", o, 0.04)
    A.boxc(0, 3.2, 0, 0.14, 0.5, 17.2); A.boxc(0, -3.2, 0, 0.14, 0.5, 17.2)
    for s in (-1, 1):
        A.boxc(0, 0, s * 8.35, 0.14, 6.6, 0.5)
    A.flush()
    A = Acc("bBezel", "plum", o, 0.03)
    A.boxc(0.06, 3.0, 0, 0.12, 0.22, 16.4); A.boxc(0.06, -3.0, 0, 0.12, 0.22, 16.4)
    for s in (-1, 1):
        A.boxc(0.06, 0, s * 8.1, 0.12, 6.2, 0.22)
    A.flush()
    A = Acc("bBulbs", "lamp", o, 0.0)
    n = 0
    for k in range(32):
        z = -8.35 + k * 16.7 / 31
        A.ball(0.1, 3.2, z, 0.06, 6, 4); A.ball(0.1, -3.2, z, 0.06, 6, 4)
    for k in range(1, 11):
        y = -3.2 + k * 6.4 / 11
        A.ball(0.1, y, 8.35, 0.06, 6, 4); A.ball(0.1, y, -8.35, 0.06, 6, 4)
    A.flush()
    A = Acc("bRosette", "brass", o, 0.03)
    for sy in (-1, 1):
        for sz in (-1, 1):
            A.cylc(0.12, sy * 3.2, sz * 8.35, 0.34, 0.08, 14, rot=(0, 0, PI / 2))
            A.tor(0.3, 0.04, (0.14, sy * 3.2, sz * 8.35), (0, 0, PI / 2), 16, 4)
    A.flush()
    A = Acc("bPediment", "gold", o, 0.04)
    A.boxc(0, 3.72, 0, 0.16, 0.54, 4.4)
    A.cylc(0, 4.5, 0, 1.0, 0.2, 24, rot=(0, 0, PI / 2))
    A.flush()
    A = Acc("bPedPlum", "plum", o, 0.03)
    A.cylc(0.1, 4.5, 0, 0.82, 0.1, 24, rot=(0, 0, PI / 2))
    A.flush()
    A = Acc("bDuck", "body", o, 0.03)       # duck in relief on the medallion
    A.ball(0.2, 4.35, 0, 0.36, 12, 8, (0.35, 0.6, 0.9)); A.ball(0.2, 4.75, 0.18, 0.2, 10, 8, (0.35, 1, 1))
    A.flush()
    A = Acc("bDuckBill", "bill", o, 0.0)
    A.rbc(0.2, 4.73, 0.44, 0.1, 0.09, 0.28, 0.6)
    A.flush()
    A = Acc("bFinial", "brass", o, 0.03)
    for s in (-1, 1):
        A.lath([(0, 3.4), (0.3, 3.4), (0.22, 3.6), (0.12, 3.9), (0.2, 4.1), (0.12, 4.25), (0, 4.4)], (0, 0, s * 8.3), (0, 0, 0), (1, 1, 1), 12)
    A.flush()
    pivot("face", (0.1, 0, 0), o, role="face", w=16.0, h=6.0)


def kiosk_A():
    o = pivot("dd_kiosk", (0, 0, 0), None)
    A = Acc("kBody", "plum", o, 0.05)
    A.boxc(0, 0.65, 0, 2.6, 1.3, 1.3)
    A.flush()
    A = Acc("kGold", "gold", o, 0.03)
    A.boxc(0, 0.06, 0, 2.8, 0.12, 1.5)
    A.boxc(0, 1.34, 0, 2.9, 0.12, 1.6)
    for sx in (-1, 1):
        A.boxc(sx * 1.4, 0.66, 0.0, 0.1, 1.2, 1.4)
    A.flush()
    A = Acc("kFrame", "brass", o, 0.0); P = Acc("kPanel", "plum2", o, 0.0); R = Acc("kSuitRed", "suitred", o, 0.012); K = Acc("kSuitCream", "suitcream", o, 0.012)
    suit_panel(A, P, R, K, 0, (-0.65, 0.66, 0.65), 0, 1.0, 0.7, 0.4); suit_panel(A, P, R, K, 1, (0.65, 0.66, 0.65), 0, 1.0, 0.7, 0.4)
    A.flush(); P.flush(); R.flush(); K.flush()
    # window: brass posts, header, screen inside
    A = Acc("kWindow", "brass", o, 0.03)
    for sx in (-1, 1):
        A.cylc(sx * 1.15, 1.95, -0.25, 0.06, 1.2, 8)
    A.boxc(0, 2.55, -0.25, 2.5, 0.1, 0.2)
    A.flush()
    A = Acc("kBack", "plum2", o, 0.03)
    A.boxc(0, 1.95, -0.5, 2.5, 1.3, 0.12)
    A.flush()
    A = Acc("kValance", "red", o, 0.03)
    for k in range(10):
        A.add(cylinder(0.14, 0.14, 0.4, 8), (-1.1 + k * 0.245, 2.75, -0.2), (0, 0, 0))
        A.ball(-1.1 + k * 0.245, 2.55, -0.2, 0.14, 8, 5, (1, 0.8, 1))
    A.flush()
    A = Acc("kValCream", "cream", o, 0.0)
    for k in range(0, 10, 2):
        A.ball(-1.1 + k * 0.245, 2.55, -0.2, 0.15, 8, 5, (1, 0.82, 1.02))
    A.flush()
    pivot("screen", (0, 1.95, -0.42), o, role="screen", w=2.3, h=1.1, tilt=0.0)
    A = Acc("kScreenRim", "gold", o, 0.0)
    A.boxc(0, 2.52, -0.43, 2.5, 0.06, 0.04); A.boxc(0, 1.38, -0.43, 2.5, 0.06, 0.04)
    for sx in (-1, 1):
        A.boxc(sx * 1.2, 1.95, -0.43, 0.06, 1.2, 0.04)
    A.flush()
    # four lane-coloured buttons, ticket slot, bell
    for i in range(4):
        A = Acc(f"kBtn{i + 1}", f"lane{i + 1}", o, 0.0)
        A.cylc(-0.75 + i * 0.5, 1.45, 0.3, 0.16, 0.08, 14)
        A.flush()
    A = Acc("kBtnRing", "brass", o, 0.02)
    for i in range(4):
        A.tor(0.19, 0.03, (-0.75 + i * 0.5, 1.43, 0.3), (0, 0, 0), 16, 4)
    A.cylc(1.05, 1.42, -0.1, 0.1, 0.16, 12)
    A.ball(1.05, 1.55, -0.1, 0.1, 10, 5)
    A.flush()
    A = Acc("kSlot", "dark", o, 0.0)
    A.boxc(-1.0, 1.4, -0.1, 0.4, 0.04, 0.05)
    A.flush()
    A = Acc("kLamp", "lamp", o, 0.0)
    A.ball(-1.15, 2.6, -0.25, 0.08, 6, 4); A.ball(1.15, 2.6, -0.25, 0.08, 6, 4)
    A.flush()


def rail_A():
    o = pivot("dd_railpost", (0, 0, 0), None)
    A = Acc("rPost", "brass", o, 0.03)
    A.lath([(0, 0), (0.3, 0), (0.3, 0.06), (0.16, 0.14), (0.11, 0.3), (0.18, 0.5), (0.1, 0.66), (0.1, 1.0), (0.17, 1.08), (0.17, 1.14), (0.1, 1.2), (0.0, 1.2)], (0, 0, 0), (0, 0, 0), (1, 1, 1), 12)
    A.flush()
    A = Acc("rBall", "gold", o, 0.0)
    A.ball(0, 1.33, 0, 0.14, 10, 8)
    A.flush()
    pole = pivot("dd_rope", (0, 0, 0), None)
    A = Acc("rRope", "velvet", pole, 0.02)
    pts = [(0, 1.0 - 0.2 * (1 - (2 * t / 8 - 1) ** 2), 0) for t in range(0, 9)]
    A.path([(t * 3.5 / 8, y, 0) for t, (_, y, _) in enumerate(pts)], 0.05, 6)
    A.flush()
    A = Acc("rRopeRing", "gold", pole, 0.0)
    A.ball(0, 1.0, 0, 0.07, 8, 6); A.ball(3.5, 1.0, 0, 0.07, 8, 6)
    A.flush()




trough_A(); gate_A(); finish_A(); board_A(); kiosk_A(); rail_A()
for i in (1, 2, 3, 4):
    duck_A(i)
flush_all()
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
