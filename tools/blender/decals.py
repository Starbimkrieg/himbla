# Flat lettering, emblems and signage for the Blender build scripts (build_landtrain.py, build_crane.py). Load with
#   exec(open(<repo>/tools/blender/decals.py).read(), globals())
# after kit.py (it uses bpy, tb, C and material from there).
#
# Everything is authored in three.js axes like the rest of the kit (x right, y up, +z forward). A decal is
# drawn on a flat face of a vehicle: Dec(face, origin) gives a little 2D page (u to the reader's right, v up)
# standing on that face at `origin`, and everything added to it is flat polygons a hair above the surface
# (no textures, so it all exports in the GLB and takes the same palette slots as the rest of the model).
# Layers stack: layer 0 is the backing plate, layer 1 what is printed on it, and so on.
#
#   face "+x"/"-x"  a flank (reads front to back on +x, back to front on -x, as a person looking at it sees it)
#   face "+z"/"-z"  the front/rear end
#
# Lettering is a 5x7 pixel font (the game's own look): runs of lit pixels in a row are merged into one
# rectangle, so a word is a handful of quads.

import math

# ---------------- the font ----------------
_G = {
    "A": "01110 10001 10001 11111 10001 10001 10001", "B": "11110 10001 10001 11110 10001 10001 11110",
    "C": "01110 10001 10000 10000 10000 10001 01110", "D": "11110 10001 10001 10001 10001 10001 11110",
    "E": "11111 10000 10000 11110 10000 10000 11111", "F": "11111 10000 10000 11110 10000 10000 10000",
    "G": "01110 10001 10000 10111 10001 10001 01111", "H": "10001 10001 10001 11111 10001 10001 10001",
    "I": "01110 00100 00100 00100 00100 00100 01110", "J": "00111 00010 00010 00010 00010 10010 01100",
    "K": "10001 10010 10100 11000 10100 10010 10001", "L": "10000 10000 10000 10000 10000 10000 11111",
    "M": "10001 11011 10101 10101 10001 10001 10001", "N": "10001 11001 10101 10011 10001 10001 10001",
    "O": "01110 10001 10001 10001 10001 10001 01110", "P": "11110 10001 10001 11110 10000 10000 10000",
    "Q": "01110 10001 10001 10001 10101 10010 01101", "R": "11110 10001 10001 11110 10100 10010 10001",
    "S": "01111 10000 10000 01110 00001 00001 11110", "T": "11111 00100 00100 00100 00100 00100 00100",
    "U": "10001 10001 10001 10001 10001 10001 01110", "V": "10001 10001 10001 10001 10001 01010 00100",
    "W": "10001 10001 10001 10101 10101 11011 10001", "X": "10001 10001 01010 00100 01010 10001 10001",
    "Y": "10001 10001 01010 00100 00100 00100 00100", "Z": "11111 00001 00010 00100 01000 10000 11111",
    "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
    "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11110 00001 00001 01110 00001 00001 11110",
    "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
    "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
    "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
    "-": "00000 00000 00000 11111 00000 00000 00000", ".": "00000 00000 00000 00000 00000 01100 01100",
    ":": "00000 01100 01100 00000 01100 01100 00000", "/": "00001 00010 00010 00100 01000 01000 10000",
    " ": "00000 00000 00000 00000 00000 00000 00000", "'": "00100 00100 00000 00000 00000 00000 00000",
}
FONT = {c: [row for row in g.split()] for c, g in _G.items()}


def text_width(s, ps):
    """Width of a string at pixel size ps (a one-pixel gap between letters)."""
    return (len(s) * 6 - 1) * ps


# ---------------- faces: (reader's right, up, outward normal) ----------------
FACES = {
    "+x": ((0, 0, -1), (0, 1, 0), (1, 0, 0)),
    "-x": ((0, 0, 1), (0, 1, 0), (-1, 0, 0)),
    "+z": ((1, 0, 0), (0, 1, 0), (0, 0, 1)),
    "-z": ((-1, 0, 0), (0, 1, 0), (0, 0, -1)),
}
LAYER = 0.004   # how far each layer stands off the one below


def _add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k)


