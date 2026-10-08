# Moon-runner model builder for Blender (4.2+ / 5.x).
#
# Builds the courier from code (no hand edits needed), in the same pivots and proportions as the
# old primitive runner in src/models.js, and exports src/assets/runner.glb. In Blender's Python
# console or via MCP:  exec(open(r"<repo>/tools/blender/build_runner.py").read())
#
# Conventions the game relies on (see loadRunnerParts in src/models.js):
# - Every mesh is a child of a pivot empty: legL, legR, torso, head, armL, armR, scarfLinks.
#   Its geometry is read in that pivot's frame, so pivots can sit anywhere (they're posed here so
#   the figure looks assembled in Blender).
# - Each mesh has ONE material whose name is a slot: suit, accent, helmet, visor, dark, metal,
#   glow, skate, scarf, collar, lens, glint. The game swaps in its own toon materials per slot,
#   which is how faction outfits recolour everything.
# - Custom property "ink" = outline thickness in metres (0 = none).
# - scarfLinks holds scarf0..scarf3: each link runs from z=0 back to z=-0.32 (three.js axes),
#   because ScarfSim rotates them as a chain.
#
# Everything below is authored in three.js axes (x right, y up, +z forward/face) and converted
# to Blender's (x, -z, y) on the way in, which the glTF exporter's +Y-up option converts back.

import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

def find_repo():
    """MOONRUNNER_REPO, else the repo this file sits in (Scripting tab "Run Script"), else the
    default checkout. exec(open(...).read()) leaves no __file__, hence the fallback."""
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_runner.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "runner.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Moon-runner export ->", OUT)
COLL = "MoonRunner"

SLOT_COLORS = {
    "suit": (1.0, 0.31, 0.18), "accent": (0.18, 0.9, 1.0), "helmet": (1.0, 0.96, 0.88),
    "visor": (0.14, 0.1, 0.36), "dark": (0.13, 0.11, 0.2), "metal": (0.23, 0.21, 0.31),
    "glow": (0.18, 0.9, 1.0), "skate": (0.18, 0.9, 1.0), "scarf": (1.0, 0.82, 0.25),
    "collar": (1.0, 0.82, 0.25), "lens": (1.0, 0.96, 0.66), "glint": (1.0, 1.0, 1.0),
}


def tb(p):
    """three.js axes -> Blender axes"""
    return (p[0], -p[2], p[1])


# ---------------- geometry helpers (three.js axes, return (verts, faces)) ----------------

def lathe(profile, segs=16, sx=1.0, sz=1.0, phase=0.0):
    """profile: [(r, y)] bottom to top; r == 0 rows collapse to a pole."""
    verts, faces, rows = [], [], []
    for r, y in profile:
        if r <= 1e-6:
            rows.append([len(verts)])
            verts.append((0.0, y, 0.0))
            continue
        row = []
        for i in range(segs):
            a = phase + 2 * math.pi * i / segs
            row.append(len(verts))
            verts.append((math.sin(a) * r * sx, y, math.cos(a) * r * sz))
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


def spe(v, e):
    return math.copysign(abs(v) ** e, v)


def superquad(sx, sy, sz, e1=0.35, e2=0.35, nu=16, nv=10):
    """Superellipsoid with half-sizes sx, sy, sz. e ~0.2 = boxy, 1 = sphere."""
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


def torus(R, r, seg=24, rseg=8, sy=1.0, arc=2 * math.pi):
    """Ring lying in the x-z plane (axis = y)."""
    verts, faces = [], []
    closed = arc >= 2 * math.pi - 1e-6
    n = seg if closed else seg + 1
    for i in range(n):
        a = arc * i / seg
        for k in range(rseg):
            b = 2 * math.pi * k / rseg
            rr = R + r * math.cos(b)
            verts.append((math.sin(a) * rr, r * math.sin(b) * sy, math.cos(a) * rr))
    for i in range(seg):
        i2 = (i + 1) % n if closed else i + 1
        for k in range(rseg):
            k2 = (k + 1) % rseg
            faces.append((i * rseg + k, i * rseg + k2, i2 * rseg + k2, i2 * rseg + k))
    return verts, faces


