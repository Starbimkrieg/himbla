# The chimera kit at full resolution (the showcase: person, mite, car and sapling, one look each) for Blender 4.2+ / 5.x
# -> src/assets/chimera_hd.glb, read by src/chimerabuild.js (`hd_` pieces; the lab's HD SHOWCASE).
#
#   MOONRUNNER_REPO=<repo> python3 tools/blender/build_chimera_hd.py
#
# How a part is made, so it holds up close and outlines cleanly:
#   - fused: each colour region is built from overlapping primitives, then voxel-remeshed into ONE watertight surface (Remesh, voxel
#     size VOX), smoothed (Smooth) and decimated to its triangle budget (Decimate): one mesh, one outline, organic joins
#   - cut in, not laid on: lamp and eye sockets, window recesses, panel lines, zips, seed pits, rivet and bolt holes are Boolean
#     differences in the surface; the lamp, eye or glass sits inside the socket
#   - joints built in: every body ends at its base in a skirt that wraps down 6 cm over whatever legs it sits on, every head in a neck
#     stub that goes 6 cm down into the body: two parts meet in one silhouette, with no separate piece between them
#   - mutations fitted: armour and crystal are made for each part, on its own surface (armour plates Shrinkwrapped onto it and given
#     thickness with Solidify, rivets cut into the plates; crystal clusters rooted 4 cm inside it, found by ray casting). They hang under
#     the pivot they move with, in an empty with role `mut` and extra `mut` (the builder shows them only on a chimera with that mutation).
#
# THE CONTRACT is the kit's (build_chimera_kit.py): hd_legs_<kind> stands on y = 0 with socket `hip` (jrx / jrz); hd_body_<kind>'s origin
# is the hip, sockets `neck` and `back`; hd_head_<kind>'s origin is the neck, sockets `top` and `eye`; pivots `leg`, `wheel` (r), `arm`.
# Slots: hides `person` (a settler's clothes: the builder picks the colour), `mite`, `car`, `sapling`; fixed: dark, steel, metal,
# chrome, tire, boot, sole, glove, helmet, belt, gold, bark, moss, leaf, petal, stonebark, vest; lit: glass, eye, lamp, red, crystal.
import math, os, random

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", ".."))
COLL = "ChimeraHD"


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "person": "2b8f6a", "mite": "b8e986", "car": "ff7ad9", "sapling": "6f8a3a",
    "dark": "2a2540", "steel": "55607a", "metal": "8a87a0", "chrome": "d8d4e8", "tire": "1d1a29", "boot": "3a3550", "sole": "221d33",
    "glove": "e8e4f0", "helmet": "f3eee4", "belt": "2a2540", "gold": "ffd23f", "bark": "6b4a2a", "moss": "3f7a34", "leaf": "5fbf4a",
    "petal": "ff7ad9", "stonebark": "8c8798", "vest": "5b6b4a",
    "glass": "9be7ff", "eye": "ff2e88", "lamp": "fff6a8", "red": "ff2a4a", "crystal": "2ee6ff",
    "inkonly": "000000",           # (a part's outline source: its surface before the cuts, never drawn itself)
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
from mathutils import Vector, Quaternion, Matrix
from mathutils.bvhtree import BVHTree
C = coll()
VOX = 0.0065                       # voxel size of the fusing remesh (a 6.5 mm grid: the parts are 0.3 to 0.7 m)
FAMILY = {"person": "human", "mite": "mite", "car": "car", "sapling": "sapling"}


