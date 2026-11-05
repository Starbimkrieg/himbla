# The small outposts' kit for Blender: a port of the game's Kit (src/outpostModels.js) and the outpost builders' helpers
# (src/outpostDrafts.js, src/settlements.js lattice / quonset), so build_outposts.py reads like the code it replaced, line for
# line. Exec'd by build_outposts.py after kit.py (geometry primitives, mesh_smooth, pivot, export).
#
# Three.js axes throughout (x right, y up, +z to the gate, ground at y = 0); kit.py's tb() turns them into Blender's.
#
#   Materials   T(c) lit toon, G(c) unlit, D(c) lit both sides, GLASS(c, op) see-through, BEAM(c, op) additive light. c is a
#               colour (0xRRGGBB), FAC (the owner's faction colour: faction, faction_glow, faction_cloth) or a palette key of S
#               (S.body ... S.hut: style_<key>, the owner's palette, outpostLooks.js STYLE). The names follow
#               docs/outpost-glb.md, so the game paints each as the Kit did.
#   Parts       k.add / box / cyl / ball / ring / beam / strip, as the Kit's (ink = the Kit's `outline`, metres). Parts are
#               merged per (group, material, ink, moving node, owner) into one mesh each: loose parts in a mesh stay parts to
#               the structure audit. k.grp names the group ('yard' or 'main'): an outpost's yard is the same in its wreck,
#               so its meshes are shared between the two roots (build_outposts.py share_yard).
#   Frames      k.at(x, z, yaw) replaces the frame; `with k.within(x, z, yaw, sc):` nests one (sc scales about the apron's
#               top), `with k.grow(px, pz, sc):` scales a group in place. Colliders, moving parts and points follow.
#   Gameplay    k.solid / solidQ / column / hcyl / sphere / hit, k.raid_at, k.smoke / k.drop, k.stack (cargo boxes the
#               game adds), k.walkers: empties and root extras at finish(). Floor colliders: k.floor_cols, as the Kit's
#               floorColliders (every up-facing surface 3 to 42 cm up, on a 0.5 m grid, merged into boxes).
#   Moving      k.dyn(anim, x, y, z, ry, speed) -> a node; k.part(node, geo, mat, m, ink) puts geometry in its frame.

import json, math
from mathutils import Matrix, Vector, Quaternion

F = 0.3                    # the apron's top
R = 40                     # the yard's radius
TAU = math.pi * 2
WARM, GLASSC = 0xFFF6A8, 0x9BE7FF
STEEL, DARK, LIGHT, CREAM, CONC, YEL = 0x55607A, 0x3A3550, 0xD8D4E8, 0xFFF4E0, 0x8A8698, 0xFFD23F
WOOD, RUST, TYRE, CHAR = 0x8A5A3A, 0x7A4A32, 0x221D33, 0x2A2433
PANEL = 0x5B5870           # settlements.js: the Quonset's ribs
KIND_SEED = {"tower": 11, "depot": 23, "farm": 37, "mast": 41, "kiosk": 53, "shack": 67, "junk": 79}  # outpostModels.js
DRAFT_SALT = {"a": 3, "b": 7, "c": 3}  # outpostTemplate: a draft's seed is KIND_SEED * 977 + (b ? 7 : 3)


# ---------------- colours and materials ----------------

class Key:
    """A palette key: the owner's colour for it is painted by the game (style_<key> materials)."""
    def __init__(self, key):
        self.key = key


class _Style:
    def __getattr__(self, key):
        return Key(key)


S = _Style()     # S.body, S.panel, S.dark, S.roof, S.trim, S.glow, S.conc, S.metal, S.hut
FAC = Key("faction")
# SpaceCom's palette: the preview colours of the style_ materials in Blender (outpostLooks.js STYLE.spacecom)
PREVIEW = {"body": 0xF3EEE4, "panel": 0xD8D2C4, "dark": 0x1B2A5A, "roof": 0x3A4A78, "trim": 0xFFD23F, "glow": 0xFFF3B0,
           "conc": 0xB8B2A6, "metal": 0x55607A, "hut": 0x6F7A5A, "faction": 0xFFD23F}

MATS = {}  # name -> (preview hex, double sided, alpha or None)


def _reg(name, hexc, double=False, alpha=None):
    if name not in MATS:
        MATS[name] = (hexc, double, alpha)
        SLOT_COLORS[name] = srgb(hexc)  # (kit.py material() reads it)
    return name


def T(c):
    if isinstance(c, Key):
        return _reg("faction" if c is FAC or c.key == "faction" else f"style_{c.key}", PREVIEW[c.key])
    return _reg(f"c{c:06x}", c)


def G(c):
    if isinstance(c, Key):
        if c.key == "faction":
            return _reg("faction_glow", PREVIEW["faction"])
        return _reg("style_glow" if c.key == "glow" else f"style_{c.key}_glow" if c.key == "trim" else f"style_{c.key}_glow", PREVIEW[c.key])
    return _reg(f"glow_{c:06x}", c)


def D(c):
    if isinstance(c, Key):
        return _reg("faction_cloth" if c.key == "faction" else f"style_{c.key}_2s", PREVIEW[c.key], True)
    return _reg(f"c{c:06x}_2s", c, True)


def GLASS(c, op):
    return _reg(f"glass_{c:06x}_{round(op * 100):02d}", c, True, op)


def BEAM(c, op):
    return _reg(f"additive_{c:06x}_{round(op * 100):02d}", c, True, op)


def kind_of(mat):
    return "glass" if mat.startswith("glass") else "additive" if mat.startswith("additive") else "other"


def make_materials():
    """Blender materials for every name used: preview colour, culling off for double sided, alpha for glass and beams
    (Principled alpha < 1 exports alphaMode BLEND and the alpha in baseColorFactor)."""
    for name, (hexc, double, alpha) in MATS.items():
        SLOT_COLORS[name] = srgb(hexc)
        m = material(name)
        m.use_backface_culling = not double
        if alpha is not None:
            bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            bsdf.inputs["Alpha"].default_value = alpha
            m.diffuse_color = (*SLOT_COLORS[name], alpha)
            if hasattr(m, "surface_render_method"):
                m.surface_render_method = "BLENDED"
            elif hasattr(m, "blend_method"):
                m.blend_method = "BLEND"


def srgb(h):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(h >> 16 & 255), lin(h >> 8 & 255), lin(h & 255))


# ---------------- random streams, rotations ----------------

def mulberry32(a):
    """src/rng.js, bit for bit."""
    a &= 0xFFFFFFFF
    imul = lambda x, y: (x * y) & 0xFFFFFFFF

    def rng():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(a ^ (a >> 15), 1 | a)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rng


def js_round(v):
    return math.floor(v + 0.5)


def euler(rx=0.0, ry=0.0, rz=0.0):
    """THREE.Euler(rx, ry, rz) ('XYZ') as a 4x4: Rx * Ry * Rz."""
    return Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rz, 4, "Z")


def unit_to(d):
    """THREE.Quaternion.setFromUnitVectors(+y, d) as a 4x4."""
    d = Vector(d).normalized()
    if d.y < -0.999999:
        return Matrix.Rotation(math.pi, 4, "X")
    return Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()


