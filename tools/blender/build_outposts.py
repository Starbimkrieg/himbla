# Rustmoon faction outposts builder for Blender (4.2+ / 5.x).
#
# Builds the small faction structures and exports src/assets/outposts.glb as docs/outpost-glb.md describes (read it
# first: axes, root names, material names, gameplay empties, `anim` groups, the `ink` property). Two kinds, each two
# roots at the origin: Relay Mast (`mast`, `mast_wreck`) and Watchtower (`tower`, `tower_wreck`; main building in ruins),
# ports of mast() and tower() in src/outpostModels.js (same positions, sizes, colours, outlines; a wreck replays the
# game's random stream). The mast's dishes are dishkit.py's dish head, as in the game (models.js Kit.dishHead). Object
# names are unique across the file: the mast's are plain, the tower's carry a `tower` marker (`tower_apron`,
# `col_tower_lattice`, `smoke_tower`, ...; a role word stays first).
#
# Run it with any Python that has the bpy module (pip install bpy):
#     MOONRUNNER_REPO=<checkout> python tools/blender/build_outposts.py
# or inside Blender:  exec(open(r"<repo>/tools/blender/build_outposts.py").read())
# MOONRUNNER_EXPORT=0 builds the scene without writing the file.
#
# Three.js axes (x right, y up, +z towards the gate, ground at y = 0). To add a kind: write build_<kind>(wreck) like
# build_mast (a Kit on a root pivot, tag=<kind> for unique names: see build_tower), register it in BUILDERS and give it
# a KIND_SEED (must match src/outpostModels.js).

import bpy, math, os
from mathutils import Matrix, Vector


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_outposts.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "outposts.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Outposts export ->", OUT)
COLL = "MoonOutposts"


def srgb(h):
    """sRGB hex (game colours) -> linear floats (Blender / glTF)."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(h >> 16 & 255), lin(h >> 8 & 255), lin(h & 255))


# colours from outpostModels.js
STEEL, DARK, LIGHT, CONC, CHAR = 0x55607A, 0x3A3550, 0xD8D4E8, 0x8A8698, 0x2A2433
FACTION = 0x2EC4FF  # preview accent; the game paints the owner's
F = 0.3  # apron top: small props stand on this
KIND_SEED = {"mast": 41, "tower": 11}  # outpostModels.js seeds (a kind's streams start at KIND_SEED * 977)

# material name -> (sRGB hex, double sided). The name picks the treatment: faction* take the owner's accent, glow* are
# unlit, anything else is lit toon. Same hex and side = one material.
MATERIALS = {
    "faction": (FACTION, False), "faction_glow": (FACTION, False), "faction_cloth": (FACTION, True),
    "apron": (0x7A7686, False), "apron_edge": (0x5A566A, False),
    "concrete": (CONC, False), "dark": (DARK, False), "steel": (STEEL, False), "light": (LIGHT, False),
    "mast_red": (0xFF4F2E, False), "mast_white": (0xF5F5F5, False),
    "dish_cream": (0xFFF4E0, False), "dish_grey": (0xB8B4C8, False),
    "navy": (0x2A2540, False), "shed_wall": (0xE8E4F0, False), "cabinet": (0x3A3F50, False),
    "cable_orange": (0xFF9F1C, False), "cable_blue": (0x2EC4FF, False), "cable_black": (0x111111, False),
    "char": (CHAR, False), "rubble_dark": (0x3A3540, False), "rubble_brown": (0x4A3F3A, False),
    "rubble_grey": (0x55505E, False), "burnt_wall": (0x4A4652, False),
    "glow_red": (0xFF2A4A, False), "glow_green": (0x7DFF3A, False), "glow_cyan": (0x2EE6FF, False),
    "glow_lamp": (0xFFF3B0, False),
    # the watchtower's (reused colours above are the same material: "navy" is the barracks door, "cabinet" the fallen roof)
    "apron_tower": (0x7E7A8C, False), "jersey": (0xA8A4B4, False), "yellow": (0xFFD23F, False),
    "olive": (0x6F7A5A, False), "olive_dark": (0x4F5A42, False), "hut_skin": (0x4F5A42, True), "olive_burnt": (0x3A3F30, False),
    "mustard": (0xC9A227, False), "sandbag": (0xB59F74, False), "crate_band": (0x5A3A22, False),
    "steel_wreck": (0x3E4352, False), "wreck_block": (0x4A5068, False),
    "glow_window": (0xFFF0A0, False), "glow_lens": (0xFFFBE0, False), "glow_warm": (0xFFE6A8, False), "glow_yellow": (0xFFD23F, False),
    "additive_searchlight": (0xFFF3B0, True),
}
# light beams: name -> alpha (the game's BEAM(colour, opacity)); additive, unlit, double sided in the game.
ADDITIVE = {"additive_searchlight": 0.13}
SLOT_COLORS = {name: srgb(h) for name, (h, _) in MATERIALS.items()}
# dish head slots (dishkit.py) -> this file's materials: body takes the owner's accent, stripe cream (the Kit build
# paints full livery: models.js dishSlot); a wreck's flung-off heads are grey
HEAD = {"body": "faction", "stripe": "dish_cream", "steel": "steel", "dark": "navy", "white": "mast_white", "dish": "dish_cream", "hazard": "yellow", "green": "glow_green"}
HEAD_WRECK = {**HEAD, "body": "dish_grey"}

# shared geometry and scene helpers
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "dishkit.py"), encoding="utf-8").read(), globals())   # the mast's dish head

C = coll()
for _name, (_hex, _double) in MATERIALS.items():
    material(_name).use_backface_culling = not _double  # off = double sided in glTF


def setup_additive():
    """Make beam materials see-through for the glTF exporter: Principled Alpha < 1 gives alphaMode BLEND and
    baseColorFactor[3]; culling off gives doubleSided. Render method and diffuse colour only fix the viewport.
    material() only rewrites Base Color and Roughness, so this survives it; call once the meshes are built."""
    for name, alpha in ADDITIVE.items():
        m = material(name)
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Alpha"].default_value = alpha
        m.diffuse_color = (*SLOT_COLORS[name], alpha)
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"  # Blender 4.2+
        elif hasattr(m, "blend_method"):
            m.blend_method = "BLEND"
        m.use_backface_culling = False


# ---------------- port of the game's Kit (src/outpostModels.js) ----------------

def mulberry32(a):
    """src/rng.js, bit for bit."""
    a &= 0xFFFFFFFF
    imul = lambda x, y: (x * y) & 0xFFFFFFFF

    def rng():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(a ^ (a >> 15), 1 | a)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rng


def js_round(v):
    return math.floor(v + 0.5)  # Math.round (halves go up), not Python's banker's rounding


def euler_xyz(rx, ry, rz):
    """THREE.Euler 'XYZ' as a matrix: Rx * Ry * Rz (mathutils' 'XYZ' is the reverse product)."""
    return Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rz, 4, "Z")


