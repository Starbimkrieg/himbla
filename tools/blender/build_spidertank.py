# Zbornak's spider tank, two proposals, for Blender 4.2+ / 5.x -> src/assets/spidertank.glb (read by src/spidertank.js; reviewed in
# tools/spidertank-lab.html; docs/spidertank-proposals/).
#
#   MOONRUNNER_REPO=<repo> python3 tools/blender/build_spidertank.py         (a few seconds)
#   MOONRUNNER_EXPORT=0 ...                                                     (build, don't write)
#
# The end-game mount: a walking tank on eight armoured legs, a mini antimatter reactor, a central beam cannon and a sealed cockpit
# (the runner rides inside, hidden). Past a run its legs fold into the armour of a compact skimming frame (overdrive).
#
#   spider_a  ARACHNE: a round spider. A low armoured cephalothorax on a hip ring, the reactor in a ribbed abdomen behind, the
#             cannon slung under the brow like a fang. Legs radiate from the ring in three long bones; folded on their own hinges, the
#             thighs swing down and out (their plates become the saucer's rim), the shins curl in under the belly (its armoured
#             underside) and the long feet trail back under the reactor.
#   spider_b  STRIDER: a long armoured wedge, legs in a row down each flank, the reactor in a containment ring at the tail, the cannon a
#             rail down the spine. Folded, each leg swings back along its flank: the thigh plates lie over each other as side armour,
#             the shins fold forward under them and the feet trail as skids: a dart.
#
# Frame: three.js axes (x right, y up, +z forward), metres, origin on the ground under the middle of the hull, legs at their walking
# rest pose with the feet on y = 0.
#
# Pivots (empties with a role, every one authored unrotated):
#   leg     at the hip; `knee` pivots down it at each joint, `foot` at the ground contact (the chimera kit's jointed legs: src/gait.js
#           walks them). Extras on the leg: side (-1 left, 1 right), n (0 front to 3 back). Each leg and knee has extra `fold`: its
#           local quaternion [x, y, z, w] (three.js axes) in the overdrive pose.
#   cannon  the beam cannon's base, pitched about x; `muzzle` at its tip, the beam leaves along +z
#   skim    the overdrive's thrusters (shown, and grown, only when skimming)
#   seat    where the runner sits (hidden)
# Slots (the palette is per proposal, src/spidertank.js): armor (the plates), trim (a second livery colour), frame (the dark
# structure), steel (joints), metal (pistons), and lit: core (the antimatter glow), visor (the cockpit's slits), thrust (skimmer jets).
# Root extras: hipY (hip height), span (hip to foot along the ground), radius.
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

# preview colours only (proposal A's): the game swaps in its own materials
SLOT_COLORS = {
    "armor": (0.95, 0.92, 0.87), "trim": (0.48, 0.18, 0.97), "frame": (0.13, 0.11, 0.2), "steel": (0.33, 0.38, 0.48),
    "metal": (0.54, 0.53, 0.63), "core": (0.78, 0.49, 1.0), "visor": (0.6, 0.9, 1.0), "thrust": (0.78, 0.49, 1.0),
}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)

UP = Vector((0, 1, 0))


def V(*a):
    return Vector(a)


def frame(u, o):
    """a bone's frame: columns side, out (the armour's side), along (u); out made square to along"""
    u = Vector(u).normalized()
    o = (Vector(o) - u * Vector(o).dot(u)).normalized()
    return Matrix((u.cross(o) * -1, o, u)).transposed()      # (columns: side = o x u, out, along)


def put(geo, m, t=(0, 0, 0)):
    """geo (built along +z, out = +y) turned by the 3x3 m and moved to t"""
    v, f = geo[0], geo[1]
    t = Vector(t)
    return [tuple(m @ Vector(p) + t) for p in v], f


