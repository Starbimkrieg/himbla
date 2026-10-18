# Transit ship builder for Blender (4.2+ / 5.x): the shuttle-bus and the cargo freighter.
#
# Builds both flyers from code and exports src/assets/ships.glb. In Blender's Python console or
# via MCP:  exec(open(r"<repo>/tools/blender/build_ships.py").read())
#
# Conventions the game relies on (see loadShipParts / makeShip in src/models.js):
# - One root empty per ship ("shuttle", "freighter") holding its numbers as custom properties
#   (gearH, deck, deckY, deckZ, inside, rampTop, rampBottom...) in three.js axes.
# - Every mesh is a child of a pivot empty, and is read in that pivot's frame. Pivots carry a
#   "role" the game animates:
#     hull    static
#     leg     landing leg, authored deployed (pointing down); folds by rotating "fold" rad about x
#     foot    child of a leg; counter-rotates so the pad stays level while the leg folds
#     door    gear-bay door, authored closed; opens by rotating "open" rad about z
#     ramp    authored open-flat along -z; "closed" / "opened" are its x rotations
#     hatch   lit doorway, only shown while the ramp is open
#     plume   main thruster flame along -z (pulses while flying)
#     lift    belly lift-jet flame along -y (on while climbing off / settling onto a pad)
#     board   a route board (the shuttle's destination sign): the pivot sits at the middle of the display
#             face, +z out of the face; "w" / "h" = the face in metres, "faces" = 1 (front) or 2 (back too).
#             Its meshes are the housing; the game draws the lit text on the face.
# - Each mesh has ONE material whose name is a slot (body, stripe, trim, dark, ...). The game
#   swaps in its own toon / glow materials per slot, which is how liveries recolour.
# - Custom property "ink" = outline thickness in metres (0 = none).
#
# Everything below is authored in three.js axes (x right, y up, +z forward/nose) and converted
# to Blender's (x, -z, y) on the way in, which the glTF exporter's +Y-up option converts back.

import bpy, bmesh, math, os
from mathutils import Vector, Euler, Matrix


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_ships.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("SHIPS_OUT") or os.path.join(REPO, "src", "assets", "ships.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Ships export ->", OUT)
COLL = "MoonShips"

# preview colours only: the game replaces every slot with its own material
SLOT_COLORS = {
    "body": (0.95, 0.93, 0.86), "stripe": (0.18, 0.77, 1.0), "trim": (0.85, 0.83, 0.91),
    "dark": (0.13, 0.11, 0.2), "metal": (0.54, 0.53, 0.63), "steel": (0.33, 0.38, 0.48),
    "bay": (0.06, 0.05, 0.1), "deck": (0.36, 0.35, 0.44), "hazard": (1.0, 0.82, 0.25),
    "glass": (0.6, 0.9, 1.0), "glassDeep": (0.38, 0.74, 0.94), "glassHi": (0.93, 0.99, 1.0), "window": (1.0, 0.96, 0.66), "cabin": (1.0, 0.95, 0.69),
    "engine": (1.0, 0.62, 0.11), "core": (1.0, 0.95, 0.75), "red": (1.0, 0.16, 0.29),
    "green": (0.49, 1.0, 0.42), "white": (1.0, 1.0, 1.0), "sign": (1.0, 0.82, 0.25),
    "plume": (1.0, 0.55, 0.15), "plumeCore": (1.0, 0.95, 0.8), "lift": (0.55, 0.85, 1.0),
    "cargo0": (1.0, 0.82, 0.25), "cargo1": (0.18, 0.77, 1.0), "cargo2": (1.0, 0.23, 0.36), "cargo3": (0.49, 1.0, 0.42),
    # (the land-train cargo units in the bays: under a "cargo" pivot the game uses its land-train palette for every slot)
    "accent": (0.42, 0.56, 0.23), "label": (0.16, 0.14, 0.25), "tire": (0.1, 0.09, 0.14), "lamp": (1.0, 0.96, 0.66), "tail": (1.0, 0.16, 0.29),
    "hot": (1.0, 0.62, 0.11), "tank": (0.78, 0.84, 0.92), "brand": (0.08, 0.64, 0.72), "redsafe": (0.79, 0.13, 0.18),
    "orange": (1.0, 0.48, 0.1), "blue": (0.11, 0.39, 0.84),
    "beacon": (1.0, 0.3, 0.25),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "cargo.py"), encoding="utf-8").read(), globals())


# ---------------- geometry helpers (three.js axes, return (verts, faces)) ----------------

