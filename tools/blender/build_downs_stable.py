# Chimera Downs stable yard and paddock kit for Blender (4.2+ / 5.x) -> src/assets/downs-stable.glb (docs/downs-layouts.md, layout B: stables behind the far stand, parade
# ring and weighing room in the infield, lawn picnic tables).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stable.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stable.py
#
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0. One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_stable_4/6   a block of four or six loose boxes 5 m apart along x, front (+z) at z = 0, the body to z = -9, a 2.4 m porch on Saddle posts with knee braces: Barn Red walls, the end
#                   walls clad in Mint, each box a Dutch door with its lower leaf shut and its upper leaf swung back against the wall, opening on a lit stall (plank walls, straw,
#                   a hay rack, a lantern) where the game stands a chimera; a blank name board over each door, a lantern on a bracket, a feed trough; a gable roof, a Mint ridge, louvred
#                   cupolas, 7.4 m to the ridge
#   dn_stable_corner the knuckle of an L of blocks: a two-storey tack room (lit windows on its two outer faces) under a hip roof and a clock turret with a chimera weathervane
#   dn_stable_fence a 4 m bay of Mint post and rail (dn_stable_post: a post alone, to end a run); dn_yard_gate the yard's gate: Barn Red piers, two braced leaves swung in
#   dn_lunge_ring   a round pen 18 m across, its gate standing open on +z; dn_trough a water trough; dn_tack a saddle on a rack
#   dn_hay_barn     the hay barn, 24 m along x, 14 deep (z = 0 to -14), front +z: Barn Red walls with gambrel gable ends (one solid), Mint corner boards wrapping the four corners, a Black-framed
#                   sliding door of two Mint leaves with X braces under a rail, two lit windows, a hayloft door with a hoist beam on each gable end, and a gambrel Barn Red2 roof that is one slab
#                   0.3 m thick (flat soffits at the eaves, 0.6 m past the gables), a Mint ridge and a louvred cupola
#   dn_pavilion     the weighing room, 18 m along x, 10 deep (z = 0 to -10), front +z: a Mint hall 4.35 m tall with a Money2 dado and a gold frieze, three lit windows, a four-column porch whose
#                   beam carries a Black name board (the game writes WEIGHING ROOM on it at y = 4.48, z = 3.27), and a Barn Red hip roof with a gold ridge resting on the walls and the beam
#   dn_ring_gate    the parade ring's gate: two Mint posts 3.6 m apart with gold balls, a Black2 cross bar at 2.3 m (its ends in the posts), front +z
#   dn_hay          a hay bale, 1.2 x 0.6 x 0.6 m, Saddle with two Mint straps lying flush on it
#   dn_picnic       a picnic table 2.4 x 1 m with two benches and a sunshade: the umbrella's canopy takes the `accent` slot
#
# Joints (outline rule, as for the arcades): outlined pieces never meet flush in one plane, or one's ink shell shows as a dark seam. A piece ending on another ends well inside
# it (shell buried) or meets it at a step of 5 cm or more; un-inked trims lie within 6 mm of their host; wall-mounted pieces start inside the wall at their own depths, so no
# two back faces share a plane.
DOWNS_OUT = "downs-stable.glb"
DOWNS_COLL = "MoonDownsStable"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())


def slab_profile(U, T):
    """Roof slab side profile [(z, y)] as one closed outline: underside U (polyline front eave to back eave) and U offset T outward (up), mitred at each knee."""
    n = []
    for (z0, y0), (z1, y1) in zip(U, U[1:]):
        l = math.hypot(z1 - z0, y1 - y0)
        n.append(((y1 - y0) / l, -(z1 - z0) / l))                                       # (outward normal: up and toward the segment's eave)
    O = [(U[0][0] + T * n[0][0], U[0][1] + T * n[0][1])]
    for j in range(1, len(U) - 1):
        a, b = n[j - 1], n[j]
        ca = U[j][0] * a[0] + U[j][1] * a[1] + T
        cb = U[j][0] * b[0] + U[j][1] * b[1] + T
        det = a[0] * b[1] - a[1] * b[0]
        O.append(((ca * b[1] - cb * a[1]) / det, (a[0] * cb - b[0] * ca) / det))
    O.append((U[-1][0] + T * n[-1][0], U[-1][1] + T * n[-1][1]))
    return O + U[::-1], O


