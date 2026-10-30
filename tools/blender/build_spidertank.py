# Zbornak's spider tank (the Triple Crown's reward), for Blender 4.2+ / 5.x -> src/assets/spidertank.glb (read by src/spidertank.js;
# reviewed in tools/spidertank-lab.html; docs/spidertank/).
#
#   MOONRUNNER_REPO=<repo> python3 tools/blender/build_spidertank.py         (a few seconds)
#   MOONRUNNER_EXPORT=0 ...                                                     (build, don't write)
#
# ARACHNE, revision 2. A bulky armoured bead on eight angular legs: the hull a faceted egg of off-white plates over a dark frame, the
# legs bolted to a belt round its waist, a visor in the blunt nose, the beam cannon under it, the antimatter reactor glowing violet
# through a grilled window in the spine, and Zbornak's green LEDs here and there. For overdrive it closes up into the bead: each leg
# folds into a tight zigzag against the hull, slides in through its hip port, and a hatch swings shut over the port; the cannon draws
# back into the nose; the jets come out. Slowing down, it all runs backwards and the legs stand it up. Each leg's rams work: one lifts
# the thigh from the hull, one bends the knee.
#
# Frame: three.js axes (x right, y up, +z forward), metres, origin on the ground under the middle of the hull, legs at their walking
# rest pose with the feet on y = 0.
#
# Pivots (empties with a role):
#   leg     at the hip; `knee` pivots down it at each joint, `foot` at the ground contact (the chimera kit's jointed legs: src/gait.js
#           walks them). Extras on the leg: side (-1 left, 1 right), n (0 front to 3 back).
#   cannon  the beam cannon's base; `muzzle` at its tip, the beam leaves along +z
#   port    the steel collar round a hip, sliding in with its leg
#   hatch   a hip port's door, authored open (swung into the hull, out of sight)
#   ram     a hydraulic ram's barrel, extra `to`: the name of its `rod` pivot on the next bone (or the leg) along; the game turns
#           each to face the other every frame, so the ram stretches and shortens as the joint moves
#   skim    a jet, shown only when skimming (grown from nothing)
#   seat    where the runner sits (hidden)
# The overdrive: a pivot with extra `fold` ([x, y, z, w], three.js axes) turns to that local quaternion over `foldSpan` ([start, end]
# of the fold, 0 to 1); one with `foldPos` ([x, y, z]) moves there over `foldPosSpan` (else `foldSpan`); one with `foldScale` ([from,
# to]) grows over `foldSpan`. Legs zigzag over 0 to 0.5 and slide in over 0.4 to 0.85, the hatches shut over 0.8 to 1, the cannon draws
# in over 0.05 to 0.45, the jets grow over 0.7 to 1.
# Slots (palette: src/spidertank.js): armor (the plates), armor2 (the lower plates), frame (the dark structure), steel (joints,
# collars), metal (rams), and lit: core (the antimatter violet), visor, led (Zbornak's green), thrust (the jets).
# Root extras: hipY (hip height), span (hip to foot along the ground), belly (the hull's underside over the ground, standing), skimDrop
# (how far the folded hull settles), radius.
import bpy, math, os
from mathutils import Vector, Matrix


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        return os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
    return os.getcwd()


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "spidertank.glb")
COLL = "SpiderTank"

# preview colours only: the game swaps in its own materials
SLOT_COLORS = {
    "armor": (0.91, 0.89, 0.96), "armor2": (0.79, 0.77, 0.85), "frame": (0.13, 0.11, 0.2), "steel": (0.33, 0.38, 0.48),
    "metal": (0.54, 0.53, 0.63), "core": (0.78, 0.49, 1.0), "visor": (0.6, 0.9, 1.0), "led": (0.49, 1.0, 0.23), "thrust": (0.85, 0.65, 1.0),
}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)

UP = Vector((0, 1, 0))
FACET = math.radians(14)                                             # (edges sharper than this stay hard: flat facets read flat)
HY = 3.1                                                             # hip height, the hull's waist

