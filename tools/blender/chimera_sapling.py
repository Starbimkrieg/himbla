# The chimera kit's saplings (exec'd by build_chimera.py after chimera_common.py), three looks of each part:
#   legs   0 a mossy, sprouting bulb on six gnarled roots, 1 a stump: ridged bark, four thick roots, toadstools and moss, 2 a mandrake's
#          knobbly tuber on six long spidery roots
#   body   0 a leaning, knotted trunk with a hollow and three leafy branches, 1 a conifer: a straight trunk in three tiers of needles, 2 a
#          blossom tree: a twisting trunk, its branches heavy with pink blossom
#   head   0 a daisy (a face on the seed disc, petals round it), 1 a tulip (a cup of petals round a face), 2 a leafy bud with a face, two
#          sepals wrapped round it and a curling tendril
# A body forks for two heads (its trunk splits into two branches, one under each).


def star_cone(r, h, y, n=10, inner=0.72):
    """a cone of needles: its rim a star of n points"""
    verts = [(0, y + h, 0), (0, y, 0)]
    for k in range(n * 2):
        a = math.pi * k / n
        rr = r if k % 2 == 0 else r * inner
        verts.append((math.sin(a) * rr, y + (0.0 if k % 2 == 0 else 0.03), math.cos(a) * rr))
    faces = []
    m = n * 2
    for k in range(m):
        a, b = 2 + k, 2 + (k + 1) % m
        faces.append((0, a, b))
        faces.append((1, b, a))
    return verts, faces


