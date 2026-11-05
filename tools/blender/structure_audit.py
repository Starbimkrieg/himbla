"""Structure audit: does a built model hold together? (the blender skill, "Model structure").

Run it on the meshes a builder made, after it has built them (any builder, any place). Each mesh's loose parts are the
primitives the builder merged (a post, a beam, a panel, a sign board), and each part is checked against all the others:

  floating      the part touches nothing: no part within TOUCH of it (either's vertices near the other's faces, or faces
                crossing), not on the ground, not held inside another part (a liquid in its jar) (a sign hanging in the air,
                a lamp with no bracket, a panel above its posts);
  loose end     a bar (a part at least BAR times longer than it is thick: posts, struts, rails, chains, pipes, cables) has an end
                that nothing touches (within END of it along the bar), isn't set into anything and isn't on the ground (a post
                stopping short of the roof it should hold; a fence post's tip above its top rail is fine);
  pass-through  a bar goes through a part that is solid all round it there (a slab, a pane, a board, not a rail or a rack)
                and pokes a short stub out the far side (a post through the roof it holds up, a hanger through a beam, a
                pipe through the wall it should end in). Bars crossing bars, a pole running on through shelves it carries,
                and inlays in the floor are left out;
  cuts through  a slab (a part far thinner than it is wide: a roof, a panel, a board, a pane) reaches well out both sides
                of another slab, across that one's middle, not at its edge (a panel laid on a roof tipped the wrong way, half under
                it; a sign board through the roof it hangs from).

It prints a report grouped by mesh (the builder's group and slot), with where each finding is in three.js axes, and returns
the counts. Each finding is a question, not a verdict: a pass-through can be meant (a pole through a sleeve) and something
can float on purpose (a hologram, a levitated sphere): build those in a group whose name ends in `_float` and they are
left out. Read each finding and fix what is wrong. Some parts are
merged with the part they touch (the mesh's coincident vertices are welded), so they count as one part.

    from structure_audit import audit_structure
    audit_structure([o for o in bpy.data.objects if o.type == "MESH"], skip_slots={"holo", "glow"})

build_zbornak_lab.py runs it with STRUCT_AUDIT=1. Slow on a whole place (a minute or so): it's a check, not part of a build.
"""
import math

import bpy  # (first: bmesh and mathutils come with it)
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

TOUCH = 0.03      # m: nearer than this counts as touching
GROUND = 0.03     # m: a part this near z = 0 stands on the ground
BAR = 5.0         # a part this many times longer than it is thick is a bar
BAR_MIN = 0.3     # m: ...and at least this long
SAMPLES = 48      # vertices of each part tested for contact first
END = 0.25        # m: a bar's end is held if something touches it this near the end (or a fifth of its length, if more)


def _parts(objs):
    """every mesh object's loose parts in world space (Blender axes): (object, [Vector], [(i, j, k)])"""
    out = []
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.verts.ensure_lookup_table()
        root = list(range(len(bm.verts)))

        def find(i):
            while root[i] != i:
                root[i] = root[root[i]]
                i = root[i]
            return i
        for f in bm.faces:
            a = find(f.verts[0].index)
            for v in f.verts[1:]:
                b = find(v.index)
                if b != a:
                    root[b] = a
        M = o.matrix_world
        W = [M @ v.co for v in bm.verts]
        islands = {}
        for f in bm.faces:
            islands.setdefault(find(f.verts[0].index), []).append(f)
        for faces in islands.values():
            idx, verts, tris = {}, [], []
            for f in faces:
                ids = []
                for v in f.verts:
                    if v.index not in idx:
                        idx[v.index] = len(verts)
                        verts.append(W[v.index])
                    ids.append(idx[v.index])
                for k in range(1, len(ids) - 1):
                    tris.append((ids[0], ids[k], ids[k + 1]))
            out.append((o, verts, tris))
        bm.free()
    return out


def _axis(verts):
    """the part's centre, its three axes (longest first) and its spans along them (the covariance's eigenvectors)"""
    P = np.array([tuple(v) for v in verts])
    c = P.mean(axis=0)
    w, V = np.linalg.eigh(np.cov((P - c).T) if len(P) > 1 else np.eye(3))
    axes = [Vector(tuple(V[:, i])).normalized() for i in (2, 1, 0)]
    spans = [float(np.ptp((P - c) @ np.array(tuple(a)))) for a in axes]
    return Vector(tuple(c)), axes, spans


def enclosed_by(tree, p):
    """p is inside the closed mesh in tree (an odd number of its faces straight up from p)"""
    n, q, d = 0, p.copy(), Vector((0, 0, 1))
    while True:
        co, _, _, dd = tree.ray_cast(q, d)
        if co is None:
            return n % 2 == 1
        n += 1
        q = co + d * 1e-4


def _three(p):
    return f"({p.x:.1f}, {p.z:.1f}, {-p.y:.1f})"


