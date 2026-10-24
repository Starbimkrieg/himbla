# Dish builder for Blender (4.2+ / 5.x): the two big-dish station designs of the research arrays (Shackleton, Farside), the
# small bases' field dish and a light dish head, exported to src/assets/dish.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_dish.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_dish.py
#
#   dish_cryo     CRYO RECEIVER, the Prospector's He-3 tanker on end: banded vessel on a dark skirt, faction dome, winding gantry
#                 stair, valve cabinet, branding panel; banded dish feeding a dewar at its focus.
#   dish_gantry   GANTRY STATION (crane + Prospector containers): faction lattice mast with caged ladder and rest platforms over
#                 a yard of container control rooms, red battery bank, fuel tank; dish on radial lattice trusses.
#   dish_field    FIELD DISH for small bases (ILMB, Daedalus relay, Vostok and Daedalus posts, Asset Row): eight-sided three-stage
#                 tower (caged ladder, cable duct, gallery) over a container equipment room (air-handler, warning signs); the
#                 gantry station's reflector in the same slots (body: cowl, flanges, gallery, room, trusses, quadpod; stripe:
#                 half the rim blocks, feed band). No station number; its liveries (tower and room) include Daedalus.
#   dish_head     DISH HEAD: the field dish's reflector, trunnions, neck and feed with no tower, ~a fifth of the triangles, for
#                 small dishes (rim under 3 m) on masts, roofs and posts. Only yaw and tilt pivots; neck foot at y = 21.2 (the game
#                 sets it on its carrier); same body and stripe slots.
#
# Each station is its own root at a 30 m mount size (rim 14.1 m out, 6.8 m deep, tilt pivot 28.5 m up), ground y = 0 at the
# base's middle, +z the front (panel, cabinet, container doors). The game scales uniformly (size / 30). Pivots (empties with a `role`):
#   yaw       neck top (y = 28.5), turned about y: the neck's turning column, head block and ears
#   tilt      child of yaw at its origin, turned about x: trunnion drum, reflector (axis +y), back structure, rim, quadpod or
#             tripod, feed
#   blinker   aircraft warning lamps (extra `radius`); the game puts a blinking lamp on each. Off the root or off tilt.
#   livery    one per faction (extra `faction`): emblem and name on the panel / container plates. The game keeps the array's.
#   number    one per station number (extra `no`, "01".."04"): digits on the branding panel (cryo) or fascia (gantry). The game
#             keeps the dish's.
# Roots carry `size` (30) and `radius` (footprint reach, m). One material per mesh, named after a slot: body, stripe, accent and
# label take faction colours (DISH_COLORS in src/models.js); the rest are fixed. No colliders in the file: the game places them
# from these dimensions (settlements.js dishStation).

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_dish.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("DISH_OUT") or os.path.join(REPO, "src", "assets", "dish.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Dish export ->", OUT)
COLL = "MoonDish"

# preview colours (Meridian livery); the game swaps in its own materials
SLOT_COLORS = {
    "body": (0.18, 0.77, 1.0), "stripe": (1.0, 0.96, 0.88), "accent": (1.0, 0.82, 0.25), "label": (0.09, 0.22, 0.37),
    "dark": (0.16, 0.14, 0.25), "steel": (0.33, 0.38, 0.48), "metal": (0.54, 0.53, 0.63), "concrete": (0.54, 0.52, 0.6),
    "white": (0.95, 0.93, 0.89), "dish": (1.0, 0.96, 0.88), "seam": (0.54, 0.53, 0.63), "tank": (0.78, 0.84, 0.92),
    "glass": (0.61, 0.9, 1.0), "window": (1.0, 0.96, 0.65), "lamp": (1.0, 0.96, 0.66), "tail": (1.0, 0.16, 0.29),
    "green": (0.49, 1.0, 0.42), "hot": (1.0, 0.62, 0.11), "hazard": (1.0, 0.82, 0.25), "brand": (0.08, 0.64, 0.72),
    "redsafe": (0.79, 0.13, 0.18), "blue": (0.11, 0.39, 0.84),
}

# shared geometry/scene helpers, then the lettering / emblem / signage kit
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())
LAYER = 0.02    # decal stand-off, larger than on vehicles: read from 100 m
exec(open(os.path.join(REPO, "tools", "blender", "dishkit.py"), encoding="utf-8").read(), globals())   # reflector, mount, head

C = coll()
for s in SLOT_COLORS:
    material(s)

PFX = ""
NUMBERS = ("01", "02", "03", "04")


# ---------------- scene helpers ----------------
def M(name, geo, slot, parent, ink=0.04):
    """A station-prefixed mesh; outlines under 4 cm are dropped (they don't read)."""
    return mesh(PFX + name, geo, slot, parent, ink if ink >= 0.04 else 0)


def rb(name, hx, hy, hz, pos, slot, parent, ink=0.1, e=0.06, rot=(0, 0, 0)):
    """Rounded box (half extents) for big bodies."""
    return M(name, xf(rbox(hx, hy, hz, e, 6, 3), pos, rot), slot, parent, ink)


def bx(name, hx, hy, hz, pos, slot, parent, ink=0.0, rot=(0, 0, 0)):
    return M(name, cube(hx, hy, hz, pos, rot), slot, parent, ink)


def bm(name, a, b, r, slot, parent, ink=0.0, seg=6):
    return M(name, beam(a, b, r, seg), slot, parent, ink)


def PV(name, pos, parent=None, **props):
    return pivot(PFX + name, pos, parent, **props)


def page(face, origin):
    return Dec(face, origin, 0.04)


def unit(name):
    """New station: root pivot (named exactly `name`), yaw, tilt, and the name prefix for its parts."""
    global PFX
    PFX = name + "_"
    root = pivot(name, (0, 0, 0), None, size=30.0)
    yaw = PV("yaw", (0, YP, 0), root, role="yaw")
    tilt = PV("tilt", (0, 0, 0), yaw, role="tilt")
    return root, yaw, tilt


def liveries(root, factions=FACTIONS):
    """One livery pivot per faction (role livery); the game keeps only the matching one."""
    return {f: PV(f"livery_{f}", (0, 0, 0), root, role="livery", faction=f) for f in factions}


def numbers(root):
    return {n: PV(f"no_{n}", (0, 0, 0), root, role="number", no=n) for n in NUMBERS}


def warn_sign(d, u, v, w, h, layer=0, head="WARNING", lines=("RF RADIATION", "KEEP CLEAR")):
    """Yellow warning board, (u, v) lower-left: dark header word, RF icon, two legend lines."""
    d.rect(u - 0.05, v - 0.05, u + w + 0.05, v + h + 0.05, "dark", layer)
    d.rect(u, v, u + w, v + h, "hazard", layer + 1)
    hh = h * 0.27
    d.rect(u, v + h - hh, u + w, v + h, "dark", layer + 2)
    ps = min(hh * 0.62 / 7, (w * 0.86) / (len(head) * 6 - 1))
    d.text(head, u + w / 2, v + h - hh + (hh - 7 * ps) / 2, ps, "hazard", layer + 3, "c")
    cu, cv = u + w / 2, v + (h - hh) * 0.66      # RF icon: a dot with two arcs each side
    rr = (h - hh) * 0.2
    d.disc(cu, cv, rr * 0.28, "dark", layer + 2, 10)
    for r0, r1 in ((rr * 0.55, rr * 0.72), (rr * 0.9, rr * 1.07)):
        d.ring(cu, cv, r0, r1, "dark", layer + 2, 20, -0.9, 0.9)
        d.ring(cu, cv, r0, r1, "dark", layer + 2, 20, PI - 0.9, PI + 0.9)
    ps2 = min((w * 0.9) / (max(len(s) for s in lines) * 6 - 1), (h - hh) * 0.2 / 7)
    for i, s in enumerate(lines):
        d.text(s, u + w / 2, v + (h - hh) * 0.1 + (len(lines) - 1 - i) * 9 * ps2, ps2, "dark", layer + 2, "c")


