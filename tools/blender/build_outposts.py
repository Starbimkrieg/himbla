# The seven small outposts, built in Blender: exports src/assets/outposts.glb as docs/outpost-glb.md describes (read it
# first: axes, root names, material names, gameplay empties, `anim` nodes, the `ink` property).
#
# Each kind is two roots at the origin, `<kind>` and `<kind>_wreck` (the main building in ruins), built by the outpost kit
# (outpost_kit.py: a port of the game's Kit and the builders' helpers) from the code that drew them before
# (src/outpostDrafts.js, the picks): the same positions, sizes, colours, outlines and random streams, so the gameplay data
# (colliders, blast boxes, raid spot, walkers' routes) matches the code-built one (viewer ?m=outpost&src=both). Colours that
# are the owner's are palette keys (S.body ... S.hut, FAC): the game paints each owner's.
#
# Run it with any Python that has the bpy module (pip install bpy):
#     MOONRUNNER_REPO=<checkout> python tools/blender/build_outposts.py
# or inside Blender:  exec(open(r"<repo>/tools/blender/build_outposts.py").read())
# MOONRUNNER_EXPORT=0 builds the scene without writing the file; OUTPOSTS=tower,mast builds some kinds only.
#
# To add a kind: write build_<kind>(k) below, register it in BUILDERS with its draft letter (src/outpostModels.js
# OUTPOST_PICK, which seeds the random streams), and add it to GLB_KINDS in src/staticContract.js once it audits clean.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_outposts.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "outposts.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Outposts export ->", OUT)
COLL = "MoonOutposts"
SLOT_COLORS = {}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "outpost_kit.py"), encoding="utf-8").read(), globals())

C = coll()


