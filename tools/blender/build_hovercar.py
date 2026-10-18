# Hover-car builder for Blender (4.2+ / 5.x): the smallest road vehicle, two cars from one body style -> src/assets/hovercar.glb.
# In Blender's Python console or via MCP:
#   exec(open(r"<repo>/tools/blender/build_hovercar.py").read())
# Headless:  MOONRUNNER_REPO=<repo> python3 tools/blender/build_hovercar.py   (needs `pip install bpy`)
#
#   car_faction   FACTION car: low sharp hull in faction livery, spine racing stripe, swept tail fins, flush underside. Only SPACECOM's has a roof
#                 light bar (the `livery_spacecom` pivot, extra `faction`: the game keeps only the matching one). No emblems.
#   car_civilian  CIVILIAN car: same hull, rounder and a hand taller: big glass bubble, chrome side bumpers, one oval headlamp on the nose cone,
#                 a longer trunk with a side-on rack and luggage pod, a soft swoosh instead of a stripe, stubby tail fins.
#
# Faction car ~6.7 m long, civilian 6.9 m (trunk 0.4 m longer), both 3.9 m over the pods; three.js axes (x right, y up, +z nose), centred on the hull's middle.
# - Pivot roles: lift (hover-pad glow under each corner, breathes), beacon (faction roof lamps, blink; extra `phase`), livery (above). The rest is static.
# - Each mesh has ONE material named after a slot (body, roof, stripe, trim, dark, glass, lamp, tail, lift, beaconA, beaconB); the game swaps in
#   toon / glow materials per slot (faction: LAND_TRAIN_FACTIONS-style palette; civilian: CAR_PAINTS). Custom property "ink" = outline thickness in m (0 = none).

import bpy, math, os

def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_hovercar.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("HOVERCAR_OUT") or os.path.join(REPO, "src", "assets", "hovercar.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Hover-car export ->", OUT)
COLL = "MoonHovercar"

