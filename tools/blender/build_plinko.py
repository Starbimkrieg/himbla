# Casino Plinko cabinet builder for Blender (4.2+ / 5.x).
#
# The two fixed pieces round the casino's Plinko machine (casinoWorld.js, PLINKO section), exported to
# src/assets/plinko.glb. In Blender's Python console or via MCP:
#   exec(open(r"<repo>/tools/blender/build_plinko.py").read())
# Headless:  MOONRUNNER_REPO=<repo> python3 tools/blender/build_plinko.py   (needs `pip install bpy`)
#
# Two roots, three.js axes (x right, y up, +z toward the player), styled like the prize counter: gold bodies, recessed
# plum panels in brass frames with card suits, a pink top, neon strips.
# - "plinko_console": the booth the player stands at, 3.4 x 1.1 x 1.2 m (top 3.6 x 1.4), origin on the floor at its
#   centre, +z toward the player. Red glow button and two cyan glow arrows on top.
# - "plinko_frame": cabinet tying the board to the back wall, origin on the floor at the board's centre (board plane
#   z = 0; wall face at z = -2.0). Plinth, two pillars, cornice and sign backing. Board numbers from src/plinko.js:
#   13 slots x 0.9 m + 2.4 m = 14.1 m wide, bottom y 0.3, top y 13.56.
# - One material per mesh, named after a slot (gold, brass, plum, dark, pink, white, red; glow slots glowPink, glowCyan,
#   glowRed); the game swaps in its own toon / glow materials. Property "ink" = outline thickness in m (0 = none).
#   Meshes sharing slot and ink are merged.

import bpy, math, os
from collections import defaultdict

def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_plinko.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "plinko.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Plinko export ->", OUT)
COLL = "MoonPlinko"

# preview colours only; the game replaces every slot
SLOT_COLORS = {
    "gold": (1.0, 0.82, 0.25), "brass": (0.78, 0.6, 0.12), "plum": (0.23, 0.06, 0.31), "dark": (0.1, 0.06, 0.19),
    "pink": (1.0, 0.18, 0.53), "white": (1.0, 0.96, 0.88), "red": (0.84, 0.15, 0.24),
    "glowPink": (1.0, 0.18, 0.53), "glowCyan": (0.18, 0.9, 1.0), "glowRed": (1.0, 0.16, 0.29),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi


class Part:
    """Geometry grouped by (slot, ink), one mesh per group on build()."""

    def __init__(self, name):
        self.name = name
        self.root = pivot(name, (0, 0, 0))
        self.groups = defaultdict(list)

    def add(self, slot, ink, geo):
        self.groups[(slot, ink)].append(geo)

    def box(self, slot, ink, c, h, e=0.08):
        """Rounded box: centre c, half extents h."""
        self.add(slot, ink, xf(rbox(h[0], h[1], h[2], e, 12, 6), c))

    def build(self):
        for (slot, ink), geos in self.groups.items():
            mesh(f"{self.name}_{slot}_{int(ink * 1000)}", merge(*geos), slot, self.root, ink)


# ---------------- card suits and a star: flat z-extruded shapes for panel faces ----------------

def heart_outline(s, flip=False):
    pts = []
    for i in range(40):
        t = 2 * PI * i / 40
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x, -y if flip else y))
    return pts


def suit_geos(kind, s, depth):
    """♠ ♥ ♦ ♣ (or star) about s m tall, centred, front at z = depth/2."""
    if kind == "heart":
        k = s / 29.0
        return [extrude([(x * k, (y + 2.5) * k) for x, y in heart_outline(s)], depth, "z")]
    if kind == "diamond":
        return [extrude([(0, 0.5 * s), (0.32 * s, 0), (0, -0.5 * s), (-0.32 * s, 0)], depth, "z")]
    if kind == "spade":
        k = s / 35.0
        body = extrude([(x * k, (y - 2.5) * k) for x, y in heart_outline(s, True)], depth, "z")
        stem = extrude([(-2 * k, -2.5 * k), (2 * k, -2.5 * k), (5 * k, -15.5 * k), (-5 * k, -15.5 * k)], depth * 0.7, "z")
        return [body, stem]
    if kind == "club":
        r = 0.2 * s
        lobes = [xf(rbox(r, r, depth / 2, 1, 14, 8), (x * s, y * s, 0)) for x, y in ((0, 0.22), (-0.22, -0.08), (0.22, -0.08))]
        stem = extrude([(-0.05 * s, 0.0), (0.05 * s, 0.0), (0.12 * s, -0.46 * s), (-0.12 * s, -0.46 * s)], depth * 0.7, "z")
        return lobes + [stem]
    if kind == "star":
        pts = []
        for i in range(10):
            a = PI / 2 + i * PI / 5
            r = 0.5 * s if i % 2 == 0 else 0.21 * s
            pts.append((r * math.cos(a), r * math.sin(a)))
        return [extrude(pts, depth, "z")]
    raise ValueError(kind)


