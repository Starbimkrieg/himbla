# Chimera Downs' arcades, gates and forecourt furniture for Blender (4.2+ / 5.x), exported to src/assets/downs-arcade.glb (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_arcade.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_arcade.py
#
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0 with its origin on the ground. One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_arcade     one 6.3 degree wedge of an arcade round a turn, as a bay of a market hall: its inner chord is at z = 0 (84 m from the turn's centre) and its outer wall at z = 15.98 (100 m);
#                 x is tangential, the bay's middle at x = 0. The bay's own fittings: a timber floor, a Mint colonnade column at its left corner, Mint ribs on the roof, pennants under the
#                 fascia, lit windows on the back wall's inner face (z = 15.28), a rafter under the ceiling, two pendant lamps. The parts that run on from bay to bay (the back wall and its
#                 trim, the architrave, the fascia, the roof and its ceiling) are built per run by the game, as single pieces with no seams between bays (arcadeShell in src/downsKit.js);
#                 the roof's underside rises from 7.15 m at z = -0.8 to 8.38 m at z = 16.08, resting on the back wall's cornice (ROOF there and RB below). Neighbouring wedges meet on the
#                 radial lines, so a run of them closes without a gap
#   dn_gate_hall  a gate hall, 32 m across (x) and 22 m deep (z = -11 to 11), +z outward: two Mint blocks with Barn Red hip roofs either side of a 12 m passage under a gabled Barn Red lintel hall,
#                 Black name boards (on both faces, 4.4 m by 2 m, centre 9.3 m up) and lit slits
#   dn_gate_main  the forecourt's gate, 28 m between the outer faces of its pylons (x) and 3 m deep: two Mint pylons 12 m tall with gold bands and lanterns, and a Barn Red segmental arch between
#                 them, the name CHIMERA DOWNS in raised gold letters along the arch's front face (the back is bare)
#   dn_fountain   the forecourt's fountain, 24 m across, built to the casino's measures (src/fountainFx.js shades its water pivots): a Money planter ring, a Mint basin, a Mint bowl on a
#                 pedestal, eight spigots, and a golden derby cup (pivot `trophy`, role spin) turning on the stem
#   dn_bay        a valet bay's head: a wheel stop, two paint lines running 5.6 m toward +z, a post with a gold number plate (0.5 x 0.35, facing +z, centre 0.78 m up)
#   dn_bench      a bench 2.2 m long: Saddle slats on Black legs, gold end caps, facing +z
#   dn_planter    a planter 2.4 x 1 x 0.9 m: Money2 box, a gold edge, a mound of Money
#   dn_festoon    a string of lights 30 m between two points at the same height: x from -15 to 15, hanging 2.2 m at the middle, 25 lit bulbs
DOWNS_OUT = "downs-arcade.glb"
DOWNS_COLL = "MoonDownsArcade"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# =====================================================================================================
# dn_arcade
# =====================================================================================================
RI, RO = 84.0, 100.0
A2 = math.radians(3.15)
WI, WO = RI * math.sin(A2), RO * math.sin(A2)
D = (RO - RI) * math.cos(A2)
hw = lambda z: WI + (WO - WI) * z / D


def trap(z0, z1, shrink=0.0):
    return [(-hw(z0) + shrink, z0), (hw(z0) - shrink, z0), (hw(z1) - shrink, z1), (-hw(z1) + shrink, z1)]


root = pivot("dn_arcade", (0, 0, 0))
P = parts(root, "dn_arcade", {"saddle2": 0.0, "gold": 0.012, "mint": 0.03, "mint2": 0.012, "black": 0.02, "barn": 0.025, "glasswarm": 0.0, "glowgold": 0.0})
YF = 6.6                                                                                # the fascia's middle height (the fascia is the game's, at z -0.92 to -0.68)
RB = lambda z: 7.15 + (z + 0.8) * (8.38 - 7.15) / (D + 0.9)                             # the roof's underside (src/downsKit.js ROOF); the ceiling hangs 7 cm under it
z0, z1 = -0.8, D + 0.2
# floor
P["saddle2"].polyy(trap(0.0, D), 0.0, 0.14)
for x in (-2.6, 2.6):                                                                   # two lit windows on the back wall's inner face (D - 0.7), frames behind the panes
    P["black"].box(x - 1.3, x + 1.3, 5.1, 7.7, D - 0.74, D - 0.7)
    P["glasswarm"].box(x - 1.15, x + 1.15, 5.25, 7.55, D - 0.78, D - 0.74)
    P["black"].box(x - 0.04, x + 0.04, 5.25, 7.55, D - 0.82, D - 0.78)
    P["gold"].box(x - 1.4, x + 1.4, 7.7, 7.88, D - 0.84, D - 0.7)
# the column at the left corner, up into the architrave (6.5 to 7.1)
cx = -WI + 0.55
P["mint2"].cylc(cx, 0.31, 0.55, 0.52, 0.3, 14)
P["mint"].cylc(cx, 0.46 + 3.1, 0.55, 0.36, 6.2, 14, rt=0.3)
P["gold"].cylc(cx, 6.5, 0.55, 0.5, 0.22, 14)
# standing seams on the roof's top (its underside RB, 0.32 thick), tilted with it
zm = (z0 + z1) / 2
ang = -math.atan(RB(1.0) - RB(0.0))
for x in (-2.6, 0.0, 2.6):
    P["mint"].boxc(x, RB(zm) + 0.32 + 0.04, zm, 0.14, 0.12, z1 - z0 - 0.4, rot=(ang, 0, 0))
for i, x in enumerate((-2.2, 2.2)):                                                     # pennants under the fascia's gold lip
    (P["barn"] if i == 0 else P["gold"]).poly([(-0.4, 0), (0.4, 0), (0, -1.0)], z0 - 0.04, z0 + 0.04, t=(x, YF - 0.57, 0))
P["black"].bm((-WI + 0.4, RB(0.6) - 0.15, 0.6), (-WO + 0.5, RB(D - 0.8) - 0.15, D - 0.8), 0.1)   # a rafter from the column to the wall, just under the ceiling
# pendant lamps: a cord from the ceiling, a gold cap, a lit globe
for z in (3.0, 10.0):
    yroof = RB(z) - 0.07
    P["black"].bm((0, yroof, z), (0, yroof - 0.9, z), 0.025)
    P["gold"].cylc(0, yroof - 0.95, z, 0.14, 0.12, 10)
    P["glowgold"].add(sphere(0.26, 12, 8), t=(0, yroof - 1.2, z))

# =====================================================================================================
# dn_gate_hall
# =====================================================================================================
root = pivot("dn_gate_hall", (0, 0, 0))
P = parts(root, "dn_gate_hall", {"mint": 0.05, "mint2": 0.02, "money2": 0.0, "gold": 0.02, "black": 0.025, "barn": 0.035, "glasswarm": 0.0, "saddle2": 0.0})
P["saddle2"].box(-6.0, 6.0, 0.0, 0.14, -11.0, 11.0)                                     # the passage floor
for sx in (-1, 1):
    x0, x1 = (6.0, 16.0) if sx > 0 else (-16.0, -6.0)
    P["mint2"].box(x0 - (0 if sx > 0 else 0.3), x1 + (0.3 if sx > 0 else 0), 0.0, 1.0, -11.3, 11.3)       # plinth
    P["mint"].box(x0, x1, 1.0, 12.0, -11.0, 11.0)                                       # the block
    P["gold"].box(x0 - 0.2, x1 + 0.2, 11.6, 12.4, -11.4, 11.4)                            # cornice
    P["barn"].add(hip(4.0, 8.06, 4.4), t=((x0 + x1) / 2, 12.3 + 2.2, 0), s=(1.0, 1.0, 2.123))   # the hip roof: 11.4 x 24.2 m at the eaves over the 10 x 22 block and its cornice
    P["gold"].bm(((x0 + x1) / 2, 16.6, 0), ((x0 + x1) / 2, 18.4, 0), 0.07)
    P["gold"].add(sphere(0.28, 10, 8), t=((x0 + x1) / 2, 18.6, 0))
    for zf in (-1, 1):                                                                  # lit slits on both faces, frames behind the panes
        a, b = (11.0, 11.04) if zf > 0 else (-11.04, -11.0)
        P["black"].box((x0 + x1) / 2 - 0.9, (x0 + x1) / 2 + 0.9, 4.0, 10.0, a, b)
        c, d = (11.04, 11.07) if zf > 0 else (-11.07, -11.04)
        P["glasswarm"].box((x0 + x1) / 2 - 0.7, (x0 + x1) / 2 + 0.7, 4.2, 9.8, c, d)
    # the passage's wall: Money2 wainscot
    xi = 6.0 if sx > 0 else -6.0
    P["money2"].box(min(xi, xi - sx * 0.12), max(xi, xi - sx * 0.12), 0.14, 2.6, -11.0, 11.0)
# the lintel hall over the passage
P["mint"].box(-6.0, 6.0, 7.5, 11.5, -11.0, 11.0)
P["gold"].box(-6.0, 6.0, 7.2, 7.5, -11.2, 11.2)
P["barn"].poly([(-6.6, 11.5), (6.6, 11.5), (0, 14.6)], -11.3, 11.3)                      # the gabled roof
P["gold"].poly([(-6.7, 11.4), (6.7, 11.4), (6.7, 11.6), (0, 14.8), (-6.7, 11.6)], -11.42, -11.3)    # a gold edge on each gable
P["gold"].poly([(-6.7, 11.4), (6.7, 11.4), (6.7, 11.6), (0, 14.8), (-6.7, 11.6)], 11.3, 11.42)
for zf in (-1, 1):                                                                      # the name board on each face
    a, b = (11.0, 11.2) if zf > 0 else (-11.2, -11.0)
    P["gold"].box(-5.0, 5.0, 8.0, 10.6, a, b)
    c, d = (11.2, 11.26) if zf > 0 else (-11.26, -11.2)
    P["black"].box(-4.8, 4.8, 8.2, 10.4, c, d)

# =====================================================================================================
# dn_gate_main
# =====================================================================================================
root = pivot("dn_gate_main", (0, 0, 0))
P = parts(root, "dn_gate_main", {"mint": 0.05, "mint2": 0.02, "gold": 0.02, "black": 0.025, "barn": 0.035, "glowgold": 0.0})
for sx in (-1, 1):
    x = sx * 12.5
    P["mint2"].boxc(x, 0.4, 0, 3.4, 0.8, 3.4)
    P["mint"].boxc(x, 0.8 + 5.6, 0, 2.8, 11.2, 2.8)
    for y in (3.0, 9.4):
        P["gold"].boxc(x, y, 0, 3.0, 0.5, 3.0)
    P["gold"].boxc(x, 12.1, 0, 3.2, 0.3, 3.2)
    P["mint2"].boxc(x, 12.6, 0, 2.2, 0.7, 2.2)
    P["gold"].bm((x, 12.9, 0), (x, 14.6, 0), 0.07)
    P["gold"].add(sphere(0.3, 10, 8), t=(x, 14.8, 0))
    for zf in (-1, 1):                                                                  # a lantern on each face
        P["black"].boxc(x, 5.6, zf * 1.55, 0.5, 0.9, 0.2)
        P["glowgold"].boxc(x, 5.6, zf * 1.68, 0.36, 0.7, 0.08)
# the arch: a segmental band between the pylons' inner faces (x = +-11.1), spring at y = 9, crown at 12.4 (inner edge)
SPR, CROWN, CHORD = 9.0, 12.4, 11.1
RR = (CHORD ** 2 + (CROWN - SPR) ** 2) / (2 * (CROWN - SPR))
YC = CROWN - RR
HALFANG = math.asin(CHORD / RR)
def arc_band(r_in, r_out, depth, k=1.0, n=16):
    h = HALFANG * k
    pts = [(r_out * math.sin(-h + 2 * h * i / n), YC + r_out * math.cos(-h + 2 * h * i / n)) for i in range(n + 1)]
    pts += [(r_in * math.sin(h - 2 * h * i / n), YC + r_in * math.cos(h - 2 * h * i / n)) for i in range(n + 1)]
    return pts
P["barn"].poly(arc_band(RR, RR + 1.3, 0.9), -0.45, 0.45)
P["gold"].poly(arc_band(RR - 0.08, RR + 0.02, 1.0, 0.99), -0.5, 0.5)                          # gold on the intrados
P["gold"].poly(arc_band(RR + 1.28, RR + 1.42, 1.0, 0.99), -0.5, 0.5)                           # and the extrados
# the name, in raised gold letters along the arch's front band (+z face only: the back says nothing), 0.17 m a pixel, 0.14 m proud of the band
P["gold"].letters_arc("CHIMERA DOWNS", YC, RR + 0.65, 0.17, 0.45, 0.14)

# =====================================================================================================
# dn_fountain
# =====================================================================================================
# The forecourt's fountain: the casino's and Meridian's (build_casino.py) in the Downs' palette, with a golden derby cup turning on top where theirs have the chip and the dollar sign. It is
# built to the same measures because src/fountainFx.js shades its water: pivots `water_basin` and `water_bowl` (role water, tier basin / bowl: the discs the two tiers' ripples run across), `curtain`
# (the sheet spilling over the bowl's lip) and `streams` (eight jets from the spigots), and the `trophy` pivot (role spin) is what turns. The water pivots' slot (glowmint) is not drawn: the game dresses them.
root = pivot("dn_fountain", (0, 0, 0))
P = parts(root, "dn_fountain", {"money2": 0.02, "money": 0.0, "mint2": 0.04, "mint": 0.03, "gold": 0.02, "barn": 0.02, "gold2": 0.02})
P["money2"].lath([(12.0, 0.0), (12.0, 0.7), (10.4, 0.7), (10.4, 0.0)], segs=48)           # the planter ring
P["money"].lath([(10.5, 0.72), (11.9, 0.72)], segs=48)                                    # (its turf, a hair above the rim's inside)
# the basin: a stepped foot, a flared wall with a flat top, a floor, a pilaster every 30 degrees and a gold bead along the lip
P["mint2"].lath([(9.7, 0.0), (9.7, 0.16), (9.32, 0.2), (9.3, 0.5), (9.05, 0.92), (9.15, 0.98), (9.15, 1.04), (8.55, 1.04), (8.55, 0.9), (8.5, 0.3), (8.5, 0.0), (9.7, 0.0)], segs=48)
P["money2"].lath([(0.0, 0.3), (8.5, 0.3)], segs=40)
for i in range(12):
    a = 2 * PI * i / 12
    P["mint"].boxc(math.sin(a) * 9.18, 0.52, math.cos(a) * 9.18, 0.7, 0.62, 0.32, rot=(0, a, 0))
P["gold"].tor(8.85, 0.09, t=(0, 1.05, 0), n=48, rs=5)
for i in range(16):
    a = 2 * PI * (i + 0.5) / 16
    P["gold"].add(sphere(0.1, 5, 3), t=(math.sin(a) * 9.4, 0.7, math.cos(a) * 9.4))
# the pedestal and its bowl (an ogee column over a stepped plinth, a saucer with a gold rim)
P["mint2"].lath([(0, 0.3), (2.5, 0.3), (2.5, 0.6), (2.1, 0.75), (1.7, 1.0), (1.4, 1.5), (1.3, 2.0), (1.3, 3.0), (1.5, 3.4), (1.9, 3.7), (2.6, 3.9), (0, 3.9)], segs=20)
P["mint"].lath([(0, 3.9), (2.6, 3.9), (3.2, 4.05), (3.62, 4.3), (3.72, 4.66), (3.5, 4.66), (3.3, 4.45), (0, 4.4)], segs=28)
P["gold"].tor(1.45, 0.07, t=(0, 1.5, 0), n=24, rs=5)
P["gold"].tor(1.32, 0.06, t=(0, 3.0, 0), n=24, rs=5)
P["gold"].tor(3.6, 0.1, t=(0, 4.68, 0), n=36, rs=5)
for i in range(8):                                                                        # eight studs round the bowl, in Barn Red
    a = 2 * PI * (i + 0.5) / 8
    P["barn"].add(sphere(0.17, 6, 4), t=(math.sin(a) * 3.55, 4.2, math.cos(a) * 3.55), s=(1, 1.3, 1))
# the stem, a gold collar, and eight spigots near the top (under the cup)
P["mint2"].lath([(0, 4.4), (0.9, 4.4), (0.75, 4.75), (0.55, 5.1), (0.5, 5.6), (0.58, 6.0), (0.72, 6.2), (0, 6.2)], segs=16)
P["gold"].tor(0.6, 0.07, t=(0, 6.05, 0), n=16, rs=5)
P["gold"].tor(0.52, 0.06, t=(0, 5.35, 0), n=16, rs=5)
for i in range(8):
    a = 2 * PI * i / 8
    s_, c_ = math.sin(a), math.cos(a)
    P["gold"].path([(s_ * 0.45, 5.78, c_ * 0.45), (s_ * 0.85, 5.73, c_ * 0.85), (s_ * 0.98, 5.71, c_ * 0.98)], [0.08, 0.08, 0.125], 8)   # (a nozzle with a flared mouth)
# the derby cup that turns on the stem: a plinth, a gold stem and knop, a deep cup with a Barn Red band and two handles, 5 m up from the stem's top
K = 1.25
tr = pivot("trophy", (0, 6.2, 0), root, role="spin", speed=0.7, kind="trophy")
T_ = parts(tr, "dn_trophy", {"mint2": 0.03, "gold": 0.03, "gold2": 0.02, "barn": 0.02})
T_["mint2"].cylc(0, 0.2 * K, 0, 1.0 * K, 0.4 * K, 20)                                      # the plinth
T_["gold2"].cylc(0, 0.5 * K, 0, 0.78 * K, 0.22 * K, 20)                                    # its gold collar
T_["gold"].lath([(0.0, 0.6 * K), (0.4 * K, 0.6 * K), (0.22 * K, 0.95 * K), (0.18 * K, 1.3 * K), (0.0, 1.3 * K)], segs=16)      # the stem
T_["gold"].add(sphere(0.32 * K, 12, 8), t=(0, 1.15 * K, 0))                                # the knop
T_["gold"].lath([(0.0, 1.5 * K), (0.34 * K, 1.5 * K), (0.9 * K, 1.9 * K), (1.22 * K, 2.7 * K), (1.28 * K, 3.3 * K), (1.2 * K, 3.8 * K), (1.04 * K, 3.8 * K), (1.1 * K, 3.3 * K), (1.04 * K, 2.75 * K), (0.7 * K, 2.05 * K), (0.0, 1.85 * K)], segs=28)    # the cup
for sx in (-1, 1):
    T_["gold"].tor(0.55 * K, 0.085 * K, t=(sx * 1.32 * K, 2.95 * K, 0), rot=(PI / 2, 0, 0), n=20, rs=6)                       # a handle each side
T_["barn"].tor(1.265 * K, 0.07 * K, t=(0, 3.05 * K, 0), n=32, rs=5)                         # the band round the cup
T_["gold2"].tor(1.18 * K, 0.05 * K, t=(0, 3.78 * K, 0), n=32, rs=5)                         # the lip's bead
# the water: discs for the two tiers (the game ripples them), the sheet falling from the bowl's lip, and the jets from the spigots. Both faces: the game's shaders draw one side only.
def two_sided(a, geo):
    a.geos.append(xf(geo[:2], (0, 0, 0)))
    a.geos.append((geo[0], [tuple(reversed(f)) for f in geo[1]]))
w1 = pivot("water_basin", (0, 0.72, 0), root, role="water", tier="basin")
two_sided(Acc("dn_waterBasin", "glowmint", w1, 0.0), lathe([(0, 0), (8.5, 0)], 48))
w2 = pivot("water_bowl", (0, 4.52, 0), root, role="water", tier="bowl")
two_sided(Acc("dn_waterBowl", "glowmint", w2, 0.0), lathe([(0, 0), (3.36, 0)], 32))
cu = pivot("curtain", (0, 0, 0), root, role="curtain")
two_sided(Acc("dn_curtainSheet", "glowmint", cu, 0.0), lathe([(3.76, 4.6), (3.84, 4.0), (3.92, 3.0), (4.0, 2.0), (4.05, 1.2), (4.07, 0.74)], 40))
st = pivot("streams", (0, 0, 0), root, role="streams")
A_ = Acc("dn_streamArcs", "glowmint", st, 0.0)
for i in range(8):
    a = 2 * PI * i / 8
    s_, c_ = math.sin(a), math.cos(a)
    pts = []
    for k in range(11):
        t = k / 10
        r = 1.0 + 1.55 * t
        y = 5.7 - 1.18 * t * t
        pts.append((s_ * r, y, c_ * r))
    A_.path(pts, 0.065, 5)

# =====================================================================================================
# dn_bay
# =====================================================================================================
root = pivot("dn_bay", (0, 0, 0))
P = parts(root, "dn_bay", {"barn": 0.015, "saddle2": 0.0, "black2": 0.012, "gold": 0.012})
P["barn"].box(-1.1, 1.1, 0.0, 0.14, 0.0, 0.3)                                             # the wheel stop
for sx in (-1, 1):
    P["saddle2"].box(sx * 1.4 - 0.07, sx * 1.4 + 0.07, 0.0, 0.015, 0.0, 5.6)             # the paint lines (brown on the pale paving)
P["saddle2"].box(-1.4, 1.4, 0.0, 0.015, 5.53, 5.6)
P["black2"].box(-0.04, 0.04, 0.0, 0.7, -0.5, -0.42)                                      # a post behind the stop
P["gold"].box(-0.25, 0.25, 0.6, 0.95, -0.42, -0.38)                                      # the number plate (facing +z toward the car)

# =====================================================================================================
# dn_bench
# =====================================================================================================
root = pivot("dn_bench", (0, 0, 0))
P = parts(root, "dn_bench", {"saddle": 0.015, "black2": 0.012, "gold": 0.01})
for i in range(4):
    P["saddle"].box(-1.1, 1.1, 0.42, 0.48, -0.25 + i * 0.13, -0.15 + i * 0.13)           # the seat slats
for i in range(3):
    P["saddle"].boxc(0, 0.62 + i * 0.16, -0.3, 2.2, 0.1, 0.05, rot=(-0.15, 0, 0))       # the back slats, raked
for sx in (-1, 1):
    P["black2"].box(sx * 1.0 - 0.04, sx * 1.0 + 0.04, 0.0, 0.42, -0.25, 0.25)           # legs
    P["black2"].box(sx * 1.0 - 0.04, sx * 1.0 + 0.04, 0.42, 1.0, -0.36, -0.3)
    P["gold"].box(sx * 1.1 - (0.0 if sx > 0 else 0.06), sx * 1.1 + (0.06 if sx > 0 else 0), 0.4, 0.55, -0.27, 0.27)    # end caps

# =====================================================================================================
# dn_planter
# =====================================================================================================
root = pivot("dn_planter", (0, 0, 0))
P = parts(root, "dn_planter", {"money2": 0.02, "gold": 0.012, "money": 0.012})
P["money2"].box(-1.2, 1.2, 0.0, 0.9, -0.5, 0.5)
P["gold"].box(-1.26, 1.26, 0.8, 0.92, -0.56, 0.56)
for i, (x, r) in enumerate(((-0.6, 0.42), (0.1, 0.5), (0.75, 0.36))):
    P["money"].add(sphere(r, 10, 8), t=(x, 0.95, 0.0))

# =====================================================================================================
# dn_festoon
# =====================================================================================================
root = pivot("dn_festoon", (0, 0, 0))
P = parts(root, "dn_festoon", {"black2": 0.0, "glowgold": 0.0})
SAG, SPAN, NB = 2.2, 30.0, 25
cat = lambda x: -SAG * (1 - (x / (SPAN / 2)) ** 2)
P["black2"].path([(-15 + SPAN * i / 40, cat(-15 + SPAN * i / 40), 0) for i in range(41)], 0.03, 4)
for i in range(NB):
    x = -14.4 + i * 1.2
    P["glowgold"].add(sphere(0.1, 8, 6), t=(x, cat(x) - 0.14, 0))

finish_and_export()
