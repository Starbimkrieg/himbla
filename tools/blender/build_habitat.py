# ILMB Kepler Habitat builder for Blender (4.2+ / 5.x): "Orrery", the family wing of the International Moon Base, exported to
# src/assets/habitat.glb (docs/habitat-proposals: proposal A, chosen over B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_habitat.py").read())
# or headless:                              MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/build_habitat.py
# (MOONRUNNER_EXPORT=0 builds without writing the file; proposals/preview_habitat.py renders it.)
#
# A ring of twelve straight two-deck prefab modules (lower deck: apartment windows with sills; upper: a panorama ribbon) with an
# orange joint collar at each seam, on a pair of lander legs under every joint but the lobby's: each leg pinned at both ends (a
# hinge under the collar; a dished footpad with lugs) with a shock sleeve and an orange band, no tie bar, so the loop under the
# ring (7 m clear, downlit, a dashed lane) stays open to skate. Three glazed spoke bridges join the hub to a railed balcony on the
# ring's inner face, each landing at a lift core that rises through the roof (the skywalk side's comes down to the lobby). Solar
# rows on the roof. The hub: commons pavilion, orange shaft, glazed spoke deck, observation crown with a saucer roof and a mast;
# round the crown, a tilted orbit ring carries a blue planet (the Kepler mark, decals.py, in the round). The park inside: lawn,
# paths, trees, a pond, benches, lamps, a playground.
#
# Frame: three.js axes (x right, y up, +z forward), metres, origin on the ground at the wing centre; the ILMB wing frame
# (world.js wing()): +x away from the hub, -x toward the skywalk, which docks into the lobby's face at x = -28.6 (floor 0.6).
# Ring: 12-gon (vertices at theta = k * 30 deg, (x, z) = (cos, sin) theta * r; vertex 6 is the skywalk side), vertex radius 17.2
# (inner wall) to 23.6 / 25.0 (outer wall, leaning out), underside 7.0, roof 15.0. Footprint radius 27.5; mast top 46.4.
#
# Root empty `habitat` (extras `radius`, `dock`: wing centre to the lobby face). Pivots (empties with a `role`):
#   fan  `habitat_orbit`, at the crown (0, 31, 0): the orbit ring, its planet and struts; the game spins it about y (extra `spin`,
#        rad/s)
#   col  a collider (as build_garage.py), extras `shape` "box" (`hx` `hy` `hz` half sizes, `yaw`, `pitch` about the box's x
#        after the yaw; pivot at the box's centre less hy), "cyl" (`r`, `h`; pivot at its foot) or "hcyl" (lying along z turned
#        by `yaw`: `r`, `len`; pivot on its axis)
# Each mesh has ONE material named after a slot (HABITAT_TOON / HABITAT_GLOW in src/models.js): toon wall trim roof dark panel
# metal steel solar door lawn concrete path bark leaf leaf2 stone wood hazard; glow window lamp beacon water; `glass` see-through.
# Fixed palette (the wing is always Kepler's): orange `trim`, cream `wall`. Ink (metres) per style.md.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_habitat.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("HABITAT_OUT") or os.path.join(REPO, "src", "assets", "habitat.glb")
COLL = "MoonHabitat"
PFX = "habitat_"
exec(open(os.path.join(REPO, "tools", "blender", "habitat_kit.py"), encoding="utf-8").read(), globals())

ROOT = pivot("habitat", (0, 0, 0), None, radius=27.5, dock=28.6)
ORBIT = pivot("habitat_orbit", (0, 31.0, 0), ROOT, role="fan", spin=0.06)
N = 12
STEP = TAU / N
HALF = STEP / 2
FACET = math.radians(20)            # crisp facets: the 30 degree bends stay hard
RI, RO0, RO1, Y0, Y1 = 17.2, 23.6, 25.0, 7.0, 15.0
CORES = (2, 6, 10)                  # vertices with a lift core and a spoke; 6 is the skywalk side (theta = pi)
LEGS = ((18.8, 16.0), (22.4, 25.6)) # (top pin, foot pin) radius of each leg of a pair
PIN_Y = (6.15, 0.95)                # (top, foot) pin heights
UP = Vector((0, 1, 0))