def container(root, name, cx, cz, y0, slot, ribbed, L=9.6, W=3.5, H=3.3):
    """Container on corner castings, length along z; optional ribs down each flank."""
    hx, hz = W / 2, L / 2
    rb(name, hx, H / 2, hz, (cx, y0 + H / 2, cz), slot, root, 0.1, 0.05)
    M(name + "Castings", join([cube(0.34, H / 2 + 0.04, 0.34, (cx + sx * (hx - 0.2), y0 + H / 2, cz + sz * (hz - 0.2))) for sx in (-1, 1) for sz in (-1, 1)]), "dark", root, 0)
    if ribbed:
        n = int(L / 0.46)
        M(name + "Ribs", join([cube(0.05, H / 2 - 0.2, 0.09, (cx + s * (hx + 0.03), y0 + H / 2, cz - L / 2 + 0.5 + k * (L - 1.0) / (n - 1))) for k in range(n) for s in (-1, 1)]), slot, root, 0)
    M(name + "Rails", join([cube(0.1, 0.07, hz, (cx + s * (hx - 0.2), y0 + H + 0.02, cz)) for s in (-1, 1)]), "dark", root, 0)


def mount(root, yaw, tilt, neck_y0, neck_y1, neck_r, neck_slot="steel"):
    """Shared top (dishkit.py mount_pieces): neck, head block and ears on yaw, drum on tilt."""
    for name, geo, slot, ink, part in mount_pieces(neck_y0, neck_y1, neck_r, neck_slot):
        M(name, geo, slot, yaw if part == "yaw" else tilt, ink)


