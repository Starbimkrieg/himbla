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
#   dn_gate_hall  a gate hall, 32 m across (x) and 22 m deep (z = -11 to 11), +z outward, finished alike on both faces: two Mint towers (x = +-6 to +-16) either side of a 12 m passage,
#                 each on a Mint2 plinth with a rusticated base, a gold string course, Mint2 pilasters with gold capitals, tall lit windows with sills, hoods and pediments, a gold belt,
#                 an attic of small windows, a three-step cornice and a Barn Red hip roof with gold cresting and finials. Between them, set 0.6 m back (faces at z = +-10.4), the arch block:
#                 a segmental vault over the passage (springing 5 m up on the towers' inner faces, crown 7.3 m), a gold archivolt and a Mint2 keystone, the Black name board (9.6 x 2 m,
#                 centre 9.7 m up, front at z = +-10.65), a cornice, and a pediment with a gold raking cornice and a golden horseshoe under a Barn Red gable roof. The passage is lined
#                 the same on both walls: a Money2 wainscot, the gold string course as its rail, a Mint2 impost under the vault, gold ribs, four lamps a wall and four pendants
#   dn_bench      a bench for two runners side by side (tools/blender/build_runner.py: hip 0.95 m up, knee 0.45 m in front of it and 0.53 m off the floor, 0.72 m across the hips,
#                 1.39 m across the shoulder pads): 3.2 m long, the seat 0.44 m up and 0.58 m deep, a backrest raked 13 degrees to 1.18 m, Saddle slats on Black2 cheeks with
#                 armrests and a centre support, gold medallions, facing +z (its back at z = -0.6, its front at 0.33); stands on y = 0, so the game sets it on the floor it stands on
#   dn_gate_main  the forecourt's gate, 28 m between the outer faces of its pylons (x) and 3 m deep: two Mint pylons 12 m tall with gold bands and lanterns, and a Barn Red segmental arch between
#                 them, the name CHIMERA DOWNS in raised gold letters along the arch's front face (the back is bare)
#   dn_fountain   the forecourt's fountain, 24 m across, built to the casino's measures (src/fountainFx.js shades its water pivots): a Money planter ring, a Mint basin, a Mint bowl on a
#                 pedestal, eight spigots, and a golden derby cup (pivot `trophy`, role spin) turning on the stem
#   dn_bay        a valet bay's head: a wheel stop, two paint lines running 5.6 m toward +z, a post with a gold number plate (0.5 x 0.35, facing +z, centre 0.78 m up)
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
P["saddle2"].polyy(trap(0.0, D - 0.35), 0.0, 0.14)                                    # (its back edge inside the back wall, which stands from under the ground)
for x in (-2.6, 2.6):                                                                   # two lit windows on the back wall's inner face (D - 0.7), frames behind the panes
    P["black"].box(x - 1.3, x + 1.3, 5.1, 7.7, D - 0.74, D - 0.7)
    P["glasswarm"].box(x - 1.15, x + 1.15, 5.25, 7.55, D - 0.78, D - 0.74)
    P["black"].box(x - 0.04, x + 0.04, 5.25, 7.55, D - 0.82, D - 0.78)
    P["gold"].box(x - 1.4, x + 1.4, 7.7, 7.88, D - 0.84, D - 0.7)
# the column at the left corner, up into the architrave (6.5 to 7.1)
cx = -WI + 0.55
P["mint2"].cylc(cx, 0.30, 0.55, 0.52, 0.34, 14)                                        # (its base from 1 cm under the floor's top to 1 cm up the shaft: it stood 2 cm clear of the floor)
P["mint"].cylc(cx, 0.46 + 3.1, 0.55, 0.36, 6.2, 14, rt=0.3)
P["gold"].cylc(cx, 6.5, 0.55, 0.5, 0.22, 14)
# standing seams on the roof's top (its underside RB, 0.32 thick), tilted with it
zm = (z0 + z1) / 2
ang = -math.atan(RB(1.0) - RB(0.0))
for x in (-2.6, 0.0, 2.6):
    P["mint"].boxc(x, RB(zm) + 0.32 + 0.04, zm, 0.14, 0.12, z1 - z0 - 0.4, rot=(ang, 0, 0))
