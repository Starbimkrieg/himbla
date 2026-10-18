# Chimera Downs' course kit for Blender (4.2+ / 5.x), exported to src/assets/downs-course.glb: rail, furlong poles, finish
# arch, photo-finish tower, lamp, flag mast, crossing barrier post and starting gate (docs/downs-layouts.md).
# Pieces that meet are either buried well into each other (so outlines stay inside) or step by 3 cm or more; no outlined
# piece lies flush on another (the outlines would draw a seam). Bands, stripes, panes, chequers: ink-0 skins <= 5 mm proud.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_course.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_course.py
#
# three.js axes (x right, y up, +z front), each model on y = 0. One material per mesh, named after a slot
# (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_rail        5 m of rail, 1 m tall, along +x from its post at x = 0: Mint post, gold cap, Black top rail, Mint mid
#                  rail (the game scales y to 1.2 m). Rails run from inside the post to x = 5 (the next post's middle).
#   dn_furlong     distance pole, 3.56 m: Mint pole with Barn Red bands (the game turns them Mint on every other pole),
#                  Black-framed Money board on +z (the game writes the distance 2.86 m up, face at z = 0.225), gold collar
#                  under the board, gold cap
#   dn_finish_arch finish gantry, 23.6 m between pylons along x, 11.6 m tall: Mint pylons with a gold band, a beam 10 cm
#                  back from their faces ending inside them, two gold belts round beam and pylons, a Black / Mint chequer
#                  and a Black FINISH panel on each face (flush, face at z = +-0.705), a camera pod under the lower belt,
#                  two Barn Red pennants
#   dn_photo_tower photo-finish tower, 3 m square foot, 10.2 m tall: Mint shaft, Black corner pilasters, glazed box on
#                  top with its lens toward -z, gold cap, mast
#   dn_lamp        lamp, 6.4 m: Black post on a Mint plinth, gold collar, Barn Red band, gooseneck from a top gold collar
#                  down into a gold cup over a lit globe; head reaches toward +x
#   dn_mast        flag mast, 11 m: Mint pole, gold ball, Barn Red pennant (slot `cloth`, game-recoloured) 3.2 x 1.5 m
#                  streaming toward +x
#   dn_crossing    crossing barrier post, 5.2 m with boom: the rail's end post, on the rail's line, road toward +x, rail
#                  running in from -x. Mint foot (0.5 m square), Mint post (0.26 m), gold cap, red lamp, Black hinge box on
#                  the road side, boom straight up (Mint, four Barn Red bands). Symmetric in z, so turned half round it is
#                  its own mirror image (the post across the road).
#   dn_gate_frame  starting gate, 16.4 m across x, 3.4 m deep (z = -3.2 to 0.2), 4.2 m tall, four stalls: Mint padded
#                  dividers, Black roof with a gold lip, number plate frames
#   dn_gate_door   stall door hinged at x = 0 reaching toward -x (1.9 m), 2.6 m tall, Barn Red with gold edging; the game
#                  hangs two per stall and swings them open
DOWNS_OUT = "downs-course.glb"
DOWNS_COLL = "MoonDownsCourse"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# =====================================================================================================
# dn_rail
# =====================================================================================================
root = pivot("dn_rail", (0, 0, 0))
P = parts(root, "dn_rail", {"mint": 0.015, "gold": 0.01, "black": 0.012, "mint2": 0.01})
P["mint"].box(-0.075, 0.075, 0.0, 1.03, -0.075, 0.075)                                  # top 3 cm inside the cap
P["gold"].box(-0.11, 0.11, 1.0, 1.07, -0.11, 0.11)
P["black"].box(0.0, 5.0, 0.86, 0.98, -0.055, 0.055)                                     # post middle to next post middle: buried 7.5 cm each end
P["mint2"].box(0.0, 5.0, 0.44, 0.52, -0.03, 0.03)

# =====================================================================================================
# dn_furlong
# =====================================================================================================
root = pivot("dn_furlong", (0, 0, 0))
P = parts(root, "dn_furlong", {"mint": 0.02, "barn": 0.0, "gold": 0.015, "black": 0.02, "money2": 0.0})
P["mint"].cylc(0, 1.73, 0, 0.1, 3.46, 8)                                                # pole, ground into the cap
for y0 in (0.15, 1.15):                                                                 # bands: skins on the same eight sides, 4.6 mm proud
    P["barn"].cylc(0, y0 + 0.25, 0, 0.105, 0.5, 8)
P["gold"].cylc(0, 2.24, 0, 0.13, 0.12, 8)                                               # collar under the board
P["black"].box(-0.85, 0.85, 2.38, 3.34, 0.06, 0.22)                                     # board frame, pole sunk 3 cm into its back
P["money2"].box(-0.75, 0.75, 2.46, 3.26, 0.2, 0.225)                                    # face 5 mm proud of the frame
P["gold"].cylc(0, 3.5, 0, 0.13, 0.12, 8)                                                # cap

