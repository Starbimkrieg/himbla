# The Prospector land-train's cargo units, for other models to carry (the freighter's side bays). Load with
#   exec(open(<repo>/tools/blender/cargo.py).read(), globals())
# after kit.py and decals.py, with C, SLOT_COLORS (the slots below) and the build script's own mesh / pivot in scope. It mirrors
# build_landtrain.py's three trailers, without the wheeled flatbed under them:
#
#   cargo_unit("box",   name, parent, pos)    the corrugated cargo container (faction plate and number)
#   cargo_unit("tank",  name, parent, pos)    the cryogenic Helium-3 tanker (H3 branding panels, valve cabinet, gantry walk)
#   cargo_unit("blast", name, parent, pos)    the smooth red explosives magazine (OSHA / DOT signs, strobes, lightning rod)
#   (low=True leaves off what stands up from a roof: the tanker's gantry walk, rails, manways and vent, the magazine's vents, strobes and
#   rod; every unit is then a flat-topped 3.5 m, so one can stand on another in a stack. A low tanker also gets an ISO frame, the box
#   container's own outside size with its corner castings, so it stacks like a box and can go on the bottom of a stack)
#
# Each unit is a pivot with role "cargo" (extra `kind`), at `pos` in three.js axes; its origin is the middle of its footprint on the
# underside of its rack, and its length runs along z. It holds one `livery` pivot per faction (extra `faction`; the game keeps the
# one that matches), exactly like the land-train's own cars, and uses the land-train's slots (body, stripe, accent and label are the
# faction's colours; the rest are fixed): under a "cargo" pivot the game paints with the land-train palette, not the ship's.
# The bake in the game drops a pivot's scale, so the unit is built at the land-train's size and then scaled in its own geometry.

import bpy, math
from mathutils import Matrix

CARGO_BASE = 1.62   # in the land-train's frame: the underside of the deck plate (centre 1.72, half 0.1); the unit is lowered by this
_cargo_ctx = {"pfx": "", "low": False}


def _cM(name, geo, slot, parent, ink=0.04):
    return mesh(_cargo_ctx["pfx"] + name, geo, slot, parent, ink)


def _crb(name, hx, hy, hz, pos, slot, parent, ink=0.04, e=0.12, rot=(0, 0, 0), nu=8, nv=4):
    return _cM(name, xf(rbox(hx, hy, hz, e, nu, nv), pos, rot), slot, parent, ink)


def _cbm(name, a, b, r, slot, parent, ink=0.0, seg=6):
    return _cM(name, beam(a, b, r, seg), slot, parent, ink)


def _cliveries(R, tag, make):
    """One livery pivot per faction, each filled by make(faction, pivot)."""
    for f in FACTIONS:
        make(f, pivot(f"{_cargo_ctx['pfx']}{tag}_{f}", (0, 0, 0), R, role="livery", faction=f))


def _rail_roof(parent, name, hx, hz, y, h=0.4, posts=6):
    for sx in (-1, 1):
        _cbm(f"{name}_r1{sx}", (sx * hx, y + h, -hz), (sx * hx, y + h, hz), 0.035, "metal", parent, 0.01)
        _cbm(f"{name}_r2{sx}", (sx * hx, y + h * 0.5, -hz), (sx * hx, y + h * 0.5, hz), 0.03, "metal", parent)
        for k in range(posts):
            z = -hz + k * (2 * hz / (posts - 1))
            _cbm(f"{name}_p{sx}_{k}", (sx * hx, y, z), (sx * hx, y + h, z), 0.035, "metal", parent, 0.01)
    for sz in (-1, 1):
        _cbm(f"{name}_e{sz}", (-hx, y + h, sz * hz), (hx, y + h, sz * hz), 0.035, "metal", parent, 0.01)


