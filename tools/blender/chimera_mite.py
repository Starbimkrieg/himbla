# The chimera kit's mites (exec'd by build_chimera.py after chimera_common.py), three looks of each part:
#   legs   0 a dark thorax on six long legs, 1 a beetle's: stout spiny legs, 2 a strider's: six very long legs with two knees each
#   body   0 a segmented abdomen with glassy wing cases raised in a V, 1 a beetle's domed shell, split down the middle, 2 a wasp's: thorax,
#          waist, a banded sting-tipped gaster, small wings
#   head   0 great compound eyes, jaws and feelers, 1 a rhinoceros beetle's horn, 2 an ant's: long head, big curved mandibles, elbowed feelers


def mite_legs(root, rng, look):
    F = Fit(rng)
    hip = (0.56, 0.47, 0.66)[look]
    if look == 0:
        thorax = fused(root.name + "_thorax", join([ell(0.16, 0.115, 0.22, (0, hip - 0.07, 0))] + [ell(0.05, 0.045, 0.05, (sx * 0.12, hip - 0.1, z)) for sx in (-1, 1) for z in (-0.12, 0.0, 0.12)]), "dark", root, 0.02, 900)
    elif look == 1:
        thorax = fused(root.name + "_thorax", join([ell(0.17, 0.13, 0.21, (0, hip - 0.08, 0)), ring(0.15, 0.025, (0, hip - 0.04, 0), s=(1, 1, 1.3), seg=28)] + [ell(0.055, 0.05, 0.055, (sx * 0.13, hip - 0.11, z)) for sx in (-1, 1) for z in (-0.12, 0.0, 0.12)]),
                       "dark", root, 0.02, 1000, cuts=[ring(0.17, 0.008, (0, hip - 0.1, 0), s=(1, 1, 1.25), seg=28)])
    else:
        thorax = fused(root.name + "_thorax", join([ell(0.13, 0.1, 0.17, (0, hip - 0.06, 0)), ell(0.08, 0.07, 0.09, (0, hip - 0.12, -0.12))] + [ell(0.04, 0.036, 0.04, (sx * 0.1, hip - 0.09, z)) for sx in (-1, 1) for z in (-0.1, 0.0, 0.1)]), "dark", root, 0.02, 800)
    F.main(thorax, faces=("x", "-x"), crystals=2, mud=0)
    for sx in (-1, 1):
        for k in (-1, 0, 1):
            base = (sx * (0.12, 0.13, 0.1)[look], hip - (0.1, 0.11, 0.09)[look], k * (0.12, 0.12, 0.1)[look])
            p = pivot(f"{root.name}_leg{'L' if sx < 0 else 'R'}{k + 1}", base, root, role="leg")
            y0 = -base[1]
            if look == 0:
                pts, rad = [(0, 0, 0), (sx * 0.26, 0.18, k * 0.06), (sx * 0.36, y0 + 0.025, k * 0.14)], [0.034, 0.03, 0.016]
            elif look == 1:
                pts, rad = [(0, 0, 0), (sx * 0.22, 0.12, k * 0.07), (sx * 0.3, y0 + 0.025, k * 0.16)], [0.042, 0.036, 0.022]
            else:
                pts, rad = [(0, 0, 0), (sx * 0.22, 0.16, k * 0.08), (sx * 0.42, 0.0, k * 0.2), (sx * 0.5, y0 + 0.02, k * 0.27)], [0.026, 0.022, 0.016, 0.01]
            geo = [chain(pts, rad, seg=10)] + [ell(rad[i] * 1.2, rad[i] * 1.1, rad[i] * 1.1, pts[i], n=10) for i in range(1, len(pts) - 1)]
            if look == 1:                                                                    # spines down the shin
                a, b = Vector(pts[1]), Vector(pts[2])
                for t in (0.3, 0.55, 0.8):
                    q = a.lerp(b, t)
                    geo.append(along(lathe([(0.011, 0), (0, 0.04)], 6), (sx * 0.8, 0.5, 0), tuple(q)))
            seg = fused(p.name + "_seg", join(geo), "mite", p, 0.012, (280, 320, 340)[look])
            foot = pts[-1]
            fused(p.name + "_claw", join([ell(0.022, 0.018, 0.022, foot), xf(lathe([(0.014, 0), (0, -0.035)], 8), foot)]), "dark", p, 0.006, 70)
            F.limb(seg, (sx, 0.3, 0), at=0.75, plate=False, crystal=0.15, mud=1 if k == 0 else 0)
    point(root, "flankL", (-0.15, hip - 0.07, 0), (-1, 0.3, 0), "side", 0.7)
    point(root, "flankR", (0.15, hip - 0.07, 0), (1, 0.3, 0), "side", 0.7)
    socket(root, "hip", (0, hip, 0), jrx=0.12, jrz=0.15)
    return F


