# Chimera Downs glass dome for Blender (4.2+ / 5.x) -> src/assets/downs-dome.glb, built into the Downs by src/downsDome.js
# (which also holds its colliders and runs the airlocks).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_dome.py").read())
# or headless:   MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/build_downs_dome.py
#
# DOWNS frame (src/downsPlan.js), flat: metres, origin on the ground at the oval's centre, +x east along the straights, +z toward
# the main stand and the forecourt. The game would bend it onto the plateau like the rest of the Downs (src/curve.js). Angles
# round the dome run from +x toward +z: the east gate hall is at 0, the forecourt gate at 90, the west gate hall at 180.
# One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js; glow slots are lit); `ink` = outline.
#   dn_dome        everything below hangs off this root, at the Downs' origin.
#     drum         r 272 (the farthest thing it covers is the annex fence's corner, r 266; the plateau is r 280): Mint2 plinth
#                  with a gold cap, 96 Mint pilasters 3.75 degrees apart, a `domeglass` pane in each bay, Mint ring beam
#                  (12.6 to 14.8 m) with a gold band. The bays on the gate axes (and one each side) are the airlocks' heads.
#     shell        on the ring beam (foot 14.4 m, sunk into it) to the crown at 120.4 m: a superellipse profile (exponent
#                  2.4), so the foot rises near-vertical and the ferris wheel's top (49 m at r 234) has about 33 m over it.
#                  Lattice: a six-sector Kiewitt cap (16 rings) on a band of five rings of 96 nodes, alternately offset half
#                  a bay so the rim's nodes land on the pilasters and the gate axes on bay middles; rings ~15 m apart down
#                  the profile, rim bays 17.8 m. Struts 1.1 m wide and 0.55 m deep, flat so that from afar their lit faces
#                  outweigh their shaded sides (a wireframe of the panes, `domeframe`, ink 0.03); one `domeglass` pane per
#                  triangle, flat-shaded. Gold compression rings on ring 2 and ring 16 (cap meets band);
#                  a gold hub, a mast and a red beacon on the crown.
#     dn_lock_main, dn_lock_west, dn_lock_east   an airlock on each way in, origin on the drum's centre line on the gate's
#                  axis, +z out of the dome. The ring road runs at r 312, so the locks lie inside: the outer doors are in the
#                  lock head (a Mint2 block filling three bays, 54 m wide, 12.65 m tall, gold coping) and the chambers run in
#                  to a gatehouse facing the Downs.
#                  Head, outside: vehicle door 8 x 7 m in a black frame with gold hazard stripes and the lock's name on a
#                  board over it; an attic to 17.1 m (in front of the shell) with CHIMERA DOWNS in raised gold, between two
#                  buttresses carrying red and green lamps and gold finials; a pedestrian door 1.5 x 2.75 m under a canopy
#                  in each side bay; an apron 5.4 m out (to the plateau's edge) with gold lines.
#                  Vehicle lock: a barrel-vaulted chamber (11 m clear, 10.5 m to the crown), 30 m from the head to the
#                  gatehouse, with hoop ribs, two air ducts on its shoulders, lit portholes, a lit crown strip inside and a
#                  deck from the outer door to the inner one. Pedestrian locks: a 3.8 m tube from each side door to a tower.
#                  Gatehouse (child pivot `<lock>_gh`, 46 m in, turned to face the Downs: its +z is the lock's -z): a door
#                  block (27 m wide, 15 m tall, inner vehicle door, board with the lock's name, pump house and two vent
#                  stacks on the roof) between two 9 x 14.5 m towers (Barn Red hip roofs, gold finials, a lit control-room
#                  window and the inner pedestrian door under a canopy), and a threshold pad.
#                  Doors are pivots shown shut, one per leaf: role `door`, `slide` = metres along the pivot's x to open
#                  (`<lock>_doorOutL/R` in the head, `<lock>_gh_doorInL/R` in the gatehouse, `hatch*` the pedestrian doors).
#                  The vehicle doors' lamp lenses are pivots too: role `signal`, `side` out / in, `color` red / green
#                  (`<lock>_sigOutRedL`...), and so is the crown strip (`<lock>_cycleLight`, `<lock>_gh_cycleLight` in the passage; side cycle).
# New slots, which the game has no entry for yet: `domeglass` (clear glass: the game would want a transparent, double-sided
# material, more opaque at grazing angles), `domeframe` (the lattice, Mint: its own material so it can carry a little
# emissive, the Downs' lights on its undersides, without lifting every Mint wall) and `glowgreen` (a lock's go lamp).
DOWNS_OUT = "downs-dome.glb"
DOWNS_COLL = "MoonDownsDome"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

HEX.update({"domeglass": "bfe9ff", "domeframe": "f8fff8", "glowgreen": "7dff9a"})
for s in ("domeglass", "domeframe", "glowgreen"):
    SLOT_COLORS[s] = S(HEX[s])
    material(s)
