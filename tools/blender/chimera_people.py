# The chimera kit's people (exec'd by build_chimera.py after chimera_common.py): the settlers you can scoop up, the pirate, and the Vrill.
# At chimera scale: hip 0.6 m, torso 0.62 m, a helmet 0.32 m across. The void-touched are settlers in purple: they use these parts.
#   legs   person_suit (coveralls, engineer: the suit's legs, boots), person_trousers (lab coat, jacket, hoodie: trousers, shoes),
#          pirate_0 (patched knees, studded boots), alien_0 (a Vrill's bare legs, wrapped feet)
#   body   person_coveralls (extras: belt for coveralls; tool belt, pouches and a band for engineer), person_lab (a long coat), person_jacket
#          (extras: a tie for trader), person_hoodie, pirate_0 (bandolier, scarf, spiked pauldron), alien_0 (a tunic with a high collar)
#   head   person_sealed (helmet and visor), person_bowl (a bare head in a fishbowl), pirate_0 (helmet with a bandana), alien_0 (a Vrill)
# The colours the builder tints: the garment (the kind's hide, or `tunic`), trousers, skin, helmet, glass (the visor), glove, shirt, tie,
# hair, shoe. Hands are mittens in the `glove` slot (gloves, or bare skin).

J = 0.6                                       # hip height


# ---------------- legs ----------------
def legs_human(root, rng, style):
    hide = {"suit": "person", "trousers": "trousers", "pirate": "pirate", "alien": "alien"}[style]
    F = Fit(rng)
    pel = fused(root.name + "_pelvis", xf(lathe([(0, -0.07), (0.12, -0.065), (0.155, -0.02), (0.165, 0.04), (0.155, 0.09), (0.1, 0.11), (0, 0.115)], 20), (0, J - 0.02, 0), s=(1, 1, 0.78)),
                hide, root, 0.02, 400)
    F.main(pel, faces=("z", "-z"), crystals=1)
    slim = 0.72 if style == "alien" else 1.0
    for sx in (-1, 1):
        p = pivot(f"{root.name}_leg{'L' if sx < 0 else 'R'}", (sx * 0.085, J, 0), root, role="leg")
        prof = [(0, 0.03), (0.07, 0.02), (0.075, -0.04), (0.07, -0.16), (0.062, -0.26), (0.058, -0.3), (0.063, -0.33), (0.058, -0.37), (0.05, -0.45), (0.046, -0.5), (0, -0.52)]
        prof = [(r * slim if y < 0 else r, y) for r, y in prof]
        geo = [lathe(prof, 20), ell(0.05 * slim, 0.045, 0.04 * slim, (0, -0.31, 0.03))]
        cuts = []
        if style == "suit":
            cuts = [box(0.006, 0.22, 0.02, (sx * 0.068, -0.15, 0.0))]                              # (a side seam)
        elif style == "trousers":
            geo.append(ring(0.05, 0.012, (0, -0.47, 0)))                                            # (turned-up cuffs)
            cuts = [box(0.004, 0.36, 0.02, (0, -0.2, 0.072))]                                       # (a pressed crease)
        leg = fused(p.name + "_leg", join(geo), hide, p, 0.02, 600, cuts=cuts)
        F.limb(leg, (0, 0.15, 1), at=0.4, mud=2)
        if style == "trousers":
            fused(p.name + "_shoe", join([soft(0.1, 0.06, 0.18, (0, -0.565, 0.035), e=0.35), ell(0.047, 0.03, 0.05, (0, -0.55, 0.1)), cyl(0.045, 0.05, 0.06, (0, -0.52, 0))]), "shoe", p, 0.018, 320)
            fused(p.name + "_sole", soft(0.108, 0.02, 0.19, (0, -J + 0.01, 0.038), e=0.3), "sole", p, 0.01, 150)
        elif style == "alien":                                                                       # a long foot, bound in strips, three toes
            fused(p.name + "_foot", join([soft(0.07, 0.05, 0.16, (0, -0.57, 0.04), e=0.4)] + [ring(0.034, 0.008, (0, -0.5 - 0.025 * k, 0.0), s=(1, 1, 1.1)) for k in range(3)]), "wrap", p, 0.014, 320)
            plain(p.name + "_toes", join([ell(0.016, 0.014, 0.03, (dx, -0.585, 0.125)) for dx in (-0.022, 0, 0.022)]), "alien", p, 0.006)
        else:
            tall = style == "pirate"                                                                   # a pirate's boots come up to the knee
            top = -0.32 if tall else -0.46
            boot = fused(p.name + "_boot", join([lathe([(0.066, top), (0.068, -0.5), (0.066, -0.54), (0, -0.56)], 16), soft(0.11, 0.075, 0.2, (0, -0.545, 0.035), e=0.35), ell(0.05, 0.035, 0.05, (0, -0.565, 0.11))]
                                                + ([ring(0.068, 0.016, (0, top + 0.01, 0))] if tall else [])), "boot", p, 0.02, 420 if tall else 350)
            if tall:
                plain(p.name + "_studs", join([ell(0.01, 0.01, 0.01, (math.cos(a) * 0.084, top + 0.012, math.sin(a) * 0.084), n=6) for a in [k * math.pi / 3 for k in range(6)]]), "brass", p, 0.0)
                plain(p.name + "_patch", along(soft(0.07, 0.008, 0.07, e=0.4), (0, 0.15, 1), (0, -0.3, 0.064)), "patch", p, 0.008)
            fused(p.name + "_sole", soft(0.118, 0.026, 0.215, (0, -J + 0.013, 0.038), e=0.3), "sole", p, 0.012, 180,
                  cuts=[box(0.13, 0.012, 0.012, (0, -J + 0.002, z)) for z in (-0.04, 0.0, 0.04, 0.08)])
        point(p, "thigh", (sx * 0.06, -0.12, 0.0), (sx, 0.1, 0.2), "side", 0.6)
    socket(root, "hip", (0, J + 0.09, 0), jrx=0.15, jrz=0.12)
    return F