# =====================================================================================================
# CRYO RECEIVER  (He-3 tanker on end: 22 m vessel, 10 m pad)
# =====================================================================================================
def build_cryo():
    root, yaw, tilt = unit("dish_cryo")
    root["radius"] = 11.5

    # ---- foundation: pad with hazard kerb ring, bollards, the vessel's dark skirt ----
    PAD = 0.3      # thin: the player walks at ground level, a thick apron would swallow their feet
    M("pad", lathe([(0.0, 0.0), (10.2, 0.0), (10.2, PAD), (0.0, PAD)], 40), "concrete", root, 0.12)
    M("padRing", xf(torus(9.7, 0.12, 40, 4), (0, PAD + 0.04, 0)), "hazard", root, 0)
    M("bollards", join([B((11.0 * math.sin(a), 0.0, 11.0 * math.cos(a)), (11.0 * math.sin(a), 1.25, 11.0 * math.cos(a)), 0.24, 6, True) for a in [2 * PI * (k + 0.5) / 10 for k in range(10)]]), "dark", root, 0)
    M("bollardCaps", join([xf(torus(0.25, 0.08, 8, 3), (11.0 * math.sin(a), 1.05, 11.0 * math.cos(a))) for a in [2 * PI * (k + 0.5) / 10 for k in range(10)]]), "hazard", root, 0)
    M("skirt", lathe([(0.0, PAD), (6.8, PAD), (6.8, 2.8), (5.75, 3.15), (0.0, 3.15)], 32), "dark", root, 0.14)
    M("skirtHaz", xf(torus(6.84, 0.2, 32, 4), (0, 1.05, 0)), "hazard", root, 0)
    M("skirtVents", join([turn(cube(0.55, 0.42, 0.1, (0, 2.0, 6.82)), 2 * PI * (k + 0.25) / 12) for k in range(12)]), "steel", root, 0)

    # ---- vessel: pale shell, faction dome, accent rings, steel bands ----
    M("shell", lathe([(0.0, 3.1), (5.6, 3.1), (5.6, 17.0), (0.0, 17.0)], 32), "tank", root, 0.2)
    M("dome", lathe([(0.0, 17.0), (5.63, 17.0), (5.63, 17.15), (5.3, 18.0), (4.5, 18.95), (3.3, 19.7), (1.9, 20.2), (0.0, 20.4)], 32), "body", root, 0.14)
    M("rings", tori(5.66, (3.4, 17.2), 0.17, 32), "accent", root, 0)
    M("bands", tori(5.66, (5.0, 7.2, 9.4, 11.6, 13.8, 16.0), 0.16, 32), "steel", root, 0)

    # ---- gantry stair winding up the vessel, handrails, landing with floodlights ----
    A0, TURNS, H0, H1, SR = math.radians(200), 1.65, 0.7, 16.9, 6.85
    NS = int(TURNS * 30)
    hp = lambda r, t, dy=0.0: (r * math.sin(A0 + 2 * PI * TURNS * t), H0 + (H1 - H0) * t + dy, r * math.cos(A0 + 2 * PI * TURNS * t))
    ts = [i / NS for i in range(NS + 1)]
    M("treads", join([turn(cube(0.78, 0.07, 0.72, (0, H0 + (H1 - H0) * t, SR)), A0 + 2 * PI * TURNS * t) for t in ts]), "dark", root, 0)
    M("stringers", join([tube([hp(SR + s * 0.74, t, -0.28) for t in ts], [0.13] * len(ts), 4, True) for s in (-1, 1)]), "steel", root, 0)
    M("handrails", join([tube([hp(SR + 0.78, t, h) for t in ts], [0.075] * len(ts), 4, True) for h in (0.55, 1.1)] + [tube([hp(SR - 0.78, t, 1.1) for t in ts], [0.075] * len(ts), 4, True)]), "metal", root, 0)
    M("stairPosts", join([B(hp(SR + 0.78, i / NS, -0.05), hp(SR + 0.78, i / NS, 1.12), 0.075, 4, True) for i in range(0, NS + 1, 3)]), "metal", root, 0)
    ae = A0 + 2 * PI * TURNS
    M("landing", turn(cube(2.1, 0.09, 1.25, (0, H1 + 0.05, SR)), ae), "dark", root, 0)
    rails = [B((sx * 2.1, H1 + 0.05, SR + 1.2), (sx * 2.1, H1 + 1.15, SR + 1.2), 0.075, 4, True) for sx in (-1, 1)]
    rails += [B((-2.1, H1 + hh, SR + 1.2), (2.1, H1 + hh, SR + 1.2), 0.07, 4, True) for hh in (0.55, 1.1)]
    rails += [B((sx * 2.1, H1 + hh, SR - 1.2), (sx * 2.1, H1 + hh, SR + 1.2), 0.07, 4, True) for sx in (-1, 1) for hh in (0.55, 1.1)]
    M("landingRails", turn(join(rails), ae), "metal", root, 0)
    flood = xf(lathe([(0.0, 0), (0.3, 0), (0.36, 0.26), (0.0, 0.26)], 10), r=(PI / 2 - 0.15, 0, 0))
    M("landingFloods", turn(join([xf(flood, t=((k - 1) * 1.3, H1 + 1.3, SR + 1.35)) for k in range(3)]), ae), "lamp", root, 0)
    M("landingFloodBacks", turn(join([cube(0.4, 0.4, 0.2, ((k - 1) * 1.3, H1 + 1.3, SR + 1.18)) for k in range(3)]), ae), "dark", root, 0)

    # ---- valve cabinet (gauges, hand-wheels), two pipes up the shell ----
    CBX, CBZ = -3.9, 7.6
    rb("cabinet", 2.1, 1.35, 0.6, (CBX, PAD + 1.35, CBZ), "dark", root, 0.1, 0.1)
    bx("cabinetTop", 2.2, 0.1, 0.7, (CBX, PAD + 2.75, CBZ), "steel", root)
    bx("cabinetHeader", 2.0, 0.28, 0.08, (CBX, PAD + 3.12, CBZ + 0.55), "dark", root)
    M("gauges", join([xf(lathe([(0.0, 0), (0.42, 0), (0.42, 0.06), (0.0, 0.06)], 14), (CBX + gx, 2.7, CBZ + 0.6), (PI / 2, 0, 0)) for gx in (-1.3, 0.0, 1.3)]), "white", root, 0)
    M("needles", join([B((CBX + gx, 2.7, CBZ + 0.68), (CBX + gx + 0.22, 2.9, CBZ + 0.68), 0.04, 4, True) for gx in (-1.3, 0.0, 1.3)]), "tail", root, 0)
    M("valveWheels", join([xf(torus(0.38, 0.07, 14, 4), (CBX + vx, 1.5, CBZ + 0.64), (PI / 2, 0, 0)) for vx in (-1.4, 1.4)]), "hazard", root, 0)
    M("valveStems", join([B((CBX + vx, 1.5, CBZ + 0.6), (CBX + vx, 1.5, CBZ + 0.7), 0.07, 5, True) for vx in (-1.4, 1.4)]), "metal", root, 0)
    pipes, clamps = [], []
    for px in (-4.5, -5.2):
        zs = math.sqrt(5.6 ** 2 - px ** 2) + 0.4
        pipes.append(tube([(px, 3.0, CBZ), (px, 3.0, zs + 0.4), (px, 3.4, zs), (px, 15.0, zs)], [0.2] * 4, 8))
        clamps += [xf(torus(0.26, 0.07, 8, 4), (px, y, zs)) for y in (5.2, 7.4, 9.6, 11.8, 14.0)]
    M("pipes", join(pipes), "steel", root, 0)
    M("pipeClamps", join(clamps), "metal", root, 0)
    d = page("+z", (0, 0, CBZ + 0.64))
    nfpa(d, CBX, 2.0, 0.55, 3, 1, 0, "CRYO", 0)
    d.hazard(CBX - 1.95, 0.9, CBX + 1.95, 1.2, "dark", "hazard", 0, 0.24)
    d.build(f"{PFX}cabinetSign", root)
    d = page("+z", (0, 0, CBZ + 0.63))
    d.hazard(CBX - 1.9, PAD + 2.88, CBX + 1.9, PAD + 3.36, "dark", "hazard", 0, 0.28)
    d.build(f"{PFX}cabinetHaz", root)

    # ---- dome relief valve and vent stack; neck: flange, slew ring, turning column ----
    M("vent", tube([(-3.0, 19.35, 0.0), (-3.0, 23.8, 0.0)], [0.3, 0.3], 10), "steel", root, 0)
    M("ventCap", xf(lathe([(0.0, 0), (0.45, 0), (0.42, 0.12), (0.0, 0.22)], 10), (-3.0, 23.8, 0.0)), "dark", root, 0)
    M("ventBands", join([xf(torus(0.33, 0.07, 10, 4), (-3.0, y, 0.0)) for y in (20.3, 21.4, 22.5)]), "metal", root, 0)
    M("ventHaz", xf(torus(0.34, 0.1, 10, 4), (-3.0, 23.3, 0.0)), "hazard", root, 0)
    M("flange", xf(torus(2.35, 0.2, 24, 4), (0, 20.55, 0)), "hazard", root, 0)
    M("slewRing", lathe([(0.0, 20.5), (2.9, 20.5), (2.9, 21.2), (0.0, 21.2)], 24), "dark", root, 0.08)
    M("slewGear", xf(torus(2.5, 0.14, 24, 4), (0, 21.3, 0)), "steel", root, 0)
    mount(root, yaw, tilt, 21.2, 25.4, 1.75)
    M("neckBands", Y(join([xf(torus(1.81, 0.12, 14, 4), (0, y, 0)) for y in (21.9, 23.2, 24.5)])), "metal", yaw, 0)
    M("neckHaz", Y(xf(torus(1.85, 0.17, 14, 4), (0, 22.55, 0))), "hazard", yaw, 0)

    # ---- dish, banded like the tank: pale underside with steel straps, faction rim ----
    und = lambda r: APEX + par(r) - SHELL
    M("hub", hub_cone(APEX), "tank", tilt, 0.14)
    M("hubBand", xf(torus(3.55, 0.17, 24, 4), (0, 1.3, 0)), "accent", tilt, 0)
    M("bowl", bowl(APEX, SHELL, 0.0), "tank", tilt, 0.14)
    M("face", bowl(APEX, 0.12, 0.12), "dish", tilt, 0)
    M("faceBands", hoops((3.2, 5.9, 8.6, 11.3), lambda r: APEX + par(r) + 0.16, 0.13, 56), "steel", tilt, 0)
    M("seams", face_seams(APEX, 12, (), 1.5, 0.07), "seam", tilt, 0)
    M("underBands", join([hoop(r + 0.1, und(r) - 0.12, 0.17, 56, 4) for r in (6.0, 8.4, 10.8, 12.9)]), "steel", tilt, 0)
    straps = []
    for k in range(12):
        a = 2 * PI * (k + 0.5) / 12
        rs = [4.0 + (RIM - 0.6 - 4.0) * i / 6 for i in range(7)]
        straps.append(tube([((r + 0.1) * math.sin(a), und(r) - 0.1, (r + 0.1) * math.cos(a)) for r in rs], [0.13] * 7, 4, True))
    M("straps", join(straps), "steel", tilt, 0)
    M("rimStrap", hoop(RIM - 0.4, und(RIM - 0.4) - 0.12, 0.33, 56), "body", tilt, 0)
    M("collar", rim_collar(APEX, 0.4, 0.8, 0.4), "body", tilt, 0.1)
    M("collarBands", join([hoop(RIM + 0.42, APEX + par(RIM) + y, 0.11, 56) for y in (0.38, -0.78)]), "steel", tilt, 0)
    M("collarHaz", hoop(RIM + 0.45, APEX + par(RIM) - 0.2, 0.13, 56), "hazard", tilt, 0)
    # tripod and focus dewar: banded vessel with faction ends, stem and horn to the focus, vent stack
    FEED_Y = 13.9
    M("tripod", quadpod(APEX, FEED_Y - 0.9, 1.4, 3, 0.26, 6), "steel", tilt, 0.06)
    M("feedRing", hoop(1.5, FEED_Y - 0.9, 0.2, 20, 4), "dark", tilt, 0)
    DY0, DY1 = FEED_Y - 0.6, FEED_Y + 1.9
    M("dewar", lathe([(0.0, DY0 - 0.9), (0.8, DY0 - 0.8), (1.35, DY0 - 0.42), (1.55, DY0), (1.55, DY1), (1.35, DY1 + 0.42), (0.8, DY1 + 0.8), (0.0, DY1 + 0.9)], 18), "tank", tilt, 0.1)
    M("dewarRings", tori(1.58, (DY0 + 0.1, DY1 - 0.1), 0.1, 18), "accent", tilt, 0)
    M("dewarBands", tori(1.58, (DY0 + 0.9, DY0 + 1.7), 0.09, 18), "steel", tilt, 0)
    M("dewarDome", lathe([(0.0, DY1 + 0.9), (0.8, DY1 + 0.8), (1.35, DY1 + 0.42), (1.58, DY1 + 0.02), (1.58, DY1 - 0.35), (0.0, DY1 - 0.35)], 18), "body", tilt, 0)
    M("dewarFoot", lathe([(0.0, DY0 - 0.92), (0.8, DY0 - 0.82), (1.35, DY0 - 0.44), (1.58, DY0 - 0.02), (1.58, DY0 + 0.35), (0.0, DY0 + 0.35)], 18), "body", tilt, 0)
    M("dewarManway", xf(torus(0.55, 0.09, 12, 4), (0, DY1 + 0.88, 0)), "hazard", tilt, 0)
    M("dewarVent", tube([(0.9, DY1 + 0.55, 0.0), (0.9, DY1 + 2.2, 0.0)], [0.14, 0.14], 6), "steel", tilt, 0)
    M("dewarVentCap", xf(lathe([(0.0, 0), (0.24, 0), (0.22, 0.07), (0.0, 0.13)], 8), (0.9, DY1 + 2.2, 0.0)), "dark", tilt, 0)
    M("feedStem", tube([(0, DY0 - 0.9, 0), (0, APEX + FOC + 0.4, 0)], [0.45, 0.45], 10), "steel", tilt, 0)
    M("feedHorn", lathe([(0.0, APEX + FOC - 0.3), (0.35, APEX + FOC - 0.3), (0.85, APEX + FOC + 0.9), (0.0, APEX + FOC + 0.9)], 14), "metal", tilt, 0.04)
    M("feedLens", lathe([(0.0, APEX + FOC - 0.42), (0.34, APEX + FOC - 0.3), (0.0, APEX + FOC - 0.3)], 12), "green", tilt, 0)
    bm("beaconMast", (0, DY1 + 0.9, 0), (0, DY1 + 2.6, 0), 0.1, "dark", tilt)
    PV("blinkFeed", (0, DY1 + 2.8, 0), tilt, role="blinker", radius=0.45)
    PV("blinkVent", (-3.0, 24.15, 0), root, role="blinker", radius=0.4)

    # ---- branding panel on brackets (faction mark and name; the number is its own roundel) ----
    PNX, PNY, PNZ = 1.6, 10.3, 6.95
    PW, PH = 5.2, 1.95
    rb("panel", PW, PH, 0.1, (PNX, PNY, PNZ), "dark", root, 0.05, 0.08)
    for i, (dx, dy) in enumerate(((-4.0, -1.2), (-4.0, 1.2), (4.0, -1.2), (4.0, 1.2))):
        zb = math.sqrt(5.6 ** 2 - (PNX + dx) ** 2) if abs(PNX + dx) < 5.5 else 0.0
        z0 = zb - 0.3
        bx(f"bracket{i}", 0.18, 0.1, (PNZ - 0.1 - z0) / 2, (PNX + dx, PNY + dy, (PNZ - 0.1 + z0) / 2), "steel", root)

    def livery(f, piv):
        s = NAMES[f]
        d = page("+z", (PNX, 0, PNZ + 0.1))
        d.rect(-PW + 0.1, PNY - PH + 0.1, PW - 0.1, PNY + PH - 0.1, "brand", 0)
        d.rect(-PW + 0.26, PNY - PH + 0.26, PW - 0.26, PNY + PH - 0.26, "dark", 1)
        r = 1.0
        tx = -PW + 0.55 + 2 * r + 0.45
        emblem(d, f, -PW + 0.55 + r, PNY + 0.1, r, 2)
        d.text(s, tx, PNY + 0.35, 0.1, "stripe", 2)
        d.text("CRYO RECEIVER", tx, PNY - 0.4, 0.058, "brand", 2)
        d.text("HELIUM-3 COOLED  4 K", tx, PNY - 0.95, 0.04, "white", 2)
        d.build(f"{PFX}panel_{f}", piv)

    for f, piv in liveries(root).items():
        livery(f, piv)
    for n, piv in numbers(root).items():
        d = page("+z", (PNX, 0, PNZ + 0.1))
        d.disc(PW - 1.0, PNY, 0.82, "stripe", 2, 24)
        d.disc(PW - 1.0, PNY, 0.72, "dark", 3, 24)
        d.text(n, PW - 1.0, PNY - 3.5 * 0.15, 0.15, "stripe", 4, "c")
        d.build(f"{PFX}panelNo_{n}", piv)
    return root


