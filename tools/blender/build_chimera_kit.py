# The chimera kit for Blender (4.2+ / 5.x) -> src/assets/chimera.glb: the pieces src/chimerabuild.js puts chimeras together from.
# Round three: parts meet flush (no collars: each joint gives its size and the builder fuses the two parts with a bridge of hide that
# shades from one parent's colour into the other's), every part carries attachment points (graft points) for the mutations, and each
# mutation comes in the form of the family it grows on. Human parts are not here: the builder cuts them out of the game's own NPCs
# (models.js figureSpec), so a chimera's human parts are the settlers, pirates, void-touched and Vrill you can scoop up.
#
# In Blender's Python console:   exec(open(r"<repo>/tools/blender/build_chimera_kit.py").read())
# or headless, with bpy:         MOONRUNNER_REPO=<repo> python3 tools/blender/build_chimera_kit.py
#
# Families: mite, car, sapling (this kit) and human (person, pirate, voidling, alien: the figures). Junkbot is still to come.
#
# THE CONTRACT (three.js axes, metres, a chimera faces +z; about 1.2 m tall before the game's size scale):
#   ck_legs_<kind>_<alt>   stands on y = 0. Empty `<root>_hip` (role socket): where the body sits, extras jrx / jrz = the joint's half
#                    width and depth there. Pivots role `leg` (swung about x by the walk) and `wheel` (spun about x, extra `r`).
#   ck_body_<kind>_<alt>   its origin IS the legs' hip socket; extras jrx / jrz = its joint there. Sockets `<root>_neck` (jrx / jrz; a second
#                    head shares it, 0.3 m apart, leaning out) and `<root>_back`.
#   ck_head_<kind>_<alt>   its origin IS the neck socket (extras jrx / jrz); it stands above it facing +z. Sockets `<root>_top` and `<root>_eye`.
#   graft points     empties (role graft) on every part, under the pivot they move with: extras tag (side, top, low, front, back), size, and
#                    nx / ny / nz, the outward normal a mutation piece stands along.
#   ck_mut_<mutation>_<family>  a mutation in the form of the family it grows on (armor, spark, radio, lens, turbo); ck_mut_crystal_<n> and
#                    ck_mut_mud_<n> grow on anything; ck_mut_void_mote floats round a void-touched chimera. Each stands on y = 0 along +y, its foot sunk 2 cm.
#   ck_crown         the Triple Crown, a glowing laurel halo, on a head's top socket.
# Slots: the hides are named after the family (`mite`, `car`, `sapling`): the builder colours them per part, shading into the neighbours' colours near the joints. Fixed: dark, steel, metal, chrome,
# tire, white, bark, stonebark, moss, leaf, petal, blossom, cap, gold, mud; lit: glass, eye, lamp, red, splice, crystal, spark, voidglow.
import math, os, random

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", ".."))
COLL = "ChimeraKit"


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "mite": "b8e986", "car": "ff7ad9", "sapling": "8fd16a",
    "dark": "2a2540", "steel": "55607a", "metal": "8a87a0", "chrome": "d8d4e8", "tire": "1d1a29", "white": "f3eee4", "bark": "7a5236",
    "stonebark": "8c8798", "moss": "3f7a34", "leaf": "5fbf4a", "petal": "ff7ad9", "blossom": "ffc2e2", "cap": "ff3b5c", "gold": "ffd23f", "mud": "6b4a2a",
    "glass": "9be7ff", "eye": "ff2e88", "lamp": "fff6a8", "red": "ff2a4a", "splice": "7dff3a", "crystal": "2ee6ff", "spark": "ffb347", "voidglow": "a86bff",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
from mathutils import Vector, Quaternion   # (bpy's, so after kit.py has imported bpy)
C = coll()

E, SEG = 0.32, 8                        # superquad roundness (lower = more faceted) and segments round
W, L, T, HS, INK = 0.85, 1.35, 1.05, 0.85, 0.025   # widths, leg length, torso, head size; the main volumes' outline
ALTS = (0, 1, 2)


# ---------------- shapes ----------------
def box(w, h, d, t=(0, 0, 0), r=(0, 0, 0)):
    return xf(cuboid(w, h, d)[:2], t, r)


def soft(w, h, d, t=(0, 0, 0), r=(0, 0, 0), e=None):
    """a chamfered block w x h x d"""
    return xf(superquad(w / 2, h / 2, d / 2, E if e is None else e, E if e is None else e, SEG, 6), t, r)


