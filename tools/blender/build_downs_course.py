# Chimera Downs' course kit for Blender (4.2+ / 5.x), exported to src/assets/downs-course.glb: the rail, the furlong poles, the finish arch, the photo-finish tower, the lamp,
# the flood mast, the flag mast and the starting gate (docs/downs-layouts.md).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_course.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_course.py
#
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0. One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_rail        5 m of the course's rail, 1 m tall, running along +x from its post at x = 0: a Mint post with a gold cap, a Black top rail and a Mint mid rail (the game scales it in y for 1.2 m)
#   dn_furlong     a distance pole, 3.4 m: Mint and Barn Red bands, a Black-framed Money board (the game writes the distance on it, facing +z) and a gold cap
#   dn_finish_arch the finish gantry, 23.6 m between its pylons along x, 11.4 m tall: Mint pylons with gold bands, a beam with a Black and Mint chequer on both faces, a Black panel
#                  for the word FINISH on each, a camera pod under the middle, two Barn Red pennants
#   dn_photo_tower the photo-finish tower, 2.6 m square at the foot, 9 m tall: a Mint shaft, a glazed box on top with its lens toward -z, a gold cap, a mast
#   dn_lamp        the Downs' lamp, 6.4 m: a Black post on a Mint plinth, a gold collar and a Barn Red band, a gooseneck with a lit globe
#   dn_flood       a flood mast, 14 m: a Black pole with a bank of six lit lamps turned toward +z, on a gold footing
#   dn_mast        a flag mast, 11 m: a Mint pole, a gold ball, a Barn Red pennant (slot `cloth`, which the game recolours) 3.2 x 1.5 m streaming toward +x
#   dn_crossing    a track crossing's barrier post, 1.75 m: a Mint foot, a Black post with a gold cap, a raised Barn Red and Mint boom (leaning toward +x) and a red lamp
#   dn_gate_frame  the starting gate, 16.4 m across x, 3.4 m deep (z = -3.2 to 0.2), 4.2 m tall, four stalls: Mint and padded dividers, a Black roof with a gold lip, number plate frames
#   dn_gate_door   one stall door, hinged at x = 0 and reaching toward -x (1.9 m), 2.6 m tall, Barn Red with gold edging; the game hangs two on each stall and turns them open
DOWNS_OUT = "downs-course.glb"
DOWNS_COLL = "MoonDownsCourse"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# =====================================================================================================
# dn_rail
# =====================================================================================================
root = pivot("dn_rail", (0, 0, 0))
P = parts(root, "dn_rail", {"mint": 0.015, "gold": 0.01, "black": 0.012, "mint2": 0.0})
P["mint"].box(-0.075, 0.075, 0.0, 1.0, -0.075, 0.075)
P["gold"].box(-0.11, 0.11, 1.0, 1.07, -0.11, 0.11)
P["black"].box(0.075, 5.0, 0.86, 0.98, -0.055, 0.055)
P["mint2"].box(0.075, 5.0, 0.44, 0.52, -0.03, 0.03)

# =====================================================================================================
# dn_furlong
# =====================================================================================================
root = pivot("dn_furlong", (0, 0, 0))
P = parts(root, "dn_furlong", {"mint": 0.02, "barn": 0.02, "gold": 0.015, "black": 0.02, "money2": 0.0})
for i in range(5):
    (P["barn"] if i % 2 == 0 else P["mint"]).cylc(0, 0.34 + i * 0.5, 0, 0.1, 0.5, 8)    # the pole, banded
P["gold"].cylc(0, 2.93, 0, 0.13, 0.12, 8)
P["black"].box(-0.85, 0.85, 2.38, 3.34, 0.1, 0.22)                                      # the board's frame
P["money2"].box(-0.75, 0.75, 2.46, 3.26, 0.2, 0.26)
P["gold"].cylc(0, 3.42, 0.16, 0.1, 0.16, 8)

