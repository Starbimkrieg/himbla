# Meridian Courier Light-Bike builder for Blender (4.2+ / 5.x): two redesign PROPOSALS.
#
# Builds one proposal from code and exports it twice: docs/courier-proposals/courier_<variant>.glb (plain, for any viewer)
# and src/assets/lightbike_<variant>.glb (what the game loads: makeLightBike in src/models.js; run `npm run optimize:glb`
# after, the same as for the other models). The dev menu's COURIER MODEL switch picks classic, A or B. In Blender's Python
# console or via MCP:  VARIANT = "a"; exec(open(r"<repo>/tools/blender/build_courier.py").read())
# or headless, with the bpy module:  MOONRUNNER_REPO=. MOONRUNNER_COURIER=a python3 tools/blender/build_courier.py
# (tools/blender/preview_courier.py builds both and renders the review sheet.)
#
# The brief: no upper wheel wells; the two chunky wheels stand free at the nose and the tail, the body is a
# sleek smooth shell slung between them, with a small saddle bag either side.
#   a  "Slipstream":    long, low and pointed. A tall raked windscreen on the nose, teardrop bags hugging
#                       the rear wheel, a racing crouch.
#   b  "Parcel Runner": rounder and friendlier. A wrap-around visor, square flapped panniers slung low
#                       either side of the seat, a relaxed upright seat.
#
# Frame (as makeLightBike in src/models.js, so the Garage drives it unchanged): three.js axes (x right, y up,
# +z forward), origin on the ground in the middle; wheels at z +-1.62, height 0.78, radius 0.78; built 1:1
# (the game shows the bike at 1.2x). Root empty "courier" (extras: radius, proposal, seat = the rider's hip in
# the bike's frame). Pivots (empties with a `role`):
#   chassis  everything that is not a wheel
#   wheel    two (wheel_front, wheel_rear), at the axle, spun about x: tyre, glowing rim rings, spokes, hub caps
#   trail    where the light trail streams from (replaces makeLightBike's `trailFrom`)
# Slots (one material a mesh; the game swaps its own in): LIVERY GLOW `stripe` (the bike's colour: rims, spokes,
# shoulder / belly lines, spine, well arcs) and `trim` (the gold: pin-stripe, straps, clasps, headlamp ring);
# FIXED TOON `navy` (the shell), `panel`, `dark`, `metal`, `seat`, `tire`, and `bag` (NEW: the saddle bags, the
# trim colour as a flat toon); GLOW `glass` (screen), `lamp`, `tail`. `bag` needs a game entry (style.md).
# Ink (outline thickness, metres) follows style.md; ink-0 details lie within ~6 mm of the surface they are on.

import bpy, math, os
from mathutils import Vector


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_courier.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
V = (globals().get("VARIANT") or os.environ.get("MOONRUNNER_COURIER") or "a").lower()
assert V in ("a", "b"), "variant must be a or b"
OUT = os.path.join(REPO, "docs", "courier-proposals", f"courier_{V}.glb")
GAME_OUT = os.path.join(REPO, "src", "assets", f"lightbike_{V}.glb")
COLL = f"CourierBike{V.upper()}"
print("Courier proposal", V, "->", OUT)

def hexlin(h):
    """sRGB hex -> the linear floats Blender's materials take"""
    return tuple(((c / 255 + 0.055) / 1.055) ** 2.4 if c / 255 > 0.04045 else c / 255 / 12.92 for c in ((h >> 16) & 255, (h >> 8) & 255, h & 255))


# preview colours, the game's: the bike's 0x2ec4ff and gold 0xffd23f for the glow slots (preview only)
SLOT_COLORS = {slot: hexlin(h) for slot, h in {
    "navy": 0x0d1428, "panel": 0x1a2440, "dark": 0x2a2540, "metal": 0x5b5870, "seat": 0x2a2540, "tire": 0x1d1a29,
    "stripe": 0x2ec4ff, "trim": 0xffd23f, "glass": 0x9be7ff, "lamp": 0xfff6a8, "tail": 0xff2a4a, "bag": 0xb8741a,
}.items()}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)


# =============================================================================================
# helpers
# =============================================================================================

def lerp(a, b, t):
    return a + (b - a) * t


def catmull(p0, p1, p2, p3, t):
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)


