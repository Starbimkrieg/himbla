# Chimera Downs' stable yard and paddock kit for Blender (4.2+ / 5.x), exported to src/assets/downs-stable.glb (docs/downs-layouts.md, layout B: the stables behind the far stand, the parade
# ring and the weighing room in the infield, the lawn's picnic tables).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stable.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stable.py
#
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0. One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_stable_block a block of six boxes, 30 m along x, front (+z) at z = 0, the body behind it to z = -9, a 2.4 m porch on Saddle posts in front: Barn Red walls with Mint trim, six Dutch doors
#                   (a Saddle lower half, the upper half open and dark) each with a lantern and a feed trough, a Barn Red2 gable roof with a Mint ridge and two louvred cupolas, 7.4 m to the ridge
#   dn_hay_barn     the hay barn, 24 m along x, 14 deep (z = 0 to -14), front +z: Barn Red with a Mint X-braced sliding door, a hayloft door with a hoist beam, a gambrel Barn Red2 roof, a cupola
#   dn_pavilion     the weighing room, 18 m along x, 10 deep (z = 0 to -10), front +z: a Mint hall 3.8 m tall under a Barn Red hip roof, a four-column porch, three lit windows, a Black name board
#                   (the game writes WEIGHING ROOM at y = 3.5 on the porch's beam, centre z = 2.3)
#   dn_ring_gate    the parade ring's gate: two Mint posts 3.6 m apart with gold balls, a Black2 cross bar at 2.3 m, front +z
#   dn_hay          a hay bale, 1.2 x 0.6 x 0.6 m, Saddle with two Mint straps
#   dn_picnic       a picnic table 2.4 x 1 m with two benches and a sunshade: the umbrella's canopy takes the `accent` slot
DOWNS_OUT = "downs-stable.glb"
DOWNS_COLL = "MoonDownsStable"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# =====================================================================================================
# dn_stable_block
# =====================================================================================================
root = pivot("dn_stable_block", (0, 0, 0))
P = parts(root, "dn_stable_block", {"barn": 0.04, "barn2": 0.04, "mint": 0.03, "mint2": 0.02, "saddle": 0.02, "saddle2": 0.015, "black": 0.02, "gold": 0.012, "glowgold": 0.0, "black2": 0.012})
P["mint2"].box(-15.3, 15.3, 0.0, 0.5, -9.2, 0.2)                                         # plinth
P["barn"].box(-15.0, 15.0, 0.5, 4.2, -9.0, 0.0)                                          # the walls
for sx in (-1, 1):
    x0, x1 = (sx * 15.0 - 0.25, sx * 15.0 + 0.05) if sx > 0 else (sx * 15.0 - 0.05, sx * 15.0 + 0.25)
    P["mint"].box(x0, x1, 0.45, 4.25, -9.05, 0.06)                                       # corner boards
P["mint"].box(-14.95, 14.95, 0.52, 0.9, 0.0, 0.04)                                    # a Mint kick strip along the foot
P["mint"].box(-14.95, 14.95, 3.9, 4.18, 0.0, 0.06)                                     # and an eaves board
for i in range(6):
    x = -12.5 + 5.0 * i
    P["mint"].box(x - 1.0, x + 1.0, 0.5, 3.4, 0.0, 0.08)                                 # the door frame
    P["black"].box(x - 0.75, x + 0.75, 1.95, 3.2, 0.08, 0.1)                             # the open upper half: dark
    P["saddle"].box(x - 0.75, x + 0.75, 0.55, 1.95, 0.08, 0.14)                          # the lower half, shut
    P["saddle2"].box(x - 0.7, x + 0.7, 1.0, 1.06, 0.14, 0.17)                            # a plank line across it
    P["gold"].box(x + 0.5, x + 0.62, 1.2, 1.5, 0.14, 0.2)                                # the latch
    P["black2"].box(x + 1.15, x + 1.31, 2.6, 2.7, 0.0, 0.5)                              # a lantern on a bracket
    P["black2"].box(x + 1.1, x + 1.36, 2.1, 2.55, 0.35, 0.65)
    P["glowgold"].box(x + 1.14, x + 1.32, 2.15, 2.5, 0.38, 0.62)
    P["saddle2"].box(x - 0.6, x + 0.6, 0.0, 0.45, 0.6, 1.3)                              # the feed trough, on the porch floor
# the porch: posts, a beam, a floor
P["saddle2"].box(-15.2, 15.2, 0.0, 0.12, 0.2, 2.4)
for i in range(7):
    x = -15.0 + 5.0 * i
    P["saddle"].box(x - 0.13, x + 0.13, 0.12, 4.0, 2.05, 2.31)
