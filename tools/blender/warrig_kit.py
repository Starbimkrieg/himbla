# Parts shared by the Rustmoon War-Rig (build_warrig.py) and its alternative study (proposals/warrig_b.py), and the build
# checks clash_check() and float_check(). exec() it after kit.py.
#
# Three.js axes (x right, y up, +z forward), metres, in the model's own frame (the game scales the war-rig 1.35).
# Everything static goes through an Acc (one mesh per slot, parent and ink); wheels are pivots of their own.
#
# Slots: livery `body` (faction colour: a few painted panels), `stripe` (trim), `lens` (glows in the trim colour: viewport
# slits, LED strips), `underglow` (glows in the faction colour). Fixed toons: `dark`, `steel`, `metal`, `tire`, `bleach`
# (sun-bleached plate), `primer`, `copper` (cooling coils and magnet windings), `mli` (gold multi-layer insulation), `foil`
# (silver MLI), `bone` (spikes), `red` (hand wheels), `tank`, and Meridian's colours on the stolen He-3 canisters:
# `mcream`, `mcyan`, `mgold`, `mnavy`. Glows: `lamp` (warm searchlights), `led` (cold white LED bars), `plasma` (the
# reactor's ion blue), `ion` (injector sparks), `laser` (IR sight lenses, drawn red), `beam1`..`beam3` (the laser's beam,
# drawn see-through by the game), `beacon` (antenna tips).
# No rust: there is no oxygen on the Moon. Age shows as bleached paint, scuffed bare metal and frayed foil.

import math
from mathutils import Vector, Euler

PI = math.pi
TAU = 2 * PI

SLOT_COLORS = {
    "body": (0.48, 0.18, 0.97), "stripe": (0.49, 1.0, 0.23), "lens": (0.49, 1.0, 0.23),
    "dark": (0.16, 0.15, 0.25), "steel": (0.33, 0.38, 0.48), "metal": (0.54, 0.53, 0.63), "tire": (0.11, 0.1, 0.16),
    "bleach": (0.79, 0.75, 0.69), "primer": (0.42, 0.44, 0.47), "copper": (0.78, 0.47, 0.24), "mli": (0.85, 0.7, 0.35),
    "foil": (0.8, 0.82, 0.86), "bone": (0.91, 0.88, 0.78), "red": (0.84, 0.15, 0.24), "tank": (0.78, 0.84, 0.92),
    "lamp": (1.0, 0.96, 0.66), "led": (0.91, 0.96, 1.0), "plasma": (0.35, 0.85, 1.0), "ion": (0.6, 0.9, 1.0),
    "laser": (1.0, 0.16, 0.29), "beacon": (1.0, 0.16, 0.29), "underglow": (0.48, 0.18, 0.97),
    "mcream": (1.0, 0.96, 0.88), "mcyan": (0.18, 0.77, 1.0), "mgold": (1.0, 0.82, 0.25), "mnavy": (0.11, 0.23, 0.56),
    "beam1": (1.0, 0.16, 0.29), "beam2": (1.0, 0.16, 0.29), "beam3": (1.0, 0.16, 0.29),
}
# the game's colours (hex) for the preview renders; body / stripe / lens are the Rustmoon livery, body as sun-faded paint
HEX = {
    "body": 0x655682, "stripe": 0x7dff3a, "lens": 0x7dff3a, "dark": 0x2a2540, "steel": 0x55607a, "metal": 0x8a87a0,
    "tire": 0x1d1a29, "bleach": 0xc9c0b0, "primer": 0x6b6f78, "copper": 0xc8783e, "mli": 0xd9b25a, "foil": 0xcfd3dc,
    "bone": 0xe8e0c8, "red": 0xd7263d, "tank": 0xc6d6ea, "lamp": 0xfff6a8, "led": 0xe8f4ff, "plasma": 0x5ad8ff,
    "ion": 0x9be7ff, "laser": 0xff2a4a, "beacon": 0xff2a4a, "underglow": 0x7b2ff7, "mcream": 0xfff4e0, "mcyan": 0x2ec4ff, "mgold": 0xffd23f, "mnavy": 0x1b3a8f, "beam1": 0x7a1422, "beam2": 0x4a0c16, "beam3": 0x26060b,
}
GLOW_SLOTS = {"lens": 2.5, "lamp": 6.0, "led": 6.0, "plasma": 5.0, "ion": 7.0, "laser": 8.0, "beacon": 8.0, "underglow": 4.0, "beam1": 3.0, "beam2": 3.0, "beam3": 3.0}


def V(p):
    return Vector(p)


def bx(c, h, r=(0, 0, 0)):
    """crisp box from half-sizes, rotated (euler) then moved to c"""
    v, f, _ = cuboid(2 * h[0], 2 * h[1], 2 * h[2])
    return xf((v, f), c, r)


