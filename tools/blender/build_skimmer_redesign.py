# Daedalus Phase Skimmer redesign builder for Blender (4.2+ / 5.x): two proposals, "sleek and armoured".
#
# Builds one proposal from code and exports it twice: docs/skimmer-proposals/skimmer_<variant>.glb (plain, for any viewer) and
# src/assets/skimmer_<variant>.glb (what the game loads: makeSkimmer in src/models.js; run `npm run optimize:glb` after). The dev
# menu's SKIMMER MODEL switch picks classic, A or B. In Blender's Python console or via MCP:
#   VARIANT = "a"; exec(open(r"<repo>/tools/blender/build_skimmer_redesign.py").read())
# or headless, with the bpy module:  MOONRUNNER_REPO=. MOONRUNNER_SKIMMER=a python3 tools/blender/build_skimmer_redesign.py
# (tools/blender/preview_skimmer.py builds both, and the classic one for comparison, and renders the review sheet.)
#
# The brief: keep the buoyant, floating feel and the sleek body of build_skimmer.py's model; go for a SLEEK AND ARMOURED look in the
# same purple and black, with at least one more colour; the runner rides INSIDE (hidden, like the APC's crew); a mobile, floating,
# forward-facing gunship.
#   a  "Aegis":   one broad armoured delta wing. A low bridge with slit windows, plated shoulders, twin chin cannons under the nose,
#                 phase-drive tubes at the tail with spinning coils, hover pads under the wings. Third colour: AMBER.
#   b  "Bulwark": a catamaran gunship. An armoured fuselage with a bridge dome between two big hover nacelles carrying nose cannons,
#                 phase coils round the nacelles, armoured wing roots and canted fins. Third colour: MINT-TEAL.
#
# Frame (as build_skimmer.py, so the Garage drives it unchanged): three.js axes (x right, y up, +z nose), origin on the ground under
# the middle (the game floats it 0.8 m up and bobs it); about 6.5 m long, 4 m wide. Root empty "skimmer" (extras: radius, proposal,
# hide_rider = 1 so the runner is not drawn, dust = [x, z, ...] where the hover vehicle scatters dust). Pivots (empties with a `role`):
#   hull   everything static       coil   a phase-coil ring, spun about z (extra `spin`)
#   plume  a thruster flame along -z, pulses      lift   a hover glow along -y, breathes
# Slots (one material a mesh; the game swaps its own in): LIVERY `body` (near-black) and `stripe` (violet toon); GLOW `glow` (the
# livery violet), `accent` (NEW: the third colour, set per proposal in the game), `white`, `red`, plus the flames `plume plumeCore lift
# engine`; FIXED TOON `plate` (NEW: armour, a lighter plum-slate), `dark`, `metal`, `steel`. Ink (metres) follows style.md; ink-0
# details lie within ~6 mm of the surface they are on.

import bpy, bmesh, math, os
from mathutils import Vector


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_skimmer_redesign.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
V = (globals().get("VARIANT") or os.environ.get("MOONRUNNER_SKIMMER") or "a").lower()
assert V in ("a", "b"), "variant must be a or b"
OUT = os.path.join(REPO, "docs", "skimmer-proposals", f"skimmer_{V}.glb")
GAME_OUT = os.path.join(REPO, "src", "assets", f"skimmer_{V}.glb")
COLL = f"SkimmerRedesign{V.upper()}"
print("Skimmer proposal", V, "->", OUT)

exec(open(os.path.join(REPO, "tools", "blender", "hullkit.py"), encoding="utf-8").read(), globals())   # (the shared shapes)

ACCENT = {"a": 0xffb62e, "b": 0x2ee6c0}[V]
# preview colours, the game's (the Daedalus livery 0x1a1426 / 0xc77dff, and this proposal's accent): preview only
SLOT_COLORS = {slot: hexlin(h) for slot, h in {
    "body": 0x1a1426, "stripe": 0xc77dff, "glow": 0xc77dff, "accent": ACCENT, "plate": 0x514a73, "dark": 0x2a2540,
    "metal": 0x8a87a0, "steel": 0x55607a, "white": 0xffffff, "red": 0xff2a4a, "engine": 0xff9f1c,
    "plume": 0xc77dff, "plumeCore": 0xfff4ff, "lift": 0xc77dff,
}.items()}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PROUD = 0.006   # how far an ink-0 detail may stand off the skin