for i, x in enumerate((-2.2, 2.2)):                                                     # pennants under the fascia's gold lip (6.05 to 6.15), their tops 2 cm up into it (they hung 2 cm under it)
    (P["barn"] if i == 0 else P["gold"]).poly([(-0.4, 0), (0.4, 0), (0, -1.0)], z0 - 0.04, z0 + 0.04, t=(x, YF - 0.53, 0))
P["black"].bm((-WI + 0.4, RB(0.6) - 0.15, 0.6), (-WO + 0.25, RB(D - 0.8) - 0.15, D - 0.8), 0.1)  # a rafter from the column to the wall, just under the ceiling (its end 0.25 m
# off the wedge's edge: in the wedges beside a gate the tower's side crosses this corner, and at 0.5 m off it the rafter ran out of the tower's face at a graze, 6 cm proud)
# pendant lamps: a cord from the ceiling, a gold cap, a lit globe
for z in (3.0, 10.0):
    yroof = RB(z) - 0.07
    P["black"].bm((0, yroof, z), (0, yroof - 0.9, z), 0.025)
    P["gold"].cylc(0, yroof - 0.95, z, 0.14, 0.12, 10)
    P["glowgold"].add(sphere(0.26, 12, 8), t=(0, yroof - 1.2, z))

# =====================================================================================================
# dn_gate_hall
# =====================================================================================================
# An entrance pavilion: two towers and the arch block between them, built so that no outline shows where two pieces meet (style.md, "Ink"). The arch block stands 0.6 m back
# between the towers and runs 0.1 m into each, so its faces meet theirs only in inside corners (the old lintel hall's faces were flush with the blocks' and its outline drew a
# line down each joint); its vault and its gable are the same solid. Every trim either wraps a tower whole (plinth, the four rusticated courses, string course, belt, the three
# steps of the cornice), steps out 5 cm or more from what it sits on, or runs on into a tower or a bigger trim; the archivolt, each rib, the raking cornice and the gable roof are
# single solids. Hidden faces of touching pieces of different slots lie on different planes (audit_coplanar): the buried backs are 8 cm (Black), 10 cm (Mint2), 12 cm (Gold) in.
# The arcade runs (src/downsKit.js arcadeShell) end on their radial lines at local x 13 to 15.7, inside the towers' 16 m sides, and the arcade's roof meets those sides below 8.9 m,
# under the side windows' sills.
root = pivot("dn_gate_hall", (0, 0, 0))
P = parts(root, "dn_gate_hall", {"mint": 0.05, "mint2": 0.02, "money2": 0.012, "gold": 0.02, "black": 0.025, "barn": 0.035, "glasswarm": 0.0, "glowgold": 0.0, "saddle2": 0.0})
PS = Acc("dn_gate_hall_lampMetal", "black", root, 0.012)                                # the lamps' metal (a small fitting's ink)
PF = Acc("dn_gate_hall_glazingBars", "black", root, 0.0)                                # glazing bars, 5 mm proud of the panes
GF = Acc("dn_gate_hall_floorInlay", "gold", root, 0.0)                                  # the floor's inlays, 5 mm proud of the boards
JN = Acc("dn_gate_hall_baseJoints", "mint", root, 0.0)                                # the rusticated base's joints, flush bands 5 mm proud of it
TF, CF, TU0, TU1 = 11.0, 10.4, 6.0, 16.0                                                # the towers' faces (z = +-11) and the arch block's (+-10.4); the towers' inner and outer sides (|x|)
SPR, CR = 5.0, 7.3                                                                      # the vault springs 5 m up on the towers' inner faces and rises to 7.3 m: a segmental arch
AR = (TU0 ** 2 + (CR - SPR) ** 2) / (2 * (CR - SPR))
AY = CR - AR                                                                            # (its radius and the height of its centre)
GY0, GY1, GX = 11.7, 14.4, 6.1                                                          # the gable: 11.7 m where it enters the towers (|x| = 6.1) to 14.4 m at the ridge
G = lambda x: GY0 + (GX - abs(x)) * (GY1 - GY0) / GX