_gm = bpy.data.materials["domeglass"]
_gm.use_backface_culling = False                                                       # exports as double-sided
_bs = next((n for n in _gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
if _bs:
    _bs.inputs["Alpha"].default_value = 0.16                                           # exports as alpha blend (preview viewers)
    _bs.inputs["Roughness"].default_value = 0.05
if hasattr(_gm, "surface_render_method"):
    _gm.surface_render_method = "BLENDED"

RR, YB, HC, PE = 272.0, 14.4, 106.0, 2.4      # shell foot radius and height (40 cm into the ring beam), rise, profile exponent
NS, MK, ML = 6, 16, 5                          # Kiewitt sectors, Kiewitt rings, band rings (odd: the rim is offset half a bay)
NR, N = MK + ML, NS * MK                       # rings below the crown; nodes on each band ring (96)
BAY = 2 * PI / N
TW, TD = 1.1, 0.55                             # strut width and depth
PX = RR * math.sin(BAY)                        # a side bay's middle from the gate axis, at the drum (17.79)
LOCKS = (("main", "MAIN LOCK", 24), ("west", "WEST LOCK", 48), ("east", "EAST LOCK", 0))   # name, board, bay on the axis (bay c is centred at c * BAY)


def at(r, a, y):
    return (r * math.cos(a), y, r * math.sin(a))


# ---- the profile: rings evenly spaced along it, crown (k = 0) to foot (k = NR) ----
def profile():
    n = 20000
    pts = []
    for i in range(n + 1):
        t = (PI / 2) * (1 - i / n)
        pts.append((RR * math.cos(t) ** (2 / PE), YB + HC * math.sin(t) ** (2 / PE)))
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    out, j = [], 0
    for k in range(NR + 1):
        s = cum[-1] * k / NR
        while j < n - 1 and cum[j + 1] < s:
            j += 1
        f = (s - cum[j]) / max(cum[j + 1] - cum[j], 1e-12)
        r, y = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f
        tr, ty = pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]                   # down the profile
        ln = math.hypot(tr, ty)
        out.append((r, y, -ty / ln, tr / ln))                                           # radius, height, outward normal (r, y)
    return out, cum[-1]


RINGS, LEN = profile()


def ring_angles(k):
    if k <= MK:
        return [2 * PI * i / (NS * k) for i in range(NS * k)]
    off = 0.5 * ((k - MK) % 2)
    return [2 * PI * (i + off) / N for i in range(N)]


def lattice():
    """the shell's triangles: (verts, faces), one face per pane"""
    verts, idx = [(0.0, RINGS[0][1], 0.0)], [[0]]
    for k in range(1, NR + 1):
        r, y = RINGS[k][:2]
        row = []
        for a in ring_angles(k):
            row.append(len(verts))
            verts.append(at(r, a, y))
        idx.append(row)
    faces = []
    for k in range(1, MK + 1):                                                          # Kiewitt: ring k has k nodes a sector
        A, Bk = idx[k - 1], idx[k]
        na, nb = len(A), len(Bk)
        for s in range(NS):
            for i in range(k):
                faces.append((Bk[(s * k + i) % nb], Bk[(s * k + i + 1) % nb], A[(s * (k - 1) + i) % na]))
            for i in range(k - 1):
                faces.append((Bk[(s * k + i + 1) % nb], A[(s * (k - 1) + i + 1) % na], A[(s * (k - 1) + i) % na]))
    for k in range(MK + 1, NR + 1):                                                     # band: 96 a ring, each half a bay round from the last
        A, Bk = idx[k - 1], idx[k]
        if (k - MK) % 2:                                                                # B[i] lies between A[i] and A[i + 1]
            for i in range(N):
                faces += [(A[i], A[(i + 1) % N], Bk[i]), (A[(i + 1) % N], Bk[(i + 1) % N], Bk[i])]
        else:                                                                           # B[i + 1] lies between A[i] and A[i + 1]
            for i in range(N):
                faces += [(A[i], A[(i + 1) % N], Bk[(i + 1) % N]), (A[i], Bk[(i + 1) % N], Bk[i])]
    return verts, faces


def wireframe(geo, w, d):
    """struts w wide and d deep along every edge of a surface, mitred at the nodes and centred on it (Blender's wireframe makes
    them square): each pane keeps a hole inset w / 2 from its edges, nodes and holes stand d / 2 out and in along the nodes'
    normals, and an edge with one pane (the rim) gets a wall"""
    P = [Vector(v) for v in geo[0]]
    N = [Vector((0, 0, 0)) for _ in P]
    tris, uses = [], {}
    for f in geo[1]:
        a, b, c = (P[i] for i in f)
        n = (b - a).cross(c - a)
        if n.dot(a + b + c) < 0:                                                        # wound outward (the shell is star-shaped from the origin)
            f, n = (f[0], f[2], f[1]), -n
        tris.append(f)
        for k in range(3):
            N[f[k]] += n                                                                # area-weighted node normals
            e = tuple(sorted((f[k], f[(k + 1) % 3])))
            uses[e] = uses.get(e, 0) + 1
    N = [n.normalized() for n in N]
    verts, faces, ends = [], [], {}

    def node(i, s):
        if (i, s) not in ends:
            ends[(i, s)] = len(verts)
            verts.append(tuple(P[i] + N[i] * (s * d / 2)))
        return ends[(i, s)]
    for f in tris:
        hole = []
        for k in range(3):
            v, e1, e2 = P[f[k]], (P[f[k - 1]] - P[f[k]]).normalized(), (P[f[(k + 1) % 3]] - P[f[k]]).normalized()
            half = math.acos(max(-1.0, min(1.0, e1.dot(e2)))) / 2
            p, n = v + (e1 + e2).normalized() * (w / 2 / math.sin(half)), N[f[k]] * (d / 2)
            hole.append((len(verts), len(verts) + 1))
            verts += [tuple(p + n), tuple(p - n)]
        for k in range(3):
            a, b = f[k], f[(k + 1) % 3]
            (ht, hb), (ht2, hb2) = hole[k], hole[(k + 1) % 3]
            faces += [(node(a, 1), node(b, 1), ht2, ht), (node(b, -1), node(a, -1), hb, hb2), (ht, ht2, hb2, hb)]   # outside, inside, hole
            if uses[tuple(sorted((a, b)))] == 1:
                faces.append((node(b, 1), node(a, 1), node(a, -1), node(b, -1)))
    return verts, faces


def ring_beam(k, hw, hd):
    """a square-section beam along lattice ring k (even k: lathe's first vertex, +z, is a node), hw across, hd deep"""
    r, y, nr, ny = RINGS[k]
    tr, ty = ny, -nr
    sec = [(r + nr * hd * a + tr * hw * b, y + ny * hd * a + ty * hw * b) for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1), (1, 1))]
    return lathe(sec, NS * k if k <= MK else N)


