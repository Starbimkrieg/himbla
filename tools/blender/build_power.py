# ILMB Power Block builder for Blender (4.2+ / 5.x): the two redesign proposals, one per kind of space power. B is the
# one in the game.
#
# Builds one proposal and exports it to docs/power-proposals/power_<variant>.glb (plain, any viewer); B also goes to
# src/assets/power.glb (run `npm run optimize:glb` after), which settlements.js powerBlock() bakes into the ILMB's power
# wing (world.js wingPower()). In Blender's Python console or via MCP:
#   VARIANT = "b"; exec(open(r"<repo>/tools/blender/build_power.py").read())
# or headless:  MOONRUNNER_REPO=. MOONRUNNER_POWER=b python3 tools/blender/build_power.py
# (MOONRUNNER_EXPORT=0 builds without writing; tools/blender/preview_power.py builds both and renders the review sheet.)
#
# Brief: redesign the ILMB's Power Block around a form of power that works on the Moon. The old block's hyperboloid
# cooling towers and steam need an atmosphere; in vacuum all waste heat leaves by radiation, so both proposals reject it
# through radiator panels.
#   a  "Pile":   FISSION, after NASA's Fission Surface Power / Kilopower: the reactor sits in a regolith-bermed pit (the
#                berm is its shield), a shadow-shield cone under a ring of Stirling converters (hot ends glowing), and a
#                27 m spire of six vertical radiator fins on stays. Switch and control hall, cable tray, spent-fuel casks,
#                switchyard, an exclusion fence with trefoils.
#   b  "Bottle": FUSION, a D-He3 tandem mirror: a 44 m magnetic bottle on trestles (high enough to drive under), navy
#                solenoid coils with plasma windows between, cream mirror plugs, flared and ribbed direct-energy converters
#                at both ends (the end faces glow), two neutral-beam injectors in a V, a cryoplant with its own radiators,
#                He-3 and deuterium spheres fed from the Helium-3 Exchange (a tanker fill point by the He-3 one), DC lines to
#                a hall with a railed roof, a ladder and a control bridge.
#
# Frame: the wing frame of world.js wing(): three.js axes, +x away from the hub, -x toward it, origin on the ground at the
# wing centre. The vestibule's front face (where the skywalk docks) is at x = -12.6, which wingPower() returns.
# Root empty "power_<variant>" (extras: proposal, dock = 12.6). A is a concept (no colliders or pivots). B's pivots, all
# under the root: `blinker` aircraft lamps (extra radius) on the bridge mast and the converter tops; `col` colliders
# (extras: shape box: foot at the pivot, hx hy hz yaw; cyl: foot, r h; hcyl: axis at the pivot, r len yaw, along z turned
# by yaw; sphere: centre, r). No livery: SPACECOM's colours are fixed.
# Slots: TOON cream yellow navy hall light dark steel metal white concrete regolith he3 deut; GLOW lamp cyan hot red
# plasma plasmaCore (the game pulses the two plasma slots). Ink per style.md; ink-0 details lie within ~6 mm of their
# surface.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_power.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
V = (globals().get("VARIANT") or os.environ.get("MOONRUNNER_POWER") or "a").lower()
assert V in ("a", "b"), "variant must be a or b"
OUT = os.path.join(REPO, "docs", "power-proposals", f"power_{V}.glb")
GAME_OUT = os.path.join(REPO, "src", "assets", "power.glb")
COLL = f"Power{V.upper()}"
PFX = f"power{V}_"
PI = math.pi
print("Power Block proposal", V, "->", OUT)


def lin(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "cream": 0xfff4e0, "yellow": 0xffd23f, "navy": 0x2a3a6b, "hall": 0x5b5870, "light": 0xd8d4e8, "dark": 0x2a2540,
    "steel": 0x55607a, "metal": 0x8a87a0, "white": 0xf3eee4, "concrete": 0xb8b4c8, "regolith": 0xb7b0c3,
    "he3": 0x7dff6a, "deut": 0x2ec4ff,
    "lamp": 0xfff6a8, "cyan": 0x2ee6ff, "hot": 0xff9f1c, "red": 0xff2a4a, "plasma": 0xff5cf0, "plasmaCore": 0xffe6ff,
}
GLOW = {"lamp", "cyan", "hot", "red", "plasma", "plasmaCore"}
SLOT_COLORS = {k: lin(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)


# ---------------- shapes (three.js axes; each returns (verts, faces)) ----------------

def box(w, h, d):
    return cuboid(w, h, d)[:2]


def cyl(r, h, seg=16, rt=None):
    """axis y, centred"""
    return cylinder(r if rt is None else rt, r, h, seg)[:2]


def ball(r, w=12, h=8):
    return sphere(r, w, h)[:2]


def ring_sec(r0, r1, y0, y1):
    """a closed ring's cross-section, for lathe()"""
    return [(r0, y0), (r1, y0), (r1, y1), (r0, y1), (r0, y0)]


def zlathe(prof, segs=32):
    """lathe() turned so the profile's y runs along +z"""
    return xf(lathe(prof, segs), r=(PI / 2, 0, 0))


def lathe_arc(prof, a0, a1, segs):
    """A closed profile [(r, y)] swept from angle a0 to a1 (lathe's angles: 0 at +z, pi/2 at +x), flat ends."""
    n, verts, faces = len(prof), [], []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        for r, y in prof:
            verts.append((math.sin(a) * r, y, math.cos(a) * r))
    for i in range(segs):
        for k in range(n):
            k2 = (k + 1) % n
            faces.append((i * n + k, i * n + k2, (i + 1) * n + k2, (i + 1) * n + k))
    faces.append(tuple(range(n)))
    faces.append(tuple(segs * n + k for k in range(n)))
    return verts, faces


def cone_band(p0, p1, t0, t1, out=0.005, inn=0.04):
    """A flush band round a lathe's straight stretch p0 -> p1 ((r, y)), from t0 to t1 of the way, its face `out` proud."""
    dr, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dr, dy)
    nr, ny = dy / L, -dr / L
    P = lambda t, o: (p0[0] + dr * t + nr * o, p0[1] + dy * t + ny * o)
    return [P(t0, -inn), P(t0, out), P(t1, out), P(t1, -inn), P(t0, -inn)]