# =====================================================================================================
# GANTRY STATION  (21.6 m lattice mast; container yard 13 m out each side)
# =====================================================================================================
def build_gantry():
    root, yaw, tilt = unit("dish_gantry")
    root["radius"] = 17.0

    # ---- footings; mast: four tapering chords, X bracing, splice plates, platforms, caged ladder ----
    for sx in (-1, 1):
        for sz in (-1, 1):
            rb(f"foot{sx}{sz}", 1.5, 0.55, 1.5, (sx * 4.3, 0.55, sz * 4.3), "concrete", root, 0.1, 0.05)
            bx(f"footPlate{sx}{sz}", 1.0, 0.12, 1.0, (sx * 4.0, 1.17, sz * 4.0), "steel", root)
    bx("basePad", 5.3, 0.1, 5.3, (0, 0.1, 0), "concrete", root, 0.06)
    MY0, MY1, SECT = 1.2, 21.6, 7
    hw = lambda y: 4.0 + (2.2 - 4.0) * (y - MY0) / (MY1 - MY0)      # mast half width at height y
    lv = [MY0 + (MY1 - MY0) * i / SECT for i in range(SECT + 1)]
    corn = lambda y: [(-hw(y), -hw(y)), (hw(y), -hw(y)), (hw(y), hw(y)), (-hw(y), hw(y))]
    M("mastChords", join([B((corn(MY0)[i][0], MY0 - 0.1, corn(MY0)[i][1]), (corn(MY1)[i][0], MY1, corn(MY1)[i][1]), 0.36, 6) for i in range(4)]), "body", root, 0.08)
    web = []
    for i in range(SECT):
        ya, yb = lv[i], lv[i + 1]
        ca, cb = corn(ya), corn(yb)
        for f in range(4):
            a0, a1, b0, b1 = ca[f], ca[(f + 1) % 4], cb[f], cb[(f + 1) % 4]
            web.append(B((a0[0], ya, a0[1]), (b1[0], yb, b1[1]), 0.15) if (i + f) % 2 else B((a1[0], ya, a1[1]), (b0[0], yb, b0[1]), 0.15))
    for y in lv[:-1]:
        c = corn(y)
        web += [B((c[f][0], y, c[f][1]), (c[(f + 1) % 4][0], y, c[(f + 1) % 4][1]), 0.18) for f in range(4)]
    M("mastBracing", join(web), "body", root, 0)
    M("splicePlates", join([cube(0.5, 0.3, 0.5, (cx, y, cz)) for y in lv[1:-1] for cx, cz in corn(y)]), "steel", root, 0)
    LZ = lambda y: hw(y) - 0.45
    lad = [B((sx * 0.5, MY0 + 0.5, LZ(MY0)), (sx * 0.5, MY1 - 0.7, LZ(MY1 - 0.7)), 0.06, 4, True) for sx in (-1, 1)]
    y = MY0 + 0.9
    while y < MY1 - 0.8:
        lad.append(B((-0.5, y, LZ(y)), (0.5, y, LZ(y)), 0.04, 4, True))
        y += 0.5
    M("ladder", join(lad), "metal", root, 0)
    cage = []
    y = MY0 + 2.6
    while y < MY1 - 1.0:
        cage.append(tube([(0.95 * math.sin(a), y, LZ(y) + 0.9 * math.cos(a)) for a in [(-85 + 170 * i / 8) * PI / 180 for i in range(9)]], [0.05] * 9, 4, True))
        y += 1.6
    M("cage", join(cage), "metal", root, 0)
    for pi, (py, pw) in enumerate(((8.0, 0.0), (14.6, 0.0), (21.7, 1.0))):      # rest platforms (rails, toe board): low, middle, top gantry
        w = hw(py) + 1.0 + pw
        rb(f"deck{pi}", w, 0.1, w, (0, py, 0), "dark", root, 0.06, 0.08)
        ring = [(-w, -w), (w, -w), (w, w), (-w, w)]
        posts = ring + [(0, -w), (w, 0), (0, w), (-w, 0)] + [(-w / 2, -w), (w / 2, -w), (w, -w / 2), (w, w / 2), (w / 2, w), (-w / 2, w), (-w, w / 2), (-w, -w / 2)]
        M(f"posts{pi}", join([B((px, py, pz), (px, py + 1.2, pz), 0.08, 4, True) for px, pz in posts]), "body", root, 0)
        M(f"rails{pi}", join([B((ring[a][0], py + hh, ring[a][1]), (ring[(a + 1) % 4][0], py + hh, ring[(a + 1) % 4][1]), 0.07, 4, True) for hh in (0.6, 1.2) for a in range(4)]), "body", root, 0)
        bx(f"toe{pi}", w, 0.04, 0.04, (0, py + 0.15, w), "hazard", root)
    for k, (fx, fz, fa) in enumerate(((1, 1, PI / 4), (-1, 1, -PI / 4), (1, -1, 3 * PI / 4), (-1, -1, -3 * PI / 4))):     # floodlights on the top gantry corners
        g = xf(lathe([(0.0, 0), (0.34, 0), (0.42, 0.3), (0.0, 0.3)], 10), r=(PI / 2 - 0.2, 0, 0))
        M(f"flood{k}", xf(turn(g, fa), t=(fx * 4.35, 23.0, fz * 4.35)), "lamp", root, 0)
        bx(f"floodBack{k}", 0.4, 0.4, 0.22, (fx * 4.2, 23.0, fz * 4.2), "dark", root, 0, (0, fa, 0))
        bm(f"floodPost{k}", (fx * 4.2, 21.8, fz * 4.2), (fx * 4.2, 22.7, fz * 4.2), 0.1, "metal", root)
    bx("fascia", 4.6, 0.62, 0.1, (0, 21.05, hw(21.7) + 2.0), "dark", root)
    # top: slew ring and turning neck
    M("slewRing", lathe([(0.0, 21.6), (2.8, 21.6), (2.8, 22.3), (0.0, 22.3)], 24), "dark", root, 0.08)
    M("slewGear", xf(torus(2.4, 0.14, 24, 4), (0, 22.4, 0)), "steel", root, 0)
    mount(root, yaw, tilt, 22.3, 25.4, 1.7)
    M("neckBands", Y(join([xf(torus(1.76, 0.12, 14, 4), (0, y, 0)) for y in (22.9, 23.9, 24.8)])), "metal", yaw, 0)

    # ---- yard: container control rooms (one stacked, with stair), red battery bank, fuel tank, generator, cable trays ----
    YARD = (("boxA", -11.5, 3.0, 0.0, "1"), ("boxB", -11.5, 3.0, 3.3, "2"), ("boxC", 11.5, 4.5, 0.0, "3"))
    for nm, cx, cz, y0, ref in YARD:
        container(root, nm, cx, cz, y0, "body", True)
    BX_, BZ_ = 11.5, -7.0           # battery bank: armoured magazine with strobes and a lightning rod
    container(root, "bank", BX_, BZ_, 0.0, "redsafe", False)
    for k, z in enumerate((-2.4, 2.4)):
        bx(f"bankVent{k}", 0.9, 0.1, 0.6, (BX_, 3.4, BZ_ + z), "dark", root)
        M(f"bankStrobe{k}", xf(lathe([(0.24, 0), (0.24, 0.08), (0.16, 0.24), (0.0, 0.3)], 10), (BX_ + (1.2 if k else -1.2), 3.42, BZ_ + z * 1.5)), "hot", root, 0)
    M("bankRod", tube([(BX_ + 1.3, 3.4, BZ_ - 4.3), (BX_ + 1.3, 8.4, BZ_ - 4.3)], [0.07, 0.025], 5), "metal", root, 0)
    M("bankRodBase", xf(lathe([(0.2, 0), (0.2, 0.15), (0.08, 0.22)], 8), (BX_ + 1.3, 3.34, BZ_ - 4.3)), "dark", root, 0)
    bm("bankEarth", (BX_ + 1.75, 3.3, BZ_ - 4.6), (BX_ + 1.75, 0.2, BZ_ - 4.6), 0.04, "metal", root)
    M("boxStair", join([cube(0.7, 0.05, 0.28, (-6.9, 0.3 + i * 0.3, 7.6 - i * 0.55)) for i in range(11)]), "dark", root, 0)
    M("boxStairRails", join([B((x, 1.2, 8.2), (x, 4.5, 2.2), 0.06, 4, True) for x in (-6.15, -7.65)]), "metal", root, 0)
    # fuel tank on saddles; generator and stack
    M("fuelTank", xf(lathe([(0.0, -2.8), (0.8, -2.7), (1.3, -2.3), (1.45, -1.8), (1.45, 1.8), (1.3, 2.3), (0.8, 2.7), (0.0, 2.8)], 16), (-1.5, 2.3, -9.5), (0, 0, PI / 2)), "tank", root, 0.1)
    M("tankBands", join([xf(torus(1.46, 0.07, 14, 4), (x, 2.3, -9.5), (0, 0, PI / 2)) for x in (-3.0, 0.0)]), "steel", root, 0)
    M("saddles", join([xf(rbox(0.3, 0.8, 1.4, 0.12, 6, 3), (x, 0.9, -9.5)) for x in (-3.4, -1.5, 0.4)]), "dark", root, 0.05)
    rb("genBox", 1.4, 1.0, 1.4, (-12.5, 1.0, -4.5), "dark", root, 0.05, 0.1)
    M("genStack", tube([(-12.5, 2.0, -4.5), (-12.5, 11.5, -4.5)], [0.45, 0.45], 8), "steel", root, 0.06)
    M("genCap", xf(lathe([(0.0, 0), (0.6, 0), (0.6, 0.12), (0.0, 0.2)], 10), (-12.5, 11.5, -4.5)), "dark", root, 0)
    trays = ((-9.6, 3.0, -5.0, 1.0), (9.6, 4.5, 5.2, 2.0), (9.6, -7.0, 5.2, -2.5), (-1.5, -9.0, -1.0, -5.3))
    M("trays", join([cube(0.32, 0.06, math.hypot(x1 - x0, z1 - z0) / 2, ((x0 + x1) / 2, 0.06, (z0 + z1) / 2), (0, math.atan2(x1 - x0, z1 - z0), 0)) for x0, z0, x1, z1 in trays]), "dark", root, 0)
    M("trayCables", join([cube(0.2, 0.05, math.hypot(x1 - x0, z1 - z0) / 2, ((x0 + x1) / 2, 0.17, (z0 + z1) / 2), (0, math.atan2(x1 - x0, z1 - z0), 0)) for x0, z0, x1, z1 in trays]), "hot", root, 0)
    for side, face in ((1, "+x"), (-1, "-x")):
        d = page(face, (BX_ + side * 1.78, 0, BZ_))
        warn_sign(d, -1.6, 0.9, 3.2, 1.9, 0, "DANGER", ("HIGH VOLTAGE", "BATTERY BANK"))
        d.build(f"{PFX}bankSign{'P' if side > 0 else 'S'}", root)

    # ---- dish: faction trusses under a white shell, stripe-and-body rim, lattice quadpod, Cassegrain feed ----
    M("hub", hub_cone(APEX), "steel", tilt, 0.12)
    M("bowl", bowl(APEX, SHELL, 0.0), "white", tilt, 0.14)
    M("face", bowl(APEX, 0.12, 0.12), "dish", tilt, 0)
    M("seams", face_seams(APEX), "seam", tilt, 0)
    M("collar", rim_collar(APEX, 0.35, 0.7, 0.4), "dark", tilt, 0.1)
    nb = 36
    for slot, parity in (("stripe", 0), ("body", 1)):
        M("rimBlocks_" + slot, join([tube(arc_pts(RIM + 0.46, APEX + par(RIM) - 0.15, 2 * PI * k / nb + 0.01, 2 * PI * (k + 1) / nb - 0.01, 2), [0.55] * 3, 4, True) for k in range(nb) if k % 2 == parity]), slot, tilt, 0)
    NT, R0, nbay = 12, 5.0, 6
    ch, dg = [], []
    for k in range(NT):
        a = 2 * PI * (k + 0.5) / NT
        P = lambda r, y: (r * math.sin(a), y, r * math.cos(a))
        rs = [R0 + (RIM - 0.3 - R0) * i / nbay for i in range(nbay + 1)]
        tops = [(r, APEX + par(r) - SHELL - 0.05) for r in rs]
        bots = [(r, rib_bottom(APEX, r)) for r in rs]
        ch += [tube([P(*t) for t in tops], [0.17] * len(rs), 4, True), tube([P(*b) for b in bots], [0.2] * len(rs), 4, True)]
        dg += [B(P(*tops[i]), P(*bots[i]), 0.1, 4, True) for i in range(nbay + 1)]
        dg += [B(P(*tops[i]), P(*bots[i + 1]), 0.1, 4, True) if i % 2 else B(P(*bots[i]), P(*tops[i + 1]), 0.1, 4, True) for i in range(nbay)]
    M("trussChords", join(ch), "body", tilt, 0.05)
    M("trussWeb", join(dg), "steel", tilt, 0)
    M("hoops", hoops((7.6, 10.4, 13.0), lambda r: rib_bottom(APEX, r) - 0.05, 0.24, 48, 4), "body", tilt, 0.04)
    M("hoopBraces", join([B((r0 * math.sin(2 * PI * (k + 0.5) / NT), rib_bottom(APEX, r0) - 0.05, r0 * math.cos(2 * PI * (k + 0.5) / NT)),
                            (r1 * math.sin(2 * PI * (k + 1.5) / NT), rib_bottom(APEX, r1) - 0.05, r1 * math.cos(2 * PI * (k + 1.5) / NT)), 0.1, 4, True)
                          for r0, r1 in ((7.6, 10.4), (10.4, 13.0)) for k in range(NT)]), "steel", tilt, 0)
    # quadpod: lattice legs to a feed cabin; subreflector on three struts
    FEED_Y = 14.4
    legs = []
    for k in range(4):
        a = 2 * PI * (k + 0.5) / 4
        p0 = (RIM * 0.97 * math.sin(a), APEX + par(RIM) + 0.1, RIM * 0.97 * math.cos(a))
        p1 = (1.4 * math.sin(a), FEED_Y - 0.6, 1.4 * math.cos(a))
        legs.append(B(p0, p1, 0.2, 6, True))
        s2 = (math.sin(a + PI / 2), 0, math.cos(a + PI / 2))
        for t in (0.3, 0.55, 0.78):
            c = tuple(p0[i] + (p1[i] - p0[i]) * t for i in range(3))
            legs.append(B((c[0] + s2[0] * 0.7, c[1] - 0.25, c[2] + s2[2] * 0.7), (c[0] - s2[0] * 0.7, c[1] - 0.25, c[2] - s2[2] * 0.7), 0.08, 4, True))
    M("quadpod", join(legs), "body", tilt, 0.05)
    M("feedRing", hoop(1.5, FEED_Y - 0.6, 0.2, 20, 4), "dark", tilt, 0)
    rb("feedCab", 1.5, 1.0, 1.5, (0, FEED_Y + 0.4, 0), "body", tilt, 0.1, 0.1)
    bx("feedBand", 1.54, 0.14, 1.54, (0, FEED_Y + 0.4, 0), "stripe", tilt)
    bx("feedWin", 0.7, 0.35, 0.06, (0, FEED_Y + 0.6, 1.5), "window", tilt)
    M("subStruts", join([B((0.5 * math.sin(2 * PI * k / 3 + 0.5), FEED_Y - 0.5, 0.5 * math.cos(2 * PI * k / 3 + 0.5)), (1.0 * math.sin(2 * PI * k / 3 + 0.5), APEX + FOC + 1.0, 1.0 * math.cos(2 * PI * k / 3 + 0.5)), 0.07, 4, True) for k in range(3)]), "steel", tilt, 0)
    M("subRefl", lathe([(0.0, APEX + FOC + 0.55), (1.0, APEX + FOC + 0.95), (1.0, APEX + FOC + 1.1), (0.0, APEX + FOC + 0.8)], 16), "white", tilt, 0.04)
    M("feedStem", tube([(0, FEED_Y - 0.6, 0), (0, APEX + FOC + 0.95, 0)], [0.28, 0.28], 8), "steel", tilt, 0)
    M("feedLens", lathe([(0.0, APEX + FOC + 0.5), (0.4, APEX + FOC + 0.55), (0.0, APEX + FOC + 0.8)], 12), "green", tilt, 0)
    bm("beaconMast", (0, FEED_Y + 1.4, 0), (0, FEED_Y + 3.1, 0), 0.1, "dark", tilt)
    PV("blinkFeed", (0, FEED_Y + 3.3, 0), tilt, role="blinker", radius=0.45)
    for sx in (-1, 1):
        PV(f"blinkTop{sx}", (sx * 4.2, 24.0, 4.2), root, role="blinker", radius=0.4)

    # ---- liveries (container flank plates, fascia name) and station number ----
    def cargo_plate(f, piv, cx, cz, y0, ref, W=3.5, H=3.3):
        s = NAMES[f]
        ps, ps2, r = 0.075, 0.055, 0.62
        u0 = -(2 * r + 0.25 + max(text_width(s, ps), text_width("ARRAY CONTROL", ps2))) / 2
        for sd in (-1, 1):
            d = page("+x" if sd > 0 else "-x", (cx + sd * (W / 2 + 0.03), 0, cz))
            yy = y0 + H / 2 + 0.2
            d.rect(-1.9, yy - 0.78, 1.9, yy + 0.78, "stripe", 0)
            d.rect(-1.84, yy - 0.72, 1.84, yy + 0.72, "dark", 1)
            emblem(d, f, u0 + r, yy, r, 2)
            d.text(s, u0 + 2 * r + 0.25, yy + 0.02, ps, "stripe", 2)
            d.text("ARRAY CONTROL", u0 + 2 * r + 0.25, yy - 0.6, ps2, "white", 2)
            code = f"{CODES[f]} 2041{ref} 6"
            d.text(code, -text_width(code, 0.05) / 2, y0 + H - 0.55, 0.05, "label", 0)
            d.build(f"{PFX}plate{ref}{'P' if sd > 0 else 'S'}_{f}", piv)

    FZ = hw(21.7) + 2.0 + 0.14
    FPS, FR = 0.095, 0.34
    FTOT = 2 * FR + 0.3 + text_width("ARRAY 04", FPS)
    FU0 = -FTOT / 2

    def livery(f, piv):
        for nm, cx, cz, y0, ref in YARD:
            if nm != "boxB":
                cargo_plate(f, piv, cx, cz, y0, ref)
        d = page("+z", (0, 0, FZ))
        d.rect(-4.55, 20.5, 4.55, 21.6, "stripe", 0)
        d.rect(-4.45, 20.6, 4.45, 21.5, "dark", 1)
        emblem(d, f, FU0 + FR, 21.05, FR, 2)
        d.text("ARRAY", FU0 + 2 * FR + 0.3, 21.05 - 3.5 * FPS, FPS, "stripe", 2)
        d.build(f"{PFX}fascia_{f}", piv)

    for f, piv in liveries(root).items():
        livery(f, piv)
    for n, piv in numbers(root).items():
        d = page("+z", (0, 0, FZ))
        d.text(n, FU0 + 2 * FR + 0.3 + text_width("ARRAY ", FPS), 21.05 - 3.5 * FPS, FPS, "stripe", 2)
        d.build(f"{PFX}fasciaNo_{n}", piv)
    return root