# =============================================================================================
# helpers
# =============================================================================================

def zlathe(profile, segs=16):
    """A body of revolution along +z from [(radius, z)]."""
    return xf(lathe([(r, z) for r, z in profile], segs), r=(math.pi / 2, 0, 0))


def top_y(secs, z):
    s = min(secs, key=lambda q: abs(q["z"] - z))
    return s["yc"] + s["t"]


def tubez(x, y, z0, z1, r, slot, name, parent, ink=0.015, segs=10):
    return mesh(name, xf(zlathe([(r, 0), (r, z1 - z0)], segs), (x, y, z0)), slot, parent, ink)


def eye(secs, cz, size, parent, tag, accent_slot="accent"):
    """The Daedalus mark: an almond with a pupil, flat on the roof at cz (tilted to follow its slope), 36 mm above the hull (on the plate)."""
    y = top_y(secs, cz) + 0.036
    tilt = -math.atan((top_y(secs, cz + 0.2) - top_y(secs, cz - 0.2)) / 0.4)
    cx = 0.0
    a = size
    almond = [(-a, 0), (-a * 0.45, a * 0.36), (a * 0.45, a * 0.36), (a, 0), (a * 0.45, -a * 0.36), (-a * 0.45, -a * 0.36)]
    mesh(f"eye{tag}", xf(extrude(almond, 0.012, "y"), (cx, y, cz), (tilt, 0, 0)), accent_slot, parent, 0)
    mesh(f"pupil{tag}", xf(extrude([(-a * 0.16, -a * 0.16), (a * 0.16, -a * 0.16), (a * 0.16, a * 0.16), (-a * 0.16, a * 0.16)], 0.014, "y"), (cx, y + 0.007 * math.cos(tilt), cz + 0.007 * math.sin(-tilt)), (tilt, 0, 0)), "dark", parent, 0)


def chevron(secs, sx, z, th, size, parent, tag, off):
    """A painted chevron (pointing forward) on a flank plate: `off` is how far the plate stands out of the skin."""
    q = min(secs, key=lambda c: abs(c["z"] - z))
    x, y = ring_xy(q, th)
    a = size
    shape = [(a * 0.9, 0), (-a * 0.1, a), (-a * 0.75, a), (a * 0.25, 0), (-a * 0.75, -a), (-a * 0.1, -a)]   # (z, y), tip forward
    mesh(f"chevron{tag}", xf(extrude(shape, 0.012, "x"), (sx * (x + off + 0.006), y, z)), "accent", parent, 0)


# --- decals that lie ON a loft's skin (B): every vertex is solved onto the section's own superellipse, so a mark follows the surface's
# curve across and along it instead of being a flat slab laid on top ---

PLATE = 0.03   # how far the armour plates (skin_patch) stand off the hull


def _skin_at(s, x):
    """(y, ring angle) of a section's upper skin at lateral offset x, or None when x is beyond the section's width."""
    ax = abs(x)
    if ax >= s["w"]:
        return None
    e = s.get("eT", 2.5)
    lo, hi = 0.0, math.pi / 2
    for _ in range(28):   # x falls from w to 0 as the angle goes 0 -> pi/2
        mid = (lo + hi) / 2
        if s["w"] * math.cos(mid) ** (2 / e) > ax:
            lo = mid
        else:
            hi = mid
    th = (lo + hi) / 2
    return s["yc"] + s["t"] * math.sin(th) ** (2 / e), th


def _bracket(secs, z):
    if z <= secs[0]["z"]:
        return secs[0], secs[0], 0.0
    if z >= secs[-1]["z"]:
        return secs[-1], secs[-1], 0.0
    for a, b in zip(secs, secs[1:]):
        if a["z"] <= z <= b["z"]:
            return a, b, (z - a["z"]) / ((b["z"] - a["z"]) or 1.0)


