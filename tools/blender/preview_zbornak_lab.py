# Review renders for the Antimatter Lab draft (build_zbornak_lab.py): builds it, dresses it for Cycles (glow slots lit, glass
# see-through, the screens painted with their pictures), stands real chimeras in the pods, on the bench and in the corral
# (GLBs exported from the game by tools/zbornak-chimeras.mjs), the courier where the views want one, stone couriers on the
# gallery's plinths, and renders each view in CAMS to docs/zbornak-proposals/<view>.jpg; the robots at work to robots.gif;
# Zbornak's turnaround to zbornak.jpg and zbornak_face.jpg; the labelled plan to plan.jpg; the sheet to zbornak_proposals.jpg.
#
#   node tools/zbornak-chimeras.mjs                      (once, with the dev server up: the chimeras, to ZB_CHIMERAS)
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py photo      the security camera's snapshot
#   node tools/zbornak-screens.mjs                       (the screens' pictures, from docs/zbornak-proposals/screens/terminal.html)
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py views      every view (PREVIEW_VIEWS=over,gate: some)
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py anim       the robots' loop (ANIM_FRAMES, default 24)
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py zbornak    the turnaround
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py plan
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py sheet
# PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set the quality. Cycles on the CPU, Freestyle for the ink.

import bpy, math, os, sys
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "docs", "zbornak-proposals")
SCREENS = os.path.join(OUT, "screens")
CHIMDIR = os.environ.get("ZB_CHIMERAS", "/tmp/zb-chimeras")
MODE = sys.argv[1] if len(sys.argv) > 1 else "views"
ONLY = [v for v in os.environ.get("PREVIEW_VIEWS", "").split(",") if v]
RES = (int(os.environ.get("PREVIEW_W", 1280)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 32))
GLOW_POWER = {"lamp": 6, "window": 3.5, "screen": 1.6, "spark": 14, "weldcore": 14, "weldhalo": 6, "pinkhot": 12, "holo": 2.5, "beam": 1.6,
              "scan": 1.0, "halo": 2.0, "water": 0.8, "feed": 3, "feed2": 3, "ember": 8, "iris": 4, "goggle": 3, "screenlit": 3}
RUNNER_EXTRAS = ("padL", "padR", "band", "crest", "antenna")
_chim_src = {}


def tb(p):
    return (p[0], -p[2], p[1])


def nodes_of(m):
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return nt, nt.nodes.new("ShaderNodeOutputMaterial")


def dress(G):
    """preview shading per slot: glow lit, see-through slots alpha-blended, the rest a matte painted solid"""
    for m in list(bpy.data.materials):
        n = m.name.split(".")[0]
        if n not in G["SLOT_COLORS"]:
            continue
        c = G["SLOT_COLORS"][n]
        nt, out = nodes_of(m)
        if n == "screen":
            continue                                                       # per object (paint_screens)
        if n in G["SEE"] and n not in G["GLOW"]:
            b = nt.nodes.new("ShaderNodeBsdfPrincipled")
            b.inputs["Base Color"].default_value = (*c, 1)
            b.inputs["Roughness"].default_value = 0.05
            b.inputs["Alpha"].default_value = G["SEE"][n]
            nt.links.new(b.outputs[0], out.inputs[0])
        elif n in G["GLOW"]:
            em = nt.nodes.new("ShaderNodeEmission")
            em.inputs["Color"].default_value = (*c, 1)
            em.inputs["Strength"].default_value = GLOW_POWER.get(n, 4.0)
            if n in G["SEE"]:
                tr = nt.nodes.new("ShaderNodeBsdfTransparent")
                mix = nt.nodes.new("ShaderNodeMixShader")
                mix.inputs["Fac"].default_value = G["SEE"][n]
                nt.links.new(tr.outputs[0], mix.inputs[1])
                nt.links.new(em.outputs[0], mix.inputs[2])
                nt.links.new(mix.outputs[0], out.inputs[0])
            else:
                nt.links.new(em.outputs[0], out.inputs[0])
        else:
            b = nt.nodes.new("ShaderNodeBsdfPrincipled")
            b.inputs["Base Color"].default_value = (*c, 1)
            b.inputs["Roughness"].default_value = 0.55
            b.inputs["Metallic"].default_value = 0.0
            nt.links.new(b.outputs[0], out.inputs[0])


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _chim_src.clear()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.cycles.transparent_max_bounces = 16
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.012, 0.01, 0.03, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = w
    return sc


