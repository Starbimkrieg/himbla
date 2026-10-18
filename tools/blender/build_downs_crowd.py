# Chimera Downs spectators for Blender (4.2+ / 5.x), exported to src/assets/downs-crowd.glb: parts of a seated racegoer, drawn by
# race.js as instanced meshes (one InstancedMesh per part slot plus one for its outline, holding only that part's wearers). Each fan
# is legs, body, arm pose, head, hairdo and maybe a hat and a favour (rosette or scarf), chosen in race.js; "tinted" slots are one
# white mesh the game tints per fan.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_crowd.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_crowd.py
#
# three.js axes, +z the way the fan faces (their left hand is +x). Two frames:
#   BODY frame: origin mid-torso, placed 0.5 m above the seat: seat at y -0.5, thighs at -0.38 (-0.48 to -0.28) reaching the
#     knees 0.72 m forward, shins below, soles at -0.8 (tier floor), toes 0.8 forward (seat rows stand 0.95 m behind the step edge).
#   HEAD frame: origin mid-head, placed 0.66 m above the body origin. The head is an egg 0.5 m wide, 0.525 high, 0.475 deep.
# Body frame:
#   dn_fan_legs     thighs and shins (`legs`, tinted: trousers or frock colour), shoes (`black`)
#   dn_fan_body     suit: tailored torso, broad shoulders (`coat`, tinted), shirt V between lapels (`shirt`, tinted), tie (`band`, tinted: favour colour)
#   dn_fan_body2    frock: waisted torso, fuller hips (`coat`), belt (`band`), collar (`shirt`)
#   dn_fan_lap      arms at rest, hands on thighs: sleeves (`coat`), hands (`skin`, tinted)
#   dn_fan_prog     arms holding an open race programme: sleeves, hands, pages (`mint`), cover (`barn`)
#   dn_fan_bino     arms raised with binoculars (`black`) at the eyes
#   dn_fan_arms     both arms thrown up, hands open (the cheer; replaces the arms at rest)
#   dn_fan_arm1     right arm waving a pennant (`band`) on a stick (`saddle`), left at rest (the other cheer)
#   dn_fan_rosette  rosette on the left breast: rosette and tails (`band`), button (`gold`); fits both bodies
#   dn_fan_scarf    scarf round the neck, ends down the front (`band`); fits both bodies
# Head frame:
#   dn_fan_head     head with nose and ears (`skin`), eyes (`black`), brows (`hair`, tinted), mouth (`barn2`); face details 4 mm proud, no outline
#   dn_fan_hair     short hair: fringe above the brows, down to ears and nape (`hair`)
#   dn_fan_hair_bun     same with a bun at the nape
#   dn_fan_hair_long    longer and fuller, a lock over each ear, to the shoulders
#   dn_fan_hair_thin    receding hairline, for the older gents
#   dn_fan_cap      flat cap with peak (`hat`, tinted)
#   dn_fan_derby    bowler: domed crown, curled brim (`hat`), band (`band`)
#   dn_fan_tophat   top hat (`hat`), band (`band`)
#   dn_fan_boater   straw boater: flat crown, flat brim (`hat`), band (`band`)
#   dn_fan_sunhat   wide drooping race-day hat (`hat`), band and flower (`band`)
#   dn_fan_fascinator  small disc on the right of the head (`hat`), two feathers (`band`)
# Every hairdo fits under every hat: each crown holds every hairdo and its outline above the brim (audited at the end; the build
# stops if one pokes through). Each limb's end is buried in the part it joins, so where it emerges reads as a drawn crease, not a seam.
DOWNS_OUT = "downs-crowd.glb"
DOWNS_COLL = "MoonDownsCrowd"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# tinted slots (white in game, tinted per fan; preview colours are a typical racegoer's). Fixed slots (`black`, `mint`, `barn`,
# `barn2`, `gold`, `saddle`) are the Downs' own
for s, h in {"coat": "3b393a", "shirt": "f8fff8", "legs": "5a5760", "skin": "e9b98f", "hair": "5a3a22", "hat": "3b393a", "band": "8b4044"}.items():
    SLOT_COLORS[s] = S(h)
    material(s)