def slab(z0, z1, w0, w1, t, b, yc=0.0, e=4.0, n=16, steps=4, wmid=None):
    """a lofted bar along z: half-width w0 -> w1 (bulging to wmid in the middle), t above and b below yc; e: squareness"""
    secs = []
    for k in range(steps + 1):
        f = k / steps
        w = w0 + (w1 - w0) * f
        if wmid:
            w += (wmid - (w0 + w1) / 2) * math.sin(math.pi * f)
        secs.append(dict(z=z0 + (z1 - z0) * f, w=w, t=t, b=b, yc=yc, eT=e, eB=e))
    return loft(secs, n)


def drum(r, w, seg=14):
    """a joint drum: a cylinder across the bone (axis x), chamfered"""
    return xf(lathe([(0, -w / 2), (r * 0.82, -w / 2), (r, -w / 2 + r * 0.18), (r, w / 2 - r * 0.18), (r * 0.82, w / 2), (0, w / 2)], seg), r=(0, 0, math.pi / 2))


def plate_geo(L, p0, p1, pw, pt, yc, tip=0.55, root=0.75, e=2.2, n=16):
    """an armour plate along a bone: from p0 to p1 of its length, its widest pw at a third, curved (e), pt thick, on the out side"""
    secs = []
    for f, wk in ((0.0, root), (0.33, 1.0), (0.7, 0.92), (1.0, tip)):
        secs.append(dict(z=L * (p0 + (p1 - p0) * f), w=pw * wk, t=pt, b=pt * 0.35, yc=yc, eT=e, eB=5.0))
    return loft(secs, n)


def bone(name, parent, a, b, out, spec, last=False):
    """a leg bone from a to b (in the parent joint's frame, a its origin), built along it, armour on the `out` side"""
    L = (Vector(b) - Vector(a)).length
    m = frame(Vector(b) - Vector(a), out)
    s = spec
    mesh(name + "_frame", put(slab(0.0, L, s["sw0"], s["sw1"], s["st"], s["st"], wmid=s.get("swm")), m, a), "frame", parent, 0.03)
    mesh(name + "_drum", put(drum(s["dr"], s["dw"]), m, a), "steel", parent, 0.03)
    if s.get("pw"):
        mesh(name + "_plate", put(plate_geo(L, s.get("p0", 0.1), s.get("p1", 0.92), s["pw"], s["pt"], s["st"] * 0.7, s.get("tip", 0.55), s.get("root", 0.75)), m, a),
             "armor", parent, 0.04)
        if s.get("stripe"):                                         # (a trim stripe down the plate's crown, flush: 4 mm proud)
            mesh(name + "_stripe", put(plate_geo(L, s.get("p0", 0.1) + 0.12, s.get("p1", 0.92) - 0.12, s["pw"] * 0.18, s["pt"] + 0.004, s["st"] * 0.7, 0.8, 0.8), m, a),
                 "trim", parent, 0)
    if s.get("piston"):                                             # (a ram under the bone: barrel and rod)
        y = -s["st"] - 0.06
        mesh(name + "_ram", put(join([xf(cylinder(0.075, 0.075, L * 0.42, 8)[:2], (0, y, L * 0.33), (math.pi / 2, 0, 0)),
                                      xf(cylinder(0.04, 0.04, L * 0.4, 6)[:2], (0, y, L * 0.66), (math.pi / 2, 0, 0))]), m, a), "metal", parent, 0.015)
    if last:
        mesh(name + "_claw", put(lathe([(0, 0), (s["sw1"] * 1.1, 0.06), (s["sw1"] * 1.3, 0.3), (s["sw1"] * 0.9, 0.55), (0, 0.62)], 10), m @ Matrix.Rotation(math.pi / 2, 3, "X"),
                                     Vector(a) + (Vector(b) - Vector(a)) * (1 - 0.62 / L)), "steel", parent, 0.02)     # (its tip on the contact)
    return L


def quat3(m):
    q = m.to_quaternion()
    return [q.x, q.y, q.z, q.w]


