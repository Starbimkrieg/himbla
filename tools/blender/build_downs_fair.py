# Chimera Downs' fairground kit for Blender (4.2+ / 5.x), exported to src/assets/downs-fair.glb: the ferris wheel and carousel from the old funpark, rebuilt in the Downs' palette, and the
# annex's ticket hall, kiosks, gate, fence and queue posts (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_fair.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_fair.py
#
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0 with its origin on the ground unless said. One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW).
#   dn_wheel_frame  the wheel's foot: a 16 x 10 m Mint platform (deck 0.8 m up, a Money2 inlay lying flush on it, a gold band round its edge) and two flights of boarding steps at +z, each one
#                   piece; an A-frame of Mint legs each side of the wheel with coaxial Barn Red bands and cross braces, up to bearing blocks at z = +-2.8 that stand clear of the wheel's hub,
#                   the axle through them (27 m up) with gold caps. Colliders are the game's
#   dn_wheel        the turning part, its origin at the hub, in the x-y plane (axis z): two Mint rims 2 m apart (z = +-1), a gold inner ring, 24 spokes a side, 24 lit bulbs a side, a hub with a
#                   Barn Red plate. Radius 22 m. Twelve gondolas hang at (22 cos a, 22 sin a, 0) every 30 degrees (the game hangs them)
#   dn_gondola      a gondola, its origin at the hanger's top: a rod, a Barn Red canopy with a Mint band round its rim, an open basket whose wall takes the `accent` slot (the game colours it), a
#                   bench from wall to wall. The seat is 3.35 m below the origin
#   dn_carousel_base the fixed foot: a Black2 platform 9 m in radius and 0.7 m tall with a gold rim sunk into its side and four Mint steps, a gold centre column 7.4 m tall.
#   dn_carousel     the turning deck, its origin on the platform's top (y = 0.7 in the game): a Mint deck 8 m in radius with a Barn Red and Mint inlay, a canopy that is one solid twelve-sided
#                   pyramid in Barn Red (9.6 m to its corners at 7.3 m, up to 10.5 m) with every other face clad in Mint lying flush on it, a gold twelve-sided skirt under its eaves with 24 lit
#                   bulbs, a finial; the horses ride on 8 poles at r 6 whose tops always stay inside the canopy
#   dn_horse        a carousel horse on its pole, the origin at the horse's middle (the pole runs from -1.7 to 6.25 m), facing +x: Mint body, head and neck, an `accent` saddle and mane, a gold pole
#   dn_ticket_hall  a ticket hall, 22 x 3.6 x 8 m, front toward +z, origin at the middle of the front on the ground: three windows, a striped awning (one Barn Red slab with Mint stripes lying flush
#                   on it) over a valance, a lit strip under it, a Mint2 roof inside a gold cornice, a name board standing on the roof (the game writes TICKETS at y = 4.8)
#   dn_kiosk        a free-standing food kiosk, 4.8 x 3.4 m and 3.9 m tall, front +z: Mint walls with a serving bay let into the front (a Saddle counter on an `accent` front, a lit menu board on
#                   the bay's back wall), a gold belt round it all where the upper walls stand on the lower, a Black name board on the fascia (the game writes the name at y = 3.325, z = 0.06),
#                   a striped awning in `accent` and Mint with a valance and two hanging lamps, a Mint2 roof slab
#   dn_fair_gate    the annex's gate arch, 12 m between its outer faces, 10.6 m to the balls on its pillars, the lintel's ends inside the pillars; a Black name board (centre y 7.4, 5.8 x 1.1 m) on both faces
#   dn_stanchion    a queue post, 1 m: a Gold-capped Black2 post; its Barn Red rope, 3 m long and hanging toward +x to the next post, is under a pivot of role `rope`, so the game can leave it
#                   off the last post of a line
#   dn_fence        4 m of the annex's fence, 1.3 m tall, along +x from its post at x = 0: striped pickets with gold caps
#
# Joints (the outline rule, as the arcades'): two outlined pieces never meet flush, face to face in one plane, because one's ink shell would show along the joint as a dark seam. A piece
# that ends on another either ends well inside it or meets it at a real step of 5 cm or more; stripes and inlays with no ink lie within 6 mm of their host; pieces mounted on a wall start
# inside it. Solids of revolution are closed (lathe profiles end where they start), so nothing is seen through.
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
P["gold"].box(-8.1, 8.1, 0.55, 0.72, -5.1, 5.1)                                          # a gold band round the platform's edge, 8 cm under the deck
P["money2"].box(-7.6, 7.6, 0.8, 0.805, -4.6, 4.6)                                        # the deck's inlay, flush on it
for sx in (-1, 1):                                                                       # the steps at the front: each flight one piece, its back in the platform
    P["mint2"].polyx([(4.9, 0.0), (8.0, 0.0), (8.0, 0.25), (6.8, 0.25), (6.8, 0.5), (4.9, 0.5)], sx * 4.0 - 1.5, sx * 4.0 + 1.5)
