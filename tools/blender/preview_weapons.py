# Weapon proposals: renders (build_weapons.py builds them). For each set, each weapon on its own and the courier holding it
# standing and skating, to docs/weapon-proposals/<set>_<weapon>_<view>.jpg, and a sheet per set (<set>_sheet.jpg).
#
#   MOONRUNNER_REPO=. python3 tools/blender/preview_weapons.py            every render and the sheets
#   WPN_ONLY=a_rail MOONRUNNER_REPO=. python3 tools/blender/preview_weapons.py    one weapon (set_key)
#   WPN_RENDER=0 ...                                                        poses and fit checks only
# PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set the quality. Cycles on the CPU, Freestyle for the ink.
#
# The poses: the courier (runner.glb) is posed by its pivots as the game poses it (three.js x and y rotations keep their
# signs in Blender: tb() is a quarter turn about x). The torso leans and twists (positive: left shoulder forward, a
# right-handed stance), the legs stand or skate, the skates are put on the ground, then each arm is solved to its target
# (two-bone IK, the elbow an exact hinge, so the forearm only bends the way the game's pivots can): the right hand to the
# weapon's grip, the left to its `fore` point. A target out of reach is reported (by how much); the arm then points at it.

import bpy, math, os, sys
from mathutils import Vector, Matrix

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "docs", "weapon-proposals")
os.makedirs(OUT, exist_ok=True)
RES = (int(os.environ.get("PREVIEW_W", 560)), int(os.environ.get("PREVIEW_H", 560)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 24))
ONLY = [v for v in os.environ.get("WPN_ONLY", "").split(",") if v]
SETS = [v for v in os.environ.get("WPN_SETS", "a,b,pick").split(",") if v]
RENDER = os.environ.get("WPN_RENDER", "1") == "1"
RUNNER_EXTRAS = ("padL", "padR", "band", "crest", "antenna")
RUNNER_GLOW = {"glow": 6.0, "lens": 6.0, "glint": 8.0}

# blender axes: the courier faces -y; x is his right, z up
FWD, UP, RIGHT = Vector((0, -1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0))

# how each hold sets the body: torso twist (left shoulder forward) and the grip's place from the posed right shoulder
# (right, forward, up, metres); `free`: the left hand's place from the left shoulder when the weapon is one-handed
HOLDS = {
    "pistol": {"twist": -0.25, "grip": (-0.08, 0.55, -0.12), "free": (-0.22, 0.12, -0.5)},
    "wrist": {"twist": -0.25, "grip": (-0.08, 0.55, -0.08), "free": (-0.22, 0.12, -0.5)},
    # two hands: the shoulders roll forward and in (`slide`): from where they stand, no spot in front of the chest is in
    # both hands' reach, so the hands met inside the torso. Searched (twist, slide, grip; standing and skating together)
    # for no arm deeper than 1.5 cm in the body (half an ink line) with both hands on
    "chest": {"twist": 0.6, "slide": 0.24, "grip": (-0.2, 0.4, -0.3)},
    "under": {"twist": 0.6, "slide": 0.24, "grip": (-0.2, 0.4, -0.3)},
    "shoulder": {"twist": 0.7, "grip": (-0.16, 0.22, -0.27)},
}
STANCES = {   # torso lean, body drop, (thigh, shin) left and right: three.js rotation.x (thigh negative: forward)
    "stand": {"lean": 0.06, "drop": 0.0, "legL": (-0.28, 0.2), "legR": (0.22, 0.12)},
    "skate": {"lean": 0.42, "drop": 0.2, "legL": (-0.6, 0.95), "legR": (0.3, 0.55)},
}


def tb(p):
    return Vector((p[0], -p[2], p[1]))


def toon(m, rgb, rough=0.4, metallic=0.0):
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    nt.links.new(b.outputs[0], out.inputs[0])


def emissive(m, rgb, strength):
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.09, 0.07, 0.17, 1)
    sc.world = w
    for name, loc, energy, col in (("key", (5, -6, 7), 900, (1.0, 0.95, 0.88)), ("fill", (-6, -3, 3), 350, (0.55, 0.6, 1.0)), ("rim", (-2, 6, 4), 500, (1.0, 0.7, 0.9))):
        d = bpy.data.lights.new(name, "AREA")
        d.energy, d.size, d.color = energy, 4, col
        o = bpy.data.objects.new(name, d)
        sc.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    g = bpy.context.object
    gm = bpy.data.materials.new("ground")
    toon(gm, (0.12, 0.1, 0.17), 0.9)
    g.data.materials.append(gm)
    return sc, g


