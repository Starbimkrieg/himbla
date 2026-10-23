# The chimera kit's cars (exec'd by build_chimera.py after chimera_common.py), three looks of each part:
#   legs   0 a coupe's lower half (one hull over four wheels, the arches cut in), 1 an off-roader's: lifted, knobbly tyres, a bull bar with
#          spot lamps, a skid plate, 2 a racer's: low and wide, slim tyres, side skirts, a splitter and diffuser fins
#   body   0 a coupe (a raked glass cabin between pillars under a roof), 1 a van (a tall box cab, a strip of side windows, a roof rack),
#          2 a roadster (an open cockpit with a seat, a little windscreen, a roll hoop, a rear wing)
#   head   0 a box face (headlamp eyes, a grille mouth, a siren), 1 a bug face (round lamps in chrome rings on the wings), 2 a wedge with one
#          lamp bar across it and raked vents


def wheel(root, name, pos, r, tw, tread="blocks", hub="metal"):
    p = pivot(name, pos, root, role="wheel", r=r)
    prof = [(r * 0.55, -tw), (r * 0.9, -tw), (r, -tw * 0.6), (r, tw * 0.6), (r * 0.9, tw), (r * 0.55, tw), (r * 0.55, -tw)]
    if tread == "blocks":
        cuts = [xf(box(tw * 0.95, 0.014, 0.024, ((k % 2 - 0.5) * tw * 0.9, r, 0)), r=(k * math.pi / 12, 0, 0)) for k in range(24)]
    elif tread == "knobby":
        cuts = [xf(box(tw * 0.7, 0.03, 0.03, ((k % 2 - 0.5) * tw * 1.1, r, 0)), r=(k * math.pi / 10, 0, 0)) for k in range(20)]
    else:
        cuts = []                                                                                 # (a slick)
    fused(name + "_tire", xf(lathe(prof, 36), r=(0, 0, math.pi / 2)), "tire", p, 0.016, 420, cuts=cuts, remesh=False)
    sx = 1 if pos[0] > 0 else -1
    fused(name + "_hub", xf(lathe([(0, -tw * 0.9), (r * 0.58, -tw * 0.9), (r * 0.6, tw * 0.6), (r * 0.5, tw), (0, tw * 1.05)], 24), r=(0, 0, math.pi / 2)), hub, p, 0.0, 160,
          cuts=[ell(0.012, 0.012, 0.012, (sx * tw * 1.0, math.cos(a) * r * 0.3, math.sin(a) * r * 0.3), n=8) for a in [k * 2 * math.pi / 5 for k in range(5)]], remesh=False)
    return p