# =====================================================================================================================
# WATCHTOWER: the Lattice Camp. A 39 m steel lattice tower with a switchback stair, a gallery halfway and a hexagonal glazed
# cab with a searchlight riding round it; a 30 m Quonset barracks and a motor-pool Quonset, a helipad, a chain-link fence
# with a guarded gate, sandbagged gun pits. Wreck: the tower fallen across the yard, the barracks burnt to its ribs.
# =====================================================================================================================
def build_tower(k):
    rr = k.rr
    yard(k, 0x8A8698, S.dark)
    # chain-link fence on posts, a gap at the gate
    a, step = 0.24, 3.0 / 37
    while a < TAU - 0.24:
        x, z = polar(37, a)
        x2, z2 = polar(37, a + step)
        k.cyl(0.08, 0.08, 3.2, 5, T(S.dark), x, F, z, ink=0.02)
        k.ball(0.12, T(S.dark), x, F + 3.3, z, ink=0)
        if a + step < TAU - 0.24:
            for y in (0.2, 1.6, 3.0):
                k.beam((x, F + y, z), (x2, F + y, z2), 0.035, T(S.dark), ink=0, seg=3)
            k.add(plane(math.hypot(x2 - x, z2 - z), 2.8), GLASS(0x3A3550, 0.35), (x + x2) / 2, F + 1.6, (z + z2) / 2, ry=math.atan2(x2 - x, z2 - z) + math.pi / 2, ink=0)
            k.solid(math.hypot(x2 - x, z2 - z) / 2, (F + 3.2) / 2, 0.1, (x + x2) / 2, (z + z2) / 2, math.atan2(x2 - x, z2 - z) - math.pi / 2)
        a += step
    checkpoint(k, 0, 37.2, 0, 16)
    # the tower: 39 m of lattice in 15 bays of 2.6 m, a switchback stair up its middle, a gallery halfway, the hexagonal cab
    TX, TZ, H, W0, W1, BAYS = -19, -6, 39, 5.4, 3.2, 15
    BAY = H / BAYS
    hw = lambda y: W0 + (W1 - W0) * (y / H)
    with k.group("main"):
        if not k.wreck:
            for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                k.box(2.4, 0.9, 2.4, T(S.conc), TX + sx * W0, 0, TZ + sz * W0, ink=0.04)
                k.box(1.0, 0.25, 1.0, T(S.dark), TX + sx * W0, 0.9, TZ + sz * W0, ink=0.02)
                k.solid(1.2, 0.575, 1.2, TX + sx * W0, TZ + sz * W0)
            lattice(k, TX, TZ, H, W0, W1, BAYS, T(S.metal), T(S.dark), r=0.3, core=False)
            for i in range(BAYS):  # a box a bay, following the taper (marked: an open truss's top is its braces)
                w = hw(i * BAY) + 0.3
                k.solidQ(w, BAY / 2, w, TX, i * BAY + BAY / 2, TZ, lattice=True)
            # The stair: flights of 13 risers and 3 m going, one a bay, running +x then -x in two lanes, landings at each end
            # level with the braces and tied to them. Drawn, not walked (the tower is one solid core to the runner).
            RUN, LW, Dk, TREAD, RAIL = 3.0, 1.1, T(S.dark), T(0x55607A), T(S.trim)
            for i in range(BAYS):
                y0, y1 = i * BAY, i * BAY + BAY
                d = -1 if i % 2 else 1
                lz = 0.65 if i % 2 else -0.65
                x0, x1, n = -d * RUN / 2, d * RUN / 2, 13
                with k.within(TX, TZ, 0):
                    for e in (-1, 1):
                        k.beam((x0, y0 + (0.08 if i else F), lz + e * LW / 2), (x1, y1, lz + e * LW / 2), 0.06, Dk, ink=0.012, seg=4)  # stringers
                    ys = y0 + (0.08 if i else F)  # (where the stringers start: the first flight's on the apron)
                    for j in range(1, n):
                        t = j / n
                        k.box(RUN / n + 0.04, 0.05, LW, TREAD, x0 + (x1 - x0) * t, ys + (y1 - ys) * t - 0.02, lz, ink=0)
                    oz = lz + math.copysign(1, lz) * LW / 2
                    for t in (0, 0.5, 1):
                        px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                        k.beam((px, py, oz), (px, py + 1.0, oz), 0.025, Dk, ink=0)
                    k.beam((x0, y0 + 1.0, oz), (x1, y1 + 1.0, oz), 0.03, RAIL, ink=0)
                    lx, w = d * (RUN / 2 + 0.6), hw(y1)
                    k.box(1.2, 0.08, LW * 2 + 0.2, TREAD, lx, y1 - 0.08, 0, ink=0.012)
                    for e in (-1, 1):
                        k.beam((lx + d * 0.6, y1 - 0.06, e * LW), (d * w, y1 - 0.06, e * LW), 0.04, Dk, ink=0)
                    k.beam((lx + d * 0.6, y1 + 1.0, -LW), (lx + d * 0.6, y1 + 1.0, LW), 0.03, RAIL, ink=0)
                    for e in (-1, 1):
                        k.beam((lx + d * 0.6, y1, e * LW), (lx + d * 0.6, y1 + 1.0, e * LW), 0.025, Dk, ink=0)
            # the gallery halfway up: a grating round the tower at a brace level, railed in the faction colour
            GY = 7 * BAY
            gw = hw(GY)
            k.box(gw * 2 + 2.2, 0.15, gw * 2 + 2.2, T(S.dark), TX, GY - 0.15, TZ, ink=0.03)
            for sd in (-1, 1):
                k.box(gw * 2 + 2.2, 0.06, 0.06, T(FAC), TX, GY + 1.05, TZ + sd * (gw + 1.08), ink=0)
                k.box(0.06, 0.06, gw * 2 + 2.2, T(FAC), TX + sd * (gw + 1.08), GY + 1.05, TZ, ink=0)
            t = -1.0
            while t <= 1:
                for sd in (-1, 1):
                    k.box(0.05, 1.05, 0.05, T(S.dark), TX + t * (gw + 1.08), GY, TZ + sd * (gw + 1.08), ink=0)
                    k.box(0.05, 1.05, 0.05, T(S.dark), TX + sd * (gw + 1.08), GY, TZ + t * (gw + 1.08), ink=0)
                t += 0.25
            k.solid(gw + 1.1, 0.08, gw + 1.1, TX, TZ, 0, GY - 0.15)
            # the cab, 1.3x: a hexagonal deck on the tower head, glazed walls leaning out, a steel roof, the antenna crown
            with k.within(TX, TZ, 0, 1.3):
                Y = F + (H - F) / 1.3
                k.add(cylinder(6, 6, 0.5, 6), T(S.dark), 0, Y + 0.25, 0, ink=0.06)
                k.add(cylinder(4.4, 4.4, 1.1, 6), T(S.body), 0, Y + 1.05, 0, ink=0.05)
                k.add(cylinder(4.8, 4.3, 2.4, 6, open_ended=True), GLASS(GLASSC, 0.45), 0, Y + 2.8, 0, ink=0.03)
                k.add(cylinder(4.6, 4.1, 2.4, 6), G(S.glow), 0, Y + 2.8, 0, ink=0)  # (the lit room, wall ring to roof)
                for i in range(6):
                    a = i / 6 * TAU
                    k.beam((math.sin(a) * 4.4, Y + 1.6, math.cos(a) * 4.4), (math.sin(a) * 4.85, Y + 4.0, math.cos(a) * 4.85), 0.1, T(S.dark), ink=0.02, seg=4)
                k.add(cylinder(3.0, 6.0, 1.6, 6), T(S.roof), 0, Y + 4.8, 0, ink=0.08)
                k.add(cylinder(6.05, 6.05, 0.2, 6), T(FAC), 0, Y + 4.1, 0, ink=0)
                for i in range(6):  # the rail round the deck: posts on the hexagon's corners, a top rail between
                    a = i / 6 * TAU
                    b2, R6 = a + TAU / 6, 5.75
                    p, q = (math.sin(a) * R6, math.cos(a) * R6), (math.sin(b2) * R6, math.cos(b2) * R6)
                    k.beam((p[0], Y + 1.5, p[1]), (q[0], Y + 1.5, q[1]), 0.05, T(S.trim), ink=0)
                    k.beam((p[0], Y + 0.5, p[1]), (p[0], Y + 1.5, p[1]), 0.04, T(S.dark), ink=0)
                k.column(6, Y + 0.5, 0, 0, Y)
                k.column(4.6, Y + 4.0, 0, 0, Y + 0.5)
                k.column(5.2, Y + 5.0, 0, 0, Y + 4.0)
                k.column(3.0, Y + 5.6, 0, 0, Y + 5.0)
                k.cyl(0.08, 0.12, 6, 5, T(LIGHT), 0, Y + 5.6, 0, ink=0.02)
                k.blinker(0, Y + 11.8, 0, 0xFF2A4A, 0.4)
                k.box(0.3, 2.2, 0.15, T(LIGHT), 1.4, Y + 5.6, 0, ink=0.02)
                # the searchlight rides round the gallery on an arm the game turns
                arm = k.dyn("spin", 0, Y + 0.5, 0, speed=0.35)
                sl = Matrix.Translation((0, 0, 5.2))
                head = sl @ Matrix.Translation((0, 0.9, 0)) @ Matrix.Rotation(0.42, 4, "X")
                rx = Matrix.Rotation(math.pi / 2, 4, "X")
                k.part(arm, cylinder(0.3, 0.45, 0.8, 8), T(S.dark), sl, ink=0.02)
                k.part(arm, cylinder(0.75, 0.55, 1.4, 12), T(LIGHT), head @ rx, ink=0.03)
                k.part(arm, cylinder(0.66, 0.66, 0.06, 12), G(0xFFFBE0), head @ Matrix.Translation((0, 0, 0.72)) @ rx)
                k.part(arm, cone_open(6, 48, 16), BEAM(0xFFF3B0, 0.12), head @ Matrix.Translation((0, 0, 24.7)) @ Matrix.Rotation(-math.pi / 2, 4, "X"))
        else:
            wr = k.wr
            for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                k.box(2.4, 0.9, 2.4, T(S.conc), TX + sx * W0, 0, TZ + sz * W0, ink=0.04)
                k.solid(1.2, 0.45, 1.2, TX + sx * W0, TZ + sz * W0)
                h = 2 + wr() * 6
                k.beam((TX + sx * W0, 0.8, TZ + sz * W0), (TX + sx * (W0 - 0.3), h, TZ + sz * (W0 - 0.3)), 0.3, T(0x3E4352), ink=0.05, seg=6)
                k.column(0.3, h, TX + sx * W0, TZ + sz * W0)
            with k.within(TX, TZ, 0.5):
                # (lying on its side, crushed: the lower legs on the apron, the upper ones fallen onto posts from them)
                lo = lambda sx, z: (sx * (4.6 - 1.8 * (z - 3) / 27), F + 0.3, z)
                hi = lambda sx, z: (sx * (4.6 - 1.8 * (z - 3) / 27), 5.0 - 2.4 * (z - 3) / 27, z)
                for sx in (-1, 1):
                    k.beam(lo(sx, 3), lo(sx, 30), 0.3, T(0x3E4352), ink=0.05, seg=6)
                    k.beam(hi(sx, 3), hi(sx, 30), 0.3, T(0x3E4352), ink=0.05, seg=6)
                    for z in (3.6, 12, 21, 29.4):
                        k.beam(lo(sx, z), hi(sx, z), 0.16, T(DARK), ink=0.03)
                for i in range(10):
                    z = 4 + i * 2.6
                    a, b = lo(-1, z), hi(1, z + 2.6)
                    k.beam(a, b, 0.12, T(DARK))
                cq = euler(1.2, 0, 0.4)
                k.add(cylinder(6.2, 5.6, 3.1, 6), T(S.roof), 0, F + 4.2, 33, q=cq, ink=0.08)  # (the cab, on its side at the end)
                k.solidQ(4.4, 2.6, 13.5, 0, 2.6, 16.5, lattice=True)  # (the fallen truss)
                k.solidQ(5.2, 1.55, 5.2, 0, F + 4.2, 33, cq)
            debris(k, TX, TZ, 6, 6, 14, wr)
    k.hit(W0, H / 2, W0, TX, TZ)
    k.point("smoke", TX, 3, TZ)
    k.point("drop", -4, F, 16)
    # the barracks: a 30 m Quonset (8.2 m radius) along x, windows set into its shell, a porch and the mark on the door end
    QX, QZ, QR, QL = 6, -20, 8.2, 30
    with k.group("main"):
        if not k.wreck:
            quonset(k, QX, QZ, QR, QL, S.hut, math.pi / 2, FAC)
            with k.within(QX, QZ, math.pi / 2):
                wa = 1.0  # windows a radian down from the crown each side, their frames on the shell
                for sd in (-1, 1):
                    t = -QL / 2 + 2.5  # (between the ribs, 3 m apart from 1 m in)
                    while t < QL / 2 - 2:
                        th = math.pi / 2 - wa if sd > 0 else math.pi / 2 + wa
                        wx, wy = sd * (QR + 0.02) * math.sin(wa), 0.4 + (QR + 0.02) * math.cos(wa)
                        k.add(cuboid(0.1, 1.0, 1.7), G(S.glow), wx, wy, t, rz=th, ink=0)
                        k.add(cuboid(0.14, 1.2, 1.9), T(S.dark), wx - sd * 0.03 * math.sin(wa), wy - 0.03 * math.cos(wa), t, rz=th, ink=0.01)
                        t += 3
                k.box(7, 0.3, 3.4, T(S.roof), 0, F + 3.6, QL / 2 + 1.7, ink=0.04)
                for sd in (-1, 1):
                    k.cyl(0.14, 0.14, 3.6, 6, T(S.dark), sd * 3.2, F, QL / 2 + 3.2, ink=0.02)
                    k.column(0.16, F + 3.6, sd * 3.2, QL / 2 + 3.2)
                k.solid(3.5, 0.15, 1.7, 0, QL / 2 + 1.7, 0, F + 3.6)
                emblem(k, 0, F + 6.8, QL / 2 + 0.03, 0, 2.0)
        else:
            ruin(k, QX, QZ, QL, QR * 2, 5, 0, 0x4F5A42, k.wr)
            for i in range(7):  # (ribs still standing from the pad)
                arc = math.pi * (0.3 + k.wr() * 0.5)
                k.add(torus_xy(QR, 0.18, 4, 16, arc), T(0x3A3F30), QX - 12 + i * 4, 0.3, QZ, ry=math.pi / 2, ink=0.03)
    k.hit(QL / 2, QR / 2, QR, QX, QZ)
    # the motor pool: a second Quonset with its door to the yard, a patrol rover out front
    quonset(k, 24, 10, 6, 16, 0x55607A, 0, FAC)
    rover(k, 24, 21.5, 0.1)
    # the helipad
    HPX, HPZ = -18, 16
    k.cyl(7.5, 7.8, 0.1, 32, T(0x5A566A), HPX, F, HPZ, ink=0.04)
    paint_at(k, HPX, HPZ, 6.6, 0.15, S.trim, 0.1)
    for sx in (-1, 1):
        k.box(0.7, 0.006, 4.2, T(S.trim), HPX + sx * 1.3, F + 0.1, HPZ, ink=0)
    k.box(2.0, 0.006, 0.7, T(S.trim), HPX, F + 0.1, HPZ, ink=0)
    for i in range(8):
        x, z = polar(7.3, i / 8 * TAU)
        k.box(0.3, 0.02, 0.3, G(S.trim), HPX + x, F + 0.1, HPZ + z, ink=0)
    # the lens locker at the barracks porch: the raid spot
    PX = QX + QL / 2 + 4.5
    with k.within(PX, QZ - 3.4, math.pi / 2):
        k.box(1.6, 2.1, 0.9, T(S.panel), 0, F, 0, ink=0.05)
        k.box(1.62, 0.25, 0.92, T(FAC), 0, F + 1.6, 0, ink=0)
        k.solid(0.8, (F + 2.1) / 2, 0.45, 0, 0)
        crate(k, 1.6, F, 0.3, 1.0, 0x6F7A5A, 0.2)
    k.raid_at(PX + 1.2, QZ + 0.5, 0xFFD23F)
    gun_pit(k, 4, 24, 0)
    gun_pit(k, -31, -12, -1.3)
    k.stack(-1, -33.2, 2, "owner", math.pi / 2, F)
    k.stack(-10, -33.2, 1, "owner", math.pi / 2, F)
    for x, z in ((31, -8), (-28, 26), (8, 4)):
        lamp_post(k, x, z, 7, S.glow)
    flag_pole(k, -10, 36)
    flag_pole(k, 10, 36)
    # three troopers, each walking its route there and back: along the fence from the gate round the back, between the
    # barracks door and the motor pool, from the gate past the pad
    k.walkers([
        [(-6, 32), (-25, 26), (-33, 4), (-27, -4), (-26, -22), (-15, -29.7), (13, -29.7)],
        [(PX + 1.5, QZ + 4), (PX + 1.5, -1.5), (15, -1.5), (15, 4), (10, 0)],
        [(-3, 30), (-7, 18), (-9, 4), (2, 6), (0, 18)],
    ])


