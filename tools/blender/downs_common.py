# Shared set-up for the Chimera Downs builders (build_downs_*.py): palette, a per-slot accumulator that merges a model's
# primitives, and the export. Each builder sets DOWNS_OUT (file name under src/assets) and DOWNS_COLL, then execs this:
#   DOWNS_OUT = "downs-stand.glb"; DOWNS_COLL = "MoonDownsStand"
#   exec(open(os.path.join(REPO, "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())
# Env: MOONRUNNER_REPO (checkout), DOWNS_OUT (full output path override), MOONRUNNER_EXPORT=0 (build without exporting).
# three.js axes (x right, y up, +z front), each model on y = 0 with its origin on the ground; one material per mesh named
# after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js; glow slots are lit); `ink` = outline thickness in metres.
# Palette (docs/downs-layouts.md), plus a darker tint of each for shading:
#   Gold Gleam cfb352, Saddle Brown b07c57, Black 3b393a, Money 7b9a6e, Barn Red 8b4044, Touch of Mint f8fff8
import bpy, bmesh, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "downs_common.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("DOWNS_OUT") or os.path.join(REPO, "src", "assets", DOWNS_OUT)
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Downs export ->", OUT)
COLL = DOWNS_COLL
PI = math.pi


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "mint": "f8fff8", "mint2": "dfe8dd", "gold": "cfb352", "gold2": "a8903a", "saddle": "b07c57", "saddle2": "8c5f3f", "black": "3b393a", "black2": "5a5760",
    "money": "7b9a6e", "money2": "5b7a52", "barn": "8b4044", "barn2": "6a2e33",
    "seat": "7b9a6e", "cloth": "8b4044", "accent": "8b4044", "glasswarm": "fff0c0", "glowgold": "ffe9a0", "glowmint": "e8fff0", "glowred": "ff5a4a",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)


# Colliders from the geometry: an Acc made with solid=True (parts(..., solid=True)) also writes a `col` empty for each
# primitive big enough to stand on or run into (COL_MIN thick and COL_LONG long), glow and glass slots aside. A box is exact
# (shape box: centre, half sizes hx hy hz, rotation rx ry rz as xf's euler: three.js axes, X then Y then Z); an upright
# cylinder or lathe is a cylinder (shape cyl: base at the empty, r, h); an extruded outline is its bounding box in its own
# frame, only if the outline fills COL_FILL of it (so an L or an arc doesn't block its own inside); anything else (add) is
# the box round its vertices. Beams, tubes, tori and lettering never collide. downsKit.js bake() places them with the part.
# A floor or plinth (an unturned box topping out under COL_FLOOR, COL_WIDE or more across both ways) gets none: the runner
# steps up only about 0.4 m (physics.js: a walkable top's normal is over 0.55 up), so a 0.5 to 0.9 m slab would stop him dead
# where he used to walk over its sunk-in top.
COL_MIN, COL_LONG, COL_FILL, COL_FLOOR, COL_WIDE = 0.12, 1.0, 0.6, 0.9, 2.5
_ncol = [0]


def _fill(pts):
    area = abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2
    us, vs = [p[0] for p in pts], [p[1] for p in pts]
    box = (max(us) - min(us)) * (max(vs) - min(vs))
    return area / box if box > 1e-9 else 0.0