# ---------------- the hull: a faceted bead ----------------
N = 16                                                               # facets round it (22.5 degrees each)
E = 2.3                                                              # its sections' squareness (2: an ellipse)
SECS = [(-3.1, 0.55, 0.45, 0.4), (-2.6, 1.45, 0.95, 0.8), (-1.7, 2.0, 1.28, 1.08), (-0.6, 2.25, 1.42, 1.18), (0.6, 2.25, 1.42, 1.18),
        (1.7, 2.05, 1.3, 1.1), (2.55, 1.55, 1.0, 0.88), (3.05, 0.85, 0.62, 0.55)]   # (z, half-width, height above the waist, below)


def sec(z):
    for a, b in zip(SECS, SECS[1:]):
        if a[0] <= z <= b[0]:
            f = (z - a[0]) / (b[0] - a[0])
            return [a[k] + (b[k] - a[k]) * f for k in (1, 2, 3)]
    return list(SECS[0][1:] if z < SECS[0][0] else SECS[-1][1:])


def surf(z, th, off=0.0):
    """the bead's surface at z and angle th (0: right, 90 degrees: top), pushed off it by `off` (three.js axes)"""
    w, t, b = sec(z)
    c, s = math.cos(th), math.sin(th)
    h = t if s >= 0 else b
    x, y = w * spe(c, 2 / E), h * spe(s, 2 / E)
    n = Vector((x / (w * w), y / (h * h), 0)).normalized()
    return Vector((x, HY + y, z)) + n * off


def grid_vals(a, b, marks, step):
    """from a to b, through the marks between them, no wider apart than step"""
    pts = sorted({a, b} | {m for m in marks if a < m < b})
    out = [pts[0]]
    for p in pts[1:]:
        k = max(1, math.ceil((p - out[-1]) / step - 1e-9))
        out += [out[-1] + (p - out[-1]) * i / k for i in range(1, k + 1)]
    return out


ANG = [2 * math.pi * i / N for i in range(-N, 2 * N)]


def panel(z0, z1, a0, a1, o0=-0.04, o1=0.06, gap=0.07):
    """an armour plate on the bead: z0..z1, angles a0..a1 (degrees), from o0 to o1 off the surface, a gap's width short of its edges;
    its facets on the bead's own, closed (so it outlines cleanly)"""
    da = math.degrees(gap / 2.0)
    A = grid_vals(math.radians(a0 + da), math.radians(a1 - da), ANG, math.radians(22.5))
    Z = grid_vals(z0 + gap / 2, z1 - gap / 2, [s[0] for s in SECS], 0.7)
    na, nz = len(A), len(Z)
    verts = [tuple(surf(z, a, o)) for o in (o1, o0) for z in Z for a in A]
    idx = lambda layer, i, j: layer * na * nz + i * na + j
    faces = []
    for i in range(nz - 1):
        for j in range(na - 1):
            faces.append((idx(0, i, j), idx(0, i, j + 1), idx(0, i + 1, j + 1), idx(0, i + 1, j)))
            faces.append((idx(1, i, j), idx(1, i + 1, j), idx(1, i + 1, j + 1), idx(1, i, j + 1)))
    ring = [(0, j) for j in range(na)] + [(i, na - 1) for i in range(1, nz)] + [(nz - 1, j) for j in range(na - 2, -1, -1)] + [(i, 0) for i in range(nz - 2, 0, -1)]
    for k in range(len(ring)):
        (i0, j0), (i1, j1) = ring[k], ring[(k + 1) % len(ring)]
        faces.append((idx(0, i0, j0), idx(1, i0, j0), idx(1, i1, j1), idx(0, i1, j1)))
    return verts, faces


def facet_mesh(name, geo, slot, parent, ink):
    return mesh(name, geo, slot, parent, ink, sharp=FACET)


