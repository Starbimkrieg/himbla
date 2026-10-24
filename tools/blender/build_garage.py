# Vehicle garage builder for Blender (4.2+ / 5.x): the Meridian Exchange's motor pool, exported to src/assets/garage.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_garage.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_garage.py
#
# Two service garages for land-trains and rovers, both exported (roots `garage` and `garage_small`):
#   garage        main: three tall bays with sectional doors under a name board, glazed roof monitor over a lit workshop (trusses,
#                 bridge crane), a service office on one end, and its compound: bunded fuel / coolant yard with canopied pump island,
#                 back yard (rover park with chargers, parts store, rack, skip), power compound behind the office; concrete slab,
#                 railing, lamp posts (61 m by 45 m in all)
#   garage_small  32 m by 17 m: two bays, same building, no office, compound or antenna
# three.js axes (x right, y up, +z forward, bay doors face +z); origin on the ground in the middle of the hall.
#
# Root meshes: shell, roof, outside. Pivots (empties with a `role`, at the origin unless they spin or mark a place) carry what the
# game picks between or reads:
#   door   one pair per bay (extras `bay`, `state` "open" / "closed"): the door shut, or rolled up, plus its status lamp. The game
#          builds each bay's state, so the four garages need not look alike
#   fit    one per bay (extra `bay`): the work inside (rover on a two-post lift, engine stand and drums, or bench with shelves and
#          tyres). Only built for an open bay
#   fan    a roof turbine ventilator head, at its centre; the game spins it about y (extra `speed`, rad/s)
#   blinker  the aircraft lamp on the antenna mast (extra `radius`)
#   cargo  where the game stands a stack of cargo containers (gantry.glb's box): at the stack's foot, extras `n` (how many high),
#          `yaw`, `faction`
#   col    a collider, at its foot: extras `shape` "box" (`hx` `hy` `hz` half sizes, `yaw`), "cyl" (`r`, `h`) or "hcyl" (cylinder
#          lying along z turned by `yaw`: `r`, `len`; pivot on its axis)
# `interior` (lining) and `shopfloor` are self-lit, so open bays read as a lit workshop whatever the sun does.
# Each mesh has ONE material named after a slot (GARAGE_TOON / GARAGE_GLOW in src/models.js); `trim` (cyan band, sign frame,
# rover fenders) is the one the game may recolour per faction.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_garage.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("GARAGE_OUT") or os.path.join(REPO, "src", "assets", "garage.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Garage export ->", OUT)
COLL = "MoonGarage"

# preview colours (the game swaps in its own materials)
SLOT_COLORS = {
    "body": (1.0, 0.96, 0.88), "trim": (0.18, 0.77, 1.0), "navy": (0.11, 0.23, 0.56), "gold": (1.0, 0.82, 0.25),
    "dark": (0.16, 0.14, 0.25), "steel": (0.33, 0.38, 0.48), "metal": (0.54, 0.53, 0.63), "concrete": (0.54, 0.52, 0.6),
    "floor": (0.29, 0.27, 0.36), "shopfloor": (0.42, 0.4, 0.51), "interior": (0.72, 0.71, 0.8), "door": (0.78, 0.8, 0.86), "roof": (0.23, 0.2, 0.33),
    "panel": (0.11, 0.23, 0.54), "tire": (0.1, 0.09, 0.14), "white": (0.95, 0.93, 0.89), "label": (0.16, 0.14, 0.25),
    "stripe": (1.0, 0.96, 0.88), "hazard": (1.0, 0.82, 0.25), "redsafe": (0.79, 0.13, 0.18), "orange": (1.0, 0.48, 0.1),
    "blue": (0.11, 0.39, 0.84), "tank": (0.78, 0.84, 0.92), "hot": (1.0, 0.62, 0.11), "lamp": (1.0, 0.96, 0.66),
    "glass": (0.81, 0.94, 1.0), "window": (1.0, 0.96, 0.65), "green": (0.49, 1.0, 0.42), "red": (1.0, 0.16, 0.29),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
PFX = "garage_"   # object name prefix for the garage being built (Blender names are file-unique)


# ---------------------------------------------------------------------------------------------------------------
# geometry helpers: boxes and kit cylinders, merged per material slot
# ---------------------------------------------------------------------------------------------------------------
class Acc:
    """Boxes and tubes sharing a slot and parent, merged into one mesh on flush."""
    all = []

    def __init__(self, name, slot, parent, ink=0.04, dz=0.0):
        self.name, self.slot, self.parent, self.ink, self.geos, self.dz = name, slot, parent, ink, [], dz   # dz: z offset for everything
        Acc.all.append(self)

    def box(self, cx, y0, cz, w, h, d, rot=(0, 0, 0)):
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, y0 + h / 2, cz + self.dz), rot))
        return self

    def cyl(self, cx, y0, cz, r, h, seg=10, axis="y", rt=None):
        """Cylinder standing on y0 (axis y), or lying with its centre at y0 + h/2 (axis x or z)."""
        g = cylinder(r if rt is None else rt, r, h, seg)[:2]
        rot = {"y": (0, 0, 0), "z": (PI / 2, 0, 0), "x": (0, 0, PI / 2)}[axis]
        self.geos.append(xf(g, (cx, y0 + h / 2, cz + self.dz), rot))
        return self

    def tube(self, a, b, r, seg=5):
        self.geos.append(beam((a[0], a[1], a[2] + self.dz), (b[0], b[1], b[2] + self.dz), r, seg))
        return self

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0)):
        self.geos.append(xf(geo, (t[0], t[1], t[2] + self.dz), rot))
        return self

    def flush(self):
        if self.geos:
            mesh(f"{PFX}{self.name}", join(self.geos), self.slot, self.parent, self.ink)
        self.geos = []


def flush_all():
    for a in Acc.all:
        a.flush()
    Acc.all = []


class Pal:
    """Accumulators under one parent, one per (slot, ink), made on first use: P("steel").box(...)."""

    def __init__(self, name, parent, ink=0.03, dz=0.0):
        self.name, self.parent, self.ink, self.dz, self.accs = name, parent, ink, dz, {}

    def __call__(self, slot, ink=None):
        ink = self.ink if ink is None else ink
        if (slot, ink) not in self.accs:
            n = sum(1 for s, _ in self.accs if s == slot)
            self.accs[(slot, ink)] = Acc(f"{self.name}_{slot}{n or ''}", slot, self.parent, ink, self.dz)
        return self.accs[(slot, ink)]


class Frame:
    """Draws into a Pal via a yaw then a move: for things set down at an angle (a rover, a lamp post)."""

    def __init__(self, pal, t, yaw=0.0):
        self.pal, self.t, self.yaw = pal, t, yaw

    def __call__(self, slot, ink=None):
        return _Moved(self.pal(slot, ink), self.t, self.yaw)


class _Moved:
    """An Acc seen through a Frame (same box / cyl / tube / add)."""

    def __init__(self, acc, t, yaw):
        self.acc, self.t, self.yaw = acc, t, yaw

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0)):
        self.acc.add(xf(geo, t, rot), self.t, (0, self.yaw, 0))
        return self

    def box(self, cx, y0, cz, w, h, d, rot=(0, 0, 0)):
        return self.add(cuboid(w, h, d)[:2], (cx, y0 + h / 2, cz), rot)

    def cyl(self, cx, y0, cz, r, h, seg=10, axis="y", rt=None):
        rot = {"y": (0, 0, 0), "z": (PI / 2, 0, 0), "x": (0, 0, PI / 2)}[axis]
        return self.add(cylinder(r if rt is None else rt, r, h, seg)[:2], (cx, y0 + h / 2, cz), rot)

    def tube(self, a, b, r, seg=5):
        return self.add(beam(a, b, r, seg))


_ncol = [0]


def col_box(parent, x, y0, z, hx, hy, hz, yaw=0.0):
    _ncol[0] += 1
    pivot(f"{PFX}col{_ncol[0]}", (x, y0, z), parent, role="col", shape="box", hx=hx, hy=hy, hz=hz, yaw=yaw)


def col_cyl(parent, x, y0, z, r, h):
    _ncol[0] += 1
    pivot(f"{PFX}col{_ncol[0]}", (x, y0, z), parent, role="col", shape="cyl", r=r, h=h)


def col_hcyl(parent, x, y, z, r, length, yaw=0.0):
    _ncol[0] += 1
    pivot(f"{PFX}col{_ncol[0]}", (x, y, z), parent, role="col", shape="hcyl", r=r, len=length, yaw=yaw)


def flat_dec(x, y, z):
    """Dec page lying flat at height y, read from the front: u = +x, v = -z."""
    d = Dec("+z", (x, y, z))
    d.right, d.up, d.n = (1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)
    return d


def capsule(r, length, end, seg=12):
    """Tank on its side, axis along z: `length` of straight, rounded ends of depth `end`."""
    prof = []
    for i in range(0, 5):
        a = (PI / 2) * i / 4
        prof.append((r * math.sin(a), -length / 2 - end * math.cos(a)))
    for i in range(3, -1, -1):
        a = (PI / 2) * i / 4
        prof.append((r * math.sin(a), length / 2 + end * math.cos(a)))
    return xf(lathe(prof, seg), r=(PI / 2, 0, 0))


def dishlet(A, rim_acc, strut_acc, pos, R, tilt, yaw):
    """Small reflector in build_dish.py's style: thin paraboloid opening along +y, trim rim ring, three struts to a feed; tilted `tilt`
    about x, turned `yaw`, set at `pos`. R: rim radius. A, rim_acc, strut_acc take the shell, the ring (and feed head), the struts."""
    foc, t, n = 0.8 * R, 0.05, 5
    par = lambda r: r * r / (4 * foc)
    rs = [R * i / n for i in range(n + 1)]
    prof = [(0.0, -t)] + [(r, par(r) - t) for r in rs[1:]] + [(R, par(R))] + [(r, par(r)) for r in reversed(rs[1:-1])] + [(0.0, 0.0)]
    put = lambda g: xf(g, pos, (tilt, yaw, 0), order="YXZ")
    A.geos.append(put(lathe(prof, 16)))
    rim_acc.geos.append(put(xf(torus(R + 0.02, 0.05, 16, 4), (0, par(R) - 0.06, 0))))
    for k in range(3):
        a = 2 * PI * (k + 0.5) / 3
        strut_acc.geos.append(put(beam((R * 0.97 * math.sin(a), par(R), R * 0.97 * math.cos(a)), (0, foc * 1.05, 0), 0.025, 4)))
    strut_acc.geos.append(put(beam((0, 0.0, 0), (0, foc * 1.05, 0), 0.04, 5)))
    rim_acc.geos.append(put(xf(cuboid(0.16, 0.12, 0.16)[:2], (0, foc * 1.05 + 0.04, 0))))


