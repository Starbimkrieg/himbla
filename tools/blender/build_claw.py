# Zero-G claw builder for Blender (4.2+ / 5.x): the Lucky Crater Casino's claw machine (a 15.6 m glass tank on the hall's
# front wall) and its floating prizes, exported to src/assets/claw.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_claw.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_claw.py
#
# three.js axes (x right, y up, +z toward the player). Roots are centred on their origin, except the machine: origin on the
# floor at the middle of its back (against the wall), front toward +z. One material per mesh, named after a slot
# (CLAW_TOON / CLAW_GLOW / CLAW_CLEAR in src/models.js), plus an `ink` property for the outline shell.
#   claw_machine   cabinet 16.4 m wide, 5.2 m deep, 6.6 m tall (8.4 m with marquee): plum base, gold trim, brass mullion frame,
#                  cornice, marquee box, cyan vent floor with a lit DROP hole centre-left (prizes go down it), slanted console
#                  (stick, beam button, screen), ten ceiling shuffle jets. Tank inside: x +-7.7, y 1.45 to 6.4, z 0.3 to 3.5;
#                  glass is slot `glass` (CLAW_CLEAR). Pivots: marquee (plane w by h), screen (plane, extra tilt), drop (the
#                  floor hole), jets (`jet` roles at each ceiling jet)
#   claw_claw      energy claw: brass body on three steel fingers with lamps, ~1 m across, origin at the body's middle
#   claw_crate, claw_canister, claw_gear, claw_girder, claw_mine, claw_magnet, claw_tyre, claw_hullplate, claw_chip (the LUCKY CHIP, the jackpot), claw_lockbox, claw_gem
#                  floating prizes, centred, ~0.5 to 1.8 m across. The engine and credits case are the game's own models
#                  (engine.glb, briefcase.glb). The game tints `crate`'s slot `crate`
#   claw_link      one link of the chain that tows crates, canisters, cogs and tyres: a 0.25 m steel ring in the xz plane

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_claw.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("CLAW_OUT") or os.path.join(REPO, "src", "assets", "claw.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Claw export ->", OUT)
COLL = "MoonClaw"
PI = math.pi

SLOT_COLORS = {
    "plum": (0.2, 0.08, 0.35), "plum2": (0.3, 0.12, 0.5), "gold": (1.0, 0.82, 0.25), "brass": (0.78, 0.6, 0.2), "steel": (0.5, 0.52, 0.62),
    "dark": (0.09, 0.07, 0.14), "hazard": (1.0, 0.8, 0.1), "red": (0.86, 0.13, 0.2), "crate": (0.8, 0.5, 0.2), "cream": (0.97, 0.94, 0.86),
    "neonpink": (1.0, 0.18, 0.53), "neoncyan": (0.18, 0.9, 1.0), "glowred": (1.0, 0.16, 0.29), "chipgold": (1.0, 0.82, 0.25), "gem": (0.4, 0.9, 1.0),
    "rubber": (0.1, 0.09, 0.12), "lamp": (1.0, 0.96, 0.66), "glass": (0.6, 0.9, 1.0), "suitred": (1.0, 0.16, 0.26), "suitcream": (1.0, 0.96, 0.88),
}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)


class Acc:
    """Primitives sharing a slot and parent, merged into one mesh on flush."""
    all = []

    def __init__(self, name, slot, parent, ink=0.03):
        self.name, self.slot, self.parent, self.ink, self.geos = name, slot, parent, ink, []
        Acc.all.append(self)

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot)); return self

    def cylc(self, cx, cy, cz, r, h, seg=12, rt=None, rot=(0, 0, 0)):
        self.geos.append(xf(cylinder(r if rt is None else rt, r, h, seg)[:2], (cx, cy, cz), rot)); return self

    def ball(self, cx, cy, cz, r, w=10, h=7, s=(1, 1, 1), rot=(0, 0, 0)):
        self.geos.append(xf(sphere(r, w, h)[:2], (cx, cy, cz), rot, s)); return self

    def tor(self, R, r, t=(0, 0, 0), rot=(0, 0, 0), n=20, rs=6):
        self.geos.append(xf(torus(R, r, n, rs), t, rot)); return self

    def tube(self, a, b, r, seg=6):
        self.geos.append(beam(a, b, r, seg)); return self

    def path(self, pts, r, seg=6):
        self.geos.append(tube(pts, r if isinstance(r, (list, tuple)) else [r] * len(pts), seg)); return self

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1)):
        self.geos.append(xf(geo[:2], t, rot, s)); return self

    def flush(self):
        if self.geos:
            mesh(self.name, join(self.geos), self.slot, self.parent, self.ink)
        self.geos = []


