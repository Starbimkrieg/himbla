# Chimera Downs' grandstand kit for Blender (4.2+ / 5.x), exported to src/assets/downs-stand.glb: the pieces both stands are built from (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stand.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stand.py
#
# Every piece is authored in the STAND's frame: spectators face -z (toward the track), the stand's front edge is z = 0 and its back is +z; x runs along the stand; each piece
# stands on y = 0 (the game lifts it where it belongs). One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js; the glow slots are lit).
#   dn_seat3        3 seats on one frame, 2.7 m wide, 0.7 deep, 0.9 tall: one cushion, three raked backs, armrests between (the `seat` slot takes the section's colour)
#   dn_roof_bay     19 m of the main stand's roof: the raked cantilever deck (barn, Mint ribs), the soffit, a trussed girder at each edge, two columns, the fascia with its gold lip
#                   and three pennants, three lit lamps underneath. Deck from z = -4.5 to 39.5, the front tip 22.9 m up, the back 26 m
#   dn_roof_bay_s   the same for the far stand: from z = -3.5 to 23.5, the front tip 15.3 m up, the back 17 m
#   dn_tower        the main stand's end tower, 8 x 9 x 26 m (a hip roof and finial above), standing in the stand's front corner
#   dn_tower_s      the far stand's, 7 x 8 x 14 m
#   dn_suite        19 m of the suites row over the top tier: 3.4 m tall, 3.2 deep, three lit windows, a gold sill, an awning
#   dn_back         19 m of the main stand's back wall, seen from +z (its rear face is z = 0, 0.8 m thick toward -z), 22.4 m tall
#   dn_back_s       the far stand's, 14.6 m tall
#   dn_back_gate, dn_back_s_gate   the same with a 6 x 4.2 m opening through the middle, for the bay of each way in (the tunnel through the stand starts there)
#   dn_entry        the frame of a way in, round the opening of a _gate wall bay, seen from +z: two jambs, a gold lintel, a barn red canopy and two lamps
DOWNS_OUT = "downs-stand.glb"
DOWNS_COLL = "MoonDownsStand"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# =====================================================================================================
# dn_seat3
# =====================================================================================================
root = pivot("dn_seat3", (0, 0, 0))
P = parts(root, "dn_seat3", {"seat": 0.0, "black": 0.0})                                # (no outlines: about 1,650 of these stand in the two stands)
P["seat"].boxc(0.0, 0.15, 0.0, 2.7, 0.3, 0.66)                                          # one long cushion
for i in range(3):
    P["seat"].boxc(-0.9 + 0.9 * i, 0.6, 0.3, 0.74, 0.6, 0.12, rot=(0.12, 0, 0))         # a raked back for each seat
for x in (-0.45, 0.45):
    P["black"].boxc(x, 0.43, 0.0, 0.07, 0.26, 0.56)                                     # armrests between the seats


