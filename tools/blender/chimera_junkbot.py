# The chimera kit's junkbot (exec'd by build_chimera.py after chimera_common.py), one look:
#   legs   two tank treads (a track round three road wheels and a sprocket on each side) under a chassis block
#   body   a scrap-metal torso: patched panels with their rivets cut in, a round hatch, a vent grille, an exhaust stack, two claw arms
#   head   an old CRT monitor: a glowing pixel face on its screen, a whip aerial, bolts for ears
# Its hide is the junkbot's paint (the builder tints it); the patches are rust. It counts as a car for its mutations' devices and armour.
# Its boxes are built as boxes (remesh=False: flat panels and crisp edges, the details cut into them), each its own piece: a robot is
# bolted together, so its seams show.


def stadium(L, R, n=10):
    """a running track's outline (z, y): two half circles of radius R, L apart"""
    pts = []
    for k in range(n + 1):
        a = -math.pi / 2 + math.pi * k / n
        pts.append((L / 2 + math.cos(a) * R, math.sin(a) * R))
    for k in range(n + 1):
        a = math.pi / 2 + math.pi * k / n
        pts.append((-L / 2 + math.cos(a) * R, math.sin(a) * R))
    return pts


def junk_legs(root, rng):
    F = Fit(rng)
    R, L, w, tx = 0.15, 0.62, 0.15, 0.27
    hip = 0.48
    fused(root.name + "_deck", soft(0.3, 0.08, 0.5, (0, 0.45, 0), e=0.3, n=20), "junkbot", root, 0.016, 400, remesh=False)
    chassis = fused(root.name + "_chassis", soft(0.42, 0.2, 0.6, (0, 0.34, 0), e=0.2, n=24), "junkbot", root, 0.02, 900, remesh=False,
                    cuts=[(box(0.008, 0.12, 0.012, (x, 0.34, 0.3)), "dark") for x in (-0.1, 0.1)] + [(ell(0.011, 0.011, 0.011, (sx * 0.2, 0.34 + dy, dz), n=8), "dark") for sx in (-1, 1) for dy in (-0.05, 0.05) for dz in (-0.2, 0.0, 0.2)])
    F.main(chassis, faces=("z", "-z"), crystals=1, mud=1, low=0.3)
    for sx in (-1, 1):
        name = f"{root.name}_tread{'L' if sx < 0 else 'R'}"
        track = fused(name, xf(extrude(stadium(L, R), w, "x"), (sx * tx, R, 0)), "tire", root, 0.016, 900,
                      cuts=[box(w + 0.02, 0.016, 0.026, (sx * tx, 2 * R, z)) for z in [-L / 2 + L * k / 9 for k in range(10)]]
                      + [box(w + 0.02, 0.016, 0.026, (sx * tx, 0.0, z)) for z in [-L / 2 + L * k / 9 for k in range(10)]], smooth=1)
        fused(name + "_frame", soft(0.03, R * 1.3, L * 0.9, (sx * (tx - w / 2 - 0.012), R, 0), e=0.3), "junkbot", root, 0.012, 250)
        for k, z in enumerate((-L / 2, 0.0, L / 2)):
            wheel = pivot(f"{name}_wheel{k}", (sx * (tx + w / 2 - 0.005), R, z), root, role="wheel", r=R * 0.9)
            fused(f"{name}_hub{k}", cyl(R * 0.62, R * 0.62, 0.03, (0, 0, 0), (0, 0, math.pi / 2), seg=20), "metal", wheel, 0.0, 120,
                  cuts=[ell(0.011, 0.011, 0.011, (sx * 0.016, math.cos(a) * R * 0.32, math.sin(a) * R * 0.32), n=8) for a in [q * 2 * math.pi / 4 for q in range(4)]], remesh=False)
        F.limb(track, (sx, 0.5, 0), at=0.75, plate=False, crystal=0.3, mud=2)
        point(root, f"tread{sx}", (sx * (tx + w / 2), R * 1.4, 0), (sx, 0.3, 0), "side", 0.8)
    socket(root, "hip", (0, hip, 0), jrx=0.16, jrz=0.22)
    return F


