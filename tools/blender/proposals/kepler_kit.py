# The Kepler town kit, as PROPOSALS (docs/kepler-proposals): two hab-dome remodels, the station pieces the three town layouts
# are made of (a raised module on legs, a longhouse, a shop unit, a market stall, a greenhouse, a water tank, a mast, a
# connecting tunnel, a landing pad). Concepts for review: no colliders, pivots or export yet. kepler_domes.py lines the
# pieces up, kepler_town.py stands them on a layout (kepler_layouts.json), kepler_hall_a.py / _b.py are the two town halls;
# preview_kepler.py renders them all.
#
# exec() it with REPO and COLL set; it execs wing_kit.py (the accumulator and geometry every ILMB wing shares), which execs
# kit.py. three.js axes (x right, y up, +z forward), metres. Every piece is built at the origin of the current frame (at()),
# its front (door) toward +z.
#
# The palette is the point of the remodel: cream, white and aluminium shells, plum darks, ONE Kepler orange band per
# building, and a household's own colour only on its door (the DOORS slots, all muted). Today's domes are painted whole in six
# saturated colours (settlements.js buildTown's palette).

import math, os
from contextlib import contextmanager
from mathutils import Vector, Matrix

HEX = {
    "cream": 0xFFF4E0, "white": 0xF3EEE4, "light": 0xD8D4E8, "alu": 0xC9CED8, "metal": 0x8A87A0, "steel": 0x55607A,
    "panel": 0x5B5870, "roof": 0x3A3550, "dark": 0x2A2540, "door": 0x2A2540, "concrete": 0xB8B2CC, "pave": 0x9D97B0,
    "regolith": 0x8A8296, "orange": 0xFF9F1C, "green": 0x6A8F3A, "gold": 0xFFD23F, "solar": 0x1D2F6B, "blue": 0x2EC4FF,
    "soil": 0x4A4660, "leaf": 0x1F8A3A, "leaf2": 0x5CC94A, "suit": 0xFF9F1C,
    # a household's door colour: muted, never the whole shell
    "sage": 0x8FB28A, "dusk": 0x6F8FB8, "ochre": 0xE0B050, "rose": 0xC98A9A, "teal": 0x5FA8A0,
    # glow
    "window": 0xFFF6A8, "lamp": 0xFFF6A8, "pane": 0xBFEFFF, "beacon": 0xFF9F1C, "redlamp": 0xFF2A4A, "earth": 0x4FA8FF,
    "shop": 0xE8DCC0, "grow": 0xD8A0FF,
    # see-through
    "glass": 0x9BE7FF,
}
GLOW_SLOTS = {"window": 2.0, "lamp": 5.0, "pane": 1.1, "beacon": 6.0, "redlamp": 6.0, "earth": 1.6, "shop": 1.2, "grow": 3.0}
DOORS = ["sage", "dusk", "ochre", "rose", "teal"]
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())

_M = [Matrix.Identity(4)]


@contextmanager
def at(x=0.0, z=0.0, yaw=0.0, y=0.0):
    """Build in a frame at (x, y, z) turned by yaw about y (its +z toward (sin yaw, cos yaw) of the parent's x, z)."""
    _M.append(_M[-1] @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, "Y"))
    try:
        yield
    finally:
        _M.pop()


def put(slot, ink, geo, sharp=None):
    m = _M[-1]
    a = Acc.of(slot, ink) if sharp is None else Acc.of(slot, ink, sharp=sharp)
    a.put(([tuple(m @ Vector(p)) for p in geo[0]], geo[1]))


def bx(x0, y0, z0, x1, y1, z1):
    return box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))


def disc(x, y, z, r, t, yaw=0.0, seg=14):
    """a disc r across, t thick, standing up, its axis along +z turned by yaw"""
    return xf(cylinder(r, r, t, seg)[:2], (x, y, z), (PI / 2, yaw, 0))


def vring(x, y, z, R, r, yaw=0.0, n=28):
    """a torus standing up, its axis along +z turned by yaw"""
    return xf(torus(R, r, n, 6), (x, y, z), (PI / 2, yaw, 0))


def strut(a, b, r, seg=6):
    return B(a, b, r, seg, cap=True)


def rail(slot, pts, h=1.1, r=0.05, every=1.5):
    """a handrail: a top rail h over the base points, a knee rail, posts"""
    top = [(p[0], p[1] + h, p[2]) for p in pts]
    put(slot, 0.0, path_tube(top, r))
    put(slot, 0.0, path_tube([(p[0], p[1] + h * 0.5, p[2]) for p in pts], r * 0.8))
    acc = 1e9
    for i, p in enumerate(pts):
        if i:
            acc += (Vector(p) - Vector(pts[i - 1])).length
        if acc >= every or i == len(pts) - 1:
            put("steel", 0.0, strut(p, (p[0], p[1] + h, p[2]), r * 0.9, 4))
            acc = 0.0


