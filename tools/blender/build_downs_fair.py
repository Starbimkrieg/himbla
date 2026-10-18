# Chimera Downs' fairground kit for Blender (4.2+ / 5.x), exported to src/assets/downs-fair.glb: the ferris wheel and carousel from the old funpark, rebuilt in the Downs' palette, and the
# annex's ticket hall, gate, fence and queue posts (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_fair.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_fair.py
#
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0 with its origin on the ground unless said. One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW).
#   dn_wheel_frame  the wheel's foot: a 16 x 10 m Mint platform with a gold rim, an A-frame of Mint legs with Barn Red bands and cross braces up to the hub (27 m up, on z = 0), the axle's bearing
#                   blocks, boarding steps at +z. Colliders and the ticket booth are the game's
#   dn_wheel        the turning part, its origin at the hub, in the x-y plane (axis z): two Mint rims 2 m apart (z = +-1), a gold inner ring, 24 spokes a side, 24 lit bulbs a side, a hub with a
#                   Barn Red plate. Radius 22 m. Twelve gondolas hang at (22 cos a, 22 sin a, 0) every 30 degrees (the game hangs them)
#   dn_gondola      a gondola, its origin at the hanger's top: a rod, a striped canopy, an open basket whose wall takes the `accent` slot (the game colours it), a bench. The seat is 3.35 m below the origin
#   dn_carousel_base the fixed foot: a Black2 platform 9 m in radius and 0.7 m tall with a gold rim and Mint steps, a gold centre column 7.4 m tall.
#   dn_carousel     the turning deck, its origin on the platform's top (y = 0.7 in the game): a Mint deck 8 m in radius with a Barn Red and Mint inlay, a ring of 12 canopy panels alternating Barn Red and Mint
#                   (9.6 m across at 7.3 m, up to 10.5 m), a gold rim ring with 24 lit bulbs, a finial; the horses ride on 8 poles at r 6
#   dn_horse        a carousel horse on its pole, the origin at the horse's middle (the pole runs from -1.6 to 5 m), facing +x: Mint body, head and neck, an `accent` saddle and mane, a gold pole
#   dn_ticket_hall  a ticket hall, 22 x 3.6 x 8 m, front toward +z, origin at the middle of the front on the ground: three windows, a striped awning, a name board (the game writes TICKETS at y = 4.9)
#   dn_fair_gate    the annex's gate arch, 12 m between its outer faces, 8 m tall, a Black name board (centre y 7.4, 5.6 x 1 m) on both faces
#   dn_stanchion    a queue post, 1 m: a Gold-capped Black2 post, a Barn Red rope 3 m long hanging toward +x
#   dn_fence        4 m of the annex's fence, 1.3 m tall, along +x from its post at x = 0: striped pickets with gold caps
DOWNS_OUT = "downs-fair.glb"
DOWNS_COLL = "MoonDownsFair"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

HUB = 27.0
R = 22.0

# =====================================================================================================
# dn_wheel_frame
# =====================================================================================================
root = pivot("dn_wheel_frame", (0, 0, 0))
P = parts(root, "dn_wheel_frame", {"mint": 0.05, "mint2": 0.03, "gold": 0.02, "barn": 0.025, "black2": 0.03, "money2": 0.0})
P["mint2"].box(-8.0, 8.0, 0.0, 0.8, -5.0, 5.0)
P["gold"].box(-8.1, 8.1, 0.7, 0.9, -5.1, 5.1)
P["money2"].box(-7.6, 7.6, 0.8, 0.84, -4.6, 4.6)                                         # a deck inlay
for sx in (-1, 1):
    P["mint2"].box(sx * 4.0 - 1.5, sx * 4.0 + 1.5, 0.0, 0.5, 5.0, 6.8)                   # the steps at the front
    P["mint2"].box(sx * 4.0 - 1.5, sx * 4.0 + 1.5, 0.0, 0.25, 6.8, 8.0)
    for sz in (-1, 1):
        P["mint"].bm((sx * 7.0, 0.9, sz * 3.4), (0.0, HUB - 0.5, sz * 1.5), 0.6)           # the A-frame's legs
        for t in (0.25, 0.5, 0.75):                                                     # barn red bands round each leg
            x = sx * 7.0 * (1 - t); y = 0.9 + (HUB - 1.4) * t; z = sz * (3.4 - 1.9 * t)
            P["barn"].bm((x + sx * 0.0, y - 0.12, z), (x - sx * 0.12, y + 0.14, z), 0.68)