def junk_body(root, rng):
    F = Fit(rng)
    # (the cuts are coloured inside, so they read: the hatch's seam, a vent grille under it dark; a dent down to bare steel)
    cuts = [(ring(0.075, 0.009, (0, 0.27, 0.21), (math.pi / 2, 0, 0), seg=40), "dark")]
    cuts += [(box(0.16, 0.012, 0.04, (0.0, 0.1 + 0.024 * k, 0.21)), "dark") for k in range(4)]
    cuts += [(ell(0.07, 0.05, 0.03, (0.18, 0.4, 0.18), n=16), "steel")]
    torso = fused(root.name + "_torso", soft(0.5, 0.48, 0.42, (0, 0.24, 0), e=0.18, n=28), "junkbot", root, 0.02, 1600, cuts=cuts, remesh=False)
    fused(root.name + "_skirt", ell(0.14, 0.08, 0.16, (0, 0.0, 0)), "junkbot", root, 0.0, 300)
    f1 = pivot(f"{root.name}_form1", (0, 0, 0), root, role="form", form=1)                        # (one neck, or two forked from the shoulders)
    f2 = pivot(f"{root.name}_form2", (0, 0, 0), root, role="form", form=2)
    fused(root.name + "_neck", join([cyl(0.07, 0.08, 0.08, (0, 0.5, 0), seg=24), ring(0.08, 0.012, (0, 0.47, 0), seg=24)]), "junkbot", f1, 0.012, 300, remesh=False)
    fused(root.name + "_necks", join([chain([(sx * 0.08, 0.42, 0), (sx * 0.15, 0.5, 0), (sx * 0.16, 0.54, 0)], [0.06, 0.05, 0.045]) for sx in (-1, 1)]), "junkbot", f2, 0.014, 600)
    plain(root.name + "_bolts", join([ell(0.01, 0.01, 0.006, (math.cos(a) * 0.09, 0.27 + math.sin(a) * 0.09, 0.205), n=8) for a in [k * math.pi / 2 + 0.785 for k in range(4)]]), "metal", root, 0.0)
    patches = pivot(f"{root.name}_patches", (0, 0, 0), root, role="mut", mut="!armor")      # (rust patches: under armour plating, gone)
    for k, (c, n, w, h, spin) in enumerate((((0.24, 0.3, 0.05), (1, 0, 0), 0.16, 0.12, 0.2), ((-0.24, 0.16, -0.06), (-1, 0, 0), 0.14, 0.1, -0.3), ((0.0, 0.36, -0.2), (0, 0, -1), 0.18, 0.14, 0.1))):
        H = hit(torso, c, n, 0.5)
        if H:
            plate(patches, f"{root.name}_patch{k}", torso, H[0], H[1], w, h, "rust", "car", spin=spin, th=0.012)
    fused(root.name + "_stack", join([cyl(0.035, 0.04, 0.26, (0.14, 0.42, -0.2)), ring(0.042, 0.01, (0.14, 0.54, -0.2), seg=16)]), "dark", root, 0.01, 260,
          cuts=[cyl(0.024, 0.024, 0.08, (0.14, 0.56, -0.2))])
    for sx in (-1, 1):                                                                              # claw arms
        p = pivot(f"{root.name}_arm{'L' if sx < 0 else 'R'}", (sx * 0.26, 0.36, 0), root, role="arm")
        elbow, wrist = (sx * 0.05, -0.15, 0.04), (sx * 0.05, -0.27, 0.1)
        arm = fused(p.name + "_arm", join([ell(0.06, 0.06, 0.06, (0, 0, 0)), chain([(0, 0, 0), elbow, wrist], [0.032, 0.03, 0.026], seg=10), ell(0.04, 0.04, 0.04, elbow)]), "steel", p, 0.014, 500)
        w = Vector(wrist)
        fused(p.name + "_claw", join([chain([tuple(w), tuple(w + Vector((sx * 0.03, -0.06, 0.03))), tuple(w + Vector((0, -0.11, 0.05)))], [0.016, 0.013, 0.006], seg=8),
                                      chain([tuple(w), tuple(w + Vector((-sx * 0.03, -0.06, 0.03))), tuple(w + Vector((0, -0.11, 0.05)))], [0.016, 0.013, 0.006], seg=8)]), "dark", p, 0.008, 300)
        F.limb(arm, (sx, 0.5, 0), at=0.9, crystal=0.3, size=0.7)
    F.main(torso, faces=("x", "-x", "y", "-z"), crystals=3, mud=1, low=0.8)
    socket(root, "neck", (0, 0.54, 0), jrx=0.07, jrz=0.07)
    for sx in (-1, 1):
        socket(root, f"neck{'L' if sx < 0 else 'R'}", (sx * 0.16, 0.54, 0), lean=-sx * 0.3, jrx=0.05, jrz=0.05)
    mount(root, "spark", torso, (-0.1, 0.4, -0.05), (-0.3, 1, -0.3))                                # (a tesla coil on the shoulder)
    mount(root, "turbo", torso, (0, 0.2, 0.0), (0, 0.15, -1))                                       # (an engine on the back)
    for sx in (-1, 1):
        point(root, f"flank{sx}", (sx * 0.25, 0.24, 0.0), (sx, 0.1, 0), "side", 0.9)
    root["jrx"], root["jrz"] = 0.14, 0.16
    return F


