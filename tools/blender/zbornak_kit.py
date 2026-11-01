# Set pieces for the Antimatter Lab draft (build_zbornak_lab.py execs this after kit.py): a grouping helper that places
# primitives with a local transform, and the lab's furniture (reactor and its intake hatch, robot arms on joint pivots,
# cryo pods, growth pods, exotic-matter storage, holotables, wall projections, splice pod, terminals, the airlock's security
# post) and the plateau's and the ranch's kit (paths, fences, silo, feed bunk, stock tank, sun-mill, bales, gate arch,
# lamps, landing pad, radiator field, solar array).
#
# Three.js axes (x right, y up, +z forward), metres. One material per mesh, named after its slot (SLOT_COLORS in
# build_zbornak_lab.py; the preview lights the GLOW slots and makes the SEE slots see-through). `ink` as the house rules.
# Screens that the preview paints with a picture are their own meshes named `screen_<id>` (a quad, slot `screen`).
# Chimeras and statues are not built here: CHIMS and STATUES collect where they stand and the preview puts real ones there
# (chimeras exported from the game's makeChimera; the statues are runner.glb in stone, as the game's petrified gallery).
# Every part rests on, hangs from or plugs into something: cables and pipes end in a socket, a junction box or a flange.

import math
from mathutils import Vector

PI, TAU = math.pi, 2 * math.pi
CHIMS = []      # (parent, (x, y, z), yaw, scale, index)
STATUES = []    # (parent, (x, y, z), yaw): petrified couriers on plinths
LIGHTS = []     # (parent, (x, y, z), rgb, watts, radius): point lights for the preview's interior shots
CAMS = {}       # name -> ((x, y, z), (tx, ty, tz), lens): the preview's views, in the area's frame
TEXTS = []      # (parent, text, (x, y, z), yaw, size, slot, depth)

INK = {"wall": 0.07, "wall2": 0.05, "roof": 0.06, "panel": 0.04, "dark": 0.03, "steel": 0.03, "metal": 0.03, "hazard": 0.02,
       "floor": 0.0, "barn": 0.06, "barn2": 0.04, "wood": 0.03, "wood2": 0.03, "trim": 0.02, "corr": 0.05, "moss": 0.03,
       "dirt": 0.0, "gravel": 0.0, "path": 0.0, "arm": 0.03, "armdark": 0.02, "rubber": 0.02, "white": 0.03, "brass": 0.015,
       "void": 0.02, "copper": 0.02, "plant": 0.015, "plant2": 0.015, "soil": 0.0, "stone": 0.03}


def rot_y(p, a):
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c)


class Acc:
    """Primitives sharing a slot, an ink and a parent, merged on flush. Geometry goes through the owning group's current
    local transform (G.at)."""
    all = []

    def __init__(self, g, name, slot, ink):
        self.g, self.name, self.slot, self.ink, self.geos = g, name, slot, ink, []
        Acc.all.append(self)

    def _push(self, geo):
        x, y, z, a = self.g.cur
        if x or y or z or a:
            geo = xf(geo, (x, y, z), (0, a, 0))
        self.geos.append(geo)
        return self

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        return self._push(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot))

    def box(self, x0, x1, y0, y1, z0, z1):
        return self.boxc((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))

    def cylc(self, cx, cy, cz, r, h, seg=12, axis="y", rt=None, rot=None):
        g = cylinder(r if rt is None else rt, r, h, seg)[:2]
        rot = rot or {"y": (0, 0, 0), "z": (PI / 2, 0, 0), "x": (0, 0, PI / 2)}[axis]
        return self._push(xf(g, (cx, cy, cz), rot))

    def ball(self, cx, cy, cz, r, w=10, h=7, s=(1, 1, 1), rot=(0, 0, 0)):
        return self._push(xf(sphere(r, w, h)[:2], (cx, cy, cz), rot, s))

    def rb(self, cx, cy, cz, sx, sy, sz, e=0.3, rot=(0, 0, 0), nu=14, nv=8):
        return self._push(xf(rbox(sx, sy, sz, e, nu, nv), (cx, cy, cz), rot))

    def bm(self, a, b, r, seg=6):
        return self._push(beam(a, b, r, seg))

    def path(self, pts, r, seg=6):
        return self._push(tube(pts, r if isinstance(r, (list, tuple)) else [r] * len(pts), seg))

    def tor(self, R, r, t=(0, 0, 0), rot=(0, 0, 0), n=24, rs=6, s=(1, 1, 1)):
        return self._push(xf(torus(R, r, n, rs), t, rot, s))

    def lath(self, profile, t=(0, 0, 0), segs=24, rot=(0, 0, 0), s=(1, 1, 1)):
        return self._push(xf(lathe(profile, segs)[:2], t, rot, s))

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1)):
        return self._push(xf(geo[:2], t, rot, s))

    def polyx(self, pts, x0, x1, t=(0, 0, 0), rot=(0, 0, 0)):
        """outline [(z, y)] extruded along x from x0 to x1"""
        g = xf(extrude(pts, x1 - x0, "x"), ((x0 + x1) / 2, 0, 0))
        return self._push(xf(g, t, rot))

    def polyz(self, pts, z0, z1, t=(0, 0, 0), rot=(0, 0, 0)):
        """outline [(x, y)] extruded along z from z0 to z1"""
        g = xf(extrude(pts, z1 - z0, "z"), (0, 0, (z0 + z1) / 2))
        return self._push(xf(g, t, rot))

    def flush(self):
        if self.geos:
            mesh(self.name, join(self.geos), self.slot, self.g.root, self.ink)
        self.geos = []


_names = {}


def uname(n):
    k = _names.get(n, 0)
    _names[n] = k + 1
    return n if k == 0 else f"{n}_{k}"


class G:
    """A pivot (at x, y, z, turned yaw about y) whose parts are merged per (slot, ink). g.at(x, z, yaw, y) moves the local
    origin for what follows (inside this pivot's frame); g.at() resets it."""

    def __init__(self, name, parent=None, x=0.0, y=0.0, z=0.0, yaw=0.0):
        self.root = pivot(uname(name), (x, y, z), parent)
        self.root.rotation_euler[2] = yaw
        self.accs, self.cur = {}, (0, 0, 0, 0)

    def __call__(self, slot, ink=None):
        ink = INK.get(slot, 0.0) if ink is None else ink
        key = (slot, round(ink, 4))
        if key not in self.accs:
            self.accs[key] = Acc(self, f"{self.root.name}_{slot}{'' if ink == INK.get(slot, 0.0) else '_i' + str(int(ink * 1000))}", slot, ink)
        return self.accs[key]

    def at(self, x=0.0, z=0.0, yaw=0.0, y=0.0):
        self.cur = (x, y, z, yaw)
        return self

    def pt(self, p):
        """a point in the current local frame -> this pivot's frame"""
        x, y, z, a = self.cur
        q = rot_y(p, a)
        return (q[0] + x, q[1] + y, q[2] + z)

    def chim(self, p, yaw, scale, idx):
        CHIMS.append((self.root, self.pt(p), yaw + self.cur[3], scale, idx))

    def light(self, p, rgb, watts, radius=0.3):
        LIGHTS.append((self.root, self.pt(p), rgb, watts, radius))

    def text(self, s, p, yaw, size, slot="lime", depth=0.05):
        TEXTS.append((self.root, s, self.pt(p), yaw + self.cur[3], size, slot, depth))

    def screen(self, sid, cx, cy, cz, w, h, yaw=0.0, tilt=0.0):
        """a picture quad facing +z (turned yaw, tipped back by tilt), its own mesh `screen_<sid>`"""
        v, f = plane(w, h)[:2]
        v, f = xf(xf((v, f), (0, 0, 0), (-tilt, 0, 0)), (cx, cy, cz), (0, yaw, 0))
        x, y, z, a = self.cur
        if x or y or z or a:
            v, f = xf((v, f), (x, y, z), (0, a, 0))
        o = mesh("screen_" + sid, (v, f), "screen", self.root, 0.0, 0)
        o["screen"] = sid
        return o


def flush_all():
    for a in Acc.all:
        a.flush()
    Acc.all = []


def polar(c, th, r):
    """a point at angle th (from +z toward +x) and radius r about c = (x, z)"""
    return (c[0] + r * math.sin(th), c[1] + r * math.cos(th))


# =====================================================================================================================
# the lab's furniture
# =====================================================================================================================

def reactor(g, H, R=3.4, pylons=3, crown_y=None, collar_y=None):
    """The antimatter reactor at g's local origin: plinth, glass containment column H tall, the core (an orb in rings,
    lit), magnetic pylons leaning in from footings outside the pit to a steel collar clamped round the column (each mast
    ends in an emitter head bolted to the collar by a bracket), cable runs from each footing to a socket on the plinth;
    crown_y: the column carries on up through a roof to a crown of rings and a spire at that height. Returns the collar's
    height."""
    g("dark", 0.06).lath([(R + 2.2, 0), (R + 2.2, 0.5), (R + 1.6, 0.9), (R + 1.2, 1.3), (R + 0.4, 1.3)], segs=32)
    g("hazard", 0.0).tor(R + 1.9, 0.08, (0, 0.52, 0), n=40, rs=4)
    g("glass", 0.0).cylc(0, 1.3 + (H - 2.6) / 2, 0, R, H - 2.6, 32)
    g("dark", 0.06).lath([(R + 0.6, H - 1.3), (R + 0.9, H - 0.9), (R + 0.9, H - 0.3), (R + 0.3, H)], segs=32)
    for y in (1.6, H - 1.6):
        g("steel", 0.03).tor(R + 0.08, 0.14, (0, y, 0), n=32)
    for i in range(8):                                                      # the cage's ribs, up the glass
        a = TAU * i / 8
        g("steel", 0.02).bm((math.sin(a) * (R + 0.1), 1.3, math.cos(a) * (R + 0.1)), (math.sin(a) * (R + 0.1), H - 1.3, math.cos(a) * (R + 0.1)), 0.08, 5)
    cy = H * 0.5
    g("pink", 0.0).ball(0, cy, 0, R * 0.42, 16, 12)
    g("pinkhot", 0.0).ball(0, cy, 0, R * 0.26, 12, 8)
    g("lime", 0.0).tor(R * 0.66, 0.1, (0, cy, 0), (0.5, 0, 0.3), n=40)
    g("cyan", 0.0).tor(R * 0.78, 0.08, (0, cy, 0), (-0.4, 0.6, -0.5), n=40)
    g("vio", 0.0).tor(R * 0.55, 0.07, (0, cy, 0), (1.2, 0.2, 0.1), n=40)
    for k in range(5):                                                      # arcs of plasma round the core
        a = k * 1.3
        p = [(math.sin(a + t * 0.9) * R * (0.45 + 0.4 * t), cy + math.sin(t * 5 + k) * 0.7, math.cos(a + t * 0.9) * R * (0.45 + 0.4 * t)) for t in (0, 0.33, 0.66, 1)]
        g("spark", 0.0).path(p, 0.035, 4)
    # the collar the pylons clamp to: a steel band round the glass, bolted flanges above and below
    cly = collar_y or cy - 2.6
    g("steel", 0.04).cylc(0, cly, 0, R + 0.2, 0.8, 32)
    for dy in (-0.42, 0.42):
        g("dark", 0.02).tor(R + 0.24, 0.07, (0, cly + dy, 0), n=32, rs=5)
    for i in range(pylons):
        a = TAU * i / pylons + PI / pylons
        s, c = math.sin(a), math.cos(a)
        foot = (s * (R + 5.5), 0, c * (R + 5.5))
        head = (s * (R + 1.35), cly, c * (R + 1.35))
        g("panel", 0.04).boxc(foot[0], 0.6, foot[2], 2.2, 1.2, 2.2, (0, a, 0))
        g("wall2", 0.05).bm((foot[0], 1.0, foot[2]), head, 0.5, 8)
        f1 = Vector((foot[0], 1.0, foot[2]))
        mast = Vector(head) - f1
        for t0, t1 in ((0.14, 0.22), (0.78, 0.82)):                         # paint bands: sleeves on the mast's own axis
            g("hazard", 0.0).bm(tuple(f1 + mast * t0), tuple(f1 + mast * t1), 0.515, 8)
        g("dark", 0.04).ball(*head, 0.75, 12, 8)
        g("steel", 0.03).boxc(s * (R + 0.75), cly, c * (R + 0.75), 0.7, 0.55, 1.2, (0, a, 0))     # bracket, head to collar
        for k in (-1, 1):                                                   # bolts through the bracket's flange
            g("dark", 0.0).cylc(s * (R + 0.32) + c * 0.22 * k, cly, c * (R + 0.32) - s * 0.22 * k, 0.05, 0.08, 6, rot=(PI / 2, a, 0))
        g("lime", 0.0).boxc(s * (R + 0.21), cly, c * (R + 0.21), 0.45, 0.3, 0.02, (0, a, 0))     # the emitter's lens on the collar
        g("cable", 0.0).path([(s * (R + 4.6), 0.12, c * (R + 4.6)), (s * (R + 3.0), 0.12, c * (R + 3.0)), (s * (R + 2.3), 0.3, c * (R + 2.3))], 0.12, 6)
        g("dark", 0.015).boxc(s * (R + 2.15), 0.35, c * (R + 2.15), 0.5, 0.4, 0.3, (0, a, 0))     # the cable's socket on the plinth
    if crown_y:
        g("glass", 0.0).cylc(0, (H + crown_y) / 2, 0, R * 0.7, crown_y - H, 24)
        g("pink", 0.0).cylc(0, (H + crown_y) / 2, 0, 0.35, crown_y - H, 10)
        for k, y in enumerate((crown_y - 4, crown_y - 1.5, crown_y + 1)):
            g(("lime", "cyan", "pink")[k], 0.0).tor(R * (1.3 - 0.25 * k), 0.22, (0, y, 0), (0.12 * (k - 1), 0, 0.1 * k), n=40)
        g("dark", 0.05).lath([(R * 0.9, crown_y - 6), (R * 0.9, crown_y - 5), (R * 0.55, crown_y + 2.5), (0.3, crown_y + 3.2)], segs=24)
        g("steel", 0.03).cylc(0, crown_y + 7, 0, 0.12, 8, 6, rt=0.05)
        g("red", 0.0).ball(0, crown_y + 11, 0, 0.35, 8, 6)
    g.light((0, cy, 0), (1.0, 0.25, 0.6), 9000 * (H / 14), 1.2)
    return cly


