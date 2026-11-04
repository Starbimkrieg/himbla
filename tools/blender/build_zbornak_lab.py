# Dr. Zbornak's Antimatter Research Lab, the rework of the whole plateau (r 120 m), built from code in Blender. The draft
# picked from the two first proposals (A: the Rotunda, the Elder, LABNET) with its revisions. Not in the game:
# docs/zbornak-proposals/README.md is the brief and the review; preview_zbornak_lab.py renders it.
#
#   MOONRUNNER_REPO=. python3 tools/blender/build_zbornak_lab.py      builds it into the scene and exports
#                                                                     docs/zbornak-proposals/zbornak.glb (the doctor alone,
#                                                                     plain, in the game's GLB contract)
# Area frame = the location's frame in the game (world.buildLab): origin at the plateau's centre, +z toward the front.
#
# The Rotunda: a domed round lab 64 m across, the reactor rising through an oculus to a crown of rings 44 m up. A ribbed
# airlock tunnel runs to a lock housing (ZBORNAK LABORATORIES over a round pressure door; the security camera on a round
# mount photographs the visitor on the stand plate). Inside, about the reactor (its catwalk, the stair up to it and the
# bridge to the intake hatch), clockwise from the door (its inner end a portal in the wall, the inner door rising into it): the
# equipment corner (chemistry benches, the magnet array, LABNET's wall display with the drone feeds at its sides and its desk
# before it, battery chargers, microscopes), Zbornak's dais, the robotics bay, the exotic-matter wall and its magnetic cages, the splice pod, the cryo pods, the sealed
# hydroponics habitat, the holotable. A cable tray runs round the wall at 6.2 m; every pipe and cable ends in it, a socket
# or a flange. Outside: the plaza, paved walks to the supply pad and the ranch gate, the Zbornak containers (the standard
# cargo box), a radiator field piped to the reactor, a solar array cabled in, gas racks, the generator. The ranch east of it.

import bpy, math, os, sys

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", ".."))
OUTDIR = os.path.join(REPO, "docs", "zbornak-proposals")
COLL = "ZbornakLab"


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    # the lab (the game's lab colours: settlements.js dressLab)
    "wall": "e8e4f4", "wall2": "c9c4d8", "roof": "3a3550", "panel": "5b5870", "dark": "2a2540", "steel": "55607a", "metal": "8a87a0",
    "hazard": "ffd23f", "floor": "6b6880", "floor2": "403a58", "floorhab": "a9d8cf", "white": "f3eee4", "arm": "ff9f1c", "armdark": "2a2540",
    "cable": "1d1a29", "copper": "b87333", "brass": "d8a060", "seat": "6b6880", "rubber": "1d1a29", "stone": "9a94a8", "void": "0e0814",
    "plant": "3a6a4a", "plant2": "2f5a5a", "soil": "3a2a2a", "path": "7a7590", "solar": "26325e", "door": "8a87a0",
    # the Zbornak containers (cargo.py's box: body, stripe, label are the livery)
    "body": "4b3a7a", "stripe": "7dff3a", "label": "f3eee4",
    # the ranch
    "barn": "8b4044", "barn2": "6a2e33", "wood": "9a6a3a", "wood2": "6e4a2a", "trim": "f3eee4", "corr": "9aa7bb", "moss": "8aa860",
    "moss2": "5a7a40", "dirt": "8a7a6a", "roof2": "3b393a", "barnint": "5a3a2a",
    # glows (lit in the preview and in the game)
    "lime": "7dff3a", "pink": "ff2e88", "pinkhot": "ffd0f0", "cyan": "2ec4ff", "teal": "2ee6c0", "vio": "c77dff", "amber": "ff9f1c",
    "red": "ff2a4a", "lamp": "fff6a8", "spark": "cfe6ff", "weldcore": "9cc4ff", "weldhalo": "1648ff", "screenlit": "8dffb4",
    "holo": "2ec4ff", "beam": "9be7ff", "scan": "7dff3a", "halo": "c77dff", "ember": "ff7a1a", "goggle": "7dff3a", "feed": "7dff3a",
    "feed2": "b8ff9e", "water": "3a8bd5", "window": "fff0b0", "screen": "102018",
    # see-through
    "glass": "9be7ff", "glassg": "b8ffe0", "frost": "d8f4ff", "smoke": "9a94a8", "habglass": "bff4ff",
    # Zbornak
    "coat": "f3eee4", "coat2": "d6d0c2", "scorch": "231c22", "scorch2": "6b4a3a", "shirt": "b8e0ff", "tie": "2e8b57", "trousers": "3a3550",
    "shoe": "1d1a29", "eye": "0d0a14", "soot": "3a3438", "glove": "a0602a", "board": "b07c57", "paper": "fff8e8", "inkline": "2a2540",
    "skin": "a8d8a0", "skin2": "6fae74", "iris": "ffd23f",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
GLOW = {"lime", "pink", "pinkhot", "cyan", "teal", "vio", "amber", "red", "lamp", "spark", "weldcore", "weldhalo", "screenlit", "holo",
        "beam", "scan", "halo", "ember", "goggle", "feed", "feed2", "water", "window", "iris", "screen"}
SEE = {"glass": 0.18, "glassg": 0.14, "frost": 0.5, "smoke": 0.35, "habglass": 0.12, "holo": 0.35, "beam": 0.1, "scan": 0.12,
       "halo": 0.18, "weldhalo": 0.55}

for f in ("kit.py", "decals.py", "cargo.py", "zbornak_kit.py", "zbornak_figure.py", "lab_doors.py"):
    exec(open(os.path.join(REPO, "tools", "blender", f), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)
RUNNER = {}     # where the preview stands the courier: name -> ((x, y, z), yaw)


SEAMS = []      # designed ink lines to draw on ring walls once their meshes exist: (acc, R, T, H, angles)


def ring_wall(g, R, T, H, gaps=(), n=72, slot="wall", seam_every=0):
    """a round wall of n flat panels (inner radius R, T thick, H tall); gaps [(angle, width)] left open. Each unbroken run
    is one mesh (separate overlapping boxes left each panel's outline shell poking through its neighbour at the joins:
    broken lines that came and went); each panel still collides as its own box. seam_every: a designed ink line at every
    so many panel joints, on the outside (kit.ink_lines)."""
    step = TAU / n
    open_ = [any(abs((step * (i + 0.5) - ga + PI) % TAU - PI) * R < gw / 2 + 0.3 for ga, gw in gaps) for i in range(n)]
    acc, rr = g(slot), R + T / 2
    for i in range(n):
        a = step * (i + 0.5)
        if open_[i]:
            continue
        w = TAU * rr / n * 1.04
        if acc._solid() and min(w, H, T) >= COL_MIN and max(w, H, T) >= COL_LONG:
            g.col_box(math.sin(a) * rr, H / 2, math.cos(a) * rr, w, H, T, (0, a, 0))
    start = next((i for i in range(n) if open_[i]), None)               # runs start just after a gap (or anywhere: a full ring)
    order = [(start + 1 + k) % n for k in range(n)] if start is not None else list(range(n))
    runs, cur = [], []
    for i in order:
        if open_[i]:
            if cur:
                runs.append(cur)
            cur = []
        else:
            cur.append(i)
    if cur:
        runs.append(cur)
    for run in runs:
        full = len(run) == n
        k = len(run) if full else len(run) + 1                             # panel edges along the run
        ang = [step * (run[0] + j) for j in range(k)]
        verts = []
        for a in ang:
            for r in (R, R + T):
                for y in (0.0, H):
                    verts.append((math.sin(a) * r, y, math.cos(a) * r))
        faces = []
        segs = k if full else k - 1
        for j in range(segs):
            b, c = 4 * j, 4 * ((j + 1) % k)
            faces += [(b, c, c + 1, b + 1), (b + 2, b + 3, c + 3, c + 2), (b + 1, c + 1, c + 3, b + 3), (b, b + 2, c + 2, c)]
        if not full:                                                       # end caps
            e = 4 * (k - 1)
            faces += [(0, 1, 3, 2), (e, e + 2, e + 3, e + 1)]
        acc._push((verts, faces))
    if seam_every:
        SEAMS.append((acc, R, T, H, [step * i for i in range(0, n, seam_every) if not open_[i % n] and not open_[i - 1]]))


def ring_seams():
    """the ring walls' designed seams (after flush_all: they need the walls' meshes)"""
    for acc, R, T, H, angles in SEAMS:
        o = bpy.data.objects.get(acc.name)
        if o:
            ink_lines(o, [((0, 0, 0), (math.cos(a), 0, -math.sin(a))) for a in angles], t=0.04,
                      keep=lambda p, R=R, T=T, H=H, angles=angles: math.hypot(p[0], p[2]) > R + T * 0.75 and 0.05 < p[1] < H - 0.05
                      and any(p[0] * math.sin(a) + p[2] * math.cos(a) > 0 and abs(p[0] * math.cos(a) - p[2] * math.sin(a)) < 0.2 for a in angles))
    SEAMS.clear()


def railing_ring(g, r, y, gap=None, step=1.4, solid=False):
    """a round railing of posts and two rails at radius r, standing on height y; gap = (angle, width) leaves an opening (the
    rails stop at it, a post each side); solid: it collides, as a thin wall between each pair of posts"""
    if not gap:
        n = max(8, int(TAU * r / step))
        a0, a1 = 0.0, TAU
    else:
        h = gap[1] / 2 / r
        a0, a1 = gap[0] + h, gap[0] + TAU - h
        n = max(8, int((a1 - a0) * r / step))
    m = n if not gap else n + 1
    for i in range(m):
        a = a0 + (a1 - a0) * i / n
        g("steel", 0.015).cylc(math.sin(a) * r, y + 0.55, math.cos(a) * r, 0.035, 1.1, 5)
    if not gap:
        g("hazard", 0.015).tor(r, 0.045, (0, y + 1.1, 0), n=max(24, n), rs=5)
        g("steel", 0.0).tor(r, 0.03, (0, y + 0.55, 0), n=max(24, n), rs=4)
    else:
        k = max(12, int((a1 - a0) * r / 0.5))
        for yy, rr, slot in ((y + 1.1, 0.045, "hazard"), (y + 0.55, 0.03, "steel")):
            g(slot, 0.015 if slot == "hazard" else 0.0).path([(math.sin(a0 + (a1 - a0) * i / k) * r, yy, math.cos(a0 + (a1 - a0) * i / k) * r) for i in range(k + 1)], rr, 5)
    if solid:
        for i in range(n):
            am = a0 + (a1 - a0) * (i + 0.5) / n
            g.at(0, 0, am)
            g.col_box(0, y + 0.6, r, (a1 - a0) * r / n * 1.02, 1.2, 0.12)
            g.at()


def slope_box(g, slot, p0, p1, x0, x1, t=0.25, ink=None):
    """a roof slab between profile points p0, p1 = (z, y), running x0..x1, t thick (laid on top of the line)"""
    dz, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dz, dy)
    th = math.atan2(-dy, dz)
    nz, ny = -dy / L, dz / L
    if ny < 0:
        nz, ny = -nz, -ny
    g(slot, ink).boxc((x0 + x1) / 2, (p0[1] + p1[1]) / 2 + ny * t / 2, (p0[0] + p1[0]) / 2 + nz * t / 2, x1 - x0, t, L + 0.1, (th, 0, 0))


