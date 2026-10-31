# ILMB Meridian Labs builder for Blender (4.2+ / 5.x): Meridian's research wing, exported to src/assets/labs.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_labs.py").read())
# or headless:                              MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/build_labs.py
# (MOONRUNNER_EXPORT=0 builds without writing the file.)
#
# "The Pylon": a cream two-storey lab block (ribbon windows behind cream fins, a cyan belt and parapet, a navy board with the
# Meridian globe and MERIDIAN LABS in gold on both long sides, a loading bay) and, off its outer end, a 55 m pylon leaning out
# 14 degrees, held back by four stays to a counterweight block on the roof. On the pylon's top a glazed sky lab, and on that a
# gold armillary globe (the Meridian mark in the round) that turns. On the roof an observatory whose dome turns, its slit open
# on a telescope, and plant boxes. Planters and lamp bollards on the arrival plaza.
#
# Frame: three.js axes (x right, y up, +z forward), metres, origin on the ground at the wing centre; the ILMB wing frame
# (world.js wing()): +x away from the hub, -x toward the skywalk, which docks into the lobby's face at x = -18.6 (floor 0.6).
# Block x -15 to 15, z -12 to 12, roof 12.08 (parapet 12.8); pylon foot at x 18, leaning toward +x; sky lab centred at
# about (31.3, 53.9, 0), radius 8.4; globe to 66.5. Footprint about x -30 to 40 (plaza bollards; the sky lab overhangs from 50 m up), z -16 to 13.
#
# Root empty `labs` (extras `radius`, `dock`: wing centre to the lobby face). Pivots (empties with a `role`):
#   fan      `labs_dome` (the observatory dome, slit and telescope) and `labs_globe` (the armillary globe): turned about y,
#            extra `spin` (rad/s)
#   blinker  the aircraft lamp over the globe (extra `radius`)
#   col      a collider (wing_kit.col: box (the pylon's pitched) / cyl)
# Each mesh has ONE material named after a slot (WING_TOON / WING_GLOW in src/models.js): toon wall white light cyan navy gold
# roof dark metal steel concrete door hazard leaf2 planter; glow pane lamp; `glass` see-through. Fixed palette
# (Meridian: cream, cyan, navy, gold). Ink (metres) per style.md.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_labs.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("LABS_OUT") or os.path.join(REPO, "src", "assets", "labs.glb")
COLL = "IlmbLabs"
PFX = "labs_"
HEX = {
    "wall": 0xfff4e0, "white": 0xf3eee4, "light": 0xd8d4e8, "cyan": 0x2ec4ff, "navy": 0x1b3a8f, "gold": 0xffd23f,
    "panel": 0x5b5870, "roof": 0x3a3550, "dark": 0x2a2540, "metal": 0x8a87a0, "steel": 0x55607a, "concrete": 0xb8b2cc,
    "pave": 0x9d97b0, "door": 0x2a2540, "hazard": 0xffd23f, "leaf2": 0x5cc94a, "planter": 0x6f6878,
    # glow
    "pane": 0xbfefff, "window": 0xfff6a8, "lamp": 0xfff6a8, "glass": 0x9be7ff,
}
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())
from mathutils import Vector

DOCK = 18.6
ROOT = pivot("labs", (0, 0, 0), None, radius=40.0, dock=DOCK)
UP = Vector((0, 1, 0))
X0, X1, ZH = -15.0, 15.0, 12.0     # block
WT, RF = 12.0, 12.08                # wall top, roof deck
LEAN = math.radians(14)
F = Vector((18.0, 0.5, 0))          # pylon foot (inside its pedestal)
L = 55.0                            # pylon length along its axis
D = Vector((math.sin(LEAN), math.cos(LEAN), 0))
T = F + D * L                       # pylon top: the sky lab's floor centre
BK = Vector((-math.cos(LEAN), math.sin(LEAN), 0))   # the pylon's back (toward the hub), square to its axis
HW0, HW1, CH = 2.4, 1.6, 0.5        # pylon half widths at foot and top, corner chamfer


