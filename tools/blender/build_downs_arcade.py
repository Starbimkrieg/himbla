# Chimera Downs arcades, gates and forecourt furniture for Blender (4.2+ / 5.x) -> src/assets/downs-arcade.glb (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_arcade.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_arcade.py
#
# three.js axes (x right, y up, +z front), each model on y = 0, origin on the ground. One material per mesh, named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_arcade     one 6.3 degree wedge of an arcade round a turn (a market-hall bay): inner chord at z = 0 (84 m from the turn centre), outer wall at z = 15.98 (100 m); x tangential,
#                 bay middle at x = 0. Per-bay fittings: timber floor, Mint column at the left corner, Mint roof ribs, pennants under the fascia, lit windows on the back wall's inner
#                 face (z = 15.28), a rafter, two pendant lamps. Continuous parts (back wall and trim, architrave, fascia, roof and ceiling) are built per run by the game, seamless
#                 (arcadeShell in src/downsKit.js); the roof underside rises from 7.15 m at z = -0.8 to 8.38 m at z = 16.08 on the back wall's cornice (ROOF there, RB below).
#                 Wedges meet on radial lines, so a run closes without a gap
#   dn_gate_hall  gate hall, 32 m across (x), 22 m deep (z = -11 to 11), +z outward, alike on both faces: two Mint towers (x = +-6 to +-16) either side of a 12 m passage, each with
#                 Mint2 plinth and rusticated base, gold string course, Mint2 pilasters with gold capitals, tall lit windows (sills, hoods, pediments), gold belt, attic windows,
#                 three-step cornice, Barn Red hip roof with gold cresting and finials. Between them, 0.6 m back (faces at z = +-10.4), the arch block: segmental vault (springing 5 m
#                 up on the towers' inner faces, crown 7.3 m), gold archivolt, Mint2 keystone, Black name board (9.6 x 2 m, centre 9.7 m up, front at z = +-10.65), cornice, pediment
#                 with gold raking cornice and golden horseshoe under a Barn Red gable roof. Both passage walls: Money2 wainscot, gold string course as rail, Mint2 impost, gold
#                 ribs, four lamps a wall, four pendants
#   dn_bench      bench for two runners (build_runner.py: hip 0.95 m up, knee 0.45 m in front and 0.53 m up, 0.72 m across the hips, 1.39 m across the shoulder pads): 3.2 m long,
#                 seat 0.44 m up and 0.58 m deep, backrest raked 13 degrees to 1.18 m, Saddle slats on Black2 cheeks with armrests and a centre support, gold medallions, facing +z
#                 (back at z = -0.6, front 0.33); on y = 0, the game sets it on its floor
#   dn_gate_main  forecourt gate, 28 m between the pylons' outer faces (x), 3 m deep: two 12 m Mint pylons with gold bands and lanterns, a Barn Red segmental arch, CHIMERA DOWNS in
#                 raised gold letters on its front face (back bare)
#   dn_fountain   forecourt fountain, 24 m across, to the casino's measures (src/fountainFx.js shades its water pivots): Money planter ring, Mint basin, Mint bowl on a pedestal,
#                 eight spigots, golden derby cup (pivot `trophy`, role spin) turning on the stem
#   dn_bay        valet bay head: wheel stop, two paint lines 5.6 m toward +z, post with a gold number plate (0.5 x 0.35, facing +z, centre 0.78 m up)
#   dn_planter    planter 2.4 x 1 x 0.9 m: Money2 box, gold edge, Money mound
#   dn_festoon    string of lights 30 m between two points at one height: x -15 to 15, 2.2 m sag, 25 lit bulbs
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
P = parts(root, "dn_arcade", {"saddle2": 0.0, "gold": 0.012, "mint": 0.03, "mint2": 0.012, "black": 0.02, "barn": 0.025, "glasswarm": 0.0, "glowgold": 0.0}, solid=True)
YF = 6.6                                                                                # fascia middle height (the game's fascia, z -0.92 to -0.68)
RB = lambda z: 7.15 + (z + 0.8) * (8.38 - 7.15) / (D + 0.9)                             # roof underside (src/downsKit.js ROOF); ceiling 7 cm under it
z0, z1 = -0.8, D + 0.2
# floor
P["saddle2"].polyy(trap(0.0, D - 0.35), 0.0, 0.14)                                    # (back edge inside the back wall, which starts below ground)
for x in (-2.6, 2.6):                                                                   # two lit windows on the back wall's inner face (D - 0.7), frames behind the panes
    P["black"].box(x - 1.3, x + 1.3, 5.1, 7.7, D - 0.74, D - 0.7)
    P["glasswarm"].box(x - 1.15, x + 1.15, 5.25, 7.55, D - 0.78, D - 0.74)
    P["black"].box(x - 0.04, x + 0.04, 5.25, 7.55, D - 0.82, D - 0.78)
    P["gold"].box(x - 1.4, x + 1.4, 7.7, 7.88, D - 0.84, D - 0.7)
