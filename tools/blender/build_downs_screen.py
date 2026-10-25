# Chimera Downs' screen drum and winners' podium for Blender (4.2+ / 5.x), exported to src/assets/downs-screen.glb (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_screen.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_screen.py
#
# three.js axes (x right, y up, +z front), each model on y = 0, origin on the ground. One material per mesh, named after a
# slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_drum    infield scoreboard drum: 10 x 10 Mint core pylon to 18 m on a Money plinth, gold bands, lit slits, Black
#              corner pilasters and Black struts out to the drum. The drum: Black shell 41 x 15 m (y 17.2 to 38.8) in a
#              Mint bezel, one sleeve 41.6 x 15.6 m from y 16.9 (sleeve()) with four openings for the live screens: 40 x 20 m
#              on the long faces (z = +-7.5), 14 x 20 m on the ends (x = +-20.5), bottom edges at y = 18, a gold sill under
#              each; gold ring round the sleeve's foot, Mint soffit recessed 10 cm with lit strips, Mint cap deck
#              overhanging the sleeve, Barn Red parapet with gold coping, flood lamps, beacon mast
#   dn_podium  winners' podiums, 19.2 x 5 m, facing +z: Mint platform; Gold first step (1.4 m, centre), Mint second
#              (1.0 m, -x), Saddle third (0.7 m, +x), each 6 x 3.5 m with a Black nosing; Black backdrop 16 x 6 m in one gold
#              frame; Barn Red valance with pennants in one piece; light bar on the frame; two lamp posts. An 11 x 1.4 m
#              plate is left for the game's name board (centre 4.6 m up, 0.08 m in front of the backdrop face at z = -2.25;
#              nothing in front of the backdrop between y 3.9 and 5.3, x +-5.5)
# Seams: inked parts meeting flush in one plane show one's ink through the other. So what reads as one surface is one mesh
# (sleeve, rings, podium frame and valance), and real joints are steps (sills, cap overhang, coping, nosings).
DOWNS_OUT = "downs-screen.glb"
DOWNS_COLL = "MoonDownsScreen"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())


def sleeve(xo, zo, xi, zi, y0, y1, holes=None):
    """A rectangular tube round y as ONE closed mesh: outer half-sizes (xo, zo), inner (xi, zi), y0 to y1. The sides share
    their mitre edges, so no seam shows at a corner. `holes` maps a side ('+z', '-z', '+x', '-x') to an opening
    (a0, a1, b0, b1): a along the side (x on a z side, z on an x side), b up."""
    holes = holes or {}
    V, F, idx = [], [], {}

    def v(p):
        key = tuple(round(c, 6) for c in p)
        if key not in idx:
            idx[key] = len(V)
            V.append(p)
        return idx[key]
    # sides run anticlockwise seen from above, corner to corner, so neighbours share ends
    sides = (
        ("+z", lambda a, y, o: (a, y, zo if o else zi), (-xo, xo), (-xi, xi)),
        ("+x", lambda a, y, o: (xo if o else xi, y, a), (zo, -zo), (zi, -zi)),
        ("-z", lambda a, y, o: (a, y, -zo if o else -zi), (xo, -xo), (xi, -xi)),
        ("-x", lambda a, y, o: (-xo if o else -xi, y, a), (-zo, zo), (-zi, zi)),
    )
    for name, P_, (oa, ob), (ia, ib) in sides:
        h = holes.get(name)

        def face(o, a0, a1):
            O = [v(P_(a0, y0, o)), v(P_(a1, y0, o)), v(P_(a1, y1, o)), v(P_(a0, y1, o))]
            if not h:
                F.append(tuple(O))
                return None
            h0, h1 = (h[0], h[1]) if a1 > a0 else (h[1], h[0])                         # opening corners in the face's winding order
            H = [v(P_(h0, h[2], o)), v(P_(h1, h[2], o)), v(P_(h1, h[3], o)), v(P_(h0, h[3], o))]
            for k in range(4):
                F.append((O[k], O[(k + 1) % 4], H[(k + 1) % 4], H[k]))
            return H
        Ho, Hi = face(True, oa, ob), face(False, ia, ib)
        if Ho:
            for k in range(4):                                                          # opening reveals
                F.append((Ho[k], Ho[(k + 1) % 4], Hi[(k + 1) % 4], Hi[k]))
        F.append((v(P_(oa, y1, True)), v(P_(ob, y1, True)), v(P_(ib, y1, False)), v(P_(ia, y1, False))))
        F.append((v(P_(oa, y0, True)), v(P_(ob, y0, True)), v(P_(ib, y0, False)), v(P_(ia, y0, False))))
    return V, F                                                                          # mesh() turns every face outward


