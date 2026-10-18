# Courier light-bike review sheet. Builds each proposal with build_courier.py in a fresh scene and renders
# side, front three-quarter and rear three-quarter views (with a mock-up of the new, longer light trail and
# the runner posed on the seat) to docs/courier-proposals/<variant>_<view>.jpg and a review sheet, courier_proposals.jpg
# (PREVIEW_OUT=<dir> writes them elsewhere; PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set the quality; PREVIEW_EXPORT=0 skips the GLBs).
#
#   pip install bpy pillow numpy
#   MOONRUNNER_REPO=. python3 tools/blender/preview_courier.py [a] [b]
#
# Cycles on the CPU (no GPU or display needed); Freestyle draws the comic ink outline.

import bpy, math, os, sys
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTDIR = os.environ.get("PREVIEW_OUT") or os.path.join(REPO, "docs", "courier-proposals")
os.makedirs(OUTDIR, exist_ok=True)
VARIANTS = [a for a in sys.argv[1:] if a in ("a", "b")] or ["a", "b"]
RES = (int(os.environ.get("PREVIEW_W", 1280)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 40))
# the rider's pose per proposal: torso lean (rad, three.js x rotation), thigh swing, hand reach
POSE = {"a": dict(lean=0.95, thigh=-1.05, arm=-0.75), "b": dict(lean=0.45, thigh=-1.25, arm=-0.55)}


def emissive(name, rgb, strength, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def light_material(m, rgb, strength=6.0):
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])


def toon(m, rgb, rough=0.35, alpha=1.0, metallic=0.0):
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
    nt.links.new(b.outputs[0], out.inputs[0])


def dress_preview():
    """Preview materials: lit slots glow, glass is a tinted pane, the rest are glossy painted solids."""
    for m in bpy.data.materials:
        n = m.name.split(".")[0]
        c = (*[min(1, v) for v in m.diffuse_color[:3]],)
        if n == "bag":
            toon(m, c, 0.5)
        elif n in ("glow", "gold", "lamp", "tail"):
            light_material(m, c, {"glow": 7.0, "gold": 5.0, "lamp": 9.0, "tail": 7.0}[n])
        elif n == "glass":
            toon(m, c, 0.05, 0.4)
            m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
        elif n in ("body", "panel", "dark", "metal", "seat", "tire"):
            toon(m, c, 0.28 if n in ("body", "panel") else 0.55, 1.0, 0.2 if n == "metal" else 0.0)


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90
    sc.view_settings.view_transform = "Standard"
    # an evening-on-the-Moon backdrop: violet sky, a cool key, a warm rim
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.09, 0.07, 0.17, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = w
    for name, loc, energy, col in (("key", (5, -6, 7), 900, (1.0, 0.95, 0.88)), ("fill", (-6, -3, 3), 350, (0.55, 0.6, 1.0)), ("rim", (-2, 6, 4), 500, (1.0, 0.7, 0.9))):
        d = bpy.data.lights.new(name, "AREA")
        d.energy, d.size, d.color = energy, 4, col
        o = bpy.data.objects.new(name, d)
        sc.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    # a ground: dark regolith
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.01))
    g = bpy.context.object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    toon(gm, (0.12, 0.1, 0.17), 0.9)
    g.data.materials.append(gm)
    return sc


def freestyle(sc, skip):
    """Ink everything except the objects in `skip` (the ground and the trail)."""
    noink = bpy.data.collections.new("NoInk")
    sc.collection.children.link(noink)
    for o in skip:
        noink.objects.link(o)
    sc.render.use_freestyle = True
    sc.render.line_thickness = 1.4
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    ls = vl.freestyle_settings.linesets.new("ink") if not vl.freestyle_settings.linesets else vl.freestyle_settings.linesets[0]
    ls.select_silhouette = True
    ls.select_crease = True
    ls.select_border = True
    ls.select_by_collection = True
    ls.collection = noink
    ls.collection_negation = "EXCLUSIVE"
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.linestyle.color = (0.02, 0.01, 0.06)
    ls.linestyle.thickness = 2.0


def mock_trail(sc, color):
    """The new light trail as the game will draw it (about 4 s of ribbon at ~20 m/s, fading): a wall 1.4 m tall
    plus a ground strip, brightest at the bike and eased away along its length."""
    L, H, Wd, N = 10.0, 1.4, 0.55, 40
    for nm in ("wall", "floor"):
        verts, faces, fade = [], [], []
        for i in range(N + 1):
            t = i / N
            k = (1 - t) ** 1.3   # (the game fades each point with its age)
            y = 1.9 + L * t
            ends = ((0, y, 0.05), (0, y, H * (0.7 + 0.3 * k))) if nm == "wall" else (((-Wd / 2, y, 0.02), (Wd / 2, y, 0.02)))
            for j, p in enumerate(ends):
                verts.append(p)
                fade.append(k * (1.0 if nm == "floor" or j == 0 else 0.35))
        for i in range(N):
            a = i * 2
            faces.append((a, a + 1, a + 3, a + 2))
        me = bpy.data.meshes.new(nm)
        me.from_pydata(verts, [], faces)
        me.attributes.new("fade", "FLOAT", "POINT")
        me.attributes["fade"].data.foreach_set("value", fade)
        o = bpy.data.objects.new(nm, me)
        sc.collection.objects.link(o)
        m = bpy.data.materials.new("trail_" + nm)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*color, 1)
        em.inputs["Strength"].default_value = 2.2 if nm == "wall" else 1.0
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        at = nt.nodes.new("ShaderNodeAttribute")
        at.attribute_name = "fade"
        nt.links.new(at.outputs["Fac"], mix.inputs["Fac"])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
        o.data.materials.append(m)