# =====================================================================================================
# dn_finish_arch
# =====================================================================================================
root = pivot("dn_finish_arch", (0, 0, 0))
P = parts(root, "dn_finish_arch", {"mint": 0.07, "mint2": 0.03, "gold": 0.02, "black": 0.03, "barn": 0.02, "black2": 0.03})
CHECK = Acc("dn_finish_arch_check", "black", root, 0.0)                                 # chequer and word panel: flush skins, no ink
for sx in (-1, 1):
    x = sx * 11.8
    P["mint"].box(x - 0.7, x + 0.7, 0.5, 11.5, -0.8, 0.8)                               # pylon, ends sunk 10 cm into plinth and cap
    P["gold"].box(x - 0.78, x + 0.78, 1.8, 2.3, -0.88, 0.88)
    P["mint2"].box(x - 1.0, x + 1.0, 0.0, 0.6, -1.1, 1.1)                                # foot
    P["gold"].box(x - 0.85, x + 0.85, 11.4, 11.62, -0.95, 0.95)                         # cap
    P["black"].bm((x, 11.55, 0.0), (x, 15.4, 0.0), 0.06)                                # mast from inside the cap, with a pennant
    P["barn"].poly([(0, 0), (2.0, -0.35), (0, -0.8)], -0.03, 0.03, t=(x, 15.3, 0))
# The beam sits 10 cm back from the pylons' faces (z +-0.7 vs +-0.8) and ends 0.3 m inside their outer faces, so the
# pylon edges stay real edges and the beam's outline stays inside them. Two gold belts wrap beam and pylons, 10 cm proud
# on the free sides; the lower one (8.6 to 9.2) is also the pylons' upper band, and the camera pod hangs from it.
P["mint"].box(-12.2, 12.2, 9.15, 11.05, -0.7, 0.7)                                      # beam, top and bottom 5 cm inside the belts
P["gold"].box(-12.6, 12.6, 11.0, 11.2, -0.9, 0.9)
P["gold"].box(-12.6, 12.6, 8.6, 9.2, -0.9, 0.9)
for side in (-1, 1):                                                                    # chequer either side of the word on each face: 10 x 0.86 m squares, two rows
    z0, z1 = (0.69, 0.705) if side > 0 else (-0.705, -0.69)                             # 5 mm proud of the beam's face
    for sgn in (-1, 1):
        for i in range(10):
            for row in range(2):
                if (i + row) % 2 == 0:
                    xa = 2.35 + i * 0.86                                                # 15 cm from the word panel and the pylon
                    CHECK.box(min(sgn * xa, sgn * (xa + 0.86)), max(sgn * xa, sgn * (xa + 0.86)), 9.24 + row * 0.86, 10.1 + row * 0.86, z0, z1)
    CHECK.box(-2.2, 2.2, 9.24, 10.96, z0, z1)                                            # FINISH panel (the game's sign 1 cm in front: downsWorld.js course)
P["black2"].box(-0.8, 0.8, 7.9, 8.8, -0.8, 0.8)                                         # camera pod, top 20 cm inside the lower belt
P["black"].cylc(0, 8.25, 1.0, 0.18, 0.5, 10, rot=(PI / 2, 0, 0))                        # lenses sunk 5 cm into its faces
P["black"].cylc(0, 8.25, -1.0, 0.18, 0.5, 10, rot=(PI / 2, 0, 0))

# =====================================================================================================
# dn_photo_tower
# =====================================================================================================
root = pivot("dn_photo_tower", (0, 0, 0))
P = parts(root, "dn_photo_tower", {"mint": 0.05, "mint2": 0.02, "gold": 0.02, "black": 0.03, "glasswarm": 0.0, "black2": 0.015})
P["mint2"].box(-1.5, 1.5, 0.0, 0.5, -1.5, 1.5)                                          # footing
P["mint"].box(-1.3, 1.3, 0.4, 5.0, -1.3, 1.3)                                           # shaft, 10 cm inside the footing to inside the band
for sx in (-1, 1):
    for sz in (-1, 1):                                                                  # corner pilasters, 12 cm proud, footing to band
        P["black"].box(sx * 1.3 - 0.12, sx * 1.3 + 0.12, 0.45, 4.95, sz * 1.3 - 0.12, sz * 1.3 + 0.12)
