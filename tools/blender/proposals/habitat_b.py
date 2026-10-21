# PROPOSAL B for the ILMB's Kepler Habitat (world.js wingHabitat): "SPIRAL STREET", a hill town in the round.
#
# A new type for the wing. One street climbs the building in three turns, a gentle helical ramp from the ground to a roof garden,
# lined with two-storey row houses in Kepler pastels: a front door with an orange awning and a porch lamp, windows, a planter,
# a pilaster between neighbours. Each turn's houses sit on the stone plinth of the turn below (regolith shielding); the orange
# kerb and handrail spiral up the outside. On the roof, a glass conservatory with trees (the park, under glass this time), an
# orange water tower and a lantern mast carrying a small orbit ring, the Kepler mark. A skater can ride from the gate at the
# street's foot all the way up (a 5 percent grade on the first turn, 9 on the last).
#
#   MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/proposals/habitat_b.py
#   (or exec() it in Blender; preview_habitat.py builds it and renders the review sheet)
#
# Frame: three.js axes, origin on the ground at the wing centre; +x away from the ILMB hub, -x toward the skywalk, which docks
# into the vestibule's face at x = -27.8 (floor 0.6). The street: outer edge at radius 26 - 4.5 u, height 7 u + 0.06, for u in
# turns from the gate (0) to the roof (3); 4.5 m wide; the skywalk side (theta = pi) is u = 0.93. Roof garden at 21.06, mast
# top 40. Root empty "habitat_b" (extras: proposal, radius, dock). No pivots or colliders yet: a concept for review.

import bpy, math, os

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", "..", ".."))
COLL = "HabitatB"
exec(open(os.path.join(REPO, "tools", "blender", "habitat_kit.py"), encoding="utf-8").read(), globals())

ROOT = pivot("habitat_b", (0, 0, 0), None, proposal="b", radius=26.0, dock=27.8)
R0, W, H, NT = 26.0, 4.5, 7.0, 3     # outer radius at the gate, street width (= radius lost per turn), rise per turn, turns
SEG = 120                            # sweep rows per turn
U_DOOR = 0.93                        # the skywalk side, theta = pi, this far round the first turn
TH0 = PI - U_DOOR * TAU
LIFT = 0.06                          # the street's foot stands this far off the ground
TOP = H * NT + LIFT                  # roof garden
UP = Vector((0, 1, 0))
HOUSE = ["wall", "peach", "mint", "sky", "butter", "coral", "lilac"]
DOORS = ["accent", "sky", "coral", "trim", "lilac", "dark", "mint"]

radial = lambda c: (c.x, 0.0, c.z)
upward = lambda c: (0.0, 1.0, 0.0)


def th(u):
    return TH0 + u * TAU


def rk(u, k):
    """outer edge of the street's turn k at u (also the face of the houses of turn k - 1)"""
    return R0 - W * (u + k)


def hk(u, k):
    return H * (u + k) + LIFT


def P(u, r, y):
    t = th(u)
    return (math.cos(t) * r, y, math.sin(t) * r)


def us(a, b, per=SEG):
    m = max(1, math.ceil((b - a) * per))
    return [a + (b - a) * i / m for i in range(m + 1)]


def wall_frame(u, r, y):
    """on the spiral wall of radius r(u) = r: origin at height y; t along the wall (its true tangent, the radius shrinks as
    it turns), w up, n out"""
    t = th(u)
    c, s = math.cos(t), math.sin(t)
    dr = -W / TAU
    tang = Vector((dr * c - r * s, 0, dr * s + r * c)).normalized()
    return Vector((c * r, y, s * r)), tang, UP, Vector((tang.z, 0, -tang.x))


def sweep_closed(prof, u0, u1, per=SEG):
    """a closed section prof(u) -> [(r, y)] swept along the spiral from u0 to u1, capped (winding fixed by mesh())"""
    rows = us(u0, u1, per)
    verts, faces = [], []
    n = len(prof(u0))
    for u in rows:
        verts.extend(P(u, r, y) for r, y in prof(u))
    for i in range(len(rows) - 1):
        for j in range(n):
            j2 = (j + 1) % n
            faces.append((i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j))
    faces.append(tuple(range(n)))
    faces.append(tuple((len(rows) - 1) * n + j for j in range(n)))
    return verts, faces


