# Shared geometry and scene helpers for the Blender build scripts. Load with
# exec(open(<repo>/tools/blender/kit.py).read(), globals())  after setting COLL (the collection to rebuild) and
# SLOT_COLORS (preview colour per material slot). A script needing a variant (build_runner.py's lathe and mesh,
# build_ships.py's ring_pts and mesh) defines its own after the exec, replacing the kit's.
#
# Authored in three.js axes (x right, y up, +z forward), converted to Blender's (x, -z, y) on the way in; the glTF
# exporter's +Y-up option converts back.

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


def join(geos):
    verts, faces = [], []
    for v, f in geos:
        o = len(verts)
        verts.extend(v)
        faces.extend([tuple(i + o for i in fc) for fc in f])
    return verts, faces


def merge(*geos):
    """join() with the geometries as arguments"""
    return join(geos)


def B(a, b, r, seg=4, cap=False):
    """A strut between two points (open ends by default: they sit inside the members they join)."""
    return tube([a, b], [r, r], seg, cap)


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


# ---------------- three.js-style primitives and smooth-shaded meshes (build_outposts.py) ----------------
# Same vertex layout as THREE.BoxGeometry / CylinderGeometry / SphereGeometry / TorusGeometry / PlaneGeometry, so a port
# lines up with the game's. Each returns (verts, faces, smooth) in three.js axes: faces counter-clockwise from outside,
# one smoothing group per face (0 = flat; faces of group n > 0 share normals; edges between groups stay hard, like
# three.js's split caps). Place with place(), build with mesh_smooth().

from mathutils import Matrix


def place(geo, m):
    """Apply a 4x4 matrix (three.js axes) to a primitive."""
    verts, faces, smooth = geo
    return [tuple(m @ Vector(v)) for v in verts], faces, smooth


def cuboid(w, h, d):
    x, y, z = w / 2, h / 2, d / 2
    v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    return v, [(4, 5, 6, 7), (1, 0, 3, 2), (5, 1, 2, 6), (0, 4, 7, 3), (3, 7, 6, 2), (0, 1, 5, 4)], [0] * 6


def plane(w, h):
    """A single quad in the xy plane facing +z."""
    x, y = w / 2, h / 2
    return [(-x, -y, 0.0), (x, -y, 0.0), (x, y, 0.0), (-x, y, 0.0)], [(0, 1, 2, 3)], [0]


def cylinder(rt, rb, h, seg, open_ended=False):
    """Axis y, centred; the first vertex of a ring is at +z and angles run towards +x (like THREE.CylinderGeometry)."""
    verts = []

    def ring(r, y):
        if r <= 1e-9:  # a cone's apex
            verts.append((0.0, y, 0.0))
            return [len(verts) - 1] * seg
        idx = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            idx.append(len(verts))
            verts.append((math.sin(a) * r, y, math.cos(a) * r))
        return idx

    top, bot = ring(rt, h / 2), ring(rb, -h / 2)
    faces, smooth = [], []
    for i in range(seg):
        j = (i + 1) % seg
        f = tuple(dict.fromkeys((bot[i], bot[j], top[j], top[i])))  # drops the repeated apex index
        faces.append(f)
        smooth.append(1)
    if not open_ended:
        if rt > 1e-9:
            faces.append(tuple(top)); smooth.append(0)
        if rb > 1e-9:
            faces.append(tuple(reversed(bot))); smooth.append(0)
    return verts, faces, smooth


def sphere(r, wseg, hseg, theta_len=math.pi):
    """Pole at +y, a cap when theta_len < pi (like THREE.SphereGeometry with phi = 2 pi, theta from 0)."""
    verts, grid = [], []
    for iy in range(hseg + 1):
        th = theta_len * iy / hseg
        rr, y = r * math.sin(th), r * math.cos(th)
        if rr <= 1e-9:
            verts.append((0.0, y, 0.0))
            grid.append([len(verts) - 1] * wseg)
            continue
        row = []
        for ix in range(wseg):
            ph = 2 * math.pi * ix / wseg
            row.append(len(verts))
            verts.append((-rr * math.cos(ph), y, rr * math.sin(ph)))
        grid.append(row)
    faces = []
    for iy in range(hseg):
        for ix in range(wseg):
            i2 = (ix + 1) % wseg
            faces.append(tuple(dict.fromkeys((grid[iy][i2], grid[iy][ix], grid[iy + 1][ix], grid[iy + 1][i2]))))
    return verts, faces, [1] * len(faces)


