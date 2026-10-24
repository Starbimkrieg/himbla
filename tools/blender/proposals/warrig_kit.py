# Parts shared by the two Rustmoon War-Rig proposals (warrig_a.py, warrig_b.py). exec() it after kit.py.
#
# Three.js axes (x right, y up, +z forward), metres, in the model's own frame (the game scales the war-rig 1.35).
# Everything static goes through an Acc (one mesh per slot, parent and ink); wheels are pivots of their own.
#
# Slots: livery `body` (faction colour: a few painted panels), `stripe` (trim), `lens` (glows in the trim colour: viewport
# slits, LED strips), `underglow` (glows in the faction colour). Fixed toons: `dark`, `steel`, `metal`, `tire`, `bleach` (sun-bleached plate), `primer`, `copper` (cooling coils
# and magnet windings), `mli` (gold multi-layer insulation), `foil` (silver MLI), `bone` (spikes), `red` (hand wheels),
# `tank`. Glows: `lamp` (warm searchlights), `led` (cold white LED bars), `plasma` (the reactor's ion blue), `ion`
# (injector sparks), `laser` (IR sights, drawn red), `beacon` (antenna tips).
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
}
# the game's colours (hex) for the preview renders; body / stripe / lens are the Rustmoon livery, body as sun-faded paint
HEX = {
    "body": 0x655682, "stripe": 0x7dff3a, "lens": 0x7dff3a, "dark": 0x2a2540, "steel": 0x55607a, "metal": 0x8a87a0,
    "tire": 0x1d1a29, "bleach": 0xc9c0b0, "primer": 0x6b6f78, "copper": 0xc8783e, "mli": 0xd9b25a, "foil": 0xcfd3dc,
    "bone": 0xe8e0c8, "red": 0xd7263d, "tank": 0xc6d6ea, "lamp": 0xfff6a8, "led": 0xe8f4ff, "plasma": 0x5ad8ff,
    "ion": 0x9be7ff, "laser": 0xff2a4a, "beacon": 0xff2a4a, "underglow": 0x7b2ff7,
}
GLOW_SLOTS = {"lens": 2.5, "lamp": 6.0, "led": 6.0, "plasma": 5.0, "ion": 7.0, "laser": 8.0, "beacon": 8.0, "underglow": 4.0}


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
        CLASH.append((TAG[0], parent, geo))

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
    acc.add(beam(tuple(Bv), tuple(A + d * 0.45), r * 0.55, 8), "dark", parent, 0.02)
    acc.add(beam(tuple(A), tuple(A + d * 0.5), r * 0.24, 6), "metal", parent, 0.012)
    for p in (A, Bv):
        acc.add(xf(torus(r * 0.42, r * 0.16, 6, 3), tuple(p), (0, 0, PI / 2)), "steel", parent, 0.01)
    acc.add(coil_spring(a, b, r, turns), spring, parent, 0.012)
    acc.add(cyl(tuple(A + d * 0.1), r * 1.15, 0.05, 8, rot=_align(d)), "steel", parent, 0.01)
    acc.add(cyl(tuple(A + d * 0.9), r * 1.15, 0.05, 8, rot=_align(d)), "steel", parent, 0.01)


def _align(d):
    """euler (XYZ) turning +y onto d"""
    q = V((0, 1, 0)).rotation_difference(V(d).normalized())
    return tuple(q.to_euler("XYZ"))