HX, HY, HZ = 0.25, 0.2625, 0.2375                 # head half-sizes (egg 0.5 wide, 0.525 high, 0.475 deep)
HAIR_INK = 0.02
HATS = {}                                         # name -> (hat-slot shell geometry, brim top height): crowns the hairdos must fit in
HAIRS = {}                                        # name -> hairdo geometry


# ---------------- helpers ----------------

def ring_stack(rings, n=10, e=2.6, top=None):
    """Closed torso-like solid from superelliptic rings [(y, a, b, zc)] bottom to top (half-width a, half-depth b, centred on z = zc,
    first point at the front, +z). Bottom fans to its middle, top to `top` (default the last ring's middle). Triangles only, so what
    race.js draws is exactly what drape() lies on."""
    verts, faces = [], []
    for (y, a, b, zc) in rings:
        for i in range(n):
            t = 2 * PI * i / n
            verts.append((a * spe(math.sin(t), 2 / e), y, zc + b * spe(math.cos(t), 2 / e)))
    for j in range(len(rings) - 1):
        for i in range(n):
            i2 = (i + 1) % n
            a, b, c, d = j * n + i, j * n + i2, (j + 1) * n + i2, (j + 1) * n + i
            faces += [(a, b, c), (a, c, d)]
    y, _, _, zc = rings[0]
    verts.append((0.0, y, zc)); c0 = len(verts) - 1
    faces += [(c0, (i + 1) % n, i) for i in range(n)]
    y, _, _, zc = rings[-1]
    verts.append(top or (0.0, y, zc)); c1 = len(verts) - 1
    base = (len(rings) - 1) * n
    faces += [(c1, base + i, base + (i + 1) % n) for i in range(n)]
    return verts, faces


def lerp_ring(rings, y):
    """section of ring_stack(rings) at height y (sides are straight between rings)"""
    for r0, r1 in zip(rings, rings[1:]):
        if r0[0] <= y <= r1[0]:
            f = (y - r0[0]) / (r1[0] - r0[0])
            return tuple(r0[k] + (r1[k] - r0[k]) * f for k in range(4))
    raise ValueError(y)


def tris_of(geo):
    v, f = geo
    return [(v[fc[0]], v[fc[k]], v[fc[k + 1]]) for fc in f for k in range(1, len(fc) - 1)]


def front_hit(tris, x, y):
    """first hit of the line through (x, y) along z from the front (+z): (z, triangle normal turned to +z), or None"""
    best = None
    for a, b, c in tris:
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d
        l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d
        l3 = 1 - l1 - l2
        if min(l1, l2, l3) < -1e-9:
            continue
        z = l1 * a[2] + l2 * b[2] + l3 * c[2]
        if best is None or z > best[0]:
            u = Vector(b) - Vector(a); w = Vector(c) - Vector(a)
            n = u.cross(w).normalized()
            best = (z, n if n.z > 0 else -n)
    return best


def drape(tris, pts, faces, proud, sink):
    """Thin plate on the front of a host (triangles `tris`): outline pts [(x, y)] and `faces` (indices into pts) are projected onto
    the host along z, face `proud` in front, back `sink` inside, closed round the boundary. Put its corners on the host's creases
    and it lies parallel to them."""
    zs = []
    for x, y in pts:
        h = front_hit(tris, x, y)
        if h is None:
            raise RuntimeError(f"drape: ({x:.3f}, {y:.3f}) misses its host")
        zs.append(h[0])
    n = len(pts)
    verts = [(x, y, z + proud) for (x, y), z in zip(pts, zs)] + [(x, y, z - sink) for (x, y), z in zip(pts, zs)]
    out = [tuple(f) for f in faces] + [(f[0] + n, f[2] + n, f[1] + n) for f in faces]
    count = {}
    for f in faces:
        for k in range(3):
            e = (f[k], f[(k + 1) % 3])
            count[tuple(sorted(e))] = count.get(tuple(sorted(e)), 0) + 1
    for f in faces:
        for k in range(3):
            a, b = f[k], f[(k + 1) % 3]
            if count[tuple(sorted((a, b)))] == 1:
                out.append((b, a, a + n, b + n))
    return verts, out


