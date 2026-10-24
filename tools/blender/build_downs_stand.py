# Chimera Downs grandstand kit for Blender (4.2+ / 5.x), exported to src/assets/downs-stand.glb: the pieces both stands are
# built from (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stand.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stand.py
#
# STAND frame: spectators face -z (the track), front edge z = 0, back +z, x along the stand, each piece on y = 0 (the game
# lifts it). One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js; glow slots are lit).
# Full-length parts are ONE piece each, so no seams show between 19 m bays (an outlined piece's shell pokes out of a flush
# neighbour along the joint); the game bakes each once at the stand's origin (downsWorld.js grandstand(), same numbers as
# MAIN / FAR below).
#   dn_seat3        3 seats on one frame, 2.7 x 0.7 x 0.9 m: one cushion, three raked backs, armrests (`seat` takes the section colour)
#   dn_roof         main roof, end wall to end wall (x +-115.05, through the corner towers): raked barn deck with Mint standing
#                   seams, soffit, barge boards, fascia with gold lip, top edge and pennants, gold ridge cap, a trussed girder
#                   over each column and at each end, lit lamps under the soffit, the beam the girders end on (on the back
#                   wall's cap), columns behind the back wall with footings. Deck z = -4.5 to 39.5, front tip 22.9 m up, back 26 m
#   dn_roof_s       far roof: x +-96.05, z = -3.5 to 23.5, front tip 15.3 m up, back 17.8 m
#   dn_roof_bay, dn_roof_bay_s   19 m samples with a girder and column in the middle (Asset Row; the game bakes whole roofs)
#   dn_tower        main end tower, 8 x 9 x 26 m, hip roof and finial, in the front corner; shaft front face 0.51 m behind the
#                   stand's front (the parapet runs past); the roof deck runs through it between the second and third bands
#   dn_tower_s      far tower, 7 x 8 x 18 m
#   dn_suites       suites row over the main top tier, x +-114.1: 3.4 m tall, 3.2 deep, three lit windows a bay, gold sill, awning
#   dn_suite        19 m of it (Asset Row)
#   dn_backwall     main back wall seen from +z (rear face z = 0, 0.8 m thick toward -z), 22.4 m tall, x +-114.4 (into the end
#                   walls): way-in openings (5.8 x 3.9 m at x = +-47.5), members' bar windows, lanterns, wainscot, band, gold
#                   cornice and cap, a quoin at each rear corner
#   dn_backwall_s   far back wall, 14.6 m tall, x +-95.4
#   dn_back, dn_back_s, dn_back_gate, dn_back_s_gate   19 m samples, with and without an opening (Asset Row)
#   dn_entry        a way-in frame round the opening, seen from +z: two jambs, gold lintel, barn red canopy, two lamps
DOWNS_OUT = "downs-stand.glb"
DOWNS_COLL = "MoonDownsStand"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# Stand numbers, stand frame (keep in step with src/downsPlan.js STAND / FAR and downsWorld.js grandstand()).
#   hw      half length: the end walls' inner faces (end walls 0.8 m thick outside them)
#   back    back wall rear face (main: 13 tiers of 2.6 m, top tier 3.2 deep, 0.8 m wall; far: 8 of 2.4 m, wall); wh its height
#   tip, rback, zf, zb   roof deck top line: tip m up at z = zf (front edge), rback m up at z = zb (back edge)
#   cols    columns behind the back wall on each 19 m bay edge (never behind a way in, which sit mid-bay); ends: end girder x
#           (over the end walls, 40 cm clear of the tower pilasters, so the end bay behind the towers gets a girder)
#   tower   tower middle and shaft width: its flank faces, where the deck runs through (standing seams keep clear)
#   quoin   rear corner quoins: x0 to x1, z0 (into the wall) to z1 behind the rear face. Main: 28 cm, wrapping 15 cm onto the
#           end wall's outer face. Far: the arcade's return carries the end wall on (downsWorld.js joiner); the quoin stands
#           18 cm proud of the return and ends 5 cm inside the arcade's pilaster, hidden under the arcade roof
MAIN = dict(hw=114.0, back=37.8, wh=22.4, tip=22.9, rback=26.0, zf=-4.5, zb=39.5, cols=[-95.0 + 19 * i for i in range(11)], ends=114.4, towerx=109.65, towerw=8.0,
            quoin=(113.8, 114.95, -0.3, 0.28), bays=[-104.5 + 19 * i for i in range(12)])
