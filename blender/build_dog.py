"""The sleeping dog and its bed. Run by build_desk.py, whose helpers it shares.

The body is sculpted as a distance field: each chain of points is a tapered limb, and each limb
joins the rest with its own blend radius, so the head can stay distinct from the neck while the
torso flows. The same chains become the skeleton, so the bones sit inside the body by
construction. The mesh is modelled in the sleeping pose, which is also the rest pose, so later
poses only need bones to move.

Dog space: +X toward the nose, +Y toward the room, +Z up, metres, before DOG_SCALE.
"""
import math
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

BED_LOC = (-1.46, 0.33, 0)
BED_LONG, BED_WIDE = 0.46, 0.35     # bolster centreline half-sizes
BOLSTER = 0.08                      # half thickness
BED_CORNER = 0.13
BED_HIGH, BED_LOW = 0.18, 0.07      # all the way round, and at the front dip
DIP_FLAT, DIP_RAMP = 0.2, 0.12      # half length of the dip's floor, and of its slopes
DOG_SCALE = 0.7
DOG_LIFT = 0.045                    # the cushion's top
DOG_OFFSET = (-0.09, 0.075)
DOG_TURN = -158                     # across the camera's view, with its legs toward the low front
CELL = 0.0035                       # sculpting resolution
DOG_FACES = 6000
BREATH_AT, BREATH_SIZE = (0.03, -0.07), (0.2, 0.14)     # the middle of the ribs, and how far a breath spreads
HEAD_LIFT = -8                       # tips a bone up out of the plane, so the head rests above the body
HIDDEN = 0.02                        # the scale of a bone in a pose's "hide" list
# Sleeping positions, in bone turns. The stretched pose is the model itself.
POSES = {
    "Donut": {"Spine1": 22, "Spine2": 26, "Spine3": 22, "Neck0": 20, "Neck1": (22, HEAD_LIFT), "Neck2": (14, 0, -25), "Head0": (4, 0, -60),
              "Tail0": -45, "Tail1": -40, "Tail2": -30, "Haunch0": -65, "HindLow0": -60, "HindTop0": 60, "HindLow1": 60,
              "HindTop1": 60, "HindLow2": 60, "FrontTop0": 100, "FrontTop1": -160, "FrontTop2": 0, "FrontLow0": 130,
              "FrontLow1": -40, "FrontLow2": -60, "move": (0.17, -0.02, 0),
              # Folded away under the curl (Haunch0 sinks the hidden knee). The ear is drawn instead.
              "hide": ("FrontTop0", "FrontLow0", "HindTop0", "EarLow0")},
    # Stretched out on its side, as sculpted, with the bottom hind leg swung out from under the top one.
    "Stretch": {"HindLow0": 20, "HindLow1": -35, "HindLow2": 20},   # the paw stays where it was
    "Shrimp": {"Spine1": 12, "Spine2": 14, "Spine3": 12, "Neck0": 8, "Neck1": 8, "Neck2": 10,
               "Tail0": -30, "Tail1": -25, "Haunch0": -25, "HindLow0": -25, "HindTop1": 40, "HindLow1": 40,
               "FrontTop0": 30, "FrontTop1": -70, "FrontLow0": 30, "FrontLow1": -70, "move": (0.11, 0, 0)},
}
# Toward the room camera, in dog space. Eyes and pads tilt this way so they can be seen.
TO_CAMERA = Vector((-0.2, 0.87, 0.44))

HEAD_AT = Vector((0.353, 0.008, 0.11))      # the middle of the skull
HEAD_DIR = Vector((0.42, 0.89, -0.16)).normalized()
HEAD_TOP = Vector((0.89, -0.42, 0)).normalized()    # from the jaw toward the top of the muzzle


def along_head(forward, top=0.0, side=0.0):
    return HEAD_AT + HEAD_DIR * forward + HEAD_TOP * top + Vector((0, 0, side))


def head_point(forward, top, radius):
    return (*along_head(forward, top), radius)


def ear_point(forward, top, side, half):
    return (*along_head(forward, top, side), half)