def rv_out(y):
    """outer wall's vertex radius at height y (it leans out 1.4 m over the two decks)"""
    return RO0 + (RO1 - RO0) * (y - Y0) / (Y1 - 1.0 - Y0)


def facet_scale(tk):
    """for a sector swept across vertex angle tk: keeps it on the polygon's flat facets either side"""
    return lambda t: math.cos(HALF) / math.cos(HALF - abs(t - tk))


def outer_frame(k):
    """facet k (between vertices k and k+1): origin on the wall's foot at the facet centre; t along, w up the wall, n out"""
    tm = k * STEP + HALF
    c, s = math.cos(tm), math.sin(tm)
    a = (RO1 - RO0) / (Y1 - 1.0 - Y0) * math.cos(HALF)
    o = Vector((c, 0, s)) * rv_out(Y0) * math.cos(HALF) + Vector((0, Y0, 0))
    w = Vector((c * a, 1, s * a)).normalized()
    return o, Vector((-s, 0, c)), w, Vector((c, -a, s)).normalized()


def inner_frame(k):
    tm = k * STEP + HALF
    c, s = math.cos(tm), math.sin(tm)
    return Vector((c, 0, s)) * RI * math.cos(HALF), Vector((-s, 0, c)), UP, Vector((-c, 0, -s))


def poly_pt(k, s, r, y):
    """a point on the 12-gon of vertex radius r, on the edge from vertex k to k+1"""
    a, b = k * STEP, (k + 1) * STEP
    return (math.cos(a) * r * (1 - s) + math.cos(b) * r * s, y, math.sin(a) * r * (1 - s) + math.sin(b) * r * s)


def spun(g, t, rot):
    """a part built along +x (a spoke's frame), moved to t there, then turned out to its spoke"""
    return xf(xf(g[:2], t), (0, 0, 0), rot)


# ================= the ring =================
wall = Acc.of("wall", 0.08, sharp=FACET)
wall.put(sector([(17.6, Y0), (RO0, Y0), (RO1, Y1 - 1.0), (RO1, Y1), (RI, Y1), (RI, 7.6)], 0, TAU, N, cap=False))
Acc.of("trim", 0.04, sharp=FACET).put(sector([(24.75, 13.85), (25.15, 13.85), (25.65, 14.25), (25.65, 15.1), (24.75, 15.1)], 0, TAU, N, cap=False))   # cornice
Acc.of("trim", 0.02, sharp=FACET).put(sector([(16.95, 14.6), (17.5, 14.6), (17.5, 15.75), (16.95, 15.75)], 0, TAU, N, cap=False))                    # inner parapet
Acc.of("roof", 0.0, sharp=FACET).put(sector([(17.5, 14.95), (24.75, 14.95), (24.75, 15.07), (17.5, 15.07)], 0, TAU, N, cap=False))                   # roof membrane
Acc.of("wall", 0.03, sharp=FACET).put(sector([(16.0, 10.55), (17.25, 10.55), (17.25, 10.8), (16.0, 10.8)], 0, TAU, N, cap=False))                    # park balcony

# joint collars: the ring's section grown 0.25 m, across each vertex
collar = Acc.of("trim", 0.03, sharp=FACET)
for k in range(N):
    tk, d = k * STEP, 0.034
    collar.put(sector([(16.9, 6.75), (23.85, 6.75), (25.2, 13.8), (24.6, 13.8), (24.6, 15.25), (16.9, 15.25)], tk - d, tk + d, 2, rscale=facet_scale(tk)))

