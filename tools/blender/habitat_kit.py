# Shared kit for the ILMB's Kepler Habitat: build_habitat.py (the Orrery, in the game) and the Spiral Street proposal
# (proposals/habitat_b.py). The slot palette, an accumulator that merges parts per slot, swept sections, framed boxes,
# railings, trees, benches, lamps, solar panels and the Kepler orbit mark. exec() it with REPO and COLL set; it execs kit.py.
#
# three.js axes (x right, y up, +z forward), metres, origin on the ground in the middle of the footprint. The ILMB wing frame
# (world.js wing()): +x away from the hub, -x faces the skywalk, which docks at floor 0.6 m, 5.6 m wide. Angles here are
# theta in the ground plane, (x, z) = (cos theta, sin theta) * r, so theta = pi is the skywalk side.

import bpy, bmesh, math, os
from mathutils import Vector, Matrix

PI = math.pi
TAU = 2 * PI


def S(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# preview colours, as the game's toon / glow would draw them (Kepler: orange 0xff9f1c, cream 0xfff4e0, green 0x6a8f3a)
HEX = {
    "wall": 0xfff4e0, "trim": 0xff9f1c, "accent": 0x6a8f3a, "panel": 0x5b5870, "roof": 0x3a3550, "dark": 0x2a2540,
    "metal": 0x8a87a0, "steel": 0x55607a, "concrete": 0xb8b2cc, "pave": 0x9d97b0, "stone": 0x6f6878, "lawn": 0x3ad15a,
    "leaf": 0x1f8a3a, "leaf2": 0x5cc94a, "bark": 0x6b4a2a, "path": 0xd8c9a8, "wood": 0x8a5a3a, "solar": 0x1d2f6b,
    "mint": 0xb8ffb0, "sky": 0x9be7ff, "butter": 0xffe08a, "coral": 0xff8a6a, "peach": 0xffc48a, "lilac": 0xd7c4ff,
    "door": 0x2a2540, "hazard": 0xffd23f,
    # glow
    "window": 0xfff6a8, "lamp": 0xfff6a8, "beacon": 0xff9f1c, "water": 0x5ad8ff, "glass": 0x9be7ff, "portal": 0xbfefff,
}
GLOW_SLOTS = {"window": 2.2, "lamp": 5.0, "beacon": 6.0, "water": 1.6, "portal": 1.4}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()


def mesh_raw(name, geo, slot, parent, ink=0.04, sharp=SHARP):
    """kit.mesh() that keeps the given winding (faces counter-clockwise seen from outside, three.js axes): for open sweeps,
    where recalculating normals has no inside to go by."""
    verts, faces = geo
    me = bpy.data.meshes.new(name)
    me.from_pydata([tb(v) for v in verts], [], faces)
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    for f in bm.faces:
        f.smooth = sharp != 0
    if sharp:
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > sharp:
                e.smooth = False
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    C.objects.link(o)
    o.parent = parent
    me.materials.append(material(slot))
    o["ink"] = ink
    o["slot"] = slot
    return o


class Acc:
    """Parts merged per (slot, ink, parent): one mesh each at flush. raw=True keeps the winding (open sweeps); parent puts the
    mesh under a pivot (built in its frame) instead of flush_all's."""
    all = {}

    @classmethod
    def of(cls, slot, ink=0.02, raw=False, sharp=SHARP, parent=None):
        k = (slot, ink, raw, sharp, parent.name if parent else "")
        if k not in cls.all:
            cls.all[k] = cls(slot, ink, raw, sharp, parent)
        return cls.all[k]

    def __init__(self, slot, ink, raw, sharp, parent):
        self.slot, self.ink, self.raw, self.sharp, self.parent, self.geos = slot, ink, raw, sharp, parent, []

    def put(self, geo):
        self.geos.append(geo[:2])
        return self


def flush_all(parent, prefix):
    made = []
    for i, ((slot, ink, raw, sharp, _), a) in enumerate(sorted(Acc.all.items(), key=lambda kv: (kv[0][4], kv[0][0], kv[0][1], kv[0][2]))):
        if not a.geos:
            continue
        name = f"{prefix}{slot}_{i}"
        g = join(a.geos)
        made.append((mesh_raw if raw else mesh)(name, g, slot, a.parent or parent, ink, sharp))
    Acc.all.clear()
    return made


# ---------------- geometry ----------------

def box(cx, cy, cz, w, h, d, rot=(0, 0, 0)):
    return xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot)