def hip_roof(x0, x1, z0, z1, y0, h):
    """Hip roof, ridge along x: eaves rectangle at y0, ridge h above, inset half the depth from each end (four equal slopes). One closed solid."""
    zc, hd = (z0 + z1) / 2, (z1 - z0) / 2
    r0, r1 = x0 + hd, x1 - hd
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (r0, y0 + h, zc), (r1, y0 + h, zc)]
    f = [(0, 1, 2, 3), (3, 2, 5, 4), (1, 0, 4, 5), (0, 3, 4), (2, 1, 5)]
    return v, f


# =====================================================================================================
# dn_stable_4, dn_stable_6: a block of N loose boxes
# =====================================================================================================
def stable_block(name, n):
    """N boxes 5 m apart along x, front (+z) at z = 0, the body to z = -9, a 2.4 m porch. Each box's upper door stands open on a lit stall
    4.3 m deep (dark plank walls, straw, a hay rack, a lantern): the game stands a chimera in it (chimera_stalls in src/downsPlan.js), its
    head over the shut lower leaf. The upper leaf is swung back against the wall beside the door."""
    Lh = n * 2.5
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"barn": 0.04, "barn2": 0.04, "mint": 0.03, "mint2": 0.02, "saddle": 0.02, "saddle2": 0.015, "black": 0.02, "gold": 0.012,
                           "glowgold": 0.0, "black2": 0.012})
    IN = {k: Acc(f"{name}_in_{k}", k, root, 0.0) for k in ("black", "black2", "saddle", "saddle2", "glowgold")}     # (the stalls' insides: no outlines)
    xs = [-Lh + 2.5 + 5.0 * i for i in range(n)]
    P["mint2"].box(-Lh - 0.3, Lh + 0.3, 0.0, 0.5, -9.2, 0.2)                                 # plinth
    P["barn"].box(-Lh, Lh, 0.5, 4.2, -9.0, -4.6)                                             # the back half of the walls, solid
    for sx in (-1, 1):
        P["barn"].box(sx * (Lh - 0.3), sx * Lh, 0.5, 4.2, -4.6, 0.0)                         # the end walls' front halves
        P["mint"].box(sx * (Lh - 0.2), sx * (Lh + 0.08), 0.45, 4.25, -9.08, 0.08)            # the end walls' Mint cladding, 8 cm proud on the end, the front and the back
    # the front wall round the open upper doors: a band below them, a band above, a pier between each two
    P["barn"].box(-Lh + 0.25, Lh - 0.25, 0.5, 1.95, -0.3, 0.0)
    P["barn"].box(-Lh + 0.25, Lh - 0.25, 3.2, 4.2, -0.3, 0.0)
    edges = [-Lh + 0.25] + [e for x in xs for e in (x - 0.7, x + 0.7)] + [Lh - 0.25]
    for a, b in zip(edges[0::2], edges[1::2]):
        P["barn"].box(a, b, 1.94, 3.21, -0.3, 0.0)
    P["mint"].box(-Lh + 0.1, Lh - 0.1, 0.5, 0.9, 0.0, 0.05)                                  # a Mint kick strip along the foot, its ends in the cladding
    P["mint"].box(-Lh + 0.1, Lh - 0.1, 3.9, 4.18, 0.0, 0.05)                                 # and an eaves board, its top in the roof
    for x in xs:
        for sx in (-1, 1):
            P["mint"].box(x + sx * 0.7, x + sx * 1.0, 0.5, 3.4, 0.0, 0.08)                   # the door frame: its posts and head round the opening
        P["mint"].box(x - 1.0, x + 1.0, 3.2, 3.4, 0.0, 0.08)
        P["saddle"].box(x - 0.75, x + 0.75, 0.55, 1.95, 0.08, 0.14)                          # the lower leaf, shut
        P["saddle2"].box(x - 0.7, x + 0.7, 1.0, 1.06, 0.14, 0.17)                            # a plank line across it
        P["gold"].box(x + 0.5, x + 0.62, 1.2, 1.5, 0.14, 0.2)                                # the latch
        P["saddle"].box(x - 2.4, x - 1.06, 1.98, 3.17, 0.0, 0.07)                            # the upper leaf, swung back flat against the wall
        P["saddle2"].box(x - 2.35, x - 1.11, 2.55, 2.6, 0.07, 0.1)
        P["black"].box(x - 0.55, x + 0.55, 3.46, 3.74, 0.05, 0.1)                            # the box's name board (blank: the game knows who's in)
        P["gold"].box(x - 0.6, x + 0.6, 3.43, 3.46, 0.05, 0.11)
        lx = x + 1.23                                                                       # a lantern on a bracket: a base, a lit glass, a cap, the bracket's end in the cap
        P["black2"].box(lx - 0.04, lx + 0.04, 2.53, 2.63, 0.0, 0.5)
        P["black2"].box(lx - 0.11, lx + 0.11, 2.1, 2.18, 0.38, 0.6)
        P["glowgold"].box(lx - 0.08, lx + 0.08, 2.18, 2.48, 0.41, 0.57)
        P["black2"].box(lx - 0.13, lx + 0.13, 2.48, 2.58, 0.36, 0.62)
        P["saddle2"].box(x - 0.6, x + 0.6, 0.0, 0.45, 0.6, 1.3)                              # the feed trough, on the porch floor
        # inside: warm plank lining on the back wall (light enough that a chimera in the dark of the box still reads), a ceiling, straw, a hay rack, a lantern
        IN["saddle2"].box(x - 2.35, x + 2.35, 0.47, 3.6, -4.59, -4.54)                    # (1 cm off the back wall, its foot in the plinth)
        IN["black"].box(max(x - 2.4, -Lh + 0.32), min(x + 2.4, Lh - 0.32), 3.59, 4.14, -4.58, -0.31)   # (its top under the roof's soffit, its ends clear of the end walls)
        IN["saddle"].box(x - 2.32, x + 2.32, 0.44, 0.58, -4.53, -0.31)
        IN["black2"].box(x - 1.3, x - 0.1, 1.9, 2.5, -4.54, -4.25)
        IN["glowgold"].box(x + 1.4, x + 1.7, 2.7, 3.05, -4.54, -4.46)
    for x in xs[:-1]:                                                                        # the partitions between the stalls
        IN["saddle2"].box(x + 2.3, x + 2.7, 0.46, 3.6, -4.55, -0.3)
    for sx in (-1, 1):                                                                       # and a lining on the end walls' inner faces, 1 cm off them
        IN["saddle2"].box(sx * (Lh - 0.31), sx * (Lh - 0.35), 0.46, 3.6, -4.55, -0.3)
    # the porch: posts, a beam with knee braces, a floor
    P["saddle2"].box(-Lh - 0.2, Lh + 0.2, 0.0, 0.12, 0.2, 2.4)
    for i in range(n + 1):
        x = -Lh + 5.0 * i
        P["saddle"].box(x - 0.13, x + 0.13, 0.12, 4.0, 2.05, 2.31)
        for sx in (-1, 1):
            if -Lh < x + sx * 0.6 < Lh:
                P["saddle"].bm((x, 3.3, 2.18), (x + sx * 0.62, 3.98, 2.18), 0.055)
    P["saddle"].box(-Lh - 0.2, Lh + 0.2, 3.95, 4.2, 2.0, 2.36)
    # the roof: a gable prism over the whole block, eaves 0.6 m past the porch beam and back wall
    P["barn2"].polyx([(-9.6, 4.15), (2.6, 4.15), (2.6, 4.3), (-3.5, 7.2), (-9.6, 4.3)], -Lh - 0.6, Lh + 0.6)
    P["mint"].box(-Lh - 0.7, Lh + 0.7, 7.05, 7.35, -3.75, -3.25)                             # the ridge cap
    for x in ((-8.0, 8.0) if n >= 6 else (0.0,)):                                          # a louvred cupola, its base sunk into the roof
        P["mint2"].box(x - 1.0, x + 1.0, 6.8, 8.5, -3.95, -3.05)
        for i in range(4):
            P["black"].box(x - 0.8, x + 0.8, 7.55 + i * 0.25, 7.65 + i * 0.25, -4.0, -3.95)
            P["black"].box(x - 0.8, x + 0.8, 7.55 + i * 0.25, 7.65 + i * 0.25, -3.05, -3.0)
        P["barn2"].add(hip(0.15, 1.41421, 0.9), t=(x, 8.9, -3.5), s=(1.15, 1.0, 0.6))
        P["gold"].bm((x, 9.3, -3.5), (x, 10.0, -3.5), 0.04)


