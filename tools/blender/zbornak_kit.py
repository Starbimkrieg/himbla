# Set pieces for the Antimatter Lab drafts (build_zbornak_lab.py execs this after kit.py): a grouping helper that places
# primitives with a local transform, and the lab's furniture (reactor, robot arms, cryo pods, hydroponics, exotic-matter
# storage, holotables, wall projections, splice pod, terminals, the airlock's security post) and the ranch's kit (fences,
# silo, feed bunk, stock tank, wind pump, bales, gate arch, lamps).
#
# Three.js axes (x right, y up, +z forward), metres. One material per mesh, named after its slot (SLOT_COLORS in
# build_zbornak_lab.py; the preview lights the GLOW slots and makes the GLASS slots see-through). `ink` as the house rules.
# Screens that the preview paints with a picture are their own meshes named `screen_<id>` (a quad, slot `screen`).
# Chimeras are not built here: CHIMS collects (parent, position, yaw, scale, which) and the preview puts real ones there
# (exported from the game's makeChimera).

import math
from mathutils import Vector

PI, TAU = math.pi, 2 * math.pi
CHIMS = []      # (parent, (x, y, z), yaw, scale, index)
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

def reactor(g, H, R=3.4, pylons=3, crown_y=None):
    """The antimatter reactor at g's local origin: plinth, glass containment column H tall, the core (an orb in two
    rings, lit), magnetic pylons leaning in with emitter claws, cable runs; crown_y: the column carries on up through a roof
    to a crown of rings and a spire at that height."""
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
    # magnetic pylons: a footing outside the plinth, a leaning mast, an emitter claw aimed at the core
    for i in range(pylons):
        a = TAU * i / pylons + PI / pylons
        s, c = math.sin(a), math.cos(a)
        foot = (s * (R + 5.5), 0, c * (R + 5.5))
        head = (s * (R + 1.9), cy + 1.6, c * (R + 1.9))
        g("panel", 0.04).boxc(foot[0], 0.6, foot[2], 2.2, 1.2, 2.2, (0, a, 0))
        g("wall2", 0.05).bm((foot[0], 1.0, foot[2]), head, 0.55, 8)
        g("hazard", 0.0).bm((s * (R + 4.6), 2.6, c * (R + 4.6)), (s * (R + 4.2), 3.6, c * (R + 4.2)), 0.57, 8)
        g("dark", 0.04).ball(*head, 0.85, 12, 8)
        for k in (-1, 1):                                                   # the two claw jaws
            b = a + k * 0.32
            tip = (math.sin(b) * (R + 0.5), cy + 1.6 + k * 0.5, math.cos(b) * (R + 0.5))
            g("steel", 0.02).path([head, ((head[0] + tip[0]) / 2 + s * 0.3, head[1] + k * 0.6, (head[2] + tip[2]) / 2 + c * 0.3), tip], 0.16, 6)
        g("lime", 0.0).ball(s * (R + 1.05), cy + 1.6, c * (R + 1.05), 0.22, 8, 6)
        g("cable", 0.0).path([(foot[0] * 0.92, 0.12, foot[2] * 0.92), (s * (R + 2.6), 0.12, c * (R + 2.6)), (s * (R + 2.2), 0.6, c * (R + 2.2))], 0.12, 6)
    if crown_y:
        g("glass", 0.0).cylc(0, (H + crown_y) / 2, 0, R * 0.7, crown_y - H, 24)
        g("pink", 0.0).cylc(0, (H + crown_y) / 2, 0, 0.35, crown_y - H, 10)
        for k, y in enumerate((crown_y - 4, crown_y - 1.5, crown_y + 1)):
            g(("lime", "cyan", "pink")[k], 0.0).tor(R * (1.3 - 0.25 * k), 0.22, (0, y, 0), (0.12 * (k - 1), 0, 0.1 * k), n=40)
        g("dark", 0.05).lath([(R * 0.9, crown_y - 6), (R * 0.9, crown_y - 5), (R * 0.55, crown_y + 2.5), (0.3, crown_y + 3.2)], segs=24)
        g("steel", 0.03).cylc(0, crown_y + 7, 0, 0.12, 8, 6, rt=0.05)
        g("red", 0.0).ball(0, crown_y + 11, 0, 0.35, 8, 6)
    g.light((0, cy, 0), (1.0, 0.25, 0.6), 9000 * (H / 14), 1.2)