# left-corner column, up into the architrave (6.5 to 7.1)
cx = -WI + 0.55
P["mint2"].cylc(cx, 0.30, 0.55, 0.52, 0.34, 14)                                        # (base from 1 cm under the floor top to 1 cm up the shaft)
P["mint"].cylc(cx, 0.46 + 3.1, 0.55, 0.36, 6.2, 14, rt=0.3)
P["gold"].cylc(cx, 6.5, 0.55, 0.5, 0.22, 14)
# standing seams on the roof top (underside RB, 0.32 thick), tilted with it
zm = (z0 + z1) / 2
ang = -math.atan(RB(1.0) - RB(0.0))
for x in (-2.6, 0.0, 2.6):
    P["mint"].boxc(x, RB(zm) + 0.32 + 0.04, zm, 0.14, 0.12, z1 - z0 - 0.4, rot=(ang, 0, 0))
for i, x in enumerate((-2.2, 2.2)):                                                     # pennants under the fascia's gold lip (6.05 to 6.15), tops 2 cm up into it
    (P["barn"] if i == 0 else P["gold"]).poly([(-0.4, 0), (0.4, 0), (0, -1.0)], z0 - 0.04, z0 + 0.04, t=(x, YF - 0.53, 0))
P["black"].bm((-WI + 0.4, RB(0.6) - 0.15, 0.6), (-WO + 0.25, RB(D - 0.8) - 0.15, D - 0.8), 0.1)  # rafter from column to wall under the ceiling (end 0.25 m
# off the wedge edge: beside a gate the tower's side crosses this corner, and further off the rafter grazes out of the tower face)
# pendant lamps: cord, gold cap, lit globe
for z in (3.0, 10.0):
    yroof = RB(z) - 0.07
    P["black"].bm((0, yroof, z), (0, yroof - 0.9, z), 0.025)
    P["gold"].cylc(0, yroof - 0.95, z, 0.14, 0.12, 10)
    P["glowgold"].add(sphere(0.26, 12, 8), t=(0, yroof - 1.2, z))

# =====================================================================================================
# dn_gate_hall
# =====================================================================================================
# Entrance pavilion: two towers and the arch block between, built so no outline shows where pieces meet (style.md, "Ink"). The arch block stands 0.6 m back and runs 0.1 m
# into each tower, so faces meet only in inside corners (flush faces draw an outline down each joint); vault and gable are one solid. Every trim wraps a tower whole (plinth,
# four rusticated courses, string course, belt, three cornice steps), steps out 5 cm or more, or runs into a tower or bigger trim; archivolt, each rib, raking cornice and gable
# roof are single solids. Hidden faces of touching pieces in different slots lie on different planes (audit_coplanar): buried backs 8 cm (Black), 10 cm (Mint2), 12 cm (Gold) in.
# Arcade runs (src/downsKit.js arcadeShell) end on radial lines at local x 13 to 15.7, inside the towers' 16 m sides; their roof meets those sides below 8.9 m, under the side sills.
root = pivot("dn_gate_hall", (0, 0, 0))
P = parts(root, "dn_gate_hall", {"mint": 0.05, "mint2": 0.02, "money2": 0.012, "gold": 0.02, "black": 0.025, "barn": 0.035, "glasswarm": 0.0, "glowgold": 0.0, "saddle2": 0.0}, solid=True)
PS = Acc("dn_gate_hall_lampMetal", "black", root, 0.012)                                # lamp metal (small-fitting ink)
PF = Acc("dn_gate_hall_glazingBars", "black", root, 0.0)                                # glazing bars, 5 mm proud of the panes
GF = Acc("dn_gate_hall_floorInlay", "gold", root, 0.0)                                  # floor inlays, 5 mm proud of the boards
JN = Acc("dn_gate_hall_baseJoints", "mint", root, 0.0)                                # rusticated base joints, flush bands 5 mm proud
TF, CF, TU0, TU1 = 11.0, 10.4, 6.0, 16.0                                                # tower faces (z = +-11), arch block faces (+-10.4); tower inner and outer sides (|x|)
SPR, CR = 5.0, 7.3                                                                      # segmental vault: springs 5 m up on the towers' inner faces, crown 7.3 m
AR = (TU0 ** 2 + (CR - SPR) ** 2) / (2 * (CR - SPR))
AY = CR - AR                                                                            # (radius and centre height)
GY0, GY1, GX = 11.7, 14.4, 6.1                                                          # gable: 11.7 m where it enters the towers (|x| = 6.1) to 14.4 m at the ridge
G = lambda x: GY0 + (GX - abs(x)) * (GY1 - GY0) / GX