def tube(path, radii, seg=8, cap=True):
    """Round tube along a polyline (list of 3D points) with a radius per point."""
    verts, faces = [], []
    P = [Vector(p) for p in path]
    up = Vector((0, 1, 0))
    for idx, p in enumerate(P):
        t = (P[min(idx + 1, len(P) - 1)] - P[max(idx - 1, 0)]).normalized()
        ref = up if abs(t.dot(up)) < 0.95 else Vector((1, 0, 0))
        n = t.cross(ref).normalized()
        b = t.cross(n).normalized()
        for k in range(seg):
            a = 2 * math.pi * k / seg
            q = p + (n * math.cos(a) + b * math.sin(a)) * radii[idx]
            verts.append(tuple(q))
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
    """Flat profile [(a, b)] extruded symmetrically along an axis. axis x: profile is (z, y)."""
    n = len(outline)
    verts, faces = [], []
    for s in (-depth / 2, depth / 2):
        for a, b in outline:
            if axis == "x":
                verts.append((s, b, a))
            else:  # z: profile is (x, y)
                verts.append((a, b, s))
    faces.append(tuple(range(n - 1, -1, -1)))
    faces.append(tuple(range(n, 2 * n)))
    for i in range(n):
        i2 = (i + 1) % n
        faces.append((i, i2, n + i2, n + i))
    return verts, faces


def xf(geo, t=(0, 0, 0), r=(0, 0, 0), s=(1, 1, 1), fn=None):
    """Scale, then rotate (XYZ euler, three.js axes), then translate; fn(v) deforms first."""
    verts, faces = geo
    rot = Euler(r, "XYZ").to_matrix()
    out = []
    for v in verts:
        v = Vector(v)
        if fn:
            v = Vector(fn(v))
        v = Vector((v.x * s[0], v.y * s[1], v.z * s[2]))
        v = rot @ v
        out.append(tuple(v + Vector(t)))
    return out, faces


def cwrap(rx, rz):
    """Wrap a plate authored flat (x = arc length, z = thickness offset, facing +z) round an
    upright elliptic cylinder with radii rx, rz, so it hugs a limb or the chest."""
    R = (rx + rz) / 2
    def f(v):
        x, y, z = v
        a = x / R
        return ((rx + z) * math.sin(a), y, (rz + z) * math.cos(a))
    return f


def keep(geo, pred):
    """Only the faces whose centre passes pred: cuts a thin open shell (caps, trims) off a shape."""
    verts, faces = geo
    out = [f for f in faces if pred(tuple(sum(verts[i][k] for i in f) / len(f) for k in range(3)))]
    used = sorted({i for f in out for i in f})
    remap = {o: n for n, o in enumerate(used)}
    return [verts[i] for i in used], [tuple(remap[i] for i in f) for f in out]


def merge(*geos):
    verts, faces = [], []
    for v, f in geos:
        o = len(verts)
        verts += v
        faces += [tuple(i + o for i in face) for face in f]
    return verts, faces


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
        # drop the old meshes too, so rebuilt parts keep their plain names (no .001 suffixes)
        for me in [m for m in bpy.data.meshes if m.users == 0]:
            bpy.data.meshes.remove(me)
    else:
        c = bpy.data.collections.new(COLL)
        bpy.context.scene.collection.children.link(c)
    return c


