# Chimera Downs' screen drum and winners' podium for Blender (4.2+ / 5.x), exported to src/assets/downs-screen.glb (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_screen.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_screen.py
#
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0 with its origin on the ground. One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_drum    the scoreboard drum at the infield's centre: a 10 x 10 Mint core pylon to 18 m with gold bands, lit slits and Black struts out to the drum, which is 41 x 15 x 21.6 m
#              (y 17.2 to 38.8) with four bezelled openings for the game's live screens: 40 x 20 m on the long faces (z = +-7.5) and 14 x 20 m on the ends (x = +-20.5), all with their
#              bottom edge at y = 18; a lit soffit, a Mint cap with a Barn Red parapet and a beacon on a mast
#   dn_podium  a set of winners' podiums, 18 x 5 m, facing +z: a Mint platform, a Gold first step (1.4 m, centre), a Mint second (1.0 m, at -x) and a Saddle third (0.7 m, at +x), each 6 x 4 m
#              with a lit rim, a Black backdrop 16 m wide and 6 tall behind them in a gold frame, a lit light bar, two lamp posts; a plate 11 x 1.4 m is left on the backdrop for the
#              game's name board (its centre 4.6 m up, 0.05 m in front of the backdrop at z = -2.25)
DOWNS_OUT = "downs-screen.glb"
DOWNS_COLL = "MoonDownsScreen"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# =====================================================================================================
# dn_drum
# =====================================================================================================
root = pivot("dn_drum", (0, 0, 0))
P = parts(root, "dn_drum", {"mint": 0.06, "mint2": 0.03, "money2": 0.0, "gold": 0.025, "black": 0.04, "black2": 0.03, "barn": 0.04, "glasswarm": 0.0, "glowgold": 0.0, "glowred": 0.0})
# the core
P["money2"].box(-5.6, 5.6, 0.0, 0.8, -5.6, 5.6)
P["mint"].box(-5.0, 5.0, 0.8, 17.4, -5.0, 5.0)
for sx in (-1, 1):
    for sz in (-1, 1):
        P["black2"].box(sx * 5.0 - 0.3, sx * 5.0 + 0.3, 0.9, 17.3, sz * 5.0 - 0.3, sz * 5.0 + 0.3)
for y in (3.0, 15.0):
    P["gold"].box(-5.2, 5.2, y, y + 0.5, -5.2, 5.2)
for sf in (-1, 1):                                                                      # lit slits on all four faces (frames behind the panes)
    for off in (-2.0, 2.0):
        P["black"].box(off - 0.75, off + 0.75, 5.0, 12.0, sf * 5.0, sf * 5.0 + sf * 0.04)
        P["glasswarm"].box(off - 0.6, off + 0.6, 5.2, 11.8, sf * 5.04, sf * 5.04 + sf * 0.03)
        P["black"].box(sf * 5.0, sf * 5.0 + sf * 0.04, 5.0, 12.0, off - 0.75, off + 0.75)
        P["glasswarm"].box(sf * 5.04, sf * 5.04 + sf * 0.03, 5.2, 11.8, off - 0.6, off + 0.6)
# the struts out to the drum's underside
for sx in (-1, 1):
    for sz in (-1, 1):
        P["black2"].bm((sx * 5.0, 12.5, sz * 5.0), (sx * 15.5, 17.2, sz * 6.6), 0.28)
        P["black2"].bm((sx * 5.0, 15.5, sz * 5.0), (sx * 11.0, 17.2, sz * 6.0), 0.2)
# the drum: a Black shell, four bezelled openings
P["black2"].box(-20.5, 20.5, 17.2, 38.8, -7.5, 7.5)
for sf in (-1, 1):                                                                      # the long faces' bezels (openings 40 x 20 from y = 18 to 38)
    z0, z1 = (7.5, 7.8) if sf > 0 else (-7.8, -7.5)
    P["mint2"].box(-20.5, 20.5, 17.2, 18.0, z0, z1)
    P["mint2"].box(-20.5, 20.5, 38.0, 38.8, z0, z1)
    P["mint2"].box(-20.5, -20.0, 18.0, 38.0, z0, z1)
    P["mint2"].box(20.0, 20.5, 18.0, 38.0, z0, z1)
    P["gold"].box(-20.0, 20.0, 18.0, 18.12, z0, z1)