def figure(x, z, slot="suit"):
    """a courier-sized figure, for scale"""
    put(slot, 0.03, cyl(x, 0.85, z, 0.3, 1.4, 10, rt=0.26))
    put("dark", 0.0, ball(x, 1.75, z, 0.25, 10, 7))


def lamp(x, z, h=5.0):
    put("steel", 0.02, cyl(x, h / 2, z, 0.11, h, 6, rt=0.07))
    put("steel", 0.0, cyl(x, 0.15, z, 0.28, 0.3, 8))
    put("lamp", 0.0, ball(x, h + 0.22, z, 0.32, 8, 6))


def paving(x0, z0, x1, z1, slot="pave", y=0.04):
    put(slot, 0.0, bx(x0, 0, z0, x1, y, z1))


def plaza(x, z, r, slot="pave", y=0.04, seg=40):
    put(slot, 0.0, cyl(x, y / 2, z, r, y, seg))


# ---------------------------------------------------------------------------------------------------------------------
# the airlock both domes share: a vestibule from inside the shell (z = r_in) out to z = z_out, its door at the end

def airlock(r_in, z_out, door_slot):
    w, h = 3.4, 3.3
    put("cream", 0.07, bx(-w / 2, 0.25, r_in, w / 2, h, z_out))
    put("roof", 0.04, bx(-w / 2 - 0.15, h, r_in, w / 2 + 0.15, h + 0.3, z_out + 0.7))
    put("concrete", 0.03, bx(-w / 2 - 0.3, 0, z_out - 0.4, w / 2 + 0.3, 0.25, z_out + 2.2))
    put("orange", 0.03, bx(-1.3, 0.25, z_out, 1.3, 3.0, z_out + 0.12))
    put(door_slot, 0.0, bx(-1.05, 0.25, z_out + 0.12, 1.05, 2.75, z_out + 0.16))
    put("dark", 0.0, bx(-0.03, 0.25, z_out + 0.16, 0.03, 2.75, z_out + 0.165))
    for sx in (-1, 1):
        put("pane", 0.0, disc(sx * 0.52, 1.95, z_out + 0.165, 0.26, 0.01))
        put("window", 0.0, bx(sx * (w / 2 + 0.005), 1.5, z_out - 2.2, sx * w / 2, 2.4, z_out - 0.9))
    put("lamp", 0.0, bx(-0.9, 3.2, z_out + 0.3, 0.9, 3.3, z_out + 0.6))             # (under the roof's overhang)
    for sx in (-1, 1):                                             # the step's handrails
        rail("orange", [(sx * 1.55, 0.25, z_out + 0.2), (sx * 1.55, 0.25, z_out + 2.0)], every=1.7)


def crown(y, r, glazed=True):
    """what tops a dome: a collar, a glazed lantern (or a cap), a mast and its lamp"""
    put("panel", 0.04, cyl(0, y - 0.1, 0, r * 1.15, 0.7, 20, rt=r))
    if glazed:
        put("pane", 0.0, ball(0, y + 0.25, 0, r * 0.92, 16, 6, (1, 0.55, 1)))
        for i in range(8):
            a = TAU * i / 8
            put("alu", 0.0, strut((math.sin(a) * r * 0.92, y + 0.25, math.cos(a) * r * 0.92), (0, y + 0.25 + r * 0.52, 0), 0.05, 4))
    else:
        put("roof", 0.04, cyl(0, y + 0.45, 0, r * 0.95, 0.4, 20, rt=r * 0.5))
    top = y + 0.25 + r * 0.5 if glazed else y + 0.6
    put("steel", 0.02, cyl(0, top + 1.2, 0, 0.07, 2.6, 6, rt=0.04))
    put("redlamp", 0.0, ball(0, top + 2.6, 0, 0.2, 8, 6))


# ---------------------------------------------------------------------------------------------------------------------
# DOME A, "the Shield": a low cream shell behind three terraces of sintered-regolith block (the radiation cover, built
# rather than heaped), one orange band where shell meets block, a ring of portholes, a glazed lantern at the crown.