I4 = Matrix.Identity(4)
# three.js frame -> Blender frame: (x, y, z) -> (x, -z, y)
CB = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
CB_INV = CB.inverted()


# ---------------- geometry the kit.py primitives lack (three.js layouts, (verts, faces, smooth)) ----------------

def xform(geo, m):
    return place(geo, m)


def ring_flat(r0, r1, seg):
    """THREE.RingGeometry(r0, r1, seg, 1).rotateX(-pi / 2): a flat annulus facing +y."""
    v, f = [], []
    for i in range(seg + 1):
        a = TAU * i / seg
        v.append((math.cos(a) * r0, 0.0, -math.sin(a) * r0))
        v.append((math.cos(a) * r1, 0.0, -math.sin(a) * r1))
    for i in range(seg):
        a, b = 2 * i, 2 * i + 2
        f.append((a, a + 1, b + 1, b))
    return v, f, [0] * len(f)


def circle_xy(r, seg, start=0.0, length=TAU):
    """THREE.CircleGeometry(r, seg, start, length): a disc (sector) in the xy plane facing +z."""
    v = [(0.0, 0.0, 0.0)]
    for i in range(seg + 1):
        a = start + length * i / seg
        v.append((math.cos(a) * r, math.sin(a) * r, 0.0))
    return v, [(0, i, i + 1) for i in range(1, seg + 1)], [0] * seg


