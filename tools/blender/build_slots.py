# Slot-machine cabinet builder for Blender (4.2+ / 5.x): the casino's pixel-arcade video slot, exported to src/assets/slots.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_slots.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_slots.py
#
# One cabinet (root `slot`), about 2.2 m wide, 1.6 m deep and 4.3 m tall: a sloped arcade body with a tilted screen under a deep
# marquee box, speaker slits and LED chases on the header, arcade buttons and a SPIN ring on the control deck, a ticket printer, a coin
# cup and a lever on the right side. Authored in three.js axes (x right, y up, +z front); the origin is on the floor in the middle.
# The casino stands 4 of them in the Classic Games corner and 7 in each of the two carousels outside (src/casinoWorld.js).
#
# The root's own meshes are the static cabinet. Pivots (empties with a `role`) carry what the game moves, textures or recolours:
#   pull     the lever, at its hinge: the game turns it about x (a pull swings the orb toward +z). Holds the arm and the orb
#   lamp     the roof lamp bar, at its centre; one mesh in the `lamp` slot, which the game flashes while somebody plays
#   screen   the marquee: a plane w by h that the game paints with the cabinet's name (extra `tilt`: lean back about x, in radians)
#   display  the pixel-reel screen: a plane w by h that the game redraws while the reels spin (extra `tilt` as above)
#   decal    a pixel sprite on the cabinet's side (extras `side` -1 or +1, `w`, `h`, `id`): a plane the game faces out of the side
# The `body` and `shade` slots are the cabinet's paint and `neon` its glow, which the game takes from the cabinet's colour; the
# other slots are fixed (see SLOT_TOON / SLOT_GLOW in src/models.js). Each mesh has ONE material named after a slot, and its `ink`
# property says how far its outline shell stands off (0: none).
#
# The side plaques (`sidePlaque`), their neon frames and the decals are kept inside the cabinet's side silhouette (PROFILE) and the
# decals inside their plaques, with margins; the build checks that at the end and stops if one is out (see audit()).

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_slots.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("SLOTS_OUT") or os.path.join(REPO, "src", "assets", "slots.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Slots export ->", OUT)
COLL = "MoonSlots"

# preview colours (the game swaps in its own materials)
SLOT_COLORS = {
    "body": (0.78, 0.30, 0.90), "shade": (0.55, 0.18, 0.68), "dark": (0.12, 0.10, 0.19), "bezel": (0.08, 0.06, 0.12), "panel": (0.17, 0.14, 0.26),
    "chrome": (0.86, 0.88, 0.94), "gold": (1.0, 0.82, 0.25), "cream": (0.97, 0.94, 0.86),
    "neon": (1.0, 0.18, 0.53), "ledr": (1.0, 0.16, 0.29), "ledg": (0.49, 1.0, 0.42), "ledb": (0.18, 0.9, 1.0), "bulb": (1.0, 0.96, 0.66),
    "lamp": (0.35, 0.16, 0.10), "display": (0.10, 0.06, 0.20), "coin": (1.0, 0.85, 0.3),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)
PI = math.pi


class Acc:
    """Boxes, cylinders and tubes that share a material slot and a parent, merged into one mesh when flushed."""
    all = []

    def __init__(self, name, slot, parent, ink=0.03):
        self.name, self.slot, self.parent, self.ink, self.geos = name, slot, parent, ink, []
        Acc.all.append(self)

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        """A box about its centre."""
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot)); return self

    def box(self, cx, y0, cz, w, h, d):
        """A box standing on y0."""
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, y0 + h / 2, cz))); return self

    def cylc(self, cx, cy, cz, r, h, seg=12, axis="y", rt=None):
        """A cylinder about its centre, its axis along x, y or z (`rt` the radius of the far end)."""
        g = cylinder(r if rt is None else rt, r, h, seg)[:2]
        rot = {"y": (0, 0, 0), "z": (PI / 2, 0, 0), "x": (0, 0, PI / 2)}[axis]
        self.geos.append(xf(g, (cx, cy, cz), rot)); return self

    def ball(self, cx, cy, cz, r, w=8, h=6):
        self.geos.append(xf(sphere(r, w, h)[:2], (cx, cy, cz))); return self

    def tube(self, a, b, r, seg=5):
        self.geos.append(beam(a, b, r, seg)); return self

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0)):
        self.geos.append(xf(geo, t, rot)); return self

    def flush(self):
        if self.geos:
            mesh(self.name, join(self.geos), self.slot, self.parent, self.ink)
        self.geos = []


