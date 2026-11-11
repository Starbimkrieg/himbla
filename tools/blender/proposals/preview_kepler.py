# Review renders for the Kepler town kit proposals (docs/kepler-proposals): the dome remodels and station pieces
# (kepler_domes.py), the two town halls (kepler_hall_a.py, kepler_hall_b.py) and the three town layouts stood up in 3D
# (kepler_town.py), each in a fresh scene. Writes <target>_<view>.jpg into docs/kepler-proposals.
#
#   MOONRUNNER_REPO=<repo> blender -b --factory-startup --python tools/blender/proposals/preview_kepler.py -- [target ...]
#
# Targets: domes pieces hall_a hall_b town_1 town_2 town_3 civic (default: all). PREVIEW_OUT=<dir> writes elsewhere; PREVIEW_W /
# PREVIEW_H / PREVIEW_SAMPLES set quality; PREVIEW_VIEWS=hero,top renders only those. Cycles on the CPU; Freestyle draws
# the ink; the sky is the game's black with stars, the ground its pale regolith (as preview_habitat.py).

import bpy, math, os, sys
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
os.environ["MOONRUNNER_REPO"] = REPO
OUT = os.environ.get("PREVIEW_OUT") or os.path.join(REPO, "docs", "kepler-proposals")
os.makedirs(OUT, exist_ok=True)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ONLY = [v for v in os.environ.get("PREVIEW_VIEWS", "").split(",") if v]
RES = (int(os.environ.get("PREVIEW_W", 1280)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 40))
P = lambda f: os.path.join(REPO, "tools", "blender", "proposals", f)


def tb(p):
    return Vector((p[0], -p[2], p[1]))


def lin(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def orbit(az, el, dist, aim, lens=35):
    """camera `dist` from `aim`, az degrees round from +x toward +z (90: looking at the front), el degrees up"""
    a, e = math.radians(az), math.radians(el)
    return ((aim[0] + math.cos(a) * math.cos(e) * dist, aim[1] + math.sin(e) * dist, aim[2] + math.sin(a) * math.cos(e) * dist), aim, lens)


TOWN = {"aerial": orbit(62, 36, 300, (0, 0, 4), 46)}
TARGETS = {
    "domes": ("kepler_domes.py", {"KEPLER_SET": "domes"}, {
        "both": orbit(66, 24, 205, (2, 4, -32), 40),
        "a": orbit(74, 9, 62, (-10, 5, 2)),
        "b": orbit(74, 9, 62, (-10, 5, -60)),
        "a_door": orbit(100, 6, 30, (-12, 3.5, 16), 30),
        "b_door": orbit(100, 6, 30, (-12, 3.5, -46), 30),
    }),
    "pieces": ("kepler_domes.py", {"KEPLER_SET": "pieces"}, {
        "all": orbit(84, 17, 118, (14, 5, -6)),
        "stilt": orbit(68, 7, 44, (-40, 4, 1)),
        "shops": orbit(100, 7, 36, (19, 3, 5)),
        "longhouse": orbit(62, 9, 36, (-6, 3, 0)),
    }),
    "hall_a": ("kepler_hall_a.py", {}, {
        "hero": orbit(66, 9, 92, (4, 11, 12)),
        "front": orbit(92, 5, 98, (3, 12, 10)),
        "top": orbit(112, 52, 112, (3, 4, 12)),
        "close": orbit(74, 4, 36, (2, 5.5, 20), 26),
        "back": orbit(245, 14, 86, (2, 9, 4)),
        "dial": orbit(84, -4, 34, (19, 24, 30), 40),
    }),
    "hall_b": ("kepler_hall_b.py", {}, {
        "hero": orbit(62, 8, 92, (0, 12, 6)),
        "front": orbit(92, 5, 98, (0, 13, 6)),
        "top": orbit(112, 52, 108, (0, 6, 6)),
        "under": ((-11.5, 1.7, 15.0), (3.0, 5.2, -3.0), 20),
        "back": orbit(245, 14, 86, (0, 11, 2)),
        "deck": orbit(70, 14, 40, (0, 15.5, 4), 32),
    }),
    "town_1": ("kepler_town.py", {"KEPLER_LAYOUT": "1"}, {**TOWN, "street": ((-52, 2.4, 1.5), (10, 4.5, -5), 22)}),
    "town_2": ("kepler_town.py", {"KEPLER_LAYOUT": "2"}, {**TOWN, "street": ((46, 2.4, 13), (-12, 4.5, 4), 22)}),
    "town_3": ("kepler_town.py", {"KEPLER_LAYOUT": "3"}, {**TOWN, "street": ((-42, 2.4, 35), (12, 6, -12), 22)}),
    "civic": ("kepler_town.py", {"KEPLER_LAYOUT": "civic"}, {**TOWN, "street": ((-4, 2.2, 104), (2, 9, 0), 28)}),
}
NAMES = [a for a in ARGS if a in TARGETS] or list(TARGETS)


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
    # the sun, from the front left (the places' sunward side is +z)
    a, e = math.radians(118), math.radians(40)
    L = tb((math.cos(a) * math.cos(e), math.sin(e), math.sin(a) * math.cos(e)))
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.6
    sun.data.angle = math.radians(1.5)
    sun.rotation_euler = (-L).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(sun)
    # ground: the game's pale regolith, no ink
    me = bpy.data.meshes.new("ground")
    s = 2500
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
    return sc, noink


def shoot(sc, name, view, spec):
    pos, aim, lens = spec
    cam = bpy.data.objects.new("cam_" + view, bpy.data.cameras.new("cam_" + view))
    cam.data.lens = lens
    cam.data.clip_end = 5000
    sc.collection.objects.link(cam)
    A, B_ = tb(pos), tb(aim)
    cam.location = A
    cam.rotation_euler = (B_ - A).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sc.render.filepath = os.path.join(OUT, f"{name}_{view}.jpg")
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath, flush=True)


for name in NAMES:
    script, env, views = TARGETS[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.environ.update(env)
    g = {"__file__": P(script), "__name__": "__kepler__"}
    exec(open(P(script), encoding="utf-8").read(), g)
    sc, noink = stage()
    for o in g["OBJS"]:                                    # paint lying on the ground, glass and glow take no ink
        if o.get("ink", 0) == 0:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            noink.objects.link(o)
    dress(g["HEX"], dict(g["GLOW_SLOTS"]))
    for view, spec in views.items():
        if ONLY and view not in ONLY:
            continue
        shoot(sc, name, view, spec)
