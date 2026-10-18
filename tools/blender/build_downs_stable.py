# Chimera Downs stable yard and paddock kit for Blender (4.2+ / 5.x) -> src/assets/downs-stable.glb (docs/downs-layouts.md, layout B: stables behind the far stand, parade
# ring and weighing room in the infield, lawn picnic tables).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stable.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stable.py
#
# three.js axes (x right, y up, +z front), each model on y = 0. One material per mesh, named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_stable_block six boxes, 30 m along x, front (+z) at z = 0, body to z = -9, 2.4 m porch on Saddle posts: Barn Red walls, end walls clad in Mint (8 cm proud, so kick strip and
#                   eaves board end inside the cladding), six Dutch doors (Saddle lower half, upper open and dark) each with a bracket lantern and feed trough, Barn Red2 gable roof
#                   with Mint ridge and two louvred cupolas (bases sunk in), 7.4 m to the ridge
#   dn_hay_barn     24 m along x, 14 deep (z = 0 to -14), front +z: Barn Red walls with gambrel gable ends (one solid), Mint corner boards, Black-framed sliding door of two Mint
#                   leaves with X braces under a rail, two lit windows, a hayloft door and hoist beam on each gable, gambrel Barn Red2 roof as one 0.3 m slab (flat eave soffits,
#                   0.6 m past the gables), Mint ridge, louvred cupola
#   dn_pavilion     weighing room, 18 m along x, 10 deep (z = 0 to -10), front +z: 4.35 m Mint hall, Money2 dado, gold frieze, three lit windows, four-column porch whose beam carries
#                   a Black name board (the game writes WEIGHING ROOM at y = 4.48, z = 3.27), Barn Red hip roof with gold ridge on the walls and beam
#   dn_ring_gate    parade ring gate: two Mint posts 3.6 m apart with gold balls, Black2 bar at 2.3 m (ends in the posts), front +z
#   dn_hay          hay bale 1.2 x 0.6 x 0.6 m, Saddle, two flush Mint straps
#   dn_picnic       picnic table 2.4 x 1 m, two benches, sunshade (canopy takes the `accent` slot)
#
# Joints (outline rule, as for the arcades): outlined pieces never meet flush in one plane, or one's ink shell shows as a dark seam. A piece ending on another ends well inside
# it (shell buried) or meets it at a step of 5 cm or more; un-inked trims lie within 6 mm of their host; wall-mounted pieces start inside the wall at their own depths, so no
# two back faces share a plane.
DOWNS_OUT = "downs-stable.glb"
DOWNS_COLL = "MoonDownsStable"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())


def slab_profile(U, T):
    """Roof slab side profile [(z, y)] as one closed outline: underside U (polyline front eave to back eave) and U offset T outward (up), mitred at each knee."""
    n = []
    for (z0, y0), (z1, y1) in zip(U, U[1:]):
        l = math.hypot(z1 - z0, y1 - y0)
        n.append(((y1 - y0) / l, -(z1 - z0) / l))                                       # (outward normal: up and toward the segment's eave)
    O = [(U[0][0] + T * n[0][0], U[0][1] + T * n[0][1])]
    for j in range(1, len(U) - 1):
        a, b = n[j - 1], n[j]
        ca = U[j][0] * a[0] + U[j][1] * a[1] + T
        cb = U[j][0] * b[0] + U[j][1] * b[1] + T
        det = a[0] * b[1] - a[1] * b[0]
        O.append(((ca * b[1] - cb * a[1]) / det, (a[0] * cb - b[0] * ca) / det))
    O.append((U[-1][0] + T * n[-1][0], U[-1][1] + T * n[-1][1]))
    return O + U[::-1], O


def hip_roof(x0, x1, z0, z1, y0, h):
    """Hip roof, ridge along x: eaves rectangle at y0, ridge h above, inset half the depth from each end (four equal slopes). One closed solid."""
    zc, hd = (z0 + z1) / 2, (z1 - z0) / 2
    r0, r1 = x0 + hd, x1 - hd
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (r0, y0 + h, zc), (r1, y0 + h, zc)]
    f = [(0, 1, 2, 3), (3, 2, 5, 4), (1, 0, 4, 5), (0, 3, 4), (2, 1, 5)]
    return v, f


# =====================================================================================================
# dn_stable_block
# =====================================================================================================
root = pivot("dn_stable_block", (0, 0, 0))
P = parts(root, "dn_stable_block", {"barn": 0.04, "barn2": 0.04, "mint": 0.03, "mint2": 0.02, "saddle": 0.02, "saddle2": 0.015, "black": 0.02, "gold": 0.012, "glowgold": 0.0, "black2": 0.012})
P["mint2"].box(-15.3, 15.3, 0.0, 0.5, -9.2, 0.2)                                         # plinth
P["barn"].box(-15.0, 15.0, 0.5, 4.2, -9.0, 0.0)                                          # walls
for sx in (-1, 1):                                                                       # end-wall Mint cladding, 8 cm proud on end, front and back
    P["mint"].box(sx * 14.8, sx * 15.08, 0.45, 4.25, -9.08, 0.08)