# =====================================================================================================
# the roof bays
# =====================================================================================================
def roof_bay(name, TIP, BACK, ZF, ZB):
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"barn": 0.03, "mint": 0.025, "mint2": 0.0, "gold": 0.015, "black": 0.03, "glowgold": 0.0})
    slope = (BACK - TIP) / (ZB - ZF)
    yr = lambda z: TIP + (z - ZF) * slope
    ang = -math.atan2(BACK - TIP, ZB - ZF)                                                 # (negative: the back end rises)
    zc = (ZF + ZB) / 2
    dl = math.hypot(ZB - ZF, BACK - TIP)
    P["barn"].boxc(0, (TIP + BACK) / 2 - 0.225, zc, 19.0, 0.45, dl, rot=(ang, 0, 0))        # the deck
    P["mint2"].boxc(0, (TIP + BACK) / 2 - 0.275, zc, 18.8, 0.1, dl - 0.2, rot=(ang, 0, 0))   # its soffit, a hair proud below
    for i in range(9):                                                                      # the ribs: mint standing seams along the fall
        P["mint"].boxc(-8.55 + i * 2.1375, (TIP + BACK) / 2 + 0.03, zc, 0.16, 0.14, dl - 0.4, rot=(ang, 0, 0))
    P["gold"].boxc(0, BACK + 0.12, ZB - 0.25, 18.96, 0.34, 0.6)                             # the ridge cap
    P["mint"].boxc(0, TIP - 0.8, ZF + 0.1, 18.96, 1.6, 0.32)                                # the fascia
    P["gold"].boxc(0, TIP - 1.66, ZF + 0.1, 18.98, 0.16, 0.5)                               # its gold lip
    P["gold"].boxc(0, TIP + 0.1, ZF + 0.1, 18.96, 0.18, 0.46)                               # and the top edge
    for i, x in enumerate((-6.3, 0.0, 6.3)):                                                # pennants hanging from the lip
        (P["barn"] if i % 2 == 0 else P["gold"]).poly([(-0.55, 0), (0.55, 0), (0, -1.5)], ZF + 0.06, ZF + 0.14, t=(x, TIP - 1.74, 0))
    zt = ZB - 0.9
    for sx in (-1, 1):                                                                      # a trussed girder at each edge
        x = sx * 9.3
        yb0, yb1 = yr(ZF + 1.0) - 1.3, yr(zt) - 3.9
        P["black"].bm((x, yr(ZF + 0.6) - 0.5, ZF + 0.6), (x, yr(zt) - 0.5, zt), 0.13)       # the top chord
        P["black"].bm((x, yb0, ZF + 1.0), (x, yb1, zt), 0.13)                               # the bottom chord
        n = 9
        low = lambda z: yb0 + (yb1 - yb0) * (z - ZF - 1.0) / (zt - ZF - 1.0)
        for i in range(n + 1):
            z = ZF + 0.8 + (zt - ZF - 0.8) * i / n
            P["black"].bm((x, yr(z) - 0.5, z), (x, low(z), z), 0.07)                        # a vertical
            if i < n:
                z2 = ZF + 0.8 + (zt - ZF - 0.8) * (i + 1) / n
                P["black"].bm((x, yr(z) - 0.5, z), (x, low(z2), z2), 0.06)                  # a diagonal
    colz = ZB - 1.3                                                                         # one column under the middle of each bay (a bay's edges meet its neighbours' on the back wall's
    top = yr(colz) - 3.9                                                                    # pilasters; a column at each edge stood in front of the entries), carrying a beam across both girders
    P["black"].box(-0.45, 0.45, 0.1, top, colz - 0.45, colz + 0.45)                         # the column
    P["black"].box(-9.45, 9.45, top - 0.15, top + 0.25, colz - 0.35, colz + 0.35)           # the beam the girders end on
    P["gold"].boxc(0, 0.22, colz, 1.3, 0.44, 1.3)                                           # its footing
    for z in (ZB * 0.22, ZB * 0.55, ZB * 0.85):                                             # lamps under the soffit, lit
        y = yr(z) - 0.62
        P["glowgold"].boxc(0, y, z, 0.7, 0.1, 2.0, rot=(ang, 0, 0))
        P["black"].boxc(0, y + 0.1, z, 0.9, 0.12, 2.3, rot=(ang, 0, 0))


roof_bay("dn_roof_bay", 22.9, 26.0, -4.5, 39.5)
roof_bay("dn_roof_bay_s", 15.3, 17.0, -3.5, 23.5)