def _container_frame(R, body_slot, ribbed):
    """The flat rack, the box, its corner castings and a flat roof."""
    _crb("deck", 1.75, 0.1, 3.95, (0, 1.72, 0), "dark", R, 0.05, 0.1)
    _crb("box", 1.55, 1.4, 3.62, (0, 3.3, 0), body_slot, R, 0.07, 0.06)
    if ribbed:
        for sx in (-1, 1):
            for k in range(18):
                _crb(f"rib{sx}_{k}", 0.035, 1.28, 0.055, (sx * 1.57, 3.3, -3.3 + k * 0.388), body_slot, R, 0.02, 0.3, nu=6, nv=4)
        for k in range(10):
            _crb(f"roofRib{k}", 1.42, 0.03, 0.06, (0, 4.72, -3.2 + k * 0.7), body_slot, R, 0.02, 0.3, nu=6, nv=4)
    for sx in (-1, 1):
        _crb(f"roofRail{sx}", 0.08, 0.06, 3.62, (sx * 1.52, 4.74, 0), "dark", R, 0.03, 0.2)
        for sz in (-1, 1):
            _crb(f"cast{sx}{sz}", 0.2, 0.17, 0.22, (sx * 1.5, 1.95, sz * 3.55), "dark", R, 0.03, 0.2)
            _crb(f"castT{sx}{sz}", 0.2, 0.17, 0.22, (sx * 1.5, 4.62, sz * 3.55), "dark", R, 0.03, 0.2)


def _cargo_box(R):
    _container_frame(R, "body", True)
    for name, geo, slot, ink in container_doors("body"):     # (decals.py: a pair of doors at each end)
        _cM(name, geo, slot, R, ink)
    for sx in (-1, 1):
        _crb(f"plate{sx}", 0.04, CARGO_PLATE_HALF[1], CARGO_PLATE_HALF[0], (sx * 1.64, CARGO_PLATE_Y, 0.0), "dark", R, 0.03, 0.08)
    _cliveries(R, "livery", lambda f, piv: cargo_decals(f, piv, _cargo_ctx["pfx"]))


_BLV, _BLH = 0.075, 3.25      # the magazine's sign stack: lifted onto the box's middle, and half the band's length


def _cargo_blast(R):
    _container_frame(R, "redsafe", False)
    pfx = _cargo_ctx["pfx"]
    for sx in (-1, 1):
        for sz in (-1, 1):
            _crb(f"post{sx}{sz}", 0.13, 1.4, 0.13, (sx * 1.55, 3.3, sz * 3.6), "dark", R, 0.04, 0.15)
    for y in (3.25, 4.45):
        for sx in (-1, 1):
            _crb(f"hinge{sx}_{y}", 0.14, 0.1, 0.06, (sx * 1.42, y, -3.68), "dark", R, 0.02, 0.2)
    if not _cargo_ctx["low"]:
        for k, z in enumerate((-1.4, 1.2)):
            _crb(f"vent{k}", 0.9, 0.09, 0.55, (0, 4.8, z), "dark", R, 0.03, 0.15)
            for j in range(5):
                _crb(f"ventSlat{k}_{j}", 0.8, 0.025, 0.04, (0, 4.9, z - 0.4 + j * 0.2), "metal", R, 0, 0.3, nu=6, nv=4)
        for sx in (-1, 1):
            _cM(f"strobe{sx}", xf(lathe([(0.2, 0), (0.2, 0.08), (0.13, 0.22), (0, 0.26)], 10), (sx * 1.3, 4.76, 3.2)), "hot", R, 0.02)
            _cM(f"strobeBase{sx}", xf(lathe([(0.24, 0), (0.24, 0.07), (0.2, 0.09)], 10), (sx * 1.3, 4.72, 3.2)), "dark", R, 0.02)
        _cM("rod", tube([(1.3, 4.72, -3.2), (1.3, 6.2, -3.2)], [0.035, 0.012], 5), "metal", R, 0)
        _cM("rodBase", xf(lathe([(0.12, 0), (0.12, 0.1), (0.05, 0.14)], 8), (1.3, 4.72, -3.2)), "dark", R, 0.02)
        _cbm("earthStrap", (1.52, 4.7, -3.4), (1.52, 1.95, -3.4), 0.025, "metal", R, 0)
    # the signs that are the same for every faction (a DANGER sign, a DOT 1.1 placard and two prohibition signs on each flank, the
    # white band across the top, the hazard stripe along the bottom, and the ends)
    for side in (-1, 1):
        d = side_dec(side, 1.55, 3.3 + _BLV, 0.0)
        d.rect(-_BLH, 0.75, _BLH, 1.2, "white", 0)
        d.hazard(-_BLH, -1.35, _BLH, -1.0, "dark", "hazard", 0, 0.2)
        danger_sign(d, -3.1, -0.65, 1.9, 1.25, 0)
        placard(d, 0.0, -0.05, 0.62, 0)
        prohibition(d, 1.54, -0.05, 0.42, "smoke", 0)
        prohibition(d, 2.68, -0.05, 0.42, "flame", 0)
        d.build(f"{pfx}signs{'P' if side > 0 else 'S'}", R)
    d = Dec("-z", (0, 3.3 - 0.035, -3.62))
    danger_sign(d, -1.1, 0.05, 2.2, 1.3, 0)
    placard(d, 0, -0.72, 0.6, 0)
    prohibition(d, -1.18, -0.72, 0.33, "smoke", 0)
    prohibition(d, 1.18, -0.72, 0.33, "flame", 0)
    d.build(f"{pfx}signsRear", R)
    d = Dec("+z", (0, 3.3 + 0.125, 3.62))
    placard(d, 0, 0.2, 0.85, 0)
    d.hazard(-1.45, -1.3, 1.45, -1.0, "dark", "hazard", 0, 0.2)
    d.build(f"{pfx}signsFront", R)

    def livery(f, piv):
        s = NAMES[f]
        ps_e, ps_n, r, gap = 0.06, 0.035, 0.21, 0.1
        total = text_width("EXPLOSIVES", ps_e) + 0.3 + 2 * r + gap + text_width(s, ps_n)
        u0 = -total / 2
        for side in (-1, 1):
            d = side_dec(side, 1.55, 3.3 + _BLV, 0.0)
            d.text("EXPLOSIVES", u0, 0.78, ps_e, "redsafe", 1)
            cu = u0 + text_width("EXPLOSIVES", ps_e) + 0.3 + r
            emblem(d, f, cu, 0.975, r, 1)
            d.text(s, cu + r + gap, 0.975 - 3.5 * ps_n, ps_n, "dark", 1)
            d.build(f"{pfx}band{'P' if side > 0 else 'S'}_{f}", piv)

    _cliveries(R, "livery", livery)