def car_legs(root, rng, look):
    F = Fit(rng)
    if look == 0:
        r, tw, tx, tz, yc, hw, hh, hl, e = 0.16, 0.065, 0.34, 0.34, 0.26, 0.8, 0.3, 1.04, 0.24
    elif look == 1:
        r, tw, tx, tz, yc, hw, hh, hl, e = 0.19, 0.08, 0.36, 0.34, 0.36, 0.82, 0.28, 1.0, 0.22
    else:
        r, tw, tx, tz, yc, hw, hh, hl, e = 0.135, 0.07, 0.38, 0.36, 0.2, 0.88, 0.2, 1.06, 0.18
    top = yc + 0.03 + hh / 2 - 0.01
    zf = hl / 2
    arches = [cyl(r + 0.028, r + 0.028, 0.3, (sx * tx, r, z), (0, 0, math.pi / 2), seg=32) for sx in (-1, 1) for z in (-tz, tz)]
    geo = [soft(hw, hh, hl, (0, yc + 0.03, 0), e=e)]
    cuts = list(arches)
    if look == 2:
        geo += [soft(0.07, 0.07, 0.62, (sx * (hw / 2 - 0.01), yc - 0.02, 0), e=0.3) for sx in (-1, 1)]                                  # (side skirts)
        cuts += [box(0.03, 0.03, 0.05, (sx * hw / 2, yc - 0.02, z)) for sx in (-1, 1) for z in (-0.12, 0.0, 0.12)]                       # (their vents)
        lamp = [box(0.16, 0.022, 0.03, (sx * 0.26, yc + 0.04, zf)) for sx in (-1, 1)]
        cuts += lamp
    else:
        lamp = [ell(0.05, 0.034, 0.03, (sx * 0.25, yc + 0.03, zf), n=14) for sx in (-1, 1)]
        cuts += lamp
    cuts += [box(0.1, 0.03, 0.02, (sx * 0.25, yc + 0.03, -zf)) for sx in (-1, 1)]                                                         # (tail lamp recesses)
    cuts += [box(0.02, 0.006, hl * 0.35, (sx * hw / 2, yc + 0.06, 0.0)) for sx in (-1, 1)]                                               # (a swage line down each side)
    cuts += [box(0.5, 0.014, 0.005, (0, top + 0.005, z)) for z in (-0.24, 0.24)]                                                         # (seams across the deck)
    hull = fused(root.name + "_hull", join(geo), "car", root, 0.02, 1300, cuts=cuts)
    if look == 2:
        plain(root.name + "_lamps", join([box(0.15, 0.016, 0.01, (sx * 0.26, yc + 0.04, zf - 0.012)) for sx in (-1, 1)]), "lamp", root, 0.0)
        fused(root.name + "_splitter", join([soft(hw * 0.95, 0.025, 0.12, (0, yc - 0.08, zf - 0.02), e=0.3)] + [box(0.012, 0.06, 0.12, (x, yc - 0.06, -zf + 0.02)) for x in (-0.2, -0.07, 0.07, 0.2)]), "dark", root, 0.008, 300)
    else:
        plain(root.name + "_lamps", join([ell(0.044, 0.03, 0.02, (sx * 0.25, yc + 0.03, zf - 0.015), n=14) for sx in (-1, 1)]), "lamp", root, 0.0)
        fused(root.name + "_bumpers", join([soft(hw + 0.04, 0.055, 0.07, (0, yc - 0.09, (zf + 0.01) * s), e=0.3) for s in (-1, 1)]), "chrome", root, 0.012, 300)
    plain(root.name + "_tails", join([box(0.09, 0.024, 0.01, (sx * 0.25, yc + 0.03, -zf - 0.001)) for sx in (-1, 1)]), "red", root, 0.0)
    if look == 1:                                                                                    # a bull bar with two spot lamps; a skid plate
        bar = [chain([(-0.3, yc - 0.06, zf + 0.07), (-0.3, yc + 0.12, zf + 0.07), (0.3, yc + 0.12, zf + 0.07), (0.3, yc - 0.06, zf + 0.07)], [0.016] * 4, seg=8),
               capsule((-0.3, yc + 0.02, zf + 0.07), (0.3, yc + 0.02, zf + 0.07), 0.014, seg=8)] + [capsule((sx * 0.3, yc + 0.05, zf + 0.07), (sx * 0.3, yc + 0.05, zf - 0.02), 0.012, seg=8) for sx in (-1, 1)]
        fused(root.name + "_bullbar", join(bar), "chrome", root, 0.008, 500)
        fused(root.name + "_spots", join([cyl(0.04, 0.035, 0.05, (sx * 0.16, yc + 0.17, zf + 0.07), (math.pi / 2, 0, 0)) for sx in (-1, 1)]), "dark", root, 0.008, 200,
              cuts=[cyl(0.03, 0.03, 0.03, (sx * 0.16, yc + 0.17, zf + 0.1), (math.pi / 2, 0, 0)) for sx in (-1, 1)])
        plain(root.name + "_spotglass", join([cyl(0.03, 0.03, 0.01, (sx * 0.16, yc + 0.17, zf + 0.085), (math.pi / 2, 0, 0)) for sx in (-1, 1)]), "lamp", root, 0.0)
        fused(root.name + "_skid", soft(0.5, 0.03, 0.4, (0, yc - 0.13, zf - 0.22), (0.15, 0, 0), e=0.3), "steel", root, 0.008, 200)
    for sx in (-1, 1):
        for z in (-tz, tz):
            wheel(root, f"{root.name}_wheel{'L' if sx < 0 else 'R'}{'F' if z > 0 else 'B'}", (sx * tx, r, z), r, tw, ("blocks", "knobby", "slick")[look], "metal" if look != 2 else "chrome")
    F.main(hull, faces=("x", "-x", "z", "-z"), crystals=3, mud=3, low=0.3)
    point(root, "sideL", (-hw / 2, yc, 0), (-1, 0.15, 0), "side", 0.9)
    point(root, "sideR", (hw / 2, yc, 0), (1, 0.15, 0), "side", 0.9)
    socket(root, "hip", (0, top, 0), jrx=0.2, jrz=0.24)
    return F