# outer decks: lower-deck windows with sills, the upper deck's panorama ribbon with mullions, an orange floor belt between
win, sill, mull, belt = Acc.of("window", 0.0), Acc.of("trim", 0.008), Acc.of("dark", 0.0), Acc.of("trim", 0.012)
sl = 1.018                                                      # slant metres per metre of height
for k in range(N):
    o, t, w, n = outer_frame(k)
    for u in (-4.625, -2.775, -0.925, 0.925, 2.775, 4.625):
        win.put(frame_box(o, t, w, n, u - 0.6, u + 0.6, 1.4 * sl, 3.0 * sl, -0.05, 0.006))
        sill.put(frame_box(o, t, w, n, u - 0.72, u + 0.72, 1.25 * sl, 1.4 * sl, -0.05, 0.16))
    hw = (rv_out(11.2) * math.sin(HALF)) - 1.0
    win.put(frame_box(o, t, w, n, -hw, hw, 4.2 * sl, 6.3 * sl, -0.05, 0.006))
    for i in range(7):
        u = -4.8 + i * 1.6
        mull.put(frame_box(o, t, w, n, u - 0.08, u + 0.08, 4.15 * sl, 6.35 * sl, -0.04, 0.014))
    bw = rv_out(10.7) * math.sin(HALF) - 0.85
    belt.put(frame_box(o, t, w, n, -bw, bw, 3.5 * sl, 3.85 * sl, -0.05, 0.05))

# inner face (to the park): lower windows, upper ribbon over the balcony
for k in range(N):
    o, t, w, n = inner_frame(k)
    for u in (-2.7, -0.9, 0.9, 2.7):
        win.put(frame_box(o, t, w, n, u - 0.55, u + 0.55, 8.2, 9.8, -0.05, 0.006))
    hw = RI * math.sin(HALF) - 0.95
    win.put(frame_box(o, t, w, n, -hw, hw, 11.3, 13.4, -0.05, 0.006))
    for i in range(5):
        u = -3.0 + i * 1.5
        mull.put(frame_box(o, t, w, n, u - 0.07, u + 0.07, 11.25, 13.45, -0.04, 0.014))

# balcony railing, open where the spokes land
rail, post = Acc.of("trim", 0.01), Acc.of("dark", 0.008)
EDGE = 2 * 16.12 * math.sin(HALF)                               # one facet's length on the railing line
for k in range(N):
    run = []
    for i in range(9):
        s = i / 8
        if (k in CORES and s * EDGE < 2.7) or ((k + 1) % N in CORES and (1 - s) * EDGE < 2.7):
            if len(run) > 1:
                railing(rail, post, run)
            run = []
        else:
            run.append(poly_pt(k, s, 16.12, 10.8))
    if len(run) > 1:
        railing(rail, post, run)

# downlights in the soffit, for skating under at night
dl = Acc.of("lamp", 0.0)
for k in range(N):
    for r in (19.4, 21.8):
        p = poly_pt(k, 0.5, r, 0)
        dl.put(cyl(p[0], Y0 - 0.012, p[2], 0.38, 0.04, 10))

# roof: two solar panels per module (none against a lift core)
frame_, cells, spost = Acc.of("metal", 0.015), Acc.of("solar", 0.0), Acc.of("steel", 0.008)
for k in range(N):
    tm = k * STEP + HALF
    c, s = math.cos(tm), math.sin(tm)
    for u in (-3.0, 3.0):
        if (u < 0 and k in CORES) or (u > 0 and (k + 1) % N in CORES):
            continue
        rm = 20.7 * math.cos(HALF)
        solar_panel(frame_, cells, spost, c * rm - s * u, Y1 + 0.07, s * rm + c * u, -tm - PI / 2, w=4.0, d=2.8, tilt=-0.3, h=0.85)

# ================= lander legs, a pair under every joint but the lobby's =================
# Each leg is pinned at both ends, so it can swing in its radial plane like a lander leg: at the top a hinge under the collar
# (mount plate, two cheeks, a pin through the strut's eye), at the foot a dished pad with a boss and two lugs, the pin through
# the shock sleeve's eye. No tie bar: the ring ties each pair at the top, and the loop under the ring stays clear to skate.
strut, sleeve, band, rod, pad, lug, pin, plate = (Acc.of("panel", 0.03), Acc.of("steel", 0.025), Acc.of("trim", 0.01), Acc.of("steel", 0.015),
                                                  Acc.of("steel", 0.03), Acc.of("dark", 0.015), Acc.of("metal", 0.01), Acc.of("dark", 0.02))