def reactor_intake(g, R, ang, y, r_out, w=1.8):
    """The intake hatch: a bridge from the catwalk's inner edge (r_out, deck at y) across to the column (radius R) at angle
    ang, ending in a hopper with its lid swung up over a chute into a port housing clamped on the glass. Jars are thrown in
    here. Railings along the bridge, a hazard strip at its end, an INTAKE board on the housing, the reactor's glow in the
    throat."""
    g.at(0, 0, ang)                                                         # local +z points out along the bridge
    L = r_out - R - 0.9
    g("panel", 0.03).boxc(0, y - 0.15, R + 0.9 + L / 2 + 0.05, w, 0.3, L + 0.1)
    for k in range(int(L / 0.6)):
        g("dark", 0.0).boxc(0, y + 0.005, R + 1.2 + k * 0.6, w - 0.2, 0.01, 0.08)
    g("hazard", 0.0).boxc(0, y + 0.006, R + 1.15, w - 0.1, 0.01, 0.3)
    for sx in (-1, 1):
        for k in range(int(L / 1.2) + 1):
            g("steel", 0.015).cylc(sx * (w / 2 - 0.05), y + 0.55, R + 1.1 + k * min(1.2, L / max(1, int(L / 1.2))), 0.035, 1.1, 5)
        g("hazard", 0.015).bm((sx * (w / 2 - 0.05), y + 1.1, R + 1.0), (sx * (w / 2 - 0.05), y + 1.1, r_out), 0.045, 5)
        g("steel", 0.0).bm((sx * (w / 2 - 0.05), y + 0.55, R + 1.0), (sx * (w / 2 - 0.05), y + 0.55, r_out), 0.03, 4)
        g("lime", 0.0).boxc(sx * (w / 2 - 0.02), y - 0.05, R + 0.9 + L / 2, 0.04, 0.06, L)
    # the port housing on the glass, its chute and the hopper
    g("steel", 0.04).boxc(0, y + 0.8, R + 0.4, 1.7, 1.6, 0.9)
    g("dark", 0.02).boxc(0, y + 0.8, R + 0.06, 1.9, 1.8, 0.2)
    g("dark", 0.04).boxc(0, y + 1.75, R + 0.55, 1.2, 0.5, 0.5)
    g.text("INTAKE", (0, y + 1.66, R + 0.81), 0, 0.3, "pink", 0.02)
    g("steel", 0.03).cylc(0, y + 0.85, R + 1.2, 0.35, 0.8, 12, "z")
    g("steel", 0.03).add(cylinder(0.75, 0.35, 0.7, 16, True)[:2], (0, y + 0.95, R + 1.75))
    g("hazard", 0.0).tor(0.75, 0.06, (0, y + 1.3, R + 1.75), n=20, rs=4)
    g("pink", 0.0).cylc(0, y + 0.66, R + 1.75, 0.36, 0.04, 16)
    g("dark", 0.03).boxc(0, y + 1.82, R + 1.08, 1.5, 0.08, 1.2, (-1.2, 0, 0))   # the lid, swung up on its hinge
    g("steel", 0.0).cylc(0, y + 1.32, R + 1.05, 0.06, 1.5, 8, "x")
    for sx in (-1, 1):
        g("steel", 0.0).cylc(sx * 0.62, y + 0.45, R + 1.75, 0.06, 0.9, 6)
    g.light((0, y + 1.2, R + 1.75), (1.0, 0.3, 0.6), 160, 0.2)
    g.at()


ARMS = []      # robot arms for the preview to animate: dicts of their joint pivots
WELDS = []     # welders' tool flanges (their glow parts, sparks and light) for the preview to switch and flicker


ARM_TOOL = {"claw": 1.05, "welder": 1.22, "drill": 1.15}   # wrist joint to the tool's working point (m)


def arm_ik(target, phi, tool=1.05, base_h=0.9, reach=(3.2, 2.8)):
    """Joint angles that put a robot_arm's tool point on `target` (the arm's base frame: base on the floor at the origin, facing
    +z) with the tool pitched `phi` from level (-pi/2 points straight down), elbow up: (turret yaw, shoulder, elbow, wrist) in
    robot_arm's convention (shoulder pitch up; elbow and wrist bend down)."""
    tx, ty, tz = target
    L1, L2 = reach
    yaw = math.atan2(tx, tz)
    d, h = math.hypot(tx, tz), ty - (base_h + 0.95)
    wd, wh = d - tool * math.cos(phi), h - tool * math.sin(phi)
    D = max(abs(L1 - L2) + 1e-3, min(math.hypot(wd, wh), L1 + L2 - 1e-3))
    a1 = math.atan2(wh, wd) + math.acos(max(-1.0, min(1.0, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))))
    a2 = math.atan2(wh - L1 * math.sin(a1), wd - L1 * math.cos(a1))
    return yaw, a1, a1 - a2, a2 - phi


def robot_arm(g, x, z, yaw, sh=0.7, el=1.4, wr=0.5, turn=0.0, tool="claw", reach=(3.2, 2.8), base_h=0.9, color="arm", name="arm", roll=0.0):
    """An industrial arm on a pedestal at (x, z) in g's frame facing yaw, built as a chain of pivots the game turns: `turret`
    (yaw on the turntable), `shoulder`, `elbow` and `wrist` (pitch, each about its own joint axis) and `roll` (the tool flange
    turning about the tool's axis), the tool on the flange (claw, welder or drill). sh, el, wr: pitch up from level at the
    shoulder, bend down at the elbow and the wrist (rad; arm_ik solves them for a target); turn: the turntable's yaw. Cables
    run along each link from joint to joint. A welder's tip burns blue-white in a halo, lights its work and throws sparks."""
    p = g.pt((x, 0, z))
    base = G(name, g.root, p[0], 0, p[2], yaw + g.cur[3])
    base.root["role"] = "arm"
    base("armdark").cylc(0, base_h / 2, 0, 0.75, base_h, 16, rt=0.6)
    base("hazard", 0.0).cylc(0, base_h * 0.75, 0, 0.765, 0.16, 16)
    base("dark", 0.02).boxc(0, 0.25, -0.95, 0.7, 0.5, 0.5)
    base("cable", 0.0).path([(0, 0.15, -1.2), (0, 0.1, -2.2), (0.3, 0.1, -3.4)], 0.1, 6)
    tur = G(name + "_turret", base.root, 0, base_h, 0, turn)
    tur.root["role"] = "turret"
    tur(color).cylc(0, 0.35, 0, 0.62, 0.7, 14)
    tur("armdark").boxc(0, 0.95, 0, 0.9, 0.5, 0.6)
    shl = G(name + "_shoulder", tur.root, 0, 0.95, 0)
    shl.root["role"] = "shoulder"
    shl.root.rotation_euler[0] = -sh
    L1, L2 = reach
    shl(color).cylc(0, 0, 0, 0.42, 1.05, 12, "x")
    shl("armdark").cylc(0, 0, 0, 0.3, 1.2, 10, "x")
    shl(color).path([(0, 0, 0), (0, 0, L1 * 0.5), (0, 0, L1)], [0.34, 0.3, 0.26], 8)
    shl("cable", 0.0).path([(0.4, 0.0, 0.2), (0.4, 0.28, L1 * 0.5), (0.36, 0.0, L1 - 0.2)], 0.05, 4)
    elb = G(name + "_elbow", shl.root, 0, 0, L1)
    elb.root["role"] = "elbow"
    elb.root.rotation_euler[0] = el
    elb("armdark").cylc(0, 0, 0, 0.32, 0.7, 12, "x")
    elb(color).path([(0, 0, 0), (0, 0, L2)], [0.24, 0.17], 8)
    elb("cable", 0.0).path([(0.3, 0.0, 0.15), (0.26, 0.2, L2 * 0.5), (0.2, 0.0, L2 - 0.15)], 0.04, 4)
    wri = G(name + "_wrist", elb.root, 0, 0, L2)
    wri.root["role"] = "wrist"
    wri.root.rotation_euler[0] = wr
    wri("armdark").ball(0, 0, 0, 0.2, 10, 7)
    wri("steel").path([(0, 0, 0), (0, 0, 0.5)], [0.14, 0.12], 8)
    rol = G(name + "_roll", wri.root, 0, 0, 0.55)
    rol.root["role"] = "roll"
    rol.root.rotation_euler[1] = -roll                                     # (three.js +z is Blender -y)
    rol("armdark").cylc(0, 0, 0, 0.17, 0.12, 12, "z")
    if tool == "welder":
        rol("copper").path([(0, 0, 0.0), (0, 0, 0.55)], [0.1, 0.05], 8)
        rol("weldcore", 0.0).ball(0, 0, 0.67, 0.14, 10, 7)
        rol("weldhalo", 0.0).ball(0, 0, 0.67, 0.36, 14, 9)
        rol("weldhalo", 0.0).ball(0, 0, 0.67, 0.2, 12, 8)
        for k in range(16):                                                 # sparks fanning off the weld
            b = k * 2.39
            v = Vector((math.sin(b) * 0.9, 0.3 + 0.5 * math.sin(k * 1.7), math.cos(b) * 0.4 + 0.2))
            p0 = Vector((0, 0, 0.67))
            rol("spark", 0.0).path([tuple(p0), tuple(p0 + v * 0.5), tuple(p0 + v * 1.0 + Vector((0, -0.35, 0)))], 0.016, 3)
        rol.light((0, 0.15, 0.6), (0.08, 0.3, 1.0), 3000, 0.08)
        WELDS.append(rol.root)
    elif tool == "drill":
        rol("steel").path([(0, 0, 0.0), (0, 0, 0.6)], [0.12, 0.02], 8)
    else:
        rol("steel", 0.02).boxc(0, 0, 0.08, 0.5, 0.16, 0.16)
        for k in (-1, 1):
            rol("steel").path([(k * 0.2, 0, 0.1), (k * 0.2, 0, 0.3), (k * 0.1, 0, 0.5)], 0.05, 5)
    ARMS.append({"name": name, "base": base.root, "turret": tur.root, "shoulder": shl.root, "elbow": elb.root, "wrist": wri.root,
                 "roll": rol.root, "tool": ARM_TOOL[tool], "base_h": base_h, "reach": reach})
    return base