def audit_structure(objs, skip_slots=(), skip=None, label="", report=12):
    """objs: the mesh objects to check. Each model (the objects under one top-level root: a file can hold several models
    built at the same origin) is checked on its own, each part against the rest of its model. skip_slots: material names
    whose parts are not reported (they still count as something to touch); skip(obj): objects not reported. Returns the
    counts, summed over the models."""
    objs = [o for o in objs if o.type == "MESH" and len(o.data.polygons)]
    top = lambda o: o if o.parent is None else top(o.parent)
    models = {}
    for o in objs:
        models.setdefault(top(o).name, []).append(o)
    total = {}
    found_all = {}
    for name, group in models.items():
        counts, found = _audit_model(group, skip_slots, skip)
        for k, v in counts.items():
            total[k] = total.get(k, 0) + v
        for k, d in found.items():
            found_all.setdefault(k, {}).update(d)
    nparts = total.pop("parts", 0)
    print(f"structure audit{' ' + label if label else ''}: {len(models)} model(s), {nparts} parts; " + ", ".join(f"{n} {k}" for k, n in total.items()))
    for kind, d in found_all.items():
        for name, where in sorted(d.items(), key=lambda kv: -len(kv[1]))[:report]:
            print(f"  {kind:12s} {len(where):4d}  {name:34s} {'  '.join(where[:3])}")
    return total


