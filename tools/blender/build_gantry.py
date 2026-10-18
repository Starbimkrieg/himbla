# Gantry crane builder for Blender (4.2+ / 5.x): a rail-mounted portal gantry crane, exported to src/assets/gantry.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_gantry.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_gantry.py
#
# The tower crane's little sibling for a container yard (the Meridian Exchange's), in the same family as build_crane.py: the same
# lattice work, ladders, hatched decks and handrails, the same slot colours, and the very same trolley, rope falls, hook block and
# bridle slings, lifting the land-train's cargo container (cargo.py) on a spreader (spreader.py). Everything is authored in three.js axes; the origin is on the ground, midway between the rails. The girder runs along z between two legs at
# z = +-LEG, each on a sill with two rail bogies; the whole crane travels along x on its rails (the game moves the root).
#
# Built so a climber could get everywhere: an access ladder up each sill's outer side to the leg's floor deck; a ladder inside each
# leg's outer face, through hatched rest decks, to a top deck under the leg cap whose open portal sides are railed; out through the
# outer face onto a railed platform cantilevered over the girder's end, and up a ladder past the girder's end plate onto the walkway
# along the girder's top chord (handrails both sides). Over the -z leg the walkway passes the hoist house on its machinery deck; at
# the +z leg a railed catwalk leads from the top deck out through the leg's +x face to the cab, which looks down the yard.
#
# Pivots:
#   trolley   the carriage under the girder's bottom chords, a child of the root; the game slides it along z (it sits at z = 0)
#   cable     the two rope falls, a child of `trolley`: one metre long, hanging from its origin; the game scales y
#   hook      the hook block, hook and slings, a child of `trolley`; the game sets its y to minus the rope length
#   load      under `hook`, turned a quarter: the spreader, and under it a `cargo` pivot (cargo.py's box container, lying across the
#             girder like the yard's stacks) with a `livery` pivot per faction; the game builds the livery of the crane's cargo and
#             leaves the rest out
#   blinker   the aircraft warning lamps (the girder's ends, the cab and the hoist house); the game puts a blinking lamp on each
# The file also holds `gantry_box`, one box container of its own (a top-level `cargo` pivot, its origin the middle of its footprint on
# the ground) for the yard's stacks: the game bakes it per stack in a faction's colours.
# Slots: body (the crane's colour) is swapped by the game, the rest are fixed, as the tower crane's (craneSlot in src/models.js); the
# meshes under a `cargo` pivot take the land-train palette of a faction (cargoSlot). The `drop` extra on the hook is the distance from
# its origin to the container's bottom.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_gantry.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("GANTRY_OUT") or os.path.join(REPO, "src", "assets", "gantry.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Gantry crane export ->", OUT)
COLL = "MoonGantryCrane"