def cryo_pod(g, x, z, yaw, idx=None, tint="cyan", scale=0.95, wall=3.4):
    """An upright stasis pod at (x, z) facing yaw, its back to a wall `wall` behind it: plinth with a readout, a frosted
    glass capsule (a chimera inside, set by the preview), a crown with a lit ring, two coolant lines from the crown up and
    back into a junction box on the wall."""
    g.at(x, z, yaw)
    g("dark").cylc(0, 0.35, 0, 1.25, 0.7, 20, rt=1.15)
    g("white").cylc(0, 0.8, 0, 1.15, 0.2, 20)
    g(tint, 0.0).tor(1.1, 0.06, (0, 0.95, 0), n=28, rs=4)
    g("glass", 0.0).cylc(0, 2.35, 0, 1.0, 2.9, 20)
    g("frost", 0.0).cylc(0, 1.2, 0, 1.01, 0.6, 20)
    g("white").lath([(1.15, 3.75), (1.15, 4.0), (0.85, 4.4), (0.3, 4.6)], segs=20)
    g(tint, 0.0).tor(1.12, 0.05, (0, 3.85, 0), n=28, rs=4)
    for k in (-1, 1):
        g("steel").cylc(k * 0.45, 4.42, -0.35, 0.12, 0.25, 8)
        g("steel").path([(k * 0.45, 4.5, -0.35), (k * 0.45, 5.2, -0.6), (k * 0.4, 5.5, -wall * 0.6), (k * 0.35, 5.5, -wall + 0.3)], 0.08, 6)
    g("dark", 0.02).boxc(0, 5.5, -wall + 0.15, 1.3, 0.7, 0.3)
    g("steel", 0.0).cylc(0, 5.98, -wall + 0.15, 0.08, 0.26, 8)              # conduit up into the cable tray
    g(tint, 0.0).boxc(0, 5.5, -wall + 0.31, 0.9, 0.12, 0.02)
    g("dark", 0.015).boxc(0, 0.42, 1.18, 1.0, 0.45, 0.12, (-0.2, 0, 0))
    g("screenlit", 0.0).boxc(0, 0.44, 1.235, 0.8, 0.3, 0.02, (-0.2, 0, 0))
    for k in range(3):
        g(("lime", "red", "lime")[k], 0.0).ball(-0.3 + 0.3 * k, 0.72, 1.12, 0.04, 6, 4)
    if idx is not None:
        g.chim((0, 1.0, 0), PI * 0, scale, idx)
    g.light((0, 2.4, 0.4), (0.4, 0.85, 1.0), 120, 0.2)
    g.at()


def growth_pod(g, x, z, yaw=0.0, seed=0, h=2.0, line=1.6):
    """A sealed growth pod: a white pedestal holding a nutrient bath, a glass capsule with a domed top, three tiers of
    glowing plants on trays round a central stem, a grow-light ring under a white cap, a mister, and a nutrient line from the
    pedestal into the floor header `line` behind it (local -z)."""
    g.at(x, z, yaw)
    g("white", 0.04).lath([(0.85, 0), (0.85, 0.35), (0.75, 0.55), (0.72, 0.6)], segs=20)
    g("teal", 0.0).cylc(0, 0.62, 0, 0.66, 0.08, 20)
    g("glassg", 0.0).cylc(0, 0.6 + h / 2, 0, 0.7, h, 20)
    g("glassg", 0.0).add(sphere(0.7, 20, 6, PI / 2)[:2], (0, 0.6 + h, 0))
    g("white", 0.03).tor(0.72, 0.06, (0, 0.6 + h, 0), n=24, rs=5)
    g("vio", 0.0).tor(0.5, 0.04, (0, 0.6 + h + 0.3, 0), n=24, rs=4)
    g("steel", 0.0).cylc(0, 0.6 + h / 2 + 0.3, 0, 0.04, h + 0.6, 6)
    for t in range(3):
        y = 0.9 + t * (h - 0.4) / 3
        g("white", 0.0).cylc(0, y, 0, 0.55 - t * 0.06, 0.04, 16)
        n = 7 - t
        for i in range(n):
            a = TAU * i / n + seed + t
            r = 0.38 - t * 0.05
            px, pz = math.sin(a) * r, math.cos(a) * r
            c = ("lime", "teal", "vio", "cyan")[(i + t + seed) % 4]
            kind = (i + seed) % 3
            if kind == 0:
                g("plant", 0.0).bm((px, y, pz), (px, y + 0.22, pz), 0.02, 4)
                g(c, 0.0).ball(px, y + 0.26, pz, 0.07, 8, 6)
            elif kind == 1:
                for k in range(3):
                    b = k * 2.1 + i
                    g("plant2", 0.0).path([(px, y, pz), (px + math.sin(b) * 0.08, y + 0.18, pz + math.cos(b) * 0.08), (px + math.sin(b) * 0.15, y + 0.26, pz + math.cos(b) * 0.15)], [0.025, 0.018, 0.008], 4)
                g(c, 0.0).ball(px, y + 0.1, pz, 0.04, 6, 4)
            else:
                g("plant", 0.0).cylc(px, y + 0.1, pz, 0.025, 0.18, 6)
                g(c, 0.0).ball(px, y + 0.2, pz, 0.1, 10, 5, s=(1, 0.45, 1))
    g("steel", 0.0).cylc(0.62, 0.6 + h - 0.15, 0, 0.05, 0.12, 6)
    g("steel", 0.02).path([(0, 0.25, -0.84), (0, 0.12, -1.0), (0, 0.12, -line)], 0.07, 6)
    g.light((0, 0.6 + h * 0.6, 0), (0.45, 1.0, 0.8), 60, 0.3)
    g.at()


def canister_rack(g, x, z, yaw, L=5.0, rows=3, seed=0):
    """Exotic-matter storage: a shelving rack L long of glass containment canisters, each holding something glowing (a
    swirl, a crystal, a black void bead), steel caps, warning chevrons on the shelf lips."""
    g.at(x, z, yaw)
    for sx in (-L / 2, L / 2):
        g("dark").boxc(sx, rows * 0.9 + 0.2, 0, 0.16, rows * 1.8 + 0.4, 1.0)
    g("dark").boxc(0, rows * 1.8 + 0.4, 0, L + 0.2, 0.12, 1.0)
    for r in range(rows):
        y = 0.25 + r * 1.8
        g("panel").boxc(0, y, 0, L, 0.14, 0.95)
        g("hazard", 0.0).boxc(0, y, 0.48, L, 0.1, 0.02)
        n = int(L / 0.75)
        for i in range(n):
            px = -L / 2 + 0.45 + (L - 0.9) * i / max(1, n - 1)
            k = (i * 7 + r * 3 + seed) % 5
            g("steel").cylc(px, y + 0.17, 0, 0.26, 0.2, 12)
            g("glass", 0.0).cylc(px, y + 0.72, 0, 0.24, 0.9, 12)
            g("steel").cylc(px, y + 1.25, 0, 0.26, 0.16, 12)
            if k == 0:
                g("void", 0.0).ball(px, y + 0.72, 0, 0.15, 10, 7)
                g("vio", 0.0).tor(0.19, 0.02, (px, y + 0.72, 0), (0.6, 0, 0.4), n=16, rs=3)
            elif k == 1:
                g("cyan", 0.0).add(cylinder(0, 0.13, 0.5, 6)[:2], (px, y + 0.72, 0), (0.2, i, 0.1))
            elif k == 2:
                g("pink", 0.0).ball(px, y + 0.72, 0, 0.12, 8, 6)
            elif k == 3:
                g("lime", 0.0).cylc(px, y + 0.6, 0, 0.2, 0.55, 10)
            else:
                g("amber", 0.0).ball(px, y + 0.6, 0, 0.09, 6, 4).ball(px + 0.05, y + 0.8, 0.03, 0.07, 6, 4)
    g.at()


def void_cage(g, x, z, yaw=0.0, r=1.6, y=2.4, feed=0.0):
    """A floating sphere of exotic matter held in a magnetic cage: a ringed plinth, three posts to a top ring, a black
    sphere with a violet halo and two tilted containment rings; feed > 0: a power cable from the plinth along the floor to
    a socket that far behind (local -z)."""
    g.at(x, z, yaw)
    if feed:
        g("cable", 0.0).path([(0, 0.2, -r - 0.45), (0, 0.08, -r - 0.9), (0, 0.08, -feed + 0.3), (0, 0.4, -feed + 0.12)], 0.09, 6)
        g("dark", 0.015).boxc(0, 0.45, -feed + 0.1, 0.45, 0.5, 0.2)
    g("dark").lath([(r + 0.5, 0), (r + 0.5, 0.4), (r + 0.1, 0.8), (r - 0.2, 0.8)], segs=24)
    g("vio", 0.0).tor(r + 0.3, 0.06, (0, 0.62, 0), n=28, rs=4)
    for i in range(3):
        a = TAU * i / 3
        g("steel").bm((math.sin(a) * (r + 0.1), 0.8, math.cos(a) * (r + 0.1)), (math.sin(a) * (r + 0.1), y + r + 0.6, math.cos(a) * (r + 0.1)), 0.09, 6)
    g("dark").tor(r + 0.1, 0.14, (0, y + r + 0.6, 0), n=28)
    g("void", 0.0).ball(0, y, 0, r * 0.45, 16, 10)
    g("vio", 0.0).tor(r * 0.62, 0.05, (0, y, 0), (0.5, 0, 0.2), n=32, rs=4)
    g("cyan", 0.0).tor(r * 0.75, 0.04, (0, y, 0), (-0.3, 0.8, -0.6), n=32, rs=4)
    g("halo", 0.0).ball(0, y, 0, r * 0.58, 14, 9)
    g.light((0, y, 0), (0.75, 0.45, 1.0), 260, 0.3)
    g.at()


