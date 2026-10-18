# Shared rover builder for Blender (4.2+ / 5.x): the civil buggy and the military patrol car.
#
# Builds both from code and exports src/assets/rover.glb. In Blender's Python console or via MCP:
#   exec(open(r"<repo>/tools/blender/build_rover.py").read())
# or headless:  MOONRUNNER_REPO=<repo> python3 tools/blender/build_rover.py   (MOONRUNNER_EXPORT=0 to only build)
#
# rover_civil: a lunar utility buggy (the Kepler Mule, road traffic, the hometown and event rovers). A chamfered tub
# on a ladder frame with A-arm suspension, a bonnet with a radiator panel, a grille, round lamps and a bull bar, an
# open cab with a bench seat, a dash and a steering wheel (the traffic driver's, on the left), a tube roll cage
# under a solar canopy, a searchlight on the roof (the "gun"), a cargo bed with crates, a gas tank and a toolbox
# strapped down, an umbrella dish antenna on a mast, side lockers over the step boards, a spare on the tailgate.
#
# rover_military: an armoured patrol car (base patrols, faction troops, the ILMB depot). A faceted armour hull with
# a raked windscreen and shoulder windows, heavy arches, bolted skirts, a push bar with a winch, caged lamps, smoke
# launchers, a light bar in the faction colour, roof hatches, grab rails, two whip antennas, jerry cans, a ladder and
# a spare on the rear door, and a remote weapon station on a ring (the "gun") with a sensor head and an ammo box.
#
# Same frame as every rover (makeRover in src/models.js), so the AI, traffic and vehicle code drive them unchanged:
# origin on the ground in the middle, +z forward, wheels at (+-1.85, 0.85, +-1.8), radius 0.85; gun pivot at
# (0, 3, 0.8). Pivots (empties with a role): chassis (everything not a wheel), gun (yawed by the AI, a child of the
# chassis), wheel (four, spun about x), antenna (military whips, pivoting at the base so the game can lay them back),
# flag (an empty at the flag pole's tip: the game hangs its cloth there). One material per mesh, named after a slot:
# body and stripe take the vehicle's colours, lens glows in the stripe colour, the rest are fixed (ROVER_TOON and
# ROVER_GLOW in src/models.js). Custom property "ink" = outline thickness in metres.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_rover.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "rover.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Rover export ->", OUT)
COLL = "MoonRover"

