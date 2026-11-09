"""Roughs in the dog's poses and writes them to poses.json. Run inside Blender, in a scene with
the dog built (DogRig and Dog), for example the desk scene.

Each rough pose is a list of bends in dog terms (see bend() in build_dog_asset.py): +Y bends in
the dog's side plane, nose or paw toward the ground or back; +Z swings sideways; +X rolls. The
Root's turns place the whole dog, and settle() then sets it down on the ground, centred where
asked. These are starting points; fine-tune in Blender's pose mode, then save_pose() keeps it.

Only the poses named in ROUGH are rewritten; others already in poses.json are kept.
"""
import json
import bpy
import numpy as np
from mathutils import Vector

DOG_DIR = "/Users/benkim/Development/desk-scene/dog"
POSES_FILE = f"{DOG_DIR}/poses.json"
asset = {"__name__": "dog_asset"}
exec(compile(open(f"{DOG_DIR}/build_dog_asset.py").read(), f"{DOG_DIR}/build_dog_asset.py", "exec"), asset)

# Where the old dog lay on the cushion: its middle, in dog units from the bed's centre.
BED_SPOT = (-0.129, 0.107)
SINK = 0.012          # into the cushion, so it reads as resting on it
SIDE_YAW = -158       # lying on its side across the camera's view, legs toward the room

# Onto its right side, left side up, but not flat: rolled LIE_ROLL of the way, so the upper flank
# tilts toward the room camera and the lower legs tuck under, as the old side-lying dog was sculpted.
LIE_ROLL = 80
LIE = [("Root", LIE_ROLL, "X"), ("Root", SIDE_YAW, "Z")]
ROUGH = {
    # On its side, loosely curled: back rounded, head down toward the front paws, hind legs
    # drawn up under the belly.
    "Shrimp": LIE + [
        ("Spine1", 8), ("Spine2", 10), ("Spine3", 10), ("Neck0", 15), ("Neck1", 10), ("Head0", 8),
        ("FrontL0", -45), ("FrontL1", 20), ("FrontR0", -55), ("FrontR1", 25),
        ("HindL0", -65), ("HindL1", -20), ("HindR0", -55), ("HindR1", -25),
        ("Tail0", -25)],
}
AXES = {"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}


def settle(rig, dog, spot=BED_SPOT):
    """Moves the Root so the posed dog's torso rests on the ground (Z 0, less SINK), with the
    whole dog centred on spot. Legs don't hold it up: one that pokes through shows what to fix."""
    root = rig.pose.bones[asset["ROOT_BONE"]]
    root.location = (0, 0, 0)
    bpy.context.view_layer.update()
    me = dog.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    co = np.array([v.co[:] for v in me.vertices])
    dog.to_mesh_clear()
    names = {g.index: g.name for g in dog.vertex_groups}
    torso = np.array([sum(g.weight for g in v.groups if names[g.group].startswith(("Spine", "Croup"))) > 0.5
                      for v in dog.data.vertices])
    centre = (co.min(axis=0) + co.max(axis=0)) / 2
    shift = Vector((spot[0] - centre[0], spot[1] - centre[1], -SINK - co[torso, 2].min()))
    root.location = root.bone.matrix_local.to_3x3().inverted() @ shift
    bpy.context.view_layer.update()


def rough(rig, dog, bends):
    asset["reset_pose"](rig)
    for bone, degrees, *axis in bends:
        asset["bend"](rig, bone, degrees, AXES[axis[0]] if axis else AXES["Y"])
    settle(rig, dog)
    return asset["read_pose"](rig)


def load():
    try:
        with open(POSES_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save(poses):
    with open(POSES_FILE, "w") as f:
        json.dump(poses, f, indent=1)
        f.write("\n")


def save_pose(name, rig=None):
    """Keeps the live pose (for example after fine-tuning in pose mode) as poses.json[name]."""
    rig = rig or bpy.data.objects["DogRig"]
    poses = load()
    poses[name] = asset["read_pose"](rig)
    save(poses)
    return poses[name]


if __name__ == "__main__":
    rig, dog = bpy.data.objects["DogRig"], bpy.data.objects["Dog"]
    poses = load()
    for name, bends in ROUGH.items():
        poses[name] = rough(rig, dog, bends)
    save(poses)
    asset["reset_pose"](rig)
    print("ROUGHED", list(ROUGH))
