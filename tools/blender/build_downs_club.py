# Chimera Downs' clubhouse and tote hall for Blender (4.2+ / 5.x), exported to src/assets/downs-club.glb (docs/downs-layouts.md, layout B: behind the main stand's centre).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_club.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_club.py
#
# Authored in the building's frame: its front (the forecourt side) is z = 0 and faces +z, the building stands back from it to z = -27, x runs along the front (60 m), y up.
#   dn_club      the building: a Mint two-storey hall 60 x 18 m on a plinth, a colonnade of ten columns, a Barn Red and Mint striped awning pitched from the entablature over six betting windows (each with a BETS sign in raised letters) and the
#                great door, a recess for the race card board (the game hangs its live 17 x 8.6 m canvas in it, centre 13.2 m up), lit windows, a Barn Red hip roof on each wing and
#                a 50 m clock tower behind the board: four clock faces, a belfry, a Barn Red spire and a gold finial
DOWNS_OUT = "downs-club.glb"
DOWNS_COLL = "MoonDownsClub"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

root = pivot("dn_club", (0, 0, 0))
P = parts(root, "dn_club", {"mint": 0.07, "mint2": 0.02, "money2": 0.0, "gold": 0.02, "black": 0.025, "barn": 0.04, "saddle": 0.02, "glasswarm": 0.0, "black2": 0.012})

ZF = -5.0                      # the body's front face (the portico stands 5 m proud of it)
ZB = -27.0
BH = 18.0                      # the body's height to the cornice
# ---- plinth and body ----
P["mint2"].box(-30.3, 30.3, 0.0, 0.8, ZB, 0.3)                                          # plinth, under the portico too
P["mint"].box(-30, 30, 0.8, BH, ZB, ZF)                                                 # the body
for sx in (-1, 1):                                                                      # quoins up each corner
    xa, xb = (sx * 30 - 1.2, sx * 30) if sx > 0 else (sx * 30, sx * 30 + 1.2)
    for y0 in (0.8, 4.5, 8.2, 11.9, 15.6):
        P["mint2"].box(xa, xb, y0, y0 + 1.4, ZF + 0.16, ZF)
P["money2"].box(-30.1, 30.1, 8.0, 8.6, ZB + 0.5, ZF + 0.12)                                   # the string course at the first floor
P["gold"].box(-30.1, 30.1, 8.6, 8.76, ZB + 0.5, ZF + 0.14)
P["gold"].box(-30.4, 30.4, BH - 0.2, BH + 0.5, ZB - 0.4, ZF + 0.9)                      # cornice
P["mint2"].box(-30.2, 30.2, BH + 0.5, BH + 0.9, ZB - 0.3, ZF + 0.6)

# ---- the colonnade: ten columns, an entablature, a striped awning board over the windows ----
for i in range(10):
    x = -27.0 + i * 6.0
    P["mint2"].cylc(x, 0.95, -0.8, 0.62, 0.3, 14)                                       # base
    P["mint"].cylc(x, 0.95 + 3.5, -0.8, 0.46, 7.0, 14, rt=0.4)                          # shaft
    P["gold"].cylc(x, 8.05, -0.8, 0.62, 0.22, 14)                                       # capital
P["mint2"].box(-30.2, 30.2, 8.15, 9.15, -1.6, 0.0)                                      # entablature
P["gold"].box(-30.3, 30.3, 9.15, 9.35, -1.7, 0.1)
# the awning over the windows: a striped canopy pitched from the wall (under the string course) down to the colonnade (it was a flat board a hand's width off the wall and 0.65 m under the
# entablature, floating), a valance on its front edge and a short black brace from that edge up to the entablature over every column
AWN_A, AWN_L = math.atan2(0.75, 3.35), math.hypot(3.35, 0.75)
for i in range(12):
    x0 = -30.0 + i * 5.0
    col = P["barn"] if i % 2 == 0 else P["mint"]
    col.boxc(x0 + 2.5, 7.625, -3.375, 4.98, 0.14, AWN_L, rot=(AWN_A, 0, 0))
    col.box(x0 + 0.01, x0 + 4.99, 6.8, 7.3, -1.76, -1.7)                                # the valance
for i in range(10):
    x = -27.0 + i * 6.0
    P["black"].bm((x, 7.2, -1.74), (x, 8.2, -1.62), 0.05)

