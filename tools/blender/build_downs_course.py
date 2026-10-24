# Chimera Downs' course kit for Blender (4.2+ / 5.x), exported to src/assets/downs-course.glb: rail, furlong poles, finish
# arch, photo-finish tower, lamp, flag mast, crossing barrier post and starting gate (docs/downs-layouts.md).
# Pieces that meet are either buried well into each other (so outlines stay inside) or step by 3 cm or more; no outlined
# piece lies flush on another (the outlines would draw a seam). Bands, stripes, panes, chequers: ink-0 skins <= 5 mm proud.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_course.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_course.py
#
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0. One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_rail        5 m of the course's rail, 1 m tall, running along +x from its post at x = 0: a Mint post with a gold cap, a Black top rail and a Mint mid rail (the game scales it in y for 1.2 m).
#                  Both rails start inside the post and end at x = 5, the next bay's post's middle, so they run into a post at both ends.
#   dn_furlong     a distance pole, 3.56 m: one Mint pole with Barn Red bands laid on it (the game turns them Mint on every other pole), a Black-framed Money board on its +z side (the game
#                  writes the distance on it, 2.86 m up, its face at z = 0.225), a gold collar under the board and a gold cap on top
#   dn_finish_arch the finish gantry, 23.6 m between its pylons along x, 11.6 m tall: Mint pylons with a gold band, a beam set 10 cm back from the pylons' faces and ending inside them,
#                  two gold belts round beam and pylons, a Black and Mint chequer and a Black panel for the word FINISH on each face (flush, the face at z = +-0.705), a camera pod
#                  hung from the lower belt, two Barn Red pennants
#   dn_photo_tower the photo-finish tower, 3 m square at the foot, 10.2 m tall: a Mint shaft with Black corner pilasters, a glazed box on top with its lens toward -z, a gold cap, a mast
#   dn_lamp        the Downs' lamp, 6.4 m: a Black post on a Mint plinth, a gold collar and a Barn Red band, a gooseneck from a gold collar on the post's top down into a gold cup
#                  over a lit globe; the head reaches toward +x
#   dn_mast        a flag mast, 11 m: a Mint pole, a gold ball, a Barn Red pennant (slot `cloth`, which the game recolours) 3.2 x 1.5 m streaming toward +x
#   dn_crossing    a track crossing's barrier post, 5.2 m with its boom: the rail's end post, standing on the rail's line with the road toward its +x and the rail running into it
#                  from -x. A Mint foot (0.5 m square), a Mint post (0.26 m) with a gold cap and a red lamp, a Black hinge box on its road side and the boom raised straight up
#                  from it (Mint, four Barn Red bands). Symmetric in z, so turned half round it is its own mirror image (the post across the road).
#   dn_gate6_frame_a / _b  the six-stall starting gate, two designs (race.js GATE picks one), stalls 3 m apart across x (their centres at +-1.5, +-4.5, +-7.5), the doors' line at z = 0.
#                  A "Classic Six": 18.5 m across, 3.0 m deep, 4.6 m to the number frames: Mint and padded dividers, a Black roof with gold lips, a gold number frame per stall on
#                  the roof (the game's plates: centre 4.05 m up, 0.16 m out), a pennant at each end. B "The Gantry": 19.1 m across, open-topped: Barn Red end towers with gold cornices
#                  and starter's lamps (red and mint), slim Black stall posts with Mint pads, a Black lattice beam with gold diagonals from tower to tower whose Mint frames carry the
#                  numbers (centre 4.45 m up, 0.24 m out), a Saddle sill.
#   dn_gate6_door_a / _b  one stall door, hinged at x = 0 and reaching toward -x (1.4 m); the game hangs two on each stall (hinges 1.45 m either side of its centre) and turns
#                  them open. A: Barn Red with gold edging, 2.3 m. B: Mint with a Barn Red diagonal band and gold edging, 2.0 m.
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
# dn_gate6_frame_a / dn_gate6_door_a: "Classic Six", today's gate in six 3 m stalls (roofed, padded Mint dividers, the numbers on the roof)
# =====================================================================================================
SPAN, PITCH, N = 18.0, 3.0, 6


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