def top_point(secs, z, x, off):
    """The point on the upper skin at (z, x), `off` out along the skin's own direction (so on a plate that stands PLATE off the hull, use PLATE + a little)."""
    a, b, f = _bracket(secs, z)
    pa, pb = _skin_at(a, x), _skin_at(b, x)
    pa, pb = pa or pb, pb or pa
    if pa is None:
        raise ValueError(f"({z:.2f}, {x:.2f}) is off the skin")
    y, th = lerp(pa[0], pb[0], f), lerp(pa[1], pb[1], f)
    return (x + (1 if x >= 0 else -1) * off * math.cos(th), y + off * math.sin(th), z)


def flank_point(secs, sx, z, y, off):
    """The point on one flank of a loft at (z, height y), `off` out along the skin's own direction."""
    a, b, f = _bracket(secs, z)

    def at(s):
        dy = y - s["yc"]
        hh, ee = (s["t"], s.get("eT", 2.5)) if dy >= 0 else (s["b"], s.get("eB", 2.5))
        sin_abs = min(abs(dy) / hh, 0.999) ** (ee / 2)
        th = math.copysign(math.asin(sin_abs), dy)
        return s["w"] * math.cos(th) ** (2 / ee), th
    (xa, ta), (xb, tb_) = at(a), at(b)
    x, th = lerp(xa, xb, f), lerp(ta, tb_, f)
    return (sx * (x + off * math.cos(th)), y + off * math.sin(th), z)


def patch(pt, nu, nv):
    """A grid of points pt(u, v) in [0, 1]^2 as a thin surface (open)."""
    verts = [pt(i / nu, j / nv) for i in range(nu + 1) for j in range(nv + 1)]
    faces = [(i * (nv + 1) + j, (i + 1) * (nv + 1) + j, (i + 1) * (nv + 1) + j + 1, i * (nv + 1) + j + 1) for i in range(nu) for j in range(nv)]
    return verts, faces


def decal(name, geo, slot, parent, outward):
    """A mesh with no ink for an open surface, turned so its faces look out along `outward` (three.js axes): an open patch has no inside for
    the normal fix-up to find, so the winding is checked here."""
    o = mesh(name, geo, slot, parent, 0)
    me = o.data
    want = Vector(tb(outward))
    if sum(p.normal.dot(want) * p.area for p in me.polygons) < 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    return o


def eye_on(secs, cz, a, off, parent, tag):
    """The Daedalus mark draped on the roof: an almond (a long across the hull) with a round pupil, both following the skin's curve."""
    hw = lambda u: 0.36 * a * max(math.sin(math.pi * u), 0.0) ** 0.8
    decal(f"eye{tag}", patch(lambda u, v: top_point(secs, cz + (2 * v - 1) * hw(u), a * (2 * u - 1), off), 16, 3), "accent", parent, (0, 1, 0))
    pr = 0.2 * a
    decal(f"pupil{tag}", patch(lambda u, v: top_point(secs, cz + pr * v * math.sin(2 * math.pi * u), pr * v * math.cos(2 * math.pi * u), off + 0.004), 12, 1), "dark", parent, (0, 1, 0))


def chevron_on(secs, sx, zc, yc, s, parent, tag, off=0.004):
    """A forward-pointing chevron painted on a flank: two strokes, each a strip draped on the skin."""
    tip = (zc + 0.6 * s, yc)
    geos = []
    for st in ((zc - 0.5 * s, yc + s), (zc - 0.5 * s, yc - s)):
        dz, dy = tip[0] - st[0], tip[1] - st[1]
        n = math.hypot(dz, dy)
        nz, ny, th = -dy / n, dz / n, 0.17 * s
        geos.append(patch(lambda u, v, st=st, dz=dz, dy=dy, nz=nz, ny=ny, th=th: flank_point(secs, sx, st[0] + u * dz + (2 * v - 1) * th * nz, st[1] + u * dy + (2 * v - 1) * th * ny, off), 5, 1))
    decal(f"chevron{tag}", join(geos), "accent", parent, (sx, 0, 0))


