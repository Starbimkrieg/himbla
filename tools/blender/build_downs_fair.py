# Chimera Downs' fairground kit for Blender (4.2+ / 5.x), exported to src/assets/downs-fair.glb: the funpark's ferris
# wheel and carousel in the Downs' palette, and the annex's ticket hall, kiosks, gate, fence and queue posts
# (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_fair.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_fair.py
#
# three.js axes (x right, y up, +z front), each model on y = 0, origin on the ground unless said. One material per mesh,
# named after a slot (DOWNS_TOON / DOWNS_GLOW).
#   dn_wheel_frame  the wheel's foot: 16 x 10 m Mint platform (deck 0.8 m up, flush Money2 inlay, gold edge band), two
#                   one-piece flights of boarding steps at +z; Mint A-frame legs each side with coaxial Barn Red bands and
#                   cross braces, up to bearing blocks at z = +-2.8 clear of the hub; the axle (27 m up) with gold caps.
#                   Colliders are the game's
#   dn_wheel        the turning part, origin at the hub, x-y plane (axis z): two Mint rims 2 m apart (z = +-1), gold inner
#                   ring, 24 spokes and 24 lit bulbs a side, hub with a Barn Red plate. Radius 22 m. The game hangs twelve
#                   gondolas at (22 cos a, 22 sin a, 0) every 30 degrees
#   dn_gondola      origin at the hanger's top: rod, Barn Red canopy with a Mint rim band, open basket with an `accent`
#                   wall (game-coloured), bench wall to wall. Seat 3.35 m below the origin
#   dn_carousel_base fixed foot: Black2 platform, r 9 m, 0.7 m tall, gold rim sunk into its side, four Mint steps, gold
#                   centre column 7.4 m tall.
#   dn_carousel     turning deck, origin on the platform top (y = 0.7 in game): Mint deck r 8 m with a Barn Red / Mint
#                   inlay; canopy one solid twelve-sided Barn Red pyramid (corners 9.6 m out at 7.3 m, apex 10.5 m), every
#                   other face clad flush in Mint; gold twelve-sided skirt under the eaves with 24 lit bulbs; finial;
#                   horses ride 8 poles at r 6 whose tops stay inside the canopy
#   dn_horse        carousel horse on its pole, origin at its middle (pole -1.7 to 6.25 m), facing +x: Mint body, head,
#                   neck; `accent` saddle and mane; gold pole
#   dn_ticket_hall  ticket hall, 22 x 3.6 x 8 m, front +z, origin mid-front on the ground: three windows, striped awning
#                   (Barn Red slab, flush Mint stripes) over a valance, lit strip under it, Mint2 roof inside a gold cornice,
#                   name board on the roof (the game writes TICKETS at y = 4.8)
#   dn_kiosk        food kiosk, 4.8 x 3.4 m, 3.9 m tall, front +z: Mint walls with a serving bay in front (Saddle counter
#                   on an `accent` front, lit menu board on the back wall), gold belt where the upper walls meet the lower,
#                   Black name board on the fascia (game writes the name at y = 3.325, z = 0.06), `accent` / Mint striped
#                   awning with a valance and two hanging lamps, Mint2 roof slab
#   dn_fair_gate    annex gate arch, 12 m across the outer faces, 10.6 m to the pillar balls, lintel ends inside the pillars;
#                   Black name board (centre y 7.4, 5.8 x 1.1 m) on both faces
#   dn_stanchion    queue post, 1 m: gold-capped Black2 post; its Barn Red rope (3 m, toward +x to the next post) sits under
#                   a pivot of role `rope` so the game can omit it on a line's last post
#   dn_fence        4 m of annex fence, 1.3 m tall, along +x from its post at x = 0: striped pickets with gold caps
#
# Joints (the outline rule, as the arcades'): outlined pieces never meet flush in one plane (an ink shell would show as a
# dark seam). A piece ending on another ends well inside it or steps by 5 cm or more; inkless stripes and inlays lie
# within 6 mm of their host; wall-mounted pieces start inside the wall. Solids of revolution are closed.
DOWNS_OUT = "downs-fair.glb"
DOWNS_COLL = "MoonDownsFair"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

