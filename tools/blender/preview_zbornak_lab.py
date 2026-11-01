# Review renders for the Antimatter Lab drafts (build_zbornak_lab.py): builds a draft, dresses it for Cycles (glow slots
# lit, glass see-through, the screens painted with their pictures), stands real chimeras in the pods, on the bench and in
# the corrals (GLBs exported from the game by tools/zbornak-chimeras.mjs), the courier on the airlock's stand plate, and
# renders each view in CAMS to docs/zbornak-proposals/<v>_<view>.jpg, Zbornak's turnaround to <v>_zbornak.jpg, and the
# sheet zbornak_proposals.jpg.
#
#   node tools/zbornak-chimeras.mjs                      (once, with the dev server up: the chimeras, to ZB_CHIMERAS)
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py photo [a] [b]     the security camera's snapshot
#   node tools/zbornak-screens.mjs                       (the screens' pictures, from docs/zbornak-proposals/screens/*.html)
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py views [a] [b]     every view (PREVIEW_VIEWS=over,gate: some)
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py zbornak [a] [b]   the turnaround
#   MOONRUNNER_REPO=. python3 tools/blender/preview_zbornak_lab.py sheet
# PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set the quality. Cycles on the CPU, Freestyle for the ink.

import bpy, math, os, sys
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "docs", "zbornak-proposals")
SCREENS = os.path.join(OUT, "screens")
CHIMDIR = os.environ.get("ZB_CHIMERAS", "/tmp/zb-chimeras")
MODE = sys.argv[1] if len(sys.argv) > 1 else "views"
VARS = [a for a in sys.argv[2:] if a in ("a", "b")] or ["a", "b"]
ONLY = [v for v in os.environ.get("PREVIEW_VIEWS", "").split(",") if v]
RES = (int(os.environ.get("PREVIEW_W", 1280)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 48))
GLOW_POWER = {"lamp": 6, "window": 3.5, "screen": 1.6, "spark": 12, "weld": 25, "pinkhot": 12, "holo": 2.5, "beam": 1.6, "scan": 1.0,
              "halo": 2.0, "water": 0.8, "feed": 3, "feed2": 3, "ember": 8, "iris": 4, "goggle": 3, "screenlit": 3}


def tb(p):
    return (p[0], -p[2], p[1])


_chim_src = {}


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


def paint_screens(variant):
    for o in [o for o in bpy.data.objects if o.type == "MESH" and "screen" in o.keys()]:
        sid = o["screen"]
        path = os.path.join(SCREENS, f"{sid}_{variant}.png")
        me = o.data
        uv = me.uv_layers.new(name="uv")
        vs = [v.co for v in me.vertices]
        # the quad's own axes: first edge along u, the other along v (vertices 0..3 from plane())
        o0, ou, ov = vs[0], vs[1] - vs[0], vs[3] - vs[0]
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


def runner(p, yaw):
    roots, new = import_glb(os.path.join(REPO, "src", "assets", "runner.glb"))
    top = bpy.data.objects.new("runner", None)
    bpy.context.scene.collection.objects.link(top)
    for r in roots:
        r.parent = top
    top.location = tb(p)
    top.rotation_euler = (0, 0, yaw)
    extras = [o for o in new if o.name.split(".")[0] in ("padL", "padR", "band", "crest", "antenna")]
    for e in extras:
        for o in [e] + list(e.children_recursive):
            o.hide_render = True
    return top, new


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


def build(variant, figure_only=False):
    sc = scene_setup()
    G = {"__file__": os.path.join(REPO, "tools", "blender", "build_zbornak_lab.py"), "VARIANT": variant}
    os.environ["MOONRUNNER_EXPORT"] = "0"
    os.environ["MOONRUNNER_REPO"] = REPO
    exec(open(G["__file__"], encoding="utf-8").read(), G)
    dress(G)
    return sc, G


