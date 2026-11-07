# The ILMB's quarters (Draft A of docs/ilmb-layouts.md, src/ilmbLayout.js): the pieces that stand in the band between the
# inner ring road and the wall. exec()'d by build_ilmb.py after its own pieces, into the same file (ilmb.glb), with the same
# helpers and slots. Each piece is in its own frame: origin on the ground in the middle of its footprint, +z its front (the
# side its doors face); src/ilmbCore.js buildIlmbQuarters stands it where the layout says.
#
#   ilmb_terminal_pax   the passenger terminal: a glazed hall, the drop-off canopy toward the loop (+z), gate doors to the
#                       bus pads behind (-z), departure boards, seats and check-in desks inside
#   ilmb_cargo_shed     the freight shed: a portal-framed shed, three roller doors, a loading dock
#   ilmb_motorpool      the motor pool (the repair bay rebuilt): three bays behind open roller doors, a lift in each (two-post,
#                       four-post, scissor; the game stands its vehicles on them), tool walls, roll cabinets, workbenches, a tyre
#                       rack, a parts cage, a compressor and hose reels, an office on a mezzanine, the bridge crane
#   ilmb_fuel_island    a canopy over two fuel and charge dispensers
#   ilmb_tank           a vertical propellant tank on its ring footing, ladder cage, top railing
#   ilmb_pump_house     the tank farm's pump house, its manifold out front
#   ilmb_pipe_bridge    the pipe run from the tank farm (-z) to the Power Block (+z), over the ring road on two trestles
#   ilmb_shop_*         shop units 10 m wide (canteen, suits, parts, noodle, clinic): a module, its glazed front, an awning,
#                       the fascia board the game writes the name on (SHOP_SIGN)
#   ilmb_house_a/b/c    houses 10 m wide: a stacked two-storey hab, a pair of lying hab drums, a tower and a wing

SHOP_SIGN = (0.0, 4.75, 2.62, 6.4)      # fascia board: x, y, z of its face, width (src/ilmbCore.js writes the name there)


def bx(x0, y0, z0, x1, y1, z1):
    """a box from its extents"""
    return box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0)


def colbx(x0, y0, z0, x1, y1, z1, yaw=0.0):
    col(((x0 + x1) / 2, y0, (z0 + z1) / 2), shape="box", hx=(x1 - x0) / 2, hy=(y1 - y0) / 2, hz=(z1 - z0) / 2, yaw=yaw)


def slope_col(x, w, z_lo, y_lo, z_hi, y_hi, thick=0.4):
    """a ramp, flight or sloped roof's collider along z: its top face from (z_lo, y_lo) up to (z_hi, y_hi), `thick` deep under
    that face (+pitch lowers the box's +z end; the pivot is the box's centre less its hy, as col() wants)"""
    run, rise = z_hi - z_lo, y_hi - y_lo
    L = math.hypot(run, rise)
    pitch = math.atan2(rise, -run) if run < 0 else -math.atan2(rise, run)
    cy = (y_lo + y_hi) / 2 - math.cos(pitch) * thick / 2
    cz = (z_lo + z_hi) / 2 - math.sin(pitch) * thick / 2
    col((x, cy - thick / 2, cz), shape="box", hx=w / 2, hy=thick / 2, hz=L / 2, yaw=0.0, pitch=pitch)


def flight(x, w, z_lo, z_hi, y0, top, tread="steel", rail="gold"):
    """a straight flight of steps along z from the floor (y0 at z_lo) up to `top` at z_hi, stringers, handrails both sides"""
    n = max(2, int(round((top - y0) / 0.24)))
    rise, run = (top - y0) / n, (z_hi - z_lo) / n
    for i in range(n):
        y = y0 + rise * (i + 1)
        z = z_lo + run * (i + 0.5)
        Acc.of(tread, 0.01).put(box(x, y - 0.04, z, w, 0.08, abs(run) + 0.04))
    for sd in (-1, 1):
        xs = x + sd * (w / 2 + 0.06)
        Acc.of("dark", 0.02).put(B((xs, y0, z_lo), (xs, top, z_hi), 0.07, 4, True))
        Acc.of(rail, 0.0).put(B((xs, y0 + 1.0, z_lo), (xs, top + 1.0, z_hi), 0.04, 4, True))
        for t in (0.0, 0.5, 1.0):
            zz, yy = z_lo + (z_hi - z_lo) * t, y0 + (top - y0) * t
            Acc.of("steel", 0.0).put(B((xs, yy, zz), (xs, yy + 1.0, zz), 0.035, 4, True))
    slope_col(x, w + 0.2, z_lo, y0, z_hi, top)


def sloped_box(x0, x1, z0, z1, y0, ytop):
    """a block from y0 up to a top that slopes along z (ytop(z)): the band that closes a wall up to a sloping roof"""
    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1),
             (x0, ytop(z0), z0), (x1, ytop(z0), z0), (x1, ytop(z1), z1), (x0, ytop(z1), z1)]
    return verts, [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]


def roll_cabinet(x, z, yaw, colr="red"):
    """a roll cabinet: drawers, a steel top, casters"""
    M = lambda g: xf(g, (x, 0, z), (0, yaw, 0))
    Acc.of(colr, 0.02).put(M(box(0, 0.65, 0, 1.4, 1.0, 0.6)))
    Acc.of("steel", 0.0).put(M(box(0, 1.17, 0, 1.44, 0.04, 0.64)))
    for k in range(5):
        Acc.of("dark", 0.0).put(M(box(0, 0.32 + k * 0.19, 0.302, 1.3, 0.025, 0.006)))
    for sx in (-0.6, 0.6):
        for sz in (-0.22, 0.22):
            Acc.of("dark", 0.0).put(M(cyl(sx, 0.07, sz, 0.07, 0.14, 6)))
    c, s = math.cos(yaw), math.sin(yaw)
    col((x, 0, z), shape="box", hx=0.72, hy=0.6, hz=0.32, yaw=yaw)


def workbench(x, z, yaw, w=2.4):
    """a steel workbench with a vice and a shelf under it"""
    M = lambda g: xf(g, (x, 0, z), (0, yaw, 0))
    Acc.of("steel", 0.02).put(M(box(0, 0.92, 0, w, 0.06, 0.9)))
    Acc.of("panel", 0.0).put(M(box(0, 0.3, 0, w - 0.1, 0.04, 0.8)))
    for sx in (-w / 2 + 0.06, w / 2 - 0.06):
        for sz in (-0.38, 0.38):
            Acc.of("dark", 0.0).put(M(box(sx, 0.45, sz, 0.06, 0.9, 0.06)))
    Acc.of("dark", 0.01).put(M(box(w / 2 - 0.4, 1.06, 0.3, 0.3, 0.22, 0.2)))
    Acc.of("blue", 0.0).put(M(box(-w / 4, 1.0, -0.1, 0.5, 0.1, 0.3)))
    col((x, 0, z), shape="box", hx=w / 2, hy=0.5, hz=0.45, yaw=yaw)