# =====================================================================================================
# FIELD DISH  (eight-sided tower and container room under a truss-backed reflector)
# =====================================================================================================
OCT = PI / 8      # flat faces to +-x and +-z: corners at 22.5 degrees + k * 45


def ring8(r, y):
    """Eight-sided ring corners (corner radius r) as a closed path."""
    return [(r * math.sin(OCT + PI * i / 4), y, r * math.cos(OCT + PI * i / 4)) for i in range(9)]


def prism8(profile):
    """Eight-sided lathe, flat face to +z."""
    return turn(lathe(profile, 8), OCT)


def build_field():
    root, yaw, tilt = unit("dish_field")
    root["radius"] = 9.4
    FACE = math.cos(OCT)       # face distance over corner radius

    # ---- foundation: pad with kerb ring and bollards; eight-sided plinth with gussets ----
    PAD = 0.25
    M("pad", lathe([(0.0, 0.0), (9.4, 0.0), (9.4, PAD), (0.0, PAD)], 40), "concrete", root, 0.12)
    M("padRing", xf(torus(8.95, 0.12, 40, 4), (0, PAD + 0.04, 0)), "hazard", root, 0)
    bol = [2 * PI * (k + 0.5) / 6 for k in range(6)]
    M("bollards", join([B((10.0 * math.sin(a), 0.0, 10.0 * math.cos(a)), (10.0 * math.sin(a), 1.1, 10.0 * math.cos(a)), 0.22, 6, True) for a in bol]), "dark", root, 0)
    M("bollardCaps", join([xf(torus(0.23, 0.08, 8, 3), (10.0 * math.sin(a), 0.95, 10.0 * math.cos(a))) for a in bol]), "hazard", root, 0)
    M("plinth", prism8([(0.0, PAD), (5.4, PAD), (5.4, 1.2), (4.5, 1.7), (0.0, 1.7)]), "concrete", root, 0.14)
    M("plinthHaz", tube(ring8(5.42, 0.75), [0.13] * 9, 4, True), "hazard", root, 0)
    M("gussets", join([beam((4.2 * math.sin(a), 1.7, 4.2 * math.cos(a)), (3.6 * math.sin(a), 3.9, 3.6 * math.cos(a)), 0.15, 4) for a in (PI / 4, 3 * PI / 4, 5 * PI / 4, 7 * PI / 4)]), "steel", root, 0)

    # ---- tower: three narrowing eight-sided stages, corner posts, flanges, gallery ----
    SEC = ((1.7, 8.0, 3.8), (8.0, 14.2, 3.3), (14.2, 20.4, 2.8))
    face = lambda y: next(r for y0, y1, r in SEC if y <= y1) * FACE
    M("tower", join([prism8([(0.0, y0), (r, y0), (r, y1), (0.0, y1)]) for y0, y1, r in SEC]), "tank", root, 0.16)
    M("corners", join([B((r * math.sin(OCT + PI * i / 4), y0 + 0.1, r * math.cos(OCT + PI * i / 4)), (r * math.sin(OCT + PI * i / 4), y1 - 0.1, r * math.cos(OCT + PI * i / 4)), 0.11, 4, True) for y0, y1, r in SEC for i in range(8)]), "steel", root, 0)
    M("flanges", join([tube(ring8(r + 0.05, y), [0.22] * 9, 4, True) for y, r in ((1.95, 3.8), (8.0, 3.8), (14.2, 3.3))]), "body", root, 0)
    M("cowl", prism8([(0.0, 19.4), (3.0, 19.4), (3.0, 20.4), (0.0, 20.4)]), "body", root, 0.1)
    GY = 17.6                                                    # gallery deck, railed except on the ladder's side
    M("deck", prism8([(0.0, GY - 0.12), (4.6, GY - 0.12), (4.6, GY + 0.08), (0.0, GY + 0.08)]), "dark", root, 0.08)
    M("deckBeams", join([beam((face(GY - 2.4) * math.sin(a), GY - 2.4, face(GY - 2.4) * math.cos(a)), (3.9 * math.sin(a), GY - 0.12, 3.9 * math.cos(a)), 0.12, 4) for a in [k * PI / 4 for k in range(8)]]), "steel", root, 0)
    cn = ring8(4.6, GY)
    M("deckPosts", join([B((x, GY, z), (x, GY + 1.2, z), 0.08, 4, True) for x, _, z in cn[:8]]), "body", root, 0)
    M("deckRails", join([B((cn[i][0], GY + hh, cn[i][2]), (cn[i + 1][0], GY + hh, cn[i + 1][2]), 0.07, 4, True) for hh in (0.6, 1.2) for i in range(8) if i != 3]), "body", root, 0)
    M("deckToe", tube(ring8(4.6, GY + 0.15), [0.06] * 9, 4, True), "hazard", root, 0)
    for k, a in enumerate((PI / 3, -PI / 3)):                    # rail floodlights, facing out and down
        g = xf(lathe([(0.0, 0), (0.34, 0), (0.42, 0.3), (0.0, 0.3)], 10), r=(PI / 2 - 0.2, 0, 0))
        M(f"flood{k}", xf(turn(g, a), t=(4.3 * math.sin(a), GY + 1.0, 4.3 * math.cos(a))), "lamp", root, 0)
        bx(f"floodBack{k}", 0.4, 0.4, 0.22, (4.15 * math.sin(a), GY + 1.0, 4.15 * math.cos(a)), "dark", root, 0, (0, a, 0))
        bm(f"floodPost{k}", (4.15 * math.sin(a), GY, 4.15 * math.cos(a)), (4.15 * math.sin(a), GY + 0.85, 4.15 * math.cos(a)), 0.1, "metal", root)
    bm("beaconMast", (-3.0, GY, -3.0), (-3.0, GY + 2.4, -3.0), 0.09, "dark", root)
    PV("blinkGallery", (-3.0, GY + 2.6, -3.0), root, role="blinker", radius=0.4)

    # ---- caged ladder up -z on brackets; cable duct up +x ----
    LZ = -(face(3.0) + 0.45)
    lad = [B((sx * 0.5, 1.8, LZ), (sx * 0.5, GY + 1.4, LZ), 0.06, 4, True) for sx in (-1, 1)]
    y = 2.3
    while y < GY + 1.3:
        lad.append(B((-0.5, y, LZ), (0.5, y, LZ), 0.04, 4, True))
        y += 0.5
    M("ladder", join(lad), "metal", root, 0)
    M("ladderBrackets", join([B((sx * 0.5, y, -face(y)), (sx * 0.5, y, LZ), 0.07, 4, True) for y in (2.6, 5.4, 7.6, 10.4, 13.4, 16.0) for sx in (-1, 1)]), "steel", root, 0)
    M("cage", join([tube([(0.95 * math.sin(a), y, LZ - 0.9 * math.cos(a)) for a in [(-85 + 170 * i / 8) * PI / 180 for i in range(9)]], [0.05] * 9, 4, True) for y in [4.6 + 1.6 * k for k in range(9)]]), "metal", root, 0)
    f1, f2, f3 = (r * FACE for _, _, r in SEC)
    duct = [(f1 + 0.2, 3.2), (f1 + 0.2, 7.7), (f2 + 0.2, 8.3), (f2 + 0.2, 13.9), (f3 + 0.2, 14.5), (f3 + 0.2, GY - 0.3)]
    M("duct", tube([(x, y, 0.0) for x, y in duct], [0.17] * len(duct), 6, True), "dark", root, 0)
    M("ductClamps", join([cube(0.12, 0.1, 0.3, (x, y, 0.0)) for x, y in ((f1 + 0.2, 4.2), (f1 + 0.2, 6.2), (f2 + 0.2, 10.0), (f2 + 0.2, 12.0), (f3 + 0.2, 16.0))]), "steel", root, 0)

    # ---- equipment room: container on the pad, cable bridge to the tower, roof air-handler ----
    CX, CZ, L, W, H = 7.0, 0.0, 6.1, 2.6, 2.7
    container(root, "room", CX, CZ, PAD, "body", False, L, W, H)
    M("bridge", tube([(f1 + 0.2, 3.2, 0.0), (5.95, 3.2, 0.0), (5.95, PAD + H + 0.1, 0.0)], [0.17] * 3, 6, True), "dark", root, 0)
    rb("airHandler", 0.8, 0.28, 0.6, (CX, PAD + H + 0.32, -1.5), "metal", root, 0.06, 0.08)
    M("airFan", xf(lathe([(0.0, 0), (0.44, 0), (0.44, 0.06), (0.0, 0.06)], 14), (CX, PAD + H + 0.62, -1.5)), "dark", root, 0)
    M("airLouvres", join([cube(0.7, 0.025, 0.04, (CX, PAD + H + 0.12 + 0.12 * k, -0.89)) for k in range(3)]), "dark", root, 0)
    d = page("+z", (CX, 0, CZ + L / 2 + 0.03))
    d.rect(-1.02, PAD + 0.1, 1.02, PAD + 2.5, "hazard", 0)
    d.rect(-0.92, PAD + 0.18, 0.92, PAD + 2.42, "dark", 1)
    d.rect(-0.2, PAD + 0.9, -0.12, PAD + 1.7, "metal", 2)
    d.rect(0.12, PAD + 0.9, 0.2, PAD + 1.7, "metal", 2)
    d.build(f"{PFX}roomDoor", root)
    d = page("+x", (CX + W / 2 + 0.03, 0, CZ))      # +x flank's u runs along -z: plate at the -z end, signs at +z
    warn_sign(d, 0.1, PAD + 0.7, 1.75, 1.3, 0, "WARNING", ("RF RADIATION", "KEEP CLEAR"))
    nfpa(d, 2.5, PAD + 1.35, 0.45, 2, 1, 0, "RF", 0)
    d.build(f"{PFX}roomSigns", root)
    d = page("+z", (0, 0, face(3.0) + 0.0))
    d.hazard(-1.3, 2.2, 1.3, 2.9, "dark", "hazard", 0, 0.24)
    warn_sign(d, -1.3, 3.6, 2.6, 2.0, 1, "DANGER", ("RF RADIATION", "DO NOT CLIMB"))
    d.build(f"{PFX}towerSigns", root)

    # ---- top: flange, slew ring, turning neck ----
    M("flange", xf(torus(2.35, 0.2, 24, 4), (0, 20.55, 0)), "hazard", root, 0)
    M("slewRing", lathe([(0.0, 20.5), (2.9, 20.5), (2.9, 21.2), (0.0, 21.2)], 24), "dark", root, 0.08)
    M("slewGear", xf(torus(2.5, 0.14, 24, 4), (0, 21.3, 0)), "steel", root, 0)
    mount(root, yaw, tilt, 21.2, 25.4, 1.75)
    M("neckBands", Y(join([xf(torus(1.81, 0.12, 14, 4), (0, y, 0)) for y in (21.9, 23.2, 24.5)])), "metal", yaw, 0)

    # ---- dish: white shell, cream face, dark collar with stripe/body blocks, body-colour radial trusses, quadpod, Cassegrain feed ----
    M("hub", hub_cone(APEX), "steel", tilt, 0.12)
    M("bowl", bowl(APEX, SHELL, 0.0, 9, 32), "white", tilt, 0.14)
    M("face", bowl(APEX, 0.12, 0.12, 9, 32), "dish", tilt, 0)
    M("seams", face_seams(APEX, 12, (5.0, 9.6), 1.5, 0.08), "seam", tilt, 0)
    M("collar", rim_collar(APEX, 0.35, 0.7, 0.4), "dark", tilt, 0.1)
    nb = 28
    for slot, parity in (("stripe", 0), ("body", 1)):
        M("rimBlocks_" + slot, join([tube(arc_pts(RIM + 0.46, APEX + par(RIM) - 0.15, 2 * PI * k / nb + 0.01, 2 * PI * (k + 1) / nb - 0.01, 2), [0.55] * 3, 4, True) for k in range(nb) if k % 2 == parity]), slot, tilt, 0)
    NT, R0, nbay = 10, 5.0, 4
    ch, dg = [], []
    for k in range(NT):
        a = 2 * PI * (k + 0.5) / NT
        P = lambda r, y: (r * math.sin(a), y, r * math.cos(a))
        rs = [R0 + (RIM - 0.3 - R0) * i / nbay for i in range(nbay + 1)]
        tops = [(r, APEX + par(r) - SHELL - 0.05) for r in rs]
        bots = [(r, rib_bottom(APEX, r)) for r in rs]
        ch += [tube([P(*t) for t in tops], [0.17] * len(rs), 4, True), tube([P(*b) for b in bots], [0.2] * len(rs), 4, True)]
        dg += [B(P(*tops[i]), P(*bots[i]), 0.1, 4, True) for i in range(nbay + 1)]
        dg += [B(P(*tops[i]), P(*bots[i + 1]), 0.1, 4, True) if i % 2 else B(P(*bots[i]), P(*tops[i + 1]), 0.1, 4, True) for i in range(nbay)]
    M("trussChords", join(ch), "body", tilt, 0.05)
    M("trussWeb", join(dg), "steel", tilt, 0)
    M("hoops", hoops((8.0, 12.2), lambda r: rib_bottom(APEX, r) - 0.05, 0.24, 40, 4), "body", tilt, 0.04)
    FEED_Y = 14.2
    legs = []
    for k in range(4):
        a = 2 * PI * (k + 0.5) / 4
        p0 = (RIM * 0.97 * math.sin(a), APEX + par(RIM) + 0.1, RIM * 0.97 * math.cos(a))
        p1 = (1.3 * math.sin(a), FEED_Y - 0.6, 1.3 * math.cos(a))
        legs.append(B(p0, p1, 0.2, 6, True))
        s2 = (math.sin(a + PI / 2), 0, math.cos(a + PI / 2))
        for t in (0.35, 0.65):
            c = tuple(p0[i] + (p1[i] - p0[i]) * t for i in range(3))
            legs.append(B((c[0] + s2[0] * 0.7, c[1] - 0.25, c[2] + s2[2] * 0.7), (c[0] - s2[0] * 0.7, c[1] - 0.25, c[2] - s2[2] * 0.7), 0.08, 4, True))
    M("quadpod", join(legs), "body", tilt, 0.05)
    M("feedRing", hoop(1.4, FEED_Y - 0.6, 0.2, 20, 4), "dark", tilt, 0)
    rb("feedCab", 1.4, 0.9, 1.4, (0, FEED_Y + 0.35, 0), "body", tilt, 0.1, 0.1)
    bx("feedBand", 1.44, 0.13, 1.44, (0, FEED_Y + 0.35, 0), "stripe", tilt)
    bx("feedWin", 0.65, 0.3, 0.06, (0, FEED_Y + 0.55, 1.4), "window", tilt)
    M("subStruts", join([B((0.5 * math.sin(2 * PI * k / 3 + 0.5), FEED_Y - 0.5, 0.5 * math.cos(2 * PI * k / 3 + 0.5)), (1.0 * math.sin(2 * PI * k / 3 + 0.5), APEX + FOC + 1.0, 1.0 * math.cos(2 * PI * k / 3 + 0.5)), 0.07, 4, True) for k in range(3)]), "steel", tilt, 0)
    M("subRefl", lathe([(0.0, APEX + FOC + 0.55), (1.0, APEX + FOC + 0.95), (1.0, APEX + FOC + 1.1), (0.0, APEX + FOC + 0.8)], 16), "white", tilt, 0.04)
    M("feedStem", tube([(0, FEED_Y - 0.6, 0), (0, APEX + FOC + 0.95, 0)], [0.26, 0.26], 8), "steel", tilt, 0)
    M("feedLens", lathe([(0.0, APEX + FOC + 0.5), (0.4, APEX + FOC + 0.55), (0.0, APEX + FOC + 0.8)], 12), "green", tilt, 0)
    bm("feedBeacon", (0, FEED_Y + 1.25, 0), (0, FEED_Y + 2.8, 0), 0.1, "dark", tilt)
    PV("blinkFeed", (0, FEED_Y + 3.0, 0), tilt, role="blinker", radius=0.45)

    # ---- liveries: mark and name on the tower's second stage (+z) and the room's flank ----
    f2 = face(10.0)
    for f, piv in liveries(root, MARKED).items():
        s_ = NAMES[f]
        d = page("+z", (0, 0, f2))
        d.rect(-1.15, 9.45, 1.15, 11.35, "stripe", 0)
        d.rect(-1.09, 9.51, 1.09, 11.29, "dark", 1)
        emblem(d, f, 0.0, 10.6, 0.5, 2)
        d.text(s_, 0.0, 9.75, 0.04, "stripe", 2, "c")
        d.build(f"{PFX}towerPlate_{f}", piv)
        d = page("+x", (CX + W / 2 + 0.03, 0, CZ))
        d.rect(-2.95, PAD + 0.75, -0.2, PAD + 2.15, "stripe", 0)
        d.rect(-2.89, PAD + 0.81, -0.26, PAD + 2.09, "dark", 1)
        emblem(d, f, -2.89 + 0.62, PAD + 1.45, 0.48, 2)
        tx = -2.89 + 1.2
        ps = min(0.05, (-0.26 - tx - 0.1) / text_width(s_, 1.0))
        d.text(s_, tx, PAD + 1.45 + 0.05, ps, "stripe", 2)
        d.text("COMMS RELAY", tx, PAD + 1.45 - 0.5, 0.032, "white", 2)
        d.build(f"{PFX}roomPlate_{f}", piv)
    return root


