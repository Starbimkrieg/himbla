# The courier's skinned-suit drafts (runner_skin.py), posed as the game poses him and rendered: docs/runner-skin/.
#
#   RUNNER_SKIN=a MOONRUNNER_REPO=. python3 tools/blender/preview_runner.py      (b for the other; RUNNER_SKIN unset: as built)
#
# Builds the courier (build_runner.py) in a fresh scene, sets his pivots as the game's animation code sets them (three.js
# Euler angles; the poses below are player.js's at the moments named, the light-bike's from build_courier.py, the weapon
# holds solved as weaponView.js solves them), and moves every skinned vertex by its weights' blend of its pivots' moves from
# rest (linear blend skinning: what three.js's SkinnedMesh does). Cycles on the CPU, Freestyle for the ink.
# PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set the quality; RUNNER_POSES=run,skate renders some.

import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KIND = os.environ.get("RUNNER_SKIN", "") or "rigid"
OUT = os.path.join(REPO, "docs", "runner-skin")
os.makedirs(OUT, exist_ok=True)
RES = (int(os.environ.get("PREVIEW_W", 520)), int(os.environ.get("PREVIEW_H", 640)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 24))
ONLY = [v for v in os.environ.get("RUNNER_POSES", "").split(",") if v]
GLOWS = {"glow": 6.0, "lens": 6.0, "glint": 8.0, "skate": 5.0}
EXTRAS = ("padL", "padR", "band", "crest", "antenna")
P3 = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))                  # three.js axes -> Blender's (tb)


def R3(x=0.0, y=0.0, z=0.0, order="XYZ"):
    """a three.js Euler as a Blender rotation matrix"""
    m = {"X": Matrix.Rotation(x, 3, "X"), "Y": Matrix.Rotation(y, 3, "Y"), "Z": Matrix.Rotation(z, 3, "Z")}
    r = Matrix.Identity(3)
    for a in order:
        r = r @ m[a]
    return P3 @ r @ P3.transposed()


# ---- scene ----
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device, sc.cycles.samples, sc.cycles.use_denoising = "CPU", SAMPLES, True
sc.render.resolution_x, sc.render.resolution_y = RES
sc.render.image_settings.file_format, sc.render.image_settings.quality = "JPEG", 90
sc.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w"); w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.09, 0.07, 0.17, 1)
sc.world = w
for name, loc, energy, col in (("key", (5, -6, 7), 900, (1.0, 0.95, 0.88)), ("fill", (-6, -3, 3), 350, (0.55, 0.6, 1.0)), ("rim", (-2, 6, 4), 500, (1.0, 0.7, 0.9))):
    d = bpy.data.lights.new(name, "AREA"); d.energy, d.size, d.color = energy, 4, col
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
    o.location = loc; o.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()

# ---- the courier ----
os.environ["MOONRUNNER_EXPORT"] = "0"
B = {"__file__": os.path.join(REPO, "tools", "blender", "build_runner.py")}
exec(open(B["__file__"], encoding="utf-8").read(), B)
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
ground = bpy.context.object


def shade(m, rgb, glow=0.0, rough=0.45):
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if glow:
        n = nt.nodes.new("ShaderNodeEmission"); n.inputs["Color"].default_value = (*rgb, 1); n.inputs["Strength"].default_value = glow
    else:
        n = nt.nodes.new("ShaderNodeBsdfPrincipled"); n.inputs["Base Color"].default_value = (*rgb, 1); n.inputs["Roughness"].default_value = rough
    nt.links.new(n.outputs[0], out.inputs[0])


for m in bpy.data.materials:
    n = m.name.split(".")[0]
    c = tuple(m.diffuse_color[:3])
    shade(m, c, GLOWS.get(n, 0.0), 0.3 if n == "visor" else 0.45)
gm = bpy.data.materials.new("ground"); shade(gm, (0.12, 0.1, 0.17), 0.0, 0.9); ground.data.materials.append(gm)


def parents(o):
    p = o.parent
    while p is not None:
        yield p
        p = p.parent


PIV = {o.name: o for o in bpy.data.objects if o.type == "EMPTY"}
for o in bpy.data.objects:
    if o.type == "MESH" and any(p.name in EXTRAS + ("scarfLinks",) for p in parents(o)):
        o.hide_render = True                                     # (outfit extras; the scarf, which the game swings, hangs out straight at rest)
REST = {n: o.matrix_basis.copy() for n, o in PIV.items()}
bpy.context.view_layer.update()
REST_W = {n: o.matrix_world.copy() for n, o in PIV.items()}
SKINNED = [o for o in bpy.data.objects if o.type == "MESH" and o.get("skin")]
SK = []                                                          # (object, rest verts N x 3, weights N x k, pivot names)
for o in SKINNED:
    names = [g.name for g in o.vertex_groups]
    Wt = np.zeros((len(o.data.vertices), len(names)))
    for v in o.data.vertices:
        for g in v.groups:
            Wt[v.index, g.group] = g.weight
    s = Wt.sum(1)
    Wt[s < 1e-6, names.index("torso")] = 1.0                     # (unweighted: the torso's)
    Wt /= Wt.sum(1, keepdims=True)
    V = np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices])
    o.matrix_world = Matrix.Identity(4)
    SK.append((o, V, Wt, names))