def freestyle(sc, skip):
    noink = bpy.data.collections.new("NoInk")
    sc.collection.children.link(noink)
    for o in skip:
        noink.objects.link(o)
    sc.render.use_freestyle = True
    sc.render.line_thickness = 1.3
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    ls = vl.freestyle_settings.linesets.new("ink") if not vl.freestyle_settings.linesets else vl.freestyle_settings.linesets[0]
    ls.select_silhouette = ls.select_crease = ls.select_border = True
    ls.select_by_collection = True
    ls.collection = noink
    ls.collection_negation = "EXCLUSIVE"
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.linestyle.color = (0.02, 0.01, 0.06)
    ls.linestyle.thickness = 1.6


def camera(sc, loc, target, lens):
    for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(o)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = lens
    sc.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam


def render(sc, name):
    if RENDER:
        sc.render.filepath = os.path.join(OUT, name + ".jpg")
        bpy.ops.render.render(write_still=True)
        print("rendered", name)


# ---------------------------------------------------------------------------------------------------------------------
# the courier and his pose
# ---------------------------------------------------------------------------------------------------------------------
def import_runner():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, "src", "assets", "runner.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    P = {o.name.split(".")[0]: o for o in new if o.type == "EMPTY"}
    for o in new:
        o.rotation_mode = "XYZ"
        p = o.parent
        while p is not None:                                                  # the outfit extras: not worn
            if p.name.split(".")[0] in RUNNER_EXTRAS:
                o.hide_render = True
                break
            p = p.parent
    for m in {s.material for o in new if o.type == "MESH" for s in o.material_slots if s.material}:
        n = m.name.split(".")[0]
        bsdf = next((x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED"), None) if m.node_tree else None
        c = tuple(bsdf.inputs["Base Color"].default_value[:3]) if bsdf else tuple(m.diffuse_color[:3])
        if n in RUNNER_GLOW:
            emissive(m, c, RUNNER_GLOW[n])
        else:
            toon(m, c, 0.45)
    rest = {o: o.matrix_basis.copy() for o in new}
    return P, new, rest


def set_world_rot(o, R):
    """turn o so its world rotation is R (3x3), keeping its place in its parent"""
    bpy.context.view_layer.update()
    pr = o.parent.matrix_world.to_3x3().normalized() if o.parent else Matrix.Identity(3)
    loc = o.matrix_basis.to_translation()
    o.matrix_basis = Matrix.Translation(loc) @ (pr.inverted() @ R).to_4x4()


def solve_arm(P, side, target, pole):
    """two-bone IK: arm<side> to reach `target` (world) with the glove's middle; the elbow bends toward `pole`. Returns
    the shortfall (m), 0 if reached."""
    arm, fore = P["arm" + side], P["fore" + side]
    bpy.context.view_layer.update()
    S = arm.matrix_world.translation.copy()
    k = arm.matrix_world.to_scale()[0]
    a = (fore.matrix_world.translation - S).length                          # shoulder to elbow
    b = 0.325 * k                                                            # elbow to the glove's middle
    d = target - S
    L = d.length
    short = max(0.0, L - (a + b) * 0.999)
    L = min(L, (a + b) * 0.999)
    dn = d.normalized()
    pl = (pole - dn * pole.dot(dn)).normalized()                             # the bend's direction, square to the reach
    ca = (a * a + L * L - b * b) / (2 * a * L)                               # the shoulder's angle off the reach (law of cosines)
    sa = math.sqrt(max(0.0, 1 - ca * ca))
    E = S + dn * (a * ca) + pl * (a * sa)
    H = S + dn * L
    du, df = (E - S).normalized(), (H - E).normalized()
    # the hinge: the elbow turns about the arm's local x; the forearm swings toward the arm's local front (three.js +z,
    # Blender -y), so that front is the forearm's direction square to the upper arm
    front = df - du * df.dot(du)
    if front.length < 1e-4:
        front = pl.copy()
    front.normalize()
    Zl, Yl = -du, -front                                                     # local -z along the bone, local -y its front
    Xl = Yl.cross(Zl)
    set_world_rot(arm, Matrix((Xl, Yl, Zl)).transposed())
    Zf = -df
    Yf = Zf.cross(Xl)
    set_world_rot(fore, Matrix((Xl, Yf, Zf)).transposed())
    return short


def pose(P, new, rest, stance, hold):
    for o, m in rest.items():
        o.matrix_basis = m.copy()
    st, ho = STANCES[stance], HOLDS[hold]
    P["torso"].matrix_basis = Matrix.Translation(P["torso"].matrix_basis.to_translation()) @ (Matrix.Rotation(ho["twist"], 3, "Z") @ Matrix.Rotation(st["lean"], 3, "X")).to_4x4()
    # the shoulders roll forward and in (`slide`, metres, in the torso's frame: the arms keep their length)
    sl = ho.get("slide", 0.0)
    for side, sx in (("L", -1), ("R", 1)):
        A = P["arm" + side]
        A.matrix_basis = Matrix.Translation(rest[A].to_translation() + Vector((-sx * 0.3 * sl, -sl, -0.25 * sl))) @ rest[A].to_3x3().to_4x4()
    for side in ("L", "R"):
        th, sh = st["leg" + side]
        P["leg" + side].matrix_basis = Matrix.Translation(P["leg" + side].matrix_basis.to_translation()) @ Matrix.Rotation(th, 4, "X")
        P["shin" + side].matrix_basis = Matrix.Translation(P["shin" + side].matrix_basis.to_translation()) @ Matrix.Rotation(sh, 4, "X")
    # the skates on the ground: the lowest point of the legs at z = 0
    root = P["runner"]
    bpy.context.view_layer.update()
    low = min((o.matrix_world @ v.co).z for o in new if o.type == "MESH" and not o.hide_render and any(p is P["legL"] or p is P["legR"] for p in parents(o)) for v in o.data.vertices)
    root.location.z -= low
    bpy.context.view_layer.update()


def parents(o):
    p = o.parent
    while p is not None:
        yield p
        p = p.parent


def hold_weapon(P, wroot, hold):
    """place the weapon and solve both arms to it; returns the shortfalls"""
    ho = HOLDS[hold]
    bpy.context.view_layer.update()
    Sr, Sl = P["armR"].matrix_world.translation.copy(), P["armL"].matrix_world.translation.copy()
    off = ho["grip"]
    grip = Sr + RIGHT * off[0] + FWD * off[1] + UP * off[2]
    pole_r = (-UP * 1.0 + RIGHT * 0.7 - FWD * 0.2)
    pole_l = (-UP * 1.0 - RIGHT * 0.7 - FWD * 0.2)
    shorts = {}
    if hold == "wrist":
        shorts["R"] = solve_arm(P, "R", grip, pole_r)
        bpy.context.view_layer.update()
        F = P["foreR"].matrix_world
        k = F.to_scale()[0]
        R3 = F.to_3x3().normalized()
        glove = F @ (tb((0, -0.325, 0.0)))
        # the weapon's frame is the forearm's: its +z (Blender -y) toward the hand, its +y (Blender z) the forearm's front
        zf = (R3 @ Vector((0, 0, -1))).normalized()                          # along the forearm toward the hand
        yf = (R3 @ Vector((0, -1, 0))).normalized()                          # the forearm's front (knuckles)
        # its Blender columns: right (three.js x = y cross z), back (-z), up (y)
        xw = yf.cross(zf).normalized()
        Rw = Matrix((xw, -zf, yf)).transposed()
        wroot.matrix_world = Matrix.Translation(glove) @ Rw.to_4x4() @ Matrix.Scale(k, 4)
    else:
        wroot.matrix_world = Matrix.Translation(grip)
        shorts["R"] = solve_arm(P, "R", grip, pole_r)
    bpy.context.view_layer.update()
    if "fore" in wroot:
        shorts["L"] = solve_arm(P, "L", wroot.matrix_world @ tb(wroot["fore"]), pole_l)
    else:
        f = ho["free"]
        shorts["L"] = solve_arm(P, "L", Sl + RIGHT * f[0] + FWD * f[1] + UP * f[2], pole_l)
    bpy.context.view_layer.update()
    return shorts


CLIP_REST = {}


def clip(P, new, rest=False):
    """how far the arms go into the body: each body part is a closed mesh, and an arm vertex is inside one when a ray
    from it crosses that part an odd number of times. Returns the deepest (m, to the part's nearest surface), how many
    vertices are in, and where. Vertices already inside at rest (the shoulder balls sit in the torso by design) don't
    count: clip(rest=True) in the rest pose records them."""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    arms = {P[n] for n in ("armL", "armR")}
    def under(o, roots):
        return any(p in roots for p in parents(o))
    parts = []
    for o in new:
        if o.type == "MESH" and not o.hide_render and under(o, {P["torso"]}) and not under(o, arms) and not under(o, {P["head"]}):
            m = o.matrix_world
            vs = [m @ v.co for v in o.data.vertices]
            lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
            hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
            parts.append((o.name.split(".")[0], BVHTree.FromPolygons(vs, [tuple(f.vertices) for f in o.data.polygons]), lo, hi))
    def inside(T, p):
        n, q, d = 0, p.copy(), Vector((0.577, 0.577, 0.577))
        for _ in range(40):
            hit = T.ray_cast(q, d, 5.0)
            if hit[0] is None:
                break
            n += 1
            q = hit[0] + d * 1e-4
        return n % 2 == 1
    worst, cnt, where = 0.0, 0, ""
    for o in new:
        if o.type != "MESH" or o.hide_render or not under(o, arms):
            continue
        m = o.matrix_world
        for v in o.data.vertices:
            key = (o.name, v.index)
            if not rest and key in CLIP_REST:
                continue
            p = m @ v.co
            for name, T, lo, hi in parts:
                if lo.x <= p.x <= hi.x and lo.y <= p.y <= hi.y and lo.z <= p.z <= hi.z and inside(T, p):
                    if rest:
                        CLIP_REST[key] = True
                        break
                    d = (T.find_nearest(p)[0] - p).length
                    cnt += 1
                    if d > worst:
                        worst, where = d, f"{o.name.split('.')[0]} in {name}"
                    break
    return round(worst, 3), cnt, where


# ---------------------------------------------------------------------------------------------------------------------
sc, ground = scene_setup()
B = {"__file__": os.path.join(REPO, "tools", "blender", "build_weapons.py")}
os.environ["MOONRUNNER_REPO"] = REPO
os.environ["MOONRUNNER_EXPORT"] = "0"                                         # (the builder exports the pick otherwise)
exec(open(B["__file__"], encoding="utf-8").read(), B)
for s, hx in B["HEX"].items():                                               # weapon materials: lit slots glow
    m = bpy.data.materials.get(s)
    if m:
        (emissive(m, B["SLOT_COLORS"][s], 5.0) if s in B["GLOW"] else toon(m, B["SLOT_COLORS"][s], 0.35 if s.endswith(("dark", "body", "rubber")) else 0.5, 0.3 if s in ("metal", "steel") else 0.0))
P, rnew, rrest = import_runner()
clip(P, rnew, rest=True)                                                     # what's inside already at rest
freestyle(sc, [ground])
weapons = {g.root.name: g.root for lst in B["WEAPONS"].values() for g in lst}
meshes_of = {n: [o for o in bpy.data.objects if o.type == "MESH" and r in parents(o)] for n, r in weapons.items()}


def show(name):
    for n, ms in meshes_of.items():
        for o in ms:
            o.hide_render = n != name


def show_runner(on):
    for o in rnew:
        if o.type == "MESH":
            o.hide_render = not on or any(p.name.split(".")[0] in RUNNER_EXTRAS for p in parents(o))


report = []
for name, wr in weapons.items():
    tag = name[4:]                                                           # a_pulse, pick_rail
    if (ONLY and tag not in ONLY) or tag.split("_")[0] not in SETS:
        continue
    hold = wr["hold"]
    show(name)
    # the weapon alone, three-quarter from its right and a little in front
    show_runner(False)
    wr.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in meshes_of[name] for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c, size = (lo + hi) / 2, (hi - lo).length
    wr.location = Vector((0, 0, 1.2)) - c + wr.location
    bpy.context.view_layer.update()
    camera(sc, Vector((0, 0, 1.2)) + Vector((1.0, -0.62, 0.42)).normalized() * size * 1.55, (0, 0, 1.2), 50)
    render(sc, f"{tag}_model")
    # held: standing and skating
    show_runner(True)
    for stance in ("stand", "skate"):
        pose(P, rnew, rrest, stance, hold)
        sh = hold_weapon(P, wr, hold)
        report.append((tag, stance, {k: round(v, 3) for k, v in sh.items()}, "clip", clip(P, rnew)))
        hz = 1.25 if stance == "stand" else 1.05
        camera(sc, (3.6, -1.7, hz + 0.45), (0.05, -0.4, hz - 0.05), 40)       # from his right, a little ahead: the weapon side on
        render(sc, f"{tag}_{stance}")
for r in report:
    print("fit", *r)

if RENDER and not ONLY:
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
    names = {"pulse": "PULSE SPINNER", "scatter": "VOSTOK SCATTERGUN", "rail": "DAEDALUS RAIL LANCE", "mortar": "RUSTMOON JUNK MORTAR"}
    for set_, title in [(k, t) for k, t in (("a", "SET A · ISSUE"), ("b", "SET B · SIGNATURE"), ("pick", "THE PICK · SPACECOM SPINNER, A'S SCATTERGUN, A + B LANCE, B'S MORTAR")) if k in SETS]:
        w, h, lab = 420, 420, 30
        sheet = Image.new("RGB", (w * 4, lab + (h + lab) * 3), (14, 10, 26))
        d = ImageDraw.Draw(sheet)
        d.text((8, 5), title, fill=(255, 210, 63), font=font)
        for i, k in enumerate(("pulse", "scatter", "rail", "mortar")):
            for j, v in enumerate(("model", "stand", "skate")):
                x, y = i * w, lab + j * (h + lab)
                d.text((x + 8, y + 5), f"{names[k]} · {v.upper()}", fill=(240, 230, 255), font=font)
                p = os.path.join(OUT, f"{set_}_{k}_{v}.jpg")
                if os.path.isfile(p):
                    sheet.paste(Image.open(p).resize((w, h)), (x, y + lab))
        sheet.save(os.path.join(OUT, f"{set_}_sheet.jpg"), quality=88)
        print("sheet", set_)