def monster_wheel(pfx, i, pos, side, R, hw, parent, lugs=13, spiked=False, seed=0):
    """a tall balloon tyre with thick, chunky rubber lugs, chewed up: a chevron lug on the crown and a block wrapping each
    shoulder, by turns from either side; some torn off, some half gone, some worn low. A beadlock hub. Pivot `role=wheel`,
    spun about x by the game."""
    W = pivot(f"{pfx}wheel{i}", pos, parent, role="wheel")
    keep_tag = TAG[0]
    part(f"wheel{i}")
    acc = Acc(f"{pfx}w{i}_")
    Rc = R - 0.11   # the carcass under the lugs
    prof = [(R * 0.55, -hw), (R * 0.84, -hw), (Rc - 0.05, -hw * 0.9), (Rc, -hw * 0.66), (Rc, hw * 0.66), (Rc - 0.05, hw * 0.9),
            (R * 0.84, hw), (R * 0.55, hw)]
    acc.add(xf(lathe(prof, 22), r=(0, 0, PI / 2)), "tire", W, 0.05)
    acc.add(xf(cyl((0, 0, 0), R * 0.56, 0.04, 12), (-side * (hw - 0.03), 0, 0), (0, 0, PI / 2)), "dark", W, 0)

    def lug(g, x, r, a):
        return xf(xf(g, (x, r, 0.0)), (0, 0, 0), (a, 0, 0))
    for sgn in (-1, 1):
        for k in range(lugs):
            a = TAU * (k + (0.5 if sgn > 0 else 0.0)) / lugs
            j = (k * 7 + seed * 5 + (3 if sgn > 0 else 0)) % 11
            hgt = 0.07 if j in (5, 8) else (0.02 if j == 0 else 0.115)       # worn low / torn off to a stub / full
            ln = hw * (0.2 if j == 3 else 0.4)                                # half the lug gone
            cx = sgn * (hw * 0.86 - ln)
            g = bx((0, 0, 0), (ln, hgt / 2 + 0.02, 0.09 if j != 9 else 0.06))
            g = xf(g, (0, 0, 0), (0.12 * (j % 3 - 1), sgn * 0.32, 0))          # chevron, a ragged top
            acc.add(lug(g, cx, Rc + hgt / 2 - 0.01, a), "tire", W, 0.02)
            if j not in (6, 0):                                              # the shoulder block, down the sidewall
                sh = xf(bx((0, 0, 0), (0.07, 0.12, 0.09)), (0, 0, 0), (0, 0, -sgn * 0.55))
                acc.add(lug(sh, sgn * (hw * 0.86), Rc - 0.04, a), "tire", W, 0.02)
    # beadlock hub: a deep dish, the clamp ring with its bolts, a cap with lug nuts
    hub = [(0.0, 0.0), (R * 0.56, 0.0), (R * 0.54, 0.08), (R * 0.36, 0.14), (R * 0.22, 0.22), (0.0, 0.24)]
    acc.add(xf(lathe(hub, 14), (side * (hw - 0.06), 0, 0), (0, 0, -side * PI / 2)), "steel" if seed % 2 else "primer", W, 0.02)
    acc.add(xf(torus(R * 0.5, 0.04, 20, 4), (side * (hw + 0.03), 0, 0), (0, 0, PI / 2)), "dark", W, 0.01)
    for k in range(12):
        a = TAU * k / 12
        acc.add(octa((side * (hw + 0.07), math.cos(a) * R * 0.5, math.sin(a) * R * 0.5), 0.035), "metal", W, 0)
    for k in range(6):
        a = TAU * k / 6
        acc.add(octa((side * (hw + 0.18), math.cos(a) * R * 0.15, math.sin(a) * R * 0.15), 0.035), "metal", W, 0)
    if spiked:
        acc.add(xf(lathe([(0.12, 0), (0.08, 0.15), (0, 0.55)], 6), (side * (hw + 0.17), 0, 0), (0, 0, -side * PI / 2)), "bone", W, 0.02)
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
    bell = lathe([(0.035, 0.0), (0.048, 0.05), (0.085, 0.17), (0.072, 0.17), (0.035, 0.06), (0.0, 0.055)], 8)
    for ax, sg in ((1, 1), (1, -1), (0, 1), (0, -1)):
        if ax == 1:
            rot = (0 if sg > 0 else PI, 0, 0)
            pos = (0, sg * 0.15, 0.11)
        else:
            rot = (0, 0, -sg * PI / 2)
            pos = (sg * 0.15, 0, 0.11)
        acc.add(F(xf(cyl((0, 0.02, 0), 0.05, 0.05, 8), pos, rot)), "steel", parent, 0.008)
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
    for tag, par, (verts, faces) in CLASH:
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
    can = lathe([(0, -r * 1.1), (r * 0.8, -r * 0.95), (r, 0.2 * r), (r * 1.08, 0.42 * r), (r * 0.9, 0.42 * r)], 10)
    acc.add(frame_xf(xf(can, r=(PI / 2, 0, 0)), c, fwd), "dark", parent, ink)
    acc.add(frame_xf(xf(cyl((0, 0, 0), r * 0.9, 0.04, 10), (0, 0, 0.36 * r), (PI / 2, 0, 0)), c, fwd), "lamp", parent, 0)
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
    """IR target-lock emitter (stolen military kit) and its beam (the game can scale or hide `laser` meshes)"""
    acc.add(frame_xf(bx((0, 0, 0), (0.05, 0.05, 0.12)), c, fwd), "dark", parent, ink)
    acc.add(frame_xf(cyl((0, 0, 0.13), 0.03, 0.04, 8, rot=(PI / 2, 0, 0)), c, fwd), "laser", parent, 0)
    keep = TAG[0]
    part(keep + "/laser")   # the beam passes through things by nature: clash_check leaves it out
    acc.add(frame_xf(bx((0, 0, 0.15 + length / 2), (0.008, 0.008, length / 2)), c, fwd), "laser", parent, 0)
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
        p = B0.lerp(top, 0.3 + 0.18 * k)
        acc.add(xf(torus(0.06 - 0.012 * k, 0.012, 8, 3), tuple(p)), "metal", parent, 0)
    acc.add(octa(tuple(top), 0.04), tip, parent, 0)


def mli_blanket(acc, parent, c, r, length, arc=(-1.9, 1.9), seed=0, slot="mli", patch="foil"):
    """multi-layer insulation draped over a tank lying along z: a faceted (quilted) foil shell over `arc` (radians from the
    top), frayed into ragged tabs along both lower edges, a silver patch sewn on"""
    segs = 9
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
    acc.add(xf(bx((0, 0, 0), (0.2, 0.012, length * 0.18)), (math.sin(pa) * (r + t + 0.006) + c[0], math.cos(pa) * (r + t + 0.006) + c[1], c[2] + length * 0.15 * (1 if seed % 2 else -1)), (0, 0, -pa)), patch, parent, 0)


def spike(acc, parent, base, fwd, length=0.6, r=0.1, slot="bone"):
    acc.add(frame_xf(xf(lathe([(r, 0), (r * 0.7, length * 0.25), (0, length)], 6), r=(PI / 2, 0, 0)), base, fwd), slot, parent, 0.015)


def railing_arc(acc, parent, c, R, y, a0, a1, posts=5, r=0.035):
    """a guard ring over an arc (angles about y from +z), posts down to y = 0 of `c`"""
    n = 14
    pts = [(c[0] + math.sin(a0 + (a1 - a0) * k / n) * R, c[1] + y, c[2] + math.cos(a0 + (a1 - a0) * k / n) * R) for k in range(n + 1)]
    acc.add(tube(pts, [r] * len(pts), 6), "dark", parent, 0.012)
    for k in range(posts):
        a = a0 + (a1 - a0) * k / (posts - 1)
        p = (c[0] + math.sin(a) * R, c[1], c[2] + math.cos(a) * R)
        acc.add(beam(p, (p[0], c[1] + y, p[2]), r * 0.85, 4), "dark", parent, 0.01)