P["mint"].box(-14.9, 14.9, 0.5, 0.9, 0.0, 0.05)                                         # Mint kick strip on the plinth, ends 10 cm into the cladding
P["mint"].box(-14.9, 14.9, 3.9, 4.18, 0.0, 0.05)                                        # eaves board, top in the roof
for i in range(6):
    x = -12.5 + 5.0 * i
    P["mint"].box(x - 1.0, x + 1.0, 0.5, 3.4, 0.0, 0.08)                                 # door frame (the strips run on inside it)
    P["black"].box(x - 0.7, x + 0.7, 1.95, 3.2, 0.08, 0.1)                               # open upper half: dark, on the leaf, 5 cm in from its sides
    P["saddle"].box(x - 0.75, x + 0.75, 0.55, 1.95, 0.08, 0.14)                          # lower half, shut
    P["saddle2"].box(x - 0.7, x + 0.7, 1.0, 1.06, 0.14, 0.17)                            # plank line
    P["gold"].box(x + 0.5, x + 0.62, 1.2, 1.5, 0.14, 0.2)                                # latch
    lx = x + 1.23                                                                       # bracket lantern: base, lit glass, cap, bracket end in the cap
    P["black2"].box(lx - 0.04, lx + 0.04, 2.53, 2.63, 0.0, 0.5)
    P["black2"].box(lx - 0.11, lx + 0.11, 2.1, 2.18, 0.38, 0.6)
    P["glowgold"].box(lx - 0.08, lx + 0.08, 2.18, 2.48, 0.41, 0.57)
    P["black2"].box(lx - 0.13, lx + 0.13, 2.48, 2.58, 0.36, 0.62)
    P["saddle2"].box(x - 0.6, x + 0.6, 0.0, 0.45, 0.6, 1.3)                              # feed trough, on the porch floor
# porch: posts, beam, floor
P["saddle2"].box(-15.2, 15.2, 0.0, 0.12, 0.2, 2.4)
for i in range(7):
    x = -15.0 + 5.0 * i
    P["saddle"].box(x - 0.13, x + 0.13, 0.12, 4.0, 2.05, 2.31)
P["saddle"].box(-15.2, 15.2, 3.95, 4.2, 2.0, 2.36)
# roof: gable prism over the block, eaves 0.6 m past the porch beam and back wall
P["barn2"].polyx([(-9.6, 4.15), (2.6, 4.15), (2.6, 4.3), (-3.5, 7.2), (-9.6, 4.3)], -15.6, 15.6)
P["mint"].box(-15.7, 15.7, 7.05, 7.35, -3.75, -3.25)                                      # ridge cap
for x in (-8.0, 8.0):                                                                    # louvred cupolas, bases sunk into the roof (slopes 6.99 m up at their faces)
    P["mint2"].box(x - 1.0, x + 1.0, 6.8, 8.5, -3.95, -3.05)
    for i in range(4):
        P["black"].box(x - 0.8, x + 0.8, 7.55 + i * 0.25, 7.65 + i * 0.25, -4.0, -3.95)
        P["black"].box(x - 0.8, x + 0.8, 7.55 + i * 0.25, 7.65 + i * 0.25, -3.05, -3.0)
    P["barn2"].add(hip(0.15, 1.41421, 0.9), t=(x, 8.9, -3.5), s=(1.15, 1.0, 0.6))      # hipped cap, 15 cm over each face, foot 5 cm into the body
    P["gold"].bm((x, 9.3, -3.5), (x, 10.0, -3.5), 0.04)

# =====================================================================================================
# dn_hay_barn
# =====================================================================================================
root = pivot("dn_hay_barn", (0, 0, 0))
P = parts(root, "dn_hay_barn", {"barn": 0.05, "barn2": 0.04, "mint": 0.03, "mint2": 0.02, "saddle": 0.02, "black": 0.025, "gold": 0.012, "glasswarm": 0.0, "black2": 0.015})
BR = Acc("dn_hay_barn_brace", "barn", root, 0.02)                                       # (door braces: Barn Red, thin line for a thin part)
GAB = [(0.0, 6.0), (-1.6, 9.0), (-7.0, 11.6), (-12.4, 9.0), (-14.0, 6.0)]                 # wall top: gambrel knees and ridge
P["mint2"].box(-12.2, 12.2, 0.0, 0.5, -14.2, 0.2)
P["barn"].polyx([(0.0, 0.5)] + GAB + [(-14.0, 0.5)], -12.0, 12.0)                         # walls and gables, one solid
for sx in (-1, 1):                                                                       # Mint corner boards, one piece per corner, 8 cm proud on both faces
    for zc, zs in ((0.0, 1), (-14.0, -1)):
        z0, z1 = zc + zs * 0.08, zc - zs * 0.25                                        # (z0 outer face; top climbs the gambrel's first pitch, 5 cm into the slab)
        top = 6.0 + 0.25 * 3.0 / 1.6 + 0.05
        prof = [(z0, 0.45), (z0, 6.05), (zc, 6.05), (z1, top), (z1, 0.45)] if zs > 0 else [(z1, 0.45), (z1, top), (zc, 6.05), (z0, 6.05), (z0, 0.45)]
        P["mint"].polyx(prof, min(sx * 11.75, sx * 12.08), max(sx * 11.75, sx * 12.08))
