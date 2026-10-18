# Chimera Downs' grandstand kit for Blender (4.2+ / 5.x), exported to src/assets/downs-stand.glb: the pieces both stands are built from (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stand.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stand.py
#
# Every piece is authored in the STAND's frame: spectators face -z (toward the track), the stand's front edge is z = 0 and its back is +z; x runs along the stand; each piece
# stands on y = 0 (the game lifts it where it belongs). One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js; the glow slots are lit).
# The parts that run the stand's whole length are ONE piece each, so no seam shows where one 19 m bay would have met the next (an outlined piece's black shell pokes out of
# a flush neighbour's face along the joint); the game bakes each of them once, at the stand's origin (downsWorld.js grandstand(), which knows the same numbers: MAIN / FAR below).
#   dn_seat3        3 seats on one frame, 2.7 m wide, 0.7 deep, 0.9 tall: one cushion, three raked backs, armrests between (the `seat` slot takes the section's colour)
#   dn_roof         the main stand's roof, end wall to end wall (x +-115.05, over the end sections and through the corner towers): the raked deck (barn) with Mint standing seams,
#                   the soffit, a barge board down each end, the fascia with its gold lip and top edge and pennants, the gold ridge cap, a trussed girder over each column and one at
#                   each end, lit lamps under the soffit, the beam the girders end on (it lies on the back wall's cap) and the columns behind the back wall with their footings.
#                   Deck from z = -4.5 to 39.5, the front tip 22.9 m up, the back 26 m
#   dn_roof_s       the far stand's: x +-96.05, z = -3.5 to 23.5, the front tip 15.3 m up, the back 17.8 m
#   dn_roof_bay, dn_roof_bay_s   19 m of each, a girder and a column in the middle (the Asset Row's sample of the roof; the game bakes the whole roofs)
#   dn_tower        the main stand's end tower, 8 x 9 x 26 m (a hip roof and finial above), standing in the stand's front corner, its shaft's front face 0.51 m behind the stand's front
#                   (so the front parapet runs past it); the roof's deck runs through it between the second and third bands
#   dn_tower_s      the far stand's, 7 x 8 x 18 m
#   dn_suites       the suites row over the main stand's top tier, end wall to end wall (x +-114.1): 3.4 m tall, 3.2 deep, three lit windows a bay, a gold sill, an awning
#   dn_suite        19 m of it (the Asset Row's)
#   dn_backwall     the main stand's back wall, seen from +z (its rear face is z = 0, 0.8 m thick toward -z), 22.4 m tall, x +-114.4 (into the end walls), with the opening of each
#                   way in (5.8 x 3.9 m, at x = +-47.5), the members' bar's windows, lanterns, a wainscot, a band, the gold cornice and its cap, and a quoin at each rear corner
#   dn_backwall_s   the far stand's, 14.6 m tall, x +-95.4
#   dn_back, dn_back_s, dn_back_gate, dn_back_s_gate   19 m of each, with and without an opening (the Asset Row's)
#   dn_entry        the frame of a way in, round the back wall's opening, seen from +z: two jambs, a gold lintel, a barn red canopy and two lamps
DOWNS_OUT = "downs-stand.glb"
DOWNS_COLL = "MoonDownsStand"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# The stands' numbers, in the stand's frame (src/downsPlan.js STAND / FAR and downsWorld.js grandstand(): keep them in step).
#   hw      half the stand's length: the end walls' inner faces (the end walls are 0.8 m thick outside them)
#   back    the back wall's rear face (main: 13 tiers of 2.6 m, the top tier 3.2 deep, then the 0.8 m wall; far: 8 of 2.4 m, then the wall); wh its height
#   tip, rback, zf, zb   the roof deck's top line: tip m up at z = zf (its front edge), rback m up at z = zb (its back edge)
#   cols    the columns behind the back wall, one on each 19 m bay's edge (never behind a way in: those are at the bays' middles); ends: the end girders' x (over the end
#           walls, 40 cm clear of the towers' pilasters, so the roof's end bay behind the towers has its girder too)
#   tower   the corner tower's middle and its shaft's width: the faces of its flanks, where the deck runs through it (the standing seams keep clear of them)
#   quoin   the rear corners' quoins: from x0 to x1, from z0 (into the wall) to z1 behind the rear face (main: 28 cm, wrapping 15 cm round onto the end wall's outer face; far:
#           the arcade's return carries the end wall on behind the stand there (downsWorld.js joiner), and the quoin stands 18 cm proud of the return's inner face and ends 5 cm
#           inside the pilaster the arcade puts on that joint, so under the arcade's roof none of it shows in the bay)
MAIN = dict(hw=114.0, back=37.8, wh=22.4, tip=22.9, rback=26.0, zf=-4.5, zb=39.5, cols=[-95.0 + 19 * i for i in range(11)], ends=114.4, towerx=109.65, towerw=8.0,
            quoin=(113.8, 114.95, -0.3, 0.28), bays=[-104.5 + 19 * i for i in range(12)])