def lamp_on(secs, tx, z, hx, hz, slot, name, parent, off=0.004):
    """A small light lens draped on the roof of a loft (placed at lateral offset tx)."""
    decal(name, xf(patch(lambda u, v: top_point(secs, z + (2 * v - 1) * hz, (2 * u - 1) * hx, off), 4, 2), (tx, 0, 0)), slot, parent, (0, 1, 0))


def ring_on(secs, tx, z, r, off, slot, name, parent):
    """A tube round a loft's cross-section at z (an intake rim) that follows the section's own shape."""
    q = min(secs, key=lambda c: abs(c["z"] - z))
    pts = []
    for i in range(25):
        th = 2 * math.pi * (i % 24) / 24
        x, y = ring_xy(q, th)
        pts.append((tx + x + off * math.cos(th), y + off * math.sin(th), q["z"]))
    mesh(name, tube(pts, [r] * len(pts), 6, False), slot, parent, 0.01)


def fin_on(secs, tx, z0, z1, ztop0, ztop1, top, thick, parent, name, embed=0.12, band=0.1):
    """A tail fin that grows out of a loft's roofline: its foot follows the roof and sinks `embed` into it, so nothing can float. A band of
    accent colour caps its top edge, cut from the fin's own outline and a little thicker, so it is flush with the fin whatever the fin does."""
    zs = [z0 + (z1 - z0) * i / 4 for i in range(5)]
    yb = [top_point(secs, z, 0.0, 0.0)[1] - embed for z in zs]
    poly = [(z, y) for z, y in zip(zs, yb)] + [(ztop0, top), (ztop1, top)]   # foot aft -> fore, then the raked top fore -> aft
    mesh(name, xf(extrude(poly, thick, "x"), (tx, 0, 0)), "body", parent, 0.03)
    d = band
    zf = ztop0 + (z1 - ztop0) * d / (top - yb[-1])     # the leading edge, `band` down from the top
    za = ztop1 + (zs[0] - ztop1) * d / (top - yb[0])   # the trailing edge
    e = 0.006
    cap = [(ztop1 - e, top + e), (ztop0 + e, top + e), (zf + e, top - d), (za - e, top - d)]
    mesh(name + "Tip", xf(extrude(cap, thick + 2 * e, "x"), (tx, 0, 0)), "accent", parent, 0)


ROOT = pivot("skimmer", (0, 0, 0), None)
H = pivot("skimmer_hull", (0, 0, 0), ROOT, role="hull")


def emitter(tag, x, y, z, r, flame=0.45):
    """A hover pad under the hull: a dark collar, a glowing disc, a breathing glow pointing down."""
    mesh(f"padRing{tag}", xf(lathe([(r + 0.05, 0), (r + 0.05, 0.06), (r, 0.06)], 18), (x, y - 0.03, z)), "dark", H, 0.02)
    mesh(f"pad{tag}", xf(lathe([(0, 0), (r, 0), (r, 0.03), (0, 0.03)], 18), (x, y - 0.035, z)), "glow", H, 0)
    plume(H, f"lift{tag}", (x, y - 0.06, z), r * 0.9, flame, axis="y")


def coil(tag, x, y, z, R, spin, tabs=3, r=0.055, tab="square"):
    """A phase-coil ring that spins about z, with armoured tabs round it (tab="round": circular bosses, axis along the radius)."""
    P = pivot(f"coil{tag}", (x, y, z), ROOT, role="coil", spin=spin)
    mesh(f"coil{tag}_ring", xf(torus(R, r, 24, 6), r=(math.pi / 2, 0, 0)), "glow", P, 0)
    for j in range(tabs):
        a = j * 2 * math.pi / tabs
        if tab == "round":
            boss = lathe([(0, -0.05), (0.075, -0.05), (0.075, 0.035), (0.055, 0.052), (0, 0.058)], 16)   # a short drum with a softly domed face, axis y
            mesh(f"coil{tag}_tab{j}", xf(boss, (math.cos(a) * R, math.sin(a) * R, 0), (0, 0, a - math.pi / 2)), "plate", P, 0.012)
        else:
            mesh(f"coil{tag}_tab{j}", xf(rbox(0.07, 0.07, 0.1, 0.3, 8, 6), (math.cos(a) * R, math.sin(a) * R, 0)), "plate", P, 0.012)
    return P


