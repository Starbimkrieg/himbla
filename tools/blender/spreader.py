# Container spreader both cranes lift their box container with. Load with
#   exec(open(<repo>/tools/blender/spreader.py).read(), globals())
# after kit.py, with C and the slots body, dark and steel in scope. Builds nothing itself.
#
#   spreader(pfx, parent, top)    frame on a box container whose top corner castings are at height `top` in `parent`'s frame,
#                                 centred on its origin, length along z
#
# Fixed-length bridle spreader of true boxes: a headblock across each end on the twist-locks in the four top castings
# (x = +-SPR_X, z = +-SPR_Z), two main beams between them, two cross members between those. Each headblock end has a pad-eye
# turned into its sling's plane (toward the middle, where the hook hangs) with a pin; slings end on the pins, SPR_PIN over the castings.

import math

SPR_X, SPR_Z = 1.5, 3.55     # top castings = twist-locks (half container width / length, less the casting)
SPR_PIN = 0.56               # pad-eye pin height over the casting tops: where the slings end


def _spr_box(hx, hy, hz, pos, rot=(0, 0, 0)):
    """A plain cuboid (half extents)."""
    v = [(sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return xf((v, f), pos, rot)


def spreader(pfx, parent, top):
    T = top
    HB = (1.68, 0.16, 0.2)                       # headblock half extents; stands 0.08 over the castings
    HY = T + 0.08 + HB[1]
    MX = 0.85                                    # main beam centres (x)
    corners = [(sx, sz) for sx in (-1, 1) for sz in (-1, 1)]
    # twist-locks: cone into the casting hole, collar the headblock sits on
    mesh(pfx + "twistLocks", join([xf(lathe([(0.0, T - 0.12), (0.05, T - 0.12), (0.09, T - 0.03), (0.09, T), (0.13, T), (0.13, T + 0.08), (0.0, T + 0.08)], 10),
                                       (sx * SPR_X, 0, sz * SPR_Z)) for sx, sz in corners]), "dark", parent, 0.02)
    # frame: headblocks, main beams (1 cm into the headblocks, top and bottom inside theirs, so no coplanar faces), cross members
    frame = [_spr_box(*HB, (0, HY, sz * SPR_Z)) for sz in (-1, 1)]
    frame += [_spr_box(0.12, 0.14, SPR_Z - HB[2] + 0.01, (sx * MX, HY, 0)) for sx in (-1, 1)]
    frame += [_spr_box(MX - 0.11, 0.1, 0.08, (0, HY, sz * 1.2)) for sz in (-1, 1)]
    mesh(pfx + "spreader", join(frame), "body", parent, 0.04)
    # pad-eyes: round-topped plate over each twist-lock in its sling's plane, with a pin through
    PY = T + SPR_PIN
    top_ = HY + HB[1]
    R = 0.15
    plate =[(-R, top_ - 0.02), (R, top_ - 0.02)] + [(R * math.cos(math.radians(a)), PY + R * math.sin(math.radians(a))) for a in range(0, 181, 20)]
    eyes, pins = [], []
    for sx, sz in corners:
        ry = math.atan2(-sx * SPR_X, -sz * SPR_Z)          # plate z toward the middle
        pos = (sx * SPR_X, 0, sz * SPR_Z)
        eyes.append(xf(extrude(plate, 0.05, "x"), pos, (0, ry, 0)))
        c, s = math.cos(ry), math.sin(ry)                  # pin across the plate, along its local x
        pins.append(B((pos[0] - 0.09 * c, PY, pos[2] + 0.09 * s), (pos[0] + 0.09 * c, PY, pos[2] - 0.09 * s), 0.04, 8, True))
    mesh(pfx + "padEyes", join(eyes), "dark", parent, 0.02)
    mesh(pfx + "padPins", join(pins), "steel", parent, 0)
    return PY