def onz(zf, F, sx=1):
    """box spans on the face z = zf * F: u along it (x = sx * u), v up, o out of it (- into the wall)"""
    return lambda u0, u1, v0, v1, o0, o1: (sx * u0, sx * u1, v0, v1, zf * (F + o0), zf * (F + o1))


def onx(xs, F, d):
    """the same on the face x = xs * F, whose outside is toward d * x (u along z)"""
    return lambda u0, u1, v0, v1, o0, o1: (xs * F + d * o0, xs * F + d * o1, v0, v1, u0, u1)


def arc(r_in, r_out, a0, n=24):
    """a band round the vault's centre (0, AY) from radius r_in to r_out, between the angles -a0 and a0 from the vertical"""
    o = [(r_out * math.sin(-a0 + 2 * a0 * i / n), AY + r_out * math.cos(-a0 + 2 * a0 * i / n)) for i in range(n + 1)]
    return o + [(r_in * math.sin(a0 - 2 * a0 * i / n), AY + r_in * math.cos(a0 - 2 * a0 * i / n)) for i in range(n + 1)]


def chevron(x0, lo, hi):
    """a band along the gable from x = -x0 to x0, from G + lo up to G + hi, in one piece over the ridge (the gable roof, the raking cornice)"""
    return [(-x0, G(x0) + lo), (0, GY1 + lo), (x0, G(x0) + lo), (x0, G(x0) + hi), (0, GY1 + hi), (-x0, G(x0) + hi)]


def hiproof(a, b, h):
    """a hip roof on a 2a x 2b rectangle (b > a), every face at one pitch: the ridge h up and 2 (b - a) long, along z"""
    r = b - a
    return [(-a, 0, -b), (a, 0, -b), (a, 0, b), (-a, 0, b), (0, h, -r), (0, h, r)], [(0, 4, 1), (1, 4, 5, 2), (2, 5, 3), (3, 5, 4, 0), (0, 1, 2, 3)]


def window(face, uc, w, v0, v1):
    """a tall lit window: a Mint2 sill, a Black frame 0.1 m proud, the pane 5 mm proud of the frame with a bar and a transom 5 mm proud of it, a gold hood"""
    P["mint2"].box(*face(uc - w / 2 - 0.25, uc + w / 2 + 0.25, v0 - 0.3, v0, -0.10, 0.30))
    P["black"].box(*face(uc - w / 2, uc + w / 2, v0, v1, -0.08, 0.10))
    P["glasswarm"].box(*face(uc - w / 2 + 0.2, uc + w / 2 - 0.2, v0 + 0.2, v1 - 0.2, 0.09, 0.105))
    vt = v0 + 0.2 + 0.7 * (v1 - v0 - 0.4)
    PF.box(*face(uc - 0.04, uc + 0.04, v0 + 0.21, v1 - 0.21, 0.098, 0.11))                 # (the bars stop 1 cm inside the pane, off its edges' planes)
    PF.box(*face(uc - w / 2 + 0.21, uc + w / 2 - 0.21, vt - 0.04, vt + 0.04, 0.098, 0.11))
    P["gold"].box(*face(uc - w / 2 - 0.25, uc + w / 2 + 0.25, v1, v1 + 0.25, -0.12, 0.28))