def leg(root, name, hip, pts, outs, folds, specs, side, n):
    """a leg: joints pts (hip first, foot last, in the root's frame), the armour side of each bone (outs), its overdrive pose (folds:
    each bone's direction and armour side), the bones' specs. Joints are pivots `leg` and `knee`, the contact `foot`."""
    P = [Vector(p) for p in pts]
    joints = [pivot(name, tuple(P[0]), root, role="leg", side=side, n=n)]
    for i in range(1, len(P) - 1):
        joints.append(pivot(f"{name}_knee{i}", tuple(P[i] - P[i - 1]), joints[-1], role="knee"))
    for i in range(len(P) - 1):
        bone(f"{name}_b{i}", joints[i], (0, 0, 0), tuple(P[i + 1] - P[i]), outs[i], specs[i], last=i == len(P) - 2)
    pivot(f"{name}_foot", tuple(P[-1] - P[-2]), joints[-1], role="foot")
    # the fold: each bone turned from its rest frame to its folded one (its armour side given, or carried round by the hinge: the
    # least turn from its rest direction); a joint's local turn is its bone's after its parent's
    def hinge(i, u):
        return (P[i + 1] - P[i]).normalized().rotation_difference(Vector(u).normalized()) @ Vector(outs[i])
    R = [frame(f[0], f[1] if f[1] is not None else hinge(i, f[0])) @ frame(P[i + 1] - P[i], outs[i]).transposed() for i, f in enumerate(folds)]
    for i, j in enumerate(joints):
        j["fold"] = quat3(R[i] if i == 0 else R[i - 1].transposed() @ R[i])
    return joints


def legs8(root, pfx, hips, design):
    """eight legs: hips [(x, y, z) for the right side, front to back], design(sx, n, hip) -> (pts, outs, folds, specs)"""
    for n, h in enumerate(hips):
        for sx in (-1, 1):
            hip = Vector((sx * h[0], h[1], h[2]))
            pts, outs, folds, specs = design(sx, n, hip)
            leg(root, f"{pfx}_leg{'L' if sx < 0 else 'R'}{n}", hip, pts, outs, folds, specs, sx, n)


def tris(objs):
    return sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)


def under(root):
    out = []
    for o in C.objects:
        q = o
        while q.parent:
            q = q.parent
        if q == root:
            out.append(o)
    return out