# the A-frames: a pair of legs each side of the wheel, from the platform (their feet inside it) up to a bearing block at z = +-2.8, clear of the hub's plates (z up to 1.97)
LEG_R, TOP_Y, ZT, ZB = 0.6, 26.5, 2.8, 4.0
for sz in (-1, 1):
    for sx in (-1, 1):
        A, Bt = (sx * 7.0, 0.55, sz * ZB), (0.0, TOP_Y, sz * ZT)
        P["mint"].bm(A, Bt, LEG_R)
        L = math.dist(A, Bt)
        u = tuple((Bt[i] - A[i]) / L for i in range(3))
        for t in (0.25, 0.5, 0.75):                                                     # Barn Red bands round each leg, on its own axis
            c = lerp3(A, Bt, t)
            P["barn"].bm(tuple(c[i] - u[i] * 0.13 for i in range(3)), tuple(c[i] + u[i] * 0.13 for i in range(3)), LEG_R + 0.08)
    for y, r in ((HUB * 0.5, 0.3), (HUB * 0.25, 0.28)):                                  # cross braces, their ends at the legs' axes
        t = (y - 0.55) / (TOP_Y - 0.55)
        x, z = 7.0 * (1 - t), ZB + (ZT - ZB) * t
        P["mint"].bm((-x, y, sz * z), (x, y, sz * z), r)
    P["black2"].boxc(0, HUB, sz * ZT, 1.8, 1.8, 1.5)                                     # the axle's bearing blocks, the legs' tops inside them
    P["gold"].cylc(0, HUB, sz * 3.8, 0.55, 0.1, 12, rot=(PI / 2, 0, 0))                  # a cap on each end of the axle
P["black2"].bm((0, HUB, -3.76), (0, HUB, 3.76), 0.45)                                    # the axle, 20 cm out of each block

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
P["gold"].cylc(0, 0, 0, 1.6, 3.4, 16, rot=(PI / 2, 0, 0))                                 # the hub
for s in (-1, 1):
    P["barn"].cylc(0, 0, s * 1.8, 2.4, 0.2, 20, rot=(PI / 2, 0, 0))                      # a Barn Red plate on each side
    P["gold"].cylc(0, 0, s * 1.92, 0.7, 0.1, 12, rot=(PI / 2, 0, 0))
for i in range(12):                                                                     # where each gondola hangs: a Black2 bracket between the rims
    a = 2 * PI * i / 12
    P["black2"].bm((math.cos(a) * R, math.sin(a) * R, -1.0), (math.cos(a) * R, math.sin(a) * R, 1.0), 0.12)

# =====================================================================================================
# dn_gondola
# =====================================================================================================
root = pivot("dn_gondola", (0, 0, 0))
P = parts(root, "dn_gondola", {"black2": 0.015, "mint": 0.03, "barn": 0.025, "accent": 0.035, "gold": 0.015, "saddle": 0.02})
P["black2"].bm((0, 0, 0), (0, -1.4, 0), 0.07)
P["barn"].cylc(0, -1.1, 0, 1.35, 0.8, 12, rt=0.05)                                        # the canopy, in two colours: a cone and a Mint band round its rim (closed, its foot 2 cm under the cone's)
P["mint"].lath([(1.38, -1.52), (1.38, -1.42), (1.2, -1.42), (1.2, -1.52), (1.38, -1.52)], segs=16)
for p in range(3):
    b = 2 * PI * p / 3
    P["mint"].bm((math.cos(b) * 1.13, -2.57, math.sin(b) * 1.13), (math.cos(b) * 1.13, -1.47, math.sin(b) * 1.13), 0.05)   # hangers: the foot in the rim and its gold ring, the top in the cone