def car_body(root, rng, look):
    F = Fit(rng)
    skirt = ell(0.13, 0.08, 0.15, (0, -0.0, 0.0))
    fin = extrude([(-0.46, 0.15), (-0.3, 0.2), (-0.44, 0.42)], 0.03, "x")
    pods = [soft(0.17, 0.08, 0.17, (sx * 0.16, 0.23, 0.35), e=0.3) for sx in (-1, 1)]
    cuts = [box(0.006, 0.12, 0.004, (0.0, 0.12, 0.46))]                                            # (a seam on the nose)
    if look == 0:
        pillars = [capsule((sx * 0.175, 0.2, z0), (sx * 0.165, 0.375, z1), 0.02) for sx in (-1, 1) for z0, z1 in ((0.2, 0.07), (-0.31, -0.24))]
        common = [soft(0.56, 0.2, 0.92, (0, 0.13, 0), e=0.22), skirt, fin, soft(0.38, 0.04, 0.36, (0, 0.38, -0.085), e=0.3)] + pillars
        spark, turbo, neck = (0, 0.4, -0.08), (0, 0.2, -0.42), (0, 0.24, 0.37)
    elif look == 1:                                                                                  # a van: a tall box cab behind a short nose
        common = [soft(0.56, 0.2, 0.92, (0, 0.13, 0), e=0.22), skirt, soft(0.52, 0.3, 0.64, (0, 0.36, -0.13), e=0.2)]
        cuts += [box(0.42, 0.13, 0.04, (0, 0.42, 0.195)), box(0.04, 0.09, 0.44, (0.26, 0.42, -0.15)), box(0.04, 0.09, 0.44, (-0.26, 0.42, -0.15))]   # (windscreen, side windows)
        spark, turbo, neck = (0, 0.51, -0.13), (0, 0.24, -0.46), (0, 0.24, 0.37)
    else:                                                                                            # a roadster: an open cockpit
        common = [soft(0.56, 0.2, 0.94, (0, 0.12, 0), e=0.22), skirt, soft(0.46, 0.1, 0.36, (0, 0.2, -0.26), e=0.3)]
        cuts += [soft(0.36, 0.2, 0.3, (0, 0.28, -0.02), e=0.25)]                                    # (the cockpit)
        spark, turbo, neck = (0, 0.25, -0.3), (0, 0.16, -0.47), (0, 0.22, 0.36)
    hull = forms(root, root.name + "_hull", common, [], pods, "car", 0.02, 1800, cuts=cuts)
    if look == 0:
        plain(root.name + "_glass", extrude([(-0.3, 0.215), (0.21, 0.215), (0.08, 0.37), (-0.24, 0.37)], 0.33, "x"), "glass", root, 0.0, smooth=False)   # (the cabin, raked)
    elif look == 1:
        plain(root.name + "_glass", join([box(0.42, 0.13, 0.01, (0, 0.42, 0.184)), box(0.01, 0.09, 0.44, (0.249, 0.42, -0.15)), box(0.01, 0.09, 0.44, (-0.249, 0.42, -0.15))]), "glass", root, 0.0, smooth=False)
        fused(root.name + "_rack", join([capsule((sx * 0.2, 0.54, -0.4), (sx * 0.2, 0.54, 0.12), 0.012, seg=8) for sx in (-1, 1)] + [capsule((-0.2, 0.54, z), (0.2, 0.54, z), 0.01, seg=8) for z in (-0.32, -0.14, 0.04)]
                                          + [capsule((sx * 0.2, 0.5, z), (sx * 0.2, 0.54, z), 0.01, seg=8) for sx in (-1, 1) for z in (-0.38, 0.1)]), "chrome", root, 0.006, 500)
    else:
        fused(root.name + "_seat", join([soft(0.3, 0.06, 0.2, (0, 0.17, -0.04), e=0.35), soft(0.3, 0.2, 0.06, (0, 0.27, -0.14), (-0.2, 0, 0), e=0.35)]), "dark", root, 0.01, 400)
        plain(root.name + "_screen", soft(0.34, 0.12, 0.008, (0, 0.26, 0.17), (-0.5, 0, 0), e=0.4), "glass", root, 0.0)   # (raked back, its foot 1 cm into the scuttle)
        fused(root.name + "_screenframe", join([capsule((-0.175, 0.314, 0.141), (0.175, 0.314, 0.141), 0.009, seg=8)] + [capsule((sx * 0.175, 0.2, 0.2), (sx * 0.175, 0.314, 0.141), 0.009, seg=8) for sx in (-1, 1)]), "chrome", root, 0.006, 300)
        fused(root.name + "_hoop", chain([(-0.15, 0.2, -0.2), (-0.13, 0.38, -0.2), (0.13, 0.38, -0.2), (0.15, 0.2, -0.2)], [0.016] * 4, seg=8), "chrome", root, 0.008, 300)
        fused(root.name + "_wing", join([soft(0.54, 0.024, 0.12, (0, 0.38, -0.42), (-0.1, 0, 0), e=0.3)] + [box(0.015, 0.14, 0.05, (sx * 0.16, 0.3, -0.42)) for sx in (-1, 1)]), "dark", root, 0.01, 300)
    for sx in (-1, 1):
        fused(f"{root.name}_pipe{sx}", cyl(0.036, 0.04, 0.14, (sx * 0.13, 0.09, -0.48), (math.pi / 2, 0, 0)), "chrome", root, 0.008, 150, cuts=[cyl(0.024, 0.024, 0.05, (sx * 0.13, 0.09, -0.55), (math.pi / 2, 0, 0))])
        plain(f"{root.name}_glow{sx}", ell(0.024, 0.024, 0.006, (sx * 0.13, 0.09, -0.52), n=12), "red", root, 0.0)
    F.main(hull, faces=("x", "-x", "y"), crystals=3, mud=2, low=0.6)
    socket(root, "neck", neck, jrx=0.08, jrz=0.08)
    for sx in (-1, 1):
        socket(root, f"neck{'L' if sx < 0 else 'R'}", (sx * 0.16, 0.25, 0.36), lean=-sx * 0.1, jrx=0.06, jrz=0.06)
    mount(root, "spark", hull, spark, (0, 1, 0))                                                      # (a tesla coil on the roof)
    mount(root, "turbo", hull, turbo, (0, 0.6, -1))                                                   # (an engine on the boot)
    for sx in (-1, 1):
        point(root, f"door{sx}", (sx * 0.28, 0.14, 0.12), (sx, 0.1, 0), "side", 1.0)
    root["jrx"], root["jrz"] = 0.13, 0.15
    return F


