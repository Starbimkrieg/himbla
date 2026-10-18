# Tower crane builder for Blender (4.2+ / 5.x): a hammerhead tower crane, exported to src/assets/crane.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_crane.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_crane.py
#
# One crane, 34 m of lattice mast under a 30 m jib (the game scales it uniformly for the smaller cranes). Everything is
# authored in three.js axes with the jib pointing +x at zero slew; the origin is on the ground in the middle of the base.
#
# Built to work like the real thing, so a climber could get from the ground to the cab and out along the counter-jib:
#   base        a cross frame on a concrete pad, its arms under the mast's four legs (along the diagonals), ballast on the arm
#               ends; a short access ladder up the +z side to the mast's floor deck
#   mast        the ladder runs inside the +z face (rungs 0.3 m apart, 0.3 m of toe room to the face bracing, a 0.75 m climbing
#               space in front), through hatches in the rest decks every second section, up to the top platform under the
#               slewing ring: a deck round the mast with a handrail (top rail, knee rail, toe board)
#   slew        a second ladder, hung from the slewing platform, climbs through the middle of the slewing ring into the tower
#               head; the head's +z face is left open as a doorway onto the slewing platform (handrails all round), from which a
#               railed catwalk leads to the door of the cab, cantilevered out on brackets beside the jib root. The counter-jib
#               is two side girders with the walkway between them, level with the platform; the top chords are its handrail.
#   trolley     wheels on flanges outside the jib's bottom chords; two sheaves in line with the rope falls, each turning the
#               rope down from the jib
#   hook        a two-fall block: cheek plates either side of a sheave whose plane holds both falls, a crosshead, a swivel and
#               a forged hook whose saddle sits under the swivel, its throat closed by a latch
#
# The static parts (the root's own meshes) are the foundation, the base frame and the mast with its ladder and decks. Pivots
# (empties with a `role`) carry everything that moves:
#   slew      at the top of the mast (y = 34), turned about y by the game. Under it: the slewing ring and platform, its
#             ladder, the tower head with the pendant bars, the jib (out to +x) and counter-jib (-x) with its counterweights and
#             hoist house, the operator's cab and catwalk, the lamps and the wind gauge.
#   blinker   the aircraft warning lights (apex, jib tip, counter-jib end); the game puts a blinking lamp on each
#   trolley   the carriage on the jib's rails, a child of `slew`; the game slides it along x (it sits at x = 14)
#   cable     the two rope falls, a child of `trolley`: one metre long, hanging down from its origin; the game scales y
#   hook      the hook block, hook and bridle slings, a child of `trolley`; the game sets its y to minus the rope length
#   load      under `hook`: the cargo container (the Prospector's, see build_landtrain.py) on its spreader frame, turned to lie along
#             the jib. `livery` pivots under it (extra `faction`) carry each faction's plate and number; the game builds the one
#             that matches the crane's cargo and leaves the rest out
# Each mesh has ONE material named after a slot: body (the crane's colour) is swapped by the game, and so are the container's
# load (its body), stripe and label (its trim and lettering) for the faction whose cargo it carries; the rest are fixed (see
# craneSlot in src/models.js). The `drop` extra on the hook is the distance from its origin to the container's bottom.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_crane.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("CRANE_OUT") or os.path.join(REPO, "src", "assets", "crane.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Tower crane export ->", OUT)
COLL = "MoonTowerCrane"