P["accent"].lath([(0.95, -3.45), (1.1, -3.4), (1.15, -2.6), (1.15, -2.55), (1.05, -2.55), (1.0, -3.4), (0.95, -3.45)], segs=18)      # the open basket's wall
P["gold"].tor(1.15, 0.08, t=(0, -2.55, 0), n=18, rs=5)
P["black2"].cylc(0, -3.5, 0, 0.95, 0.12, 18)
P["saddle"].box(-1.04, 1.04, -3.1, -2.98, -0.35, 0.35)                                   # a bench across the basket, its ends in the wall

# =====================================================================================================
# dn_carousel_base
# =====================================================================================================
root = pivot("dn_carousel_base", (0, 0, 0))
P = parts(root, "dn_carousel_base", {"black2": 0.05, "gold": 0.025, "mint2": 0.03, "mint": 0.0})
P["black2"].cylc(0, 0.35, 0, 9.0, 0.7, 28, rt=8.6)
P["gold"].tor(8.68, 0.1, t=(0, 0.62, 0), n=36, rs=5)                                     # (sunk into the platform's sloping side all round)
for i in range(4):
    a = i * PI / 2 + PI / 4
    P["mint2"].boxc(9.25 * math.sin(a), 0.17, 9.25 * math.cos(a), 3.0, 0.3, 1.5, rot=(0, a, 0))   # steps up to the platform, their back corners inside it
P["gold"].cylc(0, 0.7 + 3.7, 0, 0.6, 7.4, 12)

# =====================================================================================================
# dn_carousel
# =====================================================================================================
root = pivot("dn_carousel", (0, 0, 0))
P = parts(root, "dn_carousel", {"mint": 0.04, "barn": 0.035, "money2": 0.0, "gold": 0.025, "black2": 0.02, "glowgold": 0.0})
CLAD = Acc("dn_carousel_clad", "mint", root, 0.0)                                       # (the canopy's Mint faces: flush on the pyramid, no line of their own)
P["mint"].cylc(0, 0.15, 0, 8.0, 0.3, 28)
P["gold"].tor(8.0, 0.1, t=(0, 0.3, 0), n=36, rs=5)
P["barn"].cylc(0, 0.3125, 0, 5.0, 0.065, 24)                                             # an inlay: a Barn Red disc, its foot in the deck
P["money2"].cylc(0, 0.345, 0, 3.4, 0.04, 24)
P["gold"].cylc(0, 0.37, 0, 1.4, 0.06, 18)
# the canopy: one twelve-sided pyramid from its corners (9.6 m out at 7.3 m) up to the apex at 10.5 m, every other face clad in Mint 2 to 6 mm off it; a gold skirt under its eaves
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
SK = 9.7                                                                                 # the skirt: a twelve-sided band, 10 cm out past the pyramid's eaves
P["gold"].add(cylinder(SK, SK, 0.35, 12), t=(0, YB - 0.175, 0))
ri = SK * math.cos(PI / 12)
for k in range(12):                                                                     # two lit bulbs on each face of the skirt
    ph = 2 * PI * (k + 0.5) / 12
    for s in (-1, 1):
        P["glowgold"].add(sphere(0.18, 8, 6), t=((ri + 0.06) * math.sin(ph) + s * 1.25 * math.cos(ph), YB - 0.175, (ri + 0.06) * math.cos(ph) - s * 1.25 * math.sin(ph)))
P["gold"].bm((0, 10.4, 0), (0, 11.4, 0), 0.08)
P["gold"].add(sphere(0.5, 12, 8), t=(0, 11.6, 0))
for i in range(8):                                                                      # a pole socket for each horse
    a = 2 * PI * i / 8
    P["black2"].cylc(6.0 * math.cos(a), 0.4, 6.0 * math.sin(a), 0.22, 0.2, 8)
