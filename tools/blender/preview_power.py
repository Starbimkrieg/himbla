# Power Block redesign review sheet. Builds each proposal (build_power.py) in one scene with a little context (the ground, a
# stub of the glass skywalk that docks at x -12.6, a person for scale), renders hub-side, outside, broadside and top views, and
# puts them together in docs/power-proposals: power_<variant>_sheet.jpg each and power_proposals.jpg for both (PREVIEW_OUT=<dir>
# writes elsewhere; the single views go to a temp folder unless PREVIEW_KEEP=1 keeps them beside the sheets as
# <variant>_<view>.png; PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES set quality; PREVIEW_VIEWS=hub,top renders only those).
# The builds export as usual, so src/assets/power.glb comes out plain: run npm run optimize:glb after.
#
#   MOONRUNNER_REPO=. blender -b --factory-startup --python tools/blender/preview_power.py -- [a] [b]
#
# Cycles on the CPU with the denoiser; Freestyle draws the ink. Toon slots are plain diffuse, glow slots emit.

import bpy, math, os, sys, tempfile
import numpy as np
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTDIR = os.environ.get("PREVIEW_OUT") or os.path.join(REPO, "docs", "power-proposals")
os.makedirs(OUTDIR, exist_ok=True)
VIEWDIR = OUTDIR if os.environ.get("PREVIEW_KEEP") == "1" else tempfile.mkdtemp(prefix="power-views-")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
NAMES = [a for a in ARGS if a in ("a", "b")] or ["a", "b"]
ONLY = [v for v in os.environ.get("PREVIEW_VIEWS", "").split(",") if v]
RES = (int(os.environ.get("PREVIEW_W", 1280)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 24))
BUILDER = os.path.join(REPO, "tools", "blender", "build_power.py")

# camera position and aim, three.js axes in the wing frame (+x away from the hub)
VIEWS = {
    "hub": ((-44, 24, 38), (12, 7, 0)),     # from the hub side, over the skywalk
    "out": ((66, 28, -44), (12, 7, 0)),     # from outside the base
    "side": ((10, 10, 78), (10, 8, 0)),     # broadside from +z
    "top": ((8, 110, 6), (8, 0, 0)),        # plan
}
GLOW = {"lamp": 4.0, "cyan": 4.0, "hot": 7.0, "red": 7.0, "plasma": 6.0, "plasmaCore": 9.0}


def tb(p):
    return Vector((p[0], -p[2], p[1]))


def lin(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def build(v):
    g = {"VARIANT": v, "__file__": BUILDER, "__name__": "power_builder"}
    exec(open(BUILDER, encoding="utf-8").read(), g)
    return g


def context(figures):
    """ground, skywalk stub and one person per proposal (each in its own collection, shown with its proposal)"""
    g = {"COLL": "PowerCtx", "SLOT_COLORS": {k: tuple(lin(h)) for k, h in {
        "ground": 0xcfc8d6, "glass": 0x9be7ff, "floor": 0x3a3550, "rib": 0xfff4e0, "suit": 0xff9f1c, "visor": 0x2a2540}.items()}}
    exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), g)
    g["C"] = g["coll"]()
    xf, mesh = g["xf"], g["mesh"]
    box = lambda w, h, d: g["cuboid"](w, h, d)[:2]
    mesh("ctx_ground", xf(g["cylinder"](260, 260, 0.02, 64)[:2], (0, -0.012, 0)), "ground", None, 0)
    # skywalk stub: floor slab, glass walls and vault, ribs (it runs 1.2 m into the vestibule, as in the game)
    x0, x1, F, R = -36.0, -11.4, 0.6, 2.8
    L, xc = x1 - x0, (x0 + x1) / 2
    mesh("ctx_floor", xf(box(L, F, 6.4), (xc, F / 2, 0)), "floor", None, 0.08)
    walls = [xf(box(L, 2.0, 0.04), (xc, F + 1.0, s * R)) for s in (-1, 1)]
    vault = xf(g["cylinder_arc"](R, R, L, 18, math.pi, math.pi)[:2], (xc, F + 2.0, 0), (0, 0, -math.pi / 2))
    mesh("ctx_glass", g["join"](walls + [vault]), "glass", None, 0)
    ribs = []
    for x in range(int(x0) + 3, int(x1), 5):
        ribs.append(xf(g["torus_partial"](R, 0.16, 6, 14, math.pi)[:2], (x, F + 2.0, 0), (0, math.pi / 2, 0)))
        ribs += [xf(box(0.32, 2.0, 0.32), (x, F + 1.0, s * R)) for s in (-1, 1)]
    mesh("ctx_ribs", g["join"](ribs), "rib", None, 0.04)
    people = {}
    for v, (px, pz) in figures.items():
        c = bpy.data.collections.new(f"PowerCtx{v.upper()}")
        bpy.context.scene.collection.children.link(c)
        g["C"] = c
        mesh(f"ctx_suit_{v}", xf(g["cylinder"](0.3, 0.26, 1.4, 12)[:2], (px, 0.7, pz)), "suit", None, 0.03)
        mesh(f"ctx_head_{v}", xf(g["sphere"](0.25, 12, 8)[:2], (px, 1.6, pz)), "visor", None, 0.03)
        people[v] = c
    return people