# preview colours (a Kepler-green buggy): the game swaps in its own materials
SLOT_COLORS = {
    "body": (0.42, 0.56, 0.23), "stripe": (1.0, 0.62, 0.11), "lens": (1.0, 0.62, 0.11),
    "dark": (0.16, 0.15, 0.25), "steel": (0.33, 0.38, 0.48), "metal": (0.54, 0.53, 0.63), "tire": (0.11, 0.1, 0.16),
    "seat": (0.23, 0.18, 0.27), "white": (0.91, 0.89, 0.94), "wood": (0.6, 0.42, 0.23), "olive": (0.31, 0.35, 0.26),
    "panel": (0.12, 0.23, 0.42), "red": (0.84, 0.15, 0.24),
    "glass": (0.81, 0.94, 1.0), "lamp": (1.0, 0.96, 0.66), "tail": (1.0, 0.16, 0.29), "hot": (1.0, 0.62, 0.11),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
WX, WY, WZ, WR = 1.85, 0.85, 1.8, 0.85  # wheel layout shared by every rover


# ---------------- shapes (three.js axes) ----------------

def box(w, h, d):
    v, f, _ = cuboid(w, h, d)
    return v, f


def cyl(r, h, seg=12, rb=None):
    """axis y, centred"""
    v, f, _ = cylinder(r, r if rb is None else rb, h, seg)
    return v, f


def oct_pts(w, h, c):
    """a w x h rectangle with its corners cut by c, round the z axis"""
    x, y = w / 2, h / 2
    return [(-x + c, -y), (x - c, -y), (x, -y + c), (x, y - c), (x - c, y), (-x + c, y), (-x, y - c), (-x, -y + c)]


def prism(stations):
    """A hull through cross-sections [(z, [(x, y)...])], each with the same number of points, capped at both ends."""
    n = len(stations[0][1])
    verts, faces = [], []
    for z, pts in stations:
        verts += [(x, y, z) for x, y in pts]
    for j in range(len(stations) - 1):
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    faces.append(tuple(range(n)))
    faces.append(tuple(range((len(stations) - 1) * n, len(stations) * n)))
    return verts, faces


def cbox(w, h, d, c=0.04):
    """a box with its four edges along z chamfered"""
    p = oct_pts(w, h, c)
    return prism([(-d / 2, p), (d / 2, p)])


def arch(r_in, r_out, a0, a1, width, seg=12):
    """A fender: an annular sector in the z-y plane (angle 0 = +z, pi/2 = up) extruded across x."""
    ang = [a0 + (a1 - a0) * i / seg for i in range(seg + 1)]
    out = [(r_out * math.cos(a), r_out * math.sin(a)) for a in ang]
    inn = [(r_in * math.cos(a), r_in * math.sin(a)) for a in reversed(ang)]
    return extrude(out + inn, width, "x")


def disc_x(r, t, seg=12):
    """a disc facing x"""
    return xf(cyl(r, t, seg), r=(0, 0, PI / 2))


def disc_z(r, t, seg=12):
    """a disc facing z"""
    return xf(cyl(r, t, seg), r=(PI / 2, 0, 0))


def bolts(pts, r=0.03, axis="y"):
    """hex nuts at these points, their axis along x, y or z"""
    rot = {"x": (0, 0, PI / 2), "y": (0, 0, 0), "z": (PI / 2, 0, 0)}[axis]
    return join([xf(cyl(r, r * 1.3, 6), p, rot) for p in pts])


def M(name, geo, slot, parent, ink=0.0):
    return mesh(name, geo, slot, parent, ink)


def mirror_x(geo):
    return xf(geo, s=(-1, 1, 1))


# ---------------- shared running gear ----------------

def wheel(prefix, root, i, sx, sz, military):
    """A wheel pivot at its axle: tyre with tread, rim facing out, lug nuts. Spun about x by the game."""
    W = pivot(f"{prefix}_wheel{i}", (sx * WX, WY, sz * WZ), root, role="wheel")
    if military:
        prof = [(0, -0.34), (0.55, -0.35), (0.76, -0.35), (0.83, -0.31), (0.84, -0.22), (0.84, 0.22), (0.83, 0.31), (0.76, 0.35), (0.55, 0.35), (0, 0.34)]
    else:
        prof = [(0, -0.32), (0.52, -0.33), (0.7, -0.35), (0.79, -0.32), (0.835, -0.24), (0.845, 0), (0.835, 0.24), (0.79, 0.32), (0.7, 0.35), (0.52, 0.33), (0, 0.32)]
    M(f"{prefix}_tyre{i}", xf(lathe(prof, 20), r=(0, 0, PI / 2)), "tire", W, 0.05)
    # tread: straight bars on the patrol car, chevrons on the buggy
    blocks = []
    n = 16 if military else 14
    for k in range(n):
        a = 2 * PI * k / n
        p = lambda x, R=0.855: (x, math.cos(a) * R, math.sin(a) * R)
        if military:
            for x in (-0.17, 0.17):
                blocks.append(xf(box(0.3, 0.07, 0.14), p(x + (0.04 if k % 2 else -0.04)), (a, 0, 0)))
        else:
            for x, yaw in ((-0.15, 0.4), (0.15, -0.4)):
                blocks.append(xf(box(0.26, 0.06, 0.12), p(x), (a, yaw, 0), order="YXZ"))
    M(f"{prefix}_tread{i}", join(blocks), "tire", W, 0)
    # rim (out at +-0.33 on the outer face), spokes, hub cap and nuts
    o = sx  # outward
    rim = lathe([(0, 0), (0.53, 0), (0.53, 0.05), (0.47, 0.07), (0.24, 0.1), (0.2, 0.15), (0, 0.15)], 16)
    M(f"{prefix}_rim{i}", xf(rim, (o * 0.29, 0, 0), (0, 0, -o * PI / 2)), "steel" if military else "metal", W, 0.02)
    if military:
        M(f"{prefix}_rimRing{i}", xf(torus(0.42, 0.035, 16, 4), (o * 0.365, 0, 0), (0, 0, PI / 2)), "dark", W, 0)
        nuts = [(o * 0.38, math.cos(2 * PI * k / 8) * 0.31, math.sin(2 * PI * k / 8) * 0.31) for k in range(8)]
        M(f"{prefix}_nuts{i}", bolts(nuts, 0.032, "x"), "dark", W, 0)
        M(f"{prefix}_hubCap{i}", xf(lathe([(0, 0), (0.13, 0), (0.11, 0.08), (0.05, 0.12), (0, 0.12)], 8), (o * 0.43, 0, 0), (0, 0, -o * PI / 2)), "dark", W, 0.01)
    else:
        spokes = [xf(box(0.04, 0.36, 0.09), (o * 0.385, math.cos(2 * PI * k / 5) * 0.2, math.sin(2 * PI * k / 5) * 0.2), (2 * PI * k / 5, 0, 0)) for k in range(5)]
        M(f"{prefix}_spokes{i}", join(spokes), "dark", W, 0)
        nuts = [(o * 0.45, math.cos(2 * PI * k / 5 + PI / 5) * 0.12, math.sin(2 * PI * k / 5 + PI / 5) * 0.12) for k in range(5)]
        M(f"{prefix}_nuts{i}", bolts(nuts, 0.026, "x"), "steel", W, 0)
        M(f"{prefix}_hubCap{i}", xf(lathe([(0, 0), (0.1, 0), (0.08, 0.06), (0, 0.08)], 8), (o * 0.43, 0, 0), (0, 0, -o * PI / 2)), "stripe", W, 0.01)
    return W


def running_gear(prefix, CH):
    """The frame under the body: side rails, cross members, a skid plate, lower A-arms, knuckles and drive shafts."""
    for sx in (-1, 1):
        M(f"{prefix}_rail{sx}", xf(cbox(0.2, 0.24, 5.3, 0.04), (sx * 0.92, 0.62, 0)), "dark", CH, 0.03)
    for z in (-2.4, -1.8, 0.0, 1.8, 2.4):
        M(f"{prefix}_cross{z}", xf(box(1.66, 0.14, 0.16), (0, 0.6, z)), "dark", CH, 0)
    M(f"{prefix}_skid", xf(cbox(1.5, 0.08, 3.0, 0.03), (0, 0.5, 0)), "steel", CH, 0.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            cz = sz * WZ
            arms = [beam((sx * 0.98, 0.6, cz - 0.32), (sx * 1.42, 0.7, cz), 0.045, 6),
                    beam((sx * 0.98, 0.6, cz + 0.32), (sx * 1.42, 0.7, cz), 0.045, 6)]
            M(f"{prefix}_arm{sx}{sz}", join(arms), "steel", CH, 0.015)
            M(f"{prefix}_shaft{sx}{sz}", beam((sx * 0.9, 0.8, cz), (sx * 1.44, WY, cz), 0.05, 6), "dark", CH, 0)
            M(f"{prefix}_knuckle{sx}{sz}", xf(disc_x(0.16, 0.14, 10), (sx * 1.44, WY, cz)), "dark", CH, 0.015)


def flag_pole(prefix, CH, base, top):
    M(f"{prefix}_pole", beam(base, top, 0.045, 6), "dark", CH, 0.015)
    M(f"{prefix}_poleCap", xf(superquad(0.07, 0.07, 0.07, 1, 1, 8, 4), top), "metal", CH, 0)
    pivot(f"{prefix}_flag", (top[0], top[1] - 0.05, top[2]), CH, role="flag")


# ======================================================================================
# CIVIL BUGGY
# ======================================================================================

R = pivot("rover_civil", (0, 0, 0), None)
R["radius"] = 3.2
CH = pivot("civil_chassis", (0, 0, 0), R, role="chassis")
running_gear("civ", CH)

# ---- the tub: a chamfered hull between the wheels, a sloped nose ----
def tub_sect(xh, yb, yt, c):
    return [(-xh + c, yb), (xh - c, yb), (xh, yb + c), (xh, yt - c), (xh - c, yt), (-xh + c, yt), (-xh, yt - c), (-xh, yb + c)]


M("civ_tub", prism([(-2.6, tub_sect(1.36, 0.8, 1.44, 0.1)), (-2.42, tub_sect(1.42, 0.72, 1.5, 0.12)),
                    (1.95, tub_sect(1.42, 0.72, 1.5, 0.12)), (2.6, tub_sect(1.36, 0.8, 1.32, 0.12))]), "body", CH, 0.07)
# the bonnet over the front: a slope down from the dash to the nose
M("civ_bonnet", prism([(0.9, tub_sect(1.34, 1.36, 2.0, 0.12)), (2.15, tub_sect(1.34, 1.3, 1.78, 0.12)),
                       (2.86, tub_sect(1.22, 0.92, 1.46, 0.1))]), "body", CH, 0.06)
# the faction stripe down each flank, flush on the tub (and over the bonnet's shoulder)
for sx in (-1, 1):
    M(f"civ_stripe{sx}", xf(box(0.008, 0.16, 4.4), (sx * 1.4235, 1.18, -0.2)), "stripe", CH, 0)
# a twin stripe down the middle of the bonnet, laid on its slopes
bon_a = math.atan2(2.0 - 1.78, 2.15 - 0.9)
bon_b = math.atan2(1.78 - 1.46, 2.86 - 2.15)
for x in (-0.22, 0.22):
    M(f"civ_bonStripeA{x}", xf(box(0.16, 0.008, 1.27), (x, (2.0 + 1.78) / 2 + 0.003, (0.9 + 2.15) / 2), (bon_a, 0, 0)), "stripe", CH, 0)
    M(f"civ_bonStripeB{x}", xf(box(0.16, 0.008, 0.78), (x, (1.78 + 1.46) / 2 + 0.003, (2.15 + 2.86) / 2), (bon_b, 0, 0)), "stripe", CH, 0)
# a radiator panel on the bonnet (lunar rovers dump heat by radiating it): a frame with fins
bon_y = lambda z: 2.0 - (z - 0.9) * math.tan(bon_a)  # the bonnet top, back half
M("civ_radFrame", xf(cbox(1.5, 0.06, 0.8, 0.02), (0, bon_y(1.32) + 0.012, 1.32), (bon_a, 0, 0)), "dark", CH, 0.02)
fins = [xf(box(1.36, 0.06, 0.035), (0, bon_y(1.0 + k * 0.12) + 0.06, 1.0 + k * 0.12), (bon_a, 0, 0)) for k in range(6)]
M("civ_radFins", join(fins), "metal", CH, 0)
# grille on the nose face, lamps in bezels, amber markers
M("civ_grilleBack", xf(box(1.3, 0.42, 0.04), (0, 1.17, 2.865)), "dark", CH, 0.01)
M("civ_grilleBars", join([xf(box(0.06, 0.38, 0.05), (-0.54 + k * 0.135, 1.17, 2.89)) for k in range(9)]), "steel", CH, 0)
for sx in (-1, 1):
    M(f"civ_lampCup{sx}", xf(lathe([(0, 0), (0.2, 0), (0.22, 0.1), (0.2, 0.14), (0, 0.12)], 14), (sx * 0.95, 1.18, 2.82), (PI / 2, 0, 0)), "dark", CH, 0.02)
    M(f"civ_lamp{sx}", xf(disc_z(0.16, 0.03, 14), (sx * 0.95, 1.18, 2.955)), "lamp", CH, 0)
    M(f"civ_marker{sx}", xf(cbox(0.06, 0.12, 0.26, 0.02), (sx * 1.425, 1.3, 2.25)), "hot", CH, 0.01)
    M(f"civ_tail{sx}", xf(cbox(0.3, 0.2, 0.05, 0.03), (sx * 1.08, 1.18, -2.625)), "tail", CH, 0.01)
    M(f"civ_reverse{sx}", xf(cbox(0.14, 0.2, 0.05, 0.03), (sx * 0.78, 1.18, -2.625)), "white", CH, 0.01)
# bumper, bull bar, tow hooks
M("civ_bumper", xf(cbox(2.7, 0.26, 0.3, 0.06), (0, 0.84, 2.95)), "dark", CH, 0.03)
bar = tube([(-1.05, 0.95, 3.05), (-1.05, 1.42, 3.12), (-0.8, 1.62, 3.12), (0.8, 1.62, 3.12), (1.05, 1.42, 3.12), (1.05, 0.95, 3.05)], [0.055] * 6, 8)
M("civ_bullBar", bar, "steel", CH, 0.02)
M("civ_bullBarX", join([beam((-0.45, 0.95, 3.08), (-0.45, 1.6, 3.12), 0.045, 6), beam((0.45, 0.95, 3.08), (0.45, 1.6, 3.12), 0.045, 6)]), "steel", CH, 0.015)
for sx in (-1, 1):
    M(f"civ_hook{sx}", xf(torus(0.07, 0.025, 8, 4), (sx * 0.7, 0.72, 3.12), (0, 0, PI / 2)), "red", CH, 0)
# rear: a bumper step, a hitch with a ball, mud flaps behind the back wheels
M("civ_rearBumper", xf(cbox(2.4, 0.22, 0.3, 0.05), (0, 0.84, -2.7)), "dark", CH, 0.03)
M("civ_hitch", xf(box(0.16, 0.12, 0.4), (0, 0.72, -2.95)), "steel", CH, 0.015)
M("civ_hitchBall", xf(superquad(0.08, 0.08, 0.08, 1, 1, 8, 6), (0, 0.85, -3.08)), "metal", CH, 0)
for sx in (-1, 1):
    M(f"civ_flap{sx}", xf(cbox(0.62, 0.5, 0.04, 0.03), (sx * 1.85, 0.62, -2.76)), "dark", CH, 0.015)

# ---- fenders over the wheels, with a lip, and the fender lights ----
for sx in (-1, 1):
    for sz in (-1, 1):
        cx, cz = sx * WX, sz * WZ
        M(f"civ_fender{sx}{sz}", xf(arch(0.95, 1.04, 0.22, PI - 0.22, 0.84), (cx, WY, cz)), "body", CH, 0.04)
        M(f"civ_fenderLip{sx}{sz}", xf(arch(1.04, 1.08, 0.22, PI - 0.22, 0.12), (cx + sx * 0.36, WY, cz)), "dark", CH, 0)
# side step boards between the wheels, lockers above them, the latches
for sx in (-1, 1):
    M(f"civ_step{sx}", xf(cbox(0.6, 0.07, 1.74, 0.02), (sx * 1.7, 0.74, 0)), "dark", CH, 0.02)
    M(f"civ_stepTread{sx}", join([xf(box(0.5, 0.012, 0.05), (sx * 1.7, 0.78, -0.75 + k * 0.15)) for k in range(11)]), "steel", CH, 0)
    M(f"civ_locker{sx}", xf(cbox(0.34, 0.46, 1.5, 0.04), (sx * 1.58, 1.04, 0)), "steel", CH, 0.03)
    M(f"civ_lockerLid{sx}", xf(box(0.012, 0.36, 0.68), (sx * 1.755, 1.04, -0.37)), "dark", CH, 0)
    M(f"civ_lockerLid2{sx}", xf(box(0.012, 0.36, 0.68), (sx * 1.755, 1.04, 0.37)), "dark", CH, 0)
    M(f"civ_latch{sx}", join([xf(box(0.03, 0.06, 0.1), (sx * 1.772, 1.18, z)) for z in (-0.37, 0.37)]), "metal", CH, 0)

# ---- the cab: a bench seat, a dash, a steering wheel on the left, the roll cage and the solar canopy ----
M("civ_seatBase", xf(cbox(2.3, 0.16, 0.9, 0.03), (0, 1.57, -0.32)), "dark", CH, 0.02)
M("civ_cushion", xf(cbox(2.2, 0.2, 0.82, 0.06), (0, 1.74, -0.3)), "seat", CH, 0.03)
M("civ_seatSeam", xf(box(0.03, 0.012, 0.8), (0, 1.845, -0.3)), "dark", CH, 0)
M("civ_backrest", xf(cbox(2.2, 0.9, 0.18, 0.06), (0, 2.27, -0.74), (-0.16, 0, 0)), "seat", CH, 0.03)
for sx in (-1, 1):
    M(f"civ_headrest{sx}", xf(cbox(0.5, 0.28, 0.14, 0.05), (sx * 0.6, 2.88, -0.86), (-0.16, 0, 0)), "seat", CH, 0.02)
    M(f"civ_headPost{sx}", join([beam((sx * 0.6 + d, 2.66, -0.8), (sx * 0.6 + d, 2.76, -0.82), 0.015, 4) for d in (-0.12, 0.12)]), "metal", CH, 0)
M("civ_dash", xf(cbox(2.5, 0.34, 0.32, 0.06), (0, 2.08, 0.96)), "dark", CH, 0.03)
M("civ_dashScreen", xf(cbox(0.46, 0.22, 0.03, 0.02), (-0.15, 2.12, 0.79), (-0.25, 0, 0)), "glass", CH, 0.01)
M("civ_dashGauges", join([xf(disc_z(0.06, 0.02, 10), (x, 2.13, 0.795)) for x in (0.45, 0.75)]), "lamp", CH, 0)
M("civ_column", beam((0.6, 2.0, 0.82), (0.6, 2.32, 0.42), 0.04, 6), "dark", CH, 0)
M("civ_wheelRim", xf(torus(0.24, 0.04, 16, 6), (0.6, 2.36, 0.38), (PI / 2 - 0.6, 0, 0)), "dark", CH, 0.015)
M("civ_wheelSpoke", xf(box(0.44, 0.04, 0.06), (0.6, 2.36, 0.38), (-0.6, 0, 0)), "dark", CH, 0)
M("civ_joystick", join([beam((-0.6, 1.5, 0.75), (-0.6, 1.98, 0.66), 0.025, 5), xf(superquad(0.05, 0.07, 0.05, 1, 1, 8, 4), (-0.6, 2.0, 0.66))]), "dark", CH, 0)
# roll cage: A-pillars from the dash corners, a rear hoop behind the seat, top rails, a brace
CAGE_Y = 4.0  # the cage top: high enough for the runner (Mule x1.2) to sit under the canopy
LIFT = CAGE_Y - 3.4  # (the searchlight on the canopy goes up with it)
CAGE = []
for sx in (-1, 1):
    CAGE.append(tube([(sx * 1.3, 1.5, 1.05), (sx * 1.24, 2.6, 0.92), (sx * 1.2, 3.3, 0.8), (sx * 1.18, CAGE_Y, 0.72)], [0.065] * 4, 8))
    CAGE.append(tube([(sx * 1.3, 1.5, -0.88), (sx * 1.18, CAGE_Y + 0.02, -0.98)], [0.07] * 2, 8))
    CAGE.append(beam((sx * 1.18, CAGE_Y, 0.72), (sx * 1.18, CAGE_Y + 0.02, -0.98), 0.065, 8))
CAGE.append(beam((-1.18, CAGE_Y, 0.72), (1.18, CAGE_Y, 0.72), 0.065, 8))
CAGE.append(beam((-1.2, CAGE_Y + 0.02, -0.98), (1.2, CAGE_Y + 0.02, -0.98), 0.07, 8))
CAGE.append(beam((-1.25, 2.3, -0.93), (1.25, 2.3, -0.93), 0.055, 8))
CAGE.append(beam((-1.25, 1.55, -0.88), (1.2, CAGE_Y - 0.02, -0.98), 0.05, 6))
CAGE.append(beam((-1.27, 2.15, 0.96), (1.27, 2.15, 0.96), 0.05, 6))
M("civ_cage", join(CAGE), "steel", CH, 0.02)
for sx in (-1, 1):
    M(f"civ_mirrorArm{sx}", beam((sx * 1.24, 2.5, 0.92), (sx * 1.52, 2.55, 0.95), 0.025, 5), "dark", CH, 0)
    M(f"civ_mirror{sx}", xf(cbox(0.2, 0.15, 0.05, 0.03), (sx * 1.6, 2.58, 0.95)), "dark", CH, 0.012)
    M(f"civ_mirrorGlass{sx}", xf(box(0.16, 0.11, 0.01), (sx * 1.6, 2.58, 0.92)), "glass", CH, 0)
# the canopy: a frame on the cage, solar cells in a 4 x 3 grid
M("civ_canopy", xf(cbox(2.6, 0.07, 1.95, 0.025), (0, CAGE_Y + 0.1, -0.12)), "metal", CH, 0.03)
cells = [xf(box(0.6, 0.02, 0.58), (-0.96 + i * 0.64, CAGE_Y + 0.135, -0.74 + j * 0.62)) for i in range(4) for j in range(3)]
M("civ_cells", join(cells), "panel", CH, 0)
M("civ_beacon", join([xf(cyl(0.1, 0.08, 10), (0, CAGE_Y + 0.17, -0.95)), ]), "dark", CH, 0.01)
M("civ_beaconLens", xf(lathe([(0.08, 0), (0.08, 0.1), (0.04, 0.16), (0, 0.17)], 10), (0, CAGE_Y + 0.21, -0.95)), "hot", CH, 0.01)

# ---- the bed: walls, a tailgate, floor slats, cargo strapped down ----
for sx in (-1, 1):
    M(f"civ_bedWall{sx}", xf(cbox(0.08, 0.46, 1.62, 0.02), (sx * 1.37, 1.72, -1.79)), "body", CH, 0.03)
    M(f"civ_bedRail{sx}", beam((sx * 1.37, 1.98, -1.0), (sx * 1.37, 1.98, -2.58), 0.04, 6), "metal", CH, 0)
    M(f"civ_stakes{sx}", join([xf(box(0.1, 0.5, 0.06), (sx * 1.375, 1.73, z)) for z in (-1.3, -1.9, -2.45)]), "dark", CH, 0)
M("civ_tailgate", xf(cbox(2.66, 0.46, 0.08, 0.02), (0, 1.72, -2.57)), "body", CH, 0.03)
M("civ_tailStripe", xf(box(2.2, 0.12, 0.008), (0, 1.75, -2.6135)), "stripe", CH, 0)
M("civ_slats", join([xf(box(0.12, 0.02, 1.55), (x, 1.505, -1.78)) for x in (-1.0, -0.6, -0.2, 0.2, 0.6, 1.0)]), "dark", CH, 0)


def crate(name, c, s, yaw, slot):
    w, h, d = s
    M(name, xf(box(w * 0.94, h * 0.94, d * 0.94), c, (0, yaw, 0)), slot, CH, 0.025)
    edges = []
    for ex in (-1, 1):
        for ez in (-1, 1):
            edges.append(xf(box(0.06, h, 0.06), (ex * (w / 2 - 0.03), 0, ez * (d / 2 - 0.03))))
        for ey in (-1, 1):
            edges.append(xf(box(0.06, 0.06, d), (ex * (w / 2 - 0.03), ey * (h / 2 - 0.03), 0)))
    for ey in (-1, 1):
        for ez in (-1, 1):
            edges.append(xf(box(w, 0.06, 0.06), (0, ey * (h / 2 - 0.03), ez * (d / 2 - 0.03))))
    M(name + "_frame", xf(join(edges), c, (0, yaw, 0)), "dark" if slot != "wood" else "wood", CH, 0)
    if slot == "wood":
        M(name + "_planks", xf(join([xf(box(w * 0.95, 0.02, 0.03), (0, h * 0.94 / 2 + 0.005, -d / 2 + d * k / 3)) for k in (1, 2)]), c, (0, yaw, 0)), "dark", CH, 0)


crate("civ_crateA", (-0.62, 1.88, -1.55), (0.85, 0.75, 0.8), 0.06, "wood")
crate("civ_crateB", (-0.55, 2.55, -1.6), (0.6, 0.55, 0.6), -0.2, "olive")
crate("civ_crateC", (-0.62, 1.82, -2.2), (0.8, 0.62, 0.5), -0.04, "olive")
# a gas tank lying in cradles, with a valve, and a red toolbox
M("civ_tank", xf(lathe([(0, -0.7), (0.2, -0.68), (0.28, -0.6), (0.3, -0.45), (0.3, 0.45), (0.28, 0.6), (0.2, 0.68), (0, 0.7)], 14), (0.62, 1.86, -1.75), (PI / 2, 0, 0)), "white", CH, 0.03)
M("civ_tankBand", join([xf(torus(0.305, 0.02, 14, 4), (0.62, 1.86, z), (PI / 2, 0, 0)) for z in (-1.35, -2.15)]), "stripe", CH, 0)
M("civ_tankValve", join([beam((0.62, 1.86, -2.45), (0.62, 1.86, -2.55), 0.04, 6), xf(torus(0.06, 0.015, 8, 4), (0.62, 1.86, -2.56), (PI / 2, 0, 0))]), "metal", CH, 0)
M("civ_cradles", join([xf(box(0.7, 0.16, 0.1), (0.62, 1.58, z)) for z in (-1.35, -2.15)]), "dark", CH, 0)
M("civ_toolbox", xf(cbox(0.42, 0.26, 0.7, 0.04), (0.62, 2.29, -1.75), (0, 0.0, 0)), "red", CH, 0.02)
M("civ_toolboxLid", xf(box(0.3, 0.03, 0.04), (0.62, 2.44, -1.75)), "dark", CH, 0)
# ratchet straps over the cargo, from rail to rail
straps = []
for z in (-1.45, -2.15):
    straps.append(tube([(-1.37, 1.98, z), (-1.05, 2.86 if z > -2 else 2.16, z), (-0.2, 2.86 if z > -2 else 2.16, z), (0.15, 2.2, z), (0.9, 2.2, z), (1.37, 1.98, z)], [0.02] * 6, 4))
M("civ_straps", join(straps), "stripe", CH, 0)
# spare wheel on the tailgate
M("civ_spare", xf(torus(0.42, 0.18, 18, 8), (0, 1.62, -2.82), (PI / 2, 0, 0)), "tire", CH, 0.03)
M("civ_spareHub", xf(disc_z(0.3, 0.12, 12), (0, 1.62, -2.82)), "metal", CH, 0)
M("civ_spareBracket", xf(box(0.12, 0.5, 0.2), (0, 1.62, -2.68)), "dark", CH, 0)
# the umbrella dish on its mast at the bed's front right corner, and the flag pole at the left back corner
DISH = (1.24, 3.0, -2.3)  # on the bed's back right corner, in line with the flag pole across the back
DISH_R = (0.75, PI / 2, 0)  # tilted up 0.75 rad and turned to face out over the right side
M("civ_mast", beam((DISH[0], 1.5, DISH[2]), (DISH[0], DISH[1] - 0.02, DISH[2]), 0.04, 6), "dark", CH, 0.01)
dish = lathe([(0, 0), (0.12, 0.01), (0.3, 0.06), (0.46, 0.15), (0.44, 0.17), (0.28, 0.09), (0.12, 0.04), (0, 0.03)], 16)
M("civ_dish", xf(dish, DISH, DISH_R, (0.8, 0.8, 0.8)), "white", CH, 0.02)
M("civ_dishFeed", xf(beam((0, 0.03, 0), (0, 0.32, 0), 0.015, 4), DISH, DISH_R), "dark", CH, 0)
M("civ_dishHorn", xf(xf(cyl(0.035, 0.06, 8), (0, 0.34, 0)), DISH, DISH_R), "dark", CH, 0)
flag_pole("civ", CH, (-1.24, 1.5, -2.3), (-1.24, 5.1 + LIFT, -2.3))

# ---- the gun pivot: a searchlight on a post through the canopy ----
G = pivot("civil_gun", (0, 3.0, 0.8), CH, role="gun")
M("civ_lightPost", beam((0, 0.4 + LIFT, 0), (0, 0.78 + LIFT, 0), 0.05, 8), "dark", G, 0.015)
M("civ_lightYoke", join([beam((-0.3, 0.78 + LIFT, 0), (0.3, 0.78 + LIFT, 0), 0.04, 6), beam((-0.3, 0.78 + LIFT, 0), (-0.3, 0.98 + LIFT, 0), 0.04, 6), beam((0.3, 0.78 + LIFT, 0), (0.3, 0.98 + LIFT, 0), 0.04, 6)]), "dark", G, 0.015)
M("civ_lightBody", xf(lathe([(0, -0.24), (0.14, -0.24), (0.2, -0.16), (0.24, 0.1), (0.25, 0.22), (0, 0.22)], 14), (0, 0.98 + LIFT, 0), (PI / 2, 0, 0)), "white", G, 0.03)
M("civ_lightLens", xf(disc_z(0.22, 0.03, 14), (0, 0.98 + LIFT, 0.225)), "lamp", G, 0)
M("civ_lightRing", xf(torus(0.235, 0.025, 14, 4), (0, 0.98 + LIFT, 0.23), (PI / 2, 0, 0)), "dark", G, 0)

for i, (sx, sz) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1))):
    wheel("civ", R, i, sx, sz, False)