PAD = lathe([(0, -0.03), (1.35, -0.03), (1.35, 0.14), (1.12, 0.26), (0.62, 0.42), (0, 0.42)], 10)
for k in range(N):
    if k == 6:
        continue
    tk = k * STEP
    c, s = math.cos(tk), math.sin(tk)
    er, et = Vector((c, 0, s)), Vector((-s, 0, c))              # out along the leg's plane, and across it (the pins' axis)
    for rt, rf in LEGS:
        top, foot = Vector((c * rt, PIN_Y[0], s * rt)), Vector((c * rf, PIN_Y[1], s * rf))   # the two pin centres
        d = (top - foot).normalized()
        g, h = Vector((foot.x, 0, foot.z)), Vector((top.x, 0, top.z))
        pad.put(xf(PAD, (foot.x, 0, foot.z)))
        plate.put(frame_box(h, er, UP, et, -0.75, 0.75, 6.45, 6.85, -0.55, 0.55))
        for side in (-1, 1):
            d0, d1 = sorted((side * 0.39, side * 0.51))
            lug.put(frame_box(g, er, UP, et, -0.42, 0.42, 0.2, 1.25, d0, d1))         # lugs on the pad's boss
            lug.put(frame_box(h, er, UP, et, -0.4, 0.4, 5.75, 6.5, d0, d1))           # cheeks under the mount plate
        for p in (foot, top):
            pin.put(B(tuple(p - et * 0.6), tuple(p + et * 0.6), 0.12, 6, cap=True))
            rod.put(B(tuple(p - et * 0.34), tuple(p + et * 0.34), 0.36, 8, cap=True))  # the eye on the pin
        rod.put(B(tuple(foot), tuple(foot + d * 0.75), 0.26, 6, cap=True))
        rod.put(B(tuple(top - d * 0.7), tuple(top), 0.26, 6, cap=True))
        sleeve.put(B(tuple(foot + d * 0.55), tuple(foot + d * 2.7), 0.55, 8, cap=True))
        band.put(B(tuple(foot + d * 2.55), tuple(foot + d * 2.85), 0.64, 8, cap=True))
        strut.put(B(tuple(foot + d * 2.4), tuple(top - d * 0.5), 0.38, 8, cap=True))

# ================= lift cores through the roof, the lobby's down to the ground =================
core, cap, slit, dome = Acc.of("wall", 0.05), Acc.of("trim", 0.03), Acc.of("window", 0.0), Acc.of("wall", 0.04)
bulb = Acc.of("beacon", 0.0)
for k in CORES:
    tk = k * STEP
    c, s = math.cos(tk), math.sin(tk)
    rc, r, y0 = (20.4, 3.2, -0.02) if k == 6 else (21.0, 3.0, 7.2)
    x, z = c * rc, s * rc
    core.put(cyl(x, (y0 + 18.0) / 2, z, r, 18.0 - y0, 16))
    cap.put(cyl(x, 18.25, z, r + 0.3, 0.5, 16))
    dome.put(xf(sphere(r * 0.8, 16, 5, PI / 2)[:2], (x, 18.5, z), (0, 0, 0), (1, 0.45, 1)))
    bulb.put(ball(x, 18.5 + r * 0.36 + 0.3, z, 0.32, 8, 6))
    o, tn = Vector((x, 0, z)), Vector((-s, 0, c))
    for side in (1, -1):                                         # stair slits above the roof, outward and inward
        slit.put(frame_box(o, tn, UP, Vector((c, 0, s)) * side, -0.35, 0.35, 15.6, 17.6, r - 0.12, r - 0.02))
    if k == 6:                                                   # the lift shaft's windows below the ring, toward the park
        for v0 in (1.2, 3.8):
            slit.put(frame_box(o, tn, UP, Vector((-c, 0, -s)), -0.45, 0.45, v0, v0 + 1.9, r - 0.12, r - 0.02))

# lobby where the skywalk docks (theta = pi, x < 0); its collider comes last, below
lobby(-28.6, 6.6, 9.0, 7.2, "wall", "trim", win_x=(-27.2, -24.0), collide=False)