P["black2"].cylc(0, 4.0, 0, 1.5, 7.4, 16, rt=1.2)                                         # the turning drum round the centre column, up into the canopy
P["gold"].tor(1.45, 0.08, t=(0, 1.0, 0), n=20, rs=5)
P["gold"].tor(1.24, 0.08, t=(0, 6.7, 0), n=20, rs=5)

# =====================================================================================================
# dn_horse
# =====================================================================================================
root = pivot("dn_horse", (0, 0, 0))
P = parts(root, "dn_horse", {"mint": 0.035, "accent": 0.03, "gold": 0.02, "black2": 0.015})
P["gold"].bm((0, -1.7, 0), (0, 6.25, 0), 0.06)                                           # (the game bobs the horse 1.1 to 2.1 m over the deck: the pole's foot stays in its socket, its top in the canopy)
P["mint"].rbc(0.0, 0.0, 0.0, 1.9, 0.9, 0.7, 0.4)                                         # the body
P["mint"].bm((0.7, 0.2, 0.0), (1.15, 0.9, 0.0), 0.27)                                     # the neck
P["mint"].rbc(1.35, 0.95, 0.0, 0.7, 0.4, 0.38, 0.3, rot=(0, 0, -0.35))                    # the head
P["black2"].add(sphere(0.07, 6, 5), t=(1.5, 1.05, 0.17))                                  # an eye on each side
P["black2"].add(sphere(0.07, 6, 5), t=(1.5, 1.05, -0.17))
P["accent"].box(-0.5, 0.3, 0.38, 0.55, -0.37, 0.37)                                       # the saddle
P["accent"].poly([(0.65, 1.0), (1.05, 1.3), (1.1, 0.7), (0.8, 0.45)], -0.04, 0.04, t=(0, 0, 0))   # the mane
P["accent"].bm((-0.95, 0.3, 0.0), (-1.35, -0.25, 0.0), 0.1)                              # the tail
for lx, lz in ((-0.6, -0.2), (-0.6, 0.2), (0.6, -0.2), (0.6, 0.2)):
    P["mint"].bm((lx, -0.2, lz), (lx * 1.2, -0.95, lz), 0.1)                              # legs
    P["gold"].cylc(lx * 1.2, -0.97, lz, 0.12, 0.08, 8)

# =====================================================================================================
# dn_ticket_hall
# =====================================================================================================
root = pivot("dn_ticket_hall", (0, 0, 0))
P = parts(root, "dn_ticket_hall", {"mint": 0.05, "mint2": 0.02, "barn": 0.03, "gold": 0.015, "black": 0.025, "black2": 0.012, "saddle": 0.02, "glasswarm": 0.0, "glowgold": 0.0})
STR = Acc("dn_ticket_hall_stripe", "mint", root, 0.0)                                   # (the awning's Mint stripes: flush on the Barn Red slab, no line of their own)
P["mint2"].box(-11.2, 11.2, 0.0, 0.3, -8.2, 0.4)
P["mint"].box(-11.0, 11.0, 0.3, 3.6, -8.0, 0.0)
P["gold"].box(-11.1, 11.1, 3.55, 3.8, -8.1, 0.2)                                         # the cornice
P["mint2"].box(-10.95, 10.95, 3.75, 3.9, -7.4, 0.1)                                      # the roof, 15 cm in from the cornice's edge and 10 cm over it
P["black"].box(-11.0, 11.0, 3.8, 5.8, -8.0, -7.4)                                        # the sign's back panel, standing on the roof
for i, x in enumerate((-7.0, 0.0, 7.0)):                                                 # three windows (a frame, the pane flush on it, gold bars), each with a counter
    P["black2"].box(x - 1.9, x + 1.9, 1.4, 3.1, -0.05, 0.06)
    P["glasswarm"].box(x - 1.7, x + 1.7, 1.55, 2.95, 0.06, 0.064)
    for gx in (-0.9, -0.3, 0.3, 0.9):
        P["gold"].box(x + gx - 0.03, x + gx + 0.03, 1.55, 2.95, 0.064, 0.11)
    P["saddle"].box(x - 2.2, x + 2.2, 1.2, 1.32, 0.0, 0.9)
    P["black2"].box(x - 2.15, x + 2.15, 0.3, 1.2, 0.0, 0.8)
