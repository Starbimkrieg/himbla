# ILMB Vostok Hangar builder for Blender (4.2+ / 5.x): Vostok's wing of the base, exported to src/assets/hangar.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_hangar.py").read())
# or headless:                              MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/build_hangar.py
# (MOONRUNNER_EXPORT=0 builds without writing the file.)
#
# A hardened shuttle hangar, slab-sided in the Vostok way: a faceted arch (upright walls, two pitches, a flat crown) in slate
# under seven red portal frames, bermed with regolith and sandbags up to the eaves along both sides. Its outer end stands open:
# two red blast-door leaves hang from an overhead track, slid half aside (hazard edges, the bay number 07), under a red star on
# the header. Inside, a lit bay: an overhead bridge crane with the tower cranes' hook block (hookblock.py) down on two falls,
# tool chests, a workbench, floor markings. Off the -z side a control tower: a ladder up its back, a cab with outward-raked
# glazing, a turning radar. In front, the apron with a taxi line, a stop bar and edge lights, a tug and a fuel bowser; the game
# parks a shuttle-bus on it (world.js wingHangar).
#
# Frame: three.js axes (x right, y up, +z forward), metres, origin on the ground at the wing centre; the ILMB wing frame
# (world.js wing()): +x away from the hub, -x toward the skywalk, which docks into the lobby's face at x = -21.6 (floor 0.6).
# Hangar x -17 to 17, z -13 to 13 (berms to +-19.5), crown 13; door opening z -9.5 to 9.5, 10 m tall; apron x 17 to 45, z
# -14 to 14; tower at (-6, -23.5), cab floor 14.6. Footprint about x -22 to 45, z -27 to 23.
#
# Root empty `hangar` (extras `radius`, `dock`: wing centre to the lobby face, `apron`: where the game parks the shuttle).
# Pivots (empties with a `role`):
#   fan      `hangar_radar`: the tower's radar, turned about y (extra `spin`, rad/s)
#   blinker  the aircraft lamp on the tower roof (extra `radius`)
#   col      a collider (wing_kit.col: box, some pitched / cyl / hcyl); the bay is open to skate into
# Each mesh has ONE material named after a slot (WING_TOON / WING_GLOW in src/models.js): toon slate slateDark red white
# dark steel concrete pave regolith sand hazard door; glow window lamp bay redlamp. Fixed palette
# (Vostok: slate and red). Ink (metres) per style.md.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_hangar.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("HANGAR_OUT") or os.path.join(REPO, "src", "assets", "hangar.glb")
COLL = "IlmbHangar"
PFX = "hangar_"
HEX = {
    "slate": 0x6b6f78, "slateDark": 0x2c2f38, "red": 0xff3b5c, "white": 0xf3eee4, "light": 0xd8d4e8, "panel": 0x5b5870,
    "roof": 0x3a3550, "dark": 0x2a2540, "metal": 0x8a87a0, "steel": 0x55607a, "concrete": 0xb8b2cc, "pave": 0x9d97b0,
    "regolith": 0xb7b0c3, "sand": 0x8f8577, "hazard": 0xffd23f, "door": 0x2a2540,
    # glow
    "window": 0xfff6a8, "lamp": 0xfff6a8, "bay": 0x7a7698, "redlamp": 0xff2a4a,
}
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "hookblock.py"), encoding="utf-8").read(), globals())
from mathutils import Vector

DOCK = 21.6
APRON_X = 34.0                      # where the game parks the shuttle-bus (its lowered ramp clears the door by 3 m)
ROOT = pivot("hangar", (0, 0, 0), None, radius=36.0, dock=DOCK, apron=APRON_X)
UP = Vector((0, 1, 0))
XB, XF = -17.0, 17.0                # back and front of the shell
TH = 0.6                            # shell thickness
# the half profile (z, y) from the ground up the +z side to the crown; mirrored for -z
HALF = [(13.0, 0.0), (13.0, 4.5), (9.5, 10.5), (4.0, 13.0)]
PROF = [(-z, y) for z, y in HALF] + list(reversed(HALF))       # -z foot, up over the crown, down to the +z foot
EDGES = [(Vector((0, a[1], a[0])), Vector((0, b[1], b[0]))) for a, b in zip(PROF, PROF[1:])]
PORTALS = [XB + i * (XF - XB) / 6 for i in range(7)]
OPEN = 9.5                          # door opening half width
OPEN_H = 10.0