def sapling_legs(root, rng, look):
    F = Fit(rng)
    hip = (0.54, 0.5, 0.58)[look]
    roots_n = (6, 4, 6)[look]
    if look == 0:
        bulb = fused(root.name + "_bulb", join([ell(0.17, 0.15, 0.17, (0, hip - 0.1, 0))] + [ell(rng.uniform(0.07, 0.11), rng.uniform(0.06, 0.09), rng.uniform(0.07, 0.11), (rng.uniform(-0.08, 0.08), hip - 0.12 + rng.uniform(-0.04, 0.03), rng.uniform(-0.08, 0.08))) for _ in range(4)]),
                     "sapling", root, 0.02, 800)
    elif look == 1:                                                                              # a stump, ridged, its top sawn level
        prof = [(0, 0.12), (0.2, 0.12), (0.19, 0.18), (0.165, 0.26), (0.155, hip - 0.08), (0.16, hip - 0.04), (0, hip - 0.04)]
        bulb = fused(root.name + "_stump", lathe(prof, 24), "sapling", root, 0.02, 900,
                     cuts=[xf(box(0.012, hip - 0.16, 0.04, (0, 0, 0.17)), (0, (hip + 0.08) / 2, 0), (0, a, 0)) for a in [k * math.pi / 5 + rng.uniform(-0.1, 0.1) for k in range(10)]])
        for k, (a, s) in enumerate(((0.6, 1.0), (1.3, 0.75), (0.95, 0.55))):                      # toadstools on its side
            b = Vector((math.cos(a) * 0.17, 0.2 + 0.06 * k, math.sin(a) * 0.17))
            fused(f"{root.name}_stem{k}", capsule(tuple(b - Vector((math.cos(a), 0, math.sin(a))) * 0.04), tuple(b + Vector((math.cos(a) * 0.03, 0.06 * s, math.sin(a) * 0.03))), 0.016 * s), "stem", root, 0.006, 120)
            c = b + Vector((math.cos(a) * 0.03, 0.07 * s, math.sin(a) * 0.03))
            fused(f"{root.name}_cap{k}", ell(0.05 * s, 0.03 * s, 0.05 * s, tuple(c)), "cap", root, 0.008, 200)
            plain(f"{root.name}_spots{k}", join([ell(0.008 * s, 0.006 * s, 0.008 * s, tuple(c + Vector((math.cos(q) * 0.03 * s, 0.018 * s, math.sin(q) * 0.03 * s))), n=6) for q in (0.3, 2.4, 4.4)]), "cream", root, 0.0)
    else:                                                                                        # a mandrake's knobbly tuber
        bulb = fused(root.name + "_tuber", join([ell(0.15, 0.13, 0.15, (0, hip - 0.08, 0)), ell(0.08, 0.1, 0.08, (0, hip - 0.2, 0))] + [ell(0.04, 0.035, 0.04, (math.cos(a) * 0.13, hip - 0.07 + rng.uniform(-0.04, 0.04), math.sin(a) * 0.13)) for a in [rng.uniform(0, 6.28) for _ in range(6)]]),
                     "sapling", root, 0.02, 800)
    if look in (0, 2):
        moss = [ell(rng.uniform(0.045, 0.07), 0.028, rng.uniform(0.045, 0.07), (math.cos(a) * 0.11, hip - 0.025 + rng.uniform(-0.02, 0.02), math.sin(a) * 0.11)) for a in [rng.uniform(0, 6.28) for _ in range(5)]]
    else:
        moss = [ell(rng.uniform(0.05, 0.08), 0.03, rng.uniform(0.05, 0.08), (math.cos(a) * 0.12, hip - 0.04, math.sin(a) * 0.12)) for a in [rng.uniform(0, 6.28) for _ in range(4)]]
    fused(root.name + "_moss", join(moss), "moss", root, 0.008, 300)
    if look != 1:
        sprouts = []
        for i in range(6):
            a = 2 * math.pi * i / 6 + rng.uniform(-0.3, 0.3)
            b = (math.cos(a) * 0.1, hip - 0.04, math.sin(a) * 0.1)
            sprouts.append(ell_between(b, (math.cos(a) * 0.23, hip + 0.09 + rng.uniform(0, 0.06), math.sin(a) * 0.23), 0.04, 0.008, roll=rng.uniform(-0.4, 0.4), n=8))
        plain(root.name + "_sprouts", join(sprouts), "leaf", root, 0.006)
    F.main(bulb, faces=("x", "-x", "z", "-z"), crystals=2, mud=2, low=0.2)
    for i in range(roots_n):
        a = 2 * math.pi * i / roots_n + rng.uniform(-0.35, 0.35) + (math.pi / 4 if look == 1 else 0)
        c, s = math.cos(a), math.sin(a)
        start = (c * 0.07, hip - 0.14, s * 0.07) if look != 1 else (c * 0.13, 0.2, s * 0.13)
        p = pivot(f"{root.name}_root{i}", start, root, role="leg")
        y0 = -start[1]
        path = [(0, 0, 0)]
        if look == 2:                                                                          # long spidery roots, arched high
            reach = rng.uniform(0.36, 0.44)
            for f, lift in ((0.35, 0.12), (0.7, 0.0), (1.0, None)):
                w = rng.uniform(-0.03, 0.03)
                path.append((c * reach * f - s * w, y0 + 0.012 if lift is None else lift + rng.uniform(-0.02, 0.02), s * reach * f + c * w))
            radii = [0.034, 0.026, 0.018, 0.009]
        else:
            reach = rng.uniform(0.27, 0.4) if look == 0 else rng.uniform(0.2, 0.26)
            for f in (0.3, 0.55, 0.8, 1.0):
                d = reach * f
                w = rng.uniform(-0.05, 0.05)
                path.append((c * d - s * w, y0 * (0.35 + 0.65 * f ** 1.5) + (0.03 if f < 1 else 0.012) + rng.uniform(0, 0.03) * (1 - f), s * d + c * w))
            radii = [0.06, 0.047 * rng.uniform(0.85, 1.15), 0.038 * rng.uniform(0.85, 1.2), 0.026, 0.013] if look == 0 else [0.085, 0.07, 0.055, 0.04, 0.022]
        geo = [chain(path, radii)]
        if look == 0:
            mid = Vector(path[2])
            side = Vector((c, 0, s)).cross(Vector((0, 1, 0))) * rng.choice((-1, 1))
            geo.append(chain([tuple(mid), tuple(mid + side * 0.08 + Vector((0, -0.05, 0))), tuple(mid + side * 0.12 + Vector((0, y0 - mid.y + 0.01, 0)))], [0.02, 0.014, 0.008]))
            if rng.random() < 0.7:
                geo.append(ell(0.032, 0.026, 0.032, path[1], n=10))
        r = fused(p.name + "_r", join(geo), "bark", p, 0.014, (350, 420, 300)[look])
        F.limb(r, (c, 0.4, s), at=0.6, plate=look == 1, crystal=0.2, mud=1 if i % 2 == 0 else 0)
    point(root, "front", (0, hip - 0.1, 0.16), (0, 0.3, 1), "side", 0.7)
    socket(root, "hip", (0, hip, 0), jrx=0.13, jrz=0.13)
    return F