# =====================================================================================================
# DISH HEAD  (light field-dish reflector, trunnions, neck and feed, no tower)
# =====================================================================================================
def build_head():
    root, yaw, tilt = unit("dish_head")
    for name, geo, slot, ink, part in head_pieces():
        M(name, geo, slot, yaw if part == "yaw" else tilt, ink)
    return root


# ---------------------------------------------------------------------------------------------------------------
ROOTS = (build_cryo(), build_gantry(), build_field(), build_head())

# roots must keep their exact names (Blender renames clashes to "name.001"; the game looks them up by name) and pivots
NEED = {   # required pivots per root: (number, livery, blinker)
    "dish_cryo": (len(NUMBERS), len(FACTIONS), 2), "dish_gantry": (len(NUMBERS), len(FACTIONS), 2),
    "dish_field": (0, len(MARKED), 2), "dish_head": (0, 0, 0),
}
for r in ROOTS:
    if r.name not in NEED or r.parent is not None or r.type != "EMPTY":
        raise RuntimeError(f"root {r.name!r} was renamed: some part of another station already uses that name")
    roles = sorted(o["role"] for o in C.objects if o.type == "EMPTY" and "role" in o and o.name.startswith(r.name + "_"))
    for need, n in zip(("yaw", "tilt", "number", "livery", "blinker"), (1, 1) + NEED[r.name]):
        if roles.count(need) < n:
            raise RuntimeError(f"{r.name}: expected {n} {need} pivots, found {roles.count(need)}")
bad = [o.name for o in C.objects if "." in o.name and o.name.rsplit(".", 1)[1].isdigit()]
if bad:
    raise RuntimeError("duplicate names were renamed by Blender: " + ", ".join(bad[:6]))

tris = {r.name: sum(sum(len(pl.vertices) - 2 for pl in o.data.polygons) for o in C.objects if o.type == "MESH" and o.name.startswith(r.name + "_")) for r in ROOTS}
print("built", len(C.objects), "objects,", tris)
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
    if os.environ.get("DISH_BLEND"):
        bpy.ops.wm.save_as_mainfile(filepath=os.environ["DISH_BLEND"])
