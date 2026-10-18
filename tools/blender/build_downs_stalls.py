# Chimera Downs' concession stalls for Blender (4.2+ / 5.x), exported to src/assets/downs-stalls.glb (docs/downs-layouts.md: twenty stalls in the two arcades).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stalls.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stalls.py
#
# Twelve stalls on one kit, "THE ALCOVE", each built INTO an arcade bay (tools/blender/build_downs_arcade.py dn_arcade) against its back wall, so it is authored in that bay's frame: z = 0 on the walk's
# edge, +z outward to the back wall (inner face z = 15.27), the floor top y = 0.14, x tangential, the stall facing -z toward the walk; the game bakes it at the bay's own place. About 10 m wide, 5.9 m
# deep and 7.7 m tall: a Mint screen wall (z 11.6 to 12.1) with an arched opening, a gold band and keystone and a Black name plate above it with the name in raised letters; behind it the alcove
# (side walls, a roof, a lit tiled niche on the back wall), a rounded counter (top at y = 1.3, z 12.2 to 13.7, the vendor stands behind it at about z = 14.4 on the alcove's floor, y = 0.34), a
# barrel-vaulted hood in the `accent` slot (the game picks its colour per stall) striped with Mint, two pendant lanterns, and a blade sign with a lit emblem on the screen's right corner.
#   dn_stall_0  MOON DOGS      a roller grill of sausages, buns, mustard and ketchup
#   dn_stall_1  CRATER FRIES   two fryer baskets and a rack of paper cones
#   dn_stall_2  HE-3 FIZZ      a soda fountain: a row of taps over a drip tray, tall lit glasses
#   dn_stall_3  CHIMERA CHOW   a big pot with a ladle, a stack of bowls
#   dn_stall_4  ROCK CANDY     rows of jars of rock candy, the upper row on a shelf
#   dn_stall_5  TOTE · BETS    a tote screen, four betting terminals and a brass grille
#   dn_stall_6  SPACE SLUSH    three slush machines
#   dn_stall_7  LUNAR COFFEE   an espresso machine, two urns and a tower of cups
#   dn_stall_8  DERBY DONUTS   a rack of donuts on pegs
#   dn_stall_9  JOCKEY'S GRILL a grill with a chimney, a rack of steaks
#   dn_stall_10 FOAM FINGERS   a pegboard of foam fingers and caps on the back wall, a stack of programmes
#   dn_stall_11 RAIL BAR       a back bar of bottles on the shelves, barrels with taps
# Counter props are written as they were for the old free-standing stalls (their z measured from the counter's middle, +z toward the customer) and put through `Z`, which turns that round.
DOWNS_OUT = "downs-stalls.glb"
DOWNS_COLL = "MoonDownsStalls"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

SLOTS = {"mint": 0.04, "mint2": 0.02, "money2": 0.0, "gold": 0.015, "black": 0.025, "black2": 0.012, "saddle": 0.02, "saddle2": 0.012, "accent": 0.02, "glasswarm": 0.0, "glowgold": 0.0, "glowmint": 0.0, "barn": 0.02}
ZB = 15.27           # the bay's back wall, its inner face
FL = 0.14            # the bay's floor top
CT = 1.3             # the counter's top
CZ0, CZ1 = 12.2, 13.7
Z = lambda z: 13.15 - z      # an old-frame z (the counter about z = 0.2, +z toward the customer) in the bay's frame (the customer toward -z)


def pix_for(label, width):
    return min(0.16, width / (6 * len(label) - 1))


def jars(P, y, z, xs, slot, h=0.5, r=0.17):
    for x in xs:
        P[slot].cylc(x, y + h / 2, z, r, h, 10)
        P["gold"].cylc(x, y + h + 0.03, z, r + 0.02, 0.06, 10)