def cyl(cx, cy, cz, r, h, seg=12, rt=None, rot=(0, 0, 0)):
    return xf(cylinder(r if rt is None else rt, r, h, seg)[:2], (cx, cy, cz), rot)


def ball(cx, cy, cz, r, w=10, h=7, s=(1, 1, 1)):
    return xf(sphere(r, w, h)[:2], (cx, cy, cz), (0, 0, 0), s)


def ring(R, r, y=0.0, n=32, rs=6, rot=(0, 0, 0), t=(0, 0, 0)):
    g = xf(torus(R, r, n, rs), (0, 0, 0), rot)
    return xf(g, (t[0], t[1] + y, t[2]))


def frame_box(o, tx, wy, nz, u0, u1, v0, v1, d0, d1):
    """A box in the frame (o; tx, wy, nz): u along tx, v along wy, d along nz."""
    o, tx, wy, nz = Vector(o), Vector(tx), Vector(wy), Vector(nz)
    verts, faces, _ = cuboid(u1 - u0, v1 - v0, d1 - d0)
    cu, cv, cd = (u0 + u1) / 2, (v0 + v1) / 2, (d0 + d1) / 2
    out = [tuple(o + tx * (cu + x) + wy * (cv + y) + nz * (cd + z)) for x, y, z in verts]
    if tx.cross(wy).dot(nz) < 0:
        faces = [tuple(reversed(f)) for f in faces]
    return out, faces


def sector(profile, a0, a1, segs, cap=True, rscale=None):
    """A closed section [(r, y)] swept round the y axis from theta a0 to a1 (a full turn wraps). rscale(theta) scales r
    (a polygon ring's facets lie at r cos(half step) / cos(offset)). Winding is fixed later by mesh()."""
    full = abs(a1 - a0) >= TAU - 1e-9
    cols = segs if full else segs + 1
    n = len(profile)
    verts = []
    for i in range(cols):
        t = a0 + (a1 - a0) * i / segs
        k = rscale(t) if rscale else 1.0
        for r, y in profile:
            verts.append((math.cos(t) * r * k, y, math.sin(t) * r * k))
    faces = []
    for i in range(segs):
        i2 = (i + 1) % cols
        for j in range(n):
            j2 = (j + 1) % n
            faces.append((i * n + j, i * n + j2, i2 * n + j2, i2 * n + j))
    if cap and not full:
        faces.append(tuple(range(n)))
        faces.append(tuple((cols - 1) * n + j for j in range(n)))
    return verts, faces


def strip(rows, hint):
    """Quads between consecutive rows of points (each row a list of 3D points, same length), each face turned so its normal
    agrees with hint(centre) -> vector. For open sweeps (walls, ramps) drawn with mesh_raw."""
    verts, faces = [], []
    n = len(rows[0])
    for row in rows:
        verts.extend(row)
    for i in range(len(rows) - 1):
        for j in range(n - 1):
            q = [i * n + j, (i + 1) * n + j, (i + 1) * n + j + 1, i * n + j + 1]
            P = [Vector(verts[k]) for k in q]
            nrm = (P[2] - P[0]).cross(P[3] - P[1])
            c = sum(P, Vector()) / 4
            if nrm.dot(Vector(hint(c))) < 0:
                q.reverse()
            faces.append(tuple(q))
    return verts, faces


def path_tube(pts, r, seg=4):
    return tube(pts, [r] * len(pts), seg, cap=True)


# ---------------- furniture ----------------

