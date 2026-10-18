# Hitch-Line Winch parts for Blender (4.2+ / 5.x): the grapple hook and a metre of steel cable, exported to
# src/assets/winch.glb, and the tow-line marker for the HUD, rendered to src/assets/towmark.png.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_winch.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_winch.py
#
# Authored in three.js axes (see kit.py). Under the root `winch`:
#   winch_hook    the grapple, its tip at the origin, biting toward -z; the eye the cable runs to is at +z (1.05 m out). The game
#                 sets this pivot on the anchor and turns +z toward you. Slots: gold (claw and flukes), steel (shank, eye), dark (collar)
#   winch_cable   one metre of cable along +z, its twist an exact two turns per metre, so copies butt end to end without a
#                 seam. The game lays them along the line (an instance per metre, each stretched to fit its stretch of it):
#                 `winch_strand` (the core and five strands, slot steel) and `winch_tracer` (the sixth, slot tracer)
# The marker (towmark.png, 128 x 128, white on clear) is modelled flat as well - four corner brackets, a dashed ring and a
# hook glyph - and rendered orthographically; the HUD tints it with a CSS mask (style.css #towmark).

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_winch.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
ASSETS = os.path.join(REPO, "src", "assets")
OUT = os.environ.get("WINCH_OUT") or os.path.join(ASSETS, "winch.glb")
MARK = os.environ.get("WINCH_MARK") or os.path.join(ASSETS, "towmark.png")
if not os.path.isdir(ASSETS):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Winch export ->", OUT, "and", MARK)
COLL = "MoonWinch"

# preview colours (the game swaps in its own materials)
SLOT_COLORS = {"gold": (1.0, 0.82, 0.25), "steel": (0.6, 0.64, 0.7), "dark": (0.16, 0.14, 0.25), "tracer": (1.0, 0.62, 0.11)}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi


def M(name, geo, slot, parent, ink=0.0):
    return mesh("winch_" + name, geo, slot, parent, ink)


root = pivot("winch", (0, 0, 0), None)

# ---- the grapple: a claw that bites (tip at the origin), three flukes swept back, a collar, the shank and the eye ----
hook = pivot("winch_hook", (0, 0, 0), root, role="hook", length=1.1)
claw = [(0.0, 0.0), (0.05, 0.1), (0.14, 0.3), (0.2, 0.46), (0.21, 0.54), (0.15, 0.6), (0.1, 0.64)]
M("claw", xf(lathe(claw, 10), r=(PI / 2, 0, 0)), "gold", hook, 0.03)
for i in range(3):
    a = PI / 2 + i * 2 * PI / 3
    c, s = math.cos(a), math.sin(a)
    path = [(c * 0.15, s * 0.15, 0.56), (c * 0.33, s * 0.33, 0.46), (c * 0.43, s * 0.43, 0.3), (c * 0.4, s * 0.4, 0.12)]
    M(f"fluke{i}", tube(path, [0.06, 0.055, 0.045, 0.012], 5, True), "gold", hook, 0.02)
M("collar", xf(lathe([(0.1, 0.0), (0.15, 0.02), (0.15, 0.12), (0.1, 0.14)], 10), (0, 0, 0.62), (PI / 2, 0, 0)), "dark", hook, 0.02)
M("shank", beam((0, 0, 0.62), (0, 0, 0.95), 0.07, 8), "steel", hook, 0.02)
M("eye", xf(torus(0.15, 0.045, 14, 6), (0, 0, 1.03), (0, 0, PI / 2)), "steel", hook, 0.02)
M("thimble", xf(lathe([(0.0, 0.0), (0.09, 0.0), (0.1, 0.05), (0.09, 0.1), (0.0, 0.1)], 8), (0, 0, 0.9), (PI / 2, 0, 0)), "dark", hook, 0.0)

# ---- a metre of cable: a straight core and six strands, two full turns round it ----
cable = pivot("winch_cable", (0, 0, 0), root, role="cable", length=1.0)
TURNS, HELIX, SR, N = 2, 0.036, 0.027, 24


def strand(k):
    pts = []
    for i in range(N + 1):
        z = i / N
        a = 2 * PI * (TURNS * z + k / 6)
        pts.append((HELIX * math.cos(a), HELIX * math.sin(a), z))
    return tube(pts, [SR] * len(pts), 5, False)


M("strand", join([beam((0, 0, 0), (0, 0, 1), 0.04, 6)] + [strand(k) for k in range(1, 6)]), "steel", cable, 0.0)
M("tracer", strand(0), "tracer", cable, 0.0)