def arc_prism(r0, r1, y0, y1, a0, a1, n):
    """an annular sector from angle a0 to a1 in n straight pieces (vertices on the nodes when a0, a1 are), radii r0 to r1"""
    verts, faces = [], []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        c, s = math.cos(a), math.sin(a)
        verts += [(r0 * c, y0, r0 * s), (r1 * c, y0, r1 * s), (r1 * c, y1, r1 * s), (r0 * c, y1, r0 * s)]
    for i in range(n):
        p, q = 4 * i, 4 * i + 4
        for j in range(4):
            faces.append((p + j, p + (j + 1) % 4, q + (j + 1) % 4, q + j))
    faces += [(0, 1, 2, 3), (4 * n + 3, 4 * n + 2, 4 * n + 1, 4 * n)]
    return verts, faces


def vault(hw, spring, n=16):
    """an arch from (-hw, spring) over the top to (hw, spring)"""
    return [(-hw * math.cos(PI * i / n), spring + hw * math.sin(PI * i / n)) for i in range(n + 1)]


def letters_flat(acc, text, cx, cy, z, pix, depth):
    """raised lettering on the plane z facing +z, centred on (cx, cy): touching pixels make one solid (no outline between them)"""
    px, w = letter_pixels(text)
    cells = set(px)
    index, verts, faces = {}, [], []

    def v(i, j, s):
        if (i, j, s) not in index:
            index[(i, j, s)] = len(verts)
            verts.append((cx + (i - 0.5 - (w - 1) / 2) * pix, cy + (3.5 - j) * pix, z + s * depth))
        return index[(i, j, s)]
    for c, r in cells:
        faces.append((v(c, r, 1), v(c + 1, r, 1), v(c + 1, r + 1, 1), v(c, r + 1, 1)))
        faces.append((v(c, r + 1, 0), v(c + 1, r + 1, 0), v(c + 1, r, 0), v(c, r, 0)))
        for (a, b), nb in ((((c, r), (c + 1, r)), (c, r - 1)), (((c + 1, r), (c + 1, r + 1)), (c + 1, r)), (((c + 1, r + 1), (c, r + 1)), (c, r + 1)), (((c, r + 1), (c, r)), (c - 1, r))):
            if nb not in cells:
                faces.append((v(*a, 0), v(*b, 0), v(*b, 1), v(*a, 1)))
    acc.geos.append((verts, faces))


def hazard(acc, x0, x1, y0, y1, z, period=0.7):
    """gold hazard stripes at 45 degrees across x0..x1, y0..y1 on the plane z (+z face): 1 cm slabs, 5 mm proud"""
    def clip(poly, a, b, c):                                                            # keep a x + b y + c >= 0
        out = []
        for i in range(len(poly)):
            P, Q = poly[i], poly[(i + 1) % len(poly)]
            fp, fq = a * P[0] + b * P[1] + c, a * Q[0] + b * Q[1] + c
            if fp >= 0:
                out.append(P)
            if (fp >= 0) != (fq >= 0):
                t = fp / (fp - fq)
                out.append((P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t))
        return out
    rect = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    for k in range(math.floor((y0 - x1) / period) - 1, math.ceil((y1 - x0) / period) + 1):
        c = k * period
        p = clip(clip(rect, -1, 1, -c), 1, -1, c + period / 2)
        if len(p) >= 3 and abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) > 0.01:
            acc.poly(p, z - 0.005, z + 0.005)