HUB = 27.0
R = 22.0


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# =====================================================================================================
# dn_wheel_frame
# =====================================================================================================
root = pivot("dn_wheel_frame", (0, 0, 0))
P = parts(root, "dn_wheel_frame", {"mint": 0.05, "mint2": 0.03, "gold": 0.02, "barn": 0.025, "black2": 0.03, "money2": 0.0})
P["mint2"].box(-8.0, 8.0, 0.0, 0.8, -5.0, 5.0)
P["gold"].box(-8.1, 8.1, 0.55, 0.72, -5.1, 5.1)                                          # edge band, 8 cm under the deck
P["money2"].box(-7.6, 7.6, 0.8, 0.805, -4.6, 4.6)                                        # deck inlay, flush
for sx in (-1, 1):                                                                       # front steps: each flight one piece, back in the platform
    P["mint2"].polyx([(4.9, 0.0), (8.0, 0.0), (8.0, 0.25), (6.8, 0.25), (6.8, 0.5), (4.9, 0.5)], sx * 4.0 - 1.5, sx * 4.0 + 1.5)
# A-frames: two legs each side, feet in the platform, up to a bearing block at z = +-2.8 (clear of the hub plates, z <= 1.97)
LEG_R, TOP_Y, ZT, ZB = 0.6, 26.5, 2.8, 4.0
for sz in (-1, 1):
    for sx in (-1, 1):
        A, Bt = (sx * 7.0, 0.55, sz * ZB), (0.0, TOP_Y, sz * ZT)
        P["mint"].bm(A, Bt, LEG_R)
        L = math.dist(A, Bt)
        u = tuple((Bt[i] - A[i]) / L for i in range(3))
        for t in (0.25, 0.5, 0.75):                                                     # Barn Red bands on each leg's own axis
            c = lerp3(A, Bt, t)
            P["barn"].bm(tuple(c[i] - u[i] * 0.13 for i in range(3)), tuple(c[i] + u[i] * 0.13 for i in range(3)), LEG_R + 0.08)
    for y, r in ((HUB * 0.5, 0.3), (HUB * 0.25, 0.28)):                                  # cross braces, ends at the legs' axes
        t = (y - 0.55) / (TOP_Y - 0.55)
        x, z = 7.0 * (1 - t), ZB + (ZT - ZB) * t
        P["mint"].bm((-x, y, sz * z), (x, y, sz * z), r)
    P["black2"].boxc(0, HUB, sz * ZT, 1.8, 1.8, 1.5)                                     # bearing blocks, leg tops inside
    P["gold"].cylc(0, HUB, sz * 3.8, 0.55, 0.1, 12, rot=(PI / 2, 0, 0))                  # axle end caps
P["black2"].bm((0, HUB, -3.76), (0, HUB, 3.76), 0.45)                                    # axle, 20 cm out of each block

# =====================================================================================================
# dn_wheel
# =====================================================================================================
root = pivot("dn_wheel", (0, 0, 0))
P = parts(root, "dn_wheel", {"mint": 0.04, "gold": 0.025, "barn": 0.03, "black2": 0.02, "glowgold": 0.0, "glowmint": 0.0})
for s in (-1, 1):
    P["mint"].tor(R, 0.3, t=(0, 0, s * 1.0), rot=(PI / 2, 0, 0), n=64, rs=6)
    P["gold"].tor(R * 0.55, 0.18, t=(0, 0, s * 1.0), rot=(PI / 2, 0, 0), n=40, rs=5)
    for i in range(24):
        a = 2 * PI * i / 24
        P["mint"].bm((0, 0, s * 1.0), (math.cos(a) * R, math.sin(a) * R, s * 1.0), 0.1)
        P["glowgold" if i % 2 == 0 else "glowmint"].add(sphere(0.3, 8, 6), t=(math.cos(a) * R, math.sin(a) * R, s * 1.4))
P["gold"].cylc(0, 0, 0, 1.6, 3.4, 16, rot=(PI / 2, 0, 0))                                 # hub
for s in (-1, 1):
    P["barn"].cylc(0, 0, s * 1.8, 2.4, 0.2, 20, rot=(PI / 2, 0, 0))                      # Barn Red plate each side
    P["gold"].cylc(0, 0, s * 1.92, 0.7, 0.1, 12, rot=(PI / 2, 0, 0))
for i in range(12):                                                                     # gondola hangers: a Black2 bracket between the rims
    a = 2 * PI * i / 12
    P["black2"].bm((math.cos(a) * R, math.sin(a) * R, -1.0), (math.cos(a) * R, math.sin(a) * R, 1.0), 0.12)