# =====================================================================================================
# dn_finish_arch
# =====================================================================================================
root = pivot("dn_finish_arch", (0, 0, 0))
P = parts(root, "dn_finish_arch", {"mint": 0.07, "mint2": 0.0, "gold": 0.02, "black": 0.03, "barn": 0.02, "black2": 0.0})
for sx in (-1, 1):
    x = sx * 11.8
    P["mint"].box(x - 0.7, x + 0.7, 0.5, 11.4, -0.8, 0.8)
    P["gold"].box(x - 0.78, x + 0.78, 1.8, 2.3, -0.88, 0.88)
    P["gold"].box(x - 0.78, x + 0.78, 8.6, 9.1, -0.88, 0.88)
    P["mint2"].box(x - 1.0, x + 1.0, 0.0, 0.6, -1.1, 1.1)                                # a foot
    P["gold"].box(x - 0.85, x + 0.85, 11.4, 11.62, -0.95, 0.95)                         # cap
    P["black"].bm((x, 11.6, 0.0), (x, 15.4, 0.0), 0.06)                                 # the mast on each pylon, with a pennant
    P["barn"].poly([(0, 0), (2.0, -0.35), (0, -0.8)], -0.03, 0.03, t=(x + (0.0 if sx < 0 else 0.0), 15.3, 0))
P["mint"].box(-12.7, 12.7, 9.2, 11.0, -0.8, 0.8)                                        # the beam
P["gold"].box(-12.8, 12.8, 11.0, 11.2, -0.9, 0.9)
P["gold"].box(-12.8, 12.8, 9.0, 9.2, -0.9, 0.9)
for side in (-1, 1):                                                                    # a chequer along each face either side of the word: 12 squares across, two rows
    z0, z1 = (0.8, 0.84) if side > 0 else (-0.84, -0.8)
    for sgn in (-1, 1):
        for i in range(12):
            for row in range(2):
                if (i + row) % 2 == 0:
                    xa = 2.4 + i * 0.8
                    P["black"].box(min(sgn * xa, sgn * (xa + 0.8)), max(sgn * xa, sgn * (xa + 0.8)), 9.3 + row * 0.8, 10.1 + row * 0.8, z0, z1)
    P["black"].box(-2.2, 2.2, 9.3, 10.9, z0, z1)                                         # the word FINISH goes here
P["black2"].box(-0.8, 0.8, 8.2, 9.0, -0.8, 0.8)                                         # camera pod
P["black"].cylc(0, 8.6, 1.0, 0.18, 0.5, 10, rot=(PI / 2, 0, 0))
P["black"].cylc(0, 8.6, -1.0, 0.18, 0.5, 10, rot=(PI / 2, 0, 0))

# =====================================================================================================
# dn_photo_tower
# =====================================================================================================
root = pivot("dn_photo_tower", (0, 0, 0))
P = parts(root, "dn_photo_tower", {"mint": 0.05, "mint2": 0.02, "gold": 0.02, "black": 0.03, "glasswarm": 0.0, "black2": 0.0})
P["mint2"].box(-1.5, 1.5, 0.0, 0.5, -1.5, 1.5)                                          # footing
P["mint"].box(-1.3, 1.3, 0.5, 5.0, -1.3, 1.3)                                           # shaft
for sx in (-1, 1):
    for sz in (-1, 1):
        P["black"].box(sx * 1.3 - 0.12, sx * 1.3 + 0.12, 0.55, 4.95, sz * 1.3 - 0.12, sz * 1.3 + 0.12)
P["gold"].box(-1.5, 1.5, 4.8, 5.1, -1.5, 1.5)
P["mint"].box(-2.6, 2.6, 5.1, 7.9, -2.1, 2.1)                                           # the glazed box
P["black"].box(-2.45, 2.45, 5.35, 7.65, -2.14, -2.1)                                    # (its front is -z, toward the track; the frame sits behind the pane, so it shows as a border)
P["glasswarm"].box(-2.3, 2.3, 5.5, 7.5, -2.18, -2.14)
P["black"].box(-0.05, 0.05, 5.5, 7.5, -2.22, -2.18)
for sx in (-1, 1):
    P["glasswarm"].box(min(sx * 2.62, sx * 2.6), max(sx * 2.62, sx * 2.6), 5.5, 7.5, -1.5, 1.5)