def dome_a(r, door_slot="sage"):
    y0, hh = 0.5, r * 0.8                                           # footing height, the shell's rise over it
    rs = lambda y: r * math.sqrt(max(0.0, 1 - ((y - y0) / hh) ** 2))
    pt = lambda a, t, k=1.0: (math.sin(a) * r * math.cos(t) * k, y0 + hh * math.sin(t) * k, math.cos(a) * r * math.cos(t) * k)
    seg = 32 if r < 12 else 40 if r < 20 else 56
    put("concrete", 0.05, cyl(0, y0 / 2, 0, r + 0.35, y0, seg))
    n = 9
    put("cream", min(0.14, 0.07 + r * 0.004), lathe([(r * math.cos(PI / 2 * i / n), y0 + hh * math.sin(PI / 2 * i / n)) for i in range(n)] + [(0, y0 + hh)], seg))
    # the terraces, open at the airlock
    bh = min(4.5, 1.5 + r * 0.12)
    r1 = rs(y0 + bh * 2 / 3) + 0.9
    r2, r3 = r1 + 1.2, r1 + 2.4
    prof = [(r * 0.8, 0), (r3, 0), (r3 - 0.25, bh / 3), (r2, bh / 3), (r2 - 0.25, bh * 2 / 3), (r1, bh * 2 / 3), (r1 - 0.25, bh), (r * 0.8, bh)]
    gap = math.asin(min(0.9, 3.1 / r3))
    put("regolith", 0.06, sector(prof, PI / 2 + gap, PI / 2 + TAU - gap, seg))
    for sx in (-1, 1):                                              # a concrete cheek each side of the cut
        put("concrete", 0.04, bx(sx * 2.0, 0, r * 0.8, sx * 2.5, bh + 0.3, r3 + 0.3))
    # the band, the seams, the portholes
    tb_ = math.asin(min(0.95, (bh - y0) / hh))
    put("orange", 0.0, ring(rs(bh) + 0.02, 0.2, y=bh + 0.12, n=seg, rs=6))
    M = 8 if r < 10 else 12 if r < 18 else 16
    t1 = math.acos(min(1.0, (r * 0.2) / r))
    for i in range(M):
        a = TAU * (i + 0.5) / M
        put("white", 0.0, path_tube([pt(a, tb_ + (t1 - tb_) * j / 6, 1.002) for j in range(7)], 0.07, 4))
    put("white", 0.0, ring(r * math.cos((tb_ + t1) / 2) + 0.02, 0.07, y=y0 + hh * math.sin((tb_ + t1) / 2), n=seg, rs=4))
    tw = tb_ + 1.7 / hh
    nw = max(6, round(r * 0.9))
    for i in range(nw):
        a = TAU * (i + 0.5) / nw
        if abs(math.atan2(math.sin(a), math.cos(a))) < 4.0 / r:
            continue
        p, q = pt(a, tw, 1.0), pt(a, tw, 1.004)
        el = math.atan2(r * math.sin(tw), hh * math.cos(tw))        # the shell's normal there
        put("alu", 0.015, xf(cylinder(0.62, 0.62, 0.16, 12)[:2], p, (PI / 2 - el, a, 0)))
        put("window", 0.0, xf(cylinder(0.46, 0.46, 0.2, 12)[:2], q, (PI / 2 - el, a, 0)))
    crown(y0 + hh * math.sin(t1), r * 0.2)
    airlock(r * 0.8, r3 + 1.2, door_slot)


# ---------------------------------------------------------------------------------------------------------------------
# DOME B, "the Geode": a faceted geodesic shell on a regolith-filled drum (the cover is in the drum's double wall), its
# sunward facets photovoltaic, a few panels a shade paler, one orange band at the springing, a dark cap at the crown.