# =====================================================================================================
# dn_drum
# =====================================================================================================
root = pivot("dn_drum", (0, 0, 0))
P = parts(root, "dn_drum", {"mint": 0.06, "mint2": 0.03, "money2": 0.03, "gold": 0.025, "black": 0.04, "black2": 0.03, "barn": 0.04, "glasswarm": 0.0, "glowgold": 0.0, "glowred": 0.0}, solid=True)
# core: a plinth (60 cm proud, so inked like any block), the pylon on it, a Black pilaster round each corner from plinth to soffit
P["money2"].box(-5.6, 5.6, 0.0, 0.8, -5.6, 5.6)
P["mint"].box(-5.0, 5.0, 0.8, 17.4, -5.0, 5.0)
for sx in (-1, 1):
    for sz in (-1, 1):
        P["black2"].box(sx * 5.0 - 0.3, sx * 5.0 + 0.3, 0.75, 17.3, sz * 5.0 - 0.3, sz * 5.0 + 0.3)        # foot 5 cm into the plinth
for y in (3.0, 15.0):                                                                   # gold bands, 20 cm proud, ending in the pilasters (30 cm)
    P["gold"].box(-5.2, 5.2, y, y + 0.5, -5.2, 5.2)
for sf in (-1, 1):                                                                      # lit slits on all four faces (frames behind the panes)
    for off in (-2.0, 2.0):
        P["black"].box(off - 0.75, off + 0.75, 5.0, 12.0, sf * 5.0, sf * 5.0 + sf * 0.04)
        P["glasswarm"].box(off - 0.6, off + 0.6, 5.2, 11.8, sf * 5.04, sf * 5.04 + sf * 0.03)
        P["black"].box(sf * 5.0, sf * 5.0 + sf * 0.04, 5.0, 12.0, off - 0.75, off + 0.75)
        P["glasswarm"].box(sf * 5.04, sf * 5.04 + sf * 0.03, 5.2, 11.8, off - 0.6, off + 0.6)
# struts from the pilasters up through the soffit (y 17) into the shell, entering the underside with their whole section
for sx in (-1, 1):
    for sz in (-1, 1):
        P["black2"].bm((sx * 5.0, 12.5, sz * 5.0), (sx * 16.17, 17.5, sz * 6.70), 0.28)
        P["black2"].bm((sx * 5.0, 15.5, sz * 5.0), (sx * 12.06, 17.5, sz * 6.18), 0.2)
# drum: Black shell in a 0.3 m Mint sleeve (one mesh, four openings), the sleeve running 0.3 m below the shell
P["black2"].box(-20.5, 20.5, 17.2, 38.8, -7.5, 7.5)
P["mint2"].add(sleeve(20.8, 7.8, 20.5, 7.5, 16.9, 38.8, {
    "+z": (-20.0, 20.0, 18.0, 38.0), "-z": (-20.0, 20.0, 18.0, 38.0), "+x": (-7.0, 7.0, 18.0, 38.0), "-x": (-7.0, 7.0, 18.0, 38.0)}))
for sf in (-1, 1):                                                                      # gold sill under each opening: 15 cm proud, ends on the stiles,
    z0, z1 = (7.6, 7.95) if sf > 0 else (-7.95, -7.6)                                  # back 20 cm into the bezel, top 5 cm under the lip (a step, and
    P["gold"].box(-20.3, 20.3, 17.75, 17.95, z0, z1)                                   # nothing in front of the screens, bottom edge 18)
    x0, x1 = (20.6, 20.95) if sf > 0 else (-20.95, -20.6)
    P["gold"].box(x0, x1, 17.75, 17.95, -7.3, 7.3)