def lamp(house, lens, x, y, z):
    """a status lamp on the plane z (+z face): black housing, lit lens"""
    house.boxc(x, y, z + 0.13, 0.8, 0.8, 0.3)
    lens.cylc(x, y, z + 0.3, 0.27, 0.1, 14, rot=(PI / 2, 0, 0))


def signal(house, parent, name, x, y, z, slot, side):
    """a vehicle door's status lamp: the housing baked, the lens its own pivot (role signal, `side` out or in, `color` red or
    green) so the game can light it by the lock's state"""
    house.boxc(x, y, z + 0.13, 0.8, 0.8, 0.3)
    P = pivot(name, (x, y, z + 0.3), parent, role="signal", side=side, color=slot[4:])
    Acc(name + "_lens", slot, P, 0.01).cylc(0, 0, 0, 0.27, 0.1, 14, rot=(PI / 2, 0, 0))


def leaf(parent, pfx, x, y, z, w, h, d, slide, bands=(0.23, 0.5, 0.77)):
    """one door leaf as its own pivot (role door): Barn Red slab w x h x d from y, Barn2 stiffener bands on its +z face, a black
    seal on the meeting edge (the side away from `slide`)"""
    P = pivot(pfx, (x, y, z), parent, role="door", slide=slide, state="shut")
    L = parts(P, pfx, {"barn": 0.02, "barn2": 0.012})
    L["barn"].boxc(0, h / 2, 0, w, h, d)
    for f in bands:
        L["barn2"].boxc(0, h * f, d / 2 + 0.02, w - 0.3, 0.24, 0.06)
    seal = Acc(pfx + "_seal", "black", P, 0.0)
    m = -math.copysign(1, slide)                                                        # toward the meeting edge
    a, b = (w / 2 - 0.1, w / 2 + 0.005) if slide < 0 else (w / 2 - 0.1, w / 2 - 0.02)   # the left leaf's seal covers the joint
    seal.box(m * a, m * b, 0.03, h - 0.03, -d / 2 - 0.005, d / 2 + 0.005)               # 3 cm short of the leaf's top and foot
    return P


# =====================================================================================================
# dn_dome: drum and shell
# =====================================================================================================
root = pivot("dn_dome", (0, 0, 0))
D = parts(root, "dn_dome", {"mint": 0.06, "mint2": 0.05, "gold": 0.02})
glass = Acc("dn_dome_drumGlass", "domeglass", root, 0.0)
pil = Acc("dn_dome_pilasters", "mint", root, 0.04)
band = Acc("dn_dome_band", "gold", root, 0.012)

lock_bays = {c % N for _, _, b in LOCKS for c in (b - 1, b, b + 1)}
centres = sorted(b for _, _, b in LOCKS)
for i, ca in enumerate(centres):                                                        # plinth and cap from lock head to lock head
    cb = centres[(i + 1) % len(centres)] + (N if i == len(centres) - 1 else 0)
    a0, a1, n = (ca + 1.5) * BAY, (cb - 1.5) * BAY, cb - ca - 3
    D["mint2"].add(arc_prism(269.6, 274.4, -0.4, 3.6, a0, a1, n))
    trim = 0.3 / RR                                                                     # cap ends 0.3 m inside the end pilasters
    D["gold"].add(arc_prism(269.45, 274.55, 3.55, 3.85, a0 + trim, a1 - trim, n))
for c in range(N):
    if c in lock_bays:
        continue
    a0, a1 = (c - 0.5) * BAY, (c + 0.5) * BAY                                           # a pane between two pilasters, ends in them
    p = [at(RR, a0, 3.7), at(RR, a1, 3.7), at(RR, a1, 12.7), at(RR, a0, 12.7)]
    glass.geos.append((p, [(0, 1, 2, 3)]))
for j in range(N):                                                                      # pilasters on the rim's nodes, none inside a lock head
    a = (j + 0.5) * BAY
    if any(abs(((a / BAY - b) + N / 2) % N - N / 2) < 1 for _, _, b in LOCKS):
        continue
    x, _, z = at(RR, a, 0)
    pil.boxc(x, 8.0, z, 1.5, 10.0, 3.0, rot=(0, PI / 2 - a, 0))                         # 3 to 13 m: foot in the plinth, head in the beam
rot = (0, -BAY / 2, 0)                                                                  # lathe vertices onto the rim's nodes
D["mint"].add(lathe([(270.2, 12.6), (273.8, 12.6), (273.8, 14.8), (270.2, 14.8), (270.2, 12.6)], N), rot=rot)
band.add(lathe([(273.75, 13.4), (273.9, 13.4), (273.9, 14.0), (273.75, 14.0), (273.75, 13.4)], N), rot=rot)