def base(name, label, shelf="jars"):
    """the alcove; shelf: what stands on the back wall's two shelves ('jars', 'bottles' or 'none' for a stall that dresses the wall itself)"""
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, SLOTS)
    ZS, ZT = 11.6, 12.1                                                                 # the screen wall's front and back faces
    SPR, CRN, HC = 4.0, 5.6, 4.3                                                        # the arch: spring, crown, half-chord
    RR = (HC ** 2 + (CRN - SPR) ** 2) / (2 * (CRN - SPR))
    YC = CRN - RR
    P["mint2"].box(-4.98, 4.98, FL + 0.02, FL + 0.2, ZS - 0.1, ZB - 0.02)                 # a raised floor (clear of the bay's floor, side walls and back wall)
    # the screen wall: Mint with an arched opening, piers, a gold band round the opening and a keystone, a Black name plate with raised letters
    pts = [(-5.0, SPR)]
    n = 28
    for i in range(n + 1):
        x = -HC + 2 * HC * i / n
        pts.append((x, YC + math.sqrt(RR * RR - x * x)))
    pts += [(5.0, SPR), (5.0, 7.7), (-5.0, 7.7)]
    P["mint"].poly(pts, ZS, ZT)
    for sx in (-1, 1):
        x0, x1 = (HC, 5.0) if sx > 0 else (-5.0, -HC)
        P["mint"].box(x0, x1, FL + 0.2, SPR, ZS, ZT)                                    # the piers
        P["gold"].box(x0 - 0.04, x1 + 0.04, SPR - 0.01, SPR + 0.16, ZS - 0.06, ZT + 0.02)    # their capitals
        P["money2"].box(x0, x1, FL + 0.2, 1.3, ZS - 0.05, ZS)                           # a tiled dado on each
    a = math.asin(HC / RR)
    ring_o = [((RR + 0.12) * math.sin(-a + 2 * a * i / n), YC + (RR + 0.12) * math.cos(-a + 2 * a * i / n)) for i in range(n + 1)]
    ring_i = [((RR - 0.02) * math.sin(a - 2 * a * i / n), YC + (RR - 0.02) * math.cos(a - 2 * a * i / n)) for i in range(n + 1)]
    P["gold"].poly(ring_o + ring_i, ZS - 0.06, ZS - 0.01)                               # a gold band round the opening, proud of the screen
    P["gold"].box(-0.4, 0.4, CRN + 0.05, CRN + 0.5, ZS - 0.12, ZS - 0.01)               # the keystone
    P["black"].box(-4.6, 4.6, 6.2, 7.4, ZS - 0.1, ZS - 0.01)                            # the name plate
    P["gold"].box(-4.72, 4.72, 6.12, 6.2, ZS - 0.13, ZS - 0.005)
    P["gold"].box(-4.72, 4.72, 7.4, 7.5, ZS - 0.13, ZS - 0.005)
    P["gold"].letters(label, 0, 6.8, ZS - 0.1, pix_for(label, 8.8), 0.07, ry=math.pi)
    # the alcove: side walls and a roof, a lit tiled niche on the back wall
    for sx in (-1, 1):
        x0, x1 = (4.8, 5.0) if sx > 0 else (-5.0, -4.8)
        P["mint"].box(x0, x1, FL + 0.2, 7.7, ZT, ZB)
    P["mint2"].box(-4.98, 4.98, 7.64, 7.84, ZS - 0.04, ZB - 0.02)                                   # the roof over it all
    P["gold"].box(-5.06, 5.06, 7.84, 7.96, ZS - 0.08, ZB)
    P["money2"].box(-4.8, 4.8, FL + 0.2, 1.9, ZB - 0.1, ZB)                             # tiles up the back wall
    P["gold"].box(-4.8, 4.8, 1.9, 2.0, ZB - 0.14, ZB)
    P["black"].box(-4.4, 4.4, 2.2, 5.6, ZB - 0.05, ZB)
    P["glasswarm"].box(-4.28, 4.28, 2.32, 5.48, ZB - 0.09, ZB - 0.05)
    if shelf != "none":
        for y in (3.2, 4.3):
            P["saddle"].box(-4.28, 4.28, y, y + 0.1, ZB - 0.8, ZB - 0.09)
    if shelf == "jars":
        jars(P, 3.3, ZB - 0.45, [-3.7 + i * 1.06 for i in range(8)], "accent")
        jars(P, 4.4, ZB - 0.45, [-3.2 + i * 1.6 for i in range(5)], "barn", 0.55, 0.2)
    elif shelf == "bottles":
        for r, y in enumerate((3.3, 4.4)):
            for i in range(12):
                s = ("accent", "gold", "money2", "barn", "glowmint")[(i + r) % 5]
                P[s].cylc(-3.7 + i * 0.67, y + 0.25, ZB - 0.45, 0.09, 0.5, 8)
    # the counter: a rounded bar, its ends round in the accent colour, a Saddle top with a gold nosing and a panelled front
    P["black2"].box(-3.7, 3.7, FL + 0.2, CT - 0.12, CZ0, CZ1)
    r = (CZ1 - CZ0) / 2
    for sx in (-1, 1):
        P["accent"].cylc(sx * 3.7, (FL + 0.2 + CT - 0.12) / 2, (CZ0 + CZ1) / 2, r, CT - 0.12 - FL - 0.2 - 0.04, 16)
        P["saddle"].cylc(sx * 3.7, CT - 0.06, (CZ0 + CZ1) / 2, r + 0.12, 0.12, 16)
    P["saddle"].box(-3.7, 3.7, CT - 0.12, CT, CZ0 - 0.12, CZ1 + 0.12)
    P["gold"].box(-3.7, 3.7, CT - 0.15, CT - 0.04, CZ0 - 0.17, CZ0 - 0.12)
    for i in range(7):
        P["accent"].box(-3.5 + i * 1.0 + 0.1, -3.5 + i * 1.0 + 0.9, 0.55, 1.0, CZ0 - 0.04, CZ0)
    # the hood: a barrel vault of striped boards over the bar, 7.2 m long, narrower than the opening's piers (it stood against them and the side walls before), its springing 3 m up, its front
    # edge inside the screen's plane and low enough to clear the arch
    CZc, R1, R2, Y0 = 13.3, 1.7, 1.82, 3.0
    for i in range(8):
        x0 = -3.6 + i * 0.9 + 0.005
        prof = [(CZc + R2 * math.cos(math.pi * k / 12), Y0 + R2 * math.sin(math.pi * k / 12)) for k in range(13)] + [(CZc + R1 * math.cos(math.pi * (12 - k) / 12), Y0 + R1 * math.sin(math.pi * (12 - k) / 12)) for k in range(13)]
        (P["gold"] if i in (0, 7) else P["accent"] if i % 2 == 0 else P["mint"]).polyx(prof, x0, x0 + 0.89)
    P["gold"].box(-3.6, 3.6, Y0 - 0.02, Y0 + 0.1, CZc - R2 - 0.04, CZc - R2 + 0.12)    # (the vault's front edge: a gold lip, and a row of bulbs)
    for i in range(8):
        P["glowgold"].add(sphere(0.075, 6, 4), t=(-3.15 + i * 0.9, Y0 - 0.1, CZc - R1 + 0.02))
    # pendant lanterns inside the niche
    for x in (-2.6, 2.6):
        P["black2"].bm((x, 5.0, 14.2), (x, 4.2, 14.2), 0.03)
        P["glowgold"].add(sphere(0.24, 10, 8), t=(x, 4.0, 14.2))
        P["gold"].cylc(x, 4.28, 14.2, 0.14, 0.1, 10)
    # the blade sign: a bracket out from the screen's right corner, a black plate with a gold ring and a lit emblem
    BX = 4.55
    P["black2"].bm((BX, 5.6, ZS - 0.01), (BX, 5.6, ZS - 1.7), 0.05)
    P["black2"].bm((BX, 5.3, ZS - 0.01), (BX, 5.6, ZS - 1.2), 0.04)
    P["black"].box(BX - 0.07, BX + 0.07, 4.5, 5.55, ZS - 1.7, ZS - 0.5)
    P["gold"].box(BX - 0.1, BX + 0.1, 4.45, 4.5, ZS - 1.75, ZS - 0.45)
    P["gold"].box(BX - 0.1, BX + 0.1, 5.55, 5.6, ZS - 1.75, ZS - 0.45)
    P["glowgold"].cylc(BX, 5.02, ZS - 1.1, 0.34, 0.3, 14, rot=(0, 0, math.pi / 2))
    return P


