# Shared geometry and scene helpers for the Blender build scripts (build_skimmer.py,
# build_warrig.py). Load with  exec(open(<repo>/tools/blender/kit.py).read(), globals())  after
# setting COLL (the collection to rebuild) and SLOT_COLORS (preview colour per material slot).
#
# Everything is authored in three.js axes (x right, y up, +z forward) and converted to Blender's
# (x, -z, y) on the way in, which the glTF exporter's +Y-up option converts back.

import bpy, bmesh, math, os
from mathutils import Vector, Euler


def tb(p):
    """three.js axes -> Blender axes"""
    return (p[0], -p[2], p[1])


# ---------------- geometry helpers (three.js axes, return (verts, faces)) ----------------

def spe(v, e):
    return math.copysign(abs(v) ** e, v)


def ring_pts(w, top, bot, eT, eB, yc=0.0, n=32):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        e = eT if s >= 0 else eB
        h = top if s >= 0 else bot
        pts.append((w * spe(c, 2 / e), yc + h * spe(s, 2 / e)))
    return pts


def loft(sections, n=32, cap0=True, cap1=True):
    """Hull through cross-sections, each a dict(z, w, t, b, eT=2.5, eB=2.5, yc=0), ordered by z."""
    verts, faces = [], []
    for s in sections:
        for x, y in ring_pts(s["w"], s["t"], s["b"], s.get("eT", 2.5), s.get("eB", 2.5), s.get("yc", 0.0), n):
            verts.append((x, y, s["z"]))
    for j in range(len(sections) - 1):
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    for cap, j in ((cap0, 0), (cap1, len(sections) - 1)):
        if not cap:
            continue
        s = sections[j]
        verts.append((0.0, s.get("yc", 0.0) + (s["t"] - s["b"]) / 2, s["z"]))
        c = len(verts) - 1
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            faces.append((b, a, c) if j == 0 else (a, b, c))
    return verts, faces


def grow(sections, d):
    return [{**s, "w": s["w"] + d, "t": s["t"] + d, "b": s["b"] + d} for s in sections]


def superquad(sx, sy, sz, e1=0.35, e2=0.35, nu=16, nv=10):
    verts, faces = [], []
    verts.append((0.0, -sy, 0.0))
    for j in range(1, nv):
        v = -math.pi / 2 + math.pi * j / nv
        cv, sv = spe(math.cos(v), e1), spe(math.sin(v), e1)
        for i in range(nu):
            u = 2 * math.pi * i / nu
            verts.append((sx * cv * spe(math.sin(u), e2), sy * sv, sz * cv * spe(math.cos(u), e2)))
    verts.append((0.0, sy, 0.0))
    top = len(verts) - 1
    ring = lambda j, i: 1 + (j - 1) * nu + (i % nu)
    for i in range(nu):
        faces.append((0, ring(1, i + 1), ring(1, i)))
    for j in range(1, nv - 1):
        for i in range(nu):
            faces.append((ring(j, i), ring(j, i + 1), ring(j + 1, i + 1), ring(j + 1, i)))
    for i in range(nu):
        faces.append((ring(nv - 1, i), ring(nv - 1, i + 1), top))
    return verts, faces


def rbox(sx, sy, sz, e=0.18, nu=16, nv=8):
    return superquad(sx, sy, sz, e, e, nu, nv)