# shell
LAT = lattice()
print(f"dome: profile {LEN:.1f} m, ring spacing {LEN / NR:.2f} m, rim bay {2 * PI * RR / N:.2f} m, {len(LAT[1])} panes, crown {RINGS[0][1]:.1f} m")
mesh("dn_dome_struts", wireframe(LAT, TW, TD), "domeframe", root, 0.03)
mesh("dn_dome_glass", LAT, "domeglass", root, 0.0, sharp=math.radians(0.5))
gold = Acc("dn_dome_rings", "gold", root, 0.03)
for k in (2, MK):
    gold.add(ring_beam(k, 0.9, 0.85))
yc = RINGS[0][1]
gold.cylc(0, yc, 0, 3.2, 2.0, 16)                                                       # crown hub over the apex node
mast = Acc("dn_dome_mast", "black2", root, 0.02)
mast.bm((0, yc + 0.8, 0), (0, yc + 8.9, 0), 0.3, 8)
gold.cylc(0, yc + 8.8, 0, 0.8, 0.4, 12)
Acc("dn_dome_beacon", "glowred", root, 0.01).add(sphere(0.8, 14, 10), t=(0, yc + 9.7, 0))


# =====================================================================================================
# dn_lock_*: head in the drum, chambers, gatehouse
# =====================================================================================================
HW = 27.0                                                                               # head half-width (its ends are in the next pilasters)
ZI, ZO = -3.9, 2.6                                                                      # head's inner and outer faces
GZ = -46.0                                                                              # gatehouse's front (inner door) face
PLACE = "CHIMERA DOWNS"


def head(L, pfx, name):
    H = parts(L, pfx, {"mint2": 0.06, "mint": 0.04, "gold": 0.02, "black": 0.025, "barn": 0.03, "glowred": 0.01, "glowgreen": 0.01})
    house = Acc(pfx + "_lampHousings", "black", L, 0.012)
    flat = Acc(pfx + "_lines", "gold", L, 0.0)
    lettering = Acc(pfx + "_letters", "gold", L, 0.01)
    deck = Acc(pfx + "_deck", "black2", L, 0.0)
    pw = 0.75                                                                           # pedestrian door half-width
    H["mint2"].poly([(-HW, -0.45), (-PX - pw, -0.45), (-PX - pw, 2.75), (-PX + pw, 2.75), (-PX + pw, -0.45), (-4, -0.45), (-4, 7), (4, 7), (4, -0.45),
                     (PX - pw, -0.45), (PX - pw, 2.75), (PX + pw, 2.75), (PX + pw, -0.45), (HW, -0.45), (HW, 12.65), (-HW, 12.65)], ZI, ZO)
    H["gold"].box(-HW - 0.1, HW + 0.1, 12.15, 12.55, ZI - 0.1, ZO + 0.1)                 # coping band round the top
    # outer vehicle door: black frame with hazard stripes, leaves in the opening (they slide into the head)
    for sx in (-1, 1):
        H["black"].box(sx * 4.0, sx * 4.7, 0.0, 7.7, ZO, ZO + 0.25)
        hazard(flat, *sorted((sx * 4.05, sx * 4.65)), 0.1, 7.0, ZO + 0.25)
    H["black"].box(-4.0, 4.0, 7.0, 7.7, ZO, ZO + 0.25)
    hazard(flat, -4.65, 4.65, 7.05, 7.65, ZO + 0.25)
    for sx in (-1, 1):
        leaf(L, f"{pfx}_doorOut{'LR'[sx > 0]}", sx * 2.01, 0, ZO - 0.4, 4.02, 7.02, 0.4, sx * 4.1)
    # attic over the door, in front of the shell (its back 0.7 m clear of the lowest struts) and through the ring beam's face:
    # the place's name between two buttresses that rise from the ground into its cornice, gold finials on top
    H["mint"].box(-9.6, 9.6, 11.6, 16.2, ZO - 1.3, ZO + 0.8)
    H["gold"].box(-9.75, 9.75, 16.2, 16.55, ZO - 1.45, ZO + 1.15)
    H["mint2"].box(-9.6, 9.6, 16.5, 17.1, ZO - 1.3, ZO + 0.8)
    H["black"].box(-7.0, 7.0, 13.0, 15.4, ZO + 0.75, ZO + 0.95)
    letters_flat(lettering, PLACE, 0, 14.2, ZO + 0.95, 0.17, 0.1)
    for sx in (-1, 1):                                                                  # buttresses, each with a red lamp over a green one
        H["mint"].box(sx * 7.2, sx * 8.8, -0.4, 16.2, ZO - 0.2, ZO + 1.0)
        signal(house, L, f"{pfx}_sigOutRed{'LR'[sx > 0]}", sx * 8.0, 8.4, ZO + 1.0, "glowred", "out")
        signal(house, L, f"{pfx}_sigOutGreen{'LR'[sx > 0]}", sx * 8.0, 7.4, ZO + 1.0, "glowgreen", "out")
        H["gold"].bm((sx * 8.0, 17.0, ZO + 0.2), (sx * 8.0, 18.3, ZO + 0.2), 0.09, 8)
        H["gold"].add(sphere(0.34, 12, 8), t=(sx * 8.0, 18.5, ZO + 0.2))
    # the lock's own board over the door
    H["black"].box(-5.8, 5.8, 8.1, 10.5, ZO - 0.05, ZO + 0.2)
    letters_flat(lettering, name, 0, 9.3, ZO + 0.2, 0.2, 0.1)
    # pedestrian doors in the side bays: frame, leaf in the opening, canopy on gold brackets, lamps
    for sx in (-1, 1):
        cx = sx * PX
        for e in (-1, 1):
            H["black"].box(cx + e * pw, cx + e * (pw + 0.3), 0.0, 3.05, ZO, ZO + 0.2)
        H["black"].box(cx - pw, cx + pw, 2.75, 3.05, ZO, ZO + 0.2)
        leaf(L, f"{pfx}_hatchOut{'LR'[sx > 0]}", cx, 0, ZO - 0.35, 2 * pw + 0.04, 2.77, 0.2, sx * 1.6, bands=(0.5,))
        H["barn"].box(cx - 1.5, cx + 1.5, 3.4, 3.58, ZO - 0.1, ZO + 1.4)
        H["gold"].box(cx - 1.55, cx + 1.55, 3.36, 3.62, ZO + 1.4, ZO + 1.48)
        for e in (-1, 1):
            H["gold"].bm((cx + e * 1.2, 2.5, ZO - 0.05), (cx + e * 1.2, 3.42, ZO + 1.2), 0.05, 6)
        lamp(house, H["glowred"], cx - 0.6, 4.2, ZO)                                   # over the canopy
        lamp(house, H["glowgreen"], cx + 0.6, 4.2, ZO)
    # apron to the plateau's edge (r 280), the deck through the lock to the inner door; gold lines on the apron
    deck.box(-HW - 0.4, HW + 0.4, -0.3, 0.15, ZO - 0.02, 8.0)
    deck.box(-5.51, 5.51, -0.25, 0.15, GZ + 0.05, ZO - 0.02)
    for sx in (-1, 1):
        flat.box(sx * 4.3, sx * 4.55, 0.145, 0.16, ZO + 0.3, 7.8)                       # lane edges
        flat.box(sx * (PX - 1.2), sx * (PX - 1.05), 0.145, 0.16, ZO + 0.3, 7.8)         # walkway edges
        flat.box(sx * (PX + 1.05), sx * (PX + 1.2), 0.145, 0.16, ZO + 0.3, 7.8)
    flat.box(-4.3, 4.3, 0.145, 0.16, ZO + 1.0, ZO + 1.4)                                # stop line