FAR = dict(hw=95.0, back=20.0, wh=14.6, tip=15.3, rback=17.8, zf=-3.5, zb=23.5, cols=[-76.0 + 19 * i for i in range(9)], ends=95.4, towerx=91.15, towerw=7.0,
           quoin=(94.8, 95.85, -0.25, 0.25), bays=[-85.5 + 19 * i for i in range(10)])
ENTRIES = (-47.5, 47.5)
OPEN_W, OPEN_H = 2.9, 3.9                                                                   # half width and height of the back wall opening (tunnel 6 x 4 m)
for S in (MAIN, FAR):
    S["E"] = S["hw"] + 0.8 + 0.25                                                           # roof ends: 25 cm past the end walls' outer faces
    S["Xc"] = S["quoin"][1] + 0.15                                                          # cornice ends: 15 cm past the quoins
    S["cap"] = S["wh"] + 0.85                                                               # cornice cap top, where the roof beam lies
    tx, tw = S["towerx"], S["towerw"] / 2
    S["avoid"] = [(s * (tx - tw), -s) for s in (-1, 1)] + [(s * (tx + tw), s) for s in (-1, 1)]      # flank face x, and the outward direction

# =====================================================================================================
# dn_seat3
# =====================================================================================================
root = pivot("dn_seat3", (0, 0, 0))
P = parts(root, "dn_seat3", {"seat": 0.0, "black": 0.0})                                # no outlines: ~1,650 of these
P["seat"].boxc(0.0, 0.15, 0.0, 2.7, 0.3, 0.66)                                          # one long cushion
for i in range(3):
    P["seat"].boxc(-0.9 + 0.9 * i, 0.6, 0.3, 0.74, 0.6, 0.12, rot=(0.12, 0, 0))         # raked backs
for x in (-0.45, 0.45):
    P["black"].boxc(x, 0.43, 0.0, 0.07, 0.26, 0.56)                                     # armrests