def attic(face, uc):
    """a small attic window over the belt: a sill, a frame 8 cm proud, its pane and a bar"""
    P["mint2"].box(*face(uc - 0.55, uc + 0.55, 11.9, 12.05, -0.10, 0.18))
    P["black"].box(*face(uc - 0.45, uc + 0.45, 12.05, 12.95, -0.08, 0.08))
    P["glasswarm"].box(*face(uc - 0.33, uc + 0.33, 12.17, 12.83, 0.07, 0.085))
    PF.box(*face(uc - 0.03, uc + 0.03, 12.18, 12.82, 0.078, 0.09))


# the passage: a timber floor between the towers' plinths, a gold inlay under each face of the arch block
P["saddle2"].box(-5.75, 5.75, 0.0, 0.14, -TF, TF)
for zf in (-1, 1):
    GF.box(-5.7, 5.7, 0.13, 0.145, zf * CF - 0.15, zf * CF + 0.15)
for sx in (-1, 1):
    # the tower on its plinth, with a rusticated base (one block round the whole tower 8 cm proud of its wall, its three joints flush Mint bands: recessed joints between separately
    # outlined courses showed the lower course's outline as a sliver in each joint, which broke up into a dashed line at any distance), the string course, the belt (at the arch
    # block's cornice), and the cornice: a Mint2 bed, a deep gold corona and a Mint2 cymatium, all bands round the tower
    P["mint2"].box(sx * 5.75, sx * 16.25, 0.0, 0.6, -11.25, 11.25)
    P["mint2"].box(sx * 5.92, sx * 16.08, 0.6, 3.42, -11.08, 11.08)
    for y0 in (1.29, 2.0, 2.71):
        JN.box(sx * 5.915, sx * 16.085, y0, y0 + 0.06, -11.085, 11.085)
    P["mint"].box(sx * TU0, sx * TU1, 0.3, 14.0, -TF, TF)
    P["gold"].box(sx * 5.80, sx * 16.20, 3.42, 3.72, -11.20, 11.20)                       # (20 cm proud of the wall: 8 cm over the passage's wainscot, 12 cm over the courses)
    P["gold"].box(sx * 5.6, sx * 16.4, 11.25, 11.7, -11.4, 11.4)
    P["mint2"].box(sx * 5.75, sx * 16.25, 13.2, 13.5, -11.25, 11.25)
    P["gold"].box(sx * 5.55, sx * 16.45, 13.5, 13.95, -11.45, 11.45)
    P["mint2"].box(sx * 5.65, sx * 16.35, 13.95, 14.25, -11.35, 11.35)
    # the hip roof, its foot in the cymatium and its eaves 0.2 m out over it, gold cresting along the ridge and a finial at each end
    P["barn"].add(hiproof(5.55, 11.55, 4.2), t=(sx * 11.0, 14.15, 0))
    P["gold"].box(sx * 10.91, sx * 11.09, 18.27, 18.47, -6.0, 6.0)
    for zr in (-6.0, 6.0):
        P["gold"].bm((sx * 11.0, 18.3, zr), (sx * 11.0, 19.5, zr), 0.06)
        P["gold"].add(sphere(0.22, 10, 8), t=(sx * 11.0, 19.68, zr))
    for zf in (-1, 1):                                                                  # the track face and the outer face, alike
        f = onz(zf, TF, sx)
        for u0, u1 in ((6.3, 7.2), (14.8, 15.7)):                                       # a pilaster near each corner: a base on the string course, the shaft, a gold capital under the belt
            P["mint2"].box(*f(u0 - 0.1, u1 + 0.1, 3.72, 4.15, -0.10, 0.30))
            P["mint2"].box(*f(u0, u1, 4.05, 10.95, -0.10, 0.22))
            P["gold"].box(*f(u0 - 0.1, u1 + 0.1, 10.85, 11.25, -0.12, 0.32))
        window(f, 11.0, 2.8, 5.1, 9.9)
        P["mint2"].poly([(sx * 9.5, 10.15), (sx * 12.5, 10.15), (sx * 11.0, 10.7)], *sorted((zf * (TF - 0.10), zf * (TF + 0.20))))   # a pediment on the hood
        for uc in (8.6, 11.0, 13.4):
            attic(f, uc)
        # a lantern each side of the passage, on the pilaster: a backplate, an arm and its strut, a base, the lit body, a cap and a gold finial
        PS.box(*f(6.55, 6.95, 5.0, 5.9, 0.12, 0.30))
        PS.bm((sx * 6.75, 5.29, zf * (TF + 0.26)), (sx * 6.75, 5.29, zf * (TF + 0.86)), 0.035)
        PS.bm((sx * 6.75, 5.06, zf * (TF + 0.27)), (sx * 6.75, 5.27, zf * (TF + 0.6)), 0.025)
        PS.box(*f(6.55, 6.95, 5.25, 5.33, 0.65, 1.05))
        P["glowgold"].box(*f(6.6, 6.9, 5.33, 5.93, 0.7, 1.0))
        PS.add(cylinder(0.06, 0.3, 0.25, 4), t=(sx * 6.75, 6.055, zf * (TF + 0.85)), rot=(0, PI / 4, 0))
        P["gold"].add(sphere(0.05, 8, 6), t=(sx * 6.75, 6.22, zf * (TF + 0.85)))
    fa = onx(sx, TU1, sx)                                                               # the side over the arcade: two windows above its roof, three in the attic
    for uc in (-4.0, 4.0):
        window(fa, uc, 1.9, 9.25, 10.85)
    for uc in (-6.0, 0.0, 6.0):
        attic(fa, uc)
    # the passage's side of the tower, lined alike on both: a Money2 wainscot from the plinth up into the string course (4 cm proud of the courses, its back 3 cm into them; the string course stands 8 cm proud of it),
    # a Mint2 impost under the vault's springing, and four lamps (a backplate, an arm, a gold cup, a lit globe)
    fp = onx(sx, TU0, -sx)
    P["money2"].box(*fp(-CF, CF, 0.55, 3.5, 0.05, 0.12))
    P["mint2"].box(*fp(-10.75, 10.75, 4.65, SPR, -0.14, 0.18))                          # (its back 4 cm past the arch block's side)
    for z in (-8.0, -2.7, 2.7, 8.0):
        PS.box(*fp(z - 0.12, z + 0.12, 3.85, 4.5, -0.07, 0.07))
        PS.bm((sx * 5.97, 4.08, z), (sx * 5.5, 4.08, z), 0.025)                            # (the arm ends in the cup's middle, its round 5 mm inside the cup's top and foot)
        P["gold"].cylc(sx * 5.5, 4.08, z, 0.11, 0.06, 10)
        P["glowgold"].add(sphere(0.16, 12, 8), t=(sx * 5.5, 4.22, z))

