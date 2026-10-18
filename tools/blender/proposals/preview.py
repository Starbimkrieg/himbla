# Preview renderer for the freighter proposals: lays the game's own toon palette over the slot materials, adds a space
# backdrop and ink outlines (Freestyle), and renders a few fixed views of one ship with Cycles on the CPU (so it runs headless,
# with no GPU). exec() it after a build script has made the ship:  render_views(root_object, "/path/prefix", length=66.0)
# Writes <prefix>_<view>.png for each view in VIEWS.

import bpy, math, os
from mathutils import Vector

# the game's freighter colours (models.js SHIP_TOON / SHIP_GLOW and the freighter's own color / stripe)
GAME = {
    "body": 0xb8b4c8, "stripe": 0xff9f1c, "trim": 0xd8d4e8, "dark": 0x2a2540, "metal": 0x8a87a0, "steel": 0x55607a, "deck": 0x5b5870,
    "hazard": 0xffd23f, "cargo0": 0xffd23f, "cargo1": 0x2ec4ff, "cargo2": 0xff3b5c, "cargo3": 0x7dff6a,
    "glass": 0x9be7ff, "window": 0xfff6a8, "cabin": 0xfff1b0, "red": 0xff2a4a, "green": 0x7dff6a, "white": 0xffffff, "sign": 0xffd23f,
    "bay": 0x0c0915, "engine": 0xff9f1c, "core": 0xfff5c0, "plume": 0xff8a1f, "plumeCore": 0xfff0cc, "lift": 0x8fd8ff, "beacon": 0xff5040,
}
EMIT = {"glass", "window", "cabin", "red", "green", "white", "sign", "engine", "core", "plume", "plumeCore", "lift", "beacon"}

VIEWS = {
    "front34": dict(az=-38, el=22, dist=1.35, aim=(0, 0, 0)),     # bow toward the camera's right, from above
    "side": dict(az=-90, el=6, dist=1.5, aim=(0, 0, 0)),          # the flank: the cargo slots
    "rear34": dict(az=148, el=24, dist=1.35, aim=(0, 0, -4)),     # the stern: engines, the deck
    "top": dict(az=-90, el=84, dist=1.45, aim=(0, 0, 0)),         # the landing pad from above
}


def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def palette():
    for m in bpy.data.materials:
        h = GAME.get(m.name)
        if h is None:
            continue
        col = srgb(h)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        if m.name in EMIT:
            sh = nt.nodes.new("ShaderNodeEmission")
            sh.inputs["Color"].default_value = (*col, 1)
            sh.inputs["Strength"].default_value = 1.0
            nt.links.new(sh.outputs["Emission"], out.inputs["Surface"])
        else:
            # a toon-ish look: diffuse through a colour ramp so the light falls off in steps
            d = nt.nodes.new("ShaderNodeBsdfDiffuse")
            d.inputs["Color"].default_value = (*col, 1)
            nt.links.new(d.outputs["BSDF"], out.inputs["Surface"])
        m.diffuse_color = (*col, 1)


# the land-train palette the game paints cargo units with (Kepler's livery here)
CARGO_GAME = {
    "body": 0xff9f1c, "stripe": 0xfff4e0, "accent": 0x6a8f3a, "label": 0x2a2540, "dark": 0x2a2540, "steel": 0x55607a, "metal": 0x8a87a0,
    "tire": 0x1d1a29, "white": 0xf3eee4, "hazard": 0xffd23f, "tank": 0xc6d6ea, "brand": 0x14a3b8, "redsafe": 0xc9202e, "orange": 0xff7a1a,
    "blue": 0x1d63d6, "hot": 0xff9f1c, "tail": 0xff2a4a, "lamp": 0xfff6a8, "glass": 0x9be7ff, "window": 0xfff6a8, "green": 0x7dff6a,
}
CARGO_EMIT = {"hot", "tail", "lamp", "glass", "window", "green"}