def _clip(poly, u0, v0, u1, v1):
    """Sutherland-Hodgman: a convex polygon clipped to an axis-aligned rectangle."""
    def run(pts, inside, cut):
        out = []
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            ip, iq = inside(p), inside(q)
            if ip:
                out.append(p)
            if ip != iq:
                out.append(cut(p, q))
        return out
    pts = poly
    for inside, cut in (
        (lambda p: p[0] >= u0, lambda p, q: (u0, p[1] + (q[1] - p[1]) * (u0 - p[0]) / (q[0] - p[0]))),
        (lambda p: p[0] <= u1, lambda p, q: (u1, p[1] + (q[1] - p[1]) * (u1 - p[0]) / (q[0] - p[0]))),
        (lambda p: p[1] >= v0, lambda p, q: (p[0] + (q[0] - p[0]) * (v0 - p[1]) / (q[1] - p[1]), v0)),
        (lambda p: p[1] <= v1, lambda p, q: (p[0] + (q[0] - p[0]) * (v1 - p[1]) / (q[1] - p[1]), v1)),
    ):
        if not pts:
            break
        pts = run(pts, inside, cut)
    return pts


class Dec:
    """A flat page on a vehicle's face. Add shapes, then build() it into meshes (one per palette slot)."""

    def __init__(self, face, origin, lift=0.01):
        self.right, self.up, self.n = [tuple(map(float, v)) for v in FACES[face]]
        self.o = tuple(map(float, origin))
        self.lift = lift
        self.polys = {}     # slot -> [[(x, y, z), ...], ...]

    def pt(self, u, v, layer=0):
        p = _add(_add(self.o, self.right, u), self.up, v)
        return _add(p, self.n, self.lift + layer * LAYER)

    def poly(self, pts, slot, layer=0):
        """A convex (or star-shaped about its centroid) polygon from (u, v) points."""
        self.polys.setdefault(slot, []).append([self.pt(u, v, layer) for u, v in pts])

    def rect(self, u0, v0, u1, v1, slot, layer=0):
        self.poly([(u0, v0), (u1, v0), (u1, v1), (u0, v1)], slot, layer)

    def disc(self, cu, cv, r, slot, layer=0, n=20):
        self.poly([(cu + math.cos(2 * math.pi * i / n) * r, cv + math.sin(2 * math.pi * i / n) * r) for i in range(n)], slot, layer)

    def ring(self, cu, cv, r0, r1, slot, layer=0, n=24, a0=0.0, a1=2 * math.pi, sx=1.0, sy=1.0):
        """An annulus (or an arc of one) between radii r0 < r1; sx / sy squash it into an ellipse."""
        steps = max(3, int(round(n * (a1 - a0) / (2 * math.pi))))
        for i in range(steps):
            t0 = a0 + (a1 - a0) * i / steps
            t1 = a0 + (a1 - a0) * (i + 1) / steps
            c0, s0, c1, s1 = math.cos(t0), math.sin(t0), math.cos(t1), math.sin(t1)
            self.poly([(cu + c0 * r0 * sx, cv + s0 * r0 * sy), (cu + c0 * r1 * sx, cv + s0 * r1 * sy),
                       (cu + c1 * r1 * sx, cv + s1 * r1 * sy), (cu + c1 * r0 * sx, cv + s1 * r0 * sy)], slot, layer)

    def star(self, cu, cv, r_out, r_in, slot, layer=0, n=5, rot=math.pi / 2):
        pts = []
        for i in range(2 * n):
            a = rot + math.pi * i / n
            r = r_out if i % 2 == 0 else r_in
            pts.append((cu + math.cos(a) * r, cv + math.sin(a) * r))
        self.poly(pts, slot, layer)

    def diamond(self, cu, cv, half, slot, layer=0):
        self.poly([(cu, cv - half), (cu + half, cv), (cu, cv + half), (cu - half, cv)], slot, layer)

    def bar(self, u0, v0, u1, v1, w, slot, layer=0):
        """A straight bar of width w from one point to another."""
        du, dv = u1 - u0, v1 - v0
        L = math.hypot(du, dv) or 1.0
        nu, nv = -dv / L * w / 2, du / L * w / 2
        self.poly([(u0 + nu, v0 + nv), (u1 + nu, v1 + nv), (u1 - nu, v1 - nv), (u0 - nu, v0 - nv)], slot, layer)

    def hazard(self, u0, v0, u1, v1, slot_a, slot_b, layer=0, stripe=0.18, slant=1.0):
        """Diagonal warning stripes clipped to a rectangle: slot_a over a slot_b ground."""
        self.rect(u0, v0, u1, v1, slot_b, layer)
        h = v1 - v0
        k = u0 - h * slant
        while k < u1:
            self.poly(_clip([(k, v0), (k + stripe, v0), (k + stripe + h * slant, v1), (k + h * slant, v1)], u0, v0, u1, v1), slot_a, layer + 1)
            k += stripe * 2

    def text(self, s, u, v, ps, slot, layer=0, anchor="l"):
        """Pixel lettering with its lower-left at (u, v) ('c' centres it on u, 'r' ends it there)."""
        w = text_width(s, ps)
        x = u - (w / 2 if anchor == "c" else w if anchor == "r" else 0)
        for ch in s.upper():
            rows = FONT.get(ch, FONT[" "])
            for ry, row in enumerate(rows):
                y0 = v + (6 - ry) * ps
                c = 0
                while c < 5:
                    if row[c] == "1":
                        c1 = c
                        while c1 + 1 < 5 and row[c1 + 1] == "1":
                            c1 += 1
                        self.rect(x + c * ps, y0, x + (c1 + 1) * ps, y0 + ps, slot, layer)
                        c = c1 + 1
                    else:
                        c += 1
            x += 6 * ps
        return w

    def build(self, name, parent):
        """One flat mesh per slot; every polygon wound to face outward."""
        made = []
        nb = tb(self.n)
        for slot, polys in self.polys.items():
            verts, faces = [], []
            for poly in polys:
                if len(poly) < 3:
                    continue
                base = len(verts)
                verts.extend(tb(p) for p in poly)
                for i in range(1, len(poly) - 1):
                    a, b, c = verts[base], verts[base + i], verts[base + i + 1]
                    e1 = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
                    e2 = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
                    cr = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
                    if cr[0] * nb[0] + cr[1] * nb[1] + cr[2] * nb[2] >= 0:
                        faces.append((base, base + i, base + i + 1))
                    else:
                        faces.append((base, base + i + 1, base + i))
            me = bpy.data.meshes.new(f"{name}_{slot}")
            me.from_pydata(verts, [], faces)
            me.validate()
            for p in me.polygons:
                p.use_smooth = False
            o = bpy.data.objects.new(f"{name}_{slot}", me)
            C.objects.link(o)
            o.parent = parent
            me.materials.append(material(slot))
            o["ink"] = 0
            o["slot"] = slot
            made.append(o)
        return made