# the arch block: one solid from the vault to the gable, its sides 0.1 m into the towers
yA = AY + math.sqrt(AR ** 2 - GX ** 2)
a1 = math.asin(GX / AR)
P["mint"].poly([(GX, yA), (GX, GY0), (0, GY1), (-GX, GY0), (-GX, yA)] + [(AR * math.sin(-a1 + 2 * a1 * i / 24), AY + AR * math.cos(-a1 + 2 * a1 * i / 24)) for i in range(1, 24)], -CF, CF)
P["barn"].poly(chevron(6.2, -0.05, 0.30), -10.95, 10.95)                                # the gable roof, 0.55 m out over each face (inside the towers' faces), its foot in the towers
P["gold"].box(-0.09, 0.09, GY1 + 0.22, GY1 + 0.44, -10.85, 10.85)                       # its cresting, ending 10 cm inside the roof's ends, through the acroteria
a0 = math.asin(6.2 / (AR - 0.12))                                                       # (the arcs end where their inner edge is 0.2 m into the towers, on the impost)
for zc in (-5.4, 0.0, 5.4):                                                             # gold ribs across the vault, 12 cm deep under it
    P["gold"].poly(arc(AR - 0.12, AR + 0.10, a0), zc - 0.175, zc + 0.175)
for z in (-8.0, -2.7, 2.7, 8.0):                                                        # pendants from the crown: a chain, a gold cap, a lit globe
    PS.bm((0, CR + 0.15, z), (0, CR - 0.75, z), 0.025)
    P["gold"].cylc(0, CR - 0.8, z, 0.15, 0.12, 10)
    P["glowgold"].add(sphere(0.28, 12, 8), t=(0, CR - 1.06, z))