def cyl(c, r, h, seg=12, rot=(0, 0, 0), rt=None):
    """capped cylinder, axis y before `rot`"""
    v, f, _ = cylinder(r if rt is None else rt, r, h, seg)
    return xf((v, f), c, rot)


def octa(c, r):
    v = [(r, 0, 0), (-r, 0, 0), (0, r, 0), (0, -r, 0), (0, 0, r), (0, 0, -r)]
    f = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    return xf((v, f), c)


def basis(d):
    """two unit vectors square to d"""
    d = V(d).normalized()
    ref = V((0, 1, 0)) if abs(d.y) < 0.9 else V((1, 0, 0))
    n = d.cross(ref).normalized()
    return n, d.cross(n).normalized()


def frame_xf(geo, c, fwd, up=(0, 1, 0)):
    """place a part built facing +z (y up) so it faces `fwd` from c"""
    f = V(fwd).normalized()
    x = V(up).cross(f)
    if x.length < 1e-6:
        x = V((1, 0, 0))
    x.normalize()
    y = f.cross(x)
    verts, faces = geo
    return [tuple(V(c) + x * v[0] + y * v[1] + f * v[2]) for v in verts], faces


TAG = ["misc"]   # the part being built, for clash_check (set with part())
CLASH = []       # (tag, parent pivot, geometry) of everything added


def part(name):
    TAG[0] = name


class Acc:
    """one mesh per (slot, parent, ink): flush() builds them"""

    def __init__(self, pfx):
        self.pfx, self.d = pfx, {}

    def add(self, geo, slot, parent, ink=0.0):
        self.d.setdefault((slot, parent.name, round(ink, 4)), [parent, []])[1].append(geo)
        CLASH.append((TAG[0], parent, geo, slot))

    def flush(self):
        out = []
        for (slot, pn, ink), (par, geos) in self.d.items():
            out.append(mesh(f"{self.pfx}{pn}_{slot}_{int(ink * 1000)}", join(geos), slot, par, ink))
        self.d = {}
        return out


# ---------------- plates, bolts ----------------

def plate(acc, parent, c, h, rot=(0, 0, 0), slot="bleach", ink=0.025, bolts=0, out=1):
    """a slab of scrap plate (half-sizes), optionally bolted along its outer face (thin axis, side `out`)"""
    acc.add(bx(c, h, rot), slot, parent, ink)
    thin = min(range(3), key=lambda i: h[i])
    a1, a2 = [i for i in range(3) if i != thin]
    m = Euler(rot, "XYZ").to_matrix()
    for k in range(bolts):
        f = -0.8 + 1.6 * k / max(1, bolts - 1)
        for sv in (-0.78, 0.78):
            p = [0.0, 0.0, 0.0]
            p[thin] = out * h[thin]
            p[a1], p[a2] = f * h[a1], sv * h[a2]
            acc.add(octa(tuple(m @ V(p) + V(c)), 0.035), "steel", parent, 0)


# ---------------- running gear ----------------

def coil_spring(a, b, r=0.16, turns=5, wire=0.035, per=6, seg=3):
    A, Bv = V(a), V(b)
    d = Bv - A
    n1, n2 = basis(d)
    N = turns * per
    pts = [tuple(A + d * (0.1 + 0.8 * i / N) + (n1 * math.cos(TAU * i / per) + n2 * math.sin(TAU * i / per)) * r) for i in range(N + 1)]
    return tube(pts, [wire] * len(pts), seg, cap=False)


def coilover(acc, parent, a, b, r=0.16, turns=5, spring="metal"):
    """a long-travel shock: fat body from the top, chrome shaft to the bottom eye, spring round both"""
    A, Bv = V(a), V(b)
    d = Bv - A
    acc.add(beam(tuple(Bv), tuple(A + d * 0.45), r * 0.55, 6), "dark", parent, 0.02)
    acc.add(beam(tuple(A), tuple(A + d * 0.5), r * 0.24, 6), "metal", parent, 0.012)
    for p in (A, Bv):
        acc.add(xf(torus(r * 0.42, r * 0.16, 6, 3), tuple(p), (0, 0, PI / 2)), "steel", parent, 0.01)
    acc.add(coil_spring(a, b, r, turns, per=5), spring, parent, 0.012)
    acc.add(cyl(tuple(A + d * 0.1), r * 1.15, 0.05, 8, rot=_align(d)), "steel", parent, 0.01)
    acc.add(cyl(tuple(A + d * 0.9), r * 1.15, 0.05, 8, rot=_align(d)), "steel", parent, 0.01)


def _align(d):
    """euler (XYZ) turning +y onto d"""
    q = V((0, 1, 0)).rotation_difference(V(d).normalized())
    return tuple(q.to_euler("XYZ"))