# =====================================================================================================================
def build_terminal_pax():
    """The passenger terminal: a 60 m glazed hall on a low plinth, a wave of a roof running out over the drop-off kerb toward
    the loop (+z) on a row of columns, gate doors toward the bus pads behind (-z), a gold band, departure boards and seats
    inside, check-in desks along the front."""
    begin("ilmb_terminal_pax")
    W, Z0, Z1, H = 30.0, -7.0, 3.0, 7.0          # hall: x +-W, z Z0 (airside) to Z1 (landside), walls H tall
    Acc.of("concrete", 0.05).put(bx(-W - 0.6, 0, Z0 - 0.6, W + 0.6, 0.3, 7.0))
    colbx(-W - 0.6, 0, Z0 - 0.6, W + 0.6, 0.3, 7.0)
    Acc.of("pave", 0.0).put(bx(-W, 0.305, 3.3, W, 0.315, 6.8))                             # (the kerb's walk, on the plinth)
    Acc.of("hazard", 0.0).put(bx(-W, 0.305, 6.85, W, 0.317, 7.0))
    # the hall: a white base course, glazing all round above it, the floor seen through it
    Acc.of("white", 0.08).put(bx(-W, 0.3, Z0, W, 1.2, Z1))
    Acc.of("glass", 0.0).put(bx(-W + 0.05, 1.2, Z0 + 0.05, W - 0.05, H, Z1 - 0.05))
    Acc.of("pave", 0.0).put(bx(-W + 0.3, 0.305, Z0 + 0.3, W - 0.3, 0.315, Z1 - 0.3))
    mull = Acc.of("alu", 0.02)
    x = -W
    while x <= W + 0.01:
        mull.put(bx(x - 0.12, 1.2, Z1 - 0.12, x + 0.12, H, Z1 + 0.12)).put(bx(x - 0.12, 1.2, Z0 - 0.12, x + 0.12, H, Z0 + 0.12))
        x += 3.0
    for z in (Z0 + 3.33, Z0 + 6.66):
        for sx in (-W, W):
            mull.put(bx(sx - 0.12, 1.2, z - 0.12, sx + 0.12, H, z + 0.12))
    for z in (Z0, Z1):
        mull.put(bx(-W, 4.0, z - 0.1, W, 4.16, z + 0.1))
    # doors: three pairs on the landside, a gate door at each pad behind (x where the pads' stairs come in), one at each end
    for dxx in (-15.0, 0.0, 15.0):
        Acc.of("door", 0.0).put(bx(dxx - 1.6, 0.3, Z1 + 0.12, dxx + 1.6, 3.6, Z1 + 0.13))
        Acc.of("lamp", 0.0).put(bx(dxx - 1.6, 3.86, Z1 - 0.04, dxx + 1.6, 4.0, Z1 + 0.1))   # (under the transom)
    for dxx in (-23.8, 6.8):
        Acc.of("door", 0.0).put(bx(dxx - 1.4, 0.3, Z0 - 0.13, dxx + 1.4, 3.6, Z0 - 0.12))
        Acc.of("gold", 0.02).put(bx(dxx - 1.7, 3.6, Z0 - 0.5, dxx + 1.7, 3.9, Z0 - 0.12))
        Acc.of("lamp", 0.0).put(bx(dxx - 1.2, 3.55, Z0 - 0.42, dxx + 1.2, 3.6, Z0 - 0.15))
    for sx in (-1, 1):
        Acc.of("door", 0.0).put(bx(sx * W + (0.12 if sx > 0 else -0.13), 0.3, -3.4, sx * W + (0.13 if sx > 0 else -0.12), 3.6, -0.6))
    # the roof: a slab whose underside rises toward the front, out past the hall over the kerb, on columns at the kerb
    prof = [(z, H + 0.6 + 1.6 * (z - Z0) / (7.6 - Z0)) for z in [Z0 - 1.0 + 1.0 * k for k in range(17)]]   # (z -8 to 8)
    verts, faces = [], []
    for z, y in prof:
        verts += [(-W - 1.0, y, z), (W + 1.0, y, z), (W + 1.0, y - 0.5, z), (-W - 1.0, y - 0.5, z)]
    n = len(prof)
    for i in range(n - 1):
        a, b = i * 4, (i + 1) * 4
        for j in range(4):
            j2 = (j + 1) % 4
            faces.append((a + j, a + j2, b + j2, b + j))
    faces.append((3, 2, 1, 0))
    faces.append(tuple((n - 1) * 4 + j for j in range(4)))
    Acc.of("alu", 0.08).put((verts, faces))
    yr = lambda z: H + 0.6 + 1.6 * (z - Z0) / (7.6 - Z0)
    Acc.of("gold", 0.0).put(bx(-W - 1.0, yr(8.0) - 0.42, 7.99, W + 1.0, yr(8.0) - 0.1, 8.02))             # (the fascia, on its front)
    Acc.of("navy", 0.04).put(sloped_box(-W - 0.2, W + 0.2, Z0 - 0.2, Z1 + 0.2, H, lambda z: yr(z) - 0.48))   # (the walls closed up to its underside)
    for xx in [-27.0 + 6.0 * k for k in range(10)]:
        top = yr(6.0) - 0.48
        Acc.of("alu", 0.03).put(cyl(xx, 0.3 + (top - 0.3) / 2, 6.0, 0.22, top - 0.3, 8))
        col((xx, 0.3, 6.0), shape="cyl", r=0.24, h=top - 0.3)
        Acc.of("lamp", 0.0).put(bx(xx - 1.2, top - 0.06, 5.2, xx + 1.2, top - 0.01, 6.8))
    colbx(-W, 0.3, Z0, W, H + 0.1, Z1)
    slope_col(0.0, 2 * W + 2.0, Z0 - 1.0, yr(Z0 - 1.0), 8.0, yr(8.0), 0.5)
    # inside: check-in desks along the landside, rows of seats, departure boards hung from the ceiling
    for dxx in (-21.0, -9.0, 9.0, 21.0):
        Acc.of("cream", 0.02).put(bx(dxx - 3.0, 0.315, 0.4, dxx + 3.0, 1.4, 1.2))
        Acc.of("gold", 0.0).put(bx(dxx - 3.0, 1.4, 0.4, dxx + 3.0, 1.46, 1.2))
    for dxx in (-21.0, -9.0, 9.0, 21.0):
        for zz in (-4.8, -3.0):
            Acc.of("blue", 0.01).put(bx(dxx - 3.5, 0.75, zz - 0.3, dxx + 3.5, 0.83, zz + 0.3))
            Acc.of("blue", 0.0).put(bx(dxx - 3.5, 0.83, zz + 0.2, dxx + 3.5, 1.45, zz + 0.3))
            Acc.of("steel", 0.0).put(bx(dxx - 3.4, 0.315, zz - 0.1, dxx + 3.4, 0.75, zz + 0.1))
    for dxx in (-15.0, 0.0, 15.0):
        Acc.of("dark", 0.02).put(bx(dxx - 2.6, 4.6, -2.2, dxx + 2.6, 6.0, -1.9))
        for k in range(4):
            Acc.of(("amber", "cyan", "amber", "green")[k], 0.0).put(bx(dxx - 2.3, 4.8 + k * 0.3, -1.89, dxx + 2.3 - (k % 2) * 1.2, 4.95 + k * 0.3, -1.88))
        for sx in (-2.0, 2.0):
            Acc.of("steel", 0.0).put(B((dxx + sx, 6.0, -2.05), (dxx + sx, H, -2.05), 0.03, 4, True))
    # rooftop plant and the beacon
    for x0 in (-20.0, 14.0):
        Acc.of("panel", 0.04).put(bx(x0, yr(-4) - 0.05, -6.0, x0 + 6.0, yr(-4) + 1.4, -2.0))
        colbx(x0, yr(-4) - 0.05, -6.0, x0 + 6.0, yr(-4) + 1.4, -2.0)
    blinker((0.0, yr(0) + 0.3, 0.0), 0.4)
    return end()


# =====================================================================================================================
def build_cargo_shed():
    """The cargo shed: a portal-framed shed 42 x 16 m, navy cladding on white frames, three roller doors on its front (+z)
    toward the gate road, a loading dock and dock lamps, a gold eave, roof vents, an office in one corner."""
    begin("ilmb_cargo_shed")
    W, Z0, Z1, H = 21.0, -9.0, 7.0, 11.0
    Acc.of("concrete", 0.05).put(bx(-W - 0.5, 0, Z0 - 0.5, W + 0.5, 0.3, 9.6))
    colbx(-W - 0.5, 0, Z0 - 0.5, W + 0.5, 0.3, 9.6)
    Acc.of("navy", 0.1).put(bx(-W, 0.3, Z0, W, H, Z1))
    for k in range(8):                                      # portal frames standing proud of the cladding
        x = -W + k * (2 * W) / 7
        for z in (Z0 - 0.15, Z1 + 0.15):
            Acc.of("white", 0.03).put(bx(x - 0.3, 0.3, z - 0.15, x + 0.3, H, z + 0.15))
    pitch_h = 1.6                                           # a low gable along x
    verts = [(-W - 0.4, H, Z0 - 0.4), (W + 0.4, H, Z0 - 0.4), (W + 0.4, H, Z1 + 0.4), (-W - 0.4, H, Z1 + 0.4),
             (-W - 0.4, H + pitch_h, (Z0 + Z1) / 2), (W + 0.4, H + pitch_h, (Z0 + Z1) / 2)]
    Acc.of("roof", 0.06).put((verts, [(0, 1, 2, 3), (0, 4, 5, 1), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2)]))
    Acc.of("gold", 0.0).put(bx(-W - 0.45, H - 0.4, Z1 - 0.1, W + 0.45, H - 0.004, Z1 + 0.45))
    for x in (-13.0, 0.0, 13.0):
        Acc.of("dark", 0.02).put(bx(x - 4.0, 0.3, Z1 + 0.02, x + 4.0, 7.3, Z1 + 0.14))
        for k in range(11):
            Acc.of("panel", 0.0).put(bx(x - 3.9, 0.7 + k * 0.6, Z1 + 0.14, x + 3.9, 0.76 + k * 0.6, Z1 + 0.18))
        Acc.of("hazard", 0.0).put(bx(x - 4.3, 7.3, Z1 + 0.02, x + 4.3, 7.65, Z1 + 0.2))
        Acc.of("lamp", 0.0).put(bx(x - 0.8, 8.0, Z1 + 0.15, x + 0.8, 8.2, Z1 + 0.6))
        Acc.of("steel", 0.0).put(bx(x - 0.1, 8.0, Z1 + 0.15, x + 0.1, 8.4, Z1 + 0.6))
        for sx in (-4.4, 4.4):                               # buffers either side of each door
            Acc.of("hazard", 0.02).put(bx(x + sx - 0.25, 0.3, Z1 + 0.15, x + sx + 0.25, 1.4, Z1 + 0.65))
    # the office: a glazed corner, its door
    Acc.of("window", 0.0).put(bx(W + 0.0, 3.0, -6.0, W + 0.04, 4.6, -1.0))
    Acc.of("door", 0.0).put(bx(W + 0.0, 0.3, 1.0, W + 0.04, 2.75, 2.2))
    Acc.of("window", 0.0).put(bx(-W - 0.04, 3.0, -6.0, -W, 4.6, 2.0))
    for x in (-12.0, 0.0, 12.0):
        Acc.of("light", 0.03).put(bx(x - 1.5, H + pitch_h * 0.5 - 0.3, -1.5, x + 1.5, H + pitch_h + 0.8, 1.5))
    blinker((W, H + 0.4, Z1), 0.35)
    colbx(-W - 0.4, 0.3, Z0 - 0.4, W + 0.4, H, Z1 + 0.4)
    zm = (Z0 + Z1) / 2                                     # (the roof: each slope from its eave up to the ridge)
    slope_col(0.0, 2 * W + 0.8, Z1 + 0.4, H, zm, H + pitch_h, 0.4)
    slope_col(0.0, 2 * W + 0.8, Z0 - 0.4, H, zm, H + pitch_h, 0.4)
    for x in (-12.0, 0.0, 12.0):
        colbx(x - 1.5, H + pitch_h * 0.5 - 0.3, -1.5, x + 1.5, H + pitch_h + 0.8, 1.5)
    return end()