# preview colours (the game swaps in its own materials): the crane's slots, and the land-train's for the cargo units
SLOT_COLORS = {
    "body": (1.0, 0.82, 0.25), "dark": (0.16, 0.14, 0.25), "steel": (0.33, 0.38, 0.48), "concrete": (0.66, 0.65, 0.72),
    "white": (1.0, 0.96, 0.88), "glass": (0.81, 0.94, 1.0), "lamp": (1.0, 0.96, 0.66), "rope": (0.1, 0.09, 0.14),
    "metal": (0.54, 0.53, 0.63), "stripe": (1.0, 0.96, 0.88), "label": (0.16, 0.14, 0.25), "accent": (0.42, 0.56, 0.23),
    "hazard": (1.0, 0.82, 0.25), "tail": (1.0, 0.16, 0.29), "tire": (0.1, 0.09, 0.14), "hot": (1.0, 0.62, 0.11),
    "tank": (0.78, 0.84, 0.92), "brand": (0.08, 0.64, 0.72), "redsafe": (0.79, 0.13, 0.18), "orange": (1.0, 0.48, 0.1), "blue": (0.11, 0.39, 0.84),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "cargo.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "spreader.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
LEG = 15.0        # the legs (and the rails) at z = +-LEG
YB, YT, JW = 23.0, 24.9, 0.85   # the girder: bottom chords (the trolley's rails) at y YB, x +-JW; the top chord at y YT
GL = LEG + 2.2    # the girder's half length (it overhangs the legs)
MW = 1.0          # a leg's half width (the tower crane's mast section)
Y0 = 1.9          # the legs stand on the sills from here
SPAN = 10.0       # the trolley's run, z in [-SPAN, SPAN] (GANTRY_TROLLEY_SPAN in src/models.js)


def M(name, geo, slot, parent, ink=0.04, **kw):
    return mesh("gantry_" + name, geo, slot, parent, ink, **kw)


def PV(name, pos, parent=None, **props):
    return pivot("gantry_" + name if parent is not None else name, pos, parent, **props)


def rb(name, hx, hy, hz, pos, slot, parent, ink=0.04, e=0.08, rot=(0, 0, 0), nu=6, nv=3):
    return M(name, xf(rbox(hx, hy, hz, e, nu, nv), pos, rot), slot, parent, ink)


def box(hx, hy, hz, pos, e=0.05, rot=(0, 0, 0)):
    """A plain cuboid (half extents; `e` is ignored). (rbox with four segments round is an octahedron, not a box: the old decks
    and plates built that way were diamonds turned 45 degrees.)"""
    v = [(sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return xf((v, f), pos, rot)


def wheel(r, hw, pos, axis):
    """A wheel of radius r, hw half-wide, its axle along `axis` ('x' or 'z')."""
    g = lathe([(0.0, -hw), (r, -hw), (r, hw), (0.0, hw)], 12)
    return xf(g, pos, (0, 0, PI / 2) if axis == "x" else (PI / 2, 0, 0))


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


def ladder(x0, x1, z, ya, yb, rung0, rung1):
    """A fixed ladder: two rails at x0 and x1 in the plane z from ya to yb, rungs every 0.3 m from rung0 up to rung1."""
    out = [B((x0, ya, z), (x0, yb, z), 0.032, 5), B((x1, ya, z), (x1, yb, z), 0.032, 5)]
    y = rung0
    while y <= rung1 + 1e-6:
        out.append(B((x0, y, z), (x1, y, z), 0.02, 4))
        y += 0.3
    return out


# ---------------------------------------------------------------------------------------------------------------
root = PV("gantry", (0, 0, 0), None)
root["height"] = YB
root["leg"] = LEG
root["travel"] = 0.0

corners = [(-MW, -MW), (MW, -MW), (MW, MW), (-MW, MW)]
TOPD = YB - 2.4                      # each leg's top deck (1.85 m of headroom under the portal's top horizontal)
WALK = YT + 0.25                     # the walkway's deck on the girder's top chord
SECT = 6
levels = [Y0 + (TOPD - 0.15 - Y0) * i / SECT for i in range(SECT + 1)]
D0 = levels[0] + 0.15                # the floor deck in each leg
CAB = None                           # (filled in at the +z leg: where its catwalk leaves the top deck)
for side, sz in (("N", -1), ("P", 1)):
    zc = sz * LEG
    W = lambda w: zc + sz * w        # a distance w from the leg's middle, outward (away from the other leg) along z
    Wr = lambda x0, x1, w0, w1: (x0, x1, min(W(w0), W(w1)), max(W(w0), W(w1)))
    # ---- the sill: a box beam along x on two bogies, each with two flanged wheels on the rail, buffers at its ends, a rail sweep ----
    rb(f"sill{side}", 3.4, 0.36, 0.55, (0, 1.5, zc), "body", root, 0.05, e=0.06)
    rb(f"sillCap{side}", 3.5, 0.08, 0.62, (0, 1.9, zc), "dark", root, 0.03, e=0.05)
    for bx in (-2.3, 2.3):
        rb(f"bogie{side}{bx}", 0.95, 0.28, 0.42, (bx, 0.72, zc), "dark", root, 0.04, e=0.06)
        rb(f"bogieArm{side}{bx}", 0.3, 0.28, 0.3, (bx, 1.14, zc), "steel", root, 0.03, e=0.06)
        for wx in (-0.55, 0.55):
            M(f"wheel{side}{bx}{wx}", wheel(0.36, 0.14, (bx + wx, 0.36, zc), "z"), "steel", root, 0.03)
            M(f"flange{side}{bx}{wx}", wheel(0.42, 0.04, (bx + wx, 0.36, zc + 0.17), "z"), "dark", root, 0.02)
        rb(f"sweep{side}{bx}", 1.1, 0.06, 0.2, (bx, 0.07, zc), "dark", root, 0.02, e=0.05)
    for bx in (-3.55, 3.55):
        rb(f"buffer{side}{bx}", 0.15, 0.22, 0.22, (bx, 1.5, zc), "dark", root, 0.03, e=0.1)
    # ---- the leg: the tower crane's lattice mast section from Y0 to the top deck, a short portal over it (no diagonals, so its
    # sides can be walked through) up to the cap the girder sits on ----
    rb(f"foot{side}", 1.35, 0.12, 1.35, (0, Y0 - 0.12, zc), "steel", root, 0.04, e=0.04)
    cn = [(cx, zc + cz) for cx, cz in corners]
    M(f"legChords{side}", join([B((cx, Y0 - 0.1, cz), (cx, YB - 0.1, cz), 0.19, 6) for cx, cz in cn]), "body", root, 0.05)
    diags = []
    for i in range(SECT):
        ya, yb = levels[i], levels[i + 1]
        for f in range(4):
            (ax, az), (bx, bz) = cn[f], cn[(f + 1) % 4]
            if (i + f) % 2:
                diags.append(B((ax, ya, az), (bx, yb, bz), 0.09))
            else:
                diags.append(B((bx, ya, bz), (ax, yb, az), 0.09))
    for y in levels + [YB - 0.45]:
        for f in range(4):
            (ax, az), (bx, bz) = cn[f], cn[(f + 1) % 4]
            diags.append(B((ax, y, az), (bx, y, bz), 0.1))
    M(f"legBracing{side}", join(diags), "body", root, 0.03)
    M(f"splice{side}", join([box(0.3, 0.18, 0.3, (cx, y, cz), 0.03) for y in levels[1:-1] for cx, cz in cn]), "steel", root, 0.03)
    # the head: a steel cap the girder sits on, with a gusset knee up to the girder's underside either way along z (the outer
    # ones stop short of the girder's end, the inner ones short of the trolley's run)
    rb(f"legCap{side}", 1.25, 0.22, 1.25, (0, YB - 0.1, zc), "steel", root, 0.04, e=0.05)
    knees = []
    for cx in (-JW, JW):
        knees.append(B((cx, YB - 3.6, W(-MW)), (cx, YB - 0.2, W(-3.0)), 0.11, 5))
        knees.append(B((cx, YB - 2.2, W(MW)), (cx, YB - 0.2, W(GL - LEG - 0.2)), 0.11, 5))
    M(f"knees{side}", join(knees), "body", root, 0.03)

    # the ladder inside the outer face: rails at LX +- 0.23 in the plane 0.6 m out (0.3 m of toe room to the face's bracing),
    # climbed facing out from the middle of the leg, bracketed to every horizontal; its rails run on 1.1 m over the top deck
    LX, AX = -sz * 0.35, sz * 0.27   # (the access ladder goes on the side where the bottom diagonal leaves the face open)
    lad = ladder(LX - 0.23, LX + 0.23, W(0.6), D0, TOPD + 1.1, D0 + 0.3, TOPD - 0.1)
    lad += [B((x, y, W(0.6)), (x, y, W(MW - 0.08)), 0.025, 4) for y in levels[1:] for x in (LX - 0.23, LX + 0.23)]
    M(f"ladder{side}", join(lad), "steel", root, 0)
    # the decks inside the leg on the horizontals: the floor deck, two rest decks and the top deck, each with a hatch for the
    # ladder (its lid swung up behind the climbing space)
    HATCH = Wr(LX - 0.4, LX + 0.4, -0.2, MW - 0.05)
    NOTCH = [(cx - 0.25, cx + 0.25, cz - 0.25, cz + 0.25) for cx, cz in cn]
    decks, lids, hinges = [slab(-0.95, 0.95, zc - 0.95, zc + 0.95, levels[0] + 0.1, D0, NOTCH)], [], []
    for y in (levels[2] + 0.15, levels[4] + 0.15, TOPD):
        decks.append(slab(-0.95, 0.95, zc - 0.95, zc + 0.95, y - 0.05, y, NOTCH + [HATCH]))
        lids.append(box(0.39, (MW + 0.15) / 2, 0.015, (LX, y + (MW + 0.15) / 2, W(-0.23)), 0.004))
        hinges += [B((LX + dx - 0.07, y + 0.02, W(-0.23)), (LX + dx + 0.07, y + 0.02, W(-0.23)), 0.025, 6, True) for dx in (-0.25, 0.25)]

    # the access ladder from just over the rail up the sill's outer side, clear of the foot plate, to the floor deck (rails on
    # 1.1 m above it as grab handles; the climber steps across the foot plate and in through the outer face)
    acc = ladder(AX - 0.23, AX + 0.23, W(MW + 0.55), 0.3, D0 + 1.1, 0.45, D0 - 0.2)
    acc += [B((x, y, W(MW + 0.55)), (x, y, W(MW + 0.06)), 0.025, 4) for x in (AX - 0.23, AX + 0.23) for y in (levels[0], D0 + 0.9)]
    acc += [B((x, 1.2, W(MW + 0.55)), (x, 1.2, W(0.56)), 0.025, 4) for x in (AX - 0.23, AX + 0.23)]
    M(f"accessLadder{side}", join(acc), "steel", root, 0)

    # the top deck's guard rails across the portal's open sides (not where the outer platform and the cab's catwalk leave it)
    gr = []
    for h in (0.55, 1.1):
        y = TOPD + h
        gr.append(B((-0.81, y, W(-0.95)), (0.81, y, W(-0.95)), 0.032, 5, True))
        for x in (-0.95, 0.95):
            if x > 0 and side == "P":
                gr += [B((x, y, W(-0.81)), (x, y, W(-0.45)), 0.032, 5, True), B((x, y, W(0.45)), (x, y, W(0.81)), 0.032, 5, True)]
            else:
                gr.append(B((x, y, W(-0.81)), (x, y, W(0.81)), 0.032, 5, True))

    # the outer platform: cantilevered from the outer face over the girder's end, between the outer knees; the ladder up to the
    # walkway rises from its far end, past the girder's end plate
    PO = 3.4
    decks.append(slab(-0.7, 0.7, *Wr(0, 0, MW, PO)[2:], TOPD - 0.05, TOPD))
    toes = []
    for a, b in (((-0.68, W(MW)), (-0.68, W(PO))), ((0.68, W(MW)), (0.68, W(PO))), ((-0.68, W(PO)), (0.68, W(PO)))):
        r_, t_ = railing(a, b, TOPD, posts=[0, 0.5, 1] if a[0] == b[0] else [0, 1])
        gr += r_
        toes += t_
    brk = [box(0.04, 0.06, (PO - MW) / 2, (s * 0.66, TOPD - 0.11, W((MW + PO) / 2)), 0.01) for s in (-1, 1)]
    brk += [B((s * MW, TOPD - 1.8, W(MW)), (s * 0.62, TOPD - 0.12, W(PO - 0.1)), 0.06, 5) for s in (-1, 1)]
    WL = GL - LEG + 0.5              # the walkway ladder's rungs (out from the leg's middle)
    wl = ladder(-0.23, 0.23, W(WL), TOPD, WALK + 1.1, TOPD + 0.3, WALK - 0.1)
    wl += [B((x, y, W(WL)), (x, y, W(GL - LEG + 0.26)), 0.025, 4) for x in (-0.23, 0.23) for y in (YB + 0.4, YB + 1.6)]
    M(f"walkLadder{side}", join(wl), "steel", root, 0)

    # the cab, at the +z leg: cantilevered off the leg's +x face at the top deck on two beams and knee struts, looking down the
    # yard (-z), its door at the end of a short railed catwalk from the top deck
    if side == "P":
        CX0, CX1, CHZ = 1.9, 4.0, 1.15
        CXc, CHX = (CX0 + CX1) / 2, (CX1 - CX0) / 2
        decks.append(slab(MW, CX0, zc - 0.4, zc + 0.4, TOPD - 0.05, TOPD))
        for s in (-1, 1):
            r_, t_ = railing((MW, zc + s * 0.43), (CX0, zc + s * 0.43), TOPD, posts=[0, 1])
            gr += r_
            toes += t_
        brk += [box((CX1 - MW) / 2, 0.17, 0.07, ((MW + CX1) / 2, TOPD - 0.27, zc + s * 0.95), 0.01) for s in (-1, 1)]
        brk += [B((MW, TOPD - 2.0, zc + s * 0.95), (CX0 + 1.5, TOPD - 0.44, zc + s * 0.95), 0.06, 5) for s in (-1, 1)]
        rb("cabFloor", CHX + 0.05, 0.05, CHZ + 0.05, (CXc, TOPD - 0.05, zc), "dark", root, 0.03, e=0.06)
        rb("cabBody", CHX, 1.05, CHZ, (CXc, TOPD + 1.05, zc), "white", root, 0.05, e=0.1)
        rb("cabRoof", CHX + 0.1, 0.07, CHZ + 0.1, (CXc, TOPD + 2.15, zc), "dark", root, 0.03, e=0.08)
        rb("cabFront", CHX - 0.18, 0.72, 0.03, (CXc, TOPD + 1.2, zc - CHZ - 0.02), "glass", root, 0, e=0.2)
        rb("cabSide", 0.03, 0.6, CHZ - 0.3, (CX1 + 0.02, TOPD + 1.25, zc - 0.1), "glass", root, 0, e=0.2)
        rb("cabDoor", 0.025, 0.97, 0.38, (CX0 - 0.01, TOPD + 0.99, zc), "steel", root, 0.02, e=0.08)
        rb("cabDoorPane", 0.03, 0.32, 0.25, (CX0 - 0.02, TOPD + 1.45, zc), "glass", root, 0, e=0.2)
        rb("cabDoorHandle", 0.03, 0.02, 0.07, (CX0 - 0.06, TOPD + 1.0, zc + 0.26), "dark", root, 0, e=0.2)
        rb("cabSideB", 0.03, 0.5, 0.3, (CX0 - 0.02, TOPD + 1.35, zc - 0.75), "glass", root, 0, e=0.2)
        rb("cabAC", 0.42, 0.2, 0.55, (CXc, TOPD + 2.42, zc + 0.4), "steel", root, 0.03, e=0.1)
        for k, dx in enumerate((-0.5, 0.5)):
            rb(f"flood{k}", 0.13, 0.13, 0.2, (CXc + dx, TOPD + 2.36, zc - CHZ + 0.15), "dark", root, 0.02, e=0.15)
            rb(f"floodLamp{k}", 0.1, 0.1, 0.03, (CXc + dx, TOPD + 2.36, zc - CHZ - 0.07), "lamp", root, 0, e=0.2)
        PV("blinkLegP", (CXc, TOPD + 2.62, zc + 0.75), root, role="blinker", radius=0.28)
    M(f"decks{side}", join(decks), "steel", root, 0.03)
    M(f"hatchLids{side}", join(lids), "body", root, 0.02)
    M(f"hatchHinges{side}", join(hinges), "dark", root, 0)
    M(f"handrails{side}", join(gr), "body", root, 0)
    M(f"toeBoards{side}", join(toes), "steel", root, 0.015)
    M(f"brackets{side}", join(brk), "body", root, 0.02)
    # a floodlight under the girder on each leg's inner side, shining down into the yard
    M(f"floodArm{side}", B((0, YB - 0.6, W(-MW)), (0, YB - 0.6, W(-1.75)), 0.05, 5, True), "dark", root, 0)
    rb(f"flood{side}", 0.3, 0.12, 0.22, (0, YB - 0.72, W(-1.85)), "dark", root, 0.03, e=0.1)
    rb(f"floodLamp{side}", 0.26, 0.02, 0.18, (0, YB - 0.85, W(-1.85)), "lamp", root, 0, e=0.2)

# ---- the girder: the tower crane's jib truss laid across the legs, two bottom chords and one top chord; over the trolley's run
# the bottom chords carry running flanges on their outsides ----
NZ = 14
zs = [-GL + 2 * GL * i / NZ for i in range(NZ + 1)]
gb = [B((-JW, YB, -GL), (-JW, YB, GL), 0.18, 6, True), B((JW, YB, -GL), (JW, YB, GL), 0.18, 6, True), B((0, YT, -GL), (0, YT, GL), 0.18, 6, True)]
gd = []
for i in range(NZ):
    za, zm, zb = zs[i], (zs[i] + zs[i + 1]) / 2, zs[i + 1]
    for x in (-JW, JW):
        gd.append(B((x, YB, za), (0, YT, zm), 0.095))
        gd.append(B((0, YT, zm), (x, YB, zb), 0.095))
    gd.append(B((-JW, YB, za), (JW, YB, za), 0.1))
gd.append(B((-JW, YB, zs[-1]), (JW, YB, zs[-1]), 0.1))
M("girderChords", join(gb), "body", root, 0.05)
M("girderLattice", join(gd), "body", root, 0.03)
RX = 1.12                            # the running flanges (their middle), outside the bottom chords
RUN = SPAN + 1.9
M("girderRails", join([box(0.1, 0.03, RUN, (s * (RX - 0.02), YB, 0)) for s in (-1, 1)]), "steel", root, 0.02)
for sz in (-1, 1):
    rb(f"girderEnd{sz}", 1.0, 1.0, 0.14, (0, YB + 0.95, sz * (GL + 0.1)), "steel", root, 0.04, e=0.05)
    for x in (-RX, RX):
        rb(f"stop{sz}{x}", 0.08, 0.15, 0.18, (x, YB + 0.18, sz * (RUN - 0.2)), "dark", root, 0.02, e=0.1)
    PV(f"blinkEnd{sz}", (0.95, YB + 2.25, sz * (GL + 0.1)), root, role="blinker", radius=0.3)
# the walkway along the top chord: a grating on bearers, handrails both sides, open at each end where the ladder arrives; over the
# -z leg a machinery deck beside it carries the hoist house
M("walkway", slab(-0.45, 0.45, -GL - 0.25, GL + 0.25, WALK - 0.05, WALK), "steel", root, 0.02)
M("walkBearers", join([box(0.5, 0.03, 0.06, (0, WALK - 0.08, z), 0.01) for z in zs]), "steel", root, 0.01)
MZ0, MZ1, MX = -LEG - 1.4, -LEG + 2.2, -2.1
M("machineDeck", slab(MX, -0.45, MZ0, MZ1, WALK - 0.05, WALK), "steel", root, 0.02)
M("machineKnees", join([B((-JW, YB, z), (MX + 0.1, WALK - 0.08, z), 0.06, 5) for z in (MZ0 + 0.2, (MZ0 + MZ1) / 2, MZ1 - 0.2)]), "body", root, 0.02)
wr, wt = [], []
for a, b, kw in (
    ((0.5, -GL - 0.25), (0.5, GL + 0.25), {"every": 2.5}),
    ((-0.5, MZ1), (-0.5, GL + 0.25), {"every": 2.5}),
    ((-0.5, -GL - 0.25), (-0.5, MZ0), {"posts": [0, 1]}),
    ((MX, MZ0), (MX, MZ1), {}),
    ((MX, MZ0), (-0.5, MZ0), {}),
    ((MX, MZ1), (-0.5, MZ1), {}),
):
    r_, t_ = railing(a, b, WALK, **kw)
    wr += r_
    wt += t_
M("walkRail", join(wr), "body", root, 0)
M("walkToe", join(wt), "steel", root, 0.015)
# the hoist house, its louvres and door facing the walkway, the exhaust
HX, HZ = (MX + 0.1 - 0.55) / 2, -LEG + 0.4
rb("hoistHouse", 0.65, 0.9, 1.4, (HX, WALK + 0.9, HZ), "body", root, 0.05, e=0.06)
rb("hoistRoof", 0.75, 0.07, 1.5, (HX, WALK + 1.87, HZ), "dark", root, 0.03, e=0.06)
vents = [box(0.02, 0.035, 0.75, (HX + 0.66, WALK + 0.5 + k * 0.26, HZ - 0.4), 0.01) for k in range(5)]
vents += [box(0.02, 0.8, 0.42, (HX + 0.67, WALK + 0.82, HZ + 0.85), 0.01)]
M("hoistVents", join(vents), "dark", root, 0)
M("hoistStack", B((HX - 0.35, WALK + 1.85, HZ - 1.0), (HX - 0.35, WALK + 2.9, HZ - 1.0), 0.13, 6, True), "dark", root, 0.03)
PV("blinkLegN", (HX, WALK + 2.2, HZ + 0.6), root, role="blinker", radius=0.28)

# ---------------------------------------------------------------------------------------------------------------
# the trolley: the tower crane's carriage, turned to run along z: four wheels on the running flanges with side plates outside
# them, cross bars under the chords, and between two cheek plates the sheaves that turn the hoist rope down into the falls
TY = YB - 0.2                        # the trolley's origin
FALL = 0.33                          # each rope fall's offset from the middle (x)
SR = 0.28                            # the sheaves' radius
trolley = PV("trolley", (0, TY, 0), root, role="trolley")
WY = YB + 0.03 + 0.2 - TY            # the wheels' axles: on top of the flanges
M("trolleyPlates", join([box(0.04, 0.5, 0.85, (s * (RX + 0.13), WY - 0.3, 0), 0.02) for s in (-1, 1)]), "dark", trolley, 0.03)
M("trolleyBars", join([box(RX + 0.13, 0.08, 0.08, (0, -0.12, z), 0.02) for z in (-0.6, 0.6)]), "steel", trolley, 0.02)
for s in (-1, 1):
    for z in (-0.55, 0.55):
        M(f"trolleyWheel{s}_{z}", wheel(0.2, 0.05, (s * RX, WY, z), "x"), "steel", trolley, 0.02)
        M(f"trolleyAxle{s}_{z}", B((s * (RX - 0.06), WY, z), (s * (RX + 0.13), WY, z), 0.04, 6, True), "dark", trolley, 0)
SY_ = -0.42                          # the sheaves' axles (trolley frame)
M("sheaveCheeks", join([box(0.03, 0.36, 0.5, (s * (FALL + 0.12), -0.42, 0), 0.02) for s in (-1, 1)]), "body", trolley, 0.03)
for k, s in enumerate((-1, 1)):
    M(f"sheave{k}", xf(lathe([(0.0, -0.05), (SR, -0.05), (SR - 0.04, 0.0), (SR, 0.05), (0.0, 0.05)], 14), (s * FALL, SY_, s * SR), (0, 0, PI / 2)), "dark", trolley, 0.02)
M("sheaveAxles", join([B((-(FALL + 0.16), SY_, dz), (FALL + 0.16, SY_, dz), 0.05, 6, True) for dz in (-SR, SR)]), "steel", trolley, 0)
M("ropeStubs", join([B((s * FALL, SY_, 0), (s * FALL, -0.71, 0), 0.05, 4, True) for s in (-1, 1)]), "rope", trolley, 0.02)

# the rope: two falls, one metre long, hanging from the trolley (the game stretches them to the hook)
cable = PV("cable", (0, -0.7, 0), trolley, role="cable")
M("ropes", join([B((s * FALL, 0, 0), (s * FALL, -1.0, 0), 0.05, 4, True) for s in (-1, 1)]), "rope", cable, 0.02)

# the hook block: the tower crane's, turned with the falls (the sheave stands in their plane, its axle along z), between round-topped
# cheek plates; the crosshead, the swivel, the hook (in the plane of the girder) with its latch, and the slings to the spreader
hook = PV("hook", (0, -0.7, 0), trolley, role="hook")
M("hookSheave", xf(lathe([(0.0, -0.05), (SR, -0.05), (SR - 0.04, 0.0), (SR, 0.05), (0.0, 0.05)], 14), (0, 0, 0), (PI / 2, 0, 0)), "dark", hook, 0.02)
RC = FALL + 0.12
cheek = [(RC * math.cos(math.radians(a)), RC * math.sin(math.radians(a))) for a in range(0, 181, 15)] + [(-RC, -0.62), (RC, -0.62)]
M("hookCheeks", join([xf(extrude(cheek, 0.07, "z"), (0, 0, s * 0.12)) for s in (-1, 1)]), "body", hook, 0.04)
M("hookAxle", join([xf(lathe([(0.0, -0.05), (0.11, -0.05), (0.11, 0.05), (0.0, 0.05)], 10), (0, 0, s * 0.18), (PI / 2, 0, 0)) for s in (-1, 1)]), "steel", hook, 0.02)
M("hookTie", join([box(0.05, 0.04, 0.12, (0, 0.38, 0))] + [box(0.05, 0.05, 0.12, (s * 0.3, -0.48, 0)) for s in (-1, 1)]), "steel", hook, 0.02)
rb("hookCrosshead", FALL + 0.12, 0.2, 0.2, (0, -0.8, 0), "body", hook, 0.04, e=0.1)
M("hookSwivel", lathe([(0.0, -1.32), (0.16, -1.32), (0.18, -1.2), (0.18, -1.08), (0.12, -1.0), (0.0, -1.0)], 10), "steel", hook, 0.02)
HC_ = (0.0, -1.88)
HR = 0.24
path = [(0.0, -1.3), (0.0, -1.48), (-0.09, -1.6)]
rad = [0.085, 0.09, 0.1]
for k in range(12):
    a = math.radians(150 + (395 - 150) * k / 11)
    path.append((HC_[0] + HR * math.cos(a), HC_[1] + HR * math.sin(a)))
    rad.append(0.11 - 0.06 * max(0.0, (k - 6) / 5) if k > 6 else 0.11)
M("hookIron", tube([(0, y, x) for x, y in path], rad, 8, True), "dark", hook, 0.03)
tip = path[-1]
M("hookLatch", B((0, -1.47, 0.07), (0, tip[1] + 0.04, tip[0] - 0.02), 0.025, 4, True), "body", hook, 0)
SADDLE = HC_[1] - HR + 0.1           # where the sling eyes sit in the bowl

# ---- the load: the spreader (spreader.py) on the top castings of the land-train's box container (cargo.py, at the land-train's
# size: 7.2 m long), on the bottom of four bridle slings from the hook. The container's origin (the middle of its footprint, under
# its rack) is the load pivot's; the pivot is turned a quarter so the box lies across the girder (along x), like the yard's stacks.
TOP = 4.79 - CARGO_BASE              # the top castings' tops over the container's origin
LOAD_Y = -(2.0 + 3.2 + TOP + SPR_PIN)  # hook origin -> container bottom: the slings' 3.2 m plus the spreader
LOAD_DROP = -LOAD_Y
load = PV("load", (0, LOAD_Y, 0), hook, role="load")
load.rotation_euler = (0, 0, PI / 2)  # (three.js: a quarter turn about y)
PIN = spreader("gantry_", load, TOP)
M("slings", join([B((0, SADDLE, 0), (sz * SPR_Z, LOAD_Y + PIN, -sx * SPR_X), 0.04, 4, True) for sx in (-1, 1) for sz in (-1, 1)]), "dark", hook, 0)
cargo_unit("box", "gantry_cargo", load, (0, 0, 0), 1.0)
hook["drop"] = round(LOAD_DROP, 3)

# ---------------------------------------------------------------------------------------------------------------
# a box container on its own, for the yard's stacks (the game paints and bakes it per stack)
yard = cargo_unit("box", "gantry_box", None, (0, 0, 0), 1.0)

objs = [o for o in C.objects]
tris = sum(len(o.data.polygons) for o in objs if o.type == "MESH")
print("meshes:", sum(1 for o in objs if o.type == "MESH"), "polygons:", tris)
export(OUT, objs)
if os.environ.get("GANTRY_BLEND"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["GANTRY_BLEND"])