# ======================================================================================
# MILITARY PATROL CAR
# ======================================================================================

R2 = pivot("rover_military", (0, 0, 0), None)
R2["radius"] = 3.2
CH = pivot("military_chassis", (0, 0, 0), R2, role="chassis")
running_gear("mil", CH)


def hull_sect(xb, xh, ys, xt, yt, yb, yk=0.22):
    return [(-xb, yb), (xb, yb), (xh, yb + yk), (xh, ys), (xt, yt), (-xt, yt), (-xh, ys), (-xh, yb + yk)]


ROOF, WS0, WS1 = 2.5, 1.15, 1.85  # roof height; the windscreen runs from z WS0 (roof) down to WS1 (hood)
HULL = [
    (-2.78, hull_sect(1.12, 1.4, 1.55, 1.12, 2.12, 0.72)),
    (-2.45, hull_sect(1.2, 1.48, 1.72, 1.2, ROOF - 0.04, 0.66)),
    (-2.2, hull_sect(1.2, 1.48, 1.75, 1.2, ROOF, 0.66)),
    (WS0, hull_sect(1.2, 1.48, 1.75, 1.2, ROOF, 0.66)),
    (WS1, hull_sect(1.2, 1.48, 1.66, 1.24, 1.86, 0.66)),
    (2.6, hull_sect(1.1, 1.46, 1.5, 1.25, 1.64, 0.66)),
    (3.0, hull_sect(0.95, 1.3, 1.16, 1.1, 1.32, 0.8, 0.18)),
]
M("mil_hull", prism(HULL), "body", CH, 0.08)