# ================= spoke bridges: glazed walkways from the hub to the balcony =================
glass = Acc.of("glass", 0.0)
deck, deckglow, rib, ribend = Acc.of("panel", 0.05), Acc.of("lamp", 0.0), Acc.of("wall", 0.025), Acc.of("trim", 0.03)
for k in CORES:
    rot = (0, -k * STEP, 0)
    r0, r1 = 6.2, 17.15
    L, xc = r1 - r0, (r0 + r1) / 2
    R, F = 2.1, 10.83
    deck.put(spun(cuboid(L, 0.5, 4.6), (xc, F - 0.25, 0), rot))
    deckglow.put(spun(cuboid(L - 0.2, 0.03, 0.3), (xc, F + 0.012, 0), rot))
    for sz in (-1, 1):
        glass.put(spun(cuboid(L, 2.0, 0.05), (xc, F + 1.0, sz * R), rot))
    glass.put(spun(xf(cylinder_arc(R, R, L, 10, -PI / 2, PI)[:2], (0, 0, 0), (-PI / 2, PI / 2, 0)), (xc, F + 2.0, 0), rot))
    for i, x in enumerate((r0 + 1.0, xc, r1 - 1.6)):
        acc, tr = (rib, 0.16) if i == 1 else (ribend, 0.24)
        acc.put(spun(xf(torus_partial(R, tr, 6, 12)[:2], (0, 0, 0), (0, PI / 2, 0)), (x, F + 2.0, 0), rot))
        for sz in (-1, 1):
            acc.put(spun(cuboid(tr * 2, 2.18, tr * 2), (x, F + 0.97, sz * R), rot))
    rib.put(spun(cuboid(L - 2.6, 0.2, 0.2), (xc - 0.3, F + 2.0 + R + 0.02, 0), rot))

# ================= hub tower and the orrery crown =================
hub = Acc.of("wall", 0.1)
hub.put(cyl(0, 2.3, 0, 7.8, 4.6, 32))                            # commons pavilion
win.put(cyl(0, 2.45, 0, 7.806, 1.9, 32))
for i in range(16):
    a = i * TAU / 16
    mull.put(xf(cuboid(0.08, 2.0, 0.18)[:2], (math.cos(a) * 7.82, 2.45, math.sin(a) * 7.82), (0, -a, 0)))
Acc.of("trim", 0.05).put(cyl(0, 4.9, 0, 8.25, 0.6, 32, rt=8.0))
Acc.of("trim", 0.1).put(cyl(0, 16.3, 0, 4.4, 22.6, 24))         # shaft, orange as the old tower was
for y in (17.2, 22.4):
    Acc.of("wall", 0.02).put(cyl(0, y, 0, 4.55, 0.5, 24))
hub.put(cyl(0, 12.4, 0, 6.4, 5.6, 32))                           # spoke deck
win.put(cyl(0, 12.3, 0, 6.406, 2.0, 32))
for y in (9.85, 14.95):
    Acc.of("trim", 0.02).put(cyl(0, y, 0, 6.6, 0.4, 32))
for i in range(4):                                               # lift glass up the shaft
    a = PI / 4 + i * PI / 2
    win.put(xf(cuboid(0.12, 11.4, 0.7)[:2], (math.cos(a) * 4.37, 21.2, math.sin(a) * 4.37), (0, -a, 0)))
hub.put(cyl(0, 27.2, 0, 4.6, 1.6, 32, rt=8.6))                   # crown bracket
Acc.of("trim", 0.02).put(cyl(0, 27.9, 0, 8.75, 0.36, 32))
glass.put(xf(cylinder_arc(8.2, 8.2, 3.2, 32)[:2], (0, 29.6, 0)))
for i in range(16):
    a = i * TAU / 16
    Acc.of("wall", 0.015).put(box(math.cos(a) * 8.2, 29.6, math.sin(a) * 8.2, 0.3, 3.2, 0.3))
hub.put(cyl(0, 31.75, 0, 9.3, 1.1, 32, rt=7.0))                  # roof saucer
Acc.of("trim", 0.02).put(cyl(0, 31.4, 0, 9.42, 0.3, 32))
hub.put(xf(sphere(5.2, 24, 6, PI / 2)[:2], (0, 32.2, 0), (0, 0, 0), (1, 0.55, 1)))
Acc.of("dark", 0.03).put(cyl(0, 40.5, 0, 0.22, 11.0, 8, rt=0.16))
for y, w in ((40.0, 3.0), (43.0, 2.0)):
    Acc.of("dark", 0.015).put(box(0, y, 0, w, 0.15, 0.15))
