# Chimera parts kit review sheet (the Specimen kit, build_chimera_kit.py). Puts chimeras together the way the game would, through the
# sockets (the legs' hip, the body's neck and back, the head's top), and renders to docs/chimera-proposals/:
#   set0.jpg, set1.jpg, set2.jpg   five chimeras in each of the parts' three looks (the same Latin square of kinds each time: car body on
#                                  mite legs with a person's head, sapling on car with a mite's, person on sapling with a car's and the
#                                  Triple Crown, mite on person with a sapling's; the fifth has two heads on one neck)
#   mods.jpg                       eight chimeras, each wearing one mutation's piece
#   revisions.jpg                  close on the reworked parts: the car's lower body, the person, the mite's wing cases, the sapling's roots
#   chimera_sheet.jpg              the four, on one sheet
# PREVIEW_OUT=<dir> writes them elsewhere; PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set the quality. Cycles on the CPU (a few minutes);
# Freestyle draws the comic ink outline.
#
#   pip install bpy pillow
#   MOONRUNNER_REPO=. python3 tools/blender/preview_chimera_kit.py [set0] [set1] [set2] [mods] [revisions]

import bpy, math, os, sys
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTDIR = os.environ.get("PREVIEW_OUT") or os.path.join(REPO, "docs", "chimera-proposals")
os.makedirs(OUTDIR, exist_ok=True)
SHOTS = [a for a in sys.argv[1:] if a in ("set0", "set1", "set2", "mods", "revisions")] or ["set0", "set1", "set2", "mods", "revisions"]
RES = (int(os.environ.get("PREVIEW_W", 1600)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 24))
GLOWS = {"glass": 2.2, "eye": 3.0, "lamp": 5.0, "red": 4.0, "splice": 4.0, "crystal": 4.0, "spark": 5.0, "voidglow": 4.0}
# (body, legs, head[, extra head])
BLENDS = [("car", "mite", "person"), ("sapling", "car", "mite"), ("person", "sapling", "car"), ("mite", "person", "sapling"), ("person", "car", "mite", "sapling")]
# (body, legs, head, alt of each, mutation)
MODDED = [("person", "car", "mite", 0, "crystal"), ("car", "sapling", "person", 1, "spark"), ("mite", "person", "car", 2, "radio"), ("sapling", "mite", "person", 0, "armor"),
          ("car", "person", "sapling", 2, "turbo"), ("person", "mite", "car", 1, "mud"), ("mite", "car", "sapling", 1, "void"), ("sapling", "person", "mite", 2, "lens")]
LABELS = {"set0": "SET 1 (the revised parts)", "set1": "SET 2 (each part's second look)", "set2": "SET 3 (each part's third look)", "mods": "MUTATIONS: crystal, spark, radio, armour, turbo, mud, void, lens"}


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
    noink = bpy.data.collections.new("NoInk")
    sc.collection.children.link(noink)
    noink.objects.link(g)
    sc.render.use_freestyle = True
    sc.render.line_thickness = 1.3
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    ls = vl.freestyle_settings.linesets.new("ink") if not vl.freestyle_settings.linesets else vl.freestyle_settings.linesets[0]
    ls.select_silhouette, ls.select_crease, ls.select_border = True, False, True
    ls.select_by_collection = True
    ls.collection = noink
    ls.collection_negation = "EXCLUSIVE"
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.linestyle.color = (0.02, 0.01, 0.06)
    ls.linestyle.thickness = 2.0
    return sc, g


def camera(sc, loc, target, lens=50):
    for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(o)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = lens
    sc.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam


def paint():
    for m in bpy.data.materials:
        n = m.name.split(".")[0]
        c = tuple(min(1, x) for x in m.diffuse_color[:3])
        if n in GLOWS:
            light_material(m, c, GLOWS[n])
        elif n != "ground":
            toon(m, c, 0.45)


def kit():
    g = {"__file__": os.path.join(REPO, "tools", "blender", "build_chimera_kit.py"), "CHIMERA_KIT_LIB": True}
    os.environ["MOONRUNNER_REPO"] = REPO
    exec(open(g["__file__"], encoding="utf-8").read(), g)
    return g


