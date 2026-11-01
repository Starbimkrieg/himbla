# Dr. Zbornak, two looks (build_zbornak_lab.py execs this after zbornak_kit.py). An alien, so no helmet; a lab coat
# scorched by his experiments (burnt hem, a hole, embers still glowing); a clipboard in the left arm and a pen
# in the right hand. Standing at the origin facing +z, the feet on y = 0. Pivot `head` sits at the neck (the game turns it
# to watch the player, as the casino's bouncer does).
#   A "The Elder"   2.35 m: tall and thin, pale green; an egg of a cranium tipped back with brain ridges, three eyes (two
#                   almond, one on the brow), brass goggles pushed up; long knee coat, the hem burnt ragged, one cuff
#                   singed, a hole by the pocket.
#   B "The Singed"  2.0 m: stocky, violet; a wide dome with seven frazzled head-fronds blown upright by the last blast (black
#                   tips, embers), one big eye behind a brass loupe on a headband, a grin, fin ears with a bite out of one;
#                   a shin-length coat with the left sleeve burnt off at the elbow and smoke still curling off the shoulder,
#                   a welding glove on the right hand.

import math
from mathutils import Vector


def coat_r(prof, y):
    for (r0, y0), (r1, y1) in zip(prof, prof[1:]):
        if y0 <= y <= y1:
            return r0 + (r1 - r0) * (y - y0) / max(1e-6, y1 - y0)
    return prof[-1][0]


def on_coat(prof, sz, a, y, out=0.004):
    """a point on the coat's skin at angle a (from +z toward +x) and height y, and the yaw that faces out there"""
    r = coat_r(prof, y) + out
    p = (math.sin(a) * r, y, math.cos(a) * r * sz)
    return p, math.atan2(math.sin(a), math.cos(a) * sz)


def dang(a, c):
    """how far angle a is from angle c (0..pi)"""
    return abs((a - c + PI) % TAU - PI)


def burn(g, prof, sz, region, grow=0.004, slot="scorch", segs=72):
    """a burn laid on the coat: its skin, grown out a few mm and cut to the faces whose (angle, height) pass region(a, y)"""
    ys = [prof[0][1] + i * 0.02 for i in range(int((prof[-1][1] - prof[0][1]) / 0.02) + 1)]
    fine = [(coat_r(prof, y) + grow, y) for y in ys]
    v, f = lathe(fine, segs)[:2]
    v = [(x, y, z * sz) for x, y, z in v]

    def keep_face(c):
        return region(math.atan2(c[0], c[2] / sz), c[1])
    g(slot, 0.0).add(keep((v, f), keep_face))


def licks(hem, seed, n, reach, base):
    """a region: a charred band up from the hem with flame tongues licking higher at n places"""
    def region(a, y):
        h = base
        for k in range(n):
            c = (seed * 1.7 + k * TAU / n + math.sin(seed + k * 2.3) * 0.5) % TAU
            d = abs((a - c + PI) % TAU - PI)
            h = max(h, reach * (0.6 + 0.4 * math.sin(seed * 3 + k)) * max(0.0, 1 - d / 0.32) ** 1.5)
        return y < hem + h
    return region


def patch(a0, y0, ra, ry):
    def region(a, y):
        d = ((a - a0 + PI) % TAU - PI) / ra
        return d * d + ((y - y0) / ry) ** 2 < 1 + 0.25 * math.sin(a * 23 + y * 31)
    return region


def on_head(c, r, rot, d, out=0.0):
    """a point on an ellipsoid (centre c, radii r, turned rot) in local direction d, its outward normal, and the euler
    that turns +z onto that normal"""
    from mathutils import Euler
    d = Vector(d).normalized()
    k = 1 / math.sqrt(sum((d[i] / r[i]) ** 2 for i in range(3)))
    p = d * k
    n = Vector((p.x / r[0] ** 2, p.y / r[1] ** 2, p.z / r[2] ** 2)).normalized()
    M = Euler(rot, "XYZ").to_matrix()
    n = M @ n
    p = M @ p + Vector(c) + n * out
    return tuple(p), tuple(Vector((0, 0, 1)).rotation_difference(n).to_euler())


