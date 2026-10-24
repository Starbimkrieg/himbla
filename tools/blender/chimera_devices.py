# The chimera kit's devices (exec'd by build_chimera.py after the parts): what the spark, turbo, radio and lens mutations grow, in each
# family's form, built on their socket's frame (+y out of the surface; on a back, +z is up), the foot sunk 3 cm into the part:
#   spark   human: a battery pack, glowing cells   mite: a bioelectric sac on a stalk   car: a tesla coil   sapling: glowing seed pods
#   turbo   human: a jet pack                      mite: three jet vents                car: an engine with its stacks   sapling: a hollow log, smouldering
#   radio   human: a field radio with a whip aerial   mite: a third feeler with a receiver   car: an aerial and a dish   sapling: a leaf dish
#   lens    human, mite: a jeweller's eyepiece     car: a big lensed headlamp           sapling: a glass eye bud on a stalk
# and ch_arc (the spark's crackle on a flank), ch_crown (the Triple Crown's laurels).


def dev(name):
    return pivot(name, (0, 0, 0), None, role="device")


def zigzag(n, length, amp, rng, r=0.007):
    pts = [(0, -0.01, 0)] + [(rng.uniform(-amp, amp), length * (k + 1) / n, rng.uniform(-amp, amp)) for k in range(n)]
    return chain(pts, [r] * len(pts), seg=6)


