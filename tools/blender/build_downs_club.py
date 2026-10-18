# Chimera Downs' clubhouse and tote hall for Blender (4.2+ / 5.x), exported to src/assets/downs-club.glb (docs/downs-layouts.md, layout B: behind the main stand's centre).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_club.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_club.py
#
# Authored in the building's frame: its front (the forecourt side) is z = 0 and faces +z, the building stands back from it to z = -27, x runs along the front (60 m), y up.
#   dn_club      the building: a Mint two-storey hall 60 x 22 m on a plinth, quoins wrapped round its front corners, a string course round all four sides, a colonnade of ten columns
#                under an entablature tied back to the wall at both ends, a Barn Red and Mint striped awning pitched from the wall over six betting windows (each with a BETS sign in raised
#                letters) and the great door, a recess for the race card board (the game hangs its live 13.3 x 7.8 m canvas in it, centre 13.2 m up: BOARD in src/downsPlan.js), lit
#                windows, a Barn Red hip roof on each wing with two dormers rising out of its front slope, and a 50 m clock tower behind the board: four clock faces, a belfry, a Barn Red
#                spire and a gold finial
# Seams: an inked part whose face lies in the plane of a neighbour's face, and meets it, shows its outline through that face along the joint. So what reads as one surface is one
# piece (the awning's canopy and its valance are each one Barn Red slab, the Mint stripes laid on them as flush skins; the string course is one band round the building), what
# meets the body's corners wraps them (the quoins), and every other joint is a real step of a few centimetres or more (a cornice over a deck, a lintel over its jambs, a sill under a
# frame). Fittings on the walls have their backs 2 cm into the wall, none stands off it.
DOWNS_OUT = "downs-club.glb"
DOWNS_COLL = "MoonDownsClub"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

root = pivot("dn_club", (0, 0, 0))
P = parts(root, "dn_club", {"mint": 0.07, "mint2": 0.02, "money2": 0.02, "gold": 0.02, "black": 0.025, "barn": 0.04, "saddle": 0.02, "glasswarm": 0.0, "black2": 0.012})
SKIN = Acc("dn_club_stripes", "mint", root, 0.0)          # the awning's Mint stripes: skins 8 mm thick, half sunk into the Barn Red slabs (flush, so no outline of their own)

ZF = -5.0                      # the body's front face (the portico stands 5 m proud of it)
ZB = -27.0
BH = 18.0                      # the body's height to the cornice
IN = 0.02                      # how far a fitting's back goes into the wall
# ---- plinth and body ----
P["mint2"].box(-30.3, 30.3, 0.0, 0.8, ZB - 0.3, 0.3)                                    # plinth, under the portico too, 0.3 m proud of the body all round
P["mint"].box(-30, 30, 0.8, BH, ZB, ZF)                                                 # the body
for sx in (-1, 1):                                                                      # quoins: blocks wrapped round each front corner, 0.2 m proud of both faces
    xa, xb = (sx * 30 - 1.2, sx * 30.2) if sx > 0 else (sx * 30.2, sx * 30 + 1.2)
    for y0 in (0.8, 3.5, 6.2, 9.2, 11.9, 14.6):                                         # (the string course runs round the corner between the third and fourth)
        P["mint2"].box(xa, xb, y0 - (0.02 if y0 < 1 else 0), y0 + 1.4, ZF - 1.2, ZF + 0.2)    # (the first with its foot 2 cm into the plinth)
# the string course at the first floor: one Money band round all four sides (12 cm proud), a gold cap on it standing 4 cm prouder
P["money2"].box(-30.12, 30.12, 8.0, 8.6, ZB - 0.12, ZF + 0.12)
P["gold"].box(-30.16, 30.16, 8.6, 8.76, ZB - 0.16, ZF + 0.16)
P["gold"].box(-30.4, 30.4, BH - 0.2, BH + 0.5, ZB - 0.4, ZF + 0.9)                      # cornice
P["mint2"].box(-30.2, 30.2, BH + 0.5, BH + 0.9, ZB - 0.3, ZF + 0.6)                     # the roof deck on it, set back from its edges

# ---- the colonnade: ten columns, an entablature (tied back to the wall at each end), a striped awning over the windows ----
for i in range(10):
    x = -27.0 + i * 6.0
    P["mint2"].cylc(x, 0.95, -0.8, 0.62, 0.3, 14)                                       # base
    P["mint"].cylc(x, 0.95 + 3.5, -0.8, 0.46, 7.0, 14, rt=0.4)                          # shaft
    P["gold"].cylc(x, 8.05, -0.8, 0.62, 0.22, 14)                                       # capital