for sf in (-1, 1):                                                                      # the ends' (openings 14 x 20)
    x0, x1 = (20.5, 20.8) if sf > 0 else (-20.8, -20.5)
    P["mint2"].box(x0, x1, 17.2, 18.0, -7.5, 7.5)
    P["mint2"].box(x0, x1, 38.0, 38.8, -7.5, 7.5)
    P["mint2"].box(x0, x1, 18.0, 38.0, -7.5, -7.0)
    P["mint2"].box(x0, x1, 18.0, 38.0, 7.0, 7.5)
# the soffit, lit strips along it
P["mint2"].box(-20.8, 20.8, 16.9, 17.2, -7.8, 7.8)
P["gold"].box(-20.9, 20.9, 16.85, 17.0, -7.9, 7.9)
for z in (-4.5, 0.0, 4.5):
    P["glowgold"].box(-17.0, 17.0, 16.8, 16.9, z - 0.25, z + 0.25)
# the cap: a Mint deck, a Barn Red parapet, a beacon
P["mint2"].box(-21.0, 21.0, 38.8, 39.3, -8.0, 8.0)
P["barn"].box(-21.0, 21.0, 39.3, 40.1, -8.0, -7.5)
P["barn"].box(-21.0, 21.0, 39.3, 40.1, 7.5, 8.0)
P["barn"].box(-21.0, -20.5, 39.3, 40.1, -7.5, 7.5)
P["barn"].box(20.5, 21.0, 39.3, 40.1, -7.5, 7.5)
P["gold"].box(-21.1, 21.1, 40.1, 40.3, -8.1, 8.1)
for x in (-15.0, -7.5, 0.0, 7.5, 15.0):                                                 # flood lamps along the top of the long sides
    for sf in (-1, 1):
        P["black2"].box(x - 0.6, x + 0.6, 39.3, 40.5, sf * 6.8 - 0.4, sf * 6.8 + 0.4)
P["black2"].bm((0, 40.3, 0), (0, 45.0, 0), 0.12)
P["gold"].add(sphere(0.35, 10, 8), t=(0, 45.2, 0))
P["glowred"].add(sphere(0.28, 10, 8), t=(0, 45.8, 0))

# =====================================================================================================
# dn_podium
# =====================================================================================================
root = pivot("dn_podium", (0, 0, 0))
P = parts(root, "dn_podium", {"mint": 0.03, "mint2": 0.02, "gold": 0.025, "saddle": 0.025, "black": 0.03, "black2": 0.02, "barn": 0.02, "glowgold": 0.0})
P["mint2"].box(-9.0, 9.0, 0.0, 0.25, -2.5, 2.5)                                         # the platform
P["gold"].box(-9.05, 9.05, 0.2, 0.3, 2.4, 2.55)                                         # a gold lip along its front edge
for slot, x, h in (("mint", -6.5, 1.0), ("gold", 0.0, 1.4), ("saddle", 6.5, 0.7)):      # the three steps: 2nd, 1st, 3rd
    P[slot].box(x - 3.0, x + 3.0, 0.25, h, -1.5, 2.0)
    P["black2"].box(x - 3.04, x + 3.04, h - 0.14, h + 0.02, 1.88, 2.04)               # a Black lip along the front of each top
# the backdrop, framed in gold, with a barn red valance
P["black"].box(-8.0, 8.0, 0.25, 6.2, -2.45, -2.25)
P["gold"].box(-8.2, -8.0, 0.25, 6.4, -2.5, -2.2)
P["gold"].box(8.0, 8.2, 0.25, 6.4, -2.5, -2.2)
P["gold"].box(-8.2, 8.2, 6.2, 6.4, -2.5, -2.2)
P["barn"].box(-8.0, 8.0, 5.7, 6.2, -2.25, -2.15)
for i in range(8):
    P["barn"].poly([(-1.0, 0), (1.0, 0), (0, -0.6)], -2.25, -2.15, t=(-7.0 + i * 2.0, 5.7, 0))
P["glowgold"].box(-7.6, 7.6, 6.45, 6.6, -2.5, -2.2)                                      # the light bar on top
for sx in (-1, 1):                                                                      # a lamp post at each end
    P["black2"].bm((sx * 8.6, 0.25, -2.0), (sx * 8.6, 4.2, -2.0), 0.1)
    P["black2"].boxc(sx * 8.6, 4.35, -1.9, 0.7, 0.5, 0.7)
    P["glowgold"].boxc(sx * 8.6, 4.35, -1.5, 0.5, 0.35, 0.1)

finish_and_export()
