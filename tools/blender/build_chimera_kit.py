# The chimera parts kit for Blender (4.2+ / 5.x): two proposals for rebuilding the chimeras from parts that fit any body to any legs and
# any head (the random draw in src/chimeragenes.js), smaller than today's (drawn at about 1.2 m tall). Not in the game yet: the files are
# docs/chimera-proposals/chimera_kit_a.glb and chimera_kit_b.glb, and preview_chimera_kit.py renders them, part by part and as blends.
#
# In Blender's Python console:   VARIANT = "a"; exec(open(r"<repo>/tools/blender/build_chimera_kit.py").read())
# or headless, with bpy:         MOONRUNNER_REPO=<repo> MOONRUNNER_CHIMERA=a python3 tools/blender/build_chimera_kit.py
#
# The draft covers four of the eight kinds, the most unlike each other (person, mite, car, sapling); the rest follow once a look is picked.
#
# THE SOCKET CONTRACT (both proposals; three.js axes, metres, a chimera faces +z):
#   ck_legs_<kind>   stands on y = 0. Empty `<root>_hip` (role socket, socket hip): where the body sits. Moving parts are pivots at their
#                    joints: role `leg` (swung about x by the walk: biped legs at the hip, mite legs and sapling roots at the thorax / bulb),
#                    role `wheel` (spun about x, extra `r` = radius).
#   ck_body_<kind>   its origin IS its hip socket (placed on the legs' hip). Empties `<root>_neck` (socket neck: where the head sits; a second
#                    head shares it, offset 0.3 m sideways and leaning out) and `<root>_back` (socket back: where the mutations' clusters, the
#                    engine and the antenna go). Biped bodies have role `arm` pivots at the shoulders. The splice joint is drawn on the body:
#                    a collar round its hip and its neck (A: stitched pink cloth, B: a steel clamp with a glowing splice band), so any legs and
#                    any head meet it cleanly.
#   ck_head_<kind>   its origin IS the neck socket; the head stands above it, facing +z. Empty `<root>_top` (socket top): where a crown sits.
#   ck_crown         the Triple Crown (A: a soft gold crown with a pink gem; B: a glowing laurel halo), its origin on a head's top socket.
# Slots: the kind's hide is a slot named after the kind (`person`, `mite`, `car`, `sapling`): the game colours it from the kind's palette
# (PALETTE in src/chimeragenes.js), per part, so a mite's legs under a car's body keep the mite's colour. Fixed: dark, steel, metal, tire,
# white, bark, leaf, petal, gold, stitch (A), thread (A); lit: glass, eye, lamp, red, splice (B).
import math, os

VARIANT = (globals().get("VARIANT") or os.environ.get("MOONRUNNER_CHIMERA") or "a").lower()
REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", ".."))
COLL = "ChimeraKit"


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "person": "ff9f1c", "mite": "b8e986", "car": "ff7ad9", "sapling": "8fd16a",
    "dark": "2a2540", "steel": "55607a", "metal": "8a87a0", "tire": "1d1a29", "white": "f3eee4", "bark": "7a5236", "leaf": "5fbf4a",
    "petal": "ff7ad9", "gold": "ffd23f", "stitch": "ff2e88", "thread": "fff4e0",
    "glass": "9be7ff", "eye": "ff2e88", "lamp": "fff6a8", "red": "ff2a4a", "splice": "7dff3a",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()

# The two looks: roundness (superquad exponent: 1 = ellipsoid, lower = boxier), how many segments round, and the proportions: W widens
# limbs and bodies, L lengthens legs, T the torso, H the head; INK the main volumes' outline.
LOOK = {
    "a": dict(e=0.8, seg=16, W=1.15, L=0.9, T=0.95, H=1.3, INK=0.03, name="PLUSH"),
    "b": dict(e=0.32, seg=8, W=0.85, L=1.35, T=1.05, H=0.85, INK=0.025, name="SPECIMEN"),
}[VARIANT]
E, SEG, W, L, T, H, INK = LOOK["e"], LOOK["seg"], LOOK["W"], LOOK["L"], LOOK["T"], LOOK["H"], LOOK["INK"]


def box(w, h, d, t=(0, 0, 0), r=(0, 0, 0)):
    return xf(cuboid(w, h, d)[:2], t, r)