# =====================================================================================================================
def build_motorpool():
    """The motor pool: a hall 30 x 52 m and 10 m tall, orange cladding on steel portal frames, its front (+z) three bays wide
    behind open roller doors. Inside: a lift in each bay (a two-post lift, a four-post lift, a scissor lift; the game stands
    a vehicle on each: src/ilmbCore.js MOTORPOOL_LIFTS), painted bay lines, tool walls and roll cabinets down both sides,
    workbenches with vices, a tyre rack, a compressor with hose reels, a parts cage, an office on a mezzanine at the back up a
    flight of stairs, the bridge crane over the bays. The lining and floor are self-lit (shop, shopfloor) so the bays read
    as a lit workshop from outside."""
    begin("ilmb_motorpool")
    W, Z0, Z1, H, F = 15.0, -26.0, 26.0, 10.0, 0.25           # walls' outer faces, height; F the floor's top
    T = 0.5                                                   # wall thickness
    Acc.of("concrete", 0.05).put(bx(-W - 0.5, 0, Z0 - 0.5, W + 0.5, F, Z1 + 4.0))
    colbx(-W - 0.5, 0, Z0 - 0.5, W + 0.5, F, Z1 + 4.0)
    Acc.of("shopfloor", 0.0).put(bx(-W + T, F, Z0 + T, W - T, F + 0.01, Z1))
    # walls: sides and back whole; the front three openings 8 m wide and 7 m high between piers, a lintel over them
    DOORS = (-9.6, 0.0, 9.6)
    for sd in (-1, 1):
        Acc.of("orange", 0.1).put(bx(sd * W - (T if sd > 0 else 0), F, Z0, sd * W + (0 if sd > 0 else T), H, Z1))
        colbx(sd * W - (T if sd > 0 else 0), F, Z0, sd * W + (0 if sd > 0 else T), H, Z1)
    Acc.of("orange", 0.1).put(bx(-W, F, Z0, W, H, Z0 + T))
    colbx(-W, F, Z0, W, H, Z0 + T)
    piers = [(-W, DOORS[0] - 4.0), (DOORS[0] + 4.0, DOORS[1] - 4.0), (DOORS[1] + 4.0, DOORS[2] - 4.0), (DOORS[2] + 4.0, W)]
    for x0, x1 in piers:
        Acc.of("orange", 0.1).put(bx(x0, F, Z1 - T, x1, 7.0, Z1))
        colbx(x0, F, Z1 - T, x1, 7.0, Z1)
        for k in range(6):                                    # hazard chevrons up the piers' fronts, painted on
            Acc.of("paint_hazard" if k % 2 == 0 else "paint_dark", 0.0).put(bx(x0 + 0.05, F + 0.2 + k * 0.4, Z1 + 0.005, x1 - 0.05, F + 0.6 + k * 0.4, Z1 + 0.012))
    Acc.of("orange", 0.1).put(bx(-W, 7.0, Z1 - T, W, H, Z1))
    colbx(-W, 7.0, Z1 - T, W, H, Z1)
    Acc.of("dark", 0.03).put(bx(-6.0, 7.9, Z1 + 0.0, 6.0, 9.4, Z1 + 0.12))                  # the name board (the game writes it)
    Acc.of("gold", 0.0).put(bx(-6.2, 9.4, Z1 - 0.1, 6.2, 9.6, Z1 + 0.2))
    # the lining, self-lit, a hair inside the walls
    for sd in (-1, 1):
        x = sd * (W - T - 0.006)
        Acc.of("shop", 0.0).put(bx(min(x, x - sd * 0.02), F, Z0 + T, max(x, x - sd * 0.02), H - 0.6, Z1 - T))
    Acc.of("shop", 0.0).put(bx(-W + T, F, Z0 + T + 0.006, W - T, H - 0.6, Z0 + T + 0.026))
    # the roof: a flat deck on the walls, a gold coping, two vent housings, the beacon
    Acc.of("roof", 0.06).put(bx(-W - 0.3, H, Z0 - 0.3, W + 0.3, H + 0.6, Z1 + 0.3))
    Acc.of("shop", 0.0).put(bx(-W + T, H - 0.026, Z0 + T, W - T, H - 0.006, Z1 - T))
    Acc.of("gold", 0.0).put(bx(-W - 0.35, H + 0.6, Z1 + 0.05, W + 0.35, H + 0.8, Z1 + 0.35))
    colbx(-W - 0.3, H, Z0 - 0.3, W + 0.3, H + 0.6, Z1 + 0.3)
    for z in (-12.0, 8.0):
        Acc.of("light", 0.03).put(bx(-3.0, H + 0.6, z - 2.0, 3.0, H + 1.8, z + 2.0))
        colbx(-3.0, H + 0.6, z - 2.0, 3.0, H + 1.8, z + 2.0)
    blinker((W, H + 1.0, Z1), 0.35)
    # portal frames inside (pilasters), the roller drums over the doors, lamp strips under the roof
    for z in [Z0 + 6.0 + 8.0 * k for k in range(6)]:
        for sd in (-1, 1):
            xa, xb = sorted((sd * (W - T), sd * (W - T - 0.35)))
            Acc.of("steel", 0.02).put(bx(xa, F, z - 0.3, xb, H, z + 0.3))
            colbx(xa, F, z - 0.3, xb, H, z + 0.3)
        Acc.of("steel", 0.02).put(bx(-W + T, H - 0.6, z - 0.25, W - T, H - 0.05, z + 0.25))
        colbx(-W + T, H - 0.6, z - 0.25, W - T, H, z + 0.25)
    for x in DOORS:
        Acc.of("steel", 0.03).put(xf(cylinder(0.55, 0.55, 8.4, 12)[:2], (x, 7.55, Z1 - T - 0.6), (0, 0, math.pi / 2)))
        Acc.of("panel", 0.03).put(bx(x - 4.3, 7.0, Z1 - T - 1.25, x + 4.3, 8.25, Z1 - T))
        colbx(x - 4.3, 7.0, Z1 - T - 1.25, x + 4.3, 8.25, Z1 - T)
        for sx in (-4.05, 4.05):
            Acc.of("dark", 0.0).put(bx(x + sx - 0.08, F, Z1 - T - 0.2, x + sx + 0.08, 7.0, Z1 - T))
        Acc.of("lamp", 0.0).put(bx(x - 0.15, H - 0.73, Z0 + 2.0, x + 0.15, H - 0.58, Z1 - 2.0))   # (set into the frames' undersides)
    # painted bay lines and stop bars on the floor
    for x in (-4.8, 4.8):
        Acc.of("paint_gold", 0.0).put(bx(x - 0.08, F + 0.01, -5.0, x + 0.08, F + 0.02, Z1 - T))
    for x in DOORS:
        Acc.of("paint_gold", 0.0).put(bx(x - 3.5, F + 0.01, 4.2, x + 3.5, F + 0.02, 4.4))
    # ---- bay 1 (x -9.6): a two-post lift, its arms under the car's sills ----
    x1 = DOORS[0]
    for sd in (-1, 1):
        px = x1 + sd * 2.6
        Acc.of("gold", 0.04).put(bx(px - 0.25, F, 11.6, px + 0.25, F + 4.4, 12.4))
        Acc.of("dark", 0.02).put(bx(px - 0.35, F, 11.45, px + 0.35, F + 0.2, 12.55))
        cx_ = px - sd * 0.45                                  # the carriage on the post's inner face
        Acc.of("steel", 0.02).put(bx(cx_ - 0.2, F + 1.45, 11.7, cx_ + 0.2, F + 1.85, 12.3))
        for sz in (-1, 1):                                    # arms swung in under the car to their pads
            Acc.of("steel", 0.02).put(B((cx_, F + 1.6, 12.0), (x1 + sd * 1.3, F + 1.6, 12.0 + sz * 1.6), 0.09, 4, True))
            Acc.of("dark", 0.0).put(cyl(x1 + sd * 1.3, F + 1.71, 12.0 + sz * 1.6, 0.18, 0.12, 8))
        col((px, F, 12.0), shape="box", hx=0.3, hy=2.2, hz=0.45, yaw=0.0)
    Acc.of("gold", 0.03).put(bx(x1 - 2.85, F + 4.4, 11.7, x1 + 2.85, F + 4.8, 12.3))
    Acc.of("tire", 0.02).put(xf(torus(0.62, 0.22, 16, 6), (x1 + 3.4, F + 0.84, 13.6), (0, 0, math.pi / 2)))  # (the wheel off, stood by the lift)
    Acc.of("steel", 0.0).put(xf(cylinder(0.42, 0.42, 0.3, 10)[:2], (x1 + 3.4, F + 0.84, 13.6), (0, 0, math.pi / 2)))
    # ---- bay 2 (x 0): a four-post lift, two runways at 1.7 m ----
    x2 = DOORS[1]
    RW = 1.7
    for sx in (-1, 1):
        for sz in (-1, 1):
            Acc.of("gold", 0.03).put(bx(x2 + sx * 2.95 - 0.2, F, 12.0 + sz * 4.0 - 0.2, x2 + sx * 2.95 + 0.2, F + 3.2, 12.0 + sz * 4.0 + 0.2))
            col((x2 + sx * 2.95, F, 12.0 + sz * 4.0), shape="cyl", r=0.28, h=3.2)
        Acc.of("steel", 0.03).put(bx(x2 + sx * 2.13 - 0.45, F + RW - 0.25, 8.4, x2 + sx * 2.13 + 0.45, F + RW, 15.6))
        Acc.of("paint_hazard", 0.0).put(bx(x2 + sx * 2.13 - 0.45, F + RW, 8.4, x2 + sx * 2.13 + 0.45, F + RW + 0.008, 8.8))
        col((x2 + sx * 2.13, F + RW - 0.25, 12.0), shape="box", hx=0.45, hy=0.125, hz=3.6, yaw=0.0)
        Acc.of("steel", 0.02).put(bx(x2 + sx * 2.13 - 0.45, F + 0.02, 15.6, x2 + sx * 2.13 + 0.45, F + 0.05, 16.9))   # (the approach ramps, down on the floor)
    for sz in (-1, 1):
        Acc.of("gold", 0.02).put(bx(x2 - 3.15, F + RW - 0.35, 12.0 + sz * 4.0 - 0.25, x2 + 3.15, F + RW - 0.05, 12.0 + sz * 4.0 + 0.25))
    # ---- bay 3 (x 9.6): a scissor lift, its deck at 1.1 m ----
    x3 = DOORS[2]
    SD = 1.1
    Acc.of("dark", 0.02).put(bx(x3 - 2.1, F, 8.8, x3 + 2.1, F + 0.15, 15.2))
    Acc.of("steel", 0.03).put(bx(x3 - 2.2, F + SD - 0.2, 8.6, x3 + 2.2, F + SD, 15.4))
    Acc.of("paint_hazard", 0.0).put(bx(x3 - 2.2, F + SD, 15.0, x3 + 2.2, F + SD + 0.008, 15.4))
    for sx in (-1.6, 1.6):
        Acc.of("gold", 0.02).put(B((x3 + sx, F + 0.15, 9.2), (x3 + sx, F + SD - 0.2, 14.8), 0.1, 4, True))
        Acc.of("gold", 0.02).put(B((x3 + sx, F + 0.15, 14.8), (x3 + sx, F + SD - 0.2, 9.2), 0.1, 4, True))
    colbx(x3 - 2.2, F, 8.6, x3 + 2.2, F + SD, 15.4)
    # ---- the walls: pegboards with tools, roll cabinets, workbenches ----
    for sd in (-1, 1):
        x = sd * (W - T - 0.01)
        for z0, z1 in ((-4.0, 4.0), (16.0, 23.0)):
            Acc.of("panel", 0.02).put(bx(min(x, x - sd * 0.06), F + 1.2, z0, max(x, x - sd * 0.06), F + 3.4, z1))
            k, z = 0, z0 + 0.4
            while z < z1 - 0.3:
                y = F + 1.7 + (k % 3) * 0.55
                Acc.of(("red", "steel", "gold", "blue")[k % 4], 0.0).put(box(x - sd * 0.09, y, z, 0.06, 0.4 + 0.15 * (k % 2), 0.12))
                z += 0.45
                k += 1
        for z in (-2.6, 0.0, 2.6):
            roll_cabinet(sd * (W - T - 0.35), z, -sd * math.pi / 2, "red" if sd < 0 else "blue")
        workbench(sd * (W - T - 0.46), 19.5, -sd * math.pi / 2, 3.0)
        workbench(sd * (W - T - 0.46), 7.0, -sd * math.pi / 2, 2.4)
    # ---- the back: tyre rack, compressor and hose reels, parts cage, the mezzanine office ----
    # tyre rack against the left wall
    rx = -W + T + 0.6
    Acc.of("steel", 0.02).put(bx(rx - 0.5, F, -15.0, rx + 0.5, F + 0.08, -9.0))
    Acc.of("steel", 0.02).put(bx(rx - 0.5, F + 1.4, -15.0, rx + 0.5, F + 1.48, -9.0))
    for z in (-15.0, -12.0, -9.0):
        Acc.of("steel", 0.02).put(bx(rx - 0.5, F, z - 0.06, rx + 0.5, F + 2.9, z + 0.06))
    for lvl, y in ((0, F + 0.08), (1, F + 1.48)):
        for k in range(8):
            z = -14.5 + k * 0.72
            Acc.of("tire", 0.02).put(xf(cylinder(0.6, 0.6, 0.42, 14)[:2], (rx, y + 0.6, z), (math.pi / 2, 0, 0)))
    colbx(rx - 0.5, F, -15.0, rx + 0.5, F + 2.9, -9.0)
    # compressor: a receiver tank on feet, its motor, the line up the wall to two hose reels
    cx, cz = -11.0, -16.0
    Acc.of("red", 0.03).put(xf(cylinder(0.55, 0.55, 2.0, 14)[:2], (cx, F + 0.8, cz), (0, 0, math.pi / 2)))
    for sx in (-0.7, 0.7):
        Acc.of("dark", 0.0).put(bx(cx + sx - 0.1, F, cz - 0.4, cx + sx + 0.1, F + 0.35, cz + 0.4))
    Acc.of("steel", 0.02).put(bx(cx - 0.5, F + 1.2, cz - 0.35, cx + 0.3, F + 1.9, cz + 0.35))
    Acc.of("dark", 0.0).put(B((cx - 1.0, F + 0.8, cz), (-W + T + 0.1, F + 0.8, cz), 0.04, 4, True))
    Acc.of("dark", 0.0).put(B((-W + T + 0.1, F + 0.8, cz), (-W + T + 0.1, F + 2.6, cz), 0.04, 4, True))
    Acc.of("dark", 0.0).put(B((-W + T + 0.1, F + 2.6, cz), (-W + T + 0.1, F + 2.6, 6.0), 0.04, 4, True))
    for z in (cz, 6.0):
        Acc.of("steel", 0.02).put(xf(cylinder(0.4, 0.4, 0.25, 12)[:2], (-W + T + 0.3, F + 2.6, z), (0, 0, math.pi / 2)))
        Acc.of("gold", 0.0).put(xf(torus(0.34, 0.06, 12, 4), (-W + T + 0.3, F + 2.6, z), (0, 0, math.pi / 2)))
    col((cx, F, cz), shape="box", hx=1.0, hy=1.0, hz=0.6, yaw=0.0)
    # the parts cage, right back corner: a mesh fence round shelving
    gx0, gx1, gz0, gz1 = 5.5, W - T, Z0 + T, -15.0
    for x in [gx0 + 0.8 * k for k in range(int((gx1 - gx0) / 0.8) + 1)]:
        Acc.of("steel", 0.0).put(B((x, F, gz1), (x, F + 3.0, gz1), 0.025, 4, True))
    for z in [gz0 + 0.8 * k for k in range(int((gz1 - gz0) / 0.8) + 1)]:
        Acc.of("steel", 0.0).put(B((gx0, F, z), (gx0, F + 3.0, z), 0.025, 4, True))
    for y in (F + 0.1, F + 1.5, F + 3.0):
        Acc.of("steel", 0.0).put(B((gx0, y, gz1), (gx1, y, gz1), 0.035, 4, True))
        Acc.of("steel", 0.0).put(B((gx0, y, gz0), (gx0, y, gz1), 0.035, 4, True))
    for z in (gz0 + 1.0, gz0 + 5.0):
        Acc.of("panel", 0.02).put(bx(gx0 + 1.2, F, z - 0.5, gx1 - 0.3, F + 0.06, z + 0.5))
        for y in (F + 0.8, F + 1.6, F + 2.4):
            Acc.of("panel", 0.0).put(bx(gx0 + 1.2, y, z - 0.5, gx1 - 0.3, y + 0.05, z + 0.5))
            for k in range(int((gx1 - gx0 - 1.6) / 0.7)):
                Acc.of(("blue", "orange", "steel")[k % 3], 0.0).put(bx(gx0 + 1.35 + k * 0.7, y + 0.05, z - 0.3, gx0 + 1.85 + k * 0.7, y + 0.4, z + 0.3))
        for x in (gx0 + 1.2, gx1 - 0.3):
            Acc.of("dark", 0.0).put(bx(x - 0.05, F, z - 0.5, x + 0.05, F + 2.6, z - 0.4)).put(bx(x - 0.05, F, z + 0.4, x + 0.05, F + 2.6, z + 0.5))
    colbx(gx0, F, gz0, gx1, F + 3.0, gz1)
    # the mezzanine: a deck across the back left at 3.6 m on columns, the office on it, railed, the flight up its side
    MZ, mx0, mx1, mz1 = 3.6, -W + T, 1.5, -18.0
    Acc.of("steel", 0.04).put(bx(mx0, MZ - 0.3, Z0 + T, mx1, MZ, mz1))
    colbx(mx0, MZ - 0.3, Z0 + T, mx1, MZ, mz1)
    for x in (-12.0, -6.0, -1.2):
        Acc.of("steel", 0.02).put(bx(x - 0.15, F, mz1 - 0.35, x + 0.15, MZ - 0.3, mz1 - 0.05))
        col((x, F, mz1 - 0.2), shape="box", hx=0.15, hy=(MZ - 0.3 - F) / 2, hz=0.15, yaw=0.0)
    Acc.of("cream", 0.04).put(bx(mx0, MZ, Z0 + T, -2.0, MZ + 3.0, -21.5))
    Acc.of("window", 0.0).put(bx(-12.0, MZ + 1.0, -21.48, -3.0, MZ + 2.4, -21.46))
    Acc.of("door", 0.0).put(bx(-2.004, MZ, -24.0, -1.98, MZ + 2.3, -22.8))
    colbx(mx0, MZ, Z0 + T, -2.0, MZ + 3.0, -21.5)
    SX = 0.5                                                  # the flight comes up onto the deck's front edge here; the railing opens for it
    rail_pts = [(mx0 + 0.1, MZ, mz1 + 0.1), (SX - 0.85, MZ, mz1 + 0.1)]
    railing(Acc.of("gold", 0.0), Acc.of("steel", 0.0), rail_pts, every=1.4)
    railing(Acc.of("gold", 0.0), Acc.of("steel", 0.0), [(mx1 - 0.1, MZ, mz1 + 0.1), (mx1 - 0.1, MZ, mz1 - 3.0)], every=1.4)
    col(((mx0 + SX - 0.85) / 2, MZ, mz1 + 0.1), shape="box", hx=(SX - 0.85 - mx0) / 2, hy=0.55, hz=0.08, yaw=0.0)
    flight(SX, 1.4, -10.5, mz1, F, MZ)
    # ---- the bridge crane: rails on brackets down both walls, the bridge across at z 4, its hoist over bay 1 ----
    for sd in (-1, 1):
        x = sd * (W - T - 0.5)
        Acc.of("steel", 0.03).put(bx(x - 0.25, 8.0, Z0 + 1.0, x + 0.25, 8.4, Z1 - 1.0))
        colbx(x - 0.25, 8.0, Z0 + 1.0, x + 0.25, 8.4, Z1 - 1.0)
        for z in [Z0 + 6.0 + 8.0 * k for k in range(6)]:
            Acc.of("dark", 0.0).put(bx(min(x, sd * (W - T)) - 0.05, 7.6, z - 0.15, max(x, sd * (W - T)) + 0.05, 8.0, z + 0.15))
    Acc.of("gold", 0.04).put(bx(-W + T + 0.3, 8.4, 3.5, W - T - 0.3, 9.2, 4.5))
    Acc.of("hazard", 0.0).put(bx(-W + T + 0.3, 8.6, 4.505, W - T - 0.3, 9.0, 4.52))
    colbx(-W + T + 0.3, 8.4, 3.5, W - T - 0.3, 9.2, 4.5)
    Acc.of("dark", 0.02).put(bx(x1 - 0.6, 7.7, 3.4, x1 + 0.6, 8.4, 4.6))
    Acc.of("dark", 0.0).put(B((x1, 7.7, 4.0), (x1, 5.4, 4.0), 0.03, 4, True))
    Acc.of("gold", 0.01).put(bx(x1 - 0.3, 5.0, 3.8, x1 + 0.3, 5.4, 4.2))
    Acc.of("dark", 0.0).put(xf(torus(0.22, 0.05, 10, 4), (x1, 4.8, 4.0), (math.pi / 2, 0, 0)))
    # out front: the apron's lines
    for x in DOORS:
        for k in range(4):
            Acc.of("paint_gold", 0.0).put(bx(x - 0.1, F, Z1 + 0.6 + k * 0.85, x + 0.1, F + 0.012, Z1 + 1.1 + k * 0.85))
    return end()