stable_block("dn_stable_4", 4)
stable_block("dn_stable_6", 6)

# =====================================================================================================
# dn_stable_corner: the knuckle of an L, a two-storey tack room under a clock turret
# =====================================================================================================
# Its walls fill x -9.3 to 0.3, z -9.3 to 0.3. One block runs off its +x face (front +z, from x = 0.3) and another off its +z face (turned a quarter, front +x, from
# z = 0.3): their ends, plinths and roofs' eaves die into its walls, which stand above their ridges. In the inner corner it lays the porch's square (3 cm over the blocks'
# porch floors, so it is the one that shows), a post where the two porch beams cross, and a soffit under the two roofs' eaves.
root = pivot("dn_stable_corner", (0, 0, 0))
P = parts(root, "dn_stable_corner", {"barn": 0.05, "barn2": 0.045, "mint": 0.03, "mint2": 0.02, "saddle": 0.02, "saddle2": 0.015, "black": 0.025, "gold": 0.015,
                                     "glasswarm": 0.0, "black2": 0.015})
C0, C1, CH = -9.3, 0.3, 8.6
P["mint2"].box(C0 - 0.3, C1 + 0.3, 0.0, 0.6, C0 - 0.3, C1 + 0.3)
P["barn"].box(C0, C1, 0.6, CH, C0, C1)
for cx in (C0, C1):                                                                       # Mint corner boards wrapping its four corners
    for cz in (C0, C1):
        P["mint"].box(cx - 0.28, cx + 0.28, 0.55, CH + 0.05, cz - 0.28, cz + 0.28)