# ---------------- legs ----------------
def frame(u, o):
    """a bone's frame: columns side, out (the armour's side), along (u); out made square to along"""
    u = Vector(u).normalized()
    o = (Vector(o) - u * Vector(o).dot(u)).normalized()
    return Matrix((o.cross(u), o, u)).transposed()


def put(geo, m, t=(0, 0, 0)):
    v, f = geo[0], geo[1]
    t = Vector(t)
    return [tuple(m @ Vector(p) + t) for p in v], f


def slab(z0, z1, w0, w1, t, b, yc=0.0, e=4.0, n=8, steps=3, wmid=None):
    """a lofted bar along z: half-width w0 -> w1 (bulging to wmid mid-way), t above and b below yc; e: squareness"""
    secs = []
    for k in range(steps + 1):
        f = k / steps
        w = w0 + (w1 - w0) * f
        if wmid:
            w += (wmid - (w0 + w1) / 2) * math.sin(math.pi * f)
        secs.append(dict(z=z0 + (z1 - z0) * f, w=w, t=t, b=b, yc=yc, eT=e, eB=e))
    return loft(secs, n)


def drum(r, w, seg=10):
    """a joint drum across the bone (axis x), chamfered"""
    return xf(lathe([(0, -w / 2), (r * 0.78, -w / 2), (r, -w / 2 + r * 0.22), (r, w / 2 - r * 0.22), (r * 0.78, w / 2), (0, w / 2)], seg), r=(0, 0, math.pi / 2))


def plate_geo(L, p0, p1, pw, pt, yc, tip=0.55, root=0.8):
    """an angular armour shield along a bone (p0..p1 of its length), widest at a third, a ridge down its crown, pt thick"""
    secs = []
    for f, wk in ((0.0, root), (0.3, 1.0), (0.72, 0.9), (1.0, tip)):
        secs.append(dict(z=L * (p0 + (p1 - p0) * f), w=pw * wk, t=pt, b=pt * 0.3, yc=yc, eT=1.0, eB=6.0))
    return loft(secs, 8)


def bone(name, parent, a, b, out, s, last=False):
    """a leg bone from a to b (in its joint's frame), armour on the `out` side: a strut, a drum at its joint, a shield, LEDs"""
    L = (Vector(b) - Vector(a)).length
    m = frame(Vector(b) - Vector(a), out)
    facet_mesh(name + "_frame", put(slab(0.0, L, s["sw0"], s["sw1"], s["st"], s["st"], e=6.0, wmid=s.get("swm")), m, a), "frame", parent, 0.035)
    facet_mesh(name + "_drum", put(drum(s["dr"], s["dw"]), m, a), "steel", parent, 0.035)
    facet_mesh(name + "_hub", put(join([xf(lathe([(0, 0), (s["dr"] * 0.55, 0), (s["dr"] * 0.45, 0.05), (0, 0.05)], 8), (k * s["dw"] / 2, 0, 0), (0, 0, -k * math.pi / 2))
                                         for k in (-1, 1)]), m, a), "frame", parent, 0)
    top = s["st"] * 0.7
    if s.get("pw"):
        facet_mesh(name + "_plate", put(plate_geo(L, s.get("p0", 0.1), s.get("p1", 0.92), s["pw"], s["pt"], top, s.get("tip", 0.55), s.get("root", 0.8)), m, a),
                   "armor", parent, 0.04)
        if s.get("leds"):                                            # (two of Zbornak's green LEDs near the far end, on the ridge)
            facet_mesh(name + "_leds", put(join([xf(cuboid(0.06, 0.03, 0.09)[:2], (0, top + s["pt"] - 0.012, L * f)) for f in (0.74, 0.8)]), m, a), "led", parent, 0)
    if last:                                                         # (an angular hoof-claw, its tip on the contact)
        facet_mesh(name + "_hoof", put(lathe([(0, 0), (s["sw1"] * 1.5, 0.08), (s["sw1"] * 1.7, 0.32), (s["sw1"] * 1.1, 0.6), (0, 0.66)], 6), m @ Matrix.Rotation(math.pi / 2, 3, "X"),
                                           Vector(a) + (Vector(b) - Vector(a)) * (1 - 0.66 / L)), "steel", parent, 0.025)


