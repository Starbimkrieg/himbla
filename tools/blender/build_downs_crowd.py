# Chimera Downs' spectators for Blender (4.2+ / 5.x), exported to src/assets/downs-crowd.glb: the parts of a seated racegoer, which race.js draws as instanced meshes in the stands (each part
# in one white `body`, `skin`, `cap`, `hair` or `sleeve` slot that the game tints per spectator).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_crowd.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_crowd.py
#
# Authored in three.js axes, +z the way the spectator faces. The body's origin is the middle of the torso (the game puts it 0.5 m above the seat), so the thighs lie at -0.38 m, the knees
# 0.66 m forward, the feet at -0.8 m under them; the head's origin is its centre (0.66 m above the torso's).
#   dn_fan_body    jacket torso with shoulders, thighs, shins and shoes, hands in the lap: the `body` slot (jacket and trousers share one tint)
#   dn_fan_head    a head 0.5 m high with a nose and ears: the `skin` slot
#   dn_fan_cap     a flat cap with a brim toward +z: the `cap` slot
#   dn_fan_hair    a mop of hair for the bare-headed: the `hair` slot
#   dn_fan_arms    both arms raised and waving, shoulders at the body's: the `sleeve` slot (the body's tint)
DOWNS_OUT = "downs-crowd.glb"
DOWNS_COLL = "MoonDownsCrowd"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# =====================================================================================================
# dn_fan_body
# =====================================================================================================
# (about 1000 of these are drawn at once, twice with their outlines, so every part is a handful of boxes)
root = pivot("dn_fan_body", (0, 0, 0))
P = parts(root, "dn_fan_body", {"mint": 0.03})
B = P["mint"]
B.rbc(0.0, 0.05, 0.0, 0.62, 0.78, 0.4, 0.45, nu=6, nv=4)                                  # the torso, rounded
B.boxc(0.0, 0.36, 0.0, 0.7, 0.18, 0.34)                                                   # the shoulders
for sx in (-1, 1):
    B.boxc(sx * 0.37, 0.05, 0.1, 0.13, 0.55, 0.16, rot=(-0.35, 0, 0))                     # arms, bent to the lap
    B.boxc(sx * 0.17, -0.38, 0.33, 0.2, 0.2, 0.72)                                        # thighs, forward
    B.boxc(sx * 0.17, -0.6, 0.66, 0.18, 0.4, 0.18)                                        # shins, down

# =====================================================================================================
# dn_fan_head
# =====================================================================================================
root = pivot("dn_fan_head", (0, 0, 0))
P = parts(root, "dn_fan_head", {"mint": 0.03})
H = P["mint"]
H.add(sphere(0.25, 8, 5), s=(1.0, 1.05, 0.95))
H.boxc(0, -0.02, 0.25, 0.09, 0.1, 0.1)                                                    # a nose
for sx in (-1, 1):
    H.boxc(sx * 0.25, 0.0, 0.0, 0.05, 0.12, 0.08)                                         # ears

# =====================================================================================================
# dn_fan_cap
# =====================================================================================================
root = pivot("dn_fan_cap", (0, 0, 0))
P = parts(root, "dn_fan_cap", {"mint": 0.0})
C_ = P["mint"]
C_.cylc(0, 0.2, -0.01, 0.27, 0.16, 8, rt=0.2)                                             # the crown
C_.box(-0.18, 0.18, 0.1, 0.15, 0.2, 0.46)                                                 # the brim

# =====================================================================================================
# dn_fan_hair
# =====================================================================================================
root = pivot("dn_fan_hair", (0, 0, 0))
P = parts(root, "dn_fan_hair", {"mint": 0.0})
P["mint"].add(sphere(0.27, 8, 3, theta_len=PI * 0.55), t=(0, 0.02, -0.02))
P["mint"].boxc(0, 0.08, -0.26, 0.2, 0.2, 0.1)                                             # a bun at the back

# =====================================================================================================
# dn_fan_arms
# =====================================================================================================
root = pivot("dn_fan_arms", (0, 0, 0))
P = parts(root, "dn_fan_arms", {"mint": 0.0})
for sx in (-1, 1):
    P["mint"].boxc(sx * 0.45, 0.58, 0.02, 0.13, 0.5, 0.15, rot=(0, 0, -sx * 0.45))        # raised and out
    P["mint"].boxc(sx * 0.56, 0.84, 0.02, 0.15, 0.15, 0.15)                               # hands

finish_and_export()