def _geodesic(freq4):
    s5 = 1 / math.sqrt(5)
    v = [(0, 1, 0)] + [(2 * s5 * math.cos(TAU * k / 5), s5, 2 * s5 * math.sin(TAU * k / 5)) for k in range(5)]
    v += [(2 * s5 * math.cos(TAU * (k + 0.5) / 5), -s5, 2 * s5 * math.sin(TAU * (k + 0.5) / 5)) for k in range(5)] + [(0, -1, 0)]
    f = []
    for k in range(5):
        k2 = (k + 1) % 5
        f += [(0, 1 + k, 1 + k2), (1 + k, 6 + k, 1 + k2), (1 + k2, 6 + k, 6 + k2), (11, 6 + k2, 6 + k)]
    for _ in range(2 if freq4 else 1):
        mid, nf = {}, []

        def m(a, b):
            key = (min(a, b), max(a, b))
            if key not in mid:
                p = Vector(v[a]) + Vector(v[b])
                p.normalize()
                mid[key] = len(v)
                v.append(tuple(p))
            return mid[key]
        for a, b, c in f:
            ab, bc, ca = m(a, b), m(b, c), m(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        f = nf
    f = [t for t in f if sum(v[i][1] for i in t) / 3 > 0.02]
    return v, f


def dome_b(r, door_slot="dusk", sun=PI):
    hd = 2.8 if r >= 10 else 2.3                                     # the drum
    seg = 32 if r < 12 else 40 if r < 20 else 56
    put("concrete", 0.05, cyl(0, 0.2, 0, r + 0.5, 0.4, seg))
    put("cream", min(0.14, 0.07 + r * 0.004), cyl(0, 0.4 + hd / 2, 0, r, hd, seg))
    put("orange", 0.03, lathe([(r - 0.1, 0.4 + hd), (r + 0.22, 0.4 + hd), (r + 0.22, 0.75 + hd), (r - 0.1, 0.75 + hd)], seg))
    yb, rr = 0.75 + hd, r - 0.12
    v, f = _geodesic(r >= 12)
    V = [(p[0] * rr, yb + p[1] * rr * 0.92, p[2] * rr) for p in v]
    put("white", min(0.14, 0.07 + r * 0.004), (V, f), sharp=0.01)
    edges = {(min(a, b), max(a, b)) for t in f for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0]))}
    for a, b in edges:
        put("alu", 0.0, B(V[a], V[b], 0.055 if r < 12 else 0.07, 4))
    sd = Vector((math.sin(sun) * 0.75, 0.66, math.cos(sun) * 0.75)).normalized()
    for i, t in enumerate(f):                                        # panels: each a facet shrunk toward its middle, 2 cm proud
        P = [Vector(V[k]) for k in t]
        c = (P[0] + P[1] + P[2]) / 3
        nrm = (P[1] - P[0]).cross(P[2] - P[0]).normalized()
        if nrm.dot(c - Vector((0, yb, 0))) < 0:
            nrm = -nrm
        h = math.sin(i * 12.9898 + r * 3.1) * 43758.5453
        h -= math.floor(h)
        slot = "solar" if nrm.dot(sd) > 0.9 else "light" if h < 0.16 else None
        if not slot or c.y > yb + rr * 0.82:
            continue
        Q = [c + (p - c) * 0.84 + nrm * 0.02 for p in P]
        put(slot, 0.0, ([tuple(q) for q in Q] + [tuple(q - nrm * 0.03) for q in Q], [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]))
    nw = max(6, round(r * 0.8))
    for i in range(nw):
        a = TAU * (i + 0.5) / nw
        if abs(math.atan2(math.sin(a), math.cos(a))) < 3.4 / r:
            continue
        put("alu", 0.015, disc(math.sin(a) * r, 0.4 + hd * 0.56, math.cos(a) * r, 0.6, 0.16, a))
        put("window", 0.0, disc(math.sin(a) * r, 0.4 + hd * 0.56, math.cos(a) * r, 0.44, 0.2, a))
    crown(yb + rr * 0.92 - 0.25, r * 0.16, glazed=False)
    airlock(r - 0.6, r + 3.2, door_slot)


# ---------------------------------------------------------------------------------------------------------------------
# station pieces