def rover(F, parked=True):
    """Motor-pool utility rover in its own frame (nose +z, tyres on y = 0): ladder frame, four big tyres, roll cage over an open seat,
    battery pack in front, drive unit behind. Parked: fenders, lamps, cover, whip; on the lift: drive unit bare and hot. F is a Frame."""
    A = F("steel", 0.04)
    for s in (-1, 1):
        A.box(s * 0.95, 1.15, 0.0, 0.24, 0.26, 6.8)
    for z in (-2.2, 0.0, 2.2, 3.4):
        A.box(0, 1.25, z, 2.1, 0.16, 0.2)
    for z in (-2.2, 2.2):
        A.tube((-1.7, 0.8, z), (1.7, 0.8, z), 0.09, 6)                 # the axles
    T, H = F("tire", 0.04), F("metal", 0.02)
    for s in (-1, 1):
        for z in (-2.2, 2.2):
            T.cyl(s * 1.95, 0.55, z, 0.8, 0.5, 12, "x")
            H.cyl(s * 1.95, 0.52, z, 0.35, 0.56, 10, "x")                # hub on the wheel centre
    K = F("dark", 0.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            K.tube((sx * 0.8, 1.35, 0.2 + sz * 1.1), (sx * 0.8, 2.85, 0.2 + sz * 1.1), 0.07, 5)
        K.tube((sx * 0.8, 2.85, -0.9), (sx * 0.8, 2.85, 1.3), 0.07, 5)
    for z in (-0.9, 1.3):
        K.tube((-0.8, 2.85, z), (0.8, 2.85, z), 0.07, 5)
    S = F("orange", 0.0)
    S.box(0, 1.41, 0.4, 0.9, 0.18, 0.8)
    S.box(0, 1.55, -0.05, 0.9, 0.7, 0.16)
    F("blue", 0.0).box(0, 1.41, 2.4, 1.4, 0.5, 0.9)
    F("green", 0.0).box(0, 1.7, 2.86, 1.1, 0.07, 0.05)
    if parked:
        F("navy", 0.03).box(0, 1.41, -2.3, 1.9, 0.9, 1.5)               # drive unit cover
        Fd = F("trim", 0.03)
        for s in (-1, 1):
            for z in (-2.2, 2.2):
                Fd.box(s * 1.95, 1.66, z, 0.66, 0.08, 1.9)
                K.tube((s * 1.07, 1.3, z), (s * 1.8, 1.66, z), 0.04, 4)
        B = F("dark", 0.03)
        B.box(0, 0.8, 3.55, 2.3, 0.3, 0.2)
        B.box(0, 0.8, -3.5, 2.0, 0.3, 0.2)
        L = F("lamp", 0.0)
        for s in (-1, 1):
            L.box(s * 0.65, 0.86, 3.66, 0.4, 0.18, 0.04)
            F("red", 0.0).box(s * 0.7, 0.88, -3.61, 0.3, 0.14, 0.04)
        F("steel", 0.0).tube((-0.9, 1.41, -3.0), (-0.9, 3.9, -3.0), 0.025, 4)
        F("orange", 0.0).box(-0.68, 3.5, -3.0, 0.42, 0.26, 0.02)
    else:
        A.box(0, 1.41, -2.3, 1.7, 0.95, 1.3)                             # drive unit, cover off
        F("hot", 0.0).cyl(0, 2.35, -2.3, 0.22, 0.12, 8)


def lamp_post(P, h=7.5):
    """Yard lamp in a Frame: pole on a footing, arm along +z, head shining down."""
    P("concrete", 0.03).box(0, 0, 0, 0.6, 0.4, 0.6)
    S = P("steel", 0.03)
    S.cyl(0, 0.4, 0, 0.1, h - 0.4, 8)
    S.tube((0, h - 0.25, 0), (0, h - 0.05, 1.3), 0.06, 5)
    P("dark", 0.03).box(0, h - 0.2, 1.55, 0.5, 0.25, 0.9)
    P("lamp", 0.0).box(0, h - 0.23, 1.55, 0.4, 0.03, 0.75)


def railing(A, Cp, a, b, step=2.5):
    """Yard railing from a to b (x, z): steel posts, yellow caps, two rails."""
    (x0, z0), (x1, z1) = a, b
    L = math.hypot(x1 - x0, z1 - z0)
    n = max(1, round(L / step))
    for i in range(n + 1):
        x, z = x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n
        A.box(x, 0.0, z, 0.1, 1.15, 0.1)
        Cp.box(x, 1.15, z, 0.13, 0.08, 0.13)
    for y in (0.55, 1.05):
        A.tube((x0, y, z0), (x1, y, z1), 0.035, 5)


def hv_sign(d, u, v, w, h, layer=0):
    """DANGER / HIGH VOLTAGE board, (u, v) lower-left: red header, black legend on white."""
    d.rect(u - 0.03, v - 0.03, u + w + 0.03, v + h + 0.03, "dark", layer)
    d.rect(u, v, u + w, v + h, "white", layer + 1)
    hh = h * 0.36
    d.rect(u, v + h - hh, u + w, v + h, "redsafe", layer + 2)
    ps = min(hh * 0.6 / 7, w * 0.86 / 35)
    d.text("DANGER", u + w / 2, v + h - hh + (hh - 7 * ps) / 2, ps, "white", layer + 3, "c")
    ps2 = min(w * 0.88 / 71, (h - hh) * 0.5 / 7)
    d.text("HIGH VOLTAGE", u + w / 2, v + (h - hh - 7 * ps2) / 2, ps2, "dark", layer + 2, "c")


def build(NAME, PFX_, kind):
    """One garage: kind "main" (three bays, service office, compound) or "small" (two bays)."""
    global PFX
    PFX = PFX_
    FULL = kind == "main"
    root = pivot(NAME, (0, 0, 0), None)

    # ---------------------------------------------------------------------------------------------------------------
    # the plan
    # ---------------------------------------------------------------------------------------------------------------
    W, D = (38.0, 20.0) if FULL else (32.0, 17.0)      # hall outside
    HX, HZ = W / 2, D / 2
    FY = 0.08                          # floor: thin plinth (the road runs right up to the doors: no apron, no ramp)
    TOP = 9.0 if FULL else 8.6         # wall tops (parapet stands on the roof above)
    RY = TOP + 0.3                     # roof deck
    BAYS = (-10.0, 0.0, 10.0) if FULL else (-8.0, 8.0)   # bay centres
    BH = 3.5                           # half bay width
    OPEN = 5.85 if FULL else 5.4       # top of the openings
    JAMBS = [(-HX, BAYS[0] - BH)] + [(BAYS[i] + BH, BAYS[i + 1] - BH) for i in range(len(BAYS) - 1)] + [(BAYS[-1] + BH, HX)]  # wall between openings
    LMID, RMID = (JAMBS[0][0] + JAMBS[0][1]) / 2, (JAMBS[-1][0] + JAMBS[-1][1]) / 2   # end pier middles
    PIERS = [(a + b) / 2 for a, b in JAMBS[1:-1]]                                       # middles of piers between bays
    FIT_DZ = 10.0 - HZ                 # fit-outs are laid out for a 20 m deep hall: slide them to a shallower one's back wall
    BX0, BX1 = BAYS[0] - BH, BAYS[-1] + BH
    YY = 0.06                          # compound slab top (main), a step below the plinth

    # ---- plinth (the road runs right up to it) ----
    A = Acc("plinth", "concrete", root, 0.06)
    A.box(0, 0, 0, W + 1.2, FY, D + 1.2)
    A.flush()
    A = Acc("shopFloor", "shopfloor", root, 0.0)
    A.box(0, FY, 0, W - 1.0, 0.02, D - 1.0)                    # workshop floor (self-lit in the game)
    A.flush()

    # ---- shell: front wall round the openings, back, sides, lining inside ----
    A = Acc("walls", "body", root, 0.07)
    for x0, x1 in JAMBS:
        A.box((x0 + x1) / 2, FY, HZ - 0.25, x1 - x0, OPEN - FY, 0.5)
    A.box(0, OPEN, HZ - 0.25, W, TOP - OPEN, 0.5)              # lintel across all openings
    A.box(0, FY, -HZ + 0.25, W, TOP - FY, 0.5)
    for s in (-1, 1):
        A.box(s * (HX - 0.25), FY, 0, 0.5, TOP - FY, D)
    A.flush()
    A = Acc("lining", "interior", root, 0.0)
    A.box(0, FY, -HZ + 0.52, W - 1.1, 7.35, 0.04)
    for s in (-1, 1):
        A.box(s * (HX - 0.52), FY, 0, 0.04, 7.35, D - 1.1)
    A.flush()
    A = Acc("liningRibs", "steel", root, 0.0)
    for x in [-(HX - 2.5) + 3.0 * i for i in range(int((W - 5.0) / 3.0) + 1)]:
        A.box(x, FY, -HZ + 0.56, 0.16, 7.35, 0.1)
    A.flush()
    A = Acc("wainscot", "navy", root, 0.0)                      # navy dado round the lining's foot
    A.box(0, FY, -HZ + 0.555, W - 1.1, 1.2, 0.03)
    for s in (-1, 1):
        A.box(s * (HX - 0.555), FY, 0, 0.03, 1.2, D - 1.1)
    A.flush()
    A = Acc("ceiling", "dark", root, 0.0)
    A.box(0, 7.6, 0, W - 1.0, 0.3, D - 1.0)
    A.flush()
    A = Acc("lights", "lamp", root, 0.0)
    for z in (HZ - 2.8, (HZ - 2.8) / 3, -(HZ - 2.8) / 3, -(HZ - 2.8)):
        A.box(0, 7.45, z, W - 4.0, 0.08, 0.35)
    A.flush()

    # ---- inside frame (seen through open doors): side columns under three trusses, crane runway on brackets, yellow bridge crane
    # across the back with its hoist over bay 1, bay lines on the floor ----
    TZS = (-HZ / 2, 0.0, HZ / 2)
    CX = HX - 0.75
    A = Acc("columns", "steel", root, 0.03)
    for z in TZS:
        for s in (-1, 1):
            A.box(s * CX, FY, z, 0.4, 7.6 - FY, 0.4)
    A.flush()
    A = Acc("trusses", "steel", root, 0.0)
    span = W - 1.6
    n = int(span / 1.6)
    for z in TZS:
        A.box(0, 7.4, z, W - 1.1, 0.2, 0.25)
        A.box(0, 6.62, z, W - 1.1, 0.18, 0.25)
        for i in range(n + 1):
            x = -span / 2 + i * span / n
            A.tube((x, 6.8, z), (x, 7.4, z), 0.04, 4)
            if i < n:
                x2 = x + span / n
                A.tube((x, 6.8, z), (x2, 7.4, z), 0.04, 4) if i % 2 == 0 else A.tube((x, 7.4, z), (x2, 6.8, z), 0.04, 4)
    A.flush()
    BZ = -HZ + 3.6                                            # bridge crane line
    RX = CX - 0.45                                            # runway line
    A = Acc("runway", "steel", root, 0.02)
    for s in (-1, 1):
        A.box(s * RX, 5.95, 0.0 - 0.2, 0.3, 0.3, D - 2.0)
        for z in TZS:
            A.box(s * (RX + 0.25), 5.85, z, 0.3, 0.4, 0.3)        # column brackets
    A.flush()
    A = Acc("bridge", "gold", root, 0.03)
    A.box(0, 6.3, BZ, 2 * RX - 0.4, 0.42, 0.5)
    for s in (-1, 1):
        A.box(s * RX, 6.25, BZ, 0.6, 0.4, 1.6)
    A.flush()
    HKX = BAYS[0] + 2.4
    A = Acc("hoist", "dark", root, 0.02)
    A.box(HKX, 5.7, BZ, 0.9, 0.6, 0.8)
    A.tube((HKX, 3.95, BZ), (HKX, 5.7, BZ), 0.03, 4)
    A.flush()
    A = Acc("hook", "redsafe", root, 0.02)
    A.box(HKX, 3.45, BZ, 0.35, 0.5, 0.25)
    A.add(torus(0.16, 0.035, 10, 4), (HKX, 3.3, BZ), (PI / 2, 0, 0))
    A.flush()
    d = flat_dec(0, FY + 0.02, 0)
    for cx in BAYS:
        for s in (-1, 1):
            u = cx + s * BH
            d.rect(u - 0.06, -(HZ - 0.9), u + 0.06, HZ - 1.0, "hazard")
    d.rect(-HX + 0.6, HZ - 2.66, HX - 0.6, HZ - 2.54, "white")          # walkway line along the back
    d.build(PFX + "bayLines", root)

    # ---- roof deck, parapet and cap, membrane seams ----
    A = Acc("roof", "roof", root, 0.06)
    A.box(0, TOP, 0, W + 0.4, 0.3, D + 0.4)
    A.flush()
    A = Acc("parapet", "body", root, 0.06)
    A.box(0, TOP + 0.3, HZ - 0.05, W + 0.4, 0.75, 0.35)
    A.box(0, TOP + 0.3, -HZ + 0.05, W + 0.4, 0.75, 0.35)
    for s in (-1, 1):
        A.box(s * (HX - 0.05), TOP + 0.3, 0, 0.35, 0.75, D - 0.3)
    A.flush()
    A = Acc("cap", "trim", root, 0.04)
    A.box(0, TOP + 1.05, HZ - 0.05, W + 0.9, 0.16, 0.6)
    A.box(0, TOP + 1.05, -HZ + 0.05, W + 0.9, 0.16, 0.6)
    for s in (-1, 1):
        A.box(s * (HX - 0.05), TOP + 1.05, 0, 0.6, 0.16, D - 0.3)
    A.flush()
    d = flat_dec(0, RY, 0)
    x = -HX + 1.6
    while x < HX - 1.0:
        d.rect(x - 0.03, -(HZ - 0.25), x + 0.03, HZ - 0.25, "dark")
        x += 2.4
    d.build(PFX + "roofSeams", root)

    # ---- wall dressing: navy base course, cyan band between gold pinstripes, pilasters ----
    # (all round the sides and back; on the front only between the openings)
    runs = [(x0, x1, HZ) for x0, x1 in JAMBS]

    def dress(name, slot, y0, h, out, ink=0.0):
        a = Acc(name, slot, root, ink)
        for x0, x1, z in runs:
            a.box((x0 + x1) / 2, y0, z + out / 2, x1 - x0, h, out)
        a.box(0, y0, -HZ - out / 2, W, h, out)
        for s in (-1, 1):
            a.box(s * (HX + out / 2), y0, 0, out, h, D)
        a.flush()

    dress("base", "navy", FY, 0.95, 0.07, 0.03)
    dress("band", "trim", 3.9, 0.7, 0.08, 0.02)
    dress("pinLow", "gold", 3.74, 0.09, 0.1)
    dress("pinHigh", "gold", 4.67, 0.09, 0.1)
    PZ = (-0.375 * D, -0.125 * D, 0.125 * D, 0.375 * D)      # side pilasters
    PXS = (-0.4 * W, -0.2 * W, 0.0, 0.2 * W, 0.4 * W)         # back pilasters
    A = Acc("pilasters", "navy", root, 0.04)
    for z in PZ:
        for s in (-1, 1):
            A.box(s * (HX + 0.15), FY, z, 0.3, TOP - FY, 0.5)
    for x in PXS:
        A.box(x, FY, -HZ - 0.15, 0.5, TOP - FY, 0.3)
    A.flush()

    # cladding seams: faint joints every 1.25 m above and below the band (not under pilasters or behind the office)
    SEGS = ((FY + 1.0, 3.7), (4.8, TOP - 0.1))
    clear = lambda v, posts: all(abs(v - p) > 0.5 for p in posts)
    for face, s in (("+x", 1), ("-x", -1)):
        d = Dec(face, (s * HX, 0, 0), lift=0.004)
        z = -HZ + 0.6
        while z < HZ - 0.5:
            if clear(z, PZ) and not (FULL and s > 0 and z > -3.4):
                u = -z if s > 0 else z
                for y0, y1 in SEGS:
                    d.rect(u - 0.025, y0, u + 0.025, y1, "door")
            z += 1.25
        d.build(PFX + ("seamsR" if s > 0 else "seamsL"), root)
    d = Dec("-z", (0, 0, -HZ), lift=0.004)
    x = -HX + 0.6
    while x < HX - 0.5:
        if clear(x, PXS):
            for y0, y1 in SEGS:
                d.rect(-x - 0.025, y0, -x + 0.025, y1, "door")
        x += 1.25
    d.build(PFX + "seamsBack", root)
    d = Dec("+z", (0, 0, HZ), lift=0.004)
    for x0, x1 in JAMBS:
        x = x0 + 0.9
        while x < x1 - 0.6:
            for y0, y1 in ((FY + 1.0, 3.7), (4.8, OPEN - 0.05)):
                d.rect(x - 0.025, y0, x + 0.025, y1, "door")
            x += 1.25
    d.build(PFX + "seamsFront", root)

    # ---- front: door hoods and bay plates, name board, jamb posts, wall lamps, keypads, parapet floodlights ----
    A = Acc("hoods", "dark", root, 0.04)
    for cx in BAYS:
        A.box(cx, OPEN, HZ, 7.6, 0.9, 0.9)
    A.flush()
    A = Acc("jambPosts", "dark", root, 0.02)
    for cx in BAYS:
        for s in (-1, 1):
            A.box(cx + s * (BH + 0.2), FY, HZ + 0.03, 0.4, OPEN - FY, 0.06)
    A.flush()
    BW = BX1 - BX0 + 0.6                           # name board spans the openings
    BY0, BHT = (7.0, 1.5) if FULL else (6.55, 1.1)
    A = Acc("board", "navy", root, 0.05)
    A.box(0, BY0, HZ + 0.09, BW, BHT, 0.18)
    A.flush()
    A = Acc("boardFrame", "trim", root, 0.03)
    A.box(0, BY0 - 0.08, HZ + 0.1, BW + 0.3, 0.1, 0.22)
    A.box(0, BY0 + BHT - 0.02, HZ + 0.1, BW + 0.3, 0.1, 0.22)
    for s in (-1, 1):
        A.box(s * (BW + 0.2) / 2, BY0 - 0.08, HZ + 0.1, 0.1, BHT + 0.16, 0.22)
    A.flush()
    # a lamp over each pier and each front end
    A = Acc("wallLamps", "dark", root, 0.03)
    L = Acc("wallLampGlow", "lamp", root, 0.0)
    for x in [(a + b) / 2 for a, b in JAMBS]:
        A.box(x, 5.2, HZ + 0.02, 0.9, 0.4, 0.5)
        A.box(x, 4.95, HZ + 0.02, 0.15, 0.25, 0.15)
        L.box(x, 5.1, HZ + 0.3, 0.7, 0.06, 0.34)
    A.flush()
    L.flush()
    # keypad right of each door
    A = Acc("keypads", "steel", root, 0.02)
    Gk = Acc("keypadLamps", "green", root, 0.0)
    for cx in BAYS:
        A.box(cx + BH + 0.68, 1.15, HZ + 0.05, 0.28, 0.4, 0.1)
        Gk.box(cx + BH + 0.68, 1.42, HZ + 0.105, 0.1, 0.08, 0.02)
    A.flush()
    Gk.flush()
    # parapet floodlights over the piers, tilted at the road
    A = Acc("floods", "dark", root, 0.03)
    Lf = Acc("floodGlow", "lamp", root, 0.0)
    tilt = 0.55
    for x in PIERS:
        A.box(x, TOP + 1.12, HZ + 0.3, 0.16, 0.12, 0.9)
        A.add(cuboid(1.0, 0.32, 0.6)[:2], (x, TOP + 0.98, HZ + 0.9), (tilt, 0, 0))
        Lf.add(cuboid(0.84, 0.04, 0.46)[:2], (x, TOP + 0.98 - 0.16 * math.cos(tilt), HZ + 0.9 - 0.16 * math.sin(tilt)), (tilt, 0, 0))
    A.flush()
    Lf.flush()

    # personnel doors (front end pier, back wall): frame, canopy on stays, leaf with window
    def pdoor(x, z0, sg, name):
        A = Acc(name, "dark", root, 0.03)
        A.box(x, FY, z0 + sg * 0.02, 1.6, 2.7, 0.1)
        A.box(x, 3.0, z0 + sg * 0.35, 2.8, 0.12, 1.2)
        A.box(x, 2.7, z0 + sg * 0.86, 2.8, 0.38, 0.1)
        for s in (-1, 1):
            A.tube((x + s * 1.3, 2.7, z0 + sg * 0.9), (x + s * 1.3, 3.0, z0 + sg * 0.6), 0.04)
        A.flush()
        Acc(name + "Leaf", "door", root, 0.02).box(x, FY, z0 + sg * 0.1, 1.2, 2.45, 0.08).flush()
        Acc(name + "Glass", "glass", root, 0.0).box(x, 1.55, z0 + sg * 0.16, 0.5, 0.9, 0.04).flush()

    PDX = LMID - (0.45 if FULL else 0.0)
    pdoor(PDX, HZ, 1, "pdoor")
    if FULL:
        A = Acc("louvreFrame", "dark", root, 0.03)
        A.box(PDX + 2.4, 1.2, HZ + 0.02, 1.1, 1.3, 0.08)
        A.flush()
        A = Acc("louvre", "steel", root, 0.0)
        for k in range(6):
            A.box(PDX + 2.4, 1.1 + k * 0.2, HZ + 0.08, 0.95, 0.06, 0.1)
        A.flush()
    # right end: fire cabinet, electrical cabinet, conduit to the roof
    A = Acc("cabinets", "redsafe", root, 0.03)
    A.box(RMID - 1.45, 1.1, HZ + 0.1, 0.55, 0.85, 0.2)
    A.flush()
    A = Acc("cabinetsSteel", "steel", root, 0.03)
    A.box(RMID + 1.05, 1.0, HZ + 0.15, 1.1, 1.7, 0.3)
    A.tube((RMID + 1.05, 2.7, HZ + 0.1), (RMID + 1.05, TOP, HZ + 0.1), 0.06, 5)
    A.flush()

    # ---- sides and back: high windows between pilasters, left side door and lamp; at the back a roller door into bay 1's end,
    # a personnel door, yard lamps ----
    A = Acc("highFrames", "dark", root, 0.03)
    Gl = Acc("highGlass", "glass", root, 0.0)
    for s_ in (-1, 1):
        for z in (-0.25 * D, 0.0, 0.25 * D):
            if FULL and s_ > 0 and z > -0.2 * D:
                continue                                     # the office roof is in front of these
            A.box(s_ * (HX + 0.04), 6.1, z, 0.08, 1.1, 0.19 * D)
            Gl.box(s_ * (HX + 0.09), 6.25, z, 0.04, 0.8, 0.19 * D - 0.3)
    for x in (-0.3 * W, -0.1 * W, 0.1 * W, 0.3 * W):
        A.box(x, 6.1, -HZ - 0.04, 0.137 * W, 1.1, 0.08)
        Gl.box(x, 6.25, -HZ - 0.09, 0.137 * W - 0.3, 0.8, 0.04)
    SDZ = -HZ + 1.8
    A.box(-HX - 0.04, FY, SDZ, 0.1, 2.7, 1.6)
    A.box(-HX - 0.4, 3.0, SDZ, 1.0, 0.12, 2.8)
    A.flush()
    Gl.flush()
    A = Acc("sideDoor", "door", root, 0.02)
    A.box(-HX - 0.1, FY, SDZ, 0.08, 2.45, 1.2)
    A.flush()
    A = Acc("sideLamp", "dark", root, 0.03)
    A.box(-HX - 0.25, 3.3, SDZ + 2.2, 0.5, 0.35, 0.8)
    A.flush()
    Lm = Acc("sideLampGlow", "lamp", root, 0.0)
    Lm.box(-HX - 0.4, 3.2, SDZ + 2.2, 0.34, 0.06, 0.7)
    Lm.flush()

    RDX, RDW, RDH = -0.3 * W, 3.8, 4.4                         # rear roller door
    A = Acc("rearDoorFrame", "dark", root, 0.03)
    A.box(RDX, FY, -HZ - 0.06, RDW + 0.5, RDH + 0.25 - FY, 0.12)
    A.box(RDX, RDH, -HZ - 0.35, RDW + 0.6, 0.6, 0.6)           # coil hood
    A.flush()
    A = Acc("rearDoor", "door", root, 0.03)
    A.box(RDX, FY, -HZ - 0.15, RDW, RDH - FY, 0.06)
    A.flush()
    A = Acc("rearDoorGrooves", "dark", root, 0.0)
    for k in range(1, 7):
        A.box(RDX, FY + k * (RDH - FY) / 7, -HZ - 0.185, RDW, 0.05, 0.02)
    A.flush()
    Acc("rearDoorBumper", "hazard", root, 0.0).box(RDX, FY + 0.1, -HZ - 0.19, RDW, 0.28, 0.02).flush()
    Acc("rearDoorLamp", "red", root, 0.0).box(RDX + RDW / 2 - 0.3, RDH + 0.2, -HZ - 0.66, 0.24, 0.24, 0.04).flush()
    d = Dec("-z", (0, FY, -HZ - 0.12))
    for s in (-1, 1):
        u = -(RDX + s * (RDW / 2 + 0.13))
        d.hazard(u - 0.12, 0.0, u + 0.12, RDH - FY, "dark", "hazard", 0, 0.16, 0.9)
    d.build(PFX + "rearJambs", root)
    pdoor(0.1 * W, -HZ, -1, "backDoor")
    A = Acc("backLamps", "dark", root, 0.03)
    Lb = Acc("backLampGlow", "lamp", root, 0.0)
    for x in (RDX, 0.1 * W, 0.3 * W):
        y = RDH + 1.0 if x == RDX else 5.2
        A.box(x, y, -HZ - 0.02, 0.9, 0.4, 0.5)
        Lb.box(x, y - 0.1, -HZ - 0.3, 0.7, 0.06, 0.34)
    A.flush()
    Lb.flush()

    # bollards in front of every pier
    A = Acc("bollards", "hazard", root, 0.03)
    for x in [b + s * (BH + 0.4) for b in BAYS for s in (-1, 1)]:
        A.cyl(x, 0.0, HZ + 2.4, 0.17, 1.0, 6)
    A.flush()
    A = Acc("bollardCaps", "dark", root, 0.02)
    for x in [b + s * (BH + 0.4) for b in BAYS for s in (-1, 1)]:
        A.cyl(x, 1.0, HZ + 2.4, 0.19, 0.09, 6)
    A.flush()

    # ---- lettering: name board, bay plates, jamb and threshold hazard stripes ----
    d = Dec("+z", (0, BY0 + BHT / 2, HZ + 0.18))      # board middle
    txt = "MERIDIAN MOTOR POOL" if FULL else "MERIDIAN SERVICE"
    ps = 0.17 if FULL else 0.15
    tw = text_width(txt, ps)
    er = 0.6 if FULL else 0.5
    total = 2 * er + 0.5 + tw
    u0 = -total / 2
    emblem(d, "meridian", u0 + er, 0.0, er, 0)
    d.text(txt, u0 + 2 * er + 0.5, -3.5 * ps, ps, "stripe", 1)
    d.build(PFX + "name", root)
    d = Dec("+z", (0, 0, HZ + 0.9))
    for cx, n in zip(BAYS, "123"):
        # plate and lettering centred on the bay (a lamp either side, in the door pivot)
        d.rect(cx - 1.15, OPEN + 0.22, cx + 1.15, OPEN + 0.72, "white", 0)
        d.text(f"BAY {n}", cx, OPEN + 0.47 - 3.5 * 0.05, 0.05, "label", 1, "c")
    d.build(PFX + "bayPlates", root)
    d = Dec("+z", (0, FY, HZ + 0.07))
    for cx in BAYS:
        for s in (-1, 1):
            u = cx + s * (BH + 0.2)
            d.hazard(u - 0.17, 0.0, u + 0.17, OPEN - FY, "dark", "hazard", 0, 0.16, 0.9)
    d.build(PFX + "jambStripes", root)
    # hazard strip at each threshold
    d = flat_dec(0, FY + 0.01, HZ + 0.6)
    for cx in BAYS:
        d.hazard(cx - BH, 0.05, cx + BH, 0.75, "dark", "hazard", 0, 0.2, 0.8)
    d.build(PFX + "thresholds", root)

    # ---------------------------------------------------------------------------------------------------------------
    # bay doors: a closed and an open pivot per bay, for the game to pick
    # ---------------------------------------------------------------------------------------------------------------
    for b, cx in enumerate(BAYS):
        # tracks and hood are static; the panels and status lamp differ
        for state in ("closed", "open"):
            P = pivot(f"{PFX}door{b}_{state}", (0, 0, 0), root, role="door", bay=b, state=state)
            A = Acc(f"door{b}{state}", "door", P, 0.04)
            G = Acc(f"door{b}{state}Grooves", "dark", P, 0.0)
            if state == "closed":
                A.box(cx, FY, HZ - 0.36, 2 * BH - 0.04, OPEN - FY, 0.12)
                for k in range(1, int((OPEN - FY) / 0.7)):
                    G.box(cx, FY + k * (OPEN - FY) / int((OPEN - FY) / 0.7), HZ - 0.29, 2 * BH - 0.04, 0.05, 0.04)
                G.box(cx, FY, HZ - 0.29, 2 * BH - 0.04, 0.12, 0.05)
                Gl = Acc(f"door{b}{state}Glass", "glass", P, 0.0)
                for x in (-2.55, -0.85, 0.85, 2.55):
                    Gl.box(cx + x, OPEN - 1.45, HZ - 0.28, 1.4, 0.65, 0.05)
                Gl.flush()
                H = Acc(f"door{b}{state}Bumper", "hazard", P, 0.0)
                H.box(cx, FY + 0.12, HZ - 0.27, 2 * BH - 0.04, 0.3, 0.05)
                H.flush()
                lamp = "red"
            else:
                A.box(cx, OPEN - 1.0, HZ - 0.36, 2 * BH - 0.04, 1.0, 0.12)   # last panels, still in the opening
                for k in (1, 2):
                    G.box(cx, OPEN - 1.0 + k * 0.33, HZ - 0.29, 2 * BH - 0.04, 0.05, 0.04)
                R = Acc(f"door{b}{state}Rails", "steel", P, 0.0)
                for s in (-1, 1):                                              # overhead tracks the door runs back on
                    R.box(cx + s * 3.15, OPEN - 0.25, 1.2, 0.12, 0.12, D - 2.4)
                    for z in (HZ - 4.0, HZ - 8.5, HZ - 13.0):
                        R.box(cx + s * 3.15, OPEN - 0.15, z, 0.1, 0.4, 0.1)
                R.flush()
                lamp = "green"
            A.flush()
            G.flush()
            # jamb tracks, plate lamps
            T = Acc(f"door{b}{state}Tracks", "steel", P, 0.0)
            for s in (-1, 1):
                T.box(cx + s * (BH - 0.04), FY, HZ - 0.5, 0.14, OPEN - FY, 0.16)
            T.flush()
            Lp = Acc(f"door{b}{state}Lamp", lamp, P, 0.0)
            for s in (-1, 1):
                Lp.box(cx + s * 1.55, OPEN + 0.4, HZ + 0.92, 0.3, 0.3, 0.06)
            Lp.flush()

    # ---------------------------------------------------------------------------------------------------------------
    # bay fit-outs (built only for open bays)
    # ---------------------------------------------------------------------------------------------------------------
    def fit_lift(b):
        # rover on a two-post lift (drive unit bare), rolling toolbox, hose reel
        cx = BAYS[b]
        F = pivot(f"{PFX}fit{b}", (0, 0, 0), root, role="fit", bay=b)
        P = Pal("fit0", F, 0.0, dz=FIT_DZ)
        A = P("gold", 0.04)
        for s in (-1, 1):
            A.box(cx + s * 2.65, FY, 0.6, 0.45, 4.8, 0.55)
        A.box(cx, 4.85, 0.6, 5.75, 0.18, 0.22)
        A = P("metal")
        for s in (-1, 1):
            A.box(cx + s * 2.65, FY, 0.6, 1.0, 0.1, 0.95)
            A.box(cx + s * 2.65, 1.8, 0.6, 0.55, 0.4, 0.62)
            for t in (-1, 1):
                A.box(cx + s * 1.82, 1.85, 0.6 + t * 0.9, 1.7, 0.13, 0.2)
                A.cyl(cx + s * 1.0, 1.98, 0.6 + t * 0.9, 0.2, 0.12, 8)
        rover(Frame(P, (cx, 0.95, 0.6)), parked=False)                   # frame rests on the arm pads, 2.1 m up
        P("redsafe").box(cx - 3.0, FY, -6.2, 1.3, 1.25, 0.8)
        A = P("dark")
        for k in range(4):
            A.box(cx - 3.0, FY + 0.2 + k * 0.28, -5.78, 1.12, 0.05, 0.03)
        P("orange").cyl(cx + 2.8, 3.4, -9.2, 0.6, 0.35, 10, "z")

    def fit_stand(b):
        # engine on a stand, inspection pit, parts cart, drums
        cx = BAYS[b]
        F = pivot(f"{PFX}fit{b}", (0, 0, 0), root, role="fit", bay=b)
        P = Pal("fit1", F, 0.0, dz=FIT_DZ)
        A = P("steel")
        A.box(cx - 1.4, FY + 0.5, -2.6, 1.5, 0.9, 1.2)
        for sx in (-1, 1):
            for sz in (-1, 1):
                A.tube((cx - 1.4 + sx * 0.6, FY, -2.6 + sz * 0.5), (cx - 1.4 + sx * 0.6, FY + 0.5, -2.6 + sz * 0.5), 0.05, 5)
        P("hot").cyl(cx - 1.4, FY + 1.35, -2.6, 0.2, 0.1, 8)
        A = P("blue")
        for x, z in ((cx + 2.2, -8.6), (cx + 3.0, -8.6), (cx + 2.6, -7.7)):
            A.cyl(x, FY, z, 0.4, 1.0, 12)
        P("redsafe").cyl(cx + 1.4, FY, -8.6, 0.4, 1.0, 12)
        P("dark").box(cx + 1.2, FY, 1.0, 1.6, 0.03, 5.0)
        A = P("hazard")
        for s in (-1, 1):
            A.box(cx + 1.2 + s * 0.85, FY, 1.0, 0.1, 0.03, 5.2)
        A = P("metal")
        A.box(cx - 3.0, FY + 0.35, 2.0, 0.9, 0.08, 1.6)
        for sx in (-1, 1):
            for sz in (-1, 1):
                A.cyl(cx - 3.0 + sx * 0.42, FY + 0.13, 2.0 + sz * 0.7, 0.18, 0.1, 8, "x")

    def fit_bench(b):
        # workbench with vice, pegboard, parts shelves, tyre stack, work lamp on a lead
        cx = BAYS[b]
        F = pivot(f"{PFX}fit{b}", (0, 0, 0), root, role="fit", bay=b)
        P = Pal("fit2", F, 0.0, dz=FIT_DZ)
        P("steel").box(cx - 0.5, FY, -8.7, 5.6, 0.9, 0.9)
        A = P("metal")
        A.box(cx - 0.5, 1.15, -8.65, 5.8, 0.08, 1.05)
        A.box(cx - 0.5, 1.8, -9.42, 5.8, 2.0, 0.05)
        A = P("dark")
        for k in range(5):
            A.box(cx - 2.6 + k * 1.1, FY + 0.15, -8.23, 0.95, 0.5, 0.03)
        for k in range(11):
            A.box(cx - 2.8 + k * 0.5, 2.1 + (k % 3) * 0.35, -9.37, 0.1, 0.5 + (k % 2) * 0.2, 0.04)
        A.tube((cx + 1.0, 7.45, -2.9), (cx + 1.0, 4.7, -2.9), 0.02, 4)
        P("redsafe").box(cx + 1.6, 1.23, -8.6, 0.4, 0.3, 0.35)
        A = P("steel")
        for s in (-1, 1):
            A.box(cx + 4.3 + s * 1.55, FY, -9.1, 0.1, 3.6, 0.6)
        for k in range(4):
            A.box(cx + 4.3, FY + 0.15 + k * 1.0, -9.1, 3.2, 0.08, 0.6)
        for slot, ks in (("orange", (0, 3)), ("blue", (1,)), ("green", (2,))):
            A = P(slot, 0.02)
            for k in ks:
                for j in range(4):
                    A.box(cx + 3.0 + j * 0.8 + (k % 2) * 0.2, FY + 0.23 + k * 1.0, -9.1, 0.6, 0.5, 0.5)
        A = P("tire")
        for k in range(5):
            A.cyl(cx - 3.3, FY + k * 0.32, -4.6, 0.78, 0.3, 10)
        P("metal", 0.02).cyl(cx - 3.3, FY + 1.6, -4.6, 0.4, 0.02, 10)
        P("lamp").box(cx + 1.0, 4.4, -2.9, 0.3, 0.3, 0.3)

    # fit-out per bay
    for b, fit in enumerate((fit_lift, fit_stand, fit_bench) if FULL else (fit_lift, fit_bench)):
        fit(b)

    # ---------------------------------------------------------------------------------------------------------------
    # roof: glazed monitor over the bays; in front, turbine vents (and on the main one its name, big, for cranes and shuttles);
    # behind, plant on dunnage with ducts, exhaust stacks, solar array, ladder hatch with guard rail, paver walkway; antenna mast
    # in the corner
    # ---------------------------------------------------------------------------------------------------------------
    MZ, MW, MUP, MRH = (0.5 if FULL else 0.3), 2.4, 0.6, 1.9   # monitor middle, half width, upstand, ridge
    CW = W - 8.0                                                 # and length
    A = Acc("monitor", "body", root, 0.05)
    A.box(0, RY, MZ, CW, MUP, 2 * MW)
    gable = [(-MW, 0.0), (MW, 0.0), (MW, MUP), (0.0, MRH), (-MW, MUP)]
    for s in (-1, 1):
        A.add(extrude(gable, 0.3, "x"), (s * (CW / 2 - 0.15), RY, MZ))
    A.flush()
    sl, th = math.hypot(MW, MRH - MUP), math.atan2(MRH - MUP, MW)
    nrm = (math.cos(th), math.sin(th))                            # +z slope normal, in (y, z)
    A = Acc("monitorGlass", "glass", root, 0.0)
    for s in (-1, 1):
        A.add(cuboid(CW - 0.6, 0.05, sl)[:2], (0, RY + (MUP + MRH) / 2, MZ + s * MW / 2), (s * th, 0, 0))
    A.flush()
    A = Acc("monitorMullions", "dark", root, 0.0)
    k = int(CW / 2.5)
    for i in range(k + 1):
        x = -(CW - 0.6) / 2 + i * (CW - 0.6) / k
        for s in (-1, 1):
            off = (0.04 * nrm[0], s * 0.04 * nrm[1])
            A.tube((x, RY + MUP + off[0], MZ + s * MW + off[1]), (x, RY + MRH + off[0], MZ + off[1]), 0.05, 4)
    A.flush()
    A = Acc("monitorTrim", "trim", root, 0.03)
    for s in (-1, 1):
        A.box(0, RY + MUP - 0.08, MZ + s * (MW + 0.02), CW + 0.1, 0.14, 0.14)
    A.flush()
    Acc("monitorRidge", "roof", root, 0.03).box(0, RY + MRH - 0.08, MZ, CW - 0.2, 0.16, 0.5).flush()

    # turbine vents: fixed neck, spinning head
    VZ = (MZ + MW + HZ - 0.4) / 2
    VX = 12.5 if FULL else 9.0
    for i, x in enumerate((-VX, VX)):
        A = Acc(f"vent{i}", "steel", root, 0.04)
        A.cyl(x, RY, VZ, 0.4, 0.95, 10)
        A.cyl(x, RY + 0.9, VZ, 0.62, 0.1, 12)
        A.flush()
        Pf = pivot(f"{PFX}fan{i}", (x, RY + 1.0, VZ), root, role="fan", speed=1.2 + 0.4 * i)
        prof = [(0.62, 0.0), (0.7, 0.12), (0.74, 0.5), (0.55, 0.85), (0.2, 1.02), (0.0, 1.06)]
        mesh(f"{PFX}fanHead{i}", lathe(prof, 14), "metal", Pf, 0.03)
        vanes = []
        for k in range(12):
            a = 2 * PI * k / 12
            vanes.append(xf(cuboid(0.07, 0.8, 0.5)[:2], (math.sin(a) * 0.72, 0.45, math.cos(a) * 0.72), (0, a + 0.5, 0)))
        mesh(f"{PFX}fanVanes{i}", join(vanes), "steel", Pf, 0.0)
    if FULL:
        d = flat_dec(0, RY + 0.008, VZ)                # over the roof seams
        rps, rer = 0.22, 1.0
        tw = text_width("MOTOR POOL", rps)
        u0 = -(2 * rer + 0.6 + tw) / 2
        emblem(d, "meridian", u0 + rer, 0.0, rer, 0)
        d.text("MOTOR POOL", u0 + 2 * rer + 0.6, -3.5 * rps, rps, "stripe", 1)
        d.build(PFX + "roofName", root)

    # plant: air handlers on dunnage, fan pair on top, grille, duct into a roof curb
    PLZ = -HZ + 3.3
    for i, x in enumerate((-14.5, -10.6) if FULL else (-12.0,)):
        A = Acc(f"plant{i}", "metal", root, 0.05)
        A.box(x, RY + 0.3, PLZ, 3.4, 1.6, 2.2)
        A.box(x, RY + 0.6, PLZ + 1.55, 0.7, 0.7, 0.9)               # duct
        A.box(x, RY, PLZ + 2.45, 1.0, 1.3, 1.0)                     # curb
        A.flush()
        A = Acc(f"plant{i}Dunnage", "steel", root, 0.02)
        for s in (-1, 1):
            A.box(x, RY, PLZ + s * 0.8, 3.8, 0.3, 0.2)
        for k in range(5):
            A.box(x, RY + 0.65 + k * 0.22, PLZ + 1.12, 2.4, 0.07, 0.04)
        A.flush()
        A = Acc(f"plant{i}Fans", "dark", root, 0.03)
        for s in (-1, 1):
            A.cyl(x + s * 0.8, RY + 1.9, PLZ, 0.72, 0.12, 14)
        A.flush()
    # exhaust stacks (workshop extraction), right of the plant
    STK = ((-7.4, -3.4, 2.6), (-6.5, -2.8, 2.0), (-6.9, -4.3, 3.0)) if FULL else ((-7.5, -4.5, 2.4),)
    A = Acc("stacks", "steel", root, 0.04)
    for x, z, h in STK:
        A.cyl(x, RY, z, 0.2, h, 8)
    A.flush()
    A = Acc("stackCaps", "dark", root, 0.03)
    for x, z, h in STK:
        A.cyl(x, RY + h, z, 0.32, 0.12, 8, rt=0.05)
    A.flush()
    # solar array: rows of front-tilted panels across the back half, cable tray to the plant
    rot = (PI / 9, 0, 0)
    SX0, SN, ROWS = (-2.6, 7, (-4.4, -7.4)) if FULL else (-3.5, 5, (-5.0,))
    A = Acc("solarPanels", "panel", root, 0.03)
    F = Acc("solarFrames", "steel", root, 0.02)
    for zr in ROWS:
        for i in range(SN):
            x = SX0 + i * 2.7
            A.box(x, RY + 0.72, zr, 2.5, 0.07, 1.6, rot)
            F.box(x, RY + 0.66, zr, 2.62, 0.05, 1.72, rot)
        for x in (SX0 - 0.5, SX0 + 2.7 * (SN - 1) + 0.5):
            F.tube((x, RY, zr - 0.55), (x, RY + 0.55, zr - 0.5), 0.05, 4)
            F.tube((x, RY, zr + 0.7), (x, RY + 0.9, zr + 0.55), 0.05, 4)
    plant_end = (-10.6 if FULL else -12.0) + 1.7
    F.box((SX0 - 1.25 + plant_end) / 2, RY, -5.0, SX0 - 1.25 - plant_end, 0.12, 0.3)
    A.flush()
    F.flush()
    # hatch at the ladder head with guard rail; paver walkway from it along the back
    HKZ, HXX = -HZ + 2.0, HX - 1.9
    A = Acc("hatch", "metal", root, 0.03)
    A.box(HXX, RY, HKZ, 1.2, 0.5, 1.2)
    A.box(HXX, RY + 0.5, HKZ, 1.3, 0.08, 1.3)
    A.flush()
    A = Acc("hatchRail", "hazard", root, 0.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            A.tube((HXX + sx * 0.85, RY, HKZ + sz * 0.85), (HXX + sx * 0.85, RY + 1.1, HKZ + sz * 0.85), 0.035, 4)
        A.tube((HXX + sx * 0.85, RY + 1.1, HKZ - 0.85), (HXX + sx * 0.85, RY + 1.1, HKZ + 0.85), 0.035, 4)
    A.tube((HXX - 0.85, RY + 1.1, HKZ + 0.85), (HXX + 0.85, RY + 1.1, HKZ + 0.85), 0.035, 4)
    A.flush()
    A = Acc("pavers", "concrete", root, 0.02)
    x = HX - 3.2
    while x > plant_end - 1.0:
        A.box(x, RY, -HZ + 0.95, 0.85, 0.06, 0.7)
        x -= 1.0
    A.flush()
    # roof ladder up the back wall: rails, rungs, cage hoops
    A = Acc("ladder", "steel", root, 0.02)
    LX, LZ = HX - 2.0, -HZ - 0.5
    for s in (-1, 1):
        A.tube((LX + s * 0.3, 0.12, LZ), (LX + s * 0.3, TOP + 1.2, LZ), 0.04, 4)
    y = 0.6
    while y < TOP + 1.0:
        A.tube((LX - 0.3, y, LZ), (LX + 0.3, y, LZ), 0.025, 3)
        y += 0.6
    for y in (3.2, 5.4, 7.6):
        A.add(torus(0.5, 0.025, 8, 3), (LX, y, LZ - 0.0), (PI / 2, 0, 0))
    for s in (-1, 1):
        for y in (1.0, 5.0, 8.5):
            A.tube((LX + s * 0.3, y, LZ), (LX + s * 0.3, y, LZ + 0.5), 0.03, 4)
    A.flush()
    if FULL:
        # antenna mast, dish, warning lamp
        MX, MZ_ = -HX + 1.6, -HZ + 1.3
        A = Acc("mast", "steel", root, 0.03)
        A.tube((MX, RY, MZ_), (MX, RY + 7.2, MZ_), 0.09, 6)
        for y, w in ((RY + 4.5, 1.8), (RY + 5.6, 1.2)):
            A.tube((MX - w / 2, y, MZ_), (MX + w / 2, y, MZ_), 0.05, 5)
        A.flush()
        A, R_, S_ = Acc("dish", "white", root, 0.03), Acc("dishRim", "trim", root, 0.02), Acc("dishStruts", "steel", root, 0.0)
        dishlet(A, R_, S_, (MX, RY + 3.4, MZ_ + 0.6), 0.6, PI / 2 - 0.25, 0.0)
        A.flush(); R_.flush(); S_.flush()
        pivot(PFX + "beacon", (MX, RY + 7.4, MZ_), root, role="blinker", radius=0.25)

    # hall collider (bays are for show: the door plane is a wall)
    col_box(root, 0, 0, 0, HX + 0.2, 5.4 if FULL else 5.0, HZ + 0.2)

    if FULL:
        # ---------------------------------------------------------------------------------------------------------------
        # service office on the right: windows, door under a lettered canopy, steps, roof plant
        # ---------------------------------------------------------------------------------------------------------------
        OX0, OX1, OZ0, OZ1, OH = HX, HX + 8.5, -3.0, HZ, 4.45
        A = Acc("office", "body", root, 0.06)
        A.box((OX0 + OX1) / 2, FY, (OZ0 + OZ1) / 2, OX1 - OX0, OH - FY, OZ1 - OZ0)
        A.box((OX0 + OX1) / 2, FY - 0.25, (OZ0 + OZ1) / 2, OX1 - OX0 + 1.0, 0.25, OZ1 - OZ0 + 1.0)
        A.flush()
        A = Acc("officeRoof", "roof", root, 0.05)
        A.box((OX0 + OX1) / 2, OH, (OZ0 + OZ1) / 2, OX1 - OX0 + 0.4, 0.25, OZ1 - OZ0 + 0.4)
        A.flush()
        A = Acc("officeParapet", "body", root, 0.04)
        A.box((OX0 + OX1) / 2, OH + 0.25, OZ1 - 0.05, OX1 - OX0 + 0.4, 0.55, 0.3)
        A.box((OX0 + OX1) / 2, OH + 0.25, OZ0 + 0.05, OX1 - OX0 + 0.4, 0.55, 0.3)
        A.box(OX1 - 0.05, OH + 0.25, (OZ0 + OZ1) / 2, 0.3, 0.55, OZ1 - OZ0)
        A.flush()
        A = Acc("officeCap", "trim", root, 0.03)
        A.box((OX0 + OX1) / 2, OH + 0.8, OZ1 - 0.05, OX1 - OX0 + 0.8, 0.14, 0.55)
        A.box((OX0 + OX1) / 2, OH + 0.8, OZ0 + 0.05, OX1 - OX0 + 0.8, 0.14, 0.55)
        A.box(OX1 - 0.05, OH + 0.8, (OZ0 + OZ1) / 2, 0.55, 0.14, OZ1 - OZ0 + 0.4)
        A.flush()
        A = Acc("officeBase", "navy", root, 0.03)
        A.box((OX0 + OX1) / 2 + 0.03, FY, OZ1 + 0.035, OX1 - OX0, 0.95, 0.07)
        A.box(OX1 + 0.035, FY, (OZ0 + OZ1) / 2, 0.07, 0.95, OZ1 - OZ0)
        A.box((OX0 + OX1) / 2 + 0.03, FY, OZ0 - 0.035, OX1 - OX0, 0.95, 0.07)
        A.flush()
        A = Acc("officeBand", "trim", root, 0.02)
        A.box((OX0 + OX1) / 2 + 0.03, 3.45, OZ1 + 0.04, OX1 - OX0, 0.5, 0.08)
        A.box(OX1 + 0.04, 3.45, (OZ0 + OZ1) / 2, 0.08, 0.5, OZ1 - OZ0)
        A.box((OX0 + OX1) / 2 + 0.03, 3.45, OZ0 - 0.04, OX1 - OX0, 0.5, 0.08)
        A.flush()
        # windows (front and end): lit panes, dark frames, sills
        WXS = (OX0 + 4.3, OX0 + 6.8)
        WZS = (OZ0 + 1.5, OZ0 + 4.7, OZ0 + 7.9, OZ0 + 11.1)
        A = Acc("officeFrames", "dark", root, 0.03)
        Gw = Acc("officeGlass", "window", root, 0.0)
        for x in WXS:
            A.box(x, 1.75, OZ1 + 0.04, 1.9, 1.5, 0.08)
            A.box(x, 1.65, OZ1 + 0.14, 2.1, 0.1, 0.22)
            Gw.box(x, 1.9, OZ1 + 0.1, 1.7, 1.2, 0.04)
        for z in WZS:
            A.box(OX1 + 0.04, 1.75, z, 0.08, 1.5, 2.0)
            A.box(OX1 + 0.14, 1.65, z, 0.22, 0.1, 2.2)
            Gw.box(OX1 + 0.1, 1.9, z, 0.04, 1.2, 1.8)
        A.flush()
        Gw.flush()
        A = Acc("officeMullions", "dark", root, 0.0)
        for x in WXS:
            A.box(x, 1.9, OZ1 + 0.13, 0.08, 1.2, 0.05)
        for z in WZS:
            A.box(OX1 + 0.13, 1.9, z, 0.05, 1.2, 0.08)
        A.flush()
        # door, canopy, steps, lamp
        ODX = OX0 + 2.0
        A = Acc("officeDoor", "steel", root, 0.03)
        A.box(ODX, FY, OZ1 + 0.05, 1.5, 2.6, 0.1)
        A.box(ODX, 2.75, OZ1 + 0.6, 2.9, 0.12, 1.4)
        for s in (-1, 1):
            A.tube((ODX + s * 1.35, 2.7, OZ1 + 1.25), (ODX + s * 1.35, 3.0, OZ1 + 0.9), 0.04)
        A.flush()
        Acc("officeFascia", "trim", root, 0.03).box(ODX, 2.7, OZ1 + 1.3, 2.9, 0.42, 0.1).flush()
        Acc("officeLeaf", "door", root, 0.02).box(ODX, FY, OZ1 + 0.12, 1.2, 2.45, 0.08).flush()
        Acc("officeLeafGlass", "glass", root, 0.0).box(ODX, 1.5, OZ1 + 0.18, 0.7, 1.0, 0.04).flush()
        A = Acc("officeSteps", "concrete", root, 0.04)
        A.box(ODX, 0.0, OZ1 + 1.2, 2.6, 0.18, 1.0)
        A.box(ODX, 0.0, OZ1 + 1.0, 2.6, 0.36, 0.5)
        A.flush()
        Acc("officeLamp", "lamp", root, 0.0).box(ODX + 1.3, 2.9, OZ1 + 0.18, 0.2, 0.2, 0.08).flush()
        d = Dec("+z", (ODX, 2.7, OZ1 + 1.36))
        d.text("SERVICE", -text_width("SERVICE", 0.045) / 2, 0.42 / 2 - 3.5 * 0.045, 0.045, "stripe", 0)
        d.build(PFX + "officeSign", root)
        # office roof plant, dish, vent
        Acc("officePlant", "metal", root, 0.04).box(OX0 + 5.5, OH + 0.25, 1.0, 2.4, 1.2, 1.8).flush()
        Acc("officeFan", "dark", root, 0.03).cyl(OX0 + 5.5, OH + 1.45, 1.0, 0.7, 0.1, 12).flush()
        A, R_, S_ = Acc("officeDish", "white", root, 0.03), Acc("officeDishRim", "trim", root, 0.02), Acc("officeDishStruts", "steel", root, 0.0)
        S_.tube((OX0 + 1.8, OH + 0.25, -1.4), (OX0 + 1.8, OH + 1.7, -1.4), 0.06, 5)
        dishlet(A, R_, S_, (OX0 + 1.8, OH + 2.0, -1.1), 0.7, PI / 2 - 0.5, 0.4)
        A.flush(); R_.flush(); S_.flush()
        col_box(root, (OX0 + OX1) / 2 + 0.25, 0, (OZ0 + OZ1) / 2, (OX1 - OX0) / 2 + 0.15, 2.7, (OZ1 - OZ0) / 2 + 0.2)

        # ---------------------------------------------------------------------------------------------------------------
        # compound round three sides (the road forecourt is the fourth): fuel / coolant yard left, back yard behind the hall,
        # power compound behind the office, railing outside. Only the bund and power compound are on concrete; pumps, back yard and
        # side lane sit on the road bed traffic.js lays with the forecourt (garageRoad: forecourt over the pumps, a wide rutless bed
        # under the yard and lane)
        # ---------------------------------------------------------------------------------------------------------------
        CX0, CX1, CZ0 = -27.4, 33.0, -28.0                 # compound outer edges (left, right, back)
        YB = 0.0                                           # things on the road bed stand on the ground
        A = Acc("yardSlab", "concrete", root, 0.04)
        A.box((CX0 - HX - 0.6) / 2, 0, (-HZ - 0.6 + HZ + 0.2) / 2, -HX - 0.6 - CX0, YY, 2 * HZ + 0.8)   # under the bund
        A.box((HX + 0.6 + HX + 8.6) / 2, 0, (-HZ - 0.6 - 3.5) / 2, 8.0, YY, HZ + 0.6 - 3.5)               # under the power compound
        A.flush()

        # ---- fuel / coolant yard: two cradled tanks in a bund, piped into the wall on stanchions; stile, sign board, spill kit;
        # out front a canopied pump island with a fire point ----
        TX, TR, TY = -HX - 4.6, 1.3, 2.0
        BDX0, BDX1, BDZ0, BDZ1, BT = -27.2, -HX - 0.1, -HZ - 0.2, HZ, 0.24     # bund outer faces, wall thickness
        A = Acc("bund", "concrete", root, 0.04)
        A.box(BDX0 + BT / 2, YY, (BDZ0 + BDZ1) / 2, BT, 0.7, BDZ1 - BDZ0)
        for z in (BDZ0 + BT / 2, BDZ1 - BT / 2):
            A.box((BDX0 + BDX1) / 2, YY, z, BDX1 - BDX0, 0.7, BT)
        A.flush()
        A = Acc("bundCap", "hazard", root, 0.0)
        A.box(BDX0 + BT / 2, YY + 0.7, (BDZ0 + BDZ1) / 2, BT + 0.02, 0.05, BDZ1 - BDZ0 + 0.02)
        for z in (BDZ0 + BT / 2, BDZ1 - BT / 2):
            A.box((BDX0 + BDX1) / 2, YY + 0.7, z, BDX1 - BDX0 + 0.02, 0.05, BT + 0.02)
        A.flush()
        col_box(root, BDX0 + BT / 2, 0, (BDZ0 + BDZ1) / 2, BT / 2, 0.4, (BDZ1 - BDZ0) / 2)
        for z in (BDZ0 + BT / 2, BDZ1 - BT / 2):
            col_box(root, (BDX0 + BDX1) / 2, 0, z, (BDX1 - BDX0) / 2, 0.4, BT / 2)
        # stile over the front wall
        STX = -21.2
        A = Acc("stile", "steel", root, 0.02)
        for sg in (-1, 1):
            for k, (y, dz) in enumerate(((0.28, 0.75), (0.56, 0.45))):
                A.box(STX, YY + y - 0.06, BDZ1 - BT / 2 + sg * dz, 0.9, 0.06, 0.3)
            for s in (-1, 1):
                A.tube((STX + s * 0.48, YY, BDZ1 - BT / 2 + sg * 0.95), (STX + s * 0.48, YY + 0.7, BDZ1 - BT / 2 + sg * 0.3), 0.04, 4)
        A.flush()
        A = Acc("stileRail", "hazard", root, 0.02)
        for s in (-1, 1):
            A.tube((STX + s * 0.48, YY + 0.9, BDZ1 - BT / 2 - 0.95), (STX + s * 0.48, YY + 1.0, BDZ1 - BT / 2 + 0.95), 0.03, 4)
            for sg in (-1, 1):
                A.tube((STX + s * 0.48, YY, BDZ1 - BT / 2 + sg * 0.95), (STX + s * 0.48, YY + 0.95, BDZ1 - BT / 2 + sg * 0.95), 0.03, 4)
        A.flush()
        for i, tz in enumerate((5.0, -4.2)):
            tank = pivot(f"{PFX}tank{i}", (0, 0, 0), root)
            mesh(f"{PFX}tankBody{i}", xf(capsule(TR, 6.4, 0.9), (TX, TY, tz)), "tank", tank, 0.05)
            A = Acc(f"tank{i}Cradle", "concrete", tank, 0.04)
            for dz in (-2.3, 2.3):
                A.box(TX, YY, tz + dz, 2.8, 0.85 - YY, 0.7)
            A.flush()
            A = Acc(f"tank{i}Bands", "trim", tank, 0.03)
            for dz in (-1.1, 1.1):
                A.cyl(TX, TY - 0.25, tz + dz, TR + 0.04, 0.5, 16, "z")
            A.flush()
            Acc(f"tank{i}Hazard", "hazard", tank, 0.02).cyl(TX, TY - 0.08, tz, TR + 0.04, 0.16, 16, "z").flush()
            A = Acc(f"tank{i}Fit", "steel", tank, 0.03)
            A.cyl(TX, TY + TR - 0.1, tz - 1.2, 0.38, 0.25, 10)             # manway
            A.cyl(TX, TY + TR + 0.12, tz - 1.2, 0.45, 0.07, 10)
            A.cyl(TX + 0.5, TY + TR - 0.1, tz + 1.4, 0.1, 0.8, 8)           # relief stack
            A.cyl(TX + 0.5, TY + TR + 0.7, tz + 1.4, 0.2, 0.08, 8)
            for s in (-1, 1):                                                # end ladder
                A.tube((TX + s * 0.3, YY, tz + 3.65), (TX + s * 0.3, TY + TR, tz + 3.2), 0.035, 4)
            for k in range(5):
                t = (k + 0.5) / 5
                A.tube((TX - 0.3, YY + t * (TY + TR - YY), tz + 3.65 - 0.45 * t), (TX + 0.3, YY + t * (TY + TR - YY), tz + 3.65 - 0.45 * t), 0.022, 4)
            # pipe: out of the tank side, along the stanchions, up into the wall, flange at the wall
            PY = 1.1
            A.tube((TX + 0.5, PY, tz), (-HX - 0.3, PY, tz), 0.12, 6)                 # starts inside the tank
            A.tube((-HX - 0.3, PY, tz), (-HX - 0.3, 2.4, tz), 0.12, 6)
            A.tube((-HX - 0.3, 2.4, tz), (-HX + 0.1, 2.4, tz), 0.12, 6)
            A.cyl(-HX - 0.12, 2.4 - 0.06, tz, 0.2, 0.12, 8, "x")
            for x in (-21.0,):
                A.box(x, YY, tz, 0.14, PY - 0.12 - YY, 0.14)
                A.box(x, PY - 0.18, tz, 0.5, 0.06, 0.18)
            A.cyl(-21.9, PY, tz, 0.08, 0.35, 6)                               # valve stem
            A.flush()
            Acc(f"tank{i}Valve", "redsafe", tank, 0.02).add(torus(0.22, 0.04, 12, 5), (-21.9, PY + 0.4, tz)).flush()
            Acc(f"tank{i}Gauge", "white", tank, 0.0).cyl(TX - TR - 0.05, TY - 0.2, tz, 0.22, 0.08, 12, "x").flush()
            col_hcyl(root, TX, TY, tz, 1.5, 8.2)
        # spill kit in the bund corner, sign board in front, lamp post at the back
        Acc("spillKit", "hazard", root, 0.03).box(-20.0, YY, BDZ1 - 0.9, 0.9, 0.75, 0.7).flush()
        Acc("spillKitLid", "dark", root, 0.02).box(-20.0, YY + 0.75, BDZ1 - 0.9, 0.96, 0.08, 0.76).flush()
        SGX, SGZ = -25.5, BDZ1 + 0.5
        A = Acc("fuelSign", "steel", root, 0.03)
        for s in (-1, 1):
            A.box(SGX + s * 1.0, YB, SGZ, 0.1, 2.5, 0.1)
        A.box(SGX, 1.0, SGZ + 0.06, 2.5, 1.45, 0.05)
        A.flush()
        d = Dec("+z", (SGX, 1.0, SGZ + 0.085))
        d.rect(-1.2, 0.03, 1.2, 1.42, "white")
        d.rect(-1.2, 1.0, 1.2, 1.42, "navy", 1)
        d.text("FUEL YARD", 0.0, 1.21 - 3.5 * 0.042, 0.042, "stripe", 2, "c")
        nfpa(d, -0.55, 0.5, 0.38, 1, 3, 0, "", 1)
        prohibition(d, 0.6, 0.5, 0.36, "smoke", 1)
        d.build(PFX + "fuelSignFace", root)
        col_box(root, SGX, 0, SGZ, 1.1, 1.25, 0.1)
        # pump island: two pumps on a kerbed island under a canopy, fire point at the end
        IZ = HZ + 4.2
        A = Acc("island", "concrete", root, 0.05)
        A.box(-21.5, 0, IZ, 4.6, 0.22, 1.4)
        A.flush()
        A = Acc("islandKerb", "hazard", root, 0.0)
        for s in (-1, 1):
            A.box(-21.5, 0.22, IZ + s * 0.68, 4.62, 0.02, 0.06)
        A.flush()
        Pm = Pal("pump", root, 0.04)
        for px in (-22.6, -20.4):
            Pm("trim").box(px, 0.22, IZ, 0.8, 1.7, 0.6)
            Pm("trim").box(px, 1.92, IZ, 1.0, 0.16, 0.8)
            Pm("glass", 0.0).box(px, 1.3, IZ + 0.32, 0.55, 0.45, 0.04)
            Pm("dark", 0.0).tube((px + 0.4, 1.2, IZ), (px + 0.8, 0.8, IZ + 0.2), 0.04, 5)
            Pm("dark", 0.0).tube((px + 0.8, 0.8, IZ + 0.2), (px + 0.7, 0.5, IZ + 0.35), 0.04, 5)
            Pm("redsafe", 0.0).box(px + 0.7, 0.38, IZ + 0.35, 0.16, 0.2, 0.1)
        Cn = Pal("canopy", root, 0.04)
        for cx in (-23.55, -19.45):
            Cn("steel").box(cx, 0.22, IZ, 0.3, 4.1, 0.3)
        Cn("roof").box(-21.5, 4.32, IZ, 6.6, 0.3, 4.2)
        Cn("trim", 0.03).box(-21.5, 4.2, IZ + 2.1, 6.7, 0.5, 0.08)
        Cn("trim", 0.03).box(-21.5, 4.2, IZ - 2.1, 6.7, 0.5, 0.08)
        for s in (-1, 1):
            Cn("trim", 0.03).box(-21.5 + s * 3.35, 4.2, IZ, 0.08, 0.5, 4.2)
        for s in (-1, 1):
            Cn("lamp", 0.0).box(-21.5 + s * 1.5, 4.29, IZ, 1.4, 0.04, 1.4)
        d = Dec("+z", (-21.5, 4.2, IZ + 2.15))
        d.text("FUEL", 0.0, 0.25 - 3.5 * 0.05, 0.05, "navy", 0, "c")
        d.build(PFX + "canopySign", root)
        col_box(root, -21.5, 0, IZ, 2.3, 1.0, 0.7)
        for cx in (-23.55, -19.45):
            col_cyl(root, cx, 0, IZ, 0.22, 4.4)
        Fp = Pal("firePoint", root, 0.02)
        Fp("steel").box(-24.6, 0, IZ, 0.1, 1.7, 0.1)
        Fp("redsafe").box(-24.6, 1.45, IZ + 0.07, 0.35, 0.35, 0.03)
        Fp("redsafe").cyl(-24.6, 0.5, IZ + 0.18, 0.12, 0.55, 8)
        Fp("dark", 0.0).cyl(-24.6, 1.05, IZ + 0.18, 0.05, 0.1, 6)

        # ---- back yard: walkway line, hatched loading box at the rear door, rover park with chargers (right), parts store (the
        # game's containers, left), pallet rack, tyres, skip, drums on a spill pallet ----
        d = flat_dec(0, YY, 0)
        d.rect(RDX + RDW / 2 + 0.3, HZ + 2.7, CX1 - 5.6, HZ + 2.82, "hazard")            # walkway edge (v = -z)
        d.hazard(RDX - RDW / 2, HZ + 0.7, RDX + RDW / 2, HZ + 4.9, "hazard", "floor", 0, 0.3, 1.0)
        PKX = (1.0, 6.0, 11.0, 16.0, 21.0)                       # rover park bay lines
        PK0, PK1 = -26.4, -18.8
        for x in PKX:
            d.rect(x - 0.06, -PK1, x + 0.06, -PK0, "white")
        d.rect(PKX[0] - 0.06, -PK0 - 0.12, PKX[-1] + 0.06, -PK0, "white")
        for i in range(len(PKX) - 1):
            d.text(str(i + 1), (PKX[i] + PKX[i + 1]) / 2, -PK1 - 1.3, 0.12, "white", 1, "c")
        # arrows down the side lane and along the back
        def arrow(cu, cv, du, dv, L=2.4, w=0.3):
            n_ = (-dv, du)
            tail, head = (cu - du * L / 2, cv - dv * L / 2), (cu + du * L / 2, cv + dv * L / 2)
            neck = (head[0] - du * 0.9, head[1] - dv * 0.9)
            d.poly([(tail[0] + n_[0] * w / 2, tail[1] + n_[1] * w / 2), (neck[0] + n_[0] * w / 2, neck[1] + n_[1] * w / 2),
                    (neck[0] - n_[0] * w / 2, neck[1] - n_[1] * w / 2), (tail[0] - n_[0] * w / 2, tail[1] - n_[1] * w / 2)], "white")
            d.poly([(neck[0] + n_[0] * 0.55, neck[1] + n_[1] * 0.55), head, (neck[0] - n_[0] * 0.55, neck[1] - n_[1] * 0.55)], "white")
        arrow(30.4, -4.0, 0.0, 1.0)                              # down the lane to the back (+v is -z)
        arrow(30.4, 7.0, 0.0, 1.0)
        arrow(24.0, 16.4, -1.0, 0.0)                             # along the back to the park
        d.build(PFX + "yardMarks", root)

        # rover park: wheel stops, a charger per bay, two rovers on charge
        A = Acc("wheelStops", "hazard", root, 0.02)
        for i in range(len(PKX) - 1):
            A.box((PKX[i] + PKX[i + 1]) / 2, YB, PK0 + 0.5, 1.8, 0.15, 0.25)
        A.flush()
        Ch = Pal("chargers", root, 0.03)
        for i in range(len(PKX) - 1):
            x = (PKX[i] + PKX[i + 1]) / 2 + 1.6
            Ch("white").box(x, YB, PK0 - 0.45, 0.45, 1.45, 0.35)
            Ch("trim").box(x, YB + 1.45, PK0 - 0.45, 0.55, 0.18, 0.45)
            Ch("green", 0.0).box(x, YB + 1.1, PK0 - 0.27, 0.26, 0.2, 0.02)
            Ch("dark", 0.02).box(x - 0.3, YB + 0.7, PK0 - 0.45, 0.14, 0.3, 0.2)
            col_box(root, x, 0, PK0 - 0.45, 0.3, 0.8, 0.25)
        Rp = Pal("parked", root, 0.03)
        for bay in (0, 2):
            x = (PKX[bay] + PKX[bay + 1]) / 2
            rz = PK0 + 0.65 + 3.65                               # back bumper just short of the wheel stop
            rover(Frame(Rp, (x, YB, rz)), parked=True)
            Rp("dark", 0.0).tube((x + 1.3, YB + 0.85, PK0 - 0.45), (x + 0.6, YB + 0.35, PK0 + 0.2), 0.04, 4)
            Rp("dark", 0.0).tube((x + 0.6, YB + 0.35, PK0 + 0.2), (x + 0.3, YB + 0.9, rz - 3.6), 0.04, 4)
            col_box(root, x, 0, rz, 2.25, 1.45, 3.7)

        # parts store: a two-high container stack and one beside it, end-on to the yard (the game places its cargo boxes)
        for z, nh in ((-23.6, 2), (-19.4, 1)):
            pivot(f"{PFX}cargo{nh}", (-18.0, YB, z), root, role="cargo", n=nh, yaw=PI / 2, faction="meridian")
        # drums on a spill pallet by the store
        A = Acc("spillPallet", "hazard", root, 0.03)
        A.box(-15.6, YB, -14.6, 2.0, 0.25, 1.5)
        A.flush()
        for slot, pts in (("blue", ((-16.05, -14.95), (-15.15, -14.95))), ("redsafe", ((-16.05, -14.15),)), ("orange", ((-15.15, -14.15),))):
            A = Acc(f"drums{slot}", slot, root, 0.03)
            for x, z in pts:
                A.cyl(x, YB + 0.25, z, 0.38, 0.95, 12)
                A.cyl(x, YB + 1.2, z, 0.4, 0.04, 12)
            A.flush()
        col_box(root, -15.6, 0, -14.6, 1.0, 0.65, 0.75)
        # pallet rack on the back railing: blue frames, orange beams, crates, bins, tyres, gas bottles
        RKX, RKZ = -3.5, -26.6
        Rk = Pal("rack", root, 0.02)
        for x in (RKX - 2.75, RKX, RKX + 2.75):
            for dz in (-0.5, 0.5):
                Rk("blue").box(x, YB, RKZ + dz, 0.1, 3.7, 0.1)
            Rk("blue", 0.0).tube((x, YB + 0.3, RKZ - 0.5), (x, YB + 1.8, RKZ + 0.5), 0.025, 4)
            Rk("blue", 0.0).tube((x, YB + 1.8, RKZ + 0.5), (x, YB + 3.3, RKZ - 0.5), 0.025, 4)
        for y in (1.25, 2.45, 3.55):
            for dz in (-0.5, 0.5):
                Rk("orange").box(RKX, YB + y, RKZ + dz, 5.6, 0.12, 0.1)
        for y in (1.37, 2.57):
            Rk("metal", 0.0).box(RKX, YB + y, RKZ, 5.4, 0.04, 1.0)
        for x in (RKX - 2.0, RKX - 0.75):                      # floor: tyres on their sides
            for k in range(3):
                Rk("tire").cyl(x, YB + k * 0.3, RKZ, 0.55, 0.3, 10)
        for x in (RKX + 0.8, RKX + 2.0):
            Rk("blue").cyl(x, YB, RKZ, 0.36, 0.95, 10)
        for i, x in enumerate((RKX - 2.0, RKX - 0.8, RKX + 0.7, RKX + 1.9)):   # first beam level: crates and bins
            Rk("steel" if i % 2 == 0 else "navy").box(x, YB + 1.41, RKZ, 1.0, 0.75 if i % 2 == 0 else 0.6, 0.85)
        for x in (RKX - 1.6, RKX + 1.2):                      # second: gas bottles in a cradle, a crate
            for k in range(3):
                Rk("tank").cyl(x - 0.4 + k * 0.4, YB + 2.79 - 0.7, RKZ, 0.18, 1.4, 8, "z")   # lying cylinder: axis at y0 + h / 2
        Rk("orange").box(RKX + 2.3, YB + 2.61, RKZ, 0.8, 0.7, 0.8)
        col_box(root, RKX, 0, RKZ, 2.85, 1.9, 0.6)
        # loose tyre stack, one leaning on it
        A = Acc("tyres", "tire", root, 0.04)
        for k in range(4):
            A.cyl(-8.4, YB + k * 0.3, -25.9, 0.78, 0.3, 12)
        A.add(xf(cylinder(0.78, 0.78, 0.3, 12)[:2], r=(0, 0, PI / 2 - 0.3)), (-7.25, YB + 0.8, -25.9))
        A.flush()
        Acc("tyreHub", "metal", root, 0.0).cyl(-8.4, YB + 1.2, -25.9, 0.38, 0.02, 10).flush()
        col_cyl(root, -8.0, 0, -25.9, 1.0, 1.3)
        # skip: open steel bin with lifting lugs, junk sticking out
        SKX, SKZ = -5.5, -17.6
        A = Acc("skip", "hazard", root, 0.04)
        A.box(SKX, YB, SKZ, 3.0, 0.12, 1.7)
        for s in (-1, 1):
            A.box(SKX, YB, SKZ + s * 0.9, 3.4, 1.4, 0.1)
            A.box(SKX + s * 1.65, YB, SKZ, 0.1, 1.4, 1.7)
        A.flush()
        A = Acc("skipLugs", "dark", root, 0.02)
        for s in (-1, 1):
            for sx in (-1, 1):
                A.box(SKX + sx * 1.2, YB + 1.0, SKZ + s * 0.98, 0.18, 0.3, 0.08)
            A.box(SKX, YB + 1.33, SKZ + s * 0.9, 3.44, 0.1, 0.16)
        A.flush()
        Sk = Pal("skipJunk", root, 0.02)
        Sk("tire").add(xf(cylinder(0.6, 0.6, 0.28, 10)[:2], r=(0.5, 0, PI / 2 - 0.4)), (SKX - 0.7, YB + 1.1, SKZ))
        Sk("steel").tube((SKX + 0.2, YB + 0.4, SKZ - 0.5), (SKX + 1.3, YB + 1.9, SKZ + 0.4), 0.08, 5)
        Sk("metal").add(cuboid(1.2, 0.05, 0.9)[:2], (SKX + 0.6, YB + 1.2, SKZ + 0.1), (0.3, 0.4, 0.5))
        Sk("trim").add(cuboid(0.66, 0.08, 1.9)[:2], (SKX - 0.2, YB + 1.25, SKZ - 0.2), (-0.4, 0.9, 0.2))
        col_box(root, SKX, 0, SKZ, 1.75, 0.75, 1.0)

        # ---- power compound behind the office: transformer, battery container, railing, conduit into the hall ----
        Pw = Pal("power", root, 0.03)
        TFX, TFZ = HX + 3.4, -7.0
        Pw("concrete").box(TFX, YY, TFZ, 2.6, 0.2, 2.2)
        Pw("metal").box(TFX, YY + 0.2, TFZ, 1.7, 1.9, 1.3)
        for s in (-1, 1):
            for k in range(5):
                Pw("steel", 0.0).box(TFX + s * 1.07, YY + 0.45, TFZ - 0.5 + k * 0.25, 0.45, 1.4, 0.05)
        for k in range(3):
            Pw("white", 0.02).cyl(TFX - 0.5 + k * 0.5, YY + 2.1, TFZ, 0.1, 0.42, 8)
        Pw("dark", 0.02).box(TFX, YY + 0.3, TFZ + 0.72, 0.9, 0.7, 0.12)
        d = Dec("+z", (TFX, YY + 1.15, TFZ + 0.66))
        hv_sign(d, -0.42, 0.0, 0.84, 0.56)
        d.build(PFX + "transformerSign", root)
        Pw("dark", 0.0).tube((TFX - 0.2, YY + 0.4, TFZ + 0.78), (TFX - 0.2, YY + 0.4, TFZ + 1.6), 0.07, 5)
        Pw("dark", 0.0).tube((TFX - 0.2, YY + 0.4, TFZ + 1.6), (HX + 0.15, YY + 0.4, TFZ + 1.6), 0.07, 5)
        Pw("dark", 0.0).tube((HX + 0.15, YY + 0.4, TFZ + 1.6), (HX + 0.15, 3.3, TFZ + 1.6), 0.07, 5)
        Pw("steel", 0.02).box(HX + 0.15, 3.1, TFZ + 1.6, 0.25, 0.5, 0.4)
        col_box(root, TFX, 0, TFZ, 1.4, 1.2, 1.1)
        BBX, BBZ, BBL = HX + 6.5, -6.7, 5.4
        Pw("concrete").box(BBX, YY, BBZ, 2.7, 0.2, BBL + 0.3)
        Pw("white", 0.04).box(BBX, YY + 0.2, BBZ, 2.4, 2.5, BBL)
        Pw("trim", 0.0).box(BBX, YY + 2.0, BBZ, 2.44, 0.25, BBL + 0.04)
        for k in range(3):
            for j in range(5):
                Pw("steel", 0.0).box(BBX + 1.21, YY + 0.6 + j * 0.16, BBZ - 1.8 + k * 1.8, 0.04, 0.07, 1.2)
        Pw("steel", 0.02).box(BBX, YY + 0.2, BBZ + BBL / 2 + 0.03, 1.0, 2.1, 0.06)
        Pw("green", 0.0).box(BBX + 1.22, YY + 2.4, BBZ + BBL / 2 - 0.4, 0.04, 0.12, 0.2)
        Pw("metal", 0.03).box(BBX, YY + 2.7, BBZ - 1.2, 1.4, 0.6, 1.4)
        Pw("dark", 0.02).cyl(BBX, YY + 3.3, BBZ - 1.2, 0.5, 0.08, 12)
        d = Dec("+x", (BBX + 1.2, YY + 1.55, BBZ))
        d.text("BATTERY BANK", 0.0, 0.0, 0.045, "navy", 0, "c")
        d.build(PFX + "batteryName", root)
        col_box(root, BBX, 0, BBZ, 1.35, 1.4, BBL / 2 + 0.2)

        # ---- railing: back, right side, and round the power compound (gap for its gate) ----
        A = Acc("railing", "steel", root, 0.02)
        Cp = Acc("railingCaps", "hazard", root, 0.0)
        RL = [((-13.8, CZ0 + 0.1), (CX1 - 0.1, CZ0 + 0.1)), ((CX1 - 0.1, CZ0 + 0.1), (CX1 - 0.1, HZ - 0.2)),
              ((HX + 0.6, -HZ + 0.25), (HX + 8.6, -HZ + 0.25)), ((HX + 8.6, -HZ + 0.25), (HX + 8.6, -6.0)), ((HX + 8.6, -4.8), (HX + 8.6, OZ0 - 0.9))]
        for a, b in RL:
            railing(A, Cp, a, b)
            mx, mz, L_ = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, math.hypot(b[0] - a[0], b[1] - a[1])
            col_box(root, mx, 0, mz, L_ / 2, 0.6, 0.08, math.atan2(b[0] - a[0], b[1] - a[1]) - PI / 2)
        A.flush()
        Cp.flush()

        # ---- lamp posts round the compound ----
        Lp = Pal("lampPosts", root, 0.03)
        for x, z, yaw, y in ((-12.0, CZ0 + 0.6, 0.0, YB), (11.0, CZ0 + 0.6, 0.0, YB), (CX1 - 0.6, CZ0 + 0.6, -PI / 4, YB), (CX1 - 0.6, 2.0, -PI / 2, YB), (-26.4, BDZ0 + 0.7, PI / 4, YY)):
            lamp_post(Frame(Lp, (x, y, z), yaw))
            col_cyl(root, x, 0, z, 0.35, 7.5)

    flush_all()
    return root


build("garage", "garage_", "main")
build("garage_small", "gs_", "small")


# ---------------------------------------------------------------------------------------------------------------
objs = [o for o in C.objects]
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == "MESH")
print("meshes:", sum(1 for o in objs if o.type == "MESH"), "triangles:", tris)
for n in ("garage", "garage_small"):
    if n not in bpy.data.objects or bpy.data.objects[n].parent is not None:
        raise RuntimeError(f"root {n!r} is missing or was renamed")
export(OUT, objs)
if os.environ.get("GARAGE_BLEND"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["GARAGE_BLEND"])
