# Idle animations for the Moon-runner, authored in Blender (4.2+ / 5.x) and exported for the game.
#
# Builds the runner with build_runner.py (runner.glb untouched), keys the idles as actions on its pivots (runner = whole
# body, torso, head, armL, armR, foreL, foreR (elbows), legL, legR) and writes src/assets/idles.json, which src/idles.js
# plays while the courier stands still. Headless or from Blender's Scripting tab:
#   python3 tools/blender/build_idles.py            (MOONRUNNER_REPO=<checkout> if not run from one)
#   MOONRUNNER_IDLES_BLEND=idles.blend python3 ...  also saves the keyed scene for Blender
#
# Poses use three.js axes (x right, y up, +z forward), like the game's rotations: rx pitches (+ swings a hanging limb
# back / leans the torso forward), ry turns, rz rolls (+ lifts the right arm out, - the left). pos: small offset from rest.
# Pose functions take u in [0,1) and return {pivot: {"rot": (rx,ry,rz), "pos": (x,y,z)}}.
#
# idles.json holds 10 poses a second (every 3rd frame at 30 fps; frame counts must divide by 3), slerped by the game;
# pivots that never leave rest are left out. The FIRST animation (the breath) is the default; the rest are occasional.

import os, sys, json, math

# for build_runner.py: this checkout, and no glb export
if "MOONRUNNER_REPO" not in os.environ:
    _here = globals().get("__file__", "")
    if _here:
        os.environ["MOONRUNNER_REPO"] = os.path.abspath(os.path.join(os.path.dirname(_here), "..", ".."))
os.environ["MOONRUNNER_EXPORT"] = "0"
_repo = os.environ.get("MOONRUNNER_REPO", "")
_runner = os.path.join(_repo, "tools", "blender", "build_runner.py")
exec(open(_runner, encoding="utf-8").read(), globals())

from mathutils import Quaternion

TAU = 2 * math.pi
def sm(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)
def ramp(u, a, b):
    """0 before a, eases to 1 by b."""
    return sm((u - a) / (b - a))
def pulse(u, a, b, c, d):
    """eases up a->b, holds, eases down c->d."""
    return ramp(u, a, b) * (1 - ramp(u, c, d))

def breathe(u):
    s = math.sin(TAU * u)
    c = (1 - math.cos(TAU * u)) / 2
    return {
        "runner": {"pos": (0, 0.006 * c, 0)},
        "torso": {"rot": (0.02 * s, 0.0, 0.012 * math.sin(TAU * u * 0.5)), "pos": (0, 0.01 * c, 0)},
        "head": {"rot": (-0.014 * s + 0.01 * math.sin(TAU * u * 0.5 + 1), 0.05 * math.sin(TAU * u * 0.5 + 2), 0.0)},
        "armL": {"rot": (0.03 * s, 0, -(0.05 + 0.025 * c))},
        "armR": {"rot": (0.03 * s, 0, 0.05 + 0.025 * c)},
        "foreL": {"rot": (-0.14 - 0.03 * c - 0.02 * s, 0, 0)}, "foreR": {"rot": (-0.14 - 0.03 * c - 0.02 * s, 0, 0)},
        "legL": {"rot": (0.0, 0, 0.0)}, "legR": {"rot": (0.0, 0, 0.0)},
    }

def look_around(u):
    # left, hold, back, right, hold, back, a quick glance up
    yaw = 0.85 * pulse(u, 0.08, 0.22, 0.34, 0.46) - 0.85 * pulse(u, 0.5, 0.64, 0.74, 0.84)
    up = 0.3 * pulse(u, 0.88, 0.93, 0.95, 0.99)
    return {
        "runner": {"pos": (0, 0.0, 0)},
        "torso": {"rot": (0.0, yaw * 0.3, 0.0)},
        "head": {"rot": (-up + 0.05 * abs(yaw), yaw * 0.85, -0.06 * yaw)},
        "armL": {"rot": (0.04 * yaw, 0, -0.06)},
        "armR": {"rot": (-0.04 * yaw, 0, 0.06)},
        "foreL": {"rot": (-0.16 - 0.1 * max(0.0, yaw), 0, 0)}, "foreR": {"rot": (-0.16 - 0.1 * max(0.0, -yaw), 0, 0)},
        "legL": {"rot": (0, 0.0, 0)}, "legR": {"rot": (0, 0.0, 0)},
    }

def weight_shift(u):
    s = math.sin(TAU * u)
    right = max(0.0, s)    # weight on the right foot, the left eases up
    left = max(0.0, -s)
    return {
        "runner": {"pos": (0.03 * s, -0.012 * abs(s), 0)},
        "torso": {"rot": (0.0, -0.1 * s, -0.06 * s)},
        "head": {"rot": (0.0, 0.1 * s, 0.05 * s)},
        "armL": {"rot": (0.1 * s, 0, -0.08 - 0.07 * s)},
        "armR": {"rot": (-0.1 * s, 0, 0.08 - 0.07 * s)},
        "foreL": {"rot": (-0.2 - 0.18 * max(0.0, -s), 0, 0)}, "foreR": {"rot": (-0.2 - 0.18 * max(0.0, s), 0, 0)},
        "legL": {"rot": (-0.22 * left, 0, 0.02 * s)},
        "legR": {"rot": (-0.22 * right, 0, 0.02 * s)},
    }