P["saddle"].box(-15.2, 15.2, 3.95, 4.2, 2.0, 2.36)
# the roof: a gable prism over the whole block, eaves 0.6 m past the porch beam and back wall
P["barn2"].polyx([(-9.6, 4.15), (2.6, 4.15), (2.6, 4.3), (-3.5, 7.2), (-9.6, 4.3)], -15.6, 15.6)
P["mint"].box(-15.7, 15.7, 7.05, 7.35, -3.75, -3.25)                                      # the ridge cap
for x in (-8.0, 8.0):                                                                    # a louvred cupola each
    P["mint2"].box(x - 1.0, x + 1.0, 7.3, 8.5, -3.95, -3.05)
    for i in range(4):
        P["black"].box(x - 0.8, x + 0.8, 7.55 + i * 0.25, 7.65 + i * 0.25, -4.0, -3.95)
        P["black"].box(x - 0.8, x + 0.8, 7.55 + i * 0.25, 7.65 + i * 0.25, -3.05, -3.0)
    P["barn2"].add(cylinder(0.15, 1.5, 0.9, 4), t=(x, 8.95, -3.5), rot=(0, PI / 4, 0))
    P["gold"].bm((x, 9.3, -3.5), (x, 10.0, -3.5), 0.04)

# =====================================================================================================
# dn_hay_barn
# =====================================================================================================
root = pivot("dn_hay_barn", (0, 0, 0))
P = parts(root, "dn_hay_barn", {"barn": 0.05, "barn2": 0.04, "mint": 0.03, "mint2": 0.02, "saddle": 0.02, "black": 0.025, "gold": 0.012, "glasswarm": 0.0, "black2": 0.015})
P["mint2"].box(-12.2, 12.2, 0.0, 0.5, -14.2, 0.2)
P["barn"].box(-12.0, 12.0, 0.5, 6.0, -14.0, 0.0)
for sx in (-1, 1):
    x0, x1 = (sx * 12.0 - 0.3, sx * 12.0 + 0.05) if sx > 0 else (sx * 12.0 - 0.05, sx * 12.0 + 0.3)
    P["mint"].box(x0, x1, 0.45, 6.05, -14.05, 0.08)
P["mint"].box(-11.95, 11.95, 0.52, 0.9, 0.01, 0.05)
# the sliding door: a Black frame, two leaves in Mint with X braces
P["black"].box(-4.4, 4.4, 0.5, 6.0, 0.0, 0.1)
for sx in (-1, 1):
    x0, x1 = (0.05, 4.2) if sx > 0 else (-4.2, -0.05)
    P["mint"].box(x0, x1, 0.55, 5.8, 0.1, 0.2)
    P["barn"].bm((x0 + 0.1, 0.8, 0.22), (x1 - 0.1, 5.5, 0.22), 0.09)
    P["barn"].bm((x0 + 0.1, 5.5, 0.22), (x1 - 0.1, 0.8, 0.22), 0.09)
P["black2"].box(-4.6, 4.6, 5.78, 5.98, 0.02, 0.5)                                         # the door's rail
# a hayloft door high up with a hoist beam
P["black"].box(-1.3, 1.3, 7.4, 9.4, 0.0, 0.06)
P["mint"].box(-1.2, -0.05, 7.5, 9.3, 0.06, 0.12)
P["mint"].box(0.05, 1.2, 7.5, 9.3, 0.06, 0.12)
P["black2"].box(-0.12, 0.12, 9.5, 9.7, 0.0, 2.2)
P["black2"].bm((0, 9.6, 2.1), (0, 8.7, 2.1), 0.03)
P["gold"].add(sphere(0.15, 6, 5), t=(0, 8.65, 2.1))
for sx in (-1, 1):                                                                       # lit windows either side (frames behind panes)
    for x in (sx * 8.0,):
        P["black2"].box(x - 1.1, x + 1.1, 2.4, 4.1, 0.0, 0.04)
        P["glasswarm"].box(x - 0.95, x + 0.95, 2.55, 3.95, 0.04, 0.08)
        P["black2"].box(x - 0.04, x + 0.04, 2.55, 3.95, 0.08, 0.11)
