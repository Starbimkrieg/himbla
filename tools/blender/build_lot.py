# Lucky Crater Casino forecourt kit for Blender (4.2+ / 5.x) -> src/assets/lot.glb: the Valet Court's barrier, bollards and signs (docs/casino-forecourt.md).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_lot.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_lot.py
#
# three.js axes (x right, y up, +z front), each model on y = 0, origin on the ground; one material per mesh named after a slot (LOT_TOON / LOT_GLOW in src/models.js;
# glow slots are lit); `ink` = outline thickness in m:
#   lot_card_wall   2.4 m of barrier, 1.25 m tall, 0.6 m deep: plum kerb, gold cap, four giant playing cards each turned 14 degrees from the last (a domino zigzag), leaning back
#                   a little, a suit on both faces. Runs repeat it end to end, 2.4 m apart
#   lot_card_post   end / corner post: plum plinth, gold shaft, brass collar, gold chip on a pin, 1.9 m
#   lot_chip_bollard  walkway bollard: eight stacked chips (red, cream, gold, violet, twice), dark cap, glowing cyan ring, 1 m, 0.42 m across
#   lot_pylon_p     parking sign: plum post on a gold footing, brass-framed board with a neon P on both faces, lit diamond on top, 4.7 m, facing +z
#   lot_bay_stud    bay head stop: gold half-chip stud with a cream inlay, 0.3 m across
import bpy, bmesh, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_lot.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("LOT_OUT") or os.path.join(REPO, "src", "assets", "lot.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Lot export ->", OUT)
COLL = "MoonLot"
PI = math.pi


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "plum": "4a1766", "plum2": "6a2a8f", "gold": "ffd23f", "brass": "c79a1f", "cream": "fff4e0", "dark": "1a1030", "red": "d7263d", "pink": "ff2e88",
    "suitred": "ff2a4a", "suitcream": "fff4e0", "lamp": "fff6a8", "glowcyan": "2ee6ff", "cardface": "d9d2ee",
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

    def tor(self, R, r, t=(0, 0, 0), rot=(0, 0, 0), n=24, rs=6, s=(1, 1, 1)):
        self.geos.append(xf(torus(R, r, n, rs), t, rot, s)); return self

    def path(self, pts, r, seg=6):
        self.geos.append(tube(pts, r if isinstance(r, (list, tuple)) else [r] * len(pts), seg)); return self

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


exec(open(os.path.join(REPO, "tools", "blender", "suits.py"), encoding="utf-8").read(), globals())   # heart_outline(), shared with the hall, table, Duck Derby and claw


def lite_suit(kind, s, depth):
    """suits.py's four suits with far fewer facets (a wall run repeats them 300 times): flat shapes extruded along z, ~s m tall, centred."""
    def ring(cx, cy, r, n=10):
        return [(cx + r * math.cos(2 * PI * i / n), cy + r * math.sin(2 * PI * i / n)) for i in range(n)]
    if kind == 1:
        k = s / 29.0
        return [extrude([(x * k, (y + 2.5) * k) for x, y in heart_outline()[::2]], depth, "z")]
    if kind == 2:
        return [extrude([(0, 0.5 * s), (0.32 * s, 0), (0, -0.5 * s), (-0.32 * s, 0)], depth, "z")]
    if kind == 0:
        k = s / 35.0
        return [extrude([(x * k, (y - 2.5) * k) for x, y in heart_outline(True)[::2]], depth, "z"),
                extrude([(-2 * k, -2.5 * k), (2 * k, -2.5 * k), (5 * k, -15.5 * k), (-5 * k, -15.5 * k)], depth * 0.7, "z")]
    r = 0.2 * s
    return [extrude(ring(x * s, y * s, r), depth, "z") for x, y in ((0, 0.22), (-0.22, -0.08), (0.22, -0.08))] + \
        [extrude([(-0.05 * s, 0.0), (0.05 * s, 0.0), (0.12 * s, -0.46 * s), (-0.12 * s, -0.46 * s)], depth * 0.7, "z")]


# =====================================================================================================
# the card wall: 2.4 m
# =====================================================================================================
root = pivot("lot_card_wall", (0, 0, 0))
plum = Acc("lot_card_wall_plum", "plum", root, 0.02)
gold = Acc("lot_card_wall_gold", "gold", root, 0.012)
cream = Acc("lot_card_wall_cream", "cardface", root, 0.012)       # (card faces are lit, or a wall in shade reads as dark plates)
red = Acc("lot_card_wall_suitred", "suitred", root, 0.0)
suitc = Acc("lot_card_wall_suitcream", "suitcream", root, 0.0)
plum.box(-1.2, 1.2, 0.0, 0.34, -0.3, 0.3)                                          # kerb
gold.box(-1.19, 1.19, 0.34, 0.40, -0.25, 0.25)                                     # cap
CW, CH, CT = 0.5, 0.95, 0.05                                                       # card: 0.5 x 0.95 m, 5 cm thick
for i in range(4):
    kind = i                                                                       # spade, heart, diamond, club
    x = -0.9 + i * 0.6
    yaw = 0.25 if i % 2 == 0 else -0.25
    t, rot = (x, 0.40 + CH / 2 - 0.03, 0.0), (0.1, yaw, 0)                         # (sunk 3 cm into the cap; leaning back 6 degrees)
    cream.add(rbox(CW / 2, CH / 2, CT / 2, 0.12, 8, 4), t, rot)
    for side, z in ((1, CT / 2 + 0.006), (-1, -(CT / 2 + 0.006))):                 # a suit on each face, above the middle
        geos = [xf(g[:2], (0, 0.12, z), (0, 0 if side > 0 else PI, 0)) for g in lite_suit(kind, 0.32, 0.012)]
        (red if kind in (1, 2) else suitc).add(join(geos), t, rot)

