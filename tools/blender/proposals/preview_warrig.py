# Review renders for the Rustmoon War-Rig: the current rig (../build_warrig.py, not exported here) and the proposals A
# (warrig_a.py) and B (warrig_b.py), each in a fresh scene, at the game's 1.35 scale. Renders hero (front three-quarter),
# rear (rear three-quarter), side, close (the gun and the gunner) and night (sun off, the searchlights on) to
# docs/warrig-proposals/<name>_<view>.jpg, plus <name>_sheet.jpg (hero, rear, side, close; 2 x 2).
#
#   MOONRUNNER_REPO=<repo> python3 tools/blender/proposals/preview_warrig.py [current] [a] [b]
#
# PREVIEW_OUT=<dir> writes elsewhere; PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set quality; PREVIEW_VIEWS=hero,night renders
# only those. Cycles on the CPU; Freestyle draws the ink. The proposals' gunner is the game's courier (src/assets/runner.glb)
# in the Rustmoon pirate colours, hung on the rig's `crew` empty and posed by hand; the game would place its own pirate there.

import bpy, math, os, sys
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
os.environ["MOONRUNNER_REPO"] = REPO
OUT = os.environ.get("PREVIEW_OUT") or os.path.join(REPO, "docs", "warrig-proposals")
os.makedirs(OUT, exist_ok=True)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
NAMES = [a for a in ARGS if a in ("current", "a", "b")] or ["current", "a", "b"]
ONLY = [v for v in os.environ.get("PREVIEW_VIEWS", "").split(",") if v]
RES = (int(os.environ.get("PREVIEW_W", 1280)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 32))
SCALE = 1.35  # the game's war-rig scale

# the current rig's colours (RIG_TOON / RIG_GLOW in src/models.js, Rustmoon livery)
CURRENT_HEX = {"body": 0x7b2ff7, "stripe": 0x7dff3a, "rust": 0x7a4a32, "primer": 0x6b6f78, "olive": 0x5a6a3a, "scrap": 0x3a5a7a,
               "dark": 0x2a2540, "steel": 0x55607a, "tire": 0x1d1a29, "bone": 0xe8e0c8, "seat": 0x3a2a22, "red": 0xd7263d,
               "flag": 0x1a1a1a, "lamp": 0xfff6a8, "hot": 0xff9f1c}
CURRENT_GLOW = {"lamp": 6.0, "hot": 4.0}
# the pirate gunner: FOES.rustmoon.look (src/storyAssets.js) on the courier's slots
PIRATE_HEX = {"suit": 0x3a2b4f, "accent": 0x7dff3a, "helmet": 0x2b2b2b, "visor": 0x7dff3a, "scarf": 0xd7263d, "dark": 0x221d33,
              "metal": 0x3a3550, "glow": 0x7dff3a, "skate": 0x7dff3a, "collar": 0x221d33, "lens": 0x7dff3a, "glint": 0xffffff}
PIRATE_GLOW = {"visor": 2.0, "glow": 4.0, "skate": 3.0, "lens": 4.0, "glint": 4.0}


def tb(p):
    return Vector((p[0], -p[2], p[1]))


