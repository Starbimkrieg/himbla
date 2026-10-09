# Daedalus Phase Skimmer builder for Blender (4.2+ / 5.x).
#
# Builds the skimmer from code and exports src/assets/skimmer.glb. In Blender's Python console or
# via MCP:  exec(open(r"<repo>/tools/blender/build_skimmer.py").read())
#
# A hover-racer, no wheels: a low wedge hull slung between two hover nacelles, each with violet
# phase-coil rings and an emitter strip underneath, twin thrusters at the back and an open cockpit.
#
# Same conventions as build_ships.py (read by loadShipParts / makeSkimmer in src/models.js):
# - One root empty "skimmer"; every mesh is a child of a pivot empty and read in its frame.
#   Pivot roles: hull (static), coil (a phase-coil ring, spins about z), plume (thruster flame
#   along -z, pulses), lift (hover glow along -y, breathes).
# - Each mesh has ONE material named after a slot (body, stripe, dark, metal, glass, glow, ...);
#   the game swaps in its own toon / glow materials per slot, so the Garage livery recolours it.
# - Custom property "ink" = outline thickness in metres (0 = none).
# - Authored in three.js axes (x right, y up, +z nose); origin on the ground under the middle (the
#   game floats it 0.8 m up and bobs it). The runner sits 0.8 m above the origin.

import bpy, math, os

def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_skimmer.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "skimmer.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Skimmer export ->", OUT)
COLL = "MoonSkimmer"

# preview colours only (the Daedalus livery): the game replaces every slot with its own material
SLOT_COLORS = {
    "body": (0.1, 0.08, 0.15), "stripe": (0.78, 0.49, 1.0), "dark": (0.06, 0.05, 0.09),
    "metal": (0.54, 0.53, 0.63), "steel": (0.3, 0.3, 0.4), "glass": (0.6, 0.9, 1.0),
    "glow": (0.78, 0.49, 1.0), "seat": (0.13, 0.11, 0.2), "engine": (1.0, 0.62, 0.11),
    "core": (1.0, 0.95, 0.75), "white": (1.0, 0.96, 0.66), "red": (1.0, 0.16, 0.29),
    "plume": (0.78, 0.49, 1.0), "plumeCore": (1.0, 0.95, 1.0), "lift": (0.78, 0.49, 1.0),
}


# geometry and scene helpers shared with the other build scripts
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)


# =============================================================================================
# The skimmer
# =============================================================================================

ROOT = pivot("skimmer", (0, 0, 0), None)
H = pivot("skimmer_hull", (0, 0, 0), ROOT, role="hull")

# ---- the hull: a flat wedge, nose low, flaring wide at the back over the cockpit ----
HULL = [
    {"z": -2.75, "w": 0.95, "t": 0.42, "b": 0.3, "yc": 0.98, "eT": 3.2, "eB": 4},
    {"z": -2.45, "w": 1.18, "t": 0.55, "b": 0.36, "yc": 1.0, "eT": 3.2, "eB": 4},
    {"z": -1.2, "w": 1.28, "t": 0.6, "b": 0.42, "yc": 1.0, "eT": 3.2, "eB": 4},
    {"z": 0.4, "w": 1.22, "t": 0.5, "b": 0.42, "yc": 0.96, "eT": 3.0, "eB": 4},
    {"z": 1.7, "w": 0.95, "t": 0.32, "b": 0.34, "yc": 0.88, "eT": 2.6, "eB": 3.5},
    {"z": 2.75, "w": 0.48, "t": 0.17, "b": 0.2, "yc": 0.78, "eT": 2.4, "eB": 3},
    {"z": 3.25, "w": 0.12, "t": 0.06, "b": 0.08, "yc": 0.74, "eT": 2.2, "eB": 2.6},
]
mesh("hull", loft(HULL, 40), "body", H, 0.06)
# a violet racing stripe laid over the spine, and a lip of trim round the hull's widest line
mesh("spine", keep(loft(grow(HULL, 0.02), 40, False, False), lambda c: abs(c[0]) < 0.22 and c[1] > 1.2), "stripe", H, 0)
mesh("chine", keep(loft(grow(HULL, 0.025), 40, False, False), lambda c: abs(c[1] - 0.96) < 0.06 and abs(c[0]) > 0.3), "stripe", H, 0)
# belly keel and a nose splitter
mesh("keel", xf(rbox(0.5, 0.12, 2.3, 0.3), (0, 0.55, -0.1)), "dark", H, 0.03)
mesh("splitter", xf(extrude([(2.4, 0), (3.35, 0), (3.1, 0.06), (2.4, 0.08)], 1.1, "x"), (0, 0.62, 0)), "dark", H, 0.02)
mesh("noseLight", xf(rbox(0.32, 0.05, 0.05, 0.4, 8, 4), (0, 0.86, 3.0)), "white", H, 0)