def setup_world(sc, G, variant):
    skip = ground(sc)
    paint_screens(variant)
    lights(G)
    skip += texts(G)
    for parent, p, yaw, scale, idx in G["CHIMS"]:
        chimera(idx, parent, p, yaw, scale)
    rp, ryaw = G["RUNNER"]["gate"]
    rt, rnew = runner(rp, ryaw)
    for o in bpy.data.objects:
        if o.type == "MESH" and o.get("ink", 1) == 0:
            skip.append(o)
    freestyle(sc, skip)
    return rt


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
PLAN = {
    "a": [("Rotunda: reactor under the oculus", 0, -18, -60, -330), ("Airlock tunnel + lock housing", 0, 22, -180, 40), ("Security post (stand plate, camera)", 0, 35.6, -150, 110),
          ("Plaza + specimen jar", 10.5, 37, 60, 140), ("Holotable", -12, -2.6, -160, 60), ("LABNET terminal", 14.4, -2, 140, 230), ("Zbornak's dais", 5.1, -5.5, 120, 160),
          ("Robotics bay", 20.8, -20.9, 130, -170), ("Exotic matter vault", 13.5, -41.4, 140, -110), ("Splice pod", 0, -41.5, -20, -230), ("Cryo pods (6)", -13.3, -41, -160, -150),
          ("Hydroponics", -24.5, -13.2, -120, -10), ("Ranch barn", 74, -26, 40, -150), ("Pen office: pen terminal", 57, -24.5, -30, -210), ("Silo + auger", 93.5, -30, 60, -90),
          ("Feed bunk", 93, 8, 70, 40), ("Corral", 74, 30, 60, 210), ("Training ring", 70, 26, -120, 140), ("Gate arch", 50, 16, -160, 30), ("Stock tank + sun-mill", 56, 39, -150, 160),
          ("Supply landing pad", -62, 58, -1, 0), ("Radiator field", -4, -84, -1, 0), ("Solar array", -84, 8, -1, 0)],
    "b": [("Gatehouse: two-stage airlock", 0, 15, 150, 50), ("Iris door + security post", 0, 24, 170, 120), ("Hydroponics", -13, -7, -170, 10), ("Cryo gallery (8)", -14.6, -28, -170, -40),
          ("SPECIMEN INDEX terminal", -12.6, -45, -170, 30), ("Exotic matter vault", 12.7, -8, 150, -20), ("Robot line", 12, -29, 170, -30), ("Splice pod", 12.5, -50, 170, 10),
          ("Holotables", 0, -19, 120, -150), ("Zbornak's podium", 0, -50, 120, 120), ("Reactor tower", 0, -76, 140, -100), ("Bunkhouse: pen terminal", -70, -30, -40, -170),
          ("Feed carousel", -72, 8, -150, -150), ("Round corral", -86, 18, -120, 70), ("Training ring", -74, 44, 120, 90), ("Water tower", -94, -12, -60, -170), ("Sun-mill", -98, -22, -100, -60),
          ("Gate arch", -55, 8, 80, -120), ("Specimen jar", 17, 26, 150, 60),
          ("Supply landing pad", 52, 42, 1, 0), ("Radiator field", 50, -40, 1, 0), ("Test Site 7", 58, -86, 1, 0)],
}

if MODE == "photo":
    # what the airlock's camera sees: the courier on the stand plate, from the door, a little above
    os.makedirs(SCREENS, exist_ok=True)
    for v in VARS:
        sc, G = build(v)
        setup_world(sc, G, v)
        sc.render.use_freestyle = False
        rp, _ = G["RUNNER"]["gate"]
        sc.render.resolution_x, sc.render.resolution_y = 480, 360
        camera(sc, (rp[0] + 0.25, 2.9, rp[2] - 2.9), (rp[0], 1.7, rp[2]), 44)
        render(sc, os.path.join(SCREENS, f"photo_{v}.jpg"))
elif MODE == "views":
    for v in VARS:
        sc, G = build(v)
        setup_world(sc, G, v)
        for name, (loc, tgt, lens) in G["CAMS"].items():
            if ONLY and name not in ONLY:
                continue
            cutaway(name == "cut")
            camera(sc, loc, tgt, lens)
            render(sc, os.path.join(OUT, f"{v}_{name}.jpg"))