Acc.of("beacon", 0.0).put(ball(0, 46.4, 0, 0.55, 10, 8))
# the orbit ring, in the orbit pivot's frame (its centre): three struts run down to the saucer's slope, where they ride round
ends = orbit_mark(Acc.of("trim", 0.05, parent=ORBIT), Acc.of("water", 0.02, parent=ORBIT), 0, 0, 0, 12.8, 0.62, 0.38, 0.5, 1.7, planet_t=2.2)
for e in ends:
    a = math.atan2(e.z, e.x)
    Acc.of("dark", 0.015, parent=ORBIT).put(B((math.cos(a) * 7.9, 0.8, math.sin(a) * 7.9), tuple(e), 0.14, 6, cap=True))

# ================= the park inside, the skate loop under the ring =================
Acc.of("lawn", 0.0).put(cyl(0, 0.1, 0, 15.9, 0.3, 48))
Acc.of("concrete", 0.0).put(sector([(15.9, -0.05), (27.5, -0.05), (27.5, 0.1), (15.9, 0.1)], 0, TAU, 48, cap=False))
lane = Acc.of("trim", 0.0)
for i in range(36):
    a = i * TAU / 36
    lane.put(xf(cuboid(0.3, 0.02, 2.4)[:2], (math.cos(a) * 21.0, 0.108, math.sin(a) * 21.0), (0, -a, 0)))
Acc.of("path", 0.0).put(sector([(11.3, 0.24), (12.7, 0.24), (12.7, 0.285), (11.3, 0.285)], 0, TAU, 48, cap=False))
for a in (0.0, TAU / 3, 2 * TAU / 3):
    Acc.of("path", 0.0).put(xf(cuboid(7.6, 0.03, 1.4)[:2], (math.cos(a) * 11.9, 0.262, math.sin(a) * 11.9), (0, -a, 0)))
bark, leaf, leaf2 = Acc.of("bark", 0.02), Acc.of("leaf", 0.04), Acc.of("leaf2", 0.04)
for deg, r, kind, h in ((20, 9.5, "ball", 1.0), (42, 14.0, "cone", 1.1), (75, 14.2, "ball", 0.9), (105, 13.8, "cone", 1.0),
                        (150, 9.4, "ball", 1.1), (162, 14.3, "cone", 1.0), (262, 9.5, "cone", 1.2), (282, 14.0, "ball", 1.0),
                        (322, 9.4, "ball", 0.9), (340, 14.2, "cone", 1.1), (228, 14.2, "ball", 1.0), (130, 13.6, "ball", 0.85)):
    a = math.radians(deg)
    tree(bark, leaf if kind == "cone" else leaf2, math.cos(a) * r, math.sin(a) * r, 0.25, h, kind)
a = math.radians(90)
Acc.of("water", 0.0).put(cyl(math.cos(a) * 9.6, 0.27, math.sin(a) * 9.6, 2.2, 0.04, 20))
Acc.of("stone", 0.02).put(ring(2.3, 0.28, 0.3, 20, 6, t=(math.cos(a) * 9.6, 0, math.sin(a) * 9.6)))
wood, bleg = Acc.of("wood", 0.015), Acc.of("dark", 0.01)
for deg in (30, 150, 270):
    a = math.radians(deg)
    bench(wood, bleg, math.cos(a) * 13.4, math.sin(a) * 13.4, -a - PI / 2, 0.25)
lp, lh = Acc.of("dark", 0.01), Acc.of("lamp", 0.0)
for deg, r in ((15, 10.8), (135, 10.8), (255, 10.8), (75, 13.3), (195, 13.3), (315, 13.3)):
    a = math.radians(deg)
    lamp_post(lp, lh, math.cos(a) * r, math.sin(a) * r, 0.25, 3.6)