def palette():
    for m in bpy.data.materials:
        h = HEXES.get(m.name)
        if h is None:
            continue
        col = (*lin(h), 1)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        if m.name in GLOW:
            sh = nt.nodes.new("ShaderNodeEmission")
            sh.inputs["Color"].default_value = col
            sh.inputs["Strength"].default_value = GLOW[m.name]
            nt.links.new(sh.outputs[0], out.inputs[0])
        elif m.name == "glass":
            sh = nt.nodes.new("ShaderNodeBsdfPrincipled")
            sh.inputs["Base Color"].default_value = col
            sh.inputs["Alpha"].default_value = 0.22
            sh.inputs["Roughness"].default_value = 0.1
            nt.links.new(sh.outputs[0], out.inputs[0])
        else:
            sh = nt.nodes.new("ShaderNodeBsdfDiffuse")
            sh.inputs["Color"].default_value = col
            nt.links.new(sh.outputs[0], out.inputs[0])


def stage():
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = SAMPLES
    scn.cycles.use_denoising = True
    scn.render.resolution_x, scn.render.resolution_y = RES
    scn.render.resolution_percentage = 100
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("Space")
    scn.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*lin(0x14102a), 1)
    bg.inputs["Strength"].default_value = 1.0
    for name, energy, d, col in (("Sun", 3.4, (-0.45, 0.8, 0.42), (1, 1, 1)), ("Fill", 0.7, (0.6, 0.35, -0.7), (0.7, 0.75, 1.0))):
        o = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        o.data.energy, o.data.color, o.data.angle = energy, col, math.radians(4)
        o.rotation_euler = tb(d).normalized().to_track_quat("Z", "Y").to_euler()
        scn.collection.objects.link(o)
    scn.render.use_freestyle = True
    scn.render.line_thickness_mode = "ABSOLUTE"
    scn.render.line_thickness = 1.4
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    for ls in list(vl.freestyle_settings.linesets):
        vl.freestyle_settings.linesets.remove(ls)
    ls = vl.freestyle_settings.linesets.new("ink")
    ls.select_silhouette = ls.select_border = ls.select_crease = True
    ls.linestyle.color = lin(0x0b0612)
    ls.linestyle.thickness = 1.4
    vl.freestyle_settings.crease_angle = math.radians(50)


def show(v, people):
    for n in NAMES:
        for c in (bpy.data.collections.get(f"Power{n.upper()}"), people[n]):
            c.hide_render = n != v


def render(v):
    scn = bpy.context.scene
    cam = bpy.data.objects.get("PrevCam") or bpy.data.objects.new("PrevCam", bpy.data.cameras.new("PrevCam"))
    if cam.name not in scn.collection.objects:
        scn.collection.objects.link(cam)
    cam.data.lens = 30
    cam.data.clip_end = 2000
    scn.camera = cam
    paths = []
    for name, (pos, aim) in VIEWS.items():
        if ONLY and name not in ONLY:
            continue
        cam.location = tb(pos)
        cam.rotation_euler = (tb(aim) - tb(pos)).to_track_quat("-Z", "Y").to_euler()
        scn.render.filepath = os.path.join(VIEWDIR, f"{v}_{name}.png")
        bpy.ops.render.render(write_still=True)
        print("rendered", scn.render.filepath)
        paths.append(scn.render.filepath)
    return paths


def pixels(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(h, w, 4)[::-1]          # top row first


def sheet(rows, out, half=True):
    """rows of image paths -> one JPEG (each tile halved), rows top to bottom"""
    tiles = [[pixels(p) for p in r] for r in rows]
    if half:
        tiles = [[t.reshape(t.shape[0] // 2, 2, t.shape[1] // 2, 2, 4).mean(axis=(1, 3)) for t in r] for r in tiles]
    gap = 6
    def pad_row(r):
        parts = []
        for i, t in enumerate(r):
            parts.append(t)
            if i < len(r) - 1:
                parts.append(np.ones((t.shape[0], gap, 4), dtype=np.float32))
        return np.concatenate(parts, axis=1)
    rws = [pad_row(r) for r in tiles]
    width = max(r.shape[1] for r in rws)
    full = []
    for i, r in enumerate(rws):
        if r.shape[1] < width:
            r = np.concatenate([r, np.ones((r.shape[0], width - r.shape[1], 4), dtype=np.float32)], axis=1)
        full.append(r)
        if i < len(rws) - 1:
            full.append(np.ones((gap, width, 4), dtype=np.float32))
    img = np.ascontiguousarray(np.concatenate(full, axis=0)[::-1])
    h, w = img.shape[:2]
    im = bpy.data.images.new("sheet", w, h, alpha=False)
    im.pixels.foreach_set(img.ravel())
    im.filepath_raw = out
    im.file_format = "JPEG"
    im.save()
    print("sheet", out, w, h)


bpy.ops.wm.read_factory_settings(use_empty=True)
HEXES = {}
figures = {}
for v in NAMES:
    gl = build(v)
    HEXES.update(gl["HEX"])
    figures[v] = gl["FIGURE"]
people = context(figures)
HEXES.update({"ground": 0xcfc8d6, "glass": 0x9be7ff, "floor": 0x3a3550, "rib": 0xfff4e0, "suit": 0xff9f1c, "visor": 0x2a2540})
palette()
stage()
rows = []
for v in NAMES:
    show(v, people)
    rows.append(render(v))
if len(rows) > 1 and all(len(r) == len(rows[0]) for r in rows):
    sheet(rows, os.path.join(OUTDIR, "power_proposals.jpg"))
for v, r in zip(NAMES, rows):
    if len(r) == 4:
        sheet([r[:2], r[2:]], os.path.join(OUTDIR, f"power_{v}_sheet.jpg"), half=False)