FAR = dict(hw=95.0, back=20.0, wh=14.6, tip=15.3, rback=17.8, zf=-3.5, zb=23.5, cols=[-76.0 + 19 * i for i in range(9)], ends=95.4, towerx=91.15, towerw=7.0,
           quoin=(94.8, 95.85, -0.25, 0.25), bays=[-85.5 + 19 * i for i in range(10)])
ENTRIES = (-47.5, 47.5)
OPEN_W, OPEN_H = 2.9, 3.9                                                                   # half the back wall's opening, and its height (the tunnel inside is 6 x 4 m)
for S in (MAIN, FAR):
    S["E"] = S["hw"] + 0.8 + 0.25                                                           # the roof's ends: 25 cm past the end walls' outer faces
    S["Xc"] = S["quoin"][1] + 0.15                                                          # the back wall's cornice's ends: 15 cm past the quoins
    S["cap"] = S["wh"] + 0.85                                                               # the top of the cornice's cap, where the roof's beam lies
    tx, tw = S["towerx"], S["towerw"] / 2
    S["avoid"] = [(s * (tx - tw), -s) for s in (-1, 1)] + [(s * (tx + tw), s) for s in (-1, 1)]      # (a flank face's x, and the way out of the tower from it)

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
# the roofs
# =====================================================================================================
def roof(name, S, E, girders, cols, lamps, Eb, avoid=()):
    """One roof from x = -E to E. Every piece that runs along the stand is one box, so the fascia, its lip and top edge, the deck, the soffit, the ridge cap and the beam
    show no joint anywhere along it; the pieces that meet are let into each other (the deck's front end into the fascia, the soffit's ends into the barge boards, the ribs'
    ends into the top edge and the ridge cap, the girders' ends into the beam) or stand a deliberate 5 cm or more proud of each other where they end side by side."""
    TIP, BACK, ZF, ZB, back, cap = S["tip"], S["rback"], S["zf"], S["zb"], S["back"], S["cap"]
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"barn": 0.03, "mint": 0.025, "mint2": 0.015, "gold": 0.015, "black": 0.03, "glowgold": 0.0})
    s = (BACK - TIP) / (ZB - ZF)
    yr = lambda z: TIP + (z - ZF) * s                                                       # the deck's top line
    ang = -math.atan(s)                                                                     # (negative: the back end rises)
    k = math.sqrt(1 + s * s)
    ny, nz = math.cos(ang), math.sin(ang)                                                   # the deck's normal

    def slab(acc, x0, x1, z0, z1, d0, d1):
        """a box lying on the deck: x0 to x1, from z0 to z1 along the top line (z level), d0 to d1 off it along its normal"""
        zm, dm = (z0 + z1) / 2, (d0 + d1) / 2
        acc.boxc((x0 + x1) / 2, yr(zm) + dm * ny, zm + dm * nz, x1 - x0, d1 - d0, (z1 - z0) * k, rot=(ang, 0, 0))

    slab(P["barn"], -E, E, ZF, ZB, -0.45, 0.0)                                              # the deck
    slab(P["mint2"], -(E - 0.2), E - 0.2, ZF + 0.2, ZB - 0.1, -0.51, -0.44)                 # its soffit, 6 cm proud below (its front end in the fascia, its ends in the barge boards)
    n = max(2, round(2 * (E - 0.6) / 2.14) + 1)
    for i in range(n):                                                                      # the ribs: mint standing seams along the fall, clear of the towers' flanks where the deck
        x = -(E - 0.6) + i * 2 * (E - 0.6) / (n - 1)                                        # runs through them: a seam beside a flank would leave a slot that reads as a seam line,
        for p, o in avoid:                                                                  # one whose side was in a face would shimmer, and one coming out of a corner pilaster's face
            d = (x - p) * o                                                                 # beside its edge would leave a sliver (d: its middle out of the flank). So a seam stands 20 cm
            if -0.53 < d < 0.63:                                                            # clear of the pilasters (35 cm out of the flank), or runs through the tower 10 cm in from them,
                x = p + o * min((-0.53, -0.135, 0.63), key=lambda t: abs(t - d))            # or through the pilasters, 5 cm inside the flank and 13 cm in from their inner edge
        slab(P["mint"], x - 0.08, x + 0.08, ZF + 0.25, ZB - 0.45, -0.04, 0.10)
    for sx in (-1, 1):                                                                      # a barge board down each end, 6 cm past the deck's end, standing 12 cm over it
        a, b = sx * (E - 0.24), sx * (E + 0.06)
        slab(P["mint"], min(a, b), max(a, b), ZF + 0.03, ZB + 0.12, -0.95, 0.12)            # (its front end in the fascia, not in the deck's end face's plane)
    P["mint"].box(-(E + 0.12), E + 0.12, TIP - 1.6, TIP, ZF - 0.06, ZF + 0.26)              # the fascia (6 cm past the barge boards)
    P["gold"].box(-(E + 0.18), E + 0.18, TIP - 1.74, TIP - 1.58, ZF - 0.15, ZF + 0.35)      # its gold lip
    P["gold"].box(-(E + 0.16), E + 0.16, TIP - 0.01, TIP + 0.17, ZF - 0.13, ZF + 0.33)      # and the top edge
    P["gold"].box(-(E - 0.1), E - 0.1, BACK - 0.08, BACK + 0.29, ZB - 0.55, ZB + 0.05)      # the ridge cap (its ends in the barge boards)
    m = max(1, round((2 * E - 6) / 6.33))
    for i in range(m + 1):                                                                  # pennants hanging from the lip, about every 6.3 m
        x = -(E - 3) + i * (2 * E - 6) / m if m else 0.0
        (P["barn"] if i % 2 == 0 else P["gold"]).poly([(-0.55, 0), (0.55, 0), (0, -1.5)], ZF + 0.06, ZF + 0.14, t=(x, TIP - 1.72, 0))
    zt = back + 0.3
    for x in girders:                                                                       # a trussed girder over each column (and at each end), from the fascia back to the beam
        yb0, yb1 = yr(ZF + 1.0) - 1.3, cap + 0.43
        P["black"].bm((x, yr(ZF + 0.6) - 0.5, ZF + 0.6), (x, yr(zt) - 0.5, zt), 0.13)      # the top chord, in the soffit
        P["black"].bm((x, yb0, ZF + 1.0), (x, yb1, zt), 0.13)                               # the bottom chord, its back end on the beam
        nn = 9
        low = lambda z: yb0 + (yb1 - yb0) * (z - ZF - 1.0) / (zt - ZF - 1.0)
        for i in range(nn + 1):
            z = ZF + 0.8 + (zt - ZF - 0.8) * i / nn
            P["black"].bm((x, yr(z) - 0.5, z), (x, low(z), z), 0.07)                        # a vertical
            if i < nn:
                z2 = ZF + 0.8 + (zt - ZF - 0.8) * (i + 1) / nn
                P["black"].bm((x, yr(z) - 0.5, z), (x, low(z2), z2), 0.06)                  # a diagonal
    P["black"].box(-Eb, Eb, cap - 0.02, cap + 0.38, back - 0.35, back + 0.9)                # the beam, lying on the back wall's cap and the columns (5 cm past their backs)
    colz = back + 0.4
    for x in cols:                                                                          # the columns: against the back wall's rear face, on the bays' edges (never behind a way in)
        P["black"].box(x - 0.45, x + 0.45, 0.1, cap + 0.1, colz - 0.45, colz + 0.45)      # (its top in the beam, not in the cap's top's plane)
        P["gold"].boxc(x, 0.22, colz, 1.3, 0.44, 1.3)                                       # its footing
    for x in lamps:                                                                         # lamps under the soffit, lit, between the girders
        for z in (ZB * 0.22, ZB * 0.55, ZB * 0.85):
            y = yr(z) - 0.62
            P["glowgold"].boxc(x, y, z, 0.7, 0.1, 2.0, rot=(ang, 0, 0))
            P["black"].boxc(x, y + 0.1, z, 0.9, 0.12, 2.3, rot=(ang, 0, 0))