def holotable(g, x, z, yaw=0.0, r=2.4, shape="round", show="moon"):
    """A holotable: a pedestal and a lit top (round or long), a cone of projected light and the hologram over it (the Moon
    with an orbit and a pin, or a chimera's double helix)."""
    g.at(x, z, yaw)
    if shape == "round":
        g("dark").lath([(r * 0.5, 0), (r * 0.45, 0.2), (r * 0.3, 0.6), (r * 0.3, 0.8), (r, 0.95), (r, 1.1), (r * 0.9, 1.15)], segs=32)
        g("cyan", 0.0).tor(r * 0.95, 0.05, (0, 1.13, 0), n=40, rs=4)
        g("holo", 0.0).cylc(0, 1.16, 0, r * 0.85, 0.02, 32)
        g("beam", 0.0).cylc(0, 1.9, 0, r * 0.85, 1.5, 24, rt=r * 0.55)
    else:
        g("dark").boxc(0, 0.45, 0, r * 2 - 0.6, 0.9, 1.2)
        g("dark").boxc(0, 0.98, 0, r * 2, 0.16, 2.2)
        g("cyan", 0.0).boxc(0, 1.065, 0, r * 2 - 0.2, 0.02, 1.9)
        g("beam", 0.0).boxc(0, 1.8, 0, r * 2 - 0.4, 1.4, 1.6)
    hy = 2.9
    if show == "moon":
        g("holo", 0.0).ball(0, hy, 0, 0.9, 16, 10)
        g("cyan", 0.0).tor(1.5, 0.025, (0, hy, 0), (0.4, 0, 0.2), n=40, rs=3)
        g("lime", 0.0).ball(0.55, hy + 0.65, 0.35, 0.09, 6, 4)
        g("pink", 0.0).ball(1.3, hy + 0.55, 0.35, 0.12, 6, 4)
        for k in range(6):                                                  # latitude lines
            b = -PI / 2 + PI * (k + 1) / 7
            g("cyan", 0.0).tor(0.92 * math.cos(b), 0.012, (0, hy + 0.92 * math.sin(b), 0), n=24, rs=3)
    else:
        for k in range(26):
            t = k / 25
            yy = hy - 0.9 + t * 2.0
            for s in (0, PI):
                a = t * 3 * TAU + s
                g("lime" if s == 0 else "pink", 0.0).ball(math.sin(a) * 0.45, yy, math.cos(a) * 0.45, 0.07, 6, 4)
            if k % 2 == 0:
                a = t * 3 * TAU
                g("cyan", 0.0).bm((math.sin(a) * 0.45, yy, math.cos(a) * 0.45), (-math.sin(a) * 0.45, yy, -math.cos(a) * 0.45), 0.015, 3)
    g.light((0, hy, 0), (0.3, 0.8, 1.0), 220, 0.4)
    g.at()


def projection(g, x, y, z, yaw, w, h, kind=0, color="holo", mount=0.0):
    """A holographic wall projection, w x h, centred at (x, y, z) facing yaw: a thin lit frame, a translucent panel and
    drawn content (bars and a curve, a helix, or a grid with blips); mount > 0: the wall is that far behind, and an emitter
    bar on two brackets along the top throws the picture down onto the panel."""
    g.at(x, z, yaw, y)
    g(color, 0.0).boxc(0, 0, 0, w, h, 0.02)
    if mount:
        for sx in (-1, 1):
            g("steel", 0.02).boxc(sx * w * 0.35, h / 2 + 0.25, -mount / 2 + 0.05, 0.12, 0.12, mount + 0.1)
            g("steel", 0.02).boxc(sx * w * 0.35, -h / 2 - 0.1, -mount / 2, 0.1, 0.1, mount)
        g("dark", 0.02).boxc(0, h / 2 + 0.25, 0.1, w * 0.8, 0.22, 0.3)
        g("cyan", 0.0).boxc(0, h / 2 + 0.135, 0.12, w * 0.75, 0.02, 0.2)
    for sy in (-1, 1):
        g("cyan", 0.0).boxc(0, sy * h / 2, 0.02, w + 0.1, 0.06, 0.03)
    for sx in (-1, 1):
        g("cyan", 0.0).boxc(sx * w / 2, 0, 0.02, 0.06, h, 0.03)
    if kind == 0:
        n = 9
        for i in range(n):
            bh = h * (0.15 + 0.6 * abs(math.sin(i * 1.7 + 0.4)))
            g("lime", 0.0).boxc(-w / 2 + w * 0.08 + i * w * 0.06, -h / 2 + 0.2 + bh / 2, 0.03, w * 0.035, bh, 0.02)
        pts = [(w * 0.05 + t * w * 0.4, math.sin(t * 9) * h * 0.25, 0.04) for t in [i / 16 for i in range(17)]]
        g("pink", 0.0).path(pts, 0.03, 3)
    elif kind == 1:
        for k in range(30):
            t = k / 29
            for s in (0, PI):
                a = t * 4 * TAU + s
                g("lime" if s == 0 else "pink", 0.0).ball(-w * 0.4 + t * w * 0.8, math.sin(a) * h * 0.28, 0.04, 0.06, 6, 4)
    else:
        for i in range(1, 6):
            g("cyan", 0.0).boxc(-w / 2 + w * i / 6, 0, 0.03, 0.02, h * 0.9, 0.01)
            g("cyan", 0.0).boxc(0, -h / 2 + h * i / 6, 0.03, w * 0.95, 0.02, 0.01)
        for k in range(5):
            g(("pink", "lime", "amber")[k % 3], 0.0).ball(math.sin(k * 2.3) * w * 0.35, math.cos(k * 1.7) * h * 0.3, 0.05, 0.1, 6, 4)
    g.at()


def splice_pod(g, x, z, yaw):
    """The splice pod: a stepped base, a tall glass capsule with a lit ring, a crown, hoses and a gantry of nozzles over
    it, a control lectern in front."""
    g.at(x, z, yaw)
    g("dark").lath([(2.4, 0), (2.4, 0.4), (2.1, 0.4), (2.1, 0.8), (1.8, 0.8)], segs=24)
    g("lime", 0.0).tor(2.0, 0.06, (0, 0.82, 0), n=28, rs=4)
    g("glassg", 0.0).cylc(0, 3.0, 0, 1.7, 4.4, 24)
    g("dark").lath([(1.95, 5.2), (1.95, 5.6), (1.2, 6.2), (0.5, 6.5)], segs=24)
    for i in range(4):
        a = TAU * i / 4 + PI / 4
        g("steel").bm((math.sin(a) * 1.8, 0.8, math.cos(a) * 1.8), (math.sin(a) * 1.8, 5.2, math.cos(a) * 1.8), 0.07, 6)
        g("cable", 0.0).path([(math.sin(a) * 1.2, 6.2, math.cos(a) * 1.2), (math.sin(a) * 2.6, 6.8, math.cos(a) * 2.6), (math.sin(a) * 3.0, 0.3, math.cos(a) * 3.0)], 0.1, 6)
        g("dark", 0.015).boxc(math.sin(a) * 3.0, 0.15, math.cos(a) * 3.0, 0.45, 0.3, 0.45, (0, a, 0))
    g("lime", 0.0).cylc(0, 3.0, 0, 0.12, 4.4, 8)
    g("panel").boxc(0, 0.55, 3.1, 1.2, 1.1, 0.7)
    g("dark").boxc(0, 1.15, 3.2, 1.3, 0.12, 0.9, (0.35, 0, 0))
    g("lime", 0.0).boxc(0, 1.2, 3.22, 0.9, 0.02, 0.55, (0.35, 0, 0))
    g.light((0, 3, 0), (0.5, 1.0, 0.25), 220, 0.4)
    g.at()