def flush_all():
    for a in Acc.all:
        a.flush()
    Acc.all = []


def on_plane(y0, z0, tilt, ly, lz):
    """A point on a plate that leans back by `tilt` (rotated about x at (y0, z0)): `ly` up the plate, `lz` out of it -> (y, z)."""
    return y0 + ly * math.cos(tilt) + lz * math.sin(tilt), z0 - ly * math.sin(tilt) + lz * math.cos(tilt)


root = pivot("slot", (0, 0, 0), None)
HW = 1.0   # half the body's width

# ---- the shell: the cabinet's side profile (z, y) extruded across its width, in the colour the casino paints it ----
# front up to the deck ledge, the leaning screen housing, the chin under the header, the header (leaning back), the roof and the back
PROFILE = [(0.64, 0.16), (0.64, 1.08), (0.9, 1.24), (0.9, 1.34), (0.52, 1.52), (0.44, 1.66), (0.3, 3.1), (0.62, 3.2), (0.55, 4.0), (0.2, 4.26),
           (-0.7, 4.0), (-0.7, 0.16)]
A = Acc("shell", "body", root, 0.04)
A.add(extrude(PROFILE, 2 * HW, "x"))
A.flush()
# the plinth and a glowing strip under the cabinet
A = Acc("plinth", "dark", root, 0.03)
A.box(0, 0, 0.1, 2 * HW + 0.16, 0.16, 1.62)
A.flush()
A = Acc("underglow", "neon", root, 0.0)
A.box(0, 0.05, 0.93, 2 * HW + 0.04, 0.03, 0.03)
A.flush()


# ---- the sides: two inset dark plaques (the game paints a pixel sprite on each) with a neon frame inset along the cabinet's front edge ----
def inset_path(pts, d):
    """The open polyline `pts` (the front of PROFILE, bottom to top, so the inside is on the left) moved `d` inward (mitred at the corners)."""
    def left(a, b):
        dz, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dz, dy)
        return (-dy / n, dz / n)
    out = []
    for i, p in enumerate(pts):
        if i == 0:
            n = left(p, pts[1]); k = 1.0
        elif i == len(pts) - 1:
            n = left(pts[i - 1], p); k = 1.0
        else:
            n0, n1 = left(pts[i - 1], p), left(p, pts[i + 1])
            n = (n0[0] + n1[0], n0[1] + n1[1])
            m = math.hypot(*n)
            n = (n[0] / m, n[1] / m)
            k = 1.0 / max(0.5, n[0] * n0[0] + n[1] * n0[1])   # (the mitre: the corner moves farther than d)
        out.append((p[0] + n[0] * d * k, p[1] + n[1] * d * k))
    return out


# the two plaques, as (z, y) outlines on the side face, and where each decal (a pixel sprite) sits on them
PLAQUES = {
    "low": [(0.5, 0.42), (0.5, 0.98), (0.3, 1.14), (-0.5, 1.14), (-0.5, 0.42)],
    "up": [(0.19, 2.0), (0.16, 2.74), (-0.48, 2.74), (-0.48, 2.0)],
}
DECALS = {"low": (-0.03, 0.78, 0.6), "up": (-0.15, 2.37, 0.52)}   # (z, y, size) of the square sprite on its plaque
NEON_PATH = inset_path([(0.64, 0.24)] + PROFILE[1:8] + [(0.5588, 3.9)], 0.05)   # (up the front to just short of the header's top corner)
for sx in (-1, 1):
    A = Acc(f"sidePlaque{sx}", "panel", root, 0.0)
    for outline in PLAQUES.values():
        A.add(extrude(outline, 0.03, "x"), (sx * (HW + 0.008), 0, 0))   # (stands 0.023 proud of the side)
    A.flush()
    A = Acc(f"sideNeon{sx}", "neon", root, 0.0)
    for (z0, y0), (z1, y1) in zip(NEON_PATH, NEON_PATH[1:]):
        A.tube((sx * (HW + 0.025), y0, z0), (sx * (HW + 0.025), y1, z1), 0.016, 5)
    A.flush()
    for name, (dz, dy, size) in DECALS.items():
        pivot(f"decal_{name}{sx}", (sx * (HW + 0.03), dy, dz), root, role="decal", side=sx, id=name, w=size, h=size)