def soft(w, h, d, t=(0, 0, 0), r=(0, 0, 0), e=None):
    """a rounded block w x h x d (A: a pillow, B: a chamfered slab)"""
    e = E if e is None else e
    return xf(superquad(w / 2, h / 2, d / 2, e, e, SEG, max(6, SEG // 2 + 2)), t, r)


def ell(rx, ry, rz, t=(0, 0, 0), r=(0, 0, 0)):
    """an ellipsoid; the small ones (eyes, claws, caps) with fewer segments"""
    n = max(10, SEG - 2) if max(rx, ry, rz) >= 0.08 else 8
    return xf(superquad(rx, ry, rz, 1, 1, n, n // 2 + 1), t, r)


def limb(path, radii, seg=None, caps=(True, True)):
    """a tube through the points with a round cap at each end (leave out a cap that sits inside another part)"""
    seg = seg or (8 if VARIANT == "a" else 6)
    g = [tube(path, radii, seg, cap=False)]
    for on, p, rr in ((caps[0], path[0], radii[0]), (caps[1], path[-1], radii[-1])):
        if on:
            g.append(xf(superquad(rr, rr, rr, 1, 1, seg, seg // 2 + 1), p))
    return join(g)


def collar(name, parent, y, R, z=0.0, tilt=0.0):
    """the splice joint, drawn on the body round its hip or its neck"""
    rot = (tilt, 0, 0)
    if VARIANT == "a":
        mesh(name + "_collar", xf(torus(R, 0.045, 20, 8), (0, y, z), rot), "stitch", parent, 0.012)
        st = []
        for i in range(10):                                                         # cross stitches round it, sunk 3 mm into the cloth
            a = 2 * math.pi * i / 10
            p = (math.sin(a) * (R + 0.042), y, z + math.cos(a) * (R + 0.042))
            st.append(xf(box(0.012, 0.075, 0.012), p, (tilt, a, 0.5)))
            st.append(xf(box(0.012, 0.075, 0.012), p, (tilt, a, -0.5)))
        mesh(name + "_stitches", join(st), "thread", parent, 0)
    else:
        mesh(name + "_clamp", xf(cylinder(R + 0.03, R + 0.03, 0.07, 12)[:2], (0, y, z), rot), "steel", parent, 0.012)
        mesh(name + "_splice", xf(cylinder(R + 0.035, R + 0.035, 0.022, 12)[:2], (0, y, z), rot), "splice", parent, 0)
        bolts = [xf(cylinder(0.018, 0.018, 0.05, 6)[:2], (math.sin(a) * (R + 0.04), y, z + math.cos(a) * (R + 0.04)), (tilt, 0, math.pi / 2)) for a in (0.5, 0.5 + math.pi)]
        mesh(name + "_bolts", join(bolts), "metal", parent, 0.006)


def socket(root, name, pos, **props):
    return pivot(f"{root.name}_{name}", pos, root, role="socket", socket=name, **props)


# =====================================================================================================
# LEGS (stand on the ground; the hip socket on top)
# =====================================================================================================
def legs_person(root):
    hip = 0.5 * L
    mesh(root.name + "_pelvis", soft(0.42 * W, 0.18, 0.28 * W, (0, hip - 0.05, 0)), "person", root, INK)
    for sx in (-1, 1):
        p = pivot(f"{root.name}_leg{'L' if sx < 0 else 'R'}", (sx * 0.12 * W, hip - 0.09, 0), root, role="leg")
        foot = hip - 0.09
        mid = (0.0, -foot * 0.5, 0.04 if VARIANT == "a" else -0.05)                 # (B: a backward knee, the specimen's stalk)
        mesh(p.name + "_shin", limb([(0, 0, 0), mid, (0, -foot + 0.09, 0)], [0.08 * W, 0.07 * W, 0.06 * W]), "person", p, INK)
        mesh(p.name + "_boot", soft(0.17 * W, 0.12, 0.27, (0, -foot + 0.06, 0.04)), "dark", p, INK * 0.8)
    socket(root, "hip", (0, hip, 0))


def legs_mite(root):
    hip = 0.42 * L
    mesh(root.name + "_thorax", ell(0.2 * W, 0.12, 0.24, (0, hip - 0.07, 0)), "dark", root, INK)
    for sx in (-1, 1):
        for k in (-1, 0, 1):
            p = pivot(f"{root.name}_leg{'L' if sx < 0 else 'R'}{k + 1}", (sx * 0.13 * W, hip - 0.09, k * 0.13), root, role="leg")
            knee = (sx * 0.3 * W, 0.14 * L, k * 0.07)
            foot = (sx * 0.42 * W, -(hip - 0.09) + 0.03, k * 0.15)
            mesh(p.name + "_seg", limb([(0, 0, 0), knee, foot], [0.04 * W, 0.034 * W, 0.022 * W]), "mite", p, INK * 0.6)
            mesh(p.name + "_claw", ell(0.03, 0.03, 0.03, foot), "dark", p, 0.006)
    socket(root, "hip", (0, hip, 0))


def legs_car(root):
    r = 0.19 if VARIANT == "a" else 0.16
    tw = 0.09 if VARIANT == "a" else 0.06
    hip = r + 0.2 * L
    mesh(root.name + "_chassis", box(0.5 * W, 0.08, 0.84, (0, r + 0.02, 0)), "steel", root, INK * 0.8)
    mesh(root.name + "_mount", soft(0.3 * W, hip - r, 0.34, (0, (hip + r) / 2, 0)), "car", root, INK)
    mesh(root.name + "_axles", join([xf(cylinder(0.025, 0.025, 0.86 * W, 8)[:2], (0, r, z), (0, 0, math.pi / 2)) for z in (-0.32, 0.32)]), "metal", root, 0.008)
    for sx in (-1, 1):
        for z in (-0.32, 0.32):
            p = pivot(f"{root.name}_wheel{'L' if sx < 0 else 'R'}{'F' if z > 0 else 'B'}", (sx * 0.43 * W, r, z), root, role="wheel", r=r)
            tire = lathe([(r * 0.55, -tw), (r * 0.92, -tw), (r, -tw * 0.5), (r, tw * 0.5), (r * 0.92, tw), (r * 0.55, tw)], 18)
            mesh(p.name + "_tire", xf(tire, r=(0, 0, math.pi / 2)), "tire", p, INK * 0.8)
            mesh(p.name + "_hub", xf(lathe([(0, -tw * 0.9), (r * 0.58, -tw * 0.9), (r * 0.58, tw * 0.9), (0, tw * 1.05)], 12), r=(0, 0, math.pi / 2)), "metal", p, 0.008)
    socket(root, "hip", (0, hip, 0))


def legs_sapling(root):
    hip = 0.4 * L
    mesh(root.name + "_bulb", ell(0.2 * W, 0.15, 0.2 * W, (0, hip - 0.1, 0)), "bark", root, INK)
    n = 5
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        c, s = math.cos(a), math.sin(a)
        p = pivot(f"{root.name}_root{i}", (c * 0.08 * W, hip - 0.14, s * 0.08 * W), root, role="leg")
        y0 = -(hip - 0.14)
        mesh(p.name + "_r", limb([(0, 0, 0), (c * 0.2 * W, y0 * 0.45, s * 0.2 * W), (c * 0.34 * W, y0 + 0.05, s * 0.34 * W), (c * 0.42 * W, y0 + 0.02, s * 0.42 * W)], [0.07 * W, 0.05 * W, 0.035 * W, 0.02 * W]), "bark", p, INK * 0.6)
    socket(root, "hip", (0, hip, 0))


# =====================================================================================================
# BODIES (the origin on the legs' hip; a collar round the hip and the neck; neck and back sockets)
# =====================================================================================================
def body_person(root):
    h = 0.6 * T
    mesh(root.name + "_torso", soft(0.48 * W, h, 0.32 * W, (0, h / 2 + 0.02, 0)), "person", root, INK)
    mesh(root.name + "_chest", soft(0.26 * W, 0.18, 0.08, (0, h * 0.64, 0.135 * W)), "white", root, 0.01)
    mesh(root.name + "_tank", xf(lathe([(0, -0.2), (0.07, -0.19), (0.1, -0.15), (0.1, 0.15), (0.07, 0.19), (0, 0.2)], 12), (0, h * 0.55, -0.15 * W)), "steel", root, 0.015)
    for sx in (-1, 1):
        p = pivot(f"{root.name}_arm{'L' if sx < 0 else 'R'}", (sx * 0.25 * W, h * 0.84, 0), root, role="arm")
        mesh(p.name + "_a", limb([(0, 0, 0), (sx * 0.05, -h * 0.3, 0.03), (sx * 0.07, -h * 0.55, 0.08)], [0.07 * W, 0.06 * W, 0.055 * W], caps=(False, False)), "person", p, INK * 0.8)
        mesh(p.name + "_glove", ell(0.075 * W, 0.075 * W, 0.075 * W, (sx * 0.07, -h * 0.58, 0.09)), "white", p, 0.012)
    collar(root.name + "_hip", root, 0.03, 0.17 * W)
    collar(root.name + "_neck", root, h + 0.01, 0.1 * W)
    socket(root, "neck", (0, h + 0.03, 0))
    socket(root, "back", (0, h * 0.6, -0.26 * W))


def body_mite(root):
    mesh(root.name + "_abdomen", ell(0.3 * W, 0.22, 0.4, (0, 0.2, -0.26)), "mite", root, INK)
    # dark bands round it: a unit ring squashed to the abdomen's section there (its tube about 2 cm thick), stood up round z
    bands = [xf(torus(1, 0.085, 20, 6), (0, 0.2, -0.26 + dz), (math.pi / 2, 0, 0), (0.3 * W * f + 0.01, 0.26, 0.22 * f + 0.01)) for dz, f in ((-0.2, 0.86), (0.0, 1.0), (0.2, 0.86))]
    mesh(root.name + "_bands", join(bands), "dark", root, 0.008)
    mesh(root.name + "_shell", ell(0.2 * W, 0.15, 0.2, (0, 0.17, 0.12)), "mite", root, INK)
    if VARIANT == "b":                                                              # wing cases, half open
        for sx in (-1, 1):
            mesh(f"{root.name}_wing{sx}", ell(0.14 * W, 0.03, 0.34, (sx * 0.14 * W, 0.42, -0.24), (0.15, sx * 0.25, sx * 0.25)), "glass", root, 0.008)
    collar(root.name + "_hip", root, 0.03, 0.14 * W)
    collar(root.name + "_neck", root, 0.24, 0.08 * W, z=0.3, tilt=math.pi / 2 * 0.6)
    socket(root, "neck", (0, 0.27, 0.32))
    socket(root, "back", (0, 0.42, -0.26))


def body_car(root):
    mesh(root.name + "_hull", soft(0.62 * W, 0.28, 0.96, (0, 0.17, 0)), "car", root, INK)
    mesh(root.name + "_canopy", ell(0.2 * W, 0.14, 0.24, (0, 0.33, -0.08)), "glass", root, 0.012)
    mesh(root.name + "_stripe", box(0.1, 0.012, 0.9, (0, 0.31, 0.0)) if VARIANT == "b" else soft(0.1, 0.03, 0.86, (0, 0.305, 0.0), e=0.5), "white", root, 0.006)
    for sx in (-1, 1):                                                              # tail fins and exhausts
        mesh(f"{root.name}_fin{sx}", xf(extrude([(-0.48, 0.18), (-0.3, 0.2), (-0.46, 0.44)], 0.04, "x"), (sx * 0.24 * W, 0, 0)), "car", root, 0.012)
        mesh(f"{root.name}_pipe{sx}", xf(cylinder(0.04, 0.05, 0.14, 10)[:2], (sx * 0.14 * W, 0.12, -0.5), (math.pi / 2, 0, 0)), "metal", root, 0.008)
        mesh(f"{root.name}_glow{sx}", ell(0.03, 0.03, 0.01, (sx * 0.14 * W, 0.12, -0.572)), "red", root, 0)
    collar(root.name + "_hip", root, 0.03, 0.15 * W)
    collar(root.name + "_neck", root, 0.28, 0.08 * W, z=0.38, tilt=math.pi / 2 * 0.5)
    socket(root, "neck", (0, 0.31, 0.4))
    socket(root, "back", (0, 0.31, -0.3))


def body_sapling(root):
    h = 0.62 * T
    mesh(root.name + "_trunk", lathe([(0, 0), (0.17 * W, 0.0), (0.18 * W, 0.06), (0.14 * W, 0.28), (0.12 * W, h * 0.8), (0.1 * W, h), (0, h + 0.02)], max(8, SEG)), "bark", root, INK)
    leaves = []
    for sx in (-1, 1):                                                              # two branches, a leaf cluster on each
        tip = (sx * 0.34 * W, h * 0.95, 0.02)
        mesh(f"{root.name}_branch{sx}", limb([(sx * 0.08 * W, h * 0.55, 0), (sx * 0.22 * W, h * 0.72, 0.02), tip], [0.045 * W, 0.035 * W, 0.025 * W]), "bark", root, 0.012)
        for dx, dy, dz, rr in ((0, 0.06, 0, 0.11), (sx * 0.08, 0.0, 0.05, 0.08), (sx * -0.05, 0.02, -0.06, 0.08)):
            leaves.append(ell(rr * W, rr * 0.8, rr * W, (tip[0] + dx, tip[1] + dy, tip[2] + dz)))
    mesh(root.name + "_leaves", join(leaves), "leaf", root, 0.015)
    collar(root.name + "_hip", root, 0.03, 0.18 * W)
    collar(root.name + "_neck", root, h, 0.09 * W)
    socket(root, "neck", (0, h + 0.02, 0))
    socket(root, "back", (0, h * 0.5, -0.15 * W))


# =====================================================================================================
# HEADS (the origin on the neck socket, facing +z)
# =====================================================================================================
def head_person(root):
    s = H
    mesh(root.name + "_ring", xf(cylinder(0.1 * s, 0.11 * s, 0.07, 12)[:2], (0, 0.035, 0)), "dark", root, 0.012)
    mesh(root.name + "_helmet", ell(0.23 * s, 0.23 * s, 0.23 * s, (0, 0.27 * s, 0)), "white", root, INK)
    mesh(root.name + "_visor", ell(0.18 * s, 0.13 * s, 0.1 * s, (0, 0.29 * s, 0.155 * s)), "glass", root, 0.012)
    mesh(root.name + "_antenna", limb([(0.12 * s, 0.42 * s, 0), (0.15 * s, 0.58 * s, -0.02)], [0.012, 0.01], 6), "metal", root, 0.006)
    mesh(root.name + "_tip", ell(0.03, 0.03, 0.03, (0.15 * s, 0.6 * s, -0.02)), "lamp", root, 0)
    socket(root, "top", (0, 0.49 * s, 0))


def head_mite(root):
    s = H
    mesh(root.name + "_head", ell(0.17 * s, 0.14 * s, 0.16 * s, (0, 0.13 * s, 0.05 * s)), "mite", root, INK)
    for sx in (-1, 1):
        mesh(f"{root.name}_eye{sx}", ell(0.075 * s, 0.085 * s, 0.07 * s, (sx * 0.1 * s, 0.17 * s, 0.13 * s)), "eye", root, 0.01)
        mesh(f"{root.name}_jaw{sx}", limb([(sx * 0.06 * s, 0.06 * s, 0.17 * s), (sx * 0.07 * s, 0.03 * s, 0.25 * s), (sx * 0.02 * s, 0.02 * s, 0.31 * s)], [0.025 * s, 0.02 * s, 0.012 * s], 6), "dark", root, 0.008)
        mesh(f"{root.name}_feeler{sx}", limb([(sx * 0.05 * s, 0.24 * s, 0.1 * s), (sx * 0.12 * s, 0.4 * s, 0.16 * s), (sx * 0.2 * s, 0.46 * s, 0.26 * s)], [0.014, 0.012, 0.01], 6), "dark", root, 0.006)
        mesh(f"{root.name}_bulb{sx}", ell(0.03, 0.03, 0.03, (sx * 0.2 * s, 0.46 * s, 0.26 * s)), "eye", root, 0)
    socket(root, "top", (0, 0.26 * s, 0.03 * s))


def head_car(root):
    s = H
    mesh(root.name + "_face", soft(0.36 * s, 0.26 * s, 0.26 * s, (0, 0.14 * s, 0.04 * s)), "car", root, INK)
    for sx in (-1, 1):
        mesh(f"{root.name}_lamp{sx}", ell(0.06 * s, 0.06 * s, 0.035 * s, (sx * 0.1 * s, 0.18 * s, 0.16 * s)), "lamp", root, 0.01)
    mesh(root.name + "_grille", join([box(0.2 * s, 0.018, 0.03, (0, (0.06 + 0.03 * k) * s, 0.168 * s)) for k in range(3)]), "dark", root, 0.006)
    mesh(root.name + "_bumper", soft(0.38 * s, 0.05, 0.08, (0, 0.025 * s, 0.15 * s), e=0.5), "metal", root, 0.01)
    mesh(root.name + "_siren", xf(cylinder(0.04 * s, 0.05 * s, 0.06 * s, 10)[:2], (0, 0.29 * s, 0.0)), "red", root, 0.008)
    socket(root, "top", (0, 0.27 * s, -0.06 * s))


def head_sapling(root):
    s = H
    mesh(root.name + "_stem", limb([(0, 0, 0), (0, 0.1 * s, 0.01), (0, 0.17 * s, 0.03)], [0.04 * s, 0.035 * s, 0.03 * s], 6), "leaf", root, 0.012)
    for sx in (-1, 1):
        mesh(f"{root.name}_leaf{sx}", ell(0.1 * s, 0.025 * s, 0.05 * s, (sx * 0.08 * s, 0.07 * s, 0.01), (0, 0, sx * 0.4)), "leaf", root, 0.01)
    mesh(root.name + "_disc", ell(0.15 * s, 0.15 * s, 0.06 * s, (0, 0.28 * s, 0.05 * s)), "gold", root, INK * 0.8)
    pet = []
    for i in range(9):
        a = 2 * math.pi * i / 9
        pet.append(ell(0.1 * s, 0.05 * s, 0.022 * s, (math.cos(a) * 0.19 * s, 0.28 * s + math.sin(a) * 0.19 * s, 0.03 * s), (0, 0, a)))
    mesh(root.name + "_petals", join(pet), "petal", root, 0.012)
    for sx in (-1, 1):
        mesh(f"{root.name}_eye{sx}", ell(0.022 * s, 0.032 * s, 0.012 * s, (sx * 0.05 * s, 0.3 * s, 0.103 * s)), "dark", root, 0)
    socket(root, "top", (0, 0.42 * s, 0.03 * s))


# =====================================================================================================
# THE TRIPLE CROWN (worn by a chimera that won all three tournaments; its origin on a head's top socket)
# =====================================================================================================
def crown(root):
    if VARIANT == "a":                                                          # a soft gold crown, five round points, a pink gem in front
        mesh(root.name + "_band", lathe([(0.11, 0.0), (0.12, 0.0), (0.125, 0.07), (0.11, 0.07)], 16), "gold", root, 0.012)
        pts = [ell(0.032, 0.05, 0.032, (math.sin(2 * math.pi * i / 5) * 0.115, 0.1, math.cos(2 * math.pi * i / 5) * 0.115)) for i in range(5)]
        mesh(root.name + "_points", join(pts), "gold", root, 0.01)
        mesh(root.name + "_gem", ell(0.03, 0.03, 0.018, (0, 0.035, 0.125)), "eye", root, 0.006)
    else:                                                                       # a laurel halo: a glowing ring floating over the head, gold leaves round it
        mesh(root.name + "_halo", xf(torus(0.13, 0.014, 24, 6), (0, 0.12, 0)), "splice", root, 0)
        leaves = [ell(0.045, 0.012, 0.022, (math.sin(a) * 0.13, 0.12, math.cos(a) * 0.13), (0, a + 0.6, 0.3)) for a in [2 * math.pi * i / 10 for i in range(10)]]
        mesh(root.name + "_laurel", join(leaves), "gold", root, 0.006)


KINDS = ("person", "mite", "car", "sapling")
BUILD_CROWN = crown
BUILD = {"legs": {"person": legs_person, "mite": legs_mite, "car": legs_car, "sapling": legs_sapling},
         "body": {"person": body_person, "mite": body_mite, "car": body_car, "sapling": body_sapling},
         "head": {"person": head_person, "mite": head_mite, "car": head_car, "sapling": head_sapling}}


def build_part(slot, kind, name=None, pos=(0, 0, 0), parent=None):
    root = pivot(name or f"ck_{slot}_{kind}", pos, parent, kind=kind, part=slot)
    BUILD[slot][kind](root)
    return root


def sockets(root):
    return {o["socket"]: o for o in root.children if o.get("role") == "socket"}


if not globals().get("CHIMERA_KIT_LIB"):          # (preview_chimera_kit.py loads this file for its parts and builds the blends itself)
    for slot in ("legs", "body", "head"):
        for i, kind in enumerate(KINDS):
            build_part(slot, kind)
    crown(pivot("ck_crown", (0, 0, 0), None, part="crown"))
    audit_coplanar(C.objects)
    if True:
        dg = bpy.context.evaluated_depsgraph_get()
        tris = {}
        for o in C.objects:
            if o.type != "MESH":
                continue
            p = o
            while p.parent:
                p = p.parent
            tris[p.name] = tris.get(p.name, 0) + sum(len(q.vertices) - 2 for q in o.evaluated_get(dg).to_mesh().polygons)
        print(f"chimera kit {VARIANT} ({LOOK['name']}): triangles per part:", tris)
        export(os.path.join(REPO, "docs", "chimera-proposals", f"chimera_kit_{VARIANT}.glb"), list(C.objects))