for zf in (-1, 1):                                                                      # each face of the arch block
    fc = onz(zf, CF)
    zs = lambda o0, o1: sorted((zf * (CF + o0), zf * (CF + o1)))
    P["gold"].poly(arc(AR - 0.12, AR + 0.55, a0), *zs(-0.12, 0.15))                     # the archivolt, its lip 12 cm under the vault
    P["mint2"].poly([(-0.3, CR - 0.22), (0.3, CR - 0.22), (0.46, CR + 0.95), (-0.46, CR + 0.95)], *zs(-0.22, 0.30))   # the keystone, 15 cm proud of the archivolt
    # (and 10 cm deeper into the passage than its back: the keystone hangs 10 cm under the archivolt's lip, and with its back 2 cm behind the archivolt's the two outlines doubled)
    P["gold"].box(*fc(-5.0, 5.0, 8.5, 10.9, -0.12, 0.20))                               # the name board's frame
    P["black"].box(*fc(-4.8, 4.8, 8.7, 10.7, 0.18, 0.25))                               # the board (the game letters it 1 cm in front, at z = +-10.66)
    P["mint2"].box(*fc(-6.25, 6.25, 11.05, 11.35, -0.10, 0.25))                             # the cornice: a Mint2 bed and a gold corona, its foot 20 cm under the towers' belt's foot
    P["gold"].box(*fc(-6.3, 6.3, 11.35, 11.85, -0.12, 0.50))                             # and its top 15 cm over the belt's (their outlines step well apart); the ends in the towers
    P["gold"].poly(chevron(6.3, -0.38, 0.03), *zs(-0.12, 0.35))                         # the raking cornice, under the roof's overhang, its top in the roof
    # a golden horseshoe in the tympanum, open at the top (for luck), its heels capped; and an acroterion on the gable
    P["gold"].add(torus_partial(0.62, 0.12, 8, 20, math.radians(300)), t=(0, 12.75, zf * (CF + 0.09)), rot=(0, 0, math.radians(120)))
    for ang in (60, 120):
        P["gold"].add(sphere(0.16, 10, 6), t=(0.62 * math.cos(math.radians(ang)), 12.75 + 0.62 * math.sin(math.radians(ang)), zf * (CF + 0.09)))
    P["gold"].bm((0, GY1 + 0.15, zf * 10.8), (0, GY1 + 0.9, zf * 10.8), 0.06)
    P["gold"].add(sphere(0.22, 10, 8), t=(0, GY1 + 1.05, zf * 10.8))

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
    for zf in (-1, 1):                                                                  # a lantern on each face: its housing 10 cm into the pylon (it stood 5 cm off it), the lit pane 5 mm proud
        P["black"].boxc(x, 5.6, zf * 1.475, 0.5, 0.9, 0.35)
        P["glowgold"].boxc(x, 5.6, zf * 1.6375, 0.36, 0.7, 0.035)
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
# the name, in raised gold letters along the arch's front band (+z face only: the back says nothing), 0.17 m a pixel, 0.14 m proud of the band. The letters are one solid (not
# a box a pixel, as Acc.letters_arc makes them): the pixels share their corners and only a letter's outer edges have sides, so no outline is drawn between two pixels of a letter.
def letters_arc_solid(acc, text, yc, rm, pix, z, depth):
    px, w = letter_pixels(text)
    cells = set(px)
    index, verts, faces = {}, [], []

    def v(i, j, s):                                     # corner (i, j) of the pixel grid (cell (c, r) has corners (c, r) to (c + 1, r + 1)), on the back (s = 0) or front face
        if (i, j, s) not in index:
            th = (i - 0.5 - (w - 1) / 2) * pix / rm
            rad = rm + (3.5 - j) * pix
            index[(i, j, s)] = len(verts)
            verts.append((rad * math.sin(th), yc + rad * math.cos(th), z + s * depth))
        return index[(i, j, s)]
    for c, r in cells:
        faces.append((v(c, r, 1), v(c + 1, r, 1), v(c + 1, r + 1, 1), v(c, r + 1, 1)))
        faces.append((v(c, r + 1, 0), v(c + 1, r + 1, 0), v(c + 1, r, 0), v(c, r, 0)))
        for (a, b), nb in ((((c, r), (c + 1, r)), (c, r - 1)), (((c + 1, r), (c + 1, r + 1)), (c + 1, r)), (((c + 1, r + 1), (c, r + 1)), (c, r + 1)), (((c, r + 1), (c, r)), (c - 1, r))):
            if nb not in cells:
                faces.append((v(*a, 0), v(*b, 0), v(*b, 1), v(*a, 1)))
    acc.geos.append((verts, faces))