def on_face(tris, x, y, w, h, proud, sink, rz=0.0, pyramid=False):
    """w x h tile on the host facet at (x, y), turned rz about its normal, `proud` out and `sink` in (scarf end, ribbon). With
    `pyramid`: a w x h face `proud` out on a point `sink` in (6 tris, not 12: eyes, brows, mouth, seen only from the front)"""
    z, nrm = front_hit(tris, x, y)
    rx, ry = -math.asin(max(-1.0, min(1.0, nrm.y))), math.atan2(nrm.x, nrm.z)
    if pyramid:
        g = ([(-w / 2, -h / 2, proud), (w / 2, -h / 2, proud), (w / 2, h / 2, proud), (-w / 2, h / 2, proud), (0, 0, -sink)], [(0, 1, 2, 3), (1, 0, 4), (2, 1, 4), (3, 2, 4), (0, 3, 4)])
    else:
        g = xf(cuboid(w, h, proud + sink)[:2], (0, 0, (proud - sink) / 2))
    v, f = xf(g, (0, 0, 0), (0, 0, rz))
    v, f = xf((v, f), (0, 0, 0), (rx, ry, 0))
    c = Vector((x, y, z))
    return [tuple(Vector(p) + c) for p in v], f


def leaf(pts, thick):
    """flat x-y outline [(x, y)], `thick` deep (feather, pennant)"""
    return extrude(pts, thick, "z")


def inside(tris, p):
    """is p inside this closed solid (ray up +y, counting crossings)"""
    x, z = p[0] + 1.37e-6, p[2] + 2.71e-6                # nudge the ray off vertices and edges
    hits = 0
    for a, b, c in tris:
        d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
        if abs(d) < 1e-14:
            continue
        l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d
        l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d
        l3 = 1 - l1 - l2
        if min(l1, l2, l3) < 0 or max(l1, l2, l3) > 1:
            continue
        if l1 * a[1] + l2 * b[1] + l3 * c[1] > p[1]:
            hits += 1
    return hits % 2 == 1


def head_pt(th, ph, g=1.0):
    """point on the head egg grown by g: th down from the crown (0), ph round from the front (0) toward the left (+x)"""
    return (g * HX * math.sin(th) * math.sin(ph), g * HY * math.cos(th), g * HZ * math.sin(th) * math.cos(ph))


def hair_cap(front, side, back, g_top=1.08, g_side=1.08, nc=10, nr=3, lip=0.86):
    """Hairdo: shell over the crown down to a hairline at polar angle `front` (brows), `side` (ears), `back` (nape), scaled
    g_top / g_side on crown and sides. A lip turns in 2 to 3 cm under the hairline so the outline draws it where the lip leaves the
    skin. Open inside the lip (hidden in the head; saves a closing cone and its outline per fan)."""
    def hem(ph):
        c = math.cos(ph)
        return side + (front - side) * max(c, 0) + (back - side) * max(-c, 0)

    def grow(th):
        f = min(1.0, max(0.0, (th - 0.85) / 0.7))
        return g_top + (g_side - g_top) * f * f * (3 - 2 * f)
    verts = [(0.0, HY * g_top, 0.0)]
    for r in range(1, nr + 1):
        for i in range(nc):
            ph = 2 * PI * i / nc
            th = hem(ph) * r / nr
            verts.append(head_pt(th, ph, grow(th)))
    for i in range(nc):
        ph = 2 * PI * i / nc
        verts.append(head_pt(hem(ph), ph, lip))
    ring = lambda r, i: 1 + (r - 1) * nc + i % nc
    faces = [(0, ring(1, i), ring(1, i + 1)) for i in range(nc)]
    for r in range(1, nr + 1):                            # last band is the lip
        for i in range(nc):
            a, b, c, d = ring(r, i), ring(r, i + 1), ring(r + 1, i + 1), ring(r + 1, i)
            faces += [(a, c, b), (a, d, c)]
    return verts, faces


def limb(A, sx, pts, r0=0.068, r1=0.055, seg=6):
    """Arm as one tube from deep in the torso at (+-0.19, 0.355) (end cap 3 cm inside whatever the angle), out under the widest
    shoulder ring, through pts (elbow, wrist). One closed piece: the outline runs unbroken round the elbow and the torso exit reads
    as the sleeve seam. Radius r0 at the shoulder to r1 at the wrist."""
    pts = [(sx * 0.19, 0.355, -0.01)] + list(pts)
    rs = [r0 + (r1 - r0) * k / (len(pts) - 1) for k in range(len(pts))]
    A.path(pts, rs, seg)