def hand(g, wrist, fwd, up, fingers=4, length=0.13, curl=0.9, slot="skin", r=0.022, palm=0.055):
    """a hand at the wrist: a palm along fwd and fingers curling round toward -up by `curl`"""
    f, u = Vector(fwd).normalized(), Vector(up).normalized()
    s = f.cross(u).normalized()
    w = Vector(wrist)
    pc = w + f * palm
    g(slot, 0.012).ball(*pc, palm, 8, 6, s=(1, 0.55, 1.15))
    for i in range(fingers):
        o = s * ((i - (fingers - 1) / 2) * r * 2.1)
        p0 = pc + f * palm * 0.8 + o
        p1 = p0 + f * length * 0.5 - u * length * 0.15 * curl
        p2 = p1 + f * length * 0.25 * (1 - curl) - u * length * 0.45 * curl
        g(slot, 0.008).path([tuple(p0), tuple(p1), tuple(p2)], [r, r * 0.9, r * 0.7], 5)
    t0 = pc + s * palm * 0.9
    g(slot, 0.008).path([tuple(t0), tuple(t0 + f * 0.05 + s * 0.03 + u * 0.03), tuple(t0 + f * 0.09 + u * 0.05)], [r, r * 0.85, r * 0.7], 5)


def clipboard(g, c, rot, w=0.34, h=0.46):
    """a clipboard centred at c, turned rot (its face +z): board, paper with lines and a sketched chimera, steel clip"""
    def put(slot, ink, geo):
        g(slot, ink).add(geo, c, rot)
    put("board", 0.012, xf(cuboid(w, h, 0.018)[:2]))
    put("paper", 0.0, xf(cuboid(w - 0.04, h - 0.07, 0.004)[:2], (0, -0.02, 0.011)))
    put("paper", 0.0, xf(cuboid(w - 0.05, h - 0.09, 0.004)[:2], (0.008, -0.03, 0.015), (0, 0, 0.04)))
    for i in range(7):
        ww = (w - 0.12) * (0.55 + 0.45 * ((i * 7) % 5) / 4)
        put("inkline", 0.0, xf(cuboid(ww, 0.006, 0.002)[:2], (-0.03 + (w - 0.12 - ww) / -2 + 0.03, 0.09 - i * 0.032 - 0.04, 0.018)))
    put("inkline", 0.0, xf(torus(0.035, 0.004, 16, 3)[:2], (0.07, 0.12, 0.018), (PI / 2, 0, 0)))
    put("lime", 0.0, xf(cuboid(0.05, 0.05, 0.002)[:2], (-0.09, -0.17, 0.018), (0, 0, 0.785)))
    put("steel", 0.008, xf(cuboid(0.12, 0.05, 0.03)[:2], (0, h / 2 - 0.035, 0.02)))
    put("steel", 0.0, xf(cylinder(0.012, 0.012, 0.13, 8)[:2], (0, h / 2 - 0.01, 0.03), (0, 0, PI / 2)))


def pen(g, a, b, slot="pink"):
    g(slot, 0.006).bm(a, b, 0.012, 6)
    g("steel", 0.0).bm(b, tuple(Vector(b) + (Vector(b) - Vector(a)).normalized() * 0.025), 0.006, 5)


def zbornak(parent, variant, x=0.0, z=0.0, yaw=0.0):
    if variant == "a":
        return zbornak_a(parent, x, z, yaw)
    return zbornak_b(parent, x, z, yaw)