# =====================================================================================================
# the roofs
# =====================================================================================================
def roof(name, S, E, girders, cols, lamps, Eb, avoid=()):
    """One roof from x = -E to E. Each lengthwise piece (fascia, lip, top edge, deck, soffit, ridge cap, beam) is one box, so
    no joints show. Meeting pieces are let into each other (deck into fascia, soffit into barge boards, ribs into top edge and
    ridge cap, girders into beam) or stand at least 5 cm proud where they end side by side."""
    TIP, BACK, ZF, ZB, back, cap = S["tip"], S["rback"], S["zf"], S["zb"], S["back"], S["cap"]
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"barn": 0.03, "mint": 0.025, "mint2": 0.015, "gold": 0.015, "black": 0.03, "glowgold": 0.0})
    s = (BACK - TIP) / (ZB - ZF)
    yr = lambda z: TIP + (z - ZF) * s                                                       # deck top line
    ang = -math.atan(s)                                                                     # negative: the back rises
    k = math.sqrt(1 + s * s)
    ny, nz = math.cos(ang), math.sin(ang)                                                   # deck normal

    def slab(acc, x0, x1, z0, z1, d0, d1):
        """a box on the deck: x0 to x1, z0 to z1 along the top line (z level), d0 to d1 off it along the normal"""
        zm, dm = (z0 + z1) / 2, (d0 + d1) / 2
        acc.boxc((x0 + x1) / 2, yr(zm) + dm * ny, zm + dm * nz, x1 - x0, d1 - d0, (z1 - z0) * k, rot=(ang, 0, 0))

    slab(P["barn"], -E, E, ZF, ZB, -0.45, 0.0)                                              # deck
    slab(P["mint2"], -(E - 0.2), E - 0.2, ZF + 0.2, ZB - 0.1, -0.51, -0.44)                 # soffit, 6 cm proud below (ends in fascia and barge boards)
    n = max(2, round(2 * (E - 0.6) / 2.14) + 1)
    # ribs: mint standing seams down the fall. Near a tower flank (d: rib middle out of the flank) a seam would leave a slot,
    # shimmer in a face, or a sliver by a pilaster, so it moves to 35 cm out of the flank (20 cm clear of the pilasters),
    # 10 cm inside them through the tower, or 5 cm inside the flank through the pilasters
    for i in range(n):
        x = -(E - 0.6) + i * 2 * (E - 0.6) / (n - 1)
        for p, o in avoid:
            d = (x - p) * o
            if -0.53 < d < 0.63:
                x = p + o * min((-0.53, -0.135, 0.63), key=lambda t: abs(t - d))
        slab(P["mint"], x - 0.08, x + 0.08, ZF + 0.25, ZB - 0.45, -0.04, 0.10)
    for sx in (-1, 1):                                                                      # barge boards: 6 cm past the deck end, 12 cm above it
        a, b = sx * (E - 0.24), sx * (E + 0.06)
        slab(P["mint"], min(a, b), max(a, b), ZF + 0.03, ZB + 0.12, -0.95, 0.12)            # front end in the fascia, not flush with the deck's end face
    P["mint"].box(-(E + 0.12), E + 0.12, TIP - 1.6, TIP, ZF - 0.06, ZF + 0.26)              # fascia (6 cm past the barge boards)
    P["gold"].box(-(E + 0.18), E + 0.18, TIP - 1.74, TIP - 1.58, ZF - 0.15, ZF + 0.35)      # gold lip
    P["gold"].box(-(E + 0.16), E + 0.16, TIP - 0.01, TIP + 0.17, ZF - 0.13, ZF + 0.33)      # top edge
    P["gold"].box(-(E - 0.1), E - 0.1, BACK - 0.08, BACK + 0.29, ZB - 0.55, ZB + 0.05)      # ridge cap (ends in the barge boards)
    m = max(1, round((2 * E - 6) / 6.33))
    for i in range(m + 1):                                                                  # pennants from the lip, about every 6.3 m
        x = -(E - 3) + i * (2 * E - 6) / m if m else 0.0
        (P["barn"] if i % 2 == 0 else P["gold"]).poly([(-0.55, 0), (0.55, 0), (0, -1.5)], ZF + 0.06, ZF + 0.14, t=(x, TIP - 1.72, 0))
    zt = back + 0.3
    for x in girders:                                                                       # trussed girder over each column and at each end, fascia to beam
        yb0, yb1 = yr(ZF + 1.0) - 1.3, cap + 0.43
        P["black"].bm((x, yr(ZF + 0.6) - 0.5, ZF + 0.6), (x, yr(zt) - 0.5, zt), 0.13)      # top chord, in the soffit
        P["black"].bm((x, yb0, ZF + 1.0), (x, yb1, zt), 0.13)                               # bottom chord, back end on the beam
        nn = 9
        low = lambda z: yb0 + (yb1 - yb0) * (z - ZF - 1.0) / (zt - ZF - 1.0)
        for i in range(nn + 1):
            z = ZF + 0.8 + (zt - ZF - 0.8) * i / nn
            P["black"].bm((x, yr(z) - 0.5, z), (x, low(z), z), 0.07)                        # vertical
            if i < nn:
                z2 = ZF + 0.8 + (zt - ZF - 0.8) * (i + 1) / nn
                P["black"].bm((x, yr(z) - 0.5, z), (x, low(z2), z2), 0.06)                  # diagonal
    P["black"].box(-Eb, Eb, cap - 0.02, cap + 0.38, back - 0.35, back + 0.9)                # beam on the back wall's cap and the columns (5 cm past their backs)
    colz = back + 0.4
    for x in cols:                                                                          # columns against the back wall, on bay edges
        P["black"].box(x - 0.45, x + 0.45, 0.1, cap + 0.1, colz - 0.45, colz + 0.45)      # top in the beam, not flush with the cap
        P["gold"].boxc(x, 0.22, colz, 1.3, 0.44, 1.3)                                       # footing
    for x in lamps:                                                                         # lit lamps under the soffit, between the girders
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
    P["mint2"].boxc(0, 0.6, zc, W + 0.9, 1.2, D + 0.9)                                      # plinth, 10 cm past the pilasters (a step, not a seam)
    P["mint"].boxc(0, 1.2 + (H - 1.2) / 2, zc, W, H - 1.2, D)                               # shaft
    for sx in (-1, 1):
        for z in (0.0, D):
            P["black"].boxc(sx * (W / 2), (1.15 + H + 0.1) / 2, z, 0.7, H + 0.1 - 1.15, 0.7)   # corner pilasters, feet 5 cm into the plinth
    for y in bands:
        P["money2"].boxc(0, y, zc, W + 0.2, 0.55, D + 0.2)
    for x in (-W * 0.3, 0.0, W * 0.3):                                                      # lit slits on the track face
        for y, h in slit:
            P["black"].boxc(x, y, -0.02, 1.2, h + 0.4, 0.04)                                # frame behind the pane shows as a border
            P["glasswarm"].boxc(x, y, -0.055, 0.9, h, 0.03)
    wlo, whi = bands[0] + 0.275 + 0.45, bands[1] - 0.275 - 0.45                              # flank windows fit between the first two bands
    wc, wh = (wlo + whi) / 2, whi - wlo
    for sx in (-1, 1):                                                                      # both flanks
        for z in (D * 0.3, D * 0.7):
            P["black"].boxc(sx * (W / 2 + 0.02), wc, z, 0.04, wh + 0.4, 1.2)
            P["glasswarm"].boxc(sx * (W / 2 + 0.055), wc, z, 0.03, wh, 0.9)
    P["black"].boxc(0, (1.18 + 4.3) / 2, -0.04, 2.6, 4.3 - 1.18, 0.1)                       # door on the plinth (the parapet runs past below)
    P["gold"].boxc(0, 4.5, -0.1, 3.0, 0.3, 0.3)
    by, bh = banner
    for sx in (-1, 1):                                                                      # banners on the track face, two gold brackets each, gold hem 2 cm proud
        bx = sx * W * 0.3
        P["barn"].box(bx - 0.85, bx + 0.85, by, by + bh, -0.2, -0.12)
        P["gold"].box(bx - 0.87, bx + 0.87, by - 0.2, by + 0.02, -0.22, -0.13)
        P["gold"].poly([(-0.87, 0), (0.87, 0), (0, -0.9)], -0.22, -0.13, t=(bx, by - 0.2, 0))
        for dx in (-0.7, 0.7):
            P["gold"].box(bx + dx - 0.03, bx + dx + 0.03, by + bh - 0.14, by + bh - 0.06, -0.17, 0.02)
    P["gold"].boxc(0, H + 0.25, zc, W + 1.0, 0.5, D + 1.0)                                  # cornice
    P["barn"].cylc(0, H + 0.5 + 1.7, zc, 0.77 * W, 3.4, 4, rt=0.4, rot=(0, PI / 4, 0))      # hip roof (four-sided cone)
    P["mint"].cylc(0, H + 0.5 + 3.5, zc, 0.4, 0.5, 8)
    P["gold"].bm((0, H + 4.0, zc), (0, H + 6.6, zc), 0.07)                                  # finial
    P["gold"].add(sphere(0.32, 12, 8), t=(0, H + 6.8, zc))