P["mint"].box(-11.85, 11.85, 0.48, 0.9, -0.05, 0.05)                                    # kick strip, ends in the corner boards, foot in the plinth
# sliding door: Black frame up to the soffit, two Mint leaves with X braces, rail hung from the eave
P["black"].box(-4.4, 4.4, 0.46, 6.0, -0.1, 0.1)
for sx in (-1, 1):
    x0, x1 = (0.05, 4.2) if sx > 0 else (-4.2, -0.05)
    P["mint"].box(x0, x1, 0.55, 5.8, 0.1, 0.2)
    BR.bm((x0 + 0.1, 0.8, 0.22), (x1 - 0.1, 5.5, 0.22), 0.09)
    BR.bm((x0 + 0.1, 5.5, 0.22), (x1 - 0.1, 0.8, 0.22), 0.09)
P["black2"].box(-4.6, 4.6, 5.8, 6.05, -0.08, 0.5)                                       # door rail, top in the soffit
for x in (-8.0, 8.0):                                                                    # lit windows: frame, flush pane, glazing bar
    P["black2"].box(x - 1.1, x + 1.1, 2.4, 4.1, -0.05, 0.06)
    P["glasswarm"].box(x - 0.95, x + 0.95, 2.55, 3.95, 0.06, 0.064)
    P["black2"].box(x - 0.04, x + 0.04, 2.55, 3.95, 0.064, 0.094)
# hayloft door high on each gable, under a hoist beam reaching past the roof overhang
for sx in (-1, 1):
    fx = lambda a, b: (sx * a, sx * b)
    P["black"].box(*fx(11.95, 12.06), 7.3, 9.3, -8.2, -5.8)
    P["mint"].box(*fx(12.06, 12.12), 7.4, 9.2, -8.1, -7.05)
    P["mint"].box(*fx(12.06, 12.12), 7.4, 9.2, -6.95, -5.9)
    P["black2"].box(*fx(11.6, 14.0), 10.2, 10.42, -7.12, -6.88)
    P["black2"].bm((sx * 13.8, 10.2, -7.0), (sx * 13.8, 9.0, -7.0), 0.03)
    P["gold"].add(sphere(0.15, 6, 5), t=(sx * 13.8, 8.95, -7.0))
# gambrel roof: one 0.3 m slab on the wall top, flat soffits 0.7 m out at the eaves, 0.6 m past the gables
ROOF, TOP = slab_profile([(0.7, 6.0)] + GAB + [(-14.7, 6.0)], 0.3)
P["barn2"].polyx(ROOF, -12.6, 12.6)
RY = TOP[3][1]                                                                           # ridge top (11.93)
P["mint"].box(-12.75, 12.75, RY - 0.23, RY + 0.15, -7.3, -6.7)                           # ridge cap
P["mint2"].box(-1.2, 1.2, RY - 0.53, RY + 1.37, -7.6, -6.4)                              # cupola, base in the slab
for i in range(4):
    for z0, z1 in ((-7.65, -7.6), (-6.4, -6.35)):
        P["black"].box(-1.0, 1.0, RY + 0.32 + i * 0.26, RY + 0.42 + i * 0.26, z0, z1)
P["barn2"].add(hip(0.157, 1.41421, 0.9), t=(0, RY + 1.77, -7.0), s=(1.35, 1.0, 0.75))
P["gold"].bm((0, RY + 2.17, -7.0), (0, RY + 2.97, -7.0), 0.04)