def along(geo, c, n):
    """geo (built round the origin, facing +z) turned to face n and moved to c"""
    n = Vector(n).normalized()
    rx, ry = -math.asin(max(-1.0, min(1.0, n.y))), math.atan2(n.x, n.z)
    return xf(geo, tuple(c), (rx, ry, 0))


def on_both(x, y, w, h, proud, sink, rz=0.0):
    """chest tile fitting both bodies: on the suit facet at (x, y), `proud` out of the more forward body, `sink` into the other"""
    zs, zf = front_hit(suit_tris, x, y)[0], front_hit(frock_tris, x, y)[0]
    return on_face(suit_tris, x, y, w, h, proud + max(0.0, zf - zs), sink + max(0.0, zs - zf), rz)


def blade(c0, d, side, outline, thick):
    """flat blade (feather) from c0: outline [(u, v)], v along d, u along `side`, `thick` thick"""
    d = Vector(d).normalized()
    sv = Vector(side) - d * Vector(side).dot(d)
    sv.normalize()
    tn = d.cross(sv)
    n = len(outline)
    verts = [tuple(Vector(c0) + sv * u + d * v + tn * s) for s in (-thick / 2, thick / 2) for (u, v) in outline]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return verts, faces


# =====================================================================================================
# dn_fan_legs
# =====================================================================================================
# ~1000 drawn at once with outlines: every part is a handful of boxes and tubes
root = pivot("dn_fan_legs", (0, 0, 0))
P = parts(root, "dn_fan_legs", {"legs": 0.03, "black": 0.015})
for sx in (-1, 1):
    P["legs"].boxc(sx * 0.17, -0.38, 0.345, 0.2, 0.2, 0.75)                               # thighs from the seat (z -0.03 to 0.72: knees)
    P["legs"].boxc(sx * 0.17, -0.55, 0.62, 0.17, 0.38, 0.17)                              # shins (y -0.74 to -0.36, tops in the thighs, hems over the shoes)
    P["black"].boxc(sx * 0.17, -0.75, 0.655, 0.15, 0.1, 0.29)                             # shoes: soles at -0.8, toes 0.8 forward

# =====================================================================================================
# dn_fan_body (the suit) and dn_fan_body2 (the frock)
# =====================================================================================================
# Torso is one closed solid (ring_stack): shoulders, chest and hips are one jointless surface; its foot is 1 cm above the seat
# (y -0.49) so nothing shows behind the thighs. Both bodies share the chest front where favours pin on (left breast, x 0.15,
# y 0.18 to 0.3: within 1 cm there).
SUIT = [(-0.49, 0.27, 0.2, -0.01), (-0.2, 0.27, 0.19, 0.0), (0.12, 0.29, 0.2, 0.0), (0.33, 0.33, 0.17, -0.01), (0.43, 0.27, 0.13, -0.02)]
FROCK = [(-0.49, 0.3, 0.215, -0.01), (-0.2, 0.235, 0.17, 0.0), (0.12, 0.27, 0.195, 0.0), (0.33, 0.3, 0.165, -0.01), (0.43, 0.25, 0.125, -0.02)]
NECK = (0.0, 0.49, -0.02)
suit_geo = ring_stack(SUIT, top=NECK)
frock_geo = ring_stack(FROCK, top=NECK)
suit_tris, frock_tris = tris_of(suit_geo), tris_of(frock_geo)