# windscreen: two armoured panes on the rake, a centre post; shoulder windows; vision blocks at the back
ws_len = math.hypot(ROOF - 1.86, WS1 - WS0)
ws_a = math.atan2(ROOF - 1.86, WS1 - WS0)
ws_n = (0, math.cos(ws_a), math.sin(ws_a))
ws_c = (0, (ROOF + 1.86) / 2, (WS0 + WS1) / 2)
for x in (-0.56, 0.56):
    M(f"mil_wind{x}", xf(box(0.98, 0.02, ws_len * 0.78), (x, ws_c[1] + ws_n[1] * 0.008, ws_c[2] + ws_n[2] * 0.008), (ws_a, 0, 0)), "glass", CH, 0.012)
M("mil_windPost", xf(box(0.1, 0.03, ws_len * 0.9), (0, ws_c[1] + ws_n[1] * 0.01, ws_c[2] + ws_n[2] * 0.01), (ws_a, 0, 0)), "dark", CH, 0.01)
# the wipers, parked along the bottom of each pane
ws_d = (0, -math.sin(ws_a), math.cos(ws_a))  # down the rake
M("mil_wiper", join([xf(box(0.7, 0.02, 0.035), (x, ws_c[1] + ws_d[1] * 0.3 + ws_n[1] * 0.025, ws_c[2] + ws_d[2] * 0.3 + ws_n[2] * 0.025), (ws_a, 0.08, 0), order="YXZ") for x in (-0.52, 0.6)]), "dark", CH, 0.008)
sh_a = math.atan2(1.48 - 1.2, ROOF - 1.75)  # shoulder slope (from vertical)
sh_c = ((1.48 + 1.2) / 2, (1.75 + ROOF) / 2)
sh_len = math.hypot(1.48 - 1.2, ROOF - 1.75)
for sx in (-1, 1):
    nx, ny = sx * math.cos(sh_a), math.sin(sh_a)
    for k, (z0, z1) in enumerate(((0.12, 1.05), (-1.1, -0.05))):
        M(f"mil_side{sx}{k}", xf(box(0.02, sh_len * 0.62, z1 - z0), (sx * sh_c[0] + nx * 0.008, sh_c[1] + ny * 0.008, (z0 + z1) / 2), (0, 0, sx * sh_a)), "glass", CH, 0.012)
    M(f"mil_vision{sx}", xf(box(0.02, sh_len * 0.4, 0.3), (sx * sh_c[0] + nx * 0.008, sh_c[1] + ny * 0.008, -1.9), (0, 0, sx * sh_a)), "glass", CH, 0.01)