def flush_all():
    for a in Acc.all:
        a.flush()
    Acc.all = []


exec(open(os.path.join(REPO, "tools", "blender", "suits.py"), encoding="utf-8").read(), globals())   # card-suit panels


# =====================================================================================================================
# the machine
# =====================================================================================================================
W, D, H0, H1 = 16.4, 5.2, 1.3, 6.6          # width, depth, tank floor (base top), tank roof (frame underside)
DROP = (-3.4, 2.3)                           # drop hole (x, z): centre-left, mid-depth
m = pivot("claw_machine", (0, 0, 0), None)
A = Acc("base", "plum", m, 0.05)
A.boxc(0, H0 / 2, D / 2 - 0.55, W, H0, D - 1.1)
A.flush()
A = Acc("baseTrim", "gold", m, 0.03)
A.boxc(0, H0 + 0.05, 2.1, W + 0.2, 0.12, 4.2)
A.boxc(0, 0.15, 2.2, W + 0.1, 0.3, 4.5)
A.flush()
# card-suit trim (suits.py): along the front either side of the console, one on each end
AF = Acc("baseFrames", "brass", m, 0.0); AP = Acc("basePanels", "dark", m, 0.0); AR = Acc("baseRed", "suitred", m, 0.012); AC = Acc("baseCream", "suitcream", m, 0.012)
for k, x in enumerate((-6.3, -4.7, -3.1, 3.1, 4.7, 6.3)):
    suit_panel(AF, AP, AR, AC, k % 4, (x, 0.78, D - 1.1), 0, 1.5, 0.66, 0.34)
suit_panel(AF, AP, AR, AC, 1, (-W / 2, 0.78, 2.0), -PI / 2, 2.8, 0.66, 0.34)
suit_panel(AF, AP, AR, AC, 2, (W / 2, 0.78, 2.0), PI / 2, 2.8, 0.66, 0.34)
AF.flush(); AP.flush(); AR.flush(); AC.flush()
# frame: six mullions front and back, end posts, roof beam, cornice, marquee box
A = Acc("frame", "brass", m, 0.04)
for i in range(6):
    x = -W / 2 + 0.4 + i * (W - 0.8) / 5
    A.boxc(x, (H0 + H1) / 2 + 0.05, 3.55, 0.3, H1 - H0, 0.3)
    A.boxc(x, (H0 + H1) / 2 + 0.05, 0.25, 0.3, H1 - H0, 0.3)
for x in (-W / 2 + 0.15, W / 2 - 0.15):
    A.boxc(x, (H0 + H1) / 2, 1.9, 0.3, H1 - H0, 3.7)
A.boxc(0, H1 + 0.15, 1.9, W + 0.3, 0.4, 3.9)
A.flush()
A = Acc("cornice", "gold", m, 0.03)
A.boxc(0, H1 + 0.45, 2.0, W + 0.5, 0.25, 4.3)
A.flush()
A = Acc("marqueeBox", "plum2", m, 0.04)
A.boxc(0, H1 + 1.15, 3.45, 9.0, 1.3, 0.6)                                       # at the cornice's front edge, readable from the hall
A.flush()
pivot("marquee", (0, H1 + 1.15, 3.77), m, role="marquee", w=8.6, h=1.0)
# floor: dark grate, cyan vents, and the DROP hole (lit ring round a dark well) where banked prizes go down
A = Acc("floorGrate", "dark", m, 0.0)
A.boxc(0, H0 + 0.08, 1.9, W - 0.7, 0.06, 3.3)
A.flush()
A = Acc("vents", "neoncyan", m, 0.0)
for i in range(24):
    x = -W / 2 + 1.0 + i * (W - 2.0) / 23
    if abs(x - DROP[0]) < 1.0:
        continue
    A.boxc(x, H0 + 0.12, 1.9, 0.5, 0.03, 2.8)
A.flush()
A = Acc("dropWell", "dark", m, 0.0)
A.cylc(DROP[0], H0 + 0.14, DROP[1], 0.72, 0.04, 20)
A.flush()
A = Acc("dropRim", "glowred", m, 0.0)
A.tor(0.78, 0.05, (DROP[0], H0 + 0.16, DROP[1]), (0, 0, 0), 28, 5)
A.tor(0.52, 0.03, (DROP[0], H0 + 0.165, DROP[1]), (0, 0, 0), 22, 5)
A.flush()
pivot("drop", (DROP[0], H0 + 0.16, DROP[1]), m, role="drop", r=0.72)
# glass: one flat quad each for front and ends (drawn see-through and double-sided; a box would stack four tint layers per pane)
A = Acc("glassFront", "glass", m, 0.0)
A.add(plane(W - 0.8, H1 - H0), (0, (H0 + H1) / 2, 3.62))
A.flush()
A = Acc("glassEnds", "glass", m, 0.0)
for sx in (-1, 1):
    A.add(plane(3.4, H1 - H0), (sx * (W / 2 - 0.62), (H0 + H1) / 2, 1.9), (0, PI / 2, 0))