P["mint"].box(C0 - 0.06, C1 + 0.06, 4.3, 4.6, C0 - 0.06, C1 + 0.06)                         # a string course between the storeys
P["gold"].box(C0 - 0.12, C1 + 0.12, CH - 0.27, CH - 0.02, C0 - 0.12, C1 + 0.12)                    # a gold frieze under the eaves
for face in ("-x", "-z"):                                                                # the outer faces: two lit windows a storey, a door below
    for u in (-6.7, -2.3):
        for y0, y1 in ((1.6, 3.4), (5.2, 7.4)):
            if face == "-x":
                P["black"].box(C0 - 0.06, C0 + 0.05, y0 - 0.15, y1 + 0.15, u - 0.95, u + 0.95)
                P["glasswarm"].box(C0 - 0.064, C0 - 0.06, y0, y1, u - 0.8, u + 0.8)
                P["black"].box(C0 - 0.094, C0 - 0.064, y0, y1, u - 0.04, u + 0.04)
            else:
                P["black"].box(u - 0.95, u + 0.95, y0 - 0.15, y1 + 0.15, C0 - 0.06, C0 + 0.05)
                P["glasswarm"].box(u - 0.8, u + 0.8, y0, y1, C0 - 0.064, C0 - 0.06)
                P["black"].box(u - 0.04, u + 0.04, y0, y1, C0 - 0.094, C0 - 0.064)
P["barn2"].add(hip(0.2, 1.41421, 2.6), t=(-4.5, CH + 1.3, -4.5), s=(7.7, 1.0, 7.7))       # the hip roof, 0.6 m past the walls
# the clock turret on the roof: a Mint box with a clock face on each side, a cap, a weathervane
TY = CH + 2.0
P["mint"].box(-6.0, -3.0, TY, TY + 2.8, -6.0, -3.0)
for (fx, fz, ry) in ((-4.5, -2.94, 0.0), (-4.5, -6.06, PI), (-2.94, -4.5, PI / 2), (-6.06, -4.5, -PI / 2)):
    P["mint2"].cylc(fx, TY + 1.5, fz, 1.05, 0.06, 20, rot=(PI / 2, ry, 0))
    P["gold"].tor(1.07, 0.06, t=(fx, TY + 1.5, fz), rot=(PI / 2, ry, 0), n=24)
    ux, uz = math.sin(ry), math.cos(ry)                                                   # (the hands: ten past ten, standing 4 cm off the face)
    P["black"].bm((fx + ux * 0.05, TY + 1.5, fz + uz * 0.05), (fx + ux * 0.05 - uz * 0.55, TY + 1.8, fz + uz * 0.05 + ux * 0.55), 0.045)
    P["black"].bm((fx + ux * 0.05, TY + 1.5, fz + uz * 0.05), (fx + ux * 0.05 + uz * 0.4, TY + 1.75, fz + uz * 0.05 - ux * 0.4), 0.045)
P["gold"].box(-6.15, -2.85, TY + 2.75, TY + 2.95, -6.15, -2.85)
P["barn2"].add(hip(0.12, 1.41421, 1.6), t=(-4.5, TY + 3.7, -4.5), s=(2.5, 1.0, 2.5))
P["gold"].bm((-4.5, TY + 4.4, -4.5), (-4.5, TY + 6.2, -4.5), 0.05)
P["gold"].box(-5.3, -3.7, TY + 5.6, TY + 5.68, -4.54, -4.46)                              # the vane: an arrow, a chimera's silhouette riding it
P["gold"].poly([(-5.5, TY + 5.64), (-5.2, TY + 5.84), (-5.2, TY + 5.44)], -4.53, -4.47)
P["gold"].poly([(-4.6, TY + 5.68), (-4.4, TY + 6.0), (-4.0, TY + 6.05), (-3.85, TY + 6.3), (-3.75, TY + 6.0), (-3.9, TY + 5.68)], -4.53, -4.47)
# the inner corner: the porch's square, the post where the beams cross, a soffit under the eaves
P["saddle2"].box(0.25, 2.45, 0.01, 0.15, 0.25, 2.45)
P["saddle"].box(1.98, 2.38, 0.12, 4.3, 1.98, 2.38)
P["barn2"].box(0.2, 2.65, 4.08, 4.16, 0.2, 2.65)