roof("dn_roof", MAIN, MAIN["E"], MAIN["cols"] + [-MAIN["ends"], MAIN["ends"]], MAIN["cols"], MAIN["bays"], MAIN["Xc"] - 0.2, MAIN["avoid"])
roof("dn_roof_s", FAR, FAR["E"], FAR["cols"] + [-FAR["ends"], FAR["ends"]], FAR["cols"], FAR["bays"], FAR["Xc"] - 0.2, FAR["avoid"])
roof("dn_roof_bay", MAIN, 9.5, [0.0], [0.0], [-4.75, 4.75], 9.5)
roof("dn_roof_bay_s", FAR, 9.5, [0.0], [0.0], [-4.75, 4.75], 9.5)


# =====================================================================================================
# the end towers
# =====================================================================================================
def tower(name, W, D, H, bands, slit, banner):
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"mint": 0.045, "mint2": 0.02, "black": 0.025, "gold": 0.02, "money2": 0.0, "barn": 0.03, "glasswarm": 0.0})
    zc = D / 2
    P["mint2"].boxc(0, 0.6, zc, W + 0.9, 1.2, D + 0.9)                                      # the plinth (10 cm past the corner pilasters, so its edge is a step, not a seam)
    P["mint"].boxc(0, 1.2 + (H - 1.2) / 2, zc, W, H - 1.2, D)                               # the shaft
    for sx in (-1, 1):
        for z in (0.0, D):
            P["black"].boxc(sx * (W / 2), (1.15 + H + 0.1) / 2, z, 0.7, H + 0.1 - 1.15, 0.7)   # corner pilasters, their feet 5 cm into the plinth
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
    P["black"].boxc(0, (1.18 + 4.3) / 2, -0.04, 2.6, 4.3 - 1.18, 0.1)                       # a door on the plinth (the stand's front parapet runs past below it)
    P["gold"].boxc(0, 4.5, -0.1, 3.0, 0.3, 0.3)
    by, bh = banner
    for sx in (-1, 1):                                                                      # banners down the track face, hung on two gold brackets each, a gold hem 2 cm proud of the cloth
        bx = sx * W * 0.3
        P["barn"].box(bx - 0.85, bx + 0.85, by, by + bh, -0.2, -0.12)
        P["gold"].box(bx - 0.87, bx + 0.87, by - 0.2, by + 0.02, -0.22, -0.13)
        P["gold"].poly([(-0.87, 0), (0.87, 0), (0, -0.9)], -0.22, -0.13, t=(bx, by - 0.2, 0))
        for dx in (-0.7, 0.7):
            P["gold"].box(bx + dx - 0.03, bx + dx + 0.03, by + bh - 0.14, by + bh - 0.06, -0.17, 0.02)
    P["gold"].boxc(0, H + 0.25, zc, W + 1.0, 0.5, D + 1.0)                                  # cornice
    P["barn"].cylc(0, H + 0.5 + 1.7, zc, 0.77 * W, 3.4, 4, rt=0.4, rot=(0, PI / 4, 0))      # the hip roof (a four-sided cone)
    P["mint"].cylc(0, H + 0.5 + 3.5, zc, 0.4, 0.5, 8)
    P["gold"].bm((0, H + 4.0, zc), (0, H + 6.6, zc), 0.07)                                  # the finial
    P["gold"].add(sphere(0.32, 12, 8), t=(0, H + 6.8, zc))


