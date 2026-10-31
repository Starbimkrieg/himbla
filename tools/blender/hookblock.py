# The two-fall hook block of the tower crane (build_crane.py), the container gantry (build_gantry.py) and the Vostok Hangar's
# bridge crane (build_hangar.py). Load with
#   exec(open(<repo>/tools/blender/hookblock.py).read(), globals())
# after kit.py. Builds nothing itself.
#
#   hook_block(M, parent, along="z", fall=0.33, sr=0.28) -> the saddle's height (where slings sit in the bowl)
#       M(name, geo, slot, parent, ink) makes one mesh (the builder's own: it names and places it). The block is drawn in
#       `parent`'s frame, which is the hook pivot: the two rope falls come down to its origin `fall` either side of the
#       middle, along z (along="z", the tower crane) or along x (along="x", the gantry). Slots: dark, steel, body.
#
# A sheave in the plane of both falls between round-topped cheek plates, tied above and below; under it a crosshead and a
# swivel; then the forged hook, its shank down from the swivel, its back bending out, round the bowl (the saddle sits right
# under the swivel) and up to the tip, with a sprung latch across the throat. About 2.2 m from the sheave axle to the hook's
# bottom.

import math


def _hk_box(hx, hy, hz, pos, rot=(0, 0, 0)):
    """A plain cuboid (half extents)."""
    v = [(sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return xf((v, f), pos, rot)


def hook_block(M, parent, along="z", fall=0.33, sr=0.28):
    sw = along == "x"
    P = (lambda x, y, z: (z, y, x)) if sw else (lambda x, y, z: (x, y, z))   # (the gantry's is the crane's with x and z swapped)
    R = (lambda a: (a, 0, 0)) if sw else (lambda a: (0, 0, a))             # a turn that lays an axle across the falls
    pi = math.pi
    M("hookSheave", xf(lathe([(0.0, -0.05), (sr, -0.05), (sr - 0.04, 0.0), (sr, 0.05), (0.0, 0.05)], 14), (0, 0, 0), R(pi / 2)), "dark", parent, 0.02)
    rc = fall + 0.12                                            # cheek plates: round-topped about the axle, square below
    cheek = [(rc * math.cos(math.radians(a)), rc * math.sin(math.radians(a))) for a in range(0, 181, 15)] + [(-rc, -0.62), (rc, -0.62)]
    M("hookCheeks", join([xf(extrude(cheek, 0.07, "z" if sw else "x"), P(s * 0.12, 0, 0)) for s in (-1, 1)]), "body", parent, 0.04)
    M("hookAxle", join([xf(lathe([(0.0, -0.05), (0.11, -0.05), (0.11, 0.05), (0.0, 0.05)], 10), P(s * 0.18, 0, 0), R(pi / 2)) for s in (-1, 1)]), "steel", parent, 0.02)
    M("hookTie", join([_hk_box(*P(0.12, 0.04, 0.05), (0, 0.38, 0))] + [_hk_box(*P(0.12, 0.05, 0.05), P(0, -0.48, s * 0.3)) for s in (-1, 1)]), "steel", parent, 0.02)
    M("hookCrosshead", xf(rbox(*P(0.2, 0.2, fall + 0.12), 0.1, 6, 3), (0, -0.8, 0), (0, 0, 0)), "body", parent, 0.04)
    M("hookSwivel", lathe([(0.0, -1.32), (0.16, -1.32), (0.18, -1.2), (0.18, -1.08), (0.12, -1.0), (0.0, -1.0)], 10), "steel", parent, 0.02)
    hc, hr = (0.0, -1.88), 0.24                                 # the bowl's middle and radius
    path = [(0.0, -1.3), (0.0, -1.48), (-0.09, -1.6)]
    rad = [0.085, 0.09, 0.1]
    for k in range(12):
        a = math.radians(150 + (395 - 150) * k / 11)
        path.append((hc[0] + hr * math.cos(a), hc[1] + hr * math.sin(a)))
        rad.append(0.11 - 0.06 * max(0.0, (k - 6) / 5) if k > 6 else 0.11)
    M("hookIron", tube([P(x, y, 0) for x, y in path], rad, 8, True), "dark", parent, 0.03)
    tip = path[-1]
    M("hookLatch", B(P(0.07, -1.47, 0), P(tip[0] - 0.02, tip[1] + 0.04, 0), 0.025, 4, True), "body", parent, 0)
    return hc[1] - hr + 0.1