# =====================================================================================================
# dn_stable_fence (a 4 m bay of post and rail, its post at x = 0, its rails running on into the next post), dn_stable_post, dn_yard_gate
# =====================================================================================================
root = pivot("dn_stable_fence", (0, 0, 0))
P = parts(root, "dn_stable_fence", {"mint": 0.02, "mint2": 0.012, "gold": 0.0})
P["mint"].box(-0.11, 0.11, 0.0, 1.45, -0.11, 0.11)
P["mint"].box(-0.14, 0.14, 1.45, 1.53, -0.14, 0.14)
for y in (0.45, 0.85, 1.25):
    P["mint2"].box(0.0, 4.0, y - 0.07, y + 0.07, -0.04, 0.04)
root = pivot("dn_stable_post", (0, 0, 0))
P = parts(root, "dn_stable_post", {"mint": 0.02})
P["mint"].box(-0.11, 0.11, 0.0, 1.45, -0.11, 0.11)
P["mint"].box(-0.14, 0.14, 1.45, 1.53, -0.14, 0.14)

def slat(acc, a, b, y0, y1, t):
    """a straight member in plan from a to b ((x, z) ends), t thick across, from y0 up to y1: laid out from its corners, so it lies exactly along a-b"""
    l = math.hypot(b[0] - a[0], b[1] - a[1])
    nx, nz = -(b[1] - a[1]) / l * t / 2, (b[0] - a[0]) / l * t / 2
    acc.polyy([(a[0] + nx, a[1] + nz), (b[0] + nx, b[1] + nz), (b[0] - nx, b[1] - nz), (a[0] - nx, a[1] - nz)], y0, y1)


def leaf(rails, stiles, h, d, L, ys, top):
    """a gate's leaf hung at h ((x, z), the hinge) and swung to lie along d (a unit (x, z)), L long: a stile at each end from the ground to `top`,
    rails at the heights ys running into both stiles, and a brace from the hinge's foot to the far stile's head"""
    at = lambda u: (h[0] + d[0] * u, h[1] + d[1] * u)
    for u in (0.05, L - 0.05):
        slat(stiles, at(u - 0.05), at(u + 0.05), 0.12, top, 0.1)
    for y in ys:
        slat(rails, at(0.04), at(L - 0.04), y - 0.06, y + 0.06, 0.06)
    a, b = at(0.12), at(L - 0.12)
    rails.bm((a[0], ys[0], a[1]), (b[0], ys[-1], b[1]), 0.035)


root = pivot("dn_yard_gate", (0, 0, 0))                                                 # the yard's gate: two Barn Red piers 6 m apart, two leaves swung in
P = parts(root, "dn_yard_gate", {"barn": 0.04, "mint": 0.025, "mint2": 0.015, "gold": 0.015})
SW = math.radians(80)                                                                   # (how far the leaves stand open)
for sx in (-1, 1):
    P["barn"].box(sx * 3.0 - 0.45, sx * 3.0 + 0.45, 0.3, 3.4, -0.45, 0.45)
    P["mint"].box(sx * 3.0 - 0.55, sx * 3.0 + 0.55, 3.4, 3.62, -0.55, 0.55)
    P["gold"].add(sphere(0.28, 10, 7), t=(sx * 3.0, 3.85, 0))
    P["mint"].box(sx * 3.0 - 0.5, sx * 3.0 + 0.5, 0.0, 0.35, -0.5, 0.5)
    # a leaf hung on the pier's inner face, swung in (-z): shut, the two would meet on the axis
    leaf(P["mint2"], P["mint"], (sx * 2.53, -0.2), (-sx * math.cos(SW), -math.sin(SW)), 2.45, (0.4, 0.9, 1.4), 1.55)