# ---- the screen housing: a dark bezel leaning back with the profile, the pixel-reel display and neon corner brackets ----
TILT = math.atan2(0.44 - 0.3, 3.1 - 1.66)   # the lean of the housing's front (the profile's slope there)
SCR_Y = 2.38
BZ = 0.38 - (SCR_Y - 1.66) * 0.098          # the bezel's centre in z: its front sits on the profile
A = Acc("bezel", "bezel", root, 0.03)
A.boxc(0, SCR_Y, BZ, 1.86, 1.42, 0.12, rot=(-TILT, 0, 0))
A.flush()
A = Acc("bezelTrim", "chrome", root, 0.02)
for ly in (0.74, -0.74):
    y, z = on_plane(SCR_Y, BZ, TILT, ly, 0.02)
    A.boxc(0, y, z, 1.96, 0.05, 0.14, rot=(-TILT, 0, 0))
A.flush()
A = Acc("displayBack", "display", root, 0.0)   # (the dark glass under the display; the game's plane sits a few mm in front)
y, z = on_plane(SCR_Y, BZ, TILT, 0, 0.062)
A.boxc(0, y, z, 1.7, 1.28, 0.01, rot=(-TILT, 0, 0))
A.flush()
y, z = on_plane(SCR_Y, BZ, TILT, 0, 0.07)
pivot("display", (0, y, z), root, role="display", w=1.66, h=1.24, tilt=TILT)
A = Acc("brackets", "neon", root, 0.0)
for sx in (-1, 1):
    for sy in (-1, 1):
        for ly, lx, w, h in ((sy * 0.69, sx * 0.81, 0.2, 0.035), (sy * 0.62, sx * 0.88, 0.035, 0.2)):
            y, z = on_plane(SCR_Y, BZ, TILT, ly, 0.075)
            A.boxc(lx, y, z, w, h, 0.02, rot=(-TILT, 0, 0))
A.flush()

# ---- the header: a deep marquee box over the screen with a name panel, speaker slits at its ends and LED chases along its top and bottom ----
HT, HY, HZ = 0.09, 3.6, 0.575             # the header face leans back by HT about (HY, HZ)
A = Acc("headerFace", "bezel", root, 0.03)
A.boxc(0, HY, HZ, 1.9, 0.72, 0.05, rot=(-HT, 0, 0))
A.flush()
y, z = on_plane(HY, HZ, HT, 0, 0.04)
pivot("screen", (0, y, z), root, role="screen", w=1.52, h=0.54, tilt=HT)
A = Acc("headerTrim", "chrome", root, 0.02)
for ly in (0.38, -0.38):
    y, z = on_plane(HY, HZ, HT, ly, 0.02)
    A.boxc(0, y, z, 1.96, 0.05, 0.08, rot=(-HT, 0, 0))
A.flush()
for name, slot, off in (("chaseR", "ledr", 0), ("chaseG", "ledg", 1), ("chaseB", "ledb", 2)):
    A = Acc(name, slot, root, 0.0)
    for i in range(off, 15, 3):
        x = -0.9 + i * 0.1286
        for ly in (0.44, -0.44):
            y, z = on_plane(HY, HZ, HT, ly, 0.0)
            A.boxc(x, y, z, 0.06, 0.05, 0.05, rot=(-HT, 0, 0))
    A.flush()
# the speakers: a dark plate with three chrome slits on the header face either side of the marquee panel
A = Acc("speakers", "panel", root, 0.0)
for sx in (-1, 1):
    y, z = on_plane(HY, HZ, HT, 0, 0.03)
    A.boxc(sx * 0.855, y, z, 0.14, 0.5, 0.012, rot=(-HT, 0, 0))
A.flush()
A = Acc("speakerSlits", "chrome", root, 0.0)
for sx in (-1, 1):
    for k in (-1, 0, 1):
        y, z = on_plane(HY, HZ, HT, 0, 0.038)
        A.boxc(sx * 0.855 + k * 0.04, y, z, 0.02, 0.4, 0.008, rot=(-HT, 0, 0))
A.flush()