EAR_FLAT = 3.5
# Each chain is (name, parent bone, points, blend radius, flatten). A point is x, y, z, radius.
# Flatten squeezes the limb in Z. The dog lies on its side, so the deep chest lies in XY.
CHAINS = [
    # The back arches over the loin and the belly tucks up behind the deep chest.
    ("Spine", None, [(-0.32, -0.04, 0.118, 0.094), (-0.2, -0.118, 0.118, 0.082), (-0.06, -0.128, 0.122, 0.09),
                     (0.08, -0.08, 0.126, 0.132), (0.17, -0.05, 0.118, 0.11)], 0, 1.12),
    ("Croup", "Spine0", [(-0.31, -0.095, 0.158, 0.054), (-0.235, -0.13, 0.15, 0.05)], 0.022, 1.1),   # the top of the pelvis
    # It starts well inside the chest with a wide blend, so the topline runs smoothly into the shoulder.
    ("Neck", "Spine3", [(0.11, -0.085, 0.125, 0.095), (0.19, -0.088, 0.12, 0.06), (0.275, -0.09, 0.114, 0.043),
                        (0.343, 0.0, 0.11, 0.035)], 0.05, 1.15),
    ("Head", "Neck2", [head_point(-0.03, 0.002, 0.07), head_point(0.03, 0.0, 0.058)], 0.008, 1.14),   # a long skull
    # The muzzle starts wide inside the skull, so the forehead runs into it with only a slight dip.
    ("Muzzle", "Head0", [head_point(0.02, -0.01, 0.052), head_point(0.06, -0.02, 0.04), head_point(0.11, -0.028, 0.03),
                         head_point(0.158, -0.032, 0.027)], 0.016, 1.08),
    ("Jaw", "Head0", [head_point(-0.005, -0.05, 0.03), head_point(0.03, -0.052, 0.024), head_point(0.14, -0.05, 0.015)], 0.004, 1.1),
    # Ears are flat limbs with a tight blend, so they sit on the head with a clean edge. Each
    # starts buried in the skull, which joins it softly at the root.
    ("EarTop", "Head0", [ear_point(-0.03, 0.03, 0.05, 0.012), ear_point(-0.032, 0.012, 0.062, 0.02), ear_point(-0.036, -0.006, 0.067, 0.024),
                         ear_point(-0.04, -0.024, 0.066, 0.023), ear_point(-0.042, -0.04, 0.058, 0.016)], 0.004, EAR_FLAT),
    ("EarLow", "Head0", [ear_point(-0.03, 0.03, -0.05, 0.012), ear_point(-0.034, 0.004, -0.064, 0.022), ear_point(-0.04, -0.024, -0.064, 0.022),
                         ear_point(-0.042, -0.04, -0.056, 0.015)], 0.004, EAR_FLAT),
    ("FrontTop", "Spine3", [(0.13, -0.02, 0.15, 0.064), (0.2, 0.16, 0.095, 0.037), (0.33, 0.215, 0.055, 0.025),
                            (0.365, 0.285, 0.044, 0.022)], 0.024, 1.1),
    ("FrontLow", "Spine3", [(0.14, 0.01, 0.065, 0.054), (0.2, 0.15, 0.038, 0.033), (0.255, 0.26, 0.03, 0.024),
                            (0.285, 0.335, 0.03, 0.022)], 0.016, 1.1),
    ("Haunch", "Spine0", [(-0.3, -0.01, 0.145, 0.112), (-0.15, 0.13, 0.112, 0.062)], 0.012, 1.12),
    ("HindTop", "Haunch0", [(-0.15, 0.13, 0.11, 0.056), (-0.06, 0.25, 0.066, 0.027), (0.055, 0.31, 0.045, 0.022)], 0.01, 1.1),
    ("HindLow", "Spine0", [(-0.23, 0.05, 0.055, 0.072), (-0.1, 0.13, 0.04, 0.045), (-0.02, 0.195, 0.032, 0.026),
                           (0.09, 0.2, 0.03, 0.022)], 0.014, 1.1),
    ("Tail", "Spine0", [(-0.39, -0.02, 0.11, 0.03), (-0.44, 0.07, 0.082, 0.024), (-0.447, 0.17, 0.055, 0.016),
                        (-0.432, 0.265, 0.036, 0.007)], 0.02, 1.0),
]


NOSE = (along_head(0.184, -0.024), (0.017, 0.016, 0.013))
# A closed eye: one soft line bowing toward the jaw, as centre, length, bow and width.
EYE = (along_head(0.056, 0.004, 0.05), 0.028, 0.004, 0.008)
# Paws are domed on top and flat on the sole, which rolls toward the camera so the pads show.
PAW_BACK, PAW_FRONT = 0.028, 0.018    # how far the paw reaches behind and ahead of its centre
PAW_WIDE = 0.034
PAW_DOME = 1.35                     # flattens the dome against the sole
PAW_NARROW = 0.85                   # across the paw, leaving its length alone
PAW_SOLE = 0.011                    # how far the sole sits from the paw's centre line
# Pads on the sole, as across and toward-the-toes offsets from the paw's centre, with half sizes.
PADS = [((0, -0.011), (0.0145, 0.012)), ((-0.0165, 0.009), (0.0062, 0.0078)), ((-0.0058, 0.02), (0.0062, 0.0078)),
        ((0.0058, 0.02), (0.0062, 0.0078)), ((0.0165, 0.009), (0.0062, 0.0078))]
PAD_THICKNESS = 0.004


def paw_frame(points):
    """Returns a leg's paw centre, toward-the-toes, across, and sole directions."""
    ankle, paw = Vector(points[-2][:3]), Vector(points[-1][:3])
    toes = (paw - ankle).normalized()
    sole = (TO_CAMERA - toes * TO_CAMERA.dot(toes) * 0.8).normalized()
    return paw, toes, sole.cross(toes).normalized(), sole


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


def set_pose(rig, pose):
    """Poses the skeleton. Each entry turns a bone about Z, in degrees, which is the plane the
    dog lies in, or is a (turn, lift, roll) group, where roll twists it along its own length. "move" shifts the whole dog, in metres of dog space.
    "hide" lists bones shrunk to nothing, with everything below them, for a leg folded out of sight."""
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)
    for name in pose.get("hide", ()):
        rig.pose.bones[name].scale = (HIDDEN,) * 3
    for name, turn in pose.items():
        if name in ("move", "hide"):
            continue
        bone = rig.pose.bones[name]
        turn, lift, roll = (*turn, 0, 0)[:3] if isinstance(turn, tuple) else (turn, 0, 0)
        rest = bone.bone.matrix_local.to_3x3().inverted()
        bone.rotation_quaternion = (Quaternion(rest @ Vector((0, 0, 1)), math.radians(turn))
                                    @ Quaternion(rest @ Vector((0, 1, 0)), math.radians(lift))
                                    @ Quaternion((0, 1, 0), math.radians(roll)))
    root = rig.pose.bones["Spine0"]
    root.location = root.bone.matrix_local.to_3x3().inverted() @ Vector(pose.get("move", (0, 0, 0)))