# (the third band stands clear above the roof's deck, which runs through the tower at 22.8 to 23.9 m on the main stand and 15.2 to 16.5 m on the far one)
tower("dn_tower", 8.0, 9.0, 26.0, (7.5, 15.0, 24.8), ((11.0, 5.6), (19.0, 3.2)), (7.0, 8.0))
tower("dn_tower_s", 7.0, 8.0, 18.0, (6.5, 12.0, 17.0), ((9.0, 3.6),), (5.0, 4.8))


# =====================================================================================================
# the suites
# =====================================================================================================
def suites(name, xa, xb, bays, cap_over=0.0):
    """The suites row from xa to xb (the game's runs into the end walls), three windows a 19 m bay; the front face is at z = 0, its back 3.2 m behind"""
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"mint2": 0.04, "black": 0.015, "gold": 0.012, "money2": 0.02, "barn": 0.02, "glasswarm": 0.0})
    P["mint2"].box(xa, xb, 0.0, 3.4, 0.0, 3.2)
    P["money2"].box(xa - cap_over, xb + cap_over, 3.4, 3.72, -0.1, 3.3)                    # cap
    P["gold"].box(xa - cap_over, xb + cap_over, 0.86, 1.0, -0.22, 0.0)                     # sill
    for c in bays:
        for x in (c - 6.0, c, c + 6.0):
            P["black"].box(x - 2.45, x + 2.45, 1.0, 2.85, -0.04, 0.0)                      # the frame (behind the pane, so it shows as a border)
            P["glasswarm"].box(x - 2.3, x + 2.3, 1.0, 2.7, -0.07, -0.04)
            P["black"].box(x - 0.06, x + 0.06, 1.0, 2.7, -0.1, -0.07)                      # a mullion
            P["gold"].box(x - 2.5, x + 2.5, 2.85, 3.0, -0.12, -0.05)                       # lintel
    w, xm = (xb - xa - 0.04) if cap_over else (xb - xa - 0.1), (xa + xb) / 2
    P["barn"].boxc(xm, 3.1, -0.55, w, 0.1, 1.5, rot=(0.3, 0, 0))                          # an awning over the glass, pitched down toward the track
    P["gold"].boxc(xm, 2.72, -1.18, w, 0.08, 0.12)