# ---- the control deck: lit arcade buttons, a big SPIN with a glow ring, card readers ----
A = Acc("deckPlate", "panel", root, 0.02)
A.boxc(0, 1.375, 0.74, 1.9, 0.05, 0.62, rot=(0.3, 0, 0))
A.flush()
A = Acc("deckLip", "chrome", root, 0.02)
A.boxc(0, 1.29, 1.02, 1.94, 0.04, 0.05, rot=(0.3, 0, 0))
A.flush()
BTN = [(-0.72, "ledr"), (-0.5, "ledg"), (0.5, "ledb"), (0.72, "gold")]
A = Acc("btnCups", "dark", root, 0.0)
for x, _ in BTN:
    A.cylc(x, 1.43, 0.85, 0.085, 0.03, 14, "y")
A.cylc(0, 1.43, 0.85, 0.15, 0.03, 16, "y")
A.flush()
for x, slot in BTN:
    A = Acc("btn_" + slot, slot, root, 0.0)
    A.cylc(x, 1.46, 0.85, 0.06, 0.05, 12, "y")
    A.flush()
A = Acc("spin", "ledr", root, 0.02)
A.cylc(0, 1.47, 0.85, 0.12, 0.06, 14, "y", 0.105)
A.flush()
A = Acc("spinRing", "neon", root, 0.0)
A.add(torus(0.145, 0.012, 20, 5), (0, 1.5, 0.85))
A.flush()
A = Acc("readers", "bezel", root, 0.0)
A.boxc(-0.88, 1.46, 0.66, 0.26, 0.04, 0.2, rot=(0.3, 0, 0)); A.boxc(0.88, 1.46, 0.66, 0.26, 0.04, 0.2, rot=(0.3, 0, 0))
A.flush()
A = Acc("readerGlow", "ledb", root, 0.0)
A.boxc(-0.88, 1.485, 0.67, 0.2, 0.012, 0.03, rot=(0.3, 0, 0)); A.boxc(0.88, 1.485, 0.67, 0.2, 0.012, 0.03, rot=(0.3, 0, 0))
A.flush()

# ---- the lower front: a vent grille, a ticket printer with a ticket out, a coin cup and a kick strip ----
A = Acc("vent", "dark", root, 0.0)
for k in range(6):
    A.boxc(-0.55, 0.5 + k * 0.08, 0.645, 0.7, 0.03, 0.02)
A.flush()
A = Acc("printer", "bezel", root, 0.02)
A.boxc(0.45, 0.82, 0.66, 0.7, 0.2, 0.08)
A.flush()
A = Acc("printerGlow", "ledg", root, 0.0)
A.boxc(0.45, 0.93, 0.705, 0.6, 0.015, 0.012)
A.flush()
A = Acc("ticket", "cream", root, 0.0)
A.boxc(0.55, 0.62, 0.72, 0.32, 0.4, 0.012, rot=(0.12, 0, 0))
A.flush()
A = Acc("cup", "bezel", root, 0.02)
A.boxc(-0.2, 0.3, 0.7, 0.5, 0.26, 0.14)
A.flush()
A = Acc("cupCoins", "coin", root, 0.0)
for i in range(4):
    A.cylc(-0.3 + i * 0.07, 0.43, 0.74, 0.04, 0.012, 10, "z")
A.flush()
A = Acc("kick", "shade", root, 0.0)
A.boxc(0, 0.2, 0.655, 1.9, 0.07, 0.02)
A.flush()

# ---- the roof: a lamp bar the game flashes while somebody plays (its own pivot), and two corner beacons ----
LAMP = (0, 4.2, 0.28)
pivot("lamp", LAMP, root, role="lamp")
A = Acc("lampBar", "lamp", bpy.data.objects["lamp"], 0.0)
A.boxc(0, 0, 0, 1.2, 0.1, 0.12, rot=(-0.28, 0, 0))
A.flush()
A = Acc("beacons", "bulb", root, 0.0)
for sx in (-1, 1):
    A.ball(sx * 0.96, 4.12, 0.3, 0.05)
A.flush()

# ---- the lever: a chrome arm on a small mount on the right side, in the band between the two plaques, with a red orb ----
LEVER = (HW + 0.24, 1.5, 0.32)
A = Acc("leverBracket", "chrome", root, 0.03)
A.boxc(HW + 0.06, 1.42, 0.26, 0.08, 0.3, 0.22)
A.cylc(HW + 0.2, LEVER[1], LEVER[2], 0.1, 0.06, 12, "x")
A.flush()
pivot("pull", LEVER, root, role="pull")
A = Acc("leverArm", "chrome", bpy.data.objects["pull"], 0.02)
A.cylc(0, 0.45, 0, 0.035, 0.9, 8, "y")
A.flush()
A = Acc("leverOrb", "ledr", bpy.data.objects["pull"], 0.0)
A.ball(0, 0.98, 0, 0.14, 12, 8)
A.flush()