# ---------------- bodies ----------------
COVERALL = [(0, -0.07), (0.15, -0.07), (0.168, -0.04), (0.172, 0.02), (0.165, 0.12), (0.17, 0.24), (0.185, 0.36), (0.2, 0.45), (0.2, 0.51), (0.18, 0.56), (0.12, 0.6), (0.07, 0.62), (0, 0.625)]


def lapels(z=0.135):
    return [soft(0.05, 0.16, 0.022, (sx * 0.058, 0.47, z), (-0.15, 0, sx * 0.42), e=0.4) for sx in (-1, 1)]


def body_human(root, rng, look):
    """look: coveralls, lab, jacket, hoodie, pirate, tunic"""
    hide = {"pirate": "pirate", "tunic": "tunic"}.get(look, "person")
    arm_slot = "alien" if look == "tunic" else hide
    F = Fit(rng)
    prof = list(COVERALL)
    common, one, cuts = [], [], []
    forks = [chain([(sx * 0.07, 0.55, 0), (sx * 0.13, 0.615, 0), (sx * 0.15, 0.645, 0)], [0.075, 0.068, 0.062]) for sx in (-1, 1)]
    collar = ring(0.075, 0.03, (0, 0.6, 0.005), seg=20)
    if look in ("coveralls", "pirate"):
        common = [xf(lathe(prof, 24), s=(1, 1, 0.74))] + [soft(0.085, 0.024, 0.016, (sx * 0.068, 0.44, 0.138), (0.15, sx * 0.35, 0), e=0.3) for sx in (-1, 1)]
        one = [collar]
        cuts = [box(0.005, 0.5, 0.02, (0, 0.33, 0.14))]                                           # (the zip)
    elif look == "lab":                                                                              # a long coat, flared to the thigh, open below the waist
        coat = [(0, -0.25), (0.2, -0.25), (0.19, -0.12), (0.172, 0.0)] + prof[4:]
        common = [xf(lathe(coat, 24), s=(1, 1, 0.74))] + lapels() + [soft(0.07, 0.022, 0.014, (-0.075, 0.44, 0.14), (0.12, -0.3, 0), e=0.3)]
        cuts = [box(0.03, 0.24, 0.1, (0, -0.13, 0.15)), xf(box(0.07, 0.07, 0.1, (0, 0, 0)), (0, 0.53, 0.15), (0, 0, math.pi / 4))]   # (the opening, the vee)
    elif look == "jacket":
        jac = [(0, -0.12), (0.18, -0.12), (0.178, -0.04)] + prof[3:]
        common = [xf(lathe(jac, 24), s=(1, 1, 0.74))] + lapels() + [soft(0.08, 0.02, 0.014, (sx * 0.1, 0.06, 0.13), (0.1, sx * 0.4, 0), e=0.3) for sx in (-1, 1)]
        cuts = [xf(box(0.07, 0.07, 0.1, (0, 0, 0)), (0, 0.53, 0.15), (0, 0, math.pi / 4)), box(0.004, 0.26, 0.02, (0, 0.26, 0.14))]     # (the vee, the front edge)
    elif look == "hoodie":
        hood = [(0, -0.07), (0.15, -0.07), (0.168, -0.04), (0.178, -0.02), (0.168, 0.02)] + prof[4:]
        common = [xf(lathe(hood, 24), s=(1, 1, 0.74)), ring(0.168, 0.02, (0, -0.03, 0), s=(1, 1, 0.76), seg=32),               # (the ribbed hem)
                  soft(0.2, 0.12, 0.02, (0, 0.17, 0.13), (-0.05, 0, 0), e=0.25)]                                                  # (the kangaroo pocket)
        one = [ring(0.085, 0.04, (0, 0.6, -0.01), seg=20), ell(0.13, 0.08, 0.07, (0, 0.6, -0.1))]                                # (the hood, bunched behind the neck)
        cuts = [box(0.012, 0.09, 0.04, (sx * 0.1, 0.17, 0.15), (0, 0, sx * 0.35)) for sx in (-1, 1)]                             # (the pocket's openings)
    elif look == "tunic":                                                                            # a Vrill's tunic: slim, flared to the thigh
        tun = [(0, -0.16), (0.19, -0.16), (0.172, -0.05), (0.16, 0.06), (0.155, 0.2), (0.17, 0.36), (0.18, 0.46), (0.18, 0.51), (0.16, 0.56), (0.1, 0.6), (0.06, 0.62), (0, 0.625)]
        common = [xf(lathe(tun, 24), s=(1, 1, 0.76))]
        one = [lathe([(0.07, 0.55), (0.095, 0.6), (0.12, 0.7), (0.108, 0.71), (0.08, 0.62), (0.06, 0.58)], 24)]                    # (the high collar, flared)
        forks = []
    torso = forms(root, root.name + "_torso", common, one, forks, hide, 0.02, 1700, cuts)
    f1, f2 = torso.parent, bpy.data.objects[f"{root.name}_form2"]
    F.main(torso, faces=("x", "-x", "-z"), crystals=2, size=0.9)
    F.armor.append((torso, [(Vector((0, 0.27, 0.0)), Vector((0, 0.05, 1)), 0.26, 0.15, 0.6)]))      # (the vest's front: below the pockets)
    if look in ("coveralls", "pirate"):
        x = extra(root, "belt", "coveralls,pirate") if look == "coveralls" else root
        fused(root.name + "_belt", ring(0.168, 0.022, (0, 0.11, 0), s=(1, 1, 0.76), seg=32), "belt", x, 0.0, 300)
        fused(root.name + "_buckle", soft(0.06, 0.045, 0.02, (0, 0.11, 0.135), e=0.3), "brass" if look == "pirate" else "gold", x, 0.0, 100, cuts=[box(0.035, 0.022, 0.03, (0, 0.11, 0.14))])
    if look == "coveralls":                                                                          # an engineer's tool belt, pouches and reflective band
        x = extra(root, "tools", "engineer")
        fused(root.name + "_toolbelt", ring(0.172, 0.026, (0, 0.1, 0), s=(1, 1, 0.78), seg=32), "leather", x, 0.0, 300)
        for k, px in enumerate((-0.12, 0.12, 0.06)):
            pz = 0.13 if k == 2 else 0.1
            fused(f"{root.name}_pouch{k}", soft(0.07, 0.08, 0.05, (px, 0.06, pz), (0, px * 2.5, 0), e=0.3), "pouch", x, 0.01, 160)
        fused(root.name + "_band", ring(0.192, 0.014, (0, 0.38, 0), s=(1, 1, 0.76), seg=32), "cream", x, 0.0, 250)
    if look in ("lab", "jacket"):
        plain(root.name + "_shirt", soft(0.08, 0.12, 0.03, (0, 0.53, 0.115), e=0.35), "shirt", f1, 0.0)
        plain(root.name + "_shirt2", soft(0.08, 0.12, 0.03, (0, 0.53, 0.115), e=0.35), "shirt", f2, 0.0)
        plain(root.name + "_buttons", join([ell(0.011, 0.011, 0.006, (0, y, 0.135 - (0.01 if y < 0.1 else 0)), n=8) for y in ((0.3, 0.2, 0.1) if look == "lab" else (0.3, 0.18))]), "dark", root, 0.0)
        if look == "lab":
            plain(root.name + "_pen", cyl(0.006, 0.006, 0.07, (-0.06, 0.46, 0.14)), "dark", root, 0.0)
        else:
            x = extra(root, "tie", "trader")
            plain(root.name + "_tie", join([soft(0.03, 0.03, 0.018, (0, 0.555, 0.13), e=0.4), xf(extrude([(0, 0.53), (0.02, 0.48), (0, 0.4), (-0.02, 0.48)], 0.012, "z"), (0, 0, 0.132))]), "tie", x, 0.006)
    if look == "hoodie":
        plain(root.name + "_cords", join([capsule((sx * 0.03, 0.55, 0.12), (sx * 0.035, 0.44, 0.14), 0.005, seg=6) for sx in (-1, 1)]), "cream", f1, 0.0)
    if look == "pirate":                                                                             # bandolier, brass shells; a scarf; a spiked pauldron
        g = root
        for side, (cx, cy, spin, n) in enumerate(((0.0, 0.35, 0.95, (0, 0.05, 1)), (0.0, 0.35, -0.95, (0, 0.05, -1)))):
            H = hit(torso, (cx, cy, 0), n, 0.6)
            if not H:
                continue
            c, nn = H
            plate(g, f"{root.name}_strap{side}", torso, c, nn, 0.56, 0.05, "leather", "strap", spin=spin, th=0.012, rivets=False)
            if side == 0:
                u, v, _ = frame_at(nn)
                u2 = u * math.cos(spin) + v * math.sin(spin)
                shells = []
                for t in (-0.15, -0.09, -0.03, 0.03, 0.09, 0.15):
                    H2 = hit(torso, c + u2 * t, nn, 0.1)
                    if H2:
                        v2 = v * math.cos(spin) - u * math.sin(spin)
                        shells.append(along(cyl(0.009, 0.009, 0.045), v2, tuple(H2[0] + H2[1] * 0.016)))
                plain(root.name + "_shells", join(shells), "brass", root, 0.006)
        fused(root.name + "_scarf", join([ring(0.082, 0.032, (0, 0.6, 0.0), seg=20), ell_between((0.02, 0.6, -0.08), (0.07, 0.4, -0.17), 0.045, 0.012, roll=0.3)]), "scarf", f1, 0.012, 500)
    arms = []
    for sx in (-1, 1):
        p = pivot(f"{root.name}_arm{'L' if sx < 0 else 'R'}", (sx * 0.2, 0.5, 0), root, role="arm")
        path = [(0, 0, 0), (sx * 0.02, -0.15, -0.005), (sx * 0.03, -0.29, 0.035)]
        if look == "tunic":                                                                          # a Vrill's arm: long and thin, a gold band at the wrist
            path = [(0, 0, 0), (sx * 0.02, -0.17, -0.005), (sx * 0.03, -0.33, 0.035)]
            sleeve = fused(p.name + "_arm", join([ell(0.055, 0.055, 0.05, (0, -0.01, 0)), chain(path, [0.042, 0.033, 0.028])]), "alien", p, 0.014, 420)
            fused(p.name + "_band", ring(0.03, 0.008, path[-1], (0.25, 0, 0), seg=14), "sash", p, 0.0, 120)
            w = Vector(path[-1]) + Vector((0, -0.04, 0.01))
            hand = [ell(0.028, 0.034, 0.018, tuple(w))] + [capsule(tuple(w + Vector((dx, -0.02, 0.005))), tuple(w + Vector((dx * 1.3, -0.075, 0.015))), 0.008, 0.006, seg=8) for dx in (-0.016, 0, 0.016)]
            fused(p.name + "_hand", join(hand + [capsule(tuple(w + Vector((sx * 0.02, 0.0, 0.012))), tuple(w + Vector((sx * 0.035, -0.03, 0.03))), 0.008, seg=8)]), "alien", p, 0.008, 260)
        else:
            sleeve = fused(p.name + "_sleeve", join([ell(0.062, 0.062, 0.058, (0, -0.01, 0)), chain(path, [0.052, 0.045, 0.04]), ring(0.04, 0.012, path[-1], (0.25, 0, 0), seg=16, rseg=6)]), arm_slot, p, 0.016, 500)
            w = Vector(path[-1]) + Vector((0, -0.05, 0.012))
            fused(p.name + "_glove", join([ell(0.038, 0.048, 0.026, tuple(w)), capsule(tuple(w + Vector((sx * 0.03, 0.01, 0.015))), tuple(w + Vector((sx * 0.045, -0.02, 0.03))), 0.012),
                                           ell(0.034, 0.03, 0.022, tuple(w + Vector((0, -0.045, 0.006))))]), "glove", p, 0.008, 250)
        if look == "pirate" and sx < 0:                                                               # a spiked pauldron on the left shoulder
            fused(p.name + "_pauldron", ell(0.085, 0.05, 0.08, (0, 0.012, 0), n=18), "steel", p, 0.012, 300)
            plain(p.name + "_spikes", join([along(lathe([(0.014, 0), (0, 0.05)], 8), (math.sin(a) * -0.6, 1, math.cos(a) * 0.4), (math.sin(a) * -0.04, 0.05, math.cos(a) * 0.03)) for a in (-0.9, 0, 0.9)]), "metal", p, 0.006)
        F.limb(sleeve, (sx, 0.4, 0), at=0.85, crystal=0.3, size=0.7)
        arms.append(p)
    if look == "tunic":                                                                              # the gem clasp, a gold sash
        plain(root.name + "_gem", along(lathe([(0, 0), (0.022, 0.012), (0, 0.03)], 6), (0, 0.15, 1), (0, 0.44, 0.128)), "gem", root, 0.004)
        fused(root.name + "_setting", ring(0.026, 0.006, (0, 0.44, 0.13), (math.pi / 2 - 0.15, 0, 0), seg=14), "sash", root, 0.0, 120)
        fused(root.name + "_sash", ring(0.162, 0.02, (0, 0.08, 0), s=(1, 1, 0.78), seg=32), "sash", root, 0.0, 300)
        for sx in (-1, 1):                                                                           # (form 2: a skin neck up each fork)
            fused(f"{root.name}_neck{sx}", chain([(sx * 0.05, 0.5, 0), (sx * 0.12, 0.6, 0), (sx * 0.15, 0.645, 0)], [0.05, 0.045, 0.042]), "alien", f2, 0.014, 300)
    socket(root, "neck", (0, 0.62, 0), jrx=0.07, jrz=0.07)
    for sx in (-1, 1):
        socket(root, f"neck{'L' if sx < 0 else 'R'}", (sx * 0.15, 0.64, 0), lean=-sx * 0.3, jrx=0.06, jrz=0.06)
    mount(root, "spark", torso, (0, 0.18, 0), (0, 0, -1))                                           # (a battery pack, low on the back)
    mount(root, "turbo", torso, (0, 0.44, 0), (0, 0.1, -1))                                         # (a jet pack, between the shoulders)
    for sx in (-1, 1):
        point(root, f"flank{sx}", (sx * 0.17, 0.3, 0), (sx, 0.05, 0), "side", 0.8)
    root["jrx"], root["jrz"] = 0.15, 0.12
    return F


