# The Kepler Habitat's palette and the Kepler orbit mark, for build_habitat.py (the Orrery, in the game) and the Spiral Street
# proposal (proposals/habitat_b.py). exec() it with REPO and COLL set; it execs wing_kit.py (the accumulator, geometry and
# furniture every ILMB wing shares), which execs kit.py.

import math, os
from mathutils import Vector, Matrix

# preview colours, as the game's toon / glow would draw them (Kepler: orange 0xff9f1c, cream 0xfff4e0, green 0x6a8f3a)
HEX = {
    "wall": 0xfff4e0, "trim": 0xff9f1c, "accent": 0x6a8f3a, "panel": 0x5b5870, "roof": 0x3a3550, "dark": 0x2a2540,
    "metal": 0x8a87a0, "steel": 0x55607a, "concrete": 0xb8b2cc, "pave": 0x9d97b0, "stone": 0x6f6878, "lawn": 0x3ad15a,
    "leaf": 0x1f8a3a, "leaf2": 0x5cc94a, "bark": 0x6b4a2a, "path": 0xd8c9a8, "wood": 0x8a5a3a, "solar": 0x1d2f6b,
    "mint": 0xb8ffb0, "sky": 0x9be7ff, "butter": 0xffe08a, "coral": 0xff8a6a, "peach": 0xffc48a, "lilac": 0xd7c4ff,
    "door": 0x2a2540, "hazard": 0xffd23f,
    # glow
    "window": 0xfff6a8, "lamp": 0xfff6a8, "beacon": 0xff9f1c, "water": 0x5ad8ff, "glass": 0x9be7ff, "portal": 0xbfefff,
}
GLOW_SLOTS = {"window": 2.2, "lamp": 5.0, "beacon": 6.0, "water": 1.6, "portal": 1.4}
exec(open(os.path.join(REPO, "tools", "blender", "wing_kit.py"), encoding="utf-8").read(), globals())


def orbit_mark(ringacc, planet, cx, cy, cz, R, tube_r, tilt, yaw, planet_r, planet_t=0.6):
    """The Kepler mark in the round: a tilted orbit ring with a planet on it (decals.py draws it flat on the cargo)."""
    rot = Matrix.Rotation(yaw, 4, "Y") @ Matrix.Rotation(tilt, 4, "X")
    v, f = torus(R, tube_r, 48, 8)
    ringacc.put(([tuple(Vector((cx, cy, cz)) + (rot @ Vector(p).to_4d()).to_3d()) for p in v], f))
    p = rot @ Vector((math.sin(planet_t) * R, 0, math.cos(planet_t) * R, 1))
    planet.put(ball(cx + p.x, cy + p.y, cz + p.z, planet_r, 12, 8))
    return [Vector((cx, cy, cz)) + (rot @ Vector((math.sin(a) * R, 0, math.cos(a) * R, 1))).to_3d() for a in (0.0, TAU / 3, 2 * TAU / 3)]