def robot_arm(g, x, z, yaw, sh=0.7, el=1.4, wr=0.5, turn=0.0, tool="claw", reach=(3.2, 2.8), base_h=0.9, color="arm"):
    """An industrial arm on a pedestal at (x, z) facing yaw: turntable, shoulder, upper arm (reach[0]), elbow, forearm
    (reach[1]), wrist and a tool (claw, welder or drill). sh, el, wr: pitch up from level at each joint (rad); turn: yaw of
    the turntable. A welder throws sparks and lights its work."""
    g.at(x, z, yaw + turn)
    g("armdark").cylc(0, base_h / 2, 0, 0.75, base_h, 16, rt=0.6)
    g("hazard", 0.0).cylc(0, base_h * 0.75, 0, 0.765, 0.16, 16)
    g(color).cylc(0, base_h + 0.35, 0, 0.62, 0.7, 14)
    S = Vector((0, base_h + 0.95, 0))
    g(color).cylc(0, S.y, 0, 0.42, 1.05, 12, "x")
    g("armdark").cylc(0, S.y, 0, 0.3, 1.2, 10, "x")
    a1 = sh
    E = S + Vector((0, math.sin(a1), math.cos(a1))) * reach[0]
    a2 = a1 - el
    W = E + Vector((0, math.sin(a2), math.cos(a2))) * reach[1]
    a3 = a2 - wr
    T = W + Vector((0, math.sin(a3), math.cos(a3))) * 0.55
    g(color).path([tuple(S), tuple(S + (E - S) * 0.5), tuple(E)], [0.34, 0.3, 0.26], 8)
    g("armdark").cylc(E.x, E.y, E.z, 0.32, 0.7, 12, "x")
    g(color).path([tuple(E), tuple(W)], [0.24, 0.17], 8)
    g("armdark").ball(W.x, W.y, W.z, 0.2, 10, 7)
    g("steel").path([tuple(W), tuple(T)], [0.14, 0.12], 8)
    g("cable", 0.0).path([tuple(S + Vector((0.32, 0, 0))), tuple((S + E) * 0.5 + Vector((0.36, 0.25, 0))), tuple(E + Vector((0.3, 0, 0)))], 0.05, 4)
    d = (T - W).normalized()
    if tool == "welder":
        tip = T + d * 0.55
        g("copper").path([tuple(T), tuple(tip)], [0.1, 0.05], 8)
        g("weld", 0.0).ball(*(tip + d * 0.12), 0.16, 8, 6)
        for k in range(9):                                                  # sparks fanning off the weld
            b = k * 2.39
            v = Vector((math.sin(b) * 0.9, 0.5 + 0.4 * math.sin(k * 1.7), math.cos(b) * 0.9))
            p0 = tip + d * 0.12
            g("spark", 0.0).path([tuple(p0), tuple(p0 + v * 0.45), tuple(p0 + v * 0.9 + Vector((0, -0.25, 0)))], 0.018, 3)
        g.light(tuple(tip + d * 0.3), (0.6, 0.8, 1.0), 900, 0.15)
    elif tool == "drill":
        g("steel").path([tuple(T), tuple(T + d * 0.6)], [0.12, 0.02], 8)
    else:
        n = Vector((0, 1, 0)).cross(d)
        n = n.normalized() if n.length > 1e-4 else Vector((1, 0, 0))
        for k in (-1, 1):
            p1 = T + n * (0.16 * k)
            g("steel").path([tuple(T), tuple(p1 + d * 0.2), tuple(p1 + d * 0.5 - n * 0.06 * k)], 0.05, 5)
    g.at()
    return T + d * 0.67


