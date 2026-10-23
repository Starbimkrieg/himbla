# Shared set-up for the chimera kit (build_chimera.py and the per-family chimera_*.py it execs): the palette, the primitives, the fusing
# pipeline, fitting the mutations to a part's own surface, and the far LOD. Exec'd into the builder's globals after REPO is set.
#
# How a part is made, so it holds up close and outlines cleanly:
#   - fused: each colour region is built from overlapping primitives, then voxel-remeshed into ONE watertight surface (Remesh, voxel
#     size VOX), smoothed (Smooth) and decimated to its triangle budget (Decimate): one mesh, one outline, organic joins
#   - cut in, not laid on: sockets, recesses, grooves, rivet and bolt holes are Boolean differences in the surface; a cut part's outline is
#     drawn from its surface before the cuts (an `inkonly` copy, never drawn itself), so a groove reads as a dent, not a black line
#   - joints built in: a body ends at its base in a skirt that wraps down over the legs, a head in a stub that goes down into the body
#   - mutations fitted: armour plates shrinkwrapped onto the part's surface (Shrinkwrap, Solidify, rivets cut in), crystal clusters rooted in
#     it and mud caked on it, found by ray casting; each in an empty with role `mut` (extra `mut`) under the pivot it moves with. The
#     devices (spark, turbo, radio, lens) are shared pieces the builder puts on sockets fitted to the surface here.
import math, os, random


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# Slots. Hides (vertex-coloured by the builder, so they shade into their neighbours): each kind's own (person, pirate, alien, junkbot,
# mite, car, sapling), trousers, skin. Tinted per chimera: helmet, glove, shirt, tie, hair, shoe, tunic, glass (a visor), gem. The rest
# are fixed; glass, eye, lamp, red, crystal, spark, voidglow, ember, tip, screen, pixel and gem are lit; bowl is a fishbowl's glass.
HEX = {
    "person": "2b8f6a", "pirate": "3a2b4f", "alien": "7dd87a", "junkbot": "ffb347", "mite": "b8e986", "car": "ff7ad9", "sapling": "6f8a3a",
    "trousers": "3a3550", "skin": "f1c27d",
    "helmet": "f3eee4", "glove": "e8e4f0", "shirt": "fff4e0", "tie": "d7263d", "hair": "4a2c17", "shoe": "6b4a2a", "tunic": "2b59c3",
    "dark": "2a2540", "steel": "55607a", "metal": "8a87a0", "chrome": "d8d4e8", "tire": "1d1a29", "boot": "3a3550", "sole": "221d33",
    "belt": "2a2540", "gold": "ffd23f", "brass": "d9a441", "bark": "6b4a2a", "moss": "3f7a34", "leaf": "5fbf4a", "pine": "2f6b3a",
    "petal": "ff7ad9", "blossom": "ffc2e2", "cap": "ff3b5c", "stem": "fff4e0", "stonebark": "8c8798", "vest": "5b6b4a", "mud": "6b4a2a",
    "leather": "6b4a2a", "pouch": "8a6a3a", "cream": "fff4e0", "scarf": "d7263d", "patch": "7a2f3a", "sash": "ffd23f", "wrap": "8a6a3a",
    "rust": "a0522d", "bowl": "cfefff",
    "glass": "9be7ff", "eye": "ff2e88", "lamp": "fff6a8", "red": "ff2a4a", "crystal": "2ee6ff", "spark": "ffb347", "voidglow": "a86bff",
    "ember": "ff6a2a", "tip": "fff27a", "screen": "123a3a", "pixel": "7dff6a", "gem": "7dff3a",
    "inkonly": "000000",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
from mathutils import Vector, Quaternion, Matrix
from mathutils.bvhtree import BVHTree
C = coll()
VOX = 0.0065                       # voxel size of the fusing remesh (a 6.5 mm grid: the parts are 0.3 to 0.7 m)
INK_SOURCE = 0.45                  # an outline source's budget, as a share of its part's (the outline only has to hold the silhouette)
FAMILY = {"person": "human", "pirate": "human", "alien": "human", "mite": "mite", "car": "car", "junkbot": "car", "sapling": "sapling"}
T3B = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))     # three.js axes -> Blender's (tb)