def ring_pts(w, top, bot, eT, eB, yc=0.0, n=32):
    """A superellipse cross-section in the x-y plane: half-width w, top/bot heights above/below
    yc, exponents eT/eB (2 = ellipse, 4+ = squircle, big = flat). Starts at +x, goes over the top."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        e = eT if s >= 0 else eB
        h = top if s >= 0 else bot
        pts.append((w * spe(c, 2 / e), yc + h * spe(s, 2 / e)))
    return pts


def surf_x(sec, y):
    """Half-width of a cross-section at height y (for sticking things on the flank)."""
    yc = sec.get("yc", 0.0)
    h = sec["t"] if y >= yc else sec["b"]
    e = sec.get("eT", 2.5) if y >= yc else sec.get("eB", 2.5)
    k = min(1.0, abs(y - yc) / h)
    return sec["w"] * (1 - k ** e) ** (1 / e)


def lerp_sec(sections, z):
    for a, b in zip(sections, sections[1:]):
        if a["z"] <= z <= b["z"]:
            t = (z - a["z"]) / ((b["z"] - a["z"]) or 1)
            out = {"z": z}
            for k in ("w", "t", "b", "eT", "eB", "yc"):
                out[k] = a.get(k, 2.5 if k[0] == "e" else 0.0) * (1 - t) + b.get(k, 2.5 if k[0] == "e" else 0.0) * t
            return out
    return dict(sections[-1] if z > sections[-1]["z"] else sections[0])


def densify(sections, step=0.4):
    """Extra cross-sections every `step` metres, so bands cut from the hull have clean edges."""
    out = []
    for a, b in zip(sections, sections[1:]):
        n = max(1, int(math.ceil((b["z"] - a["z"]) / step)))
        for i in range(n):
            out.append(lerp_sec(sections, a["z"] + (b["z"] - a["z"]) * i / n))
    out.append(dict(sections[-1]))
    return out


def band(sections, d, pred, n=220, step=0.14):
    """A skin laid over the hull (pushed out by d), cut to the faces whose centre passes pred."""
    return keep(loft(grow(densify(sections, step), d), n, False, False), pred)


def clip(geo, axis, lo, hi):
    """Every face cut exactly to lo <= coord[axis] <= hi (Sutherland-Hodgman against both planes).
    keep() drops or keeps whole faces, so a band cut across the hull's quads at a slant came out
    with a sawtooth edge; this one is ruler-straight. (Shared cut vertices are welded in mesh().)"""
    verts, faces = geo
    out_v, out_f = [], []

    def cut(poly, inside, t_of):
        res = []
        for i, a in enumerate(poly):
            b = poly[(i + 1) % len(poly)]
            ia, ib = inside(a), inside(b)
            if ia:
                res.append(a)
            if ia != ib:
                t = t_of(a, b)
                res.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
        return res

    for f in faces:
        poly = [tuple(verts[i]) for i in f]
        poly = cut(poly, lambda v: v[axis] >= lo, lambda a, b: (lo - a[axis]) / (b[axis] - a[axis]))
        if len(poly) >= 3:
            poly = cut(poly, lambda v: v[axis] <= hi, lambda a, b: (hi - a[axis]) / (b[axis] - a[axis]))
        if len(poly) >= 3:
            o = len(out_v)
            out_v += poly
            out_f.append(tuple(range(o, o + len(poly))))
    return out_v, out_f


def cband(sections, d, ylo, yhi, zlo=-1e9, zhi=1e9, n=220, step=0.14):
    """A level band laid over the hull between two heights (and optionally two stations), with
    clean, straight edges."""
    return clip(clip(loft(grow(densify(sections, step), d), n, False, False), 1, ylo, yhi), 2, zlo, zhi)


def grow(sections, d):
    """The same hull pushed out by d (for bands and glazing laid over it)."""
    return [{**s, "w": s["w"] + d, "t": s["t"] + d, "b": s["b"] + d} for s in sections]


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


def rbox(sx, sy, sz, e=0.18, nu=16, nv=8):
    """Rounded box (half-sizes)."""
    return superquad(sx, sy, sz, e, e, nu, nv)


def tube(path, radii, seg=8, cap=True):
    """Round tube along a polyline with a radius per point."""
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
    """Flat profile [(a, b)] extruded symmetrically. axis x: profile is (z, y); y: (x, z); z: (x, y)."""
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


def xf(geo, t=(0, 0, 0), r=(0, 0, 0), s=(1, 1, 1), fn=None, order="XYZ"):
    """Scale, then rotate (euler, three.js axes), then translate; fn(v) deforms first."""
    verts, faces = geo
    rot = Euler(r, order).to_matrix()
    out = []
    for v in verts:
        v = Vector(v)
        if fn:
            v = Vector(fn(v))
        v = Vector((v.x * s[0], v.y * s[1], v.z * s[2]))
        out.append(tuple(rot @ v + Vector(t)))
    flip = (s[0] * s[1] * s[2]) < 0
    return out, ([tuple(reversed(f)) for f in faces] if flip else faces)


def keep(geo, pred):
    """Only the faces whose centre passes pred: cuts a band / panel off a shape."""
    verts, faces = geo
    out = [f for f in faces if pred(tuple(sum(verts[i][k] for i in f) / len(f) for k in range(3)))]
    used = sorted({i for f in out for i in f})
    remap = {o: n for n, o in enumerate(used)}
    return [verts[i] for i in used], [tuple(remap[i] for i in f) for f in out]


def mirror_x(geo):
    return merge(geo, xf(geo, s=(-1, 1, 1)))


def clipf(geo, *fields):
    """Every face cut exactly where each field f(v) crosses zero (kept where f >= 0): edges are split at
    the crossing, so on a dense mesh the cut follows f's curve with no sawtooth (keep() drops or keeps
    whole faces). Several fields cut one after another, so corners stay sharp; -f is the complement."""
    verts, faces = geo
    polys = [[tuple(verts[i]) for i in f] for f in faces]
    for fn in fields:
        out = []
        for poly in polys:
            vals = [fn(p) for p in poly]
            res = []
            for i, a in enumerate(poly):
                j = (i + 1) % len(poly)
                b, fa, fb = poly[j], vals[i], vals[j]
                if fa >= 0:
                    res.append(a)
                if (fa >= 0) != (fb >= 0):
                    t = fa / (fa - fb)
                    res.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
            if len(res) >= 3:
                out.append(res)
        polys = out
    out_v, out_f = [], []
    for poly in polys:
        o = len(out_v)
        out_v += poly
        out_f.append(tuple(range(o, o + len(poly))))
    return out_v, out_f


def pl(pts):
    """A piecewise-linear function through (x, y) points, flat beyond the ends."""
    def f(x):
        if x <= pts[0][0]:
            return pts[0][1]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x <= x1:
                return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        return pts[-1][1]
    return f


def smin(vals, k):
    """Smooth minimum: the intersection of several fields with its corners rounded by about k."""
    m = min(vals)
    return m if k <= 0 else m - k * math.log(sum(math.exp(-(v - m) / k) for v in vals))


def pchip(xs, ys):
    """A monotone cubic through the points (no overshoot between them): returns f(x)."""
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def end(h0, h1, d0, d1):
        v = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
        if v * d0 <= 0:
            return 0.0
        if d0 * d1 <= 0 and abs(v) > 3 * abs(d0):
            return 3 * d0
        return v
    m[0] = end(h[0], h[1], d[0], d[1])
    m[-1] = end(h[-1], h[-2], d[-1], d[-2])

    def f(x):
        i = max(0, min(n - 2, next((k for k in range(n - 1) if x <= xs[k + 1]), n - 2)))
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f


def smooth_sections(sections, z_from, step=0.3):
    """The hull from z_from forward, re-cut every `step` metres along monotone curves through its
    sections: the same shape, with the facets of a few long panels rounded off."""
    tail = [s for s in sections if s["z"] >= z_from]
    zs = [s["z"] for s in tail]
    curves = {k: pchip(zs, [s.get(k, 2.5 if k[0] == "e" else 0.0) for s in tail]) for k in ("w", "t", "b", "eT", "eB", "yc")}
    n = int(round((zs[-1] - zs[0]) / step))
    pts = [zs[0] + (zs[-1] - zs[0]) * i / n for i in range(n + 1)]
    return [s for s in sections if s["z"] < z_from] + [{"z": z, **{k: c(z) for k, c in curves.items()}} for z in pts]


def hull_field(sections, x, y, z):
    """< 1 inside the lofted hull, 1 on its skin, > 1 outside."""
    s = lerp_sec(sections, z)
    top = y >= s["yc"]
    e = s["eT"] if top else s["eB"]
    h = s["t"] if top else s["b"]
    return (abs(x) / s["w"]) ** e + (abs(y - s["yc"]) / h) ** e


def hull_pt(sections, x, y, z0=5.0, z1=10.3):
    """Where the nose skin is at (x, y), and the outward normal there: (point, normal)."""
    lo, hi = z0, z1
    for _ in range(40):
        mid = (lo + hi) / 2
        if hull_field(sections, x, y, mid) <= 1.0:
            lo = mid
        else:
            hi = mid
    e = 1e-3
    g = Vector((hull_field(sections, x + e, y, lo) - hull_field(sections, x - e, y, lo),
                hull_field(sections, x, y + e, lo) - hull_field(sections, x, y - e, lo),
                hull_field(sections, x, y, lo + e) - hull_field(sections, x, y, lo - e)))
    return Vector((x, y, lo)), g.normalized()


def stick(geo, sections, x, y, lift=0.0):
    """geo (authored facing +z, origin at its back) set onto the nose skin at (x, y): +z along the skin's
    normal, x kept level, lifted `lift` off it."""
    p, n = hull_pt(sections, x, y)
    right = Vector((0, 1, 0)).cross(n).normalized()
    up = n.cross(right)
    e = Matrix((right, up, n)).transposed().to_euler("XYZ")
    return xf(geo, tuple(p + n * lift), (e.x, e.y, e.z))


def airfoil_fin(span, c_root, c_tip, sweep, t_root, t_tip, tip_round=0.2, inflate=0.0, nsec=4, m=11):
    """A fin lofted through airfoil sections: span along +y from the root (y = 0), the leading edge at z = 0 on
    the root and raked back (-z) by `sweep` at the tip, thickness along x. Chord and thickness taper root to tip
    (t = thickness / chord), the leading edge is round and the trailing edge fine, and the last `tip_round` of
    the span closes in along an ellipse so the tip is rounded off. `inflate` thickens it a hair (for a livery
    band laid over a fin of the same shape). Returns (verts, faces)."""
    xs = [(1 - math.cos(math.pi * i / m)) / 2 for i in range(m + 1)]            # chord stations, leading to trailing edge
    half = lambda xc, tc: 5 * tc * (0.2969 * math.sqrt(xc) - 0.1260 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4)
    outline = [(xc, 1) for xc in xs] + [(xc, -1) for xc in reversed(xs[1:-1])]
    stations = [i / nsec * (1 - tip_round) for i in range(nsec)]
    stations += [(1 - tip_round) + tip_round * math.sin(j / 4 * math.pi / 2) for j in range(5)]
    verts, faces = [], []
    for f in stations:
        shrink = 1.0 if f <= 1 - tip_round else math.cos((f - (1 - tip_round)) / tip_round * math.pi / 2)
        c = (c_root + (c_tip - c_root) * f) * shrink
        tc = t_root + (t_tip - t_root) * f
        for xc, sgn in outline:
            verts.append((sgn * (half(xc, tc) * c + inflate * shrink), span * f, -sweep * f - xc * c))
    n = len(outline)
    for j in range(len(stations) - 1):
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    return verts, faces


# ---------------- scene plumbing ----------------

def pivot(name, pos, parent=None, **props):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.5
    C.objects.link(e)
    e.parent = parent
    e.location = tb(pos)
    for k, v in props.items():
        e[k] = v
    return e


SHARP = math.radians(38)


def mesh(name, geo, slot, parent, ink=0.06, sharp=SHARP):
    """sharp: edges creased more than this shade hard (None = all smooth, 0 = all flat)."""
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


C = coll()
for s in SLOT_COLORS:
    material(s)


# =============================================================================================
# Shared parts
# =============================================================================================

def landing_leg(ship, name, hinge, length, fold, r=0.22, pad=0.65, ink=0.04, scale=1.0):
    """A folding leg pivot at the hinge (inside the hull), deployed straight down, foot pad at
    -length. fold: x rotation that stows it (+ = swings the foot back toward -z)."""
    L = pivot(name, hinge, ship, role="leg", fold=fold)
    s = scale
    mesh(name + "_knuckle", rbox(r * 1.5, r * 1.3, r * 1.6, 0.3), "dark", L, ink)
    mesh(name + "_strut", tube([(0, -0.1 * s, 0), (0, -length * 0.55, 0)], [r, r * 0.9], 10), "metal", L, ink)
    mesh(name + "_collar", xf(torus(r * 1.05, r * 0.32, 14, 6), (0, -length * 0.5, 0)), "hazard", L, 0)
    mesh(name + "_oleo", tube([(0, -length * 0.5, 0), (0, -length + 0.25 * s, 0)], [r * 0.62, r * 0.6], 10), "trim", L, ink)
    # drag brace from the strut back up to the bay roof (folds with the leg)
    mesh(name + "_brace", beam((0, -length * 0.42, 0.0), (0, -0.05 * s, -length * 0.38), r * 0.35), "steel", L, ink * 0.6)
    F = pivot(name + "_foot", (hinge[0], hinge[1] - length, hinge[2]), L, role="foot")
    F.location = tb((0, -length, 0))
    mesh(name + "_pad", lathe([(0, 0), (pad, 0.02 * s), (pad, 0.12 * s), (pad * 0.55, 0.3 * s), (r * 0.7, 0.42 * s), (0, 0.42 * s)], 16), "dark", F, ink)
    mesh(name + "_padLight", xf(torus(pad * 0.82, 0.04 * s, 16, 4), (0, 0.14 * s, 0)), "hazard", F, 0)
    return L


def gear_bay(ship, name, x, y, z0, z1, w, ink=0.03, open_ang=1.75):
    """A dark bay on the belly from z0 (front) back to z1, w wide, with two doors hinged on its
    long edges that swing down and out."""
    hull = ship["_hull"]
    zc, ln = (z0 + z1) / 2, abs(z0 - z1)
    mesh(name + "_bay", xf(rbox(w / 2, 0.06, ln / 2, 0.1, 12, 4), (x, y + 0.03, zc)), "bay", hull, 0)
    for side in (-1, 1):
        D = pivot(f"{name}_door{'LR'[side > 0]}", (x + side * w / 2, y, zc), ship["root"], role="door", open=side * open_ang)
        # plate authored closed, reaching from the hinge to the bay centreline
        mesh(D.name + "_plate", xf(rbox(w / 4 - 0.02, 0.05, ln / 2 - 0.03, 0.12, 12, 4), (-side * w / 4, -0.04, 0)), "trim", D, ink)
        mesh(D.name + "_stripe", xf(rbox(0.05, 0.055, ln / 2 - 0.25, 0.3, 8, 4), (-side * (w / 2 - 0.25), -0.05, 0)), "hazard", D, 0)


def plume(ship, name, pos, radius, length, axis="z", ring_r=None):
    """A flame cone pivot at a nozzle: outer plume + hot core. axis z: points -z; y: points -y."""
    P = pivot(name, pos, ship, role="plume" if axis == "z" else "lift")
    prof = [(0, 0), (radius * 0.98, 0.0), (radius * 0.9, 0.18 * length), (radius * 0.62, 0.5 * length), (radius * 0.25, 0.85 * length), (0, length)]
    core = [(0, 0), (radius * 0.6, 0.0), (radius * 0.5, 0.2 * length), (radius * 0.25, 0.45 * length), (0, 0.62 * length)]
    rot = (-math.pi / 2, 0, 0) if axis == "z" else (math.pi, 0, 0)
    mesh(name + "_flame", xf(lathe(prof, 16), r=rot), "plume", P, 0, None)
    mesh(name + "_core", xf(lathe(core, 12), r=rot), "plumeCore", P, 0, None)
    return P


def ship_root(name, **props):
    root = pivot(name, (0, 0, 0), None, **props)
    hull = pivot(name + "_hull", (0, 0, 0), root, role="hull")
    return {"root": root, "_hull": hull, "name": name}


# =============================================================================================
# The shuttle's nose, route board and tail: the bubble windscreen, the central bar-light, the board, the fins.
# Everything on the hull's skin is cut from a dense patch of it with clipf(), so every edge is a clean curve
# (see docs/shuttle-design.md).
# =============================================================================================

def route_board(name, pos, w, h, tilt, faces=1, depth=0.0):
    """The route board's pivot: at the middle of the display face, +z out of it (the game draws the lit
    destination there), leaning its face down by `tilt` rad. Meshes added to it are the housing."""
    P = pivot(name, pos, SR, role="board", w=w, h=h, faces=faces, depth=depth)
    P.rotation_euler = (tilt, 0.0, 0.0)  # (x turns the same way in both axes; +x tips the face down)
    return P


def build_nose():
    # ---- the glass: one sheer visor, a patch of the hull's skin cut by smooth fields: a shallow arch over the top, a
    # lower edge that follows the chin (lifted, to leave room for the lamp), a rear edge, the corners rounded by k
    head = lambda x: 2.0 - 0.1 * x * x
    yl = pl([(5.2, 0.45), (7.0, 0.25), (8.6, -0.3), (9.6, -0.55), (10.3, -0.65)])
    zr, k = 5.5, 0.55
    region = lambda g=0.0: (lambda p: smin([head(p[0]) - p[1] + g, p[1] - yl(p[2]) + g, p[2] - zr + g], k))
    base = [lerp_sec(HS, 4.6)] + [s for s in HS if s["z"] > 4.6]
    def skin(d, n=130, step=0.11):
        dense = densify(base, step)
        return loft([{**t, "z": t["z"] + (d if i == len(dense) - 1 else 0.0)} for i, t in enumerate(grow(dense, d))], n, False, True)
    glass = clipf(skin(0.035), region())
    # reflections: two diagonal streaks across the front, then a horizon splitting the rest into two tints
    # (each band edge is its own straight cut: one field for several bands would skip a band narrower than a mesh cell)
    bands, hor = [(0.15, 0.75), (0.95, 1.1)], 0.15
    vv = lambda p: p[1] - 0.8 * p[0]
    hi_parts, rest = [], glass
    for a, b in bands:
        hi_parts.append(clipf(rest, lambda p, a=a: vv(p) - a, lambda p, b=b: b - vv(p)))
        rest = merge(clipf(rest, lambda p, a=a: a - vv(p)), clipf(rest, lambda p, b=b: vv(p) - b))
    mesh("s_windHi", merge(*hi_parts), "glassHi", SH, 0)
    mesh("s_windDeep", clipf(rest, lambda p: hor - p[1]), "glassDeep", SH, 0)
    mesh("s_windscreen", clipf(rest, lambda p: p[1] - hor), "glass", SH, 0)
    # a fat silver bezel round the whole screen, with a slim dark gasket inside it
    mesh("s_windBezel", clipf(skin(0.08), region(0.2), lambda p: -region(0.0)(p)), "trim", SH, 0.035)
    mesh("s_windFrame", clipf(skin(0.05), region(0.03), lambda p: -region(0.0)(p)), "dark", SH, 0)

    # ---- the headlight: one wide bar centred under the visor, set on the skin (so it faces out of it, not buried in it):
    # a silver rim round a dark well round the lit strip
    wide = lambda sx, sy, hz: xf(rbox(sx, sy, hz / 2, 0.3, 16, 6), (0, 0, hz / 2))
    for name, geo, slot, lift, ink in (("s_headRim", wide(1.05, 0.34, 0.1), "trim", -0.02, 0.025), ("s_headWell", wide(0.95, 0.26, 0.12), "dark", 0.0, 0),
                                       ("s_head", wide(0.86, 0.18, 0.14), "window", 0.04, 0)):
        mesh(name, stick(geo, HS, 0.0, -1.5, lift), slot, SH, ink)

    # ---- the route board: a blocky header board in the roofline just over the screen, its face leaning forward-down like
    # the nose, a silver frame round the dark panel (matching the bezel), the sensor blister behind it
    P = route_board("s_board", (0, 3.3, 6.1), 3.4, 0.85, 0.16)
    # (each layer sits proud of the one behind it: the body's front at z = -0.06, the frame's at -0.02, the panel's at -0.01, the lit face at 0)
    mesh("s_boardBody", xf(rbox(2.15, 0.62, 0.5, 0.1, 18, 8), (0, 0.0, -0.56)), "body", P, 0.05)
    mesh("s_boardPlinth", xf(rbox(1.7, 0.5, 1.0, 0.18), (0, -0.62, -1.2), (-0.12, 0, 0)), "body", P, 0.04)
    mesh("s_boardTrim", xf(rbox(1.83, 0.525, 0.03, 0.2), (0, 0, -0.05)), "trim", P, 0.0)
    mesh("s_boardPanel", xf(rbox(1.7, 0.425, 0.03, 0.2), (0, 0, -0.04)), "dark", P, 0)
    mesh("s_boardCap", xf(rbox(2.19, 0.07, 0.48, 0.3), (0, 0.65, -0.56)), "stripe", P, 0)
    mesh("s_blister", xf(superquad(0.55, 0.32, 0.55, 0.6, 0.6, 12, 6), (0, 2.82, 3.2)), "trim", SH, 0.03)


def build_tail():
    """The tail: a V of two fins lofted through airfoil sections (tapered, raked back, a round leading edge, a fine
    trailing edge, a rounded tip, shaded smooth), the livery as a band across the outer fifth and a nav light on each tip."""
    V = dict(span=2.9, c_root=3.2, c_tip=1.45, sweep=1.7, t_root=0.16, t_tip=0.09)
    for side in (-1, 1):
        place = lambda geo, side=side: xf(geo, (side * 1.3, 2.35, -5.0), (0, 0, -side * 0.55))
        mesh(f"s_fin{side}", place(airfoil_fin(**V)), "body", SH, 0.04, None)
        mesh(f"s_fin{side}Cap", place(clip(airfoil_fin(**V, inflate=0.012), 1, V["span"] * 0.74, 1e9)), "stripe", SH, 0, None)
        light = xf(superquad(0.13, 0.13, 0.13, 1, 1, 8, 5), (0, V["span"] * 0.95, -V["sweep"] * 0.95 - 0.9))
        mesh(f"s_fin{side}Light", place(light), "green" if side > 0 else "red", SH, 0)


# =============================================================================================
# SHUTTLE-BUS: a fat, friendly lifting-body "hopper" ~19 m long. A bubble windscreen in a silver bezel, a central
# bar-light, a row of porthole windows, two ducted lift-fans on pylons right aft (clear of the windows), a canted
# V-tail of airfoil fins, a route board over the screen that shows where it is bound, three folding legs and a
# rear door that drops down into a ramp.
# Origin = hull centre. Belly flat at y = -2.6. On the pad the hull centre sits GEAR_S above it.
# =============================================================================================
GEAR_S = 4.6
BELLY_S = -2.6
S = ship_root("shuttle")
SR, SH = S["root"], S["_hull"]

SHUTTLE_SECS = [
    {"z": -9.5, "w": 2.3, "t": 1.9, "b": 2.0, "eT": 3.0, "eB": 6.0, "yc": -0.4},
    {"z": -9.2, "w": 2.75, "t": 2.35, "b": 2.2, "eT": 3.0, "eB": 6.0, "yc": -0.4},
    {"z": -8.2, "w": 3.05, "t": 2.75, "b": 2.2, "eT": 3.2, "eB": 7.0, "yc": -0.4},
    {"z": -6.0, "w": 3.3, "t": 3.15, "b": 2.2, "eT": 3.4, "eB": 8.0, "yc": -0.4},
    {"z": 2.0, "w": 3.35, "t": 3.25, "b": 2.2, "eT": 3.4, "eB": 8.0, "yc": -0.4},
    {"z": 5.5, "w": 3.25, "t": 3.05, "b": 2.2, "eT": 3.0, "eB": 8.0, "yc": -0.4},
    {"z": 7.6, "w": 2.95, "t": 2.45, "b": 2.15, "eT": 2.6, "eB": 6.0, "yc": -0.4},
    {"z": 8.9, "w": 2.45, "t": 1.7, "b": 1.95, "eT": 2.3, "eB": 4.5, "yc": -0.45},
    {"z": 9.7, "w": 1.6, "t": 0.95, "b": 1.45, "eT": 2.1, "eB": 3.0, "yc": -0.5},
    {"z": 10.05, "w": 0.6, "t": 0.35, "b": 0.6, "eT": 2.0, "eB": 2.2, "yc": -0.55},
]
# (the nose is rounded off: the same sections from z 2.0 forward, re-cut every 0.4 m along smooth curves)
HS = smooth_sections(SHUTTLE_SECS, 2.0, 0.4)
mesh("s_hull", loft(HS, 56), "body", SH, 0.13)
# livery: a broad level belt and a pinstripe, stopping short of the flat tail cap (a belt that swept
# up toward the tail cut diagonally across the hull's faces and came out as ragged splotches)
mesh("s_belt", cband(HS, 0.03, -1.35, -0.6, -9.2, 9.0), "stripe", SH, 0)
mesh("s_pin", cband(HS, 0.032, -0.38, -0.22, -9.2, 8.6), "trim", SH, 0)
# porthole windows down both flanks (the row starts well forward of the engines, which sit right aft)
WIN_Z = [-5.0 + i * 1.5 for i in range(7)]
for i, z in enumerate(WIN_Z):
    sec = lerp_sec(HS, z)
    for side in (-1, 1):
        x = surf_x(sec, 0.75) + 0.02
        mesh(f"s_win{i}{side}", xf(superquad(0.12, 0.55, 0.48, 0.5, 0.5, 12, 6), (side * x, 0.75, z), (0, 0, side * -0.12)), "window", SH, 0)
        mesh(f"s_winRim{i}{side}", xf(superquad(0.1, 0.68, 0.6, 0.5, 0.5, 12, 6), (side * (x - 0.04), 0.75, z), (0, 0, side * -0.12)), "trim", SH, 0.02)
build_nose()
mesh("s_whip", beam((0.9, 2.7, -2.4), (1.05, 4.4, -2.9), 0.04, 5), "dark", SH, 0)
mesh("s_whipTip", xf(superquad(0.1, 0.1, 0.1, 1, 1, 8, 5), (1.05, 4.45, -2.9)), "red", SH, 0)
build_tail()
# ducted lift-fans on swept pylons
# (the engines sit right aft, their pylons ending behind the last passenger window, so nothing of them crosses the glass:
# they used to sit at z -5, and carried their pylons through the two rearmost windows)
FAN_X, FAN_Y, FAN_Z, FAN_R = 5.55, 0.15, -7.7, 1.55
duct = [(FAN_R + 0.15, -1.5), (FAN_R + 0.55, -1.2), (FAN_R + 0.62, 0.3), (FAN_R + 0.35, 1.45), (FAN_R + 0.02, 1.55), (FAN_R - 0.05, 1.3), (FAN_R, -1.3), (FAN_R + 0.08, -1.5)]
for side in (-1, 1):
    X = side * FAN_X
    # shroud: the duct profile revolved round the fan axis (+z)
    mesh(f"s_duct{side}", xf(lathe(duct, 28), (X, FAN_Y, FAN_Z), (math.pi / 2, 0, 0)), "body", SH, 0.07)
    mesh(f"s_ductBand{side}", xf(torus(FAN_R + 0.6, 0.12, 28, 6), (X, FAN_Y, FAN_Z + 0.2), (math.pi / 2, 0, 0)), "stripe", SH, 0)
    mesh(f"s_spinner{side}", xf(lathe([(0, -1.0), (0.5, -0.6), (0.62, 0.2), (0.45, 0.9), (0, 1.25)], 14), (X, FAN_Y, FAN_Z), (math.pi / 2, 0, 0)), "trim", SH, 0.03)
    for k in range(6):
        a = k * math.pi / 3
        mesh(f"s_vane{side}{k}", xf(rbox(0.08, FAN_R * 0.5, 0.35, 0.3, 8, 4), (X + math.cos(a) * FAN_R * 0.55, FAN_Y + math.sin(a) * FAN_R * 0.55, FAN_Z - 0.6), (0, 0, a - math.pi / 2)), "dark", SH, 0)
    mesh(f"s_nozzle{side}", xf(lathe([(0, 0), (FAN_R - 0.02, 0), (FAN_R - 0.02, 0.05), (0, 0.05)], 24), (X, FAN_Y, FAN_Z - 1.35), (math.pi / 2, 0, 0)), "engine", SH, 0)
    mesh(f"s_nozzleCore{side}", xf(lathe([(0, 0), (0.8, 0), (0.8, 0.06), (0, 0.06)], 16), (X, FAN_Y, FAN_Z - 1.4), (math.pi / 2, 0, 0)), "core", SH, 0)
    # pylon: a fat swept wing root from the hull flank to the duct
    pyl = [(1.15, 0.25), (0.9, 0.5), (-1.0, 0.4), (-1.45, 0.05), (-1.15, -0.3), (0.9, -0.25)]
    verts, faces = extrude(pyl, 1.0, "x")
    x0 = surf_x(lerp_sec(SHUTTLE_SECS, FAN_Z), FAN_Y) - 0.3
    span = FAN_X - FAN_R - 0.3 - x0
    pv = [((v[0] + 0.5) * span + x0, v[1] + FAN_Y + (v[0] + 0.5) * -0.05, v[2] + FAN_Z + 0.2 - (v[0] + 0.5) * 0.4) for v in verts]
    mesh(f"s_pylon{side}", xf((pv, faces), s=(side, 1, 1)), "stripe", SH, 0.05)
    pyl_front = max(v[2] for v in pv)
    mesh(f"s_navLight{side}", xf(superquad(0.16, 0.16, 0.16, 1, 1, 8, 5), (X + side * (FAN_R + 0.65), FAN_Y, FAN_Z + 0.1)), "green" if side > 0 else "red", SH, 0)
    plume(S["root"], f"s_plume{'LR'[side > 0]}", (X, FAN_Y, FAN_Z - 1.45), FAN_R * 0.82, 6.5)
# the engines must not touch the passenger windows: the duct's front and the pylon's, against the rearmost window's rim
gap = min(FAN_Z + 1.55, pyl_front) - (min(WIN_Z) - 0.6)
print("shuttle engine clearance: %.2f m behind the rearmost window" % -gap)
assert gap < -0.3, "the side engines come within 0.3 m of the passenger windows"
# belly: skid strakes, lift-jet grilles and their flames
for side in (-1, 1):
    mesh(f"s_strake{side}", xf(rbox(0.12, 0.16, 5.6, 0.3), (side * 2.85, BELLY_S + 0.05, 0.6)), "dark", SH, 0.03)
for i, (x, z) in enumerate([(-1.6, 1.4), (1.6, 1.4), (-1.6, -7.2), (1.6, -7.2)]):
    mesh(f"s_grille{i}", xf(rbox(0.55, 0.05, 0.55, 0.2, 10, 4), (x, BELLY_S - 0.03, z)), "dark", SH, 0.02)
    mesh(f"s_grilleLit{i}", xf(rbox(0.42, 0.05, 0.42, 0.2, 10, 4), (x, BELLY_S - 0.06, z)), "engine", SH, 0)
    plume(S["root"], f"s_lift{i}", (x, BELLY_S - 0.08, z), 0.45, 3.2, axis="y")
# landing gear: a nose leg and two mains, each folding back into a bay with clamshell doors
H = BELLY_S + 0.38
leg_len = (GEAR_S + BELLY_S) + 0.38  # hinge is 0.38 inside the belly; pad bottom touches the pad
for name, (x, z) in (("s_legN", (0, 6.0)), ("s_legL", (-2.0, -2.1)), ("s_legR", (2.0, -2.1))):
    landing_leg(SR, name, (x, H, z), leg_len, 1.57, r=0.2, pad=0.55, ink=0.035)
    gear_bay(S, name + "Bay", x, BELLY_S, z + 0.45, z - leg_len - 0.75, 1.3)
# rear door / ramp: hinged at the bottom of the tail, closed = standing up as the back wall
R_HINGE = (0, -2.35, -9.62)  # just behind the flat tail cap (z -9.5)
RAMP_L = 3.9
ramp_drop = GEAR_S - 2.35 - 0.2  # hinge height above the pad deck (a hair of clearance)
ramp_open = -math.asin(min(1.0, ramp_drop / RAMP_L))
R = pivot("s_ramp", R_HINGE, SR, role="ramp", closed=math.pi / 2, opened=ramp_open)
mesh("s_rampPlate", xf(rbox(1.25, 0.1, RAMP_L / 2, 0.15, 12, 4), (0, 0.0, -RAMP_L / 2)), "trim", R, 0.04)
for k in range(5):
    mesh(f"s_rampRib{k}", xf(rbox(1.0, 0.05, 0.06, 0.4, 6, 4), (0, 0.11, -0.5 - k * 0.7)), "dark", R, 0)
for side in (-1, 1):
    mesh(f"s_rampEdge{side}", xf(rbox(0.06, 0.06, RAMP_L / 2 - 0.1, 0.4, 6, 4), (side * 1.18, 0.12, -RAMP_L / 2)), "hazard", R, 0)
# (outer face of the door when closed = the plate's underside: give it the livery)
mesh("s_rampLivery", xf(rbox(1.1, 0.03, RAMP_L / 2 - 0.25, 0.2, 10, 4), (0, -0.1, -RAMP_L / 2 - 0.05)), "stripe", R, 0)
mesh("s_doorFrame", xf(rbox(1.42, 0.12, 0.12, 0.2), (0, -2.35 + RAMP_L + 0.06, -9.6)), "dark", SH, 0.03)
Hh = pivot("s_hatch", (0, -2.35 + RAMP_L / 2, -9.515), SR, role="hatch")
mesh("s_hatchLight", rbox(1.15, RAMP_L / 2 - 0.15, 0.03, 0.2, 10, 4), "cabin", Hh, 0)
for side in (-1, 1):
    mesh(f"s_tailLight{side}", xf(rbox(0.16, 0.5, 0.08, 0.3), (side * 1.72, -0.5, -9.53)), "red", SH, 0)

SR["gearH"] = GEAR_S
SR["deck"] = [2.9, 1.5, 8.2]   # half-extents of the walkable roof box
SR["deckY"] = 1.25             # its centre above the hull origin (top = 2.75)
SR["deckZ"] = -0.3
SR["inside"] = [0, -2.2, -7.4]
SR["rampTop"] = [0, -2.25, -9.65]
SR["rampBottom"] = [0, -2.35 - RAMP_L * math.sin(-ramp_open), R_HINGE[2] - RAMP_L * math.cos(ramp_open) - 0.5]
SR["radius"] = 9.0
SR["padR"] = 11.0


# =============================================================================================
# FREIGHTER ("Atlas"): a ~66 m armoured deep-haul hammerhead. A squared, plated hull with a raked bridge tower that runs down into
# the bow and carries a lofted pilot house, a dorsal landing deck you can ride (kerb, tie-down rails, a big pad, approach lights),
# a gantry cage round each side's four cargo bays (portal frames with gussets, a header truss, a crane rail with a trolley, status
# lamps, roller cradles) holding the land-train's own cargo units (corrugated box, Helium-3 tanker, explosives magazine; cargo.py)
# painted for the faction it serves, short bolted radiator wings, a four-bell armoured stern block, four folding legs and a belly
# ramp. Origin = hull centre; deck top y = +5, belly y = -5.
#
# FREIGHTER_VARIANT (environment) picks the build: "stacked" (the one in the game: the full size, every bay two crates high, the Helium-3
# tankers in ISO frames so they stack like boxes), "atlas" (one crate high, the first Atlas) or "compact" (three bays a side and a hull
# 15% smaller, so the same crates fill more of the ship). The last two are studies.
# =============================================================================================
VARIANT = os.environ.get("FREIGHTER_VARIANT", "stacked")
NB, K, STACK = {"atlas": (4, 1.0, 1), "compact": (3, 0.85, 1), "stacked": (4, 1.0, 2)}[VARIANT]
PITCH = 9.0                      # a bay's length (the crates are 8.3 m)
ZF = (NB - 4) * PITCH            # everything forward of the bays moves back for each bay left out


def zf(z):
    return z + ZF


GEAR_F = 10.0
BELLY_F = -5.0
F = ship_root("freighter")
FR, FH = F["root"], F["_hull"]
_before_freighter = set(C.objects)


def FM(name, geo, slot, parent=None, ink=0.06):
    return mesh("f_" + name, geo, slot, parent or FH, ink)


def FRB(name, h, pos, slot, parent=None, ink=0.05, e=0.12, rot=(0, 0, 0), nu=8, nv=4):
    """A rounded box (half extents h) placed at pos."""
    return FM(name, xf(rbox(h[0], h[1], h[2], e, nu, nv), pos, rot), slot, parent, ink)


# ---- the hull: squared and plated, a blunt chisel bow (closed properly at the tip) ----
FSECS = [
    {"z": -28.4, "w": 7.2, "t": 4.6, "b": 4.6, "eT": 9, "eB": 9},
    {"z": -27.2, "w": 8.0, "t": 5.0, "b": 5.0, "eT": 10, "eB": 12},
    {"z": zf(18.0), "w": 8.0, "t": 5.0, "b": 5.0, "eT": 10, "eB": 12},
    {"z": zf(23.0), "w": 7.7, "t": 4.7, "b": 5.0, "eT": 8, "eB": 11},
    {"z": zf(27.5), "w": 6.4, "t": 3.5, "b": 4.5, "eT": 6, "eB": 8},
    {"z": zf(31.0), "w": 4.2, "t": 1.9, "b": 3.5, "eT": 4, "eB": 5},
    {"z": zf(33.0), "w": 2.3, "t": 1.0, "b": 2.2, "eT": 3, "eB": 3.5},
    {"z": zf(33.8), "w": 1.0, "t": 0.6, "b": 1.0, "eT": 2.4, "eB": 2.4},
]
FM("hull", loft(FSECS, 48), "body", FH, 0.28)
# livery: a broad belt with a trim pinstripe above it and a hazard sill below, running right round the bow
FM("belt", cband(FSECS, 0.05, 0.4, 2.0, zlo=-26.5, zhi=zf(31.0), step=0.5, n=170), "stripe", FH, 0)
FM("pin", cband(FSECS, 0.055, 2.3, 2.55, zlo=-26.5, zhi=zf(30.6), step=0.5, n=170), "trim", FH, 0)
FM("sill", cband(FSECS, 0.05, -3.7, -3.35, zlo=-26.5, zhi=zf(29.0), step=0.5, n=170), "hazard", FH, 0)
# frame ribs, down the whole hull and onto the bow (chunkier than the old straps)
RIBS = [z for z in (-24, -18, -12, -6, 0, 6, 12, 18) if z <= zf(18)]
RIBS += [z for z in (zf(24), zf(29)) if z - RIBS[-1] > 2.5]
for k, z in enumerate(RIBS):
    # (each rib takes the hull's own section at both of its edges, so it lies flat on the tapering bow instead of standing off it)
    FM(f"rib{k}", keep(loft(grow([lerp_sec(FSECS, z - 0.5), lerp_sec(FSECS, z + 0.5)], 0.08), 48, False, False), lambda c: c[1] < 4.6), "trim", FH, 0.05)
# bolted armour panels along the flanks, in the hull's own colour with trim edges (no black plates), above the cargo gantry
PLATE_Y, PLATE_H = (3.1, 0.75) if STACK == 1 else (4.05, 0.55)
for side in (-1, 1):
    for k, z in enumerate(range(-21, int(zf(18)), 6)):
        sec = lerp_sec(FSECS, z)
        x = surf_x(sec, PLATE_Y) + 0.05
        FM(f"plate{side}{k}", xf(rbox(0.07, PLATE_H, 1.9, 0.2, 6, 3), (side * x, PLATE_Y, z)), "trim", FH, 0.03)
        for dz in (-1.5, 1.5):
            FM(f"bolt{side}{k}{dz}", xf(superquad(0.12, 0.12, 0.12, 1, 1, 6, 4), (side * (x + 0.08), PLATE_Y, z + dz)), "steel", FH, 0)

# ---- the dorsal landing deck: a plated roof, a kerb with lights, a tie-down grid, a big pad with approach lights ----
DK0, DK1 = -25.6, zf(19.6)
DZC, DZH = (DK0 + DK1) / 2, (DK1 - DK0) / 2
FM("deck", xf(rbox(6.9, 0.14, DZH, 0.08, 16, 4), (0, 5.0, DZC)), "deck", FH, 0.06)
for side in (-1, 1):
    FM(f"kerb{side}", xf(rbox(0.22, 0.2, DZH - 0.1, 0.3, 8, 4), (side * 6.75, 5.12, DZC)), "hazard", FH, 0)
    for k in range(int((DK1 - 1.5 + 23.5) / 4.9) + 1):
        z = -23.5 + k * 4.9
        FM(f"kerbLamp{side}{k}", xf(superquad(0.2, 0.2, 0.2, 1, 1, 8, 4), (side * 6.75, 5.45, z)), "window", FH, 0)
        FM(f"kerbPost{side}{k}", xf(lathe([(0, 0), (0.3, 0), (0.22, 0.25), (0.22, 0.3), (0, 0.3)], 8), (side * 6.75, 5.2, z)), "steel", FH, 0.02)
PAD_Z = -7.0
PAD_CLEAR = 6.2                 # the tie-down rails stop this far from the pad's middle
RAIL_A, RAIL_B = DZC - (DZH - 2.6), DZC + (DZH - 2.6)
for xi in (-3.6, 3.6):          # tie-down rails with eyelets, flush with the roof, in two lengths either side of the pad
    for n, (za, zb) in enumerate(((RAIL_A, PAD_Z - PAD_CLEAR), (PAD_Z + PAD_CLEAR, RAIL_B))):
        FM(f"tieRail{xi}{n}", xf(rbox(0.12, 0.05, (zb - za) / 2, 0.3, 6, 3), (xi, 5.12, (za + zb) / 2)), "dark", FH, 0)
        for k in range(int((zb - za - 1.0) / 4.5) + 1):
            FM(f"tie{xi}{n}{k}", xf(torus(0.22, 0.05, 10, 4), (xi, 5.17, za + 0.5 + k * 4.5)), "steel", FH, 0)
# the pad: a dark disc raised clear of the deck (its top is 0.055 above the deck's), the painted rings and the H standing on it
PD = 5.14 + 0.005               # the deck's top is 5.14
FM("padDisc", xf(lathe([(0, 0), (5.3, 0), (5.3, 0.05), (0, 0.05)], 48), (0, PD, PAD_Z)), "dark", FH, 0)
FM("padRing", xf(lathe([(4.5, 0), (4.9, 0), (4.9, 0.05), (4.5, 0.05)], 48), (0, PD + 0.05, PAD_Z)), "hazard", FH, 0)
FM("padRing2", xf(lathe([(2.85, 0), (3.1, 0), (3.1, 0.05), (2.85, 0.05)], 40), (0, PD + 0.05, PAD_Z)), "hazard", FH, 0)
H_OUT = [(-1.15, -1.9), (-0.55, -1.9), (-0.55, -0.28), (0.55, -0.28), (0.55, -1.9), (1.15, -1.9), (1.15, 1.9), (0.55, 1.9), (0.55, 0.28), (-0.55, 0.28), (-0.55, 1.9), (-1.15, 1.9)]
FM("padH", xf(extrude(H_OUT, 0.05, "y"), (0, PD + 0.075, PAD_Z)), "hazard", FH, 0)
for k in range(8):               # lights set into the pad's rim
    a = k * math.pi / 4
    FM(f"padLamp{k}", xf(superquad(0.22, 0.1, 0.22, 1, 1, 8, 4), (math.sin(a) * 5.4, 5.14, PAD_Z + math.cos(a) * 5.4)), "cabin", FH, 0)
for k in range(5):               # approach lights toward the bow, and chevrons
    if 1.0 + k * 2.4 < zf(11.0):
        FM(f"approach{k}", xf(superquad(0.2, 0.08, 0.2, 1, 1, 8, 4), (0, 5.14, 1.0 + k * 2.4)), "cabin" if k % 2 else "window", FH, 0)
for k in range(3):
    FM(f"chevron{k}", xf(extrude([(0, 0), (1.5, -1.2), (1.5, -1.9), (0, -0.7), (-1.5, -1.9), (-1.5, -1.2)], 0.1, "y"), (0, 5.12, -19.0 - k * 1.7)), "hazard", FH, 0)

# ---- the bridge: a raked tower lofted from the deck down onto the bow (no step, no gap) ----
BRIDGE = [
    {"z": zf(12.0), "w": 5.4, "t": 4.6, "b": 4.0, "eT": 8, "eB": 12, "yc": 5.0},
    {"z": zf(23.0), "w": 5.4, "t": 4.6, "b": 4.0, "eT": 8, "eB": 12, "yc": 5.0},
    {"z": zf(26.5), "w": 5.2, "t": 3.4, "b": 3.8, "eT": 6, "eB": 12, "yc": 4.9},
    {"z": zf(29.0), "w": 4.4, "t": 1.6, "b": 3.2, "eT": 4, "eB": 8, "yc": 4.0},
    {"z": zf(31.0), "w": 3.2, "t": 0.5, "b": 2.4, "eT": 3, "eB": 5, "yc": 2.0},
]
FM("bridgeLo", loft(BRIDGE, 40), "trim", FH, 0.2)
FM("bridgeBelt", cband(BRIDGE, 0.05, 6.1, 6.8, zlo=zf(12.3), zhi=zf(26.5), step=0.4, n=160), "stripe", FH, 0)
# the lit sign on the raked face, and windows and vents on the flanks and the back
FRB("sign", (2.4, 0.5, 0.08), (0, 7.0, zf(27.15)), "dark", ink=0.04, e=0.2, rot=(-0.75, 0, 0))
FRB("signLit", (2.2, 0.36, 0.1), (0, 7.05, zf(27.2)), "sign", ink=0, e=0.25, rot=(-0.75, 0, 0))
for side in (-1, 1):
    for k in range(4):
        FRB(f"bridgeWin{side}{k}", (0.06, 0.3, 0.7), (side * 5.44, 8.0, zf(14.5 + k * 2.6)), "window", ink=0, e=0.3)
# the door onto the landing pad (a closed door: no interior): a framed steel leaf with a window and a handle, a hood and lamp over it, grab rails
# either side, a hazard threshold mat on the deck, and louvres on the wall to each side
DZ0 = zf(12.0)
for sx in (-1, 1):
    FRB(f"doorJamb{sx}", (0.16, 1.62, 0.13), (sx * 1.0, 6.75, DZ0 - 0.06), "dark", ink=0.03, e=0.3)
    FM(f"doorRail{sx}", beam((sx * 1.55, 5.5, DZ0 - 0.22), (sx * 1.55, 7.6, DZ0 - 0.22), 0.05, 6), "metal", FH, 0.01)
    for yy in (5.7, 7.4):
        FM(f"doorRailFoot{sx}{yy}", beam((sx * 1.55, yy, DZ0 - 0.22), (sx * 1.55, yy, DZ0), 0.04, 5), "metal", FH, 0)
    for k in range(4):
        FRB(f"bridgeLouvre{sx}{k}", (0.8, 0.07, 0.12), (sx * 3.6, 7.2 + k * 0.34, DZ0 - 0.04), "dark", ink=0, e=0.3)
FRB("doorHead", (1.16, 0.15, 0.13), (0, 8.38, DZ0 - 0.06), "dark", ink=0.03, e=0.3)
FRB("doorLeaf", (0.86, 1.5, 0.06), (0, 6.75, DZ0 - 0.06), "steel", ink=0.03, e=0.2)
FRB("doorWindow", (0.34, 0.3, 0.08), (0, 7.55, DZ0 - 0.1), "window", ink=0, e=0.3)
for sy in (-1, 1):                   # hazard stripes across the leaf's foot and the window frame
    FRB(f"doorStripe{sy}", (0.86, 0.07, 0.07), (0, 5.58 + (sy > 0) * 2.0, DZ0 - 0.1), "hazard", ink=0, e=0.3)
FRB("doorHandle", (0.05, 0.28, 0.07), (0.62, 6.7, DZ0 - 0.13), "metal", ink=0.01, e=0.4)
FRB("doorHood", (1.5, 0.07, 0.6), (0, 8.7, DZ0 - 0.55), "trim", ink=0.04, e=0.2, rot=(0.12, 0, 0))
for sx in (-1, 1):
    FM(f"doorHoodBrace{sx}", beam((sx * 1.3, 8.4, DZ0 - 0.02), (sx * 1.3, 8.68, DZ0 - 0.8), 0.04, 5), "steel", FH, 0.01)
FM("doorLamp", xf(superquad(0.22, 0.12, 0.22, 1, 1, 8, 4), (0, 8.57, DZ0 - 0.55)), "window", FH, 0)
FRB("doorMat", (1.1, 0.03, 0.55), (0, 5.12, DZ0 - 0.6), "hazard", ink=0, e=0.3)
FRB("doorMatCentre", (0.8, 0.035, 0.38), (0, 5.13, DZ0 - 0.6), "dark", ink=0, e=0.3)
FRB("doorSign", (0.55, 0.16, 0.05), (0, 8.1, DZ0 - 0.14), "sign", ink=0, e=0.3)

# ---- the pilot house: lofted from the tower's own lines (not a box set on top): it rises out of a livery-coloured plinth band,
# wraps the front in a framed glass belt, carries a roof cap shaped to it, and the dish, mast and lamps stand on mounts of their own ----
PH = [
    {"z": zf(15.6), "w": 3.6, "t": 1.9, "b": 1.6, "eT": 6, "eB": 12, "yc": 11.2},
    {"z": zf(16.4), "w": 3.95, "t": 1.95, "b": 1.7, "eT": 6, "eB": 12, "yc": 11.2},
    {"z": zf(22.0), "w": 3.95, "t": 1.95, "b": 1.7, "eT": 6, "eB": 12, "yc": 11.2},
    {"z": zf(24.0), "w": 3.7, "t": 1.5, "b": 2.1, "eT": 5, "eB": 12, "yc": 10.9},
    {"z": zf(25.6), "w": 2.9, "t": 0.8, "b": 2.2, "eT": 4, "eB": 10, "yc": 10.3},
]
FM("pilotHouse", loft(PH, 40), "trim", FH, 0.18)
FM("pilotPlinth", cband(PH, 0.09, 9.4, 10.05, zlo=zf(15.8), zhi=zf(25.0), step=0.3, n=140), "stripe", FH, 0)
FM("pilotGlass", cband(PH, 0.07, 10.55, 12.3, zlo=zf(16.8), zhi=zf(26.0), step=0.2, n=180), "glass", FH, 0)
FM("pilotFrameTop", cband(PH, 0.075, 12.3, 12.55, zlo=zf(16.8), zhi=zf(26.0), step=0.2, n=180), "dark", FH, 0)
FM("pilotFrameLow", cband(PH, 0.075, 10.3, 10.55, zlo=zf(16.8), zhi=zf(26.0), step=0.2, n=180), "dark", FH, 0)
FM("pilotRoof", cband(PH, 0.06, 12.85, 13.6, zlo=zf(15.5), zhi=zf(24.6), step=0.25, n=160), "dark", FH, 0.05)
for k, (z, x) in enumerate(((zf(22.4), 3.97), (zf(19.4), 4.0), (zf(17.4), 4.0))):    # window posts on the flanks
    for side in (-1, 1):
        FRB(f"pilotPost{side}{k}", (0.1, 0.9, 0.12), (side * x, 11.4, z), "dark", ink=0.02, e=0.3)
# the dish: a pedestal and a yoke on the roof, a tilted dish on it
FM("dishPed", xf(lathe([(0, 0), (0.7, 0), (0.6, 0.15), (0.38, 0.6), (0.3, 1.0), (0, 1.0)], 16), (-1.5, 13.15, zf(19.7))), "steel", FH, 0.04)
for s in (-1, 1):
    FM(f"dishYoke{s}", beam((-1.5 + s * 0.35, 14.1, zf(19.7)), (-1.5 + s * 0.8, 14.7, zf(19.7)), 0.07, 6), "dark", FH, 0.02)
FM("dish", xf(lathe([(0, 0.0), (1.4, 0.15), (2.1, 0.58), (2.15, 0.65), (0, 0.22)], 22), (-1.5, 14.75, zf(19.7)), (0.45, 0, 0.2)), "white", FH, 0.05)
FM("dishFeed", beam((-1.5, 14.95, zf(19.7)), (-1.35, 15.75, zf(19.4)), 0.05, 5), "dark", FH, 0)
# the mast: on a plinth with stays, a light on the top
FM("mastPlinth", xf(lathe([(0, 0), (0.55, 0), (0.5, 0.12), (0.3, 0.3), (0, 0.3)], 8), (1.8, 13.15, zf(17.4))), "steel", FH, 0.03)
FM("mast", beam((1.8, 13.4, zf(17.4)), (1.8, 19.4, zf(17.0)), 0.12, 6), "dark", FH, 0.03)
for z0 in (-1.6, 1.6):
    FM(f"stay{z0}", beam((1.8, 17.2, zf(17.1)), (1.8 + 0.5 * (1 if z0 > 0 else -1), 13.3, zf(17.4) + z0), 0.025, 4), "dark", FH, 0)
BEACON = pivot("f_beacon", (1.8, 19.6, zf(17.0)), FH, role="blinker", phase=0.0)   # (the game flashes it: models.js setThrust)
FM("beaconLamp", superquad(0.34, 0.34, 0.34, 1, 1, 10, 6), "red", BEACON, 0)
FM("beaconHalo", superquad(1.0, 1.0, 1.0, 1, 1, 10, 6), "beacon", BEACON, 0)
FM("beaconMount", xf(lathe([(0, 0), (0.22, 0), (0.18, 0.2), (0, 0.2)], 8), (1.8, 19.4, zf(17.0))), "dark", FH, 0.01)
# the searchlights: recessed housings in the raked front shoulders, lenses flush
for side in (-1, 1):
    FRB(f"search{side}", (0.55, 0.42, 0.6), (side * 2.55, 11.8, zf(24.2)), "dark", ink=0.04, e=0.3, rot=(-0.55, 0, 0))
    FRB(f"searchLens{side}", (0.38, 0.3, 0.06), (side * 2.55, 11.95, zf(24.75)), "window", ink=0, e=0.4, rot=(-0.55, 0, 0))
for side in (-1, 1):
    FM(f"head{side}", xf(superquad(0.75, 0.32, 0.18, 0.4, 0.5, 12, 6), (side * 2.4, -1.7, zf(32.2)), (0.1, side * 0.5, 0)), "window", FH, 0)
    FM(f"towLug{side}", xf(torus(0.5, 0.12, 12, 5), (side * 3.0, -3.3, zf(30.4)), (0, 0, math.pi / 2)), "steel", FH, 0.03)

# ---- radiator wings: shorter, swept, with a bolted frame and striped fins (up on the shoulder when the bays are two high) ----
RAD_DIH = 0.2
WY = 3.8 if STACK == 1 else 4.7


def wing_pt(span, up, chord, side):
    p = Vector((span, up, -chord))
    p.rotate(Euler((0, 0, RAD_DIH)))
    return (side * (p.x + 7.6), p.y + WY, p.z - 6.0)


for side in (-1, 1):
    wing = [(0.0, 0.0), (6.0, 0.0), (13.0, 3.0), (13.0, 7.2), (5.5, 9.2), (0.0, 9.2)]
    verts, faces = extrude(wing, 0.55, "y")
    out = [wing_pt(vx, vy, vz, side) for vx, vy, vz in verts]
    FM(f"rad{side}", (out, [tuple(reversed(f)) for f in faces] if side < 0 else faces), "steel", FH, 0.12)
    for k in range(6):
        sp = 1.6 + k * 2.0
        lead = 3.0 * max(0.0, sp - 6.0) / 7.0 + 0.5
        trail = 9.0 if sp < 5.5 else 9.0 - (sp - 5.5) * (1.8 / 7.5)
        FM(f"radFin{side}{k}", beam(wing_pt(sp, 0.34, lead, side), wing_pt(sp, 0.34, trail, side), 0.14, 4), "stripe", FH, 0)
    FM(f"radEdge{side}", beam(wing_pt(6.0, 0.0, 0.0, side), wing_pt(13.0, 0.0, 3.0, side), 0.32, 6), "trim", FH, 0.04)
    FM(f"radRoot{side}", xf(rbox(1.5, 1.1, 5.0, 0.2), (side * 8.0, WY - 0.1, -10.2), (0, 0, side * 0.15)), "steel", FH, 0.06)
    FM(f"navLight{side}", xf(superquad(0.5, 0.5, 0.5, 1, 1, 10, 6), wing_pt(13.2, 0.0, 5.0, side)), "green" if side > 0 else "red", FH, 0)

# ---- pipe runs and junction boxes down the upper shoulders (outside the walkable roof) ----
PIPE_Y = (4.0, 3.4) if STACK == 1 else (4.55, 4.0)
for side in (-1, 1):
    for yy, rr in zip(PIPE_Y, (0.22, 0.16)):
        x = surf_x(lerp_sec(FSECS, 0.0), yy) + 0.28
        FM(f"pipe{side}{yy}", beam((side * x, yy, -26.0), (side * x, yy, zf(12.0)), rr, 8), "steel", FH, 0.04)
    for k in range(7):
        z = -24.0 + k * 5.6
        if z > zf(10.0):
            continue
        x = surf_x(lerp_sec(FSECS, z), PIPE_Y[0] - 0.3) + 0.28
        FM(f"clip{side}{k}", xf(rbox(0.16, 0.6, 0.18, 0.3, 6, 3), (side * x, PIPE_Y[0] - 0.3, z)), "dark", FH, 0.02)
    JY = PIPE_Y[0] - 0.3
    FRB(f"junc{side}", (0.5, 0.55, 0.9), (side * (surf_x(lerp_sec(FSECS, -3.0), JY) + 0.5), JY, -3.0), "hazard", ink=0.05, e=0.25)
    FRB(f"juncCap{side}", (0.52, 0.12, 0.92), (side * (surf_x(lerp_sec(FSECS, -3.0), JY) + 0.5), JY + 0.6, -3.0), "dark", ink=0.03, e=0.3)

# ---- the stern: an armoured thrust block, a manifold, four bells ----
FM("thrustFrame", loft([
    {"z": -31.8, "w": 8.0, "t": 5.2, "b": 5.2, "eT": 7, "eB": 7},
    {"z": -31.0, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7},
    {"z": -27.4, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7},
    {"z": -26.2, "w": 7.6, "t": 4.8, "b": 4.8, "eT": 7, "eB": 7},
], 32), "steel", FH, 0.22)
FM("frameBand", keep(loft(grow([{"z": -30.6, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7}, {"z": -29.2, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7}], 0.07), 32, False, False), lambda c: True), "hazard", FH, 0)
for k in range(5):               # cooling ribs on the block
    FM(f"blockRib{k}", xf(rbox(8.95, 5.9, 0.16, 0.12, 12, 4), (0, 0, -27.8 - k * 0.5)), "dark", FH, 0.02)
FM("heatShield", xf(rbox(8.0, 5.2, 0.28, 0.12, 16, 6), (0, 0, -32.0)), "dark", FH, 0.06)
THROAT_Z, BELL_L = -33.4, 5.0
bell = [(1.2, 0.0), (1.25, 0.5), (1.5, 1.8), (1.85, 3.2), (2.2, 4.4), (2.35, 4.85), (2.35, BELL_L)]
for i, (x, y) in enumerate([(-4.2, 2.6), (4.2, 2.6), (-4.2, -2.6), (4.2, -2.6)]):
    FM(f"pump{i}", xf(lathe([(r, -h) for r, h in [(0, 0), (1.8, 0), (1.85, 0.3), (1.7, 1.0), (1.4, 1.25), (1.25, 1.5), (0, 1.5)]], 20), (x, y, -32.1), (math.pi / 2, 0, 0)), "steel", FH, 0.06)
    FM(f"gimbal{i}", xf(torus(1.4, 0.24, 20, 6), (x, y, THROAT_Z + 0.15), (math.pi / 2, 0, 0)), "stripe", FH, 0.02)
    for k in range(3):           # hydraulic actuators
        a = k * 2 * math.pi / 3 + 0.5
        FM(f"act{i}{k}", beam((x + math.cos(a) * 1.7, y + math.sin(a) * 1.7, -32.2), (x + math.cos(a) * 1.95, y + math.sin(a) * 1.95, THROAT_Z - 1.6), 0.13, 6), "metal", FH, 0.02)
    FM(f"bell{i}", xf(lathe([(r, -h) for r, h in bell], 24), (x, y, THROAT_Z), (math.pi / 2, 0, 0)), "dark", FH, 0.1)
    FM(f"bellRing{i}", xf(torus(2.35, 0.15, 24, 6), (x, y, THROAT_Z - BELL_L), (math.pi / 2, 0, 0)), "stripe", FH, 0)
    FM(f"bellGlow{i}", xf(lathe([(0, 0), (1.3, 0), (1.3, 0.06), (0, 0.06)], 20), (x, y, THROAT_Z - 0.4), (math.pi / 2, 0, 0)), "engine", FH, 0)
    FM(f"bellCore{i}", xf(lathe([(0, 0), (0.7, 0), (0.7, 0.08), (0, 0.08)], 16), (x, y, THROAT_Z - 0.5), (math.pi / 2, 0, 0)), "core", FH, 0)
    plume(FR, f"f_plume{i}", (x, y, THROAT_Z - BELL_L - 0.05), 2.0, 13.0)
for side in (-1, 1):             # the exhaust manifold: pipes from the block's shoulders to the outer bells
    FM(f"manifold{side}", beam((side * 8.6, 0.0, -29.0), (side * 8.6, 2.6, -31.0), 0.4, 8), "steel", FH, 0.04)
FM("tailLight", xf(superquad(0.35, 0.35, 0.35, 1, 1, 10, 6), (0, 6.2, -30.2)), "white", FH, 0)

# ---- belly: lift-jet grilles, skid keels, four hydraulic legs, the ramp ----
for i, (x, z) in enumerate([(-3.6, zf(9.0)), (3.6, zf(9.0)), (-3.6, -21.5), (3.6, -21.5)]):
    FM(f"grille{i}", xf(rbox(1.3, 0.08, 1.3, 0.2, 10, 4), (x, BELLY_F - 0.04, z)), "dark", FH, 0.03)
    FM(f"grilleLit{i}", xf(rbox(1.05, 0.08, 1.05, 0.2, 10, 4), (x, BELLY_F - 0.08, z)), "engine", FH, 0)
    plume(FR, f"f_lift{i}", (x, BELLY_F - 0.12, z), 1.0, 6.5, axis="y")
for side in (-1, 1):
    FM(f"keel{side}", xf(rbox(0.28, 0.32, 14.0, 0.3), (side * 6.8, BELLY_F + 0.1, 3.0 + ZF / 2)), "dark", FH, 0.05)
HF = BELLY_F + 0.7
leg_f = (GEAR_F + BELLY_F) + 0.7
for name, (x, z) in (("f_legFL", (-5.0, zf(17.0))), ("f_legFR", (5.0, zf(17.0))), ("f_legRL", (-5.0, -13.0)), ("f_legRR", (5.0, -13.0))):
    landing_leg(FR, name, (x, HF, z), leg_f, 1.57, r=0.55, pad=1.7, ink=0.08, scale=2.2)
    gear_bay(F, name + "Bay", x, BELLY_F, z + 0.9, z - leg_f - 1.6, 2.8, ink=0.05)
# belly ramp: hinged at its front edge, closed flush with the belly
F_RAMP_H = (0, BELLY_F - 0.05, -4.0)
F_RAMP_L = 11.0
f_drop = GEAR_F + BELLY_F - 0.15
f_open = -math.asin(min(1.0, f_drop / F_RAMP_L))
FRamp = pivot("f_ramp", F_RAMP_H, FR, role="ramp", closed=0.0, opened=f_open)
FM("rampPlate", xf(rbox(2.3, 0.16, F_RAMP_L / 2, 0.1, 12, 4), (0, 0, -F_RAMP_L / 2)), "trim", FRamp, 0.07)
for k in range(9):
    FM(f"rampRib{k}", xf(rbox(2.0, 0.06, 0.1, 0.4, 6, 4), (0, 0.17, -0.8 - k * 1.2)), "dark", FRamp, 0)
for side in (-1, 1):
    FM(f"rampEdge{side}", xf(rbox(0.12, 0.08, F_RAMP_L / 2 - 0.15, 0.4, 6, 4), (side * 2.15, 0.18, -F_RAMP_L / 2)), "hazard", FRamp, 0)
FM("rampBay", xf(rbox(2.45, 0.06, F_RAMP_L / 2 + 0.1, 0.1, 12, 4), (0, BELLY_F + 0.04, -4.0 - F_RAMP_L / 2)), "bay", FH, 0)
FHatch = pivot("f_hatch", (0, BELLY_F + 0.08, -4.0 - F_RAMP_L / 2), FR, role="hatch")
FM("hatchLight", rbox(2.2, 0.03, F_RAMP_L / 2 - 0.2, 0.2, 10, 4), "cabin", FHatch, 0)

# ---- a smaller hull: everything above scaled about the middle (the cargo gantry below is built afterwards, at the crates' own size) ----
if K != 1.0:
    _S = Matrix.Scale(K, 4)
    for o in C.objects:
        if o in _before_freighter:
            continue
        if o.type == "MESH":
            o.data.transform(_S)
        else:
            o.location = o.location * K

# ---- the cargo gantry: bays down each flank in a portal-frame cage; absolute sizes (the crates are 8.3 m long whatever the ship) ----
HW = 8.0 * K                 # the hull's flank
RX = HW + 4.9                # the cage's outer posts and rails
UX = HW + 2.3                # a crate's centre (x)
UY = -4.05 * K               # the floor of a bay
UNIT_H = 3.487               # one crate, rack to roof: the next stands on it
BAY_H = 7.5 if STACK == 2 else 5.3
BAY_TOP = UY + BAY_H
FOOT_Y = UY - 0.45           # the posts' feet
ZC0 = K * (-4.6 + ZF / 2) - 0.4
SLOT_Z = [ZC0 + (i - (NB - 1) / 2) * PITCH for i in range(NB)]
FRAME_Z = [ZC0 + (i - NB / 2) * PITCH for i in range(NB + 1)]
ZLC, ZLH = (FRAME_Z[0] + FRAME_Z[-1]) / 2, (FRAME_Z[-1] - FRAME_Z[0]) / 2 + 0.35
CARGO = {                    # what each bay holds, bottom to top: land-train units ('box', 'tank', 'blast'); [] = an empty bay
    "atlas": {(-1, 0): ["tank"], (-1, 1): ["box"], (-1, 2): [], (-1, 3): ["blast"],
              (1, 0): ["box"], (1, 1): ["tank"], (1, 2): ["box"], (1, 3): []},
    "compact": {(-1, 0): ["tank"], (-1, 1): ["box"], (-1, 2): ["blast"],
                (1, 0): ["box"], (1, 1): ["tank"], (1, 2): []},
    # (an H3 bay a side, two tank containers high: port at the stern end, starboard one in from it; and a tank on top of a box besides)
    "stacked": {(-1, 0): ["tank", "tank"], (-1, 1): ["blast", "box"], (-1, 2): [], (-1, 3): ["box", "tank"],
                (1, 0): ["box", "box"], (1, 1): ["tank", "tank"], (1, 2): ["blast"], (1, 3): []},
}[VARIANT]


def empty_slot(side, k, z):
    n = f"e{side}{k}"
    for sz in (-1, 1):           # guide posts at the crate's outer corners, with angled lead-ins
        FRB(f"{n}g{sz}", (0.16, BAY_H / 2 - 0.5, 0.16), (side * (UX + 2.1), UY + BAY_H / 2 - 0.4, z + sz * 3.9), "steel", ink=0.03, e=0.3)
        FM(f"{n}lead{sz}", xf(extrude([(0, 0), (0.6, 0.5), (0.6, 0.0)], 0.3, "x"), (side * (UX + 2.1) - 0.15, UY + BAY_H - 0.9, z + sz * 3.9 - 0.1)), "hazard", FH, 0)
    # the backing plate: a steel wall a hand's width off the hull, in a trim frame, with stiffeners, cable trays on bolted brackets,
    # a hazard toe-board and a status panel (no flat black slab: it is a piece of the ship)
    y0, y1 = UY - 0.1, UY + BAY_H - 0.55
    cy, hh = (y0 + y1) / 2, (y1 - y0) / 2
    px = side * (HW + 0.11)
    o = lambda d: px + side * d     # (outward from the plate)
    FRB(n + "plate", (0.06, hh, 3.95), (px, cy, z), "steel", ink=0.03, e=0.15)
    for sy in (-1, 1):
        FRB(f"{n}frameH{sy}", (0.09, 0.1, 3.95), (o(0.03), cy + sy * (hh - 0.1), z), "trim", ink=0.02, e=0.3)
    for sz in (-1, 1):
        FRB(f"{n}frameV{sz}", (0.09, hh, 0.1), (o(0.03), cy, z + sz * 3.85), "trim", ink=0.02, e=0.3)
    for kk in (-2.2, 0.0, 2.2):
        FRB(f"{n}stiff{kk}", (0.07, hh - 0.3, 0.1), (o(0.08), cy, z + kk), "metal", ink=0.02, e=0.3)
    for j in range(1, 4):
        y = y0 + (y1 - y0) * j / 4
        FRB(f"{n}tray{j}", (0.1, 0.1, 3.7), (o(0.12), y, z), "dark", ink=0.02, e=0.3)
        for bz in (-3.4, -1.1, 1.1, 3.4):
            FM(f"{n}bolt{j}{bz}", xf(superquad(0.09, 0.09, 0.09, 1, 1, 6, 4), (o(0.24), y, z + bz)), "steel", FH, 0)
    FRB(f"{n}toe", (0.13, 0.16, 3.95), (o(0.05), y0 + 0.2, z), "hazard", ink=0.02, e=0.3)
    FRB(f"{n}panel", (0.1, 0.45, 0.6), (o(0.16), cy + 0.5, z - 1.0), "dark", ink=0.03, e=0.3)
    FM(f"{n}lamp", xf(superquad(0.12, 0.12, 0.12, 1, 1, 8, 4), (o(0.28), cy + 0.7, z - 1.0)), "red", FH, 0)
    FM(f"{n}lampOk", xf(superquad(0.12, 0.12, 0.12, 1, 1, 8, 4), (o(0.28), cy + 0.35, z - 1.0)), "green", FH, 0)


for side in (-1, 1):
    # the long members: a top beam with a hazard cap and a crane rail, a lower rail, a runner along the hull under the crates
    FRB(f"railTop{side}", (0.4, 0.3, ZLH), (side * RX, BAY_TOP, ZLC), "trim", ink=0.06, e=0.3)
    FRB(f"railTopH{side}", (0.42, 0.05, ZLH), (side * RX, BAY_TOP + 0.33, ZLC), "hazard", ink=0, e=0.4)
    FRB(f"craneRail{side}", (0.12, 0.1, ZLH - 0.3), (side * RX, BAY_TOP + 0.5, ZLC), "dark", ink=0.02, e=0.4)
    FRB(f"railLow{side}", (0.34, 0.28, ZLH), (side * RX, FOOT_Y + 0.12, ZLC), "steel", ink=0.05, e=0.3)
    FRB(f"railIn{side}", (0.3, 0.26, ZLH - 0.2), (side * (HW + 0.3), UY - 0.32, ZLC), "steel", ink=0.05, e=0.3)
    for zi, z in enumerate(FRAME_Z):
        # a portal frame between each pair of bays: a box post with foot and cap plates, ties to the hull top and bottom (with gussets)
        ph = (BAY_TOP + 0.2 - FOOT_Y) / 2
        FRB(f"post{side}{zi}", (0.28, ph, 0.28), (side * RX, FOOT_Y + ph, z), "steel", ink=0.06, e=0.25)
        FRB(f"postFoot{side}{zi}", (0.5, 0.06, 0.5), (side * RX, FOOT_Y - 0.02, z), "dark", ink=0.03, e=0.2)
        FRB(f"postCap{side}{zi}", (0.45, 0.06, 0.45), (side * RX, BAY_TOP + 0.24, z), "dark", ink=0.03, e=0.2)
        for name, y in (("T", BAY_TOP - 0.05), ("B", UY - 0.32)):
            FRB(f"tie{name}{side}{zi}", ((RX - HW) / 2, 0.2, 0.18), (side * (RX + HW) / 2, y, z), "steel", ink=0.04, e=0.25)
        FM(f"gussetT{side}{zi}", xf(extrude([(0, 0), (1.5, 0), (0, -1.5)], 0.16, "z"), (side * (RX - 0.28), BAY_TOP - 0.25, z), (0, 0, 0), (-side, 1, 1)), "trim", FH, 0.02)
        FM(f"gussetB{side}{zi}", xf(extrude([(0, 0), (1.5, 0), (0, 1.5)], 0.16, "z"), (side * (RX - 0.28), UY - 0.12, z), (0, 0, 0), (-side, 1, 1)), "trim", FH, 0.02)
        if STACK == 2:           # a tie at the stack's middle: where one crate stands on the next
            FRB(f"tieM{side}{zi}", ((RX - HW) / 2, 0.16, 0.14), (side * (RX + HW) / 2, UY + UNIT_H + 0.05, z), "steel", ink=0.03, e=0.25)
    for k, z in enumerate(SLOT_Z):
        z0, z1 = FRAME_Z[k], FRAME_Z[k + 1]
        # the header: a bar under the top beam with a V of braces, so the top reads as a truss over each bay
        yb = BAY_TOP - 0.85
        FRB(f"hdrBar{side}{k}", (0.1, 0.08, (z1 - z0) / 2 - 0.35), (side * RX, yb, z), "steel", ink=0.02, e=0.3)
        FM(f"hdrV1{side}{k}", beam((side * RX, BAY_TOP - 0.15, z0 + 0.35), (side * RX, yb, z), 0.07, 5), "steel", FH, 0.01)
        FM(f"hdrV2{side}{k}", beam((side * RX, BAY_TOP - 0.15, z1 - 0.35), (side * RX, yb, z), 0.07, 5), "steel", FH, 0.01)
        # the cradle: two skids along the floor under the crate, with a bed of rollers across them
        for sx in (-1, 1):
            FRB(f"skid{side}{k}{sx}", (0.2, 0.1, 4.0), (side * UX + sx * 1.5, UY - 0.13, z), "steel", ink=0.03, e=0.3)
        for dz in (-2.6, 0.0, 2.6):
            FM(f"roller{side}{k}{dz}", beam((side * UX - 1.95, UY - 0.3, z + dz), (side * UX + 1.95, UY - 0.3, z + dz), 0.1, 8), "metal", FH, 0.02)
        # the floor lip: a low toe-board along the bay's outer edge, loaded or not; the clamps sit on it (a block with a hold-down arm that
        # reaches in over the crate's rack edge), so nothing hangs in the air in an empty bay
        FRB(f"lip{side}{k}", (0.14, 0.32, 4.15), (side * (UX + 2.12), UY + 0.1, z), "steel", ink=0.04, e=0.25)
        FRB(f"lipCap{side}{k}", (0.16, 0.04, 4.17), (side * (UX + 2.12), UY + 0.44, z), "hazard", ink=0, e=0.3)
        for dz in (-2.4, 2.4):
            FRB(f"clamp{side}{k}{dz}", (0.2, 0.22, 0.4), (side * (UX + 2.12), UY + 0.66, z + dz), "hazard", ink=0.03, e=0.3)
            FRB(f"clampArm{side}{k}{dz}", (0.18, 0.08, 0.18), (side * (UX + 1.92), UY + 0.58, z + dz), "metal", ink=0.02, e=0.3)
            FM(f"clampBolt{side}{k}{dz}", xf(lathe([(0, 0), (0.13, 0), (0.13, 0.12), (0, 0.12)], 8), (side * (UX + 2.12), UY + 0.88, z + dz)), "steel", FH, 0.01)
        stack = CARGO[(side, k)]
        FM(f"lamp{side}{k}", xf(superquad(0.2, 0.2, 0.2, 1, 1, 8, 5), (side * (RX + 0.46), BAY_TOP + 0.02, z - 3.2)), "red" if not stack else "green", FH, 0)
        FRB(f"slotNo{side}{k}", (0.07, 0.3, 0.7), (side * (RX + 0.4), BAY_TOP, z), "dark", ink=0, e=0.3)
        FRB(f"slotNoLit{side}{k}", (0.08, 0.2, 0.5), (side * (RX + 0.44), BAY_TOP, z), "sign", ink=0, e=0.3)
        if not stack:
            empty_slot(side, k, z)
        for j, kind in enumerate(stack):
            cargo_unit(kind, f"f_cargo{'P' if side > 0 else 'S'}{k}{'ab'[j]}", FH, (side * UX, UY + j * UNIT_H, z), 1.1, low=(STACK == 2))
# A gantry crane on each side's rail: a chassis on four flanged wheels astride the rail, a cab, a boom reaching in over the bays with a stay to
# the cab's roof, a sheave bar at its tip with two cables down to a spreader. The game moves the `trolley` pivot along z while the ship is docked
# (its extras: travelMin / travelMax, in metres from where it is built, over the first empty bay; `home` that spot; `dropMax` how far the
# spreader can be lowered into a bay), scales the `cable` pivots' y to the length of cable paid out, and lowers the `hoist` pivot (the spreader).
RAIL_TOP = BAY_TOP + 0.6
WING_STOP = -6.5 * K + 2.3          # (it works only as far aft as the radiator wing's leading edge)
for side in (-1, 1):
    tk = next((k for k in range(NB) if not CARGO[(side, k)]), None)
    if tk is None:
        continue
    TZ = SLOT_Z[tk]
    zmin, zmax = max(FRAME_Z[0] + 1.9, WING_STOP), FRAME_Z[-1] - 1.9
    inn = -side                      # (inboard, over the bays)
    reach = RX - UX                  # the boom's reach: out to the crate column
    DROP = RAIL_TOP + 0.7 - 0.98 - (UY + 0.9)
    T = pivot(f"f_crane{side}", (side * RX, RAIL_TOP, TZ), FH, role="trolley", side=side, travelMin=round(zmin - TZ, 3), travelMax=round(zmax - TZ, 3), dropMax=round(DROP, 3))
    for sx in (-1, 1):               # four flanged wheels astride the rail, on axles
        for sz in (-1, 1):
            FM(f"craneWheel{side}{sx}{sz}", xf(lathe([(0, -0.09), (0.3, -0.09), (0.3, 0.09), (0, 0.09)], 14), (sx * 0.3, 0.3, sz * 1.1), (0, 0, math.pi / 2)), "dark", T, 0.02)
            FM(f"craneFlange{side}{sx}{sz}", xf(lathe([(0, 0.09), (0.36, 0.09), (0.36, 0.13), (0, 0.13)], 14), (sx * 0.3, 0.3, sz * 1.1), (0, 0, math.pi / 2 * sx)), "steel", T, 0)
    for sz in (-1, 1):
        FM(f"craneAxle{side}{sz}", beam((-0.4, 0.3, sz * 1.1), (0.4, 0.3, sz * 1.1), 0.07, 6), "steel", T, 0.01)
    FM(f"craneChassis{side}", xf(rbox(0.8, 0.2, 1.55, 0.25, 8, 4), (0, 0.78, 0)), "hazard", T, 0.07)
    for sz in (-1, 1):               # end bumpers and the chassis skirts
        FM(f"craneBumper{side}{sz}", xf(rbox(0.8, 0.14, 0.12, 0.3, 6, 3), (0, 0.62, sz * 1.68)), "dark", T, 0.03)
    for sx in (-1, 1):
        FM(f"craneSkirt{side}{sx}", xf(rbox(0.05, 0.16, 1.5, 0.3, 4, 3), (sx * 0.84, 0.66, 0)), "dark", T, 0.02)
    FM(f"craneCab{side}", xf(rbox(0.62, 0.52, 0.72, 0.2, 8, 4), (-inn * 0.12, 1.5, 0.6)), "trim", T, 0.06)
    FM(f"craneCabGlass{side}", xf(rbox(0.05, 0.28, 0.5, 0.3, 6, 3), (inn * 0.55, 1.62, 0.6)), "glass", T, 0)
    FM(f"craneCabRoof{side}", xf(rbox(0.7, 0.07, 0.8, 0.3, 6, 3), (-inn * 0.12, 2.06, 0.6)), "dark", T, 0.03)
    FM(f"craneCabLamp{side}", xf(superquad(0.1, 0.1, 0.1, 1, 1, 8, 4), (-inn * 0.12, 2.2, 0.6)), "window", T, 0)
    for sz in (-1, 1):               # a hand-rail round the chassis deck: posts and a rail
        FM(f"craneRailPost{side}{sz}", beam((-inn * 0.7, 0.95, sz * 1.45), (-inn * 0.7, 1.55, sz * 1.45), 0.035, 5), "metal", T, 0)
    FM(f"craneHandRail{side}", beam((-inn * 0.7, 1.55, -1.45), (-inn * 0.7, 1.55, 1.45), 0.035, 5), "metal", T, 0)
    # the boom: a box beam from the chassis over the bays, braced underneath, stayed from the cab's roof, a sheave bar across its tip
    FM(f"craneBoom{side}", xf(rbox(reach / 2 - 0.2, 0.15, 0.28, 0.3, 8, 4), (inn * (0.7 + (reach - 0.7) / 2), 0.9, 0)), "steel", T, 0.05)
    FM(f"craneBoomBrace{side}", beam((inn * 0.8, 0.62, 0), (inn * (reach - 0.2), 0.84, 0), 0.07, 6), "metal", T, 0.02)
    FM(f"craneBoomStay{side}", beam((-inn * 0.12, 2.06, 0.0), (inn * (reach - 0.05), 0.98, 0.0), 0.035, 5), "dark", T, 0)
    FM(f"craneSheave{side}", xf(rbox(0.18, 0.13, 1.5, 0.3, 6, 3), (inn * reach, 0.76, 0)), "steel", T, 0.04)
    for sz in (-1, 1):
        FM(f"craneStripe{side}{sz}", xf(rbox(0.19, 0.14, 0.18, 0.3, 4, 3), (inn * reach, 0.76, sz * 1.38)), "hazard", T, 0)
    for sz in (-1, 1):               # the two cable falls: a metre of cable the game stretches to the length paid out
        C_ = pivot(f"f_craneCable{side}{sz}", (inn * reach, 0.7, sz * 1.2), T, role="cable", side=side)
        FM(f"craneFall{side}{sz}", beam((0, 0, 0), (0, -1, 0), 0.05, 5), "dark", C_, 0)
    H_ = pivot(f"f_craneHoist{side}", (inn * reach, 0.7, 0), T, role="hoist", side=side)
    # An ISO spreader frame as long and wide as the crates' corner castings (x +-1.65, z +-3.9): two side beams, two end beams, a spine the cables
    # come down to, a locking head and pin at each corner, and a flipper plate beside each head that hangs down round the crate's top edge.
    for sx in (-1, 1):
        FM(f"spreaderSide{side}{sx}", xf(rbox(0.17, 0.14, 4.0, 0.3, 8, 4), (sx * 1.65, -0.42, 0)), "steel", H_, 0.05)
    for sz in (-1, 1):
        FM(f"spreaderEnd{side}{sz}", xf(rbox(1.82, 0.14, 0.2, 0.3, 8, 4), (0, -0.42, sz * 3.9)), "steel", H_, 0.05)
        FM(f"spreaderCross{side}{sz}", xf(rbox(1.65, 0.1, 0.14, 0.3, 6, 3), (0, -0.3, sz * 1.2)), "metal", H_, 0.02)
        FM(f"spreaderSocket{side}{sz}", xf(rbox(0.22, 0.1, 0.22, 0.3, 6, 3), (0, -0.14, sz * 1.2)), "hazard", H_, 0.01)
    FM(f"spreaderSpine{side}", xf(rbox(0.22, 0.12, 3.7, 0.3, 8, 4), (0, -0.3, 0)), "metal", H_, 0.03)
    for sx in (-1, 1):
        for sz in (-1, 1):
            FM(f"spreaderHead{side}{sx}{sz}", xf(rbox(0.3, 0.2, 0.32, 0.3, 6, 3), (sx * 1.65, -0.5, sz * 3.9)), "dark", H_, 0.03)
            FM(f"spreaderPin{side}{sx}{sz}", xf(lathe([(0, 0), (0.15, 0), (0.1, -0.3), (0, -0.34)], 8), (sx * 1.65, -0.64, sz * 3.9)), "hazard", H_, 0.01)
            FM(f"spreaderFlipper{side}{sx}{sz}", xf(rbox(0.05, 0.42, 0.42, 0.3, 4, 3), (sx * 2.0, -0.78, sz * 3.9)), "hazard", H_, 0.02)
            FM(f"spreaderHinge{side}{sx}{sz}", xf(rbox(0.2, 0.06, 0.3, 0.3, 4, 3), (sx * 1.85, -0.38, sz * 3.9)), "steel", H_, 0.01)

# ---- the collision: solid boxes in the ship's own frame (hx, hy, hz, x, y, z) that the game keeps in the world while the ship is near, so the
# hull, tower, nose, bells, wings, the cages and the crates are solid and their tops can be stood on ----
_solid = []


def solid(hx, hy, hz, x, y, z, k=1.0, roll=0.0):
    """One box: half sizes and centre, scaled by k; `roll` (rad) tips it about the ship's z axis, for a slab on a slope."""
    _solid.append([round(v * k, 3) for v in (hx, hy, hz, x, y, z)] + [round(roll, 4)])