def monster_wheel(pfx, i, pos, side, R, hw, parent, lugs=13, spiked=False, seed=0):
    """a tall balloon tyre modelled whole: a carcass and its tread lugs in one mesh (one outline), the lugs swept as one piece
    from just past the centre line over the shoulder and down the sidewall, raked into a chevron, so the deep grooves
    between them read as cut into the tyre. A dished beadlock hub. Pivot `role=wheel`, spun about x by the game."""
    W = pivot(f"{pfx}wheel{i}", pos, parent, role="wheel")
    keep_tag = TAG[0]
    part(f"wheel{i}")
    acc = Acc(f"{pfx}w{i}_")
    LH = 0.11              # lug height: the groove depth
    Rg = R - LH            # the carcass (groove floor)
    prof = [(R * 0.56, -hw), (Rg - 0.22, -hw), (Rg - 0.07, -hw * 0.93), (Rg, -hw * 0.72), (Rg, hw * 0.72), (Rg - 0.07, hw * 0.93),
            (Rg - 0.22, hw), (R * 0.56, hw)]
    tyre = [xf(lathe(prof, 24), r=(0, 0, PI / 2))]
    # one lug's path across the profile: (axial |x|, radius, normal (axial, radial), height)
    path = [(-0.05, Rg, (0.0, 1.0), LH), (hw * 0.8, Rg - 0.02, (0.4, 0.92), LH), (hw, Rg - 0.22, (1.0, 0.12), LH * 0.5)]
    half = PI / lugs * 0.58          # lug half-width (angle): the grooves take the rest of the pitch
    rake = 0.5                       # how far the lug sweeps round (rad) from the centre to the sidewall
    for sgn in (-1, 1):
        for k in range(lugs):
            a0 = TAU * (k + (0.5 if sgn > 0 else 0.0)) / lugs
            verts = []
            for ax, r, (nx, nr), h in path:
                th = a0 + rake * max(0.0, ax) / hw
                for d in (-0.02, h):        # base (sunk into the carcass), top
                    x = sgn * (ax + nx * d)
                    rr = r + nr * d
                    for e in (-half, half):
                        verts.append((x, rr * math.cos(th + e), rr * math.sin(th + e)))
            n = len(path)
            q = lambda i, top, right: i * 4 + top * 2 + right
            faces = []
            for i in range(n - 1):
                faces.append((q(i, 1, 0), q(i, 1, 1), q(i + 1, 1, 1), q(i + 1, 1, 0)))   # top
                faces.append((q(i, 0, 1), q(i, 0, 0), q(i + 1, 0, 0), q(i + 1, 0, 1)))   # base
                faces.append((q(i, 0, 0), q(i, 1, 0), q(i + 1, 1, 0), q(i + 1, 0, 0)))   # one flank
                faces.append((q(i, 1, 1), q(i, 0, 1), q(i + 1, 0, 1), q(i + 1, 1, 1)))   # the other
            faces.append((q(0, 0, 0), q(0, 0, 1), q(0, 1, 1), q(0, 1, 0)))
            m = n - 1
            faces.append((q(m, 0, 1), q(m, 0, 0), q(m, 1, 0), q(m, 1, 1)))
            tyre.append((verts, faces))
    acc.add(join(tyre), "tire", W, 0.05)
    acc.add(xf(cyl((0, 0, 0), R * 0.57, 0.04, 12), (-side * (hw - 0.03), 0, 0), (0, 0, PI / 2)), "dark", W, 0)
    # hub: a deep steel dish with a lip, the beadlock ring and its bolts, a cap with lug nuts
    hub = [(0.0, 0.0), (R * 0.57, 0.0), (R * 0.57, 0.06), (R * 0.5, 0.08), (R * 0.3, 0.16), (R * 0.2, 0.22), (0.0, 0.23)]
    acc.add(xf(lathe(hub, 12), (side * (hw - 0.06), 0, 0), (0, 0, -side * PI / 2)), "steel" if seed % 2 else "primer", W, 0.02)
    acc.add(xf(torus(R * 0.52, 0.035, 14, 3), (side * (hw + 0.02), 0, 0), (0, 0, PI / 2)), "dark", W, 0.01)
    for k in range(6):
        a = TAU * k / 6
        acc.add(octa((side * (hw + 0.06), math.cos(a) * R * 0.52, math.sin(a) * R * 0.52), 0.035), "metal", W, 0)
    if spiked:
        acc.add(xf(lathe([(0.12, 0), (0.08, 0.15), (0, 0.55)], 6), (side * (hw + 0.16), 0, 0), (0, 0, -side * PI / 2)), "bone", W, 0.02)
    acc.flush()
    part(keep_tag)
    return W