# ---------------- primitives (three.js axes) ----------------
def ell(rx, ry, rz, t=(0, 0, 0), r=(0, 0, 0), n=14):
    return xf(superquad(rx, ry, rz, 1, 1, n, n // 2 + 2), t, r)


def soft(w, h, d, t=(0, 0, 0), r=(0, 0, 0), e=0.3, n=16):
    return xf(superquad(w / 2, h / 2, d / 2, e, e, n, max(8, n * 5 // 8)), t, r)


def box(w, h, d, t=(0, 0, 0), r=(0, 0, 0)):
    return xf(cuboid(w, h, d)[:2], t, r)


def cyl(r0, r1, h, t=(0, 0, 0), r=(0, 0, 0), seg=16):
    return xf(cylinder(r0, r1, h, seg)[:2], t, r)


def ring(R, r, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1), seg=24, rseg=8):
    return xf(torus(R, r, seg, rseg), t, rot, s)


def capsule(a, b, r0, r1=None, seg=12):
    """a tube from a to b, a sphere at each end (fusing makes it one smooth limb)"""
    r1 = r0 if r1 is None else r1
    return join([tube([a, b], [r0, r1], seg, cap=True), ell(r0, r0, r0, a, n=12), ell(r1, r1, r1, b, n=12)])


def chain(pts, radii, seg=12):
    return join([capsule(pts[i], pts[i + 1], radii[i], radii[i + 1], seg) for i in range(len(pts) - 1)])


def turn_to(d):
    d = Vector(d).normalized()
    return d.to_track_quat("Z", "Y" if abs(d.y) < 0.98 else "X")


def ell_between(a, b, rw, rt, roll=0.0, n=14):
    """an ellipsoid from a to b (a leaf, a petal, a wing): rw across, rt thick"""
    a, b = Vector(a), Vector(b)
    g = superquad(rw, rt, (b - a).length / 2, 1, 1, n, n // 2 + 2)
    m = (turn_to(b - a) @ Quaternion((0, 0, 1), roll)).to_matrix()
    mid = (a + b) / 2
    return [tuple(m @ Vector(v) + mid) for v in g[0]], g[1]


def along(g, d, t=(0, 0, 0), roll=0.0):
    """g (built along +y) turned to point along d, its origin moved to t"""
    m = (Vector((0, 1, 0)).rotation_difference(Vector(d).normalized()) @ Quaternion((0, 1, 0), roll)).to_matrix()
    return [tuple(m @ Vector(v) + Vector(t)) for v in g[0]], g[1]


def shard(r, h, t, d):
    """a six-sided crystal with a point at each end, its foot at t, growing along d"""
    return along(lathe([(0, 0), (r, 0.12 * h), (r * 0.9, 0.72 * h), (0, h)], 6), d, t)


def mirror_x(g):
    return xf(g, s=(-1, 1, 1))


# ---------------- the fusing pipeline ----------------
def apply_mods(o):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    o.modifiers.clear()
    old = o.data
    o.data = me
    bpy.data.meshes.remove(old)


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def smooth_shade(o, sharp=50):
    """smooth, but creased where faces meet at more than `sharp` degrees (the rims of the cuts)"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(sharp):
            e.smooth = False
    bm.to_mesh(o.data)
    bm.free()


def decimate(o, budget):
    n = tris(o)
    if n > budget:
        d = o.modifiers.new("dc", "DECIMATE")
        d.ratio = max(0.01, budget / n)
        apply_mods(o)


def fused(name, geo, slot, parent, ink, budget, cuts=(), smooth=5, vox=VOX, remesh=True):
    """one watertight surface from overlapping primitives (remesh=False: as built, for a lathed tyre or hub), the cuts taken out of it,
    decimated to `budget` triangles; a cut part's outline comes from an `inkonly` copy made before the cuts"""
    o = mesh(name, geo, slot, parent, ink, sharp=0 if remesh else math.radians(38))
    if remesh:
        r = o.modifiers.new("rm", "REMESH")
        r.mode, r.voxel_size, r.adaptivity = "VOXEL", vox, 0.0
        if smooth:
            s = o.modifiers.new("sm", "SMOOTH")
            s.factor, s.iterations = 0.6, smooth
        apply_mods(o)
    if cuts and ink > 0:
        k = o.copy()
        k.data = o.data.copy()
        k.name = name + "_ink"
        C.objects.link(k)
        k.data.materials.clear()
        k.data.materials.append(material("inkonly"))
        k["slot"] = "inkonly"
        decimate(k, max(60, int(budget * INK_SOURCE)))
        k.data.validate()
        o["ink"] = 0
        o["ink_far"] = ink                                   # (the far LOD drops the copy and outlines the part itself)
    for g in cuts:
        cut(o, g)
    decimate(o, budget)
    o.data.validate()
    smooth_shade(o, 50 if remesh else 38)
    return o


def cut(o, geo):
    """a Boolean difference: geo (in o's frame) taken out of o"""
    c = mesh(o.name + "_cutter", geo, o.data.materials[0].name, o.parent, 0, sharp=0)
    b = o.modifiers.new("cut", "BOOLEAN")
    b.operation, b.object, b.solver = "DIFFERENCE", c, "EXACT"
    apply_mods(o)
    me = c.data
    bpy.data.objects.remove(c)
    bpy.data.meshes.remove(me)


def plain(name, geo, slot, parent, ink, smooth=True):
    """a piece that is not fused (lenses, glass, crystal): as built, smooth or faceted"""
    return mesh(name, geo, slot, parent, ink, sharp=None if smooth else math.radians(38))


def orient(e, n, roll=0.0):
    """turn an empty so its +y (three.js axes) points along n"""
    q = Vector((0, 1, 0)).rotation_difference(Vector(n).normalized())
    if roll:
        q = q @ Quaternion((0, 1, 0), roll)
    e.rotation_mode = "QUATERNION"
    e.rotation_quaternion = (T3B @ q.to_matrix() @ T3B.transposed()).to_quaternion()


def socket(root, name, pos, lean=0.0, tilt=0.0, **props):
    """a socket; lean turns it about z (three.js axes: + leans its top toward -x), tilt about x"""
    e = pivot(f"{root.name}_{name}", pos, root, role="socket", socket=name, **props)
    e.rotation_euler = (tilt, -lean, 0)              # (three.js z is Blender's -y)
    return e


def mount(root, name, target, p, n, roll=0.0):
    """a device socket on the target's surface: found by casting from outside along n toward p; its +y is the surface's normal there"""
    H = hit(target, p, n)
    c, nn = H if H else (Vector(p), Vector(n).normalized())
    e = pivot(f"{root.name}_{name}", tuple(c), root, role="socket", socket=name)
    orient(e, nn, roll)
    return e


def lens_at(root, pos, n=(0, 0, 1)):
    """the lens's socket: at the eye, looking out along n"""
    e = pivot(f"{root.name}_lens", pos, root, role="socket", socket="lens")
    orient(e, n)
    return e


def point(parent, name, pos, normal, tag, size=1.0):
    """an attachment point (role graft): where the spark's arcs crackle"""
    n = Vector(normal).normalized()
    return pivot(f"{parent.name}_g{name}", pos, parent, role="graft", tag=tag, size=size, nx=n.x, ny=n.y, nz=n.z)


def forms(root, name, common, one, two, slot, ink, budget, cuts=()):
    """a body's main surface in its two forms: with one neck (form 1), and forked for two heads (form 2); returns form 1's (the one the
    mutations are fitted to)"""
    f1 = pivot(f"{root.name}_form1", (0, 0, 0), root, role="form", form=1)
    f2 = pivot(f"{root.name}_form2", (0, 0, 0), root, role="form", form=2)
    a = fused(name, join(common + one), slot, f1, ink, budget, cuts)
    fused(name + "_twin", join(common + two), slot, f2, ink, int(budget * 1.1), cuts)
    return a


def extra(root, name, looks):
    """an empty whose pieces show only on some looks (role `extra`, extra `looks`: comma-separated)"""
    return pivot(f"{root.name}_x{name}", (0, 0, 0), root, role="extra", looks=looks)


def parents(o):
    out = []
    while o.parent:
        o = o.parent
        out.append(o)
    return out


# ---------------- fitting the mutations to a part's own surface ----------------
def to_b(v):
    return Vector(tb(tuple(v)))


def from_b(v):
    return Vector((v.x, v.z, -v.y))


def hit(target, p, n, reach=0.3):
    """where a ray from `reach` out along n, coming back in, meets the target's surface (three.js axes, in the target's frame)"""
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(target, dg)
    n = Vector(n).normalized()
    loc, nor, _, _ = bvh.ray_cast(to_b(Vector(p) + n * reach), to_b(-n))
    if loc is None:
        return None
    return from_b(loc), from_b(nor).normalized()


def frame_at(n):
    n = Vector(n).normalized()
    u = Vector((0, 1, 0)).cross(n)
    if u.length < 0.2:
        u = Vector((1, 0, 0)).cross(n)
    u.normalize()
    v = n.cross(u).normalized()
    return u, v, n


def owner(target):
    """the pivot a target's mutations hang under (the part's root for a body's form)"""
    return target.parent.parent if target.parent.get("role") == "form" else target.parent


def mut_group(parent, mut):
    return pivot(f"{parent.name}_mut_{mut}_{len(parent.children)}", (0, 0, 0), parent, role="mut", mut=mut)


def bbox(o):
    vs = [from_b(v.co) for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi


ARMOR = {"car": "metal", "mite": "dark", "sapling": "stonebark", "human": "vest"}


def plate(g, name, target, c, nn, pw, ph, slot, family, spin=0.0, th=None, rivets=True):
    """one plate (pw x ph, turned `spin` in the surface) shrinkwrapped onto the target at c, given thickness, its rivets cut in"""
    u, v, nn = frame_at(nn)
    if spin:
        u, v = u * math.cos(spin) + v * math.sin(spin), v * math.cos(spin) - u * math.sin(spin)
    nu, nv = max(3, min(9, int(pw / 0.03))), max(2, min(7, int(ph / 0.03)))
    verts, faces = [], []
    for b in range(nv + 1):
        for a in range(nu + 1):
            x, y = (a / nu - 0.5) * pw, (b / nv - 0.5) * ph
            if family in ("mite", "human"):                          # rounded: an oval chitin plate, a vest panel with rounded corners
                k = 2 if family == "mite" else 5
                e = abs(2 * x / pw) ** k + abs(2 * y / ph) ** k
                if e > 1:
                    s = e ** (-1 / k)
                    x, y = x * s, y * s
            verts.append(tuple(c + u * x + v * y + nn * 0.01))
    for b in range(nv):
        for a in range(nu):
            i = b * (nu + 1) + a
            faces.append((i, i + 1, i + nu + 2, i + nu + 1))
    o = mesh(name, (verts, faces), slot, g, 0.012, sharp=0)
    o.parent = owner(target)
    th = th or (0.016 if family != "sapling" else 0.024)
    sw = o.modifiers.new("sw", "SHRINKWRAP")
    sw.target, sw.wrap_method, sw.offset = target, "NEAREST_SURFACEPOINT", th / 2 - 0.004   # (the inner face sunk 4 mm into the hide)
    so = o.modifiers.new("so", "SOLIDIFY")
    so.thickness, so.offset = th, 0
    bv = o.modifiers.new("bv", "BEVEL")
    bv.width, bv.segments = 0.003, 1
    apply_mods(o)
    o.parent = g
    if rivets and family in ("car", "human") and pw > 0.07 and ph > 0.05:     # rivet holes, cut into the plate's face
        for (rx, ry) in ((-0.36, -0.36), (0.36, -0.36), (-0.36, 0.36), (0.36, 0.36)):
            cut(o, ell(0.008, 0.008, 0.008, tuple(c + u * (rx * pw) + v * (ry * ph) + nn * 0.03), n=8))
    elif rivets and family == "mite":                               # a ridge groove down the middle of the chitin
        q = c + nn * 0.03
        cut(o, ell_between(tuple(q - v * ph * 0.42), tuple(q + v * ph * 0.42), 0.006, 0.012, n=8))
    smooth_shade(o)
    return o


def armor_plates(target, spots, family):
    """plates shrinkwrapped onto the target's surface at each spot (p, n, w, h)"""
    g = mut_group(owner(target), "armor")
    for k, (p, n, w, h, reach) in enumerate(spots):
        H = hit(target, p, n, reach)
        if not H:
            continue
        c, nn = H
        if family == "sapling":                                     # bark: a few slabs, cracked apart
            u, v, _ = frame_at(nn)
            for j, (ox, oy, pw, ph) in enumerate(((-w * 0.25, -h * 0.2, w * 0.55, h * 0.5), (w * 0.22, h * 0.05, w * 0.5, h * 0.55), (-w * 0.05, h * 0.32, w * 0.45, h * 0.35))):
                H2 = hit(target, c + u * ox + v * oy, nn, 0.1)
                if H2:
                    plate(g, f"{g.name}_p{k}_{j}", target, H2[0], H2[1], pw, ph, ARMOR[family], family, th=0.022 + 0.005 * j)
        else:
            plate(g, f"{g.name}_p{k}", target, c, nn, w, h, ARMOR[family], family)
    return g


def crystal_cluster(target, spots, rng):
    """crystal clusters rooted 4 cm inside the target's surface, growing out along it"""
    g = mut_group(owner(target), "crystal")
    shards = []
    for (p, n, s, reach) in spots:
        H = hit(target, p, n, reach)
        if not H:
            continue
        c, nn = H
        base = c - nn * 0.04
        u, v, _ = frame_at(nn)
        shards.append(shard(0.042 * s, 0.25 * s, tuple(base), tuple(nn)))
        for k in range(3):
            a = k * 2.1 + rng.uniform(-0.4, 0.4)
            d = nn * 1.0 + (u * math.cos(a) + v * math.sin(a)) * rng.uniform(0.45, 0.8)
            shards.append(shard(0.03 * s, rng.uniform(0.13, 0.18) * s, tuple(base + (u * math.cos(a) + v * math.sin(a)) * 0.02 * s), tuple(d)))
    if shards:
        plain(f"{g.name}_shards", join(shards), "crystal", g, 0.008, smooth=False)
    return g


def mud_cakes(target, spots, rng):
    """mud caked on the target: flattened blobs on its surface with a drip or two, fused into one crust"""
    blobs = []
    for (p, n, s, reach) in spots:
        H = hit(target, p, n, reach)
        if not H:
            continue
        c, nn = H
        u, v, _ = frame_at(nn)
        for k in range(3):
            o = c + (u * rng.uniform(-1, 1) + v * rng.uniform(-1, 0.6)) * 0.035 * s
            H2 = hit(target, o, nn, 0.08)
            if not H2:
                continue
            q, qn = H2
            r = rng.uniform(0.035, 0.06) * s
            blobs.append(along(ell(r, 0.014, r * rng.uniform(0.7, 1.2), n=10), qn, tuple(q + qn * 0.004), rng.uniform(0, 6.28)))
        if rng.random() < 0.7:                                       # a drip running down
            down = (Vector((0, -1, 0)) - nn * nn.y).normalized() if abs(nn.y) < 0.95 else u
            a, b = c + down * 0.02 * s, c + down * 0.09 * s
            H3 = hit(target, b, nn, 0.08)
            if H3:
                blobs.append(capsule(tuple(a + nn * 0.004), tuple(H3[0] + H3[1] * 0.004), 0.016 * s, 0.009 * s, seg=8))
    if not blobs:
        return None
    g = mut_group(owner(target), "mud")
    fused(f"{g.name}_crust", join(blobs), "mud", g, 0.01, 260 * len(spots), smooth=3, vox=0.005)
    return g


class Fit:
    """where a part's armour, crystal and mud go, from its pieces' extents: main(t) for a body, hull or skull (plates on its sides, front,
    back and top), limb(t, n) for a leg, arm or root (a plate facing n), plus the crystal and mud each takes"""

    def __init__(self, rng):
        self.rng, self.armor, self.crystal, self.mud = rng, [], [], []

    def main(self, t, faces=("x", "-x", "z", "-z", "y"), crystals=2, mud=0, low=0.4, size=1.0):
        lo, hi = bbox(t)
        c, e = (lo + hi) / 2, (hi - lo) / 2
        R = e.length + 0.15
        dirs = {"x": (1, 0.12, 0), "-x": (-1, 0.12, 0), "z": (0, 0.12, 1), "-z": (0, 0.12, -1), "y": (0, 1, 0)}
        plates = []
        for f in faces:
            if f in ("x", "-x"):
                w, h = min(0.26, 1.0 * e.z), min(0.2, 0.9 * e.y)
            elif f in ("z", "-z"):
                w, h = min(0.26, 1.0 * e.x), min(0.2, 0.9 * e.y)
            else:
                w, h = min(0.24, 0.9 * e.z), min(0.24, 0.9 * e.x)
            if w > 0.05 and h > 0.04:
                plates.append((c, dirs[f], w * size, h * size, R))
        self.armor.append((t, plates))
        sc = min(1.0, 0.45 + e.length * 1.2)
        cr = []
        for k in range(crystals):
            a = self.rng.uniform(0, 6.28)
            d = Vector((math.cos(a), self.rng.uniform(0.25, 0.9), math.sin(a)))
            cr.append((c, d, sc * self.rng.uniform(0.7, 1.0), R))
        self.crystal.append((t, cr))
        md = []
        for k in range(mud):
            a = self.rng.uniform(0, 6.28)
            md.append((c - Vector((0, e.y * low, 0)), Vector((math.cos(a), -0.25, math.sin(a))), 1.0, R))
        if md:
            self.mud.append((t, md))

    def limb(self, t, n, at=0.5, plate=True, crystal=0.5, mud=0, size=1.0):
        """at: how far up the piece the plate sits (0 its foot, 1 its top)"""
        lo, hi = bbox(t)
        c, e = (lo + hi) / 2, (hi - lo) / 2
        p = Vector((c.x, lo.y + (hi.y - lo.y) * at, c.z))
        R = e.length + 0.15
        n = Vector(n)
        across = e.z if abs(n.x) > abs(n.z) else e.x
        if plate:
            self.armor.append((t, [(p, n, min(0.13, 1.6 * across) * size, min(0.15, 0.7 * e.y) * size, R)]))
        if self.rng.random() < crystal:
            a = self.rng.uniform(0, 6.28)
            self.crystal.append((t, [(Vector((c.x, lo.y + (hi.y - lo.y) * self.rng.uniform(0.3, 0.8), c.z)), n + Vector((math.cos(a), 0.4, math.sin(a))) * 0.6, 0.6, R)]))
        if mud:
            self.mud.append((t, [(Vector((c.x, lo.y + (hi.y - lo.y) * self.rng.uniform(0.08, 0.3), c.z)), n + Vector((self.rng.uniform(-0.6, 0.6), 0, self.rng.uniform(-0.6, 0.6))), 0.8, R) for _ in range(mud)]))

    def apply(self, family):
        for t, spots in self.armor:
            if spots:
                armor_plates(t, spots, family)
        for t, spots in self.crystal:
            if spots:
                crystal_cluster(t, spots, self.rng)
        for t, spots in self.mud:
            mud_cakes(t, spots, self.rng)


# ---------------- the far LOD: each part again, lighter ----------------
def copy_tree(o, parent, suffix):
    n = o.copy()
    if o.type == "MESH":
        n.data = o.data.copy()
    C.objects.link(n)
    n.parent = parent
    n.name = o.name + suffix
    for k in list(o.children):
        copy_tree(k, n, suffix)
    return n


def far_copy(root, share=0.3):
    """root again as root_far: the outline sources dropped (each piece outlines itself), every piece decimated to `share`"""
    far = copy_tree(root, None, "_far")
    for o in [far] + [q for q in C.objects if far in parents(q)]:
        if o.type != "MESH":
            continue
        if o.get("slot") == "inkonly":
            me = o.data
            bpy.data.objects.remove(o)
            bpy.data.meshes.remove(me)
            continue
        if "ink_far" in o:
            o["ink"] = o["ink_far"]
        n = tris(o)
        if n > 80 and o.get("slot") not in ("crystal",):
            decimate(o, max(40, int(n * share)))
            o.data.validate()
    return far


def part_tris(root):
    """a part's triangles: its own, and each fitted mutation's and its second form's apart"""
    out = {}
    for o in C.objects:
        if o.type != "MESH" or o.get("slot") == "inkonly" or root not in parents(o):
            continue
        m = next((q["mut"] if q.get("role") == "mut" else f"form {q['form']}" if q.get("role") == "form" else f"extra {q['looks']}" for q in parents(o) if q.get("role") in ("mut", "form", "extra")), None)
        out[m] = out.get(m, 0) + tris(o)
    return out