def ground(sc):
    """the plateau (r 120, flat) in the Moon's lilac dust, and the ground beyond"""
    m = bpy.data.materials.new("ground")
    nt, out = nodes_of(m)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (0.52, 0.45, 0.5, 1)
    b.inputs["Roughness"].default_value = 0.95
    nt.links.new(b.outputs[0], out.inputs[0])
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=700, fill_type="NGON", location=(0, 0, -0.02))
    g = bpy.context.object
    g.name = "ground"
    g.data.materials.append(m)
    m2 = bpy.data.materials.new("plateau")
    nt, out = nodes_of(m2)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (0.58, 0.5, 0.55, 1)
    b.inputs["Roughness"].default_value = 0.95
    nt.links.new(b.outputs[0], out.inputs[0])
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=120, fill_type="NGON", location=(0, 0, -0.01))
    p = bpy.context.object
    p.name = "plateau"
    p.data.materials.append(m2)
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy, sun.angle, sun.color = 3.2, math.radians(1.0), (1.0, 0.96, 0.9)
    so = bpy.data.objects.new("sun", sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(-35))
    return [g, p]


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    return [o for o in new if o.parent is None], new


def chimera(idx, parent, p, yaw, scale):
    path = os.path.join(CHIMDIR, f"c{idx}.glb")
    if not os.path.isfile(path):
        return []
    if idx not in _chim_src:
        roots, new = import_glb(path)
        hold = bpy.data.objects.new(f"chimsrc{idx}", None)
        bpy.context.scene.collection.objects.link(hold)
        for r in roots:
            r.parent = hold
        hold.hide_render = True
        for o in new:
            o.hide_render = True
        _chim_src[idx] = (hold, new)
    hold, new = _chim_src[idx]
    copy = {}
    for o in [hold] + new:
        c = o.copy()
        bpy.context.scene.collection.objects.link(c)
        c.hide_render = False
        copy[o] = c
    for o, c in copy.items():
        if o.parent in copy:
            c.parent = copy[o.parent]
    top = copy[hold]
    top.parent = parent
    top.location = tb(p)
    top.rotation_euler = (0, 0, yaw)
    top.scale = (scale, scale, scale)
    return list(copy.values())


def texts(G):
    out = []
    for parent, s, p, yaw, size, slot, depth in G["TEXTS"]:
        cu = bpy.data.curves.new("txt", "FONT")
        cu.body = s
        cu.align_x, cu.align_y = "CENTER", "BOTTOM"
        cu.size = size
        cu.extrude = depth / 2
        o = bpy.data.objects.new("txt", cu)
        bpy.context.scene.collection.objects.link(o)
        o.parent = parent
        o.location = tb(p)
        o.rotation_euler = (math.pi / 2, 0, yaw)
        o.data.materials.append(bpy.data.materials.get(slot))
        out.append(o)
    return out


def lights(G):
    for parent, p, rgb, watts, radius in G["LIGHTS"]:
        L = bpy.data.lights.new("pl", "POINT")
        L.energy, L.color, L.shadow_soft_size = watts, rgb, radius
        o = bpy.data.objects.new("pl", L)
        bpy.context.scene.collection.objects.link(o)
        o.parent = parent
        o.location = tb(p)


def freestyle(sc, skip):
    noink = bpy.data.collections.new("NoInk")
    sc.collection.children.link(noink)
    for o in skip:
        if noink not in o.users_collection:
            noink.objects.link(o)
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.2
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(140)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("ink")
    ls.select_silhouette, ls.select_crease, ls.select_border = True, False, True
    ls.select_by_collection = True
    ls.collection = noink
    ls.collection_negation = "EXCLUSIVE"
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.linestyle.color = (0.02, 0.01, 0.06)
    ls.linestyle.thickness = 1.4