def rcs_pod(acc, parent, c, out, up=(0, 1, 0), feed=None):
    """a reaction-control quad on a frame end, as on a lander: an octagonal housing on a heat-shield plate, four bells
    (up, down, fore, aft) on collars, a domed cap with a status LED, and two copper propellant lines back to `feed`"""
    def F(g):
        return frame_xf(g, c, out, up)
    acc.add(F(bx((0, 0, -0.02), (0.22, 0.22, 0.02))), "metal", parent, 0.012)
    acc.add(F(cyl((0, 0, 0.11), 0.15, 0.22, 8, rot=(PI / 2, 0, PI / 8))), "dark", parent, 0.02)
    acc.add(F(xf(lathe([(0.15, 0.0), (0.12, 0.05), (0.0, 0.07)], 8), (0, 0, 0.22), (PI / 2, 0, 0))), "metal", parent, 0.01)
    acc.add(F(bx((0.0, 0.06, 0.285), (0.025, 0.015, 0.006))), "lens", parent, 0)
    bell = lathe([(0.035, 0.0), (0.085, 0.17), (0.07, 0.17), (0.0, 0.06)], 6)
    for ax, sg in ((1, 1), (1, -1), (0, 1), (0, -1)):
        if ax == 1:
            rot = (0 if sg > 0 else PI, 0, 0)
            pos = (0, sg * 0.15, 0.11)
        else:
            rot = (0, 0, -sg * PI / 2)
            pos = (sg * 0.15, 0, 0.11)
        acc.add(F(xf(cyl((0, 0.02, 0), 0.05, 0.05, 6), pos, rot)), "steel", parent, 0.008)
        acc.add(F(xf(bell, pos, rot)), "metal", parent, 0.01)
    if feed:
        Cw = V(c)
        f = V(out).normalized()
        for dy in (-0.07, 0.07):
            p0 = Cw - f * 0.04 + V((0, dy, 0))
            acc.add(tube([tuple(p0), tuple(p0 - f * 0.18), tuple(V(feed) + V((0, dy, 0)))], [0.022] * 3, 5), "copper", parent, 0.006)


def dish(acc, parent, c, r, fwd, ink=0.02):
    """a radar dish lifted whole off a relay mast: a bowl with a rolled rim, four struts to the feed horn, a drive housing
    behind on its yoke, and a patch plate bolted over a dent"""
    th = 0.05
    prof = [(0.0, -th), (r * 0.5, 0.06 * r - th), (r * 0.97, 0.3 * r - th), (r, 0.3 * r), (r * 0.5, 0.06 * r), (0.0, 0.0)]
    acc.add(frame_xf(xf(lathe(prof, 18), r=(PI / 2, 0, 0)), c, fwd), "metal", parent, ink)
    acc.add(frame_xf(xf(torus(r, 0.035, 22, 4), (0, 0, 0.3 * r - 0.01), (PI / 2, 0, 0)), c, fwd), "steel", parent, 0.01)
    tip = (0, 0, r * 0.72)
    for k in range(4):
        a = TAU * k / 4 + PI / 4
        acc.add(frame_xf(beam((math.cos(a) * r * 0.85, math.sin(a) * r * 0.85, r * 0.26), tip, 0.016, 4), c, fwd), "steel", parent, 0.006)
    acc.add(frame_xf(xf(lathe([(0.0, -0.04), (0.06, -0.04), (0.08, 0.1), (0.05, 0.14), (0.0, 0.14)], 8), tip, (PI / 2, 0, 0)), c, fwd), "dark", parent, 0.008)
    acc.add(frame_xf(cyl((0, 0, -0.16), 0.14, 0.24, 10, rot=(PI / 2, 0, 0)), c, fwd), "dark", parent, 0.012)
    acc.add(frame_xf(bx((r * 0.35, -r * 0.3, 0.02 * r - 0.07), (0.16, 0.12, 0.012), (0.08, -0.25, 0)), c, fwd), "bleach", parent, 0.008)