# =====================================================================================================
# the end towers
# =====================================================================================================
def tower(name, W, D, H, bands, slit, banner):
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"mint": 0.045, "mint2": 0.02, "black": 0.025, "gold": 0.02, "money2": 0.0, "barn": 0.03, "glasswarm": 0.0})
    zc = D / 2
    P["mint2"].boxc(0, 0.6, zc, W + 0.7, 1.2, D + 0.7)                                      # the plinth
    P["mint"].boxc(0, 1.2 + (H - 1.2) / 2, zc, W, H - 1.2, D)                               # the shaft
    for sx in (-1, 1):
        for z in (0.0, D):
            P["black"].boxc(sx * (W / 2), (1.25 + H + 0.1) / 2, z, 0.7, H + 0.1 - 1.25, 0.7)   # corner pilasters
    for y in bands:
        P["money2"].boxc(0, y, zc, W + 0.2, 0.55, D + 0.2)
    for x in (-W * 0.3, 0.0, W * 0.3):                                                      # lit slits on the track face
        for y, h in slit:
            P["black"].boxc(x, y, -0.02, 1.2, h + 0.4, 0.04)                                # (the frame sits behind the pane, so it shows as a border)
            P["glasswarm"].boxc(x, y, -0.055, 0.9, h, 0.03)
    wlo, whi = bands[0] + 0.275 + 0.45, bands[1] - 0.275 - 0.45                              # (the flank windows fit between the first two bands: they used to run through them)
    wc, wh = (wlo + whi) / 2, whi - wlo
    for sx in (-1, 1):                                                                      # and on both flanks
        for z in (D * 0.3, D * 0.7):
            P["black"].boxc(sx * (W / 2 + 0.02), wc, z, 0.04, wh + 0.4, 1.2)
            P["glasswarm"].boxc(sx * (W / 2 + 0.055), wc, z, 0.03, wh, 0.9)
    P["black"].boxc(0, 2.6, -0.04, 2.6, 3.4, 0.1)                                           # a door at the foot
    P["gold"].boxc(0, 4.5, -0.1, 3.0, 0.3, 0.3)
    by, bh = banner
    for sx in (-1, 1):                                                                      # banners down the track face
        P["barn"].box(sx * W * 0.3 - 0.85, sx * W * 0.3 + 0.85, by, by + bh, -0.2, -0.12)
        P["gold"].box(sx * W * 0.3 - 0.85, sx * W * 0.3 + 0.85, by - 0.2, by, -0.2, -0.12)
        P["gold"].poly([(-0.85, 0), (0.85, 0), (0, -0.9)], -0.2, -0.12, t=(sx * W * 0.3, by - 0.2, 0))
    P["gold"].boxc(0, H + 0.25, zc, W + 1.0, 0.5, D + 1.0)                                  # cornice
    P["barn"].cylc(0, H + 0.5 + 1.7, zc, 0.77 * W, 3.4, 4, rt=0.4, rot=(0, PI / 4, 0))      # the hip roof (a four-sided cone)
    P["mint"].cylc(0, H + 0.5 + 3.5, zc, 0.4, 0.5, 8)
    P["gold"].bm((0, H + 4.0, zc), (0, H + 6.6, zc), 0.07)                                  # the finial
    P["gold"].add(sphere(0.32, 12, 8), t=(0, H + 6.8, zc))


tower("dn_tower", 8.0, 9.0, 26.0, (7.5, 15.0, 22.5), ((11.0, 5.6), (19.0, 3.2)), (7.2, 7.8))
tower("dn_tower_s", 7.0, 8.0, 14.0, (6.5, 12.0), ((9.0, 3.6),), (5.0, 4.8))


# =====================================================================================================
# dn_suite
# =====================================================================================================
root = pivot("dn_suite", (0, 0, 0))
P = parts(root, "dn_suite", {"mint2": 0.04, "black": 0.015, "gold": 0.012, "money2": 0.02, "barn": 0.02, "glasswarm": 0.0})
P["mint2"].box(-9.5, 9.5, 0.0, 3.4, 0.0, 3.2)
P["money2"].box(-9.6, 9.6, 3.4, 3.72, -0.1, 3.3)                                        # cap
P["gold"].box(-9.6, 9.6, 0.86, 1.0, -0.22, 0.0)                                         # sill
for x in (-6.0, 0.0, 6.0):
    P["black"].box(x - 2.45, x + 2.45, 1.0, 2.85, -0.04, 0.0)                          # the frame (behind the pane, so it shows as a border)
    P["glasswarm"].box(x - 2.3, x + 2.3, 1.0, 2.7, -0.07, -0.04)
    P["black"].box(x - 0.06, x + 0.06, 1.0, 2.7, -0.1, -0.07)                           # a mullion
    P["gold"].box(x - 2.5, x + 2.5, 2.85, 3.0, -0.12, -0.05)                            # lintel
P["barn"].boxc(0, 3.1, -0.55, 18.96, 0.1, 1.5, rot=(0.3, 0, 0))                         # an awning over the glass, pitched down toward the track
P["gold"].boxc(0, 2.72, -1.18, 18.96, 0.08, 0.12)