def fan(centre, pts, hint):
    verts = [centre] + list(pts)
    faces = []
    for i in range(1, len(verts) - 1):
        f = [0, i, i + 1]
        a, b, c = (Vector(verts[k]) for k in f)
        if (b - a).cross(c - a).dot(Vector(hint(a))) < 0:
            f.reverse()
        faces.append(tuple(f))
    return verts, faces


# ================= the hill: plinth, street, house fronts, roof =================
stone = Acc.of("stone", 0.07, raw=True)
stone.put(strip([[P(u, rk(u, 0), -0.3), P(u, rk(u, 0), hk(u, 0))] for u in us(0, 1)], radial))
pave = Acc.of("pave", 0.05, raw=True)
for k in range(NT):
    pave.put(strip([[P(u, rk(u, k), hk(u, k)), P(u, rk(u, k + 1), hk(u, k))] for u in us(0, 1)], upward))
Acc.of("lawn", 0.05, raw=True).put(fan((0, TOP, 0), [P(u, rk(u, NT), TOP) for u in us(0, 1)], upward))

win, sill, pil, awn, plant, shrub, lampb = (Acc.of("window", 0.0), Acc.of("wall", 0.008), Acc.of("wall", 0.015), Acc.of("trim", 0.015),
                                            Acc.of("wood", 0.012), Acc.of("leaf2", 0.02), Acc.of("lamp", 0.0))
houses = 0
for k in range(NT):
    nb = round(TAU * (R0 - W * (k + 1.5)) / 7.5)
    for b in range(nb):
        u0, u1 = b / nb, (b + 1) / nb
        ytop = (lambda u: hk(u, k + 1)) if k < NT - 1 else (lambda u: TOP)
        colour = HOUSE[(b * 3 + k * 2) % len(HOUSE)]
        Acc.of(colour, 0.06, raw=True).put(strip([[P(u, rk(u, k + 1), hk(u, k)), P(u, rk(u, k + 1), ytop(u))] for u in us(u0, u1)], radial))
        # pilaster on the bay's start, into the kerb above
        hgt0 = ytop(u0) - hk(u0, k)
        if hgt0 > 0.4:
            o, t, w, n = wall_frame(u0, rk(u0, k + 1), hk(u0, k))
            pil.put(frame_box(o, t, w, n, -0.18, 0.18, -0.05, hgt0 + 0.12, -0.1, 0.05))
        # the house front at the bay's middle
        uc = (u0 + u1) / 2
        rw, y0 = rk(uc, k + 1), hk(uc, k)
        hgt = ytop(uc) - y0
        o, t, w, n = wall_frame(uc, rw, y0)
        if hgt >= 3.0:
            houses += 1
            door = DOORS[(b * 2 + k) % len(DOORS)]
            if door == colour:
                door = "dark"
            Acc.of(door, 0.012).put(frame_box(o, t, w, n, -0.6, 0.6, -0.05, 2.4, -0.12, 0.04))
            awn.put(frame_box(o, t, w, n, -0.95, 0.95, 2.55, 2.72, -0.05, 0.95))
            lp = o + t * 1.15 + w * 2.2 + n * 0.16
            lampb.put(ball(lp.x, lp.y, lp.z, 0.15, 8, 6))
            win.put(frame_box(o, t, w, n, 1.45, 2.85, 0.9, 2.2, -0.05, 0.006))
            sill.put(frame_box(o, t, w, n, 1.35, 2.95, 0.78, 0.9, -0.05, 0.14))
            plant.put(frame_box(o, t, w, n, -2.9, -1.4, -0.05, 0.55, -0.04, 0.55))
            for du in (-2.5, -1.8):
                sp = o + t * du + w * 0.78 + n * 0.28
                shrub.put(ball(sp.x, sp.y, sp.z, 0.36, 8, 5))
        if hgt >= 6.2:
            for du in (-1.3, 1.3):
                win.put(frame_box(o, t, w, n, du - 0.65, du + 0.65, 3.7, 5.2, -0.05, 0.006))
                sill.put(frame_box(o, t, w, n, du - 0.75, du + 0.75, 3.58, 3.7, -0.05, 0.14))