def gas_rack(g, x, z, yaw):
    g.at(x, z, yaw)
    g("dark").boxc(0, 0.15, 0, 3, 0.3, 8)
    for i in range(6):
        g(("panel", "white", "steel")[i % 3]).cylc(0, 1.5, -2.8 + i * 1.1, 0.4, 2.4, 10)
        g(("lime", "pink", "cyan")[i % 3], 0.0).tor(0.41, 0.05, (0, 2.2, -2.8 + i * 1.1), n=12, rs=4)
        g("steel").ball(0, 2.85, -2.8 + i * 1.1, 0.3, 8, 6)
    g("hazard", 0.0).boxc(0.48, 1.8, 0, 0.16, 0.16, 7.6)                   # the restraint bar, against the bottles
    for z_ in (-3.6, 3.6):
        g("steel", 0.0).boxc(0.48, 1.0, z_, 0.12, 1.4, 0.12)
    g.at()




def slope_col(g, w, p0, p1, t, **extra):
    """a slab collider t thick just under a sloped face running from p0 to p1 ((z, y) in g's current frame), w wide in x"""
    dz, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dz, dy)
    ny, nz = dz / L, -dy / L
    if ny < 0:
        ny, nz = -ny, -nz
    g.col_box(0, (p0[1] + p1[1]) / 2 - ny * t / 2, (p0[0] + p1[0]) / 2 - nz * t / 2, w, t, L, (math.atan2(-dy, dz), 0, 0), **extra)


def dome_y(prof, r):
    """the dome's underside height at radius r (its profile runs outward-in)"""
    for (r0, y0), (r1, y1) in zip(prof, prof[1:]):
        if r1 <= r <= r0:
            return y0 + (y1 - y0) * (r0 - r) / (r0 - r1)
    return prof[-1][1]


def arc_box(g, slot, ink, r, a0, a1, y, h, d, seg_len=2.0):
    """a band of boxes along an arc (a tray, a kerb, a beam): radius r, angles a0..a1, centred at height y"""
    n = max(1, int(abs(a1 - a0) * r / seg_len))
    for i in range(n):
        a = a0 + (a1 - a0) * (i + 0.5) / n
        g(slot, ink).boxc(math.sin(a) * r, y, math.cos(a) * r, abs(a1 - a0) * r / n * 1.02, h, d, (0, a, 0))


def wall_flange(g, x, z, y, toward, r=0.5):
    """a flange where a pipe or cable meets a wall: a ring plate turned to face `toward` (an angle about y)"""
    g("dark", 0.02).cylc(x, y, z, r, 0.2, 14, rot=(PI / 2, toward, 0))
    g("steel", 0.0).cylc(x, y, z, r * 0.6, 0.26, 12, rot=(PI / 2, toward, 0))


def ground_run(g, pts, y=0.15, r=0.14, slot="cable"):
    """a conduit laid along the ground on blocks every 5 m"""
    g(slot, 0.0).path([(p[0], y, p[1]) for p in pts], r, 6)
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(bx - ax, bz - az) / 5))
        for k in range(n + 1):
            t = k / n
            g("stone", 0.0).boxc(ax + (bx - ax) * t, y / 2, az + (bz - az) * t, 0.5, y, 0.5)


# ---- the robot cell's work cycle (bench frame: the bench's middle at the origin, its long side along x, the welder's side +z)
# One loop of t in [0, 1): the left arm (arm0) clamps the chimera; the right arm (arm1) lifts an armour plate out of the carrier,
# swings it over and holds it flat on the chimera's flank; the welder (arm2) runs a bead up the plate's seam; arm1 lets go
# (the plate stays, welded) and goes back to the carrier; arm0 lets go. Each arm's key is (t, tool point, tool pitch); between
# keys the tool point moves in a straight line, eased, and arm_ik solves the joints, so the tools travel as a robot's do.
PLATE_C = (0.355, 2.3, 0.0)            # the plate's middle where it is welded on (the chimera's body flank is x 0.31)
ARM_BASES = {"arm0": (-2.2, -3.6, 0.0), "arm1": (2.2, -3.6, 0.0), "arm2": (0.5, 4.3, PI)}
DOWN = -PI / 2
CELL_KEYS = {
    "arm0": [(0.00, (-1.3, 2.9, -1.4), -0.6), (0.05, (-1.3, 2.9, -1.4), -0.6), (0.14, (-0.38, 2.35, -0.62), -0.25),
             (0.20, (-0.22, 2.3, -0.34), -0.25), (0.86, (-0.22, 2.3, -0.34), -0.25), (0.92, (-0.38, 2.35, -0.62), -0.25),
             (1.00, (-1.3, 2.9, -1.4), -0.6)],
    "arm1": [(0.00, (2.5, 2.6, 0.75), DOWN), (0.06, (2.5, 2.6, 0.75), DOWN), (0.13, (2.5, 1.91, 0.75), DOWN), (0.17, (2.5, 1.91, 0.75), DOWN),
             (0.24, (2.5, 2.95, 0.75), DOWN), (0.34, (0.8, 2.95, 0.0), DOWN), (0.40, (0.355, 2.58, 0.0), DOWN),
             (0.80, (0.355, 2.58, 0.0), DOWN), (0.84, (0.36, 2.85, 0.0), DOWN), (0.88, (0.9, 3.0, 0.2), DOWN), (1.00, (2.5, 2.6, 0.75), DOWN)],
    "arm2": [(0.00, (1.3, 3.0, 1.9), -0.5), (0.36, (1.3, 3.0, 1.9), -0.5), (0.44, (0.44, 2.06, 0.34), -0.35),
             (0.46, (0.405, 2.08, 0.27), -0.35), (0.74, (0.405, 2.52, 0.27), -0.35), (0.80, (0.9, 2.9, 1.0), -0.4),
             (0.88, (1.3, 3.0, 1.9), -0.5), (1.00, (1.3, 3.0, 1.9), -0.5)],
}
PICK_T, RELEASE_T, WELD_T = 0.17, 0.82, (0.46, 0.74)
STILL_T = 0.6                           # the pose the stills show: clamped, plate held, the weld halfway up the seam
CELL = {}