# =====================================================================================================
# dn_lunge_ring: a round pen 18 m across, its gate on +z; dn_trough, dn_tack
# =====================================================================================================
root = pivot("dn_lunge_ring", (0, 0, 0))
P = parts(root, "dn_lunge_ring", {"mint": 0.02, "mint2": 0.012, "saddle": 0.015, "gold": 0.0})
RR, NP = 9.0, 22
for i in range(NP):
    a0 = 2 * PI * (i + 0.5) / NP + PI / 2                                                 # (posts round from the gate at +z: the first and the last stand either side of it)
    x, z = math.cos(a0) * RR, math.sin(a0) * RR
    P["mint"].box(x - 0.1, x + 0.1, 0.0, 1.6, z - 0.1, z + 0.1)
    if i < NP - 1:
        a1 = 2 * PI * (i + 1.5) / NP + PI / 2
        x1, z1 = math.cos(a1) * RR, math.sin(a1) * RR
        L, ang = math.hypot(x1 - x, z1 - z), math.atan2(x1 - x, z1 - z)
        for y in (0.6, 1.2):
            P["mint2"].boxc((x + x1) / 2, y, (z + z1) / 2, 0.07, 0.14, L - 0.12, rot=(0, ang, 0))
# the gate: a leaf hung on the post east of the opening, swung out (+z and away from it), clear of the way in
a1 = 2 * PI * (NP - 0.5) / NP + PI / 2
gx, gz = math.cos(a1) * RR, math.sin(a1) * RR
leaf(P["saddle"], P["saddle"], (gx - 0.15, gz + 0.12), (math.cos(math.radians(70)), math.sin(math.radians(70))), 2.3, (0.6, 1.2), 1.45)

root = pivot("dn_trough", (0, 0, 0))                                                    # a water trough: a plank tub, dark water 6 cm under its rim
P = parts(root, "dn_trough", {"saddle": 0.02, "saddle2": 0.0, "black2": 0.0, "gold": 0.0})
P["saddle"].box(-1.2, 1.2, 0.1, 0.75, -0.45, 0.45)
P["black2"].box(-1.12, 1.12, 0.62, 0.69, -0.37, 0.37)
for x in (-0.9, 0.9):
    P["saddle2"].box(x - 0.12, x + 0.12, 0.0, 0.12, -0.5, 0.5)
P["gold"].box(-1.21, 1.21, 0.5, 0.55, -0.46, 0.46)

root = pivot("dn_tack", (0, 0, 0))                                                      # a saddle rack: a post and a sawhorse, a saddle with its blanket and a stirrup
P = parts(root, "dn_tack", {"saddle": 0.015, "saddle2": 0.012, "barn": 0.015, "gold": 0.0, "black2": 0.0})
for sx in (-1, 1):
    P["saddle2"].bm((sx * 0.45, 0.0, -0.3), (sx * 0.45, 0.9, 0.0), 0.04)
    P["saddle2"].bm((sx * 0.45, 0.0, 0.3), (sx * 0.45, 0.9, 0.0), 0.04)
P["saddle2"].box(-0.55, 0.55, 0.86, 0.96, -0.05, 0.05)
P["barn"].box(-0.4, 0.4, 0.92, 0.97, -0.38, 0.38)
P["saddle"].rbc(0, 1.05, 0, 0.62, 0.2, 0.62, e=0.4)
P["saddle"].rbc(0.24, 1.18, 0, 0.12, 0.14, 0.2, e=0.4)
for sz in (-1, 1):
    P["black2"].bm((0, 1.0, sz * 0.3), (0, 0.6, sz * 0.36), 0.015)
    P["gold"].tor(0.07, 0.015, t=(0, 0.55, sz * 0.36), rot=(PI / 2, 0, 0), n=10, rs=4)

# =====================================================================================================
# dn_hay_barn
# =====================================================================================================
root = pivot("dn_hay_barn", (0, 0, 0))
P = parts(root, "dn_hay_barn", {"barn": 0.05, "barn2": 0.04, "mint": 0.03, "mint2": 0.02, "saddle": 0.02, "black": 0.025, "gold": 0.012, "glasswarm": 0.0, "black2": 0.015})
BR = Acc("dn_hay_barn_brace", "barn", root, 0.02)                                       # (door braces: Barn Red, thin line for a thin part)
GAB = [(0.0, 6.0), (-1.6, 9.0), (-7.0, 11.6), (-12.4, 9.0), (-14.0, 6.0)]                 # wall top: gambrel knees and ridge
P["mint2"].box(-12.2, 12.2, 0.0, 0.5, -14.2, 0.2)
P["barn"].polyx([(0.0, 0.5)] + GAB + [(-14.0, 0.5)], -12.0, 12.0)                         # walls and gables, one solid
for sx in (-1, 1):                                                                       # Mint corner boards, one piece per corner, 8 cm proud on both faces
    for zc, zs in ((0.0, 1), (-14.0, -1)):
        z0, z1 = zc + zs * 0.08, zc - zs * 0.25                                        # (z0 outer face; top climbs the gambrel's first pitch, 5 cm into the slab)
        top = 6.0 + 0.25 * 3.0 / 1.6 + 0.05
        prof = [(z0, 0.45), (z0, 6.05), (zc, 6.05), (z1, top), (z1, 0.45)] if zs > 0 else [(z1, 0.45), (z1, top), (zc, 6.05), (z0, 6.05), (z0, 0.45)]
        P["mint"].polyx(prof, min(sx * 11.75, sx * 12.08), max(sx * 11.75, sx * 12.08))