_c = lambda lo, hi: ((lo + hi) / 2, (hi - lo) / 2)      # (centre, half) of a span
zc_, zh_ = _c(-27.2, zf(18.0))
solid(7.9, 2.62, zh_, 0, 2.52, zc_, K)                   # the deck slab and the upper hull: top = the deck plate (5.14)
solid(7.9, 2.45, zh_, 0, -2.55, zc_, K)                  # the lower hull, belly and all: the ramp is shut flush with the belly and is no door a player can walk through


def slabs(secs, z0, z1, step, y_lo=None):
    """Boxes cut from a lofted part's own cross-sections, one per `step` m of its length, each as wide and tall as the section at its middle (the
    section's rounded corners are why the width is a hair under it), so a tapering nose or a raked tower is followed instead of stepped round."""
    n = max(1, int(round((z1 - z0) / step)))
    for i in range(n):
        za, zb = z0 + (z1 - z0) * i / n, z0 + (z1 - z0) * (i + 1) / n
        sec = lerp_sec(secs, (za + zb) / 2)
        yc = sec.get("yc", 0.0)
        lo, hi = yc - sec["b"], yc + sec["t"]
        if y_lo is not None:
            lo = max(lo, y_lo)
        if hi - lo < 0.2:
            continue
        zc, zh = _c(za, zb)
        yc_, yh = _c(lo, hi)
        solid(sec["w"] * 0.98, yh, zh, 0, yc_, zc, K)