# =====================================================================================================================
# TRADING KIOSK: the Market Cross. A two-storey trading house on the crossing of two paved lanes: counters on all four faces
# under deep canopies, the glazed trading floor above with its price boards, a clock lantern; three corner cafés and a stock
# yard, stall rows along the lanes, the mystery crates (raid loot), a hover-cart. Wreck: the house burnt out, its canopies
# down, the lantern fallen.
# =====================================================================================================================
def build_kiosk(k):
    rr = k.rr
    yard(k, S.conc, S.dark)
    # the cross: two paved lanes, a square in the middle
    paint_strip(k, (0, -R + 1), (0, R - 1), 8, 0xD8D0C0)
    paint_strip(k, (-R + 1, 0), (R - 1, 0), 8, 0xD8D0C0)
    for sd in (-1, 1):
        paint_strip(k, (sd * 4.2, -R + 2), (sd * 4.2, R - 2), 0.2, FAC, 0.002)
        paint_strip(k, (-R + 2, sd * 4.2), (R - 2, sd * 4.2), 0.2, FAC, 0.002)
    k.box(34, 0.12, 34, T(S.panel), 0, F, 0, ink=0.03)
    W, H1, H2, HS = 13, 4.4, 4.0, 1.45  # (the house is drawn at 1x and grown 1.45x: 19 m square, the clock 27 m up)
    GOODS5 = (0xFF4F2E, YEL, 0x7DFF3A, 0xFF7AD9, 0x2EC4FF)
    with k.grow(0, 0, HS):
        with k.group("main"):
            if not k.wreck:
                # ground floor: a solid core with four counters, a canopy each side
                k.box(W - 3, H1, W - 3, T(S.body), 0, F, 0, ink=0.1)
                for i in range(4):
                    with k.within(0, 0, i / 4 * TAU):
                        fz = (W - 3) / 2
                        k.box(7.4, 1.8, 0.1, G(S.glow), 0, F + 1.3, fz + 0.03, ink=0)
                        k.box(8.6, 1.08, 1.0, T(S.body), 0, F, fz + 0.9, ink=0.05)
                        k.box(8.8, 0.1, 1.3, T(WOOD), 0, F + 1.08, fz + 0.9, ink=0.02)
                        k.box(8.6, 0.25, 0.05, T(FAC), 0, F + 0.6, fz + 1.41, ink=0)
                        k.solid(4.4, (F + 1.18) / 2, 0.65, 0, fz + 0.9)
                        # the canopy: a cantilevered slab with a fascia
                        k.box(W + 2, 0.35, 3.6, T(S.roof), 0, F + H1 - 0.1, fz + 1.8, ink=0.06)
                        k.box(W + 2.1, 0.5, 0.12, T(FAC), 0, F + H1 - 0.25, fz + 3.62, ink=0.02)
                        k.solid((W + 2) / 2, 0.18, 1.8, 0, fz + 1.8, 0, F + H1 - 0.1)
                        for j in range(6):  # goods along the counter
                            geo = cuboid(0.4, 0.35, 0.4) if j % 2 else sphere(0.2, 6, 4)
                            k.add(geo, T(GOODS5[math.floor(rr() * 5)]), -3.6 + j * 1.45, F + 1.3, fz + 0.9, ink=0.02)
                k.solid((W - 3) / 2, (F + H1) / 2, (W - 3) / 2, 0, 0)
                # upper floor: the glazed trading floor, price boards on its faces
                Y2 = F + H1 + 0.25
                k.box(W, 0.4, W, T(S.body), 0, Y2 - 0.4, 0, ink=0.06)
                k.box(W - 1, H2, W - 1, GLASS(GLASSC, 0.35), 0, Y2, 0, ink=0)
                k.box(W - 2.2, H2 - 0.2, W - 2.2, T(S.panel), 0, Y2, 0, ink=0)
                for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    k.box(0.5, H2, 0.5, T(S.body), sx * (W - 1) / 2, Y2, sz * (W - 1) / 2, ink=0.03)
                for i in range(4):
                    with k.within(0, 0, i / 4 * TAU):
                        k.box(7.2, 2.0, 0.1, G(0x0D1A2A), 0, Y2 + 0.9, (W - 1) / 2 + 0.06, ink=0)
                        for j in range(5):
                            bw = 1.0 + rr() * 2.4
                            bx = -2.6 + rr() * 2
                            k.box(bw, 0.14, 0.04, G(0x7DFF6A if j % 2 else 0xFF3B5C), bx, Y2 + 1.2 + j * 0.34, (W - 1) / 2 + 0.12, ink=0)
                k.box(W + 0.6, 0.6, W + 0.6, T(S.roof), 0, Y2 + H2, 0, ink=0.08)
                k.box(W + 0.7, 0.2, W + 0.7, T(FAC), 0, Y2 + H2 + 0.6, 0, ink=0)
                k.solid(W / 2 + 0.3, (H2 + 1.2) / 2, W / 2 + 0.3, 0, 0, 0, Y2 - 0.4)
                # the clock lantern on the roof: four faces, a cupola and the ring
                Y3 = Y2 + H2 + 0.6
                k.box(4.4, 4.2, 4.4, T(S.body), 0, Y3, 0, ink=0.06)
                for i in range(4):
                    with k.within(0, 0, i / 4 * TAU):
                        k.add(cylinder(1.5, 1.5, 0.12, 24), G(0xFFF8E0), 0, Y3 + 2.3, 2.23, rx=math.pi / 2, ink=0.02)
                        k.add(torus_xy(1.55, 0.12, 4, 24), T(S.dark), 0, Y3 + 2.3, 2.27, ink=0)
                        k.box(0.1, 1.1, 0.06, T(S.dark), 0, Y3 + 2.75, 2.32, ink=0)
                        k.box(0.8, 0.1, 0.06, T(S.dark), 0.35, Y3 + 2.3, 2.32, ink=0)
                k.add(cylinder(0.0, 3.6, 3.0, 4), T(S.roof), 0, Y3 + 4.2 + 1.5, 0, ry=math.pi / 4, ink=0.06)
                k.add(torus_xy(0.9, 0.12, 6, 20), T(FAC), 0, Y3 + 8.6, 0, ink=0.03)
                k.cyl(0.06, 0.09, 3.2, 6, T(LIGHT), 0, Y3 + 7.0, 0, ink=0.02)
                k.blinker(0, Y3 + 10.4, 0, FAC, 0.3)
                k.solid(2.2, 2.1, 2.2, 0, 0, 0, Y3)
                pyramid_cols(k, 0, 0, Y3 + 4.2, 3.6, 3.0)
            else:
                ruin(k, 0, 0, W - 2, W - 2, 6, 0, S.body, k.wr, roof=S.roof)
                wr = k.wr
                for i in range(4):  # each canopy down, one edge on the paving
                    with k.within(0, 0, i / 4 * TAU):
                        q = euler(0.35, 0, 0.1 * (wr() - 0.5))
                        x = wr() * 2 - 1
                        k.add(cuboid(W + 2, 0.35, 3.6), T(S.roof), x, F + 0.8, (W - 3) / 2 + 2.6, q=q, ink=0.06)
                        k.solidQ((W + 2) / 2, 0.18, 1.8, x, F + 0.8, (W - 3) / 2 + 2.6, q)
                q = euler(1.2, 0, 0.4)  # (the clock lantern, fallen)
                k.add(cuboid(4.4, 4.2, 4.4), T(S.body), 7, F + 2.3, -6, q=q, ink=0.06)
                k.solidQ(2.2, 2.1, 2.2, 7, F + 2.3, -6, q)
                debris(k, 0, 0, 12, 12, 26, wr)
        k.hit(W / 2, 3, W / 2, 0, 0)
    k.point("smoke", 0, 4, 0)
    k.point("drop", 0, F, 20)
    # corner cafés: an open pavilion with a pyramid roof over tables, trees by it; the back-right corner is the stock yard
    for qx, qz in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        cx, cz = qx * 20, qz * 20
        if qx > 0 and qz < 0:
            k.stack(cx + 3, cz - 2, 2, ["meridian"], math.pi / 2, F)
            k.stack(cx - 6, cz - 4, 1, ["meridian"], math.pi / 2 + 0.1, F)
            k.stack(cx + 3, cz + 7, 1, ["meridian"], 0.3, F)
            continue
        with k.grow(cx, cz, 1.25):  # (each café grown 1.25x: 11.5 m square, 4.5 m to the eaves)
            P, PH = 4.6, 3.6
            for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                k.cyl(0.2, 0.24, PH, 8, T(S.body), cx + sx * P, F, cz + sz * P, ink=0.03)
                k.column(0.24, F + PH, cx + sx * P, cz + sz * P)
            k.box(P * 2 + 1, 0.3, P * 2 + 1, T(S.body), cx, F + PH, cz, ink=0.05)
            k.add(cylinder(0.0, P * 1.62, 2.4, 4), T(FAC if qx * qz > 0 else 0xFF5C8A), cx, F + PH + 0.3 + 1.2, cz, ry=math.pi / 4, ink=0.06)
            k.solid(P + 0.5, 0.15, P + 0.5, cx, cz, 0, F + PH)
            pyramid_cols(k, cx, cz, F + PH + 0.3, P * 1.62, 2.4)
            for tx, tz in ((-2.2, -2.2), (2.2, -2.2), (-2.2, 2.2), (2.2, 2.2)):
                k.cyl(0.6, 0.6, 0.06, 14, T(LIGHT), cx + tx, F + 0.72, cz + tz, ink=0.02)
                k.cyl(0.08, 0.08, 0.72, 6, T(DARK), cx + tx, F, cz + tz, ink=0)
                k.column(0.6, F + 0.78, cx + tx, cz + tz)
                for j in range(2):
                    a = j * math.pi + 0.4
                    k.cyl(0.22, 0.2, 0.46, 8, T(DARK), cx + tx + math.sin(a) * 1.0, F, cz + tz + math.cos(a) * 1.0, ink=0.02)
            for sx, sz in ((qx, -qz), (-qx, qz)):  # (out by the lanes and the rim, clear of the walk round the house)
                tree(k, cx + sx * (P + 2.4), cz + sz * (P + 2.4), 0.95)
    # stall rows along the lanes: awning stalls facing the lane, two each side
    for i in range(4):
        a = i / 4 * TAU
        for sd in (-1, 1):
            for r2 in (27, 34):
                if i == 1 and sd < 0:
                    continue  # (keeps the stock yard's corner open)
                with k.within(0, 0, a):
                    stall(k, sd * 7.6, r2, -math.pi / 2 if sd > 0 else math.pi / 2, (FAC, 0xFF5C8A, YEL, 0x7DFF3A)[(i + (1 if r2 > 30 else 0)) % 4], rr)
    # lamps along the lanes, past the canopies
    for i in range(4):
        for sd in (-1, 1):
            with k.within(0, 0, i / 4 * TAU):
                lamp_post(k, sd * 5.3, 19.5, 5.5, S.glow)
    mystery_crates(k, 18, -17.5, -0.6)
    k.raid_at(15.6, -15.4, 0xFF2E88)
    flag_pole(k, -6.5, 37.4)
    flag_pole(k, 6.5, 37.4)
    hover_cart(k, 24, 30, 2.5, rr)
    # three traders: round the house under its canopies and out along the lanes
    k.walkers([
        [(0, 36), (0, 11.5), (11.5, 11.5), (11.5, -11.5), (-11.5, -11.5), (-11.5, 11.5), (-1, 11.5)],
        [(-35, 0), (-11.5, 0), (-11.5, -11.5), (11.5, -11.5), (11.5, 0), (35, 0)],
        [(0, -35), (0, -11.5), (-11.5, -11.5), (-11.5, 11.5), (-2, 22)],
    ])