A.flush()
# console: slanted desk mid-front, stick, beam button, screen
A = Acc("console", "plum2", m, 0.04)
A.boxc(0, 0.95, 4.65, 4.6, 0.3, 1.3, rot=(-0.22, 0, 0))
A.flush()
A = Acc("consoleTrim", "gold", m, 0.02)
A.boxc(0, 1.12, 5.2, 4.7, 0.08, 0.1, rot=(-0.22, 0, 0))
A.flush()
A = Acc("stick", "steel", m, 0.02)
A.cylc(-1.1, 1.3, 4.7, 0.07, 0.6, 8)
A.cylc(-1.1, 1.05, 4.7, 0.22, 0.12, 12)
A.flush()
A = Acc("stickBall", "glowred", m, 0.0)
A.ball(-1.1, 1.65, 4.7, 0.18, 12, 8)
A.flush()
A = Acc("buttons", "neoncyan", m, 0.0)
A.cylc(0.8, 1.1, 4.65, 0.28, 0.08, 16)
A.cylc(1.7, 1.1, 4.65, 0.22, 0.08, 14)
A.flush()
A = Acc("buttonRing", "neonpink", m, 0.0)
A.tor(0.34, 0.03, (0.8, 1.14, 4.65), (0, 0, 0), 20, 5)
A.flush()
pivot("screen", (0, 1.45, 4.35), m, role="screen", w=1.7, h=0.5, tilt=0.22)
# ten roof shuffle jets, a pivot each (the game puffs plumes from them during a shuffle)
A = Acc("jets", "neonpink", m, 0.0)
for i in range(10):
    x = -W / 2 + 1.4 + i * (W - 2.8) / 9
    A.cylc(x, H1 - 0.05, 1.9, 0.22, 0.1, 10)
    pivot(f"jet{i}", (x, H1 - 0.12, 1.9), m, role="jet")
A.flush()


# =====================================================================================================================
# the claw (the game draws its hose from the roof)
# =====================================================================================================================
def claw():
    o = pivot("claw_claw", (0, 0, 0), None)
    A = Acc("clawBody", "brass", o, 0.04)
    A.cylc(0, 0.35, 0, 0.45, 0.3, 14)
    A.cylc(0, 0.6, 0, 0.28, 0.2, 12)
    A.flush()
    A = Acc("clawFingers", "steel", o, 0.03)
    for i in range(3):
        a = 2 * PI * i / 3
        A.path([(math.sin(a) * 0.3, 0.2, math.cos(a) * 0.3), (math.sin(a) * 0.5, -0.1, math.cos(a) * 0.5), (math.sin(a) * 0.28, -0.4, math.cos(a) * 0.28)], [0.07, 0.06, 0.04], 6)
    A.flush()
    A = Acc("clawLamps", "lamp", o, 0.0)
    A.ball(0, 0.75, 0, 0.1, 8, 6)
    for i in range(3):
        a = 2 * PI * i / 3 + 0.5
        A.ball(math.sin(a) * 0.45, 0.35, math.cos(a) * 0.45, 0.06, 6, 4)
    A.flush()