def stilt(feature=False, door_slot="sage", stairs=True):
    """A raised module on four hydraulic legs (the polar-station type): 10 m long (x), 6.4 wide, its floor 3.2 m up, a
    docking collar at each end (modules chain 11.5 m apart), a landing and stair on the +z side. feature: the commons
    module, in Kepler orange, with a glazed cupola."""
    body = "orange" if feature else "cream"
    sec = [(-3.2, 3.2), (-2.5, 2.4), (2.5, 2.4), (3.2, 3.2), (3.2, 5.4), (2.5, 6.2), (-2.5, 6.2), (-3.2, 5.4)]
    put(body, 0.08, extrude(sec, 10.0, "x"))
    put("white" if feature else "orange", 0.0, bx(-5.004, 3.35, -3.205, 5.004, 3.65, 3.205))
    put("light", 0.03, bx(-4.6, 6.2, -2.3, 4.6, 6.32, 2.3))
    for sx in (-1, 1):
        put("panel", 0.04, xf(cylinder(1.55, 1.55, 0.8, 14)[:2], (sx * 5.35, 4.2, 0), (0, 0, PI / 2)))
        for sz in (-1, 1):
            x, z = sx * 3.6, sz * 2.3
            put("steel", 0.03, cyl(x, 1.35, z, 0.2, 2.3, 8))
            put("alu", 0.03, cyl(x, 0.85, z, 0.32, 1.2, 8))
            put("dark", 0.03, cyl(x, 0.12, z, 0.85, 0.24, 10, rt=0.6))
    for sz in (-1, 1):
        for i in range(4):
            x = -3.6 + i * 2.4
            if sz > 0 and stairs and abs(x) < 1.3:
                continue
            put("window", 0.0, bx(x - 0.7, 4.0, sz * 3.2, x + 0.7, 4.9, sz * 3.206))
    if feature:
        put("panel", 0.03, cyl(0, 6.4, 0, 1.9, 0.4, 16))
        put("pane", 0.0, ball(0, 6.6, 0, 1.7, 14, 6, (1, 0.7, 1)))
    else:
        put("alu", 0.03, bx(-3.6, 6.32, -0.9, -1.8, 7.1, 0.9))                         # a roof unit, a vent
        put("steel", 0.02, cyl(2.6, 6.8, 0.6, 0.25, 1.0, 8))
    if stairs:
        put("orange", 0.02, bx(-1.0, 3.2, 3.2, 1.0, 5.5, 3.26))
        put(door_slot, 0.0, bx(-0.75, 3.2, 3.26, 0.75, 5.25, 3.29))
        put("lamp", 0.0, bx(-0.5, 5.3, 3.26, 0.5, 5.4, 3.4))
        put("steel", 0.03, bx(-1.2, 3.05, 3.2, 1.2, 3.2, 4.7))                         # the landing, on two posts
        for x in (-1.1, 1.1):
            put("steel", 0.0, strut((x, 0, 4.55), (x, 3.06, 4.55), 0.07, 5))
        rail("orange", [(-1.15, 3.2, 3.3), (-1.15, 3.2, 4.65), (1.15, 3.2, 4.65)], every=1.3)
        n = 10                                                                          # a flight down along +x
        for s_z in (3.5, 4.6):
            put("alu", 0.02, strut((1.2, 3.1, s_z), (1.2 + n * 0.5, 0.08, s_z), 0.09, 4))
        for i in range(n):
            put("steel", 0.0, bx(1.25 + i * 0.5, 3.2 - (i + 1) * 0.32 - 0.05, 3.5, 1.65 + i * 0.5, 3.2 - (i + 1) * 0.32, 4.6))
        rail("orange", [(1.2, 3.2, 4.65), (1.2 + n * 0.5, 0.0, 4.65)], every=1.8)


def longhouse(length=16.0, door_slot="ochre"):
    """A barrel-vault hut (the Jamesway type), 7.2 m wide, lying along z, its door in the +z end; regolith block banked
    along both sides, dormer windows over it."""
    L = length
    arc = [(3.6 * math.cos(PI - PI * i / 12), 1.2 + 3.6 * math.sin(PI * i / 12)) for i in range(13)]
    put("concrete", 0.04, bx(-4.0, 0, -L / 2 - 0.4, 4.0, 0.3, L / 2 + 1.8))
    put("cream", 0.08, xf(extrude([(-3.6, 0.3)] + arc + [(3.6, 0.3)], L, "z"), (0, 0, 0)))
    rib = [(3.69 * math.cos(PI - PI * i / 12), 1.2 + 3.69 * math.sin(PI * i / 12)) for i in range(13)]
    k = max(2, round(L / 3.4))
    for i in range(k + 1):
        z = -L / 2 + 0.2 + (L - 0.4) * i / k
        put("orange" if i == k else "alu", 0.02, xf(extrude([(-3.69, 0.3)] + rib + [(3.69, 0.3)], 0.3, "z"), (0, 0, z)))
    for sx in (-1, 1):
        put("regolith", 0.05, bx(sx * 3.5, 0, -L / 2 + 0.6, sx * 5.0, 0.9, L / 2 - 1.2))
        put("regolith", 0.05, bx(sx * 3.5, 0.9, -L / 2 + 1.0, sx * 4.3, 1.7, L / 2 - 1.6))
        for i in range(k):
            z = -L / 2 + 0.2 + (L - 0.4) * (i + 0.5) / k
            put("cream", 0.03, bx(sx * 2.4, 2.5, z - 0.8, sx * 3.5, 3.6, z + 0.8))
            put("window", 0.0, bx(sx * 3.5, 2.75, z - 0.55, sx * 3.506, 3.35, z + 0.55))
    zf = L / 2
    put("orange", 0.03, bx(-1.0, 0.3, zf, 1.0, 2.9, zf + 0.1))
    put(door_slot, 0.0, bx(-0.75, 0.3, zf + 0.1, 0.75, 2.65, zf + 0.13))
    put("lamp", 0.0, bx(-0.5, 3.0, zf, 0.5, 3.1, zf + 0.25))
    for sx in (-1, 1):
        put("alu", 0.015, disc(sx * 2.2, 2.2, zf, 0.5, 0.12))
        put("window", 0.0, disc(sx * 2.2, 2.2, zf, 0.36, 0.16))
    put("steel", 0.02, cyl(1.4, 4.9, -L / 4, 0.22, 1.0, 8))


