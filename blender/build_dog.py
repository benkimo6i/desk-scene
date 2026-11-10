"""The dog's bed, and the dog lying in it. Run by build_desk.py, whose helpers it shares.

The dog itself is the reusable asset in dog/build_dog_asset.py: a standing, rigged model. Here it
is placed on the cushion, given the scene's materials and the vertex marks the site's shader reads,
and given its poses from dog/poses.json, one clip per pose. The site picks a pose by time of day.
"""
import json
import numpy as np
from mathutils import Vector

DOG_DIR = "/Users/benkim/Development/desk-scene/dog"
BED_LOC = (-1.46, 0.33, 0)
BED_LONG, BED_WIDE = 0.46, 0.35     # bolster centreline half-sizes
BOLSTER = 0.08                      # half thickness
BED_CORNER = 0.13
BED_HIGH, BED_LOW = 0.18, 0.07      # all the way round, and at the front dip
DIP_FLAT, DIP_RAMP = 0.2, 0.12      # half length of the dip's floor, and of its slopes
DOG_SCALE = 0.665                   # 5% under the old dog, so the side pose clears the chair and shows its tail (2026-11-08)
DOG_LIFT = 0.045                    # the cushion's top
# Breathing swells the ribs most, fading out over this size (dog space x and z, standing).
BREATH_AT, BREATH_SIZE = (0.03, 0.37), (0.2, 0.14)
# The front legs are separate meshes and don't breathe, so the chest stops swelling where a leg
# lies on it, or it pushes through the leg (review 2026-11-09): within this distance of a front
# leg standing (dog units), and within BREATH_CLEAR_POSED (m) of one in any pose.
BREATH_CLEAR_REST, BREATH_CLEAR_POSED = 0.04, 0.035
# Joints: skin marked _root draws no ink line against the body (main.js), so a leg or ear
# joins the body without one. On an ear, the flap from its root down to where it slides out
# from under the root pad; on a leg, its skin near the body around the shoulder or hip
# (user, 2026-11-08: no lines where the legs meet the torso, the parts stay separate).
EAR_ROOT = 0.3 
JOINT_REACH = 0.02                  # leg skin this close to the body (standing, dog units) ...
JOINT_UPPER = 0.45                  # ... in this top share of the leg