# =====================================================================================================
# dn_gondola
# =====================================================================================================
root = pivot("dn_gondola", (0, 0, 0))
P = parts(root, "dn_gondola", {"black2": 0.015, "mint": 0.03, "barn": 0.025, "accent": 0.035, "gold": 0.015, "saddle": 0.02})
P["black2"].bm((0, 0, 0), (0, -1.4, 0), 0.07)
P["barn"].cylc(0, -1.1, 0, 1.35, 0.8, 12, rt=0.05)                                        # canopy: a cone plus a closed Mint rim band (foot 2 cm under the cone's)
P["mint"].lath([(1.38, -1.52), (1.38, -1.42), (1.2, -1.42), (1.2, -1.52), (1.38, -1.52)], segs=16)
for p in range(3):
    b = 2 * PI * p / 3
    P["mint"].bm((math.cos(b) * 1.13, -2.57, math.sin(b) * 1.13), (math.cos(b) * 1.13, -1.47, math.sin(b) * 1.13), 0.05)   # hangers: foot in the rim's gold ring, top in the cone
P["accent"].lath([(0.95, -3.45), (1.1, -3.4), (1.15, -2.6), (1.15, -2.55), (1.05, -2.55), (1.0, -3.4), (0.95, -3.45)], segs=18)      # open basket wall
P["gold"].tor(1.15, 0.08, t=(0, -2.55, 0), n=18, rs=5)
P["black2"].cylc(0, -3.5, 0, 0.95, 0.12, 18)
P["saddle"].box(-1.04, 1.04, -3.1, -2.98, -0.35, 0.35)                                   # bench across the basket, ends in the wall

# =====================================================================================================
# dn_carousel_base
# =====================================================================================================
root = pivot("dn_carousel_base", (0, 0, 0))
P = parts(root, "dn_carousel_base", {"black2": 0.05, "gold": 0.025, "mint2": 0.03, "mint": 0.0})
P["black2"].cylc(0, 0.35, 0, 9.0, 0.7, 28, rt=8.6)
P["gold"].tor(8.68, 0.1, t=(0, 0.62, 0), n=36, rs=5)                                     # sunk into the platform's sloping side
for i in range(4):
    a = i * PI / 2 + PI / 4
    P["mint2"].boxc(9.25 * math.sin(a), 0.17, 9.25 * math.cos(a), 3.0, 0.3, 1.5, rot=(0, a, 0))   # steps, back corners inside the platform
P["gold"].cylc(0, 0.7 + 3.7, 0, 0.6, 7.4, 12)

# =====================================================================================================
# dn_carousel
# =====================================================================================================
root = pivot("dn_carousel", (0, 0, 0))
P = parts(root, "dn_carousel", {"mint": 0.04, "barn": 0.035, "money2": 0.0, "gold": 0.025, "black2": 0.02, "glowgold": 0.0})
CLAD = Acc("dn_carousel_clad", "mint", root, 0.0)                                       # canopy's Mint faces: flush on the pyramid, no ink
P["mint"].cylc(0, 0.15, 0, 8.0, 0.3, 28)
P["gold"].tor(8.0, 0.1, t=(0, 0.3, 0), n=36, rs=5)
P["barn"].cylc(0, 0.3125, 0, 5.0, 0.065, 24)                                             # inlay: Barn Red disc, foot in the deck
P["money2"].cylc(0, 0.345, 0, 3.4, 0.04, 24)
P["gold"].cylc(0, 0.37, 0, 1.4, 0.06, 18)
# canopy: a twelve-sided pyramid (corners 9.6 m out at 7.3 m, apex 10.5 m), every other face clad in Mint 2 to 6 mm off it;
# a gold skirt under the eaves
RB, YB, YT = 9.6, 7.3, 10.5
P["barn"].add(cylinder(0.0, RB, YT - YB, 12), t=(0, (YB + YT) / 2, 0))
apex = (0.0, YT, 0.0)
for k in range(1, 12, 2):
    c0 = (RB * math.sin(2 * PI * k / 12), YB, RB * math.cos(2 * PI * k / 12))
    c1 = (RB * math.sin(2 * PI * (k + 1) / 12), YB, RB * math.cos(2 * PI * (k + 1) / 12))
    e1, e2 = [c1[i] - c0[i] for i in range(3)], [apex[i] - c0[i] for i in range(3)]
    n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
    ln = math.sqrt(sum(v * v for v in n))
    n = tuple(v / ln for v in n)
    if n[0] * (c0[0] + c1[0]) + n[2] * (c0[2] + c1[2]) < 0:
        n = tuple(-v for v in n)
    tri = (c0, c1, apex)
    v = [tuple(p[i] + n[i] * 0.002 for i in range(3)) for p in tri] + [tuple(p[i] + n[i] * 0.006 for i in range(3)) for p in tri]
    CLAD.add((v, [(0, 1, 2), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]))