# ---- the ground floor: six betting windows and the great door ----
for sx in (-1, 1):
    for xa in (9.5, 17.0, 24.5):
        x = sx * xa
        P["black"].box(x - 1.7, x + 1.7, 1.55, 3.7, ZF, ZF + 0.04)                      # frame (behind the pane, so it shows as a border)
        P["glasswarm"].box(x - 1.5, x + 1.5, 1.7, 3.5, ZF + 0.04, ZF + 0.08)             # the lit pane
        for gx in (-0.9, -0.3, 0.3, 0.9):
            P["gold"].box(x + gx - 0.03, x + gx + 0.03, 1.7, 3.5, ZF + 0.08, ZF + 0.13)  # the grille's bars
        P["saddle"].box(x - 2.0, x + 2.0, 1.34, 1.5, ZF + 1.0, ZF + 0.03)               # the counter's shelf
        P["black2"].box(x - 1.95, x + 1.95, 0.8, 1.34, ZF + 0.9, ZF + 0.1)              # and its front
        P["gold"].box(x - 1.2, x + 1.2, 3.9, 4.7, ZF + 0.1, ZF + 0.03)                  # the sign plate above, with BETS on it in raised Black letters
        P["black"].letters("BETS", x, 4.3, ZF + 0.1, 0.085, 0.03)
P["black"].box(-3.2, 3.2, 0.8, 6.2, ZF + 0.06, ZF + 0.02)                               # the great door's opening, dark
P["glasswarm"].box(-2.9, -0.15, 0.9, 5.9, ZF + 0.1, ZF + 0.06)
P["glasswarm"].box(0.15, 2.9, 0.9, 5.9, ZF + 0.1, ZF + 0.06)
P["gold"].box(-3.5, 3.5, 6.2, 6.75, ZF + 0.3, ZF + 0.02)                                # its lintel
P["mint2"].box(-3.8, -3.2, 0.8, 6.2, ZF + 0.3, ZF + 0.02)                               # jambs
P["mint2"].box(3.2, 3.8, 0.8, 6.2, ZF + 0.3, ZF + 0.02)
P["gold"].box(-3.2, 3.2, 0.8, 0.95, ZF + 0.5, ZF + 0.07)                                # the step
P["mint2"].box(-4.2, 4.2, 0.8, 0.9, ZF + 1.4, ZF + 0.52)                                # and a landing

# ---- the first floor: lit windows either side of the board ----
for sx in (-1, 1):
    for xa in (13.5, 20.5, 26.8):
        x = sx * xa
        P["black"].box(x - 1.5, x + 1.5, 10.45, 15.75, ZF, ZF + 0.04)
        P["glasswarm"].box(x - 1.3, x + 1.3, 10.6, 15.6, ZF + 0.04, ZF + 0.08)
        P["black"].box(x - 0.05, x + 0.05, 10.6, 15.6, ZF + 0.08, ZF + 0.12)
        P["black"].box(x - 1.3, x + 1.3, 13.1, 13.2, ZF + 0.08, ZF + 0.12)
        P["gold"].box(x - 1.7, x + 1.7, 15.75, 16.0, ZF + 0.14, ZF + 0.03)
        P["gold"].box(x - 1.7, x + 1.7, 10.2, 10.45, ZF + 0.22, ZF + 0.03)
# the board's recess: a black panel with a gold surround (the game's live canvas hangs in front of the panel)
P["gold"].box(-9.6, 9.6, 8.8, 17.6, ZF + 0.3, ZF)
P["black"].box(-9.2, 9.2, 9.2, 17.2, ZF + 0.34, ZF + 0.28)

# ---- the roof: a hip roof over each wing, a flat roof between them under the tower ----
for sx in (-1, 1):
    xc = sx * 20.0
    zc = (ZB + ZF) / 2
    P["barn"].add(hip(7.2, 14.6, 4.2), t=(xc, BH + 0.9 + 2.1, zc), s=(1, 1, 1.12))    # a hip roof: a four-sided frustum
    P["gold"].boxc(xc, BH + 0.9 + 4.35, zc, 6.0, 0.3, 0.6)                              # its ridge
    for dx in (-5.0, 5.0):                                                              # a dormer on the front slope
        P["mint2"].boxc(xc + dx, BH + 3.0, ZF + 0.6, 2.2, 2.0, 1.4)
        P["glasswarm"].boxc(xc + dx, BH + 3.0, ZF + 1.33, 1.4, 1.2, 0.06)
        P["gold"].boxc(xc + dx, BH + 4.2, ZF + 0.6, 2.6, 0.2, 1.8)