# ---------------- heads ----------------
def head_human(root, rng, look):
    """look: sealed, bowl, pirate, alien"""
    F = Fit(rng)
    r, cy = 0.16, 0.2
    if look in ("sealed", "pirate"):
        fused(root.name + "_neck", join([cyl(0.058, 0.064, 0.1, (0, -0.02, 0)), ring(0.07, 0.024, (0, 0.035, 0), seg=20)]), "dark", root, 0.01, 250)
        cuts = [ell(0.135, 0.075, 0.07, (0, cy + 0.005, 0.158), n=20),                              # the visor opening: wide and shallow
                xf(cylinder(0.026, 0.026, 0.06, 14)[:2], (r * 0.96, cy + 0.03, 0.0), (0, 0, math.pi / 2)),   # the lamp's socket
                box(0.01, 0.006, 0.2, (0, cy + r * 0.99, -0.02))]                                    # a ridge seam over the top
        if look == "pirate":                                                                          # claw marks
            cuts += [xf(box(0.004, 0.09, 0.03, (0, 0, 0)), (-0.1 - 0.018 * k, cy + 0.06, 0.1), (0, -0.7, 0.5)) for k in range(3)]
        helmet = fused(root.name + "_helmet", ell(r, r, r, (0, cy, 0), n=24), "helmet", root, 0.02, 1200, cuts=cuts)
        plain(root.name + "_visor", ell(r * 0.955, r * 0.955, r * 0.955, (0, cy, 0.0), n=18), "glass", root, 0.0)
        plain(root.name + "_lamp", xf(cylinder(0.02, 0.02, 0.02, 14)[:2], (r * 0.95, cy + 0.03, 0.0), (0, 0, math.pi / 2)), "lamp", root, 0.0)
        F.main(helmet, faces=("-x", "-z"), crystals=1, size=0.6)
        if look == "pirate":                                                                          # a red bandana round the brow, knotted behind
            fused(root.name + "_bandana", join([ring(0.152, 0.02, (0, cy + 0.07, -0.005), (0.12, 0, 0), seg=32),
                                                ell(0.03, 0.025, 0.025, (0, cy + 0.06, -0.165)),
                                                ell_between((0.0, cy + 0.05, -0.17), (0.05, cy - 0.06, -0.21), 0.025, 0.008, roll=0.4),
                                                ell_between((0.0, cy + 0.05, -0.17), (-0.04, cy - 0.04, -0.22), 0.022, 0.008, roll=-0.4)]), "scarf", root, 0.012, 600)
        mount(root, "radio", helmet, (0, cy + 0.1, 0), (0, 1, 0))
        mount(root, "lens", helmet, (0.05, cy + 0.01, 0.1), (0.3, 0, 1))
    elif look == "bowl":                                                                              # a bare head in a fishbowl
        fused(root.name + "_collar", join([cyl(0.07, 0.075, 0.1, (0, -0.02, 0)), ring(0.12, 0.026, (0, 0.04, 0), seg=28)]), "metal", root, 0.012, 400)
        fused(root.name + "_neck", cyl(0.04, 0.045, 0.1, (0, 0.06, 0)), "skin", root, 0.0, 120)
        hc = Vector((0, cy - 0.01, 0.01))
        head = fused(root.name + "_head", join([ell(0.092, 0.11, 0.098, tuple(hc)), ell(0.017, 0.02, 0.016, tuple(hc + Vector((0, -0.025, 0.098)))),
                                                ell(0.018, 0.032, 0.02, tuple(hc + Vector((0.09, 0, 0)))), ell(0.018, 0.032, 0.02, tuple(hc + Vector((-0.09, 0, 0))))]), "skin", root, 0.012, 700,
                     cuts=[ell(0.012, 0.016, 0.01, tuple(hc + Vector((sx * 0.036, 0.018, 0.094))), n=10) for sx in (-1, 1)] + [box(0.03, 0.004, 0.02, tuple(hc + Vector((0, -0.055, 0.092))))])
        plain(root.name + "_eyes", join([ell(0.01, 0.014, 0.006, tuple(hc + Vector((sx * 0.036, 0.018, 0.088))), n=10) for sx in (-1, 1)]), "dark", root, 0.0)
        hair = fused(root.name + "_hair", ell(0.1, 0.105, 0.104, tuple(hc + Vector((0, 0.022, -0.008)))), "hair", root, 0.01, 500,
                     cuts=[ell(0.11, 0.1, 0.1, tuple(hc + Vector((0, -0.06, 0.07))))])
        plain(root.name + "_bowl", ell(0.17, 0.17, 0.17, (0, cy, 0), n=24), "bowl", root, 0.0)
        F.crystal.append((hair, [(hc, Vector((-0.4, 1, -0.3)), 0.5, 0.4)]))
        mount(root, "radio", hair, tuple(hc), (0, 1, 0))
        lens_at(root, (0.036, cy + 0.01, 0.17))
    else:                                                                                             # a Vrill: a tall smooth skull, great dark eyes, antennae
        skull = fused(root.name + "_skull", join([ell(0.115, 0.165, 0.125, (0, 0.24, 0)), ell(0.07, 0.07, 0.075, (0, 0.11, 0.035)), cyl(0.04, 0.046, 0.14, (0, 0.0, 0))]), "alien", root, 0.02, 1100,
                      cuts=[along(ell(0.03, 0.05, 0.03, n=14), (sx * -0.35, 1, 0), (sx * 0.052, 0.2, 0.108)) for sx in (-1, 1)] + [box(0.03, 0.004, 0.02, (0, 0.105, 0.105))])
        plain(root.name + "_eyes", join([along(ell(0.027, 0.046, 0.022, n=14), (sx * -0.35, 1, 0), (sx * 0.052, 0.2, 0.1)) for sx in (-1, 1)]), "dark", root, 0.0)
        plain(root.name + "_glints", join([ell(0.007, 0.007, 0.004, (sx * 0.045 - 0.008, 0.225, 0.122), n=8) for sx in (-1, 1)]), "cream", root, 0.0)
        for sx in (-1, 1):
            ant = [(sx * 0.045, 0.37, -0.02), (sx * 0.08, 0.45, -0.03), (sx * 0.1, 0.5, 0.0), (sx * 0.14, 0.54, -0.01)]
            fused(f"{root.name}_antenna{sx}", chain(ant, [0.013, 0.01, 0.009, 0.008], seg=8), "alien", root, 0.008, 220)
            plain(f"{root.name}_tip{sx}", ell(0.022, 0.022, 0.022, ant[-1], n=12), "tip", root, 0.0)
        F.main(skull, faces=("-x", "-z", "y"), crystals=1, size=0.5)
        mount(root, "radio", skull, (0, 0.3, -0.03), (0, 1, -0.2))
        mount(root, "lens", skull, (0.052, 0.2, 0.08), (0.2, 0, 1))
    top = 0.41 if look == "alien" else cy + (0.17 if look == "bowl" else r)
    socket(root, "top", (0, top, 0))
    socket(root, "eye", (0.05, cy, 0.15))
    point(root, "side", (-r, cy, 0), (-1, 0.1, 0), "side", 0.45)
    root["jrx"], root["jrz"] = 0.07, 0.07
    return F


for _look, _style in (("suit", "suit"), ("trousers", "trousers")):
    BUILD[("legs", "person", _look)] = (lambda st: lambda root, rng: legs_human(root, rng, st))(_style)
BUILD[("legs", "pirate", "0")] = lambda root, rng: legs_human(root, rng, "pirate")
BUILD[("legs", "alien", "0")] = lambda root, rng: legs_human(root, rng, "alien")
for _look in ("coveralls", "lab", "jacket", "hoodie"):
    BUILD[("body", "person", _look)] = (lambda lk: lambda root, rng: body_human(root, rng, lk))(_look)
BUILD[("body", "pirate", "0")] = lambda root, rng: body_human(root, rng, "pirate")
BUILD[("body", "alien", "0")] = lambda root, rng: body_human(root, rng, "tunic")
for _look in ("sealed", "bowl"):
    BUILD[("head", "person", _look)] = (lambda lk: lambda root, rng: head_human(root, rng, lk))(_look)
BUILD[("head", "pirate", "0")] = lambda root, rng: head_human(root, rng, "pirate")
BUILD[("head", "alien", "0")] = lambda root, rng: head_human(root, rng, "alien")