def torus_arc(R, r, tubular, radial):
    """A full ring lying in the x-z plane (axis y), like THREE.TorusGeometry(R, r, radial, tubular).rotateX(pi / 2)."""
    verts, faces = [], []
    for i in range(tubular):
        u = 2 * math.pi * i / tubular
        for k in range(radial):
            v = 2 * math.pi * k / radial
            rr = R + r * math.cos(v)
            verts.append((rr * math.cos(u), -r * math.sin(v), rr * math.sin(u)))
    for i in range(tubular):
        i2 = (i + 1) % tubular
        for k in range(radial):
            k2 = (k + 1) % radial
            faces.append((i * radial + k, i2 * radial + k, i2 * radial + k2, i * radial + k2))
    return verts, faces, [1] * len(faces)


def mesh_smooth(name, geo, slot, parent, ink=0.04):
    """mesh() for the primitives above: winding kept (no recalculation), edges smooth only inside a smoothing group, so
    cylinders are round with hard caps and boxes stay crisp."""
    verts, faces, smooth = geo
    bm = bmesh.new()
    vs = [bm.verts.new(tb(v)) for v in verts]
    for f, g in zip(faces, smooth):
        bm.faces.new([vs[i] for i in f]).smooth = g > 0
    bm.faces.index_update()
    for e in bm.edges:
        lf = e.link_faces
        e.smooth = len(lf) < 2 or (smooth[lf[0].index] > 0 and smooth[lf[0].index] == smooth[lf[1].index])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    C.objects.link(o)
    o.parent = parent
    me.materials.append(material(slot))
    o["ink"] = float(ink)
    o["slot"] = slot
    return o


def cylinder_arc(rt, rb, h, seg, theta_start=0.0, theta_len=2 * math.pi):
    """An OPEN cylinder shell over an arc: THREE.CylinderGeometry(rt, rb, h, seg, 1, true, thetaStart, thetaLength).
    Axis y, centred; angle t at (sin t, cos t) like cylinder() (t = 0 is +z, runs towards +x). A partial arc has seg + 1
    columns and open ends; a full turn wraps. No caps: pair with a double-sided material."""
    full = theta_len >= 2 * math.pi - 1e-9
    cols = seg if full else seg + 1
    verts, top, bot = [], [], []
    for i in range(cols):
        t = theta_start + theta_len * i / seg
        top.append(len(verts))
        verts.append((math.sin(t) * rt, h / 2, math.cos(t) * rt))
        bot.append(len(verts))
        verts.append((math.sin(t) * rb, -h / 2, math.cos(t) * rb))
    faces = [(bot[i], bot[(i + 1) % cols], top[(i + 1) % cols], top[i]) for i in range(seg)]
    return verts, faces, [1] * len(faces)


def torus_partial(R, r, radial, tubular, arc=math.pi):
    """THREE.TorusGeometry(R, r, radial, tubular, arc) as built: a tube round an arc in the x-y plane from +x,
    counter-clockwise (towards +y) through `arc`; open ends when arc < 2 pi. (torus_arc() is the full ring lying flat.)"""
    full = arc >= 2 * math.pi - 1e-9
    cols = tubular if full else tubular + 1
    verts = []
    for i in range(cols):
        u = arc * i / tubular
        for k in range(radial):
            v = 2 * math.pi * k / radial
            rr = R + r * math.cos(v)
            verts.append((rr * math.cos(u), rr * math.sin(u), r * math.sin(v)))
    faces = []
    for i in range(tubular):
        i2 = (i + 1) % cols
        for k in range(radial):
            k2 = (k + 1) % radial
            faces.append((i * radial + k, i2 * radial + k, i2 * radial + k2, i * radial + k2))
    return verts, faces, [1] * len(faces)


# ---------------- build-time check: z-fighting surfaces ----------------