# ---------------- faction emblems: a dark roundel with a glyph in the faction's trim colour ----------------
def emblem(d, faction, cu, cv, r, layer=0):
    """The faction's mark, r the radius of its roundel. Backing 'dark', glyph 'stripe' (the trim colour)."""
    d.disc(cu, cv, r, "dark", layer, 24)
    g = layer + 1
    if faction == "vostok":
        d.star(cu, cv + r * 0.02, r * 0.78, r * 0.31, "stripe", g)
    elif faction == "spacecom":
        # a crescent moon with a star in its mouth
        R1, R2, dd = r * 0.74, r * 0.6, r * 0.3
        x = (R1 * R1 - R2 * R2 + dd * dd) / (2 * dd)
        y = math.sqrt(max(0.0, R1 * R1 - x * x))
        a_out = math.atan2(y, x)
        a_in = math.atan2(y, x - dd)
        N = 14
        outer = [(cu - r * 0.1 + R1 * math.cos(a_out + (2 * math.pi - 2 * a_out) * i / N), cv + R1 * math.sin(a_out + (2 * math.pi - 2 * a_out) * i / N)) for i in range(N + 1)]
        inner = [(cu - r * 0.1 + dd + R2 * math.cos(a_in + (2 * math.pi - 2 * a_in) * i / N), cv + R2 * math.sin(a_in + (2 * math.pi - 2 * a_in) * i / N)) for i in range(N + 1)]
        for i in range(N):
            d.poly([outer[i], outer[i + 1], inner[i + 1], inner[i]], "stripe", g)
        d.star(cu + r * 0.28, cv, r * 0.2, r * 0.08, "stripe", g)
    elif faction == "kepler":
        # an orbit: a tilted ellipse ring with a planet on it
        d.ring(cu, cv, r * 0.58, r * 0.7, "stripe", g, 28, sy=0.5)
        d.disc(cu + r * 0.64, cv, r * 0.13, "stripe", g, 10)
        d.disc(cu, cv, r * 0.18, "stripe", g, 10)
    elif faction == "daedalus":
        # a delta (a hollow triangle) with an eye in it
        d.poly([(cu, cv + r * 0.74), (cu - r * 0.7, cv - r * 0.46), (cu + r * 0.7, cv - r * 0.46)], "stripe", g)
        d.poly([(cu, cv + r * 0.34), (cu - r * 0.38, cv - r * 0.28), (cu + r * 0.38, cv - r * 0.28)], "dark", g + 1)
        d.disc(cu, cv - r * 0.08, r * 0.1, "stripe", g + 2, 10)
    elif faction == "meridian":
        # a globe: a ring, an equator and a meridian line
        d.ring(cu, cv, r * 0.62, r * 0.74, "stripe", g, 28)
        d.rect(cu - r * 0.62, cv - r * 0.05, cu + r * 0.62, cv + r * 0.05, "stripe", g)
        d.ring(cu, cv, r * 0.24, r * 0.31, "stripe", g, 20, sy=2.3)
        d.rect(cu - r * 0.045, cv - r * 0.62, cu + r * 0.045, cv + r * 0.62, "stripe", g)


