# The defence turret for Blender (4.2+ / 5.x), in two proposals (docs/turret-proposals): every base gun in the game (the
# bases' defence rings and walls, the ILMB's, restricted zones, founded outposts' militia guns, the hometown barracks).
#
# headless:   MOONRUNNER_REPO=<repo> python3 tools/blender/build_turret.py      (MOONRUNNER_EXPORT=0 builds without writing)
# in Blender: exec(open(r"<repo>/tools/blender/build_turret.py").read())
#
# turret_a, "Bastion": a twin autocannon in a sloped armoured head on an octagonal pedestal; the guns on a trunnion in
#   cheek brackets, a drum mantlet, belt chutes from ammo boxes on the flanks, a roof sight and a turning search radar.
# turret_b, "Aegis": a radome gun on a yoke: the pedestal tapers to a slew ring, the yoke's arms carry the elevating mass
#   (the radar dome over a six-barrel rotary gun, an ammo drum under it), equipment pods on the arms' outer faces.
#
# Frame: three.js axes (x right, y up, +z the way the gun points at rest), metres, origin on the ground at the pedestal's
# middle. Same footprint and head height as the code-built turret it replaces (models.js makeTurret): about 2.5 m round,
# the head turning at y 3.1, so the game's colliders and placement stand (enemies.setupBase scales the ILMB's by 1.35).
# Pivots (empties with a `role`):
#   head    turned about y (yaw) at (0, 3.1, 0); its meshes in its frame
#   barrel  under head: pitched about x at the trunnion (rotation.x < 0 raises the guns; built for -0.35..+1.25 rad up)
#   muzzle  under barrel: an empty at each muzzle, where rounds leave (extra `index`)
#   spin    turned about its own axis (extra `axis` "y" or "z", `speed` rad/s): A's radar (always), B's barrels (firing)
# Slots (TURRET_TOON / TURRET_GLOW in src/models.js): body takes the faction's colour, lens glows in it; fixed toon dark,
# steel, metal, panel, white, tire, hazard; glow red, amber. Custom property "ink" = outline thickness in metres.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_turret.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("TURRET_OUT") or os.path.join(REPO, "src", "assets", "turret.glb")
COLL = "Turret"
HEX = {
    # livery (preview: SPACECOM's blue; the game paints the faction's colour)
    "body": 0x2B59C3, "lens": 0x2B59C3,
    # toon
    "dark": 0x2A2540, "steel": 0x55607A, "metal": 0x8A87A0, "panel": 0x4A4660, "white": 0xF3EEE4, "tire": 0x1D1A29,
    "hazard": 0xFFD23F,
    # glow
    "red": 0xFF2A4A, "amber": 0xFFD23F,
}
PFX = "turret_"
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())
from mathutils import Vector

HEAD_Y = 3.1
OCT = math.pi / 8                                # turns kit.cylinder's 8-gon (a corner at +z) to face its flats along the axes
X90 = (math.pi / 2, 0, 0)                        # a y-axis part laid along z
Z90 = (0, 0, math.pi / 2)                        # a y-axis part laid along x


def flush(parent, prefix):
    made = flush_all(parent, prefix)
    return made


def spinner(name, pos, parent, axis, speed):
    return pivot(name, pos, parent, role="spin", axis=axis, speed=speed)