def sapling_body(root, rng, look):
    F = Fit(rng)
    h = (0.65, 0.7, 0.66)[look]
    lean = rng.uniform(-0.05, 0.05) if look != 1 else 0.0
    bend = lambda g, k=1.0: ([(v[0] + lean * v[1] + (0.04 * math.sin(v[1] * 9) * k if look == 2 else 0), v[1], v[2]) for v in g[0]], g[1])
    prof = [(0, -0.07), (0.15, -0.07), (0.16, 0.0), (0.155, 0.05)]
    taper = (0.06, 0.08, 0.05)[look]
    for f in (0.2, 0.38, 0.55, 0.72, 0.88, 1.0):
        prof.append(((0.14 - taper * f) * (rng.uniform(0.9, 1.1) if look != 1 else 1), h * f))
    prof.append((0, h + 0.02))
    trunk = bend(lathe(prof, 22))
    short = bend(lathe([q for q in prof if q[1] < h * 0.8] + [(0, h * 0.84)], 22))
    forks = [chain([(lean * h * 0.6, h * 0.62, 0), (sx * 0.08 + lean * h, h * 0.86, 0.0), (sx * 0.15 + lean * h, h + 0.03, 0.0)], [0.075, 0.06, 0.048]) for sx in (-1, 1)]
    geo, tips = [], []
    if look != 1:
        for k, sx in enumerate((-1, 1, rng.choice((-1, 1)))):
            hy = h * (0.55 + 0.15 * k + rng.uniform(-0.05, 0.05))
            tip = (sx * rng.uniform(0.24, 0.32) + lean * hy, hy + rng.uniform(0.12, 0.2), rng.uniform(-0.08, 0.08))
            base = (sx * 0.04 + lean * hy * 0.8, hy - 0.12, 0)
            if look == 2:                                                                          # twisting, with a crook in each branch
                geo.append(chain([base, ((base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 + 0.05, tip[2] / 2 + 0.05), ((base[0] + tip[0]) / 2 + sx * 0.06, (base[1] + tip[1]) / 2 + 0.06, tip[2] / 2 - 0.03), tip], [0.038, 0.03, 0.025, 0.018]))
            else:
                geo.append(chain([base, ((base[0] + tip[0]) / 2 + sx * 0.03, (base[1] + tip[1]) / 2, tip[2] / 2), tip], [0.035, 0.028, 0.02]))
            tips.append(tip)
        for y in (h * 0.3, h * 0.62):
            geo.append(ell(0.035, 0.04, 0.03, (rng.uniform(-0.05, 0.05) + lean * y, y, 0.1), n=12))
    hollow = ell(0.035, 0.05, 0.04, (lean * h * 0.45, h * 0.45, 0.12), n=14)
    furrows = [box(0.004, rng.uniform(0.08, 0.14), 0.03, (math.sin(a) * 0.13 + lean * 0.3, h * rng.uniform(0.15, 0.7), math.cos(a) * 0.13), (0, a, 0)) for a in [rng.uniform(0, 6.28) for _ in range(6)]]
    cuts = ([hollow] if look == 0 else []) + furrows
    tree = forms(root, root.name + "_trunk", geo, [trunk], [short] + forks, "sapling", 0.02, 1800, cuts=cuts)
    if look == 0:
        plain(root.name + "_hollow", ell(0.028, 0.042, 0.01, (lean * h * 0.45, h * 0.45, 0.095), n=12), "dark", root, 0.0)
        for k, tip in enumerate(tips):
            fused(f"{root.name}_leaves{k}", join([ell(rng.uniform(0.05, 0.08), rng.uniform(0.04, 0.06), rng.uniform(0.05, 0.08), (tip[0] + rng.uniform(-0.08, 0.08), tip[1] + rng.uniform(-0.02, 0.08), tip[2] + rng.uniform(-0.07, 0.07)), n=12) for _ in range(7)]), "leaf", root, 0.012, 400)
    elif look == 1:                                                                                # three tiers of needles; a small top tier on each fork
        f1, f2 = tree.parent, bpy.data.objects[f"{root.name}_form2"]
        tiers = [star_cone(r, ht, y) for r, ht, y in ((0.3, 0.22, h * 0.2), (0.25, 0.2, h * 0.42))]
        fused(root.name + "_needles", join(tiers), "pine", root, 0.014, 900)
        fused(root.name + "_crown", star_cone(0.18, 0.2, h * 0.64), "pine", f1, 0.012, 300)
        fused(root.name + "_crowns", join([xf(star_cone(0.1, 0.12, 0), (sx * 0.12, h * 0.8, 0), (0, 0, -sx * 0.45)) for sx in (-1, 1)]), "pine", f2, 0.012, 400)
    else:
        for k, tip in enumerate(tips):
            fused(f"{root.name}_blossom{k}", join([ell(r, r * 0.85, r, (tip[0] + rng.uniform(-0.08, 0.08), tip[1] + rng.uniform(-0.02, 0.08), tip[2] + rng.uniform(-0.07, 0.07)), n=12) for r in [rng.uniform(0.04, 0.065) for _ in range(8)]]), "blossom", root, 0.012, 450)
    F.main(tree, faces=("x", "-x", "-z"), crystals=3, mud=1, low=0.8, size=0.85)
    socket(root, "neck", (lean * h, h + 0.02, 0), jrx=0.05, jrz=0.05)
    for sx in (-1, 1):
        socket(root, f"neck{'L' if sx < 0 else 'R'}", (sx * 0.15 + lean * h, h + 0.02, 0), lean=-sx * 0.45, jrx=0.045, jrz=0.045)
    mount(root, "spark", tree, (lean * h * 0.7, h * 0.7, 0), (0, 0.4, -1))                          # (glowing seed pods, hanging behind)
    mount(root, "turbo", tree, (lean * h * 0.4, h * 0.35, 0), (0, 0.05, -1))                       # (a smouldering hollow log on the back)
    for sx in (-1, 1):
        point(root, f"flank{sx}", (sx * 0.13 + lean * 0.2, h * 0.3, 0), (sx, 0.1, 0.1), "side", 0.8)
    root["jrx"], root["jrz"] = 0.15, 0.15
    return F


def sapling_head(root, rng, look):
    F = Fit(rng)
    leaves = [ell(0.085, 0.022, 0.042, (sx * 0.07, 0.06, 0.01), (0, 0, sx * 0.4), n=14) for sx in (-1, 1)]
    fused(root.name + "_stem", join([chain([(0, -0.06, 0), (0, 0.08, 0.01), (0, 0.15, 0.03)], [0.035, 0.03, 0.026])] + leaves), "leaf", root, 0.012, 350)
    if look == 0:
        disc = fused(root.name + "_disc", ell(0.13, 0.13, 0.05, (0, 0.24, 0.045), n=20), "gold", root, 0.008, 800,
                     cuts=[ell(0.009, 0.009, 0.01, (math.cos(a) * rr, 0.24 + math.sin(a) * rr, 0.094), n=8) for rr, n_ in ((0.095, 12), (0.07, 9)) for a in [2 * math.pi * k / n_ for k in range(n_)] if not (abs(math.cos(a) * rr) < 0.06 and 0.0 < math.sin(a) * rr < 0.06)]
                     + [ell(0.019, 0.027, 0.012, (sx * 0.043, 0.26, 0.094), n=12) for sx in (-1, 1)])
        eyes = plain(root.name + "_eyes", join([ell(0.016, 0.023, 0.008, (sx * 0.043, 0.26, 0.086), n=12) for sx in (-1, 1)]), "dark", root, 0.0)
        fused(root.name + "_petals", join([ell(0.085, 0.042, 0.02, (math.cos(a) * 0.165, 0.24 + math.sin(a) * 0.165, 0.025), (0, 0, a), n=14) for a in [2 * math.pi * k / 9 for k in range(9)]]), "petal", root, 0.01, 700)
        face, top, eye = disc, (0, 0.4, 0.03), (0.043, 0.26, 0.11)
    elif look == 1:                                                                              # a tulip: a cup of petals round a face
        disc = fused(root.name + "_pod", ell(0.085, 0.09, 0.07, (0, 0.24, 0.0), n=18), "gold", root, 0.008, 600,
                     cuts=[ell(0.015, 0.022, 0.012, (sx * 0.032, 0.26, 0.068), n=12) for sx in (-1, 1)] + [box(0.03, 0.005, 0.02, (0, 0.215, 0.07))])
        eyes = plain(root.name + "_eyes", join([ell(0.013, 0.019, 0.008, (sx * 0.032, 0.26, 0.061), n=12) for sx in (-1, 1)]), "dark", root, 0.0)
        cup = []
        for k in range(5):
            a = 2 * math.pi * k / 5 + 0.3
            if abs(math.sin(a) - 1) < 0.3:                                                       # (none across the face: it looks out between two)
                continue
            out = Vector((math.cos(a), 0, math.sin(a)))
            cup.append(ell_between(tuple(Vector((0, 0.17, 0)) + out * 0.05), tuple(Vector((0, 0.38, 0)) + out * 0.13), 0.07, 0.016, roll=a, n=14))
        fused(root.name + "_cup", join(cup), "petal", root, 0.01, 800)
        face, top, eye = disc, (0, 0.4, 0.0), (0.032, 0.26, 0.085)
    else:                                                                                        # a leafy bud with a face, sepals wrapped round it
        disc = fused(root.name + "_bud", join([ell(0.11, 0.14, 0.1, (0, 0.27, 0.0)), along(lathe([(0.03, 0), (0, 0.1)], 10), (0, 1, 0.1), (0, 0.39, 0.0))]), "leaf", root, 0.012, 900,
                     cuts=[ell(0.017, 0.024, 0.012, (sx * 0.038, 0.28, 0.097), n=12) for sx in (-1, 1)] + [box(0.035, 0.005, 0.02, (0, 0.235, 0.096))])
        eyes = plain(root.name + "_eyes", join([ell(0.015, 0.021, 0.008, (sx * 0.038, 0.28, 0.09), n=12) for sx in (-1, 1)]), "dark", root, 0.0)
        fused(root.name + "_sepals", join([ell_between((sx * 0.06, 0.17, -0.02), (sx * 0.1, 0.36, -0.06), 0.06, 0.014, roll=sx * 0.8, n=14) for sx in (-1, 1)]
                                          + [chain([(0, 0.48, 0.0), (0.04, 0.54, 0.0), (0.07, 0.52, 0.0), (0.06, 0.48, 0.0)], [0.008, 0.007, 0.006, 0.005], seg=8)]), "pine", root, 0.01, 600)
        face, top, eye = disc, (0, 0.5, 0.0), (0.038, 0.28, 0.11)
    F.main(face, faces=("-z",), crystals=1, size=0.5)
    mount(root, "radio", face, (0, 0.24, -0.02), (0, 0.6, -1))
    mount(root, "lens", eyes, (eye[0], eye[1], eye[2] - 0.03), (0.2, 0, 1))                       # (a glass bud over the right eye)
    socket(root, "top", top)
    socket(root, "eye", eye)
    point(root, "side", (-0.1, 0.24, 0), (-1, 0.1, 0), "side", 0.45)
    root["jrx"], root["jrz"] = 0.07, 0.07
    return F


for _slot, _fn in (("legs", sapling_legs), ("body", sapling_body), ("head", sapling_head)):
    for _look in range(3):
        BUILD[(_slot, "sapling", str(_look))] = (lambda fn, lk: lambda root, rng: fn(root, rng, lk))(_fn, _look)