def lin(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def orbit(az, el, dist, aim, lens=40):
    """camera on a sphere round `aim` (three.js axes, game scale); az 0 = straight ahead of the nose (+z), 90 = its right"""
    a, e = math.radians(az), math.radians(el)
    return ((aim[0] + math.sin(a) * math.cos(e) * dist, aim[1] + math.sin(e) * dist, aim[2] + math.cos(a) * math.cos(e) * dist), aim, lens)


VIEWS = {
    "hero": orbit(-38, 14, 22.0, (0, 3.3, 0.3)),
    "rear": orbit(140, 20, 22.0, (0, 3.3, -0.4)),
    "side": orbit(-90, 4, 22.0, (0, 3.3, 0)),
    "close": None,   # on the gunner: set per rig from its crew empty
    "night": orbit(-150, 16, 24.0, (0, 2.0, 5.0)),
}


def dress(hexes, glows, prefix=""):
    for m in bpy.data.materials:
        if prefix and not m.name.startswith(prefix):
            continue
        if not prefix and m.name.startswith("rn_"):
            continue
        n = m.name[len(prefix):].split(".")[0]
        if n not in hexes:
            continue
        c = lin(hexes[n])
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        if n in glows:
            sh = nt.nodes.new("ShaderNodeEmission")
            sh.inputs["Color"].default_value = (*c, 1)
            sh.inputs["Strength"].default_value = glows[n]
        else:
            sh = nt.nodes.new("ShaderNodeBsdfDiffuse")
            sh.inputs["Color"].default_value = (*c, 1)
        nt.links.new(sh.outputs[0], out.inputs[0])


def stage(night=False):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("moon")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    lp = nt.nodes.new("ShaderNodeLightPath")
    fill = nt.nodes.new("ShaderNodeBackground")
    fill.inputs["Color"].default_value = (0.42, 0.40, 0.56, 1)
    fill.inputs["Strength"].default_value = 0.08 if night else 0.55
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 700.0
    nz.inputs["Detail"].default_value = 0.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = (0.006, 0.005, 0.016, 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (0.9, 0.9, 1.0, 1)
    sky = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(tc.outputs["Generated"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], sky.inputs["Color"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(fill.outputs[0], mix.inputs[1])
    nt.links.new(sky.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    sc.world = w
    if not night:
        L = tb((-0.55, 0.7, 0.45))
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        sun.data.energy = 3.4
        sun.data.angle = math.radians(1.5)
        sun.rotation_euler = (-L.normalized()).to_track_quat("-Z", "Y").to_euler()
        sc.collection.objects.link(sun)
    me = bpy.data.meshes.new("ground")
    s = 800
    me.from_pydata([(-s, -s, -0.02), (s, -s, -0.02), (s, s, -0.02), (-s, s, -0.02)], [], [(0, 1, 2, 3)])
    g = bpy.data.objects.new("ground", me)
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    gm.node_tree.nodes.clear()
    o = gm.node_tree.nodes.new("ShaderNodeOutputMaterial")
    d = gm.node_tree.nodes.new("ShaderNodeBsdfDiffuse")
    d.inputs["Color"].default_value = (*lin(0xc9c1d8), 1)
    gm.node_tree.links.new(d.outputs[0], o.inputs[0])
    me.materials.append(gm)
    noink = bpy.data.collections.new("NoInk")
    sc.collection.children.link(noink)
    noink.objects.link(g)
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.3
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(140)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("ink")
    ls.select_silhouette = ls.select_border = ls.select_crease = True
    ls.select_by_collection = True
    ls.collection = noink
    ls.collection_negation = "EXCLUSIVE"
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.linestyle.color = (0.02, 0.01, 0.05)
    ls.linestyle.thickness = 1.3
    return sc


def add_gunner(crew):
    """the courier as the pirate gunner on the `crew` empty, posed standing at the grips or sitting in the basket"""
    before = set(bpy.data.objects)
    mats0 = set(bpy.data.materials)
    bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, "src", "assets", "runner.glb"))
    for m in set(bpy.data.materials) - mats0:
        m.name = "rn_" + m.name
    new = set(bpy.data.objects) - before
    root = next(o for o in new if o.name.startswith("runner") and o.parent is None)
    for o in new:
        if o.name.split(".")[0] in ("padL", "padR", "band", "crest", "antenna"):   # outfit extras: off
            for c in [o] + list(o.children_recursive):
                c.hide_render = True
    root.parent = crew
    root.matrix_parent_inverse.identity()
    root.location = (0, 0, 0)
    root.rotation_mode = "XYZ"
    root.rotation_euler = (0, 0, 0)
    root.scale = (1 / SCALE,) * 3
    byname = {o.name.split(".")[0]: o for o in new}

    def rot(n, x=0.0, y=0.0, z=0.0):
        o = byname.get(n)
        if o:
            o.rotation_mode = "XYZ"
            o.rotation_euler = (x, -z, y)   # three.js (x, y, z) turns -> Blender axes
    if crew.get("pose") == "sit":
        rot("legL", -1.45, 0, 0.08)
        rot("legR", -1.45, 0, -0.08)
        rot("torso", 0.1)
        rot("armL", -1.25, 0, 0.12)
        rot("armR", -1.25, 0, -0.12)
        rot("foreL", -0.35)
        rot("foreR", -0.35)
    else:
        rot("legL", 0.12, 0, 0.06)
        rot("legR", -0.18, 0, -0.06)
        rot("torso", 0.18)
        rot("armL", -0.95, 0, 0.18)
        rot("armR", -0.95, 0, -0.18)
        rot("foreL", -0.55)
        rot("foreR", -0.55)
        rot("head", -0.1)


def add_flags():
    """the game hangs a ragged cloth on each `flag` empty (makeWaveFlag); a flat stand-in here"""
    for e in [o for o in bpy.data.objects if o.get("role") == "flag"]:
        w, h = e.get("w", 1.1), e.get("h", 0.75)
        rag = [(0, 0), (-w, 0.03), (-w * 0.88, -h * 0.28), (-w * 1.04, -h * 0.5), (-w * 0.8, -h * 0.66), (-w * 0.92, -h * 0.95), (0, -h)]
        me = bpy.data.meshes.new("rag")
        me.from_pydata([tb((0, y, z)) for z, y in rag], [], [tuple(range(len(rag)))])
        o = bpy.data.objects.new("rag", me)
        bpy.context.scene.collection.objects.link(o)
        o.parent = e
        m = bpy.data.materials.new("rag")
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*lin(0x1a1a1a), 1)
        me.materials.append(m)
        # a skull daub
        sk = bpy.data.meshes.new("skull")
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, radius=0.16, segments=10)
        bm.to_mesh(sk)
        so = bpy.data.objects.new("skull", sk)
        bpy.context.scene.collection.objects.link(so)
        so.parent = e
        so.location = tb((0.012, -h * 0.45, -w * 0.45))
        so.rotation_euler = (0, math.pi / 2, 0)
        sm = bpy.data.materials.new("skullm")
        sm.use_nodes = True
        sm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*lin(0xe8e0c8), 1)
        sk.materials.append(sm)