def pivot(name, pos, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.12
    C.objects.link(e)
    e.parent = parent
    e.location = tb(pos)
    return e


def mesh(name, geo, slot, parent, ink=0.03, smooth=True, subd=0, flat_angle=None):
    verts, faces = geo
    me = bpy.data.meshes.new(name)
    me.from_pydata([tb(v) for v in verts], [], [tuple(reversed(f)) for f in faces])
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    C.objects.link(o)
    o.parent = parent
    me.materials.append(material(slot))
    if subd:
        mod = o.modifiers.new("subd", "SUBSURF")
        mod.levels = subd
        mod.render_levels = subd
    for p in me.polygons:
        p.use_smooth = smooth
    if smooth and flat_angle is not None:
        try:
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.shade_auto_smooth(angle=flat_angle)
            o.select_set(False)
        except Exception:
            pass
    o["ink"] = ink
    o["slot"] = slot
    return o


# ---------------- the runner ----------------

C = coll()
for s in SLOT_COLORS:
    material(s)

body = pivot("runner", (0, 0, 0))
HIP = 0.95

# ---- legs: smooth suit leg, knee guard, shin panel, side stripe, skate boot + mag-sled ----
LEG_PROFILE = [(0, -0.8), (0.085, -0.79), (0.104, -0.72), (0.117, -0.62), (0.121, -0.54), (0.112, -0.47),
               (0.118, -0.42), (0.128, -0.34), (0.146, -0.2), (0.157, -0.07), (0.15, 0.02), (0.11, 0.09), (0, 0.12)]
for side, name in ((-1, "legL"), (1, "legR")):
    L = pivot(name, (side * 0.2, HIP, 0), body)
    # calf bulges to the back, shin stays straight: push the back of the calf out a touch
    def calf(v):
        k = max(0.0, 1 - abs(v.y + 0.33) / 0.2)
        return (v.x, v.y, v.z - 0.022 * k if v.z < 0 else v.z)
    mesh(name + "_leg", xf(lathe(LEG_PROFILE, 14), fn=calf), "suit", L, 0.04)
    # piping down the outside of the leg in the outfit's accent colour
    path = [(side * 0.15, 0.0, 0.0), (side * 0.147, -0.2, 0.0), (side * 0.13, -0.36, 0.0),
            (side * 0.124, -0.5, 0.0), (side * 0.118, -0.64, 0.0)]
    mesh(name + "_stripe", tube(path, [0.018] * 5, 6), "accent", L, 0)
    # knee guard and shin plate: flat plates wrapped round the leg so they hug it
    mesh(name + "_knee", xf(superquad(0.1, 0.085, 0.022, 0.45, 0.4, 12, 6), (0, -0.45, 0), (0.08, 0, 0), fn=cwrap(0.128, 0.13)), "metal", L, 0.02)
    mesh(name + "_kneeRidge", xf(superquad(0.075, 0.014, 0.012, 0.4, 0.4, 10, 4), (0, -0.425, 0), (0.08, 0, 0), fn=cwrap(0.152, 0.155)), "accent", L, 0)
    mesh(name + "_shin", xf(superquad(0.08, 0.075, 0.016, 0.45, 0.4, 12, 6), (0, -0.6, 0), (-0.04, 0, 0), fn=cwrap(0.124, 0.126)), "metal", L, 0.015)

    # ---- the skate ----
    # high-top boot shell: wide at the sole, rounded toe sloping down, slimmer at the ankle
    def boot_shape(v, grow=1.0):
        x, y, z = v
        f = (y + 0.095) / 0.19  # 0 at sole, 1 at the boot collar
        x *= 1 - 0.18 * f
        if z > 0.05:
            y -= (z - 0.05) * 0.35 * f
        return (x * grow, (y + 0.095) * grow - 0.095, z * grow)
    BOOT = superquad(0.135, 0.095, 0.22, 0.3, 0.32, 16, 8)
    mesh(name + "_boot", xf(BOOT, (0, -0.82, 0.07), fn=boot_shape), "dark", L, 0.035)
    # ankle collar of the boot and its padded cuff
    mesh(name + "_bootTop", xf(lathe([(0, -0.07), (0.128, -0.065), (0.134, -0.02), (0.13, 0.03), (0.118, 0.045), (0.1, 0.03)], 14, 1.0, 1.12), (0, -0.74, 0.0)), "dark", L, 0.025)
    mesh(name + "_cuff", xf(torus(0.122, 0.028, 16, 6), (0, -0.69, 0.0), s=(1, 1, 1.1)), "accent", L, 0.02)
    # toe cap and heel counter: the boot's own shell grown a little and cut off, in the helmet colour
    # (cut from a denser copy of the shell so the cap edges come out clean, not stair-stepped)
    shell = xf(superquad(0.135, 0.095, 0.22, 0.3, 0.32, 28, 18), (0, -0.82, 0.07), fn=lambda v: boot_shape(v, 1.03))
    mesh(name + "_toe", keep(shell, lambda c: c[2] > 0.25 and c[1] < -0.77), "helmet", L, 0.012)
    mesh(name + "_heel", keep(shell, lambda c: c[2] < -0.125 and c[1] < -0.76), "helmet", L, 0.012)
    # two straps hugging the instep (a superellipse arch that follows the boot's taper), buckles outside
    def boot_top(zl):
        return -0.725 - max(0.0, zl - 0.05) * 0.35
    for k, zz in enumerate((0.17, 0.05)):
        ytop = boot_top(zz - 0.07) + 0.014
        arc = []
        for i in range(13):
            t = math.pi * i / 12
            c, sn = math.cos(t), math.sin(t)
            y = -0.9 + (ytop + 0.9) * abs(sn) ** 0.35
            f = min(1.0, max(0.0, (y + 0.915) / 0.19))
            hw = 0.135 * (1 - 0.18 * f) + 0.014
            arc.append((hw * math.copysign(abs(c) ** 0.35, c), y, zz))
        mesh(f"{name}_strap{k}", tube(arc, [0.02] * 13, 6), "accent", L, 0.01)
        mesh(f"{name}_buckle{k}", xf(superquad(0.01, 0.026, 0.028, 0.3, 0.3, 8, 4), (side * 0.152, -0.84, zz)), "metal", L, 0)
    # mag-sled chassis: a sleek plate a little longer than the boot, nose upturned
    def sled(v):
        x, y, z = v
        if z > 0.2:
            y += (z - 0.2) ** 2 * 2.2
        return (x, y, z)
    mesh(name + "_chassis", xf(superquad(0.105, 0.024, 0.32, 0.25, 0.3, 14, 6), (0, -0.935, 0.07), fn=sled), "metal", L, 0.02)
    # quantum-lock coil pods under the plate: three rings with glowing cores
    for k, zz in enumerate((-0.14, 0.07, 0.28)):
        mesh(f"{name}_coil{k}", xf(torus(0.05, 0.02, 12, 6), (0, -0.962 + (0.02 if k == 2 else 0), zz), s=(1.3, 1, 1)), "dark", L, 0.012)
        mesh(f"{name}_core{k}", xf(superquad(0.055, 0.016, 0.042, 0.6, 0.6, 10, 4), (0, -0.968 + (0.02 if k == 2 else 0), zz)), "skate", L, 0)
    # the glide rail: the long glowing blade the skate finish colours (blunt, rounded ends)
    mesh(name + "_rail", xf(superquad(0.03, 0.016, 0.33, 0.6, 0.25, 10, 6), (0, -0.986, 0.07), fn=sled), "skate", L, 0.015)
    # heel stabiliser fin with a glow strip, and running lights along both edges of the sled
    fin = extrude([(-0.11, -0.04), (-0.2, 0.04), (-0.235, 0.1), (-0.19, 0.11), (-0.07, 0.02)], 0.03)
    mesh(name + "_fin", xf(fin, (0, -0.86, 0)), "metal", L, 0.012)
    mesh(name + "_finGlow", xf(superquad(0.018, 0.012, 0.04, 0.6, 0.6, 8, 4), (0, -0.765, -0.2), (-0.75, 0, 0)), "skate", L, 0)
    for s2 in (-1, 1):
        mesh(f"{name}_edge{'L' if s2 < 0 else 'R'}", xf(superquad(0.008, 0.009, 0.25, 0.5, 0.3, 6, 4), (s2 * 0.104, -0.933, 0.06)), "skate", L, 0)

# ---- torso ----
T = pivot("torso", (0, HIP, 0), body)
TORSO = [(0, -0.02), (0.16, -0.01), (0.25, 0.04), (0.285, 0.14), (0.262, 0.3), (0.268, 0.4), (0.3, 0.52),
         (0.338, 0.66), (0.338, 0.78), (0.3, 0.9), (0.21, 0.99), (0.15, 1.04), (0, 1.07)]
def chest(v):
    # a broader back, a little pecs shelf at the front, flatter sides
    x, y, z = v
    k = max(0.0, 1 - abs(y - 0.72) / 0.22)
    if z > 0:
        z += 0.025 * k
    return (x, y, z)
mesh("torso_trunk", xf(lathe(TORSO, 18), s=(1, 1, 0.78), fn=chest), "suit", T, 0.04)
# side seams in accent
for s in (-1, 1):
    path = [(s * 0.29, 0.14, 0), (s * 0.262, 0.3, 0), (s * 0.27, 0.42, 0), (s * 0.31, 0.56, 0), (s * 0.338, 0.68, 0)]
    mesh(f"torso_seam{'L' if s < 0 else 'R'}", tube(path, [0.016] * 5, 6), "accent", T, 0)
# chest plate: a curved shield with a raised rim and a courier chevron
mesh("torso_plate", xf(superquad(0.215, 0.145, 0.035, 0.3, 0.3, 16, 8), (0, 0.65, 0), (-0.06, 0, 0), fn=cwrap(0.33, 0.29)), "accent", T, 0.03)
mesh("torso_plateInset", xf(superquad(0.17, 0.1, 0.012, 0.3, 0.3, 14, 6), (0, 0.655, 0), (-0.06, 0, 0), fn=cwrap(0.355, 0.315)), "helmet", T, 0)
chev = extrude([(-0.11, 0.03), (0.0, -0.05), (0.11, 0.03), (0.11, 0.075), (0.0, -0.005), (-0.11, 0.075)], 0.016, "z")
mesh("torso_chevron", xf(chev, (0, 0.635, 0), (-0.06, 0, 0), fn=cwrap(0.366, 0.326)), "accent", T, 0)
mesh("torso_light", xf(superquad(0.03, 0.03, 0.012, 1, 1, 10, 6), (0.135, 0.73, 0), (-0.06, 0, 0), fn=cwrap(0.36, 0.322)), "glow", T, 0)
mesh("torso_light2", xf(superquad(0.02, 0.02, 0.01, 1, 1, 8, 6), (-0.135, 0.73, 0), (-0.06, 0, 0), fn=cwrap(0.358, 0.32)), "glow", T, 0)
# utility belt with a buckle and side pouches
mesh("torso_belt", xf(torus(0.262, 0.042, 20, 5, 1.1), (0, 0.3, 0), s=(1, 1, 0.8)), "dark", T, 0.02)
mesh("torso_buckle", xf(superquad(0.075, 0.05, 0.025, 0.25, 0.25, 12, 6), (0, 0.3, 0.215)), "accent", T, 0.02)
mesh("torso_buckleCore", xf(superquad(0.03, 0.02, 0.01, 0.4, 0.4, 10, 4), (0, 0.3, 0.242)), "glow", T, 0)
for s in (-1, 1):
    mesh(f"torso_pouch{'L' if s < 0 else 'R'}", xf(superquad(0.045, 0.06, 0.05, 0.3, 0.3, 10, 6), (s * 0.26, 0.28, 0.08), (0, s * 0.5, 0)), "dark", T, 0.015)
    mesh(f"torso_pouchFlap{'L' if s < 0 else 'R'}", xf(superquad(0.047, 0.018, 0.052, 0.3, 0.3, 10, 4), (s * 0.262, 0.33, 0.082), (0, s * 0.5, 0)), "metal", T, 0)
# backpack: rounded shell, lid band, ribbed side vents, twin thrusters with glowing throats
mesh("torso_pack", xf(superquad(0.26, 0.31, 0.13, 0.3, 0.3, 18, 10), (0, 0.6, -0.35)), "dark", T, 0.045)
mesh("torso_packPanel", xf(superquad(0.19, 0.21, 0.03, 0.3, 0.3, 14, 8), (0, 0.58, -0.47)), "metal", T, 0.012)
mesh("torso_packLid", xf(superquad(0.2, 0.03, 0.025, 0.3, 0.3, 14, 4), (0, 0.78, -0.48)), "accent", T, 0.015)
for k in range(3):
    mesh(f"torso_packGlow{k}", xf(superquad(0.12, 0.008, 0.01, 0.4, 0.4, 10, 4), (0, 0.52 + k * 0.05, -0.502)), "glow", T, 0)
for s in (-1, 1):
    for k in range(3):
        mesh(f"torso_rib{'L' if s < 0 else 'R'}{k}", xf(superquad(0.012, 0.018, 0.09, 0.4, 0.4, 6, 4), (s * 0.262, 0.52 + k * 0.08, -0.35)), "metal", T, 0)
    mesh(f"torso_nozzle{'L' if s < 0 else 'R'}", xf(lathe([(0.085, -0.09), (0.098, -0.07), (0.088, -0.02), (0.07, 0.03), (0.075, 0.06), (0.05, 0.08), (0, 0.08)], 14), (s * 0.14, 0.25, -0.38)), "metal", T, 0.025)
    mesh(f"torso_throat{'L' if s < 0 else 'R'}", xf(lathe([(0, -0.085), (0.07, -0.085), (0.06, -0.06), (0, -0.05)], 14), (s * 0.14, 0.25, -0.38)), "glow", T, 0)
    # shoulder straps over the front
    path = [(s * 0.18, 0.95, -0.2), (s * 0.2, 0.99, -0.02), (s * 0.2, 0.93, 0.17), (s * 0.19, 0.82, 0.25)]
    mesh(f"torso_strap{'L' if s < 0 else 'R'}", tube(path, [0.03, 0.03, 0.03, 0.028], 6), "dark", T, 0.012)
# knitted collar (the scarf's wrap around the neck): a fat ring with ribs
def knit(v):
    x, y, z = v
    a = math.atan2(x, z)
    r = 1 + 0.05 * math.cos(a * 9)
    return (x * r, y, z * r)
mesh("torso_collar", xf(torus(0.235, 0.075, 27, 6, 1.15), (0, 0.97, 0), fn=knit), "collar", T, 0.03)

# ---- head ----
H = pivot("head", (0, 1.18, 0), T)
mesh("head_helmet", lathe([(0, -0.36), (0.19, -0.31), (0.29, -0.22), (0.35, -0.09), (0.36, 0.0), (0.35, 0.09), (0.31, 0.2), (0.24, 0.29), (0.13, 0.345), (0, 0.36)], 24), "helmet", H, 0.05)
# centre stripe over the crown in the accent colour
# polar angle from the crown: +40 deg sits just above the visor frame, -125 deg is low on the back
stripe = [(0, 0.367 * math.cos(math.radians(d)), 0.367 * math.sin(math.radians(d))) for d in range(40, -126, -15)]
mesh("head_stripe", tube(stripe, [0.03] * len(stripe), 6), "accent", H, 0)
# visor frame and glass: shells over the face
def shell(r, phi0, phi1, th0, th1, nu=20, nv=10, thick=0.0):
    verts, faces = [], []
    for j in range(nv + 1):
        th = th0 + (th1 - th0) * j / nv
        for i in range(nu + 1):
            ph = phi0 + (phi1 - phi0) * i / nu
            verts.append((r * math.sin(th) * math.sin(ph), r * math.cos(th), r * math.sin(th) * math.cos(ph)))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    if thick:
        n = len(verts)
        inner = [tuple(c * (1 - thick / r) for c in v) for v in verts]
        verts += inner
        faces += [tuple(reversed([i + n for i in f])) for f in faces[: nu * nv]]
        rim = [j * (nu + 1) for j in range(nv + 1)] + [nv * (nu + 1) + i for i in range(1, nu + 1)] + \
              [j * (nu + 1) + nu for j in range(nv - 1, -1, -1)] + [i for i in range(nu - 1, 0, -1)]
        for a, b in zip(rim, rim[1:] + rim[:1]):
            faces.append((b, a, a + n, b + n))
    return verts, faces
mesh("head_visorFrame", shell(0.372, -1.0, 1.0, 0.84, 2.1, 16, 7, 0.03), "dark", H, 0)
mesh("head_visor", shell(0.382, -0.88, 0.88, 0.93, 2.0, 16, 7, 0.012), "visor", H, 0)
g = mesh("head_glint", xf(superquad(0.05, 0.05, 0.05, 1, 1, 10, 6), (-0.14, 0.12, 0.34), (-0.35, -0.35, 0.5), (1.3, 0.5, 0.3)), "glint", H, 0)
mesh("head_glint2", xf(superquad(0.02, 0.02, 0.02, 1, 1, 8, 4), (-0.04, 0.18, 0.355), s=(1, 0.6, 0.3)), "glint", H, 0)
# ear pods with a glow ring
for s in (-1, 1):
    tag = "L" if s < 0 else "R"
    mesh(f"head_pod{tag}", xf(lathe([(0, -0.045), (0.1, -0.045), (0.11, -0.02), (0.1, 0.04), (0.07, 0.05), (0, 0.05)], 16), (s * 0.35, -0.01, -0.03), (0, 0, -s * math.pi / 2)), "accent", H, 0.02)
    mesh(f"head_podRing{tag}", xf(torus(0.06, 0.012, 16, 4), (s * 0.4, -0.01, -0.03), (0, 0, math.pi / 2)), "glow", H, 0)
mesh("head_rim", xf(torus(0.282, 0.036, 20, 5), (0, -0.195, 0)), "dark", H, 0.02)
# antenna with a glowing bead, and the helmet lamp on the right temple
mesh("head_antennaBase", xf(lathe([(0, 0), (0.04, 0), (0.035, 0.04), (0.015, 0.06), (0, 0.06)], 10), (0.22, 0.27, -0.1), (0, 0, -0.05)), "dark", H, 0.01)
mesh("head_antenna", tube([(0.22, 0.3, -0.1), (0.222, 0.45, -0.11), (0.226, 0.57, -0.12)], [0.014, 0.012, 0.01], 6), "dark", H, 0)
mesh("head_bead", xf(superquad(0.055, 0.055, 0.055, 1, 1, 10, 6), (0.226, 0.6, -0.12)), "glow", H, 0)
mesh("head_lamp", xf(lathe([(0, -0.05), (0.06, -0.05), (0.07, 0.03), (0.062, 0.05), (0, 0.05)], 12), (0.3, 0.15, 0.17), (math.pi / 2, 0, 0)), "dark", H, 0.015)
mesh("head_lens", xf(superquad(0.05, 0.05, 0.03, 1, 1, 12, 6), (0.3, 0.15, 0.225)), "lens", H, 0)

# ---- arms ----
ARM = [(0, -0.56), (0.072, -0.55), (0.084, -0.49), (0.093, -0.42), (0.088, -0.33), (0.094, -0.27), (0.108, -0.17), (0.118, -0.06), (0.12, 0.02), (0.1, 0.08), (0, 0.12)]
for side, name in ((-1, "armL"), (1, "armR")):
    A = pivot(name, (side * 0.45, 0.85, 0), T)
    mesh(name + "_arm", lathe(ARM, 14), "suit", A, 0.04)
    path = [(side * 0.118, -0.04, 0), (side * 0.11, -0.17, 0), (side * 0.092, -0.3, 0), (side * 0.09, -0.44, 0)]
    mesh(name + "_stripe", tube(path, [0.015] * 4, 6), "accent", A, 0)
    # layered shoulder pauldron in the helmet colour
    mesh(name + "_shoulder", xf(superquad(0.15, 0.125, 0.145, 0.55, 0.7, 14, 8), (side * 0.02, 0.01, 0), fn=lambda v: (v[0], max(v[1], -0.06), v[2])), "helmet", A, 0.03)
    mesh(name + "_shoulderTrim", xf(torus(0.145, 0.018, 16, 4), (side * 0.02, -0.055, 0), s=(1.05, 1, 1)), "accent", A, 0.01)
    mesh(name + "_elbow", xf(superquad(0.06, 0.07, 0.045, 0.6, 0.6, 12, 6), (0, -0.31, -0.08)), "metal", A, 0.015)
    mesh(name + "_cuff", xf(lathe([(0.098, -0.04), (0.104, -0.03), (0.104, 0.03), (0.096, 0.04)], 14), (0, -0.51, 0)), "accent", A, 0.02)
    mesh(name + "_cuffLight", xf(superquad(0.025, 0.012, 0.01, 0.5, 0.5, 8, 4), (0, -0.51, 0.104)), "glow", A, 0)
    # gauntlet glove: mitten body, knuckle plate, thumb
    mesh(name + "_glove", xf(superquad(0.105, 0.13, 0.09, 0.55, 0.65, 12, 8), (0, -0.635, 0.01)), "dark", A, 0.03)
    mesh(name + "_knuckle", xf(superquad(0.08, 0.035, 0.03, 0.4, 0.4, 10, 4), (0, -0.66, 0.085), (-0.15, 0, 0)), "metal", A, 0.01)
    mesh(name + "_thumb", xf(superquad(0.04, 0.065, 0.04, 0.8, 0.8, 8, 6), (-side * 0.06, -0.6, 0.08), (0.4, 0, side * 0.4)), "dark", A, 0.02)

# ---- scarf links (ScarfSim chain): each from z=0 back to z=-0.32, tapering ----
SL = 0.32
S = pivot("scarfLinks", (0, HIP + 1.04, -0.26), body)
def ribbon(w0, w1, length, thick=0.035, nz=4, nx=4, curl=0.03):
    verts, faces = [], []
    for j in range(nz + 1):
        t = j / nz
        z = 0.02 - (length + 0.02) * t  # a little overlap with the previous link
        w = w0 + (w1 - w0) * t
        for i in range(nx + 1):
            u = -1 + 2 * i / nx
            x = u * w / 2
            y = -curl * (1 - u * u)  # the ribbon cups slightly, like cloth
            verts.append((x, y + thick / 2, z))
    top = len(verts)
    for v in list(verts):
        verts.append((v[0], v[1] - thick, v[2]))
    row = nx + 1
    for j in range(nz):
        for i in range(nx):
            a = j * row + i
            faces.append((a, a + row, a + row + 1, a + 1))
            b = top + a
            faces.append((b, b + 1, b + row + 1, b + row))
    for j in range(nz):
        for i in (0, nx):
            a, b = j * row + i, (j + 1) * row + i
            faces.append((a, top + a, top + b, b) if i == 0 else (a, b, top + b, top + a))
    for j in (0, nz):
        for i in range(nx):
            a, b = j * row + i, j * row + i + 1
            faces.append((a, b, top + b, top + a) if j == 0 else (a, top + a, top + b, b))
    return verts, faces
for k in range(4):
    w0, w1 = 0.22 * (1 - k * 0.1), 0.22 * (1 - (k + 1) * 0.1)
    mesh(f"scarf{k}", ribbon(w0, w1 if k < 3 else w0 * 0.95, SL), "scarf", S, 0.025)
# the tail: two accent bands and a fringe of tassels on the last link (still parented by name)
for b, z in enumerate((-0.17, -0.24)):
    mesh(f"scarf3_band{b}", xf(superquad(0.156 * 0.5 + 0.004, 0.022, 0.018, 0.2, 0.2, 10, 4), (0, -0.012, z)), "accent", S, 0)
for i in range(5):
    x = -0.06 + i * 0.03
    mesh(f"scarf3_tassel{i}", tube([(x, -0.01, -SL + 0.01), (x * 1.1, -0.015, -SL - 0.05), (x * 1.15, -0.018, -SL - 0.09)], [0.012, 0.011, 0.008], 5), "scarf", S, 0)

print("built", len(C.objects), "objects")


def export():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in C.objects:
        o.select_set(True)
    kw = dict(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
              export_extras=True, export_normals=True, export_texcoords=False, export_materials="EXPORT",
              export_animations=False, export_cameras=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
    print("exported", OUT, os.path.getsize(OUT), "bytes")


if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export()