# door seams and handles on the flanks, the faction stripe
for sx in (-1, 1):
    x = sx * 1.4835
    seams = [xf(box(0.008, 0.74, 0.03), (x, 1.145, z)) for z in (1.15, 0.0, -1.2)]  # (stopping under the stripe)
    seams.append(xf(box(0.008, 0.03, 2.35), (x, 0.9, -0.025)))
    M(f"mil_seams{sx}", join(seams), "dark", CH, 0)
    M(f"mil_handles{sx}", join([xf(cbox(0.04, 0.05, 0.22, 0.015), (sx * 1.5, 1.45, z)) for z in (0.8, -0.4)]), "metal", CH, 0.008)
    M(f"mil_stripe{sx}", xf(box(0.008, 0.14, 4.9), (sx * 1.4835, 1.6, 0.1)), "stripe", CH, 0)
    M(f"mil_hingeSet{sx}", join([xf(box(0.03, 0.12, 0.06), (sx * 1.495, y, z)) for z in (1.08, -0.08) for y in (0.98, 1.36)]), "dark", CH, 0)
# a chevron on the hood in the stripe colour, laid on its slope
hood_a = math.atan2(1.86 - 1.64, 2.6 - WS1)
for sx in (-1, 1):
    M(f"mil_chevron{sx}", xf(box(0.14, 0.016, 0.4), (sx * 0.26, 1.86 - (2.38 - WS1) * math.tan(hood_a) - 0.002, 2.38), (hood_a, sx * 0.6, 0), order="YXZ"), "stripe", CH, 0)