def hw(t):
    return HW0 + (HW1 - HW0) * t / L


def octa(h, c=CH):
    """a chamfered square of half width h"""
    return [(h, -h + c), (h, h - c), (h - c, h), (-h + c, h), (-h, h - c), (-h, -h + c), (-h + c, -h), (h - c, -h)]


def leaned(g):
    """a part built upright (y along the pylon from its foot) turned onto the pylon"""
    return xf(xf(g, (0, 0, 0), (0, 0, -LEAN)), tuple(F))


def pylon_slice(t0, t1, grow):
    return leaned(frustum(octa(hw(t0) + grow), octa(hw(t1) + grow), t0, t1))


# ================= the lab block =================
Acc.of("concrete", 0.03).put(box(0, 0.205, 0, 30.8, 0.39, 24.8))
Acc.of("wall", 0.1).put(box(0, (0.4 + WT) / 2, 0, X1 - X0, WT - 0.4, 2 * ZH))
Acc.of("roof", 0.0).put(box(0, WT + 0.04, 0, 29.0, 0.08, 23.0))
par = Acc.of("cyan", 0.04)
for sz in (-1, 1):
    par.put(box(0, WT + 0.4, sz * 11.85, 30.6, 0.8, 0.6))
for sx in (-1, 1):
    par.put(box(sx * 14.85, WT + 0.4, 0, 0.6, 0.8, 23.1))
Acc.of("cyan", 0.012).put(box(0, 4.9, 0, 30.1, 0.6, 24.1))   # floor belt

# ribbon windows behind fins: both long faces, the outer end, the hub end either side of the lobby
pane, fin = Acc.of("pane", 0.0), Acc.of("wall", 0.012)
STOREYS = ((1.8, 4.0), (6.2, 8.6))
BAY = (3.5, 9.5)                    # the loading bay on the -z face (x range): no storey-1 window there
for sz in (-1, 1):
    for i, (v0, v1) in enumerate(STOREYS):
        runs = [(-14.4, 14.4)] if (sz > 0 or i == 1) else [(-14.4, BAY[0]), (BAY[1], 14.4)]
        for a, b in runs:
            pane.put(box((a + b) / 2, (v0 + v1) / 2, sz * (ZH + 0.003), b - a, v1 - v0, 0.02))
        for k in range(20):
            x = -14.25 + k * 1.5
            if any(a - 0.3 < x < b + 0.3 for a, b in runs):
                fin.put(box(x, (v0 + v1) / 2, sz * (ZH + 0.2), 0.22, v1 - v0 + 0.5, 0.5))
for i, (v0, v1) in enumerate(STOREYS):
    pane.put(box(X1 + 0.003, (v0 + v1) / 2, 0, 0.02, v1 - v0, 22.8))
    for k in range(16):
        fin.put(box(X1 + 0.2, (v0 + v1) / 2, -11.25 + k * 1.5, 0.5, v1 - v0 + 0.5, 0.22))
    for sz in (-1, 1):                                          # hub end, clear of the lobby (z +-4.5)
        pane.put(box(X0 - 0.003, (v0 + v1) / 2, sz * 8.4, 0.02, v1 - v0, 6.4))
        for z in (5.6, 7.1, 8.6, 10.1, 11.4):
            fin.put(box(X0 - 0.2, (v0 + v1) / 2, sz * z, 0.5, v1 - v0 + 0.5, 0.22))

# the navy board with the globe and the name, on both long faces, between the upper windows and the parapet
boards = []
for face, z in (("+z", ZH), ("-z", -ZH)):
    d = Dec(face, (0, 0, z), lift=0.004)
    d.rect(-11.2, 9.25, 11.2, 11.65, "navy", 0)
    cu, cv, r = -9.55, 10.45, 1.0
    d.ring(cu, cv, r * 0.62, r * 0.76, "gold", 1, 28)
    d.rect(cu - r * 0.62, cv - r * 0.06, cu + r * 0.62, cv + r * 0.06, "gold", 1)
    d.ring(cu, cv, r * 0.24, r * 0.33, "gold", 1, 20, sy=2.3)
    d.rect(cu - r * 0.05, cv - r * 0.62, cu + r * 0.05, cv + r * 0.62, "gold", 1)
    d.text("MERIDIAN LABS", -7.95, 9.61, 0.24, "gold", 1)
    boards += d.build(f"{PFX}board{face[0] == '+' and 'N' or 'S'}", ROOT)

