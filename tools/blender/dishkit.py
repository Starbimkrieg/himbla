# Shared dish geometry (build_dish.py: stations and field dish; build_outposts.py: the mast's dishes): the reflector
# (paraboloid, rim 14.1 m, depth 6.8) and its parts, the trunnion mount, and the light dish head. Load with
#     exec(open(os.path.join(REPO, "tools", "blender", "dishkit.py"), encoding="utf-8").read(), globals())
# after kit.py (uses lathe, tube, torus, xf, rbox, B, join and `math`). Returns geometry only, (vertices, faces) in three.js axes;
# the caller names it, assigns a material and parents it. Frame: the 30 m dish-station mount (the game scales it), tilt pivot
# at height YP, reflector axis +y in the tilt frame, apex APEX above the pivot.
#
# head_pieces(): the light dish head as (name, geometry, slot, ink, part) entries, part "yaw" (yaw pivot frame, pivot at YP)
# or "tilt" (child of yaw, turned about x). Slots: body and stripe (faction livery), steel, dark, white, dish, hazard, green.
# Consumers map slots to their materials and scale the ink (metres at this size); ink under 0.04 is dropped (doesn't read).

PI = math.pi
YP = 28.5                       # tilt pivot height
RIM, DEEP = 14.1, 6.8           # reflector rim radius and depth
FOC = RIM * RIM / (4 * DEEP)    # paraboloid focal length through that rim and depth (7.3 m)
SHELL = 0.45                    # reflector body thickness
APEX = 2.4                      # reflector apex above the tilt pivot, along the axis
NECK = 21.2                     # light head's neck foot: its carrier's top sits here


def par(r):
    """Reflector face height above the apex at radius r."""
    return r * r / (4 * FOC)