root = pivot("dn_gate6_frame_a", (0, 0, 0))
P = parts(root, "dn_gate6_frame_a", {"mint": 0.03, "money2": 0.02, "black": 0.03, "gold": 0.015, "black2": 0.0, "barn": 0.02})
for i in range(N + 1):
    x = SPAN / 2 - i * PITCH
    P["mint"].box(x - 0.15, x + 0.15, 0.15, 3.15, -2.7, 0.1)                            # a divider, its ends 5 cm into the floor frame and the roof
    if 0 < i < N:
        for sd in (-1, 1):                                                              # padding on both sides, 3 cm into the divider
            P["money2"].box(x + sd * 0.12, x + sd * 0.24, 0.3, 2.5, -2.5, -0.2)
P["black"].box(-SPAN / 2 - 0.2, SPAN / 2 + 0.2, 3.1, 3.55, -2.8, 0.2)                    # the roof
P["gold"].box(-SPAN / 2 - 0.25, SPAN / 2 + 0.25, 3.03, 3.16, 0.15, 0.3)                 # a gold lip over the doors
P["gold"].box(-SPAN / 2 - 0.25, SPAN / 2 + 0.25, 3.45, 3.62, 0.15, 0.34)                # (both 5 cm into the roof's face)
P["black2"].box(-SPAN / 2 - 0.25, SPAN / 2 + 0.25, 0.0, 0.2, -2.8, 0.2)                 # the floor frame, out under the end dividers
for i in range(N):
    xc = SPAN / 2 - PITCH / 2 - i * PITCH
    for y in (0.5, 1.3, 2.1):                                                           # the rear gate's black rails, 5 cm into the dividers either side
        P["black2"].box(xc - 1.4, xc + 1.4, y, y + 0.08, -2.64, -2.56)
    # number plate frames standing on the roof over each stall (the game hangs a 0.9 m plate in each: centre 4.05 m up, 0.16 m out); the foot 5 cm into the roof
    P["gold"].add(plate_frame((xc - 0.6, xc + 0.6, 3.5, 4.6), (xc - 0.5, xc + 0.5, 3.6, 4.5), 0.0, 0.12))
for sx in (-1, 1):                                                                      # a Barn Red pennant on a short staff at each end of the roof
    P["black2"].box(sx * 8.95 - 0.04, sx * 8.95 + 0.04, 3.5, 5.3, -1.34, -1.26)
    P["barn"].poly([(sx * 8.99, 5.25), (sx * 8.99, 4.65), (sx * (8.99 + 1.0), 4.95)], -1.33, -1.27)

root = pivot("dn_gate6_door_a", (0, 0, 0))
P = parts(root, "dn_gate6_door_a", {"barn": 0.025, "gold": 0.012, "black2": 0.0})
P["barn"].box(-1.38, -0.02, 0.2, 2.3, -0.06, 0.06)
P["gold"].box(-1.4, 0.0, 2.22, 2.33, -0.09, 0.09)                                       # the top edge
P["gold"].box(-1.4, 0.0, 0.17, 0.3, -0.09, 0.09)                                        # the foot
P["gold"].box(-0.1, 0.0, 0.3, 2.22, -0.09, 0.09)                                        # the hinge side
P["black2"].box(-1.25, -0.2, 0.36, 0.8, 0.05, 0.065)                                    # a kick plate (a skin 5 mm proud, clear of the foot)