P["mint2"].box(-30.2, 30.2, 8.15, 9.15, -1.6, 0.0)                                      # entablature
P["gold"].box(-30.3, 30.3, 9.15, 9.35, -1.7, 0.1)
for sx in (-1, 1):                                                                      # its returns: a beam from the wall into its back face, 10 cm inside the body's side and 15 cm inside the entablature's top and bottom
    xa, xb = (29.3, 29.9) if sx > 0 else (-29.9, -29.3)
    P["mint2"].box(xa, xb, 8.3, 9.0, ZF - 0.2, -1.4)
# the awning over the windows: one Barn Red canopy slab pitched from the wall (its back end 7 cm in, under the string course) down to a valance behind the colonnade, the canopy's front
# end buried in the valance, and the Mint stripes (every other 5 m) laid on the canopy's top and underside and on the valance's faces as flush skins. A short black brace from the
# valance up into the entablature over every column.
AWN_A, AWN_L = math.atan2(0.75, 3.35), math.hypot(3.35, 0.75)
AWN_C, AWN_W, VAL_W = (7.625, -3.375), 59.6, 59.8                                      # (the canopy's middle (y, z), its width (20 cm short of the body's sides) and the valance's (10 cm longer each end: their ends are not in one plane))
nrm = (math.cos(AWN_A), math.sin(AWN_A))                                                # (the canopy's up, (y, z))
P["barn"].boxc(0, AWN_C[0], AWN_C[1], AWN_W, 0.14, AWN_L, rot=(AWN_A, 0, 0))
P["barn"].box(-VAL_W / 2, VAL_W / 2, 6.85, 7.42, -1.80, -1.66)                          # the valance (the canopy's front end, z -1.72 to -1.68, is in it)
for i in range(1, 12, 2):                                                               # the stripes, each 2 cm short of a slab's end
    x0 = -30.0 + i * 5.0
    x1 = min(x0 + 5.0, AWN_W / 2 - 0.02)
    for s in (1, -1):                                                                   # on the canopy's top (s = 1) and its underside (s = -1)
        SKIN.boxc((x0 + x1) / 2, AWN_C[0] + s * 0.07 * nrm[0], AWN_C[1] + s * 0.07 * nrm[1], x1 - x0, 0.008, AWN_L - 0.02, rot=(AWN_A, 0, 0))
    x1 = min(x0 + 5.0, VAL_W / 2 - 0.02)
    SKIN.box(x0, x1, 6.846, 7.41, -1.804, -1.796)                                      # the valance's face toward the wall,
    SKIN.box(x0, x1, 6.846, 7.41, -1.664, -1.656)                                      # its face toward the forecourt
    SKIN.box(x0, x1, 6.846, 6.854, -1.796, -1.664)                                     # and its underside between them (no skin's face in the plane of the slab's)
for i in range(10):
    x = -27.0 + i * 6.0
    P["black"].bm((x, 7.3, -1.76), (x, 8.6, -1.40), 0.05)

# ---- the ground floor: six betting windows and the great door ----
for sx in (-1, 1):
    for xa in (9.5, 17.0, 24.5):
        x = sx * xa
        P["black"].box(x - 1.7, x + 1.7, 1.55, 3.7, ZF, ZF + 0.04)                      # frame (behind the pane, so it shows as a border)
        P["glasswarm"].box(x - 1.5, x + 1.5, 1.7, 3.5, ZF + 0.035, ZF + 0.045)          # the lit pane, half sunk in the frame (5 mm proud: no outline)
        for gx in (-0.9, -0.3, 0.3, 0.9):                                               # the grille's bars, 4 cm proud of the pane, their backs and ends in the frame
            P["gold"].box(x + gx - 0.03, x + gx + 0.03, 1.6, 3.6, ZF + 0.02, ZF + 0.085)  # (they ended in the pane's edge planes, the pane 4 cm proud with no outline)
        P["saddle"].box(x - 2.0, x + 2.0, 1.34, 1.5, ZF - IN, ZF + 1.0)                 # the counter's shelf
        P["black2"].box(x - 1.95, x + 1.95, 0.78, 1.34, ZF - IN, ZF + 0.9)              # and the counter under it (2 cm into the plinth, as everything standing on it against the wall)
        P["gold"].box(x - 1.2, x + 1.2, 3.9, 4.7, ZF - IN, ZF + 0.1)                    # the sign plate above, with BETS on it in raised Black letters
        P["black"].letters("BETS", x, 4.3, ZF + 0.1, 0.085, 0.03)