# ================= A: ARACHNE =================
def build_a():
    R = pivot("spider_a", (0, 0, 0), None, proposal="a", title="ARACHNE")
    HY = 3.1                                                          # hip height
    # the cephalothorax: a domed shell, flat underneath, its brow ahead; a hip ring round its waist where the legs bolt on
    shell = [dict(z=-1.95, w=1.35, t=0.55, b=0.55), dict(z=-1.2, w=1.85, t=0.85, b=0.7), dict(z=0.2, w=2.0, t=0.95, b=0.72),
             dict(z=1.35, w=1.7, t=0.8, b=0.66), dict(z=2.1, w=1.05, t=0.5, b=0.5)]
    mesh("a_shell", loft([{**s, "yc": HY + 0.2, "eT": 2.4, "eB": 3.6} for s in shell], 28), "armor", R, 0.07)
    mesh("a_ring", slab(-1.75, 1.75, 1.95, 1.95, 0.2, 0.22, yc=HY - 0.02, e=3.0, n=28, steps=6, wmid=2.22), "frame", R, 0.05)
    mesh("a_belly", loft([dict(z=-1.7, w=1.3, t=0.1, b=0.35, yc=HY - 0.45), dict(z=0, w=1.75, t=0.1, b=0.5, yc=HY - 0.45),
                          dict(z=1.6, w=1.25, t=0.1, b=0.3, yc=HY - 0.45)], 20), "frame", R, 0.04)
    # a trim band round the shell's crown and the brow's armoured visor plate with two rows of slits
    mesh("a_crest", loft([dict(z=s["z"], w=0.17, t=s["t"] + 0.004, b=-(s["t"] - 0.07), yc=HY + 0.2, eT=2.4, eB=2.4) for s in shell[1:4]], 12), "trim", R, 0)
    brow = [dict(z=1.55, w=0.95, t=0.55, b=0.42), dict(z=2.35, w=0.88, t=0.45, b=0.4), dict(z=2.75, w=0.62, t=0.3, b=0.3)]
    mesh("a_brow", loft([{**s, "yc": HY + 0.45, "eT": 3.0, "eB": 3.0} for s in brow], 24), "armor", R, 0.05)
    for k, (y, w) in enumerate(((HY + 0.55, 0.62), (HY + 0.32, 0.48))):
        mesh(f"a_slit{k}", xf(cuboid(w * 2, 0.07, 0.12)[:2], (0, y, 2.69 - 0.12 * k), (-0.35, 0, 0)), "visor", R, 0.012)
    # the reactor: a ribbed abdomen, its armoured bands round a glowing antimatter core, on a steel waist
    mesh("a_waist", xf(lathe([(0.55, 0), (0.62, 0.3), (0.62, 0.7), (0.5, 1.0)], 14), (0, HY + 0.15, -1.75), (-math.pi / 2, 0, 0)), "steel", R, 0.04)
    AZ, AY, AR = -3.45, HY + 0.4, 1.6
    mesh("a_core", xf(superquad(AR * 0.86, AR * 0.78, AR * 1.05, 1, 1, 20, 12), (0, AY, AZ)), "core", R, 0)
    for k, (z0, z1) in enumerate(((-0.95, -0.55), (-0.45, -0.05), (0.05, 0.45), (0.55, 0.9))):
        prof = []
        for f in (0, 0.5, 1):
            z = z0 + (z1 - z0) * f
            r = AR * math.sqrt(max(0.02, 1 - z * z)) + 0.04 * math.sin(math.pi * f)
            prof.append((r, z * AR * 1.1))
        mesh(f"a_band{k}", xf(lathe([(0, prof[0][1] + 0.01)] + prof + [(0, prof[-1][1] - 0.01)], 24), (0, AY, AZ), (-math.pi / 2, 0, 0)), "armor", R, 0.05)
    mesh("a_tailcap", xf(lathe([(0, 0), (0.55, 0.0), (0.42, 0.25), (0, 0.32)], 14), (0, AY, AZ - AR * 1.08), (-math.pi / 2, math.pi, 0)), "frame", R, 0.03)
    # the cannon, slung under the brow like a fang: breech, barrel, focusing rings and the emitter; fed from the reactor by a conduit
    cz = 1.7
    gun = pivot("a_cannon", (0, HY - 0.75, cz), R, role="cannon")
    mesh("a_breech", xf(lathe([(0, -0.6), (0.38, -0.6), (0.46, -0.3), (0.46, 0.35), (0.3, 0.55), (0, 0.55)], 16), r=(math.pi / 2, 0, 0)), "frame", gun, 0.03)
    mesh("a_barrel", xf(lathe([(0.2, 0.5), (0.18, 2.3), (0.24, 2.4), (0.24, 2.55), (0.17, 2.6)], 14), r=(math.pi / 2, 0, 0)), "steel", gun, 0.025)
    mesh("a_rings", join([xf(lathe([(0.24, -0.06), (0.31, -0.03), (0.31, 0.03), (0.24, 0.06)], 14), (0, 0, z), (math.pi / 2, 0, 0)) for z in (1.0, 1.45, 1.9)]), "trim", gun, 0.015)
    mesh("a_emitter", xf(lathe([(0, 2.5), (0.15, 2.52), (0.12, 2.66), (0, 2.68)], 12), r=(math.pi / 2, 0, 0)), "core", gun, 0)
    pivot("a_muzzle", (0, 0, 2.7), gun, role="muzzle")
    mesh("a_conduit", tube([(0, HY - 0.45, -1.9), (0, HY - 0.62, -0.6), (0, HY - 0.72, 0.9), (0, HY - 0.75, 1.15)], [0.13, 0.13, 0.13, 0.13], 8), "core", R, 0)
    mesh("a_conduitjacket", join([xf(lathe([(0.17, -0.05), (0.19, 0), (0.17, 0.05)], 10), (0, HY - 0.5 - 0.06 * k, -1.5 + 0.7 * k), (math.pi / 2 - 0.05, 0, 0)) for k in range(4)]), "steel", R, 0.012)
    # the overdrive's thrusters: four jets under the hull and two behind the reactor
    sk = pivot("a_skim", (0, 0, 0), R, role="skim")
    for k, (x, z) in enumerate(((-1.0, 0.9), (1.0, 0.9), (-1.0, -0.9), (1.0, -0.9))):
        mesh(f"a_jet{k}", xf(lathe([(0, 0), (0.42, 0.0), (0.3, -0.12), (0, -0.14)], 14), (x, HY - 0.86, z)), "thrust", sk, 0)
    pivot("a_seat", (0, HY + 0.35, 0.9), R, role="seat")

    # legs: from the ring, splayed (front ones reaching ahead), thigh up to a high knee, shin down, a long foot spike to the ground
    def design(sx, n, hip):
        yaw = math.radians((38, 13, -13, -38)[n])
        d = Vector((sx * math.cos(yaw), 0, math.sin(yaw)))
        k1 = hip + d * 1.55 + UP * 1.65
        k2 = k1 + d * 2.05 - UP * 1.35
        ft = k2 + d * 0.85 + UP * -k2.y
        pts = [hip, k1, k2, ft]
        side = d.cross(UP)                                            # (across the leg's plane)
        outs = [UP + d * 0.6, d + UP * 0.3, d]                        # (armour up and out on the thigh, out on the shin and foot)
        # folded, on its own hinges: the thigh down and out (its plate turns outward: the saucer's rim), the shin curled in under the
        # belly (its plate underneath), the long foot trailing back under the reactor
        a0 = math.radians(36 + 4 * (n in (0, 3)))
        u0 = d * math.cos(a0) - UP * math.sin(a0)
        u1 = -d * math.cos(0.18) - UP * math.sin(0.18)
        u2 = Vector((sx * (0.05 + 0.03 * n), -0.06, -1.0)).normalized()
        folds = [(u0, None), (u1, None), (u2, None)]
        specs = [dict(sw0=0.24, sw1=0.2, swm=0.27, st=0.2, dr=0.36, dw=0.62, pw=0.48, pt=0.11, stripe=True, piston=True),
                 dict(sw0=0.2, sw1=0.14, st=0.17, dr=0.3, dw=0.52, pw=0.36, pt=0.09, tip=0.4, piston=True),
                 dict(sw0=0.13, sw1=0.06, st=0.11, dr=0.22, dw=0.4, pw=0.2, pt=0.06, p0=0.08, p1=0.6, tip=0.3)]
        return pts, outs, folds, specs

    legs8(R, "a", [(1.78, HY, 1.35), (2.08, HY, 0.47), (2.08, HY, -0.47), (1.78, HY, -1.35)], design)
    R["hipY"], R["radius"] = HY, 6.5
    return R