def quat(m):
    q = m.to_quaternion()
    return [q.x, q.y, q.z, q.w]


T3B = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))                     # (three.js axes -> Blender's)


def facing(e, d):
    """turn an empty so its +z (three.js axes) points along d"""
    q = Vector((0, 0, 1)).rotation_difference(Vector(d).normalized())
    e.rotation_mode = "QUATERNION"
    e.rotation_quaternion = (T3B @ q.to_matrix() @ T3B.transposed()).to_quaternion()


def ram(name, pa, a_local, a_world, pb, b_local, b_world, rb, rr):
    """a hydraulic ram from a (on pivot pa) to b (on pivot pb): a barrel pivot at a and a rod pivot at b, each built along its +z and
    facing the other (the game keeps them facing); each 0.7 of the rest length, so it reaches from 0.7 to 1.4 of it"""
    D = (Vector(b_world) - Vector(a_world)).length
    rod = pivot(name + "_rod", tuple(b_local), pb, role="rod")
    barrel = pivot(name + "_barrel", tuple(a_local), pa, role="ram", to=rod.name)
    facing(barrel, Vector(b_world) - Vector(a_world))
    facing(rod, Vector(a_world) - Vector(b_world))
    eye = lambda r: xf(lathe([(0, -r * 0.7), (r * 1.25, -r * 0.7), (r * 1.25, r * 0.7), (0, r * 0.7)], 8), r=(0, 0, math.pi / 2))
    facet_mesh(name + "_barrel", join([xf(lathe([(0, 0.0), (rb, 0.0), (rb, 0.7 * D), (rb * 0.7, 0.7 * D + 0.03), (0, 0.7 * D + 0.03)], 8), r=(math.pi / 2, 0, 0)),
                                       eye(rb)]), "metal", barrel, 0.015)
    facet_mesh(name + "_rod", join([xf(lathe([(0, 0.0), (rr, 0.0), (rr, 0.7 * D), (0, 0.7 * D)], 6), r=(math.pi / 2, 0, 0)), eye(rr)]), "steel", rod, 0.012)


def leg(root, name, pts, outs, folds, specs, side, n, retract):
    """a leg: joints pts (hip first, foot last, in the root's frame), the armour side of each bone, its zigzag (each bone's folded
    direction; the armour carried round by the hinge), and where its hip slides to inside the hull"""
    P = [Vector(p) for p in pts]
    joints = [pivot(name, tuple(P[0]), root, role="leg", side=side, n=n)]
    for i in range(1, len(P) - 1):
        joints.append(pivot(f"{name}_knee{i}", tuple(P[i] - P[i - 1]), joints[-1], role="knee"))
    for i in range(len(P) - 1):
        bone(f"{name}_b{i}", joints[i], (0, 0, 0), tuple(P[i + 1] - P[i]), outs[i], specs[i], last=i == len(P) - 2)
    pivot(f"{name}_foot", tuple(P[-1] - P[-2]), joints[-1], role="foot")
    hinge = lambda i, u: (P[i + 1] - P[i]).normalized().rotation_difference(Vector(u).normalized()) @ Vector(outs[i])
    R = [frame(u, hinge(i, u)) @ frame(P[i + 1] - P[i], outs[i]).transposed() for i, u in enumerate(folds)]
    for i, j in enumerate(joints):
        j["fold"] = quat(R[i] if i == 0 else R[i - 1].transposed() @ R[i])
        j["foldSpan"] = [0.0, 0.5]
    joints[0]["foldPos"] = list(Vector(retract))
    joints[0]["foldPosSpan"] = [0.4, 0.85]
    return joints


def tris(objs):
    return sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)


# ================= build =================
R = pivot("spidertank", (0, 0, 0), None, title="ARACHNE")