slabs(FSECS, zf(18.0), zf(33.8), 1.6)                    # the bow, down its taper (the nose rounds off, it is not a stack of steps)
slabs(BRIDGE, zf(12.0), zf(31.0), 1.6, y_lo=4.5)         # the bridge tower and its raked face
slabs(PH, zf(15.6), zf(25.6), 1.7)                       # the pilot house
solid(8.8, 5.8, 2.8, 0, 0, -29.0, K)                     # the stern block
for bx, by in ((-4.2, 2.6), (4.2, 2.6), (-4.2, -2.6), (4.2, -2.6)):
    solid(2.1, 2.1, 2.55, bx, by, -35.9, K)              # the four engine bells
for sx in (-1, 1):                                       # the radiator wings: each a few slabs tipped to the wing's own dihedral, so the plate is a smooth ramp to walk up
    for s0, s1, lo_, hi_ in ((0.0, 6.0, 0.0, 9.2), (6.0, 9.5, 1.3, 8.3), (9.5, 13.0, 2.5, 7.5)):
        sp_ = (s0 + s1) / 2
        solid((s1 - s0) / 2, 0.42, (hi_ - lo_) / 2, sx * (7.6 + sp_ * math.cos(RAD_DIH)), WY + sp_ * math.sin(RAD_DIH), -6.0 - (lo_ + hi_) / 2, K, sx * RAD_DIH)
