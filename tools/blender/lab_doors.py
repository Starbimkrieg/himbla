# The Antimatter Lab's airlock doors (build_zbornak_lab.py execs this; LAB_DOOR picks one, LAB_DOOR_OPEN poses it). The game
# has the vault (the default). The first doors ("slot", kept to compare) were a plain disc: the outer one sinks 6 m into a slot in the plaza, past the
# hazard ring and the sill, the inner one rises into the portal's wall. These two drafts keep every moving part where it
# can't cut through anything:
#
#   split   CHEVRON SPLIT: each door is two leaves meeting on a stepped seam (a chevron tooth above the lock hub and one
#           below it, interlocked), lit lime along the seam and round the hub's halves. They part sideways into pockets
#           inside the wall (outer: the housing's front wall and its side blocks; inner: the portal wall, into the ring
#           wall), never crossing the hazard ring, which stands clear in front of them.
#   vault   VAULT HATCH: a thick stepped plug seated in the hazard ring, a lock wheel on its face (six spokes, a lit core, a
#           lit channel), two hinge straps to a pin in knuckles on wall brackets beside the ring. It swings about the pin
#           (outer: out onto the plaza, on the camera's side; inner: into the lab, away from the equipment corner) and
#           stands open beside the doorway. Its hinge sits ahead of the ring, so the plug's near edge moves inward as it
#           turns and clears the ring all the way.
#
# DOORS holds each moving part (pivot, kind, amount) so a preview can pose it: kind "slide" moves the pivot along x by
# amount * t, "swing" turns it about the vertical by amount * t (radians). t = LAB_DOOR_OPEN (0 shut, 1 open).

DOOR_VARIANT = os.environ.get("LAB_DOOR", "vault")                         # (the one in the game)
DOOR_OPEN = float(os.environ.get("LAB_DOOR_OPEN", "0"))
DOORS = []


