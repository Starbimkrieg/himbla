# Chimera Downs dome review renders. Builds the dome (build_downs_dome.py, without exporting) over a block model of the Downs
# (the stands, arcades and gate halls, clubhouse, forecourt, drum, stables, annex and wheel, from src/downsPlan.js's numbers) and
# renders a set of views into PREVIEW_OUT (default: a temp folder), plus dome_sheet.jpg of them all.
#
#   MOONRUNNER_REPO=. blender -b --factory-startup --python tools/blender/preview_dome.py -- [view ...]
#
# Env: PREVIEW_OUT, PREVIEW_W / PREVIEW_H / PREVIEW_SAMPLES (quality), PREVIEW_OPEN=1 (the main lock's outer door open).
# Cycles on the CPU with the denoiser, two passes a view: everything but the glass with Freestyle ink, then the glass alone with
# everything else held out; the glass is laid over the first with numpy. Toon slots are plain diffuse, glow slots emit.

import bpy, math, os, sys, tempfile
import numpy as np
from mathutils import Vector

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTDIR = os.environ.get("PREVIEW_OUT") or tempfile.mkdtemp(prefix="dome-views-")
os.makedirs(OUTDIR, exist_ok=True)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RES = (int(os.environ.get("PREVIEW_W", 1280)), int(os.environ.get("PREVIEW_H", 720)))
SAMPLES = int(os.environ.get("PREVIEW_SAMPLES", 24))
BUILDER = os.path.join(REPO, "tools", "blender", "build_downs_dome.py")

# camera position, aim and lens, three.js axes in the Downs frame
VIEWS = {
    "aerial": ((390, 240, 480), (0, 20, 30), 30),        # the whole dome from the south-east, high
    "elevation": ((0, 70, -1150), (0, 58, 0), 62),        # side on from the far stand's side: the profile
    "main": ((44, 9, 318), (0, 10, 268), 26),             # the main lock from the approach
    "west": ((-330, 24, -70), (-268, 10, 0), 28),          # the west lock from outside, three-quarter
    "gatehouse": ((16, 7, 197), (0, 13, 236), 28),        # inside: the main lock's gatehouse from the forecourt gate
    "inside": ((-60, 30, 108), (40, 62, -150), 22),        # inside: from the main stand's top, across to the far side
}
GLOW = {"glasswarm": 3.0, "glowgold": 4.0, "glowmint": 3.0, "glowred": 6.0, "glowgreen": 6.0}
CTX = {"ground": 0x8f8a9c, "slate": 0x6d6a78, "suit": 0xff9f1c, "visor": 0x2a2540, "rover": 0x2ec4ff}
GLASS = ("dn_dome_glass", "dn_dome_drumGlass")


def tb(p):
    return Vector((p[0], -p[2], p[1]))