# =====================================================================================================================
def build_fuel_island():
    """A fuel and charge island: a canopy 12 x 8 m on four posts, two dispensers on a kerbed island, lamps under it."""
    begin("ilmb_fuel_island")
    Acc.of("concrete", 0.03).put(bx(-6.0, 0, -4.0, 6.0, 0.12, 4.0))
    Acc.of("hazard", 0.02).put(bx(-4.4, 0.12, -0.9, 4.4, 0.3, 0.9))
    colbx(-4.4, 0, -0.9, 4.4, 0.3, 0.9)
    for sx in (-2.4, 2.4):
        Acc.of("white", 0.03).put(bx(sx - 0.55, 0.3, -0.45, sx + 0.55, 2.4, 0.45))
        Acc.of("navy", 0.0).put(bx(sx - 0.5, 1.4, 0.452, sx + 0.5, 2.2, 0.458)).put(bx(sx - 0.5, 1.4, -0.458, sx + 0.5, 2.2, -0.452))
        Acc.of("cyan", 0.0).put(bx(sx - 0.3, 1.7, 0.46, sx + 0.3, 2.0, 0.47)).put(bx(sx - 0.3, 1.7, -0.47, sx + 0.3, 2.0, -0.46))
        Acc.of("dark", 0.0).put(B((sx + 0.55, 1.6, 0.0), (sx + 0.9, 0.9, 0.0), 0.04, 4, True))
        Acc.of("dark", 0.0).put(bx(sx + 0.85, 0.75, -0.1, sx + 1.0, 1.0, 0.1))
        col((sx, 0.3, 0), shape="box", hx=0.55, hy=1.05, hz=0.45, yaw=0.0)
    for sx in (-5.2, 5.2):
        Acc.of("steel", 0.03).put(bx(sx - 0.2, 0.12, -0.2, sx + 0.2, 5.4, 0.2))
        col((sx, 0, 0), shape="box", hx=0.2, hy=2.7, hz=0.2, yaw=0.0)
    Acc.of("white", 0.05).put(bx(-6.0, 5.4, -4.0, 6.0, 6.0, 4.0))
    Acc.of("gold", 0.0).put(bx(-6.05, 5.5, 3.995, 6.05, 5.9, 4.01)).put(bx(-6.05, 5.5, -4.01, 6.05, 5.9, -3.995))
    for sz in (-2.2, 2.2):
        Acc.of("lamp", 0.0).put(bx(-4.0, 5.37, sz - 0.2, 4.0, 5.4, sz + 0.2))
    colbx(-6.0, 5.4, -4.0, 6.0, 6.0, 4.0)
    return end()