def outward(a, b):
    """the outward normal of a profile edge from a to b (both in the x = 0 plane)"""
    e = (b - a).normalized()
    n = Vector((0, -e.z, e.y))                                  # e turned +90 degrees in the z-y plane
    mid = (a + b) / 2
    return n if n.dot(Vector((0, mid.y - 5.0, mid.z))) > 0 else -n


def slab_x(poly, x0, x1, inset=0.03):
    """a polygon in the (z, y) plane extruded from x0 to x1, its corners drawn in toward its middle by `inset` (so its edges sit
    just inside the shell slabs it meets instead of on their faces)"""
    cz, cy = sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)
    pts = []
    for z, y in poly:
        dz, dy = cz - z, cy - y
        k = inset / (math.hypot(dz, dy) or 1.0)
        pts.append((z + dz * k, y + dy * k))
    return xf(extrude(pts, x1 - x0, "x"), ((x0 + x1) / 2, 0, 0))


# ================= the shell, its portal frames, the back wall and the front =================
# (the slabs meet corner to corner, so they keep frame_box's winding: welded corners would confuse a normal recalculation)
shell, shellr = Acc.of("slate", 0.08), Acc.of("slate", 0.08, raw=True)
for a, b in EDGES:
    n = outward(a, b)
    e = (b - a)
    shellr.put(frame_box(a, Vector((1, 0, 0)), e.normalized(), n, XB, XF, 0.0, e.length, -TH, 0.0))
rib = Acc.of("red", 0.03, raw=True)
for x in PORTALS:
    for a, b in EDGES:
        n = outward(a, b)
        e = (b - a)
        rib.put(frame_box(a, Vector((1, 0, 0)), e.normalized(), n, x - 0.4, x + 0.4, -0.25, e.length + 0.25, -0.05, 0.35))   # (feet sunk 0.25 in the ground)
# panel seams on the pitches and crown, halfway between the frames (flush, no ink); vents along the crown
seam = Acc.of("slateDark", 0.0, raw=True)
for x in [(p + q) / 2 for p, q in zip(PORTALS, PORTALS[1:])]:
    for a, b in EDGES[1:-1]:
        n = outward(a, b)
        e = (b - a)
        seam.put(frame_box(a, Vector((1, 0, 0)), e.normalized(), n, x - 0.07, x + 0.07, 0.05, e.length - 0.05, -0.01, 0.004))
for x in (-11.0, -3.5, 3.5, 11.0):
    Acc.of("steel", 0.02).put(box(x, 13.3, 0, 1.6, 0.6, 1.6))
    Acc.of("dark", 0.0).put(box(x, 13.605, 0, 1.2, 0.01, 1.2))
shell.put(slab_x(PROF, XB + 0.01, XB + TH))                     # back wall
for sz in (-1, 1):                                              # front: the jambs either side of the opening
    shell.put(slab_x([(sz * OPEN, 0.0), (sz * 13.0, 0.0), (sz * 13.0, 4.5), (sz * 9.5, 10.5)][::sz], XF - TH, XF - 0.01))
