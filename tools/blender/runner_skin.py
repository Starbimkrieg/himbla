# The courier's skinned suit (drafts: docs/runner-skin/; build_runner.py execs this at its end when RUNNER_SKIN is set).
#
# The courier is rigid parts on pivots, and his suit was too: a trunk, thighs, calves, upper arms and forearms, each its
# own piece on its own pivot, with balls at the elbows and knees. They part at every bend (the lean bared the thighs'
# tops), each draws its own outline (broken, doubled lines at the joints), and the piping stops and starts at each joint.
# Here the suit is one continuous body that bends: the same pieces, at the same proportions, made into one solid (the
# armpits, the crotch, the elbows and knees joined and smoothed), its every vertex weighted to the pivots it follows
# (vertex groups named after them: legL, shinL, torso, armL, foreL...; Blender's automatic weights from bones laid along the
# limbs). The game skins it to the same pivots (bones at the pivots, as its townsfolk are: models.js makeFigure), so
# everything that turns them (the animations, the ragdoll, the weapons' arm solving, the bike's pose, animating on twos)
# bends it unchanged. What is rigid stays rigid on its pivot: helmet, pauldrons, gloves, cuffs, boots, skates, pack, plates.
#
#   RUNNER_SKIN=a   ONE-PIECE: a smooth seamless suit; the piping a continuous line down each limb and side, bending with it
#   RUNNER_SKIN=b   PRESSURE SUIT: A with soft concertina ridges at the elbows, knees and waist (part of the suit's surface:
#                   they fold and open with the bend), a fuller calf and thigh
# The skinned meshes carry the custom property `skin` (1); the preview (preview_runner.py) deforms them as the game will:
# each vertex by its weights' blend of its pivots' moves from rest.

SKIN_KIND = os.environ.get("RUNNER_SKIN", "b")
SKIN_PIVOTS = ["torso", "legL", "shinL", "legR", "shinR", "armL", "foreL", "armR", "foreR"]
# the rigid suit pieces the skin replaces (the piping too: it is redrawn on the skin)
SKIN_DROP = ("torso_trunk", "hips_", "_arm", "_elbowBall", "_fore", "_leg", "_kneeBall", "_calf", "_stripe", "_shinStripe",
             "_foreStripe", "torso_seam", "_elbowRing")


def skin_world_pts(geo, at):
    """kit geometry (three axes) placed at `at` -> Blender world coordinates"""
    v, f = geo[0], geo[1]
    return [tb((p[0] + at[0], p[1] + at[1], p[2] + at[2])) for p in v], f


def skin_obj(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(reversed(f)) for f in faces])
    me.update()
    o = bpy.data.objects.new(name, me)
    C.objects.link(o)
    return o


def skin_union(parts, voxel=0.014):
    """the parts (lists of (verts, faces) in world) joined into one watertight solid: voxel remesh, then smoothed"""
    vs, fs = [], []
    for v, f in parts:
        k = len(vs)
        vs += v
        fs += [tuple(i + k for i in ff) for ff in f]
    o = skin_obj("skin_tmp", vs, fs)
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new("remesh", "REMESH")
    m.mode, m.voxel_size, m.use_smooth_shade = "VOXEL", voxel, True
    m2 = o.modifiers.new("smooth", "LAPLACIANSMOOTH")
    m2.iterations, m2.lambda_factor, m2.use_volume_preserve = 12, 0.8, True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bpy.data.objects.remove(o)
    out = bpy.data.objects.new("skin_body", me)
    C.objects.link(out)
    return out


def skin_decimate(o, ratio):
    m = o.modifiers.new("dec", "DECIMATE")
    m.ratio = ratio
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    old = o.data
    o.data = me
    bpy.data.meshes.remove(old)