# Skin that draws no crease lines of its own in one pose, exported as _quiet_<pose>: the donut's
# folded ear (its bones' share of the weight), and a region the user circled on the side pose
# (an ellipse in view units: centre, radii), where the fill bends the thigh into the tail; and in
# the shrimp, where the haunch now runs down behind the tail.
QUIET = {"Donut": "EarLow", "Stretch": ((-0.5483, -0.3974), (0.0213, 0.0184)),
         "Shrimp": ((-0.6056, -0.3935), (0.018, 0.016))}

# Outlines the user drew over a screenshot of a pose (hero-camera view units, as SKETCHES).
# A shape key named after the pose pushes the silhouette out to the line wherever it falls
# short; the site turns it on with that pose. Stretch, 2026-11-07: the bottom hind leg runs on
# into the base of the tail (refined the same day by a second drawing up to (-0.5266, -0.3993)).
FILLS = {"Stretch": [
    (-0.5696, -0.4171), (-0.5663, -0.4177), (-0.5620, -0.4158), (-0.5584, -0.4139), (-0.5542, -0.4118),
    (-0.5504, -0.4101), (-0.5465, -0.4089), (-0.5432, -0.4083), (-0.5399, -0.4071), (-0.5356, -0.4051),
    (-0.5319, -0.4031), (-0.5298, -0.4013), (-0.5266, -0.3993), (-0.5240, -0.3977), (-0.5185, -0.3937),
    (-0.5129, -0.3897), (-0.5078, -0.3853), (-0.5035, -0.3800), (-0.4999, -0.3740), (-0.4984, -0.3671),
    (-0.4984, -0.3635)],
    # Shrimp, 2026-11-07: the haunch fills down behind the tail, so no bed shows between them.
    # The line is the tail's top edge between the ends of the haunch edge the user drew.
    "Shrimp": [(-0.6207, -0.4051), (-0.5904, -0.3819)]}
# Per pose: which limbs the fill moves, whether parts past the line are pulled back to it, and
# whether the silhouette is measured by walking out from inside through the covered area (needed
# where the line crosses a gap with more of the dog beyond it, as the shrimp's notch does).
FILL_SETTINGS = {"Stretch": {"limbs": (0, 4), "trim": True, "walk": False},
                 "Shrimp": {"limbs": (0, 3), "trim": False, "walk": True}}
FILL_BAND = 0.09          # view units inside the silhouette that stretch out to meet the line
FILL_PASSES = 10          # each pass measures again with the key on, and closes what is left
FILL_STEP = 0.001         # the line is measured at this spacing, so narrow dips are caught
FILL_STRIP = 0.0008       # half the width of the slice of silhouette each point measures
FILL_REACH = 0.004        # how far along the line a vertex looks for the worst gap
FILL_SMOOTH = 2           # rounds of spreading each pass's moves to neighbouring vertices
FILL_OVER = 0.0008        # body or bottom leg further past the line than this is pulled back to it


def resample(line, step):
    pts = np.array(line)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    at = np.concatenate([[0], np.cumsum(seg)])
    s = np.arange(0, at[-1], step)
    return np.stack([np.interp(s, at, pts[:, 0]), np.interp(s, at, pts[:, 1])], 1)


def hero_view(cam):
    from io_scene_gltf2.blender.com.conversion import yvof_blender_to_gltf
    r = bpy.context.scene.render
    yfov = yvof_blender_to_gltf(cam.data.angle, r.pixel_aspect_x * r.resolution_x, r.pixel_aspect_y * r.resolution_y, cam.data.sensor_fit)
    return math.tan(yfov / 2)


def posed_world(dog, rig, pose):
    """World positions of the dog's vertices in a pose, measured with the clips muted."""
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    set_pose(rig, pose)
    bpy.context.view_layer.update()
    ev = dog.evaluated_get(bpy.context.evaluated_depsgraph_get())
    posed = ev.to_mesh()
    world = np.array([(dog.matrix_world @ v.co)[:] for v in posed.vertices])
    ev.to_mesh_clear()
    return world   # the caller restores the pose and unmutes, after reading bones if it needs them


def unpose(rig):
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    set_pose(rig, {})


def level_move(p, shift, to_cam, scale):
    """The world move, level with the bed, that shifts point p by shift in view units. Moving
    in the camera's own plane would tilt down into the cushion, which then covers the fur."""
    def view(q):
        c = to_cam @ q
        return np.array((c.x, c.y)) / (-c.z * scale)
    e = 0.001
    base = view(p)
    jac = np.stack([(view(p + Vector(axis) * e) - base) / e for axis in ((1, 0, 0), (0, 1, 0))], 1)
    dx, dy = np.linalg.solve(jac, shift)
    return Vector((dx, dy, 0))