P["gold"].add(sleeve(20.9, 7.9, 20.7, 7.7, 16.85, 17.05))                                # gold ring round the sleeve's foot (10 cm proud, 5 cm below)
# underside: Mint soffit recessed 10 cm, lit strips half sunk in
P["mint2"].box(-20.5, 20.5, 17.0, 17.2, -7.5, 7.5)
for z in (-4.5, 0.0, 4.5):
    P["glowgold"].box(-17.0, 17.0, 16.995, 17.005, z - 0.25, z + 0.25)
# cap: Mint deck overhanging 0.3 m, Barn Red parapet 10 cm back from its edge, gold coping overhanging both ways, beacon mast
P["mint2"].box(-21.1, 21.1, 38.8, 39.3, -8.1, 8.1)
P["barn"].add(sleeve(21.0, 8.0, 20.5, 7.5, 39.3, 40.1))
P["gold"].add(sleeve(21.1, 8.1, 20.4, 7.4, 40.1, 40.3))
for x in (-15.0, -7.5, 0.0, 7.5, 15.0):                                                 # flood lamps on the deck inside the parapet, lenses on top
    for sf in (-1, 1):                                                                  # (lit upward, seen over the coping; an outer-face lens would face the parapet)
        P["black2"].box(x - 0.6, x + 0.6, 39.3, 40.5, sf * 6.8 - 0.4, sf * 6.8 + 0.4)
        P["glowgold"].box(x - 0.45, x + 0.45, 40.495, 40.505, sf * 6.8 - 0.3, sf * 6.8 + 0.3)     # half sunk, 5 mm proud
P["black2"].bm((0, 39.3, 0), (0, 45.0, 0), 0.12)
P["gold"].add(sphere(0.35, 10, 8), t=(0, 45.2, 0))
P["glowred"].add(sphere(0.28, 10, 8), t=(0, 45.8, 0))

# =====================================================================================================
# dn_podium
# =====================================================================================================
root = pivot("dn_podium", (0, 0, 0))
P = parts(root, "dn_podium", {"mint": 0.03, "mint2": 0.02, "gold": 0.025, "saddle": 0.025, "black": 0.03, "black2": 0.02, "barn": 0.02, "glowgold": 0.012}, solid=True)
P["mint2"].box(-9.6, 9.6, 0.0, 0.25, -2.65, 2.5)                                        # platform (steps 10 cm in from its ends, frame 15 cm in from its back)
P["gold"].box(-9.65, 9.65, 0.2, 0.3, 2.4, 2.55)                                         # gold lip along the front edge
for slot, x, h in (("mint", -6.5, 1.0), ("gold", 0.0, 1.4), ("saddle", 6.5, 0.7)):      # steps: 2nd, 1st, 3rd
    P[slot].box(x - 3.0, x + 3.0, 0.25, h, -1.5, 2.0)
    P["black2"].box(x - 3.04, x + 3.04, h - 0.14, h + 0.02, 1.88, 2.04)               # Black nosing along each top's front
# backdrop in one gold frame (an inverted U, no joints on its faces); Barn Red valance with pennants (one outline)
P["black"].box(-8.0, 8.0, 0.25, 6.2, -2.45, -2.25)
P["gold"].poly([(-8.2, 0.25), (-8.0, 0.25), (-8.0, 6.2), (8.0, 6.2), (8.0, 0.25), (8.2, 0.25), (8.2, 6.4), (-8.2, 6.4)], -2.5, -2.2)
val = [(-8.0, 6.2), (8.0, 6.2), (8.0, 5.7)]
for i in range(8):                                                                      # eight 2 m pennants hanging 0.3 m (points clear of the name plate's top, 5.3)
    cx = 7.0 - i * 2.0
    val += [(cx, 5.4), (cx - 1.0, 5.7)]
P["barn"].poly(val, -2.25, -2.15)
P["glowgold"].box(-7.6, 7.6, 6.4, 6.55, -2.45, -2.25)                                    # light bar on the frame's head, set in from its faces
for sx in (-1, 1):                                                                      # lamp post at each end
    P["black2"].bm((sx * 8.6, 0.25, -2.0), (sx * 8.6, 4.2, -2.0), 0.1)
    P["black2"].boxc(sx * 8.6, 4.35, -1.9, 0.7, 0.5, 0.7)
    P["glowgold"].boxc(sx * 8.6, 4.35, -1.5, 0.5, 0.35, 0.1)

finish_and_export()