def junk_head(root, rng):
    F = Fit(rng)
    crt = fused(root.name + "_crt", soft(0.34, 0.27, 0.26, (0, 0.17, 0.0), e=0.22, n=28), "junkbot", root, 0.018, 1100, remesh=False,
                cuts=[(soft(0.27, 0.2, 0.06, (0, 0.17, 0.14), e=0.25, n=24), "dark")])             # (the screen's well, dark round the glass)
    fused(root.name + "_tube", soft(0.24, 0.2, 0.14, (0, 0.17, -0.14), e=0.3, n=20), "junkbot", root, 0.014, 500, remesh=False,
          cuts=[(box(0.008, 0.06, 0.02, (0.07 + 0.016 * k, 0.17, -0.21)), "dark") for k in range(4)])   # (the tube's housing, vents in it)
    fused(root.name + "_stalk", cyl(0.05, 0.06, 0.12, (0, -0.01, -0.05), seg=20), "dark", root, 0.01, 200, remesh=False)
    screen = plain(root.name + "_screen", soft(0.25, 0.18, 0.02, (0, 0.17, 0.112), e=0.25), "screen", root, 0.0)
    px = [box(0.026, 0.026, 0.006, (sx * 0.055, 0.2, 0.124)) for sx in (-1, 1)] + [box(0.022, 0.012, 0.006, (x, 0.12 + (0.012 if abs(x) > 0.03 else 0), 0.124)) for x in (-0.044, -0.022, 0.0, 0.022, 0.044)]
    plain(root.name + "_face", join(px), "pixel", root, 0.0, smooth=False)
    fused(root.name + "_bezel", soft(0.3, 0.025, 0.05, (0, 0.04, 0.12), e=0.3), "dark", root, 0.006, 160)
    for sx in (-1, 1):
        plain(f"{root.name}_bolt{sx}", cyl(0.025, 0.025, 0.04, (sx * 0.18, 0.17, 0.0), (0, 0, math.pi / 2), seg=6), "metal", root, 0.006, smooth=False)
    fused(root.name + "_aerial", capsule((-0.1, 0.3, -0.04), (-0.16, 0.48, -0.06), 0.006, seg=6), "chrome", root, 0.004, 80)
    plain(root.name + "_ball", ell(0.016, 0.016, 0.016, (-0.16, 0.49, -0.06), n=10), "red", root, 0.0)
    F.main(crt, faces=("x", "-x", "y"), crystals=1, size=0.55)
    mount(root, "radio", crt, (0.06, 0.2, -0.04), (0, 1, 0))
    mount(root, "lens", screen, (0.055, 0.2, 0.112), (0, 0, 1))                                    # (over its right pixel eye)
    socket(root, "top", (0.04, 0.31, 0.0))
    socket(root, "eye", (0.055, 0.2, 0.13))
    point(root, "side", (-0.17, 0.17, 0), (-1, 0.1, 0), "side", 0.45)
    root["jrx"], root["jrz"] = 0.07, 0.07
    return F


BUILD[("legs", "junkbot", "0")] = junk_legs
BUILD[("body", "junkbot", "0")] = junk_body
BUILD[("head", "junkbot", "0")] = junk_head