def _audit_model(objs, skip_slots, skip):
    """one model's findings: (counts with "parts", {kind: {object name: [where]}})"""
    bpy.context.view_layer.update()
    parts = _parts(objs)
    V, T, owner = [], [], []
    for pi, (o, vs, ts) in enumerate(parts):
        base = len(V)
        V.extend(vs)
        for t in ts:
            T.append((t[0] + base, t[1] + base, t[2] + base))
            owner.append(pi)
    tree = BVHTree.FromPolygons(V, T, all_triangles=True)
    vown = []
    for pi, (o, vs, ts) in enumerate(parts):
        vown.extend([pi] * len(vs))
    kd = KDTree(len(V))
    for i, v in enumerate(V):
        kd.insert(v, i)
    kd.balance()
    axes = [(_axis(vs) if len(vs) >= 4 else None) for (o, vs, ts) in parts]
    isbar = [a is not None and a[2][0] >= BAR_MIN and a[2][0] >= BAR * max(a[2][1], 1e-3) for a in axes]

    def near(p, pi, r):
        return any(owner[idx] != pi for (_, _, idx, _) in tree.find_nearest_range(p, r))

    def crossings(p, d, maxd=1e9):
        """[(part, distance, entering)] along the ray from p"""
        out, q, gone = [], p.copy(), 0.0
        while gone < maxd:
            co, nrm, idx, dd = tree.ray_cast(q, d, maxd - gone)
            if co is None:
                break
            gone += dd
            out.append((owner[idx], gone, nrm.dot(d) < 0))
            q = co + d * 1e-4
            gone += 1e-4
        return out

    def set_in(p, pi, r=None):
        """inside another (closed) part: an odd number of its faces crossed straight up from p"""
        n = {}
        for q, _, _ in crossings(p, Vector((0, 0, 1))):
            if q != pi:
                n[q] = n.get(q, 0) + 1
        return any(k % 2 for k in n.values())

    def enclosed(p, pi, r=0.8):
        """something else closes round p within r in all six directions (a liquid in its jar, a part sunk in another)"""
        for d in (Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0)), Vector((0, 0, 1)), Vector((0, 0, -1))):
            if not any(q != pi for q, _, _ in crossings(p, d, r)):
                return False
        return True

    def extent(m, d, q, maxd):
        """how far part q goes from m (inside it) along d"""
        for qq, dist, entering in crossings(m, d, maxd):
            if qq == q and not entering:
                return dist
        return maxd

    def held(pi, vs, ts):
        """does anything touch part pi, or hold it?"""
        step = max(1, len(vs) // SAMPLES)
        if any(v.z <= GROUND or near(v, pi, TOUCH) for v in vs[::step]):
            return True
        own = BVHTree.FromPolygons(vs, ts, all_triangles=True)
        c = sum(vs, Vector()) / len(vs)
        rad = max((v - c).length for v in vs)
        for co, i, d in kd.find_range(c, rad + TOUCH):                     # others' vertices on this part's faces
            if vown[i] != pi and own.find_nearest(co, TOUCH)[0] is not None:
                return True
        if any(owner[j] != pi for _, j in own.overlap(tree)):              # faces crossing
            return True
        return enclosed(c, pi)                                              # held inside (a liquid in its jar)

    found = {"floating": {}, "loose end": {}, "pass-through": {}, "cuts through": {}}
    # slabs: the thinnest of a part's three spans a quarter of the middle one or less; their middle plane and half thickness
    slabs = {}
    for qi in range(len(parts)):
        if axes[qi] is None or isbar[qi]:
            continue
        c, (a1, a2, nrm), (e1, e2, e3) = axes[qi]
        if e3 <= 0.25 * e2 and e3 < 0.6:
            slabs[qi] = (c, nrm, e3 / 2, a1, a2)

    def note(kind, o, p, extra=""):
        found[kind].setdefault(o.name, []).append(_three(p) + extra)

    slot = lambda o: o.active_material.name if o.active_material else ""
    for pi, (o, vs, ts) in enumerate(parts):
        if slot(o) in skip_slots or (skip and skip(o)) or "_float" in o.name:
            continue
        if not held(pi, vs, ts):
            note("floating", o, sum(vs, Vector()) / len(vs))
            continue
        if not isbar[pi]:
            continue
        c, (a, _, _), (L, thick, _) = axes[pi]
        s_ = [(v - c).dot(a) for v in vs]
        lo, hi = min(s_), max(s_)
        win = max(END, 0.2 * L)
        for e, inward in ((c + a * lo, a), (c + a * hi, -a)):
            if e.z <= thick / 2 + GROUND or set_in(e, pi):                 # on the ground, or set into something
                continue
            k = max(2, int(win / 0.05))
            if not any(near(e + inward * (win * i / k), pi, thick / 2 + 0.04) for i in range(k + 1)):
                note("loose end", o, e)
        # along the bar from one end to the other: a part entered and left again before the end, solid all round the bar
        # there (a slab, a pane, a board: it reaches 3 bar-widths out every way across the bar), not a rail or a rack
        u = a.orthogonal().normalized()
        w = a.cross(u)
        start, entered = c + a * (lo + 0.1), {}
        for q, dist, entering in crossings(start, a, L - 0.2):
            if q == pi or isbar[q]:
                continue
            if entering:
                entered[q] = dist
            elif q in entered:
                m = start + a * ((entered.pop(q) + dist) / 2)
                reach = 3 * max(thick, 0.05)
                stub = (L - 0.1) - dist                                     # how far the bar runs on past it
                if m.z > 0.12 and stub < max(0.6, 4 * thick) and all(extent(m, dv, q, reach) >= reach for dv in (u, -u, w, -w)):
                    note("pass-through", o, m, f" through {parts[q][0].name}, {stub:.2f} m out")
    # cuts through: parts whose faces cross a slab's, reaching out both sides of it, across its middle
    for pi, (o, vs, ts) in enumerate(parts):
        if slot(o) in skip_slots or (skip and skip(o)) or "_float" in o.name or pi not in slabs:
            continue                                                        # (slab through slab; bars: pass-through)
        if abs(slabs[pi][1].z) > 0.9 and slabs[pi][0].z < 0.15:
            continue                                                        # (a floor: what it meets below is out of sight)
        own = BVHTree.FromPolygons(vs, ts, all_triangles=True)
        hit = {owner[j] for _, j in own.overlap(tree)} - {pi}
        for qi in hit:
            if qi not in slabs:
                continue
            c, nrm, half, a1, a2 = slabs[qi]
            d = [(v - c).dot(nrm) for v in vs]
            if max(d) < half + 0.05 or min(d) > -half - 0.05:
                continue
            # (a floor, a walk or an inlay: what goes into it from above is out of sight below)
            if abs(nrm.z) > 0.9 and c.z < 0.15:
                continue
            # where it crosses: its vertices' middle, on the slab's plane, with the part itself there (not a ring's hole);
            # the slab must reach 0.15 m past it all round
            m = sum(vs, Vector()) / len(vs)
            m = m - nrm * (m - c).dot(nrm)
            near_m = own.find_nearest(m, 0.3)
            if near_m[0] is None and not enclosed_by(own, m):
                continue
            qv = parts[qi][1]
            if all(max((v - m).dot(dv) for v in qv) > 0.15 for dv in (a1, -a1, a2, -a2)):
                note("cuts through", o, m, f" {parts[qi][0].name}")
    counts = {"parts": len(parts)}
    counts.update({k: sum(len(v) for v in d.values()) for k, d in found.items()})
    return counts, found


if __name__ == "__main__":
    # python3 tools/blender/structure_audit.py tools/blender/build_<name>.py [slot,slot,...]: builds the model with nothing
    # exported (MOONRUNNER_EXPORT=0, and glTF export stubbed out for builders that don't read it), then audits every mesh,
    # leaving the listed slots (glows, holograms) out of the report
    import os
    import runpy
    import sys
    path = sys.argv[1]
    skip_ = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else set()
    os.environ["MOONRUNNER_EXPORT"] = "0"
    os.environ.setdefault("MOONRUNNER_REPO", os.getcwd())
    real = bpy.ops.export_scene.gltf

    class _NoExport:
        def __call__(self, *a, **k):
            return {"FINISHED"}

        def __getattr__(self, n):
            return getattr(real, n)
    bpy.ops.export_scene = type("NoExportScene", (), {"gltf": _NoExport()})()
    sys.argv = [path]
    runpy.run_path(path, run_name="__main__")
    audit_structure([o for o in bpy.data.objects if o.type == "MESH"], skip_slots=skip_, label=f"({os.path.basename(path)})")