# =====================================================================================================================
# A: "Bastion"
# =====================================================================================================================
def build_a():
    root = pivot("turret_a", (0, 0, 0), None, draft="a", headY=HEAD_Y)
    P = "ta_"
    # ---- the pedestal: an octagonal foot with anchor bolts, the battered body, four gussets on the diagonals, an access
    # hatch with a status lamp, the slew ring with its red band
    Acc.of("dark", 0.06).put(cyl(0, 0.225, 0, 2.5, 0.45, 8, rot=(0, OCT, 0)))
    for i in range(8):
        a = TAU * i / 8 + OCT
        Acc.of("steel", 0.0).put(cyl(math.sin(a) * 2.2, 0.49, math.cos(a) * 2.2, 0.09, 0.08, 6))
    PR = lambda y: 2.15 - 0.55 * (y - 0.45) / 2.15            # the pedestal's vertex radius at y
    Acc.of("body", 0.08).put(cyl(0, 0.45 + 2.15 / 2, 0, 2.15, 2.15, 8, rt=1.6, rot=(0, OCT, 0)))
    slope = math.atan(0.55 * math.cos(OCT) / 2.15)
    for i in range(4):
        a = TAU * i / 4 + math.pi / 4
        fin = extrude([(1.5, 0.45), (2.2, 0.45), (1.5, 1.6)], 0.18, axis="x")   # (z radial, y)
        Acc.of("steel", 0.03).put(xf(fin, (0, 0, 0), (0, a, 0)))
    flat = lambda y: PR(y) * math.cos(OCT)
    for i in range(8):                                          # corner ribs, and a dark collar under the slew ring
        a = TAU * i / 8 + OCT
        d = Vector((math.sin(a), 0, math.cos(a)))
        Acc.of("steel", 0.02).put(tube([tuple(d * (PR(y) - 0.03) + Vector((0, y, 0))) for y in (0.45, 2.3)], [0.08, 0.07], 6, True))
    Acc.of("dark", 0.03).put(cyl(0, 2.45, 0, PR(2.3) + 0.03, 0.3, 8, rt=PR(2.6) + 0.03, rot=(0, OCT, 0)))
    Acc.of("dark", 0.02).put(box(0, 1.35, flat(1.35) - 0.005, 0.9, 1.1, 0.04, rot=(-slope, 0, 0)))
    Acc.of("hazard", 0.0).put(box(0, 0.62, flat(0.62) + 0.01, 1.3, 0.12, 0.02, rot=(-slope, 0, 0)))
    Acc.of("amber", 0.0).put(box(0, 2.05, flat(2.05) + 0.01, 0.32, 0.1, 0.02, rot=(-slope, 0, 0)))
    Acc.of("steel", 0.04).put(cyl(0, 2.8, 0, 1.72, 0.4, 24))
    Acc.of("red", 0.0).put(xf(cylinder(1.73, 1.73, 0.1, 24, open_ended=True)[:2], (0, 2.72, 0)))
    flush(root, P + "base_")

    # ---- the head: a sloped armoured shell (lower and upper glacis, flat roof, a bustle), side armour, cheek brackets
    # carrying the trunnion, ammo boxes with belt chutes into the shell, a roof sight, a radar mast, a whip
    head = pivot(P + "head", (0, HEAD_Y, 0), root, role="head")
    RF, W = 1.25, 2.9                                           # the roof's height, the shell's width
    shell = [(-1.75, -0.1), (1.1, -0.1), (1.38, 0.35), (0.86, RF), (-1.32, RF), (-1.75, 0.9)]   # (z, y), side view
    TZ = 1.38 - 0.52 * (0.62 - 0.35) / (RF - 0.35) + 0.04        # the trunnion: on the upper glacis at y 0.62
    H = lambda slot, ink: Acc.of(slot, ink, parent=head)
    H("body", 0.06).put(extrude(shell, W, axis="x"))
    H("panel", 0.0).put(box(0, RF + 0.01, -0.25, W - 0.2, 0.02, 1.9))           # (roof plate, on the roof)
    H("lens", 0.0).put(box(0, RF + 0.002, 0.74, W - 0.4, 0.02, 0.08))          # (a lit strip at the roof's front edge)
    for s in (-1, 1):
        H("steel", 0.03).put(box(s * (W / 2 + 0.06), 0.45, -0.3, 0.12, 0.95, 2.2))   # side armour
        H("body", 0.04).put(box(s * 0.92, 0.6, TZ, 0.24, 0.8, 0.62))            # cheek bracket
        H("steel", 0.02).put(cyl(s * 0.92, 0.62, TZ, 0.17, 0.3, 10, rot=Z90))   # trunnion pin
        H("steel", 0.04).put(box(s * (W / 2 + 0.37), 0.47, -0.6, 0.5, 0.8, 1.2))   # ammo box
        H("body", 0.0).put(box(s * (W / 2 + 0.37), 0.7, -0.6, 0.52, 0.1, 1.22))   # (its band)
        H("dark", 0.02).put(path_tube([(s * (W / 2 + 0.37), 0.87, -0.25), (s * (W / 2 + 0.35), 1.02, 0.0), (s * (W / 2 + 0.17), 0.95, 0.28), (s * (W / 2 - 0.02), 0.78, 0.38)], 0.09, 6))
    # roof sight: a box with a red lens; radar mast; whip with a faction lamp
    H("dark", 0.03).put(box(0.72, RF + 0.21, 0.15, 0.5, 0.42, 0.6))
    H("red", 0.0).put(cyl(0.72, RF + 0.23, 0.455, 0.12, 0.02, 12, rot=X90))
    H("steel", 0.02).put(cyl(-0.7, RF + 0.25, -0.8, 0.07, 0.5, 8))
    radar = spinner(P + "radar", (-0.7, RF + 0.5, -0.8), head, "y", 1.6)
    Acc.of("dark", 0.02, parent=radar).put(box(0, 0.2, 0, 0.9, 0.36, 0.08, rot=(-0.3, 0, 0)))
    Acc.of("steel", 0.0, parent=radar).put(cyl(0, 0.05, 0, 0.1, 0.1, 8))
    Acc.of("amber", 0.0, parent=radar).put(box(0, 0.2, 0.045, 0.8, 0.05, 0.01, rot=(-0.3, 0, 0)))
    H("tire", 0.0).put(cyl(-1.05, RF + 0.7, -1.15, 0.03, 1.4, 5, rt=0.02))
    H("lens", 0.0).put(ball(-1.05, RF + 1.43, -1.15, 0.09, 8, 6))

    # ---- the guns, on the trunnion: a drum mantlet, two barrels with recoil sleeves, a clamp, slotted muzzle brakes
    gun = pivot(P + "gun", (0, 0.62, TZ), head, role="barrel")
    G = lambda slot, ink: Acc.of(slot, ink, parent=gun)
    G("dark", 0.05).put(cyl(0, 0, 0, 0.48, 1.56, 16, rot=Z90))
    G("steel", 0.0).put(cyl(0, 0, 0, 0.3, 1.6, 12, rot=Z90))                   # (the mantlet's end caps' bosses)
    for i, sx in enumerate((-0.38, 0.38)):
        G("tire", 0.03).put(cyl(sx, 0, 1.8, 0.14, 3.0, 10, rt=0.12, rot=X90))
        G("steel", 0.03).put(cyl(sx, 0, 0.85, 0.21, 0.9, 10, rot=X90))
        G("steel", 0.02).put(cyl(sx, 0, 3.32, 0.2, 0.46, 10, rot=X90))
        for zz in (3.22, 3.42):
            G("dark", 0.0).put(box(sx, 0, zz, 0.42, 0.1, 0.07))               # (brake ports, through the brake)
        pivot(P + f"muzzle{i}", (sx, 0, 3.58), gun, role="muzzle", index=i)
    G("steel", 0.02).put(box(0, 0, 2.2, 0.95, 0.16, 0.2))
    flush(root, P + "head_")
    return root