# =====================================================================================================
# dn_pavilion
# =====================================================================================================
root = pivot("dn_pavilion", (0, 0, 0))
P = parts(root, "dn_pavilion", {"mint": 0.04, "mint2": 0.02, "money2": 0.0, "barn": 0.035, "gold": 0.015, "black": 0.025, "glasswarm": 0.0, "saddle2": 0.0})
P["mint2"].box(-9.2, 9.2, 0.0, 0.4, -10.2, 3.2)
P["saddle2"].box(-8.9, 8.9, 0.4, 0.405, 0.02, 3.0)                                       # porch boards, flush on the plinth
P["mint"].box(-9.0, 9.0, 0.4, 4.75, -10.0, 0.0)                                         # hall, as tall as the porch beam so the roof rests on both
P["money2"].box(-9.006, 9.006, 0.38, 1.3, -10.006, 0.006)                                # dado, flush round it
P["gold"].box(-9.1, 9.1, 4.35, 4.6, -10.1, 0.1)                                          # gold frieze under the eaves
for x in (-5.5, 0.0, 5.5):                                                               # three lit windows: frame, flush pane, glazing bar
    P["black"].box(x - 1.3, x + 1.3, 1.55, 3.3, -0.05, 0.06)
    P["glasswarm"].box(x - 1.15, x + 1.15, 1.7, 3.15, 0.06, 0.064)
    P["black"].box(x - 0.04, x + 0.04, 1.7, 3.15, 0.064, 0.094)
for x in (-8.4, -2.8, 2.8, 8.4):                                                         # porch columns: square base, shaft, gold capital under the beam
    P["mint2"].box(x - 0.35, x + 0.35, 0.38, 0.55, 2.45, 3.15)
    P["mint"].cylc(x, (0.45 + 4.15) / 2, 2.8, 0.26, 4.15 - 0.45, 12)
    P["gold"].cylc(x, 4.125, 2.8, 0.34, 0.15, 12)
P["mint2"].box(-9.0, 9.0, 4.2, 4.75, 2.4, 3.2)                                           # porch beam (sign on its front)
P["black"].box(-5.0, 5.0, 4.3, 4.65, 3.2, 3.26)
P["barn"].add(hip_roof(-9.7, 9.7, -10.7, 3.7, 4.75, 3.0))                                # hip roof: 0.7 m eaves round the hall, 0.5 m past the porch beam
P["gold"].box(-2.6, 2.6, 7.6, 7.85, -3.7, -3.3)                                          # ridge

# =====================================================================================================
# dn_ring_gate
# =====================================================================================================
root = pivot("dn_ring_gate", (0, 0, 0))
P = parts(root, "dn_ring_gate", {"mint": 0.025, "gold": 0.015, "black2": 0.015})
for sx in (-1, 1):
    P["mint"].boxc(sx * 1.8, 1.25, 0, 0.3, 2.5, 0.3)
    P["gold"].add(sphere(0.2, 8, 6), t=(sx * 1.8, 2.62, 0))                              # (sunk 8 cm into the post top)
P["black2"].box(-1.75, 1.75, 2.2, 2.35, -0.06, 0.06)                                     # bar, ends 10 cm into the posts

# =====================================================================================================
# dn_hay
# =====================================================================================================
root = pivot("dn_hay", (0, 0, 0))
P = parts(root, "dn_hay", {"saddle": 0.02, "mint": 0.0})
P["saddle"].box(-0.6, 0.6, 0.0, 0.6, -0.3, 0.3)
for x in (-0.3, 0.3):
    P["mint"].box(x - 0.025, x + 0.025, 0.01, 0.605, -0.305, 0.305)                      # (5 mm proud: straps have no outline)

# =====================================================================================================
# dn_picnic
# =====================================================================================================
root = pivot("dn_picnic", (0, 0, 0))
P = parts(root, "dn_picnic", {"saddle": 0.015, "black2": 0.012, "mint": 0.02, "accent": 0.025, "gold": 0.01})
P["saddle"].box(-1.2, 1.2, 0.74, 0.8, -0.5, 0.5)
for sz in (-1, 1):
    P["saddle"].box(-1.2, 1.2, 0.42, 0.47, sz * 0.9 - 0.18, sz * 0.9 + 0.18)
for sx in (-1, 1):
    for sz in (-1, 1):
        P["black2"].bm((sx * 0.95, 0.0, sz * 0.45), (sx * 0.6899, 0.77, sz * 0.1379), 0.04)   # legs, tops 3 cm up inside the table (a slanted end would show under it)
    P["black2"].box(sx * 0.95 - 0.03, sx * 0.95 + 0.03, 0.0, 0.42, -0.95, 0.95)
P["mint"].cylc(0, 1.3, 0, 0.035, 2.5, 6)
P["accent"].cylc(0, 2.5, 0, 0.05, 0.5, 10, rt=0.05)                                      # (collar round the pole top, up into the canopy)
P["accent"].lath([(0.0, 2.8), (1.0, 2.62), (1.8, 2.35), (1.8, 2.3), (1.0, 2.55), (0.0, 2.72)], segs=10)
P["gold"].add(sphere(0.07, 6, 5), t=(0, 2.85, 0))

finish_and_export()