# =====================================================================================================
# the end / corner post
# =====================================================================================================
root = pivot("lot_card_post", (0, 0, 0))
plum = Acc("lot_card_post_plum", "plum", root, 0.02)
gold = Acc("lot_card_post_gold", "gold", root, 0.02)
brass = Acc("lot_card_post_brass", "brass", root, 0.012)
pink = Acc("lot_card_post_pink", "pink", root, 0.0)
plum.box(-0.36, 0.36, 0.0, 0.30, -0.36, 0.36)                                      # plinth
gold.box(-0.26, 0.26, 0.30, 1.22, -0.26, 0.26)                                     # shaft
brass.box(-0.31, 0.31, 1.22, 1.34, -0.31, 0.31)                                    # collar
plum.box(-0.24, 0.24, 1.34, 1.42, -0.24, 0.24)                                     # cap
brass.cylc(0, 1.52, 0, 0.05, 0.2, 8)                                               # pin
gold.cylc(0, 1.7, 0, 0.32, 0.12, 20, rot=(PI / 2, 0, 0))                           # chip on edge, face toward +z
pink.cylc(0, 1.7, 0, 0.2, 0.14, 20, rot=(PI / 2, 0, 0))                            # (inlay 1 cm proud each side)

# =====================================================================================================
# the walkway's chip bollard
# =====================================================================================================
root = pivot("lot_chip_bollard", (0, 0, 0))
chips = [Acc(f"lot_chip_bollard_{s}", s, root, 0.012) for s in ("red", "cream", "gold", "plum2")]
dark = Acc("lot_chip_bollard_dark", "dark", root, 0.012)
cyan = Acc("lot_chip_bollard_cyan", "glowcyan", root, 0.0)
CHH = 0.11
for i in range(8):
    r = 0.42 if i % 2 == 0 else 0.40
    chips[i % 4].cylc(0, CHH / 2 + i * CHH, 0, r, CHH, 20)
dark.cylc(0, 8 * CHH + 0.02, 0, 0.34, 0.04, 20)                                    # cap
cyan.tor(0.28, 0.03, (0, 8 * CHH + 0.05, 0), n=24, rs=6)                          # ring (half sunk into the cap top)

# =====================================================================================================
# the P pylon
# =====================================================================================================
root = pivot("lot_pylon_p", (0, 0, 0))
plum = Acc("lot_pylon_p_plum", "plum", root, 0.02)
gold = Acc("lot_pylon_p_gold", "gold", root, 0.02)
brass = Acc("lot_pylon_p_brass", "brass", root, 0.012)
cyan = Acc("lot_pylon_p_cyan", "glowcyan", root, 0.0)
sred = Acc("lot_pylon_p_suitred", "suitred", root, 0.0)
gold.box(-0.45, 0.45, 0.0, 0.22, -0.45, 0.45)                                      # footing
plum.box(-0.18, 0.18, 0.22, 2.70, -0.18, 0.18)                                     # post
brass.box(-0.26, 0.26, 2.66, 2.74, -0.26, 0.26)                                    # collar
brass.box(-0.78, 0.78, 2.62, 4.18, -0.08, 0.08)                                    # board frame
plum.box(-0.70, 0.70, 2.70, 4.10, -0.10, 0.10)                                     # board face, 2 cm proud of the frame each side
P_PTS = [(-0.22, -0.45), (-0.22, 0.45), (0.05, 0.45)] + [(0.05 + 0.25 * math.sin(PI * i / 10), 0.20 + 0.25 * math.cos(PI * i / 10)) for i in range(1, 10)] + [(0.05, -0.05), (-0.22, -0.05)]
for side in (1, -1):                                                                # neon P on both faces (mirrored behind so it reads)
    cyan.path([(side * x, 3.40 + y, side * 0.13) for x, y in P_PTS], 0.04, 6)
sred.add(extrude([(0, 0.3), (0.2, 0), (0, -0.3), (-0.2, 0)], 0.1, "z"), (0, 4.55, 0))   # lit diamond on top, on a brass pin
brass.cylc(0, 4.26, 0, 0.04, 0.16, 8)

# =====================================================================================================
# the bay stud
# =====================================================================================================
root = pivot("lot_bay_stud", (0, 0, 0))
gold = Acc("lot_bay_stud_gold", "gold", root, 0.012)
cream = Acc("lot_bay_stud_cream", "cream", root, 0.0)
gold.cylc(0, 0.04, 0, 0.15, 0.08, 16)
cream.cylc(0, 0.085, 0, 0.1, 0.05, 16)

flush_all()
audit_coplanar(C.objects)
audit_flips(C.objects)

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