P["mint"].box(-11.85, 11.85, 0.48, 0.9, -0.05, 0.05)                                    # kick strip, ends in the corner boards, foot in the plinth
# sliding door: Black frame up to the soffit, two Mint leaves with X braces, rail hung from the eave
P["black"].box(-4.4, 4.4, 0.46, 6.0, -0.1, 0.1)
for sx in (-1, 1):
    x0, x1 = (0.05, 4.2) if sx > 0 else (-4.2, -0.05)
    P["mint"].box(x0, x1, 0.55, 5.8, 0.1, 0.2)
    BR.bm((x0 + 0.1, 0.8, 0.22), (x1 - 0.1, 5.5, 0.22), 0.09)
    BR.bm((x0 + 0.1, 5.5, 0.22), (x1 - 0.1, 0.8, 0.22), 0.09)
P["black2"].box(-4.6, 4.6, 5.8, 6.05, -0.08, 0.5)                                       # door rail, top in the soffit
for x in (-8.0, 8.0):                                                                    # lit windows: frame, flush pane, glazing bar
    P["black2"].box(x - 1.1, x + 1.1, 2.4, 4.1, -0.05, 0.06)
    P["glasswarm"].box(x - 0.95, x + 0.95, 2.55, 3.95, 0.06, 0.064)
    P["black2"].box(x - 0.04, x + 0.04, 2.55, 3.95, 0.064, 0.094)
# hayloft door high on each gable, under a hoist beam reaching past the roof overhang
for sx in (-1, 1):
    fx = lambda a, b: (sx * a, sx * b)
    P["black"].box(*fx(11.95, 12.06), 7.3, 9.3, -8.2, -5.8)
    P["mint"].box(*fx(12.06, 12.12), 7.4, 9.2, -8.1, -7.05)
    P["mint"].box(*fx(12.06, 12.12), 7.4, 9.2, -6.95, -5.9)
    P["black2"].box(*fx(11.6, 14.0), 10.2, 10.42, -7.12, -6.88)
    P["black2"].bm((sx * 13.8, 10.2, -7.0), (sx * 13.8, 9.0, -7.0), 0.03)
    P["gold"].add(sphere(0.15, 6, 5), t=(sx * 13.8, 8.95, -7.0))
# gambrel roof: one 0.3 m slab on the wall top, flat soffits 0.7 m out at the eaves, 0.6 m past the gables
ROOF, TOP = slab_profile([(0.7, 6.0)] + GAB + [(-14.7, 6.0)], 0.3)
P["barn2"].polyx(ROOF, -12.6, 12.6)
RY = TOP[3][1]                                                                           # ridge top (11.93)
P["mint"].box(-12.75, 12.75, RY - 0.23, RY + 0.15, -7.3, -6.7)                           # ridge cap
P["mint2"].box(-1.2, 1.2, RY - 0.53, RY + 1.37, -7.6, -6.4)                              # cupola, base in the slab
for i in range(4):
    for z0, z1 in ((-7.65, -7.6), (-6.4, -6.35)):
        P["black"].box(-1.0, 1.0, RY + 0.32 + i * 0.26, RY + 0.42 + i * 0.26, z0, z1)
P["barn2"].add(hip(0.157, 1.41421, 0.9), t=(0, RY + 1.77, -7.0), s=(1.35, 1.0, 0.75))
P["gold"].bm((0, RY + 2.17, -7.0), (0, RY + 2.97, -7.0), 0.04)

