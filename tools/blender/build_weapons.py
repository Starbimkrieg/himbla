# Weapon models for the courier: two sets of proposals and the pick from them (docs/weapon-proposals/; preview_weapons.py
# renders them). The pick is in the game.
#
#   MOONRUNNER_REPO=. python3 tools/blender/build_weapons.py       builds every set, exports the pick to src/assets/weapons.glb
#                                                                    (roots wpn_pulse, wpn_scatter, wpn_rail, wpn_mortar; the
#                                                                    game: models.js makeWeapon, weaponView.js); MOONRUNNER_EXPORT=0
#                                                                    builds without exporting (the preview, the audits)
#
# Four weapons (src/weapons.js WEAPONS), each in its maker's colours and style (.claude/skills/blender/style.md, "Faction
# palettes"):
#   pulse    Pulse Spinner: standard courier issue, so the courier's own colours (Courier Orange, cyan, cream, yellow:
#            cosmeticsData.js `courier`); its disc glows in the player's laser colour (slot `laser`)
#   scatter  Vostok Scattergun: slab-sided, slate and red, a red star, rivets
#   rail     Daedalus Rail Lance: dark-side near-black and violet, faceted and sharp, the delta with an eye
#   mortar   Rustmoon Junk Mortar: stolen, welded scrap; rust, acid-green paint, War-Rig violet; paint only, no mark
# Set A ("issue"): clean, practical shapes. Set B ("signature"): bolder takes with more mechanical character.
#
# Each weapon is a root pivot `wpn_<set>_<key>` in its own frame (three.js axes, metres): the right hand's grip at the
# origin, +z the way it fires, +y up. Its properties say how it's held (the preview's poses solve the arms to them):
#   hold     pistol (one hand, arm out to the side), hip (one hand, low and out to the side), wrist (strapped to the right forearm: its frame is the forearm's, +z toward the
#            hand), chest (two hands, held across the body), under (a long lance tucked under the right arm), shoulder
#            (a tube on the right shoulder)
#   fore     where the left hand holds it (absent: one-handed)
#   muzzle   where the shot leaves
# Ink as the house rules: bodies 0.02, fittings 0.012, small parts 0.008, flush paint and glow 0.

import bpy, math, os

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", ".."))
COLL = "Weapons"


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    # shared hardware
    "dark": "2a2540", "metal": "8a87a0", "steel": "55607a", "rubber": "1d1a29",
    # courier (Pulse Spinner)
    "c_orange": "ff4f2e", "c_cream": "fff4e0", "c_cyan": "2ee6ff", "c_yellow": "ffd23f", "c_navy": "241a5c", "laser": "9be7ff",
    # SPACECOM (the Pulse Spinner as picked: style.md, "Faction palettes")
    "s_cream": "f2ecdc", "s_yellow": "ffd23f", "s_navy": "2a3a6b", "s_white": "ffffff", "ledr": "ff2a4a", "ledb": "2e8bff",
    # Vostok
    "v_slate": "6b6f78", "v_red": "ff3b5c", "v_dark": "2c2f38", "v_cream": "f3eee4",
    # Daedalus
    "d_body": "1a1426", "d_panel": "4a4660", "plasma": "c77dff", "d_cream": "f3eee4",
    # Rustmoon
    "r_rust": "6a5a48", "r_rust2": "8a5a3a", "r_green": "7dff3a", "r_violet": "7b2ff7", "r_cream": "f3eee4", "ledg": "7dff3a",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
GLOW = {"laser", "c_cyan", "plasma", "ledg", "ledr", "ledb"}      # lit (the preview); glow slots in the game, named as its light sources (toon.js HALO_SLOT)