# ---------------- OSHA / DOT style signs ----------------
def danger_sign(d, u, v, w, h, layer=0):
    """An OSHA-style DANGER sign, (u, v) its lower-left: white board, red header with DANGER, black legend."""
    d.rect(u - 0.04, v - 0.04, u + w + 0.04, v + h + 0.04, "dark", layer)
    d.rect(u, v, u + w, v + h, "white", layer + 1)
    hh = h * 0.3
    d.rect(u, v + h - hh, u + w, v + h, "redsafe", layer + 2)
    ps = min(hh * 0.62 / 7, (w * 0.86) / (6 * 6 - 1))
    d.text("DANGER", u + w / 2, v + h - hh + (hh - 7 * ps) / 2, ps, "white", layer + 3, "c")
    lines = ["EXPLOSIVES", "NO SMOKING", "NO FLAMES", "KEEP CLEAR"]
    ps2 = min((w * 0.88) / (10 * 6 - 1), (h - hh) * 0.84 / (len(lines) * 9))
    y = v + (h - hh) - 0.12 * (h - hh) - 7 * ps2
    for s in lines:
        d.text(s, u + w / 2, y, ps2, "dark", layer + 2, "c")
        y -= 9 * ps2


def placard(d, cu, cv, half, layer=0):
    """A DOT class 1 EXPLOSIVES placard: an orange diamond with a bomb on top, 1.1 across the middle, a 1 below."""
    d.diamond(cu, cv, half * 1.0, "dark", layer)
    d.diamond(cu, cv, half * 0.95, "orange", layer + 1)
    d.diamond(cu, cv, half * 0.86, "dark", layer + 2)
    d.diamond(cu, cv, half * 0.83, "orange", layer + 3)
    # the bomb: a black ball with a short fuse and a spark, in the upper corner
    bx, by, br = cu, cv + half * 0.3, half * 0.15
    d.disc(bx, by, br, "dark", layer + 4, 14)
    d.bar(bx + br * 0.4, by + br * 0.8, bx + br * 1.1, by + br * 1.6, br * 0.28, "dark", layer + 4)
    d.star(bx + br * 1.25, by + br * 1.8, br * 0.55, br * 0.2, "hazard", layer + 4, 4, 0.0)
    ps = half * 0.075
    d.text("1.1", cu, cv - half * 0.2, ps, "dark", layer + 4, "c")
    d.text("1", cu, cv - half * 0.72, ps * 1.2, "dark", layer + 4, "c")