# ---------------- primitives (three.js axes) ----------------
def ell(rx, ry, rz, t=(0, 0, 0), r=(0, 0, 0), n=14):
    return xf(superquad(rx, ry, rz, 1, 1, n, n // 2 + 2), t, r)


def soft(w, h, d, t=(0, 0, 0), r=(0, 0, 0), e=0.3):
    return xf(superquad(w / 2, h / 2, d / 2, e, e, 16, 10), t, r)


def box(w, h, d, t=(0, 0, 0), r=(0, 0, 0)):
    return xf(cuboid(w, h, d)[:2], t, r)


def cyl(r0, r1, h, t=(0, 0, 0), r=(0, 0, 0), seg=16):
    return xf(cylinder(r0, r1, h, seg)[:2], t, r)


def capsule(a, b, r0, r1=None, seg=12):
    """a tube from a to b, a sphere at each end (fusing makes it one smooth limb)"""
    r1 = r0 if r1 is None else r1
    return join([tube([a, b], [r0, r1], seg, cap=True), ell(r0, r0, r0, a, n=12), ell(r1, r1, r1, b, n=12)])


def chain(pts, radii):
    return join([capsule(pts[i], pts[i + 1], radii[i], radii[i + 1]) for i in range(len(pts) - 1)])


def turn_to(d):
    d = Vector(d).normalized()
    return d.to_track_quat("Z", "Y" if abs(d.y) < 0.98 else "X")


def ell_between(a, b, rw, rt, roll=0.0, n=14):
    a, b = Vector(a), Vector(b)
    g = superquad(rw, rt, (b - a).length / 2, 1, 1, n, n // 2 + 2)
    m = (turn_to(b - a) @ Quaternion((0, 0, 1), roll)).to_matrix()
    mid = (a + b) / 2
    return [tuple(m @ Vector(v) + mid) for v in g[0]], g[1]


def shard(r, h, t, d):
    """a six-sided crystal with a point at each end, its foot at t, growing along d"""
    g = lathe([(0, 0), (r, 0.12 * h), (r * 0.9, 0.72 * h), (0, h)], 6)
    m = Vector(d).normalized().to_track_quat("Y", "Z").to_matrix()
    return [tuple(m @ Vector(v) + Vector(t)) for v in g[0]], g[1]


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
        d.ratio = budget / n
        apply_mods(o)


def fused(name, geo, slot, parent, ink, budget, cuts=(), smooth=5, vox=VOX, remesh=True):
    """one watertight surface from overlapping primitives (remesh=False: as built, for a lathed tyre or hub), the cuts taken out of it,
    decimated to `budget` triangles. A cut part's outline is drawn from its surface before the cuts (an `inkonly` copy), so a groove or
    socket shows as a dent in the shading, not a black line."""
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
        decimate(k, budget * 0.5)
        k.data.validate()
        o["ink"] = 0
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


def socket(root, name, pos, **props):
    return pivot(f"{root.name}_{name}", pos, root, role="socket", socket=name, **props)


def point(parent, name, pos, normal, tag, size=1.0):
    """an attachment point (role graft) for the mutations the builder places at run time (spark, radio, turbo, mud...)"""
    n = Vector(normal).normalized()
    return pivot(f"{parent.name}_g{name}", pos, parent, role="graft", tag=tag, size=size, nx=n.x, ny=n.y, nz=n.z)


# ---------------- fitting the mutations to a part's own surface ----------------
def to_b(v):
    return Vector(tb(tuple(v)))


def from_b(v):
    return Vector((v.x, v.z, -v.y))


def hit(target, p, n):
    """where a ray from 0.3 m out along n, coming back in, meets the target's surface (three.js axes, in the target's frame)"""
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(target, dg)
    loc, nor, _, _ = bvh.ray_cast(to_b(Vector(p) + Vector(n).normalized() * 0.3), to_b(-Vector(n).normalized()))
    if loc is None:
        return None
    nn = from_b(nor)
    return from_b(loc), nn.normalized()


def frame_at(n):
    n = Vector(n).normalized()
    u = Vector((0, 1, 0)).cross(n)
    if u.length < 0.2:
        u = Vector((1, 0, 0)).cross(n)
    u.normalize()
    v = n.cross(u).normalized()
    return u, v, n


def mut_group(parent, mut):
    return pivot(f"{parent.name}_mut_{mut}_{len(parent.children)}", (0, 0, 0), parent, role="mut", mut=mut)


def armor_plates(target, spots, family, rng):
    """plates shrinkwrapped onto the target's surface at each spot (p, n, w, h), with thickness and rivet holes cut in"""
    g = mut_group(target.parent, "armor")
    for k, (p, n, w, h) in enumerate(spots):
        H = hit(target, p, n)
        if not H:
            continue
        c, nn = H
        u, v, nn = frame_at(nn)
        slot = {"car": "metal", "mite": "dark", "sapling": "stonebark", "human": "vest"}[family]
        pieces = [(0, 0, w, h)] if family != "sapling" else [(-w * 0.25, -h * 0.2, w * 0.55, h * 0.5), (w * 0.22, h * 0.05, w * 0.5, h * 0.55), (-w * 0.05, h * 0.32, w * 0.45, h * 0.35)]
        for j, (ox, oy, pw, ph) in enumerate(pieces):
            nu, nv = (7, 5)
            verts, faces = [], []
            for b in range(nv + 1):
                for a in range(nu + 1):
                    x, y = (a / nu - 0.5) * pw, (b / nv - 0.5) * ph
                    if family in ("mite", "human"):                      # rounded: an oval chitin plate, a vest panel with rounded corners
                        k = 2 if family == "mite" else 5
                        e = abs(2 * x / pw) ** k + abs(2 * y / ph) ** k
                        if e > 1:
                            s = e ** (-1 / k)
                            x, y = x * s, y * s
                    q = c + u * (x + ox) + v * (y + oy) + nn * 0.01
                    verts.append(tuple(q))
            for b in range(nv):
                for a in range(nu):
                    i = b * (nu + 1) + a
                    faces.append((i, i + 1, i + nu + 2, i + nu + 1))
            o = mesh(f"{g.name}_plate{k}_{j}", (verts, faces), slot, g, 0.012, sharp=0)
            o.parent = target.parent
            sw = o.modifiers.new("sw", "SHRINKWRAP")
            th = 0.016 if family != "sapling" else 0.024
            sw.target, sw.wrap_method, sw.offset = target, "NEAREST_SURFACEPOINT", th / 2 - 0.004   # (the inner face sunk 4 mm into the hide)
            so = o.modifiers.new("so", "SOLIDIFY")
            so.thickness, so.offset = th, 0
            bv = o.modifiers.new("bv", "BEVEL")
            bv.width, bv.segments = 0.003, 1
            apply_mods(o)
            o.parent = g
            if family in ("car", "human"):                              # rivet holes, cut into the plate's face
                for (rx, ry) in ((-0.36, -0.36), (0.36, -0.36), (-0.36, 0.36), (0.36, 0.36)):
                    q = c + u * (rx * pw + ox) + v * (ry * ph + oy) + nn * 0.03
                    cut(o, ell(0.008, 0.008, 0.008, tuple(q), n=8))
            elif family == "mite":                                      # a ridge groove down the middle of the chitin
                q = c + nn * 0.03
                cut(o, ell_between(tuple(q - v * ph * 0.42), tuple(q + v * ph * 0.42), 0.006, 0.012, n=8))
            smooth_shade(o)
    return g


def crystal_cluster(target, spots, rng):
    """crystal clusters rooted 4 cm inside the target's surface, growing out along it"""
    g = mut_group(target.parent, "crystal")
    shards = []
    for (p, n, s) in spots:
        H = hit(target, p, n)
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


# =====================================================================================================
# PERSON: a settler, at chimera scale (hip 0.6 m, torso 0.62 m, a helmet 0.32 m across)
# =====================================================================================================
def legs_person(root, rng):
    J = 0.6
    pel = fused(root.name + "_pelvis", xf(lathe([(0, -0.07), (0.12, -0.065), (0.155, -0.02), (0.165, 0.04), (0.155, 0.09), (0.1, 0.11), (0, 0.115)], 20), (0, J - 0.02, 0), s=(1, 1, 0.78)), "person", root, 0.025, 400)
    legs = []
    for sx in (-1, 1):
        p = pivot(f"{root.name}_leg{'L' if sx < 0 else 'R'}", (sx * 0.085, J, 0), root, role="leg")
        prof = [(0, 0.03), (0.07, 0.02), (0.075, -0.04), (0.07, -0.16), (0.062, -0.26), (0.058, -0.3), (0.063, -0.33), (0.058, -0.37), (0.05, -0.45), (0.046, -0.5), (0, -0.52)]
        leg = fused(p.name + "_leg", join([lathe(prof, 20), ell(0.05, 0.045, 0.04, (0, -0.31, 0.03))]), "person", p, 0.022, 600,
                    cuts=[box(0.006, 0.22, 0.02, (sx * 0.068, -0.15, 0.0))])                       # (a side seam)
        boot = fused(p.name + "_boot", join([lathe([(0.064, -0.46), (0.068, -0.5), (0.066, -0.54), (0, -0.56)], 16), soft(0.11, 0.075, 0.2, (0, -0.545, 0.035), e=0.35), ell(0.05, 0.035, 0.05, (0, -0.565, 0.11))]), "boot", p, 0.02, 350)
        sole = fused(p.name + "_sole", soft(0.118, 0.026, 0.215, (0, -J + 0.013, 0.038), e=0.3), "sole", p, 0.012, 180,
                     cuts=[box(0.13, 0.012, 0.012, (0, -J + 0.002, z)) for z in (-0.04, 0.0, 0.04, 0.08)])
        legs.append((p, leg))
        point(p, "thigh", (0, -0.12, 0.07), (0, 0, 1), "side", 0.6)
    socket(root, "hip", (0, J + 0.09, 0), jrx=0.15, jrz=0.12)
    fit = [(legs[0][1], [((0, -0.36, 0.06), (0, 0.15, 1), 0.1, 0.16)], [((0, -0.2, 0.06), (0.2, 0.1, 1), 0.8)]),
           (legs[1][1], [((0, -0.36, 0.06), (0, 0.15, 1), 0.1, 0.16)], [((0.03, -0.42, 0.0), (1, 0.2, 0.2), 0.7)]),
           (pel, [((0, J, 0.12), (0, 0.1, 1), 0.2, 0.1)], [((-0.12, J + 0.02, 0.0), (-1, 0.3, 0), 0.8)])]
    return fit


def body_person(root, rng):
    prof = [(0, -0.07), (0.15, -0.07), (0.168, -0.04), (0.172, 0.02), (0.165, 0.12), (0.17, 0.24), (0.185, 0.36), (0.2, 0.45), (0.2, 0.51), (0.18, 0.56), (0.12, 0.6), (0.07, 0.62), (0, 0.625)]
    torso = fused(root.name + "_torso", join([xf(lathe(prof, 24), s=(1, 1, 0.74)), xf(torus(0.075, 0.03, 20, 8), (0, 0.6, 0.005)),
                                                 soft(0.09, 0.08, 0.04, (0.07, 0.42, 0.135), e=0.35), soft(0.09, 0.08, 0.04, (-0.07, 0.42, 0.135), e=0.35)]),
                  "person", root, 0.025, 1600,
                  cuts=[box(0.005, 0.5, 0.02, (0, 0.33, 0.14)),                                    # the zip
                        box(0.085, 0.006, 0.03, (0.07, 0.448, 0.15)), box(0.085, 0.006, 0.03, (-0.07, 0.448, 0.15))])   # the pocket flaps
    fused(root.name + "_belt", xf(torus(0.168, 0.022, 32, 8), (0, 0.11, 0), s=(1, 1, 0.76)), "belt", root, 0.012, 300)
    buckle = fused(root.name + "_buckle", soft(0.06, 0.045, 0.02, (0, 0.11, 0.135), e=0.3), "gold", root, 0.006, 100, cuts=[box(0.035, 0.022, 0.03, (0, 0.11, 0.14))])
    arms = []
    for sx in (-1, 1):
        p = pivot(f"{root.name}_arm{'L' if sx < 0 else 'R'}", (sx * 0.2, 0.5, 0), root, role="arm")
        path = [(0, 0, 0), (sx * 0.02, -0.15, -0.005), (sx * 0.03, -0.29, 0.035)]
        sleeve = fused(p.name + "_sleeve", join([ell(0.062, 0.062, 0.058, (0, -0.01, 0)), chain(path, [0.052, 0.045, 0.04]), xf(torus(0.04, 0.012, 16, 6), path[-1], (0.25, 0, 0))]), "person", p, 0.02, 500)
        w = Vector(path[-1]) + Vector((0, -0.05, 0.012))
        hand = fused(p.name + "_glove", join([ell(0.038, 0.048, 0.026, tuple(w)), capsule(tuple(w + Vector((sx * 0.03, 0.01, 0.015))), tuple(w + Vector((sx * 0.045, -0.02, 0.03))), 0.012),
                                               ell(0.034, 0.03, 0.022, tuple(w + Vector((0, -0.045, 0.006))))]), "glove", p, 0.012, 250)
        arms.append((p, sleeve))
    socket(root, "neck", (0, 0.62, 0), jrx=0.07, jrz=0.07)
    socket(root, "back", (0, 0.36, -0.15))
    point(root, "chest", (0, 0.42, 0.15), (0, 0, 1), "front", 0.8)
    point(root, "back", (0, 0.36, -0.15), (0, 0.1, -1), "back", 0.8)
    point(root, "low", (0, 0.08, 0.13), (0, -0.3, 1), "low", 0.6)
    fit = [(torso, [((0, 0.27, 0.14), (0, 0.05, 1), 0.26, 0.15), ((0.0, 0.36, -0.15), (0, 0.1, -1), 0.22, 0.24)],          # (the vest's front: below the pockets)
            [((-0.15, 0.5, -0.05), (-0.6, 0.6, -0.4), 0.9), ((0.14, 0.24, -0.08), (0.8, 0, -0.5), 0.7)]),
           (arms[0][1], [((-0.06, -0.06, 0.0), (-1, 0.4, 0), 0.09, 0.09)], []),
           (arms[1][1], [((0.06, -0.06, 0.0), (1, 0.4, 0), 0.09, 0.09)], [((0.05, -0.2, 0.0), (1, 0.1, 0.2), 0.6)])]
    return fit


def head_person(root, rng):
    r = 0.16
    cy = 0.2
    fused(root.name + "_neck", join([cyl(0.058, 0.064, 0.1, (0, -0.02, 0)), xf(torus(0.07, 0.024, 20, 8), (0, 0.035, 0))]), "dark", root, 0.015, 250)
    helmet = fused(root.name + "_helmet", ell(r, r, r, (0, cy, 0), n=24), "helmet", root, 0.025, 1200,
                   cuts=[ell(0.135, 0.075, 0.07, (0, cy + 0.005, 0.158), n=20),                     # the visor opening: wide and shallow
                         xf(cylinder(0.026, 0.026, 0.06, 14)[:2], (r * 0.96, cy + 0.03, 0.0), (0, 0, math.pi / 2)),   # the lamp's socket
                         box(0.01, 0.006, 0.2, (0, cy + r * 0.99, -0.02))])                         # a ridge seam over the top
    plain(root.name + "_visor", ell(r * 0.955, r * 0.955, r * 0.955, (0, cy, 0.0), n=18), "glass", root, 0.0)
    plain(root.name + "_lamp", xf(cylinder(0.02, 0.02, 0.02, 14)[:2], (r * 0.95, cy + 0.03, 0.0), (0, 0, math.pi / 2)), "lamp", root, 0.0)
    socket(root, "top", (0, cy + r, 0))
    socket(root, "eye", (0.045, cy + 0.01, 0.14))
    point(root, "side", (-r, cy, 0), (-1, 0.1, 0), "side", 0.45)
    return [(helmet, [((-r, cy + 0.02, -0.02), (-1, 0.3, -0.1), 0.09, 0.08)], [((-0.08, cy + 0.12, -0.06), (-0.5, 1, -0.4), 0.6)])]


# =====================================================================================================
# MITE
# =====================================================================================================
def legs_mite(root, rng):
    hip = 0.56
    thorax = fused(root.name + "_thorax", join([ell(0.16, 0.115, 0.22, (0, hip - 0.07, 0))] + [ell(0.05, 0.045, 0.05, (sx * 0.12, hip - 0.1, z)) for sx in (-1, 1) for z in (-0.12, 0.0, 0.12)]), "dark", root, 0.025, 900)
    legs = []
    for sx in (-1, 1):
        for k in (-1, 0, 1):
            p = pivot(f"{root.name}_leg{'L' if sx < 0 else 'R'}{k + 1}", (sx * 0.12, hip - 0.1, k * 0.12), root, role="leg")
            knee = (sx * 0.26, 0.18, k * 0.06)
            foot = (sx * 0.36, -(hip - 0.1) + 0.025, k * 0.14)
            seg = fused(p.name + "_seg", join([chain([(0, 0, 0), knee], [0.034, 0.03]), ell(0.04, 0.036, 0.036, knee), chain([knee, foot], [0.028, 0.016])]), "mite", p, 0.014, 280)
            fused(p.name + "_claw", join([ell(0.024, 0.02, 0.024, foot), xf(lathe([(0.015, 0), (0, -0.04)], 8), foot)]), "dark", p, 0.006, 70)
            legs.append(seg)
    point(root, "rear", (0, hip - 0.06, -0.22), (0, 0.2, -1), "back", 0.7)
    socket(root, "hip", (0, hip, 0), jrx=0.12, jrz=0.15)
    return [(thorax, [((0.15, hip - 0.07, 0.0), (1, 0.3, 0), 0.12, 0.12), ((-0.15, hip - 0.07, 0.0), (-1, 0.3, 0), 0.12, 0.12)], [((0.12, hip - 0.03, -0.1), (0.7, 0.6, -0.3), 0.7), ((-0.1, hip - 0.04, 0.12), (-0.6, 0.6, 0.4), 0.6)])]


def body_mite(root, rng):
    rings = [xf(torus(1, 0.06, 28, 8), (0, 0.2, -0.26 + dz), (math.pi / 2, 0, 0), (0.255 * f + 0.004, 1, 0.22 * f + 0.004)) for dz, f in ((-0.2, 0.86), (0.0, 1.0), (0.2, 0.86))]
    body = fused(root.name + "_body", join([ell(0.255, 0.22, 0.4, (0, 0.2, -0.26)), ell(0.17, 0.15, 0.2, (0, 0.17, 0.12)), ell(0.11, 0.08, 0.12, (0, -0.0, 0.0))]), "mite", root, 0.025, 2400,
                 cuts=rings)                                                                        # (the segments: grooves cut round the abdomen)
    for sx in (-1, 1):                                                                              # wing cases, raised in a V, clear of the abdomen
        plain(f"{root.name}_wing{sx}", ell_between((sx * 0.06, 0.3, 0.14), (sx * 0.3, 0.62, -0.48), 0.1, 0.012, roll=sx * 0.35, n=14), "glass", root, 0.008)
    socket(root, "neck", (0, 0.26, 0.3), jrx=0.07, jrz=0.07)
    socket(root, "back", (0, 0.42, -0.26))
    point(root, "top", (0, 0.41, -0.3), (0, 1, -0.1), "top", 1.0)
    point(root, "tail", (0, 0.22, -0.65), (0, 0.1, -1), "back", 0.8)
    for sx in (-1, 1):
        point(root, f"low{sx}", (sx * 0.2, 0.08, -0.2), (sx, -0.4, 0), "low", 0.7)
        point(root, f"flank{sx}", (sx * 0.245, 0.24, -0.28), (sx, 0.35, 0), "side", 1.0)
    return [(body, [((0.25, 0.24, -0.3), (1, 0.4, 0), 0.16, 0.2), ((-0.25, 0.24, -0.3), (-1, 0.4, 0), 0.16, 0.2), ((0, 0.42, -0.42), (0, 1, -0.3), 0.18, 0.16)],
             [((0.0, 0.42, -0.2), (0, 1, 0.1), 1.0), ((0.2, 0.3, -0.45), (0.7, 0.6, -0.3), 0.8), ((-0.16, 0.3, 0.12), (-0.7, 0.7, 0.2), 0.7)])]


def head_mite(root, rng):
    s = 0.85
    head = fused(root.name + "_head", join([ell(0.145, 0.12, 0.136, (0, 0.11, 0.04)), ell(0.08, 0.06, 0.07, (0, 0.06, 0.14)), cyl(0.06, 0.07, 0.1, (0, -0.02, 0.0))]), "mite", root, 0.022, 1000,
                 cuts=[ell(0.07, 0.078, 0.066, (sx * 0.09, 0.145, 0.12), n=16) for sx in (-1, 1)])       # (eye sockets)
    for sx in (-1, 1):
        plain(f"{root.name}_eye{sx}", ell(0.064, 0.072, 0.06, (sx * 0.09, 0.145, 0.11), n=14), "eye", root, 0.0)
        fused(f"{root.name}_jaw{sx}", chain([(sx * 0.05, 0.05, 0.16), (sx * 0.06, 0.03, 0.22), (sx * 0.02, 0.02, 0.27)], [0.02, 0.016, 0.008]), "dark", root, 0.008, 120)
        feel = [(sx * 0.04, 0.2, 0.09), (sx * 0.1, 0.34, 0.14), (sx * 0.17, 0.39, 0.22)]
        fused(f"{root.name}_feeler{sx}", chain(feel, [0.011, 0.009, 0.007]), "dark", root, 0.006, 120)
        plain(f"{root.name}_bulb{sx}", ell(0.025, 0.025, 0.025, feel[-1], n=12), "eye", root, 0.0)
    socket(root, "top", (0, 0.23, 0.03))
    socket(root, "eye", (0.09, 0.145, 0.18))
    return [(head, [((0, 0.22, -0.02), (0, 1, -0.3), 0.1, 0.08)], [((-0.08, 0.2, -0.04), (-0.5, 1, -0.4), 0.55)])]


# =====================================================================================================
# CAR
# =====================================================================================================
def legs_car(root, rng):
    r, tw, tx, tz = 0.16, 0.065, 0.34, 0.34
    yc = 0.26                                                       # (the hull: 0.14 to 0.38 high, wider than the track, so it covers the wheels)
    top = yc + 0.15
    arches = [cyl(r + 0.028, r + 0.028, 0.26, (sx * tx, r, z), (0, 0, math.pi / 2), seg=32) for sx in (-1, 1) for z in (-tz, tz)]
    hull = fused(root.name + "_hull", join([soft(0.8, 0.24, 1.04, (0, yc, 0), e=0.2), soft(0.56, 0.1, 0.72, (0, yc + 0.1, -0.02), e=0.3)]),
                 "car", root, 0.025, 1300,
                 cuts=arches + [ell(0.05, 0.034, 0.03, (sx * 0.25, yc + 0.03, 0.52), n=14) for sx in (-1, 1)]       # (the wheel arches, headlamp sockets)
                 + [box(0.1, 0.03, 0.02, (sx * 0.25, yc + 0.03, -0.52)) for sx in (-1, 1)]                         # (tail lamp recesses)
                 + [box(0.02, 0.006, 0.36, (sx * 0.4, yc + 0.06, 0.0)) for sx in (-1, 1)]                          # (a swage line down each side)
                 + [box(0.44, 0.012, 0.006, (0, top, z)) for z in (-0.2, 0.18)])                                 # (seams across the deck)
    plain(root.name + "_lamps", join([ell(0.044, 0.03, 0.02, (sx * 0.25, yc + 0.03, 0.505), n=14) for sx in (-1, 1)]), "lamp", root, 0.0)
    plain(root.name + "_tails", join([box(0.09, 0.024, 0.01, (sx * 0.25, yc + 0.03, -0.508)) for sx in (-1, 1)]), "red", root, 0.0)
    fused(root.name + "_bumpers", join([soft(0.84, 0.055, 0.07, (0, 0.17, 0.53 * s), e=0.3) for s in (-1, 1)]), "chrome", root, 0.012, 300)
    for sx in (-1, 1):
        for z in (-tz, tz):
            p = pivot(f"{root.name}_wheel{'L' if sx < 0 else 'R'}{'F' if z > 0 else 'B'}", (sx * tx, r, z), root, role="wheel", r=r)
            prof = [(r * 0.55, -tw), (r * 0.9, -tw), (r, -tw * 0.6), (r, tw * 0.6), (r * 0.9, tw), (r * 0.55, tw), (r * 0.55, -tw)]
            tread = [xf(box(tw * 0.95, 0.014, 0.024, ((k % 2 - 0.5) * tw * 0.9, r, 0)), r=(k * math.pi / 12, 0, 0)) for k in range(24)]   # (blocks, staggered)
            fused(p.name + "_tire", xf(lathe(prof, 36), r=(0, 0, math.pi / 2)), "tire", p, 0.02, 420, cuts=tread, remesh=False)
            fused(p.name + "_hub", xf(lathe([(0, -tw * 0.9), (r * 0.58, -tw * 0.9), (r * 0.6, tw * 0.6), (r * 0.5, tw), (0, tw * 1.05)], 24), r=(0, 0, math.pi / 2)), "metal", p, 0.01, 160,
                  cuts=[ell(0.012, 0.012, 0.012, (sx * tw * 1.0, math.cos(a) * r * 0.3, math.sin(a) * r * 0.3), n=8) for a in [k * 2 * math.pi / 5 for k in range(5)]], remesh=False)   # (bolt holes)
    point(root, "tail", (0, yc, -0.52), (0, 0.2, -1), "back", 0.8)
    point(root, "low", (0, 0.14, 0), (0, -1, 0), "low", 0.7)
    for sx in (-1, 1):
        point(root, f"side{sx}", (sx * 0.4, yc, 0), (sx, 0.15, 0), "side", 0.9)
    socket(root, "hip", (0, top, 0), jrx=0.2, jrz=0.24)
    return [(hull, [((0.4, yc, 0.0), (1, 0.1, 0), 0.2, 0.1), ((-0.4, yc, 0.0), (-1, 0.1, 0), 0.2, 0.1), ((0.0, yc, 0.52), (0, 0.15, 1), 0.28, 0.08), ((0.3, top - 0.04, 0.34), (0.3, 1, 0.2), 0.16, 0.2), ((-0.3, top - 0.04, -0.34), (-0.3, 1, -0.2), 0.16, 0.2)],
             [((0.3, top - 0.03, -0.32), (0.4, 1, 0), 0.9), ((-0.4, yc, 0.2), (-1, 0.3, 0.2), 0.8), ((0.0, yc, -0.52), (0, 0.4, -1), 0.7)])]


def body_car(root, rng):
    hull = fused(root.name + "_hull", join([soft(0.56, 0.2, 0.92, (0, 0.13, 0), e=0.22), soft(0.42, 0.17, 0.44, (0, 0.3, -0.06), e=0.28), ell(0.13, 0.08, 0.15, (0, -0.0, 0.0)),
                                              extrude([(-0.46, 0.15), (-0.3, 0.2), (-0.44, 0.42)], 0.03, "x")]),
                 "car", root, 0.025, 1800,
                 cuts=[box(0.44, 0.08, 0.2, (0, 0.32, 0.12), (0.5, 0, 0)), box(0.44, 0.07, 0.3, (0, 0.32, -0.08)),   # (windscreen and side windows, inset)
                       box(0.006, 0.12, 0.004, (0.0, 0.12, 0.46))])                                  # (a seam on the nose)
    plain(root.name + "_glass", join([soft(0.4, 0.07, 0.18, (0, 0.315, 0.105), (0.5, 0, 0), e=0.3), soft(0.4, 0.06, 0.28, (0, 0.315, -0.08), e=0.3)]), "glass", root, 0.0)
    for sx in (-1, 1):
        fused(f"{root.name}_pipe{sx}", join([cyl(0.036, 0.04, 0.14, (sx * 0.13, 0.09, -0.48), (math.pi / 2, 0, 0))]), "chrome", root, 0.01, 150, cuts=[cyl(0.024, 0.024, 0.05, (sx * 0.13, 0.09, -0.55), (math.pi / 2, 0, 0))])
        plain(f"{root.name}_glow{sx}", ell(0.024, 0.024, 0.006, (sx * 0.13, 0.09, -0.52), n=12), "red", root, 0.0)
    socket(root, "neck", (0, 0.24, 0.37), jrx=0.08, jrz=0.08)
    socket(root, "back", (0, 0.3, -0.3))
    point(root, "roof", (0, 0.39, -0.06), (0, 1, 0), "top", 0.9)
    point(root, "rear", (0, 0.15, -0.46), (0, 0.1, -1), "back", 0.8)
    for sx in (-1, 1):
        point(root, f"door{sx}", (sx * 0.28, 0.14, 0.12), (sx, 0.1, 0), "side", 1.0)
        point(root, f"sill{sx}", (sx * 0.26, 0.05, -0.05), (sx, -0.5, 0), "low", 0.7)
    return [(hull, [((0.28, 0.14, 0.15), (1, 0.05, 0), 0.24, 0.13), ((-0.28, 0.14, 0.15), (-1, 0.05, 0), 0.24, 0.13), ((0.28, 0.14, -0.22), (1, 0.05, 0), 0.2, 0.13), ((-0.28, 0.14, -0.22), (-1, 0.05, 0), 0.2, 0.13)],
             [((0.0, 0.39, -0.12), (0.2, 1, -0.2), 1.0), ((0.25, 0.2, -0.32), (0.8, 0.5, -0.3), 0.7), ((-0.22, 0.12, 0.3), (-1, 0.3, 0.3), 0.7)])]


def head_car(root, rng):
    face = fused(root.name + "_face", join([soft(0.31, 0.22, 0.22, (0, 0.13, 0.03), e=0.28), soft(0.33, 0.04, 0.2, (0, 0.215, 0.03), e=0.35), cyl(0.06, 0.07, 0.1, (0, -0.02, 0))]), "car", root, 0.022, 1100,
                 cuts=[ell(0.05, 0.05, 0.04, (sx * 0.085, 0.15, 0.135), n=16) for sx in (-1, 1)] + [soft(0.17, 0.06, 0.05, (0, 0.07, 0.14), e=0.25)])   # (lamp sockets, the grille recess)
    plain(root.name + "_lamps", join([ell(0.044, 0.044, 0.03, (sx * 0.085, 0.15, 0.115), n=16) for sx in (-1, 1)]), "lamp", root, 0.0)
    fused(root.name + "_slats", join([box(0.16, 0.008, 0.02, (0, 0.05 + 0.015 * k, 0.12)) for k in range(4)]), "chrome", root, 0.0, 300, smooth=0, vox=0.004)
    fused(root.name + "_bumper", soft(0.34, 0.045, 0.07, (0, 0.025, 0.12), e=0.3), "chrome", root, 0.01, 200)
    fused(root.name + "_siren", join([cyl(0.035, 0.045, 0.02, (0, 0.24, 0.0)), ell(0.035, 0.035, 0.035, (0, 0.26, 0.0))]), "red", root, 0.008, 120)
    socket(root, "top", (0.06, 0.24, -0.05))
    socket(root, "eye", (0.085, 0.15, 0.16))
    return [(face, [((0.155, 0.13, 0.02), (1, 0.1, 0), 0.12, 0.1), ((-0.155, 0.13, 0.02), (-1, 0.1, 0), 0.12, 0.1)], [((-0.1, 0.23, -0.05), (-0.4, 1, -0.3), 0.55)])]


# =====================================================================================================
# SAPLING
# =====================================================================================================
def legs_sapling(root, rng):
    hip = 0.54
    bulb = fused(root.name + "_bulb", join([ell(0.17, 0.15, 0.17, (0, hip - 0.1, 0))] + [ell(rng.uniform(0.07, 0.11), rng.uniform(0.06, 0.09), rng.uniform(0.07, 0.11), (rng.uniform(-0.08, 0.08), hip - 0.12 + rng.uniform(-0.04, 0.03), rng.uniform(-0.08, 0.08))) for _ in range(4)]),
                 "sapling", root, 0.025, 800)
    moss = [ell(rng.uniform(0.045, 0.07), 0.028, rng.uniform(0.045, 0.07), (math.cos(a) * 0.12, hip - 0.025 + rng.uniform(-0.02, 0.02), math.sin(a) * 0.12)) for a in [rng.uniform(0, 6.28) for _ in range(5)]]
    fused(root.name + "_moss", join(moss), "moss", root, 0.008, 300)
    sprouts = []
    for i in range(6):
        a = 2 * math.pi * i / 6 + rng.uniform(-0.3, 0.3)
        b = (math.cos(a) * 0.1, hip - 0.04, math.sin(a) * 0.1)
        sprouts.append(ell_between(b, (math.cos(a) * 0.23, hip + 0.09 + rng.uniform(0, 0.06), math.sin(a) * 0.23), 0.04, 0.008, roll=rng.uniform(-0.4, 0.4), n=8))
    plain(root.name + "_sprouts", join(sprouts), "leaf", root, 0.006)
    roots = []
    for i in range(6):
        a = 2 * math.pi * i / 6 + rng.uniform(-0.35, 0.35)
        c, s = math.cos(a), math.sin(a)
        p = pivot(f"{root.name}_root{i}", (c * 0.07, hip - 0.14, s * 0.07), root, role="leg")
        y0 = -(hip - 0.14)
        reach = rng.uniform(0.27, 0.4)
        path = [(0, 0, 0)]
        for f in (0.3, 0.55, 0.8, 1.0):
            d = reach * f
            w = rng.uniform(-0.05, 0.05)
            path.append((c * d - s * w, y0 * (0.35 + 0.65 * f ** 1.5) + (0.03 if f < 1 else 0.012) + rng.uniform(0, 0.03) * (1 - f), s * d + c * w))
        radii = [0.06, 0.047 * rng.uniform(0.85, 1.15), 0.038 * rng.uniform(0.85, 1.2), 0.026, 0.013]
        mid = Vector(path[2])
        side = Vector((c, 0, s)).cross(Vector((0, 1, 0))) * rng.choice((-1, 1))
        rootlet = chain([tuple(mid), tuple(mid + side * 0.08 + Vector((0, -0.05, 0))), tuple(mid + side * 0.12 + Vector((0, y0 - mid.y + 0.01, 0)))], [0.02, 0.014, 0.008])
        knots = [ell(0.032, 0.026, 0.032, path[1], n=10)] if rng.random() < 0.7 else []
        roots.append(fused(p.name + "_r", join([chain(path, radii), rootlet] + knots), "bark", p, 0.014, 350))
    socket(root, "hip", (0, hip, 0), jrx=0.13, jrz=0.13)
    point(root, "front", (0, hip - 0.1, 0.16), (0, 0.3, 1), "front", 0.7)
    return [(bulb, [((0.15, hip - 0.1, 0.0), (1, 0.3, 0), 0.14, 0.12), ((-0.15, hip - 0.1, 0.0), (-1, 0.3, 0), 0.14, 0.12)], [((0.12, hip - 0.06, -0.08), (0.7, 0.6, -0.3), 0.7), ((-0.1, hip - 0.05, 0.1), (-0.6, 0.6, 0.4), 0.6)])]


def body_sapling(root, rng):
    h = 0.65
    lean = rng.uniform(-0.05, 0.05)
    prof = [(0, -0.07), (0.15, -0.07), (0.16, 0.0), (0.155, 0.05)]
    for f in (0.2, 0.38, 0.55, 0.72, 0.88, 1.0):
        prof.append(((0.14 - 0.06 * f) * rng.uniform(0.9, 1.1), h * f))
    prof.append((0, h + 0.02))
    trunk = lathe(prof, 22)
    trunk = ([(v[0] + lean * v[1], v[1], v[2]) for v in trunk[0]], trunk[1])
    geo, tips = [trunk], []
    for k, sx in enumerate((-1, 1, rng.choice((-1, 1)))):
        hy = h * (0.55 + 0.15 * k + rng.uniform(-0.05, 0.05))
        tip = (sx * rng.uniform(0.24, 0.32) + lean * hy, hy + rng.uniform(0.12, 0.2), rng.uniform(-0.08, 0.08))
        base = (sx * 0.04 + lean * hy * 0.8, hy - 0.12, 0)
        geo.append(chain([base, ((base[0] + tip[0]) / 2 + sx * 0.03, (base[1] + tip[1]) / 2, tip[2] / 2), tip], [0.035, 0.028, 0.02]))
        tips.append(tip)
    for y in (h * 0.3, h * 0.62):
        geo.append(ell(0.035, 0.04, 0.03, (rng.uniform(-0.05, 0.05) + lean * y, y, 0.1), n=12))
    hollow = ell(0.035, 0.05, 0.04, (lean * h * 0.45, h * 0.45, 0.12), n=14)
    tree = fused(root.name + "_trunk", join(geo), "sapling", root, 0.025, 1800, cuts=[hollow] + [box(0.004, rng.uniform(0.08, 0.14), 0.03, (math.sin(a) * 0.13 + lean * 0.3, h * rng.uniform(0.15, 0.7), math.cos(a) * 0.13), (0, a, 0)) for a in [rng.uniform(0, 6.28) for _ in range(6)]])   # (the hollow, bark furrows)
    plain(root.name + "_hollow", ell(0.028, 0.042, 0.01, (lean * h * 0.45, h * 0.45, 0.095), n=12), "dark", root, 0.0)
    for k, tip in enumerate(tips):
        fused(f"{root.name}_leaves{k}", join([ell(rng.uniform(0.05, 0.08), rng.uniform(0.04, 0.06), rng.uniform(0.05, 0.08), (tip[0] + rng.uniform(-0.08, 0.08), tip[1] + rng.uniform(-0.02, 0.08), tip[2] + rng.uniform(-0.07, 0.07)), n=12) for _ in range(7)]), "leaf", root, 0.012, 400)
    socket(root, "neck", (lean * h, h + 0.02, 0), jrx=0.05, jrz=0.05)
    socket(root, "back", (0, h * 0.5, -0.13))
    point(root, "chest", (lean * h * 0.62, h * 0.62, 0.1), (0, 0.1, 1), "front", 0.8)
    for sx in (-1, 1):
        point(root, f"low{sx}", (sx * 0.14, 0.08, 0.03), (sx, -0.2, 0.3), "low", 0.6)
    return [(tree, [((0.13, h * 0.3, 0.0), (1, 0.1, 0.1), 0.12, 0.16), ((-0.13, h * 0.3, 0.0), (-1, 0.1, 0.1), 0.12, 0.16), ((0.0, h * 0.5, -0.12), (0, 0.1, -1), 0.12, 0.16)],
             [((0.12, h * 0.4, -0.05), (1, 0.4, -0.2), 0.9), ((-0.1, h * 0.7, 0.06), (-0.8, 0.6, 0.3), 0.7), ((0.0, h * 0.2, -0.12), (0, 0.3, -1), 0.7)])]


def head_sapling(root, rng):
    s = 0.85
    fused(root.name + "_stem", join([chain([(0, -0.06, 0), (0, 0.08, 0.01), (0, 0.15, 0.03)], [0.035, 0.03, 0.026])] + [ell(0.085, 0.022, 0.042, (sx * 0.07, 0.06, 0.01), (0, 0, sx * 0.4), n=14) for sx in (-1, 1)]), "leaf", root, 0.012, 350)
    disc = fused(root.name + "_disc", ell(0.13, 0.13, 0.05, (0, 0.24, 0.045), n=20), "gold", root, 0.02, 800,
                 cuts=[ell(0.009, 0.009, 0.01, (math.cos(a) * rr, 0.24 + math.sin(a) * rr, 0.094), n=8) for rr, n_ in ((0.095, 12), (0.07, 9)) for a in [2 * math.pi * k / n_ for k in range(n_)] if not (abs(math.cos(a) * rr) < 0.06 and 0.0 < math.sin(a) * rr < 0.06)]
                 + [ell(0.019, 0.027, 0.012, (sx * 0.043, 0.26, 0.094), n=12) for sx in (-1, 1)])        # (seed pits round the rim, the eyes)
    plain(root.name + "_eyes", join([ell(0.016, 0.023, 0.008, (sx * 0.043, 0.26, 0.086), n=12) for sx in (-1, 1)]), "dark", root, 0.0)
    fused(root.name + "_petals", join([ell(0.085, 0.042, 0.02, (math.cos(a) * 0.165, 0.24 + math.sin(a) * 0.165, 0.025), (0, 0, a), n=14) for a in [2 * math.pi * k / 9 for k in range(9)]]), "petal", root, 0.012, 700)
    socket(root, "top", (0, 0.4, 0.03))
    socket(root, "eye", (0.043, 0.26, 0.11))
    return [(disc, [((0.0, 0.24, -0.01), (0, 0.1, -1), 0.1, 0.1)], [((0.06, 0.32, -0.02), (0.4, 1, -0.5), 0.5)])]


def parents(o):
    out = []
    while o.parent:
        o = o.parent
        out.append(o)
    return out


BUILD = {"legs": {"person": legs_person, "mite": legs_mite, "car": legs_car, "sapling": legs_sapling},
         "body": {"person": body_person, "mite": body_mite, "car": body_car, "sapling": body_sapling},
         "head": {"person": head_person, "mite": head_mite, "car": head_car, "sapling": head_sapling}}

if not globals().get("CHIMERA_HD_LIB"):
    for slot in ("legs", "body", "head"):
        for kind in ("person", "mite", "car", "sapling"):
            rng = random.Random(hash((slot, kind)) & 0xffff)
            root = pivot(f"hd_{slot}_{kind}", (0, 0, 0), None, kind=kind, part=slot, alt=0)
            fit = BUILD[slot][kind](root, rng)
            if slot == "body":
                root["jrx"], root["jrz"] = {"person": (0.15, 0.12), "mite": (0.11, 0.12), "car": (0.13, 0.15), "sapling": (0.15, 0.15)}[kind]
            elif slot == "head":
                root["jrx"], root["jrz"] = 0.07, 0.07
            for target, plates, clusters in fit:                           # the mutations, fitted to this part's surface
                if plates:
                    armor_plates(target, [(Vector(p), Vector(n), w, h) for p, n, w, h in plates], FAMILY[kind], rng)
                if clusters:
                    crystal_cluster(target, [(Vector(p), Vector(n), sz) for p, n, sz in clusters], rng)
            under = [o for o in C.objects if o.type == "MESH" and o.get("slot") != "inkonly" and root in parents(o)]
            muts = {}
            for o in under:
                m = next((q["mut"] for q in parents(o) if q.get("role") == "mut"), None)
                muts[m] = muts.get(m, 0) + tris(o)
            print(f"{root.name}: {muts.pop(None, 0)} triangles, " + ", ".join(f"{k} +{v}" for k, v in muts.items()))
    audit_coplanar([o for o in C.objects if o.get("slot") != "inkonly"])
    export(os.path.join(REPO, "src", "assets", "chimera_hd.glb"), list(C.objects))