letters_arc_solid(P["gold"], "CHIMERA DOWNS", YC, RR + 0.65, 0.17, 0.45, 0.14)

# =====================================================================================================
# dn_fountain
# =====================================================================================================
# The forecourt's fountain: the casino's and Meridian's (build_casino.py) in the Downs' palette, with a golden derby cup turning on top where theirs have the chip and the dollar sign. It is
# built to the same measures because src/fountainFx.js shades its water: pivots `water_basin` and `water_bowl` (role water, tier basin / bowl: the discs the two tiers' ripples run across), `curtain`
# (the sheet spilling over the bowl's lip) and `streams` (eight jets from the spigots), and the `trophy` pivot (role spin) is what turns. The water pivots' slot (glowmint) is not drawn: the game dresses them.
root = pivot("dn_fountain", (0, 0, 0))
P = parts(root, "dn_fountain", {"money2": 0.02, "money": 0.0, "mint2": 0.04, "mint": 0.03, "gold": 0.02, "barn": 0.02, "gold2": 0.02})
P["money2"].lath([(12.0, 0.0), (12.0, 0.7), (10.4, 0.7), (10.4, 0.0)], segs=48)           # the planter ring
P["money"].lath([(10.5, 0.706), (11.9, 0.706)], segs=48)                                  # (its turf, 6 mm above the rim's inside: at 2 cm it floated)
# the basin: a stepped foot, a flared wall with a flat top, a floor, a pilaster every 30 degrees and a gold bead along the lip
P["mint2"].lath([(9.7, 0.0), (9.7, 0.16), (9.32, 0.2), (9.3, 0.5), (9.05, 0.92), (9.15, 0.98), (9.15, 1.04), (8.55, 1.04), (8.55, 0.9), (8.5, 0.3), (8.5, 0.0), (9.7, 0.0)], segs=48)
P["money2"].lath([(0.0, 0.3), (8.5, 0.3)], segs=40)
for i in range(12):
    a = 2 * PI * i / 12
    P["mint"].boxc(math.sin(a) * 9.18, 0.50, math.cos(a) * 9.18, 0.7, 0.68, 0.32, rot=(0, a, 0))   # (from 0.16, 4 cm into the foot's step: at 0.21 it stood just clear of it)