for f in ("kit.py", "zbornak_kit.py"):
    exec(open(os.path.join(REPO, "tools", "blender", f), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)


def parents_of(o):
    out, p = [], o.parent
    while p is not None:
        out.append(p)
        p = p.parent
    return out


def star(r, k=0.42, n=5, rot=0.0):
    """a star's outline [(a, b)], point up"""
    return [((r if i % 2 == 0 else r * k) * math.sin(rot + PI * i / n), (r if i % 2 == 0 else r * k) * math.cos(rot + PI * i / n)) for i in range(2 * n)]


def ngon(r, n, rot=0.0):
    return [(r * math.cos(rot + TAU * i / n), r * math.sin(rot + TAU * i / n)) for i in range(n)]


def root(set_, key, hold, fore=None, muzzle=(0, 0.15, 0.4)):
    g = G(f"wpn_{set_}_{key}", None, 0, 0, 0, solid=False)
    g.root["hold"], g.root["muzzle"] = hold, list(muzzle)
    if fore:
        g.root["fore"] = list(fore)
    return g


def delta_eye(g, x0, x1, y, z, s=1.0):
    """Daedalus' mark on a flank facing x: a cream delta, a violet eye in it (flush: 4 mm proud)"""
    tri = [(z - 0.05 * s, y - 0.035 * s), (z + 0.05 * s, y - 0.035 * s), (z, y + 0.05 * s)]
    g("d_cream", 0.0).polyx(tri, x0, x1)
    eye = [(z + 0.02 * s * math.cos(a), y + 0.0 + 0.011 * s * math.sin(a)) for a in [TAU * i / 12 for i in range(12)]]
    xs = 1 if x1 > 0 else -1
    g("plasma", 0.0).polyx(eye, x1, x1 + xs * 0.002)


# =====================================================================================================================
# PULSE SPINNER (courier issue)
# =====================================================================================================================
def pulse_a():
    """DISC BLASTER: a chunky one-hand blaster, the disc magazine spinning flat on top in a cream ring"""
    g = root("a", "pulse", "pistol", None, (0, 0.15, 0.36))
    g("c_orange", 0.02).rb(0, 0.15, 0.07, 0.075, 0.07, 0.2, 0.22)                      # body, z -0.13 .. 0.27
    g("c_cream", 0.012).rb(0, 0.2, 0.0, 0.06, 0.035, 0.12, 0.3)                       # top cover, under the ring
    g("c_navy", 0.012).rb(0, 0.15, 0.3, 0.06, 0.055, 0.05, 0.25)                      # muzzle block
    g("laser", 0.0).boxc(0, 0.15, 0.349, 0.08, 0.016, 0.006)                         # the launch slot, lit
    for y in (0.135, 0.165):                                                          # cream lips above and below it
        g("c_cream", 0.0).boxc(0, y, 0.349, 0.09, 0.008, 0.004)
    # the disc magazine: a cream ring on a navy hub, the lit disc inside it
    g("c_navy", 0.012).cylc(0, 0.245, 0.02, 0.05, 0.03, 16)
    g("c_cream", 0.012).tor(0.105, 0.018, (0, 0.255, 0.02), n=28, rs=6)
    for k in range(3):                                                                # the ring's three posts down to the cover
        a = TAU * k / 3 + PI / 6
        g("c_cream", 0.008).bm((0.105 * math.sin(a), 0.255, 0.02 + 0.105 * math.cos(a)), (0.06 * math.sin(a), 0.225, 0.02 + 0.06 * math.cos(a)), 0.012, 6)
    g("laser", 0.0).cylc(0, 0.255, 0.02, 0.088, 0.012, 24)
    g("c_cyan", 0.0).cylc(0, 0.263, 0.02, 0.025, 0.006, 12)
    # cyan stripes down each flank, flush; a yellow cell at the back
    for x in (-0.074, 0.074):
        g("c_cyan", 0.0).boxc(x, 0.16, 0.08, 0.004, 0.018, 0.28)
    g("c_yellow", 0.012).cylc(0, 0.15, -0.15, 0.045, 0.06, 14, "z")
    g("c_navy", 0.008).cylc(0, 0.15, -0.185, 0.03, 0.02, 12, "z")
    # grip, trigger, guard
    g("dark", 0.015).rb(0, 0.0, -0.03, 0.036, 0.1, 0.048, 0.3, rot=(0.25, 0, 0))
    g("c_yellow", 0.0).boxc(0, 0.01, -0.078, 0.03, 0.12, 0.004, rot=(0.25, 0, 0))
    g("c_cream", 0.008).boxc(0, 0.065, 0.05, 0.016, 0.04, 0.016, rot=(-0.3, 0, 0))
    g("dark", 0.008).path([(0, 0.085, 0.0), (0, 0.035, 0.03), (0, 0.035, 0.1), (0, 0.085, 0.12)], 0.011, 6)
    return g


def pulse_b():
    """WRIST SPINNER: a gauntlet on the right forearm, the lit disc standing in a cradle on top, a rail out over the fist"""
    g = root("b", "pulse", "wrist", None, (0, 0.2, 0.14))
    # the sleeve: an orange cuff round the forearm (the forearm runs z -0.325 .. 0 to the fist), cream bands at its ends
    g("c_orange", 0.02).lath([(0.112, -0.27), (0.126, -0.265), (0.13, -0.17), (0.124, -0.06), (0.11, -0.055), (0.11, -0.27)], (0, 0, 0), 24, (PI / 2, 0, 0))
    for z in (-0.255, -0.075):
        g("c_cream", 0.01).tor(0.13, 0.016, (0, 0, z), (PI / 2, 0, 0), n=24, rs=5)
    # the cradle: two cream cheeks round the disc, on an orange pillar off the sleeve
    g("c_orange", 0.015).boxc(0, 0.155, -0.16, 0.085, 0.07, 0.15)
    cheek = [(-0.16 + 0.118 * math.cos(a), 0.245 + 0.118 * math.sin(a)) for a in [PI + PI * i / 14 for i in range(15)]]   # a half-disc under the disc's middle
    for x0 in (0.034, -0.044):
        g("c_cream", 0.012).polyx(cheek, x0, x0 + 0.01)
    g("laser", 0.0).cylc(0, 0.245, -0.16, 0.1, 0.024, 28, "x")                       # the disc, upright, its rim proud of the cheeks
    g("c_cyan", 0.0).cylc(0, 0.245, -0.16, 0.03, 0.05, 12, "x")
    g("c_navy", 0.01).cylc(0, 0.245, -0.16, 0.018, 0.09, 10, "x")                     # its axle through both cheeks
    # the launch rail forward over the fist, lit along its top
    g("c_navy", 0.012).boxc(0, 0.205, 0.0, 0.05, 0.03, 0.26)
    g("c_cyan", 0.0).boxc(0, 0.222, 0.0, 0.012, 0.004, 0.24)
    g("c_navy", 0.008).boxc(0, 0.18, 0.05, 0.03, 0.03, 0.05)                         # the rail's foot on the cuff's front band
    # a yellow power cell on the outer side, strapped
    g("c_yellow", 0.012).cylc(0.135, 0.0, -0.165, 0.032, 0.13, 12, "z")
    g("c_navy", 0.008).cylc(0.135, 0.0, -0.165, 0.035, 0.02, 12, "z")
    return g


def pulse_spacecom(set_="pick"):
    """DISC BLASTER in SPACECOM's colours (the pick): A's blaster, cream with a yellow ring and cover, navy fittings, a white
    star on a navy roundel each side, a yellow flank stripe, a red and blue light bar on its back; the disc still lit in
    the player's laser colour"""
    g = root(set_, "pulse", "pistol", None, (0, 0.15, 0.36))
    g("s_cream", 0.02).rb(0, 0.15, 0.07, 0.075, 0.07, 0.2, 0.22)                      # body, z -0.13 .. 0.27
    g("s_yellow", 0.012).rb(0, 0.2, 0.0, 0.06, 0.035, 0.12, 0.3)                      # top cover, under the ring
    g("s_navy", 0.012).rb(0, 0.15, 0.3, 0.06, 0.055, 0.05, 0.25)                      # muzzle block
    g("laser", 0.0).boxc(0, 0.15, 0.349, 0.08, 0.016, 0.006)
    for y in (0.135, 0.165):
        g("s_yellow", 0.0).boxc(0, y, 0.349, 0.09, 0.008, 0.004)
    g("s_navy", 0.012).cylc(0, 0.245, 0.02, 0.05, 0.03, 16)                            # the disc magazine
    g("s_yellow", 0.012).tor(0.105, 0.018, (0, 0.255, 0.02), n=28, rs=6)
    for k in range(3):
        a = TAU * k / 3 + PI / 6
        g("s_yellow", 0.008).bm((0.105 * math.sin(a), 0.255, 0.02 + 0.105 * math.cos(a)), (0.06 * math.sin(a), 0.225, 0.02 + 0.06 * math.cos(a)), 0.012, 6)
    g("laser", 0.0).cylc(0, 0.255, 0.02, 0.088, 0.012, 24)
    g("s_navy", 0.0).cylc(0, 0.263, 0.02, 0.025, 0.006, 12)
    for x in (-0.075, 0.075):                                                         # the roundel and star, the stripe (flush)
        sx = 1 if x > 0 else -1
        g("s_navy", 0.0).cylc(x + sx * 0.0015, 0.16, 0.1, 0.042, 0.003, 20, "x")
        g("s_white", 0.0).polyx([(0.1 + b, 0.16 + a) for a, b in [(p[1], p[0]) for p in star(0.03)]], x + sx * 0.003, x + sx * 0.005)
        g("s_yellow", 0.0).boxc(x, 0.105, 0.07, 0.004, 0.014, 0.3)
    g("s_navy", 0.012).cylc(0, 0.15, -0.15, 0.045, 0.06, 14, "z")                     # the back cap
    g("s_navy", 0.01).boxc(0, 0.2, -0.1, 0.1, 0.02, 0.05)                             # light bar on top at the back
    g("ledr", 0.0).boxc(-0.026, 0.213, -0.1, 0.044, 0.008, 0.04)
    g("ledb", 0.0).boxc(0.026, 0.213, -0.1, 0.044, 0.008, 0.04)
    g("dark", 0.015).rb(0, 0.0, -0.03, 0.036, 0.1, 0.048, 0.3, rot=(0.25, 0, 0))     # grip, trigger, guard
    g("s_yellow", 0.0).boxc(0, 0.01, -0.078, 0.03, 0.12, 0.004, rot=(0.25, 0, 0))
    g("s_white", 0.008).boxc(0, 0.065, 0.05, 0.016, 0.04, 0.016, rot=(-0.3, 0, 0))
    g("dark", 0.008).path([(0, 0.085, 0.0), (0, 0.035, 0.03), (0, 0.035, 0.1), (0, 0.085, 0.12)], 0.011, 6)
    return g


# =====================================================================================================================
# VOSTOK SCATTERGUN
# =====================================================================================================================
def vostok_star(g, x, y, z, r, face="x"):
    """a red star on a flat face (x: a flank at x; z: a front at z), 4 mm proud"""
    pts = star(r)
    if face == "x":
        s = 1 if x > 0 else -1
        g("v_red", 0.0).polyx([(z + b, y + a) for a, b in [(p[1], p[0]) for p in pts]], x, x + s * 0.004)
    else:
        g("v_red", 0.0).polyz([(x + p[0], y + p[1]) for p in pts], z, z + 0.004)


def scatter_a(set_="a"):
    """BREAKER: a slab-sided box shotgun, a flared slot muzzle for the spread, a drum underneath, a red star each side"""
    g = root(set_, "scatter", "chest", (0, 0.03, 0.24), (0, 0.14, 0.57))
    g("v_slate", 0.02).boxc(0, 0.135, 0.02, 0.1, 0.15, 0.36)                          # receiver, z -0.16 .. 0.2
    g("v_dark", 0.012).boxc(0, 0.222, 0.02, 0.06, 0.025, 0.3)                         # top rail
    for z in (-0.08, 0.04, 0.14):
        g("v_dark", 0.0).boxc(0, 0.236, z, 0.064, 0.006, 0.02)
    g("v_slate", 0.02).boxc(0, 0.14, 0.33, 0.09, 0.11, 0.26)                          # shroud, z 0.2 .. 0.46
    g("v_red", 0.012).boxc(0, 0.14, 0.42, 0.098, 0.118, 0.04)                         # red band
    g("v_dark", 0.015).polyx([(0.46, 0.08), (0.56, 0.05), (0.56, 0.23), (0.46, 0.2)], -0.065, 0.065)   # flared muzzle
    g("rubber", 0.0).boxc(0, 0.14, 0.5625, 0.11, 0.15, 0.006)                          # its mouth
    for x in (-0.03, 0.0, 0.03):
        g("v_dark", 0.0).boxc(x, 0.14, 0.566, 0.008, 0.13, 0.004)                    # baffles
    g("v_dark", 0.015).cylc(0, -0.01, 0.09, 0.095, 0.085, 18, "x")                    # the drum, under the receiver
    g("v_cream", 0.0).cylc(0, -0.01, 0.09, 0.045, 0.089, 12, "x")
    g("v_slate", 0.008).cylc(0, -0.01, 0.09, 0.02, 0.1, 8, "x")
    for x in (-0.051, 0.051):
        vostok_star(g, x, 0.135, -0.04, 0.045)
        for y in (0.075, 0.195):                                                      # rivets along the flank
            for z in (-0.14, 0.1, 0.18):
                g("v_dark", 0.0).cylc(x, y, z, 0.008, 0.008, 6, "x")
    g("v_slate", 0.02).boxc(0, 0.12, -0.25, 0.07, 0.11, 0.18)                         # short slab stock
    g("v_dark", 0.012).boxc(0, 0.12, -0.345, 0.08, 0.13, 0.02)                        # butt pad
    g("v_red", 0.0).boxc(0, 0.177, -0.25, 0.073, 0.006, 0.14)                         # red stripe along its top
    g("v_dark", 0.015).rb(0, 0.0, -0.01, 0.034, 0.1, 0.045, 0.3, rot=(0.2, 0, 0))     # pistol grip
    g("v_dark", 0.012).cylc(0, 0.02, 0.24, 0.03, 0.14, 10)                            # foregrip
    g("v_slate", 0.008).boxc(0, 0.06, 0.06, 0.016, 0.03, 0.016, rot=(-0.3, 0, 0))    # trigger
    return g


def scatter_b():
    """HEDGEHOG: seven short barrels (seven pellets) in a hexagon behind a riveted slab shield with a big red star, a carry
    handle, an ammo box, a side handle for the left hand"""
    g = root("b", "scatter", "chest", (-0.15, 0.15, 0.16), (0, 0.15, 0.5))
    g("v_slate", 0.02).boxc(0, 0.15, -0.1, 0.12, 0.16, 0.24)                          # receiver, z -0.22 .. 0.02
    g("v_slate", 0.02).polyz(ngon(0.12, 6, PI / 6), 0.02, 0.3, t=(0, 0.15, 0))        # hex housing
    for x, y in [(0, 0)] + [(0.07 * math.cos(TAU * i / 6), 0.07 * math.sin(TAU * i / 6)) for i in range(6)]:
        g("v_dark", 0.01).cylc(x, 0.15 + y, 0.36, 0.028, 0.14, 12, "z")               # barrels out of the housing
        g("rubber", 0.0).cylc(x, 0.15 + y, 0.4315, 0.017, 0.004, 10, "z")
    g("v_red", 0.012).polyz(ngon(0.124, 6, PI / 6), 0.26, 0.3, t=(0, 0.15, 0))         # red band at the housing's mouth
    # the shield: a slab across the gun just ahead of the hands, the star on its face, rivets round it
    g("v_slate", 0.02).boxc(0, 0.16, 0.06, 0.32, 0.28, 0.025)
    vostok_star(g, 0, 0.21, 0.0725, 0.06, "z")
    for x in (-0.14, 0.14):
        for y in (0.04, 0.28):
            g("v_dark", 0.0).cylc(x, y, 0.0745, 0.01, 0.006, 6, "z")
    g("v_red", 0.0).boxc(0, 0.297, 0.06, 0.3, 0.006, 0.027)                           # red edge along its top
    g("v_dark", 0.015).path([(0, 0.23, -0.18), (0, 0.33, -0.12), (0, 0.33, -0.02), (0, 0.23, 0.0)], 0.018, 6)   # carry handle
    g("v_dark", 0.015).boxc(0.0, 0.03, -0.12, 0.1, 0.09, 0.14)                        # ammo box under the receiver
    g("v_cream", 0.0).boxc(0.0505, 0.03, -0.12, 0.004, 0.025, 0.1)
    g("v_dark", 0.015).rb(0, 0.0, -0.01, 0.034, 0.1, 0.045, 0.3, rot=(0.2, 0, 0))     # pistol grip
    g("v_dark", 0.012).bm((-0.06, 0.15, 0.16), (-0.19, 0.15, 0.16), 0.026, 10)       # side handle (left hand)
    g("v_red", 0.0).cylc(-0.19, 0.15, 0.16, 0.03, 0.01, 10, "x")
    g("v_slate", 0.008).boxc(0, 0.06, 0.06, 0.016, 0.03, 0.016, rot=(-0.3, 0, 0))
    return g


# =====================================================================================================================
# DAEDALUS RAIL LANCE
# =====================================================================================================================
HEXB = [(-0.06, 0.04), (0.06, 0.04), (0.08, 0.1), (0.05, 0.17), (-0.05, 0.17), (-0.08, 0.1)]   # the body's facets


def rail_a():
    """RAIL LANCE: a faceted near-black body tucked under the arm, two long rails out front lit violet on their inner faces,
    collars binding them, an angular scope, the delta-eye on the tail fin"""
    g = root("a", "rail", "under", (0, 0.0, 0.22), (0, 0.105, 1.15))
    g("d_body", 0.02).polyz(HEXB, -0.55, 0.3)
    for s in (-1, 1):                                                                 # violet seams along the upper facets
        g("plasma", 0.0).boxc(s * 0.066, 0.135, -0.1, 0.004, 0.008, 0.7, rot=(0, 0, s * 0.95))
        # the rails
        g("d_body", 0.012).boxc(s * 0.045, 0.105, 0.72, 0.03, 0.07, 0.84)
        g("plasma", 0.0).boxc(s * 0.0285, 0.105, 0.72, 0.004, 0.03, 0.8)
        g("d_panel", 0.008).polyx([(1.14, 0.07), (1.2, 0.105), (1.14, 0.14)], s * 0.03, s * 0.06)   # pointed tips
    for z in (0.36, 0.66, 0.96):                                                      # collars binding the rails
        g("d_panel", 0.01).boxc(0, 0.105, z, 0.13, 0.1, 0.035)
    # the tail fin, the mark on both its faces
    g("d_panel", 0.012).polyx([(-0.62, 0.17), (-0.36, 0.17), (-0.3, 0.3), (-0.5, 0.33)], -0.012, 0.012)
    for s in (-1, 1):
        delta_eye(g, s * 0.012, s * 0.016, 0.235, -0.45, 1.1)
    # scope
    g("d_body", 0.012).boxc(0, 0.215, 0.02, 0.04, 0.05, 0.24)
    g("d_panel", 0.008).boxc(0, 0.183, 0.02, 0.025, 0.02, 0.06)
    g("plasma", 0.0).cylc(0, 0.215, 0.142, 0.015, 0.006, 10, "z")
    g("d_body", 0.015).rb(0, -0.01, -0.01, 0.03, 0.1, 0.042, 0.3, rot=(0.25, 0, 0))  # pistol grip
    g("d_body", 0.012).cylc(0, 0.0, 0.22, 0.027, 0.1, 10)                             # fore grip
    g("plasma", 0.0).boxc(0, 0.06, 0.08, 0.012, 0.03, 0.012)                        # trigger, lit
    return g


def rail_mix(set_="pick"):
    """RAIL LANCE with coil rings (the pick): A's faceted body, rails, pointed tips, scope and fin, the collars swapped for
    B's five violet coil rings round both rails, each on four spokes to the rails' corners; no forked tip"""
    g = root(set_, "rail", "under", (0, 0.0, 0.22), (0, 0.105, 1.15))
    g("d_body", 0.02).polyz(HEXB, -0.55, 0.3)
    for s in (-1, 1):
        g("plasma", 0.0).boxc(s * 0.066, 0.135, -0.1, 0.004, 0.008, 0.7, rot=(0, 0, s * 0.95))
        g("d_body", 0.012).boxc(s * 0.045, 0.105, 0.72, 0.03, 0.07, 0.84)
        g("plasma", 0.0).boxc(s * 0.0285, 0.105, 0.72, 0.004, 0.03, 0.8)
        g("d_panel", 0.008).polyx([(1.14, 0.07), (1.2, 0.105), (1.14, 0.14)], s * 0.03, s * 0.06)
    for i in range(5):                                                                # the coil rings, on spokes to the rails
        z = 0.38 + 0.16 * i
        g("plasma", 0.0).tor(0.095, 0.016, (0, 0.105, z), (PI / 2, 0, 0), n=28, rs=5)
        for sx in (-1, 1):
            for sy in (-1, 1):
                a = math.atan2(sy, sx)
                g("d_panel", 0.006).bm((sx * 0.055, 0.105 + sy * 0.03, z), (0.081 * math.cos(a), 0.105 + 0.081 * math.sin(a), z), 0.008, 5)
    g("d_panel", 0.012).polyx([(-0.62, 0.17), (-0.36, 0.17), (-0.3, 0.3), (-0.5, 0.33)], -0.012, 0.012)
    for s in (-1, 1):
        delta_eye(g, s * 0.012, s * 0.016, 0.235, -0.45, 1.1)
    g("d_body", 0.012).boxc(0, 0.215, 0.02, 0.04, 0.05, 0.24)
    g("d_panel", 0.008).boxc(0, 0.183, 0.02, 0.025, 0.02, 0.06)
    g("plasma", 0.0).cylc(0, 0.215, 0.142, 0.015, 0.006, 10, "z")
    g("d_body", 0.015).rb(0, -0.01, -0.01, 0.03, 0.1, 0.042, 0.3, rot=(0.25, 0, 0))
    g("d_body", 0.012).cylc(0, 0.0, 0.22, 0.027, 0.1, 10)
    g("plasma", 0.0).boxc(0, 0.06, 0.08, 0.012, 0.03, 0.012)
    return g


def rail_b():
    """COIL LANCE: a slender spine through five violet coil rings on spoked cradles, a forked blade tip, a faceted power core
    at the hands with the delta-eye on its flanks"""
    g = root("b", "rail", "under", (0, 0.0, 0.22), (0, 0.12, 1.25))
    core = [(-0.07, 0.04), (0.07, 0.04), (0.07, 0.16), (0.04, 0.2), (-0.04, 0.2), (-0.07, 0.16)]
    g("d_body", 0.02).polyz(core, -0.4, 0.18)
    g("plasma", 0.0).boxc(0, 0.2025, -0.12, 0.05, 0.004, 0.36)                      # the core's lit window on top
    for s in (-1, 1):
        delta_eye(g, s * 0.07, s * 0.074, 0.11, -0.12, 1.3)
    g("d_panel", 0.012).polyz([(-0.05, 0.06), (0.05, 0.06), (0.03, 0.18), (-0.03, 0.18)], -0.56, -0.4)   # tapered tail
    g("d_body", 0.012).boxc(0, 0.12, 0.6, 0.044, 0.044, 0.84)                          # the spine, z 0.18 .. 1.02
    for i in range(5):
        z = 0.3 + 0.16 * i
        g("plasma", 0.0).tor(0.075, 0.016, (0, 0.12, z), (PI / 2, 0, 0), n=24, rs=5)
        for k in range(3):                                                            # the ring's cradle: three spokes
            a = TAU * k / 3 + PI / 2
            g("d_panel", 0.006).bm((0.02 * math.cos(a), 0.12 + 0.02 * math.sin(a), z), (0.062 * math.cos(a), 0.12 + 0.062 * math.sin(a), z), 0.008, 5)
    for s in (-1, 1):                                                                 # the forked tip: two blades
        g("d_panel", 0.012).polyx([(1.0, 0.1 + s * 0.012), (1.32, 0.12 + s * 0.085), (1.25, 0.12 + s * 0.05), (1.0, 0.12 + s * 0.022)], -0.015, 0.015)
        g("plasma", 0.0).polyx([(1.04, 0.12 + s * 0.022), (1.26, 0.12 + s * 0.052), (1.25, 0.12 + s * 0.047), (1.04, 0.12 + s * 0.017)], -0.017, 0.017)
    g("d_body", 0.015).rb(0, -0.01, -0.01, 0.03, 0.1, 0.042, 0.3, rot=(0.25, 0, 0))
    g("d_body", 0.012).cylc(0, 0.0, 0.22, 0.027, 0.1, 10)
    g("d_panel", 0.008).boxc(0, 0.06, 0.22, 0.06, 0.02, 0.06)                          # the fore grip's mount under the spine
    g("d_panel", 0.008).boxc(0, 0.085, 0.22, 0.02, 0.03, 0.03)
    g("plasma", 0.0).boxc(0, 0.06, 0.08, 0.012, 0.03, 0.012)
    return g


# =====================================================================================================================
# RUSTMOON JUNK MORTAR
# =====================================================================================================================
def mortar_a():
    """PIPE MORTAR: a fat scrap pipe on the shoulder, a funnel bell, welded seams and odd plates, an acid-green band slapped
    on, a gas bottle strapped underneath, bent-pipe grips"""
    g = root("a", "mortar", "shoulder", (0, 0.0, 0.2), (0, 0.24, 0.66))
    ax = (0, 0.24, 0)
    g("r_rust", 0.02).lath([(0.0, -0.46), (0.085, -0.46), (0.1, -0.44), (0.1, 0.44), (0.0, 0.44)], ax, 24, (PI / 2, 0, 0))
    g("r_rust2", 0.02).lath([(0.0, 0.44), (0.1, 0.44), (0.165, 0.62), (0.155, 0.64), (0.0, 0.5)], ax, 24, (PI / 2, 0, 0))   # funnel bell
    g("rubber", 0.0).cylc(0, 0.24, 0.6, 0.13, 0.004, 20, "z")                         # the bore's dark mouth (inside the bell)
    for z, r in ((-0.3, 0.104), (0.05, 0.106), (0.3, 0.103)):                         # weld seams, uneven
        g("r_rust2", 0.008).tor(r, 0.01, (0, 0.24, z), (PI / 2, 0, 0), n=24, rs=4)
    g("r_green", 0.0).lath([(0.1015, 0.12), (0.1015, 0.24)], ax, 24, (PI / 2, 0, 0))  # acid-green band (paint, flush)
    g("r_violet", 0.012).boxc(0.0, 0.345, -0.18, 0.12, 0.012, 0.18, rot=(0, 0.12, 0))   # a War-Rig violet plate welded on top
    g("steel", 0.012).boxc(0.095, 0.25, 0.22, 0.012, 0.11, 0.14, rot=(0, 0, 0.18))    # a steel patch on the right flank
    g("r_rust2", 0.012).lath([(0.0, -0.58), (0.06, -0.56), (0.075, -0.46), (0.0, -0.46)], ax, 12, (PI / 2, 0, 0))   # exhaust cone
    # gas bottle under the tube, two straps round both
    g("r_cream", 0.015).cylc(0, 0.085, 0.0, 0.05, 0.28, 14, "z")
    g("r_violet", 0.0).cylc(0, 0.085, 0.0, 0.0505, 0.06, 14, "z")
    for z in (-0.1, 0.1):
        g("dark", 0.008).path([(0.0, 0.035, z), (0.105, 0.16, z), (0.108, 0.24, z), (0.0, 0.345, z), (-0.108, 0.24, z), (-0.105, 0.16, z), (0.0, 0.035, z)], 0.008, 4)
    # sight: a bent rod with a green bead
    g("steel", 0.008).path([(0, 0.335, 0.3), (0, 0.39, 0.32), (0, 0.39, 0.38)], 0.008, 5)
    g("ledg", 0.0).ball(0, 0.39, 0.385, 0.014, 8, 6)
    # grips: bent pipe, the rear one with a trigger
    g("steel", 0.015).path([(0, 0.15, 0.02), (0, 0.05, 0.0), (0, -0.07, -0.03)], 0.026, 8)
    g("steel", 0.015).path([(0, 0.15, 0.2), (0, 0.0, 0.2)], 0.024, 8)
    g("r_green", 0.005).boxc(0, 0.11, 0.06, 0.014, 0.035, 0.014)
    return g


def mortar_b(set_="b"):
    """JUNK HOPPER: a stubby flared cannon at the hip, a hopper on top full of scrap (bolts, a gear, a can), a crank on the
    right, a stovepipe exhaust, acid-green stripes and a violet patch"""
    # (as picked it is held one-handed at the hip, out to the side, so it shows from behind: the side handle stays, unused)
    g = root(set_, "mortar", "hip", None, (0, 0.15, 0.62)) if set_ == "pick" else root(set_, "mortar", "chest", (-0.13, 0.15, 0.2), (0, 0.15, 0.62))
    ax = (0, 0.15, 0)
    g("r_rust", 0.02).lath([(0.0, -0.22), (0.11, -0.22), (0.11, 0.06), (0.085, 0.1), (0.085, 0.42), (0.15, 0.56), (0.14, 0.58), (0.0, 0.5)], ax, 24, (PI / 2, 0, 0))
    g("rubber", 0.0).cylc(0, 0.15, 0.555, 0.12, 0.004, 20, "z")
    for z in (0.18, 0.32):                                                            # acid-green stripes
        g("r_green", 0.0).lath([(0.0865, z), (0.0865, z + 0.05)], ax, 24, (PI / 2, 0, 0))
    g("r_violet", 0.012).boxc(-0.105, 0.15, -0.08, 0.012, 0.12, 0.16)                 # violet patch on the left of the breech
    # the hopper: a funnel standing on the breech, its rim painted green, scrap inside
    g("r_rust2", 0.015).lath([(0.05, 0.25), (0.13, 0.42), (0.12, 0.43), (0.04, 0.27)], (0, 0, -0.08), 16)
    g("r_green", 0.0).tor(0.126, 0.012, (0, 0.425, -0.08), n=20, rs=4)
    g("dark", 0.0).cylc(0, 0.37, -0.08, 0.095, 0.006, 14)                             # the scrap's bed
    g("metal", 0.008).tor(0.035, 0.012, (0.03, 0.39, -0.1), (0.5, 0, 0.3), n=10, rs=4)   # a gear
    g("steel", 0.008).cylc(-0.03, 0.4, -0.05, 0.012, 0.07, 6, rot=(0.6, 0, 0.4))         # bolts
    g("steel", 0.008).cylc(0.0, 0.395, -0.03, 0.012, 0.06, 6, rot=(-0.4, 0, -0.7))
    g("r_cream", 0.008).cylc(-0.045, 0.395, -0.11, 0.025, 0.06, 10, rot=(0.3, 0, 0.5))   # a can
    g("r_rust2", 0.012).cylc(0, 0.27, -0.08, 0.05, 0.04, 12)                           # the hopper's neck into the breech
    # crank on the right
    g("steel", 0.012).cylc(0.12, 0.15, -0.08, 0.035, 0.03, 12, "x")
    g("steel", 0.008).path([(0.135, 0.15, -0.08), (0.15, 0.06, -0.12), (0.19, 0.06, -0.12)], 0.01, 5)
    g("r_violet", 0.008).cylc(0.2, 0.06, -0.12, 0.018, 0.05, 8, "x")
    # stovepipe exhaust from the back, up
    g("r_rust2", 0.012).path([(0, 0.15, -0.21), (0, 0.17, -0.3), (0, 0.27, -0.33), (0, 0.36, -0.33)], 0.03, 10)
    g("dark", 0.0).cylc(0, 0.362, -0.33, 0.022, 0.004, 10)
    g("steel", 0.015).path([(0, 0.06, 0.02), (0, 0.0, 0.0), (0, -0.08, -0.03)], 0.026, 8)   # pistol grip, bent pipe
    g("steel", 0.012).bm((-0.07, 0.15, 0.2), (-0.17, 0.15, 0.2), 0.025, 10)           # side handle
    g("ledg", 0.0).ball(0.0, 0.26, 0.04, 0.016, 8, 6)                               # a ready lamp
    return g


WEAPONS = {"a": [pulse_a(), scatter_a(), rail_a(), mortar_a()], "b": [pulse_b(), scatter_b(), rail_b(), mortar_b()],
           "pick": [pulse_spacecom(), scatter_a("pick"), rail_mix(), mortar_b("pick")]}       # the set as picked
flush_all()
print("weapons:", {k: [g.root.name for g in v] for k, v in WEAPONS.items()},
      sum(len(o.data.polygons) for o in C.objects if o.type == "MESH"), "faces")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    roots = []
    for g in WEAPONS["pick"]:
        g.root.name = "wpn_" + g.root.name.split("_")[-1]                       # wpn_pick_pulse -> wpn_pulse
        g.root["role"] = "export"
        roots.append(g.root)
    keep = [o for o in C.objects if any(o is r or r in parents_of(o) for r in roots)]
    export(os.path.join(REPO, "src", "assets", "weapons.glb"), keep)