# ---- 0: MOON DOGS ----
P = base("dn_stall_0", "MOON DOGS")
P["black2"].box(-2.8, 0.8, CT, CT + 0.14, Z(0.0), Z(0.8))                               # the roller grill: a tray and four rollers
for i in range(4):
    P["saddle2"].cylc(-1.0, CT + 0.22, Z(0.08 + i * 0.2), 0.07, 3.2, 8, rot=(0, 0, PI / 2))
for i in range(3):                                                                      # buns, stacked
    P["saddle"].boxc(1.9, CT + 0.1 + i * 0.2, Z(0.4), 0.9, 0.2, 0.5)
P["gold"].cylc(3.0, CT + 0.25, Z(0.3), 0.1, 0.5, 8)                                     # mustard
P["barn"].cylc(3.4, CT + 0.25, Z(0.3), 0.1, 0.5, 8)                                     # ketchup
P["gold"].cylc(3.0, CT + 0.56, Z(0.3), 0.04, 0.12, 8)
# ---- 1: CRATER FRIES ----
P = base("dn_stall_1", "CRATER FRIES")
for x in (-2.8, -1.6):
    P["black2"].box(x - 0.5, x + 0.5, CT, CT + 0.7, Z(0.0), Z(0.7))                     # a fryer
    P["glowgold"].box(x - 0.4, x + 0.4, CT + 0.7, CT + 0.76, Z(0.1), Z(0.6))            # lit oil
    P["black"].bm((x + 0.4, CT + 0.7, Z(0.35)), (x + 0.4, CT + 1.3, Z(0.8)), 0.04)      # a basket handle