# =====================================================================================================================
# SUPPLY DEPOT: the Silo Depot. Three 16 m bulk silos on stilts with a catwalk across their tops and a stair tower, a chute
# over the weighbridge and the hauler under it, a long Quonset store, a container wall round the back, the weigh house, the
# wiring rack (raid), a bunded tank pair. Wreck: the silos burst to stubs, one down on its side.
# =====================================================================================================================
def build_depot(k):
    rr = k.rr
    yard(k, 0x8A8698, S.dark)
    paint_strip(k, (0, 38), (0, -4), 7, 0x6F6B7E)
    SIL, SR, SH = ((-12, -14), (-3, -20), (6, -14)), 4.2, 16
    # the silo complex, the weighbridge and the hauler drawn at 1x and grown 1.3x about (-3, -12)
    with k.grow(-3, -12, 1.3):
        with k.group("main"):
            if not k.wreck:
                for x, z in SIL:
                    k.cyl(SR + 0.6, SR + 0.8, 0.6, 24, T(S.conc), x, 0, z, ink=0.04)
                    for i in range(6):
                        px, pz = polar(SR - 0.3, i / 6 * TAU)
                        k.cyl(0.25, 0.3, 3, 6, T(S.dark), x + px, F, z + pz, ink=0.03)
                    k.cyl(SR, SR, SH - 3, 24, T(S.body), x, F + 3, z, ink=0.12)
                    k.add(cylinder(0.0, SR, 2.6, 24), T(S.panel), x, F + 3 - 1.3 + 0.01, z, rx=math.pi, ink=0.06)
                    y = 5
                    while y < SH:
                        k.ring(SR + 0.03, 0.08, T(S.panel), x, F + y, z)
                        y += 3
                    k.ring(SR + 0.06, 0.5, T(FAC), x, F + SH - 3, z)
                    k.add(cylinder(0.0, SR + 0.2, 2.4, 24), T(S.roof), x, F + SH + 1.2, z, ink=0.08)
                    k.cyl(0.6, 0.6, 0.8, 10, T(S.dark), x, F + SH + 2.2, z, ink=0.03)
                    k.cyl(0.4, 0.5, 2.2, 8, T(DARK), x, F, z, ink=0.03)
                    k.column(SR, F + SH, x, z)
                    for j in range(4):  # (the roof cone, stepped)
                        k.column((SR + 0.2) * (1 - (j + 1) * 0.55 / 2.4), F + SH + (j + 1) * 0.55, x, z, F + SH + j * 0.55)
                    k.column(0.6, F + SH + 3.0, x, z, F + SH + 2.2)  # (the vent cap)
                # the catwalk joining the tops, a stair tower at the east end
                for i in range(len(SIL) - 1):
                    (ax, az), (bx, bz) = SIL[i], SIL[i + 1]
                    k.strip((ax, az), (bx, bz), 1.6, 0.2, T(S.dark), F + SH + 1.6)
                    # handrails each side on posts from the deck, stopped where the walk enters the roof cones
                    ln = math.hypot(bx - ax, bz - az)
                    ux, uz = (bx - ax) / ln, (bz - az) / ln
                    t0, t1 = 1.6, ln - 1.6
                    n = max(2, math.ceil((t1 - t0) / 2.2) + 1)
                    for sd in (-1, 1):
                        ox, oz = uz * sd * 0.75, -ux * sd * 0.75
                        k.beam((ax + ux * t0 + ox, F + SH + 2.7, az + uz * t0 + oz), (ax + ux * t1 + ox, F + SH + 2.7, az + uz * t1 + oz), 0.05, T(S.trim), ink=0.01)
                        for j in range(n):
                            t = t0 + (t1 - t0) * j / (n - 1)
                            k.beam((ax + ux * t + ox, F + SH + 1.8, az + uz * t + oz), (ax + ux * t + ox, F + SH + 2.7, az + uz * t + oz), 0.04, T(S.dark), ink=0.01)
                lx, lz = 12.5, -14
                k.box(3.6, SH + 2, 3.6, GLASS(0x3A3550, 0.25), lx, F, lz, ink=0)
                for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    k.box(0.25, SH + 2, 0.25, T(S.trim), lx + sx * 1.8, F, lz + sz * 1.8, ink=0.02)
                y = 3
                while y < SH + 2:
                    k.box(3.6, 0.2, 3.6, T(S.dark), lx, F + y, lz, ink=0.02)
                    y += 3
                k.box(4.2, 0.4, 4.2, T(S.roof), lx, F + SH + 2, lz, ink=0.04)
                k.strip((6, -14), (lx, lz), 1.6, 0.2, T(S.dark), F + SH + 1.6)
                k.solid(1.9, (SH + 2.4) / 2, 1.9, lx, lz, 0, F)
                # the load-out: a chute from the middle silo over the truck lane
                k.beam((-3, F + 4.2, -16), (-3, F + 6.5, -8), 0.6, T(S.panel), ink=0.04)
                k.box(3, 2.4, 3, T(S.dark), -3, F + 5.4, -7.5, ink=0.04)
                k.solidQ(0.6, 0.6, 4.2, -3, F + 5.35, -12, euler(-math.atan2(2.3, 8), 0, 0))  # (the chute)
                k.solid(1.5, 1.2, 1.5, -3, -7.5, 0, F + 5.4)  # (its hopper; the hauler drives under it)
                emblem(k, -3, F + 11, -20 + SR, 0, 2.2)
            else:
                wr = k.wr
                for x, z in SIL:
                    h = 3 + wr() * 6
                    k.cyl(SR + 0.6, SR + 0.8, 0.6, 24, T(S.conc), x, 0, z, ink=0.04)
                    k.cyl(SR, SR, h, 24, T(CHAR if wr() < 0.5 else S.body), x, F, z, ink=0.1)
                    for i in range(6):  # (torn wall standing up off the stub)
                        a = i / 6 * TAU + wr()
                        sh = 2 + wr() * 3
                        q = euler(0.3 * (wr() - 0.5), a + math.pi / 2, 0)
                        px, pz = x + math.sin(a) * (SR - 0.3), z + math.cos(a) * (SR - 0.3)
                        k.add(cuboid(2, sh, 0.2), T(S.body), px, F + h + sh / 2 - 0.1, pz, q=q, ink=0.04)
                        k.solidQ(1, sh / 2, 0.15, px, F + h + sh / 2 - 0.1, pz, q)
                    k.column(SR, F + h, x, z)
                with k.within(6, -14, 0.9):  # (a silo down on its side)
                    k.add(cylinder(SR, SR, 11, 24), T(S.body), 0, F + SR - 0.3, 9, rx=math.pi / 2, ink=0.1)
                    k.add(cylinder(0.0, SR + 0.2, 2.4, 24), T(S.roof), 0, F + SR - 0.3, 15.7, rx=math.pi / 2, ink=0.08)
                    k.hcyl(SR, 11, 0, 9, 0, F + SR - 0.3)
                    k.hcyl(SR * 0.6, 2.4, 0, 15.7, 0, F + SR - 0.3)
                debris(k, -3, -14, 12, 6, 20, wr)
        for x, z in SIL:
            k.hit(SR, SH / 2, SR, x, z)
    k.point("smoke", -3, 3, -18)
    k.point("drop", -12, F, 16)
    # the store: a long Quonset on the right, doors to the yard
    quonset(k, 25, 2, 7.6, 26, S.panel, 0, FAC)
    k.hit(8, 3.8, 13, 25, 2)
    # the container wall along the back and left
    for i in range(7):
        a = math.pi + 0.9 - i * 0.3
        x, z = polar(33, a)
        k.stack(x, z, 1 + (1 if i % 3 == 1 else 0), "owner", a + math.pi / 2, F)
    # the weighbridge and the truck under the chute
    k.box(5, 0.12, 12, T(0x55607A), -3, F, -4, ink=0.03)
    for i in range(6):
        k.box(5, 0.006, 0.3, T(YEL), -3, F + 0.12, -9.5 + i * 2.2, ink=0)
    hauler(k, -3, -5, 0)
    # weigh house and the wiring rack (raid)
    with k.within(-12, 6, math.pi / 2, 1.35):
        k.box(4, 3.0, 3.4, T(S.body), 0, F, 0, ink=0.07)
        k.box(2.6, 1.1, 0.1, G(S.glow), 0, F + 1.4, 1.71, ink=0)
        k.box(4.4, 0.35, 3.8, T(S.roof), 0, F + 3.0, 0, ink=0.04)
        k.solid(2, (F + 3.35) / 2, 1.7, 0, 0)
    with k.within(-16, 12, 0.6, 1.3):
        k.box(3.2, 2.4, 0.9, T(S.dark), 0, F, 0, ink=0.05)
        for i in range(4):
            k.add(torus_xy(0.35, 0.12, 6, 12), T((0xFF4F2E, YEL, 0x2EC4FF, 0x7DFF3A)[i]), -1.1 + i * 0.75, F + 1.6, 0.5, ink=0.02)
        k.solid(1.6, (F + 2.4) / 2, 0.45, 0, 0)
    k.raid_at(-14.2, 14.8, 0xFFD23F)
    bund(k, -25, 22, 12, 10, 0)
    tank(k, -28, 21, 2.6, 5.5, S.body, FAC)
    tank(k, -22, 21, 2.6, 5.5, S.body, FAC)
    for x, z in ((-31, 8), (12, 14), (33, -16), (-10, 31)):
        lamp_post(k, x, z, 8, S.glow)
    flag_pole(k, -8, 37)
    flag_pole(k, 8, 37)
    # three loaders: gate to the weigh house and the bridge, round the west of the silos, the store's door to the gate
    k.walkers([
        [(0, 34), (0, 16), (-7, 12), (-7, 2)],
        [(-30, 4), (-26, -6), (-22, -17)],
        [(25, 18), (25, 24), (8, 30), (3, 34)],
    ])