# the frame: the bead itself, dark; it shows in the seams and as the belt round the waist the legs bolt to
facet_mesh("core", loft([dict(z=z, w=w, t=t, b=b, yc=HY, eT=E, eB=E) for z, w, t, b in SECS], N), "frame", R, 0.07)
# the plates: the spine (standing a little prouder), the upper flanks (one over each hip), the lower flanks and the belly in the
# second colour; the nose and tail are pieces of their own
Zs = [-2.95, -1.15, 0.0, 1.15, 2.88]
for side, (a0, a1) in ((1, (22.5, 67.5)), (-1, (112.5, 157.5))):
    for k in range(4):
        facet_mesh(f"flank{side}_{k}", panel(Zs[k], Zs[k + 1], a0, a1), "armor", R, 0.05)
for k, (z0, z1) in enumerate(((-2.95, -0.95), (-0.95, -0.38), (0.38, 0.95), (0.95, 2.88))):
    facet_mesh(f"spine{k}", panel(z0, z1, 67.5, 112.5, o1=0.1), "armor", R, 0.05)
for side, (a0, a1) in ((1, (-67.5, -22.5)), (-1, (202.5, 247.5))):
    for k, (z0, z1) in enumerate(((-2.95, -0.7), (-0.7, 0.7), (0.7, 2.88))):
        facet_mesh(f"lower{side}_{k}", panel(z0, z1, a0, a1), "armor2", R, 0.04)
for k, (z0, z1) in enumerate(((-2.95, 0.0), (0.0, 2.88))):
    facet_mesh(f"belly{k}", panel(z0, z1, 247.5, 292.5), "armor2", R, 0.04)
# the reactor window in the spine: the antimatter glowing violet under a steel grille
facet_mesh("reactor", panel(-0.42, 0.42, 72, 108, o0=-0.06, o1=0.015, gap=0.0), "core", R, 0)
facet_mesh("grille", join([panel(z - 0.035, z + 0.035, 70, 110, o0=0.0, o1=0.07, gap=0.0) for z in (-0.24, 0.0, 0.24)]), "steel", R, 0.02)
# LED strips along the upper belt between the hips
for side in (-1, 1):
    for k, z in enumerate((-2.25, 0.0, 2.25)):
        p = surf(z, math.radians(14 if side > 0 else 166), 0.004)
        facet_mesh(f"beltled{side}_{k}", xf(cuboid(0.02, 0.05, 0.42)[:2], tuple(p)), "led", R, 0)
# the nose: an armoured octagonal face, the visor slit across it, three LEDs either side, the cannon's collar below
face = [dict(z=2.95, w=0.86, t=0.6, b=0.56), dict(z=3.2, w=0.66, t=0.44, b=0.42)]
facet_mesh("face", loft([{**s, "yc": HY, "eT": 1.3, "eB": 1.3} for s in face], 8), "armor", R, 0.05)
facet_mesh("visor", xf(cuboid(0.84, 0.1, 0.06)[:2], (0, HY + 0.18, 3.205), (-0.32, 0, 0)), "visor", R, 0.015)
facet_mesh("faceleds", join([xf(cuboid(0.05, 0.05, 0.03)[:2], (sx * 0.5, HY + 0.12 - 0.11 * k, 3.21)) for sx in (-1, 1) for k in range(3)]), "led", R, 0.008)
facet_mesh("collar", xf(lathe([(0.24, 0), (0.34, 0.0), (0.34, 0.14), (0.24, 0.14)], 8), (0, HY - 0.3, 3.1), (math.pi / 2, 0, 0)), "steel", R, 0.025)
# the tail: an octagonal cap and its jet bell (lit when skimming)
tail = [dict(z=-3.0, w=0.6, t=0.5, b=0.45), dict(z=-3.28, w=0.42, t=0.34, b=0.3)]
facet_mesh("tail", loft([{**s, "yc": HY, "eT": 1.3, "eB": 1.3} for s in tail], 8), "frame", R, 0.04)
facet_mesh("bell", xf(lathe([(0.26, 0), (0.3, -0.1), (0.36, -0.32), (0.3, -0.33), (0.2, -0.12), (0, -0.1)], 10), (0, HY, -3.25), (math.pi / 2, 0, 0)), "steel", R, 0.025)