def track(keys, t):
    """the tool point and pitch at t: straight between keys, eased in and out"""
    for (t0, p0, f0), (t1, p1, f1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            u = u * u * (3 - 2 * u)
            return tuple(a + (b - a) * u for a, b in zip(p0, p1)), f0 + (f1 - f0) * u
    return keys[-1][1], keys[-1][2]


def apply_cell(t):
    """pose the cell's arms for time t (IK on each arm's tool point) and show the one plate that is where it should be"""
    for name, A in CELL["arms"].items():
        (tx, ty, tz), phi = track(CELL_KEYS[name], t)
        bx, bz, by = ARM_BASES[name]
        local = rot_y((tx - bx, ty, tz - bz), -by)
        yaw, sh, el, wr = arm_ik(local, phi, A["tool"], A["base_h"], A["reach"])
        A["turret"].rotation_euler[2] = yaw
        A["shoulder"].rotation_euler[0] = -sh
        A["elbow"].rotation_euler[0] = el
        A["wrist"].rotation_euler[0] = wr
        A["roll"].rotation_euler[1] = -(yaw + by) if name == "arm1" else 0.0  # keep the held plate square to the chimera
    state = "rack" if t < PICK_T else "carry" if t < RELEASE_T else "weld"
    for k in ("rack", "carry", "weld"):
        for o in [CELL[k].root] + list(CELL[k].root.children_recursive):
            o.hide_render = k != state
    return state, WELD_T[0] <= t <= WELD_T[1]


def armour_plate(g, x, y, z, bead=False, held=False):
    """an armour plate on edge (0.05 thick along x, 0.48 wide along z, 0.5 tall), riveted, a hazard edge; bead: the weld
    bead up its +z seam, still glowing; held: as the gripper holds it (its long axes in the flange's frame: x thickness,
    y width, z down the plate)"""
    if held:
        g("metal", 0.02).boxc(x, y, z, 0.05, 0.48, 0.5)
        for i in (-1, 1):
            for j in (-1, 1):
                g("dark", 0.0).cylc(x + 0.03, y + i * 0.19, z + j * 0.19, 0.025, 0.02, 6, "x")
        return
    g("metal", 0.02).boxc(x, y, z, 0.05, 0.5, 0.48)
    g("hazard", 0.0).boxc(x + 0.026, y + 0.22, z, 0.004, 0.04, 0.46)
    for i in (-1, 1):
        for j in (-1, 1):
            g("dark", 0.0).cylc(x + 0.03, y + i * 0.19, z + j * 0.19, 0.025, 0.02, 6, "x")
    if bead:
        for k in range(9):
            g("ember", 0.0).ball(x + 0.03, y - 0.22 + k * 0.055, z + 0.245, 0.022, 6, 4)


def build_lab(root):
    CX, CZ, R, T, H = 0.0, -18.0, 30.0, 1.2, 12.0
    SOLID_DEFAULT[0] = True                                                # the place's groups make colliders from their parts
    lab = G("lab", root, CX, 0, CZ)
    top = G("lab_roof", root, CX, 0, CZ, solid=False)                      # (the dome's colliders are slabs under its facets)
    top.root["cutaway"] = 1

    def P(deg, r):
        a = math.radians(deg)
        return math.sin(a) * r, math.cos(a) * r, a + PI

    def W(lx, lz):                                                          # lab-local -> area
        return (CX + lx, CZ + lz)

    # ---- shell: plinth, wall with portholes, radiator fins, ring beam, ribbed dome, oculus
    ring_wall(lab, R, T, H, gaps=[(0.0, 9.0)], seam_every=3)              # (the airlock's portal fills the gap)
    ring_wall(lab, R + T, 0.6, 1.2, gaps=[(0.0, 9.4)], slot="panel")
    for i in range(48):
        a = TAU * (i + 0.5) / 48
        if abs((a + PI) % TAU - PI) * R < 6:
            continue
        p = (math.sin(a) * (R + T + 0.05), 8.2, math.cos(a) * (R + T + 0.05))
        lab("window", 0.0).cylc(*p, 0.55, 0.12, 14, rot=(PI / 2, a, 0))
        lab("dark", 0.02).tor(0.62, 0.1, p, (PI / 2, a, 0), n=16, rs=5)
    for i in range(16):
        a = TAU * (i + 0.5) / 16
        if abs((a + PI) % TAU - PI) < 0.3:
            continue
        lab.at(math.sin(a) * (R + T), math.cos(a) * (R + T), a)
        lab("wall2", 0.05).polyx([(0, 0), (5.2, 0), (5.2, 1.6), (1.4, H + 1.2), (0, H + 1.2)], -0.55, 0.55)
        lab.col_box(0, 0.8, 2.6, 1.1, 1.6, 5.2)
        slope_col(lab, 1.1, (5.2, 1.6), (1.4, H + 1.2), 0.6)
        lab("cyan", 0.0).polyx([(4.0, 1.6), (4.25, 1.6), (0.9, H + 0.6), (0.65, H + 0.6)], -0.58, 0.58)
        for k in range(5):
            lab("steel", 0.0).boxc(0.0, 2.6 + k * 1.7, 2.2 - k * 0.25, 1.3, 0.08, 1.6 - k * 0.18)
        lab.at()
    top("wall2", 0.06).tor(R + T + 0.2, 0.55, (0, H + 0.1, 0), n=72, rs=8)
    prof = [(R + T + 0.3, H + 0.3), (R + 0.2, H + 4), (R - 2.5, H + 8.0), (R - 7.5, H + 11.5), (R - 15, H + 14), (7.0, H + 14.8)]
    inner = [(r - 0.35, y - 0.35) for r, y in prof]
    top("roof", 0.07).lath(prof + inner[::-1] + [prof[0]], segs=72)          # (closed: the game draws one side)
    for i in range(36):                                                    # the dome collides as a slab under each facet
        a = TAU * (i + 0.5) / 36
        top.at(0, 0, a)
        for p0, p1 in zip(prof, prof[1:]):
            slope_col(top, TAU * (p0[0] + p1[0]) / 2 / 36 * 1.02, p0, p1, 0.4)
        top.at()
    for i in range(24):
        a = TAU * i / 24
        pts = [(math.sin(a) * (r + 0.25), y + 0.2, math.cos(a) * (r + 0.25)) for r, y in prof]
        top("wall2", 0.03).path(pts, 0.28, 6)
    top("lime", 0.0).tor(R + 0.4, 0.12, (0, H + 3.6, 0), n=96, rs=4)
    top("wall2", 0.05).lath([(6.2, H + 14.5), (8.0, H + 14.6), (8.0, H + 15.6), (6.2, H + 15.8), (6.2, H + 14.5)], segs=40)
    top("pink", 0.0).tor(7.1, 0.12, (0, H + 15.75, 0), n=40, rs=4)
    for i in range(12):                                                    # ceiling lamps, each hung on two rods from the dome
        a = TAU * (i + 0.5) / 12
        rr = R - 4.0
        yd = dome_y(prof, rr)
        top("lamp", 0.0).boxc(math.sin(a) * rr, yd - 1.0, math.cos(a) * rr, 2.4, 0.12, 0.5, (0, a, 0))
        top("dark", 0.02).boxc(math.sin(a) * rr, yd - 0.9, math.cos(a) * rr, 2.6, 0.1, 0.6, (0, a, 0))
        for k in (-1, 1):
            q = rot_y((k * 1.0, 0, 0), a)
            top("steel", 0.0).bm((math.sin(a) * rr + q[0], yd - 0.85, math.cos(a) * rr + q[2]), (math.sin(a) * rr + q[0], dome_y(prof, rr) + 0.05, math.cos(a) * rr + q[2]), 0.03, 4)
    for i in range(8):
        a = TAU * (i + 0.5) / 8
        lab.light((math.sin(a) * 20, 11, math.cos(a) * 20), (0.92, 0.88, 1.0), 2500, 1.5)
    # the cable tray round the inner wall at 6.2 m (the door aside), every line in the lab ends in it
    # (it runs on across the airlock's portal, straight in front of its pilasters: see the portal)
    TA = math.asin(5.95 / (R - 0.25))
    arc_box(lab, "steel", 0.02, R - 0.25, TA, TAU - TA, 6.2, 0.18, 0.5)
    arc_box(lab, "dark", 0.0, R - 0.47, TA, TAU - TA, 6.32, 0.08, 0.04)

    # ---- airlock: a ribbed tube from the portal through the lock housing to the round pressure door (it rises into the
    # housing's head to let you in), the sign, the security post
    z0, z1 = R + T - 0.5, 44.0
    DY, DR = 3.0, 3.13
    TL0, TL1 = z0, z1 + 5.6
    lab("wall", 0.06).lath([(3.6, -(TL1 - TL0) / 2), (3.9, -(TL1 - TL0) / 2), (3.9, (TL1 - TL0) / 2), (3.6, (TL1 - TL0) / 2), (3.6, -(TL1 - TL0) / 2)],
                           (0, 2.4, (TL0 + TL1) / 2), 28, (PI / 2, 0, 0))
    lab("panel", 0.0).boxc(0, 0.03, (TL0 + TL1) / 2, 5.2, 0.06, TL1 - TL0)
    for k in range(9):
        lab("wall2", 0.03).tor(3.95, 0.18, (0, 2.4, z0 + 1.0 + k * (z1 - z0 - 2) / 8), (PI / 2, 0, 0), n=28, rs=5)
    lab("lime", 0.0).boxc(0, 5.98, (TL0 + TL1) / 2, 0.25, 0.04, TL1 - TL0 - 1)
    for i in range(14):                                                    # the tube collides as slabs round its arc (hand: it's a
        th = math.radians(-130 + i * 20)                                   # shell), each tangent, its outer face the drawn one
        lab.col_box(math.sin(th) * 3.75, 2.4 + math.cos(th) * 3.75, (TL0 + TL1) / 2, 1.42, 0.3, TL1 - TL0, (0, 0, -th))
    # the lock housing, hollow: side blocks, a head over the tube, a front wall round the door
    for sx in (-1, 1):
        lab("wall", 0.07).boxc(sx * 5.2, 5.0, z1 + 3, 2.6, 10, 6)
    lab("wall", 0.07).boxc(0, 8.15, z1 + 3, 7.8, 3.7, 6)
    for sx in (-1, 1):
        arc = [(sx * 2.95 * math.cos(math.radians(f)), DY + 2.95 * math.sin(math.radians(f))) for f in range(90, -91, -10)]
        lab("wall", 0.06).polyz(arc + [(sx * 3.9, DY - 2.95), (sx * 3.9, 6.3)], z1 + 5.6, z1 + 6.0)
        lab.col_box(sx * 3.45, 3.15, z1 + 5.8, 0.9, 6.3, 0.4)
    lab("roof", 0.05).boxc(0, 10.2, z1 + 3, 13.6, 0.4, 6.6)
    lab("hazard", 0.02).boxc(0, 9.6, z1 + 6.05, 13.0, 0.5, 0.1)
    if DOOR_VARIANT != "slot":                                              # a door draft (lab_doors.py)
        outer_door_draft(lab, z1, DY)
    else:
        lab("hazard", 0.03).tor(2.85, 0.28, (0, DY, z1 + 6.05), (PI / 2, 0, 0), n=40, rs=6)
        door = G("outer_door", lab.root, 0, DY, z1 + 6.05, solid=False, role="door")
        door("door", 0.03).cylc(0, 0, 0, 2.6, 0.25, 32, "z")
        door("dark", 0.0).boxc(0, 0, 0.14, 5.1, 0.08, 0.04).boxc(0, 0, 0.14, 0.08, 5.1, 0.04)
        for k in range(8):
            a = TAU * k / 8
            door("steel", 0.0).cylc(math.sin(a) * 2.3, math.cos(a) * 2.3, 0.15, 0.12, 0.06, 8, "z")
        door("dark", 0.02).cylc(0, 0, 0.2, 0.6, 0.15, 16, "z")
        door("lime", 0.0).tor(0.62, 0.05, (0, 0, 0.28), (PI / 2, 0, 0), n=20, rs=4)
        door.root["travel"] = -6.0                                              # it sinks into its slot in the ground, out of sight
        lab("void", 0.0).boxc(0, 0.005, z1 + 6.05, 5.6, 0.01, 0.34)              # the slot, a hazard sill each side of it
        for sz in (-1, 1):
            lab("hazard", 0.0).boxc(0, 0.01, z1 + 6.05 + sz * 0.22, 5.8, 0.02, 0.1)
    for k in (-1, 1):
        lab("dark").boxc(k * 6.0, 9.0, z1 + 6.3, 0.6, 0.5, 0.6)
        lab("lamp", 0.0).boxc(k * 6.0, 8.8, z1 + 6.62, 0.45, 0.25, 0.04)
    lab("dark", 0.04).boxc(0, 8.65, z1 + 6.1, 9.0, 1.2, 0.16)
    lab("pink", 0.0).boxc(0, 9.22, z1 + 6.19, 8.8, 0.05, 0.02)
    lab.text("ZBORNAK LABORATORIES", (0, 8.33, z1 + 6.19), 0, 0.68, "pink")
    plate = security_post(lab, 0, z1 + 6.0, 0, DY, DR, "sec")
    lab.mark("spot", plate, PI, spot="plate")
    lab.mark("spot", (0, DY, z1 + 6.05), 0, spot="outer_door")
    RUNNER["gate"] = ((plate[0] + CX, 0, plate[2] + CZ), PI)
    # the airlock's inner end: a portal wall filling the gap in the ring wall up to its top, the tunnel's mouth a round
    # opening in it, the inner door raised into a pocket in the wall above it (its lower edge showing), guide rails each
    # side, a lit hazard frame, pilasters where it meets the ring wall, AIRLOCK over it
    PW, PZ, HR_, HY_ = 5.45, R + T / 2 - 0.25, 2.85, 2.85                  # half width, the portal's middle (z), the hole
    lab("wall", 0.06).boxc(0, (HY_ + HR_ + H) / 2, PZ, 2 * PW, H - HY_ - HR_, T)
    for sx in (-1, 1):
        arc = [(sx * HR_ * math.cos(math.radians(f)), HY_ + HR_ * math.sin(math.radians(f))) for f in range(90, -91, -10)]
        lab("wall", 0.06).polyz(arc + [(sx * PW, 0.0), (sx * PW, HY_ + HR_)], PZ - T / 2, PZ + T / 2)
        lab("wall2", 0.04).boxc(sx * (PW - 0.05), H / 2, PZ - T / 2 - 0.15, 0.9, H, 0.3)
        lab.col_box(sx * (HR_ + PW) / 2, (HY_ + HR_) / 2, PZ, PW - HR_, HY_ + HR_, T)
        if DOOR_VARIANT == "slot":
            lab("steel", 0.02).boxc(sx * (HR_ + 0.8), 6.11 / 2, PZ - T / 2 - 0.12, 0.18, 6.11, 0.18)          # guide rails, up to the tray
    # the inner door: closed in the opening, it rises into its pocket in the wall to let you through (the game cycles it
    # with the outer door: one opens only once the other is shut)
    if DOOR_VARIANT != "slot":
        inner_door_draft(lab, PZ, T, HY_, HR_)
    else:
        idoor = G("inner_door", lab.root, 0, HY_, PZ, solid=False, role="door")
        idoor("door", 0.03).cylc(0, 0, 0, HR_ + 0.15, 0.3, 32, "z")
        idoor("dark", 0.0).boxc(0, 0, -0.16, 0.08, 2 * HR_, 0.04).boxc(0, 0, -0.16, 2 * HR_, 0.08, 0.04)
        for k in range(8):
            a = TAU * k / 8
            idoor("steel", 0.0).cylc(math.sin(a) * 2.5, math.cos(a) * 2.5, -0.17, 0.12, 0.06, 8, "z")
        idoor("dark", 0.02).cylc(0, 0, -0.2, 0.6, 0.15, 16, "z")
        idoor("lime", 0.0).tor(0.62, 0.05, (0, 0, -0.28), (PI / 2, 0, 0), n=20, rs=4)
        idoor.root["travel"] = 6.0                                              # up into the wall, out of sight
    lab.mark("spot", (0, HY_, PZ), PI, spot="inner_door")
    # the cable tray straight across, in front of the pilasters, joining the round run's ends, on brackets to the wall
    TZ, TD = (R - 0.25) * math.cos(TA), (R - 0.47) * math.cos(TA)
    lab("steel", 0.02).boxc(0, 6.2, TZ, 2 * (R - 0.25) * math.sin(TA), 0.18, 0.5)
    lab("dark", 0.0).boxc(0, 6.32, TD, 2 * (R - 0.47) * math.sin(TA), 0.08, 0.04)
    for bx in (-3.0, 0.0, 3.0):
        lab("steel", 0.0).boxc(bx, 6.2, (TZ + 0.25 + PZ - T / 2) / 2, 0.12, 0.12, PZ - T / 2 - TZ - 0.25 + 0.02)
    lab("hazard", 0.03).tor(HR_ + 0.15, 0.2, (0, HY_, PZ - T / 2 - 0.1), (PI / 2, 0, 0), n=40, rs=6)
    for k in range(14):
        f = PI * k / 13
        lab("lime", 0.0).ball(math.cos(f) * (HR_ + 0.45), HY_ + math.sin(f) * (HR_ + 0.45), PZ - T / 2 - 0.05, 0.06, 6, 4)
    lab("dark", 0.03).boxc(0, HY_ + HR_ + 1.25, PZ - T / 2 - 0.05, 3.6, 0.7, 0.1)
    lab.text("AIRLOCK", (0, HY_ + HR_ + 1.05, PZ - T / 2 - 0.11), PI, 0.42, "lime")
    for sx in (-1, 1):
        lab("lime" if sx < 0 else "red", 0.0).ball(sx * 2.15, HY_ + HR_ + 1.25, PZ - T / 2 - 0.07, 0.09, 8, 6)
    CAMS["portal"] = ((CX - 3.5, 2.6, CZ + 15.0), (CX + 0.6, 3.6, CZ + R), 30)

    # ---- floor: disc, bands, the reactor's pit and railing, the reactor, the catwalk, its stair, the intake bridge
    lab("floor", 0.0).cylc(0, 0.03, 0, R + 0.2, 0.06, 72)
    for i in range(36):
        a = TAU * i / 36
        lab("floor2", 0.0).boxc(math.sin(a) * 19, 0.065, math.cos(a) * 19, 0.5, 0.01, 22, (0, a, 0))
    for r_, c in ((8.0, "lime"), (18.0, "cyan"), (28.5, "lime")):
        lab(c, 0.0).tor(r_, 0.08, (0, 0.07, 0), n=72, rs=4, s=(1, 0.15, 1))
    lab("dark", 0.0).cylc(0, 0.075, 0, 7.4, 0.03, 48)
    railing_ring(lab, 7.6, 0.06)
    RE = 3.4
    reactor(G("reactor", lab.root), 22, RE, 3, crown_y=H + 21, collar_y=8.6)
    CW = 6.6                                                                # catwalk deck height
    CI, CO = 8.6, 11.6                                                      # the catwalk's inner and outer edge: 3 m to walk
    lab("panel", 0.04).lath([(CI, CW - 0.3), (CO, CW - 0.3), (CO, CW), (CI, CW), (CI, CW - 0.3)], segs=64)
    lab("cyan", 0.0).tor(11.62, 0.05, (0, CW - 0.15, 0), n=64, rs=4)
    for i in range(40):                                                    # the ring deck collides as boxes round it
        a = TAU * (i + 0.5) / 40
        lab.at(0, 0, a)
        lab.col_box(0, CW - 0.15, (CI + CO) / 2, TAU * CO / 40 * 1.05, 0.3, CO - CI)
        lab.at()
    railing_ring(lab, CI + 0.1, CW, gap=(-PI / 2, 2.0), step=1.6, solid=True)
    railing_ring(lab, 11.5, CW, gap=(-PI / 2, 2.1), step=1.6, solid=True)
    for i in range(6):
        a = TAU * i / 6 + 0.3
        lab("steel", 0.03).cylc(math.sin(a) * (CI + CO) / 2, (CW - 0.3) / 2, math.cos(a) * (CI + CO) / 2, 0.22, CW - 0.3, 8)
    # the lift to the catwalk, at the west: a glass shaft beside the ring, a short bridge from its top onto the catwalk. Its car
    # and its two gates are pivots the game moves (labWorld.js): the car carries you up or down, standing, and each gate (a
    # waist-high barrier across the shaft's opening at that level) rises only while the car is there. Below, the opening
    # faces out (-x), toward the lab's floor; above, it faces the bridge (+x).
    LX, LZ, LH = -13.95, 0.0, CW + 3.2                                     # the shaft's centre and its height
    lab.col_extra = {"see": 1}                                              # (the camera sees through all of it: main.js)
    lab("panel", 0.03).boxc(-12.15, CW - 0.15, LZ, 1.4, 0.3, 2.0)          # the bridge
    lab("hazard", 0.0).boxc(-12.15, CW + 0.006, LZ + 0.9, 1.4, 0.01, 0.12).boxc(-12.15, CW + 0.006, LZ - 0.9, 1.4, 0.01, 0.12)
    for sz in (-1, 1):                                                     # its railings, from just past the top gate
        for x_ in (-12.5, -12.0, -11.5):
            lab("steel", 0.015).cylc(x_, CW + 0.55, LZ + sz * 0.98, 0.035, 1.1, 5)
        lab("hazard", 0.015).bm((-12.5, CW + 1.1, LZ + sz * 0.98), (-11.45, CW + 1.1, LZ + sz * 0.98), 0.045, 5)
        lab("steel", 0.0).bm((-12.5, CW + 0.55, LZ + sz * 0.98), (-11.45, CW + 0.55, LZ + sz * 0.98), 0.03, 4)
        lab.col_box(-12.0, CW + 0.6, LZ + sz * 0.98, 1.1, 1.2, 0.12)
    for sx in (-1, 1):                                                     # corner posts, frames at each level and the top
        for sz in (-1, 1):
            lab("steel", 0.03).boxc(LX + sx * 1.15, LH / 2, LZ + sz * 1.15, 0.16, LH, 0.16)
    for yy in (0.06, CW - 0.15, LH):
        for sz in (-1, 1):
            lab("steel", 0.02).boxc(LX, yy, LZ + sz * 1.15, 2.46, 0.14, 0.14)
            lab("steel", 0.02).boxc(LX + sz * 1.15, yy, LZ, 0.14, 0.14, 2.46)
    # the glass: both sides whole; the back (-x) over the bottom opening; the front (+x) under the bridge and over its opening
    for sz in (-1, 1):
        lab("glass", 0.0).boxc(LX, LH / 2, LZ + sz * 1.15, 2.2, LH - 0.2, 0.04)
        lab.col_box(LX, LH / 2, LZ + sz * 1.15, 2.46, LH, 0.12)
    lab("glass", 0.0).boxc(LX - 1.15, (2.6 + LH) / 2, LZ, 0.04, LH - 2.6, 2.2)
    lab.col_box(LX - 1.15, (2.6 + LH) / 2, LZ, 0.12, LH - 2.6, 2.46)
    lab("glass", 0.0).boxc(LX + 1.15, (CW - 0.3) / 2, LZ, 0.04, CW - 0.4, 2.2)
    lab.col_box(LX + 1.15, (CW - 0.3) / 2, LZ, 0.12, CW - 0.3, 2.46)
    lab("glass", 0.0).boxc(LX + 1.15, (CW + 2.6 + LH) / 2, LZ, 0.04, LH - CW - 2.6, 2.2)
    lab.col_box(LX + 1.15, (CW + 2.6 + LH) / 2, LZ, 0.12, LH - CW - 2.6, 2.46)
    lab("steel", 0.02).boxc(LX - 1.15, 2.6, LZ, 0.16, 0.16, 2.46).boxc(LX + 1.15, CW + 2.6, LZ, 0.16, 0.16, 2.46)   # the openings' heads
    # the winding house on top, lamps over each opening, a hazard sill below, the shaft's pit
    lab("dark", 0.04).boxc(LX, LH + 0.4, LZ, 2.6, 0.7, 2.6)
    lab("lime", 0.0).boxc(LX, LH + 0.4, LZ + 1.31, 1.6, 0.12, 0.02).boxc(LX, LH + 0.4, LZ - 1.31, 1.6, 0.12, 0.02)
    for (x_, y_) in ((LX - 1.25, 2.85), (LX + 1.25, CW + 2.85)):
        lab("dark", 0.0).boxc(x_, y_, LZ, 0.12, 0.2, 0.6)
        lab("amber", 0.0).boxc(x_ + (0.065 if x_ > LX else -0.065), y_, LZ, 0.01, 0.12, 0.45)
    lab("hazard", 0.0).boxc(LX - 1.35, 0.065, LZ, 0.3, 0.01, 2.2)
    lab("void", 0.0).boxc(LX, 0.03, LZ, 2.2, 0.01, 2.2)
    car = G("lift", lab.root, LX, 0.07, LZ, solid=False, role="lift")      # the car (its origin on its deck)
    car("panel", 0.03).boxc(0, -0.06, 0, 2.1, 0.12, 2.1)
    car("dark", 0.02).boxc(0, -0.3, 0, 1.9, 0.36, 1.9)
    for sz in (-1, 1):
        car("hazard", 0.0).boxc(0, 0.003, sz * 0.97, 2.0, 0.01, 0.12)
    car("steel", 0.02).boxc(-0.85, 0.55, -0.85, 0.16, 1.1, 0.16)            # its call post: a lit button
    car("dark", 0.0).boxc(-0.85, 1.05, -0.76, 0.2, 0.2, 0.04)
    car("lime", 0.0).cylc(-0.85, 1.05, -0.73, 0.05, 0.03, 10, "z")
    car.root["travel"] = CW - 0.07
    for k, (gx, gy) in enumerate(((LX - 1.27, 0.0), (LX + 1.27, CW))):      # the gates, 1.1 m barriers that rise 2.3 m
        gate = G(f"lift_gate{k}", lab.root, gx, gy, LZ, solid=False, role="liftgate")
        gate("steel", 0.02).boxc(0, 1.05, 0, 0.1, 0.1, 2.2).boxc(0, 0.15, 0, 0.1, 0.1, 2.2)
        for sz in (-1, 1):
            gate("steel", 0.02).boxc(0, 0.6, sz * 1.05, 0.1, 1.0, 0.1)
        gate("glass", 0.0).boxc(0, 0.6, 0, 0.03, 0.8, 2.0)
        gate("hazard", 0.0).boxc(0.055 if k else -0.055, 1.05, 0, 0.01, 0.06, 2.1)
        gate.root["travel"] = 2.3
    lab.mark("spot", (LX, 0.07, LZ), 0, spot="lift")
    lab.col_extra = {}
    CAMS["stair"] = ((CX - 22.0, 4.5, CZ - 6.0), (CX - 13.0, 3.6, CZ), 30)
    reactor_intake(lab, RE, -PI / 2, CW, CI)
    lab.mark("spot", (-(RE + 1.75), CW, 0), -PI / 2, spot="intake")
    lab.mark("spot", (0, 11, 0), 0, spot="reactor")
    RUNNER["intake"] = ((CX - 7.4, CW, CZ + 0.35), PI / 2 + 0.3)
    ia = math.radians(-105)
    CAMS["intake"] = ((CX + math.sin(ia) * 11.2, CW + 2.6, CZ + math.cos(ia) * 11.2), (CX - 5.4, CW + 0.7, CZ), 26)

    # ---- stations round the wall (angle from the door, clockwise seen from above)
    # Zbornak's dais: a round step, a workbench, a monitor on a post, the doctor facing the door
    x, z, _ = P(24, 13.5)
    lab("panel", 0.04).cylc(x, 0.18, z, 2.8, 0.36, 28)
    lab("lime", 0.0).tor(2.8, 0.05, (x, 0.36, z), n=32, rs=4)
    fy = math.atan2(0 - x, R - z)
    lab.at(x, z, fy)
    lab("cyan", 0.05).boxc(0, 0.9, 1.15, 2.6, 1.1, 0.8)
    lab("dark", 0.03).boxc(0, 1.5, 1.15, 2.8, 0.1, 1.0)
    lab("pink", 0.0).ball(-0.8, 1.75, 1.2, 0.2, 8, 6)
    lab("steel", 0.0).cylc(-0.8, 1.58, 1.2, 0.12, 0.06, 10)
    lab("glass", 0.0).cylc(0.6, 1.75, 1.1, 0.12, 0.4, 10)
    lab("lime", 0.0).cylc(0.6, 1.65, 1.1, 0.11, 0.2, 10)
    lab("steel", 0.02).cylc(0, 1.1, -1.4, 0.08, 1.5, 8)
    lab("dark", 0.02).cylc(0, 0.38, -1.4, 0.45, 0.04, 12)
    lab("dark", 0.03).boxc(0, 2.4, -1.45, 2.2, 1.3, 0.14)
    lab("holo", 0.0).boxc(0, 2.4, -1.37, 2.0, 1.1, 0.02)
    lab("cable", 0.0).path([(0.1, 0.4, -1.5), (0.6, 0.38, -2.4), (1.0, 0.1, -3.0)], 0.05, 4)
    lab.at()
    doc = zbornak(lab.root, x, z, fy)
    doc.root.location.z = 0.36
    doc.root["role"] = "doctor"
    lab.at(x, z, fy)
    lab.mark("spot", (0, 0.36, 3.6), PI, spot="doctor")                    # where you stand to talk to him (before the bench)
    lab.at()
    CAMS["zb"] = ((CX + x + math.sin(fy) * 5.6 - math.cos(fy) * 1.8, 2.9, CZ + z + math.cos(fy) * 5.6 + math.sin(fy) * 1.8), (CX + x, 1.8, CZ + z), 45)
    # the equipment corner, right of the door: two chemistry benches, the magnet array, LABNET's wall display (the big
    # screen with the drone feeds two above each other at its sides), a battery charger under each feed column, LABNET's
    # desk before it, the microscope bench. The benches and the magnet array are at 1.25 scale (ES): life-size beside you.
    ES = 1.25
    for deg, kind in ((17.5, 0), (27.0, 1)):
        x, z, yw = P(deg, R - 0.12)
        chem_bench(lab, x, z, yw, 3.8, kind, int(deg), s=ES)
    for deg in labnet_wall(lab, R, 56.5, "lab"):
        x, z, yw = P(deg, R - 0.05)
        battery_station(lab, x, z, yw)
    x, z, yw = P(56.5, 25.6)
    labnet_desk(lab, x, z, yw)
    lab.at(x, z, yw)
    lab.mark("spot", (0, 0.18, 1.2), PI, spot="labnet")                    # the operator's spot, at the desk facing the wall
    lab.at()
    x, z, yw = P(79.5, R - 0.12)
    microscope_bench(lab, x, z, yw, 3.8, s=ES)
    lab.light((P(56, 22)[0], 5.0, P(56, 22)[1]), (0.6, 0.85, 1.0), 900, 1.0)
    CAMS["drones"] = ((CX + P(50, 11.5)[0], 3.4, CZ + P(50, 11.5)[1]), (CX + P(57, 27)[0], 3.4, CZ + P(57, 27)[1]), 26)
    CAMS["term"] = ((CX + P(54.5, 22.0)[0], 2.5, CZ + P(54.5, 22.0)[1]), (CX + P(56.5, 25.6)[0], 1.75, CZ + P(56.5, 25.6)[1]), 32)
    CAMS["equipment"] = ((CX + P(36, 13.0)[0], 3.0, CZ + P(36, 13.0)[1]), (CX + P(27, 27.0)[0], 1.5, CZ + P(27, 27.0)[1]), 26)
    CAMS["microscopes"] = ((CX + P(72, 24.0)[0], 2.4, CZ + P(72, 24.0)[1]), (CX + P(80, 29.0)[0], 1.3, CZ + P(80, 29.0)[1]), 30)
    CAMS["pylon"] = ((CX + P(80, 15.0)[0], 3.4, CZ + P(80, 15.0)[1]), (CX + P(60, 7.0)[0], 4.4, CZ + P(60, 7.0)[1]), 30)
    # robotics bay: three arms on joint pivots working one cell (CELL_KEYS): the left arm clamps the chimera on its jig, the
    # right one takes an armour plate from the carrier and holds it on the chimera's flank, the welder runs a bead up the
    # seam; an overhead gantry over it all
    x, z, yw = P(100, 21.0)
    tw = G("robots", lab.root, x, 0, z, yw)
    tw("panel", 0.04).boxc(0, 0.55, 0, 6.2, 1.1, 2.4)
    tw("hazard", 0.0).boxc(0, 1.12, 0, 6.3, 0.04, 2.5)
    tw("steel", 0.02).boxc(0, 1.2, 0, 5.6, 0.12, 1.9)
    jig = G("jig", tw.root, 0, 1.31, 0, solid=False, role="jig")           # the jig: a turntable with clamps under the chimera
    jig("dark", 0.03).cylc(0, 0, 0, 0.75, 0.1, 24)                         # (the game turns it, the chimera with it)
    jig("hazard", 0.0).tor(0.76, 0.03, (0, 0, 0), n=28, rs=4)
    for k in (-1, 1):
        jig("steel", 0.015).boxc(k * 0.45, 0.14, 0, 0.12, 0.2, 0.5)
    tw("steel", 0.02).cylc(0, 1.285, 0, 0.3, 0.05, 16)                     # its bearing
    tw.chim((0, 1.36, 0), 0.0, 1.3, 4)
    # the bench's other work: a charging dock for power cells (the hoist brings one, an arm seats it), the inspection
    # scanner in its holder, a rack of spare cells, a parts bin; a cable from the dock to the jig
    DX, DZ, BT = 1.6, -0.6, 1.26                                            # the dock, the bench's top
    tw("dark", 0.03).boxc(DX, BT + 0.15, DZ, 0.5, 0.3, 0.5)
    tw("lime", 0.0).tor(0.2, 0.025, (DX, BT + 0.3, DZ), n=20, rs=4)
    tw("void", 0.0).cylc(DX, BT + 0.295, DZ, 0.18, 0.01, 16)
    tw("cable", 0.0).path([(DX - 0.25, BT + 0.06, DZ), (0.9, BT + 0.04, -0.35), (0.6, BT + 0.06, -0.15)], 0.03, 5)
    dockpt = G("cell_dock", tw.root, DX, BT + 0.3, DZ, solid=False, role="dockpt")   # (where a seated cell's foot is)
    SX_, SZ_ = -2.3, 0.6                                                    # the scanner's holder
    tw("dark", 0.02).boxc(SX_, BT + 0.1, SZ_, 0.3, 0.2, 0.3)
    tw("steel", 0.0).cylc(SX_, BT + 0.21, SZ_, 0.08, 0.02, 10)
    sc = G("scanner", tw.root, SX_, BT + 0.2 + 0.3, SZ_, solid=False, role="scanner")   # the wand, standing in it
    sc("white", 0.02).cylc(0, 0.05, 0, 0.05, 0.5, 10)
    sc("dark", 0.02).cylc(0, -0.25, 0, 0.09, 0.1, 12)
    sc("cyan", 0.0).cylc(0, -0.305, 0, 0.07, 0.01, 12)
    beam = G("scanner_beam", sc.root, 0, -0.31, 0, solid=False, role="beam")
    beam("scan", 0.0).add(cylinder(0.06, 0.55, 1.1, 16, True)[:2], (0, -0.55, 0))
    for i, (cx, cz) in enumerate(((-2.55, -0.55), (-2.3, -0.55), (-2.05, -0.55))):    # spare cells in their rack
        tw("steel", 0.02).cylc(cx, BT + 0.25, cz, 0.1, 0.5, 12)
        tw("lime" if i != 1 else "amber", 0.0).cylc(cx, BT + 0.25, cz, 0.105, 0.06, 12)
    tw("dark", 0.02).boxc(-2.3, BT + 0.06, -0.55, 0.8, 0.12, 0.3)
    tw("panel", 0.02).boxc(-1.3, BT + 0.1, 0.75, 0.5, 0.2, 0.3)             # a parts bin of bolts and brackets
    for i in range(6):
        tw(("steel", "brass", "dark")[i % 3], 0.0).ball(-1.45 + (i % 3) * 0.15, BT + 0.21, 0.7 + (i // 3) * 0.1, 0.035, 6, 4)
    # the plate carrier: a tray with slotted end frames holding the armour plates on edge
    rx, rz = 2.27, 0.75
    tw("steel", 0.03).boxc(rx, 1.32, rz, 0.8, 0.12, 0.72)
    for sz in (-0.36, 0.36):
        tw("dark", 0.02).boxc(rx, 1.62, rz + sz, 0.8, 0.6, 0.06)
        for k in range(5):
            tw("steel", 0.0).boxc(rx - 0.3 + k * 0.15, 1.62, rz + sz * 0.92, 0.02, 0.56, 0.04)
    for k, px in enumerate((2.05, 2.2, 2.35)):
        armour_plate(tw, px, 1.63, rz)
    tw.text("ARMOUR PLATE", (rx, 1.47, rz + 0.395), 0, 0.07, "hazard", 0.005)
    CELL["rack"] = G("plate_rack", tw.root, 2.5, 1.63, rz, solid=False, role="plate")
    armour_plate(CELL["rack"], 0, 0, 0)
    CELL["weld"] = G("plate_weld", tw.root, *PLATE_C, solid=False, role="plate")
    armour_plate(CELL["weld"], 0, 0, 0, bead=True)
    robot_arm(tw, -2.2, -3.6, 0, tool="claw", name="arm0")
    robot_arm(tw, 2.2, -3.6, 0, tool="claw", color="wall2", name="arm1")
    robot_arm(tw, 0.5, 4.3, PI, tool="welder", name="arm2")
    arm1 = next(A for A in ARMS if A["name"] == "arm1")
    CELL["carry"] = G("plate_carry", arm1["roll"], 0, 0, 0.5 + 0.28, solid=False, role="plate")   # its top edge 3 cm into the gripper
    armour_plate(CELL["carry"], 0, 0, 0, held=True)
    CELL["arms"] = {A["name"]: A for A in ARMS if A["name"] in ARM_BASES}
    apply_cell(STILL_T)
    for sx in (-4.0, 4.0):
        for sz in (-4.5, 4.5):
            tw("steel", 0.03).boxc(sx, 4.0, sz, 0.3, 8.0, 0.3)
            tw("dark", 0.02).boxc(sx, 0.05, sz, 0.7, 0.1, 0.7)
        tw("hazard", 0.03).boxc(sx, 8.1, 0, 0.4, 0.4, 9.4)
    tw("hazard", 0.03).boxc(0, 8.1, -1.8, 8.4, 0.5, 0.5)
    # the hoist: a trolley on the cross beam (it carries the power cells: a magazine), its cable and hook; the game runs
    # the trolley along the beam and pays out the cable
    hz = G("hoist", tw.root, -2.6, 7.6, -1.8, solid=False, role="trolley")
    hz("dark", 0.02).boxc(0, 0, 0, 1.0, 0.6, 0.8)
    hz("steel", 0.0).boxc(0, 0.33, 0, 0.9, 0.06, 0.7)
    for k in (-1, 1):
        hz("dark", 0.0).cylc(k * 0.35, 0.36, 0, 0.09, 0.84, 10, "z")         # its wheels on the beam's flange
    hz("amber", 0.0).boxc(0.505, 0.1, 0, 0.01, 0.12, 0.3)
    cab = G("hoist_cable", hz.root, 0, -0.3, 0, solid=False, role="cable")  # 0.1 m paid out; the game scales it to the payout
    cab("steel", 0.0).boxc(0, -0.05, 0, 0.04, 0.1, 0.04)
    hk = G("hoist_hook", hz.root, 0, -0.55, 0, solid=False, role="hook")
    hk("dark", 0.02).boxc(0, 0, 0, 0.3, 0.3, 0.3)
    hk("hazard", 0.0).boxc(0, -0.16, 0, 0.32, 0.03, 0.32)
    cell = G("cell", hk.root, 0, -0.4, 0, solid=False, role="cell")         # a power cell: the hoist brings it, an arm seats it
    cell("steel", 0.02).cylc(0, 0, 0, 0.12, 0.5, 14)
    cell("lime", 0.0).cylc(0, 0, 0, 0.125, 0.07, 14)
    cell("dark", 0.0).cylc(0, 0.27, 0, 0.06, 0.04, 10).cylc(0, -0.27, 0, 0.06, 0.04, 10)
    CAMS["robots"] = ((CX + x + math.sin(yw) * 9.0 + math.cos(yw) * 9.0, 6.0, CZ + z + math.cos(yw) * 9.0 - math.sin(yw) * 9.0), (CX + x, 2.0, CZ + z), 30)
    # exotic matter: a wall of canister racks, two magnetic cages before it cabled to the wall, the sign over them
    for deg in (134, 149, 164):
        x, z, yw = P(deg, R - 0.6)
        canister_rack(lab, x, z, yw, 6.4, 3, int(deg))
        lab("steel", 0.0).bm((x - math.sin(yw) * 0.0, 5.82, z), (x, 6.1, z), 0.06, 5)
    for deg in (141, 157):
        x, z, yw = P(deg, 22.5)
        void_cage(lab, x, z, yw, 1.5, 2.6, feed=R - 22.5 - 0.05)
    a = math.radians(149)                                                  # the sign: a flat board on brackets, clear of the
    lab.at(math.sin(a) * (R - 0.35), math.cos(a) * (R - 0.35), a + PI)     # wall's curve and over the tray
    lab("dark", 0.03).boxc(0, 7.2, 0, 4.3, 1.2, 0.1)
    lab("vio", 0.0).boxc(0, 6.63, 0.04, 4.1, 0.03, 0.02).boxc(0, 7.77, 0.04, 4.1, 0.03, 0.02)
    for bx in (-1.6, 1.6):
        lab("steel", 0.0).boxc(bx, 7.2, -0.2, 0.12, 0.5, 0.3)
    lab.text("EXOTIC MATTER", (0, 7.25, 0.06), 0, 0.42, "vio")
    lab.text("DO NOT LOOK DIRECTLY", (0, 6.74, 0.06), 0, 0.24, "vio")
    lab.at()
    CAMS["exotic"] = ((CX + P(146, 12)[0], 3.0, CZ + P(146, 12)[1]), (CX + P(150, 27)[0], 2.4, CZ + P(150, 27)[1]), 26)
    # the splice pod at the back, under the helix projection
    x, z, yw = P(207, R - 3.1)                                             # centred between the cryo pods, its back to the wall
    splice_pod(lab, x, z, yw)
    lab.at(x, z, yw)
    lab.mark("spot", (0, 0, 4.0), PI, spot="pod")
    lab.at()
    # wall projections, on brackets from the wall, an emitter bar over each
    for k, (deg, w, h, kind) in enumerate(((-31, 9.0, 4.2, 2), (207, 9.0, 4.2, 1), (100, 9.0, 3.4, 0))):  # (over the holotable,
        a = math.radians(deg)                                                                          # the splice pod, the robots)
        py = 10.2 if k == 2 else 8.8                                                                   # (the robots': over the gantry)
        projection(lab, math.sin(a) * (R - 0.4), py, math.cos(a) * (R - 0.4), a + PI, w, h, kind, mount=0.4, sid=f"holo{k}")
    # cryo-stasis pods, an arc of six, a chimera in each, their coolant lines into junction boxes under the tray
    for i, deg in enumerate((175, 184, 193, 221, 230, 239)):
        x, z, yw = P(deg, 26.6)
        cryo_pod(lab, x, z, yw, [0, 1, 2, 3, 5, 6][i], "cyan", wall=R - 26.6)
    a0 = math.radians(207)
    CAMS["cryo"] = ((CX + math.sin(a0) * 14, 2.6, CZ + math.cos(a0) * 14), (CX + math.sin(a0) * 26, 2.3, CZ + math.cos(a0) * 26), 30)
    # the hydroponics habitat: a sealed glass enclosure 4.5 m deep against the wall (kerb, mullions, beam, canopy, end walls,
    # an airlock door) holding one row of growth pods on a nutrient header along the wall, a nutrient tank behind the door,
    # grow-light strips under the canopy
    h0, h1, RH, HY = math.radians(-106), math.radians(-54), 25.5, 5.0
    arc_box(lab, "white", 0.03, RH, h0, h1, 0.2, 0.4, 0.4, 1.0)
    arc_box(lab, "white", 0.03, RH, h0, h1, HY, 0.3, 0.4, 1.0)
    door = math.radians(-80)
    for i in range(14):
        a = h0 + (h1 - h0) * i / 13
        if abs(a - door) < 0.05:
            continue
        lab("white", 0.02).boxc(math.sin(a) * RH, HY / 2, math.cos(a) * RH, 0.18, HY, 0.25, (0, a, 0))
    for a0_, a1_ in ((h0, door - 0.035), (door + 0.035, h1)):
        arc_box(lab, "habglass", 0.0, RH, a0_, a1_, HY / 2 + 0.2, HY - 0.6, 0.06, 1.0)
    for a in (h0, h1):                                                     # the end walls, glass in a frame, out to the wall
        lab.at(math.sin(a) * (RH + R) / 2, math.cos(a) * (RH + R) / 2, a)
        lab("habglass", 0.0).boxc(0, HY / 2, 0, 0.06, HY - 0.5, R - RH - 0.3)
        lab("white", 0.02).boxc(0, HY, 0, 0.3, 0.3, R - RH).boxc(0, 0.2, 0, 0.3, 0.4, R - RH)
        lab.at()
    for k in range(12):                                                    # the canopy, glass panels on radial ribs
        a = h0 + (h1 - h0) * (k + 0.5) / 12
        lab.at(math.sin(a) * (RH + R) / 2, math.cos(a) * (RH + R) / 2, a)
        lab("habglass", 0.0).boxc(0, HY + 0.21, 0, (h1 - h0) * (RH + R) / 2 / 12 * 0.98, 0.04, R - RH)   # (on the ribs)
        lab("vio", 0.0).boxc(0, HY + 0.165, 0, 0.12, 0.05, R - RH - 1.0)                           # (under the glass)
        lab.at()
    for k in range(13):
        a = h0 + (h1 - h0) * k / 12
        lab("white", 0.02).bm((math.sin(a) * RH, HY + 0.1, math.cos(a) * RH), (math.sin(a) * (R - 0.1), HY + 0.1, math.cos(a) * (R - 0.1)), 0.09, 5)
    lab.at(math.sin(door) * RH, math.cos(door) * RH, door + PI)            # the habitat's door: a sealed hatch in a frame
    lab("white", 0.03).boxc(0, 1.4, 0, 2.0, 2.9, 0.4)
    lab("dark", 0.02).boxc(0, 1.25, 0.15, 1.4, 2.4, 0.16)
    lab("habglass", 0.0).cylc(0, 1.7, 0.24, 0.3, 0.02, 16, "z")
    lab("lime", 0.0).boxc(0.85, 1.4, 0.21, 0.12, 0.3, 0.02)
    lab("dark", 0.03).boxc(0, 3.35, 0.1, 3.0, 0.5, 0.12)
    lab.at()
    lab.text("HYDROPONICS · BIO-SEALED", (math.sin(door) * (RH - 0.18), 3.27, math.cos(door) * (RH - 0.18)), door + PI, 0.17, "teal")
    arc_box(lab, "floorhab", 0.0, (RH + R) / 2, h0, h1, 0.07, 0.02, R - RH - 0.2, 1.0)
    # its own back: a white plate along the wall with a cap rail, vertical grow-light bars in dark channels before it
    arc_box(lab, "white", 0.03, R - 0.1, h0, h1, HY / 2 + 0.1, HY - 0.2, 0.12, 1.0)
    arc_box(lab, "white", 0.02, R - 0.2, h0, h1, HY - 0.05, 0.12, 0.2, 1.0)
    for i in range(14):
        a = h0 + (h1 - h0) * (i + 0.5) / 14
        if abs(a - door) < 0.02:
            continue
        lab.at(math.sin(a) * (R - 0.18), math.cos(a) * (R - 0.18), a)       # (local +z: out to the wall)
        lab("dark", 0.0).boxc(0, HY / 2 + 0.2, 0, 0.22, HY - 1.0, 0.04)
        lab("vio" if i % 2 else "teal", 0.0).boxc(0, HY / 2 + 0.2, -0.03, 0.09, HY - 1.2, 0.03)
        lab.at()
    HR = R - 0.7                                                            # the nutrient header along the wall
    arc_box(lab, "steel", 0.02, HR, h0 + 0.03, h1 - 0.03, 0.12, 0.16, 0.16, 0.8)
    for i, deg in enumerate((-103, -98, -93, -88, -84, -76, -72, -67, -62, -57)):  # a lane behind the door (-80)
        x, z, yw = P(deg, 27.5)
        growth_pod(lab, x, z, yw, i, 2.0, line=HR - 27.5)
    x, z, yw = P(-80, 28.4)                                                # the nutrient tank behind the door, on the header
    lab("white", 0.03).cylc(x, 0.15, z, 0.75, 0.3, 16)
    lab("glass", 0.0).cylc(x, 1.3, z, 0.65, 2.0, 16)
    lab("teal", 0.0).cylc(x, 1.0, z, 0.6, 1.4, 16)
    lab("white", 0.03).cylc(x, 2.4, z, 0.72, 0.2, 16)
    lab("steel", 0.0).bm((x, 2.5, z), (x, HY + 0.1, z), 0.05, 5)
    lab("steel", 0.02).bm((x, 0.12, z), (P(-80, HR)[0], 0.12, P(-80, HR)[1]), 0.07, 6)
    for k in range(4):
        a = h0 + (h1 - h0) * (k + 0.5) / 4
        lab.light((math.sin(a) * 27.6, 3.8, math.cos(a) * 27.6), (0.45, 1.0, 0.85), 220, 0.5)
    a0 = math.radians(-80)
    CAMS["hydro"] = ((CX + math.sin(a0) * 15.0 + 3.0, 4.0, CZ + math.cos(a0) * 15.0 + 5.0), (CX + math.sin(a0) * 27.0, 1.8, CZ + math.cos(a0) * 27.0), 28)
    CAMS["hydro_door"] = ((CX + math.sin(a0) * 20.5 + 0.8, 2.4, CZ + math.cos(a0) * 20.5 + 1.2), (CX + math.sin(a0) * 25.5, 2.4, CZ + math.cos(a0) * 25.5), 32)
    # the holotable, front left
    x, z, yw = P(-31, 23.25)                                               # between the cyan and lime floor rings, between
    holotable(lab, x, z, yw, 2.6, "round", "moon")                         # the airlock and the hydroponics
    CAMS["inside"] = ((CX + 7.5, 3.0, CZ + 26.5), (CX - 2.0, 6.5, CZ - 6.0), 22)

    # ---- outside: the plaza, walks, containers, gas racks piped in, the generator and the solar array cabled in
    out = G("outside", root)
    PZ = (0.0, -18.0 + 44.0 + 6.4 + 13.0)                                   # (its rim 0.4 m out from the lock housing: the door's slot)
    out("path", 0.0).cylc(PZ[0], 0.04, PZ[1], 13.0, 0.08, 48)
    out("hazard", 0.0).tor(12.9, 0.1, (PZ[0], 0.09, PZ[1]), n=48, rs=4, s=(1, 0.3, 1))
    walks = (math.radians(98.3), math.radians(-71.7))                       # where the two walks leave it
    mouth = math.asin(3.4 / 14.2)                                           # (a lamp 3.4 m either side of a walk's middle)
    for wa in walks + (PI,):                                                # six lamps, marking the ways in: each walk's mouth and
        for sgn in (-1, 1):                                                 # the airlock's (PI: either side of the lock housing)
            a = wa + sgn * (mouth if wa != PI else math.radians(35))
            lamp_post(out, PZ[0] + math.sin(a) * 14.2, PZ[1] + math.cos(a) * 14.2, 5.0)
    plaza = ((PZ[0], PZ[1], 13.0),)
    def from_plaza(wa, r=11.0):
        return (PZ[0] + math.sin(wa) * r, PZ[1] + math.cos(wa) * r)
    def bez(p0, p1, p2, p3, n=10):                                         # a smooth run: a cubic through its controls
        return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d for a, b, c, d in zip(p0, p1, p2, p3))
                for t in (i / n for i in range(n + 1))]
    for x, z, yaw in ((-38.0, -6.0, 0.4), (36.0, -36.0, -0.8)):
        gas_rack(out, x, z, yaw)
        d = math.atan2(x - CX, z - CZ)
        wx, wz = CX + math.sin(d) * (R + T + 0.1), CZ + math.cos(d) * (R + T + 0.1)
        out("steel", 0.02).path([(x, 1.8, z), ((x + wx) / 2, 1.8, (z + wz) / 2), (wx, 1.8, wz)], 0.12, 6)
        wall_flange(out, wx, wz, 1.8, d)
        for t in (0.33, 0.66):
            out("dark", 0.0).boxc(x + (wx - x) * t, 0.9, z + (wz - z) * t, 0.2, 1.8, 0.2)
    gx, gz = -30.0, 18.0                                                   # the generator, cabled to the wall
    out.at(gx, gz, 0.9)
    out("panel", 0.06).boxc(0, 1.5, 0, 6, 3, 3.4)
    for i in range(5):
        out("dark", 0.0).boxc(-2.2 + i * 1.1, 2.0, 1.72, 0.15, 2.0, 0.04)
    out("lime", 0.0).boxc(-2.4, 2.4, 1.73, 0.8, 0.4, 0.02)
    out("steel", 0.02).cylc(2.0, 3.6, 1.0, 0.25, 1.2, 8)
    out.at()
    d = math.atan2(gx - CX, gz - CZ)
    wx, wz = CX + math.sin(d) * (R + T + 0.7), CZ + math.cos(d) * (R + T + 0.7)
    ground_run(out, [(gx + 2.0, gz - 2.0), (wx, wz)])
    out("dark", 0.02).boxc(wx, 0.6, wz, 0.9, 1.2, 0.6, (0, d, 0))
    s0, u = from_plaza(walks[0]), (math.sin(walks[0]), math.cos(walks[0]))
    path_ribbon(out, bez(s0, (s0[0] + u[0] * 14, s0[1] + u[1] * 14), (35.55, 16.0), (48.55, 16.0)), 3.0, trim=plaza, end_dir=(1, 0))   # (radial off the
    # the supply pad is the game's standard landing pad (landingPad.js, built by labWorld.js from this spot: r, the stairs'
    # way fx, fz), its stairs toward the plaza; the walk ends square at their foot (r + 12 steps x 0.34 m)
    PADC, PADR = (-62.0, 58.0), 10.5
    dv = (-40.0 - PADC[0], 53.5 - PADC[1])
    dl = math.hypot(*dv)
    dv = (dv[0] / dl, dv[1] / dl)
    foot = (PADC[0] + dv[0] * (PADR + 12 * 0.34), PADC[1] + dv[1] * (PADR + 12 * 0.34))
    path_ribbon(out, [from_plaza(walks[1]), (-24.0, 49.0), (-36.0, 53.0), foot], 3.0, trim=plaza, end_dir=(-dv[0], -dv[1]))
    out.mark("spot", (PADC[0], 0, PADC[1]), 0, spot="pad", r=PADR, fx=dv[0], fz=dv[1])
    zb_container(out, -44.0, 67.0, 1.25, 2, 417)
    zb_container(out, -40.5, 74.5, 1.35, 1, 418)
    zb_container(out, -78.0, 70.0, 0.6, 1, 419)
    zb_container(out, 33.0, -48.0, 0.45, 2, 420)
    CAMS["crates"] = ((-30.0, 4.0, 82.0), (-46.0, 2.6, 68.0), 30)
    radiator_field(out, -4.0, -84.0, 0.0, 2, 5, (0.0, CZ - R - T - 0.2))
    wall_flange(out, 0.0, CZ - R - T - 0.1, 0.6, PI, 0.7)
    solar_array(out, -84.0, 8.0, 0.0, 3, 4)                                # (facing +z: the place's sunward side)
    cb = (-84.0 + 15.5, 8.0)                                                # its combiner box
    d = math.atan2(cb[0] - CX, cb[1] - CZ)
    wx, wz = CX + math.sin(d) * (R + T + 0.7), CZ + math.cos(d) * (R + T + 0.7)
    ground_run(out, [cb, ((cb[0] + wx) / 2, (cb[1] + wz) / 2 - 2.0), (wx, wz)])
    out("dark", 0.02).boxc(wx, 0.6, wz, 0.9, 1.2, 0.6, (0, d, 0))
    ranch_a(root)
    CAMS["over"] = ((-95.0, 95.0, 165.0), (22.0, 0.0, -5.0), 32)
    CAMS["cut"] = ((-58.0, 68.0, 52.0), (CX, 0.0, CZ - 2), 30)
    CAMS["gate"] = ((CX + 6.5, 2.6, CZ + z1 + 20.0), (CX - 1.2, 4.2, CZ + z1 + 6.0), 28)
    CAMS["front"] = ((-34.0, 9.0, 82.0), (2.0, 12.0, 6.0), 30)
    CAMS["walks"] = ((-6.0, 16.0, 76.0), (8.0, 0.0, 30.0), 26)


def ranch_a(root):
    r = G("A_ranch", root)
    BX, BZ = 74.0, -26.0
    # ---- the barn: gambrel ends, long walls with the big door open on the corral, roof slabs, cupola, solar strip
    b = G("A_barn", root, BX, 0, BZ)
    WH = 6.55                                                               # the wall's top: on the roof's line at z = 8
    gam = [(-8.0, 0), (8.0, 0), (8.0, WH), (6.2, 9.4), (0, 11.4), (-6.2, 9.4), (-8.0, WH)]
    for x0, x1 in ((-13.0, -12.6), (12.6, 13.0)):
        b("barn").polyx(gam, x0, x1)
        b.col_box((x0 + x1) / 2, 3.0, 0, 0.4, 6.0, 16.0)
    b("barn").boxc(0, WH / 2, -7.8, 25.2, WH, 0.4)
    for x0, x1 in ((-12.6, -4.5), (4.5, 12.6)):
        b("barn").boxc((x0 + x1) / 2, WH / 2, 7.8, x1 - x0, WH, 0.4)
    b("barn").boxc(0, (5.2 + WH) / 2, 7.8, 9.0, WH - 5.2, 0.4)
    for x0, x1 in ((-13.0, -4.5), (4.5, 13.0)):                              # the wainscot, either side of the door
        b("barn2", 0.0).boxc((x0 + x1) / 2, 0.6, 8.02, x1 - x0, 1.2, 0.05)
    for sz in (-1, 1):
        prof = [(sz * 8.6, 5.6), (sz * 6.2, 9.4), (0, 11.4)]
        for p0, p1 in zip(prof, prof[1:]):
            slope_box(b, "roof2", p0, p1, -13.6, 13.6, 0.28, 0.06)
        b("trim", 0.02).boxc(0, 9.62, sz * 6.24, 27.3, 0.2, 0.42)          # a cap over the slopes' break
    b("trim", 0.02).boxc(0, 11.68, 0, 27.3, 0.2, 0.6)                    # the ridge cap
    b("trim", 0.02).boxc(0, 5.75, 8.05, 9.4, 0.3, 0.2)
    for sx in (-4.6, 4.6):
        b("trim", 0.02).boxc(sx, 2.9, 8.05, 0.3, 5.8, 0.2)
    for sx in (-7.6, 7.6):                                                   # the two sliding leaves, pushed aside
        b.at(sx, 8.3)
        b("barn", 0.03).boxc(0, 2.7, 0, 4.4, 5.4, 0.2)
        b("trim", 0.0).boxc(0, 2.7, 0.12, 4.4, 0.25, 0.03).boxc(0, 0.12, 0.12, 4.4, 0.24, 0.03).boxc(0, 5.28, 0.12, 4.4, 0.24, 0.03)
        b("trim", 0.0).boxc(0, 2.7, 0.13, 0.22, 6.5, 0.03, (0, 0, 0.68)).boxc(0, 2.7, 0.13, 0.22, 6.5, 0.03, (0, 0, -0.68))
        b.at()
    b("steel", 0.02).boxc(0, 5.6, 8.35, 20, 0.12, 0.15)                   # the door track, on brackets from the wall
    for bx in (-9.5, -6.5, -2.0, 2.0, 6.5, 9.5):
        b("steel", 0.0).boxc(bx, 5.6, 8.14, 0.12, 0.1, 0.34)
    for sx in (-7.6, 7.6):                                                   # the leaves' rollers, up to the track
        for k in (-1.4, 1.4):
            b("dark", 0.0).boxc(sx + k, 5.47, 8.32, 0.1, 0.16, 0.06)
    b("barnint", 0.0).boxc(0, 0.04, 0, 25, 0.06, 15.2)
    for k in range(6):                                                       # stall partitions inside, a lantern each
        x = -10 + k * 4
        b("wood", 0.02).boxc(x, 0.8, -4.0, 0.15, 1.6, 7.0)
        b("lamp", 0.0).ball(x + 2, 4.6, -3.0, 0.18, 8, 6)
        b("steel", 0.0).bm((x + 2, 4.75, -3.0), (x + 2, 5.98, -3.0), 0.02, 4)                 # its chain from the loft floor
        b.light((x + 2, 4.3, -2.0), (1.0, 0.75, 0.45), 160, 0.2)
    b("wood2", 0.03).boxc(0, 6.05, 0, 25.0, 0.15, 15.0)
    b.chim((-2.0, 0.05, -1.0), 0.6, 1.5, 7, pen=True)
    # hayloft door and hoist beam on the east gable, cupola with a chimera weathervane, solar strip on the south slope
    b("barn2", 0.03).boxc(13.05, 7.6, 0, 0.2, 2.4, 2.6)
    b("trim", 0.0).boxc(13.17, 7.6, 0, 0.03, 2.6, 0.2).boxc(13.17, 7.6, 0, 0.03, 0.2, 2.8)
    b("wood2", 0.03).boxc(14.0, 10.0, 0, 2.4, 0.3, 0.3)
    b("steel", 0.0).bm((14.9, 9.85, 0), (14.9, 7.5, 0), 0.02, 4)
    b("dark", 0.0).tor(0.1, 0.025, (14.9, 7.42, 0), (PI / 2, 0, 0), n=10, rs=4)   # its hook
    b("trim", 0.04).boxc(0, 12.1, 0, 2.0, 1.6, 2.0)
    b("dark", 0.0).boxc(0, 12.1, 0, 2.05, 1.0, 1.6).boxc(0, 12.1, 0, 1.6, 1.0, 2.05)
    b("roof2", 0.03).add(cylinder(0.0, 1.8, 1.2, 4)[:2], (0, 13.5, 0), (0, PI / 4, 0))
    b("steel", 0.0).bm((0, 14.1, 0), (0, 15.6, 0), 0.03, 4)
    b("dark", 0.0).boxc(0, 15.6, 0, 1.4, 0.5, 0.06).ball(0.75, 15.75, 0, 0.18, 6, 4)
    th = math.atan2(2.0, 6.2)                                               # the upper slope falls 2 m over 6.2 toward +z; +θ
    up = 0.28 / math.cos(th) + 0.06                                          # about x lowers +z: the strip lies on the slab's top
    for k in range(5):
        b("solar", 0.0).boxc(-10 + k * 5, 11.4 - 3.15 * 2.0 / 6.2 + up, 3.15, 4.2, 0.06, 2.6, (th, 0, 0))
    # ---- the office on the west end: hollow, a big window and an open door onto the corral side, the pen terminal
    o = G("A_office", root, BX - 17.0, 0, BZ + 1.5)
    # (east, x = 4.0, is the barn's gable: the office's walls and floor run up to it, its roof stops just short)
    ry = lambda z: 4.8 + (z + 5.9) / 11.8 * 0.8                           # the roof's underside along z
    o("floor", 0.0).boxc(0.1, 0.12, 0, 7.8, 0.24, 11.0)
    o("wood", 0.04).boxc(0.1, ry(-5.5) / 2, -5.3, 7.8, ry(-5.5), 0.4)
    o("wood", 0.04).polyx([(-5.5, 0), (5.5, 0), (5.5, ry(5.5)), (-5.5, ry(-5.5))], -3.8, -3.4)
    o.col_box(-3.6, 2.4, 0, 0.4, 4.8, 11.0)
    HF = ry(5.3)                                                            # the front wall's top
    for x0, x1 in ((-3.8, -2.6), (-0.6, 0.6), (3.0, 4.0)):
        o("wood", 0.04).boxc((x0 + x1) / 2, HF / 2, 5.3, x1 - x0, HF, 0.4)
    o("wood", 0.04).boxc(1.8, 0.5, 5.3, 2.4, 1.0, 0.4).boxc(1.8, (3.9 + HF) / 2, 5.3, 2.4, HF - 3.9, 0.4).boxc(-1.6, (3.9 + HF) / 2, 5.3, 2.0, HF - 3.9, 0.4)
    o("glass", 0.0).boxc(1.8, 2.45, 5.3, 2.4, 2.9, 0.06)
    o("trim", 0.02).boxc(1.8, 1.0, 5.55, 2.6, 0.12, 0.3).boxc(-1.6, 4.0, 5.55, 2.3, 0.15, 0.2)
    slope_box(o, "roof2", (-5.9, 4.8), (5.9, 5.6), -4.3, 3.95, 0.24, 0.05)
    o("lamp", 0.0).ball(-1.6, 4.3, 5.95, 0.15, 8, 6)
    o("dark", 0.0).bm((-1.6, 4.47, 5.5), (-1.6, 4.47, 5.95), 0.035, 5).bm((-1.6, 4.47, 5.95), (-1.6, 4.4, 5.95), 0.035, 5)   # its bracket
    pen_terminal(o, -0.6, -4.3, 0, "pen")
    o.mark("spot", (-0.6, 0.24, -3.0), PI, spot="pen")
    o("dark", 0.02).boxc(2.6, 1.6, -4.9, 1.6, 3.2, 0.7)
    o("wood2", 0.02).boxc(-2.8, 0.9, -1.0, 1.2, 0.08, 3.6)
    o("lamp", 0.0).boxc(-0.6, ry(-2.5) - 0.05, -2.5, 1.8, 0.1, 0.3)       # (under the roof)
    o.light((-0.6, 4.0, -2.0), (1.0, 0.9, 0.7), 450, 0.3)
    o("dark", 0.04).boxc(-1.6, 4.9, 5.56, 3.4, 0.6, 0.12)                  # the sign, on the wall over the door
    o.text("HOLDING PEN", (-1.6, 4.69, 5.63), 0, 0.42, "lime")
    for k in range(3):
        o("dark", 0.0).boxc(-3.38, 3.2, -3.5 + k * 0.6, 0.04, 0.5, 0.4)
        o("lime" if k != 1 else "pink", 0.0).boxc(-3.36, 3.2, -3.5 + k * 0.6, 0.02, 0.35, 0.3)
    CAMS["office"] = ((BX - 17 - 1.9, 2.0, BZ + 1.5 + 9.5), (BX - 17 - 0.6, 1.8, BZ + 1.5 - 4.3), 30)
    # ---- the corral: fences (the barn closes the north side), the gate arch facing the lab, lamps
    N, S_, W_, E_ = BZ + 8.0, 46.0, 50.0, 98.0
    fence_run(r, [(W_, N), (BX - 20.8, N)], lamps=False)
    fence_run(r, [(BX + 13.0, N), (E_, N), (E_, S_), (W_, S_), (W_, 20.0)], lamps=True)
    fence_run(r, [(W_, 12.0), (W_, N)])
    gate_arch(r, W_, 16.0, -PI / 2, 8.0, 6.2, "ZBORNAK RANCH")
    r("dirt", 0.0).boxc((W_ + E_) / 2, 0.025, (N + S_) / 2, E_ - W_, 0.04, S_ - N)
    # the feed line: silo, auger to a roofed feed bunk along the east fence; lick blocks; a second bunk of bales
    silo(r, 93.5, -30.0, 3.2, 14.0, (93.3, 2.2, 0.4))
    r("steel", 0.03).ball(93.3, 2.2, 0.4, 0.34, 10, 7)                                       # the elbow onto the bunk's auger
    feed_bunk(r, 93.0, 8.0, -PI / 2, 15.0)
    for i, (x, z) in enumerate(((90.0, 1.5), (90.5, 12.5), (89.0, 7.2))):
        r.chim((x, 0.04, z), PI / 2 + (i - 1) * 0.3, 1.6, (1, 6, 3)[i], pen=True)
    # water: the stock tank by the gate
    stock_tank(r, 58.0, 36.0, 2.4)
    r.chim((61.5, 0.04, 34.0), -2.2, 1.6, 5, pen=True)
    # training ring, bales, saddle rack, lick posts
    fence_ring(r, 70.0, 26.0, 7.0, 1.4, gap=(-PI / 2, 3.0), step=2.8)
    r("moss", 0.0).cylc(70.0, 0.03, 26.0, 6.8, 0.03, 32)
    r.chim((70.0, 0.04, 26.0), 0.8, 1.6, 0, pen=True)
    for i in range(3):                                                     # bales behind the barn, clear of it and the office
        for j in range(3 - i):
            bale(r, 64.0 + j * 1.5 + i * 0.75, -38.5, 0.0, i * 0.9)
    for i in range(4):
        bale(r, 71.0 + i * 1.5, -38.6 + (i % 2) * 0.3, 1.57, 0, True)
    for k in range(2):
        r("wood2", 0.02).boxc(W_ + 6 + k * 2.6, 0.74, S_ - 0.4, 0.1, 1.48, 0.1)
    r("wood", 0.02).bm((W_ + 6, 1.4, S_ - 0.4), (W_ + 8.6, 1.4, S_ - 0.4), 0.08, 5)
    r("barn2", 0.02).rb(W_ + 7.3, 1.555, S_ - 0.4, 0.45, 0.16, 0.35, 0.4)   # a saddle on the rail, its blanket on it
    r("lime", 0.0).boxc(W_ + 7.3, 1.655, S_ - 0.4, 0.3, 0.06, 0.25)
    for (x, z) in ((80.0, 38.0), (64.0, 10.0)):
        r("wood2", 0.02).cylc(x, 0.6, z, 0.18, 1.2, 8)
        r("stone", 0.02).boxc(x, 1.45, z, 0.6, 0.5, 0.6)
        r("cyan", 0.0).add(cylinder(0.0, 0.18, 0.5, 5)[:2], (x + 0.1, 1.95, z), (0.2, 0, 0.1))
    r.chim((80.0, 0.04, 30.0), 1.9, 1.6, 7, pen=True)
    r.chim((66.0, 0.04, 2.0), -0.6, 1.6, 2, pen=True)
    CAMS["ranch"] = ((40.0, 22.0, 70.0), (78.0, 2.0, 2.0), 30)


def build():
    root = pivot("zbornak_lab", (0, 0, 0), None)
    for L in (CHIMS, STATUES, LIGHTS, TEXTS, ARMS, WELDS):
        L.clear()
    CAMS.clear(); RUNNER.clear()
    build_lab(root)
    flush_all()
    ring_seams()
    return root


GAME[0] = os.environ.get("ZB_GAME") == "1"
ROOT = build()
if DOORS and DOOR_OPEN:                                                     # a door draft posed (lab_doors.py)
    pose_doors(DOOR_OPEN)
print(f"built: {len(C.objects)} objects, {sum(len(o.data.polygons) for o in C.objects if o.type == 'MESH')} faces, {len(CHIMS)} chimeras, "
      f"{len(LIGHTS)} lights, {len(ARMS)} arms")

if os.environ.get("STRUCT_AUDIT") == "1":                                  # does it hold together? (structure_audit.py)
    sys.path.insert(0, os.path.join(REPO, "tools", "blender"))
    from structure_audit import audit_structure
    audit_structure([o for o in C.objects if o.type == "MESH"], skip_slots={"holo", "spark", "pinkhot", "pink", "glassg"},
                    skip=lambda o: any(k in o.name for k in ("core", "ring", "scan", "weld", "zbornak", "inkline")), label="(the lab)")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    zb = next(o for o in C.objects if o.name == "zbornak" and o.type == "EMPTY")
    keep_ = [zb] + list(zb.children_recursive)
    par, loc, rot = zb.parent, zb.location.copy(), zb.rotation_euler.copy()
    zb.parent = None
    zb.location, zb.rotation_euler = (0, 0, 0), (0, 0, 0)
    export(os.path.join(OUTDIR, "zbornak.glb"), keep_)
    zb.parent, zb.location, zb.rotation_euler = par, loc, rot

# For the game (ZB_GAME=1): src/assets/zlab.glb, four roots at the area's origin baked by src/labWorld.js: zl_lab (the rotunda,
# its airlock and everything inside), zl_roof (the dome), zl_out (plaza, walks, pad, containers, outworks), zl_ranch. Pivots
# with a role inside them are what the game moves or reads (labWorld.js): core, ring, arm/turret/shoulder/elbow/wrist/roll,
# weld, plate, door, scan, doctor/head; markers: spot, screen, text, chim; col: colliders (downs_common's form).
if GAME[0] and os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    groups = {"zl_lab": ("lab",), "zl_roof": ("lab_roof",), "zl_out": ("outside",), "zl_ranch": ("A_ranch", "A_barn", "A_office")}
    for rname, kids in groups.items():
        er = pivot(rname, (0, 0, 0), None, role="export")
        for o in list(ROOT.children):
            if o.name in kids:
                o.parent = er
    keep_ = [o for o in C.objects if o is not ROOT]
    export(os.path.join(REPO, "src", "assets", "zlab.glb"), keep_)
