# Review renders for the Kepler Habitat: A, the Orrery (../build_habitat.py, not exported here), and / or B (habitat_b.py), each in a fresh scene, and
# renders four views to docs/habitat-proposals/<name>_<view>.jpg plus <name>_sheet.jpg (the four, 2 x 2): hero (outside, three-
# quarter), hub (from the skywalk side, as you walk up from the ILMB dome), top (high, the plan), close (A: on the skate loop
# under the ring; B: on the street, looking uphill).
#
#   MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/proposals/preview_habitat.py -- [a] [b]
#
# PREVIEW_OUT=<dir> writes elsewhere; PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set quality; PREVIEW_VIEWS=hero,top renders only
# those. Cycles on the CPU; Freestyle draws the ink; the sky is the game's black with stars, the ground its pale regolith.

import bpy, math, os, sys
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
os.environ["MOONRUNNER_REPO"] = REPO
OUT = os.environ.get("PREVIEW_OUT") or os.path.join(REPO, "docs", "habitat-proposals")
os.makedirs(OUT, exist_ok=True)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
NAMES = [a for a in ARGS if a in ("a", "b")] or ["a", "b"]
ONLY = [v for v in os.environ.get("PREVIEW_VIEWS", "").split(",") if v]
RES = (int(os.environ.get("PREVIEW_W", 1280)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 40))
TAU = 2 * math.pi


def tb(p):
    return Vector((p[0], -p[2], p[1]))


def lin(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def spiral(u, k, dr=0.0, dy=0.0):
    """a point on B's street (habitat_b.py: outer edge 26 - 4.5 (u + k), height 7 (u + k) + 0.06), dr in from the edge"""
    t = math.pi - 0.93 * TAU + u * TAU
    r = 26.0 - 4.5 * (u + k) - dr
    return (math.cos(t) * r, 7.0 * (u + k) + 0.06 + dy, math.sin(t) * r)


# (camera, aim, lens) in three.js axes, the wing's frame: +x away from the ILMB hub, -x the skywalk side
def orbit(az, el, dist, aim, lens=35):
    a, e = math.radians(az), math.radians(el)
    return ((aim[0] + math.cos(a) * math.cos(e) * dist, aim[1] + math.sin(e) * dist, aim[2] + math.sin(a) * math.cos(e) * dist), aim, lens)


VIEWS = {
    "a": {
        "hero": orbit(35, 15, 102, (0, 14, 0)),
        "hub": orbit(196, 9, 104, (0, 17, 0)),
        "top": orbit(125, 56, 122, (0, 11, 0)),
        "close": orbit(5, 8, 34, (21.7, 9.5, 12.5)),
        "under": ((14.85, 1.6, -14.85), (18.9, 5.0, 1.66), 24),
        "foot": ((28.5, 2.4, -11.84), (22.17, 1.5, -12.8), 30),
        "leg": ((31.0, 4.0, -6.0), (21.0, 3.6, -11.5), 30),
    },
    "b": {
        "hero": orbit(35, 15, 96, (0, 11, 0)),
        "hub": orbit(196, 10, 86, (0, 10, 0)),
        "top": orbit(125, 56, 100, (0, 4, 0)),
        "close": orbit(35, 10, 30, (15.6, 7.5, 10.9), 40),
        "street": (spiral(0.22, 1, 1.4, 1.6), spiral(0.34, 1, 2.8, 1.4), 20),
    },
}


def dress(hexes, glows):
    for m in bpy.data.materials:
        n = m.name.split(".")[0]
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
            nt.links.new(sh.outputs[0], out.inputs[0])
        elif n == "glass":
            mix = nt.nodes.new("ShaderNodeMixShader")
            tr = nt.nodes.new("ShaderNodeBsdfTransparent")
            gl = nt.nodes.new("ShaderNodeBsdfDiffuse")
            gl.inputs["Color"].default_value = (*c, 1)
            mix.inputs[0].default_value = 0.3
            nt.links.new(tr.outputs[0], mix.inputs[1])
            nt.links.new(gl.outputs[0], mix.inputs[2])
            nt.links.new(mix.outputs[0], out.inputs[0])
        else:
            sh = nt.nodes.new("ShaderNodeBsdfDiffuse")
            sh.inputs["Color"].default_value = (*c, 1)
            nt.links.new(sh.outputs[0], out.inputs[0])


def stage():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.cycles.transparent_max_bounces = 12
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90
    sc.view_settings.view_transform = "Standard"
    # sky: black with stars to the camera, a pale violet fill everywhere else (the game's hemisphere light)
    w = bpy.data.worlds.new("moon")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    lp = nt.nodes.new("ShaderNodeLightPath")
    fill = nt.nodes.new("ShaderNodeBackground")
    fill.inputs["Color"].default_value = (0.42, 0.40, 0.56, 1)
    fill.inputs["Strength"].default_value = 0.55
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
    sky.inputs["Strength"].default_value = 1.0
    nt.links.new(tc.outputs["Generated"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], sky.inputs["Color"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(fill.outputs[0], mix.inputs[1])
    nt.links.new(sky.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    sc.world = w
    # the sun, from above the hero view's left shoulder
    L = tb((math.cos(math.radians(100)) * math.cos(math.radians(42)), math.sin(math.radians(42)), math.sin(math.radians(100)) * math.cos(math.radians(42))))
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.6
    sun.data.angle = math.radians(1.5)
    sun.rotation_euler = (-L).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(sun)
    # ground: the game's pale regolith, no ink
    me = bpy.data.meshes.new("ground")
    s = 1500
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
    # ink
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.4
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
    ls.linestyle.thickness = 1.4
    return sc


def shoot(sc, name, view, spec):
    pos, aim, lens = spec
    cam = bpy.data.objects.new("cam_" + view, bpy.data.cameras.new("cam_" + view))
    cam.data.lens = lens
    cam.data.clip_end = 3000
    sc.collection.objects.link(cam)
    P, A = tb(pos), tb(aim)
    cam.location = P
    cam.rotation_euler = (A - P).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sc.render.filepath = os.path.join(OUT, f"{name}_{view}.jpg")
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath, flush=True)


def sheet(name, views):
    """the four views 2 x 2 at half size, with a 4 px gutter"""
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
        y0 = Hh - (row + 1) * h - row * gap               # image rows run bottom-up
        canvas[y0:y0 + h, col * (w + gap):col * (w + gap) + w] = px
        bpy.data.images.remove(im)
    img = bpy.data.images.new(f"{name}_sheet", W, Hh)
    img.pixels.foreach_set(canvas.ravel())
    img.filepath_raw = os.path.join(OUT, f"{name}_sheet.jpg")
    img.file_format = "JPEG"
    img.save()
    print("sheet ->", img.filepath_raw, flush=True)


for name in NAMES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = os.path.join(REPO, "tools", "blender", "build_habitat.py") if name == "a" else os.path.join(REPO, "tools", "blender", "proposals", "habitat_b.py")
    os.environ["MOONRUNNER_EXPORT"] = "0"
    g = {"__file__": path, "__name__": "__habitat__"}
    exec(open(path, encoding="utf-8").read(), g)
    sc = stage()
    dress(g["HEX"], dict(g["GLOW_SLOTS"]))
    for view, spec in VIEWS[name].items():
        if ONLY and view not in ONLY:
            continue
        shoot(sc, name, view, spec)
    sheet(name, ("hero", "hub", "top", "close"))