# ground-floor windows in the plinth where it is tall enough (none behind the vestibule)
for i in range(20, 40):
    u = (i + 0.5) / 40
    if abs(u - U_DOOR) < 0.045:
        continue
    h0 = hk(u, 0)
    o, t, w, n = wall_frame(u, rk(u, 0), 0.0)
    if h0 >= 3.2:
        win.put(frame_box(o, t, w, n, -0.55, 0.55, 1.2, 2.4, -0.05, 0.006))
    if h0 >= 6.3:
        win.put(frame_box(o, t, w, n, -0.55, 0.55, 4.3, 5.5, -0.05, 0.006))

# kerbs and handrails up the outside of every turn and round the roof garden; street lamps on the kerb
kerb, rail, post = Acc.of("trim", 0.02), Acc.of("trim", 0.01), Acc.of("dark", 0.008)
lpost, lhead = Acc.of("dark", 0.01), Acc.of("lamp", 0.0)
edges = [(k, 0.03 if k == 0 else 0.0, 1.0) for k in range(NT)] + [(NT, 0.0, 0.97)]
for k, a, b in edges:
    y = (lambda u, k=k: hk(u, k)) if k < NT else (lambda u: TOP)
    kerb.put(sweep_closed(lambda u, k=k, y=y: [(rk(u, k) - 0.3, y(u) - 0.02), (rk(u, k) + 0.08, y(u) - 0.02),
                                                (rk(u, k) + 0.08, y(u) + 0.28), (rk(u, k) - 0.3, y(u) + 0.28)], a, b))
    ra = max(a, 0.06) if k == 0 else a
    railing(rail, post, [P(u, rk(u, k) - 0.12, y(u) + 0.28) for u in us(ra, b, 100)])
    if k < NT:
        for j in range(8):
            u = (j + 0.6) / 8
            if k == 0 and u < 0.1:
                continue
            x, _, z = P(u, rk(u, k) - 0.55, 0)
            lamp_post(lpost, lhead, x, z, hk(u, k), 3.4)

# the gate at the street's foot: two posts and a lintel with a lamp row
g0 = 0.02
for r in (rk(g0, 0) - 0.5, rk(g0, 1) + 0.5):
    x, _, z = P(g0, r, 0)
    Acc.of("trim", 0.03).put(cyl(x, hk(g0, 0) + 2.4, z, 0.32, 4.8, 10))
a_, b_ = Vector(P(g0, rk(g0, 0) - 0.5, hk(g0, 0) + 4.95)), Vector(P(g0, rk(g0, 1) + 0.5, hk(g0, 0) + 4.95))
Acc.of("wall", 0.03).put(B(tuple(a_ + (a_ - b_).normalized() * 0.5), tuple(b_ + (b_ - a_).normalized() * 0.5), 0.35, 6, cap=True))
for f in (0.25, 0.5, 0.75):
    p = a_.lerp(b_, f)
    lampb.put(ball(p.x, p.y - 0.42, p.z, 0.16, 8, 6))

# vestibule where the skywalk docks (theta = pi)
Acc.of("wall", 0.08).put(box(-24.65, 2.975, 0, 6.3, 6.05, 9.0))
Acc.of("trim", 0.05).put(box(-24.85, 6.1, 0, 6.5, 0.5, 9.6))
Acc.of("door", 0.0).put(box(-27.75, 2.7, 0, 0.2, 4.2, 5.4))
jamb = Acc.of("trim", 0.02)
for sz in (-1, 1):
    jamb.put(box(-27.85, 2.86, sz * 3.0, 0.3, 5.88, 0.5))
    win.put(box(-25.0, 3.6, sz * 4.503, 2.0, 1.6, 0.02))
jamb.put(box(-27.85, 5.55, 0, 0.3, 0.5, 6.5))
Acc.of("lamp", 0.0).put(box(-27.83, 5.1, 0, 0.06, 0.3, 5.2))

# ================= the roof garden =================
Acc.of("trim", 0.03).put(sector([(6.0, TOP - 0.01), (6.6, TOP - 0.01), (6.6, TOP + 0.5), (6.0, TOP + 0.5)], 0, TAU, 24, cap=False))
glass = Acc.of("glass", 0.0)
glass.put(xf(cylinder_arc(6.3, 6.3, 4.4, 12)[:2], (0, TOP + 2.7, 0)))
ribs = Acc.of("wall", 0.015)
for i in range(12):
    a = i * TAU / 12
    sx, cz = math.sin(a), math.cos(a)
    ribs.put(box(sx * 6.3, TOP + 2.7, cz * 6.3, 0.26, 4.5, 0.26, (0, a, 0)))
    ribs.put(B((sx * 6.3, TOP + 5.3, cz * 6.3), (sx * 1.2, TOP + 9.9, cz * 1.2), 0.12, 5, cap=True))
