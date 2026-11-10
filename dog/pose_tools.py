"""Tools for posing the dog in Blender. Exec inside Blender with the desk scene built (DogRig and the
Dog* part meshes); run it again after every export, since export rebuilds the dog.

    exec(open("/Users/benkim/Development/desk-scene/dog/pose_tools.py").read())
    T = bpy.app.driver_namespace["T"]          # the tools, kept for later exec calls
    T["apply"]("Shrimp"); ...; T["save_pose"]("Shrimp")

Poses live as text in poses.json beside this file: a quaternion per posed bone plus the Root's
location. build_dog.py turns each one into a clip in the GLB. Bends are in dog terms (see bend() in
build_dog_asset.py): x forward, z up, so +Y bends in the side plane, nose or paw down or back; +Z
swings sideways; +X rolls.

How the shipped poses were made (2026-11-09):
  Side_A   bend_keep_chest(30): Spine1-3 +10 each, chest held still; FrontR3 +30 (the wrist).
  Donut_A  turned +35 about world Z (turn_world) around its middle, then settled.
  Shrimp   lie(80, -158); Spine1-4 +22; Neck0-2 +22; Head0 +10; Neck0-2 +4 about Z; Head0 +30 about X
           with neck_twist(30); front legs Z-folded in the chest's frame (Z_FOLD), the lower one lifted
           onto the cushion; both hind legs one straight direction to just ahead of the nose, the upper
           resting on the lower; tail laid on a curve with lay_chain.
"""
import json
import math
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

DOG_DIR = "/Users/benkim/Development/desk-scene/dog"
POSES_FILE = f"{DOG_DIR}/poses.json"
SINK = 0.012                     # how far the body rests into the cushion
Z_FOLD = ((-0.5, 0, -0.85), (1, 0, -0.1), (1, 0, 0))   # foreleg: upper arm back and down, forearm and paw forward
TWIST_BONES = ("NeckTwist0", "NeckTwist1", "NeckTwist2")

asset = {"__name__": "dog_asset"}
exec(compile(open(f"{DOG_DIR}/build_dog_asset.py").read(), f"{DOG_DIR}/build_dog_asset.py", "exec"), asset)
rig = bpy.data.objects["DogRig"]
cam = bpy.data.objects["Cam_Hero"]
parts = [o for o in bpy.data.objects if o.parent == rig and o.type == "MESH"]
body = bpy.data.objects["DogBody"]
if rig.animation_data:           # the clips would override the live pose
    rig.animation_data.action = None
    for t in rig.animation_data.nla_tracks:
        t.mute = True


# Poses on disk

def load():
    with open(POSES_FILE) as f:
        return json.load(f)


def save_pose(name):
    """Keeps the live pose as poses.json[name]."""
    poses = load()
    poses[name] = asset["read_pose"](rig)
    with open(POSES_FILE, "w") as f:
        json.dump(poses, f, indent=1)
        f.write("\n")
    return poses[name]


def apply(name):
    asset["apply_pose"](rig, load()[name])
    upd()


# Moving bones

def upd():
    bpy.context.view_layer.update()


def reset():
    asset["reset_pose"](rig)
    upd()


def bend(bone, degrees, axis=(0, 1, 0)):
    asset["bend"](rig, bone, degrees, axis)
    upd()


def p(bone, tail=True):
    """A bone's tail (or head) in world space."""
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ (pb.tail if tail else pb.head)


def pose_matrix(bone):
    pb = rig.pose.bones[bone]
    return pb.matrix @ pb.bone.matrix_local.inverted()


def dog_dir(frame, d):
    """A dog-space direction carried by bone frame's pose, in world space."""
    return (rig.matrix_world.to_3x3() @ (pose_matrix(frame).to_3x3() @ Vector(d))).normalized()


def set_swing(bone, world_dir):
    """Points a bone along a world direction with a pure swing from rest (no twist about its own
    length), so a chain posed this way never wrings its skin."""
    upd()
    pb = rig.pose.bones[bone]
    if pb.parent:
        base = pb.parent.matrix @ pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local
    else:
        base = pb.bone.matrix_local
    local = (base.to_3x3().inverted() @ (rig.matrix_world.inverted().to_3x3() @ Vector(world_dir))).normalized()
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(local)
    upd()


def swing_chain(prefix, world_dirs):
    for i, d in enumerate(world_dirs):
        set_swing(f"{prefix}{i}", d)


def fold_leg(leg, dirs=Z_FOLD, paw_droop=70):
    """Folds a leg with dog-space directions in the chest's frame (both legs fold alike and stack).
    The wrist (bone 3) and toes (bone 4) start from rest, so an earlier bend there doesn't carry over."""
    for i in (3, 4):
        rig.pose.bones[f"{leg}{i}"].rotation_quaternion = (1, 0, 0, 0)
    swing_chain(leg, [dog_dir("Spine4", d) for d in dirs])
    bend(leg + "4", paw_droop)


