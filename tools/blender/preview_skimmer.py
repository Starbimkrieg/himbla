# Skimmer redesign review sheet. Builds the classic Skimmer (build_skimmer.py) and each proposal (build_skimmer_redesign.py) in a fresh
# scene and renders side, front three-quarter, rear three-quarter and top views to docs/skimmer-proposals/<name>_<view>.jpg, and a
# review sheet, skimmer_proposals.jpg (PREVIEW_OUT=<dir> writes them elsewhere; PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set the quality;
# PREVIEW_EXPORT=0 skips the GLBs). The runner rides inside, so there is none in the pictures.
#
#   pip install bpy pillow numpy
#   MOONRUNNER_REPO=. python3 tools/blender/preview_skimmer.py [classic] [a] [b]
#
# Cycles on the CPU (no GPU or display needed); Freestyle draws the comic ink outline. The vehicle floats 0.8 m up, as in the game, over
# a soft glow where its hover pads push on the ground.

import bpy, math, os, sys
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTDIR = os.environ.get("PREVIEW_OUT") or os.path.join(REPO, "docs", "skimmer-proposals")
os.makedirs(OUTDIR, exist_ok=True)
NAMES = [a for a in sys.argv[1:] if a in ("classic", "a", "b", "bprev")] or ["classic", "a", "b"]
ONLY = [v for v in os.environ.get("PREVIEW_VIEWS", "").split(",") if v]   # (render just these views)
RES = (int(os.environ.get("PREVIEW_W", 1280)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 40))
FLOAT = 0.8   # the game floats a hover vehicle this far above the ground
GLOWS = {"glow": 3.2, "stripe": 3.0, "accent": 6.0, "white": 9.0, "red": 7.0, "engine": 8.0, "core": 9.0, "lamp": 9.0, "plume": 2.5, "plumeCore": 5.0, "lift": 2.0}
TOONS = ("body", "plate", "dark", "metal", "steel", "seat", "stripe")


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




def toon(m, rgb, rough=0.35, alpha=1.0, metallic=0.0):
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    nt.links.new(b.outputs[0], out.inputs[0])


def dress_preview(livery_glow=True):
    """Preview materials: lit slots glow, the flames are additive, glass is a pale pane, the rest are painted solids. (The classic
    model's stripe is a TOON in the trim colour; the proposals' stripe is the same slot, so both are painted.)"""
    for m in bpy.data.materials:
        n = m.name.split(".")[0]
        c = tuple(min(1, v) for v in m.diffuse_color[:3])
        if n in GLOWS and n not in ("stripe",):
            light_material(m, c, GLOWS[n])
        elif n == "glass":
            light_material(m, c, 3.0)
        elif n in TOONS:
            toon(m, c, 0.28 if n in ("body", "plate") else 0.5, 1.0, 0.25 if n in ("metal", "steel") else 0.0)
        else:
            toon(m, c, 0.5)


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



def camera(sc, loc, target, lens=50):
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = lens
    sc.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    return cam


VIEWS = {
    "side": ((-14.5, 0.0, 2.2), (0, 0.0, 1.75), 42),
    "front": ((8.2, -10.0, 3.8), (0, 0.0, 1.7), 42),
    "rear": ((-8.2, 10.0, 3.8), (0, 0.0, 1.7), 42),
    "top": ((0.0, -0.4, 14.5), (0, -0.4, 1.4), 42),   # (not on the sheet)
    # close-ups of the right nacelle's tail (fin, tip band, tail light, thruster), the nose's eye, and the coils on the nacelle
    "fin": ((5.2, 5.4, 4.3), (2.0, 2.2, 2.75), 55),
    "eye": ((1.3, -4.5, 3.7), (0, -2.0, 2.0), 60),
    "coil": ((5.4, -2.4, 2.4), (2.0, 0.2, 1.6), 55),
}
DETAILS = ("fin", "eye", "coil")
SHEET = ("side", "front", "rear")