def zbornak_a(parent, x, z, yaw):
    g = G("zbornak_a", parent, x, 0, z, yaw)
    # feet and legs: long, thin, knees a touch bent
    for s in (-1, 1):
        g("shoe", 0.02).rb(s * 0.15, 0.06, 0.06, 0.09, 0.06, 0.19, 0.35)
        g("trousers", 0.025).path([(s * 0.15, 0.1, 0.0), (s * 0.14, 0.5, 0.03), (s * 0.13, 0.95, 0.0)], [0.075, 0.08, 0.1], 10)
    # the coat: a flared knee coat, flattened front to back, scorched
    prof = [(0.45, 0.58), (0.42, 0.75), (0.36, 1.0), (0.3, 1.18), (0.31, 1.35), (0.33, 1.52), (0.3, 1.62), (0.2, 1.7), (0.1, 1.74)]
    SZ = 0.72
    g("coat", 0.03).lath(prof, segs=28, s=(1, 1, SZ))
    g("coat2", 0.0).tor(0.445, 0.012, (0, 0.6, 0), n=28, rs=4, s=(1, 1, SZ))
    # front: shirt and tie in the V, lapels, a seam down the skirt, buttons, a breast pocket with pens, a badge
    sh, _ = on_coat(prof, SZ, 0, 1.47, -0.01)
    g("shirt", 0.0).rb(0, 1.5, sh[2] - 0.01, 0.075, 0.17, 0.03, 0.5)
    g("tie", 0.0).boxc(0, 1.45, sh[2] + 0.018, 0.04, 0.22, 0.012, (0, 0, 0))
    for s in (-1, 1):
        p, yy = on_coat(prof, SZ, s * 0.28, 1.47, 0.006)
        g("coat2", 0.006).boxc(p[0], p[1], p[2], 0.09, 0.3, 0.012, (0.05, yy, s * 0.22))
    for y in (0.75, 0.95, 1.12):
        p, yy = on_coat(prof, SZ, 0.0, y, 0.003)
        g("coat2", 0.0).boxc(p[0], p[1], p[2], 0.012, 0.2, 0.006, (0, yy, 0))
    for y in (1.0, 1.15, 1.3):
        p, yy = on_coat(prof, SZ, 0.18, y, 0.006)
        g("steel", 0.0).cylc(p[0], p[1], p[2], 0.016, 0.01, 8, rot=(PI / 2, yy, 0))
    p, yy = on_coat(prof, SZ, -0.55, 1.42, 0.004)
    g("coat2", 0.0).boxc(p[0], p[1], p[2], 0.13, 0.12, 0.008, (0, yy, 0))
    for k, c in enumerate(("pink", "lime", "cyan")):
        pen(g, (p[0] - 0.035 + k * 0.03, 1.4, p[2] + 0.01), (p[0] - 0.035 + k * 0.03 - 0.01, 1.53 + k * 0.01, p[2] + 0.005), c)
    p, yy = on_coat(prof, SZ, 0.6, 1.4, 0.006)
    g("white", 0.0).boxc(p[0], p[1], p[2], 0.09, 0.05, 0.008, (0, yy, 0))
    g("lime", 0.0).boxc(p[0], p[1] + 0.018, p[2] + 0.004 * math.cos(yy), 0.09, 0.012, 0.006, (0, yy, 0))
    # scorch: a ragged burnt hem (teeth of char and a singed band), blotches up the skirt and back, a burnt hole by the
    # pocket, embers in the hem
    for i in range(30):
        a = TAU * i / 30
        L = 0.05 + 0.07 * abs(math.sin(i * 2.7)) + (0.08 if i % 7 == 3 else 0)
        p, yy = on_coat(prof, SZ, a, 0.6, -0.004)
        g("scorch", 0.0).add(cylinder(0.035, 0.0, L, 4)[:2], (p[0], 0.6 - L / 2 + 0.01, p[2]), (0, yy, 0), (1, 1, 0.35))
    burn(g, prof, SZ, licks(0.6, 1.0, 5, 0.34, 0.07), 0.004, "scorch2")
    burn(g, prof, SZ, licks(0.6, 1.0, 5, 0.22, 0.04), 0.008, "scorch")
    burn(g, prof, SZ, patch(-2.3, 1.08, 0.35, 0.09), 0.004, "scorch2")
    burn(g, prof, SZ, patch(-2.3, 1.08, 0.2, 0.05), 0.008, "scorch")
    p, yy = on_coat(prof, SZ, -0.75, 0.92, 0.0)
    g("scorch2", 0.0).ball(*p, 1.0, 10, 6, s=(0.07, 0.06, 0.02), rot=(0, yy, 0))
    p, yy = on_coat(prof, SZ, -0.75, 0.92, 0.006)
    g("void", 0.0).ball(*p, 1.0, 8, 6, s=(0.04, 0.035, 0.012), rot=(0, yy, 0))
    for a in (0.5, 2.5, 3.3, -0.85):
        p, yy = on_coat(prof, SZ, a, 0.59, 0.01)
        g("ember", 0.0).ball(p[0], p[1] - 0.02, p[2], 0.018, 6, 4)
    # arms: left holds the clipboard against the chest, right writes on it
    shL, shR = Vector((-0.34, 1.57, -0.01)), Vector((0.34, 1.57, -0.01))
    elL, elR = Vector((-0.36, 1.2, 0.1)), Vector((0.38, 1.2, 0.1))
    wrL, wrR = Vector((-0.18, 1.24, 0.36)), Vector((0.12, 1.36, 0.42))
    for sh_, el_, wr_ in ((shL, elL, wrL), (shR, elR, wrR)):
        g("coat", 0.025).ball(*sh_, 0.1, 10, 7)
        g("coat", 0.025).path([tuple(sh_), tuple(el_)], [0.095, 0.085], 10)
        g("coat", 0.025).ball(*el_, 0.085, 10, 7)
        g("coat", 0.025).path([tuple(el_), tuple(wr_ + (el_ - wr_).normalized() * 0.04)], [0.085, 0.075], 10)
    # singed right cuff
    d = (wrR - elR).normalized()
    for i in range(9):
        a = TAU * i / 9
        n = d.orthogonal().normalized()
        m = d.cross(n)
        q = wrR - d * 0.05 + (n * math.cos(a) + m * math.sin(a)) * 0.07
        g("scorch", 0.0).bm(tuple(q), tuple(q + d * (0.03 + 0.03 * abs(math.sin(i * 2.1)))), 0.012, 3)
    g("scorch2", 0.0).tor(0.077, 0.012, tuple(wrR - d * 0.06), tuple(Vector((0, 1, 0)).rotation_difference(d).to_euler()), n=16, rs=4)
    hand(g, tuple(wrL), (0.55, 0.25, 0.4), (0, 0.3, 1), 3, 0.15, 0.6)
    hand(g, tuple(wrR), (-0.3, 0.2, 0.6), (0.1, 1, 0.2), 3, 0.15, 1.1)
    clipboard(g, (-0.06, 1.4, 0.42), (-0.55, 0.12, 0.08))
    pen(g, (0.1, 1.38, 0.5), (0.02, 1.47, 0.5), "pink")
    # neck and head
    g("skin", 0.02).path([(0, 1.66, -0.01), (0, 1.8, 0.0), (0, 1.9, 0.02)], [0.075, 0.06, 0.065], 10)
    g("coat2", 0.02).lath([(0.09, 1.66), (0.15, 1.7), (0.12, 1.8), (0.08, 1.79)], segs=20, s=(1, 1, SZ))
    h = G("head", g.root, 0, 1.88, 0.02)
    h.root["role"] = "head"
    h("skin", 0.03).ball(0, 0.36, -0.07, 0.29, 18, 12, s=(0.95, 1.12, 1.18), rot=(-0.42, 0, 0))
    h("skin", 0.03).ball(0, 0.15, 0.08, 0.15, 14, 10, s=(1.0, 1.3, 0.95))
    for s in (-1, 1):
        h("skin", 0.02).ball(s * 0.11, 0.2, 0.12, 0.07, 8, 6)
    CR = ((0, 0.36, -0.07), (0.29 * 0.95, 0.29 * 1.12, 0.29 * 1.18), (-0.42, 0, 0))
    # brain ridges over the crown, lying on it
    for k in range(-2, 3):
        pts = []
        for i in range(9):
            t = 0.3 + 0.62 * i / 8
            b = PI * t
            d = (k * 0.22 + math.sin(t * 9 + k) * 0.04, math.sin(b), math.cos(b))
            pts.append(on_head(*CR, d, 0.004)[0])
        h("skin2", 0.0).path(pts, 0.02, 5)
    # three eyes: two almond with lit slits, a third on the brow
    for s in (-1, 1):
        h("eye", 0.008).ball(s * 0.095, 0.27, 0.205, 0.085, 12, 8, s=(1.25, 0.62, 0.45), rot=(0, s * 0.25, -s * 0.22))
        h("iris", 0.0).ball(s * 0.105, 0.272, 0.24, 0.022, 6, 4, s=(0.6, 1.3, 0.5))
    p, e = on_head(*CR, (0, -0.33, 1), 0.0)
    h("skin2", 0.006).ball(*p, 0.055, 10, 6, s=(0.75, 1.1, 0.35), rot=e)
    p, e = on_head(*CR, (0, -0.33, 1), 0.012)
    h("eye", 0.006).ball(*p, 0.042, 10, 6, s=(0.55, 1.0, 0.35), rot=e)
    p, e = on_head(*CR, (0, -0.33, 1), 0.026)
    h("iris", 0.0).ball(*p, 0.013, 6, 4, rot=e)
    for d in ((1.0, -0.35, 0.45), (1.0, -0.15, 0.25), (-1.0, -0.35, 0.45), (-1.0, -0.15, 0.25)):
        p, e = on_head(*CR, d, 0.0)
        h("skin2", 0.0).ball(*p, 0.022, 6, 4, s=(1, 1, 0.4), rot=e)
    h("eye", 0.0).boxc(0, 0.06, 0.2, 0.09, 0.012, 0.012)
    for s in (-1, 1):
        h("eye", 0.0).boxc(s * 0.018, 0.16, 0.225, 0.012, 0.025, 0.01)
    # goggles pushed up onto the cranium: a strap round it at the brow, two brass cups with green lenses
    ring = [on_head(*CR, (math.sin(TAU * i / 32), 0.62 + 0.25 * math.cos(TAU * i / 32), math.cos(TAU * i / 32)), 0.012)[0] for i in range(33)]
    h("dark", 0.008).path(ring, 0.02, 5)
    for s in (-1, 1):
        p, e = on_head(*CR, (s * 0.38, 0.95, 0.85), 0.03)
        q = (Vector(on_head(*CR, (s * 0.38, 0.95, 0.85), 1.0)[0]) - Vector(on_head(*CR, (s * 0.38, 0.95, 0.85))[0])).normalized()
        h("brass", 0.01).add(cylinder(0.065, 0.065, 0.07, 14)[:2], p, tuple(Vector((0, 1, 0)).rotation_difference(q).to_euler()))
        h("goggle", 0.0).add(cylinder(0.05, 0.05, 0.02, 14)[:2], tuple(Vector(p) + q * 0.04), tuple(Vector((0, 1, 0)).rotation_difference(q).to_euler()))
    a_, b_ = on_head(*CR, (-0.14, 0.95, 0.9), 0.05)[0], on_head(*CR, (0.14, 0.95, 0.9), 0.05)[0]
    h("brass", 0.006).bm(a_, b_, 0.012, 5)
    # soot on the cheek and the crown
    h("soot", 0.0).ball(0.115, 0.13, 0.17, 1.0, 8, 5, s=(0.045, 0.03, 0.008), rot=(0, 0.75, 0.3))
    p, e = on_head(*CR, (-0.8, 0.6, 0.2), 0.002)
    h("soot", 0.0).ball(*p, 1.0, 8, 5, s=(0.08, 0.055, 0.006), rot=e)
    return g