root = pivot("dn_fan_body", (0, 0, 0))
P = parts(root, "dn_fan_body", {"coat": 0.03, "shirt": 0.01, "band": 0.0})
P["coat"].add(suit_geo)
# shirt V between the lapels, 8 mm proud (its outline is the lapel edge); corners on torso creases (x = 0, shoulder ring at y 0.33)
w33 = 0.09 * (0.33 - 0.15) / (0.42 - 0.15)
V = [(-0.09, 0.42), (0.0, 0.42), (0.09, 0.42), (-w33, 0.33), (0.0, 0.33), (w33, 0.33), (0.0, 0.15)]
P["shirt"].add(drape(suit_tris, V, [(0, 4, 1), (0, 3, 4), (1, 4, 5), (1, 5, 2), (3, 6, 4), (4, 6, 5)], 0.008, 0.012))
# tie, 6 mm proud of the shirt (no outline needed): knot under the chin, blade to a point where the jacket closes (inside the V throughout)
T = [(-0.03, 0.415), (0.0, 0.415), (0.03, 0.415), (-0.02, 0.33), (0.0, 0.33), (0.02, 0.33), (-0.025, 0.27), (0.0, 0.245), (0.025, 0.27)]
P["band"].add(drape(suit_tris, T, [(0, 4, 1), (0, 3, 4), (1, 4, 5), (1, 5, 2), (3, 6, 4), (4, 6, 7), (4, 7, 8), (4, 8, 5)], 0.014, 0.004))

root = pivot("dn_fan_body2", (0, 0, 0))
P = parts(root, "dn_fan_body2", {"coat": 0.03, "shirt": 0.0, "band": 0.0})
P["coat"].add(frock_geo)
# belt: waist band 6 mm proud all round (following the torso's straight sides between rings), no outline
P["band"].add(ring_stack([tuple(r[:1]) + (r[1] + 0.006, r[2] + 0.006, r[3]) for r in (lerp_ring(FROCK, -0.26), lerp_ring(FROCK, -0.2), lerp_ring(FROCK, -0.15))]))
# collar: two rounded tabs under the chin, 6 mm proud, no outline
for sx in (-1, 1):
    C2 = [(0.0, 0.42), (sx * 0.06, 0.425), (sx * 0.11, 0.405), (sx * 0.105, 0.36), (sx * 0.07, 0.335), (sx * 0.02, 0.36)]
    fs = [(0, 1, 5), (1, 4, 5), (1, 2, 4), (2, 3, 4)] if sx > 0 else [(0, 5, 1), (1, 5, 4), (1, 4, 2), (2, 4, 3)]
    P["shirt"].add(drape(frock_tris, C2, fs, 0.006, 0.012))

# =====================================================================================================
# arms: each sleeve one tube (limb) from inside the torso, radius 0.068 to 0.055 at the wrist; wrist ends inside the hand
# =====================================================================================================


def lap_arm(A, H, sx):
    limb(A, sx, [(sx * 0.36, 0.02, 0.04), (sx * 0.215, -0.22, 0.36)])
    H.boxc(sx * 0.2, -0.25, 0.42, 0.1, 0.07, 0.14, rot=(0, -sx * 0.25, 0))                # palm down on the thigh, heel 5 mm in


root = pivot("dn_fan_lap", (0, 0, 0))
P = parts(root, "dn_fan_lap", {"coat": 0.03, "skin": 0.015})
for sx in (-1, 1):
    lap_arm(P["coat"], P["skin"], sx)

root = pivot("dn_fan_prog", (0, 0, 0))
P = parts(root, "dn_fan_prog", {"coat": 0.03, "skin": 0.015, "mint": 0.0, "barn": 0.008})
for sx in (-1, 1):
    limb(P["coat"], sx, [(sx * 0.35, 0.0, 0.08), (sx * 0.15, 0.11, 0.36)])
    P["skin"].boxc(sx * 0.15, 0.15, 0.39, 0.06, 0.13, 0.1)                                # hands at the programme's outer edges
    # programme open before the chest, leaning back 40° so pages face the eyes and the Barn Red cover faces the track; leaves open
    # in a V toward the reader, pages 4 mm proud of the cover and 6 mm in from its edges
    tilt = (-(PI / 2 + 0.88), sx * 0.25, 0)
    P["barn"].add(cuboid(0.16, 0.22, 0.008)[:2], t=(sx * 0.08, 0.15, 0.42), rot=tilt)
    P["mint"].add(xf(cuboid(0.148, 0.208, 0.006)[:2], (0, 0, 0.005)), t=(sx * 0.08, 0.15, 0.42), rot=tilt)