def mite_body(root, rng, look):
    F = Fit(rng)
    skirt = ell(0.11, 0.08, 0.12, (0, 0.0, 0.0))
    if look == 0:
        common = [ell(0.255, 0.22, 0.4, (0, 0.2, -0.26)), ell(0.17, 0.15, 0.2, (0, 0.17, 0.12)), skirt]
        cuts = [xf(torus(1, 0.06, 28, 8), (0, 0.2, -0.26 + dz), (math.pi / 2, 0, 0), (0.255 * f + 0.004, 1, 0.22 * f + 0.004)) for dz, f in ((-0.2, 0.86), (0.0, 1.0), (0.2, 0.86))]
        neck, spark, tail = (0, 0.26, 0.3), (0, 0.42, -0.3), (0, 0.2, -0.66)
    elif look == 1:                                                                              # a beetle: two domed wing cases meeting down the back
        common = [ell(0.15, 0.17, 0.36, (sx * 0.115, 0.2, -0.24)) for sx in (-1, 1)] + [ell(0.17, 0.13, 0.15, (0, 0.17, 0.11)), skirt]
        cuts = [box(0.008, 0.08, 0.66, (0, 0.37, -0.25))] + [ell(0.012, 0.012, 0.012, (sx * (0.1 + 0.05 * (j % 2)), 0.36 - 0.02 * (j % 2), -0.42 + 0.09 * j)) for sx in (-1, 1) for j in range(6)] \
            + [xf(torus(1, 0.012, 28, 6), (0, 0.18, 0.02), (math.pi / 2 - 0.3, 0, 0), (0.18, 1, 0.15))]          # (the seam, rows of pits, the pronotum's edge)
        neck, spark, tail = (0, 0.24, 0.26), (0, 0.37, -0.32), (0, 0.18, -0.6)
    else:                                                                                        # a wasp: thorax, a narrow waist, a banded gaster
        common = [ell(0.15, 0.14, 0.16, (0, 0.17, 0.08)), capsule((0, 0.15, -0.04), (0, 0.18, -0.18), 0.055, 0.045), ell(0.19, 0.17, 0.29, (0, 0.22, -0.43)), skirt]
        cuts = []
        neck, spark, tail = (0, 0.24, 0.22), (0, 0.38, -0.4), (0, 0.22, -0.73)
    forks = [chain([(sx * 0.04, 0.18, neck[2] - 0.16), (sx * 0.11, 0.24, neck[2] - 0.05), (sx * 0.15, neck[1] + 0.01, neck[2] - 0.02)], [0.09, 0.07, 0.06]) for sx in (-1, 1)]
    body = forms(root, root.name + "_body", common, [], forks, "mite", 0.02, 2400, cuts)
    if look == 0:
        for sx in (-1, 1):                                                                          # wing cases, raised in a V, clear of the abdomen
            plain(f"{root.name}_wing{sx}", ell_between((sx * 0.06, 0.3, 0.14), (sx * 0.3, 0.62, -0.48), 0.1, 0.012, roll=sx * 0.35, n=14), "glass", root, 0.008)
    elif look == 2:
        fused(root.name + "_bands", join([xf(torus(1, 0.022, 28, 6), (0, 0.22, -0.43 + dz), (math.pi / 2, 0, 0), (0.19 * f + 0.008, 1, 0.17 * f + 0.008)) for dz, f in ((-0.14, 0.88), (0.0, 1.0), (0.14, 0.86))]), "dark", root, 0.01, 700)
        plain(root.name + "_sting", along(lathe([(0.025, 0), (0, 0.09)], 8), (0, -0.1, -1), (0, 0.21, -0.68)), "dark", root, 0.006)
        for sx in (-1, 1):
            for big, (a, b) in ((1, ((sx * 0.05, 0.28, 0.1), (sx * 0.32, 0.4, -0.2))), (0, ((sx * 0.05, 0.27, 0.04), (sx * 0.24, 0.33, -0.22)))):
                plain(f"{root.name}_wing{sx}{big}", ell_between(a, b, 0.07 if big else 0.05, 0.008, roll=sx * 0.2, n=12), "glass", root, 0.006)
    F.main(body, faces=("x", "-x", "y"), crystals=3, mud=1, low=0.5)
    socket(root, "neck", neck, jrx=0.07, jrz=0.07)
    for sx in (-1, 1):
        socket(root, f"neck{'L' if sx < 0 else 'R'}", (sx * 0.15, neck[1] + 0.01, neck[2] - 0.02), lean=-sx * 0.38, jrx=0.055, jrz=0.055)
    mount(root, "spark", body, spark, (0, 1, -0.1))                                                 # (a bioelectric sac on the back)
    mount(root, "turbo", body, tail, (0, 0.15, -1))                                                  # (jet vents at the tail)
    for sx in (-1, 1):
        point(root, f"flank{sx}", (sx * 0.22, 0.22, -0.28), (sx, 0.35, 0), "side", 1.0)
    root["jrx"], root["jrz"] = 0.11, 0.12
    return F