def onz(zf, F, sx=1):
    """box spans on face z = zf * F: u along (x = sx * u), v up, o out (- into the wall)"""
    return lambda u0, u1, v0, v1, o0, o1: (sx * u0, sx * u1, v0, v1, zf * (F + o0), zf * (F + o1))


def onx(xs, F, d):
    """same on face x = xs * F, outside toward d * x (u along z)"""
    return lambda u0, u1, v0, v1, o0, o1: (xs * F + d * o0, xs * F + d * o1, v0, v1, u0, u1)


def arc(r_in, r_out, a0, n=24):
    """band round the vault centre (0, AY), radius r_in to r_out, angles -a0 to a0 from vertical"""
    o = [(r_out * math.sin(-a0 + 2 * a0 * i / n), AY + r_out * math.cos(-a0 + 2 * a0 * i / n)) for i in range(n + 1)]
    return o + [(r_in * math.sin(a0 - 2 * a0 * i / n), AY + r_in * math.cos(a0 - 2 * a0 * i / n)) for i in range(n + 1)]


def chevron(x0, lo, hi):
    """band along the gable, x -x0 to x0, G + lo to G + hi, one piece over the ridge (gable roof, raking cornice)"""
    return [(-x0, G(x0) + lo), (0, GY1 + lo), (x0, G(x0) + lo), (x0, G(x0) + hi), (0, GY1 + hi), (-x0, G(x0) + hi)]


def hiproof(a, b, h):
    """hip roof on a 2a x 2b rectangle (b > a), one pitch: ridge h up, 2 (b - a) long, along z"""
    r = b - a
    return [(-a, 0, -b), (a, 0, -b), (a, 0, b), (-a, 0, b), (0, h, -r), (0, h, r)], [(0, 4, 1), (1, 4, 5, 2), (2, 5, 3), (3, 5, 4, 0), (0, 1, 2, 3)]


def window(face, uc, w, v0, v1):
    """tall lit window: Mint2 sill, Black frame 0.1 m proud, pane 5 mm proud of it with bar and transom 5 mm prouder, gold hood"""
    P["mint2"].box(*face(uc - w / 2 - 0.25, uc + w / 2 + 0.25, v0 - 0.3, v0, -0.10, 0.30))
    P["black"].box(*face(uc - w / 2, uc + w / 2, v0, v1, -0.08, 0.10))
    P["glasswarm"].box(*face(uc - w / 2 + 0.2, uc + w / 2 - 0.2, v0 + 0.2, v1 - 0.2, 0.09, 0.105))
    vt = v0 + 0.2 + 0.7 * (v1 - v0 - 0.4)
    PF.box(*face(uc - 0.04, uc + 0.04, v0 + 0.21, v1 - 0.21, 0.098, 0.11))                 # (bars stop 1 cm inside the pane, off its edge planes)
    PF.box(*face(uc - w / 2 + 0.21, uc + w / 2 - 0.21, vt - 0.04, vt + 0.04, 0.098, 0.11))
    P["gold"].box(*face(uc - w / 2 - 0.25, uc + w / 2 + 0.25, v1, v1 + 0.25, -0.12, 0.28))


def attic(face, uc):
    """small attic window over the belt: sill, frame 8 cm proud, pane, bar"""
    P["mint2"].box(*face(uc - 0.55, uc + 0.55, 11.9, 12.05, -0.10, 0.18))
    P["black"].box(*face(uc - 0.45, uc + 0.45, 12.05, 12.95, -0.08, 0.08))
    P["glasswarm"].box(*face(uc - 0.33, uc + 0.33, 12.17, 12.83, 0.07, 0.085))
    PF.box(*face(uc - 0.03, uc + 0.03, 12.18, 12.82, 0.078, 0.09))