shell.put(slab_x([(-OPEN, OPEN_H), (OPEN, OPEN_H), (9.5, 10.5), (4.0, 13.0), (-4.0, 13.0), (-9.5, 10.5)], XF - TH, XF - 0.01))   # header
# berms of regolith up to the eaves, sloped at the ends, sandbags along the crest
for sz in (-1, 1):
    Acc.of("regolith", 0.04).put(frustum([(XB + 0.5, sz * 13.0), (XF - 1.0, sz * 13.0), (XF - 1.0, sz * 19.5), (XB + 0.5, sz * 19.5)][::sz],
                                         [(XB + 2.5, sz * 13.0), (XF - 2.0, sz * 13.0), (XF - 2.0, sz * 13.8), (XB + 2.5, sz * 13.8)][::sz], 0.0, 4.4))
    bag = Acc.of("sand", 0.015)
    for row, (zz, yy) in enumerate(((13.45, 4.58), (13.45, 4.93))):
        x = XB + 2.9 + row * 0.5
        while x < XF - 2.4:
            bag.put(box(x, yy, sz * zz, 0.95, 0.36, 0.62, (0, 0.04 * (1 if int(x) % 2 else -1), 0)))
            x += 1.02
# the red star on the header, between the door track and the crown
d = Dec("+x", (XF, 0, 0), lift=0.004)
d.disc(0.0, 11.9, 1.0, "slateDark", 0, 24)
d.star(0.0, 11.92, 0.8, 0.32, "red", 1)
decals_ = d.build(f"{PFX}star", ROOT)

# ================= the blast doors: a track over the opening, two leaves slid half aside =================
track = Acc.of("slateDark", 0.03)
track.put(box(XF + 0.9, 10.45, 0, 0.8, 0.9, 44.4))
for z in (-8.0, -4.0, 0.0, 4.0, 8.0):                           # brackets back to the header
    Acc.of("dark", 0.01).put(box(XF + 0.25, 10.45, z, 0.5, 0.5, 0.4))
for sz in (-1, 1):
    track.put(box(XF + 0.9, 5.3, sz * 22.0, 0.6, 10.2, 0.6))   # posts at the track's ends
    Acc.of("concrete", 0.02).put(box(XF + 0.9, 0.2, sz * 22.0, 1.4, 0.4, 1.4))
    z0, z1 = sorted((sz * 5.1, sz * 14.9))
    leaf = Acc.of("red", 0.05)
    leaf.put(box(XF + 0.9, 4.95, (z0 + z1) / 2, 0.5, 9.8, z1 - z0))
    for y in (2.4, 8.6):                                        # stiffener ribs
        Acc.of("slateDark", 0.012).put(box(XF + 1.18, y, (z0 + z1) / 2, 0.06, 0.24, z1 - z0 - 0.2))
    for z in ((z0 + z1) / 2 - 2.5, (z0 + z1) / 2 + 2.5):       # rollers in the track
        Acc.of("dark", 0.0).put(cyl(XF + 0.9, 9.95, z, 0.18, 0.2, 8, rot=(0, 0, PI / 2)))
    # hazard stripes on the leading edge and along the foot; the bay number
    lead = sz * 5.1                                             # the leaf's edge on the opening
    dl = Dec("+x", (XF + 1.15, 0, 0), lift=0.004)
    u_lead, u_far = -lead, -sz * 14.9                           # (+x face: u runs along -z)
    u_in = u_lead - sz * 1.0
    dl.hazard(min(u_lead, u_in), 0.15, max(u_lead, u_in), 9.75, "hazard", "dark", stripe=0.35)
    dl.hazard(min(u_in, u_far), 0.15, max(u_in, u_far), 1.05, "hazard", "dark", stripe=0.35)
    dl.text("07", -sz * 10.0, 3.6, 0.5, "white", 2, "c")
    decals_ += dl.build(f"{PFX}leaf{'N' if sz > 0 else 'S'}", ROOT)

# ================= the bay inside: floor, lights, crane, chests, bench =================
Acc.of("pave", 0.0).put(box(0, 0.06, 0, XF - XB - 2 * TH - 0.02, 0.12, 2 * (13.0 - TH) - 0.02))
mark = Acc.of("hazard", 0.0)
for z in (-6.5, 6.5):
    mark.put(box(-0.5, 0.125, z, 30.0, 0.01, 0.2))