def add_rider(sc, variant, seat):
    """The runner glb, sat on the bike in this proposal's pose (a stand-in: the real pose is the game's call)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, "src", "assets", "runner.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    root = next(o for o in new if o.parent is None)
    byname = {o.name: o for o in new}
    P = POSE[variant]
    for o in new:
        o.rotation_mode = "XYZ"   # (the glTF importer leaves nodes in quaternion mode)
    byname["torso"].rotation_euler = (P["lean"], 0, 0)
    for n in ("legL", "legR"):
        byname[n].rotation_euler = (P["thigh"], 0, 0)
    for n, s in (("armL", 1), ("armR", -1)):
        byname[n].rotation_euler = (P["arm"], 0.22 * s, 0)
    k = 1 / 1.2   # the runner is 2 m tall beside a bike modelled at 1:1 and shown at 1.2x
    root.scale = (k, k, k)
    root.location = (seat[0], -seat[2], seat[1] - 0.95 * k)   # three.js (x, y, z) -> Blender (x, -z, y)
    for o in new:
        if o.type == "MESH":
            for m in o.data.materials:
                if m and m.name.split(".")[0] in ("glow", "skate"):
                    pass
    return root


def camera(sc, loc, target, lens=50):
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = lens
    sc.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    return cam


VIEWS = {
    "side": ((-8.8, 0.0, 1.55), (0, 0.0, 1.2), 42),
    "front": ((6.2, -7.8, 2.9), (0, 0.0, 1.3), 50),
    "rear": ((-6.2, 7.2, 2.9), (0, -0.2, 1.2), 50),
}

for v in VARIANTS:
    sc = scene_setup()
    g = {"__file__": os.path.join(REPO, "tools", "blender", "build_courier.py"), "VARIANT": v}
    os.environ["MOONRUNNER_EXPORT"] = "1" if os.environ.get("PREVIEW_EXPORT", "1") == "1" else "0"
    os.environ["MOONRUNNER_REPO"] = REPO
    exec(open(g["__file__"], encoding="utf-8").read(), g)
    dress_preview()
    mock_trail(sc, (0.18, 0.78, 1.0))
    trail_objs = [bpy.data.objects["wall"], bpy.data.objects["floor"]]
    freestyle(sc, trail_objs + [bpy.data.objects["Plane"]])
    seat = g["ROOT"]["seat"]
    if os.environ.get("PREVIEW_RIDER", "1") == "1":
        add_rider(sc, v, seat)
    for name, (loc, tgt, lens) in VIEWS.items():
        for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
            bpy.data.objects.remove(o)
        for o in trail_objs:
            o.hide_render = name == "side"   # (the side view is the clean silhouette, like the in-game screenshot)
        camera(sc, loc, tgt, lens)
        sc.render.filepath = os.path.join(OUTDIR, f"{v}_{name}.jpg")
        bpy.ops.render.render(write_still=True)
        print("rendered", sc.render.filepath)


# the review sheet: one row a proposal, one column a view
try:
    from PIL import Image, ImageDraw
    names = {"a": "A  SLIPSTREAM", "b": "B  PARCEL RUNNER"}
    rows = [v for v in VARIANTS if all(os.path.isfile(os.path.join(OUTDIR, f"{v}_{n}.jpg")) for n in VIEWS)]
    if rows:
        w, h = RES[0] // 2, RES[1] // 2
        sheet = Image.new("RGB", (w * len(VIEWS), (h + 28) * len(rows)), (24, 20, 40))
        d = ImageDraw.Draw(sheet)
        for r, v in enumerate(rows):
            d.text((10, r * (h + 28) + 8), names[v], fill=(255, 210, 63))
            for c, n in enumerate(VIEWS):
                im = Image.open(os.path.join(OUTDIR, f"{v}_{n}.jpg")).convert("RGB").resize((w, h), Image.LANCZOS)
                sheet.paste(im, (c * w, r * (h + 28) + 28))
        sheet.save(os.path.join(OUTDIR, "courier_proposals.jpg"), quality=90)
        print("sheet ->", os.path.join(OUTDIR, "courier_proposals.jpg"))
except ImportError:
    print("(pillow not installed: no contact sheet)")