def chamber(L, pfx):
    """the vehicle lock between the head and the gatehouse, and the two pedestrian tubes"""
    z0, z1 = ZI + 0.3, GZ + 11.7                                                        # 0.3 m into the head and the gatehouse block
    K = parts(L, pfx + "_ch", {"mint": 0.05, "mint2": 0.02, "black2": 0.03, "black": 0.015, "glasswarm": 0.0, "glowmint": 0.0})
    duct = Acc(pfx + "_ch_ducts", "black2", L, 0.02)
    shell = [(-6.1, -0.2)] + vault(6.1, 5.0) + [(6.1, -0.2), (5.5, -0.2)] + vault(5.5, 5.0)[::-1] + [(-5.5, -0.2)]
    K["mint"].poly(shell, z1, z0)
    for sx in (-1, 1):
        K["mint2"].box(sx * 6.0, sx * 6.5, -0.43, 0.9, z1 - 0.1, z0 + 0.1)              # base course
    rib = [(-6.45, -0.3)] + vault(6.45, 5.0) + [(6.45, -0.3), (6.05, -0.3)] + vault(6.05, 5.0)[::-1] + [(-6.05, -0.3)]
    for i in range(4):
        z = ZI - 6.0 - i * 6.6
        K["black2"].poly(rib, z - 0.35, z + 0.35)
        for sx in (-1, 1):                                                              # duct saddle on the rib
            a = PI / 4
            duct.bm((sx * 6.4 * math.cos(a), 5.0 + 6.4 * math.sin(a), z), (sx * 6.9 * math.cos(a), 5.0 + 6.9 * math.sin(a), z), 0.18, 6)
        if i < 3:                                                                       # lit portholes between the ribs
            for sx in (-1, 1):
                zp = z - 3.3
                K["black"].box(sx * 6.05, sx * 6.2, 2.7, 3.8, zp - 0.85, zp + 0.85)
                K["glasswarm"].box(sx * 6.197, sx * 6.205, 2.85, 3.65, zp - 0.7, zp + 0.7)
    for sx in (-1, 1):
        a = PI / 4
        duct.bm((sx * 6.9 * math.cos(a), 5.0 + 6.9 * math.sin(a), z0), (sx * 6.9 * math.cos(a), 5.0 + 6.9 * math.sin(a), z1), 0.45, 10)
    zc = (z1 + 0.02 + ZI) / 2                                                           # lit strip along the crown inside: its own pivot
    cyc = pivot(pfx + "_cycleLight", (0, 10.3, zc), L, role="signal", side="cycle")      # (role signal, side cycle: it pulses while the lock cycles)
    Acc(pfx + "_cycleLight_strip", "glowmint", cyc, 0.0).boxc(0, 0.1025, 0, 0.6, 0.205, ZI - z1 - 0.02)
    # pedestrian tubes, each on cradles, from the head to its tower
    T = parts(L, pfx + "_tube", {"mint": 0.04, "black2": 0.02})
    t1 = GZ + 12.7
    for sx in (-1, 1):
        cx = sx * PX
        T["mint"].cylc(cx, 1.9, (z0 + t1) / 2, 1.9, z0 - t1, 16, rot=(PI / 2, 0, 0))
        for z in [ZI - 0.25] + [ZI - 4.0 - 5.0 * i for i in range(6)]:
            T["black2"].boxc(cx, 0.45, z, 3.2, 1.5, 0.5)                                # cradle (the first closes the door slot's foot)
            if z < ZI - 1:
                T["black2"].cylc(cx, 1.9, z, 2.0, 0.4, 16, rot=(PI / 2, 0, 0))          # band