x = -15.0
while x < 15.5:
    mark.put(box(x, 0.125, 0, 1.4, 0.01, 0.2))
    x += 2.6
Acc.of("bay", 0.0).put(box(XB + TH + 0.01, 5.2, 0, 0.02, 9.4, 20.0))   # the lit back wall
for z in (-3.0, 0.0, 3.0):
    Acc.of("lamp", 0.0).put(box(0, 13.0 - TH - 0.03, z, 28.0, 0.06, 0.5))
# overhead crane: runways on brackets off the walls, a bridge, a trolley, the hook down
crane, cr_y = Acc.of("hazard", 0.03), 8.6                      # (the walls' inner face is at z +-9.9 at this height)
for sz in (-1, 1):
    Acc.of("slateDark", 0.02).put(box(0, cr_y, sz * 9.2, 32.4, 0.6, 0.45))
    for x in PORTALS[1:-1]:
        Acc.of("slateDark", 0.01).put(box(x, cr_y - 0.6, sz * 9.6, 0.4, 0.6, 0.8))
crane.put(box(4.0, cr_y + 0.6, 0, 1.0, 0.7, 18.8))
Acc.of("slateDark", 0.015).put(box(4.0, cr_y + 0.05, 2.0, 1.6, 0.5, 1.4))
# the tower cranes' hook block (hookblock.py) on two rope falls from the trolley, the falls across the bridge (x) so the hook
# shows its curve to the door; its body slot takes the crane's yellow
HK = (4.0, 5.7, 2.0)                                            # the block's sheave axle; the hook's bottom 2.2 m under it
for sx in (-1, 1):
    Acc.of("dark", 0.02).put(B((HK[0] + sx * 0.33, cr_y - 0.15, HK[2]), (HK[0] + sx * 0.33, HK[1], HK[2]), 0.05, 4, cap=True))
hook_block(lambda name, geo, slot, parent, ink: Acc.of("hazard" if slot == "body" else slot, ink).put(xf(geo, HK)), None, "x")
chest = Acc.of("red", 0.02)
for x in (-12.5, -10.6):
    chest.put(box(x, 0.12 + 0.6, -11.6, 1.6, 1.2, 0.8))
    for y in (0.5, 0.8, 1.1):
        Acc.of("dark", 0.0).put(box(x, 0.12 + y, -11.195, 1.4, 0.04, 0.01))
Acc.of("slateDark", 0.02).put(box(-7.0, 0.12 + 0.95, -11.4, 3.2, 0.1, 1.0))      # workbench
for dx in (-1.4, 1.4):
    Acc.of("dark", 0.01).put(box(-7.0 + dx, 0.12 + 0.45, -11.4, 0.1, 0.9, 0.9))
for i in range(3):                                              # a stack of spare tyres
    Acc.of("dark", 0.015).put(cyl(10.5, 0.12 + 0.2 + i * 0.4, -10.8, 0.85, 0.38, 14))

# ================= the lobby, the tower =================
lobby(-DOCK, 4.9, 9.0, 6.6, "slate", "red", door="door", win_x=(-20.2,))
TX, TZ, TW, TT = -6.0, -23.5, 4.4, 14.0                           # tower: centre, width, top of the shaft
Acc.of("slate", 0.08).put(box(TX, TT / 2, TZ, TW, TT, TW))
Acc.of("red", 0.02).put(box(TX, 4.2, TZ, TW + 0.08, 0.5, TW + 0.08))
Acc.of("door", 0.0).put(box(TX + TW / 2 + 0.003, 1.3, TZ, 0.02, 2.4, 1.2))
Acc.of("red", 0.012).put(box(TX + TW / 2 + 0.1, 2.65, TZ, 0.2, 0.2, 1.6))
ladder(Acc.of("steel", 0.012), Acc.of("steel", 0.0), TX, TZ - TW / 2 - 0.25, 0.0, TT - 0.1, -PI / 2, grab=0.1)   # to a hatch in the collar
Acc.of("red", 0.03).put(box(TX, TT + 0.3, TZ, TW + 0.8, 0.6, TW + 0.8))         # cab collar
sq = lambda h: [(TX + h, TZ - h), (TX + h, TZ + h), (TX - h, TZ + h), (TX - h, TZ - h)]
Acc.of("window", 0.0).put(frustum(sq(2.5), sq(3.3), TT + 0.6, TT + 3.0))        # raked glazing, lit
for (ax, az), (bx, bz) in zip(sq(2.52), sq(3.32)):                # corner posts
    Acc.of("slateDark", 0.012).put(B((ax, TT + 0.6, az), (bx, TT + 3.0, bz), 0.1, 4, cap=True))