# =====================================================================================================================
# B: "Aegis"
# =====================================================================================================================
def build_b():
    root = pivot("turret_b", (0, 0, 0), None, draft="b", headY=HEAD_Y)
    P = "tb_"
    # ---- the pedestal: a round foot, a lathe tapering to the slew ring, six ribs, a door with a lamp, a red band
    Acc.of("dark", 0.06).put(lathe([(0.0, 0.0), (2.5, 0.0), (2.5, 0.35), (2.3, 0.45), (0.0, 0.45)], 24))
    ped = [(0.0, 0.45), (2.05, 0.45), (1.95, 0.7), (1.45, 1.9), (1.3, 2.55), (1.42, 2.62), (1.42, 2.95), (0.0, 2.95)]
    Acc.of("body", 0.07).put(lathe(ped, 24))
    rad = lambda y: 1.95 + (1.45 - 1.95) * (y - 0.7) / 1.2 if y <= 1.9 else 1.45 + (1.3 - 1.45) * (y - 1.9) / 0.65
    for i in range(6):
        a = TAU * i / 6 + TAU / 12
        d = Vector((math.sin(a), 0, math.cos(a)))
        pts = [d * (rad(y) - 0.02) + Vector((0, y, 0)) for y in (0.7, 1.9, 2.55)]
        Acc.of("steel", 0.03).put(tube([tuple(p) for p in pts], [0.09, 0.09, 0.08], 6, True))
    sl = math.atan((1.95 - 1.45) / 1.2)
    Acc.of("dark", 0.02).put(box(0, 1.2, rad(1.2) + 0.01, 0.8, 0.9, 0.04, rot=(-sl, 0, 0)))
    Acc.of("amber", 0.0).put(box(0, 1.75, rad(1.75) + 0.015, 0.26, 0.08, 0.02, rot=(-sl, 0, 0)))
    Acc.of("red", 0.0).put(xf(cylinder(1.43, 1.43, 0.12, 24, open_ended=True)[:2], (0, 2.78, 0)))
    Acc.of("steel", 0.04).put(cyl(0, 3.02, 0, 1.5, 0.14, 24))
    flush(root, P + "base_")

    # ---- the head: the turntable, the yoke (two arms and a brace), equipment pods outside the arms, a cable loom
    head = pivot(P + "head", (0, HEAD_Y, 0), root, role="head")
    H = lambda slot, ink: Acc.of(slot, ink, parent=head)
    H("steel", 0.04).put(cyl(0, 0.0, 0, 1.45, 0.2, 24))
    H("dark", 0.04).put(cyl(0, 0.2, 0, 1.38, 0.2, 24))
    TY = 1.35                                                   # the trunnion's height in the head
    for s in (-1, 1):
        arm = [(-0.55, 0.3), (0.55, 0.3), (0.38, TY + 0.25), (-0.38, TY + 0.25)]   # (z, y), tapering up
        H("body", 0.05).put(xf(extrude(arm, 0.22, axis="x"), (s * 0.97, 0, 0)))
        H("steel", 0.02).put(cyl(s * 0.97, TY, 0, 0.2, 0.3, 12, rot=Z90))        # trunnion bearing
        H("body", 0.04).put(box(s * 1.33, 0.75, -0.1, 0.5, 0.75, 0.8))          # equipment pod
        H("dark", 0.0).put(box(s * 1.585, 0.75, -0.1, 0.02, 0.5, 0.6))          # (its vent panel, on the pod)
        H("lens", 0.0).put(box(s * 1.33, 1.135, -0.1, 0.4, 0.02, 0.06))         # (a lit strip on its top)
    H("body", 0.04).put(box(0, 0.48, -0.5, 1.72, 0.28, 0.3))                     # brace between the arms
    H("dark", 0.02).put(path_tube([(1.2, 0.95, -0.4), (1.05, 1.1, -0.45), (1.0, 1.25, -0.3)], 0.06, 6))

    # ---- the elevating mass, on the trunnion: the radome over the gun housing, the six-barrel rotor, the ammo drum, an
    # IR camera on the housing's side
    gun = pivot(P + "gun", (0, TY, 0), head, role="barrel")
    G = lambda slot, ink: Acc.of(slot, ink, parent=gun)
    dome = [(0.0, 0.1), (0.78, 0.1), (0.8, 0.9), (0.74, 1.2), (0.58, 1.46), (0.32, 1.63), (0.0, 1.69)]
    G("white", 0.05).put(lathe(dome, 20))
    G("body", 0.0).put(xf(cylinder(0.792, 0.794, 0.14, 20, open_ended=True)[:2], (0, 0.32, 0)))
    G("steel", 0.03).put(cyl(0, 0.04, 0, 0.66, 0.1, 20))                        # the dome's base ring
    G("dark", 0.04).put(box(0, -0.3, 0.15, 0.7, 0.62, 1.2))                     # gun housing
    G("steel", 0.02).put(cyl(0, -0.62, -0.1, 0.3, 0.66, 14, rot=Z90))           # ammo drum
    G("dark", 0.02).put(box(0.38, -0.12, 0.45, 0.14, 0.24, 0.3))               # IR camera
    G("red", 0.0).put(cyl(0.38, -0.12, 0.605, 0.07, 0.02, 10, rot=X90))
    rotor = spinner(P + "rotor", (0, -0.3, 0.75), gun, "z", 0.0)
    R = lambda slot, ink: Acc.of(slot, ink, parent=rotor)
    R("steel", 0.02).put(cyl(0, 0, 0.12, 0.27, 0.3, 14, rot=X90))                # breech drum
    for i in range(6):
        a = TAU * i / 6
        R("tire", 0.015).put(cyl(math.cos(a) * 0.14, math.sin(a) * 0.14, 1.2, 0.045, 2.2, 6, rot=X90))
    R("steel", 0.02).put(cyl(0, 0, 1.55, 0.23, 0.1, 14, rot=X90))               # barrel clamp
    R("steel", 0.02).put(cyl(0, 0, 2.2, 0.22, 0.22, 14, rot=X90))               # muzzle shroud
    R("tire", 0.0).put(cyl(0, 0, 2.312, 0.17, 0.01, 14, rot=X90))               # (its open end, on the shroud)
    pivot(P + "muzzle0", (0, -0.3, 0.75 + 2.4), gun, role="muzzle", index=0)
    flush(root, P + "head_")
    return root


made_a = build_a()
made_b = build_b()
for r in (made_a, made_b):
    objs = [r] + list(r.children_recursive)
    print(f"{r.name}: {tri_count([o for o in objs if o.type == 'MESH'])} tris, {len([o for o in objs if o.type == 'MESH'])} meshes")
_clash = [o.name for o in C.objects if o.name[-4:-3] == "." and o.name[-3:].isdigit()]
assert not _clash, f"object names must be unique, Blender renamed {_clash[:3]}"
if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, list(C.objects))