def skin_rig():
    """an armature with a bone along each limb segment and up the trunk, named after the pivots, for automatic weights"""
    ad = bpy.data.armatures.new("skin_rig")
    ao = bpy.data.objects.new("skin_rig", ad)
    C.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="EDIT")
    pw = lambda n: bpy.data.objects[n].matrix_world.translation.copy()
    bones = {"torso": (pw("torso") + Vector((0, 0, 0.05)), pw("head") - Vector((0, 0, 0.1)))}
    for s in "LR":
        bones["leg" + s] = (pw("leg" + s), pw("shin" + s))
        bones["shin" + s] = (pw("shin" + s), pw("shin" + s) - Vector((0, 0, 0.36)))
        bones["arm" + s] = (pw("arm" + s), pw("fore" + s))
        bones["fore" + s] = (pw("fore" + s), pw("fore" + s) - Vector((0, 0, 0.3 + FL)))
    for n, (h, t) in bones.items():
        b = ad.edit_bones.new(n)
        b.head, b.tail = h, t
    bpy.ops.object.mode_set(mode="OBJECT")
    return ao


def skin_weights(objs, rig):
    """Blender's automatic weights (bone heat) for each skinned object"""
    for o in objs:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        o.parent = None                                                   # (the weights stay; the game binds them to its pivots)
        o.modifiers.clear()
        o.matrix_parent_inverse.identity()


def skin_ribbon(name, pts, width, body, slot, off=0.008):
    """a flat strip along `pts` (three axes, world) laid onto the body's surface (shrinkwrapped, `off` proud: flush, it takes
    no ink of its own), its weights copied from the body's nearest faces"""
    # resampled every 5 mm (straight runs between few points dipped under the curved suit: dashes)
    Q = [Vector(tb(p)) for p in pts]
    P = []
    for a, b in zip(Q, Q[1:]):
        n = max(1, int((b - a).length / 0.005))
        P += [a.lerp(b, i / n) for i in range(n)]
    P.append(Q[-1])
    vs, fs = [], []
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        # across the strip: square to its run and to the way out from the body's middle line
        out = Vector((p.x, p.y, 0.0))
        out = (out - t * out.dot(t))
        side = t.cross(out.normalized() if out.length > 1e-4 else Vector((1, 0, 0))).normalized()
        vs += [p - side * width / 2, p + side * width / 2]
        if i:
            k = 2 * i
            fs.append((k - 2, k - 1, k + 1, k))
    o = skin_obj(name, vs, [tuple(reversed(f)) for f in fs])
    # laid on
    w = o.modifiers.new("wrap", "SHRINKWRAP")
    w.target, w.wrap_method, w.offset = body, "NEAREST_SURFACEPOINT", off
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    old = o.data
    o.data = me
    bpy.data.meshes.remove(old)
    o.data.materials.append(material(slot))
    return o


def skin_copy_weights(dst, src):
    """dst's vertex groups from src's nearest face (interpolated)"""
    for n in SKIN_PIVOTS:
        if n not in dst.vertex_groups:
            dst.vertex_groups.new(name=n)
    m = dst.modifiers.new("dt", "DATA_TRANSFER")
    m.object, m.use_vert_data, m.data_types_verts = src, True, {"VGROUP_WEIGHTS"}
    m.vert_mapping = "POLYINTERP_NEAREST"
    m.layers_vgroup_select_src, m.layers_vgroup_select_dst = "ALL", "NAME"
    bpy.context.view_layer.objects.active = dst
    bpy.ops.object.modifier_apply(modifier=m.name)