# ---- the cockpit: an open tub with a seat, a dash and a raked windscreen ----
mesh("tub", xf(rbox(0.62, 0.22, 1.05, 0.25), (0, 1.48, -0.55)), "dark", H, 0.02)
mesh("seat", xf(rbox(0.42, 0.12, 0.42, 0.3), (0, 1.38, -0.8)), "seat", H, 0.02)
mesh("seatBack", xf(rbox(0.42, 0.5, 0.12, 0.3), (0, 1.85, -1.28), (-0.25, 0, 0)), "seat", H, 0.03)
mesh("headrest", xf(rbox(0.26, 0.16, 0.1, 0.4), (0, 2.45, -1.42), (-0.25, 0, 0)), "stripe", H, 0)
mesh("dash", xf(rbox(0.55, 0.1, 0.22, 0.3), (0, 1.55, 0.42), (0.35, 0, 0)), "dark", H, 0.02)
mesh("dashGlow", xf(rbox(0.4, 0.02, 0.1, 0.4, 8, 4), (0, 1.66, 0.42), (0.35, 0, 0)), "glow", H, 0)
mesh("screen", xf(lathe([(0, 0), (0.72, 0.0), (0.7, 0.06), (0, 0.06)], 24), (0, 1.62, 0.62), (-1.05, 0, 0), (1, 1, 0.55)), "glass", H, 0.02)
mesh("screenFrame", xf(torus(0.7, 0.035, 24, 4), (0, 1.62, 0.62), (-1.05, 0, 0), (1, 1, 0.55)), "stripe", H, 0)

# ---- the hover nacelles: long pods slung off each flank on swept pylons ----
NX, NY = 1.78, 0.68
NAC = [
    {"z": -2.6, "w": 0.34, "t": 0.34, "b": 0.34},
    {"z": -2.2, "w": 0.46, "t": 0.44, "b": 0.42},
    {"z": 0.9, "w": 0.46, "t": 0.42, "b": 0.42},
    {"z": 2.1, "w": 0.32, "t": 0.28, "b": 0.32},
    {"z": 2.6, "w": 0.1, "t": 0.08, "b": 0.12},
]
for side in (-1, 1):
    tag = "LR"[side > 0]
    pod = xf(loft(NAC, 24), (side * NX, NY, 0))
    mesh(f"nacelle{tag}", pod, "body", H, 0.05)
    mesh(f"nacelleCap{tag}", xf(loft(grow(NAC[3:], 0.015), 24, False, True), (side * NX, NY, 0)), "stripe", H, 0)
    # the pylon: a swept slab from the hull's flank out to the pod
    span = NX - 0.95
    mesh(f"pylon{tag}", xf(rbox(span / 2 + 0.1, 0.07, 1.05, 0.25), (side * (0.95 + span / 2), 0.8, -0.5), (0, 0, side * -0.12)), "dark", H, 0.03)
    # emitter strip underneath, the glow that holds it up
    mesh(f"emitter{tag}", xf(rbox(0.26, 0.05, 1.9, 0.25, 10, 4), (side * NX, NY - 0.43, -0.3)), "glow", H, 0)
    mesh(f"emitterFrame{tag}", xf(rbox(0.34, 0.06, 2.0, 0.2, 10, 4), (side * NX, NY - 0.39, -0.3)), "dark", H, 0.02)
    for k, z in enumerate((-1.3, -0.3, 0.7)):
        plume(H, f"lift{tag}{k}", (side * NX, NY - 0.47, z), 0.3, 0.45, axis="y")
    # phase coils: three violet rings round each pod that spin while it flies
    for k, z in enumerate((-1.5, -0.4, 0.7)):
        R = pivot(f"coil{tag}{k}", (side * NX, NY, z), ROOT, role="coil", spin=side * (2.6 + k * 0.7))
        mesh(f"coil{tag}{k}_ring", xf(torus(0.56, 0.055, 24, 6), r=(math.pi / 2, 0, 0)), "glow", R, 0)
        for j in range(3):
            a = j * 2 * math.pi / 3
            mesh(f"coil{tag}{k}_tab{j}", xf(rbox(0.07, 0.07, 0.1, 0.3, 6, 4), (math.cos(a) * 0.56, math.sin(a) * 0.56, 0)), "stripe", R, 0)
    # thruster at the back of each pod, flame along -z
    mesh(f"bell{tag}", xf(lathe([(0.3, 0), (0.34, 0.15), (0.42, 0.42), (0.42, 0.5)], 18), (side * NX, NY, -2.55), (math.pi / 2, 0, 0)), "dark", H, 0.03)
    mesh(f"bellGlow{tag}", xf(lathe([(0, 0), (0.3, 0), (0.3, 0.04), (0, 0.04)], 16), (side * NX, NY, -2.62), (math.pi / 2, 0, 0)), "engine", H, 0)
    plume(H, f"plume{tag}", (side * NX, NY, -3.06), 0.34, 2.2)
    # a raked tail fin on top of each pod
    fin = [(-2.55, 0.0), (-1.2, 0.0), (-2.1, 0.95), (-2.75, 0.95)]
    mesh(f"fin{tag}", xf(extrude(fin, 0.07, "x"), (side * NX, NY + 0.36, 0), (0, 0, -side * 0.12)), "body", H, 0.03)
    mesh(f"finTip{tag}", xf(rbox(0.05, 0.05, 0.34, 0.4, 6, 4), (side * (NX - 0.12), NY + 1.32, -2.42)), "stripe", H, 0)
    # running lights: white up front, red at the back
    mesh(f"headlight{tag}", xf(superquad(0.12, 0.08, 0.08, 1, 1, 10, 6), (side * NX, NY + 0.02, 2.47)), "white", H, 0)
    mesh(f"taillight{tag}", xf(rbox(0.16, 0.05, 0.04, 0.4, 6, 4), (side * NX, NY + 0.3, -2.4)), "red", H, 0)

ROOT["radius"] = 3.4
print("built", len(C.objects), "objects")


if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)