def stretch(u):
    up = pulse(u, 0.08, 0.3, 0.62, 0.8)                       # arms up
    arch = pulse(u, 0.14, 0.34, 0.6, 0.78)                    # lean back
    quiver = 0.02 * math.sin(TAU * u * 5) * pulse(u, 0.3, 0.34, 0.58, 0.62)
    shake = math.sin(TAU * u * 3) * pulse(u, 0.82, 0.86, 0.94, 0.99) * 0.1
    return {
        "runner": {"pos": (0, 0.03 * arch, 0)},
        "torso": {"rot": (-0.26 * arch, 0.0, 0.0), "pos": (0, 0.0, -0.02 * arch)},
        "head": {"rot": (-0.35 * arch, 0.0, 0.0)},
        "armL": {"rot": (-2.7 * up + shake, 0, -0.1 - 0.35 * up + quiver)},
        "armR": {"rot": (-2.7 * up - shake, 0, 0.1 + 0.35 * up - quiver)},
        "foreL": {"rot": (-0.15 - 0.35 * up - 4 * shake, 0, 0)}, "foreR": {"rot": (-0.15 - 0.35 * up + 4 * shake, 0, 0)},
        "legL": {"rot": (0.06 * arch, 0, 0)}, "legR": {"rot": (-0.04 * arch, 0, 0)},
    }

def check_wrist(u):
    raise_ = pulse(u, 0.08, 0.26, 0.74, 0.9)                  # right arm up before the chest
    tap = 0.08 * math.sin(TAU * u * 4) * pulse(u, 0.3, 0.34, 0.66, 0.7)
    look = pulse(u, 0.14, 0.3, 0.7, 0.86)                     # head down to the wrist
    return {
        "runner": {"pos": (0, 0.0, 0)},
        "torso": {"rot": (0.05 * look, 0.12 * look, 0.0)},
        "head": {"rot": (0.32 * look, 0.0, 0.0)},
        "armR": {"rot": (-1.25 * raise_ + tap, 0, (0.06 - 0.5 * raise_))},
        "armL": {"rot": (-0.5 * raise_, 0, -(0.06 + 0.1 * raise_))},
        "foreR": {"rot": (-0.15 - 1.35 * raise_ - 0.5 * tap, 0, 0)},   # forearm folds, wrist before the chest
        "foreL": {"rot": (-0.15 - 0.9 * raise_, 0, 0)},                # left hand comes across to it
        "legL": {"rot": (0, 0, 0)}, "legR": {"rot": (0, 0, 0)},
    }

def lean_back(u):
    # settles onto the right hip, a hand at the chin, the other at the belt, head tipped; then upright again
    k = pulse(u, 0.1, 0.3, 0.72, 0.9)
    breathe = 0.012 * math.sin(TAU * u * 3) * k
    return {
        "runner": {"pos": (0.025 * k, -0.02 * k, 0)},
        "torso": {"rot": (-0.1 * k + breathe, 0.0, 0.07 * k), "pos": (0, 0, -0.02 * k)},
        "head": {"rot": (0.1 * k, 0.12 * k, -0.1 * k)},
        "armR": {"rot": (-0.85 * k, 0, 0.12 * k)},
        "foreR": {"rot": (-0.12 - 1.45 * k, 0, 0)},                      # hand to the chin
        "armL": {"rot": (-0.3 * k, 0, -(0.08 + 0.12 * k))},
        "foreL": {"rot": (-0.14 - 1.2 * k, 0, 0)},                      # hand at the belt
        "legL": {"rot": (0.12 * k, 0, -0.04 * k)},
        "legR": {"rot": (-0.14 * k, 0, 0.0)},
    }

def shake_out(u):
    # forearms up, hands flicked loose, relaxed
    k = pulse(u, 0.08, 0.2, 0.78, 0.92)
    f = math.sin(TAU * u * 9) * pulse(u, 0.2, 0.26, 0.7, 0.78)
    return {
        "runner": {"pos": (0, 0.0, 0)},
        "torso": {"rot": (0.04 * k, 0.0, 0.0)},
        "head": {"rot": (-0.03 * k, 0.0, 0.0)},
        "armL": {"rot": (-0.5 * k + 0.05 * f, 0, -(0.1 + 0.05 * k))},
        "armR": {"rot": (-0.5 * k - 0.05 * f, 0, 0.1 + 0.05 * k)},
        "foreL": {"rot": (-0.15 - 1.1 * k + 0.45 * f, 0, 0)},
        "foreR": {"rot": (-0.15 - 1.1 * k - 0.45 * f, 0, 0)},
        "legL": {"rot": (0, 0, 0)}, "legR": {"rot": (0, 0, 0)},
    }