def skin_concertina(body, tw):
    """B's concertina: three soft folds pressed into the finished suit round each elbow and knee and the waist (the surface
    pushed out along its normal in a cosine of the height near the joint, eased out at the ends), so they are the suit's
    own surface, bend with it and draw no lines of their own"""
    import bmesh
    bm_ = bmesh.new()
    bm_.from_mesh(body.data)
    bm_.normal_update()
    # (axis x, z in three axes; the joint's height; how far from the axis; fold period, depth; how far up and down)
    J = []
    for s_ in "LR":
        f, k = tw("fore" + s_), tw("shin" + s_)
        J.append((f[0], f[2], f[1], 0.15, 0.05, 0.011, 0.085))
        J.append((k[0], k[2], k[1], 0.19, 0.06, 0.013, 0.1))
    t = tw("torso")
    J.append((0.0, 0.0, t[1] + 0.245, 0.4, 0.06, 0.009, 0.085))
    for v in bm_.verts:
        x, y, z = v.co.x, v.co.z, -v.co.y                                # three axes
        d = 0.0
        for ax, az, jy, rad, per, amp, half in J:
            dy = y - jy
            if abs(dy) < half and math.hypot(x - ax, z - az) < rad:
                ease = 0.5 + 0.5 * math.cos(math.pi * dy / half)
                d = max(d, amp * (0.5 + 0.5 * math.cos(2 * math.pi * dy / per)) * ease)
        if d:
            v.co += v.normal * d
    bm_.to_mesh(body.data)
    bm_.free()
    body.data.update()


def skin_shoulders(body, tw):
    """everything under a shoulder pad (within 0.19 of the shoulder, 0.3 out from the middle, no lower than 0.1 under the joint)
    follows the arm alone, as the pad does, and its top is tucked in under the pad: suit poked out through the pad when the
    arm came up; the armpit below still blends"""
    gi = {g.name: g.index for g in body.vertex_groups}
    for s_ in "LR":
        a = tw("arm" + s_)
        arm = body.vertex_groups["arm" + s_]
        for v in body.data.vertices:
            x, y, z = v.co.x, v.co.z, -v.co.y
            if abs(x) > 0.30 and y > a[1] - 0.1 and math.dist((x, y, z), a) < 0.19:
                for g in list(v.groups):
                    body.vertex_groups[g.group].remove([v.index])
                arm.add([v.index], 1.0, "REPLACE")
                if y > a[1] - 0.02:                                       # tucked in under the pad (the merged shoulder rose
                    k = 0.72                                              # through its top), pulled toward the joint
                    v.co = Vector(tb((a[0] + (x - a[0]) * k, a[1] + (y - a[1]) * k, a[2] + (z - a[2]) * k)))