def camera(sc, loc, target, lens, name="cam"):
    for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(o)
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    cam.data.lens = lens
    cam.data.clip_start, cam.data.clip_end = 0.1, 2000
    sc.collection.objects.link(cam)
    cam.location = tb(loc)
    cam.rotation_euler = (Vector(tb(target)) - Vector(tb(loc))).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam


def cutaway(hide):
    for o in bpy.data.objects:
        p, cut = o, False
        while p:
            if p.get("cutaway"):
                cut = True
                break
            p = p.parent
        if cut:
            o.hide_render = hide


def render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


# plan labels: (text, x, z, label dx, dy in pixels)


def paint_screens():
    for o in [o for o in bpy.data.objects if o.type == "MESH" and "screen" in o.keys()]:
        sid = o["screen"]
        path = os.path.join(SCREENS, f"{sid}.png")
        me = o.data
        uv = me.uv_layers.new(name="uv")
        vs = [v.co for v in me.vertices]
        o0, ou, ov = vs[0], vs[1] - vs[0], vs[3] - vs[0]                    # the quad's own axes (plane()'s vertex order)
        for li, loop in enumerate(me.loops):
            d = vs[loop.vertex_index] - o0
            uv.data[li].uv = (d.dot(ou) / ou.length_squared, d.dot(ov) / ov.length_squared)
        m = bpy.data.materials.new(f"screen_{sid}")
        nt, out = nodes_of(m)
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Strength"].default_value = GLOW_POWER["screen"]
        if os.path.isfile(path):
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(path)
            nt.links.new(tex.outputs["Color"], em.inputs["Color"])
        else:
            em.inputs["Color"].default_value = (0.05, 0.3, 0.12, 1)
        nt.links.new(em.outputs[0], out.inputs[0])
        me.materials.clear()
        me.materials.append(m)


def courier(p, yaw, parent=None, stone=None):
    """runner.glb at p facing yaw (its outfit extras off); stone: one material over everything (a statue)"""
    roots, new = import_glb(os.path.join(REPO, "src", "assets", "runner.glb"))
    top = bpy.data.objects.new("courier", None)
    bpy.context.scene.collection.objects.link(top)
    for r in roots:
        r.parent = top
    top.parent = parent
    top.location = tb(p)
    top.rotation_euler = (0, 0, yaw)
    for e in [o for o in new if o.name.split(".")[0] in RUNNER_EXTRAS]:
        for o in [e] + list(e.children_recursive):
            o.hide_render = True
    if stone:
        for o in new:
            if o.type == "MESH":
                o.data.materials.clear()
                o.data.materials.append(stone)
    return top, new


def stone_material():
    m = bpy.data.materials.new("statue")
    nt, out = nodes_of(m)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (0.42, 0.4, 0.44, 1)
    b.inputs["Roughness"].default_value = 0.9
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def build():
    sc = scene_setup()
    G = {"__file__": os.path.join(REPO, "tools", "blender", "build_zbornak_lab.py")}
    os.environ["MOONRUNNER_EXPORT"] = "0"
    os.environ["MOONRUNNER_REPO"] = REPO
    exec(open(G["__file__"], encoding="utf-8").read(), G)
    dress(G)
    return sc, G


def setup_world(sc, G, runners=True):
    skip = ground(sc)
    paint_screens()
    lights(G)
    skip += texts(G)
    for parent, p, yaw, scale, idx in G["CHIMS"]:
        chimera(idx, parent, p, yaw, scale)
    st = stone_material()
    for parent, p, yaw in G["STATUES"]:
        top, _ = courier(p, yaw, parent, st)
        top.scale = (0.85, 0.85, 0.85)
    if runners:
        for p, yaw in G["RUNNER"].values():
            courier(p, yaw)
    for o in bpy.data.objects:
        if o.type == "MESH" and o.get("ink", 1) == 0:
            skip.append(o)
    freestyle(sc, skip)