for sz in (-1, 1):
    P["mint"].bm((-3.5, HUB * 0.5, sz * 2.45), (3.5, HUB * 0.5, sz * 2.45), 0.3)         # cross braces
    P["mint"].bm((-5.2, HUB * 0.25, sz * 2.9), (5.2, HUB * 0.25, sz * 2.9), 0.28)
    P["black2"].boxc(0, HUB, sz * 1.6, 1.8, 1.8, 0.9)                                    # the axle's bearing blocks
P["black2"].bm((0, HUB, -2.0), (0, HUB, 2.0), 0.45)

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
P["barn"].cylc(0, -1.1, 0, 1.35, 0.8, 12, rt=0.05)                                        # the canopy, in two colours: a cone and a Mint band round its edge
P["mint"].lath([(1.38, -1.5), (1.38, -1.4), (1.2, -1.4), (1.2, -1.5)], segs=16)
for p in range(3):
    b = 2 * PI * p / 3
    P["mint"].bm((math.cos(b) * 1.05, -2.55, math.sin(b) * 1.05), (math.cos(b) * 1.05, -1.5, math.sin(b) * 1.05), 0.05)
P["accent"].lath([(0.95, -3.45), (1.1, -3.4), (1.15, -2.6), (1.15, -2.55), (1.05, -2.55), (1.0, -3.4)], segs=18)      # the open basket's wall
P["gold"].tor(1.15, 0.08, t=(0, -2.55, 0), n=18, rs=5)
P["black2"].cylc(0, -3.5, 0, 0.95, 0.12, 16)
P["saddle"].box(-0.5, 0.5, -3.1, -2.98, -0.35, 0.35)                                     # a bench across the basket

# =====================================================================================================
# dn_carousel_base
# =====================================================================================================
root = pivot("dn_carousel_base", (0, 0, 0))
P = parts(root, "dn_carousel_base", {"black2": 0.05, "gold": 0.025, "mint2": 0.03, "mint": 0.0})
P["black2"].cylc(0, 0.35, 0, 9.0, 0.7, 28, rt=8.6)
P["gold"].tor(8.9, 0.1, t=(0, 0.62, 0), n=36, rs=5)
for i in range(4):
    a = i * PI / 2 + PI / 4
    P["mint2"].boxc(9.4 * math.sin(a), 0.17, 9.4 * math.cos(a), 3.0, 0.3, 1.2, rot=(0, a, 0))   # steps up to the platform
P["gold"].cylc(0, 0.7 + 3.7, 0, 0.6, 7.4, 12)

# =====================================================================================================
# dn_carousel
# =====================================================================================================
root = pivot("dn_carousel", (0, 0, 0))
P = parts(root, "dn_carousel", {"mint": 0.04, "barn": 0.035, "money2": 0.0, "gold": 0.025, "black2": 0.02, "glowgold": 0.0})
P["mint"].cylc(0, 0.15, 0, 8.0, 0.3, 28)
P["gold"].tor(8.0, 0.1, t=(0, 0.3, 0), n=36, rs=5)
P["barn"].cylc(0, 0.325, 0, 5.0, 0.04, 24)                                               # an inlay: a Barn Red disc
P["money2"].cylc(0, 0.345, 0, 3.4, 0.04, 24)
P["gold"].cylc(0, 0.37, 0, 1.4, 0.06, 18)
# the canopy: 12 flat panels, alternately Barn Red and Mint, from the rim at 7.3 m up to the apex at 10.5 m
RB, YB, YT = 9.6, 7.3, 10.5
for i in range(12):
    a = 2 * PI * (i + 0.5) / 12
    half = RB * math.sin(PI / 12)
    rbm = RB * math.cos(PI / 12)
    slant = math.hypot(rbm, YT - YB)
    th = -math.atan2(rbm, YT - YB)                                                      # tilt the panel's up axis toward the apex (-z) and up
    g = xf(extrude([(-half, 0), (half, 0), (0, slant)], 0.1, "z"), (0, YB, rbm), (th, 0, 0))
    g = xf(g, (0, 0, 0), (0, a, 0))
    (P["barn"] if i % 2 == 0 else P["mint"]).geos.append(g)
P["gold"].tor(9.55, 0.14, t=(0, 7.3, 0), n=40, rs=5)
for i in range(24):
    a = 2 * PI * i / 24
    P["glowgold"].add(sphere(0.18, 8, 6), t=(math.sin(a) * 9.5, 7.0, math.cos(a) * 9.5))