suites("dn_suites", -114.1, 114.1, MAIN["bays"])
suites("dn_suite", -9.5, 9.5, [0.0], cap_over=0.1)


# =====================================================================================================
# the back walls
# =====================================================================================================
def back_wall(name, S, xa, xb, doors, bays, cornice, quoins=False):
    """The back wall from xa to xb as one piece: its body is one prism, the stand's elevation with the openings of the ways in cut out of it (5.8 x 3.9 m: the tunnel
    inside is 6 x 4, so the opening's jambs and head stand 10 cm into it and read as a door frame). `cornice`: the cornice's ends."""
    WH = S["wh"]
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"mint": 0.05, "mint2": 0.02, "money2": 0.0, "gold": 0.012, "black": 0.012, "glasswarm": 0.0, "glowgold": 0.0})
    pts = [(xa, 0.0)]
    for d in sorted(doors):
        pts += [(d - OPEN_W, 0.0), (d - OPEN_W, OPEN_H), (d + OPEN_W, OPEN_H), (d + OPEN_W, 0.0)]
    pts += [(xb, 0.0), (xb, WH), (xa, WH)]
    P["mint"].poly(pts, -0.8, 0.0)                                                          # the body (rear face z = 0)
    qa, qb, qz, qr = S["quoin"]
    wa, wb = (-(qa + 0.05), qa + 0.05) if quoins else (xa + 0.01, xb - 0.01)               # (the trim runs into the quoins)
    cuts, a = [], wa
    for d in sorted(doors):
        cuts.append((a, d - OPEN_W - 0.03))
        a = d + OPEN_W + 0.03
    cuts.append((a, wb))
    for a, b in cuts:
        P["money2"].box(a, b, -0.02, 2.6, -0.02, 0.14)                                      # the wainscot
        P["money2"].box(a, b, 2.6, 2.95, -0.02, 0.2)
    P["money2"].box(wa, wb, WH - 3.2, WH - 2.8, -0.02, 0.2)
    wy = WH - 6.6
    for c in bays:
        for x in (c - 6.0, c, c + 6.0):                                                     # the members' bar's windows
            P["black"].box(x - 1.75, x + 1.75, wy - 0.15, wy + 1.95, 0.0, 0.04)
            P["glasswarm"].box(x - 1.6, x + 1.6, wy, wy + 1.8, 0.04, 0.08)
            P["black"].box(x - 0.05, x + 0.05, wy, wy + 1.8, 0.08, 0.12)
            P["gold"].box(x - 1.85, x + 1.85, wy + 1.95, wy + 2.12, 0.04, 0.2)
        for x in (c - 6.4, c + 6.4):                                                        # lanterns (clear of an entry's frame): a bracket, a cap, the lit glass and a base
            P["black"].box(x - 0.08, x + 0.08, 4.26, 4.36, -0.02, 0.42)
            P["black"].box(x - 0.2, x + 0.2, 4.18, 4.3, 0.26, 0.62)
            P["glowgold"].box(x - 0.14, x + 0.14, 3.9, 4.2, 0.31, 0.57)
            P["black"].box(x - 0.18, x + 0.18, 3.86, 3.92, 0.28, 0.6)
    ca, cb = cornice
    P["gold"].box(ca, cb, WH - 0.1, WH + 0.5, -0.9, 0.55)                                   # cornice
    P["mint2"].box(ca + 0.1, cb - 0.1, WH + 0.5, WH + 0.85, -0.8, 0.35)                     # its cap (10 cm in from the cornice's front and ends), where the roof's beam lies
    if quoins:
        for sx in (-1, 1):                                                                  # a quoin at each rear corner, over the joint where the back wall and the end wall meet
            a, b = sx * qa, sx * qb
            P["mint2"].box(min(a, b), max(a, b), -0.04, WH - 0.05, qz, qr)