Acc.of("slate", 0.05).put(box(TX, TT + 3.25, TZ, 7.2, 0.5, 7.2))
Acc.of("red", 0.012).put(box(TX, TT + 3.25, TZ, 7.3, 0.2, 7.3))
Acc.of("slateDark", 0.02).put(cyl(TX, TT + 4.1, TZ, 0.22, 1.2, 8))
RADAR = pivot(f"{PFX}radar", (TX, TT + 4.7, TZ), ROOT, role="fan", spin=1.2)
Acc.of("slateDark", 0.02, parent=RADAR).put(box(0, 0.25, 0, 4.4, 0.7, 0.35))
Acc.of("red", 0.0, parent=RADAR).put(box(0, 0.25, 0.18, 4.2, 0.14, 0.01))
Acc.of("dark", 0.01, parent=RADAR).put(cyl(0, -0.12, 0, 0.35, 0.36, 8))
Acc.of("dark", 0.01).put(cyl(TX + 3.0, TT + 4.4, TZ + 3.0, 0.07, 1.8, 6))
pivot(f"{PFX}lamp", (TX + 3.0, TT + 5.45, TZ + 3.0), ROOT, role="blinker", radius=0.3)

# ================= the apron: slab, taxi line, stop bar, edge lights, tug, bowser =================
Acc.of("concrete", 0.0).put(box(31.0, 0.05, 0, 28.0, 0.1, 28.0))
x = 18.0
while x < 43.5:
    mark.put(box(x + 0.7, 0.105, 0, 1.4, 0.01, 0.25))
    x += 2.4
mark.put(box(43.0, 0.105, 0, 0.5, 0.01, 7.0))
for sz in (-1, 1):
    for x in range(19, 46, 6):
        Acc.of("dark", 0.008).put(cyl(x, 0.3, sz * 13.6, 0.14, 0.4, 6))
        Acc.of("redlamp", 0.0).put(cyl(x, 0.58, sz * 13.6, 0.16, 0.16, 6))


def small_truck(x, z, yaw, load):
    """a 4 m airside truck: cab, bed and its load ('tug': a ballast block and tow bar; 'bowser': a tank)"""
    M = lambda g: xf(g, (x, 0, z), (0, yaw, 0))
    Acc.of("hazard", 0.03).put(M(box(1.3, 1.25, 0, 1.4, 1.5, 1.9)))
    Acc.of("window", 0.0).put(M(box(1.998, 1.6, 0, 0.02, 0.6, 1.5)))
    Acc.of("slateDark", 0.03).put(M(box(-0.25, 0.75, 0, 4.3, 0.4, 2.0)))
    for wx in (1.2, -1.4):
        for wz in (-1.0, 1.0):
            Acc.of("dark", 0.02).put(M(xf(cylinder(0.42, 0.42, 0.3, 12)[:2], (wx, 0.42, wz), (PI / 2, 0, 0))))
    if load == "bowser":
        Acc.of("white", 0.03).put(M(xf(cylinder(0.75, 0.75, 2.6, 14)[:2], (-1.0, 1.75, 0), (0, 0, PI / 2))))
        Acc.of("red", 0.0).put(M(xf(cylinder(0.765, 0.765, 0.3, 14)[:2], (-1.0, 1.75, 0), (0, 0, PI / 2))))
    else:
        Acc.of("slate", 0.02).put(M(box(-0.9, 1.35, 0, 2.0, 0.8, 1.8)))
        Acc.of("steel", 0.01).put(M(box(-2.9, 0.8, 0, 1.6, 0.12, 0.2)))