def build_skin(kind):
    bpy.context.view_layer.update()
    # the rigid suit pieces go (and the stripes and seams drawn on them)
    for o in [o for o in C.objects if o.type == "MESH"]:
        n = o.name
        if any(n.startswith(d) or d in n for d in SKIN_DROP) and not n.endswith(("_shoulder", "_shoulderTrim")) and not n.startswith("head_"):
            bpy.data.objects.remove(o)
    W = lambda n: tuple(bpy.data.objects[n].matrix_world.translation)
    tw = lambda n: (W(n)[0], W(n)[2], -W(n)[1])                          # a pivot's place, three axes
    parts = []
    # trunk (the egg), thighs, calves, upper arms, forearms: as the rigid pieces were, at the same proportions
    trunk = xf(lathe(EGG, 24), s=(1, 1, 0.78), fn=chest)
    parts.append(skin_world_pts(trunk, tw("torso")))
    for s, sx in (("L", -1), ("R", 1)):
        def calf_back(v):
            k = max(0.0, 1 - abs(v[1] + 0.33) / 0.2)
            return (v[0], v[1], v[2] - 0.022 * k if v[2] < 0 else v[2])
        thigh = THIGH if kind != "b" else [(r * (1.04 if -0.3 < y < -0.05 else 1.0), y) for r, y in THIGH]
        parts.append(skin_world_pts(xf(lathe(thigh, 20), fn=calf_back), tw("leg" + s)))
        calf = CALF if kind != "b" else [(r * (1.06 if -0.22 < y < -0.06 else 1.0), y) for r, y in CALF]
        parts.append(skin_world_pts(lathe(calf, 20), tw("shin" + s)))
        parts.append(skin_world_pts(lathe(ARM_UP, 20), tw("arm" + s)))
        parts.append(skin_world_pts(lathe(FORE, 20), tw("fore" + s)))
    body = skin_union(parts)                                              # (not thinned: thinning left blotchy facets)
    body.name = "skin_body"
    if kind == "b":
        skin_concertina(body, tw)
    body.data.materials.append(material("suit"))
    body["ink"], body["slot"], body["skin"] = 0.04, "suit", 1
    rig = skin_rig()
    skin_weights([body], rig)
    skin_shoulders(body, tw)
    extras = []
    # the piping: a continuous line down the outside of each arm and leg and up each side, flush on the suit
    for s, sx in (("L", -1), ("R", 1)):
        a, f, l, k = tw("arm" + s), tw("fore" + s), tw("leg" + s), tw("shin" + s)
        extras.append(skin_ribbon(f"skin_pipeArm{s}", [(a[0] + sx * 0.118, a[1] - 0.04, 0), (a[0] + sx * 0.11, a[1] - 0.2, 0), (f[0] + sx * 0.095, f[1], 0), (f[0] + sx * 0.09, f[1] - 0.15, 0)], 0.028, body, "accent"))
        extras.append(skin_ribbon(f"skin_pipeLeg{s}", [(l[0] + sx * 0.15, l[1], 0), (l[0] + sx * 0.147, l[1] - 0.2, 0), (k[0] + sx * 0.122, k[1], 0), (k[0] + sx * 0.12, k[1] - 0.2, 0)], 0.032, body, "accent"))
        t = tw("torso")
        extras.append(skin_ribbon(f"skin_seam{s}", [(sx * 0.29, t[1] + 0.14, 0), (sx * 0.262, t[1] + 0.3, 0), (sx * 0.27, t[1] + 0.42, 0), (sx * 0.31, t[1] + 0.56, 0), (sx * 0.338, t[1] + 0.68, 0)], 0.03, body, "accent"))
    for o in extras:
        skin_copy_weights(o, body)
        o["skin"] = 1
        if "ink" not in o:
            o["ink"], o["slot"] = 0.0, "accent"
        for p in o.data.polygons:
            p.use_smooth = True
    for p in body.data.polygons:
        p.use_smooth = True
    bpy.data.objects.remove(rig)
    print("skin", kind, len(body.data.polygons), "faces on the body,", len(extras), "skinned extras")
    return body, extras


def skin_for_game(objs):
    """for the game: the skinned meshes under a `skin` pivot at the body's origin, each vertex's four strongest pivots and
    their weights as point attributes _SKJ0.._SKJ3 (an index into SKIN_PIVOTS) and _SKW0.._SKW3 (models.js reads them)"""
    sk = pivot("skin", (0, 0, 0), bpy.data.objects["runner"])
    for o in objs:
        me = o.data
        names = [g.name for g in o.vertex_groups]
        J = [me.attributes.new(f"_SKJ{i}", "FLOAT", "POINT") for i in range(4)]
        Wa = [me.attributes.new(f"_SKW{i}", "FLOAT", "POINT") for i in range(4)]
        for v in me.vertices:
            ws = sorted(((g.weight, SKIN_PIVOTS.index(names[g.group])) for g in v.groups if g.weight > 1e-4 and names[g.group] in SKIN_PIVOTS), reverse=True)[:4]
            if not ws:
                ws = [(1.0, 0)]
            t = sum(w for w, _ in ws)
            ws = [(w / t, j) for w, j in ws] + [(0.0, 0)] * (4 - len(ws))
            for i, (w, j) in enumerate(ws):
                J[i].data[v.index].value = j
                Wa[i].data[v.index].value = w
        o.parent = sk
        o.matrix_parent_inverse.identity()


if SKIN_KIND:
    SKIN = build_skin(SKIN_KIND)
    skin_for_game([SKIN[0]] + SKIN[1])