def _cargo_tank(R):
    pfx = _cargo_ctx["pfx"]
    _crb("deck", 1.75, 0.1, 3.95, (0, 1.72, 0), "dark", R, 0.05, 0.1)
    for z in (-2.6, 0.0, 2.6):
        _crb(f"saddle{z}", 1.4, 0.55, 0.3, (0, 2.15, z), "dark", R, 0.04, 0.12)
    SHELL = [(0, -3.78), (0.85, -3.72), (1.25, -3.58), (1.45, -3.3), (1.5, -2.9), (1.5, 2.9), (1.45, 3.3), (1.25, 3.58), (0.85, 3.72), (0, 3.78)]
    _cM("shell", xf(lathe(SHELL, 22), (0, 3.3, 0), (math.pi / 2, 0, 0)), "tank", R, 0.09)
    _cM("domeF", xf(lathe([(1.512, 2.9), (1.462, 3.3), (1.262, 3.58), (0.862, 3.72), (0, 3.79)], 22), (0, 3.3, 0), (math.pi / 2, 0, 0)), "body", R, 0.05)
    _cM("domeR", xf(lathe([(0, -3.79), (0.862, -3.72), (1.262, -3.58), (1.462, -3.3), (1.512, -2.9)], 22), (0, 3.3, 0), (math.pi / 2, 0, 0)), "body", R, 0.05)
    for z in (-2.9, 2.9):
        _cM(f"ring{z}", xf(torus(1.52, 0.06, 22, 4), (0, 3.3, z), (math.pi / 2, 0, 0)), "accent", R, 0.02)
    for z in (-1.8, -0.6, 0.6, 1.8):
        _cM(f"band{z}", xf(torus(1.52, 0.06, 22, 4), (0, 3.3, z), (math.pi / 2, 0, 0)), "steel", R, 0.02)
    if _cargo_ctx["low"]:
        # the ISO frame round the vessel: the container's outside size (castings at x +-1.5, z +-3.55, y 1.95 to 4.62), four posts, side
        # rails top and bottom, end frames with crossed braces, so a tank container stacks (and is stacked on) like a box
        for sx in (-1, 1):
            for sz in (-1, 1):
                _crb(f"fpost{sx}{sz}", 0.11, 1.37, 0.11, (sx * 1.6, 3.3, sz * 3.55), "steel", R, 0.04, 0.2)
                _crb(f"cast{sx}{sz}", 0.2, 0.17, 0.22, (sx * 1.5, 1.95, sz * 3.55), "dark", R, 0.03, 0.2)
                _crb(f"castT{sx}{sz}", 0.2, 0.17, 0.22, (sx * 1.5, 4.62, sz * 3.55), "dark", R, 0.03, 0.2)
            _crb(f"fRailT{sx}", 0.09, 0.09, 3.62, (sx * 1.6, 4.66, 0), "steel", R, 0.03, 0.3)
            _crb(f"fRailB{sx}", 0.09, 0.09, 3.62, (sx * 1.6, 1.95, 0), "steel", R, 0.03, 0.3)
        for sz in (-1, 1):
            _crb(f"fEndT{sz}", 1.6, 0.09, 0.09, (0, 4.66, sz * 3.55), "steel", R, 0.03, 0.3)
            _crb(f"fEndB{sz}", 1.6, 0.09, 0.09, (0, 1.95, sz * 3.55), "steel", R, 0.03, 0.3)
            _cbm(f"fBrace1{sz}", (-1.55, 2.0, sz * 3.58), (1.55, 4.6, sz * 3.58), 0.045, "metal", R, 0.01)
            _cbm(f"fBrace2{sz}", (1.55, 2.0, sz * 3.58), (-1.55, 4.6, sz * 3.58), 0.045, "metal", R, 0.01)
    if not _cargo_ctx["low"]:
        _crb("walk", 0.5, 0.05, 3.1, (0, 4.82, 0), "dark", R, 0.03, 0.1)
        for z in (-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0):
            _crb(f"walkBar{z}", 0.46, 0.012, 0.03, (0, 4.875, z), "metal", R, 0, 0.3, nu=6, nv=4)
        _rail_roof(R, "rail", 0.55, 3.0, 4.87, 0.42, 7)
        for k, z in enumerate((-1.5, 1.5)):
            _cM(f"manway{k}", xf(lathe([(0.4, 0), (0.4, 0.1), (0.3, 0.22), (0, 0.26)], 14), (0, 4.9, z)), "metal", R, 0.03)
            _cM(f"manwayRing{k}", xf(torus(0.42, 0.045, 14, 4), (0, 4.9, z)), "hazard", R, 0)
        _cM("vent", tube([(0.0, 4.9, 0.0), (0.0, 5.65, 0.0)], [0.1, 0.1], 8), "steel", R, 0.03)
        _cM("ventCap", xf(lathe([(0.0, 0), (0.3, 0), (0.28, 0.08), (0.0, 0.14)], 10), (0, 5.65, 0)), "dark", R, 0.02)
    # the H3 branding panels: a dark board standing off each flank on brackets, with the atom and the legend
    for sx in (-1, 1):
        _crb(f"panel{sx}", 0.07, 0.8, 1.4, (sx * 1.64, 3.3, -0.2), "dark", R, 0.04, 0.08)
        for y in (2.65, 3.95):
            for z in (-1.2, 0.8):
                _crb(f"bracket{sx}_{y}_{z}", 0.15, 0.07, 0.09, (sx * 1.45, y, z), "steel", R, 0.02, 0.2)
        d = Dec("+x" if sx > 0 else "-x", (sx * 1.71, 3.3, -0.2))
        d.rect(-1.3, -0.72, 1.3, 0.72, "brand", 0)
        d.rect(-1.24, -0.66, 1.24, 0.66, "dark", 1)
        d.ring(-0.8, 0.19, 0.36, 0.41, "brand", 2, 24, sy=0.4)
        d.ring(-0.8, 0.19, 0.36, 0.41, "brand", 2, 24, sx=0.4)
        d.disc(-0.8, 0.19, 0.09, "hazard", 3, 12)
        d.text("H3", 0.35, -0.16, 0.1, "white", 2, "c")
        d.text("HELIUM-3", 0.0, -0.62, 0.045, "brand", 2, "c")
        d.build(f"{pfx}brand{'P' if sx > 0 else 'S'}", R)
    # the rear: a valve cabinet with gauges, hand-wheel valves and pipes to the tank, a ladder, the NFPA diamond
    _crb("cabinet", 1.1, 0.75, 0.28, (0, 2.55, -4.05), "dark", R, 0.05, 0.1)
    for sx in (-1, 1):
        _cM(f"gauge{sx}", xf(lathe([(0.0, 0), (0.2, 0), (0.2, 0.05), (0.0, 0.05)], 14), (sx * 0.62, 3.08, -4.335), (-math.pi / 2, 0, 0)), "white", R, 0.02)
        _cbm(f"needle{sx}", (sx * 0.62, 3.08, -4.36), (sx * 0.62 + sx * 0.1, 3.16, -4.36), 0.02, "tail", R)
        _cM(f"valveW{sx}", xf(torus(0.2, 0.035, 14, 4), (sx * 0.85, 2.45, -4.36), (math.pi / 2, 0, 0)), "hazard", R, 0)
        _cbm(f"valveS{sx}", (sx * 0.85, 2.45, -4.33), (sx * 0.85, 2.45, -4.36), 0.035, "metal", R)
        _cM(f"pipe{sx}", tube([(sx * 0.8, 3.0, -3.8), (sx * 0.8, 3.3, -4.05), (sx * 0.8, 3.45, -4.05)], [0.07, 0.07, 0.07], 6), "steel", R, 0.02)
    for x in (1.05, 1.55):
        _cbm(f"ladRail{x}", (x, 1.9, -3.93), (x, 4.9, -3.93), 0.045, "metal", R, 0.01)
    for k in range(8):
        _cbm(f"rung{k}", (1.05, 2.1 + k * 0.38, -3.93), (1.55, 2.1 + k * 0.38, -3.93), 0.03, "metal", R)
    dn = Dec("-z", (0, 2.55, -4.33))
    dn.hazard(-1.1, -0.74, 1.1, -0.5, "dark", "hazard", 0, 0.14)
    nfpa(dn, 0, -0.02, 0.4, 3, 0, 0, "SA", 2)
    dn.build(f"{pfx}cabinetSign", R)
    # the front: a bulkhead plate with the faction's mark
    _crb("bulkhead", 1.5, 1.05, 0.06, (0, 3.35, 3.93), "steel", R, 0.05, 0.1)
    _crb("bulkheadTop", 1.55, 0.07, 0.15, (0, 4.45, 3.9), "dark", R, 0.03, 0.15)

    def livery(f, piv):
        d = Dec("+z", (0, 3.35, 3.99))
        d.hazard(-1.4, -0.98, 1.4, -0.82, "dark", "hazard", 0, 0.14)
        emblem(d, f, 0, 0.32, 0.5)
        d.text(NAMES[f], 0, -0.6, 0.06, "dark", 0, "c")
        d.build(f"{pfx}bulkhead_{f}", piv)

    _cliveries(R, "livery", livery)


def cargo_unit(kind, name, parent, pos, scale=1.1, low=False):
    """One land-train cargo unit ('box', 'tank' or 'blast') at `pos` under `parent`, `scale` times the land-train's size, its length
    along z, its origin the middle of the underside of its rack. Returns its pivot (role "cargo")."""
    before = set(C.objects)
    R = pivot(name, pos, parent, role="cargo", kind=kind)
    _cargo_ctx["pfx"] = name + "_"
    _cargo_ctx["low"] = low
    {"box": _cargo_box, "tank": _cargo_tank, "blast": _cargo_blast}[kind](R)
    T = Matrix.Scale(scale, 4) @ Matrix.Translation((0, 0, -CARGO_BASE))   # (blender's z is up: three.js y)
    for o in C.objects:
        if o not in before and o.type == "MESH":
            o.data.transform(T)
    return R