P["gold"].bm((0, 10.4, 0), (0, 11.4, 0), 0.08)
P["gold"].add(sphere(0.5, 12, 8), t=(0, 11.6, 0))
for i in range(8):                                                                      # a pole socket for each horse
    a = 2 * PI * i / 8
    P["black2"].cylc(6.0 * math.cos(a), 0.4, 6.0 * math.sin(a), 0.22, 0.2, 8)
P["black2"].cylc(0, 4.0, 0, 1.5, 7.4, 16, rt=1.2)                                         # the turning drum round the centre column
P["gold"].tor(1.45, 0.08, t=(0, 1.0, 0), n=20, rs=5)
P["gold"].tor(1.2, 0.08, t=(0, 7.5, 0), n=20, rs=5)

# =====================================================================================================
# dn_horse
# =====================================================================================================
root = pivot("dn_horse", (0, 0, 0))
P = parts(root, "dn_horse", {"mint": 0.035, "accent": 0.03, "gold": 0.02, "black2": 0.015})
P["gold"].bm((0, -1.6, 0), (0, 5.0, 0), 0.06)
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
P["mint2"].box(-11.2, 11.2, 0.0, 0.3, -8.2, 0.4)
P["mint"].box(-11.0, 11.0, 0.3, 3.6, -8.0, 0.0)
P["gold"].box(-11.1, 11.1, 3.55, 3.8, -8.1, 0.2)
P["black"].box(-11.0, 11.0, 3.8, 5.8, -8.0, -7.4)                                        # the sign's back panel, standing on the roof
for i, x in enumerate((-7.0, 0.0, 7.0)):                                                 # three windows (frames behind the panes), each with a counter
    P["black2"].box(x - 1.9, x + 1.9, 1.4, 3.1, 0.0, 0.04)
    P["glasswarm"].box(x - 1.7, x + 1.7, 1.55, 2.95, 0.04, 0.08)
    for gx in (-0.9, -0.3, 0.3, 0.9):
        P["gold"].box(x + gx - 0.03, x + gx + 0.03, 1.55, 2.95, 0.08, 0.13)
    P["saddle"].box(x - 2.2, x + 2.2, 1.2, 1.32, 0.0, 0.9)
    P["black2"].box(x - 2.15, x + 2.15, 0.3, 1.2, 0.0, 0.8)
for i in range(11):                                                                      # the awning
    (P["barn"] if i % 2 == 0 else P["mint"]).boxc(-10.0 + i * 2.0, 3.45, 1.1, 1.98, 0.1, 2.6, rot=(0.28, 0, 0))
P["barn"].box(-11.0, 11.0, 2.55, 2.95, 2.25, 2.33)
P["glowgold"].box(-10.6, 10.6, 3.62, 3.7, 0.0, 0.04)

# =====================================================================================================
# dn_fair_gate
# =====================================================================================================
root = pivot("dn_fair_gate", (0, 0, 0))
P = parts(root, "dn_fair_gate", {"mint": 0.045, "mint2": 0.02, "gold": 0.02, "barn": 0.03, "black": 0.025, "glowgold": 0.0})
for sx in (-1, 1):
    x = sx * 5.2
    P["mint2"].boxc(x, 0.3, 0, 1.9, 0.6, 1.9)
    P["mint"].boxc(x, 4.0, 0, 1.6, 7.0, 1.6)
    P["gold"].boxc(x, 4.0 + 0.2, 0, 1.8, 0.35, 1.8)
    P["gold"].boxc(x, 7.6, 0, 1.9, 0.3, 1.9)
    P["barn"].cylc(x, 8.5, 0, 1.3, 1.6, 4, rt=0.1, rot=(0, PI / 4, 0))
    P["gold"].add(sphere(0.2, 8, 6), t=(x, 9.4, 0))
P["barn"].box(-4.4, 4.4, 6.3, 8.3, -0.35, 0.35)                                          # the lintel
P["gold"].box(-4.4, 4.4, 6.2, 6.3, -0.42, 0.42)
P["gold"].box(-4.4, 4.4, 8.3, 8.4, -0.42, 0.42)
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
P = parts(root, "dn_stanchion", {"black2": 0.015, "gold": 0.01, "barn": 0.0})
P["black2"].cylc(0, 0.04, 0, 0.22, 0.08, 10)
P["black2"].cylc(0, 0.5, 0, 0.04, 0.9, 8)
P["gold"].add(sphere(0.07, 8, 6), t=(0, 1.0, 0))
P["barn"].path([(0.02, 0.88, 0), (1.0, 0.7, 0), (2.0, 0.62, 0), (3.0, 0.88, 0)], 0.025, 5)

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