def lab_terminal_wall(g, x, z, yaw, sid="lab"):
    """LABNET, the lab terminal, mounted on a wall (its face at the local origin's z = 0, the unit standing out toward +z):
    a framed main screen (the picture the player gets close to), two side screens angled in, a keyboard shelf on brackets,
    status lamps, a conduit up the wall into the cable tray, a lit strip and a painted stand-here mark on the floor."""
    g.at(x, z, yaw)
    g("dark", 0.04).boxc(0, 2.35, 0.12, 3.3, 2.1, 0.24)
    g("wall2", 0.03).boxc(0, 2.35, 0.26, 3.1, 1.9, 0.06)
    g.screen(sid, 0, 2.35, 0.30, 2.8, 1.6)
    g("lime", 0.0).boxc(0, 3.44, 0.2, 3.1, 0.08, 0.1)
    for k in (-1, 1):
        g("dark", 0.03).boxc(k * 2.3, 2.3, 0.35, 1.2, 0.9, 0.12, (0, -k * 0.45, 0))
        g(("pink" if k < 0 else "cyan"), 0.0).boxc(k * 2.3 - k * 0.03, 2.3, 0.42, 1.0, 0.7, 0.01, (0, -k * 0.45, 0))
        g("steel", 0.0).boxc(k * 1.85, 2.3, 0.15, 0.12, 0.12, 0.3)
    g("dark", 0.03).boxc(0, 1.1, 0.35, 2.4, 0.08, 0.6)
    for k in (-1, 1):
        g("steel", 0.02).bm((k * 1.0, 0.75, 0.02), (k * 1.0, 1.06, 0.55), 0.04, 5)
    for i in range(14):
        g("white", 0.0).boxc(-0.6 + (i % 7) * 0.2, 1.155, 0.25 + (i // 7) * 0.18, 0.15, 0.02, 0.13)
    for i in range(4):
        g(("lime", "lime", "amber", "red")[i], 0.0).ball(1.35 - i * 0.16, 1.2, 0.5, 0.035, 6, 4)
    g("steel", 0.0).cylc(1.45, 4.75, 0.08, 0.1, 2.7, 8)                     # conduit up into the cable tray
    g("hazard", 0.0).boxc(0, 0.01, 1.3, 1.6, 0.02, 1.0)
    g("dark", 0.0).boxc(0, 0.02, 1.3, 1.4, 0.02, 0.8)
    g.light((0, 2.4, 1.4), (0.4, 1.0, 0.6), 110, 0.3)
    g.at()


def pen_terminal(g, x, z, yaw, sid="pen"):
    """The holding-pen terminal, indoors now: a desk console with a sloped keypad, a screen (the residents list) and a
    card slot, a lamp over it."""
    g.at(x, z, yaw)
    g("dark").boxc(0, 0.6, -0.2, 1.8, 1.2, 0.8)
    g("cyan").boxc(0, 1.25, 0.15, 1.8, 0.16, 0.7, (0.35, 0, 0))
    for i in range(6):
        g(("lime", "cyan", "amber")[i % 3], 0.0).boxc(-0.5 + (i % 3) * 0.5, 1.35, 0.1 + (i // 3) * 0.22, 0.18, 0.03, 0.14, (0.35, 0, 0))
    g("dark").boxc(0, 1.95, -0.45, 1.7, 1.1, 0.12)
    g.screen(sid, 0, 1.95, -0.385, 1.5, 0.9)
    g("lime", 0.0).boxc(0, 2.55, -0.45, 1.75, 0.08, 0.14)
    g("red", 0.0).boxc(0.92, 1.3, -0.2, 0.04, 0.2, 0.15)
    g.at()


def security_post(g, x, z, yaw, door_y, door_r, sid="sec", scr=(2.2, 1.5), scr_x=-4.6, scr_y=3.4, cam_x=4.7):
    """The airlock's security interface at a door face (x, z), facing yaw: a round wall mount up and to one side, clear of
    the door's frame (door_y its centre, door_r the frame's outer radius), a two-link arm off the mount's hub reaching out
    over the stand plate, the camera with its red lens, a lit scan cone down to the plate (two lit footprints), and the
    screen beside the door that shows the picture (`screen_<sid>`). Returns the plate's centre."""
    g.at(x, z, yaw)
    px, pz = 0.0, 3.6
    g("hazard", 0.0).cylc(px, 0.03, pz, 1.25, 0.06, 8)
    g("dark", 0.0).cylc(px, 0.035, pz, 1.05, 0.06, 8)
    for k in (-1, 1):
        g("lime", 0.0).rb(px + k * 0.2, 0.07, pz + 0.05, 0.11, 0.01, 0.24, 0.5, nu=10, nv=4)
    my = door_y + door_r + 0.9                                              # the mount: above the frame's top, off to the side
    g("dark", 0.03).cylc(cam_x, my, 0.12, 0.65, 0.24, 20, "z")
    g("steel", 0.02).cylc(cam_x, my, 0.3, 0.38, 0.14, 16, "z")
    for i in range(6):
        a = TAU * i / 6
        g("steel", 0.0).cylc(cam_x + math.sin(a) * 0.52, my + math.cos(a) * 0.52, 0.25, 0.05, 0.03, 6, "z")
    hub = Vector((cam_x, my, 0.42))
    j2 = Vector((cam_x * 0.62, my + 0.35, 1.55))
    cam = Vector((cam_x * 0.22, my - 0.15, 2.45))
    g("armdark").ball(*hub, 0.22, 10, 7)
    g("arm").path([tuple(hub), tuple(j2)], 0.1, 8).path([tuple(j2), tuple(cam)], 0.08, 8)
    g("armdark").ball(*j2, 0.17, 10, 7)
    g("cable", 0.0).path([tuple(hub + Vector((0, -0.1, 0))), tuple((hub + j2) / 2 + Vector((0, -0.2, 0))), tuple(j2 + Vector((0, -0.12, 0)))], 0.03, 4)
    g("white").rb(cam.x, cam.y, cam.z, 0.22, 0.2, 0.36, 0.4, rot=(-0.9, 0, 0))
    lens = Vector((cam.x, cam.y - 0.25, cam.z + 0.22))
    g("dark").cylc(lens.x, lens.y, lens.z, 0.13, 0.16, 12, rot=(PI - 0.9, 0, 0))
    g("red", 0.0).ball(lens.x, lens.y - 0.07, lens.z + 0.06, 0.08, 8, 6)
    top, foot = lens + Vector((0, -0.08, 0.04)), Vector((px, 0.06, pz))
    g("scan", 0.0).add(cylinder(0.08, 1.0, (top - foot).length, 16, True)[:2], tuple((top + foot) / 2), tuple(Vector((0, 1, 0)).rotation_difference(top - foot).to_euler()))
    w, h = scr
    g("dark", 0.04).boxc(scr_x, scr_y, 0.06, w + 0.3, h + 0.3, 0.12)
    g.screen(sid, scr_x, scr_y, 0.14, w, h)
    g("lime", 0.0).boxc(scr_x, scr_y - h / 2 - 0.3, 0.08, w * 0.7, 0.12, 0.08)
    at = g.pt((px, 0, pz))
    g.at()
    return at


# =====================================================================================================================
# the ranch's kit
# =====================================================================================================================

def fence_run(g, pts, h=1.5, rails=3, step=3.2, post="wood2", rail="wood", lamps=False):
    """A post-and-rail ranch fence along pts [(x, z)] (open polyline): a post every `step` or less, `rails` rails."""
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, bz - az)
        n = max(1, math.ceil(L / step))
        for i in range(n + 1):
            x, z = ax + (bx - ax) * i / n, az + (bz - az) * i / n
            g(post).cylc(x, h / 2 + 0.05, z, 0.11, h + 0.1, 6)
        for r in range(rails):
            y = h * (0.35 + 0.6 * r / max(1, rails - 1))
            g(rail).bm((ax, y, az), (bx, y, bz), 0.06, 5)
    if lamps:
        for (x, z) in pts:
            g("dark").cylc(x, h + 0.25, z, 0.08, 0.4, 6)
            g("lamp", 0.0).ball(x, h + 0.55, z, 0.14, 8, 6)


def fence_ring(g, cx, cz, r, h=1.6, gap=None, step=3.0, lamps=0):
    """A round post-and-rail corral of radius r; gap = (angle, width) leaves an opening (a gate)."""
    n = max(8, int(TAU * r / step))
    for i in range(n):
        a0, a1 = TAU * i / n, TAU * (i + 1) / n
        if gap and abs(((a0 + a1) / 2 - gap[0] + PI) % TAU - PI) < gap[1] / (2 * r):
            continue
        p0 = (cx + math.sin(a0) * r, cz + math.cos(a0) * r)
        p1 = (cx + math.sin(a1) * r, cz + math.cos(a1) * r)
        fence_run(g, [p0, p1], h, 3, step=10)
        if lamps and i % max(1, n // lamps) == 0:
            g("dark").cylc(p0[0], h + 1.6, p0[1], 0.07, 3.2, 6)
            g("lamp", 0.0).ball(p0[0], h + 3.3, p0[1], 0.2, 8, 6)


def bale(g, x, z, yaw=0.0, y=0.0, round_=False):
    """a moss bale: square (1.4 x 0.8 x 0.9) or round (1.4 across), with its binding"""
    g.at(x, z, yaw, y)
    if round_:
        g("moss").cylc(0, 0.7, 0, 0.7, 1.2, 14, "x")
        g("moss2", 0.0).cylc(0, 0.7, 0, 0.705, 0.08, 14, "x")
    else:
        g("moss").boxc(0, 0.45, 0, 1.4, 0.9, 0.9)
        for k in (-0.35, 0.35):
            g("moss2", 0.0).boxc(k, 0.45, 0, 0.06, 0.905, 0.905)
    g.at()


def silo(g, x, z, r=3.0, h=14.0, chute_to=None):
    """A feed silo: a ribbed drum on a ring footing, a dome cap with a hatch, a caged ladder, a lit band; an auger chute
    from its foot to chute_to (x, y, z) when given."""
    g.at(x, z)
    g("panel").cylc(0, 0.3, 0, r + 0.4, 0.6, 20)
    g("corr").cylc(0, 0.6 + h / 2, 0, r, h, 24)
    for k in range(1, 6):
        g("steel").tor(r + 0.04, 0.07, (0, 0.6 + h * k / 6, 0), n=32, rs=4)
    g("barn").add(sphere(r + 0.15, 24, 8, PI / 2)[:2], (0, 0.6 + h, 0), s=(1, 0.55, 1))
    g("steel").cylc(0, 0.6 + h + (r + 0.15) * 0.55 + 0.25, 0, 0.5, 0.5, 10)
    g("lime", 0.0).tor(r + 0.06, 0.08, (0, 0.6 + h - 0.6, 0), n=32, rs=4)
    for k in (-1, 1):
        g("steel").bm((k * 0.3, 0.6, r + 0.25), (k * 0.3, h + 1.2, r + 0.25), 0.04, 4)
    for i in range(int(h / 0.4)):
        g("steel").bm((-0.3, 0.8 + i * 0.4, r + 0.25), (0.3, 0.8 + i * 0.4, r + 0.25), 0.025, 4)
    g.at()
    if chute_to:
        g("hazard").path([(x, 2.0, z), ((x + chute_to[0]) / 2, chute_to[1] + 2.5, (z + chute_to[2]) / 2), chute_to], 0.32, 8)


def feed_bunk(g, x, z, yaw, L=14.0, roof=True):
    """The feed line: a long raised trough of glowing feed under a lean-to roof on posts, an auger tube over the trough
    with drop spouts, a lick block at each end, a CHOW board."""
    g.at(x, z, yaw)
    g("wood2").boxc(0, 0.45, 0, L, 0.9, 1.4)
    g("dark").boxc(0, 0.93, 0, L - 0.2, 0.06, 1.1)
    g("feed", 0.0).boxc(0, 0.97, 0, L - 0.4, 0.04, 1.0)
    for i in range(int(L / 0.7)):
        g("feed2", 0.0).ball(-L / 2 + 0.4 + i * 0.7, 1.0, ((i * 5) % 3 - 1) * 0.25, 0.14, 6, 4, s=(1, 0.5, 1))
    for k in range(int(L / 3) + 1):
        xx = -L / 2 + k * L / int(L / 3)
        g("wood2").bm((xx, 0.0, -0.9), (xx, 3.4, -0.9), 0.11, 6)
        g("wood2").bm((xx, 0.0, 1.4), (xx, 2.9, 1.4), 0.11, 6)
    if roof:
        g("corr").boxc(0, 3.2, 0.25, L + 1.2, 0.12, 3.4, (-0.15, 0, 0))
        g("barn", 0.0).boxc(0, 3.42, -1.43, L + 1.2, 0.3, 0.05, (-0.15, 0, 0))
    g("steel").cylc(0, 2.2, -0.3, 0.28, L, 12, "x")
    for k in range(int(L / 2.5)):
        xx = -L / 2 + 1.2 + k * 2.5
        g("steel").bm((xx, 2.0, -0.3), (xx, 1.35, 0.0), 0.12, 6)
        g("lime", 0.0).cylc(xx, 1.22, 0.0, 0.07, 0.25, 6)
    for k in (-1, 1):
        g("stone").boxc(k * (L / 2 + 0.8), 0.5, 0.6, 0.6, 1.0, 0.6)
        g("cyan", 0.0).boxc(k * (L / 2 + 0.8), 1.15, 0.6, 0.45, 0.3, 0.45)
    g("dark").boxc(0, 3.0, 1.55, 3.2, 0.9, 0.08)
    g.text("CHOW", (0, 2.75, 1.62), 0, 0.7, "amber")
    g.at()


def stock_tank(g, x, z, r=2.2):
    """a round stock-water tank (corrugated wall, a float valve)"""
    g.at(x, z)
    g("corr").cylc(0, 0.5, 0, r, 1.0, 24)
    g("steel").tor(r, 0.06, (0, 1.0, 0), n=32, rs=4)
    g("water", 0.0).cylc(0, 0.92, 0, r - 0.06, 0.04, 24)
    g("steel").cylc(r * 0.6, 1.05, 0, 0.12, 0.2, 8)
    g.at()


def wind_pump(g, x, z, h=9.0, yaw=0.0):
    """A ranch wind pump (on the Moon a sun mill: the blades are solar vanes turning the pump) on a lattice tower"""
    g.at(x, z, yaw)
    b = 1.8
    corners = [(-b, -b), (b, -b), (b, b), (-b, b)]
    top = 0.35
    for cx, cz in corners:
        g("steel").bm((cx, 0, cz), (cx * top / b, h, cz * top / b), 0.07, 5)
    for k in range(4):
        y0, y1 = h * k / 4, h * (k + 1) / 4
        f0, f1 = 1 - (1 - top / b) * k / 4, 1 - (1 - top / b) * (k + 1) / 4
        for i in range(4):
            (ax, az), (bx, bz) = corners[i], corners[(i + 1) % 4]
            g("steel").bm((ax * f0, y0, az * f0), (bx * f1, y1, bz * f1), 0.035, 4)
            g("steel").bm((ax * f1, y1, az * f1), (bx * f1, y1, bz * f1), 0.035, 4)
    g("dark").boxc(0, h + 0.4, 0, 0.5, 0.6, 1.2)
    g("steel").bm((0, h + 0.4, -0.6), (0, h + 0.4, -3.2), 0.06, 5)
    g("barn").boxc(0, h + 0.6, -3.4, 0.05, 1.4, 1.6)
    g("dark").cylc(0, h + 0.4, 0.75, 0.25, 0.3, 10, "z")
    for i in range(14):
        a = TAU * i / 14
        g("solar", 0.0).boxc(math.sin(a) * 1.25, h + 0.4 + math.cos(a) * 1.25, 0.85, 0.45, 1.5, 0.04, (0, 0.25, -a))
    g("steel").tor(1.9, 0.04, (0, h + 0.4, 0.85), (PI / 2, 0, 0), n=28, rs=4)
    g("steel").bm((0, 0.3, 0), (0, h, 0), 0.05, 5)
    g.at()


def gate_arch(g, x, z, yaw, w=8.0, h=6.0, sign="ZBORNAK RANCH"):
    """the ranch gate: two log posts, a crossbeam with a hanging sign, a cattle-guard grid in the ground, swung-open gates"""
    g.at(x, z, yaw)
    for k in (-1, 1):
        g("wood2").cylc(k * w / 2, h / 2, 0, 0.32, h, 10)
        g("dark").cylc(k * w / 2, h + 0.12, 0, 0.36, 0.25, 10)
        g("lamp", 0.0).ball(k * w / 2, h + 0.5, 0, 0.25, 8, 6)
    g("wood").cylc(0, h - 0.5, 0, 0.26, w + 1.4, 10, "x")
    g("dark").boxc(0, h - 1.75, 0, w * 0.75, 1.3, 0.14)
    for k in (-1, 1):
        g("steel").bm((k * w * 0.3, h - 0.75, 0), (k * w * 0.3, h - 1.1, 0), 0.03, 4)
    g.text(sign, (0, h - 1.95, 0.09), 0, 0.62, "amber")
    g.text(sign, (0, h - 1.95, -0.09), PI, 0.62, "amber")
    for i in range(9):
        g("dark").boxc(0, 0.02, -1.2 + i * 0.3, w - 0.6, 0.06, 0.12)
    for k in (-1, 1):                                                       # the gates, swung in (-z)
        hx = k * w / 2
        g("wood").bm((hx, 0.5, 0), (hx, 0.5, -3.6), 0.07, 5).bm((hx, 1.3, 0), (hx, 1.3, -3.6), 0.07, 5).bm((hx, 0.5, 0), (hx, 1.3, -3.6), 0.05, 4)
    g.at()


def lamp_post(g, x, z, h=5.0, color="lamp"):
    g("dark").cylc(x, h / 2, z, 0.1, h, 8, rt=0.07)
    g("dark").cylc(x, 0.15, z, 0.3, 0.3, 8)
    g("dark").boxc(x, h + 0.05, z, 0.6, 0.1, 0.6)
    g(color, 0.0).boxc(x, h - 0.12, z, 0.45, 0.2, 0.45)


def path_ribbon(g, pts, w=3.0, step=1.0, lights=6.0, light="lime"):
    """A paved walk along a smooth curve through pts [(x, z)] (Catmull-Rom), one continuous ribbon 6 cm thick with a raised
    kerb along each edge and flush lit studs set into the kerb tops every `lights` metres. Start and end it on the edges of
    the platforms it joins."""
    P = [Vector((p[0], 0, p[1])) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    samples = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int((p2 - p1).length / step))
        for k in range(n):
            t = k / n
            samples.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    samples.append(P[-2])

    def strip(off0, off1, y0, y1, slot, ink):
        verts, faces = [], []
        for i, p in enumerate(samples):
            d = (samples[min(i + 1, len(samples) - 1)] - samples[max(i - 1, 0)]).normalized()
            nrm = Vector((d.z, 0, -d.x))
            for off, y in ((off0, y0), (off1, y0), (off1, y1), (off0, y1)):
                q = p + nrm * off
                verts.append((q.x, y, q.z))
        for i in range(len(samples) - 1):
            a, b = i * 4, (i + 1) * 4
            for j in range(4):
                j2 = (j + 1) % 4
                faces.append((a + j, a + j2, b + j2, b + j))
        faces.append((0, 1, 2, 3))
        e = (len(samples) - 1) * 4
        faces.append((e + 3, e + 2, e + 1, e))
        g(slot, ink).add((verts, faces))
    strip(-w / 2, w / 2, 0.0, 0.06, "path", 0.0)
    for s in (-1, 1):
        strip(s * w / 2, s * (w / 2 + 0.3), 0.0, 0.14, "panel", 0.02)
    acc, nxt = 0.0, lights / 2
    for i in range(1, len(samples)):
        acc += (samples[i] - samples[i - 1]).length
        if acc >= nxt:
            nxt += lights
            p = samples[i]
            d = (samples[min(i + 1, len(samples) - 1)] - samples[i - 1]).normalized()
            nrm = Vector((d.z, 0, -d.x))
            for s in (-1, 1):
                q = p + nrm * s * (w / 2 + 0.15)
                g(light, 0.0).cylc(q.x, 0.142, q.z, 0.08, 0.008, 10)


# =====================================================================================================================
# the plateau's outworks
# =====================================================================================================================

def radiator_field(g, x, z, yaw, rows=2, cols=5, header_to=None):
    """the reactor's heat dump: rows of tall radiator panels (white fins with lit coolant lines) on A-frames, a coolant
    header along each row and a buried-pipe run to header_to (x, z) in g's frame"""
    g.at(x, z, yaw)
    for r in range(rows):
        zz = (r - (rows - 1) / 2) * 9.0
        for c in range(cols):
            xx = (c - (cols - 1) / 2) * 6.5
            for k in (-1, 1):
                g("steel").bm((xx + k * 2.6, 0, zz - 1.6), (xx + k * 2.6, 7.2, zz), 0.1, 5).bm((xx + k * 2.6, 0, zz + 1.6), (xx + k * 2.6, 7.2, zz), 0.1, 5)
            g("white", 0.04).boxc(xx, 4.2, zz, 5.6, 6.0, 0.2)
            for i in range(5):
                g("cyan", 0.0).boxc(xx - 2.2 + i * 1.1, 4.2, zz + 0.11, 0.12, 5.4, 0.02).boxc(xx - 2.2 + i * 1.1, 4.2, zz - 0.11, 0.12, 5.4, 0.02)
            g("dark", 0.02).boxc(xx, 7.35, zz, 5.8, 0.3, 0.4)
        g("steel", 0.03).cylc(0, 0.6, zz, 0.35, cols * 6.5, 10, "x")
        g("hazard", 0.0).cylc(-cols * 3.25 - 0.2, 0.6, zz, 0.38, 0.3, 10, "x")
    g("steel", 0.03).cylc(-cols * 3.25 - 0.6, 0.6, 0, 0.4, rows * 9.0, 10, "z")
    g.at()
    if header_to:
        sx, sz = x + math.cos(yaw) * (-cols * 3.25 - 0.6), z - math.sin(yaw) * (-cols * 3.25 - 0.6)
        g("steel", 0.03).path([(sx, 0.6, sz), ((sx + header_to[0]) / 2, 0.6, (sz + header_to[1]) / 2), (header_to[0], 0.6, header_to[1])], 0.45, 10)
        for t in (0.25, 0.5, 0.75):
            g("dark", 0.02).boxc(sx + (header_to[0] - sx) * t, 0.3, sz + (header_to[1] - sz) * t, 1.2, 0.6, 1.2)


def landing_pad(g, x, z, r=12.0, label="Z"):
    """a supply pad: an octagonal deck on a low plinth, a painted ring and letter, edge lights, a fuel tank on skids, a
    windsock (the containers beside it are zb_container's)"""
    g.at(x, z)
    g("panel", 0.05).cylc(0, 0.25, 0, r + 0.6, 0.5, 8, rt=r + 0.3)
    g("path", 0.0).cylc(0, 0.52, 0, r, 0.04, 8)
    g("hazard", 0.0).tor(r * 0.62, 0.22, (0, 0.55, 0), n=40, rs=4, s=(1, 0.2, 1))
    for i in range(16):
        a = TAU * i / 16
        g("lime" if i % 2 else "lamp", 0.0).boxc(math.sin(a) * (r - 0.2), 0.6, math.cos(a) * (r - 0.2), 0.35, 0.12, 0.35)
    g.text(label, (0, 0.55, 2.2), 0, 4.0, "hazard", 0.02)
    g("white", 0.04).cylc(r + 3.0, 1.3, 5.0, 1.0, 4.0, 14, "x")
    g("dark", 0.02).boxc(r + 3.0, 0.15, 5.0, 4.4, 0.3, 1.6)
    g("red", 0.0).tor(1.02, 0.06, (r + 3.0, 1.3, 5.0), (0, 0, PI / 2), n=16, rs=4)
    g("steel", 0.02).cylc(-r - 2.0, 3.0, -r * 0.5, 0.08, 6.0, 6)
    g("amber", 0.0).add(cylinder(0.12, 0.4, 1.6, 8, True)[:2], (-r - 2.0 + 0.8, 5.6, -r * 0.5), (0, 0, PI / 2 - 0.2))
    g.at()


def solar_array(g, x, z, yaw, rows=3, cols=4):
    """tilted solar tables on posts, a combiner box and a cable trench toward the lab"""
    g.at(x, z, yaw)
    for r in range(rows):
        for c in range(cols):
            xx, zz = (c - (cols - 1) / 2) * 7.0, (r - (rows - 1) / 2) * 7.5
            for k in (-1, 1):
                g("steel").bm((xx + k * 2.4, 0, zz + 0.8), (xx + k * 2.4, 2.0, zz + 0.8), 0.08, 5).bm((xx + k * 2.4, 0, zz - 1.2), (xx + k * 2.4, 1.0, zz - 1.2), 0.08, 5)
            g("solar", 0.02).boxc(xx, 1.55, zz - 0.2, 6.2, 0.08, 3.4, (0.35, 0, 0))
            for i in range(1, 6):
                g("steel", 0.0).boxc(xx - 3.1 + i * 1.03, 1.6, zz - 0.18, 0.03, 0.02, 3.3, (0.35, 0, 0))
    g("dark", 0.03).boxc(cols * 3.5 + 1.5, 0.9, 0, 1.0, 1.8, 1.4)
    g("lime", 0.0).boxc(cols * 3.5 + 1.0, 1.4, 0, 0.02, 0.3, 0.5)
    g.at()


def zb_container(g, x, z, yaw=0.0, stack=1, number=417, scale=1.0):
    """The standard storage container (the land-train's cargo box, tools/blender/cargo.py cargo_unit("box"), as stacked in
    Meridian's yard) in Zbornak Laboratories livery: violet body, the plate on each flank with a lime Z roundel, ZBORNAK over
    LABORATORIES, and the container number above it. `stack` boxes high at the yard's pitch. Needs decals.py and cargo.py
    exec'd (build_zbornak_lab.py does); the factions' liveries are left off."""
    from mathutils import Matrix
    gl = globals()
    keep = gl["FACTIONS"]
    gl["FACTIONS"] = ()
    p = g.pt((x, 0, z))
    pitch = 3.17 * scale
    for j in range(stack):
        before = set(C.objects)
        name = uname(f"zbbox{number}")
        R = cargo_unit("box", name, g.root, (p[0], j * pitch, p[2]), scale=scale)
        R.rotation_euler[2] = yaw + g.cur[3] + (0.04 * j if j else 0)
        code = f"ZBL {number:06d} {j + 2}"
        made = set(C.objects)
        for side in (-1, 1):
            d = side_dec(side, 1.68, CARGO_PLATE_Y, 0.0)
            d.rect(-1.7, -0.56, 1.7, 0.56, "stripe", 0)
            d.rect(-1.66, -0.52, 1.66, 0.52, "dark", 1)
            d.disc(-1.2, 0.0, 0.38, "stripe", 2)
            d.disc(-1.2, 0.0, 0.32, "dark", 3)
            d.bar(-1.37, 0.16, -1.03, 0.16, 0.08, "stripe", 4)
            d.bar(-1.03, 0.16, -1.37, -0.16, 0.08, "stripe", 4)
            d.bar(-1.37, -0.16, -1.03, -0.16, 0.08, "stripe", 4)
            d.text("ZBORNAK", -0.7, 0.04, 0.05, "stripe", 2)
            d.text("LABORATORIES", -0.7, -0.38, 0.034, "white", 2)
            d.build(f"{name}_plate{'P' if side > 0 else 'S'}", R)
            d2 = side_dec(side, 1.6, CARGO_NUM_Y, 0.0)
            d2.text(code, -text_width(code, CARGO_NUM_PS) / 2, 0, CARGO_NUM_PS, "label", 0)
            d2.build(f"{name}_id{'P' if side > 0 else 'S'}", R)
        T = Matrix.Scale(scale, 4) @ Matrix.Translation((0, 0, -CARGO_BASE))
        for o in C.objects:
            if o not in made and o.type == "MESH":
                o.data.transform(T)
    gl["FACTIONS"] = keep


# =====================================================================================================================
# the lab's equipment corner (right of the door): benches, the magnet array, the chargers, the drone wall and its console
# =====================================================================================================================
LIQUIDS = ("lime", "pink", "cyan", "amber", "vio", "teal")


def bench(g, L, depth=0.9, h=0.95):
    """a lab bench against a wall (its back on local z = 0, the front toward +z): white cabinets with dark doors, a black
    top, a kick plate, a backsplash"""
    g("white", 0.03).boxc(0, (h - 0.05) / 2 + 0.05, depth / 2, L, h - 0.05, depth - 0.05)
    g("dark", 0.0).boxc(0, 0.05, depth / 2 + 0.02, L - 0.1, 0.1, depth - 0.12)
    n = max(1, int(L / 0.9))
    for i in range(n):
        x = -L / 2 + (i + 0.5) * L / n
        g("panel", 0.0).boxc(x, h * 0.5, depth - 0.02, L / n - 0.08, h - 0.3, 0.02)
        g("steel", 0.0).boxc(x, h - 0.2, depth + 0.0, 0.25, 0.03, 0.03)
    g("dark", 0.02).boxc(0, h + 0.03, depth / 2, L + 0.06, 0.06, depth + 0.04)
    g("white", 0.02).boxc(0, h + 0.36, 0.04, L, 0.6, 0.06)


def flask(g, x, y, z, kind, c, s=1.0):
    """glassware standing at (x, y, z): round-bottom (0), conical (1), beaker (2), graduated cylinder (3); coloured liquid in it"""
    if kind == 0:
        g("glass", 0.0).ball(x, y + 0.13 * s, z, 0.13 * s, 12, 8).cylc(x, y + 0.31 * s, z, 0.035 * s, 0.16 * s, 8)
        g(c, 0.0).ball(x, y + 0.1 * s, z, 0.1 * s, 10, 6, s=(1, 0.7, 1))
    elif kind == 1:
        g("glass", 0.0).cylc(x, y + 0.12 * s, z, 0.13 * s, 0.24 * s, 12, rt=0.04 * s).cylc(x, y + 0.29 * s, z, 0.035 * s, 0.1 * s, 8)
        g(c, 0.0).cylc(x, y + 0.05 * s, z, 0.12 * s, 0.1 * s, 12, rt=0.085 * s)
    elif kind == 2:
        g("glass", 0.0).cylc(x, y + 0.1 * s, z, 0.08 * s, 0.2 * s, 12)
        g(c, 0.0).cylc(x, y + 0.06 * s, z, 0.075 * s, 0.12 * s, 12)
    else:
        g("glass", 0.0).cylc(x, y + 0.17 * s, z, 0.035 * s, 0.34 * s, 8).cylc(x, y + 0.01, z, 0.06 * s, 0.02, 8)
        g(c, 0.0).cylc(x, y + 0.11 * s, z, 0.03 * s, 0.2 * s, 8)


def chem_bench(g, x, z, yaw, L=3.8, kind=0, seed=0):
    """A chemistry bench against the wall at (x, z) facing yaw. kind 0: a distillation rig (retort stand, a flask over a
    burner's blue flame, a condenser coil down to a collecting beaker), a flask rack (round flasks upside down on pegs), an
    extraction hood over it with its duct up to the tray; kind 1: test-tube racks, a reagent shelf of bottles, a burner, a
    sink with a swan-neck tap. Glassware everywhere, liquids glowing."""
    g.at(x, z, yaw)
    bench(g, L)
    top = 1.01
    if kind == 0:
        # retort stand, clamp, flask over a burner, the condenser coil, the collecting beaker
        g("dark", 0.02).boxc(-1.1, top + 0.02, 0.45, 0.4, 0.04, 0.3)
        g("steel", 0.0).cylc(-1.25, top + 0.55, 0.45, 0.02, 1.1, 6)
        g("steel", 0.0).bm((-1.25, top + 0.62, 0.45), (-1.0, top + 0.62, 0.45), 0.015, 4)
        g("steel", 0.0).tor(0.09, 0.012, (-1.0, top + 0.3, 0.45), n=12, rs=3)
        flask(g, -1.0, top + 0.27, 0.45, 0, "pink", 1.3)
        g("dark", 0.02).cylc(-1.0, top + 0.07, 0.45, 0.06, 0.14, 8)
        g("cyan", 0.0).cylc(-1.0, top + 0.2, 0.45, 0.01, 0.1, 6, rt=0.045)                # the burner's blue flame
        coil = [(-1.0 + 0.05 * k, top + 0.75 - 0.04 * k + 0.05 * math.sin(k * 1.2), 0.45 + 0.07 * math.cos(k * 1.2)) for k in range(14)]
        g("glass", 0.0).path([(-1.0, top + 0.68, 0.45)] + coil + [(-0.3, top + 0.2, 0.45)], 0.025, 5)
        g("pink", 0.0).path(coil[6:], 0.012, 4)
        flask(g, -0.3, top, 0.45, 2, "pink", 1.0)
        # a flask rack: a pegboard on legs, round flasks upside down on its pegs
        g("white", 0.02).boxc(0.55, top + 0.45, 0.2, 0.9, 0.7, 0.05)
        for i in range(3):
            for j in range(2):
                px, py = 0.25 + i * 0.3, top + 0.3 + j * 0.3
                g("steel", 0.0).bm((px, py, 0.22), (px, py + 0.04, 0.32), 0.012, 4)
                g("glass", 0.0).ball(px, py + 0.13, 0.36, 0.09, 10, 6)
        for i, kd in enumerate((1, 2, 3, 2)):
            flask(g, 1.25 + i * 0.16 - (0.4 if i > 1 else 0), top, 0.65 if i > 1 else 0.4, kd, LIQUIDS[(i + seed) % 6], 0.9)
        # the extraction hood over the rig, its duct up into the cable tray's run
        g("steel", 0.03).add(cylinder(0.3, 0.85, 0.5, 4)[:2], (-0.65, top + 1.75, 0.45), (0, PI / 4, 0), (1.3, 1, 0.8))
        g("steel", 0.02).cylc(-0.65, top + 3.1, 0.3, 0.22, 2.3, 10)
        g("lamp", 0.0).boxc(-0.65, top + 1.49, 0.45, 0.8, 0.03, 0.4)
    else:
        # test-tube racks
        for r_, rx in enumerate((-1.3, -0.65)):
            g("white", 0.02).boxc(rx, top + 0.1, 0.45, 0.55, 0.04, 0.2).boxc(rx, top + 0.22, 0.45, 0.55, 0.04, 0.2)
            for k in (-1, 1):
                g("white", 0.0).boxc(rx + k * 0.26, top + 0.12, 0.45, 0.03, 0.24, 0.2)
            for i in range(6):
                tx = rx - 0.22 + i * 0.088
                g("glass", 0.0).cylc(tx, top + 0.2, 0.45, 0.025, 0.36, 6)
                g(LIQUIDS[(i + r_ * 2 + seed) % 6], 0.0).cylc(tx, top + 0.12 + 0.02 * (i % 3), 0.45, 0.021, 0.12 + 0.04 * (i % 3), 6)
        # a burner with a beaker on a tripod
        g("dark", 0.02).cylc(0.1, top + 0.07, 0.5, 0.06, 0.14, 8)
        g("cyan", 0.0).cylc(0.1, top + 0.2, 0.5, 0.01, 0.1, 6, rt=0.045)
        for k in range(3):
            a = TAU * k / 3
            g("steel", 0.0).bm((0.1 + math.sin(a) * 0.14, top, 0.5 + math.cos(a) * 0.14), (0.1 + math.sin(a) * 0.1, top + 0.3, 0.5 + math.cos(a) * 0.1), 0.01, 4)
        g("steel", 0.0).tor(0.11, 0.01, (0.1, top + 0.3, 0.5), n=12, rs=3)
        flask(g, 0.1, top + 0.31, 0.5, 1, "lime", 1.0)
        # the sink and its swan-neck tap
        g("steel", 0.02).boxc(0.95, top + 0.01, 0.5, 0.75, 0.04, 0.55)
        g("dark", 0.0).boxc(0.95, top + 0.035, 0.5, 0.6, 0.01, 0.42)
        g("steel", 0.0).path([(0.95, top, 0.12), (0.95, top + 0.45, 0.12), (0.95, top + 0.5, 0.25), (0.95, top + 0.38, 0.32)], 0.025, 6)
        for i, kd in enumerate((2, 0, 3)):
            flask(g, 1.55 + (i % 2) * 0.15, top, 0.35 + i * 0.15, kd, LIQUIDS[(i + 3 + seed) % 6], 0.9)
    # a reagent shelf on the wall above the bench: brown and blue bottles, a hazard lip
    g("steel", 0.02).boxc(0, top + 1.1, 0.18, L - 0.2, 0.05, 0.3)
    g("hazard", 0.0).boxc(0, top + 1.1, 0.335, L - 0.2, 0.05, 0.01)
    for k in (-1, 1):
        g("steel", 0.0).bm((k * (L / 2 - 0.3), top + 1.08, 0.04), (k * (L / 2 - 0.3), top + 0.85, 0.04), 0.02, 4)
    for i in range(int(L / 0.22)):
        bx = -L / 2 + 0.25 + i * 0.22
        if kind == 0 and -1.15 < bx < -0.15:
            continue
        g(("copper", "dark", "steel")[i % 3], 0.008).cylc(bx, top + 1.24, 0.18, 0.06, 0.24, 8)
        g("white", 0.0).cylc(bx, top + 1.39, 0.18, 0.03, 0.06, 6)
    g.light((0, top + 1.6, 0.8), (0.9, 0.95, 1.0), 120, 0.3)
    g.at()


def microscope_bench(g, x, z, yaw, L=3.8):
    """a bench of microscopes against the wall: three microscopes (foot, arm, stage with a slide, tube, eyepieces, an
    objective turret), slide boxes, a stack of petri dishes, a monitor showing a magnified cell, a stool"""
    g.at(x, z, yaw)
    bench(g, L)
    top = 1.01
    for i, mx in enumerate((-1.2, 0.0, 1.2)):
        g("white", 0.02).boxc(mx, top + 0.03, 0.5, 0.26, 0.06, 0.32)
        g("white", 0.02).path([(mx, top + 0.05, 0.38), (mx, top + 0.35, 0.36), (mx, top + 0.5, 0.48)], 0.05, 6)
        g("dark", 0.015).boxc(mx, top + 0.22, 0.55, 0.22, 0.03, 0.2)
        g("glass", 0.0).boxc(mx, top + 0.24, 0.55, 0.16, 0.005, 0.06)
        g(LIQUIDS[i], 0.0).cylc(mx, top + 0.245, 0.55, 0.012, 0.004, 8)
        g("dark", 0.015).cylc(mx, top + 0.42, 0.55, 0.06, 0.12, 10)
        for k in range(3):
            a = TAU * k / 3
            g("steel", 0.0).cylc(mx + math.sin(a) * 0.035, top + 0.33, 0.55 + math.cos(a) * 0.035, 0.012, 0.08, 6)
        g("white", 0.015).path([(mx, top + 0.48, 0.55), (mx, top + 0.58, 0.5), (mx, top + 0.66, 0.6)], 0.04, 8)
        for k in (-1, 1):
            g("dark", 0.0).cylc(mx + k * 0.035, top + 0.7, 0.66, 0.018, 0.06, 6)
        g("lamp", 0.0).cylc(mx, top + 0.11, 0.55, 0.03, 0.02, 8)
    for i in range(4):
        g(("dark", "white")[i % 2], 0.01).boxc(-0.6, top + 0.025 + i * 0.05, 0.25, 0.3, 0.05, 0.12)
    for i in range(5):
        g("glass", 0.0).cylc(0.6, top + 0.01 + i * 0.022, 0.3, 0.07, 0.02, 12)
        g(LIQUIDS[(i + 2) % 6], 0.0).cylc(0.6, top + 0.016 + i * 0.022, 0.3, 0.055, 0.006, 12)
    g("dark", 0.03).boxc(1.4, top + 0.62, 0.15, 0.9, 0.6, 0.05)
    g("steel", 0.0).boxc(1.4, top + 0.18, 0.15, 0.06, 0.34, 0.04)
    g("screenlit", 0.0).boxc(1.4, top + 0.62, 0.18, 0.8, 0.5, 0.01)
    g("lime", 0.0).ball(1.4, top + 0.62, 0.19, 0.12, 12, 6, s=(1, 0.75, 0.05))
    g("vio", 0.0).ball(1.43, top + 0.65, 0.195, 0.04, 8, 4, s=(1, 1, 0.1))
    g("dark", 0.0).cylc(0.0, 0.32, 1.25, 0.05, 0.64, 6)
    g("seat", 0.02).cylc(0.0, 0.66, 1.25, 0.24, 0.07, 12)
    g("dark", 0.0).cylc(0.0, 0.02, 1.25, 0.24, 0.04, 10)
    g.light((0, top + 1.3, 0.8), (0.9, 0.95, 1.0), 100, 0.3)
    g.at()


def magnet_array(g, x, z, yaw=0.0):
    """four electromagnets on yokes about a ringed platform, aimed in at a steel sphere they hold in the air, cyan field loops
    about it, a control pedestal and a power cable"""
    g.at(x, z, yaw)
    g("dark", 0.04).lath([(2.5, 0), (2.5, 0.25), (2.3, 0.3), (0.0, 0.3)], segs=32)
    g("lime", 0.0).tor(2.35, 0.04, (0, 0.3, 0), n=36, rs=4)
    g("hazard", 0.0).tor(1.0, 0.04, (0, 0.31, 0), n=24, rs=4, s=(1, 0.2, 1))
    cy = 1.7
    for k in range(4):
        a = TAU * k / 4 + PI / 4
        s, c = math.sin(a), math.cos(a)
        g("steel", 0.03).boxc(s * 1.9, 0.85, c * 1.9, 0.5, 1.1, 0.5, (0, a, 0))                # the yoke's post
        g("steel", 0.02).bm((s * 1.9, 1.3, c * 1.9), (s * 1.5, cy, c * 1.5), 0.14, 6)
        coil = Vector((s * 1.25, cy, c * 1.25))
        g("copper", 0.03).cylc(coil.x, coil.y, coil.z, 0.32, 0.7, 14, rot=(PI / 2, a, 0))
        for j in range(5):
            g("brass", 0.0).cylc(coil.x - s * (0.27 - j * 0.13), coil.y, coil.z - c * (0.27 - j * 0.13), 0.335, 0.03, 14, rot=(PI / 2, a, 0))
        g("dark", 0.02).cylc(s * 0.82, cy, c * 0.82, 0.18, 0.18, 10, rot=(PI / 2, a, 0))       # the pole piece
        g("cyan", 0.0).cylc(s * 0.72, cy, c * 0.72, 0.12, 0.02, 10, rot=(PI / 2, a, 0))
    g("steel", 0.02).ball(0, cy, 0, 0.3, 16, 10)
    for k, rot in enumerate(((0.3, 0, 0), (PI / 2, 0.4, 0), (0.9, 1.2, 0.3), (-0.6, 2.1, 0.5))):
        g("cyan", 0.0).tor(0.55 + 0.08 * k, 0.012, (0, cy, 0), rot, n=32, rs=3)
    g("panel", 0.03).boxc(0, 0.75, 2.9, 0.7, 0.9, 0.45)
    g("dark", 0.0).boxc(0, 1.22, 2.95, 0.72, 0.06, 0.5, (0.35, 0, 0))
    for i in range(3):
        g(("lime", "amber", "red")[i], 0.0).ball(-0.2 + 0.2 * i, 1.27, 2.96, 0.035, 6, 4)
    g("cable", 0.0).path([(0, 0.3, 2.5), (0, 0.1, 2.0), (0, 0.1, -2.5), (0, 0.1, -4.0)], 0.09, 6)
    g.light((0, cy, 0), (0.4, 0.85, 1.0), 260, 0.3)
    g.at()


def battery_station(g, x, z, yaw):
    """a battery charging cabinet on the wall: two rows of big cells in cradles, each with a charge bar (some full, some
    filling), a status lamp per cell, a bus bar up into the cable tray, CHARGING over it"""
    g.at(x, z, yaw)
    g("panel", 0.04).boxc(0, 1.1, 0.3, 2.4, 2.2, 0.6)
    g("dark", 0.0).boxc(0, 1.1, 0.61, 2.2, 2.0, 0.02)
    for r in range(2):
        for i in range(4):
            bx, by = -0.8 + i * 0.53, 0.35 + r * 1.0
            g("dark", 0.015).boxc(bx, by - 0.04, 0.45, 0.42, 0.06, 0.36)
            g("steel", 0.02).cylc(bx, by + 0.3, 0.45, 0.16, 0.6, 14)
            g("hazard", 0.0).cylc(bx, by + 0.3, 0.45, 0.165, 0.12, 14)
            g("dark", 0.0).cylc(bx, by + 0.63, 0.45, 0.07, 0.06, 10)
            lvl = (0.2, 0.55, 0.85, 1.0, 1.0, 0.4, 0.7, 1.0)[r * 4 + i]
            g("dark", 0.0).boxc(bx + 0.18, by + 0.3, 0.63, 0.05, 0.5, 0.01)
            g("lime" if lvl >= 1 else "amber", 0.0).boxc(bx + 0.18, by + 0.05 + 0.25 * lvl, 0.64, 0.035, 0.5 * lvl, 0.01)
            g("lime" if lvl >= 1 else "red", 0.0).ball(bx - 0.15, by + 0.72, 0.62, 0.025, 6, 4)
            g("cable", 0.0).path([(bx, by + 0.66, 0.45), (bx, by + 0.78, 0.4), (bx * 0.3, by + 0.85, 0.2)], 0.025, 4)
    g("copper", 0.0).boxc(0, 2.3, 0.15, 2.2, 0.1, 0.1)
    g("steel", 0.0).cylc(0.9, 4.15, 0.1, 0.09, 3.6, 8)
    g("dark", 0.03).boxc(0, 2.5, 0.35, 2.0, 0.32, 0.06)
    g.text("CHARGING", (0, 2.4, 0.39), 0, 0.2, "lime", 0.01)
    g.at()


def drone_wall(g, R, degs, y=4.9, w=3.9, h=2.4):
    """the drone view: video panels fitted round the wall at angles degs (deg, radius R), each its own screen (`screen_drone<k>`),
    in dark bezels joined by a frame along the top and bottom, REC lamps, a caption strip under it"""
    for k, deg in enumerate(degs):
        a = math.radians(deg)
        g.at(math.sin(a) * R, math.cos(a) * R, a + PI, y)
        g("dark", 0.03).boxc(0, 0, -0.08, w + 0.24, h + 0.24, 0.16)
        g.screen(f"drone{k}", 0, 0, 0.01, w, h)
        g("red", 0.0).ball(w / 2 - 0.12, h / 2 + 0.06, 0.02, 0.04, 6, 4)
        for sx in (-1, 1):
            g("steel", 0.0).boxc(sx * (w / 2 - 0.4), 0, -0.25, 0.1, 0.1, 0.2)
        g.at()
    a0, a1 = math.radians(degs[0]) - 0.075, math.radians(degs[-1]) + 0.075
    n = 16
    for i in range(n):
        a = a0 + (a1 - a0) * (i + 0.5) / n
        for yy, hh in ((y + h / 2 + 0.17, 0.1), (y - h / 2 - 0.17, 0.1)):
            g("steel", 0.0).boxc(math.sin(a) * (R - 0.02), yy, math.cos(a) * (R - 0.02), (a1 - a0) * R / n * 1.02, hh, 0.12, (0, a, 0))
        g("dark", 0.0).boxc(math.sin(a) * (R - 0.02), y - h / 2 - 0.5, math.cos(a) * (R - 0.02), (a1 - a0) * R / n * 1.02, 0.42, 0.1, (0, a, 0))
    am = (a0 + a1) / 2
    g.text("ZBORNAK DRONE NETWORK  ·  4 FEEDS LIVE", (math.sin(am) * (R - 0.22), y - h / 2 - 0.62, math.cos(am) * (R - 0.22)), am + PI, 0.2, "cyan", 0.01)


def drone_console(g, x, z, yaw, sid="lab"):
    """the console before the drone wall, with LABNET built in: a curved desk on a low dais (the operator stands on the
    +z side, facing -z toward the wall), LABNET's screen in the middle, two feed monitors, a keyboard, a joystick for the
    drones, a stool"""
    g.at(x, z, yaw)
    g("panel", 0.03).cylc(0, 0.09, 1.2, 3.0, 0.18, 32)
    g("lime", 0.0).tor(3.0, 0.03, (0, 0.18, 1.2), n=36, rs=4)
    for k in range(-2, 3):
        a = k * 0.28
        cx, cz = math.sin(a) * 2.6, 2.6 - math.cos(a) * 2.6
        g("white", 0.03).boxc(cx, 0.65, cz, 1.0, 0.95, 0.75, (0, a, 0))
        g("dark", 0.02).boxc(cx + math.sin(a) * 0.06, 1.15, cz + math.cos(a) * 0.06, 1.02, 0.06, 0.95, (0, a, 0))
        g("cyan", 0.0).boxc(cx + math.sin(a) * 0.38, 0.55, cz + math.cos(a) * 0.38, 0.8, 0.04, 0.01, (0, a, 0))
    g("dark", 0.03).boxc(0, 1.9, -0.18, 2.3, 1.45, 0.14, (-0.15, 0, 0))
    g("dark", 0.02).boxc(0, 1.3, -0.25, 0.25, 0.3, 0.2)
    g.screen(sid, 0, 1.92, -0.10, 2.1, 1.2, 0, 0.15)
    for k in (-1, 1):
        a = k * 0.5
        g("dark", 0.02).boxc(k * 1.65, 1.68, 0.15 + 0.15, 1.0, 0.65, 0.08, (-0.15, -k * 0.5, 0))
        g(("cyan" if k < 0 else "lime"), 0.0).boxc(k * 1.63, 1.68, 0.21 + 0.15, 0.85, 0.52, 0.01, (-0.15, -k * 0.5, 0))
    g("dark", 0.0).boxc(0, 1.205, 0.32, 1.2, 0.03, 0.35)
    for i in range(14):
        g("white", 0.0).boxc(-0.5 + (i % 7) * 0.165, 1.23, 0.24 + (i // 7) * 0.14, 0.13, 0.015, 0.1)
    g("dark", 0.0).cylc(0.95, 1.25, 0.4, 0.08, 0.06, 10)
    g("steel", 0.0).bm((0.95, 1.27, 0.4), (0.95, 1.45, 0.38), 0.025, 6)
    g("red", 0.0).ball(0.95, 1.47, 0.38, 0.035, 6, 4)
    g("dark", 0.0).cylc(0, 0.5, 1.25, 0.05, 0.64, 6)
    g("seat", 0.02).cylc(0, 0.84, 1.25, 0.26, 0.08, 12)
    g.light((0, 2.0, 1.0), (0.45, 0.9, 1.0), 120, 0.3)
    g.at()
