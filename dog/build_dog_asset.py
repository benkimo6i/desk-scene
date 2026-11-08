"""The dog, standing, as a reusable asset: its body, nose, closed eyes and pads. Needs only bpy.
Run inside Blender (desk-scene's build runs it); it writes nothing to disk by itself.

The body is sculpted as a distance field: each chain of points is a tapered limb, and each limb
joins the rest with its own blend radius, so the head can stay distinct from the neck while the
torso flows. The same chains become the skeleton, so the bones sit inside the body by
construction. Proportions follow the earlier side-lying dog (2026-11-06), re-laid standing,
with both sides finished and four separate legs, so any pose only needs bones to move.

Dog space: +X toward the nose, +Y the dog's left, +Z up, ground at Z = 0, metres before scaling.
"""
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

CELL = 0.0035                       # sculpting resolution
DOG_FACES = 6000                    # quads after the remesh; both sides show now

# The head is placed by a frame: its middle, the way the muzzle points, and the way the top of
# the skull faces. Points on the head are given along that frame.
HEAD_AT = Vector((0.335, 0, 0.585))
HEAD_DIR = Vector((0.93, 0, -0.36)).normalized()
HEAD_TOP = Vector((0.36, 0, 0.93)).normalized()


def along_head(forward, top=0.0, side=0.0):
    return HEAD_AT + HEAD_DIR * forward + HEAD_TOP * top + Vector((0, side, 0))


def head_point(forward, top, radius):
    return (*along_head(forward, top), radius)


def ear_point(forward, top, side, half):
    return (*along_head(forward, top, side), half)


EAR_FLAT = 3.5
FRONT_SIDE, HIND_SIDE = 0.056, 0.062   # how far each pair of legs stands from the middle
PAW_Z = 0.011                       # paw centres sit this high, so the soles rest on the ground


def front_leg(side):
    y = side * FRONT_SIDE
    # Shoulder blade inside the chest, then upper arm back to the elbow, forearm, and pastern.
    return [(0.12, y * 0.6, 0.40, 0.06), (0.17, y, 0.29, 0.05), (0.125, y, 0.17, 0.037),
            (0.14, y, 0.065, 0.025), (0.16, y, PAW_Z, 0.022)]


def hind_leg(side):
    y = side * HIND_SIDE
    # From the user's reference and markup (2026-11-08): the thigh drops almost straight to the
    # stifle, the long shin runs back to a high hock, and the rear pastern stands nearly upright
    # to the foot. The thigh's bulk is a separate shape (thigh() below), broad down to the knee.
    # Placed under the back of the rump, as the user drew it (second markup, 2026-11-08).
    return [(-0.255, y * 0.6, 0.34, 0.08), (-0.24, y, 0.215, 0.05), (-0.345, y, 0.13, 0.027),
            (-0.345, y, 0.055, 0.02), (-0.335, y, PAW_Z, 0.02)]


def thigh(side):
    """The thigh muscle, from the hip down to the knee, about 13 cm front to back."""
    y = side * HIND_SIDE
    return [(-0.255, y * 0.8, 0.37, 0.072), (-0.255, y, 0.29, 0.066), (-0.247, y, 0.24, 0.054)]


def ear(side):
    s = side
    return [ear_point(-0.03, 0.03, s * 0.05, 0.012), ear_point(-0.032, 0.012, s * 0.062, 0.02),
            ear_point(-0.036, -0.006, s * 0.067, 0.024), ear_point(-0.04, -0.024, s * 0.066, 0.023),
            ear_point(-0.042, -0.04, s * 0.058, 0.016)]


TAIL_LENGTH = 0.726                 # a share of the first drawn tail, shortened toward its base (user's line)


def tail():
    """Set high, hanging down, with the tip curving up. Shortened as a whole, so it keeps its curve."""
    drawn = [(-0.31, 0.42, 0.028), (-0.345, 0.35, 0.022), (-0.375, 0.27, 0.017),
             (-0.392, 0.21, 0.013), (-0.415, 0.178, 0.009), (-0.445, 0.188, 0.006)]
    bx, bz = drawn[0][:2]
    return [(bx + (x - bx) * TAIL_LENGTH, 0, bz + (z - bz) * TAIL_LENGTH, r) for x, z, r in drawn]