def ell(rx, ry, rz, t=(0, 0, 0), r=(0, 0, 0), n=None):
    n = n or (10 if max(rx, ry, rz) >= 0.08 else 8)
    return xf(superquad(rx, ry, rz, 1, 1, n, n // 2 + 1), t, r)


def limb(path, radii, seg=6, caps=(True, True)):
    """a tube through the points with a round cap at each end (leave out a cap that sits inside another part)"""
    g = [tube(path, radii, seg, cap=False)]
    for on, p, rr in ((caps[0], path[0], radii[0]), (caps[1], path[-1], radii[-1])):
        if on:
            g.append(xf(superquad(rr, rr, rr, 1, 1, seg, seg // 2 + 1), p))
    return join(g)


def turn_to(d, up=Vector((0, 1, 0))):
    """the rotation taking local +z to direction d (local +y kept as near `up` as it goes)"""
    d = Vector(d).normalized()
    return d.to_track_quat("Z", "Y" if abs(d.dot(up)) < 0.98 else "X")


def ell_between(a, b, rw, rt, roll=0.0, n=10):
    """a flat ellipsoid from a to b: rw across, rt thick (thick along the side nearest up)"""
    a, b = Vector(a), Vector(b)
    g = superquad(rw, rt, (b - a).length / 2, 1, 1, n, n // 2 + 1)
    m = (turn_to(b - a) @ Quaternion((0, 0, 1), roll)).to_matrix()
    mid = (a + b) / 2
    return [tuple(m @ Vector(v) + mid) for v in g[0]], g[1]


def cone_between(a, b, r, seg=6):
    """a cone from a base of radius r at a to its point at b"""
    a, b = Vector(a), Vector(b)
    g = lathe([(0, 0), (r, 0), (0, 1)], seg)
    m = (turn_to(b - a) @ Quaternion((1, 0, 0), math.pi / 2)).to_matrix()   # (the lathe's +y onto +z, then to the direction)
    ln = (b - a).length
    return [tuple(m @ Vector((v[0], v[1] * ln, v[2])) + a) for v in g[0]], g[1]


def octa(r, h, t=(0, 0, 0), d=(0, 1, 0)):
    """a long crystal: an octahedron r wide and h tall standing on t along d"""
    g = xf(superquad(r, h / 2, r, 1.8, 1.8, 4, 2), (0, h / 2, 0))
    m = Vector(d).normalized().to_track_quat("Y", "Z").to_matrix()
    return [tuple(m @ Vector(v) + Vector(t)) for v in g[0]], g[1]


def socket(root, name, pos, **props):
    return pivot(f"{root.name}_{name}", pos, root, role="socket", socket=name, **props)


def graft(parent, name, pos, normal, tag, size=1.0):
    """a graft point: where another parent's trait (or a mutation) can grow, along `normal`"""
    n = Vector(normal).normalized()
    return pivot(f"{parent.name}_g{name}", pos, parent, role="graft", tag=tag, size=size, nx=n.x, ny=n.y, nz=n.z)


def joint(root, rx, rz):
    root["jrx"], root["jrz"] = rx, rz


# =====================================================================================================
# LEGS (stand on the ground; the hip socket on top)
# =====================================================================================================
def legs_mite(root, alt):
    hip = 0.42 * L
    mesh(root.name + "_thorax", ell(0.2 * W, 0.12, 0.24, (0, hip - 0.07, 0)), "dark", root, INK)
    thick = 1.35 if alt == 2 else 1.0
    for sx in (-1, 1):
        for k in (-1, 0, 1):
            p = pivot(f"{root.name}_leg{'L' if sx < 0 else 'R'}{k + 1}", (sx * 0.13 * W, hip - 0.09, k * 0.13), root, role="leg")
            knee = (sx * 0.3 * W, 0.14 * L, k * 0.07)
            foot = (sx * 0.42 * W, -(hip - 0.09) + 0.03, k * 0.15)
            mesh(p.name + "_seg", limb([(0, 0, 0), knee, foot], [0.04 * W * thick, 0.034 * W * thick, 0.022 * W * thick], caps=(False, True)), "mite", p, INK * 0.6)
            mesh(p.name + "_claw", ell(0.03, 0.03, 0.03, foot), "dark", p, 0.006)
            if alt == 1:                                                        # a spur on each knee and one on the shin
                mid = tuple((a + b) / 2 for a, b in zip(knee, foot))
                mesh(p.name + "_spur", join([cone_between(knee, (knee[0] + sx * 0.04, knee[1] + 0.09, knee[2] - 0.03), 0.022),
                                              cone_between(mid, (mid[0] + sx * 0.06, mid[1] + 0.03, mid[2]), 0.014)]), "dark", p, 0.006)
            elif alt == 2:                                                      # armoured: a dark ring at the knee
                mesh(p.name + "_ring", ell(0.05 * W, 0.05 * W, 0.05 * W, knee), "dark", p, 0.008)
            if k == 0:
                graft(p, "knee", (knee[0], knee[1] + 0.03 * thick, knee[2]), (sx * 0.3, 1, 0), "low", 0.6)
    if alt == 1:
        mesh(root.name + "_hair", join([cone_between((sx * 0.1, hip - 0.04, z), (sx * 0.16, hip + 0.02, z - 0.04), 0.016) for sx in (-1, 1) for z in (-0.12, 0.0, 0.12)]), "mite", root, 0.006)
    for sx in (-1, 1):
        graft(root, f"side{sx}", (sx * 0.165, hip - 0.07, -0.06), (sx, 0.2, -0.1), "side", 0.8)
    graft(root, "rear", (0, hip - 0.06, -0.235), (0, 0.2, -1), "back", 0.7)
    socket(root, "hip", (0, hip, 0), jrx=0.13, jrz=0.16)


def legs_car(root, alt):
    # a real lower car: a hull over the axles, a fender over each wheel, lights and bumpers
    r = (0.16, 0.2, 0.145)[alt]                                                 # wheel radius: road car, off-roader, low racer
    tw = (0.065, 0.09, 0.05)[alt]
    hullH = (0.17, 0.2, 0.13)[alt]
    yc = r + 0.06 + hullH / 2 - (0.03 if alt == 2 else 0)
    top = yc + hullH / 2
    tx, tz = 0.36, 0.34
    mesh(root.name + "_hull", soft(0.6, hullH, 0.98, (0, yc, 0)), "car", root, INK)
    fend = []
    for sx in (-1, 1):
        for z in (-tz, tz):
            if alt == 1:                                                        # square off-road arches
                fend.append(box(0.17, 0.07, r * 2.3, (sx * tx, r * 1.85 + 0.035, z)))
            else:
                fend.append(soft(0.15, 0.08, r * 2.4, (sx * (tx - 0.01), r * 1.75 + 0.02, z)))
    mesh(root.name + "_fenders", join(fend), "car", root, INK * 0.8)
    mesh(root.name + "_bumpers", join([soft(0.62, 0.06, 0.07, (0, r + 0.04, 0.5 * s)) for s in (-1, 1)]), "chrome" if alt == 1 else "metal", root, 0.01)
    mesh(root.name + "_lamps", join([ell(0.04, 0.03, 0.02, (sx * 0.2, yc + 0.02, 0.495)) for sx in (-1, 1)]), "lamp", root, 0.006)
    mesh(root.name + "_tails", join([box(0.09, 0.025, 0.01, (sx * 0.22, yc + 0.03, -0.493)) for sx in (-1, 1)]), "red", root, 0)
    if alt != 2:                                                                # (the racer has its roundels instead)
        mesh(root.name + "_skirt", join([box(0.006, 0.025, 0.5, (sx * 0.3, yc - 0.02, 0)) for sx in (-1, 1)]), "white", root, 0)
    if alt == 1:                                                                # a bull bar and mud flaps
        mesh(root.name + "_bullbar", join([limb([(sx * 0.22, r + 0.02, 0.53), (sx * 0.22, top + 0.03, 0.56), (-sx * 0.22, top + 0.03, 0.56)], [0.018, 0.018, 0.018], 6) for sx in (-1, 1)]), "chrome", root, 0.008)
        mesh(root.name + "_flaps", join([box(0.12, 0.12, 0.012, (sx * tx, r * 0.8, -tz - r * 1.1)) for sx in (-1, 1)]), "dark", root, 0.006)
    elif alt == 2:                                                              # a splitter, side pipes with hot tips, a roundel
        mesh(root.name + "_splitter", box(0.64, 0.02, 0.1, (0, r - 0.005, 0.52)), "dark", root, 0.008)
        for sx in (-1, 1):
            mesh(f"{root.name}_pipe{sx}", xf(cylinder(0.025, 0.03, 0.5, 8)[:2], (sx * 0.31, r + 0.01, -0.05), (math.pi / 2, 0, 0)), "metal", root, 0.008)
            mesh(f"{root.name}_tip{sx}", ell(0.02, 0.02, 0.008, (sx * 0.31, r + 0.01, -0.302)), "spark", root, 0)
            mesh(f"{root.name}_roundel{sx}", xf(cylinder(0.06, 0.06, 0.006, 12)[:2], (sx * 0.301, yc, 0.0), (0, 0, math.pi / 2)), "white", root, 0)
    for sx in (-1, 1):
        for z in (-tz, tz):
            p = pivot(f"{root.name}_wheel{'L' if sx < 0 else 'R'}{'F' if z > 0 else 'B'}", (sx * (tx + 0.02), r, z), root, role="wheel", r=r)
            tire = lathe([(r * 0.55, -tw), (r * 0.92, -tw), (r, -tw * 0.5), (r, tw * 0.5), (r * 0.92, tw), (r * 0.55, tw)], 16)
            mesh(p.name + "_tire", xf(tire, r=(0, 0, math.pi / 2)), "tire", p, INK * 0.8)
            mesh(p.name + "_hub", xf(lathe([(0, -tw * 0.9), (r * 0.58, -tw * 0.9), (r * 0.58, tw * 0.9), (0, tw * 1.05)], 10), r=(0, 0, math.pi / 2)), "chrome" if alt == 2 else "metal", p, 0.008)
        graft(root, f"side{sx}", (sx * 0.3, yc + 0.01, 0.0), (sx, 0.15, 0), "side", 0.9)
        for z in (-tz, tz):
            graft(root, f"fender{sx}{'F' if z > 0 else 'B'}", (sx * (tx - 0.01), r * 1.75 + 0.06, z), (sx * 0.3, 1, 0), "top", 0.6)
    graft(root, "nose", (0, yc, 0.49), (0, 0.2, 1), "front", 0.8)
    graft(root, "tail", (0, yc, -0.49), (0, 0.2, -1), "back", 0.8)
    graft(root, "low", (0.0, r + 0.0, 0.0), (0, -1, 0), "low", 0.7)
    socket(root, "hip", (0, top, 0), jrx=0.17, jrz=0.2)


def legs_sapling(root, alt):
    # gnarled roots: none alike, each crooked, knotted and branching, round a lumpy, mossy bulb that sprouts leaves
    rng = random.Random(77 + alt)
    hip = 0.4 * L
    mesh(root.name + "_bulb", join([ell(0.2 * W, 0.15, 0.2 * W, (0, hip - 0.1, 0))] + [ell(rng.uniform(0.07, 0.11), rng.uniform(0.06, 0.09), rng.uniform(0.07, 0.11), (rng.uniform(-0.08, 0.08), hip - 0.12 + rng.uniform(-0.04, 0.03), rng.uniform(-0.08, 0.08))) for _ in range(4)]), "sapling", root, INK)
    moss = [ell(rng.uniform(0.04, 0.07), 0.025, rng.uniform(0.04, 0.07), (math.cos(a) * 0.12, hip - 0.02 + rng.uniform(-0.02, 0.02), math.sin(a) * 0.12)) for a in [rng.uniform(0, 6.28) for _ in range(4)]]
    mesh(root.name + "_moss", join(moss), "moss", root, 0.008)
    sprouts = []
    for i in range(5):
        a = 2 * math.pi * i / 5 + rng.uniform(-0.3, 0.3)
        b = (math.cos(a) * 0.1, hip - 0.04, math.sin(a) * 0.1)
        sprouts.append(ell_between(b, (math.cos(a) * 0.22, hip + 0.08 + rng.uniform(0, 0.06), math.sin(a) * 0.22), 0.04, 0.008, roll=rng.uniform(-0.4, 0.4), n=8))
    mesh(root.name + "_sprouts", join(sprouts), "leaf", root, 0.006)
    extra = []
    n = 6
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.35, 0.35)
        c, s = math.cos(a), math.sin(a)
        off = Vector((c * 0.08 * W, hip - 0.14, s * 0.08 * W))
        p = pivot(f"{root.name}_root{i}", tuple(off), root, role="leg")
        y0 = -(hip - 0.14)
        reach = rng.uniform(0.3, 0.46) * W
        wob = lambda: rng.uniform(-0.05, 0.05)
        path = [(0, 0, 0)]
        for f in (0.3, 0.55, 0.8, 1.0):
            d = reach * f
            path.append((c * d - s * wob(), y0 * (0.35 + 0.65 * f ** 1.5) + (0.03 if f < 1 else 0.015) + rng.uniform(0, 0.03) * (1 - f), s * d + c * wob()))
        radii = [0.07 * W, 0.055 * W * rng.uniform(0.85, 1.15), 0.045 * W * rng.uniform(0.85, 1.2), 0.032 * W, 0.016]
        mesh(p.name + "_r", limb(path, radii), "bark", p, INK * 0.6)
        mid = Vector(path[2])
        tipd = Vector((c, 0, s)).cross(Vector((0, 1, 0))) * rng.choice((-1, 1))
        mesh(p.name + "_rootlet", limb([tuple(mid), tuple(mid + tipd * 0.09 + Vector((0, -0.06, 0)) + Vector((c, 0, s)) * 0.03), tuple(mid + tipd * 0.13 + Vector((0, y0 - mid.y + 0.012, 0)))], [0.022, 0.016, 0.01]), "bark", p, 0.008)
        if rng.random() < 0.6:
            mesh(p.name + "_knot", ell(0.03, 0.025, 0.03, path[1]), "bark", p, 0.008)
        if i % 2 == 0:
            graft(p, "mid", tuple(Vector(path[1]) + Vector((0, 0.03, 0))), (c * 0.5, 1, s * 0.5), "low", 0.5)
        foot = Vector(path[-1])
        if alt == 1 and i % 2 == 0:                                             # a toadstool at some root ends
            st = foot + off + Vector((s * 0.06, 0, -c * 0.06))
            st.y = 0.0
            extra.append(("white", xf(lathe([(0, 0), (0.016, 0), (0.014, 0.07), (0, 0.075)], 6), tuple(st))))
            extra.append(("cap", xf(lathe([(0, -0.004), (0.05, 0.0), (0.042, 0.03), (0, 0.045)], 8), tuple(st + Vector((0, 0.07, 0))))))
            extra.append(("white", join([ell(0.008, 0.006, 0.008, tuple(st + Vector((math.cos(q) * 0.028, 0.098, math.sin(q) * 0.028)))) for q in (0.4, 2.4, 4.4)])))
        elif alt == 2:                                                          # tiny blossoms along the roots
            c0 = Vector(path[2 + i % 2]) + off + Vector((0, 0.03, 0))
            extra.append(("blossom", join([ell(0.018, 0.008, 0.012, tuple(c0 + Vector((math.cos(k * 1.257) * 0.018, 0, math.sin(k * 1.257) * 0.018))), (0, -k * 1.257, 0), n=6) for k in range(5)])))
            extra.append(("gold", ell(0.01, 0.009, 0.01, tuple(c0 + Vector((0, 0.004, 0))), n=6)))
    by = {}
    for slot, g in extra:
        by.setdefault(slot, []).append(g)
    for slot, gs in by.items():
        mesh(f"{root.name}_{slot}_bits", join(gs), slot, root, 0.006 if slot != "gold" else 0)
    for sx in (-1, 1):
        graft(root, f"side{sx}", (sx * 0.16, hip - 0.1, 0.02), (sx, 0.3, 0.1), "side", 0.8)
    graft(root, "front", (0, hip - 0.1, 0.16), (0, 0.3, 1), "front", 0.7)
    socket(root, "hip", (0, hip, 0), jrx=0.14, jrz=0.14)


# =====================================================================================================
# BODIES (the origin on the legs' hip; neck and back sockets)
# =====================================================================================================
def body_mite(root, alt):
    joint(root, 0.12, 0.14)
    mesh(root.name + "_abdomen", ell(0.3 * W, 0.22, 0.4, (0, 0.2, -0.26)), "mite", root, INK)
    bands = [xf(torus(1, 0.085, 20, 6), (0, 0.2, -0.26 + dz), (math.pi / 2, 0, 0), (0.3 * W * f + 0.01, 0.26, 0.22 * f + 0.01)) for dz, f in ((-0.2, 0.86), (0.0, 1.0), (0.2, 0.86))]
    mesh(root.name + "_bands", join(bands), "dark", root, 0.008)
    mesh(root.name + "_shell", ell(0.2 * W, 0.15, 0.2, (0, 0.17, 0.12)), "mite", root, INK)
    if alt == 0:                                                                # wing cases, raised in a V from the shoulders, clear of the abdomen
        for sx in (-1, 1):
            mesh(f"{root.name}_wing{sx}", ell_between((sx * 0.06, 0.3, 0.14), (sx * 0.3, 0.62, -0.48), 0.1, 0.012, roll=sx * 0.35), "glass", root, 0.008)
            mesh(f"{root.name}_vein{sx}", limb([(sx * 0.06, 0.3, 0.14), (sx * 0.2, 0.47, -0.2)], [0.008, 0.006], 4), "dark", root, 0)
    elif alt == 1:                                                              # a ridge of spines down its back
        spines = []
        for k in range(6):
            z = 0.06 - k * 0.11
            f = math.sqrt(max(0.05, 1 - ((z + 0.26) / 0.4) ** 2)) if z < 0.06 else 0.9
            y0 = 0.2 + 0.22 * f - 0.03
            spines.append(cone_between((0, y0, z), (0, y0 + 0.1 - abs(k - 2) * 0.012, z - 0.05), 0.03))
        mesh(root.name + "_spines", join(spines), "dark", root, 0.006)
    else:                                                                       # glowing spots down its flanks and a stinger
        spots = []
        for sx in (-1, 1):
            for z, y in ((-0.12, 0.26), (-0.28, 0.27), (-0.44, 0.24)):
                f = math.sqrt(max(0.0, 1 - ((z + 0.26) / 0.4) ** 2 - ((y - 0.2) / 0.22) ** 2))
                spots.append(ell(0.03, 0.03, 0.03, (sx * (0.3 * W * f - 0.012), y, z)))
        mesh(root.name + "_spots", join(spots), "eye", root, 0)
        mesh(root.name + "_stinger", cone_between((0, 0.2, -0.6), (0, 0.16, -0.78), 0.05), "dark", root, 0.008)
    for sx in (-1, 1):
        graft(root, f"flank{sx}", (sx * 0.245, 0.24, -0.28), (sx, 0.35, 0), "side", 1.0)
        graft(root, f"low{sx}", (sx * 0.2, 0.08, -0.2), (sx, -0.4, 0), "low", 0.7)
        graft(root, f"shoulder{sx}", (sx * 0.13, 0.22, 0.14), (sx, 0.6, 0.3), "side", 0.7)
    graft(root, "top", (0, 0.41, -0.3), (0, 1, -0.1), "top", 1.0)
    graft(root, "tail", (0, 0.22, -0.65), (0, 0.1, -1), "back", 0.8)
    socket(root, "neck", (0, 0.27, 0.32), jrx=0.08, jrz=0.08)
    socket(root, "back", (0, 0.42, -0.26))


def body_car(root, alt):
    joint(root, 0.16, 0.2)
    mesh(root.name + "_hull", soft(0.56, 0.2, 0.92, (0, 0.13, 0)), "car", root, INK)
    if alt == 0:                                                                # a coupe: a cabin with its glass, a stripe, fins and exhausts
        mesh(root.name + "_cabin", soft(0.42, 0.17, 0.44, (0, 0.3, -0.06)), "car", root, INK * 0.8)
        mesh(root.name + "_glass", soft(0.43, 0.1, 0.4, (0, 0.31, -0.06)), "glass", root, 0.008)
        mesh(root.name + "_stripe", box(0.08, 0.008, 0.9, (0, 0.233, 0.0)), "white", root, 0)
        for sx in (-1, 1):
            mesh(f"{root.name}_fin{sx}", xf(extrude([(-0.46, 0.18), (-0.3, 0.2), (-0.44, 0.42)], 0.03, "x"), (sx * 0.22, 0, 0)), "car", root, 0.01)
            mesh(f"{root.name}_pipe{sx}", xf(cylinder(0.035, 0.04, 0.12, 8)[:2], (sx * 0.13, 0.09, -0.48), (math.pi / 2, 0, 0)), "metal", root, 0.008)
            mesh(f"{root.name}_glow{sx}", ell(0.026, 0.026, 0.008, (sx * 0.13, 0.09, -0.543)), "red", root, 0)
        roof = 0.39
    elif alt == 1:                                                              # a pickup: a cab up front, an open bed with a crate, a roll bar with spotlights
        mesh(root.name + "_cab", soft(0.46, 0.2, 0.36, (0, 0.32, 0.16)), "car", root, INK * 0.8)
        mesh(root.name + "_glass", soft(0.47, 0.11, 0.3, (0, 0.34, 0.17)), "glass", root, 0.008)
        mesh(root.name + "_bed", join([box(0.03, 0.1, 0.48, (sx * 0.25, 0.27, -0.2)) for sx in (-1, 1)] + [box(0.53, 0.1, 0.03, (0, 0.27, -0.45))]), "car", root, 0.01)
        mesh(root.name + "_crate", box(0.2, 0.13, 0.18, (0.06, 0.29, -0.27), (0, 0.3, 0)), "bark", root, 0.01)
        mesh(root.name + "_rollbar", limb([(-0.22, 0.22, -0.04), (-0.22, 0.5, -0.04), (0.22, 0.5, -0.04), (0.22, 0.22, -0.04)], [0.018] * 4, 6), "chrome", root, 0.008)
        mesh(root.name + "_spots", join([xf(cylinder(0.035, 0.03, 0.04, 8)[:2], (x, 0.53, -0.02), (math.pi / 2, 0, 0)) for x in (-0.1, 0.1)]), "lamp", root, 0.006)
        roof = 0.42
    else:                                                                       # a hot rod: a bare engine with chrome stacks and a glowing intake
        mesh(root.name + "_engine", soft(0.3, 0.16, 0.3, (0, 0.3, -0.08)), "steel", root, 0.012)
        mesh(root.name + "_intake", soft(0.12, 0.08, 0.16, (0, 0.41, -0.06)), "chrome", root, 0.008)
        mesh(root.name + "_mouth", box(0.08, 0.03, 0.006, (0, 0.41, 0.023)), "spark", root, 0)
        stacks = [xf(cylinder(0.028, 0.03, 0.22, 8)[:2], (sx * 0.17, 0.36, -0.12 + k * 0.1), (0.25, 0, sx * 0.25)) for sx in (-1, 1) for k in (0, 1)]
        mesh(root.name + "_stacks", join(stacks), "chrome", root, 0.008)
        mesh(root.name + "_flames", join([box(0.005, 0.04, 0.22, (sx * 0.282, 0.13, 0.2), (0.3, 0, 0)) for sx in (-1, 1)]), "spark", root, 0)
        roof = 0.24
    for sx in (-1, 1):
        graft(root, f"door{sx}", (sx * 0.28, 0.14, 0.12), (sx, 0.1, 0), "side", 1.0)
        graft(root, f"quarter{sx}", (sx * 0.27, 0.15, -0.3), (sx, 0.2, -0.2), "side", 0.8)
        graft(root, f"sill{sx}", (sx * 0.26, 0.05, -0.05), (sx, -0.5, 0), "low", 0.7)
    graft(root, "roof", (0, roof, -0.06 if alt != 1 else 0.16), (0, 1, 0), "top", 0.9)
    graft(root, "rear", (0, 0.15, -0.46), (0, 0.1, -1), "back", 0.8)
    socket(root, "neck", (0, 0.29, 0.4), jrx=0.08, jrz=0.08)
    socket(root, "back", (0, 0.3 if alt != 2 else 0.45, -0.3))


def body_sapling(root, alt):
    joint(root, 0.14, 0.14)
    rng = random.Random(311 + alt)
    h = 0.62 * T
    lean = rng.uniform(-0.06, 0.06)
    prof = [(0, 0), (0.17 * W, 0.0), (0.185 * W, 0.05)]
    for f in (0.2, 0.38, 0.55, 0.72, 0.88, 1.0):
        prof.append(((0.15 - 0.06 * f) * W * rng.uniform(0.88, 1.12), h * f))
    prof.append((0, h + 0.02))
    trunk = lathe(prof, 9)
    trunk = ([(v[0] + lean * v[1], v[1], v[2]) for v in trunk[0]], trunk[1])   # (a slight lean)
    mesh(root.name + "_trunk", trunk, "sapling", root, INK)
    mesh(root.name + "_knots", join([ell(0.035, 0.04, 0.025, (rng.uniform(-0.06, 0.06) + lean * y, y, 0.11 * W + 0.005)) for y in (h * 0.3, h * 0.62)]), "bark", root, 0.008)
    mesh(root.name + "_hollow", ell(0.035, 0.05, 0.02, (lean * h * 0.45, h * 0.45, 0.115 * W)), "dark", root, 0)
    leaves, flowers = [], []
    for k, sx in enumerate((-1, 1, rng.choice((-1, 1)))):                      # two or three branches, at uneven heights
        hy = h * (0.55 + 0.15 * k + rng.uniform(-0.05, 0.05))
        tip = (sx * rng.uniform(0.28, 0.38) * W + lean * hy, hy + rng.uniform(0.12, 0.22), rng.uniform(-0.08, 0.08))
        base = (sx * 0.06 * W + lean * hy * 0.8, hy - 0.12, 0)
        mesh(f"{root.name}_branch{k}", limb([base, ((base[0] + tip[0]) / 2 + sx * 0.03, (base[1] + tip[1]) / 2, tip[2] / 2), tip], [0.04 * W, 0.032 * W, 0.022 * W]), "bark", root, 0.012)
        for _ in range(6):
            leaves.append(ell(rng.uniform(0.05, 0.09) * W, rng.uniform(0.04, 0.07), rng.uniform(0.05, 0.09) * W, (tip[0] + rng.uniform(-0.09, 0.09), tip[1] + rng.uniform(-0.03, 0.09), tip[2] + rng.uniform(-0.08, 0.08))))
        if alt == 1:
            for _ in range(4):
                flowers.append(ell(0.03, 0.02, 0.03, (tip[0] + rng.uniform(-0.1, 0.1), tip[1] + rng.uniform(0.02, 0.12), tip[2] + rng.uniform(-0.09, 0.09))))
        if k < 2:
            graft(root, f"crown{k}", (tip[0], tip[1] + 0.08, tip[2]), (sx * 0.4, 1, 0), "top", 0.7)
    mesh(root.name + "_leaves", join(leaves), "leaf", root, 0.012)
    if flowers:
        mesh(root.name + "_blossoms", join(flowers), "blossom", root, 0.006)
    if alt == 2:                                                                # a vine winding up the trunk, and moss at its foot
        pts = [(math.cos(t * 2.5) * (0.155 - 0.05 * t / 2.6) * W + lean * h * t / 2.6, h * t / 2.6 * 0.95 + 0.04, math.sin(t * 2.5) * (0.155 - 0.05 * t / 2.6) * W) for t in [i * 0.2 for i in range(14)]]
        mesh(root.name + "_vine", limb(pts, [0.016] * len(pts), 5), "leaf", root, 0.006)
        mesh(root.name + "_vineleaves", join([ell(0.03, 0.01, 0.02, p) for p in pts[2::3]]), "leaf", root, 0.006)
        mesh(root.name + "_moss", join([ell(0.07, 0.03, 0.06, (math.cos(a) * 0.16, 0.08, math.sin(a) * 0.16)) for a in (0.5, 2.3, 4.2)]), "moss", root, 0.008)
    for sx in (-1, 1):
        graft(root, f"flank{sx}", (sx * 0.12 + lean * h * 0.35, h * 0.35, 0.0), (sx, 0.1, 0.1), "side", 0.9)
        graft(root, f"low{sx}", (sx * 0.14, 0.08, 0.03), (sx, -0.2, 0.3), "low", 0.6)
    graft(root, "chest", (lean * h * 0.62, h * 0.62, 0.1), (0, 0.1, 1), "front", 0.8)
    graft(root, "back", (lean * h * 0.5, h * 0.5, -0.11), (0, 0.1, -1), "back", 0.8)
    socket(root, "neck", (lean * h, h + 0.02, 0), jrx=0.06, jrz=0.06)
    socket(root, "back", (0, h * 0.5, -0.15 * W))


# =====================================================================================================
# HEADS (the origin on the neck socket, facing +z)
# =====================================================================================================
def head_mite(root, alt):
    joint(root, 0.07, 0.07)
    s = HS
    mesh(root.name + "_head", ell(0.17 * s, 0.14 * s, 0.16 * s, (0, 0.13 * s, 0.05 * s)), "mite", root, INK)
    eye = (0.1 if alt == 2 else 0.075 if alt == 0 else 0.055) * s
    for sx in (-1, 1):
        mesh(f"{root.name}_eye{sx}", ell(eye, eye * 1.12, eye * 0.95, (sx * 0.1 * s, 0.17 * s, 0.13 * s)), "eye", root, 0.01)
        mesh(f"{root.name}_jaw{sx}", limb([(sx * 0.06 * s, 0.06 * s, 0.17 * s), (sx * 0.07 * s, 0.03 * s, 0.25 * s), (sx * 0.02 * s, 0.02 * s, 0.31 * s)], [0.025 * s, 0.02 * s, 0.012 * s], 6), "dark", root, 0.008)
        feel = [(sx * 0.05 * s, 0.24 * s, 0.1 * s), (sx * 0.12 * s, 0.4 * s, 0.16 * s), (sx * 0.2 * s, 0.46 * s, 0.26 * s)]
        mesh(f"{root.name}_feeler{sx}", limb(feel, [0.014, 0.012, 0.01], 6), "dark", root, 0.006)
        mesh(f"{root.name}_bulb{sx}", ell(0.03, 0.03, 0.03, feel[-1]), "eye", root, 0)
        if alt == 2:                                                            # feathery: barbs along each feeler
            barbs = []
            for t in (0.3, 0.5, 0.7, 0.85):
                a, b = Vector(feel[1]), Vector(feel[2])
                p = a.lerp(b, t) if t > 0.5 else Vector(feel[0]).lerp(a, t * 2)
                barbs += [limb([tuple(p), tuple(p + Vector((sx * 0.05, 0.03, 0.0)))], [0.006, 0.004], 4), limb([tuple(p), tuple(p + Vector((0, 0.03, 0.05)))], [0.006, 0.004], 4)]
            mesh(f"{root.name}_barbs{sx}", join(barbs), "dark", root, 0)
        graft(root, f"cheek{sx}", (sx * 0.15 * s, 0.11 * s, 0.02 * s), (sx, 0.2, 0), "side", 0.5)
    if alt == 1:                                                                # a rhinoceros horn
        mesh(root.name + "_horn", limb([(0, 0.2 * s, 0.14 * s), (0, 0.3 * s, 0.22 * s), (0, 0.42 * s, 0.22 * s), (0, 0.5 * s, 0.16 * s)], [0.05 * s, 0.035 * s, 0.022 * s, 0.008], 6, caps=(False, True)), "dark", root, 0.01)
    graft(root, "crown", (0, 0.25 * s, -0.02 * s), (0, 1, -0.4), "top", 0.5)
    socket(root, "top", (0, 0.26 * s, 0.03 * s))
    socket(root, "eye", (0.1 * s, 0.17 * s, 0.13 * s + eye * 0.95))


def head_car(root, alt):
    joint(root, 0.1, 0.1)
    s = HS
    if alt == 1:                                                                # a truck: square, a chrome grille, round lamps, an aerial
        mesh(root.name + "_face", soft(0.38 * s, 0.3 * s, 0.26 * s, (0, 0.16 * s, 0.04 * s), e=0.2), "car", root, INK)
        mesh(root.name + "_grille", soft(0.22 * s, 0.13 * s, 0.03, (0, 0.11 * s, 0.17 * s), e=0.2), "chrome", root, 0.008)
        mesh(root.name + "_slats", join([box(0.2 * s, 0.012, 0.012, (0, (0.07 + 0.03 * k) * s, 0.188 * s)) for k in range(4)]), "dark", root, 0)
        mesh(root.name + "_lamps", join([xf(cylinder(0.05 * s, 0.05 * s, 0.03, 12)[:2], (sx * 0.13 * s, 0.22 * s, 0.165 * s), (math.pi / 2, 0, 0)) for sx in (-1, 1)]), "lamp", root, 0.008)
        mesh(root.name + "_aerial", limb([(0.15 * s, 0.3 * s, -0.04), (0.17 * s, 0.6 * s, -0.08)], [0.007, 0.005], 4), "metal", root, 0.004)
        eyeAt, top = (0.13 * s, 0.22 * s, 0.18 * s), 0.31
    elif alt == 2:                                                              # a racer: low and pointed, a slit of light, a splitter, a fin
        mesh(root.name + "_face", soft(0.36 * s, 0.22 * s, 0.3 * s, (0, 0.12 * s, 0.05 * s)), "car", root, INK)
        mesh(root.name + "_slit", box(0.26 * s, 0.025 * s, 0.012, (0, 0.17 * s, 0.195 * s)), "lamp", root, 0.004)
        mesh(root.name + "_splitter", box(0.36 * s, 0.015, 0.06, (0, 0.02 * s, 0.2 * s)), "dark", root, 0.006)
        mesh(root.name + "_fin", extrude([(-0.08 * s, 0.2 * s), (0.08 * s, 0.22 * s), (-0.1 * s, 0.33 * s)], 0.025, "x"), "car", root, 0.008)
        eyeAt, top = (0.09 * s, 0.17 * s, 0.2 * s), 0.23
    else:                                                                       # the road car: headlight eyes under visor brows, a grille, a bumper, a siren
        mesh(root.name + "_face", soft(0.36 * s, 0.26 * s, 0.26 * s, (0, 0.14 * s, 0.04 * s)), "car", root, INK)
        for sx in (-1, 1):
            mesh(f"{root.name}_lamp{sx}", ell(0.06 * s, 0.06 * s, 0.035 * s, (sx * 0.1 * s, 0.18 * s, 0.16 * s)), "lamp", root, 0.01)
        mesh(root.name + "_brows", join([box(0.11 * s, 0.022, 0.05, (sx * 0.1 * s, 0.245 * s, 0.155 * s), (0.2, 0, -sx * 0.15)) for sx in (-1, 1)]), "dark", root, 0.006)
        mesh(root.name + "_grille", join([box(0.2 * s, 0.018, 0.03, (0, (0.06 + 0.03 * k) * s, 0.168 * s)) for k in range(3)]), "dark", root, 0.006)
        mesh(root.name + "_bumper", soft(0.38 * s, 0.05, 0.08, (0, 0.025 * s, 0.15 * s), e=0.5), "metal", root, 0.01)
        mesh(root.name + "_siren", xf(cylinder(0.04 * s, 0.05 * s, 0.06 * s, 10)[:2], (0, 0.29 * s, 0.0)), "red", root, 0.008)
        eyeAt, top = (0.1 * s, 0.18 * s, 0.19 * s), 0.27
    for sx in (-1, 1):
        graft(root, f"cheek{sx}", (sx * 0.18 * s, 0.13 * s, 0.0), (sx, 0.1, 0), "side", 0.6)
    graft(root, "crown", (0.06 * s, top * s - 0.01, -0.06 * s), (0, 1, 0), "top", 0.5)
    socket(root, "top", (0, top * s, -0.06 * s))
    socket(root, "eye", eyeAt)


def head_sapling(root, alt):
    joint(root, 0.035, 0.035)
    s = HS
    mesh(root.name + "_stem", limb([(0, 0, 0), (0, 0.1 * s, 0.01), (0, 0.17 * s, 0.03)], [0.04 * s, 0.035 * s, 0.03 * s], 6), "leaf", root, 0.012)
    for sx in (-1, 1):
        mesh(f"{root.name}_leaf{sx}", ell(0.1 * s, 0.025 * s, 0.05 * s, (sx * 0.08 * s, 0.07 * s, 0.01), (0, 0, sx * 0.4)), "leaf", root, 0.01)
    face_z = 0.103 * s
    if alt == 1:                                                                # a tulip bud: five petals cupped round a face
        mesh(root.name + "_core", ell(0.12 * s, 0.14 * s, 0.1 * s, (0, 0.3 * s, 0.03 * s)), "gold", root, INK * 0.8)
        pet = [ell_between((math.sin(a) * 0.09 * s, 0.18 * s, 0.03 * s + math.cos(a) * 0.08 * s), (math.sin(a) * 0.15 * s, 0.46 * s, 0.03 * s + math.cos(a) * 0.13 * s), 0.07 * s, 0.018, n=10) for a in [2 * math.pi * k / 5 + math.pi / 5 for k in range(5)]]
        mesh(root.name + "_petals", join(pet), "petal", root, 0.01)
        face_z = 0.128 * s
    elif alt == 2:                                                              # a crown of leaves round a seed head
        mesh(root.name + "_disc", ell(0.14 * s, 0.14 * s, 0.07 * s, (0, 0.28 * s, 0.05 * s)), "gold", root, INK * 0.8)
        crown_ = [ell_between((math.cos(a) * 0.08 * s, 0.28 * s + math.sin(a) * 0.08 * s, 0.0), (math.cos(a) * 0.3 * s, 0.28 * s + math.sin(a) * 0.3 * s, -0.04), 0.06 * s, 0.012, n=8) for a in [2 * math.pi * k / 7 + 0.2 for k in range(7)]]
        mesh(root.name + "_crown", join(crown_), "leaf", root, 0.01)
        mesh(root.name + "_seeds", join([ell(0.012, 0.012, 0.006, (math.cos(a) * rr * s, 0.28 * s + math.sin(a) * rr * s, 0.115 * s)) for rr, n in ((0.09, 9), (0.05, 5)) for a in [2 * math.pi * k / n for k in range(n)]]), "bark", root, 0)
        face_z = 0.118 * s
    else:                                                                       # the daisy: a disc, nine petals
        mesh(root.name + "_disc", ell(0.15 * s, 0.15 * s, 0.06 * s, (0, 0.28 * s, 0.05 * s)), "gold", root, INK * 0.8)
        pet = [ell(0.1 * s, 0.05 * s, 0.022 * s, (math.cos(a) * 0.19 * s, 0.28 * s + math.sin(a) * 0.19 * s, 0.03 * s), (0, 0, a)) for a in [2 * math.pi * k / 9 for k in range(9)]]
        mesh(root.name + "_petals", join(pet), "petal", root, 0.012)
    for sx in (-1, 1):
        mesh(f"{root.name}_eye{sx}", ell(0.022 * s, 0.032 * s, 0.012 * s, (sx * 0.05 * s, 0.3 * s, face_z)), "dark", root, 0)
        graft(root, f"stem{sx}", (sx * 0.03 * s, 0.1 * s, 0.01), (sx, 0.2, 0), "side", 0.4)
    graft(root, "crown", (0, 0.4 * s, -0.01), (0, 1, -0.3), "top", 0.5)
    socket(root, "top", (0, 0.42 * s, 0.03 * s))
    socket(root, "eye", (0.05 * s, 0.3 * s, face_z + 0.01))


# =====================================================================================================
# MUTATIONS, each in the form of the family it grows on (on y = 0 along +y, the foot sunk 2 cm)
# =====================================================================================================
def mut_armor(root, fam):
    if fam == "mite":                                                           # plated chitin: a thick dark shell plate rimmed in steel
        mesh(root.name + "_plate", ell(0.12, 0.05, 0.1, (0, 0.01, 0)), "dark", root, 0.012)
        mesh(root.name + "_rim", xf(torus(0.1, 0.012, 16, 4), (0, 0.02, 0), s=(1.1, 1, 0.85)), "steel", root, 0.004)
    elif fam == "car":                                                          # riveted steel plating
        mesh(root.name + "_plate", soft(0.22, 0.04, 0.16, (0, 0.005, 0), e=0.2), "steel", root, 0.01)
        mesh(root.name + "_rivets", join([ell(0.011, 0.008, 0.011, (x, 0.027, z)) for x in (-0.09, 0.0, 0.09) for z in (-0.06, 0.06)]), "metal", root, 0)
    elif fam == "sapling":                                                      # hardened bark, grey as stone, in cracked plates
        for k, (x, z, a) in enumerate(((-0.05, -0.02, 0.2), (0.05, 0.03, -0.3), (0.0, 0.07, 0.5))):
            mesh(f"{root.name}_slab{k}", xf(superquad(0.07, 0.03, 0.05, 0.4, 0.4, 8, 6), (x, 0.008, z), (0, a, 0)), "stonebark", root, 0.008)
    else:                                                                       # body armour: a padded plate with a strap
        mesh(root.name + "_plate", soft(0.2, 0.05, 0.16, (0, 0.008, 0), e=0.35), "steel", root, 0.01)
        mesh(root.name + "_pad", soft(0.14, 0.012, 0.1, (0, 0.035, 0), e=0.35), "dark", root, 0)
        mesh(root.name + "_strap", box(0.22, 0.012, 0.025, (0, 0.01, -0.07)), "dark", root, 0.004)


def mut_spark(root, fam):
    if fam == "mite":                                                           # a bioelectric sac, its veins lit
        mesh(root.name + "_sac", ell(0.07, 0.06, 0.07, (0, 0.03, 0)), "spark", root, 0.008)
        mesh(root.name + "_veins", join([limb([(0, 0.0, 0), (math.cos(a) * 0.1, 0.0, math.sin(a) * 0.1)], [0.008, 0.005], 4) for a in (0.3, 2.4, 4.3)]), "spark", root, 0)
    elif fam == "car":                                                          # a tesla coil with arcing rings
        mesh(root.name + "_base", xf(cylinder(0.05, 0.06, 0.05, 10)[:2], (0, 0.01, 0)), "steel", root, 0.008)
        mesh(root.name + "_coil", join([xf(torus(0.035, 0.01, 12, 4), (0, 0.06 + k * 0.028, 0)) for k in range(4)]), "metal", root, 0.005)
        mesh(root.name + "_ball", ell(0.045, 0.045, 0.045, (0, 0.2, 0)), "spark", root, 0.006)
        mesh(root.name + "_rings", join([xf(torus(0.08 + k * 0.03, 0.006, 16, 4), (0, 0.2, 0), (0.5 * (k - 1), 0.7 * k, 0)) for k in range(2)]), "spark", root, 0)
    elif fam == "sapling":                                                      # glowing seed pods on a stalk
        mesh(root.name + "_stalk", limb([(0, -0.02, 0), (0.02, 0.1, 0)], [0.012, 0.009], 5), "bark", root, 0.005)
        mesh(root.name + "_pods", join([ell(0.025, 0.035, 0.025, p) for p in ((0.02, 0.13, 0), (-0.03, 0.09, 0.02), (0.05, 0.08, -0.02))]), "spark", root, 0.005)
    else:                                                                       # a battery pack, a crackling terminal
        mesh(root.name + "_pack", soft(0.14, 0.08, 0.1, (0, 0.03, 0), e=0.3), "steel", root, 0.008)
        mesh(root.name + "_cells", join([box(0.03, 0.01, 0.07, (x, 0.072, 0)) for x in (-0.04, 0.0, 0.04)]), "spark", root, 0)
        mesh(root.name + "_prong", limb([(0.05, 0.07, 0), (0.06, 0.13, 0)], [0.008, 0.006], 4), "metal", root, 0.004)


def mut_radio(root, fam):
    if fam == "mite":                                                           # a third feeler, ending in a receiver dish
        mesh(root.name + "_feeler", limb([(0, -0.02, 0), (0.02, 0.15, -0.02), (0.0, 0.28, -0.06)], [0.012, 0.01, 0.008], 5), "dark", root, 0.005)
        mesh(root.name + "_dish", xf(lathe([(0, 0), (0.04, 0.012), (0.045, 0.016), (0.035, 0.016), (0, 0.006)], 10), (0.0, 0.28, -0.06), (1.0, 0, 0)), "mite", root, 0.005)
    elif fam == "car":                                                          # a whip aerial and a little dish
        mesh(root.name + "_whip", limb([(0, -0.02, 0), (0.0, 0.42, -0.03)], [0.01, 0.005], 4, caps=(False, True)), "metal", root, 0.004)
        mesh(root.name + "_dish", xf(lathe([(0, 0), (0.05, 0.015), (0.055, 0.02), (0.045, 0.02), (0, 0.008)], 10), (0.05, 0.08, 0), (0, 0, -1.0)), "white", root, 0.006)
        mesh(root.name + "_beacon", ell(0.018, 0.018, 0.018, (0.0, 0.43, -0.03)), "red", root, 0)
    elif fam == "sapling":                                                      # a branch that grew into a leaf dish
        mesh(root.name + "_branch", limb([(0, -0.02, 0), (0.03, 0.12, 0), (0.0, 0.2, 0.02)], [0.016, 0.012, 0.009], 5), "bark", root, 0.005)
        mesh(root.name + "_dish", xf(lathe([(0, 0), (0.06, 0.02), (0.065, 0.026), (0.05, 0.024), (0, 0.01)], 10), (0.0, 0.2, 0.02), (1.1, 0, 0)), "leaf", root, 0.005)
    else:                                                                       # a headset: an earpiece and a stalk antenna
        mesh(root.name + "_cup", xf(cylinder(0.04, 0.045, 0.035, 10)[:2], (0, 0.012, 0)), "dark", root, 0.006)
        mesh(root.name + "_stalk", limb([(0.0, 0.03, 0), (0.0, 0.25, -0.03)], [0.008, 0.006], 4), "metal", root, 0.004)
        mesh(root.name + "_tip", ell(0.016, 0.016, 0.016, (0.0, 0.26, -0.03)), "red", root, 0)


def mut_lens(root, fam):
    # an eyepiece over the eye socket: the lens faces +y (the builder stands it out of the eye)
    if fam == "car":                                                            # a big lensed headlight
        mesh(root.name + "_cup", lathe([(0, -0.02), (0.06, -0.02), (0.07, 0.03), (0.06, 0.04), (0, 0.03)], 12), "chrome", root, 0.008)
        mesh(root.name + "_lens", ell(0.055, 0.02, 0.055, (0, 0.035, 0)), "lamp", root, 0)
    elif fam == "sapling":                                                      # a glass eye bud in leaves
        mesh(root.name + "_leaves", join([ell_between((0, 0.0, 0), (math.cos(a) * 0.07, 0.02, math.sin(a) * 0.07), 0.025, 0.006, n=8) for a in (0.3, 2.4, 4.4)]), "leaf", root, 0.005)
        mesh(root.name + "_bud", ell(0.04, 0.04, 0.04, (0, 0.03, 0)), "glass", root, 0.006)
    else:                                                                       # a jeweller's eyepiece (mites and people)
        mesh(root.name + "_barrel", xf(cylinder(0.04, 0.045, 0.05, 12)[:2], (0, 0.02, 0)), "gold" if fam == "human" else "dark", root, 0.006)
        mesh(root.name + "_glass", ell(0.035, 0.008, 0.035, (0, 0.047, 0)), "lamp", root, 0)


def mut_turbo(root, fam):
    if fam == "mite":                                                           # jet vents in the abdomen
        mesh(root.name + "_vents", join([xf(cylinder(0.03, 0.04, 0.06, 8)[:2], (x, 0.02, 0)) for x in (-0.05, 0.05)]), "dark", root, 0.006)
        mesh(root.name + "_glow", join([ell(0.026, 0.008, 0.026, (x, 0.052, 0)) for x in (-0.05, 0.05)]), "spark", root, 0)
    elif fam == "car":                                                          # a blown engine with stacks
        mesh(root.name + "_block", soft(0.18, 0.12, 0.16, (0, 0.04, 0), e=0.25), "steel", root, 0.01)
        mesh(root.name + "_band", box(0.185, 0.03, 0.165, (0, 0.08, 0)), "red", root, 0.004)
        mesh(root.name + "_stacks", join([xf(cylinder(0.02, 0.025, 0.12, 8)[:2], (x, 0.14, -0.03), (0.3, 0, 0)) for x in (-0.05, 0.05)]), "chrome", root, 0.006)
        mesh(root.name + "_glow", join([ell(0.018, 0.006, 0.018, (x, 0.2, -0.05)) for x in (-0.05, 0.05)]), "spark", root, 0)
    elif fam == "sapling":                                                      # a hollow log exhaust, smouldering
        mesh(root.name + "_log", xf(lathe([(0.045, -0.02), (0.05, 0.08), (0.04, 0.1), (0.03, 0.1), (0.03, 0.06)], 9), (0, 0, 0)), "bark", root, 0.008)
        mesh(root.name + "_ember", ell(0.03, 0.01, 0.03, (0, 0.07, 0)), "spark", root, 0)
    else:                                                                       # a jet pack: two thrusters
        mesh(root.name + "_pack", soft(0.18, 0.06, 0.2, (0, 0.02, 0), e=0.3), "steel", root, 0.008)
        for x in (-0.06, 0.06):
            mesh(f"{root.name}_thruster{x}", xf(cylinder(0.035, 0.03, 0.18, 8)[:2], (x, 0.06, -0.06), (math.pi / 2, 0, 0)), "metal", root, 0.006)
            mesh(f"{root.name}_flame{x}", ell(0.028, 0.028, 0.01, (x, 0.06, -0.155)), "spark", root, 0)


def mut_crystal(root, n):
    sizes = ((0.035, 0.22), (0.05, 0.32), (0.03, 0.14))[n]
    shards = [octa(sizes[0], sizes[1], (0, -0.02, 0))]
    for k in range(2 + n):
        a = k * 2.1 + n
        shards.append(octa(sizes[0] * 0.7, sizes[1] * (0.55 + 0.1 * k), (math.cos(a) * 0.03, -0.02, math.sin(a) * 0.03), (math.cos(a) * 0.6, 1, math.sin(a) * 0.6)))
    mesh(root.name + "_shards", join(shards), "crystal", root, 0.008)


def mut_mud(root, n):
    rng = random.Random(40 + n)
    blobs = [ell(rng.uniform(0.03, 0.06), rng.uniform(0.02, 0.035), rng.uniform(0.03, 0.06), (rng.uniform(-0.05, 0.05), rng.uniform(-0.005, 0.02), rng.uniform(-0.05, 0.05))) for _ in range(4)]
    if n == 1:
        blobs.append(limb([(0.0, 0.01, 0.0), (0.01, -0.08, 0.03)], [0.022, 0.01], 6))
    mesh(root.name + "_mud", join(blobs), "mud", root, 0.008)


def mut_void_mote(root):
    mesh(root.name + "_shard", superquad(0.025, 0.05, 0.025, 1.8, 1.8, 4, 2), "voidglow", root, 0)


def crown(root):
    # the Triple Crown: a glowing laurel halo floating over the head, gold leaves round it
    mesh(root.name + "_halo", xf(torus(0.13, 0.014, 24, 6), (0, 0.12, 0)), "splice", root, 0)
    leaves = [ell(0.045, 0.012, 0.022, (math.sin(a) * 0.13, 0.12, math.cos(a) * 0.13), (0, a + 0.6, 0.3)) for a in [2 * math.pi * i / 10 for i in range(10)]]
    mesh(root.name + "_laurel", join(leaves), "gold", root, 0.006)


KINDS = ("mite", "car", "sapling")
FAMILIES = ("mite", "car", "sapling", "human")
BUILD = {"legs": {"mite": legs_mite, "car": legs_car, "sapling": legs_sapling},
         "body": {"mite": body_mite, "car": body_car, "sapling": body_sapling},
         "head": {"mite": head_mite, "car": head_car, "sapling": head_sapling}}
MUTS = {"armor": mut_armor, "spark": mut_spark, "radio": mut_radio, "lens": mut_lens, "turbo": mut_turbo}


def build_part(slot, kind, alt=0, name=None, pos=(0, 0, 0), parent=None):
    root = pivot(name or f"ck_{slot}_{kind}_{alt}", pos, parent, kind=kind, part=slot, alt=alt)
    BUILD[slot][kind](root, alt)
    return root


if not globals().get("CHIMERA_KIT_LIB"):
    for slot in ("legs", "body", "head"):
        for kind in KINDS:
            for alt in ALTS:
                build_part(slot, kind, alt)
    for fam in FAMILIES:
        for m, fn in MUTS.items():
            fn(pivot(f"ck_mut_{m}_{fam}", (0, 0, 0), None, part="mut", mut=m, family=fam), fam)
    for n in range(3):
        mut_crystal(pivot(f"ck_mut_crystal_{n}", (0, 0, 0), None, part="mut", mut="crystal"), n)
    for n in range(2):
        mut_mud(pivot(f"ck_mut_mud_{n}", (0, 0, 0), None, part="mut", mut="mud"), n)
    mut_void_mote(pivot("ck_mut_void_mote", (0, 0, 0), None, part="mut", mut="void"))
    crown(pivot("ck_crown", (0, 0, 0), None, part="crown"))
    audit_coplanar(C.objects)
    dg = bpy.context.evaluated_depsgraph_get()
    tris = {}
    for o in C.objects:
        if o.type != "MESH":
            continue
        p = o
        while p.parent:
            p = p.parent
        tris[p.name] = tris.get(p.name, 0) + sum(len(q.vertices) - 2 for q in o.evaluated_get(dg).to_mesh().polygons)
    print("chimera kit: triangles per piece:", tris, "total", sum(tris.values()))
    export(os.path.join(REPO, "src", "assets", "chimera.glb"), list(C.objects))