P["gold"].tor(8.85, 0.09, t=(0, 1.05, 0), n=48, rs=5)
for i in range(16):                                                                       # gold studs between the pilasters, 4 cm into the wall (at r 9.4 they hung 12 cm off it)
    a = 2 * PI * (i + 0.5) / 16
    P["gold"].add(sphere(0.1, 5, 3), t=(math.sin(a) * 9.24, 0.7, math.cos(a) * 9.24))
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
T_["gold"].add(sphere(0.32 * K, 12, 8), t=(0, 1.2 * K, 0))                                 # the knop, its top 2.5 cm into the cup's foot (at 1.15 the cup floated over it)
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
# Sized for the courier (build_runner.py, drawn at full size in the game): seated with its shins upright its knees are 0.53 m off the floor and 0.45 m in front of its hip
# joints, its thighs 0.15 m deep under them, so the seat is 0.44 m up (the thighs slope a little to the knee) and 0.58 m deep (the knee clears the front edge by about 0.1 m;
# with its pack, 0.5 m behind its spine, against the backrest it sits 0.1 m further forward). It is 0.72 m across the hips, 1.14 m across the arms and 1.39 m across the shoulder
# pads (those ride above the cheeks), so two sit side by side 1.5 m apart in the 2.92 m between the cheeks, their arms 0.14 m clear of them. The backrest leans 13 degrees, its
# four slats from 0.56 to 1.18 m: behind a seated runner's back and pack (its hip joints 0.59 m up, its shoulders 0.85 m above them). It stands on y = 0; the game sets it on its
# floor. Each cheek and the centre support is one solid (its legs, seat rail, armrest and back post), the slats run through them and 6 cm past the cheeks, and the front slat
# stops 3 cm short of the cheeks' front edge so the two faces never share a plane.
root = pivot("dn_bench", (0, 0, 0))
P = parts(root, "dn_bench", {"saddle": 0.015, "black2": 0.015, "gold": 0.01})
SEAT = 0.44
LZ = lambda y: -0.33 - (y - SEAT) * 0.15 / 0.66                                         # the backrest's line (z at height y): its slats lie on it, the back posts behind it
RAKE = math.atan(0.15 / 0.66)
for i in range(5):                                                                      # the seat slats, 0.1 m wide with 2 cm between, from z -0.32 to 0.26
    P["saddle"].box(-1.6, 1.6, SEAT - 0.05, SEAT, -0.32 + i * 0.12, -0.22 + i * 0.12)
for yc in (0.62, 0.79, 0.96, 1.13):                                                     # the back slats, raked with the line, each 1 cm into the posts
    P["saddle"].boxc(0, yc + math.sin(RAKE) * 0.0075, LZ(yc) + math.cos(RAKE) * 0.0075, 3.2, 0.11, 0.035, rot=(-RAKE, 0, 0))
END = [(0.29, 0.0), (0.29, 0.64), (0.33, 0.70), (0.28, 0.75), (LZ(0.75), 0.75), (LZ(1.27), 1.27), (-0.60, 1.25), (-0.45, 0.40), (-0.47, 0.0), (-0.37, 0.0), (-0.31, 0.24), (0.08, 0.24), (0.14, 0.0)]
MID = [(0.20, 0.0), (0.20, SEAT - 0.05), (LZ(SEAT - 0.05), SEAT - 0.05), (LZ(1.23), 1.23), (LZ(1.23) - 0.07, 1.23), (-0.45, 0.40), (-0.47, 0.0), (-0.37, 0.0), (-0.31, 0.24), (0.08, 0.24), (0.12, 0.0)]
for sx in (-1, 1):
    P["black2"].polyx(END, sx * 1.46, sx * 1.54)                                         # a cheek: front leg, armrest, back post and rear leg, the seat between
    P["gold"].cylc(sx * 1.55, 0.60, -0.05, 0.07, 0.03, 12, rot=(0, 0, PI / 2))         # a gold medallion on its outer face, 2.5 cm proud
P["black2"].polyx(MID, -0.025, 0.025)                                                    # the centre support, under the seat and up the back (no armrest: the two seats are one)

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
    P["glowgold"].add(sphere(0.1, 8, 6), t=(x, cat(x) - 0.1, 0))                          # (hung on the wire: 0.14 under it left a gap)

finish_and_export()