# the third band clears the roof deck through the tower (22.8 to 23.9 m main, 15.2 to 16.5 m far)
tower("dn_tower", 8.0, 9.0, 26.0, (7.5, 15.0, 24.8), ((11.0, 5.6), (19.0, 3.2)), (7.0, 8.0))
tower("dn_tower_s", 7.0, 8.0, 18.0, (6.5, 12.0, 17.0), ((9.0, 3.6),), (6.0, 6.0))                # (the banners over the slit, 1 m past its frame each way, like the main tower's)


# =====================================================================================================
# the suites
# =====================================================================================================
def suites(name, xa, xb, bays, cap_over=0.0):
    """Suites row from xa to xb (the game's runs into the end walls), three windows per 19 m bay; front z = 0, back 3.2 m behind"""
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"mint2": 0.04, "black": 0.015, "gold": 0.012, "money2": 0.02, "barn": 0.02, "glasswarm": 0.0})
    P["mint2"].box(xa, xb, 0.0, 3.4, 0.0, 3.2)
    P["money2"].box(xa - cap_over, xb + cap_over, 3.4, 3.72, -0.1, 3.3)                    # cap
    P["gold"].box(xa - cap_over, xb + cap_over, 0.86, 1.0, -0.22, 0.0)                     # sill
    for c in bays:
        for x in (c - 6.0, c, c + 6.0):
            P["black"].box(x - 2.45, x + 2.45, 1.0, 2.85, -0.04, 0.0)                      # frame behind the pane shows as a border
            P["glasswarm"].box(x - 2.3, x + 2.3, 1.0, 2.7, -0.07, -0.04)
            P["black"].box(x - 0.06, x + 0.06, 1.0, 2.7, -0.1, -0.07)                      # mullion
            P["gold"].box(x - 2.5, x + 2.5, 2.85, 3.0, -0.12, -0.05)                       # lintel
    w, xm = (xb - xa - 0.04) if cap_over else (xb - xa - 0.1), (xa + xb) / 2
    P["barn"].boxc(xm, 3.1, -0.55, w, 0.1, 1.5, rot=(0.3, 0, 0))                          # awning, pitched down toward the track
    P["gold"].boxc(xm, 2.72, -1.18, w, 0.08, 0.12)


suites("dn_suites", -114.1, 114.1, MAIN["bays"])
suites("dn_suite", -9.5, 9.5, [0.0], cap_over=0.1)