# =====================================================================================================
# dn_gate6_frame_b / dn_gate6_door_b: "The Gantry", open-topped: Barn Red end towers with starter's lamps, slim Black stall posts, and a lattice beam
# across the top whose Mint frames carry the numbers
# =====================================================================================================
root = pivot("dn_gate6_frame_b", (0, 0, 0))
P = parts(root, "dn_gate6_frame_b", {"barn": 0.03, "barn2": 0.0, "black": 0.025, "black2": 0.0, "gold": 0.015, "mint": 0.02, "saddle": 0.02, "glowred": 0.0, "glowmint": 0.0})
TX = SPAN / 2 + 0.25                                                                    # the towers' centres (0.6 m wide, so the whole gate is 19.1 m)
for sx in (-1, 1):
    x = sx * TX
    P["barn"].box(x - 0.3, x + 0.3, 0.02, 5.6, -2.0, 0.3)                               # the tower (its foot inside the plinth band)
    P["barn2"].box(x - 0.305, x + 0.305, 0.0, 0.6, -2.005, 0.305)                       # its plinth band (a skin 5 mm proud)
    P["gold"].box(x - 0.38, x + 0.38, 5.55, 5.72, -2.08, 0.38)                          # a gold cornice, 5 cm down over the tower's top
    P["black"].box(x - 0.08, x + 0.08, 5.67, 6.25, -0.93, -0.77)                        # the lamp post, from inside the cornice
    P["black"].box(x - 0.2, x + 0.2, 6.2, 6.3, -1.05, -0.65)                            # its cup, the post 5 cm into it
    P["glowred" if sx < 0 else "glowmint"].cylc(x, 6.48, -0.85, 0.17, 0.36, 12)       # the starter's lamps: red on one tower, mint on the other; the cup holds them 2 cm deep
for i in range(1, N):                                                                   # the stall posts: slim, from the sill up into the beam's bottom chord
    x = SPAN / 2 - i * PITCH
    P["black"].box(x - 0.08, x + 0.08, 0.1, 3.95, -2.25, 0.0)
    for sd in (-1, 1):
        P["mint"].box(x + sd * 0.06, x + sd * 0.14, 0.45, 2.2, -2.1, -0.25)            # a Mint pad either side, 2 cm into the post
P["saddle"].box(-TX + 0.25, TX - 0.25, 0.03, 0.14, -2.3, 0.15)                          # the sill: tower to tower, 5 cm into each
# the beam: two chords from tower to tower (5 cm into each), the bays between them laced with gold diagonals
for y0, y1 in ((3.9, 4.06), (4.86, 5.02)):
    P["black"].box(-TX + 0.25, TX - 0.25, y0, y1, -0.11, 0.09)
for i in range(N):
    xc = SPAN / 2 - PITCH / 2 - i * PITCH
    for sd in (-1, 1):                                                                  # a diagonal down each side of the stall's number, its ends sunk into the chords
        P["gold"].bm((xc + sd * 0.72, 4.0, -0.01), (xc + sd * 1.42, 4.93, -0.01), 0.04, 6)
    # the number frame, on the beam's face over each stall (the game hangs a 0.9 m plate in it: centre 4.45 m up, 0.24 m out); 3 cm into the chords
    P["mint"].add(plate_frame((xc - 0.58, xc + 0.58, 4.03, 4.89), (xc - 0.48, xc + 0.48, 4.08, 4.84), 0.04, 0.2))
for i in range(1, N):                                                                   # the beam's verticals, over each post
    x = SPAN / 2 - i * PITCH
    P["black2"].box(x - 0.05, x + 0.05, 4.0, 4.92, -0.08, 0.06)
for i in range(N):
    xc = SPAN / 2 - PITCH / 2 - i * PITCH
    P["black2"].box(xc - 1.45, xc + 1.45, 1.6, 1.68, -2.24, -2.16)                    # a rear bar per stall, into the posts either side

root = pivot("dn_gate6_door_b", (0, 0, 0))
P = parts(root, "dn_gate6_door_b", {"mint": 0.025, "barn": 0.0, "gold": 0.012, "black2": 0.0})
P["mint"].box(-1.38, -0.02, 0.18, 2.0, -0.05, 0.05)
P["barn"].poly([(-1.38, 0.55), (-1.38, 0.95), (-0.02, 1.75), (-0.02, 1.35)], 0.05, 0.055)  # a Barn Red diagonal band across the face (a skin 5 mm proud)
P["barn"].poly([(-1.38, 0.55), (-1.38, 0.95), (-0.02, 1.75), (-0.02, 1.35)], -0.055, -0.05)
P["gold"].box(-1.4, 0.0, 1.94, 2.04, -0.08, 0.08)                                       # the top edge
P["gold"].box(-0.09, 0.0, 0.2, 1.96, -0.08, 0.08)                                       # the hinge side, from 2 cm into the foot into the top edge
P["black2"].box(-1.4, -0.01, 0.14, 0.22, -0.075, 0.075)                                 # a rubber foot

finish_and_export()