root = pivot("dn_fan_bino", (0, 0, 0))
P = parts(root, "dn_fan_bino", {"coat": 0.03, "skin": 0.015, "black": 0.01})
for sx in (-1, 1):
    limb(P["coat"], sx, [(sx * 0.3, 0.12, 0.27), (sx * 0.11, 0.6, 0.33)])
    P["skin"].boxc(sx * 0.1, 0.645, 0.34, 0.07, 0.12, 0.11)                               # hands round the barrels
    # binoculars at the eyes (0.705 up in body frame): two barrels and a bridge, eyecups 3 cm off the face, axes 1.5 cm above eye
    # centre so the barrels clear the nose (hands overlap from below)
    P["black"].cylc(sx * 0.055, 0.72, 0.315, 0.042, 0.15, 6, rot=(PI / 2, 0, 0))
P["black"].boxc(0, 0.72, 0.32, 0.06, 0.035, 0.07)

root = pivot("dn_fan_arms", (0, 0, 0))
P = parts(root, "dn_fan_arms", {"coat": 0.03, "skin": 0.015})
for sx in (-1, 1):
    limb(P["coat"], sx, [(sx * 0.56, 0.6, 0.04), (sx * 0.6, 0.9, 0.06)])
    P["skin"].boxc(sx * 0.615, 0.97, 0.06, 0.1, 0.15, 0.05, rot=(0, 0, -sx * 0.12))       # open hands, palms to the track

root = pivot("dn_fan_arm1", (0, 0, 0))
P = parts(root, "dn_fan_arm1", {"coat": 0.03, "skin": 0.015, "saddle": 0.008, "band": 0.008})
limb(P["coat"], -1, [(-0.56, 0.62, 0.05), (-0.58, 0.93, 0.08)])                                 # as wide as the two-armed cheer: clears the race-day hat brim
P["skin"].boxc(-0.58, 0.97, 0.08, 0.09, 0.1, 0.09)                                        # fist round the stick
lap_arm(P["coat"], P["skin"], 1)
P["saddle"].cylc(-0.58, 1.185, 0.08, 0.012, 0.5, 6)                                       # stick (foot 1.5 cm up inside the fist)
P["band"].add(leaf([(-0.58, 1.4), (-0.94, 1.33), (-0.58, 1.24)], 0.012), t=(0, 0, 0.08))  # pennant (edge on the stick's axis)

# =====================================================================================================
# favours (fit both bodies)
# =====================================================================================================
root = pivot("dn_fan_rosette", (0, 0, 0))
P = parts(root, "dn_fan_rosette", {"band": 0.01, "gold": 0.0})
# left breast, on one column of suit chest facets (x 0.065 to 0.185): clear of the shirt V and the next crease at x 0.2
RX, RY = 0.125, 0.24
zs, zr = front_hit(suit_tris, RX, RY)[0], front_hit(frock_tris, RX, RY)[0]
nrm = front_hit(suit_tris, RX, RY)[1]
back, face = min(zs, zr) - 0.015, max(zs, zr) + 0.022                                       # back 15 mm into the nearer chest, face 22 mm out of the further
P["band"].add(along(xf(cylinder(0.06, 0.06, face - back, 8)[:2], (0, 0, 0), (PI / 2, 0, 0)), (RX, RY, (back + face) / 2), nrm))
P["gold"].add(along(xf(cylinder(0.024, 0.024, 0.008, 6)[:2], (0, 0, 0), (PI / 2, 0, 0)), Vector((RX, RY, (back + face) / 2)) + nrm * ((face - back) / 2), nrm))   # button, 4 mm proud
for k in (-1, 1):                                                                            # two splayed tails on the breast, 6 mm proud
    P["band"].add(on_both(RX + k * 0.022, RY - 0.1, 0.034, 0.13, 0.006, 0.008, rz=-k * 0.2))

root = pivot("dn_fan_scarf", (0, 0, 0))
P = parts(root, "dn_fan_scarf", {"band": 0.012})
P["band"].tor(0.14, 0.045, t=(0, 0.45, -0.01), n=8, rs=4, s=(1.12, 1, 1.0))                # round the neck, under the chin
for k, (x, rz) in enumerate(((-0.065, 0.04), (-0.14, 0.12))):                              # two ends down the right breast, outer longer, 3.5 cm proud (2 cm clear of a tie)
    L = 0.27 if k == 0 else 0.33
    P["band"].add(on_both(x, 0.42 - L / 2, 0.085, L, 0.035, 0.045, rz=rz))                # 4.5 cm deep: the back stays buried where the chest falls away above y 0.33