def suit_on(part, kind, slot, c, s, depth=0.02):
    """A suit on a +z-facing panel; c is its front face's centre."""
    for g in suit_geos(kind, s, depth):
        part.add(slot, 0, xf(g, (c[0], c[1], c[2] + depth / 2)))


def front_panel(part, c, hw, hh, face_z, frame=0.035, lip=0.016, inset=0.018, emblem=None, size=0.4, side=1, axis="z"):
    """Recessed plum panel in a brass frame; c = (x, y) centre, face_z = the body face. side +1/-1 = faces +z/-z;
    axis "x" puts it on a side face (c = (z, y), face_z = the face's x)."""
    def place_box(slot, ink, u, v, w, hu, hv, hd):
        # u, v: in-panel offsets; w: depth along the normal
        if axis == "z":
            part.box(slot, ink, (c[0] + u, c[1] + v, face_z + side * w), (hu, hv, hd), 0.05)
        else:
            part.box(slot, ink, (face_z + side * w, c[1] + v, c[0] + u), (hd, hv, hu), 0.05)
    # plum face slightly proud, brass frame (four bars) further out, so the plum reads as recessed
    place_box("plum", 0, 0, 0, inset / 2 - 0.004, hw - frame, hh - frame, inset / 2)
    d = lip / 2 + 0.012
    place_box("brass", 0, 0, hh - frame / 2, d, hw, frame / 2, lip / 2)
    place_box("brass", 0, 0, -hh + frame / 2, d, hw, frame / 2, lip / 2)
    place_box("brass", 0, -hw + frame / 2, 0, d, frame / 2, hh - frame, lip / 2)
    place_box("brass", 0, hw - frame / 2, 0, d, frame / 2, hh - frame, lip / 2)
    if emblem:
        kind, eslot = emblem
        z = face_z + side * (inset + 0.0)
        for g in suit_geos(kind, size, 0.02):
            if axis == "z":
                part.add(eslot, 0, xf(g, (c[0], c[1], z + side * 0.01), (0, 0 if side > 0 else PI, 0)))
            else:
                part.add(eslot, 0, xf(g, (z + side * 0.01, c[1], c[0]), (0, (PI / 2) if side > 0 else -PI / 2, 0)))


# =====================================================================================================
# the console
# =====================================================================================================
K = Part("plinko_console")
BODY_Y0, BODY_Y1 = 0.14, 1.10
K.box("dark", 0.04, (0, 0.07, 0), (1.6, 0.07, 0.5), 0.05)                         # kick plate
K.box("gold", 0.04, (0, (BODY_Y0 + BODY_Y1) / 2, 0), (1.7, (BODY_Y1 - BODY_Y0) / 2, 0.6), 0.07)   # body
PY = 0.62
SUITS = (("spade", "white"), ("heart", "red"), ("diamond", "red"), ("club", "white"))
for i, x in enumerate((-1.2, -0.4, 0.4, 1.2)):                                     # front: four suit panels
    front_panel(K, (x, PY), 0.34, 0.34, 0.6, emblem=SUITS[i], size=0.4)
front_panel(K, (0, PY), 1.3, 0.34, -0.6, side=-1)                                  # back: one long panel
for sx in (-1, 1):                                                                 # ends: a gold star each
    front_panel(K, (0, PY), 0.38, 0.34, sx * 1.7, side=sx, axis="x", emblem=("star", "gold"), size=0.42)
# neon: pink under the top slab all round, cyan above the kick plate on front and ends
for z, w in ((0.606, 1.64), (-0.606, 1.64)):
    K.box("glowPink", 0, (0, 1.045, z), (w, 0.022, 0.008), 0.5)
for sx in (-1, 1):
    K.box("glowPink", 0, (sx * 1.706, 1.045, 0), (0.008, 0.022, 0.54), 0.5)
    K.box("glowCyan", 0, (sx * 1.706, 0.2, 0), (0.008, 0.022, 0.5), 0.5)
K.box("glowCyan", 0, (0, 0.2, 0.606), (1.6, 0.022, 0.008), 0.5)
# top: pink slab with a gold rail
K.box("pink", 0.04, (0, 1.18, 0), (1.8, 0.08, 0.7), 0.08)
for z in (-0.64, 0.64):
    K.box("gold", 0.02, (0, 1.285, z), (1.76, 0.025, 0.03), 0.3)
for sx in (-1, 1):
    K.box("gold", 0.02, (sx * 1.73, 1.285, 0), (0.03, 0.025, 0.64), 0.3)