P["mint2"].box(-10.0, 10.0, BH + 0.92, BH + 1.4, ZB, ZF)                                 # the roof between the wings

# ---- the clock tower: 12 x 12, from the roof to 36 m, then the belfry, the spire and a finial ----
TZ0, TZ1 = -19.0, -7.0
TZM = (TZ0 + TZ1) / 2
P["mint"].box(-6.0, 6.0, BH + 1.4, 36.0, TZ0, TZ1)
for sx in (-1, 1):
    for z in (TZ0, TZ1):
        P["black"].box(sx * 6.0 - 0.3, sx * 6.0 + 0.3, BH + 1.3, 36.3, z - 0.3, z + 0.3)   # corner pilasters
for y in (25.0, 30.0):
    P["money2"].box(-6.2, 6.2, y, y + 0.55, TZ0 - 0.2, TZ1 + 0.2)
P["gold"].box(-6.5, 6.5, 36.3, 36.9, TZ0 - 0.5, TZ1 + 0.5)                              # cornice
P["mint2"].box(-5.5, 5.5, 36.9, 41.0, TZ0 + 0.5, TZ1 - 0.5)                             # the belfry
for sx in (-1, 1):
    P["glasswarm"].box(min(sx * 5.54, sx * 5.5), max(sx * 5.54, sx * 5.5), 37.4, 40.2, TZM - 1.2, TZM + 1.2)     # lit lancets on the flanks
for z in (TZ0 + 0.46, TZ1 - 0.46):
    P["glasswarm"].box(-1.2, 1.2, 37.4, 40.2, min(z, z + (0.04 if z < TZM else -0.04)), max(z, z + (0.04 if z < TZM else -0.04)))
P["gold"].box(-6.0, 6.0, 41.0, 41.5, TZ0, TZ1)
P["barn"].add(cylinder(0.35, 6.2, 5.6, 4), t=(0, 41.5 + 2.8, TZM), rot=(0, PI / 4, 0))   # the spire
P["gold"].bm((0, 47.1, TZM), (0, 49.8, TZM), 0.09)
P["gold"].add(sphere(0.42, 12, 8), t=(0, 50.0, TZM))

# the four clock faces: a gold bezel, a Mint dial, twelve ticks, two hands near ten to two, a hub (a face's +z points out of its wall)
for yaw, cx, cz in ((0, 0.0, TZ1), (PI, 0.0, TZ0), (PI / 2, 6.0, TZM), (-PI / 2, -6.0, TZM)):
    def mv(geo, lx, ly, lz, rot=(0, 0, 0), cx=cx, cz=cz, yaw=yaw):
        g = xf(geo[:2], (lx, ly, lz), rot)
        return xf(g, (cx, 31.8, cz), (0, yaw, 0))
    P["gold"].geos.append(mv(cylinder(3.65, 3.65, 0.4, 32), 0, 0, 0.2, (PI / 2, 0, 0)))
    P["mint"].geos.append(mv(cylinder(3.3, 3.3, 0.1, 32), 0, 0, 0.45, (PI / 2, 0, 0)))
    for h in range(12):
        a = h * PI / 6
        P["black"].geos.append(mv(cuboid(0.14, 0.7 if h % 3 == 0 else 0.4, 0.06), 2.65 * math.sin(a), 2.65 * math.cos(a), 0.53, (0, 0, -a)))
    P["black"].geos.append(mv(cuboid(0.2, 2.2, 0.08), -0.5, 0.9, 0.6, (0, 0, 0.45)))     # the hour hand
    P["black"].geos.append(mv(cuboid(0.14, 3.0, 0.08), 1.0, 1.0, 0.68, (0, 0, -0.62)))    # the minute hand
    P["gold"].geos.append(mv(cylinder(0.25, 0.25, 0.14, 12), 0, 0, 0.76, (PI / 2, 0, 0)))

finish_and_export()