# =====================================================================================================================
# floating prizes
# =====================================================================================================================
def crate():
    o = pivot("claw_crate", (0, 0, 0), None)
    A = Acc("crateBody", "crate", o, 0.03); A.boxc(0, 0, 0, 0.7, 0.7, 0.7); A.flush()
    A = Acc("crateTrim", "gold", o, 0.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            A.boxc(sx * 0.33, 0, sz * 0.33, 0.1, 0.72, 0.1)
    for sy in (-1, 1):
        A.boxc(0, sy * 0.33, 0, 0.72, 0.1, 0.72)
    A.boxc(0, 0, 0.36, 0.62, 0.1, 0.02, rot=(0, 0, 0.78)); A.boxc(0, 0, 0.36, 0.62, 0.1, 0.02, rot=(0, 0, -0.78))
    A.boxc(0, 0, -0.36, 0.62, 0.1, 0.02, rot=(0, 0, 0.78)); A.boxc(0, 0, -0.36, 0.62, 0.1, 0.02, rot=(0, 0, -0.78))
    A.flush()


def canister():
    o = pivot("claw_canister", (0, 0, 0), None)
    A = Acc("canBody", "red", o, 0.03); A.cylc(0, 0, 0, 0.27, 0.8, 14); A.flush()
    A = Acc("canBand", "hazard", o, 0.0); A.cylc(0, 0.05, 0, 0.275, 0.2, 14); A.flush()
    A = Acc("canCap", "steel", o, 0.02)
    A.cylc(0, 0.43, 0, 0.2, 0.08, 12); A.cylc(0, 0.5, 0, 0.05, 0.1, 8); A.tube((0, 0.52, 0), (0.15, 0.55, 0), 0.025, 6)
    A.tor(0.27, 0.025, (0, -0.4, 0)); A.tor(0.27, 0.025, (0, 0.4, 0))
    A.flush()
    A = Acc("canGlow", "glowred", o, 0.0); A.ball(0.17, 0.55, 0, 0.04, 6, 4); A.flush()


def gear():
    o = pivot("claw_gear", (0, 0, 0), None)
    A = Acc("gearBody", "steel", o, 0.03)
    A.cylc(0, 0, 0, 0.4, 0.18, 16)
    for i in range(12):
        a = 2 * PI * i / 12
        A.boxc(math.sin(a) * 0.46, 0, math.cos(a) * 0.46, 0.14, 0.18, 0.14, rot=(0, a, 0))
    A.flush()
    A = Acc("gearHub", "dark", o, 0.0); A.cylc(0, 0, 0, 0.12, 0.2, 10); A.cylc(0, 0, 0, 0.22, 0.04, 14); A.flush()


def girder():
    o = pivot("claw_girder", (0, 0, 0), None)
    A = Acc("girderBody", "steel", o, 0.03)
    A.boxc(0, 0, 0, 1.8, 0.08, 0.04); A.boxc(0, 0.17, 0, 1.8, 0.05, 0.4); A.boxc(0, -0.17, 0, 1.8, 0.05, 0.4)
    A.flush()
    A = Acc("girderEnds", "hazard", o, 0.0); A.boxc(0.9, 0, 0, 0.06, 0.4, 0.42); A.boxc(-0.9, 0, 0, 0.06, 0.4, 0.42); A.flush()


def mine():
    o = pivot("claw_mine", (0, 0, 0), None)
    A = Acc("mineBody", "dark", o, 0.03); A.ball(0, 0, 0, 0.4, 12, 8); A.flush()
    A = Acc("mineSpikes", "steel", o, 0.0)
    dirs = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1), (.7, .7, 0), (-.7, .7, 0), (.7, -.7, 0), (-.7, -.7, 0), (0, .7, .7), (0, .7, -.7), (0, -.7, .7), (0, -.7, -.7)]
    for d in dirs:
        L = math.sqrt(sum(c * c for c in d)); u = [c / L for c in d]
        A.tube([u[0] * 0.38, u[1] * 0.38, u[2] * 0.38], [u[0] * 0.62, u[1] * 0.62, u[2] * 0.62], 0.05, 5)
    A.flush()
    A = Acc("mineTips", "glowred", o, 0.0)
    for d in dirs[:6]:
        A.ball(d[0] * 0.64, d[1] * 0.64, d[2] * 0.64, 0.045, 6, 4)
    A.ball(0, 0, 0, 0.14, 8, 6)
    A.flush()


def magnet():
    o = pivot("claw_magnet", (0, 0, 0), None)
    A = Acc("magnetBody", "red", o, 0.03)
    A.path([(math.cos(a) * 0.32, math.sin(a) * 0.32, 0) for a in [PI * i / 12 for i in range(13)]], 0.1, 8)
    A.flush()
    A = Acc("magnetTips", "steel", o, 0.02); A.boxc(0.32, -0.12, 0, 0.22, 0.2, 0.22); A.boxc(-0.32, -0.12, 0, 0.22, 0.2, 0.22); A.flush()


def tyre():
    o = pivot("claw_tyre", (0, 0, 0), None)
    A = Acc("tyreBody", "rubber", o, 0.03); A.tor(0.38, 0.17, (0, 0, 0), (PI / 2, 0, 0), 20, 8); A.flush()
    A = Acc("tyreHub", "steel", o, 0.0); A.cylc(0, 0, 0, 0.22, 0.1, 14, rot=(PI / 2, 0, 0)); A.flush()