# passage: timber floor between the plinths, gold inlay under each arch-block face
P["saddle2"].box(-5.75, 5.75, 0.0, 0.14, -TF, TF)
for zf in (-1, 1):
    GF.box(-5.7, 5.7, 0.13, 0.145, zf * CF - 0.15, zf * CF + 0.15)
for sx in (-1, 1):
    # tower on its plinth; rusticated base (one block round the tower 8 cm proud, joints as flush Mint bands: recessed joints between outlined courses show slivers that
    # read as dashed lines at distance); string course; belt (at the arch block's cornice); cornice (Mint2 bed, deep gold corona, Mint2 cymatium), all bands round the tower
    P["mint2"].box(sx * 5.75, sx * 16.25, 0.0, 0.6, -11.25, 11.25)
    P["mint2"].box(sx * 5.92, sx * 16.08, 0.6, 3.42, -11.08, 11.08)
    for y0 in (1.29, 2.0, 2.71):
        JN.box(sx * 5.915, sx * 16.085, y0, y0 + 0.06, -11.085, 11.085)
    P["mint"].box(sx * TU0, sx * TU1, 0.3, 14.0, -TF, TF)
    P["gold"].box(sx * 5.80, sx * 16.20, 3.42, 3.72, -11.20, 11.20)                       # (20 cm proud: 8 cm over the wainscot, 12 cm over the courses)
    P["gold"].box(sx * 5.6, sx * 16.4, 11.25, 11.7, -11.4, 11.4)
    P["mint2"].box(sx * 5.75, sx * 16.25, 13.2, 13.5, -11.25, 11.25)
    P["gold"].box(sx * 5.55, sx * 16.45, 13.5, 13.95, -11.45, 11.45)
    P["mint2"].box(sx * 5.65, sx * 16.35, 13.95, 14.25, -11.35, 11.35)
    # hip roof, foot in the cymatium, eaves 0.2 m out; gold ridge cresting, a finial each end
    P["barn"].add(hiproof(5.55, 11.55, 4.2), t=(sx * 11.0, 14.15, 0))
    P["gold"].box(sx * 10.91, sx * 11.09, 18.27, 18.47, -6.0, 6.0)
    for zr in (-6.0, 6.0):
        P["gold"].bm((sx * 11.0, 18.3, zr), (sx * 11.0, 19.5, zr), 0.06)
        P["gold"].add(sphere(0.22, 10, 8), t=(sx * 11.0, 19.68, zr))
    for zf in (-1, 1):                                                                  # track face and outer face, alike
        f = onz(zf, TF, sx)
        for u0, u1 in ((6.3, 7.2), (14.8, 15.7)):                                       # corner pilasters: base on the string course, shaft, gold capital under the belt
            P["mint2"].box(*f(u0 - 0.1, u1 + 0.1, 3.72, 4.15, -0.10, 0.30))
            P["mint2"].box(*f(u0, u1, 4.05, 10.95, -0.10, 0.22))
            P["gold"].box(*f(u0 - 0.1, u1 + 0.1, 10.85, 11.25, -0.12, 0.32))
        window(f, 11.0, 2.8, 5.1, 9.9)
        P["mint2"].poly([(sx * 9.5, 10.15), (sx * 12.5, 10.15), (sx * 11.0, 10.7)], *sorted((zf * (TF - 0.10), zf * (TF + 0.20))))   # pediment on the hood
        for uc in (8.6, 11.0, 13.4):
            attic(f, uc)
        # lantern on the pilaster each side of the passage: backplate, arm and strut, base, lit body, cap, gold finial
        PS.box(*f(6.55, 6.95, 5.0, 5.9, 0.12, 0.30))
        PS.bm((sx * 6.75, 5.29, zf * (TF + 0.26)), (sx * 6.75, 5.29, zf * (TF + 0.86)), 0.035)
        PS.bm((sx * 6.75, 5.06, zf * (TF + 0.27)), (sx * 6.75, 5.27, zf * (TF + 0.6)), 0.025)
        PS.box(*f(6.55, 6.95, 5.25, 5.33, 0.65, 1.05))
        P["glowgold"].box(*f(6.6, 6.9, 5.33, 5.93, 0.7, 1.0))
        PS.add(cylinder(0.06, 0.3, 0.25, 4), t=(sx * 6.75, 6.055, zf * (TF + 0.85)), rot=(0, PI / 4, 0))
        P["gold"].add(sphere(0.05, 8, 6), t=(sx * 6.75, 6.22, zf * (TF + 0.85)))
    fa = onx(sx, TU1, sx)                                                               # side over the arcade: two windows above its roof, three attic
    for uc in (-4.0, 4.0):
        window(fa, uc, 1.9, 9.25, 10.85)
    for uc in (-6.0, 0.0, 6.0):
        attic(fa, uc)
    # passage side of the tower, alike on both: Money2 wainscot from plinth into the string course (4 cm proud of the courses, back 3 cm into them; string course 8 cm
    # proud of it), Mint2 impost under the springing, four lamps (backplate, arm, gold cup, lit globe)
    fp = onx(sx, TU0, -sx)
    P["money2"].box(*fp(-CF, CF, 0.55, 3.5, 0.05, 0.12))
    P["mint2"].box(*fp(-10.75, 10.75, 4.65, SPR, -0.14, 0.18))                          # (back 4 cm past the arch block's side)
    for z in (-8.0, -2.7, 2.7, 8.0):
        PS.box(*fp(z - 0.12, z + 0.12, 3.85, 4.5, -0.07, 0.07))
        PS.bm((sx * 5.97, 4.08, z), (sx * 5.5, 4.08, z), 0.025)                            # (arm ends mid-cup, 5 mm inside its top and foot)
        P["gold"].cylc(sx * 5.5, 4.08, z, 0.11, 0.06, 10)
        P["glowgold"].add(sphere(0.16, 12, 8), t=(sx * 5.5, 4.22, z))