def chimera(g, tag, x, body, legs, heads, alt, yaw=28, mod=None, crown=False):
    """legs, then the body on the hip, the head(s) on the neck, a mutation on the back (or the lens on the head), maybe the crown"""
    bp, sk = g["build_part"], g["sockets"]
    L = bp("legs", legs, alt, f"{tag}_legs", (x, 0, 0))
    L.rotation_euler[2] = math.radians(yaw)
    B = bp("body", body, alt, f"{tag}_body", (0, 0, 0), sk(L)["hip"])
    neck = sk(B)["neck"]
    hs = []
    if len(heads) == 1:
        hs.append(bp("head", heads[0], alt, f"{tag}_head", (0, 0, 0), neck))
    else:                                                                       # two heads share the neck, leaning apart (as the game seats them)
        for k, (kind, dx, lean) in enumerate(((heads[0], -0.15, 0.28), (heads[1], 0.15, -0.28))):
            h = bp("head", kind, alt, f"{tag}_head{k}", (dx, 0, 0), neck)
            h.rotation_euler[1] = -lean
            hs.append(h)
    if mod:
        g["build_mod"](mod, f"{tag}_mod", sk(hs[0])["top"] if mod == "lens" else sk(B)["back"])
    if crown:
        g["BUILD_CROWN"](g["pivot"](f"{tag}_crown", (0, 0, 0), sk(hs[0])["top"]))
    return L


def render(sc, name):
    sc.render.filepath = os.path.join(OUTDIR, name + ".jpg")
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath)


for shot in SHOTS:
    sc, ground = scene_setup()
    g = kit()
    if shot.startswith("set"):
        alt = int(shot[-1])
        for i, b in enumerate(BLENDS):
            chimera(g, f"bl{i}", (i - 2) * 1.25, b[0], b[1], b[2:], alt, crown=(i == 2))
        paint()
        camera(sc, (0.6, -6.6, 1.9), (0.0, 0, 0.62), 40)
    elif shot == "mods":
        for i, (body, legs, head, alt, m) in enumerate(MODDED):
            chimera(g, f"md{i}", (i - 3.5) * 1.15, body, legs, (head,), alt, yaw=25 if m == "lens" else 150, mod=m)   # (backs to the camera: the pieces sit on the back)
        paint()
        camera(sc, (0.3, -10.4, 2.9), (0.0, 0, 0.6), 38)
    else:                                                                       # the reworked parts, close
        chimera(g, "rv0", -1.5, "car", "car", ("car",), 0, yaw=35)
        chimera(g, "rv1", -0.5, "person", "person", ("person",), 0, yaw=20)
        chimera(g, "rv2", 0.55, "mite", "mite", ("mite",), 0, yaw=60)
        chimera(g, "rv3", 1.6, "sapling", "sapling", ("sapling",), 0, yaw=20)
        paint()
        camera(sc, (0.2, -5.0, 1.75), (0.05, 0, 0.72), 40)
    render(sc, shot)

try:
    from PIL import Image, ImageDraw
    rows = [n for n in ("set0", "set1", "set2", "mods") if os.path.isfile(os.path.join(OUTDIR, n + ".jpg"))]
    if rows:
        w, h = RES[0] // 2, RES[1] // 2
        sheet = Image.new("RGB", (w * 2, (h + 28) * ((len(rows) + 1) // 2)), (24, 20, 40))
        d = ImageDraw.Draw(sheet)
        for i, n in enumerate(rows):
            x, y = (i % 2) * w, (i // 2) * (h + 28)
            d.text((x + 10, y + 8), LABELS[n], fill=(255, 210, 63))
            sheet.paste(Image.open(os.path.join(OUTDIR, n + ".jpg")).convert("RGB").resize((w, h), Image.LANCZOS), (x, y + 28))
        sheet.save(os.path.join(OUTDIR, "chimera_sheet.jpg"), quality=90)
        print("sheet ->", os.path.join(OUTDIR, "chimera_sheet.jpg"))
except ImportError:
    print("(pillow not installed: no contact sheet)")