def bed_geo():
    """A soft bolster ring, one height all the way round, with a low dip facing the camera."""
    m = 12
    corner = BED_CORNER
    a, b = BED_LONG - corner, BED_WIDE - corner
    arc = corner * np.pi / 2
    lengths = [2 * a, arc, 2 * b, arc, 2 * a, arc, 2 * b, arc]
    verts, faces = [], []

    def path(s):
        for i, seg in enumerate(lengths):
            if s > seg:
                s -= seg
                continue
            t = s / seg
            if i % 2 == 0:
                return {0: ((-a + 2 * a * t, b + corner), (0, 1)),
                        1: ((a + corner, b - 2 * b * t), (1, 0)),
                        2: ((a - 2 * a * t, -b - corner), (0, -1)),
                        3: ((-a - corner, -b + 2 * b * t), (-1, 0))}[i // 2]
            q = (i - 1) // 2
            ang = np.pi / 2 - q * np.pi / 2 - t * np.pi / 2
            cx, cy = [(a, b), (a, -b), (-a, -b), (-a, b)][q]
            d = (np.cos(ang), np.sin(ang))
            return ((cx + corner * d[0], cy + corner * d[1]), d)
        return ((-a, b + corner), (0, 1))

    # Spend the points where the outline turns, not along the straights.
    stops, along = [], 0.0
    for i, seg in enumerate(lengths):
        count = 8 if i % 2 else 12
        stops += [along + seg * k / count for k in range(count)]
        along += seg
    n = len(stops)
    for s in stops:
        (px, py), (nx, ny) = path(s)
        ramp = float(np.clip((DIP_FLAT + DIP_RAMP - abs(px)) / DIP_RAMP, 0, 1)) if ny < -0.5 else 0.0
        h = BED_HIGH + (BED_LOW - BED_HIGH) * ramp * ramp * (3 - 2 * ramp)
        for j in range(m):
            phi = 2 * np.pi * j / m
            c, r = np.cos(phi), np.sin(phi)
            # A squared-off section: nearly flat on top, with upright sides.
            out = np.sign(c) * abs(c) ** 0.55 * BOLSTER
            verts.append((px + nx * out, py + ny * out, h / 2 * (1 + np.sign(r) * abs(r) ** 0.55 * 0.98)))
    for i in range(n):
        i2 = (i + 1) % n
        for j in range(m):
            j2 = (j + 1) % m
            faces.append((i * m + j, i * m + j2, i2 * m + j2, i2 * m + j))
    return verts, faces


def mark_regions(part, dog, part_of, parts, ear_t):
    """Vertex marks the site's shader reads: green the dark nose, eyes and pads, red the
    breathing (the body only). _root is 1 on an ear's root, where its outline stays open."""
    me = dog.data
    mark = me.color_attributes.new("Mark", "FLOAT_COLOR", "POINT")
    marks = np.zeros((len(me.vertices), 4), dtype=np.float32)
    for i, detail in enumerate(parts):
        if detail:
            marks[part_of == i, :2] = detail[1]
    if part == "Body":
        co = np.zeros(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        swell = np.exp(-((co[:, 0] - BREATH_AT[0]) / BREATH_SIZE[0]) ** 2 - ((co[:, 2] - BREATH_AT[1]) / BREATH_SIZE[1]) ** 2)
        dist = dog_asset["chain_distances"](co)
        swell *= np.clip(np.minimum(dist["FrontL"], dist["FrontR"]) / BREATH_CLEAR_REST, 0, 1)
        marks[:, 0] = np.where(part_of == 0, swell, 0)
    mark.data.foreach_set("color", marks.ravel())
    me.color_attributes.active_color = mark
    # Smooth across each triangle, so the open stretch of the outline ends cleanly.
    root = np.zeros(len(me.vertices), dtype=np.float32)
    if ear_t is not None:
        root = (ear_t < EAR_ROOT).astype(np.float32)
    elif part in dog_asset["LEGS"] or part == "Tail":   # the tail joins the rump without a line too (2026-11-08)
        co = np.zeros(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        dist = dog_asset["chain_distances"](co)
        body = np.min(np.stack([dist[c] for c in dog_asset["PARTS"]["Body"]]), axis=0)
        points = np.array([p[:3] for p in next(c[2] for c in dog_asset["CHAINS"] if c[0] == part)])
        top, foot = points[0], points[-1]
        t = np.clip((co - top) @ (foot - top) / ((foot - top) @ (foot - top)), 0, 1)
        root = ((body < JOINT_REACH) & (t < JOINT_UPPER)).astype(np.float32)
    me.attributes.new("_root", "FLOAT", "POINT").data.foreach_set("value", root)
    me.materials.clear()
    me.materials.append(M["M_Dog"])


def add_poses(rig, poses):
    """Saves each pose as a clip in the GLB. Every bone is keyed in every clip (rotation, scale,
    and the Root's location), so switching clips never leaves a bone where the last one put it."""
    rig.animation_data_create()
    for name, pose in poses.items():
        old = bpy.data.actions.get(name)
        if old:
            bpy.data.actions.remove(old)
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        dog_asset["apply_pose"](rig, pose)
        for bone in rig.pose.bones:
            for frame in (1, 2):
                bone.keyframe_insert("rotation_quaternion", frame=frame)
                bone.keyframe_insert("scale", frame=frame)
                if bone.name == dog_asset["ROOT_BONE"]:
                    bone.keyframe_insert("location", frame=frame)
        rig.animation_data.action = None
        rig.animation_data.nla_tracks.new().strips.new(name, 1, action)
    dog_asset["reset_pose"](rig)


def clear_breath_under_legs(rig, body, legs, poses):
    """Fades the body's breathing mark to 0 wherever a front leg lies within BREATH_CLEAR_POSED of
    it in any pose (a folded forearm against the chest, say)."""
    from mathutils.kdtree import KDTree

    def world_co(o):
        e = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        m = e.to_mesh()
        co = np.array([e.matrix_world @ v.co for v in m.vertices])
        e.to_mesh_clear()
        return co

    near = np.full(len(body.data.vertices), np.inf)
    for pose in poses.values():
        dog_asset["apply_pose"](rig, pose)
        bpy.context.view_layer.update()
        leg_co = np.vstack([world_co(o) for o in legs])
        tree = KDTree(len(leg_co))
        for i, c in enumerate(leg_co):
            tree.insert(c, i)
        tree.balance()
        near = np.minimum(near, [tree.find(c)[2] for c in world_co(body)])
    dog_asset["reset_pose"](rig)
    mark = body.data.color_attributes["Mark"]
    colors = np.zeros(len(near) * 4, dtype=np.float32)
    mark.data.foreach_get("color", colors)
    colors = colors.reshape(-1, 4)
    colors[:, 0] *= np.clip(near / BREATH_CLEAR_POSED, 0, 1)
    mark.data.foreach_set("color", colors.ravel())


use("Dog")
dog_bed = group("DogBed", loc=BED_LOC)
mesh("DogBed_Bolster", bed_geo(), MAIN, dog_bed, smooth=True)
mesh("DogBed_Cushion", dome_geo(1.0, 0.78, 0.05), M["M_Paper"], dog_bed, loc=(0, 0, 0.012), smooth=True)

for old in [m for m in bpy.data.meshes if m.name.startswith("Dog") and not m.users]:
    bpy.data.meshes.remove(old)     # left over from earlier builds
dog_asset = {"__name__": "dog_asset"}
exec(compile(open(f"{DOG_DIR}/build_dog_asset.py").read(), f"{DOG_DIR}/build_dog_asset.py", "exec"), dog_asset)
dog_rig, dog_parts = dog_asset["build"](ACTIVE)
# The rig stands at the middle of the cushion; each pose's Root places the dog in the bed.
dog_rig.parent = dog_bed
dog_rig.location = (0, 0, DOG_LIFT)
dog_rig.scale = (DOG_SCALE,) * 3
# The ink pass numbers the parts: Body 0, then the legs and tail, then the ears (6 and up, always
# outlined). The number rides into the GLB as a custom property (main.js reads userData.dog_part).
DOG_INK_ORDER = [p for p in dog_parts if p == "Body"] + [p for p in dog_parts if p != "Body" and not p.startswith("Ear")] \
    + [p for p in dog_parts if p.startswith("Ear")]
assert DOG_INK_ORDER.index("EarL") == 6, DOG_INK_ORDER      # main.js treats 6 and up as ears
for dog_part, (dog_ob, dog_part_of, dog_details, _, dog_ear_t) in dog_parts.items():
    mark_regions(dog_part, dog_ob, dog_part_of, dog_details, dog_ear_t)
    dog_ob["dog_part"] = DOG_INK_ORDER.index(dog_part)
try:
    with open(f"{DOG_DIR}/poses.json") as f:
        dog_poses = json.load(f)
except FileNotFoundError:
    dog_poses = {}
# Before the clips go on: their NLA strips would override the poses this applies.
clear_breath_under_legs(dog_rig, dog_parts["Body"][0], [dog_parts[s][0] for s in ("FrontL", "FrontR")], dog_poses)
add_poses(dog_rig, dog_poses)
print("DOG", {p: len(o[0].data.polygons) for p, o in dog_parts.items()}, "faces,", len(dog_rig.data.bones), "bones,", "poses:", list(dog_poses))