def float_check(gap=0.02, skip_slots=("ion",), skip_tags=(), root="frame"):
    """Print every group of pieces (each Acc.add is a piece) that is not joined to the `root` part through a chain of pieces
    touching each other (a surface within `gap` of a vertex, or triangles cutting into each other): parts hanging in the
    air. Glowing sparks (`skip_slots`) are meant to fly free."""
    from mathutils.bvhtree import BVHTree
    from fnmatch import fnmatch
    verts, faces, owner, pieces = [], [], [], []

    def off(o):
        p = V((0, 0, 0))
        while o is not None:
            L = o.location
            p = p + V((L.x, L.z, -L.y))
            o = o.parent
        return p
    for i, (tag, par, (vs, fs), slot) in enumerate(CLASH):
        base = len(verts)
        o = off(par)
        w = [tuple(V(v) + o) for v in vs]
        verts.extend(w)
        faces.extend(tuple(j + base for j in f) for f in fs)
        owner.extend([i] * len(fs))
        pieces.append((tag, w, fs, slot))
    tree = BVHTree.FromPolygons(verts, faces)
    up = list(range(len(pieces)))

    def find(a):
        while up[a] != a:
            up[a] = up[up[a]]
            a = up[a]
        return a
    for i, (tag, w, fs, slot) in enumerate(pieces):
        near = {owner[j] for _, j in BVHTree.FromPolygons(w, fs).overlap(tree)}
        for v in w:
            near.update(owner[h[2]] for h in tree.find_nearest_range(V(v), gap))
        for j in near:
            up[find(j)] = find(i)
    roots = {find(i) for i, p in enumerate(pieces) if p[0] == root}
    groups = {}
    for i, (tag, w, fs, slot) in enumerate(pieces):
        if find(i) in roots or slot in skip_slots or any(fnmatch(tag, p) for p in skip_tags):
            continue
        groups.setdefault(find(i), []).append(i)
    lone = []
    for g in groups.values():
        pts = [V(v) for i in g for v in pieces[i][1]]
        c = sum(pts, V((0, 0, 0))) / len(pts)
        tags = sorted({pieces[i][0] for i in g})
        lone.append(f"{', '.join(tags)}: {len(g)} piece(s) round ({c.x:.2f}, {c.y:.2f}, {c.z:.2f})")
    print("FLOAT ok" if not lone else f"FLOAT: {len(lone)} group(s) not joined to the {root}:\n  " + "\n  ".join(lone))
    return lone


def clash_check(allow=(), sweep=True):
    """Print where parts tagged differently cut through each other (triangle-triangle intersection; parts merely resting
    on each other do not count). With `sweep`, the turret and barrel are also swung through their travel (yaw every 30
    degrees, barrel at both stops) against everything else. `allow`: (fnmatch pattern, pattern) pairs that are meant to
    meet (a link entering its frame rail, a bolt in its plate)."""
    from mathutils.bvhtree import BVHTree
    from fnmatch import fnmatch

    def chain(o):
        out = []
        while o is not None:
            out.append(o)
            o = o.parent
        return out

    def to_world(v, par, yaw, pitch):
        p = V(v)
        for o in chain(par):
            role = o.get("role")
            if role == "barrel":
                p = Euler((-pitch, 0, 0)).to_matrix() @ p
            elif role == "turret":
                p = Euler((0, yaw, 0)).to_matrix() @ p
            L = o.location
            p = p + V((L.x, L.z, -L.y))
        return p

    groups = {}
    for tag, par, (verts, faces), _slot in CLASH:
        g = groups.setdefault(tag, [[], [], False])
        moving = any(o.get("role") in ("turret", "barrel") for o in chain(par))
        g[2] = g[2] or moving
        o = len(g[0])
        g[0].extend((v, par) for v in verts)
        g[1].extend(tuple(i + o for i in f) for f in faces)

    def build(tag, yaw=0.0, pitch=0.0):
        vs, fs, _ = groups[tag]
        return BVHTree.FromPolygons([tuple(to_world(v, par, yaw, pitch)) for v, par in vs], fs)

    def allowed(a, b):
        return any((fnmatch(a, p) and fnmatch(b, q)) or (fnmatch(b, p) and fnmatch(a, q)) for p, q in allow)

    tags = sorted(groups)
    rest = {t: build(t) for t in tags}
    found = {}
    for i, a in enumerate(tags):
        for b in tags[i + 1:]:
            if allowed(a, b):
                continue
            hit = rest[a].overlap(rest[b])
            if hit:
                found[(a, b, "rest")] = hit
    if sweep:
        movers = [t for t in tags if groups[t][2]]
        fixed = [t for t in tags if not groups[t][2]]
        for yaw in [k * PI / 6 for k in range(12)]:
            for pitch in (-0.12, 0.75):
                for m in movers:
                    tm = build(m, yaw, pitch)
                    for f in fixed:
                        if allowed(m, f):
                            continue
                        hit = tm.overlap(rest[f])
                        if hit:
                            found.setdefault((m, f, f"yaw {math.degrees(yaw):.0f} pitch {pitch:+.2f}"), hit)
    if not found:
        print("CLASH ok:", len(tags), "parts")
        return []
    print(f"CLASH: {len(found)} pair(s) cut through each other")
    for (a, b, pose), hit in sorted(found.items()):
        print(f"  {a} x {b} ({pose}): {len(hit)} triangle pairs")
    return found


# ---------------- lights, sights, sensors ----------------