def audit_coplanar(objects=None, eps=0.003, min_area=1e-4, allow=()):
    """Raise if two mesh objects have same-facing triangles on one plane (within eps m) overlapping by more than
    min_area m2: the depth buffer can't separate them and they flicker. (tools/casino-zfight.mjs runs the same test on
    the live scene.) `allow`: (name fragment, name fragment) pairs known and intended. Run after building, before export."""
    dg = bpy.context.evaluated_depsgraph_get()
    tris = []
    for oi, o in enumerate(objects if objects is not None else C.objects):
        if o.type != "MESH":
            continue
        top = o
        while top.parent:
            top = top.parent
        e = o.evaluated_get(dg)
        me = e.to_mesh()
        me.calc_loop_triangles()
        mw = e.matrix_world
        for lt in me.loop_triangles:
            ps = []
            for vi in lt.vertices:
                w = mw @ me.vertices[vi].co
                ps.append((w.x, w.z, -w.y))                      # back to three.js axes
            a, b, c = ps
            ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
            vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            ln = math.sqrt(nx * nx + ny * ny + nz * nz)
            if ln < 2e-4:
                continue
            nx, ny, nz = nx / ln, ny / ln, nz / ln
            tris.append((oi, o.name, (nx, ny, nz), nx * a[0] + ny * a[1] + nz * a[2], ps, top.name))
    buckets = {}
    for i, t in enumerate(tris):
        n = t[2]
        buckets.setdefault((round(n[0] * 200), round(n[1] * 200), round(n[2] * 200), math.floor(t[3] / 0.02)), []).append(i)

    def area2(P):
        return sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P))) / 2

    def clip(subject, tri):
        out = subject
        for i in range(3):
            A, Bp = tri[i], tri[(i + 1) % 3]
            inp, out = out, []
            if not inp:
                break
            side = lambda P: (Bp[0] - A[0]) * (P[1] - A[1]) - (Bp[1] - A[1]) * (P[0] - A[0])
            for j in range(len(inp)):
                P, Q = inp[j], inp[(j + 1) % len(inp)]
                sp, sq = side(P), side(Q)
                if sp >= 0:
                    out.append(P)
                if (sp >= 0) != (sq >= 0):
                    t = sp / (sp - sq)
                    out.append((P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t))
        return out

    found = {}

    def test(i, j):
        A, Bt = tris[i], tris[j]
        if A[0] == Bt[0] or A[5] != Bt[5]:       # same mesh, or different models that merely share the origin
            return
        if A[2][0] * Bt[2][0] + A[2][1] * Bt[2][1] + A[2][2] * Bt[2][2] < 0.9999 or abs(A[3] - Bt[3]) > eps:
            return
        if any((f in A[1] and g in Bt[1]) or (g in A[1] and f in Bt[1]) for f, g in allow):
            return
        n = A[2]
        ax = 0 if abs(n[0]) > abs(n[1]) and abs(n[0]) > abs(n[2]) else 1 if abs(n[1]) > abs(n[2]) else 2
        u, v = (ax + 1) % 3, (ax + 2) % 3
        ta, tb = [(p[u], p[v]) for p in A[4]], [(p[u], p[v]) for p in Bt[4]]
        if area2(ta) < 0:
            ta = [ta[0], ta[2], ta[1]]
        if area2(tb) < 0:
            tb = [tb[0], tb[2], tb[1]]
        ov = abs(area2(clip(ta, tb)))
        if ov < 1e-9:
            return
        k = (min(A[1], Bt[1]), max(A[1], Bt[1]), round(A[3] * 50))
        f = found.setdefault(k, [0.0, A[4][0]])
        f[0] += ov

    for key, lst in buckets.items():
        nb = buckets.get((key[0], key[1], key[2], key[3] + 1), [])
        for xi in range(len(lst)):
            for yi in range(xi + 1, len(lst)):
                test(lst[xi], lst[yi])
            for yi in nb:
                test(lst[xi], yi)
    bad = {k: v for k, v in found.items() if v[0] >= min_area}
    if bad:
        lines = [f"{v[0]:.4f} m2  {k[0]} / {k[1]}  at ({v[1][0]:.2f}, {v[1][1]:.2f}, {v[1][2]:.2f})" for k, v in sorted(bad.items(), key=lambda kv: -kv[1][0])[:12]]
        raise RuntimeError("coplanar overlaps (these would z-fight):\n  " + "\n  ".join(lines))
    print(f"AUDIT coplanar ok: {len(tris)} triangles, no overlap above {min_area} m2 within {eps * 1000:.0f} mm")