def thruster(tag, x, y, z_mouth, r=0.38, flame=2.2):
    """A tail nozzle: a dark bell opening aft, a hot disc in it, the flame trailing."""
    mesh(f"bell{tag}", xf(zlathe([(r - 0.06, 0), (r, 0.12), (r + 0.08, 0.38), (r + 0.08, 0.5)], 16), (x, y, z_mouth)), "dark", H, 0.03)
    mesh(f"bellGlow{tag}", xf(lathe([(0, 0), (r - 0.04, 0), (r - 0.04, 0.03), (0, 0.03)], 16), (x, y, z_mouth - 0.01), (math.pi / 2, 0, 0)), "engine", H, 0)
    plume(H, f"plume{tag}", (x, y, z_mouth - 0.5), r - 0.04, flame)


# =============================================================================================
# the model
# =============================================================================================

if V == "a":
    # ======================================================================================
    # A: Aegis, a broad armoured delta
    # ======================================================================================
    HULL = [(-3.0, 0.62, 1.30, 1.10, 3.2, 4), (-2.5, 0.52, 1.50, 1.65, 3.0, 4), (-1.6, 0.46, 1.62, 2.0, 2.8, 4),
            (-0.4, 0.46, 1.58, 1.9, 2.8, 4), (0.9, 0.52, 1.42, 1.25, 2.8, 4), (2.1, 0.62, 1.20, 0.62, 2.6, 3.5),
            (3.3, 0.78, 0.92, 0.05, 2.4, 3)]
    SECS = smooth_keys(HULL, 4)
    mesh("hull", loft(SECS, 28), "body", H, 0.07)
    TH = math.pi / 2
    # ---- armour: plates laid on the skin in sequence (dark seams between them) ----
    for k, (z0, z1) in enumerate(((-2.85, -1.75), (0.55, 2.55))):
        mesh(f"carapace{k}", skin_patch(SECS, 0.5 if k == 0 else 0.62, math.pi - (0.5 if k == 0 else 0.62), 0.03, z0, z1, 1, 5), "plate", H, 0.03)
    for sx in (-1, 1):
        t = "LR"[sx > 0]
        for k, (z0, z1) in enumerate(((-2.6, -1.5), (-1.4, -0.2), (-0.1, 1.0))):
            mesh(f"cheek{t}{k}", skin_patch(SECS, -0.5, 0.42, 0.035, z0, z1, sx, 4), "plate", H, 0.03)
        # glowing seams along the plate edges, flush
        mesh(f"seam{t}", tube([(sx * (ring_xy(q, 0.46)[0] + 0.012), ring_xy(q, 0.46)[1], q["z"]) for q in SECS if -2.6 <= q["z"] <= 1.0][::2], [0.014] * len([q for q in SECS if -2.6 <= q["z"] <= 1.0][::2]), 4, False), "glow", H, 0)
        mesh(f"chine{t}", tube([(sx * (ring_xy(q, -0.55)[0] + 0.03), ring_xy(q, -0.55)[1], q["z"]) for q in SECS if -2.6 <= q["z"] <= 1.6][::2], [0.026] * len([q for q in SECS if -2.6 <= q["z"] <= 1.6][::2]), 4, False), "accent", H, 0)
        for k, cz in enumerate((-2.1, -1.65, -1.2)):
            chevron(SECS, sx, cz, 0.0, 0.17, H, f"{t}{k}", 0.035)
    # ---- the bridge: a low armoured hump with slit windows (the runner rides inside, unseen) ----
    BR = smooth_keys([(-1.25, 1.50, 1.68, 0.30, 2.4, 3), (-0.8, 1.45, 1.98, 0.62, 2.4, 3), (-0.1, 1.45, 2.0, 0.66, 2.4, 3),
                      (0.55, 1.48, 1.82, 0.48, 2.4, 3), (1.0, 1.52, 1.66, 0.14, 2.4, 3)], 3)
    mesh("bridge", loft(BR, 20), "dark", H, 0.04)
    mesh("bridgeFrame", skin_patch(BR, 0.25, math.pi - 0.25, 0.025, -1.1, -0.35, 1, 4), "plate", H, 0.02)
    for sx in (-1, 1):
        mesh(f"slit{'LR'[sx > 0]}", xf(rbox(0.3, 0.045, 0.015, 0.4, 8, 4), (sx * 0.3, 1.84, 0.56), (0.9, sx * 0.55, 0)), "accent", H, 0)
    eye(SECS, 2.0, 0.44, H, "Nose")
    # ---- chin cannons: twin barrels with shrouds and muzzle rings, pointed dead ahead ----
    for sx in (-1, 1):
        t = "LR"[sx > 0]
        gx = sx * 0.5
        mesh(f"gunShroud{t}", xf(rbox(0.16, 0.14, 0.7, 0.3, 10, 8), (gx, 0.66, 1.55)), "plate", H, 0.03)
        tubez(gx, 0.66, 1.9, 3.55, 0.065, "metal", f"barrel{t}", H, 0.015)
        mesh(f"muzzle{t}", xf(zlathe([(0.1, 0), (0.1, 0.16), (0.075, 0.16)], 12), (gx, 0.66, 3.4)), "dark", H, 0.012)
        mesh(f"muzzleGlow{t}", xf(zlathe([(0.12, 0), (0.12, 0.03), (0.07, 0.03), (0.07, 0)], 12), (gx, 0.66, 3.54)), "accent", H, 0)
        # a short rocket pod on the wing's leading edge, tipped in amber
        mesh(f"pod{t}", xf(rbox(0.13, 0.13, 0.55, 0.3, 10, 8), (sx * 1.15, 0.78, 0.35)), "plate", H, 0.03)
        mesh(f"podTip{t}", xf(rbox(0.11, 0.11, 0.05, 0.4, 8, 6), (sx * 1.15, 0.78, 0.9)), "accent", H, 0.008)
    # ---- the tail: twin phase-drive tubes with spinning coils, nozzles and flames ----
    for sx in (-1, 1):
        t = "LR"[sx > 0]
        ex = sx * 0.85
        tubez(ex, 1.0, -3.75, -2.7, 0.44, "dark", f"driveTube{t}", H, 0.04, 14)
        thruster(t, ex, 1.0, -3.76, 0.34, 2.2)
        coil(f"{t}0", ex, 1.0, -3.2, 0.5, sx * 2.6)
        coil(f"{t}1", ex, 1.0, -2.8, 0.48, sx * 3.3)
        # a canted fin on the shoulder, amber at the tip
        fin = [(-2.8, 0.0), (-1.6, 0.0), (-2.2, 0.85), (-2.9, 0.85)]
        mesh(f"fin{t}", xf(extrude(fin, 0.07, "x"), (sx * 1.55, 1.4, 0), (0, 0, -sx * 0.22)), "body", H, 0.03)
        mesh(f"finTip{t}", xf(rbox(0.05, 0.05, 0.3, 0.4, 8, 6), (sx * 1.7, 2.2, -2.75)), "accent", H, 0.008)
        mesh(f"tail{t}", xf(rbox(0.1, 0.04, 0.03, 0.4, 8, 4), (sx * 1.55, 0.95, -2.98)), "red", H, 0)
        mesh(f"head{t}", xf(rbox(0.12, 0.05, 0.04, 0.4, 8, 6), (sx * 0.26, 0.76, 2.55), (0.3, 0, 0)), "white", H, 0)
    # ---- hover pads under the wings (the buoyant glow that holds it up) ----
    for k, (px, pz) in enumerate(((1.45, -2.0), (1.5, -0.7), (1.05, 0.5))):
        for sx in (-1, 1):
            emitter(f"{'LR'[sx > 0]}{k}", sx * px, 0.5, pz, 0.42 - 0.05 * k)
    DUST = [-0.85, -5.2, 0.85, -5.2, -1.0, 1.6, 1.0, 1.6]
