# Chimera Downs' concession stalls for Blender (4.2+ / 5.x), exported to src/assets/downs-stalls.glb (docs/downs-layouts.md: twenty stalls in the two arcades).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stalls.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stalls.py
#
# Twelve stalls on one kit, "THE ALCOVE", each built INTO an arcade bay (tools/blender/build_downs_arcade.py dn_arcade) in front of its back wall, so it is authored in that bay's frame: z = 0 on the
# walk's edge, +z outward to the back wall (its trim's face, the wainscot and the windows' heads, at z = 15.14), the floor top y = 0.14, x tangential, the stall facing -z toward the walk; the game bakes
# it at the bay's own place. It is a small building of three parts, each standing within the one below it, so nothing reaches past its base:
#   the plinth   Mint2, x +-5.12, z 11.18 to 15.08, its top (y = 0.34) the alcove's floor, where the vendor stands; sunk 4 cm into the bay's floor, 5.6 cm clear of the back wall's trim
#   the shell    Mint, x +-5.0, z 11.3 to 14.98: the screen wall (z 11.3 to 11.8) with its arched opening (spring 3.9, crown 5.45), the side walls and the alcove's own back wall, ONE solid
#                (an outer block with the alcove and the arch cut out of it), so no outline seam shows at its corners; its top runs up into the cornice
#   the cornice  Gold, 0.2 deep, x +-5.12, z 11.18 to 15.08 (the plinth's footprint: 12 cm proud of the walls at the front and sides and 10 cm at the back, as the plinth is), raked with the arcade's ceiling (ROOF in src/downsKit.js):
#                its top is 0.6 m under the ceiling everywhere (7.36 m at the front, 7.64 m at the back), the same in every bay, and 0.42 m under the bay's rafter
# On the screen wall: piers with tiled dadoes and gold capitals, a gold band round the opening and a keystone, a Black name plate with the name in raised gold letters between two gold rails, and two
# swags of pennants from bosses on the piers to the keystone (accent, gold and Mint in turn, as the derby's pennants alternate), every detail inset from the wall's edges and no prouder than the
# cornice. Inside: a lit tiled niche on the back wall, a rounded counter (top at y = 1.3, z 11.9 to 13.4; the vendor stands behind it at z = 14.1) trimmed in the `accent` slot (the game picks its
# colour per stall), two pendant lanterns hung from the cornice; a lit roundel on each spandrel. The counter's middle (x -1.2 to 1.2) is kept clear of anything
# taller than a tray, so the vendor shows from the front: the fixtures stand toward its two ends.
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
D = 16.0 * math.cos(math.radians(3.15))      # the bay's depth (src/downsPlan.js WEDGE.d): its back wall's outer face; the trim on that wall's inner face comes out to D - 0.84
FL = 0.14            # the bay's floor top
YP = 0.34            # the plinth's top: the alcove's floor (the game stands the vendor at this height: src/downsWorld.js buildDowns)
CEIL = lambda z: 7.15 + (z + 0.8) * (8.38 - 7.15) / (D + 0.9) - 0.07     # the arcade's ceiling, its underside (src/downsKit.js ROOF: the roof's underside; the ceiling hangs 7 cm under it)
CLR = 0.6            # the room between the stall's top and the ceiling, the same everywhere (the bay's rafter hangs 0.18 m under the ceiling, so 0.42 m under that)
TOP = lambda z: CEIL(z) - CLR                  # the stall's top: the cornice's, raked with the ceiling
CO = 0.2             # the cornice's depth; its underside is the alcove's ceiling
TW = lambda z: TOP(z) - CO / 2                 # the shell's top, in the middle of the cornice
XW, XC = 5.0, 5.12   # the shell's outer faces; the cornice's and the plinth's side edges, 12 cm proud of them
ZS, ZT = 11.3, 11.8  # the screen wall's front and back faces
ZBW = 14.98          # the alcove's back wall, its outer face (10 cm short of the plinth's and the cornice's back, ZC1)
ZBI = ZBW - 0.25     # and its inner face
XI = XW - 0.3        # the side walls' inner faces
ZC0, ZC1 = ZS - 0.12, ZBW + 0.1                # the plinth's and the cornice's front and back
CT = 1.3             # the counter's top
CZ0, CZ1 = 11.9, 13.4
Z = lambda z: 12.85 - z      # an old-frame z (the counter about z = 0.2, +z toward the customer) in the bay's frame (the customer toward -z)