class Acc:
    all = []

    def __init__(self, name, slot, parent, ink=0.015, solid=False):
        self.name, self.slot, self.parent, self.ink, self.geos = name, slot, parent, ink, []
        self.solid = solid and not slot.startswith("glow") and not slot.startswith("glass")
        Acc.all.append(self)

    def _col(self, shape, pos, **props):
        _ncol[0] += 1
        pivot(f"{self.name}_col{_ncol[0]}", pos, self.parent, role="col", shape=shape, **props)

    def col_box(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        """a box collider placed like boxc (solid or not)"""
        self._col("box", (cx, cy, cz), hx=w / 2, hy=h / 2, hz=d / 2, rx=rot[0], ry=rot[1], rz=rot[2])

    def _cbox(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        floor = not any(rot) and cy + h / 2 < COL_FLOOR and w >= COL_WIDE and d >= COL_WIDE
        if self.solid and not floor and min(w, h, d) >= COL_MIN and max(w, h, d) >= COL_LONG:
            self.col_box(cx, cy, cz, w, h, d, rot)

    def _cverts(self, verts):
        xs, ys, zs = [v[0] for v in verts], [v[1] for v in verts], [v[2] for v in verts]
        self._cbox((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2, max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))

    def _ccyl(self, x, y0, z, r, h):
        if self.solid and min(2 * r, h) >= COL_MIN and max(2 * r, h) >= COL_LONG:
            self._col("cyl", (x, y0, z), r=r, h=h)

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        self._cbox(cx, cy, cz, w, h, d, rot)
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot)); return self

    def box(self, x0, x1, y0, y1, z0, z1):
        x0, x1, y0, y1, z0, z1 = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), min(z0, z1), max(z0, z1)
        return self.boxc((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0)

    def rbc(self, cx, cy, cz, w, h, d, e=0.3, rot=(0, 0, 0), nu=14, nv=8):
        self._cbox(cx, cy, cz, w, h, d, rot)
        self.geos.append(xf(rbox(w / 2, h / 2, d / 2, e, nu, nv), (cx, cy, cz), rot)); return self

    def cylc(self, cx, cy, cz, r, h, seg=12, rt=None, rot=(0, 0, 0)):
        rr = max(r, r if rt is None else rt)
        if any(rot):
            self._cbox(cx, cy, cz, 2 * rr, h, 2 * rr, rot)
        else:
            self._ccyl(cx, cy - h / 2, cz, rr, h)
        self.geos.append(xf(cylinder(r if rt is None else rt, r, h, seg)[:2], (cx, cy, cz), rot)); return self

    def tor(self, R, r, t=(0, 0, 0), rot=(0, 0, 0), n=24, rs=6, s=(1, 1, 1)):
        self.geos.append(xf(torus(R, r, n, rs), t, rot, s)); return self

    def path(self, pts, r, seg=6):
        self.geos.append(tube(pts, r if isinstance(r, (list, tuple)) else [r] * len(pts), seg)); return self

    def bm(self, a, b, r, seg=5):
        """a strut of radius r between two points"""
        self.geos.append(beam(a, b, r, seg)); return self

    def poly(self, pts, z0, z1, t=(0, 0, 0)):
        """a flat outline [(x, y)] extruded from z0 to z1"""
        if self.solid and _fill(pts) >= COL_FILL:
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            self._cbox((min(xs) + max(xs)) / 2 + t[0], (min(ys) + max(ys)) / 2 + t[1], (z0 + z1) / 2 + t[2], max(xs) - min(xs), max(ys) - min(ys), abs(z1 - z0))
        self.geos.append(xf(extrude(pts, z1 - z0, "z"), (t[0], t[1], (z0 + z1) / 2 + t[2]))); return self

    def polyx(self, pts, x0, x1):
        """a flat outline [(z, y)] extruded along x from x0 to x1 (a side profile)"""
        if self.solid and _fill(pts) >= COL_FILL:
            zs, ys = [p[0] for p in pts], [p[1] for p in pts]
            self._cbox((x0 + x1) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2, abs(x1 - x0), max(ys) - min(ys), max(zs) - min(zs))
        self.geos.append(xf(extrude(pts, x1 - x0, "x"), ((x0 + x1) / 2, 0, 0))); return self

    def polyy(self, pts, y0, y1, t=(0, 0, 0), rot=(0, 0, 0)):
        """a flat outline [(x, z)] extruded up from y0 to y1 (a floor, a roof deck); `t` and `rot` move it afterwards"""
        area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
        if area > 0:                                                                        # clockwise on the x-right, z-up plan so the cap faces up
            pts = pts[::-1]
        if self.solid and _fill(pts) >= COL_FILL:
            xs, zs = [p[0] for p in pts], [p[1] for p in pts]
            c = Euler(rot, "XYZ").to_matrix() @ Vector(((min(xs) + max(xs)) / 2, 0, (min(zs) + max(zs)) / 2))   # (xf turns about the extrusion's middle)
            self._cbox(c.x + t[0], c.y + t[1] + (y0 + y1) / 2, c.z + t[2], max(xs) - min(xs), abs(y1 - y0), max(zs) - min(zs), rot)
        self.geos.append(xf(extrude(pts, y1 - y0, "y"), (t[0], t[1] + (y0 + y1) / 2, t[2]), rot)); return self

    def lath(self, profile, t=(0, 0, 0), segs=24, rot=(0, 0, 0)):
        """a solid of revolution: profile [(r, y)] bottom to top"""
        g = xf(lathe(profile, segs)[:2], t, rot)
        if any(rot):
            if self.solid:
                self._cverts(g[0])
        else:
            ys = [p[1] for p in profile]
            self._ccyl(t[0], min(ys) + t[1], t[2], max(p[0] for p in profile), max(ys) - min(ys))
        self.geos.append(g); return self

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1)):
        g = xf(geo[:2], t, rot, s)
        if self.solid:
            self._cverts(g[0])
        self.geos.append(g); return self

    def letters(self, text, cx, cy, z, pix, depth, ry=0.0):
        """raised 5 x 7 pixel lettering, each pixel a box `pix` square and `depth` deep on the plane z (+z face; ry = pi for
        a -z face), centred on (cx, cy)"""
        solid, self.solid = self.solid, False                       # (lettering never collides)
        px, w = letter_pixels(text)
        for c, r in px:
            x = (c - (w - 1) / 2) * pix * (1 if ry == 0 else -1)
            self.boxc(cx + x, cy + (3 - r) * pix, z + (depth / 2 if ry == 0 else -depth / 2), pix * 1.03, pix * 1.03, depth)
        self.solid = solid
        return self

    def letters_x(self, text, x, cy, cz, pix, depth, face=1):
        """raised lettering on a plane x = const facing +x (face = 1) or -x (-1), read from outside, centred on (cy, cz)"""
        solid, self.solid = self.solid, False                       # (lettering never collides)
        px, w = letter_pixels(text)
        for c, r in px:
            u = (c - (w - 1) / 2) * pix * -face                  # facing +x, the viewer's right is -z
            self.boxc(x + face * depth / 2, cy + (3 - r) * pix, cz + u, depth, pix * 1.03, pix * 1.03)
        self.solid = solid
        return self

    def letters_arc(self, text, yc, rm, pix, z, depth):
        """lettering along an arc round (0, yc) at radius rm, tops outward, centred on the crown, on the plane z (+z face)"""
        solid, self.solid = self.solid, False                       # (lettering never collides)
        px, w = letter_pixels(text)
        for c, r in px:
            u = (c - (w - 1) / 2) * pix                      # arc length from the crown, + right
            th = u / rm
            rad = rm + (3 - r) * pix
            self.boxc(rad * math.sin(th), yc + rad * math.cos(th), z + depth / 2, pix * 1.03, pix * 1.03, depth, rot=(0, 0, -th))
        self.solid = solid
        return self

    def flush(self):
        if self.geos:
            mesh(self.name, join(self.geos), self.slot, self.parent, self.ink)
        self.geos = []