# arch block: one solid from vault to gable, sides 0.1 m into the towers
yA = AY + math.sqrt(AR ** 2 - GX ** 2)
a1 = math.asin(GX / AR)
P["mint"].poly([(GX, yA), (GX, GY0), (0, GY1), (-GX, GY0), (-GX, yA)] + [(AR * math.sin(-a1 + 2 * a1 * i / 24), AY + AR * math.cos(-a1 + 2 * a1 * i / 24)) for i in range(1, 24)], -CF, CF)
P["barn"].poly(chevron(6.2, -0.05, 0.30), -10.95, 10.95)                                # gable roof, 0.55 m out over each face (inside the tower faces), foot in the towers
P["gold"].box(-0.09, 0.09, GY1 + 0.22, GY1 + 0.44, -10.85, 10.85)                       # cresting, ending 10 cm inside the roof ends, through the acroteria
a0 = math.asin(6.2 / (AR - 0.12))                                                       # (arcs end where their inner edge is 0.2 m into the towers, on the impost)
for zc in (-5.4, 0.0, 5.4):                                                             # gold ribs across the vault, 12 cm deep
    P["gold"].poly(arc(AR - 0.12, AR + 0.10, a0), zc - 0.175, zc + 0.175)
for z in (-8.0, -2.7, 2.7, 8.0):                                                        # crown pendants: chain, gold cap, lit globe
    PS.bm((0, CR + 0.15, z), (0, CR - 0.75, z), 0.025)
    P["gold"].cylc(0, CR - 0.8, z, 0.15, 0.12, 10)
    P["glowgold"].add(sphere(0.28, 12, 8), t=(0, CR - 1.06, z))
for zf in (-1, 1):                                                                      # each arch-block face
    fc = onz(zf, CF)
    zs = lambda o0, o1: sorted((zf * (CF + o0), zf * (CF + o1)))
    P["gold"].poly(arc(AR - 0.12, AR + 0.55, a0), *zs(-0.12, 0.15))                     # archivolt, lip 12 cm under the vault
    P["mint2"].poly([(-0.3, CR - 0.22), (0.3, CR - 0.22), (0.46, CR + 0.95), (-0.46, CR + 0.95)], *zs(-0.22, 0.30))   # keystone, 15 cm proud of the archivolt
    # (and 10 cm deeper into the passage: it hangs 10 cm under the archivolt lip; backs 2 cm apart would double the outlines)
    P["gold"].box(*fc(-5.0, 5.0, 8.5, 10.9, -0.12, 0.20))                               # name board frame
    P["black"].box(*fc(-4.8, 4.8, 8.7, 10.7, 0.18, 0.25))                               # board (game letters it 1 cm in front, z = +-10.66)
    P["mint2"].box(*fc(-6.25, 6.25, 11.05, 11.35, -0.10, 0.25))                             # cornice: Mint2 bed and gold corona, foot 20 cm under the belt's foot
    P["gold"].box(*fc(-6.3, 6.3, 11.35, 11.85, -0.12, 0.50))                             # top 15 cm over the belt's (outlines step apart); ends in the towers
    P["gold"].poly(chevron(6.3, -0.38, 0.03), *zs(-0.12, 0.35))                         # raking cornice under the roof overhang, top in the roof
    # golden horseshoe in the tympanum, open at the top (for luck), heels capped; acroterion on the gable
    P["gold"].add(torus_partial(0.62, 0.12, 8, 20, math.radians(300)), t=(0, 12.75, zf * (CF + 0.09)), rot=(0, 0, math.radians(120)))
    for ang in (60, 120):
        P["gold"].add(sphere(0.16, 10, 6), t=(0.62 * math.cos(math.radians(ang)), 12.75 + 0.62 * math.sin(math.radians(ang)), zf * (CF + 0.09)))
    P["gold"].bm((0, GY1 + 0.15, zf * 10.8), (0, GY1 + 0.9, zf * 10.8), 0.06)
    P["gold"].add(sphere(0.22, 10, 8), t=(0, GY1 + 1.05, zf * 10.8))