def pix_for(label, width):
    return min(0.1, width / (6 * len(label) - 1))


def jars(P, y, z, xs, slot, h=0.5, r=0.17):
    for x in xs:
        P[slot].cylc(x, y + h / 2, z, r, h, 10)
        P["gold"].cylc(x, y + h + 0.03, z, r + 0.02, 0.06, 10)


def prism_y(plan, y0, ytop):
    """a convex plan outline [(x, z)] standing from y0 up to ytop(z) (a plane: a top raked along z)"""
    n = len(plan)
    verts = [(x, y0, z) for x, z in plan] + [(x, ytop(z), z) for x, z in plan]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return verts, faces


def carve(geo, cutters):
    """`geo` with each of `cutters` taken out of it (Blender's exact boolean): one closed solid, so the outline shell the game grows round it is one piece too, with no seam where its
    walls meet. Every cutter goes right through the faces it opens, so no face of it lies on one of geo's. Returns (verts, faces), in the same axes as given."""
    def obj(name, g):
        me = bpy.data.meshes.new(name)
        me.from_pydata(g[0], [], g[1])
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o
    base_o = obj("_carve", geo)
    cut_os = [obj(f"_cutter{i}", c) for i, c in enumerate(cutters)]
    for c in cut_os:
        m = base_o.modifiers.new("cut", "BOOLEAN")
        m.operation, m.solver, m.object = "DIFFERENCE", "EXACT", c
    dg = bpy.context.evaluated_depsgraph_get()
    ev = base_o.evaluated_get(dg)
    me = ev.to_mesh()
    out = ([tuple(v.co) for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    ev.to_mesh_clear()
    for o in [base_o, *cut_os]:
        m = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(m)
    return out


def base(name, label, shelf="jars"):
    """the alcove; shelf: what stands on the back wall's two shelves ('jars', 'bottles' or 'none' for a stall that dresses the wall itself)"""
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, SLOTS)
    SPR, CRN, HC = 3.9, 5.45, 4.3                                                       # the arch: spring, crown, half-chord (the piers are 0.7 m wide)
    RR = (HC ** 2 + (CRN - SPR) ** 2) / (2 * (CRN - SPR))
    YC = CRN - RR
    A = math.asin(HC / RR)
    n = 28
    arc = lambda r, a0, a1: [(r * math.sin(a0 + (a1 - a0) * i / n), YC + r * math.cos(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    # the plinth: sunk 4 cm into the bay's floor (no face on the floor's plane), its top the alcove's floor; the shell, the counter and the trims stand on it
    P["mint2"].box(-XC, XC, FL - 0.04, YP, ZC0, ZC1)
    # the shell: a block x +-XW, z ZS to ZBW, from the plinth up into the cornice, with the alcove (x +-XI, z ZT to ZBI) and the arch (through the screen wall) taken out of it: one solid
    block = prism_y([(-XW, ZS), (XW, ZS), (XW, ZBW), (-XW, ZBW)], YP, TW)
    alcove = prism_y([(-XI, ZT), (XI, ZT), (XI, ZBI), (-XI, ZBI)], YP - 0.1, lambda z: TOP(z) + 1.0)
    opening = [(-HC, YP - 0.1), *arc(RR, -A, A), (HC, YP - 0.1)]
    arch = xf(extrude(opening, ZT - ZS + 0.2, "z"), (0, 0, (ZS + ZT) / 2))
    P["mint"].geos.append(carve(block, [alcove, arch]))
    # the cornice: one raked slab over it all, its underside the alcove's ceiling (a mesh of its own: a roof-sized part's ink, not the small gold trims')
    Acc(name + "_cornice", "gold", root, 0.025).polyx([(ZC0, TOP(ZC0) - CO), (ZC1, TOP(ZC1) - CO), (ZC1, TOP(ZC1)), (ZC0, TOP(ZC0))], -XC, XC)
    # the screen wall's face: everything sunk into it (no gaps behind), inset from its edges (nothing flush with them, whose outline would show as a seam) and no prouder than the cornice
    for sx in (-1, 1):
        P["gold"].polyy([(sx * (HC - 0.04), ZS - 0.06), (sx * (XW - 0.04), ZS - 0.06), (sx * (XW - 0.04), ZS + 0.05), (sx * (HC + 0.05), ZS + 0.05),
                         (sx * (HC + 0.05), ZT - 0.04), (sx * (HC - 0.04), ZT - 0.04)], SPR - 0.03, SPR + 0.15)       # the piers' capitals, round onto the opening's jamb
        P["money2"].box(sx * (HC + 0.06), sx * (XW - 0.06), YP - 0.03, 1.3, ZS - 0.005, ZS + 0.03)               # a tiled dado on each pier (5 mm proud)
        P["gold"].cylc(sx * 4.6, SPR + 0.3, ZS - 0.045, 0.07, 0.15, 10, rot=(PI / 2, 0, 0))                       # the bosses the pennants' cords hang from
    P["gold"].poly(arc(RR + 0.12, -A, A) + arc(RR - 0.03, A, -A), ZS - 0.05, ZS + 0.06)                          # a gold band round the opening, lining its edge
    P["gold"].box(-0.35, 0.35, CRN - 0.05, CRN + 0.42, ZS - 0.12, ZS + 0.05)                                     # the keystone
    P["black"].box(-4.6, 4.6, 6.08, 6.92, ZS - 0.06, ZS + 0.04)                                                  # the name plate
    P["gold"].box(-4.72, 4.72, 6.0, 6.08, ZS - 0.08, ZS + 0.04)
    P["gold"].box(-4.72, 4.72, 6.92, 7.0, ZS - 0.08, ZS + 0.04)
    P["gold"].letters(label, 0, 6.5, ZS - 0.06, pix_for(label, 8.8), 0.05, ry=math.pi)
    # the alcove: tiles up its back wall with a gold cap, a lit niche, the shelves (the trims' ends sunk into the side walls)
    P["money2"].box(-XI - 0.05, XI + 0.05, YP - 0.04, 1.9, ZBI - 0.005, ZBI + 0.05)
    P["gold"].box(-XI - 0.04, XI + 0.04, 1.86, 1.96, ZBI - 0.03, ZBI + 0.04)
    P["black"].box(-4.4, 4.4, 2.2, 5.8, ZBI - 0.04, ZBI + 0.05)
    P["glasswarm"].box(-4.28, 4.28, 2.32, 5.68, ZBI - 0.07, ZBI - 0.02)
    ZJ = ZBI - 0.28                                                                     # (what stands on the shelves, along their middle)
    if shelf != "none":
        for y in (3.2, 4.3):
            P["saddle"].box(-4.2, 4.2, y, y + 0.1, ZBI - 0.5, ZBI - 0.06)
    if shelf == "jars":
        jars(P, 3.3, ZJ, [-3.7 + i * 1.06 for i in range(8)], "accent")
        jars(P, 4.4, ZJ, [-3.2 + i * 1.6 for i in range(5)], "barn", 0.55, 0.2)
    elif shelf == "bottles":
        for r, y in enumerate((3.3, 4.4)):
            for i in range(12):
                s = ("accent", "gold", "money2", "barn", "glowmint")[(i + r) % 5]
                P[s].cylc(-3.7 + i * 0.67, y + 0.25, ZJ, 0.09, 0.5, 8)
    # the counter: a rounded bar, its ends round in the accent colour, a Saddle top with a gold nosing and a panelled front
    P["black2"].box(-3.7, 3.7, YP, CT - 0.12, CZ0, CZ1)
    r = (CZ1 - CZ0) / 2
    for sx in (-1, 1):
        P["accent"].cylc(sx * 3.7, (YP + CT - 0.12) / 2, (CZ0 + CZ1) / 2, r, CT - 0.12 - YP - 0.04, 16)
        P["saddle"].cylc(sx * 3.7, CT - 0.06, (CZ0 + CZ1) / 2, r + 0.12, 0.12, 16)
    P["saddle"].box(-3.7, 3.7, CT - 0.12, CT, CZ0 - 0.12, CZ1 + 0.12)
    P["gold"].box(-3.7, 3.7, CT - 0.15, CT - 0.04, CZ0 - 0.17, CZ0 - 0.12)
    for i in range(7):
        P["accent"].box(-3.5 + i * 1.0 + 0.1, -3.5 + i * 1.0 + 0.9, 0.55, 1.0, CZ0 - 0.04, CZ0)
    # bunting: two swags of pennants across the opening, each on a cord from a boss on a pier up to the keystone, 9 cm in front of the screen wall. They hang in the arch's upper corners
    # (the lowest tip 3.5 m up, the middle ones above 4.6 m), clear of the vendor's head. Accent, gold and Mint in turn, as the derby's pennants alternate
    F = parts(root, name + "_flags", {"accent": 0.012, "gold": 0.012, "mint": 0.012, "black2": 0.0})
    FZ, SAG, Y0, Y1 = ZS - 0.09, 0.35, SPR + 0.3, CRN + 0.15
    for sx in (-1, 1):
        def sw(s, sx=sx):
            return sx * 4.6 * (1 - s), Y0 + (Y1 - Y0) * s - 4 * SAG * s * (1 - s)
        F["black2"].path([(*sw(i / 16), FZ) for i in range(17)], 0.02, 5)
        for i, s in enumerate((0.12, 0.31, 0.5, 0.69, 0.88)):
            x, y = sw(s)
            F[("accent", "gold", "mint")[i % 3]].poly([(-0.25, 0.02), (0.25, 0.02), (0, -0.68)], FZ - 0.02, FZ + 0.02, t=(x, y, 0))
    # pendant lanterns inside the alcove, hung from the cornice over the counter's ends
    for x in (-2.6, 2.6):
        P["black2"].bm((x, TOP(13.9) - CO / 2, 13.9), (x, 4.43, 13.9), 0.03)
        P["glowgold"].add(sphere(0.24, 10, 8), t=(x, 4.1, 13.9))
        P["gold"].cylc(x, 4.38, 13.9, 0.14, 0.1, 10)
    # a lit roundel on each spandrel, over the bosses and under the name plate's rail (it took the place of a blade sign that stood 1.7 m out from the right pier, past the plinth): a gold
    # ring, a black disc and a lit emblem, each a step (2-3 cm) prouder than the one behind it and the ring sunk 4 cm into the wall; x 4.24 to 4.92 (inside the wall's edge), y 4.76 to 5.44
    # (0.5 m over the cords and the top pennant, 0.56 m under the rail, 1.4 m clear of the gold band round the opening at that height)
    for sx in (-1, 1):
        P["gold"].cylc(sx * 4.58, 5.1, ZS, 0.34, 0.08, 20, rot=(PI / 2, 0, 0))
        P["black"].cylc(sx * 4.58, 5.1, ZS - 0.02, 0.28, 0.1, 20, rot=(PI / 2, 0, 0))
        P["glowgold"].cylc(sx * 4.58, 5.1, ZS - 0.06, 0.18, 0.06, 16, rot=(PI / 2, 0, 0))
    return P


# ---- 0: MOON DOGS ----
P = base("dn_stall_0", "MOON DOGS")
P["black2"].box(-3.5, -1.3, CT, CT + 0.14, Z(0.0), Z(0.8))                              # the roller grill: a tray and four rollers
for i in range(4):
    P["saddle2"].cylc(-2.4, CT + 0.22, Z(0.08 + i * 0.2), 0.07, 2.0, 8, rot=(0, 0, PI / 2))
for i in range(3):                                                                      # buns, stacked
    P["saddle"].boxc(2.0, CT + 0.1 + i * 0.2, Z(0.4), 0.9, 0.2, 0.5)
P["gold"].cylc(3.0, CT + 0.25, Z(0.3), 0.1, 0.5, 8)                                     # mustard
P["barn"].cylc(3.4, CT + 0.25, Z(0.3), 0.1, 0.5, 8)                                     # ketchup
P["gold"].cylc(3.0, CT + 0.56, Z(0.3), 0.04, 0.12, 8)
# ---- 1: CRATER FRIES ----
P = base("dn_stall_1", "CRATER FRIES")
for x in (-3.0, -1.85):
    P["black2"].box(x - 0.5, x + 0.5, CT, CT + 0.7, Z(0.0), Z(0.7))                     # a fryer
    P["glowgold"].box(x - 0.4, x + 0.4, CT + 0.7, CT + 0.76, Z(0.1), Z(0.6))            # lit oil
    P["black"].bm((x - 0.4, CT + 0.7, Z(0.35)), (x - 0.4, CT + 1.3, Z(0.8)), 0.04)      # a basket handle (on the side away from the vendor)
for i in range(4):                                                                      # a rack of paper cones with fries
    x = 1.6 + i * 0.6
    P["mint"].cylc(x, CT + 0.4, Z(0.3), 0.05, 0.6, 8, rt=0.26)
    P["gold"].cylc(x, CT + 0.82, Z(0.3), 0.2, 0.16, 8)
# ---- 2: HE-3 FIZZ ----
P = base("dn_stall_2", "HE-3 FIZZ")
P["black2"].box(-3.6, -1.3, CT, CT + 0.12, Z(0.0), Z(0.7))                              # drip tray
P["black"].box(-3.45, -1.45, CT + 0.12, CT + 1.4, Z(-0.3), Z(0.1))                      # the font
for i in range(4):
    P["gold"].cylc(-3.15 + i * 0.47, CT + 1.05, Z(0.2), 0.06, 0.3, 8, rot=(PI / 2, 0, 0))    # taps
P["gold"].box(-3.5, -1.4, CT + 1.4, CT + 1.52, Z(-0.35), Z(0.15))
for i in range(4):
    P["glowmint"].cylc(1.6 + i * 0.6, CT + 0.45, Z(0.3), 0.17, 0.9, 10)                 # tall glasses, lit
    P["accent"].cylc(1.6 + i * 0.6, CT + 0.95, Z(0.3), 0.19, 0.1, 10)
# ---- 3: CHIMERA CHOW ----
P = base("dn_stall_3", "CHIMERA CHOW")
P["black"].cylc(-2.5, CT + 0.55, Z(0.2), 0.75, 1.1, 14, rt=0.6)                         # a big pot
P["saddle2"].cylc(-2.5, CT + 1.1, Z(0.2), 0.62, 0.06, 14)
P["black2"].bm((-2.2, CT + 1.6, Z(0.1)), (-2.6, CT + 0.9, Z(0.3)), 0.05)                # the ladle, standing in it
P["black2"].bm((-2.2, CT + 1.6, Z(0.1)), (-2.0, CT + 1.5, Z(0.1)), 0.05)
for i in range(5):
    P["mint"].cylc(1.8, CT + 0.12 + i * 0.16, Z(0.3), 0.42, 0.14, 12, rt=0.3)           # a stack of bowls
for i in range(3):
    P["money2"].cylc(3.0, CT + 0.12 + i * 0.16, Z(0.3), 0.42, 0.14, 12, rt=0.3)
# ---- 4: ROCK CANDY ----
P = base("dn_stall_4", "ROCK CANDY")
for sx in (-1, 1):                                                                      # a stand of two rows at each end: a shelf for the upper row on two posts
    P["saddle"].box(sx * 1.25, sx * 3.65, CT + 0.84, CT + 0.9, Z(0.0), Z(0.7))
    for x in (1.3, 3.6):
        P["black2"].box(sx * x - 0.05, sx * x + 0.05, CT, CT + 0.84, Z(0.3), Z(0.4))
for r in range(2):
    for i in range(6):
        x = (-3.15, -2.4, -1.65, 1.65, 2.4, 3.15)[i]
        P["glasswarm"].cylc(x, CT + 0.35 + r * 0.9 + (0.0 if r == 0 else 0.0), Z(0.35), 0.26, 0.7, 10)
        (P["accent"] if (i + r) % 2 == 0 else P["gold"]).cylc(x, CT + 0.22 + r * 0.9, Z(0.35), 0.2, 0.4, 7)
        P["gold"].cylc(x, CT + 0.74 + r * 0.9, Z(0.35), 0.28, 0.07, 10)
# ---- 5: TOTE · BETS ----
P = base("dn_stall_5", "TOTE · BETS")
P["black"].box(-1.4, 1.4, 3.3, 4.7, Z(-0.2), Z(-0.4))                                   # the tote screen, hung from the cornice over the vendor's head, lit on its front
P["glowgold"].box(-1.25, 1.25, 3.45, 4.55, Z(-0.18), Z(-0.2))
for sx in (-1, 1):
    P["black2"].bm((sx * 1.2, 4.7, Z(-0.3)), (sx * 1.2, TW(Z(-0.3)), Z(-0.3)), 0.04)
for x in (-3.0, -2.2, 2.2, 3.0):
    P["black2"].box(x - 0.3, x + 0.3, CT, CT + 0.55, Z(0.0), Z(0.6))                    # terminals
    P["glowmint"].box(x - 0.24, x + 0.24, CT + 0.3, CT + 0.5, Z(0.6), Z(0.62))
for i in range(6):
    P["gold"].box(-0.9 + i * 0.36 - 0.02, -0.9 + i * 0.36 + 0.02, CT, CT + 0.55, Z(0.5), Z(0.54))    # a brass grille
# ---- 6: SPACE SLUSH ----
P = base("dn_stall_6", "SPACE SLUSH")
for i, s in enumerate(("barn", "gold", "money2")):
    x = (-3.0, -1.85, 2.0)[i]
    P["black2"].box(x - 0.55, x + 0.55, CT, CT + 0.35, Z(0.0), Z(0.7))
    P["glowmint"].cylc(x, CT + 0.95, Z(0.35), 0.5, 1.2, 14)                             # a lit tank
    P[s].cylc(x, CT + 1.6, Z(0.35), 0.52, 0.12, 14)
    P["gold"].cylc(x, CT + 0.2, Z(0.7), 0.05, 0.3, 8, rot=(PI / 2, 0, 0))               # tap
P["accent"].cylc(3.2, CT + 0.3, Z(0.3), 0.22, 0.6, 10)
# ---- 7: LUNAR COFFEE ----
P = base("dn_stall_7", "LUNAR COFFEE")
P["gold"].box(-3.2, -1.2, CT, CT + 0.9, Z(-0.2), Z(0.5))                                # the espresso machine
P["black2"].box(-3.0, -1.4, CT + 0.9, CT + 1.05, Z(-0.2), Z(0.5))
for x in (-2.7, -1.7):
    P["black"].cylc(x, CT + 0.45, Z(0.55), 0.05, 0.3, 8)
for x in (1.65, 2.55):
    P["saddle2"].cylc(x, CT + 0.7, Z(0.2), 0.4, 1.4, 12)                                # urns
    P["gold"].cylc(x, CT + 1.45, Z(0.2), 0.2, 0.1, 10)
    P["black"].cylc(x, CT + 0.45, Z(0.6), 0.04, 0.3, 8, rot=(PI / 2, 0, 0))
for i in range(6):
    P["mint"].cylc(3.35, CT + 0.1 + i * 0.14, Z(0.4), 0.28, 0.13, 10, rt=0.24)          # a tower of cups
# ---- 8: DERBY DONUTS ----
P = base("dn_stall_8", "DERBY DONUTS")
for sx in (-1, 1):                                                                      # a rack at each end
    P["saddle2"].box(sx * 1.3, sx * 3.6, CT, CT + 0.1, Z(0.0), Z(0.6))
for r in range(3):
    for i in range(6):
        x = (-3.15, -2.45, -1.75, 1.75, 2.45, 3.15)[i]
        P["saddle"].tor(0.2, 0.08, t=(x, CT + 0.35 + r * 0.45, Z(0.3)), rot=(PI / 2, 0, 0), n=14, rs=6)
        if (i + r) % 2:
            P["mint"].tor(0.19, 0.04, t=(x, CT + 0.41 + r * 0.45, Z(0.3) - 0.0), rot=(PI / 2, 0, 0), n=14, rs=5)
    for sx in (-1, 1):
        P["black2"].box(sx * 1.4, sx * 3.5, CT + 0.2 + r * 0.45, CT + 0.24 + r * 0.45, Z(0.0), Z(0.5))
# ---- 9: JOCKEY'S GRILL ----
P = base("dn_stall_9", "JOCKEY'S GRILL")
P["black"].box(-3.5, -1.3, CT, CT + 0.7, Z(0.0), Z(0.8))                                # the grill
P["glowgold"].box(-3.3, -1.5, CT + 0.7, CT + 0.74, Z(0.1), Z(0.7))
P["black2"].cylc(-3.2, CT + 1.6, Z(-0.3), 0.2, 1.8, 8)                                  # a chimney
for i in range(4):
    P["barn"].boxc(1.6 + i * 0.5, CT + 0.15, Z(0.4), 0.4, 0.1, 0.35, rot=(0, 0.25, 0))  # steaks on a rack
P["accent"].cylc(3.45, CT + 0.35, Z(0.4), 0.16, 0.7, 8)
# ---- 10: FOAM FINGERS ---- (the pegboard is on the lit back wall, so no shelves)
P = base("dn_stall_10", "FOAM FINGERS", shelf="none")
P["saddle"].box(-3.3, 3.3, 2.4, 4.7, ZBI - 0.17, ZBI - 0.06)                             # a pegboard on the lit panel
for i in range(6):
    x = -2.6 + i * 1.04
    P["gold"].cylc(x, 3.75, ZBI - 0.27, 0.02, 0.9, 7, rt=0.18)
    P["accent"].cylc(x, 3.3, ZBI - 0.27, 0.05, 0.3, 7)
for i in range(4):
    P["barn"].cylc(-3.35 + i * 0.6, CT + 0.15, Z(0.3), 0.27, 0.26, 12, rt=0.18)         # caps on the counter
    P["black2"].boxc(-3.35 + i * 0.6, CT + 0.3, Z(0.55), 0.36, 0.04, 0.2)
P["mint"].box(1.5, 3.5, CT, CT + 0.6, Z(0.0), Z(0.5))                                   # a stack of programmes
P["accent"].box(1.48, 3.52, CT + 0.38, CT + 0.48, Z(-0.02), Z(0.52))
# ---- 11: RAIL BAR ---- (the bottles are on the shelves)
P = base("dn_stall_11", "RAIL BAR", shelf="bottles")
for x in (-2.6, 2.6):
    P["saddle2"].cylc(x, CT + 0.45, Z(0.3), 0.5, 0.9, 12, rt=0.44)                      # barrels
    P["gold"].cylc(x, CT + 0.95, Z(0.3), 0.46, 0.06, 12)
    P["gold"].cylc(x, CT + 0.45, Z(0.8), 0.04, 0.25, 8, rot=(PI / 2, 0, 0))
P["black2"].box(-0.9, 0.9, CT, CT + 0.12, Z(0.0), Z(0.6))

finish_and_export()