# the cannon, under the visor: breech, faceted barrel, focusing rings, emitter; it draws back into the nose for overdrive
gun = pivot("cannon", (0, HY - 0.3, 2.45), R, role="cannon", foldPos=[0, HY - 0.3, 0.0], foldSpan=[0.05, 0.45])
facet_mesh("breech", xf(lathe([(0, -0.6), (0.36, -0.6), (0.42, -0.35), (0.42, 0.3), (0.28, 0.5), (0, 0.5)], 8), r=(math.pi / 2, 0, 0)), "frame", gun, 0.03)
facet_mesh("barrel", xf(lathe([(0.19, 0.45), (0.17, 2.2), (0.23, 2.28), (0.23, 2.45), (0.16, 2.5)], 8), r=(math.pi / 2, 0, 0)), "steel", gun, 0.025)
facet_mesh("rings", join([xf(lathe([(0.2, -0.05), (0.27, -0.02), (0.27, 0.02), (0.2, 0.05)], 8), (0, 0, z), (math.pi / 2, 0, 0)) for z in (1.15, 1.55, 1.95)]), "armor", gun, 0.015)
facet_mesh("emitter", xf(lathe([(0, 2.42), (0.14, 2.44), (0.11, 2.57), (0, 2.59)], 8), r=(math.pi / 2, 0, 0)), "core", gun, 0)
pivot("muzzle", (0, 0, 2.6), gun, role="muzzle")
pivot("seat", (0, HY + 0.4, 1.2), R, role="seat")

# overdrive pieces, grown from nothing: three jets down the belly and the tail jet's flame
for k, z in enumerate((1.3, 0.0, -1.3)):
    jet = pivot(f"jet{k}", tuple(surf(z, 1.5 * math.pi, 0.07)), R, role="skim", foldScale=[0.001, 1.0], foldSpan=[0.7, 1.0])
    facet_mesh(f"jet{k}_glow", lathe([(0, 0.0), (0.5, 0.0), (0.4, -0.06), (0, -0.07)], 6), "thrust", jet, 0)
tj = pivot("tailjet", (0, HY, -3.42), R, role="skim", foldScale=[0.001, 1.0], foldSpan=[0.7, 1.0])
facet_mesh("tailjet_flame", xf(lathe([(0, 0), (0.24, 0), (0.0, -0.5)], 10), r=(math.pi / 2, 0, 0)), "thrust", tj, 0)

# the legs: from the belt, splayed (the front pair reaching ahead), a high knee, a long shin, a hoof-claw; each port has a hatch
HIPS = [1.65, 0.55, -0.55, -1.65]


def specs():
    return [dict(sw0=0.25, sw1=0.21, swm=0.29, st=0.22, dr=0.38, dw=0.66, pw=0.52, pt=0.13, leds=True),
            dict(sw0=0.21, sw1=0.15, st=0.18, dr=0.32, dw=0.56, pw=0.4, pt=0.1, tip=0.45),
            dict(sw0=0.15, sw1=0.09, st=0.13, dr=0.25, dw=0.44, pw=0.25, pt=0.07, p0=0.06, p1=0.62, tip=0.4)]