# hood louvres and a bolted access plate
M("mil_louvres", join([xf(box(0.9, 0.025, 0.04), (0, 1.86 - (1.93 + k * 0.06 - WS1) * math.tan(hood_a) + 0.005, 1.93 + k * 0.06), (hood_a, 0, 0)) for k in range(4)]), "dark", CH, 0)
# heavy arches with a lip, bolted armour skirts between them
for sx in (-1, 1):
    for sz in (-1, 1):
        cx, cz = sx * WX, sz * WZ
        M(f"mil_arch{sx}{sz}", xf(arch(0.96, 1.08, 0.2, PI - 0.2, 0.9), (cx, WY, cz)), "dark", CH, 0.05)
        M(f"mil_archLip{sx}{sz}", xf(arch(1.08, 1.14, 0.2, PI - 0.2, 0.16), (cx + sx * 0.39, WY, cz)), "steel", CH, 0)
    M(f"mil_skirt{sx}", xf(cbox(0.14, 0.6, 1.82, 0.04), (sx * 1.56, 1.03, 0)), "body", CH, 0.035)
    M(f"mil_skirtBolts{sx}", bolts([(sx * 1.635, y, z) for y in (0.8, 1.26) for z in (-0.75, -0.25, 0.25, 0.75)], 0.03, "x"), "metal", CH, 0)
    M(f"mil_skirtStripe{sx}", xf(box(0.016, 0.1, 1.7), (sx * 1.632, 1.03, 0)), "stripe", CH, 0)