# =====================================================================================================
# dn_fan_head
# =====================================================================================================
# 8 x 5 egg turned an eighth of a turn so a flat facet faces forward: eyes (middle facet, y -0.08 to 0.08), brows (above) and
# mouth (below) each on one facet, 4 mm proud. The ears are one bar through the head.
root = pivot("dn_fan_head", (0, 0, 0))
P = parts(root, "dn_fan_head", {"skin": 0.03, "black": 0.0, "hair": 0.0, "barn2": 0.0})
head_geo = xf(xf(sphere(1.0, 8, 5)[:2], (0, 0, 0), (0, PI / 8, 0)), (0, 0, 0), (0, 0, 0), (HX, HY, HZ))
head_tris = tris_of(head_geo)
H = P["skin"]
H.add(head_geo)
H.boxc(0, -0.02, 0.24, 0.07, 0.09, 0.1)                                                   # nose (z 0.19 to 0.29: half inside the face)
H.boxc(0, -0.04, 0.005, 0.53, 0.09, 0.07)                                                # ears: one bar through the head, y -0.085 to 0.005: below every hairline, so no ear or outline pokes through hair
for sx in (-1, 1):
    P["black"].add(on_face(head_tris, sx * 0.06, 0.045, 0.034, 0.045, 0.004, 0.006, pyramid=True))     # eyes
    P["hair"].add(on_face(head_tris, sx * 0.06, 0.104, 0.05, 0.017, 0.004, 0.006, rz=sx * 0.12, pyramid=True))   # brows, outer ends raised
P["barn2"].add(on_face(head_tris, 0.0, -0.105, 0.075, 0.018, 0.004, 0.006, pyramid=True))  # mouth

# =====================================================================================================
# hairdos
# =====================================================================================================
D = math.radians


def hairdo(name, geo, extra=()):
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"hair": HAIR_INK})
    P["hair"].add(geo)
    for g in extra:
        P["hair"].add(g)
    HAIRS[name] = join([geo] + list(extra))


hairdo("dn_fan_hair", hair_cap(D(52), D(80), D(104)))
hairdo("dn_fan_hair_bun", hair_cap(D(50), D(82), D(100)), [xf(sphere(0.085, 6, 3)[:2], (0, -0.035, -0.255))])
hairdo("dn_fan_hair_long", hair_cap(D(48), D(112), D(118), g_side=1.13),
       [extrude([(-0.15, 0.1), (-0.255, 0.04), (-0.29, -0.1), (-0.27, -0.33), (-0.14, -0.36)], 0.36, "x"),   # to the shoulders, foot in the jacket back
        xf(cuboid(0.62, 0.17, 0.15)[:2], (0, -0.02, -0.01))])                                    # a lock over each ear, covering ear and outline; middle inside the head
hairdo("dn_fan_hair_thin", hair_cap(D(28), D(84), D(104), g_top=1.06, g_side=1.07))

# =====================================================================================================
# hats: ten-sided lathed crowns and brims; bands 5 mm proud on the same ten sides
# =====================================================================================================


def hat(name, profile, brim_top, band=None, s=(1, 1, 1), t=(0, 0, 0), rot=(0, 0, 0), extra=(), trims=()):
    """hat: lathed shell (`hat`) moved by s, rot, t; extra hat-slot pieces; band (r, y0, y1) 5 mm proud of a radius-r crown (no
    outline needed); proud trims (`band`, outlined: flower, feathers)"""
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, {"hat": 0.015, "band": 0.0})
    shell = xf(lathe(profile, 10)[:2], t, rot, s)
    P["hat"].add(shell)
    for g in extra:
        P["hat"].add(g)
    if band:
        r, y0, y1 = band
        P["band"].add(xf(cylinder(r + 0.005, r + 0.005, y1 - y0, 10)[:2], (0, (y0 + y1) / 2, 0)))
    if trims:
        A = Acc(f"{name}_trim", "band", root, 0.008)
        for g in trims:
            A.add(g)
    HATS[name] = (join([shell] + list(extra)), brim_top)