def walked_reach(uv, tris, curve, normals, res=0.0002):
    """How far the covered area reaches past each point of the line: walking out along the normal
    from inside, the last covered spot before the first gap. Triangles are filled exactly, so a
    gap shows even where more of the dog lies beyond it."""
    lo = curve.min(axis=0) - FILL_BAND - 0.01
    hi = curve.max(axis=0) + FILL_BAND + 0.01
    size = np.ceil((hi - lo) / res).astype(int) + 1
    grid = np.zeros((size[1], size[0]), bool)
    a, b, c = uv[tris[:, 0]], uv[tris[:, 1]], uv[tris[:, 2]]
    tmin, tmax = np.minimum(np.minimum(a, b), c), np.maximum(np.maximum(a, b), c)
    inside_region = (tmax > lo).all(axis=1) & (tmin < hi).all(axis=1)
    for p0, p1, p2, mn, mx in zip(a[inside_region], b[inside_region], c[inside_region], tmin[inside_region], tmax[inside_region]):
        i0, i1 = np.clip(((mn - lo) / res).astype(int), 0, size - 1), np.clip(((mx - lo) / res).astype(int) + 1, 0, size - 1)
        xs = lo[0] + (np.arange(i0[0], i1[0] + 1) + 0.5) * res
        ys = lo[1] + (np.arange(i0[1], i1[1] + 1) + 0.5) * res
        px, py = np.meshgrid(xs, ys)
        side = lambda o, q: (q[0] - o[0]) * (py - o[1]) - (q[1] - o[1]) * (px - o[0])
        d1, d2, d3 = side(p0, p1), side(p1, p2), side(p2, p0)
        grid[i0[1]:i1[1] + 1, i0[0]:i1[0] + 1] |= ((d1 >= 0) & (d2 >= 0) & (d3 >= 0)) | ((d1 <= 0) & (d2 <= 0) & (d3 <= 0))
    offsets = np.arange(-FILL_BAND, 0.01, res)
    reach = []
    for q, n in zip(curve, normals):
        idx = np.clip(((q + offsets[:, None] * n - lo) / res).astype(int), 0, size - 1)
        covered = grid[idx[:, 1], idx[:, 0]]
        if not covered.any():
            reach.append(-FILL_BAND)
            continue
        i = int(np.argmax(covered))
        while i + 1 < len(covered) and covered[i + 1]:
            i += 1
        reach.append(offsets[i])
    return np.array(reach)


def pose_fills(dog, rig, cam, limb_of):
    """Adds a shape key per FILLS pose that stretches the silhouette out to the drawn line."""
    scale = hero_view(cam)
    me = dog.data
    if not me.shape_keys:
        dog.shape_key_add(name="Basis", from_mix=False)
    names = [g.name for g in dog.vertex_groups]
    edges = np.array([e.vertices[:] for e in me.edges])
    tris = np.array([t for p in me.polygons for t in ((p.vertices[0], p.vertices[k], p.vertices[k + 1]) for k in range(1, len(p.vertices) - 1))])
    to_cam = cam.matrix_world.inverted()
    for name, line in FILLS.items():
        limbs, trim, walk = FILL_SETTINGS[name]["limbs"], FILL_SETTINGS[name]["trim"], FILL_SETTINGS[name]["walk"]
        key = me.shape_keys.key_blocks.get(name) or dog.shape_key_add(name=name, from_mix=False)
        key.value = 1
        for _ in range(FILL_PASSES):
            curve = resample(line, FILL_STEP)
            world = posed_world(dog, rig, POSES[name])
            c = np.array([(to_cam @ Vector(p))[:] for p in world])
            uv = c[:, :2] / (-c[:, 2:3] * scale)
            # Each vertex's skin turn in this pose, to carry a posed move back to the rest shape.
            bones = {pb.name: (pb.matrix @ pb.bone.matrix_local.inverted()).to_3x3() for pb in rig.pose.bones}
            arm = (rig.matrix_world.inverted() @ dog.matrix_world).to_3x3()
            unpose(rig)
            tangents = np.gradient(curve, axis=0)  # resampled evenly, so this is smooth
            tangents /= np.linalg.norm(tangents, axis=1)[:, None]
            normals = np.stack([tangents[:, 1], -tangents[:, 0]], 1)
            normals[normals @ np.array([1.0, -1.0]) < 0] *= -1          # away from the body: right and down
            # How far the body and legs reach past each point of the line, measured along the
            # mesh edges too: between two vertices the silhouette can sag even where both reach.
            # The tail is left out: it hangs past the line, but the gap is between it and the leg.
            keep = np.isin(limb_of, limbs + (3,))
            if walk:
                reach = walked_reach(uv, tris[np.isin(limb_of[tris], (0, 1, 2, 3, 4)).all(axis=1)], curve, normals)
            else:
                ends = edges[keep[edges].all(axis=1)]
                body = np.concatenate([uv[keep]] + [uv[ends[:, 0]] * (1 - f) + uv[ends[:, 1]] * f for f in (0.25, 0.5, 0.75)])
                reach = []
                for q, t, n in zip(curve, tangents, normals):
                    near = body[np.abs((body - q) @ t) < FILL_STRIP]
                    reach.append(((near - q) @ n).max() if len(near) else 0.0)   # nothing here: leave it
                reach = np.array(reach)
            # A vertex answers for the worst gap a little way along the line on either side, so
            # the two ends of a sagging edge both move out, not just the vertex nearest the sag.
            span = int(FILL_REACH / FILL_STEP)
            reach_near = np.array([reach[max(k - span, 0):k + span + 1].min() for k in range(len(reach))])
            delta = np.zeros((len(uv), 3))
            for i, p in enumerate(uv):
                if limb_of[i] not in limbs:
                    continue
                k = np.argmin(np.linalg.norm(curve - p, axis=1))
                along = (p - curve[k]) @ tangents[k]
                if (k == 0 and along < 0) or (k == len(curve) - 1 and along > 0):
                    continue   # past the ends of the line
                out = (p - curve[k]) @ normals[k]
                if trim and out > FILL_OVER:
                    # Past the line: pulled back onto it, so nothing hangs below the drawn edge.
                    shift = -normals[k] * (out - FILL_OVER / 2)
                elif reach_near[k] < 0:
                    depth_in = reach_near[k] - out                     # how far inside the silhouette
                    if depth_in > FILL_BAND or depth_in < -FILL_STRIP:
                        continue
                    f = (1 - max(depth_in, 0) / FILL_BAND) ** 2
                    shift = normals[k] * (-reach_near[k] + 0.0005) * f   # view units
                else:
                    continue   # the silhouette already reaches the line here
                move_world = level_move(Vector(world[i]), shift, to_cam, scale)
                v = me.vertices[i]
                skin = sum((g.weight * bones[names[g.group]] for g in v.groups if names[g.group] in bones), Matrix.Diagonal((0, 0, 0)))
                linear = dog.matrix_world.to_3x3() @ arm.inverted() @ skin @ arm
                delta[i] = (linear.inverted() @ move_world)[:]
            # Spread each pass's moves over neighbouring vertices, so the new edge is a smooth
            # curve rather than single vertices pulled out to the line between dips.
            moved = np.abs(delta).sum(1) > 0
            for _ in range(FILL_SMOOTH):
                total = np.zeros_like(delta)
                count = np.zeros(len(delta))
                np.add.at(total, edges[:, 0], delta[edges[:, 1]])
                np.add.at(total, edges[:, 1], delta[edges[:, 0]])
                np.add.at(count, edges.ravel(), 1)
                spread = total / np.maximum(count, 1)[:, None]
                free = np.isin(limb_of, limbs) & ~moved          # pushed vertices keep their move
                delta = np.where(free[:, None], spread, delta)
            for i, d in enumerate(delta):
                key.data[i].co += Vector(d)
            print("FILL", name, "moved", int((np.abs(delta).sum(1) > 0).sum()), "verts, worst gap before", round(reach.min() * 1000, 1))
        key.value = 0