def icosahedron(r):
    t = (1 + math.sqrt(5)) / 2
    vs = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    k = r / math.sqrt(1 + t * t)
    fs = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
          (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    return [(x * k, y * k, z * k) for x, y, z in vs], fs, [0] * 20


def extrude_xy(pts, depth):
    """THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }): the outline in the xy plane (counter-clockwise),
    from z = 0 to z = depth."""
    n = len(pts)
    v = [(x, y, 0.0) for x, y in pts] + [(x, y, depth) for x, y in pts]
    f = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return v, f, [0] * len(f)


def star_pts(r, inner=0.42, n=5):
    pts = []
    for i in range(n * 2):
        a = i / (n * 2) * TAU
        rad = r * inner if i % 2 else r
        pts.append((math.sin(a) * rad, math.cos(a) * rad))
    return list(reversed(pts))  # (counter-clockwise)


def torus_xy(R, r, radial, tubular, arc=TAU):
    """THREE.TorusGeometry(R, r, radial, tubular, arc) as built: round the z axis, in the xy plane."""
    return torus_partial(R, r, radial, tubular, arc)


def cone_open(r, h, seg):
    """THREE.ConeGeometry(r, h, seg, 1, true): apex at +h/2."""
    return cylinder(0.0, r, h, seg, open_ended=True)


def tri_area_up(a, b, c):
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    return nx, ny, nz


# ---------------- the kit ----------------

class Node:
    """A moving part (anim flag / blink / spin): an empty the game swings, blinks or spins; geometry in its frame."""
    def __init__(self, obj, sc):
        self.obj, self.sc = obj, sc


class Kit:
    def __init__(self, kind, root, seed, wreck):
        self.kind, self.root, self.wreck = kind, root, wreck
        self.rr, self.mr, self.wr = mulberry32(seed), mulberry32(seed + 1), mulberry32(seed + 2)
        self.sfx = "_wreck" if wreck else ""
        self.base, self.yaw, self.sc = Matrix.Identity(4), 0.0, 1.0
        self.grp = "yard"
        self.only = None             # owners the parts drawn now are for (an emblem each): a tuple, or None for all
        self.buckets = {}            # (grp, mat, ink, node id, only) -> [geo, ...]
        self.nodes = {}              # node id -> Node
        self.cols, self.hits, self.stacks, self.points, self.texts = [], [], [], {}, []
        self.walk = None
        self.floor_cols, self.floor_tol = True, 0.03
        self.floor_parts = []        # (geo) every part the floor pass reads
        self.n = 0

    # -- names
    def uid(self, base):
        self.n += 1
        return f"{base}_{self.kind}_{self.n}{self.sfx}"

    # -- frames
    def at(self, x=0, z=0, yaw=0, y=0):
        self.base = Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, "Y")
        self.yaw, self.sc = yaw, 1.0
        return self

    def P(self, x, y, z):
        return self.base @ Vector((x, y, z))

    class _Frame:
        def __init__(self, k, m, yaw, sc):
            self.k, self.m, self.dyaw, self.dsc = k, m, yaw, sc

        def __enter__(self):
            k = self.k
            self.save = (k.base.copy(), k.yaw, k.sc)
            k.base = k.base @ self.m
            k.yaw += self.dyaw
            k.sc *= self.dsc
            return k

        def __exit__(self, *a):
            self.k.base, self.k.yaw, self.k.sc = self.save

    def within(self, x, z, yaw=0.0, sc=1.0):
        """outpostDrafts.js within(): a frame at (x, z) turned by yaw inside the current one; sc scales about the apron's top."""
        if sc == 1:
            m = Matrix.Translation((x, 0, z)) @ Matrix.Rotation(yaw, 4, "Y")
        else:
            m = Matrix.Translation((x, F, z)) @ Matrix.Rotation(yaw, 4, "Y") @ Matrix.Scale(sc, 4) @ Matrix.Translation((0, -F, 0))
        return Kit._Frame(self, m, yaw, sc)

    def grow(self, px, pz, sc):
        """outpostDrafts.js grow(): scale a whole group by sc about the ground point (px, pz)."""
        m = (Matrix.Translation((px, F, pz)) @ Matrix.Scale(sc, 4) @ Matrix.Translation((0, -F, 0))) @ Matrix.Translation((-px, 0, -pz))
        return Kit._Frame(self, m, 0.0, sc)

    def group(self, grp):
        k = self

        class _G:
            def __enter__(s):
                s.save = k.grp
                k.grp = grp

            def __exit__(s, *a):
                k.grp = s.save
        return _G()

    def owners(self, only):
        k = self

        class _O:
            def __enter__(s):
                s.save = k.only
                k.only = tuple(only)

            def __exit__(s, *a):
                k.only = s.save
        return _O()

    # -- parts
    def _put(self, geo, mat, ink, node=None, floor=True):
        if kind_of(mat) != "other":
            ink = 0  # (glass and light beams get no outline)
        key = (self.grp, mat, round(float(ink), 4), node, self.only)
        self.buckets.setdefault(key, []).append(geo)
        if node is None and floor and kind_of(mat) == "other":
            self.floor_parts.append(geo)

    def add(self, geo, mat, x=0, y=0, z=0, rx=0, ry=0, rz=0, q=None, ink=0.06, floor=True):
        m = self.base @ Matrix.Translation((x, y, z)) @ (q if q is not None else euler(rx, ry, rz))
        g = place(geo, m)
        self._put(g, mat, ink, floor=floor)
        return g

    def box(self, w, h, d, mat, x, y0, z, ink=0.06, **o):
        return self.add(cuboid(w, h, d), mat, x, y0 + h / 2, z, ink=ink, **o)

    def cyl(self, rt, rb, h, seg, mat, x, y0, z, ink=0.06, **o):
        return self.add(cylinder(rt, rb, h, seg), mat, x, y0 + h / 2, z, ink=ink, **o)

    def ball(self, r, mat, x, y, z, ink=0.06, **o):
        return self.add(sphere(r, 8, 6), mat, x, y, z, ink=ink, **o)

    def ring(self, r, tube, mat, x, y, z, ink=0, **o):
        return self.add(torus_arc(r, tube, max(12, js_round(r * 5)), 4), mat, x, y, z, ink=ink, **o)

    def beam(self, a, b, r, mat, ink=0.03, seg=5):
        d = Vector(b) - Vector(a)
        return self.add(cylinder(r, r, d.length, seg), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, q=unit_to(d), ink=ink)

    def strip(self, a, b, w, h, mat, y0, ink=0.02, **o):
        dx, dz = b[0] - a[0], b[1] - a[1]
        return self.box(w, h, math.hypot(dx, dz), mat, (a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2, ink=ink, ry=math.atan2(dx, dz), **o)

    # -- moving parts
    def dyn(self, anim, x, y, z, ry=0.0, speed=None):
        p = self.P(x, y, z)
        e = pivot(self.uid(anim), (p.x, p.y, p.z), self.root, anim=anim)
        if speed:
            e["speed"] = float(speed)
        e.rotation_euler = (0, 0, self.yaw + ry)
        node = Node(e, self.sc)
        self.nodes[e.name] = node
        return e.name

    def part(self, node, geo, mat, m=I4, ink=0.0):
        """geometry in a moving node's frame (m places it there; the frame's scale is baked in)."""
        sc = self.nodes[node].sc
        self._put(place(geo, Matrix.Scale(sc, 4) @ m), mat, ink, node=node)

    def blinker(self, x, y, z, color=0xFF2A4A, r=0.4):
        nd = self.dyn("blink", x, y, z)
        self.part(nd, sphere(r, 8, 6), G(color))
        return nd

    def flag(self, x, z, h=10, color=FAC, y0=0):
        self.cyl(0.1, 0.13, h, 6, T(DARK), x, y0, z, ink=0.03)
        self.ball(0.22, G(color), x, y0 + h + 0.15, z, ink=0)
        nd = self.dyn("flag", x, y0 + h - 1.0, z)
        self.part(nd, plane(3, 1.8), D(color), Matrix.Translation((1.55, 0, 0)), ink=0.0)
        return nd

    # -- yard pieces
    def apron(self, r, color, edge=0x5A566A):
        self.cyl(r, r + 0.6, 0.3, 48, T(color), 0, 0, 0, ink=0.05, floor=False)
        self.ring(r - 0.3, 0.16, T(edge), 0, 0.3, 0)

    def raid_at(self, x, z, color):
        if self.wreck:
            return
        self.ring(1.7, 0.14, G(color), x, F + 0.04, z)
        self.ring(1.1, 0.07, G(color), x, F + 0.04, z)
        self.points["raid"] = self.P(x, F, z)

    def point(self, role, x, y, z):
        self.points[role] = self.P(x, y, z)

    # -- colliders and blast boxes (outpost frame, like the Kit's specs)
    def _rot_q(self, q=I4):
        r = self.base.to_3x3().normalized().to_4x4()
        return r @ q

    def solid(self, hx, hy, hz, x, z, ry=0, y0=0, pitch=0):
        s = self.sc
        rot = Matrix.Rotation(self.yaw + ry, 4, "Y") @ Matrix.Rotation(pitch, 4, "X")
        if s != 1:
            p = self.P(x, y0, z)
            self.cols.append(dict(type="box", hx=hx * s, hy=hy * s, hz=hz * s, p=(p.x, p.y + hy * s, p.z), rot=rot))
            return
        p = self.P(x, 0, z)
        self.cols.append(dict(type="box", hx=hx, hy=hy, hz=hz, p=(p.x, y0 + hy, p.z), rot=rot))

    def solidQ(self, hx, hy, hz, x, y, z, q=I4, **extra):
        p = self.P(x, y, z)
        self.cols.append(dict(type="box", hx=hx * self.sc, hy=hy * self.sc, hz=hz * self.sc, p=(p.x, p.y, p.z), rot=self._rot_q(q), **extra))

    def sphere_col(self, r, x, y, z):
        p = self.P(x, y, z)
        self.cols.append(dict(type="sphere", r=r * self.sc, p=(p.x, p.y, p.z)))

    def column(self, r, h, x, z, y0=0):
        if self.sc != 1:
            p = self.P(x, y0, z)
            self.cols.append(dict(type="cyl", r=r * self.sc, y0=p.y, y1=self.P(x, h, z).y, x=p.x, z=p.z))
            return
        p = self.P(x, 0, z)
        self.cols.append(dict(type="cyl", r=r, y0=y0, y1=h, x=p.x, z=p.z))

    def hcyl(self, r, length, x, z, ry=0, y=0):
        p = self.P(x, y, z)
        self.cols.append(dict(type="hcyl", r=r * self.sc, len=length * self.sc, p=(p.x, p.y if self.sc != 1 else y, p.z), yaw=self.yaw + ry))

    def hit(self, hx, hy, hz, x, z, ry=0):
        p, s = self.P(x, 0, z), self.sc
        self.hits.append(dict(hx=hx * s, hy=hy * s, hz=hz * s, p=(p.x, hy * s, p.z), yaw=self.yaw + ry))

    def floor_box(self, hx, hy, hz, x, y, z):
        """a hand-laid floor collider (outpost frame): ground to the runner, not an obstacle"""
        self.cols.append(dict(type="box", hx=hx, hy=hy, hz=hz, p=(x, y, z), rot=I4, floor=True))

    def stack(self, x, z, n, factions="owner", ry=0, y0=0):
        """standard cargo boxes the game stacks here (settlements.js cargoStack, with its collider): 'owner' boxes in
        the owner's livery (outpostLooks.js CARGO_OF), else the liveries named, box by box"""
        p = self.P(x, y0, z)
        self.stacks.append(dict(p=(p.x, p.y, p.z), yaw=self.yaw + ry, n=n, factions=factions if isinstance(factions, str) else ",".join(factions)))

    def text(self, words, x, y, z, ry, w, fg="#ffd23f", bg="#241a3a", stroke="#120a1e", rz=0, back=True, off=0.17):
        """a sign face the game draws (canvas text), facing local +z turned ry, w m wide"""
        p = self.P(x, y, z)
        self.texts.append(dict(p=(p.x, p.y, p.z), yaw=self.yaw + ry, rz=rz, str=words, w=w * self.sc, off=off * self.sc, fg=fg, bg=bg, stroke=stroke, back=1 if back else 0))

    def walkers(self, routes, kind="person"):
        if self.wreck:
            return  # (they've fled)
        self.walk = {"kind": kind, "routes": [[[round(x, 3), round(z, 3)] for x, z in r] for r in routes]}

    # -- floor colliders (outpostModels.js Kit.floorColliders, ported)
    def _floor_colliders(self):
        CELL, LO, HI = 0.5, 0.03, 0.42
        tris = []
        for verts, faces, _ in self.floor_parts:
            for f in faces:
                for i in range(1, len(f) - 1):
                    a, b, c = verts[f[0]], verts[f[i]], verts[f[i + 1]]
                    top = max(a[1], b[1], c[1])
                    if top < LO - 1e-5 or top > HI + 1e-5:  # (mathutils is single precision: 0.42 may come out 0.42000002)
                        continue
                    nx, ny, nz = tri_area_up(a, b, c)
                    ln = math.sqrt(nx * nx + ny * ny + nz * nz)
                    if ln < 1e-9 or ny / ln < 0.85:
                        continue
                    tris.append((a, b, c))
        if not tris:
            return
        x0 = min(min(t[0][0], t[1][0], t[2][0]) for t in tris)
        x1 = max(max(t[0][0], t[1][0], t[2][0]) for t in tris)
        z0 = min(min(t[0][2], t[1][2], t[2][2]) for t in tris)
        z1 = max(max(t[0][2], t[1][2], t[2][2]) for t in tris)
        C = CELL
        nx, nz = math.ceil((x1 - x0) / C) + 1, math.ceil((z1 - z0) / C) + 1
        H = [-1] * (nx * nz)
        for a, b, c in tris:
            ax, az, bx, bz, cx, cz = a[0], a[2], b[0], b[2], c[0], c[2]
            d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
            if abs(d) < 1e-12:
                continue
            i0 = max(0, math.floor((min(ax, bx, cx) - x0) / C)); i1 = min(nx - 1, math.floor((max(ax, bx, cx) - x0) / C))
            j0 = max(0, math.floor((min(az, bz, cz) - z0) / C)); j1 = min(nz - 1, math.floor((max(az, bz, cz) - z0) / C))
            for j in range(j0, j1 + 1):
                for i in range(i0, i1 + 1):
                    x, z = x0 + (i + 0.5) * C, z0 + (j + 0.5) * C
                    l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
                    l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
                    l3 = 1 - l1 - l2
                    if l1 < 0 or l2 < 0 or l3 < 0:
                        continue
                    h = js_round((l1 * a[1] + l2 * b[1] + l3 * c[1]) * 100)
                    if h > H[j * nx + i]:
                        H[j * nx + i] = h
        if self.floor_tol:
            hs = sorted(set(h for h in H if h >= 0))
            to, i = {}, 0
            while i < len(hs):
                j = i
                while j + 1 < len(hs) and hs[j + 1] - hs[i] <= self.floor_tol * 100:
                    j += 1
                for q in range(i, j + 1):
                    to[hs[q]] = hs[j]
                i = j + 1
            H = [to[h] if h >= 0 else h for h in H]
        used = [False] * (nx * nz)
        for j in range(nz):
            for i in range(nx):
                h = H[j * nx + i]
                if h < 0 or used[j * nx + i]:
                    continue
                w = 1
                while i + w < nx and H[j * nx + i + w] == h and not used[j * nx + i + w]:
                    w += 1
                dz = 1
                while j + dz < nz and all(H[(j + dz) * nx + i + q] == h and not used[(j + dz) * nx + i + q] for q in range(w)):
                    dz += 1
                for jj in range(j, j + dz):
                    for q in range(w):
                        used[jj * nx + i + q] = True
                top = h / 100
                self.floor_box(w * C / 2, 0.2, dz * C / 2, x0 + (i + w / 2) * C, top - 0.2, z0 + (j + dz / 2) * C)

    # -- build the Blender objects
    def finish(self):
        if self.floor_cols:
            self._floor_colliders()
        holders = {}
        for (grp, mat, ink, node, only), geos in self.buckets.items():
            parent = self.nodes[node].obj if node else self.root
            if only:
                hk = (node, only)
                if hk not in holders:
                    h = pivot(self.uid("only"), (0, 0, 0), parent, only_faction=",".join(only))
                    holders[hk] = h
                parent = holders[hk]
            verts, faces, smooth = [], [], []
            for v, f, s in geos:
                o = len(verts)
                verts.extend(v)
                faces.extend(tuple(i + o for i in fc) for fc in f)
                smooth.extend(s)
            name = f"{self.kind}_{grp}_{mat}_{int(round(ink * 1000))}" + (f"_{'_'.join(only)}" if only else "") + (f"_{node}" if node else self.sfx)
            mesh_smooth(name, (verts, faces, smooth), mat, parent, ink)
        for i, c in enumerate(self.cols):
            name = f"col_{self.kind}_{i}{self.sfx}"
            if c["type"] == "box":
                m = Matrix.Translation(c["p"]) @ c["rot"] @ Matrix.Diagonal((c["hx"], c["hy"], c["hz"], 1))
                e = _empty(name, m, self.root, "CUBE", role="col", shape="box")
                if c.get("floor"):
                    e["floor"] = 1
                if c.get("lattice"):
                    e["lattice"] = 1
            elif c["type"] == "cyl":
                hy = (c["y1"] - c["y0"]) / 2
                m = Matrix.Translation((c["x"], c["y0"] + hy, c["z"])) @ Matrix.Diagonal((c["r"], hy, c["r"], 1))
                _empty(name, m, self.root, "CIRCLE", role="col", shape="cyl")
            elif c["type"] == "hcyl":
                m = Matrix.Translation(c["p"]) @ Matrix.Rotation(c["yaw"], 4, "Y") @ Matrix.Diagonal((c["r"], c["r"], c["len"] / 2, 1))
                _empty(name, m, self.root, "CIRCLE", role="col", shape="hcyl")
            else:
                m = Matrix.Translation(c["p"]) @ Matrix.Scale(c["r"], 4)
                _empty(name, m, self.root, "SPHERE", role="col", shape="sphere")
        for i, h in enumerate(self.hits):
            m = Matrix.Translation(h["p"]) @ Matrix.Rotation(h["yaw"], 4, "Y") @ Matrix.Diagonal((h["hx"], h["hy"], h["hz"], 1))
            _empty(f"hit_{self.kind}_{i}{self.sfx}", m, self.root, "CUBE", role="hit")
        for i, st in enumerate(self.stacks):
            m = Matrix.Translation(st["p"]) @ Matrix.Rotation(st["yaw"], 4, "Y")
            _empty(f"stack_{self.kind}_{i}{self.sfx}", m, self.root, "ARROWS", role="stack", n=st["n"], factions=st["factions"])
        for i, t in enumerate(self.texts):
            m = Matrix.Translation(t["p"]) @ Matrix.Rotation(t["yaw"], 4, "Y") @ Matrix.Rotation(t["rz"], 4, "Z")
            _empty(f"text_{self.kind}_{i}{self.sfx}", m, self.root, "PLAIN_AXES", role="text", str=t["str"], w=t["w"], off=t["off"], fg=t["fg"], bg=t["bg"], stroke=t["stroke"], back=t["back"])
        for role, p in self.points.items():
            _empty(f"{role}_{self.kind}{self.sfx}", Matrix.Translation(p), self.root, "ARROWS", role=role)
        if self.walk:
            self.root["walkers"] = json.dumps(self.walk, separators=(",", ":"))


def _empty(name, m3, parent, display, **props):
    """an empty at the three.js-frame matrix m3 (translation, rotation, scale = half-extents)"""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = display
    e.empty_display_size = 1
    C.objects.link(e)
    e.parent = parent
    e.matrix_basis = CB @ m3 @ CB_INV
    for k, v in props.items():
        e[k] = v
    return e


# ---------------- shared pieces (outpostDrafts.js, outpostModels.js, settlements.js) ----------------

def polar(r, a):
    return math.sin(a) * r, math.cos(a) * r


def yard(k, color, edge):
    """The apron, its floor laid by hand in 2.5 m bands (each as wide as its narrower edge's chord)."""
    k.apron(R, color, edge)
    band, z0 = 2.5, -R
    while z0 < R - 1e-6:
        z1 = z0 + band
        zn = max(abs(z0), abs(z1))
        hw = math.sqrt(max(0, R * R - zn * zn))
        if hw >= 1:
            k.floor_box(hw, 0.2, band / 2, 0, F - 0.2, (z0 + z1) / 2)
        z0 += band


def paint_at(k, x, z, r, w, color, y=0):
    """a painted ring on the ground, 4 mm proud"""
    k.add(ring_flat(r - w, r + w, max(24, js_round(r * 4))), T(color), x, F + y + 0.004, z, ink=0)


def paint_strip(k, a, b, w, color, lift=0):
    k.strip(a, b, w, 0.01, T(color), F - 0.006 + lift, ink=0, floor=bool(lift and lift >= 0.05))


def lamp_post(k, x, z, h=5.5, color=WARM, arm=True):
    k.cyl(0.25, 0.3, 0.3, 8, T(DARK), x, F, z, ink=0.02)
    k.cyl(0.08, 0.11, h, 6, T(DARK), x, F, z, ink=0.02)
    if arm:
        for s in (-1, 1):
            k.beam((x, F + h - 0.3, z), (x + s * 0.7, F + h, z), 0.04, T(DARK), ink=0)
            k.ball(0.22, G(color), x + s * 0.7, F + h - 0.15, z, ink=0)
    else:
        k.ball(0.28, G(color), x, F + h + 0.2, z, ink=0)
    k.column(0.2, F + h, x, z)


def flag_pole(k, x, z, h=11):
    k.flag(x, z, h, FAC, F)
    k.column(0.15, F + h, x, z)


def tree(k, x, z, s=1, leaf=0x5FBF4A):
    k.cyl(1.1 * s, 1.2 * s, 0.7, 12, T(0xD8D0C0), x, F, z, ink=0.04)
    k.cyl(1.0 * s, 1.0 * s, 0.04, 12, T(0x4A3A2A), x, F + 0.7, z, ink=0)
    k.cyl(0.14 * s, 0.2 * s, 2.6 * s, 6, T(WOOD), x, F + 0.7, z, ink=0.03)
    k.add(icosahedron(1.5 * s), T(leaf), x, F + 0.7 + 3.2 * s, z, ink=0.05)
    k.add(icosahedron(1.0 * s), T(0x4AA83A), x + 0.8 * s, F + 0.7 + 2.6 * s, z + 0.3 * s, ry=0.6, ink=0.04)
    k.column(1.2 * s, F + 0.7, x, z)
    k.sphere_col(1.35 * s, x, F + 0.7 + 3.2 * s, z)
    k.sphere_col(0.9 * s, x + 0.8 * s, F + 0.7 + 2.6 * s, z + 0.3 * s)


def pyramid_cols(k, x, z, y0, Rr, h, steps=8):
    for i in range(steps):
        b0, top = i / steps * h * 0.94, (i + 1) / steps * h * 0.94
        w = Rr * math.sqrt(0.5) * (1 - top / h)
        k.solid(w, (top - b0) / 2, w, x, z, 0, y0 + b0)


def debris(k, cx, cz, hx, hz, n, rr, colors=(CHAR, 0x3A3540, 0x4A3F3A, 0x55505E)):
    """rubble: broken slabs lying on the ground, each with a collider"""
    for i in range(n):
        w = 0.6 + rr() * 2.2
        h = 0.3 + rr() * 1.1
        d = 0.6 + rr() * 2
        x = cx + (rr() * 2 - 1) * hx
        z = cz + (rr() * 2 - 1) * hz
        a = (rr() - 0.5) * 0.5
        b = rr() * 3
        c = (rr() - 0.5) * 0.5
        q = euler(a, b, c)
        k.add(cuboid(w, h, d), T(colors[i % len(colors)]), x, F + h * 0.35, z, q=q, ink=0.04)
        k.solidQ(w / 2, h / 2, d / 2, x, F + h * 0.35, z, q)


def ruin(k, x, z, w, d, h, yaw, color, rr, roof=DARK):
    """a scorched slab, broken wall stubs round its edge (they collide), a roof slab fallen in, rubble and embers"""
    with k.within(x, z, yaw):
        k.box(w + 1, 0.06, d + 1, T(CHAR), 0, F, 0, ink=0)

        def wall(length, along, at):
            n = max(2, js_round(length / 2.4))
            for i in range(n):
                if rr() < 0.2:
                    continue
                u = -length / 2 + (i + 0.5) * (length / n)
                hh = 0.6 + rr() * h * 0.75
                px, pz = (u, at) if along else (at, u)
                mat = T(CHAR if rr() < 0.3 else color)
                rz = (rr() - 0.5) * 0.12
                k.box(length / n if along else 0.4, hh, 0.4 if along else length / n, mat, px, F, pz, rz=rz, ink=0.05)
                k.solid(length / n / 2 if along else 0.2, (F + hh) / 2, 0.2 if along else length / n / 2, px, pz)
        wall(w, True, d / 2)
        wall(w, True, -d / 2)
        wall(d, False, w / 2)
        wall(d, False, -w / 2)
        sx = (rr() - 0.5) * w * 0.3
        sz = (rr() - 0.5) * d * 0.3
        q = euler(0.22, rr(), -0.18)
        k.add(cuboid(w * 0.6, 0.35, d * 0.55), T(roof), sx, F + 1.1, sz, q=q, ink=0.06)
        k.solidQ(w * 0.3, 0.18, d * 0.275, sx, F + 1.1, sz, q)
        debris(k, 0, 0, w * 0.4, d * 0.4, js_round(w * d / 14), rr)
        for i in range(5):
            ex = (rr() - 0.5) * w * 0.7
            ez = (rr() - 0.5) * d * 0.7
            k.box(0.3, 0.12, 0.3, G(0xFF7A1A if i % 2 else 0xFFB347), ex, F, ez, ink=0)


def sandbags(k, cx, cz, r, a0, a1, rows=2):
    for row in range(rows):
        step = 1.25 / r
        a = a0 + (row % 2) * step * 0.5
        while a <= a1:
            k.add(place(sphere(0.66, 10, 5), Matrix.Diagonal((1, 0.5, 0.62, 1))), T(0xB59F74), cx + math.sin(a) * r, F + 0.28 + row * 0.5, cz + math.cos(a) * r, ry=a, ink=0.03)
            a += step
    n = max(1, math.ceil((a1 - a0) * r / 1.2))
    da = (a1 - a0) / n
    for i in range(n):
        a = a0 + (i + 0.5) * da
        k.solid(da * r / 2 + 0.15, (F + rows * 0.5 - 0.2) / 2, 0.3, cx + math.sin(a) * r, cz + math.cos(a) * r, a)


def crate(k, x, y0, z, s=1.2, color=0x9A6A3A, ry=0):
    k.box(s, s, s, T(color), x, y0, z, ry=ry, ink=0.04)
    k.box(s * 1.02, s * 0.14, s * 1.02, T(0x5A3A22), x, y0 + s * 0.43, z, ry=ry, ink=0)
    k.solid(s / 2, s / 2, s / 2, x, z, ry, y0)


FACTIONS = ("spacecom", "vostok", "daedalus", "meridian", "kepler", "rustmoon")


def emblem(k, x, y, z, ry, sz):
    """the owner's mark on a wall (local +z out of the wall), about sz m across: a disc in its dark colour and, per owner
    (only_faction), its sign"""
    with k.within(x, z, ry):
        k.add(cylinder(sz / 2, sz / 2, 0.06, 24), T(S.dark), 0, y, 0.03, rx=math.pi / 2, ink=0.02)

        def flat(geo, mat, dz=0.03):
            k.add(geo, mat, 0, y, dz, ink=0)
        rx = Matrix.Rotation(math.pi / 2, 4, "X")
        with k.owners(["vostok"]):
            flat(extrude_xy(star_pts(sz * 0.4), 0.05), T(S.trim), 0.06)
        with k.owners(["daedalus"]):
            flat(extrude_xy([(0, sz * 0.4), (-sz * 0.36, -sz * 0.26), (sz * 0.36, -sz * 0.26)], 0.05), T(S.trim), 0.06)
            flat(place(cylinder(sz * 0.09, sz * 0.09, 0.06, 12), rx), G(0xFFFFFF), 0.13)
        with k.owners(["spacecom"]):
            for dy in (-0.13, 0.13):
                for sx in (-1, 1):
                    k.box(sz * 0.36, sz * 0.1, 0.05, T(S.trim), sx * sz * 0.13, y + dy * sz - sz * 0.05, 0.08, rz=sx * 0.6, ink=0)
        with k.owners(["rustmoon"]):
            flat(place(cylinder(sz * 0.3, sz * 0.3, 0.05, 14), rx), T(0xE8E0CC), 0.07)
            for sx in (-1, 1):
                flat(place(cylinder(sz * 0.08, sz * 0.08, 0.05, 8), Matrix.Translation((sx * sz * 0.11, sz * 0.03, 0)) @ rx), G(S.trim), 0.1)
        with k.owners(["kepler"]):
            flat(place(cylinder(sz * 0.22, sz * 0.22, 0.05, 16), rx), T(S.trim), 0.07)
            flat(torus_xy(sz * 0.34, sz * 0.04, 4, 20), T(0xFFF4E0), 0.07)
        with k.owners(["meridian"]):
            flat(torus_xy(sz * 0.3, sz * 0.06, 4, 24), T(S.trim), 0.07)


def checkpoint(k, x, z, ry, gate_w=9):
    """a guard booth with a boom barrier across the gate (local +z out)"""
    with k.within(x, z, ry):
        bx = gate_w / 2 + 2.2
        k.box(2.6, 0.3, 2.6, T(S.conc), bx, F, 0, ink=0.03)
        k.box(2.2, 2.7, 2.2, T(S.body), bx, F + 0.3, 0, ink=0.06)
        k.box(2.24, 1.0, 2.24, G(S.glow), bx, F + 1.6, 0, ink=0)
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            k.box(0.18, 1.02, 0.18, T(S.dark), bx + sx * 1.1, F + 1.59, sz * 1.1, ink=0)
        k.box(2.8, 0.3, 2.8, T(S.roof), bx, F + 3.0, 0, ink=0.04)
        k.box(2.82, 0.1, 2.82, T(S.trim), bx, F + 3.3, 0, ink=0)
        k.solid(1.4, (F + 3.4) / 2, 1.4, bx, 0)
        k.box(0.5, 1.1, 0.5, T(S.dark), bx - 1.6, F, 0.4, ink=0.03)
        k.solid(0.25, (F + 1.1) / 2, 0.25, bx - 1.6, 0.4)
        for i in range(8):
            k.box(gate_w / 8, 0.16, 0.16, T(0xFFFFFF if i % 2 else 0xFF3B5C), bx - 1.6 - (i + 0.5) * (gate_w / 8), F + 1.0, 0.4, ink=0.02 if i == 0 else 0)
        k.box(0.3, 1.0, 0.3, T(S.dark), bx - 1.6 - gate_w + 0.05, F, 0.4, ink=0.02)  # (under the boom's end: it rests on it)


def gun_pit(k, x, z, face0=0):
    """a sandbagged pit round a heavy machine gun on a tripod pedestal, put together from the pedestal up (outpostDrafts.js
    gunPit); face0: where it points (from +z, turning to +x)"""
    sandbags(k, x, z, 2.7, face0 - math.pi + 0.7, face0 + math.pi - 0.7, 3)
    GUN, MET, Dk = T(0x3A3F4A), T(0x6A7088), T(DARK)
    with k.within(x, z, face0):
        PH = F + 1.55
        Y = PH + 0.32
        for i in range(3):
            a = i / 3 * TAU + math.pi
            k.beam((math.sin(a) * 0.85, F, math.cos(a) * 0.85), (0, F + 0.75, 0), 0.05, Dk, ink=0.015)
            k.cyl(0.1, 0.1, 0.04, 8, Dk, math.sin(a) * 0.85, F, math.cos(a) * 0.85, ink=0)
        k.cyl(0.07, 0.08, PH - F, 8, MET, 0, F, 0, ink=0.02)
        k.cyl(0.12, 0.12, 0.12, 10, Dk, 0, F + 0.7, 0, ink=0.01)
        k.cyl(0.16, 0.13, 0.08, 10, Dk, 0, PH, 0, ink=0.01)
        k.box(0.36, 0.06, 0.22, GUN, 0, PH + 0.08, 0, ink=0.01)
        for sd in (-1, 1):
            k.box(0.05, 0.3, 0.2, GUN, sd * 0.155, PH + 0.08, 0, ink=0.01)
        k.add(cylinder(0.035, 0.035, 0.4, 6), MET, 0, Y, 0, rz=math.pi / 2, ink=0)
        k.box(0.24, 0.24, 1.1, GUN, 0, Y - 0.12, -0.1, ink=0.02)
        k.box(0.2, 0.06, 0.8, Dk, 0, Y + 0.12, -0.1, ink=0)
        k.box(0.06, 0.1, 0.16, Dk, 0, Y + 0.18, 0.2, ink=0)
        k.beam((0, Y, 0.45), (0, Y, 1.25), 0.075, MET, ink=0.015, seg=8)
        t = 0.6
        while t < 1.25:
            k.add(torus_xy(0.078, 0.012, 3, 10), Dk, 0, Y, t, ink=0)
            t += 0.16
        k.beam((0, Y, 1.25), (0, Y, 1.95), 0.035, GUN, ink=0.012, seg=6)
        k.beam((0, Y, 1.95), (0, Y, 2.12), 0.055, Dk, ink=0.012, seg=8)
        k.box(0.04, 0.08, 0.04, Dk, 0, Y + 0.02, 1.85, ink=0)  # front sight, on the barrel
        for sd in (-1, 1):
            k.beam((sd * 0.08, Y - 0.08, -0.65), (sd * 0.14, Y - 0.08, -0.88), 0.025, Dk, ink=0.01)
        k.beam((-0.14, Y - 0.08, -0.88), (0.14, Y - 0.08, -0.88), 0.025, Dk, ink=0.01)
        k.box(0.32, 0.26, 0.22, T(0x5A6A48), -0.31, Y - 0.2, 0.0, ink=0.015)
        k.box(0.12, 0.04, 0.2, T(0xC9A227), -0.17, Y - 0.04, 0.0, rz=0.5, ink=0)
        for sd in (-1, 1):
            k.box(0.42, 0.75, 0.05, T(S.panel), sd * 0.33, PH - 0.2, 0.62, ink=0.015)
        k.box(1.08, 0.2, 0.05, T(S.panel), 0, PH + 0.55, 0.62, ink=0.015)
        for sd in (-1, 1):
            k.beam((sd * 0.155, PH + 0.18, 0.1), (sd * 0.3, PH + 0.18, 0.6), 0.025, Dk, ink=0.01)
        k.box(0.9, 0.35, 0.6, T(0x8A8698), 0, F, -1.1, ink=0.02)
        k.column(0.2, Y + 0.2, 0, 0)


def rover(k, x, z, ry):
    """a six-wheeled patrol rover in the owner's colours, facing local +z"""
    with k.within(x, z, ry):
        k.box(2.8, 1.3, 5.6, T(S.body), 0, 0.9, 0, ink=0.06)
        k.box(2.6, 1.0, 2.0, T(S.body), 0, 2.2, 0.8, ink=0.05)
        k.box(2.4, 0.7, 0.08, GLASS(GLASSC, 0.6), 0, 2.4, 1.82, ink=0.02)
        k.box(2.82, 0.3, 5.62, T(S.trim), 0, 1.6, 0, ink=0)
        for sx in (-1, 1):
            for sz in (-2, 0, 2):
                k.add(cylinder(0.6, 0.6, 0.5, 12), T(TYRE), sx * 1.5, 0.6, sz, rz=math.pi / 2, ink=0.03)
        k.box(0.8, 0.4, 0.2, G(WARM), -0.8, 1.6, 2.81, ink=0)
        k.box(0.8, 0.4, 0.2, G(WARM), 0.8, 1.6, 2.81, ink=0)
        k.solid(1.5, 1.1, 2.9, 0, 0)
        k.solid(1.3, 0.5, 1.0, 0, 0.8, 0, 2.2)


def lattice(k, x, z, h, w0, w1, bays, leg_m, brace_m, r=0.22, core=True):
    """settlements.js lattice: a square tapering lattice tower (legs, X bracing and a ring each bay); core: its two stepped
    cylinder colliders"""
    cn = ((-1, -1), (1, -1), (1, 1), (-1, 1))
    hw = lambda y: w0 + (w1 - w0) * (y / h)
    for sx, sz in cn:
        k.beam((x + sx * w0, 0, z + sz * w0), (x + sx * w1, h, z + sz * w1), r, leg_m, ink=0.05, seg=6)
    for i in range(bays):
        y0, y1 = h * i / bays, h * (i + 1) / bays
        a, b = hw(y0), hw(y1)
        for f in range(4):
            (ax, az), (bx, bz) = cn[f], cn[(f + 1) % 4]
            k.beam((x + ax * a, y0, z + az * a), (x + bx * b, y1, z + bz * b), r * 0.4, brace_m, ink=0.02, seg=4)
            k.beam((x + bx * a, y0, z + bz * a), (x + ax * b, y1, z + az * b), r * 0.4, brace_m, ink=0.02, seg=4)
            k.beam((x + ax * b, y1, z + az * b), (x + bx * b, y1, z + bz * b), r * 0.5, leg_m, ink=0.02, seg=4)
    if core:
        k.column(max(w0, hw(h / 2)) * 1.15 + r, h / 2, x, z)
        k.column(hw(h / 2) * 1.15 + r, h, x, z, h / 2)


def quonset(k, x, z, r, length, color, yaw, trim):
    """settlements.js quonset: a half-round hut on a concrete pad, lit end wall with its door"""
    with k.within(x, z, yaw):
        k.box(r * 2 + 1, 0.4, length + 1, T(CONC), 0, 0, 0, ink=0.04)
        k.add(cylinder_arc(r, r, length, 18, math.pi / 2, math.pi), D(color), 0, 0.4, 0, rx=math.pi / 2, ink=0.12)
        t = -length / 2 + 1
        while t < length / 2:
            k.add(torus_xy(r + 0.05, 0.12, 4, 18, math.pi), T(PANEL), 0, 0.4, t, ink=0)
            t += 3
        k.add(torus_xy(r + 0.08, 0.25, 4, 18, math.pi), T(trim), 0, 0.4, length / 2 - 0.5, ink=0)
        k.add(circle_xy(r, 18, 0, math.pi), T(LIGHT), 0, 0.4, length / 2, ink=0)
        k.add(circle_xy(r, 18, 0, math.pi), T(LIGHT), 0, 0.4, -length / 2, ry=math.pi, ink=0)
        k.box(r * 0.8, r * 0.75, 0.2, T(0x2A2540), 0, 0.4, length / 2 + 0.1, ink=0.02)  # (on the end wall, not through it)
        for s in (-1, 1):
            k.add(cylinder(0.35, 0.35, 0.1, 10), G(WARM), s * r * 0.6, r * 0.6, length / 2 + 0.06, rx=math.pi / 2, ink=0)
        k.box(0.6, 0.25, 0.3, G(WARM), 0, r * 0.75 + 0.6, length / 2 + 0.15, ink=0)
        k.solid(r + 0.5, 0.2, length / 2 + 0.5, 0, 0)
        k.hcyl(r + 0.1, length, 0, 0, 0, 0.4)


def mystery_crates(k, x, z, yaw):
    """the kiosk's raid loot: purple crates marked '?'"""
    with k.within(x, z, yaw):
        for cx, cy, cz, s, ry in ((-0.7, 0, 0, 1.2, 0.2), (0.65, 0, 0.1, 1.1, -0.3), (0, 1.15, 0.05, 1.0, 0.5)):
            crate(k, cx, F + cy, cz, s, 0x7B2FF7, ry)
            k.text("?", cx + math.sin(ry) * (s / 2 + 0.01), F + cy + s * 0.5, cz + math.cos(ry) * (s / 2 + 0.01), ry, s * 0.62, fg="#ff2e88", bg="#2a1240", back=False, off=0.02)


def hover_cart(k, x, z, ry, rr):
    """a hover-cart (Meridian trade runabout) with a load of crates"""
    with k.within(x, z, ry):
        k.box(2.6, 1.0, 4.8, T(YEL), 0, 0.8, 0, ink=0.06)
        k.box(2.62, 0.24, 4.82, T(S.trim), 0, 1.3, 0, ink=0)
        k.box(2.3, 0.7, 1.3, T(YEL), 0, 1.05, 2.6, rx=0.5, ink=0.04)
        k.box(1.6, 0.9, 1.0, T(DARK), 0, 1.8, 0.8, ink=0.03)
        k.solid(0.8, 0.45, 0.5, 0, 0.8, 0, 1.8)
        k.solid(1.15, 0.4, 0.55, 0, 2.75, 0, 0.8)
        k.box(1.9, 0.8, 0.08, GLASS(GLASSC, 0.5), 0, 1.77, 1.46, rx=-0.4, ink=0.02)  # (leaning back: foot on the deck, top on the cab)
        crate(k, -0.45, 1.8, -1.3, 1.0, 0x9A6A3A, 0.2)
        crate(k, 0.55, 1.8, -1.5, 0.85, 0x2B59C3, -0.3)
        for sx in (-1, 1):
            for sz in (-1, 1):
                k.cyl(0.5, 0.55, 0.28, 10, T(DARK), sx * 1.05, 0.5, sz * 1.75, ink=0.02)
                k.cyl(0.45, 0.45, 0.05, 10, G(0x2EE6FF), sx * 1.05, 0.45, sz * 1.75, ink=0)
        k.solid(1.3, 0.75, 2.4, 0, 0, 0, 0.3)


def stall(k, x, z, ry, awn, rr, sc=1.3):
    """a market stall facing local +z: counter, posts, striped awning, goods"""
    with k.within(x, z, ry, sc):
        # posts under the awning's ends, each cut to its underside (the awning slopes down to the front: +0.28 about x)
        under = lambda z: F + 3.09 - (z - 0.4) * math.tan(0.28) - 0.04 / math.cos(0.28)
        for sx in (-1, 1):
            for pz in (-0.85, 1.2):
                k.box(0.14, under(pz) - F, 0.14, T(WOOD), sx * 1.9, F, pz, ink=0.02)
        k.box(3.8, 1.0, 1.2, T(WOOD), 0, F, 0.5, ink=0.04)
        k.box(3.82, 0.4, 0.05, T(awn), 0, F + 0.5, 1.11, ink=0)
        for i in range(5):
            k.box(0.78, 0.08, 2.9, T(0xFFFFFF if i % 2 else awn), -1.6 + i * 0.8, F + 3.05, 0.4, rx=0.28, ink=0.02)
        k.solidQ(1.95, 0.06, 1.45, 0, F + 3.09, 0.4, euler(0.28, 0, 0))
        for j in range(6):
            r0 = 0.17 + rr() * 0.1
            ball = j % 3
            col = (0xFF4F2E, YEL, 0x7DFF3A, 0xFF7AD9, 0xFF9F1C, 0x2EC4FF)[math.floor(rr() * 6)]
            gz = 0.5 + (rr() - 0.5) * 0.5
            k.add(sphere(r0, 6, 4) if ball else cuboid(0.36, 0.3, 0.36), T(col), -1.4 + j * 0.56, F + 1.0 + (r0 * 0.85 if ball else 0.15), gz, ink=0.02)
        crate(k, 2.6, F, -0.6, 1.0, 0x9A6A3A, 0.3)
        k.solid(1.9, (F + 1.0) / 2, 0.6, 0, 0.5)


def tank(k, x, z, r, h, color, band):
    """a standing tank with a domed top and two bands"""
    k.cyl(r, r, h, 16, T(color), x, F, z, ink=0.08)
    k.add(sphere(r, 16, 6, math.pi / 2), T(color), x, F + h, z, ink=0.06)
    for f in (0.72, 0.62):
        k.ring(r + 0.05, 0.16, T(band), x, F + h * f, z)
    k.column(r, F + h + r * 0.7, x, z)


def bund(k, x, z, w, d, ry):
    """a low bund wall round a tank farm, a gap at the front"""
    with k.within(x, z, ry):
        for ln, px, pz, rot in ((w, 0, -d / 2, 0), (d, -w / 2, 0, 1), (d, w / 2, 0, 1), (w / 2 - 1.5, -w / 4 - 0.75, d / 2, 0), (w / 2 - 1.5, w / 4 + 0.75, d / 2, 0)):
            k.box(0.5 if rot else ln, 1.0, ln if rot else 0.5, T(S.conc), px, F, pz, ink=0.04)
            k.solid(0.25 if rot else ln / 2, (F + 1) / 2, ln / 2 if rot else 0.25, px, pz)
        for i in range(9):  # (on the wall tops, not over the gap)
            bx = -w / 2 + 1 + i * (w - 2) / 8
            if abs(bx) > 1.6:
                k.box(0.4, 0.02, 0.5, T(YEL), bx, F + 1.0, d / 2, ink=0)


def hauler(k, x, z, ry):
    """a bulk hauler truck (cab forward, hopper behind), facing local +z"""
    with k.within(x, z, ry):
        k.box(3.0, 1.0, 10, T(S.dark), 0, 0.9, 0, ink=0.05)
        k.box(2.8, 2.6, 2.6, T(S.trim), 0, 1.6, 3.6, ink=0.06)
        k.box(2.5, 0.9, 0.08, GLASS(GLASSC, 0.6), 0, 3.0, 4.92, ink=0.02)
        k.add(place(cylinder(2.0, 1.2, 2.4, 4), Matrix.Diagonal((1, 1, 1.8, 1)) @ Matrix.Rotation(math.pi / 4, 4, "Y")), T(S.body), 0, 3.1, -2, ink=0.06)
        for sx in (-1, 1):
            for sz in (-3.4, -1.4, 3.6):
                k.add(cylinder(0.75, 0.75, 0.6, 12), T(TYRE), sx * 1.5, 0.75, sz, rz=math.pi / 2, ink=0.03)
        k.solid(1.5, 2.15, 5, 0, 0)


def solar_rows(k, x, z, rows, cols):
    """rows of solar tables facing +z: tilted panels on front and back posts, each cut to the panel's underside"""
    tilt, pd, pw, th = 0.45, 2.4, 3.4, 0.12
    for r2 in range(rows):
        for ci in range(cols):
            px, pz, cy = x + (ci - (cols - 1) / 2) * (pw + 0.4), z + (r2 - (rows - 1) / 2) * 4.2, F + 1.9
            k.add(cuboid(pw, th, pd), T(0x2B3A8F), px, cy, pz, rx=tilt, ink=0.03)
            k.add(cuboid(pw + 0.02, 0.02, 0.06), T(LIGHT), px, cy + th / 2 * math.cos(tilt) + 0.01, pz, rx=tilt, ink=0)
            for zz in (-0.8, 0.8):
                under = cy - zz * math.tan(tilt) - (th / 2) / math.cos(tilt)
                for sx in (-1.3, 1.3):
                    k.box(0.1, under - F, 0.1, T(STEEL), px + sx, F, pz + zz, ink=0)
            k.solidQ(pw / 2, th / 2 + 0.03, pd / 2, px, cy, pz, euler(tilt, 0, 0))


def pipe_run(k, pts, y, r=0.3, color=0xD8D4E8):
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        k.beam((a[0], F + y, a[1]), (b[0], F + y, b[1]), r, T(color), ink=0.03, seg=8)
        k.ball(r * 1.3, T(color), b[0], F + y, b[1], ink=0)
        ln = math.hypot(b[0] - a[0], b[1] - a[1])
        t = 2
        while t < ln:
            px, pz = a[0] + (b[0] - a[0]) * t / ln, a[1] + (b[1] - a[1]) * t / ln
            k.box(0.5, y - r, 0.2, T(STEEL), px, F, pz, ry=math.atan2(b[0] - a[0], b[1] - a[1]), ink=0)
            t += 4