def shop(accent="orange"):
    """A shop unit 8 m wide: a module with a lit glazed front, an awning on two posts, the board its name goes on. (The
    built ones would be the ILMB quarter's five shop units, ilmb_quarters.py, in this palette.)"""
    put("concrete", 0.03, bx(-4.0, 0, -4.2, 4.0, 0.25, 4.4))
    put("cream", 0.08, bx(-3.8, 0.25, -4.0, 3.8, 4.0, 1.8))
    put("roof", 0.04, bx(-3.9, 4.0, -4.1, 3.9, 4.35, 1.9))
    put(accent, 0.0, bx(-3.905, 4.05, -4.105, 3.905, 4.2, 1.905))
    put("shop", 0.0, bx(-3.3, 0.9, 1.8, 3.3, 3.2, 1.806))
    for x in (-3.3, -1.1, 1.1, 3.3):
        put("alu", 0.0, bx(x - 0.07, 0.9, 1.8, x + 0.07, 3.2, 1.86))
    put("alu", 0.0, bx(-3.37, 0.82, 1.8, 3.37, 0.9, 1.86))
    put("door", 0.0, bx(-1.0, 0.25, 1.806, 0.0, 2.9, 1.83))
    aw = lambda z: 3.85 - math.tan(0.2) * (z - 1.8)
    put(accent, 0.04, xf(box(0, 0, 1.2, 7.6, 0.14, 2.4), (0, 3.85, 1.8), (0.2, 0, 0)))
    for x in (-3.5, 3.5):
        put("steel", 0.02, bx(x - 0.07, 0.25, 3.93, x + 0.07, aw(4.0) - 0.05, 4.07))
    put("dark", 0.03, bx(-2.8, 4.35, 1.5, 2.8, 5.3, 1.8))
    put("lamp", 0.0, bx(-2.4, 4.6, 1.8, 2.4, 5.05, 1.806))
    put("alu", 0.03, bx(1.2, 4.35, -3.2, 2.8, 5.1, -1.6))


def stall(accent="orange"):
    """A market stall: an aluminium frame, a counter, a sloped canopy."""
    for x in (-1.8, 1.8):
        put("alu", 0.02, strut((x, 0, 1.1), (x, 2.5, 1.1), 0.06, 4))
        put("alu", 0.02, strut((x, 0, -1.1), (x, 3.0, -1.1), 0.06, 4))
    put(accent, 0.03, xf(box(0, 0, 0, 4.2, 0.1, 2.9), (0, 2.82, 0), (math.atan2(0.5, 2.2), 0, 0)))
    put("alu", 0.03, bx(-1.8, 0, 0.5, 1.8, 1.0, 1.1))
    put("cream", 0.02, bx(-1.5, 1.0, 0.55, -0.5, 1.4, 1.05))
    put("lamp", 0.0, bx(-1.2, 2.35, 0.2, 1.2, 2.42, 0.32))
    for x in (-1.2, 1.2):
        put("steel", 0.0, strut((x, 2.42, 0.26), (x, 2.82 - math.tan(math.atan2(0.5, 2.2)) * 0.26, 0.26), 0.02, 4))


def greenhouse(length=18.0):
    L = length
    arc = lambda R: [(R * math.cos(PI - PI * i / 12), 0.5 + R * math.sin(PI * i / 12)) for i in range(13)]
    put("concrete", 0.04, bx(-3.8, 0, -L / 2 - 0.2, 3.8, 0.5, L / 2 + 0.2))
    put("glass", 0.0, extrude(arc(3.4), L, "z"))
    for i in range(7):
        z = -L / 2 + L * i / 6
        put("alu", 0.02, xf(extrude(arc(3.47) + [(3.3, 0.5)] + list(reversed(arc(3.3)))[1:], 0.16, "z"), (0, 0, z)))
    for sx in (-1, 1):
        put("soil", 0.0, bx(sx * 0.8, 0.5, -L / 2 + 0.8, sx * 2.4, 1.1, L / 2 - 0.8))
        z = -L / 2 + 1.4
        while z < L / 2 - 1:
            put("leaf2" if int(z * 3) % 2 else "leaf", 0.0, ball(sx * 1.6, 1.45, z, 0.5, 7, 5))
            z += 1.3
    put("grow", 0.0, bx(-0.12, 3.5, -L / 2 + 1, 0.12, 3.6, L / 2 - 1))
    for z in (-L / 2 + 1, 0, L / 2 - 1):
        put("alu", 0.0, strut((0, 3.6, z), (0, 3.88, z), 0.02, 4))