def prohibition(d, cu, cv, r, icon, layer=0):
    """A round prohibition sign: red ring and slash over a black icon on white. icon: 'smoke' or 'flame'."""
    d.disc(cu, cv, r, "white", layer, 22)
    if icon == "smoke":
        d.rect(cu - r * 0.5, cv - r * 0.08, cu + r * 0.32, cv + r * 0.08, "dark", layer + 1)
        d.rect(cu + r * 0.32, cv - r * 0.08, cu + r * 0.5, cv + r * 0.08, "orange", layer + 1)
        for k in range(2):
            d.disc(cu + r * (0.38 + 0.14 * k), cv + r * (0.28 + 0.2 * k), r * 0.05, "dark", layer + 1, 8)
    else:
        d.poly([(cu - r * 0.22, cv - r * 0.3), (cu + r * 0.22, cv - r * 0.3), (cu + r * 0.28, cv - r * 0.05), (cu, cv + r * 0.5), (cu - r * 0.28, cv - r * 0.05)], "dark", layer + 1)
        d.poly([(cu - r * 0.1, cv - r * 0.28), (cu + r * 0.1, cv - r * 0.28), (cu + r * 0.12, cv - r * 0.12), (cu, cv + r * 0.1), (cu - r * 0.12, cv - r * 0.12)], "orange", layer + 2)
    d.ring(cu, cv, r * 0.84, r, "redsafe", layer + 2, 22)
    d.bar(cu - r * 0.6, cv + r * 0.6, cu + r * 0.6, cv - r * 0.6, r * 0.16, "redsafe", layer + 3)


def nfpa(d, cu, cv, half, health, flam, react, special, layer=0):
    """An NFPA 704 fire diamond: blue health (left), red flammability (top), yellow reactivity (right), white special (bottom)."""
    h = half
    q = [("blue", (cu - h * 0.5, cv), str(health)), ("redsafe", (cu, cv + h * 0.5), str(flam)), ("hazard", (cu + h * 0.5, cv), str(react)), ("white", (cu, cv - h * 0.5), special)]
    d.diamond(cu, cv, h * 1.04, "dark", layer)
    for slot, (qu, qv), txt in q:
        # each quadrant is a little diamond a quarter the size of the whole
        d.diamond(qu, qv, h * 0.48, slot, layer + 1)
        ps = h * 0.052
        d.text(txt, qu, qv - 3.5 * ps, ps * (1.0 if len(txt) == 1 else 0.7), "white" if slot in ("blue", "redsafe") else "dark", layer + 2, "c")


# ---------------- the factions the vehicles and the cargo are painted for ----------------
FACTIONS = ("spacecom", "vostok", "kepler", "meridian")
NAMES = {"spacecom": "SPACECOM", "vostok": "VOSTOK", "kepler": "KEPLER", "meridian": "MERIDIAN", "daedalus": "DAEDALUS"}
CODES = {"spacecom": "SPC", "vostok": "VOS", "kepler": "KPL", "meridian": "MRD", "daedalus": "DDL"}
MARKED = FACTIONS + ("daedalus",)              # what the field dish's plates are made for (the vehicles and cargo have no Daedalus paint)


def side_dec(side, x, y=0.0, z=0.0, lift=0.01):
    """A page on the +x (side > 0) or -x flank at distance x from the centreline."""
    return Dec("+x" if side > 0 else "-x", (side * x, y, z), lift)


# ---------------- the cargo container's flank markings (the Prospector's cargo car and the tower crane's load) ----------------
# The box is centred on z = 0 and y = 3.3 in its own frame. Everything printed on a flank is centred on that middle: the plate
# (an emblem and the faction's name over LOGISTICS, centred as a group on the plate) and, above it, the container number, with the
# two stacked so the pair is centred vertically on the box.
CARGO_PLATE_HALF = (1.8, 0.62)                 # half width and height of the dark plate
CARGO_GAP = 0.2                                # between the plate and the number above it
CARGO_NUM_PS = 0.04                            # the number's pixel size: 7 pixels tall
_CARGO_STACK = 2 * CARGO_PLATE_HALF[1] + CARGO_GAP + 7 * CARGO_NUM_PS
CARGO_PLATE_Y = 3.3 - _CARGO_STACK / 2 + CARGO_PLATE_HALF[1]
CARGO_NUM_Y = 3.3 - _CARGO_STACK / 2 + 2 * CARGO_PLATE_HALF[1] + CARGO_GAP