# button: plum pad, brass ring, gold collar, red glow cap
K.add("plum", 0, xf(lathe([(0, 1.26), (0.56, 1.26), (0.56, 1.275), (0, 1.275)], 28)))
K.add("brass", 0, xf(torus(0.56, 0.03, 28, 6), (0, 1.275, 0)))
K.add("gold", 0.012, xf(torus(0.4, 0.045, 28, 6), (0, 1.31, 0)))
K.add("glowRed", 0, lathe([(0, 1.28), (0.36, 1.28), (0.35, 1.36), (0.3, 1.42), (0.18, 1.45), (0, 1.455)], 24))
# cyan arrows pointing out each side, on brass seats
for sx in (-1, 1):
    K.box("brass", 0.01, (sx * 1.1, 1.27, 0), (0.3, 0.012, 0.24), 0.2)
    K.add("glowCyan", 0, xf(extrude([(-0.2, -0.17), (-0.2, 0.17), (0.2, 0.0)], 0.05, "y"), (sx * 1.1, 1.31, 0), (0, 0 if sx > 0 else PI, 0)))
K.build()
K.root["radius"] = 2.2

# =====================================================================================================
# the frame
# =====================================================================================================
F = Part("plinko_frame")
HW = 7.05                          # board half width
Y0, Y1 = 0.3, 13.56                # board bottom and top
ZB, ZF = -2.05, 0.3                # back (in the wall) and pillar front
OUTER = HW + 0.95                  # plinth and cornice half width
# plinth: dark kick plate, gold body, pink neon on the front edge
F.box("dark", 0.04, (0, 0.05, (ZB + 0.5) / 2), (OUTER - 0.1, 0.05, (0.5 - ZB) / 2), 0.05)
F.box("gold", 0.04, (0, 0.2, (ZB + 0.6) / 2), (OUTER, 0.1, (0.6 - ZB) / 2), 0.07)
F.box("glowPink", 0, (0, 0.2, 0.605), (OUTER - 0.15, 0.022, 0.008), 0.5)
F.box("brass", 0.01, (0, 0.295, (ZB + 0.6) / 2), (OUTER + 0.01, 0.01, (0.6 - ZB) / 2 + 0.01), 0.1)
# pillars
PH = (Y1 - Y0)
for sx in (-1, 1):
    cx = sx * (HW + 0.45)
    F.box("gold", 0.04, (cx, (Y0 + Y1) / 2, (ZB + ZF) / 2), (0.4, PH / 2, (ZF - ZB) / 2), 0.07)
    F.box("brass", 0.02, (cx, Y0 + 0.14, (ZB + ZF) / 2), (0.44, 0.14, (ZF - ZB) / 2 + 0.02), 0.1)       # foot
    F.box("brass", 0.02, (cx, Y1 - 0.12, (ZB + ZF) / 2), (0.44, 0.12, (ZF - ZB) / 2 + 0.02), 0.1)       # capital
    n, ph = 4, 2.5
    step = (PH - 1.0 - ph) / (n - 1)
    for i in range(n):
        yc = Y0 + 0.5 + ph / 2 + i * step
        front_panel(F, (cx, yc), 0.26, ph / 2, ZF, emblem=SUITS[(i + (0 if sx < 0 else 2)) % 4], size=0.36)
        if i < n - 1:                                                                                # brass band between panels
            F.box("brass", 0.015, (cx, yc + step / 2, (ZB + ZF) / 2), (0.43, 0.05, (ZF - ZB) / 2 + 0.015), 0.1)
    # neon: pink on the board-side front edge, cyan on the board-side face
    F.box("glowPink", 0, (sx * (HW + 0.12), (Y0 + Y1) / 2, ZF + 0.006), (0.035, PH / 2 - 0.3, 0.008), 0.5)
    F.box("glowCyan", 0, (sx * (HW + 0.045), (Y0 + Y1) / 2, 0.05), (0.008, PH / 2 - 0.3, 0.08), 0.5)
# cornice over board and pillars, pink neon on the front
F.box("gold", 0.04, (0, Y1 + 0.1, (ZB + 0.45) / 2), (OUTER, 0.1, (0.45 - ZB) / 2), 0.07)
F.box("brass", 0.02, (0, Y1 + 0.006, (ZB + 0.46) / 2), (OUTER + 0.01, 0.012, (0.46 - ZB) / 2 + 0.01), 0.1)
F.box("glowPink", 0, (0, Y1 + 0.1, 0.455), (OUTER - 0.15, 0.022, 0.008), 0.5)
# sign backing: brass-framed plum board for the neon header
SY = Y1 + 0.2 + 1.1
F.box("brass", 0.03, (0, SY, (ZB - 0.25) / 2), (4.5, 1.1, (-0.25 - ZB) / 2), 0.08)
F.box("plum", 0.02, (0, SY, (ZB - 0.2) / 2), (4.42, 1.02, (-0.2 - ZB) / 2), 0.08)
F.build()
F.root["radius"] = 9.0

print("built", len(C.objects), "objects")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