# Each chain is (name, parent bone, points, blend radius, flatten). A point is x, y, z, radius.
# Flatten squeezes the limb across the dog (in Y): the chest is deep, not round.
CHAINS = [
    # The back arches over the loin and the belly tucks up behind the deep chest.
    # Flattened more than the other limbs, so the chest is narrower than it is deep. The topline
    # follows the user's line (2026-11-08): nearly level from the withers, then an even slope down
    # past the tail, with no hump over the hips.
    ("Spine", None, [(-0.24, 0, 0.38, 0.09), (-0.15, 0, 0.427, 0.082), (-0.06, 0, 0.43, 0.09),
                     (0.08, 0, 0.38, 0.132), (0.17, 0, 0.35, 0.11)], 0, 1.3),
    ("Croup", "Spine0", [(-0.275, 0, 0.383, 0.04), (-0.2, 0, 0.43, 0.045)], 0.022, 1.1),   # the top of the pelvis, on the slope
    # It starts well inside the chest with a wide blend, so the topline runs smoothly into the shoulder.
    ("Neck", "Spine3", [(0.11, 0, 0.385, 0.095), (0.2, 0, 0.445, 0.06), (0.265, 0, 0.505, 0.043),
                        (0.31, 0, 0.55, 0.035)], 0.05, 1.15),
    # The crest: extra thickness along the back of the neck, running up into the skull.
    ("Crest", "Neck1", [(0.19, 0, 0.47, 0.05), (0.255, 0, 0.535, 0.044), (0.29, 0, 0.59, 0.036)], 0.035, 1.2),
    ("Head", "Neck2", [head_point(-0.03, 0.002, 0.07), head_point(0.03, 0.0, 0.058)], 0.008, 1.14),   # a long skull
    # The muzzle starts wide inside the skull, so the forehead runs into it with only a slight dip.
    ("Muzzle", "Head0", [head_point(0.02, -0.01, 0.052), head_point(0.06, -0.02, 0.04), head_point(0.11, -0.028, 0.03),
                         head_point(0.158, -0.032, 0.027)], 0.016, 1.08),
    # A soft blend, so the end of the jaw runs into the muzzle without a lump under the chin.
    ("Jaw", "Head0", [head_point(-0.005, -0.05, 0.03), head_point(0.03, -0.052, 0.024), head_point(0.125, -0.046, 0.016)], 0.014, 1.1),
    # Ears are flat limbs with a tight blend, so they sit on the head with a clean edge. Each
    # starts buried in the skull, which joins it softly at the root, and hangs over the cheek.
    ("EarL", "Head0", ear(1), 0.004, EAR_FLAT),
    ("EarR", "Head0", ear(-1), 0.004, EAR_FLAT),
    ("FrontL", "Spine3", front_leg(1), 0.024, 1.1),
    ("FrontR", "Spine3", front_leg(-1), 0.024, 1.1),
    ("HindL", "Spine0", hind_leg(1), 0.014, 1.1),
    ("HindR", "Spine0", hind_leg(-1), 0.014, 1.1),
    ("ThighL", "HindL0", thigh(1), 0.03, 1.15),
    ("ThighR", "HindR0", thigh(-1), 0.03, 1.15),
    # Set high, at the top-back of the rump where the back's slope ends, hanging down with the tip curving up.
    ("Tail", "Spine0", tail(), 0.02, 1.0),
]
LEGS = ("FrontL", "FrontR", "HindL", "HindR")
# Shape only: these add volume but get no bones of their own; they move with their parent bone.
SHAPE_ONLY = ("Crest", "ThighL", "ThighR")

NOSE = (along_head(0.184, -0.024), (0.017, 0.016, 0.013))
# A closed eye on each side: one soft line bowing toward the jaw, as centre, length, bow and width.
EYE = (along_head(0.056, 0.004, 0.05), 0.028, 0.004, 0.008)
# Paws are domed on top and flat on the sole, which faces the ground.
PAW_BACK, PAW_FRONT = 0.006, 0.018   # how far the paw reaches behind and ahead of its centre
HEEL_CUT = 0.024                    # the paw stops this far behind its centre: about half the old heel
PAW_WIDE = 0.034
PAW_DOME = 1.35                     # flattens the dome against the sole
PAW_NARROW = 0.85                   # across the paw, leaving its length alone
PAW_SOLE = 0.011                    # how far the sole sits from the paw's centre line
# Pads on the sole, as across and toward-the-toes offsets from the paw's centre, with half sizes.
PADS = [((0, -0.011), (0.0145, 0.012)), ((-0.0165, 0.009), (0.0062, 0.0078)), ((-0.0058, 0.02), (0.0062, 0.0078)),
        ((0.0058, 0.02), (0.0062, 0.0078)), ((0.0165, 0.009), (0.0062, 0.0078))]
PAD_THICKNESS = 0.004