# ---------------- pieces (geometry returns) ----------------
def cube(hx, hy, hz, pos=(0, 0, 0), rot=(0, 0, 0)):
    """Plain 12-triangle box (half extents) for small parts."""
    v = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz), (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
    return xf((v, [(4, 5, 6, 7), (1, 0, 3, 2), (5, 1, 2, 6), (0, 4, 7, 3), (3, 7, 6, 2), (0, 1, 5, 4)]), pos, rot)


def turn(geo, a):
    """Yaw a piece about y."""
    return xf(geo, r=(0, a, 0))


def circ(r, y, n, close=True):
    return [(r * math.sin(2 * PI * i / n), y, r * math.cos(2 * PI * i / n)) for i in range(n + (1 if close else 0))]


def hoop(r, y, tr, n=48, seg=4):
    """Hoop in the x-z plane round y."""
    return tube(circ(r, y, n), [tr] * (n + 1), seg, True)


def hoops(rs, y, tr, n=48, seg=4):
    """Hoops at several radii (y: a number or a function of r)."""
    return join([hoop(r, y(r) if callable(y) else y, tr, n, seg) for r in rs])


def tori(R, ys, tr, n=32, rseg=4):
    return join([xf(torus(R, tr, n, rseg), (0, y, 0)) for y in ys])


def arc_pts(r, y, a0, a1, n):
    return [(r * math.sin(a0 + (a1 - a0) * i / n), y, r * math.cos(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def Y(geo):
    """Geometry authored at world heights, moved into the yaw pivot's frame (pivot at y = YP)."""
    return xf(geo, t=(0, -YP, 0))


# ---------------- the dish (tilt frame; y0 lifts the apex above the pivot) ----------------
def bowl(y0, thick, lift, N=11, segs=36):
    """Closed thick paraboloid: face at par(r) + lift, underside `thick` below."""
    rs = [RIM * i / N for i in range(N + 1)]
    prof = [(0.0, y0 + lift - thick)] + [(r, y0 + par(r) + lift - thick) for r in rs[1:]]
    prof.append((RIM, y0 + par(RIM) + lift))
    prof += [(r, y0 + par(r) + lift) for r in reversed(rs[1:-1])]
    prof.append((0.0, y0 + lift))
    return lathe(prof, segs)


def face_seams(y0, n_rad=16, rings=(4.7, 9.4), r_in=1.5, tr=0.085):
    """Face panel seams: radial and ring ridges as thin tubes."""
    out = []
    n = 7
    for k in range(n_rad):
        a = 2 * PI * k / n_rad
        rs = [r_in + (RIM - 0.5 - r_in) * i / (n - 1) for i in range(n)]
        out.append(tube([(r * math.sin(a), y0 + par(r) + 0.15, r * math.cos(a)) for r in rs], [tr] * n, 4, True))
    for r in rings:
        out.append(hoop(r, y0 + par(r) + 0.15, tr, 56))
    return join(out)


def rim_collar(y0, up=0.45, down=1.0, out=0.5):
    y = y0 + par(RIM)
    prof = [(RIM - 0.15, y - down), (RIM + out, y - down), (RIM + out, y + up), (RIM - 0.15, y + up), (RIM - 0.15, y - down)]
    return lathe(prof, 56)


def rib_bottom(y0, r, r0=5.0, depth0=1.0, depth1=1.35):
    """Truss bottom chord height at radius r."""
    ya, yb = y0 + par(r0) - SHELL - depth0, y0 + par(RIM - 0.3) - SHELL - depth1
    return ya + (yb - ya) * (r - r0) / (RIM - 0.3 - r0)


def hub_cone(y0, r_bot=2.3, y_bot=0.0, r_top=5.1):
    """Solid cone from the trunnion drum up to just under the reflector."""
    yb = lambda r: y0 + par(r) - SHELL - 0.06
    prof = [(0.0, y_bot), (r_bot, y_bot), (r_bot + 0.25, y_bot + 0.3), (r_top, yb(r_top))]
    prof += [(r_top * f, yb(r_top * f)) for f in (0.66, 0.33)] + [(0.0, yb(0.0))]
    return lathe(prof, 28)


def drum(hl=3.0, r=2.2):
    """Trunnion drum along x, centred on the pivot."""
    prof = [(0.0, -hl), (r - 0.2, -hl), (r, -hl + 0.2), (r, hl - 0.2), (r - 0.2, hl), (0.0, hl)]
    return xf(lathe(prof, 18), r=(0, 0, PI / 2))


def quadpod(y0, top_y, r_top, n, tr, seg=6):
    """Struts from the rim up to the feed support."""
    out = []
    for k in range(n):
        a = 2 * PI * (k + 0.5) / n
        out.append(B((RIM * 0.97 * math.sin(a), y0 + par(RIM) + 0.1, RIM * 0.97 * math.cos(a)), (r_top * math.sin(a), top_y, r_top * math.cos(a)), tr, seg, True))
    return join(out)


def mount_pieces(neck_y0, neck_y1, neck_r, neck_slot="steel"):
    """Shared top as (name, geometry, slot, ink, part): neck, head block and ears (yaw), trunnion drum (tilt)."""
    out = [
        ("neck", Y(tube([(0, neck_y0, 0), (0, neck_y1, 0)], [neck_r, neck_r], 14)), neck_slot, 0.08, "yaw"),
        ("headBlock", cube(3.5, 0.5, 2.4, (0, 25.1 - YP, 0)), "dark", 0.1, "yaw"),
    ]
    for s in (-1, 1):
        out += [
            (f"ear{s}", cube(0.55, 1.9, 1.4, (s * 3.55, 26.8 - YP, 0)), "steel", 0.08, "yaw"),
            (f"bearing{s}", xf(torus(1.3, 0.2, 16, 4), (s * 3.2, 0, 0), (0, 0, PI / 2)), "dark", 0.04, "yaw"),
            (f"earPlate{s}", cube(0.6, 0.12, 1.5, (s * 3.55, 28.7 - YP, 0)), "hazard", 0.0, "yaw"),
        ]
    out += [
        ("drum", drum(), "steel", 0.1, "tilt"),
        ("drumRings", join([xf(torus(2.26, 0.14, 18, 4), (s * 2.3, 0, 0), (0, 0, PI / 2)) for s in (-1, 1)]), "hazard", 0.0, "tilt"),
    ]
    return out


def head_pieces():
    """Light dish head (~3.3k triangles): mount (neck foot at y = NECK), thin shell and face, stripe/body collar blocks,
    six trusses, quadpod, banded feed cabin, subreflector, stem, green lens."""
    out = mount_pieces(NECK, 25.4, 1.75)
    out += [
        ("hub", hub_cone(APEX), "steel", 0.12, "tilt"),
        ("bowl", bowl(APEX, SHELL, 0.0, 5, 20), "white", 0.14, "tilt"),
        ("face", bowl(APEX, 0.12, 0.12, 5, 20), "dish", 0.0, "tilt"),
        ("collar", rim_collar(APEX, 0.35, 0.7, 0.4), "dark", 0.1, "tilt"),
    ]
    nb = 16
    for slot, parity in (("stripe", 0), ("body", 1)):
        out.append(("rimBlocks_" + slot, join([tube(arc_pts(RIM + 0.46, APEX + par(RIM) - 0.15, 2 * PI * k / nb + 0.01, 2 * PI * (k + 1) / nb - 0.01, 2), [0.55] * 3, 4, True) for k in range(nb) if k % 2 == parity]), slot, 0.0, "tilt"))
    NT, R0, nbay = 6, 5.0, 2
    ch, dg = [], []
    for k in range(NT):
        a = 2 * PI * (k + 0.5) / NT
        P = lambda r, y: (r * math.sin(a), y, r * math.cos(a))
        rs = [R0 + (RIM - 0.3 - R0) * i / nbay for i in range(nbay + 1)]
        tops = [(r, APEX + par(r) - SHELL - 0.05) for r in rs]
        bots = [(r, rib_bottom(APEX, r)) for r in rs]
        ch += [tube([P(*t) for t in tops], [0.17] * len(rs), 4, True), tube([P(*b) for b in bots], [0.2] * len(rs), 4, True)]
        dg += [B(P(*tops[i]), P(*bots[i]), 0.1, 4, True) for i in range(nbay + 1)]
    FEED_Y = 14.2
    out += [
        ("trussChords", join(ch), "body", 0.05, "tilt"),
        ("trussWeb", join(dg), "steel", 0.0, "tilt"),
        ("quadpod", join([B((RIM * 0.97 * math.sin(a), APEX + par(RIM) + 0.1, RIM * 0.97 * math.cos(a)), (1.3 * math.sin(a), FEED_Y - 0.6, 1.3 * math.cos(a)), 0.2, 6, True) for a in [2 * PI * (k + 0.5) / 4 for k in range(4)]]), "body", 0.05, "tilt"),
        ("feedCab", xf(rbox(1.4, 0.9, 1.4, 0.1, 6, 3), (0, FEED_Y + 0.35, 0)), "body", 0.1, "tilt"),
        ("feedBand", cube(1.44, 0.13, 1.44, (0, FEED_Y + 0.35, 0)), "stripe", 0.0, "tilt"),
        ("subRefl", lathe([(0.0, APEX + FOC + 0.55), (1.0, APEX + FOC + 0.95), (1.0, APEX + FOC + 1.1), (0.0, APEX + FOC + 0.8)], 12), "white", 0.04, "tilt"),
        ("feedStem", tube([(0, FEED_Y - 0.6, 0), (0, APEX + FOC + 0.95, 0)], [0.26, 0.26], 6), "steel", 0.0, "tilt"),
        ("feedLens", lathe([(0.0, APEX + FOC + 0.5), (0.4, APEX + FOC + 0.55), (0.0, APEX + FOC + 0.8)], 10), "green", 0.0, "tilt"),
    ]
    return out