for i in range(5):                                                                      # a rack of paper cones with fries
    x = 0.4 + i * 0.8
    P["mint"].cylc(x, CT + 0.4, Z(0.3), 0.05, 0.6, 8, rt=0.26)
    P["gold"].cylc(x, CT + 0.82, Z(0.3), 0.2, 0.16, 8)
# ---- 2: HE-3 FIZZ ----
P = base("dn_stall_2", "HE-3 FIZZ")
P["black2"].box(-3.2, 0.2, CT, CT + 0.12, Z(0.0), Z(0.7))                               # drip tray
P["black"].box(-3.0, 0.0, CT + 0.12, CT + 1.4, Z(-0.3), Z(0.1))                         # the font
for i in range(5):
    P["gold"].cylc(-2.7 + i * 0.6, CT + 1.05, Z(0.2), 0.06, 0.3, 8, rot=(PI / 2, 0, 0))    # taps
P["gold"].box(-3.05, 0.05, CT + 1.4, CT + 1.52, Z(-0.35), Z(0.15))
for i in range(4):
    P["glowmint"].cylc(1.0 + i * 0.6, CT + 0.45, Z(0.3), 0.17, 0.9, 10)                 # tall glasses, lit
    P["accent"].cylc(1.0 + i * 0.6, CT + 0.95, Z(0.3), 0.19, 0.1, 10)
# ---- 3: CHIMERA CHOW ----
P = base("dn_stall_3", "CHIMERA CHOW")
P["black"].cylc(-1.8, CT + 0.55, Z(0.2), 0.75, 1.1, 14, rt=0.6)                         # a big pot
P["saddle2"].cylc(-1.8, CT + 1.1, Z(0.2), 0.62, 0.06, 14)
P["black2"].bm((-1.0, CT + 1.4, Z(0.2)), (-0.3, CT + 0.7, Z(0.45)), 0.05)               # the ladle
P["black2"].add(sphere(0.14, 8, 6), t=(-0.3, CT + 0.66, Z(0.45)))
for i in range(5):
    P["mint"].cylc(1.6, CT + 0.12 + i * 0.16, Z(0.3), 0.42, 0.14, 12, rt=0.3)           # a stack of bowls