def sector(r0, r1, a0, a1, th, n=6):
    """An annular sector in the x-y plane (angles from +x towards +y), th thick along z, centred on z 0."""
    verts, faces = [], []
    for z in (-th / 2, th / 2):
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            verts.append((math.cos(a) * r1, math.sin(a) * r1, z))
            verts.append((math.cos(a) * r0, math.sin(a) * r0, z))
    m = 2 * (n + 1)
    for i in range(n):
        o0, i0, o1, i1 = 2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3
        faces += [(o0, o1, i1, i0), (m + o0, m + i0, m + i1, m + o1), (o0, m + o0, m + o1, o1), (i0, i1, m + i1, m + i0)]
    faces += [(0, 1, m + 1, m), (2 * n, m + 2 * n, m + 2 * n + 1, 2 * n + 1)]
    return verts, faces


def trefoil(R, th=0.008):
    """The radiation trefoil in the x-y plane facing +z: three 60-degree blades round a hub, centred on z 0."""
    geos = [sector(0.3 * R, R, math.radians(a - 30), math.radians(a + 30), th, 6) for a in (90, 210, 330)]
    geos.append(xf(cyl(0.18 * R, th, 16), r=(PI / 2, 0, 0)))
    return join(geos)


def bar(a, b, w, h=None, up=None):
    """A rectangular member from a to b, w across (square to `up`: level by default) and h the other way (h defaults to w)."""
    h = w if h is None else h
    A, Bv = Vector(a), Vector(b)
    t = (Bv - A).normalized()
    if up is None:
        up = Vector((0, 1, 0)) if abs(t.y) < 0.99 else Vector((1, 0, 0))
    u = t.cross(up).normalized()
    v = u.cross(t).normalized()
    verts = [tuple(P + u * (su * w / 2) + v * (sv * h / 2)) for P in (A, Bv) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    return verts, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]


def arch(half, y0, ys, n=12):
    """doorway outline [(z, y)]: flat foot at y0, sides to the spring line ys, a round head"""
    pts = [(-half, y0), (half, y0), (half, ys)]
    pts += [(half * math.cos(PI * i / n), ys + half * math.sin(PI * i / n)) for i in range(1, n)]
    return pts + [(-half, ys)]


# ---------------- accumulator: one mesh per (slot, ink) ----------------

ACC = {}


def put(slot, ink, geo, t=(0, 0, 0), r=(0, 0, 0), s=(1, 1, 1)):
    ACC.setdefault((slot, ink), []).append(xf(geo, t, r, s))


def flush(parent):
    out = []
    for (slot, ink), geos in ACC.items():
        out.append(mesh(f"{PFX}{slot}_{int(round(ink * 1000))}", join(geos), slot, parent, ink))
    ACC.clear()
    return out


def sign(c, yaw, R):
    """a yellow trefoil disc facing +z turned by yaw about y (yaw pi/2 faces +x)"""
    put("yellow", 0.01, xf(cyl(R, 0.05, 20), r=(PI / 2, 0, 0)), c, (0, yaw, 0))
    put("dark", 0, xf(trefoil(R * 0.8, 0.01), t=(0, 0, 0.025)), c, (0, yaw, 0))


def vestibule():
    """the doorway block the skywalk docks into (front face x -12.6), into the hall to x -7.8"""
    put("cream", 0.07, box(4.8, 6.6, 8.4), (-10.2, 3.3, 0))
    put("yellow", 0.05, box(5.2, 0.7, 8.8), (-10.2, 6.95, 0))
    put("lamp", 0, box(4.755, 0.5, 8.41), (-10.2275, 5.75, 0))
    put("lamp", 0, extrude(arch(2.45, 0.6, 2.6), 0.008, "x"), (-12.602, 0, 0))


def band(slot, x0, x1, z0, z1, y0, y1, gaps=()):
    """a flush band round a box's four walls (5 mm proud), broken on the +x wall where doors stand: gaps [(z0, z1)]"""
    h, yc, o = y1 - y0, (y0 + y1) / 2, 0.01
    put(slot, 0, box(o, h, z1 - z0 + o), (x0, yc, (z0 + z1) / 2))
    for z in (z0, z1):
        put(slot, 0, box(x1 - x0 + o, h, o), ((x0 + x1) / 2, yc, z))
    edges = [z0 - o / 2] + [e for g in gaps for e in g] + [z1 + o / 2]
    for a, b in zip(edges[::2], edges[1::2]):
        put(slot, 0, box(o, h, b - a), (x1, yc, (a + b) / 2))