def bezier(p0, p1, p2, p3, n=600):
    return [(1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3
            for t in (k / n for k in range(n + 1))]


def lay_chain(prefix, count, pts):
    """Lays a chain along a curve: each bone points at the first point its own length away."""
    j = 0
    for i in range(count):
        upd()
        pb = rig.pose.bones[f"{prefix}{i}"]
        h = rig.matrix_world @ pb.head
        length = (pb.tail - pb.head).length * rig.matrix_world.to_scale()[0]
        while j < len(pts) - 1 and (pts[j] - h).length < length:
            j += 1
        set_swing(f"{prefix}{i}", (pts[j] - h).normalized())


def neck_twist(degrees, shares=(0.25, 0.5, 0.75)):
    """Twists the neck skin in steps toward a head roll of the same size (the twist bones carry only
    skin), so the throat doesn't wring at one joint. Roll the head itself with bend('Head0', d, X)."""
    for bone, share in zip(TWIST_BONES, shares):
        pb = rig.pose.bones[bone]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion((0, 1, 0), math.radians(degrees * share))
    upd()


# Placing the whole dog

def lie(roll=80, yaw=-158):
    """Onto its side from standing: +roll is its right side (belly to the room at yaw -158)."""
    reset()
    bend("Root", roll, (1, 0, 0))
    bend("Root", yaw, (0, 0, 1))


def turn_world(degrees):
    """Turns the whole dog about world Z (positive = counterclockwise from above); settle() after."""
    root = rig.pose.bones["Root"]
    w = rig.matrix_world
    root.matrix = w.inverted() @ Matrix.Rotation(math.radians(degrees), 4, "Z") @ w @ root.matrix
    upd()


def bend_keep_chest(total, bones=("Spine1", "Spine2", "Spine3"), axis=(0, 1, 0)):
    """Bends the back over bones, then moves the Root so the chest (and head and front legs) stays
    exactly where it was and only the hindquarters swing."""
    chest = rig.pose.bones["Spine4"].matrix.copy()
    for b in bones:
        bend(b, total / len(bones), axis)
    root = rig.pose.bones["Root"]
    root.matrix = chest @ rig.pose.bones["Spine4"].matrix.inverted() @ root.matrix
    upd()


world_verts = asset["world_verts"]


def settle(spot=(0, 0), sink=SINK):
    """Moves the Root so the body rests on the cushion (sink into it) and the whole dog is centred on
    spot, in the rig's units from the bed's middle."""
    root = rig.pose.bones["Root"]
    root.location = (0, 0, 0)
    upd()
    inv = np.array(rig.matrix_world.inverted())
    local = lambda c: (inv[:3, :3] @ c.T).T + inv[:3, 3]
    allco = local(np.vstack([world_verts(o) for o in parts]))
    bco = local(world_verts(body))
    c = (allco.min(0) + allco.max(0)) / 2
    shift = Vector((spot[0] - c[0], spot[1] - c[1], -sink - bco[:, 2].min()))
    root.location = root.bone.matrix_local.to_3x3().inverted() @ shift
    upd()


# Checks

def _tree(o):
    dg = bpy.context.evaluated_depsgraph_get()
    e = o.evaluated_get(dg)
    m = e.to_mesh()
    t = BVHTree.FromPolygons([e.matrix_world @ v.co for v in m.vertices], [q.vertices[:] for q in m.polygons])
    e.to_mesh_clear()
    return t


def inside(part, other):
    """How many vertices of Dog<part> sit inside Dog<other> (a ray up meets its inside first)."""
    t = _tree(bpy.data.objects["Dog" + other])
    up = Vector((0, 0, 1))
    return sum(1 for c in world_verts(bpy.data.objects["Dog" + part])
               if (h := t.ray_cast(Vector(c), up, 1.0))[0] is not None and h[1].z > 0)


def under_cushion(part):
    """How many vertices of Dog<part> are below the cushion's top."""
    t = _tree(bpy.data.objects["DogBed_Cushion"])
    up = Vector((0, 0, 1))
    return sum(1 for c in world_verts(bpy.data.objects["Dog" + part])
               if (h := t.ray_cast(Vector(c), up, 0.2))[0] is not None and h[1].z > 0.5)


def screen(bone, tail=True):
    """A bone's position in the room camera's 1600 x 900 frame, from the top left."""
    from bpy_extras.object_utils import world_to_camera_view
    v = world_to_camera_view(bpy.context.scene, cam, p(bone, tail))
    return round(v.x * 1600), round((1 - v.y) * 900)


def render_crop(path, border=(0.18, 0.40, 0.20, 0.42), percent=150):
    """A quick Workbench render through the room camera, cropped to border (min x, max x, min y,
    max y as fractions, y from the bottom). Every render setting is put back afterwards."""
    sc = bpy.context.scene
    r, sh = sc.render, sc.display.shading
    keep = (r.engine, r.use_border, r.use_crop_to_border, r.border_min_x, r.border_max_x, r.border_min_y,
            r.border_max_y, r.resolution_percentage, r.use_freestyle, r.filepath, sh.color_type, sh.light)
    try:
        r.engine = "BLENDER_WORKBENCH"
        sh.color_type, sh.light = "MATERIAL", "STUDIO"
        r.use_freestyle = False
        r.use_border = r.use_crop_to_border = True
        r.border_min_x, r.border_max_x, r.border_min_y, r.border_max_y = border
        r.resolution_percentage = percent
        r.filepath = path
        bpy.ops.render.render(write_still=True)
    finally:
        (r.engine, r.use_border, r.use_crop_to_border, r.border_min_x, r.border_max_x, r.border_min_y,
         r.border_max_y, r.resolution_percentage, r.use_freestyle, r.filepath, sh.color_type, sh.light) = keep


bpy.app.driver_namespace["T"] = globals()
print("pose tools ready:", ", ".join(load()))
