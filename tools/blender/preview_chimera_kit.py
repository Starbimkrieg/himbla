# Chimera parts kit review sheet. Builds each proposal's parts (build_chimera_kit.py) and puts chimeras together the way the game would,
# through the sockets (the legs' hip, the body's neck), then renders them to docs/chimera-proposals/<variant>_<view>.jpg and a sheet,
# chimera_proposals.jpg (PREVIEW_OUT=<dir> writes them elsewhere; PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set the quality).
#
#   pip install bpy pillow
#   MOONRUNNER_REPO=. python3 tools/blender/preview_chimera_kit.py [a] [b]
#
# The blends are a Latin square of the four kinds (each kind's legs, body and head appear once), and a fifth with two heads on one neck.
# Cycles on the CPU; Freestyle draws the comic ink outline.

import bpy, math, os, sys
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTDIR = os.environ.get("PREVIEW_OUT") or os.path.join(REPO, "docs", "chimera-proposals")
os.makedirs(OUTDIR, exist_ok=True)
NAMES = [a for a in sys.argv[1:] if a in ("a", "b")] or ["a", "b"]
RES = (int(os.environ.get("PREVIEW_W", 1600)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 32))
GLOWS = {"glass": 2.2, "eye": 3.0, "lamp": 5.0, "red": 4.0, "splice": 4.0}
# (body, legs, head[, extra head])
BLENDS = [("car", "mite", "person"), ("sapling", "car", "mite"), ("person", "sapling", "car"), ("mite", "person", "sapling"), ("person", "car", "mite", "sapling")]
LABELS = {"a": "A  PLUSH  (round toy shapes, big heads, stitched pink collars at the splice joints)", "b": "B  SPECIMEN  (lean, faceted, long-legged; steel clamps with a glowing splice band)"}


def light_material(m, rgb, strength):
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])


def toon(m, rgb, rough=0.5):
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    nt.links.new(b.outputs[0], out.inputs[0])


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
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.09, 0.07, 0.17, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = w
    for name, loc, energy, col in (("key", (4, -6, 6), 380, (1.0, 0.95, 0.88)), ("fill", (-6, -4, 3), 160, (0.55, 0.6, 1.0)), ("rim", (-2, 6, 4), 220, (1.0, 0.7, 0.9))):
        d = bpy.data.lights.new(name, "AREA")
        d.energy, d.size, d.color = energy, 4, col
        o = bpy.data.objects.new(name, d)
        sc.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.005))
    g = bpy.context.object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    toon(gm, (0.11, 0.09, 0.15), 0.9)
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
    ls.select_silhouette = True
    ls.select_crease = False
    ls.select_border = True
    ls.select_by_collection = True
    ls.collection = noink
    ls.collection_negation = "EXCLUSIVE"
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.linestyle.color = (0.02, 0.01, 0.06)
    ls.linestyle.thickness = 2.0


def camera(sc, loc, target, lens=50):
    for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(o)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = lens
    sc.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam


def render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


for v in NAMES:
    sc, ground = scene_setup()
    g = {"__file__": os.path.join(REPO, "tools", "blender", "build_chimera_kit.py"), "VARIANT": v, "CHIMERA_KIT_LIB": True}
    os.environ["MOONRUNNER_REPO"] = REPO
    exec(open(g["__file__"], encoding="utf-8").read(), g)
    build_part, sockets = g["build_part"], g["sockets"]
    # ---- the blends, side by side, each turned a little toward the camera ----
    gap = 1.25
    roots = []
    for i, b in enumerate(BLENDS):
        x = (i - (len(BLENDS) - 1) / 2) * gap
        legs = build_part("legs", b[1], f"bl{i}_legs", (x, 0, 0))
        legs.rotation_euler[2] = math.radians(28)
        body = build_part("body", b[0], f"bl{i}_body", (0, 0, 0), sockets(legs)["hip"])
        neck = sockets(body)["neck"]
        if len(b) == 3:
            hd = build_part("head", b[2], f"bl{i}_head", (0, 0, 0), neck)
            if i == 2:                                                          # (this one won the Triple Crown)
                g["BUILD_CROWN"](g["pivot"](f"bl{i}_crown", (0, 0, 0), sockets(hd)["top"]))
        else:                                                                   # two heads share the neck, leaning apart (as the game seats them)
            for k, (kind, dx, lean) in enumerate(((b[2], -0.15, 0.28), (b[3], 0.15, -0.28))):
                h = build_part("head", kind, f"bl{i}_head{k}", (dx, 0, 0), neck)
                h.rotation_euler[1] = -lean                                     # (about three.js z, which is Blender's -y)
        roots.append(legs)
    for m in bpy.data.materials:
        n = m.name.split(".")[0]
        c = tuple(min(1, x) for x in m.diffuse_color[:3])
        if n in GLOWS:
            light_material(m, c, GLOWS[n])
        elif n != "ground":
            toon(m, c, 0.45)
    freestyle(sc, [ground])
    camera(sc, (0.6, -6.6, 1.9), (0.0, 0, 0.62), 40)
    render(sc, os.path.join(OUTDIR, f"{v}_blends.jpg"))
    camera(sc, (-1.2, -3.4, 1.3), (-gap * 1.0, 0, 0.55), 45)               # close: the sapling-on-car blend and its joints
    render(sc, os.path.join(OUTDIR, f"{v}_closeup.jpg"))
    # ---- every part on its own, in rows: legs, bodies, heads ----
    for o in list(bpy.data.objects):
        if o.type in ("MESH", "EMPTY") and o is not ground:
            bpy.data.objects.remove(o)
    for r, slot in enumerate(("legs", "body", "head")):
        for i, kind in enumerate(g["KINDS"]):
            p = build_part(slot, kind, f"pt_{slot}_{kind}", ((i - 1.5) * 1.15, 0, (1 - r) * 1.3))      # (legs in front, heads at the back)
            p.rotation_euler[2] = math.radians(25)
    for m in bpy.data.materials:
        n = m.name.split(".")[0]
        c = tuple(min(1, x) for x in m.diffuse_color[:3])
        if n in GLOWS:
            light_material(m, c, GLOWS[n])
        elif n != "ground":
            toon(m, c, 0.45)
    camera(sc, (0.3, -6.4, 3.3), (0, 0.2, 0.3), 40)
    render(sc, os.path.join(OUTDIR, f"{v}_parts.jpg"))

try:
    from PIL import Image, ImageDraw
    rows = [n for n in ("a", "b") if all(os.path.isfile(os.path.join(OUTDIR, f"{n}_{k}.jpg")) for k in ("blends", "parts"))]
    if rows:
        w, h = RES[0] // 2, RES[1] // 2
        sheet = Image.new("RGB", (w * 2, (h + 28) * len(rows)), (24, 20, 40))
        d = ImageDraw.Draw(sheet)
        for r, n in enumerate(rows):
            d.text((10, r * (h + 28) + 8), LABELS[n], fill=(255, 210, 63))
            for c, k in enumerate(("blends", "parts")):
                im = Image.open(os.path.join(OUTDIR, f"{n}_{k}.jpg")).convert("RGB").resize((w, h), Image.LANCZOS)
                sheet.paste(im, (c * w, r * (h + 28) + 28))
        sheet.save(os.path.join(OUTDIR, "chimera_proposals.jpg"), quality=90)
        print("sheet ->", os.path.join(OUTDIR, "chimera_proposals.jpg"))
except ImportError:
    print("(pillow not installed: no contact sheet)")