P["gold"].box(-1.5, 1.5, 4.8, 5.14, -1.5, 1.5)                                         # top 4 cm inside the glazed box
P["mint"].box(-2.6, 2.6, 5.1, 7.95, -2.1, 2.1)                                          # glazed box, top 5 cm inside the cap
# front is -z (the track): Black frame 6 cm proud (back 10 cm inside the box), pane 5 mm proud on it, mullion over the pane
P["black"].box(-2.45, 2.45, 5.35, 7.65, -2.16, -2.0)
P["glasswarm"].box(-2.3, 2.3, 5.5, 7.5, -2.165, -2.14)
P["black"].box(-0.05, 0.05, 5.42, 7.58, -2.19, -2.15)                                   # runs past the pane's edges onto the frame
for sx in (-1, 1):                                                                      # side panes, 5 mm proud of the box's ends
    P["glasswarm"].box(min(sx * 2.58, sx * 2.605), max(sx * 2.58, sx * 2.605), 5.5, 7.5, -1.5, 1.5)
P["gold"].box(-2.8, 2.8, 7.9, 8.15, -2.3, 2.3)                                          # cap
P["black2"].cylc(0, 6.5, -2.59, 0.22, 0.94, 12, rot=(PI / 2, 0, 0))                    # long lens down the line, from inside the frame into its hood
P["black"].cylc(0, 6.5, -3.1, 0.27, 0.12, 12, rot=(PI / 2, 0, 0))
P["black"].bm((1.4, 8.05, 0.5), (1.4, 10.2, 0.5), 0.05)                                 # mast from inside the cap

# =====================================================================================================
# dn_lamp
# =====================================================================================================
root = pivot("dn_lamp", (0, 0, 0))
P = parts(root, "dn_lamp", {"mint2": 0.02, "black": 0.02, "gold": 0.015, "barn": 0.015, "glowgold": 0.0, "mint": 0.02})
P["mint2"].cylc(0, 0.3, 0, 0.36, 0.6, 10, rt=0.3)
P["black"].cylc(0, 0.5 + 2.65, 0, 0.1, 5.3, 10, rt=0.075)                              # post, 10 cm inside the plinth to inside the top collar
P["gold"].cylc(0, 0.75, 0, 0.17, 0.12, 10)
P["barn"].cylc(0, 4.0, 0, 0.14, 0.4, 10)
P["gold"].cylc(0, 5.81, 0, 0.14, 0.12, 10)                                              # top collar over the post's end (5.8)
P["black"].path([(0, 5.77, 0), (0, 6.15, 0), (0.15, 6.4, 0), (0.45, 6.5, 0), (0.64, 6.47, 0), (0.7, 6.4, 0), (0.7, 6.3, 0)], 0.055, 6)    # gooseneck, collar down into the cup
P["gold"].cylc(0.7, 6.31, 0, 0.2, 0.1, 10)                                              # cup (6.26 to 6.36) over the globe
P["glowgold"].add(sphere(0.24, 12, 8), t=(0.7, 6.1, 0))

# =====================================================================================================
# dn_mast
# =====================================================================================================
root = pivot("dn_mast", (0, 0, 0))
P = parts(root, "dn_mast", {"mint": 0.025, "gold": 0.015, "mint2": 0.0, "cloth": 0.015})
P["mint2"].cylc(0, 0.25, 0, 0.3, 0.5, 8, rt=0.22)
P["mint"].cylc(0, 5.475, 0, 0.11, 10.05, 8, rt=0.06)                                   # from 5 cm inside the plinth
P["gold"].add(sphere(0.2, 10, 8), t=(0, 10.62, 0))
for i in range(4):                                                                      # pennant: four panels, each turned a little more
    x0, w = 0.08 + i * 0.8, 0.8
    y = 9.9 - i * 0.04
    P["cloth"].poly([(0, 0.75), (w, 0.75 - 0.18 * (1 if i < 3 else 1.8)), (w, -0.75 + 0.18 * (1 if i < 3 else 1.8)), (0, -0.75)], -0.02, 0.02, t=(x0, y, 0.12 * math.sin(i * 1.3 + 0.4)))

# =====================================================================================================
# dn_crossing
# =====================================================================================================
root = pivot("dn_crossing", (0, 0, 0))
P = parts(root, "dn_crossing", {"mint2": 0.02, "mint": 0.02, "gold": 0.012, "black2": 0.015, "barn": 0.0, "glowred": 0.0})
BOOM = Acc("dn_crossing_boom", "mint", root, 0.012)
P["mint2"].box(-0.25, 0.25, 0.0, 0.3, -0.25, 0.25)                                      # foot
P["mint"].box(-0.13, 0.13, 0.2, 1.52, -0.13, 0.13)                                      # post, foot to cap (the rails run into it 0.44 to 1.18 up)
P["gold"].box(-0.17, 0.17, 1.5, 1.6, -0.17, 0.17)                                       # cap
P["black2"].box(-0.11, 0.11, 1.58, 1.76, -0.11, 0.11)                                   # lamp housing, from inside the cap
P["glowred"].add(sphere(0.12, 8, 6), t=(0, 1.86, 0))
P["black2"].box(0.1, 0.42, 1.08, 1.44, -0.1, 0.1)                                       # hinge box on the road side (3 cm back from the post's faces)
# boom straight up from the hinge box: one Mint bar, four Barn Red skin bands 4 mm proud (eight 0.47 m bands box-top to tip, tip red)
BOOM.box(0.25, 0.35, 1.3, 5.2, -0.05, 0.05)
for i in range(4):
    y0 = 1.44 + (2 * i + 1) * 0.47
    P["barn"].box(0.246, 0.354, y0, y0 + 0.47 + (0.004 if i == 3 else 0.0), -0.054, 0.054)