def door_arc(r, a0, a1, n):
    return [(r * math.cos(a0 + (a1 - a0) * i / n), r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


# ---- CHEVRON SPLIT ----------------------------------------------------------------------------------------------------
def split_seam(r, yb, a=0.34):
    """the seam from the top down: straight, a tooth jutting right above the hub, straight through the hub, a tooth
    jutting left below it, straight to the bottom"""
    return [(0.0, r), (0.0, 2.15), (a, 1.6), (0.0, 1.05), (0.0, -1.05), (-a, -1.6), (0.0, -2.15), (0.0, yb)]


def split_leaf(g, side, r, yb, th, faces, travel):
    """one leaf (side +1 right, -1 left) of a split door of radius r, cut flat at yb, th thick, built in pivot g; faces:
    the z signs of the faces that get the lit seam and the hub's half (both: the tube sees the back)"""
    seam = [(x + side * 0.012, y) for x, y in split_seam(r, yb)]               # (2.4 cm gap between the leaves)
    xb = math.sqrt(r * r - yb * yb)
    ab = math.atan2(yb, side * xb)
    if side > 0:
        rim = door_arc(r, ab, PI / 2, 28)[:-1]
        outline = seam + [(xb, yb)] + rim[1:]
    else:
        rim = door_arc(r, PI / 2, ab + TAU, 28)[1:]
        outline = seam[::-1] + rim[:-1] + [(-xb, yb)]
    g("door", 0.03).polyz(outline, -th / 2, th / 2)
    for f in faces:
        zf = f * (th / 2 + 0.004)
        # the lit seam: a strip along each run of the seam, set in 7 cm from the edge
        for (x0, y0), (x1, y1) in zip(seam, seam[1:]):
            ln = math.hypot(x1 - x0, y1 - y0)
            if ln < 0.05:
                continue
            a = math.atan2(y1 - y0, x1 - x0)
            mx, my = (x0 + x1) / 2 + side * 0.075, (y0 + y1) / 2
            if abs(my) < 0.75:
                continue                                                      # (the hub covers it)
            g("lime", 0.0).boxc(mx, my, zf, ln, 0.05, 0.008, (0, 0, a))
        # the hub's half: a dark half-disc with a lit half-ring and a steel boss, cut on the seam's straight run
        hub = [(0.0, 0.7)] + door_arc(0.7, PI / 2, -PI / 2, 16)[1:-1] + [(0.0, -0.7)] if side > 0 else \
              [(0.0, -0.7)] + door_arc(0.7, -PI / 2, -3 * PI / 2, 16)[1:-1] + [(0.0, 0.7)]
        hub = [(x + side * 0.012, y) for x, y in hub]
        g("dark", 0.015).polyz(hub, zf - 0.004, zf + f * 0.035)
        ring = [(side * (0.012 + 0.52 * math.sin(PI * k / 16)), 0.52 * math.cos(PI * k / 16), zf + f * 0.035) for k in range(17)]
        g("lime", 0.0).path(ring, 0.025, 5)
        # ribs fanning out from the hub, studs round the rim (steel, inked: they stand proud)
        for deg in (-60, -25, 25, 60):
            c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
            p0 = (side * 0.95 * c, 0.95 * s, zf + f * 0.02)
            p1 = (side * (r - 0.45) * c, (r - 0.45) * s, zf + f * 0.02)
            g("steel", 0.01).bm(p0, p1, 0.03, 6)
        for k in range(7):
            a = -PI / 2 + PI * (k + 0.5) / 7
            x, y = side * (r - 0.22) * math.cos(a), (r - 0.22) * math.sin(a)
            if y > yb + 0.15:
                g("steel", 0.01).cylc(x, y, zf + f * 0.015, 0.08, 0.04, 8, "z")
    DOORS.append((g.root, "slide", side * travel))


def split_door(parent, name, x, y, z, r, yb, th, faces, travel):
    """a split door's two leaves, each its own pivot at the door's centre (role door, `leaf` +1 / -1, `travel` metres)"""
    for side in (1, -1):
        leaf = G(f"{name}_{'r' if side > 0 else 'l'}", parent, x, y, z, solid=False, role="door")
        leaf.root["leaf"], leaf.root["travel"] = side, side * travel
        split_leaf(leaf, side, r, yb, th, faces, travel)


# ---- VAULT HATCH --------------------------------------------------------------------------------------------------------
def vault_door(lab, parent, name, cy, zc, r, f, s, hx, zwall, floor_y, swing=math.radians(100)):
    """a vault hatch of radius r centred (0, cy, zc), its face toward f (+1 = +z), hinged on side s (+1 = +x) about a pin at
    x = hx, a hinge offset in front of the plug; the wall's face (where the brackets stand) at z = zwall. The pivot is the
    pin (role door, `swing` radians); everything that turns hangs from it. On the floor (its top at floor_y) a dashed hazard
    arc marks where the far edge sweeps."""
    hz = zc + f * 0.45
    g = G(name, parent, hx, 0.0, hz, solid=False, role="door")
    cx, dz = -hx, zc - hz                                                     # the plug's centre in the pin's frame
    # for the game (labWorld.js): the turn (signed: about +y, three.js), the plug's centre and radius in the pin's frame, and
    # how far its far edge reaches from the pin (the swept circle, kept clear of the stand plate)
    g.root["swing"], g.root["dcx"], g.root["dcz"], g.root["dr"] = s * f * swing, cx, dz, r
    g.root["reach"] = math.hypot(abs(cx) + r, abs(dz) + 0.32)
    lab.mark("spot", (hx, cy, hz), 0, spot=name.split("_")[0] + "_hinge")
    rot = (f * PI / 2, 0, 0)                                                  # (a lathe's y along the face normal)
    # the plug: stepped, its back sunk in the ring, a raised boss in front
    prof = [(0.0, -0.25), (r - 0.1, -0.25), (r, -0.15), (r, 0.12), (r - 0.15, 0.25), (r - 0.65, 0.25), (r - 0.75, 0.32), (0.0, 0.32)]
    g("door", 0.03).lath(prof, (cx, cy, dz), 40, rot)
    # the lock wheel: a rim on six spokes round a lit core, a lit channel in the step
    zw = dz + f * 0.39
    g("steel", 0.02).tor(1.25, 0.07, (cx, cy, zw), (PI / 2, 0, 0), n=32, rs=6)
    for k in range(6):
        a = TAU * k / 6 + PI / 6
        g("steel", 0.02).bm((cx + 0.3 * math.cos(a), cy + 0.3 * math.sin(a), zw), (cx + 1.25 * math.cos(a), cy + 1.25 * math.sin(a), zw), 0.05, 6)
    g("dark", 0.02).cylc(cx, cy, dz + f * 0.37, 0.42, 0.12, 20, "z")
    g("lime", 0.0).cylc(cx, cy, dz + f * 0.435, 0.26, 0.02, 20, "z")
    g("lime", 0.0).tor(r - 0.4, 0.045, (cx, cy, dz + f * 0.25), (PI / 2, 0, 0), n=40, rs=5)
    for k in range(12):                                                       # the locking dogs' heads on the step (none stand out
        a = TAU * (k + 0.5) / 12                                              # of the rim: the plug turns out of the ring clean)
        g("steel", 0.012).cylc(cx + (r - 0.24) * math.cos(a), cy + (r - 0.24) * math.sin(a), dz + f * 0.28, 0.08, 0.08, 8, "z")
    # the back (the tube sees it shut, the plaza or the lab once it's open): a dark dish, a steel ring braced across it,
    # a lit pressure gauge at the middle
    zb_ = dz - f * 0.25
    g("dark", 0.0).cylc(cx, cy, zb_ - f * 0.003, r - 0.5, 0.006, 32, "z")
    g("steel", 0.015).tor(r - 0.7, 0.06, (cx, cy, zb_ - f * 0.06), (PI / 2, 0, 0), n=36, rs=6)
    for k in range(4):
        a = PI / 4 + PI * k / 2
        g("steel", 0.015).bm((cx + 0.3 * math.cos(a), cy + 0.3 * math.sin(a), zb_ - f * 0.06),
                             (cx + (r - 0.7) * math.cos(a), cy + (r - 0.7) * math.sin(a), zb_ - f * 0.06), 0.05, 6)
    g("steel", 0.015).cylc(cx, cy, zb_ - f * 0.06, 0.32, 0.12, 16, "z")
    g("lime", 0.0).cylc(cx, cy, zb_ - f * 0.125, 0.2, 0.01, 16, "z")
    # hinge: two straps from the face to knuckles on the pin, the pin itself
    for dy in (-1.4, 1.4):
        g("steel", 0.02).bm((cx + s * 0.55, cy + dy, dz + f * 0.4), (0.0, cy + dy, 0.0), 0.08, 6)
        g("steel", 0.02).cylc(0.0, cy + dy, 0.0, 0.18, 0.5, 12)
    g("metal", 0.012).cylc(0.0, cy, 0.0, 0.09, 4.85, 10)                         # (from the lowest knuckle to the highest)
    DOORS.append((g.root, "swing", s * f * swing))                           # (the far edge out, away from the wall)
    # the sweep, painted on the floor just outside the far edge's arc: hazard dashes on dark, an end tick (1.8 cm proud: over
    # the lab floor's strips); none within 0.5 m of the wall (outside, that's off the plaza)
    reach = g.root["reach"]
    d0 = math.atan2(cx, dz)                                                   # (about +y a turn takes (z, x) round: angle atan2(x, z))
    sw = s * f * swing
    n = 22
    for i in range(n):
        a0, a1 = d0 + sw * i / n, d0 + sw * (i + 1) / n
        am, ln = (a0 + a1) / 2, (reach + 0.15) * abs(a1 - a0)
        px, pz = hx + math.sin(am) * (reach + 0.15), hz + math.cos(am) * (reach + 0.15)
        if f * (pz - zwall) < 0.5 + 0.07 * abs(math.cos(am)):
            continue
        lab("hazard" if i % 2 == 0 else "dark", 0.0).boxc(px, floor_y + 0.009, pz, 0.14, 0.018, ln + 0.004, (0, am, 0))
    a = d0 + sw
    px, pz = hx + math.sin(a) * (reach + 0.15), hz + math.cos(a) * (reach + 0.15)
    lab("hazard", 0.0).boxc(px, floor_y + 0.009, pz, 0.6, 0.018, 0.1, (0, a, 0))
    # the wall's knuckles: a bracket from the wall to each, on a plate (static: the lab's)
    zb = (zwall + hz) / 2
    for dy in (-2.2, 0.0, 2.2):
        y = cy + dy
        lab("steel", 0.02).cylc(hx, y, hz, 0.18, 0.45, 12)
        lab("steel", 0.02).boxc(hx + s * 0.28, y, zb, 0.36, 0.3, abs(hz - zwall))
        lab("dark", 0.02).boxc(hx + s * 0.3, y, zwall + f * 0.03, 0.6, 0.6, 0.06)
    return g


# ---- the two doorways ---------------------------------------------------------------------------------------------------
def outer_door_draft(lab, z1, DY):
    """the housing's door (its front wall z1+5.6 to z1+6.0, the hazard ring at z1+6.05, the opening r 2.95 at DY)"""
    if DOOR_VARIANT == "split":
        lab("hazard", 0.03).tor(2.85, 0.28, (0, DY, z1 + 6.2), (PI / 2, 0, 0), n=40, rs=6)    # (clear of the leaves' faces)
        split_door(lab.root, "outer_door", 0, DY, z1 + 5.76, 3.05, -DY + 0.02, 0.16, (1, -1), 3.1)
    else:
        lab("hazard", 0.03).tor(2.85, 0.28, (0, DY, z1 + 6.05), (PI / 2, 0, 0), n=40, rs=6)
        vault_door(lab, lab.root, "outer_door", DY, z1 + 6.05, 2.55, 1, 1, 3.45, z1 + 6.0, 0.08)        # (on the plaza's top)


def inner_door_draft(lab, PZ, T, HY, HR):
    """the portal's door (the portal wall PZ - T/2 to PZ + T/2, the hole r HR at HY, its hazard ring on the lab side)"""
    if DOOR_VARIANT == "split":
        split_door(lab.root, "inner_door", 0, HY, PZ, HR + 0.15, -HY + 0.01, 0.16, (1, -1), 3.05)
    else:
        vault_door(lab, lab.root, "inner_door", HY, PZ - T / 2 - 0.1, HR - 0.1, -1, -1, -3.5, PZ - T / 2, 0.06)    # (on the floor's top)


def pose_doors(t):
    """set every moving door part to t (0 shut, 1 open)"""
    for o, kind, amt in DOORS:
        if "rest" not in o:
            o["rest"] = (o.location.x, o.rotation_euler[2])
        x0, r0 = o["rest"]
        if kind == "slide":
            o.location.x = x0 + amt * t
        else:
            o.rotation_euler[2] = r0 + amt * t