def car_head(root, rng, look):
    F = Fit(rng)
    stub = cyl(0.06, 0.07, 0.1, (0, -0.02, 0))
    if look == 0:
        face = fused(root.name + "_face", join([soft(0.31, 0.22, 0.22, (0, 0.13, 0.03), e=0.28), soft(0.33, 0.04, 0.2, (0, 0.215, 0.03), e=0.35), stub]), "car", root, 0.018, 1100,
                     cuts=[ell(0.05, 0.05, 0.04, (sx * 0.085, 0.15, 0.135), n=16) for sx in (-1, 1)] + [soft(0.17, 0.06, 0.05, (0, 0.07, 0.14), e=0.25)])
        lamps = plain(root.name + "_lamps", join([ell(0.044, 0.044, 0.03, (sx * 0.085, 0.15, 0.115), n=16) for sx in (-1, 1)]), "lamp", root, 0.0)
        fused(root.name + "_slats", join([box(0.16, 0.008, 0.02, (0, 0.05 + 0.015 * k, 0.12)) for k in range(4)]), "chrome", root, 0.0, 300, smooth=0, vox=0.004)
        fused(root.name + "_bumper", soft(0.34, 0.045, 0.07, (0, 0.025, 0.12), e=0.3), "chrome", root, 0.008, 200)
        fused(root.name + "_siren", join([cyl(0.035, 0.045, 0.02, (0, 0.24, 0.0)), ell(0.035, 0.035, 0.035, (0, 0.26, 0.0))]), "red", root, 0.008, 120)
        top, eye = (0.06, 0.24, -0.05), (0.085, 0.15, 0.16)
    elif look == 1:                                                                                  # a bug: a round dome, round lamps on the wings
        face = fused(root.name + "_face", join([ell(0.16, 0.13, 0.13, (0, 0.13, 0.02)), stub] + [ell(0.06, 0.06, 0.075, (sx * 0.105, 0.1, 0.07)) for sx in (-1, 1)]), "car", root, 0.018, 1200,
                     cuts=[cyl(0.04, 0.04, 0.06, (sx * 0.105, 0.11, 0.14), (math.pi / 2, 0, 0)) for sx in (-1, 1)] + [box(0.012, 0.035, 0.03, (dx, 0.06, 0.13)) for dx in (-0.04, -0.013, 0.013, 0.04)])
        fused(root.name + "_rings", join([ring(0.042, 0.008, (sx * 0.105, 0.11, 0.135), (math.pi / 2, 0, 0), seg=20) for sx in (-1, 1)]), "chrome", root, 0.0, 300)
        lamps = plain(root.name + "_lamps", join([ell(0.036, 0.036, 0.02, (sx * 0.105, 0.11, 0.12), n=16) for sx in (-1, 1)]), "lamp", root, 0.0)
        fused(root.name + "_bumper", soft(0.32, 0.04, 0.06, (0, 0.02, 0.1), e=0.3), "chrome", root, 0.008, 200)
        top, eye = (0, 0.26, 0.0), (0.105, 0.11, 0.16)
    else:                                                                                            # a wedge: one lamp bar across, raked vents
        face = fused(root.name + "_face", join([soft(0.31, 0.17, 0.25, (0, 0.11, 0.02), (0.18, 0, 0), e=0.2), stub]), "car", root, 0.018, 1100,
                     cuts=[box(0.25, 0.024, 0.05, (0, 0.13, 0.15))] + [xf(box(0.04, 0.008, 0.06, (0, 0, 0)), (sx * 0.155, 0.1 - 0.02 * k, 0.03), (0, 0, sx * 0.5)) for sx in (-1, 1) for k in range(3)])
        lamps = plain(root.name + "_bar", box(0.24, 0.016, 0.01, (0, 0.13, 0.134)), "lamp", root, 0.0)
        fused(root.name + "_chin", soft(0.3, 0.02, 0.08, (0, 0.025, 0.13), e=0.3), "dark", root, 0.008, 200)
        top, eye = (0, 0.23, -0.03), (0.08, 0.13, 0.17)
    F.main(face, faces=("x", "-x"), crystals=1, size=0.55)
    mount(root, "radio", face, (0.05, 0.13, -0.03), (0, 1, 0))
    mount(root, "lens", lamps, (eye[0], eye[1], eye[2] - 0.04), (0, 0, 1))                        # (a big lensed lamp over the right one)
    socket(root, "top", top)
    socket(root, "eye", eye)
    point(root, "side", (-0.15, 0.13, 0.02), (-1, 0.1, 0), "side", 0.45)
    root["jrx"], root["jrz"] = 0.07, 0.07
    return F


for _slot, _fn in (("legs", car_legs), ("body", car_body), ("head", car_head)):
    for _look in range(3):
        BUILD[(_slot, "car", str(_look))] = (lambda fn, lk: lambda root, rng: fn(root, rng, lk))(_fn, _look)