def hullplate():
    o = pivot("claw_hullplate", (0, 0, 0), None)
    A = Acc("hullBody", "steel", o, 0.03); A.boxc(0, 0, 0, 1.0, 0.7, 0.07); A.flush()
    A = Acc("hullRivets", "dark", o, 0.0)
    for i in range(5):
        for sy in (-1, 1):
            A.ball(-0.4 + i * 0.2, sy * 0.3, 0.04, 0.03, 5, 4)
            A.ball(-0.4 + i * 0.2, sy * 0.3, -0.04, 0.03, 5, 4)
    A.boxc(0.2, 0.05, 0.04, 0.4, 0.3, 0.01, rot=(0, 0, 0.4))
    A.flush()


def chip():
    o = pivot("claw_chip", (0, 0, 0), None)
    A = Acc("chipBody", "chipgold", o, 0.04); A.cylc(0, 0, 0, 0.78, 0.16, 20, rot=(PI / 2, 0, 0)); A.flush()
    A = Acc("chipEdge", "cream", o, 0.0)
    for i in range(10):
        a = 2 * PI * i / 10
        A.boxc(math.cos(a) * 0.78, math.sin(a) * 0.78, 0, 0.26, 0.1, 0.17, rot=(0, 0, a))
    A.flush()
    A = Acc("chipInlay", "plum2", o, 0.0); A.cylc(0, 0, 0, 0.5, 0.18, 20, rot=(PI / 2, 0, 0)); A.flush()
    A = Acc("chipStar", "gold", o, 0.0)
    for i in range(5):
        a = 2 * PI * i / 5 + PI / 2
        A.add(cylinder(0.0, 0.1, 0.4, 4), (math.cos(a) * 0.17, math.sin(a) * 0.17, 0.1), (PI / 2, 0, 0))
        A.add(cylinder(0.0, 0.1, 0.4, 4), (math.cos(a) * 0.17, math.sin(a) * 0.17, -0.1), (-PI / 2, 0, 0))
    A.cylc(0, 0, 0.1, 0.18, 0.02, 10, rot=(PI / 2, 0, 0)); A.cylc(0, 0, -0.1, 0.18, 0.02, 10, rot=(PI / 2, 0, 0))
    A.flush()


def lockbox():
    o = pivot("claw_lockbox", (0, 0, 0), None)
    A = Acc("lockBody", "steel", o, 0.03); A.boxc(0, 0, 0, 0.9, 0.55, 0.6); A.flush()
    A = Acc("lockStraps", "gold", o, 0.0)
    for sx in (-1, 1):
        A.boxc(sx * 0.3, 0, 0, 0.1, 0.57, 0.62)
    A.boxc(0, 0.3, 0, 0.92, 0.06, 0.62)
    A.flush()
    A = Acc("lockPad", "brass", o, 0.02)
    A.boxc(0, 0, 0.32, 0.22, 0.26, 0.06); A.tor(0.08, 0.025, (0, 0.14, 0.32), (0, PI / 2, 0), 12, 4)
    A.boxc(0, 0, -0.32, 0.22, 0.26, 0.06)
    A.flush()
    A = Acc("lockGlow", "glowred", o, 0.0); A.boxc(0, -0.02, 0.36, 0.04, 0.08, 0.02); A.boxc(0, -0.02, -0.36, 0.04, 0.08, 0.02); A.flush()


def gem():
    o = pivot("claw_gem", (0, 0, 0), None)
    A = Acc("gemBody", "gem", o, 0.0); A.add(sphere(1.0, 6, 4), (0, 0, 0), (0, 0.4, 0), (0.28, 0.4, 0.28)); A.flush()


def link():
    o = pivot("claw_link", (0, 0, 0), None)
    A = Acc("linkRing", "steel", o, 0.0)
    A.tor(0.085, 0.028, (0, 0, 0), (0, 0, 0), 12, 5)
    A.geos[-1] = xf(A.geos[-1], (0, 0, 0), (0, 0, 0), (1.5, 1, 1))
    A.flush()


for f in (claw, crate, canister, gear, girder, mine, magnet, tyre, hullplate, chip, lockbox, gem, link):
    f()
flush_all()

_dg = bpy.context.evaluated_depsgraph_get()
_tris = {}
for _o in C.objects:
    if _o.type != "MESH":
        continue
    _p = _o
    while _p.parent:
        _p = _p.parent
    _tris[_p.name] = _tris.get(_p.name, 0) + sum(len(q.vertices) - 2 for q in _o.evaluated_get(_dg).to_mesh().polygons)
print("built", len(C.objects), "objects; triangles per root:", _tris)
export(OUT, list(C.objects))
