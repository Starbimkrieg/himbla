# The casino's card-suit trim (exec'd after kit.py, like decals.py): a dark panel in a thin brass frame with a suit in it,
# spades and clubs cream, hearts and diamonds red. Same shapes as build_plinko.py; used by the Duck Derby, the blackjack
# apron and the claw machine's base, so every suit trim in the hall matches.
#   suit_panel(frame, fill, red, cream, kind, pos, yaw, w, h, s)   adds to four accumulators (anything with .add(geo, t, rot)):
#       frame bars, panel fill, and the suit into `red` (kind 1 heart, 2 diamond) or `cream` (0 spade, 3 club).
#   pos: middle of the panel's back; yaw 0 faces +z, PI / 2 faces +x. w x h: the panel; s: suit height.
import math as _m


def heart_outline(flip=False):
    pts = []
    for i in range(40):
        t = 2 * _m.pi * i / 40
        x = 16 * _m.sin(t) ** 3
        y = 13 * _m.cos(t) - 5 * _m.cos(2 * t) - 2 * _m.cos(3 * t) - _m.cos(4 * t)
        pts.append((x, -y if flip else y))
    return pts


def suit_geos(kind, s, depth):
    """kind 0 spade, 1 heart, 2 diamond, 3 club: about s m tall, centred, facing +z"""
    if kind == 1:
        k = s / 29.0
        return [extrude([(x * k, (y + 2.5) * k) for x, y in heart_outline()], depth, "z")]
    if kind == 2:
        return [extrude([(0, 0.5 * s), (0.32 * s, 0), (0, -0.5 * s), (-0.32 * s, 0)], depth, "z")]
    if kind == 0:
        k = s / 35.0
        return [extrude([(x * k, (y - 2.5) * k) for x, y in heart_outline(True)], depth, "z"),
                extrude([(-2 * k, -2.5 * k), (2 * k, -2.5 * k), (5 * k, -15.5 * k), (-5 * k, -15.5 * k)], depth * 0.7, "z")]
    r = 0.2 * s
    return [xf(rbox(r, r, depth / 2, 1, 14, 8), (x * s, y * s, 0)) for x, y in ((0, 0.22), (-0.22, -0.08), (0.22, -0.08))] + \
        [extrude([(-0.05 * s, 0.0), (0.05 * s, 0.0), (0.12 * s, -0.46 * s), (-0.12 * s, -0.46 * s)], depth * 0.7, "z")]


def suit_panel(frame, fill, red, cream, kind, pos, yaw, w, h, s, fr=0.045):
    d = 0.05
    bars = [xf(cuboid(w, fr, d)[:2], (0, h / 2 - fr / 2, d / 2)), xf(cuboid(w, fr, d)[:2], (0, -(h / 2 - fr / 2), d / 2)),
            xf(cuboid(fr, h - 2 * fr, d)[:2], (w / 2 - fr / 2, 0, d / 2)), xf(cuboid(fr, h - 2 * fr, d)[:2], (-(w / 2 - fr / 2), 0, d / 2))]
    frame.add(join(bars), pos, (0, yaw, 0))
    fill.add(xf(cuboid(w - 2 * fr, h - 2 * fr, 0.03)[:2], (0, 0, 0.015)), pos, (0, yaw, 0))
    (red if kind in (1, 2) else cream).add(join([xf(g[:2], (0, 0, 0.03 + 0.0125)) for g in suit_geos(kind, s, 0.025)]), pos, (0, yaw, 0))