# 5 x 7 pixel font for raised lettering (signs are boxes, not paint: Acc.letters). Rows top to bottom, 1 = a pixel.
FONT5 = {
    "A": "01110 10001 10001 11111 10001 10001 10001", "B": "11110 10001 10001 11110 10001 10001 11110", "C": "01110 10001 10000 10000 10000 10001 01110",
    "D": "11110 10001 10001 10001 10001 10001 11110", "E": "11111 10000 10000 11110 10000 10000 11111", "F": "11111 10000 10000 11110 10000 10000 10000",
    "G": "01110 10001 10000 10111 10001 10001 01111", "H": "10001 10001 10001 11111 10001 10001 10001", "I": "01110 00100 00100 00100 00100 00100 01110",
    "J": "00111 00010 00010 00010 00010 10010 01100", "K": "10001 10010 10100 11000 10100 10010 10001", "L": "10000 10000 10000 10000 10000 10000 11111",
    "M": "10001 11011 10101 10101 10001 10001 10001", "N": "10001 11001 10101 10011 10001 10001 10001", "O": "01110 10001 10001 10001 10001 10001 01110",
    "P": "11110 10001 10001 11110 10000 10000 10000", "Q": "01110 10001 10001 10001 10101 10010 01101", "R": "11110 10001 10001 11110 10100 10010 10001",
    "S": "01111 10000 10000 01110 00001 00001 11110", "T": "11111 00100 00100 00100 00100 00100 00100", "U": "10001 10001 10001 10001 10001 10001 01110",
    "V": "10001 10001 10001 10001 10001 01010 00100", "W": "10001 10001 10001 10101 10101 11011 10001", "X": "10001 10001 01010 00100 01010 10001 10001",
    "Y": "10001 10001 01010 00100 00100 00100 00100", "Z": "11111 00001 00010 00100 01000 10000 11111", " ": "00000 00000 00000 00000 00000 00000 00000",
    "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110", "2": "01110 10001 00001 00110 01000 10000 11111",
    "3": "11110 00001 00001 01110 00001 00001 11110", "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
    "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000", "8": "01110 10001 10001 01110 10001 10001 01110",
    "9": "01110 10001 10001 01111 00001 00010 01100", "'": "00100 00100 00000 00000 00000 00000 00000", "·": "00000 00000 00000 00100 00000 00000 00000", ".": "00000 00000 00000 00000 00000 01100 01100", "-": "00000 00000 00000 11111 00000 00000 00000",
}