ROLE_WORDS = ("col", "hit", "raid", "smoke", "drop", "text")  # gameplay roles: an empty's name starts with its role


class Kit:
    """The parts of the game's Kit this builder needs. Parts are meshes (verts in the root's frame) under `root`;
    colliders, blast boxes, raid spot, smoke, drop and sign faces are empties; flags, blinkers and the spinning dish
    are `anim` empties with child meshes. Methods take `name=` (wreck names end in _wreck; `tag=` adds its marker to
    every name) and `ink=` (the JS `outline`, 0 = none)."""

    def __init__(self, root, seed, wreck, tag=""):
        self.root, self.wreck, self.tag = root, wreck, tag
        self.rr, self.mr, self.wr = mulberry32(seed), mulberry32(seed + 1), mulberry32(seed + 2)
        self.sfx = "_wreck" if wreck else ""
        self.names, self.counts = set(), {}
        self.base, self.yaw = Matrix.Identity(4), 0.0

    # -- plumbing
    def name(self, base, auto="part"):
        n = base or f"{auto}_{self.count(auto)}"
        if self.tag:  # unique across the file: the marker goes after a role word, else first
            head, _, rest = n.partition("_")
            n = f"{head}_{self.tag}" + (f"_{rest}" if rest else "") if head in ROLE_WORDS else f"{self.tag}_{n}"
        n += self.sfx
        assert n not in self.names, f"duplicate object name {n}"
        self.names.add(n)
        return n

    def count(self, key):
        self.counts[key] = self.counts.get(key, -1) + 1
        return self.counts[key]

    def at(self, x=0, z=0, yaw=0, y=0):
        """Frame for the following parts: position and yaw about +y."""
        self.base = Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, "Y")
        self.yaw = yaw
        return self

    def P(self, x, y, z):
        return self.base @ Vector((x, y, z))

    # -- meshes
    def add(self, geo, slot, x=0, y=0, z=0, rx=0, ry=0, rz=0, rot=None, ink=0.06, name=None):
        m = self.base @ Matrix.Translation((x, y, z)) @ (rot if rot is not None else euler_xyz(rx, ry, rz))
        return mesh_smooth(self.name(name), place(geo, m), slot, self.root, ink)

    def box(self, w, h, d, slot, x, y0, z, ink=0.06, name=None, **rot):
        return self.add(cuboid(w, h, d), slot, x, y0 + h / 2, z, ink=ink, name=name, **rot)

    def cyl(self, rt, rb, h, seg, slot, x, y0, z, ink=0.06, name=None):
        return self.add(cylinder(rt, rb, h, seg), slot, x, y0 + h / 2, z, ink=ink, name=name)

    def ball(self, r, slot, x, y, z, ink=0.06, name=None):
        return self.add(sphere(r, 8, 6), slot, x, y, z, ink=ink, name=name)

    def ring(self, r, tube, slot, x, y, z, ink=0, name=None):
        return self.add(torus_arc(r, tube, max(12, js_round(r * 5)), 4), slot, x, y, z, ink=ink, name=name)

    def beam(self, a, b, r, slot, ink=0.03, seg=5, name=None):
        """A strut between two points."""
        d = Vector(b) - Vector(a)
        rot = Vector((0, 1, 0)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        return self.add(cylinder(r, r, d.length, seg), slot, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rot=rot, ink=ink, name=name)

    def strip(self, a, b, w, h, slot, y0, ink=0.02, name=None):
        """A flat strip between two ground points (a, b = (x, z))."""
        dx, dz = b[0] - a[0], b[1] - a[1]
        return self.box(w, h, math.hypot(dx, dz), slot, (a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2, ink=ink, name=name, ry=math.atan2(dx, dz))

    # -- empties
    def empty(self, name, pos, display="PLAIN_AXES", size=0.3, scale=(1, 1, 1), yaw=0.0, **props):
        e = pivot(name, pos, self.root, **props)
        e.empty_display_type, e.empty_display_size = display, size
        e.rotation_euler = (0, 0, yaw)  # three.js +y yaw = Blender +z
        e.scale = scale
        return e

    def dyn(self, name, anim, x, y, z, ry=0):
        """An animated group's node (the game swings / blinks / spins it); its meshes are relative to it."""
        p = self.P(x, y, z)
        return self.empty(self.name(name), (p.x, p.y, p.z), yaw=self.yaw + ry, anim=anim)

    def child(self, parent, name, geo, slot, ink=0):
        """A mesh under an anim node, `geo` in the node's frame."""
        n = self.name(name)
        return mesh_smooth(n, geo, slot, parent, ink)

    # -- dish heads (dishkit.py's light head, as models.js Kit.dishHead bakes into the game's outposts)
    def _head(self, name, m0, rim, slots, az, el, parent):
        """Head pieces as meshes `name`_<piece> under `parent`: m0 places the neck's foot (model y = NECK), scaled so
        the rim is `rim` m from the axis, turned `az` about the vertical, nodded `el`."""
        k = rim / RIM
        base = m0 @ Matrix.Translation((0, (YP - NECK) * k, 0))
        turn, nod, S = Matrix.Rotation(az, 4, "Y"), Matrix.Rotation(el, 4, "X"), Matrix.Scale(k, 4)
        frames = {"yaw": base @ turn @ S, "tilt": base @ turn @ nod @ S}
        for piece, (verts, faces), slot, ink, part in head_pieces():
            m = frames[part]
            mesh(self.name(f"{name}_{piece}"), ([tuple(m @ Vector(v)) for v in verts], faces), slots[slot], parent, ink * k if ink >= 0.04 else 0)

    def dish_head(self, name, x, y, z, rim, slots, az=0.0, el=-0.5, lay=None):
        """Dish head, neck foot at (x, y, z) in the current frame, opening up and towards -z (az = pi: +z), nodded `el`.
        `lay` = (yaw, rx, rz) first lays the whole head at that angle (a wreck's fallen ones)."""
        m = self.base @ Matrix.Translation((x, y, z))
        if lay:
            m = m @ Matrix.Rotation(lay[0], 4, "Y") @ euler_xyz(lay[1], 0, lay[2])
        self._head(name, m, rim, slots, az, el, self.root)

    def dish_head_spin(self, name, x, y, z, rim, slots, az=0.0, el=-0.5, arm=0.0):
        """A head at the end of an `arm` m boom from a node at (x, y, z) the game spins about the vertical (anim spin)."""
        node = self.dyn(name, "spin", x, y, z)
        self._head(name, Matrix.Translation((0, 0, arm)), rim, slots, az, el, node)
        if arm:
            self.child(node, f"{name}_arm", place(cylinder(1.2 * rim / RIM, 1.2 * rim / RIM, arm, 5), Matrix.Translation((0, 0, arm / 2)) @ Matrix.Rotation(math.pi / 2, 4, "X")), "dark", 0.03)
        return node

    # -- gameplay data (colliders / blast boxes in the current frame)
    def box_empty(self, role, hx, hy, hz, x, z, ry, y0, name):
        p = self.P(x, 0, z)
        return self.empty(self.name(name, role), (p.x, y0 + hy, p.z), "CUBE", 1, (hx, hz, hy), self.yaw + ry, role=role, shape="box")

    def solid(self, hx, hy, hz, x, z, ry=0, y0=0, name=None):
        return self.box_empty("col", hx, hy, hz, x, z, ry, y0, name)

    def hit(self, hx, hy, hz, x, z, ry=0, name=None):
        return self.box_empty("hit", hx, hy, hz, x, z, ry, 0, name)

    def column(self, r, h, x, z, y0=0, name=None):
        p = self.P(x, 0, z)
        return self.empty(self.name(name, "col"), (p.x, (y0 + h) / 2, p.z), "CIRCLE", 1, (r, r, (h - y0) / 2), role="col", shape="cyl")

    def point(self, role, x, y, z, name=None):
        p = self.P(x, y, z)
        return self.empty(self.name(name or role), (p.x, p.y, p.z), "ARROWS", 0.6, role=role)

    # -- dynamic things
    def blinker(self, x, y, z, slot="glow_red", r=0.4):
        n = self.count("blink")
        node = self.dyn(f"blink_{n}", "blink", x, y, z)
        self.child(node, f"blink_{n}_lamp", sphere(r, 8, 6), slot)
        return node

    def flag(self, x, z, h=10, y0=0):
        n = self.count("flag")
        self.cyl(0.1, 0.13, h, 6, "dark", x, y0, z, ink=0.03, name=f"flag_pole_{n}")
        self.ball(0.22, "faction_glow", x, y0 + h + 0.15, z, ink=0, name=f"flag_ball_{n}")
        node = self.dyn(f"flag_{n}", "flag", x, y0 + h - 1.0, z)
        self.child(node, f"flag_{n}_cloth", place(plane(3, 1.8), Matrix.Translation((1.55, 0, 0))), "faction_cloth")
        return node

    def sign(self, text, x, z, w=8, y=3.4, ph=2.0, ry=0, fg="#ffd23f", bg="#241a3a", stroke="#120a1e"):
        """Name board on two posts, facing local +z. The game draws the words from the `text` empty; `ph` is the text
        plane's height for width w - 0.5 (measured: Kit.sign takes it from the canvas aspect)."""
        pw = w - 0.5
        save, save_yaw = self.base, self.yaw
        self.base = self.base @ Matrix.Translation((x, 0, z)) @ Matrix.Rotation(ry, 4, "Y")
        self.yaw += ry
        for i, s in enumerate((-1, 1)):
            self.box(0.3, y + ph / 2 + 0.2, 0.3, "dark", s * (w / 2 - 0.6), 0, 0, ink=0.04, name=f"sign_post_{i}")
        self.box(w, ph + 0.5, 0.26, "dark", 0, y - ph / 2 - 0.25, 0, ink=0.06, name="sign_board")
        self.box(w + 0.2, 0.3, 0.4, "faction", 0, y + ph / 2 + 0.2, 0, ink=0.04, name="sign_trim")
        p = self.P(0, y, 0)
        self.empty(self.name("text_sign"), (p.x, p.y, p.z), yaw=self.yaw, role="text", str=text, w=pw, fg=fg, bg=bg, stroke=stroke, back=1, off=0.17)
        self.base, self.yaw = save, save_yaw

    # -- shared yard props
    def lamp(self, x, z, h=7, slot="glow_lamp"):
        n = self.count("lamp")
        l = math.hypot(x, z) or 1
        dx, dz = -x / l, -z / l
        self.cyl(0.12, 0.17, h, 6, "dark", x, 0, z, ink=0.03, name=f"lamp_{n}_pole")
        self.column(0.25, h, x, z, name=f"col_lamp_{n}")
        self.beam((x, h, z), (x + dx * 1.5, h, z + dz * 1.5), 0.08, "dark", name=f"lamp_{n}_arm")
        self.box(0.8, 0.3, 0.55, "dark", x + dx * 1.6, h - 0.05, z + dz * 1.6, ink=0.03, name=f"lamp_{n}_head", ry=math.atan2(dx, dz))
        self.box(0.66, 0.08, 0.42, slot, x + dx * 1.6, h - 0.12, z + dz * 1.6, ink=0, name=f"lamp_{n}_light", ry=math.atan2(dx, dz))

    def apron(self, r, color, edge):
        self.cyl(r, r + 0.6, 0.3, 48, color, 0, 0, 0, ink=0.05, name="apron")
        self.ring(r - 0.3, 0.16, edge, 0, 0.3, 0, name="apron_edge")

    def perimeter(self, r, step=0.32, gap=0.3):
        """Glowing marker posts round the apron edge, gap at the entrance (+z)."""
        a, n = gap, 0
        while a < math.pi * 2 - gap + 1e-3:
            x, z = math.sin(a) * r, math.cos(a) * r
            self.box(0.26, 1.3, 0.26, "dark", x, 0, z, ink=0.03, name=f"perimeter_post_{n}")
            self.box(0.32, 0.22, 0.32, "faction_glow", x, 1.3, z, ink=0, name=f"perimeter_cap_{n}")
            a += step
            n += 1

    def raid_at(self, x, z, slot):
        """Raid marker: two glowing ground rings and the stand point (none on a wreck)."""
        if self.wreck:
            return
        self.ring(1.7, 0.14, slot, x, F + 0.04, z, name="ring_raid_outer")
        self.ring(1.1, 0.07, slot, x, F + 0.04, z, name="ring_raid_inner")
        self.point("raid", x, F, z)

    def scatter_debris(self, cx, cz, hx, hz, n, rr, colors=("char", "rubble_dark", "rubble_brown", "rubble_grey")):
        for i in range(n):  # rr() calls in the JS argument evaluation order
            s = 0.6 + rr() * 2.2
            h = 0.3 + rr() * 1.1
            d = 0.6 + rr() * 2
            x = cx + (rr() * 2 - 1) * hx
            z = cz + (rr() * 2 - 1) * hz
            rx, ry, rz = (rr() - 0.5) * 0.7, rr() * 3, (rr() - 0.5) * 0.7
            self.add(cuboid(s, h, d), colors[i % len(colors)], x, F + 0.3, z, rx=rx, ry=ry, rz=rz, ink=0.04, name=f"debris_{self.count('debris')}")


# ---------------- Relay mast ----------------
# 40 m guyed red and white lattice mast with dishes and beacons, an equipment shed, a cable tray and a ground dish.
# Wreck: the mast buckled at the base and lies in two folded lengths; the shed is burnt out.

def build_mast(wreck):
    root = pivot("mast_wreck" if wreck else "mast", (0, 0, 0), None)
    k = Kit(root, KIND_SEED["mast"] * 977 + 0 * 131, wreck)
    k.apron(24, "apron", "apron_edge")
    MX, MZ, H, SX, SZ = -3, -6, 40.7, 10, 8
    if not wreck:
        k.box(3.6, 0.7, 3.6, "concrete", MX, 0, MZ, ink=0.05, name="mast_base")
        legs = [(MX + math.cos(a) * 0.95, MZ + math.sin(a) * 0.95) for a in ((i * math.pi * 2) / 3 + 0.3 for i in range(3))]
        for s in range(8):
            for i, (lx, lz) in enumerate(legs):
                k.beam((lx, 0.7 + s * 5, lz), (lx, 0.7 + (s + 1) * 5, lz), 0.13, "mast_red" if s % 2 else "mast_white", ink=0.03, name=f"mast_leg_{s}_{i}")
        for l in range(16):
            for f in range(3):
                a, b = legs[f], legs[(f + 1) % 3]
                y0 = 0.7 + l * 2.5
                y1 = y0 + 2.5
                if l % 2:
                    k.beam((a[0], y0, a[1]), (b[0], y1, b[1]), 0.05, "steel", ink=0, name=f"mast_diag_{l}_{f}")
                else:
                    k.beam((b[0], y0, b[1]), (a[0], y1, a[1]), 0.05, "steel", ink=0, name=f"mast_diag_{l}_{f}")
                if l % 2 == 0:
                    k.beam((a[0], y0, a[1]), (b[0], y0, b[1]), 0.06, "steel", ink=0, name=f"mast_brace_{l}_{f}")
        for i, y in enumerate((20.7, 32.7)):
            k.add(cylinder(2.3, 2.3, 0.2, 3), "dark", MX, y, MZ, ry=0.3, ink=0.04, name=f"mast_platform_{i}")
            k.blinker(MX + 2.0, y + 0.45, MZ, "glow_red", 0.3)
        k.cyl(0.08, 0.12, 2.6, 5, "light", MX, H, MZ, ink=0.02, name="mast_pole")
        k.blinker(MX, H + 2.9, MZ, "glow_red", 0.45)
        for i, (h, ry, rim) in enumerate(((17, 0.5, 1.1), (25, 2.6, 1.3), (28.5, 4.4, 0.95))):   # a dish head on an arm each
            k.at(MX, MZ, ry)
            k.beam((0, h - 0.7, 0.4), (0, h - 0.7, 1.5), 0.08, "dark", name=f"mast_dish_{i}_arm")
            k.dish_head(f"mast_dish_{i}", 0, h - 0.7, 1.5, rim, HEAD, az=math.pi, el=-1.35)
            k.at()
        for i in range(3):
            k.at(MX, MZ, (i * math.pi * 2) / 3 + 1.2)
            k.box(0.55, 2.8, 0.2, "light", 0, 35.6, 1.15, ink=0.03, name=f"mast_fin_{i}")
            k.at()
        # spinning dish on the top platform
        k.dish_head_spin("spinner", MX, 32.8, MZ, 1.0, HEAD, az=math.pi, el=-0.7, arm=1.6)
        # guy wires to three anchors
        for i in range(3):
            a = 0.5 + (i * math.pi * 2) / 3
            ax, az = MX + math.cos(a) * 17, MZ + math.sin(a) * 17
            k.box(1.8, 1, 1.8, "concrete", ax, 0, az, ink=0.04, name=f"guy_anchor_{i}")
            k.box(1.0, 0.3, 1.0, "faction", ax, 1, az, ink=0.02, name=f"guy_cap_{i}")
            for j, h in enumerate((14, 27, 39.5)):
                k.beam((ax, 1.1, az), (MX + math.cos(a) * 0.9, h, MZ + math.sin(a) * 0.9), 0.045, "navy", ink=0, seg=3, name=f"guy_wire_{i}_{j}")
        k.column(1.6, H, MX, MZ, name="col_mast")
        # equipment shed
        k.box(8, 3.4, 5.5, "shed_wall", SX, 0, SZ, ink=0.1, name="shed")
        k.box(8.5, 0.35, 6, "faction", SX, 3.4, SZ, ink=0.04, name="shed_roof")
        k.box(0.2, 2.4, 1.4, "navy", SX - 4.02, F, SZ + 0.8, ink=0.02, name="shed_door")
        for i, slot in enumerate(("glow_green", "glow_green", "glow_red")):
            k.box(0.08, 0.18, 0.18, slot, SX - 4.06, 1.8 + i * 0.3, SZ - 0.6, ink=0, name=f"shed_led_{i}")
        for i, dx in enumerate((-2, 1.2)):
            k.box(1.6, 1.3, 0.9, "light", SX + dx, F, SZ + 3.2, ink=0.04, name=f"shed_unit_{i}")
            k.add(place(cylinder(0.5, 0.5, 0.06, 12), Matrix.Rotation(math.pi / 2, 4, "X")), "dark", SX + dx, F + 0.65, SZ + 3.66, ink=0, name=f"shed_vent_{i}")
        for i in range(3):
            k.box(1.2, 1.6, 0.9, "cabinet", SX + 4.6, F, SZ - 1.8 + i * 1.3, ink=0.03, name=f"shed_cabinet_{i}")
        k.solid(4, 1.9, 2.75, SX, SZ, name="col_shed")
    else:
        wr = k.wr
        k.box(3.6, 0.7, 3.6, "concrete", MX, 0, MZ, ink=0.05, name="mast_base")
        k.box(5, 0.06, 5, "char", MX, 0.7, MZ, ink=0, name="mast_scorch")
        for i in range(3):
            a = (i * math.pi * 2) / 3 + 0.3
            ex = MX + math.cos(a) * 1.3 + (wr() - 0.5)
            ey = 2.5 + wr() * 3
            ez = MZ + math.sin(a) * 1.3 + (wr() - 0.5)
            k.beam((MX + math.cos(a) * 0.95, 0.7, MZ + math.sin(a) * 0.95), (ex, ey, ez), 0.13, "mast_red" if i % 2 else "mast_white", ink=0.03, name=f"mast_stump_{i}")

        def lying(n, a, b):
            dx, dz = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dz)
            ux, uz = dx / L, dz / L
            px, pz = -uz * 0.8, ux * 0.8
            rails = [(px, F + 0.2), (-px, F + 0.2), (0, F + 1.4)]
            for s in range(math.floor(L / 5)):
                for j, (o, y) in enumerate(rails):
                    t0 = s * 5
                    t1 = min(L, t0 + 5)
                    oz = 0 if o == 0 else (pz if o == px else -pz)
                    k.beam((a[0] + ux * t0 + o, y, a[1] + uz * t0 + oz), (a[0] + ux * t1 + o, y, a[1] + uz * t1 + oz), 0.13, "mast_red" if s % 2 else "mast_white", ink=0.03, name=f"lying_{n}_rail_{s}_{j}")
            t, j = 0.0, 0
            while t < L - 1:
                k.beam((a[0] + ux * t + px, F + 0.2, a[1] + uz * t + pz), (a[0] + ux * (t + 2.5), F + 1.4, a[1] + uz * (t + 2.5)), 0.05, "steel", ink=0, name=f"lying_{n}_brace_{j}")
                t += 2.5
                j += 1

        lying(0, (MX + 1, MZ - 2), (5, -20))
        lying(1, (5.5, -19), (17, -12))
        k.dish_head("fallen_dish_0", -8, F + 0.5, -14, 1.3, HEAD_WRECK, el=-0.3, lay=(0.7, -0.9, 0.3))   # two heads thrown off, on their sides
        k.dish_head("fallen_dish_1", 9, F + 0.4, -16, 1.0, HEAD_WRECK, el=-0.6, lay=(2.1, 0.8, -0.4))
        for i in range(3):
            a = 0.5 + (i * math.pi * 2) / 3
            ax, az = MX + math.cos(a) * 17, MZ + math.sin(a) * 17
            k.box(1.8, 1, 1.8, "concrete", ax, 0, az, ink=0.04, name=f"guy_anchor_{i}")
            k.beam((ax, 1.1, az), (ax - math.cos(a) * 3, F, az - math.sin(a) * 3 + 0.5), 0.045, "navy", ink=0, seg=3, name=f"guy_wire_{i}_0")
        k.scatter_debris(MX, MZ, 4, 4, 8, wr)
        # burnt-out shed
        k.box(8.6, 0.06, 6, "char", SX, F, SZ, ink=0, name="shed_floor")
        n = 0
        x = -3.5
        while x <= 3.5:
            for s in (-1, 1):
                h = 0.4 + wr() * 1.8
                slot = "concrete" if wr() < 0.5 else "burnt_wall"
                k.box(1.7, h, 0.3, slot, SX + x, 0, SZ + s * 2.6, ink=0.04, name=f"shed_wall_{n}")
                n += 1
            x += 1.75
        for i, s in enumerate((-1, 1)):
            k.box(0.3, 0.4 + wr() * 1.5, 5, "burnt_wall", SX + s * 3.85, 0, SZ, ink=0.04, name=f"shed_side_{i}")
        k.box(8, 0.3, 5, "faction", SX + 0.5, 0.9, SZ + 0.4, rx=0.18, rz=-0.22, ink=0.05, name="shed_roof_fallen")
        k.box(1.6, 1.3, 0.9, "light", SX - 2, F, SZ + 3.6, rz=1.4, ink=0.04, name="shed_unit_fallen")
        k.scatter_debris(SX, SZ, 3.5, 2.5, 8, wr)
    k.hit(1.8, 20.6, 1.8, MX, MZ, name="hit_mast")
    k.hit(4, 1.9, 2.75, SX, SZ, name="hit_shed")
    k.point("smoke", MX, 2, MZ)
    k.point("drop", -4, F, 10)
    # transponder rack by the shed door (raid spot)
    k.box(0.8, 2.2, 1.2, "dark", SX - 4.6, F, SZ + 2.8, ink=0.05, name="rack")
    for i in range(4):
        k.box(0.05, 0.1, 0.9, "glow_cyan" if i % 2 else "glow_green", SX - 5.02, F + 0.5 + i * 0.4, SZ + 2.8, ink=0, name=f"rack_led_{i}")
    k.box(0.84, 0.2, 1.24, "faction", SX - 4.6, F + 2.2, SZ + 2.8, ink=0, name="rack_top")
    k.cyl(0.03, 0.03, 1.6, 4, "light", SX - 4.6, F + 2.4, SZ + 3.2, ink=0, name="rack_antenna")
    k.ball(0.1, "glow_red", SX - 4.6, F + 4.05, SZ + 3.2, ink=0, name="rack_beacon")
    k.raid_at(SX - 6.6, SZ + 1.2, "glow_cyan")
    # cable tray from the shed to the mast
    t0, t1 = (SX - 4.2, SZ - 1.5), (MX + 1.4, MZ + 1.6)
    k.strip(t0, t1, 0.7, 0.15, "steel", 1.3, name="tray")
    for i, (off, slot) in enumerate(((0.2, "cable_orange"), (0, "cable_blue"), (-0.2, "cable_black"))):
        k.strip((t0[0], t0[1] + off), (t1[0], t1[1] + off), 0.12, 0.1, slot, 1.45, ink=0, name=f"tray_cable_{i}")
    for i in range(5):
        t = i / 4
        k.cyl(0.06, 0.06, 1.3, 4, "dark", t0[0] + (t1[0] - t0[0]) * t, 0, t0[1] + (t1[1] - t0[1]) * t, ink=0, name=f"tray_post_{i}")
    # big ground dish
    k.at(-13, 10, 2.4)
    k.cyl(0.6, 0.9, 2.4, 8, "light", 0, 0, 0, ink=0.05, name="dish_ground_base")
    k.box(1.4, 0.8, 1.0, "dark", 0, 2.2, 0, ink=0.03, name="dish_ground_head")
    k.dish_head("dish_ground", 0, 3.0, 0, 2.2, HEAD, az=math.pi, el=-0.7)
    k.column(1.2, 3, 0, 0, name="col_dish_ground")
    k.at()
    # name board, flags, perimeter, lights
    k.sign("RELAY MAST", 0, 21.6, w=9, ph=2.0537)  # text plane height at width 8.5, measured in the game
    k.flag(-5.8, 21.4, 9)
    k.flag(5.8, 21.4, 9)
    k.perimeter(23.4, 0.32, 0.32)
    k.lamp(17, -6, 7)
    k.lamp(-17, -10, 7)
    return root


# ---------------- shared props: sandbag nests and crates (sandbags() / crate() in outpostModels.js) ----------------

def sandbags(k, cx, cz, r, a0, a1, rows=2):
    """Rows of squashed sandbags on an arc of radius r about (cx, cz), angles a0..a1 (about +y from +z), plus colliders:
    one block per 2.4 m of arc, as high as the stack."""
    nest = k.count("nest")
    for row in range(rows):
        step = 1.25 / r
        a, i = a0 + (row % 2) * step * 0.5, 0
        while a <= a1:
            k.add(place(sphere(0.66, 6, 3), Matrix.Diagonal((1, 0.5, 0.62, 1))), "sandbag", cx + math.sin(a) * r, F + 0.28 + row * 0.5, cz + math.cos(a) * r,
                  ry=a + math.pi / 2, ink=0.03, name=f"sandbag_{nest}_{row}_{i}")
            a += step
            i += 1
    n = max(1, math.ceil(((a1 - a0) * r) / 2.4))
    da = (a1 - a0) / n
    for i in range(n):
        a = a0 + (i + 0.5) * da
        k.solid((da * r) / 2 + 0.35, (F + rows * 0.5 + 0.1) / 2, 0.42, cx + math.sin(a) * r, cz + math.cos(a) * r, a + math.pi / 2, name=f"col_sandbag_{nest}_{i}")


def crate(k, x, y0, z, s, slot, ry=0.0):
    """Banded crate and its collider (crate() in outpostModels.js)."""
    n = k.count("crate")
    k.box(s, s, s, slot, x, y0, z, ry=ry, ink=0.04, name=f"crate_{n}")
    k.box(s * 1.02, s * 0.14, s * 1.02, "crate_band", x, y0 + s * 0.43, z, ry=ry, ink=0, name=f"crate_{n}_band")
    k.solid(s / 2, s / 2, s / 2, x, z, ry, y0, name=f"col_crate_{n}")


# ---------------- Watchtower ----------------
# Lattice tower with a lit cab and a sweeping searchlight (spinning part), a Quonset barracks, a gun nest, a ring of
# barriers and a gate sign. Wreck: the tower snapped above the first bay and folded towards the gate; the barracks
# burnt to ribs and buckled skin.

def build_tower(wreck):
    root = pivot("tower_wreck" if wreck else "tower", (0, 0, 0), None)
    k = Kit(root, KIND_SEED["tower"] * 977 + 0 * 131, wreck, tag="tower")
    k.apron(24, "apron_tower", "apron_edge")
    # jersey barriers round the edge, gap at the gate (+z); every third has a faction cap
    n, a = 0, 0.38
    while a < math.pi * 2 - 0.37:
        x, z = math.sin(a) * 22, math.cos(a) * 22
        k.box(2.95, 0.55, 1.05, "jersey", x, F - 0.05, z, ry=a, ink=0.04, name=f"jersey_{n}_base")
        k.box(2.95, 0.6, 0.5, "jersey", x, F + 0.5, z, ry=a, ink=0.04, name=f"jersey_{n}_top")
        if n % 3 == 0:
            k.box(2.97, 0.16, 0.52, "faction", x, F + 0.85, z, ry=a, ink=0, name=f"jersey_{n}_cap")
        a += 3.25 / 22
        n += 1
    TX, TZ, H, BX, BZ = -7, -7, 22, 8.5, -8
    cn = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    if not wreck:
        hw = lambda y: 3.4 + (2.0 - 3.4) * (y / H)
        k.box(8, 0.5, 8, "concrete", TX, 0, TZ, name="lattice_base")
        for i, (sx, sz) in enumerate(cn):
            k.beam((TX + sx * 3.4, 0.4, TZ + sz * 3.4), (TX + sx * 2.0, H, TZ + sz * 2.0), 0.24, "steel", ink=0.05, seg=6, name=f"lattice_leg_{i}")
        lv = [0.5, 5.8, 11.1, 16.4, H]
        for i in range(4):
            y0, y1 = lv[i], lv[i + 1]
            w0, w1 = hw(y0), hw(y1)
            for f in range(4):
                (ax, az), (bx, bz) = cn[f], cn[(f + 1) % 4]
                k.beam((TX + ax * w0, y0, TZ + az * w0), (TX + bx * w1, y1, TZ + bz * w1), 0.08, "dark", name=f"lattice_{i}_{f}_x1")
                k.beam((TX + bx * w0, y0, TZ + bz * w0), (TX + ax * w1, y1, TZ + az * w1), 0.08, "dark", name=f"lattice_{i}_{f}_x2")
                if i > 0:
                    k.beam((TX + ax * w0, y0, TZ + az * w0), (TX + bx * w0, y0, TZ + bz * w0), 0.1, "steel", name=f"lattice_{i}_{f}_band")
        # ladder up the gate-facing side
        for i, s in enumerate((-0.5, 0.5)):
            k.beam((TX + s, 0.5, TZ + 3.5), (TX + s, H, TZ + 2.1), 0.05, "dark", ink=0.02, name=f"ladder_rail_{i}")
        y, j = 1.5, 0
        while y < H:
            zz = TZ + 3.5 - (1.4 * (y - 0.5)) / (H - 0.5)
            k.beam((TX - 0.5, y, zz), (TX + 0.5, y, zz), 0.04, "dark", ink=0, name=f"ladder_rung_{j}")
            y += 1.2
            j += 1
        # platform, railing, observation cab
        k.box(7.6, 0.4, 7.6, "dark", TX, H, TZ, name="platform")
        for i, s in enumerate((-1, 1)):
            k.box(7.6, 0.12, 0.12, "faction", TX, H + 1.1, TZ + s * 3.74, ink=0.02, name=f"rail_{i}_x")
            k.box(0.12, 0.12, 7.6, "faction", TX + s * 3.74, H + 1.1, TZ, ink=0.02, name=f"rail_{i}_z")
            for t in (-1, 0, 1):
                k.box(0.1, 1.1, 0.1, "dark", TX + t * 3.7, H + 0.4, TZ + s * 3.74, ink=0, name=f"rail_post_{i}_{t + 1}_x")
                k.box(0.1, 1.1, 0.1, "dark", TX + s * 3.74, H + 0.4, TZ + t * 3.7, ink=0, name=f"rail_post_{i}_{t + 1}_z")
        k.box(5, 2.8, 5, "steel", TX, H + 0.4, TZ, ink=0.08, name="cab")
        k.box(5.1, 1.0, 5.1, "glow_window", TX, H + 1.5, TZ, ink=0, name="cab_window")
        for i in range(-1, 2):
            for j, s in enumerate((-1, 1)):
                k.box(0.18, 1.02, 0.18, "dark", TX + i * 1.6, H + 1.49, TZ + s * 2.56, ink=0, name=f"cab_post_{i + 1}_{j}_x")
                k.box(0.18, 1.02, 0.18, "dark", TX + s * 2.56, H + 1.49, TZ + i * 1.6, ink=0, name=f"cab_post_{i + 1}_{j}_z")
        k.box(6, 0.45, 6, "faction", TX, H + 3.2, TZ, name="cab_roof")
        k.cyl(0.07, 0.09, 4, 5, "dark", TX + 2.2, H + 3.6, TZ + 2.2, ink=0.02, name="antenna")
        k.blinker(TX + 2.2, H + 7.8, TZ + 2.2, "glow_red", 0.35)
        # roof searchlight: meshes in the spin node's frame, the head's offset (up 1.15 m, nodded 0.42 rad about x)
        # baked into housing, lens and beam
        sl = k.dyn("searchlight", "spin", TX, H + 3.62, TZ)
        head = Matrix.Translation((0, 1.15, 0)) @ Matrix.Rotation(0.42, 4, "X")
        k.child(sl, "searchlight_pedestal", place(cylinder(0.35, 0.5, 0.8, 8), Matrix.Translation((0, 0.4, 0))), "dark")
        k.child(sl, "searchlight_housing", place(place(cylinder(0.6, 0.48, 1.3, 10), Matrix.Rotation(math.pi / 2, 4, "X")), head), "light")
        k.child(sl, "searchlight_lens", place(place(cylinder(0.52, 0.52, 0.06, 10), Matrix.Rotation(math.pi / 2, 4, "X")), head @ Matrix.Translation((0, 0, 0.66))), "glow_lens")
        cone = place(cylinder(0, 5, 38, 16, True), Matrix.Translation((0, 0, 19.7)) @ Matrix.Rotation(-math.pi / 2, 4, "X"))  # ConeGeometry(5, 38, 16, 1, true)
        beam = k.child(sl, "searchlight_beam", place(cone, head), "additive_searchlight")
        del beam["ink"]  # no outline on a light beam
        k.solid(3.4, 12.6, 3.4, TX, TZ, name="col_lattice")
        # Quonset barracks
        k.add(place(cylinder(3.4, 3.4, 11, 16), Matrix.Rotation(math.pi / 2, 4, "X")), "olive", BX, 0, BZ, ink=0.1, name="barracks")
        for i, dz in enumerate((-4.5, -1.5, 1.5, 4.5)):
            k.add(torus_partial(3.44, 0.1, 4, 18, math.pi), "olive_dark", BX, 0, BZ + dz, ink=0, name=f"barracks_rib_{i}")
        k.add(torus_partial(3.46, 0.22, 4, 18, math.pi), "faction", BX, 0, BZ + 3, ink=0, name="barracks_arc")
        k.box(1.6, 2.4, 0.2, "navy", BX, F, BZ + 5.52, ink=0.03, name="barracks_door")
        for i, s in enumerate((-1, 1)):
            k.add(place(cylinder(0.45, 0.45, 0.1, 10), Matrix.Rotation(math.pi / 2, 4, "X")), "glow_warm", BX + s * 1.9, 1.8, BZ + 5.52, ink=0, name=f"barracks_lamp_{i}")
        k.box(0.6, 0.2, 0.3, "glow_lamp", BX, 2.95, BZ + 5.6, ink=0, name="barracks_door_light")
        k.box(2, 1.4, 1.4, "mustard", BX + 5.2, F, BZ + 1, ink=0.05, name="barracks_box")
        k.cyl(0.12, 0.12, 1.6, 6, "dark", BX + 5.8, F + 1.4, BZ + 1.3, ink=0.02, name="barracks_pole")
        k.solid(3.4, 1.8, 5.5, BX, BZ, name="col_barracks")
    else:
        wr = k.wr
        # tower snapped above the first bay, folded towards the gate
        k.box(8, 0.5, 8, "concrete", TX, 0, TZ, name="lattice_base")
        k.box(9, 0.06, 9, "char", TX, 0.5, TZ, ink=0, name="lattice_scorch")
        for i, (sx, sz) in enumerate(cn):
            h = 2.5 + wr() * 3.5
            ex = TX + sx * 3.1 + (wr() - 0.5)
            ez = TZ + sz * 3.1 + (wr() - 0.5)
            k.beam((TX + sx * 3.4, 0.4, TZ + sz * 3.4), (ex, h, ez), 0.24, "steel_wreck", ink=0.05, seg=6, name=f"stump_{i}")
        for si, sx in enumerate((-1, 1)):
            for yi, y in enumerate((1.0, 1.9)):
                k.beam((TX + sx * 2.1, y, TZ + 2), (TX + sx * 2.3 + (wr() - 0.5) * 0.6, y + 0.3, TZ + 14), 0.22, "steel_wreck", ink=0.05, seg=6, name=f"fallen_rail_{si}_{yi}")
        for i in range(6):
            z = TZ + 3 + i * 2
            k.beam((TX - 2.2, 1.0 + (i % 2) * 0.9, z), (TX + 2.2, 1.9 - (i % 2) * 0.9, z + 2), 0.08, "dark", name=f"fallen_brace_{i}")
        k.box(5, 2.2, 5, "wreck_block", TX, F + 0.3, TZ + 16.5, rx=0.25, rz=0.35, ink=0.08, name="fallen_cab")
        k.box(6, 0.45, 6, "cabinet", TX + 0.8, F, TZ + 19.5, ry=0.5, rx=0.15, ink=0.06, name="fallen_roof")
        # burnt barracks: ribs and buckled skin
        k.box(7.4, 0.06, 11.5, "char", BX, F, BZ, ink=0, name="barracks_floor")
        for i, dz in enumerate((-4.5, -1.5, 1.5, 4.5)):
            if wr() < 0.75:
                arc = math.pi * (0.35 + wr() * 0.5)
                rz = wr() * 0.6
                k.add(torus_partial(3.4, 0.12, 4, 14, arc), "olive_burnt", BX, 0, BZ + dz, rz=rz, ink=0.03, name=f"barracks_rib_{i}")
        for i in range(4):
            h = 2 + wr() * 2
            t0 = wr() * 6
            x = BX + (wr() - 0.5) * 2
            rz = (wr() - 0.5) * 0.8
            k.add(place(cylinder_arc(3.4, 3.4, h, 8, t0, 0.9), Matrix.Rotation(math.pi / 2, 4, "X")), "hut_skin", x, 0.2, BZ - 4 + i * 2.6, rz=rz, ink=0.04, name=f"barracks_skin_{i}")
        k.scatter_debris(BX, BZ, 3.2, 5, 12, wr)
        k.scatter_debris(TX, TZ, 4, 4, 8, wr)
    k.hit(3.6, 12.8, 3.6, TX, TZ, name="hit_lattice")
    k.hit(3.4, 1.8, 5.5, BX, BZ, name="hit_barracks")
    k.point("smoke", TX, 2, TZ)
    k.point("drop", 1, F, 8)
    # ammo locker by the barracks door with a crate of searchlight lenses (raid spot)
    k.box(1.4, 2.0, 0.8, "olive_dark", BX + 2.6, F, BZ + 6.4, ink=0.05, name="locker")
    k.box(1.42, 0.25, 0.82, "faction", BX + 2.6, F + 1.5, BZ + 6.4, ink=0, name="locker_cap")
    k.box(0.9, 0.5, 0.05, "yellow", BX + 2.6, F + 0.8, BZ + 6.82, ink=0, name="locker_label")
    crate(k, BX + 2.6, F, BZ + 8.0, 1.0, "olive", 0.2)
    for i, (dx, dz) in enumerate(((-0.22, -0.2), (0.22, 0.2))):
        k.add(cylinder(0.2, 0.2, 0.06, 10), "glow_lens", BX + 2.6 + dx, F + 1.03, BZ + 8.0 + dz, ink=0, name=f"crate_lens_{i}")
    k.raid_at(BX, BZ + 8.3, "glow_yellow")
    # gun nest
    sandbags(k, -12, 8, 2.4, 0.6, 5.7, 2)
    for i, a in enumerate((0, 2.1, 4.2)):
        k.beam((-12, F + 1.1, 8), (-12 + math.sin(a) * 0.8, F, 8 + math.cos(a) * 0.8), 0.05, "dark", name=f"gun_tripod_{i}")
    k.box(0.4, 0.4, 2.2, "dark", -12, F + 1.05, 8.6, rx=-0.15, ink=0.03, name="gun_barrel")
    sandbags(k, 9, 12, 1.8, -0.6, 3.6, 2)
    crate(k, 9, F, 12, 1.1, "olive_dark")
    # gate arch, flags and floodlights
    k.sign("WATCHTOWER", 0, 22, w=9.8, y=5.4, ph=2.2470)  # text plane height at width 9.3 in the game's sign font (text drawn at runtime)
    k.flag(-6.6, 21.2, 10)
    k.flag(6.6, 21.2, 10)
    k.lamp(16, 13, 8)
    k.lamp(-17, -10, 8)
    k.lamp(18, -8, 8)
    return root


BUILDERS = {"mast": build_mast, "tower": build_tower}  # kind -> build(wreck) -> root pivot (named kind / kind_wreck)

for _kind, _build in BUILDERS.items():
    _build(False)
    _build(True)
setup_additive()
# Blender renames clashes `name.001` (a kind without its own tag= ends up here)
_clash = [o.name for o in C.objects if o.name[-4:-3] == "." and o.name[-3:].isdigit()]
assert not _clash, f"object names must be unique across the file, Blender renamed {_clash[:3]}: give each kind its own tag="
print("built", len(C.objects), "objects:", sum(o.type == "MESH" for o in C.objects), "meshes,", sum(o.type == "EMPTY" for o in C.objects), "empties")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