# the cargo cages (absolute sizes): posts, the two long rails, each bay's floor, and a block for every stack of crates
for side in (-1, 1):
    ph_ = (BAY_TOP + 0.2 - FOOT_Y) / 2
    for z in FRAME_Z:
        solid(0.3, ph_, 0.3, side * RX, FOOT_Y + ph_, z)
    solid(0.42, 0.3, ZLH, side * RX, BAY_TOP, ZLC)
    solid(0.36, 0.3, ZLH, side * RX, FOOT_Y + 0.12, ZLC)
    for k, z in enumerate(SLOT_Z):
        solid((RX - HW) / 2, 0.18, 4.1, side * (HW + RX) / 2, UY - 0.2, z)
        n_ = len(CARGO[(side, k)])
        if n_:
            solid(1.95, n_ * UNIT_H / 2, 4.2, side * UX, UY + n_ * UNIT_H / 2, z)
FR["collide"] = [v for b_ in _solid for v in b_]
print("freighter collision boxes:", len(_solid))

FR["gearH"] = GEAR_F * K
FR["deck"] = [6.9 * K, 2.6 * K, DZH * K]
FR["deckY"] = 2.5 * K   # top = 5.1
FR["deckZ"] = DZC * K
FR["inside"] = [0, -4.6 * K, -1.5 * K]
FR["rampTop"] = [0, -5.0 * K, -4.4 * K]
FR["rampBottom"] = [0, (BELLY_F - 0.05 - F_RAMP_L * math.sin(-f_open)) * K, (-4.0 - F_RAMP_L * math.cos(f_open) - 0.6) * K]
FR["radius"] = 26.0 * K
FR["padR"] = 21.0 * K

# side by side for previewing
FR.location = tb((40, 0, 0))

print("built", len(C.objects), "objects")


def export():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    keep_loc = FR.location.copy()
    FR.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    for o in C.objects:
        o.select_set(True)
    kw = dict(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
              export_extras=True, export_normals=True, export_texcoords=False, export_materials="EXPORT",
              export_animations=False, export_cameras=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
    FR.location = keep_loc
    print("exported", OUT, os.path.getsize(OUT), "bytes")


if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export()