# =====================================================================================================================
def build_tank():
    """A vertical propellant tank 5 m round and 15 m tall: a ring footing, a white shell with gold and dark bands, a domed
    head with a valve, a caged ladder up the side to a railed top, the outlet pipe at its foot."""
    begin("ilmb_tank")
    r, h = 4.6, 13.0
    Acc.of("concrete", 0.04).put(cyl(0, 0.2, 0, r + 0.4, 0.4, 24))
    Acc.of("white", 0.12).put(cyl(0, 0.4 + h / 2, 0, r, h, 28))
    th = math.pi * 0.22                                       # the dished head: a sphere cap whose rim is the shell's top
    Rs, ys = r / math.sin(th), 0.4 + h
    Acc.of("white", 0.08).put(xf(sphere(Rs, 28, 6, th)[:2], (0, ys - Rs * math.cos(th), 0)))
    top = ys - Rs * math.cos(th) + Rs
    for y, s in ((2.0, "gold"), (0.4 + h - 1.2, "gold"), (0.4 + h * 0.55, "dark")):
        Acc.of(s, 0.0).put(cyl(0, y, 0, r + 0.005, 0.5, 28))
    Acc.of("steel", 0.03).put(cyl(0, top + 0.3, 0, 0.5, 0.6, 10))
    # ladder up the +z side, a cage round it from 3 m, the top's railing
    ladder(Acc.of("steel", 0.0), Acc.of("steel", 0.0), 0.0, r + 0.25, 0.4, 0.4 + h, math.pi / 2)
    for y in [3.0 + 1.2 * k for k in range(9)]:
        if y > 0.4 + h:
            break
        pts = [(0.45, y, r - 0.03)] + [(math.cos(t) * 0.45, y, r + 0.55 + math.sin(t) * 0.45) for t in [math.pi * j / 6 for j in range(7)]] + [(-0.45, y, r - 0.03)]
        Acc.of("steel", 0.0).put(path_tube(pts, 0.025, 4))
    rail = [(math.cos(t) * (r - 0.3), 0.4 + h + 0.2, math.sin(t) * (r - 0.3)) for t in [TAU * j / 24 for j in range(25)]]
    railing(Acc.of("gold", 0.0), Acc.of("steel", 0.0), rail, every=1.4)
    # the outlet at its foot toward -z (the pipe run's side), a valve on it
    Acc.of("steel", 0.03).put(xf(cylinder(0.3, 0.3, 2.2, 10)[:2], (0, 1.0, -r - 1.0), (math.pi / 2, 0, 0)))
    Acc.of("red", 0.02).put(cyl(0, 1.0, -r - 1.2, 0.45, 0.35, 10))
    col((0, 0, 0), shape="cyl", r=r + 0.1, h=0.4 + h)
    col((0, ys, 0), shape="cyl", r=r * 0.8, h=top - ys)
    return end()


def build_pump_house():
    """The tank farm's pump house: a block 12 x 7 x 14 m, grey panels with a gold band, louvres, a roof fan, the manifold of
    pipes out of its front (+z) with valves, a personnel door."""
    begin("ilmb_pump_house")
    Acc.of("concrete", 0.04).put(bx(-6.5, 0, -7.5, 6.5, 0.3, 7.5))
    colbx(-6.5, 0, -7.5, 6.5, 0.3, 7.5)
    Acc.of("panel2", 0.08).put(bx(-6.0, 0.3, -7.0, 6.0, 7.0, 4.0))
    colbx(-6.3, 0.3, -7.3, 6.3, 7.4, 4.3)
    col((3.0, 7.4, -3.0), shape="cyl", r=1.3, h=1.0)
    Acc.of("gold", 0.0).put(bx(-6.02, 5.6, -7.02, 6.02, 6.0, 4.02))
    Acc.of("roof", 0.05).put(bx(-6.3, 7.0, -7.3, 6.3, 7.4, 4.3))
    for x in (-3.5, 3.5):
        for k in range(5):
            Acc.of("dark", 0.0).put(bx(x - 1.2, 2.0 + k * 0.4, 4.0, x + 1.2, 2.2 + k * 0.4, 4.006))
    Acc.of("door", 0.0).put(bx(-0.6, 0.3, 4.0, 0.6, 2.75, 4.006))
    Acc.of("lamp", 0.0).put(bx(-0.4, 3.0, 4.0, 0.4, 3.12, 4.25))
    f = fan((3.0, 7.4, -3.0), 1.5)
    Acc.of("light", 0.03).put(cyl(3.0, 7.9, -3.0, 1.3, 1.0, 14))
    for k in range(3):
        Acc.of("steel", 0.0, parent=f).put(xf(box(0, 0.6, 0, 2.2, 0.06, 0.3), (0, 0, 0), (0, k * math.pi / 3, 0)))
    # the manifold: three pipes out of the front, valves, down into a header along x
    for x in (-3.0, 3.0):
        Acc.of("steel", 0.03).put(xf(cylinder(0.32, 0.32, 3.2, 10)[:2], (x, 1.4, 5.4), (math.pi / 2, 0, 0)))
        Acc.of("red", 0.02).put(cyl(x, 1.4, 5.2, 0.5, 0.4, 10, rot=(math.pi / 2, 0, 0)))
        Acc.of("dark", 0.0).put(B((x, 1.9, 5.2), (x, 2.5, 5.2), 0.05, 4, True))
        Acc.of("red", 0.0).put(ring(0.35, 0.04, 2.5, 12, 4, t=(x, 0, 5.2))).put(B((x - 0.35, 2.5, 5.2), (x + 0.35, 2.5, 5.2), 0.025, 4, True))
    Acc.of("steel", 0.03).put(xf(cylinder(0.4, 0.4, 9.0, 12)[:2], (0, 1.4, 7.0), (0, 0, math.pi / 2)))
    for x in (-4.0, 0.0, 4.0):
        Acc.of("dark", 0.0).put(bx(x - 0.3, 0.3, 6.7, x + 0.3, 1.0, 7.3))
    col((0, 0.3, 7.0), shape="box", hx=4.5, hy=0.75, hz=0.5, yaw=0.0)
    for x in (-3.0, 3.0):
        colbx(x - 0.5, 0.3, 4.0, x + 0.5, 2.5, 6.6)
    return end()