# the nose: a push bar with a winch, caged lamps, tow hooks, a number plate
M("mil_pushBar", xf(cbox(2.8, 0.32, 0.3, 0.06), (0, 0.84, 3.12)), "dark", CH, 0.035)
M("mil_pushPosts", join([xf(cbox(0.16, 0.7, 0.16, 0.04), (x, 1.2, 3.12)) for x in (-0.95, 0.95)]), "dark", CH, 0.025)
M("mil_pushTop", beam((-0.95, 1.52, 3.12), (0.95, 1.52, 3.12), 0.06, 8), "dark", CH, 0.02)
M("mil_winch", xf(disc_x(0.13, 0.7, 12), (0, 0.84, 3.3)), "steel", CH, 0.02)
M("mil_winchHook", xf(torus(0.06, 0.022, 8, 4), (0, 0.72, 3.42), (0, 0, PI / 2)), "red", CH, 0)
for sx in (-1, 1):
    M(f"mil_lampBox{sx}", xf(cbox(0.42, 0.26, 0.12, 0.04), (sx * 0.72, 1.22, 3.01)), "dark", CH, 0.015)
    M(f"mil_lamp{sx}", xf(box(0.36, 0.2, 0.02), (sx * 0.72, 1.22, 3.075)), "lamp", CH, 0)
    M(f"mil_lampCage{sx}", join([xf(box(0.025, 0.24, 0.025), (sx * 0.72 + d, 1.22, 3.1)) for d in (-0.12, 0.0, 0.12)]), "steel", CH, 0)
    M(f"mil_marker{sx}", xf(cbox(0.14, 0.08, 0.03, 0.02), (sx * 1.12, 1.18, 3.025)), "hot", CH, 0.008)
    M(f"mil_hook{sx}", xf(torus(0.07, 0.025, 8, 4), (sx * 1.25, 0.72, 3.28), (0, 0, PI / 2)), "red", CH, 0)
M("mil_plate", xf(box(0.5, 0.14, 0.02), (0, 1.02, 3.02)), "white", CH, 0)
# roof: the turret's ring seat, two hatches, the light bar, grab rails, smoke launchers
M("mil_ringSeat", xf(cyl(0.64, 0.08, 20), (0, ROOF + 0.03, 0.8)), "dark", CH, 0.02)
for k, z in enumerate((-0.75, -1.65)):
    M(f"mil_hatch{k}", xf(cyl(0.34, 0.08, 14), (0, ROOF + 0.03, z)), "body", CH, 0.02)
    M(f"mil_hatchRim{k}", xf(torus(0.35, 0.03, 14, 4), (0, ROOF + 0.04, z)), "dark", CH, 0)
    M(f"mil_hatchGrip{k}", tube([(-0.12, ROOF + 0.07, z), (-0.12, ROOF + 0.13, z), (0.12, ROOF + 0.13, z), (0.12, ROOF + 0.07, z)], [0.018] * 4, 4), "metal", CH, 0)
M("mil_lightBarBase", xf(cbox(1.5, 0.1, 0.24, 0.03), (0, ROOF + 0.05, 0.02)), "dark", CH, 0.02)
for x in (-0.48, 0.48):
    M(f"mil_lightBarLens{x}", xf(cbox(0.56, 0.12, 0.2, 0.05), (x, ROOF + 0.15, 0.02)), "lens", CH, 0.012)
M("mil_lightBarMid", xf(cbox(0.32, 0.1, 0.2, 0.03), (0, ROOF + 0.14, 0.02)), "lamp", CH, 0.012)
for sx in (-1, 1):
    M(f"mil_grab{sx}", tube([(sx * 1.08, ROOF, 0.6), (sx * 1.08, ROOF + 0.1, 0.5), (sx * 1.08, ROOF + 0.1, -1.9), (sx * 1.08, ROOF, -2.0)], [0.025] * 4, 5), "metal", CH, 0.008)
    M(f"mil_smokeBlock{sx}", xf(cbox(0.36, 0.14, 0.32, 0.03), (sx * 0.98, ROOF + 0.07, 1.0)), "dark", CH, 0.015)
    tubes = [xf(lathe([(0.065, 0), (0.065, 0.3), (0.055, 0.3), (0.055, 0.04), (0, 0.04)], 8), (sx * (0.86 + k * 0.12), ROOF + 0.12, 1.0), (0.9, 0, -sx * 0.3)) for k in range(3)]
    M(f"mil_smoke{sx}", join(tubes), "olive", CH, 0.012)
    M(f"mil_mirrorArm{sx}", beam((sx * 1.46, 1.72, 1.55), (sx * 1.72, 1.9, 1.62), 0.025, 5), "dark", CH, 0)
    M(f"mil_mirror{sx}", xf(cbox(0.1, 0.26, 0.16, 0.03), (sx * 1.78, 1.92, 1.62)), "dark", CH, 0.012)
# the back: a rear door with a spare on a swing carrier, tail lights, jerry cans, a ladder, an exhaust stack
REAR_Z = -2.78
M("mil_doorSeam", join([xf(box(0.03, 1.15, 0.008), (x, 1.32, REAR_Z - 0.004)) for x in (-0.55, 0.55)] + [xf(box(1.1, 0.03, 0.008), (0, 1.9, REAR_Z - 0.004))]), "dark", CH, 0)
M("mil_spareArm", join([xf(box(0.12, 0.12, 0.3), (0.2, 1.32, REAR_Z - 0.12)), beam((-0.45, 1.6, REAR_Z - 0.08), (0.45, 1.6, REAR_Z - 0.08), 0.04, 6)]), "dark", CH, 0.01)
M("mil_spare", xf(torus(0.44, 0.2, 18, 8), (0.2, 1.32, REAR_Z - 0.38), (PI / 2, 0, 0)), "tire", CH, 0.03)
M("mil_spareRim", xf(disc_z(0.32, 0.14, 14), (0.2, 1.32, REAR_Z - 0.38)), "steel", CH, 0)
M("mil_spareCover", xf(disc_z(0.22, 0.04, 12), (0.2, 1.32, REAR_Z - 0.46)), "stripe", CH, 0)
for sx in (-1, 1):
    M(f"mil_tail{sx}", xf(cbox(0.22, 0.32, 0.04, 0.03), (sx * 1.18, 1.25, REAR_Z - 0.01)), "tail", CH, 0.008)
    M(f"mil_tailGuard{sx}", join([xf(box(0.24, 0.025, 0.025), (sx * 1.18, 1.25 + d, REAR_Z - 0.06)) for d in (-0.08, 0.08)]), "steel", CH, 0)