def smooth_keys(keys, k=6):
    """Catmull-Rom through keyframe rows [(z, ymin, ymax, halfwidth, eTop, eBottom)], k steps a span, as loft() sections."""
    out = []
    n = len(keys)
    for i in range(n - 1):
        for s in range(k if i < n - 2 else k + 1):
            t = s / k
            row = [catmull(keys[max(i - 1, 0)][c], keys[i][c], keys[i + 1][c], keys[min(i + 2, n - 1)][c], t) for c in range(6)]
            z, y0, y1, w, eT, eB = row
            out.append(dict(z=z, w=max(w, 0.005), t=max((y1 - y0) / 2, 0.005), b=max((y1 - y0) / 2, 0.005), yc=(y0 + y1) / 2, eT=eT, eB=eB))
    return out


def ring_xy(s, th):
    """The point of a loft section at ring angle th (0 = flank at mid height, pi/2 = the top), as loft() puts it."""
    c, sn = math.cos(th), math.sin(th)
    e = s.get("eT", 2.5) if sn >= 0 else s.get("eB", 2.5)
    h = s["t"] if sn >= 0 else s["b"]
    return s["w"] * spe(c, 2 / e), s.get("yc", 0.0) + h * spe(sn, 2 / e)


def band(secs, th0, th1, side, off=0.012, z0=-9, z1=9, m=3, stride=2):
    """A patch of the body's skin between two ring angles and two z's on one flank, floating `off` outside it."""
    cols = [s for s in secs if z0 <= s["z"] <= z1][::stride]
    verts, faces = [], []
    for s in cols:
        for j in range(m + 1):
            x, y = ring_xy(s, lerp(th0, th1, j / m))
            verts.append((side * (x + off), y, s["z"]))
    for i in range(len(cols) - 1):
        for j in range(m):
            a = i * (m + 1) + j
            faces.append((a, a + 1, a + m + 2, a + m + 1) if side > 0 else (a + m + 1, a + m + 2, a + 1, a))
    return verts, faces


def line(secs, th, side, off=0.014, z0=-9, z1=9, stride=2):
    return [(side * (ring_xy(s, th)[0] + off), ring_xy(s, th)[1], s["z"]) for s in secs if z0 <= s["z"] <= z1][::stride]


PROUD = 0.006   # how far an ink-0 detail may stand off the skin: more and its colour is drawn across the outline


def skin_line(secs, th, side, r, z0=-9, z1=9, stride=2):
    """A glowing line of radius r laid in the flank, standing PROUD proud of it."""
    path = line(secs, th, side, PROUD - r, z0, z1, stride)
    return tube(path, [r] * len(path), 4, False)


def skin_x(secs, z, y):
    """Half width of the shell's flank at (z, y), or None when that point is off the shell."""
    s = min(secs, key=lambda q: abs(q["z"] - z))
    if abs(s["z"] - z) > 0.2 or not (s["yc"] - s["b"] + 0.03 < y < s["yc"] + s["t"] - 0.03):
        return None
    best = min((abs(ring_xy(s, -math.pi / 2 + math.pi * i / 80)[1] - y), ring_xy(s, -math.pi / 2 + math.pi * i / 80)[0]) for i in range(81))
    return best[1]


def well_arc(secs, zc, side, r, off=0.014, n=24):
    """A line on the flank hugging the scoop round the wheel at zc (radius r), where the shell is there."""
    dz = 1 if zc < 0 else -1   # the shell lies ahead of the rear wheel and behind the front one
    pts = []
    for i in range(n + 1):
        a = -math.pi * 0.5 + math.pi * i / n
        z, y = zc + dz * math.cos(a) * r, WY + math.sin(a) * r
        x = skin_x(secs, z, y)
        if x is not None:
            pts.append((side * (x + off), y, z))
    return pts


def revolve_x(loop, segs=28):
    """Spin a closed profile [(x, r)] about the x axis (the wheel axle)."""
    verts, faces = [], []
    n = len(loop)
    for i in range(segs):
        a = 2 * math.pi * i / segs
        for x, r in loop:
            verts.append((x, r * math.sin(a), r * math.cos(a)))
    for i in range(segs):
        i2 = (i + 1) % segs
        for k in range(n):
            k2 = (k + 1) % n
            faces.append((i * n + k, i2 * n + k, i2 * n + k2, i * n + k2))
    return verts, faces


def squircle(cx, cy, hx, hy, e, n=16):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        pts.append((cx + hx * spe(math.cos(t), 2 / e), cy + hy * spe(math.sin(t), 2 / e)))
    return pts