# the great door: a dark panel recessed between Mint jambs, a gold lintel over them (wider and prouder: a head, not a joint), a step and a landing
P["black"].box(-3.2, 3.2, 0.78, 6.2, ZF - IN, ZF + 0.04)                                # the opening, dark
P["glasswarm"].box(-2.9, -0.15, 0.9, 5.9, ZF + 0.035, ZF + 0.045)                       # its two lit panes, half sunk in the panel (5 mm proud)
P["glasswarm"].box(0.15, 2.9, 0.9, 5.9, ZF + 0.035, ZF + 0.045)
P["mint2"].box(-3.8, -3.2, 0.78, 6.2, ZF - IN, ZF + 0.3)                                # jambs
P["mint2"].box(3.2, 3.8, 0.78, 6.2, ZF - IN, ZF + 0.3)
P["gold"].box(-4.0, 4.0, 6.2, 6.75, ZF - IN, ZF + 0.38)                                 # its lintel
P["gold"].box(-3.3, 3.3, 0.76, 0.95, ZF + 0.02, ZF + 0.5)                               # the step (its back in the dark panel, over the panes' feet, its ends in the jambs)
P["mint2"].box(-4.2, 4.2, 0.8, 0.9, ZF + 0.4, ZF + 1.4)                                 # and a landing (under the step's front)

# ---- the first floor: lit windows either side of the board ----
for sx in (-1, 1):
    for xa in (13.5, 20.5, 26.8):
        x = sx * xa
        P["black"].box(x - 1.5, x + 1.5, 10.45, 15.75, ZF, ZF + 0.04)
        P["glasswarm"].box(x - 1.3, x + 1.3, 10.6, 15.6, ZF + 0.035, ZF + 0.045)        # the pane, half sunk in the frame (5 mm proud)
        P["black"].box(x - 0.05, x + 0.05, 10.5, 15.7, ZF + 0.02, ZF + 0.085)           # mullion and transom, 4 cm proud of the pane, their backs and ends in the frame
        P["black"].box(x - 1.4, x + 1.4, 13.1, 13.2, ZF + 0.02, ZF + 0.085)
        P["gold"].box(x - 1.7, x + 1.7, 15.75, 16.0, ZF - IN, ZF + 0.14)                # the head
        P["gold"].box(x - 1.7, x + 1.7, 10.2, 10.45, ZF - IN, ZF + 0.22)                # the sill
# the board's recess: a black panel in a gold surround standing on the string course's cap (the game's live canvas hangs 3 cm in front of the panel)
P["gold"].box(-9.6, 9.6, 8.76, 17.6, ZF - IN, ZF + 0.3)
P["black"].box(-9.2, 9.2, 9.2, 17.2, ZF + 0.28, ZF + 0.34)

# ---- the roof: a hip roof over each wing (its eaves 15 cm past the deck's edges), a flat roof between them under the tower ----
RZ0, RZ1 = ZB - 0.55, ZF + 0.75                                                         # the hip roofs' foot, back and front
HIPS = (RZ1 - RZ0) / 2 / (14.6 * 0.7071)                                                # (their stretch in z)
RZC = (RZ0 + RZ1) / 2
for sx in (-1, 1):
    xc = sx * 20.0
    P["barn"].add(hip(7.2, 14.6, 4.2), t=(xc, BH + 0.9 + 2.1, RZC), s=(1, 1, HIPS))    # a hip roof: a four-sided frustum
    P["gold"].boxc(xc, BH + 0.9 + 4.35, RZC, 6.0, 0.3, 0.6)                             # its ridge
    for dx in (-5.0, 5.0):                                                              # a dormer rising out of the front slope: its foot under the slope, its back deep in the roof
        x = xc + dx
        zd = RZ1 - 0.6                                                                  # (its face, where the slope is 0.43 m up)
        P["mint2"].box(x - 1.1, x + 1.1, BH + 1.2, BH + 3.4, RZ1 - 5.25, zd)
        P["black"].box(x - 0.8, x + 0.8, BH + 1.8, BH + 3.0, zd, zd + 0.04)
        P["glasswarm"].box(x - 0.65, x + 0.65, BH + 1.95, BH + 2.85, zd + 0.035, zd + 0.045)
        P["gold"].box(x - 1.3, x + 1.3, BH + 3.4, BH + 3.6, RZ1 - 4.75, zd + 0.15)      # its cap