def searchlight(acc, parent, c, r, fwd=(0, 0, 1), yoke=True, cage=True, ink=0.02):
    """a can light facing `fwd`: back dome, barrel, glowing lens set in its rim, a yoke and a wire guard"""
    can = lathe([(0, -r * 1.1), (r * 0.8, -r * 0.95), (r, 0.2 * r), (r * 1.08, 0.42 * r), (r * 0.9, 0.42 * r)], 8)
    acc.add(frame_xf(xf(can, r=(PI / 2, 0, 0)), c, fwd), "dark", parent, ink)
    acc.add(frame_xf(xf(cyl((0, 0, 0), r * 0.9, 0.04, 8), (0, 0, 0.36 * r), (PI / 2, 0, 0)), c, fwd), "lamp", parent, 0)
    if cage:
        for y in (-0.45, 0.0, 0.45):
            acc.add(frame_xf(beam((-r * 0.95, y * r, 0.5 * r), (r * 0.95, y * r, 0.5 * r), 0.012, 4), c, fwd), "steel", parent, 0)
    if yoke:
        f = V(fwd).normalized()
        side = V((0, 1, 0)).cross(f).normalized() if abs(f.y) < 0.95 else V((1, 0, 0))
        C0 = V(c)
        for s in (-1, 1):
            acc.add(beam(tuple(C0 + side * s * r * 1.15), tuple(C0 + side * s * r * 1.15 - V((0, r * 1.2, 0))), 0.03, 4), "steel", parent, 0.008)
        acc.add(beam(tuple(C0 - side * r * 1.15 - V((0, r * 1.2, 0))), tuple(C0 + side * r * 1.15 - V((0, r * 1.2, 0))), 0.035, 4), "steel", parent, 0.008)


def ledbar(acc, parent, c, n, cell=0.12, rot=(0, 0, 0), h=0.08):
    """a housing with n square LED cells across its face (+z), end brackets"""
    w = n * cell / 2 + 0.04
    acc.add(bx(c, (w, h, 0.07), rot), "dark", parent, 0.015)
    for k in range(n):
        x = -n * cell / 2 + cell * (k + 0.5)
        acc.add(xf(bx((x, 0, 0.068), (cell * 0.4, h * 0.7, 0.008)), c, rot), "led", parent, 0)
    for s in (-1, 1):
        acc.add(xf(bx((s * (w + 0.02), -h * 0.6, -0.02), (0.02, h * 1.2, 0.05)), c, rot), "steel", parent, 0.008)


def laser_sight(acc, parent, c, fwd=(0, 0, 1), length=6.0, ink=0.01):
    """IR target-lock emitter (stolen military kit) and its beam: three segments in slots beam1..beam3, each fainter (the
    game draws them additive and see-through, without depth, so the edge ink leaves them alone)"""
    acc.add(frame_xf(bx((0, 0, 0), (0.05, 0.05, 0.12)), c, fwd), "dark", parent, ink)
    acc.add(frame_xf(cyl((0, 0, 0.13), 0.03, 0.04, 8, rot=(PI / 2, 0, 0)), c, fwd), "laser", parent, 0)
    keep = TAG[0]
    part(keep + "/laser")   # the beam passes through things by nature: clash_check leaves it out
    z = 0.15
    for k, f in enumerate((0.25, 0.35, 0.4)):
        ln = length * f
        acc.add(frame_xf(bx((0, 0, z + ln / 2), (0.012, 0.012, ln / 2)), c, fwd), f"beam{k + 1}", parent, 0)
        z += ln
    part(keep)


def viewport(acc, parent, c, w, h, fwd=(0, 0, 1), up=(0, 1, 0), round_=False, bars=(1, 1)):
    """a tiny, thick viewport: a glowing slit sunk in a heavy frame, a crossbar cage standing off it on posts"""
    g = []
    if round_:
        acc.add(frame_xf(cyl((0, 0, 0.0), w, 0.06, 12, rot=(PI / 2, 0, 0)), c, fwd, up), "lens", parent, 0)
        acc.add(frame_xf(xf(torus(w + 0.04, 0.045, 14, 4), r=(PI / 2, 0, 0)), c, fwd, up), "steel", parent, 0.01)
    else:
        acc.add(frame_xf(bx((0, 0, 0.0), (w, h, 0.03)), c, fwd, up), "lens", parent, 0)
        for p, q in (((-w - 0.05, -h - 0.05), (w + 0.05, -h - 0.05)), ((-w - 0.05, h + 0.05), (w + 0.05, h + 0.05)),
                     ((-w - 0.05, -h - 0.05), (-w - 0.05, h + 0.05)), ((w + 0.05, -h - 0.05), (w + 0.05, h + 0.05))):
            g.append(beam((p[0], p[1], 0.03), (q[0], q[1], 0.03), 0.045, 4))
        acc.add(frame_xf(join(g), c, fwd, up), "steel", parent, 0.01)
        g = []
    # the cage: crossbars 0.09 off the face, on four short posts
    z = 0.12
    ew, eh = w + 0.06, h + 0.07
    nv, nh = bars
    for k in range(nv):
        x = -ew + 2 * ew * (k + 1) / (nv + 1)
        g.append(beam((x, -eh, z), (x, eh, z), 0.022, 4))
    for k in range(nh):
        y = -eh + 2 * eh * (k + 1) / (nh + 1)
        g.append(beam((-ew, y, z), (ew, y, z), 0.022, 4))
    g.append(beam((-ew, -eh, z), (ew, -eh, z), 0.026, 4))
    g.append(beam((-ew, eh, z), (ew, eh, z), 0.026, 4))
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.append(beam((sx * ew, sy * eh, 0.0), (sx * ew, sy * eh, z), 0.022, 4))
    acc.add(frame_xf(join(g), c, fwd, up), "dark", parent, 0.008)