def add_spots():
    for e in [o for o in bpy.data.objects if o.get("role") == "spot"]:
        L = bpy.data.lights.new("spot", "SPOT")
        L.energy = 30000 * (e.get("r", 0.2) / 0.26) ** 2
        L.spot_size = math.radians(30)
        L.spot_blend = 0.6
        L.shadow_soft_size = 0.1
        L.color = lin(0xfff6a8)
        o = bpy.data.objects.new("spotL", L)
        bpy.context.scene.collection.objects.link(o)
        o.location = e.matrix_world.translation
        aim = e.get("aim", (0, 0, 1))
        o.rotation_euler = tb(aim).to_track_quat("-Z", "Y").to_euler()


def shoot(sc, name, view, spec):
    pos, aim, lens = spec
    cam = bpy.data.objects.new("cam_" + view, bpy.data.cameras.new("cam_" + view))
    cam.data.lens = lens
    cam.data.clip_end = 2000
    sc.collection.objects.link(cam)
    Pp, Aa = tb(pos), tb(aim)
    cam.location = Pp
    cam.rotation_euler = (Aa - Pp).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sc.render.filepath = os.path.join(OUT, f"{name}_{view}.jpg")
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath, flush=True)


def sheet(name, views):
    import numpy as np
    w, h, gap = RES[0] // 2, RES[1] // 2, 4
    W, Hh = w * 2 + gap, h * 2 + gap
    canvas = np.zeros((Hh, W, 4), dtype=np.float32)
    canvas[..., :3] = (0.09, 0.08, 0.16)
    canvas[..., 3] = 1
    for i, v in enumerate(views):
        path = os.path.join(OUT, f"{name}_{v}.jpg")
        if not os.path.isfile(path):
            return
        im = bpy.data.images.load(path)
        px = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        px = px.reshape(im.size[1], im.size[0], 4)
        px = px[: h * 2, : w * 2].reshape(h, 2, w, 2, 4).mean(axis=(1, 3))
        col, row = i % 2, i // 2
        y0 = Hh - (row + 1) * h - row * gap
        canvas[y0:y0 + h, col * (w + gap):col * (w + gap) + w] = px
        bpy.data.images.remove(im)
    img = bpy.data.images.new(f"{name}_sheet", W, Hh)
    img.pixels.foreach_set(canvas.ravel())
    img.filepath_raw = os.path.join(OUT, f"{name}_sheet.jpg")
    img.file_format = "JPEG"
    img.save()
    print("sheet ->", img.filepath_raw, flush=True)


for name in NAMES:
    views = [v for v in VIEWS if (not ONLY or v in ONLY) and not (name == "current" and v in ("close",))]
    for night in (False, True):
        vs = [v for v in views if (v == "night") == night]
        if not vs:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        path = os.path.join(REPO, "tools", "blender", "build_warrig.py") if name == "current" else os.path.join(REPO, "tools", "blender", "proposals", f"warrig_{name}.py")
        os.environ["MOONRUNNER_EXPORT"] = "0"
        g = {"__file__": path, "__name__": "__warrig__"}
        exec(open(path, encoding="utf-8").read(), g)
        root = bpy.data.objects["warrig"]
        root.scale = (SCALE,) * 3
        sc = stage(night)
        if name == "current":
            dress(CURRENT_HEX, CURRENT_GLOW)
        else:
            dress(g["HEX"], g["GLOW_SLOTS"])
            crew = next((o for o in bpy.data.objects if o.get("role") == "crew"), None)
            if crew:
                add_gunner(crew)
                dress(PIRATE_HEX, PIRATE_GLOW, "rn_")
            add_flags()
            if night:
                add_spots()
        bpy.context.view_layer.update()
        for v in vs:
            spec = VIEWS[v]
            if v == "close":
                crew = next(o for o in bpy.data.objects if o.get("role") == "crew")
                w = crew.matrix_world.translation
                spec = orbit(-30, 20, 8.5, (w.x, w.z + 1.0, -w.y + 0.4), 45)
            shoot(sc, name, v, spec)
    if not ONLY:
        sheet(name, ("hero", "rear", "side", "close") if name != "current" else ("hero", "rear", "side", "night"))