flush_all()


# ---------------------------------------------------------------------------------------------------------------
# the check: what is on the sides stays inside the cabinet, and nothing sits on anything else
# ---------------------------------------------------------------------------------------------------------------
def inside_margin(poly, p):
    """How far inside the closed outline `poly` the point `p` is (negative: outside)."""
    n, inside, best = len(poly), False, 1e9
    for i in range(n):
        (az, ay), (bz, by) = poly[i], poly[(i + 1) % n]
        if (ay > p[1]) != (by > p[1]) and p[0] < az + (p[1] - ay) / (by - ay) * (bz - az):
            inside = not inside
        dz, dy = bz - az, by - ay
        t = max(0.0, min(1.0, ((p[0] - az) * dz + (p[1] - ay) * dy) / (dz * dz + dy * dy)))
        best = min(best, math.hypot(p[0] - (az + t * dz), p[1] - (ay + t * dy)))
    return best if inside else -best


def audit():
    dg = bpy.context.evaluated_depsgraph_get()
    bad = []

    def verts(o):   # the object's vertices as (z, y) in three.js axes
        e = o.evaluated_get(dg)
        mw = e.matrix_world
        return [(-(mw @ v.co).y, (mw @ v.co).z) for v in e.to_mesh().vertices]

    for o in C.objects:
        if o.type != "MESH":
            continue
        if o.name.startswith("sidePlaque") or o.name.startswith("sideNeon"):
            need = 0.04 if o.name.startswith("sidePlaque") else 0.03
            worst = min(inside_margin(PROFILE, p) for p in verts(o))
            print(f"  {o.name}: {worst * 100:.1f} cm inside the silhouette")
            if worst < need:
                bad.append(f"{o.name} is only {worst * 100:.1f} cm inside the cabinet's silhouette (needs {need * 100:.0f})")
    for name, (dz, dy, size) in DECALS.items():
        h = size / 2
        worst = min(inside_margin(PLAQUES[name], (dz + sx * h, dy + sy * h)) for sx in (-1, 1) for sy in (-1, 1))
        print(f"  decal {name}: {worst * 100:.1f} cm inside its plaque")
        if worst < 0.04:
            bad.append(f"decal {name} is only {worst * 100:.1f} cm inside its plaque (needs 4)")
    # the lever (on the +x side): its bracket and its whole swing's arm stay clear of both decals, and the bracket stays within the body
    lever = [(o.name, verts(o)) for o in C.objects if o.type == "MESH" and o.name.startswith("lever")]
    for lname, vs in lever:
        zs, ys = [v[0] for v in vs], [v[1] for v in vs]
        for name, (dz, dy, size) in DECALS.items():
            gap = max(min(zs) - (dz + size / 2), (dz - size / 2) - max(zs), min(ys) - (dy + size / 2), (dy - size / 2) - max(ys))
            print(f"  {lname} to decal {name}: {gap * 100:.1f} cm clear")
            if gap < 0.03:
                bad.append(f"{lname} lies over decal {name} (only {gap * 100:.1f} cm clear in side view)")
        if lname == "leverBracket" and min(inside_margin(PROFILE, v) for v in vs) < 0.05:
            bad.append("the lever bracket pokes out of the cabinet's silhouette")
    if bad:
        raise RuntimeError("slots.glb not exported: " + "; ".join(bad))
    print("AUDIT ok")


audit()

_dg = bpy.context.evaluated_depsgraph_get()
_tris, _ink = {}, 0
for _o in C.objects:
    if _o.type != "MESH":
        continue
    _t = sum(len(p.vertices) - 2 for p in _o.evaluated_get(_dg).to_mesh().polygons)
    _tris[_o["slot"]] = _tris.get(_o["slot"], 0) + _t
    if _o["ink"] > 0:
        _ink += _t
print("built", len(C.objects), "objects;", sum(_tris.values()), "triangles in", len(_tris), "slots, plus", _ink, "in the outline shells")
export(OUT, list(C.objects))