for n, hz in enumerate(HIPS):
    for sx in (-1, 1):
        nm = f"leg{'L' if sx < 0 else 'R'}{n}"
        w = sec(hz)[0]
        hip = Vector((sx * (w - 0.12), HY, hz))
        yaw = math.radians((40, 14, -14, -40)[n])
        d = Vector((sx * math.cos(yaw), 0, math.sin(yaw)))
        k1 = hip + d * 1.45 + UP * 1.35
        k2 = k1 + d * 1.75 - UP * 1.75
        ft = k2 + d * 0.6 + UP * -k2.y
        outs = [UP + d * 0.6, d + UP * 0.3, d]
        # the zigzag, against the hull toward its middle (front legs back, rear ones forward; the outer pairs higher than the inner)
        dz = -1 if hz > 0 else 1
        rise = 0.2 if n in (0, 3) else -0.2
        folds = [(-sx * 0.12, rise, dz), (-sx * 0.04, -0.12, -dz), (0.0, -0.08, dz)]
        joints = leg(R, nm, [hip, k1, k2, ft], outs, folds, specs(), sx, n, (sx * (w - 1.6), HY, hz))
        # the port: a steel collar round the hip (it slides in with the leg), and its hatch: a plate on the bead's own facets, hinged
        # along its top edge, authored swung in (out of sight) and turned shut for overdrive
        cp = pivot(f"{nm}_port", (sx * (w - 0.06), HY, hz), R, role="port", foldPos=[sx * (w - 1.6), HY, hz], foldSpan=[0.4, 0.85])
        facet_mesh(f"{nm}_collar", xf(lathe([(0.4, 0), (0.5, 0.0), (0.5, 0.1), (0.4, 0.1)], 8), r=(0, 0, -sx * math.pi / 2)), "steel", cp, 0.025)
        # the rams, under the leg: the lift ram from the hull below the port to the thigh, the knee ram from the thigh to the shin
        sp_ = specs()
        m0, m1 = frame(k1 - hip, outs[0]), frame(k2 - k1, outs[1])
        L0, L1 = (k1 - hip).length, (k2 - k1).length
        hull_pt = surf(hz, math.radians(-30 if sx > 0 else 210), -0.04)
        thigh_lo = m0 @ Vector((0, -(sp_[0]["st"] + 0.12), 0.38 * L0))
        thigh_hi = m0 @ Vector((0, -(sp_[0]["st"] + 0.1), 0.72 * L0))
        shin_pt = m1 @ Vector((0, -(sp_[1]["st"] + 0.1), 0.3 * L1))
        ram(f"{nm}_lift", cp, hull_pt - Vector((sx * (w - 0.06), HY, hz)), hull_pt, joints[0], thigh_lo, hip + thigh_lo, 0.1, 0.055)
        ram(f"{nm}_knee", joints[0], thigh_hi, hip + thigh_hi, joints[1], shin_pt, k1 + shin_pt, 0.085, 0.05)
        a_c = 0 if sx > 0 else 180
        top = surf(hz, math.radians(a_c + (21 if sx > 0 else -21)), 0.0)
        shut = panel(hz - 0.48, hz + 0.48, a_c - 21, a_c + 21, o0=0.01, o1=0.07, gap=0.0)
        open_ = Matrix.Rotation(-sx * math.radians(100), 3, "Z")
        hatch = pivot(f"{nm}_hatch", tuple(top), R, role="hatch", fold=quat(open_.transposed()), foldSpan=[0.8, 1.0])
        facet_mesh(f"{nm}_door", ([tuple(open_ @ (Vector(v) - top)) for v in shut[0]], shut[1]), "armor", hatch, 0.03)

bpy.context.view_layer.update()
sp = []
for o in C.objects:
    if o.get("role") == "foot":
        hipo = o.parent
        while hipo.get("role") != "leg":
            hipo = hipo.parent
        f, h = o.matrix_world.translation, hipo.matrix_world.translation
        sp.append(math.hypot(f.x - h.x, f.y - h.y))
R["hipY"], R["span"], R["skimDrop"], R["radius"] = HY, sum(sp) / len(sp), 1.15, 6.0
R["belly"] = HY - SECS[3][3]                                          # (the hull's underside, standing: its waist less the widest bottom)
print(f"spidertank: {tris(list(C.objects))} triangles, span {R['span']:.2f} m")
audit_coplanar([o for o in C.objects])
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