def sketch_lines(dog, rig, cam):
    """For each sketched pose, bakes where every vertex sits in the hero camera's view with the
    dog in that pose (and its FILLS shape key on), as _sketch_<pose>_u and _v (view units). The
    lines ride along as the Dog's "sketch" property. The shader measures each pixel's distance
    to its pose's line in those units, so the line stays on the fur. Run after pose_fills."""
    scale = hero_view(cam)
    to_cam = cam.matrix_world.inverted()
    me = dog.data
    keys = me.shape_keys.key_blocks if me.shape_keys else {}
    for name, line in SKETCHES.items():
        if name in keys:
            keys[name].value = 1
        world = posed_world(dog, rig, POSES[name])
        unpose(rig)
        if name in keys:
            keys[name].value = 0
        c = np.array([(to_cam @ Vector(p))[:] for p in world])
        view = c[:, :2] / (-c[:, 2:3] * scale)
        for axis, data in (("u", view[:, 0]), ("v", view[:, 1])):
            attr = f"_sketch_{name.lower()}_{axis}"
            if attr in me.attributes:
                me.attributes.remove(me.attributes[attr])
            me.attributes.new(attr, "FLOAT", "POINT").data.foreach_set("value", data.astype(np.float32))
    dog["sketch"] = {name: [v for point in line for v in point] for name, line in SKETCHES.items()}


def quiet_regions(dog, rig, cam):
    """Writes _quiet_<pose> for each QUIET entry: 1 on skin whose creases draw no lines in that
    pose. Run after pose_fills, so a region is measured on the reshaped dog."""
    me = dog.data
    names = [g.name for g in dog.vertex_groups]
    scale = hero_view(cam)
    to_cam = cam.matrix_world.inverted()
    for name, region in QUIET.items():
        if isinstance(region, str):   # bones: the folded ear pulls the skin round its root into a crease
            values = np.array([sum(g.weight for g in v.groups if names[g.group].startswith(region)) for v in me.vertices]) > 0.02
        else:                         # an ellipse drawn on the view
            keys = me.shape_keys.key_blocks if me.shape_keys else {}
            if name in keys:
                keys[name].value = 1
            world = posed_world(dog, rig, POSES[name])
            unpose(rig)
            if name in keys:
                keys[name].value = 0
            c = np.array([(to_cam @ Vector(p))[:] for p in world])
            uv = c[:, :2] / (-c[:, 2:3] * scale)
            (cu, cv), (ru, rv) = region
            values = ((uv[:, 0] - cu) / ru) ** 2 + ((uv[:, 1] - cv) / rv) ** 2 < 1
        attr = f"_quiet_{name.lower()}"
        if attr in me.attributes:
            me.attributes.remove(me.attributes[attr])
        me.attributes.new(attr, "FLOAT", "POINT").data.foreach_set("value", values.astype(np.float32))


def add_poses(rig):
    """Saves each pose as a clip in the GLB. The site switches between them with the time of day."""
    rig.animation_data_create()
    for name, pose in POSES.items():
        old = bpy.data.actions.get(name)
        if old:
            bpy.data.actions.remove(old)
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        set_pose(rig, pose)
        for bone in rig.pose.bones:
            for frame in (1, 2):
                bone.keyframe_insert("rotation_quaternion", frame=frame)
                bone.keyframe_insert("scale", frame=frame)   # every clip, so a hidden leg comes back
                if bone.name == "Spine0":
                    bone.keyframe_insert("location", frame=frame)
        rig.animation_data.action = None
        rig.animation_data.nla_tracks.new().strips.new(name, 1, action)
    set_pose(rig, {})