def zbornak_b(parent, x, z, yaw):
    g = G("zbornak_b", parent, x, 0, z, yaw)
    for s in (-1, 1):
        g("shoe", 0.02).rb(s * 0.17, 0.07, 0.07, 0.11, 0.07, 0.2, 0.35)
        g("trousers", 0.025).path([(s * 0.17, 0.1, 0.0), (s * 0.17, 0.45, 0.02), (s * 0.15, 0.8, 0.0)], [0.09, 0.1, 0.12], 10)
    prof = [(0.48, 0.38), (0.46, 0.55), (0.44, 0.8), (0.42, 1.0), (0.41, 1.15), (0.39, 1.3), (0.33, 1.4), (0.2, 1.46), (0.1, 1.48)]
    SZ = 0.8
    g("coat", 0.03).lath(prof, segs=28, s=(1, 1, SZ))
    # buttoned front, a belt of gadgets, a high collar
    for y in (0.6, 0.78, 0.96, 1.14, 1.3):
        p, yy = on_coat(prof, SZ, 0.08, y, 0.006)
        g("steel", 0.0).cylc(p[0], p[1], p[2], 0.02, 0.012, 8, rot=(PI / 2, yy, 0))
    g("coat2", 0.0).tor(0.425, 0.03, (0, 0.96, 0), n=28, rs=4, s=(1, 1, SZ))
    for a, c in ((0.9, "lime"), (1.3, "amber"), (-1.0, "cyan")):
        p, yy = on_coat(prof, SZ, a, 0.94, 0.02)
        g("dark", 0.01).boxc(p[0], p[1], p[2], 0.08, 0.11, 0.05, (0, yy, 0))
        g(c, 0.0).boxc(p[0] + 0.03 * math.sin(yy), p[1] + 0.02, p[2] + 0.03 * math.cos(yy), 0.04, 0.03, 0.005, (0, yy, 0))
    g("coat", 0.02).lath([(0.21, 1.42), (0.24, 1.55), (0.2, 1.6)], segs=20, s=(1, 1, SZ))
    # scorch: the whole skirt-back charred, blotches, a ragged hem, embers
    for i in range(32):
        a = TAU * i / 32
        L = 0.04 + 0.06 * abs(math.sin(i * 1.9)) + (0.1 if i in (13, 17, 18, 21) else 0)
        p, yy = on_coat(prof, SZ, a, 0.4, -0.004)
        g("scorch", 0.0).add(cylinder(0.04, 0.0, L, 4)[:2], (p[0], 0.4 - L / 2 + 0.01, p[2]), (0, yy, 0), (1, 1, 0.35))
    back = licks(0.4, 2.0, 4, 0.5, 0.08)
    burn(g, prof, SZ, lambda a, y: back(a, y) or (dang(a, PI) < 0.8 and y < 0.4 + 0.55 * (1 - dang(a, PI) / 0.8) ** 0.7), 0.004, "scorch2")
    back2 = licks(0.4, 2.0, 4, 0.3, 0.05)
    burn(g, prof, SZ, lambda a, y: back2(a, y) or (dang(a, PI) < 0.55 and y < 0.4 + 0.38 * (1 - dang(a, PI) / 0.55) ** 0.7), 0.008, "scorch")
    burn(g, prof, SZ, patch(PI + 0.25, 1.18, 0.3, 0.08), 0.004, "scorch2")
    for a in (PI, PI - 0.4, PI + 0.5, 0.75):
        p, yy = on_coat(prof, SZ, a, 0.39, 0.01)
        g("ember", 0.0).ball(p[0], p[1] - 0.02, p[2], 0.02, 6, 4)
    # arms: left (sleeve burnt off at the elbow, bare forearm) holds the clipboard up to read; right, gloved, holds the pen
    shL, shR = Vector((-0.4, 1.33, 0.0)), Vector((0.4, 1.33, 0.0))
    elL, elR = Vector((-0.46, 1.0, 0.12)), Vector((0.46, 1.0, 0.1))
    wrL, wrR = Vector((-0.2, 1.22, 0.42)), Vector((0.16, 1.15, 0.44))
    for sh_, el_ in ((shL, elL), (shR, elR)):
        g("coat", 0.025).ball(*sh_, 0.12, 10, 7)
        g("coat", 0.025).path([tuple(sh_), tuple(el_)], [0.115, 0.1], 10)
    d = (elL - shL).normalized()
    for i in range(10):                                                    # the burnt-off sleeve end
        a = TAU * i / 10
        n = d.orthogonal().normalized()
        m = d.cross(n)
        q = elL - d * 0.03 + (n * math.cos(a) + m * math.sin(a)) * 0.095
        g("scorch", 0.0).bm(tuple(q), tuple(q + d * (0.03 + 0.05 * abs(math.sin(i * 2.3)))), 0.016, 3)
    g("ember", 0.0).ball(*(elL + Vector((0.0, -0.02, 0.09))), 0.018, 6, 4)
    g("skin", 0.02).ball(*elL, 0.075, 10, 7)
    g("skin", 0.02).path([tuple(elL), tuple(wrL)], [0.07, 0.06], 10)
    g("coat", 0.025).ball(*elR, 0.1, 10, 7)
    g("coat", 0.025).path([tuple(elR), tuple(wrR + (elR - wrR).normalized() * 0.08)], [0.1, 0.09], 10)
    g("glove", 0.015).path([tuple(wrR + (elR - wrR).normalized() * 0.12), tuple(wrR)], [0.11, 0.075], 10)
    hand(g, tuple(wrL), (0.4, 0.35, 0.4), (0, 0.4, 1), 4, 0.12, 0.6)
    hand(g, tuple(wrR), (-0.3, 0.25, 0.6), (0.1, 1, 0.2), 4, 0.12, 1.1, "glove", 0.028, 0.07)
    clipboard(g, (-0.06, 1.3, 0.48), (-0.9, 0.2, 0.1))
    pen(g, (0.12, 1.2, 0.56), (0.04, 1.3, 0.56), "lime")
    # smoke still curling off the left shoulder
    for k in range(5):
        t = k / 4
        g("smoke", 0.0).ball(-0.5 - t * 0.12 + math.sin(t * 5) * 0.05, 1.12 + t * 0.55, 0.1 + math.cos(t * 4) * 0.05, 0.035 + t * 0.06, 10, 7)
    # head: a wide dome, frazzled fronds, one big eye behind a loupe, a grin, fin ears (one bitten)
    g("skin", 0.02).cylc(0, 1.55, 0.0, 0.12, 0.2, 12)
    h = G("head", g.root, 0, 1.6, 0.02)
    h.root["role"] = "head"
    h("skin", 0.03).ball(0, 0.25, 0.0, 0.32, 18, 12, s=(1.12, 0.92, 1.0))
    h("skin", 0.03).ball(0, 0.1, 0.1, 0.22, 14, 10, s=(1.1, 0.7, 1.0))
    for i in range(7):
        a = -1.2 + 2.4 * i / 6
        base = (math.sin(a) * 0.22, 0.45, -0.05 + math.cos(a) * 0.05)
        pts = [base]
        for k in range(1, 6):
            t = k / 5
            pts.append((base[0] * (1 + t * 1.3) + math.sin(t * 9 + i * 1.7) * 0.05, 0.45 + t * (0.28 + 0.06 * math.sin(i * 2.2)), base[2] + math.cos(t * 7 + i) * 0.06 - t * 0.05))
        h("skin2", 0.012).path(pts[:-1], [0.04, 0.035, 0.03, 0.024, 0.018], 6)
        h("scorch", 0.0).path(pts[-2:], [0.018, 0.012], 5)
        h("ember", 0.0).ball(*pts[-1], 0.016, 6, 4)
    for s in (-1, 1):
        h("skin2", 0.012).add(cylinder(0.0, 0.1, 0.26, 6)[:2], (s * 0.38, 0.24, -0.02), (0, 0, -s * 1.2), (1, 1, 0.4))
    h("void", 0.0).ball(-0.47, 0.32, -0.02, 0.035, 6, 4)                    # the bite out of the left fin
    h("eye", 0.01).ball(0.0, 0.27, 0.27, 0.12, 14, 10, s=(1.0, 0.85, 0.5))
    h("white", 0.0).ball(0.0, 0.27, 0.315, 0.075, 12, 8, s=(1, 1, 0.3))
    h("iris", 0.0).ball(0.0, 0.27, 0.335, 0.04, 10, 6, s=(1, 1, 0.3))
    h("eye", 0.0).ball(0.0, 0.27, 0.345, 0.018, 8, 4, s=(1, 1, 0.3))
    for s in (-1, 1):
        h("eye", 0.006).ball(s * 0.2, 0.33, 0.22, 0.035, 8, 6, s=(1, 0.7, 0.5))
    h("dark", 0.008).tor(0.33, 0.02, (0, 0.38, 0.0), (0.18, 0, 0), n=32, rs=4, s=(1.12, 1, 1.0))
    h("brass", 0.008).bm((0.33, 0.38, 0.14), (0.09, 0.32, 0.37), 0.012, 5)
    h("brass", 0.01).tor(0.085, 0.016, (0.02, 0.29, 0.38), (PI / 2, 0, 0), n=20, rs=5)
    h("glass", 0.0).cylc(0.02, 0.29, 0.38, 0.08, 0.012, 16, "z")
    h("eye", 0.0).path([(-0.14, 0.08, 0.27), (-0.05, 0.03, 0.31), (0.05, 0.03, 0.31), (0.14, 0.08, 0.27)], 0.014, 4)
    for s in (-1, 1):
        h("white", 0.0).boxc(s * 0.035, 0.045, 0.315, 0.03, 0.03, 0.01)
    h("soot", 0.0).ball(-0.17, 0.14, 0.24, 1.0, 8, 5, s=(0.07, 0.045, 0.012), rot=(0, -0.6, 0.2))
    h("soot", 0.0).ball(0.12, 0.47, 0.13, 1.0, 8, 5, s=(0.09, 0.05, 0.012), rot=(-0.7, 0.4, 0.1))
    return g