print("skinned meshes:", [o.name for o, *_ in SK])

# ---- ink ----
noink = bpy.data.collections.new("NoInk"); sc.collection.children.link(noink); noink.objects.link(ground)
sc.render.use_freestyle, sc.render.line_thickness = True, 1.3
vl = sc.view_layers[0]; vl.use_freestyle = True
ls = vl.freestyle_settings.linesets[0] if vl.freestyle_settings.linesets else vl.freestyle_settings.linesets.new("ink")
ls.select_silhouette = ls.select_border = True
ls.select_crease = False                                         # (the game inks silhouettes, not a mesh's creases)
ls.select_by_collection, ls.collection, ls.collection_negation = True, noink, "EXCLUSIVE"
ls.linestyle = ls.linestyle or bpy.data.linestyles.new("ink")
ls.linestyle.color, ls.linestyle.thickness = (0.02, 0.01, 0.06), 1.6


def set_pose(pose):
    for n, o in PIV.items():
        o.matrix_basis = REST[n].copy()
    for n, r in pose.items():
        if n == "drop":
            continue
        o = PIV[n]
        loc = REST[n].to_translation()
        if isinstance(r, tuple) and len(r) == 2 and isinstance(r[1], Vector):  # (rotation, a move in three axes)
            r, mv = r
            loc = loc + P3 @ mv
        o.matrix_basis = Matrix.Translation(loc) @ r.to_4x4()
    bpy.context.view_layer.update()
    # the skates on the ground
    low = min((o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" and not o.hide_render and not o.get("skin")
              and any(p.name in ("shinL", "shinR") for p in parents(o)) for v in o.data.vertices)
    PIV["runner"].location.z -= low
    bpy.context.view_layer.update()
    deform()


def deform():
    D = {n: np.array(PIV[n].matrix_world @ REST_W[n].inverted()) for n in PIV}
    for o, V, Wt, names in SK:
        Vh = np.c_[V, np.ones(len(V))]
        out = np.zeros_like(V)
        for j, n in enumerate(names):
            w = Wt[:, j]
            if not w.any():
                continue
            out += w[:, None] * (Vh @ D[n].T)[:, :3]
        for v, p in zip(o.data.vertices, out):
            v.co = p
        o.data.update()


# ---- arm solving for the weapon holds (as weaponView.js; the weapon hand here the +x one, as in preview_weapons.py) ----
def solve(arm, fore, target, pole):
    bpy.context.view_layer.update()
    S = arm.matrix_world.translation.copy()
    a = (fore.matrix_world.translation - S).length
    b = 0.405                                                    # (elbow to the glove's middle: build_runner.py FL)
    d = target - S
    L = min(d.length, (a + b) * 0.999)
    dn = d.normalized()
    pl = (pole - dn * pole.dot(dn)).normalized()
    ca = (a * a + L * L - b * b) / (2 * a * L)
    E = S + dn * (a * ca) + pl * (a * math.sqrt(max(0.0, 1 - ca * ca)))
    H = S + dn * L
    du, df = (E - S).normalized(), (H - E).normalized()
    front = (df - du * df.dot(du)); front = front.normalized() if front.length > 1e-4 else pl
    Zl, Yl = -du, -front
    Xl = Yl.cross(Zl)
    for o, R in ((arm, Matrix((Xl, Yl, Zl)).transposed()), (fore, Matrix((Xl, (-df).cross(Xl), -df)).transposed())):
        bpy.context.view_layer.update()
        pr = o.parent.matrix_world.to_3x3().normalized()
        o.matrix_basis = Matrix.Translation(o.matrix_basis.to_translation()) @ (pr.inverted() @ R).to_4x4()


def hold(pose, grip_off, fore_off, twist, slide):
    """a two-handed (or one-handed: fore_off None) hold: the pose, the torso turned and the shoulders rolled, the hands solved"""
    p = dict(pose)
    p["torso"] = R3(p.get("_lean", 0.0), twist, 0, "YXZ") if "_lean" in p else R3(0, twist, 0)
    for s, sx in (("L", -1), ("R", 1)):
        p["arm" + s] = (Matrix.Identity(3), Vector((-sx * 0.3 * slide, -0.25 * slide, slide)))
    set_pose({k: v for k, v in p.items() if not k.startswith("_")})
    FWD, UP, RIGHT = Vector((0, -1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0))
    Sr = PIV["armR"].matrix_world.translation.copy()
    grip = Sr + RIGHT * grip_off[0] + FWD * grip_off[1] + UP * grip_off[2]
    solve(PIV["armR"], PIV["foreR"], grip, -UP + RIGHT * 0.7 - FWD * 0.2)
    if fore_off:
        solve(PIV["armL"], PIV["foreL"], grip + FWD * fore_off[2] + UP * fore_off[1] + RIGHT * fore_off[0], -UP - RIGHT * 0.7 - FWD * 0.2)
    bpy.context.view_layer.update()
    deform()


# ---- the poses (three.js angles, as player.js sets them) ----
POSES = {
    "stand": {"armL": R3(0, 0, -0.15), "armR": R3(0, 0, 0.15)},
    # running, mid-stride (anim 0.75 pi: the left leg back and folding, the right forward, the arms swinging against them)
    "run": {"torso": R3(0.1), "legL": R3(0.64), "legR": R3(-0.64), "shinL": R3(0.86), "shinR": R3(0.12),
            "armL": R3(-0.57, 0, -0.15), "armR": R3(0.57, 0, 0.15), "foreL": R3(-0.84), "foreR": R3(-0.45)},
    # skating, full crouch: the lean you liked (player.js, skating, crouch 1)
    "skate": {"torso": R3(0.6), "legL": R3(-0.6), "shinL": R3(0.95), "legR": R3(0.3), "shinR": R3(0.55),
              "armL": R3(-0.9, 0, -0.3), "armR": R3(-0.9, 0, 0.3), "foreL": R3(-0.425), "foreR": R3(-0.425)},
    # on the light-bike (build_courier.py SPEC pose: lean 0.752, thighs -1.5 spread 0.6, knees 0.8, arms -1.179 out 0.128,
    # elbows -0.704)
    "bike": {"torso": R3(0.752), "legL": R3(-1.5, 0, -0.6, "ZYX"), "legR": R3(-1.5, 0, 0.6, "ZYX"), "shinL": R3(0.8), "shinR": R3(0.8),
             "armL": R3(-1.179, 0, -0.128, "ZYX"), "armR": R3(-1.179, 0, 0.128, "ZYX"), "foreL": R3(-0.704), "foreR": R3(-0.704)},
    "dive": {"torso": R3(0.85), "legL": R3(-0.35), "legR": R3(-0.35), "shinL": R3(0.35), "shinR": R3(0.35),
             "armL": R3(0.9, 0, -0.25), "armR": R3(0.9, 0, 0.25), "foreL": R3(-0.2), "foreR": R3(-0.2)},
}
VIEWS = {"stand": [("front", (0.4, -4.6, 1.5)), ("q34", (3.0, -3.4, 1.7)), ("back", (0.4, 4.6, 1.6))],
         "run": [("side", (4.6, 0.3, 1.4))], "skate": [("back", (0.8, 4.2, 1.6)), ("side", (4.4, -0.6, 1.3))],
         "bike": [("side", (4.4, -0.4, 1.3))], "dive": [("side", (4.4, -0.6, 1.5))],
         "aim2": [("q34", (3.2, -2.6, 1.7))], "aim1": [("q34", (3.2, -2.6, 1.7))]}
CLOSE = {"bike": [("knee", (1.6, -1.2, 1.0), (0.2, -0.45, 0.75), 55), ("elbow", (1.8, -1.4, 1.45), (0.45, -0.5, 1.3), 60)],
         "skate": [("crotch", (0.3, 1.9, 1.1), (0, 0.1, 0.85), 55)], "aim1": [("armpit", (1.6, -1.6, 1.7), (0.4, -0.2, 1.55), 60)]}
if os.environ.get("RUNNER_CLOSE") == "1":
    VIEWS = {k: [] for k in CLOSE}


def camera(loc, tgt, lens=40):
    for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(o)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = lens
    sc.collection.objects.link(cam); cam.location = loc
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); sc.camera = cam


