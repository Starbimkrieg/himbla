"""Style audit: does a built model follow the house style? (.claude/skills/blender/style.md; the numbers in style.py)

    python3 tools/blender/style_audit.py tools/blender/build_<name>.py

builds the model with nothing exported (as structure_audit.py does), then reports per mesh:

  ink too heavy   the outline is thicker than half the part's second-longest side: the line swallows the part
  ink off class   the ink is well outside its size class (style.py INK: a 5 m hull at 0.01, a 0.3 m handle at 0.06);
                  not for a mesh of many loose pieces (an accumulator's merge: its box says nothing of any one piece)
  no ink          a big, thick part with no outline (flush stripes and decals are fine: they're flat)
  black           a slot darker than the deepest plum: pure black is the ink's
  no weighted     a smooth-shaded part the export left without weighted normals (an export of its own that skips
                  kit.weighted_normals)
  no toon attrs   a part without the toon attributes (an export that skips kit.toon_attrs)

and per model (export root): its triangles against the largest budget (style.py BUDGET), and which glow slots get the
game's halo (style.py HALO, checked against src/toon.js HALO_SLOT). Each finding is a question, not a verdict.
"""
import os
import re
import runpy
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import style  # noqa: E402


def glow_slots(repo):
    """every slot name a factory in src/models.js draws as glow (its *_GLOW maps), and the halo pattern from toon.js"""
    src = open(os.path.join(repo, "src", "models.js"), encoding="utf-8").read()
    names = set()
    for body in re.findall(r"_GLOW\s*=\s*\{(.*?)\};", src, re.S):
        names.update(re.findall(r"(\w+)\s*:", body))
    toon = open(os.path.join(repo, "src", "toon.js"), encoding="utf-8").read()
    m = re.search(r"HALO_SLOT = /(.*?)/i;", toon)
    return names, (m.group(1).replace("\\\\", "\\") if m else None)


def pieces(me, cap=4):
    """how many loose pieces a mesh has (stops counting at cap)"""
    parent = list(range(len(me.vertices)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    roots = set()
    for i in range(len(me.vertices)):
        roots.add(find(i))
        if len(roots) >= cap:
            break
    return len(roots)


def audit_style(objects, repo, label=""):
    glows, halo_js = glow_slots(repo)
    if halo_js and halo_js != style.HALO.pattern:
        print("! style.py HALO and src/toon.js HALO_SLOT differ: keep them in step")
    dg = bpy.context.evaluated_depsgraph_get()
    found, roots = [], {}
    for o in objects:
        if o.type != "MESH" or "inkline" in o.keys() or (o.name.startswith("Cube") and not o.parent and len(o.data.polygons) == 6):
            continue                                                        # (ribbons; Blender's startup cube)
        r = o
        while r.parent:
            r = r.parent
        mat = o.material_slots[0].material if o.material_slots and o.material_slots[0].material else None
        slot = o.get("slot") or (mat.name if mat else "?")
        slot = re.sub(r"\.\d+$", "", str(slot))
        ink = float(o.get("ink", 0) or 0)
        d = sorted(o.dimensions, reverse=True)
        tris = sum(len(p.vertices) - 2 for p in o.evaluated_get(dg).to_mesh().polygons)
        o.evaluated_get(dg).to_mesh_clear()
        R = roots.setdefault(r.name, {"tris": 0, "glow": set()})
        R["tris"] += tris
        is_glow = slot in glows or slot.lower().startswith("glow")
        if is_glow:
            R["glow"].add(slot)
        where = f"{o.name} [{slot}]"
        if ink > 0 and d[1] > 0 and ink > 0.5 * d[1]:
            found.append(("ink too heavy", where, f"ink {ink:.3f} m on a part {d[1]:.3f} m across"))
        if ink > 0 and not is_glow and pieces(o.data) == 1:
            cls = style.ink_class(min(d[1], 8 * d[2]))                      # (a flat panel is a board, however wide)
            lo, hi = style.INK[cls]
            if ink > hi * 1.8 or ink < lo * 0.4:
                found.append(("ink off class", where, f"ink {ink:.3f} m, {cls} class ({d[1]:.2f} x {d[2]:.2f} m) is {lo}-{hi}"))
        if ink == 0 and not is_glow and d[0] >= 3.0 and d[2] >= 0.15:
            found.append(("no ink", where, f"{d[0]:.1f} x {d[1]:.1f} x {d[2]:.2f} m with no outline"))
        if mat is not None and not is_glow and max(mat.diffuse_color[:3]) < style.BLACK:
            found.append(("black", where, f"colour {tuple(round(c, 3) for c in mat.diffuse_color[:3])}: darks are plum, black is the ink's"))
        smooth = any(p.use_smooth for p in o.data.polygons)
        skinned = any(m.type == "ARMATURE" for m in o.modifiers)
        if smooth and not skinned and not any(m.type == "WEIGHTED_NORMAL" for m in o.modifiers):
            found.append(("no weighted", where, "smooth-shaded, no weighted normals (kit.weighted_normals)"))
        if "_TOONBIAS" not in o.data.attributes and not skinned:
            found.append(("no toon attrs", where, "no toon attributes (kit.toon_attrs)"))
    kinds = {}
    for k, w, msg in found:
        kinds.setdefault(k, []).append((w, msg))
    print(f"style audit {label}: {sum(1 for o in objects if o.type == 'MESH')} meshes, {len(roots)} model(s)")
    for k, items in kinds.items():
        print(f"  {k}: {len(items)}")
        for w, msg in items[:12]:
            print(f"    {w}: {msg}")
        if len(items) > 12:
            print(f"    ... and {len(items) - 12} more")
    big = max(style.BUDGET.values())
    for name, R in sorted(roots.items()):
        halo = sorted(s for s in R["glow"] if style.HALO.match(s))
        flat = sorted(s for s in R["glow"] if not style.HALO.match(s))
        over = "  OVER the largest budget" if R["tris"] > big else ""
        print(f"  {name}: {R['tris']} tris{over}; glow with halo {halo or '-'}, glow without {flat or '-'}")
    return {k: len(v) for k, v in kinds.items()}


if __name__ == "__main__":
    path = sys.argv[1]
    os.environ["MOONRUNNER_EXPORT"] = "0"
    repo = os.environ.setdefault("MOONRUNNER_REPO", os.getcwd())
    real = bpy.ops.export_scene.gltf

    class _NoExport:
        def __call__(self, *a, **k):
            return {"FINISHED"}

        def __getattr__(self, n):
            return getattr(real, n)
    bpy.ops.export_scene = type("NoExportScene", (), {"gltf": _NoExport()})()
    sys.argv = [path]
    ns = runpy.run_path(path, run_name="__main__")
    # builders that export only when asked (MOONRUNNER_EXPORT) never ran the export stack: run it here, as an export would
    if "weighted_normals" in ns and "toon_attrs" in ns and not any(m.type == "WEIGHTED_NORMAL" for o in bpy.data.objects for m in getattr(o, "modifiers", [])):
        objs = [o for o in bpy.data.objects]
        ns["weighted_normals"](objs)
        ns["toon_attrs"](objs)
    audit_style(list(bpy.data.objects), repo, label=f"({os.path.basename(path)})")