# loading bay (-z face): roll-up door, hazard frame, lamp, ramp
door = Acc.of("door", 0.0)
door.put(box(6.5, 2.4, -ZH - 0.003, 4.6, 3.6, 0.02))
for k in range(6):
    Acc.of("dark", 0.0).put(box(6.5, 0.9 + k * 0.6, -ZH - 0.016, 4.4, 0.06, 0.01))
Acc.of("hazard", 0.012).put(box(6.5, 4.5, -ZH - 0.12, 5.6, 0.3, 0.24))
for sx in (-1, 1):
    Acc.of("hazard", 0.012).put(box(6.5 + sx * 2.65, 2.4, -ZH - 0.12, 0.3, 3.9, 0.24))
Acc.of("lamp", 0.0).put(box(6.5, 4.85, -ZH - 0.06, 1.2, 0.18, 0.12))
Acc.of("concrete", 0.02).put(frustum([(3.8, -12.4), (9.2, -12.4), (9.2, -16.0), (3.8, -16.0)], [(3.8, -12.4), (9.2, -12.4), (9.2, -12.6), (3.8, -12.6)], 0.0, 0.42))

# lobby where the skywalk docks
lobby(-DOCK, 4.0, 9.0, 6.6, "wall", "cyan", win_x=(-17.0,))
# a fixed ladder up the outer end to the roof (between two fins, standing off them)
ladder(Acc.of("steel", 0.012), Acc.of("steel", 0.0), X1 + 0.7, -10.5, 0.4, WT + 0.8, 0.0)
for y in (3.0, 7.0, 11.0):                                      # wall brackets
    Acc.of("steel", 0.008).put(box(X1 + 0.35, y, -10.5, 0.7, 0.08, 0.5))

# ================= the roof: counterweight, plant boxes, observatory =================
cw = Acc.of("concrete", 0.05)
cw.put(box(-12.0, RF + 1.2, 0, 5.0, 2.4, 20.0))
Acc.of("cyan", 0.012).put(box(-12.0, RF + 2.1, 0, 5.1, 0.3, 20.1))
ANCH = [Vector((-11.4, RF + 2.4, sz * 8.0)) for sz in (-1, 1)]
for a in ANCH:
    Acc.of("gold", 0.02).put(box(a.x, a.y + 0.2, a.z, 1.6, 0.4, 1.2))
for x, z in ((-4.0, -4.5), (-4.0, 4.5)):                        # air plant: housings with fan rings
    Acc.of("light", 0.04).put(box(x, RF + 1.1, z, 3.2, 2.2, 2.4))
    Acc.of("dark", 0.015).put(cyl(x, RF + 2.25, z, 0.85, 0.1, 14))
    Acc.of("metal", 0.0).put(cyl(x, RF + 2.31, z, 0.7, 0.02, 14))
    Acc.of("steel", 0.0).put(box(x + 1.603, RF + 0.9, z, 0.02, 1.2, 1.6))
# observatory: a drum on the roof; the dome, its slit and the telescope turn (fan)
OX, OR = 7.0, 4.2
Acc.of("wall", 0.05).put(cyl(OX, RF + 1.3, 0, OR, 2.6, 24))
Acc.of("gold", 0.02).put(cyl(OX, RF + 2.5, 0, OR + 0.15, 0.25, 24))
DOME = pivot(f"{PFX}dome", (OX, RF + 2.6, 0), ROOT, role="fan", spin=0.05)
Acc.of("light", 0.05, parent=DOME).put(xf(sphere(OR + 0.05, 24, 8, PI / 2)[:2], (0, 0.02, 0)))
rows = []
for j in range(9):                                              # the slit: a dark strip over the dome from the rim past the top
    ph = math.radians(-2 + j * 11.5)
    rr, y = (OR + 0.08) * math.cos(ph), (OR + 0.08) * math.sin(ph) + 0.02
    rows.append([(rr, y, -0.75), (rr, y, 0.75)])