# a gambrel roof: two pitches, eaves 0.8 m out
P["barn2"].polyx([(-14.8, 6.0), (0.8, 6.0), (-1.2, 9.2), (-7.0, 12.0), (-12.8, 9.2)], -12.8, 12.8)
P["mint"].box(-12.9, 12.9, 11.85, 12.15, -7.3, -6.7)
P["mint2"].box(-1.2, 1.2, 12.1, 13.4, -7.6, -6.4)
P["barn2"].add(cylinder(0.2, 1.8, 1.0, 4), t=(0, 13.9, -7.0), rot=(0, PI / 4, 0))
P["gold"].bm((0, 14.4, -7.0), (0, 15.2, -7.0), 0.04)

# =====================================================================================================
# dn_pavilion
# =====================================================================================================
root = pivot("dn_pavilion", (0, 0, 0))
P = parts(root, "dn_pavilion", {"mint": 0.04, "mint2": 0.02, "money2": 0.0, "barn": 0.035, "gold": 0.015, "black": 0.025, "glasswarm": 0.0, "saddle2": 0.0})
P["mint2"].box(-9.2, 9.2, 0.0, 0.4, -10.2, 3.2)
P["saddle2"].box(-9.0, 9.0, 0.4, 0.44, 0.0, 3.0)                                         # the porch's floor
P["mint"].box(-9.0, 9.0, 0.4, 3.8, -10.0, 0.0)
P["money2"].box(-9.04, 9.04, 0.42, 1.3, -10.04, 0.04)
P["gold"].box(-9.1, 9.1, 3.6, 3.95, -10.1, 0.1)
for x in (-5.5, 0.0, 5.5):                                                               # three lit windows, frames behind their panes
    P["black"].box(x - 1.3, x + 1.3, 1.55, 3.3, 0.0, 0.04)
    P["glasswarm"].box(x - 1.15, x + 1.15, 1.7, 3.15, 0.04, 0.08)
    P["black"].box(x - 0.04, x + 0.04, 1.7, 3.15, 0.08, 0.11)
for x in (-8.4, -2.8, 2.8, 8.4):                                                         # the porch's columns
    P["mint"].cylc(x, 0.42 + 1.94, 2.8, 0.26, 3.88, 12)
    P["gold"].cylc(x, 4.3, 2.8, 0.34, 0.15, 12)
P["mint2"].box(-9.0, 9.0, 4.2, 4.75, 2.4, 3.2)                                           # the porch's beam (the sign goes on its front)
P["black"].box(-5.0, 5.0, 4.3, 4.65, 3.2, 3.26)
P["barn"].add(cylinder(2.0, 14.0, 4.0, 4), t=(0, 4.8 + 2.0, -3.4), rot=(0, PI / 4, 0), s=(0.78, 1.0, 0.78))   # the hip roof
P["gold"].boxc(0, 8.85, -3.4, 4.0, 0.25, 0.5)

# =====================================================================================================
# dn_ring_gate
# =====================================================================================================
root = pivot("dn_ring_gate", (0, 0, 0))
P = parts(root, "dn_ring_gate", {"mint": 0.025, "gold": 0.015, "black2": 0.015})
for sx in (-1, 1):
    P["mint"].boxc(sx * 1.8, 1.25, 0, 0.3, 2.5, 0.3)
    P["gold"].add(sphere(0.2, 8, 6), t=(sx * 1.8, 2.7, 0))
P["black2"].box(-1.65, 1.65, 2.2, 2.35, -0.06, 0.06)

# =====================================================================================================
# dn_hay
# =====================================================================================================
root = pivot("dn_hay", (0, 0, 0))
P = parts(root, "dn_hay", {"saddle": 0.02, "mint": 0.0})
P["saddle"].box(-0.6, 0.6, 0.0, 0.6, -0.3, 0.3)
for x in (-0.3, 0.3):
    P["mint"].box(x - 0.025, x + 0.025, 0.01, 0.62, -0.32, 0.32)

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
        P["black2"].bm((sx * 0.95, 0.0, sz * 0.45), (sx * 0.7, 0.74, sz * 0.15), 0.04)
    P["black2"].box(sx * 0.95 - 0.03, sx * 0.95 + 0.03, 0.0, 0.42, -0.95, 0.95)
P["mint"].cylc(0, 1.3, 0, 0.035, 2.5, 6)
P["accent"].cylc(0, 2.5, 0, 0.05, 0.5, 10, rt=0.05)                                      # (a cone: the canopy, wide at its rim)
P["accent"].lath([(0.0, 2.8), (1.0, 2.62), (1.8, 2.35), (1.8, 2.3), (1.0, 2.55), (0.0, 2.72)], segs=10)
P["gold"].add(sphere(0.07, 6, 5), t=(0, 2.85, 0))

finish_and_export()