def water_tank():
    """The town's water tank: a banded sphere on four braced legs, a ladder, a lamp."""
    cy, R = 12.0, 3.8
    put("cream", 0.09, ball(0, cy, 0, R, 20, 12))
    put("orange", 0.0, ring(R + 0.02, 0.22, y=cy, n=28, rs=6))
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        put("steel", 0.04, strut((sx * 3.2, 0.3, sz * 3.2), (sx * 2.2, cy - 1.4, sz * 2.2), 0.22, 6))
        put("concrete", 0.03, bx(sx * 3.2 - 0.6, 0, sz * 3.2 - 0.6, sx * 3.2 + 0.6, 0.35, sz * 3.2 + 0.6))
        put("steel", 0.0, strut((sx * 3.0, 2.2, sz * 3.0), (-sz * 2.55, 7.0, sx * 2.55), 0.07, 4))
    put("alu", 0.03, cyl(0, 4.3, 0, 0.3, 8.0, 8))                                       # the riser
    put("steel", 0.02, cyl(0, cy + R + 0.5, 0, 0.06, 1.2, 6))
    put("redlamp", 0.0, ball(0, cy + R + 1.2, 0, 0.22, 8, 6))


def mast(h=20.0):
    """The comms mast: a tripod, a dish on a bracket, a lamp."""
    put("concrete", 0.03, cyl(0, 0.2, 0, 2.2, 0.4, 12))
    for i in range(3):
        a = TAU * i / 3
        put("steel", 0.03, strut((math.sin(a) * 1.8, 0.4, math.cos(a) * 1.8), (0, h * 0.72, 0), 0.12, 5))
    put("alu", 0.03, cyl(0, h / 2 + 0.2, 0, 0.14, h - 0.4, 6))
    for y in (h * 0.25, h * 0.5):
        k = 1.8 * (1 - (y - 0.4) / (h * 0.72 - 0.4))
        P = [(math.sin(TAU * i / 3) * k, y, math.cos(TAU * i / 3) * k) for i in range(3)]
        for i in range(3):
            put("steel", 0.0, strut(P[i], P[(i + 1) % 3], 0.05, 4))
    put("steel", 0.0, strut((0, h * 0.82, 0), (0, h * 0.82, 1.0), 0.07, 4))
    put("white", 0.04, xf(lathe([(0.0, 0.0), (0.7, 0.12), (1.25, 0.5), (1.3, 0.5), (0.7, 0.05), (0.0, -0.08)], 14), (0, h * 0.82, 1.0), (PI / 2 - 0.5, 0, 0)))
    put("redlamp", 0.0, ball(0, h + 0.15, 0, 0.22, 8, 6))


def tunnel(ax, az, bx_, bz_, r=1.5):
    """A connecting tube between two ground points, on saddles, a lit strip along each side."""
    L = math.hypot(bx_ - ax, bz_ - az)
    with at((ax + bx_) / 2, (az + bz_) / 2, math.atan2(bx_ - ax, bz_ - az)):
        put("cream", 0.07, xf(cylinder(r, r, L, 12)[:2], (0, r + 0.25, 0), (PI / 2, 0, 0)))
        n = max(1, round(L / 4.5))
        for i in range(n + 1):
            z = -L / 2 + 0.3 + (L - 0.6) * i / n
            put("panel", 0.02, xf(cylinder(r + 0.07, r + 0.07, 0.3, 12)[:2], (0, r + 0.25, z), (PI / 2, 0, 0)))
            put("concrete", 0.03, bx(-r * 0.8, 0, z - 0.35, r * 0.8, 0.7, z + 0.35))
        for sx in (-1, 1):
            for i in range(n):
                z = -L / 2 + 0.3 + (L - 0.6) * (i + 0.5) / n
                put("window", 0.0, bx(sx * (r + 0.004), r + 0.05, z - 1.0, sx * (r - 0.1), r + 0.5, z + 1.0))


def pad(r=13.0):
    put("concrete", 0.05, cyl(0, 0.3, 0, r, 0.6, 40))
    put("gold", 0.0, lathe([(r - 1.4, 0.6), (r - 1.4, 0.615), (r - 0.9, 0.615), (r - 0.9, 0.6)], 40))
    put("white", 0.0, bx(-2.6, 0.6, -0.4, 2.6, 0.615, 0.4))
    for sx in (-1, 1):
        put("white", 0.0, bx(sx * 2.6 - 0.4, 0.6, -3.0, sx * 2.6 + 0.4, 0.616, 3.0))
    for i in range(8):
        a = TAU * (i + 0.5) / 8
        put("lamp", 0.0, ball(math.sin(a) * (r - 0.4), 0.7, math.cos(a) * (r - 0.4), 0.18, 6, 4))