back_wall("dn_backwall", MAIN, -(MAIN["hw"] + 0.4), MAIN["hw"] + 0.4, ENTRIES, MAIN["bays"], (-MAIN["Xc"], MAIN["Xc"]), quoins=True)
back_wall("dn_backwall_s", FAR, -(FAR["hw"] + 0.4), FAR["hw"] + 0.4, ENTRIES, FAR["bays"], (-FAR["Xc"], FAR["Xc"]), quoins=True)
back_wall("dn_back", MAIN, -9.5, 9.5, (), [0.0], (-9.46, 9.46))
back_wall("dn_back_s", FAR, -9.5, 9.5, (), [0.0], (-9.46, 9.46))
back_wall("dn_back_gate", MAIN, -9.5, 9.5, (0.0,), [0.0], (-9.46, 9.46))
back_wall("dn_back_s_gate", FAR, -9.5, 9.5, (0.0,), [0.0], (-9.46, 9.46))

# =====================================================================================================
# dn_entry
# =====================================================================================================
root = pivot("dn_entry", (0, 0, 0))
P = parts(root, "dn_entry", {"black": 0.02, "gold": 0.015, "barn": 0.03, "mint2": 0.0, "glowgold": 0.0, "black2": 0.012})
P["mint2"].box(-3.4, -2.8, 0.0, 5.0, -0.12, 0.3)                                        # jambs framing the opening, 10 cm into it
P["mint2"].box(2.8, 3.4, 0.0, 5.0, -0.12, 0.3)
P["gold"].box(-3.7, 3.7, 3.85, 4.3, -0.04, 0.4)                                         # the lintel, 5 cm below the opening's head (6 cm behind the jambs' faces in it)
P["barn"].boxc(0, 5.2, 0.9, 7.4, 0.14, 2.4, rot=(0.22, 0, 0))                           # a canopy pitched away from the wall
P["gold"].boxc(0, 4.82, 2.0, 7.4, 0.1, 0.12)
for x in (-2.0, 2.0):
    P["black"].bm((x, 4.3, 0.2), (x, 5.0, 1.4), 0.04)
    P["black2"].box(x - 0.15, x + 0.15, 4.18, 4.27, 0.35, 0.65)                         # a lamp on the lintel's face: its cap, the lit glass and a base
    P["glowgold"].box(x - 0.11, x + 0.11, 3.83, 4.2, 0.39, 0.61)
    P["black2"].box(x - 0.13, x + 0.13, 3.8, 3.85, 0.37, 0.63)

finish_and_export()