def gatehouse(G, pfx, name):
    """in its own frame: front (the inner doors) on z = 0, facing +z (toward the Downs)"""
    B = parts(G, pfx, {"mint": 0.06, "mint2": 0.03, "gold": 0.02, "black": 0.025, "barn": 0.05, "glasswarm": 0.0, "glowmint": 0.0, "glowred": 0.01, "glowgreen": 0.01})
    house = Acc(pfx + "_lampHousings", "black", G, 0.012)
    fine = Acc(pfx + "_fine", "black", G, 0.008)
    flat = Acc(pfx + "_lines", "gold", G, 0.0)
    lettering = Acc(pfx + "_letters", "gold", G, 0.01)
    pad = Acc(pfx + "_pad", "black2", G, 0.0)
    # door block: passage (the chamber's profile, 2 cm bigger) through the back, front wall with the door
    B["mint"].poly([(-13.5, -0.4), (-5.52, -0.4)] + vault(5.52, 5.0) + [(5.52, -0.4), (13.5, -0.4), (13.5, 15.0), (-13.5, 15.0)], -12.0, -0.6)
    B["mint"].poly([(-13.5, -0.4), (-4, -0.4), (-4, 7), (4, 7), (4, -0.4), (13.5, -0.4), (13.5, 15.0), (-13.5, 15.0)], -0.6, 0.0)
    cyc = pivot(pfx + "_cycleLight", (0, 10.32, -6.16), G, role="signal", side="cycle")   # the crown strip on through the passage: pulses with the chamber's
    Acc(pfx + "_cycleLight_strip", "glowmint", cyc, 0.0).boxc(0, 0.1025, 0, 0.6, 0.205, 11.08)
    for sx in (-1, 1):                                                                  # plinth either side of the door
        B["mint2"].box(sx * 4.7, sx * 13.35, -0.45, 1.4, -0.1, 0.15)
    B["gold"].box(-13.35, 13.35, 14.2, 14.6, -0.1, 0.2)                                 # cornice
    B["mint2"].box(-13.35, 13.35, 14.95, 16.0, -0.55, 0.05)                             # parapet
    for sx in (-1, 1):
        B["black"].box(sx * 4.0, sx * 4.7, 0.0, 7.7, 0.0, 0.25)
        hazard(flat, *sorted((sx * 4.05, sx * 4.65)), 0.1, 7.0, 0.25)
        leaf(G, f"{pfx}_doorIn{'LR'[sx > 0]}", sx * 2.01, 0, -0.3, 4.02, 7.02, 0.4, sx * 4.1)
    B["black"].box(-4.0, 4.0, 7.0, 7.7, 0.0, 0.25)
    hazard(flat, -4.65, 4.65, 7.05, 7.65, 0.25)
    signal(house, G, f"{pfx}_sigInRed", -1.2, 8.25, 0.0, "glowred", "in")
    signal(house, G, f"{pfx}_sigInGreen", 1.2, 8.25, 0.0, "glowgreen", "in")
    B["black"].box(-8.0, 8.0, 8.9, 11.5, -0.05, 0.2)
    letters_flat(lettering, name, 0, 10.2, 0.2, 0.24, 0.1)
    # pump house and vent stacks on the roof
    B["mint2"].box(-5.0, 5.0, 14.9, 19.0, -9.5, -3.5)
    B["gold"].box(-5.15, 5.15, 18.6, 18.9, -9.65, -3.35)
    for i in range(5):
        fine.box(-4.0, 4.0, 15.6 + i * 0.55, 15.82 + i * 0.55, -3.5, -3.42)
    for sx in (-1, 1):
        B["black"].bm((sx * 3.0, 18.0, -6.5), (sx * 3.0, 23.5, -6.5), 0.5, 10)
        B["gold"].cylc(sx * 3.0, 23.6, -6.5, 0.65, 0.4, 12)
    # towers: the pedestrian locks' inner ends
    for sx in (-1, 1):
        cx, x0, x1, za, zb = sx * PX, sx * PX - 4.5, sx * PX + 4.5, -13.0, 1.5
        zc = (za + zb) / 2
        B["mint"].box(x0, x1, -0.4, 18.9, za, zb)
        for (u0, u1, v0, v1) in ((x0 - 0.15, cx - 1.0, zb - 0.25, zb + 0.15), (cx + 1.0, x1 + 0.15, zb - 0.25, zb + 0.15),
                                 (x0 - 0.15, x1 + 0.15, za - 0.15, za + 0.25), (x0 - 0.15, x0 + 0.25, za - 0.15, zb + 0.15), (x1 - 0.25, x1 + 0.15, za - 0.15, zb + 0.15)):
            B["mint2"].box(u0, u1, -0.45, 1.6, v0, v1)                                  # plinth, open round the door
        for y0 in (6.3, 13.0):
            B["gold"].box(x0 - 0.08, x1 + 0.08, y0, y0 + 0.3, za - 0.08, zb + 0.08)     # string courses
        B["gold"].box(x0 - 0.25, x1 + 0.25, 18.6, 19.0, za - 0.25, zb + 0.25)           # eaves
        B["barn"].add(hip(0.0, 1.0, 5.5), t=(cx, 18.98 + 2.75, zc), s=(5.0 / 0.7071, 1, 7.6 / 0.7071))
        B["gold"].bm((cx, 24.2, zc), (cx, 26.0, zc), 0.09, 8)
        B["gold"].add(sphere(0.32, 12, 8), t=(cx, 26.2, zc))
        # inner pedestrian door: backing frame, leaf, canopy on brackets, lamps
        B["black"].box(cx - 0.95, cx + 0.95, 0.0, 3.1, zb - 0.05, zb + 0.1)
        leaf(G, f"{pfx}_hatchIn{'LR'[sx > 0]}", cx, 0, zb + 0.16, 1.5, 2.75, 0.12, sx * 1.7, bands=(0.5,))
        B["barn"].box(cx - 1.5, cx + 1.5, 3.4, 3.58, zb - 0.1, zb + 1.4)
        B["gold"].box(cx - 1.55, cx + 1.55, 3.36, 3.62, zb + 1.4, zb + 1.48)
        for e in (-1, 1):
            B["gold"].bm((cx + e * 1.2, 2.5, zb - 0.05), (cx + e * 1.2, 3.42, zb + 1.2), 0.05, 6)
        lamp(house, B["glowred"], cx - 0.6, 4.2, zb)
        lamp(house, B["glowgreen"], cx + 0.6, 4.2, zb)
        # lit window over the door and the control room's window band
        B["black"].box(cx - 0.85, cx + 0.85, 7.85, 10.35, zb - 0.05, zb + 0.1)
        B["glasswarm"].box(cx - 0.7, cx + 0.7, 8.0, 10.2, zb + 0.097, zb + 0.105)
        B["gold"].box(cx - 1.0, cx + 1.0, 7.65, 7.85, zb - 0.05, zb + 0.25)
        B["black"].box(cx - 3.55, cx + 3.55, 14.25, 16.75, zb - 0.05, zb + 0.1)
        B["glasswarm"].box(cx - 3.4, cx + 3.4, 14.4, 16.6, zb + 0.097, zb + 0.105)
        for u in (-1.7, 0.0, 1.7):
            fine.box(cx + u - 0.06, cx + u + 0.06, 14.3, 16.7, zb + 0.103, zb + 0.16)
    # threshold pad with the lane, a stop line and the walkways
    pad.box(-24.0, 24.0, -0.3, 0.15, -0.05, 8.0)
    for sx in (-1, 1):
        flat.box(sx * 4.3, sx * 4.55, 0.145, 0.16, 0.3, 7.8)
        for e in (-1.2, 1.05):
            flat.box(sx * PX + e, sx * PX + e + 0.15, 0.145, 0.16, 1.9, 7.8)
    flat.box(-4.3, 4.3, 0.145, 0.16, 1.0, 1.4)


for key, label, bay in LOCKS:
    th = bay * BAY
    pfx = f"dn_lock_{key}"
    L = pivot(pfx, at(RR, th, 0), root)
    L.rotation_euler = (0, 0, PI / 2 - th)                                              # local +z out along the gate's axis
    head(L, pfx, label)
    chamber(L, pfx)
    G = pivot(pfx + "_gh", (0, 0, GZ), L)
    G.rotation_euler = (0, 0, PI)
    gatehouse(G, pfx + "_gh", label)

finish_and_export()