def animate_robots(G, N):
    """the robot cell's work cycle over N frames (the builder's CELL_KEYS through apply_cell: IK on each tool point): every
    joint keyed per frame, the right plate shown (in the carrier, carried, welded on), the welder lit and flickering only
    while it welds"""
    import random
    rnd = random.Random(7)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, N
    arms = G["CELL"]["arms"].values()
    plates = [o for k in ("rack", "carry", "weld") for o in [G["CELL"][k].root] + list(G["CELL"][k].root.children_recursive)]
    welds = []
    for rol in G["WELDS"]:
        parts = [o for o in rol.children_recursive if o.type == "MESH" and o.data.materials and o.data.materials[0].name.split(".")[0] in ("weldhalo", "weldcore", "spark")]
        lamps = [o for o in bpy.data.objects if o.type == "LIGHT" and o.parent == rol]
        welds.append((parts, lamps))
    for f in range(1, N + 1):
        state, welding = G["apply_cell"]((f - 1) / N)
        for A in arms:
            A["turret"].keyframe_insert("rotation_euler", frame=f)
            for k in ("shoulder", "elbow", "wrist", "roll"):
                A[k].keyframe_insert("rotation_euler", frame=f)
        for o in plates:
            o.keyframe_insert("hide_render", frame=f)
        k = 0.7 + 0.6 * rnd.random()
        for parts, lamps in welds:
            for o in parts:
                nm = o.data.materials[0].name
                o.hide_render = not welding or (nm.startswith("spark") and rnd.random() < 0.35)
                o.scale = (k, k, k) if nm.startswith("weldhalo") else (1, 1, 1)
                o.keyframe_insert("scale", frame=f)
                o.keyframe_insert("hide_render", frame=f)
            for L in lamps:
                L.data.energy = 3000 * k if welding else 0.0
                L.data.keyframe_insert("energy", frame=f)


TAU_ = 2 * math.pi
# plan labels: (text, x, z) in the area's frame; placed in the margins by side
PLAN = [("Rotunda: the reactor under the oculus", 0, -18), ("Stair to the catwalk", -12.45, -23.0), ("Intake hatch on the catwalk", -6.3, -18), ("Airlock tunnel + lock housing", 0, 22),
        ("Security post: stand plate, camera, screen", 0, 35.6), ("Plaza", 0, 46), ("LABNET (on the wall)", 7.2, 11.1),
        ("Zbornak's dais", 5.5, -5.7), ("Gallery of the petrified", 20.0, -9.0), ("Robotics bay", 20.7, -21.6), ("Exotic-matter wall", 15.5, -43),
        ("Splice pod", 0, -41.5), ("Cryo pods (6)", -13.3, -41), ("Hydroponics habitat", -27.1, -13.2), ("Holotable", -12, -2.6),
        ("Ranch barn", 74, -26), ("Pen office: pen terminal", 57, -24.5), ("Silo + auger", 93.5, -30), ("Feed bunk", 93, 8),
        ("Corral", 80, 36), ("Training ring", 70, 26), ("Gate arch", 50, 16), ("Stock tank + sun-mill", 56, 39),
        ("Walk to the ranch", 30, 33), ("Walk to the pad", -30, 51), ("Supply pad", -62, 58), ("Zbornak containers", -43, 70),
        ("Radiator field", -4, -84), ("Solar array", -84, 8), ("Generator", -30, 18)]

def weld_cam(G):
    """the robots' view, aimed at the welder's tip: from the room's side of the bay, a little above"""
    bpy.context.view_layer.update()
    wri = G["WELDS"][0]
    tip = wri.matrix_world @ Vector(tb((0, 0, 0.67)))
    t3 = (tip.x, tip.z, -tip.y)                                             # back to the area's (three.js) axes
    d = Vector((t3[0] - 0.0, 0, t3[2] + 18.0)).normalized()               # out from the rotunda's centre
    side = Vector((d.z, 0, -d.x))
    loc = (t3[0] - d.x * 7.5 + side.x * 4.0, t3[1] + 2.6, t3[2] - d.z * 7.5 + side.z * 4.0)
    return loc, (t3[0] + d.x * 1.0, t3[1] - 0.2, t3[2] + d.z * 1.0), 30