def tank(cx, cz, R, cy, bslot, legs):
    """a Horton sphere on legs, a coloured girth band"""
    put("cream", 0.05, ball(R, 24, 14), (cx, cy, cz))
    put(bslot, 0.01, lathe(ring_sec(R - 0.06, R + 0.03, cy - 0.32, cy + 0.32), 24), (cx, 0, cz))
    put("dark", 0.01, cyl(0.35, 0.6, 10), (cx, cy + R + 0.1, cz))
    for k in range(legs):
        a = 2 * PI * (k + 0.5) / legs
        x, z = cx + math.sin(a) * R * 0.92, cz + math.cos(a) * R * 0.92
        put("steel", 0.012, cyl(0.2, cy - 0.1, 8), (x, (cy + 0.1) / 2, z))
        put("concrete", 0.01, box(0.8, 0.3, 0.8), (x, 0.15, z))
    put("steel", 0.008, torus(R * 0.92, 0.08, 32, 4), (cx, cy * 0.4, cz))


def pipe(path, r, slot, ink=0.01, seg=6):
    put(slot, ink, tube(path, [r] * len(path), seg, True))


# =============================================================================================
# A  "Pile": fission
# =============================================================================================

def build_a():
    vestibule()
    # switch and control hall: slate, yellow roof cap, the ILMB's cyan band
    put("hall", 0.07, box(16.0, 7.5, 20.0), (0, 3.75, 0))
    put("yellow", 0.06, box(16.8, 0.6, 20.8), (0, 7.8, 0))
    put("cyan", 0, box(16.01, 0.45, 20.01), (0, 6.85, 0))
    band("dark", -8.0, 8.0, -10.0, 10.0, 0.005, 0.8, [(-1.85, -0.55), (2.6, 7.4)])
    # +x face, toward the reactor: control-room windows, personnel door, roller door
    for zc in (-7.6, -4.9, -2.2, 0.5):
        put("lamp", 0, box(0.008, 1.2, 2.3), (8.0, 5.2, zc))
        put("yellow", 0.01, box(0.3, 0.12, 2.5), (8.15, 4.54, zc))
    put("dark", 0, box(0.008, 2.45, 1.2), (8.0, 1.225, -1.2))
    for dz in (-0.67, 0.67):
        put("yellow", 0.01, box(0.14, 2.6, 0.14), (8.07, 1.3, -1.2 + dz))
    put("yellow", 0.01, box(0.14, 0.14, 1.48), (8.07, 2.6, -1.2))
    put("lamp", 0.01, box(0.1, 0.12, 0.5), (8.05, 2.95, -1.2))
    put("steel", 0, box(0.008, 4.2, 4.6), (8.0, 2.1, 5.0))
    for k in range(9):
        put("dark", 0, box(0.012, 0.06, 4.5), (8.008, 0.3 + k * 0.45, 5.0))
    for dz in (-2.42, 2.42):
        put("yellow", 0.015, box(0.2, 4.5, 0.25), (8.1, 2.25, 5.0 + dz))
    put("yellow", 0.015, box(0.2, 0.3, 5.1), (8.1, 4.35, 5.0))
    # side windows
    for s in (-1, 1):
        for xc in (-5.0, -1.5, 2.0, 5.5):
            put("lamp", 0, box(2.2, 0.8, 0.008), (xc, 5.4, s * 10.0))
    # roof: a trefoil in a ring, for the map and anyone flying over
    put("dark", 0, xf(trefoil(4.0, 0.008), r=(-PI / 2, 0, 0)), (0, 8.101, 0))
    put("dark", 0, lathe(ring_sec(4.8, 5.2, 8.097, 8.105), 40))

    RX = 27.0   # reactor centre
    # apron and the regolith berm (the reactor's shield), open toward the hall
    put("concrete", 0.02, cyl(9.4, 0.15, 40), (RX, 0.075, 0))
    put("yellow", 0, lathe(ring_sec(8.3, 8.7, 0.14, 0.155), 40), (RX, 0, 0))
    gap = 0.30
    a0, a1 = -PI / 2 + gap, 3 * PI / 2 - gap
    put("regolith", 0.06, lathe_arc([(9.0, 0.0), (14.2, 0.0), (11.6, 3.0), (9.8, 3.2)], a0, a1, 44), (RX, 0, 0))
    wall = [(8.8, 0.0), (14.5, 0.0), (11.7, 3.35), (9.6, 3.45)]
    for a, off in ((a0, 0.21), (a1, -0.21)):
        put("concrete", 0.03, xf(extrude(wall, 0.4, "z"), t=(0, 0, off)), (RX, 0, 0), (0, a - PI / 2, 0))
    # reactor head at grade: liner collar, domed head, control-drum drives
    put("steel", 0.04, cyl(3.5, 1.3, 28), (RX, 0.65, 0))
    put("yellow", 0, lathe(ring_sec(3.1, 3.45, 1.296, 1.305), 28), (RX, 0, 0))
    put("cream", 0.04, lathe([(3.05, 1.25), (3.05, 1.6), (2.7, 2.2), (1.9, 2.65), (0.0, 2.85)], 28), (RX, 0, 0))
    for k in range(8):
        a = k * PI / 4 + PI / 8
        x, z = RX + math.sin(a) * 3.15, math.cos(a) * 3.15
        put("dark", 0.012, cyl(0.26, 0.9, 10), (x, 1.75, z))
        put("yellow", 0.008, cyl(0.29, 0.12, 10), (x, 2.26, z))
    # shadow shield (steel with tungsten bands) under the converter deck
    put("steel", 0.05, lathe([(0.0, 2.4), (1.9, 2.4), (3.3, 4.3), (3.3, 4.55), (0.0, 4.55)], 28), (RX, 0, 0))
    for t0, t1 in ((0.30, 0.42), (0.62, 0.74)):
        put("dark", 0, lathe(cone_band((1.9, 2.4), (3.3, 4.3), t0, t1), 28), (RX, 0, 0))
    put("dark", 0.03, cyl(3.7, 0.4, 28), (RX, 4.7, 0))
    put("yellow", 0, lathe(ring_sec(3.66, 3.705, 4.6, 4.8), 28), (RX, 0, 0))
    # eight Stirling converters: hot ends glowing at the bottom, finned cold ends, alternator caps, heat pipes to the mast
    for k in range(8):
        a = k * PI / 4 + PI / 8
        x, z = RX + math.sin(a) * 2.6, math.cos(a) * 2.6
        put("hot", 0.012, cyl(0.5, 0.5, 12), (x, 5.15, z))
        put("cream", 0.02, cyl(0.45, 1.3, 12), (x, 6.05, z))
        for y in (5.8, 6.05, 6.3):
            put("steel", 0.008, cyl(0.6, 0.07, 12), (x, y, z))
        put("dark", 0.01, cyl(0.36, 0.32, 10), (x, 6.86, z))
        put("steel", 0.006, B((x, 6.9, z), (RX + math.sin(a) * 0.8, 7.2, math.cos(a) * 0.8), 0.07, 4))
    # the spire: tapered mast, stay collar, blinker and whip
    mprof = [(0.95, 4.8), (0.95, 7.0), (0.75, 24.5), (0.5, 26.5), (0.3, 27.2), (0.0, 27.2)]
    put("cream", 0.04, lathe(mprof, 16), (RX, 0, 0))
    put("yellow", 0, lathe(cone_band((0.75, 24.5), (0.5, 26.5), 0.1, 0.35), 16), (RX, 0, 0))
    put("yellow", 0.012, cyl(0.72, 0.4, 16), (RX, 26.0, 0))
    put("dark", 0.008, cyl(0.12, 0.3, 8), (RX, 27.35, 0))
    put("red", 0, ball(0.28), (RX, 27.7, 0))
    put("steel", 0.006, B((RX, 27.4, 0), (RX, 31.0, 0), 0.04, 4, True))
    # six vertical radiator fins: a header pipe up the inner edge, heat-pipe ribs both faces, a yellow rim, stays
    fin = [(0.95, 7.4), (8.4, 8.3), (6.5, 22.0), (0.95, 23.9)]
    r_out = lambda y: 8.4 - 1.9 * (y - 8.3) / 13.7
    for k in range(6):
        rot, T = (0, k * PI / 3 - PI / 2, 0), (RX, 0, 0)
        put("white", 0.03, extrude(fin, 0.16, "z"), T, rot)
        put("cream", 0.015, tube([(0.95, 7.1, 0), (0.95, 24.1, 0)], [0.22, 0.22], 8), T, rot)
        put("yellow", 0.015, tube([(8.4, 8.3, 0), (6.5, 22.0, 0)], [0.13, 0.13], 6), T, rot)
        for y in (9.6, 11.8, 14.0, 16.2, 18.4, 20.6):
            L = r_out(y) - 0.35 - 1.25
            for s in (-1, 1):
                put("steel", 0, xf(box(L, 0.14, 0.012), t=(1.25 + L / 2, y, s * 0.08)), T, rot)
        put("steel", 0.008, B((0.6, 26.0, 0), (6.45, 22.05, 0), 0.045, 4), T, rot)
        put("steel", 0.008, B((3.4, 4.85, 0), (8.3, 8.25, 0), 0.07, 4), T, rot)
    # cable tray from the converters' junction box to the hall; the access lane beside it
    put("dark", 0.02, box(13.4, 0.22, 0.7), (14.7, 1.1, 1.6))
    for x in (9.4, 12.0, 14.6, 17.2, 19.8):
        put("steel", 0.01, box(0.16, 1.0, 0.16), (x, 0.5, 1.6))
    put("yellow", 0.012, box(0.25, 0.5, 1.0), (8.1, 1.1, 1.6))
    put("dark", 0.02, box(1.1, 1.3, 1.3), (21.9, 0.65, 1.6))
    put("yellow", 0, box(1.106, 0.2, 1.306), (21.9, 1.0, 1.6))
    pipe([(22.2, 1.2, 1.6), (22.9, 3.4, 1.4), (23.7, 4.7, 1.0)], 0.16, "dark", 0.012)
    put("concrete", 0, box(10.0, 0.05, 2.2), (13.0, 0.025, -1.2))
    # exclusion fence round the berm, open at the lane, trefoils on it and a big one at the gate
    FR, n = 16.8, 44
    fa0, fa1 = -PI / 2 + 0.32, 3 * PI / 2 - 0.32
    angs = [fa0 + (fa1 - fa0) * i / n for i in range(n + 1)]
    for i, a in enumerate(angs):
        x, z = RX + math.sin(a) * FR, math.cos(a) * FR
        if i in (0, n):
            put("yellow", 0.012, cyl(0.12, 1.7, 8), (x, 0.85, z))
        else:
            put("steel", 0.006, cyl(0.06, 1.25, 6), (x, 0.625, z))
    for y, slot, r in ((1.12, "yellow", 0.04), (0.6, "dark", 0.03)):
        pipe([(RX + math.sin(a) * FR, y, math.cos(a) * FR) for a in angs], r, slot, 0.006, 4)
    for a in (0.0, PI / 2, PI, PI * 0.25, PI * 0.75, PI * 1.25, PI * 1.75):
        sign((RX + math.sin(a) * (FR + 0.08), 0.85, math.cos(a) * (FR + 0.08)), a, 0.32)
    sign((10.6, 2.2, -6.6), -PI / 2, 1.0)
    for dz in (-0.7, 0.7):
        put("steel", 0.01, box(0.12, 2.9, 0.12), (10.66, 1.45, -6.6 + dz))
    # spent-fuel casks on their pad (+z)
    put("concrete", 0.02, box(11.0, 0.2, 6.6), (0.5, 0.1, 15.0))
    for x in (-3.0, 0.5, 4.0):
        put("cream", 0.03, cyl(1.15, 4.3, 18), (x, 2.35, 15.0))
        put("dark", 0.015, cyl(1.22, 0.3, 18), (x, 4.6, 15.0))
        put("yellow", 0, lathe(ring_sec(1.12, 1.155, 3.4, 3.8), 18), (x, 0, 15.0))
        put("dark", 0, lathe(ring_sec(1.12, 1.155, 0.6, 0.9), 18), (x, 0, 15.0))
    sign((6.4, 1.9, 12.4), -PI / 2, 0.5)
    put("steel", 0.006, box(0.1, 2.3, 0.1), (6.46, 1.15, 12.4))
    # switchyard (-z): two transformers with fins and bushings under a busbar gantry, a duct into the hall
    put("concrete", 0.02, box(11.0, 0.2, 6.6), (0.5, 0.1, -15.0))
    sheds = [(0.16, 0.0), (0.16, 0.15), (0.3, 0.2), (0.14, 0.3), (0.3, 0.4), (0.14, 0.5), (0.3, 0.6), (0.14, 0.7), (0.12, 1.0), (0.0, 1.0)]
    for x in (-2.3, 3.3):
        put("dark", 0.03, box(3.0, 2.6, 2.4), (x, 1.5, -15.0))
        for dx in (-1.1, -0.66, -0.22, 0.22, 0.66, 1.1):
            for s in (-1, 1):
                put("steel", 0.006, box(0.08, 2.0, 0.6), (x + dx, 1.4, -15.0 + s * 1.5))
        for dx in (-0.9, 0.0, 0.9):
            put("light", 0.008, lathe(sheds, 8), (x + dx, 2.8, -15.0))
            put("light", 0.005, cyl(0.08, 0.7, 6), (x + dx, 6.95, -17.6))
            put("dark", 0, B((x + dx, 3.8, -15.0), (x + dx, 6.6, -17.6), 0.025, 4))
    for dx in (-5.0, 5.0):
        put("steel", 0.02, box(0.35, 7.5, 0.35), (0.5 + dx, 3.95, -17.6))
    put("steel", 0.02, box(10.4, 0.45, 0.45), (0.5, 7.5, -17.6))
    pipe([(0.5, 0.5, -13.8), (0.5, 0.5, -9.8)], 0.2, "dark", 0.012)
    return (9.2, -1.6)   # where the preview stands a person for scale