elif MODE == "zbornak":
    for v in VARS:
        sc = scene_setup()
        B = {"VARIANT": v, "__file__": os.path.join(REPO, "tools", "blender", "build_zbornak_lab.py")}
        os.environ["MOONRUNNER_EXPORT"] = "0"
        os.environ["MOONRUNNER_REPO"] = REPO
        src = open(B["__file__"], encoding="utf-8").read().split("ROOT = build()")[0]
        exec(src, B)
        B["zbornak"](None, v, 0, 0, 0)
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
        h = 1.25 if v == "a" else 1.1
        shots = []
        for k, (ang, el) in enumerate(((0.0, 0.0), (0.7, 0.05), (math.pi / 2, 0.0), (math.pi * 0.85, 0.0))):
            d = 6.0
            loc = (math.sin(ang) * d, h + 0.4 + el * d, math.cos(ang) * d)
            camera(sc, loc, (0, h, 0), 50)
            p = os.path.join(OUT, f"{v}_zbornak_{k}.jpg")
            render(sc, p)
            shots.append(p)
        sc.render.resolution_x, sc.render.resolution_y = 900, 900
        hy = 2.1 if v == "a" else 1.8
        camera(sc, (0.55, hy + 0.05, 1.35), (0.0, hy - 0.05, 0.1), 50)
        p = os.path.join(OUT, f"{v}_zbornak_face.jpg")
        render(sc, p)
        from PIL import Image
        ims = [Image.open(s) for s in shots]
        sheet = Image.new("RGB", (640 * 4, 900))
        for i, im in enumerate(ims):
            sheet.paste(im, (640 * i, 0))
        sheet.save(os.path.join(OUT, f"{v}_zbornak.jpg"), quality=90)
        for s in shots:
            os.remove(s)
elif MODE == "plan":
    # top-down, roofs off, labelled: the plateau (r 120) fills the frame, +x right, +z (the front) down
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 17)
    SPAN, PX = 250.0, 1400
    for v in VARS:
        sc, G = build(v)
        setup_world(sc, G, v)
        cutaway(True)
        sc.render.resolution_x = sc.render.resolution_y = PX
        sc.render.line_thickness = 1.0
        for o in [o for o in bpy.data.objects if o.type == "CAMERA"]:
            bpy.data.objects.remove(o)
        cam = bpy.data.objects.new("plan", bpy.data.cameras.new("plan"))
        cam.data.type, cam.data.ortho_scale = "ORTHO", SPAN
        cam.data.clip_end = 1000
        sc.collection.objects.link(cam)
        cam.location = (0, 0, 300)
        cam.rotation_euler = (0, 0, 0)
        sc.camera = cam
        path = os.path.join(OUT, f"plan_{v}.jpg")
        render(sc, path)
        im = Image.open(path).convert("RGB")
        d = ImageDraw.Draw(im)
        d.ellipse([PX / 2 - 120 / SPAN * PX, PX / 2 - 120 / SPAN * PX, PX / 2 + 120 / SPAN * PX, PX / 2 + 120 / SPAN * PX], outline=(255, 210, 63), width=2)
        for side in (-1, 1):                                                # labels stacked in the margins, kept apart
            items = sorted([(PX / 2 + z / SPAN * PX, PX / 2 + x / SPAN * PX, text) for text, x, z, dx, dy in PLAN[v] if (x < 0 or (x == 0 and dx < 0)) == (side < 0)])
            ys, last = [], -1e9
            for py, px, text in items:
                last = max(py, last + 30)
                ys.append(last)
            shift = max(0, ys[-1] - (PX - 30)) if ys else 0
            for (py, px, text), ty in zip(items, ys):
                ty -= shift
                w = d.textlength(text, font=font)
                bx = 24 if side < 0 else PX - 24 - w - 8
                tx = bx + w + 8 if side < 0 else bx
                d.line([px, py, tx, ty], fill=(255, 210, 63), width=2)
                d.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(255, 210, 63))
                d.rectangle([bx, ty - 12, bx + w + 8, ty + 12], fill=(14, 10, 26))
                d.text((bx + 4, ty - 10), text, fill=(255, 240, 200), font=font)
        d.text((16, 14), "plateau r 120 m (yellow ring) · top view, roofs off · the front (+z) is down · 250 m across", fill=(255, 240, 200), font=font)
        im.save(path, quality=90)
elif MODE == "sheet":
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
    names = {"a": "A  THE ROTUNDA", "b": "B  THE INSTITUTE"}
    views = ("over", "gate", "cut", "inside", "ranch", "term")
    w, h = 640, 360
    sheet = Image.new("RGB", (w * len(views), (h + 44) * 2), (14, 10, 26))
    d = ImageDraw.Draw(sheet)
    for r, v in enumerate(("a", "b")):
        d.text((12, r * (h + 44) + 8), names[v], fill=(255, 210, 63), font=font)
        for c, name in enumerate(views):
            p = os.path.join(OUT, f"{v}_{name}.jpg")
            if os.path.isfile(p):
                sheet.paste(Image.open(p).resize((w, h)), (c * w, r * (h + 44) + 44))
    sheet.save(os.path.join(OUT, "zbornak_proposals.jpg"), quality=88)
    print("sheet written")