P["gold"].box(-2.8, 2.8, 7.9, 8.15, -2.3, 2.3)                                          # the cap
P["black2"].cylc(0, 6.5, -2.6, 0.22, 0.9, 12, rot=(PI / 2, 0, 0))                      # a long lens, pointed down the line
P["black"].cylc(0, 6.5, -3.1, 0.27, 0.12, 12, rot=(PI / 2, 0, 0))
P["black"].bm((1.4, 8.15, 0.5), (1.4, 10.2, 0.5), 0.05)                                 # a mast

# =====================================================================================================
# dn_lamp
# =====================================================================================================
root = pivot("dn_lamp", (0, 0, 0))
P = parts(root, "dn_lamp", {"mint2": 0.02, "black": 0.02, "gold": 0.015, "barn": 0.015, "glowgold": 0.0, "mint": 0.02})
P["mint2"].cylc(0, 0.3, 0, 0.36, 0.6, 10, rt=0.3)
P["black"].cylc(0, 0.6 + 2.6, 0, 0.1, 5.2, 10, rt=0.075)
P["gold"].cylc(0, 0.75, 0, 0.17, 0.12, 10)
P["barn"].cylc(0, 4.0, 0, 0.14, 0.4, 10)
P["gold"].cylc(0, 5.9, 0, 0.14, 0.1, 10)
P["black"].path([(0, 5.8, 0), (0, 6.15, 0), (0.15, 6.4, 0), (0.45, 6.5, 0), (0.7, 6.4, 0)], 0.055, 6)    # the gooseneck
P["gold"].cylc(0.7, 6.3, 0, 0.2, 0.08, 10)
P["glowgold"].add(sphere(0.24, 12, 8), t=(0.7, 6.1, 0))

# =====================================================================================================
# dn_flood
# =====================================================================================================
root = pivot("dn_flood", (0, 0, 0))
P = parts(root, "dn_flood", {"black": 0.025, "gold": 0.015, "black2": 0.012, "glowmint": 0.0})
P["gold"].cylc(0, 0.2, 0, 0.5, 0.4, 8)
P["black"].cylc(0, 7.2, 0, 0.17, 14.0, 8, rt=0.11)
P["black2"].box(-1.7, 1.7, 13.4, 14.6, -0.15, 0.15)                                     # the head
for i in range(3):
    for j in range(2):
        x, y = -1.1 + i * 1.1, 13.7 + j * 0.62
        P["black"].box(x - 0.46, x + 0.46, y - 0.24, y + 0.24, 0.15, 0.4)               # a lamp housing
        P["glowmint"].box(x - 0.36, x + 0.36, y - 0.17, y + 0.17, 0.4, 0.44)
P["black"].bm((0, 12.2, 0), (-1.2, 13.4, 0), 0.06)
P["black"].bm((0, 12.2, 0), (1.2, 13.4, 0), 0.06)

# =====================================================================================================
# dn_mast
# =====================================================================================================
root = pivot("dn_mast", (0, 0, 0))
P = parts(root, "dn_mast", {"mint": 0.025, "gold": 0.015, "mint2": 0.0, "cloth": 0.015})
P["mint2"].cylc(0, 0.25, 0, 0.3, 0.5, 8, rt=0.22)
P["mint"].cylc(0, 5.5, 0, 0.11, 10.0, 8, rt=0.06)
P["gold"].add(sphere(0.2, 10, 8), t=(0, 10.62, 0))
for i in range(4):                                                                      # the pennant: four panels streaming away, each turned a little more
    x0, w = 0.08 + i * 0.8, 0.8
    y = 9.9 - i * 0.04
    P["cloth"].poly([(0, 0.75), (w, 0.75 - 0.18 * (1 if i < 3 else 1.8)), (w, -0.75 + 0.18 * (1 if i < 3 else 1.8)), (0, -0.75)], -0.02, 0.02, t=(x0, y, 0.12 * math.sin(i * 1.3 + 0.4)))