for i in range(3):
    P["money2"].cylc(2.9, CT + 0.12 + i * 0.16, Z(0.3), 0.42, 0.14, 12, rt=0.3)
# ---- 4: ROCK CANDY ----
P = base("dn_stall_4", "ROCK CANDY")
P["saddle"].box(-3.6, 3.6, CT + 0.84, CT + 0.9, Z(0.0), Z(0.7))                         # a shelf for the upper row
for sx in (-1, 1):
    P["black2"].box(sx * 3.6 - 0.05, sx * 3.6 + 0.05, CT, CT + 0.84, Z(0.3), Z(0.4))
for r in range(2):
    for i in range(7):
        x = -3.0 + i * 1.0
        P["glasswarm"].cylc(x, CT + 0.35 + r * 0.9 + (0.0 if r == 0 else 0.0), Z(0.35), 0.26, 0.7, 10)
        (P["accent"] if (i + r) % 2 == 0 else P["gold"]).cylc(x, CT + 0.22 + r * 0.9, Z(0.35), 0.2, 0.4, 7)
        P["gold"].cylc(x, CT + 0.74 + r * 0.9, Z(0.35), 0.28, 0.07, 10)
# ---- 5: TOTE · BETS ----
P = base("dn_stall_5", "TOTE · BETS")
P["black"].box(-1.4, 1.4, CT + 0.6, CT + 2.0, Z(-0.2), Z(-0.4))                         # the tote screen, on two posts
P["glowgold"].box(-1.25, 1.25, CT + 0.75, CT + 1.85, Z(-0.4), Z(-0.42))
for sx in (-1, 1):
    P["black2"].bm((sx * 1.2, CT, Z(-0.3)), (sx * 1.2, CT + 0.6, Z(-0.3)), 0.05)
for x in (-3.0, -2.2, 2.2, 3.0):
    P["black2"].box(x - 0.3, x + 0.3, CT, CT + 0.55, Z(0.0), Z(0.6))                    # terminals
    P["glowmint"].box(x - 0.24, x + 0.24, CT + 0.3, CT + 0.5, Z(0.6), Z(0.62))
for i in range(6):
    P["gold"].box(-0.9 + i * 0.36 - 0.02, -0.9 + i * 0.36 + 0.02, CT, CT + 0.55, Z(0.5), Z(0.54))    # a brass grille
# ---- 6: SPACE SLUSH ----
P = base("dn_stall_6", "SPACE SLUSH")
for i, s in enumerate(("barn", "gold", "money2")):
    x = -2.4 + i * 1.6
    P["black2"].box(x - 0.55, x + 0.55, CT, CT + 0.35, Z(0.0), Z(0.7))
    P["glowmint"].cylc(x, CT + 0.95, Z(0.35), 0.5, 1.2, 14)                             # a lit tank
    P[s].cylc(x, CT + 1.6, Z(0.35), 0.52, 0.12, 14)
    P["gold"].cylc(x, CT + 0.2, Z(0.7), 0.05, 0.3, 8, rot=(PI / 2, 0, 0))               # tap
P["accent"].cylc(3.1, CT + 0.3, Z(0.3), 0.22, 0.6, 10)
# ---- 7: LUNAR COFFEE ----
P = base("dn_stall_7", "LUNAR COFFEE")
P["gold"].box(-3.2, -1.2, CT, CT + 0.9, Z(-0.2), Z(0.5))                                # the espresso machine
P["black2"].box(-3.0, -1.4, CT + 0.9, CT + 1.05, Z(-0.2), Z(0.5))
for x in (-2.7, -1.7):
    P["black"].cylc(x, CT + 0.45, Z(0.55), 0.05, 0.3, 8)
for x in (0.0, 1.0):
    P["saddle2"].cylc(x, CT + 0.7, Z(0.2), 0.4, 1.4, 12)                                # urns
    P["gold"].cylc(x, CT + 1.45, Z(0.2), 0.2, 0.1, 10)
    P["black"].cylc(x, CT + 0.45, Z(0.6), 0.04, 0.3, 8, rot=(PI / 2, 0, 0))