def paw_frame(points):
    """Returns a leg's paw centre, toward-the-toes, across, and sole directions. Standing, the
    toes point forward and the sole faces the ground."""
    paw = Vector(points[-1][:3])
    toes, sole = Vector((1, 0, 0)), Vector((0, 0, -1))
    return paw, toes, sole.cross(toes).normalized(), sole


def smooth_min(a, b, blend):
    h = np.clip(0.5 + 0.5 * (a - b) / blend, 0, 1)
    return a + (b - a) * h - blend * h * (1 - h)


def capsule(x, y, z, a, r0, b, r1, flatten):
    ab = b - a
    t = np.clip(((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / (ab @ ab), 0, 1)
    dy = (y - a[1] - t * ab[1]) * flatten
    return np.sqrt((x - a[0] - t * ab[0]) ** 2 + dy ** 2 + (z - a[2] - t * ab[2]) ** 2) - (r0 + (r1 - r0) * t)


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
            limb = np.minimum(limb, capsule(x, y, z, np.array(p0[:3]), p0[3], np.array(p1[:3]), p1[3], flatten))
        field[window] = smooth_min(field[window], limb, blend) if blend else np.minimum(field[window], limb)

    for chain, _, chain_points, *_ in CHAINS:
        if chain not in LEGS:
            continue
        centre, toes, across, sole = paw_frame(chain_points)
        window, (x, y, z) = grid_around(np.array([centre[:]]), np.full((1, 3), 0.11))
        rx, ry, rz = x - centre.x, y - centre.y, z - centre.z
        ahead = np.clip(rx * toes.x + ry * toes.y + rz * toes.z, -PAW_BACK, PAW_FRONT)
        dx, dy, dz = rx - ahead * toes.x, ry - ahead * toes.y, rz - ahead * toes.z
        out = dx * sole.x + dy * sole.y + dz * sole.z
        side = dx * across.x + dy * across.y + dz * across.z
        dome = np.sqrt(dx * dx + dy * dy + dz * dz + out * out * (PAW_DOME ** 2 - 1) + side * side * (PAW_NARROW ** -2 - 1)) - PAW_WIDE
        # A flat sole: the larger of the two distances keeps only what is above the plane.
        paw = -smooth_min(-dome, PAW_SOLE - out, 0.006)
        # The heel: cut off flat (softly) just behind the leg.
        behind = -(rx * toes.x + ry * toes.y + rz * toes.z) - HEEL_CUT
        paw = -smooth_min(-paw, -behind, 0.008)
        field[window] = smooth_min(field[window], paw, 0.02)
    return surface_mesh(name, field, low)


def surface_mesh(name, f, origin):
    """Surface nets: one vertex in every cell the surface crosses, joined across each edge.
    The result is dense and uneven, so it is remeshed into even quads (quad_remesh)."""
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
    return quad_remesh(name, me)


def quad_remesh(name, dense):
    """Turns the dense surface into an even, all-quad mesh (Blender's QuadriFlow), which bends
    cleanly and is easy to edit or reuse."""
    ob = bpy.data.objects.new(name + "_Remesh", dense)
    bpy.context.scene.collection.objects.link(ob)
    for other in bpy.context.selected_objects:
        other.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    # QuadriFlow needs a closed surface: the voxel pass seals the few pinched edges surface nets
    # leaves at thin tips (ears, tail). It also refuses the full-density surface (2026-11-08,
    # Blender 5.2), so the surface is thinned first; the remesh then rebuilds it evenly.
    dense.remesh_voxel_size = CELL
    override = dict(active_object=ob, object=ob, selected_objects=[ob], selected_editable_objects=[ob])
    thin = ob.modifiers.new("Thin", "DECIMATE")
    thin.ratio = 0.2
    with bpy.context.temp_override(**override):
        bpy.ops.object.voxel_remesh()
        bpy.ops.object.modifier_apply(modifier=thin.name)
        result = bpy.ops.object.quadriflow_remesh(target_faces=DOG_FACES, use_mesh_symmetry=False, use_preserve_sharp=False,
                                                  use_preserve_boundary=False, smooth_normals=False, seed=0)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Dog quad remesh failed: {result}")
    me = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    if dense.users == 0 and dense != me:
        bpy.data.meshes.remove(dense)
    me.name = name
    return me


def add_shell(bm, centre, axes, radii):
    """Adds a small flattened ball, for the nose and pads. Being separate geometry keeps their
    edges crisp however coarse the body is."""
    across, along, out = [Vector(a).normalized() for a in axes]
    frame = Matrix.Translation(centre) @ Matrix((across * radii[0], along * radii[1], out * radii[2])).transposed().to_4x4()
    return bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1, matrix=frame)["verts"]


def add_parts(me):
    """Adds the nose, eyes and pads. Returns each vertex's part number, and for each part its
    owning bone and mark. The body is part 0. Vertices are tagged rather than counted, since
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
        if hit is None or (hit - point).length > 0.03:
            print("DOG MISSED SURFACE", point)
            return point
        return hit

    centre, radii = NOSE
    add_part(add_shell(bm, centre, (Vector((0, 1, 0)), HEAD_TOP, HEAD_DIR), radii), "Muzzle2", (0, 1))

    for chain, _, points, *_ in CHAINS:
        if chain not in LEGS:
            continue
        paw, toes, across, sole = paw_frame(points)
        for (a, b), radii in PADS:
            point = paw + across * a + toes * b
            pad = add_shell(bm, on_surface(point, sole), (across, toes, sole), (*radii, PAD_THICKNESS))
            add_part(pad, f"{chain}{len(points) - 2}", (0, 1))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # Each eye is a thin strip laid on the skull, added last so it keeps facing outward.
    centre, length, bow, width = EYE
    for side in (1, -1):
        out = Vector((0, side, 0.25)).normalized()
        across = out.cross(HEAD_DIR).normalized()
        if across.dot(HEAD_TOP) < 0:
            across = -across
        eye = centre.copy()
        eye.y = centre.y * side
        strip = []
        for k in range(9):
            t = k / 4 - 1
            middle = eye + HEAD_DIR * (t * length / 2) - across * (bow * (1 - t * t))
            half = width / 2 * (1 - 0.75 * t * t)
            strip.append([bm.verts.new(on_surface(middle + across * s * half, out) + out * 0.0015) for s in (-1, 1)])
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


def build_mesh(name="Dog"):
    """The dog's mesh in dog space, with its part numbers (see add_parts)."""
    me = sculpt(name)
    part_of, parts = add_parts(me)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    return me, part_of, parts


# ----------------------------------------------------------------- rig
ROOT_BONE = "Root"


def chain_bones(chain):
    """Bone names of a chain: one per segment, numbered from its root."""
    points = next(c[2] for c in CHAINS if c[0] == chain)
    return [f"{chain}{k}" for k in range(len(points) - 1)]


def chain_of(bone):
    return bone.rstrip("0123456789")


def body_chain(chain):
    """A shape-only chain moves with the chain its parent bone belongs to."""
    while chain in SHAPE_ONLY:
        chain = chain_of(next(c[1] for c in CHAINS if c[0] == chain))
    return chain


def build_skeleton(collection, name="DogRig"):
    """One bone per chain segment, plus a Root at the feet that carries the whole dog. Every
    bone's Z axis points to the dog's left (+Y), so bending in the dog's side plane is always
    a turn about Z, in code and in Blender's pose mode alike."""
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    collection.objects.link(rig)
    bpy.context.view_layer.update()
    for other in bpy.context.selected_objects:
        other.select_set(False)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    with bpy.context.temp_override(active_object=rig, object=rig):
        bpy.ops.object.mode_set(mode="EDIT")
        root = arm.edit_bones.new(ROOT_BONE)
        root.head, root.tail = (0, 0, 0), (0.15, 0, 0)
        root.align_roll(Vector((0, 1, 0)))
        segments = []
        for chain, parent_bone, points, *_ in CHAINS:
            if chain in SHAPE_ONLY:
                continue
            previous = parent_bone or ROOT_BONE
            for k, (p0, p1) in enumerate(zip(points, points[1:])):
                bone = arm.edit_bones.new(f"{chain}{k}")
                bone.head, bone.tail = p0[:3], p1[:3]
                bone.align_roll(Vector((0, 1, 0)))
                bone.parent = arm.edit_bones[previous]
                bone.use_connect = False
                previous = bone.name
                segments.append((bone.name, np.array(p0[:3]), np.array(p1[:3]), (p0[3] + p1[3]) / 2))
        bpy.ops.object.mode_set(mode="OBJECT")
    return rig, segments


def chain_distances(co):
    """Each vertex's distance to the surface of every chain (negative inside), by chain name."""
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    out = {}
    for chain, _, points, _, flatten in CHAINS:
        d = np.full(len(co), np.inf)
        for p0, p1 in zip(points, points[1:]):
            d = np.minimum(d, capsule(x, y, z, np.array(p0[:3]), p0[3], np.array(p1[:3]), p1[3], flatten))
        out[chain] = d
    return out


def skin(dog, segments, part_of, parts):
    """Weights fall off with distance to each bone, scaled by how thick that part is. Each vertex
    belongs to the body part it sits in, and only that part, its parent, and its children on the
    same side may move it, so legs never pull on each other or across the body. The small added
    parts (nose, eyes, pads) belong only to their own bones. Returns each vertex's main bone."""
    me = dog.data
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    names = [s[0] for s in segments]
    index = {n: i for i, n in enumerate(names)}

    # Who owns each vertex: the nearest chain's surface, with shape-only chains folded into their body chain.
    dist = chain_distances(co)
    chains = list(dist)
    owner = np.array([body_chain(chains[i]) for i in np.argmin(np.stack([dist[c] for c in chains]), axis=0)])
    parent = {c[0]: (chain_of(c[1]) if c[1] else None) for c in CHAINS}
    side = {c[0]: np.sign(round(float(np.mean([p[1] for p in c[2]])), 3)) for c in CHAINS}

    def allowed(chain, y):
        bones = set(chain_bones(chain))
        if parent[chain]:
            bones |= set(chain_bones(body_chain(parent[chain])))
        for child, up in parent.items():
            if up == chain and child not in SHAPE_ONLY and (side[child] == 0 or side[child] == np.sign(y)):
                bones |= set(chain_bones(child))
        return [index[b] for b in bones]

    weight = np.zeros((len(co), len(segments)))
    for i, (_, a, b, r) in enumerate(segments):
        ab = b - a
        t = np.clip(((co - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
        d = np.linalg.norm(co - (a + t[:, None] * ab), axis=1) / r
        weight[:, i] = 1 / np.maximum(d, 0.05) ** 6
    mask = np.zeros_like(weight, dtype=bool)
    cache = {}
    for v in range(len(co)):
        if part_of[v]:
            mask[v, index[parts[part_of[v]][0]]] = True
            continue
        key = (owner[v], np.sign(round(co[v, 1], 3)))
        if key not in cache:
            cache[key] = allowed(owner[v], co[v, 1])
        mask[v, cache[key]] = True
    weight = np.where(mask, weight, 0)

    groups = [dog.vertex_groups.new(name=n) for n in names]
    keep = np.argsort(-weight, axis=1)[:, :4]
    for v in range(len(co)):
        chosen = weight[v, keep[v]]
        chosen = chosen / chosen.sum()
        for g, w in zip(keep[v], chosen):
            if w > 0.01:
                groups[g].add([v], float(w), "REPLACE")
    mod = dog.modifiers.new("Skeleton", "ARMATURE")
    mod.object = dog.parent
    return [names[k] for k in keep[:, 0]]


def build(collection, name="Dog"):
    """Builds the rigged dog into a collection: the armature (DogRig) with the mesh parented to
    it. Returns the rig, the mesh object, each vertex's part, the parts, and each vertex's main bone."""
    rig, segments = build_skeleton(collection, name + "Rig")
    me, part_of, parts = build_mesh(name)
    dog = bpy.data.objects.new(name, me)
    collection.objects.link(dog)
    dog.parent = rig
    main_bone = skin(dog, segments, part_of, parts)
    return rig, dog, part_of, parts, main_bone


# ----------------------------------------------------------------- poses
# A pose is {bone: [w, x, y, z]} pose-space quaternions, plus "Root" may carry "location".
# Poses are kept as text (poses.json beside this file), so they rebuild with the dog and can be
# fine-tuned live in Blender's pose mode, then read back with read_pose().
def reset_pose(rig):
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def bend(rig, bone, degrees, axis=(0, 1, 0)):
    """Adds a turn to a bone about a dog-space axis as it sits at rest: +Y (the default) bends
    in the side plane, nose or paw toward the ground or back; +Z swings sideways; +X rolls."""
    import math
    from mathutils import Quaternion
    pb = rig.pose.bones[bone]
    pb.rotation_mode = "QUATERNION"
    local = pb.bone.matrix_local.to_3x3().inverted() @ Vector(axis)
    pb.rotation_quaternion = Quaternion(local, math.radians(degrees)) @ pb.rotation_quaternion


def read_pose(rig):
    pose = {}
    for pb in rig.pose.bones:
        q = [round(c, 5) for c in pb.rotation_quaternion]
        if q != [1, 0, 0, 0]:
            pose[pb.name] = q
    root = rig.pose.bones[ROOT_BONE]
    if root.location.length > 1e-6:
        pose["location"] = [round(c, 5) for c in root.location]
    return pose


def apply_pose(rig, pose):
    reset_pose(rig)
    for name, value in pose.items():
        if name == "location":
            rig.pose.bones[ROOT_BONE].location = value
        elif name in rig.pose.bones:
            rig.pose.bones[name].rotation_quaternion = value