# =====================================================================================================
# dn_gate_main
# =====================================================================================================
root = pivot("dn_gate_main", (0, 0, 0))
P = parts(root, "dn_gate_main", {"mint": 0.05, "mint2": 0.02, "gold": 0.02, "black": 0.025, "barn": 0.035, "glowgold": 0.0}, solid=True)
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
    for zf in (-1, 1):                                                                  # lantern each face: housing 10 cm into the pylon, lit pane 5 mm proud
        P["black"].boxc(x, 5.6, zf * 1.475, 0.5, 0.9, 0.35)
        P["glowgold"].boxc(x, 5.6, zf * 1.6375, 0.36, 0.7, 0.035)
# arch: segmental band between the pylons' inner faces (x = +-11.1), spring y = 9, crown 12.4 (inner edge)
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
# the name in raised gold letters on the arch's front band (+z only), 0.17 m a pixel, 0.14 m proud. One solid, not a box a pixel (Acc.letters_arc): pixels share
# corners and only outer edges have sides, so no outline is drawn between a letter's pixels.
def letters_arc_solid(acc, text, yc, rm, pix, z, depth):
    px, w = letter_pixels(text)
    cells = set(px)
    index, verts, faces = {}, [], []

    def v(i, j, s):                                     # pixel-grid corner (i, j) (cell (c, r) spans (c, r) to (c + 1, r + 1)), back (s = 0) or front face
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
# Forecourt fountain: the casino's / Meridian's (build_casino.py) in the Downs palette, a golden derby cup turning on top instead of chip / dollar. Same measures because
# src/fountainFx.js shades its water: pivots `water_basin`, `water_bowl` (role water, tier basin / bowl: the ripple discs), `curtain` (sheet over the bowl lip), `streams` (eight
# spigot jets); `trophy` (role spin) turns. Water pivots' slot (glowmint) isn't drawn: the game dresses them.
root = pivot("dn_fountain", (0, 0, 0))
P = parts(root, "dn_fountain", {"money2": 0.02, "money": 0.0, "mint2": 0.04, "mint": 0.03, "gold": 0.02, "barn": 0.02, "gold2": 0.02}, solid=True)
P["money2"].lath([(12.0, 0.0), (12.0, 0.7), (10.4, 0.7), (10.4, 0.0)], segs=48)           # planter ring
P["money"].lath([(10.5, 0.706), (11.9, 0.706)], segs=48)                                  # (turf, 6 mm above the rim's inside; higher floats)
# basin: stepped foot, flared flat-topped wall, floor, a pilaster every 30 degrees, gold bead on the lip
P["mint2"].lath([(9.7, 0.0), (9.7, 0.16), (9.32, 0.2), (9.3, 0.5), (9.05, 0.92), (9.15, 0.98), (9.15, 1.04), (8.55, 1.04), (8.55, 0.9), (8.5, 0.3), (8.5, 0.0), (9.7, 0.0)], segs=48)
P["money2"].lath([(0.0, 0.3), (8.5, 0.3)], segs=40)
for i in range(12):
    a = 2 * PI * i / 12
    P["mint"].boxc(math.sin(a) * 9.18, 0.50, math.cos(a) * 9.18, 0.7, 0.68, 0.32, rot=(0, a, 0))   # (from 0.16, 4 cm into the foot's step)
P["gold"].tor(8.85, 0.09, t=(0, 1.05, 0), n=48, rs=5)
for i in range(16):                                                                       # gold studs between the pilasters, 4 cm into the wall
    a = 2 * PI * (i + 0.5) / 16
    P["gold"].add(sphere(0.1, 5, 3), t=(math.sin(a) * 9.24, 0.7, math.cos(a) * 9.24))
