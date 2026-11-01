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
GAME = [False]          # building for the game (build_zbornak_lab.py ZB_GAME=1): markers for screens, signs and chimeras
SOLID_DEFAULT = [False]  # new groups make colliders (the builder turns it on for the place's solid groups)
NOCOL = {"lime", "pink", "pinkhot", "cyan", "teal", "vio", "amber", "red", "lamp", "spark", "weldcore", "weldhalo", "screenlit", "holo",
         "beam", "scan", "halo", "ember", "goggle", "feed", "feed2", "water", "window", "iris", "screen", "hazard", "cable", "soil",
         "plant", "plant2", "inkline", "smoke"}     # glow, decals and wiring never collide (glass does: it is solid)
COL_MIN, COL_LONG, COL_FLOOR, COL_WIDE = 0.12, 1.0, 0.9, 2.5   # downs_common's thresholds (its notes over Acc)
_ncol = [0]
CHIMS = []      # (parent, (x, y, z), yaw, scale, index)
STATUES = []    # (parent, (x, y, z), yaw): petrified couriers on plinths
LIGHTS = []     # (parent, (x, y, z), rgb, watts, radius): point lights for the preview's interior shots
CAMS = {}       # name -> ((x, y, z), (tx, ty, tz), lens): the preview's views, in the area's frame
TEXTS = []      # (parent, text, (x, y, z), yaw, size, slot, depth)

INK = {"wall": 0.07, "wall2": 0.05, "roof": 0.06, "panel": 0.04, "dark": 0.03, "steel": 0.03, "metal": 0.03, "hazard": 0.02,
       "floor": 0.0, "barn": 0.06, "barn2": 0.04, "wood": 0.03, "wood2": 0.03, "trim": 0.02, "corr": 0.05, "moss": 0.03,
       "dirt": 0.0, "gravel": 0.0, "path": 0.0, "arm": 0.03, "armdark": 0.02, "rubber": 0.02, "white": 0.03, "brass": 0.015,
       "void": 0.02, "copper": 0.02, "plant": 0.015, "plant2": 0.015, "soil": 0.0, "stone": 0.03}