def cargo_palette():
    """Meshes under a "cargo" pivot take the land-train palette (the game does the same), not the ship's."""
    made = {}
    for o in bpy.data.objects:
        if o.type != "MESH" or not o.data.materials:
            continue
        p, under = o.parent, False
        while p:
            if p.get("role") == "cargo":
                under = True
                break
            p = p.parent
        slot = o.data.materials[0].name
        if not under or slot.startswith("cargo:"):
            continue
        m = made.get(slot)
        if m is None:
            m = made[slot] = bpy.data.materials.new("cargo:" + slot)
            col = srgb(CARGO_GAME.get(slot, 0xff00ff))
            m.use_nodes = True
            nt = m.node_tree
            nt.nodes.clear()
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            emit = slot in CARGO_EMIT
            sh = nt.nodes.new("ShaderNodeEmission" if emit else "ShaderNodeBsdfDiffuse")
            sh.inputs["Color"].default_value = (*col, 1)
            nt.links.new(sh.outputs["Emission" if emit else "BSDF"], out.inputs["Surface"])
        o.data.materials[0] = m


def stage():
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = 72
    scn.cycles.use_denoising = False
    scn.render.resolution_x, scn.render.resolution_y = 1100, 620
    scn.render.film_transparent = False
    scn.view_settings.view_transform = "Standard"
    w = scn.world or bpy.data.worlds.new("W")
    scn.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*srgb(0x14102a), 1)
    bg.inputs["Strength"].default_value = 1.0
    for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o, do_unlink=True)
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(18)
    sun.rotation_euler = (math.radians(52), math.radians(8), math.radians(-35))
    scn.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
    fill.data.energy = 0.9
    fill.data.color = (0.65, 0.7, 1.0)
    fill.rotation_euler = (math.radians(110), 0, math.radians(150))
    scn.collection.objects.link(fill)
    # ink: Freestyle outlines in the game's near-black
    scn.render.use_freestyle = True
    scn.render.line_thickness_mode = "ABSOLUTE"
    scn.render.line_thickness = 1.6
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    for ls in list(vl.freestyle_settings.linesets):
        vl.freestyle_settings.linesets.remove(ls)
    ls = vl.freestyle_settings.linesets.new("ink")
    ls.select_silhouette = ls.select_border = ls.select_crease = True
    ls.linestyle.color = srgb(0x0b0612)
    ls.linestyle.thickness = 1.6
    vl.freestyle_settings.crease_angle = math.radians(52)


def render_views(root, prefix, length=66.0, views=None):
    palette()
    cargo_palette()
    stage()
    for o in bpy.data.objects:   # (the thruster and lift-jet flames only burn in flight: leave them out of the portraits)
        if o.type == "MESH" and o.data.materials and o.data.materials[0].name in ("plume", "plumeCore", "lift"):
            o.hide_render = True
    scn = bpy.context.scene
    cam = bpy.data.objects.get("PrevCam") or bpy.data.objects.new("PrevCam", bpy.data.cameras.new("PrevCam"))
    if cam.name not in scn.collection.objects:
        scn.collection.objects.link(cam)
    cam.data.lens = 50
    scn.camera = cam
    base = root.matrix_world.translation.copy()
    for name, v in (views or VIEWS).items():
        az, el, d = math.radians(v["az"]), math.radians(v["el"]), length * v["dist"] * 1.25
        # (the ship's nose is +z in three.js axes = -y in Blender's: so az 0 looks at the nose from in front)
        aim = base + Vector((v["aim"][0], -v["aim"][2], v["aim"][1]))
        pos = aim + Vector((math.sin(az) * math.cos(el) * d, -math.cos(az) * math.cos(el) * d, math.sin(el) * d))
        cam.location = pos
        direction = aim - pos
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scn.render.filepath = f"{prefix}_{name}.png"
        bpy.ops.render.render(write_still=True)
        print("rendered", scn.render.filepath)