def build_pipe_bridge():
    """The pipe run from the tank farm to the Power Block, along z from -35 (the tank farm) to +35 (the Power Block's wall):
    three pipes on T-sleepers a metre and a half up, rising at two trestle towers to cross the ring road (z +1 to -17) on a
    truss at 8.5 m, flanges where it meets the wall."""
    begin("ilmb_pipe_bridge")
    Z_OUT, Z_IN, ZA, ZB, YB = -35.0, 35.0, -21.0, 5.0, 8.6       # ends; the trestles; the pipes' height over the road
    RA, RB = ZA - 1.6, ZB + 1.6                                  # where the pipes rise, just outside the trestles' decks
    PIPES = (-0.7, 0.0, 0.7)
    SL = 1.5                                                     # their height on the sleepers

    def run(z0, z1, y):
        for px, slot in zip(PIPES, ("white", "gold", "white")):
            Acc.of(slot, 0.02).put(B((px, y, z0), (px, y, z1), 0.24, 10, True))
    run(Z_OUT, RA, SL)
    run(RB, Z_IN + 0.5, SL)                                      # (into the Power Block's wall)
    run(RA, RB, YB)
    for z in (RA, RB):                                           # the bends up beside the trestles
        for px, slot in zip(PIPES, ("white", "gold", "white")):
            Acc.of(slot, 0.02).put(B((px, SL, z), (px, YB, z), 0.24, 10, True))
    for z in [Z_OUT + 1.0 + 6.0 * k for k in range(12)]:          # sleepers off the bridge
        if RA - 1.0 < z < RB + 1.0:
            continue
        Acc.of("steel", 0.02).put(bx(-0.12, 0, z - 0.12, 0.12, SL - 0.24, z + 0.12))
        Acc.of("steel", 0.02).put(bx(-1.1, SL - 0.36, z - 0.15, 1.1, SL - 0.24, z + 0.15))
        Acc.of("concrete", 0.02).put(bx(-0.4, 0, z - 0.4, 0.4, 0.2, z + 0.4))
    col((0, 0, (Z_OUT + RA) / 2), shape="box", hx=1.1, hy=(SL + 0.3) / 2, hz=(RA - Z_OUT) / 2, yaw=0.0)
    col((0, 0, (RB + Z_IN) / 2), shape="box", hx=1.1, hy=(SL + 0.3) / 2, hz=(Z_IN - RB) / 2, yaw=0.0)
    for z in (RA, RB):
        col((0, SL, z), shape="box", hx=1.0, hy=(YB + 0.3 - SL) / 2, hz=0.3, yaw=0.0)
    # the trestles: four legs braced, a deck at the top; the truss between them
    for z in (ZA, ZB):
        for sx in (-1.4, 1.4):
            for sz in (-1.0, 1.0):
                Acc.of("steel", 0.03).put(bx(z * 0 + sx - 0.15, 0, z + sz - 0.15, sx + 0.15, YB - 0.3, z + sz + 0.15))
            Acc.of("dark", 0.0).put(B((sx, 0.3, z - 1.0), (sx, YB - 0.6, z + 1.0), 0.06, 4, True))
            Acc.of("dark", 0.0).put(B((sx, 0.3, z + 1.0), (sx, YB - 0.6, z - 1.0), 0.06, 4, True))
        Acc.of("gold", 0.02).put(bx(-1.7, YB - 0.6, z - 1.3, 1.7, YB - 0.24, z + 1.3))
        Acc.of("concrete", 0.02).put(bx(-1.9, 0, z - 1.5, 1.9, 0.25, z + 1.5))
        col((0, 0, z), shape="box", hx=1.6, hy=(YB - 0.3) / 2, hz=1.2, yaw=0.0)
    for sx in (-1.25, 1.25):                                     # the truss: chords and diagonals each side, the deck under the pipes
        Acc.of("steel", 0.03).put(B((sx, YB - 0.45, ZA), (sx, YB - 0.45, ZB), 0.1, 4, True))
        Acc.of("steel", 0.03).put(B((sx, YB + 1.1, ZA), (sx, YB + 1.1, ZB), 0.1, 4, True))
        n = 8
        for k in range(n):
            za, zb = ZA + (ZB - ZA) * k / n, ZA + (ZB - ZA) * (k + 1) / n
            Acc.of("steel", 0.0).put(B((sx, YB - 0.45, za), (sx, YB + 1.1, zb), 0.06, 4, True))
            Acc.of("steel", 0.0).put(B((sx, YB - 0.45, zb), (sx, YB + 1.1, zb), 0.05, 4, True))
    Acc.of("hazard", 0.02).put(bx(-1.3, YB - 0.55, ZA + 1.31, 1.3, YB - 0.24, ZB - 1.31))   # (the deck the pipes lie on)
    for z in (ZA + 3.0, ZB - 3.0):
        Acc.of("redlamp", 0.0).put(bx(-0.2, YB - 0.65, z - 0.2, 0.2, YB - 0.55, z + 0.2))
    col((0, YB - 0.55, (ZA + ZB) / 2), shape="box", hx=1.35, hy=0.9, hz=(ZB - ZA) / 2, yaw=0.0)
    for px in PIPES:                                             # flanges at the Power Block's wall
        Acc.of("steel", 0.02).put(cyl(px, SL, Z_IN - 0.15, 0.36, 0.3, 12, rot=(math.pi / 2, 0, 0)))
    # the valve station the run starts from, by the tank farm
    Acc.of("concrete", 0.02).put(bx(-1.6, 0, Z_OUT - 2.4, 1.6, 0.25, Z_OUT + 0.6))
    Acc.of("panel2", 0.05).put(bx(-1.3, 0.25, Z_OUT - 2.0, 1.3, 2.2, Z_OUT + 0.2))
    Acc.of("gold", 0.0).put(bx(-1.305, 1.8, Z_OUT - 2.005, 1.305, 2.0, Z_OUT + 0.205))
    for px in PIPES:
        Acc.of("red", 0.02).put(cyl(px, SL, Z_OUT + 0.45, 0.4, 0.3, 10, rot=(math.pi / 2, 0, 0)))
    colbx(-1.6, 0, Z_OUT - 2.4, 1.6, 2.2, Z_OUT + 0.6)
    return end()


# =====================================================================================================================
# Shops and houses: units 10 m wide (x -5 to 5), z -5.5 (back) to 5.5, the front +z.

def shop_shell(wall, accent):
    """the shared shop module: a plinth, a 9.6 x 4.4 x 8 m module, a parapet, the glazed front with its door, an awning on
    two posts, the fascia board"""
    Acc.of("concrete", 0.03).put(bx(-5.0, 0, -5.5, 5.0, 0.3, 5.5))
    colbx(-5.0, 0, -5.5, 5.0, 0.3, 5.5)
    w = Acc.of(wall, 0.08)                                        # back, sides and the header over the glazing: hollow, so the
    w.put(bx(-4.8, 0.3, -5.3, 4.8, 4.4, -5.0))                    # glazing shows the shop inside
    for sx in (-1, 1):
        w.put(bx(min(sx * 4.8, sx * 4.5), 0.3, -5.0, max(sx * 4.8, sx * 4.5), 4.4, 2.5))
    w.put(bx(-4.5, 3.6, 2.2, 4.5, 4.4, 2.5))
    colbx(-4.8, 0.3, -5.3, 4.8, 5.4, 2.5)
    Acc.of("roof", 0.04).put(bx(-4.9, 4.4, -5.4, 4.9, 5.4, 2.6))
    Acc.of(accent, 0.0).put(bx(-4.905, 4.45, -5.405, 4.905, 4.65, 2.605))
    Acc.of("glass", 0.0).put(bx(-4.3, 0.8, 2.5, 4.3, 3.6, 2.52))
    Acc.of("alu", 0.02).put(bx(-4.4, 0.3, 2.5, 4.4, 0.8, 2.62)).put(bx(-4.4, 3.6, 2.5, 4.4, 3.8, 2.62))
    for x in (-4.4, -1.6, 1.6, 4.4):
        Acc.of("alu", 0.02).put(bx(x - 0.1, 0.8, 2.5, x + 0.1, 3.6, 2.62))
    Acc.of("door", 0.0).put(bx(-1.5, 0.8, 2.48, 0.0, 3.4, 2.5))
    Acc.of("pave", 0.0).put(bx(-4.5, 0.31, -5.0, 4.5, 0.32, 2.4))                      # (the floor seen through the glass)
    # the awning: a sloped slab out from over the glazing on two posts at its edge
    Acc.of(accent, 0.04).put(xf(box(0, 0, 1.0, 9.6, 0.15, 2.4), (0, 4.1, 2.5), (0.2, 0, 0)))
    for x in (-4.4, 4.4):                                         # posts up to the slab's underside at z 4.5
        top = ay_awning(4.5) + 0.02
        Acc.of("steel", 0.02).put(bx(x - 0.08, 0.3, 4.42, x + 0.08, top, 4.58))
        col((x, 0.3, 4.5), shape="box", hx=0.08, hy=(top - 0.3) / 2, hz=0.08, yaw=0.0)
    col((0, 4.1 - math.sin(0.2) * 1.0 - 0.1, 2.5 + math.cos(0.2) * 1.0), shape="box", hx=4.8, hy=0.1, hz=1.2, yaw=0.0, pitch=0.2)
    Acc.of("dark", 0.03).put(bx(-SHOP_SIGN[3] / 2, 4.55, 2.5, SHOP_SIGN[3] / 2, 5.65, SHOP_SIGN[2] - 0.004))   # (the fascia board: the game writes on its face)
    # inside: a counter and back shelves
    Acc.of(accent, 0.02).put(bx(0.6, 0.32, -1.5, 4.0, 1.4, -0.7))
    for y in (1.2, 2.0, 2.8):
        Acc.of("alu", 0.0).put(bx(-4.2, y, -5.0, 4.2, y + 0.06, -4.6))
    for x in (-4.2, 0.0, 4.2):
        Acc.of("steel", 0.0).put(bx(x - 0.05, 0.32, -5.0, x + 0.05, 3.2, -4.92))