# ================= B: STRIDER =================
def build_b():
    R = pivot("spider_b", (0, 0, 0), None, proposal="b", title="STRIDER")
    HY = 2.75
    # the hull: a long faceted wedge, nose low, the flank rails the legs bolt to, a raised spine for the cannon
    hull = [dict(z=-3.4, w=0.95, t=0.62, b=0.5), dict(z=-2.4, w=1.4, t=0.95, b=0.7), dict(z=-0.4, w=1.62, t=1.05, b=0.78),
            dict(z=1.6, w=1.48, t=0.86, b=0.72), dict(z=3.0, w=0.82, t=0.46, b=0.52), dict(z=3.55, w=0.42, t=0.22, b=0.36)]
    mesh("b_hull", loft([{**s, "yc": HY + 0.25 - (0.12 if s["z"] > 2 else 0), "eT": 3.2, "eB": 4.5} for s in hull], 24), "armor", R, 0.07)
    mesh("b_chine", loft([dict(z=-3.1, w=1.12, t=0.1, b=0.12, yc=HY + 0.1, eT=5, eB=5), dict(z=-0.4, w=1.78, t=0.1, b=0.12, yc=HY + 0.1, eT=5, eB=5),
                          dict(z=2.6, w=1.25, t=0.1, b=0.12, yc=HY + 0.05, eT=5, eB=5), dict(z=3.45, w=0.6, t=0.08, b=0.1, yc=HY, eT=5, eB=5)], 24), "trim", R, 0.03)
    for sx in (-1, 1):
        mesh(f"b_rail{sx}", xf(cuboid(0.34, 0.5, 5.2)[:2], (sx * 1.62, HY - 0.05, -0.15)), "frame", R, 0.04)
    mesh("b_keel", slab(-3.0, 3.0, 0.7, 0.5, 0.15, 0.3, yc=HY - 0.68, e=4, n=16, steps=4, wmid=0.95), "frame", R, 0.04)
    # the cockpit: a wraparound visor band in an armoured cowl at the nose
    cowl = [dict(z=1.45, w=1.05, t=0.58, b=0.1), dict(z=2.5, w=0.88, t=0.42, b=0.1), dict(z=3.05, w=0.5, t=0.18, b=0.1)]
    mesh("b_cowl", loft([{**s, "yc": HY + 0.95, "eT": 3.2, "eB": 4} for s in cowl], 20), "armor", R, 0.05)
    mesh("b_visor", loft([dict(z=1.9, w=0.97, t=0.13, b=0.06, yc=HY + 1.17, eT=3.2, eB=4), dict(z=2.75, w=0.66, t=0.1, b=0.05, yc=HY + 1.05, eT=3.2, eB=4)], 20), "visor", R, 0.015)
    # the reactor at the tail: a glowing core in an upright containment ring on two struts, with cooling fins
    RZ, RY = -3.0, HY + 1.25
    mesh("b_core", xf(superquad(0.62, 0.62, 0.62, 1, 1, 16, 10), (0, RY, RZ)), "core", R, 0)
    mesh("b_ring", xf(torus(1.0, 0.16, 28, 8), (0, RY, RZ), (0, 0, math.pi / 2)), "steel", R, 0.04)
    mesh("b_ring2", xf(torus(0.82, 0.07, 28, 6), (0, RY, RZ), (math.pi / 2, 0, 0)), "trim", R, 0.02)
    mesh("b_strut", join([B((sx * 0.55, HY + 0.6, RZ + 0.25), (sx * 0.7, RY - 0.7, RZ), 0.11, 6, True) for sx in (-1, 1)]), "frame", R, 0.03)
    mesh("b_fins", join([xf(cuboid(0.06, 0.55, 1.2)[:2], (sx * 0.35 * k, HY + 0.85, RZ + 0.6)) for sx in (-1, 1) for k in (1, 2)]), "frame", R, 0.02)
    # the cannon: a rail down the spine, twin rails over glowing coils, an emitter at the nose
    gun = pivot("b_cannon", (0, HY + 1.45, -1.2), R, role="cannon")      # (riding over the cockpit's cowl)
    mesh("b_mount", xf(cuboid(0.9, 0.85, 1.4)[:2], (0, -0.3, 0.2)), "frame", gun, 0.03)
    mesh("b_pylon", xf(cuboid(0.3, 0.42, 0.5)[:2], (0, 0.05, 3.1)), "frame", gun, 0.02)
    mesh("b_rails", join([xf(cuboid(0.14, 0.22, 4.6)[:2], (sx * 0.2, 0.28, 2.3)) for sx in (-1, 1)]), "steel", gun, 0.025)
    mesh("b_coils", join([xf(torus(0.2, 0.06, 12, 6), (0, 0.28, z), (math.pi / 2, 0, 0)) for z in (1.0, 1.7, 2.4, 3.1, 3.8)]), "core", gun, 0)
    mesh("b_yoke", join([xf(cuboid(0.62, 0.12, 0.16)[:2], (0, 0.44, z)) for z in (1.35, 2.75)]), "trim", gun, 0.012)
    mesh("b_emitter", xf(lathe([(0, 4.5), (0.2, 4.55), (0.16, 4.75), (0, 4.8)], 12), (0, 0.28, 0), (math.pi / 2, 0, 0)), "core", gun, 0)
    pivot("b_muzzle", (0, 0.28, 4.85), gun, role="muzzle")
    sk = pivot("b_skim", (0, 0, 0), R, role="skim")
    for k, z in enumerate((2.0, 0.0, -2.0)):
        mesh(f"b_jet{k}", xf(cuboid(1.1, 0.06, 0.7)[:2], (0, HY - 1.0, z)), "thrust", sk, 0)
    mesh("b_tailjets", join([xf(lathe([(0, 0), (0.3, 0), (0.22, -0.1), (0, -0.12)], 12), (sx * 0.45, HY + 0.1, -3.45), (math.pi / 2, 0, 0)) for sx in (-1, 1)]), "thrust", sk, 0)
    pivot("b_seat", (0, HY + 0.7, 2.0), R, role="seat")

    # legs: in a row down each flank, near sideways; a tall thigh, a long shin, a short foot (harvestman proportions)
    def design(sx, n, hip):
        yaw = math.radians((28, 9, -9, -28)[n])
        d = Vector((sx * math.cos(yaw), 0, math.sin(yaw)))
        k1 = hip + d * 1.5 + UP * 2.1
        k2 = k1 + d * 2.3 - UP * 2.25
        ft = k2 + d * 0.5 + UP * -k2.y
        pts = [hip, k1, k2, ft]
        outs = [UP * 0.4 + d, d + UP * 0.2, d]
        # folded: the thigh back along the flank (each a little further out and lower than the one ahead: shingles), its plate outward;
        # the shin forward under it; the foot back and down, a skid
        side = Vector((sx, 0, 0))
        u0 = Vector((sx * (0.16 + 0.05 * n), -0.05 - 0.02 * n, -1)).normalized()
        u1 = Vector((sx * 0.06, -0.24, 1)).normalized()
        u2 = Vector((sx * -0.05, -0.32, -1)).normalized()
        folds = [(u0, side + UP * 0.15), (u1, side), (u2, side - UP * 0.3)]
        specs = [dict(sw0=0.22, sw1=0.19, swm=0.25, st=0.19, dr=0.34, dw=0.56, pw=0.44, pt=0.1, stripe=True, piston=True, tip=0.45),
                 dict(sw0=0.18, sw1=0.13, st=0.15, dr=0.28, dw=0.48, pw=0.3, pt=0.08, tip=0.45, piston=True),
                 dict(sw0=0.14, sw1=0.1, st=0.12, dr=0.22, dw=0.4)]
        return pts, outs, folds, specs

    legs8(R, "b", [(1.72, HY, 2.0), (1.72, HY, 0.68), (1.72, HY, -0.68), (1.72, HY, -2.0)], design)
    R["hipY"], R["radius"] = HY, 6.0
    return R


roots = [build_a(), build_b()]
bpy.context.view_layer.update()
for r in roots:
    sp = []
    for o in C.objects:
        if o.get("role") == "foot":
            q = o
            while q.parent:
                q = q.parent
            if q == r:
                hip = o.parent
                while hip.get("role") != "leg":
                    hip = hip.parent
                f, h = o.matrix_world.translation, hip.matrix_world.translation
                sp.append(math.hypot(f.x - h.x, f.y - h.y))
    r["span"] = sum(sp) / len(sp)
    print(f"{r.name}: {tris(under(r))} triangles, span {r['span']:.2f} m")
audit_coplanar([o for o in C.objects])
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