# =====================================================================================================================
# FARM DOME: the Greenhouse Row. Three 28 m glass barrel vaults over crop beds, a gambrel-roofed packing barn closing their
# back ends, a grain silo with its chute into the barn, compost bins, water tanks, a solar row, the sapling cart (raid).
# Wreck: the vaults shattered to their hoops, the barn burnt out.
# =====================================================================================================================
def build_farm(k):
    rr = k.rr
    jmod = math.fmod  # (JS % keeps the sign)
    yard(k, 0xB0A088, 0x7A6C5C)
    L, GR, GX, GZ = 28, 4.6, (-12, 0, 12), -4
    # the greenhouses, the barn, the silo and the sapling cart drawn at 1x and grown 1.3x about (0, -8)
    with k.grow(0, -8, 1.3):
        for gx in GX:
            with k.within(gx, GZ, 0):
                k.box(GR * 2 + 0.8, 0.6, L + 0.6, T(S.conc), 0, 0, 0, ink=0.05)
                with k.group("main"):
                    if k.wreck:
                        wr = k.wr
                        k.box(GR * 2, 0.06, L, T(CHAR), 0, 0.6, 0, ink=0)
                        t = -L / 2
                        while t <= L / 2 + 0.01:  # (hoops still standing from the pad)
                            if wr() < 0.6:
                                k.add(torus_xy(GR, 0.14, 4, 14, math.pi * (0.3 + wr() * 0.6)), T(0xF3EEE4), 0, 0.6, t, ink=0.02)
                            t += 3.5
                        for i in range(10):
                            x = (wr() - 0.5) * GR * 2
                            z = (wr() - 0.5) * L
                            ry = wr() * 3
                            rx = wr() * 0.4
                            k.add(cuboid(1.4, 0.06, 1.2), GLASS(0x8DFFB0, 0.5), x, 0.7, z, rx=rx, ry=ry, ink=0)
                        k.solid(GR, 0.4, L / 2, 0, 0)
                    else:
                        # the glass vault over the beds (pi/2 to 3 pi/2 turned up about x: the arch stands over the pad)
                        k.add(cylinder_arc(GR, GR, L, 20, math.pi / 2, math.pi), GLASS(0x8DFFB0, 0.25), 0, 0.6, 0, rx=math.pi / 2, ink=0)
                        t = -L / 2
                        while t <= L / 2 + 0.01:
                            k.add(torus_xy(GR + 0.02, 0.12, 4, 18, math.pi), T(0xF3EEE4), 0, 0.6, t, ink=0.02)
                            t += 3.5
                        k.box(0.25, 0.25, L, T(0xF3EEE4), 0, 0.6 + GR - 0.05, 0, ink=0.02)
                        for sd in (-1, 1):
                            k.box(2.4, 0.7, L - 2, T(0x6B4A2A), sd * 2.0, 0.6, 0, ink=0.02)
                            t = -L / 2 + 2
                            while t < L / 2 - 1.5:
                                k.ball(0.5, T(0x7DFF6A if jmod(t * 7, 3) > 1.5 else 0x3AD15A), sd * 2.0 + (0.5 if jmod(t, 2.8) > 1.4 else -0.5), 1.7, t, ink=0)
                                t += 1.4
                        k.box(0.3, 0.15, L - 2, G(0xD8A0FF), 0, 0.6 + GR - 0.6, 0, ink=0)  # grow lights, hung from the ridge
                        t = -L / 2 + 2
                        while t < L / 2 - 1:
                            k.beam((0, 0.6 + GR - 0.46, t), (0, 0.6 + GR - 0.04, t), 0.025, T(DARK), ink=0)
                            t += 4
                        k.add(circle_xy(GR, 18, 0, math.pi), GLASS(0x8DFFB0, 0.25), 0, 0.6, L / 2, ink=0)
                        k.box(1.6, 2.6, 0.1, T(0xF3EEE4), 0, 0.6, L / 2 + 0.02, ink=0.02)
                        k.solid(GR, 0.3, L / 2, 0, 0)
                        k.hcyl(GR, L, 0, 0, 0, 0.6)
        # the packing barn across the back ends: gambrel roof, big door, hayloft lamp
        BZ, BW, BD, BH = GZ - L / 2 - 5, 28, 9, 4.5
        with k.group("main"):
            if not k.wreck:
                with k.within(0, BZ, 0):
                    k.box(BW + 0.6, 0.4, BD + 0.6, T(S.conc), 0, 0, 0, ink=0.04)
                    k.box(BW, BH, BD, T(0xB5452A), 0, F, 0, ink=0.12)
                    for i in range(-6, 7):
                        k.box(0.12, BH, BD + 0.08, T(0x9A3A22), i * 2, F, 0, ink=0)
                    # gambrel: a steep lower pitch and a shallow upper pitch each side, gables filled
                    lw, lh, uh, half_w = 2.0, 2.6, 1.6, BD / 2 + 0.3
                    for sd in (-1, 1):
                        ang1, ang2 = math.atan2(lh, lw), math.atan2(uh, half_w - lw)
                        k.add(cuboid(BW + 0.8, 0.3, math.hypot(lw, lh) + 0.2), T(S.roof), 0, F + BH + lh / 2, sd * (half_w - lw / 2), rx=sd * ang1, ink=0.06)
                        k.add(cuboid(BW + 0.8, 0.3, math.hypot(half_w - lw, uh) + 0.3), T(S.roof), 0, F + BH + lh + uh / 2, sd * (half_w - lw) / 2, rx=sd * ang2, ink=0.06)
                        k.solidQ(BW / 2 + 0.4, 0.15, (math.hypot(lw, lh) + 0.2) / 2, 0, F + BH + lh / 2, sd * (half_w - lw / 2), euler(sd * ang1, 0, 0))
                        k.solidQ(BW / 2 + 0.4, 0.15, (math.hypot(half_w - lw, uh) + 0.3) / 2, 0, F + BH + lh + uh / 2, sd * (half_w - lw) / 2, euler(sd * ang2, 0, 0))
                    gable = [(half_w - 0.3, 0), (half_w - lw, lh), (0, lh + uh - 0.15), (-(half_w - lw), lh), (-half_w + 0.3, 0)]  # (counter-clockwise)
                    for sx in (-1, 1):
                        k.add(extrude_xy(gable, 0.2), T(0xB5452A), sx * BW / 2 - (0.2 if sx > 0 else 0), F + BH, 0, ry=math.pi / 2, ink=0.06)
                    k.box(6, 4, 0.15, T(0xF3EEE4), 0, F, BD / 2 + 0.02, ink=0.03)
                    k.beam((-3, F, BD / 2 + 0.12), (3, F + 4, BD / 2 + 0.12), 0.08, T(0xF3EEE4), ink=0)
                    k.beam((3, F, BD / 2 + 0.12), (-3, F + 4, BD / 2 + 0.12), 0.08, T(0xF3EEE4), ink=0)
                    k.box(2.0, 0.35, 0.1, G(WARM), 0, F + 4.08, BD / 2 + 0.05, ink=0)  # (the lamp over the door, on the wall)
                    emblem(k, -8, F + 2.8, BD / 2 + 0.01, 0, 1.4)
                    k.solid(BW / 2, (F + BH) / 2, BD / 2, 0, 0)
            else:
                ruin(k, 0, BZ, BW, BD, BH, 0, 0xB5452A, k.wr, roof=S.roof)
        k.hit(BW / 2, BH / 2, BD / 2, 0, BZ)
        for gx in GX:
            k.hit(GR, GR / 2, L / 2, gx, GZ)
        # grain silo by the barn's east end, its chute into a hatch on the barn roof
        with k.within(19, BZ + 2, 0):
            k.cyl(3.2, 3.4, 0.5, 20, T(S.conc), 0, 0, 0, ink=0.04)
            k.cyl(3.0, 3.0, 13, 20, T(0xD8D4E8), 0, F, 0, ink=0.1)
            y = 2
            while y < 13:
                k.ring(3.03, 0.08, T(0xA8A4B4), 0, F + y, 0)
                y += 2.2
            k.add(sphere(3.0, 20, 6, math.pi / 2), T(FAC), 0, F + 13, 0, ink=0.08)
            if not k.wreck:  # (its chute into a hatch on the barn roof: gone with the barn)
                with k.group("main"):
                    k.beam((-2.6, F + 11, 0), (-5.5, F + 8.1, 0), 0.3, T(S.panel), ink=0.03)
                    k.box(1.2, 0.5, 1.2, T(S.panel), -5.5, F + 7.6, 0, ink=0.03)
            k.column(3.0, F + 14, 0, 0)  # (the shaft and the dome, stepped)
            k.column(2.2, F + 15, 0, 0, F + 14)
            k.column(1.2, F + 15.8, 0, 0, F + 15)
        if k.wreck:
            k.hit(3, 7, 3, 19, BZ + 2)
        # the sapling cart at the middle greenhouse's door: the raid spot
        for x, z, ry in ((3, GZ + L / 2 + 2.4, 0.2), (4.3, GZ + L / 2 + 2.0, -0.3)):
            crate(k, x, F, z, 1.0, 0x9A6A3A, ry)
            k.add(cylinder(0.0, 0.35, 0.9, 5), T(0x5FBF4A), x, F + 1.45, z, ink=0.02)
            k.column(0.2, F + 1.9, x, z, F + 1.0)
        k.raid_at(1, GZ + L / 2 + 4.2, 0x7DFF3A)
    k.point("smoke", 0, 3, -27)
    k.point("drop", -22, F, 22)
    # compost bins on the west side, water tanks on the east with a pipe to the near vault
    for i in range(3):
        with k.within(-33, -5 + i * 4, math.pi / 2):
            k.box(3.2, 1.4, 3.2, T(WOOD), 0, F, 0, ink=0.04)
            k.box(3.0, 0.2, 3.0, T(0x4A3A2A), 0, F + 1.25, 0, ink=0)
            k.solid(1.6, (F + 1.4) / 2, 1.6, 0, 0)
    tank(k, 29, 12, 2.4, 5, 0xD8D4E8, FAC)
    tank(k, 29, 19, 2.0, 4, 0x7DD87A, FAC)
    pipe_run(k, ((26.6, 12), (21.5, 12)), 1.0)
    solar_rows(k, -18.5, 26.5, 2, 4)
    for x, z in ((-27, 16), (11, 24), (-31, -16), (31, -6)):
        lamp_post(k, x, z, 6, S.glow)
    flag_pole(k, -8.5, 37)
    flag_pole(k, 8.5, 37)
    # three farmhands: gate to the vaults' doors, up the gap between two vaults to the barn, down the east side by the tanks
    k.walkers([
        [(0, 36), (0, 21), (-8, 20), (-15, 21)],
        [(7.8, 19), (7.8, -18)],
        [(18, 30), (24, 22), (24.2, 0), (27, -12)],
    ])