for i in range(6):
    P["mint"].cylc(2.6, CT + 0.1 + i * 0.14, Z(0.4), 0.28, 0.13, 10, rt=0.24)           # a tower of cups
# ---- 8: DERBY DONUTS ----
P = base("dn_stall_8", "DERBY DONUTS")
P["saddle2"].box(-3.0, 3.0, CT, CT + 0.1, Z(0.0), Z(0.6))
for r in range(3):
    for i in range(6):
        x = -2.5 + i * 1.0
        P["saddle"].tor(0.2, 0.08, t=(x, CT + 0.35 + r * 0.45, Z(0.3)), rot=(PI / 2, 0, 0), n=14, rs=6)
        if (i + r) % 2:
            P["mint"].tor(0.19, 0.04, t=(x, CT + 0.41 + r * 0.45, Z(0.3) - 0.0), rot=(PI / 2, 0, 0), n=14, rs=5)
    P["black2"].box(-3.0, 3.0, CT + 0.2 + r * 0.45, CT + 0.24 + r * 0.45, Z(0.0), Z(0.5))
# ---- 9: JOCKEY'S GRILL ----
P = base("dn_stall_9", "JOCKEY'S GRILL")
P["black"].box(-3.2, -0.4, CT, CT + 0.7, Z(0.0), Z(0.8))                                # the grill
P["glowgold"].box(-3.0, -0.6, CT + 0.7, CT + 0.74, Z(0.1), Z(0.7))
P["black2"].cylc(-3.0, CT + 1.6, Z(-0.3), 0.2, 1.8, 8)                                  # a chimney
for i in range(4):
    P["barn"].boxc(0.4 + i * 0.6, CT + 0.15, Z(0.4), 0.5, 0.1, 0.35, rot=(0, 0.25, 0))  # steaks on a rack
P["accent"].cylc(3.3, CT + 0.35, Z(0.4), 0.16, 0.7, 8)
# ---- 10: FOAM FINGERS ---- (the pegboard is on the lit back wall, so no shelves)
P = base("dn_stall_10", "FOAM FINGERS", shelf="none")
P["saddle"].box(-3.3, 3.3, 2.4, 4.7, ZB - 0.2, ZB - 0.09)                               # a pegboard on the lit panel
for i in range(6):
    x = -2.6 + i * 1.04
    P["gold"].cylc(x, 3.75, ZB - 0.3, 0.02, 0.9, 7, rt=0.18)
    P["accent"].cylc(x, 3.3, ZB - 0.3, 0.05, 0.3, 7)
for i in range(4):
    P["barn"].cylc(-2.7 + i * 0.9, CT + 0.15, Z(0.3), 0.3, 0.26, 12, rt=0.2)            # caps on the counter
    P["black2"].boxc(-2.7 + i * 0.9, CT + 0.3, Z(0.6), 0.4, 0.04, 0.2)
P["mint"].box(1.4, 3.6, CT, CT + 0.6, Z(0.0), Z(0.5))                                   # a stack of programmes
P["accent"].box(1.38, 3.62, CT + 0.38, CT + 0.48, Z(-0.02), Z(0.52))
# ---- 11: RAIL BAR ---- (the bottles are on the shelves)
P = base("dn_stall_11", "RAIL BAR", shelf="bottles")
for x in (-2.6, 2.6):
    P["saddle2"].cylc(x, CT + 0.45, Z(0.3), 0.5, 0.9, 12, rt=0.44)                      # barrels
    P["gold"].cylc(x, CT + 0.95, Z(0.3), 0.46, 0.06, 12)
    P["gold"].cylc(x, CT + 0.45, Z(0.8), 0.04, 0.25, 8, rot=(PI / 2, 0, 0))
P["black2"].box(-0.9, 0.9, CT, CT + 0.12, Z(0.0), Z(0.6))

finish_and_export()