def cryo_pod(g, x, z, yaw, idx=None, tint="cyan", scale=0.95):
    """An upright stasis pod at (x, z) facing yaw: plinth with a readout, a frosted glass capsule (a chimera inside, set by
    the preview), a crown with cold pipes, a lit ring at the foot and the head."""
    g.at(x, z, yaw)
    g("dark").cylc(0, 0.35, 0, 1.25, 0.7, 20, rt=1.15)
    g("white").cylc(0, 0.8, 0, 1.15, 0.2, 20)
    g(tint, 0.0).tor(1.1, 0.06, (0, 0.95, 0), n=28, rs=4)
    g("glass", 0.0).cylc(0, 2.35, 0, 1.0, 2.9, 20)
    g("frost", 0.0).cylc(0, 1.2, 0, 1.01, 0.6, 20)
    g("white").lath([(1.15, 3.75), (1.15, 4.0), (0.85, 4.4), (0.3, 4.6)], segs=20)
    g(tint, 0.0).tor(1.12, 0.05, (0, 3.85, 0), n=28, rs=4)
    for k in (-1, 1):
        g("steel").path([(k * 0.5, 4.3, -0.3), (k * 0.8, 4.9, -0.8), (k * 0.9, 5.4, -1.6)], 0.09, 6)
    g("dark", 0.015).boxc(0, 0.42, 1.18, 1.0, 0.45, 0.12, (-0.2, 0, 0))
    g("screenlit", 0.0).boxc(0, 0.44, 1.235, 0.8, 0.3, 0.02, (-0.2, 0, 0))
    for k in range(3):
        g(("lime", "red", "lime")[k], 0.0).ball(-0.3 + 0.3 * k, 0.72, 1.12, 0.04, 6, 4)
    if idx is not None:
        g.chim((0, 1.0, 0), PI * 0, scale, idx)
    g.light((0, 2.4, 0.4), (0.4, 0.85, 1.0), 120, 0.2)
    g.at()


def hydro_rack(g, x, z, yaw, L=6.0, tiers=3, seed=1):
    """A bioluminescent hydroponics rack L long at (x, z) facing yaw: tiers of trays on a steel frame, glowing bulbs,
    fronds and caps in each, a grow light over each tray, a nutrient tank and pipe at one end."""
    g.at(x, z, yaw)
    for sx in (-L / 2, L / 2):
        for sz in (-0.55, 0.55):
            g("steel").boxc(sx, tiers * 0.6 + 0.3, sz, 0.1, tiers * 1.2 + 0.6, 0.1)
    for t in range(tiers):
        y = 0.5 + t * 1.2
        g("white").boxc(0, y, 0, L + 0.2, 0.24, 1.3)
        g("soil", 0.0).boxc(0, y + 0.125, 0, L, 0.02, 1.15)
        g("vio", 0.0).boxc(0, y + 1.02, 0, L - 0.2, 0.05, 0.16)
        g("steel").boxc(0, y + 1.07, 0, L - 0.1, 0.06, 0.22)
        n = int(L * 2.2)
        for i in range(n):
            px = -L / 2 + 0.3 + (L - 0.6) * i / max(1, n - 1)
            pz = ((i * 37 + seed * 11 + t * 5) % 7 - 3) * 0.12
            kind = (i + t + seed) % 4
            c = ("lime", "cyan", "teal", "vio")[(i * 3 + t + seed) % 4]
            if kind == 0:                                                   # a bulb on a stem
                h = 0.35 + (i % 3) * 0.1
                g("plant").bm((px, y + 0.13, pz), (px, y + 0.13 + h, pz), 0.025, 4)
                g(c, 0.0).ball(px, y + 0.15 + h, pz, 0.11, 8, 6)
            elif kind == 1:                                                 # fronds
                for k in range(3):
                    b = k * 2.1 + i
                    g("plant2").path([(px, y + 0.13, pz), (px + math.sin(b) * 0.15, y + 0.4, pz + math.cos(b) * 0.15), (px + math.sin(b) * 0.3, y + 0.55, pz + math.cos(b) * 0.3)], [0.04, 0.03, 0.01], 4)
                g(c, 0.0).ball(px, y + 0.22, pz, 0.06, 6, 4)
            elif kind == 2:                                                 # a glowing cap (mushroom)
                g("plant").cylc(px, y + 0.25, pz, 0.04, 0.24, 6)
                g(c, 0.0).ball(px, y + 0.38, pz, 0.16, 10, 5, s=(1, 0.45, 1))
            else:                                                           # a pitcher
                g("plant2").cylc(px, y + 0.3, pz, 0.08, 0.34, 8, rt=0.12)
                g(c, 0.0).cylc(px, y + 0.47, pz, 0.1, 0.02, 8)
        g.light((0, y + 0.6, 0), (0.4, 1.0, 0.7), 70, 0.4)
    g("glass", 0.0).cylc(L / 2 + 0.9, 1.1, 0, 0.6, 2.0, 16)
    g("teal", 0.0).cylc(L / 2 + 0.9, 0.85, 0, 0.56, 1.5, 16)
    g("white").cylc(L / 2 + 0.9, 2.15, 0, 0.66, 0.15, 16)
    g("steel").path([(L / 2 + 0.9, 2.2, 0), (L / 2 + 0.9, 2.6, 0), (L / 2 - 0.2, 2.6, 0), (L / 2 - 0.2, tiers * 1.2 + 0.9, 0)], 0.06, 6)
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