# pedestal and bowl (ogee column on a stepped plinth, gold-rimmed saucer)
P["mint2"].lath([(0, 0.3), (2.5, 0.3), (2.5, 0.6), (2.1, 0.75), (1.7, 1.0), (1.4, 1.5), (1.3, 2.0), (1.3, 3.0), (1.5, 3.4), (1.9, 3.7), (2.6, 3.9), (0, 3.9)], segs=20)
P["mint"].lath([(0, 3.9), (2.6, 3.9), (3.2, 4.05), (3.62, 4.3), (3.72, 4.66), (3.5, 4.66), (3.3, 4.45), (0, 4.4)], segs=28)
P["gold"].tor(1.45, 0.07, t=(0, 1.5, 0), n=24, rs=5)
P["gold"].tor(1.32, 0.06, t=(0, 3.0, 0), n=24, rs=5)
P["gold"].tor(3.6, 0.1, t=(0, 4.68, 0), n=36, rs=5)
for i in range(8):                                                                        # eight Barn Red studs round the bowl
    a = 2 * PI * (i + 0.5) / 8
    P["barn"].add(sphere(0.17, 6, 4), t=(math.sin(a) * 3.55, 4.2, math.cos(a) * 3.55), s=(1, 1.3, 1))
# stem, gold collar, eight spigots near the top (under the cup)
P["mint2"].lath([(0, 4.4), (0.9, 4.4), (0.75, 4.75), (0.55, 5.1), (0.5, 5.6), (0.58, 6.0), (0.72, 6.2), (0, 6.2)], segs=16)
P["gold"].tor(0.6, 0.07, t=(0, 6.05, 0), n=16, rs=5)
P["gold"].tor(0.52, 0.06, t=(0, 5.35, 0), n=16, rs=5)
for i in range(8):
    a = 2 * PI * i / 8
    s_, c_ = math.sin(a), math.cos(a)
    P["gold"].path([(s_ * 0.45, 5.78, c_ * 0.45), (s_ * 0.85, 5.73, c_ * 0.85), (s_ * 0.98, 5.71, c_ * 0.98)], [0.08, 0.08, 0.125], 8)   # (flared nozzle)
# derby cup turning on the stem: plinth, gold stem and knop, deep cup with Barn Red band and two handles, 5 m up from the stem top
K = 1.25
tr = pivot("trophy", (0, 6.2, 0), root, role="spin", speed=0.7, kind="trophy")
T_ = parts(tr, "dn_trophy", {"mint2": 0.03, "gold": 0.03, "gold2": 0.02, "barn": 0.02})
T_["mint2"].cylc(0, 0.2 * K, 0, 1.0 * K, 0.4 * K, 20)                                      # plinth
T_["gold2"].cylc(0, 0.5 * K, 0, 0.78 * K, 0.22 * K, 20)                                    # gold collar
T_["gold"].lath([(0.0, 0.6 * K), (0.4 * K, 0.6 * K), (0.22 * K, 0.95 * K), (0.18 * K, 1.3 * K), (0.0, 1.3 * K)], segs=16)      # stem
T_["gold"].add(sphere(0.32 * K, 12, 8), t=(0, 1.2 * K, 0))                                 # knop, top 2.5 cm into the cup's foot
T_["gold"].lath([(0.0, 1.5 * K), (0.34 * K, 1.5 * K), (0.9 * K, 1.9 * K), (1.22 * K, 2.7 * K), (1.28 * K, 3.3 * K), (1.2 * K, 3.8 * K), (1.04 * K, 3.8 * K), (1.1 * K, 3.3 * K), (1.04 * K, 2.75 * K), (0.7 * K, 2.05 * K), (0.0, 1.85 * K)], segs=28)    # cup
for sx in (-1, 1):
    T_["gold"].tor(0.55 * K, 0.085 * K, t=(sx * 1.32 * K, 2.95 * K, 0), rot=(PI / 2, 0, 0), n=20, rs=6)                       # a handle each side