Acc.of("dark", 0.0, raw=True, parent=DOME).put(strip(rows, lambda c: (c.x, c.y, 0)))
Acc.of("white", 0.03, parent=DOME).put(xf(cylinder(0.45, 0.55, 5.2, 12)[:2], (1.6, 2.0, 0), (0, 0, -0.85)))
Acc.of("dark", 0.0, parent=DOME).put(xf(cylinder(0.46, 0.46, 0.05, 12)[:2], (1.6 + 2.62 * math.sin(0.85), 2.0 + 2.62 * math.cos(0.85), 0), (0, 0, -0.85)))
Acc.of("steel", 0.02, parent=DOME).put(cyl(0, 0.6, 0, 0.5, 1.2, 10))

# ================= the pylon, its stays and the sky lab =================
Acc.of("concrete", 0.06).put(box(18.5, 1.1, 0, 5.8, 2.2, 7.2))
Acc.of("gold", 0.012).put(box(18.5, 1.9, 0, 5.9, 0.3, 7.3))
Acc.of("cyan", 0.12).put(pylon_slice(0.0, L, 0.0))
for t in (L * 0.25, L * 0.5, L * 0.75):
    Acc.of("wall", 0.03).put(pylon_slice(t - 0.5, t + 0.5, 0.12))
for t in (36.0, 46.0):                                           # stay saddles
    Acc.of("gold", 0.03).put(pylon_slice(t - 0.6, t + 0.6, 0.2))
# the lift glass up the outer face
lg = []
for t in (3.0, L - 4.0):
    h = hw(t)
    lg.append([Vector((h + 0.008, t, -0.65)), Vector((h + 0.008, t, 0.65))])
pane.put(leaned(panel(lg[0][0], lg[1][0], lg[1][1], lg[0][1])))
# stays: from the anchors to the saddles' back face, a pair at each saddle
stay = Acc.of("dark", 0.012)
for t, a in ((36.0, ANCH[0]), (36.0, ANCH[1]), (46.0, ANCH[0]), (46.0, ANCH[1])):
    p = F + D * t + BK * (hw(t) + 0.15) + Vector((0, 0, 0.9 if a.z > 0 else -0.9))
    stay.put(B(tuple(a + Vector((0, 0.35, 0))), tuple(p), 0.11, 6, cap=True))
    Acc.of("gold", 0.0).put(B(tuple(a + Vector((0, 0.3, 0))), tuple(a + (p - a).normalized() * 0.9 + Vector((0, 0.35, 0))), 0.2, 6, cap=True))
# the sky lab: underside, glazed ring, roof, a lift core inside
Y = T.y
Acc.of("wall", 0.07).put(xf(lathe([(0, -4.4), (2.0, -4.4), (5.6, -1.4), (8.2, 0.0), (0, 0.0)], 32), tuple(T)))
Acc.of("gold", 0.03).put(ring(8.2, 0.22, 0.05, 48, 6, t=tuple(T)))
glass = Acc.of("glass", 0.0)
glass.put(xf(cylinder_arc(7.9, 7.9, 3.0, 32)[:2], (T.x, Y + 1.6, 0)))
for i in range(16):
    a = (i + 0.5) * TAU / 16
    Acc.of("white", 0.015).put(box(T.x + math.cos(a) * 7.9, Y + 1.6, math.sin(a) * 7.9, 0.24, 3.0, 0.24, (0, -a, 0)))