def void_cage(g, x, z, yaw=0.0, r=1.6, y=2.4):
    """A floating sphere of exotic matter held in a magnetic cage: a ringed plinth, three posts to a top ring, a black
    sphere with a violet halo and two tilted containment rings."""
    g.at(x, z, yaw)
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


def projection(g, x, y, z, yaw, w, h, kind=0, color="holo"):
    """A holographic wall projection, w x h, centred at (x, y, z) facing yaw: a thin lit frame, a translucent panel and
    drawn content (bars and a curve, a helix, or a grid with blips)."""
    g.at(x, z, yaw, y)
    g(color, 0.0).boxc(0, 0, 0, w, h, 0.02)
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
        g("cable", 0.0).path([(math.sin(a) * 1.2, 6.2, math.cos(a) * 1.2), (math.sin(a) * 2.6, 6.8, math.cos(a) * 2.6), (math.sin(a) * 3.0, 0.1, math.cos(a) * 3.0)], 0.1, 6)
    g("lime", 0.0).cylc(0, 3.0, 0, 0.12, 4.4, 8)
    g("panel").boxc(0, 0.55, 3.1, 1.2, 1.1, 0.7)
    g("dark").boxc(0, 1.15, 3.2, 1.3, 0.12, 0.9, (0.35, 0, 0))
    g("lime", 0.0).boxc(0, 1.2, 3.22, 0.9, 0.02, 0.55, (0.35, 0, 0))
    g.light((0, 3, 0), (0.5, 1.0, 0.25), 220, 0.4)
    g.at()