def limb(p, q, sx, sy, e=0.3):
    """A rounded bar from p to q, sx thick across x, sy deep across its other cross-axis."""
    p, q = Vector(p), Vector(q)
    d = q - p
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler("XYZ")
    return xf(rbox(sx, sy, d.length / 2, e, 12, 6), tuple((p + q) / 2), tuple(rot))


def sheet(fn, nu, nv, th):
    """A thin curved panel: fn(u, v) -> (x, y, z) over u, v in [0, 1], thickened by th through its normal."""
    P = [[Vector(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    N = []
    for i in range(nu + 1):
        row = []
        for j in range(nv + 1):
            du = P[min(i + 1, nu)][j] - P[max(i - 1, 0)][j]
            dv = P[i][min(j + 1, nv)] - P[i][max(j - 1, 0)]
            row.append(du.cross(dv).normalized())
        N.append(row)
    verts = []
    for sgn in (1, -1):
        for i in range(nu + 1):
            for j in range(nv + 1):
                verts.append(tuple(P[i][j] + N[i][j] * th / 2 * sgn))
    idx = lambda s, i, j: s * (nu + 1) * (nv + 1) + i * (nv + 1) + j
    faces = []
    for i in range(nu):
        for j in range(nv):
            faces.append((idx(0, i, j), idx(0, i + 1, j), idx(0, i + 1, j + 1), idx(0, i, j + 1)))
            faces.append((idx(1, i, j + 1), idx(1, i + 1, j + 1), idx(1, i + 1, j), idx(1, i, j)))
    for i in range(nu):
        faces.append((idx(0, i + 1, 0), idx(0, i, 0), idx(1, i, 0), idx(1, i + 1, 0)))
        faces.append((idx(0, i, nv), idx(0, i + 1, nv), idx(1, i + 1, nv), idx(1, i, nv)))
    for j in range(nv):
        faces.append((idx(0, 0, j), idx(0, 0, j + 1), idx(1, 0, j + 1), idx(1, 0, j)))
        faces.append((idx(0, nu, j + 1), idx(0, nu, j), idx(1, nu, j), idx(1, nu, j + 1)))
    return verts, faces


def edge_path(fn, which, n=24):
    """Points along one edge of a sheet(): which is 'top', 'bottom', 'left' or 'right'."""
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(fn(t, 1) if which == "top" else fn(t, 0) if which == "bottom" else fn(0, t) if which == "left" else fn(1, t))
    return out


def clear_of_wheels(geo, margin=0.0):
    """Drop faces that touch the wheels' keep-out circles (for panels, which can't take a boolean)."""
    verts, faces = geo
    ok = lambda v: all(math.hypot(v[2] - zc, v[1] - WY) > CUT_R + margin for zc in (-WZ, WZ))
    out = [f for f in faces if all(ok(verts[i]) for i in f)]
    used = sorted({i for f in out for i in f})
    remap = {o: n for n, o in enumerate(used)}
    return [verts[i] for i in used], [tuple(remap[i] for i in f) for f in out]


def cut_wheel_wells(obj):
    """Scoop the body round the wheels (a boolean difference with a cylinder per wheel): the nose and tail
    hug the tyres without a fender arching over them."""
    bpy.ops.object.select_all(action="DESELECT")
    cutters = []
    for zc in (-WZ, WZ):
        bpy.ops.mesh.primitive_cylinder_add(radius=CUT_R, depth=2.0, vertices=64, rotation=(0, math.pi / 2, 0), location=tb((0, WY, zc)))
        cutters.append(bpy.context.object)
    bpy.ops.object.select_all(action="DESELECT")
    for c in cutters:
        c.select_set(True)
    bpy.context.view_layer.objects.active = cutters[0]
    bpy.ops.object.join()
    cutter = bpy.context.object
    mod = obj.modifiers.new("wheelwell", "BOOLEAN")
    mod.operation, mod.object, mod.solver = "DIFFERENCE", cutter, "EXACT"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="wheelwell")
    bpy.data.objects.remove(cutter, do_unlink=True)
    for me in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(me)
    # (the boolean's new faces come out flat-shaded: restore the smooth look the rest of the shell has)
    for p in obj.data.polygons:
        p.use_smooth = True


# =============================================================================================
# the bike (shared)
# =============================================================================================

WZ, WY = 1.62, 0.78          # wheel centres: z (front +, rear -) and height
CUT_R = 0.86                 # the keep-out circle the body is scooped to round each tyre
ROOT = pivot("courier", (0, 0, 0), None)
CH = pivot("courier_chassis", (0, 0, 0), ROOT, role="chassis")

SPEC = {
    "a": dict(
        name="Slipstream", tire_hw=0.23, tire_e=2.7,
        # z, y bottom, y top, half width, top and bottom squareness
        body=[(-1.5, 0.98, 1.36, 0.10, 2.4, 3), (-1.15, 0.80, 1.40, 0.19, 2.4, 3), (-0.7, 0.56, 1.35, 0.26, 2.4, 3),
              (-0.2, 0.50, 1.43, 0.30, 2.3, 3), (0.3, 0.50, 1.53, 0.30, 2.3, 3), (0.75, 0.56, 1.46, 0.25, 2.3, 3),
              (1.15, 0.76, 1.33, 0.17, 2.4, 3), (1.5, 0.92, 1.18, 0.06, 2.4, 3)],
        seat_y=1.36, seat_z=-0.7,
        # clip-ons pulled back to z 0.42 so the rider's 0.6 m arms reach them; the tall tank needs the legs spread 0.5 rad
        # (solved: both fists within 9 mm of the grips, no leg vertex more than 4 mm inside the shell or bags)
        peg=(0.56, 0.88, -0.16), grip=(0.46, 1.5, 0.42),
        pose=dict(lean=1.186, thigh=-1.1, spread=0.5, arm_x=-1.908, arm_z=0.172, elbow=-0.678),
    ),
    "b": dict(
        name="Parcel Runner", tire_hw=0.27, tire_e=2.3,
        body=[(-1.5, 0.95, 1.30, 0.12, 2.2, 3), (-1.15, 0.76, 1.38, 0.24, 2.2, 3), (-0.7, 0.54, 1.30, 0.27, 2.2, 3),
              (-0.2, 0.48, 1.30, 0.27, 2.2, 3), (0.3, 0.48, 1.40, 0.27, 2.2, 3), (0.75, 0.55, 1.45, 0.26, 2.2, 3),
              (1.15, 0.74, 1.30, 0.21, 2.2, 3), (1.5, 0.90, 1.14, 0.08, 2.2, 3)],
        seat_y=1.34, seat_z=-0.55,
        # a slim, scooped tank (half width 0.27, top 1.30 at the seat) gives the thighs room; with the legs spread 0.35 rad
        # they clear the shell and bags completely (checked in preview_courier.py). The pose is solved, not guessed: both
        # fists land on the grips to a millimetre.
        peg=(0.45, 0.8, 0.0), grip=(0.44, 1.6, 0.32), bag_x=0.36,
        pose=dict(lean=0.752, thigh=-1.0, spread=0.35, arm_x=-1.179, arm_z=0.128, elbow=-0.704),
    ),
}[V]

SECS = smooth_keys(SPEC["body"], 4)

# ---- the shell: one smooth loft, scooped round the wheels ----
body = mesh("shell", loft(SECS, 24), "navy", CH, 0.06, sharp=0)
cut_wheel_wells(body)

# ---- the wheels: chunky hubless tyres with a glowing rim ring on each face, spun about x ----
HW = SPEC["tire_hw"]
for name, z in (("rear", -WZ), ("front", WZ)):
    W = pivot(f"wheel_{name}", (0, WY, z), CH, role="wheel")
    mesh(f"tyre_{name}", revolve_x(squircle(0.0, 0.56, HW, 0.22, SPEC["tire_e"], 12), 24), "tire", W, 0.05)
    for sx in (-1, 1):
        mesh(f"rim_{name}_{'LR'[sx > 0]}", revolve_x(squircle(sx * (HW - 0.004), 0.47, 0.012, 0.03, 2.0, 4), 28), "stripe", W, 0)
        mesh(f"hubcap_{name}_{'LR'[sx > 0]}", revolve_x(squircle(sx * 0.31, 0.0, 0.04, 0.12, 2.4, 8), 14), "stripe", W, 0)
    mesh(f"axle_{name}", revolve_x([(-0.31, 0.07), (0.31, 0.07), (0.31, 0.001), (-0.31, 0.001)], 10), "metal", W, 0.02)
    mesh(f"hub_{name}", revolve_x([(-0.05, 0.11), (0.05, 0.11), (0.05, 0.001), (-0.05, 0.001)], 14), "metal", W, 0.012)
    for i in range(6):   # radial, from inside the hub out into the tyre, in its mid plane
        a = i * math.pi / 3
        spoke = extrude([(-0.15, -0.014), (0.15, -0.014), (0.15, 0.014), (-0.15, 0.014)], 0.03, "x")   # (r 0.08 to 0.38: its root is inside the hub, r 0.11)
        mesh(f"spoke_{name}{i}", xf(spoke, (0, math.cos(a) * 0.23, math.sin(a) * 0.23), (a - math.pi / 2, 0, 0)), "stripe", W, 0)

# ---- the forks and the swingarm: slim blades that carry the wheels beside the tyres ----
for sx in (-1, 1):
    t = "LR"[sx > 0]
    X = sx * (HW + 0.09)
    mesh(f"fork{t}", limb((X * 0.95, 1.30, 0.93), (X, WY, WZ), 0.04, 0.06), "metal", CH, 0.03)
    mesh(f"forkCap{t}", xf(rbox(0.05, 0.05, 0.05, 0.4, 8, 4), (X, WY, WZ)), "dark", CH, 0.02)
    mesh(f"swing{t}", limb((X * 0.8, 0.86, -0.62), (X, WY, -WZ), 0.05, 0.085), "panel", CH, 0.03)
    mesh(f"swingStripe{t}", limb((X * 0.8 + sx * 0.04, 0.9, -0.7), (X + sx * 0.04, WY + 0.06, -WZ + 0.12), 0.008, 0.012), "stripe", CH, 0)
    mesh(f"peg{t}", xf(rbox(0.1, 0.03, 0.03, 0.4, 6, 4), (sx * SPEC["peg"][0], SPEC["peg"][1], SPEC["peg"][2])), "metal", CH, 0)
    # the pegs stand out from the shell on a bracket
    mesh(f"pegBracket{t}", limb((sx * 0.2, SPEC["peg"][1] + 0.04, SPEC["peg"][2]), (sx * 0.4, SPEC["peg"][1], SPEC["peg"][2]), 0.025, 0.03), "metal", CH, 0.012)

# ---- the rider's place: seat pad, bars, tail ----
SY, SZ = SPEC["seat_y"], SPEC["seat_z"]
mesh("seat", xf(rbox(0.21, 0.05, 0.4 if V == "a" else 0.38, 0.35, 14, 6), (0, SY + 0.03, SZ), (0.04, 0, 0)), "seat", CH, 0.02)
if V == "a":
    mesh("barClamp", xf(rbox(0.2, 0.03, 0.05, 0.4, 12, 6), (0, 1.44, 0.82)), "metal", CH, 0.02)
    for sx in (-1, 1):
        mesh(f"grip{'LR'[sx > 0]}", xf(rbox(0.04, 0.04, 0.09, 0.5, 8, 4), (sx * SPEC["grip"][0], SPEC["grip"][1], SPEC["grip"][2] + 0.035)), "dark", CH, 0.02)
        mesh(f"gripCap{'LR'[sx > 0]}", xf(rbox(0.036, 0.036, 0.01, 0.5, 8, 4), (sx * SPEC["grip"][0], SPEC["grip"][1], SPEC["grip"][2] - 0.07)), "trim", CH, 0.008)
        mesh(f"riser{'LR'[sx > 0]}", limb((sx * 0.2, 1.44, 0.82), (sx * 0.44, 1.5, 0.5), 0.025, 0.035), "metal", CH, 0.02)

# ---- flank detail: a glowing shoulder line, a gold pin-stripe, a dark side panel ----
for sx in (-1, 1):
    t = "LR"[sx > 0]
    mesh(f"shoulder{t}", skin_line(SECS, 0.5, sx, 0.02, -0.8, 0.8), "stripe", CH, 0)
    mesh(f"pin{t}", skin_line(SECS, 0.12, sx, 0.013, -0.75, 0.6), "trim", CH, 0)
    mesh(f"bellyLine{t}", skin_line(SECS, -0.5, sx, 0.02, -0.7, 0.75), "stripe", CH, 0)
    mesh(f"sidePanel{t}", clear_of_wheels(band(SECS, -0.5, 0.1, sx, 0.006, -0.8, 0.75)), "panel", CH, 0.012, sharp=0)
    for i in range(3):   # intake slats ahead of the knee
        mesh(f"vent{t}{i}", xf(rbox(0.012, 0.075, 0.015, 0.4, 6, 4), (sx * (SECS[12]["w"] + 0.018), 0.82, 0.58 + i * 0.075), (-0.25, 0, 0)), "dark", CH, 0)

for sx in (-1, 1):
    for nm, zc in (("rear", -WZ), ("front", WZ)):
        arc = well_arc(SECS, zc, sx, CUT_R + 0.02, PROUD - 0.02)
        if len(arc) > 3:
            mesh(f"wellArc_{nm}{'LR'[sx > 0]}", tube(arc, [0.02] * len(arc), 4, False), "stripe", CH, 0)

if V == "a":
    # =========================================================================================
    # A: Slipstream
    # =========================================================================================
    # a tall raked windscreen on the nose: wide at the foot, rounded at the shoulders, swept back at the sides
    def screen(u, v):
        uu = u * 2 - 1
        h = v * (1 - 0.22 * uu * uu)
        hw = 0.36 - 0.09 * v - 0.07 * v ** 4
        return (uu * hw, 1.42 + 0.7 * h - 0.07 * uu * uu, 1.02 - 0.48 * h - 0.2 * uu * uu)
    mesh("windscreen", sheet(screen, 10, 6, 0.012), "glass", CH, 0.015, sharp=0)
    rim = edge_path(screen, "top", 14) + edge_path(screen, "right", 6)[1:]
    mesh("screenRim", tube(rim, [0.016] * len(rim), 4, False), "stripe", CH, 0)
    rimL = edge_path(screen, "left", 6)[::-1]
    mesh("screenRimL", tube(rimL, [0.016] * len(rimL), 4, False), "stripe", CH, 0)
    foot = edge_path(screen, "bottom", 8)
    mesh("screenFoot", tube([(x, y - 0.012, z + 0.01) for x, y, z in foot], [0.026] * len(foot), 5, False), "metal", CH, 0.015)
    mesh("cowl", xf(rbox(0.2, 0.06, 0.2, 0.3, 14, 6), (0, 1.38, 0.95), (-0.15, 0, 0)), "panel", CH, 0.02)
    mesh("headlamp", xf(rbox(0.12, 0.028, 0.05, 0.4, 10, 4), (0, 1.395, 1.07), (-0.55, 0, 0)), "lamp", CH, 0)
    # tall teardrop saddle bags hugging the rear wheel: a flat bottom, a lid seam, a gold strap and clasp
    BAGS = smooth_keys([(-1.64, 0.92, 1.12, 0.06, 2.8, 3.2), (-1.55, 0.86, 1.18, 0.11, 2.8, 3.2), (-1.3, 0.83, 1.22, 0.13, 2.8, 3.2),
                        (-1.02, 0.83, 1.2, 0.13, 2.8, 3.2), (-0.92, 0.88, 1.15, 0.09, 2.8, 3.2), (-0.86, 0.93, 1.1, 0.045, 2.8, 3.2)], 3)
    for sx in (-1, 1):
        t = "LR"[sx > 0]
        bx = sx * 0.45
        mesh(f"bag{t}", xf(loft(BAGS, 16), (bx, 0, 0)), "bag", CH, 0.04, sharp=0)
        mesh(f"bagSeam{t}", xf(skin_line(BAGS, 0.62, sx, 0.012, -1.6, -0.92, 1), (bx, 0, 0)), "stripe", CH, 0)
        mesh(f"bagStrap{t}", xf(keep(loft([{**q, "w": q["w"] + 0.012, "t": q["t"] + 0.012, "b": q["b"] + 0.012} for q in BAGS], 16, False, False), lambda c: -1.26 <= c[2] <= -1.12), (bx, 0, 0)), "trim", CH, 0.008)
        mesh(f"bagClasp{t}", xf(rbox(0.02, 0.055, 0.04, 0.4, 6, 4), (bx + sx * 0.142, 1.0, -1.18)), "trim", CH, 0.012)
        mesh(f"bagTail{t}", xf(rbox(0.045, 0.028, 0.02, 0.5, 8, 4), (bx, 1.02, -1.66)), "tail", CH, 0)
        mesh(f"bagBracket{t}", limb((sx * 0.18, 1.04, -1.0), (sx * 0.34, 1.04, -1.0), 0.03, 0.05), "metal", CH, 0.015)
else:
    # =========================================================================================
    # B: Parcel Runner
    # =========================================================================================
    # no windscreen. The cockpit is open, with a pulled-back bar over the tank: a triple clamp on the fork tops,
    # two risers, a swept bar with rubber grips and gold end caps, brake levers with reservoirs, folding mirrors,
    # a gauge pod between the risers and brake lines running down to the forks.
    GX, GY, GZ = SPEC["grip"]

    def bar_path(sx):
        pts = [(0.13, 1.62, 0.84), (0.27, 1.66, 0.74), (0.38, 1.66, 0.6), (GX - 0.02, GY + 0.04, GZ + 0.22), (GX, GY, GZ + 0.1)]
        # (a short Catmull-Rom pass for a smooth sweep)
        out = []
        for i in range(len(pts) - 1):
            p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
            for k in range(4):
                out.append(tuple(sx * catmull(p0[c], p1[c], p2[c], p3[c], k / 4) if c == 0 else catmull(p0[c], p1[c], p2[c], p3[c], k / 4) for c in range(3)))
        out.append((sx * pts[-1][0], pts[-1][1], pts[-1][2]))
        return out

    mesh("triple", xf(rbox(0.2, 0.03, 0.07, 0.35, 12, 6), (0, 1.41, 0.92), (-0.12, 0, 0)), "metal", CH, 0.02)
    mesh("stem", limb((0, 1.3, 0.97), (0, 1.5, 0.86), 0.04, 0.035), "metal", CH, 0.02)
    mesh("barClamp", xf(rbox(0.09, 0.035, 0.045, 0.4, 10, 6), (0, 1.62, 0.84)), "dark", CH, 0.015)
    mesh("barCross", tube([(-0.13, 1.62, 0.84), (0.13, 1.62, 0.84)], [0.021, 0.021], 8, False), "metal", CH, 0.015)
    for sx in (-1, 1):
        t = "LR"[sx > 0]
        bp = bar_path(sx)
        mesh(f"riser{t}", limb((sx * 0.13, 1.41, 0.9), (sx * 0.13, 1.6, 0.84), 0.022, 0.022), "metal", CH, 0.015)
        mesh(f"bar{t}", tube(bp, [0.021] * len(bp), 8, False), "metal", CH, 0.015)
        gp = [(sx * GX, GY, GZ + 0.12 - 0.17 * i / 4) for i in range(5)]
        mesh(f"grip{t}", tube(gp, [0.033] * 5, 8), "dark", CH, 0.015)
        mesh(f"gripCap{t}", xf(rbox(0.036, 0.036, 0.012, 0.5, 8, 4), (sx * GX, GY, GZ - 0.06)), "trim", CH, 0.008)
        # brake lever + reservoir, and its line down to the fork
        mesh(f"lever{t}", limb((sx * (GX - 0.02), GY - 0.02, GZ + 0.12), (sx * (GX - 0.07), GY - 0.04, GZ + 0.3), 0.009, 0.016), "metal", CH, 0.008)
        mesh(f"reservoir{t}", xf(rbox(0.026, 0.026, 0.04, 0.4, 8, 6), (sx * (GX - 0.14), GY + 0.035, GZ + 0.3)), "dark", CH, 0.008)
        line_ = [(sx * (GX - 0.14), GY + 0.02, GZ + 0.32), (sx * 0.32, 1.52, 0.82), (sx * 0.35, 1.4, 0.9), (sx * 0.34, 1.3, 0.94)]
        mesh(f"brakeLine{t}", tube(line_, [0.008] * 4, 4, False), "dark", CH, 0)
        # a folding mirror on a stalk
        mesh(f"mirrorStalk{t}", limb((sx * (GX - 0.05), GY + 0.05, GZ + 0.2), (sx * (GX + 0.05), GY + 0.26, GZ + 0.12), 0.01, 0.01), "metal", CH, 0.008)
        mesh(f"mirror{t}", xf(rbox(0.06, 0.04, 0.012, 0.5, 10, 6), (sx * (GX + 0.06), GY + 0.3, GZ + 0.11), (-0.35, sx * -0.3, 0)), "panel", CH, 0.01)
        mesh(f"mirrorGlass{t}", xf(rbox(0.05, 0.032, 0.004, 0.5, 8, 4), (sx * (GX + 0.06), GY + 0.3, GZ + 0.1), (-0.35, sx * -0.3, 0)), "glass", CH, 0)
    # the gauge pod: a dark housing on the clamp with a lit display and a gold bezel
    mesh("gauge", xf(rbox(0.1, 0.045, 0.06, 0.35, 12, 6), (0, 1.69, 0.8), (-0.4, 0, 0)), "dark", CH, 0.015)
    mesh("gaugeDisplay", xf(rbox(0.075, 0.02, 0.005, 0.5, 8, 4), (0, 1.706, 0.768), (-0.4, 0, 0)), "stripe", CH, 0)
    mesh("gaugeBezel", xf(rbox(0.1, 0.012, 0.062, 0.35, 12, 6), (0, 1.658, 0.812), (-0.4, 0, 0)), "trim", CH, 0.006)
    # a round headlamp set into the nose cowl
    mesh("cowl", xf(rbox(0.24, 0.075, 0.24, 0.28, 14, 6), (0, 1.3, 0.96), (-0.1, 0, 0)), "panel", CH, 0.02)
    mesh("headlamp", xf(lathe([(0, 0), (0.1, 0), (0.1, 0.03), (0, 0.04)], 20), (0, 1.27, 1.12), (1.2, 0, 0)), "lamp", CH, 0)
    mesh("headlampRing", xf(torus(0.105, 0.016, 20, 4), (0, 1.27, 1.12), (1.2, 0, 0)), "trim", CH, 0)
    # square flapped panniers slung low either side of the seat: a strap, a buckle and a tail lamp
    for sx in (-1, 1):
        t = "LR"[sx > 0]
        bx = sx * SPEC["bag_x"]   # centred about on the shell's skin: the bag is half sunk into it
        mesh(f"bag{t}", xf(rbox(0.12, 0.16, 0.4, 0.26, 14, 8), (bx, 0.9, -0.62)), "bag", CH, 0.04, sharp=0)
        mesh(f"bagFlap{t}", xf(rbox(0.128, 0.085, 0.415, 0.22, 14, 6), (bx, 1.03, -0.62), (0, 0, sx * -0.12)), "navy", CH, 0.03, sharp=0)
        mesh(f"bagStrap{t}", xf(rbox(0.135, 0.15, 0.03, 0.3, 10, 6), (bx, 0.98, -0.5)), "trim", CH, 0.012)
        mesh(f"bagBuckle{t}", xf(rbox(0.022, 0.042, 0.03, 0.4, 6, 4), (bx + sx * 0.128, 0.93, -0.5)), "metal", CH, 0.012)
        mesh(f"bagLine{t}", tube([(bx + sx * (0.12 + PROUD - 0.01), 0.84, z) for z in (-0.95, -0.8, -0.5, -0.3)], [0.01] * 4, 4, False), "stripe", CH, 0)
        mesh(f"bagTail{t}", xf(rbox(0.05, 0.035, 0.02, 0.5, 8, 4), (bx, 0.98, -1.045)), "tail", CH, 0)

# a brake-light bar across the tail, either way
mesh("tailBar", xf(rbox(0.12, 0.022, 0.025, 0.5, 8, 4), (0, SPEC["body"][0][2] - 0.02, SPEC["body"][0][0] + 0.05), (0.4, 0, 0)), "tail", CH, 0)
mesh("spine", tube([(0.0, ring_xy(q, math.pi / 2)[1] + PROUD - 0.014, q["z"]) for q in SECS if -0.45 <= q["z"] <= 0.45], [0.014] * len([q for q in SECS if -0.45 <= q["z"] <= 0.45]), 4, False), "stripe", CH, 0)

ALLOW = []   # (name fragment, name fragment) pairs the coplanar audit may let through
pivot("courier_trail", (0, 0.2, -WZ - 0.25), ROOT, role="trail")
ROOT["radius"] = 2.1
ROOT["proposal"] = SPEC["name"]
# a seat (hip) for the rider, in the bike's own frame: the preview and the game both read it
ROOT["seat"] = [0.0, SY + 0.1, SZ]
for _k, _v in SPEC["pose"].items():
    ROOT["pose_" + _k] = _v   # the rider's pose for this bike: torso lean, legs (x swing, spread out), arm (x, out), elbow
audit_coplanar(C.objects, allow=ALLOW)
_dg = bpy.context.evaluated_depsgraph_get()
_tris = [(o.evaluated_get(_dg).to_mesh(), o["ink"]) for o in C.objects if o.type == "MESH"]
for m, _ in _tris:
    m.calc_loop_triangles()
print("built", len(C.objects), "objects,", sum(len(m.loop_triangles) for m, _ in _tris), "triangles (+", sum(len(m.loop_triangles) for m, k in _tris if k > 0), "for the outline)")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
    export(GAME_OUT, C.objects)