else:
    # ======================================================================================
    # B: Bulwark, an armoured catamaran gunship
    # ======================================================================================
    FUS = [(-2.6, 0.62, 1.40, 0.55, 2.8, 4), (-1.8, 0.55, 1.75, 0.85, 2.6, 4), (-0.4, 0.50, 1.95, 0.95, 2.6, 4),
           (1.0, 0.52, 1.70, 0.80, 2.6, 4), (2.2, 0.60, 1.35, 0.42, 2.5, 3.5), (3.2, 0.78, 1.0, 0.05, 2.4, 3)]
    SECS = smooth_keys(FUS, 4)
    mesh("fuselage", loft(SECS, 24), "body", H, 0.07)
    for k, (z0, z1) in enumerate(((-2.5, -1.4), (0.3, 2.4))):
        mesh(f"spine{k}", skin_patch(SECS, 0.7, math.pi - 0.7, 0.03, z0, z1, 1, 4), "plate", H, 0.03)
    # the bridge dome between the nacelles: dark armoured glass (the runner sits behind it, unseen), a plate collar, mint slits
    BR = smooth_keys([(-1.1, 1.75, 1.95, 0.35, 2.2, 3), (-0.6, 1.70, 2.35, 0.62, 2.2, 3), (0.2, 1.70, 2.40, 0.68, 2.2, 3),
                      (0.9, 1.68, 2.12, 0.48, 2.2, 3), (1.3, 1.66, 1.84, 0.14, 2.2, 3)], 3)
    mesh("bridge", loft(BR, 22), "dark", H, 0.04)
    mesh("bridgeCollar", skin_patch(BR, -0.05, math.pi + 0.05, 0.03, -0.95, 1.1, 1, 4), "plate", H, 0.02)
    for sx in (-1, 1):   # the mint slit windows, draped on the bridge's collar plate (slanting in towards the front)
        decal(f"slit{'LR'[sx > 0]}", patch(lambda u, v, sx=sx: top_point(BR, 0.36 + u * 0.55, sx * (0.32 - 0.1 * u + (v - 0.5) * 0.05), PLATE + 0.004), 8, 1), "accent", H, (0, 1, 0))
    eye_on(SECS, 2.0, 0.32, PLATE + 0.004, H, "Nose")   # on the nose's spine plate
    for sx in (-1, 1):
        for k, cz in enumerate((-1.5, -1.05, -0.6)):
            q = min(SECS, key=lambda c: abs(c["z"] - cz))
            chevron_on(SECS, sx, cz, ring_xy(q, 0.15)[1], 0.22, H, f"{'LR'[sx > 0]}{k}")
    # ---- the nacelles: long armoured hover pods with a plate cap, nose cannons, phase coils, hover pads and tail thrusters ----
    NX, NY = 2.0, 0.85
    NAC = [(-2.8, 0.45, 1.25, 0.45, 2.4, 2.6), (-2.2, 0.38, 1.40, 0.60, 2.4, 2.6), (0.9, 0.38, 1.40, 0.60, 2.4, 2.6),
           (2.1, 0.50, 1.20, 0.40, 2.4, 2.6), (2.8, 0.74, 1.00, 0.10, 2.4, 2.6)]
    NSECS = smooth_keys(NAC, 4)
    for sx in (-1, 1):
        t = "LR"[sx > 0]
        mesh(f"nacelle{t}", xf(loft(NSECS, 18), (sx * NX, 0, 0)), "body", H, 0.06)
        mesh(f"nacCap{t}", xf(skin_patch(NSECS, 0.3, math.pi - 0.3, 0.03, -2.4, 2.0, 1, 4), (sx * NX, 0, 0)), "plate", H, 0.03)
        # armoured wing root: a broad flat plate sweeping from the fuselage flank out to the nacelle
        wing = [(0.75, -1.9), (1.7, -2.5), (1.75, 1.2), (0.95, 0.4)]
        mesh(f"wing{t}", xf(extrude([(sx * x, z) for x, z in wing], 0.12, "y"), (0, 1.0, 0)), "plate", H, 0.04)
        # twin cannons in the nacelle's nose, a mint ring at each muzzle
        for k, gy in enumerate((NY + 0.14, NY - 0.12)):
            gx = sx * (NX + (0.0))
            tubez(gx, gy, 2.2, 3.7, 0.06, "metal", f"barrel{t}{k}", H, 0.012)
            mesh(f"muzzle{t}{k}", xf(zlathe([(0.095, 0), (0.095, 0.14), (0.07, 0.14)], 12), (gx, gy, 3.55)), "dark", H, 0.012)
            mesh(f"muzzleGlow{t}{k}", xf(zlathe([(0.095, 0), (0.095, 0.02), (0.068, 0.02), (0.068, 0)], 12), (gx, gy, 3.71)), "accent", H, 0)
        mesh(f"nacChine{t}", tube([(sx * NX + sx * (ring_xy(q, -0.5)[0] + PROUD - 0.022), ring_xy(q, -0.5)[1], q["z"]) for q in NSECS if -2.3 <= q["z"] <= 1.9][::2], [0.022] * len([q for q in NSECS if -2.3 <= q["z"] <= 1.9][::2]), 4, False), "accent", H, 0)
        # a mint intake rim round the nacelle's nose
        ring_on(NSECS, sx * NX, 2.15, 0.03, 0.0, "accent", f"rim{t}", H)
        # phase coils round the pod
        for k, cz in enumerate((-1.5, -0.4, 0.7)):
            coil(f"{t}{k}", sx * NX, NY, cz, 0.7, sx * (2.4 + k * 0.7), 3, tab="round")
        # hover pads and tail thruster
        for k, pz in enumerate((-1.5, -0.3, 0.9)):
            emitter(f"{t}{k}", sx * NX, 0.4, pz, 0.33)
        thruster(t, sx * NX, NY, -2.85, 0.36, 2.2)
        # a tail fin growing out of the nacelle's roofline, with a mint band flush along its top edge
        fin_on(NSECS, sx * NX, -2.7, -1.3, -2.1, -2.8, 2.5, 0.07, H, f"fin{t}")
        # the running lights are lenses draped on the nacelle's skin: white at the nose, red at the tail
        lamp_on(NSECS, sx * NX, 2.45, 0.06, 0.035, "white", f"head{t}", H)
        lamp_on(NSECS, sx * NX, -2.62, 0.08, 0.025, "red", f"tail{t}", H)
        mesh(f"seam{t}", tube([(sx * (ring_xy(q, 0.5)[0] + PROUD - 0.014), ring_xy(q, 0.5)[1], q["z"]) for q in SECS if -2.2 <= q["z"] <= 2.0][::2], [0.014] * len([q for q in SECS if -2.2 <= q["z"] <= 2.0][::2]), 4, False), "glow", H, 0)
    DUST = [-2.0, -5.2, 2.0, -5.2, -1.2, 1.6, 1.2, 1.6]

ROOT["radius"] = 3.4
ROOT["proposal"] = {"a": "Aegis", "b": "Bulwark"}[V]
ROOT["hide_rider"] = 1
ROOT["dust"] = DUST
audit_coplanar(C.objects, allow=[("_core", "_flame")])   # (a flame and its hot core are nested cones on purpose)
_dg = bpy.context.evaluated_depsgraph_get()
_tris = [(o.evaluated_get(_dg).to_mesh(), o["ink"]) for o in C.objects if o.type == "MESH"]
for m, _ in _tris:
    m.calc_loop_triangles()
print("built", len(C.objects), "objects,", sum(len(m.loop_triangles) for m, _ in _tris), "triangles (+", sum(len(m.loop_triangles) for m, k in _tris if k > 0), "for the outline)")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
    export(GAME_OUT, C.objects)