small_truck(41.5, -10.0, 0.4, "tug")
small_truck(40.0, 10.0, -0.3, "bowser")

# ================= colliders: the bay is open, so walls, pitches and crown are separate =================
SL = math.atan2(6.0, 3.5)                                        # the lower pitch's slope from level
SU = math.atan2(2.5, 5.5)
for sz in (-1, 1):
    col((0, -0.5, sz * 12.9), shape="box", hx=17.0, hy=2.5, hz=0.5, yaw=0.0)                       # upright wall
    # (a pitched box: pivot = centre less hy; pitch tips its y toward +z)
    for (z0, y0), (z1, y1), slope in (((13.0, 4.5), (9.5, 10.5), SL), ((9.5, 10.5), (4.0, 13.0), SU)):
        L_ = math.hypot(z1 - z0, y1 - y0)
        n = Vector((0, math.cos(slope), math.sin(slope)))      # outward normal on the +z side
        m = Vector((0, (y0 + y1) / 2, (z0 + z1) / 2)) - n * 0.4
        m.z *= sz
        col((0, m.y - 0.4, m.z), shape="box", hx=17.0, hy=0.4, hz=L_ / 2, yaw=0.0, pitch=sz * slope)
    # the berm's slope (skate up it) and its crest
    bl = math.hypot(5.7, 4.4)
    bs = math.atan2(4.4, 5.7)
    mid = Vector((0, 2.2, 16.65)) - Vector((0, math.cos(bs), math.sin(bs))) * 0.6
    col((-0.5, mid.y - 0.6, sz * mid.z), shape="box", hx=15.0, hy=0.6, hz=bl / 2, yaw=0.0, pitch=sz * bs)
col((0, 12.4, 0), shape="box", hx=17.0, hy=0.35, hz=4.1, yaw=0.0)                                # crown
col((XB + TH / 2, -0.5, 0), shape="box", hx=TH / 2, hy=6.75, hz=11.0, yaw=0.0)                    # back wall
for sz in (-1, 1):
    col((XF - TH / 2, -0.5, sz * 11.25), shape="box", hx=TH / 2, hy=4.5, hz=1.75, yaw=0.0)        # jambs
    col((XF + 0.9, -0.5, sz * 10.0), shape="box", hx=0.25, hy=5.45, hz=4.9, yaw=0.0)               # leaves
    col((XF + 0.9, -0.5, sz * 22.0), shape="box", hx=0.3, hy=5.95, hz=0.3, yaw=0.0)                # track posts
col((XF + 0.35, OPEN_H, 0), shape="box", hx=0.95, hy=1.5, hz=OPEN, yaw=0.0)           # header and track
col((TX, -0.5, TZ), shape="box", hx=TW / 2, hy=TT / 2 + 0.5, hz=TW / 2, yaw=0.0)
col((TX, TT, TZ), shape="box", hx=3.6, hy=1.9, hz=3.6, yaw=0.0)
col((-11.6, -0.5, -11.6), shape="box", hx=2.0, hy=1.0, hz=0.5, yaw=0.0)                           # chests
col((10.5, -0.5, -10.8), shape="cyl", r=0.9, h=1.9)
for x, z, yaw in ((41.5, -10.0, 0.4), (40.0, 10.0, -0.3)):
    col((x - 0.2 * math.cos(yaw), -0.5, z + 0.2 * math.sin(yaw)), shape="box", hx=2.3, hy=1.6, hz=1.1, yaw=yaw)

made = flush_all(ROOT, PFX) + decals_
audit_coplanar(made)
audit_flips(made)
print(f"hangar: {tri_count(made)} triangles in {len(made)} meshes, {NCOL[0]} colliders")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