# =====================================================================================================
# the back walls
# =====================================================================================================
def back_wall(name, S, xa, xb, doors, bays, cornice, quoins=False):
    """Back wall from xa to xb as one prism with the way-in openings cut out (5.8 x 3.9 m; the 6 x 4 tunnel behind makes the
    jambs and head stand 10 cm in, reading as a frame). `cornice`: the cornice ends."""
    WH = S["wh"]
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"mint": 0.05, "mint2": 0.02, "money2": 0.0, "gold": 0.012, "black": 0.012, "glasswarm": 0.0, "glowgold": 0.0})
    pts = [(xa, 0.0)]
    for d in sorted(doors):
        pts += [(d - OPEN_W, 0.0), (d - OPEN_W, OPEN_H), (d + OPEN_W, OPEN_H), (d + OPEN_W, 0.0)]
    pts += [(xb, 0.0), (xb, WH), (xa, WH)]
    P["mint"].poly(pts, -0.8, 0.0)                                                          # body (rear face z = 0)
    qa, qb, qz, qr = S["quoin"]
    wa, wb = (-(qa + 0.05), qa + 0.05) if quoins else (xa + 0.01, xb - 0.01)               # trim runs into the quoins
    cuts, a = [], wa
    for d in sorted(doors):
        cuts.append((a, d - OPEN_W - 0.03))
        a = d + OPEN_W + 0.03
    cuts.append((a, wb))
    for a, b in cuts:
        P["money2"].box(a, b, -0.02, 2.6, -0.02, 0.14)                                      # wainscot
        P["money2"].box(a, b, 2.6, 2.95, -0.02, 0.2)
    P["money2"].box(wa, wb, WH - 3.2, WH - 2.8, -0.02, 0.2)
    wy = WH - 6.6
    for c in bays:
        for x in (c - 6.0, c, c + 6.0):                                                     # members' bar windows
            P["black"].box(x - 1.75, x + 1.75, wy - 0.15, wy + 1.95, 0.0, 0.04)
            P["glasswarm"].box(x - 1.6, x + 1.6, wy, wy + 1.8, 0.04, 0.08)
            P["black"].box(x - 0.05, x + 0.05, wy, wy + 1.8, 0.08, 0.12)
            P["gold"].box(x - 1.85, x + 1.85, wy + 1.95, wy + 2.12, 0.04, 0.2)
        for x in (c - 6.4, c + 6.4):                                                        # lanterns clear of entry frames: bracket, cap, lit glass, base
            P["black"].box(x - 0.08, x + 0.08, 4.26, 4.36, -0.02, 0.42)
            P["black"].box(x - 0.2, x + 0.2, 4.18, 4.3, 0.26, 0.62)
            P["glowgold"].box(x - 0.14, x + 0.14, 3.9, 4.2, 0.31, 0.57)
            P["black"].box(x - 0.18, x + 0.18, 3.86, 3.92, 0.28, 0.6)
    ca, cb = cornice
    P["gold"].box(ca, cb, WH - 0.1, WH + 0.5, -0.9, 0.55)                                   # cornice
    P["mint2"].box(ca + 0.1, cb - 0.1, WH + 0.5, WH + 0.85, -0.8, 0.35)                     # cap (10 cm in from the cornice front and ends), under the roof beam
    if quoins:
        for sx in (-1, 1):                                                                  # quoins over the back wall / end wall joints
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
P["mint2"].box(-3.4, -2.8, 0.0, 5.0, -0.12, 0.3)                                        # jambs, 10 cm into the opening
P["mint2"].box(2.8, 3.4, 0.0, 5.0, -0.12, 0.3)
P["gold"].box(-3.7, 3.7, 3.85, 4.3, -0.04, 0.4)                                         # lintel, 5 cm below the opening head (6 cm behind the jamb faces)
P["barn"].boxc(0, 5.2, 0.9, 7.4, 0.14, 2.4, rot=(0.22, 0, 0))                           # canopy pitched away from the wall
P["gold"].boxc(0, 4.82, 2.0, 7.4, 0.1, 0.12)
for x in (-2.0, 2.0):
    P["black"].bm((x, 4.3, 0.2), (x, 5.0, 1.4), 0.04)
    P["black2"].box(x - 0.15, x + 0.15, 4.18, 4.27, 0.35, 0.65)                         # lamp on the lintel face: cap, lit glass, base
    P["glowgold"].box(x - 0.11, x + 0.11, 3.83, 4.2, 0.39, 0.61)
    P["black2"].box(x - 0.13, x + 0.13, 3.8, 3.85, 0.37, 0.63)

finish_and_export()