# =============================================================================================
# B  "Bottle": D-He3 fusion, tandem mirror
# =============================================================================================

NCOL = [0]


def col(shape, pos, **size):
    """a collider empty (role col) under the root: box (y = its foot; hx hy hz yaw), cyl (foot; r h), hcyl (y = its axis;
    r len yaw, axis along z turned by yaw), sphere (centre; r)"""
    NCOL[0] += 1
    pivot(f"{PFX}col{NCOL[0]}", pos, ROOT, role="col", shape=shape, **size)


def build_b():
    vestibule()
    col("box", (-10.2, 0, 0), hx=2.4, hy=3.65, hz=4.4)
    # power-conditioning hall: cream, navy foot, cyan band, yellow roof cap
    put("cream", 0.07, box(13.0, 7.0, 18.0), (-1.5, 3.5, 0))
    band("navy", -8.0, 5.0, -9.0, 9.0, 0.005, 1.0, [(-0.65, 0.65)])
    put("cyan", 0, box(13.01, 0.4, 18.01), (-1.5, 6.0, 0))
    put("yellow", 0.06, box(13.8, 0.5, 18.8), (-1.5, 7.25, 0))
    col("box", (-1.5, 0, 0), hx=6.9, hy=3.75, hz=9.4)
    for zc in (-7.0, -4.2, 4.2, 7.0):
        put("lamp", 0, box(0.008, 1.2, 2.3), (5.0, 4.2, zc))
        put("yellow", 0.01, box(0.3, 0.12, 2.5), (5.15, 3.54, zc))
    put("dark", 0, box(0.008, 2.44, 1.2), (5.0, 1.23, 0.0))
    for dz in (-0.67, 0.67):
        put("yellow", 0.01, box(0.14, 2.6, 0.14), (5.07, 1.3, dz))
    put("yellow", 0.01, box(0.14, 0.14, 1.48), (5.07, 2.6, 0.0))
    put("lamp", 0.01, box(0.1, 0.12, 0.5), (5.05, 2.95, 0.0))
    for s in (-1, 1):
        for xc in (-5.0, -1.5, 2.0):
            put("lamp", 0, box(2.2, 0.8, 0.008), (xc, 4.4, s * 9.0))
    # roof: railed all round (open at the ladder head), a ladder up the +z wall, a cooling unit and vents
    RY, LX = 7.5, -7.0
    rail_x, rail_z = (-8.15, 5.15), 9.15
    corners = [(rail_x[0], -rail_z), (rail_x[1], -rail_z), (rail_x[1], rail_z), (LX + 0.45, rail_z)]
    head = [(LX - 0.45, rail_z), (rail_x[0], rail_z), (rail_x[0], -rail_z)]
    for run in (corners, head):
        for y, r in ((RY + 1.1, 0.045), (RY + 0.55, 0.03)):
            pipe([(x, y, z) for x, z in run], r, "yellow", 0.008, 6)
        for (x0, z0), (x1, z1) in zip(run, run[1:]):
            L = math.hypot(x1 - x0, z1 - z0)
            n = max(1, math.ceil(L / 1.4))
            for i in range(n + 1):
                t = i / n
                put("yellow", 0.008, box(0.08, 1.1, 0.08), (x0 + (x1 - x0) * t, RY + 0.55, z0 + (z1 - z0) * t))
            put("dark", 0.006, bar((x0, RY + 0.08, z0), (x1, RY + 0.08, z1), 0.03, 0.15))
    for dx in (-0.23, 0.23):
        put("steel", 0.01, box(0.07, RY + 1.1, 0.07), (LX + dx, (RY + 1.1) / 2, 9.55))
        for y in (1.6, 4.0, 6.4):
            put("steel", 0.006, box(0.05, 0.05, 0.6), (LX + dx, y, 9.27))
    for k in range(int(RY / 0.3)):
        put("steel", 0.006, box(0.46, 0.035, 0.035), (LX, 0.3 + k * 0.3, 9.55))
    put("light", 0.02, box(3.0, 1.2, 2.0), (-5.0, RY + 0.6, -5.5))
    for dx in (-0.7, 0.7):
        put("dark", 0, cyl(0.55, 0.012, 16), (-5.0 + dx, RY + 1.2, -5.5))
    for x, z in ((-6.5, 2.0), (-3.5, 6.0)):
        put("steel", 0.01, cyl(0.25, 0.7, 8), (x, RY + 0.35, z))
        put("steel", 0.01, cyl(0.38, 0.12, 8), (x, RY + 0.76, z))
    # control bridge on the roof, glazed toward the machine; mast with an aircraft lamp
    put("cream", 0.05, box(6.0, 3.6, 10.0), (1.0, 9.3, 0))
    put("lamp", 0, box(0.008, 1.4, 9.2), (4.0, 9.7, 0))
    for s in (-1, 1):
        put("lamp", 0, box(5.2, 1.4, 0.008), (1.0, 9.7, s * 5.0))
    put("yellow", 0.04, box(6.6, 0.4, 10.6), (1.0, 11.3, 0))
    col("box", (1.0, RY, 0), hx=3.3, hy=2.0, hz=5.3)
    put("steel", 0.008, cyl(0.12, 4.0, 8), (-1.0, 13.5, 3.5))
    put("dark", 0.008, cyl(0.16, 0.2, 8), (-1.0, 15.6, 3.5))
    pivot(PFX + "beacon", (-1.0, 15.95, 3.5), ROOT, role="blinker", radius=0.25)

    MX, MY = 16.0, 8.5   # the machine's axis runs along z at x 16, y 8.5
    T, NO = (MX, MY, 0), (0, 0, 0)
    put("light", 0.05, zlathe([(2.0, -12.7), (2.0, 12.7)], 32), T)
    coils = (-10.4, -6.9, -3.4, 3.4, 6.9, 10.4)
    for zc in coils:
        put("navy", 0.05, zlathe(ring_sec(1.98, 3.8, zc - 0.6, zc + 0.6)), T)
        put("yellow", 0, zlathe(ring_sec(3.75, 3.806, zc - 0.22, zc + 0.22)), T)
        put("dark", 0.012, box(0.7, 0.4, 0.9), (MX, MY + 3.9, zc))
    col("hcyl", (MX, MY, 0), r=3.8, len=22.0, yaw=0.0)
    # midplane chamber (the injectors' ports) and plasma windows between the coils
    put("cream", 0.04, zlathe(ring_sec(1.98, 2.4, -2.1, 2.1)), T)
    put("plasma", 0, zlathe(ring_sec(2.36, 2.406, -0.5, 0.5)), T)
    for zm, w in ((5.15, 0.9), (8.65, 0.9), (11.6, 0.6)):
        for s in (-1, 1):
            put("plasma", 0, zlathe(ring_sec(1.97, 2.006, s * zm - w / 2, s * zm + w / 2)), T)
    # each end: mirror plug coil, neck, anchor coil, flared direct-energy converter (stiffened, glowing collector rings,
    # an aircraft lamp on top)
    cone0, cone1 = (2.1, 16.5), (4.7, 19.4)
    for s in (-1, 1):
        S = (1, 1, s)
        put("cream", 0.06, zlathe(ring_sec(1.38, 4.6, 12.2, 14.2)), T, NO, S)
        for z0 in (12.45, 13.65):
            put("navy", 0, zlathe(ring_sec(4.55, 4.606, z0, z0 + 0.3)), T, NO, S)
        put("steel", 0.03, zlathe([(1.4, 12.0), (1.4, 16.4)], 24), T, NO, S)
        put("navy", 0.04, zlathe(ring_sec(1.38, 3.0, 14.8, 15.6)), T, NO, S)
        put("light", 0.06, zlathe([(1.38, 16.0), cone0, cone1, (5.1, 20.2), (5.1, 21.7), (4.8, 22.1), (0.0, 22.1)]), T, NO, S)
        put("yellow", 0, zlathe(ring_sec(5.05, 5.106, 20.5, 21.2)), T, NO, S)
        for r0, r1 in ((1.15, 1.45), (2.15, 2.45), (3.15, 3.45), (4.1, 4.35)):
            put("plasma", 0, zlathe(ring_sec(r0, r1, 22.096, 22.105)), T, NO, S)
        put("plasmaCore", 0, zlathe([(0.0, 22.096), (0.55, 22.096), (0.55, 22.105), (0.0, 22.105)], 24), T, NO, S)
        dr, dz = cone1[0] - cone0[0], cone1[1] - cone0[1]
        L = math.hypot(dr, dz)
        nr, nz = dz / L, -dr / L
        for k in range(8):
            phi = k * PI / 4 + PI / 8
            radial = Vector((math.cos(phi), math.sin(phi), 0))
            pt = lambda t: Vector(T) + radial * (cone0[0] + dr * t + nr * 0.065) + Vector((0, 0, s * (cone0[1] + dz * t + nz * 0.065)))
            put("light", 0.012, bar(pt(0.06), pt(0.94), 0.12, 0.23, radial))
        put("dark", 0.008, cyl(0.16, 0.4, 8), (MX, MY + 5.2, s * 21.0))
        pivot(f"{PFX}lamp{'np'[s > 0]}", (MX, MY + 5.55, s * 21.0), ROOT, role="blinker", radius=0.22)
        col("hcyl", (MX, MY, s * 13.2), r=4.6, len=2.0, yaw=0.0)
        col("hcyl", (MX, MY, s * 15.1), r=3.0, len=1.8, yaw=0.0)
        col("hcyl", (MX, MY, s * 18.0), r=3.6, len=2.6, yaw=0.0)
        col("hcyl", (MX, MY, s * 20.95), r=5.1, len=2.3, yaw=0.0)

    # trestles: a cradle under the ring, splayed legs on footings, a cross beam; about 4 m clear under the cradles
    def trestle(zc, R, th, foot):
        r1 = R + 0.6
        put("steel", 0.03, sector(R - 0.25, r1, math.radians(-128), math.radians(-52), th, 8), (MX, MY, zc))
        cx, cy = 0.616 * r1 - 0.1, MY - 0.788 * r1 + 0.1
        for sx in (-1, 1):
            put("steel", 0.025, bar((MX + sx * foot, 0.1, zc), (MX + sx * cx, cy, zc), 0.5))
            put("concrete", 0.02, box(1.4, 0.4, 1.4), (MX + sx * foot, 0.2, zc))
            col("box", (MX + sx * (foot + cx) / 2, 0, zc), hx=(foot - cx) / 2 + 0.3, hy=cy / 2, hz=0.3)
        k = 2.4 / cy
        reach = foot - (foot - cx) * k
        put("steel", 0.02, bar((MX - reach, 2.4, zc), (MX + reach, 2.4, zc), 0.35))
        col("box", (MX, 2.2, zc), hx=reach, hy=0.2, hz=0.2)
    for zc in (-10.4, -3.4, 3.4, 10.4):
        trestle(zc, 3.8, 0.9, 4.4)
    for s in (-1, 1):
        trestle(s * 13.2, 4.6, 1.6, 4.8)
        trestle(s * 20.9, 5.1, 1.0, 5.0)
    # cryogen header along the coil tops, down to the cryoplant
    pipe([(MX, 12.6, -10.4), (MX, 12.6, 10.4)], 0.2, "cream", 0.015, 8)
    for zc in coils:
        put("cream", 0.01, B((MX, 12.65, zc), (MX, 12.1, zc), 0.12, 6))
    pipe([(MX, 12.6, -10.4), (7.2, 12.6, -10.4), (6.2, 11.4, -12.6), (6.0, 9.4, -13.2)], 0.2, "cream", 0.015, 8)
    put("steel", 0.012, bar((7.2, 0.0, -10.4), (7.2, 12.5, -10.4), 0.3))
    col("cyl", (7.2, 0, -10.4), r=0.3, h=12.6)
    # cryoplant: cold box and two radiator panels
    put("cream", 0.04, cyl(1.3, 9.0, 16), (6.0, 4.5, -13.4))
    put("cream", 0.03, lathe([(1.3, 8.99), (1.1, 9.5), (0.6, 9.75), (0.0, 9.82)], 16), (6.0, 0, -13.4))
    put("navy", 0, lathe(ring_sec(1.27, 1.305, 6.8, 7.4), 16), (6.0, 0, -13.4))
    col("cyl", (6.0, 0, -13.4), r=1.3, h=9.8)
    for zc in (-17.2, -19.4):
        put("white", 0.03, box(5.0, 6.0, 0.14), (3.0, 4.4, zc))
        for xc in (1.0, 2.0, 3.0, 4.0, 5.0):
            for s in (-1, 1):
                put("steel", 0, box(0.14, 5.6, 0.012), (xc, 4.4, zc + s * 0.07))
        for xc in (0.7, 5.3):
            put("steel", 0.01, box(0.2, 1.6, 0.2), (xc, 0.8, zc))
        col("box", (3.0, 0, zc), hx=2.5, hy=3.7, hz=0.1)
    pipe([(5.2, 7.5, -13.6), (5.2, 7.5, -19.6)], 0.12, "cream", 0.01)
    # neutral-beam injectors in a V on the outer side: duct, flanged beamline, ion source with its bushing, stands
    ang = math.radians(25)
    sheds = [(0.2, 0.0), (0.2, 0.2), (0.38, 0.26), (0.18, 0.4), (0.38, 0.52), (0.18, 0.66), (0.38, 0.78), (0.18, 0.92), (0.15, 1.2), (0.0, 1.2)]
    for sg in (-1, 1):
        d = Vector((math.cos(ang), 0, sg * math.sin(ang)))
        P = lambda s: tuple(Vector((MX, MY, 0)) + d * s)
        put("steel", 0.025, bar(P(1.6), P(5.2), 0.9))
        put("cream", 0.04, bar(P(5.0), P(10.2), 1.8, 2.0))
        put("navy", 0.015, bar(P(4.95), P(5.3), 1.95, 2.15))
        put("navy", 0, bar(P(7.4), P(7.9), 1.81, 2.012))
        put("light", 0.03, tube([P(10.0), P(11.8)], [1.0, 1.0], 12, True))
        put("cyan", 0, tube([P(11.794), P(11.806)], [0.6, 0.6], 12, True))
        top = P(10.9)
        put("light", 0.008, lathe(sheds, 8), (top[0], MY + 0.85, top[2]))
        for s in (6.4, 9.2):
            p = P(s)
            put("steel", 0.015, bar((p[0], 0.1, p[2]), (p[0], MY - 0.9, p[2]), 0.35))
            put("concrete", 0.01, box(0.9, 0.3, 0.9), (p[0], 0.15, p[2]))
            col("cyl", (p[0], 0, p[2]), r=0.3, h=MY - 1.0)
        c = P(8.4)
        col("box", (c[0], MY - 1.0, c[2]), hx=1.0, hy=1.1, hz=3.5, yaw=math.atan2(d.x, d.z))
    # fuel: He-3 (green band, from the Exchange) and deuterium (blue) spheres, lines on sleepers to the vessel, and the
    # He-3 fill point where a tanker couples up
    tank(-1.0, 15.0, 3.8, 5.8, "he3", 8)
    tank(-5.0, -15.6, 2.8, 4.4, "deut", 6)
    col("sphere", (-1.0, 5.8, 15.0), r=3.8)
    col("cyl", (-1.0, 0, 15.0), r=3.5, h=5.8)
    col("sphere", (-5.0, 4.4, -15.6), r=2.8)
    col("cyl", (-5.0, 0, -15.6), r=2.6, h=4.4)
    for s, cx, cz, top, slot in ((1, -1.0, 15.0, 2.2, "he3"), (-1, -5.0, -15.6, 1.8, "deut")):
        pipe([(cx, top, cz), (cx, 0.42, cz), (cx, 0.42, s * 11.6), (13.2, 0.42, s * 11.6), (13.2, 7.4, s * 11.6), (14.3, 7.9, s * 11.6)], 0.14, slot, 0.01)
        for x in (cx + 3.0, cx + 7.0, cx + 11.0):
            put("concrete", 0.008, box(0.5, 0.3, 0.6), (x, 0.15, s * 11.6))
    put("cream", 0.02, box(1.4, 1.8, 0.9), (-1.0, 0.9, 21.2))
    put("he3", 0, box(1.41, 0.25, 0.91), (-1.0, 1.5, 21.2))
    put("dark", 0.01, xf(cyl(0.35, 0.4, 12), r=(0, 0, PI / 2)), (-0.1, 1.0, 21.2))
    put("yellow", 0.008, xf(cyl(0.1, 0.3, 8), r=(PI / 2, 0, 0)), (-1.0, 1.1, 21.75))
    pipe([(-1.0, 1.2, 20.8), (-1.0, 1.2, 18.9), (-1.0, 3.2, 17.2)], 0.12, "he3", 0.01)
    for x in (-2.4, 0.4):
        put("yellow", 0.01, cyl(0.15, 1.0, 8), (x, 0.5, 22.3))
    col("box", (-1.0, 0, 21.2), hx=0.7, hy=0.9, hz=0.45)
    # DC lines (gas-insulated) from each converter to the hall, on posts
    for s in (-1, 1):
        pipe([(MX, 3.7, s * 21.6), (MX, 1.4, s * 21.6), (8.0, 1.4, s * 21.6), (8.0, 1.4, s * 6.0), (4.8, 1.4, s * 6.0)], 0.3, "cream", 0.02, 8)
        for x, z in ((12.0, 21.6), (8.0, 21.6), (8.0, 17.0), (8.0, 12.0), (8.0, 8.0)):
            put("steel", 0.01, box(0.3, 1.2, 0.3), (x, 0.6, s * z))
        put("yellow", 0.012, box(0.25, 0.9, 0.9), (5.1, 1.4, s * 6.0))
        col("box", (12.0, 0, s * 21.6), hx=4.0, hy=0.85, hz=0.3)
        col("box", (8.0, 0, s * 13.8), hx=0.3, hy=0.85, hz=7.8)
    return (6.4, -1.4)




ROOT = pivot(f"power_{V}", (0, 0, 0), None, proposal=V, dock=12.6)
FIGURE = build_a() if V == "a" else build_b()
objs = flush(ROOT)
tris = 0
for o in objs:
    o.data.calc_loop_triangles()
    tris += len(o.data.loop_triangles)
print(f"Power Block {V}: {len(objs)} meshes, {tris} triangles, {NCOL[0]} colliders")
try:
    audit_coplanar(objs)
except RuntimeError as e:
    print("AUDIT", e)
audit_flips(objs)
if os.environ.get("MOONRUNNER_EXPORT", "1") != "0":
    export(OUT, list(C.objects))
    if V == "b":
        export(GAME_OUT, list(C.objects))