def cargo_decals(f, piv, prefix):
    """The faction's plate and container number on both flanks of a cargo container, built under `piv`."""
    s = NAMES[f]
    code = f"{CODES[f]} 204117 6"
    ps, ps2 = 0.045, 0.035
    r = 0.4
    total = 2 * r + 0.15 + max(text_width(s, ps), text_width("LOGISTICS", ps2))
    u0 = -total / 2
    for side in (-1, 1):
        d = side_dec(side, 1.68, CARGO_PLATE_Y, 0.0)
        d.rect(-1.7, -0.56, 1.7, 0.56, "stripe", 0)
        d.rect(-1.66, -0.52, 1.66, 0.52, "dark", 1)
        emblem(d, f, u0 + r, 0.0, r, 2)
        d.text(s, u0 + 2 * r + 0.15, 0.06, ps, "stripe", 2)
        d.text("LOGISTICS", u0 + 2 * r + 0.15, -0.4, ps2, "white", 2)
        d.build(f"{prefix}plate{'P' if side > 0 else 'S'}_{f}", piv)
        d2 = side_dec(side, 1.6, CARGO_NUM_Y, 0.0)
        d2.text(code, -text_width(code, CARGO_NUM_PS) / 2, 0, CARGO_NUM_PS, "label", 0)
        d2.build(f"{prefix}id{'P' if side > 0 else 'S'}_{f}", piv)
    # the doors at each end: the number and size-type code on the reader's right-hand leaf, the weights on the left, all under
    # the locking bars (stencilled on the leaf's face, between the top corrugation and the header)
    for sz in (-1, 1):
        d = Dec("+z" if sz > 0 else "-z", (0, 0, sz * (CARGO_END + CD_LEAF_D)))
        d.text(code, 0.1, 4.19, 0.016, "label", 0)
        d.text("22G1", 0.1, 4.04, 0.016, "label", 0)
        for k, line in enumerate(("MAX GROSS 30480 KG", "TARE 2200 KG", "PAYLOAD 28280 KG")):
            d.text(line, -1.2, 4.24 - k * 0.1, 0.008, "label", 0)
        d.build(f"{prefix}doorMarks{'F' if sz > 0 else 'R'}_{f}", piv)


# ---------------- the cargo container's door ends (shared like the flank markings, and by cargo.py's box) ----------------
# A pair of doors at each end of the box (half extents 1.55 x 1.4 x 3.62 about (0, 3.3, 0)), everything within the corner castings,
# which stand 0.15 proud of the end faces: a frame (corner posts and a header in the body colour, a dark sill), a dark gasket in the
# opening showing round two leaves pressed with four corrugations each, and on each leaf two locking bars (cams turning in keepers on
# the header and sill, two guides, a handle on a hub, its tip held by a retainer), four hinges on the outer edge (a blade on the leaf,
# a knuckle on its pin, a lug on the post), the CSC plate on the left leaf and a bolt seal on the right.
# Depths are measured out from the end face.
CARGO_END = 3.62
CD_LEAF_D = 0.05                  # the leaves' face (the markings stand on it)
_CD_BARS = (0.30, 0.98)           # each leaf's locking bars, out from the middle
_CD_HINGES = (2.36, 2.98, 3.6, 4.22)
_CD_RIBS = (2.55, 3.0, 3.45, 3.9)


def _cd_box(x0, x1, y0, y1, d0, d1, sz):
    z0, z1 = sz * (CARGO_END + d0), sz * (CARGO_END + d1)
    v = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    return v, [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]