P["mint2"].box(-10.5, 10.5, BH + 0.85, BH + 1.4, ZB + 0.2, ZF)                           # the roof between the wings, its ends in the hip roofs' slopes

# ---- the clock tower: 12 x 12, from the roof to 36 m, then the belfry, the spire and a finial ----
TZ0, TZ1 = -19.0, -7.0
TZM = (TZ0 + TZ1) / 2
P["mint"].box(-6.0, 6.0, BH + 1.4, 36.4, TZ0, TZ1)                                      # (up into the cornice)
for sx in (-1, 1):
    for z in (TZ0, TZ1):
        P["black"].box(sx * 6.0 - 0.3, sx * 6.0 + 0.3, BH + 1.3, 36.3, z - 0.3, z + 0.3)   # corner pilasters
for y in (25.0, 30.0):
    P["money2"].box(-6.2, 6.2, y, y + 0.55, TZ0 - 0.2, TZ1 + 0.2)
P["gold"].box(-6.5, 6.5, 36.3, 36.9, TZ0 - 0.5, TZ1 + 0.5)                              # cornice
P["mint2"].box(-5.5, 5.5, 36.9, 41.0, TZ0 + 0.5, TZ1 - 0.5)                             # the belfry
for sx in (-1, 1):
    P["glasswarm"].box(min(sx * 5.49, sx * 5.505), max(sx * 5.49, sx * 5.505), 37.4, 40.2, TZM - 1.2, TZM + 1.2)     # lit lancets on the flanks (5 mm proud)
for z in (TZ0 + 0.5, TZ1 - 0.5):
    o = -0.005 if z < TZM else 0.005
    P["glasswarm"].box(-1.2, 1.2, 37.4, 40.2, min(z + o, z - 2 * o), max(z + o, z - 2 * o))
P["gold"].box(-6.0, 6.0, 41.0, 41.5, TZ0, TZ1)
P["barn"].add(cylinder(0.35, 6.2, 5.6, 4), t=(0, 41.5 + 2.8, TZM), rot=(0, PI / 4, 0))   # the spire
P["gold"].bm((0, 47.1, TZM), (0, 49.8, TZM), 0.09)
P["gold"].add(sphere(0.42, 12, 8), t=(0, 50.0, TZM))

# the four clock faces: a gold bezel, a Mint dial, twelve ticks, two hands near ten to two, a hub (a face's +z points out of its wall)
for yaw, cx, cz in ((0, 0.0, TZ1), (PI, 0.0, TZ0), (PI / 2, 6.0, TZM), (-PI / 2, -6.0, TZM)):
    def mv(geo, lx, ly, lz, rot=(0, 0, 0), cx=cx, cz=cz, yaw=yaw):
        g = xf(geo[:2], (lx, ly, lz), rot)
        return xf(g, (cx, 31.8, cz), (0, yaw, 0))
    P["gold"].geos.append(mv(cylinder(3.65, 3.65, 0.42, 32), 0, 0, 0.19, (PI / 2, 0, 0)))  # (its back 2 cm into the wall)
    P["mint"].geos.append(mv(cylinder(3.3, 3.3, 0.1, 32), 0, 0, 0.45, (PI / 2, 0, 0)))
    for h in range(12):
        a = h * PI / 6
        P["black"].geos.append(mv(cuboid(0.14, 0.7 if h % 3 == 0 else 0.4, 0.06), 2.65 * math.sin(a), 2.65 * math.cos(a), 0.53, (0, 0, -a)))
    P["black"].geos.append(mv(cuboid(0.2, 2.2, 0.08), -0.5, 0.9, 0.6, (0, 0, 0.45)))     # the hour hand
    P["black"].geos.append(mv(cuboid(0.14, 3.0, 0.08), 1.0, 1.0, 0.68, (0, 0, -0.62)))    # the minute hand
    P["gold"].geos.append(mv(cylinder(0.25, 0.25, 0.14, 12), 0, 0, 0.76, (PI / 2, 0, 0)))

finish_and_export()
