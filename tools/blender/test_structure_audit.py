"""structure_audit.py checked on a scene of known faults and known good joints (python3 tools/blender/test_structure_audit.py):
it should report one of each finding (the sign in the air, the short post, the post through roof A, the panel tipped
through roof B, both ways round) and nothing on the table or the panel laid on its roof."""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import cuboid, beam, cylinder, xf, mesh, tb
from structure_audit import audit_structure
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
C = bpy.context.scene.collection.objects
ROOT = bpy.data.objects.new("selftest", None)                              # (one model: the audit checks each root's own)
C.link(ROOT)
def add(name, geo):
    import bmesh
    v, f = geo[:2]
    me = bpy.data.meshes.new(name); me.from_pydata([tb(p) for p in v], [], [tuple(reversed(x)) for x in f]); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); C.link(o); o.parent = ROOT; return o
# good: a table (four legs, a top on them)
for x in (-1, 1):
    for z in (-1, 1):
        add("good_leg", beam((x, 0, z), (x, 1.0, z), 0.05))
add("good_top", xf(cuboid(2.4, 0.06, 2.4)[:2], (0, 1.03, 0)))
# bad: a sign floating; a post short of its roof; a post through a roof; a panel tipped through a roof
add("bad_sign_in_air", xf(cuboid(1, 0.5, 0.05)[:2], (5, 2.0, 0)))
add("roofA", xf(cuboid(3, 0.12, 3)[:2], (10, 3.0, 0)))
add("roofA_post_ok", beam((9, 0, -1), (9, 2.94, -1), 0.08))
add("bad_short_post", beam((11, 0, 1), (11, 2.5, 1), 0.08))
add("bad_through_post", beam((11, 0, -1), (11, 3.4, -1), 0.08))
add("roofB", xf(cuboid(4, 0.2, 4)[:2], (20, 3.0, 0), (0.3, 0, 0)))
add("roofB_posts", beam((20, 0, 0), (20, 2.9, 0), 0.1))
add("bad_panel_wrong_tilt", xf(cuboid(1.5, 0.05, 1.5)[:2], (20, 3.2, 0), (-0.3, 0, 0)))
add("good_panel_on_roof", xf(cuboid(1.0, 0.05, 1.0)[:2], (21.0, 3.13, 0), (0.3, 0, 0)))
counts = audit_structure([o for o in bpy.data.objects if o.type == "MESH"], label="(self-test)")
want = {"floating": 1, "loose end": 1, "pass-through": 1, "cuts through": 2}
assert counts == want, f"expected {want}, got {counts}"
print("ok")