objs = [o for o in C.objects]
tris = sum(len(o.data.polygons) for o in objs if o.type == "MESH")
print("meshes:", sum(1 for o in objs if o.type == "MESH"), "polygons:", tris)
export(OUT, objs)
if os.environ.get("WINCH_BLEND"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["WINCH_BLEND"])


# ---------------------------------------------------------------------------------------------------------------
# the tow-line marker: flat parts in the XY plane (a 4 x 4 square), rendered straight down with an orthographic camera.
# Nothing here is exported: the render is the asset.

MC = bpy.data.collections.get("MoonTowMark") or bpy.data.collections.new("MoonTowMark")
if MC.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(MC)
for o in list(MC.objects):
    bpy.data.objects.remove(o, do_unlink=True)


def flat(name, polys):
    """A flat mesh from polygons (lists of (x, y))."""
    verts, faces = [], []
    for p in polys:
        faces.append(tuple(range(len(verts), len(verts) + len(p))))
        verts.extend((x, y, 0.0) for x, y in p)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    o = bpy.data.objects.new(name, me)
    MC.objects.link(o)
    return o


def bar(a, b, w):
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    l = math.hypot(dx, dy)
    nx, ny = -dy / l * w / 2, dx / l * w / 2
    return [(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]


def arc(r, a0, a1, w, n=8):
    """A thick arc as a strip of quads"""
    polys = []
    for i in range(n):
        s, e = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
        polys.append([(math.cos(s) * (r + w / 2), math.sin(s) * (r + w / 2)), (math.cos(e) * (r + w / 2), math.sin(e) * (r + w / 2)),
                      (math.cos(e) * (r - w / 2), math.sin(e) * (r - w / 2)), (math.cos(s) * (r - w / 2), math.sin(s) * (r - w / 2))])
    return polys


E, L, W = 1.85, 0.8, 0.2          # the corner brackets: how far out, how long an arm, how thick
parts = []
for sx in (-1, 1):
    for sy in (-1, 1):
        parts.append(bar((sx * E, sy * (E - L)), (sx * E, sy * (E + W / 2)), W))
        parts.append(bar((sx * (E - L), sy * E), (sx * E, sy * E), W))
flat("brackets", parts)
ring = []
for k in range(12):                  # a dashed ring: twelve dashes
    a0 = 2 * PI * k / 12
    ring += arc(1.15, a0, a0 + 2 * PI / 12 * 0.55, 0.1, 4)
flat("ring", ring)
# the hook glyph in the middle: a stem with an eyelet on top and a J below
hk = [bar((0, 0.55), (0, -0.25), 0.16)] + arc(0.3, PI, 2 * PI + 0.2, 0.16, 12) + arc(0.18, 0, 2 * PI, 0.1, 12)
hk = [[(x + 0, y - 0.0) for x, y in p] for p in hk[:1]] + [[(x, y - 0.25) for x, y in p] for p in hk[1:13]] + [[(x, y + 0.75) for x, y in p] for p in hk[13:]]
flat("hook", hk)

scn = bpy.context.scene
cam = bpy.data.objects.get("TowMarkCam") or bpy.data.objects.new("TowMarkCam", bpy.data.cameras.new("TowMarkCam"))
if cam.name not in scn.collection.objects:
    scn.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 4.0
cam.location = (0, 0, 5)
cam.rotation_euler = (0, 0, 0)
scn.camera = cam
# (Cycles on the CPU with a flat white emission: Workbench needs a GPU context, which a headless box may not have)
scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = 24
scn.cycles.use_denoising = False
scn.cycles.film_exposure = 1.0
scn.render.resolution_x = scn.render.resolution_y = 128
scn.render.resolution_percentage = 100
scn.render.film_transparent = True
scn.render.image_settings.file_format = "PNG"
scn.render.image_settings.color_mode = "RGBA"
scn.view_settings.view_transform = "Standard"
white = bpy.data.materials.get("towmark_white") or bpy.data.materials.new("towmark_white")
white.use_nodes = True
nt = white.node_tree
nt.nodes.clear()
em = nt.nodes.new("ShaderNodeEmission")
em.inputs["Color"].default_value = (1, 1, 1, 1)
em.inputs["Strength"].default_value = 1.0
out = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
for o in MC.objects:
    o.data.materials.clear()
    o.data.materials.append(white)
# render only the marker: hide the cable parts for this pass
hidden = []
for o in bpy.data.objects:
    if o.name != cam.name and MC.name not in [c.name for c in o.users_collection]:
        hidden.append((o, o.hide_render))
        o.hide_render = True
scn.render.filepath = MARK
bpy.ops.render.render(write_still=True)
for o, h in hidden:
    o.hide_render = h
print("rendered", MARK, os.path.getsize(MARK), "bytes")