def container_doors(body):
    """The door ends of a cargo container, both of them: a list of (name, geo, slot, ink), the box's own body slot `body`."""
    out = []

    def add(name, geo, slot, ink):
        out.append((name, geo, slot, ink))

    for sz in (-1, 1):
        e = "F" if sz > 0 else "R"
        Z = lambda d: sz * (CARGO_END + d)
        for sx in (-1, 1):
            add(f"door{e}_post{sx}", _cd_box(sx * 1.3, sx * 1.55, 2.12, 4.45, -0.04, 0.08, sz), body, 0.03)
        add(f"door{e}_header", _cd_box(-1.3, 1.3, 4.38, 4.66, -0.04, 0.09, sz), body, 0.03)
        add(f"door{e}_sill", _cd_box(-1.3, 1.3, 1.92, 2.17, -0.04, 0.1, sz), "dark", 0.03)
        add(f"door{e}_gasket", _cd_box(-1.3, 1.3, 2.17, 4.38, -0.02, 0.02, sz), "dark", 0)
        for sx in (-1, 1):
            L = f"door{e}_{'P' if sx > 0 else 'S'}"
            add(f"{L}leaf", _cd_box(sx * 0.025, sx * 1.275, 2.21, 4.34, -0.02, CD_LEAF_D, sz), body, 0.02)
            for k, y in enumerate(_CD_RIBS):
                add(f"{L}rib{k}", _cd_box(sx * 0.1, sx * 1.1, y - 0.06, y + 0.06, 0.04, 0.075, sz), body, 0.015)
            for j, bx in enumerate(_CD_BARS):
                x = sx * bx
                add(f"{L}bar{j}", beam((x, 2.0, Z(0.12)), (x, 4.56, Z(0.12)), 0.03, 6), "metal", 0.015)
                for y, cy in ((2.24, "B"), (4.31, "T")):
                    add(f"{L}cam{j}{cy}", _cd_box(x - 0.05, x + 0.05, y - 0.06, y + 0.06, 0.08, 0.17, sz), "steel", 0.01)
                add(f"{L}keeperT{j}", _cd_box(x - 0.07, x + 0.07, 4.42, 4.6, 0.07, 0.17, sz), "steel", 0.01)
                add(f"{L}keeperB{j}", _cd_box(x - 0.07, x + 0.07, 1.97, 2.14, 0.08, 0.17, sz), "steel", 0.01)
                for g, y in enumerate((3.22, 4.12)):
                    add(f"{L}guide{j}{g}", _cd_box(x - 0.055, x + 0.055, y - 0.04, y + 0.04, 0.04, 0.16, sz), "steel", 0.01)
                # the handle: the inner bar's swings out towards the hinges, the outer bar's in, so the two never meet
                tip = sx * (0.56 if j == 0 else 0.72)
                add(f"{L}hub{j}", _cd_box(x - 0.06, x + 0.06, 2.71, 2.85, 0.08, 0.18, sz), "steel", 0.01)
                add(f"{L}handle{j}", beam((x, 2.78, Z(0.17)), (tip, 2.75, Z(0.17)), 0.025, 6), "metal", 0.01)
                add(f"{L}retainer{j}", _cd_box(tip - 0.03, tip + 0.03, 2.69, 2.81, 0.04, 0.2, sz), "steel", 0.01)
            for k, y in enumerate(_CD_HINGES):
                add(f"{L}hinge{k}", _cd_box(sx * 1.15, sx * 1.3, y - 0.045, y + 0.045, 0.03, 0.085, sz), "dark", 0.01)
                add(f"{L}knuckle{k}", beam((sx * 1.3, y - 0.07, Z(0.1)), (sx * 1.3, y + 0.07, Z(0.1)), 0.035, 6), "dark", 0.01)
                add(f"{L}lug{k}", _cd_box(sx * 1.3, sx * 1.42, y - 0.05, y + 0.05, 0.06, 0.11, sz), "dark", 0.01)
        # (the reader's left leaf is -x on the front end, +x on the rear)
        add(f"door{e}_csc", _cd_box(-sz * 0.45, -sz * 0.8, 2.27, 2.45, 0.04, 0.065, sz), "steel", 0.01)
        add(f"door{e}_seal", _cd_box(sz * 0.54, sz * 0.58, 2.6, 2.7, 0.15, 0.23, sz), "stripe", 0.01)
    return out