# =====================================================================================================
# the back walls
# =====================================================================================================
def back_wall(name, WH, door=False):
    """door: a bay with a way in: a 6 m wide, 4.2 m high opening through the middle (the tunnel through the stand starts there), a lintel of the wall above it"""
    DW, DH = 3.0, 4.2
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"mint": 0.05, "mint2": 0.0, "money2": 0.0, "gold": 0.012, "black": 0.012, "glasswarm": 0.0, "glowgold": 0.0})
    cuts = [(-9.5, -DW), (DW, 9.5)] if door else [(-9.5, 9.5)]
    for a, b in cuts:
        P["mint"].box(a, b, 0.0, WH, -0.8, 0.0)
    if door:
        P["mint"].box(-DW, DW, DH, WH, -0.8, 0.0)                                           # the lintel course
    for a, b in ((-9.49, -DW - 0.03), (DW + 0.03, 9.49)) if door else ((-9.49, 9.49),):
        P["money2"].box(a, b, -0.02, 2.6, -0.02, 0.14)                                      # the wainscot
        P["money2"].box(a, b, 2.6, 2.95, -0.02, 0.2)
    P["money2"].box(-9.49, 9.49, WH - 3.2, WH - 2.8, -0.02, 0.2)
    for sx in (-1, 1):
        P["mint2"].box(sx * 9.48 - (0.3 if sx > 0 else 0), sx * 9.48 + (0 if sx > 0 else 0.3), -0.04, WH, 0.0, 0.28)    # half a pilaster at each edge (two bays make one)
    wy = WH - 6.6
    for x in (-6.0, 0.0, 6.0):                                                              # the members' bar's windows
        P["black"].box(x - 1.75, x + 1.75, wy - 0.15, wy + 1.95, 0.0, 0.04)
        P["glasswarm"].box(x - 1.6, x + 1.6, wy, wy + 1.8, 0.04, 0.08)
        P["black"].box(x - 0.05, x + 0.05, wy, wy + 1.8, 0.08, 0.12)
        P["gold"].box(x - 1.85, x + 1.85, wy + 1.95, wy + 2.12, 0.04, 0.2)
    P["gold"].box(-9.46, 9.46, WH - 0.1, WH + 0.5, -0.9, 0.55)                              # cornice
    P["mint2"].box(-9.42, 9.42, WH + 0.5, WH + 0.85, -0.9, 0.35)
    for x in (-6.4, 6.4):                                                                   # lanterns (clear of the entry's 6 m)
        P["black"].box(x - 0.08, x + 0.08, 4.35, 4.45, 0.0, 0.4)
        P["black"].box(x - 0.2, x + 0.2, 3.85, 4.3, 0.28, 0.6)
        P["glowgold"].box(x - 0.14, x + 0.14, 3.92, 4.22, 0.3, 0.58)


back_wall("dn_back", 22.4)
back_wall("dn_back_s", 14.6)
back_wall("dn_back_gate", 22.4, door=True)
back_wall("dn_back_s_gate", 14.6, door=True)

# =====================================================================================================
# dn_entry
# =====================================================================================================
root = pivot("dn_entry", (0, 0, 0))
P = parts(root, "dn_entry", {"black": 0.02, "gold": 0.015, "barn": 0.03, "mint2": 0.0, "glowgold": 0.0, "black2": 0.012})
P["mint2"].box(-3.5, -3.0, 0.0, 5.0, -0.12, 0.3)                                        # jambs framing the opening
P["mint2"].box(3.0, 3.5, 0.0, 5.0, -0.12, 0.3)
P["gold"].box(-3.7, 3.7, 4.2, 4.65, -0.1, 0.4)                                          # the lintel
P["barn"].boxc(0, 5.2, 0.9, 7.4, 0.14, 2.4, rot=(0.22, 0, 0))                           # a canopy pitched away from the wall
P["gold"].boxc(0, 4.82, 2.0, 7.4, 0.1, 0.12)
for x in (-2.0, 2.0):
    P["black"].bm((x, 4.65, 0.2), (x, 5.0, 1.4), 0.04)
    P["black2"].boxc(x, 4.05, 0.5, 0.3, 0.5, 0.3)
    P["glowgold"].boxc(x, 4.05, 0.5, 0.22, 0.4, 0.22)

finish_and_export()