def build_shop(name, wall, accent, extra):
    begin(f"ilmb_shop_{name}")
    shop_shell(wall, accent)
    extra()
    return end()


def shop_extras():
    def canteen():          # a roof extract with its fan cowl; tables and stools inside
        Acc.of("steel", 0.03).put(bx(1.0, 5.4, -3.5, 3.0, 6.4, -1.5))
        Acc.of("dark", 0.02).put(cyl(2.0, 6.7, -2.5, 0.6, 0.6, 10))
        colbx(1.0, 5.4, -3.5, 3.0, 7.0, -1.5)
        for x in (-3.0, -1.0):
            Acc.of("white", 0.02).put(cyl(x, 1.05, 0.5, 0.5, 0.06, 12))
            Acc.of("steel", 0.0).put(cyl(x, 0.68, 0.5, 0.05, 0.7, 6))

    def suits():            # a suit on a stand in the window, a helmet rack
        Acc.of("white", 0.02).put(cyl(-2.8, 1.6, 1.3, 0.38, 1.5, 10))
        Acc.of("white", 0.02).put(ball(-2.8, 2.65, 1.3, 0.34, 10, 7))
        Acc.of("pane", 0.0).put(ball(-2.8, 2.65, 1.62, 0.18, 8, 5, (1.0, 0.8, 0.25)))
        Acc.of("dark", 0.0).put(cyl(-2.8, 0.55, 1.3, 0.05, 0.5, 6))
        for x in (-3.5, -2.5, -1.5, -0.5):
            Acc.of("gold", 0.0).put(ball(x, 2.31, -4.8, 0.25, 8, 6))

    def parts():            # a crate of wheels out front by the door, a hanging gear sign
        Acc.of("tire", 0.02).put(xf(cylinder(0.55, 0.55, 0.35, 12)[:2], (3.0, 0.85, 3.4), (math.pi / 2, 0, 0)))
        Acc.of("tire", 0.02).put(xf(cylinder(0.55, 0.55, 0.35, 12)[:2], (3.0, 0.85, 3.8), (math.pi / 2, 0, 0)))
        Acc.of("steel", 0.0).put(xf(cylinder(0.25, 0.25, 0.4, 8)[:2], (3.0, 0.85, 3.6), (math.pi / 2, 0, 0)))
        colbx(2.45, 0.3, 3.2, 3.55, 1.4, 4.0)
        Acc.of("gold", 0.02).put(xf(torus(0.45, 0.12, 12, 4), (-3.6, 3.0, 3.5), (math.pi / 2, 0, 0)))
        Acc.of("dark", 0.0).put(B((-3.6, 3.45, 3.5), (-3.6, ay_awning(3.5) + 0.04, 3.5), 0.02, 4, True))

    def noodle():           # a row of red lanterns under the awning, a steaming pot on the counter
        for x in (-3.6, -1.2, 1.2, 3.6):
            y = ay_awning(3.6)
            Acc.of("dark", 0.0).put(B((x, y + 0.04, 3.6), (x, y - 0.5, 3.6), 0.015, 4, True))
            Acc.of("redlamp", 0.0).put(ball(x, y - 0.75, 3.6, 0.25, 8, 6, (1.0, 1.3, 1.0)))
        Acc.of("steel", 0.02).put(cyl(2.3, 1.6, -1.1, 0.4, 0.5, 10))

    def clinic():           # a lit green cross on the fascia's end, a gurney in the window
        Acc.of("green", 0.0).put(bx(3.5, 4.85, 2.4, 4.4, 5.15, 2.64)).put(bx(3.8, 4.55, 2.4, 4.1, 5.45, 2.64))
        Acc.of("white", 0.02).put(bx(-3.6, 0.9, 0.6, -1.4, 1.05, 1.4))
        for x in (-3.4, -1.6):
            Acc.of("steel", 0.0).put(cyl(x, 0.6, 1.0, 0.04, 0.6, 6))
    return {"canteen": ("cream", "orange", canteen), "suits": ("white", "blue", suits), "parts": ("panel", "gold", parts),
            "noodle": ("cream", "red", noodle), "clinic": ("white", "mint", clinic)}


def ay_awning(z):
    """the awning's underside height at z (a 0.15 slab sloping down 0.2 rad from z 2.5, y 4.1)"""
    return 4.1 - math.tan(0.2) * (z - 2.5) - 0.075 / math.cos(0.2)


def porch(x, w, wall_z, y_floor=0.3):
    """a porch: a step, a canopy on two posts, a lamp; the door in the wall at wall_z"""
    Acc.of("door", 0.0).put(bx(x - 0.65, y_floor, wall_z, x + 0.65, y_floor + 2.45, wall_z + 0.006))
    Acc.of("concrete", 0.02).put(bx(x - w / 2, 0, wall_z, x + w / 2, y_floor, wall_z + 2.0))
    Acc.of("alu", 0.03).put(bx(x - w / 2 - 0.2, 3.0, wall_z, x + w / 2 + 0.2, 3.2, wall_z + 2.2))
    for sx in (-w / 2, w / 2):
        Acc.of("alu", 0.02).put(bx(x + sx - 0.06, y_floor, wall_z + 1.95, x + sx + 0.06, 3.0, wall_z + 2.07))
    Acc.of("lamp", 0.0).put(bx(x - 0.3, 2.9, wall_z + 0.9, x + 0.3, 3.0, wall_z + 1.3))
    col((x, 0, wall_z + 1.0), shape="box", hx=w / 2, hy=y_floor / 2, hz=1.0, yaw=0.0)   # (the step, at its top)
    col((x, 3.0, wall_z + 1.1), shape="box", hx=w / 2 + 0.2, hy=0.1, hz=1.1, yaw=0.0)


def build_house_a():
    """A stacked two-storey hab: a ground module 9 x 3.4 x 8 m, an upper module set back with a railed roof deck in front of
    it, porthole windows, a porch, a colour band (pink)."""
    begin("ilmb_house_a")
    Acc.of("concrete", 0.03).put(bx(-5.0, 0, -5.5, 5.0, 0.3, 4.0))
    colbx(-5.0, 0, -5.5, 5.0, 0.3, 4.0)
    Acc.of("cream", 0.08).put(bx(-4.5, 0.3, -5.0, 4.5, 3.7, 3.0))
    colbx(-4.5, 0.3, -5.0, 4.5, 3.7, 3.0)
    Acc.of("pink", 0.0).put(bx(-4.51, 3.2, -5.01, 4.51, 3.5, 3.01))
    Acc.of("white", 0.07).put(bx(-4.0, 3.7, -5.0, 4.0, 6.8, -0.5))
    Acc.of("roof", 0.04).put(bx(-4.2, 6.8, -5.2, 4.2, 7.1, -0.3))
    colbx(-4.2, 3.7, -5.2, 4.2, 7.1, -0.3)
    Acc.of("pave", 0.0).put(bx(-4.4, 3.705, -0.5, 4.4, 3.715, 2.9))
    railing(Acc.of("pink", 0.0), Acc.of("steel", 0.0), [(-4.4, 3.7, 2.9), (4.4, 3.7, 2.9)], every=1.4)
    for sx in (-4.4, 4.4):
        railing(Acc.of("pink", 0.0), Acc.of("steel", 0.0), [(sx, 3.7, -0.4), (sx, 3.7, 2.9)], every=1.4)
    col((0, 3.7, 2.9), shape="box", hx=4.4, hy=0.55, hz=0.06, yaw=0.0)
    for x in (-2.6, 2.6):
        Acc.of("window", 0.0).put(xf(cylinder(0.55, 0.55, 0.06, 14)[:2], (x, 2.0, 3.0), (math.pi / 2, 0, 0)))
        Acc.of("alu", 0.0).put(xf(torus(0.58, 0.07, 14, 4), (x, 2.0, 3.03), (math.pi / 2, 0, 0)))
    for x in (-2.0, 2.0):
        Acc.of("window", 0.0).put(bx(x - 1.0, 4.6, -0.5, x + 1.0, 6.0, -0.494))
    Acc.of("door", 0.0).put(bx(-0.6, 3.715, -0.5, 0.6, 6.0, -0.494))
    porch(0.0, 2.4, 3.0)
    Acc.of("steel", 0.02).put(cyl(3.0, 7.36, -3.0, 0.08, 0.52, 6))
    Acc.of("white", 0.02).put(xf(sphere(0.5, 10, 4, math.pi / 2)[:2], (3.0, 8.1, -3.0), (math.pi, 0, 0)))
    return end()