T_["barn"].tor(1.265 * K, 0.07 * K, t=(0, 3.05 * K, 0), n=32, rs=5)                         # cup band
T_["gold2"].tor(1.18 * K, 0.05 * K, t=(0, 3.78 * K, 0), n=32, rs=5)                         # lip bead
# water: tier discs (rippled by the game), sheet from the bowl lip, spigot jets. Both faces: the game's shaders draw one side only.
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
P["barn"].box(-1.1, 1.1, 0.0, 0.14, 0.0, 0.3)                                             # wheel stop
for sx in (-1, 1):
    P["saddle2"].box(sx * 1.4 - 0.07, sx * 1.4 + 0.07, 0.0, 0.015, 0.0, 5.6)             # paint lines (brown on pale paving)
P["saddle2"].box(-1.4, 1.4, 0.0, 0.015, 5.53, 5.6)
P["black2"].box(-0.04, 0.04, 0.0, 0.7, -0.5, -0.42)                                      # post behind the stop
P["gold"].box(-0.25, 0.25, 0.6, 0.95, -0.42, -0.38)                                      # number plate (facing +z, toward the car)

# =====================================================================================================
# dn_bench
# =====================================================================================================
# Sized for the courier (build_runner.py, full size in game): seated, shins upright, knees 0.53 m up and 0.45 m in front of the hip joints, thighs 0.15 m deep, so the seat is
# 0.44 m up and 0.58 m deep (knee clears the front by ~0.1 m; the pack, 0.5 m behind the spine, against the backrest sits it 0.1 m further forward). 0.72 m across the hips,
# 1.14 m across the arms, 1.39 m across the shoulder pads (above the cheeks): two sit 1.5 m apart in the 2.92 m between cheeks, arms 0.14 m clear. Backrest leans 13 degrees,
# four slats 0.56 to 1.18 m, behind back and pack (hip joints 0.59 m up, shoulders 0.85 m above). On y = 0; the game sets it on its floor. Each cheek and the centre support is
# one solid (legs, seat rail, armrest, back post); slats run through and 6 cm past the cheeks; the front slat stops 3 cm short of the cheeks' front so faces never share a plane.
root = pivot("dn_bench", (0, 0, 0))
P = parts(root, "dn_bench", {"saddle": 0.015, "black2": 0.015, "gold": 0.01}, solid=True)
SEAT = 0.44
LZ = lambda y: -0.33 - (y - SEAT) * 0.15 / 0.66                                         # backrest line (z at height y): slats on it, back posts behind
RAKE = math.atan(0.15 / 0.66)
for i in range(5):                                                                      # seat slats, 0.1 m wide, 2 cm gaps, z -0.32 to 0.26
    P["saddle"].box(-1.6, 1.6, SEAT - 0.05, SEAT, -0.32 + i * 0.12, -0.22 + i * 0.12)
for yc in (0.62, 0.79, 0.96, 1.13):                                                     # back slats, raked, each 1 cm into the posts
    P["saddle"].boxc(0, yc + math.sin(RAKE) * 0.0075, LZ(yc) + math.cos(RAKE) * 0.0075, 3.2, 0.11, 0.035, rot=(-RAKE, 0, 0))
END = [(0.29, 0.0), (0.29, 0.64), (0.33, 0.70), (0.28, 0.75), (LZ(0.75), 0.75), (LZ(1.27), 1.27), (-0.60, 1.25), (-0.45, 0.40), (-0.47, 0.0), (-0.37, 0.0), (-0.31, 0.24), (0.08, 0.24), (0.14, 0.0)]
MID = [(0.20, 0.0), (0.20, SEAT - 0.05), (LZ(SEAT - 0.05), SEAT - 0.05), (LZ(1.23), 1.23), (LZ(1.23) - 0.07, 1.23), (-0.45, 0.40), (-0.47, 0.0), (-0.37, 0.0), (-0.31, 0.24), (0.08, 0.24), (0.12, 0.0)]
for sx in (-1, 1):
    P["black2"].polyx(END, sx * 1.46, sx * 1.54)                                         # cheek: front leg, armrest, back post, rear leg, seat rail
    P["gold"].cylc(sx * 1.55, 0.60, -0.05, 0.07, 0.03, 12, rot=(0, 0, PI / 2))         # gold medallion on the outer face, 2.5 cm proud
P["black2"].polyx(MID, -0.025, 0.025)                                                    # centre support, under the seat and up the back (no armrest: one seat)

# =====================================================================================================
# dn_planter
# =====================================================================================================
root = pivot("dn_planter", (0, 0, 0))
P = parts(root, "dn_planter", {"money2": 0.02, "gold": 0.012, "money": 0.012}, solid=True)
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
    P["glowgold"].add(sphere(0.1, 8, 6), t=(x, cat(x) - 0.1, 0))                          # (hung on the wire)

finish_and_export()