# =====================================================================================================
# dn_crossing
# =====================================================================================================
root = pivot("dn_crossing", (0, 0, 0))
P = parts(root, "dn_crossing", {"mint2": 0.02, "black2": 0.015, "barn": 0.015, "mint": 0.012, "gold": 0.012, "glowred": 0.0})
P["mint2"].box(-0.3, 0.3, 0.0, 0.3, -0.3, 0.3)
P["black2"].box(-0.12, 0.12, 0.3, 1.35, -0.12, 0.12)                                    # the post
P["gold"].box(-0.16, 0.16, 1.35, 1.45, -0.16, 0.16)
for i in range(6):                                                                      # the boom, raised: striped
    a0 = i * 0.75
    (P["barn"] if i % 2 == 0 else P["mint"]).bm((0.1 + a0 * 0.34, 1.4 + a0 * 0.94, 0.0), (0.1 + (a0 + 0.75) * 0.34, 1.4 + (a0 + 0.75) * 0.94, 0.0), 0.06)
P["black2"].box(-0.2, 0.2, 1.46, 1.66, -0.2, 0.2)                                       # the lamp housing
P["glowred"].add(sphere(0.13, 8, 6), t=(0, 1.74, 0))

# =====================================================================================================
# dn_gate_frame / dn_gate_door
# =====================================================================================================
root = pivot("dn_gate_frame", (0, 0, 0))
P = parts(root, "dn_gate_frame", {"mint": 0.03, "money2": 0.02, "black": 0.03, "gold": 0.015, "black2": 0.0, "barn2": 0.0})
SPAN = 16.4
for i in range(5):
    x = SPAN / 2 - i * (SPAN / 4)
    P["mint"].box(x - 0.18, x + 0.18, 0.2, 3.7, -3.1, 0.1)                              # a divider
    if 0 < i < 4:
        for s in (-1, 1):
            P["money2"].box(x + s * 0.18 - (0 if s > 0 else 0.1), x + s * 0.18 + (0.1 if s > 0 else 0), 0.3, 3.0, -2.9, -0.2)    # padding on both sides
P["black"].box(-SPAN / 2 - 0.2, SPAN / 2 + 0.2, 3.7, 4.25, -3.2, 0.2)                    # the roof
P["gold"].box(-SPAN / 2 - 0.25, SPAN / 2 + 0.25, 3.62, 3.76, 0.15, 0.3)                 # a gold lip over the doors
P["gold"].box(-SPAN / 2 - 0.25, SPAN / 2 + 0.25, 4.1, 4.3, 0.2, 0.34)
P["black2"].box(-SPAN / 2, SPAN / 2, 0.0, 0.2, -3.2, 0.2)                               # the floor frame
for i in range(4):                                                                      # the rear gates: black rails
    xc = SPAN / 2 - SPAN / 8 - i * (SPAN / 4)
    for y in (0.5, 1.4, 2.3):
        P["black2"].box(xc - 1.8, xc + 1.8, y, y + 0.08, -3.14, -3.06)
    # number plate frames standing on the roof over each stall (the live numbers are hung in them by the game: 0.9 m square, centre 4.85 m up, 0.13 m out)
    for dx, dy, w, h in ((0, 0.55, 1.3, 0.1), (0, -0.55, 1.3, 0.1), (-0.6, 0, 0.1, 1.1), (0.6, 0, 0.1, 1.1)):
        P["gold"].box(xc + dx - w / 2, xc + dx + w / 2, 4.85 + dy - h / 2, 4.85 + dy + h / 2, 0.0, 0.12)

root = pivot("dn_gate_door", (0, 0, 0))
P = parts(root, "dn_gate_door", {"barn": 0.025, "gold": 0.012, "black2": 0.0})
P["barn"].box(-1.88, -0.02, 0.2, 2.78, -0.06, 0.06)
P["gold"].box(-1.9, 0.0, 2.7, 2.8 + 0.03, -0.09, 0.09)                                  # the top edge
P["gold"].box(-1.9, 0.0, 0.17, 0.3, -0.09, 0.09)                                        # the foot
P["gold"].box(-0.1, 0.0, 0.3, 2.7, -0.09, 0.09)                                         # the hinge side
P["black2"].box(-1.7, -0.2, 0.3, 0.9, 0.06, 0.08)                                       # a kick plate

finish_and_export()