# the awning: one Barn Red slab from inside the cornice out to 2.35 m, the Mint stripes 5 mm proud of it all round, a valance hanging from it
AW = dict(t=(0, 3.45, 1.1), rot=(0.28, 0, 0))
P["barn"].add(cuboid(21.8, 0.1, 2.6)[:2], **AW)
for x in (-8.0, -4.0, 0.0, 4.0, 8.0):
    STR.add(cuboid(2.0, 0.11, 2.61)[:2], t=(x, 3.45, 1.1), rot=(0.28, 0, 0))
P["barn"].box(-10.8, 10.8, 2.6, 3.12, 2.2, 2.28)                                         # (its top inside the slab; its ends 10 cm in from the slab's)
P["glowgold"].box(-10.6, 10.6, 3.3, 3.38, 0.0, 0.005)                                    # a lit strip on the wall under the awning

# =====================================================================================================
# dn_kiosk
# =====================================================================================================
root = pivot("dn_kiosk", (0, 0, 0))
P = parts(root, "dn_kiosk", {"mint": 0.04, "mint2": 0.02, "gold": 0.015, "black": 0.025, "saddle": 0.02, "accent": 0.025, "glowgold": 0.0, "black2": 0.012})
KS = Acc("dn_kiosk_stripe", "mint", root, 0.0)                                          # (the awning's Mint stripes, flush)
P["mint2"].box(-2.6, 2.6, 0.0, 0.2, -3.6, 0.3)                                           # the plinth
P["mint"].polyy([(-2.4, -3.4), (2.4, -3.4), (2.4, 0.0), (1.8, 0.0), (1.8, -1.0), (-1.8, -1.0), (-1.8, 0.0), (-2.4, 0.0)], 0.2, 2.9)   # the lower walls, a serving bay let into the front
P["mint"].box(-2.4, 2.4, 2.9, 3.7, -3.4, 0.0)                                            # the upper walls: the fascia over the bay
P["gold"].box(-2.5, 2.5, 2.79, 2.97, -3.5, 0.1)                                          # a gold belt round it all, over the joint (and the bay's ceiling); the awning's back end is buried in it
P["mint2"].box(-2.65, 2.65, 3.7, 3.9, -3.65, 0.25)                                       # the roof slab
P["black"].box(-2.2, 2.2, 3.05, 3.6, -0.05, 0.05)                                        # the name board
# the bay: a counter whose top runs into the bay's side walls, an `accent` front 16 cm under it, a lit menu board in a Black frame on the back wall
P["saddle"].box(-1.85, 1.85, 1.05, 1.15, -1.05, -0.04)
P["accent"].box(-1.85, 1.85, 0.18, 1.05, -1.05, -0.2)
P["black"].box(-1.5, 1.5, 1.5, 2.6, -1.03, -0.97)
P["glowgold"].box(-1.4, 1.4, 1.6, 2.5, -0.97, -0.966)
# the awning: one `accent` slab from inside the belt out to 1.25 m, Mint stripes flush on it, a valance, two lamps hanging under it
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
for sx in (-1, 1):                                                                       # the pillars, tall enough that the lintel's top is under their caps
    x = sx * 5.2
    P["mint2"].boxc(x, 0.3, 0, 1.9, 0.6, 1.9)
    P["mint"].boxc(x, 4.5, 0, 1.6, 8.0, 1.6)
    P["gold"].boxc(x, 4.0 + 0.2, 0, 1.8, 0.35, 1.8)
    P["gold"].boxc(x, 8.6, 0, 1.9, 0.3, 1.9)
    P["barn"].cylc(x, 9.5, 0, 1.3, 1.6, 4, rt=0.1, rot=(0, PI / 4, 0))
    P["gold"].add(sphere(0.2, 8, 6), t=(x, 10.4, 0))
P["barn"].box(-4.6, 4.6, 6.3, 8.3, -0.35, 0.35)                                          # the lintel and its gold bands, their ends 20 cm into the shafts (whose inner faces are at 4.4)
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
rope = pivot("dn_stanchion_rope", (0, 0, 0), root, role="rope")                         # (its own pivot: the last post of a line goes without)
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