def rcs_quad(acc, parent, c, out=(1, 0, 0), up=(0, 1, 0)):
    """a reaction-control quad on a corner: a block, four bell nozzles (out, up, down, fore-aft) to turn it in the air"""
    acc.add(frame_xf(bx((0, 0, 0), (0.13, 0.13, 0.09)), c, out, up), "dark", parent, 0.015)
    bell = lathe([(0.03, 0.0), (0.045, 0.06), (0.08, 0.15)], 6)
    for d in ((0, 0, 1), (0, 1, 0), (0, -1, 0), (1, 0, 0)):
        if d == (0, 0, 1):
            g = xf(bell, (0, 0, 0.08), (PI / 2, 0, 0))
        elif d[1]:
            g = xf(bell, (0, d[1] * 0.12, 0.0), (0 if d[1] > 0 else PI, 0, 0))
        else:
            g = xf(bell, (d[0] * 0.12, 0, 0.0), (0, 0, -d[0] * PI / 2))
        acc.add(frame_xf(g, c, out, up), "steel", parent, 0.008)


def jag_dish(acc, parent, c, r, fwd, ink=0.02, seed=3):
    """a radar dish scavenged and bent: a shallow bowl (closed: face and back) with a torn, jagged rim, feed horn on three
    spikes, a spike through the middle"""
    segs = 14
    th = 0.05
    prof = [(0.0, -th), (r * 0.35, 0.03 * r - th), (r * 0.7, 0.14 * r - th), (r * 0.98, 0.32 * r - th), (r, 0.32 * r),
            (r * 0.7, 0.14 * r), (r * 0.35, 0.03 * r), (0.0, 0.0)]
    verts, faces = lathe(prof, segs)
    out = []
    for v in verts:
        rr = math.hypot(v[0], v[2])
        if rr > r * 0.9:
            a = math.atan2(v[0], v[2])
            k = int(round(a / TAU * segs)) % segs
            s = (0.72, 1.18, 0.9, 1.08, 0.66, 1.0, 1.22)[(k + seed) % 7]
            v = (v[0] * s, v[1] + (s - 1) * 0.25 * r, v[2] * s)
        out.append(v)
    acc.add(frame_xf(xf((out, faces), r=(PI / 2, 0, 0)), c, fwd), "metal", parent, ink)   # opening towards +z
    tip = (0, 0, r * 0.75)
    for k in range(3):
        a = TAU * k / 3 + 0.3
        acc.add(frame_xf(beam((math.cos(a) * r * 0.7, math.sin(a) * r * 0.7, r * 0.18), tip, 0.015, 4), c, fwd), "steel", parent, 0.006)
    acc.add(frame_xf(xf(lathe([(0.0, 0.0), (0.05, 0.0), (0.07, 0.12), (0.0, 0.14)], 6), tip, (PI / 2, 0, 0)), c, fwd), "dark", parent, 0.008)
    acc.add(frame_xf(xf(lathe([(0.04, 0.0), (0.0, r * 1.2)], 6), (0, 0, 0), (PI / 2, 0, 0)), c, fwd), "steel", parent, 0.008)
    acc.add(frame_xf(cyl((0, 0, -0.12), 0.09, 0.2, 8, rot=(PI / 2, 0, 0)), c, fwd), "dark", parent, 0.01)


def needle(acc, parent, base, length, lean=(0, 0), rings=3, tip="beacon"):
    """a long antenna needle: tapered whip from a base insulator, a few loading rings, a blinking tip"""
    B0 = V(base)
    top = B0 + V((lean[0], length, lean[1]))
    acc.add(xf(lathe([(0.07, 0), (0.07, 0.12), (0.04, 0.2)], 8), tuple(B0)), "dark", parent, 0.008)
    acc.add(tube([tuple(B0 + V((0, 0.15, 0))), tuple(top)], [0.025, 0.008], 4), "steel", parent, 0.006)
    for k in range(rings):
        t = 0.3 + 0.18 * k
        p = B0.lerp(top, t)
        rw = 0.025 + (0.008 - 0.025) * t        # the whip's radius there: the ring is clamped on it
        acc.add(xf(torus(rw + 0.012, 0.012, 8, 3), tuple(p)), "metal", parent, 0)
    acc.add(octa(tuple(top), 0.04), tip, parent, 0)