def solar_row(n=3):
    for i in range(n):
        x = (i - (n - 1) / 2) * 5.4
        T = Matrix.Translation((x, 1.9, 0)) @ Matrix.Rotation(0.5, 4, "X")
        tr = lambda g: ([tuple(T @ Vector(p)) for p in g[0]], g[1])
        put("alu", 0.03, tr(cuboid(5.0, 0.1, 3.2)[:2]))
        put("solar", 0.0, tr(xf(cuboid(4.7, 0.04, 2.9)[:2], (0, 0.06, 0))))
        for sx in (-1.6, 1.6):
            put("steel", 0.0, strut((x + sx, 0, 0), tuple(T @ Vector((sx, -0.04, 0))), 0.08, 4))


# ---------------------------------------------------------------------------------------------------------------------
# what both town halls share

def earth_dial(cx, cy, cz, R, backed=False):
    """The hall's clock, told the lunar way: a ring with the Earth at its centre (it hangs still in the Moon's sky, and its
    phase is the time of the month), hour marks on the ring, two hands (the game turns them: settlements.js townHall's
    tick). It faces +z; when not backed it is open and reads from behind too, its marks and hands pale against the sky."""
    ink = "dark" if backed else "white"
    put("orange", 0.04, vring(cx, cy, cz, R, R * 0.1))
    for i in range(12):
        a = TAU * i / 12
        big = i % 3 == 0
        ln = R * (0.22 if big else 0.13)                              # each mark's outer end set into the ring
        put(ink, 0.0, xf(box(0, 0, 0, R * (0.07 if big else 0.04), ln, R * 0.2), (cx + math.sin(a) * (R * 0.93 - ln / 2), cy + math.cos(a) * (R * 0.93 - ln / 2), cz), (0, 0, -a)))
    # the Earth, gibbous: the lit part and the night part of one disc, split along the terminator (an ellipse)
    er, k, n = R * 0.42, 0.45, 14
    left = [(-er * math.sin(PI * i / n), er * math.cos(PI * i / n)) for i in range(n + 1)]                 # top, round the left, to bottom
    term = [(er * k * math.sin(PI * i / n), -er * math.cos(PI * i / n)) for i in range(1, n)]            # back up the terminator
    right = [(er * math.sin(PI * i / n), -er * math.cos(PI * i / n)) for i in range(n + 1)]               # bottom, round the right, to top
    back = [(er * k * math.sin(PI * i / n), er * math.cos(PI * i / n)) for i in range(1, n)]
    t = R * (0.1 if backed else 0.24)
    put("earth", 0.0, xf(extrude(left + term, t, "z"), (cx, cy, cz)))
    put("solar", 0.0, xf(extrude(right + back, t * 0.98, "z"), (cx, cy, cz)))
    if backed:
        put("white", 0.0, disc(cx, cy, cz - R * 0.1, R * 0.95, 0.06, 0, 28))
    else:
        for i in range(4):
            a = TAU * (i + 0.5) / 4
            put("steel", 0.0, strut((cx + math.sin(a) * R * 0.38, cy + math.cos(a) * R * 0.38, cz), (cx + math.sin(a) * R * 0.95, cy + math.cos(a) * R * 0.95, cz), R * 0.02, 4))
    for sz in ((1,) if backed else (1, -1)):
        z = cz + sz * R * 0.2
        for a, ln, w in ((1.05, 0.74, 0.05), (-0.7, 0.5, 0.07)):
            put(ink, 0.0, xf(box(0, R * ln / 2, 0, R * w, R * ln, R * 0.03), (cx, cy, z), (0, 0, -a * sz)))
        put("orange", 0.0, disc(cx, cy, z, R * 0.07, R * 0.05, 0, 10))
    put("steel", 0.0, strut((cx, cy, cz - R * (0.1 if backed else 0.2)), (cx, cy, cz + R * 0.2), R * 0.025, 5))   # the arbor the hands turn on


def flagpole(x, z, h=16.0):
    """A flag mast (the game hangs the waving cloth: world.flag; the stripes here stand in for it)."""
    put("concrete", 0.03, cyl(x, 0.3, z, 0.7, 0.6, 10))
    put("alu", 0.03, cyl(x, h / 2, z, 0.12, h, 6, rt=0.07))
    for i, s in enumerate(("orange", "white", "orange")):
        put(s, 0.0, bx(x + 0.1, h - 0.9 - i * 0.9, z - 0.02, x + 4.6, h - i * 0.9, z + 0.02))