def lathe(profile, segs=16):
    """profile: [(r, y)] bottom to top around the y axis; r == 0 rows collapse to a pole."""
    verts, faces, rows = [], [], []
    for r, y in profile:
        if r <= 1e-6:
            rows.append([len(verts)])
            verts.append((0.0, y, 0.0))
            continue
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            row.append(len(verts))
            verts.append((math.sin(a) * r, y, math.cos(a) * r))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for i in range(segs):
                faces.append((a[0], b[(i + 1) % segs], b[i]))
        elif len(b) == 1:
            for i in range(segs):
                faces.append((a[i], a[(i + 1) % segs], b[0]))
        else:
            for i in range(segs):
                faces.append((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    return verts, faces


def torus(R, r, seg=24, rseg=8):
    """Ring lying in the x-z plane (axis = y)."""
    verts, faces = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for k in range(rseg):
            b = 2 * math.pi * k / rseg
            rr = R + r * math.cos(b)
            verts.append((math.sin(a) * rr, r * math.sin(b), math.cos(a) * rr))
    for i in range(seg):
        i2 = (i + 1) % seg
        for k in range(rseg):
            k2 = (k + 1) % rseg
            faces.append((i * rseg + k, i * rseg + k2, i2 * rseg + k2, i2 * rseg + k))
    return verts, faces


def tube(path, radii, seg=8, cap=True):
    verts, faces = [], []
    P = [Vector(p) for p in path]
    for idx, p in enumerate(P):
        t = (P[min(idx + 1, len(P) - 1)] - P[max(idx - 1, 0)]).normalized()
        ref = Vector((0, 1, 0)) if abs(t.y) < 0.95 else Vector((1, 0, 0))
        n = t.cross(ref).normalized()
        b = t.cross(n).normalized()
        for k in range(seg):
            a = 2 * math.pi * k / seg
            verts.append(tuple(p + (n * math.cos(a) + b * math.sin(a)) * radii[idx]))
    for i in range(len(P) - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            faces.append((i * seg + k, i * seg + k2, (i + 1) * seg + k2, (i + 1) * seg + k))
    if cap:
        faces.append(tuple(range(seg - 1, -1, -1)))
        base = (len(P) - 1) * seg
        faces.append(tuple(base + k for k in range(seg)))
    return verts, faces


def extrude(outline, depth, axis="x"):
    """Flat profile [(a, b)] extruded symmetrically. axis x: profile is (z, y)."""
    n = len(outline)
    verts, faces = [], []
    for s in (-depth / 2, depth / 2):
        for a, b in outline:
            verts.append((s, b, a) if axis == "x" else (a, s, b) if axis == "y" else (a, b, s))
    faces.append(tuple(range(n - 1, -1, -1)))
    faces.append(tuple(range(n, 2 * n)))
    for i in range(n):
        i2 = (i + 1) % n
        faces.append((i, i2, n + i2, n + i))
    return verts, faces


def xf(geo, t=(0, 0, 0), r=(0, 0, 0), s=(1, 1, 1), order="XYZ"):
    """Scale, then rotate (euler, three.js axes), then translate."""
    verts, faces = geo
    rot = Euler(r, order).to_matrix()
    out = []
    for v in verts:
        v = Vector((v[0] * s[0], v[1] * s[1], v[2] * s[2]))
        out.append(tuple(rot @ v + Vector(t)))
    flip = (s[0] * s[1] * s[2]) < 0
    return out, ([tuple(reversed(f)) for f in faces] if flip else faces)


def keep(geo, pred):
    verts, faces = geo
    out = [f for f in faces if pred(tuple(sum(verts[i][k] for i in f) / len(f) for k in range(3)))]
    used = sorted({i for f in out for i in f})
    remap = {o: n for n, o in enumerate(used)}
    return [verts[i] for i in used], [tuple(remap[i] for i in f) for f in out]


def beam(a, b, r, seg=6):
    return tube([a, b], [r, r], seg)


# ---------------- scene plumbing ----------------

def material(slot):
    m = bpy.data.materials.get(slot)
    if not m:
        m = bpy.data.materials.new(slot)
        m.use_nodes = True
    c = SLOT_COLORS[slot]
    m.diffuse_color = (*c, 1)
    bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*c, 1)
        bsdf.inputs["Roughness"].default_value = 0.6
    return m


def coll():
    c = bpy.data.collections.get(COLL)
    if c:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        for me in [m for m in bpy.data.meshes if m.users == 0]:
            bpy.data.meshes.remove(me)
    else:
        c = bpy.data.collections.new(COLL)
        bpy.context.scene.collection.children.link(c)
    return c


def pivot(name, pos, parent=None, **props):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.3
    C.objects.link(e)
    e.parent = parent
    e.location = tb(pos)
    for k, v in props.items():
        e[k] = v
    return e


SHARP = math.radians(38)


def mesh(name, geo, slot, parent, ink=0.04, sharp=SHARP):
    verts, faces = geo
    me = bpy.data.meshes.new(name)
    me.from_pydata([tb(v) for v in verts], [], [tuple(reversed(f)) for f in faces])
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
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


def plume(parent, name, pos, radius, length, axis="z"):
    """A flame cone pivot at a nozzle: outer plume + hot core. axis z: points -z; y: points -y."""
    P = pivot(name, pos, parent, role="plume" if axis == "z" else "lift")
    prof = [(0, 0), (radius * 0.98, 0.0), (radius * 0.9, 0.18 * length), (radius * 0.62, 0.5 * length), (radius * 0.25, 0.85 * length), (0, length)]
    core = [(0, 0), (radius * 0.6, 0.0), (radius * 0.5, 0.2 * length), (radius * 0.25, 0.45 * length), (0, 0.62 * length)]
    rot = (-math.pi / 2, 0, 0) if axis == "z" else (math.pi, 0, 0)
    mesh(name + "_flame", xf(lathe(prof, 16), r=rot), "plume", P, 0, None)
    mesh(name + "_core", xf(lathe(core, 12), r=rot), "plumeCore", P, 0, None)
    return P




def export(out, objects):
    """Export these objects as a GLB the game reads (extras carry roles, ink and numbers)."""
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    kw = dict(filepath=out, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
              export_extras=True, export_normals=True, export_texcoords=False, export_materials="EXPORT",
              export_animations=False, export_cameras=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
    print("exported", out, os.path.getsize(out), "bytes")