def railing(rail, post, pts, up=(0, 1, 0), every=1.5, h=1.1, knee=0.55, r=0.05):
    """A handrail along base points pts (top rail at h, knee rail, posts at most `every` apart)."""
    U = Vector(up)
    top = [tuple(Vector(p) + U * h) for p in pts]
    mid = [tuple(Vector(p) + U * knee) for p in pts]
    rail.put(path_tube(top, r)).put(path_tube(mid, r * 0.8))
    acc, last = 0.0, None
    for i, p in enumerate(pts):
        P = Vector(p)
        if last is not None:
            acc += (P - last).length
        if i == 0 or i == len(pts) - 1 or acc >= every:
            post.put(B(tuple(P - U * 0.05), tuple(P + U * (h + 0.04)), r * 0.9, 4, cap=True))
            acc = 0.0
        last = P


def tree(bark, crown, x, z, y=0.0, h=1.0, kind="ball"):
    bark.put(cyl(x, y + 0.8 * h, z, 0.22 * h, 1.6 * h, 6, rt=0.16 * h))
    if kind == "cone":
        crown.put(cyl(x, y + 3.0 * h, z, 1.35 * h, 3.4 * h, 8, rt=0.0))
    else:
        crown.put(ball(x, y + 2.9 * h, z, 1.45 * h, 9, 6))


def bench(wood, leg, x, z, yaw, y=0.0):
    M = lambda g: xf(g, (x, y, z), (0, yaw, 0))
    wood.put(M(xf(cuboid(2.2, 0.12, 0.6)[:2], (0, 0.5, 0))))
    wood.put(M(xf(cuboid(2.2, 0.5, 0.1)[:2], (0, 0.85, -0.28), (-0.15, 0, 0))))
    for sx in (-0.85, 0.85):
        leg.put(M(xf(cuboid(0.12, 0.46, 0.56)[:2], (sx, 0.22, 0))))


def lamp_post(post, head, x, z, y=0.0, h=4.2):
    post.put(cyl(x, y + h / 2, z, 0.11, h, 6, rt=0.08))
    post.put(cyl(x, y + 0.2, z, 0.3, 0.4, 8))
    head.put(ball(x, y + h + 0.3, z, 0.38, 8, 6))


def solar_panel(frame, cells, post, cx, cy, cz, yaw, w=4.6, d=3.0, tilt=0.35, h=0.9):
    """A panel on two posts: frame and cells tilted about its long axis (x before yaw), the cells 2 cm proud of the frame."""
    T = Matrix.Translation(Vector((cx, cy + h, cz))) @ Matrix.Rotation(yaw, 4, "Y") @ Matrix.Rotation(tilt, 4, "X")

    def tr(g):
        v, f = g
        return [tuple(T @ Vector(p)) for p in v], f
    frame.put(tr(cuboid(w, 0.1, d)[:2]))
    cells.put(tr(xf(cuboid(w - 0.25, 0.04, d - 0.25)[:2], (0, 0.06, 0))))
    for sx in (-w * 0.32, w * 0.32):
        base = Matrix.Translation(Vector((cx, cy, cz))) @ Matrix.Rotation(yaw, 4, "Y")
        a, b = base @ Vector((sx, -0.05, 0)), T @ Vector((sx, -0.04, 0))
        post.put(B(tuple(a), tuple(b), 0.08, 4, cap=True))


def orbit_mark(ringacc, planet, cx, cy, cz, R, tube_r, tilt, yaw, planet_r, planet_t=0.6):
    """The Kepler mark in the round: a tilted orbit ring with a planet on it (decals.py draws it flat on the cargo)."""
    rot = Matrix.Rotation(yaw, 4, "Y") @ Matrix.Rotation(tilt, 4, "X")
    v, f = torus(R, tube_r, 48, 8)
    ringacc.put(([tuple(Vector((cx, cy, cz)) + (rot @ Vector(p).to_4d()).to_3d()) for p in v], f))
    p = rot @ Vector((math.sin(planet_t) * R, 0, math.cos(planet_t) * R, 1))
    planet.put(ball(cx + p.x, cy + p.y, cz + p.z, planet_r, 12, 8))
    return [Vector((cx, cy, cz)) + (rot @ Vector((math.sin(a) * R, 0, math.cos(a) * R, 1))).to_3d() for a in (0.0, TAU / 3, 2 * TAU / 3)]


def tri_count(objs):
    n = 0
    for o in objs:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            n += len(o.data.loop_triangles)
    return n