def lin(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def build():
    os.environ["MOONRUNNER_EXPORT"] = "0"
    g = {"__file__": BUILDER, "__name__": "dome_builder"}
    exec(open(BUILDER, encoding="utf-8").read(), g)
    return g


def context(g):
    """block model of the Downs (downsPlan.js numbers), in its own collection"""
    for k, h in CTX.items():
        g["SLOT_COLORS"][k] = tuple(lin(h))
        g["material"](k)
    c = bpy.data.collections.new("DownsCtx")
    bpy.context.scene.collection.children.link(c)
    g["C"] = c
    Acc, xf, PI = g["Acc"], g["xf"], math.pi
    A = {s: Acc("ctx_" + s, s, None, 0.03) for s in ("ground", "money", "money2", "saddle", "mint", "mint2", "barn", "black", "black2", "gold", "slate", "suit", "visor", "rover")}
    A["ground"].ink = A["money"].ink = A["money2"].ink = A["saddle"].ink = A["slate"].ink = 0.0
    A["ground"].add(g["cylinder"](1800, 1800, 0.02, 96)[:2], t=(0, -0.012, 0))

    def stadium(r, n=40):
        pts = [(90 + r * math.cos(-PI / 2 + PI * i / n), r * math.sin(-PI / 2 + PI * i / n)) for i in range(n + 1)]
        return pts + [(-90 + r * math.cos(PI / 2 + PI * i / n), r * math.sin(PI / 2 + PI * i / n)) for i in range(n + 1)]
    A["money"].polyy(stadium(44.6), 0.0, 0.03)
    o, i = stadium(64.8), stadium(44.6)
    m = len(o)
    verts = [(x, 0.035, z) for x, z in o] + [(x, 0.035, z) for x, z in i]
    A["saddle"].geos.append((verts, [(k, (k + 1) % m, m + (k + 1) % m, m + k) for k in range(m)]))
    # stands: a raked mass with a seat slab and a roof, as side profiles along x
    for s, hw, z0, back, top, rise, roof in ((1, 114, 76, 113.8, 22.4, 16.5, (71.5, 22.9, 115.5, 26.0)), (-1, 95, 76, 96.0, 14.6, 8.8, (72.5, 15.3, 99.5, 17.8))):
        prof = [(z0, 0), (back, 0), (back, top), (back - 3.6, top), (back - 3.6, rise), (z0, 1.1)]
        A["mint2"].polyx([(s * z, y) for z, y in prof], -hw, hw)
        A["money"].polyx([(s * z0 + s * 0.2, 1.15), (s * (back - 3.6), rise + 0.05), (s * (back - 3.6), rise + 0.3), (s * z0 + s * 0.2, 1.4)], -hw + 0.5, hw - 0.5)
        za, ya, zb, yb = roof
        A["barn"].polyx([(s * za, ya), (s * zb, yb), (s * zb, yb + 0.8), (s * za, ya + 0.8)], -hw - 1, hw + 1)
        for sx in (-1, 1):
            A["mint"].box(sx * (hw - 4), sx * (hw + 4), 0, top + 4, s * z0, s * (z0 + 9))
    # clubhouse, forecourt, fountain, main gate
    A["mint"].box(-30, 30, 0, 20, 115, 142)
    A["barn"].add(g["hip"](0, 1, 6), t=(0, 23, 128.5), s=(31 / 0.7071, 1, 14 / 0.7071))
    A["slate"].box(-70, 70, 0.0, 0.05, 142, 195.5)
    A["money2"].cylc(0, 0.35, 166, 12, 0.7, 32)
    A["mint"].cylc(0, 1.2, 166, 4, 2.4, 20)
    for sx in (-1, 1):
        A["mint"].box(sx * 11.1, sx * 13.9, 0, 12, 191.6, 194.4)
    A["barn"].box(-11.1, 11.1, 9.0, 10.4, 192.5, 193.5)
    # arcades round the turns, gate halls in their middles
    for mir in (1, -1):
        cx = -90 * mir
        pts = [(cx + mir * 100 * math.cos(math.radians(a)), 100 * math.sin(math.radians(a))) for a in range(105, 271, 5)]
        pts += [(cx + mir * 84 * math.cos(math.radians(a)), 84 * math.sin(math.radians(a))) for a in range(270, 104, -5)]
        A["mint"].polyy(pts, 0, 7.2)
        pr = [(cx + mir * 101 * math.cos(math.radians(a)), 101 * math.sin(math.radians(a))) for a in range(105, 271, 5)]
        pr += [(cx + mir * 83 * math.cos(math.radians(a)), 83 * math.sin(math.radians(a))) for a in range(270, 104, -5)]
        A["barn"].polyy(pr, 7.2, 8.2)
        gx = -182 * mir
        A["mint"].box(gx - 11, gx + 11, 0, 17, -16, 16)
        A["barn"].add(g["hip"](0, 1, 5), t=(gx, 19.5, 0), s=(11.5 / 0.7071, 1, 16.5 / 0.7071))
    # drum and podiums
    A["black2"].box(-5, 5, 0, 17.3, -5, 5)
    A["black"].box(-20.5, 20.5, 17.2, 38.8, -7.5, 7.5)
    A["mint"].box(-20.8, 20.8, 38.6, 39.6, -7.8, 7.8)
    for x in (-30, 0, 30):
        A["gold"].box(x - 9.6, x + 9.6, 0, 1.4, 15.9, 21.0)
    # infield: parade ring, weighing room, lawn
    A["money2"].polyy([(-96 + 26 * math.cos(2 * PI * k / 40), 18 * math.sin(2 * PI * k / 40)) for k in range(40)], 0.0, 0.06)
    A["mint"].box(-65.2, -52, 0, 6, -9.2, 9.2)
    A["money2"].cylc(100, 0.03, 0, 28, 0.06, 32)
    # stables and barn
    for x, z0, z1 in ((-36, -135.2, -123.6), (36, -135.2, -123.6), (-36, -116.4, -104.8), (36, -116.4, -104.8)):
        A["barn"].box(x - 15.3, x + 15.3, 0, 4.5, z0, z1)
    A["barn"].box(-12.2, 12.2, 0, 9, -140.2, -126)
    # annex: plaza, ticket hall, carousel, ferris wheel on its A-frames
    A["money2"].box(124, 206, 0.0, 0.05, 106, 168)
    A["mint"].box(160, 182, 0, 6, 110, 118)
    A["black2"].cylc(142, 0.35, 134, 9, 0.7, 24)
    A["barn"].cylc(142, 8.5, 134, 10, 3.0, 24, rt=0.5)
    A["gold"].cylc(142, 4.0, 134, 0.6, 7.4, 10)
    for zr in (154.9, 157.1):
        A["mint"].tor(22, 0.35, t=(175, 27, zr), rot=(PI / 2, 0, 0), n=48, rs=6)
    for k in range(12):
        a = 2 * PI * k / 12
        A["mint"].bm((175, 27, 156), (175 + 22 * math.cos(a), 27 + 22 * math.sin(a), 156), 0.12, 4)
    for sx in (-1, 1):
        for sz in (-1, 1):
            A["mint"].bm((175 + sx * 8, 0, 156 + sz * 3.5), (175, 27, 156 + sz * 2.8), 0.35, 6)
    # scale: a courier at each lock's pedestrian door, a rover on the main lock's apron
    for x, z in ((g["PX"] + 2.5, 277.5), (-30, 236), (-2.0, 280.5)):
        A["suit"].cylc(x, 0.85, z, 0.3, 1.4, 12, rt=0.26)
        A["visor"].add(g["sphere"](0.25, 12, 8)[:2], t=(x, 1.75, z))
    A["rover"].box(-1.45, 1.45, 0.5, 2.5, 279, 285)
    A["black2"].box(-1.6, 1.6, 0.0, 0.9, 279.3, 284.7)
    for a in A.values():
        a.flush()
    return c


def palette(hexes):
    for m in bpy.data.materials:
        h = hexes.get(m.name)
        if h is None:
            continue
        col = (*lin(h), 1)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        if m.name == "domeglass":
            lw = nt.nodes.new("ShaderNodeLayerWeight")
            lw.inputs["Blend"].default_value = 0.5
            pw = nt.nodes.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 2.0
            mu = nt.nodes.new("ShaderNodeMath"); mu.operation = "MULTIPLY_ADD"; mu.inputs[1].default_value = 0.45; mu.inputs[2].default_value = 0.1
            nt.links.new(lw.outputs["Facing"], pw.inputs[0]); nt.links.new(pw.outputs[0], mu.inputs[0])
            em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = col; em.inputs["Strength"].default_value = 0.7
            gl = nt.nodes.new("ShaderNodeBsdfGlossy"); gl.inputs["Roughness"].default_value = 0.06
            ad = nt.nodes.new("ShaderNodeAddShader")
            nt.links.new(em.outputs[0], ad.inputs[0]); nt.links.new(gl.outputs[0], ad.inputs[1])
            tr = nt.nodes.new("ShaderNodeBsdfTransparent")
            mx = nt.nodes.new("ShaderNodeMixShader")
            nt.links.new(mu.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(ad.outputs[0], mx.inputs[2])
            nt.links.new(mx.outputs[0], out.inputs[0])
        elif m.name in GLOW:
            sh = nt.nodes.new("ShaderNodeEmission")
            sh.inputs["Color"].default_value = col
            sh.inputs["Strength"].default_value = GLOW[m.name]
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
    scn.cycles.max_bounces = 4
    scn.cycles.transparent_max_bounces = 24
    scn.render.resolution_x, scn.render.resolution_y = RES
    scn.render.resolution_percentage = 100
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("Space")
    scn.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*lin(0x14102a), 1)
    bg.inputs["Strength"].default_value = 1.0
    for name, energy, d, col in (("Sun", 3.6, (-0.55, 0.62, 0.55), (1, 1, 1)), ("Fill", 0.9, (0.6, 0.4, -0.7), (0.7, 0.75, 1.0)), ("Sky", 0.35, (0, 1, 0), (0.8, 0.8, 1.0))):
        o = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        o.data.energy, o.data.color, o.data.angle = energy, col, math.radians(4)
        o.rotation_euler = tb(d).normalized().to_track_quat("Z", "Y").to_euler()
        scn.collection.objects.link(o)
    scn.render.line_thickness_mode = "ABSOLUTE"
    scn.render.line_thickness = 1.3
    vl = bpy.context.view_layer
    for ls in list(vl.freestyle_settings.linesets):
        vl.freestyle_settings.linesets.remove(ls)
    ls = vl.freestyle_settings.linesets.new("ink")
    ls.select_silhouette = ls.select_border = ls.select_crease = True
    ls.linestyle.color = lin(0x0b0612)
    ls.linestyle.thickness = 1.3
    try:                                                                                # thinner far away, as the game's metre-thick ink is
        tm = ls.linestyle.thickness_modifiers.new("far", "DISTANCE_FROM_CAMERA")
        tm.blend, tm.range_min, tm.range_max, tm.value_min, tm.value_max = "MULTIPLY", 30.0, 500.0, 1.0, 0.12
    except Exception as e:
        print("no distance falloff:", e)
    vl.freestyle_settings.crease_angle = math.radians(50)


def passes(glass_only):
    scn = bpy.context.scene
    scn.render.use_freestyle = not glass_only
    bpy.context.view_layer.use_freestyle = not glass_only
    scn.render.film_transparent = glass_only
    for o in scn.objects:
        if o.type != "MESH":
            continue
        g = o.name in GLASS
        o.hide_render = g and not glass_only
        o.is_holdout = glass_only and not g


def pixels(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(h, w, 4)


def save(img, out, fmt="PNG"):
    h, w = img.shape[:2]
    im = bpy.data.images.new(os.path.basename(out), w, h, alpha=False)
    im.pixels.foreach_set(np.ascontiguousarray(img).ravel())
    im.filepath_raw = out
    im.file_format = fmt
    im.save()
    bpy.data.images.remove(im)


def render(names):
    scn = bpy.context.scene
    cam = bpy.data.objects.new("PrevCam", bpy.data.cameras.new("PrevCam"))
    scn.collection.objects.link(cam)
    cam.data.clip_start, cam.data.clip_end = 0.5, 6000
    scn.camera = cam
    done = []
    for name in names:
        pos, aim, lens = VIEWS[name]
        cam.location = tb(pos)
        cam.rotation_euler = (tb(aim) - tb(pos)).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens
        paths = []
        for glass_only in (False, True):
            passes(glass_only)
            scn.render.filepath = os.path.join(OUTDIR, f"_{name}_{'glass' if glass_only else 'base'}.png")
            bpy.ops.render.render(write_still=True)
            paths.append(scn.render.filepath)
        base, gl = pixels(paths[0]), pixels(paths[1])
        a = gl[..., 3:4]
        img = base.copy()
        img[..., :3] = base[..., :3] * (1 - a) + gl[..., :3] * a
        img[..., 3] = 1
        out = os.path.join(OUTDIR, f"dome_{name}.png")
        save(img, out)
        for p in paths:
            os.remove(p)
        print("rendered", out)
        done.append(img)
    return done


def sheet(imgs, out, cols=2):
    tiles = [t.reshape(t.shape[0] // 2, 2, t.shape[1] // 2, 2, 4).mean(axis=(1, 3)) for t in imgs]
    gap = 6
    th, tw = tiles[0].shape[:2]
    rows = (len(tiles) + cols - 1) // cols
    full = np.ones((rows * th + (rows - 1) * gap, cols * tw + (cols - 1) * gap, 4), dtype=np.float32)
    for k, t in enumerate(tiles):
        r, c = k // cols, k % cols
        y0 = (rows - 1 - r) * (th + gap)                                                # Blender's rows run bottom up
        full[y0:y0 + th, c * (tw + gap):c * (tw + gap) + tw] = t
    save(full, out, "JPEG")
    print("sheet", out)


bpy.ops.wm.read_factory_settings(use_empty=True)
G = build()
if os.environ.get("PREVIEW_OPEN") == "1":                                               # slide the main lock's outer door open
    for n in ("dn_lock_main_doorOutL", "dn_lock_main_doorOutR"):
        p = bpy.data.objects[n]
        p.location.x += p["slide"]
context(G)
palette({**{k: int(v, 16) for k, v in G["HEX"].items()}, **CTX})
stage()
names = [a for a in ARGS if a in VIEWS] or list(VIEWS)
imgs = render(names)
if len(imgs) > 1:
    sheet(imgs, os.path.join(OUTDIR, "dome_sheet.jpg"))