for name, views in VIEWS.items():
    if ONLY and name not in ONLY:
        continue
    if name == "aim2":       # two hands, across the chest (the Scattergun's hold), the shoulders rolled forward
        hold({"legL": R3(-0.28), "legR": R3(0.22), "shinL": R3(0.2), "shinR": R3(0.12)}, (-0.05, 0.4, -0.3), (-0.02, 0.0, 0.24), 0.6, 0.24)
    elif name == "aim1":     # one hand, out to the side (the Disc Blaster's)
        hold({"legL": R3(-0.28), "legR": R3(0.22), "shinL": R3(0.2), "shinR": R3(0.12)}, (0.15, 0.45, -0.35), None, -0.2, 0.0)
    else:
        set_pose(POSES[name])
    for vn, loc in views:
        camera(loc, (0, 0, 1.15 if name not in ("bike", "skate") else 1.0))
        sc.render.filepath = os.path.join(OUT, f"{KIND}_{name}_{vn}.jpg")
        bpy.ops.render.render(write_still=True)
        print("rendered", KIND, name, vn)
    if os.environ.get("RUNNER_CLOSE") == "1":
        for vn, loc, tgt, lens in CLOSE.get(name, []):
            camera(loc, tgt, lens)
            sc.render.filepath = os.path.join(OUT, f"{KIND}_{name}_{vn}.jpg")
            bpy.ops.render.render(write_still=True)
            print("rendered", KIND, name, vn)