pane.put(xf(sector([(7.2, 0.0), (7.85, 0.0), (7.85, 0.3), (7.2, 0.3)], 0, TAU, 32, cap=False), (T.x, Y + 0.02, 0)))   # floor-edge light
Acc.of("wall", 0.03).put(cyl(T.x, Y + 1.56, 0, 2.4, 3.08, 16))      # the lift core (the pylon's top ends in it)
Acc.of("cyan", 0.07).put(xf(lathe([(0, 3.1), (8.4, 3.1), (8.4, 3.5), (5.0, 4.4), (0, 4.6)], 32), (T.x, Y, 0)))
Acc.of("gold", 0.03).put(ring(8.4, 0.2, 3.3, 48, 6, t=(T.x, Y, 0)))
for i in range(12):                                             # downlights set into the underside
    a = i * TAU / 12
    Acc.of("lamp", 0.0).put(ball(T.x + math.cos(a) * 6.6, Y - 0.86, math.sin(a) * 6.6, 0.26, 8, 5))
# the armillary globe on a short mast, turning (fan)
GY = Y + 4.5 + 3.6
Acc.of("dark", 0.02).put(cyl(T.x, Y + 4.5 + 0.5, 0, 0.3, 1.2, 8))
GLOBE = pivot(f"{PFX}globe", (T.x, GY, 0), ROOT, role="fan", spin=0.25)
gold = Acc.of("gold", 0.03, parent=GLOBE)
gold.put(ring(2.6, 0.17, 0.0, 40, 6))                           # equator
gold.put(xf(torus(2.6, 0.17, 40, 6), (0, 0, 0), (PI / 2, 0, 0)))       # meridians
gold.put(xf(torus(2.5, 0.13, 40, 6), (0, 0, 0), (PI / 2, PI / 2, 0)))
Acc.of("cyan", 0.02, parent=GLOBE).put(ball(0, 0, 0, 0.8, 14, 9))
Acc.of("dark", 0.015, parent=GLOBE).put(cyl(0, -1.75, 0, 0.18, 1.7, 8))
Acc.of("dark", 0.015, parent=GLOBE).put(cyl(0, 3.2, 0, 0.14, 1.2, 8, rt=0.08))
pivot(f"{PFX}lamp", (T.x, GY + 4.05, 0), ROOT, role="blinker", radius=0.35)

# ================= the arrival plaza: planters, lamp bollards =================
plant, shrub, bol, bulb = Acc.of("planter", 0.03), Acc.of("leaf2", 0.02), Acc.of("steel", 0.012), Acc.of("lamp", 0.0)
for sz in (-1, 1):
    for x in (-21.5, -27.0):
        plant.put(box(x, 0.45, sz * 6.5, 3.0, 0.9, 1.6))
        for dx in (-0.8, 0.8):
            shrub.put(ball(x + dx, 1.15, sz * 6.5, 0.75, 8, 5, (1, 0.8, 1)))
    for x in (-24.2, -29.6):
        bol.put(cyl(x, 0.55, sz * 4.2, 0.16, 1.1, 8))
        bulb.put(cyl(x, 1.17, sz * 4.2, 0.17, 0.14, 8))

# ================= colliders =================
col((0, -0.5, 0), shape="box", hx=15.3, hy=6.65, hz=12.3, yaw=0.0)
col((-12.0, RF, 0), shape="box", hx=2.5, hy=1.3, hz=10.0, yaw=0.0)
col((OX, RF, 0), shape="cyl", r=OR + 0.2, h=7.2)
col((18.3, -0.5, 0), shape="box", hx=3.1, hy=1.35, hz=3.6, yaw=0.0)
mid = F + D * (L / 2)
col((mid.x, mid.y - L / 2, mid.z), shape="box", hx=HW0, hy=L / 2, hz=HW0, yaw=PI / 2, pitch=LEAN)
col((T.x, Y - 4.4, 0), shape="cyl", r=8.4, h=9.0)
for sz in (-1, 1):
    for x in (-21.5, -27.0):
        col((x, -0.5, sz * 6.5), shape="box", hx=1.5, hy=1.0, hz=0.8, yaw=0.0)

made = flush_all(ROOT, PFX) + boards
audit_coplanar(made)
audit_flips(made)
print(f"labs: {tri_count(made)} triangles in {len(made)} meshes, {NCOL[0]} colliders; sky lab at ({T.x:.1f}, {T.y:.1f})")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