# preview colours only (SPACECOM livery on the faction car, a pink two-tone on the civilian one)
SLOT_COLORS = {
    "body": (0.95, 0.93, 0.86), "roof": (1.0, 0.96, 0.88), "stripe": (1.0, 0.82, 0.25), "trim": (0.54, 0.53, 0.63),
    "dark": (0.16, 0.14, 0.25), "glass": (0.61, 0.9, 1.0), "lamp": (1.0, 0.96, 0.66), "tail": (1.0, 0.16, 0.29),
    "lift": (0.5, 0.9, 1.0), "beaconA": (1.0, 0.2, 0.25), "beaconB": (0.2, 0.5, 1.0),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
W_POD = 1.6     # pod distance from the centreline: 3.9 m over the pods with their width


# ---------------- hull surface: mounted parts are placed from these so nothing floats or clips ----------------
def sec_at(S, z):
    """Loft section at z (linear between sections, like the faces)."""
    z = max(S[0]["z"], min(S[-1]["z"], z))
    for a, b in zip(S, S[1:]):
        if a["z"] <= z <= b["z"]:
            f = (z - a["z"]) / (b["z"] - a["z"]) if b["z"] != a["z"] else 0.0
            lerp = lambda k, d=0.0: a.get(k, d) + (b.get(k, d) - a.get(k, d)) * f
            return {"w": lerp("w"), "t": lerp("t"), "b": lerp("b"), "yc": lerp("yc"), "eT": lerp("eT", 2.5), "eB": lerp("eB", 2.5)}
    return dict(S[-1])


def top_y(S, x, z):
    """Loft upper-surface height at (x, z); None outside."""
    s = sec_at(S, z)
    r = abs(x) / s["w"]
    return None if r >= 1 else s["yc"] + s["t"] * (1 - r ** s["eT"]) ** (1 / s["eT"])


def bot_y(S, x, z):
    s = sec_at(S, z)
    r = abs(x) / s["w"]
    return None if r >= 1 else s["yc"] - s["b"] * (1 - r ** s["eB"]) ** (1 / s["eB"])


def side_x(S, y, z):
    """Loft half-width at height y, station z (None above or below)."""
    s = sec_at(S, z)
    up = y >= s["yc"]
    h, e = (s["t"], s["eT"]) if up else (s["b"], s["eB"])
    r = abs(y - s["yc"]) / h
    return None if r >= 1 else s["w"] * (1 - r ** e) ** (1 / e)


def flank(S, side, y, z, d=0.04):
    """Flank point (side = +/-1) at height y, station z, and the yaw turning a part's +z face to the outward normal."""
    X = side_x(S, y, z)
    slope = (side_x(S, y, z + d) - side_x(S, y, z - d)) / (2 * d)
    return (side * X, y, z), math.atan2(side, -slope)


def mount(p, yaw, depth):
    """Sink a part's centre `depth` into the surface along its normal (half-buried, never hovering)."""
    nx, nz = math.sin(yaw), math.cos(yaw)
    return (p[0] - nx * depth, p[1], p[2] - nz * depth)


HULL_F, HULL_C = None, None


def hull_sections(civ):
    """The shared hull, a flattened capsule. The civilian's is a little taller, blunter at the nose and 0.4 m longer behind the cabin
    (a trunk deck for the rack)."""
    k = 1.12 if civ else 1.0
    nose = 3.1 if civ else 3.25
    rear = [(-3.65, 0.5, 0.26, 0.24), (-3.25, 1.05, 0.52, 0.4), (-2.2, 1.4, 0.64, 0.5)] if civ else [(-3.25, 0.5, 0.26, 0.24), (-2.85, 1.05, 0.52, 0.4), (-1.8, 1.4, 0.64, 0.5)]
    return [{"z": z, "w": w, "t": t * k, "b": b, "eT": 2.4, "eB": 2.6} for z, w, t, b in rear] + [
        {"z": 0.0, "w": 1.5, "t": 0.68 * k, "b": 0.52, "eT": 2.4, "eB": 2.6},
        {"z": 1.6, "w": 1.36, "t": 0.58 * k, "b": 0.47, "eT": 2.4, "eB": 2.6},
        {"z": nose - 0.5, "w": 0.95 if civ else 0.88, "t": 0.42 * k, "b": 0.34, "eT": 2.4, "eB": 2.6},
        {"z": nose, "w": 0.42 if civ else 0.3, "t": 0.22 * k, "b": 0.2, "eT": 2.4, "eB": 2.6},
    ]


HULL_F, HULL_C = hull_sections(False), hull_sections(True)


def build_pods(R, civ, H):
    """Side pods, struts, belly pan, four hover pads on stems: shared, dressed differently."""
    pod = [
        {"z": -2.45, "w": 0.26, "t": 0.22, "b": 0.22},
        {"z": -2.0, "w": 0.34, "t": 0.29, "b": 0.27},
        {"z": 1.1, "w": 0.34, "t": 0.29, "b": 0.27},
        {"z": 2.2, "w": 0.23, "t": 0.19, "b": 0.21},
    ]
    for side in (-1, 1):
        tag = "LR"[side > 0]
        at = (side * W_POD, -0.52, -0.1)
        mesh(f"pod{tag}", xf(loft(pod, 20), at), "trim" if civ else "body", R, 0.04)
        if not civ:  # (faction pods: body colour with a livery band)
            mesh(f"podBand{tag}", xf(loft([{"z": -1.3, "w": 0.36, "t": 0.31, "b": 0.29}, {"z": -0.85, "w": 0.36, "t": 0.31, "b": 0.29}], 20, False, False), at), "stripe", R, 0)
        # dark intake collar at the pod nose, vent at its tail
        mesh(f"podIntake{tag}", xf(loft([{"z": 1.3, "w": 0.355, "t": 0.305, "b": 0.285}, {"z": 1.62, "w": 0.34, "t": 0.29, "b": 0.27}], 20, False, False), at), "dark", R, 0)
        mesh(f"podVent{tag}", xf(lathe([(0, 0), (0.16, 0), (0.16, 0.08), (0, 0.08)], 12), (side * W_POD, -0.52, -2.5), (-PI / 2, 0, 0)), "lift" if civ else "tail", R, 0)
        # two struts per pod, from inside the hull wall to inside the pod
        for z in (-1.3, 1.0):
            xh = side_x(H, -0.34, z)          # hull flank at strut height
            x0, x1 = xh - 0.1, side * 0 + W_POD - 0.12
            mesh(f"strut{tag}{z}", xf(rbox((x1 - x0) / 2 + 0.02, 0.06, 0.2, 0.3, 8, 4), (side * (x0 + x1) / 2, -0.4, z)), "dark", R, 0.02)
    # underside: dark skin cut from the hull bottom (follows its contour, can't overhang), four hover pads hung from it on stems
    mesh("belly", keep(loft(grow(H, 0.02), 40, False, False), lambda c: c[1] < -0.5 * sec_at(H, c[2])["b"] and abs(c[0]) < 0.8), "dark", R, 0.02)
    for i, (x, z) in enumerate([(-1.0, 1.7), (1.0, 1.7), (-1.0, -1.7), (1.0, -1.7)]):
        yb = bot_y(H, x, z)
        mesh(f"lift{i}_stem", B((x, yb + 0.06, z), (x, -0.84, z), 0.09, 8, True), "dark", R, 0.015)
        P = pivot(f"lift{i}", (x, -0.9, z), R, role="lift")
        mesh(f"lift{i}_pad", xf(lathe([(0, 0), (0.34, 0), (0.34, 0.05), (0, 0.05)], 16)), "lift", P, 0)
        mesh(f"lift{i}_ring", xf(torus(0.36, 0.045, 16, 5), (0, 0.04, 0)), "trim", P, 0)


def build_faction(R):
    H = HULL_F
    mesh("hull", loft(H, 40), "body", R, 0.07)
    # livery spine stripe, chine line down each flank
    mesh("spine", keep(loft(grow(H, 0.02), 40, False, False), lambda c: abs(c[0]) < 0.2 and c[1] > 0.3), "stripe", R, 0)
    mesh("chine", keep(loft(grow(H, 0.025), 40, False, False), lambda c: abs(c[1] + 0.02) < 0.06 and abs(c[0]) > 0.5), "stripe", R, 0)
    # low tinted teardrop canopy, flat base inside the hull (rim buried)
    cano = [
        {"z": -1.5, "w": 0.55, "t": 0.2, "b": 0.0, "yc": 0.5, "eT": 2.6},
        {"z": -0.9, "w": 0.95, "t": 0.6, "b": 0.0, "yc": 0.5, "eT": 2.6},
        {"z": 0.3, "w": 1.0, "t": 0.66, "b": 0.0, "yc": 0.5, "eT": 2.6},
        {"z": 1.2, "w": 0.82, "t": 0.5, "b": 0.0, "yc": 0.5, "eT": 2.6},
        {"z": 1.75, "w": 0.4, "t": 0.22, "b": 0.0, "yc": 0.5, "eT": 2.6},
    ]
    mesh("canopy", loft(cano, 28), "glass", R, 0.04)
    # hood vents on the hood slope
    for sx in (-1, 1):
        x, z = sx * 0.4, 2.15
        y = top_y(H, x, z) - 0.012
        slope = (top_y(H, x, z + 0.1) - top_y(H, x, z - 0.1)) / 0.2
        mesh(f"vent{sx}", xf(rbox(0.09, 0.025, 0.28, 0.3, 8, 4), (x, y, z), (-math.atan(slope), 0, 0)), "dark", R, 0)
    # nose and tail flank lamps, on the surface, turned to its normal, half buried. Headlamp above the chine stripe in a dark housing (reads
    # on any trim colour); tail lamp a slit on the tail flank
    for sx in (-1, 1):
        p, yaw = flank(H, sx, 0.16, 2.86)
        mesh(f"headHousing{sx}", xf(rbox(0.14, 0.055, 0.05, 0.3, 8, 4), mount(p, yaw, 0.01), (0, yaw, 0)), "dark", R, 0.012)
        mesh(f"head{sx}", xf(rbox(0.1, 0.032, 0.035, 0.4, 8, 4), mount(p, yaw, -0.022), (0, yaw, 0)), "lamp", R, 0)
        p, yaw = flank(H, sx, 0.15, -3.0)
        mesh(f"tail{sx}", xf(rbox(0.2, 0.045, 0.06, 0.4, 8, 4), mount(p, yaw, 0.03), (0, yaw, 0)), "tail", R, 0)
    # brake bar across the deck tail, number plate on the tail face
    yb = top_y(H, 0, -2.78)
    mesh("brake", xf(rbox(0.38, 0.025, 0.04, 0.4, 8, 4), (0, yb - 0.01, -2.78)), "tail", R, 0)
    yt = (top_y(H, 0, -3.2) + bot_y(H, 0, -3.2)) / 2
    mesh("plate", xf(rbox(0.28, 0.1, 0.04, 0.3, 6, 4), (0, yt, -3.2)), "trim", R, 0.012)
    # swept tail fins: a slab each side of the spine, foot buried in the deck, livery tip a thicker cap of the same outline
    for sx in (-1, 1):
        x, z0 = sx * 0.72, -2.5
        yb = min(top_y(H, abs(x), -2.05), top_y(H, abs(x), -2.95)) - 0.08
        outline = [(0.42, 0.0), (-0.42, 0.0), (-0.6, 0.66), (-0.12, 0.66)]
        tip = [(-0.5, 0.5), (-0.0, 0.5), (-0.12, 0.66), (-0.6, 0.66)]
        t = (x, yb, z0)
        r = (0, 0, sx * -0.2)
        mesh(f"fin{sx}", xf(extrude(outline, 0.06, "x"), t, r), "body", R, 0.03)
        mesh(f"finTip{sx}", xf(extrude(tip, 0.075, "x"), t, r), "stripe", R, 0)
    # SPACECOM roof light bar on the canopy, under the spacecom `livery` pivot so only that car has it (two alternating lamps: role
    # beacon, extra phase)
    LS = pivot("livery_spacecom", (0, 0, 0), R, role="livery", faction="spacecom")
    yc = top_y(cano, 0, 0.35)
    mesh("barBase", xf(rbox(0.5, 0.06, 0.12, 0.3, 8, 4), (0, yc, 0.35)), "dark", LS, 0.02)
    for sx, slot in ((-1, "beaconA"), (1, "beaconB")):
        B_ = pivot(f"beacon{sx}", (sx * 0.27, yc + 0.07, 0.35), LS, role="beacon", phase=0 if sx < 0 else 1)
        mesh(f"beacon{sx}_lens", xf(superquad(0.2, 0.08, 0.09, 0.8, 0.8, 10, 6)), slot, B_, 0)
    # whip antenna on a small base in the rear deck
    ax, az = -0.5, -1.9
    ay = top_y(H, ax, az)
    mesh("whipBase", xf(lathe([(0.0, -0.05), (0.07, -0.05), (0.07, 0.04), (0.03, 0.07), (0, 0.07)], 10), (ax, ay, az)), "dark", R, 0)
    mesh("whip", B((ax, ay, az), (ax - 0.1, ay + 1.0, az - 0.3), 0.02, 5, True), "dark", R, 0)


def build_civilian(R):
    H = HULL_C
    mesh("hull", loft(H, 40), "body", R, 0.07)
    # soft swoosh down each flank (instead of a racing stripe)
    mesh("swoosh", keep(loft(grow(H, 0.022), 40, False, False), lambda c: abs(c[1] - 0.06) < 0.07 and abs(c[0]) > 0.7), "stripe", R, 0)
    # big glass bubble, set down into the hull (rim buried)
    cano = [
        {"z": -1.65, "w": 0.7, "t": 0.41, "b": 0.0, "yc": 0.45, "eT": 2.2},
        {"z": -1.1, "w": 1.15, "t": 0.99, "b": 0.0, "yc": 0.45, "eT": 2.2},
        {"z": 0.2, "w": 1.22, "t": 1.13, "b": 0.0, "yc": 0.45, "eT": 2.2},
        {"z": 1.3, "w": 1.0, "t": 0.91, "b": 0.0, "yc": 0.45, "eT": 2.2},
        {"z": 2.0, "w": 0.5, "t": 0.43, "b": 0.0, "yc": 0.45, "eT": 2.2},
    ]
    mesh("canopy", loft(cano, 28), "glass", R, 0.04)
    # trunk (body colour): rack and luggage on the rear deck, side-on (long across the car)
    zr = -2.6                       # rack middle
    RXh, RZh = 0.62, 0.36           # half length (across the car), half depth
    RY = top_y(H, 0, zr) + 0.36
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * RXh, zr + sz * RZh
            yr = top_y(H, abs(x), z) - 0.05      # post foot buried in the deck
            mesh(f"post{sx}{sz}", B((x, yr, z), (x, RY, z), 0.03, 6, True), "trim", R, 0.01)
            mesh(f"foot{sx}{sz}", xf(rbox(0.07, 0.03, 0.07, 0.4, 6, 4), (x, yr + 0.04, z)), "trim", R, 0)
    for sz in (-1, 1):
        mesh(f"rail{sz}", B((-RXh, RY, zr + sz * RZh), (RXh, RY, zr + sz * RZh), 0.03, 6, True), "trim", R, 0.01)
    for x in (-0.3, 0.3):
        mesh(f"cross{x}", B((x, RY, zr - RZh), (x, RY, zr + RZh), 0.025, 6, True), "trim", R, 0)
    mesh("luggage", xf(rbox(0.5, 0.15, 0.27, 0.35, 12, 6), (0, RY + 0.13, zr)), "stripe", R, 0.03)
    for x in (-0.22, 0.22):
        mesh(f"strap{x}", xf(rbox(0.025, 0.17, 0.285, 0.2, 10, 4), (x, RY + 0.13, zr)), "trim", R, 0)
    # round tail lamps in chrome bezels, set into the tail flanks, turned to the surface
    for sx in (-1, 1):
        p, yaw = flank(H, sx, 0.12, -3.42)
        q = mount(p, yaw, 0.03)
        mesh(f"tail{sx}", xf(lathe([(0, 0), (0.13, 0), (0.13, 0.06), (0, 0.06)], 12), q, (PI / 2, yaw, 0)), "tail", R, 0)
        mesh(f"tailBezel{sx}", xf(torus(0.145, 0.03, 12, 5), (q[0] + math.sin(yaw) * 0.05, q[1], q[2] + math.cos(yaw) * 0.05), (PI / 2, yaw, 0)), "trim", R, 0)
    # one oval headlamp filling the nose cone in a chrome bezel, back half inside the cone (end cap at z = 3.1)
    zn = H[-1]["z"]
    yn = H[-1].get("yc", 0.0) + (H[-1]["t"] - H[-1]["b"]) / 2
    ea, eb = 0.31, 0.155    # lamp half width, half height
    mesh("head", xf(lathe([(0, -0.05), (1.0, -0.05), (1.0, 0.04), (0, 0.04)], 24), (0, yn, zn), (PI / 2, 0, 0), (ea, 1, eb)), "lamp", R, 0)
    ring = [(math.cos(2 * PI * k / 28) * (ea + 0.015), yn + math.sin(2 * PI * k / 28) * (eb + 0.015), zn + 0.035) for k in range(29)]
    mesh("headBezel", tube(ring, [0.026] * len(ring), 6, False), "trim", R, 0.008)
    # chrome bumpers wrapping nose and tail along the hull flank (none hanging in the air)
    def bumper(name, zs, y, tip_z=None):
        """Tube along the left flank 5 cm proud, round the tip and back up the right flank; without a tip, one piece per flank."""
        L = [(-(side_x(H, y, z) + 0.05), y, z) for z in zs]
        Rr = [(side_x(H, y, z) + 0.05, y, z) for z in reversed(zs)]
        if tip_z is None:
            mesh(name + "L", tube(L, [0.04] * len(L), 8, True), "trim", R, 0.02)
            mesh(name + "R", tube(Rr, [0.04] * len(Rr), 8, True), "trim", R, 0.02)
        else:
            pts = L + [(0.0, y, tip_z)] + Rr
            mesh(name, tube(pts, [0.04] * len(pts), 8, True), "trim", R, 0.02)
    bumper("bumperF", [1.9, 2.3, 2.7, 2.95], -0.1)
    bumper("bumperR", [-2.5, -2.9, -3.3, -3.55], -0.1, -3.74)
    yp = (top_y(H, 0, -3.62) + bot_y(H, 0, -3.62)) / 2 + 0.05
    mesh("plate", xf(rbox(0.22, 0.07, 0.03, 0.3, 6, 4), (0, yp, -3.62)), "roof", R, 0.012)
    # stubby tail fins (feet in the deck at the tail corners), door handles, mirrors on stalks
    for sx in (-1, 1):
        x, z = sx * 0.7, -3.35
        mesh(f"fin{sx}", xf(rbox(0.07, 0.17, 0.34, 0.5, 10, 6), (x, top_y(H, abs(x), z) + 0.07, z), (-0.3, 0, sx * -0.2)), "body", R, 0.03)
        p, yaw = flank(H, sx, 0.3, 0.0)
        mesh(f"handle{sx}", xf(rbox(0.03, 0.035, 0.2, 0.4, 6, 4), (p[0] - sx * 0.01, p[1], p[2])), "trim", R, 0.01)
        p, yaw = flank(H, sx, 0.4, 1.2)
        mesh(f"mirrorStalk{sx}", B((p[0] - sx * 0.04, p[1], p[2]), (p[0] + sx * 0.2, p[1] + 0.18, p[2] + 0.05), 0.025, 6, True), "trim", R, 0)
        mesh(f"mirror{sx}", xf(superquad(0.1, 0.075, 0.06, 0.8, 0.8, 8, 5), (p[0] + sx * 0.24, p[1] + 0.2, p[2] + 0.05)), "body", R, 0.02)
    # hood ornament on a stem
    oy = top_y(H, 0, 2.4)
    mesh("ornamentStem", B((0, oy - 0.03, 2.4), (0, oy + 0.1, 2.4), 0.03, 6, True), "trim", R, 0)
    mesh("ornament", xf(superquad(0.06, 0.08, 0.06, 0.8, 0.8, 8, 5), (0, oy + 0.15, 2.4)), "trim", R, 0.01)
    # whip antenna on a small base behind the glass, lamp at the tip
    ax, az = -0.72, -1.88
    ay = top_y(H, ax, az)
    mesh("whipBase", xf(lathe([(0.0, -0.05), (0.07, -0.05), (0.07, 0.04), (0.03, 0.07), (0, 0.07)], 10), (ax, ay, az)), "trim", R, 0)
    mesh("whip", B((ax, ay, az), (ax - 0.08, ay + 1.1, az - 0.1), 0.018, 5, True), "dark", R, 0)
    mesh("whipTip", xf(superquad(0.05, 0.05, 0.05, 1, 1, 8, 5), (ax - 0.08, ay + 1.1, az - 0.1)), "tail", R, 0)


RF = pivot("car_faction", (0, 0, 0))
RC = pivot("car_civilian", (0, 0, 0))
build_pods(RF, False, HULL_F)
build_faction(RF)
build_pods(RC, True, HULL_C)
build_civilian(RC)
for r in (RF, RC):
    r["radius"] = 3.4
    r["length"] = 6.7 if r is RF else 6.9
    r["width"] = 3.9
print("built", len(C.objects), "objects")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