# (name, pose function, frames in the loop at 30 fps)
ANIMS = [
    ("idle_breathe", breathe, 108),            # default: slow breath
    ("idle_look_around", look_around, 150),    # left, right, quick glance up
    ("idle_weight_shift", weight_shift, 120),  # rocks skate to skate, arms counter-swinging
    ("idle_stretch", stretch, 135),            # arms overhead, lean back, shake-out
    ("idle_check_wrist", check_wrist, 120),    # taps at the wrist
    ("idle_lean_back", lean_back, 150),        # onto one hip, then straightens
    ("idle_shake_out", shake_out, 120),        # hands flicked loose
]

FPS = 30
STEP = 3                                       # keys every STEP frames, as the game's file stores them
NAMES = ["runner", "torso", "head", "armL", "armR", "foreL", "foreR", "legL", "legR"]
GAME_NAME = {"runner": "body"}                 # whole-figure pivot is `body` in models.js
OBJ = {n: bpy.data.objects[n] for n in NAMES}
REST = {n: OBJ[n].location.copy() for n in NAMES}
for o in OBJ.values():
    o.rotation_mode = "QUATERNION"
    o.animation_data_create()

def three_quat(rx, ry, rz):
    # three.js 'XYZ' order: R = Rx * Ry * Rz
    qx = Quaternion((1, 0, 0), rx); qy = Quaternion((0, 1, 0), ry); qz = Quaternion((0, 0, 1), rz)
    return qx @ qy @ qz          # (w, x, y, z) in three axes

def to_blender_q(q):             # three (x,y,z) -> blender (x, -z, y)
    return Quaternion((q.w, q.x, -q.z, q.y))

def from_blender_q(q):           # blender (x,y,z) -> three (x, z, -y)
    return Quaternion((q.w, q.x, q.z, -q.y))

scene = bpy.context.scene
scene.render.fps = FPS
out_anims = []
for name, fn, nframes in ANIMS:
    assert nframes % STEP == 0, f"{name}: {nframes} frames don't divide by {STEP}"
    scene.frame_start, scene.frame_end = 1, nframes
    for n, o in OBJ.items():
        act = bpy.data.actions.new(f"{name}_{n}")
        act.use_fake_user = True
        o.animation_data.action = act
        o.rotation_quaternion = (1, 0, 0, 0)
        o.location = REST[n]
    for f in list(range(1, nframes + 1, STEP)) + [nframes + 1]:
        pose = fn(((f - 1) % nframes) / nframes)
        for n, o in OBJ.items():
            p = pose.get(n, {})
            rx, ry, rz = p.get("rot", (0, 0, 0))
            dx, dy, dz = p.get("pos", (0, 0, 0))
            o.rotation_quaternion = to_blender_q(three_quat(rx, ry, rz))
            o.location = (REST[n].x + dx, REST[n].y - dz, REST[n].z + dy)
            o.keyframe_insert("rotation_quaternion", frame=f)
            o.keyframe_insert("location", frame=f)
    # read keys back from the evaluated scene, so the game plays what Blender shows
    qs = {n: [] for n in NAMES}
    ps = {n: [] for n in NAMES}
    for f in range(1, nframes + 1, STEP):
        scene.frame_set(f)
        for n, o in OBJ.items():
            q = from_blender_q(o.rotation_quaternion.normalized())
            if qs[n] and sum(a * b for a, b in zip(qs[n][-1], (q.x, q.y, q.z, q.w))) < 0:
                q.negate()                                   # keep neighbours in one hemisphere for the slerp
            d = o.location - REST[n]
            qs[n].append((q.x, q.y, q.z, q.w))
            ps[n].append((d.x, d.z, -d.y))
    rec = {"name": name, "n": nframes // STEP, "q": {}, "p": {}}
    for n in NAMES:
        if any(abs(v[0]) > 5e-4 or abs(v[1]) > 5e-4 or abs(v[2]) > 5e-4 for v in qs[n]):
            rec["q"][GAME_NAME.get(n, n)] = [round(x, 4) for v in qs[n] for x in v]
        if any(abs(c) > 5e-5 for v in ps[n] for c in v):
            rec["p"][GAME_NAME.get(n, n)] = [round(x, 4) for v in ps[n] for x in v]
    out_anims.append(rec)
    print("keyed", name, nframes, "frames ->", rec["n"], "poses")

OUT_JSON = os.path.join(_repo, "src", "assets", "idles.json")
with open(OUT_JSON, "w", encoding="utf-8") as fh:
    json.dump({"fps": FPS // STEP, "anims": out_anims}, fh, separators=(",", ":"))
print("wrote", OUT_JSON, os.path.getsize(OUT_JSON), "bytes")

blend = os.environ.get("MOONRUNNER_IDLES_BLEND")
if blend:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend))
    print("saved", blend)
