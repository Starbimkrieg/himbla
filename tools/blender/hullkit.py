# Hull and fitting geometry shared by the vehicle redesign builders (build_courier.py, build_skimmer_redesign.py): loft through
# smoothed keyframes, skin-hugging lines and bands, tubes, revolved wheel profiles, rounded bars, thin curved panels.
# exec'd after kit.py; builds nothing itself. three.js axes, like kit.py.

import math
from mathutils import Vector


def hexlin(h):
    """sRGB hex -> the linear floats Blender's materials take"""
    return tuple(((c / 255 + 0.055) / 1.055) ** 2.4 if c / 255 > 0.04045 else c / 255 / 12.92 for c in ((h >> 16) & 255, (h >> 8) & 255, h & 255))


def lerp(a, b, t):
    return a + (b - a) * t


def catmull(p0, p1, p2, p3, t):
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)


def smooth_keys(keys, k=6):
    """Catmull-Rom through keyframe rows [(z, ymin, ymax, halfwidth, eTop, eBottom)], k steps a span, as loft() sections."""
    out = []
    n = len(keys)
    for i in range(n - 1):
        for s in range(k if i < n - 2 else k + 1):
            t = s / k
            row = [catmull(keys[max(i - 1, 0)][c], keys[i][c], keys[i + 1][c], keys[min(i + 2, n - 1)][c], t) for c in range(6)]
            z, y0, y1, w, eT, eB = row
            out.append(dict(z=z, w=max(w, 0.005), t=max((y1 - y0) / 2, 0.005), b=max((y1 - y0) / 2, 0.005), yc=(y0 + y1) / 2, eT=eT, eB=eB))
    return out


def ring_xy(s, th):
    """Point of a loft section at ring angle th (0 = flank at mid height, pi/2 = top), as loft() places it."""
    c, sn = math.cos(th), math.sin(th)
    e = s.get("eT", 2.5) if sn >= 0 else s.get("eB", 2.5)
    h = s["t"] if sn >= 0 else s["b"]
    return s["w"] * spe(c, 2 / e), s.get("yc", 0.0) + h * spe(sn, 2 / e)


def band(secs, th0, th1, side, off=0.012, z0=-9, z1=9, m=3, stride=2):
    """Patch of body skin between two ring angles and two z's on one flank, `off` outside it."""
    cols = [s for s in secs if z0 <= s["z"] <= z1][::stride]
    verts, faces = [], []
    for s in cols:
        for j in range(m + 1):
            x, y = ring_xy(s, lerp(th0, th1, j / m))
            verts.append((side * (x + off), y, s["z"]))
    for i in range(len(cols) - 1):
        for j in range(m):
            a = i * (m + 1) + j
            faces.append((a, a + 1, a + m + 2, a + m + 1) if side > 0 else (a + m + 1, a + m + 2, a + 1, a))
    return verts, faces


def line(secs, th, side, off=0.014, z0=-9, z1=9, stride=2):
    return [(side * (ring_xy(s, th)[0] + off), ring_xy(s, th)[1], s["z"]) for s in secs if z0 <= s["z"] <= z1][::stride]


PROUD = 0.006   # max standoff of an ink-0 detail; more and its colour draws across the outline


def skin_line(secs, th, side, r, z0=-9, z1=9, stride=2):
    """A glowing line of radius r laid in the flank, standing PROUD proud of it."""
    path = line(secs, th, side, PROUD - r, z0, z1, stride)
    return tube(path, [r] * len(path), 4, False)


def revolve_x(loop, segs=28):
    """Spin a closed profile [(x, r)] about the x axis (the wheel axle)."""
    verts, faces = [], []
    n = len(loop)
    for i in range(segs):
        a = 2 * math.pi * i / segs
        for x, r in loop:
            verts.append((x, r * math.sin(a), r * math.cos(a)))
    for i in range(segs):
        i2 = (i + 1) % segs
        for k in range(n):
            k2 = (k + 1) % n
            faces.append((i * n + k, i2 * n + k, i2 * n + k2, i * n + k2))
    return verts, faces


def squircle(cx, cy, hx, hy, e, n=16):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        pts.append((cx + hx * spe(math.cos(t), 2 / e), cy + hy * spe(math.sin(t), 2 / e)))
    return pts


def limb(p, q, sx, sy, e=0.3):
    """A rounded bar from p to q, sx thick across x, sy deep across its other cross-axis."""
    p, q = Vector(p), Vector(q)
    d = q - p
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler("XYZ")
    return xf(rbox(sx, sy, d.length / 2, e, 12, 6), tuple((p + q) / 2), tuple(rot))


def sheet(fn, nu, nv, th):
    """A thin curved panel: fn(u, v) -> (x, y, z) over u, v in [0, 1], thickened by th through its normal."""
    P = [[Vector(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    N = []
    for i in range(nu + 1):
        row = []
        for j in range(nv + 1):
            du = P[min(i + 1, nu)][j] - P[max(i - 1, 0)][j]
            dv = P[i][min(j + 1, nv)] - P[i][max(j - 1, 0)]
            row.append(du.cross(dv).normalized())
        N.append(row)
    verts = []
    for sgn in (1, -1):
        for i in range(nu + 1):
            for j in range(nv + 1):
                verts.append(tuple(P[i][j] + N[i][j] * th / 2 * sgn))
    idx = lambda s, i, j: s * (nu + 1) * (nv + 1) + i * (nv + 1) + j
    faces = []
    for i in range(nu):
        for j in range(nv):
            faces.append((idx(0, i, j), idx(0, i + 1, j), idx(0, i + 1, j + 1), idx(0, i, j + 1)))
            faces.append((idx(1, i, j + 1), idx(1, i + 1, j + 1), idx(1, i + 1, j), idx(1, i, j)))
    for i in range(nu):
        faces.append((idx(0, i + 1, 0), idx(0, i, 0), idx(1, i, 0), idx(1, i + 1, 0)))
        faces.append((idx(0, i, nv), idx(0, i + 1, nv), idx(1, i + 1, nv), idx(1, i, nv)))
    for j in range(nv):
        faces.append((idx(0, 0, j), idx(0, 0, j + 1), idx(1, 0, j + 1), idx(1, 0, j)))
        faces.append((idx(0, nu, j + 1), idx(0, nu, j), idx(1, nu, j), idx(1, nu, j + 1)))
    return verts, faces


def edge_path(fn, which, n=24):
    """Points along one edge of a sheet(): which is 'top', 'bottom', 'left' or 'right'."""
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(fn(t, 1) if which == "top" else fn(t, 0) if which == "bottom" else fn(0, t) if which == "left" else fn(1, t))
    return out


def skin_patch(secs, th0, th1, off=0.03, z0=-9, z1=9, side=1, m=3, stride=1):
    """Plate on a loft's skin from ring angle th0 to th1 (0 = flank at mid height, pi/2 = top) between two z's, `off` proud along
    the surface direction (band() only offsets sideways, lifting nothing on the roof). side -1 mirrors it to the left flank."""
    cols = [s for s in secs if z0 <= s["z"] <= z1][::stride]
    verts, faces = [], []
    for s in cols:
        for j in range(m + 1):
            th = lerp(th0, th1, j / m)
            x, y = ring_xy(s, th)
            verts.append((side * (x + off * math.cos(th)), y + off * math.sin(th), s["z"]))
    for i in range(len(cols) - 1):
        for j in range(m):
            a = i * (m + 1) + j
            faces.append((a, a + 1, a + m + 2, a + m + 1) if side > 0 else (a + m + 1, a + m + 2, a + 1, a))
    return verts, faces