def mli_blanket(acc, parent, c, r, length, arc=(-1.9, 1.9), seed=0, slot="mli", patch="foil"):
    """multi-layer insulation draped over a tank lying along z: a faceted (quilted) foil shell over `arc` (radians from the
    top), frayed into ragged tabs along both lower edges, a silver patch sewn on"""
    segs = 7
    a0, a1 = arc
    t = 0.035
    verts, faces = [], []
    n = segs + 1
    for z in (-length / 2, length / 2):
        for rr in (r + t, r + 0.004):
            for k in range(n):
                a = a0 + (a1 - a0) * k / segs
                verts.append((math.sin(a) * rr, math.cos(a) * rr, z))
    o = lambda zi, ri, k: zi * 2 * n + ri * n + k
    for k in range(segs):
        faces.append((o(0, 0, k), o(0, 0, k + 1), o(1, 0, k + 1), o(1, 0, k)))      # outer
        faces.append((o(0, 1, k + 1), o(0, 1, k), o(1, 1, k), o(1, 1, k + 1)))      # inner
        faces.append((o(0, 1, k), o(0, 1, k + 1), o(0, 0, k + 1), o(0, 0, k)))      # end
        faces.append((o(1, 0, k), o(1, 0, k + 1), o(1, 1, k + 1), o(1, 1, k)))      # end
    for k in (0, segs):
        faces.append((o(0, 0, k), o(1, 0, k), o(1, 1, k), o(0, 1, k)) if k == 0 else (o(0, 1, k), o(1, 1, k), o(1, 0, k), o(0, 0, k)))
    acc.add(xf((verts, faces), c), slot, parent, 0.012)
    # frayed tabs hanging off both lower edges
    for side, a in ((-1, a0), (1, a1)):
        nt = max(3, int(length / 0.22))
        for k in range(nt):
            z = -length / 2 + length * (k + 0.5) / nt
            j = (k * 5 + seed * 3 + (side > 0)) % 6
            ln = 0.08 + 0.05 * j
            w = length / nt * 0.42
            dn = V((math.sin(a + side * 0.25), math.cos(a + side * 0.25), 0)).normalized()
            p0 = V((math.sin(a) * (r + t / 2), math.cos(a) * (r + t / 2), z))
            tri = [(-w, 0.0), (w, 0.0), (0.25 * w * (j % 3 - 1), -ln)]
            g = extrude(tri, 0.016, "z")
            # lay the tab's -y along the drape direction
            ang = math.atan2(-dn.x, -dn.y)
            acc.add(xf(xf(g, (0, 0, 0)), tuple(p0 + V(c)), (0, 0, -ang + PI)), slot if j % 2 else patch, parent, 0)
    # a sewn-on silver patch
    pa = (a0 + a1) / 2 + 0.5 * (1 if seed % 2 else -1)
    acc.add(xf(bx((0, 0, 0), (0.2, 0.012, length * 0.18)), (math.sin(pa) * (r + t - 0.006) + c[0], math.cos(pa) * (r + t - 0.006) + c[1], c[2] + length * 0.15 * (1 if seed % 2 else -1)), (0, 0, -pa)), patch, parent, 0)


def spike(acc, parent, base, fwd, length=0.6, r=0.1, slot="bone"):
    acc.add(frame_xf(xf(lathe([(r, 0), (r * 0.7, length * 0.25), (0, length)], 6), r=(PI / 2, 0, 0)), base, fwd), slot, parent, 0.015)


def railing_arc(acc, parent, c, R, y, a0, a1, posts=5, r=0.035):
    """a guard ring over an arc (angles about y from +z), posts down to y = 0 of `c`"""
    n = 14
    pts = [(c[0] + math.sin(a0 + (a1 - a0) * k / n) * R, c[1] + y, c[2] + math.cos(a0 + (a1 - a0) * k / n) * R) for k in range(n + 1)]
    acc.add(tube(pts, [r] * len(pts), 5), "dark", parent, 0.012)
    for k in range(posts):
        a = a0 + (a1 - a0) * k / (posts - 1)
        p = (c[0] + math.sin(a) * R, c[1], c[2] + math.cos(a) * R)
        acc.add(beam(p, (p[0], c[1] + y, p[2]), r * 0.85, 4), "dark", parent, 0.01)