SK = 9.7                                                                                 # skirt: twelve-sided band, 10 cm past the eaves
P["gold"].add(cylinder(SK, SK, 0.35, 12), t=(0, YB - 0.175, 0))
ri = SK * math.cos(PI / 12)
for k in range(12):                                                                     # two lit bulbs per skirt face
    ph = 2 * PI * (k + 0.5) / 12
    for s in (-1, 1):
        P["glowgold"].add(sphere(0.18, 8, 6), t=((ri + 0.06) * math.sin(ph) + s * 1.25 * math.cos(ph), YB - 0.175, (ri + 0.06) * math.cos(ph) - s * 1.25 * math.sin(ph)))
P["gold"].bm((0, 10.4, 0), (0, 11.4, 0), 0.08)
P["gold"].add(sphere(0.5, 12, 8), t=(0, 11.6, 0))
for i in range(8):                                                                      # pole socket per horse
    a = 2 * PI * i / 8
    P["black2"].cylc(6.0 * math.cos(a), 0.4, 6.0 * math.sin(a), 0.22, 0.2, 8)
P["black2"].cylc(0, 4.0, 0, 1.5, 7.4, 16, rt=1.2)                                         # turning drum round the column, up into the canopy
P["gold"].tor(1.45, 0.08, t=(0, 1.0, 0), n=20, rs=5)
P["gold"].tor(1.24, 0.08, t=(0, 6.7, 0), n=20, rs=5)

# =====================================================================================================
# dn_horse
# =====================================================================================================
root = pivot("dn_horse", (0, 0, 0))
P = parts(root, "dn_horse", {"mint": 0.035, "accent": 0.03, "gold": 0.02, "black2": 0.015})
P["gold"].bm((0, -1.7, 0), (0, 6.25, 0), 0.06)                                           # game bobs the horse 1.1 to 2.1 m over the deck: pole foot stays in its socket, top in the canopy
P["mint"].rbc(0.0, 0.0, 0.0, 1.9, 0.9, 0.7, 0.4)                                         # body
P["mint"].bm((0.7, 0.2, 0.0), (1.15, 0.9, 0.0), 0.27)                                     # neck
P["mint"].rbc(1.35, 0.95, 0.0, 0.7, 0.4, 0.38, 0.3, rot=(0, 0, -0.35))                    # head
P["black2"].add(sphere(0.07, 6, 5), t=(1.5, 1.05, 0.17))                                  # eyes
P["black2"].add(sphere(0.07, 6, 5), t=(1.5, 1.05, -0.17))
P["accent"].box(-0.5, 0.3, 0.38, 0.55, -0.37, 0.37)                                       # saddle
P["accent"].poly([(0.65, 1.0), (1.05, 1.3), (1.1, 0.7), (0.8, 0.45)], -0.04, 0.04, t=(0, 0, 0))   # mane
P["accent"].bm((-0.95, 0.3, 0.0), (-1.35, -0.25, 0.0), 0.1)                              # tail
for lx, lz in ((-0.6, -0.2), (-0.6, 0.2), (0.6, -0.2), (0.6, 0.2)):
    P["mint"].bm((lx, -0.2, lz), (lx * 1.2, -0.95, lz), 0.1)                              # legs
    P["gold"].cylc(lx * 1.2, -0.97, lz, 0.12, 0.08, 8)