# =====================================================================================================
# dn_gate_frame / dn_gate_door
# =====================================================================================================
root = pivot("dn_gate_frame", (0, 0, 0))
P = parts(root, "dn_gate_frame", {"mint": 0.03, "money2": 0.02, "black": 0.03, "gold": 0.015, "black2": 0.0, "barn2": 0.0})
SPAN = 16.4


def plate_frame(o, h, z0, z1):
    """a rectangular frame as one closed solid (no overlapping corner bars): outline o and opening h, each (x0, x1, y0, y1), z0 to z1"""
    outer = [(o[0], o[2]), (o[1], o[2]), (o[1], o[3]), (o[0], o[3])]
    inner = [(h[0], h[2]), (h[1], h[2]), (h[1], h[3]), (h[0], h[3])]
    verts = [(x, y, z) for z in (z0, z1) for x, y in outer + inner]                     # 0-3 outer back, 4-7 inner back, 8-11 outer front, 12-15 inner front
    faces = []
    for i in range(4):
        j = (i + 1) % 4
        faces += [(8 + i, 8 + j, 12 + j, 12 + i), (i, 4 + i, 4 + j, j), (i, j, 8 + j, 8 + i), (4 + i, 12 + i, 12 + j, 4 + j)]
    return verts, faces


for i in range(5):
    x = SPAN / 2 - i * (SPAN / 4)
    P["mint"].box(x - 0.18, x + 0.18, 0.15, 3.75, -3.1, 0.1)                            # divider, ends 5 cm into floor frame and roof
    if 0 < i < 4:
        for s in (-1, 1):                                                               # padding both sides, 3 cm into the divider
            P["money2"].box(x + s * 0.15, x + s * 0.28, 0.3, 3.0, -2.9, -0.2)
P["black"].box(-SPAN / 2 - 0.2, SPAN / 2 + 0.2, 3.7, 4.25, -3.2, 0.2)                    # roof
P["gold"].box(-SPAN / 2 - 0.25, SPAN / 2 + 0.25, 3.62, 3.76, 0.15, 0.3)                 # gold lip over the doors
P["gold"].box(-SPAN / 2 - 0.25, SPAN / 2 + 0.25, 4.1, 4.3, 0.15, 0.34)                  # both 5 cm into the roof's face
P["black2"].box(-SPAN / 2 - 0.25, SPAN / 2 + 0.25, 0.0, 0.2, -3.2, 0.2)                 # floor frame, 5 cm past the end dividers like the lips
for i in range(4):                                                                      # rear gates: black rails
    xc = SPAN / 2 - SPAN / 8 - i * (SPAN / 4)
    for y in (0.5, 1.4, 2.3):
        P["black2"].box(xc - 1.8, xc + 1.8, y, y + 0.08, -3.14, -3.06)
    # number plate frame on the roof over each stall (the game hangs live numbers in it: 0.9 m square, centre 4.85 m up,
    # 0.13 m out); opening 1.1 x 1.0, bars 0.1 wide, foot 5 cm inside the roof
    P["gold"].add(plate_frame((xc - 0.65, xc + 0.65, 4.2, 5.45), (xc - 0.55, xc + 0.55, 4.35, 5.35), 0.0, 0.12))

root = pivot("dn_gate_door", (0, 0, 0))
P = parts(root, "dn_gate_door", {"barn": 0.025, "gold": 0.012, "black2": 0.0})
P["barn"].box(-1.88, -0.02, 0.2, 2.78, -0.06, 0.06)
P["gold"].box(-1.9, 0.0, 2.7, 2.8 + 0.03, -0.09, 0.09)                                  # top edge
P["gold"].box(-1.9, 0.0, 0.17, 0.3, -0.09, 0.09)                                        # foot
P["gold"].box(-0.1, 0.0, 0.3, 2.7, -0.09, 0.09)                                         # hinge side
P["black2"].box(-1.7, -0.2, 0.36, 0.9, 0.05, 0.065)                                     # kick plate (skin 5 mm proud, clear of the foot)

finish_and_export()