if MODE == "photo":
    # what the airlock's camera sees: the courier on the stand plate, from the door, a little above
    os.makedirs(SCREENS, exist_ok=True)
    sc, G = build()
    setup_world(sc, G)
    sc.render.use_freestyle = False
    rp, _ = G["RUNNER"]["gate"]
    sc.render.resolution_x, sc.render.resolution_y = 480, 360
    camera(sc, (rp[0] + 0.25, 2.9, rp[2] - 2.9), (rp[0], 1.7, rp[2]), 44)
    render(sc, os.path.join(SCREENS, "photo.jpg"))
elif MODE == "views":
    sc, G = build()
    setup_world(sc, G)
    G["CAMS"]["robots"] = weld_cam(G)
    for name, (loc, tgt, lens) in G["CAMS"].items():
        if ONLY and name not in ONLY:
            continue
        cutaway(name == "cut")
        camera(sc, loc, tgt, lens)
        render(sc, os.path.join(OUT, f"{name}.jpg"))
elif MODE == "anim":
    from PIL import Image
    N = int(os.environ.get("ANIM_FRAMES", 24))
    sc, G = build()
    setup_world(sc, G)
    animate_robots(G, N)
    loc, tgt, lens = weld_cam(G)
    camera(sc, loc, tgt, lens)
    sc.render.resolution_x, sc.render.resolution_y = int(os.environ.get("PREVIEW_W", 800)), int(os.environ.get("PREVIEW_H", 450))
    frames = []
    for f in range(1, N + 1):
        sc.frame_set(f)
        p = f"/tmp/zb_anim_{f:03d}.jpg"
        render(sc, p)
        frames.append(Image.open(p).convert("P", palette=Image.ADAPTIVE, colors=200))
    frames[0].save(os.path.join(OUT, "robots.gif"), save_all=True, append_images=frames[1:], duration=90, loop=0)
    print("gif written")
elif MODE == "zbornak":
    from PIL import Image
    sc = scene_setup()
    B = {"__file__": os.path.join(REPO, "tools", "blender", "build_zbornak_lab.py")}
    os.environ["MOONRUNNER_EXPORT"] = "0"
    os.environ["MOONRUNNER_REPO"] = REPO
    exec(open(B["__file__"], encoding="utf-8").read().split("ROOT = build()")[0], B)
    B["zbornak"](None, 0, 0, 0)
    B["flush_all"]()
    dress(B)
    m = bpy.data.materials.new("floor")
    nt, out = nodes_of(m)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (0.16, 0.13, 0.22, 1)
    nt.links.new(b.outputs[0], out.inputs[0])
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=30, fill_type="NGON")
    fl = bpy.context.object
    fl.data.materials.append(m)
    for name, loc, energy, col in (("key", (4, -5, 5), 900, (1.0, 0.95, 0.88)), ("fill", (-5, -3, 2.5), 350, (0.55, 0.6, 1.0)), ("rim", (-1, 5, 4), 600, (1.0, 0.7, 0.9))):
        d = bpy.data.lights.new(name, "AREA")
        d.energy, d.size, d.color = energy, 3, col
        o = bpy.data.objects.new(name, d)
        sc.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    freestyle(sc, [fl] + [o for o in bpy.data.objects if o.type == "MESH" and o.get("ink", 1) == 0])
    sc.render.resolution_x, sc.render.resolution_y = 640, 900
    shots = []
    for k, ang in enumerate((0.0, 0.7, math.pi / 2, math.pi * 0.85)):
        camera(sc, (math.sin(ang) * 6.0, 1.65, math.cos(ang) * 6.0), (0, 1.25, 0), 50)
        p = os.path.join(OUT, f"zbornak_{k}.jpg")
        render(sc, p)
        shots.append(p)
    sc.render.resolution_x, sc.render.resolution_y = 900, 900
    camera(sc, (0.55, 2.15, 1.35), (0.0, 2.05, 0.1), 50)
    render(sc, os.path.join(OUT, "zbornak_face.jpg"))
    sheet = Image.new("RGB", (640 * 4, 900))
    for i, s in enumerate(shots):
        sheet.paste(Image.open(s), (640 * i, 0))
        os.remove(s)
    sheet.save(os.path.join(OUT, "zbornak.jpg"), quality=90)