M("mil_rearBumper", xf(cbox(2.6, 0.26, 0.28, 0.05), (0, 0.84, -2.95)), "dark", CH, 0.03)
M("mil_pintle", join([xf(box(0.18, 0.14, 0.24), (0, 0.84, -3.15)), xf(torus(0.08, 0.025, 8, 4), (0, 0.84, -3.3))]), "steel", CH, 0.01)
# jerry cans in a rack on the left of the door, a ladder on the right
M("mil_canA", xf(cbox(0.36, 0.5, 0.16, 0.05), (-0.88, 1.32, REAR_Z - 0.12)), "olive", CH, 0.02)
M("mil_canHandle", join([xf(box(0.2, 0.04, 0.05), (-0.88, 1.6, REAR_Z - 0.12)), xf(box(0.04, 0.12, 0.05), (-0.75, 1.55, REAR_Z - 0.12))]), "olive", CH, 0)
M("mil_canStrap", xf(box(0.4, 0.05, 0.18), (-0.88, 1.3, REAR_Z - 0.12)), "dark", CH, 0)
M("mil_ladder", join([beam((x, 0.75, REAR_Z - 0.08), (x, 2.1, REAR_Z - 0.04), 0.025, 5) for x in (0.95, 1.25)] +
                     [beam((0.95, y, REAR_Z - 0.07), (1.25, y, REAR_Z - 0.07), 0.02, 4) for y in (0.95, 1.25, 1.55, 1.85)]), "metal", CH, 0.008)
M("mil_exhaust", tube([(-1.38, 1.0, -2.55), (-1.52, 1.2, -2.55), (-1.52, 2.55, -2.55)], [0.07, 0.07, 0.07], 8), "steel", CH, 0.015)
M("mil_exhaustCap", xf(cyl(0.085, 0.12, 8), (-1.52, 2.6, -2.55)), "dark", CH, 0)
M("mil_exhaustGuard", xf(cbox(0.06, 0.6, 0.2, 0.02), (-1.6, 2.0, -2.55)), "dark", CH, 0)
# antennas: two whips on bases at the back of the roof (each pivots at its base), and the flag pole
for k, (x, z, h) in enumerate(((1.0, -2.05, 2.3), (0.72, -2.3, 1.7))):
    y0 = ROOF - 0.04 if z > -2.2 else ROOF - 0.1
    M(f"mil_antBase{k}", xf(cyl(0.07, 0.14, 8, 0.09), (x, y0 + 0.05, z)), "dark", CH, 0.01)
    A = pivot(f"military_antenna{k}", (x, y0 + 0.12, z), CH, role="antenna")
    M(f"mil_antSpring{k}", xf(cyl(0.035, 0.16, 6), (0, 0.08, 0)), "metal", A, 0)
    M(f"mil_whip{k}", tube([(0, 0.15, 0), (0, h, 0)], [0.022, 0.01], 4), "dark", A, 0.008)
    M(f"mil_whipTip{k}", xf(superquad(0.03, 0.03, 0.03, 1, 1, 6, 4), (0, h, 0)), "dark", A, 0)
flag_pole("mil", CH, (-1.12, 2.0, -2.35), (-1.12, 5.1, -2.35))

# ---- the gun pivot: a remote weapon station on a ring ----
G = pivot("military_gun", (0, 3.0, 0.8), CH, role="gun")
M("mil_ring", xf(cyl(0.56, 0.16, 20), (0, -0.4, 0)), "steel", G, 0.025)
M("mil_ringBolts", bolts([(math.sin(2 * PI * k / 12) * 0.5, -0.31, math.cos(2 * PI * k / 12) * 0.5) for k in range(12)], 0.025), "dark", G, 0)
M("mil_cradle", xf(prism([(-0.45, oct_pts(0.78, 0.5, 0.1)), (0.25, oct_pts(0.78, 0.5, 0.1)), (0.5, oct_pts(0.6, 0.36, 0.08))]), (0, -0.07, 0)), "body", G, 0.04)
M("mil_cradleStripe", xf(box(0.792, 0.08, 0.2), (0, 0.05, -0.2)), "stripe", G, 0)
M("mil_jacket", xf(lathe([(0.11, 0), (0.11, 0.62), (0.09, 0.66), (0, 0.66)], 10), (0, -0.04, 0.42), (PI / 2, 0, 0)), "dark", G, 0.02)
M("mil_barrel", beam((0, -0.04, 0.9), (0, -0.04, 2.0), 0.055, 8), "dark", G, 0.02)
M("mil_brake", xf(lathe([(0.085, 0), (0.085, 0.2), (0.06, 0.22), (0, 0.22)], 8), (0, -0.04, 1.95), (PI / 2, 0, 0)), "steel", G, 0.015)
M("mil_brakePorts", join([xf(box(0.18, 0.02, 0.04), (0, -0.04 + d, 2.05)) for d in (-0.05, 0.05)]), "dark", G, 0)
M("mil_ammo", xf(cbox(0.24, 0.32, 0.5, 0.03), (-0.52, -0.05, -0.05)), "olive", G, 0.02)
M("mil_ammoFeed", tube([(-0.4, 0.05, 0.05), (-0.25, 0.1, 0.2), (-0.1, 0.06, 0.35)], [0.04, 0.04, 0.04], 5), "dark", G, 0)
M("mil_sensor", xf(cbox(0.26, 0.28, 0.36, 0.04), (0.53, 0.0, 0.02)), "steel", G, 0.02)
M("mil_sensorLens", join([xf(disc_z(0.07, 0.03, 10), (0.53, 0.05, 0.2)), xf(box(0.16, 0.06, 0.02), (0.53, -0.07, 0.2))]), "glass", G, 0)
M("mil_sensorHood", xf(box(0.28, 0.025, 0.12), (0.53, 0.155, 0.22)), "dark", G, 0)
M("mil_rwsAntenna", tube([(-0.25, 0.18, -0.35), (-0.25, 0.9, -0.38)], [0.015, 0.008], 4), "dark", G, 0)

for i, (sx, sz) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1))):
    wheel("mil", R2, i, sx, sz, True)

print("built", len(C.objects), "objects")
audit_coplanar()

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