# preview colours (the game swaps in its own materials)
SLOT_COLORS = {
    "body": (1.0, 0.82, 0.25), "dark": (0.16, 0.14, 0.25), "steel": (0.33, 0.38, 0.48), "concrete": (0.66, 0.65, 0.72),
    "white": (1.0, 0.96, 0.88), "glass": (0.81, 0.94, 1.0), "lamp": (1.0, 0.96, 0.66), "load": (1.0, 0.23, 0.36),
    "rope": (0.1, 0.09, 0.14), "metal": (0.54, 0.53, 0.63), "stripe": (1.0, 0.96, 0.88), "label": (0.16, 0.14, 0.25),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "spreader.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
H = 34.0          # the top of the mast (the slewing ring sits on it)
JIB = 30.0        # the jib's reach from the slew axis


def M(name, geo, slot, parent, ink=0.04, **kw):
    return mesh("crane_" + name, geo, slot, parent, ink, **kw)


def PV(name, pos, parent=None, **props):
    return pivot("crane_" + name if parent is not None else name, pos, parent, **props)


def rb(name, hx, hy, hz, pos, slot, parent, ink=0.04, e=0.08, rot=(0, 0, 0), nu=6, nv=3):
    """A rounded box (half extents), crisp corners by default."""
    return M(name, xf(rbox(hx, hy, hz, e, nu, nv), pos, rot), slot, parent, ink)


def box(hx, hy, hz, pos, e=0.05, rot=(0, 0, 0)):
    """A plain cuboid (half extents; `e` is ignored). (rbox with four segments round is an octahedron, not a box: the old decks
    and plates built that way were diamonds turned 45 degrees.)"""
    v = [(sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return xf((v, f), pos, rot)


def slab(x0, x1, z0, z1, y0, y1, cuts=()):
    """A flat plate over [x0, x1] x [z0, z1] between heights y0 and y1, with rectangular holes `cuts` ((x0, x1, z0, z1) each),
    as the fewest boxes along x for each band of z."""
    xs = sorted({x0, x1} | {min(max(v, x0), x1) for c in cuts for v in c[:2]})
    zs = sorted({z0, z1} | {min(max(v, z0), z1) for c in cuts for v in c[2:]})
    cut = lambda x, z: any(c[0] < x < c[1] and c[2] < z < c[3] for c in cuts)
    out = []
    for za, zb in zip(zs, zs[1:]):
        if zb - za < 1e-4:
            continue
        run = None
        for xa, xb in list(zip(xs, xs[1:])) + [(None, None)]:
            solid = xa is not None and xb - xa > 1e-4 and not cut((xa + xb) / 2, (za + zb) / 2)
            if solid and run is None:
                run = xa
            if not solid and run is not None:
                end = xa if xa is not None else x1
                # (a millimetre short of each seam, so the pieces' corners are not welded together on export)
                out.append(box((end - run) / 2 - 0.001, (y1 - y0) / 2, (zb - za) / 2 - 0.001, ((end + run) / 2, (y0 + y1) / 2, (za + zb) / 2), 0.01))
                run = None
    return join(out)


def railing(a, b, y, posts=None, toe=True, every=1.5):
    """A handrail along the straight edge a -> b ((x, z) points) of a deck whose top is at y: posts (at the ends and at most
    `every` apart, or at the fractions `posts` along it), a top rail at 1.1 m, a knee rail at 0.55 m and a toe board.
    Returns (rails, toe board)."""
    (ax, az), (bx, bz) = a, b
    n = max(1, math.ceil(math.hypot(bx - ax, bz - az) / every))
    ts = posts if posts is not None else [i / n for i in range(n + 1)]
    rails = [B((ax + (bx - ax) * t, y, az + (bz - az) * t), (ax + (bx - ax) * t, y + 1.1, az + (bz - az) * t), 0.035, 5, True) for t in ts]
    rails += [B((ax, y + h, az), (bx, y + h, bz), 0.032, 5, True) for h in (0.55, 1.1)]
    tb_ = []
    if toe:
        L = math.hypot(bx - ax, bz - az)
        tb_.append(box(L / 2, 0.05, 0.012, ((ax + bx) / 2, y + 0.05, (az + bz) / 2), 0.004, (0, -math.atan2(bz - az, bx - ax), 0)))
    return rails, tb_


def ladder(x0, x1, z, ya, yb, rung0, rung1, axis="x"):
    """A fixed ladder: two rails from ya to yb, rungs every 0.3 m from rung0 up to rung1. axis "x": the rails at x0 and x1 in
    the plane z; "z": at z0 = x0 and z1 = x1 in the plane x = z."""
    P = (lambda u, y: (u, y, z)) if axis == "x" else (lambda u, y: (z, y, u))
    out = [B(P(x0, ya), P(x0, yb), 0.032, 5), B(P(x1, ya), P(x1, yb), 0.032, 5)]
    y = rung0
    while y <= rung1 + 1e-6:
        out.append(B(P(x0, y), P(x1, y), 0.02, 4))
        y += 0.3
    return out


# ---------------------------------------------------------------------------------------------------------------
root = PV("crane", (0, 0, 0), None)
root["height"] = H
root["jib"] = JIB

# ---- the foundation and the cross frame: two box girders crossing under the mast along its diagonals (each leg stands on an arm),
# two slabs of ballast on each arm's end, bound by a top plate and tie rods ----
PAD = 0.45
rb("pad", 4.3, PAD / 2, 4.3, (0, PAD / 2, 0), "concrete", root, 0.07, e=0.05)
ARM_T = PAD + 0.8
for k, a in enumerate((PI / 4, -PI / 4)):
    rb(f"arm{k}", 4.9, 0.4, 0.32, (0, PAD + 0.4, 0), "body", root, 0.05, e=0.05, rot=(0, a, 0))
for i, (sx, sz) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
    r = 4.0 / math.sqrt(2)
    px, pz, a = sx * r, sz * r, -math.atan2(sz, sx)
    for k in range(2):
        rb(f"ballast{i}_{k}", 0.85, 0.41, 1.05, (px, ARM_T + 0.42 + k * 0.84, pz), "concrete", root, 0.05, e=0.04, rot=(0, a, 0))
    top = ARM_T + 1.68
    rb(f"ballastPlate{i}", 0.9, 0.05, 1.18, (px, top + 0.05, pz), "steel", root, 0.03, e=0.04, rot=(0, a, 0))
    # tie rods down each side of the stack, from anchors in the pad to the top plate
    for t in (-1, 1):
        ox, oz = -sz / math.sqrt(2) * 1.13 * t, sx / math.sqrt(2) * 1.13 * t
        M(f"tie{i}_{t}", B((px + ox, PAD, pz + oz), (px + ox, top + 0.1, pz + oz), 0.045, 5, True), "steel", root, 0)

# ---- the mast: 8 lattice sections, square chords, a diagonal per face, a horizontal at every joint and splice plates. The lattice
# ends at the top deck; above it a short portal (no diagonals, so the top platform can be walked onto) carries the slewing ring
# on a square frame open in the middle for the ladder ----
MW = 1.0
Y0 = ARM_T + 0.2                     # the legs stand on shoes on the arms
TOPD = H - 2.1                       # the top platform's deck (1.9 m of headroom under the top frame)
SECT = 8
levels = [Y0 + (TOPD - 0.15 - Y0) * i / SECT for i in range(SECT + 1)]
corners = [(-MW, -MW), (MW, -MW), (MW, MW), (-MW, MW)]
M("shoes", join([box(0.32, 0.1, 0.32, (cx, ARM_T + 0.1, cz), 0.02) for cx, cz in corners]), "steel", root, 0.03)
M("mastChords", join([B((cx, Y0 - 0.2, cz), (cx, H, cz), 0.19, 6) for cx, cz in corners]), "body", root, 0.05)
diags = []
for i in range(SECT):
    ya, yb = levels[i], levels[i + 1]
    for f in range(4):
        (ax, az), (bx, bz) = corners[f], corners[(f + 1) % 4]
        if (i + f) % 2:
            diags.append(B((ax, ya, az), (bx, yb, bz), 0.09))
        else:
            diags.append(B((bx, ya, bz), (ax, yb, az), 0.09))
for y in levels + [H - 0.12]:
    for f in range(4):
        (ax, az), (bx, bz) = corners[f], corners[(f + 1) % 4]
        diags.append(B((ax, y, az), (bx, y, bz), 0.1))
M("mastBracing", join(diags), "body", root, 0.03)
M("splicePlates", join([box(0.3, 0.18, 0.3, (cx, y, cz), 0.03) for y in levels[1:-1] for cx, cz in corners]), "steel", root, 0.03)
# the slewing ring's seat: a square frame on the chord tops, open in the middle (the ladder climbs through it)
M("ringSeat", slab(-1.25, 1.25, -1.25, 1.25, H - 0.1, H, [(-0.98, 0.98, -0.98, 0.98)]), "steel", root, 0.03)

# the ladder, inside the +z face: rails at LX +- 0.23 in the plane z = LZ (0.3 m of toe room to the face's bracing), climbed
# facing +z from the middle of the mast; bracketed to every horizontal
LX, LZ = -0.35, 0.6
HATCH = (LX - 0.4, LX + 0.4, -0.2, MW - 0.05)        # the opening it climbs through in each deck (x0, x1, z0, z1)
NOTCH = [(sx * MW - 0.25, sx * MW + 0.25, sz * MW - 0.25, sz * MW + 0.25) for sx in (-1, 1) for sz in (-1, 1)]   # round the chords
D0 = levels[0] + 0.15                                # the floor deck, on the bottom horizontals
lad = ladder(LX - 0.23, LX + 0.23, LZ, D0, TOPD - 0.05, D0 + 0.3, TOPD - 0.25)
lad += [B((x, y, LZ), (x, y, MW - 0.08), 0.025, 4) for y in levels[1:] for x in (LX - 0.23, LX + 0.23)]
M("ladder", join(lad), "steel", root, 0)

# the decks inside the mast, resting on the horizontals: the floor deck at the foot, a rest deck every second section (a hatch
# for the ladder, its lid swung up against the back of the climbing space), the top deck (hatch shut: it is stood on) with the
# platform round the outside of the mast
decks, lids, hinges = [slab(-0.95, 0.95, -0.95, 0.95, levels[0] + 0.1, D0, NOTCH)], [], []
for k in (2, 4, 6):
    y = levels[k] + 0.15
    decks.append(slab(-0.95, 0.95, -0.95, 0.95, y - 0.05, y, NOTCH + [HATCH]))
    lids.append(box(0.39, (HATCH[3] - HATCH[2]) / 2, 0.015, (LX, y + (HATCH[3] - HATCH[2]) / 2, HATCH[2] - 0.03), 0.004))
    hinges += [B((LX + dx - 0.07, y + 0.02, HATCH[2] - 0.03), (LX + dx + 0.07, y + 0.02, HATCH[2] - 0.03), 0.025, 6, True) for dx in (-0.25, 0.25)]
PW = 1.8                                              # the top platform's half width
notch_top = [(sx * MW - 0.22, sx * MW + 0.22, sz * MW - 0.22, sz * MW + 0.22) for sx in (-1, 1) for sz in (-1, 1)]
decks.append(slab(-PW, PW, -PW, PW, TOPD - 0.05, TOPD, notch_top + [HATCH]))
lids.append(box(0.39, 0.015, (HATCH[3] - HATCH[2]) / 2, (LX, TOPD + 0.015, (HATCH[2] + HATCH[3]) / 2), 0.004))
hinges += [B((LX + dx - 0.07, TOPD + 0.02, HATCH[2] + 0.02), (LX + dx + 0.07, TOPD + 0.02, HATCH[2] + 0.02), 0.025, 6, True) for dx in (-0.25, 0.25)]
M("decks", join(decks), "steel", root, 0.03)
M("hatchLids", join(lids), "body", root, 0.02)
M("hatchHinges", join(hinges), "dark", root, 0)
# the top platform's handrail and toe boards, and its brackets: a rim angle under each edge, a knee brace from each leg
rails, toes = [], []
ring = [(-PW, -PW), (PW, -PW), (PW, PW), (-PW, PW)]
for a in range(4):
    r_, t_ = railing(ring[a], ring[(a + 1) % 4], TOPD, posts=[0, 0.5, 1])
    rails += r_
    toes += t_
M("topRail", join(rails), "body", root, 0)
M("topToe", join(toes), "steel", root, 0.015)
brk = [box(PW, 0.06, 0.04, (0, TOPD - 0.11, s * (PW - 0.04)), 0.01) for s in (-1, 1)]
brk += [box(0.04, 0.06, PW, (s * (PW - 0.04), TOPD - 0.11, 0), 0.01) for s in (-1, 1)]
brk += [B((sx * MW, TOPD - 1.2, sz * MW), (sx * (PW - 0.06), TOPD - 0.12, sz * (PW - 0.06)), 0.06, 5) for sx in (-1, 1) for sz in (-1, 1)]
M("topBrackets", join(brk), "body", root, 0.02)

# the access ladder from the pad up the outside of the +z face to the floor deck (its rails run on 1.1 m above the deck as
# grab handles; the climber steps in through the face, where the bottom diagonal leaves the +x side open)
AX = 0.27
acc = ladder(AX - 0.23, AX + 0.23, MW + 0.3, PAD, D0 + 1.1, PAD + 0.3, D0 - 0.2)
acc += [B((x, y, MW + 0.3), (x, y, MW + 0.06), 0.025, 4) for x in (AX - 0.23, AX + 0.23) for y in (levels[0], D0 + 0.9)]
M("accessLadder", join(acc), "steel", root, 0)

# ---------------------------------------------------------------------------------------------------------------
# the slewing assembly (local frame: y = 0 on top of the mast)
slew = PV("slew", (0, H, 0), root, role="slew")

M("slewRing", lathe([(0.98, 0.0), (1.32, 0.0), (1.46, 0.08), (1.46, 0.5), (1.36, 0.6), (0.98, 0.6), (0.98, 0.0)], 20), "dark", slew, 0.04)
M("slewGear", xf(torus(1.18, 0.09, 20, 6), (0, 0.62, 0)), "steel", slew, 0.02)
# the slewing platform: its deck (y 1.02) is the floor of the tower head, the root of the counter-jib and the start of the
# cab's catwalk; a hatch in it over the ring's middle lets the ladder through
TT = 1.02
PX0, PX1, PZ = -2.2, 2.2, 1.9
OPEN = (-0.85, 0.3, -0.45, 0.45)
M("turntable", slab(PX0, PX1, -PZ, PZ, 0.62, TT, [OPEN]), "body", slew, 0.05)
# the slewing ladder: hung from the platform through the ring, from just over the top deck to grab handles above the platform
# (rungs in the plane x = 0, climbed facing +x from the -x side, so it turns about its own middle and clears the fixed parts)
SL0 = TOPD - H + 0.08
sl = ladder(-0.23, 0.23, 0.0, SL0, TT + 1.1, SL0 + 0.3, TT - 0.1, axis="z")
sl += [B((0.0, y, z), (x1, y, z), 0.03, 4) for z in (-0.23, 0.23) for y, x1 in ((0.8, OPEN[1] + 0.02), (0.25, 0.97))]
M("slewLadder", join(sl), "steel", slew, 0)

# the tower head: a tapering four-legged pylon with its pendant bars to the jib and counter-jib. Its lowest panel on the +z face
# has no diagonal: that is the doorway from the ladder out onto the platform
HEAD = 9.8
hw = lambda y: 0.8 + (0.16 - 0.8) * (y - 1.0) / (HEAD - 1.0)
hc = lambda y: [(sx * hw(y), y, sz * hw(y)) for sx, sz in corners]
head = [B(hc(1.0)[i], hc(HEAD)[i], 0.15, 5) for i in range(4)]
ly = [1.0 + (HEAD - 1.0) * i / 4 for i in range(5)]
for i in range(4):
    a, b = ly[i], ly[i + 1]
    for f in range(4):
        if i == 0 and f == 2:
            continue
        pa, pb = hc(a), hc(b)
        if (i + f) % 2:
            head.append(B(pa[f], pb[(f + 1) % 4], 0.075))
        else:
            head.append(B(pa[(f + 1) % 4], pb[f], 0.075))
for y in ly[1:-1]:
    p = hc(y)
    for f in range(4):
        head.append(B(p[f], p[(f + 1) % 4], 0.085))
M("towerHead", join(head), "body", slew, 0.04)
rb("headCap", 0.34, 0.26, 0.34, (0, HEAD + 0.2, 0), "dark", slew, 0.04, e=0.1)
M("headSheaves", xf(lathe([(0.0, -0.1), (0.3, -0.1), (0.3, 0.1), (0.0, 0.1)], 12), (0, HEAD + 0.55, 0), (PI / 2, 0, 0)), "steel", slew, 0.02)
M("doorGussets", join([B((sx * hw(2.9), 2.9, hw(2.9)), (sx * hw(3.2) * 0.45, ly[1], hw(3.2)), 0.06, 5) for sx in (-1, 1)]), "body", slew, 0.02)

# the jib: a triangular truss, two bottom chords and one top chord, Warren diagonals; the trolley runs on flanges welded to
# the outside of the bottom chords
NX = 12
J0 = 1.2
xs = [J0 + (JIB - J0) * i / NX for i in range(NX + 1)]
YB, YT, JW = 1.3, 3.05, 0.85
jb = [B((J0, YB, -JW), (JIB, YB, -JW), 0.18, 6, True), B((J0, YB, JW), (JIB, YB, JW), 0.18, 6, True), B((J0, YT, 0), (JIB, YT, 0), 0.18, 6, True)]
jd = []
for i in range(NX):
    xa, xm, xb = xs[i], (xs[i] + xs[i + 1]) / 2, xs[i + 1]
    for z in (-JW, JW):
        jd.append(B((xa, YB, z), (xm, YT, 0), 0.095))
        jd.append(B((xm, YT, 0), (xb, YB, z), 0.095))
    jd.append(B((xa, YB, -JW), (xa, YB, JW), 0.1))
jd.append(B((xs[-1], YB, -JW), (xs[-1], YB, JW), 0.1))
M("jibChords", join(jb), "body", slew, 0.05)
M("jibLattice", join(jd), "body", slew, 0.03)
RZ = 1.12                            # the trolley's running flanges (their middle), outside the bottom chords
M("jibRails", join([box((JIB - J0 - 1.0) / 2, 0.03, 0.1, ((JIB + J0 + 1.0) / 2, YB, s * (RZ - 0.02))) for s in (-1, 1)]), "steel", slew, 0.02)
rb("jibRoot", 0.55, 1.15, 1.05, (J0 - 0.1, 2.15, 0), "steel", slew, 0.04, e=0.06)
rb("jibTip", 0.14, 0.98, 1.0, (JIB + 0.1, 2.15, 0), "steel", slew, 0.04, e=0.05)
for z in (-RZ, RZ):
    rb(f"stop{z}", 0.18, 0.15, 0.08, (JIB - 0.5, YB + 0.18, z), "dark", slew, 0.02, e=0.1)
    rb(f"stopN{z}", 0.18, 0.15, 0.08, (J0 + 2.7, YB + 0.18, z), "dark", slew, 0.02, e=0.1)
lugs = join([box(0.18, 0.28, 0.14, (x, YT + 0.3, 0), 0.02) for x in (9.0, 20.0)])
M("jibLugs", lugs, "steel", slew, 0.02)

# the counter-jib: two side girders pinned to the platform's -x end, the walkway between them on cross beams, level with the
# platform; their top chords stand at handrail height over it, with a knee rail between. Counterweights on the end, the hoist
# house to one side so the walkway runs past it
CX = [PX0 - 2.6 * i for i in range(5)]
CJW = 1.2
CB = TT - 0.05
CT = TT + 1.1
cj = []
for z in (-CJW, CJW):
    cj.append(B((CX[0], CB, z), (CX[-1], CB, z), 0.17, 6, True))
    cj.append(B((CX[0], CT, z), (CX[-1], CT, z), 0.15, 6, True))
for i, x in enumerate(CX):
    for z in (-CJW, CJW):
        cj.append(B((x, CB, z), (x, CT, z), 0.07))
    cj.append(B((x, CB - 0.1, -CJW), (x, CB - 0.1, CJW), 0.08))
cj.append(B((CX[-1], CT, -CJW), (CX[-1], CT, CJW), 0.08))
for i in range(4):
    for z in (-CJW, CJW):
        if i % 2:
            cj.append(B((CX[i], CT, z), (CX[i + 1], CB, z), 0.06))
        else:
            cj.append(B((CX[i], CB, z), (CX[i + 1], CT, z), 0.06))
M("counterJib", join(cj), "body", slew, 0.04)
M("counterDeck", slab(CX[-1] + 0.1, CX[0], -(CJW - 0.12), CJW - 0.12, TT - 0.05, TT), "steel", slew, 0.03)
M("counterRail", join([B((CX[0], TT + 0.55, z), (CX[-1], TT + 0.55, z), 0.032, 5, True) for z in (-(CJW - 0.04), CJW - 0.04)]), "body", slew, 0)
# counterweights: stacks of slabs with a seam between each, bound by a top plate
for name, x, n in (("cwA", -11.2, 3), ("cwB", -8.8, 2)):
    for k in range(n):
        rb(f"{name}{k}", 1.1, 0.41, 0.95, (x, TT + 0.42 + k * 0.84, 0), "concrete", slew, 0.05, e=0.04)
    rb(f"{name}Plate", 1.15, 0.05, 1.0, (x, TT + n * 0.84 + 0.05, 0), "steel", slew, 0.03, e=0.04)
    for sx in (-1, 1):
        for sz in (-1, 1):
            M(f"{name}Rod{sx}{sz}", B((x + sx * 0.95, TT, sz * 0.8), (x + sx * 0.95, TT + n * 0.84 + 0.05, sz * 0.8), 0.035, 4, True), "steel", slew, 0)
# the hoist house on the walkway's -z side (0.85 m of walkway past it), its louvres and door facing the walkway, the exhaust,
# and an electrical cabinet
HZ0, HZ1 = -(CJW - 0.12), 0.2
HC, HD = (HZ0 + HZ1) / 2, (HZ1 - HZ0) / 2
rb("hoistHouse", 1.4, 0.85, HD, (-5.0, TT + 0.85, HC), "body", slew, 0.05, e=0.06)
rb("hoistRoof", 1.5, 0.07, HD + 0.1, (-5.0, TT + 1.77, HC), "dark", slew, 0.03, e=0.06)
vents = [box(0.75, 0.035, 0.02, (-5.6, TT + 0.55 + k * 0.26, HZ1 + 0.01), 0.01) for k in range(5)]
vents += [box(0.42, 0.8, 0.02, (-4.0, TT + 0.82, HZ1 + 0.02), 0.01)]
M("hoistVents", join(vents), "dark", slew, 0)
M("hoistStack", B((-6.0, TT + 1.75, HC - 0.2), (-6.0, TT + 2.8, HC - 0.2), 0.13, 6, True), "dark", slew, 0.03)
rb("cabinet", 0.4, 0.7, 0.35, (-3.0, TT + 0.7, HC - 0.1), "steel", slew, 0.04, e=0.06)

# the pendant bars: apex down to the jib lugs and to the counter-jib's top chords
pend = [B((0, HEAD + 0.1, 0), (9.0, YT + 0.4, 0), 0.085, 5, True), B((0, HEAD + 0.1, 0), (20.0, YT + 0.4, 0), 0.085, 5, True)]
for z in (-CJW, CJW):
    pend.append(B((0, HEAD + 0.1, 0), (CX[1], CT, z), 0.085, 5, True))
    pend.append(B((0, HEAD + 0.1, 0), (CX[3], CT, z), 0.085, 5, True))
M("pendants", join(pend), "dark", slew, 0.02)

# the platform's handrails: round the free edges, open where the counter-jib's walkway and the cab's catwalk leave it; across
# the jib's heel the rails pass over its bottom chords (posts clear of them, no toe board there)
CW0, CW1 = -0.4, 0.4                 # the catwalk's sides (x)
rails, toes = [], []
for a, b, kw in (
    ((PX0, -PZ), (PX1, -PZ), {}),
    ((PX0, PZ), (CW0, PZ), {}),
    ((CW1, PZ), (PX1, PZ), {}),
    ((PX0, -PZ), (PX0, -CJW - 0.2), {"posts": [0, 1]}),
    ((PX0, CJW + 0.2), (PX0, PZ), {"posts": [0, 1]}),
):
    r_, t_ = railing(a, b, TT, **kw)
    rails += r_
    toes += t_
r_, _ = railing((PX1, -PZ), (PX1, PZ), TT, posts=[0, (PZ - 1.15) / (2 * PZ), 0.5, (PZ + 1.15) / (2 * PZ), 1], toe=False)
rails += r_
toes += [box(0.012, 0.05, (PZ - 1.08) / 2, (PX1, TT + 0.05, s * (PZ + 1.08) / 2), 0.004) for s in (-1, 1)]

# the operator's cab, cantilevered out beside the jib root on two beams and knee struts from the platform's +z side, its door
# at the end of a railed catwalk; big front window down the jib, side windows, the roof unit and floodlights
CZ0, CZ1 = 2.8, 4.9                  # the cab's inner and outer walls (z)
CXc, CHX = 0.3, 1.15                 # its middle and half length along x
CZc, CHZ = (CZ0 + CZ1) / 2, (CZ1 - CZ0) / 2
# the catwalk: a grating on two stringers from the platform's edge to the cab door, a handrail each side
M("catwalk", join([box((CW1 - CW0) / 2, 0.025, (CZ0 - PZ) / 2, ((CW0 + CW1) / 2, TT - 0.025, (PZ + CZ0) / 2), 0.005)]), "steel", slew, 0.02)
M("catStringers", join([box(0.04, 0.08, (CZ0 - PZ) / 2, (x, TT - 0.13, (PZ + CZ0) / 2), 0.01) for x in (CW0 + 0.04, CW1 - 0.04)]), "body", slew, 0.02)
for x in (CW0 - 0.03, CW1 + 0.03):
    r_, t_ = railing((x, PZ), (x, CZ0), TT, posts=[0, 0.5, 1])
    rails += r_
    toes += t_
M("platformRail", join(rails), "body", slew, 0)
M("platformToe", join(toes), "steel", slew, 0.015)
# the cab's floor frame, the beams under it and the knee struts down to brackets under the platform's edge
beams = [box(0.07, 0.17, (CZ1 - PZ) / 2, (x, TT - 0.27, (PZ + CZ1) / 2), 0.01) for x in (CXc - CHX + 0.2, CXc + CHX - 0.2)]
beams += [B((x, 0.2, PZ - 0.05), (x, TT - 0.44, CZ0 + 1.0), 0.06, 5) for x in (CXc - CHX + 0.2, CXc + CHX - 0.2)]
beams += [box(0.1, 0.24, 0.08, (x, 0.38, PZ - 0.1), 0.01) for x in (CXc - CHX + 0.2, CXc + CHX - 0.2)]
M("cabBeams", join(beams), "body", slew, 0.03)
rb("cabFloor", CHX + 0.05, 0.05, CHZ + 0.05, (CXc, TT - 0.05, CZc), "dark", slew, 0.03, e=0.06)
rb("cabBody", CHX, 1.05, CHZ, (CXc, TT + 1.05, CZc), "white", slew, 0.05, e=0.1)
rb("cabRoof", CHX + 0.1, 0.07, CHZ + 0.1, (CXc, TT + 2.15, CZc), "dark", slew, 0.03, e=0.08)
rb("cabFront", 0.03, 0.72, CHZ - 0.18, (CXc + CHX + 0.02, TT + 1.2, CZc), "glass", slew, 0, e=0.2)
rb("cabSide", CHX - 0.3, 0.6, 0.03, (CXc + 0.1, TT + 1.25, CZ1 + 0.02), "glass", slew, 0, e=0.2)
rb("cabDoor", (CW1 - CW0) / 2 - 0.02, 0.97, 0.025, ((CW0 + CW1) / 2, TT + 0.99, CZ0 - 0.01), "steel", slew, 0.02, e=0.08)
rb("cabDoorPane", 0.25, 0.32, 0.03, ((CW0 + CW1) / 2, TT + 1.45, CZ0 - 0.02), "glass", slew, 0, e=0.2)
rb("cabDoorHandle", 0.07, 0.02, 0.03, (CW1 - 0.12, TT + 1.0, CZ0 - 0.06), "dark", slew, 0, e=0.2)
rb("cabSideB", 0.35, 0.5, 0.03, (CXc + CHX - 0.5, TT + 1.35, CZ0 - 0.02), "glass", slew, 0, e=0.2)
rb("cabAC", 0.55, 0.2, 0.42, (CXc - 0.4, TT + 2.42, CZc), "steel", slew, 0.03, e=0.1)
for k, dz in enumerate((-0.55, 0.55)):
    rb(f"flood{k}", 0.2, 0.13, 0.13, (CXc + CHX - 0.15, TT + 2.36, CZc + dz), "dark", slew, 0.02, e=0.15)
    rb(f"floodLamp{k}", 0.03, 0.1, 0.1, (CXc + CHX + 0.07, TT + 2.36, CZc + dz), "lamp", slew, 0, e=0.2)

# the wind gauge on the apex: a pole, a cup arm and a vane, topped with the red warning lamp
M("windPole", B((0, HEAD + 0.4, 0), (0, HEAD + 1.7, 0), 0.04, 5, True), "dark", slew, 0)
M("windArm", join([B((0, HEAD + 1.4, -0.4), (0, HEAD + 1.4, 0.4), 0.025, 4, True)]), "dark", slew, 0)
for z in (-0.4, 0.4):
    M(f"windCup{z}", xf(lathe([(0.0, -0.1), (0.1, -0.1), (0.1, 0.05), (0.0, 0.1)], 8), (0, HEAD + 1.4, z)), "steel", slew, 0)
rb("windVane", 0.22, 0.1, 0.015, (-0.25, HEAD + 1.15, 0), "dark", slew, 0, e=0.1)

# warning lamps: the game blinks a lamp on each of these
PV("blinkApex", (0, HEAD + 1.95, 0), slew, role="blinker", radius=0.3)
PV("blinkTip", (JIB + 0.3, 3.3, 0), slew, role="blinker", radius=0.3)
PV("blinkCounter", (CX[-1] - 0.3, CT + 0.9, 0), slew, role="blinker", radius=0.3)

# ---------------------------------------------------------------------------------------------------------------
# the trolley: a carriage hung under the jib's bottom chords, four wheels on the running flanges and side plates outside them,
# cross bars under the chords; between two cheek plates hang the sheaves that turn the hoist rope down into the falls, one on
# each fall, the inner one taking the rope in from the mast side and the outer one sending it on to the jib tip
TROLLEY_X = 14.0
TY = YB - 0.2                        # the trolley's origin (slew frame)
FALL = 0.33                          # each rope fall's offset from the middle (z)
SR = 0.28                            # the sheaves' radius
trolley = PV("trolley", (TROLLEY_X, TY, 0), slew, role="trolley")
WY = YB + 0.03 + 0.2 - TY            # the wheels' axles: on top of the flanges
M("trolleyPlates", join([box(0.85, 0.5, 0.04, (0, WY - 0.3, s * (RZ + 0.13)), 0.02) for s in (-1, 1)]), "dark", trolley, 0.03)
M("trolleyBars", join([box(0.08, 0.08, RZ + 0.13, (x, -0.12, 0), 0.02) for x in (-0.6, 0.6)]), "steel", trolley, 0.02)
for x in (-0.55, 0.55):
    for s in (-1, 1):
        M(f"trolleyWheel{x}_{s}", xf(lathe([(0.0, -0.05), (0.2, -0.05), (0.2, 0.05), (0.0, 0.05)], 10), (x, WY, s * RZ), (PI / 2, 0, 0)), "steel", trolley, 0.02)
        M(f"trolleyAxle{x}_{s}", B((x, WY, s * (RZ - 0.06)), (x, WY, s * (RZ + 0.13)), 0.04, 6, True), "dark", trolley, 0)
SY_ = -0.42                          # the sheaves' axles (trolley frame)
M("sheaveCheeks", join([box(0.5, 0.36, 0.03, (0, -0.42, s * (FALL + 0.12)), 0.02) for s in (-1, 1)]), "body", trolley, 0.03)
for k, (dx, s) in enumerate(((-SR, -1), (SR, 1))):
    M(f"sheave{k}", xf(lathe([(0.0, -0.05), (SR, -0.05), (SR - 0.04, 0.0), (SR, 0.05), (0.0, 0.05)], 14), (dx, SY_, s * FALL), (PI / 2, 0, 0)), "dark", trolley, 0.02)
M("sheaveAxles", join([B((dx, SY_, -(FALL + 0.16)), (dx, SY_, FALL + 0.16), 0.05, 6, True) for dx in (-SR, SR)]), "steel", trolley, 0)
# the falls from the sheaves down to the rope pivot (the game stretches the rest)
M("ropeStubs", join([B((0, SY_, s * FALL), (0, -0.71, s * FALL), 0.05, 4, True) for s in (-1, 1)]), "rope", trolley, 0.02)

# the rope: two falls, one metre long, hanging from the trolley (the game stretches them to the hook)
cable = PV("cable", (0, -0.7, 0), trolley, role="cable")
M("ropes", join([B((0, 0, s * FALL), (0, -1.0, s * FALL), 0.05, 4, True) for s in (-1, 1)]), "rope", cable, 0.02)

# the hook block (hook frame: the falls end at y = 0, where they leave the sheave). The sheave stands in the plane of the falls
# (its axle along x), between two cheek plates; under it the crosshead, the swivel and the hook
hook = PV("hook", (0, -0.7, 0), trolley, role="hook")
M("hookSheave", xf(lathe([(0.0, -0.05), (SR, -0.05), (SR - 0.04, 0.0), (SR, 0.05), (0.0, 0.05)], 14), (0, 0, 0), (0, 0, PI / 2)), "dark", hook, 0.02)
RC = FALL + 0.12                     # the cheek plates: round-topped about the axle, square below
cheek = [(RC * math.cos(math.radians(a)), RC * math.sin(math.radians(a))) for a in range(0, 181, 15)] + [(-RC, -0.62), (RC, -0.62)]
M("hookCheeks", join([xf(extrude(cheek, 0.07, "x"), (s * 0.12, 0, 0)) for s in (-1, 1)]), "body", hook, 0.04)
M("hookAxle", join([xf(lathe([(0.0, -0.05), (0.11, -0.05), (0.11, 0.05), (0.0, 0.05)], 10), (s * 0.18, 0, 0), (0, 0, PI / 2)) for s in (-1, 1)]), "steel", hook, 0.02)
M("hookTie", join([box(0.12, 0.04, 0.05, (0, 0.38, 0))] + [box(0.12, 0.05, 0.05, (0, -0.48, s * 0.3)) for s in (-1, 1)]), "steel", hook, 0.02)
rb("hookCrosshead", 0.2, 0.2, FALL + 0.12, (0, -0.8, 0), "body", hook, 0.04, e=0.1)
M("hookSwivel", lathe([(0.0, -1.32), (0.16, -1.32), (0.18, -1.2), (0.18, -1.08), (0.12, -1.0), (0.0, -1.0)], 10), "steel", hook, 0.02)
# the hook: the shank down from the swivel, the back bending out to -x, round the saddle (under the swivel) and up to the tip;
# a sprung latch across the throat
HC_ = (0.0, -1.88)                   # the bowl's middle
HR = 0.24
path = [(0.0, -1.3), (0.0, -1.48), (-0.09, -1.6)]
rad = [0.085, 0.09, 0.1]
for k in range(12):
    a = math.radians(150 + (395 - 150) * k / 11)
    path.append((HC_[0] + HR * math.cos(a), HC_[1] + HR * math.sin(a)))
    rad.append(0.11 - 0.06 * max(0.0, (k - 6) / 5) if k > 6 else 0.11)
M("hookIron", tube([(x, y, 0) for x, y in path], rad, 8, True), "dark", hook, 0.03)
tip = path[-1]
M("hookLatch", B((0.07, -1.47, 0), (tip[0] - 0.02, tip[1] + 0.04, 0), 0.025, 4, True), "body", hook, 0)
SADDLE = (0.0, HC_[1] - HR + 0.1)   # where the sling eyes sit in the bowl

# ---- the load: the Prospector's cargo container (faction-coloured corrugated steel, corner castings, roof rails, barred rear doors,
# a branding plate and the container number on each flank), hung from its spreader (spreader.py) by four bridle slings. Built in the
# container's own frame (long axis z, deck level 0, box centre at y 3.3, as in build_landtrain.py), then the pivot is turned a
# quarter so it lies along the jib.
LOAD_Y = -10.55
LOAD_DROP = -(LOAD_Y + 1.9)          # hook origin to the container's bottom: 8.65
load = PV("load", (0, LOAD_Y, 0), hook, role="load")
load.rotation_euler = (0, 0, PI / 2)  # (three.js: a quarter turn about y)
LB = (1.55, 1.4, 3.62)               # the box's half extents


def rbj(items, e=0.3, nu=6, nv=4):
    return join([xf(rbox(hx, hy, hz, e, nu, nv), pos) for hx, hy, hz, pos in items])


rb("box", *LB, (0, 3.3, 0), "load", load, 0.07, e=0.06)
M("ribs", rbj([(0.035, 1.28, 0.055, (sx * 1.57, 3.3, -3.3 + k * 0.388)) for sx in (-1, 1) for k in range(18)], nu=4, nv=2), "load", load, 0.02)
M("roofRibs", rbj([(1.42, 0.03, 0.06, (0, 4.72, -3.2 + k * 0.7)) for k in range(10)], nu=4, nv=2), "load", load, 0.02)
M("roofRails", rbj([(0.08, 0.06, 3.62, (sx * 1.52, 4.74, 0)) for sx in (-1, 1)], e=0.2), "dark", load, 0.03)
M("castings", rbj([(0.2, 0.17, 0.22, (sx * 1.5, y, sz * 3.55)) for sx in (-1, 1) for sz in (-1, 1) for y in (1.95, 4.62)], e=0.2), "dark", load, 0.03)
# the doors at both ends (decals.py container_doors): joined into one mesh per end, slot and outline, like the rest of the load
doors = {}
for name, geo, slot, ink in container_doors("load"):
    doors.setdefault((name[4], slot, ink), []).append(geo)       # (name[4]: the end, F or R)
for (e, slot, ink), geos in sorted(doors.items()):
    M(f"doors{e}_{slot}_{round(ink * 1000)}", join(geos), slot, load, ink)
for sx in (-1, 1):
    rb(f"plate{sx}", 0.04, CARGO_PLATE_HALF[1], CARGO_PLATE_HALF[0], (sx * 1.64, CARGO_PLATE_Y, 0.0), "dark", load, 0.03, e=0.08)

# the spreader (spreader.py) on the top castings (their tops at 4.79)
PIN = spreader("crane_", load, 4.79)

# the four bridle slings from the hook's saddle to the spreader's pad-eye pins (in the hook's frame the container's z runs along x,
# and x along -z)
M("slings", join([B((SADDLE[0], SADDLE[1], 0), (sz * SPR_Z, LOAD_Y + PIN, -sx * SPR_X), 0.04, 4, True) for sx in (-1, 1) for sz in (-1, 1)]), "dark", hook, 0)


for f in FACTIONS:
    cargo_decals(f, pivot(f"crane_livery_{f}", (0, 0, 0), load, role="livery", faction=f), "crane_")
hook["drop"] = round(LOAD_DROP, 3)

# ---------------------------------------------------------------------------------------------------------------
objs = [o for o in C.objects]
tris = sum(len(o.data.polygons) for o in objs if o.type == "MESH")
print("meshes:", sum(1 for o in objs if o.type == "MESH"), "polygons:", tris)
export(OUT, objs)
if os.environ.get("CRANE_BLEND"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["CRANE_BLEND"])