elif MODE == "plan":
    # top-down, roofs off, labelled: the plateau (r 120) fills the frame, +x right, +z (the front) down
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 17)
    SPAN, PX = 250.0, 1400
    sc, G = build()
    setup_world(sc, G, runners=False)
    cutaway(True)
    sc.render.resolution_x = sc.render.resolution_y = PX
    sc.render.line_thickness = 1.0
    for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(o)
    cam = bpy.data.objects.new("plan", bpy.data.cameras.new("plan"))
    cam.data.type, cam.data.ortho_scale, cam.data.clip_end = "ORTHO", SPAN, 1000
    sc.collection.objects.link(cam)
    cam.location = (0, 0, 300)
    sc.camera = cam
    path = os.path.join(OUT, "plan.jpg")
    render(sc, path)
    im = Image.open(path).convert("RGB")
    d = ImageDraw.Draw(im)
    rr = 120 / SPAN * PX
    d.ellipse([PX / 2 - rr, PX / 2 - rr, PX / 2 + rr, PX / 2 + rr], outline=(255, 210, 63), width=2)
    for side in (-1, 1):                                                    # labels stacked in the margins, kept apart
        items = sorted([(PX / 2 + z / SPAN * PX, PX / 2 + x / SPAN * PX, t) for t, x, z in PLAN if (x < 0 or (x == 0 and z < 30)) == (side < 0)])
        ys, last = [], -1e9
        for py, px, t in items:
            last = max(py, last + 30)
            ys.append(last)
        shift = max(0, ys[-1] - (PX - 30)) if ys else 0
        for (py, px, t), ty in zip(items, ys):
            ty -= shift
            w = d.textlength(t, font=font)
            bx = 24 if side < 0 else PX - 24 - w - 8
            tx = bx + w + 8 if side < 0 else bx
            d.line([px, py, tx, ty], fill=(255, 210, 63), width=2)
            d.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(255, 210, 63))
            d.rectangle([bx, ty - 12, bx + w + 8, ty + 12], fill=(14, 10, 26))
            d.text((bx + 4, ty - 10), t, fill=(255, 240, 200), font=font)
    d.text((16, 14), "plateau r 120 m (yellow ring) · top view, roofs off · the front (+z) is down · 250 m across", fill=(255, 240, 200), font=font)
    im.save(path, quality=90)
elif MODE == "sheet":
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    views = ("over", "front", "gate", "cut", "inside", "intake", "term", "robots", "hydro", "hydro_door", "stair", "cryo", "exotic", "gallery", "walks", "crates", "ranch", "office")
    w, h, cols = 640, 360, 3
    rows = (len(views) + cols - 1) // cols
    sheet = Image.new("RGB", (w * cols, (h + 34) * rows), (14, 10, 26))
    dr = ImageDraw.Draw(sheet)
    for i, name in enumerate(views):
        p = os.path.join(OUT, f"{name}.jpg")
        x, y = (i % cols) * w, (i // cols) * (h + 34)
        dr.text((x + 10, y + 5), name.upper(), fill=(255, 210, 63), font=font)
        if os.path.isfile(p):
            sheet.paste(Image.open(p).resize((w, h)), (x, y + 34))
    sheet.save(os.path.join(OUT, "zbornak_proposals.jpg"), quality=88)
    print("sheet written")