def frustum(bw, bd, tw, td, h, off=(0.0, 0.0)):
    """a box tapering from bw x bd at its foot (y = -h/2) to tw x td at its top, the top shifted by off = (x, z)"""
    x0, z0, x1, z1, y = bw / 2, bd / 2, tw / 2, td / 2, h / 2
    ox, oz = off
    v = [(-x0, -y, -z0), (x0, -y, -z0), (ox + x1, y, oz - z1), (ox - x1, y, oz - z1),
         (-x0, -y, z0), (x0, -y, z0), (ox + x1, y, oz + z1), (ox - x1, y, oz + z1)]
    return v, [(4, 5, 6, 7), (1, 0, 3, 2), (5, 1, 2, 6), (0, 4, 7, 3), (3, 7, 6, 2), (0, 1, 5, 4)]


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
        x, y, z, a, k = self.g.cur
        if x or y or z or a or k != 1:
            geo = xf(geo, (x, y, z), (0, a, 0), (k, k, k))
        self.geos.append(geo)
        return self

    def _solid(self):
        return self.g.solid and self.slot not in NOCOL

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        if self._solid() and min(w, h, d) >= COL_MIN and max(w, h, d) >= COL_LONG and not (not any(rot) and cy + h / 2 < COL_FLOOR and w >= COL_WIDE and d >= COL_WIDE):
            self.g.col_box(cx, cy, cz, w, h, d, rot)
        return self._push(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot))

    def box(self, x0, x1, y0, y1, z0, z1):
        return self.boxc((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))

    def cylc(self, cx, cy, cz, r, h, seg=12, axis="y", rt=None, rot=None):
        g = cylinder(r if rt is None else rt, r, h, seg)[:2]
        rn = min(r, r if rt is None else rt)
        if self._solid() and axis == "y" and not rot and seg >= 8 and min(2 * rn, h) >= COL_MIN and max(2 * rn, h) >= COL_LONG \
                and not (cy + h / 2 < COL_FLOOR and 2 * rn >= COL_WIDE):
            self.g.col_cyl(cx, cy - h / 2, cz, rn, h)
        elif self._solid() and axis != "y" and not rot and seg >= 8 and 2 * rn >= COL_MIN and h >= COL_LONG:
            # lying down (a pipe, a tank, an auger): the box round it, its top the drawn top
            self.g.col_box(cx, cy, cz, *((h, 2 * rn, 2 * rn) if axis == "x" else (2 * rn, 2 * rn, h)))
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
        # an upright solid of revolution collides as a cylinder per step of its profile, as wide as the step's narrower end;
        # a closed ring (an annulus: a catwalk, a collar) or a shell makes none here (its colliders are written by hand)
        closed = profile[0] == profile[-1]
        if self._solid() and not any(rot) and s == (1, 1, 1) and not closed:
            for (ra, ya), (rb, yb) in zip(profile, profile[1:]):
                if yb - ya > 0.05 and min(ra, rb) * 2 >= COL_MIN and not (yb < COL_FLOOR and min(ra, rb) * 2 >= COL_WIDE):
                    self.g.col_cyl(t[0], ya + t[1], t[2], min(ra, rb), yb - ya)
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

    def __init__(self, name, parent=None, x=0.0, y=0.0, z=0.0, yaw=0.0, solid=None, role=None):
        self.root = pivot(uname(name), (x, y, z), parent)
        self.root.rotation_euler[2] = yaw
        if role:
            self.root["role"] = role
        self.accs, self.cur = {}, (0, 0, 0, 0, 1.0)
        # colliders from this group's boxes, upright cylinders and lathes (inherits the parent group's setting)
        self.solid = SOLID_DEFAULT[0] if solid is None else solid

    def _yaw_up(self):
        """this group's yaw about y in the export root's frame (the groups turn only about y)"""
        a, o = 0.0, self.root
        while o is not None and o.get("role") not in ("export",):
            a += o.rotation_euler[2]
            o = o.parent
        return a

    def col_box(self, cx, cy, cz, w, h, d, rot=(0, 0, 0), **extra):
        """a box collider (centre, size, rotation as xf's euler) in the current local frame, as downs_common writes them"""
        from mathutils import Euler, Matrix
        x, y, z, a, k = self.cur
        w, h, d = w * k, h * k, d * k
        R = Euler((0, a, 0), "XYZ").to_matrix() @ Euler(rot, "XYZ").to_matrix()
        Rw = Euler((0, self._yaw_up(), 0), "XYZ").to_matrix() @ R
        e = Rw.to_euler("XYZ")
        _ncol[0] += 1
        pivot(f"{self.root.name}_col{_ncol[0]}", self.pt((cx, cy, cz)), self.root, role="col", shape="box", hx=w / 2, hy=h / 2, hz=d / 2,
              rx=e.x, ry=e.y, rz=e.z, **extra)

    def col_cyl(self, x, y0, z, r, h):
        """an upright cylinder collider, its base at (x, y0, z) in the current local frame"""
        _ncol[0] += 1
        pivot(f"{self.root.name}_col{_ncol[0]}", self.pt((x, y0, z)), self.root, role="col", shape="cyl", r=r * self.cur[4], h=h * self.cur[4])

    def mark(self, role, p, yaw=0.0, **data):
        """a marker pivot for the game (a spot, a screen, a sign, a chimera) at p in the current local frame, facing yaw"""
        o = pivot(uname(f"{self.root.name}_{role}"), self.pt(p), self.root, role=role, **data)
        o.rotation_euler[2] = yaw + self.cur[3]
        return o

    def __call__(self, slot, ink=None):
        ink = INK.get(slot, 0.0) if ink is None else ink
        key = (slot, round(ink, 4))
        if key not in self.accs:
            self.accs[key] = Acc(self, f"{self.root.name}_{slot}{'' if ink == INK.get(slot, 0.0) else '_i' + str(int(ink * 1000))}", slot, ink)
        return self.accs[key]

    def at(self, x=0.0, z=0.0, yaw=0.0, y=0.0, s=1.0):
        """s scales what follows (parts, colliders, markers' sizes) about the local origin"""
        self.cur = (x, y, z, yaw, s)
        return self

    def pt(self, p):
        """a point in the current local frame -> this pivot's frame"""
        x, y, z, a, k = self.cur
        q = rot_y((p[0] * k, p[1] * k, p[2] * k), a)
        return (q[0] + x, q[1] + y, q[2] + z)

    def chim(self, p, yaw, scale, idx, pen=False):
        """a chimera for the renders; for the game a marker, unless it is a pen resident (the game stands the player's own there)"""
        scale *= self.cur[4]
        CHIMS.append((self.root, self.pt(p), yaw + self.cur[3], scale, idx))
        if GAME[0] and not pen:
            self.mark("chim", p, yaw, idx=idx, scale=scale)

    def light(self, p, rgb, watts, radius=0.3):
        LIGHTS.append((self.root, self.pt(p), rgb, watts, radius))

    def text(self, s, p, yaw, size, slot="lime", depth=0.05):
        size, depth = size * self.cur[4], depth * self.cur[4]
        TEXTS.append((self.root, s, self.pt(p), yaw + self.cur[3], size, slot, depth))
        if GAME[0]:
            self.mark("text", p, yaw, text=s, size=size, slot=slot)

    def screen(self, sid, cx, cy, cz, w, h, yaw=0.0, tilt=0.0):
        """a picture quad facing +z (turned yaw, tipped back by tilt), its own mesh `screen_<sid>`; for the game, a marker
        (role screen: the game draws the picture)"""
        if GAME[0]:
            return self.mark("screen", (cx, cy, cz), yaw, sid=sid, w=w * self.cur[4], h=h * self.cur[4], tilt=tilt)
        v, f = plane(w, h)[:2]
        v, f = xf(xf((v, f), (0, 0, 0), (-tilt, 0, 0)), (cx, cy, cz), (0, yaw, 0))
        x, y, z, a, k = self.cur
        if x or y or z or a or k != 1:
            v, f = xf((v, f), (x, y, z), (0, a, 0), (k, k, k))
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
    g("dark", 0.06).lath([(R + 2.2, 0), (R + 2.2, 0.5), (R + 1.6, 0.9), (R + 1.2, 1.3), (0, 1.3)], segs=32)
    g.col_cyl(0, 0, 0, R + 2.2, 0.5)                                       # the plinth's first step (too wide for lath's own)
    g("hazard", 0.0).tor(R + 2.2, 0.06, (0, 0.46, 0), n=40, rs=4)          # a band round the plinth's rim
    g("glass", 0.0).cylc(0, 1.3 + (H - 2.6) / 2, 0, R, H - 2.6, 32)
    g("dark", 0.06).lath([(R, H - 1.3), (R + 0.6, H - 1.3), (R + 0.9, H - 0.9), (R + 0.9, H - 0.3), (R + 0.3, H), (R, H), (R, H - 1.3)], segs=32)
    for y in (1.6, H - 1.6):
        g("steel", 0.03).tor(R + 0.08, 0.14, (0, y, 0), n=32)
    for i in range(8):                                                      # the cage's ribs, up the glass
        a = TAU * i / 8
        g("steel", 0.02).bm((math.sin(a) * (R + 0.1), 1.3, math.cos(a) * (R + 0.1)), (math.sin(a) * (R + 0.1), H - 1.3, math.cos(a) * (R + 0.1)), 0.08, 5)
    cy = H * 0.5
    core = G("core", g.root, 0, cy, 0, solid=False, role="core")           # (the game spins it: orb, rings, arcs)
    core("pink", 0.0).ball(0, 0, 0, R * 0.42, 16, 12)
    core("pinkhot", 0.0).ball(0, 0, 0, R * 0.26, 12, 8)
    for k, (c, rr, w, rot) in enumerate((("lime", 0.66, 0.1, (0.5, 0, 0.3)), ("cyan", 0.78, 0.08, (-0.4, 0.6, -0.5)), ("vio", 0.55, 0.07, (1.2, 0.2, 0.1)))):
        ring = G(f"ring{k}", core.root, solid=False, role="ring")
        ring(c, 0.0).tor(R * rr, w, (0, 0, 0), rot, n=40)
    # the collar the pylons clamp to: a steel band round the glass, bolted flanges above and below
    cly = collar_y or cy - 2.6
    g("steel", 0.04).lath([(R + 0.03, cly - 0.4), (R + 0.2, cly - 0.4), (R + 0.2, cly + 0.4), (R + 0.03, cly + 0.4), (R + 0.03, cly - 0.4)], segs=32)   # (a band: open inside the glass)
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
        for k in (-1, 1):                                                   # bolt heads on the bracket's top, by the collar
            g("dark", 0.0).cylc(s * (R + 0.38) + c * 0.22 * k, cly + 0.3, c * (R + 0.38) - s * 0.22 * k, 0.05, 0.06, 6)
        g("lime", 0.0).boxc(s * (R + 0.21), cly, c * (R + 0.21), 0.45, 0.3, 0.02, (0, a, 0))     # the emitter's lens on the collar
        g("cable", 0.0).path([(s * (R + 4.6), 0.12, c * (R + 4.6)), (s * (R + 3.0), 0.12, c * (R + 3.0)), (s * (R + 2.3), 0.3, c * (R + 2.3))], 0.12, 6)
        g("dark", 0.015).boxc(s * (R + 2.15), 0.35, c * (R + 2.15), 0.5, 0.4, 0.3, (0, a, 0))     # the cable's socket on the plinth
    if crown_y:
        g("glass", 0.0).cylc(0, (H + crown_y) / 2, 0, R * 0.7, crown_y - H, 24)
        g("pink", 0.0).cylc(0, (H + crown_y) / 2, 0, 0.35, crown_y - H, 10)
        fl = G("crown_float", g.root, solid=False)                          # (its rings of light float round it)
        for k, y in enumerate((crown_y - 4, crown_y - 1.5, crown_y + 1)):
            fl(("lime", "cyan", "pink")[k], 0.0).tor(R * (1.3 - 0.25 * k), 0.22, (0, y, 0), (0.12 * (k - 1), 0, 0.1 * k), n=40)
        g("dark", 0.05).lath([(R * 0.9, crown_y - 6), (R * 0.9, crown_y - 5), (R * 0.55, crown_y + 2.5), (0.3, crown_y + 3.2), (0, crown_y + 3.25)], segs=24)
        g("steel", 0.03).cylc(0, crown_y + 7.1, 0, 0.12, 8, 6, rt=0.05)            # (its foot set in the crown's top)
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
    g("steel", 0.04).boxc(0, y + 0.72, R + 0.4, 1.7, 1.4, 0.9)             # (its top clear under the collar's flange)
    g("dark", 0.02).boxc(0, y + 0.73, R + 0.06, 1.9, 1.5, 0.2)
    g("dark", 0.04).boxc(0, y + 1.67, R + 0.6, 1.2, 0.5, 0.5)
    g.text("INTAKE", (0, y + 1.52, R + 0.86), 0, 0.3, "pink", 0.02)
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
    tur = G(name + "_turret", base.root, 0, base_h, 0, turn, solid=False)
    tur.root["role"] = "turret"
    tur(color).cylc(0, 0.35, 0, 0.62, 0.7, 14)
    tur("armdark").boxc(0, 0.95, 0, 0.9, 0.5, 0.6)
    shl = G(name + "_shoulder", tur.root, 0, 0.95, 0, solid=False)
    shl.root["role"] = "shoulder"
    shl.root.rotation_euler[0] = -sh
    L1, L2 = reach
    shl(color).cylc(0, 0, 0, 0.42, 1.05, 12, "x")
    shl("armdark").cylc(0, 0, 0, 0.3, 1.2, 10, "x")
    shl(color).path([(0, 0, 0), (0, 0, L1 * 0.5), (0, 0, L1)], [0.34, 0.3, 0.26], 8)
    shl("cable", 0.0).path([(0.4, 0.0, 0.2), (0.4, 0.28, L1 * 0.5), (0.36, 0.0, L1 - 0.2)], 0.05, 4)
    elb = G(name + "_elbow", shl.root, 0, 0, L1, solid=False)
    elb.root["role"] = "elbow"
    elb.root.rotation_euler[0] = el
    elb("armdark").cylc(0, 0, 0, 0.32, 0.7, 12, "x")
    elb(color).path([(0, 0, 0), (0, 0, L2)], [0.24, 0.17], 8)
    elb("cable", 0.0).path([(0.3, 0.0, 0.15), (0.26, 0.2, L2 * 0.5), (0.2, 0.0, L2 - 0.15)], 0.04, 4)
    wri = G(name + "_wrist", elb.root, 0, 0, L2, solid=False)
    wri.root["role"] = "wrist"
    wri.root.rotation_euler[0] = wr
    wri("armdark").ball(0, 0, 0, 0.2, 10, 7)
    wri("steel").path([(0, 0, 0), (0, 0, 0.5)], [0.14, 0.12], 8)
    rol = G(name + "_roll", wri.root, 0, 0, 0.55, solid=False)
    rol.root["role"] = "roll"
    rol.root.rotation_euler[1] = -roll                                     # (three.js +z is Blender -y)
    rol("armdark").cylc(0, 0, 0, 0.17, 0.12, 12, "z")
    if tool == "welder":
        rol("copper").path([(0, 0, 0.0), (0, 0, 0.55)], [0.1, 0.05], 8)
        wg = G(name + "_weld", rol.root, solid=False, role="weld")           # (the game lights and flickers it while welding)
        wg("weldcore", 0.0).ball(0, 0, 0.67, 0.14, 10, 7)
        wg("weldhalo", 0.0).ball(0, 0, 0.67, 0.36, 14, 9)
        wg("weldhalo", 0.0).ball(0, 0, 0.67, 0.2, 12, 8)
        for k in range(16):                                                 # sparks fanning off the weld
            b = k * 2.39
            v = Vector((math.sin(b) * 0.9, 0.3 + 0.5 * math.sin(k * 1.7), math.cos(b) * 0.4 + 0.2))
            p0 = Vector((0, 0, 0.67))
            wg("spark", 0.0).path([tuple(p0), tuple(p0 + v * 0.5), tuple(p0 + v * 1.0 + Vector((0, -0.35, 0)))], 0.016, 3)
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
    g("steel", 0.0).cylc(0.65, 0.6 + h - 0.15, 0, 0.05, 0.12, 6)
    for k in range(3):
        a = TAU * k / 3
        g("steel", 0.0).bm((0, 0.6 + h + 0.3, 0), (math.sin(a) * 0.48, 0.6 + h + 0.3, math.cos(a) * 0.48), 0.015, 4)
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
    fl = G("cage_float", g.root, *g.pt((0, 0, 0)), yaw=g.cur[3], solid=False)    # (held in the cage's field: it floats)
    fl("void", 0.0).ball(0, y, 0, r * 0.45, 16, 10)
    fl("vio", 0.0).tor(r * 0.62, 0.05, (0, y, 0), (0.5, 0, 0.2), n=32, rs=4)
    fl("cyan", 0.0).tor(r * 0.75, 0.04, (0, y, 0), (-0.3, 0.8, -0.6), n=32, rs=4)
    fl("halo", 0.0).ball(0, y, 0, r * 0.58, 14, 9)
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
        bz = 0.1 + (i // 3) * 0.22                                          # (on the sloped desk's top at bz)
        g(("lime", "cyan", "amber")[i % 3], 0.0).boxc(-0.5 + (i % 3) * 0.5, 1.25 + 0.08 / math.cos(0.35) - math.sin(0.35) * (bz - 0.15) + 0.005, bz, 0.18, 0.03, 0.14, (0.35, 0, 0))
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
    sc = G("scan", g.root, *g.pt((0, 0, 0)), yaw=g.cur[3], solid=False, role="scan")   # (the game shows it while it scans)
    sc("scan", 0.0).add(cylinder(0.08, 1.0, (top - foot).length, 16, True)[:2], tuple((top + foot) / 2), tuple(Vector((0, 1, 0)).rotation_difference(top - foot).to_euler()))
    w, h = scr
    g("dark", 0.04).boxc(scr_x, scr_y, 0.06, w + 0.3, h + 0.3, 0.12)
    g.screen(sid, scr_x, scr_y, 0.14, w, h)
    g("lime", 0.0).boxc(scr_x, scr_y - h / 2 - 0.21, 0.04, w * 0.7, 0.12, 0.08)
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
        if g.solid and L > 0.5:                                             # the run collides as one thin wall, rails high
            g.col_box((ax + bx) / 2, h / 2, (az + bz) / 2, 0.25, h, L, (0, math.atan2(bx - ax, bz - az), 0))
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
    g("panel").cylc(0, 0.2, 0, r + 0.4, 0.4, 20)                          # the footing: 0.4 m, a step up (floor colliders)
    g("corr").cylc(0, 0.4 + h / 2, 0, r, h, 24)
    for k in range(1, 6):
        g("steel").tor(r + 0.04, 0.07, (0, 0.4 + h * k / 6, 0), n=32, rs=4)
    g("barn").add(sphere(r + 0.15, 24, 8, PI / 2)[:2], (0, 0.4 + h, 0), s=(1, 0.55, 1))
    g("steel").cylc(0, 0.4 + h + (r + 0.15) * 0.55 + 0.25, 0, 0.5, 0.5, 10)
    g("lime", 0.0).tor(r + 0.06, 0.08, (0, 0.4 + h - 0.6, 0), n=32, rs=4)
    for k in (-1, 1):                                                       # the ladder, on the -x side (the chute leaves +z)
        g("steel").bm((-r - 0.25, 0.4, k * 0.3), (-r - 0.25, h + 1.2, k * 0.3), 0.04, 4)
    for i in range(int(h / 0.4)):
        g("steel").bm((-r - 0.25, 0.8 + i * 0.4, -0.3), (-r - 0.25, 0.8 + i * 0.4, 0.3), 0.025, 4)
    for y in (1.0, h * 0.5, h):                                             # its brackets to the drum
        for k in (-1, 1):
            g("steel").bm((-r + 0.02, y, k * 0.3), (-r - 0.25, y, k * 0.3), 0.03, 4)
    g.at()
    if chute_to:
        g("hazard").path([(x, 2.0, z), ((x + chute_to[0]) / 2, chute_to[1] + 2.5, (z + chute_to[2]) / 2), chute_to], 0.32, 8)


def feed_bunk(g, x, z, yaw, L=14.0, roof=True):
    """The feed line: a long raised trough of glowing feed under a lean-to roof on posts, an auger tube over the trough
    with drop spouts, a lick block at each end, a CHOW board."""
    g.at(x, z, yaw)
    g("wood2").boxc(0, 0.485, 0, L, 0.97, 1.4)                            # its collider's top 2.5 cm under the feed's
    g("dark").boxc(0, 0.975, 0, L - 0.2, 0.02, 1.1)
    g("feed", 0.0).boxc(0, 0.985, 0, L - 0.4, 0.02, 1.0)
    for i in range(int(L / 0.7)):
        g("feed2", 0.0).ball(-L / 2 + 0.4 + i * 0.7, 1.0, ((i * 5) % 3 - 1) * 0.25, 0.14, 6, 4, s=(1, 0.5, 1))
    # the roof: a slab 3.4 deep tipped 0.15 rad about x (+θ lowers the +z end), so it falls toward the front; each post is
    # cut to its underside right above
    RT, RY, RZ, RD = 0.15, 3.2, 0.25, 3.4
    under = lambda z: RY - math.sin(RT) * (z - RZ) - 0.06 / math.cos(RT)
    for k in range(int(L / 3) + 1):
        xx = -L / 2 + k * L / int(L / 3)
        g("wood2").bm((xx, 0.0, -0.9), (xx, under(-0.9), -0.9), 0.11, 6)
        g("wood2").bm((xx, 0.0, 1.4), (xx, under(1.4), 1.4), 0.11, 6)
    if roof:
        g("corr").boxc(0, RY, RZ, L + 1.2, 0.12, RD, (RT, 0, 0))
        bz = RZ - RD / 2 * math.cos(RT)                                    # the back edge's fascia
        g("barn", 0.0).boxc(0, RY + math.sin(RT) * RD / 2 + 0.02, bz - 0.03, L + 1.2, 0.3, 0.05, (RT, 0, 0))
    g("steel").cylc(0, 2.2, -0.3, 0.28, L, 12, "x")
    for k in range(int(L / 2.5)):
        xx = -L / 2 + 1.2 + k * 2.5
        g("steel").bm((xx, 2.0, -0.3), (xx, 1.35, 0.0), 0.12, 6)
        g("lime", 0.0).cylc(xx, 1.22, 0.0, 0.07, 0.25, 6)
    for k in (-1, 1):
        g("stone").boxc(k * (L / 2 + 0.8), 0.5, 0.6, 0.6, 1.0, 0.6)
        g("cyan", 0.0).boxc(k * (L / 2 + 0.8), 1.15, 0.6, 0.45, 0.3, 0.45)
    g("dark").boxc(0, 2.38, 1.4, 2.5, 0.8, 0.08)                          # CHOW, between the middle front posts, on chains
    g.text("CHOW", (0, 2.08, 1.45), 0, 0.6, "amber")
    for k in (-1, 1):
        g("steel", 0.0).bm((k * 0.95, 2.78, 1.4), (k * 0.95, under(1.4) + 0.02, 1.4), 0.015, 4)
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
    g("dark").boxc(0, h + 0.3, 0, 0.8, 0.6, 1.2)                            # the head, on the tower's four leg tops
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
    # the cattle grid: bars over a dark pit in a steel frame, all flush with the walk's top (6 cm)
    g("void", 0.0).boxc(0, 0.01, 0, w - 0.6, 0.02, 2.5)
    for i in range(9):
        g("dark", 0.0).boxc(0, 0.03, -1.2 + i * 0.3, w - 0.6, 0.06, 0.12)
    for sz in (-1, 1):
        g("steel", 0.02).boxc(0, 0.03, sz * 1.34, w - 0.3, 0.06, 0.16)
        g("steel", 0.02).boxc(sz * (w / 2 - 0.22), 0.03, 0, 0.16, 0.06, 2.84)
    for k in (-1, 1):                                                       # the gates, swung in (-z): stiles at both ends,
        hx = k * w / 2                                                      # two rails and a brace, strapped to the post
        g("wood").bm((hx, 0.12, -0.42), (hx, 1.48, -0.42), 0.075, 6).bm((hx, 0.12, -3.6), (hx, 1.48, -3.6), 0.075, 6)
        g("wood").bm((hx, 0.5, -0.42), (hx, 0.5, -3.6), 0.07, 5).bm((hx, 1.3, -0.42), (hx, 1.3, -3.6), 0.07, 5).bm((hx, 0.5, -0.42), (hx, 1.3, -3.6), 0.05, 4)
        for y in (0.5, 1.3):
            g("dark", 0.0).bm((hx, y, -0.1), (hx, y, -0.5), 0.03, 4)
    g.at()


def lamp_post(g, x, z, h=5.0, color="lamp"):
    g("dark").cylc(x, h / 2, z, 0.1, h, 8, rt=0.07)
    g("dark").cylc(x, 0.15, z, 0.3, 0.3, 8)
    g("dark").boxc(x, h + 0.05, z, 0.6, 0.1, 0.6)
    g(color, 0.0).boxc(x, h - 0.12, z, 0.45, 0.2, 0.45)


def path_ribbon(g, pts, w=3.0, step=1.0, lights=6.0, light="lime", trim=()):
    """A paved walk along a smooth curve through pts [(x, z)] (Catmull-Rom), one continuous ribbon 6 cm thick with a raised
    kerb along each edge and flush lit studs set into the kerb tops every `lights` metres. Start and end it on the edges of
    the platforms it joins. trim: circles (x, z, r) of round platforms the walk runs onto: the ribbon runs on under the
    platform's top (start or end it inside), the kerbs stop at its rim."""
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
    if trim:
        def inside(p):
            return any((p.x - cx) ** 2 + (p.z - cz) ** 2 < cr * cr for cx, cz, cr in trim)
        def frame(i):
            return (samples[min(i + 1, len(samples) - 1)] - samples[max(i - 1, 0)]).normalized()
        full = samples
        for s in (-1, 1):
            off = s * (w / 2 + 0.15)
            kp = lambda p, d: p + Vector((d.z, 0, -d.x)) * off
            keep = [i for i in range(len(full)) if not inside(kp(full[i], frame(i)))]
            if len(keep) < 2:
                continue
            i0, i1 = keep[0], keep[-1]
            sub = full[i0:i1 + 1]
            for end, j in ((0, i0), (1, i1)):                              # each cut end moved onto the rim (bisection)
                nb = j - 1 if end == 0 else j + 1
                if 0 <= nb < len(full):
                    a_, b_ = full[nb], full[j]
                    for _ in range(20):
                        m = (a_ + b_) / 2
                        if inside(kp(m, frame(j))):
                            a_ = m
                        else:
                            b_ = m
                    if end == 0:
                        sub = [b_] + sub
                    else:
                        sub = sub + [b_]
            samples = sub
            strip(s * w / 2, s * (w / 2 + 0.3), 0.0, 0.14, "panel", 0.02)
            samples = full
    else:
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
                if trim and inside(q):
                    continue
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
        hx0, hx1 = -cols * 3.25 - 0.6, cols * 3.25                        # from the cross header to the end cap
        g("steel", 0.03).cylc((hx0 + hx1) / 2, 0.6, zz, 0.35, hx1 - hx0, 10, "x")
        g("hazard", 0.0).cylc(-cols * 3.25 - 0.2, 0.6, zz, 0.38, 0.3, 10, "x")
        g("dark", 0.02).cylc(cols * 3.25, 0.6, zz, 0.42, 0.12, 10, "x")     # the end cap
        for k in range(cols):                                              # a riser from it to each panel
            g("steel", 0.0).bm((-cols * 3.25 + 3.25 + k * 6.5, 0.9, zz), (-cols * 3.25 + 3.25 + k * 6.5, 1.25, zz), 0.08, 6)
    zr = (rows - 1) * 4.5
    g("steel", 0.03).cylc(-cols * 3.25 - 0.6, 0.6, 0, 0.4, 2 * zr + 0.8, 10, "z")
    for sz in (-1, 1):
        g("dark", 0.02).cylc(-cols * 3.25 - 0.6, 0.6, sz * (zr + 0.4), 0.45, 0.12, 10, "z")
    g.at()
    if header_to:
        sx, sz = x + math.cos(yaw) * (-cols * 3.25 - 0.6), z - math.sin(yaw) * (-cols * 3.25 - 0.6)
        g("steel", 0.03).path([(sx, 0.6, sz), ((sx + header_to[0]) / 2, 0.6, (sz + header_to[1]) / 2), (header_to[0], 0.6, header_to[1])], 0.45, 10)
        for t in (0.25, 0.5, 0.75):
            g("dark", 0.02).boxc(sx + (header_to[0] - sx) * t, 0.3, sz + (header_to[1] - sz) * t, 1.2, 0.6, 1.2)


PAD_Y = 0.38                                                               # the supply pad's deck top


def landing_pad(g, x, z, r=12.0, label="Z"):
    """a supply pad: an octagonal deck on a low plinth, a painted ring and letter, edge lights, a fuel tank on skids, a
    windsock (the containers beside it are zb_container's)"""
    g.at(x, z)
    # the deck tops out under 0.42 m (PAD_Y), so it is walked on as ground (the game's k.floorCols); its marks are painted on
    g("panel", 0.05).cylc(0, 0.17, 0, r + 0.6, 0.34, 8, rt=r + 0.3)
    g("path", 0.0).cylc(0, 0.36, 0, r, 0.04, 8)
    g("hazard", 0.0).tor(r * 0.62, 0.22, (0, PAD_Y, 0), n=40, rs=4, s=(1, 0.05, 1))
    rl = r * math.cos(PI / 8) - 0.35                                        # (inside the octagon's mid-edges too)
    for i in range(16):
        a = TAU * i / 16
        g("lime" if i % 2 else "lamp", 0.0).boxc(math.sin(a) * rl, PAD_Y, math.cos(a) * rl, 0.35, 0.03, 0.35)
    g.text(label, (0, PAD_Y, 2.2), 0, 4.0, "hazard", 0.02)
    g("white", 0.04).cylc(r + 3.0, 1.3, 5.0, 1.0, 4.0, 14, "x")
    g("dark", 0.02).boxc(r + 3.0, 0.15, 5.0, 4.4, 0.3, 1.6)
    g("red", 0.0).tor(1.02, 0.06, (r + 3.0, 1.3, 5.0), (0, 0, PI / 2), n=16, rs=4)
    g("steel", 0.02).cylc(-r - 2.0, 3.0, -r * 0.5, 0.08, 6.0, 6)
    g("amber", 0.0).add(cylinder(0.12, 0.4, 1.6, 8, True)[:2], (-r - 2.0 + 0.8, 5.6, -r * 0.5), (0, 0, PI / 2 - 0.2))
    g.at()


def solar_array(g, x, z, yaw, rows=3, cols=4):
    """tilted solar tables on posts, a combiner box and a cable trench toward the lab"""
    g.at(x, z, yaw)
    # each panel tips 0.35 rad about x: a turn of +θ about x lowers the +z end (y' = y cos θ - z sin θ), so the panel faces
    # +z and its high edge is at -z; every post is cut to the panel's underside right above it
    TH, PY, PT = 0.35, 1.55, 0.08                                          # tilt, the panel's centre height, its thickness
    under = lambda dz: PY - math.sin(TH) * dz - PT / 2 / math.cos(TH)      # its underside dz from its centre (along z)
    for r in range(rows):
        for c in range(cols):
            xx, zz = (c - (cols - 1) / 2) * 7.0, (r - (rows - 1) / 2) * 7.5
            pz = zz - 0.2                                                  # the panel's centre
            for dz in (1.2, -1.2):
                top = under(dz) - 0.06                                     # (the purlin's under the panel)
                for k in (-1, 1):
                    g("steel").bm((xx + k * 2.4, 0, pz + dz), (xx + k * 2.4, top, pz + dz), 0.08, 5)
                g("steel", 0.02).bm((xx - 2.9, top + 0.03, pz + dz), (xx + 2.9, top + 0.03, pz + dz), 0.06, 4)
            g("solar", 0.02).boxc(xx, PY, pz, 6.2, PT, 3.4, (TH, 0, 0))
            for i in range(1, 6):
                g("steel", 0.0).boxc(xx - 3.1 + i * 1.03, PY + PT / 2 + 0.008, pz, 0.03, 0.016, 3.3, (TH, 0, 0))
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
    if g.solid:
        g.col_box(x, pitch * stack / 2, z, 3.5 * scale, pitch * stack, 7.9 * scale, (0, yaw, 0))


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


def chem_bench(g, x, z, yaw, L=3.8, kind=0, seed=0, s=1.0):
    """A chemistry bench against the wall at (x, z) facing yaw. kind 0: a distillation rig (retort stand, a flask over a
    burner's blue flame, a condenser coil down to a collecting beaker), a flask rack (round flasks upside down on pegs), an
    extraction hood over it with its duct up to the tray; kind 1: test-tube racks, a reagent shelf of bottles, a burner, a
    sink with a swan-neck tap. Glassware everywhere, liquids glowing."""
    g.at(x, z, yaw, s=s)
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
        # the extraction hood over the rig: a rectangular hood on a rim, its round duct up and bent back into a flange in
        # the wall (under the cable tray), a damper band on it
        g("steel", 0.03).add(frustum(1.3, 0.8, 0.44, 0.44, 0.5, (0.0, -0.18)), (-0.65, top + 1.75, 0.45))
        g("steel", 0.02).boxc(-0.65, top + 1.46, 0.45, 1.34, 0.08, 0.84)
        g("lamp", 0.0).boxc(-0.65, top + 1.41, 0.45, 1.1, 0.02, 0.6)
        g("steel", 0.02).path([(-0.65, top + 1.96, 0.27), (-0.65, top + 3.0, 0.27), (-0.65, top + 3.22, 0.2), (-0.65, top + 3.3, 0.05), (-0.65, top + 3.3, -0.08)], 0.2, 12)
        g("dark", 0.02).cylc(-0.65, top + 2.5, 0.27, 0.215, 0.12, 12)
        g("steel", 0.02).boxc(-0.65, top + 3.3, -0.06, 0.62, 0.62, 0.05)
        for k in (-1, 1):
            for j in (-1, 1):
                g("dark", 0.0).ball(-0.65 + k * 0.24, top + 3.3 + j * 0.24, -0.03, 0.025, 6, 4)
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


def microscope_bench(g, x, z, yaw, L=3.8, s=1.0):
    """a bench of microscopes against the wall: three microscopes (foot, arm, stage with a slide, tube, eyepieces, an
    objective turret), slide boxes, a stack of petri dishes, a monitor showing a magnified cell, a stool"""
    g.at(x, z, yaw, s=s)
    bench(g, L)
    top = 1.01
    for i, mx in enumerate((-1.2, 0.0, 1.2)):
        g("white", 0.02).boxc(mx, top + 0.03, 0.5, 0.26, 0.06, 0.32)
        g("white", 0.02).path([(mx, top + 0.05, 0.38), (mx, top + 0.35, 0.36), (mx, top + 0.5, 0.48)], 0.05, 6)
        g("dark", 0.015).boxc(mx, top + 0.22, 0.51, 0.22, 0.03, 0.2)
        g("glass", 0.0).boxc(mx, top + 0.24, 0.55, 0.16, 0.005, 0.06)
        g(LIQUIDS[i], 0.0).cylc(mx, top + 0.245, 0.55, 0.012, 0.004, 8)
        g("dark", 0.015).cylc(mx, top + 0.42, 0.55, 0.06, 0.12, 10)
        for k in range(3):
            a = TAU * k / 3
            g("steel", 0.0).cylc(mx + math.sin(a) * 0.035, top + 0.33, 0.55 + math.cos(a) * 0.035, 0.012, 0.08, 6)
        g("white", 0.015).path([(mx, top + 0.48, 0.55), (mx, top + 0.58, 0.5), (mx, top + 0.66, 0.6)], 0.04, 8)
        for k in (-1, 1):
            g("dark", 0.0).cylc(mx + k * 0.025, top + 0.68, 0.6, 0.018, 0.08, 6)
        g("lamp", 0.0).cylc(mx, top + 0.07, 0.55, 0.03, 0.02, 8)
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


def magnet_array(g, x, z, yaw=0.0, s=1.0):
    """four electromagnets on yokes about a ringed platform, aimed in at a steel sphere they hold in the air, cyan field loops
    about it, a control pedestal and a power cable"""
    g.at(x, z, yaw, s=s)
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
    fl = G("magnet_float", g.root, *g.pt((0, 0, 0)), yaw=g.cur[3], solid=False)   # (held in the field: it floats)
    fl.at(s=g.cur[4])
    fl("steel", 0.02).ball(0, cy, 0, 0.3, 16, 10)
    for k, rot in enumerate(((0.3, 0, 0), (PI / 2, 0.4, 0), (0.9, 1.2, 0.3), (-0.6, 2.1, 0.5))):
        fl("cyan", 0.0).tor(0.55 + 0.08 * k, 0.012, (0, cy, 0), rot, n=32, rs=3)
    g("panel", 0.03).boxc(0, 0.75, 2.9, 0.7, 0.9, 0.45)
    g("dark", 0.0).boxc(0, 1.22, 2.95, 0.72, 0.06, 0.5, (0.35, 0, 0))
    for i in range(3):
        g(("lime", "amber", "red")[i], 0.0).ball(-0.2 + 0.2 * i, 1.27, 2.96, 0.035, 6, 4)
    g("cable", 0.0).path([(0, 0.3, 2.5), (0, 0.1, 2.0), (0, 0.1, -2.5), (0, 0.1, -4.0)], 0.09, 6)
    g.light((0, cy, 0), (0.4, 0.85, 1.0), 260, 0.3)
    g.at()


def battery_station(g, x, z, yaw):
    """a battery charging cabinet against the wall (its back on local z = 0): a plinth, a steel body with vented sides, a bay
    0.25 m deep behind a glass door holding two rows of three big cells in cradles (terminals, a cable each into the bay's
    back, a charge bar and a status lamp beside each), a header with the CHARGING plate and a meter set into its face, the
    feed cable out of its side into a floor junction box at the wall"""
    g.at(x, z, yaw)
    W, D, B = 2.2, 0.85, 0.45                                               # width, depth, the bay's back (0.4 m bay)
    g("dark", 0.03).boxc(0, 0.06, D / 2, W + 0.06, 0.12, D + 0.06)         # plinth
    g("panel", 0.04).boxc(0, 0.87, B / 2, W, 1.5, B)                       # the body behind the bay
    for sx in (-1, 1):
        g("panel", 0.03).boxc(sx * (W / 2 - 0.06), 0.87, D / 2, 0.12, 1.5, D)
        for i in range(6):                                                 # vents down each side
            g("dark", 0.0).boxc(sx * (W / 2 + 0.004), 0.42 + i * 0.18, D / 2, 0.01, 0.06, D - 0.3)
    g("panel", 0.03).boxc(0, 0.17, (B + D) / 2, W - 0.24, 0.1, D - B)       # the sill
    g("panel", 0.02).boxc(0, 0.87, (B + D) / 2, W - 0.24, 0.06, D - B)      # the shelf between the rows
    g("panel", 0.04).boxc(0, 1.785, D / 2, W, 0.33, D)                     # the header
    g("dark", 0.02).boxc(-0.2, 1.785, D + 0.01, 1.3, 0.24, 0.02)           # the CHARGING plate, set into the header's face
    g.text("CHARGING", (-0.2, 1.7, D + 0.025), 0, 0.16, "lime", 0.01)
    g("dark", 0.02).boxc(0.75, 1.785, D + 0.01, 0.42, 0.22, 0.02)          # the meter
    g("screenlit", 0.0).boxc(0.75, 1.785, D + 0.022, 0.34, 0.14, 0.005)
    g("lime", 0.0).boxc(0.68, 1.775, D + 0.026, 0.14, 0.04, 0.004)
    for r in range(2):
        fy = 0.22 + r * 0.68                                               # the row's floor
        for i in range(3):
            bx = -0.62 + i * 0.62
            lvl = (0.25, 1.0, 0.6, 1.0, 0.85, 0.4)[r * 3 + i]
            cz = 0.64                                                      # (the cell's middle, in the bay)
            g("dark", 0.015).boxc(bx, fy + 0.03, cz, 0.42, 0.06, 0.34)       # the cradle
            g("steel", 0.02).cylc(bx, fy + 0.29, cz, 0.17, 0.46, 16)        # the cell
            g("hazard", 0.0).cylc(bx, fy + 0.2, cz, 0.175, 0.08, 16)
            g("dark", 0.0).cylc(bx, fy + 0.54, cz, 0.14, 0.04, 14)
            for k, c in ((-1, "red"), (1, "dark")):                        # terminals, a cable from each into the back
                g(c, 0.0).cylc(bx + k * 0.07, fy + 0.58, cz, 0.03, 0.05, 8)
                g("cable", 0.0).path([(bx + k * 0.07, fy + 0.6, cz), (bx + k * 0.07, fy + 0.62, cz - 0.07), (bx + k * 0.06, fy + 0.6, B + 0.01)], 0.015, 4)
            g("dark", 0.0).boxc(bx + 0.27, fy + 0.29, B + 0.006, 0.05, 0.42, 0.01)    # the charge bar on the bay's back
            g("lime" if lvl >= 1 else "amber", 0.0).boxc(bx + 0.27, fy + 0.08 + 0.21 * lvl, B + 0.012, 0.035, 0.42 * lvl, 0.008)
            g("lime" if lvl >= 1 else "red", 0.0).ball(bx + 0.27, fy + 0.56, B + 0.015, 0.025, 6, 4)
    g("glass", 0.0).boxc(0, 0.87, D - 0.01, W - 0.24, 1.42, 0.015)         # the door, a handle
    g("steel", 0.0).boxc(W / 2 - 0.22, 0.95, D + 0.02, 0.04, 0.4, 0.04)
    g("cable", 0.0).path([(W / 2, 0.3, 0.3), (W / 2 + 0.15, 0.2, 0.25), (W / 2 + 0.3, 0.08, 0.15)], 0.05, 6)
    g("dark", 0.02).boxc(W / 2 + 0.35, 0.12, 0.12, 0.3, 0.24, 0.24)        # the floor junction box at the wall
    g.at()


def labnet_wall(g, R, deg, sid="lab"):
    """LABNET's wall display at angle deg on the ring wall (inner radius R), facing the lab: one big screen (`screen_<sid>`)
    in a deep bezel stood 1.3 m off the wall on long brackets (in front of the cable tray, which it rises past), a lit strip
    and a row of status lamps under it, a cable from its back down into the tray; at each side the drone feeds two above
    each other (`screen_drone0..3`), each panel turned to the wall's curve in its own bezel, on a column frame bracketed to
    the wall, a REC lamp on each, its cable into the tray. Returns the angles of the two side columns."""
    a = math.radians(deg)
    SW, SH, SY, off = 9.6, 5.5, 4.5, 1.3                                    # (bottom 1.75 m, top 7.25 m)
    wall = lambda bx, o: -(o - bx * bx / (2 * R))                          # the wall's local z behind x = bx
    g.at(math.sin(a) * (R - off), math.cos(a) * (R - off), a + PI)
    g("dark", 0.04).boxc(0, SY, -0.16, SW + 0.36, SH + 0.36, 0.3)
    g("steel", 0.0).boxc(0, SY + SH / 2 + 0.2, -0.16, SW + 0.4, 0.06, 0.34).boxc(0, SY - SH / 2 - 0.2, -0.16, SW + 0.4, 0.06, 0.34)
    g.screen(sid, 0, SY, 0.005, SW, SH)
    g("lime", 0.0).boxc(0, SY - SH / 2 - 0.1, 0.0, SW - 0.4, 0.03, 0.02)
    g("dark", 0.02).boxc(0, SY - SH / 2 - 0.4, -0.12, 4.6, 0.16, 0.14)
    for i in range(11):
        g(("lime", "cyan", "amber")[i % 3], 0.0).ball(-2.0 + i * 0.4, SY - SH / 2 - 0.4, -0.04, 0.04, 6, 4)
    for bx in (-3.6, 3.6):
        d = -wall(bx, off) - 0.31
        for by in (SY - 1.8, SY + 1.8):
            g("steel", 0.02).boxc(bx, by, -0.31 - d / 2, 0.18, 0.18, d + 0.04)
    g("cable", 0.0).path([(0.0, SY + 1.9, -0.31), (0.0, 6.5, -0.7), (0.0, 6.32, -off + 0.25)], 0.06, 6)
    g.at()
    PW, PH, CY, off1 = 3.2, 1.97, SY + 0.1, 0.95
    r1 = R - off1
    dA = math.asin((SW / 2 + 0.18 + 0.35 + PW / 2 + 0.1) / r1)
    cols = []
    for k, side in enumerate((-1, 1)):
        ac = a - side * dA                                                  # (-1: left as you face the wall)
        cols.append(math.degrees(ac))
        g.at(math.sin(ac) * r1, math.cos(ac) * r1, ac + PI)
        for j, py in enumerate((CY + PH / 2 + 0.1, CY - PH / 2 - 0.1)):
            g("dark", 0.03).boxc(0, py, -0.09, PW + 0.2, PH + 0.2, 0.18)
            g.screen(f"drone{k * 2 + j}", 0, py, 0.005, PW, PH)
            g("red", 0.0).ball(PW / 2 - 0.02, py + PH / 2 + 0.04, 0.0, 0.04, 6, 4)
            for bx in (-1.0, 1.0):
                d = -wall(bx, off1) - 0.18
                g("steel", 0.0).boxc(bx, py, -0.18 - d / 2, 0.14, 0.14, d + 0.04)
        for sx in (-1, 1):
            g("steel", 0.02).boxc(sx * (PW / 2 + 0.16), CY, -0.12, 0.08, 2 * PH + 0.6, 0.1)
        g("steel", 0.02).boxc(0, CY + PH + 0.34, -0.12, PW + 0.42, 0.08, 0.14).boxc(0, CY - PH - 0.34, -0.12, PW + 0.42, 0.08, 0.14)
        g("cable", 0.0).path([(PW / 2 + 0.16, CY + PH + 0.34, -0.2), (PW / 2 + 0.16, CY + PH + 0.34, -0.6), (PW / 2 + 0.16, 6.32, -off1 + 0.2)], 0.04, 5)
        g.at()
    return cols


def labnet_desk(g, x, z, yaw):
    """LABNET's desk before the wall display: a desk curving round the operator on a low dais (the operator sits on the +z
    side facing -z, toward the wall), cabinets under its ends and open knee space in the middle; on it a keyboard, a tilted
    touch panel and the drones' joystick, a drone on a repair mat with a screwdriver and a parts tray, a soldering station
    with its iron in a coil stand, a desk lamp, a red toolbox; an office chair"""
    g.at(x, z, yaw)
    C, RD, top = 2.6, 2.6, 1.02                                             # the operator's spot (z), the desk's radius, top
    g("panel", 0.03).cylc(0, 0.09, 1.4, 3.3, 0.18, 36)
    g("lime", 0.0).tor(3.3, 0.03, (0, 0.18, 1.4), n=40, rs=4)
    seg = []
    for k in range(-2, 3):
        a = k * 0.42
        cx, cz = math.sin(a) * RD, C - math.cos(a) * RD
        seg.append((cx, cz, a))
        g("dark", 0.02).boxc(cx, top, cz, 1.12, 0.06, 0.85, (0, -a, 0))      # the top
        if k:
            g("white", 0.03).boxc(cx, 0.6, cz, 1.0, 0.84, 0.75, (0, -a, 0))  # cabinets under the ends
            g("panel", 0.0).boxc(cx + math.sin(-a) * 0.38, 0.6, cz + math.cos(-a) * 0.38, 0.8, 0.6, 0.01, (0, -a, 0))
        else:
            for sx in (-0.48, 0.48):                                       # legs and a modesty panel in the middle
                g("steel", 0.02).boxc(sx, 0.6, cz - 0.3, 0.06, 0.84, 0.06)
            g("white", 0.02).boxc(0, 0.62, cz - 0.38, 1.0, 0.6, 0.04)
            g.col_box(0, 0.615, cz, 1.12, 0.87, 0.85)                       # (its parts are too thin for their own)
        g("cyan", 0.0).boxc(cx + math.sin(-a) * 0.43, top - 0.05, cz + math.cos(-a) * 0.43, 1.05, 0.02, 0.01, (0, -a, 0))
    # the middle: keyboard, touch panel, joystick
    cx, cz, _ = seg[2]
    g("dark", 0.0).boxc(0, top + 0.04, cz + 0.12, 0.72, 0.03, 0.24)
    for i in range(18):
        g("white", 0.0).boxc(-0.3 + (i % 9) * 0.075, top + 0.06, cz + 0.06 + (i // 9) * 0.1, 0.06, 0.012, 0.07)
    g("dark", 0.02).boxc(0, top + 0.22, cz - 0.28, 0.9, 0.42, 0.04, (-0.5, 0, 0))
    g("screenlit", 0.0).boxc(0, top + 0.23, cz - 0.255, 0.8, 0.34, 0.005, (-0.5, 0, 0))
    g("dark", 0.0).cylc(0.5, top + 0.04, cz + 0.1, 0.08, 0.05, 10)
    g("steel", 0.0).bm((0.5, top + 0.06, cz + 0.1), (0.5, top + 0.24, cz + 0.08), 0.022, 6)
    g("red", 0.0).ball(0.5, top + 0.26, cz + 0.08, 0.035, 6, 4)
    # the left: a drone on a repair mat, a screwdriver, a tray of parts
    cx, cz, a = seg[1]
    g.at(x + rot_y((cx, 0, cz), yaw)[0], z + rot_y((cx, 0, cz), yaw)[2], yaw - a)
    g("dark", 0.0).boxc(0, top + 0.035, 0.05, 0.85, 0.01, 0.6)
    g("steel", 0.02).rb(0, top + 0.12, 0.05, 0.22, 0.08, 0.3, 0.3)
    for k in range(4):
        q = TAU * k / 4 + PI / 4
        px, pz = math.sin(q) * 0.3, 0.05 + math.cos(q) * 0.3
        g("dark", 0.0).bm((0, top + 0.12, 0.05), (px, top + 0.13, pz), 0.02, 5)
        g("steel", 0.0).cylc(px, top + 0.15, pz, 0.035, 0.07, 8)
        g("glass", 0.0).cylc(px, top + 0.195, pz, 0.14, 0.006, 16)
    g("dark", 0.0).ball(0, top + 0.09, 0.22, 0.04, 8, 6)
    g("cyan", 0.0).ball(0, top + 0.09, 0.255, 0.018, 6, 4)
    g("amber", 0.0).bm((0.32, top + 0.045, -0.2), (0.32, top + 0.045, 0.0), 0.012, 5)
    g("steel", 0.0).bm((0.32, top + 0.045, 0.0), (0.32, top + 0.045, 0.12), 0.004, 4)
    g("steel", 0.02).boxc(-0.3, top + 0.05, -0.18, 0.25, 0.04, 0.16)
    for i in range(5):
        g(("copper", "steel", "red", "dark", "brass")[i], 0.0).ball(-0.36 + (i % 3) * 0.05, top + 0.08, -0.21 + (i // 3) * 0.06, 0.016, 5, 3)
    # the right: a soldering station and its iron, a spool of solder
    cx, cz, a = seg[3]
    g.at(x + rot_y((cx, 0, cz), yaw)[0], z + rot_y((cx, 0, cz), yaw)[2], yaw - a)
    g("steel", 0.02).boxc(-0.15, top + 0.1, -0.15, 0.32, 0.16, 0.24)
    g("screenlit", 0.0).boxc(-0.2, top + 0.13, -0.025, 0.12, 0.06, 0.005)
    g("red", 0.0).cylc(-0.04, top + 0.1, -0.02, 0.025, 0.02, 10, "z")
    g("steel", 0.0).path([(0.15, top + 0.04, -0.1), (0.16, top + 0.1, -0.1), (0.17, top + 0.16, -0.1), (0.18, top + 0.22, -0.1)], 0.045, 8)
    g("dark", 0.0).bm((0.18, top + 0.24, -0.1), (0.05, top + 0.34, 0.02), 0.018, 6)
    g("amber", 0.0).bm((0.18, top + 0.24, -0.1), (0.21, top + 0.21, -0.12), 0.005, 4)
    g("cable", 0.0).path([(-0.15, top + 0.05, -0.27), (-0.2, top + 0.02, -0.4)], 0.012, 4)
    g("brass", 0.0).cylc(0.3, top + 0.06, 0.15, 0.06, 0.06, 12, "x")
    # the far ends: a desk lamp, a red toolbox
    cx, cz, a = seg[0]
    g.at(x + rot_y((cx, 0, cz), yaw)[0], z + rot_y((cx, 0, cz), yaw)[2], yaw - a)
    g("dark", 0.0).cylc(0.1, top + 0.04, -0.2, 0.1, 0.03, 12)
    g("steel", 0.0).bm((0.1, top + 0.05, -0.2), (0.0, top + 0.45, -0.25), 0.015, 5).bm((0.0, top + 0.45, -0.25), (-0.15, top + 0.55, -0.05), 0.015, 5)
    g("dark", 0.0).cylc(-0.18, top + 0.5, -0.02, 0.06, 0.14, 10, rt=0.03)
    g("lamp", 0.0).cylc(-0.19, top + 0.43, -0.01, 0.055, 0.01, 10)
    cx, cz, a = seg[4]
    g.at(x + rot_y((cx, 0, cz), yaw)[0], z + rot_y((cx, 0, cz), yaw)[2], yaw - a)
    g("red", 0.02).boxc(0.0, top + 0.13, -0.1, 0.5, 0.2, 0.24)
    g("dark", 0.0).boxc(0.0, top + 0.235, -0.1, 0.52, 0.02, 0.26)
    g("steel", 0.0).bm((-0.12, top + 0.25, -0.1), (-0.12, top + 0.3, -0.1), 0.012, 4).bm((0.12, top + 0.25, -0.1), (0.12, top + 0.3, -0.1), 0.012, 4)
    g("steel", 0.0).bm((-0.12, top + 0.3, -0.1), (0.12, top + 0.3, -0.1), 0.012, 4)
    # the office chair, turned a little
    g.at(x + rot_y((0.15, 0, C - 0.7), yaw)[0], z + rot_y((0.15, 0, C - 0.7), yaw)[2], yaw + 0.25)
    for k in range(5):
        q = TAU * k / 5
        g("dark", 0.0).bm((0, 0.26, 0), (math.sin(q) * 0.34, 0.24, math.cos(q) * 0.34), 0.025, 5)
        g("rubber", 0.0).ball(math.sin(q) * 0.34, 0.215, math.cos(q) * 0.34, 0.035, 6, 4)
    g("steel", 0.0).cylc(0, 0.45, 0, 0.035, 0.4, 8)
    g("seat", 0.02).rb(0, 0.7, 0, 0.5, 0.1, 0.48, 0.3)
    g("dark", 0.0).bm((0, 0.7, 0.24), (0, 0.9, 0.27), 0.03, 5)
    g("seat", 0.02).rb(0, 1.12, 0.29, 0.46, 0.5, 0.08, 0.3, (-0.12, 0, 0))
    g.at(x, z, yaw)
    g.light((0, 2.2, 0.8), (0.45, 0.9, 1.0), 140, 0.3)
    g.at()