# =====================================================================================================
# dn_ticket_hall
# =====================================================================================================
root = pivot("dn_ticket_hall", (0, 0, 0))
P = parts(root, "dn_ticket_hall", {"mint": 0.05, "mint2": 0.02, "barn": 0.03, "gold": 0.015, "black": 0.025, "black2": 0.012, "saddle": 0.02, "glasswarm": 0.0, "glowgold": 0.0})
STR = Acc("dn_ticket_hall_stripe", "mint", root, 0.0)                                   # awning's Mint stripes: flush on the slab, no ink
P["mint2"].box(-11.2, 11.2, 0.0, 0.3, -8.2, 0.4)
P["mint"].box(-11.0, 11.0, 0.3, 3.6, -8.0, 0.0)
P["gold"].box(-11.1, 11.1, 3.55, 3.8, -8.1, 0.2)                                         # cornice
P["mint2"].box(-10.95, 10.95, 3.75, 3.9, -7.4, 0.1)                                      # roof, 15 cm in from the cornice edge, 10 cm over it
P["black"].box(-11.0, 11.0, 3.8, 5.8, -8.0, -7.4)                                        # sign back panel on the roof
for i, x in enumerate((-7.0, 0.0, 7.0)):                                                 # three windows (frame, flush pane, gold bars), each with a counter
    P["black2"].box(x - 1.9, x + 1.9, 1.4, 3.1, -0.05, 0.06)
    P["glasswarm"].box(x - 1.7, x + 1.7, 1.55, 2.95, 0.06, 0.064)
    for gx in (-0.9, -0.3, 0.3, 0.9):
        P["gold"].box(x + gx - 0.03, x + gx + 0.03, 1.55, 2.95, 0.064, 0.11)
    P["saddle"].box(x - 2.2, x + 2.2, 1.2, 1.32, 0.0, 0.9)
    P["black2"].box(x - 2.15, x + 2.15, 0.3, 1.2, 0.0, 0.8)
# awning: one Barn Red slab from inside the cornice out to 2.35 m, Mint stripes 5 mm proud all round, a valance under it
AW = dict(t=(0, 3.45, 1.1), rot=(0.28, 0, 0))
P["barn"].add(cuboid(21.8, 0.1, 2.6)[:2], **AW)
for x in (-8.0, -4.0, 0.0, 4.0, 8.0):
    STR.add(cuboid(2.0, 0.11, 2.61)[:2], t=(x, 3.45, 1.1), rot=(0.28, 0, 0))
P["barn"].box(-10.8, 10.8, 2.6, 3.12, 2.2, 2.28)                                         # valance: top inside the slab, ends 10 cm in from the slab's
P["glowgold"].box(-10.6, 10.6, 3.3, 3.38, 0.0, 0.005)                                    # lit strip on the wall under the awning

# =====================================================================================================
# dn_kiosk
# =====================================================================================================
root = pivot("dn_kiosk", (0, 0, 0))
P = parts(root, "dn_kiosk", {"mint": 0.04, "mint2": 0.02, "gold": 0.015, "black": 0.025, "saddle": 0.02, "accent": 0.025, "glowgold": 0.0, "black2": 0.012})
KS = Acc("dn_kiosk_stripe", "mint", root, 0.0)                                          # awning's Mint stripes, flush
P["mint2"].box(-2.6, 2.6, 0.0, 0.2, -3.6, 0.3)                                           # plinth
P["mint"].polyy([(-2.4, -3.4), (2.4, -3.4), (2.4, 0.0), (1.8, 0.0), (1.8, -1.0), (-1.8, -1.0), (-1.8, 0.0), (-2.4, 0.0)], 0.2, 2.9)   # lower walls with the serving bay in front
P["mint"].box(-2.4, 2.4, 2.9, 3.7, -3.4, 0.0)                                            # upper walls: fascia over the bay
P["gold"].box(-2.5, 2.5, 2.79, 2.97, -3.5, 0.1)                                          # gold belt over the joint (and bay ceiling); the awning's back end is buried in it
P["mint2"].box(-2.65, 2.65, 3.7, 3.9, -3.65, 0.25)                                       # roof slab
P["black"].box(-2.2, 2.2, 3.05, 3.6, -0.05, 0.05)                                        # name board
# bay: counter top running into the side walls, `accent` front 16 cm under it, lit menu board in a Black frame on the back wall
P["saddle"].box(-1.85, 1.85, 1.05, 1.15, -1.05, -0.04)
P["accent"].box(-1.85, 1.85, 0.18, 1.05, -1.05, -0.2)
P["black"].box(-1.5, 1.5, 1.5, 2.6, -1.03, -0.97)
P["glowgold"].box(-1.4, 1.4, 1.6, 2.5, -0.97, -0.966)
# awning: one `accent` slab from inside the belt out to 1.25 m, flush Mint stripes, a valance, two lamps under it
th = math.atan2(0.4, 1.3)
L = math.hypot(1.3, 0.4)
P["accent"].add(cuboid(4.9, 0.08, L)[:2], t=(0, 2.72, 0.6), rot=(th, 0, 0))
for x in (-1.4, 0.0, 1.4):
    KS.add(cuboid(0.7, 0.09, L + 0.01)[:2], t=(x, 2.72, 0.6), rot=(th, 0, 0))