Acc.of("trim", 0.02).put(cyl(0, TOP + 5.1, 0, 6.55, 0.4, 24))
glass.put(xf(cylinder(1.2, 6.3, 4.6, 12, True)[:2], (0, TOP + 7.6, 0)))
Acc.of("wall", 0.03).put(cyl(0, TOP + 10.5, 0, 1.35, 1.2, 12))
Acc.of("trim", 0.02).put(cyl(0, TOP + 11.6, 0, 1.6, 1.0, 12, rt=0.0))
Acc.of("dark", 0.02).put(cyl(0, TOP + 15.5, 0, 0.18, 7.0, 8, rt=0.13))
Acc.of("beacon", 0.0).put(ball(0, TOP + 19.4, 0, 0.5, 10, 8))
ends = orbit_mark(Acc.of("trim", 0.02), Acc.of("water", 0.01), 0, TOP + 16.0, 0, 3.0, 0.16, 0.45, 0.3, 0.5, planet_t=1.0)
for e in (ends[0], ends[0] + (Vector((0, TOP + 16.0, 0)) - ends[0]) * 2):   # two struts, across the mast
    Acc.of("dark", 0.008).put(B((0, TOP + 16.0, 0), tuple(e), 0.06, 4, cap=True))
# the park under glass
bark, leaf, leaf2 = Acc.of("bark", 0.02), Acc.of("leaf", 0.04), Acc.of("leaf2", 0.04)
for deg, kind in ((30, "ball"), (150, "cone"), (270, "ball")):
    a = math.radians(deg)
    tree(bark, leaf if kind == "cone" else leaf2, math.cos(a) * 3.2, math.sin(a) * 3.2, TOP, 1.15, kind)
Acc.of("water", 0.0).put(cyl(0, TOP + 0.05, 0, 1.4, 0.08, 16))
Acc.of("stone", 0.02).put(ring(1.5, 0.22, TOP + 0.08, 16, 6))
Acc.of("path", 0.0).put(sector([(6.6, TOP - 0.02), (7.7, TOP - 0.02), (7.7, TOP + 0.04), (6.6, TOP + 0.04)], 0, TAU, 36, cap=False))
for u, r, kind, h in ((0.2, 10.3, "ball", 1.0), (0.3, 9.9, "cone", 1.0), (0.4, 9.4, "ball", 0.8)):
    x, _, z = P(u, r, 0)
    tree(bark, leaf if kind == "cone" else leaf2, x, z, TOP, h, kind)
wood, bleg = Acc.of("wood", 0.015), Acc.of("dark", 0.01)
for u in (0.52, 0.62):
    x, _, z = P(u, 8.5, 0)
    bench(wood, bleg, x, z, -th(u) - PI / 2, TOP)
# Kepler water tower
x0, _, z0 = P(0.06, 10.0, 0)
legs = Acc.of("steel", 0.015)
for sx in (-1, 1):
    for sz in (-1, 1):
        legs.put(B((x0 + sx * 1.5, TOP - 0.05, z0 + sz * 1.5), (x0 + sx * 1.1, TOP + 5.1, z0 + sz * 1.1), 0.13, 6, cap=True))
for y in (TOP + 1.8, TOP + 3.6):
    for (ax, az), (bx, bz) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
        f = 1.5 - (y - TOP) / 5.1 * 0.4
        legs.put(B((x0 + ax * f, y, z0 + az * f), (x0 + bx * f, y, z0 + bz * f), 0.06, 4, cap=True))
Acc.of("trim", 0.04).put(cyl(x0, TOP + 6.5, z0, 1.9, 3.0, 16))
Acc.of("wall", 0.03).put(cyl(x0, TOP + 8.6, z0, 2.05, 1.2, 16, rt=0.25))
Acc.of("wall", 0.01).put(cyl(x0, TOP + 5.6, z0, 1.95, 0.25, 16))

made = flush_all(ROOT, "b_")
audit_coplanar(made)
print(f"habitat B (Spiral Street): {tri_count(made)} triangles in {len(made)} meshes, {houses} house fronts")