def build_house_b():
    """A pair of lying hab drums (2.9 m radius, 8.6 long, flat-ended) on cradles, one stacked crosswise on the other, an airlock porch
    on the front, a window band round each, solar panels on the top drum (blue)."""
    begin("ilmb_house_b")
    Acc.of("concrete", 0.03).put(bx(-5.0, 0, -5.5, 5.0, 0.3, 5.0))
    colbx(-5.0, 0, -5.5, 5.0, 0.3, 5.0)
    r, L = 2.9, 8.6                                                   # (flat-ended: the drum fits the 10 m unit)
    cy = 0.3 + 0.6 + r
    Acc.of("white", 0.08).put(xf(cylinder(r, r, L, 20)[:2], (0, cy, -1.2), (0, 0, math.pi / 2)))
    for sx in (-1, 1):                                                # end rings, a hand proud of the drum
        Acc.of("blue", 0.04).put(xf(cylinder(r + 0.12, r + 0.12, 0.4, 20)[:2], (sx * (L / 2 - 0.2), cy, -1.2), (0, 0, math.pi / 2)))
    for sx in (-3.0, 3.0):
        Acc.of("steel", 0.02).put(bx(sx - 0.25, 0.3, -1.2 - 2.0, sx + 0.25, cy - r + 0.3, -1.2 + 2.0))
        colbx(sx - 0.25, 0.3, -1.2 - 2.0, sx + 0.25, cy - r + 0.3, -1.2 + 2.0)
    for x in (-2.9, 2.9):                                             # (windows on the drum's front, either side of the airlock)
        Acc.of("window", 0.0).put(bx(x - 0.9, cy - 0.4, -1.2 + r - 0.03, x + 0.9, cy + 0.4, -1.2 + r + 0.005))
    col((0, cy, -1.2), shape="hcyl", r=r + 0.12, len=L, yaw=math.pi / 2)
    r2, L2 = 2.2, 6.4
    cy2 = cy + r + r2 - 0.1
    Acc.of("cream", 0.07).put(xf(cylinder(r2, r2, L2, 18)[:2], (0, cy2, -1.2), (math.pi / 2, 0, 0)))
    for sz in (-1, 1):
        Acc.of("blue", 0.02).put(cyl(0, cy2, -1.2 + sz * L2 / 2, r2 + 0.05, 0.3, 18, rot=(math.pi / 2, 0, 0)))
    col((0, cy2, -1.2), shape="hcyl", r=r2, len=L2, yaw=0.0)
    for x in (-1.2, 1.2):
        solar_panel(Acc.of("steel", 0.02), Acc.of("navy", 0.0), Acc.of("steel", 0.0), x, cy2 + r2 - 0.4, -1.2, math.pi / 2, w=2.6, d=1.8, tilt=0.3, h=0.5)
        col((x, cy2 + r2 - 0.4, -1.2), shape="box", hx=1.0, hy=0.55, hz=1.4, yaw=0.0)
    Acc.of("cream", 0.05).put(bx(-1.5, 0.3, -1.2 + r - 0.4, 1.5, 3.4, 3.6))
    colbx(-1.5, 0.3, -1.2 + r - 0.4, 1.5, 3.4, 3.6)
    Acc.of("blue", 0.0).put(bx(-1.51, 3.0, -1.2 + r - 0.4, 1.51, 3.2, 3.61))
    porch(0.0, 2.0, 3.6)
    return end()


def build_house_c():
    """A tower and a wing: a three-storey tower 4.6 m square with a window per floor and a lit lantern on its roof, beside a
    one-storey wing with a glass skylight dome (orange)."""
    begin("ilmb_house_c")
    Acc.of("concrete", 0.03).put(bx(-5.0, 0, -5.5, 5.0, 0.3, 4.0))
    colbx(-5.0, 0, -5.5, 5.0, 0.3, 4.0)
    Acc.of("cream", 0.08).put(bx(-4.6, 0.3, -4.6, 0.0, 9.6, 0.0))
    colbx(-4.8, 0.3, -4.8, 0.2, 9.9, 0.2)
    colbx(-3.45, 9.9, -3.45, -1.15, 11.45, -1.15)
    Acc.of("orange", 0.0).put(bx(-4.61, 3.3, -4.61, 0.01, 3.5, 0.01)).put(bx(-4.61, 6.4, -4.61, 0.01, 6.6, 0.01))
    Acc.of("roof", 0.04).put(bx(-4.8, 9.6, -4.8, 0.2, 9.9, 0.2))
    for y in (4.6, 7.6):
        Acc.of("window", 0.0).put(bx(-3.4, y, 0.0, -1.2, y + 1.3, 0.006))
    Acc.of("glass", 0.0).put(bx(-3.3, 9.9, -3.3, -1.3, 11.2, -1.3))
    Acc.of("lamp", 0.0).put(bx(-2.6, 9.9, -2.6, -2.0, 10.9, -2.0))
    Acc.of("alu", 0.02).put(bx(-3.45, 11.2, -3.45, -1.15, 11.45, -1.15))
    for sx in (-3.35, -1.25):
        for sz in (-3.35, -1.25):
            Acc.of("alu", 0.0).put(bx(sx - 0.05, 9.9, sz - 0.05, sx + 0.05, 11.2, sz + 0.05))
    Acc.of("white", 0.07).put(bx(0.0, 0.3, -5.0, 4.6, 3.6, 2.6))
    colbx(0.0, 0.3, -5.1, 4.7, 3.8, 2.7)
    col((2.3, 3.8, -1.2), shape="sphere", r=1.1)
    Acc.of("orange", 0.0).put(bx(-0.01, 3.1, -5.01, 4.61, 3.3, 2.61))
    Acc.of("roof", 0.03).put(bx(-0.1, 3.6, -5.1, 4.7, 3.8, 2.7))
    Acc.of("glass", 0.0).put(xf(sphere(1.3, 14, 5, math.pi / 2)[:2], (2.3, 3.8, -1.2)))
    Acc.of("alu", 0.0).put(ring(1.3, 0.08, 3.8, 20, 4, t=(2.3, 0, -1.2)))
    Acc.of("window", 0.0).put(bx(1.2, 1.4, 2.6, 3.8, 2.6, 2.606))
    porch(-2.3, 2.0, 0.0)
    return end()


# =====================================================================================================================
# Parking: a bay (the game lays them side by side round the circle and parks cars in some), and the lot's lamp.

def build_lot_bay(name, w, d):
    """one parking bay w x d: a paved slab, half a white line down each side (two bays side by side make a whole one), a
    wheel stop and a kerb at the back; open at its front (+z)"""
    begin(f"ilmb_{name}")
    Acc.of("pave", 0.02).put(bx(-w / 2, 0, -d / 2, w / 2, 0.06, d / 2))
    for sx in (-1, 1):
        x0, x1 = sorted((sx * w / 2, sx * (w / 2 - 0.07)))
        Acc.of("paint_white", 0.0).put(bx(x0, 0.06, -d / 2, x1, 0.07, d / 2 - 0.5))
    Acc.of("concrete", 0.01).put(bx(-0.9, 0.06, -d / 2 + 0.7, 0.9, 0.2, -d / 2 + 0.95))
    Acc.of("concrete", 0.02).put(bx(-w / 2, 0, -d / 2 - 0.35, w / 2, 0.22, -d / 2))
    Acc.of("paint_gold", 0.0).put(bx(-w / 2, 0.22, -d / 2 - 0.25, w / 2, 0.23, -d / 2 - 0.1))
    return end()


def build_lot_lamp():
    """a lot's lamp post and charge point: a 6.5 m pole on its footing, an arm out over the bays (+z), the lamp under it;
    a charging pedestal beside it, its cable coiled on a hook"""
    begin("ilmb_lot_lamp")
    Acc.of("concrete", 0.02).put(cyl(0, 0.15, 0, 0.35, 0.3, 10))
    Acc.of("steel", 0.02).put(cyl(0, 0.3 + 3.1, 0, 0.12, 6.2, 8, rt=0.09))
    Acc.of("steel", 0.01).put(B((0, 6.3, -0.05), (0, 6.5, 1.6), 0.06, 4, True))
    Acc.of("dark", 0.01).put(bx(-0.25, 6.28, 1.2, 0.25, 6.5, 1.9))
    Acc.of("lamp", 0.0).put(bx(-0.2, 6.25, 1.25, 0.2, 6.28, 1.85))
    Acc.of("white", 0.02).put(bx(0.45, 0.0, -0.18, 0.95, 1.3, 0.18))
    Acc.of("cyan", 0.0).put(bx(0.53, 0.9, 0.18, 0.87, 1.15, 0.186))
    Acc.of("gold", 0.0).put(bx(0.449, 1.15, -0.181, 0.951, 1.3, 0.181))
    Acc.of("dark", 0.0).put(ring(0.16, 0.035, 0.0, 10, 4, rot=(math.pi / 2, 0, 0), t=(0.7, 0.6, 0.2)))
    col((0, 0, 0), shape="cyl", r=0.2, h=6.5)
    col((0.7, 0, 0), shape="box", hx=0.25, hy=0.65, hz=0.18, yaw=0.0)
    return end()


def build_quarters():
    build_lot_bay("lot_bay", 4.6, 8.0)
    build_lot_bay("lot_bay_wide", 4.4, 8.4)
    build_lot_lamp()
    build_terminal_pax()
    build_cargo_shed()
    build_motorpool()
    build_fuel_island()
    build_tank()
    build_pump_house()
    build_pipe_bridge()
    for name, (wall, accent, extra) in shop_extras().items():
        build_shop(name, wall, accent, extra)
    build_house_a()
    build_house_b()
    build_house_c()