# flat cap: soft crown pulled forward and down, peak over the brows (base rises to 0.13 at the back, so hair is checked from there up)
hat("dn_fan_cap", [(0, 0.1), (0.29, 0.1), (0.305, 0.16), (0.285, 0.25), (0.2, 0.32), (0, 0.345)], 0.135,
    s=(1, 1, 1.1), t=(0, 0, 0.025), rot=(0.1, 0, 0),
    extra=[xf(cuboid(0.34, 0.025, 0.17)[:2], (0, 0.085, 0.385), (0.22, 0, 0))])
# bowler: domed crown, brim curled up at the edge
hat("dn_fan_derby", [(0, 0.12), (0.33, 0.12), (0.345, 0.145), (0.275, 0.15), (0.275, 0.21), (0.23, 0.31), (0.12, 0.355), (0, 0.365)], 0.15, band=(0.275, 0.155, 0.2))
# top hat, crown flaring slightly upward
hat("dn_fan_tophat", [(0, 0.12), (0.345, 0.12), (0.35, 0.14), (0.27, 0.15), (0.285, 0.55), (0, 0.55)], 0.15, band=(0.272, 0.155, 0.23))
# boater: flat crown, flat brim
hat("dn_fan_boater", [(0, 0.13), (0.4, 0.13), (0.405, 0.155), (0.265, 0.155), (0.265, 0.32), (0, 0.32)], 0.155, band=(0.265, 0.165, 0.225))
# race-day hat: wide drooping brim, low crown, flower on the band at the left (on the +x crown facet at x 0.252, 4 cm out and
# 4 cm in, so its back stays buried where the crown tapers above the band)
hat("dn_fan_sunhat", [(0, 0.1), (0.47, 0.055), (0.48, 0.07), (0.29, 0.135), (0.265, 0.145), (0.265, 0.2), (0.22, 0.28), (0, 0.32)], 0.145, band=(0.265, 0.15, 0.2),
    trims=[xf(cylinder(0.065, 0.065, 0.08, 8)[:2], (0.255, 0.19, 0.0), (0, 0, PI / 2))])
# fascinator: disc on the right of the head, middle sunk into the hair, two feathers sweeping up and back
_c = Vector(head_pt(D(52), D(-80), 1.09))
_n = Vector((_c.x / HX ** 2, _c.y / HY ** 2, _c.z / HZ ** 2)).normalized()
_sweep = [(_n + Vector((0, 0.9, -0.9))).normalized(), (_n + Vector((-0.4, 0.5, -1.1))).normalized()]
hat("dn_fan_fascinator", [(0, -0.012), (0.11, -0.012), (0.11, 0.012), (0, 0.012)], -1.0, t=tuple(_c), rot=(math.asin(_n.z), 0, math.atan2(-_n.x, _n.y)),
    trims=[blade(_c, d, _n.cross(d), [(0, 0), (0.028, 0.12), (0.012, 0.3), (-0.014, 0.15)], 0.012) for d in _sweep])

# =====================================================================================================
# audit: every hairdo and its outline inside every hat crown above the brim
# =====================================================================================================
bad = []
for hn, (shell, brim_top) in HATS.items():
    if brim_top < 0:
        continue                                                                          # fascinator sits on the hair
    st = tris_of(shell)
    for an, hg in HAIRS.items():
        for v in hg[0]:
            if v[1] <= brim_top + 0.004:
                continue
            p = Vector(v)
            d = Vector((p.x / HX ** 2, p.y / HY ** 2, p.z / HZ ** 2)).normalized()          # hair outline extends roughly along the egg normal
            q = p + d * (HAIR_INK + 0.004)
            if not inside(st, tuple(q)):
                bad.append(f"{an} pokes out of {hn} at ({q.x:.3f}, {q.y:.3f}, {q.z:.3f})")
if bad:
    raise RuntimeError("hair through a hat:\n  " + "\n  ".join(bad[:20]))
print("AUDIT hats hold the hair ok")

finish_and_export()
# draw cost per part including outline shells (inked meshes draw twice)
_drawn = {}
for o in C.objects:
    if o.type == "MESH":
        n = sum(len(q.vertices) - 2 for q in o.data.polygons)
        _drawn[o.parent.name] = _drawn.get(o.parent.name, 0) + n * (2 if o.get("ink", 0) > 0 else 1)
print("triangles drawn per part, with outlines:", _drawn)