def letter_pixels(text):
    """(column, row) of each lit pixel of `text` (columns from the left, letters 6 apart; rows from the top), and the width in pixels"""
    px, col = [], 0
    for ch in text.upper():
        rows = FONT5[ch].split()
        for r, line in enumerate(rows):
            for c, v in enumerate(line):
                if v == "1":
                    px.append((col + c, r))
        col += 6
    return px, col - 1


def hip(rt, rb, h):
    """A four-sided frustum (hip roof) with sides parallel to the axes. cylinder() puts corners on the axes and xf() scales
    before it turns, so it's turned FIRST (else a stretch shears it into a rhombus). Scale with Acc.add(..., s=(sx, 1, sz));
    half-width at the foot is rb * 0.7071 * sx."""
    v, f = cylinder(rt, rb, h, 4)[:2]
    return xf((v, f), (0, 0, 0), (0, PI / 4, 0))


def flush_all():
    for a in Acc.all:
        a.flush()


def parts(root, prefix, specs, solid=False):
    """accumulators for a model: specs is {slot: ink}; returns {slot: Acc} named <prefix>_<slot>. solid: its primitives also
    write colliders (see Acc)"""
    return {s: Acc(f"{prefix}_{s}", s, root, ink, solid) for s, ink in specs.items()}


def audit_flips(objs, min_faces=6):
    """Report inside-out primitives (doesn't stop the build). Kit primitives are convex, so a connected piece with most faces
    pointing inward has reversed winding or a wrong turn (it shows only from inside, or not at all)."""
    import mathutils
    bad = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != "MESH":
            continue
        me = o.evaluated_get(dg).to_mesh()
        mw, nm = o.matrix_world, o.matrix_world.to_3x3()
        parent = list(range(len(me.vertices)))

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a
        for f in me.polygons:
            vs = list(f.vertices)
            for a in vs[1:]:
                parent[find(a)] = find(vs[0])
        groups = {}
        for f in me.polygons:
            groups.setdefault(find(f.vertices[0]), []).append(f)
        for fs in groups.values():
            if len(fs) < min_faces:
                continue
            vs = {v for f in fs for v in f.vertices}
            mid = sum((mw @ me.vertices[v].co for v in vs), mathutils.Vector()) / len(vs)
            inward = sum(1 for f in fs if (nm @ f.normal).dot(mw @ f.center - mid) < -1e-6)
            if inward > 0.85 * len(fs):
                # reported in three.js axes, as the builders write them
                bad.append(f"{o.name}: {inward}/{len(fs)} faces point inward, piece at ({mid.x:.2f}, {mid.z:.2f}, {-mid.y:.2f})")
        o.evaluated_get(dg).to_mesh_clear()
    if bad:
        print("AUDIT flips: " + str(len(bad)) + " inside-out piece(s):\n  " + "\n  ".join(bad[:15]))
    else:
        print("AUDIT flips ok")


def finish_and_export():
    flush_all()
    audit_coplanar(C.objects)
    audit_flips(C.objects)
    dg = bpy.context.evaluated_depsgraph_get()
    tris = {}
    for o in C.objects:
        if o.type != "MESH":
            continue
        p = o
        while p.parent:
            p = p.parent
        tris[p.name] = tris.get(p.name, 0) + sum(len(q.vertices) - 2 for q in o.evaluated_get(dg).to_mesh().polygons)
    print("built", len(C.objects), "objects; triangles per root:", tris)
    if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
        export(OUT, list(C.objects))