# playground (slide, swings, roundabout) toward the lobby side
pa = math.radians(205)
px, pz = math.cos(pa) * 10.0, math.sin(pa) * 10.0
G = lambda g, t=(0, 0, 0), r=(0, 0, 0): xf(xf(g[:2], t, r), (px, 0.25, pz), (0, -pa, 0))
steel, hz, orng = Acc.of("steel", 0.01), Acc.of("hazard", 0.015), Acc.of("trim", 0.015)
for sx in (-0.55, 0.55):
    for sz in (-0.55, 0.55):
        steel.put(G(cylinder(0.06, 0.06, 1.9, 6), (sx - 1.5, 0.95, sz)))
hz.put(G(cuboid(1.3, 0.1, 1.3), (-1.5, 1.9, 0)))
orng.put(G(cuboid(0.8, 0.08, 3.3), (-1.5, 1.1, 2.15), (0.5, 0, 0)))
for i in range(5):
    steel.put(G(cuboid(0.7, 0.05, 0.05), (-1.5, 0.35 + i * 0.35, -0.75)))
for sx in (-0.38, 0.38):
    steel.put(G(cylinder(0.04, 0.04, 2.0, 5), (-1.5 + sx, 1.0, -0.78)))
for sz in (-1.2, 1.2):                                           # swings
    for sx in (-0.7, 0.7):
        steel.put(G(cylinder(0.06, 0.06, 2.6, 6), (2.0 + sx * 0.5, 1.25, sz), (0, 0, sx * 0.4)))
steel.put(G(cuboid(0.12, 0.12, 2.6), (2.0, 2.45, 0)))
for sz in (-0.5, 0.5):
    Acc.of("metal", 0.0).put(G(cylinder(0.015, 0.015, 1.7, 4), (2.0, 1.55, sz)))
    Acc.of("dark", 0.01).put(G(cuboid(0.35, 0.06, 0.5), (2.0, 0.68, sz)))
orng.put(G(cylinder(1.1, 1.1, 0.12, 14), (0.6, 0.35, -2.6)))   # roundabout
steel.put(G(cylinder(0.08, 0.08, 1.0, 6), (0.6, 0.85, -2.6)))

# ================= colliders =================
# the modules (a box each, bottom at the underside: skate under), lift cores, hub, spokes, legs (tilted boxes along them), pads,
# lobby. None for the park, the roof kit or the orbit ring.
for k in range(N):
    tm = k * STEP + HALF
    col((math.cos(tm) * 20.4, Y0, math.sin(tm) * 20.4), shape="box", hx=6.0, hy=4.05, hz=3.8, yaw=PI / 2 - tm)
for k in CORES:
    rc, r, y0 = (20.4, 3.5, -1.0) if k == 6 else (21.0, 3.3, Y0)
    col((math.cos(k * STEP) * rc, y0, math.sin(k * STEP) * rc), shape="cyl", r=r, h=19.2 - y0)
for r, y0, y1 in ((8.3, -1.0, 5.2), (4.5, 5.0, 28.0), (6.6, 9.6, 15.2), (9.4, 26.4, 32.3), (5.3, 32.3, 35.2)):
    col((0, y0, 0), shape="cyl", r=r, h=y1 - y0)
for k in CORES:
    t = k * STEP
    col((math.cos(t) * 11.7, 12.5, math.sin(t) * 11.7), shape="hcyl", r=2.6, len=11.2, yaw=PI / 2 - t)
for k in range(N):
    if k == 6:
        continue
    t = k * STEP
    er = Vector((math.cos(t), 0, math.sin(t)))
    for rt, rf in LEGS:
        top, foot = Vector((er.x * rt, PIN_Y[0], er.z * rt)), Vector((er.x * rf, PIN_Y[1], er.z * rf))
        m, hy = (top + foot) / 2, (top - foot).length / 2 + 0.35
        col((m.x, m.y - hy, m.z), shape="box", hx=0.6, hy=hy, hz=0.6, yaw=PI / 2 - t, pitch=math.asin((top - foot).normalized().dot(er)))
        col((foot.x, -0.5, foot.z), shape="cyl", r=1.35, h=0.95)
col((-25.3, 0, 0), shape="box", hx=3.4, hy=3.7, hz=4.6, yaw=0.0)

made = flush_all(ROOT, "habitat_")
audit_coplanar(made)
audit_flips(made)
print(f"habitat (Orrery): {tri_count(made)} triangles in {len(made)} meshes, {NCOL[0]} colliders")
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