# =====================================================================================================
# dn_pavilion
# =====================================================================================================
root = pivot("dn_pavilion", (0, 0, 0))
P = parts(root, "dn_pavilion", {"mint": 0.04, "mint2": 0.02, "money2": 0.0, "barn": 0.035, "gold": 0.015, "black": 0.025, "glasswarm": 0.0, "saddle2": 0.0})
P["mint2"].box(-9.2, 9.2, 0.0, 0.4, -10.2, 3.2)
P["saddle2"].box(-8.9, 8.9, 0.4, 0.405, 0.02, 3.0)                                       # porch boards, flush on the plinth
P["mint"].box(-9.0, 9.0, 0.4, 4.75, -10.0, 0.0)                                         # hall, as tall as the porch beam so the roof rests on both
P["money2"].box(-9.006, 9.006, 0.38, 1.3, -10.006, 0.006)                                # dado, flush round it
P["gold"].box(-9.1, 9.1, 4.35, 4.6, -10.1, 0.1)                                          # gold frieze under the eaves
for x in (-5.5, 0.0, 5.5):                                                               # three lit windows: frame, flush pane, glazing bar
    P["black"].box(x - 1.3, x + 1.3, 1.55, 3.3, -0.05, 0.06)
    P["glasswarm"].box(x - 1.15, x + 1.15, 1.7, 3.15, 0.06, 0.064)
    P["black"].box(x - 0.04, x + 0.04, 1.7, 3.15, 0.064, 0.094)
for x in (-8.4, -2.8, 2.8, 8.4):                                                         # porch columns: square base, shaft, gold capital under the beam
    P["mint2"].box(x - 0.35, x + 0.35, 0.38, 0.55, 2.45, 3.15)
    P["mint"].cylc(x, (0.45 + 4.15) / 2, 2.8, 0.26, 4.15 - 0.45, 12)
    P["gold"].cylc(x, 4.125, 2.8, 0.34, 0.15, 12)
P["mint2"].box(-9.0, 9.0, 4.2, 4.75, 2.4, 3.2)                                           # porch beam (sign on its front)
P["black"].box(-5.0, 5.0, 4.3, 4.65, 3.2, 3.26)
P["barn"].add(hip_roof(-9.7, 9.7, -10.7, 3.7, 4.75, 3.0))                                # hip roof: 0.7 m eaves round the hall, 0.5 m past the porch beam
P["gold"].box(-2.6, 2.6, 7.6, 7.85, -3.7, -3.3)                                          # ridge

# =====================================================================================================
# dn_ring_gate
# =====================================================================================================
root = pivot("dn_ring_gate", (0, 0, 0))
P = parts(root, "dn_ring_gate", {"mint": 0.025, "gold": 0.015, "black2": 0.015})
for sx in (-1, 1):
    P["mint"].boxc(sx * 1.8, 1.25, 0, 0.3, 2.5, 0.3)
    P["gold"].add(sphere(0.2, 8, 6), t=(sx * 1.8, 2.62, 0))                              # (sunk 8 cm into the post top)
P["black2"].box(-1.75, 1.75, 2.2, 2.35, -0.06, 0.06)                                     # bar, ends 10 cm into the posts

# =====================================================================================================
# dn_hay
# =====================================================================================================
root = pivot("dn_hay", (0, 0, 0))
P = parts(root, "dn_hay", {"saddle": 0.02, "mint": 0.0})
P["saddle"].box(-0.6, 0.6, 0.0, 0.6, -0.3, 0.3)
for x in (-0.3, 0.3):
    P["mint"].box(x - 0.025, x + 0.025, 0.01, 0.605, -0.305, 0.305)                      # (5 mm proud: straps have no outline)

# =====================================================================================================
# dn_picnic
# =====================================================================================================
root = pivot("dn_picnic", (0, 0, 0))
P = parts(root, "dn_picnic", {"saddle": 0.015, "black2": 0.012, "mint": 0.02, "accent": 0.025, "gold": 0.01})
P["saddle"].box(-1.2, 1.2, 0.74, 0.8, -0.5, 0.5)
for sz in (-1, 1):
    P["saddle"].box(-1.2, 1.2, 0.42, 0.47, sz * 0.9 - 0.18, sz * 0.9 + 0.18)
for sx in (-1, 1):
    for sz in (-1, 1):
        P["black2"].bm((sx * 0.95, 0.0, sz * 0.45), (sx * 0.6899, 0.77, sz * 0.1379), 0.04)   # legs, tops 3 cm up inside the table (a slanted end would show under it)
    P["black2"].box(sx * 0.95 - 0.03, sx * 0.95 + 0.03, 0.0, 0.42, -0.95, 0.95)
P["mint"].cylc(0, 1.3, 0, 0.035, 2.5, 6)
P["accent"].cylc(0, 2.5, 0, 0.05, 0.5, 10, rt=0.05)                                      # (collar round the pole top, up into the canopy)
P["accent"].lath([(0.0, 2.8), (1.0, 2.62), (1.8, 2.35), (1.8, 2.3), (1.0, 2.55), (0.0, 2.72)], segs=10)
P["gold"].add(sphere(0.07, 6, 5), t=(0, 2.85, 0))

finish_and_export()