def build_devices():
    rng = random.Random(7)
    # ---- spark ----
    d = dev("ch_mut_spark_human")
    fused(d.name + "_box", join([soft(0.2, 0.1, 0.14, (0, 0.03, 0), e=0.25), soft(0.22, 0.03, 0.02, (0, 0.05, 0.075), e=0.4)]), "steel", d, 0.012, 400,
          cuts=[box(0.04, 0.03, 0.09, (x, 0.08, 0)) for x in (-0.06, 0, 0.06)])
    plain(d.name + "_cells", join([box(0.032, 0.02, 0.08, (x, 0.07, 0)) for x in (-0.06, 0, 0.06)]), "spark", d, 0.0, smooth=False)
    fused(d.name + "_cable", chain([(0.1, 0.04, 0.0), (0.14, 0.03, 0.05), (0.12, 0.0, 0.12)], [0.008] * 3, seg=6), "dark", d, 0.004, 120)
    d = dev("ch_mut_spark_mite")
    fused(d.name + "_stalk", join([cyl(0.03, 0.04, 0.08, (0, 0.01, 0)), ring(0.035, 0.012, (0, 0.05, 0), seg=16)]), "dark", d, 0.008, 200)
    plain(d.name + "_sac", ell(0.07, 0.09, 0.07, (0, 0.13, 0), n=16), "spark", d, 0.008)
    fused(d.name + "_veins", join([chain([(math.cos(a) * 0.05, 0.07, math.sin(a) * 0.05), (math.cos(a + 0.4) * 0.072, 0.13, math.sin(a + 0.4) * 0.072), (math.cos(a + 0.7) * 0.045, 0.2, math.sin(a + 0.7) * 0.045)], [0.006] * 3, seg=6) for a in (0, 2.1, 4.2)]), "dark", d, 0.0, 300)
    d = dev("ch_mut_spark_car")
    fused(d.name + "_base", cyl(0.06, 0.07, 0.07, (0, 0.005, 0)), "dark", d, 0.01, 160)
    fused(d.name + "_coil", join([cyl(0.022, 0.022, 0.2, (0, 0.13, 0))] + [cyl(0.04, 0.04, 0.012, (0, 0.06 + 0.028 * k, 0)) for k in range(6)] + [ring(0.07, 0.024, (0, 0.25, 0), seg=24)]), "chrome", d, 0.008, 700)
    plain(d.name + "_ball", ell(0.03, 0.03, 0.03, (0, 0.25, 0)), "spark", d, 0.0)
    plain(d.name + "_bolt", zigzag(4, 0.1, 0.03, rng, 0.006), "spark", pivot(d.name + "_up", (0.07, 0.26, 0), d), 0.0)
    d = dev("ch_mut_spark_sapling")
    fused(d.name + "_bough", join([capsule((0, -0.02, 0), (0, 0.06, 0), 0.025, seg=10)] + [capsule((0, 0.05, 0), (math.cos(a) * 0.07, 0.08, math.sin(a) * 0.07), 0.01, seg=6) for a in (0.3, 2.4, 4.4)]), "bark", d, 0.008, 300)
    plain(d.name + "_pods", join([ell(0.03, 0.045, 0.03, (math.cos(a) * 0.08, 0.06, math.sin(a) * 0.08)) for a in (0.3, 2.4, 4.4)]), "spark", d, 0.008)
    # ---- turbo ----
    d = dev("ch_mut_turbo_human")                                                                   # (on a back: +z is up, +y away from it)
    fused(d.name + "_frame", soft(0.2, 0.04, 0.22, (0, 0.0, 0.0), e=0.3), "dark", d, 0.01, 200)
    fused(d.name + "_tanks", join([cyl(0.045, 0.045, 0.24, (sx * 0.055, 0.06, 0.0), (math.pi / 2, 0, 0)) for sx in (-1, 1)] + [ell(0.045, 0.045, 0.03, (sx * 0.055, 0.06, 0.12), n=12) for sx in (-1, 1)]), "steel", d, 0.012, 500)
    fused(d.name + "_nozzles", join([cyl(0.03, 0.04, 0.05, (sx * 0.055, 0.06, -0.14), (math.pi / 2, 0, 0)) for sx in (-1, 1)]), "dark", d, 0.008, 200,
          cuts=[cyl(0.022, 0.022, 0.03, (sx * 0.055, 0.06, -0.165), (math.pi / 2, 0, 0)) for sx in (-1, 1)])
    plain(d.name + "_flames", join([ell(0.022, 0.022, 0.012, (sx * 0.055, 0.06, -0.157), n=10) for sx in (-1, 1)]), "ember", d, 0.0)
    d = dev("ch_mut_turbo_mite")
    vents = [((-0.06, 0.0), 0.04), ((0.06, 0.0), 0.04), ((0.0, 0.07), 0.034)]
    fused(d.name + "_vents", join([chain([(x, -0.02, z), (x * 1.3, 0.06, z * 1.3), (x * 1.6, 0.12, z * 1.6)], [r, r * 0.9, r * 0.85], seg=10) for (x, z), r in vents]), "dark", d, 0.01, 500,
          cuts=[cyl(r * 0.6, r * 0.6, 0.05, (x * 1.6, 0.13, z * 1.6)) for (x, z), r in vents])
    plain(d.name + "_glow", join([ell(r * 0.6, 0.01, r * 0.6, (x * 1.6, 0.115, z * 1.6), n=10) for (x, z), r in vents]), "ember", d, 0.0)
    d = dev("ch_mut_turbo_car")
    fused(d.name + "_block", join([soft(0.26, 0.12, 0.2, (0, 0.04, 0), e=0.25), soft(0.16, 0.05, 0.1, (0, 0.1, 0.02), e=0.3)]), "steel", d, 0.012, 500,
          cuts=[box(0.27, 0.006, 0.006, (0, 0.04, z)) for z in (-0.05, 0.0, 0.05)])
    fused(d.name + "_scoop", soft(0.12, 0.04, 0.08, (0, 0.13, 0.03), e=0.3), "chrome", d, 0.008, 160, cuts=[box(0.09, 0.025, 0.05, (0, 0.13, 0.07))])
    fused(d.name + "_stacks", join([cyl(0.022, 0.026, 0.14, (sx * 0.1, 0.12, -0.08), (0.5, 0, 0)) for sx in (-1, 1)]), "chrome", d, 0.006, 200,
          cuts=[cyl(0.014, 0.014, 0.05, (sx * 0.1, 0.18, -0.115), (0.5, 0, 0)) for sx in (-1, 1)])
    plain(d.name + "_glow", join([ell(0.014, 0.008, 0.014, (sx * 0.1, 0.175, -0.112), (0.5, 0, 0), n=8) for sx in (-1, 1)]), "ember", d, 0.0)
    d = dev("ch_mut_turbo_sapling")
    fused(d.name + "_log", cyl(0.07, 0.065, 0.3, (0, 0.05, 0.0), (0, 0, math.pi / 2), seg=16), "bark", d, 0.012, 400,
          cuts=[cyl(0.045, 0.045, 0.34, (0, 0.05, 0.0), (0, 0, math.pi / 2), seg=16)])
    plain(d.name + "_embers", join([ell(0.04, 0.04, 0.012, (sx * 0.12, 0.05, 0.0), (0, 0, math.pi / 2), n=10) for sx in (-1, 1)]), "ember", d, 0.0)
    plain(d.name + "_moss", ell(0.06, 0.02, 0.05, (0.03, 0.11, 0.01)), "moss", d, 0.006)
    # ---- radio ----
    d = dev("ch_mut_radio_human")
    fused(d.name + "_set", soft(0.1, 0.06, 0.07, (0, 0.02, 0), e=0.3), "vest", d, 0.01, 200, cuts=[box(0.06, 0.02, 0.006, (0, 0.03, 0.036))])
    fused(d.name + "_whip", capsule((0.03, 0.04, -0.02), (0.06, 0.34, -0.06), 0.005, seg=6), "dark", d, 0.004, 80)
    plain(d.name + "_lamp", ell(0.01, 0.01, 0.01, (-0.03, 0.055, 0.02), n=8), "red", d, 0.0)
    d = dev("ch_mut_radio_mite")
    fused(d.name + "_feeler", chain([(0, -0.02, 0), (0.01, 0.12, 0.02), (-0.02, 0.22, 0.06), (0.0, 0.3, 0.08)], [0.016, 0.012, 0.01, 0.008], seg=8), "dark", d, 0.006, 200)
    plain(d.name + "_receiver", join([lathe([(0, 0.0), (0.04, 0.02), (0.045, 0.03), (0, 0.025)], 14)]), "tip", pivot(d.name + "_dish", (0, 0.3, 0.08), d), 0.006)
    d = dev("ch_mut_radio_car")
    fused(d.name + "_whip", join([cyl(0.015, 0.02, 0.04, (0, 0.0, 0)), capsule((0, 0.02, 0), (0.02, 0.42, -0.04), 0.005, seg=6)]), "chrome", d, 0.004, 120)
    plain(d.name + "_tip", ell(0.012, 0.012, 0.012, (0.02, 0.43, -0.04), n=8), "red", d, 0.0)
    fused(d.name + "_dish", join([cyl(0.01, 0.01, 0.08, (0.07, 0.04, 0)), along(lathe([(0, 0), (0.06, 0.03), (0.065, 0.035), (0, 0.012)], 18), (0, 0.4, 1), (0.07, 0.08, 0.0))]), "chrome", d, 0.006, 300)
    d = dev("ch_mut_radio_sapling")
    fused(d.name + "_stem", chain([(0, -0.02, 0), (0.0, 0.1, -0.01), (0.0, 0.17, 0.02)], [0.012, 0.01, 0.009], seg=8), "leaf", d, 0.006, 150)
    fused(d.name + "_leaf", along(lathe([(0, 0), (0.07, 0.03), (0.075, 0.04), (0, 0.012)], 18), (0, 0.3, 1), (0, 0.18, 0.02)), "leaf", d, 0.008, 300)
    # ---- lens (+y looks out) ----
    for fam in ("human", "mite"):
        d = dev(f"ch_mut_lens_{fam}")
        fused(d.name + "_tube", join([cyl(0.03, 0.026, 0.07, (0, 0.02, 0)), ring(0.03, 0.006, (0, 0.055, 0), seg=16)]), "dark", d, 0.006, 260, cuts=[cyl(0.02, 0.02, 0.03, (0, 0.06, 0))])
        plain(d.name + "_glass", ell(0.02, 0.006, 0.02, (0, 0.046, 0), n=12), "glass", d, 0.0)
        fused(d.name + "_ring", ring(0.032, 0.005, (0, 0.0, 0), seg=16), "brass", d, 0.0, 100)
    d = dev("ch_mut_lens_car")
    fused(d.name + "_housing", cyl(0.07, 0.06, 0.07, (0, 0.01, 0), seg=24), "chrome", d, 0.008, 300, cuts=[cyl(0.058, 0.058, 0.03, (0, 0.05, 0), seg=24)])
    plain(d.name + "_glass", ell(0.058, 0.012, 0.058, (0, 0.035, 0), n=16), "lamp", d, 0.0)
    d = dev("ch_mut_lens_sapling")
    fused(d.name + "_stalk", chain([(0, -0.02, 0), (0.01, 0.05, 0.02), (0.0, 0.09, 0.0)], [0.01, 0.009, 0.008], seg=8), "leaf", d, 0.006, 150)
    plain(d.name + "_bulb", ell(0.03, 0.03, 0.03, (0, 0.11, 0), n=14), "glass", d, 0.006)
    plain(d.name + "_pupil", ell(0.012, 0.008, 0.012, (0, 0.135, 0), n=10), "dark", d, 0.0)
    # ---- the spark's arc, the crown ----
    d = dev("ch_arc")
    plain(d.name + "_zig", join([zigzag(4, 0.13, 0.025, rng), xf(zigzag(3, 0.09, 0.02, rng, 0.005), (0.02, 0, 0.01), (0, 0, -0.5))]), "spark", d, 0.0)
    d = dev("ch_crown")
    leaves = [ell_between((math.cos(a) * 0.1, 0.06, math.sin(a) * 0.1), (math.cos(a + 0.35) * 0.11, 0.1, math.sin(a + 0.35) * 0.11), 0.018, 0.006, roll=a, n=10) for a in [k * math.pi / 7 for k in range(14)]]
    fused(d.name + "_laurels", join([ring(0.1, 0.008, (0, 0.06, 0), seg=28)] + leaves), "gold", d, 0.008, 700)
    plain(d.name + "_jewel", ell(0.016, 0.02, 0.012, (0, 0.08, 0.105), n=10), "red", d, 0.0)


build_devices()