def smooth_min(a, b, blend):
    h = np.clip(0.5 + 0.5 * (a - b) / blend, 0, 1)
    return a + (b - a) * h - blend * h * (1 - h)


def sculpt(name):
    """Draws the body as a distance field, then meshes the surface."""
    points = np.array([p[:3] for chain in CHAINS for p in chain[2]])
    low = points.min(axis=0) - 0.16
    high = points.max(axis=0) + 0.16
    size = np.ceil((high - low) / CELL).astype(int)
    field = np.full(size, 1.0, dtype=np.float32)

    def grid_around(ends, margins):
        lo = np.maximum(((ends - margins - low) / CELL).astype(int), 0).min(axis=0)
        hi = np.minimum(((ends + margins - low) / CELL).astype(int) + 2, size).max(axis=0)
        window = tuple(slice(lo[i], hi[i]) for i in range(3))
        return window, np.meshgrid(*[low[i] + CELL * np.arange(lo[i], hi[i], dtype=np.float32) for i in range(3)], indexing="ij")

    for _, _, chain, blend, flatten in CHAINS:
        ends = np.array(chain)
        window, (x, y, z) = grid_around(ends[:, :3], ends[:, 3:4] * 1.1 + blend + 0.03)
        limb = np.full(x.shape, 1.0, dtype=np.float32)
        for p0, p1 in zip(chain, chain[1:]):
            a, r0, b, r1 = np.array(p0[:3]), p0[3], np.array(p1[:3]), p1[3]
            ab = b - a
            t = np.clip(((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / (ab @ ab), 0, 1)
            dz = (z - a[2] - t * ab[2]) * flatten
            limb = np.minimum(limb, np.sqrt((x - a[0] - t * ab[0]) ** 2 + (y - a[1] - t * ab[1]) ** 2 + dz ** 2) - (r0 + (r1 - r0) * t))
        field[window] = smooth_min(field[window], limb, blend) if blend else np.minimum(field[window], limb)

    for chain, _, chain_points, *_ in CHAINS:
        if not chain.startswith(("Front", "Hind")):
            continue
        centre, toes, across, sole = paw_frame(chain_points)
        window, (x, y, z) = grid_around(np.array([centre[:]]), np.full((1, 3), 0.11))
        rx, ry, rz = x - centre.x, y - centre.y, z - centre.z
        ahead = np.clip(rx * toes.x + ry * toes.y + rz * toes.z, -PAW_BACK, PAW_FRONT)
        dx, dy, dz = rx - ahead * toes.x, ry - ahead * toes.y, rz - ahead * toes.z
        out = dx * sole.x + dy * sole.y + dz * sole.z
        side = dx * across.x + dy * across.y + dz * across.z
        dome = np.sqrt(dx * dx + dy * dy + dz * dz + out * out * (PAW_DOME ** 2 - 1) + side * side * (PAW_NARROW ** -2 - 1)) - PAW_WIDE
        # A flat sole: the larger of the two distances keeps only what is behind the plane.
        paw = -smooth_min(-dome, PAW_SOLE - out, 0.006)
        field[window] = smooth_min(field[window], paw, 0.02)
    return surface_mesh(name, field, low)


def surface_mesh(name, f, origin):
    """Surface nets: one vertex in every cell the surface crosses, joined across each edge."""
    corners = np.array([(i, j, k) for i in (0, 1) for j in (0, 1) for k in (0, 1)])
    edges = [(a, b) for a in range(8) for b in range(a + 1, 8) if abs(corners[a] - corners[b]).sum() == 1]
    shape = np.array(f.shape) - 1
    total, count = np.zeros((*shape, 3), dtype=np.float32), np.zeros(shape, dtype=np.int8)
    take = lambda c: f[c[0]:shape[0] + c[0], c[1]:shape[1] + c[1], c[2]:shape[2] + c[2]]
    for a, b in edges:
        fa, fb = take(corners[a]), take(corners[b])
        cross = (fa < 0) != (fb < 0)
        t = fa[cross] / (fa[cross] - fb[cross])
        total[cross] += corners[a] + t[:, None] * (corners[b] - corners[a])
        count[cross] += 1
    cells = np.argwhere(count > 0)
    index = np.full(shape, -1, dtype=np.int32)
    index[tuple(cells.T)] = np.arange(len(cells))
    co = origin + CELL * (cells + total[tuple(cells.T)] / count[tuple(cells.T)][:, None])
    faces = []
    for axis in range(3):
        u, v = (axis + 1) % 3, (axis + 2) % 3
        first = (f[:-1] if axis == 0 else f[:, :-1] if axis == 1 else f[:, :, :-1]) < 0
        second = (f[1:] if axis == 0 else f[:, 1:] if axis == 1 else f[:, :, 1:]) < 0
        for at in np.argwhere(first != second):
            if at[u] < 1 or at[v] < 1 or at[u] >= shape[u] or at[v] >= shape[v]:
                continue
            quad = []
            for du, dv in ((0, 0), (0, -1), (-1, -1), (-1, 0)):
                c = at.copy()
                c[u] += du
                c[v] += dv
                quad.append(int(index[tuple(c)]))
            faces.append(quad)
    me = bpy.data.meshes.new("DogField")
    me.from_pydata(co.tolist(), [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for _ in range(4):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(me)
    bm.free()

    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new("Reduce", "DECIMATE")
    mod.ratio = min(DOG_FACES / max(len(me.polygons) * 2, 1), 1.0)
    bpy.context.view_layer.update()
    low = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    low.name = name
    return low


def add_shell(bm, centre, axes, radii):
    """Adds a small flattened ball, for the nose, eye and pads. Being separate geometry keeps
    their edges crisp however coarse the body is."""
    across, along, out = [Vector(a).normalized() for a in axes]
    frame = Matrix.Translation(centre) @ Matrix((across * radii[0], along * radii[1], out * radii[2])).transposed().to_4x4()
    return bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1, matrix=frame)["verts"]


def add_parts(me):
    """Adds the nose, eye and pads. Returns each vertex's part number, and for each part
    its owning bone and mark. The body is part 0. Vertices are tagged rather than counted, since
    Blender reuses freed slots while it builds a ball, so they aren't in order."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    tag = bm.verts.layers.int.new("Part")
    parts = [None]

    def add_part(verts, owner, mark):
        for v in verts:
            v[tag] = len(parts)
        parts.append((owner, mark))

    def on_surface(point, out):
        hit = tree.ray_cast(point + out * 0.1, -out)[0]
        if hit is None:
            print("DOG MISSED SURFACE", point)
            return point
        return hit

    centre, radii = NOSE
    add_part(add_shell(bm, centre, (Vector((0, 0, 1)), HEAD_TOP, HEAD_DIR), radii), "Muzzle2", (0, 1))

    for chain, _, points, *_ in CHAINS:
        if not chain.startswith(("Front", "Hind")):
            continue
        paw, toes, across, sole = paw_frame(points)
        for (a, b), radii in PADS:
            point = paw + across * a + toes * b
            pad = add_shell(bm, on_surface(point, sole), (across, toes, sole), (*radii, PAD_THICKNESS))
            add_part(pad, f"{chain}{len(points) - 2}", (0, 1))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # Each eye is a thin strip laid on the skull, added last so it keeps facing outward.
    centre, length, bow, width = EYE
    for head_side, out in ((1, (Vector((0, 0, 1)) * 0.8 + TO_CAMERA * 0.3).normalized()), (-1, Vector((0, 0, -1)))):
        across = out.cross(HEAD_DIR).normalized()
        if across.dot(HEAD_TOP) < 0:
            across = -across
        eye = centre.copy()
        eye.z = HEAD_AT.z + (centre.z - HEAD_AT.z) * head_side
        strip = []
        for k in range(9):
            t = k / 4 - 1
            middle = eye + HEAD_DIR * (t * length / 2) - across * (bow * (1 - t * t))
            half = width / 2 * (1 - 0.75 * t * t)
            strip.append([bm.verts.new(on_surface(middle + across * side * half, out) + out * 0.0015) for side in (-1, 1)])
        faces = [bm.faces.new((a0, b0, b1, a1)) for (a0, a1), (b0, b1) in zip(strip, strip[1:])]
        faces[0].normal_update()
        if faces[0].normal.dot(out) < 0:
            for face in faces:
                face.normal_flip()
        add_part([v for pair in strip for v in pair], "Head0", (0, 1))
    bm.to_mesh(me)
    bm.free()
    part_of = np.zeros(len(me.vertices), dtype=np.int32)
    me.attributes["Part"].data.foreach_get("value", part_of)
    me.attributes.remove(me.attributes["Part"])
    return part_of, parts


# Limbs for the ink lines, by the bone that moves a vertex most. Lines always fall between two
# limbs, and between a limb and the body only where one lies over the other (see main.js).
LIMBS = (("FrontTop", 1), ("FrontLow", 2), ("Haunch", 3), ("HindTop", 3), ("HindLow", 4), ("Tail", 5))
# The donut's ear is drawn, not modelled: an ink line traced from the user's sketch over a
# screenshot of the room view (2026-11-07), in view units of the hero camera (x and y over
# tan(yfov / 2), y up). The ear flap itself folds away in that pose. See sketch_lines().
SKETCHES = {"Donut": [
    (-0.7664, -0.4067), (-0.7709, -0.4026), (-0.7738, -0.4000), (-0.7770, -0.3980), (-0.7805, -0.3967),
    (-0.7844, -0.3964), (-0.7883, -0.3968), (-0.7919, -0.3979), (-0.7952, -0.3998), (-0.7981, -0.4024),
    (-0.8002, -0.4054), (-0.8017, -0.4086), (-0.8034, -0.4116), (-0.8058, -0.4145), (-0.8085, -0.4172),
    (-0.8111, -0.4201), (-0.8119, -0.4227), (-0.8101, -0.4242), (-0.8066, -0.4250), (-0.8030, -0.4256),
    (-0.7993, -0.4261), (-0.7956, -0.4265), (-0.7920, -0.4272), (-0.7903, -0.4273), (-0.7874, -0.4264),
    (-0.7845, -0.4239), (-0.7814, -0.4217), (-0.7781, -0.4203), (-0.7747, -0.4195)],
    # The side pose: the line along the bottom hind leg runs on to the base of the tail.
    "Stretch": [
    (-0.5696, -0.4171), (-0.5663, -0.4177), (-0.5620, -0.4158), (-0.5584, -0.4139), (-0.5542, -0.4118),
    (-0.5504, -0.4101), (-0.5465, -0.4089), (-0.5432, -0.4083), (-0.5399, -0.4071), (-0.5356, -0.4051),
    (-0.5319, -0.4031), (-0.5298, -0.4013), (-0.5266, -0.3993)]}


# Each pair of legs lies fused where they touch. Alpha says which of the two pulls harder
# (above a half: the top leg), and blends smoothly, so the line between them is a clean curve.
LEG_PAIRS = ((("FrontTop",), ("FrontLow",)), (("Haunch", "HindTop"), ("HindLow",)))


def mark_regions(me_ob, part_of, parts, main_bone):
    """Green marks the dark nose, eye and pads, red the breathing, blue the limb (number / 8)
    and alpha the side of a leg pair."""
    me = me_ob.data
    mark = me.color_attributes.new("Mark", "FLOAT_COLOR", "POINT")
    marks = np.zeros((len(me.vertices), 4), dtype=np.float32)
    marks[:, 3] = 1
    for i, part in enumerate(parts):
        if part:
            marks[part_of == i, :2] = part[1]
    # Red is how much of each breath reaches this point: most at the ribs and belly.
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    swell = np.exp(-((co[:, 0] - BREATH_AT[0]) / BREATH_SIZE[0]) ** 2 - ((co[:, 1] - BREATH_AT[1]) / BREATH_SIZE[1]) ** 2)
    marks[:, 0] = np.where(part_of == 0, swell, 0)
    marks[:, 2] = [next((n for prefix, n in LIMBS if bone.startswith(prefix)), 0) / 8 for bone in main_bone]
    global LIMB_OF
    LIMB_OF = np.round(marks[:, 2] * 8).astype(int)   # for pose_fills
    names = [g.name for g in me_ob.vertex_groups]
    for v in me.vertices:
        pulls = []
        for top, low in LEG_PAIRS:
            w_top = sum(g.weight for g in v.groups if names[g.group].startswith(top))
            w_low = sum(g.weight for g in v.groups if names[g.group].startswith(low))
            pulls.append((w_top + w_low, w_top - w_low))
        marks[v.index, 3] = 0.5 + 0.5 * max(pulls)[1]
    mark.data.foreach_set("color", marks.ravel())
    me.color_attributes.active_color = mark
    me.materials.clear()
    me.materials.append(M["M_Dog"])
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))


def build_skeleton(name, parent, loc, rot, scale):
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    ACTIVE.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    segments = []
    for chain, parent_bone, points, *_ in CHAINS:
        previous = parent_bone
        for k, (p0, p1) in enumerate(zip(points, points[1:])):
            bone = arm.edit_bones.new(f"{chain}{k}")
            bone.head, bone.tail = p0[:3], p1[:3]
            if previous:
                bone.parent = arm.edit_bones[previous]
            previous = bone.name
            segments.append((bone.name, np.array(p0[:3]), np.array(p1[:3]), (p0[3] + p1[3]) / 2))
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob, segments


def skin(me_ob, segments, part_of, parts):
    """Weights fall off with distance to each bone, scaled by how thick that part is. The small
    added parts belong only to their own bones."""
    co = np.array([v.co[:] for v in me_ob.data.vertices])
    dist = np.zeros((len(co), len(segments)))
    for i, (_, a, b, r) in enumerate(segments):
        ab = b - a
        t = np.clip(((co - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
        dist[:, i] = np.linalg.norm(co - (a + t[:, None] * ab), axis=1) / r
    for i, part in enumerate(parts):
        if part:
            others = [k for k, segment in enumerate(segments) if not segment[0].startswith(part[0])]
            dist[np.ix_(part_of == i, others)] = np.inf
    weight = 1 / np.maximum(dist, 0.05) ** 6
    groups = [me_ob.vertex_groups.new(name=s[0]) for s in segments]
    keep = np.argsort(-weight, axis=1)[:, :4]
    for v in range(len(co)):
        chosen = weight[v, keep[v]]
        chosen = chosen / chosen.sum()
        for g, w in zip(keep[v], chosen):
            if w > 0.01:
                groups[g].add([v], float(w), "REPLACE")
    mod = me_ob.modifiers.new("Skeleton", "ARMATURE")
    mod.object = me_ob.parent
    return [segments[k][0] for k in keep[:, 0]]   # the bone that moves each vertex most


use("Dog")
dog_bed = group("DogBed", loc=BED_LOC)
mesh("DogBed_Bolster", bed_geo(), MAIN, dog_bed, smooth=True)
mesh("DogBed_Cushion", dome_geo(1.0, 0.78, 0.05), M["M_Paper"], dog_bed, loc=(0, 0, 0.012), smooth=True)

for old in [m for m in bpy.data.meshes if m.name.startswith("Dog") and not m.users]:
    bpy.data.meshes.remove(old)     # left over from earlier builds
skeleton, bones = build_skeleton("DogRig", dog_bed, (*DOG_OFFSET, DOG_LIFT), (0, 0, R(DOG_TURN)), DOG_SCALE)
dog_mesh = sculpt("Dog")
part_of, parts = add_parts(dog_mesh)
dog = bpy.data.objects.new("Dog", dog_mesh)
ACTIVE.objects.link(dog)
dog.parent = skeleton
main_bone = skin(dog, bones, part_of, parts)
add_poses(skeleton)
mark_regions(dog, part_of, parts, main_bone)
print("DOG", len(dog_mesh.polygons), "faces", len(dog_mesh.vertices), "verts", len(bones), "bones")