P["accent"].box(-2.35, 2.35, 2.3, 2.55, 1.12, 1.18)
for x in (-1.2, 1.2):
    P["black2"].bm((x, 2.6, 0.9), (x, 2.33, 0.9), 0.015)
    P["glowgold"].add(sphere(0.12, 8, 6), t=(x, 2.22, 0.9))

# =====================================================================================================
# dn_fair_gate
# =====================================================================================================
root = pivot("dn_fair_gate", (0, 0, 0))
P = parts(root, "dn_fair_gate", {"mint": 0.045, "mint2": 0.02, "gold": 0.02, "barn": 0.03, "black": 0.025, "glowgold": 0.0})
for sx in (-1, 1):                                                                       # pillars, tall enough that the lintel's top is under their caps
    x = sx * 5.2
    P["mint2"].boxc(x, 0.3, 0, 1.9, 0.6, 1.9)
    P["mint"].boxc(x, 4.5, 0, 1.6, 8.0, 1.6)
    P["gold"].boxc(x, 4.0 + 0.2, 0, 1.8, 0.35, 1.8)
    P["gold"].boxc(x, 8.6, 0, 1.9, 0.3, 1.9)
    P["barn"].cylc(x, 9.5, 0, 1.3, 1.6, 4, rt=0.1, rot=(0, PI / 4, 0))
    P["gold"].add(sphere(0.2, 8, 6), t=(x, 10.4, 0))
P["barn"].box(-4.6, 4.6, 6.3, 8.3, -0.35, 0.35)                                          # lintel and gold bands, ends 20 cm into the shafts (inner faces at 4.4)
P["gold"].box(-4.6, 4.6, 6.2, 6.3, -0.42, 0.42)
P["gold"].box(-4.6, 4.6, 8.3, 8.4, -0.42, 0.42)
for zf in (-1, 1):
    a, b = (0.35, 0.4) if zf > 0 else (-0.4, -0.35)
    P["gold"].box(-3.0, 3.0, 6.75, 8.05, a, b)
    c, d = (0.4, 0.45) if zf > 0 else (-0.45, -0.4)
    P["black"].box(-2.9, 2.9, 6.85, 7.95, c, d)
for i in range(4):
    P["glowgold"].add(sphere(0.12, 6, 5), t=(-3.6 + i * 2.4, 6.15, 0.46))

# =====================================================================================================
# dn_stanchion
# =====================================================================================================
root = pivot("dn_stanchion", (0, 0, 0))
P = parts(root, "dn_stanchion", {"black2": 0.015, "gold": 0.01})
P["black2"].cylc(0, 0.04, 0, 0.22, 0.08, 10)
P["black2"].cylc(0, 0.5, 0, 0.04, 0.9, 8)
P["gold"].add(sphere(0.07, 8, 6), t=(0, 1.0, 0))
rope = pivot("dn_stanchion_rope", (0, 0, 0), root, role="rope")                         # own pivot: a line's last post goes without
Acc("dn_stanchion_rope_barn", "barn", rope, 0.0).path([(0.02, 0.88, 0), (1.0, 0.7, 0), (2.0, 0.62, 0), (3.0, 0.88, 0)], 0.025, 5)

# =====================================================================================================
# dn_fence
# =====================================================================================================
root = pivot("dn_fence", (0, 0, 0))
P = parts(root, "dn_fence", {"mint": 0.015, "barn": 0.015, "gold": 0.01, "black2": 0.0})
for i in range(8):
    x = 0.25 + i * 0.5
    (P["barn"] if i % 2 == 0 else P["mint"]).box(x - 0.1, x + 0.1, 0.0, 1.2, -0.03, 0.03)
    P["gold"].box(x - 0.11, x + 0.11, 1.2, 1.26, -0.04, 0.04)
P["black2"].box(0.0, 4.0, 0.35, 0.43, -0.07, -0.03)
P["black2"].box(0.0, 4.0, 0.85, 0.93, -0.07, -0.03)
P["black2"].box(-0.06, 0.06, 0.0, 1.3, -0.07, 0.07)

finish_and_export()