def mite_head(root, rng, look):
    F = Fit(rng)
    stub = cyl(0.06, 0.07, 0.1, (0, -0.02, 0.0))
    if look == 0:
        head = fused(root.name + "_head", join([ell(0.145, 0.12, 0.136, (0, 0.11, 0.04)), ell(0.08, 0.06, 0.07, (0, 0.06, 0.14)), stub]), "mite", root, 0.02, 1000,
                     cuts=[ell(0.07, 0.078, 0.066, (sx * 0.09, 0.145, 0.12), n=16) for sx in (-1, 1)])
        eyes = [ell(0.064, 0.072, 0.06, (sx * 0.09, 0.145, 0.11), n=14) for sx in (-1, 1)]
        for sx in (-1, 1):
            fused(f"{root.name}_jaw{sx}", chain([(sx * 0.05, 0.05, 0.16), (sx * 0.06, 0.03, 0.22), (sx * 0.02, 0.02, 0.27)], [0.02, 0.016, 0.008]), "dark", root, 0.008, 120)
        feelers = [[(sx * 0.04, 0.2, 0.09), (sx * 0.1, 0.34, 0.14), (sx * 0.17, 0.39, 0.22)] for sx in (-1, 1)]
        top, eye = (0, 0.23, 0.03), (0.09, 0.145, 0.18)
    elif look == 1:                                                                              # a rhinoceros beetle: small eyes, a great horn
        head = fused(root.name + "_head", join([ell(0.12, 0.1, 0.12, (0, 0.1, 0.05)), ell(0.07, 0.05, 0.06, (0, 0.07, 0.15)), stub]), "mite", root, 0.02, 900,
                     cuts=[ell(0.035, 0.035, 0.035, (sx * 0.09, 0.12, 0.11), n=12) for sx in (-1, 1)])
        eyes = [ell(0.031, 0.031, 0.031, (sx * 0.088, 0.12, 0.105), n=12) for sx in (-1, 1)]
        fused(root.name + "_horn", chain([(0, 0.12, 0.13), (0, 0.2, 0.21), (0, 0.31, 0.24), (0, 0.39, 0.2)], [0.04, 0.03, 0.02, 0.008]), "dark", root, 0.012, 400)
        feelers = [[(sx * 0.06, 0.13, 0.15), (sx * 0.12, 0.2, 0.2), (sx * 0.15, 0.22, 0.24)] for sx in (-1, 1)]
        top, eye = (0, 0.2, -0.02), (0.088, 0.12, 0.14)
    else:                                                                                        # an ant: a long head, big curved mandibles
        head = fused(root.name + "_head", join([ell(0.11, 0.12, 0.15, (0, 0.12, 0.07)), stub]), "mite", root, 0.02, 1000,
                     cuts=[ell(0.04, 0.05, 0.05, (sx * 0.105, 0.15, 0.07), n=12) for sx in (-1, 1)])
        eyes = [ell(0.034, 0.045, 0.045, (sx * 0.1, 0.15, 0.07), n=12) for sx in (-1, 1)]
        for sx in (-1, 1):
            fused(f"{root.name}_mandible{sx}", chain([(sx * 0.05, 0.07, 0.19), (sx * 0.09, 0.06, 0.26), (sx * 0.06, 0.05, 0.32), (sx * 0.015, 0.05, 0.33)], [0.025, 0.02, 0.014, 0.006]), "dark", root, 0.008, 220)
        feelers = [[(sx * 0.04, 0.2, 0.16), (sx * 0.09, 0.33, 0.19), (sx * 0.19, 0.36, 0.3)] for sx in (-1, 1)]
        top, eye = (0, 0.24, 0.05), (0.1, 0.15, 0.12)
    plain(root.name + "_eyes", join(eyes), "eye", root, 0.0)
    for sx, feel in zip((-1, 1), feelers):
        fused(f"{root.name}_feeler{sx}", chain(feel, [0.011, 0.009, 0.007]), "dark", root, 0.006, 120)
        plain(f"{root.name}_bulb{sx}", ell(0.025 if look == 0 else 0.018, 0.025 if look == 0 else 0.018, 0.025 if look == 0 else 0.018, feel[-1], n=12), "eye" if look == 0 else "dark", root, 0.0)
    F.main(head, faces=("-x", "-z", "y"), crystals=1, size=0.5)
    mount(root, "radio", head, (0, 0.12, 0.0), (0, 1, -0.3))
    mount(root, "lens", head, (eye[0], eye[1], eye[2] - 0.05), (0.4, 0, 1))
    socket(root, "top", top)
    socket(root, "eye", eye)
    point(root, "side", (-0.13, 0.11, 0.03), (-1, 0.2, 0), "side", 0.45)
    root["jrx"], root["jrz"] = 0.07, 0.07
    return F


for _slot, _fn in (("legs", mite_legs), ("body", mite_body), ("head", mite_head)):
    for _look in range(3):
        BUILD[(_slot, "mite", str(_look))] = (lambda fn, lk: lambda root, rng: fn(root, rng, lk))(_fn, _look)