for name in NAMES:
    sc = scene_setup()
    os.environ["MOONRUNNER_REPO"] = REPO
    os.environ["MOONRUNNER_EXPORT"] = "1" if (name != "classic" and os.environ.get("PREVIEW_EXPORT", "1") == "1") else "0"
    if name == "classic":
        g = {"__file__": os.path.join(REPO, "tools", "blender", "build_skimmer.py")}
        os.environ["MOONRUNNER_EXPORT"] = "0"
    elif name == "bprev":   # the B that was committed (BPREV = a copy of its builder), for a before and after
        g = {"__file__": os.environ["BPREV"], "VARIANT": "b"}
        os.environ["MOONRUNNER_EXPORT"] = "0"
    else:
        g = {"__file__": os.path.join(REPO, "tools", "blender", "build_skimmer_redesign.py"), "VARIANT": name}
    exec(open(g["__file__"], encoding="utf-8").read(), g)
    root = bpy.data.objects["skimmer"]
    root.location.z += FLOAT
    dress_preview()
    for o in bpy.data.objects:   # the flames at rest, as the game's anim() draws them (plumes 0.35 long, hover glows 0.8 deep)
        if o.type == "EMPTY" and o.get("role") == "plume":
            o.scale = (0.9, 0.9, 0.4)
        elif o.type == "EMPTY" and o.get("role") == "lift":
            o.scale = (1, 1, 0.8)
    for l in bpy.data.lights:
        l.energy *= 0.5
    bpy.data.objects["Plane"].data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.04, 0.09, 1)
    ground = bpy.data.objects["Plane"]
    freestyle(sc, [ground])
    for view, (loc, tgt, lens) in VIEWS.items():
        if ONLY and view not in ONLY:
            continue
        for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
            bpy.data.objects.remove(o)
        camera(sc, loc, tgt, lens)
        sc.render.filepath = os.path.join(OUTDIR, f"{name}_{view}.jpg")
        bpy.ops.render.render(write_still=True)
        print("rendered", sc.render.filepath)

try:
    from PIL import Image, ImageDraw
    labels = {"classic": "CLASSIC (CURRENT)", "a": "A  AEGIS", "b": "B  BULWARK", "bprev": "B  BULWARK, BEFORE THIS REVISION"}
    rows = [n for n in (os.environ.get("PREVIEW_SHEET", "").split(",") if os.environ.get("PREVIEW_SHEET") else NAMES) if all(os.path.isfile(os.path.join(OUTDIR, f"{n}_{v}.jpg")) for v in SHEET)]   # (PREVIEW_SHEET=bprev,b: these rows, from files already rendered)
    if rows:
        w, h = RES[0] // 2, RES[1] // 2
        sheet = Image.new("RGB", (w * len(SHEET), (h + 28) * len(rows)), (24, 20, 40))
        d = ImageDraw.Draw(sheet)
        for r, n in enumerate(rows):
            d.text((10, r * (h + 28) + 8), labels[n], fill=(255, 210, 63))
            for c, v in enumerate(SHEET):
                im = Image.open(os.path.join(OUTDIR, f"{n}_{v}.jpg")).convert("RGB").resize((w, h), Image.LANCZOS)
                sheet.paste(im, (c * w, r * (h + 28) + 28))
        sheet.save(os.path.join(OUTDIR, "skimmer_proposals.jpg"), quality=90)
        print("sheet ->", os.path.join(OUTDIR, "skimmer_proposals.jpg"))
except ImportError:
    print("(pillow not installed: no contact sheet)")

# a before-and-after of the close-ups, when both B's were rendered
try:
    from PIL import Image, ImageDraw
    pair = [n for n in ("bprev", "b") if all(os.path.isfile(os.path.join(OUTDIR, f"{n}_{v}.jpg")) for v in DETAILS)]
    if len(pair) == 2:
        w, h = RES[0] // 2, RES[1] // 2
        sheet = Image.new("RGB", (w * len(DETAILS), (h + 28) * 2), (24, 20, 40))
        d = ImageDraw.Draw(sheet)
        for r, n in enumerate(pair):
            d.text((10, r * (h + 28) + 8), labels[n] + "  -  close-ups: tail fin and light, nose eye, phase coils", fill=(255, 210, 63))
            for c, v in enumerate(DETAILS):
                im = Image.open(os.path.join(OUTDIR, f"{n}_{v}.jpg")).convert("RGB").resize((w, h), Image.LANCZOS)
                sheet.paste(im, (c * w, r * (h + 28) + 28))
        sheet.save(os.path.join(OUTDIR, "skimmer_b_details.jpg"), quality=90)
        print("details ->", os.path.join(OUTDIR, "skimmer_b_details.jpg"))
except ImportError:
    pass