BUILDERS = {"tower": ("b", build_tower), "kiosk": ("b", build_kiosk), "depot": ("b", build_depot), "farm": ("b", build_farm)}  # kind -> (draft letter, build(k))


def share_yard(kind):
    """The yard is the same in the wreck: its meshes use the intact root's (one copy in the file)."""
    n = 0
    for o in list(C.objects):
        if o.type != "MESH" or not o.name.startswith(f"{kind}_yard_") or not o.name.endswith("_wreck"):
            continue
        twin = C.objects.get(o.name[: -len("_wreck")])
        if not twin or twin.type != "MESH" or len(twin.data.vertices) != len(o.data.vertices):
            continue
        a, b = [0.0] * (3 * len(o.data.vertices)), [0.0] * (3 * len(o.data.vertices))
        o.data.vertices.foreach_get("co", a)
        twin.data.vertices.foreach_get("co", b)
        if max((abs(x - y) for x, y in zip(a, b)), default=0) < 1e-6:
            old = o.data
            o.data = twin.data
            bpy.data.meshes.remove(old)
            n += 1
    return n


only = [s for s in os.environ.get("OUTPOSTS", "").split(",") if s]
for _kind, (_draft, _build) in BUILDERS.items():
    if only and _kind not in only:
        continue
    for _wreck in (False, True):
        _root = pivot(f"{_kind}_wreck" if _wreck else _kind, (0, 0, 0), None)
        _k = Kit(_kind, _root, KIND_SEED[_kind] * 977 + DRAFT_SALT[_draft], _wreck)
        _build(_k)
        _k.finish()
    print(_kind, "yard meshes shared with the wreck:", share_yard(_kind))
make_materials()
_clash = [o.name for o in C.objects if o.name[-4:-3] == "." and o.name[-3:].isdigit()]
assert not _clash, f"object names must be unique across the file, Blender renamed {_clash[:3]}"
print("built", len(C.objects), "objects:", sum(o.type == "MESH" for o in C.objects), "meshes,", sum(o.type == "EMPTY" for o in C.objects), "empties")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