def lab_terminal_console(g, x, z, yaw, sid="lab"):
    """Draft A's lab terminal (LABNET): a curved console desk with a keyboard ledge, a big tilted main screen (the
    picture the player gets close to) between two side screens, a cable loom and a stool."""
    g.at(x, z, yaw)
    for k in range(-2, 3):
        a = k * 0.28
        g("panel").boxc(math.sin(a) * 3.2, 0.5, -3.2 + math.cos(a) * 3.2, 1.0, 1.0, 0.9, (0, a, 0))
        g("dark").boxc(math.sin(a) * 3.25, 1.05, -3.2 + math.cos(a) * 3.25, 1.02, 0.1, 1.1, (0, a, 0))
        g("cyan", 0.0).boxc(math.sin(a) * 3.72, 0.6, -3.2 + math.cos(a) * 3.72, 0.8, 0.05, 0.02, (0, a, 0))
    g("dark").boxc(0, 1.13, 0.05, 1.4, 0.06, 0.5, (0.12, 0, 0))
    for i in range(14):
        g("white", 0.0).boxc(-0.6 + (i % 7) * 0.2, 1.17, -0.05 + (i // 7) * 0.18, 0.15, 0.02, 0.13, (0.12, 0, 0))
    g("dark").boxc(0, 2.35, -0.55, 2.9, 1.9, 0.18, (-0.18, 0, 0))
    g("dark").boxc(0, 1.35, -0.75, 0.3, 0.6, 0.3)
    g.screen(sid, 0, 2.37, -0.43, 2.6, 1.5, 0, 0.18)
    for k in (-1, 1):
        g("dark").boxc(k * 2.1, 2.1, -0.25, 1.3, 1.0, 0.12, (-0.12, -k * 0.5, 0))
        g(("lime" if k < 0 else "pink"), 0.0).boxc(k * 2.13, 2.1, -0.18, 1.1, 0.8, 0.01, (-0.12, -k * 0.5, 0))
    g("cable", 0.0).path([(0.5, 0.1, -1.6), (0.9, 0.1, -3.0), (1.2, 0.1, -5.0)], 0.12, 6)
    g("dark").cylc(0, 0.35, 1.2, 0.08, 0.7, 8)
    g("seat").cylc(0, 0.75, 1.2, 0.35, 0.12, 12)
    g.light((0, 2.4, 0.8), (0.4, 1.0, 0.6), 90, 0.3)
    g.at()


def lab_terminal_kiosk(g, x, z, yaw, sid="lab"):
    """Draft B's lab terminal (SPECIMEN INDEX): a standing archive kiosk, a tall portrait screen in a ribbed white frame
    on a plinth, a sloped palm reader, two holo emitters throwing a small projection of the entry over it, lit plinth."""
    g.at(x, z, yaw)
    g("dark").boxc(0, 0.15, 0.2, 3.2, 0.3, 2.4)
    g("lime", 0.0).boxc(0, 0.31, 1.41, 3.0, 0.03, 0.02)
    g("white").boxc(0, 2.2, -0.2, 2.6, 4.0, 0.6)
    g("dark").boxc(0, 2.3, 0.11, 2.2, 3.4, 0.04)
    for k in (-1, 1):
        g("white").boxc(k * 1.45, 2.2, -0.2, 0.3, 4.3, 0.8)
        g("cyan", 0.0).boxc(k * 1.62, 2.2, -0.2, 0.03, 3.6, 0.5)
    g.screen(sid, 0, 2.35, 0.14, 2.0, 3.1)
    g("panel").boxc(0, 0.95, 0.75, 1.4, 0.8, 0.6)
    g("dark").boxc(0, 1.38, 0.85, 1.4, 0.1, 0.8, (0.45, 0, 0))
    g("lime", 0.0).boxc(0, 1.43, 0.88, 0.5, 0.02, 0.4, (0.45, 0, 0))
    g("white").boxc(0, 4.5, -0.2, 3.4, 0.4, 1.2)
    for k in (-1, 1):
        g("dark").cylc(k * 0.9, 4.25, 0.3, 0.12, 0.2, 10)
        g("beam", 0.0).bm((k * 0.9, 4.15, 0.3), (0, 3.2, 1.2), 0.05, 6)
    g.light((0, 2.4, 1.2), (0.4, 0.9, 1.0), 110, 0.3)
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


def security_post(g, x, z, yaw, door_y, cam_side=1, sid="sec", scr=(3.0, 1.7), scr_pos=None):
    """The airlock's security interface in front of the door at (x, z) (door face plane, facing yaw): a camera on a
    jointed arm reaching out over a painted stand plate with two footprints, a lit scan cone down to the plate, the
    screen that shows the picture (`screen_<sid>`), a status lamp bar and an intercom post with a call button."""
    g.at(x, z, yaw)
    px, pz = 0.0, 3.6                                                       # the stand plate, in front of the door
    g("hazard", 0.0).cylc(px, 0.03, pz, 1.25, 0.06, 8)
    g("dark", 0.0).cylc(px, 0.035, pz, 1.05, 0.06, 8)
    for k in (-1, 1):
        g("lime", 0.0).rb(px + k * 0.2, 0.07, pz + 0.05, 0.11, 0.01, 0.24, 0.5, nu=10, nv=4)
    bx = cam_side * 2.9
    g("dark").boxc(bx, door_y + 1.6, 0.25, 0.6, 0.8, 0.5)
    j1 = (bx, door_y + 1.7, 0.6)
    j2 = (bx * 0.55, door_y + 1.9, 1.7)
    cam = (bx * 0.25, door_y + 1.5, 2.3)
    g("arm").path([j1, j2], 0.1, 8).path([j2, cam], 0.08, 8)
    g("armdark").ball(*j2, 0.16, 8, 6)
    g("white").rb(cam[0], cam[1], cam[2], 0.22, 0.2, 0.36, 0.4, rot=(-0.9, 0, 0))
    lens = (cam[0], cam[1] - 0.25, cam[2] + 0.22)
    g("dark").cylc(lens[0], lens[1], lens[2], 0.13, 0.16, 12, rot=(PI / 2 - 0.9 + PI / 2, 0, 0))
    g("red", 0.0).ball(lens[0], lens[1] - 0.07, lens[2] + 0.06, 0.08, 8, 6)
    top, foot = Vector(lens) + Vector((0, -0.06, 0)), Vector((px, 0.06, pz))
    g("scan", 0.0).add(cylinder(0.08, 1.0, (top - foot).length, 16, True)[:2], tuple((top + foot) / 2), tuple(Vector((0, 1, 0)).rotation_difference(top - foot).to_euler()))
    w, h = scr
    sx, sy, sz = scr_pos or (0.0, door_y + 2.6, 0.06)
    g("dark", 0.04).boxc(sx, sy, sz - 0.05, w + 0.3, h + 0.3, 0.12)
    g.screen(sid, sx, sy, sz + 0.02, w, h)
    g("lime", 0.0).boxc(sx, sy - h / 2 - 0.3, sz, w * 0.7, 0.12, 0.08)
    g("dark").boxc(-cam_side * 3.0, 0.65, 2.4, 0.4, 1.3, 0.3)
    g("dark").boxc(-cam_side * 3.0, 1.45, 2.45, 0.55, 0.6, 0.12)
    g("screenlit", 0.0).boxc(-cam_side * 3.0, 1.5, 2.52, 0.4, 0.3, 0.02)
    g("red", 0.0).cylc(-cam_side * 3.0, 1.25, 2.53, 0.06, 0.03, 10, "z")
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


def path_strip(g, pts, w=3.0, y=0.03, edge="lime"):
    """a paved walk along pts [(x, z)], kerb lights along both edges every 6 m"""
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, bz - az)
        a = math.atan2(bx - ax, bz - az)
        g("path").boxc((ax + bx) / 2, y, (az + bz) / 2, w, 0.04, L + w, (0, a, 0))
        n = max(1, int(L / 6))
        for i in range(n + 1):
            t = i / n
            cx, cz = ax + (bx - ax) * t, az + (bz - az) * t
            for k in (-1, 1):
                g(edge, 0.0).boxc(cx + k * (w / 2 + 0.15) * math.cos(a), 0.08, cz - k * (w / 2 + 0.15) * math.sin(a), 0.2, 0.1, 0.2, (0, a, 0))


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
    """a supply pad: an octagonal deck on a low plinth, a painted ring and letter, edge lights, a crate stack, a fuel tank
    on skids, a windsock"""
    g.at(x, z)
    g("panel", 0.05).cylc(0, 0.25, 0, r + 0.6, 0.5, 8, rt=r + 0.3)
    g("path", 0.0).cylc(0, 0.52, 0, r, 0.04, 8)
    g("hazard", 0.0).tor(r * 0.62, 0.22, (0, 0.55, 0), n=40, rs=4, s=(1, 0.2, 1))
    for i in range(16):
        a = TAU * i / 16
        g("lime" if i % 2 else "lamp", 0.0).boxc(math.sin(a) * (r - 0.2), 0.6, math.cos(a) * (r - 0.2), 0.35, 0.12, 0.35)
    g.text(label, (0, 0.55, 2.2), 0, 4.0, "hazard", 0.02)
    for i, (cx, cz, h) in enumerate(((r + 3.0, -3.0, 0), (r + 3.0, -1.4, 0), (r + 3.0, -2.2, 1.4), (r + 4.6, -2.2, 0))):
        g(("barn", "steel", "hazard", "panel")[i % 4], 0.03).boxc(cx, h + 0.7, cz, 1.5, 1.4, 1.5)
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


def test_site(g, x, z, r=11.0):
    """Test Site 7: a scorched blast crater in a berm, a half-buried bunker with a lit slit, a blast wall, warning boards,
    twisted debris and a target dummy that has seen better days"""
    g.at(x, z)
    g("dirt", 0.04).lath([(r + 3.0, 0), (r + 1.0, 1.4), (r - 0.5, 1.2), (r - 2.0, 0.1)], segs=36)
    g("scorch", 0.0).cylc(0, 0.04, 0, r - 1.5, 0.04, 36)
    for i in range(14):
        a = TAU * i / 14 + 0.2
        L = r * (0.7 + 0.5 * abs(math.sin(i * 1.9)))
        g("scorch", 0.0).boxc(math.sin(a) * L / 2, 0.05, math.cos(a) * L / 2, 0.9 + 0.6 * (i % 3), 0.02, L, (0, a, 0))
    g("ember", 0.0).ball(0, 0.1, 0, 0.6, 10, 4, s=(1, 0.3, 1))
    for i in range(6):
        a = i * 1.1
        g("steel", 0.02).path([(math.sin(a) * 4.0, 0.05, math.cos(a) * 4.0), (math.sin(a + 0.2) * 4.6, 0.8, math.cos(a + 0.2) * 4.6), (math.sin(a + 0.5) * 5.4, 0.5, math.cos(a + 0.5) * 5.4)], 0.12, 5)
    g("steel", 0.02).cylc(2.0, 1.2, -1.0, 0.1, 2.4, 6)
    g("barn2", 0.02).boxc(2.0, 2.3, -1.0, 0.6, 0.8, 0.3)
    g("scorch", 0.0).ball(2.0, 2.9, -1.0, 0.3, 8, 6)
    g("stone", 0.06).boxc(0, 1.6, r + 9.0, 9.0, 3.2, 5.0)
    g("void", 0.0).boxc(0, 2.3, r + 6.45, 6.0, 0.4, 0.1)
    g("amber", 0.0).boxc(0, 2.3, r + 6.42, 5.6, 0.25, 0.04)
    g("stone", 0.05).boxc(0, 2.0, r + 4.5, 12.0, 4.0, 1.0)
    for k in (-1, 1):
        g("dark", 0.02).cylc(k * (r + 4.0), 1.4, 0, 0.08, 2.8, 6)
        g("hazard", 0.02).boxc(k * (r + 4.0), 2.6, 0, 0.1, 1.2, 2.2)
    g.text("TEST SITE 7", (0, 4.25, r + 4.0), PI, 0.8, "amber")
    g.text("STAND BEHIND THE WALL", (0, 3.4, r + 3.98), PI, 0.36, "lime")
    g.at()
